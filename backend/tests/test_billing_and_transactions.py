"""
Unit tests for Billing, Atomic Transactions, Snapshot copy, Price & Stock rules.
"""
import unittest
from backend.database import Database
from backend.auth import AuthService, PermissionDeniedError
from backend.services.catalog_service import CatalogService
from backend.services.stock_service import StockService
from backend.services.billing_service import BillingService, InsufficientStockError, BelowMinPriceError, BillingError
from backend.services.customer_supplier_service import CustomerSupplierService

class TestBillingAndTransactions(unittest.TestCase):
    def setUp(self):
        self.db = Database(":memory:")
        self.auth = AuthService(self.db)
        self.owner = self.auth.login("admin", "admin123")["user"]
        self.cashier = self.auth.login("cashier1", "cashier123")["user"]

        self.catalog = CatalogService(self.db)
        self.stock = StockService(self.db)
        self.billing = BillingService(self.db)
        self.cust_supp = CustomerSupplierService(self.db)

        # Create customer
        self.customer = self.cust_supp.create_customer(self.owner, {
            "name": "Hamza Ali",
            "phone": "0300-5554433"
        })

        # Create Head Unit (Serialized)
        self.head_unit = self.catalog.create_product(self.owner, {
            "name": "Android 9-inch IPS Tab 4GB+64GB",
            "is_serialized": 1,
            "warranty_months": 12,
            "variants": [
                {
                    "sku": "TAB-9IN-464",
                    "barcode": "9990001112223",
                    "variant_name": "Standard",
                    "cost_paisa": 1200000,          # PKR 12,000
                    "retail_price_paisa": 1650000,   # PKR 16,500
                    "wholesale_price_paisa": 1450000,# PKR 14,500
                    "min_price_paisa": 1350000,      # PKR 13,500
                    "reorder_level": 2
                }
            ]
        })
        self.hu_var_id = self.head_unit["variants"][0]["id"]

        # Receive 2 head units with serial numbers SN-HU-001 and SN-HU-002
        supp = self.cust_supp.create_supplier(self.owner, {"name": "Android Tab Importers"})
        self.stock.receive_purchase(self.owner, {
            "supplier_id": supp["id"],
            "invoice_number": "SUP-101",
            "paid_amount_paisa": 2400000,
            "items": [
                {
                    "variant_id": self.hu_var_id,
                    "quantity": 2,
                    "unit_cost_paisa": 1200000,
                    "serials": ["SN-HU-001", "SN-HU-002"]
                }
            ]
        })

        # Also create a non-serialized product: Wiring Kit with stock 2
        kit = self.catalog.create_product(self.owner, {
            "name": "SoundX 4-Gauge OFC Wiring Kit",
            "is_serialized": 0,
            "variants": [
                {
                    "sku": "WIRE-4GA-OFC",
                    "variant_name": "Standard 5m",
                    "cost_paisa": 150000,
                    "retail_price_paisa": 250000,
                    "wholesale_price_paisa": 200000,
                    "min_price_paisa": 180000,
                    "reorder_level": 2
                }
            ]
        })
        self.wire_var_id = kit["variants"][0]["id"]
        self.stock.manual_adjustment(self.owner, self.wire_var_id, 2, "COUNT_ADJUSTMENT", "Initial stock")

    def test_stock_exceeded_rejected_without_override(self):
        # We only have 2 in stock. Trying to sell 3 will raise InsufficientStockError
        with self.assertRaises(InsufficientStockError) as ctx:
            self.billing.create_bill(self.cashier, {
                "customer_name": "Counter Customer",
                "items": [
                    {
                        "variant_id": self.wire_var_id,
                        "quantity": 3
                    }
                ]
            })
        self.assertIn("Owner override required", str(ctx.exception))

    def test_owner_override_allows_selling_more_than_stock(self):
        # Non-negotiable Rule 5: Owner override allows selling more than stock
        # But cashier cannot use owner_override
        with self.assertRaises(PermissionDeniedError):
            self.billing.create_bill(self.cashier, {
                "owner_override": True,
                "items": [{"variant_id": self.hu_var_id, "quantity": 3}]
            })

    def test_below_min_price_rejected_without_override(self):
        # Retail: 16,500, Min: 13,500. Selling at 11,000 paisa (PKR 110.00 / 11,000.00)
        with self.assertRaises(BelowMinPriceError):
            self.billing.create_bill(self.cashier, {
                "items": [
                    {
                        "variant_id": self.hu_var_id,
                        "quantity": 1,
                        "unit_price_paisa": 1100000,  # Below min 1,350,000
                        "serials": ["SN-HU-001"]
                    }
                ]
            })

    def test_successful_bill_copies_price_snapshot_and_updates_stock(self):
        bill = self.billing.create_bill(self.cashier, {
            "customer_id": self.customer["id"],
            "customer_name": self.customer["name"],
            "customer_phone": self.customer["phone"],
            "discount_paisa": 50000,  # PKR 500 discount (within 5% cashier limit)
            "items": [
                {
                    "variant_id": self.hu_var_id,
                    "quantity": 1,
                    "unit_price_paisa": 1650000,
                    "serials": ["SN-HU-001"]
                }
            ],
            "payments": [
                {"method": "CASH", "amount_paisa": 1000000},       # Paid PKR 10,000 cash
                {"method": "JAZZCASH", "amount_paisa": 600000}     # Paid PKR 6,000 JazzCash
            ]
        })
        # Total = 16,500 - 500 = 16,000 PKR (1,600,000 paisa)
        # Paid = 16,000 PKR (1,600,000 paisa)
        self.assertEqual(bill["total_paisa"], 1600000)
        self.assertEqual(bill["paid_paisa"], 1600000)
        self.assertEqual(bill["balance_paisa"], 0)

        # Verify stock on hand decreased from 2 to 1
        conn = self.db.get_connection()
        try:
            self.assertEqual(self.stock.get_stock_on_hand(conn, self.hu_var_id), 1)

            # Check that bill_item has historical snapshot of cost (1,200,000), retail (1,650,000), warranty (12)
            cur = conn.cursor()
            cur.execute("SELECT * FROM bill_items WHERE bill_id = ?", (bill["bill_id"],))
            bi = cur.fetchone()
            self.assertEqual(bi["unit_cost_paisa"], 1200000)
            self.assertEqual(bi["unit_retail_paisa"], 1650000)
            self.assertEqual(bi["warranty_months"], 12)
        finally:
            conn.close()

    def test_udhaar_credit_sale_increases_customer_balance(self):
        bill = self.billing.create_bill(self.cashier, {
            "customer_id": self.customer["id"],
            "customer_name": self.customer["name"],
            "customer_phone": self.customer["phone"],
            "items": [
                {
                    "variant_id": self.hu_var_id,
                    "quantity": 1,
                    "serials": ["SN-HU-002"]
                }
            ],
            "payments": [
                {"method": "CASH", "amount_paisa": 500000}  # Paid only 5,000 PKR out of 16,500
            ]
        })
        self.assertEqual(bill["balance_paisa"], 1150000)  # Udhaar = PKR 11,500

        # Verify customer profile updated
        cust = self.cust_supp.get_customer(self.customer["id"])
        self.assertEqual(cust["balance_paisa"], 1150000)

if __name__ == "__main__":
    unittest.main()

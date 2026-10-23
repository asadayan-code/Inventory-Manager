"""
Unit tests for Serial Tracking & Warranty Claims.
"""
import unittest
from backend.database import Database
from backend.auth import AuthService
from backend.services.catalog_service import CatalogService
from backend.services.stock_service import StockService
from backend.services.billing_service import BillingService
from backend.services.serial_service import SerialService, SerialError
from backend.services.customer_supplier_service import CustomerSupplierService

class TestSerialsAndWarranty(unittest.TestCase):
    def setUp(self):
        self.db = Database(":memory:")
        self.auth = AuthService(self.db)
        self.owner = self.auth.login("admin", "admin123")["user"]
        self.cashier = self.auth.login("cashier1", "cashier123")["user"]

        self.catalog = CatalogService(self.db)
        self.stock = StockService(self.db)
        self.billing = BillingService(self.db)
        self.serial_service = SerialService(self.db)
        self.cust_supp = CustomerSupplierService(self.db)

        # Supplier & Customer
        self.supplier = self.cust_supp.create_supplier(self.owner, {"name": "Audio Pioneer Pakistan"})
        self.customer = self.cust_supp.create_customer(self.owner, {
            "name": "Bilal Ahmed",
            "phone": "0312-7778899"
        })

        # Amplifier (Serialized, 12 months warranty)
        self.amp = self.catalog.create_product(self.owner, {
            "name": "Pioneer 4-Channel 1000W Bridgeable Amplifier",
            "is_serialized": 1,
            "warranty_months": 12,
            "variants": [
                {
                    "sku": "AMP-PIO-1000W",
                    "variant_name": "Standard",
                    "cost_paisa": 1800000,
                    "retail_price_paisa": 2400000,
                    "wholesale_price_paisa": 2100000,
                    "min_price_paisa": 1950000,
                    "reorder_level": 1
                }
            ]
        })
        self.amp_var_id = self.amp["variants"][0]["id"]

        # Receive 1 amplifier with serial SN-AMP-9901
        self.stock.receive_purchase(self.owner, {
            "supplier_id": self.supplier["id"],
            "invoice_number": "PIO-INV-505",
            "paid_amount_paisa": 1800000,
            "items": [
                {
                    "variant_id": self.amp_var_id,
                    "quantity": 1,
                    "unit_cost_paisa": 1800000,
                    "serials": ["SN-AMP-9901"]
                }
            ]
        })

    def test_serial_lookup_in_stock(self):
        info = self.serial_service.lookup_serial("SN-AMP-9901")
        self.assertEqual(info["status"], "IN_STOCK")
        self.assertEqual(info["supplier_name"], "Audio Pioneer Pakistan")
        self.assertFalse(info["is_under_warranty"])  # Not sold yet

    def test_serial_lookup_after_sale(self):
        # Sell the amplifier to Bilal
        bill = self.billing.create_bill(self.cashier, {
            "customer_id": self.customer["id"],
            "customer_name": self.customer["name"],
            "customer_phone": self.customer["phone"],
            "items": [
                {
                    "variant_id": self.amp_var_id,
                    "quantity": 1,
                    "serials": ["SN-AMP-9901"]
                }
            ],
            "payments": [{"method": "CASH", "amount_paisa": 2400000}]
        })

        info = self.serial_service.lookup_serial("SN-AMP-9901")
        self.assertEqual(info["status"], "SOLD")
        self.assertEqual(info["customer_name"], "Bilal Ahmed")
        self.assertEqual(info["bill_number"], bill["bill_number"])
        self.assertTrue(info["is_under_warranty"])
        self.assertEqual(info["warranty_months"], 12)

    def test_warranty_claim_workflow(self):
        # Sell unit
        self.billing.create_bill(self.cashier, {
            "customer_id": self.customer["id"],
            "items": [{"variant_id": self.amp_var_id, "quantity": 1, "serials": ["SN-AMP-9901"]}],
            "payments": [{"method": "CASH", "amount_paisa": 2400000}]
        })

        # File claim: channel 3 distortion
        claim = self.serial_service.create_warranty_claim(self.cashier, {
            "serial_number": "SN-AMP-9901",
            "issue_description": "Channel 3 audio cut out and overheating",
            "notes": "Customer brought in vehicle"
        })
        self.assertEqual(claim["status"], "RECEIVED")

        # Verify serial status is now DEFECTIVE
        info = self.serial_service.lookup_serial("SN-AMP-9901")
        self.assertEqual(info["status"], "DEFECTIVE")

        # Owner sends to supplier
        res = self.serial_service.update_claim_status(self.owner, claim["claim_id"], "SENT_TO_SUPPLIER", "Sent via courier #9872")
        self.assertEqual(res["status"], "SENT_TO_SUPPLIER")

        info2 = self.serial_service.lookup_serial("SN-AMP-9901")
        self.assertEqual(info2["status"], "RETURNED_TO_SUPPLIER")

if __name__ == "__main__":
    unittest.main()

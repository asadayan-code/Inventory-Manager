"""
Unit tests for Stock Ledger, atomic movements, purchase receiving, and adjustments.
"""
import unittest
from backend.database import Database
from backend.auth import AuthService
from backend.services.catalog_service import CatalogService
from backend.services.stock_service import StockService, StockError
from backend.services.customer_supplier_service import CustomerSupplierService

class TestStockAndLedger(unittest.TestCase):
    def setUp(self):
        self.db = Database(":memory:")
        self.auth = AuthService(self.db)
        self.owner = self.auth.login("admin", "admin123")["user"]
        self.catalog = CatalogService(self.db)
        self.stock = StockService(self.db)
        self.cust_supp = CustomerSupplierService(self.db)

        # Create supplier
        self.supplier = self.cust_supp.create_supplier(self.owner, {
            "name": "Sony Car Audio Pakistan",
            "phone": "0321-9998877"
        })

        # Create category and product
        cat = self.catalog.create_category(self.owner, "Speakers")
        prod = self.catalog.create_product(self.owner, {
            "name": "Pioneer 6x9 600W Coaxial Speakers",
            "category_id": cat["id"],
            "variants": [
                {
                    "sku": "PIO-69-600W",
                    "barcode": "8961234567890",
                    "variant_name": "Standard Pair",
                    "cost_paisa": 450000,          # PKR 4,500
                    "retail_price_paisa": 650000,   # PKR 6,500
                    "wholesale_price_paisa": 550000, # PKR 5,500
                    "min_price_paisa": 500000,      # PKR 5,000
                    "reorder_level": 5
                }
            ]
        })
        self.variant_id = prod["variants"][0]["id"]

    def test_stock_initially_zero(self):
        conn = self.db.get_connection()
        try:
            self.assertEqual(self.stock.get_stock_on_hand(conn, self.variant_id), 0)
        finally:
            conn.close()

    def test_receive_purchase_increments_stock_and_supplier_balance(self):
        res = self.stock.receive_purchase(self.owner, {
            "supplier_id": self.supplier["id"],
            "invoice_number": "INV-SONY-101",
            "paid_amount_paisa": 2000000,  # Paid PKR 20,000 upfront
            "payment_method": "BANK_TRANSFER",
            "items": [
                {
                    "variant_id": self.variant_id,
                    "quantity": 10,
                    "unit_cost_paisa": 450000  # Total 45,000
                }
            ]
        })
        self.assertEqual(res["total_amount_paisa"], 4500000)
        self.assertEqual(res["paid_amount_paisa"], 2000000)
        self.assertEqual(res["unpaid_amount_paisa"], 2500000)

        # Verify stock on hand is now 10
        conn = self.db.get_connection()
        try:
            self.assertEqual(self.stock.get_stock_on_hand(conn, self.variant_id), 10)
        finally:
            conn.close()

        # Verify supplier balance is 25,000 (PKR 25,000 owed)
        supp = self.cust_supp.get_supplier(self.supplier["id"])
        self.assertEqual(supp["balance_paisa"], 2500000)

    def test_manual_adjustment_requires_mandatory_note(self):
        # Without note raises error
        with self.assertRaises(StockError):
            self.stock.manual_adjustment(self.owner, self.variant_id, 2, "DAMAGE", "")

        # Valid adjustment
        adj = self.stock.manual_adjustment(self.owner, self.variant_id, 3, "COUNT_ADJUSTMENT", "Found in warehouse shelf B")
        self.assertEqual(adj["new_stock"], 3)

    def test_negative_adjustment_cannot_drop_below_zero(self):
        with self.assertRaises(StockError):
            self.stock.manual_adjustment(self.owner, self.variant_id, -5, "THEFT", "Stolen from display")

if __name__ == "__main__":
    unittest.main()

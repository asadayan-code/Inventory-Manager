"""
Unit tests for Returns & Refunds rules.
Rule: Return first cancels unpaid balance, then refunds the rest.
Rule: RESTOCK vs SCRAP.
Rule: Only OWNER can process returns.
"""
import unittest
from backend.database import Database
from backend.auth import AuthService, PermissionDeniedError
from backend.services.catalog_service import CatalogService
from backend.services.stock_service import StockService
from backend.services.billing_service import BillingService
from backend.services.customer_supplier_service import CustomerSupplierService

class TestReturnsAndUdhaar(unittest.TestCase):
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
            "name": "Zeeshan Khan",
            "phone": "0333-1122334"
        })

        # Create Fog Lamp product
        self.product = self.catalog.create_product(self.owner, {
            "name": "Super Bright LED Fog Lamp H11 6000K",
            "variants": [
                {
                    "sku": "FOG-H11-LED",
                    "variant_name": "Pair",
                    "cost_paisa": 150000,          # PKR 1,500
                    "retail_price_paisa": 250000,   # PKR 2,500
                    "wholesale_price_paisa": 200000,
                    "min_price_paisa": 180000,
                    "reorder_level": 5
                }
            ]
        })
        self.var_id = self.product["variants"][0]["id"]

        # Stock 10 units via manual adjustment or purchase
        self.stock.manual_adjustment(self.owner, self.var_id, 10, "COUNT_ADJUSTMENT", "Opening balance")

    def test_cashier_cannot_process_returns(self):
        # Create a bill first
        bill = self.billing.create_bill(self.cashier, {
            "customer_id": self.customer["id"],
            "items": [{"variant_id": self.var_id, "quantity": 1}],
            "payments": [{"method": "CASH", "amount_paisa": 250000}]
        })
        bill_detail = self.billing.get_bill_detail(bill["bill_id"], self.owner)
        bi_id = bill_detail["items"][0]["id"]

        with self.assertRaises(PermissionDeniedError):
            self.billing.process_return(self.cashier, {
                "original_bill_id": bill["bill_id"],
                "reason": "Customer changed mind",
                "items": [{"bill_item_id": bi_id, "quantity": 1, "restock_action": "RESTOCK"}]
            })

    def test_return_cancels_unpaid_balance_first_then_refunds_rest(self):
        # Sell 2 units for total PKR 5,000 (500,000 paisa)
        # Customer pays PKR 2,000 (200,000 paisa), so unpaid balance (udhaar) is PKR 3,000 (300,000 paisa)
        bill = self.billing.create_bill(self.cashier, {
            "customer_id": self.customer["id"],
            "items": [{"variant_id": self.var_id, "quantity": 2}],
            "payments": [{"method": "CASH", "amount_paisa": 200000}]
        })
        self.assertEqual(bill["balance_paisa"], 300000)

        bill_detail = self.billing.get_bill_detail(bill["bill_id"], self.owner)
        bi_id = bill_detail["items"][0]["id"]

        # Customer returns 1 unit worth PKR 2,500 (250,000 paisa).
        # Since bill balance is PKR 3,000, the return cancels PKR 2,500 from the debt!
        # Cash refunded to customer must be 0!
        ret = self.billing.process_return(self.owner, {
            "original_bill_id": bill["bill_id"],
            "reason": "Customer only needed 1 pair",
            "items": [{"bill_item_id": bi_id, "quantity": 1, "restock_action": "RESTOCK"}]
        })
        self.assertEqual(ret["total_refund_paisa"], 250000)
        self.assertEqual(ret["balance_credited_paisa"], 250000)
        self.assertEqual(ret["cash_refunded_paisa"], 0)

        # Verify bill remaining balance is now 50,000 paisa (PKR 500)
        updated_bill = self.billing.get_bill_detail(bill["bill_id"], self.owner)
        self.assertEqual(updated_bill["balance_paisa"], 50000)

        # Verify customer running balance is also reduced to PKR 500
        cust = self.cust_supp.get_customer(self.customer["id"])
        self.assertEqual(cust["balance_paisa"], 50000)

    def test_scrap_return_does_not_restock(self):
        # Stock was 10. Sell 1 -> stock becomes 9
        bill = self.billing.create_bill(self.cashier, {
            "customer_id": self.customer["id"],
            "items": [{"variant_id": self.var_id, "quantity": 1}],
            "payments": [{"method": "CASH", "amount_paisa": 250000}]
        })
        conn = self.db.get_connection()
        try:
            self.assertEqual(self.stock.get_stock_on_hand(conn, self.var_id), 9)
        finally:
            conn.close()

        bill_detail = self.billing.get_bill_detail(bill["bill_id"], self.owner)
        bi_id = bill_detail["items"][0]["id"]

        # Return with SCRAP (defective LED light)
        self.billing.process_return(self.owner, {
            "original_bill_id": bill["bill_id"],
            "reason": "One LED diode burned out",
            "items": [{"bill_item_id": bi_id, "quantity": 1, "restock_action": "SCRAP"}]
        })

        # Stock should still be 9 (NOT restocked!)
        conn = self.db.get_connection()
        try:
            self.assertEqual(self.stock.get_stock_on_hand(conn, self.var_id), 9)
        finally:
            conn.close()

if __name__ == "__main__":
    unittest.main()

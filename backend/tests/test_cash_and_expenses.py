"""
Unit tests for Cash Register opening/closing, Expenses, and Profit calculation.
"""
import unittest
from backend.database import Database
from backend.auth import AuthService
from backend.services.cash_expense_service import CashExpenseService
from backend.services.report_service import ReportService

class TestCashAndExpenses(unittest.TestCase):
    def setUp(self):
        self.db = Database(":memory:")
        self.auth = AuthService(self.db)
        self.owner = self.auth.login("admin", "admin123")["user"]
        self.cashier = self.auth.login("cashier1", "cashier123")["user"]
        self.cash_svc = CashExpenseService(self.db)
        self.report_svc = ReportService(self.db)

    def test_cash_register_lifecycle(self):
        # Open register with PKR 15,000 opening float (1,500,000 paisa)
        reg = self.cash_svc.open_register(self.cashier, 1500000, "Morning drawer setup")
        self.assertEqual(reg["status"], "OPEN")

        # Record cash expenses: Tea & snacks PKR 350, Transport PKR 500
        self.cash_svc.record_expense(self.cashier, {
            "category": "TEA_SNACKS",
            "amount_paisa": 35000,
            "recipient": "Shop Boy Tea",
            "payment_method": "CASH"
        })
        self.cash_svc.record_expense(self.owner, {
            "category": "TRANSPORT",
            "amount_paisa": 50000,
            "recipient": "Rickshaw fare for goods delivery",
            "payment_method": "CASH"
        })

        # Expected cash = 15,000 - 350 - 500 = PKR 14,150 (1,415,000 paisa)
        calc = self.cash_svc.calculate_expected_cash(reg["id"])
        self.assertEqual(calc["expected_cash_paisa"], 1415000)

        # Cashier counts 14,100 (50 PKR short)
        close_res = self.cash_svc.close_register(self.cashier, reg["id"], 1410000, "Rs 50 loose coin short")
        self.assertEqual(close_res["status"], "CLOSED")
        self.assertEqual(close_res["difference_paisa"], -5000)  # -50 PKR (-5000 paisa)

if __name__ == "__main__":
    unittest.main()

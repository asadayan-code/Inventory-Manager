"""
PakAudio Retail Management System - Expenses & Cash Register Service
- Expense tracking with categories
- Opening and closing cash register per day with expected vs counted cash and difference
- Real profit calculation: sales margin - returns - expenses
"""
from datetime import datetime
from typing import Dict, Any, List, Optional
import sqlite3
from backend.money import require_paisa, format_paisa_to_pkr
from backend.auth import log_audit, PermissionDeniedError

class CashExpenseError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code

class CashExpenseService:
    def __init__(self, db):
        self.db = db

    # ---------------- EXPENSES ----------------
    def record_expense(self, user: Dict[str, Any], data: Dict[str, Any]) -> Dict[str, Any]:
        """Records an expense voucher."""
        category = data.get("category", "OTHER")
        valid_cats = ('RENT', 'ELECTRICITY', 'SALARY', 'TEA_SNACKS', 'TRANSPORT', 'MAINTENANCE', 'OTHER')
        if category not in valid_cats:
            raise CashExpenseError(f"Category must be one of: {', '.join(valid_cats)}")

        amount_paisa = require_paisa(data.get("amount_paisa", 0))
        if amount_paisa <= 0:
            raise CashExpenseError("Expense amount must be greater than zero.")

        recipient = data.get("recipient", "").strip()
        if not recipient:
            raise CashExpenseError("Recipient name / payee is required.")

        payment_method = data.get("payment_method", "CASH")
        notes = data.get("notes", "").strip()
        expense_date = data.get("expense_date", datetime.now().strftime("%Y-%m-%d"))

        with self.db.transaction() as conn:
            cur = conn.cursor()
            cur.execute(
                """
                INSERT INTO expenses (category, amount_paisa, payment_method, recipient, user_id, notes, expense_date)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (category, amount_paisa, payment_method, recipient, user["id"], notes, expense_date)
            )
            expense_id = cur.lastrowid
            log_audit(conn, user["id"], user["username"], "RECORD_EXPENSE", "EXPENSE", str(expense_id), f"{category}: {format_paisa_to_pkr(amount_paisa)} to {recipient}")
            return {"id": expense_id, "amount_paisa": amount_paisa, "category": category}

    def list_expenses(self, start_date: Optional[str] = None, end_date: Optional[str] = None) -> List[Dict[str, Any]]:
        conn = self.db.get_connection()
        try:
            cur = conn.cursor()
            query = """
                SELECT e.*, u.username as recorded_by
                FROM expenses e
                JOIN users u ON e.user_id = u.id
            """
            params = []
            conditions = []
            if start_date:
                conditions.append("e.expense_date >= ?")
                params.append(start_date)
            if end_date:
                conditions.append("e.expense_date <= ?")
                params.append(end_date)
            if conditions:
                query += " WHERE " + " AND ".join(conditions)
            query += " ORDER BY e.expense_date DESC, e.id DESC"

            cur.execute(query, tuple(params))
            return [dict(r) for r in cur.fetchall()]
        finally:
            conn.close()

    # ---------------- CASH REGISTER ----------------
    def get_current_register(self) -> Optional[Dict[str, Any]]:
        conn = self.db.get_connection()
        try:
            cur = conn.cursor()
            cur.execute(
                """
                SELECT cr.*, u.username as opened_by_name
                FROM cash_registers cr
                JOIN users u ON cr.opened_by_user_id = u.id
                WHERE cr.status = 'OPEN'
                ORDER BY cr.id DESC LIMIT 1
                """
            )
            row = cur.fetchone()
            if not row:
                return None
            return dict(row)
        finally:
            conn.close()

    def open_register(self, user: Dict[str, Any], opening_cash_paisa: int, notes: str = "") -> Dict[str, Any]:
        """Opens daily register with opening float cash."""
        opening_cash_paisa = require_paisa(opening_cash_paisa)
        if opening_cash_paisa < 0:
            raise CashExpenseError("Opening cash cannot be negative.")

        with self.db.transaction() as conn:
            cur = conn.cursor()
            cur.execute("SELECT id FROM cash_registers WHERE status = 'OPEN'")
            if cur.fetchone():
                raise CashExpenseError("A cash register session is already open. Please close it first.")

            cur.execute(
                """
                INSERT INTO cash_registers (opened_by_user_id, opening_cash_paisa, notes, status)
                VALUES (?, ?, ?, 'OPEN')
                """,
                (user["id"], opening_cash_paisa, notes.strip())
            )
            reg_id = cur.lastrowid
            log_audit(conn, user["id"], user["username"], "OPEN_REGISTER", "CASH_REGISTER", str(reg_id), f"Opening cash: {format_paisa_to_pkr(opening_cash_paisa)}")
            return {"id": reg_id, "status": "OPEN", "opening_cash_paisa": opening_cash_paisa}

    def calculate_expected_cash(self, register_id: int) -> Dict[str, Any]:
        """Calculates expected cash in drawer based on opening cash + cash sales + cash udhaar collections - cash returns - cash expenses."""
        conn = self.db.get_connection()
        try:
            cur = conn.cursor()
            cur.execute("SELECT * FROM cash_registers WHERE id = ?", (register_id,))
            reg = cur.fetchone()
            if not reg:
                raise CashExpenseError("Cash register not found.", status_code=404)

            open_time = reg["opening_time"]
            close_time = reg["closing_time"] or datetime.now().strftime("%Y-%m-%d %H:%M:%S")

            # 1. Cash sales & advance payments collected
            cur.execute(
                """
                SELECT COALESCE(SUM(amount_paisa), 0)
                FROM payments
                WHERE payment_method = 'CASH'
                AND reference_type IN ('BILL', 'CUSTOMER_UDHAAR')
                AND created_at BETWEEN ? AND ?
                """,
                (open_time, close_time)
            )
            cash_in_sales = cur.fetchone()[0]

            # 2. Cash refunds given on returns
            cur.execute(
                """
                SELECT COALESCE(SUM(cash_refunded_paisa), 0)
                FROM returns
                WHERE refund_method = 'CASH'
                AND created_at BETWEEN ? AND ?
                """,
                (open_time, close_time)
            )
            cash_out_refunds = cur.fetchone()[0]

            # 3. Cash expenses paid out
            cur.execute(
                """
                SELECT COALESCE(SUM(amount_paisa), 0)
                FROM expenses
                WHERE payment_method = 'CASH'
                AND created_at BETWEEN ? AND ?
                """,
                (open_time, close_time)
            )
            cash_out_expenses = cur.fetchone()[0]

            # 4. Supplier payments paid in cash
            cur.execute(
                """
                SELECT COALESCE(SUM(amount_paisa), 0)
                FROM payments
                WHERE payment_method = 'CASH'
                AND reference_type IN ('SUPPLIER_PAYABLE', 'PURCHASE')
                AND created_at BETWEEN ? AND ?
                """,
                (open_time, close_time)
            )
            cash_out_suppliers = cur.fetchone()[0]

            expected_cash_paisa = (
                reg["opening_cash_paisa"]
                + cash_in_sales
                - cash_out_refunds
                - cash_out_expenses
                - cash_out_suppliers
            )

            return {
                "opening_cash_paisa": reg["opening_cash_paisa"],
                "cash_in_sales_paisa": cash_in_sales,
                "cash_out_refunds_paisa": cash_out_refunds,
                "cash_out_expenses_paisa": cash_out_expenses,
                "cash_out_suppliers_paisa": cash_out_suppliers,
                "expected_cash_paisa": expected_cash_paisa
            }
        finally:
            conn.close()

    def close_register(self, user: Dict[str, Any], register_id: int, counted_cash_paisa: int, notes: str = "") -> Dict[str, Any]:
        """Closes daily cash register with counted cash and records variance."""
        counted_cash_paisa = require_paisa(counted_cash_paisa)
        calc = self.calculate_expected_cash(register_id)
        expected = calc["expected_cash_paisa"]
        diff = counted_cash_paisa - expected

        with self.db.transaction() as conn:
            cur = conn.cursor()
            cur.execute("SELECT status FROM cash_registers WHERE id = ?", (register_id,))
            reg = cur.fetchone()
            if not reg:
                raise CashExpenseError("Cash register not found.", status_code=404)
            if reg["status"] == "CLOSED":
                raise CashExpenseError("This cash register is already closed.")

            close_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            cur.execute(
                """
                UPDATE cash_registers SET
                    closing_time = ?, closed_by_user_id = ?,
                    expected_cash_paisa = ?, counted_cash_paisa = ?,
                    difference_paisa = ?, notes = notes || ' | ' || ?,
                    status = 'CLOSED'
                WHERE id = ?
                """,
                (close_time, user["id"], expected, counted_cash_paisa, diff, notes.strip(), register_id)
            )

            log_audit(
                conn, user["id"], user["username"], "CLOSE_REGISTER", "CASH_REGISTER",
                str(register_id), f"Counted: {format_paisa_to_pkr(counted_cash_paisa)}, Expected: {format_paisa_to_pkr(expected)}, Diff: {format_paisa_to_pkr(diff)}"
            )

            return {
                "register_id": register_id,
                "status": "CLOSED",
                "expected_cash_paisa": expected,
                "counted_cash_paisa": counted_cash_paisa,
                "difference_paisa": diff
            }

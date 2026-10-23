"""
PakAudio Retail Management System - Customer & Supplier Service
Manages customer profiles, wholesale tagging, Udhaar balance tracking,
supplier payables, and payment receipts.
"""
from typing import Dict, Any, List, Optional
import sqlite3
from backend.money import require_paisa, format_paisa_to_pkr
from backend.auth import log_audit, PermissionDeniedError

class EntityError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code

class CustomerSupplierService:
    def __init__(self, db):
        self.db = db

    # ---------------- CUSTOMERS ----------------
    def list_customers(self, query: str = "") -> List[Dict[str, Any]]:
        conn = self.db.get_connection()
        try:
            cur = conn.cursor()
            q = f"%{query.strip().lower()}%" if query else "%"
            cur.execute(
                """
                SELECT id, name, phone, email, address, car_registration, car_model,
                       customer_type, balance_paisa, notes, created_at, updated_at
                FROM customers
                WHERE LOWER(name) LIKE ? OR phone LIKE ? OR LOWER(car_registration) LIKE ?
                ORDER BY name ASC
                """,
                (q, q, q)
            )
            return [dict(r) for r in cur.fetchall()]
        finally:
            conn.close()

    def get_customer(self, customer_id: int) -> Dict[str, Any]:
        conn = self.db.get_connection()
        try:
            cur = conn.cursor()
            cur.execute("SELECT * FROM customers WHERE id = ?", (customer_id,))
            c = cur.fetchone()
            if not c:
                raise EntityError("Customer not found.", status_code=404)
            c_dict = dict(c)

            # Purchase history
            cur.execute(
                """
                SELECT id, bill_number, total_paisa, paid_paisa, balance_paisa, status, created_at
                FROM bills WHERE customer_id = ? AND is_quote = 0
                ORDER BY created_at DESC
                """,
                (customer_id,)
            )
            c_dict["bills"] = [dict(b) for b in cur.fetchall()]

            # Payment history
            cur.execute(
                """
                SELECT p.*, u.username as user_name
                FROM payments p
                JOIN users u ON p.user_id = u.id
                WHERE p.customer_id = ?
                ORDER BY p.created_at DESC
                """,
                (customer_id,)
            )
            c_dict["payments"] = [dict(p) for p in cur.fetchall()]

            return c_dict
        finally:
            conn.close()

    def create_customer(self, user: Dict[str, Any], data: Dict[str, Any]) -> Dict[str, Any]:
        name = data.get("name", "").strip()
        phone = data.get("phone", "").strip()
        if not name:
            raise EntityError("Customer name is required.")
        if not phone:
            raise EntityError("Customer phone number is required.")

        customer_type = data.get("customer_type", "RETAIL")
        if customer_type not in ("RETAIL", "WHOLESALE"):
            raise EntityError("Customer type must be RETAIL or WHOLESALE.")

        # Wholesale requires owner permission
        if customer_type == "WHOLESALE" and user.get("role") != "OWNER":
            raise PermissionDeniedError("create wholesale customers")

        with self.db.transaction() as conn:
            cur = conn.cursor()
            cur.execute(
                """
                INSERT INTO customers (
                    name, phone, email, address, car_registration, car_model, customer_type, notes
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (name, phone, data.get("email", "").strip(), data.get("address", "").strip(),
                 data.get("car_registration", "").strip(), data.get("car_model", "").strip(),
                 customer_type, data.get("notes", "").strip())
            )
            new_id = cur.lastrowid
            log_audit(conn, user["id"], user["username"], "CREATE_CUSTOMER", "CUSTOMER", str(new_id), f"{name} ({phone})")
            return {"id": new_id, "name": name, "phone": phone, "customer_type": customer_type, "balance_paisa": 0}

    def receive_customer_udhaar_payment(self, user: Dict[str, Any], customer_id: int,
                                        amount_paisa: int, payment_method: str = "CASH",
                                        bill_id: Optional[int] = None, notes: str = "") -> Dict[str, Any]:
        """Receives a credit/udhaar payment from a customer, reducing their balance and optionally settling a bill."""
        amount_paisa = require_paisa(amount_paisa)
        if amount_paisa <= 0:
            raise EntityError("Payment amount must be greater than zero.")

        with self.db.transaction() as conn:
            cur = conn.cursor()
            cur.execute("SELECT id, name, balance_paisa FROM customers WHERE id = ?", (customer_id,))
            customer = cur.fetchone()
            if not customer:
                raise EntityError("Customer not found.", status_code=404)

            # Record payment
            cur.execute(
                """
                INSERT INTO payments (
                    reference_type, reference_id, customer_id, amount_paisa, payment_method, user_id, notes
                ) VALUES ('CUSTOMER_UDHAAR', ?, ?, ?, ?, ?, ?)
                """,
                (bill_id, customer_id, amount_paisa, payment_method, user["id"], notes.strip())
            )
            payment_id = cur.lastrowid

            # Deduct from customer running balance
            cur.execute(
                "UPDATE customers SET balance_paisa = balance_paisa - ?, updated_at = datetime('now', 'localtime') WHERE id = ?",
                (amount_paisa, customer_id)
            )

            # If specific bill provided, reduce its balance as well
            if bill_id:
                cur.execute(
                    "UPDATE bills SET balance_paisa = max(0, balance_paisa - ?), paid_paisa = paid_paisa + ? WHERE id = ?",
                    (amount_paisa, amount_paisa, bill_id)
                )

            log_audit(
                conn, user["id"], user["username"], "RECEIVE_UDHAAR_PAYMENT", "CUSTOMER",
                str(customer_id), f"Received {format_paisa_to_pkr(amount_paisa)} via {payment_method} from {customer['name']}"
            )

            return {
                "payment_id": payment_id,
                "customer_id": customer_id,
                "amount_paisa": amount_paisa,
                "remaining_balance_paisa": customer["balance_paisa"] - amount_paisa
            }

    # ---------------- SUPPLIERS ----------------
    def list_suppliers(self) -> List[Dict[str, Any]]:
        conn = self.db.get_connection()
        try:
            cur = conn.cursor()
            cur.execute("SELECT * FROM suppliers ORDER BY name ASC")
            return [dict(r) for r in cur.fetchall()]
        finally:
            conn.close()

    def get_supplier(self, supplier_id: int) -> Dict[str, Any]:
        conn = self.db.get_connection()
        try:
            cur = conn.cursor()
            cur.execute("SELECT * FROM suppliers WHERE id = ?", (supplier_id,))
            s = cur.fetchone()
            if not s:
                raise EntityError("Supplier not found.", status_code=404)
            s_dict = dict(s)

            cur.execute(
                """
                SELECT id, po_number, invoice_number, invoice_date, total_amount_paisa, paid_amount_paisa, status, created_at
                FROM purchases WHERE supplier_id = ?
                ORDER BY created_at DESC
                """,
                (supplier_id,)
            )
            s_dict["purchases"] = [dict(p) for p in cur.fetchall()]

            cur.execute(
                """
                SELECT p.*, u.username as user_name
                FROM payments p
                JOIN users u ON p.user_id = u.id
                WHERE p.supplier_id = ?
                ORDER BY p.created_at DESC
                """,
                (supplier_id,)
            )
            s_dict["payments"] = [dict(p) for p in cur.fetchall()]

            return s_dict
        finally:
            conn.close()

    def create_supplier(self, user: Dict[str, Any], data: Dict[str, Any]) -> Dict[str, Any]:
        if user.get("role") != "OWNER":
            raise PermissionDeniedError("create suppliers")

        name = data.get("name", "").strip()
        if not name:
            raise EntityError("Supplier name is required.")

        with self.db.transaction() as conn:
            cur = conn.cursor()
            try:
                cur.execute(
                    """
                    INSERT INTO suppliers (name, contact_person, phone, address, notes)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (name, data.get("contact_person", "").strip(), data.get("phone", "").strip(),
                     data.get("address", "").strip(), data.get("notes", "").strip())
                )
                new_id = cur.lastrowid
                log_audit(conn, user["id"], user["username"], "CREATE_SUPPLIER", "SUPPLIER", str(new_id), f"{name}")
                return {"id": new_id, "name": name, "balance_paisa": 0}
            except sqlite3.IntegrityError:
                raise EntityError(f"Supplier '{name}' already exists.")

    def pay_supplier(self, user: Dict[str, Any], supplier_id: int, amount_paisa: int,
                     payment_method: str = "CASH", notes: str = "") -> Dict[str, Any]:
        """Records payment made to a supplier, reducing payable balance."""
        if user.get("role") != "OWNER":
            raise PermissionDeniedError("record supplier payments")

        amount_paisa = require_paisa(amount_paisa)
        if amount_paisa <= 0:
            raise EntityError("Payment amount must be greater than zero.")

        with self.db.transaction() as conn:
            cur = conn.cursor()
            cur.execute("SELECT id, name, balance_paisa FROM suppliers WHERE id = ?", (supplier_id,))
            s = cur.fetchone()
            if not s:
                raise EntityError("Supplier not found.", status_code=404)

            cur.execute(
                """
                INSERT INTO payments (
                    reference_type, supplier_id, amount_paisa, payment_method, user_id, notes
                ) VALUES ('SUPPLIER_PAYABLE', ?, ?, ?, ?, ?)
                """,
                (supplier_id, amount_paisa, payment_method, user["id"], notes.strip())
            )
            payment_id = cur.lastrowid

            cur.execute(
                "UPDATE suppliers SET balance_paisa = balance_paisa - ?, updated_at = datetime('now', 'localtime') WHERE id = ?",
                (amount_paisa, supplier_id)
            )

            log_audit(
                conn, user["id"], user["username"], "PAY_SUPPLIER", "SUPPLIER",
                str(supplier_id), f"Paid {format_paisa_to_pkr(amount_paisa)} via {payment_method} to {s['name']}"
            )

            return {
                "payment_id": payment_id,
                "supplier_id": supplier_id,
                "amount_paisa": amount_paisa,
                "remaining_balance_paisa": s["balance_paisa"] - amount_paisa
            }

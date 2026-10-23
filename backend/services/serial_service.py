"""
PakAudio Retail Management System - Serial Numbers & Warranty Service
Tracks serialized products (Head Units, Android Tabs, Amplifiers) 1-serial-per-unit,
warranty lookups, claims workflow (Supplier return / repair / replacement).
"""
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
import sqlite3
from backend.auth import log_audit, PermissionDeniedError

class SerialError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code

class SerialService:
    def __init__(self, db):
        self.db = db

    def lookup_serial(self, serial_number: str) -> Dict[str, Any]:
        """
        Lookup by serial number: shows product info, customer, bill number, sale date, and warranty expiry.
        """
        serial_number = serial_number.strip()
        if not serial_number:
            raise SerialError("Serial number cannot be empty.")

        conn = self.db.get_connection()
        try:
            cur = conn.cursor()
            cur.execute(
                """
                SELECT 
                    s.id as serial_id, s.serial_number, s.status, s.created_at as received_date,
                    pv.id as variant_id, pv.sku, pv.variant_name,
                    p.id as product_id, p.name as product_name, p.warranty_months as default_warranty,
                    sup.name as supplier_name,
                    b.id as bill_id, b.bill_number, b.created_at as sale_date,
                    c.id as customer_id, c.name as customer_name, c.phone as customer_phone,
                    bi.warranty_months as bill_warranty_months
                FROM serials s
                JOIN product_variants pv ON s.product_variant_id = pv.id
                JOIN products p ON pv.product_id = p.id
                LEFT JOIN suppliers sup ON s.supplier_id = sup.id
                LEFT JOIN bills b ON s.current_bill_id = b.id
                LEFT JOIN customers c ON b.customer_id = c.id
                LEFT JOIN bill_items bi ON (b.id = bi.bill_id AND bi.product_variant_id = pv.id)
                WHERE s.serial_number = ?
                """,
                (serial_number,)
            )
            row = cur.fetchone()
            if not row:
                raise SerialError(f"Serial number '{serial_number}' is not recognized in the system.", status_code=404)

            # Calculate warranty expiry
            warranty_months = row["bill_warranty_months"] if row["bill_warranty_months"] is not None else row["default_warranty"]
            warranty_expiry = None
            is_under_warranty = False

            if row["sale_date"] and warranty_months > 0:
                try:
                    sale_dt = datetime.fromisoformat(row["sale_date"])
                    # Approx 30 days per month
                    expiry_dt = sale_dt + timedelta(days=warranty_months * 30)
                    warranty_expiry = expiry_dt.strftime("%Y-%m-%d")
                    is_under_warranty = datetime.now() <= expiry_dt
                except Exception:
                    pass

            return {
                "serial_id": row["serial_id"],
                "serial_number": row["serial_number"],
                "status": row["status"],
                "product_id": row["product_id"],
                "variant_id": row["variant_id"],
                "product_name": row["product_name"],
                "variant_name": row["variant_name"],
                "sku": row["sku"],
                "supplier_name": row["supplier_name"] or "",
                "bill_id": row["bill_id"],
                "bill_number": row["bill_number"],
                "sale_date": row["sale_date"],
                "customer_name": row["customer_name"] or "",
                "customer_phone": row["customer_phone"] or "",
                "warranty_months": warranty_months,
                "warranty_expiry": warranty_expiry,
                "is_under_warranty": is_under_warranty
            }
        finally:
            conn.close()

    def validate_serials_for_sale(self, conn: sqlite3.Connection, variant_id: int, serials: List[str]):
        """
        Verifies that serials are:
        1. In stock
        2. Belong to this product variant
        3. Not duplicate in this bill
        """
        if len(serials) != len(set(serials)):
            raise SerialError("Duplicate serial number detected in the scan list.")

        cur = conn.cursor()
        for sn in serials:
            sn = sn.strip()
            cur.execute(
                "SELECT id, product_variant_id, status FROM serials WHERE serial_number = ?",
                (sn,)
            )
            row = cur.fetchone()
            if not row:
                raise SerialError(f"Serial number '{sn}' is not registered in the system. Please check the serial tag.")
            if row["product_variant_id"] != variant_id:
                raise SerialError(f"Serial number '{sn}' belongs to another product variant.")
            if row["status"] != "IN_STOCK":
                raise SerialError(f"Serial number '{sn}' is not available (Current status: {row['status']}).")

    def create_warranty_claim(self, user: Dict[str, Any], data: Dict[str, Any]) -> Dict[str, Any]:
        """Creates a customer warranty claim ticket for a serialized item."""
        serial_number = data.get("serial_number", "").strip()
        issue_description = data.get("issue_description", "").strip()
        if not serial_number:
            raise SerialError("Serial number is required for warranty claims.")
        if not issue_description:
            raise SerialError("Issue description is required.")

        with self.db.transaction() as conn:
            cur = conn.cursor()
            cur.execute(
                """
                SELECT s.id, s.product_variant_id, s.supplier_id, s.current_bill_id, b.customer_id
                FROM serials s
                LEFT JOIN bills b ON s.current_bill_id = b.id
                WHERE s.serial_number = ?
                """,
                (serial_number,)
            )
            s_row = cur.fetchone()
            if not s_row:
                raise SerialError(f"Serial '{serial_number}' not found in database.", status_code=404)

            claim_number = f"CLM-{datetime.now().strftime('%Y%m%d%H%M%S%f')[:18]}"
            cur.execute(
                """
                INSERT INTO warranty_claims (
                    claim_number, serial_number, product_variant_id, original_bill_id,
                    customer_id, issue_description, status, supplier_id, user_id, notes
                ) VALUES (?, ?, ?, ?, ?, ?, 'RECEIVED', ?, ?, ?)
                """,
                (claim_number, serial_number, s_row["product_variant_id"], s_row["current_bill_id"],
                 s_row["customer_id"], issue_description, s_row["supplier_id"], user["id"], data.get("notes", ""))
            )
            claim_id = cur.lastrowid
            # Mark serial as DEFECTIVE
            cur.execute("UPDATE serials SET status = 'DEFECTIVE' WHERE serial_number = ?", (serial_number,))
            log_audit(conn, user["id"], user["username"], "CREATE_WARRANTY_CLAIM", "WARRANTY_CLAIM", str(claim_id), f"Serial: {serial_number}, Claim: {claim_number}")

            return {"claim_id": claim_id, "claim_number": claim_number, "status": "RECEIVED"}

    def update_claim_status(self, user: Dict[str, Any], claim_id: int, new_status: str, notes: str = "") -> Dict[str, Any]:
        """Updates claim status (SENT_TO_SUPPLIER, REPAIRED, REPLACED, RETURNED_TO_CUSTOMER)."""
        valid_statuses = ('RECEIVED', 'SENT_TO_SUPPLIER', 'REPAIRED', 'REPLACED', 'REJECTED', 'RETURNED_TO_CUSTOMER')
        if new_status not in valid_statuses:
            raise SerialError(f"Invalid status. Must be one of: {', '.join(valid_statuses)}")

        with self.db.transaction() as conn:
            cur = conn.cursor()
            cur.execute("SELECT id, serial_number, status FROM warranty_claims WHERE id = ?", (claim_id,))
            c_row = cur.fetchone()
            if not c_row:
                raise SerialError("Warranty claim not found.", status_code=404)

            cur.execute(
                """
                UPDATE warranty_claims
                SET status = ?, notes = notes || ' | ' || ?, updated_at = datetime('now', 'localtime')
                WHERE id = ?
                """,
                (new_status, f"[{user['username']} - {datetime.now().strftime('%d/%m %H:%M')}] {notes.strip()}", claim_id)
            )

            # Update serial status if needed
            serial_number = c_row["serial_number"]
            if new_status == "SENT_TO_SUPPLIER":
                cur.execute("UPDATE serials SET status = 'RETURNED_TO_SUPPLIER' WHERE serial_number = ?", (serial_number,))
            elif new_status == "REPLACED":
                cur.execute("UPDATE serials SET status = 'REPLACED' WHERE serial_number = ?", (serial_number,))
            elif new_status == "RETURNED_TO_CUSTOMER":
                cur.execute("UPDATE serials SET status = 'SOLD' WHERE serial_number = ?", (serial_number,))

            log_audit(conn, user["id"], user["username"], "UPDATE_WARRANTY_CLAIM", "WARRANTY_CLAIM", str(claim_id), f"New status: {new_status}")
            return {"claim_id": claim_id, "status": new_status}

    def list_warranty_claims(self, status: Optional[str] = None) -> List[Dict[str, Any]]:
        conn = self.db.get_connection()
        try:
            cur = conn.cursor()
            query = """
                SELECT wc.id, wc.claim_number, wc.serial_number, wc.issue_description, wc.status,
                       wc.notes, wc.created_at, wc.updated_at,
                       p.name as product_name, pv.variant_name, pv.sku,
                       c.name as customer_name, c.phone as customer_phone,
                       s.name as supplier_name
                FROM warranty_claims wc
                JOIN product_variants pv ON wc.product_variant_id = pv.id
                JOIN products p ON pv.product_id = p.id
                LEFT JOIN customers c ON wc.customer_id = c.id
                LEFT JOIN suppliers s ON wc.supplier_id = s.id
            """
            params = []
            if status:
                query += " WHERE wc.status = ?"
                params.append(status)
            query += " ORDER BY wc.created_at DESC"

            cur.execute(query, tuple(params))
            return [dict(r) for r in cur.fetchall()]
        finally:
            conn.close()

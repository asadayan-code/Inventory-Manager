"""
PakAudio Retail Management System - Stock Ledger & Inventory Service
Rule 2: Stock is never edited directly. Stock on hand is the sum of stock_movements.
Every change has a movement_type, time, user, and a mandatory note.
"""
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
import sqlite3
from backend.money import require_paisa
from backend.auth import log_audit, PermissionDeniedError

class StockError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code

class StockService:
    def __init__(self, db):
        self.db = db

    def get_stock_on_hand(self, conn: sqlite3.Connection, variant_id: int) -> int:
        """Computes real-time stock on hand as sum of stock_movements."""
        cur = conn.cursor()
        cur.execute(
            "SELECT COALESCE(SUM(quantity), 0) FROM stock_movements WHERE product_variant_id = ?",
            (variant_id,)
        )
        return int(cur.fetchone()[0])

    def record_movement(self, conn: sqlite3.Connection, variant_id: int, quantity: int,
                        movement_type: str, reference_type: str, reference_id: Optional[int],
                        unit_cost_paisa: int, user_id: int, note: str):
        """
        Atomic append to stock_movements ledger.
        Mandatory note required for adjustments.
        """
        if quantity == 0:
            return

        if movement_type in ("DAMAGE", "THEFT", "COUNT_ADJUSTMENT") and not note.strip():
            raise StockError(f"A mandatory note explaining the reason is required for {movement_type}.")

        conn.execute(
            """
            INSERT INTO stock_movements (
                product_variant_id, quantity, movement_type, reference_type,
                reference_id, unit_cost_paisa, user_id, note, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
            """,
            (variant_id, quantity, movement_type, reference_type, reference_id, unit_cost_paisa, user_id, note.strip())
        )

    def manual_adjustment(self, user: Dict[str, Any], variant_id: int, quantity: int,
                          reason: str, note: str) -> Dict[str, Any]:
        """
        Manual stock adjustment (e.g. DAMAGE, THEFT, COUNT_ADJUSTMENT).
        Only OWNER can adjust stock.
        """
        if user.get("role") != "OWNER":
            raise PermissionDeniedError("perform manual stock adjustments")

        if reason not in ("DAMAGE", "THEFT", "COUNT_ADJUSTMENT"):
            raise StockError("Reason must be DAMAGE, THEFT, or COUNT_ADJUSTMENT.")

        if not note or len(note.strip()) < 3:
            raise StockError("A clear note (at least 3 characters) explaining the adjustment is required.")

        with self.db.transaction() as conn:
            cur = conn.cursor()
            cur.execute(
                """
                SELECT v.id, v.sku, v.variant_name, v.cost_paisa, p.name as product_name, p.is_service
                FROM product_variants v
                JOIN products p ON v.product_id = p.id
                WHERE v.id = ?
                """,
                (variant_id,)
            )
            item = cur.fetchone()
            if not item:
                raise StockError("Product variant not found.", status_code=404)
            if item["is_service"]:
                raise StockError("Cannot adjust stock on a service/labour item.")

            current_stock = self.get_stock_on_hand(conn, variant_id)
            new_stock = current_stock + quantity
            if new_stock < 0:
                raise StockError(f"Cannot adjust stock by {quantity}. Current stock is only {current_stock}.")

            self.record_movement(
                conn=conn,
                variant_id=variant_id,
                quantity=quantity,
                movement_type=reason,
                reference_type="MANUAL_ADJUST",
                reference_id=None,
                unit_cost_paisa=item["cost_paisa"],
                user_id=user["id"],
                note=note.strip()
            )

            log_audit(
                conn, user["id"], user["username"], "STOCK_ADJUSTMENT", "PRODUCT_VARIANT",
                str(variant_id), f"{reason}: change {quantity:+d} (from {current_stock} to {new_stock}). Note: {note}"
            )

            return {
                "variant_id": variant_id,
                "previous_stock": current_stock,
                "adjustment": quantity,
                "new_stock": new_stock
            }

    def receive_purchase(self, user: Dict[str, Any], data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Receives goods from a supplier.
        Updates stock movements, serial numbers, supplier payable balance, and purchase record.
        """
        supplier_id = data.get("supplier_id")
        if not supplier_id:
            raise StockError("Supplier is required.")

        invoice_number = data.get("invoice_number", "").strip()
        if not invoice_number:
            raise StockError("Supplier invoice number is required.")

        items = data.get("items", [])
        if not items:
            raise StockError("At least one item must be received.")

        paid_amount_paisa = require_paisa(data.get("paid_amount_paisa", 0))
        payment_method = data.get("payment_method", "CASH")
        notes = data.get("notes", "").strip()

        with self.db.transaction() as conn:
            cur = conn.cursor()
            cur.execute("SELECT id, name, balance_paisa FROM suppliers WHERE id = ?", (supplier_id,))
            supplier = cur.fetchone()
            if not supplier:
                raise StockError("Supplier not found.", status_code=404)

            # Generate PO number with microsecond & random suffix
            po_number = f"PO-{datetime.now().strftime('%Y%m%d%H%M%S%f')[:17]}"

            # Calculate total
            total_amount_paisa = 0
            for itm in items:
                qty = int(itm.get("quantity", 0))
                if qty <= 0:
                    raise StockError("Received quantity must be greater than zero.")
                unit_cost_paisa = require_paisa(itm.get("unit_cost_paisa", 0))
                line_total = qty * unit_cost_paisa
                total_amount_paisa += line_total

            # Status: RECEIVED or PARTIAL (based on payment)
            status = "RECEIVED"

            cur.execute(
                """
                INSERT INTO purchases (
                    po_number, supplier_id, invoice_number, invoice_date, total_amount_paisa,
                    paid_amount_paisa, payment_method, status, notes, user_id
                ) VALUES (?, ?, ?, date('now', 'localtime'), ?, ?, ?, ?, ?, ?)
                """,
                (po_number, supplier_id, invoice_number, total_amount_paisa, paid_amount_paisa, payment_method, status, notes, user["id"])
            )
            purchase_id = cur.lastrowid

            # Process items
            for itm in items:
                variant_id = int(itm["variant_id"])
                qty = int(itm["quantity"])
                unit_cost_paisa = require_paisa(itm["unit_cost_paisa"])
                batch_number = itm.get("batch_number", "").strip()
                expiry_date = itm.get("expiry_date", "").strip()
                line_total = qty * unit_cost_paisa

                cur.execute(
                    """
                    INSERT INTO purchase_items (
                        purchase_id, product_variant_id, quantity, unit_cost_paisa, line_total_paisa, batch_number, expiry_date
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (purchase_id, variant_id, qty, unit_cost_paisa, line_total, batch_number, expiry_date)
                )

                # Append to stock movements
                self.record_movement(
                    conn=conn,
                    variant_id=variant_id,
                    quantity=qty,
                    movement_type="RECEIVE",
                    reference_type="PURCHASE",
                    reference_id=purchase_id,
                    unit_cost_paisa=unit_cost_paisa,
                    user_id=user["id"],
                    note=f"Received PO #{po_number} Inv #{invoice_number} from {supplier['name']}"
                )

                # Update variant latest cost if needed
                cur.execute("UPDATE product_variants SET cost_paisa = ? WHERE id = ?", (unit_cost_paisa, variant_id))

                # Handle serial numbers if provided
                serials = itm.get("serials", [])
                for sn in serials:
                    sn = sn.strip()
                    if not sn:
                        continue
                    cur.execute("SELECT id, status FROM serials WHERE serial_number = ?", (sn,))
                    existing_sn = cur.fetchone()
                    if existing_sn:
                        raise StockError(f"Serial number '{sn}' already exists in database with status '{existing_sn['status']}'.")
                    cur.execute(
                        """
                        INSERT INTO serials (product_variant_id, serial_number, status, supplier_id, purchase_id)
                        VALUES (?, ?, 'IN_STOCK', ?, ?)
                        """,
                        (variant_id, sn, supplier_id, purchase_id)
                    )

            # Update Supplier Payable Balance (what I owe supplier)
            # balance = total - paid
            unpaid_paisa = total_amount_paisa - paid_amount_paisa
            if unpaid_paisa != 0:
                cur.execute(
                    "UPDATE suppliers SET balance_paisa = balance_paisa + ?, updated_at = datetime('now', 'localtime') WHERE id = ?",
                    (unpaid_paisa, supplier_id)
                )

            # If paid_amount > 0, record payment entry
            if paid_amount_paisa > 0:
                cur.execute(
                    """
                    INSERT INTO payments (
                        reference_type, reference_id, supplier_id, amount_paisa, payment_method, user_id, notes
                    ) VALUES ('PURCHASE', ?, ?, ?, ?, ?, ?)
                    """,
                    (purchase_id, supplier_id, paid_amount_paisa, payment_method, user["id"], f"Paid on PO {po_number}")
                )

            log_audit(
                conn, user["id"], user["username"], "RECEIVE_PURCHASE", "PURCHASE", str(purchase_id),
                f"PO {po_number}, Supplier: {supplier['name']}, Total: PKR {total_amount_paisa // 100}, Paid: PKR {paid_amount_paisa // 100}"
            )

            return {
                "purchase_id": purchase_id,
                "po_number": po_number,
                "total_amount_paisa": total_amount_paisa,
                "paid_amount_paisa": paid_amount_paisa,
                "unpaid_amount_paisa": unpaid_paisa
            }

    def start_stocktake(self, user: Dict[str, Any], notes: str = "") -> Dict[str, Any]:
        """Creates a new stocktake draft with current system snapshot."""
        if user.get("role") != "OWNER":
            raise PermissionDeniedError("conduct stocktake")

        with self.db.transaction() as conn:
            cur = conn.cursor()
            cur.execute(
                "INSERT INTO stocktakes (user_id, status, notes) VALUES (?, 'DRAFT', ?)",
                (user["id"], notes.strip())
            )
            stocktake_id = cur.lastrowid

            # Populate with all active non-service variants
            cur.execute(
                """
                SELECT v.id as variant_id, v.cost_paisa,
                       COALESCE((SELECT SUM(sm.quantity) FROM stock_movements sm WHERE sm.product_variant_id = v.id), 0) as stock_on_hand
                FROM product_variants v
                JOIN products p ON v.product_id = p.id
                WHERE p.is_service = 0 AND v.is_active = 1
                """
            )
            for r in cur.fetchall():
                cur.execute(
                    """
                    INSERT INTO stocktake_items (stocktake_id, product_variant_id, system_quantity, counted_quantity, difference, unit_cost_paisa)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (stocktake_id, r["variant_id"], r["stock_on_hand"], r["stock_on_hand"], 0, r["cost_paisa"])
                )

            log_audit(conn, user["id"], user["username"], "START_STOCKTAKE", "STOCKTAKE", str(stocktake_id), "Started new stocktake draft")
            return {"stocktake_id": stocktake_id, "status": "DRAFT"}

    def commit_stocktake(self, user: Dict[str, Any], stocktake_id: int, counts: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Commits stocktake counts, posting COUNT_ADJUSTMENT ledger movements for discrepancies.
        """
        if user.get("role") != "OWNER":
            raise PermissionDeniedError("commit stocktake")

        with self.db.transaction() as conn:
            cur = conn.cursor()
            cur.execute("SELECT id, status FROM stocktakes WHERE id = ?", (stocktake_id,))
            st = cur.fetchone()
            if not st:
                raise StockError("Stocktake not found.", status_code=404)
            if st["status"] == "COMMITTED":
                raise StockError("This stocktake is already committed.")

            adjustments_count = 0
            for c in counts:
                variant_id = int(c["variant_id"])
                counted_qty = int(c["counted_quantity"])

                # Get latest system stock right now
                current_sys = self.get_stock_on_hand(conn, variant_id)
                diff = counted_qty - current_sys

                cur.execute("SELECT cost_paisa FROM product_variants WHERE id = ?", (variant_id,))
                var_row = cur.fetchone()
                cost_paisa = var_row["cost_paisa"] if var_row else 0

                cur.execute(
                    """
                    UPDATE stocktake_items
                    SET system_quantity = ?, counted_quantity = ?, difference = ?, unit_cost_paisa = ?
                    WHERE stocktake_id = ? AND product_variant_id = ?
                    """,
                    (current_sys, counted_qty, diff, cost_paisa, stocktake_id, variant_id)
                )

                if diff != 0:
                    adjustments_count += 1
                    self.record_movement(
                        conn=conn,
                        variant_id=variant_id,
                        quantity=diff,
                        movement_type="COUNT_ADJUSTMENT",
                        reference_type="STOCKTAKE",
                        reference_id=stocktake_id,
                        unit_cost_paisa=cost_paisa,
                        user_id=user["id"],
                        note=f"Stocktake #{stocktake_id} physical count discrepancy ({diff:+d})"
                    )

            cur.execute("UPDATE stocktakes SET status = 'COMMITTED' WHERE id = ?", (stocktake_id,))
            log_audit(conn, user["id"], user["username"], "COMMIT_STOCKTAKE", "STOCKTAKE", str(stocktake_id), f"Committed with {adjustments_count} adjustments")

            return {"stocktake_id": stocktake_id, "status": "COMMITTED", "adjustments_count": adjustments_count}

    def get_low_stock_report(self) -> List[Dict[str, Any]]:
        """Returns low stock items with suggested reorder quantities."""
        conn = self.db.get_connection()
        try:
            cur = conn.cursor()
            cur.execute(
                """
                SELECT * FROM (
                    SELECT 
                        p.id as product_id, p.name as product_name, c.name as category_name, b.name as brand_name,
                        v.id as variant_id, v.sku, v.barcode, v.variant_name, v.cost_paisa, v.retail_price_paisa,
                        v.reorder_level,
                        COALESCE((SELECT SUM(sm.quantity) FROM stock_movements sm WHERE sm.product_variant_id = v.id), 0) as stock_on_hand,
                        (
                            SELECT s.name FROM purchases pur 
                            JOIN purchase_items pi ON pur.id = pi.purchase_id 
                            JOIN suppliers s ON pur.supplier_id = s.id 
                            WHERE pi.product_variant_id = v.id 
                            ORDER BY pur.created_at DESC LIMIT 1
                        ) as last_supplier_name
                    FROM product_variants v
                    JOIN products p ON v.product_id = p.id
                    LEFT JOIN categories c ON p.category_id = c.id
                    LEFT JOIN brands b ON p.brand_id = b.id
                    WHERE p.is_service = 0 AND v.is_active = 1
                ) sub
                WHERE sub.stock_on_hand <= sub.reorder_level
                ORDER BY (sub.stock_on_hand - sub.reorder_level) ASC, sub.product_name ASC
                """
            )
            return [dict(r) for r in cur.fetchall()]
        finally:
            conn.close()

    def get_dead_stock_report(self, days: int = 60) -> List[Dict[str, Any]]:
        """Returns items with stock on hand that have had NO sales in the last N days."""
        conn = self.db.get_connection()
        try:
            cutoff = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d %H:%M:%S")
            cur = conn.cursor()
            cur.execute(
                """
                SELECT * FROM (
                    SELECT 
                        p.id as product_id, p.name as product_name, c.name as category_name, b.name as brand_name,
                        v.id as variant_id, v.sku, v.barcode, v.variant_name, v.cost_paisa, v.retail_price_paisa,
                        COALESCE((SELECT SUM(sm.quantity) FROM stock_movements sm WHERE sm.product_variant_id = v.id), 0) as stock_on_hand,
                        (SELECT MAX(created_at) FROM stock_movements sm WHERE sm.product_variant_id = v.id AND sm.movement_type = 'SALE') as last_sold_at
                    FROM product_variants v
                    JOIN products p ON v.product_id = p.id
                    LEFT JOIN categories c ON p.category_id = c.id
                    LEFT JOIN brands b ON p.brand_id = b.id
                    WHERE p.is_service = 0 AND v.is_active = 1
                ) sub
                WHERE sub.stock_on_hand > 0 AND (sub.last_sold_at IS NULL OR sub.last_sold_at < ?)
                ORDER BY sub.last_sold_at ASC, sub.stock_on_hand DESC
                """,
                (cutoff,)
            )
            return [dict(r) for r in cur.fetchall()]
        finally:
            conn.close()

    def get_stock_movements_history(self, variant_id: int, limit: int = 50) -> List[Dict[str, Any]]:
        """Returns the complete audit ledger for a given variant."""
        conn = self.db.get_connection()
        try:
            cur = conn.cursor()
            cur.execute(
                """
                SELECT sm.id, sm.quantity, sm.movement_type, sm.reference_type, sm.reference_id,
                       sm.unit_cost_paisa, sm.note, sm.created_at, u.username as user_name
                FROM stock_movements sm
                JOIN users u ON sm.user_id = u.id
                WHERE sm.product_variant_id = ?
                ORDER BY sm.created_at DESC, sm.id DESC
                LIMIT ?
                """,
                (variant_id, limit)
            )
            return [dict(r) for r in cur.fetchall()]
        finally:
            conn.close()

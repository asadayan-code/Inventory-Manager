"""
PakAudio Retail Management System - Billing & Sales Counter Service
Enforces Non-Negotiable Rules:
- Integer paisa arithmetic.
- Snapshot copying of prices, cost, warranty onto bill_items.
- Single all-or-nothing transactions.
- Never sell more than stock without owner override.
- Never sell below min price without owner override.
- Cashier discount limit enforced (default 5%).
- Split payments (Cash, Card, Bank, JazzCash, Easypaisa) + Credit/Udhaar.
- Hold & Resume bills.
- Quotations with validity date, converting to bills.
- Returns cancel unpaid balance first, then refund the rest, with RESTOCK or SCRAP.
"""
import json
from datetime import datetime
from typing import Dict, Any, List, Optional
import sqlite3
from backend.money import require_paisa, format_paisa_to_pkr, amount_to_words_pkr
from backend.auth import log_audit, PermissionDeniedError
from backend.services.stock_service import StockService

class BillingError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code

class InsufficientStockError(BillingError):
    pass

class BelowMinPriceError(BillingError):
    pass

class BillingService:
    def __init__(self, db):
        self.db = db
        self.stock_service = StockService(db)

    def _generate_bill_number(self, conn: sqlite3.Connection, is_quote: bool = False) -> str:
        prefix = "QT" if is_quote else "INV"
        date_str = datetime.now().strftime("%Y%m%d")
        cur = conn.cursor()
        cur.execute(
            f"SELECT COUNT(*) FROM bills WHERE bill_number LIKE '{prefix}-{date_str}-%'"
        )
        count = cur.fetchone()[0] + 1
        return f"{prefix}-{date_str}-{count:04d}"

    def _get_setting(self, conn: sqlite3.Connection, key: str, default: str = "") -> str:
        cur = conn.cursor()
        cur.execute("SELECT value FROM settings WHERE key = ?", (key,))
        row = cur.fetchone()
        return row[0] if row else default

    def create_bill(self, user: Dict[str, Any], data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Creates a completed bill or quote in a single atomic transaction.
        Handles:
        - Stock verification and stock movements (with bundle component expansion)
        - Min price checks
        - Cashier discount cap
        - Serial number tracking and linking
        - Customer Udhaar balance tracking
        - Split payments
        """
        is_quote = bool(data.get("is_quote", False))
        is_advance = bool(data.get("is_advance", False))
        customer_id = data.get("customer_id")
        customer_name = data.get("customer_name", "Counter Sale").strip() or "Counter Sale"
        customer_phone = data.get("customer_phone", "").strip()
        items = data.get("items", [])
        if not items:
            raise BillingError("Cannot create a bill with no items.")

        discount_paisa = require_paisa(data.get("discount_paisa", 0))
        tax_rate_percent = int(data.get("tax_rate_percent", 0))
        payments = data.get("payments", [])  # list of {method, amount_paisa}
        notes = data.get("notes", "").strip()
        owner_override = bool(data.get("owner_override", False))

        # Check if cashier has permission for owner override
        if owner_override and user.get("role") != "OWNER":
            raise PermissionDeniedError("use owner price/stock overrides")

        with self.db.transaction() as conn:
            cur = conn.cursor()

            # Cashier discount limit check
            cashier_limit_pct = int(self._get_setting(conn, "cashier_discount_limit_percent", "5"))

            bill_number = self._generate_bill_number(conn, is_quote=is_quote)

            subtotal_paisa = 0
            validated_items = []

            # 1. Process and validate all items
            for itm in items:
                variant_id = itm.get("variant_id")
                qty = int(itm.get("quantity", 1))
                if qty <= 0:
                    raise BillingError("Item quantity must be at least 1.")

                # Lookup variant and product
                cur.execute(
                    """
                    SELECT v.id as variant_id, v.sku, v.barcode, v.variant_name,
                           v.cost_paisa, v.retail_price_paisa, v.wholesale_price_paisa, v.min_price_paisa,
                           p.id as product_id, p.name as product_name, p.is_service, p.is_bundle,
                           p.is_serialized, p.warranty_months
                    FROM product_variants v
                    JOIN products p ON v.product_id = p.id
                    WHERE v.id = ?
                    """,
                    (variant_id,)
                )
                v_row = cur.fetchone()
                if not v_row:
                    raise BillingError(f"Product variant ID #{variant_id} does not exist.")

                # Price determination
                # Check if wholesale customer
                is_wholesale = False
                if customer_id:
                    cur.execute("SELECT customer_type FROM customers WHERE id = ?", (customer_id,))
                    c_type_row = cur.fetchone()
                    if c_type_row and c_type_row["customer_type"] == "WHOLESALE":
                        is_wholesale = True

                default_unit_price = v_row["wholesale_price_paisa"] if is_wholesale else v_row["retail_price_paisa"]
                unit_price_paisa = require_paisa(itm.get("unit_price_paisa", default_unit_price))
                item_discount_paisa = require_paisa(itm.get("discount_paisa", 0))

                # Check minimum price rule (Rule 5)
                if unit_price_paisa < v_row["min_price_paisa"]:
                    if not owner_override:
                        min_str = format_paisa_to_pkr(v_row["min_price_paisa"])
                        given_str = format_paisa_to_pkr(unit_price_paisa)
                        raise BelowMinPriceError(
                            f"Price for '{v_row['product_name']} ({v_row['variant_name']})' ({given_str}) "
                            f"is below the minimum allowed price ({min_str}). Owner override required."
                        )

                # Check cashier custom price restriction
                if user.get("role") == "CASHIER" and unit_price_paisa != default_unit_price:
                    raise PermissionDeniedError("change product prices. Only owner can set custom prices.")

                # Warranty months snapshot (can be overridden per sale by owner)
                warranty_months = int(itm.get("warranty_months", v_row["warranty_months"]))
                if warranty_months != v_row["warranty_months"] and user.get("role") != "OWNER":
                    raise PermissionDeniedError("override warranty duration. Only owner can change warranty terms.")

                # Serial numbers validation
                serials = itm.get("serials", [])
                if v_row["is_serialized"] and not is_quote:
                    if len(serials) != qty:
                        raise BillingError(
                            f"Product '{v_row['product_name']}' requires exactly {qty} serial number(s). You provided {len(serials)}."
                        )
                    # Check each serial
                    for sn in serials:
                        cur.execute(
                            "SELECT id, status FROM serials WHERE serial_number = ? AND product_variant_id = ?",
                            (sn, variant_id)
                        )
                        s_record = cur.fetchone()
                        if not s_record:
                            raise BillingError(f"Serial number '{sn}' does not belong to '{v_row['product_name']}'.")
                        if s_record["status"] != "IN_STOCK":
                            raise BillingError(f"Serial number '{sn}' is already {s_record['status']}.")

                # Stock check (if not quote and not service)
                if not is_quote and not v_row["is_service"]:
                    if v_row["is_bundle"]:
                        # Check bundle components
                        cur.execute(
                            """
                            SELECT bi.component_variant_id, bi.quantity as bundle_comp_qty,
                                   pv.sku, p2.name as comp_name,
                                   COALESCE((SELECT SUM(sm.quantity) FROM stock_movements sm WHERE sm.product_variant_id = bi.component_variant_id), 0) as stock_on_hand
                            FROM bundle_items bi
                            JOIN product_variants pv ON bi.component_variant_id = pv.id
                            JOIN products p2 ON pv.product_id = p2.id
                            WHERE bi.bundle_variant_id = ?
                            """,
                            (variant_id,)
                        )
                        comp_rows = cur.fetchall()
                        for comp in comp_rows:
                            req_qty = comp["bundle_comp_qty"] * qty
                            if comp["stock_on_hand"] < req_qty and not owner_override:
                                raise InsufficientStockError(
                                    f"Bundle component '{comp['comp_name']} ({comp['sku']})' has only {comp['stock_on_hand']} in stock, but {req_qty} is needed. Owner override required."
                                )
                    else:
                        stock_on_hand = self.stock_service.get_stock_on_hand(conn, variant_id)
                        if stock_on_hand < qty and not owner_override:
                            raise InsufficientStockError(
                                f"Only {stock_on_hand} unit(s) of '{v_row['product_name']} ({v_row['variant_name']})' in stock. You tried to sell {qty}. Owner override required."
                            )

                line_total = max(0, (unit_price_paisa * qty) - item_discount_paisa)
                subtotal_paisa += line_total

                validated_items.append({
                    "variant_id": variant_id,
                    "product_id": v_row["product_id"],
                    "sku": v_row["sku"],
                    "name": v_row["product_name"],
                    "variant_name": v_row["variant_name"],
                    "is_service": v_row["is_service"],
                    "is_bundle": v_row["is_bundle"],
                    "is_serialized": v_row["is_serialized"],
                    "quantity": qty,
                    "unit_cost_paisa": v_row["cost_paisa"],
                    "unit_retail_paisa": v_row["retail_price_paisa"],
                    "unit_min_paisa": v_row["min_price_paisa"],
                    "unit_price_paisa": unit_price_paisa,
                    "discount_paisa": item_discount_paisa,
                    "line_total_paisa": line_total,
                    "warranty_months": warranty_months,
                    "serials": serials
                })

            # Check cashier whole-bill discount limit
            if user.get("role") == "CASHIER":
                max_allowed_discount_paisa = (subtotal_paisa * cashier_limit_pct) // 100
                total_discounts = discount_paisa + sum(i["discount_paisa"] for i in validated_items)
                if total_discounts > max_allowed_discount_paisa:
                    limit_str = format_paisa_to_pkr(max_allowed_discount_paisa)
                    raise PermissionDeniedError(
                        f"give more than {cashier_limit_pct}% discount ({limit_str}). Please request owner approval."
                    )

            # Calculate tax and total
            after_discount_subtotal = max(0, subtotal_paisa - discount_paisa)
            tax_paisa = (after_discount_subtotal * tax_rate_percent) // 100
            total_paisa = after_discount_subtotal + tax_paisa

            # Calculate payments
            paid_paisa = 0
            if not is_quote:
                for p in payments:
                    p_amt = require_paisa(p.get("amount_paisa", 0))
                    if p_amt > 0:
                        paid_paisa += p_amt

            balance_paisa = total_paisa - paid_paisa

            # If credit / udhaar (balance > 0), customer MUST be provided!
            if balance_paisa > 0 and not is_quote:
                if not customer_id:
                    raise BillingError(
                        "Udhaar (credit sale) requires selecting or registering a customer with their name and phone number."
                    )

            # Status
            status = "COMPLETED" if not is_quote else "HOLD"
            quote_validity = data.get("quote_validity_date")

            # Insert Bill
            cur.execute(
                """
                INSERT INTO bills (
                    bill_number, customer_id, customer_name, customer_phone,
                    cashier_id, status, subtotal_paisa, discount_paisa, tax_rate_percent,
                    tax_paisa, total_paisa, paid_paisa, balance_paisa, payment_methods_json,
                    is_quote, quote_validity_date, is_advance, notes
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (bill_number, customer_id, customer_name, customer_phone,
                 user["id"], status, subtotal_paisa, discount_paisa, tax_rate_percent,
                 tax_paisa, total_paisa, paid_paisa, balance_paisa, json.dumps(payments),
                 1 if is_quote else 0, quote_validity, 1 if is_advance else 0, notes)
            )
            bill_id = cur.lastrowid

            # Insert Bill Items and Record Stock Movements
            for vi in validated_items:
                cur.execute(
                    """
                    INSERT INTO bill_items (
                        bill_id, product_variant_id, is_service, is_bundle, sku, name, variant_name,
                        quantity, unit_cost_paisa, unit_retail_paisa, unit_min_paisa, unit_price_paisa,
                        discount_paisa, line_total_paisa, warranty_months, serial_numbers_json
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (bill_id, vi["variant_id"], vi["is_service"], vi["is_bundle"], vi["sku"],
                     vi["name"], vi["variant_name"], vi["quantity"], vi["unit_cost_paisa"],
                     vi["unit_retail_paisa"], vi["unit_min_paisa"], vi["unit_price_paisa"],
                     vi["discount_paisa"], vi["line_total_paisa"], vi["warranty_months"],
                     json.dumps(vi["serials"]))
                )

                if not is_quote and not vi["is_service"]:
                    if vi["is_bundle"]:
                        # Deduct each bundle component from stock
                        cur.execute(
                            "SELECT component_variant_id, quantity FROM bundle_items WHERE bundle_variant_id = ?",
                            (vi["variant_id"],)
                        )
                        for c_item in cur.fetchall():
                            comp_var_id = c_item["component_variant_id"]
                            comp_qty = c_item["quantity"] * vi["quantity"]
                            self.stock_service.record_movement(
                                conn=conn,
                                variant_id=comp_var_id,
                                quantity=-comp_qty,
                                movement_type="BUNDLE_COMPONENT_SALE",
                                reference_type="BILL",
                                reference_id=bill_id,
                                unit_cost_paisa=vi["unit_cost_paisa"],
                                user_id=user["id"],
                                note=f"Sold as part of bundle {vi['name']} on bill #{bill_number}"
                            )
                    else:
                        # Deduct stock
                        self.stock_service.record_movement(
                            conn=conn,
                            variant_id=vi["variant_id"],
                            quantity=-vi["quantity"],
                            movement_type="SALE",
                            reference_type="BILL",
                            reference_id=bill_id,
                            unit_cost_paisa=vi["unit_cost_paisa"],
                            user_id=user["id"],
                            note=f"Sold on bill #{bill_number}"
                        )

                    # Update serials to SOLD
                    for sn in vi["serials"]:
                        cur.execute(
                            "UPDATE serials SET status = 'SOLD', current_bill_id = ? WHERE serial_number = ?",
                            (bill_id, sn)
                        )

            # Record Payments
            if not is_quote and payments:
                for p in payments:
                    p_amt = require_paisa(p.get("amount_paisa", 0))
                    p_method = p.get("method", "CASH")
                    if p_amt > 0:
                        cur.execute(
                            """
                            INSERT INTO payments (
                                reference_type, reference_id, customer_id, amount_paisa, payment_method, user_id, notes
                            ) VALUES ('BILL', ?, ?, ?, ?, ?, ?)
                            """,
                            (bill_id, customer_id, p_amt, p_method, user["id"], f"Payment for bill #{bill_number}")
                        )

            # Update customer balance (udhaar)
            if balance_paisa > 0 and customer_id and not is_quote:
                cur.execute(
                    "UPDATE customers SET balance_paisa = balance_paisa + ?, updated_at = datetime('now', 'localtime') WHERE id = ?",
                    (balance_paisa, customer_id)
                )

            # Audit log
            action_name = "CREATE_QUOTE" if is_quote else "CREATE_BILL"
            details = f"{bill_number}, Total: {format_paisa_to_pkr(total_paisa)}, Paid: {format_paisa_to_pkr(paid_paisa)}"
            if owner_override:
                details += " [OWNER_OVERRIDE_USED]"
            log_audit(conn, user["id"], user["username"], action_name, "BILL", str(bill_id), details)

            return {
                "bill_id": bill_id,
                "bill_number": bill_number,
                "customer_name": customer_name,
                "total_paisa": total_paisa,
                "paid_paisa": paid_paisa,
                "balance_paisa": balance_paisa,
                "is_quote": is_quote,
                "items_count": len(validated_items)
            }

    def convert_quote_to_bill(self, user: Dict[str, Any], quote_id: int, payments: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Converts an existing quotation into a completed sales invoice."""
        with self.db.transaction() as conn:
            cur = conn.cursor()
            cur.execute("SELECT * FROM bills WHERE id = ? AND is_quote = 1", (quote_id,))
            quote = cur.fetchone()
            if not quote:
                raise BillingError("Quotation not found.", status_code=404)

            # Fetch quote items
            cur.execute("SELECT * FROM bill_items WHERE bill_id = ?", (quote_id,))
            q_items = cur.fetchall()

            bill_data = {
                "customer_id": quote["customer_id"],
                "customer_name": quote["customer_name"],
                "customer_phone": quote["customer_phone"],
                "discount_paisa": quote["discount_paisa"],
                "tax_rate_percent": quote["tax_rate_percent"],
                "payments": payments,
                "notes": f"Converted from quotation #{quote['bill_number']}",
                "items": [
                    {
                        "variant_id": itm["product_variant_id"],
                        "quantity": itm["quantity"],
                        "unit_price_paisa": itm["unit_price_paisa"],
                        "discount_paisa": itm["discount_paisa"],
                        "warranty_months": itm["warranty_months"],
                        "serials": json.loads(itm["serial_numbers_json"])
                    }
                    for itm in q_items
                ]
            }

        # Create the actual bill
        res = self.create_bill(user, bill_data)
        # Mark quotation as completed/converted
        with self.db.transaction() as conn:
            conn.execute("UPDATE bills SET status = 'COMPLETED' WHERE id = ?", (quote_id,))
            log_audit(conn, user["id"], user["username"], "CONVERT_QUOTE", "BILL", str(quote_id), f"Converted to {res['bill_number']}")

        return res

    def process_return(self, user: Dict[str, Any], data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Processes a return and refund.
        Non-negotiable rules:
        - Only OWNER can process refunds.
        - Return first cancels any unpaid balance on the bill, then refunds the rest!
        - Can restock automatically, or scrap faulty units without restocking.
        """
        if user.get("role") != "OWNER":
            raise PermissionDeniedError("process returns and refunds")

        original_bill_id = data.get("original_bill_id")
        return_items_data = data.get("items", [])
        refund_method = data.get("refund_method", "CASH")
        reason = data.get("reason", "").strip()
        if not reason:
            raise BillingError("A reason for the return is mandatory.")
        if not return_items_data:
            raise BillingError("No items selected for return.")

        with self.db.transaction() as conn:
            cur = conn.cursor()
            cur.execute("SELECT * FROM bills WHERE id = ?", (original_bill_id,))
            bill = cur.fetchone()
            if not bill:
                raise BillingError("Original bill not found.", status_code=404)

            return_number = f"RET-{datetime.now().strftime('%Y%m%d%H%M%S%f')[:18]}"

            total_refund_paisa = 0
            validated_return_items = []

            for ritm in return_items_data:
                bill_item_id = ritm.get("bill_item_id")
                qty = int(ritm.get("quantity", 1))
                restock_action = ritm.get("restock_action", "RESTOCK")  # RESTOCK or SCRAP
                serial_number = ritm.get("serial_number", "").strip()
                item_note = ritm.get("note", "").strip()

                if restock_action not in ("RESTOCK", "SCRAP"):
                    raise BillingError("Restock action must be either RESTOCK or SCRAP.")

                cur.execute("SELECT * FROM bill_items WHERE id = ? AND bill_id = ?", (bill_item_id, original_bill_id))
                bi = cur.fetchone()
                if not bi:
                    raise BillingError(f"Bill line item #{bill_item_id} not found on this invoice.")

                # Check quantity already returned
                cur.execute(
                    "SELECT COALESCE(SUM(quantity), 0) FROM return_items WHERE bill_item_id = ?",
                    (bill_item_id,)
                )
                already_returned = cur.fetchone()[0]
                if qty + already_returned > bi["quantity"]:
                    raise BillingError(
                        f"Cannot return {qty} unit(s) of '{bi['name']}'. "
                        f"Sold: {bi['quantity']}, already returned: {already_returned}."
                    )

                line_refund_paisa = (bi["unit_price_paisa"] * qty)
                total_refund_paisa += line_refund_paisa

                validated_return_items.append({
                    "bill_item_id": bill_item_id,
                    "product_variant_id": bi["product_variant_id"],
                    "quantity": qty,
                    "unit_price_paisa": bi["unit_price_paisa"],
                    "line_refund_paisa": line_refund_paisa,
                    "restock_action": restock_action,
                    "serial_number": serial_number,
                    "note": item_note,
                    "cost_paisa": bi["unit_cost_paisa"],
                    "name": bi["name"]
                })

            # RULE: A return FIRST cancels any unpaid balance on the bill, then refunds the rest!
            current_bill_balance = bill["balance_paisa"]
            balance_credited_paisa = min(current_bill_balance, total_refund_paisa)
            cash_refunded_paisa = total_refund_paisa - balance_credited_paisa

            # Insert return record
            cur.execute(
                """
                INSERT INTO returns (
                    return_number, original_bill_id, customer_id, user_id,
                    total_refund_paisa, balance_credited_paisa, cash_refunded_paisa,
                    refund_method, reason
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (return_number, original_bill_id, bill["customer_id"], user["id"],
                 total_refund_paisa, balance_credited_paisa, cash_refunded_paisa, refund_method, reason)
            )
            return_id = cur.lastrowid

            # Insert return items and handle stock
            for vri in validated_return_items:
                cur.execute(
                    """
                    INSERT INTO return_items (
                        return_id, bill_item_id, product_variant_id, quantity, unit_price_paisa,
                        line_refund_paisa, restock_action, serial_number, note
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (return_id, vri["bill_item_id"], vri["product_variant_id"], vri["quantity"],
                     vri["unit_price_paisa"], vri["line_refund_paisa"], vri["restock_action"],
                     vri["serial_number"], vri["note"])
                )

                if vri["product_variant_id"]:
                    if vri["restock_action"] == "RESTOCK":
                        self.stock_service.record_movement(
                            conn=conn,
                            variant_id=vri["product_variant_id"],
                            quantity=vri["quantity"],
                            movement_type="RETURN_RESTOCK",
                            reference_type="RETURN",
                            reference_id=return_id,
                            unit_cost_paisa=vri["cost_paisa"],
                            user_id=user["id"],
                            note=f"Return #{return_number} restocked for bill #{bill['bill_number']}"
                        )
                        if vri["serial_number"]:
                            cur.execute(
                                "UPDATE serials SET status = 'IN_STOCK', current_bill_id = NULL WHERE serial_number = ?",
                                (vri["serial_number"],)
                            )
                    else:
                        # SCRAP: item is discarded, not added back to available inventory
                        self.stock_service.record_movement(
                            conn=conn,
                            variant_id=vri["product_variant_id"],
                            quantity=0,
                            movement_type="RETURN_SCRAP",
                            reference_type="RETURN",
                            reference_id=return_id,
                            unit_cost_paisa=vri["cost_paisa"],
                            user_id=user["id"],
                            note=f"Return #{return_number} marked as SCRAP / FAULTY (not restocked)"
                        )
                        if vri["serial_number"]:
                            cur.execute(
                                "UPDATE serials SET status = 'DEFECTIVE' WHERE serial_number = ?",
                                (vri["serial_number"],)
                            )

            # Update bill balance and customer udhaar balance
            if balance_credited_paisa > 0:
                cur.execute(
                    "UPDATE bills SET balance_paisa = balance_paisa - ? WHERE id = ?",
                    (balance_credited_paisa, original_bill_id)
                )
                if bill["customer_id"]:
                    cur.execute(
                        "UPDATE customers SET balance_paisa = balance_paisa - ?, updated_at = datetime('now', 'localtime') WHERE id = ?",
                        (balance_credited_paisa, bill["customer_id"])
                    )

            log_audit(
                conn, user["id"], user["username"], "PROCESS_RETURN", "RETURN", str(return_id),
                f"Return {return_number} for Bill {bill['bill_number']}: Total refund {format_paisa_to_pkr(total_refund_paisa)} "
                f"(Cancelled balance: {format_paisa_to_pkr(balance_credited_paisa)}, Cash/Method refund: {format_paisa_to_pkr(cash_refunded_paisa)})"
            )

            return {
                "return_id": return_id,
                "return_number": return_number,
                "total_refund_paisa": total_refund_paisa,
                "balance_credited_paisa": balance_credited_paisa,
                "cash_refunded_paisa": cash_refunded_paisa
            }

    def get_bill_detail(self, bill_id: int, user: Dict[str, Any], mark_reprint: bool = False) -> Dict[str, Any]:
        """
        Loads full bill details with items, serials, and payments.
        If mark_reprint is True, increments reprinted_count and logs audit.
        """
        conn = self.db.get_connection()
        try:
            cur = conn.cursor()
            cur.execute(
                """
                SELECT b.*, u.username as cashier_username, u.full_name as cashier_name,
                       c.address as customer_address, c.car_registration, c.car_model
                FROM bills b
                JOIN users u ON b.cashier_id = u.id
                LEFT JOIN customers c ON b.customer_id = c.id
                WHERE b.id = ?
                """,
                (bill_id,)
            )
            bill = cur.fetchone()
            if not bill:
                raise BillingError("Bill not found.", status_code=404)

            bill_dict = dict(bill)

            # Items
            cur.execute("SELECT * FROM bill_items WHERE bill_id = ?", (bill_id,))
            items = []
            for r in cur.fetchall():
                it = dict(r)
                it["serial_numbers"] = json.loads(it["serial_numbers_json"])
                items.append(it)
            bill_dict["items"] = items

            # Payments
            cur.execute("SELECT * FROM payments WHERE reference_type = 'BILL' AND reference_id = ?", (bill_id,))
            bill_dict["payments"] = [dict(p) for p in cur.fetchall()]

            # Amount in words
            bill_dict["total_in_words"] = amount_to_words_pkr(bill_dict["total_paisa"])
            bill_dict["is_duplicate"] = bill_dict["reprinted_count"] > 0

            # If reprinting
            if mark_reprint:
                with self.db.transaction() as write_conn:
                    write_conn.execute("UPDATE bills SET reprinted_count = reprinted_count + 1 WHERE id = ?", (bill_id,))
                    log_audit(write_conn, user["id"], user["username"], "REPRINT_BILL", "BILL", str(bill_id), f"Reprinted copy #{bill_dict['reprinted_count'] + 1}")
                bill_dict["reprinted_count"] += 1
                bill_dict["is_duplicate"] = True

            return bill_dict
        finally:
            conn.close()

    def list_bills(self, limit: int = 50, status: Optional[str] = None, is_quote: bool = False) -> List[Dict[str, Any]]:
        conn = self.db.get_connection()
        try:
            cur = conn.cursor()
            query = """
                SELECT b.id, b.bill_number, b.customer_name, b.customer_phone,
                       b.status, b.total_paisa, b.paid_paisa, b.balance_paisa,
                       b.is_quote, b.is_advance, b.created_at, u.username as cashier_username
                FROM bills b
                JOIN users u ON b.cashier_id = u.id
                WHERE b.is_quote = ?
            """
            params = [1 if is_quote else 0]
            if status:
                query += " AND b.status = ?"
                params.append(status)
            query += " ORDER BY b.created_at DESC LIMIT ?"
            params.append(limit)

            cur.execute(query, tuple(params))
            return [dict(r) for r in cur.fetchall()]
        finally:
            conn.close()

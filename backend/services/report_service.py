"""
PakAudio Retail Management System - Reports Service (Owner Only)
- Daily Summary
- Sales & Margin by Product, Category, and Brand
- Best & Slowest Sellers
- Stock Valuation (at Cost and Retail)
- Customer Udhaar List & Supplier Payables
- Sales by Cashier
- Real Profit: Sales Gross Margin - Returns - Operational Expenses
- CSV generator for all reports
"""
import io
import csv
from datetime import datetime
from typing import Dict, Any, List, Optional
import sqlite3
from backend.auth import PermissionDeniedError
from backend.money import format_paisa_to_pkr

class ReportService:
    def __init__(self, db):
        self.db = db

    def _require_owner(self, user: Dict[str, Any]):
        if user.get("role") != "OWNER":
            raise PermissionDeniedError("view business reports or financial summaries")

    def get_daily_summary(self, user: Dict[str, Any], date_str: Optional[str] = None) -> Dict[str, Any]:
        """Daily summary of sales, payments breakdown, returns, expenses, and net profit."""
        self._require_owner(user)
        date_str = date_str or datetime.now().strftime("%Y-%m-%d")
        start_dt = f"{date_str} 00:00:00"
        end_dt = f"{date_str} 23:59:59"

        conn = self.db.get_connection()
        try:
            cur = conn.cursor()

            # 1. Total Bills & Sales
            cur.execute(
                """
                SELECT COUNT(*) as bills_count,
                       COALESCE(SUM(total_paisa), 0) as total_sales_paisa,
                       COALESCE(SUM(discount_paisa), 0) as total_discounts_paisa,
                       COALESCE(SUM(paid_paisa), 0) as total_collected_paisa,
                       COALESCE(SUM(balance_paisa), 0) as total_new_udhaar_paisa
                FROM bills
                WHERE is_quote = 0 AND created_at BETWEEN ? AND ?
                """,
                (start_dt, end_dt)
            )
            sales_stats = dict(cur.fetchone())

            # 2. Gross Margin (Revenue - Cost of goods sold on bills)
            cur.execute(
                """
                SELECT COALESCE(SUM(bi.quantity * bi.unit_price_paisa - bi.discount_paisa), 0) as revenue_paisa,
                       COALESCE(SUM(bi.quantity * bi.unit_cost_paisa), 0) as cogs_paisa
                FROM bill_items bi
                JOIN bills b ON bi.bill_id = b.id
                WHERE b.is_quote = 0 AND b.created_at BETWEEN ? AND ?
                """,
                (start_dt, end_dt)
            )
            margin_row = cur.fetchone()
            gross_margin_paisa = margin_row["revenue_paisa"] - margin_row["cogs_paisa"]

            # 3. Payments by Method
            cur.execute(
                """
                SELECT payment_method, COALESCE(SUM(amount_paisa), 0) as amount_paisa
                FROM payments
                WHERE reference_type IN ('BILL', 'CUSTOMER_UDHAAR') AND created_at BETWEEN ? AND ?
                GROUP BY payment_method
                """,
                (start_dt, end_dt)
            )
            payments_by_method = {r["payment_method"]: r["amount_paisa"] for r in cur.fetchall()}

            # 4. Returns & Refunds
            cur.execute(
                """
                SELECT COUNT(*) as return_count,
                       COALESCE(SUM(total_refund_paisa), 0) as total_refund_paisa,
                       COALESCE(SUM(cash_refunded_paisa), 0) as cash_refunded_paisa
                FROM returns
                WHERE created_at BETWEEN ? AND ?
                """,
                (start_dt, end_dt)
            )
            returns_stats = dict(cur.fetchone())

            # 5. Expenses
            cur.execute(
                """
                SELECT category, COALESCE(SUM(amount_paisa), 0) as amount_paisa
                FROM expenses
                WHERE created_at BETWEEN ? AND ?
                GROUP BY category
                """,
                (start_dt, end_dt)
            )
            expenses_by_cat = {r["category"]: r["amount_paisa"] for r in cur.fetchall()}
            total_expenses_paisa = sum(expenses_by_cat.values())

            # Real Profit = Gross Margin - Returns (lost revenue/margin) - Expenses
            net_profit_paisa = gross_margin_paisa - returns_stats["total_refund_paisa"] - total_expenses_paisa

            return {
                "date": date_str,
                "sales_stats": sales_stats,
                "gross_margin_paisa": gross_margin_paisa,
                "payments_by_method": payments_by_method,
                "returns_stats": returns_stats,
                "expenses_by_category": expenses_by_cat,
                "total_expenses_paisa": total_expenses_paisa,
                "net_profit_paisa": net_profit_paisa
            }
        finally:
            conn.close()

    def get_stock_valuation(self, user: Dict[str, Any]) -> Dict[str, Any]:
        """Calculates total stock valuation at cost and at retail price."""
        self._require_owner(user)
        conn = self.db.get_connection()
        try:
            cur = conn.cursor()
            cur.execute(
                """
                SELECT * FROM (
                    SELECT 
                        p.id as product_id, p.name as product_name, c.name as category_name, b.name as brand_name,
                        v.id as variant_id, v.sku, v.variant_name, v.cost_paisa, v.retail_price_paisa,
                        COALESCE((SELECT SUM(sm.quantity) FROM stock_movements sm WHERE sm.product_variant_id = v.id), 0) as stock_on_hand
                    FROM product_variants v
                    JOIN products p ON v.product_id = p.id
                    LEFT JOIN categories c ON p.category_id = c.id
                    LEFT JOIN brands b ON p.brand_id = b.id
                    WHERE p.is_service = 0 AND v.is_active = 1
                ) sub
                WHERE sub.stock_on_hand > 0
                ORDER BY sub.product_name ASC
                """
            )
            items = []
            total_cost_paisa = 0
            total_retail_paisa = 0
            total_units = 0

            for r in cur.fetchall():
                qty = r["stock_on_hand"]
                cost_val = qty * r["cost_paisa"]
                retail_val = qty * r["retail_price_paisa"]
                total_cost_paisa += cost_val
                total_retail_paisa += retail_val
                total_units += qty
                items.append({
                    "product_name": r["product_name"],
                    "variant_name": r["variant_name"],
                    "category": r["category_name"] or "",
                    "brand": r["brand_name"] or "",
                    "sku": r["sku"],
                    "quantity": qty,
                    "unit_cost_paisa": r["cost_paisa"],
                    "unit_retail_paisa": r["retail_price_paisa"],
                    "total_cost_paisa": cost_val,
                    "total_retail_paisa": retail_val
                })

            return {
                "total_cost_paisa": total_cost_paisa,
                "total_retail_paisa": total_retail_paisa,
                "potential_profit_paisa": total_retail_paisa - total_cost_paisa,
                "total_units": total_units,
                "items": items
            }
        finally:
            conn.close()

    def get_udhaar_and_payables_report(self, user: Dict[str, Any]) -> Dict[str, Any]:
        """Report of all customers owing Udhaar and all suppliers with payable balances."""
        self._require_owner(user)
        conn = self.db.get_connection()
        try:
            cur = conn.cursor()
            # Customers owing money
            cur.execute(
                """
                SELECT id, name, phone, car_registration, balance_paisa
                FROM customers
                WHERE balance_paisa > 0
                ORDER BY balance_paisa DESC
                """
            )
            customers = [dict(r) for r in cur.fetchall()]
            total_udhaar_receivable_paisa = sum(c["balance_paisa"] for c in customers)

            # Suppliers owed money
            cur.execute(
                """
                SELECT id, name, contact_person, phone, balance_paisa
                FROM suppliers
                WHERE balance_paisa > 0
                ORDER BY balance_paisa DESC
                """
            )
            suppliers = [dict(r) for r in cur.fetchall()]
            total_supplier_payable_paisa = sum(s["balance_paisa"] for s in suppliers)

            return {
                "total_udhaar_receivable_paisa": total_udhaar_receivable_paisa,
                "total_supplier_payable_paisa": total_supplier_payable_paisa,
                "customers_owing": customers,
                "suppliers_payable": suppliers
            }
        finally:
            conn.close()

    def get_cashier_sales_report(self, user: Dict[str, Any], start_date: str, end_date: str) -> List[Dict[str, Any]]:
        """Sales volume and bills count grouped by cashier."""
        self._require_owner(user)
        conn = self.db.get_connection()
        try:
            cur = conn.cursor()
            cur.execute(
                """
                SELECT u.id as cashier_id, u.username, u.full_name,
                       COUNT(b.id) as bills_count,
                       COALESCE(SUM(b.total_paisa), 0) as total_sales_paisa,
                       COALESCE(SUM(b.paid_paisa), 0) as total_collected_paisa,
                       COALESCE(SUM(b.discount_paisa), 0) as total_discounts_paisa
                FROM users u
                LEFT JOIN bills b ON (u.id = b.cashier_id AND b.is_quote = 0 AND b.created_at BETWEEN ? AND ?)
                GROUP BY u.id
                ORDER BY total_sales_paisa DESC
                """,
                (f"{start_date} 00:00:00", f"{end_date} 23:59:59")
            )
            return [dict(r) for r in cur.fetchall()]
        finally:
            conn.close()

    def export_to_csv(self, headers: List[str], rows: List[List[Any]]) -> str:
        """Utility that generates formatted CSV text."""
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(headers)
        for row in rows:
            writer.writerow(row)
        return output.getvalue()

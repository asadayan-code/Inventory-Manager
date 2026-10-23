"""
PakAudio Retail Management System - Local JSON API Handler
Python standard library http.server implementation.
Listens on 127.0.0.1, validates JSON payloads, enforces permissions on backend,
and provides cashier-friendly error messages.
"""
import json
import urllib.parse
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Dict, Any, Optional

from backend.database import get_db
from backend.auth import AuthService, AuthError, PermissionDeniedError, AccountLockedError, log_audit
from backend.money import InvalidMoneyError, format_paisa_to_pkr
from backend.services.catalog_service import CatalogService, CatalogError
from backend.services.stock_service import StockService, StockError
from backend.services.serial_service import SerialService, SerialError
from backend.services.billing_service import BillingService, BillingError, InsufficientStockError, BelowMinPriceError
from backend.services.customer_supplier_service import CustomerSupplierService, EntityError
from backend.services.job_card_service import JobCardService, JobCardError
from backend.services.cash_expense_service import CashExpenseService, CashExpenseError
from backend.services.report_service import ReportService
from backend.services.backup_service import BackupService, BackupError

class ApiRequestHandler(BaseHTTPRequestHandler):
    def __init__(self, *args, db=None, **kwargs):
        self.db = db or get_db()
        self.auth_svc = AuthService(self.db)
        self.catalog_svc = CatalogService(self.db)
        self.stock_svc = StockService(self.db)
        self.serial_svc = SerialService(self.db)
        self.billing_svc = BillingService(self.db)
        self.cust_supp_svc = CustomerSupplierService(self.db)
        self.job_card_svc = JobCardService(self.db)
        self.cash_svc = CashExpenseService(self.db)
        self.report_svc = ReportService(self.db)
        self.backup_svc = BackupService(self.db)
        super().__init__(*args, **kwargs)

    def _send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")

    def do_OPTIONS(self):
        self.send_response(204)
        self._send_cors_headers()
        self.end_headers()

    def _send_json(self, data: Any, status: int = 200):
        body = json.dumps(data, default=str).encode("utf-8")
        self.send_response(status)
        self._send_cors_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_error(self, message: str, status: int = 400):
        self._send_json({"error": message, "status": status}, status=status)

    def _read_json(self) -> Dict[str, Any]:
        content_length = int(self.headers.get("Content-Length", 0))
        if content_length == 0:
            return {}
        try:
            body_bytes = self.rfile.read(content_length)
            return json.loads(body_bytes.decode("utf-8"))
        except Exception as e:
            raise BillingError(f"Malformed JSON request: {str(e)}", status_code=400)

    def _get_current_user(self) -> Optional[Dict[str, Any]]:
        auth_header = self.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:].strip()
            return self.auth_svc.authenticate_token(token)
        return None

    def _require_auth(self) -> Dict[str, Any]:
        user = self._get_current_user()
        if not user:
            raise AuthError("Please log in to continue.", status_code=401)
        return user

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        try:
            # Public health check
            if path == "/api/health":
                self._send_json({"status": "healthy", "service": "pakaudio-pos-api"})
                return

            # All other routes require auth except login
            if path == "/api/auth/me":
                user = self._require_auth()
                self._send_json({"user": user})
                return

            user = self._require_auth()

            # Users
            if path == "/api/users":
                self._send_json({"users": self.auth_svc.list_users(user)})
                return

            # Catalog
            if path == "/api/categories":
                self._send_json({"categories": self.catalog_svc.list_categories()})
                return
            if path == "/api/brands":
                self._send_json({"brands": self.catalog_svc.list_brands()})
                return
            if path == "/api/catalog/search":
                q = query.get("q", [""])[0]
                limit = int(query.get("limit", [50])[0])
                results = self.catalog_svc.search_products(query=q, user_role=user["role"], limit=limit)
                self._send_json({"items": results})
                return
            if path.startswith("/api/catalog/barcode/"):
                barcode = path[len("/api/catalog/barcode/"):]
                item = self.catalog_svc.get_by_barcode(barcode, user_role=user["role"])
                if item:
                    self._send_json({"found": True, "item": item})
                else:
                    self._send_json({"found": False, "barcode": barcode}, status=404)
                return

            # Stock
            if path == "/api/stock/low-stock":
                self._send_json({"items": self.stock_svc.get_low_stock_report()})
                return
            if path == "/api/stock/dead-stock":
                days = int(query.get("days", [60])[0])
                self._send_json({"items": self.stock_svc.get_dead_stock_report(days=days)})
                return
            if path.startswith("/api/stock/history/"):
                variant_id = int(path[len("/api/stock/history/"):])
                history = self.stock_svc.get_stock_movements_history(variant_id)
                self._send_json({"history": history})
                return

            # Serials
            if path.startswith("/api/serials/lookup/"):
                sn = urllib.parse.unquote(path[len("/api/serials/lookup/"):])
                info = self.serial_svc.lookup_serial(sn)
                self._send_json({"serial": info})
                return
            if path == "/api/warranty-claims":
                status = query.get("status", [None])[0]
                self._send_json({"claims": self.serial_svc.list_warranty_claims(status=status)})
                return

            # Billing
            if path == "/api/bills":
                is_quote = query.get("is_quote", ["0"])[0] in ("1", "true")
                status = query.get("status", [None])[0]
                bills = self.billing_svc.list_bills(status=status, is_quote=is_quote)
                self._send_json({"bills": bills})
                return
            if path.startswith("/api/bills/"):
                bill_id = int(path[len("/api/bills/"):])
                reprint = query.get("reprint", ["0"])[0] in ("1", "true")
                bill_detail = self.billing_svc.get_bill_detail(bill_id, user, mark_reprint=reprint)
                self._send_json({"bill": bill_detail})
                return

            # Customers & Suppliers
            if path == "/api/customers":
                q = query.get("q", [""])[0]
                self._send_json({"customers": self.cust_supp_svc.list_customers(query=q)})
                return
            if path.startswith("/api/customers/"):
                cid = int(path[len("/api/customers/"):])
                self._send_json({"customer": self.cust_supp_svc.get_customer(cid)})
                return
            if path == "/api/suppliers":
                self._send_json({"suppliers": self.cust_supp_svc.list_suppliers()})
                return
            if path.startswith("/api/suppliers/"):
                sid = int(path[len("/api/suppliers/"):])
                self._send_json({"supplier": self.cust_supp_svc.get_supplier(sid)})
                return

            # Job Cards
            if path == "/api/job-cards":
                status = query.get("status", [None])[0]
                self._send_json({"job_cards": self.job_card_svc.list_job_cards(status=status)})
                return
            if path.startswith("/api/job-cards/"):
                jid = int(path[len("/api/job-cards/"):])
                self._send_json({"job_card": self.job_card_svc.get_job_card(jid)})
                return

            # Cash & Expenses
            if path == "/api/cash-register/current":
                current_reg = self.cash_svc.get_current_register()
                self._send_json({"register": current_reg})
                return
            if path == "/api/cash-register/expected":
                current_reg = self.cash_svc.get_current_register()
                if not current_reg:
                    self._send_error("No cash register currently open.", status=400)
                    return
                calc = self.cash_svc.calculate_expected_cash(current_reg["id"])
                self._send_json({"calculation": calc})
                return
            if path == "/api/expenses":
                start_date = query.get("start_date", [None])[0]
                end_date = query.get("end_date", [None])[0]
                self._send_json({"expenses": self.cash_svc.list_expenses(start_date, end_date)})
                return

            # Reports (Owner Only)
            if path == "/api/reports/daily":
                date_str = query.get("date", [None])[0]
                self._send_json({"daily_summary": self.report_svc.get_daily_summary(user, date_str)})
                return
            if path == "/api/reports/valuation":
                self._send_json({"valuation": self.report_svc.get_stock_valuation(user)})
                return
            if path == "/api/reports/receivables":
                self._send_json({"receivables": self.report_svc.get_udhaar_and_payables_report(user)})
                return
            if path == "/api/reports/cashiers":
                s_date = query.get("start_date", [datetime.now().strftime("%Y-%m-01")])[0]
                e_date = query.get("end_date", [datetime.now().strftime("%Y-%m-%d")])[0]
                self._send_json({"cashiers": self.report_svc.get_cashier_sales_report(user, s_date, e_date)})
                return
            if path == "/api/reports/audit-log":
                if user.get("role") != "OWNER":
                    raise PermissionDeniedError("view system audit log")
                conn = self.db.get_connection()
                try:
                    cur = conn.cursor()
                    cur.execute("SELECT * FROM audit_log ORDER BY id DESC LIMIT 100")
                    self._send_json({"audit_log": [dict(r) for r in cur.fetchall()]})
                    return
                finally:
                    conn.close()

            # Settings
            if path == "/api/settings":
                conn = self.db.get_connection()
                try:
                    cur = conn.cursor()
                    cur.execute("SELECT key, value FROM settings")
                    settings = {r["key"]: r["value"] for r in cur.fetchall()}
                    self._send_json({"settings": settings})
                    return
                finally:
                    conn.close()

            # Backups
            if path == "/api/backups":
                self._send_json({"backups": self.backup_svc.list_backups()})
                return

            self._send_error(f"Endpoint not found: {path}", status=404)

        except (AuthError, CatalogError, StockError, SerialError, BillingError, EntityError, JobCardError, CashExpenseError, BackupError, InvalidMoneyError) as e:
            status_code = getattr(e, "status_code", 400)
            self._send_error(str(e), status=status_code)
        except Exception as e:
            self._send_error(f"Internal server error: {str(e)}", status=500)

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        try:
            # Login endpoint (Public)
            if path == "/api/auth/login":
                data = self._read_json()
                username = data.get("username", "")
                password = data.get("password", "")
                client_ip = self.client_address[0] if self.client_address else "127.0.0.1"
                result = self.auth_svc.login(username, password, ip_address=client_ip)
                self._send_json(result)
                return

            user = self._require_auth()

            # Logout
            if path == "/api/auth/logout":
                token = self.headers.get("Authorization", "")[7:].strip()
                self.auth_svc.logout(token, user=user)
                self._send_json({"success": True})
                return

            # User Management (Owner)
            if path == "/api/users":
                data = self._read_json()
                new_user = self.auth_svc.create_user(
                    user, data.get("username"), data.get("password"),
                    data.get("full_name"), data.get("role")
                )
                self._send_json(new_user, status=201)
                return
            if path == "/api/users/reset-password":
                data = self._read_json()
                self.auth_svc.reset_password(user, int(data.get("user_id")), data.get("new_password"))
                self._send_json({"success": True, "message": "Password successfully reset."})
                return
            if path == "/api/users/toggle-status":
                data = self._read_json()
                self.auth_svc.toggle_user_active(user, int(data.get("user_id")), bool(data.get("is_active")))
                self._send_json({"success": True})
                return

            # Categories & Brands
            if path == "/api/categories":
                data = self._read_json()
                res = self.catalog_svc.create_category(user, data.get("name"), data.get("description", ""))
                self._send_json(res, status=201)
                return
            if path == "/api/brands":
                data = self._read_json()
                res = self.catalog_svc.create_brand(user, data.get("name"), data.get("description", ""))
                self._send_json(res, status=201)
                return

            # Products & Barcodes
            if path == "/api/products":
                data = self._read_json()
                res = self.catalog_svc.create_product(user, data)
                self._send_json(res, status=201)
                return
            if path == "/api/catalog/attach-barcode":
                data = self._read_json()
                self.catalog_svc.attach_barcode(user, int(data.get("variant_id")), data.get("barcode"))
                self._send_json({"success": True, "message": "Barcode attached successfully."})
                return

            # Stock & Purchases
            if path == "/api/stock/adjust":
                data = self._read_json()
                res = self.stock_svc.manual_adjustment(
                    user, int(data.get("variant_id")), int(data.get("quantity")),
                    data.get("reason"), data.get("note")
                )
                self._send_json(res)
                return
            if path == "/api/purchases":
                data = self._read_json()
                res = self.stock_svc.receive_purchase(user, data)
                self._send_json(res, status=201)
                return
            if path == "/api/stocktake/start":
                data = self._read_json()
                res = self.stock_svc.start_stocktake(user, notes=data.get("notes", ""))
                self._send_json(res, status=201)
                return
            if path == "/api/stocktake/commit":
                data = self._read_json()
                res = self.stock_svc.commit_stocktake(user, int(data.get("stocktake_id")), data.get("counts", []))
                self._send_json(res)
                return

            # Billing
            if path == "/api/bills":
                data = self._read_json()
                res = self.billing_svc.create_bill(user, data)
                self._send_json(res, status=201)
                return
            if path == "/api/bills/convert-quote":
                data = self._read_json()
                res = self.billing_svc.convert_quote_to_bill(user, int(data.get("quote_id")), data.get("payments", []))
                self._send_json(res)
                return
            if path == "/api/returns":
                data = self._read_json()
                res = self.billing_svc.process_return(user, data)
                self._send_json(res, status=201)
                return

            # Serials & Warranty Claims
            if path == "/api/warranty-claims":
                data = self._read_json()
                res = self.serial_svc.create_warranty_claim(user, data)
                self._send_json(res, status=201)
                return
            if path == "/api/warranty-claims/status":
                data = self._read_json()
                res = self.serial_svc.update_claim_status(
                    user, int(data.get("claim_id")), data.get("status"), data.get("notes", "")
                )
                self._send_json(res)
                return

            # Customers & Suppliers
            if path == "/api/customers":
                data = self._read_json()
                res = self.cust_supp_svc.create_customer(user, data)
                self._send_json(res, status=201)
                return
            if path == "/api/customers/pay-udhaar":
                data = self._read_json()
                res = self.cust_supp_svc.receive_customer_udhaar_payment(
                    user, int(data.get("customer_id")), data.get("amount_paisa"),
                    data.get("payment_method", "CASH"), data.get("bill_id"), data.get("notes", "")
                )
                self._send_json(res)
                return
            if path == "/api/suppliers":
                data = self._read_json()
                res = self.cust_supp_svc.create_supplier(user, data)
                self._send_json(res, status=201)
                return
            if path == "/api/suppliers/pay":
                data = self._read_json()
                res = self.cust_supp_svc.pay_supplier(
                    user, int(data.get("supplier_id")), data.get("amount_paisa"),
                    data.get("payment_method", "CASH"), data.get("notes", "")
                )
                self._send_json(res)
                return

            # Job Cards
            if path == "/api/job-cards":
                data = self._read_json()
                res = self.job_card_svc.create_job_card(user, data)
                self._send_json(res, status=201)
                return

            # Cash & Expenses
            if path == "/api/cash-register/open":
                data = self._read_json()
                res = self.cash_svc.open_register(user, data.get("opening_cash_paisa", 0), data.get("notes", ""))
                self._send_json(res)
                return
            if path == "/api/cash-register/close":
                data = self._read_json()
                res = self.cash_svc.close_register(
                    user, int(data.get("register_id")), data.get("counted_cash_paisa", 0), data.get("notes", "")
                )
                self._send_json(res)
                return
            if path == "/api/expenses":
                data = self._read_json()
                res = self.cash_svc.record_expense(user, data)
                self._send_json(res, status=201)
                return

            # Settings
            if path == "/api/settings":
                if user.get("role") != "OWNER":
                    raise PermissionDeniedError("modify store settings")
                data = self._read_json()
                with self.db.transaction() as conn:
                    for k, v in data.items():
                        conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (k, str(v)))
                    log_audit(conn, user["id"], user["username"], "UPDATE_SETTINGS", "SETTINGS", None, "Updated store configuration")
                self._send_json({"success": True})
                return

            # Backups
            if path == "/api/backups/create":
                res = self.backup_svc.perform_backup(user=user, target_dir=self._read_json().get("target_dir"))
                self._send_json(res)
                return
            if path == "/api/backups/restore":
                data = self._read_json()
                res = self.backup_svc.restore_backup(user, data.get("filename"))
                self._send_json(res)
                return

            # Import Catalog
            if path == "/api/import/preview":
                data = self._read_json()
                res = self.backup_svc.preview_catalog_csv(data.get("csv_content", ""))
                self._send_json(res)
                return
            if path == "/api/import/execute":
                if user.get("role") != "OWNER":
                    raise PermissionDeniedError("import catalog data")
                data = self._read_json()
                preview = self.backup_svc.preview_catalog_csv(data.get("csv_content", ""))
                if not preview["valid"]:
                    self._send_error(f"Cannot import CSV with errors: {preview['errors']}", status=400)
                    return
                # Import rows
                imported_count = 0
                for r in preview["preview"]:
                    # Create or find category
                    cat_id = None
                    if r["category"]:
                        cats = self.catalog_svc.list_categories()
                        c_match = next((c for c in cats if c["name"].lower() == r["category"].lower()), None)
                        if c_match:
                            cat_id = c_match["id"]
                        else:
                            cat_id = self.catalog_svc.create_category(user, r["category"])["id"]

                    # Create or find brand
                    brand_id = None
                    if r["brand"]:
                        brands = self.catalog_svc.list_brands()
                        b_match = next((b for b in brands if b["name"].lower() == r["brand"].lower()), None)
                        if b_match:
                            brand_id = b_match["id"]
                        else:
                            brand_id = self.catalog_svc.create_brand(user, r["brand"])["id"]

                    # Create product
                    prod = self.catalog_svc.create_product(user, {
                        "name": r["product_name"],
                        "category_id": cat_id,
                        "brand_id": brand_id,
                        "car_compatibility": r["car_compatibility"],
                        "variants": [{
                            "variant_name": r["variant_name"],
                            "sku": r["sku"],
                            "barcode": r["barcode"],
                            "cost_paisa": r["cost_paisa"],
                            "retail_price_paisa": r["retail_price_paisa"],
                            "wholesale_price_paisa": r["wholesale_price_paisa"],
                            "min_price_paisa": r["min_price_paisa"]
                        }]
                    })
                    # Opening stock
                    if r["opening_stock"] > 0:
                        var_id = prod["variants"][0]["id"]
                        self.stock_svc.manual_adjustment(user, var_id, r["opening_stock"], "COUNT_ADJUSTMENT", "CSV catalog opening stock")
                    imported_count += 1

                self._send_json({"success": True, "imported_count": imported_count})
                return

            self._send_error(f"Endpoint not found: {path}", status=404)

        except (AuthError, CatalogError, StockError, SerialError, BillingError, EntityError, JobCardError, CashExpenseError, BackupError, InvalidMoneyError) as e:
            status_code = getattr(e, "status_code", 400)
            self._send_error(str(e), status=status_code)
        except Exception as e:
            self._send_error(f"Internal server error: {str(e)}", status=500)

    def do_PUT(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        try:
            user = self._require_auth()

            if path.startswith("/api/products/"):
                pid = int(path[len("/api/products/"):])
                data = self._read_json()
                res = self.catalog_svc.update_product(user, pid, data)
                self._send_json(res)
                return

            if path.startswith("/api/job-cards/"):
                jid = int(path[len("/api/job-cards/"):])
                data = self._read_json()
                res = self.job_card_svc.update_job_card(user, jid, data)
                self._send_json(res)
                return

            self._send_error(f"Endpoint not found: {path}", status=404)

        except (AuthError, CatalogError, StockError, SerialError, BillingError, EntityError, JobCardError, CashExpenseError, BackupError, InvalidMoneyError) as e:
            status_code = getattr(e, "status_code", 400)
            self._send_error(str(e), status=status_code)
        except Exception as e:
            self._send_error(f"Internal server error: {str(e)}", status=500)

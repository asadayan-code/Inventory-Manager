"""
PakAudio Retail Management System - Database Engine
SQLite in WAL mode with foreign keys enabled, automatic schema migrations,
and atomic transaction safety for offline power cut resilience.
"""
import os
import sqlite3
import logging
from typing import Generator
from contextlib import contextmanager

logger = logging.getLogger("pakaudio.db")

SCHEMA_VERSION = 1

MIGRATION_V1_SQL = """
-- Schema Migrations Tracking
CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- Users and Auth
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('OWNER', 'CASHIER')),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- User Sessions
CREATE TABLE IF NOT EXISTS user_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT UNIQUE NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- Categories
CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    description TEXT DEFAULT ''
);

-- Brands
CREATE TABLE IF NOT EXISTS brands (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    description TEXT DEFAULT ''
);

-- Products
CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    brand_id INTEGER REFERENCES brands(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    is_service INTEGER NOT NULL DEFAULT 0 CHECK(is_service IN (0, 1)),
    is_bundle INTEGER NOT NULL DEFAULT 0 CHECK(is_bundle IN (0, 1)),
    is_serialized INTEGER NOT NULL DEFAULT 0 CHECK(is_serialized IN (0, 1)),
    warranty_months INTEGER NOT NULL DEFAULT 0,
    image_url TEXT DEFAULT '',
    car_compatibility TEXT DEFAULT '', -- e.g. 'Toyota Corolla 2014-2021, Honda Civic 2016-2022'
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- Product Variants
CREATE TABLE IF NOT EXISTS product_variants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    sku TEXT UNIQUE NOT NULL,
    barcode TEXT UNIQUE,
    variant_name TEXT NOT NULL, -- e.g. 'Standard', 'H4 55W 6000K', '9 inch 4GB+64GB'
    cost_paisa INTEGER NOT NULL CHECK(cost_paisa >= 0),
    retail_price_paisa INTEGER NOT NULL CHECK(retail_price_paisa >= 0),
    wholesale_price_paisa INTEGER NOT NULL CHECK(wholesale_price_paisa >= 0),
    min_price_paisa INTEGER NOT NULL CHECK(min_price_paisa >= 0),
    reorder_level INTEGER NOT NULL DEFAULT 5 CHECK(reorder_level >= 0),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- Bundle Components (for kit products)
CREATE TABLE IF NOT EXISTS bundle_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bundle_variant_id INTEGER NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    component_variant_id INTEGER NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL CHECK(quantity > 0)
);

-- Customers
CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT DEFAULT '',
    address TEXT DEFAULT '',
    car_registration TEXT DEFAULT '',
    car_model TEXT DEFAULT '',
    customer_type TEXT NOT NULL DEFAULT 'RETAIL' CHECK(customer_type IN ('RETAIL', 'WHOLESALE')),
    balance_paisa INTEGER NOT NULL DEFAULT 0, -- running udhaar balance in paisa
    notes TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- Suppliers
CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    contact_person TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    address TEXT DEFAULT '',
    balance_paisa INTEGER NOT NULL DEFAULT 0, -- what shop owes supplier in paisa
    notes TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- Stock Movements (Ledger of all stock changes)
CREATE TABLE IF NOT EXISTS stock_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_variant_id INTEGER NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL, -- positive for additions, negative for deductions
    movement_type TEXT NOT NULL CHECK(movement_type IN (
        'RECEIVE', 'SALE', 'RETURN_RESTOCK', 'RETURN_SCRAP', 
        'DAMAGE', 'THEFT', 'COUNT_ADJUSTMENT', 'BUNDLE_COMPONENT_SALE', 'BUNDLE_COMPONENT_RETURN'
    )),
    reference_type TEXT NOT NULL, -- 'BILL', 'PURCHASE', 'RETURN', 'STOCKTAKE', 'MANUAL_ADJUST'
    reference_id INTEGER,
    unit_cost_paisa INTEGER NOT NULL DEFAULT 0 CHECK(unit_cost_paisa >= 0),
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- Serial Numbers Tracking
CREATE TABLE IF NOT EXISTS serials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_variant_id INTEGER NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
    serial_number TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'IN_STOCK' CHECK(status IN (
        'IN_STOCK', 'SOLD', 'DEFECTIVE', 'RETURNED_TO_SUPPLIER', 'REPLACED'
    )),
    current_bill_id INTEGER REFERENCES bills(id) ON DELETE SET NULL,
    supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
    purchase_id INTEGER REFERENCES purchases(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- Purchases / Goods Received
CREATE TABLE IF NOT EXISTS purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    po_number TEXT UNIQUE NOT NULL,
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    invoice_number TEXT NOT NULL,
    invoice_date TEXT NOT NULL,
    total_amount_paisa INTEGER NOT NULL CHECK(total_amount_paisa >= 0),
    paid_amount_paisa INTEGER NOT NULL DEFAULT 0 CHECK(paid_amount_paisa >= 0),
    payment_method TEXT DEFAULT 'CASH',
    status TEXT NOT NULL DEFAULT 'RECEIVED' CHECK(status IN ('RECEIVED', 'PARTIAL', 'ORDERED')),
    notes TEXT DEFAULT '',
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- Purchase Items
CREATE TABLE IF NOT EXISTS purchase_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
    product_variant_id INTEGER NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL CHECK(quantity > 0),
    unit_cost_paisa INTEGER NOT NULL CHECK(unit_cost_paisa >= 0),
    line_total_paisa INTEGER NOT NULL CHECK(line_total_paisa >= 0),
    batch_number TEXT DEFAULT '',
    expiry_date TEXT DEFAULT ''
);

-- Bills / Sales Invoices & Quotations
CREATE TABLE IF NOT EXISTS bills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bill_number TEXT UNIQUE NOT NULL, -- e.g. INV-20261022-0001
    customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
    customer_name TEXT NOT NULL,
    customer_phone TEXT DEFAULT '',
    cashier_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'COMPLETED' CHECK(status IN ('COMPLETED', 'HOLD', 'CANCELLED', 'RETURNED')),
    subtotal_paisa INTEGER NOT NULL CHECK(subtotal_paisa >= 0),
    discount_paisa INTEGER NOT NULL DEFAULT 0 CHECK(discount_paisa >= 0),
    tax_rate_percent INTEGER NOT NULL DEFAULT 0 CHECK(tax_rate_percent >= 0),
    tax_paisa INTEGER NOT NULL DEFAULT 0 CHECK(tax_paisa >= 0),
    total_paisa INTEGER NOT NULL CHECK(total_paisa >= 0),
    paid_paisa INTEGER NOT NULL DEFAULT 0 CHECK(paid_paisa >= 0),
    balance_paisa INTEGER NOT NULL DEFAULT 0, -- positive means customer owes udhaar
    payment_methods_json TEXT NOT NULL DEFAULT '[]', -- breakdown e.g. [{"method": "CASH", "amount_paisa": 100000}]
    is_quote INTEGER NOT NULL DEFAULT 0 CHECK(is_quote IN (0, 1)),
    quote_validity_date TEXT,
    is_advance INTEGER NOT NULL DEFAULT 0 CHECK(is_advance IN (0, 1)),
    notes TEXT DEFAULT '',
    reprinted_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- Bill Items (Historical snapshot of prices, cost, warranty at sale time)
CREATE TABLE IF NOT EXISTS bill_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bill_id INTEGER NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
    product_variant_id INTEGER REFERENCES product_variants(id) ON DELETE SET NULL,
    is_service INTEGER NOT NULL DEFAULT 0 CHECK(is_service IN (0, 1)),
    is_bundle INTEGER NOT NULL DEFAULT 0 CHECK(is_bundle IN (0, 1)),
    sku TEXT NOT NULL,
    name TEXT NOT NULL,
    variant_name TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK(quantity > 0),
    unit_cost_paisa INTEGER NOT NULL CHECK(unit_cost_paisa >= 0),
    unit_retail_paisa INTEGER NOT NULL CHECK(unit_retail_paisa >= 0),
    unit_min_paisa INTEGER NOT NULL CHECK(unit_min_paisa >= 0),
    unit_price_paisa INTEGER NOT NULL CHECK(unit_price_paisa >= 0),
    discount_paisa INTEGER NOT NULL DEFAULT 0 CHECK(discount_paisa >= 0),
    line_total_paisa INTEGER NOT NULL CHECK(line_total_paisa >= 0),
    warranty_months INTEGER NOT NULL DEFAULT 0 CHECK(warranty_months >= 0),
    serial_numbers_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- Payments (Bill payments, Udhaar debt settlement, Supplier payables)
CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reference_type TEXT NOT NULL CHECK(reference_type IN ('BILL', 'CUSTOMER_UDHAAR', 'SUPPLIER_PAYABLE', 'PURCHASE')),
    reference_id INTEGER,
    customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
    supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
    amount_paisa INTEGER NOT NULL CHECK(amount_paisa > 0),
    payment_method TEXT NOT NULL CHECK(payment_method IN ('CASH', 'CARD', 'BANK_TRANSFER', 'JAZZCASH', 'EASYPAISA')),
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    notes TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- Returns and Refunds
CREATE TABLE IF NOT EXISTS returns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    return_number TEXT UNIQUE NOT NULL,
    original_bill_id INTEGER NOT NULL REFERENCES bills(id) ON DELETE RESTRICT,
    customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    total_refund_paisa INTEGER NOT NULL CHECK(total_refund_paisa >= 0),
    balance_credited_paisa INTEGER NOT NULL DEFAULT 0 CHECK(balance_credited_paisa >= 0),
    cash_refunded_paisa INTEGER NOT NULL DEFAULT 0 CHECK(cash_refunded_paisa >= 0),
    refund_method TEXT NOT NULL DEFAULT 'CASH',
    reason TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- Return Items
CREATE TABLE IF NOT EXISTS return_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    return_id INTEGER NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
    bill_item_id INTEGER NOT NULL REFERENCES bill_items(id) ON DELETE RESTRICT,
    product_variant_id INTEGER REFERENCES product_variants(id) ON DELETE SET NULL,
    quantity INTEGER NOT NULL CHECK(quantity > 0),
    unit_price_paisa INTEGER NOT NULL CHECK(unit_price_paisa >= 0),
    line_refund_paisa INTEGER NOT NULL CHECK(line_refund_paisa >= 0),
    restock_action TEXT NOT NULL CHECK(restock_action IN ('RESTOCK', 'SCRAP')),
    serial_number TEXT DEFAULT '',
    note TEXT DEFAULT ''
);

-- Warranty Claims
CREATE TABLE IF NOT EXISTS warranty_claims (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    claim_number TEXT UNIQUE NOT NULL,
    serial_number TEXT NOT NULL,
    product_variant_id INTEGER NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
    original_bill_id INTEGER REFERENCES bills(id) ON DELETE SET NULL,
    customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
    issue_description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'RECEIVED' CHECK(status IN (
        'RECEIVED', 'SENT_TO_SUPPLIER', 'REPAIRED', 'REPLACED', 'REJECTED', 'RETURNED_TO_CUSTOMER'
    )),
    supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    notes TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- Installation Job Cards
CREATE TABLE IF NOT EXISTS job_cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_number TEXT UNIQUE NOT NULL,
    car_make TEXT NOT NULL,
    car_model TEXT NOT NULL,
    car_year TEXT NOT NULL,
    car_registration TEXT NOT NULL,
    customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
    customer_name TEXT NOT NULL,
    customer_phone TEXT DEFAULT '',
    technician_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'BILLED')),
    bill_id INTEGER REFERENCES bills(id) ON DELETE SET NULL,
    work_description TEXT NOT NULL,
    parts_used_json TEXT NOT NULL DEFAULT '[]', -- array of {variant_id, name, quantity, price_paisa}
    labour_charge_paisa INTEGER NOT NULL DEFAULT 0 CHECK(labour_charge_paisa >= 0),
    notes TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- Expenses
CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL CHECK(category IN (
        'RENT', 'ELECTRICITY', 'SALARY', 'TEA_SNACKS', 'TRANSPORT', 'MAINTENANCE', 'OTHER'
    )),
    amount_paisa INTEGER NOT NULL CHECK(amount_paisa > 0),
    payment_method TEXT NOT NULL DEFAULT 'CASH',
    recipient TEXT NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    notes TEXT DEFAULT '',
    expense_date TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- Cash Register Sessions
CREATE TABLE IF NOT EXISTS cash_registers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    opening_time TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    closing_time TEXT,
    opened_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    closed_by_user_id INTEGER REFERENCES users(id) ON DELETE RESTRICT,
    opening_cash_paisa INTEGER NOT NULL CHECK(opening_cash_paisa >= 0),
    expected_cash_paisa INTEGER DEFAULT 0,
    counted_cash_paisa INTEGER DEFAULT 0,
    difference_paisa INTEGER DEFAULT 0,
    notes TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN', 'CLOSED'))
);

-- Stocktake (Physical count)
CREATE TABLE IF NOT EXISTS stocktakes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    count_date TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT', 'COMMITTED')),
    notes TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- Stocktake Items
CREATE TABLE IF NOT EXISTS stocktake_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stocktake_id INTEGER NOT NULL REFERENCES stocktakes(id) ON DELETE CASCADE,
    product_variant_id INTEGER NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
    system_quantity INTEGER NOT NULL,
    counted_quantity INTEGER NOT NULL,
    difference INTEGER NOT NULL,
    unit_cost_paisa INTEGER NOT NULL DEFAULT 0
);

-- Settings Table
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Audit Log (Rule 7: Every important action written to audit log with who did it)
CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    username TEXT NOT NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    details TEXT NOT NULL DEFAULT '',
    ip_address TEXT DEFAULT '127.0.0.1',
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- Indexes for lightning fast lookups
CREATE INDEX IF NOT EXISTS idx_product_variants_sku ON product_variants(sku);
CREATE INDEX IF NOT EXISTS idx_product_variants_barcode ON product_variants(barcode);
CREATE INDEX IF NOT EXISTS idx_stock_movements_variant ON stock_movements(product_variant_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_type ON stock_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_serials_serial ON serials(serial_number);
CREATE INDEX IF NOT EXISTS idx_serials_variant ON serials(product_variant_id);
CREATE INDEX IF NOT EXISTS idx_bills_number ON bills(bill_number);
CREATE INDEX IF NOT EXISTS idx_bills_customer ON bills(customer_id);
CREATE INDEX IF NOT EXISTS idx_bills_created ON bills(created_at);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
"""

DEFAULT_SETTINGS = {
    "shop_name": "Sohail Autos Car & Audio Accessories",
    "shop_address": "Shop #14, Audio Plaza, Montgomery Road, Lahore",
    "shop_phone": "0300-1234567 / 042-37210000",
    "tax_rate_percent": "0",
    "invoice_footer": "Thank you for your business! Goods once sold can be returned or exchanged within 3 days with original bill.",
    "warranty_terms": "1 Year Official Warranty on Head Units & Amplifiers. No warranty on blown speakers or physical damage.",
    "cashier_discount_limit_percent": "5",
    "barcode_label_layout": "3x10",  # 3x10 or 4x13
    "scan_sound_enabled": "true",
    "scan_auto_increment": "true"
}

class _ConnectionProxy:
    def __init__(self, conn):
        self._conn = conn
    def close(self):
        pass  # In-memory connection must remain open
    def __getattr__(self, name):
        return getattr(self._conn, name)

class Database:
    def __init__(self, db_path: str = "pakaudio.db"):
        self.db_path = db_path
        self._mem_conn = None
        self._ensure_dir()
        self.init_db()

    def _ensure_dir(self):
        if self.db_path != ":memory:":
            os.makedirs(os.path.dirname(os.path.abspath(self.db_path)), exist_ok=True)

    def get_connection(self) -> sqlite3.Connection:
        if self.db_path == ":memory:":
            if self._mem_conn is None:
                raw_conn = sqlite3.connect(
                    ":memory:",
                    timeout=30.0,
                    check_same_thread=False,
                    isolation_level=None
                )
                raw_conn.row_factory = sqlite3.Row
                raw_conn.execute("PRAGMA foreign_keys = ON;")
                self._mem_conn = _ConnectionProxy(raw_conn)
            return self._mem_conn

        conn = sqlite3.connect(
            self.db_path,
            timeout=30.0,
            check_same_thread=False,
            isolation_level=None  # Explicit transaction management
        )
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode = WAL;")
        conn.execute("PRAGMA synchronous = NORMAL;")
        conn.execute("PRAGMA foreign_keys = ON;")
        return conn

    @contextmanager
    def transaction(self) -> Generator[sqlite3.Connection, None, None]:
        """Provides an atomic, all-or-nothing transaction context manager."""
        conn = self.get_connection()
        conn.execute("BEGIN IMMEDIATE")
        try:
            yield conn
            conn.execute("COMMIT")
        except Exception:
            try:
                conn.execute("ROLLBACK")
            except Exception:
                pass
            raise
        finally:
            if self.db_path != ":memory:":
                conn.close()

    def execute_query(self, sql: str, params: tuple = ()) -> list[sqlite3.Row]:
        conn = self.get_connection()
        try:
            cur = conn.cursor()
            cur.execute(sql, params)
            return cur.fetchall()
        finally:
            if self.db_path != ":memory:":
                conn.close()

    def check_integrity(self) -> bool:
        """Runs PRAGMA integrity_check to verify database health."""
        conn = self.get_connection()
        try:
            res = conn.execute("PRAGMA integrity_check;").fetchall()
            if res and res[0][0] == "ok":
                return True
            logger.error(f"Integrity check failed: {res}")
            return False
        finally:
            if self.db_path != ":memory:":
                conn.close()

    def init_db(self):
        """Runs migrations and initializes defaults."""
        conn = self.get_connection()
        try:
            # executescript manages its own transaction and executes all statements
            conn.executescript(MIGRATION_V1_SQL)
            conn.execute("INSERT OR REPLACE INTO schema_migrations (version) VALUES (1);")
            for k, v in DEFAULT_SETTINGS.items():
                conn.execute("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?);", (k, v))
        finally:
            if self.db_path != ":memory:":
                conn.close()

# Singleton instance for standard app use
_default_db = None

def get_db(db_path: str = "data/pakaudio.db") -> Database:
    global _default_db
    if _default_db is None or _default_db.db_path != db_path:
        _default_db = Database(db_path)
    return _default_db

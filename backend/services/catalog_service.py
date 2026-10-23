"""
PakAudio Retail Management System - Catalog Service
Manages Categories, Brands, Products, Variants, Bundles, Services, and Car Compatibility.
"""
import random
import json
from typing import Dict, Any, List, Optional
import sqlite3
from backend.money import require_paisa, paisa_from_pkr_str
from backend.auth import log_audit, PermissionDeniedError

class CatalogError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code

def generate_unique_barcode(conn: sqlite3.Connection, prefix: str = "28") -> str:
    """Generates an internal 13-digit EAN-13 compatible barcode with valid check digit."""
    while True:
        # 12 digits (2-digit prefix + 10 random digits)
        base = f"{prefix}{random.randint(1000000000, 9999999999)}"
        # Calculate EAN-13 check digit
        s_even = sum(int(base[i]) for i in range(1, 12, 2)) * 3
        s_odd = sum(int(base[i]) for i in range(0, 12, 2))
        check_digit = (10 - ((s_even + s_odd) % 10)) % 10
        barcode = f"{base}{check_digit}"

        cur = conn.cursor()
        cur.execute("SELECT id FROM product_variants WHERE barcode = ?", (barcode,))
        if not cur.fetchone():
            return barcode

class CatalogService:
    def __init__(self, db):
        self.db = db

    def list_categories(self) -> List[Dict[str, Any]]:
        conn = self.db.get_connection()
        try:
            cur = conn.cursor()
            cur.execute("SELECT id, name, description FROM categories ORDER BY name ASC")
            return [dict(r) for r in cur.fetchall()]
        finally:
            conn.close()

    def create_category(self, user: Dict[str, Any], name: str, description: str = "") -> Dict[str, Any]:
        if user.get("role") != "OWNER":
            raise PermissionDeniedError("create categories")
        name = name.strip()
        if not name:
            raise CatalogError("Category name cannot be empty.")
        with self.db.transaction() as conn:
            cur = conn.cursor()
            try:
                cur.execute("INSERT INTO categories (name, description) VALUES (?, ?)", (name, description.strip()))
                new_id = cur.lastrowid
                log_audit(conn, user["id"], user["username"], "CREATE_CATEGORY", "CATEGORY", str(new_id), f"Name: {name}")
                return {"id": new_id, "name": name, "description": description.strip()}
            except sqlite3.IntegrityError:
                raise CatalogError(f"Category '{name}' already exists.")

    def list_brands(self) -> List[Dict[str, Any]]:
        conn = self.db.get_connection()
        try:
            cur = conn.cursor()
            cur.execute("SELECT id, name, description FROM brands ORDER BY name ASC")
            return [dict(r) for r in cur.fetchall()]
        finally:
            conn.close()

    def create_brand(self, user: Dict[str, Any], name: str, description: str = "") -> Dict[str, Any]:
        if user.get("role") != "OWNER":
            raise PermissionDeniedError("create brands")
        name = name.strip()
        if not name:
            raise CatalogError("Brand name cannot be empty.")
        with self.db.transaction() as conn:
            cur = conn.cursor()
            try:
                cur.execute("INSERT INTO brands (name, description) VALUES (?, ?)", (name, description.strip()))
                new_id = cur.lastrowid
                log_audit(conn, user["id"], user["username"], "CREATE_BRAND", "BRAND", str(new_id), f"Name: {name}")
                return {"id": new_id, "name": name, "description": description.strip()}
            except sqlite3.IntegrityError:
                raise CatalogError(f"Brand '{name}' already exists.")

    def create_product(self, user: Dict[str, Any], data: Dict[str, Any]) -> Dict[str, Any]:
        """Creates a product along with one or more variants."""
        if user.get("role") != "OWNER":
            raise PermissionDeniedError("create or edit products")

        name = data.get("name", "").strip()
        if not name:
            raise CatalogError("Product name is required.")

        category_id = data.get("category_id")
        brand_id = data.get("brand_id")
        description = data.get("description", "").strip()
        is_service = 1 if data.get("is_service") else 0
        is_bundle = 1 if data.get("is_bundle") else 0
        is_serialized = 1 if data.get("is_serialized") else 0
        warranty_months = int(data.get("warranty_months", 0))
        image_url = data.get("image_url", "").strip()
        car_compatibility = data.get("car_compatibility", "").strip()

        variants_data = data.get("variants", [])
        if not variants_data:
            raise CatalogError("Product must have at least one variant (e.g. Standard, H4, 9-inch).")

        with self.db.transaction() as conn:
            cur = conn.cursor()
            cur.execute(
                """
                INSERT INTO products (
                    category_id, brand_id, name, description, is_service,
                    is_bundle, is_serialized, warranty_months, image_url, car_compatibility
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (category_id, brand_id, name, description, is_service, is_bundle,
                 is_serialized, warranty_months, image_url, car_compatibility)
            )
            product_id = cur.lastrowid

            created_variants = []
            for v in variants_data:
                sku = v.get("sku", "").strip()
                if not sku:
                    sku = f"SKU-{product_id}-{random.randint(1000, 9999)}"

                barcode = v.get("barcode", "").strip()
                if not barcode:
                    barcode = generate_unique_barcode(conn)
                else:
                    # Check barcode uniqueness
                    cur.execute("SELECT id FROM product_variants WHERE barcode = ?", (barcode,))
                    if cur.fetchone():
                        raise CatalogError(f"Barcode '{barcode}' is already in use by another product or variant.")

                # Cost and prices in integer paisa
                cost_paisa = require_paisa(v.get("cost_paisa", 0))
                retail_paisa = require_paisa(v.get("retail_price_paisa", 0))
                wholesale_paisa = require_paisa(v.get("wholesale_price_paisa", retail_paisa))
                min_paisa = require_paisa(v.get("min_price_paisa", cost_paisa))
                reorder_level = int(v.get("reorder_level", 5))
                variant_name = v.get("variant_name", "Standard").strip()

                try:
                    cur.execute(
                        """
                        INSERT INTO product_variants (
                            product_id, sku, barcode, variant_name, cost_paisa,
                            retail_price_paisa, wholesale_price_paisa, min_price_paisa, reorder_level
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (product_id, sku, barcode, variant_name, cost_paisa, retail_paisa, wholesale_paisa, min_paisa, reorder_level)
                    )
                except sqlite3.IntegrityError as e:
                    raise CatalogError(f"Cannot save variant: SKU '{sku}' or barcode '{barcode}' already exists.")

                variant_id = cur.lastrowid

                # If this variant is a bundle, save bundle items
                if is_bundle and "bundle_items" in v:
                    for bi in v["bundle_items"]:
                        comp_var_id = bi.get("component_variant_id")
                        qty = int(bi.get("quantity", 1))
                        if qty <= 0:
                            raise CatalogError("Bundle component quantity must be greater than zero.")
                        cur.execute(
                            "INSERT INTO bundle_items (bundle_variant_id, component_variant_id, quantity) VALUES (?, ?, ?)",
                            (variant_id, comp_var_id, qty)
                        )

                created_variants.append({
                    "id": variant_id,
                    "sku": sku,
                    "barcode": barcode,
                    "variant_name": variant_name,
                    "cost_paisa": cost_paisa,
                    "retail_price_paisa": retail_paisa,
                    "wholesale_price_paisa": wholesale_paisa,
                    "min_price_paisa": min_paisa,
                    "reorder_level": reorder_level
                })

            log_audit(conn, user["id"], user["username"], "CREATE_PRODUCT", "PRODUCT", str(product_id), f"Name: {name}, Variants: {len(created_variants)}")

            return {
                "id": product_id,
                "name": name,
                "category_id": category_id,
                "brand_id": brand_id,
                "is_service": is_service,
                "is_bundle": is_bundle,
                "is_serialized": is_serialized,
                "warranty_months": warranty_months,
                "car_compatibility": car_compatibility,
                "variants": created_variants
            }

    def update_product(self, user: Dict[str, Any], product_id: int, data: Dict[str, Any]) -> Dict[str, Any]:
        """Updates product information and variants."""
        if user.get("role") != "OWNER":
            raise PermissionDeniedError("modify products")

        with self.db.transaction() as conn:
            cur = conn.cursor()
            cur.execute("SELECT id FROM products WHERE id = ?", (product_id,))
            if not cur.fetchone():
                raise CatalogError("Product not found.", status_code=404)

            name = data.get("name", "").strip()
            if not name:
                raise CatalogError("Product name is required.")

            category_id = data.get("category_id")
            brand_id = data.get("brand_id")
            description = data.get("description", "").strip()
            is_service = 1 if data.get("is_service") else 0
            is_bundle = 1 if data.get("is_bundle") else 0
            is_serialized = 1 if data.get("is_serialized") else 0
            warranty_months = int(data.get("warranty_months", 0))
            image_url = data.get("image_url", "").strip()
            car_compatibility = data.get("car_compatibility", "").strip()

            cur.execute(
                """
                UPDATE products SET
                    category_id = ?, brand_id = ?, name = ?, description = ?,
                    is_service = ?, is_bundle = ?, is_serialized = ?,
                    warranty_months = ?, image_url = ?, car_compatibility = ?,
                    updated_at = datetime('now', 'localtime')
                WHERE id = ?
                """,
                (category_id, brand_id, name, description, is_service, is_bundle,
                 is_serialized, warranty_months, image_url, car_compatibility, product_id)
            )

            # Update existing variants or add new ones
            for v in data.get("variants", []):
                var_id = v.get("id")
                sku = v.get("sku", "").strip()
                barcode = v.get("barcode", "").strip()
                variant_name = v.get("variant_name", "Standard").strip()
                cost_paisa = require_paisa(v.get("cost_paisa", 0))
                retail_paisa = require_paisa(v.get("retail_price_paisa", 0))
                wholesale_paisa = require_paisa(v.get("wholesale_price_paisa", retail_paisa))
                min_paisa = require_paisa(v.get("min_price_paisa", cost_paisa))
                reorder_level = int(v.get("reorder_level", 5))
                is_active = 1 if v.get("is_active", True) else 0

                if var_id:
                    # Check barcode uniqueness
                    if barcode:
                        cur.execute("SELECT id FROM product_variants WHERE barcode = ? AND id != ?", (barcode, var_id))
                        if cur.fetchone():
                            raise CatalogError(f"Barcode '{barcode}' is already in use by another variant.")
                    cur.execute(
                        """
                        UPDATE product_variants SET
                            sku = ?, barcode = ?, variant_name = ?, cost_paisa = ?,
                            retail_price_paisa = ?, wholesale_price_paisa = ?,
                            min_price_paisa = ?, reorder_level = ?, is_active = ?,
                            updated_at = datetime('now', 'localtime')
                        WHERE id = ? AND product_id = ?
                        """,
                        (sku, barcode, variant_name, cost_paisa, retail_paisa, wholesale_paisa, min_paisa, reorder_level, is_active, var_id, product_id)
                    )
                else:
                    if not barcode:
                        barcode = generate_unique_barcode(conn)
                    cur.execute(
                        """
                        INSERT INTO product_variants (
                            product_id, sku, barcode, variant_name, cost_paisa,
                            retail_price_paisa, wholesale_price_paisa, min_price_paisa, reorder_level, is_active
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (product_id, sku, barcode, variant_name, cost_paisa, retail_paisa, wholesale_paisa, min_paisa, reorder_level, is_active)
                    )

            log_audit(conn, user["id"], user["username"], "UPDATE_PRODUCT", "PRODUCT", str(product_id), f"Updated {name}")
            return {"success": True, "product_id": product_id}

    def attach_barcode(self, user: Dict[str, Any], variant_id: int, barcode: str) -> bool:
        """One-click attach barcode when scanner scans an unattached barcode."""
        barcode = barcode.strip()
        if not barcode:
            raise CatalogError("Barcode cannot be empty.")

        with self.db.transaction() as conn:
            cur = conn.cursor()
            cur.execute("SELECT id FROM product_variants WHERE barcode = ?", (barcode,))
            existing = cur.fetchone()
            if existing:
                raise CatalogError(f"Barcode '{barcode}' is already assigned to variant #{existing[0]}.")

            cur.execute("SELECT id, product_id, sku FROM product_variants WHERE id = ?", (variant_id,))
            target = cur.fetchone()
            if not target:
                raise CatalogError("Target variant not found.", status_code=404)

            cur.execute("UPDATE product_variants SET barcode = ? WHERE id = ?", (barcode, variant_id))
            log_audit(conn, user["id"], user["username"], "ATTACH_BARCODE", "PRODUCT_VARIANT", str(variant_id), f"Attached barcode {barcode} to SKU {target['sku']}")
            return True

    def search_products(self, query: str = "", user_role: str = "CASHIER", limit: int = 50) -> List[Dict[str, Any]]:
        """
        Fast multi-field search across product name, brand, SKU, barcode, car compatibility.
        Cashier rule: Cost price and wholesale price are strictly hidden from CASHIER.
        """
        conn = self.db.get_connection()
        try:
            cur = conn.cursor()
            q = f"%{query.strip().lower()}%" if query else "%"

            cur.execute(
                """
                SELECT 
                    p.id as product_id, p.name as product_name, p.description,
                    p.is_service, p.is_bundle, p.is_serialized, p.warranty_months,
                    p.image_url, p.car_compatibility,
                    c.name as category_name, b.name as brand_name,
                    v.id as variant_id, v.sku, v.barcode, v.variant_name,
                    v.cost_paisa, v.retail_price_paisa, v.wholesale_price_paisa, v.min_price_paisa,
                    v.reorder_level, v.is_active,
                    COALESCE((SELECT SUM(sm.quantity) FROM stock_movements sm WHERE sm.product_variant_id = v.id), 0) as stock_on_hand
                FROM product_variants v
                JOIN products p ON v.product_id = p.id
                LEFT JOIN categories c ON p.category_id = c.id
                LEFT JOIN brands b ON p.brand_id = b.id
                WHERE (
                    v.barcode = ? OR
                    LOWER(p.name) LIKE ? OR
                    LOWER(b.name) LIKE ? OR
                    LOWER(c.name) LIKE ? OR
                    LOWER(v.sku) LIKE ? OR
                    LOWER(v.variant_name) LIKE ? OR
                    LOWER(p.car_compatibility) LIKE ?
                )
                ORDER BY p.name ASC, v.variant_name ASC
                LIMIT ?
                """,
                (query.strip(), q, q, q, q, q, q, limit)
            )

            results = []
            for r in cur.fetchall():
                item = {
                    "product_id": r["product_id"],
                    "product_name": r["product_name"],
                    "category_name": r["category_name"] or "",
                    "brand_name": r["brand_name"] or "",
                    "is_service": bool(r["is_service"]),
                    "is_bundle": bool(r["is_bundle"]),
                    "is_serialized": bool(r["is_serialized"]),
                    "warranty_months": r["warranty_months"],
                    "car_compatibility": r["car_compatibility"] or "",
                    "image_url": r["image_url"] or "",
                    "variant_id": r["variant_id"],
                    "sku": r["sku"],
                    "barcode": r["barcode"] or "",
                    "variant_name": r["variant_name"],
                    "retail_price_paisa": r["retail_price_paisa"],
                    "min_price_paisa": r["min_price_paisa"],
                    "stock_on_hand": r["stock_on_hand"] if not r["is_service"] else 999999,
                    "is_active": bool(r["is_active"])
                }
                # Cashier Rule: Cost and Wholesale prices hidden from Cashier!
                if user_role == "OWNER":
                    item["cost_paisa"] = r["cost_paisa"]
                    item["wholesale_price_paisa"] = r["wholesale_price_paisa"]
                    item["reorder_level"] = r["reorder_level"]

                # If bundle, fetch components
                if r["is_bundle"]:
                    cur.execute(
                        """
                        SELECT bi.quantity, pv.sku, p2.name as comp_name, pv.variant_name as comp_variant,
                               COALESCE((SELECT SUM(sm.quantity) FROM stock_movements sm WHERE sm.product_variant_id = pv.id), 0) as comp_stock
                        FROM bundle_items bi
                        JOIN product_variants pv ON bi.component_variant_id = pv.id
                        JOIN products p2 ON pv.product_id = p2.id
                        WHERE bi.bundle_variant_id = ?
                        """,
                        (r["variant_id"],)
                    )
                    item["bundle_components"] = [dict(c) for c in cur.fetchall()]

                results.append(item)

            return results
        finally:
            conn.close()

    def get_by_barcode(self, barcode: str, user_role: str = "CASHIER") -> Optional[Dict[str, Any]]:
        """Exact lookup by barcode for the barcode scanner."""
        matches = self.search_products(query=barcode.strip(), user_role=user_role, limit=5)
        for m in matches:
            if m["barcode"] == barcode.strip():
                return m
        return None

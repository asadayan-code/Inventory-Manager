"""
Unit tests for Database migrations, schema constraints, WAL integrity, and power-cut safety.
"""
import unittest
import tempfile
import os
import sqlite3
from backend.database import Database

class TestDatabaseMigrations(unittest.TestCase):
    def test_wal_mode_and_foreign_keys_on_disk(self):
        with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
            temp_path = tf.name

        try:
            db = Database(temp_path)
            conn = db.get_connection()
            try:
                # Check WAL mode
                cur = conn.cursor()
                cur.execute("PRAGMA journal_mode;")
                journal_mode = cur.fetchone()[0]
                self.assertEqual(journal_mode.lower(), "wal")

                # Check foreign keys
                cur.execute("PRAGMA foreign_keys;")
                fk = cur.fetchone()[0]
                self.assertEqual(fk, 1)

                # Check integrity
                self.assertTrue(db.check_integrity())

                # Check schema migration table
                cur.execute("SELECT version FROM schema_migrations WHERE version = 1;")
                self.assertIsNotNone(cur.fetchone())
            finally:
                conn.close()
        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)
            wal_file = f"{temp_path}-wal"
            if os.path.exists(wal_file):
                os.remove(wal_file)
            shm_file = f"{temp_path}-shm"
            if os.path.exists(shm_file):
                os.remove(shm_file)

    def test_foreign_key_violation_rejected(self):
        db = Database(":memory:")
        with self.assertRaises(sqlite3.IntegrityError):
            with db.transaction() as conn:
                # Insert product_variant referencing non-existent product ID 999999
                conn.execute(
                    """
                    INSERT INTO product_variants (
                        product_id, sku, variant_name, cost_paisa,
                        retail_price_paisa, wholesale_price_paisa, min_price_paisa
                    ) VALUES (999999, 'INVALID-SKU', 'Fail', 100, 200, 150, 100)
                    """
                )

if __name__ == "__main__":
    unittest.main()

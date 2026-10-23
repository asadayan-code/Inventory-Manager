"""
PakAudio Retail Management System - Data Safety & Backup Service
- Automatic database backups (keeps last 30)
- Manual backup to chosen directory / USB drive
- Restore from backup with confirmation
- Database integrity checks
- CSV Catalog & Opening Stock Import with preview and validation report
"""
import os
import shutil
import glob
import io
import csv
from datetime import datetime
from typing import Dict, Any, List, Optional
import sqlite3
from backend.auth import log_audit, PermissionDeniedError
from backend.money import paisa_from_pkr_str

class BackupError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code

class BackupService:
    def __init__(self, db, backup_dir: str = "backups"):
        self.db = db
        self.backup_dir = backup_dir
        os.makedirs(self.backup_dir, exist_ok=True)

    def _require_owner(self, user: Dict[str, Any]):
        if user.get("role") != "OWNER":
            raise PermissionDeniedError("manage database backups or restore data")

    def perform_backup(self, user: Optional[Dict[str, Any]] = None, target_dir: Optional[str] = None) -> Dict[str, Any]:
        """
        Safely copies the SQLite database file using VACUUM INTO or sqlite3 backup API.
        Enforces retention of last 30 backups.
        """
        dest_dir = target_dir or self.backup_dir
        os.makedirs(dest_dir, exist_ok=True)

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_filename = f"pakaudio_backup_{timestamp}.db"
        dest_path = os.path.join(dest_dir, backup_filename)

        conn = self.db.get_connection()
        try:
            # First verify integrity
            res = conn.execute("PRAGMA integrity_check;").fetchall()
            if not res or res[0][0] != "ok":
                raise BackupError(f"Database integrity check failed: {res}. Cannot safely create backup.")

            # Use sqlite3 online backup API
            backup_conn = sqlite3.connect(dest_path)
            conn.backup(backup_conn)
            backup_conn.close()

            # Rotate older backups if in default backup directory
            if not target_dir or target_dir == self.backup_dir:
                self._rotate_backups(keep=30)

            size_bytes = os.path.getsize(dest_path)

            if user:
                with self.db.transaction() as write_conn:
                    log_audit(write_conn, user["id"], user["username"], "DATABASE_BACKUP", "DATABASE", backup_filename, f"Size: {size_bytes} bytes")

            return {
                "success": True,
                "filename": backup_filename,
                "path": dest_path,
                "size_bytes": size_bytes,
                "timestamp": timestamp
            }
        finally:
            conn.close()

    def list_backups(self) -> List[Dict[str, Any]]:
        """Lists available backup files sorted newest first."""
        files = glob.glob(os.path.join(self.backup_dir, "pakaudio_backup_*.db"))
        backups = []
        for f in sorted(files, reverse=True):
            stat = os.stat(f)
            backups.append({
                "filename": os.path.basename(f),
                "path": f,
                "size_bytes": stat.st_size,
                "created_at": datetime.fromtimestamp(stat.st_mtime).isoformat()
            })
        return backups

    def restore_backup(self, user: Dict[str, Any], backup_filename: str) -> Dict[str, Any]:
        """Restores database from a selected backup file."""
        self._require_owner(user)
        safe_filename = os.path.basename(backup_filename)
        source_path = os.path.join(self.backup_dir, safe_filename)

        if not os.path.exists(source_path):
            raise BackupError(f"Backup file '{safe_filename}' not found.", status_code=404)

        # Verify source file integrity before restoring
        test_conn = sqlite3.connect(source_path)
        try:
            res = test_conn.execute("PRAGMA integrity_check;").fetchall()
            if not res or res[0][0] != "ok":
                raise BackupError("The selected backup file is corrupted and cannot be restored.")
        finally:
            test_conn.close()

        # Perform emergency backup of current DB before replacing
        self.perform_backup(target_dir=os.path.join(self.backup_dir, "pre_restore"))

        # Restore
        target_path = self.db.db_path
        if target_path == ":memory:":
            raise BackupError("Cannot restore into an in-memory database.")

        shutil.copy2(source_path, target_path)

        # Log audit in newly restored DB
        with self.db.transaction() as conn:
            log_audit(conn, user["id"], user["username"], "RESTORE_BACKUP", "DATABASE", safe_filename, "Restored database from backup")

        return {"success": True, "restored_file": safe_filename}

    def _rotate_backups(self, keep: int = 30):
        files = sorted(glob.glob(os.path.join(self.backup_dir, "pakaudio_backup_*.db")), key=os.path.getmtime)
        while len(files) > keep:
            oldest = files.pop(0)
            try:
                os.remove(oldest)
            except OSError:
                pass

    def preview_catalog_csv(self, csv_content: str) -> Dict[str, Any]:
        """
        Parses and validates CSV for products and opening stock.
        Returns a preview and list of validation errors.
        Expected columns:
        Product Name, Category, Brand, Variant Name, SKU, Barcode, Cost PKR, Retail PKR, Wholesale PKR, Min PKR, Opening Stock, Car Compatibility
        """
        f = io.StringIO(csv_content)
        reader = csv.DictReader(f)
        preview_rows = []
        errors = []

        # Required headers check
        fieldnames = [fn.strip() for fn in (reader.fieldnames or [])]
        required_fields = ["Product Name", "Retail PKR"]
        for rf in required_fields:
            if not any(rf.lower() in fn.lower() for fn in fieldnames):
                errors.append(f"Missing required CSV column header: '{rf}'")

        if errors:
            return {"valid": False, "errors": errors, "preview": []}

        row_num = 1
        for row in reader:
            row_num += 1
            cleaned_row = {k.strip(): (v.strip() if v else "") for k, v in row.items() if k}
            p_name = cleaned_row.get("Product Name", "")
            if not p_name:
                errors.append(f"Row {row_num}: Product Name is empty.")
                continue

            retail_str = cleaned_row.get("Retail PKR", "0")
            try:
                retail_paisa = paisa_from_pkr_str(retail_str)
            except Exception as e:
                errors.append(f"Row {row_num} ('{p_name}'): Invalid Retail PKR '{retail_str}': {e}")
                continue

            cost_str = cleaned_row.get("Cost PKR", "0")
            try:
                cost_paisa = paisa_from_pkr_str(cost_str)
            except Exception:
                cost_paisa = 0

            wholesale_str = cleaned_row.get("Wholesale PKR", retail_str)
            try:
                wholesale_paisa = paisa_from_pkr_str(wholesale_str)
            except Exception:
                wholesale_paisa = retail_paisa

            min_str = cleaned_row.get("Min PKR", cost_str)
            try:
                min_paisa = paisa_from_pkr_str(min_str)
            except Exception:
                min_paisa = cost_paisa

            stock_qty = 0
            stock_str = cleaned_row.get("Opening Stock", "0")
            try:
                stock_qty = int(stock_str)
            except Exception:
                pass

            preview_rows.append({
                "row_num": row_num,
                "product_name": p_name,
                "category": cleaned_row.get("Category", ""),
                "brand": cleaned_row.get("Brand", ""),
                "variant_name": cleaned_row.get("Variant Name", "Standard") or "Standard",
                "sku": cleaned_row.get("SKU", ""),
                "barcode": cleaned_row.get("Barcode", ""),
                "cost_paisa": cost_paisa,
                "retail_price_paisa": retail_paisa,
                "wholesale_price_paisa": wholesale_paisa,
                "min_price_paisa": min_paisa,
                "opening_stock": stock_qty,
                "car_compatibility": cleaned_row.get("Car Compatibility", "")
            })

        return {
            "valid": len(errors) == 0,
            "total_rows": len(preview_rows),
            "errors": errors,
            "preview": preview_rows[:25]
        }

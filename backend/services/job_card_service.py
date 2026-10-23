"""
PakAudio Retail Management System - Installation Job Cards Service
Manages car audio & accessories installation job cards:
- Vehicle details (Make, Model, Year, Registration Number)
- Work description, technician assigned
- Billable parts used & labour charge
- Status progression: PENDING -> IN_PROGRESS -> COMPLETED -> BILLED
"""
import json
from datetime import datetime
from typing import Dict, Any, List, Optional
import sqlite3
from backend.money import require_paisa
from backend.auth import log_audit

class JobCardError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code

class JobCardService:
    def __init__(self, db):
        self.db = db

    def list_job_cards(self, status: Optional[str] = None) -> List[Dict[str, Any]]:
        conn = self.db.get_connection()
        try:
            cur = conn.cursor()
            query = "SELECT * FROM job_cards"
            params = []
            if status:
                query += " WHERE status = ?"
                params.append(status)
            query += " ORDER BY created_at DESC"
            cur.execute(query, tuple(params))
            res = []
            for r in cur.fetchall():
                d = dict(r)
                d["parts_used"] = json.loads(d["parts_used_json"])
                res.append(d)
            return res
        finally:
            conn.close()

    def get_job_card(self, job_card_id: int) -> Dict[str, Any]:
        conn = self.db.get_connection()
        try:
            cur = conn.cursor()
            cur.execute("SELECT * FROM job_cards WHERE id = ?", (job_card_id,))
            r = cur.fetchone()
            if not r:
                raise JobCardError("Job card not found.", status_code=404)
            d = dict(r)
            d["parts_used"] = json.loads(d["parts_used_json"])
            return d
        finally:
            conn.close()

    def create_job_card(self, user: Dict[str, Any], data: Dict[str, Any]) -> Dict[str, Any]:
        car_make = data.get("car_make", "").strip()
        car_model = data.get("car_model", "").strip()
        car_year = str(data.get("car_year", "")).strip()
        car_registration = data.get("car_registration", "").strip().upper()
        customer_name = data.get("customer_name", "").strip()
        customer_phone = data.get("customer_phone", "").strip()
        technician_name = data.get("technician_name", "").strip()
        work_description = data.get("work_description", "").strip()
        customer_id = data.get("customer_id")

        if not car_registration:
            raise JobCardError("Car registration number is required.")
        if not customer_name:
            raise JobCardError("Customer name is required.")
        if not technician_name:
            raise JobCardError("Technician name is required.")
        if not work_description:
            raise JobCardError("Work description is required.")

        labour_charge_paisa = require_paisa(data.get("labour_charge_paisa", 0))
        parts_used = data.get("parts_used", [])

        with self.db.transaction() as conn:
            cur = conn.cursor()
            job_number = f"JOB-{datetime.now().strftime('%Y%m%d%H%M%S%f')[:18]}"

            cur.execute(
                """
                INSERT INTO job_cards (
                    job_number, car_make, car_model, car_year, car_registration,
                    customer_id, customer_name, customer_phone, technician_name,
                    status, work_description, parts_used_json, labour_charge_paisa, notes
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?)
                """,
                (job_number, car_make, car_model, car_year, car_registration,
                 customer_id, customer_name, customer_phone, technician_name,
                 work_description, json.dumps(parts_used), labour_charge_paisa, data.get("notes", ""))
            )
            job_id = cur.lastrowid
            log_audit(conn, user["id"], user["username"], "CREATE_JOB_CARD", "JOB_CARD", str(job_id), f"{job_number} ({car_registration})")

            return {
                "id": job_id,
                "job_number": job_number,
                "car_registration": car_registration,
                "status": "PENDING"
            }

    def update_job_card(self, user: Dict[str, Any], job_card_id: int, data: Dict[str, Any]) -> Dict[str, Any]:
        with self.db.transaction() as conn:
            cur = conn.cursor()
            cur.execute("SELECT id, status FROM job_cards WHERE id = ?", (job_card_id,))
            jc = cur.fetchone()
            if not jc:
                raise JobCardError("Job card not found.", status_code=404)

            status = data.get("status", jc["status"])
            technician_name = data.get("technician_name")
            work_description = data.get("work_description")
            labour_charge_paisa = require_paisa(data.get("labour_charge_paisa", 0)) if "labour_charge_paisa" in data else None
            parts_used = data.get("parts_used")
            notes = data.get("notes")

            cur.execute(
                """
                UPDATE job_cards SET
                    status = COALESCE(?, status),
                    technician_name = COALESCE(?, technician_name),
                    work_description = COALESCE(?, work_description),
                    labour_charge_paisa = COALESCE(?, labour_charge_paisa),
                    parts_used_json = CASE WHEN ? IS NOT NULL THEN ? ELSE parts_used_json END,
                    notes = COALESCE(?, notes),
                    updated_at = datetime('now', 'localtime')
                WHERE id = ?
                """,
                (status, technician_name, work_description, labour_charge_paisa,
                 json.dumps(parts_used) if parts_used is not None else None,
                 json.dumps(parts_used) if parts_used is not None else None,
                 notes, job_card_id)
            )

            log_audit(conn, user["id"], user["username"], "UPDATE_JOB_CARD", "JOB_CARD", str(job_card_id), f"Status: {status}")
            return {"id": job_card_id, "status": status}

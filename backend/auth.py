"""
PakAudio Retail Management System - Authentication & Access Control
Rule 6: Passwords stored as salted hashes (scrypt). Login tokens stored as hashes.
5 wrong attempts lock username for 5 minutes. Sessions expire.
Rule 7: Every important action written to audit log.
Rule 8: Cashier-friendly error messages.
"""
import os
import hashlib
import secrets
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, Tuple
import sqlite3

class AuthError(Exception):
    """Base error for authentication failures with cashier-friendly messages."""
    def __init__(self, message: str, status_code: int = 401):
        super().__init__(message)
        self.message = message
        self.status_code = status_code

class AccountLockedError(AuthError):
    def __init__(self, minutes_left: int):
        super().__init__(
            f"Account is temporarily locked due to 5 incorrect password attempts. Please wait {minutes_left} minute(s) or ask the shop owner to unlock it.",
            status_code=423
        )

class PermissionDeniedError(AuthError):
    def __init__(self, action_name: str = "perform this action"):
        super().__init__(
            f"Permission denied. Only a shop owner can {action_name}. Please ask the owner to log in.",
            status_code=403
        )

def hash_password(password: str, salt: Optional[bytes] = None) -> Tuple[str, str]:
    """Generates a secure scrypt hash and hex salt for a password."""
    if salt is None:
        salt = os.urandom(16)
    derived = hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt,
        n=16384,
        r=8,
        p=1,
        maxmem=64 * 1024 * 1024
    )
    return derived.hex(), salt.hex()

def verify_password(password: str, password_hash: str, salt_hex: str) -> bool:
    """Verifies a plaintext password against a stored scrypt hash."""
    salt = bytes.fromhex(salt_hex)
    derived = hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt,
        n=16384,
        r=8,
        p=1,
        maxmem=64 * 1024 * 1024
    )
    return secrets.compare_digest(derived.hex(), password_hash)

def hash_token(token: str) -> str:
    """SHA-256 hash of a bearer session token."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()

def log_audit(conn: sqlite3.Connection, user_id: Optional[int], username: str, action: str,
              entity_type: str, entity_id: Optional[str] = None, details: str = "", ip_address: str = "127.0.0.1"):
    """Writes an entry to audit_log inside the current transaction."""
    conn.execute(
        """
        INSERT INTO audit_log (user_id, username, action, entity_type, entity_id, details, ip_address, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'));
        """,
        (user_id, username, action, entity_type, str(entity_id) if entity_id else "", details, ip_address)
    )

class AuthService:
    def __init__(self, db):
        self.db = db
        self._ensure_default_owner()

    def _ensure_default_owner(self):
        """Seeds default owner user 'admin' if no owner exists yet."""
        with self.db.transaction() as conn:
            cur = conn.cursor()
            cur.execute("SELECT COUNT(*) FROM users WHERE role = 'OWNER' AND is_active = 1")
            count = cur.fetchone()[0]
            if count == 0:
                pwd_hash, salt = hash_password("admin123")
                conn.execute(
                    """
                    INSERT OR IGNORE INTO users (username, password_hash, salt, full_name, role, is_active)
                    VALUES (?, ?, ?, ?, 'OWNER', 1)
                    """,
                    ("admin", pwd_hash, salt, "Shop Owner")
                )
                # Also seed a sample cashier 'cashier1' / 'cashier123'
                pwd_hash_c, salt_c = hash_password("cashier123")
                conn.execute(
                    """
                    INSERT OR IGNORE INTO users (username, password_hash, salt, full_name, role, is_active)
                    VALUES (?, ?, ?, ?, 'CASHIER', 1)
                    """,
                    ("cashier1", pwd_hash_c, salt_c, "Sales Counter Staff")
                )

    def login(self, username: str, password: str, ip_address: str = "127.0.0.1") -> Dict[str, Any]:
        """
        Authenticates user with 5-wrong lockout rule and generates 12h session token.
        Returns dict with token, user info and role.
        """
        username = username.strip().lower()
        now = datetime.now()

        with self.db.transaction() as conn:
            cur = conn.cursor()
            cur.execute(
                "SELECT id, username, password_hash, salt, full_name, role, is_active, failed_attempts, locked_until FROM users WHERE LOWER(username) = ?",
                (username,)
            )
            user = cur.fetchone()

            if not user:
                raise AuthError("Invalid username or password. Please verify your credentials.")

            user_id = user["id"]
            if not user["is_active"]:
                raise AuthError("This staff account is deactivated. Please contact the shop owner.")

            # Check if account is locked
            if user["locked_until"]:
                try:
                    locked_time = datetime.fromisoformat(user["locked_until"])
                    if now < locked_time:
                        minutes_left = max(1, int((locked_time - now).total_seconds() / 60) + 1)
                        log_audit(conn, user_id, username, "LOGIN_ATTEMPT_WHILE_LOCKED", "USER", str(user_id), f"Locked until {user['locked_until']}", ip_address)
                        raise AccountLockedError(minutes_left)
                except ValueError:
                    pass

            # Check password
            if not verify_password(password, user["password_hash"], user["salt"]):
                failed_attempts = user["failed_attempts"] + 1
                locked_until_str = None
                if failed_attempts >= 5:
                    locked_until = now + timedelta(minutes=5)
                    locked_until_str = locked_until.isoformat()
                    conn.execute(
                        "UPDATE users SET failed_attempts = ?, locked_until = ?, updated_at = datetime('now', 'localtime') WHERE id = ?",
                        (failed_attempts, locked_until_str, user_id)
                    )
                    log_audit(conn, user_id, username, "ACCOUNT_LOCKED", "USER", str(user_id), f"5 failed attempts. Locked for 5 mins until {locked_until_str}", ip_address)
                    is_lockout = True
                else:
                    conn.execute(
                        "UPDATE users SET failed_attempts = ?, updated_at = datetime('now', 'localtime') WHERE id = ?",
                        (failed_attempts, user_id)
                    )
                    remaining = 5 - failed_attempts
                    log_audit(conn, user_id, username, "LOGIN_FAILED", "USER", str(user_id), f"Attempt {failed_attempts}/5", ip_address)
                    is_lockout = False

                # Commit the failed attempt record so it persists
                conn.execute("COMMIT")
                if is_lockout:
                    raise AccountLockedError(5)
                else:
                    raise AuthError(f"Incorrect password. {remaining} attempt(s) remaining before a 5-minute lockout.")

            # Login successful: reset attempts and locked_until
            conn.execute(
                "UPDATE users SET failed_attempts = 0, locked_until = NULL, updated_at = datetime('now', 'localtime') WHERE id = ?",
                (user_id,)
            )

            # Generate random session token
            token = secrets.token_hex(32)
            token_h = hash_token(token)
            expires_at = (now + timedelta(hours=12)).isoformat()

            conn.execute(
                "INSERT INTO user_sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)",
                (user_id, token_h, expires_at)
            )

            log_audit(conn, user_id, username, "LOGIN_SUCCESS", "USER", str(user_id), f"Role: {user['role']}", ip_address)

            return {
                "token": token,
                "user": {
                    "id": user_id,
                    "username": user["username"],
                    "full_name": user["full_name"],
                    "role": user["role"]
                },
                "expires_at": expires_at
            }

    def authenticate_token(self, token: str) -> Dict[str, Any]:
        """Validates a bearer token and returns user dictionary. Raises AuthError if invalid/expired."""
        if not token:
            raise AuthError("Please log in to continue.", status_code=401)

        token_h = hash_token(token)
        now_str = datetime.now().isoformat()

        conn = self.db.get_connection()
        try:
            cur = conn.cursor()
            cur.execute(
                """
                SELECT s.id as session_id, s.expires_at, u.id, u.username, u.full_name, u.role, u.is_active
                FROM user_sessions s
                JOIN users u ON s.user_id = u.id
                WHERE s.token_hash = ?
                """,
                (token_h,)
            )
            row = cur.fetchone()
            if not row:
                raise AuthError("Invalid or expired session. Please log in again.", status_code=401)

            if row["expires_at"] < now_str:
                # Expired session
                conn.execute("DELETE FROM user_sessions WHERE token_hash = ?", (token_h,))
                raise AuthError("Your session has expired. Please log in again.", status_code=401)

            if not row["is_active"]:
                raise AuthError("Your staff account is currently deactivated. Please contact the owner.", status_code=403)

            return {
                "id": row["id"],
                "username": row["username"],
                "full_name": row["full_name"],
                "role": row["role"]
            }
        finally:
            conn.close()

    def logout(self, token: str, user: Optional[Dict[str, Any]] = None, ip_address: str = "127.0.0.1"):
        """Logs out user by destroying token hash from user_sessions."""
        if not token:
            return
        token_h = hash_token(token)
        with self.db.transaction() as conn:
            conn.execute("DELETE FROM user_sessions WHERE token_hash = ?", (token_h,))
            if user:
                log_audit(conn, user["id"], user["username"], "LOGOUT", "USER", str(user["id"]), "User logged out", ip_address)

    def create_user(self, current_user: Dict[str, Any], username: str, password: str, full_name: str, role: str) -> Dict[str, Any]:
        """Only an OWNER can create users."""
        if current_user.get("role") != "OWNER":
            raise PermissionDeniedError("create new users")

        username = username.strip().lower()
        if not username or len(username) < 3:
            raise AuthError("Username must be at least 3 characters long.", status_code=400)
        if not password or len(password) < 6:
            raise AuthError("Password must be at least 6 characters long.", status_code=400)
        if role not in ("OWNER", "CASHIER"):
            raise AuthError("Role must be either OWNER or CASHIER.", status_code=400)

        pwd_hash, salt = hash_password(password)

        with self.db.transaction() as conn:
            cur = conn.cursor()
            cur.execute("SELECT id FROM users WHERE LOWER(username) = ?", (username,))
            if cur.fetchone():
                raise AuthError(f"Username '{username}' already exists. Please choose a different one.", status_code=400)

            cur.execute(
                """
                INSERT INTO users (username, password_hash, salt, full_name, role, is_active)
                VALUES (?, ?, ?, ?, ?, 1)
                """,
                (username, pwd_hash, salt, full_name.strip(), role)
            )
            new_id = cur.lastrowid
            log_audit(conn, current_user["id"], current_user["username"], "CREATE_USER", "USER", str(new_id), f"Created {username} ({role})")
            return {"id": new_id, "username": username, "full_name": full_name, "role": role, "is_active": 1}

    def reset_password(self, current_user: Dict[str, Any], user_id: int, new_password: str) -> bool:
        """Owner can reset any password. Cashier cannot reset passwords."""
        if current_user.get("role") != "OWNER":
            raise PermissionDeniedError("reset passwords")

        if not new_password or len(new_password) < 6:
            raise AuthError("New password must be at least 6 characters long.", status_code=400)

        pwd_hash, salt = hash_password(new_password)

        with self.db.transaction() as conn:
            cur = conn.cursor()
            cur.execute("SELECT username FROM users WHERE id = ?", (user_id,))
            target = cur.fetchone()
            if not target:
                raise AuthError("User not found.", status_code=404)

            conn.execute(
                """
                UPDATE users 
                SET password_hash = ?, salt = ?, failed_attempts = 0, locked_until = NULL, updated_at = datetime('now', 'localtime') 
                WHERE id = ?
                """,
                (pwd_hash, salt, user_id)
            )
            # Invalidate all active sessions for this user
            conn.execute("DELETE FROM user_sessions WHERE user_id = ?", (user_id,))
            log_audit(conn, current_user["id"], current_user["username"], "PASSWORD_RESET", "USER", str(user_id), f"Reset password for {target['username']}")
            return True

    def toggle_user_active(self, current_user: Dict[str, Any], user_id: int, is_active: bool) -> bool:
        """Enforces rule: At least one active owner must always exist."""
        if current_user.get("role") != "OWNER":
            raise PermissionDeniedError("change user status")

        with self.db.transaction() as conn:
            cur = conn.cursor()
            cur.execute("SELECT username, role, is_active FROM users WHERE id = ?", (user_id,))
            target = cur.fetchone()
            if not target:
                raise AuthError("User not found.", status_code=404)

            if target["role"] == "OWNER" and not is_active:
                cur.execute("SELECT COUNT(*) FROM users WHERE role = 'OWNER' AND is_active = 1 AND id != ?", (user_id,))
                active_owners = cur.fetchone()[0]
                if active_owners == 0:
                    raise AuthError("Cannot deactivate the only active shop owner. At least one active owner must exist.", status_code=400)

            conn.execute(
                "UPDATE users SET is_active = ?, updated_at = datetime('now', 'localtime') WHERE id = ?",
                (1 if is_active else 0, user_id)
            )
            if not is_active:
                conn.execute("DELETE FROM user_sessions WHERE user_id = ?", (user_id,))
            action = "ENABLE_USER" if is_active else "DISABLE_USER"
            log_audit(conn, current_user["id"], current_user["username"], action, "USER", str(user_id), f"{action} for {target['username']}")
            return True

    def list_users(self, current_user: Dict[str, Any]) -> list[Dict[str, Any]]:
        """Lists users. Only OWNER can view all users."""
        if current_user.get("role") != "OWNER":
            raise PermissionDeniedError("view user list")

        conn = self.db.get_connection()
        try:
            cur = conn.cursor()
            cur.execute(
                """
                SELECT id, username, full_name, role, is_active, failed_attempts, locked_until, created_at, updated_at
                FROM users ORDER BY role DESC, full_name ASC
                """
            )
            return [dict(r) for r in cur.fetchall()]
        finally:
            conn.close()

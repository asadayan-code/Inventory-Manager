"""
Unit tests for Authentication, Scrypt hashing, 5-strike lockout, and permissions.
"""
import unittest
from backend.database import Database
from backend.auth import AuthService, AuthError, AccountLockedError, PermissionDeniedError, hash_password, verify_password

class TestAuth(unittest.TestCase):
    def setUp(self):
        self.db = Database(":memory:")
        self.auth = AuthService(self.db)

    def test_scrypt_password_hashing(self):
        pwd = "SecretPassword123"
        h, salt = hash_password(pwd)
        self.assertTrue(verify_password(pwd, h, salt))
        self.assertFalse(verify_password("WrongPassword", h, salt))

    def test_default_owner_seeded(self):
        login_res = self.auth.login("admin", "admin123")
        self.assertEqual(login_res["user"]["role"], "OWNER")
        self.assertTrue("token" in login_res)

        # Cashier seeded
        login_c = self.auth.login("cashier1", "cashier123")
        self.assertEqual(login_c["user"]["role"], "CASHIER")

    def test_five_wrong_passwords_lockout(self):
        # 4 wrong attempts
        for i in range(1, 5):
            with self.assertRaises(AuthError) as ctx:
                self.auth.login("cashier1", "wrongpassword")
            self.assertIn("remaining before a 5-minute lockout", str(ctx.exception))

        # 5th wrong attempt triggers AccountLockedError
        with self.assertRaises(AccountLockedError):
            self.auth.login("cashier1", "wrongpassword")

        # 6th attempt is also blocked while locked
        with self.assertRaises(AccountLockedError):
            self.auth.login("cashier1", "cashier123")  # Even correct password is locked!

    def test_last_owner_cannot_be_deactivated(self):
        owner_session = self.auth.login("admin", "admin123")
        admin_id = owner_session["user"]["id"]

        with self.assertRaises(AuthError) as ctx:
            self.auth.toggle_user_active(owner_session["user"], admin_id, False)
        self.assertIn("Cannot deactivate the only active shop owner", str(ctx.exception))

    def test_cashier_cannot_create_users(self):
        cashier_session = self.auth.login("cashier1", "cashier123")
        with self.assertRaises(PermissionDeniedError):
            self.auth.create_user(cashier_session["user"], "newcashier", "pass123", "New Cashier", "CASHIER")

if __name__ == "__main__":
    unittest.main()

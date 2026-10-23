"""
Integration tests for the Local JSON API (BaseHTTPRequestHandler).
Verifies HTTP endpoints, auth headers, status codes, and JSON bodies.
"""
import unittest
import threading
import json
import urllib.request
import urllib.error
from http.server import HTTPServer
from backend.database import Database
from backend.api_handler import ApiRequestHandler

class TestApiEndpoints(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.db = Database(":memory:")
        # Start test HTTP server on random free port or 8999
        cls.server = HTTPServer(("127.0.0.1", 8999), lambda *args, **kwargs: ApiRequestHandler(*args, db=cls.db, **kwargs))
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base_url = "http://127.0.0.1:8999"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def _request(self, method: str, endpoint: str, data: dict = None, token: str = None) -> tuple:
        url = f"{self.base_url}{endpoint}"
        body = json.dumps(data).encode("utf-8") if data else None
        req = urllib.request.Request(url, data=body, method=method)
        req.add_header("Content-Type", "application/json")
        if token:
            req.add_header("Authorization", f"Bearer {token}")

        try:
            with urllib.request.urlopen(req, timeout=5) as res:
                status = res.status
                res_body = json.loads(res.read().decode("utf-8"))
                return status, res_body
        except urllib.error.HTTPError as e:
            res_body = json.loads(e.read().decode("utf-8"))
            return e.code, res_body

    def test_health_check(self):
        status, body = self._request("GET", "/api/health")
        self.assertEqual(status, 200)
        self.assertEqual(body["status"], "healthy")

    def test_unauthenticated_request_rejected(self):
        status, body = self._request("GET", "/api/catalog/search")
        self.assertEqual(status, 401)
        self.assertIn("Please log in", body["error"])

    def test_login_and_authenticated_flow(self):
        # 1. Login as default owner
        status, login_res = self._request("POST", "/api/auth/login", {"username": "admin", "password": "admin123"})
        self.assertEqual(status, 200)
        token = login_res["token"]
        self.assertEqual(login_res["user"]["role"], "OWNER")

        # 2. Check /api/auth/me
        status, me_res = self._request("GET", "/api/auth/me", token=token)
        self.assertEqual(status, 200)
        self.assertEqual(me_res["user"]["username"], "admin")

        # 3. Create a category
        status, cat_res = self._request("POST", "/api/categories", {"name": "Audio Accessories"}, token=token)
        self.assertEqual(status, 201)
        self.assertEqual(cat_res["name"], "Audio Accessories")

        # 4. Cashier login & permission check
        status, c_login = self._request("POST", "/api/auth/login", {"username": "cashier1", "password": "cashier123"})
        c_token = c_login["token"]

        # Cashier trying to create category is forbidden
        status, fail_res = self._request("POST", "/api/categories", {"name": "Restricted"}, token=c_token)
        self.assertEqual(status, 403)
        self.assertIn("Permission denied", fail_res["error"])

if __name__ == "__main__":
    unittest.main()

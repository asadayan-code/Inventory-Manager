"""
PakAudio Retail Management System - Local JSON API Server
Runs Python HTTP server on 127.0.0.1:8000 using standard library http.server.
"""
import sys
import os

# Ensure project root is in sys.path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from http.server import HTTPServer
from backend.database import get_db
from backend.api_handler import ApiRequestHandler
from backend.seed_data import seed_database

def run_server(host: str = "127.0.0.1", port: int = 8001, db_path: str = "data/pakaudio.db"):
    db = get_db(db_path)
    
    # Check if products exist; if not, seed realistic shop data
    conn = db.get_connection()
    try:
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM products")
        if cur.fetchone()[0] == 0:
            print("Empty catalog detected. Seeding authentic retail store data...")
            seed_database(db)
    finally:
        conn.close()

    def handler_factory(*args, **kwargs):
        return ApiRequestHandler(*args, db=db, **kwargs)

    server_address = (host, port)
    httpd = HTTPServer(server_address, handler_factory)
    print(f"============================================================")
    print(f"PakAudio Retail POS API Server running on http://{host}:{port}")
    print(f"Database: {db_path} (SQLite in WAL mode, FK enabled)")
    print(f"Offline desktop mode active. Listening on localhost only.")
    print(f"============================================================")

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server gracefully...")
        httpd.server_close()
        print("Server stopped.")

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8001"))
    run_server(port=port)

#!/usr/bin/env bash
echo "========================================================"
echo "  SOHAIL AUTOS POS & RETAIL MANAGEMENT SYSTEM"
echo "  100% Local Offline Mode (No Internet Required)"
echo "========================================================"
echo ""
echo "Starting Python SQLite backend on port 8001..."
python3 backend/server.py &
BACKEND_PID=$!

trap "kill $BACKEND_PID 2>/dev/null" EXIT

sleep 2

echo "Starting POS Desktop Server on port 3000..."
npm run dev

@echo off
title Sohail Autos POS - Offline Retail Management System
echo ========================================================
echo   SOHAIL AUTOS POS & RETAIL MANAGEMENT SYSTEM
echo   100%% Local Offline Mode (No Internet Required)
echo ========================================================
echo.
echo Starting Python SQLite database engine on port 8001...
start "Sohail Autos Backend" /B python backend/server.py

timeout /t 2 /nobreak >nul

echo Starting POS Desktop Frontend on port 3000...
echo Opening browser at http://localhost:3000
start http://localhost:3000

npm run dev

pause

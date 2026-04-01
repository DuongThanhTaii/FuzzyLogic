@echo off
title Fuzzy Anesthesia App

echo ================================================
echo   FUZZY ANESTHESIA CONTROL SYSTEM
echo ================================================
echo.

:: ── Check Python ──────────────────────────────────
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Python not found. Please install Python 3.10+
    pause & exit /b 1
)

:: ── Check Node ────────────────────────────────────
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found. Please install Node.js 18+
    pause & exit /b 1
)

:: ── Install Python deps if needed ─────────────────
echo [1/3] Checking Python dependencies...
cd /d "%~dp0backend"
pip install -r requirements.txt -q
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install Python dependencies.
    pause & exit /b 1
)
echo       Done.

:: ── Install Node deps if needed ───────────────────
echo [2/3] Checking Node dependencies...
cd /d "%~dp0frontend"
if not exist "node_modules" (
    npm install -q
)
echo       Done.

:: ── Launch Backend ────────────────────────────────
echo [3/3] Starting services...
echo.
echo  ^> Backend  : http://localhost:8000
echo  ^> Frontend : http://localhost:5173
echo  ^> API docs : http://localhost:8000/docs
echo.

cd /d "%~dp0backend"
start "Backend - FastAPI" cmd /k "python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload"

timeout /t 2 /nobreak >nul

:: ── Launch Frontend ───────────────────────────────
cd /d "%~dp0frontend"
start "Frontend - Vite" cmd /k "npm run dev"

timeout /t 3 /nobreak >nul

:: ── Open Browser ──────────────────────────────────
start "" "http://localhost:5173"

echo ================================================
echo   Both services are running.
echo   Close the two terminal windows to stop.
echo ================================================
pause

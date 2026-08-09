@echo off
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not in your PATH!
    echo Please install Python 3 from the official website.
    echo Opening download page...
    start https://www.python.org/downloads/
    pause
    exit /b
)
echo Starting Movie Tracker Backend on port 8080...
python app.py
pause

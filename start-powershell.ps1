# Start Movie Tracker on Windows

try {
    $null = Get-Command python -ErrorAction Stop
} catch {
    Write-Host "[ERROR] Python is not installed or not in your PATH!" -ForegroundColor Red
    Write-Host "Please install Python 3 from the official website."
    Write-Host "Opening download page..."
    Start-Process "https://www.python.org/downloads/"
    Pause
    exit
}

echo "Starting Movie Tracker Backend on port 8080..."
python app.py

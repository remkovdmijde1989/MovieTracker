#!/bin/bash
cd "$(dirname "$0")"

if ! command -v python3 &> /dev/null; then
    echo "[ERROR] Python 3 is not installed or not in your PATH!"
    echo "Please install Python 3 from the official website."
    echo "Opening download page..."
    xdg-open "https://www.python.org/downloads/" || open "https://www.python.org/downloads/"
    exit 1
fi

echo "Starting Movie Tracker..."
python3 app.py

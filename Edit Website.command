#!/bin/bash
cd "$(dirname "$0")"

if command -v python3 >/dev/null 2>&1; then
  python3 build.py
else
  echo "Python 3 is required to open the website editor."
  echo "Install it from: https://www.python.org/downloads/"
  read -p "Press Enter to exit... "
fi

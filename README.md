# Quran Insight (بصائر القرآن)

A Quranic Root Analysis and Search System that allows users to explore the Quran through root words and exact matches, featuring a modern, responsive interface.

## Features
- **Root Search**: Find all verses containing words derived from a specific Arabic root.
- **Exact Word Search**: Precise searching with "Smart Exact" matching for diacritics.
- **Responsive Design**: Mobile-friendly interface with Light/Dark mode support.
- **Interactive UI**: Real-time suggestions, search mode toggles, and detail views.

## Prerequisites
- Python 3.8+
- SQLite3

## Installation
1.  **Clone/Download** the repository.
2.  **Install Dependencies**:
    ```bash
    pip install -r requirements.txt
    ```

## How to Start the App

1.  Open a terminal in the project root directory.
2.  Run the main application script:
    ```bash
    python src/main.py
    ```
3.  The server will start at: `http://localhost:8001`
4.  Open your web browser and navigate to that URL.

> **Note**: If the database is missing, run `python scripts/build_db.py` first to generate `data/quran.db`.

## How to Stop the App

1.  Go to the terminal window where the app is running.
2.  Press **`Ctrl + C`** on your keyboard.
3.  The server will shut down gracefully.

## Accessing via Mobile / LAN

You can access the application from other devices (phones, tablets) on the same Wi-Fi network.

1.  **Configuration**: The app listens on `0.0.0.0` (All interfaces).
2.  **Find IP**: Run `ipconfig` in a terminal to find your PC's IPv4 address (e.g., `192.168.1.15`).
3.  **Browse**: Open `http://YOUR_PC_IP:8001` on your mobile device.

### Firewall Configuration (PowerShell as Administrator)

If you cannot connect, you probably need to allow the port through the Windows Firewall.

**1. Create the Rule (First Time Only):**
```powershell
New-NetFirewallRule -DisplayName "QuranAI Port 8001" -Direction Inbound -LocalPort 8001 -Protocol TCP -Action Allow
```

**2. Enable/Disable the Rule:**
To disable (restrict access):
```powershell
Set-NetFirewallRule -DisplayName "QuranAI Port 8001" -Enabled False
```
To enable again:
```powershell
Set-NetFirewallRule -DisplayName "QuranAI Port 8001" -Enabled True
```

> **Security Note**: It is recommended to **disable this rule** (using the `False` command above) when you are done accessing the app via mobile to maintain the security of your system.

## Project Structure
- `src/`: Main application logic (FastAPI backend).
- `static/`: Frontend assets (HTML, CSS, JS).
- `scripts/`: Utility scripts (Database builder).
- `data/`: Database and source JSON files.

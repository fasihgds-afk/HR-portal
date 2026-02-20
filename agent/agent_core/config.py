"""
Paths, logging setup, config load/save, safe_print, resource_path.
"""

import os
import json
import sys
import logging
from pathlib import Path


# ─── Paths ───────────────────────────────────────────────────────
# Fixed location that doesn't change regardless of where the exe runs from.
# One config/state per employee per machine.
_FOLDER_NAME = "WinSystemHealth"

if sys.platform == "win32":
    BASE_DIR = Path(os.environ.get("PROGRAMDATA", "C:\\ProgramData")) / _FOLDER_NAME
else:
    BASE_DIR = Path(__file__).parent.parent

BASE_DIR.mkdir(parents=True, exist_ok=True)

CONFIG_FILE = BASE_DIR / "config.json"
LOG_FILE = BASE_DIR / "svc.log"
OFFLINE_BUFFER_FILE = BASE_DIR / "pending.jsonl"
LAST_ALIVE_FILE = BASE_DIR / "state.json"


def resource_path(relative_path):
    """Get path to bundled resource (works for both dev and PyInstaller)."""
    if getattr(sys, 'frozen', False):
        base = Path(sys._MEIPASS)
    else:
        base = Path(__file__).parent.parent
    return str(base / relative_path)


# ─── Safe print (no crash when --noconsole) ──────────────────────

def safe_print(*args, **kwargs):
    try:
        print(*args, **kwargs)
    except Exception:
        pass


# ─── Logging ─────────────────────────────────────────────────────

try:
    if LOG_FILE.exists() and LOG_FILE.stat().st_size > 1_000_000:
        LOG_FILE.write_text("")
except Exception:
    pass

logging.basicConfig(
    filename=str(LOG_FILE),
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    encoding="utf-8",
)
log = logging.getLogger("svc")

console_handler = logging.StreamHandler(sys.stdout)
console_handler.setLevel(logging.INFO)
console_handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
log.addHandler(console_handler)


# ─── Config Management ──────────────────────────────────────────

def load_config():
    """Load config from disk. Returns dict or None."""
    if CONFIG_FILE.exists():
        try:
            with open(CONFIG_FILE, "r") as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            return None
    return None


def save_config(config):
    """Save config dict to disk."""
    with open(CONFIG_FILE, "w") as f:
        json.dump(config, f, indent=2)
    log.info("Config saved to %s", CONFIG_FILE)

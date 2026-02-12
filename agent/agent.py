"""
Attendance & Break Monitor — Desktop Agent
===========================================
PRIVACY: This agent ONLY detects mouse/keyboard ACTIVITY timestamps.
It does NOT capture screenshots, screen content, typed text, or file access.
It sends ONLY: "ACTIVE" or "IDLE" status + timestamps to the HR server.

When IDLE is detected (or system is locked), a popup asks the employee
to select a break category and type a reason. The reason is stored in
the database and visible to HR and the employee.

Usage:
    python agent.py
"""

import json
import os
import sys
import time
import math
import platform
import threading
import logging
import ctypes
import tkinter as tk
from tkinter import ttk
from pathlib import Path
from datetime import datetime, timezone
from collections import deque

import requests
from requests.adapters import HTTPAdapter
from pynput import mouse, keyboard

# ─── HTTP Session (connection pooling — reuses TCP connections) ───
# Much faster and lighter than opening a new connection every heartbeat
from urllib3.util.retry import Retry

_retry_strategy = Retry(
    total=3,               # Retry up to 3 times
    backoff_factor=1,      # Wait 1s, 2s, 4s between retries
    status_forcelist=[502, 503, 504],  # Retry on server errors
    allowed_methods=["POST", "PATCH"],
)
_http = requests.Session()
_http.mount("http://", HTTPAdapter(pool_connections=1, pool_maxsize=2, max_retries=_retry_strategy))
_http.mount("https://", HTTPAdapter(pool_connections=1, pool_maxsize=2, max_retries=_retry_strategy))

# ─── Constants ────────────────────────────────────────────────────

AGENT_VERSION = "1.6.0"
IDLE_THRESHOLD_SEC = 180       # No activity for 180s (3 min) → IDLE
HEARTBEAT_INTERVAL_SEC = 180   # Send heartbeat every 3 minutes
MOVE_THROTTLE_SEC = 0.5        # Only record mouse move every 500ms (saves huge CPU)

BREAK_REASONS = [
    "Official",
    "Personal Break",
    "Namaz",
    "Others",
]

# ─── Portal Theme Colors (matching HR portal dark theme) ─────────

THEME = {
    "bg_darkest":   "#020617",   # fullscreen overlay
    "bg_dark":      "#0f172a",   # secondary bg
    "bg_card":      "#1e293b",   # card background
    "bg_input":     "#0f172a",   # input field bg
    "bg_hover":     "#334155",   # hover
    "header_bg":    "#0a2c54",   # header background
    "primary":      "#3b82f6",   # blue button
    "primary_hover":"#2563eb",   # button hover
    "text_primary": "#f1f5f9",   # white text
    "text_secondary":"#cbd5e1",  # light gray
    "text_muted":   "#94a3b8",   # muted text
    "text_dark":    "#64748b",   # dark muted
    "border":       "#374151",   # borders
    "success":      "#22c55e",   # green
    "error":        "#ef4444",   # red
    "warning":      "#fbbf24",   # yellow
}

# When running as .exe (PyInstaller), save config NEXT TO the .exe (persistent)
# When running as .py script, save config next to the script
if getattr(sys, 'frozen', False):
    _BASE_DIR = Path(sys.executable).parent
else:
    _BASE_DIR = Path(__file__).parent

CONFIG_FILE = _BASE_DIR / "config.json"
LOG_FILE = _BASE_DIR / "agent.log"


def resource_path(relative_path):
    """Get path to bundled resource (works for both dev and PyInstaller)."""
    if getattr(sys, 'frozen', False):
        base = Path(sys._MEIPASS)
    else:
        base = Path(__file__).parent
    return str(base / relative_path)


# ─── Safe print (no crash when --noconsole) ──────────────────────

def safe_print(*args, **kwargs):
    """Print that never crashes, even with --noconsole (no stdout)."""
    try:
        print(*args, **kwargs)
    except Exception:
        pass

# ─── Logging (minimal) ───────────────────────────────────────────

logging.basicConfig(
    filename=str(LOG_FILE),
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    encoding="utf-8",
)
log = logging.getLogger("agent")

# Rotate log file: keep max 1 MB to avoid filling disk on old systems
try:
    if LOG_FILE.exists() and LOG_FILE.stat().st_size > 1_000_000:
        LOG_FILE.write_text("")  # Clear log if too big
except Exception:
    pass

console_handler = logging.StreamHandler(sys.stdout)
console_handler.setLevel(logging.INFO)
console_handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
log.addHandler(console_handler)


# ─── Config Management ───────────────────────────────────────────

def load_config():
    if CONFIG_FILE.exists():
        try:
            with open(CONFIG_FILE, "r") as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            return None
    return None


def save_config(config):
    with open(CONFIG_FILE, "w") as f:
        json.dump(config, f, indent=2)
    log.info("Config saved to %s", CONFIG_FILE)


# ─── Enrollment ──────────────────────────────────────────────────

def enroll(server_url, emp_code):
    url = f"{server_url.rstrip('/')}/api/agent/enroll"
    payload = {
        "empCode": emp_code,
        "deviceName": platform.node(),
        "os": f"{platform.system()} {platform.release()}",
        "agentVersion": AGENT_VERSION,
    }

    log.info("Enrolling device for %s at %s ...", emp_code, url)
    resp = _http.post(url, json=payload, timeout=15)
    resp.raise_for_status()
    data = resp.json()

    if not data.get("success"):
        raise RuntimeError(f"Enrollment failed: {data.get('error', 'Unknown error')}")

    config = {
        "serverUrl": server_url.rstrip("/"),
        "empCode": emp_code,
        "deviceId": data["deviceId"],
        "deviceToken": data["deviceToken"],
        "heartbeatIntervalSec": data.get("heartbeatIntervalSec", HEARTBEAT_INTERVAL_SEC),
    }

    save_config(config)
    log.info("Enrolled successfully! Device ID: %s", config["deviceId"])
    return config


# ─── Auto-Start on Boot ──────────────────────────────────────────

def _get_install_dir():
    """
    Get the permanent install directory for the agent.
    Copies exe to C:\\ProgramData\\GDSAgent\\ so it's always in a fixed location.
    """
    install_dir = Path(os.environ.get("PROGRAMDATA", "C:\\ProgramData")) / "GDSAgent"
    install_dir.mkdir(parents=True, exist_ok=True)
    return install_dir


def setup_autostart():
    """
    Set up auto-start on Windows boot:
      1. Copy exe to a fixed location (C:\\ProgramData\\GDSAgent\\)
      2. Copy config.json to that location
      3. Register in Windows Startup via Registry
    This ensures the agent always starts, even if the original exe is moved/deleted.
    """
    try:
        if sys.platform != "win32":
            log.info("Auto-start only supported on Windows")
            return

        import winreg
        import shutil

        install_dir = _get_install_dir()

        if getattr(sys, 'frozen', False):
            # Copy the exe to the install directory (fixed path)
            src_exe = Path(sys.executable)
            dst_exe = install_dir / "AttendanceAgent.exe"

            # Only copy if different location or newer
            try:
                if src_exe.resolve() != dst_exe.resolve():
                    shutil.copy2(str(src_exe), str(dst_exe))
                    log.info("Agent installed to %s", dst_exe)
            except PermissionError:
                log.info("Agent already running from install dir, skipping copy")

            # Copy config to install dir too
            if CONFIG_FILE.exists():
                dst_config = install_dir / "config.json"
                if not dst_config.exists() or dst_config.resolve() != CONFIG_FILE.resolve():
                    try:
                        shutil.copy2(str(CONFIG_FILE), str(dst_config))
                    except Exception:
                        pass

            exe_path = str(dst_exe)
        else:
            exe_path = f'pythonw.exe "{os.path.abspath(__file__)}"'

        # Register in Windows Startup
        key_path = r"Software\Microsoft\Windows\CurrentVersion\Run"
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, key_path, 0, winreg.KEY_SET_VALUE)
        winreg.SetValueEx(key, "AttendanceAgent", 0, winreg.REG_SZ, f'"{exe_path}"')
        winreg.CloseKey(key)
        log.info("Auto-start enabled: %s", exe_path)
    except Exception as e:
        log.warning("Could not set auto-start: %s", e)


def is_autostart_enabled():
    """Check if auto-start is already configured and points to a valid path."""
    try:
        import winreg
        key_path = r"Software\Microsoft\Windows\CurrentVersion\Run"
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, key_path, 0, winreg.KEY_READ)
        try:
            value, _ = winreg.QueryValueEx(key, "AttendanceAgent")
            winreg.CloseKey(key)
            # Verify the registered exe actually exists
            exe_path = value.strip('"')
            return Path(exe_path).exists()
        except FileNotFoundError:
            winreg.CloseKey(key)
            return False
    except Exception:
        return False


# ─── Single Instance Lock (prevent duplicate agents) ─────────────

_instance_mutex = None

def ensure_single_instance():
    """
    Prevent multiple agent instances from running simultaneously.
    Uses a Windows named mutex — if another instance already holds it, exit.
    """
    global _instance_mutex
    if sys.platform != "win32":
        return True

    try:
        # CreateMutexW(NULL, FALSE, name) — returns handle or existing
        _instance_mutex = ctypes.windll.kernel32.CreateMutexW(None, False, "GDS_AttendanceAgent_Mutex")
        last_error = ctypes.windll.kernel32.GetLastError()

        if last_error == 183:  # ERROR_ALREADY_EXISTS
            log.info("Another instance of the agent is already running. Exiting.")
            return False
        return True
    except Exception:
        return True  # If mutex fails, allow running (better than not running)


# ─── System Lock Detection (Windows) ─────────────────────────────

def is_system_locked():
    """
    Check if the Windows workstation is locked.
    Uses OpenInputDesktop — returns True when the desktop is locked.
    """
    if sys.platform != "win32":
        return False
    try:
        # DESKTOP_READOBJECTS = 0x0001
        hDesktop = ctypes.windll.user32.OpenInputDesktop(0, False, 0x0001)
        if hDesktop == 0:
            return True
        ctypes.windll.user32.CloseDesktop(hDesktop)
        return False
    except Exception:
        return False


# ─── GUI Enrollment Dialog ────────────────────────────────────────

def gui_enroll():
    """
    Show a GUI dialog for first-time enrollment.
    Styled with portal dark theme + GDS branding.
    """
    result = {"config": None}

    root = tk.Tk()
    root.title("GDS Attendance Agent — Setup")
    root.geometry("460x420")
    root.resizable(False, False)
    root.configure(bg=THEME["bg_darkest"])
    root.attributes("-topmost", True)

    # Center
    root.update_idletasks()
    x = (root.winfo_screenwidth() // 2) - 230
    y = (root.winfo_screenheight() // 2) - 210
    root.geometry(f"460x420+{x}+{y}")

    # ─── Header with logo ────────────────────
    header = tk.Frame(root, bg=THEME["header_bg"], height=80)
    header.pack(fill="x")
    header.pack_propagate(False)

    header_inner = tk.Frame(header, bg=THEME["header_bg"])
    header_inner.pack(expand=True)

    # Try to load logo
    try:
        logo_path = resource_path("gds.png")
        logo_img = tk.PhotoImage(file=logo_path)
        # Scale down
        logo_img = logo_img.subsample(max(1, logo_img.width() // 50),
                                       max(1, logo_img.height() // 50))
        root._logo = logo_img
        tk.Label(header_inner, image=logo_img, bg=THEME["header_bg"]).pack(side="left", padx=(0, 10))
    except Exception:
        pass

    title_frame = tk.Frame(header_inner, bg=THEME["header_bg"])
    title_frame.pack(side="left")
    tk.Label(title_frame, text="Global Digital Solutions",
             font=("Segoe UI", 14, "bold"), fg="white",
             bg=THEME["header_bg"]).pack(anchor="w")
    tk.Label(title_frame, text="Attendance Agent Setup",
             font=("Segoe UI", 10), fg=THEME["text_secondary"],
             bg=THEME["header_bg"]).pack(anchor="w")

    # ─── Body ─────────────────────────────────
    body = tk.Frame(root, bg=THEME["bg_darkest"], padx=35, pady=25)
    body.pack(fill="both", expand=True)

    # Employee Code
    tk.Label(body, text="Employee Code", font=("Segoe UI", 11, "bold"),
             bg=THEME["bg_darkest"], fg=THEME["text_primary"]).pack(anchor="w")
    emp_var = tk.StringVar()
    emp_entry = tk.Entry(body, textvariable=emp_var, font=("Segoe UI", 12),
                         bg=THEME["bg_input"], fg=THEME["text_primary"],
                         insertbackground=THEME["text_primary"],
                         relief="solid", borderwidth=1,
                         highlightbackground=THEME["border"],
                         highlightcolor=THEME["primary"])
    emp_entry.pack(fill="x", pady=(4, 14))

    # Server URL
    tk.Label(body, text="Server URL", font=("Segoe UI", 11, "bold"),
             bg=THEME["bg_darkest"], fg=THEME["text_primary"]).pack(anchor="w")
    url_var = tk.StringVar(value="https://hr-portal-beryl.vercel.app")
    url_entry = tk.Entry(body, textvariable=url_var, font=("Segoe UI", 12),
                         bg=THEME["bg_input"], fg=THEME["text_primary"],
                         insertbackground=THEME["text_primary"],
                         relief="solid", borderwidth=1,
                         highlightbackground=THEME["border"],
                         highlightcolor=THEME["primary"])
    url_entry.pack(fill="x", pady=(4, 14))

    status = tk.Label(body, text="", font=("Segoe UI", 10),
                      bg=THEME["bg_darkest"])
    status.pack(pady=(0, 10))

    def on_connect():
        emp = emp_var.get().strip()
        url = url_var.get().strip()
        if not emp:
            status.config(text="Employee code is required.", fg=THEME["error"])
            return
        if not url:
            status.config(text="Server URL is required.", fg=THEME["error"])
            return

        status.config(text="Connecting...", fg=THEME["primary"])
        root.update()

        try:
            config = enroll(url, emp)
            result["config"] = config
            status.config(text="Enrolled! Starting agent...", fg=THEME["success"])
            root.after(800, root.quit)
        except requests.ConnectionError:
            status.config(text=f"Cannot connect to {url}. Check network.", fg=THEME["error"])
        except Exception as e:
            err_msg = str(e)[:80]
            status.config(text=f"Error: {err_msg}", fg=THEME["error"])

    btn = tk.Button(body, text="Connect & Start", font=("Segoe UI", 12, "bold"),
                    bg=THEME["primary"], fg="white",
                    activebackground=THEME["primary_hover"],
                    activeforeground="white",
                    relief="flat", padx=20, pady=10, cursor="hand2",
                    command=on_connect)
    btn.pack(fill="x")

    root.protocol("WM_DELETE_WINDOW", root.quit)
    root.mainloop()

    try:
        root.destroy()
    except Exception:
        pass

    return result["config"]


# ─── Activity Tracker (with Anti-AutoClicker Detection) ──────────

PATTERN_BUFFER_SIZE = 30  # Keep last 30 events (enough for analysis, saves RAM)

class ActivityTracker:
    """
    Tracks mouse/keyboard ACTIVITY timestamps and QUALITY SIGNALS.
    Optimized for LOW RESOURCE usage on old/slow systems:
      - Mouse move events throttled to 1 per 500ms (saves ~95% CPU)
      - Small buffers (30 items) for minimal RAM
      - Lightweight scoring algorithm

    PRIVACY: ONLY statistical patterns — NO content, NO keylogging.
    """

    def __init__(self):
        self._last_activity = time.time()
        self._last_move_time = 0           # Throttle: last recorded move timestamp
        self._lock = threading.Lock()
        self._system_locked = False
        self._was_locked = False

        # ── Pattern analysis buffers (small for low RAM) ──
        self._click_times = deque(maxlen=PATTERN_BUFFER_SIZE)
        self._click_positions = deque(maxlen=PATTERN_BUFFER_SIZE)
        self._move_positions = deque(maxlen=PATTERN_BUFFER_SIZE)
        self._key_count = 0
        self._mouse_count = 0
        self._scroll_count = 0
        self._last_score = 100

    # ── Event handlers (called by listeners) ──────────

    def on_activity(self):
        with self._lock:
            self._last_activity = time.time()

    def on_mouse_move(self, x, y):
        """Throttled: only records 1 move per MOVE_THROTTLE_SEC to save CPU."""
        now = time.time()
        with self._lock:
            self._last_activity = now
            # Throttle: skip if less than 500ms since last recorded move
            if (now - self._last_move_time) < MOVE_THROTTLE_SEC:
                return
            self._last_move_time = now
            self._mouse_count += 1
            self._move_positions.append((x, y, now))

    def on_mouse_click(self, x, y):
        with self._lock:
            self._last_activity = time.time()
            self._mouse_count += 1
            self._click_times.append(time.time())
            self._click_positions.append((x, y))

    def on_mouse_scroll(self):
        with self._lock:
            self._last_activity = time.time()
            self._scroll_count += 1

    def on_key_event(self):
        with self._lock:
            self._last_activity = time.time()
            self._key_count += 1

    # ── State properties ──────────────────────────────

    @property
    def current_state(self):
        with self._lock:
            if self._system_locked:
                return "IDLE"
            elapsed = time.time() - self._last_activity
        return "ACTIVE" if elapsed < IDLE_THRESHOLD_SEC else "IDLE"

    @property
    def seconds_since_activity(self):
        with self._lock:
            return time.time() - self._last_activity

    @property
    def system_locked(self):
        with self._lock:
            return self._system_locked

    @system_locked.setter
    def system_locked(self, value):
        with self._lock:
            self._system_locked = value

    @property
    def was_locked(self):
        with self._lock:
            return self._was_locked

    @was_locked.setter
    def was_locked(self, value):
        with self._lock:
            self._was_locked = value

    # ── Activity Score Calculation ────────────────────

    def calculate_activity_score(self):
        """
        Analyze recent activity patterns and return a score 0-100.
          70-100 = Genuine human
          30-69  = Suspicious (flagged for HR)
          0-29   = Likely auto-clicker

        Resets counters after calculation (called each heartbeat).
        """
        with self._lock:
            click_times = list(self._click_times)
            click_positions = list(self._click_positions)
            move_positions = list(self._move_positions)
            key_count = self._key_count
            mouse_count = self._mouse_count
            scroll_count = self._scroll_count

            # Reset counters for next period
            self._key_count = 0
            self._mouse_count = 0
            self._scroll_count = 0

        total_events = key_count + mouse_count + scroll_count

        # If zero events AND buffers empty → truly no data, can't judge
        if total_events == 0 and len(click_times) < 3:
            self._last_score = 100
            return 100

        # ── Signal 0: Activity density (20 pts) ──────────
        # Real active work generates 30+ events per 3 minutes (mouse moves,
        # keyboard presses, scrolls). An auto-clicker doing 1 click / 2 min
        # generates only 1-2 events per period — extremely low for "ACTIVE" state.
        density_score = 20
        if total_events < 3:
            density_score = 0       # Almost no events while "ACTIVE" → very suspicious
        elif total_events < 8:
            density_score = 5
        elif total_events < 15:
            density_score = 10
        elif total_events < 25:
            density_score = 15
        # else: 20 (healthy)

        # ── Signal 1: Click interval variance (20 pts) ────
        # Real humans have random intervals. Auto-clickers are perfectly timed.
        interval_score = 20
        if len(click_times) >= 3:  # Use accumulated buffer (not just per-period)
            intervals = [click_times[i] - click_times[i - 1] for i in range(1, len(click_times))]
            if intervals:
                mean_interval = sum(intervals) / len(intervals)
                if mean_interval > 0:
                    # Coefficient of variation (std/mean)
                    variance = sum((i - mean_interval) ** 2 for i in intervals) / len(intervals)
                    std_dev = math.sqrt(variance)
                    cv = std_dev / mean_interval  # 0 = perfectly regular, >0.3 = natural

                    if cv < 0.05:       # Almost zero variance → auto-clicker
                        interval_score = 0
                    elif cv < 0.10:
                        interval_score = 4
                    elif cv < 0.15:
                        interval_score = 8
                    elif cv < 0.20:
                        interval_score = 12
                    elif cv < 0.30:
                        interval_score = 16
                    else:
                        interval_score = 20  # Natural randomness

        # ── Signal 2: Mouse position diversity (20 pts) ────
        # Real humans click many different positions. Auto-clickers repeat same spot.
        position_score = 20
        if len(click_positions) >= 3:  # Use accumulated buffer
            unique_positions = set()
            for x, y in click_positions:
                # Bucket to 20px grid (ignore tiny jitter)
                unique_positions.add((x // 20, y // 20))

            diversity = len(unique_positions) / len(click_positions)

            if diversity < 0.05:       # Almost all same spot
                position_score = 0
            elif diversity < 0.10:
                position_score = 4
            elif diversity < 0.20:
                position_score = 8
            elif diversity < 0.40:
                position_score = 12
            elif diversity < 0.60:
                position_score = 16
            else:
                position_score = 20  # Good variety

        # ── Signal 3: Keyboard+Mouse mix (20 pts) ──────────
        # Real work uses BOTH keyboard and mouse. Auto-clickers use only mouse.
        mix_score = 20
        if total_events > 3:  # Lower threshold to catch low-frequency clickers
            key_ratio = key_count / total_events
            has_scroll = scroll_count > 0

            if key_count == 0 and not has_scroll:
                # Mouse-only with no keyboard or scroll → very suspicious
                mix_score = 0
            elif key_count == 0:
                mix_score = 6  # Has scroll but no keyboard
            elif key_ratio < 0.05:
                mix_score = 10
            elif key_ratio < 0.10:
                mix_score = 15
            else:
                mix_score = 20  # Healthy mix

        # ── Signal 4: Movement naturalness (20 pts) ────────
        # Real mouse movement has curves. Auto-clickers teleport or move linearly.
        move_score = 20
        if len(move_positions) >= 5:  # Lower threshold
            # Check for "teleporting" — large jumps with no intermediate positions
            distances = []
            speeds = []
            for i in range(1, len(move_positions)):
                x1, y1, t1 = move_positions[i - 1]
                x2, y2, t2 = move_positions[i]
                dist = math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
                dt = max(t2 - t1, 0.001)
                distances.append(dist)
                speeds.append(dist / dt)

            if speeds:
                mean_speed = sum(speeds) / len(speeds)
                if mean_speed > 0:
                    speed_variance = sum((s - mean_speed) ** 2 for s in speeds) / len(speeds)
                    speed_cv = math.sqrt(speed_variance) / mean_speed

                    # Real movement has variable speed (acceleration/deceleration)
                    if speed_cv < 0.05:     # Constant speed = robotic
                        move_score = 0
                    elif speed_cv < 0.10:
                        move_score = 4
                    elif speed_cv < 0.20:
                        move_score = 10
                    elif speed_cv < 0.30:
                        move_score = 15
                    else:
                        move_score = 20  # Natural acceleration patterns

        total_score = density_score + interval_score + position_score + mix_score + move_score
        self._last_score = total_score
        return total_score

    @property
    def last_score(self):
        return self._last_score


# ─── Lock Monitor Thread ─────────────────────────────────────────

def start_lock_monitor(tracker):
    """
    Background thread that polls for Windows workstation lock status.
    When locked → marks tracker as locked (instant IDLE).
    When unlocked → marks for popup trigger.
    """
    def monitor():
        was_locked = False
        while True:
            try:
                locked = is_system_locked()
                if locked and not was_locked:
                    # Just locked
                    tracker.system_locked = True
                    tracker.was_locked = True
                    log.info("System LOCKED — marking IDLE instantly")
                elif not locked and was_locked:
                    # Just unlocked
                    tracker.system_locked = False
                    log.info("System UNLOCKED — will show popup")
                was_locked = locked
            except Exception:
                pass
            time.sleep(3)  # Check every 3s (low CPU, still responsive)

    t = threading.Thread(target=monitor, daemon=True)
    t.start()
    log.info("Lock monitor started")
    return t


# ─── Input Listeners ─────────────────────────────────────────────

def start_listeners(tracker, idle_popup=None):
    """
    Start mouse/keyboard listeners with pattern-aware event handlers.
    Ignores activity when popup is showing.
    PRIVACY: Only timestamps and positions are tracked — no content.
    """

    def on_move(x, y):
        if idle_popup and idle_popup.popup_showing:
            return  # Ignore — user is interacting with popup
        tracker.on_mouse_move(x, y)

    def on_click(x, y, button, pressed):
        if idle_popup and idle_popup.popup_showing:
            return
        if pressed:
            tracker.on_mouse_click(x, y)

    def on_scroll(x, y, dx, dy):
        if idle_popup and idle_popup.popup_showing:
            return
        tracker.on_mouse_scroll()

    mouse_listener = mouse.Listener(
        on_move=on_move,
        on_click=on_click,
        on_scroll=on_scroll,
    )

    def on_press(key):
        if idle_popup and idle_popup.popup_showing:
            return  # Don't register popup typing as activity
        tracker.on_key_event()

    def on_release(key):
        if idle_popup and idle_popup.popup_showing:
            return
        # Only count presses, not releases, to avoid double-counting
        pass

    keyboard_listener = keyboard.Listener(
        on_press=on_press,
        on_release=on_release,
    )

    mouse_listener.daemon = True
    keyboard_listener.daemon = True
    mouse_listener.start()
    keyboard_listener.start()

    log.info("Input listeners started (activity + pattern detection — no keylogging)")

    # ── Watchdog: restart listeners if they die ───────
    def listener_watchdog():
        nonlocal mouse_listener, keyboard_listener
        while True:
            time.sleep(30)
            try:
                if not mouse_listener.is_alive():
                    log.warning("Mouse listener died — restarting")
                    mouse_listener = mouse.Listener(on_move=on_move, on_click=on_click, on_scroll=on_scroll)
                    mouse_listener.daemon = True
                    mouse_listener.start()
                if not keyboard_listener.is_alive():
                    log.warning("Keyboard listener died — restarting")
                    keyboard_listener = keyboard.Listener(on_press=on_press, on_release=on_release)
                    keyboard_listener.daemon = True
                    keyboard_listener.start()
            except Exception as e:
                log.error("Listener watchdog error: %s", e)

    wd = threading.Thread(target=listener_watchdog, daemon=True)
    wd.start()

    return mouse_listener, keyboard_listener


# ─── Idle Popup (Break Reason Form) ──────────────────────────────

class IdlePopup:
    """
    Shows a FULLSCREEN popup when the employee goes IDLE or locks their system.
    Styled with GDS portal dark theme and company branding.
    Employee MUST select a category AND type a reason — the form will NOT close otherwise.
    """

    def __init__(self, config, tracker):
        self._config = config
        self._tracker = tracker
        self._popup_open = False
        self._popup_lock = threading.Lock()
        self._break_active = False
        self._popup_show_time = 0
        self.popup_showing = False  # Public flag to suppress activity tracking

    @property
    def is_open(self):
        with self._popup_lock:
            return self._popup_open

    @property
    def break_active(self):
        with self._popup_lock:
            return self._break_active

    def show_popup(self):
        """
        Show the fullscreen idle reason popup. Blocks until submitted.
        HYBRID APPROACH:
          1. Form appears  → break STARTS (POST startedAt to DB, reason pending)
          2. Form submitted → reason SAVED (PATCH reason onto the open break)
          3. Employee works → break ENDS  (PATCH endedAt from main_loop)
        """
        with self._popup_lock:
            if self._popup_open:
                return
            self._popup_open = True

        self._popup_show_time = time.time()  # Break timer starts NOW
        self.popup_showing = True
        log.info("Break timer started (form appeared)")

        # Step 1: Immediately create an open break in DB (no reason yet)
        self._send_break_start()

        try:
            self._run_popup()
        except Exception as e:
            log.error("Popup error: %s", e)
        finally:
            self.popup_showing = False
            with self._popup_lock:
                self._popup_open = False

    def _run_popup(self):
        """Create and run the fullscreen popup window with GDS branding."""
        root = tk.Tk()
        root.title("GDS Attendance Monitor — Break Reason")
        root.configure(bg=THEME["bg_darkest"])

        # ─── FULLSCREEN — covers everything ───────
        root.attributes("-fullscreen", True)
        root.attributes("-topmost", True)

        # Keep it always on top (re-enforce every second)
        # NOTE: Do NOT call focus_force() — it steals focus from Entry widgets
        def stay_on_top():
            try:
                root.attributes("-topmost", True)
                root.lift()
                root.after(1000, stay_on_top)
            except Exception:
                pass
        root.after(500, stay_on_top)

        # Block closing — X button, Alt+F4, everything
        root.protocol("WM_DELETE_WINDOW", lambda: None)
        root.bind("<Alt-F4>", lambda e: "break")
        root.bind("<Escape>", lambda e: "break")

        # ─── Center card ──────────────────────────
        root.grid_rowconfigure(0, weight=1)
        root.grid_columnconfigure(0, weight=1)

        # Main card
        card = tk.Frame(root, bg=THEME["bg_card"], padx=0, pady=0,
                        highlightbackground=THEME["border"], highlightthickness=2)
        card.grid(row=0, column=0)

        # ─── Header with GDS branding ────────────
        header = tk.Frame(card, bg=THEME["header_bg"], width=520, height=80)
        header.pack(fill="x")
        header.pack_propagate(False)

        header_inner = tk.Frame(header, bg=THEME["header_bg"])
        header_inner.pack(expand=True)

        # Logo
        try:
            logo_path = resource_path("gds.png")
            logo_img = tk.PhotoImage(file=logo_path)
            scale = max(1, logo_img.width() // 45)
            logo_img = logo_img.subsample(scale, scale)
            root._logo = logo_img  # prevent GC
            tk.Label(header_inner, image=logo_img,
                     bg=THEME["header_bg"]).pack(side="left", padx=(0, 12))
        except Exception:
            pass

        title_frame = tk.Frame(header_inner, bg=THEME["header_bg"])
        title_frame.pack(side="left")
        tk.Label(title_frame, text="Global Digital Solutions",
                 font=("Segoe UI", 15, "bold"), fg="white",
                 bg=THEME["header_bg"]).pack(anchor="w")
        tk.Label(title_frame, text="Attendance & Break Monitor",
                 font=("Segoe UI", 10), fg=THEME["text_secondary"],
                 bg=THEME["header_bg"]).pack(anchor="w")

        # ─── "You Are Idle" banner ────────────────
        idle_banner = tk.Frame(card, bg=THEME["warning"], height=40)
        idle_banner.pack(fill="x")
        idle_banner.pack_propagate(False)
        tk.Label(idle_banner, text="⚠  You Are Currently Idle",
                 font=("Segoe UI", 13, "bold"), fg="#1e293b",
                 bg=THEME["warning"]).pack(pady=8)

        # ─── Body ────────────────────────────────
        body = tk.Frame(card, bg=THEME["bg_card"], padx=40, pady=25, width=520)
        body.pack(fill="both")

        tk.Label(body, text="Select break category:",
                 font=("Segoe UI", 12, "bold"),
                 bg=THEME["bg_card"], fg=THEME["text_primary"]).pack(anchor="w", pady=(0, 10))

        reason_var = tk.StringVar(value="")
        custom_var = tk.StringVar(value="")

        # ─── Radio buttons with dark theme ────────
        radio_frame = tk.Frame(body, bg=THEME["bg_card"])
        radio_frame.pack(fill="x")

        for reason in BREAK_REASONS:
            rb = tk.Radiobutton(
                radio_frame, text=reason, variable=reason_var, value=reason,
                font=("Segoe UI", 13), bg=THEME["bg_card"],
                fg=THEME["text_primary"], activebackground=THEME["bg_hover"],
                activeforeground=THEME["text_primary"],
                selectcolor=THEME["bg_input"],
                anchor="w", padx=15, pady=4,
                command=lambda: submit_btn.config(state="normal"),
            )
            rb.pack(fill="x", pady=1)

        # ─── Reason text input (mandatory for ALL) ─────
        tk.Label(body, text="Enter reason (required):",
                 font=("Segoe UI", 12, "bold"),
                 bg=THEME["bg_card"], fg=THEME["text_primary"]).pack(anchor="w", pady=(16, 6))

        reason_entry = tk.Entry(body, textvariable=custom_var,
                                font=("Segoe UI", 12), width=45,
                                bg=THEME["bg_input"], fg=THEME["text_primary"],
                                insertbackground=THEME["text_primary"],
                                relief="solid", borderwidth=1,
                                highlightbackground=THEME["border"],
                                highlightcolor=THEME["primary"])
        reason_entry.pack(fill="x", pady=(0, 4))

        reason_hint = tk.Label(body,
                               text="e.g. Meeting with manager, Lunch, Zuhr prayer, etc.",
                               font=("Segoe UI", 9),
                               bg=THEME["bg_card"], fg=THEME["text_dark"])
        reason_hint.pack(anchor="w")

        # ─── Status + Submit ──────────────────────
        status_label = tk.Label(body, text="", font=("Segoe UI", 10),
                                bg=THEME["bg_card"])
        status_label.pack(pady=(10, 0))

        submit_btn = tk.Button(body, text="Submit Break Reason",
                               font=("Segoe UI", 14, "bold"),
                               bg=THEME["primary"], fg="white",
                               activebackground=THEME["primary_hover"],
                               activeforeground="white",
                               relief="flat", padx=30, pady=12,
                               state="disabled", cursor="hand2")

        def on_submit():
            reason = reason_var.get()
            custom = custom_var.get().strip()

            if not reason:
                status_label.config(text="Please select a category.", fg=THEME["error"])
                return
            if not custom:
                status_label.config(text="Please type your reason — it is required.",
                                    fg=THEME["error"])
                reason_entry.focus_set()
                return

            status_label.config(text="Submitting...", fg=THEME["primary"])
            submit_btn.config(state="disabled")

            # Step 2: Update the open break with reason (PATCH)
            success = self._send_break_reason(reason, custom)

            if success:
                elapsed = round((time.time() - self._popup_show_time) / 60)
                status_label.config(
                    text=f"Submitted! Idle so far: {elapsed} min. Closing...",
                    fg=THEME["success"])
                root.after(500, root.quit)
            else:
                status_label.config(text="Server error. Please try again.", fg=THEME["error"])
                submit_btn.config(state="normal")

        submit_btn.config(command=on_submit)
        submit_btn.pack(pady=(12, 0), fill="x")

        # ─── Footer ──────────────────────────────
        footer = tk.Frame(card, bg=THEME["bg_card"], height=40)
        footer.pack(fill="x")
        footer.pack_propagate(False)
        tk.Label(footer,
                 text="This form will close after you submit. Select a category and type your reason.",
                 font=("Segoe UI", 9), bg=THEME["bg_card"],
                 fg=THEME["text_dark"]).pack(pady=10)

        # ─── Run — blocks until submitted ─────────
        root.mainloop()

        try:
            root.destroy()
        except Exception:
            pass

    def _send_break_start(self):
        """
        Step 1: Create an OPEN break in DB when the form appears.
        startedAt = now, reason = "Pending" (employee hasn't chosen yet).
        Break stays open until employee becomes ACTIVE again.
        """
        url = f"{self._config['serverUrl']}/api/agent/break-log"
        started_iso = datetime.fromtimestamp(self._popup_show_time, tz=timezone.utc).isoformat().replace("+00:00", "Z")

        payload = {
            "deviceId": self._config["deviceId"],
            "deviceToken": self._config["deviceToken"],
            "empCode": self._config["empCode"],
            "reason": "Pending",
            "customReason": "Waiting for employee to submit reason",
            "startedAt": started_iso,
        }

        for attempt in range(3):
            try:
                resp = _http.post(url, json=payload, timeout=20)
                if resp.status_code == 200:
                    log.info("Break opened in DB (form appeared)")
                    with self._popup_lock:
                        self._break_active = True
                    return True
                else:
                    log.warning("Break start failed (attempt %d): HTTP %d", attempt + 1, resp.status_code)
            except Exception as e:
                log.warning("Break start error (attempt %d): %s", attempt + 1, e)
            if attempt < 2:
                time.sleep(2)

        log.error("Break start FAILED after 3 attempts")
        return False

    def _send_break_reason(self, reason, custom_reason):
        """
        Step 2: Update the open break with the employee's chosen reason.
        Called when the form is submitted. Retries up to 3 times.
        """
        url = f"{self._config['serverUrl']}/api/agent/break-log"

        payload = {
            "deviceId": self._config["deviceId"],
            "deviceToken": self._config["deviceToken"],
            "empCode": self._config["empCode"],
            "action": "update-reason",
            "reason": reason,
            "customReason": custom_reason,
        }

        for attempt in range(3):
            try:
                resp = _http.patch(url, json=payload, timeout=20)
                if resp.status_code == 200:
                    log.info("Break reason updated: %s — %s", reason, custom_reason)
                    return True
                else:
                    log.warning("Break reason update failed (attempt %d): HTTP %d", attempt + 1, resp.status_code)
            except Exception as e:
                log.warning("Break reason update error (attempt %d): %s", attempt + 1, e)
            if attempt < 2:
                time.sleep(2)  # Wait 2s before retry

        log.error("Break reason update FAILED after 3 attempts")
        return False

    def send_break_end(self):
        """
        Step 3: Close the open break when employee becomes ACTIVE.
        Sets endedAt = now, calculates duration. Retries up to 3 times.
        """
        with self._popup_lock:
            if not self._break_active:
                return
            self._break_active = False

        url = f"{self._config['serverUrl']}/api/agent/break-log"
        payload = {
            "deviceId": self._config["deviceId"],
            "deviceToken": self._config["deviceToken"],
            "empCode": self._config["empCode"],
            "action": "end-break",
        }

        for attempt in range(3):
            try:
                resp = _http.patch(url, json=payload, timeout=20)
                if resp.status_code == 200:
                    data = resp.json()
                    log.info("Break ended: %s", data.get("message", ""))
                    return
                else:
                    log.warning("Break end failed (attempt %d): HTTP %d", attempt + 1, resp.status_code)
            except Exception as e:
                log.warning("Break end error (attempt %d): %s", attempt + 1, e)
            if attempt < 2:
                time.sleep(2)

        log.error("Break end FAILED after 3 attempts")


# ─── Heartbeat Sender ────────────────────────────────────────────

def send_heartbeat(config, state, activity_score=None):
    url = f"{config['serverUrl']}/api/agent/heartbeat"
    payload = {
        "deviceId": config["deviceId"],
        "deviceToken": config["deviceToken"],
        "empCode": config["empCode"],
        "state": state,
    }

    if activity_score is not None:
        payload["activityScore"] = activity_score

    try:
        resp = _http.post(url, json=payload, timeout=15)
        if resp.status_code == 200:
            data = resp.json()
            action = data.get("action", "unknown")
            score_str = f" | score={activity_score}" if activity_score is not None else ""
            log.info("Heartbeat OK | state=%s | action=%s%s", state, action, score_str)
            return True
        elif resp.status_code == 401:
            log.error("Heartbeat REJECTED (401) — device may be revoked")
            return False
        else:
            log.warning("Heartbeat failed: HTTP %d — %s", resp.status_code, resp.text[:200])
            return False
    except requests.RequestException as e:
        log.warning("Heartbeat network error: %s", e)
        return False


# ─── Main Loop ────────────────────────────────────────────────────

def main_loop(config, tracker, idle_popup):
    """
    Main heartbeat loop with idle popup integration.
    Shows popup on IDLE, on system lock, and re-shows every 180s if still idle.
    """
    interval = config.get("heartbeatIntervalSec", HEARTBEAT_INTERVAL_SEC)
    last_state = None
    last_heartbeat_time = 0
    last_popup_time = 0
    retry_delay = 5
    max_retry_delay = 120
    was_locked_handled = False  # track if we already handled this lock session

    log.info("Heartbeat loop started (interval=%ds, idle_threshold=%ds)", interval, IDLE_THRESHOLD_SEC)

    while True:
        try:
            current_state = tracker.current_state
            now = time.time()
            time_since_last = now - last_heartbeat_time

            state_changed = current_state != last_state
            interval_elapsed = time_since_last >= interval

            # ── System Lock → Instant popup ───────────────
            if tracker.was_locked and not tracker.system_locked and not was_locked_handled:
                # System was just UNLOCKED — show popup immediately
                was_locked_handled = True
                if not idle_popup.is_open:
                    last_popup_time = now
                    log.info("System unlocked — showing break reason popup")
                    threading.Thread(target=idle_popup.show_popup, daemon=True).start()

            if tracker.system_locked:
                was_locked_handled = False  # reset so we catch the next unlock

            # ── Idle → Show popup ────────────────────────
            # Only re-show after IDLE_THRESHOLD_SEC since last popup.
            # last_popup_time resets to 0 when employee becomes ACTIVE,
            # so (now - 0) is always >= 180 → first idle triggers immediately.
            if current_state == "IDLE" and not idle_popup.is_open:
                time_since_popup = now - last_popup_time
                if time_since_popup >= IDLE_THRESHOLD_SEC:
                    last_popup_time = now
                    log.info("Employee is IDLE — showing break reason popup")
                    threading.Thread(target=idle_popup.show_popup, daemon=True).start()

            # ── Active again → Close break + reset trackers ────
            if current_state == "ACTIVE" and last_state == "IDLE":
                log.info("Employee is ACTIVE again")
                last_popup_time = 0
                tracker.was_locked = False  # reset lock flag
                # Step 3: Close the open break (sets endedAt = now)
                threading.Thread(target=idle_popup.send_break_end, daemon=True).start()

            # ── Calculate activity score ───────────────────
            activity_score = None
            if current_state == "ACTIVE":
                activity_score = tracker.calculate_activity_score()
                if activity_score < 30:
                    log.warning("Low activity score: %d — possible auto-clicker", activity_score)

            # ── Send heartbeat ─────────────────────────────
            if state_changed or interval_elapsed:
                success = send_heartbeat(config, current_state, activity_score)

                if success:
                    last_state = current_state
                    last_heartbeat_time = time.time()
                    retry_delay = 5
                else:
                    log.info("Retrying in %ds...", retry_delay)
                    time.sleep(retry_delay)
                    retry_delay = min(retry_delay * 2, max_retry_delay)
                    continue

            time.sleep(3)  # Poll every 3s (low CPU on old systems)

        except KeyboardInterrupt:
            log.info("Agent stopped by user (Ctrl+C)")
            break
        except Exception as e:
            log.error("Unexpected error in main loop: %s", e, exc_info=True)
            # Reset HTTP session on repeated errors (stale connection fix)
            try:
                _http.close()
                _http.mount("http://", HTTPAdapter(pool_connections=1, pool_maxsize=2, max_retries=_retry_strategy))
                _http.mount("https://", HTTPAdapter(pool_connections=1, pool_maxsize=2, max_retries=_retry_strategy))
            except Exception:
                pass
            time.sleep(10)


# ─── Entry Point ──────────────────────────────────────────────────

def main():
    safe_print("=" * 55)
    safe_print("  GDS Attendance & Break Monitor — Agent v" + AGENT_VERSION)
    safe_print("  PRIVACY: Only activity signals (ACTIVE/IDLE)")
    safe_print("  NO screenshots, NO keylogging, NO file access")
    safe_print("=" * 55)
    safe_print()

    # ── Prevent duplicate instances ────────────────────
    if not ensure_single_instance():
        safe_print("Agent is already running. Exiting.")
        sys.exit(0)

    config = load_config()

    if not config:
        # First run — show GUI enrollment dialog
        config = gui_enroll()
        if not config:
            sys.exit(1)

        # Set up auto-start on boot
        setup_autostart()
    else:
        log.info("Loaded existing config for %s (device: %s)",
                 config["empCode"], config["deviceId"][:8] + "...")
        # Always verify auto-start is valid (exe might have been moved)
        if not is_autostart_enabled():
            setup_autostart()

    # Start activity listeners + idle popup
    tracker = ActivityTracker()
    idle_popup = IdlePopup(config, tracker)
    listeners = start_listeners(tracker, idle_popup)

    # Start system lock monitor
    start_lock_monitor(tracker)

    safe_print("Agent is running in background.")
    safe_print("Press Ctrl+C to stop.\n")

    # Start heartbeat loop (blocks)
    main_loop(config, tracker, idle_popup)

    # Cleanup
    for listener in listeners:
        listener.stop()

    log.info("Agent shut down cleanly.")


def run_with_auto_restart():
    """
    Wrapper that auto-restarts the agent if it crashes.
    NEVER gives up — the agent must always be running during the shift.
    Crash counter resets if the agent ran for 2+ minutes (not a boot-loop).
    """
    crash_count = 0
    crash_window = 120  # Reset crash count if agent ran for 2+ minutes
    max_rapid_crashes = 10  # Only pause longer after 10 rapid crashes
    
    while True:
        start_time = time.time()
        try:
            main()
            break  # Clean exit — don't restart
        except KeyboardInterrupt:
            safe_print("\nAgent stopped by user.")
            break
        except SystemExit as e:
            # Only break on intentional exit (single-instance check)
            if str(e) == "0":
                break
            # Other SystemExit (errors) — restart
            log.error("Agent SystemExit: %s", e)
        except Exception as e:
            elapsed = time.time() - start_time
            log.error("Agent crashed after %.0fs: %s", elapsed, e, exc_info=True)
            
            if elapsed > crash_window:
                crash_count = 0  # Was running fine — not a boot-loop
            
            crash_count += 1
            
            if crash_count >= max_rapid_crashes:
                # Lots of rapid crashes — wait longer but DON'T give up
                wait = 120  # 2 minutes
                log.warning("Many rapid crashes (%d). Waiting %ds before retry...", crash_count, wait)
            else:
                wait = min(10 * crash_count, 60)  # 10s, 20s, 30s... max 60s
            
            log.info("Restarting in %ds (crash %d)...", wait, crash_count)
            time.sleep(wait)
            
            # Reset HTTP session on restart (prevent stale connections)
            try:
                global _http
                _http.close()
                _http = requests.Session()
                _http.mount("http://", HTTPAdapter(pool_connections=1, pool_maxsize=2, max_retries=_retry_strategy))
                _http.mount("https://", HTTPAdapter(pool_connections=1, pool_maxsize=2, max_retries=_retry_strategy))
            except Exception:
                pass


if __name__ == "__main__":
    run_with_auto_restart()

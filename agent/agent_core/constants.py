"""
Constants, thresholds, theme colors, and break reason categories.
"""

AGENT_VERSION = "2.1.1"

# ─── Thresholds ──────────────────────────────────────────────────
IDLE_THRESHOLD_SEC = 180       # No activity for 180s (3 min) → IDLE
HEARTBEAT_INTERVAL_SEC = 180   # Send heartbeat every 3 minutes
MOVE_THROTTLE_SEC = 0.5        # Only record mouse move every 500ms (saves CPU)
PATTERN_BUFFER_SIZE = 30       # Keep last 30 events for analysis (low RAM)

# ─── Network ─────────────────────────────────────────────────────
API_TIMEOUT_HEARTBEAT = 25     # Seconds — generous for Vercel cold starts
API_TIMEOUT_BREAK = 30         # Break APIs need more time (cold start + DB write)
CONNECTIVITY_CHECK_SEC = 15    # How often to check connectivity when offline
ALIVE_SAVE_SEC = 30            # How often to persist "last alive" timestamp
DOWNTIME_MIN_GAP_SEC = 300     # 5 min — ignore gaps shorter than this on recovery
AUTOCLICKER_CHECK_SEC = 60     # How often to scan for cheat processes

# Known auto-clicker / mouse-jiggler process names (lowercase).
# If any of these are found running, the agent flags the heartbeat
# and forces the activity score to 0.
AUTOCLICKER_PROCESSES = frozenset({
    "autoclicker.exe",
    "opautoclicker.exe",
    "gs auto clicker.exe",
    "gsautoclicker.exe",
    "fast auto clicker.exe",
    "free auto clicker.exe",
    "auto mouse clicker.exe",
    "automouseclicker.exe",
    "mouse jiggler.exe",
    "mousejiggler.exe",
    "move mouse.exe",
    "movemouse.exe",
    "caffeine.exe",
    "caffeine64.exe",
    "jiggle.exe",
    "keep-alive.exe",
    "keepalive.exe",
    "clickermann.exe",
    "murgee auto clicker.exe",
    "roblox auto clicker.exe",
    "tinytask.exe",
    "macro recorder.exe",
    "macrorecorder.exe",
    "mini mouse macro.exe",
    "minimousemacro.exe",
    "ghost mouse.exe",
    "ghostmouse.exe",
    "auto keyboard.exe",
})

# ─── Break Categories ────────────────────────────────────────────
BREAK_REASONS = [
    "Official",
    "General",
    "Namaz",
]

# ─── Portal Theme Colors (matching HR portal dark theme) ─────────
THEME = {
    "bg_darkest":    "#020617",   # fullscreen overlay
    "bg_dark":       "#0f172a",   # secondary bg
    "bg_card":       "#1e293b",   # card background
    "bg_input":      "#0f172a",   # input field bg
    "bg_hover":      "#334155",   # hover
    "header_bg":     "#0a2c54",   # header background
    "primary":       "#3b82f6",   # blue button
    "primary_hover": "#2563eb",   # button hover
    "text_primary":  "#f1f5f9",   # white text
    "text_secondary":"#cbd5e1",   # light gray
    "text_muted":    "#94a3b8",   # muted text
    "text_dark":     "#64748b",   # dark muted
    "border":        "#374151",   # borders
    "success":       "#22c55e",   # green
    "error":         "#ef4444",   # red
    "warning":       "#fbbf24",   # yellow
}

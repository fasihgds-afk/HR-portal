"""
Constants, thresholds, theme colors, and break reason categories.
"""

AGENT_VERSION = "2.0.0"

# ─── Thresholds ──────────────────────────────────────────────────
IDLE_THRESHOLD_SEC = 180       # No activity for 180s (3 min) → IDLE
HEARTBEAT_INTERVAL_SEC = 180   # Send heartbeat every 3 minutes
MOVE_THROTTLE_SEC = 0.5        # Only record mouse move every 500ms (saves CPU)
PATTERN_BUFFER_SIZE = 30       # Keep last 30 events for analysis (low RAM)

# ─── Break Categories ────────────────────────────────────────────
BREAK_REASONS = [
    "Official",
    "Personal Break",
    "Namaz",
    "Others",
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

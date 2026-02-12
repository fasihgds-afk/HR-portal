"""
agent_core — Modular Attendance & Break Monitor Agent
=====================================================
Each module handles one concern:
  constants.py    → Version, thresholds, theme colors, break reasons
  config.py       → Paths, logging, config load/save, helpers
  http_client.py  → HTTP session with retry/backoff
  enrollment.py   → Server enrollment + GUI enrollment dialog
  platform_win.py → Windows: autostart, single instance, lock detection
  tracker.py      → ActivityTracker (activity signals + anti-autoClicker)
  listeners.py    → Mouse/keyboard listeners + lock monitor thread
  popup.py        → IdlePopup (fullscreen break reason form)
  heartbeat.py    → Heartbeat sender + main loop
  runner.py       → main() entry point + auto-restart wrapper
"""

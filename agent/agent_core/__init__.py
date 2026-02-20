"""
agent_core — Modular Attendance & Break Monitor Agent v2.1
==========================================================
Architecture: Tkinter main-thread event loop. Zero busy-wait.

  constants.py    → Version, thresholds, theme, break reasons
  config.py       → Paths, logging, config load/save, helpers
  http_client.py  → HTTP session with retry/pooling + SSL fix
  enrollment.py   → Server enrollment + GUI dialog
  platform_win.py → Windows: autostart, single instance, lock detection
  state.py        → AgentState dataclass (single source of truth)
  tracker.py      → ActivityTracker (anti-autoClicker scoring engine)
  listeners.py    → InputListeners (pynput → queue, only bg threads)
  api.py          → Server API calls (heartbeat, break lifecycle)
  popup.py        → IdlePopup (Toplevel on main thread, crash-hardened)
  network.py      → Connectivity monitor, offline buffer, shift fetch
  app.py          → AgentApp (Tk main loop, root.after scheduling)
  runner.py       → main() + auto-restart wrapper
"""

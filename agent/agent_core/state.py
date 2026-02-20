"""
AgentState — single source of truth for all agent state.

All mutations happen on the Tkinter main thread. No locks needed.
"""

import time
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class AgentState:
    # ── Input tracking ────────────────────────────────────────
    last_input_ts: float = field(default_factory=time.time)
    last_monotonic_ts: float = field(default_factory=time.monotonic)

    # ── Popup lifecycle (prevents double-show) ────────────────
    popup_visible: bool = False
    popup_allowed: bool = True
    awaiting_first_activity: bool = False

    # ── Break tracking ────────────────────────────────────────
    break_active: bool = False
    break_start_time: float = 0.0

    # ── Heartbeat ─────────────────────────────────────────────
    last_heartbeat_time: float = 0.0
    last_heartbeat_state: str = ""
    heartbeat_in_flight: bool = False

    # ── System lock ───────────────────────────────────────────
    system_locked: bool = False
    was_locked: bool = False
    lock_popup_handled: bool = False
    lock_start_time: float = 0.0        # When lock began (filters brief UAC prompts)

    # ── Connectivity ──────────────────────────────────────────
    online: bool = True
    offline_since: float = 0.0          # time.time() when we went offline
    offline_break_started: bool = False  # True if we auto-opened a break for disconnect
    consecutive_hb_failures: int = 0

    # ── Shift info (fetched from server, None = always-on) ────
    shift_start: Optional[str] = None   # "HH:MM" or None
    shift_end: Optional[str] = None
    shift_grace_min: int = 20
    shift_crosses_midnight: bool = False

    @property
    def idle_seconds(self) -> float:
        """
        Seconds since last real input (monotonic clock).
        Capped at 600s to absorb sleep/resume clock jumps.
        """
        raw = time.monotonic() - self.last_monotonic_ts
        return min(raw, 600.0)

    def record_activity(self):
        """Mark that real user input just happened."""
        self.last_input_ts = time.time()
        self.last_monotonic_ts = time.monotonic()

    def can_show_popup(self) -> bool:
        """Whether a new popup is allowed right now."""
        return (
            not self.popup_visible
            and self.popup_allowed
            and not self.awaiting_first_activity
        )

    def on_popup_shown(self):
        self.popup_visible = True
        self.popup_allowed = False
        self.break_active = True
        self.break_start_time = time.time()

    def on_popup_submitted(self):
        self.popup_visible = False
        self.awaiting_first_activity = True
        self.record_activity()

    def on_user_active(self):
        self.awaiting_first_activity = False
        self.popup_allowed = True
        self.was_locked = False
        self.lock_popup_handled = False
        self.break_active = False

    # ── Connectivity transitions ──────────────────────────────

    def mark_offline(self):
        if not self.online:
            return
        self.online = False
        self.offline_since = time.time()
        self.offline_break_started = False

    def mark_online(self):
        self.online = True
        self.consecutive_hb_failures = 0

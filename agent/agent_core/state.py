"""
AgentState — single source of truth for all agent state.

All mutations happen on the Tkinter main thread. No locks needed.
Eliminates the old scattered flags (_popup_open, _break_active, popup_showing)
that caused double-show, stale-data, and race-condition bugs.
"""

import time
from dataclasses import dataclass, field


@dataclass
class AgentState:
    # ── Input tracking ────────────────────────────────────────
    last_input_ts: float = field(default_factory=time.time)
    last_monotonic_ts: float = field(default_factory=time.monotonic)

    # ── Popup lifecycle (prevents double-show) ────────────────
    popup_visible: bool = False
    popup_allowed: bool = True       # False after popup shown, True after real activity
    awaiting_first_activity: bool = False  # True after submit, until real input

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

    @property
    def idle_seconds(self) -> float:
        """
        Seconds since last real input, using monotonic clock.
        Capped at 600s to absorb sleep/resume clock jumps —
        prevents instant popup spam after a long suspend.
        Any value >= 180 triggers idle; capping above that is safe.
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
        """Called the instant the popup becomes visible."""
        self.popup_visible = True
        self.popup_allowed = False      # One popup per idle episode
        self.break_active = True
        self.break_start_time = time.time()

    def on_popup_submitted(self):
        """Called when the user submits the break form."""
        self.popup_visible = False
        self.awaiting_first_activity = True   # Require real input before next popup
        self.record_activity()                # Reset idle timer (prevent instant re-trigger)

    def on_user_active(self):
        """Called when real activity is detected after a popup episode."""
        self.awaiting_first_activity = False
        self.popup_allowed = True             # Allow popup for next idle episode
        self.was_locked = False
        self.lock_popup_handled = False
        self.break_active = False

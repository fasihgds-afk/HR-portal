"""
AgentApp — the main Tkinter application.

All state, idle detection, heartbeat, popup lifecycle, and lock monitoring
run inside Tkinter's event loop via root.after(). Zero busy-wait loops.

Background threads: ONLY pynput listeners + short-lived API call threads.
None of them touch Tkinter directly.
"""

import queue
import threading
import time
import tkinter as tk

from .constants import AGENT_VERSION, IDLE_THRESHOLD_SEC, HEARTBEAT_INTERVAL_SEC
from .config import log, safe_print
from .state import AgentState
from .tracker import ActivityTracker
from .listeners import InputListeners
from .popup import IdlePopup
from .platform_win import is_system_locked
from .api import send_heartbeat, send_break_start, send_break_end
from . import http_client


class AgentApp:
    """
    Owns the Tk main loop. Schedules everything via root.after():
      _poll_input()      — drains pynput queue, updates state    (every 200ms)
      _tick()            — idle/lock/heartbeat logic             (every 3000ms)
      _check_listeners() — restarts dead pynput listeners        (every 30s)

    The root window is hidden (withdrawn). The popup is a Toplevel child.
    """

    def __init__(self, config):
        self._config = config
        self.state = AgentState()
        self._tracker = ActivityTracker()
        self._input_queue = queue.Queue()
        self._listeners = InputListeners(self._input_queue)
        self._root = None
        self._popup = None
        self._break_end_in_flight = False

    def run(self):
        """Start the agent. Blocks on Tk mainloop. Call from main thread."""
        self._root = tk.Tk()
        self._root.withdraw()  # Hidden — agent is invisible until idle popup

        self._popup = IdlePopup(self._root, self._config, self._on_popup_submitted)
        self._listeners.start()

        # Schedule recurring tasks
        self._root.after(200, self._poll_input)
        self._root.after(3000, self._tick)
        self._root.after(30000, self._check_listeners)

        log.info(
            "AgentApp v%s running (idle=%ds, heartbeat=%ds)",
            AGENT_VERSION, IDLE_THRESHOLD_SEC, HEARTBEAT_INTERVAL_SEC,
        )
        safe_print("Agent is running in background.")
        safe_print("Press Ctrl+C to stop.\n")

        try:
            self._root.mainloop()
        finally:
            self._listeners.stop()
            log.info("AgentApp shut down.")

    def stop(self):
        """Graceful shutdown from any thread."""
        try:
            self._root.quit()
        except Exception:
            pass

    # ─── Input polling (every 200ms) ─────────────────────────

    def _poll_input(self):
        """Drain the pynput event queue. Update state + tracker."""
        try:
            self._drain_queue()
        except Exception as e:
            log.error("_poll_input error: %s", e)

        interval = 500 if self.state.popup_visible else 200
        self._root.after(interval, self._poll_input)

    def _drain_queue(self):
        # While popup is visible, discard all input (popup typing isn't "work")
        if self.state.popup_visible:
            try:
                while True:
                    self._input_queue.get_nowait()
            except queue.Empty:
                pass
            return

        had_input = False
        batch = 0
        while batch < 200:  # Cap per-tick to avoid stalling the UI
            try:
                event = self._input_queue.get_nowait()
            except queue.Empty:
                break
            batch += 1
            had_input = True
            kind = event[0]
            if kind == "move":
                self._tracker.on_mouse_move(event[1], event[2], event[3])
            elif kind == "click":
                self._tracker.on_mouse_click(event[1], event[2], event[3])
            elif kind == "scroll":
                self._tracker.on_mouse_scroll()
            elif kind == "key":
                self._tracker.on_key_event()

        if had_input:
            self.state.record_activity()

            if self.state.awaiting_first_activity:
                log.info("Real activity detected after popup — ending break")
                self.state.on_user_active()
                self._send_break_end_async()

    # ─── Tick: idle / lock / heartbeat (every 3s) ────────────

    def _tick(self):
        try:
            self._do_tick()
        except Exception as e:
            log.error("_tick error: %s", e, exc_info=True)
        self._root.after(3000, self._tick)

    def _do_tick(self):
        now = time.time()

        # ── Lock detection ────────────────────────
        locked = is_system_locked()

        if locked and not self.state.system_locked:
            self.state.system_locked = True
            self.state.was_locked = True
            self.state.lock_popup_handled = False
            log.info("System LOCKED — marking IDLE")

        elif not locked and self.state.system_locked:
            self.state.system_locked = False
            log.info("System UNLOCKED")

        # ── Determine current state ──────────────
        if self.state.system_locked or self.state.idle_seconds >= IDLE_THRESHOLD_SEC:
            current = "IDLE"
        else:
            current = "ACTIVE"

        # ── Unlock → immediate popup ─────────────
        if (self.state.was_locked
                and not self.state.system_locked
                and not self.state.lock_popup_handled):
            self.state.lock_popup_handled = True
            if self.state.can_show_popup():
                self._show_popup()

        # ── Idle timeout → popup ─────────────────
        if (current == "IDLE"
                and not self.state.system_locked
                and self.state.idle_seconds >= IDLE_THRESHOLD_SEC
                and self.state.can_show_popup()):
            self._show_popup()

        # ── Heartbeat ────────────────────────────
        interval = self._config.get("heartbeatIntervalSec", HEARTBEAT_INTERVAL_SEC)
        state_changed = current != self.state.last_heartbeat_state
        interval_elapsed = (now - self.state.last_heartbeat_time) >= interval

        if (state_changed or interval_elapsed) and not self.state.heartbeat_in_flight:
            score = None
            if current == "ACTIVE":
                score = self._tracker.calculate_activity_score()
                if score is not None and score < 30:
                    log.warning("Low activity score: %d — possible auto-clicker", score)

            self.state.last_heartbeat_state = current
            self.state.last_heartbeat_time = now
            self.state.heartbeat_in_flight = True

            def do_heartbeat(s=current, sc=score):
                try:
                    send_heartbeat(self._config, s, sc)
                except Exception as e:
                    log.warning("Heartbeat thread error: %s", e)
                finally:
                    self.state.heartbeat_in_flight = False

            threading.Thread(target=do_heartbeat, daemon=True).start()

    # ─── Popup lifecycle ─────────────────────────────────────

    def _show_popup(self):
        """Show the idle popup and open a break in DB. Main thread only."""
        self.state.on_popup_shown()
        self._popup.show()

        # Fire-and-forget: create the open break record on the server
        start_time = self.state.break_start_time
        threading.Thread(
            target=send_break_start,
            args=(self._config, start_time),
            daemon=True,
        ).start()

        log.info("Idle popup shown, break_start sent (episode)")

    def _on_popup_submitted(self, reason, custom_reason):
        """Callback from IdlePopup after successful submit. Main thread."""
        self.state.on_popup_submitted()
        log.info("Popup submitted: %s — %s", reason, custom_reason)

    def _send_break_end_async(self):
        """Send break_end in a worker thread. Prevents duplicate calls."""
        if self._break_end_in_flight:
            return
        self._break_end_in_flight = True

        def do_call():
            try:
                send_break_end(self._config)
            except Exception as e:
                log.warning("Break end thread error: %s", e)
            finally:
                self._break_end_in_flight = False

        threading.Thread(target=do_call, daemon=True).start()

    # ─── Listener watchdog (every 30s) ───────────────────────

    def _check_listeners(self):
        try:
            self._listeners.check_and_restart()
        except Exception as e:
            log.error("Listener watchdog error: %s", e)
        self._root.after(30000, self._check_listeners)

"""
Mouse/keyboard input listeners + system lock monitor thread.
PRIVACY: Only timestamps and positions — no content captured.
"""

import time
import threading

from pynput import mouse, keyboard

from .config import log
from .platform_win import is_system_locked


# ─── Input Listeners ─────────────────────────────────────────────

def start_listeners(tracker, idle_popup=None):
    """
    Start mouse/keyboard listeners with pattern-aware event handlers.
    Ignores activity when popup is showing.
    Includes a watchdog that restarts dead listeners.
    """

    def on_move(x, y):
        if idle_popup and idle_popup.popup_showing:
            return
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

    def on_press(key):
        if idle_popup and idle_popup.popup_showing:
            return
        tracker.on_key_event()

    def on_release(key):
        pass  # Only count presses to avoid double-counting

    mouse_listener = mouse.Listener(on_move=on_move, on_click=on_click, on_scroll=on_scroll)
    keyboard_listener = keyboard.Listener(on_press=on_press, on_release=on_release)

    mouse_listener.daemon = True
    keyboard_listener.daemon = True
    mouse_listener.start()
    keyboard_listener.start()

    log.info("Input listeners started (activity + pattern detection — no keylogging)")

    # ── Watchdog: restart listeners if they die silently ──────
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


# ─── Lock Monitor Thread ─────────────────────────────────────────

def start_lock_monitor(tracker):
    """
    Background thread that polls for Windows workstation lock status.
    When locked → marks tracker as IDLE instantly.
    When unlocked → marks for popup trigger.
    """

    def monitor():
        was_locked = False
        while True:
            try:
                locked = is_system_locked()
                if locked and not was_locked:
                    tracker.system_locked = True
                    tracker.was_locked = True
                    log.info("System LOCKED — marking IDLE instantly")
                elif not locked and was_locked:
                    tracker.system_locked = False
                    log.info("System UNLOCKED — will show popup")
                was_locked = locked
            except Exception:
                pass
            time.sleep(3)

    t = threading.Thread(target=monitor, daemon=True)
    t.start()
    log.info("Lock monitor started")
    return t

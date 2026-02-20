"""
Input listeners — pynput mouse/keyboard → queue.Queue().

These are the ONLY background threads in the agent.
They NEVER touch Tkinter. They put lightweight event tuples into a
thread-safe queue that the main thread drains via root.after().
"""

import time
import queue

from pynput import mouse, keyboard

from .config import log
from .constants import MOVE_THROTTLE_SEC


class InputListeners:
    """Manages pynput listeners that feed events into a shared queue."""

    def __init__(self, input_queue: queue.Queue):
        self._queue = input_queue
        self._mouse = None
        self._keyboard = None

    def start(self):
        """Create and start mouse + keyboard listeners."""
        q = self._queue

        # Use closure-local mutable to avoid self-attribute access from pynput thread
        last_move = [0.0]

        def on_move(x, y):
            try:
                now = time.time()
                if now - last_move[0] < MOVE_THROTTLE_SEC:
                    return
                last_move[0] = now
                q.put(("move", x, y, now))
            except Exception:
                pass

        def on_click(x, y, button, pressed):
            try:
                if pressed:
                    q.put(("click", x, y, time.time()))
            except Exception:
                pass

        def on_scroll(x, y, dx, dy):
            try:
                q.put(("scroll", time.time()))
            except Exception:
                pass

        def on_press(key):
            try:
                q.put(("key", time.time()))
            except Exception:
                pass

        self._mouse = mouse.Listener(on_move=on_move, on_click=on_click, on_scroll=on_scroll)
        self._keyboard = keyboard.Listener(on_press=on_press)

        self._mouse.daemon = True
        self._keyboard.daemon = True
        self._mouse.start()
        self._keyboard.start()

        log.info("Input listeners started (queue-based, no direct Tk access)")

    def check_and_restart(self):
        """Restart dead listeners. Called from main thread via root.after()."""
        try:
            if self._mouse and not self._mouse.is_alive():
                log.warning("Mouse listener died — restarting")
                self.start()
            elif self._keyboard and not self._keyboard.is_alive():
                log.warning("Keyboard listener died — restarting")
                self.start()
        except Exception as e:
            log.error("Listener restart error: %s", e)

    def stop(self):
        """Stop both listeners."""
        if self._mouse:
            try:
                self._mouse.stop()
            except Exception:
                pass
        if self._keyboard:
            try:
                self._keyboard.stop()
            except Exception:
                pass

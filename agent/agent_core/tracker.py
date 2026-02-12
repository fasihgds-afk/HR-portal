"""
ActivityTracker — tracks mouse/keyboard activity timestamps and quality signals.

Optimized for LOW RESOURCE usage on old/slow systems:
  - Mouse move events throttled to 1 per 500ms (saves ~95% CPU)
  - Small buffers (30 items) for minimal RAM
  - Lightweight scoring algorithm

PRIVACY: ONLY statistical patterns — NO content, NO keylogging.
"""

import math
import time
import threading
from collections import deque

from .constants import IDLE_THRESHOLD_SEC, MOVE_THROTTLE_SEC, PATTERN_BUFFER_SIZE


class ActivityTracker:
    """Tracks activity timestamps and computes anti-autoClicker scores."""

    def __init__(self):
        self._last_activity = time.time()
        self._last_move_time = 0
        self._lock = threading.Lock()
        self._system_locked = False
        self._was_locked = False

        # Pattern analysis buffers (small for low RAM)
        self._click_times = deque(maxlen=PATTERN_BUFFER_SIZE)
        self._click_positions = deque(maxlen=PATTERN_BUFFER_SIZE)
        self._move_positions = deque(maxlen=PATTERN_BUFFER_SIZE)
        self._key_count = 0
        self._mouse_count = 0
        self._scroll_count = 0
        self._last_score = 100

    # ── Event handlers (called by listeners) ──────────────────

    def on_activity(self):
        with self._lock:
            self._last_activity = time.time()

    def on_mouse_move(self, x, y):
        """Throttled: only records 1 move per MOVE_THROTTLE_SEC."""
        now = time.time()
        with self._lock:
            self._last_activity = now
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

    # ── State properties ─────────────────────────────────────

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

    # ── Activity Score (Anti-AutoClicker) ────────────────────

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

        # Truly no data — can't judge
        if total_events == 0 and len(click_times) < 3:
            self._last_score = 100
            return 100

        # Signal 0: Activity density (20 pts)
        density_score = self._score_density(total_events)

        # Signal 1: Click interval variance (20 pts)
        interval_score = self._score_click_intervals(click_times)

        # Signal 2: Mouse position diversity (20 pts)
        position_score = self._score_position_diversity(click_positions)

        # Signal 3: Keyboard+Mouse mix (20 pts)
        mix_score = self._score_input_mix(key_count, scroll_count, total_events)

        # Signal 4: Movement naturalness (20 pts)
        move_score = self._score_movement_naturalness(move_positions)

        total_score = density_score + interval_score + position_score + mix_score + move_score
        self._last_score = total_score
        return total_score

    @property
    def last_score(self):
        return self._last_score

    # ── Private scoring helpers ──────────────────────────────

    @staticmethod
    def _score_density(total_events):
        """Real work generates 30+ events/3min. Auto-clickers generate 1-2."""
        if total_events < 3:
            return 0
        elif total_events < 8:
            return 5
        elif total_events < 15:
            return 10
        elif total_events < 25:
            return 15
        return 20

    @staticmethod
    def _score_click_intervals(click_times):
        """Real humans have random intervals. Auto-clickers are perfectly timed."""
        if len(click_times) < 3:
            return 20

        intervals = [click_times[i] - click_times[i - 1] for i in range(1, len(click_times))]
        if not intervals:
            return 20

        mean_interval = sum(intervals) / len(intervals)
        if mean_interval <= 0:
            return 20

        variance = sum((i - mean_interval) ** 2 for i in intervals) / len(intervals)
        cv = math.sqrt(variance) / mean_interval  # coefficient of variation

        if cv < 0.05:
            return 0
        elif cv < 0.10:
            return 4
        elif cv < 0.15:
            return 8
        elif cv < 0.20:
            return 12
        elif cv < 0.30:
            return 16
        return 20

    @staticmethod
    def _score_position_diversity(click_positions):
        """Real humans click many positions. Auto-clickers repeat same spot."""
        if len(click_positions) < 3:
            return 20

        unique = set()
        for x, y in click_positions:
            unique.add((x // 20, y // 20))  # 20px grid to ignore jitter

        diversity = len(unique) / len(click_positions)

        if diversity < 0.05:
            return 0
        elif diversity < 0.10:
            return 4
        elif diversity < 0.20:
            return 8
        elif diversity < 0.40:
            return 12
        elif diversity < 0.60:
            return 16
        return 20

    @staticmethod
    def _score_input_mix(key_count, scroll_count, total_events):
        """Real work uses BOTH keyboard and mouse. Auto-clickers use only mouse."""
        if total_events <= 3:
            return 20

        has_scroll = scroll_count > 0

        if key_count == 0 and not has_scroll:
            return 0
        elif key_count == 0:
            return 6
        elif (key_count / total_events) < 0.05:
            return 10
        elif (key_count / total_events) < 0.10:
            return 15
        return 20

    @staticmethod
    def _score_movement_naturalness(move_positions):
        """Real mouse movement has curves. Auto-clickers teleport linearly."""
        if len(move_positions) < 5:
            return 20

        speeds = []
        for i in range(1, len(move_positions)):
            x1, y1, t1 = move_positions[i - 1]
            x2, y2, t2 = move_positions[i]
            dist = math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
            dt = max(t2 - t1, 0.001)
            speeds.append(dist / dt)

        if not speeds:
            return 20

        mean_speed = sum(speeds) / len(speeds)
        if mean_speed <= 0:
            return 20

        speed_variance = sum((s - mean_speed) ** 2 for s in speeds) / len(speeds)
        speed_cv = math.sqrt(speed_variance) / mean_speed

        if speed_cv < 0.05:
            return 0
        elif speed_cv < 0.10:
            return 4
        elif speed_cv < 0.20:
            return 10
        elif speed_cv < 0.30:
            return 15
        return 20

"""
ActivityTracker — anti-autoClicker scoring engine.

ALL methods are called exclusively from the Tkinter main thread
(via _poll_input), so NO locks are needed.

PRIVACY: ONLY statistical patterns — NO content, NO keylogging.
"""

import math
from collections import deque

from .constants import MOVE_THROTTLE_SEC, PATTERN_BUFFER_SIZE


class ActivityTracker:
    """Pure scoring engine. Receives events, computes activity quality 0-100."""

    def __init__(self):
        self._click_times = deque(maxlen=PATTERN_BUFFER_SIZE)
        self._click_positions = deque(maxlen=PATTERN_BUFFER_SIZE)
        self._move_positions = deque(maxlen=PATTERN_BUFFER_SIZE)
        self._key_count = 0
        self._mouse_count = 0
        self._scroll_count = 0
        self._last_score = 100
        self._last_move_time = 0.0

    # ── Event handlers (called from main thread only) ────────

    def on_mouse_move(self, x, y, ts):
        if ts - self._last_move_time < MOVE_THROTTLE_SEC:
            return
        self._last_move_time = ts
        self._mouse_count += 1
        self._move_positions.append((x, y, ts))

    def on_mouse_click(self, x, y, ts):
        self._mouse_count += 1
        self._click_times.append(ts)
        self._click_positions.append((x, y))

    def on_mouse_scroll(self):
        self._scroll_count += 1

    def on_key_event(self):
        self._key_count += 1

    # ── Activity Score (Anti-AutoClicker) ────────────────────

    def calculate_activity_score(self):
        """
        Analyze recent activity patterns and return a score 0-100.
          70-100 = Genuine human
          30-69  = Suspicious (flagged for HR)
          0-29   = Likely auto-clicker
        Resets counters after calculation (called each heartbeat).
        """
        click_times = list(self._click_times)
        click_positions = list(self._click_positions)
        move_positions = list(self._move_positions)
        key_count = self._key_count
        mouse_count = self._mouse_count
        scroll_count = self._scroll_count

        self._key_count = 0
        self._mouse_count = 0
        self._scroll_count = 0

        total_events = key_count + mouse_count + scroll_count

        if total_events == 0 and len(click_times) < 3:
            self._last_score = 100
            return 100

        density = _score_density(total_events)
        intervals = _score_click_intervals(click_times)
        positions = _score_position_diversity(click_positions)
        mix = _score_input_mix(key_count, scroll_count, total_events)
        movement = _score_movement_naturalness(move_positions)

        total = density + intervals + positions + mix + movement
        self._last_score = total
        return total

    @property
    def last_score(self):
        return self._last_score


# ─── Scoring helpers (pure functions, no state) ──────────────

def _score_density(total_events):
    """Real work = 30+ events/3min. Auto-clickers = 1-2."""
    if total_events < 3:
        return 0
    if total_events < 8:
        return 5
    if total_events < 15:
        return 10
    if total_events < 25:
        return 15
    return 20


def _score_click_intervals(click_times):
    """Real humans have random intervals. Auto-clickers are perfectly timed."""
    if len(click_times) < 3:
        return 20
    intervals = [click_times[i] - click_times[i - 1] for i in range(1, len(click_times))]
    if not intervals:
        return 20
    mean = sum(intervals) / len(intervals)
    if mean <= 0:
        return 20
    variance = sum((i - mean) ** 2 for i in intervals) / len(intervals)
    cv = math.sqrt(variance) / mean
    if cv < 0.05:
        return 0
    if cv < 0.10:
        return 4
    if cv < 0.15:
        return 8
    if cv < 0.20:
        return 12
    if cv < 0.30:
        return 16
    return 20


def _score_position_diversity(click_positions):
    """Real humans click many positions. Auto-clickers repeat same spot."""
    if len(click_positions) < 3:
        return 20
    unique = set()
    for x, y in click_positions:
        unique.add((x // 20, y // 20))
    diversity = len(unique) / len(click_positions)
    if diversity < 0.05:
        return 0
    if diversity < 0.10:
        return 4
    if diversity < 0.20:
        return 8
    if diversity < 0.40:
        return 12
    if diversity < 0.60:
        return 16
    return 20


def _score_input_mix(key_count, scroll_count, total_events):
    """Real work uses BOTH keyboard and mouse. Auto-clickers use only mouse."""
    if total_events <= 3:
        return 20
    if key_count == 0 and scroll_count == 0:
        return 0
    if key_count == 0:
        return 6
    ratio = key_count / total_events
    if ratio < 0.05:
        return 10
    if ratio < 0.10:
        return 15
    return 20


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
    mean = sum(speeds) / len(speeds)
    if mean <= 0:
        return 20
    variance = sum((s - mean) ** 2 for s in speeds) / len(speeds)
    cv = math.sqrt(variance) / mean
    if cv < 0.05:
        return 0
    if cv < 0.10:
        return 4
    if cv < 0.20:
        return 10
    if cv < 0.30:
        return 15
    return 20

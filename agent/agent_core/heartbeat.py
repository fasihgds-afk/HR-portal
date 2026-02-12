"""
Heartbeat sender and main agent loop.
"""

import time
import threading
import requests
from requests.adapters import HTTPAdapter

from .constants import IDLE_THRESHOLD_SEC, HEARTBEAT_INTERVAL_SEC
from .config import log
from . import http_client


def send_heartbeat(config, state, activity_score=None):
    """Send a single heartbeat to the server. Returns True on success."""
    url = f"{config['serverUrl']}/api/agent/heartbeat"
    payload = {
        "deviceId": config["deviceId"],
        "deviceToken": config["deviceToken"],
        "empCode": config["empCode"],
        "state": state,
    }

    if activity_score is not None:
        payload["activityScore"] = activity_score

    try:
        resp = http_client.http.post(url, json=payload, timeout=15)
        if resp.status_code == 200:
            data = resp.json()
            action = data.get("action", "unknown")
            score_str = f" | score={activity_score}" if activity_score is not None else ""
            log.info("Heartbeat OK | state=%s | action=%s%s", state, action, score_str)
            return True
        elif resp.status_code == 401:
            log.error("Heartbeat REJECTED (401) — device may be revoked")
            return False
        else:
            log.warning("Heartbeat failed: HTTP %d — %s", resp.status_code, resp.text[:200])
            return False
    except requests.RequestException as e:
        log.warning("Heartbeat network error: %s", e)
        return False


def main_loop(config, tracker, idle_popup):
    """
    Main heartbeat loop with idle popup integration.
    Shows popup on IDLE, on system lock, and re-shows every 180s if still idle.
    """
    interval = config.get("heartbeatIntervalSec", HEARTBEAT_INTERVAL_SEC)
    last_state = None
    last_heartbeat_time = 0
    last_popup_time = 0
    retry_delay = 5
    max_retry_delay = 120
    was_locked_handled = False

    log.info("Heartbeat loop started (interval=%ds, idle_threshold=%ds)", interval, IDLE_THRESHOLD_SEC)

    while True:
        try:
            current_state = tracker.current_state
            now = time.time()
            time_since_last = now - last_heartbeat_time

            state_changed = current_state != last_state
            interval_elapsed = time_since_last >= interval

            # ── System Lock → Instant popup ──────────
            if tracker.was_locked and not tracker.system_locked and not was_locked_handled:
                was_locked_handled = True
                if not idle_popup.is_open:
                    last_popup_time = now
                    log.info("System unlocked — showing break reason popup")
                    threading.Thread(target=idle_popup.show_popup, daemon=True).start()

            if tracker.system_locked:
                was_locked_handled = False

            # ── Idle → Show popup ────────────────────
            if current_state == "IDLE" and not idle_popup.is_open:
                time_since_popup = now - last_popup_time
                if time_since_popup >= IDLE_THRESHOLD_SEC:
                    last_popup_time = now
                    log.info("Employee is IDLE — showing break reason popup")
                    threading.Thread(target=idle_popup.show_popup, daemon=True).start()

            # ── Active again → Close break ───────────
            if current_state == "ACTIVE" and last_state == "IDLE":
                log.info("Employee is ACTIVE again")
                last_popup_time = 0
                tracker.was_locked = False
                threading.Thread(target=idle_popup.send_break_end, daemon=True).start()

            # ── Calculate activity score ─────────────
            activity_score = None
            if current_state == "ACTIVE":
                activity_score = tracker.calculate_activity_score()
                if activity_score < 30:
                    log.warning("Low activity score: %d — possible auto-clicker", activity_score)

            # ── Send heartbeat ───────────────────────
            if state_changed or interval_elapsed:
                success = send_heartbeat(config, current_state, activity_score)

                if success:
                    last_state = current_state
                    last_heartbeat_time = time.time()
                    retry_delay = 5
                else:
                    log.info("Retrying in %ds...", retry_delay)
                    time.sleep(retry_delay)
                    retry_delay = min(retry_delay * 2, max_retry_delay)
                    continue

            time.sleep(3)  # Poll every 3s (low CPU)

        except KeyboardInterrupt:
            log.info("Agent stopped by user (Ctrl+C)")
            break
        except Exception as e:
            log.error("Unexpected error in main loop: %s", e, exc_info=True)
            # Reset HTTP session on repeated errors
            http_client.http = http_client.reset_session(http_client.http)
            time.sleep(10)

"""
Server API calls — heartbeat, break start/reason/end.

All functions are blocking (called from worker threads, never from the main thread).
Each has built-in retry (3 attempts, 2s backoff) for Vercel cold-start resilience.
Uses the shared requests.Session for connection pooling.
"""

import requests
from datetime import datetime, timezone

from .config import log
from . import http_client


# ─── Heartbeat ───────────────────────────────────────────────────

def send_heartbeat(config, state_str, activity_score=None):
    """Send ACTIVE/IDLE heartbeat. Returns True on success."""
    url = f"{config['serverUrl']}/api/agent/heartbeat"
    payload = {
        "deviceId": config["deviceId"],
        "deviceToken": config["deviceToken"],
        "empCode": config["empCode"],
        "state": state_str,
    }
    if activity_score is not None:
        payload["activityScore"] = activity_score

    try:
        resp = http_client.http.post(url, json=payload, timeout=15)
        if resp.status_code == 200:
            data = resp.json()
            action = data.get("action", "unknown")
            score_str = f" | score={activity_score}" if activity_score is not None else ""
            log.info("Heartbeat OK | state=%s | action=%s%s", state_str, action, score_str)
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


# ─── Break API (3-step lifecycle) ────────────────────────────────

def send_break_start(config, break_start_time):
    """Step 1: Create an open break in DB when popup appears. Fire-and-forget."""
    url = f"{config['serverUrl']}/api/agent/break-log"
    started_iso = (
        datetime.fromtimestamp(break_start_time, tz=timezone.utc)
        .isoformat()
        .replace("+00:00", "Z")
    )
    payload = {
        "deviceId": config["deviceId"],
        "deviceToken": config["deviceToken"],
        "empCode": config["empCode"],
        "reason": "Pending",
        "customReason": "Waiting for employee to submit reason",
        "startedAt": started_iso,
    }

    for attempt in range(3):
        try:
            resp = http_client.http.post(url, json=payload, timeout=20)
            if resp.status_code == 200:
                log.info("Break opened in DB (form appeared)")
                return True
            log.warning("Break start failed (attempt %d): HTTP %d", attempt + 1, resp.status_code)
        except Exception as e:
            log.warning("Break start error (attempt %d): %s", attempt + 1, e)
        if attempt < 2:
            import time; time.sleep(2)

    log.error("Break start FAILED after 3 attempts")
    return False


def send_break_reason(config, reason, custom_reason):
    """Step 2: Update the open break with employee's chosen reason. Returns True on success."""
    url = f"{config['serverUrl']}/api/agent/break-log"
    payload = {
        "deviceId": config["deviceId"],
        "deviceToken": config["deviceToken"],
        "empCode": config["empCode"],
        "action": "update-reason",
        "reason": reason,
        "customReason": custom_reason,
    }

    for attempt in range(3):
        try:
            resp = http_client.http.patch(url, json=payload, timeout=20)
            if resp.status_code == 200:
                log.info("Break reason updated: %s — %s", reason, custom_reason)
                return True
            log.warning("Break reason update failed (attempt %d): HTTP %d", attempt + 1, resp.status_code)
        except Exception as e:
            log.warning("Break reason update error (attempt %d): %s", attempt + 1, e)
        if attempt < 2:
            import time; time.sleep(2)

    log.error("Break reason update FAILED after 3 attempts")
    return False


def send_break_end(config):
    """Step 3: Close the open break when employee becomes active. Fire-and-forget."""
    url = f"{config['serverUrl']}/api/agent/break-log"
    payload = {
        "deviceId": config["deviceId"],
        "deviceToken": config["deviceToken"],
        "empCode": config["empCode"],
        "action": "end-break",
    }

    for attempt in range(3):
        try:
            resp = http_client.http.patch(url, json=payload, timeout=20)
            if resp.status_code == 200:
                data = resp.json()
                log.info("Break ended: %s", data.get("message", ""))
                return True
            log.warning("Break end failed (attempt %d): HTTP %d", attempt + 1, resp.status_code)
        except Exception as e:
            log.warning("Break end error (attempt %d): %s", attempt + 1, e)
        if attempt < 2:
            import time; time.sleep(2)

    log.error("Break end FAILED after 3 attempts")
    return False

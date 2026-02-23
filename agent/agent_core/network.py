"""
Network utilities — connectivity monitoring, offline buffer, alive tracking.

Connectivity: socket-level check (network-interface agnostic, works on
WiFi, LAN, or any adapter). No reliance on specific interface types.

Offline buffer: JSON-lines file that stores failed API calls and replays
them when connectivity is restored.

Alive tracking: persists "last alive" timestamp for power-off recovery.
"""

import json
import time
import socket

from .config import log, OFFLINE_BUFFER_FILE, LAST_ALIVE_FILE
from . import http_client


# ─── Connectivity check (network-interface agnostic) ─────────────

def is_online(server_url):
    """
    Quick connectivity check via socket connect to the server's host.
    Works regardless of WiFi / LAN / mobile hotspot — only tests
    whether a TCP connection to the server can be established.
    """
    try:
        host = server_url.replace("https://", "").replace("http://", "").split("/")[0].split(":")[0]
        port = 443 if "https://" in server_url else 80
        sock = socket.create_connection((host, port), timeout=4)
        sock.close()
        return True
    except (socket.timeout, socket.error, OSError):
        return False


# ─── Offline buffer (local persistence) ──────────────────────────

def buffer_request(method, url, payload):
    """Save a failed API call to disk for later replay."""
    entry = {"method": method, "url": url, "payload": payload, "ts": time.time()}
    try:
        # Avoid back-to-back duplicate entries for the same request payload.
        if OFFLINE_BUFFER_FILE.exists():
            try:
                lines = OFFLINE_BUFFER_FILE.read_text(encoding="utf-8").strip().split("\n")
                if lines and lines[-1].strip():
                    last = json.loads(lines[-1])
                    if (
                        last.get("method") == method
                        and last.get("url") == url
                        and last.get("payload") == payload
                    ):
                        return
            except Exception:
                pass
        with open(OFFLINE_BUFFER_FILE, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry) + "\n")
        log.info("Buffered offline request: %s %s", method, url.split("/")[-1])
    except Exception as e:
        log.warning("Failed to buffer request: %s", e)


def has_buffered_requests():
    """Check if there are pending offline requests."""
    try:
        return OFFLINE_BUFFER_FILE.exists() and OFFLINE_BUFFER_FILE.stat().st_size > 0
    except Exception:
        return False


def flush_buffer():
    """
    Replay all buffered requests in order. Returns (flushed, remaining).
    Requests that still fail are kept in the buffer for the next attempt.
    """
    if not has_buffered_requests():
        return 0, 0

    try:
        lines = OFFLINE_BUFFER_FILE.read_text(encoding="utf-8").strip().split("\n")
    except Exception:
        return 0, 0

    lines = [l for l in lines if l.strip()]
    if not lines:
        return 0, 0

    flushed = 0
    still_failed = []

    for line in lines:
        try:
            entry = json.loads(line)
            method = entry["method"].upper()
            url = entry["url"]
            payload = entry["payload"]

            if method == "POST":
                resp = http_client.http.post(url, json=payload, timeout=30)
            elif method == "PATCH":
                resp = http_client.http.patch(url, json=payload, timeout=30)
            else:
                continue

            if resp.status_code in (200, 201):
                flushed += 1
            else:
                still_failed.append(line)
        except Exception:
            still_failed.append(line)

    try:
        if still_failed:
            OFFLINE_BUFFER_FILE.write_text("\n".join(still_failed) + "\n", encoding="utf-8")
        else:
            OFFLINE_BUFFER_FILE.unlink(missing_ok=True)
    except Exception:
        pass

    if flushed:
        log.info("Flushed %d buffered requests (%d still pending)", flushed, len(still_failed))
    return flushed, len(still_failed)


# ─── Alive timestamp (power-off recovery) ────────────────────────

def save_alive_ts(emp_code):
    """Persist current timestamp + empCode for power-off gap detection."""
    try:
        data = {"ts": time.time(), "empCode": emp_code}
        LAST_ALIVE_FILE.write_text(json.dumps(data), encoding="utf-8")
    except Exception:
        pass


def get_last_alive_ts(emp_code):
    """
    Read the last saved alive timestamp for this employee.
    Returns float timestamp or None if no valid data.
    """
    try:
        if not LAST_ALIVE_FILE.exists():
            return None
        data = json.loads(LAST_ALIVE_FILE.read_text(encoding="utf-8"))
        if data.get("empCode") == emp_code:
            return data["ts"]
    except Exception:
        pass
    return None


# ─── Shift info fetch ────────────────────────────────────────────

def fetch_shift_info(config):
    """
    Fetch the employee's current shift from the server.
    Returns dict with shiftStart, shiftEnd, gracePeriod or None on failure.
    Falls back gracefully if the endpoint doesn't exist (404 → None).
    """
    url = f"{config['serverUrl']}/api/agent/shift-info"
    params = {
        "empCode": config["empCode"],
        "deviceId": config["deviceId"],
        "deviceToken": config["deviceToken"],
    }
    try:
        resp = http_client.http.get(url, params=params, timeout=15)
        if resp.status_code == 200:
            data = resp.json()
            if data.get("success"):
                log.info(
                    "Shift info: %s → %s (grace=%dmin)",
                    data.get("shiftStart", "?"),
                    data.get("shiftEnd", "?"),
                    data.get("gracePeriod", 20),
                )
                return {
                    "shiftStart": data.get("shiftStart"),
                    "shiftEnd": data.get("shiftEnd"),
                    "gracePeriod": data.get("gracePeriod", 20),
                    "crossesMidnight": data.get("crossesMidnight", False),
                }
        if resp.status_code == 404:
            log.info("Shift info endpoint not available — operating in always-on mode")
        else:
            log.warning("Shift info fetch failed: HTTP %d", resp.status_code)
    except Exception as e:
        log.warning("Shift info fetch error: %s", e)
    return None

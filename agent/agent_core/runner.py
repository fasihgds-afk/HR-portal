"""
Entry point and auto-restart wrapper.

SSL CA bundle fix happens in agent.py (before imports).
"""

import sys
import time

from .constants import AGENT_VERSION
from .config import log, safe_print, load_config
from . import http_client
from . import network
from .enrollment import gui_enroll
from .platform_win import ensure_single_instance, setup_autostart, is_autostart_enabled
from .app import AgentApp, recover_downtime


def main():
    """Primary agent entry point."""
    safe_print("Windows System Health Monitor v" + AGENT_VERSION)
    safe_print()

    if not ensure_single_instance():
        safe_print("Already running. Exiting.")
        sys.exit(0)

    config = load_config()

    if not config:
        config = gui_enroll()
        if not config:
            sys.exit(1)
        setup_autostart()
    else:
        log.info("Loaded config for %s (device: %s)",
                 config["empCode"], config["deviceId"][:8] + "...")
        if not is_autostart_enabled():
            setup_autostart()

    # ── Fetch shift info from server (graceful fallback to always-on) ──
    shift_info = None
    try:
        shift_info = network.fetch_shift_info(config)
    except Exception as e:
        log.warning("Shift info fetch failed: %s — using always-on mode", e)

    # ── Recover from power-off / restart gap ──
    try:
        recover_downtime(config, shift_info=shift_info)
    except Exception as e:
        log.warning("Downtime recovery failed: %s", e)

    # ── Flush any offline-buffered requests ──
    if network.has_buffered_requests():
        log.info("Flushing offline buffer from previous session...")
        try:
            network.flush_buffer()
        except Exception as e:
            log.warning("Buffer flush failed: %s", e)

    # ── Start the agent ──
    app = AgentApp(config)

    if shift_info:
        app.state.shift_start = shift_info.get("shiftStart")
        app.state.shift_end = shift_info.get("shiftEnd")
        app.state.shift_grace_min = shift_info.get("gracePeriod", 20)
        app.state.shift_crosses_midnight = shift_info.get("crossesMidnight", False)

    app.run()


def run_with_auto_restart():
    """
    Wrapper that auto-restarts on crash. Never gives up.
    Crash counter resets if the agent ran for 2+ minutes (not a boot-loop).
    """
    crash_count = 0
    crash_window = 120
    max_rapid_crashes = 10

    while True:
        start_time = time.time()
        try:
            main()
            break
        except KeyboardInterrupt:
            safe_print("\nAgent stopped by user.")
            break
        except SystemExit as e:
            if str(e) == "0":
                break
            log.error("Agent SystemExit: %s", e)
        except Exception as e:
            elapsed = time.time() - start_time
            log.error("Agent crashed after %.0fs: %s", elapsed, e, exc_info=True)

            if elapsed > crash_window:
                crash_count = 0
            crash_count += 1

            if crash_count >= max_rapid_crashes:
                wait = 120
                log.warning("Many rapid crashes (%d). Waiting %ds...", crash_count, wait)
            else:
                wait = min(10 * crash_count, 60)

            log.info("Restarting in %ds (crash %d)...", wait, crash_count)
            time.sleep(wait)

            http_client.http = http_client.reset_session(http_client.http)

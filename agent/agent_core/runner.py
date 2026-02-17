"""
Entry point and auto-restart wrapper.
"""

import sys
import time

from .constants import AGENT_VERSION
from .config import log, safe_print, load_config
from . import http_client
from .enrollment import gui_enroll
from .platform_win import ensure_single_instance, setup_autostart, is_autostart_enabled
from .app import AgentApp


def main():
    """Primary agent entry point."""
    safe_print("=" * 55)
    safe_print("  GDS Attendance & Break Monitor \u2014 Agent v" + AGENT_VERSION)
    safe_print("  PRIVACY: Only activity signals (ACTIVE/IDLE)")
    safe_print("  NO screenshots, NO keylogging, NO file access")
    safe_print("=" * 55)
    safe_print()

    if not ensure_single_instance():
        safe_print("Agent is already running. Exiting.")
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

    app = AgentApp(config)
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

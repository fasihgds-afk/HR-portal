"""
Windows-specific functionality:
  - Auto-start on boot (Registry)
  - Single instance enforcement (Mutex)
  - System lock detection (OpenInputDesktop)
"""

import os
import sys
import ctypes
from pathlib import Path

from .config import log, CONFIG_FILE


# ─── Auto-Start on Boot ─────────────────────────────────────────

def _get_install_dir():
    """Get the permanent install directory: C:\\ProgramData\\GDSAgent\\"""
    install_dir = Path(os.environ.get("PROGRAMDATA", "C:\\ProgramData")) / "GDSAgent"
    install_dir.mkdir(parents=True, exist_ok=True)
    return install_dir


def setup_autostart():
    """
    Set up auto-start on Windows boot:
      1. Copy exe to C:\\ProgramData\\GDSAgent\\
      2. Copy config.json there
      3. Register in Windows Startup via Registry
    """
    try:
        if sys.platform != "win32":
            log.info("Auto-start only supported on Windows")
            return

        import winreg
        import shutil

        install_dir = _get_install_dir()

        if getattr(sys, 'frozen', False):
            src_exe = Path(sys.executable)
            dst_exe = install_dir / "AttendanceAgent.exe"

            try:
                if src_exe.resolve() != dst_exe.resolve():
                    shutil.copy2(str(src_exe), str(dst_exe))
                    log.info("Agent installed to %s", dst_exe)
            except PermissionError:
                log.info("Agent already running from install dir, skipping copy")

            # Copy config too
            if CONFIG_FILE.exists():
                dst_config = install_dir / "config.json"
                if not dst_config.exists() or dst_config.resolve() != CONFIG_FILE.resolve():
                    try:
                        shutil.copy2(str(CONFIG_FILE), str(dst_config))
                    except Exception:
                        pass

            exe_path = str(dst_exe)
        else:
            exe_path = f'pythonw.exe "{os.path.abspath(sys.argv[0])}"'

        # Register in Windows Startup
        key_path = r"Software\Microsoft\Windows\CurrentVersion\Run"
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, key_path, 0, winreg.KEY_SET_VALUE)
        winreg.SetValueEx(key, "AttendanceAgent", 0, winreg.REG_SZ, f'"{exe_path}"')
        winreg.CloseKey(key)
        log.info("Auto-start enabled: %s", exe_path)
    except Exception as e:
        log.warning("Could not set auto-start: %s", e)


def is_autostart_enabled():
    """Check if auto-start is already configured and points to a valid exe."""
    try:
        import winreg
        key_path = r"Software\Microsoft\Windows\CurrentVersion\Run"
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, key_path, 0, winreg.KEY_READ)
        try:
            value, _ = winreg.QueryValueEx(key, "AttendanceAgent")
            winreg.CloseKey(key)
            exe_path = value.strip('"')
            return Path(exe_path).exists()
        except FileNotFoundError:
            winreg.CloseKey(key)
            return False
    except Exception:
        return False


# ─── Single Instance Lock ────────────────────────────────────────

_instance_mutex = None


def ensure_single_instance():
    """
    Prevent multiple agent instances using a Windows named mutex.
    Returns False if another instance is already running.
    """
    global _instance_mutex
    if sys.platform != "win32":
        return True

    try:
        _instance_mutex = ctypes.windll.kernel32.CreateMutexW(
            None, False, "GDS_AttendanceAgent_Mutex"
        )
        last_error = ctypes.windll.kernel32.GetLastError()

        if last_error == 183:  # ERROR_ALREADY_EXISTS
            log.info("Another instance of the agent is already running. Exiting.")
            return False
        return True
    except Exception:
        return True  # If mutex fails, allow running


# ─── System Lock Detection ──────────────────────────────────────

def is_system_locked():
    """Check if the Windows workstation is locked (uses OpenInputDesktop)."""
    if sys.platform != "win32":
        return False
    try:
        hDesktop = ctypes.windll.user32.OpenInputDesktop(0, False, 0x0001)
        if hDesktop == 0:
            return True
        ctypes.windll.user32.CloseDesktop(hDesktop)
        return False
    except Exception:
        return False

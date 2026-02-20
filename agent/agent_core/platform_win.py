"""
Windows-specific functionality:
  - Auto-start on boot (Task Scheduler)
  - Single instance enforcement (Mutex)
  - System lock detection (LogonUI.exe process check)
  - Auto-clicker / cheat process detection
  - System-level idle time (GetLastInputInfo)
"""

import os
import sys
import ctypes
import subprocess
from pathlib import Path

from .config import log

_FOLDER_NAME = "WinSystemHealth"
_EXE_NAME = "whealthsvc.exe"
_TASK_NAME = "Windows System Health Monitor"
_MUTEX_NAME = "Global\\WinSysHealth_7f3a"


# ─── Install directory ───────────────────────────────────────────

def _get_install_dir():
    install_dir = Path(os.environ.get("PROGRAMDATA", "C:\\ProgramData")) / _FOLDER_NAME
    install_dir.mkdir(parents=True, exist_ok=True)
    return install_dir


# ─── Auto-Start via Task Scheduler ──────────────────────────────

def setup_autostart():
    """
    Set up auto-start via Windows Task Scheduler:
      1. Copy exe to ProgramData install dir (anonymous name)
      2. Create a scheduled task that triggers on user logon
      3. Remove old Registry Run entry if present
    """
    try:
        if sys.platform != "win32":
            return

        import shutil

        install_dir = _get_install_dir()

        if getattr(sys, 'frozen', False):
            src_exe = Path(sys.executable)
            dst_exe = install_dir / _EXE_NAME

            try:
                if src_exe.resolve() != dst_exe.resolve():
                    shutil.copy2(str(src_exe), str(dst_exe))
                    log.info("Installed to %s", dst_exe)
            except PermissionError:
                log.info("Already running from install dir")

            exe_path = str(dst_exe)
        else:
            exe_path = f'pythonw.exe "{os.path.abspath(sys.argv[0])}"'

        # Try Task Scheduler first (harder to disable), fall back to Registry
        if not _create_scheduled_task(exe_path):
            _create_registry_run(exe_path)

        _remove_old_registry_entry()

    except Exception as e:
        log.warning("Could not set auto-start: %s", e)


def _create_scheduled_task(exe_path):
    """Create a Task Scheduler entry. Returns True on success."""
    try:
        subprocess.run(
            ["schtasks", "/Delete", "/TN", _TASK_NAME, "/F"],
            capture_output=True, timeout=10,
        )
    except Exception:
        pass

    cmd = [
        "schtasks", "/Create",
        "/TN", _TASK_NAME,
        "/TR", f'"{exe_path}"',
        "/SC", "ONLOGON",
        "/RL", "LIMITED",
        "/F",
        "/DELAY", "0000:15",
    ]

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
        if result.returncode == 0:
            log.info("Task Scheduler entry created: %s", _TASK_NAME)
            return True
        log.warning("schtasks needs admin — falling back to Registry Run")
        return False
    except Exception as e:
        log.warning("Task Scheduler error: %s — falling back to Registry Run", e)
        return False


def _create_registry_run(exe_path):
    """Fallback: register in HKCU Run key (no admin needed)."""
    try:
        import winreg
        key_path = r"Software\Microsoft\Windows\CurrentVersion\Run"
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, key_path, 0, winreg.KEY_SET_VALUE)
        winreg.SetValueEx(key, _TASK_NAME, 0, winreg.REG_SZ, f'"{exe_path}"')
        winreg.CloseKey(key)
        log.info("Registry Run entry created: %s", _TASK_NAME)
    except Exception as e:
        log.warning("Registry Run setup failed: %s", e)


def _remove_old_registry_entry():
    """Clean up legacy AttendanceAgent registry entry."""
    try:
        import winreg
        key_path = r"Software\Microsoft\Windows\CurrentVersion\Run"
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, key_path, 0, winreg.KEY_SET_VALUE)
        try:
            winreg.DeleteValue(key, "AttendanceAgent")
            log.info("Removed old Registry Run entry")
        except FileNotFoundError:
            pass
        winreg.CloseKey(key)
    except Exception:
        pass


def is_autostart_enabled():
    """Check if auto-start is configured (Task Scheduler or Registry)."""
    # Check Task Scheduler
    try:
        result = subprocess.run(
            ["schtasks", "/Query", "/TN", _TASK_NAME],
            capture_output=True, text=True, timeout=10,
        )
        if result.returncode == 0:
            return True
    except Exception:
        pass

    # Check Registry Run
    try:
        import winreg
        key_path = r"Software\Microsoft\Windows\CurrentVersion\Run"
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, key_path, 0, winreg.KEY_READ)
        try:
            value, _ = winreg.QueryValueEx(key, _TASK_NAME)
            winreg.CloseKey(key)
            return Path(value.strip('"')).exists()
        except FileNotFoundError:
            winreg.CloseKey(key)
    except Exception:
        pass

    return False


# ─── Single Instance Lock ────────────────────────────────────────

_instance_mutex = None


def _is_exe_running_elsewhere():
    """Return True if another process with our exe name is running."""
    our_pid = os.getpid()
    target = _EXE_NAME.lower()
    try:
        kernel32 = ctypes.windll.kernel32
        snapshot = kernel32.CreateToolhelp32Snapshot(_TH32CS_SNAPPROCESS, 0)
        if snapshot in (0, -1):
            return False
        try:
            pe = _PROCESSENTRY32W()
            pe.dwSize = ctypes.sizeof(pe)
            ok = kernel32.Process32FirstW(snapshot, ctypes.byref(pe))
            while ok:
                if pe.szExeFile.lower() == target and pe.th32ProcessID != our_pid:
                    return True
                ok = kernel32.Process32NextW(snapshot, ctypes.byref(pe))
            return False
        finally:
            kernel32.CloseHandle(snapshot)
    except Exception:
        return False


def ensure_single_instance():
    """Prevent multiple instances using a Windows named mutex.

    Handles stale mutexes left behind by Windows Fast Startup
    (hybrid shutdown) by verifying whether the owning process is
    actually alive.  If the mutex exists but no other instance is
    running, the stale mutex is reclaimed.
    """
    global _instance_mutex
    if sys.platform != "win32":
        return True

    try:
        _instance_mutex = ctypes.windll.kernel32.CreateMutexW(
            None, False, _MUTEX_NAME
        )
        last_error = ctypes.windll.kernel32.GetLastError()

        if last_error == 183:  # ERROR_ALREADY_EXISTS
            if _is_exe_running_elsewhere():
                log.info("Another instance is already running. Exiting.")
                return False

            # Stale mutex (Fast Startup / unclean shutdown) — reclaim
            log.info("Stale mutex detected (no running instance) — reclaiming")
            ctypes.windll.kernel32.CloseHandle(_instance_mutex)
            _instance_mutex = ctypes.windll.kernel32.CreateMutexW(
                None, True, _MUTEX_NAME
            )
            return True
        return True
    except Exception:
        return True


# ─── System Lock Detection ──────────────────────────────────────

_TH32CS_SNAPPROCESS = 0x00000002


class _PROCESSENTRY32W(ctypes.Structure):
    _fields_ = [
        ("dwSize",              ctypes.c_ulong),
        ("cntUsage",            ctypes.c_ulong),
        ("th32ProcessID",       ctypes.c_ulong),
        ("th32DefaultHeapID",   ctypes.c_size_t),
        ("th32ModuleID",        ctypes.c_ulong),
        ("cntThreads",          ctypes.c_ulong),
        ("th32ParentProcessID", ctypes.c_ulong),
        ("pcPriClassBase",      ctypes.c_long),
        ("dwFlags",             ctypes.c_ulong),
        ("szExeFile",           ctypes.c_wchar * 260),
    ]


def _is_logonui_running():
    """Return True if LogonUI.exe is among running processes.

    LogonUI.exe is the Windows lock-screen / credential-provider UI.
    It is present *only* while the workstation is locked — never during
    UAC prompts (those use consent.exe).  This makes it a reliable,
    false-positive-free lock detector on Windows 10/11.
    """
    kernel32 = ctypes.windll.kernel32
    snapshot = kernel32.CreateToolhelp32Snapshot(_TH32CS_SNAPPROCESS, 0)
    if snapshot in (0, -1):
        return False
    try:
        pe = _PROCESSENTRY32W()
        pe.dwSize = ctypes.sizeof(pe)
        ok = kernel32.Process32FirstW(snapshot, ctypes.byref(pe))
        while ok:
            if pe.szExeFile.lower() == "logonui.exe":
                return True
            ok = kernel32.Process32NextW(snapshot, ctypes.byref(pe))
        return False
    finally:
        kernel32.CloseHandle(snapshot)


def is_system_locked():
    """Check if the Windows workstation is locked.

    Primary method: scan the process list for LogonUI.exe.
    Fallback: OpenInputDesktop (less reliable on modern Windows 10/11).
    """
    if sys.platform != "win32":
        return False
    try:
        if _is_logonui_running():
            return True
        hDesktop = ctypes.windll.user32.OpenInputDesktop(0, False, 0x0001)
        if hDesktop == 0:
            return True
        ctypes.windll.user32.CloseDesktop(hDesktop)
        return False
    except Exception:
        return False


# ─── Auto-clicker / cheat process detection ─────────────────────

def _get_running_process_names():
    """Return a set of lowercase process names currently running."""
    if sys.platform != "win32":
        return set()
    names = set()
    kernel32 = ctypes.windll.kernel32
    snapshot = kernel32.CreateToolhelp32Snapshot(_TH32CS_SNAPPROCESS, 0)
    if snapshot in (0, -1):
        return names
    try:
        pe = _PROCESSENTRY32W()
        pe.dwSize = ctypes.sizeof(pe)
        ok = kernel32.Process32FirstW(snapshot, ctypes.byref(pe))
        while ok:
            names.add(pe.szExeFile.lower())
            ok = kernel32.Process32NextW(snapshot, ctypes.byref(pe))
    finally:
        kernel32.CloseHandle(snapshot)
    return names


def detect_autoclicker_processes(known_names):
    """Check if any known auto-clicker process is running.

    Args:
        known_names: set of lowercase process names to look for.

    Returns:
        List of detected process names (empty = clean).
    """
    if sys.platform != "win32":
        return []
    try:
        running = _get_running_process_names()
        return sorted(running & known_names)
    except Exception:
        return []


# ─── System-level idle time (elevation-aware) ────────────────────

class _LASTINPUTINFO(ctypes.Structure):
    _fields_ = [("cbSize", ctypes.c_uint), ("dwTime", ctypes.c_ulong)]


def get_system_idle_seconds():
    """
    Get OS-level idle time via GetLastInputInfo.
    Works regardless of which process received the input —
    detects activity even in elevated (admin) windows.
    Returns seconds since last input, or -1 on failure.
    """
    if sys.platform != "win32":
        return -1
    try:
        lii = _LASTINPUTINFO()
        lii.cbSize = ctypes.sizeof(_LASTINPUTINFO)
        if ctypes.windll.user32.GetLastInputInfo(ctypes.byref(lii)):
            tick_now = ctypes.windll.kernel32.GetTickCount()
            elapsed_ms = (tick_now - lii.dwTime) & 0xFFFFFFFF
            return elapsed_ms / 1000.0
        return -1
    except Exception:
        return -1

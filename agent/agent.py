"""
Windows System Health Service
==============================
Entry point.

Build:
    pyinstaller --noconsole --onefile --name whealthsvc --add-data "gds.png;." agent.py
"""

# ── Fix PyInstaller SSL CA bundle ────────────────────────────────
# PyInstaller --onefile extracts to a temp _MEIxxxx dir that Windows can
# clean up at any time.  We copy the cert bundle to a PERMANENT location
# (ProgramData) so HTTPS keeps working even after _MEI is gone.
import os, sys
if getattr(sys, 'frozen', False):
    try:
        import certifi, shutil
        _src = certifi.where()
        _dst_dir = os.path.join(
            os.environ.get("PROGRAMDATA", "C:\\ProgramData"),
            "WinSystemHealth",
        )
        os.makedirs(_dst_dir, exist_ok=True)
        _dst = os.path.join(_dst_dir, "cacert.pem")
        if os.path.isfile(_src):
            shutil.copy2(_src, _dst)
        _ca = _dst if os.path.isfile(_dst) else _src
        os.environ['REQUESTS_CA_BUNDLE'] = _ca
        os.environ['SSL_CERT_FILE'] = _ca
    except Exception:
        pass

from agent_core.runner import run_with_auto_restart

if __name__ == "__main__":
    run_with_auto_restart()

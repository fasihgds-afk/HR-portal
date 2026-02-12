"""
GDS Attendance & Break Monitor — Desktop Agent
===============================================
Entry point. All logic is in the agent_core/ package.

Usage:
    python agent.py

Build:
    pyinstaller --noconsole --onefile --name AttendanceAgent --add-data "gds.png;." agent.py
"""

from agent_core.runner import run_with_auto_restart

if __name__ == "__main__":
    run_with_auto_restart()

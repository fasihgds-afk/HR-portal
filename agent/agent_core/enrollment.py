"""
Device enrollment: server registration + GUI enrollment dialog.
"""

import platform
import tkinter as tk
import requests

from .constants import AGENT_VERSION, THEME
from .config import log, save_config, resource_path
from .http_client import http


# ─── Server Enrollment ───────────────────────────────────────────

def enroll(server_url, emp_code):
    """Enroll this device with the HR server. Returns config dict."""
    url = f"{server_url.rstrip('/')}/api/agent/enroll"
    payload = {
        "empCode": emp_code,
        "deviceName": platform.node(),
        "os": f"{platform.system()} {platform.release()}",
        "agentVersion": AGENT_VERSION,
    }

    log.info("Enrolling device for %s at %s ...", emp_code, url)
    resp = http.post(url, json=payload, timeout=15)
    resp.raise_for_status()
    data = resp.json()

    if not data.get("success"):
        raise RuntimeError(f"Enrollment failed: {data.get('error', 'Unknown error')}")

    config = {
        "serverUrl": server_url.rstrip("/"),
        "empCode": emp_code,
        "deviceId": data["deviceId"],
        "deviceToken": data["deviceToken"],
        "heartbeatIntervalSec": data.get("heartbeatIntervalSec", 180),
    }

    save_config(config)
    log.info("Enrolled successfully! Device ID: %s", config["deviceId"])
    return config


# ─── GUI Enrollment Dialog ───────────────────────────────────────

def gui_enroll():
    """Show a GUI dialog for first-time enrollment. Returns config or None."""
    result = {"config": None}

    root = tk.Tk()
    root.title("GDS Attendance Agent — Setup")
    root.overrideredirect(False)
    root.resizable(False, False)
    root.configure(bg=THEME["bg_darkest"])
    root.attributes("-topmost", True)

    W, H = 520, 560
    root.geometry(f"{W}x{H}")
    root.update_idletasks()
    x = (root.winfo_screenwidth() - W) // 2
    y = (root.winfo_screenheight() - H) // 2
    root.geometry(f"{W}x{H}+{x}+{y}")

    # ─── Header: logo + title (taller, centered) ─────
    header = tk.Frame(root, bg=THEME["header_bg"], height=150)
    header.pack(fill="x")
    header.pack_propagate(False)
    header_content = tk.Frame(header, bg=THEME["header_bg"])
    header_content.pack(expand=True)

    try:
        logo_path = resource_path("gds.png")
        logo_img = tk.PhotoImage(file=logo_path)
        scale = max(1, logo_img.width() // 80)
        logo_img = logo_img.subsample(scale, scale)
        root._logo = logo_img
        tk.Label(header_content, image=logo_img,
                 bg=THEME["header_bg"]).pack(side="left", padx=(0, 18))
    except Exception:
        pass

    title_block = tk.Frame(header_content, bg=THEME["header_bg"])
    title_block.pack(side="left")
    tk.Label(title_block, text="Global Digital Solutions",
             font=("Segoe UI", 18, "bold"), fg="white",
             bg=THEME["header_bg"]).pack(anchor="w")
    tk.Label(title_block, text="Attendance Agent Setup",
             font=("Segoe UI", 11), fg=THEME["text_muted"],
             bg=THEME["header_bg"]).pack(anchor="w", pady=(2, 0))

    # ── Accent line ──
    tk.Frame(root, bg=THEME["primary"], height=3).pack(fill="x")

    # ─── Body ─────────────────────────────────
    body = tk.Frame(root, bg=THEME["bg_darkest"], padx=44, pady=30)
    body.pack(fill="both", expand=True)

    # Employee Code
    tk.Label(body, text="Employee Code",
             font=("Segoe UI", 12, "bold"),
             bg=THEME["bg_darkest"], fg=THEME["text_primary"]).pack(anchor="w")
    emp_var = tk.StringVar()
    emp_frame = tk.Frame(body, bg=THEME["border"], padx=1, pady=1)
    emp_frame.pack(fill="x", pady=(6, 18))
    emp_entry = tk.Entry(emp_frame, textvariable=emp_var,
                         font=("Segoe UI", 13),
                         bg=THEME["bg_input"], fg=THEME["text_primary"],
                         insertbackground=THEME["text_primary"],
                         relief="flat", borderwidth=0)
    emp_entry.pack(fill="x", ipady=8, padx=8, pady=4)

    # Server URL
    tk.Label(body, text="Server URL",
             font=("Segoe UI", 12, "bold"),
             bg=THEME["bg_darkest"], fg=THEME["text_primary"]).pack(anchor="w")
    url_var = tk.StringVar(value="https://hr-portal-beryl.vercel.app")
    url_frame = tk.Frame(body, bg=THEME["border"], padx=1, pady=1)
    url_frame.pack(fill="x", pady=(6, 18))
    url_entry = tk.Entry(url_frame, textvariable=url_var,
                         font=("Segoe UI", 13),
                         bg=THEME["bg_input"], fg=THEME["text_primary"],
                         insertbackground=THEME["text_primary"],
                         relief="flat", borderwidth=0)
    url_entry.pack(fill="x", ipady=8, padx=8, pady=4)

    status = tk.Label(body, text="", font=("Segoe UI", 11),
                      bg=THEME["bg_darkest"])
    status.pack(pady=(0, 12))

    def on_connect():
        emp = emp_var.get().strip()
        url = url_var.get().strip()
        if not emp:
            status.config(text="Employee code is required.", fg=THEME["error"])
            return
        if not url:
            status.config(text="Server URL is required.", fg=THEME["error"])
            return

        status.config(text="Connecting...", fg=THEME["primary"])
        btn.config(state="disabled")
        root.update()

        try:
            config = enroll(url, emp)
            result["config"] = config
            status.config(text="Enrolled! Starting agent...", fg=THEME["success"])
            root.after(800, root.quit)
        except requests.ConnectionError:
            status.config(text=f"Cannot connect to {url}. Check network.",
                          fg=THEME["error"])
            btn.config(state="normal")
        except Exception as e:
            err_msg = str(e)[:80]
            status.config(text=f"Error: {err_msg}", fg=THEME["error"])
            btn.config(state="normal")

    btn = tk.Button(body, text="Connect & Start",
                    font=("Segoe UI", 14, "bold"),
                    bg=THEME["primary"], fg="white",
                    activebackground=THEME["primary_hover"],
                    activeforeground="white",
                    relief="flat", padx=30, pady=14, cursor="hand2",
                    command=on_connect)
    btn.pack(fill="x")

    # ── Footer ──
    tk.Frame(root, bg=THEME["border"], height=1).pack(fill="x", padx=44, pady=(0, 0))
    footer = tk.Frame(root, bg=THEME["bg_darkest"], height=38)
    footer.pack(fill="x")
    footer.pack_propagate(False)
    tk.Label(footer, text=f"v{AGENT_VERSION}",
             font=("Segoe UI", 8), fg=THEME["text_dark"],
             bg=THEME["bg_darkest"]).pack(expand=True)

    root.protocol("WM_DELETE_WINDOW", root.quit)
    emp_entry.focus_set()
    root.mainloop()

    try:
        root.destroy()
    except Exception:
        pass

    return result["config"]

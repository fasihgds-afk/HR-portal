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
    root.title("GDS Attendance Agent \u2014 Setup")
    root.geometry("460x420")
    root.resizable(False, False)
    root.configure(bg=THEME["bg_darkest"])
    root.attributes("-topmost", True)

    # Center on screen
    root.update_idletasks()
    x = (root.winfo_screenwidth() // 2) - 230
    y = (root.winfo_screenheight() // 2) - 210
    root.geometry(f"460x420+{x}+{y}")

    # ─── Header with logo ────────────────────
    header = tk.Frame(root, bg=THEME["header_bg"], height=80)
    header.pack(fill="x")
    header.pack_propagate(False)

    header_inner = tk.Frame(header, bg=THEME["header_bg"])
    header_inner.pack(expand=True)

    try:
        logo_path = resource_path("gds.png")
        logo_img = tk.PhotoImage(file=logo_path)
        logo_img = logo_img.subsample(
            max(1, logo_img.width() // 50),
            max(1, logo_img.height() // 50),
        )
        root._logo = logo_img  # prevent GC
        tk.Label(header_inner, image=logo_img, bg=THEME["header_bg"]).pack(side="left", padx=(0, 10))
    except Exception:
        pass

    title_frame = tk.Frame(header_inner, bg=THEME["header_bg"])
    title_frame.pack(side="left")
    tk.Label(title_frame, text="Global Digital Solutions",
             font=("Segoe UI", 14, "bold"), fg="white",
             bg=THEME["header_bg"]).pack(anchor="w")
    tk.Label(title_frame, text="Attendance Agent Setup",
             font=("Segoe UI", 10), fg=THEME["text_secondary"],
             bg=THEME["header_bg"]).pack(anchor="w")

    # ─── Body ─────────────────────────────────
    body = tk.Frame(root, bg=THEME["bg_darkest"], padx=35, pady=25)
    body.pack(fill="both", expand=True)

    # Employee Code
    tk.Label(body, text="Employee Code", font=("Segoe UI", 11, "bold"),
             bg=THEME["bg_darkest"], fg=THEME["text_primary"]).pack(anchor="w")
    emp_var = tk.StringVar()
    emp_entry = tk.Entry(body, textvariable=emp_var, font=("Segoe UI", 12),
                         bg=THEME["bg_input"], fg=THEME["text_primary"],
                         insertbackground=THEME["text_primary"],
                         relief="solid", borderwidth=1,
                         highlightbackground=THEME["border"],
                         highlightcolor=THEME["primary"])
    emp_entry.pack(fill="x", pady=(4, 14))

    # Server URL
    tk.Label(body, text="Server URL", font=("Segoe UI", 11, "bold"),
             bg=THEME["bg_darkest"], fg=THEME["text_primary"]).pack(anchor="w")
    url_var = tk.StringVar(value="https://hr-portal-beryl.vercel.app")
    url_entry = tk.Entry(body, textvariable=url_var, font=("Segoe UI", 12),
                         bg=THEME["bg_input"], fg=THEME["text_primary"],
                         insertbackground=THEME["text_primary"],
                         relief="solid", borderwidth=1,
                         highlightbackground=THEME["border"],
                         highlightcolor=THEME["primary"])
    url_entry.pack(fill="x", pady=(4, 14))

    status = tk.Label(body, text="", font=("Segoe UI", 10), bg=THEME["bg_darkest"])
    status.pack(pady=(0, 10))

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
        root.update()

        try:
            config = enroll(url, emp)
            result["config"] = config
            status.config(text="Enrolled! Starting agent...", fg=THEME["success"])
            root.after(800, root.quit)
        except requests.ConnectionError:
            status.config(text=f"Cannot connect to {url}. Check network.", fg=THEME["error"])
        except Exception as e:
            err_msg = str(e)[:80]
            status.config(text=f"Error: {err_msg}", fg=THEME["error"])

    btn = tk.Button(body, text="Connect & Start", font=("Segoe UI", 12, "bold"),
                    bg=THEME["primary"], fg="white",
                    activebackground=THEME["primary_hover"],
                    activeforeground="white",
                    relief="flat", padx=20, pady=10, cursor="hand2",
                    command=on_connect)
    btn.pack(fill="x")

    root.protocol("WM_DELETE_WINDOW", root.quit)
    root.mainloop()

    try:
        root.destroy()
    except Exception:
        pass

    return result["config"]

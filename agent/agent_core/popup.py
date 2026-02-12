"""
IdlePopup — Fullscreen break reason form shown when employee goes IDLE.
Styled with GDS portal dark theme and company branding.
Employee MUST select a category AND type a reason — form will NOT close otherwise.
"""

import time
import threading
import tkinter as tk
from datetime import datetime, timezone

from .constants import THEME, BREAK_REASONS
from .config import log, resource_path
from .http_client import http


class IdlePopup:
    """
    HYBRID break tracking:
      1. Form appears  → break STARTS (POST to DB, reason = "Pending")
      2. Form submitted → reason SAVED (PATCH reason onto open break)
      3. Employee works → break ENDS  (PATCH endedAt from main_loop)
    """

    def __init__(self, config, tracker):
        self._config = config
        self._tracker = tracker
        self._popup_open = False
        self._popup_lock = threading.Lock()
        self._break_active = False
        self._popup_show_time = 0
        self.popup_showing = False  # Public flag to suppress activity tracking

    @property
    def is_open(self):
        with self._popup_lock:
            return self._popup_open

    @property
    def break_active(self):
        with self._popup_lock:
            return self._break_active

    def show_popup(self):
        """Show the fullscreen idle reason popup. Blocks until submitted."""
        with self._popup_lock:
            if self._popup_open:
                return
            self._popup_open = True

        self._popup_show_time = time.time()
        self.popup_showing = True
        log.info("Break timer started (form appeared)")

        # Step 1: Create open break in DB
        self._send_break_start()

        try:
            self._run_popup()
        except Exception as e:
            log.error("Popup error: %s", e)
        finally:
            self.popup_showing = False
            with self._popup_lock:
                self._popup_open = False

    def _run_popup(self):
        """Create and run the fullscreen popup window."""
        root = tk.Tk()
        root.title("GDS Attendance Monitor \u2014 Break Reason")
        root.configure(bg=THEME["bg_darkest"])

        # FULLSCREEN
        root.attributes("-fullscreen", True)
        root.attributes("-topmost", True)

        # Keep always on top (don't call focus_force — it steals Entry focus)
        def stay_on_top():
            try:
                root.attributes("-topmost", True)
                root.lift()
                root.after(1000, stay_on_top)
            except Exception:
                pass
        root.after(500, stay_on_top)

        # Block closing
        root.protocol("WM_DELETE_WINDOW", lambda: None)
        root.bind("<Alt-F4>", lambda e: "break")
        root.bind("<Escape>", lambda e: "break")

        # Center card
        root.grid_rowconfigure(0, weight=1)
        root.grid_columnconfigure(0, weight=1)

        card = tk.Frame(root, bg=THEME["bg_card"], padx=0, pady=0,
                        highlightbackground=THEME["border"], highlightthickness=2)
        card.grid(row=0, column=0)

        # ─── Header with GDS branding ────────────
        header = tk.Frame(card, bg=THEME["header_bg"], width=520, height=80)
        header.pack(fill="x")
        header.pack_propagate(False)

        header_inner = tk.Frame(header, bg=THEME["header_bg"])
        header_inner.pack(expand=True)

        try:
            logo_path = resource_path("gds.png")
            logo_img = tk.PhotoImage(file=logo_path)
            scale = max(1, logo_img.width() // 45)
            logo_img = logo_img.subsample(scale, scale)
            root._logo = logo_img
            tk.Label(header_inner, image=logo_img,
                     bg=THEME["header_bg"]).pack(side="left", padx=(0, 12))
        except Exception:
            pass

        title_frame = tk.Frame(header_inner, bg=THEME["header_bg"])
        title_frame.pack(side="left")
        tk.Label(title_frame, text="Global Digital Solutions",
                 font=("Segoe UI", 15, "bold"), fg="white",
                 bg=THEME["header_bg"]).pack(anchor="w")
        tk.Label(title_frame, text="Attendance & Break Monitor",
                 font=("Segoe UI", 10), fg=THEME["text_secondary"],
                 bg=THEME["header_bg"]).pack(anchor="w")

        # ─── Idle banner ─────────────────────────
        idle_banner = tk.Frame(card, bg=THEME["warning"], height=40)
        idle_banner.pack(fill="x")
        idle_banner.pack_propagate(False)
        tk.Label(idle_banner, text="\u26a0  You Are Currently Idle",
                 font=("Segoe UI", 13, "bold"), fg="#1e293b",
                 bg=THEME["warning"]).pack(pady=8)

        # ─── Body ────────────────────────────────
        body = tk.Frame(card, bg=THEME["bg_card"], padx=40, pady=25, width=520)
        body.pack(fill="both")

        tk.Label(body, text="Select break category:",
                 font=("Segoe UI", 12, "bold"),
                 bg=THEME["bg_card"], fg=THEME["text_primary"]).pack(anchor="w", pady=(0, 10))

        reason_var = tk.StringVar(value="")
        custom_var = tk.StringVar(value="")

        # Radio buttons
        radio_frame = tk.Frame(body, bg=THEME["bg_card"])
        radio_frame.pack(fill="x")

        for reason in BREAK_REASONS:
            rb = tk.Radiobutton(
                radio_frame, text=reason, variable=reason_var, value=reason,
                font=("Segoe UI", 13), bg=THEME["bg_card"],
                fg=THEME["text_primary"], activebackground=THEME["bg_hover"],
                activeforeground=THEME["text_primary"],
                selectcolor=THEME["bg_input"],
                anchor="w", padx=15, pady=4,
                command=lambda: submit_btn.config(state="normal"),
            )
            rb.pack(fill="x", pady=1)

        # Reason text input
        tk.Label(body, text="Enter reason (required):",
                 font=("Segoe UI", 12, "bold"),
                 bg=THEME["bg_card"], fg=THEME["text_primary"]).pack(anchor="w", pady=(16, 6))

        reason_entry = tk.Entry(body, textvariable=custom_var,
                                font=("Segoe UI", 12), width=45,
                                bg=THEME["bg_input"], fg=THEME["text_primary"],
                                insertbackground=THEME["text_primary"],
                                relief="solid", borderwidth=1,
                                highlightbackground=THEME["border"],
                                highlightcolor=THEME["primary"])
        reason_entry.pack(fill="x", pady=(0, 4))

        tk.Label(body,
                 text="e.g. Meeting with manager, Lunch, Zuhr prayer, etc.",
                 font=("Segoe UI", 9),
                 bg=THEME["bg_card"], fg=THEME["text_dark"]).pack(anchor="w")

        # Status + Submit
        status_label = tk.Label(body, text="", font=("Segoe UI", 10),
                                bg=THEME["bg_card"])
        status_label.pack(pady=(10, 0))

        submit_btn = tk.Button(body, text="Submit Break Reason",
                               font=("Segoe UI", 14, "bold"),
                               bg=THEME["primary"], fg="white",
                               activebackground=THEME["primary_hover"],
                               activeforeground="white",
                               relief="flat", padx=30, pady=12,
                               state="disabled", cursor="hand2")

        def on_submit():
            reason = reason_var.get()
            custom = custom_var.get().strip()

            if not reason:
                status_label.config(text="Please select a category.", fg=THEME["error"])
                return
            if not custom:
                status_label.config(text="Please type your reason \u2014 it is required.",
                                    fg=THEME["error"])
                reason_entry.focus_set()
                return

            status_label.config(text="Submitting...", fg=THEME["primary"])
            submit_btn.config(state="disabled")

            success = self._send_break_reason(reason, custom)

            if success:
                elapsed = round((time.time() - self._popup_show_time) / 60)
                status_label.config(
                    text=f"Submitted! Idle so far: {elapsed} min. Closing...",
                    fg=THEME["success"])
                root.after(500, root.quit)
            else:
                status_label.config(text="Server error. Please try again.", fg=THEME["error"])
                submit_btn.config(state="normal")

        submit_btn.config(command=on_submit)
        submit_btn.pack(pady=(12, 0), fill="x")

        # Footer
        footer = tk.Frame(card, bg=THEME["bg_card"], height=40)
        footer.pack(fill="x")
        footer.pack_propagate(False)
        tk.Label(footer,
                 text="This form will close after you submit. Select a category and type your reason.",
                 font=("Segoe UI", 9), bg=THEME["bg_card"],
                 fg=THEME["text_dark"]).pack(pady=10)

        # Run (blocks until submitted)
        root.mainloop()

        try:
            root.destroy()
        except Exception:
            pass

    # ─── Break API calls ─────────────────────────────────────

    def _send_break_start(self):
        """Step 1: Create an open break in DB when form appears."""
        url = f"{self._config['serverUrl']}/api/agent/break-log"
        started_iso = (
            datetime.fromtimestamp(self._popup_show_time, tz=timezone.utc)
            .isoformat()
            .replace("+00:00", "Z")
        )

        payload = {
            "deviceId": self._config["deviceId"],
            "deviceToken": self._config["deviceToken"],
            "empCode": self._config["empCode"],
            "reason": "Pending",
            "customReason": "Waiting for employee to submit reason",
            "startedAt": started_iso,
        }

        for attempt in range(3):
            try:
                resp = http.post(url, json=payload, timeout=20)
                if resp.status_code == 200:
                    log.info("Break opened in DB (form appeared)")
                    with self._popup_lock:
                        self._break_active = True
                    return True
                else:
                    log.warning("Break start failed (attempt %d): HTTP %d", attempt + 1, resp.status_code)
            except Exception as e:
                log.warning("Break start error (attempt %d): %s", attempt + 1, e)
            if attempt < 2:
                time.sleep(2)

        log.error("Break start FAILED after 3 attempts")
        return False

    def _send_break_reason(self, reason, custom_reason):
        """Step 2: Update the open break with employee's chosen reason."""
        url = f"{self._config['serverUrl']}/api/agent/break-log"

        payload = {
            "deviceId": self._config["deviceId"],
            "deviceToken": self._config["deviceToken"],
            "empCode": self._config["empCode"],
            "action": "update-reason",
            "reason": reason,
            "customReason": custom_reason,
        }

        for attempt in range(3):
            try:
                resp = http.patch(url, json=payload, timeout=20)
                if resp.status_code == 200:
                    log.info("Break reason updated: %s \u2014 %s", reason, custom_reason)
                    return True
                else:
                    log.warning("Break reason update failed (attempt %d): HTTP %d", attempt + 1, resp.status_code)
            except Exception as e:
                log.warning("Break reason update error (attempt %d): %s", attempt + 1, e)
            if attempt < 2:
                time.sleep(2)

        log.error("Break reason update FAILED after 3 attempts")
        return False

    def send_break_end(self):
        """Step 3: Close the open break when employee becomes ACTIVE."""
        with self._popup_lock:
            if not self._break_active:
                return
            self._break_active = False

        url = f"{self._config['serverUrl']}/api/agent/break-log"
        payload = {
            "deviceId": self._config["deviceId"],
            "deviceToken": self._config["deviceToken"],
            "empCode": self._config["empCode"],
            "action": "end-break",
        }

        for attempt in range(3):
            try:
                resp = http.patch(url, json=payload, timeout=20)
                if resp.status_code == 200:
                    data = resp.json()
                    log.info("Break ended: %s", data.get("message", ""))
                    return
                else:
                    log.warning("Break end failed (attempt %d): HTTP %d", attempt + 1, resp.status_code)
            except Exception as e:
                log.warning("Break end error (attempt %d): %s", attempt + 1, e)
            if attempt < 2:
                time.sleep(2)

        log.error("Break end FAILED after 3 attempts")

"""
IdlePopup — fullscreen break reason form.

Created and managed EXCLUSIVELY on the Tkinter main thread.
Never instantiated from a background thread.

Network calls (break_reason) are dispatched to a worker thread,
with result polling via root.after() — the UI never blocks.
"""

import time
import threading
import tkinter as tk

from .constants import THEME, BREAK_REASONS
from .config import log, resource_path
from .api import send_break_reason


class IdlePopup:
    """
    Lifecycle (all on main thread):
      show()         → creates Toplevel, calls on_shown callback
      _on_submit()   → validates, starts async API call, polls for result
      _finish()      → destroys Toplevel, calls on_submitted callback
    """

    def __init__(self, root, config, on_submitted):
        """
        Args:
            root:          The hidden Tk() root (parent for Toplevel).
            config:        Agent config dict (serverUrl, deviceId, etc.).
            on_submitted:  Callback(reason, custom_reason) called after successful submit.
        """
        self._root = root
        self._config = config
        self._on_submitted = on_submitted
        self._toplevel = None
        self._submit_result = None  # None=pending, True=ok, False=failed

    @property
    def is_visible(self):
        return self._toplevel is not None

    def show(self):
        """Show the fullscreen popup. Must be called from main thread."""
        if self._toplevel is not None:
            return  # Already showing — idempotent guard

        self._submit_result = None
        top = tk.Toplevel(self._root)
        self._toplevel = top
        top.title("GDS Attendance Monitor \u2014 Break Reason")
        top.configure(bg=THEME["bg_darkest"])

        # Fullscreen + always on top
        top.attributes("-fullscreen", True)
        top.attributes("-topmost", True)

        # Re-enforce topmost every second (without focus_force — that steals Entry focus)
        def stay_on_top():
            try:
                top.attributes("-topmost", True)
                top.lift()
                top.after(1000, stay_on_top)
            except tk.TclError:
                pass  # Window destroyed
        top.after(500, stay_on_top)

        # Block all close attempts
        top.protocol("WM_DELETE_WINDOW", lambda: None)
        top.bind("<Alt-F4>", lambda e: "break")
        top.bind("<Escape>", lambda e: "break")

        # Center card
        top.grid_rowconfigure(0, weight=1)
        top.grid_columnconfigure(0, weight=1)

        card = tk.Frame(top, bg=THEME["bg_card"],
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
            top._logo = logo_img  # prevent GC
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
        banner = tk.Frame(card, bg=THEME["warning"], height=40)
        banner.pack(fill="x")
        banner.pack_propagate(False)
        tk.Label(banner, text="\u26a0  You Are Currently Idle",
                 font=("Segoe UI", 13, "bold"), fg="#1e293b",
                 bg=THEME["warning"]).pack(pady=8)

        # ─── Body ────────────────────────────────
        body = tk.Frame(card, bg=THEME["bg_card"], padx=40, pady=25, width=520)
        body.pack(fill="both")

        tk.Label(body, text="Select break category:",
                 font=("Segoe UI", 12, "bold"),
                 bg=THEME["bg_card"], fg=THEME["text_primary"]).pack(anchor="w", pady=(0, 10))

        self._reason_var = tk.StringVar(value="")
        self._custom_var = tk.StringVar(value="")

        radio_frame = tk.Frame(body, bg=THEME["bg_card"])
        radio_frame.pack(fill="x")

        for reason in BREAK_REASONS:
            rb = tk.Radiobutton(
                radio_frame, text=reason, variable=self._reason_var, value=reason,
                font=("Segoe UI", 13), bg=THEME["bg_card"],
                fg=THEME["text_primary"], activebackground=THEME["bg_hover"],
                activeforeground=THEME["text_primary"],
                selectcolor=THEME["bg_input"],
                anchor="w", padx=15, pady=4,
                command=lambda: self._submit_btn.config(state="normal"),
            )
            rb.pack(fill="x", pady=1)

        tk.Label(body, text="Enter reason (required):",
                 font=("Segoe UI", 12, "bold"),
                 bg=THEME["bg_card"], fg=THEME["text_primary"]).pack(anchor="w", pady=(16, 6))

        self._reason_entry = tk.Entry(
            body, textvariable=self._custom_var,
            font=("Segoe UI", 12), width=45,
            bg=THEME["bg_input"], fg=THEME["text_primary"],
            insertbackground=THEME["text_primary"],
            relief="solid", borderwidth=1,
            highlightbackground=THEME["border"],
            highlightcolor=THEME["primary"],
        )
        self._reason_entry.pack(fill="x", pady=(0, 4))

        tk.Label(body,
                 text="e.g. Meeting with manager, Lunch, Zuhr prayer, etc.",
                 font=("Segoe UI", 9),
                 bg=THEME["bg_card"], fg=THEME["text_dark"]).pack(anchor="w")

        self._status_label = tk.Label(body, text="", font=("Segoe UI", 10),
                                      bg=THEME["bg_card"])
        self._status_label.pack(pady=(10, 0))

        self._submit_btn = tk.Button(
            body, text="Submit Break Reason",
            font=("Segoe UI", 14, "bold"),
            bg=THEME["primary"], fg="white",
            activebackground=THEME["primary_hover"],
            activeforeground="white",
            relief="flat", padx=30, pady=12,
            state="disabled", cursor="hand2",
            command=self._on_submit,
        )
        self._submit_btn.pack(pady=(12, 0), fill="x")

        footer = tk.Frame(card, bg=THEME["bg_card"], height=40)
        footer.pack(fill="x")
        footer.pack_propagate(False)
        tk.Label(footer,
                 text="This form will close after you submit. Select a category and type your reason.",
                 font=("Segoe UI", 9), bg=THEME["bg_card"],
                 fg=THEME["text_dark"]).pack(pady=10)

        log.info("Popup shown (main thread)")

    def hide(self):
        """Destroy the popup Toplevel. Must be called from main thread."""
        if self._toplevel is not None:
            try:
                self._toplevel.destroy()
            except Exception:
                pass
            self._toplevel = None

    # ─── Submit flow (non-blocking) ──────────────────────────

    def _on_submit(self):
        """Validate → start async API call → poll for result."""
        reason = self._reason_var.get()
        custom = self._custom_var.get().strip()

        if not reason:
            self._status_label.config(text="Please select a category.", fg=THEME["error"])
            return
        if not custom:
            self._status_label.config(
                text="Please type your reason \u2014 it is required.", fg=THEME["error"])
            self._reason_entry.focus_set()
            return

        # Disable UI, show spinner
        self._submit_btn.config(state="disabled")
        self._status_label.config(text="Submitting...", fg=THEME["primary"])
        self._submit_result = None

        # Capture values now (fresh, not stale)
        config = self._config
        r, c = reason, custom

        def do_call():
            self._submit_result = send_break_reason(config, r, c)

        threading.Thread(target=do_call, daemon=True).start()
        self._poll_submit(reason, custom)

    def _poll_submit(self, reason, custom):
        """Poll for API result without blocking the main thread."""
        if self._submit_result is None:
            # Still waiting — check again in 100ms
            self._root.after(100, lambda: self._poll_submit(reason, custom))
            return

        if self._submit_result:
            self._status_label.config(text="Submitted! Closing...", fg=THEME["success"])
            self._root.after(400, lambda: self._finish(reason, custom))
        else:
            self._status_label.config(text="Server error. Please try again.", fg=THEME["error"])
            self._submit_btn.config(state="normal")

    def _finish(self, reason, custom):
        """Close popup and notify the app."""
        self.hide()
        if self._on_submitted:
            self._on_submitted(reason, custom)

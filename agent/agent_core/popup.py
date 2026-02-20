"""
IdlePopup — fullscreen break reason form.

Created and managed EXCLUSIVELY on the Tkinter main thread.
Never instantiated from a background thread.

Network calls (break_reason) are dispatched to a worker thread,
with result polling via root.after() — the UI never blocks.
Hardened against widget-destroyed crashes with TclError guards.
"""

import time
import threading
import tkinter as tk

from .constants import THEME, BREAK_REASONS
from .config import log, resource_path
from .api import send_break_reason


_SUBMIT_TIMEOUT = 50  # Max seconds to wait for API before forcing failure


class IdlePopup:
    """
    Lifecycle (all on main thread):
      show()         → creates Toplevel
      _on_submit()   → validates, starts async API call, polls for result
      _finish()      → destroys Toplevel, calls on_submitted callback
    """

    def __init__(self, root, config, on_submitted):
        self._root = root
        self._config = config
        self._on_submitted = on_submitted
        self._toplevel = None
        self._submit_result = None
        self._submit_start_time = 0.0

    @property
    def is_visible(self):
        return self._toplevel is not None

    def show(self):
        """Show the fullscreen popup. Must be called from main thread."""
        if self._toplevel is not None:
            return

        self._submit_result = None
        self._submit_start_time = 0.0

        try:
            self._build_ui()
        except Exception as e:
            log.error("Failed to build popup UI: %s", e, exc_info=True)
            self._toplevel = None

    def hide(self):
        """Destroy the popup Toplevel. Must be called from main thread."""
        if self._toplevel is not None:
            try:
                self._toplevel.destroy()
            except Exception:
                pass
            self._toplevel = None

    # ─── UI construction ─────────────────────────────────────

    def _build_ui(self):
        top = tk.Toplevel(self._root)
        self._toplevel = top
        top.title("Break Reason")
        top.configure(bg=THEME["bg_darkest"])

        top.attributes("-fullscreen", True)
        top.attributes("-topmost", True)

        def stay_on_top():
            try:
                top.attributes("-topmost", True)
                top.lift()
                top.after(1000, stay_on_top)
            except tk.TclError:
                pass
        top.after(500, stay_on_top)

        top.protocol("WM_DELETE_WINDOW", lambda: None)
        top.bind("<Alt-F4>", lambda e: "break")
        top.bind("<Escape>", lambda e: "break")

        top.grid_rowconfigure(0, weight=1)
        top.grid_columnconfigure(0, weight=1)

        # Outer card with subtle glow effect (double border)
        outer = tk.Frame(top, bg=THEME["primary"], padx=1, pady=1)
        outer.grid(row=0, column=0)
        card = tk.Frame(outer, bg=THEME["bg_card"], width=560)
        card.pack()

        # ── Header with large centered logo ──────────────
        header = tk.Frame(card, bg=THEME["header_bg"], width=560, height=140)
        header.pack(fill="x")
        header.pack_propagate(False)
        header_content = tk.Frame(header, bg=THEME["header_bg"])
        header_content.pack(expand=True)

        try:
            logo_path = resource_path("gds.png")
            logo_img = tk.PhotoImage(file=logo_path)
            # Target ~80px logo (1020/80 ≈ 12.75 → subsample by 13)
            scale = max(1, logo_img.width() // 80)
            logo_img = logo_img.subsample(scale, scale)
            top._logo = logo_img
            tk.Label(header_content, image=logo_img,
                     bg=THEME["header_bg"]).pack(side="left", padx=(0, 18))
        except Exception:
            pass

        title_block = tk.Frame(header_content, bg=THEME["header_bg"])
        title_block.pack(side="left")
        tk.Label(title_block, text="Global Digital Solutions",
                 font=("Segoe UI", 18, "bold"), fg="white",
                 bg=THEME["header_bg"]).pack(anchor="w")
        tk.Label(title_block, text="Attendance & Break Monitor",
                 font=("Segoe UI", 11), fg=THEME["text_muted"],
                 bg=THEME["header_bg"]).pack(anchor="w", pady=(2, 0))

        # ── Idle warning banner ───────────────────────────
        banner = tk.Frame(card, bg=THEME["warning"], height=44)
        banner.pack(fill="x")
        banner.pack_propagate(False)
        tk.Label(banner, text="\u26a0  You Are Currently Idle  \u26a0",
                 font=("Segoe UI", 13, "bold"), fg="#0f172a",
                 bg=THEME["warning"]).pack(expand=True)

        # ── Body ──────────────────────────────────────────
        body = tk.Frame(card, bg=THEME["bg_card"], padx=44, pady=28, width=560)
        body.pack(fill="both")

        tk.Label(body, text="Select break category",
                 font=("Segoe UI", 13, "bold"),
                 bg=THEME["bg_card"], fg=THEME["text_primary"]).pack(anchor="w", pady=(0, 12))

        self._reason_var = tk.StringVar(value="")
        self._custom_var = tk.StringVar(value="")

        radio_frame = tk.Frame(body, bg=THEME["bg_dark"],
                               highlightbackground=THEME["border"], highlightthickness=1)
        radio_frame.pack(fill="x")

        for i, reason in enumerate(BREAK_REASONS):
            rb_bg = THEME["bg_dark"]
            rb = tk.Radiobutton(
                radio_frame, text=reason, variable=self._reason_var, value=reason,
                font=("Segoe UI", 13), bg=rb_bg,
                fg=THEME["text_primary"], activebackground=THEME["bg_hover"],
                activeforeground=THEME["text_primary"],
                selectcolor=THEME["bg_input"],
                anchor="w", padx=18, pady=8,
                command=lambda: self._safe_widget_config(self._submit_btn, state="normal"),
            )
            rb.pack(fill="x")
            if i < len(BREAK_REASONS) - 1:
                tk.Frame(radio_frame, bg=THEME["border"], height=1).pack(fill="x")

        tk.Label(body, text="Enter reason (required)",
                 font=("Segoe UI", 13, "bold"),
                 bg=THEME["bg_card"], fg=THEME["text_primary"]).pack(anchor="w", pady=(20, 8))

        entry_frame = tk.Frame(body, bg=THEME["border"], padx=1, pady=1)
        entry_frame.pack(fill="x")
        self._reason_entry = tk.Entry(
            entry_frame, textvariable=self._custom_var,
            font=("Segoe UI", 13), width=45,
            bg=THEME["bg_input"], fg=THEME["text_primary"],
            insertbackground=THEME["text_primary"],
            relief="flat", borderwidth=0,
        )
        self._reason_entry.pack(fill="x", ipady=8, padx=8, pady=4)

        tk.Label(body,
                 text="e.g. Meeting with manager, Lunch, Zuhr prayer, etc.",
                 font=("Segoe UI", 9, "italic"),
                 bg=THEME["bg_card"], fg=THEME["text_dark"]).pack(anchor="w", pady=(4, 0))

        self._status_label = tk.Label(body, text="", font=("Segoe UI", 11),
                                      bg=THEME["bg_card"])
        self._status_label.pack(pady=(14, 0))

        self._submit_btn = tk.Button(
            body, text="Submit Break Reason",
            font=("Segoe UI", 14, "bold"),
            bg=THEME["primary"], fg="white",
            activebackground=THEME["primary_hover"],
            activeforeground="white",
            relief="flat", padx=30, pady=14,
            state="disabled", cursor="hand2",
            command=self._on_submit,
        )
        self._submit_btn.pack(pady=(14, 0), fill="x")

        # ── Footer ────────────────────────────────────────
        sep = tk.Frame(card, bg=THEME["border"], height=1)
        sep.pack(fill="x", padx=44, pady=(0, 0))

        footer = tk.Frame(card, bg=THEME["bg_card"], height=48)
        footer.pack(fill="x")
        footer.pack_propagate(False)
        tk.Label(footer,
                 text="Select a category and type your reason. This form closes after submission.",
                 font=("Segoe UI", 9), bg=THEME["bg_card"],
                 fg=THEME["text_dark"]).pack(expand=True)

        log.info("Popup shown (main thread)")

    # ─── Safe widget helpers ─────────────────────────────────

    def _safe_widget_config(self, widget, **kwargs):
        """Configure a widget, silently ignoring TclError if destroyed."""
        try:
            widget.config(**kwargs)
        except (tk.TclError, AttributeError):
            pass

    # ─── Submit flow (non-blocking, crash-hardened) ──────────

    def _on_submit(self):
        """Validate → start async API call → poll for result."""
        if self._toplevel is None:
            return

        try:
            reason = self._reason_var.get()
            custom = self._custom_var.get().strip()
        except (tk.TclError, AttributeError):
            return

        if not reason:
            self._safe_widget_config(self._status_label, text="Please select a category.", fg=THEME["error"])
            return
        if not custom:
            self._safe_widget_config(
                self._status_label,
                text="Please type your reason \u2014 it is required.",
                fg=THEME["error"],
            )
            try:
                self._reason_entry.focus_set()
            except (tk.TclError, AttributeError):
                pass
            return

        self._safe_widget_config(self._submit_btn, state="disabled")
        self._safe_widget_config(self._status_label, text="Submitting...", fg=THEME["primary"])
        self._submit_result = None
        self._submit_start_time = time.time()

        config = self._config
        r, c = reason, custom

        def do_call():
            try:
                self._submit_result = send_break_reason(config, r, c)
            except Exception as e:
                log.error("Break reason submit thread error: %s", e)
                self._submit_result = False

        threading.Thread(target=do_call, daemon=True).start()
        self._poll_submit(reason, custom)

    def _poll_submit(self, reason, custom):
        """Poll for API result without blocking the main thread."""
        if self._toplevel is None:
            self._finish(reason, custom)
            return

        # Timeout guard: if the API hangs, force failure after _SUBMIT_TIMEOUT seconds
        if self._submit_result is None:
            if time.time() - self._submit_start_time > _SUBMIT_TIMEOUT:
                log.warning("Submit poll timed out after %ds", _SUBMIT_TIMEOUT)
                self._submit_result = False
            else:
                try:
                    self._root.after(150, lambda: self._poll_submit(reason, custom))
                except tk.TclError:
                    pass
                return

        try:
            if self._submit_result:
                self._safe_widget_config(self._status_label, text="Submitted! Closing...", fg=THEME["success"])
                self._root.after(400, lambda: self._finish(reason, custom))
            else:
                self._safe_widget_config(
                    self._status_label,
                    text="Could not reach server. Check your connection and try again.",
                    fg=THEME["error"],
                )
                self._safe_widget_config(self._submit_btn, state="normal")
        except tk.TclError:
            self._finish(reason, custom)

    def _finish(self, reason, custom):
        """Close popup and notify the app."""
        self.hide()
        if self._on_submitted:
            try:
                self._on_submitted(reason, custom)
            except Exception as e:
                log.error("on_submitted callback error: %s", e)

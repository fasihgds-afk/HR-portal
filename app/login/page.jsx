// app/login/page.jsx
"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { useTheme } from "@/lib/theme/ThemeContext";

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { theme, toggleTheme, colors } = useTheme();

  // 🔒 Lock employee login on UI
  const employeeLoginLocked = false; // change to false if you want to re-enable employee login

  // mode: "HR" or "EMPLOYEE"
  const initialModeFromUrl = searchParams.get("role");
  const [mode, setMode] = useState(
    initialModeFromUrl === "hr"
      ? "HR"
      : initialModeFromUrl === "employee"
      ? "EMPLOYEE"
      : "EMPLOYEE"
  );

  const [hrEmail, setHrEmail] = useState("");
  const [hrPassword, setHrPassword] = useState("");

  // EMPLOYEE: ONLY EMP CODE (still here but blocked)
  const [empCode, setEmpCode] = useState("");

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // If employee login is locked and mode is EMPLOYEE, force back to HR
  useEffect(() => {
    if (employeeLoginLocked && mode === "EMPLOYEE") {
      setMode("HR");
    }
  }, [employeeLoginLocked, mode]);

  // ---------------- HR LOGIN SUBMIT ----------------
  async function handleHrSubmit(e) {
    e.preventDefault();
    setErrorMsg("");
    setLoading(true);

    try {
      const result = await signIn("credentials", {
        redirect: false,
        mode: "HR",
        email: hrEmail,
        password: hrPassword,
        callbackUrl: "/hr/employees",
      });

      if (!result || result.error) {
        setErrorMsg("Invalid HR email or password.");
        setLoading(false);
        return;
      }

      // Optimize: Use router.push instead of window.location for faster navigation
      // Next.js router is faster than full page reload
      // The session cookie will still be sent with the next request
      router.push(result.url || "/hr/employees");
    } catch (err) {
      console.error("HR login error", err);
      setErrorMsg("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  // ---------------- EMPLOYEE LOGIN SUBMIT (empCode only) ----------------
  async function handleEmployeeSubmit(e) {
    e.preventDefault();
    setErrorMsg("");

    // Block if locked
    if (employeeLoginLocked) {
      setErrorMsg("Employee login is currently locked. Please contact HR.");
      return;
    }

    setLoading(true);

    try {
      const result = await signIn("credentials", {
        redirect: false,
        mode: "EMPLOYEE",
        empCode,
        callbackUrl: "/employee/dashboard",
      });

      if (!result || result.error) {
        setErrorMsg("Invalid employee code.");
        setLoading(false);
        return;
      }

      router.push(result.url || "/employee/dashboard");
    } catch (err) {
      console.error("Employee login error", err);
      setErrorMsg("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  // ---------------- RENDER ----------------
  const isDark = theme === "dark";
  const gradient = isDark
    ? "linear-gradient(135deg, #0F162A, #0c225cff, #58D34D)"
    : "linear-gradient(135deg, #3b82f6, #2563eb, #22c55e)";

  return (
    <div
      className="login-page-wrapper"
      style={{
        minHeight: "100vh",
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        backgroundImage: isDark ? "url('/new1.jpeg')" : "none",
        backgroundSize: "cover",
        backgroundPosition: "left center",
        backgroundRepeat: "no-repeat",
        backgroundAttachment: "fixed",
        backgroundColor: isDark ? colors.background.primary : colors.background.secondary,
        fontFamily:
          '-apple-system, BlinkMacSystemFont, system-ui, "Segoe UI", sans-serif',
        transition: "background-color 0.3s ease",
      }}
    >
      <style jsx>{`
        @media (max-width: 768px) {
          .login-page-wrapper {
            padding: 0 !important;
            align-items: flex-start !important;
            padding-top: 20px !important;
          }
          .login-container {
            width: 100% !important;
            max-width: 100% !important;
            margin-right: 0 !important;
            padding: 0 16px !important;
          }
          .login-card {
            flex-direction: column !important;
            border-radius: 20px !important;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3) !important;
          }
          .login-left-panel {
            display: none !important;
          }
          .login-right-panel {
            flex: 1 1 100% !important;
            padding: 28px 24px 24px !important;
          }
          .login-form-title {
            font-size: 22px !important;
            margin-bottom: 20px !important;
          }
          .login-toggle-buttons {
            margin-bottom: 20px !important;
          }
          .login-toggle-buttons button {
            padding: 10px 16px !important;
            font-size: 14px !important;
          }
          .login-form {
            padding: 20px !important;
          }
          .login-form label {
            font-size: 11px !important;
            margin-bottom: 8px !important;
          }
          .login-form input {
            padding: 12px 14px !important;
            font-size: 16px !important;
            min-height: 48px !important;
          }
          .login-submit-button {
            padding: 14px 20px !important;
            font-size: 14px !important;
            min-height: 48px !important;
            margin-top: 16px !important;
          }
          .login-copyright {
            margin-top: 24px !important;
            font-size: 10px !important;
          }
        }
        @media (max-width: 480px) {
          .login-page-wrapper {
            padding-top: 10px !important;
          }
          .login-right-panel {
            padding: 24px 20px 20px !important;
          }
          .login-form-title {
            font-size: 20px !important;
          }
          .login-form {
            padding: 16px !important;
          }
        }
      `}</style>

      {/* Theme Toggle Button */}
      <button
        type="button"
        onClick={toggleTheme}
        style={{
          position: "fixed",
          top: 20,
          right: 20,
          zIndex: 1000,
          width: 48,
          height: 48,
          borderRadius: "50%",
          border: `2px solid ${colors.border.default}`,
          backgroundColor: colors.background.card,
          color: colors.text.primary,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          fontSize: 20,
          boxShadow: colors.card.shadow,
          transition: "all 0.3s ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "scale(1.1)";
          e.currentTarget.style.borderColor = colors.primary[500];
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "scale(1)";
          e.currentTarget.style.borderColor = colors.border.default;
        }}
        title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      >
        {theme === "dark" ? "☀️" : "🌙"}
      </button>

      <div
        className="login-container"
        style={{ width: "80%", maxWidth: 850, marginRight: "350px" }}
      >
        <div
          className="login-card"
          style={{
            display: "flex",
            borderRadius: 30,
            overflow: "hidden",
            backgroundColor: colors.background.card,
            boxShadow: colors.card.shadow,
            border: `1px solid ${colors.border.default}`,
            transition: "all 0.3s ease",
          }}
        >
          {/* LEFT PANEL */}
          <div
            className="login-left-panel"
            style={{
              flex: "1 1 50%",
              position: "relative",
              padding: "32px 36px",
              background: gradient,
              color: "#f9fafb",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 70,
                right: 70,
                width: 120,
                height: 120,
                borderRadius: "50%",
                background: gradient,
                opacity: 0.9,
                boxShadow: "0 20px 52px rgba(0, 0, 0, 0.7)",
              }}
            />
            <div
              style={{
                position: "absolute",
                bottom: 40,
                left: 60,
                width: 95,
                height: 95,
                borderRadius: "50%",
                background: gradient,
                opacity: 0.95,
              }}
            />
            <div
              style={{
                position: "absolute",
                bottom: 78,
                right: 70,
                width: 52,
                height: 52,
                borderRadius: "50%",
                background: gradient,
                opacity: 0.95,
              }}
            />

            <div style={{ position: "relative", zIndex: 1, maxWidth: 380 }}>
              <div
                style={{
                  width: 180,
                  height: 180,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 24,
                  overflow: "hidden",
                  border: `2px solid ${colors.secondary[500]}`,
                  boxShadow: "0 18px 38px rgba(0, 0, 0, 0.85)",
                }}
              >
                <img
                  src="/gds.png"
                  alt="Global Digital Solutions"
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
              </div>

              <p
                style={{
                  margin: 0,
                  marginBottom: 20,
                  fontSize: 13,
                  letterSpacing: 1.5,
                  textTransform: "uppercase",
                  opacity: 0.9,
                }}
              >
                Sign in to your account
              </p>

              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  lineHeight: 1.6,
                  opacity: 0.96,
                }}
              >
                Manage attendance, monitor shifts and keep your team on time.
                Log in with your company credentials to access the GDS
                Attendance Control Center.
              </p>
            </div>

            <div
              style={{
                position: "relative",
                zIndex: 1,
                marginTop: 32,
                fontSize: 12,
                opacity: 0.9,
              }}
            >
              <div style={{ fontWeight: 600 }}>Global Digital Solutions</div>
              <div>Centralized Attendance &amp; HR Portal</div>
            </div>
          </div>

          {/* RIGHT PANEL – FORMS */}
          <div
            className="login-right-panel"
            style={{
              flex: "1 1 50%",
              padding: "30px 36px 28px",
              backgroundColor: colors.background.card,
              display: "flex",
              flexDirection: "column",
              transition: "background-color 0.3s ease",
            }}
          >
            <div className="login-form-title" style={{ marginBottom: 16 }}>
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 700,
                  color: colors.text.primary,
                  letterSpacing: 0.5,
                }}
              >
                Login Your Account
              </div>
            </div>

            {/* HR / EMPLOYEE TOGGLE */}
            <div
              className="login-toggle-buttons"
              style={{
                display: "flex",
                gap: 10,
                marginBottom: 14,
              }}
            >
              <button
                type="button"
                onClick={() => setMode("HR")}
                style={{
                  flex: 1,
                  padding: "9px 10px",
                  borderRadius: 999,
                  border:
                    mode === "HR"
                      ? `2px solid ${colors.primary[500]}`
                      : `2px solid ${colors.border.default}`,
                  backgroundColor:
                    mode === "HR"
                      ? `${colors.primary[500]}15`
                      : "transparent",
                  color: colors.text.primary,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                }}
              >
                HR
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!employeeLoginLocked) setMode("EMPLOYEE");
                }}
                disabled={employeeLoginLocked}
                style={{
                  flex: 1,
                  padding: "9px 10px",
                  borderRadius: 999,
                  border:
                    mode === "EMPLOYEE"
                      ? `2px solid ${colors.primary[500]}`
                      : `2px solid ${colors.border.default}`,
                  backgroundColor:
                    mode === "EMPLOYEE"
                      ? `${colors.primary[500]}15`
                      : "transparent",
                  color: colors.text.primary,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: employeeLoginLocked ? "not-allowed" : "pointer",
                  opacity: employeeLoginLocked ? 0.4 : 1,
                  transition: "all 0.2s ease",
                }}
              >
                Employee
              </button>
            </div>

            {/* ERROR MESSAGE */}
            {errorMsg && (
              <div
                style={{
                  padding: "8px 10px",
                  borderRadius: 10,
                  backgroundColor: isDark ? "#7f1d1d" : "#fee2e2",
                  border: `1px solid ${isDark ? "#991b1b" : "#fecaca"}`,
                  fontSize: 12,
                  color: isDark ? "#fca5a5" : "#b91c1c",
                  marginBottom: 10,
                }}
              >
                {errorMsg}
              </div>
            )}

            {/* FORMS */}
            {mode === "HR" ? (
              // HR FORM
              <form
                className="login-form"
                onSubmit={handleHrSubmit}
                style={{
                  padding: "14px 16px 16px",
                  borderRadius: 18,
                  backgroundColor: colors.background.secondary,
                  border: `1px solid ${colors.border.default}`,
                  boxShadow: colors.card.shadow,
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  transition: "all 0.3s ease",
                }}
              >
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 6 }}
                >
                  <label
                    style={{
                      fontSize: 12,
                      letterSpacing: 1.5,
                      textTransform: "uppercase",
                      color: colors.text.secondary,
                      fontWeight: 600,
                    }}
                  >
                    EMAIL ADDRESS
                  </label>
                  <input
                    type="email"
                    value={hrEmail}
                    onChange={(e) => setHrEmail(e.target.value)}
                    required
                    placeholder="hr@globaldigitalsolutions.com"
                    style={{
                      padding: "10px 13px",
                      borderRadius: 12,
                      border: `1px solid ${colors.border.input}`,
                      backgroundColor: colors.input.background,
                      fontSize: 14,
                      outline: "none",
                      color: colors.input.color,
                      transition: "all 0.2s ease",
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = colors.primary[500];
                      e.currentTarget.style.boxShadow = `0 0 0 3px ${colors.primary[500]}20`;
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = colors.border.input;
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  />
                </div>

                <div
                  style={{ display: "flex", flexDirection: "column", gap: 6 }}
                >
                  <label
                    style={{
                      fontSize: 12,
                      letterSpacing: 1.5,
                      textTransform: "uppercase",
                      color: colors.text.secondary,
                      fontWeight: 600,
                    }}
                  >
                    PASSWORD
                  </label>
                  <input
                    type="password"
                    value={hrPassword}
                    onChange={(e) => setHrPassword(e.target.value)}
                    required
                    placeholder="Enter your password"
                    style={{
                      padding: "10px 13px",
                      borderRadius: 12,
                      border: `1px solid ${colors.border.input}`,
                      backgroundColor: colors.input.background,
                      fontSize: 14,
                      outline: "none",
                      color: colors.input.color,
                      transition: "all 0.2s ease",
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = colors.primary[500];
                      e.currentTarget.style.boxShadow = `0 0 0 3px ${colors.primary[500]}20`;
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = colors.border.input;
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  />
                </div>

                <button
                  type="submit"
                  className="login-submit-button"
                  disabled={loading}
                  style={{
                    marginTop: 8,
                    padding: "11px 16px",
                    borderRadius: 999,
                    border: "none",
                    width: "100%",
                    background: gradient,
                    color: "#ffffff",
                    fontSize: 14,
                    fontWeight: 700,
                    letterSpacing: 1.5,
                    textTransform: "uppercase",
                    cursor: loading ? "default" : "pointer",
                    boxShadow: `0 16px 36px ${colors.primary[500]}55`,
                    opacity: loading ? 0.75 : 1,
                    transition: "all 0.3s ease",
                  }}
                  onMouseEnter={(e) => {
                    if (!loading) {
                      e.currentTarget.style.transform = "translateY(-2px)";
                      e.currentTarget.style.boxShadow = `0 20px 40px ${colors.primary[500]}66`;
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow = `0 16px 36px ${colors.primary[500]}55`;
                  }}
                >
                  {loading ? "SIGNING IN..." : "SIGN IN"}
                </button>
              </form>
            ) : employeeLoginLocked ? (
              // EMPLOYEE LOGIN LOCKED MESSAGE
              <div
                style={{
                  padding: "14px 16px 16px",
                  borderRadius: 18,
                  backgroundColor: isDark ? "#7f1d1d" : "#fef2f2",
                  border: `1px solid ${isDark ? "#991b1b" : "#fecaca"}`,
                  boxShadow: colors.card.shadow,
                  fontSize: 13,
                  color: isDark ? "#fca5a5" : "#991b1b",
                }}
              >
                Employee login is currently locked by administration.
                <br />
                Please contact HR if you believe this is a mistake.
              </div>
            ) : (
              // EMPLOYEE FORM – ONLY EMP CODE
              <form
                onSubmit={handleEmployeeSubmit}
                style={{
                  padding: "14px 16px 16px",
                  borderRadius: 18,
                  backgroundColor: colors.background.secondary,
                  border: `1px solid ${colors.border.default}`,
                  boxShadow: colors.card.shadow,
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  transition: "all 0.3s ease",
                }}
              >
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 6 }}
                >
                  <label
                    style={{
                      fontSize: 12,
                      letterSpacing: 1.5,
                      textTransform: "uppercase",
                      color: colors.text.secondary,
                      fontWeight: 600,
                    }}
                  >
                    Employee Code
                  </label>
                  <input
                    value={empCode}
                    onChange={(e) => setEmpCode(e.target.value)}
                    required
                    placeholder="e.g. 00082"
                    style={{
                      padding: "10px 13px",
                      borderRadius: 12,
                      border: `1px solid ${colors.border.input}`,
                      backgroundColor: colors.input.background,
                      fontSize: 14,
                      outline: "none",
                      color: colors.input.color,
                      transition: "all 0.2s ease",
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = colors.primary[500];
                      e.currentTarget.style.boxShadow = `0 0 0 3px ${colors.primary[500]}20`;
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = colors.border.input;
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    marginTop: 8,
                    padding: "11px 16px",
                    borderRadius: 999,
                    border: "none",
                    width: "100%",
                    background: gradient,
                    color: "#ffffff",
                    fontSize: 14,
                    fontWeight: 700,
                    letterSpacing: 2,
                    textTransform: "uppercase",
                    cursor: loading ? "default" : "pointer",
                    boxShadow: `0 16px 36px ${colors.secondary[500]}50`,
                    opacity: loading ? 0.75 : 1,
                    transition: "all 0.3s ease",
                  }}
                  onMouseEnter={(e) => {
                    if (!loading) {
                      e.currentTarget.style.transform = "translateY(-2px)";
                      e.currentTarget.style.boxShadow = `0 20px 40px ${colors.secondary[500]}66`;
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow = `0 16px 36px ${colors.secondary[500]}50`;
                  }}
                >
                  {loading ? "Checking..." : "Submit"}
                </button>
              </form>
            )}

            <div
              className="login-copyright"
              style={{
                marginTop: 16,
                fontSize: 11,
                color: colors.text.tertiary,
                textAlign: "center",
              }}
            >
              © 2025 Global Digital Solutions Internal Use Only
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div></div>}>
      <LoginInner />
    </Suspense>
  );
}

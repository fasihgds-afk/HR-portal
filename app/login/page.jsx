// app/login/page.jsx
"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn, useSession } from "next-auth/react";

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";

  // 🔒 Lock employee login on UI
  const employeeLoginLocked = true; // change to false if you want to re-enable employee login

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

  useEffect(() => {
    console.log("[LoginPage] rendered, current mode =", mode);
  }, [mode]);

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

      console.log("[HR login result]", result);

      if (!result || result.error) {
        setErrorMsg("Invalid HR email or password.");
        setLoading(false);
        return;
      }

      // Use window.location for a full page reload to ensure session cookie is sent
      // This is more reliable than router.push for initial login
      window.location.href = result.url || "/hr/employees";
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

      console.log("[Employee login result]", result);

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
  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        backgroundImage: "url('/new1.jpeg')",
        backgroundSize: "cover",
        backgroundPosition: "left center",
        backgroundRepeat: "no-repeat",
        backgroundAttachment: "fixed",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, system-ui, "Segoe UI", sans-serif',
      }}
    >
      <div style={{ width: "80%", maxWidth: 850, marginRight: "350px" }}>
        <div
          style={{
            display: "flex",
            borderRadius: 30,
            overflow: "hidden",
            backgroundColor: "#ffffff",
            boxShadow: "0 28px 80px rgba(15,23,42,0.75)",
          }}
        >
          {/* LEFT PANEL */}
          <div
            style={{
              flex: "1 1 50%",
              position: "relative",
              padding: "32px 36px",
              background:
                "linear-gradient(135deg, #0F162A, #0c225cff, #58D34D)",
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
                background:
                  "linear-gradient(135deg, #0F162A, #0c225cff, #58D34D)",
                opacity: 0.9,
                boxShadow: "0 20px 52px rgba(15,23,42,0.7)",
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
                background:
                  "linear-gradient(135deg, #0F162A, #0c225cff, #58D34D)",
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
                background:
                  "linear-gradient(135deg, #0F162A, #0c225cff, #58D34D)",
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
                  border: "2px solid #58D34D",
                  boxShadow: "0 18px 38px rgba(15,23,42,0.85)",
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

            {isAdmin && (
              <button
                type="button"
                onClick={() => router.push("/auth/register")}
                style={{
                  marginTop: 10,
                  padding: "8px 16px",
                  borderRadius: 99,
                  border: "1px solid rgba(191,219,254,0.8)",
                  backgroundColor: "#08142bff",
                  color: "#e5e7eb",
                  fontSize: 12,
                  cursor: "pointer",
                  alignSelf: "flex-start",
                  boxShadow: "0 12px 28px rgba(15,23,42,0.6)",
                  opacity: 0.95,
                }}
              >
                New user? Register here
              </button>
            )}

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
            style={{
              flex: "1 1 50%",
              padding: "30px 36px 28px",
              backgroundColor: "#ffffff",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div style={{ marginBottom: 16 }}>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  background: "linear-gradient(135deg,#ec4899,#8b5cf6)",
                  WebkitBackgroundClip: "text",
                  color: "transparent",
                  marginBottom: 6,
                }}
              ></div>
              <div style={{ fontSize: 14 }}>
                <span
                  style={{
                    fontWeight: 700,
                    color: "#2563eb",
                    marginRight: 4,
                  }}
                >
                  Login
                </span>
                <span style={{ color: "#4b5563" }}>Your Account</span>
              </div>
            </div>

            {/* HR / EMPLOYEE TOGGLE */}
            <div
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
                      ? "2px solid rgba(96,165,250,1)"
                      : "2px solid rgba(199,210,254,0.9)",
                  backgroundColor:
                    mode === "HR"
                      ? "rgba(59,130,246,0.06)"
                      : "transparent",
                  color: "#0F162A",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
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
                      ? "2px solid rgba(96,165,250,1)"
                      : "2px solid rgba(199,210,254,0.9)",
                  backgroundColor:
                    mode === "EMPLOYEE"
                      ? "rgba(59,130,246,0.06)"
                      : "transparent",
                  color: "#0F162A",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: employeeLoginLocked ? "not-allowed" : "pointer",
                  opacity: employeeLoginLocked ? 0.4 : 1,
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
                  backgroundColor: "#fee2e2",
                  border: "1px solid #fecaca",
                  fontSize: 12,
                  color: "#b91c1c",
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
                onSubmit={handleHrSubmit}
                style={{
                  padding: "14px 16px 16px",
                  borderRadius: 18,
                  backgroundColor: "#f9fafb",
                  border: "1px solid rgba(148,163,184,0.6)",
                  boxShadow: "0 16px 36px rgba(148,163,184,0.35)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
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
                      color: "#9ca3af",
                    }}
                  >
                    Email Address
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
                      border: "1px solid #0F162A",
                      backgroundColor: "#eef2ff",
                      fontSize: 14,
                      outline: "none",
                      color: "#111827",
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
                      color: "#9ca3af",
                    }}
                  >
                    Password
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
                      border: "1px solid #0F162A",
                      backgroundColor: "#eef2ff",
                      fontSize: 14,
                      outline: "none",
                      color: "#111827",
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
                    background:
                      "linear-gradient(135deg, #0F162A, #0c225cff, #58D34D)",
                    color: "#ffffff",
                    fontSize: 14,
                    fontWeight: 700,
                    letterSpacing: 2,
                    textTransform: "uppercase",
                    cursor: loading ? "default" : "pointer",
                    boxShadow: "0 16px 36px rgba(79,70,229,0.55)",
                    opacity: loading ? 0.75 : 1,
                  }}
                >
                  {loading ? "Signing in..." : "Submit"}
                </button>
              </form>
            ) : employeeLoginLocked ? (
              // EMPLOYEE LOGIN LOCKED MESSAGE
              <div
                style={{
                  padding: "14px 16px 16px",
                  borderRadius: 18,
                  backgroundColor: "#fef2f2",
                  border: "1px solid #fecaca",
                  boxShadow: "0 16px 36px rgba(248,113,113,0.35)",
                  fontSize: 13,
                  color: "#991b1b",
                }}
              >
                Employee login is currently locked by administration.
                <br />
                Please contact HR if you believe this is a mistake.
              </div>
            ) : (
              // EMPLOYEE FORM – ONLY EMP CODE (not reachable while locked)
              <form
                onSubmit={handleEmployeeSubmit}
                style={{
                  padding: "14px 16px 16px",
                  borderRadius: 18,
                  backgroundColor: "#f9fafb",
                  border: "1px solid rgba(148,163,184,0.6)",
                  boxShadow: "0 16px 36px rgba(148,163,184,0.35)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
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
                      color: "#9ca3af",
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
                      border: "1px solid #0F162A",
                      backgroundColor: "#eef2ff",
                      fontSize: 14,
                      outline: "none",
                      color: "#111827",
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
                    background:
                      "linear-gradient(135deg, #0F162A, #0c225cff, #58D34D)",
                    color: "#ffffffff",
                    fontSize: 14,
                    fontWeight: 700,
                    letterSpacing: 2,
                    textTransform: "uppercase",
                    cursor: loading ? "default" : "pointer",
                    boxShadow: "0 16px 36px rgba(34,197,94,0.5)",
                    opacity: loading ? 0.75 : 1,
                  }}
                >
                  {loading ? "Checking..." : "Submit"}
                </button>
              </form>
            )}

            <div
              style={{
                marginTop: 16,
                fontSize: 11,
                color: "#9ca3af",
                textAlign: "center",
              }}
            >
              © 2025 Global Digital Solutions · Internal Use Only
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

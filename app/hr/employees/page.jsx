// next-app/app/hr/employees/page.jsx
"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

export default function HrDashboardPage() {
  const router = useRouter();
  const { data: session } = useSession(); // logged-in user
  const [tab, setTab] = useState("overview"); // 'overview' | 'employees' | 'attendance'

  // Treat HR as admin (you can later add ADMIN role)
  const isAdmin = session?.user?.role === "HR";

  // ---- EMPLOYEE DATA FOR OVERVIEW STATS ----
  const [employees, setEmployees] = useState([]);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState("");

  useEffect(() => {
    async function loadEmployees() {
      try {
        setStatsLoading(true);
        setStatsError("");

        const res = await fetch("/api/hr/employees");
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || `Request failed (${res.status})`);
        }

        const data = await res.json();
        const list = Array.isArray(data)
          ? data
          : data.employees || data.items || [];

        setEmployees(list);
      } catch (err) {
        console.error("Employee stats load error:", err);
        setStatsError(err.message || "Failed to load employee stats.");
      } finally {
        setStatsLoading(false);
      }
    }

    loadEmployees();
  }, []);

  // 📊 Compute stats from employees
  const stats = useMemo(() => {
    if (!employees.length) {
      return {
        totalEmployees: 0,
        totalDepartments: 0,
        activeEmployees: 0,
        departmentCounts: [],
      };
    }

    let activeCount = 0;
    const deptMap = new Map();

    employees.forEach((emp) => {
      if (
        typeof emp.status === "string" &&
        emp.status.toLowerCase() === "active"
      ) {
        activeCount++;
      }

      const dept = emp.department || "Unassigned";
      deptMap.set(dept, (deptMap.get(dept) || 0) + 1);
    });

    const departmentCounts = Array.from(deptMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    return {
      totalEmployees: employees.length,
      totalDepartments: deptMap.size,
      activeEmployees: activeCount || employees.length, // fallback if no status
      departmentCounts,
    };
  }, [employees]);

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "employees", label: "Employees" },
    { id: "attendance", label: "Attendance" },
  ];

  function openMonthlyAttendance() {
    router.push("/hr/monthly");
  }

  function openDailyAttendance() {
    router.push("/hr"); // your existing daily attendance page
  }

  function openEmployeesManage() {
    router.push("/hr/employees/manage");
  }

  function openShiftManagement() {
    router.push("/hr/shifts");
  }

  function goToUserRegister() {
    router.push("/auth/register");
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        padding: "24px 28px 32px",
        background:
          "radial-gradient(circle at top, #0b2344 0, #061525 40%, #020617 100%)",
        color: "#e5e7eb",
        fontFamily:
          'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      {/* 🔹 TOP GRADIENT HEADER – same style as Monthly page */}
      <div style={{ maxWidth: 1400, margin: "0 auto 20px auto" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 22px",
            borderRadius: 18,
            background:
              "linear-gradient(135deg, #19264aff, #0c225cff, #58D34D)",
            color: "#f9fafb",
            boxShadow: "0 16px 38px rgba(255, 255, 255, 0.09)",
          }}
        >
          {/* Left: logo + title */}
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 100,
                height: 100,
                borderRadius: "999px",
                overflow: "hidden",
                backgroundColor: "rgba(15,23,42,0.4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <img
                src="/gds.png"
                alt="Global Digital Solutions logo"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  display: "block",
                }}
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            </div>
            <div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  letterSpacing: 0.4,
                }}
              >
                Global Digital Solutions
              </div>
              <div
                style={{
                  fontSize: 12.5,
                  opacity: 0.9,
                }}
              >
                HR &amp; Attendance · Employees, Shifts &amp; Reports
              </div>
              {session?.user && (
                <div
                  style={{
                    marginTop: 4,
                    fontSize: 11,
                    color: "#e5e7eb",
                    opacity: 0.95,
                  }}
                >
                  Signed in as{" "}
                  <strong>{session.user.email}</strong> (
                  {session.user.role})
                </div>
              )}
            </div>
          </div>

          {/* Right: quick actions (Employee Manager + Shift Management + Reload) */}
          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
            }}
          >
            <button
              type="button"
              onClick={openEmployeesManage}
              style={{
                padding: "8px 16px",
                borderRadius: 999,
                border: "1px solid rgba(191,219,254,0.9)",
                backgroundColor: "rgba(15,23,42,0.2)",
                color: "#e5f0ff",
                fontWeight: 600,
                fontSize: 12.5,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              👥 Open Employee Manager
            </button>

            <button
              type="button"
              onClick={openShiftManagement}
              style={{
                padding: "8px 16px",
                borderRadius: 999,
                border: "1px solid rgba(251,191,36,0.9)",
                backgroundColor: "rgba(15,23,42,0.2)",
                color: "#fef3c7",
                fontWeight: 600,
                fontSize: 12.5,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              ⏰ Shift Management
            </button>

            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                padding: "9px 20px",
                borderRadius: 999,
                border: "none",
                background:
                  "linear-gradient(135deg, #0F162A, #0c225cff, #58D34D)",
                color: "#ffffffff",
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 8,
                boxShadow: "0 14px 30px rgba(16,185,129,0.5)",
              }}
            >
              <span style={{ fontSize: 16 }}>⟳</span>
              Reload Overview
            </button>
          </div>
        </div>
      </div>

      {/* MAIN CARD */}
      <div
        style={{
          maxWidth: 1400,
          margin: "0 auto",
          borderRadius: 16,
          background: "radial-gradient(circle at top, #020617, #020617)",
          boxShadow: "0 20px 60px rgba(15,23,42,0.9)",
          padding: "16px 20px 20px",
        }}
      >
        {/* TABS */}
        <div
          style={{
            display: "flex",
            gap: 12,
            marginBottom: 10,
            borderBottom: "1px solid rgba(55,65,81,0.8)",
          }}
        >
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              style={{
                padding: "8px 16px",
                borderRadius: 999,
                border: "none",
                cursor: "pointer",
                fontSize: 14,
                fontWeight: 600,
                backgroundColor: tab === t.id ? "#0f172a" : "transparent",
                color: tab === t.id ? "#e5e7eb" : "#9ca3af",
                boxShadow:
                  tab === t.id ? "0 8px 20px rgba(15,23,42,0.85)" : "none",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* TAB CONTENT – your existing content unchanged */}
        {tab === "overview" && (
          <div style={{ padding: "14px 4px 4px" }}>
            <h2 style={{ fontSize: 18, marginBottom: 6 }}>Overview</h2>
            <p
              style={{
                fontSize: 13,
                color: "#9ca3af",
                marginBottom: 14,
              }}
            >
              Live snapshot of your workforce – headcount, departments and quick
              access to employee &amp; attendance tools.
            </p>

            {/* TOP STATS */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 12,
                marginBottom: 16,
              }}
            >
              {/* Total Employees */}
              <div
                style={{
                  borderRadius: 14,
                  padding: "12px 14px",
                  background: "linear-gradient(135deg,#0f172a,#111827)",
                  border: "1px solid rgba(55,65,81,0.9)",
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    textTransform: "uppercase",
                    letterSpacing: 1.4,
                    color: "#9ca3af",
                    marginBottom: 4,
                  }}
                >
                  Total Employees
                </div>
                <div
                  style={{
                    fontSize: 26,
                    fontWeight: 800,
                  }}
                >
                  {statsLoading ? "…" : stats.totalEmployees}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "#9ca3af",
                    marginTop: 2,
                  }}
                >
                  <span style={{ color: "#22c55e" }}>Employee</span> collection.
                </div>
              </div>

              {/* Departments */}
              <div
                style={{
                  borderRadius: 14,
                  padding: "12px 14px",
                  background: "linear-gradient(135deg,#111827,#020617)",
                  border: "1px solid rgba(30,64,175,0.9)",
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    textTransform: "uppercase",
                    letterSpacing: 1.4,
                    color: "#9ca3af",
                    marginBottom: 4,
                  }}
                >
                  Departments
                </div>
                <div
                  style={{
                    fontSize: 26,
                    fontWeight: 800,
                  }}
                >
                  {statsLoading ? "…" : stats.totalDepartments}
                </div>
              </div>

              {/* Active Employees */}
              <div
                style={{
                  borderRadius: 14,
                  padding: "12px 14px",
                  background: "linear-gradient(135deg,#022c22,#065f46)",
                  border: "1px solid rgba(34,197,94,0.9)",
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    textTransform: "uppercase",
                    letterSpacing: 1.4,
                    color: "#bbf7d0",
                    marginBottom: 4,
                  }}
                >
                  Active Employees
                </div>
                <div
                  style={{
                    fontSize: 26,
                    fontWeight: 800,
                  }}
                >
                  {statsLoading ? "…" : stats.activeEmployees}
                </div>
              </div>
            </div>

            {/* Employees by department */}
            <div
              style={{
                borderRadius: 14,
                padding: "12px 14px",
                background: "#020617",
                border: "1px solid rgba(55,65,81,0.9)",
                marginBottom: 18,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8,
                  gap: 8,
                }}
              >
                <div>
                  <h3
                    style={{
                      fontSize: 14,
                      marginBottom: 2,
                    }}
                  >
                    Employees by department
                  </h3>
                  <p
                    style={{
                      fontSize: 12,
                      color: "#9ca3af",
                    }}
                  >
                    Quick headcount overview – where your people actually sit.
                  </p>
                </div>

                {statsError && (
                  <div
                    style={{
                      fontSize: 11,
                      color: "#fecaca",
                      backgroundColor: "rgba(127,29,29,0.3)",
                      padding: "4px 8px",
                      borderRadius: 999,
                      border: "1px solid rgba(248,113,113,0.7)",
                    }}
                  >
                    {statsError}
                  </div>
                )}
              </div>

              {statsLoading ? (
                <div
                  style={{
                    fontSize: 12,
                    color: "#9ca3af",
                  }}
                >
                  Loading department breakdown…
                </div>
              ) : stats.departmentCounts.length === 0 ? (
                <div
                  style={{
                    fontSize: 12,
                    color: "#6b7280",
                  }}
                >
                  No employees found yet. Add some from the Employee Manager.
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 8,
                  }}
                >
                  {stats.departmentCounts.map((dept) => (
                    <div
                      key={dept.name}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 999,
                        border: "1px solid rgba(55,65,81,0.9)",
                        backgroundColor: "rgba(15,23,42,0.9)",
                        fontSize: 11,
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <span>{dept.name}</span>
                      <span
                        style={{
                          padding: "1px 7px",
                          borderRadius: 999,
                          backgroundColor: "#0b1120",
                          color: "#e5e7eb",
                          fontWeight: 600,
                          fontSize: 11,
                        }}
                      >
                        {dept.count}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Existing Employees + Attendance + Shift Management cards */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                gap: 12,
              }}
            >
              {/* EMPLOYEES CARD */}
              <div
                style={{
                  borderRadius: 14,
                  padding: "14px 16px",
                  background: "linear-gradient(135deg,#0f172a,#111827)",
                  border: "1px solid rgba(55,65,81,0.9)",
                }}
              >
                <h3 style={{ fontSize: 14, marginBottom: 6 }}>Employees</h3>
                <p
                  style={{
                    fontSize: 12,
                    color: "#9ca3af",
                    marginBottom: 8,
                  }}
                >
                  Add / edit employees, update salary, shift, department and
                  personal details.
                </p>
                <p
                  style={{
                    fontSize: 11,
                    color: "#9ca3af",
                    marginBottom: 10,
                  }}
                >
                  Current headcount:{" "}
                  <strong>{statsLoading ? "…" : stats.totalEmployees}</strong>{" "}
                  across{" "}
                  <strong>{statsLoading ? "…" : stats.totalDepartments}</strong>{" "}
                  departments.
                </p>

                {isAdmin && (
                  <button
                    type="button"
                    onClick={goToUserRegister}
                    style={{
                      padding: "7px 14px",
                      borderRadius: 999,
                      border: "none",
                      background:
                        "linear-gradient(135deg,#f97316,#fb7185)",
                      color: "#111827",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                      marginRight: 8,
                    }}
                  >
                    + Register New User
                  </button>
                )}

                <button
                  type="button"
                  onClick={openEmployeesManage}
                  style={{
                    padding: "7px 14px",
                    borderRadius: 999,
                    border: "none",
                    background:
                      "linear-gradient(135deg,#22c55e,#2dd4bf)",
                    color: "#022c22",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                    marginTop: isAdmin ? 8 : 0,
                  }}
                >
                  Open Employee Manager
                </button>
              </div>

              {/* SHIFT MANAGEMENT CARD */}
              <div
                style={{
                  borderRadius: 14,
                  padding: "14px 16px",
                  background: "linear-gradient(135deg,#1e1b4b,#312e81)",
                  border: "1px solid rgba(251,191,36,0.9)",
                }}
              >
                <h3 style={{ fontSize: 14, marginBottom: 6 }}>Shift Management</h3>
                <p
                  style={{
                    fontSize: 12,
                    color: "#c7d2fe",
                    marginBottom: 10,
                  }}
                >
                  Create and manage shifts, configure shift times, grace periods, and assign shifts to employees with effective dates.
                </p>
                <button
                  type="button"
                  onClick={openShiftManagement}
                  style={{
                    padding: "7px 14px",
                    borderRadius: 999,
                    border: "none",
                    background:
                      "linear-gradient(135deg,#fbbf24,#f59e0b)",
                    color: "#1e1b4b",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Open Shift Management
                </button>
              </div>

              {/* ATTENDANCE CARD */}
              <div
                style={{
                  borderRadius: 14,
                  padding: "14px 16px",
                  background: "linear-gradient(135deg,#020617,#020617)",
                  border: "1px solid rgba(30,64,175,0.9)",
                }}
              >
                <h3 style={{ fontSize: 14, marginBottom: 6 }}>Attendance</h3>
                <p
                  style={{
                    fontSize: 12,
                    color: "#9ca3af",
                    marginBottom: 10,
                  }}
                >
                  View daily punches and monthly summaries, including late/early
                  flags and reports.
                </p>
                <button
                  type="button"
                  onClick={() => setTab("attendance")}
                  style={{
                    padding: "7px 14px",
                    borderRadius: 999,
                    border: "none",
                    background:
                      "linear-gradient(135deg,#3b82f6,#22c55e)",
                    color: "#0f172a",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Go to Attendance Center
                </button>
              </div>
            </div>
          </div>
        )}

        {tab === "employees" && (
          <div style={{ padding: "14px 4px 4px" }}>
            <h2 style={{ fontSize: 18, marginBottom: 6 }}>Employees</h2>
            <p
              style={{
                fontSize: 13,
                color: "#9ca3af",
                marginBottom: 14,
              }}
            >
              Shortcut to open the full employee management console at{" "}
              <code>/hr/employees/manage</code>.
            </p>

            <div
              style={{
                borderRadius: 16,
                padding: "16px 18px",
                background:
                  "radial-gradient(circle at top, #020617, #020617)",
                border: "1px solid rgba(37,99,235,0.85)",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                Employee Shift Management
              </div>
              <div style={{ fontSize: 12, color: "#9ca3af" }}>
                Same screen as your old <strong>EmployeeShiftPage</strong>: add
                employees, edit details, change shifts and upload profile
                photos.
              </div>

              <div style={{ marginTop: 6, display: "flex", gap: 8 }}>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={goToUserRegister}
                    style={{
                      padding: "8px 16px",
                      borderRadius: 999,
                      border: "none",
                      background:
                        "linear-gradient(135deg,#f97316,#fb7185)",
                      color: "#111827",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    + Register New User
                  </button>
                )}

                <button
                  type="button"
                  onClick={openEmployeesManage}
                  style={{
                    padding: "8px 18px",
                    borderRadius: 999,
                    border: "none",
                    background:
                      "linear-gradient(135deg,#22c55e,#2dd4bf)",
                    color: "#022c22",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Open Employee Manager
                </button>
              </div>
            </div>
          </div>
        )}

        {tab === "attendance" && (
          <div style={{ padding: "14px 4px 4px" }}>
            <h2 style={{ fontSize: 18, marginBottom: 6 }}>
              Attendance Center
            </h2>
            <p
              style={{
                fontSize: 13,
                color: "#9ca3af",
                marginBottom: 14,
              }}
            >
              Choose whether you want to see <strong>daily punches</strong> or{" "}
              <strong>monthly summaries</strong>. These buttons open{" "}
              <code>/hr</code> and <code>/hr/monthly</code>.
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(280px, 1fr))",
                gap: 14,
              }}
            >
              {/* Daily attendance card */}
              <div
                style={{
                  borderRadius: 16,
                  padding: "16px 18px",
                  background:
                    "radial-gradient(circle at top left,#020617,#020617)",
                  border: "1px solid rgba(34,197,94,0.8)",
                  boxShadow: "0 16px 40px rgba(6,95,70,0.7)",
                }}
              >
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    marginBottom: 6,
                  }}
                >
                  Daily Attendance
                </div>
                <p
                  style={{
                    fontSize: 12,
                    color: "#9ca3af",
                    marginBottom: 10,
                  }}
                >
                  View all punches for a single day — in/out times, lates,
                  early-outs and absents for each employee.
                </p>
                <button
                  type="button"
                  onClick={openDailyAttendance}
                  style={{
                    padding: "8px 18px",
                    borderRadius: 999,
                    border: "none",
                    background:
                      "linear-gradient(135deg,#22c55e,#16a34a)",
                    color: "#022c22",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Open Daily Attendance
                </button>
              </div>

              {/* Monthly attendance card */}
              <div
                style={{
                  borderRadius: 16,
                  padding: "16px 18px",
                  background:
                    "radial-gradient(circle at top left,#020617,#020617)",
                  border: "1px solid rgba(59,130,246,0.85)",
                  boxShadow: "0 16px 40px rgba(30,64,175,0.6)",
                }}
              >
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    marginBottom: 6,
                  }}
                >
                  Monthly Attendance
                </div>
                <p
                  style={{
                    fontSize: 12,
                    color: "#9ca3af",
                    marginBottom: 10,
                  }}
                >
                  Open your existing monthly view to see totals for each
                  employee: presents, absents, lates, early-outs and salary
                  deductions.
                </p>
                <button
                  type="button"
                  onClick={openMonthlyAttendance}
                  style={{
                    padding: "8px 18px",
                    borderRadius: 999,
                    border: "none",
                    background:
                      "linear-gradient(135deg,#3b82f6,#22c55e)",
                    color: "#020617",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Open Monthly Attendance
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

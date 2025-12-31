// app/employee/dashboard/page.jsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

// --------- SHARED HELPERS ----------

function formatTimeShort(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

// same style as HR monthly screen (integer → "1", decimal → "1.007")
function formatSalaryDays(value) {
  if (value == null) return "0";
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);
  if (Number.isInteger(num)) return String(num);
  return num.toFixed(3);
}

// CLASSIFY CELL LIKE MONTHLY HR COLORS / STATUSES
function classifyDayForRow(day) {
  const base = {
    bg: "#020617",
    fg: "#e5e7eb",
    badge: undefined,
    tone: "default",
  };
  if (!day) return base;

  const isLeaveType =
    day.status === "Paid Leave" ||
    day.status === "Un Paid Leave" ||
    day.status === "Sick Leave";

  // WFH
  if (day.status === "Work From Home") {
    return { bg: "#0b1120", fg: "#7dd3fc", badge: "WFH", tone: "info" };
  }

  // No punches at all
  if (!day.checkIn && !day.checkOut) {
    if (day.status === "Holiday") {
      return { bg: "#020617", fg: "#9ca3af", badge: "Holiday", tone: "muted" };
    }
    if (isLeaveType) {
      return {
        bg: "#451a03",
        fg: "#fef9c3",
        badge: day.status,
        tone: "leave",
      };
    }
    if (day.status === "Absent") {
      return {
        bg: "#450a0a",
        fg: "#fecaca",
        badge: "Absent",
        tone: "danger",
      };
    }
    if (day.status === "New Induction") {
      return {
        bg: "#0b1120",
        fg: "#e5e7eb",
        badge: "New",
        tone: "info",
      };
    }
    // generic no-punch
    return { bg: "#020617", fg: "#9ca3af", tone: "muted" };
  }

  // Partial punches
  const isPartial =
    (day.checkIn && !day.checkOut) || (!day.checkIn && day.checkOut);
  if (isPartial) {
    return {
      bg: "#450a0a",
      fg: "#fecaca",
      badge: "Partial",
      tone: "danger",
    };
  }

  // Normal punches + late/early handling
  const hasViolation = (day.late || day.earlyLeave) && !day.excused;
  if (hasViolation) {
    return {
      bg: "#450a0a",
      fg: "#fecaca",
      badge: "Late/Early",
      tone: "danger",
    };
  }

  if (day.excused && (day.late || day.earlyLeave)) {
    return {
      bg: "#022c22",
      fg: "#bbf7d0",
      badge: "Excused",
      tone: "excused",
    };
  }

  // On-time
  return { bg: "#022c22", fg: "#bbf7d0", badge: "On time", tone: "ok" };
}

function renderEmployeeAvatar(emp, size = 88) {
  const src = emp?.profileImageUrl || emp?.profileImageBase64 || "";
  const initials =
    (emp?.name || "")
      .split(" ")
      .map((p) => p[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?";

  if (src) {
    return (
      <img
        src={src}
        alt={emp?.name || emp?.empCode || "Employee"}
        style={{
          width: size,
          height: size,
          borderRadius: "999px",
          objectFit: "cover",
          border: "2px solid rgba(148,163,184,0.7)",
          boxShadow: "0 8px 20px rgba(0,0,0,0.6)",
        }}
      />
    );
  }

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "999px",
        background: "linear-gradient(135deg, #2563eb, #38bdf8)",
        color: "#f9fafb",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.35,
        fontWeight: 700,
        boxShadow: "0 8px 20px rgba(0,0,0,0.6)",
      }}
    >
      {initials}
    </div>
  );
}

function SummaryItem({ label, value, color, hint }) {
  return (
    <div
      style={{
        borderRadius: 14,
        padding: "10px 12px",
        backgroundColor: "rgba(15,23,42,0.96)",
        border: "1px solid rgba(55,65,81,0.9)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        gap: 4,
        minHeight: 72,
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: "#9ca3af",
          textTransform: "uppercase",
          letterSpacing: 0.8,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 20,
          fontWeight: 800,
          color: color || "#e5e7eb",
        }}
      >
        {value}
      </div>
      {hint && (
        <div
          style={{
            fontSize: 10,
            color: "#6b7280",
          }}
        >
          {hint}
        </div>
      )}
    </div>
  );
}

// --------------- PAGE -----------------

export default function EmployeeDashboardPage() {
  const router = useRouter();
  const { data: session, status } = useSession();

  const [month, setMonth] = useState(() => {
    const now = new Date();
    return now.toISOString().slice(0, 7); // YYYY-MM
  });

  const [attendanceData, setAttendanceData] = useState(null);
  const [employee, setEmployee] = useState(null);
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  const [loadingEmployee, setLoadingEmployee] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const empCode = session?.user?.empCode;

  // redirect if not employee
  useEffect(() => {
    if (status === "loading") return;
    if (!session || session.user.role !== "EMPLOYEE") {
      router.replace("/login?role=employee");
    }
  }, [session, status, router]);

  // optional profile API
  useEffect(() => {
    if (!empCode) return;

    async function loadEmployeeProfile() {
      try {
        setLoadingEmployee(true);
        const res = await fetch(
          `/api/employee?empCode=${encodeURIComponent(empCode)}`,
          {
            method: "GET",
            cache: "no-store",
          }
        );
        if (!res.ok) return;
        const json = await res.json();
        const item =
          json.employee ||
          json.item ||
          (Array.isArray(json.items) ? json.items[0] : null);
        if (item) setEmployee(item);
      } catch (err) {
        console.error("loadEmployeeProfile", err);
      } finally {
        setLoadingEmployee(false);
      }
    }

    loadEmployeeProfile();
  }, [empCode]);

  // monthly attendance (same API as HR page)
  useEffect(() => {
    if (!empCode) return;

    async function loadMonth() {
      try {
        setLoadingAttendance(true);
        setErrorMsg("");
        const res = await fetch(`/api/hr/monthly-attendance?month=${month}`, {
          method: "GET",
          cache: "no-store",
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || `Request failed (${res.status})`);
        }
        const json = await res.json();
        setAttendanceData(json);
      } catch (err) {
        console.error(err);
        setErrorMsg(err.message || "Failed to load monthly attendance");
      } finally {
        setLoadingAttendance(false);
      }
    }

    loadMonth();
  }, [month, empCode]);

  // record for current empCode from monthly data
  const myRecord = useMemo(() => {
    if (!attendanceData?.employees || !empCode) return null;
    return attendanceData.employees.find(
      (emp) => String(emp.empCode) === String(empCode)
    );
  }, [attendanceData, empCode]);

  // ---- DISPLAY FIELDS: ALWAYS TRUST myRecord FIRST ----
  const displayName =
    myRecord?.name || employee?.name || session?.user?.name || "Employee";

  const displayDept =
    myRecord?.department ||
    employee?.department ||
    session?.user?.department ||
    "Not assigned";

  const displayDesignation =
    myRecord?.designation ||
    employee?.designation ||
    session?.user?.designation ||
    "Not specified";

  const displayShift =
    myRecord?.shift || employee?.shift || session?.user?.shift || "-";

  const avatarSource = {
    name: displayName,
    empCode,
    profileImageUrl:
      myRecord?.profileImageUrl ||
      myRecord?.photoUrl ||
      employee?.profileImageUrl ||
      session?.user?.profileImageUrl,
    profileImageBase64:
      myRecord?.profileImageBase64 ||
      employee?.profileImageBase64 ||
      session?.user?.profileImageBase64,
  };

  // Monthly summary using SAME statuses as monthly route,
  // and trusting the API's isFuture flag
  const monthSummary = useMemo(() => {
    if (!myRecord?.days) return null;
    const summary = {
      present: 0,
      wfh: 0,
      holiday: 0,
      sickLeave: 0,
      paidLeave: 0,
      unpaidLeave: 0,
      absent: 0,
    };

    myRecord.days.forEach((d) => {
      if (d.isFuture) return; // don't count future days
      const st = d.status || "";

      switch (st) {
        case "Present":
          summary.present += 1;
          break;
        case "Work From Home":
          summary.wfh += 1;
          break;
        case "Holiday":
          summary.holiday += 1;
          break;
        case "Sick Leave":
          summary.sickLeave += 1;
          break;
        case "Paid Leave":
          summary.paidLeave += 1;
          break;
        case "Un Paid Leave":
          summary.unpaidLeave += 1;
          break;
        case "Absent":
          summary.absent += 1;
          break;
        default:
          break;
      }
    });

    return summary;
  }, [myRecord]);

  // "Today" = last non-future day from the API (company timezone)
  const todayDayObj = useMemo(() => {
    if (!myRecord?.days) return null;
    const arr = myRecord.days;

    for (let i = arr.length - 1; i >= 0; i -= 1) {
      const d = arr[i];
      if (d.isFuture) continue;
      if (!d.status && !d.checkIn && !d.checkOut) continue;
      return d;
    }
    return null;
  }, [myRecord]);

  const todayDateLabel = todayDayObj?.date
    ? String(todayDayObj.date).slice(0, 10)
    : "-";

  const loading = loadingAttendance || status === "loading";

  // -------------- UI ------------------
  return (
    <div
      className="employee-dashboard-container"
      style={{
        minHeight: "100vh",
        padding: "26px 30px 36px",
        background: "#040d28e5", // dark background
        color: "#0f172a",
        fontFamily:
          'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <style jsx>{`
        @media (max-width: 768px) {
          .employee-dashboard-container {
            padding: 16px !important;
          }
          .employee-header {
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 16px !important;
            padding: 16px !important;
          }
          .employee-header-left {
            width: 100% !important;
          }
          .employee-header-logo {
            width: 60px !important;
            height: 60px !important;
          }
          .employee-header-title {
            font-size: 18px !important;
          }
          .employee-header-subtitle {
            font-size: 11px !important;
          }
          .employee-header-right {
            width: 100% !important;
            flex-direction: column !important;
            gap: 12px !important;
          }
          .employee-header-right > div {
            width: 100% !important;
          }
          .employee-header-right input {
            width: 100% !important;
            min-width: auto !important;
          }
          .employee-header-right button {
            width: 100% !important;
          }
          .employee-main-card {
            padding: 16px !important;
          }
          .employee-top-row {
            grid-template-columns: 1fr !important;
            gap: 12px !important;
          }
          .employee-profile-card {
            flex-direction: column !important;
            align-items: center !important;
            text-align: center !important;
          }
          .employee-profile-avatar {
            margin-bottom: 12px !important;
          }
          .employee-bottom-row {
            grid-template-columns: 1fr !important;
            gap: 12px !important;
          }
          .employee-summary-grid {
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 8px !important;
          }
          .employee-table-wrapper {
            overflow-x: auto !important;
            -webkit-overflow-scrolling: touch !important;
          }
          .employee-table {
            min-width: 500px !important;
            font-size: 11px !important;
          }
          .employee-table th,
          .employee-table td {
            padding: 6px 4px !important;
            font-size: 11px !important;
          }
        }
        @media (max-width: 480px) {
          .employee-dashboard-container {
            padding: 12px !important;
          }
          .employee-header-title {
            font-size: 16px !important;
          }
          .employee-main-card {
            padding: 12px !important;
          }
          .employee-summary-grid {
            grid-template-columns: 1fr !important;
          }
          .employee-table {
            min-width: 450px !important;
            font-size: 10px !important;
          }
          .employee-table th,
          .employee-table td {
            padding: 4px 3px !important;
            font-size: 10px !important;
          }
        }
      `}</style>
      <div style={{ maxWidth: 1280, margin: "0 auto 22px auto" }}>
        {/* HEADER */}
        <div
          className="employee-header"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "18px 24px",
            borderRadius: 20,
            background: "linear-gradient(135deg, #19264a, #0c225c, #58D34D)",
            color: "#f9fafb",
            boxShadow: "0 20px 45px rgba(0,0,0,0.25)",
          }}
        >
          <div className="employee-header-left" style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div
              className="employee-header-logo"
              style={{
                width: 86,
                height: 86,
                borderRadius: "999px",
                overflow: "hidden",
                backgroundColor: "rgba(15,23,42,0.35)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 14px 32px rgba(15,23,42,0.8)",
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
                className="employee-header-title"
                style={{
                  fontSize: 24,
                  fontWeight: 800,
                  letterSpacing: 0.5,
                }}
              >
                Global Digital Solutions Attendance Portal
              </div>
              <div
                className="employee-header-subtitle"
                style={{
                  fontSize: 13,
                  opacity: 0.9,
                }}
              >
                Your profile, shift and monthly attendance overview
              </div>
              <div
                style={{
                  marginTop: 6,
                  fontSize: 11.5,
                  color: "#e5e7eb",
                  opacity: 0.95,
                }}
              >
                {displayName} · Code:{" "}
                <strong style={{ letterSpacing: 0.5 }}>{empCode}</strong>
              </div>
            </div>
          </div>

          <div className="employee-header-right" style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <div>
              <label
                style={{
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: 1.4,
                  color: "#e5f0ff",
                  display: "block",
                  marginBottom: 4,
                }}
              >
                Month
              </label>
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                style={{
                  padding: "7px 12px",
                  borderRadius: 999,
                  border: "1px solid #e5f0ff",
                  backgroundColor: "rgba(15,23,42,0.15)",
                  color: "#f9fafb",
                  fontSize: 12.5,
                  outline: "none",
                  minWidth: 170,
                }}
              />
            </div>
            <button
              type="button"
              onClick={() => router.push("/login?role=employee")}
              style={{
                padding: "9px 22px",
                borderRadius: 999,
                border: "none",
                backgroundColor: "rgba(15,23,42,0.4)",
                color: "#f9fafb",
                fontSize: 12.5,
                fontWeight: 700,
                cursor: "pointer",
                boxShadow: "0 10px 26px rgba(15,23,42,0.9)",
              }}
            >
              Logout
            </button>
          </div>
        </div>
      </div>

      {/* MAIN CARD */}
      <div
        className="employee-main-card"
        style={{
          maxWidth: 1280,
          margin: "0 auto",
          borderRadius: 22,
          background: "#020617",
          boxShadow: "0 24px 70px rgba(15,23,42,0.85)",
          padding: "18px 20px 22px",
          border: "1px solid rgba(15,23,42,0.9)",
        }}
      >
        {errorMsg && (
          <div
            style={{
              marginBottom: 12,
              padding: "9px 11px",
              borderRadius: 12,
              backgroundColor: "rgba(248,113,113,0.12)",
              border: "1px solid rgba(220,38,38,0.7)",
              color: "#fecaca",
              fontSize: 12,
            }}
          >
            {errorMsg}
          </div>
        )}

        {/* TOP ROW */}
        <div
          className="employee-top-row"
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.7fr) minmax(0, 1.5fr)",
            gap: 16,
            marginBottom: 18,
          }}
        >
          {/* PROFILE CARD */}
          <div
            className="employee-profile-card"
            style={{
              borderRadius: 18,
              padding: "14px 16px",
              background: "linear-gradient(135deg, #19264a, #0c225c, #020617)",
              border: "1px solid rgba(148,163,184,0.6)",
              display: "flex",
              gap: 14,
            }}
          >
            <div className="employee-profile-avatar" style={{ flexShrink: 0 }}>
              {renderEmployeeAvatar(avatarSource, 88)}
            </div>
            <div>
              <div
                style={{
                  fontSize: 17,
                  fontWeight: 800,
                  marginBottom: 4,
                  letterSpacing: 0.3,
                  color: "#f9fafb",
                }}
              >
                {displayName}
              </div>
              <div
                style={{
                  fontSize: 12.5,
                  color: "#e5e7eb",
                  marginBottom: 6,
                }}
              >
                Emp Code:{" "}
                <strong style={{ color: "#ffffff" }}>
                  {empCode || "-"}
                </strong>
              </div>
              <div style={{ fontSize: 12.5, color: "#e5e7eb" }}>
                Dept:{" "}
                <strong style={{ color: "#ffffff" }}>{displayDept}</strong>
              </div>
              <div style={{ fontSize: 12.5, color: "#e5e7eb" }}>
                Designation:{" "}
                <strong style={{ color: "#ffffff" }}>
                  {displayDesignation}
                </strong>
              </div>
              <div style={{ fontSize: 12.5, color: "#e5e7eb" }}>
                Shift:{" "}
                <strong style={{ color: "#ffffff" }}>{displayShift}</strong>
              </div>
              {loadingEmployee && (
                <div
                  style={{
                    fontSize: 11,
                    color: "#cbd5f5",
                    marginTop: 6,
                  }}
                >
                  Loading profile…
                </div>
              )}
            </div>
          </div>

          {/* TODAY CARD */}
          <div
            style={{
              borderRadius: 18,
              padding: "14px 16px",
              background: "linear-gradient(135deg, #0c225c, #58D34D, #0f766e)",
              border: "1px solid rgba(34,197,94,0.9)",
            }}
          >
            <div
              style={{
                fontSize: 12,
                textTransform: "uppercase",
                letterSpacing: 1.5,
                color: "#e5fdf4",
                marginBottom: 6,
              }}
            >
              Today&apos;s Attendance
            </div>

            {loading ? (
              <div style={{ fontSize: 12.5, color: "#ecfdf5" }}>
                Loading latest data…
              </div>
            ) : !todayDayObj ? (
              <div style={{ fontSize: 12.5, color: "#ecfdf5" }}>
                No record found for today yet.
              </div>
            ) : (
              <>
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 800,
                    marginBottom: 4,
                    color: "#ffffff",
                  }}
                >
                  {todayDayObj.status || "—"}
                </div>
                <div
                  style={{
                    fontSize: 12.5,
                    color: "#e5fdf4",
                    marginBottom: 4,
                  }}
                >
                  Date: <strong>{todayDateLabel}</strong>
                </div>
                <div
                  style={{
                    fontSize: 12.5,
                    color: "#e5fdf4",
                    marginBottom: 4,
                  }}
                >
                  In:{" "}
                  <strong>
                    {todayDayObj.checkIn
                      ? formatTimeShort(todayDayObj.checkIn)
                      : "-"}
                  </strong>{" "}
                  · Out:{" "}
                  <strong>
                    {todayDayObj.checkOut
                      ? formatTimeShort(todayDayObj.checkOut)
                      : "-"}
                  </strong>
                </div>
                <div style={{ fontSize: 12.5, color: "#e5fdf4" }}>
                  Late: <strong>{todayDayObj.late ? "Yes" : "No"}</strong> ·
                  Early Leave:{" "}
                  <strong>{todayDayObj.earlyLeave ? "Yes" : "No"}</strong> ·
                  Excused:{" "}
                  <strong>{todayDayObj.excused ? "Yes" : "No"}</strong>
                </div>
              </>
            )}
          </div>
        </div>

        {/* BOTTOM ROW */}
        <div
          className="employee-bottom-row"
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.25fr) minmax(0, 2.1fr)",
            gap: 16,
          }}
        >
          {/* SUMMARY */}
          <div
            style={{
              borderRadius: 18,
              padding: "14px 16px",
              background:
                "linear-gradient(135deg, #020617, #19264a, #0c225c)",
              border: "1px solid rgba(55,65,81,0.9)",
            }}
          >
            <div
              style={{
                fontSize: 14.5,
                marginBottom: 8,
                fontWeight: 600,
                color: "#f9fafb",
              }}
            >
              Monthly Summary
            </div>
            {loading ? (
              <div style={{ fontSize: 12.5, color: "#9ca3af" }}>
                Loading monthly attendance…
              </div>
            ) : !myRecord ? (
              <div style={{ fontSize: 12.5, color: "#9ca3af" }}>
                No data found for this month.
              </div>
            ) : (
              <>
                <div
                  className="employee-summary-grid"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3,minmax(0,1fr))",
                    gap: 8,
                    fontSize: 12,
                  }}
                >
                  <SummaryItem
                    label="Present"
                    value={monthSummary?.present ?? 0}
                    color="#22c55e"
                  />
                  <SummaryItem
                    label="WFH"
                    value={monthSummary?.wfh ?? 0}
                    color="#38bdf8"
                  />
                  <SummaryItem
                    label="Holidays"
                    value={monthSummary?.holiday ?? 0}
                    color="#9ca3af"
                  />
                  <SummaryItem
                    label="Sick Leave"
                    value={monthSummary?.sickLeave ?? 0}
                    color="#f97373"
                  />
                  <SummaryItem
                    label="Paid Leave"
                    value={monthSummary?.paidLeave ?? 0}
                    color="#a3e635"
                  />
                  <SummaryItem
                    label="Un Paid Leave"
                    value={monthSummary?.unpaidLeave ?? 0}
                    color="#fb7185"
                  />
                  <SummaryItem
                    label="Absent"
                    value={monthSummary?.absent ?? 0}
                    color="#f97373"
                  />
                  <SummaryItem
                    label="Late arrivals"
                    value={myRecord?.lateCount ?? 0}
                    color="#f97373"
                  />
                  <SummaryItem
                    label="Early leaves"
                    value={myRecord?.earlyCount ?? 0}
                    color="#f97373"
                  />
                  <SummaryItem
                    label="Salary deduct (days)"
                    value={formatSalaryDays(myRecord?.salaryDeductDays ?? 0)}
                    color="#e5e7eb"
                    
                  />
                </div>
                <div
                  style={{
                    marginTop: 10,
                    fontSize: 11,
                    color: "#9ca3af",
                  }}
                >
                  Salary deduction & statuses are calculated using the same
                  rules as the HR monthly screen. Future days are shown as{" "}
                  <span style={{ color: "#fbbf24", fontWeight: 600 }}>
                    &quot;Upcoming&quot;
                  </span>{" "}
                  and are not counted yet.
                </div>
              </>
            )}
          </div>

          {/* DAY-BY-DAY */}
          <div
            style={{
              borderRadius: 18,
              padding: "12px 14px",
              background:
                "linear-gradient(135deg, #020617, #0c225c, #19264a)",
              border: "1px solid rgba(55,65,81,0.9)",
            }}
          >
            <div
              style={{
                fontSize: 14.5,
                marginBottom: 8,
                fontWeight: 600,
                color: "#f9fafb",
              }}
            >
              Day-by-day attendance
            </div>
            <div
              className="employee-table-wrapper"
              style={{
                maxHeight: "440px",
                overflowY: "auto",
                overflowX: "auto",
                borderRadius: 12,
                border: "1px solid rgba(31,41,55,0.95)",
              }}
            >
              <table
                className="employee-table"
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 11.5,
                  minWidth: 500,
                }}
              >
                <thead>
                  <tr style={{ backgroundColor: "#0b1120" }}>
                    <th
                      style={{
                        padding: "7px 8px",
                        textAlign: "left",
                        borderBottom: "1px solid #1f2937",
                        fontWeight: 600,
                        color: "#e5e7eb",
                      }}
                    >
                      Day
                    </th>
                    <th
                      style={{
                        padding: "7px 8px",
                        textAlign: "left",
                        borderBottom: "1px solid #1f2937",
                        fontWeight: 600,
                        color: "#e5e7eb",
                      }}
                    >
                      Status
                    </th>
                    <th
                      style={{
                        padding: "7px 8px",
                        textAlign: "left",
                        borderBottom: "1px solid #1f2937",
                        fontWeight: 600,
                        color: "#e5e7eb",
                      }}
                    >
                      In / Out
                    </th>
                    <th
                      style={{
                        padding: "7px 8px",
                        textAlign: "left",
                        borderBottom: "1px solid #1f2937",
                        fontWeight: 600,
                        color: "#e5e7eb",
                      }}
                    >
                      Flags
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {!myRecord?.days || myRecord.days.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        style={{
                          padding: "9px 10px",
                          textAlign: "center",
                          color: "#6b7280",
                        }}
                      >
                        No attendance records found.
                      </td>
                    </tr>
                  ) : (
                    myRecord.days.map((d, idx) => {
                      const dayNo = idx + 1;
                      const isFuture = !!d.isFuture;
                      const isToday =
                        todayDayObj && d.date === todayDayObj.date;

                      const classInfo = classifyDayForRow(d);

                      let statusLabel = d.status || "—";
                      let inTime = d.checkIn
                        ? formatTimeShort(d.checkIn)
                        : "-";
                      let outTime = d.checkOut
                        ? formatTimeShort(d.checkOut)
                        : "-";
                      let inOutLabel = `${inTime} / ${outTime}`;
                      const isPartial =
                        (d.checkIn && !d.checkOut) ||
                        (!d.checkIn && d.checkOut);

                      // match monthly rules for in/out text
                      if (!d.checkIn && !d.checkOut) {
                        if (d.status === "Holiday") inOutLabel = "- / -";
                        else if (
                          d.status === "Paid Leave" ||
                          d.status === "Un Paid Leave" ||
                          d.status === "Sick Leave"
                        )
                          inOutLabel = d.status;
                        else if (d.status === "Absent")
                          inOutLabel = "No punch";
                        else if (d.status === "Work From Home")
                          inOutLabel = "WFH";
                        else if (d.status === "New Induction")
                          inOutLabel = "New Induction";
                      } else if (d.checkIn && !d.checkOut) {
                        inOutLabel = `${formatTimeShort(
                          d.checkIn
                        )} / Missing Check-Out`;
                      } else if (!d.checkIn && d.checkOut) {
                        inOutLabel = `Missing Check-In / ${formatTimeShort(
                          d.checkOut
                        )}`;
                      }

                      if (isFuture) {
                        statusLabel = "Upcoming";
                        inOutLabel = "- / -";
                      }

                      const flags = [];
                      if (!isFuture) {
                        if (d.late) flags.push("Late");
                        if (d.earlyLeave || isPartial) flags.push("Early");
                        if (d.excused) flags.push("Excused");
                      }

                      return (
                        <tr
                          key={d.date || idx}
                          style={{
                            backgroundColor: isFuture
                              ? "#020617"
                              : classInfo.bg,
                          }}
                        >
                          <td
                            style={{
                              padding: "6px 8px",
                              borderBottom: "1px solid #111827",
                              color: isToday ? "#22c55e" : "#e5e7eb",
                              fontWeight: isToday ? 700 : 500,
                            }}
                          >
                            {dayNo}
                          </td>
                          <td
                            style={{
                              padding: "6px 8px",
                              borderBottom: "1px solid #111827",
                              color: isFuture ? "#fbbf24" : classInfo.fg,
                              fontStyle: isFuture ? "italic" : "normal",
                            }}
                          >
                            {statusLabel}
                          </td>
                          <td
                            style={{
                              padding: "6px 8px",
                              borderBottom: "1px solid #111827",
                              color: "#9ca3af",
                            }}
                          >
                            {inOutLabel}
                          </td>
                          <td
                            style={{
                              padding: "6px 8px",
                              borderBottom: "1px solid #111827",
                              color: isFuture ? "#6b7280" : "#f97373",
                            }}
                          >
                            {flags.length ? flags.join(", ") : "—"}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

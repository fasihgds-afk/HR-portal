// next-app/app/hr/employees/page.jsx
"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useTheme } from "@/lib/theme/ThemeContext";
import ThemeToggle from "@/components/ui/ThemeToggle";
import { useAutoLogout } from "@/hooks/useAutoLogout";
import AutoLogoutWarning from "@/components/ui/AutoLogoutWarning";
import RegisterUserModal from "@/components/users/RegisterUserModal";

export default function HrDashboardPage() {
  const router = useRouter();
  const { data: session } = useSession(); // logged-in user
  const { colors, theme } = useTheme(); // Theme colors and current theme mode
  const [tab, setTab] = useState("overview"); // 'overview' | 'employees' | 'attendance'

  // Treat HR as admin (you can later add ADMIN role)
  const isAdmin = session?.user?.role === "HR";

  // Auto logout after 30 minutes of inactivity (with 5 minute warning)
  const { showWarning, timeRemaining, handleStayLoggedIn, handleLogout: autoLogout } = useAutoLogout({
    inactivityTime: 30 * 60 * 1000, // 30 minutes
    warningTime: 5 * 60 * 1000, // 5 minutes warning
    enabled: true,
    onLogout: () => {
      signOut({ redirect: false, callbackUrl: '/login?role=hr' }).then(() => {
        router.push('/login?role=hr');
      });
    },
  });

  // Manual logout handler
  const handleLogout = async () => {
    try {
      await signOut({ 
        redirect: false,
        callbackUrl: '/login?role=hr'
      });
      router.push('/login?role=hr');
    } catch (error) {
      console.error('Logout error:', error);
      router.push('/login?role=hr');
    }
  };

  // ---- EMPLOYEE DATA FOR OVERVIEW STATS ----
  const [employees, setEmployees] = useState([]);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState("");
  const [showRegisterModal, setShowRegisterModal] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadEmployees() {
      try {
        setStatsLoading(true);
        setStatsError("");

        // Add cache: 'force-cache' for better performance (uses browser cache)
        const res = await fetch("/api/hr/employees", {
          cache: 'force-cache', // Use browser cache if available
        });
        
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || `Request failed (${res.status})`);
        }

        const data = await res.json();
        const list = Array.isArray(data)
          ? data
          : data.employees || data.items || [];

        if (!cancelled) {
          setEmployees(list);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Employee stats load error:", err);
          setStatsError(err.message || "Failed to load employee stats.");
        }
      } finally {
        if (!cancelled) {
          setStatsLoading(false);
        }
      }
    }

    loadEmployees();

    // Cleanup function to prevent state updates if component unmounts
    return () => {
      cancelled = true;
    };
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
    router.push("/hr/attendance/monthly");
  }

  function openDailyAttendance() {
    router.push("/hr/dashboard"); // Daily attendance dashboard
  }

  function openEmployeesManage() {
    router.push("/hr/employees/manage");
  }

  function openShiftManagement() {
    router.push("/hr/shifts");
  }

  function openViolationRules() {
    router.push("/hr/violation-rules");
  }

  function openRegisterModal() {
    setShowRegisterModal(true);
  }

  function closeRegisterModal() {
    setShowRegisterModal(false);
  }

  function handleRegisterSuccess() {
    // Optionally refresh data or show a toast
    // You can add a toast notification here if needed
  }

  return (
    <>
      <style jsx>{`
        @media (max-width: 768px) {
          .header-container {
            flex-direction: column !important;
            gap: 16px !important;
            align-items: flex-start !important;
          }
          .header-logo {
            width: 60px !important;
            height: 60px !important;
          }
          .header-title {
            font-size: 18px !important;
          }
          .header-subtitle {
            font-size: 11px !important;
          }
          .header-buttons {
            flex-direction: column !important;
            width: 100% !important;
            gap: 8px !important;
          }
          .header-buttons button {
            width: 100% !important;
            justify-content: center !important;
          }
          .main-container {
            padding: 16px !important;
          }
          .tabs-container {
            flex-wrap: wrap !important;
            gap: 8px !important;
          }
          .tab-button {
            flex: 1 1 auto !important;
            min-width: 100px !important;
            font-size: 12px !important;
            padding: 8px 12px !important;
          }
          .stats-grid {
            grid-template-columns: 1fr !important;
            gap: 12px !important;
          }
          .card-content {
            padding: 16px !important;
          }
        }
        @media (max-width: 480px) {
          .main-container {
            padding: 12px !important;
          }
          .header-title {
            font-size: 16px !important;
          }
        }
      `}</style>
      <div
        className="main-container"
        style={{
          minHeight: "100vh",
          padding: "24px 28px 32px",
          background: colors.gradient.overlay,
          color: colors.text.primary,
          fontFamily:
            'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}
      >
      {/* 🔹 ENHANCED PROFESSIONAL HEADER */}
      <div style={{ maxWidth: 1400, margin: "0 auto 24px auto" }}>
        <div
          className="header-container"
            style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "20px 28px",
            borderRadius: 20,
            background: colors.gradient.header,
            color: theme === 'dark' ? '#ffffff' : colors.text.primary,
            boxShadow: theme === 'dark' 
              ? "0 20px 50px rgba(19, 168, 229, 0.25), 0 8px 16px rgba(0, 0, 0, 0.3)"
              : "0 20px 50px rgba(59, 130, 246, 0.15), 0 8px 16px rgba(0, 0, 0, 0.1)",
            border: `1px solid ${colors.border.default}`,
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Background Pattern */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundImage: "radial-gradient(circle at 20% 50%, rgba(255,255,255,0.1) 0%, transparent 50%)",
              pointerEvents: "none",
            }}
          />
          {/* Left: logo + title */}
          <div style={{ display: "flex", alignItems: "center", gap: 16, position: "relative", zIndex: 1 }}>
            <div
              className="header-logo"
              style={{
                width: 72,
                height: 72,
                borderRadius: 16,
                overflow: "hidden",
                backgroundColor: "rgba(255, 255, 255, 0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                boxShadow: "0 8px 16px rgba(0, 0, 0, 0.2)",
                border: "2px solid rgba(255, 255, 255, 0.2)",
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
                className="header-title"
                style={{
                  fontSize: 24,
                  fontWeight: 800,
                  letterSpacing: 0.5,
                  marginBottom: 4,
                  textShadow: "0 2px 8px rgba(0, 0, 0, 0.2)",
                }}
              >
                Global Digital Solutions
              </div>
              <div
                className="header-subtitle"
                style={{
                  fontSize: 13,
                  opacity: 0.95,
                  fontWeight: 500,
                  marginBottom: 6,
                }}
              >
                HR &amp; Attendance Management Dashboard
              </div>
              {session?.user && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 12,
                    color: "rgba(255, 255, 255, 0.9)",
                    backgroundColor: "rgba(255, 255, 255, 0.1)",
                    padding: "4px 10px",
                    borderRadius: 12,
                    width: "fit-content",
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                  }}
                >
                  <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ opacity: 0.8 }}>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  <span>{session.user.email}</span>
                  <span style={{ opacity: 0.6 }}>•</span>
                  <span style={{ fontWeight: 600 }}>{session.user.role}</span>
                </div>
              )}
            </div>
          </div>

          {/* Right: quick actions */}
          <div
            className="header-buttons"
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              position: "relative",
              zIndex: 1,
            }}
          >
            <button
              type="button"
              onClick={openEmployeesManage}
              style={{
                padding: "10px 18px",
                borderRadius: 12,
                border: "1px solid rgba(255, 255, 255, 0.25)",
                backgroundColor: "rgba(255, 255, 255, 0.15)",
                color: "#ffffff",
                fontWeight: 600,
                fontSize: 13,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 8,
                backdropFilter: "blur(10px)",
                transition: "all 0.2s",
                boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.25)";
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.boxShadow = "0 6px 16px rgba(0, 0, 0, 0.2)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.15)";
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.15)";
              }}
            >
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              Employees
            </button>

            <button
              type="button"
              onClick={openShiftManagement}
              style={{
                padding: "10px 18px",
                borderRadius: 12,
                border: "1px solid rgba(255, 255, 255, 0.25)",
                backgroundColor: "rgba(255, 255, 255, 0.15)",
                color: "#ffffff",
                fontWeight: 600,
                fontSize: 13,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 8,
                backdropFilter: "blur(10px)",
                transition: "all 0.2s",
                boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.25)";
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.boxShadow = "0 6px 16px rgba(0, 0, 0, 0.2)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.15)";
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.15)";
              }}
            >
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Shifts
            </button>

            <button
              type="button"
              onClick={openViolationRules}
              style={{
                padding: "10px 18px",
                borderRadius: 12,
                border: "1px solid rgba(245, 158, 11, 0.4)",
                backgroundColor: "rgba(245, 158, 11, 0.2)",
                color: "#ffffff",
                fontWeight: 600,
                fontSize: 13,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 8,
                backdropFilter: "blur(10px)",
                transition: "all 0.2s",
                boxShadow: "0 4px 12px rgba(245, 158, 11, 0.3)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "rgba(245, 158, 11, 0.3)";
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.boxShadow = "0 6px 16px rgba(245, 158, 11, 0.4)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "rgba(245, 158, 11, 0.2)";
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "0 4px 12px rgba(245, 158, 11, 0.3)";
              }}
            >
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              Violation Rules
            </button>

            <button
              type="button"
              onClick={() => {
                window.location.reload();
              }}
              style={{
                padding: "10px 20px",
                borderRadius: 12,
                border: "none",
                background: theme === 'dark' 
                  ? `linear-gradient(135deg, ${colors.background.card} 0%, ${colors.background.secondary} 100%)`
                  : "linear-gradient(135deg, #ffffff 0%, #f0f9ff 100%)",
                color: theme === 'dark' ? colors.text.primary : colors.primary[700],
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 8,
                boxShadow: "0 6px 20px rgba(255, 255, 255, 0.3), 0 2px 8px rgba(0, 0, 0, 0.2)",
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-2px) scale(1.02)";
                e.currentTarget.style.boxShadow = "0 8px 24px rgba(255, 255, 255, 0.4), 0 4px 12px rgba(0, 0, 0, 0.25)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0) scale(1)";
                e.currentTarget.style.boxShadow = "0 6px 20px rgba(255, 255, 255, 0.3), 0 2px 8px rgba(0, 0, 0, 0.2)";
              }}
            >
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
            <ThemeToggle />
            <button
              type="button"
              onClick={handleLogout}
              style={{
                padding: "10px 18px",
                borderRadius: 12,
                border: "1px solid rgba(255, 255, 255, 0.3)",
                backgroundColor: "rgba(255, 255, 255, 0.15)",
                color: "#ffffff",
                fontWeight: 600,
                fontSize: 13,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 8,
                backdropFilter: "blur(10px)",
                transition: "all 0.2s",
                boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
                whiteSpace: "nowrap",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.25)";
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.boxShadow = "0 6px 16px rgba(0, 0, 0, 0.2)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.15)";
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.15)";
              }}
            >
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Logout
            </button>
          </div>
        </div>
      </div>

      {/* Auto Logout Warning */}
      {showWarning && (
        <AutoLogoutWarning
          isOpen={showWarning}
          timeRemaining={timeRemaining}
          onStayLoggedIn={handleStayLoggedIn}
          onLogoutNow={autoLogout}
        />
      )}

      {/* Register User Modal */}
      <RegisterUserModal
        isOpen={showRegisterModal}
        onClose={closeRegisterModal}
        onSuccess={handleRegisterSuccess}
      />

      {/* MAIN CARD */}
      <div
          style={{
          maxWidth: 1400,
          margin: "0 auto",
          borderRadius: 16,
          background: colors.background.card,
          boxShadow: theme === 'dark' 
            ? "0 20px 60px rgba(15,23,42,0.9)"
            : "0 20px 60px rgba(0,0,0,0.08)",
          padding: "16px 20px 20px",
          border: `1px solid ${colors.border.default}`,
        }}
      >
        {/* ENHANCED TABS */}
        <div
          className="tabs-container"
          style={{
            display: "flex",
            gap: 8,
            marginBottom: 20,
            paddingBottom: 12,
            borderBottom: `2px solid ${colors.border.default}`,
            position: "relative",
          }}
        >
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              className="tab-button"
              onClick={() => setTab(t.id)}
              style={{
                padding: "12px 24px",
                borderRadius: 12,
                border: "none",
                cursor: "pointer",
                fontSize: 14,
                fontWeight: 600,
                backgroundColor: tab === t.id ? `${colors.primary[500]}20` : "transparent",
                color: tab === t.id ? colors.primary[500] : colors.text.muted,
                position: "relative",
                transition: "all 0.2s",
                borderBottom: tab === t.id ? `2px solid ${colors.primary[500]}` : "2px solid transparent",
                marginBottom: "-14px",
              }}
              onMouseEnter={(e) => {
                if (tab !== t.id) {
                  e.currentTarget.style.backgroundColor = colors.background.hover;
                  e.currentTarget.style.color = colors.text.secondary;
                }
              }}
              onMouseLeave={(e) => {
                if (tab !== t.id) {
                  e.currentTarget.style.backgroundColor = "transparent";
                  e.currentTarget.style.color = colors.text.muted;
                }
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* TAB CONTENT – your existing content unchanged */}
        {tab === "overview" && (
          <div style={{ padding: "14px 4px 4px" }}>
            <h2 style={{ fontSize: 18, marginBottom: 6, color: colors.text.primary }}>Overview</h2>
            <p
              style={{
                fontSize: 13,
                color: colors.text.muted,
                marginBottom: 14,
              }}
            >
              Live snapshot of your workforce – headcount, departments and quick
              access to employee &amp; attendance tools.
            </p>

            {/* ENHANCED STATS CARDS */}
            <div
              className="stats-grid"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: 16,
                marginBottom: 24,
              }}
            >
              {/* Total Employees */}
              <div
                style={{
                  borderRadius: 16,
                  padding: "20px 24px",
                  background: colors.gradient.card,
                  border: `1px solid ${colors.primary[500]}33`,
                  boxShadow: theme === 'dark' 
                    ? "0 8px 24px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05)"
                    : "0 8px 24px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.9)",
                  position: "relative",
                  overflow: "hidden",
                  transition: "all 0.3s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-4px)";
                  e.currentTarget.style.boxShadow = "0 12px 32px rgba(59, 130, 246, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.05)";
                  e.currentTarget.style.borderColor = "rgba(59, 130, 246, 0.4)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "0 8px 24px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05)";
                  e.currentTarget.style.borderColor = "rgba(59, 130, 246, 0.2)";
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                  <div>
                    <div
                      style={{
                        fontSize: 11,
                        textTransform: "uppercase",
                        letterSpacing: 1.5,
                        color: colors.text.tertiary,
                        marginBottom: 8,
                        fontWeight: 600,
                      }}
                    >
                      Total Employees
                    </div>
                    <div
                      style={{
                        fontSize: 36,
                        fontWeight: 800,
                        color: colors.text.primary,
                        lineHeight: 1,
                        marginBottom: 8,
                      }}
                    >
                      {statsLoading ? (
                        <span style={{ fontSize: 24, color: colors.text.muted }}>⋯</span>
                      ) : (
                        stats.totalEmployees
                      )}
                    </div>
                  </div>
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 12,
                      background: "linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(59, 130, 246, 0.1))",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      border: "1px solid rgba(59, 130, 246, 0.3)",
                    }}
                  >
                    <svg width="24" height="24" fill="none" stroke="#3b82f6" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: colors.text.muted,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span style={{ color: colors.success, fontWeight: 600 }}>Active</span>
                  <span>workforce</span>
                </div>
              </div>

              {/* Departments */}
              <div
                style={{
                  borderRadius: 16,
                  padding: "20px 24px",
                  background: theme === 'dark' 
                    ? `linear-gradient(135deg, ${colors.primary[900]} 0%, ${colors.primary[800]} 100%)`
                    : `linear-gradient(135deg, ${colors.primary[100]} 0%, ${colors.primary[200]} 100%)`,
                  border: `1px solid ${colors.primary[500]}33`,
                  boxShadow: theme === 'dark' 
                    ? "0 8px 24px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05)"
                    : "0 8px 24px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.9)",
                  position: "relative",
                  overflow: "hidden",
                  transition: "all 0.3s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-4px)";
                  e.currentTarget.style.boxShadow = "0 12px 32px rgba(99, 102, 241, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.05)";
                  e.currentTarget.style.borderColor = "rgba(99, 102, 241, 0.5)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "0 8px 24px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05)";
                  e.currentTarget.style.borderColor = "rgba(99, 102, 241, 0.3)";
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                  <div>
                    <div
                      style={{
                        fontSize: 11,
                        textTransform: "uppercase",
                        letterSpacing: 1.5,
                        color: theme === 'dark' ? colors.primary[300] : colors.primary[700],
                        marginBottom: 8,
                        fontWeight: 600,
                      }}
                    >
                      Departments
                    </div>
                    <div
                      style={{
                        fontSize: 36,
                        fontWeight: 800,
                        color: colors.text.primary,
                        lineHeight: 1,
                        marginBottom: 8,
                      }}
                    >
                      {statsLoading ? (
                        <span style={{ fontSize: 24, color: "#6366f1" }}>⋯</span>
                      ) : (
                        stats.totalDepartments
                      )}
                    </div>
                  </div>
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 12,
                      background: "linear-gradient(135deg, rgba(99, 102, 241, 0.3), rgba(99, 102, 241, 0.15))",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      border: "1px solid rgba(99, 102, 241, 0.4)",
                    }}
                  >
                    <svg width="24" height="24" fill="none" stroke="#818cf8" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  </div>
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "#a5b4fc",
                  }}
                >
                  Organizational units
                </div>
              </div>

              {/* Active Employees */}
              <div
                style={{
                  borderRadius: 16,
                  padding: "20px 24px",
                  background: theme === 'dark' 
                    ? `linear-gradient(135deg, ${colors.secondary[900]} 0%, ${colors.secondary[800]} 100%)`
                    : `linear-gradient(135deg, ${colors.secondary[100]} 0%, ${colors.secondary[200]} 100%)`,
                  border: `1px solid ${colors.success}33`,
                  boxShadow: theme === 'dark' 
                    ? "0 8px 24px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05)"
                    : "0 8px 24px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.9)",
                  position: "relative",
                  overflow: "hidden",
                  transition: "all 0.3s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-4px)";
                  e.currentTarget.style.boxShadow = "0 12px 32px rgba(34, 197, 94, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.05)";
                  e.currentTarget.style.borderColor = "rgba(34, 197, 94, 0.5)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "0 8px 24px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05)";
                  e.currentTarget.style.borderColor = "rgba(34, 197, 94, 0.3)";
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                  <div>
                    <div
                      style={{
                        fontSize: 11,
                        textTransform: "uppercase",
                        letterSpacing: 1.5,
                        color: theme === 'dark' ? colors.secondary[300] : colors.secondary[700],
                        marginBottom: 8,
                        fontWeight: 600,
                      }}
                    >
                      Active Employees
                    </div>
                    <div
                      style={{
                        fontSize: 36,
                        fontWeight: 800,
                        color: colors.text.primary,
                        lineHeight: 1,
                        marginBottom: 8,
                      }}
                    >
                      {statsLoading ? (
                        <span style={{ fontSize: 24, color: "#22c55e" }}>⋯</span>
                      ) : (
                        stats.activeEmployees
                      )}
                    </div>
                  </div>
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 12,
                      background: "linear-gradient(135deg, rgba(34, 197, 94, 0.3), rgba(34, 197, 94, 0.15))",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      border: "1px solid rgba(34, 197, 94, 0.4)",
                    }}
                  >
                    <svg width="24" height="24" fill="none" stroke="#4ade80" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "#86efac",
                  }}
                >
                  Currently working
                </div>
              </div>
            </div>

            {/* ENHANCED Employees by department */}
            <div
              style={{
                borderRadius: 16,
                padding: "24px",
                background: colors.gradient.card,
                border: `1px solid ${colors.border.default}`,
                marginBottom: 24,
                boxShadow: theme === 'dark' 
                  ? "0 8px 24px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05)"
                  : "0 8px 24px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.9)",
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
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 10,
                        background: "linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(59, 130, 246, 0.1))",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        border: "1px solid rgba(59, 130, 246, 0.3)",
                      }}
                    >
                      <svg width="20" height="20" fill="none" stroke="#3b82f6" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                    </div>
                    <div>
                      <h3
                        style={{
                          fontSize: 16,
                          fontWeight: 700,
                          marginBottom: 4,
                          color: colors.text.primary,
                        }}
                      >
                        Employees by Department
                      </h3>
                      <p
                        style={{
                          fontSize: 13,
                          color: colors.text.muted,
                        }}
                      >
                        Organizational distribution across departments
                      </p>
                    </div>
                  </div>
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
                    color: colors.text.muted,
                  }}
                >
                  Loading department breakdown…
                </div>
              ) : stats.departmentCounts.length === 0 ? (
                <div
                  style={{
                    fontSize: 12,
                    color: colors.text.muted,
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
                  {stats.departmentCounts.map((dept, idx) => {
                    const colors = [
                      { bg: "rgba(59, 130, 246, 0.15)", border: "rgba(59, 130, 246, 0.3)", text: "#3b82f6", badge: "rgba(59, 130, 246, 0.2)" },
                      { bg: "rgba(34, 197, 94, 0.15)", border: "rgba(34, 197, 94, 0.3)", text: "#22c55e", badge: "rgba(34, 197, 94, 0.2)" },
                      { bg: "rgba(251, 191, 36, 0.15)", border: "rgba(251, 191, 36, 0.3)", text: "#fbbf24", badge: "rgba(251, 191, 36, 0.2)" },
                      { bg: "rgba(239, 68, 68, 0.15)", border: "rgba(239, 68, 68, 0.3)", text: "#ef4444", badge: "rgba(239, 68, 68, 0.2)" },
                      { bg: "rgba(168, 85, 247, 0.15)", border: "rgba(168, 85, 247, 0.3)", text: "#a855f7", badge: "rgba(168, 85, 247, 0.2)" },
                    ];
                    const color = colors[idx % colors.length];
                    return (
                      <div
                        key={dept.name}
                        style={{
                          padding: "10px 16px",
                          borderRadius: 12,
                          border: `1px solid ${color.border}`,
                          backgroundColor: color.bg,
                          fontSize: 13,
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          fontWeight: 500,
                          color: "#e2e8f0",
                          transition: "all 0.2s",
                          cursor: "default",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = "translateY(-2px)";
                          e.currentTarget.style.boxShadow = `0 4px 12px ${color.badge}`;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = "translateY(0)";
                          e.currentTarget.style.boxShadow = "none";
                        }}
                      >
                        <span style={{ color: color.text, fontWeight: 600 }}>{dept.name}</span>
                        <span
                          style={{
                            padding: "4px 10px",
                            borderRadius: 8,
                            backgroundColor: color.badge,
                            color: color.text,
                            fontWeight: 700,
                            fontSize: 12,
                            border: `1px solid ${color.border}`,
                          }}
                        >
                          {dept.count}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ENHANCED ACTION CARDS */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: 20,
              }}
            >
              {/* EMPLOYEES CARD */}
              <div
                style={{
                  borderRadius: 16,
                  padding: "24px",
                  background: colors.gradient.card,
                  border: `1px solid ${colors.border.default}`,
                  boxShadow: theme === 'dark' 
                    ? "0 8px 24px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05)"
                    : "0 8px 24px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.9)",
                  transition: "all 0.3s",
                  position: "relative",
                  overflow: "hidden",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-4px)";
                  e.currentTarget.style.boxShadow = "0 12px 32px rgba(59, 130, 246, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.05)";
                  e.currentTarget.style.borderColor = "rgba(59, 130, 246, 0.4)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "0 8px 24px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05)";
                  e.currentTarget.style.borderColor = "rgba(59, 130, 246, 0.2)";
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 12,
                      background: "linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(59, 130, 246, 0.1))",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      border: "1px solid rgba(59, 130, 246, 0.3)",
                    }}
                  >
                    <svg width="24" height="24" fill="none" stroke="#3b82f6" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4, color: colors.text.primary }}>Employees</h3>
                    <p
                      style={{
                        fontSize: 11,
                        color: colors.text.muted,
                        margin: 0,
                      }}
                    >
                      Manage workforce
                    </p>
                  </div>
                </div>
                <p
                  style={{
                    fontSize: 13,
                    color: colors.text.muted,
                    marginBottom: 16,
                    lineHeight: 1.6,
                  }}
                >
                  Add, edit, and manage employee profiles. Update salaries, shifts, departments, and personal information.
                </p>
                <div
                  style={{
                    padding: "12px",
                    borderRadius: 10,
                    backgroundColor: "rgba(59, 130, 246, 0.1)",
                    border: "1px solid rgba(59, 130, 246, 0.2)",
                    marginBottom: 16,
                  }}
                >
                  <div style={{ fontSize: 12, color: colors.text.muted, marginBottom: 4 }}>
                    Current Status
                  </div>
                  <div style={{ fontSize: 14, color: colors.text.primary, fontWeight: 600 }}>
                    {statsLoading ? "⋯" : `${stats.totalEmployees} employees`} across{" "}
                    {statsLoading ? "⋯" : `${stats.totalDepartments} departments`}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={openRegisterModal}
                      style={{
                        padding: "10px 18px",
                        borderRadius: 10,
                        border: "1px solid rgba(251, 146, 60, 0.3)",
                        background: "linear-gradient(135deg, rgba(249, 115, 22, 0.2), rgba(251, 146, 60, 0.1))",
                        color: "#fb923c",
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: "pointer",
                        transition: "all 0.2s",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = "rgba(249, 115, 22, 0.3)";
                        e.currentTarget.style.transform = "translateY(-2px)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "rgba(249, 115, 22, 0.2)";
                        e.currentTarget.style.transform = "translateY(0)";
                      }}
                    >
                      <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Register User
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={openEmployeesManage}
                    style={{
                      padding: "10px 20px",
                      borderRadius: 10,
                      border: "none",
                      background: "linear-gradient(135deg, #3b82f6, #2563eb)",
                      color: "#ffffff",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                      transition: "all 0.2s",
                      boxShadow: "0 4px 12px rgba(59, 130, 246, 0.3)",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      flex: 1,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = "translateY(-2px)";
                      e.currentTarget.style.boxShadow = "0 6px 16px rgba(59, 130, 246, 0.4)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = "translateY(0)";
                      e.currentTarget.style.boxShadow = "0 4px 12px rgba(59, 130, 246, 0.3)";
                    }}
                  >
                    <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    Open Manager
                  </button>
                </div>
              </div>

              {/* SHIFT MANAGEMENT CARD */}
              <div
                style={{
                  borderRadius: 16,
                  padding: "24px",
                  background: colors.gradient.card,
                  border: `1px solid ${colors.warning}33`,
                  boxShadow: theme === 'dark' 
                    ? "0 8px 24px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05)"
                    : "0 8px 24px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.9)",
                  transition: "all 0.3s",
                  position: "relative",
                  overflow: "hidden",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-4px)";
                  e.currentTarget.style.boxShadow = "0 12px 32px rgba(251, 191, 36, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.05)";
                  e.currentTarget.style.borderColor = "rgba(251, 191, 36, 0.5)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "0 8px 24px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05)";
                  e.currentTarget.style.borderColor = "rgba(251, 191, 36, 0.3)";
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 12,
                      background: "linear-gradient(135deg, rgba(251, 191, 36, 0.2), rgba(251, 191, 36, 0.1))",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      border: "1px solid rgba(251, 191, 36, 0.3)",
                    }}
                  >
                    <svg width="24" height="24" fill="none" stroke="#fbbf24" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4, color: colors.text.primary }}>Shift Management</h3>
                    <p
                      style={{
                        fontSize: 11,
                        color: colors.text.muted,
                        margin: 0,
                      }}
                    >
                      Configure work schedules
                    </p>
                  </div>
                </div>
                <p
                  style={{
                    fontSize: 13,
                    color: colors.text.muted,
                    marginBottom: 16,
                    lineHeight: 1.6,
                  }}
                >
                  Create and manage shifts, configure shift times, grace periods, and assign shifts to employees with effective dates.
                </p>
                <button
                  type="button"
                  onClick={openShiftManagement}
                  style={{
                    padding: "10px 20px",
                    borderRadius: 10,
                    border: "none",
                    background: "linear-gradient(135deg, #fbbf24, #f59e0b)",
                    color: theme === 'dark' ? colors.text.primary : colors.warning[900] || '#78350f',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all 0.2s",
                    boxShadow: "0 4px 12px rgba(251, 191, 36, 0.3)",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    width: "100%",
                    justifyContent: "center",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "translateY(-2px)";
                    e.currentTarget.style.boxShadow = "0 6px 16px rgba(251, 191, 36, 0.4)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow = "0 4px 12px rgba(251, 191, 36, 0.3)";
                  }}
                >
                  <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  Open Shift Management
                </button>
              </div>

              {/* ATTENDANCE CARD */}
              <div
                style={{
                  borderRadius: 16,
                  padding: "24px",
                  background: colors.gradient.card,
                  border: `1px solid ${colors.success}33`,
                  boxShadow: theme === 'dark' 
                    ? "0 8px 24px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05)"
                    : "0 8px 24px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.9)",
                  transition: "all 0.3s",
                  position: "relative",
                  overflow: "hidden",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-4px)";
                  e.currentTarget.style.boxShadow = "0 12px 32px rgba(34, 197, 94, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.05)";
                  e.currentTarget.style.borderColor = "rgba(34, 197, 94, 0.4)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "0 8px 24px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05)";
                  e.currentTarget.style.borderColor = "rgba(34, 197, 94, 0.2)";
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 12,
                      background: "linear-gradient(135deg, rgba(34, 197, 94, 0.2), rgba(34, 197, 94, 0.1))",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      border: "1px solid rgba(34, 197, 94, 0.3)",
                    }}
                  >
                    <svg width="24" height="24" fill="none" stroke="#22c55e" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                    </svg>
                  </div>
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4, color: colors.text.primary }}>Attendance</h3>
                    <p
                      style={{
                        fontSize: 11,
                        color: colors.text.muted,
                        margin: 0,
                      }}
                    >
                      Track &amp; monitor
                    </p>
                  </div>
                </div>
                <p
                  style={{
                    fontSize: 13,
                    color: colors.text.muted,
                    marginBottom: 16,
                    lineHeight: 1.6,
                  }}
                >
                  View daily punches and monthly summaries, including late/early flags and comprehensive reports.
                </p>
                <button
                  type="button"
                  onClick={() => setTab("attendance")}
                  style={{
                    padding: "10px 20px",
                    borderRadius: 10,
                    border: "none",
                    background: "linear-gradient(135deg, #22c55e, #16a34a)",
                    color: "#022c22",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all 0.2s",
                    boxShadow: "0 4px 12px rgba(34, 197, 94, 0.3)",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    width: "100%",
                    justifyContent: "center",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "translateY(-2px)";
                    e.currentTarget.style.boxShadow = "0 6px 16px rgba(34, 197, 94, 0.4)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow = "0 4px 12px rgba(34, 197, 94, 0.3)";
                  }}
                >
                  <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
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
                    onClick={openRegisterModal}
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
              <code>/hr/dashboard</code> and <code>/hr/attendance/monthly</code>.
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
                    color: colors.text.muted,
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
                    color: colors.text.muted,
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
    </>
  );
}

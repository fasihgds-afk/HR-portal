'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { useTheme } from '@/lib/theme/ThemeContext';
import ThemeToggle from '@/components/ui/ThemeToggle';
import { useAutoLogout } from '@/hooks/useAutoLogout';
import AutoLogoutWarning from '@/components/ui/AutoLogoutWarning';

export default function ViolationRulesPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const { colors, theme } = useTheme();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState({ type: '', text: '' });

  // Form state
  const [formData, setFormData] = useState({
    violationConfig: {
      freeViolations: 2,
      milestoneInterval: 3,
      perMinuteRate: 0.007,
      maxPerMinuteFine: 1.0,
    },
    absentConfig: {
      bothMissingDays: 1.0,
      partialPunchDays: 1.0,
      leaveWithoutInformDays: 1.5,
    },
    leaveConfig: {
      unpaidLeaveDays: 1.0,
      sickLeaveDays: 1.0,
      halfDayDays: 0.5,
      paidLeaveDays: 0.0,
    },
    salaryConfig: {
      daysPerMonth: 30,
    },
    description: '',
  });

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

  function showToast(type, text) {
    setToast({ type, text });
    setTimeout(() => {
      setToast((prev) => (prev.text === text ? { type: '', text: '' } : prev));
    }, 3000);
  }

  // Load existing rules
  async function loadRules() {
    try {
      setLoading(true);
      const res = await fetch('/api/hr/violation-rules');
      if (!res.ok) throw new Error('Failed to load violation rules');
      const data = await res.json();
      
      if (data.rules) {
        setFormData({
          violationConfig: data.rules.violationConfig || formData.violationConfig,
          absentConfig: data.rules.absentConfig || formData.absentConfig,
          leaveConfig: data.rules.leaveConfig || formData.leaveConfig,
          salaryConfig: data.rules.salaryConfig || formData.salaryConfig,
          description: data.rules.description || '',
        });
      }
    } catch (err) {
      console.error(err);
      showToast('error', err.message || 'Failed to load violation rules');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRules();
  }, []);

  // Handle form submission
  async function handleSubmit(e) {
    e.preventDefault();
    try {
      setSaving(true);
      
      const res = await fetch('/api/hr/violation-rules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          updatedBy: session?.user?.email || 'HR',
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to save violation rules');
      }

      showToast('success', 'Violation rules updated successfully');
    } catch (err) {
      console.error('Save error:', err);
      showToast('error', err.message || 'Failed to save violation rules');
    } finally {
      setSaving(false);
    }
  }

  // Helper to update nested form data
  function updateNestedField(section, field, value) {
    setFormData((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value,
      },
    }));
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        padding: '24px 28px 32px',
        background: colors.gradient.overlay,
        color: colors.text.primary,
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <style
        dangerouslySetInnerHTML={{
          __html: `
          @media (max-width: 768px) {
            .rules-header {
              flex-direction: column !important;
              align-items: flex-start !important;
            }
            .rules-form-section {
              padding: 16px !important;
            }
            .rules-form-grid {
              grid-template-columns: 1fr !important;
            }
          }
          
          /* Laptop & Desktop Responsive Styles */
          @media (min-width: 1024px) and (max-width: 1366px) {
            .rules-header {
              padding: 16px 22px !important;
            }
            .rules-form-section {
              padding: 18px 22px !important;
            }
            .rules-form-grid {
              gap: 12px !important;
            }
          }
          
          @media (min-width: 1367px) and (max-width: 1440px) {
            .rules-form-section {
              padding: 20px 24px !important;
            }
          }
          
          @media (min-width: 1441px) {
            .rules-form-section {
              padding: 24px 28px !important;
            }
          }
        `,
        }}
      />

      {/* Header */}
      <div className="container-responsive" style={{ margin: '0 auto 24px auto', width: '100%' }}>
        <div
          className="rules-header"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '20px 28px',
            borderRadius: 20,
            background: colors.gradient.header,
            color: theme === 'dark' ? '#ffffff' : colors.text.primary,
            boxShadow: theme === 'dark' 
              ? "0 20px 50px rgba(19, 168, 229, 0.25), 0 8px 16px rgba(0, 0, 0, 0.3)"
              : "0 20px 50px rgba(59, 130, 246, 0.15), 0 8px 16px rgba(0, 0, 0, 0.1)",
            border: `1px solid ${colors.border.default}`,
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: 16,
                overflow: 'hidden',
                backgroundColor: theme === 'dark' ? 'rgba(255, 255, 255, 0.15)' : 'rgba(59, 130, 246, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                boxShadow: '0 8px 16px rgba(0, 0, 0, 0.2)',
                border: `2px solid ${theme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : colors.border.default}`,
              }}
            >
              <img
                src="/gds.png"
                alt="Global Digital Solutions logo"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: 'block',
                }}
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            </div>
            <div>
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 800,
                  letterSpacing: 0.5,
                  marginBottom: 4,
                  textShadow: theme === 'dark' ? '0 2px 8px rgba(0, 0, 0, 0.2)' : 'none',
                }}
              >
                Global Digital Solutions
              </div>
              <div
                style={{
                  fontSize: 13,
                  opacity: 0.95,
                  fontWeight: 500,
                }}
              >
                Violation Rules & Salary Deduction Management
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <ThemeToggle />
            <button
              type="button"
              onClick={handleLogout}
              style={{
                padding: "10px 18px",
                borderRadius: 12,
                border: `1px solid ${theme === 'dark' ? 'rgba(255, 255, 255, 0.3)' : colors.border.default}`,
                backgroundColor: theme === 'dark' ? 'rgba(255, 255, 255, 0.15)' : colors.background.card,
                color: theme === 'dark' ? '#ffffff' : colors.text.primary,
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                backdropFilter: 'blur(10px)',
                transition: 'all 0.2s',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = theme === 'dark' ? 'rgba(255, 255, 255, 0.25)' : colors.background.hover;
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = theme === 'dark' ? 'rgba(255, 255, 255, 0.15)' : colors.background.card;
                e.currentTarget.style.transform = 'translateY(0)';
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

      {/* Main Form Card */}
      <div
        style={{
          maxWidth: 1400,
          margin: '0 auto',
          borderRadius: 16,
          background: colors.background.card,
          boxShadow: theme === 'dark' 
            ? '0 20px 60px rgba(15,23,42,0.9)'
            : '0 20px 60px rgba(0,0,0,0.08)',
          padding: '24px 28px 28px',
          border: `1px solid ${colors.border.default}`,
        }}
      >
        {toast.text && (
          <div
            style={{
              padding: 12,
              borderRadius: 8,
              marginBottom: 20,
              backgroundColor: toast.type === 'success' 
                ? (theme === 'dark' ? 'rgba(34, 197, 94, 0.2)' : `${colors.success}20`)
                : (theme === 'dark' ? 'rgba(239, 68, 68, 0.2)' : `${colors.error}20`),
              color: toast.type === 'success' ? colors.success : colors.error,
              fontSize: 14,
              border: `1px solid ${toast.type === 'success' ? colors.success : colors.error}40`,
            }}
          >
            {toast.text}
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: colors.text.muted }}>
            Loading violation rules...
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {/* Violation Configuration Section */}
            <div
              className="rules-form-section"
              style={{
                marginBottom: 24,
                padding: '20px 24px',
                borderRadius: 12,
                backgroundColor: colors.background.secondary,
                border: `1px solid ${colors.border.default}`,
              }}
            >
              <h3
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  marginBottom: 16,
                  color: colors.text.primary,
                  borderBottom: `2px solid ${colors.primary[500]}`,
                  paddingBottom: 8,
                }}
              >
                Violation Deduction Rules
              </h3>
              <p style={{ fontSize: 12, color: colors.text.secondary, marginBottom: 16 }}>
                Configure how late/early violations are calculated and deducted from salary.
              </p>
              <div
                className="rules-form-grid"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                  gap: 16,
                }}
              >
                <div>
                  <label
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: colors.text.secondary,
                      marginBottom: 6,
                      display: 'block',
                    }}
                  >
                    Free Violations
                  </label>
                  <input
                    type="number"
                    value={formData.violationConfig.freeViolations}
                    onChange={(e) => updateNestedField('violationConfig', 'freeViolations', Number(e.target.value))}
                    min="0"
                    style={{
                      padding: '10px 14px',
                      borderRadius: 8,
                      border: `1px solid ${colors.border.input}`,
                      fontSize: 14,
                      width: '100%',
                      outline: 'none',
                      backgroundColor: colors.background.input,
                      color: colors.text.primary,
                    }}
                  />
                  <p style={{ fontSize: 11, color: colors.text.tertiary, marginTop: 4 }}>
                    First N violations are free (no deduction)
                  </p>
                </div>
                <div>
                  <label
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: colors.text.secondary,
                      marginBottom: 6,
                      display: 'block',
                    }}
                  >
                    Milestone Interval
                  </label>
                  <input
                    type="number"
                    value={formData.violationConfig.milestoneInterval}
                    onChange={(e) => updateNestedField('violationConfig', 'milestoneInterval', Number(e.target.value))}
                    min="1"
                    style={{
                      padding: '10px 14px',
                      borderRadius: 8,
                      border: `1px solid ${colors.border.input}`,
                      fontSize: 14,
                      width: '100%',
                      outline: 'none',
                      backgroundColor: colors.background.input,
                      color: colors.text.primary,
                    }}
                  />
                  <p style={{ fontSize: 11, color: colors.text.tertiary, marginTop: 4 }}>
                    Every Nth violation = 1 full day deduction
                  </p>
                </div>
                <div>
                  <label
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: colors.text.secondary,
                      marginBottom: 6,
                      display: 'block',
                    }}
                  >
                    Per-Minute Rate
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    value={formData.violationConfig.perMinuteRate}
                    onChange={(e) => updateNestedField('violationConfig', 'perMinuteRate', Number(e.target.value))}
                    min="0"
                    style={{
                      padding: '10px 14px',
                      borderRadius: 8,
                      border: `1px solid ${colors.border.input}`,
                      fontSize: 14,
                      width: '100%',
                      outline: 'none',
                      backgroundColor: colors.background.input,
                      color: colors.text.primary,
                    }}
                  />
                  <p style={{ fontSize: 11, color: colors.text.tertiary, marginTop: 4 }}>
                    Days deducted per minute of violation
                  </p>
                </div>
                <div>
                  <label
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: colors.text.secondary,
                      marginBottom: 6,
                      display: 'block',
                    }}
                  >
                    Max Per-Minute Fine
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.violationConfig.maxPerMinuteFine}
                    onChange={(e) => updateNestedField('violationConfig', 'maxPerMinuteFine', Number(e.target.value))}
                    min="0"
                    style={{
                      padding: '10px 14px',
                      borderRadius: 8,
                      border: `1px solid ${colors.border.input}`,
                      fontSize: 14,
                      width: '100%',
                      outline: 'none',
                      backgroundColor: colors.background.input,
                      color: colors.text.primary,
                    }}
                  />
                  <p style={{ fontSize: 11, color: colors.text.tertiary, marginTop: 4 }}>
                    Maximum days deducted per violation
                  </p>
                </div>
              </div>
            </div>

            {/* Absent/Missing Punch Configuration */}
            <div
              className="rules-form-section"
              style={{
                marginBottom: 24,
                padding: '20px 24px',
                borderRadius: 12,
                backgroundColor: colors.background.secondary,
                border: `1px solid ${colors.border.default}`,
              }}
            >
              <h3
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  marginBottom: 16,
                  color: colors.text.primary,
                  borderBottom: `2px solid ${colors.primary[500]}`,
                  paddingBottom: 8,
                }}
              >
                Absent & Missing Punch Deduction Rules
              </h3>
              <p style={{ fontSize: 12, color: colors.text.secondary, marginBottom: 16 }}>
                Configure deductions for absent days and missing punches.
              </p>
              <div
                className="rules-form-grid"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                  gap: 16,
                }}
              >
                <div>
                  <label
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: colors.text.secondary,
                      marginBottom: 6,
                      display: 'block',
                    }}
                  >
                    Both Punches Missing (Days)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.absentConfig.bothMissingDays}
                    onChange={(e) => updateNestedField('absentConfig', 'bothMissingDays', Number(e.target.value))}
                    min="0"
                    style={{
                      padding: '10px 14px',
                      borderRadius: 8,
                      border: `1px solid ${colors.border.input}`,
                      fontSize: 14,
                      width: '100%',
                      outline: 'none',
                      backgroundColor: colors.background.input,
                      color: colors.text.primary,
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: colors.text.secondary,
                      marginBottom: 6,
                      display: 'block',
                    }}
                  >
                    Partial Punch Missing (Days)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.absentConfig.partialPunchDays}
                    onChange={(e) => updateNestedField('absentConfig', 'partialPunchDays', Number(e.target.value))}
                    min="0"
                    style={{
                      padding: '10px 14px',
                      borderRadius: 8,
                      border: `1px solid ${colors.border.input}`,
                      fontSize: 14,
                      width: '100%',
                      outline: 'none',
                      backgroundColor: colors.background.input,
                      color: colors.text.primary,
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: colors.text.secondary,
                      marginBottom: 6,
                      display: 'block',
                    }}
                  >
                    Leave Without Inform (Days)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.absentConfig.leaveWithoutInformDays}
                    onChange={(e) => updateNestedField('absentConfig', 'leaveWithoutInformDays', Number(e.target.value))}
                    min="0"
                    style={{
                      padding: '10px 14px',
                      borderRadius: 8,
                      border: `1px solid ${colors.border.input}`,
                      fontSize: 14,
                      width: '100%',
                      outline: 'none',
                      backgroundColor: colors.background.input,
                      color: colors.text.primary,
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Leave Configuration */}
            <div
              className="rules-form-section"
              style={{
                marginBottom: 24,
                padding: '20px 24px',
                borderRadius: 12,
                backgroundColor: colors.background.secondary,
                border: `1px solid ${colors.border.default}`,
              }}
            >
              <h3
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  marginBottom: 16,
                  color: colors.text.primary,
                  borderBottom: `2px solid ${colors.primary[500]}`,
                  paddingBottom: 8,
                }}
              >
                Leave Deduction Rules
              </h3>
              <p style={{ fontSize: 12, color: colors.text.secondary, marginBottom: 16 }}>
                Configure deductions for different types of leaves.
              </p>
              <div
                className="rules-form-grid"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                  gap: 16,
                }}
              >
                <div>
                  <label
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: colors.text.secondary,
                      marginBottom: 6,
                      display: 'block',
                    }}
                  >
                    Unpaid Leave (Days)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.leaveConfig.unpaidLeaveDays}
                    onChange={(e) => updateNestedField('leaveConfig', 'unpaidLeaveDays', Number(e.target.value))}
                    min="0"
                    style={{
                      padding: '10px 14px',
                      borderRadius: 8,
                      border: `1px solid ${colors.border.input}`,
                      fontSize: 14,
                      width: '100%',
                      outline: 'none',
                      backgroundColor: colors.background.input,
                      color: colors.text.primary,
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: colors.text.secondary,
                      marginBottom: 6,
                      display: 'block',
                    }}
                  >
                    Sick Leave (Days)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.leaveConfig.sickLeaveDays}
                    onChange={(e) => updateNestedField('leaveConfig', 'sickLeaveDays', Number(e.target.value))}
                    min="0"
                    style={{
                      padding: '10px 14px',
                      borderRadius: 8,
                      border: `1px solid ${colors.border.input}`,
                      fontSize: 14,
                      width: '100%',
                      outline: 'none',
                      backgroundColor: colors.background.input,
                      color: colors.text.primary,
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: colors.text.secondary,
                      marginBottom: 6,
                      display: 'block',
                    }}
                  >
                    Half Day (Days)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.leaveConfig.halfDayDays}
                    onChange={(e) => updateNestedField('leaveConfig', 'halfDayDays', Number(e.target.value))}
                    min="0"
                    style={{
                      padding: '10px 14px',
                      borderRadius: 8,
                      border: `1px solid ${colors.border.input}`,
                      fontSize: 14,
                      width: '100%',
                      outline: 'none',
                      backgroundColor: colors.background.input,
                      color: colors.text.primary,
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: colors.text.secondary,
                      marginBottom: 6,
                      display: 'block',
                    }}
                  >
                    Paid Leave (Days)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.leaveConfig.paidLeaveDays}
                    onChange={(e) => updateNestedField('leaveConfig', 'paidLeaveDays', Number(e.target.value))}
                    min="0"
                    style={{
                      padding: '10px 14px',
                      borderRadius: 8,
                      border: `1px solid ${colors.border.input}`,
                      fontSize: 14,
                      width: '100%',
                      outline: 'none',
                      backgroundColor: colors.background.input,
                      color: colors.text.primary,
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Salary Configuration */}
            <div
              className="rules-form-section"
              style={{
                marginBottom: 24,
                padding: '20px 24px',
                borderRadius: 12,
                backgroundColor: colors.background.secondary,
                border: `1px solid ${colors.border.default}`,
              }}
            >
              <h3
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  marginBottom: 16,
                  color: colors.text.primary,
                  borderBottom: `2px solid ${colors.primary[500]}`,
                  paddingBottom: 8,
                }}
              >
                Salary Calculation Configuration
              </h3>
              <div
                style={{
                  padding: '12px 16px',
                  borderRadius: 8,
                  backgroundColor: theme === 'dark' ? 'rgba(59, 130, 246, 0.15)' : '#e0f2fe',
                  border: `1px solid ${colors.primary[300]}`,
                  marginBottom: 16,
                }}
              >
                <p style={{ fontSize: 12, color: colors.text.secondary, margin: 0, lineHeight: 1.6 }}>
                  <strong style={{ color: colors.primary[600] }}>ℹ️ Note:</strong> The system automatically uses the <strong>actual number of days in each month</strong> (28, 29, 30, or 31) for salary calculations. 
                  The "Days Per Month" value below is used as a <strong>default/fallback</strong> only if the actual month days cannot be determined.
                </p>
              </div>
              <p style={{ fontSize: 12, color: colors.text.secondary, marginBottom: 16 }}>
                Configure the default days per month for salary calculation (used as fallback).
              </p>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                  gap: 16,
                }}
              >
                <div>
                  <label
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: colors.text.secondary,
                      marginBottom: 6,
                      display: 'block',
                    }}
                  >
                    Default Days Per Month
                  </label>
                  <input
                    type="number"
                    value={formData.salaryConfig.daysPerMonth}
                    onChange={(e) => updateNestedField('salaryConfig', 'daysPerMonth', Number(e.target.value))}
                    min="1"
                    max="31"
                    style={{
                      padding: '10px 14px',
                      borderRadius: 8,
                      border: `1px solid ${colors.border.input}`,
                      fontSize: 14,
                      width: '100%',
                      outline: 'none',
                      backgroundColor: colors.background.input,
                      color: colors.text.primary,
                    }}
                  />
                  <p style={{ fontSize: 11, color: colors.text.tertiary, marginTop: 4 }}>
                    Default value (30 days). System uses actual month days (28-31) automatically.
                  </p>
                </div>
              </div>
            </div>

            {/* Description */}
            <div style={{ marginBottom: 24 }}>
              <label
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: colors.text.secondary,
                  marginBottom: 6,
                  display: 'block',
                }}
              >
                Description (Optional)
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                style={{
                  padding: '10px 14px',
                  borderRadius: 8,
                  border: `1px solid ${colors.border.input}`,
                  fontSize: 14,
                  width: '100%',
                  minHeight: 80,
                  resize: 'vertical',
                  outline: 'none',
                  backgroundColor: colors.background.input,
                  color: colors.text.primary,
                  fontFamily: 'inherit',
                }}
                placeholder="Optional description for this rule set"
              />
            </div>

            {/* Submit Button */}
            <div
              style={{
                display: 'flex',
                gap: 12,
                justifyContent: 'flex-end',
                marginTop: 24,
              }}
            >
              <button
                type="submit"
                disabled={saving}
                style={{
                  padding: '12px 24px',
                  background: `linear-gradient(135deg, ${colors.primary[500]}, ${colors.primary[600]})`,
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 12,
                  cursor: saving ? 'not-allowed' : 'pointer',
                  fontSize: 14,
                  fontWeight: 600,
                  opacity: saving ? 0.6 : 1,
                  boxShadow: `0 8px 20px ${colors.primary[500]}40`,
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  if (!saving) {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = `0 10px 24px ${colors.primary[500]}50`;
                  }
                }}
                onMouseLeave={(e) => {
                  if (!saving) {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = `0 8px 20px ${colors.primary[500]}40`;
                  }
                }}
              >
                {saving ? 'Saving...' : 'Save Violation Rules'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}


'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { useTheme } from '@/lib/theme/ThemeContext';
import ThemeToggle from '@/components/ui/ThemeToggle';
import { useAutoLogout } from '@/hooks/useAutoLogout';
import AutoLogoutWarning from '@/components/ui/AutoLogoutWarning';

export default function ShiftManagementPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const { colors, theme } = useTheme();
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState({ type: '', text: '' });
  const [modalOpen, setModalOpen] = useState(false);
  const [editingShift, setEditingShift] = useState(null);

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

  const [formData, setFormData] = useState({
    name: '',
    code: '',
    startTime: '',
    endTime: '',
    crossesMidnight: false,
    gracePeriod: 15,
    description: '',
    isActive: true,
  });

  function showToast(type, text) {
    setToast({ type, text });
    setTimeout(() => {
      setToast((prev) => (prev.text === text ? { type: '', text: '' } : prev));
    }, 3000);
  }

  async function loadShifts() {
    try {
      setLoading(true);
      const res = await fetch('/api/hr/shifts?activeOnly=false');
      if (!res.ok) throw new Error('Failed to load shifts');
      const response = await res.json();
      
      // Handle standardized API response format
      // New format: { success, message, data: { shifts }, error }
      // Old format (backward compatibility): { shifts }
      let shifts = [];
      if (response.success !== undefined) {
        // New standardized format
        if (!response.success) {
          throw new Error(response.error || response.message || 'Failed to load shifts');
        }
        shifts = response.data?.shifts || [];
      } else {
        // Legacy format (backward compatibility)
        shifts = response.shifts || [];
      }
      
      setShifts(shifts);
    } catch (err) {
      console.error(err);
      showToast('error', err.message || 'Failed to load shifts');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadShifts();
  }, []);

  function openNewModal() {
    setEditingShift(null);
    setFormData({
      name: '',
      code: '',
      startTime: '',
      endTime: '',
      crossesMidnight: false,
      gracePeriod: 15,
      description: '',
      isActive: true,
    });
    setModalOpen(true);
  }

  function openEditModal(shift) {
    // Ensure we have a valid ID
    if (!shift._id && !shift.id) {
      showToast('error', 'Invalid shift: missing ID');
      return;
    }
    
    setEditingShift({
      ...shift,
      _id: shift._id || shift.id, // Support both _id and id
    });
    setFormData({
      name: shift.name || '',
      code: shift.code || '',
      startTime: shift.startTime || '',
      endTime: shift.endTime || '',
      crossesMidnight: shift.crossesMidnight || false,
      gracePeriod: shift.gracePeriod || 15,
      description: shift.description || '',
      isActive: shift.isActive !== undefined ? shift.isActive : true,
    });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingShift(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      setLoading(true);
      
      // Validate shift ID if editing
      const shiftId = editingShift?._id || editingShift?.id;
      if (editingShift && !shiftId) {
        throw new Error('Invalid shift ID. Please refresh the page and try again.');
      }

      // Convert ObjectId to string if needed
      const shiftIdString = shiftId ? String(shiftId) : null;

      const url = editingShift
        ? `/api/hr/shifts/${shiftIdString}`
        : '/api/hr/shifts';
      const method = editingShift ? 'PUT' : 'POST';

      console.log('Submitting shift:', { editingShift, shiftId: shiftIdString, url, method, formData });

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        let errorMessage = `Failed to ${editingShift ? 'update' : 'create'} shift`;
        try {
          const errorData = await res.json();
          errorMessage = errorData.error || errorMessage;
          console.error('API error response:', errorData);
        } catch {
          const text = await res.text();
          errorMessage = text || errorMessage;
          console.error('API error text:', text);
        }
        throw new Error(errorMessage);
      }

      const response = await res.json();
      
      // Handle standardized API response format
      if (response.success !== undefined && !response.success) {
        throw new Error(response.error || response.message || 'Failed to save shift');
      }
      
      showToast('success', `Shift ${editingShift ? 'updated' : 'created'} successfully`);
      closeModal();
      await loadShifts();
    } catch (err) {
      console.error('Shift save error:', err);
      showToast('error', err.message || 'Failed to save shift');
    } finally {
      setLoading(false);
    }
  }

  async function handleDeactivate(id) {
    if (!confirm('Are you sure you want to deactivate this shift? You can reactivate it later.')) return;

    try {
      setLoading(true);
      const res = await fetch(`/api/hr/shifts/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || errorData.message || 'Failed to deactivate shift');
      }
      const response = await res.json();
      const message = response.success !== undefined 
        ? (response.message || 'Shift deactivated successfully')
        : 'Shift deactivated successfully';
      showToast('success', message);
      await loadShifts();
    } catch (err) {
      console.error(err);
      showToast('error', err.message || 'Failed to deactivate shift');
    } finally {
      setLoading(false);
    }
  }

  async function handlePermanentDelete(id, shiftCode) {
    const confirmMessage = `Are you sure you want to PERMANENTLY DELETE the shift "${shiftCode}"?\n\n⚠️ WARNING: This action cannot be undone. The shift will be completely removed from the system.`;
    if (!confirm(confirmMessage)) return;

    try {
      setLoading(true);
      const res = await fetch(`/api/hr/shifts/${id}?permanent=true`, { method: 'DELETE' });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || errorData.message || 'Failed to delete shift');
      }
      const response = await res.json();
      const message = response.success !== undefined 
        ? (response.message || 'Shift permanently deleted successfully')
        : 'Shift permanently deleted successfully';
      showToast('success', message);
      await loadShifts();
    } catch (err) {
      console.error(err);
      showToast('error', err.message || 'Failed to delete shift');
    } finally {
      setLoading(false);
    }
  }

  async function handleActivateAll() {
    if (!confirm('Are you sure you want to activate all shifts? This will set all shifts to active status.')) return;

    try {
      setLoading(true);
      const res = await fetch('/api/hr/shifts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'activateAll' }),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || errorData.message || 'Failed to activate shifts');
      }
      const response = await res.json();
      
      // Handle standardized API response format
      let message = '';
      if (response.success !== undefined) {
        if (!response.success) {
          throw new Error(response.error || response.message || 'Failed to activate shifts');
        }
        const modifiedCount = response.data?.modifiedCount || 0;
        message = response.message || `Activated ${modifiedCount} shift(s)`;
      } else {
        // Legacy format
        message = response.message || `Activated ${response.modifiedCount || 0} shift(s)`;
      }
      
      showToast('success', message);
      await loadShifts();
    } catch (err) {
      console.error(err);
      showToast('error', err.message || 'Failed to activate shifts');
    } finally {
      setLoading(false);
    }
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
            .shift-header {
              flex-direction: column !important;
              align-items: flex-start !important;
            }
            .shift-header > div:first-child {
              margin-bottom: 12px;
            }
            .shift-table-wrapper {
              overflow-x: auto;
              -webkit-overflow-scrolling: touch;
            }
            .shift-table {
              min-width: 700px;
            }
            .shift-modal {
              padding: 16px !important;
              max-width: 95% !important;
            }
            .shift-form-grid {
              grid-template-columns: 1fr !important;
            }
          }
          @media (max-width: 480px) {
            .shift-header-logo {
              width: 60px !important;
              height: 60px !important;
            }
            .shift-header-title {
              font-size: 18px !important;
            }
            .shift-header-subtitle {
              font-size: 11px !important;
            }
            .shift-button {
              width: 100% !important;
              justify-content: center !important;
            }
          }
          
          /* Laptop & Desktop Responsive Styles */
          @media (min-width: 1024px) and (max-width: 1366px) {
            .shift-header {
              padding: 16px 22px !important;
            }
            .shift-header-logo {
              width: 75px !important;
              height: 75px !important;
            }
            .shift-header-title {
              font-size: 20px !important;
            }
            .shift-header > div:last-child {
              flex-wrap: wrap !important;
              gap: 8px !important;
            }
            .shift-button {
              padding: 8px 16px !important;
              font-size: 12px !important;
            }
            .shift-table {
              font-size: 12px !important;
            }
            .shift-table th,
            .shift-table td {
              padding: 8px 10px !important;
            }
          }
          
          @media (min-width: 1367px) and (max-width: 1440px) {
            .shift-header {
              padding: 18px 24px !important;
            }
            .shift-table {
              font-size: 12.5px !important;
            }
          }
          
          @media (min-width: 1441px) and (max-width: 1920px) {
            .shift-header {
              padding: 20px 28px !important;
            }
            .shift-table {
              font-size: 13px !important;
            }
          }
          
          @media (min-width: 1921px) {
            .shift-header {
              padding: 24px 32px !important;
            }
            .shift-header-title {
              font-size: 24px !important;
            }
            .shift-header-logo {
              width: 100px !important;
              height: 100px !important;
            }
            .shift-table {
              font-size: 14px !important;
            }
            .shift-table th,
            .shift-table td {
              padding: 10px 14px !important;
            }
          }
        `,
        }}
      />
      {/* Enhanced Professional Header */}
      <div className="container-responsive" style={{ margin: '0 auto 24px auto', width: '100%' }}>
        <div
          className="shift-header"
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
            position: 'relative',
            overflow: 'hidden',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          {/* Background Pattern */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(255,255,255,0.1) 0%, transparent 50%)',
              pointerEvents: 'none',
            }}
          />
          
          {/* Left: logo + title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, position: 'relative', zIndex: 1 }}>
            <div
              className="shift-header-logo"
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
                className="shift-header-title"
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
                className="shift-header-subtitle"
                style={{
                  fontSize: 13,
                  opacity: 0.95,
                  fontWeight: 500,
                }}
              >
                Shift Management · Create & Configure Employee Shifts
              </div>
            </div>
          </div>

          {/* Right: actions */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', position: 'relative', zIndex: 1 }}>
            <ThemeToggle />
            <button
              className="shift-button"
              onClick={openNewModal}
              style={{
                padding: '9px 18px',
                borderRadius: 12,
                border: `1px solid ${theme === 'dark' ? 'rgba(255, 255, 255, 0.25)' : colors.border.default}`,
                backgroundColor: theme === 'dark' ? 'rgba(255, 255, 255, 0.15)' : colors.background.card,
                color: theme === 'dark' ? '#ffffff' : colors.text.primary,
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                whiteSpace: 'nowrap',
                backdropFilter: 'blur(10px)',
                transition: 'all 0.2s',
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
              <span style={{ fontSize: 18 }}>+</span>
              Create New Shift
            </button>
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

      {/* Main Card */}
      <div
        style={{
          maxWidth: 1400,
          margin: '0 auto',
          borderRadius: 16,
          background: colors.background.card,
          boxShadow: theme === 'dark' 
            ? '0 20px 60px rgba(15,23,42,0.9)'
            : '0 20px 60px rgba(0,0,0,0.08)',
          padding: '16px 20px 20px',
          border: `1px solid ${colors.border.default}`,
        }}
      >
        {toast.text && (
          <div
            style={{
              padding: 12,
              borderRadius: 8,
              marginBottom: 16,
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

        <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <button
            onClick={handleActivateAll}
            disabled={loading}
            style={{
              padding: '10px 20px',
              background: `linear-gradient(135deg, ${colors.primary[500]}, ${colors.primary[600]})`,
              color: '#ffffff',
              border: 'none',
              borderRadius: 12,
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: 14,
              fontWeight: 600,
              boxShadow: `0 8px 20px ${colors.primary[500]}40`,
              opacity: loading ? 0.6 : 1,
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              if (!loading) {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = `0 10px 24px ${colors.primary[500]}50`;
              }
            }}
            onMouseLeave={(e) => {
              if (!loading) {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = `0 8px 20px ${colors.primary[500]}40`;
              }
            }}
          >
            ✓ Activate All Shifts
          </button>
          <button
            onClick={openNewModal}
            style={{
              padding: '10px 20px',
              background: `linear-gradient(135deg, ${colors.success}, ${colors.secondary[600]})`,
              color: theme === 'dark' ? '#ffffff' : colors.secondary[900],
              border: 'none',
              borderRadius: 12,
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 600,
              boxShadow: `0 8px 20px ${colors.success}40`,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = `0 10px 24px ${colors.success}50`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = `0 8px 20px ${colors.success}40`;
            }}
          >
            <span style={{ fontSize: 18 }}>+</span>
            Create New Shift
          </button>
        </div>

        {loading && !shifts.length ? (
          <div style={{ textAlign: 'center', padding: 40, color: colors.text.muted }}>
            Loading shifts...
          </div>
        ) : (
          <div
            className="shift-table-wrapper"
            style={{
              borderRadius: 12,
              border: `1px solid ${colors.border.default}`,
              overflow: 'hidden',
              overflowX: 'auto',
              backgroundColor: colors.background.card,
            }}
          >
            <table
              className="shift-table"
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                minWidth: 600,
              }}
            >
              <thead>
                <tr style={{ backgroundColor: colors.background.table.header, borderBottom: `2px solid ${colors.border.table}` }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: colors.text.table.header }}>
                    Code
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: colors.text.table.header }}>
                    Name
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: colors.text.table.header }}>
                    Time
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: colors.text.table.header }}>
                    Grace Period
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: colors.text.table.header }}>
                    Status
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: 13, fontWeight: 600, color: colors.text.table.header }}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {shifts.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      style={{
                        padding: 40,
                        textAlign: 'center',
                        color: colors.text.muted,
                        fontSize: 14,
                        backgroundColor: colors.background.table.row,
                      }}
                    >
                      No shifts found. Create your first shift to get started.
                    </td>
                  </tr>
                ) : (
                  shifts.map((shift, index) => (
                    <tr
                      key={shift._id}
                      style={{
                        borderBottom: `1px solid ${colors.border.table}`,
                        backgroundColor: index % 2 === 0 
                          ? colors.background.table.row 
                          : colors.background.table.rowEven,
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = colors.background.table.rowHover;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = index % 2 === 0 
                          ? colors.background.table.row 
                          : colors.background.table.rowEven;
                      }}
                    >
                      <td style={{ padding: '12px 16px', fontSize: 14, fontWeight: 600, color: colors.text.table.cell }}>
                        {shift.code}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 14, color: colors.text.table.cell }}>{shift.name}</td>
                      <td style={{ padding: '12px 16px', fontSize: 14, color: colors.text.table.cell }}>
                        {shift.startTime} - {shift.endTime}
                        {shift.crossesMidnight && ' (next day)'}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 14, color: colors.text.table.cell }}>{shift.gracePeriod} min</td>
                      <td style={{ padding: '12px 16px', fontSize: 14 }}>
                        <span
                          style={{
                            padding: '4px 10px',
                            borderRadius: 999,
                            fontSize: 12,
                            fontWeight: 600,
                            backgroundColor: shift.isActive 
                              ? (theme === 'dark' ? 'rgba(34, 197, 94, 0.2)' : `${colors.success}20`)
                              : (theme === 'dark' ? 'rgba(239, 68, 68, 0.2)' : `${colors.error}20`),
                            color: shift.isActive ? colors.success : colors.error,
                            border: `1px solid ${shift.isActive ? colors.success : colors.error}40`,
                          }}
                        >
                          {shift.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                          <button
                            onClick={() => openEditModal(shift)}
                            style={{
                              padding: '6px 14px',
                              backgroundColor: theme === 'dark' ? 'rgba(59,130,246,0.2)' : `${colors.primary[500]}20`,
                              color: colors.primary[400] || colors.primary[500],
                              border: `1px solid ${colors.primary[500]}40`,
                              borderRadius: 6,
                              cursor: 'pointer',
                              fontSize: 12,
                              fontWeight: 600,
                              transition: 'all 0.2s',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = theme === 'dark' ? 'rgba(59,130,246,0.3)' : `${colors.primary[500]}30`;
                              e.currentTarget.style.transform = 'translateY(-1px)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = theme === 'dark' ? 'rgba(59,130,246,0.2)' : `${colors.primary[500]}20`;
                              e.currentTarget.style.transform = 'translateY(0)';
                            }}
                          >
                            Edit
                          </button>
                          {shift.isActive && (
                            <button
                              onClick={() => handleDeactivate(shift._id)}
                              style={{
                                padding: '6px 14px',
                                backgroundColor: theme === 'dark' ? 'rgba(251, 191, 36, 0.2)' : `${colors.warning}20`,
                                color: colors.warning,
                                border: `1px solid ${colors.warning}40`,
                                borderRadius: 6,
                                cursor: 'pointer',
                                fontSize: 12,
                                fontWeight: 600,
                                transition: 'all 0.2s',
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = theme === 'dark' ? 'rgba(251, 191, 36, 0.3)' : `${colors.warning}30`;
                                e.currentTarget.style.transform = 'translateY(-1px)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = theme === 'dark' ? 'rgba(251, 191, 36, 0.2)' : `${colors.warning}20`;
                                e.currentTarget.style.transform = 'translateY(0)';
                              }}
                            >
                              Deactivate
                            </button>
                          )}
                          <button
                            onClick={() => handlePermanentDelete(shift._id, shift.code)}
                            style={{
                              padding: '6px 14px',
                              backgroundColor: theme === 'dark' ? 'rgba(239,68,68,0.2)' : `${colors.error}20`,
                              color: colors.error,
                              border: `1px solid ${colors.error}40`,
                              borderRadius: 6,
                              cursor: 'pointer',
                              fontSize: 12,
                              fontWeight: 600,
                              transition: 'all 0.2s',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = theme === 'dark' ? 'rgba(239,68,68,0.3)' : `${colors.error}30`;
                              e.currentTarget.style.transform = 'translateY(-1px)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = theme === 'dark' ? 'rgba(239,68,68,0.2)' : `${colors.error}20`;
                              e.currentTarget.style.transform = 'translateY(0)';
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {modalOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: theme === 'dark' ? 'rgba(0, 0, 0, 0.7)' : 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
            backdropFilter: 'blur(4px)',
          }}
          onClick={closeModal}
        >
          <div
            className="shift-modal"
            style={{
              backgroundColor: colors.background.card,
              borderRadius: 16,
              padding: '24px',
              maxWidth: 600,
              width: '100%',
              maxHeight: '90vh',
              overflow: 'auto',
              border: `1px solid ${colors.border.default}`,
              boxShadow: theme === 'dark' 
                ? '0 20px 60px rgba(0,0,0,0.8)'
                : '0 20px 60px rgba(0,0,0,0.15)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              style={{
                fontSize: 20,
                fontWeight: 700,
                marginBottom: 20,
                color: colors.text.primary,
              }}
            >
              {editingShift ? 'Edit Shift' : 'Create New Shift'}
            </h2>

            <form onSubmit={handleSubmit}>
              <div
                className="shift-form-grid"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: 16,
                  marginBottom: 16,
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
                    Shift Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
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
                    required
                    placeholder="e.g., Day Shift 1"
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
                    Shift Code *
                  </label>
                  <input
                    type="text"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
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
                    required
                    placeholder="e.g., D1"
                    maxLength={10}
                  />
                </div>
              </div>

              <div
                className="shift-form-grid"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: 16,
                  marginBottom: 16,
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
                    Start Time *
                  </label>
                  <input
                    type="time"
                    value={formData.startTime}
                    onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
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
                    required
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
                    End Time *
                  </label>
                  <input
                    type="time"
                    value={formData.endTime}
                    onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
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
                    required
                  />
                </div>
              </div>

              <div
                className="shift-form-grid"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: 16,
                  marginBottom: 16,
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
                    Grace Period (minutes)
                  </label>
                  <input
                    type="number"
                    value={formData.gracePeriod}
                    onChange={(e) => setFormData({ ...formData, gracePeriod: Number(e.target.value) })}
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
                    min="0"
                    required
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 28 }}>
                  <input
                    type="checkbox"
                    checked={formData.crossesMidnight}
                    onChange={(e) => setFormData({ ...formData, crossesMidnight: e.target.checked })}
                    style={{ width: 18, height: 18, cursor: 'pointer' }}
                  />
                  <label
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: colors.text.secondary,
                      cursor: 'pointer',
                    }}
                  >
                    Crosses Midnight (next day)
                  </label>
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                  <label
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: colors.text.secondary,
                      marginBottom: 6,
                      display: 'block',
                    }}
                  >
                  Description
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
                  placeholder="Optional description"
                />
              </div>

              {editingShift && (
                <div style={{ marginBottom: 16 }}>
                  <label
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: colors.text.secondary,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={formData.isActive}
                      onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                      style={{ width: 18, height: 18, cursor: 'pointer' }}
                    />
                    Active
                  </label>
                </div>
              )}

              <div
                style={{
                  display: 'flex',
                  gap: 12,
                  justifyContent: 'flex-end',
                  marginTop: 24,
                  flexWrap: 'wrap',
                }}
              >
                <button
                  type="button"
                  onClick={closeModal}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: colors.background.secondary,
                    color: colors.text.primary,
                    border: `1px solid ${colors.border.default}`,
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontSize: 14,
                    fontWeight: 600,
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    padding: '10px 20px',
                    background: `linear-gradient(135deg, ${colors.primary[500]}, ${colors.primary[600]})`,
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 8,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    fontSize: 14,
                    fontWeight: 600,
                    opacity: loading ? 0.6 : 1,
                    boxShadow: `0 8px 20px ${colors.primary[500]}40`,
                    transition: 'all 0.2s',
                  }}
                >
                  {loading ? 'Saving...' : editingShift ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

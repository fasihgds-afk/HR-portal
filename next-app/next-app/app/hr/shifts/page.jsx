'use client';

import { useState, useEffect } from 'react';

export default function ShiftManagementPage() {
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState({ type: '', text: '' });
  const [modalOpen, setModalOpen] = useState(false);
  const [editingShift, setEditingShift] = useState(null);

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
      const data = await res.json();
      setShifts(data.shifts || []);
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

      const data = await res.json();
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

  async function handleDelete(id) {
    if (!confirm('Are you sure you want to deactivate this shift?')) return;

    try {
      setLoading(true);
      const res = await fetch(`/api/hr/shifts/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to deactivate shift');
      showToast('success', 'Shift deactivated successfully');
      await loadShifts();
    } catch (err) {
      console.error(err);
      showToast('error', err.message || 'Failed to deactivate shift');
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
        throw new Error(errorData.error || 'Failed to activate shifts');
      }
      const data = await res.json();
      showToast('success', data.message || `Activated ${data.modifiedCount || 0} shift(s)`);
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
        padding: '24px 16px 32px',
        background: 'radial-gradient(circle at top, #0b2344 0, #061525 40%, #020617 100%)',
        color: '#e5e7eb',
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
        `,
        }}
      />
      {/* Header */}
      <div style={{ maxWidth: 1400, margin: '0 auto 20px auto' }}>
        <div
          className="shift-header"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 22px',
            borderRadius: 18,
            background: 'linear-gradient(135deg, #19264aff, #0c225cff, #58D34D)',
            color: '#f9fafb',
            boxShadow: '0 16px 38px rgba(255, 255, 255, 0.09)',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              className="shift-header-logo"
              style={{
                width: 100,
                height: 100,
                borderRadius: '999px',
                overflow: 'hidden',
                backgroundColor: 'rgba(15,23,42,0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
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
                  fontSize: 22,
                  fontWeight: 700,
                  letterSpacing: 0.4,
                }}
              >
                Global Digital Solutions
              </div>
              <div
                className="shift-header-subtitle"
                style={{
                  fontSize: 12.5,
                  opacity: 0.9,
                }}
              >
                Shift Management · Create & Configure Employee Shifts
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              className="shift-button"
              onClick={openNewModal}
              style={{
                padding: '9px 20px',
                borderRadius: 999,
                border: 'none',
                background: 'linear-gradient(135deg, #0F162A, #0c225cff, #58D34D)',
                color: '#ffffffff',
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                boxShadow: '0 14px 30px rgba(16,185,129,0.5)',
                whiteSpace: 'nowrap',
              }}
            >
              <span style={{ fontSize: 18 }}>+</span>
              Create New Shift
            </button>
          </div>
        </div>
      </div>

      {/* Main Card */}
      <div
        style={{
          maxWidth: 1400,
          margin: '0 auto',
          borderRadius: 16,
          background: 'radial-gradient(circle at top, #020617, #020617)',
          boxShadow: '0 20px 60px rgba(15,23,42,0.9)',
          padding: '16px 20px 20px',
        }}
      >
        {toast.text && (
          <div
            style={{
              padding: 12,
              borderRadius: 8,
              marginBottom: 16,
              backgroundColor: toast.type === 'success' ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)',
              color: toast.type === 'success' ? '#6ee7b7' : '#fca5a5',
              fontSize: 14,
              border: `1px solid ${toast.type === 'success' ? 'rgba(16,185,129,0.5)' : 'rgba(239,68,68,0.5)'}`,
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
              background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
              color: '#ffffff',
              border: 'none',
              borderRadius: 999,
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: 14,
              fontWeight: 700,
              boxShadow: '0 8px 20px rgba(59,130,246,0.4)',
              opacity: loading ? 0.6 : 1,
            }}
          >
            ✓ Activate All Shifts
          </button>
          <button
            onClick={openNewModal}
            style={{
              padding: '10px 20px',
              background: 'linear-gradient(135deg, #22c55e, #2dd4bf)',
              color: '#022c22',
              border: 'none',
              borderRadius: 999,
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 700,
              boxShadow: '0 8px 20px rgba(34,197,94,0.4)',
            }}
          >
            <span style={{ fontSize: 18 }}>+</span>
            Create New Shift
          </button>
        </div>

        {loading && !shifts.length ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>
            Loading shifts...
          </div>
        ) : (
          <div
            className="shift-table-wrapper"
            style={{
              borderRadius: 12,
              border: '1px solid rgba(55,65,81,0.9)',
              overflow: 'hidden',
              overflowX: 'auto',
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
                <tr style={{ backgroundColor: 'rgba(15,23,42,0.9)', borderBottom: '2px solid rgba(55,65,81,0.9)' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: '#e5e7eb' }}>
                    Code
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: '#e5e7eb' }}>
                    Name
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: '#e5e7eb' }}>
                    Time
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: '#e5e7eb' }}>
                    Grace Period
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: '#e5e7eb' }}>
                    Status
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: 13, fontWeight: 600, color: '#e5e7eb' }}>
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
                        color: '#9ca3af',
                        fontSize: 14,
                      }}
                    >
                      No shifts found. Create your first shift to get started.
                    </td>
                  </tr>
                ) : (
                  shifts.map((shift) => (
                    <tr
                      key={shift._id}
                      style={{
                        borderBottom: '1px solid rgba(55,65,81,0.5)',
                        backgroundColor: shift.isActive ? 'rgba(15,23,42,0.3)' : 'rgba(127,29,29,0.2)',
                      }}
                    >
                      <td style={{ padding: '12px 16px', fontSize: 14, fontWeight: 600, color: '#e5e7eb' }}>
                        {shift.code}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 14, color: '#d1d5db' }}>{shift.name}</td>
                      <td style={{ padding: '12px 16px', fontSize: 14, color: '#d1d5db' }}>
                        {shift.startTime} - {shift.endTime}
                        {shift.crossesMidnight && ' (next day)'}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 14, color: '#d1d5db' }}>{shift.gracePeriod} min</td>
                      <td style={{ padding: '12px 16px', fontSize: 14 }}>
                        <span
                          style={{
                            padding: '4px 10px',
                            borderRadius: 999,
                            fontSize: 12,
                            fontWeight: 600,
                            backgroundColor: shift.isActive ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)',
                            color: shift.isActive ? '#6ee7b7' : '#fca5a5',
                            border: `1px solid ${shift.isActive ? 'rgba(16,185,129,0.5)' : 'rgba(239,68,68,0.5)'}`,
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
                              backgroundColor: 'rgba(59,130,246,0.2)',
                              color: '#93c5fd',
                              border: '1px solid rgba(59,130,246,0.5)',
                              borderRadius: 6,
                              cursor: 'pointer',
                              fontSize: 12,
                              fontWeight: 600,
                            }}
                          >
                            Edit
                          </button>
                          {shift.isActive && (
                            <button
                              onClick={() => handleDelete(shift._id)}
                              style={{
                                padding: '6px 14px',
                                backgroundColor: 'rgba(239,68,68,0.2)',
                                color: '#fca5a5',
                                border: '1px solid rgba(239,68,68,0.5)',
                                borderRadius: 6,
                                cursor: 'pointer',
                                fontSize: 12,
                                fontWeight: 600,
                              }}
                            >
                              Deactivate
                            </button>
                          )}
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
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
          onClick={closeModal}
        >
          <div
            className="shift-modal"
            style={{
              backgroundColor: '#0f172a',
              borderRadius: 16,
              padding: '24px',
              maxWidth: 600,
              width: '100%',
              maxHeight: '90vh',
              overflow: 'auto',
              border: '1px solid rgba(55,65,81,0.9)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.8)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              style={{
                fontSize: 20,
                fontWeight: 700,
                marginBottom: 20,
                color: '#e5e7eb',
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
                      color: '#d1d5db',
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
                      border: '1px solid rgba(55,65,81,0.9)',
                      fontSize: 14,
                      width: '100%',
                      outline: 'none',
                      backgroundColor: 'rgba(15,23,42,0.5)',
                      color: '#e5e7eb',
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
                      color: '#d1d5db',
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
                      border: '1px solid rgba(55,65,81,0.9)',
                      fontSize: 14,
                      width: '100%',
                      outline: 'none',
                      backgroundColor: 'rgba(15,23,42,0.5)',
                      color: '#e5e7eb',
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
                      color: '#d1d5db',
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
                      border: '1px solid rgba(55,65,81,0.9)',
                      fontSize: 14,
                      width: '100%',
                      outline: 'none',
                      backgroundColor: 'rgba(15,23,42,0.5)',
                      color: '#e5e7eb',
                    }}
                    required
                  />
                </div>
                <div>
                  <label
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: '#d1d5db',
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
                      border: '1px solid rgba(55,65,81,0.9)',
                      fontSize: 14,
                      width: '100%',
                      outline: 'none',
                      backgroundColor: 'rgba(15,23,42,0.5)',
                      color: '#e5e7eb',
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
                      color: '#d1d5db',
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
                      border: '1px solid rgba(55,65,81,0.9)',
                      fontSize: 14,
                      width: '100%',
                      outline: 'none',
                      backgroundColor: 'rgba(15,23,42,0.5)',
                      color: '#e5e7eb',
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
                      color: '#d1d5db',
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
                    color: '#d1d5db',
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
                    border: '1px solid rgba(55,65,81,0.9)',
                    fontSize: 14,
                    width: '100%',
                    minHeight: 80,
                    resize: 'vertical',
                    outline: 'none',
                    backgroundColor: 'rgba(15,23,42,0.5)',
                    color: '#e5e7eb',
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
                      color: '#d1d5db',
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
                    backgroundColor: 'rgba(55,65,81,0.5)',
                    color: '#d1d5db',
                    border: '1px solid rgba(55,65,81,0.9)',
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
                    background: 'linear-gradient(135deg, #0F162A, #0c225cff, #58D34D)',
                    color: '#ffffffff',
                    border: 'none',
                    borderRadius: 8,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    fontSize: 14,
                    fontWeight: 700,
                    opacity: loading ? 0.6 : 1,
                    boxShadow: '0 14px 30px rgba(16,185,129,0.5)',
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

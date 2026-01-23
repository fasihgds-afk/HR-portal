// next-app/app/hr/employees/page.jsx
'use client';

import React, { useEffect, useState } from 'react';
import EmployeeTable from '../../../../components/employees/EmployeeTable';
import EmployeeFilters from '../../../../components/employees/EmployeeFilters';
import PaginationControls from '../../../../components/common/PaginationControls';
import EmployeeForm from '../../../../components/employees/EmployeeForm';
import Modal from '../../../../components/ui/Modal';
import Toast from '../../../../components/common/Toast';
import ConfirmDialog from '../../../../components/ui/ConfirmDialog';

const thStyle = {
  padding: '10px 12px',
  textAlign: 'left',
  borderBottom: '1px solid #E5E7EB',
  fontWeight: 600,
  fontSize: 13,
  color: '#0f172a',
  backgroundColor: '#e5f1ff',
};

const tdStyle = {
  padding: '9px 12px',
  borderBottom: '1px solid #E5E7EB',
  fontSize: 13,
  color: '#0f172a',
  backgroundColor: '#ffffff',
};

const inputStyle = {
  padding: '8px 10px',
  borderRadius: 6,
  border: '1px solid #cbd5f5',
  backgroundColor: '#ffffff',
  color: '#0f172a',
  fontSize: 13,
  outline: 'none',
};

const selectStyle = {
  ...inputStyle,
  minWidth: 120,
};

export default function EmployeeShiftPage() {
  const [employees, setEmployees] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState(null);
  const [searchQuery, setSearchQuery] = useState(''); // Search query only
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 1,
  });

  const [toast, setToast] = useState({ type: '', text: '' });

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  
  // Delete confirmation state
  const [deleteConfirm, setDeleteConfirm] = useState({
    isOpen: false,
    employee: null,
  });

  // Shift history for modal (if needed)
  const [shiftHistory, setShiftHistory] = useState([]);
  const [showShiftHistory, setShowShiftHistory] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // --- helpers --------------------------------------------------------------

  function showToast(type, text) {
    setToast({ type, text });
    setTimeout(() => {
      setToast((t) => (t.text === text ? { type: '', text: '' } : t));
    }, 2600);
  }

  async function loadShifts() {
    try {
      const res = await fetch('/api/hr/shifts?activeOnly=true', {
        cache: 'no-store', // Always get fresh shifts
      });
      if (res.ok) {
        const response = await res.json();
        
        // Handle standardized API response format
        let shifts = [];
        if (response.success !== undefined) {
          if (!response.success) {
            console.error('Failed to load shifts:', response.error || response.message);
            return;
          }
          shifts = response.data?.shifts || [];
        } else {
          // Legacy format (backward compatibility)
          shifts = response.shifts || [];
        }
        
        setShifts(shifts);
      }
    } catch (err) {
      console.error('Failed to load shifts:', err);
    }
  }

  async function loadEmployees(forceRefresh = false) {
    setLoading(true);

    try {
      // Build query parameters - only search, no filters
      const params = new URLSearchParams();
      params.set('page', currentPage.toString());
      params.set('limit', '50'); // 50 employees per page
      if (searchQuery) {
        params.set('search', searchQuery);
      }
      
      // Log request for debugging
      console.log('🔍 Loading employees with params:', {
        page: currentPage,
        limit: 50,
        search: searchQuery || '(none)',
        url: `/api/employee?${params.toString()}`,
      });
      
      // Add cache-busting parameter to bypass server-side cache
      if (forceRefresh) {
        params.set('_t', Date.now().toString()); // Server will bypass cache when this is present
      }

      // Add version parameter to force fresh data (cache busting)
      params.set('v', '2.0'); // Version 2.0 = no shift filter
      
      const res = await fetch(`/api/employee?${params.toString()}`, {
        cache: 'no-store', // Always bypass browser cache
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
        },
      });
      
      if (!res.ok) {
        const text = await res.text();
        let errorMessage = text || `Failed to load employees (${res.status})`;
        
        // Try to parse JSON error if available
        try {
          const errorData = JSON.parse(text);
          errorMessage = errorData.error || errorMessage;
          if (errorData.details) {
            console.error('API Error Details:', errorData.details);
          }
        } catch (e) {
          // Not JSON, use text as is
        }
        
        console.error('Employee API Error:', {
          status: res.status,
          statusText: res.statusText,
          error: errorMessage,
          url: res.url,
        });
        
        throw new Error(errorMessage);
      }
      const response = await res.json();
      
      // Handle standardized API response format
      // New format: { success, message, data: { items }, error, meta: { pagination } }
      // Old format (backward compatibility): { items, pagination }
      let items = [];
      let pagination = null;
      
      if (response.success !== undefined) {
        // New standardized format
        if (!response.success) {
          throw new Error(response.error || response.message || 'Failed to load employees');
        }
        items = response.data?.items || [];
        pagination = response.meta?.pagination || null;
      } else {
        // Legacy format (backward compatibility)
        items = response.items || [];
        pagination = response.pagination || null;
      }
      
      // Log if no employees found (for debugging)
      if (!items || items.length === 0) {
        console.warn('⚠️ No employees found in API response:', {
          items: items,
          pagination: pagination,
          total: pagination?.total,
          responseFormat: response.success !== undefined ? 'standardized' : 'legacy',
          url: res.url,
        });
      }
      
      setEmployees(items);
      if (pagination) {
        setPagination(pagination);
      }
    } catch (err) {
      console.error(err);
      showToast('error', err.message || 'Failed to load employees');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadShifts();
  }, []);

  // Reload employees when page or search changes
  useEffect(() => {
    // Force fresh load on mount to bypass any cached data
    loadEmployees(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, searchQuery]);

  function handleShiftChange(index, newShift) {
    setEmployees((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], shift: newShift };
      return copy;
    });
  }

  // quick save from table row
  async function handleSaveRow(emp) {
    try {
      setSavingId(emp._id || emp.empCode);

      // Get the latest employee data from state to ensure we have the updated shift
      const currentEmployee = employees.find(e => e.empCode === emp.empCode) || emp;

      // Normalize shift code to uppercase (Shift model stores codes in uppercase)
      const normalizedShift = currentEmployee.shift 
        ? String(currentEmployee.shift).trim().toUpperCase() 
        : '';

      const res = await fetch('/api/employee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empCode: currentEmployee.empCode,
          name: currentEmployee.name,
          email: currentEmployee.email,
          monthlySalary: currentEmployee.monthlySalary,
          shift: normalizedShift,
          department: currentEmployee.department,
          designation: currentEmployee.designation,
          phoneNumber: currentEmployee.phoneNumber,
          cnic: currentEmployee.cnic,
          profileImageBase64: currentEmployee.profileImageBase64,
          profileImageUrl: currentEmployee.profileImageUrl,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Failed to save employee (${res.status})`);
      }

      const data = await res.json();

      // Update local state immediately for instant feedback
      // IMPORTANT: Use the returned employee data which has the updated shift
      setEmployees((prev) =>
        prev.map((e) => {
          if (e.empCode === data.employee.empCode) {
            // Merge the returned employee data to ensure shift is updated
            return { ...e, ...data.employee };
          }
          return e;
        })
      );

      showToast(
        'success',
        `Saved ${data.employee.empCode} (${data.employee.name || 'No name'})`
      );
      
      // Refresh the list to ensure we have the latest data from server
      // Use forceRefresh to bypass cache
      setTimeout(() => {
        loadEmployees(true);
      }, 500);
    } catch (err) {
      console.error(err);
      showToast('error', err.message || 'Failed to save employee');
    } finally {
      setSavingId(null);
    }
  }

  // Open modal for adding new employee
  function openAddModal() {
    setEditingEmployee(null);
    setIsModalOpen(true);
  }

  // Handle form submission (both add and edit) - used by EmployeeForm component
  async function handleFormSubmit(formData) {
    setIsSaving(true);
    try {
      const body = {
        empCode: formData.empCode.trim(),
        name: formData.name || undefined,
        email: formData.email || undefined,
        monthlySalary: formData.monthlySalary ? Number(formData.monthlySalary) : undefined,
        shift: formData.shift || '',
        department: formData.department || undefined,
        designation: formData.designation || undefined,
        phoneNumber: formData.phoneNumber || undefined,
        cnic: formData.cnic || undefined,
        profileImageBase64: formData.profileImageBase64 || undefined,
        profileImageUrl: formData.profileImageUrl || undefined,
      };

      const res = await fetch('/api/employee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Failed to save employee (${res.status})`);
      }

      const data = await res.json();

      // Update employees list
      setEmployees((prev) => {
        const exists = prev.some((e) => e.empCode === data.employee.empCode);
        if (exists) {
          return prev.map((e) =>
            e.empCode === data.employee.empCode ? data.employee : e
          );
        }
        return [...prev, data.employee].sort((a, b) =>
          String(a.empCode).localeCompare(String(b.empCode))
        );
      });

      showToast('success', editingEmployee 
        ? `Employee ${data.employee.empCode} updated successfully`
        : `Employee ${data.employee.empCode} added successfully`
      );

      setIsModalOpen(false);
      setEditingEmployee(null);
      
      // Force refresh to get latest data from server (bypass cache)
      loadEmployees(true);
    } catch (err) {
      console.error(err);
      showToast('error', err.message || 'Failed to save employee');
    } finally {
      setIsSaving(false);
    }
  }

  // --- modal (full edit on click) ------------------------------------------

  async function loadShiftHistory(empCode) {
    try {
      setLoadingHistory(true);
      const res = await fetch(`/api/hr/employee-shifts?empCode=${empCode}`);
      if (res.ok) {
        const data = await res.json();
        setShiftHistory(data.history || []);
      }
    } catch (err) {
      console.error('Failed to load shift history:', err);
      setShiftHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  }

  async function autoDetectShifts(empCode) {
    try {
      setLoadingHistory(true);
      const res = await fetch('/api/hr/employee-shifts/auto-detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empCode }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        // Handle specific error cases
        if (data.error && (data.error.includes('No shifts found') || data.error.includes('shifts not found'))) {
          showToast('error', 'Shifts not found in database. Please create shifts first by visiting the Shift Management page (/hr/shifts).');
          // Optionally reload shift history to show updated state
          await loadShiftHistory(empCode);
        } else {
          showToast('error', data.error || data.message || 'Failed to auto-detect shifts');
        }
        return;
      }
      
      if (data.summary && data.summary.created > 0) {
        showToast('success', `Successfully created ${data.summary.created} shift period(s)`);
        await loadShiftHistory(empCode);
      } else if (data.summary && data.summary.exists > 0) {
        showToast('info', 'Shift history already exists for these periods');
        await loadShiftHistory(empCode);
      } else {
        showToast('warning', data.message || 'No shift history created. Check if attendance records have shift codes.');
        await loadShiftHistory(empCode);
      }
    } catch (err) {
      console.error(err);
      // Try to parse error message if it's JSON
      try {
        const errorData = JSON.parse(err.message);
        if (errorData.error) {
          showToast('error', errorData.error);
        } else {
          showToast('error', err.message || 'Failed to auto-detect shifts');
        }
      } catch {
        showToast('error', err.message || 'Failed to auto-detect shifts');
      }
    } finally {
      setLoadingHistory(false);
    }
  }

  // Open modal for editing existing employee
  function openEditModal(emp) {
    setEditingEmployee(emp);
    setIsModalOpen(true);
    setShowShiftHistory(false);
    loadShiftHistory(emp.empCode);
  }

  // Close modal
  function closeModal() {
    setIsModalOpen(false);
    setEditingEmployee(null);
    setShowShiftHistory(false);
    setShiftHistory([]);
  }


  // ------------------------------------------------------------------------

  return (
    <React.Fragment>
      <style>{`
        @media (max-width: 768px) {
          .manage-container {
            padding: 16px !important;
          }
          .manage-header {
            flex-direction: column !important;
            gap: 16px !important;
            align-items: flex-start !important;
          }
          .manage-header-logo {
            width: 40px !important;
            height: 40px !important;
          }
          .manage-header-title {
            font-size: 18px !important;
          }
          .manage-header-buttons {
            flex-direction: column !important;
            width: 100% !important;
            gap: 8px !important;
          }
          .manage-header-buttons button {
            width: 100% !important;
          }
          .manage-table-wrapper {
            overflow-x: auto !important;
            margin-left: -16px !important;
            margin-right: -16px !important;
            padding-left: 16px !important;
            padding-right: 16px !important;
          }
          .manage-table {
            min-width: 1000px !important;
            font-size: 12px !important;
          }
          .manage-table th,
          .manage-table td {
            padding: 8px 6px !important;
            font-size: 12px !important;
          }
          .manage-modal {
            width: 100% !important;
            max-width: 100% !important;
            height: 100% !important;
            max-height: 100% !important;
            margin: 0 !important;
            border-radius: 0 !important;
            padding: 20px 16px !important;
          }
          .manage-form-grid {
            grid-template-columns: 1fr !important;
            gap: 12px !important;
          }
          .manage-form-row {
            flex-direction: column !important;
            gap: 12px !important;
          }
          .manage-form-row > div {
            width: 100% !important;
            min-width: auto !important;
          }
        }
        @media (max-width: 480px) {
          .manage-container {
            padding: 12px !important;
          }
          .manage-header-title {
            font-size: 16px !important;
          }
          .manage-table {
            min-width: 900px !important;
            font-size: 11px !important;
          }
        }
      `}</style>
      <div
        className="manage-container"
        style={{
          minHeight: '100vh',
          padding: '24px 28px 32px',
          background:
            'radial-gradient(circle at top, #0b2344 0, #0a1b32 35%, #061523 100%)',
          color: '#0f172a',
        }}
      >
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @keyframes toastIn {
              from { opacity: 0; transform: translateY(10px) scale(0.97); }
              to { opacity: 1; transform: translateY(0) scale(1); }
            }
            @keyframes modalIn {
              from { opacity: 0; transform: translateY(18px) scale(0.96); }
              to { opacity: 1; transform: translateY(0) scale(1); }
            }
            @keyframes spin {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
          `,
        }}
      />

      <div
        style={{
          width: '100%',
          maxWidth: 1400,
          margin: '0 auto',
        }}
      >
        {/* Top bar with logo */}
        <div
          className="manage-header"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 18,
            padding: '14px 20px',
            borderRadius: 12,
            background:
              'linear-gradient(90deg, #0a2c54, #0f5ba5, #13a8e5)',
            color: '#f9fafb',
            boxShadow: '0 12px 28px rgba(15,23,42,0.55)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              className="manage-header-logo"
              style={{
                width: 42,
                height: 42,
                borderRadius: '999px',
                overflow: 'hidden',
                backgroundColor: 'rgba(15,23,42,0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
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
              />
            </div>
            <div>
              <div
                style={{
                  fontSize: 20,
                  fontWeight: 700,
                  letterSpacing: 0.4,
                }}
              >
                Global Digital Solutions
              </div>
              <div
                style={{
                  fontSize: 12,
                  opacity: 0.9,
                }}
              >
                Employee Shift Management Console
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <button
              onClick={() => loadEmployees(true)}
              disabled={loading}
              style={{
                padding: '8px 16px',
                borderRadius: 999,
                border: 'none',
                backgroundColor: 'rgba(15,23,42,0.28)',
                color: '#e5f2ff',
                fontSize: 13,
                fontWeight: 500,
                cursor: loading ? 'default' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              {loading ? (
                <>
                  <span
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: '999px',
                      border: '2px solid rgba(191,219,254,0.6)',
                      borderTopColor: '#ffffff',
                      animation: 'spin 0.7s linear infinite',
                    }}
                  />
                  Refreshing…
                </>
              ) : (
                <>
                  <span>⟳</span> Refresh
                </>
              )}
            </button>
            
            {/* Add Employee Button */}
            <button
              onClick={openAddModal}
              style={{
                padding: '8px 20px',
                borderRadius: 999,
                border: 'none',
                background: 'linear-gradient(135deg, #10b981, #22c55e)',
                color: '#ffffff',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                boxShadow: '0 4px 12px rgba(16, 185, 129, 0.4)',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 6px 16px rgba(16, 185, 129, 0.5)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.4)';
              }}
            >
              <span style={{ fontSize: 18 }}>+</span> Add Employee
            </button>
          </div>
        </div>

        {/* MAIN CARD */}
        <div
          style={{
            borderRadius: 16,
            backgroundColor: '#ffffff',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
            padding: '24px 28px 28px',
            border: '1px solid #e5e7eb',
          }}
        >

          {/* Existing employees table */}
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 8,
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <div>
                <h2
                  style={{
                    fontSize: 20,
                    fontWeight: 700,
                    color: '#111827',
                    marginBottom: 6,
                    letterSpacing: '-0.025em',
                  }}
                >
                  Employee Directory
                </h2>
                <p
                  style={{
                    fontSize: 13,
                    color: '#6b7280',
                    margin: 0,
                  }}
                >
                  Manage employee information, shifts, and details. Double-click a row or click{' '}
                  <span style={{ color: '#0ea5e9', fontWeight: 600 }}>Edit</span> to open full details.
                </p>
              </div>
              <EmployeeFilters
                searchQuery={searchQuery}
                onSearchChange={(value) => {
                  setSearchQuery(value);
                  setCurrentPage(1);
                }}
              />
            </div>

            <EmployeeTable
              employees={employees}
              shifts={shifts}
              loading={loading}
              savingId={savingId}
              onShiftChange={handleShiftChange}
              onEdit={openEditModal}
              onSave={handleSaveRow}
              onDelete={(emp) => setDeleteConfirm({ isOpen: true, employee: emp })}
            />

            <PaginationControls
              currentPage={currentPage}
              totalPages={pagination.totalPages}
              totalItems={pagination.total}
              itemsPerPage={pagination.limit}
              onPageChange={setCurrentPage}
              loading={loading}
            />
          </div>
        </div>
      </div>
      </div>

      {/* Professional Toast Notification */}
      <Toast
        type={toast.type}
        message={toast.text}
        onClose={() => setToast({ type: '', text: '' })}
      />

      {/* Professional Modal for Add/Edit Employee */}
      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editingEmployee ? 'Edit Employee' : 'Add New Employee'}
        size="lg"
      >
        <EmployeeForm
          employee={editingEmployee}
          shifts={shifts}
          onSubmit={handleFormSubmit}
          onCancel={closeModal}
          loading={isSaving}
        />
      </Modal>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        onClose={() => setDeleteConfirm({ isOpen: false, employee: null })}
        onConfirm={async () => {
          if (!deleteConfirm.employee) return;

          try {
            const empCode = deleteConfirm.employee.empCode;
            const res = await fetch(`/api/employee?empCode=${empCode}`, {
              method: 'DELETE',
            });

            if (!res.ok) {
              const text = await res.text();
              throw new Error(text || `Failed to delete employee (${res.status})`);
            }

            // Remove from local state
            setEmployees((prev) => prev.filter((e) => e.empCode !== empCode));

            showToast('success', `Employee ${empCode} deleted successfully`);
            setDeleteConfirm({ isOpen: false, employee: null });
            
            // Force refresh to get latest data from server (bypass cache)
            loadEmployees(true);
          } catch (err) {
            console.error(err);
            showToast('error', err.message || 'Failed to delete employee');
          }
        }}
        title="Delete Employee"
        message={`Are you sure you want to delete employee ${deleteConfirm.employee?.empCode} (${deleteConfirm.employee?.name || 'No name'})? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
      />
    </React.Fragment>
  );
}

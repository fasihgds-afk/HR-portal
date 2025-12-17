// next-app/app/hr/employees/page.jsx
'use client';

import { useEffect, useState } from 'react';

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
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState(null);

  const [toast, setToast] = useState({ type: '', text: '' });

  const [modalOpen, setModalOpen] = useState(false);
  const [modalEmp, setModalEmp] = useState(null);

  const [newEmp, setNewEmp] = useState({
    empCode: '',
    name: '',
    email: '',
    monthlySalary: '',
    shift: 'D1',
    department: '',
    designation: '',
    phoneNumber: '',
    cnic: '',
    profileImageBase64: '',
    profileImageUrl: '',
  });

  // --- helpers --------------------------------------------------------------

  function showToast(type, text) {
    setToast({ type, text });
    setTimeout(() => {
      setToast((t) => (t.text === text ? { type: '', text: '' } : t));
    }, 2600);
  }

  async function loadEmployees() {
    setLoading(true);

    try {
      const res = await fetch('/api/employee');
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Failed to load employees (${res.status})`);
      }
      const data = await res.json();
      setEmployees(data.items || []);
    } catch (err) {
      console.error(err);
      showToast('error', err.message || 'Failed to load employees');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadEmployees();
  }, []);

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

      const res = await fetch('/api/employee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empCode: emp.empCode,
          name: emp.name,
          email: emp.email,
          monthlySalary: emp.monthlySalary,
          shift: emp.shift || 'D1',
          department: emp.department,
          designation: emp.designation,
          phoneNumber: emp.phoneNumber,
          cnic: emp.cnic,
          profileImageBase64: emp.profileImageBase64,
          profileImageUrl: emp.profileImageUrl,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Failed to save employee (${res.status})`);
      }

      const data = await res.json();

      setEmployees((prev) =>
        prev.map((e) =>
          e.empCode === data.employee.empCode ? data.employee : e
        )
      );

      showToast(
        'success',
        `Saved ${data.employee.empCode} (${data.employee.name || 'No name'})`
      );
    } catch (err) {
      console.error(err);
      showToast('error', err.message || 'Failed to save employee');
    } finally {
      setSavingId(null);
    }
  }

  function handleNewEmpChange(field, value) {
    setNewEmp((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  async function handleAddOrUpdateEmployee() {
    try {
      if (!newEmp.empCode.trim()) {
        showToast('error', 'Emp Code is required');
        return;
      }

      const body = {
        empCode: newEmp.empCode.trim(),
        name: newEmp.name || undefined,
        email: newEmp.email || undefined,
        monthlySalary:
          newEmp.monthlySalary !== ''
            ? Number(newEmp.monthlySalary)
            : undefined,
        shift: newEmp.shift || 'D1',
        department: newEmp.department || undefined,
        designation: newEmp.designation || undefined,
        phoneNumber: newEmp.phoneNumber || undefined,
        cnic: newEmp.cnic || undefined,
        profileImageBase64: newEmp.profileImageBase64 || undefined,
        profileImageUrl: newEmp.profileImageUrl || undefined,
      };

      const res = await fetch('/api/employee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Failed to add/update employee (${res.status})`);
      }

      const data = await res.json();

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

      showToast(
        'success',
        `Employee ${data.employee.empCode} saved (shift ${data.employee.shift})`
      );

      setNewEmp({
        empCode: '',
        name: '',
        email: '',
        monthlySalary: '',
        shift: 'D1',
        department: '',
        designation: '',
        phoneNumber: '',
        cnic: '',
        profileImageBase64: '',
        profileImageUrl: '',
      });
    } catch (err) {
      console.error(err);
      showToast('error', err.message || 'Failed to add/update employee');
    }
  }

  // --- modal (full edit on click) ------------------------------------------

  function openEditModal(emp) {
    setModalEmp({
      empCode: emp.empCode,
      name: emp.name || '',
      email: emp.email || '',
      monthlySalary:
        emp.monthlySalary != null ? String(emp.monthlySalary) : '',
      shift: emp.shift || 'D1',
      department: emp.department || '',
      designation: emp.designation || '',
      phoneNumber: emp.phoneNumber || '',
      cnic: emp.cnic || '',
      profileImageBase64: emp.profileImageBase64 || '',
      profileImageUrl: emp.profileImageUrl || '',
    });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setModalEmp(null);
  }

  // convert selected file to base64 and store in modalEmp
  function handleModalImageChange(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    if (file.size > 1024 * 1024) {
      showToast('error', 'Image too large. Please use a file under 1MB.');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        setModalEmp((prev) => ({
          ...prev,
          profileImageBase64: result,
          profileImageUrl: result, // use same base64 as src
        }));
      }
    };
    reader.readAsDataURL(file);
  }

  async function handleModalSave() {
    if (!modalEmp) return;

    try {
      const res = await fetch('/api/employee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empCode: modalEmp.empCode,
          name: modalEmp.name,
          email: modalEmp.email,
          monthlySalary:
            modalEmp.monthlySalary !== ''
              ? Number(modalEmp.monthlySalary)
              : undefined,
          shift: modalEmp.shift || 'D1',
          department: modalEmp.department,
          designation: modalEmp.designation,
          phoneNumber: modalEmp.phoneNumber,
          cnic: modalEmp.cnic,
          profileImageBase64: modalEmp.profileImageBase64 || undefined,
          profileImageUrl: modalEmp.profileImageUrl || undefined,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Failed to save employee (${res.status})`);
      }

      const data = await res.json();

      setEmployees((prev) =>
        prev.map((e) =>
          e.empCode === data.employee.empCode ? data.employee : e
        )
      );

      showToast(
        'success',
        `Updated ${data.employee.empCode} (${data.employee.name || 'No name'})`
      );
      closeModal();
    } catch (err) {
      console.error(err);
      showToast('error', err.message || 'Failed to save employee');
    }
  }

  // small helper for avatar
  function renderAvatar(emp) {
    const src = emp.profileImageUrl || emp.profileImageBase64 || '';
    const initials =
      (emp.name || '')
        .split(' ')
        .map((p) => p[0])
        .join('')
        .slice(0, 2)
        .toUpperCase() || '?';

    if (src) {
      return (
        <img
          src={src}
          alt={emp.name || emp.empCode}
          style={{
            width: 32,
            height: 32,
            borderRadius: '999px',
            objectFit: 'cover',
            border: '1px solid #e5e7eb',
          }}
        />
      );
    }

    return (
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: '999px',
          background:
            'linear-gradient(135deg, #2563eb, #38bdf8)',
          color: '#f9fafb',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        {initials}
      </div>
    );
  }

  // ------------------------------------------------------------------------

  return (
    <div
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

          <button
            onClick={loadEmployees}
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
        </div>

        {/* MAIN CARD */}
        <div
          style={{
            borderRadius: 14,
            backgroundColor: '#f3f6fb',
            boxShadow: '0 16px 34px rgba(15,23,42,0.45)',
            padding: '18px 20px 20px',
          }}
        >
          {/* Add / Update section */}
          <div style={{ marginBottom: 18 }}>
            <h2
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: '#0f172a',
                marginBottom: 4,
              }}
            >
              Add / Update Employee
            </h2>
            <p
              style={{
                fontSize: 12,
                color: '#4b5563',
                marginBottom: 12,
              }}
            >
              HR can create a new employee or update an existing one. Shift
              options:&nbsp;
              <strong>D1</strong> (09:00–18:00),&nbsp;
              <strong>D2</strong> (15:00–24:00),&nbsp;
              <strong>S1</strong> (18:00–03:00),&nbsp;
              <strong>S2</strong> (21:00–06:00).
            </p>

            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 12,
                alignItems: 'flex-end',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label
                  style={{ fontSize: 11, fontWeight: 600, color: '#111827' }}
                >
                  Emp Code *
                </label>
                <input
                  style={{ ...inputStyle, minWidth: 120 }}
                  value={newEmp.empCode}
                  onChange={(e) =>
                    handleNewEmpChange('empCode', e.target.value.trim())
                  }
                  placeholder="e.g. 125723"
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label
                  style={{ fontSize: 11, fontWeight: 600, color: '#111827' }}
                >
                  Name
                </label>
                <input
                  style={{ ...inputStyle, minWidth: 160 }}
                  value={newEmp.name}
                  onChange={(e) =>
                    handleNewEmpChange('name', e.target.value)
                  }
                  placeholder="Employee name"
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label
                  style={{ fontSize: 11, fontWeight: 600, color: '#111827' }}
                >
                  Phone Number
                </label>
                <input
                  style={{ ...inputStyle, minWidth: 150 }}
                  value={newEmp.phoneNumber}
                  onChange={(e) =>
                    handleNewEmpChange('phoneNumber', e.target.value)
                  }
                  placeholder="03XXXXXXXXX"
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label
                  style={{ fontSize: 11, fontWeight: 600, color: '#111827' }}
                >
                  CNIC
                </label>
                <input
                  style={{ ...inputStyle, minWidth: 150 }}
                  value={newEmp.cnic}
                  onChange={(e) =>
                    handleNewEmpChange('cnic', e.target.value)
                  }
                  placeholder="XXXXX-XXXXXXX-X"
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label
                  style={{ fontSize: 11, fontWeight: 600, color: '#111827' }}
                >
                  Department
                </label>
                <input
                  style={{ ...inputStyle, minWidth: 150 }}
                  value={newEmp.department}
                  onChange={(e) =>
                    handleNewEmpChange('department', e.target.value)
                  }
                  placeholder="e.g. IT, HR"
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label
                  style={{ fontSize: 11, fontWeight: 600, color: '#111827' }}
                >
                  Designation
                </label>
                <input
                  style={{ ...inputStyle, minWidth: 150 }}
                  value={newEmp.designation}
                  onChange={(e) =>
                    handleNewEmpChange('designation', e.target.value)
                  }
                  placeholder="e.g. Manager"
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label
                  style={{ fontSize: 11, fontWeight: 600, color: '#111827' }}
                >
                  Email
                </label>
                <input
                  style={{ ...inputStyle, minWidth: 220 }}
                  value={newEmp.email}
                  onChange={(e) =>
                    handleNewEmpChange('email', e.target.value)
                  }
                  placeholder="email@example.com"
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label
                  style={{ fontSize: 11, fontWeight: 600, color: '#111827' }}
                >
                  Monthly Salary
                </label>
                <input
                  type="number"
                  style={{ ...inputStyle, minWidth: 130 }}
                  value={newEmp.monthlySalary}
                  onChange={(e) =>
                    handleNewEmpChange('monthlySalary', e.target.value)
                  }
                  placeholder="e.g. 45000"
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label
                  style={{ fontSize: 11, fontWeight: 600, color: '#111827' }}
                >
                  Shift
                </label>
                <select
                  style={selectStyle}
                  value={newEmp.shift}
                  onChange={(e) => handleNewEmpChange('shift', e.target.value)}
                >
                  <option value="D1">D1 – Shift 1 (09–18)</option>
                  <option value="D2">D2 – Shift 2 (15–24)</option>
                  <option value="D3">D3 – Shift 5 (12–21)</option>
                  <option value="S1">S1 – Shift 3 (18–03)</option>
                  <option value="S2">S2 – Shift 4 (21–06)</option>
                </select>
              </div>

              <button
                onClick={handleAddOrUpdateEmployee}
                style={{
                  padding: '9px 20px',
                  borderRadius: 999,
                  border: 'none',
                  background:
                    'linear-gradient(135deg, #10b981, #22c55e, #2dd4bf)',
                  color: '#022c22',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer',
                  boxShadow: '0 10px 24px rgba(16,185,129,0.4)',
                }}
              >
                Save Employee
              </button>
            </div>
          </div>

          {/* Divider */}
          <div
            style={{
              height: 1,
              background:
                'linear-gradient(90deg, transparent, #cbd5f5, transparent)',
              margin: '4px 0 10px',
            }}
          />

          {/* Existing employees table */}
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 8,
              }}
            >
              <div>
                <h2
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: '#0f172a',
                    marginBottom: 2,
                  }}
                >
                  Existing Employees
                </h2>
                <p
                  style={{
                    fontSize: 11,
                    color: '#6b7280',
                  }}
                >
                  Double-click a row or click{' '}
                  <span style={{ color: '#0f766e' }}>Edit</span> to open full
                  details.
                </p>
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table
                style={{
                  width: '100%',
                  minWidth: 1150,
                  borderCollapse: 'collapse',
                  borderRadius: 10,
                  overflow: 'hidden',
                }}
              >
                <thead>
                  <tr>
                    <th style={{ ...thStyle, width: 60 }}>Avatar</th>
                    <th style={thStyle}>Emp Code</th>
                    <th style={thStyle}>Name</th>
                    <th style={thStyle}>Department</th>
                    <th style={thStyle}>Designation</th>
                    <th style={thStyle}>Phone</th>
                    <th style={thStyle}>CNIC</th>
                    <th style={thStyle}>Email</th>
                    <th style={thStyle}>Monthly Salary</th>
                    <th style={thStyle}>Shift</th>
                    <th style={thStyle}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.length === 0 ? (
                    <tr>
                      <td
                        colSpan={11}
                        style={{
                          ...tdStyle,
                          textAlign: 'center',
                          color: '#6b7280',
                          backgroundColor: '#f9fafb',
                          padding: '14px 12px',
                        }}
                      >
                        {loading
                          ? 'Loading employees…'
                          : 'No employees found.'}
                      </td>
                    </tr>
                  ) : (
                    employees.map((emp, idx) => (
                      <tr
                        key={emp._id || emp.empCode}
                        onDoubleClick={() => openEditModal(emp)}
                        style={{
                          cursor: 'pointer',
                          backgroundColor:
                            idx % 2 === 0 ? '#ffffff' : '#f3f4ff',
                        }}
                      >
                        <td style={{ ...tdStyle, width: 60 }}>
                          {renderAvatar(emp)}
                        </td>
                        <td style={tdStyle}>{emp.empCode}</td>
                        <td style={tdStyle}>{emp.name || '-'}</td>
                        <td style={tdStyle}>{emp.department || '-'}</td>
                        <td style={tdStyle}>{emp.designation || '-'}</td>
                        <td style={tdStyle}>{emp.phoneNumber || '-'}</td>
                        <td style={tdStyle}>{emp.cnic || '-'}</td>
                        <td style={tdStyle}>{emp.email || '-'}</td>
                        <td style={tdStyle}>
                          {emp.monthlySalary != null ? emp.monthlySalary : '-'}
                        </td>
                        <td style={tdStyle}>
                          <select
                            style={selectStyle}
                            value={emp.shift || 'D1'}
                            onChange={(e) =>
                              handleShiftChange(idx, e.target.value)
                            }
                            onClick={(e) => e.stopPropagation()}
                          >
                            <option value="D1">D1 – Day (09–18)</option>
                            <option value="D2">D2 – Day 2 (15–24)</option>
                            <option value="D3">D3 – Shift 5 (12–21)</option>
                            <option value="S1">S1 – Night 1 (18–03)</option>
                            <option value="S2">S2 – Night 2 (21–06)</option>
                          </select>
                        </td>
                        <td style={tdStyle}>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openEditModal(emp);
                              }}
                              style={{
                                padding: '5px 10px',
                                borderRadius: 999,
                                border: 'none',
                                backgroundColor: '#0ea5e9',
                                color: '#f9fafb',
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: 'pointer',
                              }}
                            >
                              Edit
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSaveRow(emp);
                              }}
                              disabled={
                                savingId === (emp._id || emp.empCode)
                              }
                              style={{
                                padding: '5px 10px',
                                borderRadius: 999,
                                border: 'none',
                                backgroundColor: '#2563eb',
                                color: '#f9fafb',
                                fontSize: 12,
                                fontWeight: 600,
                                cursor:
                                  savingId === (emp._id || emp.empCode)
                                    ? 'default'
                                    : 'pointer',
                                opacity:
                                  savingId === (emp._id || emp.empCode)
                                    ? 0.7
                                    : 1,
                              }}
                            >
                              {savingId === (emp._id || emp.empCode)
                                ? 'Saving…'
                                : 'Save'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Toast popup */}
      {toast.text && (
        <div
          style={{
            position: 'fixed',
            right: 18,
            bottom: 20,
            padding: '10px 14px',
            borderRadius: 12,
            backgroundColor:
              toast.type === 'error'
                ? 'rgba(248,113,113,0.12)'
                : 'rgba(16,185,129,0.14)',
            border:
              toast.type === 'error'
                ? '1px solid rgba(220,38,38,0.6)'
                : '1px solid rgba(16,185,129,0.7)',
            color: toast.type === 'error' ? '#b91c1c' : '#065f46',
            fontSize: 13,
            boxShadow: '0 12px 24px rgba(15,23,42,0.6)',
            backdropFilter: 'blur(10px)',
            animation: 'toastIn 0.2s ease-out',
            maxWidth: 320,
            backgroundClip: 'padding-box',
            zIndex: 60,
          }}
        >
          {toast.text}
        </div>
      )}

      {/* Edit modal */}
      {modalOpen && modalEmp && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15,23,42,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
          }}
          onClick={closeModal}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 860,
              borderRadius: 20,
              backgroundColor: '#f9fafb',
              border: '1px solid #bfdbfe',
              boxShadow: '0 24px 60px rgba(15,23,42,0.6)',
              padding: '18px 22px 18px',
              animation: 'modalIn 0.22s ease-out',
              color: '#0f172a',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {renderAvatar(modalEmp)}
                <div>
                  <h3
                    style={{
                      fontSize: 18,
                      fontWeight: 700,
                    }}
                  >
                    Edit Employee
                  </h3>
                  <p
                    style={{
                      fontSize: 11,
                      color: '#6b7280',
                    }}
                  >
                    Emp Code: <strong>{modalEmp.empCode}</strong>
                  </p>
                </div>
              </div>
              <button
                onClick={closeModal}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: '#9ca3af',
                  fontSize: 18,
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>

            {/* Scrollable body */}
            <div
              style={{
                overflowY: 'auto',
                paddingRight: 4,
              }}
            >
              {/* Profile image upload */}
              <div
                style={{
                  marginBottom: 12,
                  padding: '10px 12px',
                  borderRadius: 12,
                  backgroundColor: '#eff6ff',
                  border: '1px dashed #bfdbfe',
                }}
              >
                <label
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    display: 'block',
                    marginBottom: 4,
                  }}
                >
                  Profile Photo
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleModalImageChange}
                  style={{
                    fontSize: 12,
                    marginBottom: 4,
                  }}
                />
                <div
                  style={{
                    fontSize: 11,
                    color: '#6b7280',
                  }}
                >
                  Recommended: square image, clear face, under 1MB.
                </div>
                {modalEmp.profileImageBase64 && (
                  <div
                    style={{
                      marginTop: 4,
                      fontSize: 11,
                      color: '#16a34a',
                      fontWeight: 600,
                    }}
                  >
                    Photo attached
                  </div>
                )}
              </div>

              {/* Form fields grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 12,
                  marginBottom: 10,
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 11, fontWeight: 600 }}>Name</label>
                  <input
                    style={inputStyle}
                    value={modalEmp.name}
                    onChange={(e) =>
                      setModalEmp((prev) => ({
                        ...prev,
                        name: e.target.value,
                      }))
                    }
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 11, fontWeight: 600 }}>
                    Department
                  </label>
                  <input
                    style={inputStyle}
                    value={modalEmp.department}
                    onChange={(e) =>
                      setModalEmp((prev) => ({
                        ...prev,
                        department: e.target.value,
                      }))
                    }
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 11, fontWeight: 600 }}>
                    Designation
                  </label>
                  <input
                    style={inputStyle}
                    value={modalEmp.designation}
                    onChange={(e) =>
                      setModalEmp((prev) => ({
                        ...prev,
                        designation: e.target.value,
                      }))
                    }
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 11, fontWeight: 600 }}>Email</label>
                  <input
                    style={inputStyle}
                    value={modalEmp.email}
                    onChange={(e) =>
                      setModalEmp((prev) => ({
                        ...prev,
                        email: e.target.value,
                      }))
                    }
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 11, fontWeight: 600 }}>Phone</label>
                  <input
                    style={inputStyle}
                    value={modalEmp.phoneNumber}
                    onChange={(e) =>
                      setModalEmp((prev) => ({
                        ...prev,
                        phoneNumber: e.target.value,
                      }))
                    }
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 11, fontWeight: 600 }}>CNIC</label>
                  <input
                    style={inputStyle}
                    value={modalEmp.cnic}
                    onChange={(e) =>
                      setModalEmp((prev) => ({
                        ...prev,
                        cnic: e.target.value,
                      }))
                    }
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 11, fontWeight: 600 }}>
                    Monthly Salary
                  </label>
                  <input
                    type="number"
                    style={inputStyle}
                    value={modalEmp.monthlySalary}
                    onChange={(e) =>
                      setModalEmp((prev) => ({
                        ...prev,
                        monthlySalary: e.target.value,
                      }))
                    }
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 11, fontWeight: 600 }}>Shift</label>
                  <select
                    style={selectStyle}
                    value={modalEmp.shift}
                    onChange={(e) =>
                      setModalEmp((prev) => ({
                        ...prev,
                        shift: e.target.value,
                      }))
                    }
                  >
                    <option value="D1">D1 – Day (09–18)</option>
                    <option value="D2">D2 – Day 2 (15–24)</option>
                    <option value="D3">D3 – Shift 5 (12–21)</option>
                    <option value="S1">S1 – Night 1 (18–03)</option>
                    <option value="S2">S2 – Night 2 (21–06)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Footer buttons */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 8,
                marginTop: 10,
              }}
            >
              <button
                onClick={closeModal}
                style={{
                  padding: '7px 14px',
                  borderRadius: 999,
                  border: '1px solid #d1d5db',
                  backgroundColor: 'transparent',
                  color: '#374151',
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleModalSave}
                style={{
                  padding: '7px 16px',
                  borderRadius: 999,
                  border: 'none',
                  background:
                    'linear-gradient(135deg,#2563eb,#38bdf8,#22c55e)',
                  color: '#f9fafb',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer',
                  boxShadow: '0 10px 24px rgba(37,99,235,0.4)',
                }}
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

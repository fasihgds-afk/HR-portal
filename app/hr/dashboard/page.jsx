// next-app/app/hr/dashboard/page.jsx
'use client';

import { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';

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

// Time-only formatter for Check In / Check Out
function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export default function HrDashboardPage() {
  const [businessDate, setBusinessDate] = useState(() => {
    const today = new Date();
    return today.toISOString().slice(0, 10); // YYYY-MM-DD
  });
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [shifts, setShifts] = useState([]);
  const [selectedShift, setSelectedShift] = useState(''); // Filter by shift

  const [toast, setToast] = useState({ type: '', text: '' });

  function showToast(type, text) {
    setToast({ type, text });
    setTimeout(() => {
      setToast((prev) => (prev.text === text ? { type: '', text: '' } : prev));
    }, 2600);
  }

  async function loadShifts() {
    try {
      const res = await fetch('/api/hr/shifts?activeOnly=true');
      if (res.ok) {
        const data = await res.json();
        setShifts(data.shifts || []);
      }
    } catch (err) {
      console.error('Failed to load shifts:', err);
    }
  }

  useEffect(() => {
    loadShifts();
  }, []);

  async function handleLoadAndSave() {
    setLoading(true);
    setStatus('');
    setRows([]);

    try {
      const res = await fetch(
        `/api/hr/daily-attendance?date=${businessDate}`,
        { method: 'POST' }
      );

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Request failed: ${res.status}`);
      }

      const data = await res.json();
      setRows(data.items || []);
      const msg = `Saved ${data.savedCount ?? data.items?.length ?? 0} record(s) for ${data.date}`;
      setStatus(msg);
      showToast('success', msg);
    } catch (err) {
      console.error(err);
      showToast('error', err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  // ---------- summary counts by shift (only Present) ----------
  const totals = rows.reduce(
    (acc, r) => {
      const isPresent =
        (r.attendanceStatus && r.attendanceStatus === 'Present') ||
        (r.totalPunches && r.totalPunches > 0);

      if (isPresent && r.shift) {
        acc[r.shift] = (acc[r.shift] || 0) + 1;
      }
      return acc;
    },
    {}
  );

  // Extra lightweight stats (UI only)
  const presentCount = rows.reduce((count, r) => {
    const isPresent =
      (r.attendanceStatus && r.attendanceStatus === 'Present') ||
      (r.totalPunches && r.totalPunches > 0);
    return isPresent ? count + 1 : count;
  }, 0);

  const totalRecords = rows.length;
  const absentCount = totalRecords - presentCount;
  const departmentCount = new Set(
    rows.map((r) => r.department || 'Unassigned')
  ).size;

  // ---------- SEARCH FILTER (table only, stats still use full rows) ----------
  const normalizedSearch = searchQuery.trim().toLowerCase();

  const filteredRows = rows.filter((r) => {
    // Shift filter
    if (selectedShift && r.shift !== selectedShift) {
      return false;
    }
    
    // Search filter
    if (normalizedSearch) {
      const text = [
        r.empCode,
        r.employeeName,
        r.name,
        r.department,
        r.designation,
        r.shift,
        r.attendanceStatus,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return text.includes(normalizedSearch);
    }
    
    return true;
  });

  // ---------- Department ordering & manager / TL on top ----------

  const DEPARTMENT_ORDER = [
    'Youtube',
    'IT',
    'Marketing & SEO',
    'Development',
    'Lead Qualification',
    'RND',
    'Sales',
    'Writing',
    'Quality Assurance',
  ];

  const deptPriority = DEPARTMENT_ORDER.reduce((acc, name, idx) => {
    acc[name] = idx;
    return acc;
  }, {});

  // group filtered rows by department
  const groupedByDept = filteredRows.reduce((acc, row) => {
    const dept = row.department || 'Unassigned';
    if (!acc[dept]) acc[dept] = [];
    acc[dept].push(row);
    return acc;
  }, {});

  const rowsWithHeaders = [];

  const sortedDeptNames = Object.keys(groupedByDept).sort((a, b) => {
    const pa = deptPriority[a] ?? 999;
    const pb = deptPriority[b] ?? 999;
    if (pa !== pb) return pa - pb;
    return a.localeCompare(b);
  });

  const getDesignationRank = (designation = '') => {
    const d = designation.toLowerCase();
    if (d.includes('manager')) return 0;
    if (d.includes('team lead')) return 1;
    return 2;
  };

  sortedDeptNames.forEach((dept) => {
    rowsWithHeaders.push({
      _type: 'deptHeader',
      department: dept,
    });

    const employees = groupedByDept[dept].slice().sort((a, b) => {
      const ra = getDesignationRank(a.designation || '');
      const rb = getDesignationRank(b.designation || '');
      if (ra !== rb) return ra - rb;
      return String(a.empCode).localeCompare(String(b.empCode));
    });

    rowsWithHeaders.push(...employees);
  });

  // ---------- EXPORT TO EXCEL (current filtered view) ----------
    // ---------- EXPORT TO EXCEL (current filtered view) ----------
  async function handleExportExcel() {
    const dataRows = rowsWithHeaders.filter((r) => !r._type);
    if (!dataRows.length) {
      showToast('error', 'No data to export for this date / filter.');
      return;
    }

    try {
      const workbook = new ExcelJS.Workbook();

      // Workbook properties (nice touch)
      workbook.creator = 'Global Digital Solutions';
      workbook.lastModifiedBy = 'Global Digital Solutions';
      workbook.created = new Date();
      workbook.modified = new Date();

      const sheet = workbook.addWorksheet('Attendance', {
        views: [{ state: 'frozen', ySplit: 4 }],
      });

      // --------- Column setup (keys are for row.add) ----------
      sheet.columns = [
        { header: 'Emp Code',    key: 'empCode',       width: 12 },
        { header: 'Name',        key: 'name',          width: 24 },
        { header: 'Department',  key: 'department',    width: 20 },
        { header: 'Designation', key: 'designation',   width: 20 },
        { header: 'Shift',       key: 'shift',         width: 10 },
        { header: 'Status',      key: 'status',        width: 12 },
        { header: 'Check In',    key: 'checkIn',       width: 16 },
        { header: 'Check Out',   key: 'checkOut',      width: 16 },
        { header: 'Total Punches', key: 'totalPunches', width: 14 },
      ];

      // --------- Title Row (A1:I1 merged) ----------
      sheet.mergeCells('A1:I1');
      const titleCell = sheet.getCell('A1');
      titleCell.value = `Global Digital Solutions — Attendance Report (${businessDate})`;
      titleCell.font = {
        name: 'Calibri',
        size: 16,
        bold: true,
        color: { argb: 'FFFFFFFF' },
      };
      titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
      titleCell.fill = {
        type: 'gradient',
        gradient: 'angle',
        degree: 45,
        stops: [
          { position: 0, color: { argb: 'FF142657' } }, // dark blue
          { position: 1, color: { argb: 'FF58D34D' } }, // green
        ],
      };
      sheet.getRow(1).height = 26;

      // --------- Subtitle Row (A2:I2 merged) ----------
      sheet.mergeCells('A2:I2');
      const subtitleCell = sheet.getCell('A2');
      subtitleCell.value = `Business Date: ${businessDate}  •  Generated: ${new Date().toLocaleString()}`;
      subtitleCell.font = {
        name: 'Calibri',
        size: 11,
        italic: true,
        color: { argb: 'FFE5E7EB' },
      };
      subtitleCell.alignment = { vertical: 'middle', horizontal: 'center' };
      subtitleCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF0F172A' },
      };
      sheet.getRow(2).height = 18;

      // empty spacer row
      sheet.getRow(3).height = 6;

      // --------- Header Row (row 4) ----------
      const headerRow = sheet.getRow(4);
      headerRow.values = [
        'Emp Code',
        'Name',
        'Department',
        'Designation',
        'Shift',
        'Status',
        'Check In',
        'Check Out',
        'Total Punches',
      ];

      headerRow.eachCell((cell) => {
        cell.font = {
          name: 'Calibri',
          size: 11,
          bold: true,
          color: { argb: 'FFFFFFFF' },
        };
        cell.alignment = {
          vertical: 'middle',
          horizontal: 'center',
          wrapText: true,
        };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF0C225C' }, // deep blue
        };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF0F172A' } },
          left: { style: 'thin', color: { argb: 'FF0F172A' } },
          bottom: { style: 'thin', color: { argb: 'FF0F172A' } },
          right: { style: 'thin', color: { argb: 'FF0F172A' } },
        };
      });
      headerRow.height = 20;

      // --------- Data Rows (row 5 onwards) ----------
      let excelRowIndex = 5;
      dataRows.forEach((r, i) => {
        const statusText =
          (r.attendanceStatus && r.attendanceStatus) ||
          (r.totalPunches && r.totalPunches > 0 ? 'Present' : 'Absent');

        const row = sheet.addRow({
          empCode: r.empCode || '',
          name: r.employeeName || r.name || '',
          department: r.department || '',
          designation: r.designation || '',
          shift: r.shift || '',
          status: statusText,
          checkIn: formatDateTime(r.checkIn),
          checkOut: formatDateTime(r.checkOut),
          totalPunches: r.totalPunches ?? 0,
        });

        // Zebra stripe background
        const isEven = i % 2 === 0;
        row.eachCell((cell) => {
          cell.font = {
            name: 'Calibri',
            size: 11,
            color: { argb: 'FF0F172A' },
          };
          cell.alignment = {
            vertical: 'middle',
            horizontal:
              cell.col === 9 ? 'center' : 'left', // punches centered
            wrapText: true,
          };
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: {
              argb: isEven ? 'FFF9FAFB' : 'FFE5E7FF', // light stripes
            },
          };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
            left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
            bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
            right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          };
        });

        // Status cell green / red pill
        const statusCell = row.getCell(6);
        if (statusText === 'Present') {
          statusCell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFDCFCE7' },
          };
          statusCell.font = {
            name: 'Calibri',
            size: 11,
            bold: true,
            color: { argb: 'FF166534' },
          };
        } else {
          statusCell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFEE2E2' },
          };
          statusCell.font = {
            name: 'Calibri',
            size: 11,
            bold: true,
            color: { argb: 'FF991B1B' },
          };
        }

        row.height = 18;
        excelRowIndex++;
      });

      // --------- Thin border around full used range ----------
      const lastRow = sheet.lastRow.number;
      const lastCol = sheet.columnCount;
      for (let r = 4; r <= lastRow; r++) {
        for (let c = 1; c <= lastCol; c++) {
          const cell = sheet.getCell(r, c);
          cell.border = {
            top: cell.border.top || { style: 'thin', color: { argb: 'FFE5E7EB' } },
            left: cell.border.left || { style: 'thin', color: { argb: 'FFE5E7EB' } },
            bottom: cell.border.bottom || { style: 'thin', color: { argb: 'FFE5E7EB' } },
            right: cell.border.right || { style: 'thin', color: { argb: 'FFE5E7EB' } },
          };
        }
      }

      // --------- Generate file in browser ----------
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      const fileName = `GDS_Attendance_${businessDate}.xlsx`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      showToast('success', `Excel exported: ${fileName}`);
    } catch (err) {
      console.error('Excel export error:', err);
      showToast('error', 'Failed to generate Excel file.');
    }
  }


  // ----------------------------------------------------------------

  return (
    <div
      style={{
        minHeight: '100vh',
        padding: '24px 28px 32px',
        background:
          'linear-gradient(135deg, #0F162A, #0c225cff, #58D34D)',
        color: '#0f172a',
        fontFamily:
          'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
      className="daily-page-container"
    >
      <style
        dangerouslySetInnerHTML={{
          __html: `
          @keyframes toastIn {
            from { opacity: 0; transform: translateY(10px) scale(0.97); }
            to { opacity: 1; transform: translateY(0) scale(1); }
          }
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          .hr-att-table tbody tr.data-row:hover td {
            background-color: #e0edff;
          }
          
          /* Mobile Responsive Styles */
          @media (max-width: 768px) {
            .daily-page-container {
              padding: 16px !important;
            }
            .daily-header {
              flex-direction: column !important;
              align-items: flex-start !important;
              gap: 16px !important;
              padding: 16px !important;
            }
            .daily-header-logo {
              width: 60px !important;
              height: 60px !important;
            }
            .daily-header-title {
              font-size: 18px !important;
            }
            .daily-controls {
              flex-direction: column !important;
              align-items: stretch !important;
            }
            .daily-controls > div {
              width: 100% !important;
            }
            .daily-controls input[type="date"] {
              width: 100% !important;
              min-width: auto !important;
            }
            .daily-table-wrapper {
              overflow-x: auto !important;
              -webkit-overflow-scrolling: touch !important;
              margin-left: -16px !important;
              margin-right: -16px !important;
              padding-left: 16px !important;
              padding-right: 16px !important;
            }
            .daily-table {
              min-width: 800px !important;
              font-size: 12px !important;
            }
            .daily-table th,
            .daily-table td {
              padding: 6px 8px !important;
            }
            .daily-main-card {
              padding: 12px !important;
            }
            .daily-legend {
              font-size: 11px !important;
              padding: 8px 10px !important;
            }
            .daily-stats-strip {
              flex-direction: column !important;
              gap: 6px !important;
            }
            .daily-stats-strip > div {
              width: 100% !important;
            }
            .daily-search-export {
              flex-direction: column !important;
              gap: 10px !important;
            }
            .daily-search-export > div {
              width: 100% !important;
              min-width: auto !important;
            }
            .daily-search-export input {
              width: 100% !important;
              min-width: auto !important;
            }
            .daily-search-export button {
              width: 100% !important;
            }
          }
          @media (max-width: 480px) {
            .daily-page-container {
              padding: 12px !important;
            }
            .daily-header-title {
              font-size: 16px !important;
            }
            .daily-table {
              min-width: 700px !important;
              font-size: 11px !important;
            }
            .daily-table th,
            .daily-table td {
              padding: 4px 6px !important;
            }
          }
        `,
        }}
      />

      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        {/* Brand header bar with logo */}
        <div
          className="daily-header"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 18,
            padding: '16px 22px',
            borderRadius: 14,
            background:
              'linear-gradient(120deg, #142657ff, #0c225cff, #58D34D)',
            color: '#f9fafb',
            boxShadow: '0 12px 28px rgba(15,23,42,0.55)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <div
              className="daily-header-logo"
              style={{
                width: 90,
                height: 90,
                borderRadius: 20,
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
                flexShrink: 0,
              }}
            >
              <img
                src="/gds.png"
                alt="Global Digital Solutions logo"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  display: 'block',
                  transform: 'scale(1.02)',
                }}
              />
            </div>

            <div>
              <div
                className="daily-header-title"
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  letterSpacing: 0.4,
                  lineHeight: 1.05,
                }}
              >
                Global Digital Solutions
              </div>
              <div
                style={{
                  fontSize: 13,
                  opacity: 0.95,
                  marginTop: 6,
                }}
              >
                HR Daily Attendance (Day &amp; Night Shifts)
              </div>
            </div>
          </div>

          {/* right side of header: selected date tag + button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                padding: '6px 12px',
                borderRadius: 999,
                backgroundColor: 'rgba(15,23,42,0.35)',
                border: '1px solid rgba(148,163,184,0.6)',
                fontSize: 11,
              }}
            >
              <span style={{ opacity: 0.8, marginRight: 6 }}>Date:</span>
              <span style={{ fontWeight: 600 }}>{businessDate}</span>
            </div>

            <button
              onClick={handleLoadAndSave}
              disabled={loading}
              style={{
                padding: '10px 20px',
                borderRadius: 999,
                border: 'none',
                background:
                  'linear-gradient(135deg, #0F162A, #0c225cff, #58D34D)',
                color: '#ffffffff',
                fontWeight: 700,
                fontSize: 13,
                cursor: loading ? 'default' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                boxShadow: '0 12px 26px rgba(16,185,129,0.45)',
              }}
            >
              {loading && (
                <span
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: '999px',
                    border: '2px solid rgba(191,219,254,0.7)',
                    borderTopColor: '#022c22',
                    animation: 'spin 0.7s linear infinite',
                  }}
                />
              )}
              {loading ? 'Loading & Saving…' : 'Load & Save'}
            </button>
          </div>
        </div>

        {/* MAIN CARD */}
        <div
          className="daily-main-card"
          style={{
            borderRadius: 14,
            backgroundColor: '#f3f6fb',
            boxShadow: '0 16px 34px rgba(15,23,42,0.45)',
            padding: '18px 20px 20px',
          }}
        >
          {/* Legend + date + summary + stats */}
          <div style={{ marginBottom: 14 }}>
            {/* Shift legend */}
            <div
              className="daily-legend"
              style={{
                marginBottom: 14,
                padding: '10px 12px',
                borderRadius: 10,
                backgroundColor: '#0a2045ff',
                border: '2px solid  #58D34D',
                fontSize: 13,
                color: '#ffffffff',
                display: 'flex',
                flexWrap: 'wrap',
                gap: 6,
              }}
            >
              <strong style={{ color: '#ffffffff' }}>Shift Legend:</strong>
              <span>
                {shifts.length > 0 ? (
                  shifts.map((shift, idx) => (
                    <span key={shift._id}>
                      {idx > 0 && ', '}
                      <strong>{shift.code}</strong> = {shift.name} ({shift.startTime}–{shift.endTime})
                    </span>
                  ))
                ) : (
                  <span>No shifts configured. Please create shifts first.</span>
                )}
              </span>
            </div>

            <div
              className="daily-controls"
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'flex-end',
                gap: 16,
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <div>
                  <label
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      display: 'block',
                      marginBottom: 4,
                      color: '#111827',
                    }}
                  >
                    Business Date
                  </label>
                  <input
                    type="date"
                    value={businessDate}
                    onChange={(e) => setBusinessDate(e.target.value)}
                    style={{
                      padding: '7px 10px',
                      borderRadius: 8,
                      border: '1px solid #cbd5f5',
                      backgroundColor: '#ffffff',
                      color: '#0f172a',
                      minWidth: 170,
                      fontSize: 13,
                      outline: 'none',
                    }}
                  />
                </div>

                <div>
                  <label
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      display: 'block',
                      marginBottom: 4,
                      color: '#111827',
                    }}
                  >
                    Filter by Shift
                  </label>
                  <select
                    value={selectedShift}
                    onChange={(e) => setSelectedShift(e.target.value)}
                    style={{
                      padding: '7px 10px',
                      borderRadius: 8,
                      border: '1px solid #cbd5f5',
                      backgroundColor: '#ffffff',
                      color: '#0f172a',
                      minWidth: 200,
                      fontSize: 13,
                      outline: 'none',
                    }}
                  >
                    <option value="">All Shifts</option>
                    <option value="">All Shifts</option>
                    {shifts.length > 0 ? (
                      shifts.map((shift) => (
                        <option key={shift._id} value={shift.code}>
                          {shift.code} – {shift.name} ({shift.startTime}–{shift.endTime})
                        </option>
                      ))
                    ) : (
                      <option value="" disabled>No shifts available</option>
                    )}
                  </select>
                </div>

                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    fontSize: 12,
                    color: '#4b5563',
                  }}
                >
                  <span>
                    {shifts.length > 0 ? (
                      shifts.map((shift, idx) => (
                        <span key={shift._id}>
                          {idx > 0 && ' | '}
                          {shift.code}: <strong>{totals[shift.code] ?? 0}</strong>
                        </span>
                      ))
                    ) : (
                      <span>No shifts configured</span>
                    )}
                  </span>
                  {status && (
                    <span style={{ color: '#065f46' }}>{status}</span>
                  )}
                </div>
              </div>

              {/* Quick stats strip */}
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 8,
                  fontSize: 11,
                }}
              >
                <div
                  style={{
                    padding: '6px 10px',
                    borderRadius: 999,
                    backgroundColor: '#ffffff',
                    border: '1px solid #cbd5f5',
                  }}
                >
                  <span style={{ color: '#6b7280', marginRight: 4 }}>
                    Records:
                  </span>
                  <strong>{totalRecords}</strong>
                </div>
                <div
                  style={{
                    padding: '6px 10px',
                    borderRadius: 999,
                    backgroundColor: '#dcfce7',
                    border: '1px solid #16a34a',
                  }}
                >
                  <span style={{ color: '#166534', marginRight: 4 }}>
                    Present:
                  </span>
                  <strong>{presentCount}</strong>
                </div>
                <div
                  style={{
                    padding: '6px 10px',
                    borderRadius: 999,
                    backgroundColor: '#fee2e2',
                    border: '1px solid #b91c1c',
                  }}
                >
                  <span style={{ color: '#991b1b', marginRight: 4 }}>
                    Absent:
                  </span>
                  <strong>{absentCount}</strong>
                </div>
                <div
                  style={{
                    padding: '6px 10px',
                    borderRadius: 999,
                    backgroundColor: '#e0f2fe',
                    border: '1px solid #0ea5e9',
                  }}
                >
                  <span style={{ color: '#0369a1', marginRight: 4 }}>
                    Departments:
                  </span>
                  <strong>{departmentCount}</strong>
                </div>
              </div>
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

          {/* Table + search + export */}
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
                    fontSize: 16,
                    fontWeight: 700,
                    color: '#0f172a',
                    marginBottom: 2,
                  }}
                >
                  Attendance Snapshot
                </h2>
                <p
                  style={{
                    fontSize: 11,
                    color: '#6b7280',
                  }}
                >
                  Built from device events and stored in{' '}
                  <span style={{ color: '#0f766e' }}>ShiftAttendance</span>{' '}
                  for the selected business date.
                </p>
              </div>

              {/* search + export */}
              <div
                className="daily-search-export"
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'center',
                  flexWrap: 'wrap',
                }}
              >
                {/* search bar */}
                <div
                  style={{
                    position: 'relative',
                    minWidth: 220,
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      left: 10,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      fontSize: 13,
                      color: '#9ca3af',
                    }}
                  >
                    🔍
                  </span>
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search employee, dept, shift, status..."
                    style={{
                      padding: '8px 12px 8px 30px',
                      borderRadius: 999,
                      border: '1px solid #cbd5f5',
                      backgroundColor: '#ffffff',
                      fontSize: 12,
                      outline: 'none',
                      minWidth: 220,
                    }}
                  />
                </div>

                {/* export button */}
                <button
                  type="button"
                  onClick={handleExportExcel}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 999,
                    border: 'none',
                    background:
                      'linear-gradient(135deg,#22c55e,#16a34a,#15803d)',
                    color: '#f9fafb',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    boxShadow: '0 10px 20px rgba(22,163,74,0.45)',
                  }}
                >
                  ⬇ Export Excel
                </button>
              </div>
            </div>

            <div className="daily-table-wrapper" style={{ overflowX: 'auto' }}>
              <table
                className="hr-att-table daily-table"
                style={{
                  width: '100%',
                  minWidth: 900,
                  borderCollapse: 'collapse',
                  borderRadius: 10,
                  border: '1px solid #0F162A',
                  overflow: 'hidden',
                }}
              >
                <thead>
                  <tr>
                    <th style={thStyle}>Emp Code</th>
                    <th style={thStyle}>Name</th>
                    <th style={thStyle}>Department</th>
                    <th style={thStyle}>Designation</th>
                    <th style={thStyle}>Shift</th>
                    <th style={thStyle}>Status</th>
                    <th style={thStyle}>Check In</th>
                    <th style={thStyle}>Check Out</th>
                    <th style={thStyle}>Total Punches</th>
                  </tr>
                </thead>
                <tbody>
                  {rowsWithHeaders.length === 0 ? (
                    <tr>
                      <td
                        colSpan={9}
                        style={{
                          ...tdStyle,
                          textAlign: 'center',
                          color: '#6b7280',
                          backgroundColor: '#f9fafb',
                          padding: '14px 12px',
                        }}
                      >
                        {loading
                          ? 'Loading attendance…'
                          : 'No records for this date / filter yet.'}
                      </td>
                    </tr>
                  ) : (
                    rowsWithHeaders.map((row, idx) => {
                      if (row._type === 'deptHeader') {
                        return (
                          <tr key={`dept-${row.department}-${idx}`}>
                            <td
                              colSpan={9}
                              style={{
                                ...tdStyle,
                                backgroundColor: '#0F162A',
                                color: '#ffffffff',
                                border: '2px solid #58D34D',
                                fontWeight: 700,
                                textAlign: 'center',
                              }}
                            >
                              {row.department}
                            </td>
                          </tr>
                        );
                      }

                      const isManager =
                        row.designation &&
                        row.designation.toLowerCase().includes('manager');
                      const isTeamLead =
                        row.designation &&
                        row.designation.toLowerCase().includes('team lead');

                      const designationContent = (
                        <span
                          style={{
                            fontWeight: isManager || isTeamLead ? 700 : 400,
                          }}
                        >
                          {row.designation || '-'}
                        </span>
                      );

                      const statusText =
                        (row.attendanceStatus && row.attendanceStatus) ||
                        (row.totalPunches && row.totalPunches > 0
                          ? 'Present'
                          : 'Absent');

                      const statusColor =
                        statusText === 'Present' ? '#16a34a' : '#b91c1c';

                      return (
                        <tr
                          key={`${row.empCode}-${row.shift}-${idx}`}
                          className="data-row"
                          style={{
                            backgroundColor:
                              idx % 2 === 0 ? '#ffffff' : '#f3f4ff',
                          }}
                        >
                          <td style={tdStyle}>{row.empCode}</td>
                          <td style={tdStyle}>
                            {row.employeeName || row.name || '-'}
                          </td>
                          <td style={tdStyle}>{row.department || '-'}</td>
                          <td style={tdStyle}>{designationContent}</td>
                          <td style={tdStyle}>{row.shift || '-'}</td>
                          <td style={tdStyle}>
                            <span
                              style={{
                                padding: '2px 8px',
                                borderRadius: 999,
                                fontSize: 12,
                                fontWeight: 600,
                                color: '#ffffff',
                                backgroundColor: statusColor,
                              }}
                            >
                              {statusText}
                            </span>
                          </td>
                          <td style={tdStyle}>
                            {formatDateTime(row.checkIn)}
                          </td>
                          <td style={tdStyle}>
                            {formatDateTime(row.checkOut)}
                          </td>
                          <td style={tdStyle}>
                            {row.totalPunches ?? 0}
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
            maxWidth: 340,
            zIndex: 50,
          }}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}


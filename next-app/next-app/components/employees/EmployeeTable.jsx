/**
 * Employee Table Component
 * 
 * Complete employee data table with filtering, sorting, and actions
 */

import EmployeeRow from './EmployeeRow';

const thStyle = {
  padding: '14px 16px',
  textAlign: 'left',
  borderBottom: '2px solid #e5e7eb',
  fontWeight: 700,
  fontSize: 12,
  color: '#374151',
  backgroundColor: '#f8fafc',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  whiteSpace: 'nowrap',
};

const tdStyle = {
  padding: '12px 16px',
  borderBottom: '1px solid #f1f5f9',
  fontSize: 14,
  color: '#1f2937',
  backgroundColor: '#ffffff',
};

export default function EmployeeTable({
  employees,
  shifts,
  loading,
  savingId,
  onShiftChange,
  onEdit,
  onSave,
  onDelete,
}) {
  return (
    <div style={{ 
      overflowX: 'auto',
      borderRadius: 12,
      border: '1px solid #e5e7eb',
      boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
      backgroundColor: '#ffffff',
    }}>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
        }}
      >
        <thead>
          <tr>
            <th style={{ ...thStyle, width: 280 }}>Employee</th>
            <th style={thStyle}>Department</th>
            <th style={thStyle}>Shift</th>
            <th style={thStyle}>Salary</th>
            <th style={{ ...thStyle, width: 160, textAlign: 'center' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {loading && employees.length === 0 ? (
            <tr>
              <td
                colSpan={5}
                style={{
                  ...tdStyle,
                  textAlign: 'center',
                  color: '#6b7280',
                  backgroundColor: '#f9fafb',
                  padding: '40px 12px',
                  fontSize: 14,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <div
                    style={{
                      width: 20,
                      height: 20,
                      border: '3px solid #e5e7eb',
                      borderTopColor: '#3b82f6',
                      borderRadius: '50%',
                      animation: 'spin 0.8s linear infinite',
                    }}
                  />
                  Loading employees…
                </div>
              </td>
            </tr>
          ) : employees.length === 0 ? (
            <tr>
              <td
                colSpan={5}
                style={{
                  ...tdStyle,
                  textAlign: 'center',
                  color: '#6b7280',
                  backgroundColor: '#f9fafb',
                  padding: '40px 12px',
                  fontSize: 14,
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                  <svg
                    style={{ width: 48, height: 48, color: '#d1d5db' }}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  <div style={{ fontWeight: 600, color: '#374151' }}>No employees found</div>
                  <div style={{ fontSize: 13 }}>Try adjusting your search or filters</div>
                </div>
              </td>
            </tr>
          ) : (
            employees.map((employee, index) => (
              <EmployeeRow
                key={employee._id || employee.empCode}
                employee={employee}
                index={index}
                shifts={shifts}
                savingId={savingId}
                onShiftChange={onShiftChange}
                onEdit={onEdit}
                onSave={onSave}
                onDelete={onDelete}
              />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}


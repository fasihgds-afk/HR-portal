/**
 * Employee Row Component
 * 
 * Single employee table row with inline editing
 */

import EmployeeAvatar from './EmployeeAvatar';
import EmployeeQuickInfo from './EmployeeQuickInfo';

const tdStyle = {
  padding: '12px 16px',
  borderBottom: '1px solid #f1f5f9',
  fontSize: 14,
  color: '#1f2937',
  backgroundColor: '#ffffff',
};

const selectStyle = {
  padding: '6px 10px',
  borderRadius: 8,
  border: '1px solid #d1d5db',
  backgroundColor: '#ffffff',
  color: '#374151',
  fontSize: 13,
  outline: 'none',
  minWidth: 140,
  cursor: 'pointer',
  transition: 'all 0.2s',
  fontWeight: 500,
};

export default function EmployeeRow({
  employee,
  index,
  shifts,
  savingId,
  onShiftChange,
  onEdit,
  onSave,
  onDelete,
}) {
  const isSaving = savingId === (employee._id || employee.empCode);

  const handleShiftChange = (newShift) => {
    onShiftChange(index, newShift);
  };

  return (
    <tr
      onDoubleClick={() => onEdit(employee)}
      style={{
        cursor: 'pointer',
        backgroundColor: index % 2 === 0 ? '#ffffff' : '#f8fafc',
        transition: 'all 0.15s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = '#f0f9ff';
        e.currentTarget.style.boxShadow = 'inset 4px 0 0 0 #3b82f6';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = index % 2 === 0 ? '#ffffff' : '#f8fafc';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      {/* Employee Column - Combined Avatar + Name + Code with Quick Info */}
      <td style={tdStyle}>
        <EmployeeQuickInfo employee={employee}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <EmployeeAvatar employee={employee} size={40} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ 
                fontWeight: 600, 
                fontSize: 14, 
                color: '#111827',
                marginBottom: 2,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {employee.name || 'No Name'}
              </div>
              <div style={{ 
                fontSize: 12, 
                color: '#6b7280',
                fontWeight: 500,
              }}>
                {employee.empCode}
              </div>
            </div>
          </div>
        </EmployeeQuickInfo>
      </td>

      {/* Department Column */}
      <td style={tdStyle}>
        {employee.department ? (
          <span style={{
            padding: '6px 12px',
            borderRadius: 16,
            backgroundColor: '#eff6ff',
            color: '#1e40af',
            fontSize: 12,
            fontWeight: 600,
            display: 'inline-block',
          }}>
            {employee.department}
          </span>
        ) : (
          <span style={{ color: '#9ca3af', fontSize: 14 }}>-</span>
        )}
        {employee.designation && (
          <div style={{ 
            fontSize: 12, 
            color: '#6b7280',
            marginTop: 4,
          }}>
            {employee.designation}
          </div>
        )}
      </td>

      {/* Shift Column */}
      <td style={tdStyle}>
        {(() => {
          // Normalize shift value for comparison (uppercase, trimmed)
          const normalizedShift = employee.shift ? String(employee.shift).trim().toUpperCase() : '';
          // Find matching shift code (case-insensitive)
          const matchingShift = shifts.find(s => 
            s.code.toUpperCase() === normalizedShift || 
            s.code === normalizedShift ||
            s.code === employee.shift
          );
          const selectedShiftCode = matchingShift ? matchingShift.code : (employee.shift || '');
          
          return (
            <select
              style={{
                ...selectStyle,
                minWidth: 180,
              }}
              value={selectedShiftCode}
              onChange={(e) => handleShiftChange(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#3b82f6';
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = '#d1d5db';
                e.currentTarget.style.boxShadow = 'none';
                // Auto-save on blur if shift changed
                const newShift = e.target.value;
                const currentShift = selectedShiftCode;
                if (newShift !== currentShift) {
                  // Pass updated employee with new shift value
                  const updatedEmployee = { ...employee, shift: newShift };
                  setTimeout(() => {
                    onSave(updatedEmployee);
                  }, 100);
                }
              }}
            >
              <option value="">Select Shift</option>
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
          );
        })()}
        {employee.shift && (
          <div style={{ 
            fontSize: 11, 
            color: '#10b981',
            marginTop: 4,
            fontWeight: 600,
          }}>
            Active
          </div>
        )}
      </td>

      {/* Salary Column */}
      <td style={tdStyle}>
        {employee.monthlySalary != null ? (
          <div>
            <div style={{ 
              fontWeight: 700, 
              fontSize: 15,
              color: '#059669',
              marginBottom: 2,
            }}>
              ₨{employee.monthlySalary.toLocaleString()}
            </div>
            <div style={{ 
              fontSize: 11, 
              color: '#6b7280',
            }}>
              per month
            </div>
          </div>
        ) : (
          <span style={{ color: '#9ca3af', fontSize: 14 }}>-</span>
        )}
      </td>

      {/* Actions Column */}
      <td style={{ ...tdStyle, textAlign: 'center' }}>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit(employee);
            }}
            title="View full details and edit"
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
              color: '#ffffff',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s',
              boxShadow: '0 2px 4px rgba(59, 130, 246, 0.2)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 4px 8px rgba(59, 130, 246, 0.3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 2px 4px rgba(59, 130, 246, 0.2)';
            }}
          >
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            View
          </button>
          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(employee);
              }}
              title="Delete employee"
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: 'none',
                backgroundColor: '#dc2626',
                color: '#ffffff',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: '0 2px 4px rgba(220, 38, 38, 0.2)',
                display: 'flex',
                alignItems: 'center',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#b91c1c';
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 4px 8px rgba(220, 38, 38, 0.3)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#dc2626';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 2px 4px rgba(220, 38, 38, 0.2)';
              }}
            >
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}


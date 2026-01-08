/**
 * Employee Filters Component
 * 
 * Search and filter controls for employee list
 */

const inputStyle = {
  padding: '10px 14px',
  paddingLeft: '38px',
  borderRadius: 8,
  border: '1px solid #d1d5db',
  backgroundColor: '#ffffff',
  color: '#1f2937',
  fontSize: 14,
  outline: 'none',
  transition: 'all 0.2s',
  minWidth: 280,
  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
};

const selectStyle = {
  padding: '10px 14px',
  borderRadius: 8,
  border: '1px solid #d1d5db',
  backgroundColor: '#ffffff',
  color: '#1f2937',
  fontSize: 14,
  outline: 'none',
  transition: 'all 0.2s',
  minWidth: 200,
  cursor: 'pointer',
  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
};

export default function EmployeeFilters({
  searchQuery,
  selectedShift,
  shifts,
  onSearchChange,
  onShiftChange,
}) {
  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, position: 'relative' }}>
        <label
          style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}
        >
          Search Employees
        </label>
        <div style={{ position: 'relative' }}>
          <svg
            style={{
              position: 'absolute',
              left: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 18,
              height: 18,
              color: '#9ca3af',
              pointerEvents: 'none',
            }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            style={inputStyle}
            placeholder="Search by name, code, or email..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = '#3b82f6';
              e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = '#d1d5db';
              e.currentTarget.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.05)';
            }}
          />
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label
          style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}
        >
          Filter by Shift
        </label>
        <select
          style={selectStyle}
          value={selectedShift}
          onChange={(e) => onShiftChange(e.target.value)}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = '#3b82f6';
            e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)';
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = '#d1d5db';
            e.currentTarget.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.05)';
          }}
        >
          <option value="">All Shifts</option>
          {shifts.length > 0 ? (
            shifts.map((shift) => (
              <option key={shift._id} value={shift.code}>
                {shift.code} – {shift.name} ({shift.startTime}–{shift.endTime})
              </option>
            ))
          ) : (
            <option value="" disabled>No shifts available. Please create shifts first.</option>
          )}
        </select>
      </div>
    </div>
  );
}


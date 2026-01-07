/**
 * Employee Avatar Component
 * 
 * Displays employee avatar image or initials
 */

export default function EmployeeAvatar({ employee, size = 32, showBorder = false }) {
  // Handle base64 images - they need data URI prefix
  let src = '';
  if (employee?.profileImageUrl) {
    src = employee.profileImageUrl;
  } else if (employee?.profileImageBase64) {
    // If it already has data: prefix, use it as is, otherwise add it
    if (employee.profileImageBase64.startsWith('data:')) {
      src = employee.profileImageBase64;
    } else {
      // Assume JPEG format, add data URI prefix
      src = `data:image/jpeg;base64,${employee.profileImageBase64}`;
    }
  }
  
  const initials =
    (employee?.name || '')
      .split(' ')
      .map((p) => p[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || '?';

  if (src) {
    return (
      <img
        src={src}
        alt={employee?.name || employee?.empCode || 'Employee'}
        onError={(e) => {
          // If image fails to load, hide the img element and show initials
          e.target.style.display = 'none';
          e.target.nextSibling.style.display = 'flex';
        }}
        style={{
          width: size,
          height: size,
          borderRadius: '999px',
          objectFit: 'cover',
          border: showBorder ? '2px solid rgba(255, 255, 255, 0.3)' : '1px solid #e5e7eb',
          display: 'block',
        }}
      />
    );
  }

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '999px',
        background: 'linear-gradient(135deg, #2563eb, #38bdf8)',
        color: '#f9fafb',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.375,
        fontWeight: 700,
      }}
    >
      {initials}
    </div>
  );
}


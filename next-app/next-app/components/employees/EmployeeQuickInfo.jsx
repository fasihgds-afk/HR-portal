/**
 * Employee Quick Info Component
 * 
 * Tooltip showing quick employee information on hover
 */

'use client';

import { useState } from 'react';
import EmployeeAvatar from './EmployeeAvatar';

export default function EmployeeQuickInfo({ employee, children }) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div
      style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {children}
      {showTooltip && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: 8,
            padding: '16px',
            backgroundColor: '#ffffff',
            borderRadius: 8,
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.15)',
            border: '1px solid #e5e7eb',
            zIndex: 1000,
            minWidth: 280,
            pointerEvents: 'none',
          }}
        >
          <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
            <EmployeeAvatar employee={employee} size={48} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 4 }}>
                {employee.name || 'No Name'}
              </div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>Code: {employee.empCode}</div>
            </div>
          </div>
          <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {employee.designation && (
              <div style={{ fontSize: 12 }}>
                <span style={{ color: '#6b7280', fontWeight: 600 }}>Designation:</span>
                <span style={{ color: '#111827', marginLeft: 8 }}>{employee.designation}</span>
              </div>
            )}
            {employee.phoneNumber && (
              <div style={{ fontSize: 12 }}>
                <span style={{ color: '#6b7280', fontWeight: 600 }}>Phone:</span>
                <span style={{ color: '#111827', marginLeft: 8 }}>{employee.phoneNumber}</span>
              </div>
            )}
            {employee.email && (
              <div style={{ fontSize: 12 }}>
                <span style={{ color: '#6b7280', fontWeight: 600 }}>Email:</span>
                <span style={{ color: '#111827', marginLeft: 8 }}>{employee.email}</span>
              </div>
            )}
            {employee.cnic && (
              <div style={{ fontSize: 12 }}>
                <span style={{ color: '#6b7280', fontWeight: 600 }}>CNIC:</span>
                <span style={{ color: '#111827', marginLeft: 8 }}>{employee.cnic}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


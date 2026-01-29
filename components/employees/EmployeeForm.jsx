/**
 * EmployeeForm Component
 * 
 * Professional form component for adding/updating employees
 * Reusable and clean separation of concerns
 */

'use client';

import { useState } from 'react';
import EmployeeAvatar from './EmployeeAvatar';

export default function EmployeeForm({
  employee = null, // If provided, form is in edit mode
  shifts = [],
  departments = [], // List of { name } from /api/hr/departments - used for department dropdown (dynamic across app)
  onSubmit,
  onCancel,
  loading = false,
}) {
  const [formData, setFormData] = useState({
    empCode: employee?.empCode || '',
    name: employee?.name || '',
    email: employee?.email || '',
    monthlySalary: employee?.monthlySalary || '',
    shift: employee?.shift || employee?.shiftId || '',
    department: employee?.department || '',
    designation: employee?.designation || '',
    phoneNumber: employee?.phoneNumber || '',
    cnic: employee?.cnic || '',
    profileImageBase64: employee?.profileImageBase64 || '',
    profileImageUrl: employee?.profileImageUrl || '',
  });

  const [imagePreview, setImagePreview] = useState(employee?.profileImageUrl || '');

  const handleChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('Image size must be less than 5MB');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result;
      setFormData(prev => ({
        ...prev,
        profileImageBase64: base64,
        profileImageUrl: '',
      }));
      setImagePreview(base64);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.empCode.trim()) {
      alert('Employee Code is required');
      return;
    }
    onSubmit(formData);
  };

  const handleReset = () => {
    if (employee) {
      // Reset to original employee data
      setFormData({
        empCode: employee.empCode || '',
        name: employee.name || '',
        email: employee.email || '',
        monthlySalary: employee.monthlySalary || '',
        shift: employee.shift || employee.shiftId || '',
        department: employee.department || '',
        designation: employee.designation || '',
        phoneNumber: employee.phoneNumber || '',
        cnic: employee.cnic || '',
        profileImageBase64: employee.profileImageBase64 || '',
        profileImageUrl: employee.profileImageUrl || '',
      });
      setImagePreview(employee.profileImageUrl || '');
    } else {
      // Reset to empty form
      setFormData({
        empCode: '',
        name: '',
        email: '',
        monthlySalary: '',
        shift: '',
        department: '',
        designation: '',
        phoneNumber: '',
        cnic: '',
        profileImageBase64: '',
        profileImageUrl: '',
      });
      setImagePreview('');
    }
  };

  const isEditMode = !!employee;

  return (
    <form onSubmit={handleSubmit}>
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: 12,
          padding: 24,
          border: '1px solid #e5e7eb',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        }}
      >
        {/* Form Header */}
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: 0 }}>
            {isEditMode ? 'Edit Employee Details' : 'Add New Employee'}
          </h2>
          <p style={{ fontSize: 14, color: '#6b7280', marginTop: 6, margin: 0 }}>
            {isEditMode 
              ? 'Update employee information below. All changes will be saved immediately.'
              : 'Fill in the required details to add a new employee to the system'}
          </p>
        </div>

        {/* Profile Image Section */}
        <div style={{ 
          marginBottom: 32, 
          padding: 20,
          backgroundColor: '#f8fafc',
          borderRadius: 12,
          border: '1px solid #e5e7eb',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <EmployeeAvatar
              employee={formData}
              size={100}
              showBorder
            />
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8, display: 'block' }}>
                Profile Photo
              </label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <label
                  htmlFor="profile-image"
                  style={{
                    display: 'inline-block',
                    padding: '10px 20px',
                    borderRadius: 8,
                    border: '1px solid #3b82f6',
                    backgroundColor: '#ffffff',
                    color: '#3b82f6',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.backgroundColor = '#eff6ff';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.backgroundColor = '#ffffff';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  {imagePreview ? 'Change Photo' : 'Upload Photo'}
                </label>
                <input
                  id="profile-image"
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  style={{ display: 'none' }}
                />
                {imagePreview && (
                  <button
                    type="button"
                    onClick={() => {
                      setImagePreview('');
                      handleChange('profileImageBase64', '');
                      handleChange('profileImageUrl', '');
                    }}
                    style={{
                      padding: '10px 16px',
                      borderRadius: 8,
                      border: '1px solid #dc2626',
                      backgroundColor: '#ffffff',
                      color: '#dc2626',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.backgroundColor = '#fee2e2';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.backgroundColor = '#ffffff';
                    }}
                  >
                    Remove
                  </button>
                )}
              </div>
              <p style={{ fontSize: 12, color: '#6b7280', marginTop: 8, margin: 0 }}>
                Recommended: Square image, clear face, under 5MB. JPG or PNG format.
              </p>
            </div>
          </div>
        </div>

        {/* Section: Basic Information */}
        <div style={{ marginBottom: 28 }}>
          <h3 style={{ 
            fontSize: 16, 
            fontWeight: 700, 
            color: '#111827', 
            marginBottom: 16,
            paddingBottom: 8,
            borderBottom: '2px solid #e5e7eb',
          }}>
            Basic Information
          </h3>

        {/* Form Fields - 2 Column Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 20,
            marginBottom: 24,
          }}
        >
          {/* Row 1 */}
          <div>
            <label style={labelStyle}>
              Employee Code <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <input
              type="text"
              required
              disabled={isEditMode} // Don't allow changing empCode in edit mode
              value={formData.empCode}
              onChange={(e) => handleChange('empCode', e.target.value)}
              placeholder="e.g. 125723"
              style={{
                ...inputStyle,
                backgroundColor: isEditMode ? '#f3f4f6' : '#ffffff',
                cursor: isEditMode ? 'not-allowed' : 'text',
              }}
            />
          </div>

          <div>
            <label style={labelStyle}>
              Full Name <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder="Employee full name"
              style={inputStyle}
            />
          </div>
        </div>
        </div>

        {/* Section: Work Information */}
        <div style={{ marginBottom: 28 }}>
          <h3 style={{ 
            fontSize: 16, 
            fontWeight: 700, 
            color: '#111827', 
            marginBottom: 16,
            paddingBottom: 8,
            borderBottom: '2px solid #e5e7eb',
          }}>
            Work Information
          </h3>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: 20,
              marginBottom: 24,
            }}
          >
            <div>
              <label style={labelStyle}>Department</label>
              <select
                value={formData.department || ''}
                onChange={(e) => handleChange('department', e.target.value)}
                style={{
                  ...inputStyle,
                  cursor: 'pointer',
                  backgroundColor: '#ffffff',
                }}
              >
                <option value="">Select Department</option>
                {[
                  ...new Set(
                    [
                      ...(departments || []).map((d) => (d.name || '').trim()).filter(Boolean),
                      (formData.department || '').trim(),
                    ].filter(Boolean)
                  ),
                ]
                  .sort((a, b) => a.localeCompare(b))
                  .map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
              </select>
              {(!departments || departments.length === 0) && (
                <p style={{ marginTop: 4, fontSize: 12, color: '#6b7280' }}>
                  Add departments in HR → Departments to assign Saturday policy.
                </p>
              )}
            </div>

            <div>
              <label style={labelStyle}>Designation</label>
              <input
                type="text"
                value={formData.designation}
                onChange={(e) => handleChange('designation', e.target.value)}
                placeholder="e.g. Manager, Developer, Lead"
                style={inputStyle}
              />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Shift</label>
              <select
                value={formData.shift}
                onChange={(e) => handleChange('shift', e.target.value)}
                style={{
                  ...inputStyle,
                  cursor: 'pointer',
                  backgroundColor: '#ffffff',
                }}
              >
                <option value="">Select Shift</option>
                {shifts.map((shift) => (
                  <option key={shift._id || shift.code} value={shift._id || shift.code}>
                    {shift.code} - {shift.name} ({shift.startTime}-{shift.endTime})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Monthly Salary</label>
              <input
                type="number"
                min="0"
                step="1000"
                value={formData.monthlySalary}
                onChange={(e) => handleChange('monthlySalary', e.target.value)}
                placeholder="e.g. 45000"
                style={inputStyle}
              />
            </div>
          </div>
        </div>

        {/* Section: Contact Information */}
        <div style={{ marginBottom: 28 }}>
          <h3 style={{ 
            fontSize: 16, 
            fontWeight: 700, 
            color: '#111827', 
            marginBottom: 16,
            paddingBottom: 8,
            borderBottom: '2px solid #e5e7eb',
          }}>
            Contact Information
          </h3>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: 20,
              marginBottom: 24,
            }}
          >
            <div>
              <label style={labelStyle}>Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => handleChange('email', e.target.value)}
                placeholder="email@example.com"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Phone Number</label>
              <input
                type="tel"
                value={formData.phoneNumber}
                onChange={(e) => handleChange('phoneNumber', e.target.value)}
                placeholder="03XXXXXXXXXX"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>CNIC</label>
              <input
                type="text"
                value={formData.cnic}
                onChange={(e) => handleChange('cnic', e.target.value)}
                placeholder="XXXXX-XXXXXXX-X"
                style={inputStyle}
              />
            </div>
          </div>
        </div>

        {/* Form Actions */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 12,
            paddingTop: 20,
            borderTop: '1px solid #e5e7eb',
          }}
        >
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              style={cancelButtonStyle}
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            onClick={handleReset}
            style={resetButtonStyle}
          >
            Reset
          </button>
          <button
            type="submit"
            disabled={loading}
            style={{
              ...submitButtonStyle,
              opacity: loading ? 0.6 : 1,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Saving...' : (isEditMode ? 'Update Employee' : 'Add Employee')}
          </button>
        </div>
      </div>
    </form>
  );
}

// Styles
const labelStyle = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  color: '#374151',
  marginBottom: 6,
};

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid #d1d5db',
  backgroundColor: '#ffffff',
  color: '#111827',
  fontSize: 14,
  outline: 'none',
  transition: 'border-color 0.2s',
};

const cancelButtonStyle = {
  padding: '10px 20px',
  borderRadius: 8,
  border: '1px solid #d1d5db',
  backgroundColor: '#ffffff',
  color: '#374151',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'all 0.2s',
};

const resetButtonStyle = {
  padding: '10px 20px',
  borderRadius: 8,
  border: '1px solid #d1d5db',
  backgroundColor: '#f9fafb',
  color: '#6b7280',
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
  transition: 'all 0.2s',
};

const submitButtonStyle = {
  padding: '10px 24px',
  borderRadius: 8,
  border: 'none',
  background: 'linear-gradient(135deg, #2563eb, #3b82f6)',
  color: '#ffffff',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)',
  transition: 'all 0.2s',
};


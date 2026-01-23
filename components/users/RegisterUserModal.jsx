'use client';

import { useState } from 'react';
import Modal from '@/components/ui/Modal';
import { useTheme } from '@/lib/theme/ThemeContext';

export default function RegisterUserModal({ isOpen, onClose, onSuccess }) {
  const { colors, theme } = useTheme();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [role, setRole] = useState('HR'); // 'HR' | 'EMPLOYEE'
  const [empCode, setEmpCode] = useState('');
  
  // Password visibility toggles
  const [showPassword, setShowPassword] = useState(false);
  const [showPassword2, setShowPassword2] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (password !== password2) {
      setErrorMsg('Passwords do not match');
      return;
    }

    if (password.length < 8) {
      setErrorMsg('Password must be at least 8 characters');
      return;
    }

    if (role === 'EMPLOYEE' && !empCode.trim()) {
      setErrorMsg('Employee code is required for EMPLOYEE role');
      return;
    }

    setLoading(true);
    try {
      // Build request body - only include empCode if role is EMPLOYEE
      const requestBody = {
        email: email.trim(),
        password,
        role,
      };
      
      // Only include empCode if role is EMPLOYEE and empCode is provided
      if (role === 'EMPLOYEE' && empCode.trim()) {
        requestBody.empCode = empCode.trim();
      }

      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const data = await res.json();

      if (!res.ok) {
        // Show detailed error message if available
        let errorMessage = data.error || 'Registration failed';
        if (data.details && Array.isArray(data.details) && data.details.length > 0) {
          // Show first validation error detail
          const firstError = data.details[0];
          errorMessage = `${errorMessage}: ${firstError.field ? `${firstError.field}: ` : ''}${firstError.message || ''}`;
        }
        setErrorMsg(errorMessage);
        return;
      }

      setSuccessMsg('User registered successfully!');
      
      // Reset form
      setEmail('');
      setPassword('');
      setPassword2('');
      setEmpCode('');
      setRole('HR');
      
      // Call onSuccess callback if provided
      if (onSuccess) {
        onSuccess();
      }
      
      // Close modal after 1.5 seconds
      setTimeout(() => {
        onClose();
        setSuccessMsg('');
      }, 1500);
    } catch (err) {
      console.error(err);
      setErrorMsg('Network error while registering user');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setEmail('');
      setPassword('');
      setPassword2('');
      setEmpCode('');
      setRole('HR');
      setErrorMsg('');
      setSuccessMsg('');
      onClose();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Register New User" size="md">
      <div style={{ padding: '4px 0' }}>
        <p style={{ fontSize: 13, color: colors.text.muted, marginBottom: 20 }}>
          Create login credentials for HR users. Fill email and password to grant full portal access.
        </p>

        {errorMsg && (
          <div
            style={{
              marginBottom: 16,
              padding: '10px 12px',
              borderRadius: 8,
              backgroundColor: theme === 'dark' ? 'rgba(239,68,68,0.12)' : `${colors.error}20`,
              border: `1px solid ${colors.error}40`,
              color: colors.error,
              fontSize: 13,
            }}
          >
            {errorMsg}
          </div>
        )}

        {successMsg && (
          <div
            style={{
              marginBottom: 16,
              padding: '10px 12px',
              borderRadius: 8,
              backgroundColor: theme === 'dark' ? 'rgba(22,163,74,0.12)' : `${colors.success}20`,
              border: `1px solid ${colors.success}40`,
              color: colors.success,
              fontSize: 13,
            }}
          >
            {successMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Email */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, color: colors.text.secondary, fontWeight: 600 }}>
              Email <span style={{ color: colors.error }}>*</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="user@globaldigitalsolutions.com"
              style={{
                padding: '10px 14px',
                borderRadius: 8,
                border: `1px solid ${colors.border.input}`,
                backgroundColor: colors.background.input,
                color: colors.text.primary,
                fontSize: 13,
                outline: 'none',
                transition: 'border-color 0.2s, box-shadow 0.2s',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = colors.primary[500];
                e.currentTarget.style.boxShadow = `0 0 0 3px ${colors.primary[500]}20`;
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = colors.border.input;
                e.currentTarget.style.boxShadow = 'none';
              }}
            />
          </div>

          {/* Role select */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, color: colors.text.secondary, fontWeight: 600 }}>
              Role <span style={{ color: colors.error }}>*</span>
            </label>
            <select
              value={role}
              onChange={(e) => {
                setRole(e.target.value);
                if (e.target.value === 'HR') {
                  setEmpCode('');
                }
              }}
              style={{
                padding: '10px 14px',
                borderRadius: 8,
                border: `1px solid ${colors.border.input}`,
                backgroundColor: colors.background.input,
                color: colors.text.primary,
                fontSize: 13,
                outline: 'none',
                cursor: 'pointer',
                transition: 'border-color 0.2s, box-shadow 0.2s',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = colors.primary[500];
                e.currentTarget.style.boxShadow = `0 0 0 3px ${colors.primary[500]}20`;
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = colors.border.input;
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <option value="HR">HR (full access)</option>
              <option value="EMPLOYEE">Employee (self-service)</option>
            </select>
          </div>

          {/* Employee code (required only when role === EMPLOYEE) */}
          {role === 'EMPLOYEE' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 12, color: colors.text.secondary, fontWeight: 600 }}>
                Employee Code <span style={{ color: colors.error }}>*</span>
              </label>
              <input
                value={empCode}
                onChange={(e) => setEmpCode(e.target.value)}
                placeholder="e.g. 00082"
                style={{
                  padding: '10px 14px',
                  borderRadius: 8,
                  border: `1px solid ${colors.border.input}`,
                  backgroundColor: colors.background.input,
                  color: colors.text.primary,
                  fontSize: 13,
                  outline: 'none',
                  transition: 'border-color 0.2s, box-shadow 0.2s',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = colors.primary[500];
                  e.currentTarget.style.boxShadow = `0 0 0 3px ${colors.primary[500]}20`;
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = colors.border.input;
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
            </div>
          )}

          {/* Password with show/hide toggle */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, color: colors.text.secondary, fontWeight: 600 }}>
              Password <span style={{ color: colors.error }}>*</span>
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Minimum 8 characters"
                style={{
                  padding: '10px 14px 10px 14px',
                  paddingRight: '40px',
                  borderRadius: 8,
                  border: `1px solid ${colors.border.input}`,
                  backgroundColor: colors.background.input,
                  color: colors.text.primary,
                  fontSize: 13,
                  outline: 'none',
                  width: '100%',
                  transition: 'border-color 0.2s, box-shadow 0.2s',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = colors.primary[500];
                  e.currentTarget.style.boxShadow = `0 0 0 3px ${colors.primary[500]}20`;
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = colors.border.input;
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: colors.text.muted,
                  fontSize: 18,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 4,
                }}
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          {/* Confirm Password with show/hide toggle */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, color: colors.text.secondary, fontWeight: 600 }}>
              Confirm Password <span style={{ color: colors.error }}>*</span>
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword2 ? 'text' : 'password'}
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                required
                placeholder="Re-enter password"
                style={{
                  padding: '10px 14px 10px 14px',
                  paddingRight: '40px',
                  borderRadius: 8,
                  border: `1px solid ${colors.border.input}`,
                  backgroundColor: colors.background.input,
                  color: colors.text.primary,
                  fontSize: 13,
                  outline: 'none',
                  width: '100%',
                  transition: 'border-color 0.2s, box-shadow 0.2s',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = colors.primary[500];
                  e.currentTarget.style.boxShadow = `0 0 0 3px ${colors.primary[500]}20`;
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = colors.border.input;
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword2(!showPassword2)}
                style={{
                  position: 'absolute',
                  right: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: colors.text.muted,
                  fontSize: 18,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 4,
                }}
                title={showPassword2 ? 'Hide password' : 'Show password'}
              >
                {showPassword2 ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          {/* Form Actions */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              style={{
                padding: '10px 20px',
                borderRadius: 8,
                border: `1px solid ${colors.border.default}`,
                backgroundColor: colors.background.secondary,
                color: colors.text.primary,
                fontSize: 14,
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                opacity: loading ? 0.6 : 1,
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.currentTarget.style.backgroundColor = colors.background.hover;
                }
              }}
              onMouseLeave={(e) => {
                if (!loading) {
                  e.currentTarget.style.backgroundColor = colors.background.secondary;
                }
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '10px 20px',
                borderRadius: 8,
                border: 'none',
                background: `linear-gradient(135deg, ${colors.primary[500]}, ${colors.success})`,
                color: '#ffffff',
                fontSize: 14,
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.75 : 1,
                boxShadow: `0 8px 20px ${colors.primary[500]}40`,
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = `0 10px 24px ${colors.primary[500]}50`;
                }
              }}
              onMouseLeave={(e) => {
                if (!loading) {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = `0 8px 20px ${colors.primary[500]}40`;
                }
              }}
            >
              {loading ? 'Creating user…' : 'Register User'}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}


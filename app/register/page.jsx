// next-app/app/register/page.jsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useTheme } from '@/lib/theme/ThemeContext';
import ThemeToggle from '@/components/ui/ThemeToggle';

export default function RegisterPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
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

  // Block access if user is not authenticated
  useEffect(() => {
    if (status === 'unauthenticated') {
      // User is not logged in, redirect to login page
      router.push('/login?role=hr');
    } else if (status === 'authenticated') {
      // Optional: Only allow HR or ADMIN roles to access register page
      // Uncomment the following lines if you want to restrict to HR/ADMIN only:
      // if (session?.user?.role !== 'HR' && session?.user?.role !== 'ADMIN') {
      //   router.push('/login?role=hr');
      // }
    }
  }, [status, session, router]);

  // Show loading state while checking authentication
  if (status === 'loading') {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: colors.gradient.overlay,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: colors.text.primary,
        }}
      >
        <div style={{ fontSize: 14, color: colors.text.muted }}>Loading...</div>
      </div>
    );
  }

  // Don't render the form if not authenticated (will redirect)
  if (status === 'unauthenticated') {
    return null;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (password !== password2) {
      setErrorMsg('Passwords do not match');
      return;
    }

    if (role === 'EMPLOYEE' && !empCode.trim()) {
      setErrorMsg('Employee code is required for EMPLOYEE role');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          role,
          empCode: role === 'EMPLOYEE' ? empCode : undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error || 'Registration failed');
        return;
      }

      setSuccessMsg('User registered successfully. You can now log in.');
      // optional: small delay then go to login
      setTimeout(() => {
        router.push('/login');
      }, 1200);
    } catch (err) {
      console.error(err);
      setErrorMsg('Network error while registering user');
    } finally {
      setLoading(false);
    }
  };

  const goBackToLogin = () => {
    router.push('/login');
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: colors.gradient.overlay,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
        color: colors.text.primary,
        fontFamily:
          '-apple-system,BlinkMacSystemFont,system-ui,Segoe UI,sans-serif',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 520,
          borderRadius: 20,
          background: colors.background.card,
          boxShadow: theme === 'dark' 
            ? '0 30px 80px rgba(15,23,42,0.85)'
            : '0 30px 80px rgba(0,0,0,0.15)',
          padding: '26px 24px 22px',
          border: `1px solid ${colors.border.default}`,
          position: 'relative',
        }}
      >
        {/* Theme Toggle and Back to login */}
        <div style={{ position: 'absolute', top: 16, right: 18, display: 'flex', gap: 10, alignItems: 'center' }}>
          <ThemeToggle />
          <button
            onClick={goBackToLogin}
            style={{
              padding: '6px 12px',
              borderRadius: 999,
              border: `1px solid ${colors.border.default}`,
              backgroundColor: 'transparent',
              color: colors.text.primary,
              fontSize: 11,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = colors.background.hover;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            ← Back to Login
          </button>
        </div>

        <div style={{ marginBottom: 18 }}>
          <div
            style={{
              fontSize: 20,
              fontWeight: 800,
              marginBottom: 4,
              color: colors.text.primary,
            }}
          >
            Register New User
          </div>
          <div
            style={{
              fontSize: 12,
              color: colors.text.muted,
            }}
          >
            Create login credentials for HR users. Fill email and password to grant full portal access.
          </div>
        </div>

        {errorMsg && (
          <div
            style={{
              marginBottom: 10,
              padding: '8px 10px',
              borderRadius: 8,
              backgroundColor: theme === 'dark' ? 'rgba(239,68,68,0.12)' : `${colors.error}20`,
              border: `1px solid ${colors.error}40`,
              color: colors.error,
              fontSize: 12,
            }}
          >
            {errorMsg}
          </div>
        )}

        {successMsg && (
          <div
            style={{
              marginBottom: 10,
              padding: '8px 10px',
              borderRadius: 8,
              backgroundColor: theme === 'dark' ? 'rgba(22,163,74,0.12)' : `${colors.success}20`,
              border: `1px solid ${colors.success}40`,
              color: colors.success,
              fontSize: 12,
            }}
          >
            {successMsg}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, color: colors.text.secondary, fontWeight: 600 }}>Email</label>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, color: colors.text.secondary, fontWeight: 600 }}>Role</label>
            <select
              value={role}
              onChange={(e) => {
                setRole(e.target.value);
                // Clear role-specific fields when switching
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 11, color: colors.text.secondary, fontWeight: 600 }}>
                Employee Code (must exist in Employees)
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, color: colors.text.secondary, fontWeight: 600 }}>Password</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Minimum 6 characters"
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, color: colors.text.secondary, fontWeight: 600 }}>
              Confirm Password
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

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 10,
              padding: '12px 20px',
              borderRadius: 12,
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
        </form>

        <div
          style={{
            marginTop: 18,
            fontSize: 11,
            color: colors.text.muted,
            textAlign: 'center',
          }}
        >
          © {new Date().getFullYear()} Global Digital Solutions — Internal use
          only
        </div>
      </div>
    </div>
  );
}


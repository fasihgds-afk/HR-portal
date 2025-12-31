// next-app/app/register/page.jsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function RegisterPage() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [role, setRole] = useState('HR'); // 'HR' | 'EMPLOYEE'
  const [empCode, setEmpCode] = useState('');
  const [secretKey, setSecretKey] = useState('');

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

    if (role === 'EMPLOYEE' && !empCode.trim()) {
      setErrorMsg('Employee code is required for EMPLOYEE role');
      return;
    }

    if (role === 'HR' && !secretKey.trim()) {
      setErrorMsg('Secret key is required for HR role');
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
          secretKey: role === 'HR' ? secretKey : undefined,
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
        background:
          'radial-gradient(circle at top, #020617 0, #000 40%, #020617 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
        color: '#e5e7eb',
        fontFamily:
          '-apple-system,BlinkMacSystemFont,system-ui,Segoe UI,sans-serif',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 520,
          borderRadius: 20,
          background:
            'linear-gradient(145deg, rgba(15,23,42,0.96), rgba(15,23,42,0.98))',
          boxShadow: '0 30px 80px rgba(15,23,42,0.85)',
          padding: '26px 24px 22px',
          border: '1px solid rgba(59,130,246,0.5)',
          position: 'relative',
        }}
      >
        {/* Back to login */}
        <button
          onClick={goBackToLogin}
          style={{
            position: 'absolute',
            top: 16,
            right: 18,
            padding: '6px 12px',
            borderRadius: 999,
            border: '1px solid rgba(148,163,184,0.8)',
            backgroundColor: 'transparent',
            color: '#e5e7eb',
            fontSize: 11,
            cursor: 'pointer',
          }}
        >
          ← Back to Login
        </button>

        <div style={{ marginBottom: 18 }}>
          <div
            style={{
              fontSize: 20,
              fontWeight: 800,
              marginBottom: 4,
            }}
          >
            Register New User
          </div>
          <div
            style={{
              fontSize: 12,
              color: '#cbd5f5',
            }}
          >
            Create login credentials for HR or link a user to an existing
            employee code.
          </div>
        </div>

        {errorMsg && (
          <div
            style={{
              marginBottom: 10,
              padding: '8px 10px',
              borderRadius: 8,
              backgroundColor: 'rgba(239,68,68,0.12)',
              border: '1px solid rgba(248,113,113,0.8)',
              color: '#fecaca',
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
              backgroundColor: 'rgba(22,163,74,0.12)',
              border: '1px solid rgba(34,197,94,0.9)',
              color: '#bbf7d0',
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
            <label style={{ fontSize: 11, color: '#cbd5e1' }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="user@globaldigitalsolutions.com"
              style={{
                padding: '9px 11px',
                borderRadius: 8,
                border: '1px solid rgba(148,163,184,0.9)',
                backgroundColor: '#020617',
                color: '#e5e7eb',
                fontSize: 13,
                outline: 'none',
              }}
            />
          </div>

          {/* Role select */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, color: '#cbd5e1' }}>Role</label>
            <select
              value={role}
              onChange={(e) => {
                setRole(e.target.value);
                // Clear role-specific fields when switching
                if (e.target.value === 'HR') {
                  setEmpCode('');
                } else {
                  setSecretKey('');
                }
              }}
              style={{
                padding: '9px 11px',
                borderRadius: 8,
                border: '1px solid rgba(148,163,184,0.9)',
                backgroundColor: '#020617',
                color: '#e5e7eb',
                fontSize: 13,
                outline: 'none',
              }}
            >
              <option value="HR">HR (full access)</option>
              <option value="EMPLOYEE">Employee (self-service)</option>
            </select>
          </div>

          {/* Secret key (required only when role === HR) */}
          {role === 'HR' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 11, color: '#cbd5e1' }}>
                Secret Key
              </label>
              <input
                type="password"
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value)}
                placeholder="Enter your secret key"
                style={{
                  padding: '9px 11px',
                  borderRadius: 8,
                  border: '1px solid rgba(148,163,184,0.9)',
                  backgroundColor: '#020617',
                  color: '#e5e7eb',
                  fontSize: 13,
                  outline: 'none',
                }}
              />
            </div>
          )}

          {/* Employee code (required only when role === EMPLOYEE) */}
          {role === 'EMPLOYEE' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 11, color: '#cbd5e1' }}>
                Employee Code (must exist in Employees)
              </label>
              <input
                value={empCode}
                onChange={(e) => setEmpCode(e.target.value)}
                placeholder="e.g. 00082"
                style={{
                  padding: '9px 11px',
                  borderRadius: 8,
                  border: '1px solid rgba(148,163,184,0.9)',
                  backgroundColor: '#020617',
                  color: '#e5e7eb',
                  fontSize: 13,
                  outline: 'none',
                }}
              />
            </div>
          )}

          {/* Passwords */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, color: '#cbd5e1' }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="Minimum 6 characters"
              style={{
                padding: '9px 11px',
                borderRadius: 8,
                border: '1px solid rgba(148,163,184,0.9)',
                backgroundColor: '#020617',
                color: '#e5e7eb',
                fontSize: 13,
                outline: 'none',
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, color: '#cbd5e1' }}>
              Confirm Password
            </label>
            <input
              type="password"
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              required
              placeholder="Re-enter password"
              style={{
                padding: '9px 11px',
                borderRadius: 8,
                border: '1px solid rgba(148,163,184,0.9)',
                backgroundColor: '#020617',
                color: '#e5e7eb',
                fontSize: 13,
                outline: 'none',
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 10,
              padding: '10px 16px',
              borderRadius: 999,
              border: 'none',
              background:
                'linear-gradient(135deg,#3b82f6,#22c55e,#a3e635,#22c55e)',
              color: '#020617',
              fontSize: 13,
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.75 : 1,
              boxShadow: '0 14px 32px rgba(37,99,235,0.7)',
            }}
          >
            {loading ? 'Creating user…' : 'Register User'}
          </button>
        </form>

        <div
          style={{
            marginTop: 18,
            fontSize: 11,
            color: '#9ca3af',
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


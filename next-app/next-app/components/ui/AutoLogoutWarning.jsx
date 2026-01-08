'use client';

import { useTheme } from '@/lib/theme/ThemeContext';

/**
 * Warning dialog component for auto logout
 */
export default function AutoLogoutWarning({ 
  timeRemaining, 
  onStayLoggedIn, 
  onLogout 
}) {
  const { colors, theme } = useTheme();

  const minutes = Math.floor(timeRemaining / 60);
  const seconds = timeRemaining % 60;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        style={{
          backgroundColor: colors.background.card,
          borderRadius: 16,
          padding: '24px',
          maxWidth: 420,
          width: '100%',
          border: `2px solid ${colors.warning}`,
          boxShadow: `0 10px 40px rgba(0, 0, 0, 0.3)`,
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div
            style={{
              fontSize: 48,
              marginBottom: 12,
            }}
          >
            ⚠️
          </div>
          <h2
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: colors.text.primary,
              marginBottom: 8,
            }}
          >
            Session Timeout Warning
          </h2>
          <p
            style={{
              fontSize: 14,
              color: colors.text.secondary,
              lineHeight: 1.6,
              marginBottom: 16,
            }}
          >
            You will be logged out due to inactivity in:
          </p>
          <div
            style={{
              fontSize: 32,
              fontWeight: 800,
              color: colors.warning,
              marginBottom: 20,
              fontFamily: 'monospace',
            }}
          >
            {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            gap: 12,
            justifyContent: 'center',
          }}
        >
          <button
            onClick={onLogout}
            style={{
              padding: '10px 20px',
              borderRadius: 8,
              border: `1px solid ${colors.border.default}`,
              backgroundColor: colors.background.tertiary,
              color: colors.text.primary,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = colors.background.hover;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = colors.background.tertiary;
            }}
          >
            Logout Now
          </button>
          <button
            onClick={onStayLoggedIn}
            style={{
              padding: '10px 24px',
              borderRadius: 8,
              border: 'none',
              background: `linear-gradient(135deg, ${colors.primary[500]}, ${colors.primary[600]})`,
              color: '#ffffff',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s',
              boxShadow: `0 4px 12px ${colors.primary[500]}40`,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-1px)';
              e.currentTarget.style.boxShadow = `0 6px 16px ${colors.primary[500]}60`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = `0 4px 12px ${colors.primary[500]}40`;
            }}
          >
            Stay Logged In
          </button>
        </div>
      </div>
    </div>
  );
}


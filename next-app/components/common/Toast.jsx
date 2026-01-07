/**
 * Toast Component
 * 
 * Professional toast notification component
 */

'use client';

import { useEffect } from 'react';

export default function Toast({ type, message, onClose, duration = 3000 }) {
  useEffect(() => {
    if (message && duration > 0) {
      const timer = setTimeout(() => {
        onClose();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [message, duration, onClose]);

  if (!message) return null;

  const typeStyles = {
    success: {
      backgroundColor: '#10b981',
      icon: '✓',
      borderColor: '#059669',
    },
    error: {
      backgroundColor: '#ef4444',
      icon: '✕',
      borderColor: '#dc2626',
    },
    warning: {
      backgroundColor: '#f59e0b',
      icon: '⚠',
      borderColor: '#d97706',
    },
    info: {
      backgroundColor: '#3b82f6',
      icon: 'ℹ',
      borderColor: '#2563eb',
    },
  };

  const style = typeStyles[type] || typeStyles.info;

  return (
    <div
      className="fixed top-4 right-4 z-50 rounded-lg shadow-lg p-4 min-w-[300px] max-w-[500px]"
      style={{
        backgroundColor: style.backgroundColor,
        borderLeft: `4px solid ${style.borderColor}`,
        animation: 'slideIn 0.3s ease-out',
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-white font-bold"
          style={{ backgroundColor: 'rgba(255, 255, 255, 0.2)' }}
        >
          {style.icon}
        </div>
        <div className="flex-1">
          <p className="text-white text-sm font-medium">{message}</p>
        </div>
        <button
          onClick={onClose}
          className="flex-shrink-0 text-white opacity-70 hover:opacity-100 transition-opacity"
          aria-label="Close"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      <style jsx>{`
        @keyframes slideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}


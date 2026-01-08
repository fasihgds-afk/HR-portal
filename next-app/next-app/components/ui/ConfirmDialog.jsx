/**
 * ConfirmDialog Component
 * 
 * Professional confirmation dialog for destructive actions
 */

'use client';

export default function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm Action',
  message = 'Are you sure you want to proceed?',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger', // 'danger' | 'warning' | 'info'
}) {
  if (!isOpen) return null;

  const variantStyles = {
    danger: {
      button: {
        backgroundColor: '#dc2626',
        hover: '#b91c1c',
      },
      icon: '⚠️',
    },
    warning: {
      button: {
        backgroundColor: '#f59e0b',
        hover: '#d97706',
      },
      icon: '⚠️',
    },
    info: {
      button: {
        backgroundColor: '#3b82f6',
        hover: '#2563eb',
      },
      icon: 'ℹ️',
    },
  };

  const style = variantStyles[variant] || variantStyles.danger;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(4px)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="bg-white rounded-lg shadow-2xl max-w-md w-full p-6"
        style={{
          animation: 'fadeIn 0.2s ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Icon and Title */}
        <div className="flex items-start gap-4 mb-4">
          <div className="text-3xl">{style.icon}</div>
          <div className="flex-1">
            <h3
              className="text-lg font-semibold mb-2"
              style={{ color: '#111827' }}
            >
              {title}
            </h3>
            <p className="text-sm" style={{ color: '#6b7280' }}>
              {message}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md border transition-colors"
            style={{
              borderColor: '#d1d5db',
              color: '#374151',
              backgroundColor: '#ffffff',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#f9fafb';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#ffffff';
            }}
          >
            {cancelText}
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className="px-4 py-2 rounded-md text-white font-medium transition-colors"
            style={{
              backgroundColor: style.button.backgroundColor,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = style.button.hover;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = style.button.backgroundColor;
            }}
          >
            {confirmText}
          </button>
        </div>

        {/* CSS Animation */}
        <style jsx>{`
          @keyframes fadeIn {
            from {
              opacity: 0;
              transform: scale(0.95);
            }
            to {
              opacity: 1;
              transform: scale(1);
            }
          }
        `}</style>
      </div>
    </div>
  );
}


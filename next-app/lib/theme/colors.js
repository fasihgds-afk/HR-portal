/**
 * Global Theme Configuration
 * 
 * Change colors here to update the entire application
 * Supports both light and dark modes
 */

export const colors = {
  // Primary Brand Colors (Change these to rebrand your app)
  primary: {
    50: '#eff6ff',
    100: '#dbeafe',
    200: '#bfdbfe',
    300: '#93c5fd',
    400: '#60a5fa',
    500: '#3b82f6',  // Main primary color
    600: '#2563eb',
    700: '#1d4ed8',
    800: '#1e40af',
    900: '#1e3a8a',
  },

  // Secondary Colors
  secondary: {
    50: '#f0fdf4',
    100: '#dcfce7',
    200: '#bbf7d0',
    300: '#86efac',
    400: '#4ade80',
    500: '#22c55e',  // Main secondary color
    600: '#16a34a',
    700: '#15803d',
    800: '#166534',
    900: '#14532d',
  },

  // Accent Colors
  accent: {
    blue: '#3b82f6',
    green: '#22c55e',
    yellow: '#fbbf24',
    orange: '#f97316',
    red: '#ef4444',
    purple: '#a855f7',
  },

  // Semantic Colors
  success: '#22c55e',
  warning: '#fbbf24',
  error: '#ef4444',
  info: '#3b82f6',

  // Dark Mode Colors
  dark: {
    background: {
      primary: '#020617',
      secondary: '#0f172a',
      tertiary: '#1e293b',
      card: '#1e293b',
      hover: '#334155',
      table: {
        header: '#1e293b',
        row: '#0f172a',
        rowEven: '#1e293b',
        rowHover: '#334155',
      },
      input: '#1e293b',
      legend: '#0f172a',
    },
    text: {
      primary: '#f1f5f9',
      secondary: '#cbd5e1',
      tertiary: '#94a3b8',
      muted: '#64748b',
      table: {
        header: '#f1f5f9',
        cell: '#cbd5e1',
      },
    },
    border: {
      default: 'rgba(55, 65, 81, 0.5)',
      hover: 'rgba(59, 130, 246, 0.3)',
      active: 'rgba(59, 130, 246, 0.5)',
      table: 'rgba(55, 65, 81, 0.8)',
      input: 'rgba(55, 65, 81, 0.8)',
    },
    gradient: {
      primary: 'linear-gradient(135deg, #0a2c54 0%, #0f5ba5 50%, #13a8e5 100%)',
      card: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
      overlay: 'radial-gradient(circle at top, #0b2344 0, #061525 40%, #020617 100%)',
      header: 'linear-gradient(135deg, #0a2c54 0%, #0f5ba5 50%, #13a8e5 100%)',
    },
  },

  // Light Mode Colors
  light: {
    background: {
      primary: '#ffffff',
      secondary: '#f8fafc',
      tertiary: '#f1f5f9',
      card: '#ffffff',
      hover: '#e2e8f0',
      table: {
        header: '#f1f5f9',
        row: '#ffffff',
        rowEven: '#f8fafc',
        rowHover: '#e2e8f0',
      },
      input: '#ffffff',
      legend: '#f8fafc',
    },
    text: {
      primary: '#0f172a',
      secondary: '#334155',
      tertiary: '#64748b',
      muted: '#94a3b8',
      table: {
        header: '#374151',
        cell: '#111827',
      },
    },
    border: {
      default: '#e2e8f0',
      hover: '#cbd5e1',
      active: '#94a3b8',
      table: '#e5e7eb',
      input: '#d1d5db',
    },
    gradient: {
      primary: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 50%, #1d4ed8 100%)',
      card: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
      overlay: 'radial-gradient(circle at top, #ffffff 0, #f8fafc 40%, #f1f5f9 100%)',
      header: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 50%, #1d4ed8 100%)',
    },
  },
};

/**
 * Get theme colors based on mode
 * @param {string} mode - 'light' or 'dark'
 * @returns {object} Theme colors object
 */
export function getThemeColors(mode = 'dark') {
  const baseColors = mode === 'dark' ? colors.dark : colors.light;
  
  return {
    ...colors,
    mode,
    background: baseColors.background,
    text: baseColors.text,
    border: baseColors.border,
    gradient: baseColors.gradient,
    // Add computed colors
    card: {
      background: baseColors.background.card,
      border: baseColors.border.default,
      shadow: mode === 'dark' 
        ? '0 8px 24px rgba(0, 0, 0, 0.3)' 
        : '0 4px 12px rgba(0, 0, 0, 0.1)',
    },
    button: {
      primary: colors.primary[500],
      primaryHover: colors.primary[600],
      secondary: baseColors.background.tertiary,
      secondaryHover: baseColors.background.hover,
    },
    table: {
      header: {
        background: baseColors.background.table.header,
        color: baseColors.text.table.header,
        border: baseColors.border.table,
      },
      cell: {
        background: baseColors.background.table.row,
        color: baseColors.text.table.cell,
        border: baseColors.border.table,
        backgroundEven: baseColors.background.table.rowEven,
        backgroundHover: baseColors.background.table.rowHover,
      },
    },
    input: {
      background: baseColors.background.input,
      border: baseColors.border.input,
      color: baseColors.text.primary,
      placeholder: baseColors.text.tertiary,
    },
  };
}

export default colors;


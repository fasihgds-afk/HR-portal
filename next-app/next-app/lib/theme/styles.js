/**
 * Theme-aware style utilities
 * Helps create consistent styles that respond to theme changes
 */

import { getThemeColors } from './colors';

/**
 * Get table styles based on theme
 */
export function getTableStyles(theme = 'dark') {
  const colors = getThemeColors(theme);
  
  return {
    th: {
      padding: '10px 12px',
      textAlign: 'left',
      borderBottom: `1px solid ${colors.border.table}`,
      fontWeight: 600,
      fontSize: 13,
      color: colors.text.table.header,
      backgroundColor: colors.background.table.header,
    },
    td: {
      padding: '9px 12px',
      borderBottom: `1px solid ${colors.border.table}`,
      fontSize: 13,
      color: colors.text.table.cell,
      backgroundColor: colors.background.table.row,
    },
    tdEven: {
      backgroundColor: colors.background.table.rowEven,
    },
    tdHover: {
      backgroundColor: colors.background.table.rowHover,
    },
  };
}

/**
 * Get input styles based on theme
 */
export function getInputStyles(theme = 'dark') {
  const colors = getThemeColors(theme);
  
  return {
    padding: '8px 12px',
    borderRadius: 8,
    border: `1px solid ${colors.border.input}`,
    backgroundColor: colors.background.input,
    color: colors.text.primary,
    fontSize: 13,
    outline: 'none',
    transition: 'border-color 0.2s, box-shadow 0.2s',
    '::placeholder': {
      color: colors.text.tertiary,
    },
    '&:focus': {
      borderColor: colors.primary[500],
      boxShadow: `0 0 0 3px ${colors.primary[100]}40`,
    },
  };
}

/**
 * Get select/dropdown styles based on theme
 */
export function getSelectStyles(theme = 'dark') {
  const colors = getThemeColors(theme);
  
  return {
    ...getInputStyles(theme),
    cursor: 'pointer',
    minWidth: 120,
  };
}

/**
 * Get card styles based on theme
 */
export function getCardStyles(theme = 'dark') {
  const colors = getThemeColors(theme);
  
  return {
    borderRadius: 16,
    background: colors.gradient.card,
    border: `1px solid ${colors.border.default}`,
    boxShadow: colors.card.shadow,
    padding: '24px',
    color: colors.text.primary,
  };
}


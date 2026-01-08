/**
 * Hook to get styled components based on current theme
 * Makes it easy to use theme colors throughout the app
 */

import { useTheme } from '@/lib/theme/ThemeContext';

export function useThemeStyles() {
  const { theme, colors } = useTheme();

  return {
    theme,
    colors,
    // Container styles
    container: {
      background: colors.gradient.overlay,
      color: colors.text.primary,
    },
    // Card styles
    card: {
      background: colors.gradient.card,
      border: `1px solid ${colors.border.default}`,
      boxShadow: colors.card.shadow,
      color: colors.text.primary,
    },
    // Header styles
    header: {
      background: colors.gradient.primary,
      color: '#ffffff',
      border: `1px solid ${colors.border.hover}`,
    },
    // Button styles
    button: {
      primary: {
        background: `linear-gradient(135deg, ${colors.button.primary}, ${colors.primary[600]})`,
        color: '#ffffff',
        border: 'none',
      },
      secondary: {
        background: colors.button.secondary,
        color: colors.text.primary,
        border: `1px solid ${colors.border.default}`,
      },
    },
    // Text styles
    text: {
      primary: { color: colors.text.primary },
      secondary: { color: colors.text.secondary },
      tertiary: { color: colors.text.tertiary },
      muted: { color: colors.text.muted },
    },
    // Input styles
    input: {
      background: colors.background.card,
      border: `1px solid ${colors.border.default}`,
      color: colors.text.primary,
    },
    // Table styles
    table: {
      header: {
        background: colors.background.tertiary,
        color: colors.text.primary,
        border: `1px solid ${colors.border.default}`,
      },
      cell: {
        background: colors.background.card,
        color: colors.text.primary,
        border: `1px solid ${colors.border.default}`,
      },
    },
  };
}


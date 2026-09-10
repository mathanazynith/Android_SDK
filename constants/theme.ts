// FrontEnd/constants/theme.ts
export const Colors = {
  primary: '#00C853',
  primaryDark: '#009624',
  primaryLight: '#69F0AE',
  background: '#0A0A0A',
  surface: '#1A1A1A',
  surfaceLight: '#2A2A2A',
  surfaceLighter: '#3A3A3A',
  text: '#FFFFFF',
  textSecondary: '#B0B0B0',
  textMuted: '#6A6A6A',
  border: '#2A2A2A',
  error: '#FF5252',
  success: '#00C853',
  warning: '#FFC107',
  info: '#2196F3',
};

export const Spacing = {
  xs: 4,
  sm: 7,
  md: 14,
  lg: 18,
  xl: 21,
  xxl: 28,
};

export const BorderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  full: 9999,
};

export const Typography = {
  h1: { fontSize: 25, fontWeight: '700' as const, lineHeight: 32 },
  h2: { fontSize: 21, fontWeight: '600' as const, lineHeight: 28 },
  h3: { fontSize: 18, fontWeight: '600' as const, lineHeight: 25 },
  h4: { fontSize: 16, fontWeight: '500' as const, lineHeight: 22 },
  body: { fontSize: 14, fontWeight: '400' as const, lineHeight: 21 },
  bodySmall: { fontSize: 12, fontWeight: '400' as const, lineHeight: 18 },
  caption: { fontSize: 11, fontWeight: '400' as const, lineHeight: 15 },
  button: { fontSize: 14, fontWeight: '600' as const, lineHeight: 21 },
};
import { createContext, useContext, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

export const BRAND_GREEN = '#22C55E';

const darkColors = {
  background: '#0D0D0D',
  surface: '#1E1E1E',
  surfaceRaised: '#262626',
  text: '#FFFFFF',
  textPrimary: '#FFFFFF',
  textSecondary: '#CBD5E1',
  textTertiary: '#94A3B8',
  border: '#334155',
  divider: '#334155',
  icon: '#FFFFFF',
  iconSecondary: '#CBD5E1',
  card: '#1E1E1E',
  inputBackground: '#262626',
  inputText: '#FFFFFF',
  placeholder: '#CBD5E1',
  primary: BRAND_GREEN,
  primaryText: '#0D0D0D',
  selected: '#163B25',
  unselected: '#262626',
  modalBackground: '#1E1E1E',
  overlay: 'rgba(0,0,0,0.64)',
  tabBackground: '#1E1E1E',
  tabActive: BRAND_GREEN,
  tabInactive: '#6B7280',
  inactive: '#6B7280',
};

const lightColors = {
  background: '#F8FAFC',
  surface: '#FFFFFF',
  surfaceRaised: '#F1F5F9',
  text: '#0F172A',
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textTertiary: '#64748B',
  border: '#E2E8F0',
  divider: '#E2E8F0',
  icon: '#0F172A',
  iconSecondary: '#475569',
  card: '#FFFFFF',
  inputBackground: '#F1F5F9',
  inputText: '#0F172A',
  placeholder: '#475569',
  primary: BRAND_GREEN,
  primaryText: '#0F172A',
  selected: '#DCFCE7',
  unselected: '#F1F5F9',
  modalBackground: '#FFFFFF',
  overlay: 'rgba(15,23,42,0.32)',
  tabBackground: '#FFFFFF',
  tabActive: BRAND_GREEN,
  tabInactive: '#94A3B8',
  inactive: '#94A3B8',
};

export type ThemeColors = typeof darkColors;

export type AppTheme = {
  isDark: boolean;
  colors: ThemeColors;
};

const ThemeContext = createContext<AppTheme>({ isDark: true, colors: darkColors });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  const isDark = scheme !== 'light';
  return <ThemeContext.Provider value={{ isDark, colors: isDark ? darkColors : lightColors }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

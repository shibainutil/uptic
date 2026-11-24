export type ThemeMode = 'dark' | 'light';

const dark = {
  bg: '#121212',
  surface: '#1E1E1E',
  surface2: '#2A2A2A',
  border: '#333333',
  text: '#F0F0F0',
  textMuted: '#888888',
  textDim: '#555555',
  accent: '#3B82F6',
  accentDark: '#2563EB',
  danger: '#EF4444',
  dangerDim: 'rgba(239,68,68,0.15)',
  success: '#22C55E',
};

const light: typeof dark = {
  bg: '#F2F3F5',
  surface: '#FFFFFF',
  surface2: '#E9EBEF',
  border: '#D9DCE1',
  text: '#16181D',
  textMuted: '#5F6670',
  textDim: '#A0A6AE',
  accent: '#3B82F6',
  accentDark: '#2563EB',
  danger: '#EF4444',
  dangerDim: 'rgba(239,68,68,0.12)',
  success: '#22C55E',
};

/**
 * The active palette. Styles all over the app read it inside module-level
 * StyleSheet.create, so it is filled once at startup (index.ts → ThemeGate, before any
 * screen module loads) and a mode switch reloads the JS bundle instead of re-rendering.
 */
export const colors = { ...dark };

export let themeMode: ThemeMode = 'dark';

export function applyThemeMode(mode: ThemeMode) {
  themeMode = mode;
  Object.assign(colors, mode === 'light' ? light : dark);
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
};

export const font = {
  sm: 12,
  md: 14,
  lg: 16,
  xl: 18,
};

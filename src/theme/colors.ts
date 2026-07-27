export const lightColors = {
  ink: '#111827',
  inkMuted: '#6B7280',
  inkSubtle: '#9CA3AF',

  primary: '#FF751F',
  primaryDark: '#E25F0E',
  primarySoft: '#FFF3EA',

  navy: '#1F2430',
  navySoft: '#F2F3F6',

  background: '#F3F4F6',
  surface: '#FFFFFF',
  surfaceAlt: '#F9FAFB',

  border: '#E5E7EB',
  borderStrong: '#D1D5DB',

  success: '#16A34A',
  successSoft: '#ECFDF5',
  danger: '#DC2626',
  dangerSoft: '#FEF2F2',
  warning: '#D97706',
  warningSoft: '#FFFBEB',

  white: '#FFFFFF',
  black: '#000000',
} as const;

export type AppColors = { [K in keyof typeof lightColors]: string };

export const darkColors: AppColors = {
  ink: '#E5E7EB',
  inkMuted: '#9CA3AF',
  inkSubtle: '#6B7280',

  primary: '#FF8A45',
  primaryDark: '#FFB183',
  primarySoft: '#3A210F',

  navy: '#111827',
  navySoft: '#1B2130',

  background: '#0B1120',
  surface: '#111827',
  surfaceAlt: '#1F2937',

  border: '#1F2937',
  borderStrong: '#374151',

  success: '#22C55E',
  successSoft: '#14271B',
  danger: '#F87171',
  dangerSoft: '#2A1517',
  warning: '#FBBF24',
  warningSoft: '#2A2211',

  white: '#FFFFFF',
  black: '#000000',
};

export const colors = lightColors;

export type ColorScheme = 'light' | 'dark';

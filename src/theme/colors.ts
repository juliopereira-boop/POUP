/**
 * Paletas do POUP — tema claro e escuro.
 *
 * Ambas expõem exatamente as mesmas chaves (AppColors), então qualquer
 * componente que use `colors.X` funciona nos dois temas. A paleta ativa é
 * fornecida pelo ThemeProvider via useTheme().
 */

export const lightColors = {
  // Marca / tinta
  ink: '#111827',
  inkMuted: '#6B7280',
  inkSubtle: '#9CA3AF',

  // Ação
  primary: '#2563EB',
  primaryDark: '#1D4ED8',
  primarySoft: '#EFF4FF',

  // Superfícies
  background: '#F3F4F6',
  surface: '#FFFFFF',
  surfaceAlt: '#F9FAFB',

  // Bordas / linhas
  border: '#E5E7EB',
  borderStrong: '#D1D5DB',

  // Feedback
  success: '#16A34A',
  successSoft: '#ECFDF5',
  danger: '#DC2626',
  dangerSoft: '#FEF2F2',
  warning: '#D97706',
  warningSoft: '#FFFBEB',

  // Neutros fixos
  white: '#FFFFFF',
  black: '#000000',
} as const;

export type AppColors = { [K in keyof typeof lightColors]: string };

export const darkColors: AppColors = {
  ink: '#E5E7EB',
  inkMuted: '#9CA3AF',
  inkSubtle: '#6B7280',

  primary: '#3B82F6',
  primaryDark: '#93C5FD',
  primarySoft: '#172554',

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

/** Paleta padrão (claro) — usada como fallback fora do ThemeProvider. */
export const colors = lightColors;

export type ColorScheme = 'light' | 'dark';

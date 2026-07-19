/**
 * Paleta central do POUP.
 * Inspirada na identidade minimalista da marca (logo preta sobre fundo claro).
 * Mantida em um único lugar para facilitar temas/dark mode no futuro.
 */
export const colors = {
  // Marca / tinta
  ink: '#111827', // preto suave — texto principal e logo
  inkMuted: '#6B7280', // texto secundário
  inkSubtle: '#9CA3AF', // placeholders, legendas

  // Ação
  primary: '#2563EB',
  primaryDark: '#1D4ED8',
  primarySoft: '#EFF4FF',

  // Superfícies
  background: '#F3F4F6', // fundo cinza claro do app
  surface: '#FFFFFF', // cards
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

  // Neutros
  white: '#FFFFFF',
  black: '#000000',
} as const;

export type AppColors = typeof colors;

import { colors } from './colors';

/** Espaçamentos em escala de 4pt. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

/** Raios de canto. */
export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

/** Tipografia — tamanhos e pesos. */
export const typography = {
  display: { fontSize: 28, fontWeight: '700' as const, lineHeight: 34 },
  title: { fontSize: 22, fontWeight: '700' as const, lineHeight: 28 },
  heading: { fontSize: 18, fontWeight: '600' as const, lineHeight: 24 },
  body: { fontSize: 16, fontWeight: '400' as const, lineHeight: 22 },
  label: { fontSize: 14, fontWeight: '600' as const, lineHeight: 18 },
  caption: { fontSize: 13, fontWeight: '400' as const, lineHeight: 16 },
} as const;

/** Sombra suave e consistente entre plataformas (iOS/Android/Web). */
export const shadow = {
  card: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  floating: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 6,
  },
} as const;

/**
 * Largura máxima do conteúdo em telas grandes (PC/tablet).
 * O app é mobile-first; em telas largas centralizamos o conteúdo
 * para não "esticar" e manter a leitura confortável.
 */
export const layout = {
  maxContentWidth: 640,
} as const;

export const theme = { colors, spacing, radius, typography, shadow, layout } as const;
export { colors };
export type Theme = typeof theme;

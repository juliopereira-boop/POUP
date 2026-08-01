import { useTheme } from '@/providers/ThemeProvider';

/**
 * Paleta categórica dos gráficos.
 *
 * Mora aqui, e não em `src/theme/colors.ts`, porque não é cor de marca: é cor
 * de dado. Categorias vizinhas precisam ser distinguíveis entre si, o que a
 * paleta do app não garante — `warning` (âmbar) fica quase igual ao laranja
 * primário quando as duas aparecem coladas numa barra empilhada.
 *
 * A primeira cor é a da marca, para o gráfico continuar parecendo POUP.
 */
const LIGHT = [
  '#FF751F', // laranja da marca
  '#0E9F6E', // verde
  '#2563EB', // azul
  '#7C3AED', // violeta
  '#D97706', // âmbar
  '#0891B2', // ciano
  '#6B7280', // cinza
] as const;

const DARK = [
  '#FF8A45',
  '#34D399',
  '#60A5FA',
  '#A78BFA',
  '#FBBF24',
  '#22D3EE',
  '#9CA3AF',
] as const;

export function useCategoricalPalette(): string[] {
  const { isDark } = useTheme();
  return [...(isDark ? DARK : LIGHT)];
}

/** Cor da categoria `index`, dando a volta na paleta quando estourar. */
export function categoryColor(palette: string[], index: number): string {
  return palette[index % palette.length] ?? palette[0];
}

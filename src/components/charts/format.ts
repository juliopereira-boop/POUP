/**
 * Formatação pt-BR compartilhada pelos gráficos (e reaproveitável pela tela
 * de vendas — `abbreviateBRL` é o helper oficial do eixo/rótulo de valor).
 */

/** `R$ 1.234.567,89` — padrão do projeto para dinheiro por extenso. */
export function formatCurrencyBRL(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return safe.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** 1,2 mi / 12,5 mil precisam de casa decimal; 340 mil / 120 mi não. */
function decimalsFor(scaled: number): number {
  return Math.abs(scaled) >= 100 ? 0 : 1;
}

function ptNumber(value: number, fractionDigits: number): string {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
  });
}

/**
 * Dinheiro abreviado para rótulo de gráfico e card de KPI:
 * `R$ 1,2 mi`, `R$ 340 mil`, `R$ 1,5 mil`, `R$ 950`, `R$ 0`.
 *
 * Muito mais legível que o número inteiro embaixo de uma barra de 30px.
 * Corte escolhido: abrevia a partir de mil (1.500 -> `R$ 1,5 mil`), porque em
 * vendas de imóveis todo valor relevante é de milhares para cima.
 */
export function abbreviateBRL(n: number): string {
  const safe = Number.isFinite(n) ? n : 0;
  const sign = safe < 0 ? '-' : '';
  const abs = Math.abs(safe);

  if (abs >= 1_000_000_000) {
    const scaled = abs / 1_000_000_000;
    return `${sign}R$ ${ptNumber(scaled, decimalsFor(scaled))} bi`;
  }
  if (abs >= 1_000_000) {
    const scaled = abs / 1_000_000;
    return `${sign}R$ ${ptNumber(scaled, decimalsFor(scaled))} mi`;
  }
  if (abs >= 1_000) {
    const scaled = abs / 1_000;
    return `${sign}R$ ${ptNumber(scaled, decimalsFor(scaled))} mil`;
  }
  return `${sign}R$ ${ptNumber(abs, 0)}`;
}

/** Alias legível dentro dos gráficos. */
export const formatCompactBRL = abbreviateBRL;

/** `12,5%` a partir de um percentual já em 0–100. `null` => `—`. */
export function formatPercent(pct: number | null, fractionDigits = 1): string {
  if (pct === null || !Number.isFinite(pct)) return '—';
  return `${pct.toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
  })}%`;
}

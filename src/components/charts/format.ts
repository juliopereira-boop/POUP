/**
 * Formatação pt-BR compartilhada pelos gráficos (e reaproveitável pela tela).
 */

/** `R$ 1.234.567,89` — padrão do projeto para dinheiro por extenso. */
export function formatCurrencyBRL(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return safe.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function decimals(scaled: number): number {
  // 1,2 mi / 12,5 mil precisam de casa decimal; 340 mil / 120 mi não.
  return Math.abs(scaled) >= 100 ? 0 : 1;
}

function ptNumber(value: number, fractionDigits: number): string {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
  });
}

/**
 * Valor abreviado para eixo de gráfico: `R$ 1,2 mi`, `R$ 340 mil`, `R$ 950`.
 * Muito mais legível que o número inteiro embaixo de uma barra de 30px.
 */
export function formatCompactBRL(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  const sign = safe < 0 ? '-' : '';
  const abs = Math.abs(safe);

  if (abs >= 1_000_000_000) {
    const scaled = abs / 1_000_000_000;
    return `${sign}R$ ${ptNumber(scaled, decimals(scaled))} bi`;
  }
  if (abs >= 1_000_000) {
    const scaled = abs / 1_000_000;
    return `${sign}R$ ${ptNumber(scaled, decimals(scaled))} mi`;
  }
  if (abs >= 1_000) {
    const scaled = abs / 1_000;
    return `${sign}R$ ${ptNumber(scaled, decimals(scaled))} mil`;
  }
  return `${sign}R$ ${ptNumber(abs, abs < 10 && abs % 1 !== 0 ? 2 : 0)}`;
}

/** `12,5%` a partir de um percentual já em 0–100. `null` => `—`. */
export function formatPercent(pct: number | null, fractionDigits = 1): string {
  if (pct === null || !Number.isFinite(pct)) return '—';
  return `${pct.toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
  })}%`;
}

/** `12,5%` a partir de uma razão 0–1 (taxas de conversão/distrato). */
export function formatRate(ratio: number | null, fractionDigits = 1): string {
  if (ratio === null || !Number.isFinite(ratio)) return '—';
  return formatPercent(ratio * 100, fractionDigits);
}

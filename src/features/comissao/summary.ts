/**
 * Números em PT-BR e o resumo de uma linha da regra de comissão.
 *
 * Vive em módulo PURO (sem React/React Native) porque a camada de dados também
 * precisa do resumo: `db.catalog.list` mostra a regra de cada empresa do
 * catálogo no aviso de aceite, e um repositório não pode importar componente de
 * tela — além de arrastar o React para dentro do data layer, quebraria qualquer
 * teste sem DOM. `@/components/CommissionRuleForm` reexporta estas funções, para
 * as telas que já importavam de lá continuarem funcionando.
 */
import type { CommissionRule } from '@/data/types';

/** Lê número digitado em PT-BR (aceita vírgula e ponto). Vazio/invalido = null. */
export function parseDecimalBR(input: string): number | null {
  const raw = input.trim().replace(/\s/g, '').replace(',', '.');
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Mostra número com vírgula decimal e sem zeros à direita. Ex.: 2.5 -> "2,5". */
export function formatDecimalBR(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '';
  return String(Math.round(value * 100) / 100).replace('.', ',');
}

export function formatPct(value: number | null | undefined): string {
  return value == null ? '—' : `${formatDecimalBR(value)}%`;
}

/**
 * Resumo curto para listagens. Ex.: "2% · 2x".
 *
 * Recebe só os dois campos que usa (e não a regra inteira) para quem monta a
 * lista poder ler apenas essas colunas do banco.
 */
export function describeCommissionRule(
  rule: Pick<CommissionRule, 'defaultPct' | 'installmentsCount'> | null,
): string {
  if (!rule) return '—';
  const parcelas = rule.installmentsCount <= 1 ? 'pagamento único' : `${rule.installmentsCount}x`;
  return `${formatPct(rule.defaultPct)} · ${parcelas}`;
}

/**
 * Motor de cálculo do módulo "Comissões".
 *
 * Funções PURAS: não leem banco, não tocam em estado, não mutam nada do que
 * recebem. Quem grava é `db.commissions.createForSale`; aqui só se monta o
 * payload.
 *
 * ------------------------------------------------------------------
 * DINHEIRO — a soma das parcelas é SEMPRE igual ao total
 * ------------------------------------------------------------------
 * Todo o rateio é feito em CENTAVOS INTEIROS: cada parcela, menos a última,
 * recebe o piso da sua fatia; a ÚLTIMA recebe exatamente o que falta. Isso
 * garante três coisas de uma vez:
 *   1. `soma(parcelas) === total` exatamente, em qualquer cenário;
 *   2. nenhuma parcela negativa (o piso nunca passa da fatia exata);
 *   3. a sobra de arredondamento cai na ÚLTIMA parcela.
 * Ex.: 1.000,00 em 3x -> 333,33 + 333,33 + 333,34.
 *
 * ------------------------------------------------------------------
 * DATAS — armadilha recorrente neste repo
 * ------------------------------------------------------------------
 * `new Date('2026-08-01')` é lido como UTC e, no Brasil (UTC-3), volta 31/07
 * local; `toISOString().slice(0, 10)` adianta o dia à noite. Aqui NENHUMA data
 * em `YYYY-MM-DD` passa pelo construtor `Date(string)`: elas são lidas por
 * partes (regex) e a soma de dias é feita com `Date.UTC` + `getUTC*`, o que
 * também imuniza contra horário de verão. Mesmo padrão de
 * `src/features/vendas/kpis.ts` e `src/features/vendas/period.ts`.
 */

import {
  DEFAULT_COMMISSION_RULE,
  type Commission,
  type CommissionCampaign,
  type CommissionInstallment,
  type CommissionRule,
  type CommissionRuleInput,
  type CommissionSource,
  type Sale,
} from '@/data/types';

/* ------------------------------------------------------------------------- *
 * Tipos públicos
 * ------------------------------------------------------------------------- */

/** Percentual que vale numa data, e de onde ele saiu. */
export interface ResolvedRate {
  pct: number;
  source: CommissionSource;
  /** Nome da campanha quando `source = 'campanha'`; `null` nos outros casos. */
  campaignName: string | null;
}

/** Uma parcela recém-calculada (ainda sem status nem ids). */
export interface GeneratedInstallment {
  /** 1, 2, 3… na ordem de vencimento. */
  number: number;
  /** `YYYY-MM-DD`. */
  dueDate: string;
  /** Em reais, com no máximo 2 casas. */
  value: number;
}

/* ------------------------------------------------------------------------- *
 * Limites de sanidade
 * ------------------------------------------------------------------------- */

/**
 * Teto de parcelas. Protege a tela de um `installmentsCount` absurdo
 * (dado digitado errado, ex.: 100000) gerar um array gigante.
 */
export const MAX_INSTALLMENTS = 360;

/**
 * Folga aceita na soma do `installmentsSplit` (em pontos percentuais).
 * `[33.33, 33.33, 33.34]` soma 100 com sujeira de ponto flutuante; um split
 * que erra mais que isso é considerado inválido e cai no rateio igualitário.
 */
const SPLIT_SUM_TOLERANCE = 0.01;

/** Poeira de ponto flutuante absorvida antes do `Math.floor` do rateio. */
const FLOOR_EPSILON = 1e-6;

/* ------------------------------------------------------------------------- *
 * Helpers numéricos (privados)
 * ------------------------------------------------------------------------- */

/** Número utilizável ou `0`. Blinda contra `null`, `undefined`, `NaN` e `Infinity`. */
function num(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return value;
}

/** Reais -> centavos inteiros. Negativo e valor inválido viram `0`. */
function toCents(value: number | null | undefined): number {
  const n = num(value);
  if (n <= 0) return 0;
  return Math.round(n * 100);
}

/** Centavos -> reais, com no máximo 2 casas. */
function fromCents(cents: number): number {
  return cents / 100;
}

/* ------------------------------------------------------------------------- *
 * Helpers de data (privados) — sempre por partes, nunca `new Date(string)`
 * ------------------------------------------------------------------------- */

const YMD_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;

interface Ymd {
  year: number;
  month: number; // 1–12
  day: number;
}

/** Lê `YYYY-MM-DD` sem `new Date`. `null` quando o formato não bate. */
function parseYmd(value: string | null | undefined): Ymd | null {
  if (typeof value !== 'string') return null;
  const match = YMD_RE.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Soma `days` dias de calendário a uma data em partes e devolve `YYYY-MM-DD`.
 * Usa `Date.UTC` + `getUTC*`: sem fuso, sem horário de verão, sem surpresa em
 * virada de mês, de ano ou em 29/02 de ano bissexto.
 */
function addDaysYmd(base: Ymd, days: number): string {
  const d = new Date(Date.UTC(base.year, base.month - 1, base.day + days));
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/* ------------------------------------------------------------------------- *
 * Saneamento da regra
 * ------------------------------------------------------------------------- */

type AnyRule = CommissionRule | CommissionRuleInput;

/** Quantidade de parcelas usável: inteiro entre 1 e `MAX_INSTALLMENTS`. */
function sanitizeCount(value: number | null | undefined): number {
  const n = num(value);
  const int = Math.floor(n);
  if (int < 1) return 1;
  return int > MAX_INSTALLMENTS ? MAX_INSTALLMENTS : int;
}

/**
 * Dias usáveis: inteiro >= 0. Valor inválido cai no padrão do sistema;
 * negativo (que faria a parcela vencer antes da venda) é fixado em 0.
 */
function sanitizeDays(value: number | null | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const int = Math.round(value);
  return int < 0 ? 0 : int;
}

/**
 * Pesos de rateio a partir do `installmentsSplit`.
 *
 * O split só é aceito quando: é array, tem exatamente `count` itens, todos os
 * itens são números finitos e >= 0, e a soma bate 100 (com `SPLIT_SUM_TOLERANCE`
 * de folga). Qualquer outra coisa — `null`, vazio, tamanho diferente de
 * `count`, item negativo/`NaN`, soma ≠ 100 — cai no rateio IGUALITÁRIO, que é o
 * comportamento que o cadastro documenta para `null`.
 */
function resolveWeights(split: number[] | null | undefined, count: number): number[] {
  const equal = new Array<number>(count).fill(1);
  if (!Array.isArray(split) || split.length !== count) return equal;

  let sum = 0;
  for (const raw of split) {
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) return equal;
    sum += raw;
  }
  if (Math.abs(sum - 100) > SPLIT_SUM_TOLERANCE) return equal;
  if (sum <= 0) return equal;

  return split.slice();
}

/* ------------------------------------------------------------------------- *
 * (a) Qual percentual vale numa data
 * ------------------------------------------------------------------------- */

/** Campanha utilizável? Precisa de pct válido e período coerente. */
function campaignIsUsable(c: CommissionCampaign | null | undefined): c is CommissionCampaign {
  if (!c) return false;
  if (typeof c.pct !== 'number' || !Number.isFinite(c.pct) || c.pct < 0) return false;
  const starts = parseYmd(c.startsOn);
  const ends = parseYmd(c.endsOn);
  if (!starts || !ends) return false;
  // Período invertido é cadastro furado: ignoramos a campanha em vez de adivinhar.
  return c.startsOn.trim() <= c.endsOn.trim();
}

/**
 * Percentual que vale em `saleDateYmd`.
 *
 * - Base: `rule.defaultPct`. Sem regra (ou com `defaultPct` inválido) usa
 *   `DEFAULT_COMMISSION_RULE.defaultPct` e `source = 'padrao'`.
 * - Campanha vigente na data (`startsOn <= data <= endsOn`, INCLUSIVO nas duas
 *   pontas) ganha do padrão e devolve `source = 'campanha'`. A comparação é
 *   lexicográfica entre strings `YYYY-MM-DD`, o que equivale à comparação de
 *   datas e não passa por `new Date`.
 * - Uma campanha vigente ganha do padrão mesmo quando não existe regra
 *   cadastrada: a campanha foi cadastrada de propósito, com percentual e prazo.
 *
 * EMPATE (duas ou mais campanhas vigentes na mesma data): vence a de MAIOR
 * percentual — é o que o corretor espera de uma campanha promocional. Havendo
 * empate no percentual, vence a que começou mais tarde (a mais recente); depois
 * o nome em ordem alfabética; por último o `id`. Ou seja: determinístico,
 * independente da ordem em que o banco devolveu a lista.
 *
 * Data da venda ilegível => campanhas são ignoradas (não há como comparar) e
 * devolve-se o percentual padrão.
 */
export function resolveRate(
  rule: AnyRule | null,
  campaigns: CommissionCampaign[],
  saleDateYmd: string,
): ResolvedRate {
  const rawPct = rule ? rule.defaultPct : DEFAULT_COMMISSION_RULE.defaultPct;
  const basePct =
    typeof rawPct === 'number' && Number.isFinite(rawPct) && rawPct >= 0
      ? rawPct
      : DEFAULT_COMMISSION_RULE.defaultPct;

  const fallback: ResolvedRate = { pct: basePct, source: 'padrao', campaignName: null };

  const date = parseYmd(saleDateYmd);
  if (!date) return fallback;
  const day = saleDateYmd.trim();

  const list = Array.isArray(campaigns) ? campaigns : [];
  let best: CommissionCampaign | null = null;

  for (const c of list) {
    if (!campaignIsUsable(c)) continue;
    if (c.startsOn.trim() > day || c.endsOn.trim() < day) continue;
    if (!best || betterCampaign(c, best)) best = c;
  }

  if (!best) return fallback;
  return {
    pct: best.pct,
    source: 'campanha',
    campaignName: typeof best.name === 'string' && best.name.trim() ? best.name.trim() : null,
  };
}

/** Critério de desempate entre campanhas vigentes (ver `resolveRate`). */
function betterCampaign(candidate: CommissionCampaign, current: CommissionCampaign): boolean {
  if (candidate.pct !== current.pct) return candidate.pct > current.pct;
  const candidateStart = candidate.startsOn.trim();
  const currentStart = current.startsOn.trim();
  if (candidateStart !== currentStart) return candidateStart > currentStart;
  const byName = String(candidate.name ?? '').localeCompare(String(current.name ?? ''), 'pt-BR');
  if (byName !== 0) return byName < 0;
  return String(candidate.id ?? '') < String(current.id ?? '');
}

/* ------------------------------------------------------------------------- *
 * (b) Gerar as parcelas
 * ------------------------------------------------------------------------- */

/**
 * Quebra `totalValue` nas parcelas da regra, com vencimentos.
 *
 * Valores:
 * - Rateio em centavos inteiros pelo método cumulativo, então
 *   `soma(parcelas) === totalValue` SEMPRE (ver cabeçalho do arquivo). A sobra
 *   fica na última parcela e nenhuma parcela é negativa.
 * - `installmentsSplit` define o peso de cada parcela; `null`, vazio ou
 *   inválido => divisão igualitária (ver `resolveWeights`).
 *
 * Vencimentos:
 * - 1ª parcela = data da venda + `firstPaymentDays`;
 * - cada seguinte soma `intervalDays`.
 *
 * Entrada suja (comportamento definido, nunca `NaN` nem array vazio):
 * - `totalValue` negativo, `NaN`, `Infinity` ou `null` => total 0; as parcelas
 *   saem com valor 0 (e as datas certas), nunca com valor negativo;
 * - `installmentsCount` 0, negativo, fracionário ou inválido => 1 parcela;
 *   acima de `MAX_INSTALLMENTS` => limitado ao teto;
 * - `firstPaymentDays`/`intervalDays` inválidos => padrão do sistema (30);
 *   negativos => 0;
 * - `saleDateYmd` ilegível => os vencimentos saem como string vazia, para o
 *   erro aparecer na gravação em vez de inventarmos uma data errada.
 *
 * O array devolvido tem sempre pelo menos 1 item.
 */
export function generateInstallments(
  totalValue: number,
  rule: AnyRule,
  saleDateYmd: string,
): GeneratedInstallment[] {
  const count = sanitizeCount(rule?.installmentsCount);
  const weights = resolveWeights(rule?.installmentsSplit, count);
  const firstPaymentDays = sanitizeDays(
    rule?.firstPaymentDays,
    DEFAULT_COMMISSION_RULE.firstPaymentDays,
  );
  const intervalDays = sanitizeDays(rule?.intervalDays, DEFAULT_COMMISSION_RULE.intervalDays);

  const totalCents = toCents(totalValue);
  const totalWeight = weights.reduce((acc, w) => acc + w, 0);

  const base = parseYmd(saleDateYmd);

  // ---- Rateio em centavos: piso em todas, sobra na última ------------------
  const cents = new Array<number>(count).fill(0);
  let placedCents = 0;
  for (let i = 0; i < count - 1; i += 1) {
    // `FLOOR_EPSILON` absorve a poeira de ponto flutuante (ex.: 33329,999…99
    // que na verdade é 33330) antes do piso.
    const share = Math.floor((totalCents * weights[i]) / totalWeight + FLOOR_EPSILON);
    const safe = share < 0 ? 0 : share;
    cents[i] = safe;
    placedCents += safe;
  }
  cents[count - 1] = totalCents - placedCents;

  // Defensivo: a última nunca deveria ficar negativa (o piso não passa da
  // fatia exata), mas se um split patológico chegar aqui, devolvemos centavos
  // das parcelas anteriores até zerar — sem nunca quebrar a soma total.
  for (let i = count - 2; i >= 0 && cents[count - 1] < 0; i -= 1) {
    const give = Math.min(cents[i], -cents[count - 1]);
    cents[i] -= give;
    cents[count - 1] += give;
  }

  const out: GeneratedInstallment[] = [];
  for (let i = 0; i < count; i += 1) {
    out.push({
      number: i + 1,
      dueDate: base ? addDaysYmd(base, firstPaymentDays + i * intervalDays) : '',
      value: fromCents(cents[i]),
    });
  }

  return out;
}

/* ------------------------------------------------------------------------- *
 * (c) Montar a comissão de uma venda
 * ------------------------------------------------------------------------- */

/** Snapshot de texto: `null` quando não há nome (o histórico aceita nulo). */
function snapshot(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/**
 * Monta o payload que `db.commissions.createForSale` espera: a comissão da
 * venda + as parcelas já calculadas.
 *
 * Total e percentual:
 * - Venda com `commissionValue` preenchido (número finito >= 0) => ELE MANDA e
 *   `source = 'manual'` (o corretor negociou aquele valor). O `pct` gravado é o
 *   percentual equivalente (`total ÷ valor da venda × 100`); quando a venda não
 *   tem valor, cai em `sale.commissionPct` e, na falta dele, 0.
 *   `commissionValue` negativo é dado sujo: é ignorado e a regra volta a valer.
 * - Sem `commissionValue` => `resolveRate` sobre `sale.saleValue`, com
 *   `source = 'padrao'` ou `'campanha'`.
 *
 * Parcelamento: `rule` quando existe, `DEFAULT_COMMISSION_RULE` quando não.
 * Snapshots (`companyName`, `developmentName`, `clientName`, `saleValue`,
 * `saleDate`) saem da venda — o histórico não muda se o cadastro for editado.
 * As parcelas nascem pendentes, sem pagamento e sem nota.
 */
export function buildCommissionForSale(
  sale: Sale,
  rule: CommissionRule | null,
  campaigns: CommissionCampaign[],
): {
  commission: Omit<Commission, 'id' | 'createdAt' | 'updatedAt'>;
  installments: Omit<CommissionInstallment, 'id' | 'commissionId'>[];
} {
  const saleValue = num(sale?.saleValue);
  const saleDate = typeof sale?.saleDate === 'string' ? sale.saleDate.trim() : '';

  const manualValue = sale?.commissionValue;
  const isManual =
    typeof manualValue === 'number' && Number.isFinite(manualValue) && manualValue >= 0;

  let totalValue: number;
  let pct: number;
  let source: CommissionSource;
  let campaignName: string | null;

  if (isManual) {
    totalValue = fromCents(toCents(manualValue));
    source = 'manual';
    campaignName = null;
    if (saleValue > 0) {
      pct = (totalValue / saleValue) * 100;
    } else {
      const salePct = sale?.commissionPct;
      pct = typeof salePct === 'number' && Number.isFinite(salePct) && salePct >= 0 ? salePct : 0;
    }
  } else {
    const resolved = resolveRate(rule, campaigns, saleDate);
    pct = resolved.pct;
    source = resolved.source;
    campaignName = resolved.campaignName;
    totalValue = fromCents(toCents((saleValue * pct) / 100));
  }

  const effectiveRule: AnyRule = rule ?? DEFAULT_COMMISSION_RULE;
  const generated = generateInstallments(totalValue, effectiveRule, saleDate);

  const commission: Omit<Commission, 'id' | 'createdAt' | 'updatedAt'> = {
    saleId: sale?.id ?? '',
    companyId: sale?.companyId ?? null,
    companyName: snapshot(sale?.companyName),
    developmentName: snapshot(sale?.developmentName),
    clientName: typeof sale?.clientName === 'string' ? sale.clientName.trim() : '',
    saleValue,
    saleDate,
    pct,
    source,
    campaignName,
    totalValue,
    notes: null,
  };

  const installments: Omit<CommissionInstallment, 'id' | 'commissionId'>[] = generated.map(
    (item) => ({
      number: item.number,
      dueDate: item.dueDate,
      value: item.value,
      status: 'pendente',
      paidDate: null,
      paidValue: null,
      invoiceStatus: 'nao_emitida',
      invoiceNumber: null,
      invoiceUrl: null,
      invoiceIssuedAt: null,
      notes: null,
    }),
  );

  return { commission, installments };
}

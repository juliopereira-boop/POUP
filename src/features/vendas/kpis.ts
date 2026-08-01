/**
 * Motor de KPIs do módulo "Vendas Realizadas".
 *
 * Funções PURAS: não leem banco, não tocam em estado, não mutam o array
 * recebido. Toda a tela de vendas (cards de indicador + gráficos) sai de
 * `computeSaleKpis`.
 *
 * ------------------------------------------------------------------
 * CONVENÇÃO DE VALOR AUSENTE (a tela mostra "—" quando vem `null`)
 * ------------------------------------------------------------------
 * - Somas e contagens  -> sempre `number` (`0` quando não há nada a somar).
 * - Médias e taxas     -> `null` quando não existe base de cálculo
 *   (lista vazia, `leadsNoPeriodo = 0`, total zero). NUNCA `NaN`/`Infinity`.
 * - Exceção acordada com a tela: `composicao[].pct` é sempre `number` (vale
 *   `0` quando o total da composição é zero), porque a legenda do gráfico
 *   imprime o percentual direto.
 *
 * ------------------------------------------------------------------
 * DATAS — armadilha recorrente neste repo
 * ------------------------------------------------------------------
 * `new Date('2026-08-01')` é interpretado como UTC e, no Brasil (UTC-3),
 * volta 31/07 local; `toISOString().slice(0,10)` adianta o dia à noite.
 * Aqui NENHUMA data em `YYYY-MM-DD` passa pelo construtor `Date`: elas são
 * lidas por partes (regex) e as diferenças em dias de calendário são feitas
 * com `Date.UTC` das partes, o que também imuniza contra horário de verão.
 */

import type { Sale } from '@/data/types';

/* ------------------------------------------------------------------------- *
 * Tipos públicos
 * ------------------------------------------------------------------------- */

/** Ponto da série mensal de VGV (gráfico de barras) — ordem cronológica. */
export interface VgvMesPoint {
  /** Rótulo curto em pt-BR, ex.: `ago/26`. */
  label: string;
  vgv: number;
  count: number;
}

/** Linha de ranking (por empreendimento ou por construtora). */
export interface RankingEntry {
  label: string;
  vgv: number;
  count: number;
}

/** Uma fatia da composição do pagamento. */
export interface ComposicaoEntry {
  /** Rótulo em PT-BR pronto para a legenda. */
  label: string;
  value: number;
  /** Percentual sobre o total da composição (0–100). `0` quando o total é zero. */
  pct: number;
}

export interface SaleKpis {
  /** Soma de `saleValue` das vendas ativas. Distratadas não entram no VGV. */
  vgv: number;
  /** Quantidade de vendas ativas. */
  totalVendas: number;
  /** Quantidade de vendas distratadas no conjunto recebido. */
  totalDistratos: number;
  /** VGV ÷ vendas ativas. `null` sem vendas ativas. */
  ticketMedio: number | null;
  /** Soma das comissões das ativas (valor informado ou `commissionPct` × `saleValue`). */
  comissaoTotal: number;
  /** Média de dias de calendário entre `originStartedAt` e `saleDate`. `null` sem amostra. */
  cicloMedioDias: number | null;
  /** Quantas vendas entraram na média do ciclo (a média de 2 não vale a de 50). */
  cicloMedioBase: number;
  /** Vendas ativas ÷ leads do período, EM PERCENTUAL (ex.: 12.5). `null` sem leads. */
  taxaConversao: number | null;
  /** Distratadas ÷ (ativas + distratadas), EM PERCENTUAL. `null` sem vendas. */
  taxaDistrato: number | null;
  /** Eco do parâmetro recebido (já saneado: nunca negativo nem `NaN`). */
  leadsNoPeriodo: number;
  /** Série cronológica sem furos: mês sem venda aparece com zero. */
  vgvPorMes: VgvMesPoint[];
  /** Ranking por empreendimento, VGV desc. */
  porEmpreendimento: RankingEntry[];
  /** Ranking por construtora (empresa), VGV desc. */
  porConstrutora: RankingEntry[];
  /** Composição do pagamento das ativas: financiamento → subsídio → FGTS → próprios. */
  composicao: ComposicaoEntry[];
}

/* ------------------------------------------------------------------------- *
 * Rótulos e constantes
 * ------------------------------------------------------------------------- */

export const NO_DEVELOPMENT_LABEL = 'Sem empreendimento';
export const NO_COMPANY_LABEL = 'Sem construtora';

export const COMPOSICAO_LABELS = [
  'Financiamento',
  'Subsídio',
  'FGTS',
  'Recursos próprios',
] as const;

const MONTH_ABBR = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
] as const;

/**
 * Teto de segurança da série mensal. Se uma data suja (ex.: ano 1900) esticar
 * o intervalo, mantemos apenas os 120 meses mais recentes em vez de gerar
 * milhares de pontos e travar o gráfico.
 */
const MAX_MONTHS = 120;

/* ------------------------------------------------------------------------- *
 * Helpers numéricos e de data (privados)
 * ------------------------------------------------------------------------- */

/** Número utilizável ou `0`. Blinda contra `null`, `undefined`, `NaN` e `Infinity`. */
function num(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return value;
}

/** Divisão segura: `null` quando não há base de cálculo. Nunca `NaN`/`Infinity`. */
function safeDivide(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return null;
  if (denominator === 0) return null;
  const result = numerator / denominator;
  return Number.isFinite(result) ? result : null;
}

/** Igual a `safeDivide`, mas devolvendo percentual (0–100). */
function safePercent(numerator: number, denominator: number): number | null {
  const ratio = safeDivide(numerator, denominator);
  return ratio === null ? null : ratio * 100;
}

interface Ymd {
  year: number;
  month: number; // 1–12
  day: number;
}

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * Lê `YYYY-MM-DD` (ou o começo de um ISO) SEM `new Date`, para não cair no
 * deslocamento de fuso. Devolve `null` quando o formato ou o valor é inválido.
 */
function parseYmd(value: string | null | undefined): Ymd | null {
  if (typeof value !== 'string') return null;
  const match = YMD_RE.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

/**
 * Dia de calendário LOCAL de um timestamp (`originStartedAt`).
 * Aceita também `YYYY-MM-DD` puro, que é lido por partes.
 */
function localYmdFromTimestamp(value: string | null | undefined): Ymd | null {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw) return null;
  // Data pura (sem hora): ler por partes, jamais pelo construtor Date.
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return parseYmd(raw);
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return parseYmd(raw);
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
}

/**
 * Diferença em DIAS DE CALENDÁRIO entre dois dias locais. Usa `Date.UTC` das
 * partes: sem hora, sem fuso e sem horário de verão no meio do caminho.
 */
function diffCalendarDays(from: Ymd, to: Ymd): number {
  const a = Date.UTC(from.year, from.month - 1, from.day);
  const b = Date.UTC(to.year, to.month - 1, to.day);
  return Math.round((b - a) / 86_400_000);
}

/** Índice absoluto do mês, para varrer o intervalo sem furos. */
function monthIndex(ymd: Ymd): number {
  return ymd.year * 12 + (ymd.month - 1);
}

/** `ago/26` — mês abreviado em pt-BR + ano com dois dígitos. */
function monthLabelFromIndex(index: number): string {
  const year = Math.floor(index / 12);
  const month = index % 12;
  return `${MONTH_ABBR[month]}/${String(year % 100).padStart(2, '0')}`;
}

/** Nome de agrupamento, com fallback para não descartar a venda do ranking. */
function groupLabel(name: string | null | undefined, fallback: string): string {
  if (typeof name !== 'string') return fallback;
  const trimmed = name.trim();
  return trimmed ? trimmed : fallback;
}

/* ------------------------------------------------------------------------- *
 * Regras de negócio auxiliares (exportadas: a tela reaproveita)
 * ------------------------------------------------------------------------- */

/** Distratada? Qualquer outro status conta como venda ativa. */
export function isDistrato(sale: Sale): boolean {
  return sale.status === 'distratada';
}

/**
 * Comissão de UMA venda: usa `commissionValue`; se for nulo, aplica
 * `commissionPct` sobre `saleValue`; se os dois faltarem, vale zero.
 */
export function saleCommission(sale: Sale): number {
  const value = sale.commissionValue;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const pct = sale.commissionPct;
  if (typeof pct === 'number' && Number.isFinite(pct)) {
    return (num(sale.saleValue) * pct) / 100;
  }
  return 0;
}

/**
 * Ciclo de UMA venda em dias de calendário. `null` sem `originStartedAt` ou
 * com data inválida. Origem posterior à venda (dado sujo) vira `0` em vez de
 * puxar a média para baixo com número negativo.
 */
export function saleCycleDays(sale: Sale): number | null {
  const origin = localYmdFromTimestamp(sale.originStartedAt);
  const closed = parseYmd(sale.saleDate);
  if (!origin || !closed) return null;
  const days = diffCalendarDays(origin, closed);
  if (!Number.isFinite(days)) return null;
  return days < 0 ? 0 : days;
}

/* ------------------------------------------------------------------------- *
 * Motor
 * ------------------------------------------------------------------------- */

function rankingFromMap(map: Map<string, RankingEntry>): RankingEntry[] {
  // Array novo (nunca mutamos a entrada) e ordem determinística.
  return Array.from(map.values()).sort((a, b) => {
    if (b.vgv !== a.vgv) return b.vgv - a.vgv;
    if (b.count !== a.count) return b.count - a.count;
    return a.label.localeCompare(b.label, 'pt-BR');
  });
}

function addToRanking(map: Map<string, RankingEntry>, label: string, vgv: number): void {
  const current = map.get(label);
  if (current) {
    current.vgv += vgv;
    current.count += 1;
    return;
  }
  map.set(label, { label, vgv, count: 1 });
}

/**
 * Calcula todos os KPIs de uma lista de vendas já filtrada pelo período.
 *
 * @param sales Vendas do período (ativas e distratadas juntas).
 * @param leadsNoPeriodo Leads do mesmo período, para a taxa de conversão.
 *   `0` (ou negativo/inválido) => `taxaConversao = null`.
 */
export function computeSaleKpis(sales: Sale[], leadsNoPeriodo: number): SaleKpis {
  const list = Array.isArray(sales) ? sales : [];

  let vgv = 0;
  let totalVendas = 0;
  let totalDistratos = 0;
  let comissaoTotal = 0;

  let cicloTotal = 0;
  let cicloMedioBase = 0;

  let financiamento = 0;
  let subsidio = 0;
  let fgts = 0;
  let proprios = 0;

  const monthTotals = new Map<number, { vgv: number; count: number }>();
  const porEmpreendimentoMap = new Map<string, RankingEntry>();
  const porConstrutoraMap = new Map<string, RankingEntry>();

  for (const sale of list) {
    if (!sale) continue;

    if (isDistrato(sale)) {
      totalDistratos += 1;
      continue;
    }

    const value = num(sale.saleValue);
    vgv += value;
    totalVendas += 1;
    comissaoTotal += saleCommission(sale);

    financiamento += num(sale.financedValue);
    subsidio += num(sale.subsidyValue);
    fgts += num(sale.fgtsValue);
    proprios += num(sale.ownResourcesValue);

    const ciclo = saleCycleDays(sale);
    if (ciclo !== null) {
      cicloTotal += ciclo;
      cicloMedioBase += 1;
    }

    const closed = parseYmd(sale.saleDate);
    if (closed) {
      const index = monthIndex(closed);
      const bucket = monthTotals.get(index);
      if (bucket) {
        bucket.vgv += value;
        bucket.count += 1;
      } else {
        monthTotals.set(index, { vgv: value, count: 1 });
      }
    }

    addToRanking(
      porEmpreendimentoMap,
      groupLabel(sale.developmentName, NO_DEVELOPMENT_LABEL),
      value,
    );
    addToRanking(porConstrutoraMap, groupLabel(sale.companyName, NO_COMPANY_LABEL), value);
  }

  // ---- Série mensal contínua (mês sem venda entra com zero) ----------------
  const vgvPorMes: VgvMesPoint[] = [];
  if (monthTotals.size > 0) {
    const indexes = Array.from(monthTotals.keys());
    let first = indexes[0];
    let last = indexes[0];
    for (const index of indexes) {
      if (index < first) first = index;
      if (index > last) last = index;
    }
    // Teto de segurança contra data suja esticando o intervalo.
    if (last - first + 1 > MAX_MONTHS) first = last - (MAX_MONTHS - 1);
    for (let index = first; index <= last; index += 1) {
      const bucket = monthTotals.get(index);
      vgvPorMes.push({
        label: monthLabelFromIndex(index),
        vgv: bucket ? bucket.vgv : 0,
        count: bucket ? bucket.count : 0,
      });
    }
  }

  // ---- Composição do pagamento -------------------------------------------
  const composicaoValues = [financiamento, subsidio, fgts, proprios];
  const composicaoTotal = composicaoValues.reduce((acc, v) => acc + v, 0);
  const composicao: ComposicaoEntry[] = COMPOSICAO_LABELS.map((label, i) => {
    const value = composicaoValues[i];
    const pct = safePercent(value, composicaoTotal);
    return { label, value, pct: pct === null ? 0 : pct };
  });

  // ---- Taxas e médias -----------------------------------------------------
  const leads =
    typeof leadsNoPeriodo === 'number' && Number.isFinite(leadsNoPeriodo) && leadsNoPeriodo > 0
      ? leadsNoPeriodo
      : 0;

  return {
    vgv,
    totalVendas,
    totalDistratos,
    ticketMedio: safeDivide(vgv, totalVendas),
    comissaoTotal,
    cicloMedioDias: safeDivide(cicloTotal, cicloMedioBase),
    cicloMedioBase,
    taxaConversao: safePercent(totalVendas, leads),
    taxaDistrato: safePercent(totalDistratos, totalVendas + totalDistratos),
    leadsNoPeriodo: leads,
    vgvPorMes,
    porEmpreendimento: rankingFromMap(porEmpreendimentoMap),
    porConstrutora: rankingFromMap(porConstrutoraMap),
    composicao,
  };
}

/** KPIs zerados — útil enquanto os dados carregam. */
export function emptySaleKpis(): SaleKpis {
  return computeSaleKpis([], 0);
}

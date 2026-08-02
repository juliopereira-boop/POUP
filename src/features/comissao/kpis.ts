/**
 * Motor de KPIs do módulo "Comissões".
 *
 * Funções PURAS: não leem banco, não tocam em estado, não mutam o array
 * recebido (nem reordenam nada dentro dele). O painel de comissões — cards de
 * indicador, gráficos e ranking — sai todo de `computeCommissionKpis`.
 *
 * ------------------------------------------------------------------
 * CONVENÇÃO DE VALOR AUSENTE (a tela mostra "—" quando vem `null`)
 * ------------------------------------------------------------------
 * - Somas e contagens  -> sempre `number` (`0` quando não há nada a somar).
 * - Médias e percentuais -> `null` quando não existe base de cálculo.
 *   NUNCA `NaN`/`Infinity`.
 * - Todo campo em dinheiro sai arredondado no centavo, para a soma de floats
 *   não vazar poeira (`1000.0000000000001`) para a tela.
 *
 * ------------------------------------------------------------------
 * DATAS — armadilha recorrente neste repo
 * ------------------------------------------------------------------
 * `new Date('2026-08-01')` é lido como UTC e, no Brasil (UTC-3), volta 31/07
 * local. Aqui nenhuma data em `YYYY-MM-DD` passa pelo construtor `Date`: são
 * lidas por partes (regex) e comparadas como string, o que para o formato
 * `YYYY-MM-DD` equivale a comparar datas. Mesmo padrão de
 * `src/features/vendas/kpis.ts`.
 *
 * A regra de atraso NÃO é reimplementada aqui: usamos `isInstallmentLate`,
 * a mesma função que a camada de dados expõe (`@/data` reexporta
 * `@/data/types`; importamos do módulo de tipos para não arrastar o data layer
 * inteiro — e o Supabase com ele — para dentro de um módulo puro).
 */

import { isInstallmentLate, type CommissionInstallment, type CommissionWithInstallments } from '@/data/types';

/* ------------------------------------------------------------------------- *
 * Tipos públicos
 * ------------------------------------------------------------------------- */

/** Ponto de uma série mensal (gráfico de barras) — ordem cronológica. */
export interface CommissionMonthPoint {
  /** Rótulo curto em pt-BR, ex.: `ago/26`. */
  label: string;
  value: number;
}

/** Linha do ranking por construtora. */
export interface CommissionCompanyEntry {
  label: string;
  previsto: number;
  recebido: number;
  /** Quantas COMISSÕES (vendas) da construtora entraram na linha. */
  count: number;
}

/** A próxima parcela a vencer (hoje inclusive). */
export interface NextDueInstallment {
  dueDate: string;
  value: number;
  clientName: string;
}

export interface CommissionKpis {
  /** Soma das parcelas NÃO canceladas (recebidas + pendentes). */
  totalPrevisto: number;
  /** Soma do que entrou de fato nas recebidas (`paidValue`, ou `value` se nulo). */
  totalRecebido: number;
  /** Soma das pendentes: não vencidas + vencidas. */
  totalAReceber: number;
  /** Soma das pendentes com vencimento anterior a hoje (`isInstallmentLate`). */
  totalAtrasado: number;
  /** Soma das parcelas canceladas (fica fora de previsto/a receber). */
  totalCancelado: number;
  /** Quantidade de parcelas no conjunto, INCLUINDO as canceladas. */
  qtdParcelas: number;
  qtdRecebidas: number;
  qtdPendentes: number;
  qtdAtrasadas: number;
  /** Recebido ÷ previsto, EM PERCENTUAL (ex.: 42.5). `null` sem previsto. */
  percentualRecebido: number | null;
  /** Previsto ÷ nº de comissões. `null` sem comissão nenhuma. */
  ticketMedioComissao: number | null;
  /** Quantas comissões (vendas) entraram no cálculo. */
  qtdComissoes: number;
  /** Parcela pendente mais próxima de vencer (hoje conta). `null` se não há. */
  proximoVencimento: NextDueInstallment | null;
  /** Recebido por mês do `paidDate`. Série contínua: mês sem nada entra com zero. */
  recebidoPorMes: CommissionMonthPoint[];
  /** Pendentes por mês do `dueDate`. Série contínua. */
  aReceberPorMes: CommissionMonthPoint[];
  /** Ranking por construtora, previsto desc. */
  porConstrutora: CommissionCompanyEntry[];
}

/* ------------------------------------------------------------------------- *
 * Rótulos e constantes
 * ------------------------------------------------------------------------- */

/** Comissão sem construtora não é descartada: entra com este rótulo. */
export const NO_COMPANY_LABEL = 'Sem construtora';

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
 * Teto de segurança das séries mensais. Se uma data suja (ex.: ano 1900)
 * esticar o intervalo, mantemos apenas os 120 meses mais recentes em vez de
 * gerar milhares de pontos e travar o gráfico.
 */
const MAX_MONTHS = 120;

/* ------------------------------------------------------------------------- *
 * Helpers (privados)
 * ------------------------------------------------------------------------- */

/** Número utilizável ou `0`. Blinda contra `null`, `undefined`, `NaN` e `Infinity`. */
function num(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return value;
}

/** Arredonda dinheiro no centavo, matando a poeira da soma de floats. */
function money(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

/** Divisão segura: `null` quando não há base de cálculo. Nunca `NaN`/`Infinity`. */
function safeDivide(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return null;
  if (denominator === 0) return null;
  const result = numerator / denominator;
  return Number.isFinite(result) ? result : null;
}

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})/;

/** Índice absoluto do mês de um `YYYY-MM-DD`, para varrer o intervalo sem furos. */
function monthIndexOf(value: string | null | undefined): number | null {
  if (typeof value !== 'string') return null;
  const match = YMD_RE.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(year) || month < 1 || month > 12) return null;
  return year * 12 + (month - 1);
}

/** `ago/26` — mês abreviado em pt-BR + ano com dois dígitos. */
function monthLabelFromIndex(index: number): string {
  const year = Math.floor(index / 12);
  const month = ((index % 12) + 12) % 12;
  return `${MONTH_ABBR[month]}/${String(((year % 100) + 100) % 100).padStart(2, '0')}`;
}

/** Nome de agrupamento, com fallback para não descartar a comissão do ranking. */
function groupLabel(name: string | null | undefined): string {
  if (typeof name !== 'string') return NO_COMPANY_LABEL;
  const trimmed = name.trim();
  return trimmed ? trimmed : NO_COMPANY_LABEL;
}

/** Data `YYYY-MM-DD` comparável, ou `null`. */
function ymd(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  return YMD_RE.test(raw) ? raw.slice(0, 10) : null;
}

/** O que entrou de fato numa parcela recebida: `paidValue` quando existe. */
function receivedValue(inst: CommissionInstallment): number {
  const paid = inst.paidValue;
  if (typeof paid === 'number' && Number.isFinite(paid)) return paid;
  return num(inst.value);
}

/** Série mensal contínua (mês sem movimento entra com zero). */
function buildMonthSeries(totals: Map<number, number>): CommissionMonthPoint[] {
  if (totals.size === 0) return [];
  const indexes = Array.from(totals.keys());
  let first = indexes[0];
  let last = indexes[0];
  for (const index of indexes) {
    if (index < first) first = index;
    if (index > last) last = index;
  }
  // Teto de segurança contra data suja esticando o intervalo.
  if (last - first + 1 > MAX_MONTHS) first = last - (MAX_MONTHS - 1);
  const out: CommissionMonthPoint[] = [];
  for (let index = first; index <= last; index += 1) {
    out.push({ label: monthLabelFromIndex(index), value: money(totals.get(index) ?? 0) });
  }
  return out;
}

function addToMonth(totals: Map<number, number>, index: number | null, value: number): void {
  if (index === null) return;
  totals.set(index, (totals.get(index) ?? 0) + value);
}

/* ------------------------------------------------------------------------- *
 * Motor
 * ------------------------------------------------------------------------- */

/**
 * Calcula todos os KPIs de uma lista de comissões já filtrada pela tela.
 *
 * @param items Comissões com suas parcelas (o que `db.commissions.list` devolve).
 * @param todayYmd Hoje em `YYYY-MM-DD` — a tela passa a data local, para o
 *   atraso não depender do relógio UTC do dispositivo.
 *
 * Regras de contagem:
 * - `qtdComissoes` conta os itens recebidos (uma comissão = uma venda), mesmo
 *   que todas as parcelas dela estejam canceladas — a venda existiu.
 * - `qtdParcelas` conta TODAS as parcelas, canceladas incluídas; as canceladas
 *   ficam fora de `totalPrevisto`, `totalAReceber` e `totalRecebido`.
 * - `proximoVencimento` é a pendente com o MENOR `dueDate` >= hoje (a mais
 *   próxima de vencer). Atrasadas não entram — elas já são contadas em
 *   `totalAtrasado`. Empate de data: vence o maior valor e, depois, o nome do
 *   cliente em ordem alfabética (determinístico).
 */
export function computeCommissionKpis(
  items: CommissionWithInstallments[],
  todayYmd: string,
): CommissionKpis {
  const list = Array.isArray(items) ? items : [];
  const today = ymd(todayYmd) ?? '';

  let totalPrevisto = 0;
  let totalRecebido = 0;
  let totalAReceber = 0;
  let totalAtrasado = 0;
  let totalCancelado = 0;

  let qtdParcelas = 0;
  let qtdRecebidas = 0;
  let qtdPendentes = 0;
  let qtdAtrasadas = 0;
  let qtdComissoes = 0;

  const recebidoMes = new Map<number, number>();
  const aReceberMes = new Map<number, number>();
  const porConstrutoraMap = new Map<string, CommissionCompanyEntry>();

  let proximo: NextDueInstallment | null = null;

  for (const item of list) {
    if (!item || !item.commission) continue;
    qtdComissoes += 1;

    const commission = item.commission;
    const label = groupLabel(commission.companyName);
    let entry = porConstrutoraMap.get(label);
    if (!entry) {
      entry = { label, previsto: 0, recebido: 0, count: 0 };
      porConstrutoraMap.set(label, entry);
    }
    entry.count += 1;

    const clientName = typeof commission.clientName === 'string' ? commission.clientName : '';
    const installments = Array.isArray(item.installments) ? item.installments : [];

    for (const inst of installments) {
      if (!inst) continue;
      qtdParcelas += 1;

      const value = num(inst.value);

      if (inst.status === 'cancelada') {
        totalCancelado += value;
        continue;
      }

      totalPrevisto += value;
      entry.previsto += value;

      if (inst.status === 'recebida') {
        const received = receivedValue(inst);
        qtdRecebidas += 1;
        totalRecebido += received;
        entry.recebido += received;
        addToMonth(recebidoMes, monthIndexOf(inst.paidDate), received);
        continue;
      }

      // Pendente (qualquer status fora de 'recebida'/'cancelada' cai aqui).
      qtdPendentes += 1;
      totalAReceber += value;
      addToMonth(aReceberMes, monthIndexOf(inst.dueDate), value);

      if (isInstallmentLate(inst, today)) {
        qtdAtrasadas += 1;
        totalAtrasado += value;
        continue;
      }

      const due = ymd(inst.dueDate);
      if (due && due >= today) {
        const candidate: NextDueInstallment = { dueDate: due, value: money(value), clientName };
        if (!proximo || isSoonerDue(candidate, proximo)) proximo = candidate;
      }
    }
  }

  const porConstrutora = Array.from(porConstrutoraMap.values())
    .map((e) => ({
      label: e.label,
      previsto: money(e.previsto),
      recebido: money(e.recebido),
      count: e.count,
    }))
    .sort((a, b) => {
      if (b.previsto !== a.previsto) return b.previsto - a.previsto;
      if (b.recebido !== a.recebido) return b.recebido - a.recebido;
      if (b.count !== a.count) return b.count - a.count;
      return a.label.localeCompare(b.label, 'pt-BR');
    });

  const previsto = money(totalPrevisto);
  const recebido = money(totalRecebido);

  return {
    totalPrevisto: previsto,
    totalRecebido: recebido,
    totalAReceber: money(totalAReceber),
    totalAtrasado: money(totalAtrasado),
    totalCancelado: money(totalCancelado),
    qtdParcelas,
    qtdRecebidas,
    qtdPendentes,
    qtdAtrasadas,
    percentualRecebido: percentOrNull(recebido, previsto),
    ticketMedioComissao: safeDivide(previsto, qtdComissoes),
    qtdComissoes,
    proximoVencimento: proximo,
    recebidoPorMes: buildMonthSeries(recebidoMes),
    aReceberPorMes: buildMonthSeries(aReceberMes),
    porConstrutora,
  };
}

/** Percentual (0–100) ou `null` quando não há base. Nunca `NaN`/`Infinity`. */
function percentOrNull(numerator: number, denominator: number): number | null {
  const ratio = safeDivide(numerator, denominator);
  return ratio === null ? null : ratio * 100;
}

/** Critério do `proximoVencimento` (ver `computeCommissionKpis`). */
function isSoonerDue(candidate: NextDueInstallment, current: NextDueInstallment): boolean {
  if (candidate.dueDate !== current.dueDate) return candidate.dueDate < current.dueDate;
  if (candidate.value !== current.value) return candidate.value > current.value;
  return candidate.clientName.localeCompare(current.clientName, 'pt-BR') < 0;
}

/** KPIs zerados — útil enquanto os dados carregam. */
export function emptyCommissionKpis(): CommissionKpis {
  return computeCommissionKpis([], '');
}

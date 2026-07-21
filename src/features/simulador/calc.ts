import { currencyToNumber } from '@/lib/masks';
import type { SimuladorState } from './SimuladorProvider';

/**
 * Cálculos do fluxo de pagamento do Simulador.
 * Centralizado aqui para páginas 4 e 5 usarem a mesma fórmula.
 */

/** Valor total que o cliente paga em poupança (fora dos financiamentos). */
export function computePoupanca(sim: SimuladorState): number {
  const unit = currencyToNumber(sim.unitValue);
  const fin = currencyToNumber(sim.financingApproved);
  const sub = currencyToNumber(sim.subsidy);
  const fgts = currencyToNumber(sim.fgts);
  let coupon = 0;
  if (sim.couponType === 'R$') coupon = currencyToNumber(sim.couponValue);
  else if (sim.couponType === '%') {
    const pct = parseFloat(sim.couponValue.replace(',', '.')) || 0;
    coupon = (unit * pct) / 100;
  }
  return Math.max(0, unit - fin - sub - fgts - coupon);
}

/** Soma dos financiamentos (financiamento + subsídio + FGTS). */
export function computeFinancingSum(sim: SimuladorState): number {
  return (
    currencyToNumber(sim.financingApproved) +
    currencyToNumber(sim.subsidy) +
    currencyToNumber(sim.fgts)
  );
}

/** Adiciona `n` meses a uma data ISO (yyyy-mm-dd), com clamp de dia. */
export function addMonths(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const monthIndex = m - 1 + n;
  const ty = y + Math.floor(monthIndex / 12);
  const tm = ((monthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  const td = Math.min(d, lastDay);
  return `${ty}-${String(tm + 1).padStart(2, '0')}-${String(td).padStart(2, '0')}`;
}

/** Troca o DIA de uma data ISO (mantém mês/ano), com clamp ao último dia do mês. */
export function withDay(iso: string, day: number): string {
  const [y, m] = iso.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const d = Math.min(Math.max(1, day), lastDay);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function formatDateBR(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

const MONTH_ABBR = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
];

/** Formata uma data ISO mostrando somente mês/ano (ex.: "Mar/2027"). */
export function formatMonthYearBR(iso: string | null): string {
  if (!iso) return '—';
  const [y, m] = iso.split('-');
  const idx = parseInt(m, 10) - 1;
  return `${MONTH_ABBR[idx] ?? m}/${y}`;
}

/** Diferença em meses inteiros entre duas datas ISO (to − from). */
export function monthsBetween(fromISO: string, toISO: string | null): number | null {
  if (!toISO) return null;
  const [fy, fm] = fromISO.split('-').map(Number);
  const [ty, tm] = toISO.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

export interface FlowResult {
  poupanca: number;
  ato: number;
  /** Data do 1º vencimento das mensais (1 mês após o ato). */
  mensalFirstDue: string | null;
  mensaisCount: number;
  /** Valor de cada parcela mensal (o número animado em verde). */
  monthlyValue: number;
  semestralCount: number;
  semestralValue: number;
  semestralTotal: number;
  /** Vencimentos das semestrais (em ordem). */
  semestralDueDates: string[];
  anualCount: number;
  anualValue: number;
  anualTotal: number;
  anualDueDates: string[];
  /** Quanto já foi distribuído (ato + mensais + intercaladas). */
  distributed: number;
  /** Diferença entre a poupança e o distribuído (idealmente 0). */
  saldo: number;
}

/**
 * Monta o fluxo de pagamento a partir do estado.
 * - Mensal: valor = (poupança − ato − semestrais − anuais) / qtd mensal.
 * - Vencimentos: mensal 1º = ato + 1 mês (mês/ano travados; dia editável via
 *   `sim.mensalDueDay`); semestral 1º = mensal + 6; anual 1º = mensal + 12
 *   (semestrais/anuais herdam o mesmo dia do mensal). Se `coincidir` estiver
 *   desligado, intercaladas pulam +1 mês.
 */
export function buildFlow(sim: SimuladorState): FlowResult {
  const poupanca = computePoupanca(sim);
  const ato = currencyToNumber(sim.ato);
  const mensaisCount = parseInt(sim.mensaisCount || '0', 10) || 0;

  const semestralCount = sim.semestralEnabled ? parseInt(sim.semestralCount || '0', 10) || 0 : 0;
  const semestralValue = sim.semestralEnabled ? currencyToNumber(sim.semestralValue) : 0;
  const anualCount = sim.anualEnabled ? parseInt(sim.anualCount || '0', 10) || 0 : 0;
  const anualValue = sim.anualEnabled ? currencyToNumber(sim.anualValue) : 0;

  const semestralTotal = semestralCount * semestralValue;
  const anualTotal = anualCount * anualValue;

  const remaining = poupanca - ato - semestralTotal - anualTotal;
  const monthlyValue = mensaisCount > 0 ? remaining / mensaisCount : 0;

  // Mês/ano do 1º vencimento mensal ficam travados em "1 mês após o ato";
  // só o DIA é editável (sim.mensalDueDay). Semestrais/anuais herdam esse
  // mesmo dia automaticamente, pois usam mensalFirstDue como âncora abaixo.
  const mensalAnchor = sim.atoDueDate ? addMonths(sim.atoDueDate, 1) : null;
  const customDay = parseInt(sim.mensalDueDay || '', 10);
  const mensalFirstDue = mensalAnchor
    ? customDay > 0
      ? withDay(mensalAnchor, customDay)
      : mensalAnchor
    : null;
  const offset = sim.companyCoincide ? 0 : 1;

  const semestralDueDates: string[] = [];
  if (mensalFirstDue) {
    for (let i = 0; i < semestralCount; i++) {
      semestralDueDates.push(addMonths(mensalFirstDue, 6 * (i + 1) + offset));
    }
  }
  const anualDueDates: string[] = [];
  if (mensalFirstDue) {
    for (let i = 0; i < anualCount; i++) {
      anualDueDates.push(addMonths(mensalFirstDue, 12 * (i + 1) + offset));
    }
  }

  const distributed = ato + monthlyValue * mensaisCount + semestralTotal + anualTotal;
  const saldo = poupanca - distributed;

  return {
    poupanca,
    ato,
    mensalFirstDue,
    mensaisCount,
    monthlyValue,
    semestralCount,
    semestralValue,
    semestralTotal,
    semestralDueDates,
    anualCount,
    anualValue,
    anualTotal,
    anualDueDates,
    distributed,
    saldo,
  };
}

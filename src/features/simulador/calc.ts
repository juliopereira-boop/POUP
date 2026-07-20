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

export function formatDateBR(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
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
 * - Vencimentos: mensal 1º = ato + 1 mês; semestral 1º = mensal + 6; anual 1º
 *   = mensal + 12. Se `coincidir` estiver desligado, intercaladas pulam +1 mês.
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

  const mensalFirstDue = sim.atoDueDate ? addMonths(sim.atoDueDate, 1) : null;
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

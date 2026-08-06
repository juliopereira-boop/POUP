/**
 * Tradutor de período do módulo de comissão.
 *
 * É a ÚNICA fonte da verdade: a tela usa esta função para escrever o rótulo do
 * filtro ("de 02/08/2026 a 01/08/2027") e o repositório usa a mesma para
 * recortar as parcelas. Se as duas divergirem, a tela mostra um período e o
 * banco devolve outro — e ninguém entende por que o número não bate.
 *
 * ------------------------------------------------------------------
 * POR QUE NÃO REAPROVEITAR O `resolvePeriod` DE VENDAS
 * ------------------------------------------------------------------
 * Venda é fato consumado: faz sentido olhar "os últimos 12 meses". Comissão a
 * receber é previsão: a parcela vence DEPOIS da venda. Uma janela que termina
 * hoje esconde justamente o que o corretor quer ver — inclusive a comissão que
 * ele acabou de gerar. Por isso este módulo tem presets prospectivos e o padrão
 * é `tudo`.
 *
 * ------------------------------------------------------------------
 * ARMADILHA DE FUSO (já custou bugs neste repo)
 * ------------------------------------------------------------------
 * No Brasil (UTC-3) `new Date('2026-03-01')` é lido como UTC e vira 28/02
 * local, e `toISOString().slice(0, 10)` adianta o dia depois das 21h. Aqui toda
 * data é montada por partes locais (`new Date(ano, mes, dia)`) e serializada
 * com `dateKey`, que lê `getFullYear`/`getMonth`/`getDate`.
 */
import { dateKey, startOfMonth } from '@/features/agenda/dates';
import type { CommissionFilters } from '@/data/types';

export interface ResolvedPeriod {
  /** YYYY-MM-DD inclusivo. `null` = sem limite. */
  from: string | null;
  to: string | null;
}

/** Último dia do mês de `d`, em partes locais. */
function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

/**
 * Anda `months` meses (negativo recua) mantendo o dia, com clamp no último dia
 * do mês de destino: 31/05 mais 3 meses é 31/08, mas 31/03 mais 1 mês é 30/04 —
 * nunca 01/05, que é o que o `setMonth` do JS faria ao estourar o dia.
 */
function shiftMonths(d: Date, months: number): Date {
  const target = new Date(d.getFullYear(), d.getMonth() + months, 1);
  const lastDay = endOfMonth(target).getDate();
  return new Date(target.getFullYear(), target.getMonth(), Math.min(d.getDate(), lastDay));
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

/**
 * Traduz o preset em datas concretas (YYYY-MM-DD, inclusivas nas duas pontas).
 *
 * - `tudo`: sem limite nenhum — o padrão do módulo.
 * - `proximos_*`: janela que COMEÇA hoje e vai para frente. É a leitura de
 *   cobrança: o que ainda vou receber.
 * - `ultimos_*`: janela que termina hoje. Serve para conferir o que já entrou.
 * - `mes_atual` / `mes_passado` / `ano_atual`: período de calendário fechado,
 *   para o rótulo da tela e o recorte nunca divergirem.
 * - `personalizado`: usa o `from`/`to` digitados (podem ser nulos).
 *
 * `now` existe só para teste; a tela nunca passa esse argumento.
 */
export function resolveCommissionPeriod(
  filters: Pick<CommissionFilters, 'preset' | 'from' | 'to'>,
  now: Date = new Date(),
): ResolvedPeriod {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (filters.preset) {
    case 'proximos_30_dias':
      return { from: dateKey(today), to: dateKey(addDays(today, 30)) };
    case 'proximos_3_meses':
      return { from: dateKey(today), to: dateKey(shiftMonths(today, 3)) };
    case 'proximos_12_meses':
      return { from: dateKey(today), to: dateKey(shiftMonths(today, 12)) };
    case 'mes_atual': {
      const start = startOfMonth(today);
      return { from: dateKey(start), to: dateKey(endOfMonth(start)) };
    }
    case 'mes_passado': {
      const start = startOfMonth(shiftMonths(today, -1));
      return { from: dateKey(start), to: dateKey(endOfMonth(start)) };
    }
    case 'ultimos_3_meses':
      return { from: dateKey(shiftMonths(today, -3)), to: dateKey(today) };
    case 'ultimos_12_meses':
      return { from: dateKey(shiftMonths(today, -12)), to: dateKey(today) };
    case 'ano_atual': {
      const year = today.getFullYear();
      return { from: dateKey(new Date(year, 0, 1)), to: dateKey(new Date(year, 11, 31)) };
    }
    case 'personalizado':
      return { from: filters.from, to: filters.to };
    case 'tudo':
    default:
      return { from: null, to: null };
  }
}

/** Rótulos do seletor de período, na ordem em que aparecem na tela. */
export const COMMISSION_PRESETS: { value: CommissionFilters['preset']; label: string }[] = [
  { value: 'tudo', label: 'Todo o histórico' },
  { value: 'proximos_30_dias', label: 'Próximos 30 dias' },
  { value: 'proximos_3_meses', label: 'Próximos 3 meses' },
  { value: 'proximos_12_meses', label: 'Próximos 12 meses' },
  { value: 'mes_atual', label: 'Este mês' },
  { value: 'mes_passado', label: 'Mês passado' },
  { value: 'ultimos_3_meses', label: 'Últimos 3 meses' },
  { value: 'ultimos_12_meses', label: 'Últimos 12 meses' },
  { value: 'ano_atual', label: 'Este ano' },
  { value: 'personalizado', label: 'Período personalizado' },
];

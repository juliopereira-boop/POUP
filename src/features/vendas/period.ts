import { addMonths, dateKey, startOfMonth } from '@/features/agenda/dates';
import type { SaleFilters } from '@/data/types';

export interface ResolvedPeriod {
  /** YYYY-MM-DD inclusivo. `null` = sem limite. */
  from: string | null;
  to: string | null;
}

/**
 * ARMADILHA DE FUSO (já custou bugs neste repo): no Brasil (UTC-3)
 * `new Date('2026-03-01')` é lido como UTC e vira 28/02 no horário local, e
 * `toISOString().slice(0, 10)` adianta o dia quando a hora local passa das 21h.
 * Por isso TODAS as datas aqui são montadas e lidas por partes locais
 * (`new Date(ano, mes, dia)` + `dateKey`, que usa getFullYear/getMonth/getDate).
 */

/** Último dia do mês de `d`, em partes locais. */
function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

/**
 * Recua `months` meses mantendo o dia, com clamp no último dia do mês de
 * destino: 31/05 menos 3 meses é 28/02 (ou 29/02), nunca 03/03 — que é o que o
 * `setMonth` do JS faria ao estourar o dia.
 */
function monthsBack(d: Date, months: number): Date {
  const target = new Date(d.getFullYear(), d.getMonth() - months, 1);
  const lastDay = endOfMonth(target).getDate();
  return new Date(target.getFullYear(), target.getMonth(), Math.min(d.getDate(), lastDay));
}

/**
 * Traduz o preset de período em datas concretas (YYYY-MM-DD, inclusivas).
 *
 * - `mes_atual` / `mes_passado` / `ano_atual`: período de calendário fechado
 *   (primeiro ao último dia), para o rótulo da tela e o filtro nunca divergirem.
 * - `ultimos_3_meses` / `ultimos_12_meses`: janela móvel que termina hoje.
 * - `tudo`: sem limite nenhum.
 * - `personalizado`: usa o `from`/`to` que já vêm nos filtros (podem ser nulos).
 *
 * `now` existe apenas para teste; a tela nunca passa esse argumento.
 */
export function resolvePeriod(filters: SaleFilters, now: Date = new Date()): ResolvedPeriod {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (filters.preset) {
    case 'mes_atual': {
      const start = startOfMonth(today);
      return { from: dateKey(start), to: dateKey(endOfMonth(start)) };
    }
    case 'mes_passado': {
      const start = addMonths(today, -1);
      return { from: dateKey(start), to: dateKey(endOfMonth(start)) };
    }
    case 'ultimos_3_meses':
      return { from: dateKey(monthsBack(today, 3)), to: dateKey(today) };
    case 'ultimos_12_meses':
      return { from: dateKey(monthsBack(today, 12)), to: dateKey(today) };
    case 'ano_atual': {
      const year = today.getFullYear();
      return { from: dateKey(new Date(year, 0, 1)), to: dateKey(new Date(year, 11, 31)) };
    }
    case 'tudo':
      return { from: null, to: null };
    case 'personalizado':
    default:
      return { from: filters.from, to: filters.to };
  }
}

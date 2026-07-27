export const MONTHS = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

export const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export const WEEKDAYS_LONG = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
];

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  return addDays(x, -x.getDay());
}

export function endOfWeek(d: Date): Date {
  return endOfDay(addDays(startOfWeek(d), 6));
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export interface MonthCell {
  date: Date;
  inMonth: boolean;
}

export function monthGridStart(anchor: Date): Date {
  return startOfWeek(startOfMonth(anchor));
}

export function monthGrid(anchor: Date): MonthCell[] {
  const start = monthGridStart(anchor);
  const month = anchor.getMonth();
  const cells: MonthCell[] = [];
  for (let i = 0; i < 42; i += 1) {
    const date = addDays(start, i);
    cells.push({ date, inMonth: date.getMonth() === month });
  }
  return cells;
}

export function weekDays(anchor: Date): Date[] {
  const start = startOfWeek(anchor);
  return Array.from({ length: 7 }, (_v, i) => addDays(start, i));
}

export function formatDateBR(d: Date): string {
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function formatShortDate(d: Date): string {
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`;
}

export function formatTimeISO(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--:--';
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function formatMonthLabel(d: Date): string {
  return `${MONTHS[d.getMonth()]} de ${d.getFullYear()}`;
}

export function formatWeekLabel(d: Date): string {
  const start = startOfWeek(d);
  return `${formatShortDate(start)} – ${formatShortDate(addDays(start, 6))}`;
}

export function formatDayLabel(d: Date): string {
  return `${WEEKDAYS_LONG[d.getDay()]}, ${d.getDate()} de ${MONTHS[d.getMonth()].toLowerCase()}`;
}

export function maskTime(text: string): string {
  const digits = text.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

export function parseTime(value: string): { hour: number; minute: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

export function localISO(ymd: string, time: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  const parsed = parseTime(time);
  if (!match || !parsed) return null;
  const d = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    parsed.hour,
    parsed.minute,
    0,
    0,
  );
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function ymdFromISO(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return dateKey(d);
}

const DEFAULT_SLOT_MS = 30 * 60 * 1000;

export function overlaps(
  aStart: string,
  aEnd: string | null,
  bStart: string,
  bEnd: string | null,
): boolean {
  const as = new Date(aStart).getTime();
  const bs = new Date(bStart).getTime();
  if (Number.isNaN(as) || Number.isNaN(bs)) return false;
  const ae = aEnd ? new Date(aEnd).getTime() : as + DEFAULT_SLOT_MS;
  const be = bEnd ? new Date(bEnd).getTime() : bs + DEFAULT_SLOT_MS;
  return as < be && bs < ae;
}

export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

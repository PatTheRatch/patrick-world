// Calendar arithmetic on ISO day strings (`2025-03-14`). No clock is read anywhere in
// `src/world/`: "today" is always an argument.

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

function digits(s: string, from: number, to: number): number {
  let n = 0;
  for (let i = from; i < to; i++) n = n * 10 + (s.charCodeAt(i) - 48);
  return n;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function pad4(n: number): string {
  return n < 10 ? `000${n}` : n < 100 ? `00${n}` : n < 1000 ? `0${n}` : `${n}`;
}

/** Trim a longer ISO timestamp to its day. */
export function isoDay(iso: string): string {
  return iso.length > 10 ? iso.slice(0, 10) : iso;
}

/** Days since 1970-01-01 for a proleptic Gregorian date. */
export function daysFromCivil(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** ISO day to a day number (days since 1970-01-01). Reads only the first ten characters. */
export function dayNumber(iso: string): number {
  return daysFromCivil(digits(iso, 0, 4), digits(iso, 5, 7), digits(iso, 8, 10));
}

/** Day number back to an ISO day. */
export function isoFromDay(dayNo: number): string {
  const z = dayNo + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
  );
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  const y = yoe + era * 400 + (m <= 2 ? 1 : 0);
  return `${pad4(y)}-${pad2(m)}-${pad2(d)}`;
}

export function addDays(iso: string, days: number): string {
  return isoFromDay(dayNumber(iso) + days);
}

/** Whole days from `from` to `to`; negative if `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return dayNumber(to) - dayNumber(from);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(iso: string): number {
  return (((dayNumber(iso) + 4) % 7) + 7) % 7;
}

/** A number identifying the Monday-to-Sunday week a day number falls in. */
export function weekIndex(dayNo: number): number {
  return Math.floor((dayNo + 3) / 7);
}

/** `2025-03-14` -> `2025-03`. */
export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

/** Months since year 0, so consecutive months are consecutive integers. */
export function monthIndex(iso: string): number {
  return digits(iso, 0, 4) * 12 + digits(iso, 5, 7) - 1;
}

export function monthKeyFromIndex(index: number): string {
  const y = Math.floor(index / 12);
  return `${pad4(y)}-${pad2(index - y * 12 + 1)}`;
}

/** Every `YYYY-MM` from the month of `from` to the month of `to`, inclusive. */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const end = monthIndex(to);
  for (let i = monthIndex(from); i <= end; i++) out.push(monthKeyFromIndex(i));
  return out;
}

/** `2025-03-14` (or `2025-03`) -> `March 2025`. */
export function formatMonthYear(iso: string): string {
  const name = MONTHS[digits(iso, 5, 7) - 1] ?? '';
  return `${name} ${digits(iso, 0, 4)}`;
}

/** `2025-03-14` -> `14 March 2025`. */
export function formatDay(iso: string): string {
  return `${digits(iso, 8, 10)} ${formatMonthYear(iso)}`;
}

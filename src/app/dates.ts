// Day arithmetic on ISO dates, without time zones getting a say.

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
];

export const dayNumber = (iso: string): number => {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1) / 86400000);
};

export const isoFromDay = (n: number): string => new Date(n * 86400000).toISOString().slice(0, 10);

export const monthYear = (iso: string): string => {
  const [y, m] = iso.split('-').map(Number);
  return `${MONTHS[(m ?? 1) - 1]} ${y}`;
};

export const dayMonthYear = (iso: string): string => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[(m ?? 1) - 1]} ${y}`;
};

export const yearOf = (iso: string): number => Number(iso.slice(0, 4));

/** "3 weeks", "14 months", "2 years": a span a person would say. */
export const span = (days: number): string => {
  if (days < 14) return days <= 1 ? 'a day' : `${days} days`;
  if (days < 70) return `${Math.round(days / 7)} weeks`;
  if (days < 730) return `${Math.round(days / 30.4)} months`;
  return `${(days / 365).toFixed(days % 365 < 60 ? 0 : 1)} years`;
};

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

/** '2026-04' -> 'Apr 2026' (UTC, so the label never shifts with the viewer's timezone). */
export function formatPeriod(period: string): string {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(period);
  if (!m) return period;
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
  return new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date);
}

/** '2025-10' -> "Oct ’25" for chart axes. */
export function formatPeriodShort(period: string): string {
  return formatPeriod(period).replace(' 20', ' ’');
}

export function periodParts(period: string): { year: number; month: number } {
  const [y, m] = period.split('-');
  return { year: Number(y), month: Number(m) };
}

const SHORT: Record<string, string> = {
  'Western Bahr el Ghazal': 'W. Bahr el Ghazal',
  'Northern Bahr el Ghazal': 'N. Bahr el Ghazal',
  'Western Equatoria': 'W. Equatoria',
  'Central Equatoria': 'C. Equatoria',
  'Eastern Equatoria': 'E. Equatoria',
};
export const shortName = (name: string): string => SHORT[name] ?? name;

export const formatInt = (n: number): string => Math.round(n).toLocaleString('en-US');
/** Signed tonnes with a real minus sign: "−23,378 t". */
export const formatTonnes = (n: number): string => `${n < 0 ? '−' : ''}${formatInt(Math.abs(n))} t`;

export const slugify = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export const titleCase = (s: string): string => {
  const t = s.replace(/_/g, ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
};

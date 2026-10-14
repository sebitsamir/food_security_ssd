export const BANDS = [
  { key: 'lower', n: 1, label: 'Lower', range: '0–20%', color: '#2E8B57', max: 0.2, pattern: null },
  { key: 'moderate', n: 2, label: 'Moderate', range: '20–50%', color: '#D6A83A', max: 0.5, pattern: null },
  { key: 'elevated', n: 3, label: 'Elevated', range: '50–80%', color: '#D97745', max: 0.8, pattern: 'dots' },
  { key: 'high', n: 4, label: 'High', range: '80–100%', color: '#C94B4B', max: 1.01, pattern: 'hatch' },
] as const;

export type Band = (typeof BANDS)[number];
export type BandKey = Band['key'];

/** Returns null for anything that is not a probability, so bad data never gets a colour. */
export function bandFor(p: number | undefined | null): Band | null {
  if (p === undefined || p === null || !Number.isFinite(p) || p < 0 || p > 1) return null;
  return BANDS.find((b) => p < b.max) ?? BANDS[3];
}

export const bandByKey = (key: string): Band | undefined => BANDS.find((b) => b.key === key);

export const formatPct = (p: number, digits = 1): string => `${(p * 100).toFixed(digits)}%`;

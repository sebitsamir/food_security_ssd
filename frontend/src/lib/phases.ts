export const PHASES = [
  { n: 1, label: 'Minimal', color: '#2E8B57' },
  { n: 2, label: 'Stressed', color: '#D6A83A' },
  { n: 3, label: 'Crisis', color: '#D97745' },
  { n: 4, label: 'Emergency', color: '#C94B4B' },
  { n: 5, label: 'Catastrophe', color: '#8E2F3A' },
] as const;

export const phaseLabel = (n: number): string => PHASES.find((p) => p.n === n)?.label ?? String(n);

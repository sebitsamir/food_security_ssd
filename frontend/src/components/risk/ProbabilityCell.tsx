import { bandFor, formatPct } from '@/lib/risk';

export function ProbabilityBar({ probability }: { probability: number }) {
  const band = bandFor(probability);
  return (
    <span aria-hidden="true" className="block h-[5px] w-full overflow-hidden rounded-[3px] bg-elev">
      <i className="block h-full rounded-[3px]" style={{ width: `${probability * 100}%`, background: band?.color ?? 'var(--info)' }} />
    </span>
  );
}

export function ProbabilityCell({ probability }: { probability: number }) {
  return (
    <span className="inline-grid w-full max-w-[200px] grid-cols-[54px_1fr] items-center gap-3">
      <span className="font-medium tabular-nums">{formatPct(probability)}</span>
      <ProbabilityBar probability={probability} />
    </span>
  );
}

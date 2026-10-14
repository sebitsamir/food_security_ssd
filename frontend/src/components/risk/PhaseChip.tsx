import { PHASES } from '@/lib/phases';

export function PhaseChip({ phase }: { phase: number }) {
  const p = PHASES.find((x) => x.n === phase);
  if (!p) return <span>{phase}</span>;
  return (
    <span className="inline-flex items-center gap-2 font-medium">
      <i aria-hidden="true" className="size-[11px] flex-none rounded-full border border-tx/40" style={{ background: p.color }} />
      {p.label}
    </span>
  );
}

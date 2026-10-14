import Link from 'next/link';
import { RiskBadge } from '@/components/risk/RiskBadge';
import { ProbabilityBar } from '@/components/risk/ProbabilityCell';
import { formatPct, bandFor } from '@/lib/risk';
import type { CountyRecord } from '@/lib/schemas';

export function StateCard({ pcode, name, mean, counties }: { pcode: string; name: string; mean: number | undefined; counties: CountyRecord[] }) {
  const top = [...counties].sort((a, b) => b.probability - a.probability).slice(0, 3);
  return (
    <aside aria-label={`${name} summary`} aria-live="polite" className="flex flex-col gap-3.5 rounded-[18px] border border-line bg-surface p-[18px] shadow-[var(--sh)] sm:rounded-[22px] sm:p-[22px]">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-medium">{name}</h2>
        <RiskBadge probability={mean} />
      </div>
      <p className="text-[clamp(2.9rem,5vw,3.6rem)] font-light leading-none tracking-[-0.045em] tabular-nums">
        {bandFor(mean) ? formatPct(mean as number) : '–'}
      </p>
      <ul>
        {top.map((c) => (
          <li key={c.pcode} className="grid grid-cols-[1fr_72px_50px] items-center gap-3 border-t border-line py-2 text-sm">
            <Link href={`/counties/${c.pcode}`} className="truncate hover:underline">{c.name}</Link>
            <ProbabilityBar probability={c.probability} />
            <span className="text-right font-medium tabular-nums">{formatPct(c.probability)}</span>
          </li>
        ))}
      </ul>
      <Link
        href={`/forecasts?state=${encodeURIComponent(pcode)}`}
        className="self-start text-sm font-medium underline decoration-line underline-offset-4 hover:decoration-tx"
      >
        All {counties.length} counties
      </Link>
    </aside>
  );
}

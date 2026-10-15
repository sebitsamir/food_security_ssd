'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import { Panel } from '@/components/ui/Panel';
import { ButtonLink } from '@/components/ui/Button';
import { RiskBadge } from '@/components/risk/RiskBadge';
import { PhaseChip } from '@/components/risk/PhaseChip';
import { ProbabilityBar } from '@/components/risk/ProbabilityCell';
import { ScaleBar } from '@/components/charts/ScaleBar';
import { LineChart } from '@/components/charts/LineChart';
import { bandFor, formatPct } from '@/lib/risk';
import { formatInt, formatPeriod, formatPeriodShort, formatTonnes } from '@/lib/format';
import { cx } from '@/lib/cx';
import type { CountyDetail, CountyRecord } from '@/lib/schemas';

export function CountyProfile({ detail: d, peers, total }: { detail: CountyDetail; peers: CountyRecord[]; total: number }) {
  const values = d.history.map((h) => h.phase3plus_pct);
  const labels = d.history.map((h) => formatPeriodShort(h.period));
  const [active, setActive] = useState(Math.max(0, values.length - 1));
  const onActive = useCallback((i: number) => setActive(i), []);

  const sorted = [...peers].sort((a, b) => b.probability - a.probability);
  const idx = sorted.findIndex((p) => p.pcode === d.pcode);
  const size = Math.min(7, sorted.length);
  const start = Math.max(0, Math.min(idx - 3, sorted.length - size));
  const window = sorted.slice(start, start + size);
  const f = d.facts;

  return (
    <Panel className="flex flex-col gap-[34px] max-sm:gap-7 sm:!p-8">
      <Link href="/counties" className="-mb-3 -ml-2.5 inline-flex h-11 items-center gap-1.5 self-start rounded-[10px] pl-1.5 pr-3 font-medium text-tx2 hover:text-tx min-[720px]:hidden">
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5 fill-none stroke-current" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="m15 5-7 7 7 7" /></svg>
        Counties
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-x-7 gap-y-[18px]">
        <div>
          <h2 className="text-[clamp(1.75rem,3.4vw,2.5rem)] font-normal leading-[1.1] tracking-[-0.032em]">{d.name}</h2>
          <p className="mt-1.5 text-[13px] text-tx2">{d.state_name} · Rank {d.rank} of {total}</p>
        </div>
        <div className="flex flex-col items-start gap-2.5 min-[640px]:items-end">
          <span className="text-[clamp(2.75rem,5vw,3.75rem)] font-light leading-none tracking-[-0.045em] tabular-nums">{formatPct(d.probability)}</span>
          <RiskBadge probability={d.probability} />
        </div>
      </div>

      <ScaleBar value={d.probability} />

      {f ? (
        <dl className="grid grid-cols-2 border-y border-line min-[900px]:grid-cols-4">
          {[
            ['Previous IPC phase', <PhaseChip key="p" phase={f.previous_ipc_phase} />],
            ['Population', formatInt(f.population)],
            ['Cereal production', `${formatInt(f.cereal_production_t)} t`],
            ['Cereal gap', formatTonnes(f.cereal_gap_t)],
          ].map(([label, value], i) => (
            <div key={String(label)} className={cx('border-b border-line px-0 py-[18px] min-[900px]:border-b-0 min-[900px]:px-[22px] min-[900px]:py-5', i % 2 === 1 && 'border-l pl-[18px]', i === 0 && 'min-[900px]:pl-0', i > 0 && 'min-[900px]:border-l', i >= 2 && 'max-[899px]:border-b-0')}>
              <dt className="mb-1 text-[13px] text-tx3">{label}</dt>
              <dd className="text-lg font-medium tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-tx2">No input data is available for this period.</p>
      )}

      <div>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
          <h3 className="text-base font-medium">Observed Phase 3+ share</h3>
          <span className="text-sm text-tx2 tabular-nums" aria-live="off">
            {d.history[active] ? formatPeriod(d.history[active].period) : ''}
            <b className="ml-2 font-medium text-tx">{values[active] !== undefined ? `${values[active]!.toFixed(0)}%` : ''}</b>
          </span>
        </div>
        <LineChart values={values} labels={labels} onActiveChange={onActive} ariaLabel={`Observed Phase 3 plus population share for ${d.name}, latest ${values.at(-1)?.toFixed(0) ?? 'unknown'} percent`} />
      </div>

      <div>
        <h3 className="mb-2 text-base font-medium">Counties in {d.state_name}</h3>
        <ul>
          {window.map((p) => (
            <li key={p.pcode}>
              <Link
                href={`/counties/${p.pcode}`}
                aria-current={p.pcode === d.pcode ? 'page' : undefined}
                className={cx('grid min-h-[46px] grid-cols-[minmax(0,1fr)_minmax(60px,1.2fr)_48px] items-center gap-3.5 rounded-xl px-3 py-[11px] text-sm hover:bg-elev min-[380px]:grid-cols-[minmax(0,1fr)_minmax(70px,1.2fr)_52px]', p.pcode === d.pcode && 'bg-elev font-medium')}
              >
                <span className="truncate">{p.name}</span>
                <ProbabilityBar probability={p.probability} />
                <span className="text-right font-medium tabular-nums">{bandFor(p.probability) ? formatPct(p.probability, 0) : '–'}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <div><ButtonLink href={`/predict?county=${encodeURIComponent(d.pcode)}`} size="sm">Open in Predict</ButtonLink></div>
    </Panel>
  );
}

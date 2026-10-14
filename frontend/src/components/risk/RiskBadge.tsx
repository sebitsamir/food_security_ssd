import { bandFor } from '@/lib/risk';

export function SignalBars({ n, color }: { n: number; color: string }) {
  return (
    <span aria-hidden="true" className="inline-flex h-[13px] items-end gap-0.5">
      {[4, 7, 10, 13].map((h, i) => (
        <i
          key={h}
          className="block w-[3px] rounded-[1px]"
          style={{ height: h, background: i < n ? color : 'color-mix(in srgb, var(--tx) 22%, transparent)' }}
        />
      ))}
    </span>
  );
}

/** Band shown as colour + label + signal bars, so risk is never conveyed by colour alone. */
export function RiskBadge({ probability }: { probability: number | undefined | null }) {
  const band = bandFor(probability);
  if (!band) {
    return <span className="inline-flex h-7 items-center rounded-full border border-line px-3 text-[13px] text-tx2">No data</span>;
  }
  return (
    <span
      title={`${band.label} modeled risk`}
      className="inline-flex h-7 items-center gap-2 whitespace-nowrap rounded-full border px-3 pl-2.5 text-[13px] font-medium text-tx"
      style={{
        borderColor: `color-mix(in srgb, ${band.color} 65%, transparent)`,
        background: `color-mix(in srgb, ${band.color} 14%, var(--surface))`,
      }}
    >
      <SignalBars n={band.n} color={band.color} />
      {band.label}
    </span>
  );
}

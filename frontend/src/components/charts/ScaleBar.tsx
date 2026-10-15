import { BANDS, formatPct } from '@/lib/risk';
import { bandFor } from '@/lib/risk';

/** Four-band scale with a marker at the probability. */
export function ScaleBar({ value }: { value: number }) {
  const band = bandFor(value);
  return (
    <div>
      <div className="relative" role="img" aria-label={`${formatPct(value)} on a 0 to 100 percent scale${band ? `, ${band.label} band` : ''}`}>
        <div className="flex h-2.5 gap-[3px]">
          {BANDS.map((b, i) => {
            const lo = i ? BANDS[i - 1]!.max : 0;
            return <i key={b.key} className="block rounded-[3px]" style={{ background: b.color, flex: `${(Math.min(b.max, 1) - lo) * 100} 1 0` }} />;
          })}
        </div>
        <div className="absolute -top-1.5 ml-[-2px] h-[22px] w-1 rounded-sm bg-tx shadow-[0_0_0_2px_var(--surface)]" style={{ left: `${Math.min(100, Math.max(0, value * 100))}%` }} />
      </div>
      <div className="relative mt-2.5 h-[18px] text-xs text-tx3 tabular-nums" aria-hidden="true">
        {[0, 20, 50, 80, 100].map((t) => (
          <span key={t} className="absolute" style={{ left: `${t}%`, transform: t === 0 ? 'none' : t === 100 ? 'translateX(-100%)' : 'translateX(-50%)' }}>{t}%</span>
        ))}
      </div>
    </div>
  );
}

import { cx } from '@/lib/cx';

export type Stat = { label: string; value: string };

/** Hairline-separated figures. The preview's "metrics" and model "kv" strips. */
export function StatStrip({ items, label }: { items: Stat[]; label: string }) {
  const cols = items.length === 5 ? 'lg:grid-cols-5' : 'lg:grid-cols-4';
  return (
    <dl aria-label={label} className={cx('grid grid-cols-2 border-y border-line', cols)}>
      {items.map((s, i) => (
        <div
          key={s.label}
          className={cx(
            'flex flex-col gap-1 py-[22px] lg:px-7 lg:py-7 lg:first:pl-0',
            i >= 2 && 'border-t border-line lg:border-t-0',
            i > 0 && 'lg:border-l lg:border-line',
          )}
        >
          <dd className="order-1 text-[clamp(1.5rem,3.2vw,2.25rem)] font-light leading-[1.1] tracking-[-0.03em] tabular-nums">{s.value}</dd>
          <dt className="order-2 text-[13px] text-tx2">{s.label}</dt>
        </div>
      ))}
    </dl>
  );
}

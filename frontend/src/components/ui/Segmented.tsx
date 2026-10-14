import { cx } from '@/lib/cx';

type Option<T extends string> = { value: T; label: string };

export function Segmented<T extends string>({
  options, value, onChange, label, className,
}: { options: Option<T>[]; value: T; onChange: (v: T) => void; label: string; className?: string }) {
  return (
    <div role="group" aria-label={label} className={cx('inline-flex rounded-xl border border-line bg-bg p-[3px]', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx(
            'h-[34px] rounded-[9px] px-[15px] text-sm font-medium focus-visible:outline-2 focus-visible:outline-info pointer-coarse:h-10',
            o.value === value ? 'bg-elev text-tx' : 'text-tx2 hover:text-tx',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

import type { ButtonHTMLAttributes } from 'react';
import { cx } from '@/lib/cx';

export function Chip({ pressed, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { pressed: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className={cx(
        'inline-flex h-[38px] items-center gap-2 rounded-full border px-[15px] text-sm font-medium focus-visible:outline-2 focus-visible:outline-info pointer-coarse:h-11',
        pressed ? 'border-btn bg-btn text-btn-tx' : 'border-line bg-surface text-tx2 hover:border-tx3 hover:text-tx',
        className,
      )}
      {...rest}
    />
  );
}

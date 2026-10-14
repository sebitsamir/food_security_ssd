import type { HTMLAttributes } from 'react';
import { cx } from '@/lib/cx';

export function Panel({ className, ...rest }: HTMLAttributes<HTMLElement>) {
  return (
    <section
      className={cx('rounded-[18px] border border-line bg-surface p-[18px] shadow-[var(--sh)] sm:rounded-[22px] sm:p-6', className)}
      {...rest}
    />
  );
}

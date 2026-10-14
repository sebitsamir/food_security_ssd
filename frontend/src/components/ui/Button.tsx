import Link from 'next/link';
import { forwardRef, type ButtonHTMLAttributes, type ComponentProps } from 'react';
import { cx } from '@/lib/cx';

type Variant = 'primary' | 'secondary';
type Size = 'md' | 'sm';

export function buttonClasses({ variant = 'secondary', size = 'md', full = false }: { variant?: Variant; size?: Size; full?: boolean } = {}): string {
  return cx(
    'inline-flex items-center justify-center gap-2 whitespace-nowrap border font-medium transition-[transform,border-color,opacity] active:translate-y-px',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-info disabled:cursor-default disabled:opacity-40',
    size === 'md' ? 'h-12 rounded-xl px-[22px]' : 'h-[38px] rounded-[10px] px-[15px] text-sm pointer-coarse:min-h-11',
    variant === 'primary'
      ? 'border-btn bg-btn text-btn-tx hover:opacity-90'
      : 'border-line bg-surface text-tx hover:border-tx3',
    full && 'w-full',
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; full?: boolean };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, full, className, type = 'button', ...rest },
  ref,
) {
  return <button ref={ref} type={type} className={cx(buttonClasses({ variant, size, full }), className)} {...rest} />;
});

type LinkProps = ComponentProps<typeof Link> & { variant?: Variant; size?: Size; full?: boolean };

export function ButtonLink({ variant, size, full, className, ...rest }: LinkProps) {
  return <Link className={cx(buttonClasses({ variant, size, full }), className)} {...rest} />;
}

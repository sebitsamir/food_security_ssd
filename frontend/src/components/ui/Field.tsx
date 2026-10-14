import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { cx } from '@/lib/cx';

export const inputClasses =
  'h-12 w-full rounded-xl border border-line bg-bg px-3.5 text-base text-tx transition-colors hover:border-tx3 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-info aria-[invalid=true]:border-[#C94B4B] ' +
  'pointer-coarse:h-[50px]';

export function Field({ label, htmlFor, error, children, className }: {
  label: string; htmlFor: string; error?: string | undefined; children: ReactNode; className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-[7px] block text-[13px] font-medium text-tx2">{label}</label>
      {children}
      {error && (
        <p id={`${htmlFor}-error`} role="alert" className="mt-1.5 text-[13px] text-[#E58B8B] [[data-theme=light]_&]:text-[#B3302F]">
          {error}
        </p>
      )}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest }, ref,
) {
  return <input ref={ref} className={cx(inputClasses, className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...rest }, ref,
) {
  return (
    <div className="relative">
      <select ref={ref} className={cx(inputClasses, 'appearance-none pr-10', className)} {...rest}>{children}</select>
      <svg viewBox="0 0 24 24" aria-hidden="true" className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 fill-none stroke-tx2" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="m6 9 6 6 6-6" />
      </svg>
    </div>
  );
});

export function SearchInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={cx('relative', className)}>
      <svg viewBox="0 0 24 24" aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 fill-none stroke-tx3" strokeWidth={1.7} strokeLinecap="round">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input type="search" autoComplete="off" className={cx(inputClasses, 'pl-[42px]')} {...rest} />
    </div>
  );
}

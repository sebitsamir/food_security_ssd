'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BrandMark } from './BrandMark';
import { ThemeToggle } from './ThemeToggle';
import { cx } from '@/lib/cx';

export const NAV = [
  { href: '/', label: 'Overview' },
  { href: '/predict', label: 'Predict' },
  { href: '/forecasts', label: 'Forecasts' },
  { href: '/counties', label: 'Counties' },
  { href: '/model', label: 'Model' },
  { href: '/methodology', label: 'Methodology' },
] as const;

const isActive = (pathname: string, href: string) => (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`));

export function TopBar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [open]);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex h-16 max-w-[1360px] items-center gap-3 px-[max(1.25rem,env(safe-area-inset-left))] min-[520px]:gap-5 lg:px-8">
        <Link href="/" className="flex items-center gap-[11px] whitespace-nowrap text-[15px] font-semibold tracking-[-0.012em]">
          <BrandMark />
          <span>Food Security<span className="max-[520px]:hidden"> Intelligence</span></span>
        </Link>

        <nav aria-label="Main" className="ml-4 hidden gap-0.5 min-[960px]:flex">
          {NAV.map((n) => {
            const active = isActive(pathname, n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? 'page' : undefined}
                className={cx(
                  'relative rounded-lg px-[13px] py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-info',
                  active ? 'text-tx after:absolute after:inset-x-[13px] after:-bottom-[13px] after:h-0.5 after:rounded-sm after:bg-tx' : 'text-tx2 hover:text-tx',
                )}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2.5">
          <ThemeToggle />
          <button
            type="button"
            aria-label="Menu"
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((o) => !o)}
            className="grid size-11 place-items-center rounded-full border border-line bg-surface hover:border-tx3 min-[960px]:hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-info"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[18px] fill-none stroke-current" strokeWidth={1.7} strokeLinecap="round">
              {open ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 8h16M4 16h16" />}
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <nav id="mobile-nav" aria-label="Main" className="border-t border-line bg-bg px-3.5 pb-3.5 pt-2 min-[960px]:hidden">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={isActive(pathname, n.href) ? 'page' : undefined}
              className={cx('flex min-h-12 items-center rounded-[10px] px-2.5 font-medium', isActive(pathname, n.href) ? 'bg-elev text-tx' : 'text-tx2')}
            >
              {n.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}

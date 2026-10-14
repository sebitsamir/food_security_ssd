'use client';

import { useEffect, useState } from 'react';

type Theme = 'dark' | 'light';

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);
  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
  }, []);

  const toggle = () => {
    const next: Theme = theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch { /* private mode: choice just won't persist */ }
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next === 'light' ? '#F2F4F6' : '#08111A');
    setTheme(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme ? `Switch to ${theme === 'light' ? 'dark' : 'light'} theme` : 'Switch theme'}
      className="grid size-11 place-items-center rounded-full border border-line bg-surface text-tx hover:border-tx3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-info"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[18px] fill-none stroke-current" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
        {theme === 'light' ? (
          <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" />
        ) : (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </>
        )}
      </svg>
    </button>
  );
}

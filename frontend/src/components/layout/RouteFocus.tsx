'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

/** After client-side navigation, move focus to the page heading so screen-reader users land on it. */
export function RouteFocus() {
  const pathname = usePathname();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    document.querySelector<HTMLElement>('main h1')?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

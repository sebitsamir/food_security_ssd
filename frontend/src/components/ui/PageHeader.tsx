import type { ReactNode } from 'react';

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <h1 tabIndex={-1} className="text-[clamp(1.875rem,3.8vw,2.75rem)] font-normal leading-[1.08] tracking-[-0.032em] outline-none">
        {title}
      </h1>
      {children && <div className="flex flex-wrap items-center gap-2.5">{children}</div>}
    </header>
  );
}

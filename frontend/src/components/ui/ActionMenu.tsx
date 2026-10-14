'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { buttonClasses } from './Button';

export type MenuItem = { id: string; title: string; description: string; tag: string; onSelect: () => void };

/** Accessible menu button: arrow keys, Escape (returns focus), outside click, auto-flips at screen edges. */
export function ActionMenu({ label, icon, items, disabled }: { label: string; icon?: ReactNode; items: MenuItem[]; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [alignLeft, setAlignLeft] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !pop.current) return;
    setAlignLeft(false);
    const r = pop.current.getBoundingClientRect();
    if (r.left < 8) setAlignLeft(true);
    pop.current.querySelector<HTMLElement>('[role=menuitem]')?.focus();
  }, [open]);

  const onItemKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const nodes = [...(pop.current?.querySelectorAll<HTMLElement>('[role=menuitem]') ?? [])];
    if (e.key === 'ArrowDown') { e.preventDefault(); nodes[(i + 1) % nodes.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); nodes[(i - 1 + nodes.length) % nodes.length]?.focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); close(true); }
    else if (e.key === 'Tab') close(false);
  };

  return (
    <div ref={root} className="relative inline-block">
      <button
        ref={trigger}
        type="button"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
        className={buttonClasses({ size: 'sm' })}
      >
        {icon}
        {label}
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-3.5 fill-none stroke-current opacity-65" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && (
        <div
          ref={pop}
          id={menuId}
          role="menu"
          aria-label={label}
          className={`absolute top-[calc(100%+8px)] z-50 w-[276px] max-w-[calc(100vw-32px)] rounded-2xl border border-line bg-surface p-1.5 text-left shadow-[0_20px_44px_-14px_rgba(0,0,0,.5)] ${alignLeft ? 'left-0' : 'right-0'}`}
        >
          {items.map((it, i) => (
            <button
              key={it.id}
              role="menuitem"
              type="button"
              onKeyDown={(e) => onItemKey(e, i)}
              onClick={() => { close(true); it.onSelect(); }}
              className="flex min-h-[54px] w-full items-center gap-3 rounded-[11px] px-3 py-2.5 text-left hover:bg-elev focus-visible:bg-elev focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-info"
            >
              <span aria-hidden="true" className="grid size-9 flex-none place-items-center rounded-[10px] border border-line text-[10px] font-semibold tracking-[.05em] text-tx2">{it.tag}</span>
              <span>
                <b className="block text-sm font-medium text-tx">{it.title}</b>
                <small className="block text-[12.5px] leading-snug text-tx3">{it.description}</small>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

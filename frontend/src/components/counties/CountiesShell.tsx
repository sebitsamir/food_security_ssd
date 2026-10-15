'use client';

import Link from 'next/link';
import { useSelectedLayoutSegment } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Panel } from '@/components/ui/Panel';
import { SearchInput, Select } from '@/components/ui/Field';
import { Segmented } from '@/components/ui/Segmented';
import { SignalBars } from '@/components/risk/RiskBadge';
import { bandFor, formatPct } from '@/lib/risk';
import { cx } from '@/lib/cx';
import type { CountyRecord } from '@/lib/schemas';

/**
 * Master/detail. Each county has its own URL (/counties/[pcode]), so links can be shared and the
 * back button works. On phones the list and the detail are separate screens; from 720px they sit
 * side by side.
 */
export function CountiesShell({ counties, children }: { counties: CountyRecord[]; children: ReactNode }) {
  const selected = useSelectedLayoutSegment();
  const [q, setQ] = useState('');
  const [state, setState] = useState('');
  const [sort, setSort] = useState<'p' | 'a'>('p');
  const list = useRef<HTMLUListElement>(null);

  const states = useMemo(() => {
    const m = new Map<string, string>();
    counties.forEach((c) => m.set(c.state_pcode, c.state_name));
    return [...m].map(([pcode, name]) => ({ pcode, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [counties]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return counties
      .filter((c) => (!needle || c.name.toLowerCase().includes(needle)) && (!state || c.state_pcode === state))
      .sort((a, b) => (sort === 'p' ? b.probability - a.probability : a.name.localeCompare(b.name)));
  }, [counties, q, state, sort]);

  // Keep the selected row in view inside the list, without scrolling the page.
  useEffect(() => {
    const ul = list.current;
    const el = ul?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!ul || !el || ul.scrollHeight <= ul.clientHeight + 1) return;
    ul.scrollTop += el.getBoundingClientRect().top - ul.getBoundingClientRect().top - (ul.clientHeight - el.offsetHeight) / 2;
  }, [selected]);

  return (
    <div className="grid gap-5 min-[720px]:grid-cols-[minmax(260px,340px)_minmax(0,1fr)] min-[720px]:items-start">
      <Panel
        aria-label="County list"
        className={cx('flex flex-col overflow-hidden !p-0 min-[720px]:sticky min-[720px]:top-[88px] min-[720px]:max-h-[calc(100dvh-112px)]', selected && 'max-[719px]:hidden')}
      >
        <div className="grid gap-3 border-b border-line p-4">
          <SearchInput placeholder="Search county" aria-label="Search county" value={q} onChange={(e) => setQ(e.target.value)} />
          <Select aria-label="State" value={state} onChange={(e) => setState(e.target.value)}>
            <option value="">All states</option>
            {states.map((s) => <option key={s.pcode} value={s.pcode}>{s.name}</option>)}
          </Select>
          <Segmented label="Sort" className="w-full [&>button]:flex-1" value={sort} onChange={setSort} options={[{ value: 'p', label: 'Highest risk' }, { value: 'a', label: 'A to Z' }]} />
        </div>
        <ul ref={list} aria-label="Counties" className="overflow-auto min-[720px]:min-h-0 min-[720px]:flex-1">
          {rows.length ? rows.map((c) => {
            const band = bandFor(c.probability);
            const current = c.pcode === selected;
            return (
              <li key={c.pcode} className="border-t border-line first:border-t-0">
                <Link
                  href={`/counties/${c.pcode}`}
                  aria-current={current ? 'page' : undefined}
                  className={cx('relative grid min-h-16 grid-cols-[1fr_auto] items-center gap-3 px-[18px] py-3.5 hover:bg-elev/60 focus-visible:-outline-offset-2', current && 'bg-elev before:absolute before:inset-y-2.5 before:left-0 before:w-[3px] before:rounded-r before:bg-tx')}
                >
                  <span><span className="block font-medium">{c.name}</span><small className="block text-[13px] text-tx3">{c.state_name}</small></span>
                  <span className="inline-flex items-center gap-2.5 font-medium tabular-nums">{formatPct(c.probability)}{band && <SignalBars n={band.n} color={band.color} />}</span>
                </Link>
              </li>
            );
          }) : (
            <li className="px-5 py-10 text-center text-tx2"><b className="mb-1 block font-medium text-tx">No county found</b>Try another name or state.</li>
          )}
        </ul>
      </Panel>
      <div className={cx(!selected && 'max-[719px]:hidden')}>{children}</div>
    </div>
  );
}

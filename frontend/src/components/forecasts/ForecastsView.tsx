'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Segmented } from '@/components/ui/Segmented';
import { SearchInput, Select } from '@/components/ui/Field';
import { Chip } from '@/components/ui/Chip';
import { Panel } from '@/components/ui/Panel';
import { Pager } from '@/components/ui/Pager';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ExportMenu } from '@/components/export/ExportMenu';
import { PeriodSelect } from '@/components/layout/PeriodSelect';
import { RiskBadge, SignalBars } from '@/components/risk/RiskBadge';
import { ProbabilityCell } from '@/components/risk/ProbabilityCell';
import { StateExplorer } from '@/components/map/StateExplorer';
import { BANDS } from '@/lib/risk';
import { formatPeriod, slugify } from '@/lib/format';
import { DEFAULT_QUERY, PAGE_SIZE, filterRows, parseQuery, toSearch, type ForecastQuery, type SortKey } from '@/lib/forecasts';
import { forecastCsv } from '@/lib/export/csv';
import { makeListPdf } from '@/lib/export/reports';
import { dayStamp } from '@/lib/export/download';
import type { AreaCollection, CountyRecord } from '@/lib/schemas';

type Props = {
  rows: CountyRecord[];
  period: string;
  periods: string[];
  modelVersion: string;
  states: AreaCollection;
  stateRisk: Record<string, number>;
};

export function ForecastsView({ rows, period, periods, modelVersion, states, stateRisk }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const query = useMemo(() => parseQuery(new URLSearchParams(params.toString())), [params]);
  const [qInput, setQInput] = useState(query.q);

  // The newest intended filters. Updates build on this (not on the last rendered URL), so two quick
  // changes - e.g. a chip click followed by typing - can never overwrite each other.
  const latest = useRef(query);
  useEffect(() => { latest.current = query; }, [query]);
  const update = (patch: Partial<ForecastQuery>) => {
    const next = { ...latest.current, ...patch };
    latest.current = next;
    router.replace(`${pathname}${toSearch(next, new URLSearchParams(params.toString()))}`, { scroll: false });
  };

  // Debounced search: typing stays instant, the URL (and results) follow.
  useEffect(() => {
    if (qInput === latest.current.q) return;
    const t = setTimeout(() => update({ q: qInput, page: 1 }), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qInput]);
  useEffect(() => setQInput(query.q), [query.q]);

  const stateOptions = useMemo(() => {
    const m = new Map<string, string>();
    rows.forEach((c) => m.set(c.state_pcode, c.state_name));
    return [...m].map(([pcode, name]) => ({ pcode, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const filtered = useMemo(() => filterRows(rows, query), [rows, query]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(query.page, pages);
  const slice = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const scope = [
    query.state && stateOptions.find((s) => s.pcode === query.state)?.name,
    query.band && `${BANDS.find((b) => b.key === query.band)?.label} band`,
    query.q && `"${query.q}"`,
  ].filter(Boolean);
  const stem = `forecasts${query.state ? `-${slugify(stateOptions.find((s) => s.pcode === query.state)?.name ?? query.state)}` : ''}-${dayStamp()}`;
  const n = filtered.length;
  const noun = n === 1 ? 'county' : 'counties';

  const sortBy = (key: SortKey) => {
    const cur = latest.current;
    update(cur.sort === key ? { dir: cur.dir === 'asc' ? 'desc' : 'asc', page: 1 } : { sort: key, dir: key === 'county' ? 'asc' : 'desc', page: 1 });
  };
  const aria = (key: SortKey) => (query.sort === key ? (query.dir === 'asc' ? 'ascending' : 'descending') : 'none');

  return (
    <div className="space-y-7">
      <PageHeader title="Forecasts">
        <PeriodSelect periods={periods} value={period} />
        <ExportMenu
          disabled={!n}
          actions={[
            {
              kind: 'PDF', title: 'PDF report', description: `${n} ${noun}, formatted summary`, filename: `${stem}.pdf`,
              build: () => makeListPdf({
                title: 'County forecasts', label: 'Forecast report', noun: 'Counties',
                subtitle: `${formatPeriod(period)} period. ${scope.length ? `Filters: ${scope.join(', ')}.` : 'All counties.'}`,
                rows: filtered.map((c) => ({ rank: c.rank, county: c.name, state: c.state_name, p: c.probability })),
              }),
            },
            { kind: 'CSV', title: 'CSV data', description: `${n} ${noun}, spreadsheet-ready`, filename: `${stem}.csv`, build: () => forecastCsv(filtered, period, modelVersion) },
          ]}
        />
        <Segmented
          label="View"
          value={query.view}
          options={[{ value: 'table', label: 'Table' }, { value: 'map', label: 'Map' }]}
          onChange={(view) => update({ view })}
        />
      </PageHeader>

      <div role="search" className="grid gap-3.5">
        <div className="flex flex-wrap gap-3">
          <SearchInput className="max-w-[360px] flex-1 basis-[220px]" placeholder="Search county" aria-label="Search county" value={qInput} onChange={(e) => setQInput(e.target.value)} />
          <Select aria-label="State" className="min-w-[190px]" value={query.state} onChange={(e) => update({ state: e.target.value, page: 1 })}>
            <option value="">All states</option>
            {stateOptions.map((s) => <option key={s.pcode} value={s.pcode}>{s.name}</option>)}
          </Select>
        </div>
        <div role="group" aria-label="Risk band" className="flex flex-wrap gap-2">
          <Chip pressed={!query.band} onClick={() => update({ band: '', page: 1 })}>All</Chip>
          {BANDS.map((b) => (
            <Chip key={b.key} pressed={query.band === b.key} onClick={() => update({ band: b.key, page: 1 })}>
              <SignalBars n={b.n} color={b.color} />
              {b.label}
            </Chip>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-3 text-[13px] text-tx2" aria-live="polite">{n} {noun}</p>
        {query.view === 'table' ? (
          <>
            <Panel className="overflow-x-auto !px-2 !py-1">
              <table className="rtable">
                <caption className="sr-only">County forecasts, {formatPeriod(period)}</caption>
                <thead>
                  <tr>
                    {([['county', 'County'], ['p', 'Probability'], ['band', 'Risk band']] as const).map(([key, label]) => (
                      <th key={key} scope="col" aria-sort={aria(key)}>
                        <button type="button" onClick={() => sortBy(key)} className="inline-flex items-center gap-1.5 focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-info">
                          {label}
                          <span aria-hidden="true" className={`text-[9px] ${query.sort === key ? 'opacity-100' : 'opacity-50'}`}>{query.sort === key && query.dir === 'asc' ? '▲' : '▼'}</span>
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {slice.length ? slice.map((c) => (
                    <tr key={c.pcode}>
                      <td><Link href={`/counties/${c.pcode}`} className="font-medium hover:underline">{c.name}</Link><small className="block text-[13px] text-tx3">{c.state_name}</small></td>
                      <td className="c-p"><ProbabilityCell probability={c.probability} /></td>
                      <td className="c-b"><RiskBadge probability={c.probability} /></td>
                    </tr>
                  )) : (
                    <tr><td colSpan={3}>
                      <EmptyState title="No counties match" action={<Button size="sm" onClick={() => { setQInput(''); update({ ...DEFAULT_QUERY, view: query.view }); }}>Clear filters</Button>}>
                        Try another state or risk band.
                      </EmptyState>
                    </td></tr>
                  )}
                </tbody>
              </table>
            </Panel>
            <Pager page={page} pageSize={PAGE_SIZE} total={n} onChange={(p) => update({ page: p })} />
          </>
        ) : (
          <StateExplorer layout="split" states={states} stateRisk={stateRisk} counties={rows} />
        )}
      </div>
    </div>
  );
}

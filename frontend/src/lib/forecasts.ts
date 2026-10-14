import { BANDS } from './risk';
import type { CountyRecord } from './schemas';

export type SortKey = 'county' | 'p' | 'band';
export type ForecastQuery = { q: string; state: string; band: string; sort: SortKey; dir: 'asc' | 'desc'; page: number; view: 'table' | 'map' };

export const PAGE_SIZE = 10;
export const DEFAULT_QUERY: ForecastQuery = { q: '', state: '', band: '', sort: 'p', dir: 'desc', page: 1, view: 'table' };

/** Reads the URL, falling back to defaults for anything missing or tampered with. */
export function parseQuery(params: URLSearchParams): ForecastQuery {
  const sort = params.get('sort');
  const dir = params.get('dir');
  const band = params.get('band') ?? '';
  const page = Number(params.get('page'));
  return {
    q: (params.get('q') ?? '').slice(0, 80),
    state: (params.get('state') ?? '').slice(0, 16),
    band: BANDS.some((b) => b.key === band) ? band : '',
    sort: sort === 'county' || sort === 'band' || sort === 'p' ? sort : DEFAULT_QUERY.sort,
    dir: dir === 'asc' || dir === 'desc' ? dir : sort === 'county' ? 'asc' : DEFAULT_QUERY.dir,
    page: Number.isInteger(page) && page > 0 ? page : 1,
    view: params.get('view') === 'map' ? 'map' : 'table',
  };
}

/** Serialises only non-default values, so shared links stay short and clean. */
export function toSearch(q: ForecastQuery, keep?: URLSearchParams): string {
  const p = new URLSearchParams();
  keep?.forEach((v, k) => { if (k === 'period') p.set(k, v); });
  if (q.q) p.set('q', q.q);
  if (q.state) p.set('state', q.state);
  if (q.band) p.set('band', q.band);
  if (q.sort !== DEFAULT_QUERY.sort) p.set('sort', q.sort);
  const defaultDir = q.sort === 'county' ? 'asc' : 'desc';
  if (q.dir !== defaultDir) p.set('dir', q.dir);
  if (q.page > 1) p.set('page', String(q.page));
  if (q.view === 'map') p.set('view', 'map');
  const s = p.toString();
  return s ? `?${s}` : '';
}

export function filterRows(rows: CountyRecord[], q: ForecastQuery): CountyRecord[] {
  const needle = q.q.trim().toLowerCase();
  const out = rows.filter((c) =>
    (!needle || c.name.toLowerCase().includes(needle)) && (!q.state || c.state_pcode === q.state) && (!q.band || c.band === q.band));
  const sign = q.dir === 'asc' ? 1 : -1;
  return out.sort((a, b) => sign * (q.sort === 'county' ? a.name.localeCompare(b.name) : a.probability - b.probability) || a.name.localeCompare(b.name));
}

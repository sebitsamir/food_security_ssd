import { describe, expect, it } from 'vitest';
import { bandFor, formatPct } from '@/lib/risk';
import { formatPeriod, formatPeriodShort, formatTonnes, shortName, slugify, titleCase } from '@/lib/format';
import { AreaCollectionSchema, PeriodsSchema, PredictionInputSchema, RiskResponseSchema, toValues } from '@/lib/schemas';
import { DEFAULT_QUERY, filterRows, parseQuery, toSearch } from '@/lib/forecasts';
import { formFromCounty, parseForm } from '@/lib/predictForm';
import { counties, states } from './fixtures';

describe('bandFor', () => {
  it.each([[0, 'lower'], [0.1999, 'lower'], [0.2, 'moderate'], [0.4999, 'moderate'], [0.5, 'elevated'], [0.7999, 'elevated'], [0.8, 'high'], [1, 'high']])(
    '%s -> %s', (p, key) => expect(bandFor(p)?.key).toBe(key));
  it.each([NaN, Infinity, -0.01, 1.01, undefined, null])('rejects %s', (p) => expect(bandFor(p)).toBeNull());
  it('formats percentages', () => { expect(formatPct(0.874)).toBe('87.4%'); expect(formatPct(0.874, 0)).toBe('87%'); });
});

describe('format', () => {
  it('formats periods in UTC and tolerates junk', () => {
    expect(formatPeriod('2026-04')).toBe('Apr 2026');
    expect(formatPeriodShort('2025-10')).toBe('Oct ’25');
    expect(formatPeriod('nope')).toBe('nope');
  });
  it('uses a real minus sign for deficits', () => { expect(formatTonnes(-23378)).toBe('−23,378 t'); expect(formatTonnes(8765)).toBe('8,765 t'); });
  it('slugifies and shortens', () => {
    expect(slugify('Pigi/Canal')).toBe('pigi-canal');
    expect(shortName('Western Equatoria')).toBe('W. Equatoria');
    expect(shortName('Jonglei')).toBe('Jonglei');
    expect(titleCase('expanding_window')).toBe('Expanding window');
  });
});

describe('schemas', () => {
  it('accepts valid and rejects invalid boundaries', () => {
    expect(AreaCollectionSchema.safeParse(states).success).toBe(true);
    expect(AreaCollectionSchema.safeParse({ ...states, features: [states.features[0], states.features[0]] }).success).toBe(false);
    expect(AreaCollectionSchema.safeParse({ type: 'FeatureCollection', features: [] }).success).toBe(false);
  });
  it.each([1.2, -0.1, Number.NaN])('rejects probability %s', (probability) =>
    expect(RiskResponseSchema.safeParse({ level: 'states', period: '2026-04', model_version: '1', items: [{ pcode: 'A', probability }] }).success).toBe(false));
  it('maps risk to a lookup and validates periods', () => {
    const r = RiskResponseSchema.parse({ level: 'states', period: '2026-04', model_version: '1', items: [{ pcode: 'A', probability: 0.5, county_count: 3 }] });
    expect(toValues(r)).toEqual({ A: 0.5 });
    expect(PeriodsSchema.safeParse({ latest: '2026-13', periods: [] }).success).toBe(false);
  });
  it('enforces the same bounds as the API', () => {
    const ok = { county_pcode: 'X1', start_year: 2025, start_month: 4, population: 1000, previous_ipc_phase: 3, phase3plus_pct: 50, cereal_production_t: 0, cereal_gap_t: -5 };
    expect(PredictionInputSchema.safeParse(ok).success).toBe(true);
    for (const bad of [{ previous_ipc_phase: 6 }, { start_month: 13 }, { phase3plus_pct: 101 }, { population: 0 }, { cereal_production_t: -1 }, { county_pcode: 'a b' }]) {
      expect(PredictionInputSchema.safeParse({ ...ok, ...bad }).success).toBe(false);
    }
  });
});

describe('forecast query (URL state)', () => {
  it('round-trips and omits defaults', () => {
    expect(toSearch(DEFAULT_QUERY)).toBe('');
    const q = { ...DEFAULT_QUERY, q: 'bor', state: 'S1', band: 'high', sort: 'county' as const, dir: 'desc' as const, page: 3, view: 'map' as const };
    expect(parseQuery(new URLSearchParams(toSearch(q)))).toEqual(q);
  });
  it('falls back for tampered values', () => {
    expect(parseQuery(new URLSearchParams('band=evil&sort=drop&dir=up&page=-4&view=x'))).toEqual(DEFAULT_QUERY);
    expect(parseQuery(new URLSearchParams(`q=${'a'.repeat(500)}`)).q).toHaveLength(80);
  });
  it('keeps the period when serialising', () => {
    expect(toSearch({ ...DEFAULT_QUERY, band: 'high' }, new URLSearchParams('period=2025-10&junk=1'))).toBe('?period=2025-10&band=high');
  });
  it('filters, searches and sorts', () => {
    expect(filterRows(counties, { ...DEFAULT_QUERY, state: 'S1' }).map((c) => c.pcode)).toEqual(['S1B', 'S1A']);
    expect(filterRows(counties, { ...DEFAULT_QUERY, band: 'high' }).map((c) => c.pcode)).toEqual(['S3A', 'S1B']);
    expect(filterRows(counties, { ...DEFAULT_QUERY, q: ' ONE ' }).map((c) => c.name)).toEqual(['Gamma One', 'Beta One', 'Alpha One']);
    expect(filterRows(counties, { ...DEFAULT_QUERY, sort: 'county', dir: 'asc' })[0]?.name).toBe('Alpha One');
    expect(filterRows(counties, { ...DEFAULT_QUERY, q: 'zzz' })).toEqual([]);
  });
});

describe('predict form', () => {
  const base = formFromCounty(counties[0]!, '2026-04');
  it('prefills from the county facts and period', () => {
    expect(base).toMatchObject({ state: 'S1', county: 'S1A', year: '2026', month: '4', population: '420,000', phase: 3, pct: '60', production: '8,765', gap: '-23,378' });
  });
  it('parses formatted numbers', () => {
    const r = parseForm(base);
    expect(r.ok && r.payload).toMatchObject({ population: 420000, cereal_gap_t: -23378, start_month: 4 });
  });
  it.each([
    [{ population: '0' }, 'population'], [{ population: '1.5' }, 'population'], [{ year: '95' }, 'year'],
    [{ pct: '101' }, 'pct'], [{ pct: '' }, 'pct'], [{ production: '-1' }, 'production'], [{ gap: 'abc' }, 'gap'],
  ])('rejects %j', (over, field) => {
    const r = parseForm({ ...base, ...over });
    expect(!r.ok && r.errors[field as 'population']).toBeTruthy();
  });
});

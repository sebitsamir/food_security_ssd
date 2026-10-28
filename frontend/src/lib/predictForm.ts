import { PredictionInputSchema, type CountyRecord, type PredictionInput } from './schemas';
import { periodParts } from './format';

export type FormState = {
  state: string; county: string; population: string; year: string; month: string;
  phase: number; pct: string; production: string; gap: string;
};
export type FieldErrors = Partial<Record<'population' | 'year' | 'pct' | 'production' | 'gap', string>>;

export type PredictCounty = Pick<CountyRecord, 'pcode' | 'name' | 'state_pcode' | 'state_name' | 'facts'>;

const num = (s: string): number => {
  const t = s.replace(/[,\s]/g, '');
  return t === '' ? Number.NaN : Number(t);
};
const fmt = (n: number): string => (Number.isFinite(n) ? n.toLocaleString('en-US') : '');

/** Fills the form from a county's latest known inputs. Everything stays editable. */
export function formFromCounty(c: PredictCounty, period: string): FormState {
  const { year, month } = periodParts(period);
  const f = c.facts;
  return {
    state: c.state_pcode, county: c.pcode, year: String(year), month: String(month),
    population: f ? fmt(f.population) : '', phase: f?.previous_ipc_phase ?? 3,
    pct: f ? String(f.phase3plus_pct) : '', production: f ? fmt(f.cereal_production_t) : '',
    gap: f ? fmt(f.cereal_gap_t) : '',
  };
}

export type ParseResult = { ok: true; payload: PredictionInput } | { ok: false; errors: FieldErrors };

/** Friendly, field-level messages first; the shared schema is the final guarantee. */
export function parseForm(f: FormState): ParseResult {
  const errors: FieldErrors = {};
  const population = num(f.population), year = num(f.year), pct = num(f.pct);
  const production = num(f.production), gap = num(f.gap);
  if (!(Number.isInteger(population) && population >= 1 && population <= 50_000_000)) errors.population = 'Enter a population between 1 and 50,000,000.';
  if (!(Number.isInteger(year) && year >= 1990 && year <= 2100)) errors.year = 'Enter a four-digit year.';
  if (!(Number.isFinite(pct) && pct >= 0 && pct <= 100)) errors.pct = 'Enter a value from 0 to 100.';
  if (!(Number.isFinite(production) && production >= 0)) errors.production = 'Enter 0 or more.';
  if (!Number.isFinite(gap)) errors.gap = 'Enter a number. Negative is valid.';
  if (Object.keys(errors).length) return { ok: false, errors };

  const parsed = PredictionInputSchema.safeParse({
    county_pcode: f.county, start_year: year, start_month: Number(f.month), population,
    previous_ipc_phase: f.phase, phase3plus_pct: pct, cereal_production_t: production, cereal_gap_t: gap,
  });
  if (!parsed.success) return { ok: false, errors: { population: 'Please check the inputs and try again.' } };
  return { ok: true, payload: parsed.data };
}

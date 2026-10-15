import { bandFor } from '../risk';
import { phaseLabel } from '../phases';
import type { PredictionRecord } from './types';
import type { CountyRecord } from '../schemas';

/** RFC 4180 quoting, plus neutralising spreadsheet formula injection (=, +, -, @ at the start). */
export function csvCell(value: string | number | null | undefined): string {
  let s = value === null || value === undefined ? '' : value;
  if (typeof s === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  const text = String(s);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export const csvText = (head: string[], rows: (string | number | null)[][]): string =>
  `\uFEFF${[head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`; // BOM: Excel reads UTF-8

const toBlob = (text: string): Blob => new Blob([text], { type: 'text/csv;charset=utf-8' });

export const PREDICTION_HEAD = [
  'prediction_id', 'exported_at', 'county', 'county_pcode', 'state', 'start_year', 'start_month', 'population',
  'previous_ipc_phase', 'phase3plus_share_pct', 'cereal_production_t', 'cereal_gap_t', 'risk_probability',
  'risk_band', 'sensitivity_probability_c100', 'model_spread_pp', 'model_version', 'warnings',
];

export const predictionRow = (r: PredictionRecord): (string | number)[] => [
  r.id, r.at, r.county, r.countyPcode, r.state, r.year, r.month, r.population,
  `${r.phase} ${phaseLabel(r.phase)}`, r.pct, r.production, r.gap, +r.p1.toFixed(3),
  bandFor(r.p1)?.label ?? '', +r.p2.toFixed(3), +(Math.abs(r.p2 - r.p1) * 100).toFixed(1),
  r.modelVersion, r.warnings.join('; '),
];

export const predictionCsv = (records: PredictionRecord[]): Blob =>
  toBlob(csvText(PREDICTION_HEAD, records.map(predictionRow)));

export const FORECAST_HEAD = [
  'rank', 'county', 'county_pcode', 'state', 'state_pcode', 'risk_probability', 'risk_band', 'period', 'model_version',
];

export const forecastCsv = (rows: CountyRecord[], period: string, modelVersion: string): Blob =>
  toBlob(csvText(FORECAST_HEAD, rows.map((c) => [
    c.rank, c.name, c.pcode, c.state_name, c.state_pcode, +c.probability.toFixed(3),
    bandFor(c.probability)?.label ?? '', period, modelVersion,
  ])));

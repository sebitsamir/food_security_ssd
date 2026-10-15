import type { AreaCollection, CountyRecord, CountyDetail, PredictionResponse } from '@/lib/schemas';
import { bandFor } from '@/lib/risk';

const sq = (x: number, y: number, w = 1.5) => ({
  type: 'Polygon' as const,
  coordinates: [[[x, y], [x + w, y], [x + w, y + w], [x, y + w], [x, y]]],
});
const feat = (pcode: string, name: string, x: number, y: number, parent?: string) => ({
  type: 'Feature' as const,
  properties: { pcode, name, ...(parent ? { parent } : {}) },
  geometry: sq(x, y),
});

export const states: AreaCollection = {
  type: 'FeatureCollection',
  features: [feat('S1', 'Alpha', 27, 5), feat('S2', 'Beta', 30, 5), feat('S3', 'Gamma', 27, 8)],
};
export const stateRisk = { S1: 0.1, S2: 0.6, S3: 0.92 };

const NAMES: Record<string, string> = { S1: 'Alpha', S2: 'Beta', S3: 'Gamma' };
export function county(pcode: string, name: string, state: string, p: number, rank = 1): CountyRecord {
  return {
    pcode, name, state_pcode: state, state_name: NAMES[state] ?? state, probability: p,
    band: bandFor(p)!.key, rank,
    facts: { population: 420000, previous_ipc_phase: 3, phase3plus_pct: 60, cereal_production_t: 8765, cereal_gap_t: -23378 },
  };
}

export const counties: CountyRecord[] = [
  county('S1A', 'Alpha One', 'S1', 0.15, 6), county('S1B', 'Alpha Two', 'S1', 0.85, 2),
  county('S2A', 'Beta One', 'S2', 0.6, 4), county('S2B', 'Beta Two', 'S2', 0.45, 5),
  county('S3A', 'Gamma One', 'S3', 0.95, 1), county('S3B', 'Gamma Two', 'S3', 0.7, 3),
];

export const detail: CountyDetail = {
  ...counties[1]!, period: '2026-04', model_version: '1.0.0', state_rank: 1, state_county_count: 2,
  history: [
    { period: '2024-04', phase3plus_pct: 40 }, { period: '2024-10', phase3plus_pct: 52 },
    { period: '2025-04', phase3plus_pct: 47 }, { period: '2025-10', phase3plus_pct: 60 },
  ],
};

export const prediction = (over: Partial<PredictionResponse> = {}): PredictionResponse => ({
  prediction_id: '11111111-2222-4333-8444-555555555555', model_version: '1.0.0',
  county: { pcode: 'S1A', name: 'Alpha One', state_pcode: 'S1', state_name: 'Alpha' },
  risk_probability: 0.874, risk_band: 'high', sensitivity_probability: 0.889, model_spread: 0.015, warnings: [],
  ...over,
});

export const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' }, ...init });

export const readBlob = (b: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsText(b);
  });

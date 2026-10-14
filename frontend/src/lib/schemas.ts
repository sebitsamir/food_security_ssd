import { z } from 'zod';

/** Everything crossing the network boundary is validated. Bad data fails loudly, not visually. */
const Position = z.array(z.number().finite()).min(2);
const Ring = z.array(Position).min(4);
const PolygonGeometry = z.object({ type: z.literal('Polygon'), coordinates: z.array(Ring).min(1) });
const MultiPolygonGeometry = z.object({
  type: z.literal('MultiPolygon'),
  coordinates: z.array(z.array(Ring).min(1)).min(1),
});

export const AreaFeatureSchema = z.object({
  type: z.literal('Feature'),
  properties: z.object({
    pcode: z.string().min(1).max(16),
    name: z.string().min(1),
    parent: z.string().nullish(),
  }),
  geometry: z.discriminatedUnion('type', [PolygonGeometry, MultiPolygonGeometry]),
});

export const AreaCollectionSchema = z
  .object({ type: z.literal('FeatureCollection'), features: z.array(AreaFeatureSchema).min(1) })
  .superRefine((fc, ctx) => {
    const seen = new Set<string>();
    for (const f of fc.features) {
      if (seen.has(f.properties.pcode)) {
        ctx.addIssue({ code: 'custom', message: `duplicate pcode ${f.properties.pcode}` });
      }
      seen.add(f.properties.pcode);
    }
  });

export const PeriodSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const BandKeySchema = z.enum(['lower', 'moderate', 'elevated', 'high']);
const Probability = z.number().min(0).max(1);

export const RiskResponseSchema = z.object({
  level: z.enum(['states', 'counties']),
  period: PeriodSchema,
  model_version: z.string(),
  items: z.array(
    z.object({ pcode: z.string(), probability: Probability, county_count: z.number().int().positive().nullish() }),
  ),
});

export const PeriodsSchema = z.object({ latest: PeriodSchema.nullable(), periods: z.array(PeriodSchema) });

export const GeoMetaSchema = z.object({
  synthetic: z.boolean(),
  source: z.string(),
  attribution: z.string(),
  license: z.string(),
});

export const FactsSchema = z.object({
  population: z.number().int(),
  previous_ipc_phase: z.number().int().min(1).max(5),
  phase3plus_pct: z.number().min(0).max(100),
  cereal_production_t: z.number(),
  cereal_gap_t: z.number(),
});

export const CountyRecordSchema = z.object({
  pcode: z.string(),
  name: z.string(),
  state_pcode: z.string(),
  state_name: z.string(),
  probability: Probability,
  band: BandKeySchema,
  rank: z.number().int().positive(),
  facts: FactsSchema.nullable(),
});

export const CountiesResponseSchema = z.object({
  period: PeriodSchema,
  model_version: z.string(),
  items: z.array(CountyRecordSchema),
});

export const CountyDetailSchema = CountyRecordSchema.extend({
  period: PeriodSchema,
  model_version: z.string(),
  state_rank: z.number().int().positive(),
  state_county_count: z.number().int().positive(),
  history: z.array(z.object({ period: PeriodSchema, phase3plus_pct: z.number() })),
});

const Stats = z.object({ mean: z.number(), std: z.number(), min: z.number(), max: z.number(), latest: z.number() });
export const ModelInfoSchema = z.object({
  name: z.string(),
  version: z.string(),
  algorithm: z.string(),
  parameters: z.record(z.unknown()),
  sensitivity_parameters: z.record(z.unknown()),
  metric: z.string(),
  validation_strategy: z.string(),
  synthetic: z.boolean(),
  trained_at: z.string(),
  training_periods: z.number().int(),
  training_counties: z.number().int(),
  folds: z.array(z.object({ fold: z.number().int(), test_period: z.string(), roc_auc: z.number(), roc_auc_sensitivity: z.number() })),
  production: Stats,
  sensitivity: Stats,
});

export const PredictionResponseSchema = z.object({
  prediction_id: z.string(),
  model_version: z.string(),
  county: z.object({ pcode: z.string(), name: z.string(), state_pcode: z.string(), state_name: z.string() }),
  risk_probability: Probability,
  risk_band: BandKeySchema,
  sensitivity_probability: Probability,
  model_spread: Probability,
  warnings: z.array(z.object({ code: z.string(), severity: z.enum(['info', 'warning']), message: z.string() })),
});

/** Same bounds as the API. The server is authoritative; this gives instant, friendly feedback. */
export const PredictionInputSchema = z.object({
  county_pcode: z.string().min(1).max(16).regex(/^[A-Za-z0-9_-]+$/),
  start_year: z.number().int().min(1990).max(2100),
  start_month: z.number().int().min(1).max(12),
  population: z.number().int().min(1).max(50_000_000),
  previous_ipc_phase: z.number().int().min(1).max(5),
  phase3plus_pct: z.number().min(0).max(100),
  cereal_production_t: z.number().min(0).max(1e9),
  cereal_gap_t: z.number().min(-1e9).max(1e9),
});

export type AreaFeature = z.infer<typeof AreaFeatureSchema>;
export type AreaCollection = z.infer<typeof AreaCollectionSchema>;
export type RiskResponse = z.infer<typeof RiskResponseSchema>;
export type GeoMeta = z.infer<typeof GeoMetaSchema>;
export type CountyRecord = z.infer<typeof CountyRecordSchema>;
export type CountyDetail = z.infer<typeof CountyDetailSchema>;
export type CountiesResponse = z.infer<typeof CountiesResponseSchema>;
export type ModelInfo = z.infer<typeof ModelInfoSchema>;
export type PredictionInput = z.infer<typeof PredictionInputSchema>;
export type PredictionResponse = z.infer<typeof PredictionResponseSchema>;

export const toValues = (r: RiskResponse): Record<string, number> =>
  Object.fromEntries(r.items.map((i) => [i.pcode, i.probability]));

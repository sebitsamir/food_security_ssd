import 'server-only';
import { cache } from 'react';
import { type z } from 'zod';
import {
  AreaCollectionSchema,
  CountiesResponseSchema,
  CountyDetailSchema,
  GeoMetaSchema,
  ModelInfoSchema,
  PeriodsSchema,
  RiskResponseSchema,
  type AreaCollection,
  type CountiesResponse,
  type CountyDetail,
  type GeoMeta,
  type ModelInfo,
  type RiskResponse,
} from './schemas';

export const API_BASE = (process.env.API_URL ?? 'http://localhost:8000').replace(/\/$/, '');
const TIMEOUT_MS = 8_000;
/** Dev: always fresh after a geo rebuild. Prod: cache for a day. */
const GEO_REVALIDATE = process.env.NODE_ENV === 'production' ? 86_400 : 0;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>, revalidate: number): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      headers: { accept: 'application/json' },
      next: { revalidate },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new ApiError('The data service is unreachable.');
  }
  if (!res.ok) throw new ApiError(`The data service responded ${res.status}.`, res.status);
  const parsed = schema.safeParse(await res.json());
  if (!parsed.success) throw new ApiError('The data service returned unexpected data.');
  return parsed.data;
}

// React `cache` de-duplicates identical calls within one render (layout + page share one fetch).
export const getAreas = cache((level: 'states' | 'counties'): Promise<AreaCollection> =>
  request(`/api/v1/geo/${level}`, AreaCollectionSchema, GEO_REVALIDATE));
export const getGeoMeta = cache((): Promise<GeoMeta> =>
  request('/api/v1/geo/meta', GeoMetaSchema, GEO_REVALIDATE));
export const getPeriods = cache(() => request('/api/v1/forecasts/periods', PeriodsSchema, 60));
export const getRisk = cache((level: 'states' | 'counties', period: string): Promise<RiskResponse> =>
  request(`/api/v1/forecasts/${level}?period=${encodeURIComponent(period)}`, RiskResponseSchema, 60));
export const getCounties = cache((period?: string): Promise<CountiesResponse> =>
  request(`/api/v1/counties${period ? `?period=${encodeURIComponent(period)}` : ''}`, CountiesResponseSchema, 60));
export const getCounty = cache((pcode: string, period?: string): Promise<CountyDetail> =>
  request(
    `/api/v1/counties/${encodeURIComponent(pcode)}${period ? `?period=${encodeURIComponent(period)}` : ''}`,
    CountyDetailSchema,
    60,
  ));
export const getModel = cache((): Promise<ModelInfo> => request('/api/v1/model', ModelInfoSchema, 300));

/** Picks a valid requested period or falls back to the latest. */
export async function resolvePeriod(requested?: string): Promise<{ period: string | null; periods: string[] }> {
  const { latest, periods } = await getPeriods();
  return { period: requested && periods.includes(requested) ? requested : latest, periods };
}

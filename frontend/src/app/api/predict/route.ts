import { NextResponse } from 'next/server';
import { API_BASE } from '@/lib/api';
import { PredictionInputSchema, PredictionResponseSchema } from '@/lib/schemas';

/**
 * Same-origin proxy to the prediction API. The browser never learns the API address, input is
 * re-validated here, and the caller's IP is forwarded so the API's rate limit is per user.
 */
export const dynamic = 'force-dynamic';

const problem = (status: number, title: string, extra: Record<string, unknown> = {}, headers?: HeadersInit) =>
  NextResponse.json({ type: 'about:blank', title, status, ...extra }, { status, headers: { 'cache-control': 'no-store', ...headers } });

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return problem(400, 'Invalid JSON');
  }
  const input = PredictionInputSchema.safeParse(body);
  if (!input.success) {
    return problem(422, 'Invalid request', { errors: input.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })) });
  }

  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip');
  let upstream: Response;
  try {
    upstream = await fetch(`${API_BASE}/api/v1/predictions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', ...(forwarded ? { 'x-forwarded-for': forwarded } : {}) },
      body: JSON.stringify(input.data),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return problem(502, 'The prediction service is unreachable.');
  }

  if (!upstream.ok) {
    const retry = upstream.headers.get('retry-after');
    return problem(upstream.status, upstream.status === 429 ? 'Too many requests' : 'Prediction failed', {}, retry ? { 'retry-after': retry } : undefined);
  }
  const parsed = PredictionResponseSchema.safeParse(await upstream.json());
  if (!parsed.success) return problem(502, 'The prediction service returned unexpected data.');
  return NextResponse.json(parsed.data, { headers: { 'cache-control': 'no-store' } });
}

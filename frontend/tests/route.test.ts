// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/predict/route';
import { json, prediction } from './fixtures';

const fetchMock = vi.fn();
const valid = { county_pcode: 'S1A', start_year: 2026, start_month: 4, population: 420000, previous_ipc_phase: 3, phase3plus_pct: 60, cereal_production_t: 8765, cereal_gap_t: -23378 };
const call = (body: unknown, headers: Record<string, string> = {}) =>
  POST(new Request('http://localhost/api/predict', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers }));

beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock); });

describe('POST /api/predict (same-origin proxy)', () => {
  it('rejects bad JSON and invalid input without calling the API', async () => {
    expect((await call('{nope')).status).toBe(400);
    const r = await call({ ...valid, previous_ipc_phase: 9 });
    expect(r.status).toBe(422);
    expect((await r.json()).errors[0].field).toBe('previous_ipc_phase');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forwards validated input and the caller IP, and returns the contract', async () => {
    fetchMock.mockResolvedValue(json(prediction()));
    const r = await call({ ...valid, injected: 'x' }, { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' });
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect((await r.json()).risk_probability).toBe(0.874);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toMatch(/\/api\/v1\/predictions$/);
    expect(init.headers['x-forwarded-for']).toBe('203.0.113.9');
    expect(JSON.parse(init.body)).toEqual(valid); // unknown fields are stripped
  });

  it('preserves rate limiting and Retry-After', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 429, headers: { 'retry-after': '30' } }));
    const r = await call(valid);
    expect(r.status).toBe(429);
    expect(r.headers.get('retry-after')).toBe('30');
    expect((await r.json()).title).toBe('Too many requests');
  });

  it('does not leak upstream error bodies', async () => {
    fetchMock.mockResolvedValue(new Response('Traceback: secret', { status: 500 }));
    const r = await call(valid);
    expect(r.status).toBe(500);
    expect(JSON.stringify(await r.json())).not.toContain('secret');
  });

  it('answers 502 when the API is down or returns garbage', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    expect((await call(valid)).status).toBe(502);
    fetchMock.mockResolvedValueOnce(json({ nonsense: 1 }));
    expect((await call(valid)).status).toBe(502);
  });
});

'use client';

import { useMemo, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { Panel } from '@/components/ui/Panel';
import { ExportMenu } from '@/components/export/ExportMenu';
import { Gauge } from '@/components/charts/Gauge';
import { RiskBadge } from '@/components/risk/RiskBadge';
import { ProbabilityBar } from '@/components/risk/ProbabilityCell';
import { PhasePicker } from './PhasePicker';
import { RunHistory } from './RunHistory';
import { formFromCounty, parseForm, type FieldErrors, type FormState } from '@/lib/predictForm';
import { MONTHS } from '@/lib/format';
import { PHASES } from '@/lib/phases';
import { formatPct } from '@/lib/risk';
import { PredictionResponseSchema, type PredictionResponse } from '@/lib/schemas';
import { predictionCsv } from '@/lib/export/csv';
import { makePredictionPdf } from '@/lib/export/reports';
import { dayStamp, niceStamp } from '@/lib/export/download';
import type { PredictionRecord } from '@/lib/export/types';
import { slugify } from '@/lib/format';

type Status = { kind: 'idle' } | { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'done'; record: PredictionRecord; response: PredictionResponse };

async function requestPrediction(payload: unknown): Promise<PredictionResponse> {
  let res: Response;
  try {
    res = await fetch('/api/predict', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  } catch {
    throw new Error('Could not reach the server. Check your connection and try again.');
  }
  if (res.status === 429) throw new Error(`Too many requests. Please try again in ${res.headers.get('retry-after') ?? 'a few'} seconds.`);
  if (res.status === 503) throw new Error('The prediction service is not available right now.');
  if (!res.ok) throw new Error('The prediction could not be completed. Please check the inputs and try again.');
  const parsed = PredictionResponseSchema.safeParse(await res.json());
  if (!parsed.success) throw new Error('The service returned an unexpected response.');
  return parsed.data;
}

export function PredictWorkspace({ counties, period, initialCounty }: { counties: import('@/lib/predictForm').PredictCounty[]; period: string; initialCounty?: string }) {
  const byPcode = useMemo(() => new Map(counties.map((c) => [c.pcode, c])), [counties]);
  const first = byPcode.get(initialCounty ?? '') ?? counties[0];
  const [form, setForm] = useState<FormState | null>(first ? formFromCounty(first, period) : null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [runs, setRuns] = useState<PredictionRecord[]>([]);
  const resultRef = useRef<HTMLDivElement>(null);

  const states = useMemo(() => {
    const m = new Map<string, string>();
    counties.forEach((c) => m.set(c.state_pcode, c.state_name));
    return [...m].map(([pcode, name]) => ({ pcode, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [counties]);

  if (!form || !first) return <Panel><p className="text-tx2">No counties are available yet.</p></Panel>;
  const inState = counties.filter((c) => c.state_pcode === form.state).sort((a, b) => a.name.localeCompare(b.name));
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm({ ...form, [k]: v });
  const err = (k: keyof FieldErrors) => errors[k];
  const bad = (k: keyof FieldErrors) => (errors[k] ? true : undefined);

  const pick = (c: import('@/lib/predictForm').PredictCounty) => { setForm(formFromCounty(c, period)); setErrors({}); };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = parseForm(form);
    if (!parsed.ok) {
      setErrors(parsed.errors);
      const firstBad = (['population', 'year', 'pct', 'production', 'gap'] as const).find((k) => parsed.errors[k]);
      if (firstBad) document.getElementById(`f-${firstBad}`)?.focus();
      return;
    }
    setErrors({});
    setStatus({ kind: 'loading' });
    try {
      const response = await requestPrediction(parsed.payload);
      const now = new Date();
      const record: PredictionRecord = {
        id: response.prediction_id, modelVersion: response.model_version, at: now.toISOString(), time: niceStamp(now),
        county: response.county.name, countyPcode: response.county.pcode, state: response.county.state_name,
        year: parsed.payload.start_year, month: parsed.payload.start_month, population: parsed.payload.population,
        phase: parsed.payload.previous_ipc_phase, pct: parsed.payload.phase3plus_pct,
        production: parsed.payload.cereal_production_t, gap: parsed.payload.cereal_gap_t,
        p1: response.risk_probability, p2: response.sensitivity_probability, warnings: response.warnings.map((w) => w.message),
      };
      setStatus({ kind: 'done', record, response });
      setRuns((r) => [record, ...r].slice(0, 25));
      if (window.matchMedia('(max-width: 979px)').matches) requestAnimationFrame(() => resultRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
    } catch (error) {
      setStatus({ kind: 'error', message: error instanceof Error ? error.message : 'Something went wrong.' });
    }
  };

  const phaseName = PHASES.find((p) => p.n === form.phase)?.label ?? '';

  return (
    <div className="space-y-14 lg:space-y-16">
      <div className="grid gap-5 min-[980px]:grid-cols-2 min-[980px]:items-start min-[980px]:gap-7">
        <Panel>
          <form onSubmit={submit} noValidate aria-label="Scenario inputs" className="grid gap-[22px]">
            <div className="grid gap-4 min-[560px]:grid-cols-2">
              <Field label="State" htmlFor="f-state">
                <Select id="f-state" value={form.state} onChange={(e) => { const c = counties.filter((x) => x.state_pcode === e.target.value).sort((a, b) => a.name.localeCompare(b.name))[0]; if (c) pick(c); }}>
                  {states.map((s) => <option key={s.pcode} value={s.pcode}>{s.name}</option>)}
                </Select>
              </Field>
              <Field label="County" htmlFor="f-county">
                <Select id="f-county" value={form.county} onChange={(e) => { const c = byPcode.get(e.target.value); if (c) pick(c); }}>
                  {inState.map((c) => <option key={c.pcode} value={c.pcode}>{c.name}</option>)}
                </Select>
              </Field>
            </div>

            <div className="grid gap-4 border-t border-line pt-[22px]">
              <Field label="Population" htmlFor="f-population" error={err('population')}>
                <Input id="f-population" inputMode="numeric" autoComplete="off" value={form.population} onChange={(e) => set('population', e.target.value)} aria-invalid={bad('population')} aria-describedby={err('population') ? 'f-population-error' : undefined} />
              </Field>
              <div className="grid gap-4 min-[560px]:grid-cols-2">
                <Field label="Start year" htmlFor="f-year" error={err('year')}>
                  <Input id="f-year" inputMode="numeric" autoComplete="off" value={form.year} onChange={(e) => set('year', e.target.value)} aria-invalid={bad('year')} aria-describedby={err('year') ? 'f-year-error' : undefined} />
                </Field>
                <Field label="Start month" htmlFor="f-month">
                  <Select id="f-month" value={form.month} onChange={(e) => set('month', e.target.value)}>
                    {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                  </Select>
                </Field>
              </div>
            </div>

            <div className="grid gap-4 border-t border-line pt-[22px]">
              <div>
                <div id="phase-label" className="mb-[7px] text-[13px] font-medium text-tx2">Previous IPC phase <b className="ml-2 font-medium text-tx">{phaseName}</b></div>
                <PhasePicker value={form.phase} onChange={(n) => set('phase', n)} labelledBy="phase-label" />
              </div>
              <Field label="Phase 3+ share (%)" htmlFor="f-pct" error={err('pct')}>
                <div className="grid grid-cols-[92px_1fr] items-center gap-4">
                  <Input id="f-pct" inputMode="decimal" autoComplete="off" value={form.pct} onChange={(e) => set('pct', e.target.value)} aria-invalid={bad('pct')} aria-describedby={err('pct') ? 'f-pct-error' : undefined} />
                  <input type="range" min={0} max={100} step={1} aria-label="Phase 3+ share slider" value={Number.isFinite(Number(form.pct)) && form.pct !== '' ? Math.min(100, Math.max(0, Number(form.pct))) : 0} onChange={(e) => set('pct', e.target.value)} className="h-7 w-full accent-[var(--tx)]" />
                </div>
              </Field>
              <div className="grid gap-4 min-[560px]:grid-cols-2">
                <Field label="Cereal production (t)" htmlFor="f-production" error={err('production')}>
                  <Input id="f-production" inputMode="numeric" autoComplete="off" value={form.production} onChange={(e) => set('production', e.target.value)} aria-invalid={bad('production')} aria-describedby={err('production') ? 'f-production-error' : undefined} />
                </Field>
                <Field label="Cereal gap (t)" htmlFor="f-gap" error={err('gap')}>
                  <Input id="f-gap" inputMode="numeric" autoComplete="off" value={form.gap} onChange={(e) => set('gap', e.target.value)} aria-invalid={bad('gap')} aria-describedby={err('gap') ? 'f-gap-error' : undefined} />
                </Field>
              </div>
            </div>

            <Button type="submit" variant="primary" full disabled={status.kind === 'loading'}>
              {status.kind === 'loading' ? 'Running…' : 'Run prediction'}
            </Button>
          </form>
        </Panel>

        <div ref={resultRef} className="min-[980px]:sticky min-[980px]:top-24">
          <Panel aria-live="polite" aria-label="Prediction result" className="min-h-[440px] !pt-7 max-sm:min-h-0">
            <Result status={status} onRetry={() => setStatus({ kind: 'idle' })} />
          </Panel>
        </div>
      </div>

      <RunHistory runs={runs} onClear={() => setRuns([])} />
    </div>
  );
}

function Result({ status, onRetry }: { status: Status; onRetry: () => void }) {
  if (status.kind === 'loading') {
    const bar = 'animate-[shimmer_1.3s_linear_infinite] rounded-[10px] bg-[linear-gradient(90deg,var(--elev),var(--line),var(--elev))] bg-[length:200%_100%]';
    return (
      <div aria-busy="true" className="space-y-6">
        <div className={`h-7 w-[45%] ${bar}`} /><div className={`h-[150px] ${bar}`} /><div className={`h-3.5 ${bar}`} /><div className={`h-3.5 ${bar}`} />
      </div>
    );
  }
  if (status.kind === 'error') {
    return (
      <div role="alert" className="flex min-h-[340px] flex-col items-center justify-center gap-4 text-center">
        <p className="max-w-[34ch] text-tx2">{status.message}</p>
        <Button size="sm" onClick={onRetry}>Dismiss</Button>
      </div>
    );
  }
  if (status.kind === 'idle') {
    return (
      <div className="flex min-h-[380px] flex-col items-center justify-center gap-2 text-center">
        <Gauge value={null} />
        <p className="mt-2 text-tx2">Run a prediction to see the result.</p>
      </div>
    );
  }
  const { record: r, response } = status;
  const stem = `prediction-${slugify(r.county)}-${dayStamp()}`;
  return (
    <div>
      <div className="flex min-h-[30px] flex-wrap items-center justify-between gap-3">
        <span className="min-w-0 font-medium">{r.county}, {r.state}</span>
        <ExportMenu actions={[
          { kind: 'PDF', title: 'PDF report', description: 'Formatted one-page summary', filename: `${stem}.pdf`, build: () => makePredictionPdf(r) },
          { kind: 'CSV', title: 'CSV data', description: 'This prediction, spreadsheet-ready', filename: `${stem}.csv`, build: () => predictionCsv([r]) },
        ]} />
      </div>
      <Gauge value={r.p1} />
      <div className="mt-4 flex justify-center"><RiskBadge probability={r.p1} /></div>

      <div className="mt-[26px] grid gap-3.5 border-t border-line pt-[22px]">
        {[['C = 1.0', 'Production', r.p1], ['C = 100', 'Sensitivity', r.p2]].map(([name, role, p]) => (
          <div key={String(name)} className="grid grid-cols-[128px_minmax(0,1fr)_54px] items-center gap-3.5 text-sm max-[420px]:grid-cols-[84px_minmax(0,1fr)_50px]">
            <span className="whitespace-nowrap">{name}<small className="ml-2 text-[12.5px] text-tx3 max-[420px]:hidden">{role}</small></span>
            <ProbabilityBar probability={p as number} />
            <span className="text-right font-medium tabular-nums">{formatPct(p as number)}</span>
          </div>
        ))}
        <p className="text-[13px] text-tx2">Spread {(response.model_spread * 100).toFixed(1)} percentage points</p>
      </div>

      {response.warnings.map((w) => (
        <div key={w.code} role="status" className="mt-[18px] flex gap-3 rounded-xl border border-[#D6A83A]/55 bg-[#D6A83A]/10 px-3.5 py-3 text-sm">
          <svg viewBox="0 0 24 24" aria-hidden="true" className="mt-px size-5 flex-none fill-none stroke-[#D6A83A]" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 2 20h20z" /><path d="M12 10v4M12 17v.01" /></svg>
          <div>{w.message}</div>
        </div>
      ))}
      <p className="mt-[22px] text-center text-[13px] text-tx3">A model probability, not an official IPC classification.</p>
    </div>
  );
}

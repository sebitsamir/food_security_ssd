import Link from 'next/link';
import { StateExplorer } from '@/components/map/StateExplorer';
import { PeriodSelect } from '@/components/layout/PeriodSelect';
import { FoldChart } from '@/components/charts/FoldChart';
import { ButtonLink } from '@/components/ui/Button';
import { StatStrip } from '@/components/ui/StatStrip';
import { getAreas, getCounties, getModel, getRisk, resolvePeriod } from '@/lib/api';
import { bandFor, formatPct } from '@/lib/risk';
import { shortName, titleCase } from '@/lib/format';
import { toValues } from '@/lib/schemas';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ period?: string }> };

export default async function Overview({ searchParams }: Props) {
  const { period: requested } = await searchParams;
  const { period, periods } = await resolvePeriod(requested);
  if (!period) {
    const [states, counties, model] = await Promise.all([
      getAreas('states'), getAreas('counties'), getModel(),
    ]);
    return (
      <div className="space-y-14 lg:space-y-16">
        <section className="max-w-3xl py-8 lg:py-14">
          <p className="mb-4 text-xs font-medium uppercase tracking-[0.16em] text-tx3">Food security intelligence</p>
          <h1 className="max-w-[13ch] text-[clamp(2.4rem,5vw,4.25rem)] font-light leading-none tracking-[-0.045em]">
            South Sudan food security intelligence
          </h1>
          <p className="mt-5 max-w-[54ch] text-[clamp(1rem,1.6vw,1.2rem)] leading-[1.5] text-tx2">
            Geographic coverage and model information are available, but no forecast periods have been published yet. Current county risk estimates are therefore not displayed.
          </p>
          <div className="mt-7 flex flex-wrap gap-2.5">
            <ButtonLink href="/predict" variant="primary">Predict a scenario</ButtonLink>
            <ButtonLink href="/model">Review the model</ButtonLink>
          </div>
        </section>
        <StatStrip
          label="Available geography and model information"
          items={[
            { label: 'Geographic states', value: String(states.features.length) },
            { label: 'Geographic counties', value: String(counties.features.length) },
            { label: 'Training periods', value: String(model.training_periods) },
            { label: 'Training counties', value: String(model.training_counties) },
          ]}
        />
        <section className="max-w-3xl border-t border-line pt-6">
          <h2 className="text-lg font-medium">Why are risk estimates missing?</h2>
          <p className="mt-2 text-sm leading-6 text-tx2">
            The service has not published forecast records for a period. The map and risk rankings will appear when valid forecast outputs are available; no historical observations or risk values are fabricated to fill this gap.
          </p>
        </section>
      </div>
    );
  }

  const [states, stateRisk, counties, model] = await Promise.all([
    getAreas('states'), getRisk('states', period), getCounties(period), getModel(),
  ]);
  const values = toValues(stateRisk);
  const ranked = [...states.features]
    .map((f) => ({ pcode: f.properties.pcode, name: f.properties.name, p: values[f.properties.pcode] }))
    .filter((r): r is { pcode: string; name: string; p: number } => r.p !== undefined)
    .sort((a, b) => b.p - a.p);

  return (
    <div className="space-y-14 lg:space-y-16">
      <StateExplorer
        layout="hero"
        states={states}
        stateRisk={values}
        counties={counties.items}
        intro={
          <>
            <h1 tabIndex={-1} className="max-w-[11ch] text-[clamp(2.4rem,5vw,4.25rem)] font-light leading-none tracking-[-0.045em] outline-none">
              South Sudan food security intelligence
            </h1>
            <p className="mt-[18px] max-w-[30ch] text-[clamp(1rem,1.6vw,1.2rem)] leading-[1.45] text-tx2">
              County-level risk of Crisis-or-worse food insecurity.
            </p>
            <div className="mt-7 flex flex-wrap gap-2.5">
              <ButtonLink href="/forecasts" variant="primary">Explore forecasts</ButtonLink>
              <ButtonLink href="/predict">Predict a scenario</ButtonLink>
            </div>
          </>
        }
      />

      <StatStrip
        label="Dataset and validation snapshot"
        items={[
          { label: 'Counties', value: String(model.training_counties) },
          { label: 'Historical periods', value: String(model.training_periods) },
          { label: 'Temporal validation', value: titleCase(model.validation_strategy) },
          { label: 'Metric', value: model.metric.toUpperCase().replace('_', '-') },
        ]}
      />

      <section className="grid gap-10 min-[1000px]:grid-cols-[1.1fr_1fr] min-[1000px]:gap-14">
        <div>
          <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-[clamp(1.2rem,2vw,1.45rem)] font-medium tracking-[-0.02em]">States by modeled risk</h2>
            <PeriodSelect periods={periods} value={period} />
          </div>
          <ul>
            {ranked.map((r) => {
              const band = bandFor(r.p);
              return (
                <li key={r.pcode} className="border-t border-line first:border-t-0">
                  <Link href={`/forecasts?state=${r.pcode}`} className="grid grid-cols-[104px_minmax(0,1fr)_48px] items-center gap-3.5 py-[11px] text-[13px] hover:[&_i]:brightness-110 min-[520px]:grid-cols-[132px_minmax(0,1fr)_54px] min-[520px]:text-sm">
                    <span>{shortName(r.name)}</span>
                    <span aria-hidden="true" className="h-2 overflow-hidden rounded bg-elev"><i className="block h-full rounded" style={{ width: `${r.p * 100}%`, background: band?.color }} /></span>
                    <span className="text-right font-medium tabular-nums">{formatPct(r.p, 0)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
        <div>
          <h2 className="mb-3.5 text-[clamp(1.2rem,2vw,1.45rem)] font-medium tracking-[-0.02em]">Validation</h2>
          <p className="text-[clamp(2.5rem,5vw,3.5rem)] font-light leading-none tracking-[-0.04em] tabular-nums">{model.production.mean.toFixed(3)}</p>
          <p className="mb-2.5 mt-1.5 text-[13px] text-tx2">Mean ROC-AUC across {model.folds.length} folds</p>
          <FoldChart folds={model.folds} compact />
          <p className="mt-3"><Link href="/model" className="text-info hover:underline">See the full model report</Link></p>
        </div>
      </section>
    </div>
  );
}

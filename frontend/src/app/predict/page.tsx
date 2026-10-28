import type { Metadata } from 'next';
import { PredictWorkspace } from '@/components/predict/PredictWorkspace';
import { PageHeader } from '@/components/ui/PageHeader';
import { getAreas, getCounties, resolvePeriod } from '@/lib/api';
import type { PredictCounty } from '@/lib/predictForm';

export const metadata: Metadata = { title: 'Predict a scenario' };
export const dynamic = 'force-dynamic';

export default async function PredictPage({ searchParams }: { searchParams: Promise<{ county?: string }> }) {
  const { county } = await searchParams;
  const { period: latestPeriod } = await resolvePeriod();
  let items: PredictCounty[];
  let period: string;

  if (latestPeriod) {
    const response = await getCounties(latestPeriod);
    items = response.items;
    period = response.period;
  } else {
    const [countyAreas, stateAreas] = await Promise.all([
      getAreas('counties'), getAreas('states'),
    ]);
    const stateNames = new Map(stateAreas.features.map((f) => [f.properties.pcode, f.properties.name]));
    items = countyAreas.features.map((f) => {
      const statePcode = f.properties.parent ?? '';
      return {
        pcode: f.properties.pcode,
        name: f.properties.name,
        state_pcode: statePcode,
        state_name: stateNames.get(statePcode) ?? 'State unavailable',
        facts: null,
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
    period = new Date().toISOString().slice(0, 7);
  }

  return (
    <div className="space-y-7">
      <PageHeader title="Predict a scenario" />
      {!latestPeriod && (
        <p role="status" className="max-w-3xl border-l-2 border-line pl-4 text-sm leading-6 text-tx2">
          No forecast periods have been published. Choose a county and enter the required numeric inputs yourself; no county observations are available for autofill. The phase control starts at phase 3 as a form default, so confirm or change it before running a prediction.
        </p>
      )}
      {items.length ? <PredictWorkspace counties={items} period={period} initialCounty={county} /> : <p className="text-sm text-tx2">No county geography is available from the data service.</p>}
    </div>
  );
}

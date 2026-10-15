import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ForecastsView } from '@/components/forecasts/ForecastsView';
import { EmptyState } from '@/components/ui/EmptyState';
import { getAreas, getCounties, getRisk, resolvePeriod } from '@/lib/api';
import { toValues } from '@/lib/schemas';

export const metadata: Metadata = { title: 'Forecasts' };
export const dynamic = 'force-dynamic';

export default async function ForecastsPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const { period: requested } = await searchParams;
  const { period, periods } = await resolvePeriod(requested);
  if (!period) return <EmptyState title="No forecasts yet" />;
  const [counties, states, stateRisk] = await Promise.all([getCounties(period), getAreas('states'), getRisk('states', period)]);
  return (
    // useSearchParams (inside the view) needs a Suspense boundary.
    <Suspense fallback={null}>
      <ForecastsView rows={counties.items} period={period} periods={periods} modelVersion={counties.model_version} states={states} stateRisk={toValues(stateRisk)} />
    </Suspense>
  );
}

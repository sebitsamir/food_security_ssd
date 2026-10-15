import type { Metadata } from 'next';
import { PredictWorkspace } from '@/components/predict/PredictWorkspace';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { getCounties } from '@/lib/api';

export const metadata: Metadata = { title: 'Predict a scenario' };
export const dynamic = 'force-dynamic';

export default async function PredictPage({ searchParams }: { searchParams: Promise<{ county?: string }> }) {
  const { county } = await searchParams;
  const { items, period } = await getCounties();
  return (
    <div className="space-y-7">
      <PageHeader title="Predict a scenario" />
      {items.length ? <PredictWorkspace counties={items} period={period} initialCounty={county} /> : <EmptyState title="No counties available" />}
    </div>
  );
}

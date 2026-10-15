import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { CountiesShell } from '@/components/counties/CountiesShell';
import { PageHeader } from '@/components/ui/PageHeader';
import { getCounties } from '@/lib/api';

export const metadata: Metadata = { title: 'Counties' };
export const dynamic = 'force-dynamic';

export default async function CountiesLayout({ children }: { children: ReactNode }) {
  const { items } = await getCounties();
  return (
    <div className="space-y-7">
      <PageHeader title="Counties" />
      <CountiesShell counties={items}>{children}</CountiesShell>
    </div>
  );
}

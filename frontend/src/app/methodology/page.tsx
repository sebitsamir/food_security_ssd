import type { Metadata } from 'next';
import { Accordion } from '@/components/ui/Accordion';
import { PageHeader } from '@/components/ui/PageHeader';
import { METHODOLOGY } from '@/content/methodology';

export const metadata: Metadata = { title: 'Methodology' };

export default function MethodologyPage() {
  return (
    <div className="space-y-7">
      <PageHeader title="Methodology" />
      <Accordion items={METHODOLOGY.map((m) => ({ title: m.title, body: <p>{m.body}</p> }))} />
    </div>
  );
}

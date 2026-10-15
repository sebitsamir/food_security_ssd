import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CountyProfile } from '@/components/counties/CountyProfile';
import { ApiError, getCounties, getCounty } from '@/lib/api';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ pcode: string }> };

const load = async (pcode: string) => {
  try {
    return await getCounty(pcode);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 422)) notFound();
    throw e;
  }
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { pcode } = await params;
  try {
    return { title: (await getCounty(pcode)).name };
  } catch {
    return { title: 'County' };
  }
}

export default async function CountyPage({ params }: Props) {
  const { pcode } = await params;
  const detail = await load(pcode);
  const all = await getCounties(detail.period);
  return <CountyProfile detail={detail} peers={all.items.filter((c) => c.state_pcode === detail.state_pcode)} total={all.items.length} />;
}

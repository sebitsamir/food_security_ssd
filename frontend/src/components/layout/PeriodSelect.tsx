'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Select } from '@/components/ui/Field';
import { formatPeriod } from '@/lib/format';

/** Keeps other query parameters (filters) intact when the period changes. */
export function PeriodSelect({ periods, value }: { periods: string[]; value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  return (
    <label className="inline-flex items-center gap-3 text-sm text-tx2">
      Period
      <Select
        value={value}
        disabled={pending}
        aria-busy={pending}
        className="h-11 min-w-[140px] py-0"
        onChange={(e) => {
          const qs = new URLSearchParams(window.location.search);
          qs.set('period', e.target.value);
          start(() => router.push(`${pathname}?${qs.toString()}`));
        }}
      >
        {periods.map((p) => <option key={p} value={p}>{formatPeriod(p)}</option>)}
      </Select>
    </label>
  );
}

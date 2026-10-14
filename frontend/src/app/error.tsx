'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/Button';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="grid min-h-[50dvh] place-items-center">
      <div role="alert" className="max-w-xl rounded-[22px] border border-line bg-surface p-8">
        <h1 tabIndex={-1} className="text-2xl font-medium tracking-tight outline-none">We couldn&apos;t load this page</h1>
        <p className="mt-2 text-tx2">The data service did not respond as expected. Please try again in a moment.</p>
        {error.digest && <p className="mt-3 text-xs text-tx3">Reference: {error.digest}</p>}
        <Button variant="primary" className="mt-6" onClick={reset}>Try again</Button>
      </div>
    </div>
  );
}

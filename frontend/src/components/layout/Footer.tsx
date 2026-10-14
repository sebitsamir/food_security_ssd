import type { GeoMeta } from '@/lib/schemas';

export function Footer({ meta }: { meta: GeoMeta | null }) {
  return (
    <footer className="mx-auto flex max-w-[1360px] flex-wrap justify-between gap-x-6 gap-y-1.5 border-t border-line px-[max(1.25rem,env(safe-area-inset-left))] pb-[max(1.75rem,env(safe-area-inset-bottom))] pt-[22px] text-[13px] text-tx3 lg:px-8">
      <span>Model probabilities are not official IPC classifications.</span>
      <span>{meta?.attribution ?? ''}</span>
    </footer>
  );
}

import { BRAND_PATH, BRAND_VIEWBOX } from '@/lib/brand';

export function BrandMark({ className = 'size-7' }: { className?: string }) {
  return (
    <svg viewBox={`0 0 ${BRAND_VIEWBOX.width} ${BRAND_VIEWBOX.height}`} aria-hidden="true" className={`${className} flex-none fill-tx`}>
      <path d={BRAND_PATH} />
    </svg>
  );
}

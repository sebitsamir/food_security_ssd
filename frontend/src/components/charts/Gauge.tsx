'use client';

import { useEffect, useRef, useState } from 'react';
import { BANDS, formatPct } from '@/lib/risk';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';

const CX = 160, CY = 160, R = 132, GAP = 1.6;
const angle = (v: number) => 180 - 180 * v;
const point = (a: number): [number, number] => [CX + R * Math.cos((a * Math.PI) / 180), CY - R * Math.sin((a * Math.PI) / 180)];
const arc = (a0: number, a1: number): string => {
  const [x0, y0] = point(a0);
  const [x1, y1] = point(a1);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${R} ${R} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
};

/** Semicircular probability gauge that animates to its value. `value: null` shows the empty state. */
export function Gauge({ value, caption = 'Risk probability' }: { value: number | null; caption?: string }) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(reduced || value === null ? (value ?? 0) : 0);
  const frame = useRef(0);

  useEffect(() => {
    cancelAnimationFrame(frame.current);
    if (value === null) { setShown(0); return; }
    if (reduced) { setShown(value); return; }
    const t0 = performance.now();
    const from = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / 950);
      setShown(from + (value - from) * (1 - Math.pow(1 - k, 3)));
      if (k < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [value, reduced]);

  const marker = point(angle(shown));
  return (
    <div
      className="relative mx-auto mt-2 w-full max-w-[360px]"
      role="img"
      aria-label={value === null ? 'No prediction yet' : `${caption} ${formatPct(value)}`}
    >
      <svg viewBox="0 0 320 192" aria-hidden="true" className="block h-auto w-full overflow-visible">
        {BANDS.map((b, i) => {
          const lo = i ? BANDS[i - 1]!.max : 0;
          const hi = Math.min(b.max, 1);
          const start = angle(lo) - (i ? GAP : 0);
          const end = (hi: number) => angle(hi) + (hi < 1 ? GAP : 0);
          return (
            <g key={b.key}>
              <path d={arc(start, end(hi))} fill="none" stroke={b.color} strokeOpacity={0.2} strokeWidth={14} />
              {value !== null && shown > lo + 0.001 && (
                <path d={arc(start, end(Math.min(shown, hi)))} fill="none" stroke={b.color} strokeWidth={14} />
              )}
            </g>
          );
        })}
        {value !== null && <circle cx={marker[0]} cy={marker[1]} r={11} strokeWidth={3.5} className="fill-surface stroke-tx" />}
        <text x={CX - R} y={186} textAnchor="middle" className="fill-tx3 text-[11px]">0</text>
        <text x={CX + R} y={186} textAnchor="middle" className="fill-tx3 text-[11px]">100%</text>
      </svg>
      <div className="absolute inset-x-0 bottom-1.5 text-center">
        <b className={`block text-[clamp(3.1rem,7vw,4rem)] font-light leading-none tracking-[-0.05em] tabular-nums ${value === null ? 'text-tx3' : ''}`}>
          {value === null ? '–' : formatPct(shown)}
        </b>
        <span className="text-[13px] text-tx2">{caption}</span>
      </div>
    </div>
  );
}

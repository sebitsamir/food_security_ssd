'use client';

import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { useElementWidth } from '@/lib/hooks/useElementWidth';

type Props = {
  values: number[];
  labels: string[];
  ariaLabel: string;
  /** Called with the hovered/tapped index; resets to the last point on leave. */
  onActiveChange?: (index: number) => void;
};

const L = 40, R = 12, T = 12, B = 32;

/** Interactive 0–100% line chart. Width follows its container for crisp text at any size. */
export function LineChart({ values, labels, ariaLabel, onActiveChange }: Props) {
  const [ref, measured] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const W = Math.max(measured, 240);
  const H = Math.round(Math.min(260, Math.max(190, W * 0.4)));
  const pw = W - L - R, ph = H - T - B, n = values.length;
  const x = (i: number) => L + (pw * i) / Math.max(1, n - 1);
  const y = (v: number) => T + ph * (1 - v / 100);
  const active = hover ?? n - 1;

  useEffect(() => { onActiveChange?.(active); }, [active, onActiveChange]);

  if (n < 2) return <div ref={ref} className="min-h-[190px] text-sm text-tx2">Not enough history to chart.</div>;

  const pts = values.map((v, i) => `${x(i).toFixed(1)} ${y(v).toFixed(1)}`);
  const step = W < 520 ? 3 : 1;
  const move = (e: PointerEvent) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || !rect.width) return;
    const px = ((e.clientX - rect.left) * W) / rect.width;
    setHover(Math.max(0, Math.min(n - 1, Math.round(((px - L) / pw) * (n - 1)))));
  };

  return (
    <div ref={ref} className="min-h-[190px] w-full">
      {measured > 0 && (
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={ariaLabel} className="block h-auto w-full touch-pan-y overflow-visible">
          {[0, 25, 50, 75, 100].map((v) => (
            <g key={v}>
              <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="stroke-line" />
              <text x={L - 8} y={y(v) + 4} textAnchor="end" className="fill-tx3 text-xs">{v}%</text>
            </g>
          ))}
          <path d={`M${x(0)} ${y(0)}L${pts.join('L')}L${x(n - 1)} ${y(0)}Z`} className="fill-info" fillOpacity={0.12} />
          <path d={`M${pts.join('L')}`} fill="none" className="stroke-info" strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" />
          {values.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r={3} strokeWidth={2} className="fill-surface stroke-info" />)}
          {labels.map((lb, i) =>
            i % step === 0 || i === n - 1 ? (
              <text key={lb + i} x={x(i)} y={H - 8} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} className="fill-tx3 text-xs">{lb}</text>
            ) : null,
          )}
          {hover !== null && <line x1={x(active)} x2={x(active)} y1={T} y2={T + ph} strokeDasharray="3 3" className="stroke-tx3" />}
          <circle cx={x(active)} cy={y(values[active] ?? 0)} r={6} strokeWidth={2.5} className="fill-tx stroke-info" />
          <rect x={L - 10} y={0} width={pw + 20} height={H} fill="transparent" onPointerMove={move} onPointerDown={move} onPointerLeave={() => setHover(null)} />
        </svg>
      )}
    </div>
  );
}

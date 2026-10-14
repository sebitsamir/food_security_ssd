'use client';

import { useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { BANDS, bandFor, formatPct } from '@/lib/risk';
import { shortName } from '@/lib/format';
import { buildMapModel, nextByDirection, VIEW, type Direction } from '@/lib/geo/projection';
import type { AreaCollection } from '@/lib/schemas';
import { cx } from '@/lib/cx';

type Props = {
  /** States, or one state's counties. Each feature needs properties.pcode (the join key). */
  areas: AreaCollection;
  /** pcode -> probability (0..1). Missing or invalid pcodes render as "no data". */
  values: Record<string, number>;
  selected?: string | null;
  onSelect?: (pcode: string) => void;
  /** 'none' for dense county views; a side panel carries names there. */
  labels?: 'name-value' | 'value' | 'none';
  ariaLabel?: string;
  className?: string;
};

const ARROWS: Record<string, Direction> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };

export function SouthSudanMap({
  areas, values, selected = null, onSelect, labels = 'name-value',
  ariaLabel = 'Map of South Sudan coloured by modeled risk', className,
}: Props) {
  const uid = useId().replace(/:/g, '');
  const box = useRef<HTMLDivElement>(null);
  const nodes = useRef(new Map<string, SVGGElement>());
  const [tip, setTip] = useState<{ x: number; y: number; id: string } | null>(null);
  const [active, setActive] = useState<string | null>(null);

  const { shapes, grid } = useMemo(() => buildMapModel(areas), [areas]);
  const byId = useMemo(() => new Map(shapes.map((s) => [s.id, s])), [shapes]);
  // The selected shape is drawn last so its outline sits above its neighbours.
  const ordered = useMemo(() => [...shapes].sort((a, b) => Number(a.id === selected) - Number(b.id === selected)), [shapes, selected]);
  // Roving tabindex: the whole map is one tab stop; arrow keys move within it.
  const tabStop = byId.has(active ?? '') ? active : byId.has(selected ?? '') ? selected : shapes[0]?.id;

  const onKey = (e: KeyboardEvent, id: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect?.(id);
      return;
    }
    const dir = ARROWS[e.key];
    if (!dir) return;
    e.preventDefault();
    const next = nextByDirection(shapes, id, dir);
    if (next) {
      setActive(next);
      nodes.current.get(next)?.focus();
    }
  };
  const onMove = (e: PointerEvent, id: string) => {
    if (e.pointerType !== 'mouse') return; // no sticky tooltips on touch
    const r = box.current?.getBoundingClientRect();
    if (r) setTip({ id, x: e.clientX - r.left, y: e.clientY - r.top });
  };

  const hovered = tip ? byId.get(tip.id) : undefined;
  const hv = hovered ? values[hovered.id] : undefined;

  return (
    <div ref={box} className={cx('relative overflow-hidden rounded-[20px] border border-line bg-surface shadow-[var(--sh)] sm:rounded-[26px]', className)}>
      <svg
        viewBox={`0 0 ${VIEW.width} ${VIEW.height}`}
        className="block h-auto w-full overflow-visible motion-safe:animate-[map-in_450ms_ease-out]"
        role="group"
        aria-label={ariaLabel}
      >
        <defs>
          <pattern id={`${uid}-hatch`} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="7" stroke="#08111A" strokeOpacity=".42" strokeWidth="2.4" />
          </pattern>
          <pattern id={`${uid}-dots`} width="8" height="8" patternUnits="userSpaceOnUse">
            <circle cx="4" cy="4" r="1.4" fill="#08111A" fillOpacity=".42" />
          </pattern>
        </defs>
        <path d={grid} fill="none" className="stroke-line" strokeWidth={1} opacity={0.7} />

        {ordered.map((s) => {
          const p = values[s.id];
          const band = bandFor(p);
          const isSel = s.id === selected;
          const label = band ? `${s.name}, ${formatPct(p as number)}, ${band.label} modeled risk` : `${s.name}, no data`;
          return (
            <g
              key={s.id}
              ref={(el) => { if (el) nodes.current.set(s.id, el); else nodes.current.delete(s.id); }}
              role="button"
              tabIndex={s.id === tabStop ? 0 : -1}
              aria-label={label}
              aria-pressed={isSel}
              data-testid={`area-${s.id}`}
              className="cursor-pointer outline-none [&:focus-visible_.edge]:stroke-info [&:focus-visible_.edge]:[stroke-width:4px]"
              onClick={() => { setActive(s.id); onSelect?.(s.id); }}
              onFocus={() => setActive(s.id)}
              onKeyDown={(e) => onKey(e, s.id)}
              onPointerMove={(e) => onMove(e, s.id)}
              onPointerLeave={() => setTip(null)}
            >
              <path
                d={s.d}
                fill={band ? band.color : 'var(--elev)'}
                fillOpacity={selected && !isSel ? 0.8 : 0.94}
                className="stroke-surface transition-[fill-opacity] hover:brightness-110"
                strokeWidth={2.4}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
              {band?.pattern && <path d={s.d} fill={`url(#${uid}-${band.pattern})`} pointerEvents="none" />}
              <path
                d={s.d}
                fill="none"
                className={cx('edge', isSel ? 'stroke-tx' : 'stroke-transparent')}
                strokeWidth={isSel ? 3 : 0}
                strokeLinejoin="round"
                pointerEvents="none"
                vectorEffect="non-scaling-stroke"
              />
              {labels !== 'none' && band && (
                <g pointerEvents="none" textAnchor="middle" fill="#fff" stroke="rgba(8,17,26,.7)" strokeLinejoin="round" style={{ paintOrder: 'stroke' }}>
                  {labels === 'name-value' && (
                    <text x={s.cx} y={s.cy - 7} fontSize={11.5} fontWeight={500} strokeWidth={3.5} className="max-sm:hidden">{shortName(s.name)}</text>
                  )}
                  <text x={s.cx} y={s.cy + 14} fontSize={18} fontWeight={600} strokeWidth={4} className="max-sm:text-[26px]">{Math.round((p as number) * 100)}%</text>
                </g>
              )}
            </g>
          );
        })}
      </svg>

      <ul aria-label="Legend" className="absolute left-4 top-4 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-tx2 max-sm:static max-sm:border-t max-sm:border-line max-sm:p-4">
        {BANDS.map((b) => (
          <li key={b.key} className="inline-flex items-center gap-2 whitespace-nowrap">
            <svg viewBox="0 0 14 14" aria-hidden="true" className="size-3.5 rounded-[4px]">
              <rect width="14" height="14" fill={b.color} />
              {b.pattern && <rect width="14" height="14" fill={`url(#${uid}-${b.pattern})`} />}
            </svg>
            {b.label} {b.range}
          </li>
        ))}
      </ul>

      {hovered && tip && (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-10 whitespace-nowrap rounded-xl border border-line bg-elev px-3 py-2 text-[13px] shadow-xl"
          style={{ left: Math.max(8, Math.min(tip.x + 14, (box.current?.clientWidth ?? 0) - 200)), top: tip.y + 16 }}
        >
          <b className="block font-semibold">{hovered.name}</b>
          {bandFor(hv) ? `${formatPct(hv as number)} · ${bandFor(hv)?.label}` : 'No data'}
        </div>
      )}

      {/* Screen-reader alternative to the map */}
      <table className="sr-only">
        <caption>Modeled risk by area</caption>
        <thead><tr><th>Area</th><th>Probability</th><th>Band</th></tr></thead>
        <tbody>
          {shapes.map((s) => {
            const v = values[s.id];
            const b = bandFor(v);
            return (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td>{b ? formatPct(v as number) : 'No data'}</td>
                <td>{b?.label ?? ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

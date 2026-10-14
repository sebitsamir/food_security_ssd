import { geoGraticule, geoMercator, geoPath } from 'd3-geo';
import type { AreaCollection, AreaFeature } from '../schemas';

export const VIEW = { width: 800, height: 585, pad: 24 } as const;

export type Shape = { id: string; name: string; d: string; cx: number; cy: number };
export type MapModel = { shapes: Shape[]; grid: string };

type Ring = number[][];

/** Signed planar area. Positive = counter-clockwise (lon east, lat north). */
function signedArea(ring: Ring): number {
  let sum = 0;
  let prev = ring[0];
  for (const cur of ring.slice(1)) {
    if (prev) sum += (prev[0] ?? 0) * (cur[1] ?? 0) - (cur[0] ?? 0) * (prev[1] ?? 0);
    prev = cur;
  }
  return sum / 2;
}

const orient = (ring: Ring, clockwise: boolean): Ring => (signedArea(ring) < 0 === clockwise ? ring : [...ring].reverse());

/**
 * d3-geo treats the *opposite* winding to RFC 7946 as "the whole sphere minus this polygon",
 * which renders as an empty or inverted map. Real boundary files arrive in either winding,
 * so we normalise instead of trusting the source. d3 wants clockwise exteriors, counter-clockwise holes.
 */
export function rewindForD3(feature: AreaFeature): AreaFeature {
  const g = feature.geometry;
  const fix = (rings: Ring[]): Ring[] => rings.map((r, i) => orient(r, i === 0));
  return {
    ...feature,
    geometry:
      g.type === 'Polygon'
        ? { type: 'Polygon', coordinates: fix(g.coordinates) }
        : { type: 'MultiPolygon', coordinates: g.coordinates.map(fix) },
  };
}

/** Fits the given areas to the viewport. Pure and deterministic, so it is cheap to test. */
export function buildMapModel(input: AreaCollection, view = VIEW): MapModel {
  const { width, height, pad } = view;
  const areas = { ...input, features: input.features.map(rewindForD3) };
  const projection = geoMercator().fitExtent(
    [[pad, pad], [width - pad, height - pad]],
    areas as Parameters<typeof projection.fitExtent>[1],
  );
  const path = geoPath(projection);
  const shapes: Shape[] = [];
  for (const f of areas.features) {
    const d = path(f as Parameters<typeof path>[0]);
    const [cx, cy] = path.centroid(f as Parameters<typeof path.centroid>[0]);
    if (!d || !Number.isFinite(cx) || !Number.isFinite(cy)) continue; // skip degenerate shapes
    shapes.push({ id: f.properties.pcode, name: f.properties.name, d, cx, cy });
  }
  const grid = path(geoGraticule().step([2, 2]).extent([[22, 2], [38, 14]])()) ?? '';
  return { shapes, grid };
}

export type Direction = 'left' | 'right' | 'up' | 'down';

/** Arrow-key navigation: the nearest shape in the pressed direction, preferring straight lines. */
export function nextByDirection(shapes: readonly Shape[], fromId: string, dir: Direction): string | null {
  const from = shapes.find((s) => s.id === fromId);
  if (!from) return null;
  let best: { id: string; score: number } | null = null;
  for (const s of shapes) {
    if (s.id === fromId) continue;
    const dx = s.cx - from.cx;
    const dy = s.cy - from.cy;
    const along = dir === 'right' ? dx : dir === 'left' ? -dx : dir === 'down' ? dy : -dy;
    const across = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
    if (along <= 1) continue;
    const score = along + across * 2;
    if (!best || score < best.score) best = { id: s.id, score };
  }
  return best?.id ?? null;
}

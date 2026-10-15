import { BANDS, bandFor, formatPct } from '../risk';
import { MONTHS, formatInt } from '../format';
import { brandPoints } from '../brand';
import { phaseLabel } from '../phases';
import { INK, LINE, MUTED, PdfDoc, SOFT, WHITE, type RGB } from './pdfDoc';
import { niceStamp } from './download';
import type { PredictionRecord } from './types';

const hex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as unknown as RGB;
const LEFT = 48;
const RIGHT = 547;
const CONTENT = RIGHT - LEFT;
export const DISCLAIMER =
  'This is a model probability produced by a statistical model trained on a limited historical dataset. It is not an official IPC classification and should support, not replace, expert analysis.';

function header(d: PdfDoc, label: string): void {
  d.polygon(brandPoints().map(([x, y]) => [LEFT + (x * 30) / 800, 38 + (y * 30) / 800] as const), INK);
  d.text(86, 58, 'Food Security Intelligence', { size: 11, bold: true });
  d.text(RIGHT, 58, label, { size: 9.5, color: MUTED, align: 'right' });
  d.line(LEFT, 84, RIGHT, 84, LINE);
}

function footer(d: PdfDoc, stamp: string): void {
  const n = d.pageCount;
  for (let i = 0; i < n; i++) {
    d.go(i);
    d.line(LEFT, 796, RIGHT, 796, LINE);
    d.text(LEFT, 814, `Food Security Intelligence | Generated ${stamp}`, { size: 8, color: MUTED });
    d.text(RIGHT, 814, `Page ${i + 1} of ${n}`, { size: 8, color: MUTED, align: 'right' });
  }
}

/** One-page report for a single scenario prediction. */
export function makePredictionPdf(r: PredictionRecord, now: Date = new Date()): Blob {
  const d = new PdfDoc(`Prediction report - ${r.county}`).page();
  const band = bandFor(r.p1);
  header(d, 'Prediction report');
  d.text(LEFT, 128, r.county, { size: 26, bold: true });
  d.text(LEFT, 150, `${r.state}  |  Start ${MONTHS[r.month - 1]} ${r.year}`, { size: 11, color: MUTED });

  const bigWidth = d.text(LEFT, 224, formatPct(r.p1), { size: 54 });
  if (band) {
    const label = `${band.label.toUpperCase()} MODELED RISK`;
    const w = d.textWidth(label, 8.5, true) + 24;
    d.rect(LEFT + bigWidth + 22, 196, w, 24, hex(band.color));
    d.text(LEFT + bigWidth + 22 + w / 2, 212, label, { size: 8.5, bold: true, color: WHITE, align: 'center' });
  }

  // Segmented scale with marker.
  const y0 = 262;
  const inner = CONTENT - 9;
  let x = LEFT;
  const starts: number[] = [];
  let markerX = LEFT;
  BANDS.forEach((b, i) => {
    const lo = i ? BANDS[i - 1]!.max : 0;
    const hi = Math.min(b.max, 1);
    const w = inner * (hi - lo);
    d.rect(x, y0, w, 10, hex(b.color));
    starts.push(x);
    if (r.p1 >= lo && r.p1 <= hi) markerX = x + (r.p1 - lo) * inner;
    x += w + 3;
  });
  d.rect(markerX - 1.5, y0 - 6, 3, 22, INK);
  d.text(LEFT, y0 + 30, '0%', { size: 8, color: MUTED });
  ['20%', '50%', '80%'].forEach((t, i) => d.text((starts[i + 1] ?? 0) - 1.5, y0 + 30, t, { size: 8, color: MUTED, align: 'center' }));
  d.text(RIGHT, y0 + 30, '100%', { size: 8, color: MUTED, align: 'right' });

  // Model comparison.
  d.text(LEFT, 346, 'Model comparison', { size: 12, bold: true });
  ([['C = 1.0', 'Production', r.p1, [47, 107, 143]], ['C = 100', 'Sensitivity check', r.p2, [98, 113, 125]]] as const).forEach(
    ([name, role, p, color], i) => {
      const y = 376 + i * 28;
      d.text(LEFT, y, name, { size: 10.5, bold: true });
      d.text(104, y, role, { size: 9.5, color: MUTED });
      d.rect(230, y - 8, 240, 8, SOFT);
      d.rect(230, y - 8, 240 * p, 8, color as unknown as RGB);
      d.text(RIGHT, y, formatPct(p), { size: 10.5, bold: true, align: 'right' });
    },
  );
  d.text(LEFT, 424, `Spread between settings: ${(Math.abs(r.p2 - r.p1) * 100).toFixed(1)} percentage points`, { size: 9, color: MUTED });

  // Inputs table.
  d.text(LEFT, 468, 'Scenario inputs', { size: 12, bold: true });
  const rows: [string, string][] = [
    ['State', r.state], ['County', r.county], ['Population', formatInt(r.population)],
    ['Start period', `${MONTHS[r.month - 1]} ${r.year}`], ['Previous IPC phase', `${r.phase} - ${phaseLabel(r.phase)}`],
    ['Phase 3+ share', `${r.pct}%`], ['Cereal production', `${formatInt(r.production)} t`],
    ['Cereal gap', `${r.gap < 0 ? '-' : ''}${formatInt(Math.abs(r.gap))} t`],
  ];
  let y = 486;
  d.line(LEFT, y, RIGHT, y, LINE);
  for (const [k, v] of rows) {
    y += 24;
    d.text(LEFT, y - 8, k, { size: 10, color: MUTED });
    d.text(RIGHT, y - 8, v, { size: 10.5, bold: true, align: 'right' });
    d.line(LEFT, y, RIGHT, y, LINE);
  }
  y += 22;

  if (r.warnings.length) {
    const lines = r.warnings.flatMap((w) => d.wrap(w, 455, 9.5));
    const h = 30 + lines.length * 13;
    d.rect(LEFT, y, CONTENT, h, [255, 246, 222]);
    d.rect(LEFT, y, 3, h, [214, 168, 58]);
    d.text(64, y + 19, 'Input check', { size: 10, bold: true });
    lines.forEach((l, i) => d.text(64, y + 34 + i * 13, l, { size: 9.5 }));
    y += h + 18;
  }
  d.text(LEFT, Math.max(y + 10, 726), `Reference ${r.id}  |  Model ${r.modelVersion}`, { size: 8, color: MUTED });
  d.wrap(DISCLAIMER, CONTENT, 8.5).forEach((l, i) => d.text(LEFT, Math.max(y + 10, 726) + 16 + i * 12, l, { size: 8.5, color: MUTED }));
  footer(d, niceStamp(now));
  return d.build();
}

export type ListRow = { rank: number | string; county: string; state: string; p: number };
export type ListReport = { title: string; label: string; noun: string; subtitle: string; rows: ListRow[] };

/** Multi-page ranked report (forecast tables, session runs). */
export function makeListPdf(o: ListReport, now: Date = new Date()): Blob {
  const d = new PdfDoc(o.title).page();
  header(d, o.label);
  d.text(LEFT, 128, o.title, { size: 24, bold: true });
  d.wrap(o.subtitle, CONTENT, 10.5).forEach((l, i) => d.text(LEFT, 148 + i * 14, l, { size: 10.5, color: MUTED }));

  const n = o.rows.length;
  const mean = n ? o.rows.reduce((a, r) => a + r.p, 0) / n : 0;
  const top = n ? o.rows.reduce((a, r) => (r.p > a.p ? r : a)) : null;
  const counts = BANDS.map((b) => o.rows.filter((r) => bandFor(r.p) === b).length);
  const stats: [string, string][] = [
    [o.noun, String(n)], ['Mean probability', n ? formatPct(mean) : '-'], ['High band', String(counts[3])],
    ['Highest', top ? `${top.county} ${formatPct(top.p, 0)}` : '-'],
  ];
  stats.forEach(([k, v], i) => {
    d.text(LEFT + i * 125, 206, k, { size: 8.5, color: MUTED });
    d.text(LEFT + i * 125, 226, v, { size: i === 3 ? 11 : 17, bold: true });
  });
  let x = LEFT;
  BANDS.forEach((b, i) => {
    const w = n ? (CONTENT * counts[i]!) / n : 0;
    if (w > 0) d.rect(x, 244, Math.max(w - (i < 3 ? 2 : 0), 1), 8, hex(b.color));
    x += w;
  });
  x = LEFT;
  BANDS.forEach((b, i) => {
    d.rect(x, 266, 8, 8, hex(b.color));
    x += d.text(x + 13, 274, `${b.label} ${counts[i]}`, { size: 8.5, color: MUTED }) + 30;
  });

  const head = (yy: number) => {
    d.line(LEFT, yy + 8, RIGHT, yy + 8, INK, 0.9);
    d.text(LEFT, yy, '#', { size: 8.5, bold: true, color: MUTED });
    d.text(80, yy, 'County', { size: 8.5, bold: true, color: MUTED });
    d.text(236, yy, 'State', { size: 8.5, bold: true, color: MUTED });
    d.text(412, yy, 'Probability', { size: 8.5, bold: true, color: MUTED, align: 'right' });
    d.text(496, yy, 'Risk band', { size: 8.5, bold: true, color: MUTED });
  };
  let y = 312;
  head(y);
  y += 8;
  const LIMIT = 782;
  for (const r of o.rows) {
    if (y + 22 > LIMIT) {
      d.page();
      header(d, o.label);
      y = 116;
      head(y);
      y += 8;
    }
    y += 22;
    const b = bandFor(r.p);
    d.text(LEFT, y - 8, String(r.rank), { size: 9, color: MUTED });
    d.text(80, y - 8, r.county, { size: 9.5, bold: true });
    d.text(236, y - 8, r.state, { size: 9.5 });
    d.text(412, y - 8, formatPct(r.p), { size: 9.5, bold: true, align: 'right' });
    d.rect(424, y - 13, 56, 5, SOFT);
    if (b) d.rect(424, y - 13, 56 * r.p, 5, hex(b.color));
    d.text(496, y - 8, b?.label ?? 'No data', { size: 9.5 });
    d.line(LEFT, y, RIGHT, y, LINE, 0.5);
  }
  if (!n) d.text(LEFT, 350, 'No records match the current filters.', { size: 10.5, color: MUTED });
  else {
    y += 26;
    if (y > LIMIT - 40) {
      d.page();
      header(d, o.label);
      y = 116;
    }
    d.wrap(DISCLAIMER, CONTENT, 8.5).forEach((l, i) => d.text(LEFT, y + i * 12, l, { size: 8.5, color: MUTED }));
  }
  footer(d, niceStamp(now));
  return d.build();
}

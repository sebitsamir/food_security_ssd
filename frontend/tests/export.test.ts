import { describe, expect, it } from 'vitest';
import { PdfDoc, toAscii } from '@/lib/export/pdfDoc';
import { makeListPdf, makePredictionPdf } from '@/lib/export/reports';
import { csvCell, csvText, forecastCsv, predictionCsv, PREDICTION_HEAD, predictionRow } from '@/lib/export/csv';
import type { PredictionRecord } from '@/lib/export/types';
import { counties, readBlob } from './fixtures';

const record: PredictionRecord = {
  id: '11111111-2222-4333-8444-555555555555', modelVersion: '1.0.0', at: '2026-10-10T08:00:00.000Z', time: '10 Oct 2026, 08:00',
  county: 'Bor South', countyPcode: 'SS0301', state: 'Jonglei', year: 2025, month: 4, population: 420000, phase: 3, pct: 60,
  production: 8765, gap: -23378, p1: 0.874, p2: 0.889, warnings: ['Population is outside the observed training range.'],
};

/** Structural PDF check: header, trailer, and every xref offset must point at "N 0 obj". */
function assertValidPdf(pdf: string): number {
  expect(pdf.startsWith('%PDF-1.4')).toBe(true);
  expect(pdf.endsWith('%%EOF')).toBe(true);
  const start = Number(/startxref\n(\d+)\n%%EOF$/.exec(pdf)?.[1]);
  expect(pdf.slice(start, start + 4)).toBe('xref');
  const entries = [...pdf.slice(start).matchAll(/^(\d{10}) (\d{5}) ([nf]) $/gm)];
  expect(entries.length).toBeGreaterThan(5);
  entries.slice(1).forEach((m, i) => expect(pdf.slice(Number(m[1]), Number(m[1]) + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`));
  const count = Number(/\/Count (\d+)/.exec(pdf)?.[1]);
  expect([...pdf.matchAll(/\/Type \/Page /g)]).toHaveLength(count);
  return count;
}

describe('csv', () => {
  it('quotes per RFC 4180', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('line\nbreak')).toBe('"line\nbreak"');
    expect(csvCell(null)).toBe('');
    expect(csvCell(-23378)).toBe('-23378'); // numbers are data, not formulas
  });
  it('neutralises spreadsheet formula injection in text', () => {
    for (const s of ['=SUM(A1)', '+1', '-2+3', '@cmd', '\tx']) expect(csvCell(s).replace(/^"/, '').startsWith("'")).toBe(true);
  });
  it('writes a BOM and CRLF line endings', () => {
    const t = csvText(['a', 'b'], [[1, 2]]);
    expect(t.startsWith('\uFEFF')).toBe(true);
    expect(t).toBe('\uFEFFa,b\r\n1,2\r\n');
  });
  it('keeps prediction rows aligned with the header', async () => {
    expect(predictionRow(record)).toHaveLength(PREDICTION_HEAD.length);
    const text = await readBlob(predictionCsv([record, { ...record, county: '=HYPERLINK("x")' }]));
    const lines = text.trim().split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('Bor South');
    expect(lines[1]).toContain('3 Crisis');
    expect(lines[2]).toContain(`"'=HYPERLINK(""x"")"`);
  });
  it('exports forecasts with codes for joining', async () => {
    const text = await readBlob(forecastCsv(counties.slice(0, 2), '2026-04', '1.0.0'));
    const [head, first] = text.replace('\uFEFF', '').trim().split('\r\n');
    expect(head).toBe('rank,county,county_pcode,state,state_pcode,risk_probability,risk_band,period,model_version');
    expect(first).toBe('6,Alpha One,S1A,Alpha,S1,0.15,Lower,2026-04,1.0.0');
  });
});

describe('PdfDoc', () => {
  it('sanitises to ASCII instead of corrupting text', () => {
    expect(toAscii('Café – “x” · 5×')).toBe('Caf? - "x" | 5x');
  });
  it('escapes parentheses and backslashes', () => {
    const d = new PdfDoc('t').page();
    d.text(10, 10, 'a (b) \\ c');
    expect(d.render()).toContain('(a \\(b\\) \\\\ c)');
  });
  it('produces a structurally valid file with exact xref offsets', () => {
    const d = new PdfDoc('Title (x)').page();
    d.text(48, 100, 'Hello', { bold: true });
    d.rect(10, 10, 20, 20, [1, 2, 3]);
    d.page().text(10, 10, 'Page two');
    expect(assertValidPdf(d.render())).toBe(2);
  });
  it('measures and wraps text', () => {
    const d = new PdfDoc('t');
    expect(d.textWidth('iiii', 10)).toBeLessThan(d.textWidth('WWWW', 10));
    expect(d.textWidth('abc', 10, true)).toBeGreaterThan(d.textWidth('abc', 10));
    const lines = d.wrap('one two three four five six seven', 60, 10);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.every((l) => d.textWidth(l, 10) <= 60 || !l.includes(' '))).toBe(true);
  });
});

describe('reports', () => {
  it('prediction PDF is valid, one page, and carries the result and reference', async () => {
    const pdf = await readBlob(makePredictionPdf(record, new Date('2026-10-10T08:00:00Z')));
    expect(assertValidPdf(pdf)).toBe(1);
    for (const needle of ['Bor South', '87.4%', 'HIGH MODELED RISK', '88.9%', 'Reference 11111111-2222', 'Input check', 'not an official IPC']) expect(pdf).toContain(needle);
  });
  it('paginates long lists and numbers the pages', async () => {
    const rows = Array.from({ length: 79 }, (_, i) => ({ rank: i + 1, county: `County ${i + 1}`, state: 'State', p: 1 - i / 100 }));
    const pdf = await readBlob(makeListPdf({ title: 'County forecasts', label: 'Forecast report', noun: 'Counties', subtitle: 'Apr 2026 period. All counties.', rows }));
    const pages = assertValidPdf(pdf);
    expect(pages).toBeGreaterThanOrEqual(3);
    expect(pdf).toContain(`Page ${pages} of ${pages}`);
    expect(pdf).toContain('County 79');
  });
  it('handles an empty list', async () => {
    const pdf = await readBlob(makeListPdf({ title: 'T', label: 'L', noun: 'Counties', subtitle: 's', rows: [] }));
    assertValidPdf(pdf);
    expect(pdf).toContain('No records match');
  });
});

/**
 * A tiny, dependency-free PDF writer (text, rectangles, lines, polygons) using the built-in
 * Helvetica fonts. Output is ASCII-only, so it works offline and byte offsets are exact.
 * Characters outside printable ASCII are mapped to safe equivalents (never silently dropped).
 */
export type RGB = readonly [number, number, number];
export const INK: RGB = [11, 22, 32];
export const MUTED: RGB = [98, 113, 125];
export const LINE: RGB = [217, 224, 230];
export const SOFT: RGB = [238, 241, 244];
export const WHITE: RGB = [255, 255, 255];

// Helvetica advance widths (per 1000 em) for ASCII 32..126.
const WR = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const WB = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];

const REPLACEMENTS: Record<string, string> = {
  '–': '-', '—': '-', '·': '|', '’': "'", '‘': "'", '“': '"', '”': '"', '−': '-', '…': '...', '×': 'x',
};

export const toAscii = (s: string): string => s.replace(/[^\x20-\x7E]/g, (c) => REPLACEMENTS[c] ?? '?');
const esc = (s: string): string => toAscii(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
const f = (n: number): string => n.toFixed(2);
const col = (c: RGB): string => c.map((v) => (v / 255).toFixed(3)).join(' ');

export type TextOptions = { size?: number; bold?: boolean; color?: RGB; align?: 'left' | 'right' | 'center' };

export class PdfDoc {
  readonly width = 595.28;
  readonly height = 841.89;
  private pages: string[][] = [];
  private cur: string[] = [];

  constructor(private readonly title: string) {}

  page(): this {
    this.cur = [];
    this.pages.push(this.cur);
    return this;
  }
  go(i: number): void {
    const p = this.pages[i];
    if (p) this.cur = p;
  }
  get pageCount(): number {
    return this.pages.length;
  }

  textWidth(s: string, size: number, bold = false): number {
    const table = bold ? WB : WR;
    let w = 0;
    for (const ch of toAscii(s)) w += table[ch.charCodeAt(0) - 32] ?? 556;
    return (w * size) / 1000;
  }

  text(x: number, y: number, s: string, o: TextOptions = {}): number {
    const size = o.size ?? 10;
    const bold = o.bold ?? false;
    const w = this.textWidth(s, size, bold);
    const left = o.align === 'right' ? x - w : o.align === 'center' ? x - w / 2 : x;
    this.cur.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${col(o.color ?? INK)} rg ${f(left)} ${f(this.height - y)} Td (${esc(s)}) Tj ET`);
    return w;
  }
  rect(x: number, y: number, w: number, h: number, c: RGB): void {
    this.cur.push(`${col(c)} rg ${f(x)} ${f(this.height - y - h)} ${f(w)} ${f(h)} re f`);
  }
  line(x1: number, y1: number, x2: number, y2: number, c: RGB, width = 0.75): void {
    this.cur.push(`${col(c)} RG ${width} w ${f(x1)} ${f(this.height - y1)} m ${f(x2)} ${f(this.height - y2)} l S`);
  }
  polygon(points: readonly (readonly [number, number])[], c: RGB): void {
    const path = points.map((p, i) => `${f(p[0])} ${f(this.height - p[1])} ${i ? 'l' : 'm'}`).join(' ');
    this.cur.push(`${col(c)} rg ${path} h f`);
  }
  wrap(s: string, maxWidth: number, size: number, bold = false): string[] {
    const out: string[] = [];
    let line = '';
    for (const word of toAscii(s).split(/\s+/)) {
      const t = line ? `${line} ${word}` : word;
      if (this.textWidth(t, size, bold) > maxWidth && line) {
        out.push(line);
        line = word;
      } else line = t;
    }
    if (line) out.push(line);
    return out;
  }

  /** The complete PDF file as an ASCII string. */
  render(now: Date = new Date()): string {
    const o: string[] = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      `<< /Type /Pages /Kids [${this.pages.map((_, i) => `${5 + 2 * i} 0 R`).join(' ')}] /Count ${this.pages.length} >>`,
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    ];
    this.pages.forEach((p, i) => {
      const content = p.join('\n');
      o.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.width} ${this.height}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + 2 * i} 0 R >>`);
      o.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    });
    const z = (n: number) => String(n).padStart(2, '0');
    const date = `D:${now.getFullYear()}${z(now.getMonth() + 1)}${z(now.getDate())}${z(now.getHours())}${z(now.getMinutes())}${z(now.getSeconds())}`;
    o.push(`<< /Title (${esc(this.title)}) /Producer (Food Security Intelligence) /CreationDate (${date}) >>`);

    let out = '%PDF-1.4\n';
    const offsets: number[] = [];
    o.forEach((body, i) => {
      offsets.push(out.length);
      out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    });
    const xref = out.length;
    out += `xref\n0 ${o.length + 1}\n0000000000 65535 f \n`;
    out += offsets.map((v) => `${String(v).padStart(10, '0')} 00000 n \n`).join('');
    out += `trailer\n<< /Size ${o.length + 1} /Root 1 0 R /Info ${o.length} 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return out;
  }

  build(): Blob {
    return new Blob([this.render()], { type: 'application/pdf' });
  }
}

export const PACK_FONT = 'StrataPack';

interface Glyph { cp: number; adv: number; rects: [number, number, number, number][] }

class Writer {
  private b: number[] = [];
  get length(): number { return this.b.length; }
  u8(v: number): this { this.b.push(v & 255); return this; }
  u16(v: number): this { this.b.push((v >> 8) & 255, v & 255); return this; }
  i16(v: number): this { return this.u16(v < 0 ? v + 65536 : v); }
  u32(v: number): this { this.b.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255); return this; }
  bytes(a: ArrayLike<number>): this { for (let i = 0; i < a.length; i++) this.b.push(a[i] & 255); return this; }
  pad4(): this { while (this.b.length % 4) this.b.push(0); return this; }
  out(): Uint8Array { return new Uint8Array(this.b); }
}

function checksum(d: Uint8Array): number {
  let s = 0;
  for (let i = 0; i < d.length; i += 4) s = (s + (((d[i] << 24) | ((d[i + 1] ?? 0) << 16) | ((d[i + 2] ?? 0) << 8) | (d[i + 3] ?? 0)) >>> 0)) >>> 0;
  return s;
}

function readGlyphs(canvas: HTMLCanvasElement, chars: string[]): { glyphs: Glyph[]; cell: number; px: number } {
  const cols = 16;
  const cell = Math.max(1, Math.floor(canvas.width / cols));
  const px = Math.round(1024 / cell);
  const g = canvas.getContext('2d', { willReadFrequently: true })!;
  const img = g.getImageData(0, 0, canvas.width, canvas.height).data;
  const glyphs: Glyph[] = [];
  const seen = new Set<number>();
  chars.forEach((row, ry) => {
    [...row].forEach((ch, rx) => {
      const cp = ch.codePointAt(0) ?? 0;
      if (cp === 0 || seen.has(cp)) return;
      const on = (x: number, y: number) => img[(((ry * cell + y) * canvas.width) + rx * cell + x) * 4 + 3] > 127;
      let width = 0;
      for (let x = cell - 1; x >= 0 && !width; x--) for (let y = 0; y < cell; y++) if (on(x, y)) { width = x + 1; break; }
      if (cp === 32) { seen.add(cp); glyphs.push({ cp, adv: Math.round(cell / 2) * px, rects: [] }); return; }
      if (!width) return;
      const rects: [number, number, number, number][] = [];
      let open: [number, number, number, number][] = [];
      for (let y = 0; y < cell; y++) {
        const runs: [number, number][] = [];
        let x = 0;
        while (x < cell) {
          if (!on(x, y)) { x++; continue; }
          const s = x;
          while (x < cell && on(x, y)) x++;
          runs.push([s, x]);
        }
        const next: [number, number, number, number][] = [];
        for (const [a, b] of runs) {
          const i = open.findIndex((r) => r[0] === a && r[2] === b);
          if (i >= 0) { const r = open.splice(i, 1)[0]; r[3] = y + 1; next.push(r); } else next.push([a, y, b, y + 1]);
        }
        rects.push(...open);
        open = next;
      }
      rects.push(...open);
      seen.add(cp);
      glyphs.push({ cp, adv: (width + 1) * px, rects });
    });
  });
  glyphs.sort((a, b) => a.cp - b.cp);
  return { glyphs, cell, px };
}

export function buildFont(canvas: HTMLCanvasElement, chars: string[], ascentPx: number, family = PACK_FONT): Uint8Array {
  const { glyphs, cell, px } = readGlyphs(canvas, chars);
  const em = 1024;
  const asc = ascentPx * px, desc = (cell - ascentPx) * px;
  const all: Glyph[] = [{ cp: -1, adv: 4 * px, rects: [] }, ...glyphs];
  const glyf = new Writer();
  const loca: number[] = [];
  let maxPts = 0, maxCont = 0, xMaxAll = 0, advMax = 0;
  for (const gl of all) {
    loca.push(glyf.length);
    advMax = Math.max(advMax, gl.adv);
    if (!gl.rects.length) continue;
    const pts: [number, number][][] = gl.rects.map(([x0, y0, x1, y1]) => {
      const X0 = x0 * px, X1 = x1 * px, Yt = asc - y0 * px, Yb = asc - y1 * px;
      return [[X0, Yb], [X0, Yt], [X1, Yt], [X1, Yb]];
    });
    const flat = pts.flat();
    const xs = flat.map((p) => p[0]), ys = flat.map((p) => p[1]);
    const bb = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    xMaxAll = Math.max(xMaxAll, bb[2]);
    maxPts = Math.max(maxPts, flat.length);
    maxCont = Math.max(maxCont, pts.length);
    glyf.i16(pts.length).i16(bb[0]).i16(bb[1]).i16(bb[2]).i16(bb[3]);
    let end = -1;
    for (const c of pts) { end += c.length; glyf.u16(end); }
    glyf.u16(0);
    for (let i = 0; i < flat.length; i++) glyf.u8(1);
    let lx = 0;
    for (const [x] of flat) { glyf.i16(x - lx); lx = x; }
    let ly = 0;
    for (const [, y] of flat) { glyf.i16(y - ly); ly = y; }
    while (glyf.length % 4) glyf.u8(0);
  }
  loca.push(glyf.length);
  const n = all.length;

  const head = new Writer().u32(0x00010000).u32(0x00010000).u32(0).u32(0x5f0f3cf5).u16(0x000b).u16(em)
    .u32(0).u32(0).u32(0).u32(0).i16(0).i16(-desc).i16(xMaxAll).i16(asc).u16(0).u16(8).i16(2).i16(1).i16(0);
  const hhea = new Writer().u32(0x00010000).i16(asc).i16(-desc).i16(px).u16(advMax).i16(0).i16(0).i16(xMaxAll)
    .i16(1).i16(0).i16(0).i16(0).i16(0).i16(0).i16(0).i16(0).u16(n);
  const maxp = new Writer().u32(0x00010000).u16(n).u16(maxPts).u16(maxCont).u16(0).u16(0).u16(2).u16(0).u16(0).u16(0).u16(0).u16(0).u16(0).u16(0).u16(0);
  const cps = glyphs.map((g) => g.cp);
  const os2 = new Writer().u16(4).i16(Math.round(glyphs.reduce((a, g) => a + g.adv, 0) / Math.max(1, glyphs.length))).u16(400).u16(5).u16(0)
    .i16(em / 2).i16(em / 2).i16(0).i16(px).i16(em / 2).i16(em / 2).i16(0).i16(asc / 2).i16(px).i16(asc / 2)
    .i16(0).bytes([2, 0, 6, 0, 0, 0, 0, 0, 0, 0]).u32(1).u32(0).u32(0).u32(0).bytes([83, 84, 82, 65]).u16(0x40)
    .u16(Math.min(...cps)).u16(Math.min(0xffff, Math.max(...cps))).i16(asc).i16(-desc).i16(px).u16(asc).u16(desc)
    .u32(1).u32(0).i16(5 * px).i16(asc).u16(0).u16(32).u16(1);
  const hmtx = new Writer();
  for (const gl of all) hmtx.u16(gl.adv).i16(gl.rects.length ? Math.min(...gl.rects.map((r) => r[0])) * px : 0);
  const segs = glyphs.map((g, i) => ({ s: g.cp, e: g.cp, d: (i + 1 - g.cp + 65536) % 65536 })).filter((s) => s.s < 0xffff);
  segs.push({ s: 0xffff, e: 0xffff, d: 1 });
  const sc = segs.length;
  const sr = 2 * Math.pow(2, Math.floor(Math.log2(sc)));
  const sub = new Writer().u16(4).u16(16 + sc * 8).u16(0).u16(sc * 2).u16(sr).u16(Math.log2(sr / 2)).u16(sc * 2 - sr);
  for (const s of segs) sub.u16(s.e);
  sub.u16(0);
  for (const s of segs) sub.u16(s.s);
  for (const s of segs) sub.u16(s.d);
  for (let i = 0; i < sc; i++) sub.u16(0);
  const cmap = new Writer().u16(0).u16(1).u16(3).u16(1).u32(12).bytes(sub.out());
  const names: [number, string][] = [[1, family], [2, 'Regular'], [3, `${family}-Regular`], [4, family], [6, `${family}-Regular`]];
  const strs = names.map(([, s]) => { const w = new Writer(); for (const ch of s) w.u16(ch.charCodeAt(0)); return w.out(); });
  const name = new Writer().u16(0).u16(names.length).u16(6 + names.length * 12);
  let off = 0;
  names.forEach(([id], i) => { name.u16(3).u16(1).u16(0x409).u16(id).u16(strs[i].length).u16(off); off += strs[i].length; });
  for (const s of strs) name.bytes(s);
  const post = new Writer().u32(0x00030000).u32(0).i16(-px).i16(px).u32(0).u32(0).u32(0).u32(0).u32(0);
  const locaW = new Writer();
  for (const o of loca) locaW.u32(o);

  const tables: [string, Uint8Array][] = [
    ['OS/2', os2.out()], ['cmap', cmap.out()], ['glyf', glyf.out()], ['head', head.out()], ['hhea', hhea.out()],
    ['hmtx', hmtx.out()], ['loca', locaW.out()], ['maxp', maxp.out()], ['name', name.out()], ['post', post.out()],
  ];
  const nt = tables.length;
  const esr = Math.pow(2, Math.floor(Math.log2(nt)));
  const font = new Writer().u32(0x00010000).u16(nt).u16(esr * 16).u16(Math.log2(esr)).u16(nt * 16 - esr * 16);
  let offset = 12 + nt * 16;
  const offsets: number[] = [];
  for (const [tag, d] of tables) {
    font.bytes([...tag].map((c) => c.charCodeAt(0))).u32(checksum(d)).u32(offset).u32(d.length);
    offsets.push(offset);
    offset += Math.ceil(d.length / 4) * 4;
  }
  for (const [, d] of tables) { font.bytes(d); font.pad4(); }
  const out = font.out();
  const headOff = offsets[tables.findIndex((t) => t[0] === 'head')];
  const adj = (0xb1b0afba - checksum(out)) >>> 0;
  out[headOff + 8] = adj >>> 24; out[headOff + 9] = (adj >>> 16) & 255; out[headOff + 10] = (adj >>> 8) & 255; out[headOff + 11] = adj & 255;
  return out;
}

let loadedFor: HTMLCanvasElement | null = null;
let current: FontFace | null = null;

export async function installPackFont(info: { canvas: HTMLCanvasElement; chars: string[]; ascent: number } | null): Promise<boolean> {
  const root = document.documentElement;
  if (!info) {
    if (current) { document.fonts.delete(current); current = null; loadedFor = null; }
    root.classList.remove('pack-font');
    return false;
  }
  if (loadedFor === info.canvas) return true;
  try {
    const bytes = buildFont(info.canvas, info.chars, info.ascent);
    const face = new FontFace(PACK_FONT, bytes.buffer as ArrayBuffer);
    await face.load();
    if (current) document.fonts.delete(current);
    document.fonts.add(face);
    current = face;
    loadedFor = info.canvas;
    root.classList.add('pack-font');
    return true;
  } catch (e) {
    console.warn('Pack font failed', e);
    root.classList.remove('pack-font');
    return false;
  }
}

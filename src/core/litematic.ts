import { B, BLOCKS, makeBlock, SHAPE_MATS, SLAB_TOP, STAIRS_UP, doorMeta, trapdoorMeta, TD_SPECIES_MIN, CB } from './blocks';
import { getItem, ITEMS } from './items';
import { BP_MAX, Blueprint, bpItem } from './blueprint';
import { JAVA_BLOCK_NAMES } from '../resources/javaNames';

type Nbt = number | bigint | string | Nbt[] | { [k: string]: Nbt } | Uint8Array | Int32Array | Uint32Array;

class Reader {
  private v: DataView;
  p = 0;
  constructor(private b: Uint8Array) { this.v = new DataView(b.buffer, b.byteOffset, b.byteLength); }
  u8(): number { return this.v.getUint8(this.p++); }
  i16(): number { const n = this.v.getInt16(this.p); this.p += 2; return n; }
  i32(): number { const n = this.v.getInt32(this.p); this.p += 4; return n; }
  str(): string { const n = this.v.getUint16(this.p); this.p += 2; const s = new TextDecoder().decode(this.b.subarray(this.p, this.p + n)); this.p += n; return s; }
  need(n: number): void { if (n < 0 || this.p + n > this.b.length) throw new Error('truncated'); }
  tag(t: number, depth: number): Nbt {
    if (depth > 64) throw new Error('too deep');
    switch (t) {
      case 1: return this.v.getInt8(this.p++);
      case 2: return this.i16();
      case 3: return this.i32();
      case 4: { const hi = this.i32(), lo = this.v.getUint32(this.p); this.p += 4; return (BigInt(hi) << 32n) | BigInt(lo); }
      case 5: { const n = this.v.getFloat32(this.p); this.p += 4; return n; }
      case 6: { const n = this.v.getFloat64(this.p); this.p += 8; return n; }
      case 7: { const n = this.i32(); this.need(n); const a = this.b.slice(this.p, this.p + n); this.p += n; return a; }
      case 8: return this.str();
      case 9: {
        const et = this.u8(), n = this.i32();
        if (n < 0 || n > 1 << 22) throw new Error('bad list');
        const out: Nbt[] = [];
        for (let i = 0; i < n; i++) out.push(this.tag(et, depth + 1));
        return out;
      }
      case 10: {
        const o: { [k: string]: Nbt } = {};
        for (;;) {
          const ct = this.u8();
          if (ct === 0) return o;
          const k = this.str();
          o[k] = this.tag(ct, depth + 1);
        }
      }
      case 11: { const n = this.i32(); this.need(n * 4); const a = new Int32Array(n); for (let i = 0; i < n; i++) a[i] = this.i32(); return a; }
      case 12: {
        const n = this.i32(); this.need(n * 8);
        const w = new Uint32Array(n * 2);
        for (let i = 0; i < n; i++) { w[i * 2 + 1] = this.v.getUint32(this.p); w[i * 2] = this.v.getUint32(this.p + 4); this.p += 8; }
        return w;
      }
      default: throw new Error(`bad tag ${t}`);
    }
  }
}

export function readNbt(b: Uint8Array): { [k: string]: Nbt } {
  const r = new Reader(b);
  const t = r.u8();
  if (t !== 10) throw new Error('not NBT');
  r.str();
  return r.tag(10, 0) as { [k: string]: Nbt };
}

export async function gunzip(b: Uint8Array): Promise<Uint8Array> {
  if (b[0] !== 0x1f || b[1] !== 0x8b) return b;
  const ds = new DecompressionStream('gzip');
  const out = new Response(new Blob([b.slice() as Uint8Array<ArrayBuffer>]).stream().pipeThrough(ds));
  return new Uint8Array(await out.arrayBuffer());
}

let NAMES: Map<string, number> | null = null;
function nameMap(): Map<string, number> {
  if (NAMES) return NAMES;
  const m = new Map<string, number>();
  for (const b of BLOCKS) {
    if (!b || !ITEMS[b.id]) continue;
    m.set(b.key, b.id);
    const j = JAVA_BLOCK_NAMES[b.key];
    if (j && !j.state?.includes('snowy=true') && !j.state?.includes('lit=true')) m.set(j.name, b.id);
  }
  for (const it of ITEMS) if (it && it.places !== undefined) { if (!m.has(it.key)) m.set(it.key, it.id); }
  m.set('grass_block', B.GRASS); m.set('short_grass', B.TALL_GRASS); m.set('wall_torch', B.TORCH); m.set('soul_wall_torch', CB.SOUL_TORCH);
  NAMES = m;
  return m;
}

const FACE: Record<string, number> = { north: 0, east: 1, south: 2, west: 3 };
const AIR = new Set(['air', 'cave_air', 'void_air', 'structure_void']);

export function blockFromState(name: string, props: Record<string, string>): number | null {
  const key = name.replace(/^minecraft:/, '');
  if (AIR.has(key)) return 0;
  const id = nameMap().get(key);
  if (id === undefined) return null;
  const it = getItem(id);
  const blockId = it?.places ?? (it?.kind === 'block' ? id : undefined);
  if (blockId === undefined) return null;
  const pm = it?.placeMeta ?? 0;
  const f = FACE[props.facing ?? ''] ?? 0;
  const def = BLOCKS[blockId];
  if (blockId === B.SLAB) return props.type === 'double' ? makeBlock(SHAPE_MATS[pm & 31]?.id ?? B.OAK_PLANKS) : makeBlock(B.SLAB, pm | (props.type === 'top' ? SLAB_TOP : 0));
  if (blockId === B.STAIRS) return makeBlock(B.STAIRS, pm | (f << 5) | (props.half === 'top' ? STAIRS_UP : 0));
  if (blockId === B.OAK_DOOR) {
    if (pm >= TD_SPECIES_MIN << 4) return makeBlock(B.OAK_DOOR, trapdoorMeta(pm >> 4, f, props.half === 'top', props.open === 'true'));
    return makeBlock(B.OAK_DOOR, doorMeta(f, props.half === 'upper', props.open === 'true'));
  }
  let meta = 0;
  if (def?.orientable) meta = f;
  if (def?.render === 'leaves') meta = 1;
  if (pm && blockId !== B.EXT) meta = (meta & 15) | pm;
  else if (blockId === B.EXT) meta = pm;
  return makeBlock(blockId, meta);
}

function bitsAt(words: Uint32Array, idx: number, bits: number): number {
  const g = idx * bits, w = g >>> 5, o = g & 31;
  let v = words[w] >>> o;
  if (o + bits > 32) v |= words[w + 1] << (32 - o);
  return v & ((1 << bits) - 1);
}

export interface LitematicResult { bp: Blueprint; skipped: number; unknown: string[] }

export function parseLitematic(raw: Uint8Array, fallbackName: string): LitematicResult | string {
  let root: { [k: string]: Nbt };
  try { root = readNbt(raw); } catch { return 'That file is not a Litematica schematic.'; }
  const regions = root.Regions as { [k: string]: { [k: string]: Nbt } } | undefined;
  if (!regions || typeof regions !== 'object') return 'That file has no regions in it.';
  const meta = (root.Metadata ?? {}) as { [k: string]: Nbt };
  const name = (typeof meta.Name === 'string' && meta.Name.trim() ? meta.Name : fallbackName).slice(0, 32);
  type R = { x0: number; y0: number; z0: number; w: number; h: number; d: number; pal: (number | null)[]; names: string[]; words: Uint32Array; bits: number };
  const list: R[] = [];
  for (const r of Object.values(regions)) {
    const pos = r.Position as { [k: string]: number }, size = r.Size as { [k: string]: number };
    const pal = r.BlockStatePalette as { [k: string]: Nbt }[], states = r.BlockStates as Uint32Array;
    if (!pos || !size || !Array.isArray(pal) || !(states instanceof Uint32Array)) return 'One of the regions in that file is damaged.';
    const sx = Number(size.x), sy = Number(size.y), sz = Number(size.z);
    const w = Math.abs(sx), h = Math.abs(sy), d = Math.abs(sz);
    if (!w || !h || !d) continue;
    if (w > BP_MAX || h > BP_MAX || d > BP_MAX) return `That schematic is ${w} x ${h} x ${d}. Blueprints can be at most ${BP_MAX} blocks on each side.`;
    const names: string[] = [];
    const mapped = pal.map((e) => {
      const nm = String(e.Name ?? 'minecraft:air');
      names.push(nm);
      const props: Record<string, string> = {};
      if (e.Properties && typeof e.Properties === 'object') for (const [k, v] of Object.entries(e.Properties as Record<string, Nbt>)) props[k] = String(v);
      return blockFromState(nm, props);
    });
    const bits = Math.max(2, 32 - Math.clz32(Math.max(1, pal.length - 1)));
    if (states.length * 32 < w * h * d * bits) return 'One of the regions in that file is damaged.';
    list.push({ x0: Number(pos.x) + (sx < 0 ? sx + 1 : 0), y0: Number(pos.y) + (sy < 0 ? sy + 1 : 0), z0: Number(pos.z) + (sz < 0 ? sz + 1 : 0), w, h, d, pal: mapped, names, words: states, bits });
  }
  if (!list.length) return 'That schematic is empty.';
  const mx = Math.min(...list.map((r) => r.x0)), my = Math.min(...list.map((r) => r.y0)), mz = Math.min(...list.map((r) => r.z0));
  const W = Math.max(...list.map((r) => r.x0 + r.w)) - mx, H = Math.max(...list.map((r) => r.y0 + r.h)) - my, D = Math.max(...list.map((r) => r.z0 + r.d)) - mz;
  if (W > BP_MAX || H > BP_MAX || D > BP_MAX) return `That schematic is ${W} x ${H} x ${D}. Blueprints can be at most ${BP_MAX} blocks on each side.`;
  const blocks = new Uint32Array(W * H * D);
  let skipped = 0;
  const unknown = new Set<string>();
  for (const r of list) {
    for (let y = 0; y < r.h; y++) for (let z = 0; z < r.d; z++) for (let x = 0; x < r.w; x++) {
      const pi = bitsAt(r.words, (y * r.d + z) * r.w + x, r.bits);
      const v = r.pal[pi];
      if (v === undefined) continue;
      if (v === null) { skipped++; unknown.add(r.names[pi].replace(/^minecraft:/, '')); continue; }
      if (v === 0) continue;
      if (bpItem(v) === null) { skipped++; continue; }
      blocks[((r.y0 - my + y) * D + (r.z0 - mz + z)) * W + (r.x0 - mx + x)] = v;
    }
  }
  return { bp: { name, w: W, h: H, d: D, blocks, at: Date.now() }, skipped, unknown: [...unknown].slice(0, 12) };
}

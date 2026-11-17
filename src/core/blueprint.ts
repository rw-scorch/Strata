import { B, BLOCKS, bid, tix, isFluid, isDoorBlock, DOOR_UPPER, slabItem, stairsItem, isBaseId } from './blocks';
import { getItem } from './items';
import { encodeRLE, decodeRLE, u16ToBase64, base64ToU16 } from './chunk';
import { WORLD_HEIGHT } from './constants';

export const BP_MAX = 128;
export const BP_SLOTS = 2;
export const BP_PART = 48000;
export const BP_MAX_PARTS = 64;

export interface Blueprint { name: string; w: number; h: number; d: number; blocks: Uint32Array; at: number }

const BANNED = new Set<number>([B.BEDROCK, B.NETHER_PORTAL, B.FIRE, B.SOUL_FIRE, B.MOVING_PISTON, B.PISTON_HEAD, B.WATER, B.LAVA]);

export function bpIndex(bp: { w: number; d: number }, x: number, y: number, z: number): number { return (y * bp.d + z) * bp.w + x; }

export function bpItem(v: number): number | null {
  const id = bid(v);
  if (id === 0) return 0;
  if (!isBaseId(id) && id !== B.EXT) return null;
  if (BANNED.has(id) || isFluid(v)) return null;
  const meta = (v >>> 8) & 0xff;
  if (isDoorBlock(v) && (meta & DOOR_UPPER)) return 0;
  if (id === B.SLAB) return slabItem(meta & 31);
  if (id === B.STAIRS) return stairsItem(meta & 31);
  if (id === B.FURNACE_LIT) return B.FURNACE;
  const t = tix(v);
  const it = getItem(t);
  if (it && (it.kind === 'block' || it.places !== undefined)) return t;
  const dr = BLOCKS[t]?.drops?.[0];
  const di = dr && typeof dr.item === 'number' ? dr.item : null;
  if (di !== null && getItem(di)) return di;
  return null;
}

export function captureBlueprint(get: (x: number, y: number, z: number) => number, a: number[], b: number[], name: string): { bp: Blueprint; stripped: number } | string {
  const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.max(0, Math.min(a[1], b[1])), y1 = Math.min(WORLD_HEIGHT - 1, Math.max(a[1], b[1])), z0 = Math.min(a[2], b[2]), z1 = Math.max(a[2], b[2]);
  const w = x1 - x0 + 1, h = y1 - y0 + 1, d = z1 - z0 + 1;
  if (w > BP_MAX || h > BP_MAX || d > BP_MAX) return `Selection is ${w} x ${h} x ${d}. Blueprints can be at most ${BP_MAX} blocks on each side.`;
  const blocks = new Uint32Array(w * h * d);
  let stripped = 0, solid = 0;
  for (let y = 0; y < h; y++) for (let z = 0; z < d; z++) for (let x = 0; x < w; x++) {
    const v = get(x0 + x, y0 + y, z0 + z);
    if (!bid(v)) continue;
    if (bpItem(v) === null) { stripped++; continue; }
    blocks[(y * d + z) * w + x] = v;
    solid++;
  }
  if (!solid) return 'The selection is empty.';
  return { bp: trim({ name: name.slice(0, 32) || 'Blueprint', w, h, d, blocks, at: Date.now() }), stripped };
}

function trim(bp: Blueprint): Blueprint {
  let x0 = bp.w, x1 = -1, y0 = bp.h, y1 = -1, z0 = bp.d, z1 = -1;
  for (let y = 0; y < bp.h; y++) for (let z = 0; z < bp.d; z++) for (let x = 0; x < bp.w; x++) {
    if (!bp.blocks[(y * bp.d + z) * bp.w + x]) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z;
  }
  const w = x1 - x0 + 1, h = y1 - y0 + 1, d = z1 - z0 + 1;
  if (w === bp.w && h === bp.h && d === bp.d) return bp;
  const out = new Uint32Array(w * h * d);
  for (let y = 0; y < h; y++) for (let z = 0; z < d; z++) for (let x = 0; x < w; x++) out[(y * d + z) * w + x] = bp.blocks[((y + y0) * bp.d + z + z0) * bp.w + x + x0];
  return { ...bp, w, h, d, blocks: out };
}

export function bpCosts(bp: Blueprint): { items: Map<number, number>; blocks: number } {
  const items = new Map<number, number>();
  let blocks = 0;
  for (const v of bp.blocks) {
    if (!v) continue;
    blocks++;
    const it = bpItem(v);
    if (it) items.set(it, (items.get(it) ?? 0) + 1);
  }
  return { items, blocks };
}

export function encodeBlueprint(bp: Blueprint): string {
  return `${bp.w},${bp.h},${bp.d}|${u16ToBase64(encodeRLE(bp.blocks))}`;
}

export function decodeBlueprint(s: string, name = 'Blueprint'): Blueprint | null {
  const m = /^(\d{1,3}),(\d{1,3}),(\d{1,3})\|([A-Za-z0-9+/=]+)$/.exec(s);
  if (!m) return null;
  const w = Number(m[1]), h = Number(m[2]), d = Number(m[3]);
  if (![w, h, d].every((n) => n >= 1 && n <= BP_MAX)) return null;
  try {
    const blocks = decodeRLE(base64ToU16(m[4]), w * h * d);
    for (const v of blocks) if (v && bpItem(v) === null) return null;
    return { name, w, h, d, blocks, at: Date.now() };
  } catch { return null; }
}

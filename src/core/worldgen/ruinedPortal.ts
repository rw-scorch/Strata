import { SEA_LEVEL } from '../constants';
import { Rng, hash2 } from '../rng';
import { B, X, XV, makeBlock, SLAB_TOP } from '../blocks';
import { I, toolId, armorId } from '../items';
import { ENCHANTS, supports } from '../enchants';
import type { ItemStack } from '../inventory';
import type { Column, GenBlockEntity } from './WorldGenerator';

export const PORTAL_GRID = 640, PORTAL_AREA = 400;

type Keep = (u: number, y: number, w: number, h: number) => boolean;
interface Design { w: number; h: number; keep: Keep; flat?: boolean; fallen?: [number, number, number][]; r: number; lava: number; gold: number; stairs: number; bars: number; pillars: number; slabs?: boolean; }

const D: Design[] = [
  { w: 4, h: 5, keep: (u, y, w, h) => !(y === h - 1 && u >= 2) && !(u === w - 1 && y >= 3), r: 2, lava: 0, gold: 2, stairs: 6, bars: 0, pillars: 1, slabs: true },
  { w: 4, h: 5, keep: (u, y) => !(y === 0 && u >= 1 && u <= 2) && !(u === 0 && y === 4), r: 3, lava: 26, gold: 2, stairs: 4, bars: 2, pillars: 1 },
  { w: 4, h: 5, keep: (u, y, w, h) => !(u === 0 && y >= 2) && !(y === h - 1 && u <= 1), r: 4, lava: 2, gold: 0, stairs: 0, bars: 0, pillars: 0 },
  { w: 4, h: 5, keep: (u, y, w, h) => !(u === w - 1 && y >= 2) && !(y === h - 1 && u >= 2), r: 4, lava: 3, gold: 1, stairs: 0, bars: 0, pillars: 0 },
  { w: 4, h: 5, keep: (u, y, w, h) => y !== h - 1, fallen: [[0, 0, 2], [1, 0, 2], [2, 0, 3], [3, 0, 2], [1, 0, 3]], r: 3, lava: 1, gold: 3, stairs: 1, bars: 0, pillars: 1, slabs: true },
  { w: 5, h: 5, keep: (u, y, w, h) => !(y === h - 1 && u === 2), fallen: [[2, 0, 1]], r: 1, lava: 0, gold: 1, stairs: 2, bars: 0, pillars: 0 },
  { w: 4, h: 5, keep: (u, y, w, h) => !(y === h - 1 && u !== 0) && !(u === w - 1 && y === 3), r: 3, lava: 21, gold: 2, stairs: 1, bars: 0, pillars: 0 },
  { w: 4, h: 5, keep: (u, y, w, h) => y !== h - 1 || u === 0, fallen: [[1, -1, 2], [2, -1, 2], [3, -1, 3], [2, -1, 3]], r: 3, lava: 26, gold: 3, stairs: 6, bars: 0, pillars: 2 },
  { w: 4, h: 5, keep: (u, y, w, h) => !(u === 0 && y >= 3) && !(y === h - 1 && u === 1), r: 2, lava: 0, gold: 2, stairs: 11, bars: 0, pillars: 0 },
  { w: 4, h: 5, keep: (u, y) => !(u === 3 && y === 4), flat: true, r: 3, lava: 19, gold: 2, stairs: 3, bars: 3, pillars: 2 },
];
const GIANT: Design[] = [
  { w: 8, h: 9, keep: (u, y, w, h) => (u <= 3 && y >= 5) || (u >= 4 && y <= 4) || (u === 0 && y >= 2) || (y === 0 && u >= 2), r: 5, lava: 11, gold: 2, stairs: 20, bars: 18, pillars: 4, slabs: true },
  { w: 8, h: 9, keep: (u, y, w, h) => !(y === h - 1 && u >= 3) && !(u === w - 1 && y >= 4) && !(u === 0 && y === 4), r: 5, lava: 19, gold: 2, stairs: 18, bars: 22, pillars: 5, slabs: true },
  { w: 8, h: 9, keep: (u, y) => ((u * 7 + y * 13) % 5) < 3, r: 6, lava: 33, gold: 6, stairs: 6, bars: 22, pillars: 5, slabs: true },
];

export interface PortalPlan { x: number; y: number; z: number; rot: number; d: Design; seed: number; moss: number; cold: boolean; ocean: boolean; pocket: boolean; overgrown: boolean; }

export function planRuinedPortal(seed: number, rx: number, rz: number, column: (x: number, z: number) => Column): PortalPlan | null {
  const h = hash2(rx, rz, seed ^ 0x9027a1);
  const r = new Rng(h);
  const x = rx * PORTAL_GRID + r.int(PORTAL_AREA), z = rz * PORTAL_GRID + r.int(PORTAL_AREA);
  const col = column(x, z);
  const giant = r.chance(0.05);
  const d = giant ? GIANT[r.int(GIANT.length)] : D[r.int(D.length)];
  const b = col.biome.id;
  const sh = d.flat ? 2 : d.h;
  const top = col.height;
  let y = top + 1, pocket = false, moss = 0.2, overgrown = false;
  const ocean = top < SEA_LEVEL - 2 && (b === 'ocean' || b === 'deep_ocean' || b === 'river');
  if (ocean) moss = 0.8;
  else if (b === 'desert') { moss = 0; y = top + 1 - sh + 2 + r.int(7); }
  else if (b === 'jungle') { moss = 0.8; overgrown = true; }
  else if (b === 'swamp') moss = 0.5;
  else if (b === 'mountains' || b === 'snowy_mountains') {
    if (r.chance(0.5) && top - sh > 72) { y = 70 + r.int(top - sh - 70); pocket = r.chance(0.5); }
  } else if (r.chance(0.5) && top - sh > 18) { y = 15 + r.int(top - sh - 15); pocket = true; }
  return { x, y, z, rot: r.int(4), d, seed: h, moss, cold: !!col.biome.cold, ocean, pocket, overgrown };
}

interface Vox { x: number; y: number; z: number; v: number; }
const cache = new Map<number, { vox: Vox[]; chest: [number, number, number] | null }>();

function build(p: PortalPlan): { vox: Vox[]; chest: [number, number, number] | null } {
  const hit = cache.get(p.seed);
  if (hit) return hit;
  const r = new Rng(p.seed ^ 0x51ab);
  const d = p.d;
  const m = new Map<string, [number, number, number, string]>();
  const put = (u: number, y: number, w: number, t: string, over = true) => { const k = `${u},${y},${w}`; if (over || !m.has(k)) m.set(k, [u, y, w, t]); };
  const u0 = -d.r, u1 = d.w - 1 + d.r;
  for (let u = u0; u <= u1; u++) for (let w = -d.r; w <= d.r; w++) {
    const edge = Math.max(u < 0 ? -u : u > d.w - 1 ? u - (d.w - 1) : 0, Math.abs(w)) / (d.r || 1);
    if (r.next() < 1.05 - edge * 0.75) put(u, -1, w, r.chance(0.55) ? 'S' : 'N');
    const depth = Math.round((1 - edge) * (3 + d.r) + r.next() * 2);
    for (let k = 2; k <= 1 + depth; k++) put(u, -k, w, 'N');
  }
  for (let i = 0; i < d.lava; i++) { const u = u0 + r.int(u1 - u0 + 1), w = -d.r + r.int(d.r * 2 + 1); if (w !== 0 || u < 0 || u >= d.w) put(u, -1, w, 'L'); }
  for (let u = 0; u < d.w; u++) for (let y = 0; y < d.h; y++) {
    if (!(u === 0 || u === d.w - 1 || y === 0 || y === d.h - 1) || !d.keep(u, y, d.w, d.h)) continue;
    if (d.flat) put(u, 0, y - 2, 'O'); else put(u, y, 0, 'O');
  }
  for (const [u, y, w] of d.fallen ?? []) put(u, y, w, 'O');
  const free = (u: number, w: number) => !m.has(`${u},0,${w}`) && m.has(`${u},-1,${w}`) && m.get(`${u},-1,${w}`)![3] !== 'L';
  const spot = (): [number, number] | null => { for (let i = 0; i < 40; i++) { const u = u0 + r.int(u1 - u0 + 1), w = -d.r + r.int(d.r * 2 + 1); if (free(u, w)) return [u, w]; } return null; };
  let chest: [number, number, number] | null = null;
  const c = spot();
  if (c) { put(c[0], 0, c[1], 'C'); chest = [c[0], 0, c[1]]; }
  for (let i = 0; i < d.gold; i++) { const s = spot(); if (s) put(s[0], 0, s[1], 'G'); }
  for (let i = 0; i < d.pillars; i++) {
    const s = spot();
    if (!s) continue;
    const ph = 1 + r.int(d.w > 5 ? 4 : 2);
    for (let y = 0; y < ph; y++) put(s[0], y, s[1], y === ph - 1 && r.chance(0.5) ? 'X' : 'S');
    if (d.bars > 0) for (let y = ph; y < ph + 1 + r.int(2); y++) put(s[0], y, s[1], 'I');
  }
  for (let i = 0; i < d.stairs; i++) { const s = spot(); if (s) put(s[0], 0, s[1], d.slabs && r.chance(0.4) ? 's' : `t${r.int(4)}`); }

  const vox: Vox[] = [];
  const pr = new Rng(p.seed ^ 0x77);
  const rot = (u: number, w: number): [number, number] => p.rot === 0 ? [u, w] : p.rot === 1 ? [-w, u] : p.rot === 2 ? [-u, -w] : [w, -u];
  const mossy = () => pr.next() < 0.5 * p.moss;
  for (const [u, y, w, t] of m.values()) {
    const [dx, dz] = rot(u - Math.floor(d.w / 2), w);
    let v = 0;
    switch (t[0]) {
      case 'O': v = pr.chance(0.15) ? B.CRYING_OBSIDIAN : B.OBSIDIAN; break;
      case 'N': v = !p.cold && pr.chance(0.07) ? B.MAGMA_BLOCK : X(XV.NETHERRACK); break;
      case 'L': v = p.cold ? X(XV.NETHERRACK) : p.ocean || pr.chance(0.2) ? B.MAGMA_BLOCK : B.LAVA; break;
      case 'G': if (pr.chance(0.3)) continue; v = B.GOLD_BLOCK; break;
      case 'S': v = mossy() ? B.MOSSY_STONE_BRICKS : pr.next() < 0.5 * (1 - p.moss) * 0.3 ? B.CRACKED_STONE_BRICKS : B.STONE_BRICKS; break;
      case 'X': v = B.CHISELED_STONE_BRICKS; break;
      case 'I': v = B.IRON_BARS; break;
      case 'C': v = makeBlock(B.CHEST, pr.int(4)); break;
      case 's': v = makeBlock(B.SLAB, pr.next() < p.moss ? 9 : 7); break;
      case 't': v = makeBlock(B.STAIRS, (mossy() ? 9 : 7) | (((Number(t[1]) + p.rot) & 3) << 5)); break;
    }
    vox.push({ x: p.x + dx, y: p.y + y, z: p.z + dz, v });
  }
  let chestW: [number, number, number] | null = null;
  if (chest) { const [dx, dz] = rot(chest[0] - Math.floor(d.w / 2), chest[2]); chestW = [p.x + dx, p.y, p.z + dz]; }
  const out = { vox, chest: chestW };
  if (cache.size > 24) cache.delete(cache.keys().next().value!);
  cache.set(p.seed, out);
  return out;
}

const NATURAL = new Set<number>([B.STONE, B.DIRT, B.GRASS, B.SAND, B.GRAVEL, B.SANDSTONE, B.SNOWY_GRASS, B.COBBLESTONE]);

export function stampRuinedPortal(p: PortalPlan, bx: number, bz: number, S: number, set: (x: number, y: number, z: number, v: number) => void, get: (x: number, y: number, z: number) => number, entities: GenBlockEntity[]): void {
  const R = p.d.r + p.d.w + 6;
  if (p.x + R < bx || p.x - R >= bx + S || p.z + R < bz || p.z - R >= bz + S) return;
  const { vox, chest } = build(p);
  const sh = p.d.flat ? 2 : p.d.h;
  if (p.pocket) {
    const pr = p.d.w > 5 ? 8 : 6;
    for (let dy = -1; dy <= sh + 2; dy++) for (let dz = -pr; dz <= pr; dz++) for (let dx = -pr; dx <= pr; dx++) {
      const q = (dx * dx + dz * dz) / (pr * pr) + ((dy - sh / 2) * (dy - sh / 2)) / ((sh / 2 + 3) * (sh / 2 + 3));
      if (q > 1) continue;
      const lx = p.x + dx - bx, lz = p.z + dz - bz;
      const cur = get(lx, p.y + dy, lz);
      if (cur > 0 && cur !== B.BEDROCK) set(lx, p.y + dy, lz, 0);
    }
  }
  const SR = p.d.r + 5;
  for (let dz = -SR; dz <= SR; dz++) for (let dx = -SR; dx <= SR; dx++) {
    const lx = p.x + dx - bx, lz = p.z + dz - bz;
    if (lx < 0 || lx >= S || lz < 0 || lz >= S) continue;
    const dist = Math.hypot(dx, dz) / SR;
    for (let dy = -4; dy <= 2; dy++) {
      const cur = get(lx, p.y + dy, lz);
      if (!NATURAL.has(cur & 255)) continue;
      const hsh = (hash2(p.x + dx, (p.z + dz) * 31 + dy, p.seed) & 1023) / 1023;
      if (hsh < 0.85 - dist * 0.9) set(lx, p.y + dy, lz, !p.cold && hsh < 0.04 ? B.MAGMA_BLOCK : X(XV.NETHERRACK));
    }
  }
  for (const v of vox) {
    const lx = v.x - bx, lz = v.z - bz;
    if (lx < 0 || lx >= S || lz < 0 || lz >= S) continue;
    if (v.y >= p.y) set(lx, v.y, lz, v.v);
    else { const cur = get(lx, v.y, lz); if (cur !== B.BEDROCK) set(lx, v.y, lz, v.v); }
  }
  if (p.overgrown) {
    for (let i = 0; i < 26; i++) {
      const hh = hash2(i, p.seed, 99);
      const lx = p.x + (hh % 9) - 4 - bx, lz = p.z + ((hh >>> 8) % 9) - 4 - bz, y = p.y + sh - 1 + ((hh >>> 16) % 3);
      if (get(lx, y, lz) === 0) set(lx, y, lz, B.JUNGLE_LEAVES);
    }
  }
  if (chest) {
    const lx = chest[0] - bx, lz = chest[2] - bz;
    if (lx >= 0 && lx < S && lz >= 0 && lz < S) entities.push({ x: lx, y: chest[1], z: lz, type: 'chest', items: portalLoot(new Rng(p.seed ^ 0x1007)) });
  }
}

export function portalLoot(r: Rng): (ItemStack | null)[] {
  const items: (ItemStack | null)[] = new Array(27).fill(null);
  const gold = (id: number): ItemStack => {
    const ok = ENCHANTS.filter((e) => e.key !== 'wind_burst' && supports(e.key, id));
    const e = ok[r.int(ok.length)];
    return { id, count: 1, en: { [e.key]: 1 + r.int(e.max) } };
  };
  const table: [number, () => ItemStack][] = [
    [40, () => ({ id: I.IRON_NUGGET, count: 9 + r.int(10) })], [40, () => ({ id: I.FLINT, count: 1 + r.int(4) })], [40, () => ({ id: B.OBSIDIAN, count: 1 + r.int(2) })],
    [40, () => ({ id: I.FLINT_AND_STEEL, count: 1 })], [15, () => ({ id: I.GOLD_NUGGET, count: 4 + r.int(21) })], [15, () => ({ id: I.GOLDEN_APPLE, count: 1 })],
    ...[0, 1, 2, 3, 4].map((t) => [15, () => gold(toolId(3, t))] as [number, () => ItemStack]),
    ...[0, 1, 2, 3].map((s) => [15, () => gold(armorId(2, s))] as [number, () => ItemStack]),
    [5, () => ({ id: I.GOLD_INGOT, count: 2 + r.int(7) })], [1, () => ({ id: B.GOLD_BLOCK, count: 1 + r.int(2) })],
  ];
  const total = table.reduce((n, t) => n + t[0], 0);
  const rolls = 4 + r.int(5);
  for (let i = 0; i < rolls; i++) {
    let k = r.int(total);
    for (const [w, mk] of table) { if ((k -= w) < 0) { let slot = r.int(27); for (let q = 0; q < 27 && items[slot]; q++) slot = (slot + 1) % 27; items[slot] = mk(); break; } }
  }
  return items;
}

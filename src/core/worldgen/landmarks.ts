import { SEA_LEVEL, WORLD_HEIGHT, CHUNK_SIZE } from '../constants';
import { B, CB, NB, BLOCKS, SHAPE_MATS, FACING_DIRS, FENCE_BASE, STAIRS2, SLAB_TOP, STAIRS_UP, makeBlock, bid, sp, shapeBlock, terracottaId, woolId, trapdoorMeta, isWaterLike, isDoorBlock, isGate, LANTERN_HANGING, CAMPFIRE_LIT, SPECIES } from '../blocks';
import { I, toolId, armorId } from '../items';
import { Rng, hash2, mix32 } from '../rng';
import type { ItemStack } from '../inventory';
import type { Column, GenBlockEntity } from './WorldGenerator';

export type LandmarkKind = 'desert_pyramid' | 'jungle_temple' | 'swamp_hut' | 'igloo' | 'desert_well' | 'pillager_outpost' | 'shipwreck' | 'ocean_ruin' | 'ocean_monument' | 'dungeon' | 'mineshaft';

export interface Box { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number }
export interface SubSite { u: number; w: number; dy: number; size: number; seed: number }
export interface LandmarkPlan { kind: LandmarkKind; id: string; x: number; y: number; z: number; rot: number; seed: number; variant: number; wet: boolean; bounds: Box; subs?: SubSite[]; biome: string }

interface Spec { grid: number; margin: number; chance: number; salt: number; ext: number; up: number; down: number }
export const LANDMARKS: Record<LandmarkKind, Spec> = {
  desert_pyramid: { grid: 448, margin: 48, chance: 0.75, salt: 0x51a2b3, ext: 16, up: 20, down: 18 },
  jungle_temple: { grid: 448, margin: 48, chance: 0.8, salt: 0x6a7c11, ext: 12, up: 16, down: 8 },
  swamp_hut: { grid: 384, margin: 40, chance: 0.8, salt: 0x2b6e03, ext: 8, up: 10, down: 12 },
  igloo: { grid: 384, margin: 40, chance: 0.75, salt: 0x19c0b1, ext: 8, up: 8, down: 16 },
  desert_well: { grid: 160, margin: 24, chance: 0.35, salt: 0x3e11a0, ext: 4, up: 5, down: 6 },
  pillager_outpost: { grid: 512, margin: 64, chance: 0.4, salt: 0x7f0021, ext: 22, up: 28, down: 10 },
  shipwreck: { grid: 320, margin: 40, chance: 0.7, salt: 0x0c5a11, ext: 18, up: 16, down: 6 },
  ocean_ruin: { grid: 256, margin: 32, chance: 0.7, salt: 0x43d1e9, ext: 22, up: 10, down: 6 },
  ocean_monument: { grid: 640, margin: 80, chance: 0.85, salt: 0x6d0e75, ext: 36, up: 28, down: 40 },
  dungeon: { grid: 56, margin: 8, chance: 0.45, salt: 0x0d6e01, ext: 6, up: 6, down: 2 },
  mineshaft: { grid: 352, margin: 64, chance: 0.6, salt: 0x3a1e5f, ext: 96, up: 24, down: 40 },
};
export const LANDMARK_KINDS = Object.keys(LANDMARKS) as LandmarkKind[];
export const SURFACE_LANDMARKS: LandmarkKind[] = ['desert_pyramid', 'jungle_temple', 'swamp_hut', 'igloo', 'desert_well', 'pillager_outpost', 'shipwreck'];
export const LANDMARK_NAMES: Record<LandmarkKind, string> = {
  desert_pyramid: 'desert pyramid', jungle_temple: 'jungle temple', swamp_hut: 'swamp hut', igloo: 'igloo', desert_well: 'desert well',
  pillager_outpost: 'pillager outpost', shipwreck: 'shipwreck', ocean_ruin: 'ocean ruin', ocean_monument: 'ocean monument', dungeon: 'monster dungeon', mineshaft: 'mineshaft',
};

const SOFT = 1 << 24, SOLID = 1 << 25, FLAGS = SOFT | SOLID;
const AIR = 0;
type Table = [number, number, number, number][];
const S = CHUNK_SIZE;

const OCEANS = new Set(['ocean', 'deep_ocean', 'warm_ocean']);
const OUTPOST_BIOMES = new Set(['plains', 'desert', 'savanna', 'taiga', 'snowy_tundra', 'meadow', 'old_growth_taiga']);

type Probe = (x: number, z: number) => Column;

export function planLandmark(kind: LandmarkKind, secret: number, rx: number, rz: number, probe: Probe, blocked: (x: number, z: number, r: number) => boolean): LandmarkPlan | null {
  const sp0 = LANDMARKS[kind];
  const seed = hash2(rx, rz, secret ^ sp0.salt);
  const r = new Rng(seed);
  if (!r.chance(sp0.chance)) return null;
  const x = rx * sp0.grid + sp0.margin + r.int(sp0.grid - sp0.margin * 2), z = rz * sp0.grid + sp0.margin + r.int(sp0.grid - sp0.margin * 2);
  const rot = r.int(4), variant = r.int(1 << 16);
  const c = probe(x, z), b = c.biome.id, h = c.height;
  const corners = (d: number) => [[-d, -d], [d, -d], [-d, d], [d, d]].map(([dx, dz]) => probe(x + dx, z + dz).height);
  let y = h + 1, wet = false;
  let subs: SubSite[] | undefined;
  switch (kind) {
    case 'desert_pyramid': {
      if (b !== 'desert' || h <= SEA_LEVEL + 1) return null;
      const hs = corners(10);
      if (Math.max(...hs, h) - Math.min(...hs, h) > 6) return null;
      y = Math.min(...hs, h);
      break;
    }
    case 'jungle_temple': {
      if (b !== 'jungle' || h <= SEA_LEVEL + 1) return null;
      const hs = corners(7);
      if (Math.max(...hs, h) - Math.min(...hs, h) > 7) return null;
      y = Math.min(...hs, h) + 1;
      break;
    }
    case 'swamp_hut': {
      if (b !== 'swamp' && b !== 'mangrove_swamp') return null;
      y = Math.max(h, SEA_LEVEL) + 3;
      break;
    }
    case 'igloo': {
      if (b !== 'snowy_tundra' && b !== 'ice_spikes' && b !== 'snowy_mountains') return null;
      if (h <= SEA_LEVEL + 1) return null;
      const hs = corners(4);
      if (Math.max(...hs, h) - Math.min(...hs, h) > 3) return null;
      y = Math.min(...hs, h);
      break;
    }
    case 'desert_well': {
      if (b !== 'desert' || h <= SEA_LEVEL + 1) return null;
      const hs = corners(2);
      if (Math.max(...hs, h) - Math.min(...hs, h) > 1) return null;
      y = h;
      break;
    }
    case 'pillager_outpost': {
      if (!OUTPOST_BIOMES.has(b) || h <= SEA_LEVEL + 1 || h > 130) return null;
      const hs = corners(5);
      if (Math.max(...hs, h) - Math.min(...hs, h) > 5) return null;
      y = Math.min(...hs, h);
      subs = [];
      for (let i = 0, n = 1 + r.int(3); i < n; i++) {
        const a = r.next() * Math.PI * 2, d = 11 + r.int(7);
        const u = Math.round(Math.cos(a) * d), w = Math.round(Math.sin(a) * d);
        const [wx, wz] = rotate(u, w, rot);
        subs.push({ u, w, dy: probe(x + wx, z + wz).height - y, size: r.int(4), seed: r.nextU32() });
      }
      break;
    }
    case 'shipwreck': {
      const beach = b === 'beach';
      if (!beach && !OCEANS.has(b)) return null;
      if (!beach && h > SEA_LEVEL - 6) return null;
      wet = h < SEA_LEVEL;
      y = beach ? h : h - 1 - r.int(2);
      break;
    }
    case 'ocean_ruin': {
      if (!OCEANS.has(b) || h > SEA_LEVEL - 5) return null;
      wet = true;
      y = h;
      subs = [];
      const big = r.chance(0.35);
      subs.push({ u: 0, w: 0, dy: 0, size: big ? 2 : r.int(2), seed: r.nextU32() });
      for (let i = 0, n = big ? 2 + r.int(4) : r.int(3); i < n; i++) {
        const a = r.next() * Math.PI * 2, d = 9 + r.int(10);
        const u = Math.round(Math.cos(a) * d), w = Math.round(Math.sin(a) * d);
        const [wx, wz] = rotate(u, w, rot);
        const hh = probe(x + wx, z + wz).height;
        if (hh > SEA_LEVEL - 3) continue;
        subs.push({ u, w, dy: hh - y, size: r.int(2), seed: r.nextU32() });
      }
      break;
    }
    case 'ocean_monument': {
      if ((b !== 'deep_ocean' && b !== 'ocean') || h > SEA_LEVEL - 10) return null;
      for (const [dx, dz] of [[-32, -32], [32, -32], [-32, 32], [32, 32], [0, -32], [0, 32], [-32, 0], [32, 0]]) {
        const cc = probe(x + dx, z + dz);
        if (!OCEANS.has(cc.biome.id) || cc.height > SEA_LEVEL - 7) return null;
      }
      wet = true;
      y = SEA_LEVEL - 26;
      break;
    }
    case 'dungeon': {
      if (h < 24) return null;
      y = 8 + r.int(Math.max(1, Math.min(48, h - 20)));
      break;
    }
    case 'mineshaft': {
      if (h < 40) return null;
      y = 18 + r.int(Math.max(1, Math.min(28, h - 36)));
      break;
    }
  }
  if (y < 4 || y > WORLD_HEIGHT - sp0.up - 2) return null;
  if (kind !== 'dungeon' && kind !== 'mineshaft' && blocked(x, z, kind === 'pillager_outpost' ? 160 : sp0.ext + 8)) return null;
  const e = sp0.ext;
  return { kind, id: `${kind}:${rx},${rz}`, x, y, z, rot: kind === 'mineshaft' ? 0 : rot, seed, variant, wet, subs, biome: b, bounds: { x0: x - e, y0: y - sp0.down, z0: z - e, x1: x + e, y1: y + sp0.up, z1: z + e } };
}

function rotate(u: number, w: number, r: number): [number, number] {
  switch (r & 3) {
    case 0: return [u, w];
    case 1: return [-w, u];
    case 2: return [-u, -w];
    default: return [w, -u];
  }
}

const D6F = [4, 1, 5, 0], F6D = [3, 1, -1, -1, 0, 2];
const TORCHES = new Set<number>([B.TORCH, B.REDSTONE_TORCH, B.UNLIT_REDSTONE_TORCH, CB.SOUL_TORCH]);

export function rotMeta(v: number, r: number): number {
  if (!r) return v;
  const flags = v & FLAGS;
  v &= ~FLAGS;
  const id = bid(v), m = (v >>> 8) & 0xff;
  const base = v & ~(0xff << 8);
  let nm = m;
  if (id === B.STAIRS || id === STAIRS2) nm = (m & ~(3 << 5)) | ((((m >> 5) & 3) + r) & 3) << 5;
  else if (TORCHES.has(id)) nm = m ? (((m - 1 + r) & 3) + 1) | (m & ~7) : m;
  else if (id === B.OAK_DOOR) nm = (m & ~(3 << 2)) | ((((m >> 2) & 3) + r) & 3) << 2;
  else if (isGate(id)) nm = (m & ~3) | (((m & 3) + r) & 3);
  else if (id === B.DISPENSER || id === B.DROPPER) { const f = F6D[m & 7]; if (f >= 0) nm = (m & ~7) | D6F[(f + r) & 3]; }
  else if (BLOCKS[id]?.orientable) nm = (m & ~3) | (((m & 3) + r) & 3);
  return (base | (nm << 8)) | flags;
}

function shapeIdx(itemId: number): number { return Math.max(0, SHAPE_MATS.findIndex((m) => m.id === itemId)); }
const stairs = (mat: number, face: number, up = false) => shapeBlock(shapeIdx(mat), true, ((face & 3) << 5) | (up ? STAIRS_UP : 0));
const slab = (mat: number, top = false) => shapeBlock(shapeIdx(mat), false, top ? SLAB_TOP : 0);
const fence = (wood = 0) => makeBlock(FENCE_BASE + wood);
const torch = (toward: number) => makeBlock(B.TORCH, toward + 1);
const DARK_OAK_LOG = sp(14, SPECIES.DARK_OAK), DARK_OAK_PLANKS = sp(5, SPECIES.DARK_OAK);

class Build {
  readonly m = new Map<number, number>();
  readonly fills = new Map<number, number>();
  readonly ents: GenBlockEntity[] = [];
  ou = 0; ow = 0;
  constructor(readonly p: LandmarkPlan, readonly r: Rng) {}
  origin(u: number, w: number): this { this.ou = u; this.ow = w; return this; }
  private k(u: number, Y: number, w: number): number { return ((u - this.ou + 512) * 1024 + (w - this.ow + 512)) * 512 + Y; }
  set(u: number, y: number, w: number, v: number): void {
    const Y = this.p.y + y;
    if (Y < 1 || Y >= WORLD_HEIGHT - 1) return;
    this.m.set(this.k(u, Y, w), v);
  }
  get(u: number, y: number, w: number): number | undefined { return this.m.get(this.k(u, this.p.y + y, w)); }
  soft(u: number, y: number, w: number, v: number): void { if (this.get(u, y, w) === undefined) this.set(u, y, w, v | SOFT); }
  box(u0: number, y0: number, w0: number, u1: number, y1: number, w1: number, v: number | ((u: number, y: number, w: number) => number)): void {
    for (let u = Math.min(u0, u1); u <= Math.max(u0, u1); u++) for (let w = Math.min(w0, w1); w <= Math.max(w0, w1); w++) for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) this.set(u, y, w, typeof v === 'number' ? v : v(u, y, w));
  }
  hollow(u0: number, y0: number, w0: number, u1: number, y1: number, w1: number, shell: number | ((u: number, y: number, w: number) => number), inner = AIR): void {
    this.box(u0, y0, w0, u1, y1, w1, (u, y, w) => (u === u0 || u === u1 || w === w0 || w === w1 || y === y0 || y === y1 ? (typeof shell === 'number' ? shell : shell(u, y, w)) : inner));
  }
  found(u: number, y: number, w: number, v: number): void { this.fills.set(this.k(u, this.p.y + y, w), v); }
  chest(u: number, y: number, w: number, f: number, table: Table, id: number = B.CHEST, slots = 27): void {
    this.set(u, y, w, makeBlock(id, f));
    this.ents.push({ x: u - this.ou, y: this.p.y + y, z: w - this.ow, type: 'chest', items: loot(this.r, table, slots) });
  }
  spawner(u: number, y: number, w: number, mob: string): void {
    this.set(u, y, w, B.SPAWNER);
    this.ents.push({ x: u - this.ou, y: this.p.y + y, z: w - this.ow, type: 'spawner', items: [], mob });
  }
  mob(u: number, y: number, w: number, mob: string): void { this.ents.push({ x: u - this.ou, y: this.p.y + y, z: w - this.ow, type: 'mob', items: [], mob }); }
  dispenser(u: number, y: number, w: number, f: number, items: (ItemStack | null)[]): void {
    this.set(u, y, w, makeBlock(B.DISPENSER, D6F[f & 3]));
    this.ents.push({ x: u - this.ou, y: this.p.y + y, z: w - this.ow, type: 'chest', items });
  }
}

function loot(r: Rng, table: Table, slots = 27): (ItemStack | null)[] {
  const items: (ItemStack | null)[] = new Array(slots).fill(null);
  for (const [id, a, b, p] of table) {
    if (!r.chance(p)) continue;
    let slot = r.int(slots);
    for (let k = 0; k < slots && items[slot]; k++) slot = (slot + 1) % slots;
    if (items[slot]) break;
    items[slot] = id === I.ENCHANTED_BOOK ? book(r) : { id, count: a + r.int(b - a + 1) };
  }
  return items;
}

function book(r: Rng): ItemStack {
  const pool: [string, number][] = [['protection', 4], ['sharpness', 5], ['efficiency', 5], ['unbreaking', 3], ['fortune', 3], ['looting', 3], ['feather_falling', 4], ['power', 5], ['respiration', 3], ['aqua_affinity', 1], ['depth_strider', 3], ['mending', 1], ['fire_aspect', 2], ['knockback', 2], ['thorns', 3], ['silk_touch', 1]];
  const [k, max] = pool[r.int(pool.length)];
  return { id: I.ENCHANTED_BOOK, count: 1, en: { [k]: 1 + r.int(max) } };
}

const PYRAMID: Table = [[I.BONE, 4, 6, 0.55], [I.ROTTEN_FLESH, 3, 7, 0.6], [I.GOLD_INGOT, 2, 7, 0.4], [I.IRON_INGOT, 1, 5, 0.4], [I.EMERALD, 1, 3, 0.35], [I.AETHERITE, 1, 3, 0.15], [I.GOLDEN_APPLE, 1, 1, 0.18], [I.ENCHANTED_BOOK, 1, 1, 0.2], [I.SADDLE, 1, 1, 0.18], [I.GUNPOWDER, 1, 8, 0.35], [I.STRING, 1, 8, 0.35], [B.SAND, 1, 8, 0.25]];
const JUNGLE: Table = [[I.BONE, 4, 6, 0.5], [I.ROTTEN_FLESH, 3, 7, 0.55], [I.GOLD_INGOT, 2, 7, 0.4], [I.IRON_INGOT, 1, 5, 0.45], [I.EMERALD, 1, 3, 0.3], [I.AETHERITE, 1, 3, 0.12], [I.SADDLE, 1, 1, 0.15], [I.ENCHANTED_BOOK, 1, 1, 0.15], [I.COCOA_BEANS, 2, 6, 0.4]];
const IGLOO: Table = [[I.APPLE, 1, 3, 0.6], [I.COAL, 1, 4, 0.6], [I.GOLD_NUGGET, 1, 3, 0.5], [toolId(1, 1), 1, 1, 0.3], [I.ROTTEN_FLESH, 1, 1, 0.4], [I.EMERALD, 1, 1, 0.25], [I.WHEAT, 2, 3, 0.4]];
const OUTPOST: Table = [[I.CROSSBOW, 1, 1, 0.5], [I.ARROW, 2, 7, 0.7], [I.WHEAT, 3, 5, 0.6], [I.POTATO, 2, 5, 0.5], [I.CARROT, 3, 5, 0.5], [DARK_OAK_LOG_ITEM(), 2, 3, 0.4], [I.STRING, 1, 6, 0.4], [I.IRON_INGOT, 1, 3, 0.3], [I.EXPERIENCE_BOTTLE, 1, 1, 0.2], [I.ENCHANTED_BOOK, 1, 1, 0.12]];
const SHIP_SUPPLY: Table = [[I.PAPER, 1, 12, 0.6], [I.POTATO, 2, 6, 0.5], [I.COAL, 2, 8, 0.5], [I.CARROT, 4, 8, 0.4], [I.WHEAT, 8, 21, 0.4], [I.ROTTEN_FLESH, 5, 24, 0.4], [armorId(0, 0), 1, 1, 0.2], [armorId(0, 1), 1, 1, 0.2], [B.TNT, 1, 2, 0.15], [B.PUMPKIN, 1, 3, 0.25], [I.GUNPOWDER, 1, 5, 0.3], [I.BAKED_POTATO, 2, 6, 0.3]];
const SHIP_MAP: Table = [[I.PAPER, 1, 10, 0.8], [I.COMPASS, 1, 1, 0.35], [I.BOOK, 1, 5, 0.4], [I.FEATHER, 1, 5, 0.4], [I.CLOCK, 1, 1, 0.12], [I.EMERALD, 1, 2, 0.1]];
const SHIP_TREASURE: Table = [[I.IRON_INGOT, 1, 5, 0.8], [I.GOLD_INGOT, 1, 5, 0.6], [I.EMERALD, 1, 5, 0.5], [I.AETHERITE, 1, 1, 0.12], [I.EXPERIENCE_BOTTLE, 1, 1, 0.3], [I.GOLD_NUGGET, 1, 10, 0.5], [I.IRON_NUGGET, 1, 10, 0.5], [I.LAPIS, 1, 10, 0.4]];
const RUIN: Table = [[I.COAL, 1, 4, 0.6], [I.WHEAT, 2, 3, 0.5], [I.ROTTEN_FLESH, 1, 3, 0.4], [I.GOLD_NUGGET, 1, 3, 0.5], [I.EMERALD, 1, 1, 0.25], [armorId(0, 3), 1, 1, 0.2], [toolId(1, 1), 1, 1, 0.2], [I.GOLDEN_APPLE, 1, 1, 0.06], [I.ENCHANTED_BOOK, 1, 1, 0.12]];
const DUNGEON: Table = [[I.SADDLE, 1, 1, 0.3], [I.BONE, 1, 8, 0.6], [I.ROTTEN_FLESH, 1, 8, 0.5], [I.GUNPOWDER, 1, 8, 0.45], [I.STRING, 1, 8, 0.45], [I.BREAD, 1, 1, 0.4], [I.WHEAT, 1, 4, 0.4], [I.COAL, 1, 4, 0.35], [I.REDSTONE, 1, 4, 0.3], [I.IRON_INGOT, 1, 4, 0.3], [I.GOLD_INGOT, 1, 4, 0.2], [I.GOLDEN_APPLE, 1, 1, 0.12], [I.NAME_TAG, 1, 1, 0.2], [I.ENCHANTED_BOOK, 1, 1, 0.12], [I.BUCKET, 1, 1, 0.12]];
const MINESHAFT: Table = [[I.BREAD, 1, 3, 0.5], [I.COAL, 3, 8, 0.5], [I.IRON_INGOT, 1, 5, 0.45], [I.GOLD_INGOT, 1, 3, 0.25], [I.REDSTONE, 4, 9, 0.3], [I.LAPIS, 4, 9, 0.25], [I.AETHERITE, 1, 2, 0.1], [B.RAIL, 4, 8, 0.4], [B.POWERED_RAIL, 1, 4, 0.2], [B.TORCH, 1, 16, 0.3], [I.GOLDEN_APPLE, 1, 1, 0.06], [I.NAME_TAG, 1, 1, 0.1], [I.ENCHANTED_BOOK, 1, 1, 0.1], [toolId(2, 0), 1, 1, 0.06], [I.BEETROOT_SEEDS, 2, 4, 0.2]];
function DARK_OAK_LOG_ITEM(): number { return 880 + 5; }

function noise(seed: number, u: number, y: number, w: number): number { return (hash2(u * 73 + y * 19, w * 31 - y * 7, seed) & 1023) / 1024; }

function pyramid(b: Build): void {
  const s = b.p.seed;
  b.origin(10, 10);
  const SS = B.SANDSTONE, CUT = B.CUT_SANDSTONE, CH = B.CHISELED_SANDSTONE, OR = terracottaId('orange'), BL = terracottaId('blue');
  for (let u = 0; u <= 20; u++) for (let w = 0; w <= 20; w++) { b.found(u, -1, w, SS); for (let y = -4; y <= 0; y++) b.set(u, y, w, SS); }
  for (let y = 1; y <= 10; y++) {
    const i = y - 1;
    for (let u = i; u <= 20 - i; u++) for (let w = i; w <= 20 - i; w++) {
      const edge = u === i || u === 20 - i || w === i || w === 20 - i;
      b.set(u, y, w, edge ? (y % 3 === 0 ? CUT : SS) : AIR);
    }
  }
  b.set(10, 11, 10, CH);
  for (let y = 1; y <= 4; y++) for (let k = 6; k <= 14; k++) {
    const gap = (k >= 9 && k <= 11) && y <= 3;
    for (const [u, w] of [[k, 6], [k, 14], [6, k], [14, k]]) b.set(u, y, w, gap ? AIR : y === 4 ? CUT : SS);
  }
  for (const [u, w] of [[8, 8], [12, 8], [8, 12], [12, 12]]) for (let y = 1; y <= 6; y++) b.set(u, y, w, y === 3 ? CH : CUT);
  for (let u = 7; u <= 13; u++) for (let w = 7; w <= 13; w++) {
    const d = Math.max(Math.abs(u - 10), Math.abs(w - 10)), m = Math.abs(u - 10) + Math.abs(w - 10);
    b.set(u, 0, w, d === 0 ? BL : m === 1 || d === 3 || (d === 2 && Math.abs(u - 10) === Math.abs(w - 10)) ? OR : SS);
  }
  for (let u = 5; u <= 15; u++) for (let w = 0; w <= 2; w++) for (let y = 1; y <= 6; y++) {
    const top = y === 6 && w === 0;
    b.set(u, y, w, top ? ((u & 1) ? slab(B.SANDSTONE) : CUT) : w === 0 && y === 2 && (u === 7 || u === 13) ? OR : w === 0 && y === 4 ? (u % 2 ? CH : CUT) : SS);
  }
  for (let y = 1; y <= 3; y++) for (let u = 9; u <= 11; u++) for (let w = 0; w <= 5; w++) b.set(u, y, w, AIR);
  for (const u of [8, 12]) for (let y = 1; y <= 3; y++) b.set(u, y, 0, y === 2 ? OR : CUT);
  for (let u = 9; u <= 11; u++) b.set(u, 0, -1, stairs(B.SANDSTONE, 2));
  for (const tu of [0, 16]) {
    for (let u = tu; u <= tu + 4; u++) for (let w = 0; w <= 4; w++) for (let y = 0; y <= 13; y++) {
      const shell = u === tu || u === tu + 4 || w === 0 || w === 4;
      b.set(u, y, w, y === 0 || y === 13 ? SS : shell ? (y === 9 || y === 10 ? OR : y === 11 ? CH : y === 7 ? CUT : SS) : AIR);
    }
    for (const [u, w] of [[tu, 0], [tu + 4, 0], [tu, 4], [tu + 4, 4]]) b.set(u, 14, w, CUT);
    b.set(tu + 2, 14, 0, slab(B.SANDSTONE)); b.set(tu + 2, 14, 4, slab(B.SANDSTONE));
    const lu = tu === 0 ? 1 : tu + 3, wallF = tu === 0 ? 3 : 1;
    for (let y = 1; y <= 13; y++) b.set(lu, y, 2, makeBlock(B.LADDER, wallF));
    const du = tu === 0 ? 4 : tu;
    for (let y = 1; y <= 2; y++) b.set(du, y, 2, AIR);
    for (let y = 1; y <= 2; y++) b.set(du, y, 3, AIR);
  }
  for (let y = -10; y <= -1; y++) b.set(10, y, 10, AIR);
  for (let u = 7; u <= 13; u++) for (let w = 7; w <= 13; w++) for (let y = -15; y <= -10; y++) {
    const shell = u === 7 || u === 13 || w === 7 || w === 13 || y === -14 || y === -10 || y === -15;
    b.set(u, y, w, shell ? ((u + w + y) % 5 === 0 && y > -14 && y < -10 ? OR : CUT) : AIR);
  }
  b.set(10, -10, 10, AIR);
  for (let u = 9; u <= 11; u++) for (let w = 9; w <= 11; w++) b.set(u, -15, w, B.TNT);
  b.set(10, -13, 10, B.STONE_PRESSURE_PLATE);
  const rr = new Rng(mix32(s ^ 0x7e11));
  b.chest(10, -13, 7, 2, PYRAMID); b.chest(10, -13, 13, 0, PYRAMID); b.chest(7, -13, 10, 1, PYRAMID); b.chest(13, -13, 10, 3, PYRAMID);
  for (const [u, w] of [[10, 7], [10, 13], [7, 10], [13, 10]]) { b.set(u, -12, w, CH); b.set(u, -11, w, CH); }
  for (let k = 0; k < 6; k++) { const u = 7 + rr.int(7), w = 1 + rr.int(4); if (b.get(u, 1, w) === AIR) b.set(u, 1, w, B.SAND | SOFT); }
}

function jungleTemple(b: Build): void {
  const s = b.p.seed;
  b.origin(6, 7);
  const cob = (u: number, y: number, w: number) => (noise(s, u, y, w) < 0.42 ? B.MOSSY_COBBLESTONE : B.COBBLESTONE);
  const CH = B.CHISELED_STONE_BRICKS;
  for (let u = 0; u <= 11; u++) for (let w = 0; w <= 14; w++) b.found(u, -6, w, B.COBBLESTONE);
  b.hollow(0, -5, 0, 11, 0, 14, cob);
  b.hollow(0, 0, 0, 11, 5, 14, cob);
  b.hollow(1, 5, 1, 10, 10, 13, cob);
  for (let u = 2; u <= 9; u++) for (let w = 2; w <= 12; w++) b.set(u, 11, w, cob(u, 11, w));
  for (let u = 3; u <= 8; u++) for (let w = 4; w <= 10; w++) b.set(u, 12, w, (u + w) & 1 ? CH : cob(u, 12, w));
  for (let u = 4; u <= 7; u++) for (let w = 6; w <= 8; w++) b.set(u, 13, w, cob(u, 13, w));
  for (let y = 1; y <= 3; y++) for (let u = 5; u <= 6; u++) b.set(u, y, 0, AIR);
  for (let u = 4; u <= 7; u++) b.set(u, 4, 0, CH);
  for (let u = 4; u <= 7; u++) b.set(u, 0, -1, stairs(B.COBBLESTONE, 2));
  for (const w of [3, 7, 11]) for (const u of [0, 11]) { b.set(u, 2, w, AIR); b.set(u, 3, w, AIR); }
  for (const w of [4, 10]) for (const u of [1, 10]) { b.set(u, 7, w, AIR); b.set(u, 8, w, AIR); b.set(u, 9, w, CH); }
  for (const [u, w] of [[4, 3], [7, 3], [4, 11], [7, 11]]) for (let y = 1; y <= 4; y++) b.set(u, y, w, y === 2 ? CH : B.STONE_BRICKS);
  for (const [u, w] of [[4, 4], [7, 4], [4, 10], [7, 10]]) for (let y = 6; y <= 9; y++) b.set(u, y, w, y === 7 ? CH : B.STONE_BRICKS);
  for (let k = 0; k < 4; k++) for (let u = 9; u <= 10; u++) {
    b.set(u, -1 - k, 8 + k, stairs(B.COBBLESTONE, 0));
    for (let y = -k; y <= 0; y++) b.set(u, y, 8 + k, AIR);
  }
  for (let k = 0; k <= 4; k++) for (let u = 2; u <= 3; u++) {
    b.set(u, 1 + k, 8 + k, stairs(B.COBBLESTONE, 2));
    for (let y = 2 + k; y <= Math.min(4 + k, 7); y++) if (y !== 5 || k >= 2) b.set(u, y, 8 + k, AIR);
  }
  for (let u = 1; u <= 10; u++) for (let w = 1; w <= 13; w++) for (let y = -4; y <= -1; y++) {
    const part = u === 4 && !((w === 11 || w === 2) && y <= -3);
    b.set(u, y, w, part ? cob(u, y, w) : AIR);
  }
  for (let k = 0; k < 4; k++) for (let u = 9; u <= 10; u++) b.set(u, -1 - k, 8 + k, stairs(B.COBBLESTONE, 0));
  for (let u = 1; u <= 3; u++) b.set(u, -4, 6, B.STONE_PRESSURE_PLATE);
  b.dispenser(0, -4, 6, 1, arrows(b.r));
  b.dispenser(4, -4, 6, 3, arrows(b.r));
  for (let u = 5; u <= 10; u++) b.set(u, -4, 4, B.STONE_PRESSURE_PLATE);
  b.dispenser(11, -4, 4, 3, arrows(b.r));
  b.dispenser(4, -4, 4, 1, arrows(b.r));
  b.chest(2, -4, 1, 2, JUNGLE);
  b.chest(7, -4, 1, 2, JUNGLE);
  for (const [u, w] of [[1, 1], [3, 1], [5, 1], [10, 1]]) b.set(u, -3, w, CH);
  for (const [u, w, f] of [[2, 13, 2], [7, 13, 2], [1, 9, 3], [10, 6, 1]]) b.set(u, -2, w, torch(f));
  for (let k = 0; k < 160; k++) {
    const side = b.r.int(4), y = b.r.int(13), t = b.r.int(15);
    const [u, w, f] = side === 0 ? [Math.min(11, t), -1, 2] : side === 1 ? [Math.min(11, t), 15, 0] : side === 2 ? [-1, t, 1] : [12, t, 3];
    if (y <= 5 || (y <= 10 && u >= 1 && u <= 10 && w >= 1 && w <= 13)) b.soft(u, y, w, makeBlock(B.VINE, f));
  }
}

function arrows(r: Rng): (ItemStack | null)[] {
  const it: (ItemStack | null)[] = new Array(9).fill(null);
  it[r.int(9)] = { id: I.ARROW, count: 2 + r.int(6) };
  return it;
}

function swampHut(b: Build): void {
  b.origin(3, 4);
  const P = B.SPRUCE_PLANKS, LOG = B.OAK_LOG;
  for (const [u, w] of [[1, 2], [5, 2], [1, 7], [5, 7]]) { b.found(u, -1, w, LOG); for (let y = -2; y <= 0; y++) b.set(u, y, w, LOG); }
  for (let u = 0; u <= 6; u++) for (let w = 0; w <= 8; w++) b.set(u, 0, w, P);
  for (let u = 1; u <= 5; u++) for (let w = 2; w <= 7; w++) for (let y = 1; y <= 3; y++) {
    const corner = (u === 1 || u === 5) && (w === 2 || w === 7), edge = u === 1 || u === 5 || w === 2 || w === 7;
    b.set(u, y, w, corner ? LOG : edge ? P : AIR);
  }
  b.set(3, 1, 2, AIR); b.set(3, 2, 2, AIR);
  for (const [u, w] of [[1, 4], [5, 4], [1, 5], [5, 5], [3, 7]]) b.set(u, 2, w, fence());
  for (const u of [0, 6]) for (let w = 0; w <= 1; w++) b.set(u, 1, w, fence());
  for (let u = 1; u <= 5; u++) b.set(u, 1, 0, u === 3 ? AIR : fence());
  for (const [u, w] of [[1, 0], [5, 0]]) b.set(u, 2, w, fence());
  for (let w = 1; w <= 8; w++) { b.set(0, 4, w, stairs(B.SPRUCE_PLANKS, 1)); b.set(6, 4, w, stairs(B.SPRUCE_PLANKS, 3)); for (let u = 1; u <= 5; u++) b.set(u, 4, w, P); }
  for (let w = 1; w <= 8; w++) { b.set(1, 5, w, stairs(B.SPRUCE_PLANKS, 1)); b.set(5, 5, w, stairs(B.SPRUCE_PLANKS, 3)); for (let u = 2; u <= 4; u++) b.set(u, 5, w, slab(B.SPRUCE_PLANKS)); }
  for (const w of [0, 9]) for (let u = 0; u <= 6; u++) b.set(u, 4, w, stairs(B.SPRUCE_PLANKS, w === 0 ? 2 : 0, true));
  b.set(4, 1, 6, B.CAULDRON);
  b.set(2, 1, 6, B.WORKBENCH);
  b.set(2, 1, 3, B.BREWING_STAND);
  b.set(4, 1, 3, B.RED_MUSHROOM);
  b.set(3, 3, 5, makeBlock(B.LANTERN, LANTERN_HANGING));
}

function igloo(b: Build): void {
  b.origin(0, 0);
  const SN = B.SNOW;
  for (let u = -5; u <= 5; u++) for (let w = -5; w <= 5; w++) if (u * u + w * w <= 26) b.found(u, -1, w, SN);
  for (let y = 0; y <= 5; y++) for (let u = -5; u <= 5; u++) for (let w = -5; w <= 5; w++) {
    const o = (u * u + w * w) / 21 + (y * y) / 22, i = (u * u + w * w) / 11 + ((y - 0.3) * (y - 0.3)) / 14;
    if (y === 0 && u * u + w * w <= 21) b.set(u, 0, w, SN);
    else if (o <= 1) b.set(u, y, w, i < 1 ? AIR : SN);
  }
  for (let y = 1; y <= 2; y++) for (let w = -7; w <= -3; w++) b.set(0, y, w, AIR);
  for (let w = -7; w <= -4; w++) { b.set(-1, 1, w, SN); b.set(1, 1, w, SN); b.set(-1, 2, w, SN); b.set(1, 2, w, SN); b.set(0, 3, w, SN); b.set(0, 0, w, SN); b.found(0, -1, w, SN); }
  b.set(-4, 2, 0, B.ICE); b.set(4, 2, 0, B.ICE);
  for (let u = -3; u <= 3; u++) for (let w = -3; w <= 3; w++) if (u * u + w * w <= 10) b.set(u, 0, w, woolId('white'));
  b.set(-2, 1, 2, makeBlock(B.FURNACE, 0));
  b.set(2, 1, 2, makeBlock(B.WORKBENCH));
  b.set(0, 1, 3, woolId('red'));
  b.set(-1, 1, 3, woolId('red'));
  b.set(2, 2, -1, torch(1));
  if ((b.p.variant & 3) === 0) return;
  b.set(1, 0, 0, makeBlock(B.OAK_DOOR, trapdoorMeta(8, 0, true, false)));
  for (let y = -9; y <= -1; y++) {
    for (let du = -1; du <= 1; du++) for (let dw = -1; dw <= 1; dw++) if (du || dw) b.set(1 + du, y, dw, B.STONE_BRICKS);
    b.set(1, y, 0, makeBlock(B.LADDER, 2));
  }
  const brick = (u: number, y: number, w: number) => (noise(b.p.seed, u, y, w) < 0.3 ? B.MOSSY_STONE_BRICKS : noise(b.p.seed ^ 9, u, y, w) < 0.2 ? B.CRACKED_STONE_BRICKS : B.STONE_BRICKS);
  b.hollow(-3, -13, -3, 5, -9, 6, brick);
  for (let y = -12; y <= -9; y++) b.set(1, y, 0, makeBlock(B.LADDER, 2));
  for (let y = -12; y <= -10; y++) {
    b.set(1, y, 1, brick(1, y, 1));
    for (const u of [-2, -1, 3, 4]) b.set(u, y, 3, makeBlock(B.IRON_BARS));
    for (const u of [0, 2]) for (let w = 3; w <= 5; w++) b.set(u, y, w, brick(u, y, w));
  }
  b.mob(-2, -12, 4, 'villager');
  b.mob(4, -12, 4, 'hollowed');
  b.set(-2, -12, -2, B.BREWING_STAND);
  b.set(4, -12, -2, B.CAULDRON);
  b.set(-2, -12, 1, B.WORKBENCH);
  b.chest(1, -12, 5, 0, IGLOO);
  b.set(4, -10, 0, torch(1));
  b.set(-2, -10, -1, torch(3));
  for (let u = -2; u <= 4; u++) for (let w = -2; w <= 2; w++) if (!(u === 1 && w <= 1 && w >= 0) && b.r.chance(0.08)) b.set(u, -12, w, woolId('white'));
}

function well(b: Build): void {
  b.origin(0, 0);
  for (let u = -2; u <= 2; u++) for (let w = -2; w <= 2; w++) { b.found(u, -1, w, B.SANDSTONE); b.set(u, -1, w, B.SANDSTONE); b.set(u, 0, w, B.SANDSTONE); }
  for (let y = -4; y <= 0; y++) b.set(0, y, 0, B.WATER);
  for (let y = -5; y <= -1; y++) for (const [u, w] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) b.set(u, y, w, B.SANDSTONE);
  b.set(0, -5, 0, B.SANDSTONE);
  for (let u = -2; u <= 2; u++) for (let w = -2; w <= 2; w++) if (Math.abs(u) === 2 || Math.abs(w) === 2) b.set(u, 1, w, u === 0 || w === 0 ? AIR : slab(B.SANDSTONE));
  for (const [u, w] of [[1, 1], [-1, -1], [1, -1], [-1, 1]]) { b.set(u, 1, w, B.SANDSTONE); b.set(u, 2, w, B.SANDSTONE); }
  for (let u = -1; u <= 1; u++) for (let w = -1; w <= 1; w++) b.set(u, 3, w, u === 0 && w === 0 ? B.SANDSTONE : slab(B.SANDSTONE));
}

function outpost(b: Build): void {
  b.origin(4, 4);
  const LOG = DARK_OAK_LOG, PL = DARK_OAK_PLANKS, BIR = B.BIRCH_PLANKS, COB = B.COBBLESTONE;
  for (let u = 0; u <= 8; u++) for (let w = 0; w <= 8; w++) { b.found(u, -1, w, COB); b.set(u, 0, w, COB); }
  for (let y = 1; y <= 18; y++) for (let u = 0; u <= 8; u++) for (let w = 0; w <= 8; w++) {
    const cu = u === 0 || u === 8, cw = w === 0 || w === 8;
    const floor = y === 5 || y === 10 || y === 15;
    if (cu && cw) b.set(u, y, w, LOG);
    else if (cu || cw) {
      const mid = (u === 4 || w === 4) && (y % 5 === 2 || y % 5 === 3);
      b.set(u, y, w, y <= 4 ? (noise(b.p.seed, u, y, w) < 0.3 ? B.MOSSY_COBBLESTONE : COB) : mid ? fence(5) : floor ? LOG : BIR);
    } else b.set(u, y, w, floor ? PL : AIR);
  }
  for (let y = 1; y <= 2; y++) b.set(4, y, 0, AIR);
  for (let y = 1; y <= 19; y++) b.set(1, y, 4, makeBlock(B.LADDER, 3));
  for (let u = -1; u <= 9; u++) for (let w = -1; w <= 9; w++) {
    const edge = u === -1 || u === 9 || w === -1 || w === 9;
    b.set(u, 19, w, u === 1 && w === 4 ? makeBlock(B.LADDER, 3) : PL);
    if (edge) b.set(u, 20, w, fence(5));
    else for (let y = 20; y <= 22; y++) b.set(u, y, w, AIR);
    b.set(u, 23, w, edge ? stairs(XB_DARK_OAK(), u === -1 ? 1 : u === 9 ? 3 : w === -1 ? 2 : 0, true) : PL);
  }
  b.set(1, 19, 4, makeBlock(B.LADDER, 3));
  for (const [u, w] of [[-1, -1], [9, -1], [-1, 9], [9, 9]]) for (let y = 20; y <= 22; y++) b.set(u, y, w, LOG);
  for (let u = 0; u <= 8; u++) for (let w = 0; w <= 8; w++) {
    const d = Math.max(Math.abs(u - 4), Math.abs(w - 4));
    if (d <= 3) b.set(u, 24, w, d === 3 ? slab(XB_DARK_OAK()) : PL);
    if (d <= 1) b.set(u, 25, w, d === 1 ? slab(XB_DARK_OAK()) : PL);
  }
  b.chest(4, 20, 6, 0, OUTPOST);
  b.set(4, 20, 2, B.WORKBENCH);
  b.set(6, 21, 6, makeBlock(B.LANTERN));
  b.set(6, 20, 6, PL);
  b.set(2, 22, 2, makeBlock(B.LANTERN, LANTERN_HANGING));
  for (const sub of b.p.subs ?? []) outpostFeature(b, sub);
}

function XB_DARK_OAK(): number { return 880 + 4; }

function outpostFeature(b: Build, sub: SubSite): void {
  const r = new Rng(sub.seed);
  const u0 = sub.u + 4, w0 = sub.w + 4, y0 = sub.dy;
  switch (sub.size) {
    case 0: {
      for (let u = -1; u <= 1; u++) for (let w = -1; w <= 1; w++) { b.found(u0 + u, y0 - 1, w0 + w, B.COBBLESTONE); b.set(u0 + u, y0, w0 + w, DARK_OAK_PLANKS); }
      for (let u = -1; u <= 1; u++) for (let w = -1; w <= 1; w++) for (let y = 1; y <= 3; y++) b.set(u0 + u, y0 + y, w0 + w, u || w ? makeBlock(B.IRON_BARS) : AIR);
      for (let u = -1; u <= 1; u++) for (let w = -1; w <= 1; w++) b.set(u0 + u, y0 + 4, w0 + w, DARK_OAK_PLANKS);
      b.mob(u0, y0 + 1, w0, 'villager');
      break;
    }
    case 1: {
      for (let k = 0; k < 3; k++) {
        const u = u0 + k * 2 - 2;
        b.found(u, y0, w0, B.DIRT);
        b.set(u, y0 + 1, w0, fence(5));
        b.set(u, y0 + 2, w0, B.HAY_BLOCK);
        b.set(u, y0 + 3, w0, B.PUMPKIN);
      }
      break;
    }
    case 2: {
      for (let u = -2; u <= 2; u++) for (let w = -2; w <= 2; w++) { const h = 3 - Math.abs(u); b.found(u0 + u, y0, w0 + w, B.DIRT); b.set(u0 + u, y0 + h, w0 + w, woolId(w === -2 || w === 2 ? 'gray' : 'white')); }
      for (const w of [-2, 2]) for (let u = -1; u <= 1; u++) for (let y = 1; y < 3 - Math.abs(u); y++) if (!(w === -2 && u === 0)) b.set(u0 + u, y0 + y, w0 + w, woolId('white'));
      b.set(u0, y0 + 1, w0 + 1, makeBlock(CB.CAMPFIRE, CAMPFIRE_LIT));
      break;
    }
    default: {
      for (let k = 0, n = 3 + r.int(4); k < n; k++) {
        const u = u0 + r.int(3) - 1, w = w0 + r.int(3) - 1;
        b.found(u, y0, w, B.DIRT);
        for (let y = 1; y <= 1 + r.int(2); y++) b.set(u, y0 + y, w, DARK_OAK_LOG);
      }
    }
  }
}

const WOODS: [number, number, number, number][] = [
  [B.OAK_PLANKS, B.OAK_LOG, 0, B.OAK_PLANKS],
  [B.SPRUCE_PLANKS, B.SPRUCE_LOG, 1, B.SPRUCE_PLANKS],
  [DARK_OAK_PLANKS, DARK_OAK_LOG, 5, 880 + 4],
  [B.BIRCH_PLANKS, B.BIRCH_LOG, 2, B.BIRCH_PLANKS],
];

function shipwreck(b: Build): void {
  const r = b.r, v = b.p.variant;
  const [PL, LOG, fw, mat] = WOODS[v % WOODS.length];
  const L = 22 + (v >> 3) % 7;
  const keep = (v >> 6) % 5;
  const tilt = b.p.biome === 'beach' ? 0 : (v >> 9) % 3;
  b.origin(0, Math.floor(L / 2));
  const hwAt = (w: number) => (w < 5 ? 1 + Math.floor(w * 0.55) : w > L - 4 ? 3 - Math.floor((w - (L - 4)) * 0.4) : 3);
  const kept = (w: number) => keep === 1 ? w < L * 0.55 : keep === 2 ? w > L * 0.45 : true;
  const lift = (u: number) => (tilt === 1 ? Math.floor(Math.max(0, u) / 2) : tilt === 2 ? Math.floor(Math.max(0, -u) / 2) : 0);
  const put = (u: number, y: number, w: number, val: number) => { if (kept(w) && !(val !== AIR && r.chance(0.07))) b.set(u, y + lift(u), w, val); };
  for (let w = 0; w < L; w++) {
    const hw = hwAt(w);
    for (let y = 0; y <= 4; y++) {
      const hy = y === 0 ? Math.max(0, hw - 2) : y === 1 ? hw - 1 : hw;
      for (let u = -hy; u <= hy; u++) {
        const side = Math.abs(u) === hy || y === 0 || w === 0 || w === L - 1;
        put(u, y, w, y === 4 ? (Math.abs(u) === hy ? LOG : PL) : side ? PL : AIR);
      }
    }
    for (const u of [-hw, hw]) put(u, 5, w, fence(fw));
  }
  for (let w = 0; w < 4; w++) { const hw = hwAt(w); for (let u = -hw + 1; u <= hw - 1; u++) put(u, 5, w, PL); }
  for (let w = L - 7; w < L; w++) {
    const hw = hwAt(w);
    for (let y = 5; y <= 8; y++) for (let u = -hw; u <= hw; u++) {
      const edge = Math.abs(u) === hw || w === L - 7 || w === L - 1;
      put(u, y, w, y === 8 ? (Math.abs(u) === hw ? stairs(mat, u < 0 ? 1 : 3, true) : PL) : edge ? (y === 6 && !(w === L - 7 && u === 0) && (w + u) % 3 === 0 ? makeBlock(B.GLASS) : PL) : AIR);
    }
    for (const u of [-hw, hw]) put(u, 9, w, fence(fw));
  }
  for (let y = 5; y <= 6; y++) put(0, y, L - 7, AIR);
  put(0, 4, 11, AIR); put(1, 4, 11, AIR);
  const masts = [[9, 13 - (v % 4)], [L - 10, 11 - ((v >> 2) % 5)]];
  for (const [mw, mh] of masts) {
    for (let y = 1; y <= mh; y++) put(0, y, mw, LOG);
    if (mh >= 10) for (let u = -3; u <= 3; u++) put(u, mh - 2, mw, fence(fw));
  }
  for (let u = -1; u <= 1; u++) put(u, 5, -1, stairs(mat, 0));
  const ch = (u: number, y: number, w: number, f: number, t: Table) => { if (kept(w)) b.chest(u, y + lift(u), w, f, t); };
  ch(0, 1, 3, 2, SHIP_SUPPLY);
  ch(-1, 5, L - 3, 1, SHIP_MAP);
  ch(1, 1, Math.floor(L / 2) + 2, 3, SHIP_TREASURE);
}

function oceanRuin(b: Build): void {
  const warm = b.p.biome === 'warm_ocean';
  b.origin(0, 0);
  for (const sub of b.p.subs ?? []) ruinRoom(b, sub, warm);
}

function ruinRoom(b: Build, sub: SubSite, warm: boolean): void {
  const r = new Rng(sub.seed);
  const n = sub.size === 2 ? 6 : sub.size === 1 ? 4 : 3;
  const h = sub.size === 2 ? 6 : 4;
  const stone = (u: number, y: number, w: number) => {
    const t = noise(sub.seed, u, y, w);
    if (warm) return t < 0.25 ? B.CUT_SANDSTONE : t < 0.33 ? B.CHISELED_SANDSTONE : B.SANDSTONE;
    return t < 0.3 ? B.MOSSY_STONE_BRICKS : t < 0.45 ? B.CRACKED_STONE_BRICKS : t < 0.5 ? B.CHISELED_STONE_BRICKS : B.STONE_BRICKS;
  };
  const decay = (u: number, y: number, w: number) => noise(sub.seed ^ 0x5d, u, y, w) < 0.18 + y * 0.09;
  const cu = sub.u, cw = sub.w, y0 = sub.dy;
  for (let u = -n; u <= n; u++) for (let w = -n; w <= n; w++) {
    b.found(cu + u, y0 - 1, cw + w, warm ? B.SAND : B.GRAVEL);
    b.set(cu + u, y0, cw + w, (u + w) & 1 && !warm ? B.GRAVEL : stone(u, 0, w));
    const edge = Math.abs(u) === n || Math.abs(w) === n;
    for (let y = 1; y <= h; y++) {
      if (edge) { if (!decay(u, y, w) && !(y <= 2 && u === 0 && w === -n)) b.set(cu + u, y0 + y, cw + w, stone(u, y, w)); }
      else b.set(cu + u, y0 + y, cw + w, AIR);
    }
    if (sub.size === 2 && !edge && Math.abs(u) === Math.floor(n / 2) && Math.abs(w) === Math.floor(n / 2)) for (let y = 1; y <= h; y++) b.set(cu + u, y0 + y, cw + w, stone(u, y, w));
    if (sub.size >= 1 && !decay(u, h + 1, w) && noise(sub.seed ^ 0x77, u, h, w) < 0.45) b.set(cu + u, y0 + h + 1, cw + w, stone(u, h + 1, w));
  }
  if (sub.size === 2) for (let w = -n + 1; w < n; w++) for (let y = 1; y <= 3; y++) if (w !== 0 && !decay(0, y, w)) b.set(cu, y0 + y, cw + w, stone(0, y, w));
  if (sub.size === 2 || r.chance(0.35)) b.chest(cu + (r.chance(0.5) ? 1 : -1), y0 + 1, cw + n - 1, 0, RUIN);
  if (!warm && r.chance(0.5)) b.set(cu, y0 + 1, cw, B.MAGMA_BLOCK);
}

function monument(b: Build): void {
  b.origin(29, 29);
  const P = makeBlock(NB.PRISMARINE), PB = makeBlock(NB.PRISMARINE_BRICKS), DP = makeBlock(NB.DARK_PRISMARINE), SL = makeBlock(NB.SEA_LANTERN);
  const rough = (u: number, y: number, w: number) => (noise(b.p.seed, u, y, w) < 0.18 ? PB : P);
  for (let u = -4; u <= 62; u++) for (let w = -4; w <= 62; w++) for (let y = 0; y <= 22; y++) b.set(u, y, w, AIR);
  for (let u = 0; u <= 58; u++) for (let w = 0; w <= 58; w++) {
    b.set(u, 0, w, PB);
    const leg = (u % 7 === 1 && w % 7 === 1) || ((u <= 1 || u >= 57) && (w <= 1 || w >= 57));
    if (leg || u === 0 || u === 58 || w === 0 || w === 58) b.found(u, -1, w, PB);
  }
  for (let y = 1; y <= 8; y++) for (let u = 0; u <= 58; u++) for (let w = 0; w <= 58; w++) {
    const outer = u <= 1 || u >= 57 || w <= 1 || w >= 57;
    const grid = (u - 1) % 8 === 0 || (w - 1) % 8 === 0;
    const door = (Math.abs(((u - 1) % 8) - 4) <= 1 || Math.abs(((w - 1) % 8) - 4) <= 1) && y <= 4;
    if (outer) b.set(u, y, w, y === 4 && (u + w) % 8 === 4 ? SL : y === 8 ? DP : rough(u, y, w));
    else if (grid && !door && y < 8) b.set(u, y, w, rough(u, y, w));
    else b.set(u, y, w, y === 8 ? PB : AIR);
  }
  for (let y = 1; y <= 6; y++) for (let u = 25; u <= 33; u++) for (let w = 0; w <= 10; w++) {
    const pillar = (u === 25 || u === 33) && w % 3 === 0;
    b.set(u, y, w, pillar ? PB : u >= 26 && u <= 32 && y <= 5 ? AIR : b.get(u, y, w) ?? AIR);
  }
  for (let u = 24; u <= 34; u++) { b.set(u, 7, 0, DP); b.set(u, 7, 1, u === 29 ? SL : DP); }
  for (const [ua, ub] of [[2, 14], [44, 56]]) for (let y = 9; y <= 14; y++) for (let u = ua; u <= ub; u++) for (let w = 6; w <= 52; w++) {
    const k = y - 9, i0 = ua + k, i1 = ub - k, j0 = 6 + k, j1 = 52 - k;
    if (u < i0 || u > i1 || w < j0 || w > j1) continue;
    const edge = u === i0 || u === i1 || w === j0 || w === j1;
    b.set(u, y, w, edge ? (y === 11 && w % 6 === 0 ? SL : rough(u, y, w)) : y === 14 ? PB : AIR);
  }
  for (let y = 9; y <= 17; y++) for (let u = 15; u <= 43; u++) for (let w = 6; w <= 52; w++) {
    const edge = u === 15 || u === 43 || w === 6 || w === 52;
    if (edge) b.set(u, y, w, y === 13 ? DP : y === 11 && (u + w) % 6 === 0 ? SL : rough(u, y, w));
    else b.set(u, y, w, y === 17 ? PB : (u - 15) % 7 === 0 && (w - 6) % 7 === 0 ? PB : AIR);
  }
  for (let y = 18; y <= 24; y++) {
    const k = Math.max(0, y - 21);
    for (let u = 20 + k; u <= 38 - k; u++) for (let w = 20 + k; w <= 38 - k; w++) {
      const edge = u === 20 + k || u === 38 - k || w === 20 + k || w === 38 - k;
      b.set(u, y, w, edge ? (y === 20 && (u + w) % 4 === 0 ? SL : y === 22 ? DP : rough(u, y, w)) : y === 24 ? DP : AIR);
    }
  }
  for (let u = 27; u <= 31; u++) for (let w = 27; w <= 31; w++) b.set(u, 25, w, Math.abs(u - 29) + Math.abs(w - 29) <= 1 ? SL : PB);
  for (let y = 9; y <= 12; y++) for (let u = 26; u <= 32; u++) for (let w = 26; w <= 32; w++) {
    const core = u >= 28 && u <= 30 && w >= 28 && w <= 30 && y >= 10 && y <= 11;
    b.set(u, y, w, core && !(u === 29 && w === 29 && y === 11) ? B.GOLD_BLOCK : DP);
  }
  b.set(29, 11, 29, SL);
  for (const [u, w] of [[20, 20], [38, 20], [20, 38], [38, 38]]) for (let y = 18; y <= 25; y++) b.set(u, y, w, y === 25 ? SL : DP);
  for (let w = 6; w <= 10; w++) for (let y = 9; y <= 11; y++) for (let u = 27; u <= 31; u++) b.set(u, y, w, AIR);
  for (let u = 26; u <= 32; u++) b.set(u, 12, 6, DP);
  for (const u of [8, 50]) for (const w of [4, 54]) for (let y = 9; y <= 13; y++) b.set(u, y, w, y === 13 ? SL : PB);
}

function dungeon(b: Build): void {
  const v = b.p.variant;
  const hx = 2 + (v & 1), hz = 2 + ((v >> 1) & 1);
  b.origin(0, 0);
  for (let u = -hx - 1; u <= hx + 1; u++) for (let w = -hz - 1; w <= hz + 1; w++) for (let y = -1; y <= 4; y++) {
    const shell = u === -hx - 1 || u === hx + 1 || w === -hz - 1 || w === hz + 1 || y === -1 || y === 4;
    if (!shell) { b.set(u, y, w, AIR); continue; }
    const mossy = noise(b.p.seed, u, y, w) < (y === -1 ? 0.6 : 0.25);
    b.set(u, y, w, (mossy ? B.MOSSY_COBBLESTONE : B.COBBLESTONE) | SOLID);
  }
  const mob = ['hollowed', 'hollowed', 'rattlebone', 'duskweaver'][(v >> 2) & 3];
  b.spawner(0, 0, 0, mob);
  const spots: [number, number, number][] = [[-hx, 0, 1], [hx, 0, 3], [0, -hz, 2], [0, hz, 0]];
  const n = 1 + ((v >> 4) & 1);
  for (let i = 0; i < n; i++) {
    const [u, w, f] = spots[((v >> 5) + i * 2) & 3];
    b.chest(u, 0, w, f, DUNGEON);
  }
}

interface Shaft { kind: 'room' | 'corridor' | 'cross' | 'stairs'; box: Box; axis: 0 | 1; dir: number; seed: number }

function mineshaft(b: Build): void {
  const r = b.r;
  b.origin(0, 0);
  const pieces: Shaft[] = [];
  const hit = (q: Box) => pieces.some((p) => p.box.x0 <= q.x1 && p.box.x1 >= q.x0 && p.box.y0 <= q.y1 && p.box.y1 >= q.y0 && p.box.z0 <= q.z1 && p.box.z1 >= q.z0);
  const rw = 5 + r.int(3), rd = 5 + r.int(3), rh = 4 + r.int(3);
  const room: Shaft = { kind: 'room', box: { x0: -rw, y0: 0, z0: -rd, x1: rw, y1: rh, z1: rd }, axis: 0, dir: 0, seed: r.nextU32() };
  pieces.push(room);
  const open: { x: number; y: number; z: number; dir: number; depth: number }[] = [];
  for (let d = 0; d < 4; d++) for (let k = 0, n = 1 + r.int(2); k < n; k++) {
    const [dx, dz] = FACING_DIRS[d];
    const off = r.int(Math.max(1, (dx ? rd : rw) * 2 - 3)) - ((dx ? rd : rw) - 2);
    open.push({ x: dx ? (dx > 0 ? rw + 1 : -rw - 1) : off, y: r.int(Math.max(1, rh - 2)), z: dz ? (dz > 0 ? rd + 1 : -rd - 1) : off, dir: d, depth: 0 });
  }
  while (open.length && pieces.length < 80) {
    const o = open.shift()!;
    if (o.depth > 8 || Math.hypot(o.x, o.z) > 84 || o.y < -30 || o.y + b.p.y < 6) continue;
    const [dx, dz] = FACING_DIRS[o.dir];
    const roll = r.next();
    if (roll < 0.62 || o.depth === 0) {
      const len = 5 * (2 + r.int(5));
      const x0 = o.x, z0 = o.z, x1 = o.x + dx * (len - 1), z1 = o.z + dz * (len - 1);
      const box: Box = dx ? { x0: Math.min(x0, x1), x1: Math.max(x0, x1), y0: o.y - 1, y1: o.y + 3, z0: o.z - 1, z1: o.z + 1 } : { x0: o.x - 1, x1: o.x + 1, y0: o.y - 1, y1: o.y + 3, z0: Math.min(z0, z1), z1: Math.max(z0, z1) };
      if (hit(box)) continue;
      pieces.push({ kind: 'corridor', box, axis: dx ? 0 : 1, dir: o.dir, seed: r.nextU32() });
      open.push({ x: x1 + dx, y: o.y, z: z1 + dz, dir: o.dir, depth: o.depth + 1 });
      if (r.chance(0.35)) { const t = r.int(len - 4) + 2; const sd = (o.dir + (r.chance(0.5) ? 1 : 3)) & 3; const [sx, sz] = FACING_DIRS[sd]; open.push({ x: o.x + dx * t + sx * 2, y: o.y, z: o.z + dz * t + sz * 2, dir: sd, depth: o.depth + 1 }); }
    } else if (roll < 0.82) {
      const tall = r.chance(0.25);
      const cx = o.x + dx * 2, cz = o.z + dz * 2;
      const box: Box = { x0: cx - 2, x1: cx + 2, y0: o.y - 1, y1: o.y + (tall ? 7 : 3), z0: cz - 2, z1: cz + 2 };
      if (hit(box)) continue;
      pieces.push({ kind: 'cross', box, axis: 0, dir: o.dir, seed: r.nextU32() });
      for (const nd of [o.dir, (o.dir + 1) & 3, (o.dir + 3) & 3]) {
        const [nx, nz] = FACING_DIRS[nd];
        open.push({ x: cx + nx * 3, y: o.y, z: cz + nz * 3, dir: nd, depth: o.depth + 1 });
        if (tall && r.chance(0.5)) open.push({ x: cx + nx * 3, y: o.y + 4, z: cz + nz * 3, dir: nd, depth: o.depth + 1 });
      }
    } else {
      const steps = 4 + r.int(3);
      const x1 = o.x + dx * (steps + 1), z1 = o.z + dz * (steps + 1);
      const box: Box = dx ? { x0: Math.min(o.x, x1), x1: Math.max(o.x, x1), y0: o.y - steps - 1, y1: o.y + 3, z0: o.z - 1, z1: o.z + 1 } : { x0: o.x - 1, x1: o.x + 1, y0: o.y - steps - 1, y1: o.y + 3, z0: Math.min(o.z, z1), z1: Math.max(o.z, z1) };
      if (hit(box)) continue;
      pieces.push({ kind: 'stairs', box, axis: dx ? 0 : 1, dir: o.dir, seed: r.nextU32() });
      open.push({ x: x1 + dx, y: o.y - steps, z: z1 + dz, dir: o.dir, depth: o.depth + 1 });
    }
  }
  const PL = B.OAK_PLANKS;
  for (const p of pieces) {
    const q = p.box, pr = new Rng(p.seed);
    if (p.kind === 'room') {
      for (let u = q.x0; u <= q.x1; u++) for (let w = q.z0; w <= q.z1; w++) {
        b.set(u, q.y0 - 1, w, B.DIRT | SOFT);
        for (let y = q.y0; y <= q.y1; y++) b.set(u, y, w, AIR);
      }
      continue;
    }
    if (p.kind === 'cross') {
      for (let u = q.x0; u <= q.x1; u++) for (let w = q.z0; w <= q.z1; w++) {
        b.set(u, q.y0, w, PL | SOFT);
        for (let y = q.y0 + 1; y <= q.y1; y++) b.set(u, y, w, AIR);
      }
      for (const [u, w] of [[q.x0 + 1, q.z0 + 1], [q.x1 - 1, q.z0 + 1], [q.x0 + 1, q.z1 - 1], [q.x1 - 1, q.z1 - 1]]) for (let y = q.y0 + 1; y <= q.y1; y++) b.set(u, y, w, PL);
      continue;
    }
    if (p.kind === 'stairs') {
      const [dx, dz] = FACING_DIRS[p.dir];
      const top = q.y1 - 3;
      for (let t = 0; t <= (p.axis === 0 ? q.x1 - q.x0 : q.z1 - q.z0); t++) {
        const fy = t === 0 ? top : Math.max(q.y0 + 1, top - t);
        for (let s2 = -1; s2 <= 1; s2++) {
          const u = p.axis === 0 ? (dx > 0 ? q.x0 + t : q.x1 - t) : q.x0 + 1 + s2, w = p.axis === 1 ? (dz > 0 ? q.z0 + t : q.z1 - t) : q.z0 + 1 + s2;
          b.set(u, fy - 1, w, B.COBBLESTONE | SOFT);
          for (let y = fy; y <= fy + 3; y++) b.set(u, y, w, AIR);
        }
      }
      continue;
    }
    const spider = pr.chance(0.1), rails = pr.chance(0.7);
    const len = p.axis === 0 ? q.x1 - q.x0 + 1 : q.z1 - q.z0 + 1;
    const at = (t: number, s2: number): [number, number] => (p.axis === 0 ? [q.x0 + t, q.z0 + 1 + s2] : [q.x0 + 1 + s2, q.z0 + t]);
    for (let t = 0; t < len; t++) {
      for (let s2 = -1; s2 <= 1; s2++) {
        const [u, w] = at(t, s2);
        b.set(u, q.y0, w, PL | SOFT);
        for (let y = q.y0 + 1; y <= q.y0 + 3; y++) b.set(u, y, w, AIR);
        if (pr.chance(spider ? 0.32 : 0.035)) b.set(u, q.y0 + 1 + pr.int(3), w, makeBlock(NB.COBWEB));
      }
      if (rails && pr.chance(0.92)) { const [u, w] = at(t, 0); b.set(u, q.y0 + 1, w, makeBlock(B.RAIL, p.axis === 0 ? 1 : 0)); }
      if (t % 5 === 2) {
        const [ua, wa] = at(t, -1), [ub, wb] = at(t, 1), [um, wm] = at(t, 0);
        for (let y = q.y0 + 1; y <= q.y0 + 2; y++) { b.set(ua, y, wa, fence()); b.set(ub, y, wb, fence()); }
        b.set(ua, q.y0 + 3, wa, PL); b.set(um, q.y0 + 3, wm, PL); b.set(ub, q.y0 + 3, wb, PL);
      }
    }
    if (pr.chance(0.28)) { const t = 1 + pr.int(len - 2); const s2 = pr.chance(0.5) ? -1 : 1; const [u, w] = at(t, s2); if (t % 5 !== 2) b.chest(u, q.y0 + 1, w, p.axis === 0 ? (s2 < 0 ? 2 : 0) : (s2 < 0 ? 1 : 3), MINESHAFT); }
    if (spider) { const [u, w] = at(Math.floor(len / 2) + 1, 0); b.spawner(u, q.y0 + 1, w, 'duskweaver'); }
  }
}

interface Compiled { vox: Map<number, Int32Array>; fill: Map<number, Int32Array>; ents: Map<number, GenBlockEntity[]> }
const compiled = new Map<string, Compiled>();
const ck = (cx: number, cz: number) => (cx + 0x8000) * 0x10000 + (cz + 0x8000);

const DESIGNS: Record<LandmarkKind, (b: Build) => void> = {
  desert_pyramid: pyramid, jungle_temple: jungleTemple, swamp_hut: swampHut, igloo, desert_well: well, pillager_outpost: outpost,
  shipwreck, ocean_ruin: oceanRuin, ocean_monument: monument, dungeon, mineshaft,
};

export function compileLandmark(p: LandmarkPlan): Compiled {
  const hit = compiled.get(p.id);
  if (hit) return hit;
  const b = new Build(p, new Rng(mix32(p.seed ^ 0x1a9d)));
  DESIGNS[p.kind](b);
  const vox = new Map<number, number[]>(), fill = new Map<number, number[]>(), ents = new Map<number, GenBlockEntity[]>();
  const push = <T>(m: Map<number, T[]>, k: number, ...v: T[]) => { let a = m.get(k); if (!a) m.set(k, (a = [])); a.push(...v); };
  const decode = (key: number): [number, number, number] => { const Y = key % 512, rest = Math.floor(key / 512); return [Math.floor(rest / 1024) - 512, Y, (rest % 1024) - 512]; };
  for (const [key, v0] of b.m) {
    const [u, Y, w] = decode(key);
    const [dx, dz] = rotate(u, w, p.rot);
    const x = p.x + dx, z = p.z + dz;
    let v = rotMeta(v0, p.rot);
    if (p.wet && Y <= SEA_LEVEL && bid(v & ~FLAGS) === AIR) v = (v & FLAGS) | B.WATER;
    push(vox, ck(Math.floor(x / S), Math.floor(z / S)), x, Y, z, v);
  }
  for (const [key, v] of b.fills) {
    const [u, Y, w] = decode(key);
    const [dx, dz] = rotate(u, w, p.rot);
    const x = p.x + dx, z = p.z + dz;
    push(fill, ck(Math.floor(x / S), Math.floor(z / S)), x, Y, z, v);
  }
  for (const e of b.ents) {
    const [dx, dz] = rotate(e.x, e.z, p.rot);
    const x = p.x + dx, z = p.z + dz;
    push(ents, ck(Math.floor(x / S), Math.floor(z / S)), { ...e, x, z });
  }
  const out: Compiled = { vox: new Map(), fill: new Map(), ents };
  for (const [k, a] of vox) out.vox.set(k, Int32Array.from(a));
  for (const [k, a] of fill) out.fill.set(k, Int32Array.from(a));
  if (compiled.size > 40) compiled.clear();
  compiled.set(p.id, out);
  return out;
}

function open(cur: number): boolean {
  if (cur <= 0) return cur === 0;
  const id = bid(cur);
  if (id === 0 || isWaterLike(cur) || id === B.LAVA) return true;
  const d = BLOCKS[id];
  return !d || !d.solid || d.replaceable;
}

function solid(cur: number): boolean {
  if (cur <= 0) return false;
  const id = bid(cur);
  if (id === 0 || isWaterLike(cur) || id === B.LAVA) return false;
  const d = BLOCKS[id];
  return !!d && d.solid && !d.replaceable && !isDoorBlock(cur);
}

export function landmarkTouches(p: LandmarkPlan, cx: number, cz: number): boolean {
  const c = compileLandmark(p), k = ck(cx, cz);
  return c.vox.has(k) || c.fill.has(k) || c.ents.has(k);
}

export function stampLandmark(p: LandmarkPlan, bx: number, bz: number, set: (x: number, y: number, z: number, v: number) => void, get: (x: number, y: number, z: number) => number, entities: GenBlockEntity[]): boolean {
  const c = compileLandmark(p);
  const k = ck(Math.floor(bx / S), Math.floor(bz / S));
  const f = c.fill.get(k), v = c.vox.get(k), e = c.ents.get(k);
  if (!f && !v && !e) return false;
  if (f) for (let i = 0; i < f.length; i += 4) {
    const x = f[i] - bx, z = f[i + 2] - bz;
    for (let y = f[i + 1], n = 0; y > 0 && n < 40 && open(get(x, y, z)); y--, n++) set(x, y, z, f[i + 3]);
  }
  if (v) for (let i = 0; i < v.length; i += 4) {
    const x = v[i] - bx, y = v[i + 1], z = v[i + 2] - bz, val = v[i + 3];
    if (val & SOFT) { if (!open(get(x, y, z))) continue; }
    else if (val & SOLID) { if (!solid(get(x, y, z))) continue; }
    set(x, y, z, val & ~FLAGS);
  }
  if (e) for (const en of e) entities.push({ ...en, x: en.x - bx, z: en.z - bz, items: en.items.map((s) => (s ? { ...s } : null)) });
  return true;
}

import { SEA_LEVEL, WORLD_HEIGHT } from '../constants';
import { B, makeBlock, doorMeta, FACING_DIRS } from '../blocks';
import { I, toolId } from '../items';
import { Rng, hash2 } from '../rng';
import type { ItemStack } from '../inventory';
import type { Profession } from '../trades';
import type { Column, GenBlockEntity } from './WorldGenerator';

export const VILLAGE_REGION = 384;
const VILLAGE_BIOMES = new Set(['plains', 'desert', 'snowy_tundra', 'taiga']);

type Style = 'plains' | 'desert' | 'snowy' | 'taiga';
type Kind = 'well' | 'house' | 'bighouse' | 'farm' | 'smithy' | 'library' | 'lamp';

interface Rect { x0: number; z0: number; x1: number; z1: number; }
interface Building extends Rect {
  kind: Kind; y: number;
  ox: number; oz: number; ux: number; uz: number; vx: number; vz: number; w: number; d: number;
  seed: number;
}
export interface VillageHome { x: number; z: number; prof: Profession; }
export interface VillagePlan {
  id: string; x: number; z: number; y: number; style: Style; seed: number;
  roads: { x: number; z: number }[]; buildings: Building[]; homes: VillageHome[]; bounds: Rect;
}

interface Palette { wall: number; corner: number; floor: number; roof: number; base: number; path: number; }
const PALETTES: Record<Style, Palette> = {
  plains: { wall: B.OAK_PLANKS, corner: B.OAK_LOG, floor: B.OAK_PLANKS, roof: B.SPRUCE_PLANKS, base: B.COBBLESTONE, path: B.GRAVEL },
  desert: { wall: B.SANDSTONE, corner: B.SANDSTONE, floor: B.SANDSTONE, roof: B.SANDSTONE, base: B.SANDSTONE, path: B.SANDSTONE },
  snowy: { wall: B.SPRUCE_PLANKS, corner: B.SPRUCE_LOG, floor: B.SPRUCE_PLANKS, roof: B.STONE_BRICKS, base: B.STONE_BRICKS, path: B.GRAVEL },
  taiga: { wall: B.SPRUCE_PLANKS, corner: B.SPRUCE_LOG, floor: B.COBBLESTONE, roof: B.SPRUCE_PLANKS, base: B.MOSSY_COBBLESTONE, path: B.GRAVEL },
};

const SIZE: Record<Kind, [number, number]> = { well: [5, 5], house: [5, 5], bighouse: [7, 7], farm: [7, 9], smithy: [7, 6], library: [7, 7], lamp: [1, 1] };
const PROF_FOR: Partial<Record<Kind, Profession[]>> = {
  farm: ['farmer'], smithy: ['toolsmith', 'armorer'], library: ['librarian'],
  house: ['butcher', 'fletcher', 'farmer', 'mason'], bighouse: ['cleric', 'mason', 'fletcher', 'butcher'],
};

const overlap = (a: Rect, b: Rect) => a.x0 <= b.x1 && b.x0 <= a.x1 && a.z0 <= b.z1 && b.z0 <= a.z1;

export function villageSite(seed: number, rx: number, rz: number, column: (x: number, z: number) => Column): { x: number; z: number; style: Style } | null {
  const h = hash2(rx, rz, seed ^ 0x7111a6e);
  if ((h & 255) > 150) return null;
  const x = rx * VILLAGE_REGION + 80 + ((h >>> 8) % (VILLAGE_REGION - 160));
  const z = rz * VILLAGE_REGION + 80 + ((h >>> 18) % (VILLAGE_REGION - 160));
  const c = column(x, z);
  if (!VILLAGE_BIOMES.has(c.biome.id) || c.height <= SEA_LEVEL + 1 || c.height > 110) return null;
  let lo = c.height, hi = c.height;
  for (const [dx, dz] of [[-16, 0], [16, 0], [0, -16], [0, 16]]) {
    const hh = column(x + dx, z + dz).height;
    lo = Math.min(lo, hh); hi = Math.max(hi, hh);
  }
  if (hi - lo > 8 || lo <= SEA_LEVEL) return null;
  const b = c.biome.id;
  return { x, z, style: b === 'desert' ? 'desert' : b === 'snowy_tundra' ? 'snowy' : b === 'taiga' ? 'taiga' : 'plains' };
}

export function planVillage(seed: number, rx: number, rz: number, column: (x: number, z: number) => Column): VillagePlan | null {
  const site = villageSite(seed, rx, rz, column);
  if (!site) return null;
  const vs = hash2(site.x, site.z, seed ^ 0x5eed);
  const rng = new Rng(vs);
  const cy = column(site.x, site.z).height;
  const occupied: Rect[] = [];
  const roads: { x: number; z: number }[] = [];
  const buildings: Building[] = [];
  const homes: VillageHome[] = [];
  const well: Building = mkBuilding('well', site.x - 2, site.z - 2, 1, 0, 0, 1, cy, vs);
  buildings.push(well); occupied.push(well);
  const dirs: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const arms: { dx: number; dz: number; len: number }[] = [];
  for (const [dx, dz] of dirs) {
    const len = 14 + rng.int(18);
    arms.push({ dx, dz, len });
    for (let t = 3; t <= len; t++) for (let w = -1; w <= 1; w++) {
      const x = site.x + dx * t + -dz * w, z = site.z + dz * t + dx * w;
      roads.push({ x, z });
    }
    const x0 = Math.min(site.x + dx * 3 - Math.abs(dz), site.x + dx * len + Math.abs(dz));
    const x1 = Math.max(site.x + dx * 3 + Math.abs(dz), site.x + dx * len - Math.abs(dz));
    const z0 = Math.min(site.z + dz * 3 - Math.abs(dx), site.z + dz * len + Math.abs(dx));
    const z1 = Math.max(site.z + dz * 3 + Math.abs(dx), site.z + dz * len - Math.abs(dx));
    occupied.push({ x0, z0, x1, z1 });
  }
  const pool: Kind[] = ['house', 'house', 'house', 'bighouse', 'farm', 'farm', 'smithy', 'library', 'house', 'farm'];
  let n = 0;
  for (const arm of arms) {
    for (let t = 6; t <= arm.len - 2; t += 8) {
      for (const side of [1, -1]) {
        if (!rng.chance(0.8)) continue;
        const kind = n < 3 ? (['farm', 'smithy', 'library'] as Kind[])[n] : pool[rng.int(pool.length)];
        const [w, d] = SIZE[kind];
        const px = -arm.dz * side, pz = arm.dx * side;
        const ox = site.x + arm.dx * t + px * 3, oz = site.z + arm.dz * t + pz * 3;
        const u0 = -Math.floor(w / 2);
        const corners = [[u0, 0], [u0 + w - 1, 0], [u0, d - 1], [u0 + w - 1, d - 1]].map(([u, v]) => [ox + arm.dx * u + px * v, oz + arm.dz * u + pz * v]);
        const r: Rect = {
          x0: Math.min(...corners.map((c) => c[0])), x1: Math.max(...corners.map((c) => c[0])),
          z0: Math.min(...corners.map((c) => c[1])), z1: Math.max(...corners.map((c) => c[1])),
        };
        const pad = { x0: r.x0 - 1, z0: r.z0 - 1, x1: r.x1 + 1, z1: r.z1 + 1 };
        if (occupied.some((q) => overlap(q, pad))) continue;
        const cc = column((r.x0 + r.x1) >> 1, (r.z0 + r.z1) >> 1);
        if (cc.height <= SEA_LEVEL || Math.abs(cc.height - cy) > 7) continue;
        const b: Building = { ...r, kind, y: cc.height, ox, oz, ux: arm.dx, uz: arm.dz, vx: px, vz: pz, w, d, seed: hash2(ox, oz, vs) };
        buildings.push(b); occupied.push(r); n++;
        const profs = PROF_FOR[kind];
        if (profs) homes.push({ x: ox - px, z: oz - pz, prof: profs[hash2(ox, oz, vs ^ 9) % profs.length] });
      }
      if (rng.chance(0.5)) {
        const lx = site.x + arm.dx * (t + 4) + -arm.dz * 2, lz = site.z + arm.dz * (t + 4) + arm.dx * 2;
        const r: Rect = { x0: lx, z0: lz, x1: lx, z1: lz };
        if (!occupied.some((q) => overlap(q, r))) {
          const lb = mkBuilding('lamp', lx, lz, 1, 0, 0, 1, column(lx, lz).height, vs);
          buildings.push(lb); occupied.push(r);
        }
      }
    }
  }
  if (homes.length < 2) homes.push({ x: site.x + 3, z: site.z, prof: 'farmer' }, { x: site.x - 3, z: site.z, prof: 'librarian' });
  const bounds: Rect = { x0: site.x, z0: site.z, x1: site.x, z1: site.z };
  for (const r of occupied) { bounds.x0 = Math.min(bounds.x0, r.x0); bounds.z0 = Math.min(bounds.z0, r.z0); bounds.x1 = Math.max(bounds.x1, r.x1); bounds.z1 = Math.max(bounds.z1, r.z1); }
  return { id: `${rx},${rz}`, x: site.x, z: site.z, y: cy, style: site.style, seed: vs, roads, buildings, homes, bounds };
}

function mkBuilding(kind: Kind, x: number, z: number, ux: number, uz: number, vx: number, vz: number, y: number, seed: number): Building {
  const [w, d] = SIZE[kind];
  return { kind, x0: x, z0: z, x1: x + w - 1, z1: z + d - 1, y, ox: x, oz: z, ux, uz, vx, vz, w, d, seed: hash2(x, z, seed) };
}

type Setter = (x: number, y: number, z: number, v: number) => void;
type Getter = (x: number, y: number, z: number) => number;

const SOFT = new Set<number>([0, B.TALL_GRASS, B.FERN, B.DANDELION, B.POPPY, B.DEAD_BUSH, B.OAK_LEAVES, B.BIRCH_LEAVES, B.SPRUCE_LEAVES, B.JUNGLE_LEAVES,
  B.OAK_LOG, B.BIRCH_LOG, B.SPRUCE_LOG, B.JUNGLE_LOG, B.SNOW, B.SUGAR_CANE, B.CACTUS, B.RED_MUSHROOM, B.BROWN_MUSHROOM]);

export function stampVillage(plan: VillagePlan, bx: number, bz: number, size: number, set: Setter, get: Getter, column: (x: number, z: number) => Column, entities: GenBlockEntity[]): void {
  const inChunk = (x: number, z: number) => x >= bx && x < bx + size && z >= bz && z < bz + size;
  const P = PALETTES[plan.style];
  const S = (x: number, y: number, z: number, v: number) => { if (inChunk(x, z) && y > 0 && y < WORLD_HEIGHT) set(x - bx, y, z - bz, v); };
  const G = (x: number, y: number, z: number) => (inChunk(x, z) ? get(x - bx, y, z - bz) : -1);

  const bb = plan.bounds;
  for (let x = Math.max(bx, bb.x0 - 3); x <= Math.min(bx + size - 1, bb.x1 + 3); x++) {
    for (let z = Math.max(bz, bb.z0 - 3); z <= Math.min(bz + size - 1, bb.z1 + 3); z++) {
      const h = column(x, z).height;
      for (let y = h + 1; y <= Math.min(WORLD_HEIGHT - 1, h + 24); y++) { const c = G(x, y, z); if (c !== 0 && SOFT.has(c)) S(x, y, z, 0); }
    }
  }

  for (const r of plan.roads) {
    if (!inChunk(r.x, r.z)) continue;
    const h = column(r.x, r.z).height;
    const top = G(r.x, h, r.z);
    if (h < SEA_LEVEL || top === B.WATER) { S(r.x, SEA_LEVEL, r.z, P.roof); continue; }
    S(r.x, h, r.z, P.path);
    if (G(r.x, h - 1, r.z) === 0) S(r.x, h - 1, r.z, P.base);
    for (let y = h + 1; y <= h + 6; y++) if (SOFT.has(G(r.x, y, r.z))) S(r.x, y, r.z, 0);
  }

  for (const b of plan.buildings) {
    if (b.x1 < bx || b.x0 >= bx + size || b.z1 < bz || b.z0 >= bz + size) continue;
    const rr = new Rng(b.seed);
    const at = (u: number, v: number): [number, number] => [b.ox + b.ux * u + b.vx * v, b.oz + b.uz * u + b.vz * v];
    const u0 = -Math.floor(b.w / 2), u1 = u0 + b.w - 1;
    const y = b.y;
    const foundation = (x: number, z: number, top: number) => {
      for (let yy = top; yy > top - 8; yy--) { const c = G(x, yy, z); if (c !== 0 && c !== B.WATER && !SOFT.has(c)) break; S(x, yy, z, P.base); }
    };
    const clear = (x: number, z: number, from: number, to: number) => { for (let yy = from; yy <= to; yy++) S(x, yy, z, 0); };
    const front = FACING_DIRS.findIndex(([fx, fz]) => fx === -b.vx && fz === -b.vz);

    if (b.kind === 'lamp') {
      const x = b.x0, z = b.z0;
      foundation(x, z, y);
      S(x, y + 1, z, P.base); S(x, y + 2, z, P.corner); S(x, y + 3, z, P.corner); S(x, y + 4, z, makeBlock(B.TORCH));
      continue;
    }

    if (b.kind === 'well') {
      for (let dz = 0; dz < 5; dz++) for (let dx = 0; dx < 5; dx++) {
        const x = b.x0 + dx, z = b.z0 + dz;
        foundation(x, z, y - 1);
        S(x, y, z, P.path); clear(x, z, y + 1, y + 6);
        const edge = dx === 0 || dz === 0 || dx === 4 || dz === 4;
        if (edge) continue;
        const ring = dx === 1 || dz === 1 || dx === 3 || dz === 3;
        if (ring) { S(x, y + 1, z, P.base); if ((dx === 1 || dx === 3) && (dz === 1 || dz === 3)) { S(x, y + 2, z, P.corner); S(x, y + 3, z, P.corner); } }
        else { for (let yy = y - 3; yy <= y; yy++) S(x, yy, z, B.WATER); S(x, y - 4, z, P.base); }
        if (ring || !edge) S(x, y + 4, z, P.roof);
      }
      continue;
    }

    if (b.kind === 'farm') {
      for (let v = 0; v < b.d; v++) for (let u = u0; u <= u1; u++) {
        const [x, z] = at(u, v);
        foundation(x, z, y - 1);
        clear(x, z, y + 1, y + 5);
        const border = u === u0 || u === u1 || v === 0 || v === b.d - 1;
        if (border) S(x, y, z, P.corner);
        else if (u === 0) S(x, y, z, B.WATER);
        else { S(x, y, z, makeBlock(B.FARMLAND, 1)); S(x, y + 1, z, makeBlock(B.WHEAT, rr.int(8))); }
      }
      continue;
    }

    const big = b.kind !== 'house';
    const H = big ? 4 : 3;
    for (let v = 0; v < b.d; v++) for (let u = u0; u <= u1; u++) {
      const [x, z] = at(u, v);
      foundation(x, z, y - 1);
      S(x, y, z, P.floor);
      clear(x, z, y + 1, y + H + 5);
      const wallU = u === u0 || u === u1, wallV = v === 0 || v === b.d - 1;
      if (!wallU && !wallV) continue;
      const corner = wallU && wallV;
      for (let k = 1; k <= H; k++) {
        let blk = corner ? P.corner : k === 1 && big ? P.base : P.wall;
        const mid = (wallV && Math.abs(u) === Math.max(1, Math.floor(b.w / 4)) && u !== 0) || (wallU && v === Math.floor(b.d / 2));
        if (!corner && k === 2 && mid) blk = B.GLASS;
        S(x, y + k, z, blk);
      }
    }
    for (let k = 0; k <= Math.ceil(b.d / 2); k++) {
      const yy = y + H + 1 + k;
      for (let v = k - 1; v <= b.d - k; v++) for (let u = u0 - (k === 0 ? 1 : 0); u <= u1 + (k === 0 ? 1 : 0); u++) {
        if (v < -1 || v > b.d) continue;
        const [x, z] = at(u, v);
        const edgeU = u === u0 || u === u1;
        const rim = v === k - 1 || v === b.d - k;
        if (rim || k === 0) S(x, yy, z, P.roof);
        else if (edgeU) S(x, yy, z, P.wall);
      }
      if (b.d - 2 * k < 0) break;
    }
    const [dx, dz] = at(0, 0);
    S(dx, y + 1, dz, makeBlock(B.OAK_DOOR, doorMeta(front, false, false)));
    S(dx, y + 2, dz, makeBlock(B.OAK_DOOR, doorMeta(front, true, false)));
    const [sx, sz] = at(0, -1);
    const sh = column(sx, sz).height;
    if (sh < y) for (let yy = sh + 1; yy <= y; yy++) S(sx, yy, sz, P.base);
    clear(sx, sz, y + 1, y + 3);
    const [tx, tz] = at(0, Math.floor(b.d / 2));
    S(tx, y + H + 1, tz, B.GLOWSTONE);
    const back = b.d - 2;
    if (b.kind === 'library') {
      for (let u = u0 + 1; u <= u1 - 1; u++) { const [x, z] = at(u, back); S(x, y + 1, z, B.BOOKSHELF); S(x, y + 2, z, B.BOOKSHELF); }
      const [wx, wz] = at(u0 + 1, 1); S(wx, y + 1, wz, B.WORKBENCH);
    } else if (b.kind === 'smithy') {
      const [fx, fz] = at(u0 + 1, back); S(fx, y + 1, fz, makeBlock(B.FURNACE, front));
      const [gx, gz] = at(u0 + 2, back); S(gx, y + 1, gz, makeBlock(B.FURNACE, front));
      const [cx2, cz2] = at(u1 - 1, back);
      S(cx2, y + 1, cz2, makeBlock(B.CHEST, front));
      if (inChunk(cx2, cz2)) entities.push({ x: cx2 - bx, y: y + 1, z: cz2 - bz, type: 'chest', items: smithLoot(rr) });
      const [lx, lz] = at(u1 - 1, 1); S(lx, y + 1, lz, B.IRON_BLOCK);
    } else {
      const [wx, wz] = at(u1 - 1, back); S(wx, y + 1, wz, B.WORKBENCH);
      const [bx2, bz2] = at(u0 + 1, back); S(bx2, y + 1, bz2, B.RED_WOOL);
      const [bx3, bz3] = at(u0 + 1, back - 1); S(bx3, y + 1, bz3, B.WHITE_WOOL);
      if (big) {
        const [cx3, cz3] = at(u1 - 1, 1);
        S(cx3, y + 1, cz3, makeBlock(B.CHEST, front));
        if (inChunk(cx3, cz3)) entities.push({ x: cx3 - bx, y: y + 1, z: cz3 - bz, type: 'chest', items: houseLoot(rr) });
      }
    }
  }
}

function fill(r: Rng, table: [number, number, number, number][]): (ItemStack | null)[] {
  const items: (ItemStack | null)[] = new Array(27).fill(null);
  for (const [id, a, b, p] of table) {
    if (!r.chance(p)) continue;
    let slot = r.int(27);
    for (let k = 0; k < 27 && items[slot]; k++) slot = (slot + 1) % 27;
    items[slot] = { id, count: a + r.int(b - a + 1) };
  }
  return items;
}

function smithLoot(r: Rng): (ItemStack | null)[] {
  return fill(r, [[I.IRON_INGOT, 1, 5, 0.7], [I.BREAD, 1, 3, 0.5], [I.COAL, 2, 8, 0.6], [I.EMERALD, 1, 3, 0.35], [toolId(2, 0), 1, 1, 0.2], [toolId(2, 3), 1, 1, 0.15], [I.GOLD_INGOT, 1, 3, 0.2], [B.OBSIDIAN, 1, 3, 0.15]]);
}

function houseLoot(r: Rng): (ItemStack | null)[] {
  return fill(r, [[I.BREAD, 1, 4, 0.6], [I.APPLE, 1, 3, 0.5], [I.WHEAT, 2, 7, 0.4], [I.SEEDS, 2, 6, 0.4], [I.EMERALD, 1, 2, 0.3], [B.TORCH, 2, 6, 0.4], [I.PAPER, 1, 4, 0.3]]);
}

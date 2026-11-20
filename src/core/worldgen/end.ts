import { CHUNK_SIZE, CHUNK_VOLUME, WORLD_HEIGHT } from '../constants';
import { Simplex } from '../noise';
import { Rng, hash2, hash3 } from '../rng';
import { B, CB, FACING_DIRS, makeBlock, stainedGlassId, SHAPE_MATS, SLAB_TOP } from '../blocks';
import { END_X } from '../dimension';
import { I, toolId, armorId } from '../items';
import type { ItemStack } from '../inventory';
import type { GenBlockEntity } from './WorldGenerator';

const S = CHUNK_SIZE;
const END_STONE = makeBlock(CB.END_STONE, 0);
export const EXIT_Y = 64;
export const MAIN_R = 96;
export const OUTER_START = 1000;
export const GATEWAY_R = 96, GATEWAY_Y = 75;
const CELL = 48;
const CITY_REGION = 320;
const PURPUR_SLAB = makeBlock(B.SLAB, SHAPE_MATS.findIndex((m) => m.id === CB.PURPUR_BLOCK) | SLAB_TOP);

export interface EndPillar { x: number; z: number; r: number; h: number; caged: boolean; }
export interface EndCity { x: number; z: number; y: number; floors: number; ship: boolean; seed: number; }

type Col = { top: number; bottom: number } | null;

export class EndGen {
  private n1: Simplex;
  private n2: Simplex;
  private n3: Simplex;
  private pillarCache: EndPillar[] | null = null;
  private cityCache = new Map<string, EndCity | null>();

  constructor(private seed: number) {
    this.n1 = new Simplex(seed ^ 0x3e0d);
    this.n2 = new Simplex(seed ^ 0x51a7);
    this.n3 = new Simplex(seed ^ 0x7c21);
  }

  pillars(): EndPillar[] {
    if (this.pillarCache) return this.pillarCache;
    const r = new Rng(this.seed ^ 0x9111a);
    const order = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    for (let i = 9; i > 0; i--) { const j = r.int(i + 1); [order[i], order[j]] = [order[j], order[i]]; }
    const out: EndPillar[] = [];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.31;
      const k = order[i];
      out.push({ x: Math.round(Math.cos(a) * 42), z: Math.round(Math.sin(a) * 42), r: 2 + Math.floor(k / 3), h: 76 + k * 3, caged: k === 1 || k === 2 });
    }
    return (this.pillarCache = out);
  }

  city(ri: number, rj: number): EndCity | null {
    const key = `${ri},${rj}`;
    if (this.cityCache.has(key)) return this.cityCache.get(key)!;
    const h = hash2(ri, rj, this.seed ^ 0x0c17);
    const x = ri * CITY_REGION + 48 + (h & 0xff) % (CITY_REGION - 96);
    const z = rj * CITY_REGION + 48 + ((h >>> 8) & 0xff) % (CITY_REGION - 96);
    const d = Math.hypot(x, z);
    let c: EndCity | null = null;
    if (d > OUTER_START + 60 && ((h >>> 16) & 0xff) < 200) {
      const near = d < OUTER_START + 520;
      c = { x, z, y: Math.round(64 + this.n2.noise2(x / 11, z / 11) * 1.2) + 1, floors: 3 + ((h >>> 24) & 3), ship: near || ((h >>> 26) & 3) !== 0, seed: h };
    }
    if (this.cityCache.size > 4096) this.cityCache.clear();
    this.cityCache.set(key, c);
    return c;
  }

  citiesNear(x: number, z: number, radius: number): EndCity[] {
    const out: EndCity[] = [];
    for (let ri = Math.floor((x - radius) / CITY_REGION); ri <= Math.floor((x + radius) / CITY_REGION); ri++)
      for (let rj = Math.floor((z - radius) / CITY_REGION); rj <= Math.floor((z + radius) / CITY_REGION); rj++) {
        const c = this.city(ri, rj);
        if (c && Math.abs(c.x - x) <= radius && Math.abs(c.z - z) <= radius) out.push(c);
      }
    return out;
  }

  column(x: number, z: number): Col {
    const d = Math.hypot(x, z);
    if (d < MAIN_R + 24) {
      const edge = MAIN_R + this.n1.noise2(x / 40, z / 40) * 12;
      if (d < edge) {
        const t = d / edge, calm = Math.min(1, d / 24);
        const top = Math.round(EXIT_Y - 1 + this.n2.noise2(x / 24, z / 24) * 2 * calm - t * t * t * t * 7);
        const depth = Math.pow(1 - t * t, 0.7) * 44 + 3 + this.n3.noise2(x / 18, z / 18) * 4;
        return { top, bottom: Math.max(1, Math.round(top - depth)) };
      }
      return null;
    }
    if (d < OUTER_START) return null;
    let best: Col = null;
    const ci = Math.floor(x / CELL), cj = Math.floor(z / CELL);
    for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
      const h = hash2(i, j, this.seed ^ 0x15a7);
      const dens = Math.max(0, Math.min(1, this.n1.noise2(i * 0.09, j * 0.09) * 0.8 + 0.45));
      if ((h & 0xffff) / 65536 > dens * 0.6) continue;
      const ox = i * CELL + 8 + ((h >>> 16) & 31), oz = j * CELL + 8 + ((h >>> 21) & 31);
      if (Math.hypot(ox, oz) < OUTER_START + 8) continue;
      const r = 7 + ((h >>> 26) & 15) * (((h >>> 30) & 1) ? 2.2 : 1.2);
      best = union(best, this.lens(x, z, ox, oz, r, 54 + (((h >>> 8) & 15) - 8)));
    }
    for (const c of this.citiesNear(x, z, 60)) best = union(best, this.lens(x, z, c.x, c.z, 46, 61));
    return best;
  }

  private lens(x: number, z: number, ox: number, oz: number, r: number, cy: number): Col {
    const dd = Math.hypot(x - ox, z - oz) * (1 + this.n3.noise2(x / 14, z / 14) * 0.12);
    if (dd >= r) return null;
    const t = dd / r;
    const top = Math.round(cy + (1 - t * t) * 3 + this.n2.noise2(x / 11, z / 11) * 1.2);
    const bottom = Math.round(top - Math.pow(1 - t, 0.8) * r * 0.85 - 1);
    return { top, bottom };
  }

  topAt(x: number, z: number): number {
    const c = this.column(x, z);
    return c ? c.top : -1;
  }

  generate(cx: number, cz: number): { blocks: Uint32Array; entities: GenBlockEntity[] } {
    const blocks = new Uint32Array(CHUNK_VOLUME);
    const entities: GenBlockEntity[] = [];
    const wx = cx * S, wz = cz * S, bx = wx - END_X, bz = wz;
    const idx = (x: number, y: number, z: number) => (y * S + z) * S + x;
    const set = (x: number, y: number, z: number, v: number) => { if (x >= 0 && x < S && z >= 0 && z < S && y >= 0 && y < WORLD_HEIGHT) blocks[idx(x, y, z)] = v; };
    const get = (x: number, y: number, z: number) => (x >= 0 && x < S && z >= 0 && z < S && y >= 0 && y < WORLD_HEIGHT ? blocks[idx(x, y, z)] : 0);
    let any = false;
    for (let z = 0; z < S; z++) for (let x = 0; x < S; x++) {
      const c = this.column(bx + x, bz + z);
      if (!c) continue;
      any = true;
      for (let y = Math.max(0, c.bottom); y <= Math.min(WORLD_HEIGHT - 1, c.top); y++) blocks[idx(x, y, z)] = END_STONE;
    }
    const near = Math.hypot(bx + 8, bz + 8);
    if (near < MAIN_R + 40) this.central(bx, bz, set, entities);
    if (any && near > OUTER_START) this.chorus(bx, bz, set, get);
    for (const c of this.citiesNear(bx + 8, bz + 8, 72)) this.stampCity(c, bx, bz, set, entities);
    return { blocks, entities };
  }

  private central(bx: number, bz: number, set: (x: number, y: number, z: number, v: number) => void, entities: GenBlockEntity[]): void {
    for (const p of this.pillars()) {
      if (p.x + p.r + 3 < bx || p.x - p.r - 3 > bx + 15 || p.z + p.r + 3 < bz || p.z - p.r - 3 > bz + 15) continue;
      const base = Math.max(1, this.topAt(p.x, p.z) - 8);
      for (let dz = -p.r; dz <= p.r; dz++) for (let dx = -p.r; dx <= p.r; dx++) {
        if (dx * dx + dz * dz > p.r * p.r + 1) continue;
        for (let y = base; y <= p.h; y++) set(p.x + dx - bx, y, p.z + dz - bz, B.OBSIDIAN);
      }
      set(p.x - bx, p.h, p.z - bz, B.BEDROCK);
      const lx = p.x - bx, lz = p.z - bz;
      if (lx >= 0 && lx < S && lz >= 0 && lz < S) entities.push({ x: lx, y: p.h + 1, z: lz, type: 'mob', items: [], mob: 'riftcore' });
      if (p.caged) for (let dy = 1; dy <= 4; dy++) for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
        const edge = Math.abs(dx) === 2 || Math.abs(dz) === 2 || dy === 4;
        if (edge) set(lx + dx, p.h + dy, lz + dz, B.IRON_BARS);
      }
    }
    exitPortal(bx, bz, set, false);
  }

  private chorus(bx: number, bz: number, set: (x: number, y: number, z: number, v: number) => void, get: (x: number, y: number, z: number) => number): void {
    for (let oz = bz - 8; oz < bz + 24; oz++) for (let ox = bx - 8; ox < bx + 24; ox++) {
      const h = hash2(ox, oz, this.seed ^ 0xc0c0);
      if ((h & 0x3ff) > 3) continue;
      const top = this.topAt(ox, oz);
      if (top < 0) continue;
      if (this.citiesNear(ox, oz, 26).length) continue;
      const parts = chorusTree(new Rng(h), ox, top + 1, oz);
      const has = (x: number, y: number, z: number) => parts.has(`${x},${y},${z}`);
      for (const [k, kind] of parts) {
        const [x, y, z] = k.split(',').map(Number);
        const lx = x - bx, lz = z - bz;
        if (lx < 0 || lx >= S || lz < 0 || lz >= S) continue;
        if (get(lx, y, lz) !== 0) continue;
        if (kind === 'f') { set(lx, y, lz, makeBlock(CB.CHORUS_FLOWER, 5)); continue; }
        let m = 0;
        if (has(x + 1, y, z)) m |= 1;
        if (has(x - 1, y, z)) m |= 2;
        if (has(x, y + 1, z)) m |= 4;
        if (has(x, y - 1, z) || y === top + 1) m |= 8;
        if (has(x, y, z + 1)) m |= 16;
        if (has(x, y, z - 1)) m |= 32;
        set(lx, y, lz, makeBlock(CB.CHORUS_PLANT, m));
      }
    }
  }

  private stampCity(c: EndCity, bx: number, bz: number, set: (x: number, y: number, z: number, v: number) => void, entities: GenBlockEntity[]): void {
    const r = new Rng(c.seed ^ 0x5ee1);
    const P = makeBlock(CB.PURPUR_BLOCK, 0), PIL = makeBlock(CB.PURPUR_PILLAR, 0), BRK = makeBlock(CB.END_STONE_BRICKS, 0), GL = stainedGlassId('magenta');
    const inC = (x: number, z: number) => x >= bx && x < bx + S && z >= bz && z < bz + S;
    const put = (x: number, y: number, z: number, v: number) => { const X = c.x + x, Z = c.z + z; if (inC(X, Z)) set(X - bx, c.y + y, Z - bz, v); };
    const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, wall: number, fill: number | null, floor = wall) => {
      for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
        const shell = x === x0 || x === x1 || z === z0 || z === z1 || y === y0 || y === y1;
        if (shell) put(x, y, z, y === y0 ? floor : wall);
        else if (fill !== null) put(x, y, z, fill);
      }
    };
    const mob = (x: number, y: number, z: number, type: string) => { const X = c.x + x, Z = c.z + z; if (inC(X, Z)) entities.push({ x: X - bx, y: c.y + y, z: Z - bz, type: 'mob', items: [], mob: type }); };
    const chest = (x: number, y: number, z: number, items: (ItemStack | null)[]) => { const X = c.x + x, Z = c.z + z; if (!inC(X, Z)) return; set(X - bx, c.y + y, Z - bz, B.CHEST); entities.push({ x: X - bx, y: c.y + y, z: Z - bz, type: 'chest', items }); };
    const ladderW = makeBlock(B.LADDER, FACING_DIRS.findIndex(([dx, dz]) => dx === -1 && dz === 0));

    box(-7, 0, -7, 7, 6, 7, P, 0, BRK);
    for (const [x, z] of [[-7, -7], [7, -7], [-7, 7], [7, 7]]) for (let y = 0; y <= 7; y++) put(x, y, z, PIL);
    for (let y = 1; y <= 3; y++) for (let x = -1; x <= 1; x++) put(x, y, -7, 0);
    for (const [x, z] of [[-7, 0], [7, 0], [0, 7]]) { put(x, 3, z, GL); put(x, 4, z, GL); }
    put(0, 7, -7, makeBlock(CB.END_ROD, 0));
    mob(4, 1, 4, 'shellward');

    const tTop = 6 + c.floors * 5;
    box(-3, 6, -3, 3, tTop, 3, P, 0);
    for (let f = 1; f < c.floors; f++) for (let z = -2; z <= 2; z++) for (let x = -2; x <= 2; x++) if (!(x === -2 && z === 0)) put(x, 6 + f * 5, z, P);
    for (let y = 1; y <= 5; y++) put(-3, y, 0, PIL);
    for (let f = 0; f < c.floors; f++) { const y = 8 + f * 5; for (const [x, z] of [[3, 0], [0, 3], [0, -3]]) put(x, y, z, GL); if (f > 0 && r.chance(0.5)) mob(2, 7 + f * 5, 2, 'shellward'); }

    const cy = tTop;
    box(-6, cy, -6, 6, cy + 6, 6, P, 0, P);
    for (let z = -2; z <= 2; z++) for (let x = -2; x <= 2; x++) if (!(x === -2 && z === 0)) put(x, cy, z, P);
    for (let y = 1; y <= cy; y++) put(-2, y, 0, ladderW);
    for (const [x, z] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) { put(x, cy + 7, z, makeBlock(CB.END_ROD, 0)); for (let y = cy; y <= cy + 6; y++) put(x, y, z, PIL); }
    for (const [x, z] of [[-6, 0], [6, 0], [0, -6], [0, 6]]) { put(x, cy + 3, z, GL); put(x, cy + 4, z, GL); }
    for (let z = -5; z <= 5; z++) for (let x = -5; x <= 5; x++) if ((x + z) % 2 === 0) put(x, cy + 6, z, PURPUR_SLAB);
    chest(4, cy + 1, -4, cityLoot(r));
    chest(-4, cy + 1, 4, cityLoot(r));
    mob(4, cy + 1, 4, 'shellward');
    mob(-4, cy + 5, -4, 'shellward');
    mob(0, cy + 7, 0, 'shellward');

    if (!c.ship) return;
    const sy = cy + 4, sx = 16, sz = 0;
    for (let u = 0; u <= 26; u++) {
      const w = u < 5 ? 1 + Math.floor(u / 2) : u > 21 ? 1 + Math.floor((26 - u) / 2) : 4;
      const depth = u < 3 || u > 23 ? 1 : u < 6 || u > 20 ? 2 : 3;
      for (let dy = 0; dy <= depth; dy++) {
        const ww = Math.max(0, w - (depth - dy === depth ? 0 : 0) - (dy === 0 ? 1 : 0));
        for (let dz = -ww; dz <= ww; dz++) {
          const edge = Math.abs(dz) === ww || dy === 0;
          put(sx + u, sy - depth + dy, sz + dz, edge ? (dy === 0 ? B.OBSIDIAN : P) : 0);
        }
      }
      for (let dz = -w; dz <= w; dz++) put(sx + u, sy, sz + dz, P);
      if (u > 1 && u < 25) { put(sx + u, sy + 1, sz - w, BRK); put(sx + u, sy + 1, sz + w, BRK); }
    }
    for (let y = sy + 1; y <= sy + 11; y++) put(sx + 13, y, sz, PIL);
    for (let dz = -4; dz <= 4; dz++) put(sx + 13, sy + 9, sz + dz, PIL);
    for (const dz of [-4, 4]) put(sx + 13, sy + 10, sz + dz, makeBlock(CB.END_ROD, 0));
    box(sx + 2, sy, sz - 3, sx + 8, sy + 5, sz + 3, P, 0, P);
    for (let y = sy + 1; y <= sy + 2; y++) put(sx + 8, y, sz, 0);
    put(sx + 8, sy + 3, sz, GL);
    chest(sx + 3, sy + 1, sz, cityLoot(r));
    { const X = c.x + sx + 2, Z = c.z + sz; if (inC(X, Z)) entities.push({ x: X - bx, y: c.y + sy + 3, z: Z - bz, type: 'frame', items: [{ id: I.ELYTRA, count: 1 }], face: 0 }); }
    chest(sx + 4, sy - 2, sz + 2, cityLoot(r));
    put(sx + 26, sy + 1, sz, makeBlock(CB.DRAGON_HEAD, 0));
    mob(sx + 6, sy + 1, sz + 2, 'shellward');
    mob(sx + 20, sy + 1, sz - 2, 'shellward');
  }
}

function union(a: Col, b: Col): Col {
  if (!b) return a;
  if (!a) return b;
  return { top: Math.max(a.top, b.top), bottom: Math.min(a.bottom, b.bottom) };
}

export function exitPortal(bx: number, bz: number, set: (x: number, y: number, z: number, v: number) => void, open: boolean): void {
  if (bx > 8 || bx + 15 < -8 || bz > 8 || bz + 15 < -8) return;
  for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) {
    const d = Math.hypot(dx, dz);
    const lx = dx - bx, lz = dz - bz;
    if (d > 4.5) continue;
    for (let y = EXIT_Y + 1; y <= EXIT_Y + 5; y++) if (!(dx === 0 && dz === 0)) set(lx, y, lz, 0);
    if (d <= 3.5) set(lx, EXIT_Y - 1, lz, B.BEDROCK);
    if (d > 2.5 && d <= 3.5) set(lx, EXIT_Y, lz, B.BEDROCK);
    else if (d <= 2.5 && (dx || dz)) set(lx, EXIT_Y, lz, open ? makeBlock(CB.END_PORTAL, 0) : 0);
  }
  for (let y = EXIT_Y - 1; y <= EXIT_Y + 3; y++) set(-bx, y, -bz, B.BEDROCK);
}

export function exitPortalCells(): [number, number][] {
  const out: [number, number][] = [];
  for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) if ((dx || dz) && Math.hypot(dx, dz) <= 2.5) out.push([dx, dz]);
  return out;
}

export function gatewaySpot(i: number): { x: number; y: number; z: number } {
  const a = (i / 20) * Math.PI * 2;
  return { x: Math.round(Math.cos(a) * GATEWAY_R), y: GATEWAY_Y, z: Math.round(Math.sin(a) * GATEWAY_R) };
}

function chorusTree(r: Rng, x0: number, y0: number, z0: number): Map<string, 'p' | 'f'> {
  const out = new Map<string, 'p' | 'f'>();
  const grow = (x: number, y: number, z: number, depth: number) => {
    const h = 1 + r.int(depth === 0 ? 4 : 3);
    for (let i = 0; i < h; i++) out.set(`${x},${y + i},${z}`, 'p');
    const ty = y + h - 1;
    if (depth >= 4 || ty > y0 + 18) { out.set(`${x},${ty + 1},${z}`, 'f'); return; }
    const arms = depth === 0 ? 2 + r.int(2) : r.int(3);
    if (!arms) { out.set(`${x},${ty + 1},${z}`, 'f'); return; }
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let a = 0; a < arms; a++) {
      const [dx, dz] = dirs[r.int(4)];
      const nx = x + dx, nz = z + dz;
      if (out.has(`${nx},${ty},${nz}`) || Math.abs(nx - x0) > 7 || Math.abs(nz - z0) > 7) continue;
      out.set(`${nx},${ty},${nz}`, 'p');
      grow(nx, ty + 1, nz, depth + 1);
    }
  };
  grow(x0, y0, z0, 0);
  void hash3;
  return out;
}

function gear(r: Rng): ItemStack {
  const pick = r.int(6);
  const diamond = r.chance(0.45);
  const en: Record<string, number> = { unbreaking: 1 + r.int(3) };
  if (r.chance(0.12)) en.mending = 1;
  if (pick === 0) return { id: toolId(diamond ? 4 : 2, 3), count: 1, en: { ...en, sharpness: 2 + r.int(3) } };
  if (pick === 1) return { id: toolId(diamond ? 4 : 2, 0), count: 1, en: { ...en, efficiency: 2 + r.int(3) } };
  if (pick === 2) return { id: toolId(diamond ? 4 : 2, 2), count: 1, en: { ...en, efficiency: 2 + r.int(3) } };
  return { id: armorId(diamond ? 3 : 1, pick - 3), count: 1, en: { ...en, protection: 2 + r.int(3) } };
}

export function cityLoot(r: Rng): (ItemStack | null)[] {
  const items: (ItemStack | null)[] = new Array(27).fill(null);
  const putIn = (s: ItemStack) => { let slot = r.int(27); for (let t = 0; t < 27 && items[slot]; t++) slot = (slot + 1) % 27; items[slot] = s; };
  const table: [number, () => ItemStack][] = [
    [5, () => ({ id: I.AETHERITE, count: 2 + r.int(6) })], [10, () => ({ id: I.IRON_INGOT, count: 4 + r.int(5) })], [15, () => ({ id: I.GOLD_INGOT, count: 2 + r.int(6) })],
    [2, () => ({ id: I.EMERALD, count: 2 + r.int(5) })], [5, () => ({ id: I.BEETROOT_SEEDS, count: 1 + r.int(10) })], [3, () => ({ id: I.SADDLE, count: 1 })],
    [3, () => ({ id: CB.END_ROD, count: 2 + r.int(4) })], [2, () => ({ id: I.ENDER_PEARL, count: 1 + r.int(3) })], [11, () => gear(r)],
  ];
  const total = table.reduce((n, t) => n + t[0], 0);
  for (let i = 0, n = 2 + r.int(5); i < n; i++) { let q = r.int(total); for (const [w, mk] of table) if ((q -= w) < 0) { putIn(mk()); break; } }
  return items;
}



import { Rng, hash2 } from '../rng';
import { B, X, XV, makeBlock, FACING_DIRS } from '../blocks';
import { I, toolId, armorId } from '../items';
import type { ItemStack } from '../inventory';
import type { GenBlockEntity } from './WorldGenerator';
import { planBastion, type BastionPlan } from './bastion';

export const FORT_REGION = 432;
const L = 12;
const NB = X(XV.NETHER_BRICKS), FENCE = B.NETHER_BRICK_FENCE, SOUL = X(XV.SOUL_SAND);
const STAIR_MAT = 18;
const DIRS: [number, number][] = [[1, 0], [0, 1], [-1, 0], [0, -1]];

export type FortKind = 'cross' | 'spawner' | 'stairs' | 'well' | 'hall' | 'turn' | 'wart' | 'balcony';
export interface FortNode { i: number; j: number; kind: FortKind; ext: boolean; links: boolean[]; entry: number; chest?: boolean; seed: number }
export interface FortEdge { a: number; b: number; ext: boolean; dir: number }
export interface FortressPlan { minLevel: number; seed: number; ox: number; oz: number; y: number; nodes: FortNode[]; edges: FortEdge[]; x0: number; z0: number; x1: number; z1: number }

const HALF: Record<FortKind, number> = { cross: 4, spawner: 6, stairs: 4, well: 4, hall: 2, turn: 2, wart: 6, balcony: 3 };
const cache = new Map<string, FortressPlan | null>();

export function planFortress(seed: number, rx: number, rz: number): FortressPlan | null {
  const key = `${seed}:${rx}:${rz}`;
  if (cache.has(key)) return cache.get(key)!;
  const r = new Rng(hash2(rx, rz, seed ^ 0x466f7274));
  let plan: FortressPlan | null = null;
  if (r.next() < 0.4) plan = build(r, rx * FORT_REGION + r.int(23) * 16 + 11, rz * FORT_REGION + r.int(23) * 16 + 11, 48 + r.int(16));
  if (cache.size > 64) cache.delete(cache.keys().next().value!);
  cache.set(key, plan);
  return plan;
}

function build(r: Rng, ox: number, oz: number, y: number, minLevel = 6): FortressPlan {
  const nodes: FortNode[] = [], edges: FortEdge[] = [];
  const occ = new Set<string>();
  const k = (i: number, j: number) => `${i},${j}`;
  const add = (i: number, j: number, kind: FortKind, ext: boolean, entry: number): number => {
    nodes.push({ i, j, kind, ext, links: [false, false, false, false], entry, seed: r.int(1 << 30) });
    occ.add(k(i, j));
    return nodes.length - 1;
  };
  const link = (a: number, b: number, dir: number, ext: boolean) => { edges.push({ a, b, ext, dir }); nodes[a].links[dir] = true; nodes[b].links[(dir + 2) & 3] = true; };
  const free = (i: number, j: number) => !occ.has(k(i, j)) && Math.abs(i) <= 6 && Math.abs(j) <= 6;
  const count: Partial<Record<FortKind, number>> = {};
  const inc = (kind: FortKind) => { count[kind] = (count[kind] ?? 0) + 1; };
  add(0, 0, 'cross', true, 0); inc('cross');
  const tryExt = (from: number, kind: FortKind): number => {
    const n = nodes[from];
    const order = [0, 1, 2, 3].sort(() => r.next() - 0.5);
    for (const d of order) {
      const [dx, dz] = DIRS[d];
      if (n.links[d] || !free(n.i + dx, n.j + dz) || !free(n.i + dx * 2, n.j + dz * 2)) continue;
      occ.add(k(n.i + dx, n.j + dz));
      const id = add(n.i + dx * 2, n.j + dz * 2, kind, true, (d + 2) & 3);
      link(from, id, d, true);
      inc(kind);
      return id;
    }
    return -1;
  };
  const crosses = [0];
  for (let it = 0; it < 40; it++) {
    const from = crosses[r.int(crosses.length)];
    const want: FortKind = (count.cross ?? 0) < 6 && r.next() < 0.55 ? 'cross'
      : (count.spawner ?? 0) < 2 ? 'spawner' : (count.well ?? 0) < 1 ? 'well' : (count.stairs ?? 0) < 2 && r.next() < 0.5 ? 'stairs' : 'cross';
    if (want === 'cross' && (count.cross ?? 0) >= 6) continue;
    const id = tryExt(from, want);
    if (id >= 0 && want === 'cross') crosses.push(id);
    if ((count.cross ?? 0) >= 6 && (count.spawner ?? 0) >= 2 && (count.well ?? 0) >= 1 && (count.stairs ?? 0) >= 2) break;
  }
  const well = nodes.findIndex((n) => n.kind === 'well');
  if (well >= 0) {
    const inner: number[] = [];
    let budget = 12 + r.int(6), wellUsed = false;
    for (let it = 0; it < 200 && budget > 0; it++) {
      const from = !wellUsed ? well : inner[r.next() < 0.7 ? Math.max(0, inner.length - 1 - r.int(3)) : r.int(inner.length)];
      if (from === undefined) break;
      const n = nodes[from];
      const d = r.int(4);
      if (n.links[d]) continue;
      const [dx, dz] = DIRS[d];
      if (!free(n.i + dx, n.j + dz)) continue;
      let kind: FortKind = 'turn';
      if (from !== well && inner.length > 3 && (count.wart ?? 0) < 2 && r.next() < 0.18) kind = 'wart';
      else if (from !== well && inner.length > 2 && (count.balcony ?? 0) < 2 && r.next() < 0.12) kind = 'balcony';
      if (kind === 'wart') {
        let roomy = true;
        for (const [ax, az] of DIRS) { const ni = n.i + dx + ax, nj = n.j + dz + az; if ((ni !== n.i || nj !== n.j) && occ.has(k(ni, nj))) roomy = false; }
        if (!roomy) kind = 'turn';
      }
      const id = add(n.i + dx, n.j + dz, kind, false, (d + 2) & 3);
      link(from, id, d, false);
      inc(kind);
      budget--;
      wellUsed = true;
      if (kind === 'turn') inner.push(id);
    }
    for (const n of nodes) {
      if (n.kind !== 'turn') continue;
      const c = n.links.filter(Boolean).length;
      if (c >= 3 && (count.hall ?? 0) < 5) { n.kind = 'hall'; inc('hall'); }
      else if (c === 1 || (c === 2 && !(n.links[0] && n.links[2]) && !(n.links[1] && n.links[3]))) n.chest = r.next() < 0.34 || c === 1;
    }
  }
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const n of nodes) {
    const h = HALF[n.kind] + 1;
    x0 = Math.min(x0, ox + n.i * L - h); x1 = Math.max(x1, ox + n.i * L + h);
    z0 = Math.min(z0, oz + n.j * L - h); z1 = Math.max(z1, oz + n.j * L + h);
  }
  return { minLevel, seed: hash2(ox, oz, y), ox, oz, y, nodes, edges, x0, z0, x1, z1 };
}

export type BiomeFn = (x: number, z: number) => string;
export interface RegionPlan { fort: FortressPlan | null; bastion: BastionPlan | null }
const regionCache = new Map<string, RegionPlan>();

export function planRegion(seed: number, rx: number, rz: number, biome?: BiomeFn): RegionPlan {
  const fort = planFortress(seed, rx, rz);
  if (fort || !biome) return { fort, bastion: null };
  const key = `${seed}:${rx}:${rz}`;
  const hit = regionCache.get(key);
  if (hit) return hit;
  const r = new Rng(hash2(rx, rz, seed ^ 0x42617374));
  const x = rx * FORT_REGION + r.int(23) * 16 + 8, z = rz * FORT_REGION + r.int(23) * 16 + 8;
  const out: RegionPlan = biome(x, z) === 'basalt_deltas' ? { fort: build(r, x, z, 48 + r.int(16), 7), bastion: null } : { fort: null, bastion: planBastion(r, x, z) };
  if (regionCache.size > 64) regionCache.delete(regionCache.keys().next().value!);
  regionCache.set(key, out);
  return out;
}

function regionsNear<T extends { x0: number; z0: number; x1: number; z1: number }>(x0: number, z0: number, x1: number, z1: number, pick: (rx: number, rz: number) => T | null): T[] {
  const out: T[] = [];
  const pad = 96;
  for (let rx = Math.floor((x0 - pad) / FORT_REGION); rx <= Math.floor((x1 + pad) / FORT_REGION); rx++)
    for (let rz = Math.floor((z0 - pad) / FORT_REGION); rz <= Math.floor((z1 + pad) / FORT_REGION); rz++) {
      const p = pick(rx, rz);
      if (p && p.x1 >= x0 && p.x0 <= x1 && p.z1 >= z0 && p.z0 <= z1) out.push(p);
    }
  return out;
}

export function fortressesNear(seed: number, x0: number, z0: number, x1: number, z1: number, biome?: BiomeFn): FortressPlan[] {
  return regionsNear(x0, z0, x1, z1, (rx, rz) => planRegion(seed, rx, rz, biome).fort);
}

export function bastionsNear(seed: number, x0: number, z0: number, x1: number, z1: number, biome: BiomeFn): BastionPlan[] {
  return regionsNear(x0, z0, x1, z1, (rx, rz) => planRegion(seed, rx, rz, biome).bastion);
}

export function fortressAt(seed: number, x: number, z: number, biome?: BiomeFn): FortressPlan | null {
  return fortressesNear(seed, x, z, x, z, biome)[0] ?? null;
}

export function fortressLoot(r: Rng): (ItemStack | null)[] {
  const items: (ItemStack | null)[] = new Array(27).fill(null);
  const table: [number, () => ItemStack][] = [
    [15, () => ({ id: I.GOLD_INGOT, count: 1 + r.int(3) })], [5, () => ({ id: I.NETHER_WART, count: 3 + r.int(5) })],
    [5, () => ({ id: I.IRON_INGOT, count: 1 + r.int(5) })], [5, () => ({ id: I.AETHERITE, count: 1 + r.int(3) })],
    [5, () => ({ id: I.FLINT_AND_STEEL, count: 1 })], [5, () => ({ id: toolId(3, 3), count: 1 })],
    [5, () => ({ id: armorId(2, 1), count: 1 })], [2, () => ({ id: B.OBSIDIAN, count: 2 + r.int(3) })],
    [4, () => ({ id: I.BLAZE_ROD, count: 1 + r.int(2) })],
    [10, () => ({ id: I.SADDLE, count: 1 })],
  ];
  const total = table.reduce((n, t) => n + t[0], 0);
  const rolls = 2 + r.int(3);
  for (let i = 0; i < rolls; i++) {
    let q = r.int(total);
    for (const [w, mk] of table) if ((q -= w) < 0) { let slot = r.int(27); for (let t = 0; t < 27 && items[slot]; t++) slot = (slot + 1) % 27; items[slot] = mk(); break; }
  }
  return items;
}

type Get = (x: number, y: number, z: number) => number;
type Set = (x: number, y: number, z: number, v: number) => void;

const facingOf = (dx: number, dz: number) => FACING_DIRS.findIndex(([a, b]) => a === dx && b === dz);
const stairs = (dx: number, dz: number) => makeBlock(B.STAIRS, STAIR_MAT | (facingOf(dx, dz) << 5));

export function stampFortress(p: FortressPlan, bx: number, bz: number, S: number, set: Set, get: Get, entities: GenBlockEntity[]): void {
  if (p.x1 < bx || p.x0 >= bx + S || p.z1 < bz || p.z0 >= bz + S) return;
  const inC = (x: number, z: number) => x >= bx && x < bx + S && z >= bz && z < bz + S;
  const put = (x: number, y: number, z: number, v: number) => { if (inC(x, z) && y > 0 && y < 127) set(x - bx, y, z - bz, v); };
  const at = (x: number, y: number, z: number) => (inC(x, z) ? get(x - bx, y, z - bz) : -1);
  const pier = (x: number, z: number, top: number) => {
    if (!inC(x, z)) return;
    for (let y = top; y > 1; y--) {
      const v = at(x, y, z);
      if (v !== 0 && v !== B.LAVA && v !== B.FIRE) break;
      put(x, y, z, NB);
    }
  };
  const Y = p.y;
  const cx = (n: FortNode) => p.ox + n.i * L, cz = (n: FortNode) => p.oz + n.j * L;
  const near = (x0: number, z0: number, x1: number, z1: number) => x1 >= bx && x0 < bx + S && z1 >= bz && z0 < bz + S;
  const segs: { e: FortEdge; a: FortNode; b: FortNode; ax: number; az: number; len: number }[] = [];
  for (const e of p.edges) {
    const a = p.nodes[e.a], b = p.nodes[e.b];
    const [dx, dz] = DIRS[e.dir];
    const s0 = HALF[a.kind] + 1, s1 = (Math.abs(b.i - a.i) + Math.abs(b.j - a.j)) * L - HALF[b.kind] - 1;
    segs.push({ e, a, b, ax: cx(a) + dx * s0, az: cz(a) + dz * s0, len: s1 - s0 + 1 });
  }
  const segCells = (sg: (typeof segs)[number], fn: (x: number, z: number, along: number, w: number, dx: number, dz: number) => void) => {
    const [dx, dz] = DIRS[sg.e.dir];
    for (let t = 0; t < sg.len; t++) for (let w = -2; w <= 2; w++) fn(sg.ax + dx * t + -dz * w, sg.az + dz * t + dx * w, (dx ? sg.ax + dx * t : sg.az + dz * t), w, dx, dz);
  };
  const box = (n: FortNode, h: number, fn: (x: number, z: number, u: number, v: number) => void) => {
    const x = cx(n), z = cz(n), [fx, fz] = DIRS[n.entry];
    for (let oz = -h; oz <= h; oz++) for (let ox = -h; ox <= h; ox++) fn(x + ox, z + oz, -ox * fz + oz * fx, ox * fx + oz * fz);
  };
  const extLink = (ni: number, d: number) => p.edges.some((e) => e.ext ? false : (e.a === ni && e.dir === d) || (e.b === ni && ((e.dir + 2) & 3) === d)) ? false : true;
  const segNear = (sg: (typeof segs)[number]) => { const [dx, dz] = DIRS[sg.e.dir]; const ex = sg.ax + dx * (sg.len - 1), ez = sg.az + dz * (sg.len - 1); return near(Math.min(sg.ax, ex) - 3, Math.min(sg.az, ez) - 3, Math.max(sg.ax, ex) + 3, Math.max(sg.az, ez) + 3); };
  const nodeNear = (n: FortNode) => near(cx(n) - HALF[n.kind] - 1, cz(n) - HALF[n.kind] - 1, cx(n) + HALF[n.kind] + 1, cz(n) + HALF[n.kind] + 1);

  for (const sg of segs) if (segNear(sg)) segCells(sg, (x, z) => { for (let y = Y + 1; y <= Y + (sg.e.ext ? 4 : 4); y++) put(x, y, z, 0); });
  for (const n of p.nodes) if (nodeNear(n)) { const h = HALF[n.kind]; const top = n.kind === 'wart' ? Y + 8 : n.kind === 'spawner' ? Y + 8 : Y + 6; box(n, h, (x, z) => { for (let y = Y + 1; y <= top; y++) put(x, y, z, 0); }); }

  for (const sg of segs) {
    if (!segNear(sg)) continue;
    segCells(sg, (x, z, along, w) => {
      const m = ((along % 8) + 8) % 8;
      put(x, Y, z, NB);
      if (sg.e.ext) {
        if (m === 0 || m === 7 || m === 1 || m === 6 || m === 2) put(x, Y - 1, z, NB);
        if (m === 0 || m === 7 || m === 1) put(x, Y - 2, z, NB);
        if (m === 0) pier(x, z, Y - 3);
        if (Math.abs(w) === 2) { put(x, Y + 1, z, NB); put(x, Y + 2, z, FENCE); }
      } else {
        put(x, Y - 1, z, NB);
        if (m === 0) pier(x, z, Y - 2);
        put(x, Y + 5, z, NB);
        if (Math.abs(w) === 2) for (let y = Y + 1; y <= Y + 4; y++) put(x, y, z, (m === 2 || m === 6) && (y === Y + 2 || y === Y + 3) ? FENCE : NB);
      }
    });
  }

  for (const n of p.nodes) {
    if (!nodeNear(n)) continue;
    const x = cx(n), z = cz(n), h = HALF[n.kind];
    const nr = new Rng(n.seed);
    const [fx, fz] = DIRS[n.entry];
    const W = (u: number, v: number): [number, number] => [x + fx * v - fz * u, z + fz * v + fx * u];
    const ni = p.nodes.indexOf(n);
    const opening = (wx: number, wz: number) => {
      for (let d = 0; d < 4; d++) {
        if (!n.links[d]) continue;
        const half = extLink(ni, d) ? 2 : 1;
        const [dx, dz] = DIRS[d];
        const ox = x + dx * h, oz = z + dz * h;
        if ((dx !== 0 && wx === ox && Math.abs(wz - z) <= half) || (dz !== 0 && wz === oz && Math.abs(wx - x) <= half)) return true;
      }
      return false;
    };
    const walls = (top: number, roof: boolean, winEvery: number) => {
      box(n, h, (wx, wz, u, v) => {
        put(wx, Y, wz, NB); put(wx, Y - 1, wz, NB);
        const edge = Math.abs(u) === h || Math.abs(v) === h;
        if (roof) put(wx, top + 1, wz, NB);
        if (!edge) return;
        const corner = Math.abs(u) === h && Math.abs(v) === h;
        const open = !corner && opening(wx, wz);
        for (let y = Y + 1; y <= top; y++) {
          if (open && y <= Y + 3) { put(wx, y, wz, 0); continue; }
          const along = Math.abs(u) === h ? v : u;
          const win = !corner && winEvery > 0 && (y === Y + 2 || y === Y + 3) && ((along % winEvery) + winEvery) % winEvery === 0 && Math.abs(along) < h - 1;
          put(wx, y, wz, win ? FENCE : NB);
        }
      });
    };
    for (const [px, pz] of [[x, z], [x - h, z - h], [x + h, z - h], [x - h, z + h], [x + h, z + h]]) pier(px, pz, Y - 2);
    switch (n.kind) {
      case 'cross': {
        box(n, h, (wx, wz, u, v) => {
          put(wx, Y, wz, NB); put(wx, Y - 1, wz, NB);
          if (Math.abs(u) <= 1 && Math.abs(v) <= 1) put(wx, Y - 2, wz, NB);
          const edge = Math.abs(u) === h || Math.abs(v) === h;
          if (!edge) return;
          if (Math.abs(u) === h && Math.abs(v) === h) { for (let y = Y + 1; y <= Y + 4; y++) put(wx, y, wz, NB); put(wx, Y + 5, wz, FENCE); return; }
          if (opening(wx, wz)) return;
          put(wx, Y + 1, wz, NB); put(wx, Y + 2, wz, FENCE);
        });
        for (let u = -1; u <= 1; u++) for (let v = -1; v <= 1; v++) { const [a, b] = W(u, v); pier(a, b, Y - 3); }
        break;
      }
      case 'spawner': {
        box(n, h, (wx, wz, u, v) => {
          const d = v;
          if (Math.abs(u) <= 3 && Math.abs(v) <= 3) { for (let y = Y; y <= Y + 3; y++) put(wx, y, wz, NB); return; }
          if (Math.abs(u) <= 1 && d >= 4 && d <= 6) {
            put(wx, Y, wz, NB);
            const step = 6 - d;
            for (let y = Y + 1; y <= Y + step; y++) put(wx, y, wz, NB);
            put(wx, Y + 1 + step, wz, stairs(-fx, -fz));
          }
        });
        for (let u = -3; u <= 3; u++) for (let v = -3; v <= 3; v++) { const [a, b] = W(u, v); if (!(u === 0 && v === 0)) put(a, Y + 4, b, Math.abs(u) === 3 || Math.abs(v) === 3 ? (Math.abs(u) <= 1 && v === 3 ? 0 : FENCE) : 0); }
        const [sx, sz] = W(0, 0);
        put(sx, Y + 4, sz, B.SPAWNER);
        if (inC(sx, sz)) entities.push({ x: sx - bx, y: Y + 4, z: sz - bz, type: 'spawner', items: [], mob: 'flarewisp' });
        for (const [u, v] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) { const [a, b] = W(u, v); pier(a, b, Y - 1); }
        break;
      }
      case 'stairs': {
        walls(Y + 5, true, 3);
        for (let s = 0; s < 6; s++) {
          const [a, b] = W(-3 + s, -3);
          for (let y = Y + 1; y < Y + 1 + s; y++) put(a, y, b, NB);
          put(a, Y + 1 + s, b, stairs(-fz, fx));
          const [a2, b2] = W(-3 + s, -2);
          if (s >= 2) put(a2, Y + 6, b2, 0);
        }
        for (let s = 2; s < 6; s++) { const [a, b] = W(-3 + s, -3); put(a, Y + 6, b, 0); }
        box(n, h, (wx, wz, u, v) => { if (Math.abs(u) === h || Math.abs(v) === h) put(wx, Y + 7, wz, FENCE); });
        break;
      }
      case 'well': {
        walls(Y + 5, true, 3);
        for (let u = -1; u <= 1; u++) for (let v = -1; v <= 1; v++) { const [a, b] = W(u, v); put(a, Y + 1, b, u === 0 && v === 0 ? B.LAVA : NB); }
        const [a, b] = W(0, 0);
        put(a, Y, b, NB);
        break;
      }
      case 'hall': case 'turn': {
        walls(Y + 4, true, n.kind === 'hall' ? 0 : 2);
        if (n.chest) {
          for (let d = 0; d < 4; d++) {
            if (n.links[d]) continue;
            const [dx, dz] = DIRS[d];
            const wx = x + dx, wz = z + dz;
            put(wx, Y + 1, wz, makeBlock(B.CHEST, Math.max(0, facingOf(-dx, -dz))));
            if (inC(wx, wz)) entities.push({ x: wx - bx, y: Y + 1, z: wz - bz, type: 'chest', items: fortressLoot(new Rng(n.seed ^ 0x77)) });
            break;
          }
        }
        break;
      }
      case 'wart': {
        walls(Y + 7, true, 3);
        for (let u = -5; u <= 5; u++) for (let v = -5; v <= 4; v++) {
          const [a, b] = W(u, v);
          if (Math.abs(u) >= 3 && v >= -2) { put(a, Y, b, SOUL); put(a, Y + 1, b, makeBlock(B.NETHER_WART, nr.int(4))); }
          if (v <= -3) for (let y = Y + 1; y <= Y + 4; y++) put(a, y, b, NB);
        }
        for (let s = 0; s < 4; s++) for (let u = -1; u <= 1; u++) {
          const [a, b] = W(u, 1 - s);
          for (let y = Y + 1; y < Y + 1 + s; y++) put(a, y, b, NB);
          put(a, Y + 1 + s, b, stairs(-fx, -fz));
        }
        for (let u = -5; u <= 5; u++) if (Math.abs(u) > 1) { const [a, b] = W(u, -3); put(a, Y + 5, b, FENCE); }
        break;
      }
      case 'balcony': {
        box(n, h, (wx, wz, u, v) => {
          put(wx, Y, wz, NB); put(wx, Y - 1, wz, NB);
          const edge = Math.abs(u) === h || Math.abs(v) === h;
          if (!edge || opening(wx, wz)) return;
          if (Math.abs(u) === h && Math.abs(v) === h) { for (let y = Y + 1; y <= Y + 4; y++) put(wx, y, wz, NB); return; }
          put(wx, Y + 1, wz, FENCE);
        });
        break;
      }
    }
  }
}

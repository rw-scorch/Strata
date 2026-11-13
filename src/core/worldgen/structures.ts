import { B, makeBlock, FACING_DIRS } from '../blocks';
import { I, toolId, armorId } from '../items';
import { Rng, hash2, mix32 } from '../rng';
import type { ItemStack } from '../inventory';
import type { GenBlockEntity } from './WorldGenerator';

export interface Box { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number }
type Side = 0 | 1 | 2 | 3;
const DIRS: [number, number][] = [[1, 0], [0, 1], [-1, 0], [0, -1]];

export interface Piece {
  kind: string;
  box: Box;
  room: boolean;
  doors: Side[];
  axis?: 'x' | 'z';
  seed: number;
  decor?: [number, number, number, number][];
  ents?: GenBlockEntity[];
}

export interface StructurePlan { type: 'stronghold' | 'trial'; id: string; bounds: Box; pieces: Piece[]; x: number; y: number; z: number }

type Setter = (x: number, y: number, z: number, v: number) => void;

const overlaps = (a: Box, b: Box) => a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0 && a.z0 <= b.z1 && a.z1 >= b.z0;

function roomBox(cx: number, y: number, cz: number, w: number, h: number, d: number): Box {
  const hw = Math.floor(w / 2), hd = Math.floor(d / 2);
  return { x0: cx - hw, y0: y, z0: cz - hd, x1: cx - hw + w - 1, y1: y + h - 1, z1: cz - hd + d - 1 };
}

interface Style {
  rooms: [string, number][];
  size(kind: string): [number, number, number];
  corridor: [number, number];
  maxPieces: number;
  maxDepth: number;
}

function layout(rng: Rng, start: Piece, st: Style, finalKind: string | null): Piece[] {
  const pieces: Piece[] = [start];
  const open: { room: Piece; depth: number }[] = [{ room: start, depth: 0 }];
  let deepest: { room: Piece; depth: number } = open[0];
  while (open.length && pieces.length < st.maxPieces) {
    const cur = open.shift()!;
    if (cur.depth >= st.maxDepth) continue;
    for (let side = 0 as Side; side < 4; side = (side + 1) as Side) {
      if (cur.room.doors.includes(side) || !rng.chance(cur.depth === 0 ? 0.95 : 0.62)) continue;
      const [dx, dz] = DIRS[side];
      const b = cur.room.box;
      const cx = Math.floor((b.x0 + b.x1) / 2), cz = Math.floor((b.z0 + b.z1) / 2);
      const len = st.corridor[0] + rng.int(st.corridor[1] - st.corridor[0] + 1);
      const ex = dx > 0 ? b.x1 + 1 : dx < 0 ? b.x0 - 1 : cx, ez = dz > 0 ? b.z1 + 1 : dz < 0 ? b.z0 - 1 : cz;
      const fx = ex + dx * (len - 1), fz = ez + dz * (len - 1);
      const cor: Piece = {
        kind: 'corridor', room: false, doors: [], axis: dx ? 'x' : 'z', seed: rng.nextU32(),
        box: dx ? { x0: Math.min(ex, fx), x1: Math.max(ex, fx), y0: b.y0, y1: b.y0 + 4, z0: cz - 2, z1: cz + 2 } : { x0: cx - 2, x1: cx + 2, y0: b.y0, y1: b.y0 + 4, z0: Math.min(ez, fz), z1: Math.max(ez, fz) },
      };
      let total = 0;
      for (const [, w] of st.rooms) total += w;
      let pick = rng.next() * total, kind = st.rooms[0][0];
      for (const [k, w] of st.rooms) { if ((pick -= w) < 0) { kind = k; break; } }
      const [w, h, d] = st.size(kind);
      const ncx = dx ? fx + dx * (Math.floor(w / 2) + 1) : cx, ncz = dz ? fz + dz * (Math.floor(d / 2) + 1) : cz;
      const room: Piece = { kind, room: true, doors: [((side + 2) % 4) as Side], seed: rng.nextU32(), box: roomBox(ncx, b.y0, ncz, w, h, d) };
      if (room.box.y0 < 4) continue;
      if (pieces.some((p) => overlaps(p.box, cor.box) || overlaps(p.box, room.box))) continue;
      cur.room.doors.push(side);
      pieces.push(cor, room);
      const next = { room, depth: cur.depth + 1 };
      open.push(next);
      if (next.depth > deepest.depth) deepest = next;
      if (pieces.length >= st.maxPieces) break;
    }
  }
  if (finalKind && deepest.room !== start) deepest.room.kind = finalKind;
  return pieces;
}

function bounds(pieces: Piece[]): Box {
  const b = { ...pieces[0].box };
  for (const p of pieces) { b.x0 = Math.min(b.x0, p.box.x0); b.y0 = Math.min(b.y0, p.box.y0); b.z0 = Math.min(b.z0, p.box.z0); b.x1 = Math.max(b.x1, p.box.x1); b.y1 = Math.max(b.y1, p.box.y1); b.z1 = Math.max(b.z1, p.box.z1); }
  return b;
}

function lootFrom(r: Rng, table: [number, number, number, number][], slots = 27): (ItemStack | null)[] {
  const items: (ItemStack | null)[] = new Array(slots).fill(null);
  for (const [id, a, b, p] of table) {
    if (!r.chance(p)) continue;
    let slot = r.int(slots);
    for (let k = 0; k < slots && items[slot]; k++) slot = (slot + 1) % slots;
    items[slot] = { id, count: a + r.int(b - a + 1) };
  }
  return items;
}

const LIBRARY: [number, number, number, number][] = [[I.BOOK, 1, 3, 0.8], [I.PAPER, 2, 7, 0.7], [I.EMERALD, 1, 2, 0.25], [I.IRON_INGOT, 1, 3, 0.3], [I.GOLDEN_APPLE, 1, 1, 0.06], [I.AETHERITE, 1, 1, 0.1]];
const STORE: [number, number, number, number][] = [[I.BREAD, 1, 4, 0.6], [I.APPLE, 1, 3, 0.5], [I.COAL, 3, 8, 0.5], [I.IRON_INGOT, 1, 5, 0.6], [I.GOLD_INGOT, 1, 3, 0.35], [I.AETHERITE, 1, 2, 0.14], [armorId(1, 1), 1, 1, 0.1], [armorId(1, 0), 1, 1, 0.1], [toolId(2, 3), 1, 1, 0.12], [toolId(2, 0), 1, 1, 0.12], [I.GOLDEN_APPLE, 1, 1, 0.05], [I.BUCKET, 1, 1, 0.2]];
const SUPPLY: [number, number, number, number][] = [[I.ARROW, 4, 14, 0.7], [I.BREAD, 2, 5, 0.6], [I.COPPER_INGOT, 2, 8, 0.6], [B.TORCH, 4, 12, 0.5], [I.COOKED_PORK, 1, 4, 0.4], [I.BOW, 1, 1, 0.15], [B.TUFF_BRICKS, 8, 16, 0.3], [I.EMERALD, 1, 2, 0.2]];

export function trialLoot(r: Rng): ItemStack[] {
  const out: ItemStack[] = [{ id: I.TRIAL_KEY, count: 1 }];
  const t: [number, number, number][] = [[I.ARROW, 4, 8], [I.BREAD, 2, 4], [I.EMERALD, 1, 3], [I.IRON_INGOT, 1, 3], [I.COPPER_INGOT, 2, 6], [I.COOKED_PORK, 1, 3]];
  for (let i = 0, n = 1 + r.int(2); i < n; i++) { const [id, a, b] = t[r.int(t.length)]; out.push({ id, count: a + r.int(b - a + 1) }); }
  if (r.chance(0.05)) out.push({ id: I.GOLDEN_APPLE, count: 1 });
  return out;
}

export function vaultLoot(r: Rng): ItemStack[] {
  const out: ItemStack[] = [];
  const t: [number, number, number, number][] = [[I.EMERALD, 2, 4, 3], [I.AETHERITE, 1, 2, 2], [B.IRON_BLOCK, 1, 1, 1], [I.GOLDEN_APPLE, 1, 1, 1], [I.ARROW, 8, 16, 2], [B.COPPER_BLOCK, 1, 2, 2], [toolId(4, 0), 1, 1, 0.3], [toolId(4, 3), 1, 1, 0.3], [I.BOW, 1, 1, 1]];
  const total = t.reduce((n, x) => n + x[3], 0);
  for (let i = 0, n = 2 + r.int(3); i < n; i++) {
    let pick = r.next() * total;
    for (const [id, a, b, w] of t) { if ((pick -= w) < 0) { out.push({ id, count: a + r.int(b - a + 1) }); break; } }
  }
  return out;
}

const wallTorch = (dx: number, dz: number) => makeBlock(B.TORCH, FACING_DIRS.findIndex(([a, c]) => a === dx && c === dz) + 1);

function sbrick(seed: number, x: number, y: number, z: number): number {
  const h = hash2(x * 31 + y, z * 17 - y, seed) & 15;
  return h < 3 ? B.MOSSY_STONE_BRICKS : h < 5 ? B.CRACKED_STONE_BRICKS : B.STONE_BRICKS;
}

function decorate(plan: StructurePlan, p: Piece, secret: number): void {
  if (p.decor) return;
  const d: [number, number, number, number][] = [];
  const ents: GenBlockEntity[] = [];
  const r = new Rng(mix32(p.seed ^ secret));
  const b = p.box;
  const cx = Math.floor((b.x0 + b.x1) / 2), cz = Math.floor((b.z0 + b.z1) / 2), fy = b.y0 + 1;
  const chest = (x: number, y: number, z: number, table: [number, number, number, number][]) => { d.push([x, y, z, B.CHEST]); ents.push({ x, y, z, type: 'chest', items: lootFrom(r, table) }); };
  const st = plan.type === 'stronghold';
  if (p.kind === 'corridor') {
    const len = p.axis === 'x' ? b.x1 - b.x0 : b.z1 - b.z0;
    for (let i = 2; i < len; i += 6) {
      const x = p.axis === 'x' ? b.x0 + i : b.x0 + 1, z = p.axis === 'x' ? b.z0 + 1 : b.z0 + i;
      if (st) { if (r.chance(0.6)) d.push([x, fy + 2, z, p.axis === 'x' ? wallTorch(0, -1) : wallTorch(-1, 0)]); }
      else d.push([p.axis === 'x' ? x : cx, b.y1, p.axis === 'x' ? cz : z, B.COPPER_LAMP]);
    }
    if (st && r.chance(0.12)) chest(p.axis === 'x' ? cx : b.x1 - 1, fy, p.axis === 'x' ? b.z1 - 1 : cz, STORE);
  } else if (p.kind === 'library') {
    for (let x = b.x0 + 1; x < b.x1; x++) for (let z = b.z0 + 1; z < b.z1; z++) {
      const wall = x === b.x0 + 1 || x === b.x1 - 1 || z === b.z0 + 1 || z === b.z1 - 1;
      const nearDoor = Math.abs(x - cx) <= 1 || Math.abs(z - cz) <= 1;
      if (wall && !nearDoor) for (let y = fy; y < b.y1 - 1; y++) d.push([x, y, z, B.BOOKSHELF]);
      if (!wall && (x - b.x0) % 4 === 0 && (z - cz) % 2 !== 0 && Math.abs(z - cz) > 1 && Math.abs(x - cx) > 1) for (let y = fy; y < fy + 3; y++) d.push([x, y, z, B.BOOKSHELF]);
    }
    chest(b.x0 + 2, fy, b.z0 + 2, LIBRARY);
    if (r.chance(0.6)) chest(b.x1 - 2, fy, b.z1 - 2, LIBRARY);
    for (const [x, z] of [[cx - 3, cz], [cx + 3, cz]]) d.push([x, b.y1, z, B.GLOWSTONE]);
  } else if (p.kind === 'fountain') {
    for (let x = cx - 2; x <= cx + 2; x++) for (let z = cz - 2; z <= cz + 2; z++) {
      const rim = Math.abs(x - cx) === 2 || Math.abs(z - cz) === 2;
      d.push([x, fy, z, rim ? B.STONE_BRICKS : B.WATER]);
    }
    for (let y = fy; y < b.y1 - 1; y++) d.push([cx, y, cz, y === fy ? B.WATER : B.CHISELED_STONE_BRICKS]);
    d.push([cx, b.y1 - 1, cz, B.GLOWSTONE]);
  } else if (p.kind === 'storage') {
    chest(b.x0 + 1, fy, b.z0 + 1, STORE);
    chest(b.x1 - 1, fy, b.z0 + 1, STORE);
    if (r.chance(0.5)) chest(b.x0 + 1, fy, b.z1 - 1, STORE);
    d.push([cx, fy + 2, b.z0 + 1, wallTorch(0, -1)]);
    for (let x = b.x0 + 1; x < b.x1; x += 2) d.push([x, fy, b.z1 - 1, B.HAY_BLOCK]);
  } else if (p.kind === 'prison') {
    for (let x = b.x0 + 1; x < b.x1; x++) for (const z of [cz - 2, cz + 2]) if (Math.abs(x - cx) > 1) for (let y = fy; y < fy + 3; y++) d.push([x, y, z, (x - b.x0) % 3 === 0 ? B.STONE_BRICKS : B.GLASS]);
    d.push([cx, b.y1, cz, B.GLOWSTONE]);
  } else if (p.kind === 'cross' || p.kind === 'start') {
    for (const [x, z] of [[cx - 3, cz - 3], [cx + 3, cz - 3], [cx - 3, cz + 3], [cx + 3, cz + 3]]) for (let y = fy; y < b.y1; y++) d.push([x, y, z, st ? B.CHISELED_STONE_BRICKS : B.POLISHED_TUFF]);
    if (st) d.push([cx, b.y1 - 1, cz, B.GLOWSTONE]); else d.push([cx, b.y1, cz, B.COPPER_LAMP]);
  } else if (p.kind === 'portal') {
    for (let x = b.x0 + 1; x < b.x1; x++) for (let z = b.z0 + 1; z < b.z1; z++) {
      const plat = Math.abs(x - cx) <= 3 && Math.abs(z - cz) <= 3;
      if (plat) d.push([x, fy, z, B.STONE_BRICKS]);
      else if (z < cz) d.push([x, b.y0, z, B.LAVA]);
    }
    for (let x = cx - 2; x <= cx + 2; x++) for (let z = cz - 1; z <= cz + 3; z++) {
      const ex = Math.abs(x - cx) === 2, ez = z === cz - 1 || z === cz + 3;
      d.push([x, fy + 1, z, ex && ez ? B.CHISELED_STONE_BRICKS : ex || ez ? B.OBSIDIAN : B.AIR]);
    }
    d.push([cx, fy + 1, cz - 3, B.SPAWNER]);
    ents.push({ x: cx, y: fy + 1, z: cz - 3, type: 'spawner', items: [], mob: 'hollowed' });
    for (const [x, z] of [[b.x0 + 1, b.z1 - 1], [b.x1 - 1, b.z1 - 1]]) d.push([x, fy + 3, z, wallTorch(0, 1)]);
    chest(cx + 3, fy + 1, cz + 3, STORE);
  } else if (p.kind === 'arena' || p.kind === 'big_arena') {
    const big = p.kind === 'big_arena';
    for (let x = b.x0 + 1; x < b.x1; x++) for (let z = b.z0 + 1; z < b.z1; z++) if (((x + z) & 1) === 0 && Math.abs(x - cx) < (big ? 6 : 4) && Math.abs(z - cz) < (big ? 6 : 4)) d.push([x, b.y0, z, B.CUT_COPPER]);
    const mobs = ['hollowed', 'rattlebone', 'duskweaver'];
    const spots: [number, number][] = big ? [[cx - 4, cz - 4], [cx + 4, cz + 4], [cx + 4, cz - 4]] : [[cx, cz]];
    for (const [x, z] of spots) { d.push([x, fy, z, B.TRIAL_SPAWNER]); ents.push({ x, y: fy, z, type: 'trial', items: [], mob: mobs[r.int(3)] }); }
    for (const [x, z] of [[b.x0 + 1, b.z0 + 1], [b.x1 - 1, b.z0 + 1], [b.x0 + 1, b.z1 - 1], [b.x1 - 1, b.z1 - 1]]) for (let y = fy; y < b.y1; y++) d.push([x, y, z, y === fy + 2 ? B.COPPER_LAMP : B.CHISELED_TUFF]);
  } else if (p.kind === 'vault_room') {
    d.push([cx, fy, cz, B.POLISHED_TUFF]);
    d.push([cx, fy + 1, cz, makeBlock(B.VAULT, 0)]);
    ents.push({ x: cx, y: fy + 1, z: cz, type: 'vault', items: [] });
    if (r.chance(0.5)) { d.push([cx + 2, fy, cz, makeBlock(B.VAULT, 0)]); ents.push({ x: cx + 2, y: fy, z: cz, type: 'vault', items: [] }); }
    d.push([cx, b.y1, cz, B.COPPER_LAMP]);
  } else if (p.kind === 'supply') {
    chest(b.x0 + 1, fy, b.z0 + 1, SUPPLY);
    chest(b.x1 - 1, fy, b.z1 - 1, SUPPLY);
    d.push([cx, b.y1, cz, B.COPPER_LAMP]);
  }
  p.decor = d;
  p.ents = ents;
}

const STRONGHOLD: Style = {
  rooms: [['cross', 3], ['library', 2], ['fountain', 2], ['storage', 2], ['prison', 1]],
  size: (k) => (k === 'library' ? [15, 9, 15] : k === 'storage' ? [9, 6, 9] : k === 'prison' ? [11, 6, 11] : [11, 7, 11]),
  corridor: [5, 12], maxPieces: 32, maxDepth: 5,
};
const TRIAL: Style = {
  rooms: [['arena', 3], ['vault_room', 2], ['supply', 2], ['cross', 1]],
  size: (k) => (k === 'big_arena' ? [19, 10, 19] : k === 'arena' ? [13, 8, 13] : k === 'vault_room' ? [9, 6, 9] : k === 'supply' ? [9, 6, 9] : [11, 7, 11]),
  corridor: [4, 9], maxPieces: 18, maxDepth: 3,
};

export const STRONGHOLD_REGION = 1536;
export const TRIAL_REGION = 640;

export function planStronghold(secret: number, rx: number, rz: number, height: (x: number, z: number) => number): StructurePlan | null {
  const r = new Rng(hash2(rx, rz, secret ^ 0x57b0e9d1));
  const x = rx * STRONGHOLD_REGION + 200 + r.int(STRONGHOLD_REGION - 400), z = rz * STRONGHOLD_REGION + 200 + r.int(STRONGHOLD_REGION - 400);
  if (Math.hypot(x, z) < 500) return null;
  const y = Math.max(8, Math.min(30, height(x, z) - 22));
  const start: Piece = { kind: 'start', room: true, doors: [], seed: r.nextU32(), box: roomBox(x, y, z, 11, 7, 11) };
  const pieces = layout(r, start, STRONGHOLD, 'portal');
  return { type: 'stronghold', id: `s${rx},${rz}`, bounds: bounds(pieces), pieces, x, y, z };
}

export function planTrial(secret: number, rx: number, rz: number): StructurePlan | null {
  const r = new Rng(hash2(rx, rz, secret ^ 0x7a1c4e33));
  if (!r.chance(0.65)) return null;
  const x = rx * TRIAL_REGION + 120 + r.int(TRIAL_REGION - 240), z = rz * TRIAL_REGION + 120 + r.int(TRIAL_REGION - 240);
  const y = 10 + r.int(10);
  const start: Piece = { kind: 'big_arena', room: true, doors: [], seed: r.nextU32(), box: roomBox(x, y, z, 19, 10, 19) };
  const pieces = layout(r, start, TRIAL, null);
  return { type: 'trial', id: `t${rx},${rz}`, bounds: bounds(pieces), pieces, x, y, z };
}

function shellBlock(plan: StructurePlan, p: Piece, x: number, y: number, z: number): number {
  if (plan.type === 'stronghold') return sbrick(p.seed, x, y, z);
  const b = p.box;
  if (y === b.y0) return ((x + z) & 3) === 0 ? B.CHISELED_TUFF : B.POLISHED_TUFF;
  if (y === b.y1) return B.TUFF_BRICKS;
  return (y - b.y0) % 4 === 0 ? B.POLISHED_TUFF : B.TUFF_BRICKS;
}

function isDoor(p: Piece, x: number, y: number, z: number): boolean {
  if (!p.room) return false;
  const b = p.box;
  const cx = Math.floor((b.x0 + b.x1) / 2), cz = Math.floor((b.z0 + b.z1) / 2);
  if (y < b.y0 + 1 || y > b.y0 + 3) return false;
  for (const s of p.doors) {
    if (s === 0 && x === b.x1 && Math.abs(z - cz) <= 1) return true;
    if (s === 2 && x === b.x0 && Math.abs(z - cz) <= 1) return true;
    if (s === 1 && z === b.z1 && Math.abs(x - cx) <= 1) return true;
    if (s === 3 && z === b.z0 && Math.abs(x - cx) <= 1) return true;
  }
  return false;
}

export function stampStructure(plan: StructurePlan, secret: number, bx: number, bz: number, size: number, set: Setter, entities: GenBlockEntity[]): void {
  const cx1 = bx + size - 1, cz1 = bz + size - 1;
  for (const p of plan.pieces) {
    const b = p.box;
    if (b.x1 < bx || b.x0 > cx1 || b.z1 < bz || b.z0 > cz1) continue;
    for (let x = Math.max(bx, b.x0); x <= Math.min(cx1, b.x1); x++) for (let z = Math.max(bz, b.z0); z <= Math.min(cz1, b.z1); z++) for (let y = b.y0; y <= b.y1; y++) {
      const edge = y === b.y0 || y === b.y1 || (p.axis === 'x' ? z === b.z0 || z === b.z1 : p.axis === 'z' ? x === b.x0 || x === b.x1 : x === b.x0 || x === b.x1 || z === b.z0 || z === b.z1);
      set(x - bx, y, z - bz, edge && !isDoor(p, x, y, z) ? shellBlock(plan, p, x, y, z) : B.AIR);
    }
    decorate(plan, p, secret);
    for (const [x, y, z, v] of p.decor!) if (x >= bx && x <= cx1 && z >= bz && z <= cz1) set(x - bx, y, z - bz, v);
    for (const e of p.ents!) if (e.x >= bx && e.x <= cx1 && e.z >= bz && e.z <= cz1) entities.push({ ...e, x: e.x - bx, z: e.z - bz, items: e.items.map((s) => (s ? { ...s } : null)) });
  }
}

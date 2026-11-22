import { B, CB, NB, FRAME_EYE, makeBlock, FACING_DIRS, SHAPE_MATS, shapeBlock, SLAB_TOP, STAIRS_UP, sp, SPECIES, FENCE_BASE } from '../blocks';
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

export interface StructurePlan { type: 'stronghold' | 'trial'; id: string; bounds: Box; pieces: Piece[]; x: number; y: number; z: number; v2?: boolean }

type Setter = (x: number, y: number, z: number, v: number) => void;

const overlaps = (a: Box, b: Box) => a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0 && a.z0 <= b.z1 && a.z1 >= b.z0;

function roomBox(cx: number, y: number, cz: number, w: number, h: number, d: number): Box {
  const hw = Math.floor(w / 2), hd = Math.floor(d / 2);
  return { x0: cx - hw, y0: y, z0: cz - hd, x1: cx - hw + w - 1, y1: y + h - 1, z1: cz - hd + d - 1 };
}

interface Style {
  rooms: [string, number][];
  size(kind: string, r?: Rng): [number, number, number];
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
      const [w, h, d] = st.size(kind, rng);
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
  if (r.chance(0.04)) out.push({ id: I.ENCHANTED_BOOK, count: 1, en: { [['wind_burst', 'quick_charge', 'piercing', 'power', 'unbreaking'][r.int(5)]]: 1 } });
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
  if (r.chance(0.25)) {
    const books: [string, number][] = [['wind_burst', 1], ['mending', 1], ['density', 3], ['breach', 2], ['unbreaking', 3], ['efficiency', 4], ['protection', 3], ['sharpness', 4], ['feather_falling', 3], ['lunge', 2]];
    const [k, l] = books[r.int(books.length)];
    out.push({ id: I.ENCHANTED_BOOK, count: 1, en: { [k]: l } });
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
  if (plan.v2 && decorate2(plan, p, secret)) return;
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

const shapeI = (itemId: number) => Math.max(0, SHAPE_MATS.findIndex((m) => m.id === itemId));
const stair = (mat: number, f: number, up = false) => shapeBlock(shapeI(mat), true, ((f & 3) << 5) | (up ? STAIRS_UP : 0));
const slabOf = (mat: number, top = false) => shapeBlock(shapeI(mat), false, top ? SLAB_TOP : 0);
const WEB = makeBlock(NB.COBWEB), BARS = makeBlock(B.IRON_BARS), HANG = makeBlock(B.LANTERN, 1);

function decorate2(plan: StructurePlan, p: Piece, secret: number): boolean {
  const d: [number, number, number, number][] = [];
  const ents: GenBlockEntity[] = [];
  const r = new Rng(mix32(p.seed ^ secret ^ 0x2b2));
  const b = p.box;
  const cx = Math.floor((b.x0 + b.x1) / 2), cz = Math.floor((b.z0 + b.z1) / 2), fy = b.y0 + 1;
  const st = plan.type === 'stronghold';
  const chest = (x: number, y: number, z: number, table: [number, number, number, number][], f = 0) => { d.push([x, y, z, makeBlock(B.CHEST, f)]); ents.push({ x, y, z, type: 'chest', items: lootFrom(r, table) }); };
  const barrel = (x: number, y: number, z: number, table: [number, number, number, number][]) => { d.push([x, y, z, B.BARREL]); ents.push({ x, y, z, type: 'chest', items: lootFrom(r, table) }); };
  const trial = (x: number, y: number, z: number) => { d.push([x, y, z, B.TRIAL_SPAWNER]); ents.push({ x, y, z, type: 'trial', items: [], mob: ['hollowed', 'rattlebone', 'duskweaver'][r.int(3)] }); };
  const lane = (x: number, z: number) => Math.abs(x - cx) <= 1 || Math.abs(z - cz) <= 1;
  const webs = (n: number) => { for (let i = 0; i < n; i++) { const x = b.x0 + 1 + r.int(b.x1 - b.x0 - 1), z = b.z0 + 1 + r.int(b.z1 - b.z0 - 1); if (!lane(x, z)) d.push([x, b.y1 - 1, z, WEB]); } };
  const SB2 = B.STONE_BRICKS, CH = B.CHISELED_STONE_BRICKS;
  const T = B.TUFF_BRICKS, PT = B.POLISHED_TUFF, CT = B.CHISELED_TUFF;
  switch (p.kind) {
    case 'corridor': {
      const len = p.axis === 'x' ? b.x1 - b.x0 : b.z1 - b.z0;
      const at = (i: number, s2: number): [number, number] => (p.axis === 'x' ? [b.x0 + i, cz + s2] : [cx + s2, b.z0 + i]);
      if (st) {
        for (let i = 1; i < len; i++) for (const s2 of [-1, 1]) { const [x, z] = at(i, s2); d.push([x, b.y1 - 1, z, stair(B.STONE_BRICKS, p.axis === 'x' ? (s2 < 0 ? 0 : 2) : (s2 < 0 ? 3 : 1), true)]); }
        for (let i = 3; i < len; i += 6) { const [x, z] = at(i, -1); d.push([x, fy + 1, z, p.axis === 'x' ? wallTorch(0, -1) : wallTorch(-1, 0)]); }
        for (let i = 0; i < len; i++) if (r.chance(0.05)) { const [x, z] = at(i, r.chance(0.5) ? -1 : 1); d.push([x, fy + 2, z, WEB]); }
        if (r.chance(0.3)) { const i = 2 + r.int(Math.max(1, len - 4)); const [x, z] = at(i, 1); const [wx, wz] = at(i, 2); d.push([wx, fy, wz, AIR_B]); chest(wx, fy, wz, STORE, p.axis === 'x' ? 0 : 3); d.push([x, fy + 2, z, wallTorch(p.axis === 'x' ? 0 : 1, p.axis === 'x' ? 1 : 0)]); }
        if (len > 8 && r.chance(0.35)) { const i = Math.floor(len / 2); for (let s2 = -1; s2 <= 1; s2++) { const [x, z] = at(i, s2); d.push([x, fy + 2, z, BARS]); } }
      } else {
        for (let i = 1; i < len; i += 4) { const [x, z] = at(i, 0); d.push([x, b.y1, z, B.COPPER_LAMP]); for (const s2 of [-2, 2]) { const [wx, wz] = at(i, s2); for (let y = fy; y < b.y1; y++) d.push([wx, y, wz, CT]); } }
        for (let i = 0; i < len; i++) { const [x, z] = at(i, 0); d.push([x, b.y0, z, i % 2 ? B.CUT_COPPER : PT]); }
      }
      break;
    }
    case 'pillar_hall': {
      for (let x = cx - 1; x <= cx + 1; x++) for (let z = cz - 1; z <= cz + 1; z++) for (let y = fy; y < b.y1; y++) d.push([x, y, z, (x === cx && z === cz) || y === fy + 2 ? CH : SB2]);
      for (const [dx, dz] of FACING_DIRS) d.push([cx + dx * 2, fy + 2, cz + dz * 2, wallTorch(-dx, -dz)]);
      for (const [x, z] of [[b.x0 + 1, b.z0 + 1], [b.x1 - 1, b.z0 + 1], [b.x0 + 1, b.z1 - 1], [b.x1 - 1, b.z1 - 1]]) for (let y = fy; y < b.y1; y++) d.push([x, y, z, y === fy || y === b.y1 - 1 ? CH : SB2]);
      for (let x = b.x0 + 2; x <= b.x1 - 2; x++) for (const z of [b.z0 + 1, b.z1 - 1]) if (!lane(x, z)) d.push([x, b.y1 - 1, z, stair(B.STONE_BRICKS, z === b.z0 + 1 ? 0 : 2, true)]);
      webs(3);
      break;
    }
    case 'five_way': {
      for (let x = b.x0 + 1; x < b.x1; x++) for (let z = cz + 2; z < b.z1; z++) {
        if (Math.abs(x - cx) <= 1 && z >= b.z1 - 1) continue;
        for (let y = fy; y < fy + 3; y++) d.push([x, y, z, Math.abs(x - cx) <= 1 && y >= fy + (z - cz - 2) ? (y === fy + (z - cz - 2) ? stair(B.STONE_BRICKS, 2) : AIR_B) : SB2]);
        if (z === cz + 2 && Math.abs(x - cx) > 1) d.push([x, fy + 3, z, BARS]);
      }
      for (let k = 0; k < 3; k++) for (let x = cx - 1; x <= cx + 1; x++) d.push([x, fy + k, cz + 2 + k, stair(B.STONE_BRICKS, 2)]);
      for (const x of [b.x0 + 2, b.x1 - 2]) { d.push([x, fy + 5, b.z1 - 1, wallTorch(0, 1)]); d.push([x, fy + 1, b.z0 + 1, wallTorch(0, -1)]); }
      d.push([cx, b.y1 - 1, cz - 2, HANG]);
      if (r.chance(0.5)) chest(b.x0 + 2, fy + 3, b.z1 - 2, STORE, 2);
      webs(4);
      break;
    }
    case 'spiral': {
      for (let y = fy; y < b.y1; y++) d.push([cx, y, cz, y % 4 === 0 ? CH : SB2]);
      const ring: [number, number][] = [];
      for (let i = -1; i <= 1; i++) ring.push([cx + i, cz - 1]);
      ring.push([cx + 1, cz]);
      for (let i = 1; i >= -1; i--) ring.push([cx + i, cz + 1]);
      ring.push([cx - 1, cz]);
      const H = b.y1 - fy - 3;
      for (let k = 0; k <= H; k++) {
        const [x, z] = ring[k % 8], [nx, nz] = ring[(k + 1) % 8];
        const f = FACING_DIRS.findIndex(([a, c]) => a === Math.sign(nx - x) && c === Math.sign(nz - z));
        d.push([x, fy + k, z, stair(B.STONE_BRICKS, f < 0 ? 0 : f)]);
        if (k > 0) d.push([x, fy + k - 1, z, SB2]);
      }
      const top = fy + H + 1;
      for (let x = b.x0 + 1; x < b.x1; x++) for (let z = b.z0 + 1; z < b.z1; z++) if (Math.max(Math.abs(x - cx), Math.abs(z - cz)) >= 2) d.push([x, top - 1, z, Math.max(Math.abs(x - cx), Math.abs(z - cz)) === 2 ? slabOf(B.STONE_BRICKS, true) : SB2]);
      d.push([b.x0 + 1, top, b.z0 + 1, wallTorch(-1, 0)]); d.push([b.x1 - 1, top, b.z1 - 1, wallTorch(1, 0)]);
      d.push([b.x0 + 1, fy + 1, b.z1 - 1, wallTorch(-1, 0)]);
      chest(b.x1 - 1, top, b.z0 + 1, LIBRARY, 3);
      webs(3);
      break;
    }
    case 'small_library': {
      for (let x = b.x0 + 1; x < b.x1; x++) for (let z = b.z0 + 1; z < b.z1; z++) {
        const wall = x === b.x0 + 1 || x === b.x1 - 1 || z === b.z0 + 1 || z === b.z1 - 1;
        if (wall && !lane(x, z)) for (let y = fy; y < b.y1 - 1; y++) d.push([x, y, z, B.BOOKSHELF]);
      }
      d.push([cx, fy, cz + 1, B.LECTERN]);
      d.push([cx - 2, b.y1 - 1, cz, HANG]); d.push([cx + 2, b.y1 - 1, cz, HANG]);
      chest(b.x0 + 2, fy, b.z1 - 2, LIBRARY, 1);
      webs(5);
      break;
    }
    case 'library': {
      for (let x = b.x0 + 1; x < b.x1; x++) for (let z = b.z0 + 1; z < b.z1; z++) {
        const wall = x === b.x0 + 1 || x === b.x1 - 1 || z === b.z0 + 1 || z === b.z1 - 1;
        const nearDoor = lane(x, z);
        if (wall && !nearDoor) for (let y = fy; y < fy + 4; y++) d.push([x, y, z, B.BOOKSHELF]);
        if (wall) for (let y = fy + 6; y < b.y1; y++) d.push([x, y, z, B.BOOKSHELF]);
        const ring = Math.min(x - b.x0, b.x1 - x, z - b.z0, b.z1 - z);
        if (ring <= 3) d.push([x, fy + 5, z, sp(5, SPECIES.DARK_OAK)]);
        if (ring === 3) d.push([x, fy + 6, z, makeBlock(FENCE_BASE + 5)]);
        if (!wall && ring > 3 && (x - b.x0) % 3 === 0 && Math.abs(z - cz) > 1 && Math.abs(x - cx) > 1) for (let y = fy; y < fy + 3; y++) d.push([x, y, z, B.BOOKSHELF]);
      }
      for (let y = fy; y <= fy + 5; y++) d.push([b.x0 + 2, y, b.z0 + 5, makeBlock(B.LADDER, 3)]);
      for (let y = b.y1 - 1; y >= b.y1 - 3; y--) d.push([cx, y, cz, y === b.y1 - 3 ? HANG : makeBlock(FENCE_BASE + 5)]);
      chest(b.x0 + 2, fy, b.z1 - 2, LIBRARY, 1);
      chest(b.x1 - 2, fy + 6, b.z0 + 2, LIBRARY, 3);
      if (r.chance(0.6)) chest(b.x1 - 2, fy, b.z1 - 2, LIBRARY, 3);
      webs(8);
      break;
    }
    case 'prison': {
      for (const side of [-1, 1]) {
        const zr = side < 0 ? b.z0 + 1 : b.z1 - 1, zf = cz + side * 2;
        for (let x = b.x0 + 1; x < b.x1; x++) {
          const div = (x - b.x0) % 4 === 0;
          for (let y = fy; y < b.y1; y++) d.push([x, y, zf, div ? SB2 : Math.abs(x - cx) <= 1 ? (y < fy + 3 ? AIR_B : SB2) : y < fy + 3 ? BARS : SB2]);
          if (div) for (let z = Math.min(zr, zf); z <= Math.max(zr, zf); z++) for (let y = fy; y < b.y1; y++) d.push([x, y, z, SB2]);
        }
        if (r.chance(0.6)) d.push([b.x0 + 2 + r.int(b.x1 - b.x0 - 4), fy, zr, B.COBBLESTONE]);
      }
      for (let x = b.x0 + 2; x < b.x1 - 1; x += 4) d.push([x, fy + 2, cz, HANG]);
      webs(5);
      break;
    }
    case 'storage': {
      chest(b.x0 + 1, fy, b.z0 + 1, STORE, 2); chest(b.x1 - 1, fy, b.z0 + 1, STORE, 2);
      barrel(b.x0 + 1, fy, b.z1 - 1, STORE);
      for (let x = b.x0 + 2; x <= b.x1 - 2; x++) if (!lane(x, b.z1 - 1)) { d.push([x, fy, b.z1 - 1, x & 1 ? B.HAY_BLOCK : B.BARREL]); if (r.chance(0.5)) d.push([x, fy + 1, b.z1 - 1, B.HAY_BLOCK]); }
      d.push([b.x1 - 1, fy, b.z1 - 1, B.CAULDRON]);
      d.push([cx, b.y1 - 1, cz, HANG]);
      webs(3);
      break;
    }
    case 'stairs_hall': {
      for (let x = cx - 3; x <= cx + 3; x++) for (let z = cz - 3; z <= cz + 3; z++) {
        const ring = Math.max(Math.abs(x - cx), Math.abs(z - cz));
        const depth = 3 - ring + 1;
        for (let y = b.y0 - 3; y <= b.y0; y++) d.push([x, y, z, y < b.y0 - depth + 1 ? SB2 : AIR_B]);
        if (ring >= 1) { const f = Math.abs(x - cx) >= Math.abs(z - cz) ? (x > cx ? 3 : 1) : (z > cz ? 0 : 2); d.push([x, b.y0 - depth + 1, z, ring === 3 ? AIR_B : stair(B.STONE_BRICKS, (f + 2) & 3)]); }
      }
      d.push([cx, b.y0 - 3, cz, CH]);
      chest(cx, b.y0 - 2, cz, STORE, 0);
      for (const [x, z] of [[b.x0 + 1, b.z0 + 1], [b.x1 - 1, b.z1 - 1]]) d.push([x, fy + 2, z, wallTorch(x === b.x0 + 1 ? -1 : 1, 0)]);
      webs(3);
      break;
    }
    case 'pit': {
      for (let x = cx - 3; x <= cx + 3; x++) for (let z = cz - 3; z <= cz + 3; z++) {
        const edge = Math.abs(x - cx) === 3 || Math.abs(z - cz) === 3;
        for (let y = b.y0 - 4; y <= b.y0; y++) d.push([x, y, z, y === b.y0 - 4 ? ((x + z) & 1 ? CT : B.CUT_COPPER) : AIR_B]);
        if (edge) d.push([x, b.y0 - 4, z, T]);
      }
      for (let x = cx - 4; x <= cx + 4; x++) for (let z = cz - 4; z <= cz + 4; z++) if (Math.max(Math.abs(x - cx), Math.abs(z - cz)) === 4 && !lane(x, z)) d.push([x, fy, z, slabOf(B.TUFF_BRICKS)]);
      for (let k = 0; k < 4; k++) d.push([cx, b.y0 - k, cz - 3 + k, stair(B.TUFF_BRICKS, 0)]);
      trial(cx - 2, b.y0 - 3, cz + 2); trial(cx + 2, b.y0 - 3, cz + 2);
      for (const [x, z] of [[b.x0 + 1, b.z0 + 1], [b.x1 - 1, b.z0 + 1], [b.x0 + 1, b.z1 - 1], [b.x1 - 1, b.z1 - 1]]) for (let y = fy; y < b.y1; y++) d.push([x, y, z, y === fy + 3 ? B.COPPER_LAMP : CT]);
      break;
    }
    case 'pillar_chamber': {
      for (let x = b.x0 + 1; x < b.x1; x++) for (let z = b.z0 + 1; z < b.z1; z++) d.push([x, b.y0, z, ((x + z) & 1) ? PT : B.CUT_COPPER]);
      for (const ox of [-4, 0, 4]) for (const oz of [-4, 0, 4]) {
        if (!ox && !oz) continue;
        for (let y = fy; y < b.y1; y++) d.push([cx + ox, y, cz + oz, y === fy + 3 ? B.COPPER_LAMP : y === b.y1 - 1 || y === fy ? CT : T]);
      }
      trial(cx, fy, cz);
      if (r.chance(0.6)) trial(cx - 2, fy, cz + 4);
      barrel(b.x1 - 1, fy, b.z1 - 1, SUPPLY);
      break;
    }
    case 'balcony': {
      const by = fy + 4;
      for (let x = b.x0 + 1; x < b.x1; x++) for (let z = b.z0 + 1; z < b.z1; z++) {
        const ring = Math.min(x - b.x0, b.x1 - x, z - b.z0, b.z1 - z);
        if (ring <= 3) d.push([x, by, z, ring === 3 ? PT : T]);
        if (ring === 3 && !lane(x, z)) d.push([x, by + 1, z, BARS]);
        if (ring === 3 && lane(x, z) && (x === cx || z === cz)) d.push([x, by + 1, z, AIR_B]);
      }
      for (let k = 0; k <= 4; k++) for (let w = 0; w < 2; w++) { if (k < 4) d.push([b.x0 + 4 + k, by, b.z0 + 1 + w, AIR_B]); d.push([b.x0 + 4 + k, fy + k, b.z0 + 1 + w, stair(B.TUFF_BRICKS, 1)]); }
      trial(cx, fy, cz);
      trial(b.x0 + 2, by + 1, cz + 3); trial(b.x1 - 2, by + 1, cz - 3);
      for (const [x, z] of [[cx - 4, cz - 4], [cx + 4, cz - 4], [cx - 4, cz + 4], [cx + 4, cz + 4]]) for (let y = fy; y < b.y1; y++) d.push([x, y, z, y === fy + 2 || y === by + 3 ? B.COPPER_LAMP : CT]);
      d.push([cx, b.y1, cz, B.COPPER_LAMP]);
      break;
    }
    case 'water_chamber': {
      for (let x = cx - 3; x <= cx + 3; x++) for (let z = cz - 3; z <= cz + 3; z++) {
        const edge = Math.abs(x - cx) === 3 || Math.abs(z - cz) === 3;
        if (edge) { d.push([x, b.y0, z, CT]); continue; }
        d.push([x, b.y0 - 1, z, PT]);
        d.push([x, b.y0, z, B.WATER]);
      }
      d.push([cx, b.y0, cz, CT]);
      trial(cx, fy, cz);
      for (const [x, z] of [[b.x0 + 1, cz], [b.x1 - 1, cz]]) d.push([x, fy + 2, z, B.COPPER_LAMP]);
      barrel(b.x0 + 1, fy, b.z0 + 1, SUPPLY);
      break;
    }
    case 'dispenser_room': {
      trial(cx, fy, cz);
      for (const [x, z, f] of [[b.x0, cz - 3, 1], [b.x1, cz + 3, 3], [cx - 3, b.z0, 2], [cx + 3, b.z1, 0]] as [number, number, number][]) {
        d.push([x, fy, z, makeBlock(B.DISPENSER, [4, 1, 5, 0][f])]);
        const items: (ItemStack | null)[] = new Array(9).fill(null); items[0] = { id: I.ARROW, count: 4 + r.int(8) };
        ents.push({ x, y: fy, z, type: 'chest', items });
        const [dx, dz] = FACING_DIRS[f];
        d.push([x + dx, fy, z + dz, B.STONE_PRESSURE_PLATE]);
      }
      d.push([cx, b.y1, cz, B.COPPER_LAMP]);
      break;
    }
    case 'intersection': {
      for (const [x, z] of [[cx - 2, cz - 2], [cx + 2, cz - 2], [cx - 2, cz + 2], [cx + 2, cz + 2]]) for (let y = fy; y < b.y1; y++) d.push([x, y, z, y === fy + 2 ? B.COPPER_LAMP : CT]);
      if (r.chance(0.5)) barrel(b.x0 + 1, fy, b.z0 + 1, SUPPLY);
      d.push([b.x1 - 1, fy, b.z1 - 1, B.HAY_BLOCK]);
      break;
    }
    case 'supply': {
      chest(b.x0 + 1, fy, b.z0 + 1, SUPPLY, 2);
      barrel(b.x1 - 1, fy, b.z1 - 1, SUPPLY); barrel(b.x1 - 1, fy, b.z0 + 1, SUPPLY);
      for (let z = b.z0 + 2; z <= b.z1 - 2; z++) if (!lane(b.x0 + 1, z)) { d.push([b.x0 + 1, fy, z, z & 1 ? B.HAY_BLOCK : B.BARREL]); }
      d.push([cx, b.y1, cz, B.COPPER_LAMP]);
      break;
    }
    default: return false;
  }
  p.decor = d;
  p.ents = ents;
  return true;
}

const AIR_B = 0;

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

const STRONGHOLD2: Style = {
  rooms: [['cross', 2], ['pillar_hall', 2], ['library', 2], ['small_library', 1], ['fountain', 1], ['storage', 2], ['prison', 2], ['spiral', 1], ['five_way', 2], ['stairs_hall', 1]],
  size: (k, r) => (k === 'library' ? [15, 11, 15] : k === 'small_library' ? [9, 7, 11] : k === 'storage' ? [9, 6, 9] : k === 'prison' ? [13, 6, 11] : k === 'spiral' ? [9, 14, 9] : k === 'five_way' ? [15, 10, 15] : k === 'stairs_hall' ? [11, 8, 11] : k === 'pillar_hall' ? (r && r.chance(0.5) ? [11, 9, 13] : [11, 7, 11]) : [11, 7, 11]),
  corridor: [5, 14], maxPieces: 40, maxDepth: 6,
};
const TRIAL2: Style = {
  rooms: [['arena', 2], ['pit', 2], ['pillar_chamber', 2], ['balcony', 1], ['water_chamber', 1], ['vault_room', 2], ['supply', 2], ['dispenser_room', 1], ['intersection', 2]],
  size: (k) => (k === 'big_arena' ? [19, 10, 19] : k === 'arena' ? [13, 8, 13] : k === 'pit' ? [15, 9, 15] : k === 'pillar_chamber' ? [15, 9, 15] : k === 'balcony' ? [19, 12, 19] : k === 'water_chamber' ? [13, 8, 13] : k === 'dispenser_room' ? [11, 7, 11] : k === 'intersection' ? [9, 7, 9] : k === 'vault_room' ? [9, 6, 9] : k === 'supply' ? [9, 6, 11] : [11, 7, 11]),
  corridor: [4, 10], maxPieces: 26, maxDepth: 4,
};

export const STRONGHOLD_REGION = 1536;
export const TRIAL_REGION = 640;

export function planStronghold(secret: number, rx: number, rz: number, height: (x: number, z: number) => number, v2 = false): StructurePlan | null {
  const r = new Rng(hash2(rx, rz, secret ^ 0x57b0e9d1));
  const x = rx * STRONGHOLD_REGION + 200 + r.int(STRONGHOLD_REGION - 400), z = rz * STRONGHOLD_REGION + 200 + r.int(STRONGHOLD_REGION - 400);
  if (Math.hypot(x, z) < 500) return null;
  const y = Math.max(8, Math.min(30, height(x, z) - 22));
  const start: Piece = { kind: 'start', room: true, doors: [], seed: r.nextU32(), box: roomBox(x, y, z, 11, 7, 11) };
  const pieces = layout(r, start, v2 ? STRONGHOLD2 : STRONGHOLD, 'portal');
  return { type: 'stronghold', id: `s${rx},${rz}`, bounds: bounds(pieces), pieces, x, y, z, v2 };
}

export function planTrial(secret: number, rx: number, rz: number, v2 = false): StructurePlan | null {
  const r = new Rng(hash2(rx, rz, secret ^ 0x7a1c4e33));
  if (!r.chance(0.65)) return null;
  const x = rx * TRIAL_REGION + 120 + r.int(TRIAL_REGION - 240), z = rz * TRIAL_REGION + 120 + r.int(TRIAL_REGION - 240);
  const y = 10 + r.int(10);
  const start: Piece = { kind: 'big_arena', room: true, doors: [], seed: r.nextU32(), box: roomBox(x, y, z, 19, 10, 19) };
  const pieces = layout(r, start, v2 ? TRIAL2 : TRIAL, null);
  return { type: 'trial', id: `t${rx},${rz}`, bounds: bounds(pieces), pieces, x, y, z, v2 };
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

export const END_PORTAL_LEVEL = 14;

function endPortalDecor(p: Piece, secret: number): { d: [number, number, number, number][]; ents: GenBlockEntity[] } {
  const d: [number, number, number, number][] = [];
  const ents: GenBlockEntity[] = [];
  const r = new Rng(mix32(p.seed ^ secret ^ 0xe7d));
  const b = p.box;
  const cx = Math.floor((b.x0 + b.x1) / 2), cz = Math.floor((b.z0 + b.z1) / 2), fy = b.y0 + 1;
  for (let x = b.x0 + 1; x < b.x1; x++) for (let z = b.z0 + 1; z < b.z1; z++) {
    const plat = Math.abs(x - cx) <= 3 && z >= cz - 3 && z <= cz + 4;
    if (plat) d.push([x, fy, z, B.STONE_BRICKS]);
    else if (z < cz - 1) d.push([x, b.y0, z, B.LAVA]);
  }
  const face = (dx: number, dz: number) => FACING_DIRS.findIndex(([a, c]) => a === dx && c === dz);
  for (let x = cx - 2; x <= cx + 2; x++) for (let z = cz - 1; z <= cz + 3; z++) {
    const ex = Math.abs(x - cx) === 2, ez = z === cz - 1 || z === cz + 3;
    if (ex && ez) { d.push([x, fy + 1, z, B.STONE_BRICKS]); continue; }
    if (!ex && !ez) { d.push([x, fy, z, B.LAVA]); d.push([x, fy + 1, z, B.AIR]); continue; }
    const f = z === cz - 1 ? face(0, 1) : z === cz + 3 ? face(0, -1) : x === cx - 2 ? face(1, 0) : face(-1, 0);
    d.push([x, fy + 1, z, makeBlock(CB.END_PORTAL_FRAME, f | (r.chance(0.1) ? FRAME_EYE : 0))]);
  }
  d.push([cx, fy + 1, cz - 4, B.SPAWNER]);
  ents.push({ x: cx, y: fy + 1, z: cz - 4, type: 'spawner', items: [], mob: 'hollowed' });
  for (const [x, z] of [[b.x0 + 1, b.z1 - 1], [b.x1 - 1, b.z1 - 1]]) d.push([x, fy + 3, z, wallTorch(0, 1)]);
  return { d, ents };
}

export function portalRoomCenter(plan: StructurePlan): { x: number; y: number; z: number } | null {
  const p = plan.pieces.find((q) => q.kind === 'portal');
  if (!p) return null;
  const b = p.box;
  return { x: Math.floor((b.x0 + b.x1) / 2), y: b.y0 + 2, z: Math.floor((b.z0 + b.z1) / 2) + 1 };
}

export function stampStructure(plan: StructurePlan, secret: number, bx: number, bz: number, size: number, set: Setter, entities: GenBlockEntity[], lv = 0): void {
  const cx1 = bx + size - 1, cz1 = bz + size - 1;
  for (const p of plan.pieces) {
    const b = p.box;
    if (b.x1 < bx || b.x0 > cx1 || b.z1 < bz || b.z0 > cz1) continue;
    for (let x = Math.max(bx, b.x0); x <= Math.min(cx1, b.x1); x++) for (let z = Math.max(bz, b.z0); z <= Math.min(cz1, b.z1); z++) for (let y = b.y0; y <= b.y1; y++) {
      const edge = y === b.y0 || y === b.y1 || (p.axis === 'x' ? z === b.z0 || z === b.z1 : p.axis === 'z' ? x === b.x0 || x === b.x1 : x === b.x0 || x === b.x1 || z === b.z0 || z === b.z1);
      set(x - bx, y, z - bz, edge && !isDoor(p, x, y, z) ? shellBlock(plan, p, x, y, z) : B.AIR);
    }
    decorate(plan, p, secret);
    let decor = p.decor!, pents = p.ents!;
    if (p.kind === 'portal' && plan.type === 'stronghold' && lv >= END_PORTAL_LEVEL) { const e = endPortalDecor(p, secret); decor = e.d; pents = e.ents; }
    for (const [x, y, z, v] of decor) if (x >= bx && x <= cx1 && z >= bz && z <= cz1) set(x - bx, y, z - bz, v);
    for (const e of pents) if (e.x >= bx && e.x <= cx1 && e.z >= bz && e.z <= cz1) entities.push({ ...e, x: e.x - bx, z: e.z - bz, items: e.items.map((s) => (s ? { ...s } : null)) });
  }
}

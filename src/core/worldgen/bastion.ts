import { Rng, hash2 } from '../rng';
import { B, X, XV, makeBlock, FACING_DIRS } from '../blocks';
import { I, toolId, armorId } from '../items';
import type { ItemStack } from '../inventory';
import type { GenBlockEntity } from './WorldGenerator';

export type BastionKind = 'housing' | 'stables' | 'treasure' | 'bridge';
export const BASTION_KINDS: BastionKind[] = ['housing', 'stables', 'treasure', 'bridge'];
export interface BastionPlan { cx: number; cz: number; y: number; kind: BastionKind; rot: number; seed: number; x0: number; z0: number; x1: number; z1: number }

const DIRS: [number, number][] = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const EXTENT: Record<BastionKind, [number, number, number, number]> = {
  housing: [-24, 24, -24, 31], stables: [-21, 21, -21, 21], treasure: [-20, 20, -20, 24], bridge: [-13, 13, -13, 48],
};
const PBB = X(XV.POLISHED_BLACKSTONE_BRICKS), CPBB = X(XV.CRACKED_POLISHED_BLACKSTONE_BRICKS), BS = X(XV.BLACKSTONE), PB = X(XV.POLISHED_BLACKSTONE);
const GB = X(XV.GILDED_BLACKSTONE), CH = X(XV.CHISELED_POLISHED_BLACKSTONE), BAS = X(XV.BASALT), SOUL = X(XV.SOUL_SAND);
const STAIR_MAT = 19;

export function planBastion(r: Rng, cx: number, cz: number): BastionPlan {
  const kind = BASTION_KINDS[r.int(4)], rot = r.int(4), y = 34 + r.int(4);
  const [u0, u1, v0, v1] = EXTENT[kind];
  const [fx, fz] = DIRS[rot];
  const xs: number[] = [], zs: number[] = [];
  for (const u of [u0, u1]) for (const v of [v0, v1]) { xs.push(cx + fx * v - fz * u); zs.push(cz + fz * v + fx * u); }
  return { cx, cz, y, kind, rot, seed: hash2(cx, cz, 0xba57), x0: Math.min(...xs) - 1, x1: Math.max(...xs) + 1, z0: Math.min(...zs) - 1, z1: Math.max(...zs) + 1 };
}

type Loot = [number, () => ItemStack][];
function roll(r: Rng, table: Loot, rolls: number, guaranteed: ItemStack[] = []): (ItemStack | null)[] {
  const items: (ItemStack | null)[] = new Array(27).fill(null);
  const putIn = (s: ItemStack) => { let slot = r.int(27); for (let t = 0; t < 27 && items[slot]; t++) slot = (slot + 1) % 27; items[slot] = s; };
  for (const g of guaranteed) putIn(g);
  const total = table.reduce((n, t) => n + t[0], 0);
  for (let i = 0; i < rolls; i++) { let q = r.int(total); for (const [w, mk] of table) if ((q -= w) < 0) { putIn(mk()); break; } }
  return items;
}

export function bastionLoot(r: Rng, treasure: boolean, kind: BastionKind = 'housing'): (ItemStack | null)[] {
  if (treasure) {
    return roll(r, [
      [6, () => ({ id: I.AETHERITE, count: 2 + r.int(5) })], [5, () => ({ id: 600 + XV.ANCIENT_DEBRIS, count: 1 + r.int(2) })],
      [8, () => ({ id: I.CINDERITE_SCRAP, count: 1 })], [4, () => ({ id: I.CINDERITE_INGOT, count: 1 })],
      [5, () => ({ id: B.GOLD_BLOCK, count: 2 + r.int(4) })], [6, () => ({ id: I.GOLD_INGOT, count: 3 + r.int(7) })],
      [5, () => ({ id: B.CRYING_OBSIDIAN, count: 3 + r.int(3) })], [5, () => ({ id: I.QUARTZ, count: 8 + r.int(16) })],
      [3, () => ({ id: toolId(4, 3), count: 1, dmg: r.int(800) })], [3, () => ({ id: armorId(3, 1), count: 1, dmg: r.int(300) })],
    ], 3 + r.int(2), [{ id: I.UPGRADE_TEMPLATE, count: 1 }]);
  }
  const table: Loot = [
    [12, () => ({ id: I.GOLD_INGOT, count: 2 + r.int(7) })], [6, () => ({ id: B.GOLD_BLOCK, count: 1 })], [12, () => ({ id: I.IRON_INGOT, count: 4 + r.int(6) })],
    [10, () => ({ id: I.CROSSBOW, count: 1, dmg: r.int(200) })], [8, () => ({ id: I.CINDERITE_SCRAP, count: 1 })], [10, () => ({ id: 600 + XV.ANCIENT_DEBRIS, count: 1 })],
    [12, () => ({ id: B.OBSIDIAN, count: 4 + r.int(3) })], [12, () => ({ id: B.CRYING_OBSIDIAN, count: 1 + r.int(5) })], [12, () => ({ id: I.STRING, count: 4 + r.int(3) })],
    [12, () => ({ id: I.ARROW, count: 10 + r.int(19) })], [12, () => ({ id: GB, count: 1 + r.int(5) })], [8, () => ({ id: toolId(3, 3), count: 1, dmg: r.int(20) })],
  ];
  if (kind === 'stables') table.push([14, () => ({ id: I.LEATHER, count: 3 + r.int(5) })], [14, () => ({ id: I.RAW_PORK, count: 2 + r.int(4) })]);
  return roll(r, table, 3 + r.int(3), r.chance(0.1) ? [{ id: I.UPGRADE_TEMPLATE, count: 1 }] : []);
}

type Get = (x: number, y: number, z: number) => number;
type Set = (x: number, y: number, z: number, v: number) => void;

export function stampBastion(p: BastionPlan, bx: number, bz: number, S: number, set: Set, get: Get, entities: GenBlockEntity[]): void {
  if (p.x1 < bx || p.x0 >= bx + S || p.z1 < bz || p.z0 >= bz + S) return;
  const [fx, fz] = DIRS[p.rot];
  const Y = p.y;
  const W = (u: number, v: number): [number, number] => [p.cx + fx * v - fz * u, p.cz + fz * v + fx * u];
  const wdir = (du: number, dv: number): [number, number] => [fx * dv - fz * du, fz * dv + fx * du];
  const inC = (x: number, z: number) => x >= bx && x < bx + S && z >= bz && z < bz + S;
  const P = (u: number, y: number, v: number, b: number) => { const [x, z] = W(u, v); if (inC(x, z) && y > 0 && y < 127) set(x - bx, y, z - bz, b); };
  const A = (u: number, y: number, v: number) => { const [x, z] = W(u, v); return inC(x, z) ? get(x - bx, y, z - bz) : -1; };
  const brick = (u: number, y: number, v: number) => {
    const [x, z] = W(u, v);
    const h = hash2(x * 7 + y, z * 13 - y, p.seed) & 255;
    return h < 172 ? PBB : h < 214 ? CPBB : h < 236 ? BS : h < 246 ? PB : GB;
  };
  const B_ = (u: number, y: number, v: number) => P(u, y, v, brick(u, y, v));
  const fill = (u0: number, y0: number, v0: number, u1: number, y1: number, v1: number, b: number | null) => {
    for (let y = y0; y <= y1; y++) for (let v = v0; v <= v1; v++) for (let u = u0; u <= u1; u++) if (b === null) B_(u, y, v); else P(u, y, v, b);
  };
  const ring = (c0: number, c1: number, y0: number, y1: number, ou = 0, ov = 0) => {
    for (let y = y0; y <= y1; y++) for (let v = -c1; v <= c1; v++) for (let u = -c1; u <= c1; u++) {
      const d = Math.max(Math.abs(u), Math.abs(v));
      if (d >= c0 && d <= c1) B_(u + ou, y, v + ov);
    }
  };
  const pier = (u: number, v: number, top: number) => {
    for (let y = top; y > 1; y--) { const b = A(u, y, v); if (b !== 0 && b !== B.LAVA && b !== B.FIRE) break; B_(u, y, v); }
  };
  const stairs = (u: number, y: number, v: number, du: number, dv: number) => {
    const [dx, dz] = wdir(du, dv);
    P(u, y, v, makeBlock(B.STAIRS, STAIR_MAT | (Math.max(0, FACING_DIRS.findIndex(([a, b]) => a === dx && b === dz)) << 5)));
  };
  const chest = (u: number, y: number, v: number, du: number, dv: number, treasure = false) => {
    const [x, z] = W(u, v);
    const [dx, dz] = wdir(du, dv);
    P(u, y, v, makeBlock(B.CHEST, Math.max(0, FACING_DIRS.findIndex(([a, b]) => a === dx && b === dz))));
    if (inC(x, z)) entities.push({ x: x - bx, y, z: z - bz, type: 'chest', items: bastionLoot(new Rng(hash2(x, z, y ^ p.seed)), treasure, p.kind) });
  };
  const mob = (u: number, y: number, v: number, type: string) => { const [x, z] = W(u, v); if (inC(x, z)) entities.push({ x: x - bx, y, z: z - bz, type: 'mob', items: [], mob: type }); };
  const spawner = (u: number, y: number, v: number, type: string) => { const [x, z] = W(u, v); P(u, y, v, B.SPAWNER); if (inC(x, z)) entities.push({ x: x - bx, y, z: z - bz, type: 'spawner', items: [], mob: type }); };
  const battlements = (c: number, y: number) => { for (let i = -c; i <= c; i++) if (((i % 2) + 2) % 2 === 0) { B_(i, y, c); B_(i, y, -c); B_(c, y, i); B_(-c, y, i); } };
  const piers = (c: number, step: number, top: number) => { for (let u = -c; u <= c; u += step) for (let v = -c; v <= c; v += step) pier(u, v, top); };
  const r = new Rng(p.seed);

  switch (p.kind) {
    case 'housing': {
      fill(-21, Y + 1, -21, 21, Y + 21, 21, 0);
      fill(-3, Y + 1, 24, 3, Y + 8, 31, 0);
      fill(-23, Y - 1, -23, 23, Y, 23, null);
      piers(23, 6, Y - 2);
      ring(22, 23, Y + 1, Y + 18);
      battlements(23, Y + 19);
      fill(-2, Y + 1, 22, 2, Y + 6, 23, 0);
      P(0, Y + 7, 23, CH);
      for (const [su, sv] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        const cu = su * 11, cv = sv * 11;
        ring(6, 6, Y + 1, Y + 17, cu, cv);
        for (const fy of [Y + 6, Y + 12, Y + 18]) fill(cu - 5, fy, cv - 5, cu + 5, fy, cv + 5, null);
        fill(cu - su * 6, Y + 1, cv - 1, cu - su * 6, Y + 3, cv + 1, 0);
        for (const wy of [Y + 3, Y + 9, Y + 15]) for (const o of [-3, 3]) { P(cu - su * 6, wy, cv + o, B.IRON_BARS); P(cu - su * 6, wy + 1, cv + o, B.IRON_BARS); P(cu + o, wy, cv - sv * 6, B.IRON_BARS); P(cu + o, wy + 1, cv - sv * 6, B.IRON_BARS); }
        for (const fy of [Y, Y + 6]) {
          for (let k = 0; k < 6; k++) {
            const vv = cv - 4 + k, uu = cu + su * 5;
            for (let y = fy + 1; y < fy + 1 + k; y++) B_(uu, y, vv);
            stairs(uu, fy + 1 + k, vv, 0, 1);
            if (k < 5) { P(uu, fy + 6, vv, 0); }
          }
          if (r.chance(0.6)) chest(cu - su * 4, fy + 1, cv + sv * 4, -su, 0);
          mob(cu, fy + 1, cv, 'piglin');
        }
        if (r.chance(0.6)) chest(cu - su * 4, Y + 13, cv + sv * 4, -su, 0);
        mob(cu - su * 2, Y + 13, cv, 'piglin');
      }
      for (const sv of [-1, 1]) fill(-5, Y + 18, sv * 11 - 1, 5, Y + 18, sv * 11 + 1, null);
      fill(-1, Y + 1, -1, 1, Y + 1, 1, CH);
      P(0, Y + 2, 0, B.GOLD_BLOCK);
      for (let u = -3; u <= 3; u++) for (let v = -3; v <= 3; v++) if (Math.max(Math.abs(u), Math.abs(v)) === 3) P(u, Y, v, B.MAGMA_BLOCK);
      mob(0, Y + 1, 6, 'piglin_brute');
      mob(11, Y + 19, 11, 'piglin_brute');
      mob(-6, Y + 1, -2, 'piglin');
      break;
    }
    case 'stables': {
      fill(-19, Y - 1, -19, 19, Y, 19, null);
      piers(19, 6, Y - 2);
      fill(-14, Y + 1, -14, 14, Y + 22, 14, 0);
      fill(-3, Y + 1, 15, 3, Y + 6, 21, 0);
      fill(-11, Y + 1, -11, 11, Y + 20, 11, null);
      fill(-9, Y + 1, -9, 9, Y + 8, 9, 0);
      fill(-1, Y + 1, 10, 1, Y + 4, 11, 0);
      for (let v = -9; v <= 9; v++) for (const u of [-2, 2]) { P(u, Y + 1, v, PBB); P(u, Y + 2, v, B.IRON_BARS); P(u, Y + 3, v, B.IRON_BARS); }
      for (const su of [-1, 1]) for (let k = 3; k <= 9; k++) for (let y = Y + 1; y <= Y + 3; y++) B_(su * k, y, 0);
      for (let u = -1; u <= 1; u++) for (let v = -9; v <= -8; v++) P(u, Y, v, B.LAVA);
      for (let u = -2; u <= 2; u++) P(u, Y, -7, B.MAGMA_BLOCK);
      for (const [pu, pv] of [[-6, 5], [6, 5], [-6, -5], [6, -5]]) { mob(pu, Y + 1, pv, 'hoglin'); if (r.chance(0.6)) mob(pu + (pu > 0 ? -2 : 2), Y + 1, pv + 2, 'hoglin'); P(pu + (pu > 0 ? 2 : -2), Y + 1, pv, SOUL); }
      chest(0, Y + 1, -6, 0, 1);
      for (let v = -14; v <= 14; v++) for (let u = -14; u <= 14; u++) {
        const d = Math.max(Math.abs(u), Math.abs(v));
        if (d < 12 || d > 14) continue;
        let t: number, du = 0, dv = 0;
        if (u >= 12 && v > -12) { t = 13 - v; dv = -1; }
        else if (v <= -12 && u > -12) { t = 26 + (13 - u); du = -1; }
        else if (u <= -12 && v < 12) { t = 52 + (v + 13); dv = 1; }
        else { t = 78 + (u + 13); du = 1; }
        const hb = Y + Math.min(20, Math.floor(t / 5));
        if (d === 14) { if (hb > Y) for (let y = hb; y <= hb + 1; y++) B_(u, y, v); continue; }
        const gate = v >= 12 && Math.abs(u) <= 3;
        if (!gate) for (let y = Y + 1; y < hb; y++) B_(u, y, v);
        else if (hb - 1 > Y + 6) B_(u, hb - 1, v);
        if (t % 5 === 0 && t > 0 && hb <= Y + 20) stairs(u, hb, v, du, dv); else B_(u, hb, v);
      }
      battlements(11, Y + 21);
      for (const [cu, cv] of [[-6, -6], [6, -6], [-6, 6]]) chest(cu, Y + 21, cv, 0, 1);
      P(0, Y + 21, 0, B.GOLD_BLOCK);
      mob(3, Y + 21, 3, 'piglin'); mob(-3, Y + 21, 3, 'piglin'); mob(0, Y + 21, -4, 'piglin'); mob(4, Y + 21, -2, 'piglin_brute');
      break;
    }
    case 'treasure': {
      fill(-19, Y - 2, -19, 19, Y, 19, null);
      piers(19, 6, Y - 3);
      fill(-17, Y + 1, -17, 17, Y + 28, 17, 0);
      fill(-3, Y + 1, 20, 3, Y + 6, 24, 0);
      ring(18, 19, Y + 1, Y + 26);
      battlements(19, Y + 27);
      fill(-1, Y + 1, 18, 1, Y + 4, 19, 0);
      for (let v = -14; v <= 14; v++) for (let u = -14; u <= 14; u++) { const d = Math.max(Math.abs(u), Math.abs(v)); if (d >= 6 && d <= 14) P(u, Y, v, B.LAVA); }
      for (let y = Y - 1; y <= Y + 12; y++) for (let v = -4; v <= 4; v++) for (let u = -4; u <= 4; u++) {
        const d = Math.max(Math.abs(u), Math.abs(v));
        if (d <= 1 && y < Y + 12) P(u, y, v, B.MAGMA_BLOCK);
        else if (d === 4 && (Math.abs(u) === 4 && Math.abs(v) === 4)) P(u, y, v, BAS);
        else P(u, y, v, y === Y + 12 ? PBB : (hash2(u * 5 + y, v * 3, p.seed) & 15) === 0 ? B.GOLD_BLOCK : (hash2(u, v + y, p.seed) & 1 ? BS : BAS));
      }
      for (let u = -16; u <= 16; u++) for (let v = -16; v <= 16; v++) { const d = Math.max(Math.abs(u), Math.abs(v)); if (d >= 16) B_(u, Y + 12, v); }
      for (const sv of [-1, 1]) for (let k = 5; k <= 15; k++) for (let u = -1; u <= 1; u++) B_(u, Y + 12, sv * k);
      for (let k = 0; k < 12; k++) for (const vv of [16, 17]) {
        const uu = -3 - k;
        for (let y = Y + 1; y < Y + 1 + k; y++) B_(uu, y, vv);
        stairs(uu, Y + 1 + k, vv, -1, 0);
      }
      chest(0, Y + 13, 0, 0, 1, true);
      for (const [gu, gv] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) P(gu, Y + 13, gv, B.GOLD_BLOCK);
      spawner(16, Y + 13, -16, 'emberslime'); spawner(-16, Y + 13, -16, 'emberslime');
      chest(16, Y + 13, 12, -1, 0); chest(-16, Y + 13, -10, 1, 0);
      mob(1, Y + 13, -1, 'piglin_brute'); mob(12, Y + 13, 16, 'piglin_brute'); mob(-12, Y + 13, -16, 'piglin_brute');
      mob(-15, Y + 1, 15, 'piglin'); mob(15, Y + 1, 15, 'piglin');
      break;
    }
    case 'bridge': {
      fill(-10, Y + 1, -10, 10, Y + 17, 10, 0);
      fill(-12, Y - 1, -12, 12, Y, 12, null);
      piers(12, 6, Y - 2);
      ring(11, 12, Y + 1, Y + 16);
      battlements(12, Y + 17);
      fill(-10, Y + 8, -10, 10, Y + 8, 10, null);
      fill(-1, Y + 1, 11, 1, Y + 4, 12, 0);
      for (let k = 0; k < 8; k++) for (const vv of [-9, -8]) {
        const uu = 8 - k;
        for (let y = Y + 1; y < Y + 1 + k; y++) B_(uu, y, vv);
        stairs(uu, Y + 1 + k, vv, -1, 0);
        if (k < 7) P(uu, Y + 8, vv, 0);
      }
      for (const o of [-6, -2, 2, 6]) for (const wy of [Y + 3, Y + 11]) { P(o, wy, 12, B.IRON_BARS); P(o, wy + 1, 12, B.IRON_BARS); P(12, wy, o, B.IRON_BARS); P(-12, wy, o, B.IRON_BARS); }
      chest(-8, Y + 1, -8, 1, 0); chest(8, Y + 1, 6, -1, 0);
      chest(0, Y + 9, -8, 0, 1);
      for (const gu of [-1, 1]) P(gu, Y + 9, -8, B.GOLD_BLOCK);
      fill(-10, Y + 16, -10, 10, Y + 16, 10, null);
      mob(-4, Y + 1, 2, 'piglin'); mob(4, Y + 1, -3, 'piglin'); mob(3, Y + 9, 3, 'piglin'); mob(-5, Y + 9, -2, 'piglin');
      mob(0, Y + 1, 6, 'piglin_brute'); mob(0, Y + 9, -5, 'piglin_brute');
      for (let v = 13; v <= 41; v++) for (let u = -2; u <= 2; u++) {
        for (let y = Y + 1; y <= Y + 4; y++) P(u, y, v, 0);
        B_(u, Y, v);
        const m = v % 7;
        if (m === 0 || m === 6 || m === 1) B_(u, Y - 1, v);
        if (m === 0) pier(u, v, Y - 2);
        if (Math.abs(u) === 2) { B_(u, Y + 1, v); if (v % 3 === 0) B_(u, Y + 2, v); }
      }
      mob(0, Y + 1, 24, 'piglin'); mob(1, Y + 1, 33, 'piglin_brute');
      fill(-4, Y + 1, 41, 4, Y + 8, 48, 0);
      fill(-3, Y - 1, 42, 3, Y, 47, null);
      for (let y = Y + 1; y <= Y + 6; y++) for (let u = -3; u <= 3; u++) for (let v = 41; v <= 47; v++) if (Math.abs(u) === 3 || v === 41 || v === 47) B_(u, y, v);
      fill(-3, Y + 7, 41, 3, Y + 7, 47, null);
      fill(-1, Y + 1, 41, 1, Y + 3, 41, 0);
      for (const [pu, pv] of [[-3, 42], [3, 42], [-3, 47], [3, 47]]) pier(pu, pv, Y - 2);
      chest(0, Y + 1, 46, 0, -1);
      mob(0, Y + 1, 44, 'piglin');
      break;
    }
  }
}

import { B, makeBlock, FACING_DIRS, sp, SPECIES, X, XV, bid } from '../blocks';

export type TreeSet = (x: number, y: number, z: number, v: number, leaf: boolean) => void;

const vineMeta = (dx: number, dz: number) => FACING_DIRS.findIndex(([a, c]) => a === dx && c === dz);

export function vine(dx: number, dz: number): number { return makeBlock(B.VINE, vineMeta(dx, dz)); }

function disk(set: TreeSet, x: number, y: number, z: number, r: number, leaf: number, rnd: (n: number) => number): void {
  for (let dz = -r; dz <= r + 1; dz++) for (let dx = -r; dx <= r + 1; dx++) {
    const ex = dx <= 0 ? dx : dx - 1, ez = dz <= 0 ? dz : dz - 1;
    const d = ex * ex + ez * ez;
    if (d > r * r + 1 || (d > (r - 1) * (r - 1) + r && rnd(3) === 0)) continue;
    set(x + dx, y, z + dz, leaf, true);
  }
}

export function megaJungle(set: TreeSet, x: number, y: number, z: number, h: number, rnd: (n: number) => number): void {
  const L = B.JUNGLE_LEAVES, W = B.JUNGLE_LOG;
  for (let i = 0; i < h; i++) for (const [ox, oz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) set(x + ox, y + i, z + oz, W, false);
  const top = y + h;
  disk(set, x, top - 1, z, 4, L, rnd);
  disk(set, x, top, z, 3, L, rnd);
  disk(set, x, top + 1, z, 2, L, rnd);
  for (let by = y + Math.floor(h / 2); by < top - 3; by += 2 + rnd(3)) {
    const [dx, dz] = FACING_DIRS[rnd(4)];
    const bx = x + (dx > 0 ? 1 : 0) + dx * 2, bz = z + (dz > 0 ? 1 : 0) + dz * 2;
    set(bx - dx, by, bz - dz, W, false);
    set(bx, by + 1, bz, W, false);
    disk(set, bx, by + 1, bz, 2, L, rnd);
    disk(set, bx, by + 2, bz, 1, L, rnd);
  }
  for (let i = 0; i < h - 1; i++) for (const [ox, oz, dx, dz] of [[-1, 0, 1, 0], [2, 0, -1, 0], [0, -1, 0, 1], [0, 2, 0, -1], [-1, 1, 1, 0], [2, 1, -1, 0], [1, -1, 0, 1], [1, 2, 0, -1]]) {
    if (rnd(3) === 0) set(x + ox, y + i, z + oz, vine(dx, dz), true);
  }
}

export function megaSpruce(set: TreeSet, x: number, y: number, z: number, h: number, rnd: (n: number) => number): void {
  const L = B.SPRUCE_LEAVES, W = B.SPRUCE_LOG;
  for (let i = 0; i < h; i++) for (const [ox, oz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) set(x + ox, y + i, z + oz, W, false);
  const top = y + h;
  const start = top - Math.max(6, Math.floor(h * 0.45));
  for (let ly = top + 1; ly >= start; ly--) {
    const t = (top + 1 - ly) / (top + 1 - start);
    const r = Math.max(0, Math.round(t * 4) - ((top - ly) % 3 === 0 ? 1 : 0));
    disk(set, x, ly, z, r, L, rnd);
  }
}

export function jungleVines(set: TreeSet, x: number, y: number, z: number, h: number, rnd: (n: number) => number): void {
  for (let i = 1; i < h - 1; i++) for (const [dx, dz] of FACING_DIRS) if (rnd(4) === 0) set(x - dx, y + i, z - dz, vine(dx, dz), true);
}

export function hangingVines(set: TreeSet, get: (x: number, y: number, z: number) => number, x: number, y: number, z: number, r: number, rnd: (n: number) => number): void {
  for (let dz = -r - 1; dz <= r + 1; dz++) for (let dx = -r - 1; dx <= r + 1; dx++) {
    if (rnd(5) !== 0) continue;
    for (const [fx, fz] of FACING_DIRS) {
      if ((bid(get(x + dx + fx, y, z + dz + fz))) !== B.JUNGLE_LEAVES || (bid(get(x + dx, y, z + dz))) !== 0) continue;
      const len = 1 + rnd(5);
      for (let k = 0; k < len && (bid(get(x + dx, y - k, z + dz))) === 0; k++) set(x + dx, y - k, z + dz, vine(fx, fz), true);
      break;
    }
  }
}

export function acacia(set: TreeSet, x: number, y: number, z: number, h: number, rnd: (n: number) => number): void {
  const log = sp(B.OAK_LOG, SPECIES.ACACIA), leaf = sp(B.OAK_LEAVES, SPECIES.ACACIA);
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const [dx, dz] = dirs[rnd(4)];
  const bend = h - 1 - rnd(3);
  let cx = x, cz = z;
  for (let i = 0; i < h; i++) {
    if (i >= bend && i < h - 1) { cx += dx; cz += dz; }
    set(cx, y + i, cz, log, false);
  }
  const top = y + h - 1;
  const canopy = (px: number, py: number, pz: number, big: boolean) => {
    for (let ox = -3; ox <= 3; ox++) for (let oz = -3; oz <= 3; oz++) {
      const d = Math.abs(ox) + Math.abs(oz);
      if (d <= (big ? 4 : 2) && !(Math.abs(ox) === 3 && Math.abs(oz) === 3)) set(px + ox, py, pz + oz, leaf, true);
    }
    for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) set(px + ox, py + 1, pz + oz, leaf, true);
  };
  canopy(cx, top + 1, cz, true);
  if (rnd(3) > 0) {
    const [ex, ez] = dirs[(dirs.findIndex((d) => d[0] === dx && d[1] === dz) + 2 + (rnd(2) ? 1 : 0)) % 4];
    const by = y + Math.max(2, bend - 1 - rnd(2));
    let bx = x, bz = z;
    for (let i = 0; i < 2 + rnd(2); i++) { bx += ex; bz += ez; set(bx, by + i, bz, log, false); }
    canopy(bx, by + 3, bz, false);
  }
}

export function darkOak(set: TreeSet, x: number, y: number, z: number, h: number, rnd: (n: number) => number): void {
  const log = sp(B.OAK_LOG, SPECIES.DARK_OAK), leaf = sp(B.OAK_LEAVES, SPECIES.DARK_OAK);
  for (let i = 0; i < h; i++) for (const [a, c] of [[0, 0], [1, 0], [0, 1], [1, 1]]) set(x + a, y + i, z + c, log, false);
  const top = y + h;
  for (let ly = top - 2; ly <= top + 1; ly++) {
    const r = ly === top + 1 ? 2 : ly === top - 2 ? 3 : 4;
    for (let ox = -r; ox <= r + 1; ox++) for (let oz = -r; oz <= r + 1; oz++) {
      const ex = ox < 0 ? -ox : ox > 1 ? ox - 1 : 0, ez = oz < 0 ? -oz : oz > 1 ? oz - 1 : 0;
      if (ex + ez > r + (ly === top ? 1 : 0)) continue;
      if (ex === r && ez === r && rnd(2)) continue;
      set(x + ox, ly, z + oz, leaf, true);
    }
  }
  const stubs: [number, number][] = [[-1, rnd(2)], [2, rnd(2)], [rnd(2), -1], [rnd(2), 2]];
  for (let i = 0; i < 4; i++) if (rnd(3) === 0) { const [ox, oz] = stubs[i]; set(x + ox, top - 2 - rnd(2), z + oz, log, false); }
}

export function cherry(set: TreeSet, x: number, y: number, z: number, h: number, rnd: (n: number) => number): void {
  const log = sp(B.OAK_LOG, SPECIES.CHERRY), leaf = sp(B.OAK_LEAVES, SPECIES.CHERRY);
  for (let i = 0; i < h; i++) set(x, y + i, z, log, false);
  const blob = (cx: number, cy: number, cz: number, r: number) => {
    for (let dy = -2; dy <= 2; dy++) for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
      const d = (dx * dx + dz * dz) / (r * r) + (dy * dy) / 4.5;
      if (d > 1.05 || (d > 0.8 && rnd(3) === 0)) continue;
      set(cx + dx, cy + dy, cz + dz, leaf, true);
    }
    for (let k = 0; k < r * 3; k++) { const dx = rnd(r * 2 + 1) - r, dz = rnd(r * 2 + 1) - r; if (dx * dx + dz * dz <= r * r) for (let d = 0; d < 1 + rnd(2); d++) set(cx + dx, cy - 3 - d, cz + dz, leaf, true); }
  };
  blob(x, y + h, z, 3);
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
  const n = 1 + rnd(2);
  for (let b = 0; b < n; b++) {
    const [dx, dz] = dirs[rnd(8)];
    let bx = x, by = y + 2 + rnd(2), bz = z;
    const len = 3 + rnd(2);
    for (let i = 0; i < len; i++) { bx += dx; bz += dz; if (i % 2 === 1) by++; set(bx, by, bz, log, false); }
    set(bx, by + 1, bz, log, false);
    blob(bx, by + 2, bz, 2 + rnd(2));
  }
}

export function mangrove(set: TreeSet, x: number, y: number, z: number, h: number, rnd: (n: number) => number, depth: number): void {
  const log = sp(B.OAK_LOG, SPECIES.MANGROVE), leaf = sp(B.OAK_LEAVES, SPECIES.MANGROVE);
  const base = y + 2;
  for (let i = 0; i < h; i++) set(x, base + i, z, log, false);
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]]) {
    if (rnd(4) === 0) continue;
    const reach = 1 + rnd(2);
    let rx = x, ry = base, rz = z;
    for (let i = 0; i < reach; i++) { rx += dx; rz += dz; ry -= i === 0 ? 0 : 1; set(rx, ry, rz, log, false); }
    for (let yy = ry - 1; yy >= y - depth - 1; yy--) set(rx, yy, rz, log, false);
  }
  const top = base + h;
  for (let dy = -2; dy <= 1; dy++) {
    const r = dy === 1 ? 1 : dy === -2 ? 2 : 3;
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
      if (dx * dx + dz * dz > r * r + 1 || (Math.abs(dx) === r && Math.abs(dz) === r && rnd(2))) continue;
      set(x + dx, top + dy, z + dz, leaf, true);
    }
  }
  for (let k = 0; k < 6; k++) { const dx = rnd(7) - 3, dz = rnd(7) - 3; for (let d = 0; d < 1 + rnd(3); d++) set(x + dx, top - 3 - d, z + dz, leaf, true); }
}

export function hugeMushroom(set: TreeSet, x: number, y: number, z: number, h: number, red: boolean): void {
  const stem = X(XV.MUSHROOM_STEM), cap = X(red ? XV.RED_MUSHROOM_BLOCK : XV.BROWN_MUSHROOM_BLOCK);
  for (let i = 0; i < h; i++) set(x, y + i, z, stem, false);
  const top = y + h;
  if (red) {
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) set(x + dx, top, z + dz, cap, false);
    for (let dy = -3; dy < 0; dy++) for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      if (Math.abs(dx) < 2 && Math.abs(dz) < 2) continue;
      if (Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
      set(x + dx, top + dy, z + dz, cap, false);
    }
  } else {
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
      if (Math.abs(dx) === 3 && Math.abs(dz) === 3) continue;
      set(x + dx, top, z + dz, cap, false);
    }
  }
}

export function iceSpike(set: TreeSet, x: number, y: number, z: number, h: number, rnd: (n: number) => number): void {
  const ice = B.PACKED_ICE;
  const r0 = h > 16 ? 3.2 : h > 9 ? 2.3 : 1.6;
  const lean = rnd(4);
  for (let i = -2; i < h; i++) {
    const t = Math.max(0, i) / h, r = r0 * Math.pow(1 - t, 1.3) + 0.45;
    const ri = Math.ceil(r);
    const ox = h > 16 && t > 0.6 ? Math.round((t - 0.6) * 2) * (lean & 1 ? 1 : -1) : 0;
    for (let dx = -ri; dx <= ri; dx++) for (let dz = -ri; dz <= ri; dz++) {
      if (Math.hypot(dx, dz) > r) continue;
      set(x + dx + ox, y + i, z + dz, ice, false);
    }
  }
}

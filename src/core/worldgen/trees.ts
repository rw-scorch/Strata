import { B, makeBlock, FACING_DIRS } from '../blocks';

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
      if ((get(x + dx + fx, y, z + dz + fz) & 0xff) !== B.JUNGLE_LEAVES || (get(x + dx, y, z + dz) & 0xff) !== 0) continue;
      const len = 1 + rnd(5);
      for (let k = 0; k < len && (get(x + dx, y - k, z + dz) & 0xff) === 0; k++) set(x + dx, y - k, z + dz, vine(fx, fz), true);
      break;
    }
  }
}

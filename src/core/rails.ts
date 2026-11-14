import { B } from './blocks';

export const RAIL_POWERED = 16;

export const RAIL_EXITS: [number, number, number][][] = [
  [[0, 0, -1], [0, 0, 1]],
  [[-1, 0, 0], [1, 0, 0]],
  [[-1, -1, 0], [1, 0, 0]],
  [[-1, 0, 0], [1, -1, 0]],
  [[0, 0, -1], [0, -1, 1]],
  [[0, -1, -1], [0, 0, 1]],
  [[0, 0, 1], [1, 0, 0]],
  [[0, 0, 1], [-1, 0, 0]],
  [[0, 0, -1], [-1, 0, 0]],
  [[0, 0, -1], [1, 0, 0]],
];

export function isRail(id: number): boolean {
  return id === B.RAIL || id === B.POWERED_RAIL || id === B.DETECTOR_RAIL || id === B.ACTIVATOR_RAIL;
}

export function railShape(v: number): number { return (v >>> 8) & 15; }
export function railPowered(v: number): boolean { return !!((v >>> 8) & RAIL_POWERED); }
export function isAscending(shape: number): boolean { return shape >= 2 && shape <= 5; }

type Get = (x: number, y: number, z: number) => number;

function exitsOf(shape: number): [number, number][] {
  return RAIL_EXITS[shape].map(([dx, , dz]) => [dx, dz]);
}

function points(get: Get, x: number, y: number, z: number, tx: number, tz: number): boolean {
  const v = get(x, y, z);
  if (!isRail(v & 0xff)) return false;
  return exitsOf(railShape(v)).some(([dx, dz]) => x + dx === tx && z + dz === tz);
}

function railAround(get: Get, x: number, y: number, z: number, dx: number, dz: number): number | null {
  for (const dy of [0, 1, -1]) if (isRail(get(x + dx, y + dy, z + dz) & 0xff)) return dy;
  return null;
}

function linked(get: Get, x: number, y: number, z: number): number {
  const v = get(x, y, z);
  let n = 0;
  for (const [dx, dz] of exitsOf(railShape(v))) {
    const dy = railAround(get, x, y, z, dx, dz);
    if (dy !== null && points(get, x + dx, y + dy, z + dz, x, z)) n++;
  }
  return n;
}

const DIRS: [number, number][] = [[0, -1], [0, 1], [-1, 0], [1, 0]];

export function shapeFor(get: Get, x: number, y: number, z: number, id: number, prefer: number, only?: Set<string>): number {
  const found: { dx: number; dz: number; dy: number }[] = [];
  for (const [dx, dz] of DIRS) {
    const dy = railAround(get, x, y, z, dx, dz);
    if (dy === null) continue;
    const nx = x + dx, ny = y + dy, nz = z + dz;
    if (only && !only.has(`${nx},${ny},${nz}`) && !points(get, nx, ny, nz, x, z)) continue;
    if (!only && !points(get, nx, ny, nz, x, z) && linked(get, nx, ny, nz) >= 2) continue;
    found.push({ dx, dz, dy });
  }
  const has = (dx: number, dz: number) => found.find((f) => f.dx === dx && f.dz === dz);
  const n = has(0, -1), s = has(0, 1), w = has(-1, 0), e = has(1, 0);
  const curves = id === B.RAIL;
  if (curves && (n || s) && (e || w) && !(n && s) && !(e && w)) {
    if (s && e) return 6;
    if (s && w) return 7;
    if (n && w) return 8;
    return 9;
  }
  const ns = (n || s) && !(e && w) ? true : (e || w) && !(n && s) ? false : n && s ? true : e && w ? false : null;
  if (ns === true) {
    if (n?.dy === 1) return 4;
    if (s?.dy === 1) return 5;
    return 0;
  }
  if (ns === false) {
    if (e?.dy === 1) return 2;
    if (w?.dy === 1) return 3;
    return 1;
  }
  return prefer;
}

export function neighborRails(get: Get, x: number, y: number, z: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (const [dx, dz] of DIRS) {
    const dy = railAround(get, x, y, z, dx, dz);
    if (dy !== null) out.push([x + dx, y + dy, z + dz]);
  }
  return out;
}

export function reshapeNeighbor(get: Get, nx: number, ny: number, nz: number, x: number, y: number, z: number): number | null {
  const v = get(nx, ny, nz), id = v & 0xff;
  if (!isRail(id)) return null;
  if (points(get, nx, ny, nz, x, z) && !isAscending(railShape(v))) {
    const dy = railAround(get, nx, ny, nz, x - nx, z - nz);
    if (dy !== 1) return null;
  }
  const keep = new Set<string>([`${x},${y},${z}`]);
  for (const [dx, dz] of exitsOf(railShape(v))) {
    const dy = railAround(get, nx, ny, nz, dx, dz);
    if (dy !== null && points(get, nx + dx, ny + dy, nz + dz, nx, nz)) keep.add(`${nx + dx},${ny + dy},${nz + dz}`);
  }
  if (keep.size > 2) return null;
  const shape = shapeFor(get, nx, ny, nz, id, railShape(v), keep);
  if (shape === railShape(v)) return null;
  return (v & ~(15 << 8)) | (shape << 8);
}

export function railLine(shape: number): [number, number, number, number] {
  const [a, b] = RAIL_EXITS[shape];
  return [0.5 + a[0] * 0.5, 0.5 + a[2] * 0.5, 0.5 + b[0] * 0.5, 0.5 + b[2] * 0.5];
}

export function railHeight(shape: number, fx: number, fz: number): number {
  switch (shape) {
    case 2: return fx;
    case 3: return 1 - fx;
    case 4: return 1 - fz;
    case 5: return fz;
    default: return 0;
  }
}

import { B, makeBlock, isSolid, getBlock, blockId, blockMeta, isWaterPlant } from '../blocks';

export const FALLING = 8;

export interface FluidWorld {
  get(x: number, y: number, z: number): number;
  set(x: number, y: number, z: number, v: number): void;
  loaded(x: number, z: number): boolean;
  schedule(x: number, y: number, z: number, delay: number): void;
  breakDrop(x: number, y: number, z: number, v: number): void;
}

function canFlowInto(v: number, fluid: number): boolean {
  const id = blockId(v);
  if (id === 0) return true;
  if (id === fluid) return false;
  if (id === B.WATER || id === B.LAVA) return true;
  const d = getBlock(id);
  if (d.solid) return false;
  return d.render === 'cross' || d.render === 'crop' || d.render === 'torch' || d.render === 'redstone' || id === B.LILY_PAD && fluid === B.LAVA;
}

function level(v: number): number {
  return blockMeta(v) & 7;
}

const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export function fluidDelay(id: number): number {
  return id === B.LAVA ? 30 : 5;
}

export function tickFluid(world: FluidWorld, x: number, y: number, z: number): void {
  const w: FluidWorld = { ...world, get: (gx, gy, gz) => { const g = world.get(gx, gy, gz); return isWaterPlant(g & 0xff) ? B.WATER : g; } };
  const v = w.get(x, y, z);
  const id = blockId(v);
  if (id !== B.WATER && id !== B.LAVA) return;
  if (!w.loaded(x, z)) return;
  const maxLevel = id === B.LAVA ? 3 : 7;
  const meta = blockMeta(v);
  const isSource = meta === 0;
  const delay = fluidDelay(id);

  if (interact(w, x, y, z, v)) return;

  if (!isSource) {
    const above = w.get(x, y + 1, z);
    let newMeta: number;
    if (blockId(above) === id) newMeta = FALLING | 1;
    else {
      let minL = 99, sources = 0;
      for (const [dx, dz] of DIRS) {
        const n = w.get(x + dx, y, z + dz);
        if (blockId(n) !== id) continue;
        const nm = blockMeta(n);
        if (nm === 0) sources++;
        const nl = nm & FALLING ? 0 : nm & 7;
        if (nl < minL) minL = nl;
      }
      const below = w.get(x, y - 1, z);
      if (id === B.WATER && sources >= 2 && (isSolid(below) || (blockId(below) === id && blockMeta(below) === 0))) newMeta = 0;
      else if (minL === 99 || minL + 1 > maxLevel) newMeta = -1;
      else newMeta = minL + 1;
    }
    if (newMeta === -1) {
      w.set(x, y, z, 0);
      for (const [dx, dz] of DIRS) w.schedule(x + dx, y, z + dz, delay);
      w.schedule(x, y - 1, z, delay);
      return;
    }
    if (newMeta !== meta) {
      w.set(x, y, z, makeBlock(id, newMeta));
      for (const [dx, dz] of DIRS) w.schedule(x + dx, y, z + dz, delay);
      w.schedule(x, y - 1, z, delay);
      w.schedule(x, y, z, delay);
      return;
    }
  }

  const below = w.get(x, y - 1, z);
  if (y > 0 && canFlowInto(below, id)) {
    if (blockId(below) !== 0 && blockId(below) !== B.WATER && blockId(below) !== B.LAVA) w.breakDrop(x, y - 1, z, below);
    if (blockId(below) === B.WATER || blockId(below) === B.LAVA) {
      if (interactInto(w, x, y - 1, z, id, below)) return;
    }
    w.set(x, y - 1, z, makeBlock(id, FALLING | 1));
    w.schedule(x, y - 1, z, delay);
    if (!isSource) return;
  }
  const cur = meta & FALLING ? 0 : level(v);
  const next = cur + 1;
  if (next > maxLevel) return;
  if (!isSource && blockId(below) === id) return;
  if (!isSolid(below) && blockId(below) !== id && !isSource && !(meta & FALLING)) return;
  const dirs = spreadDirs(w, x, y, z, id);
  for (const [dx, dz] of dirs) {
    const nx = x + dx, nz = z + dz;
    if (!w.loaded(nx, nz)) continue;
    const n = w.get(nx, y, nz);
    const nid = blockId(n);
    if (nid === id) {
      const nm = blockMeta(n);
      if (nm !== 0 && !(nm & FALLING) && (nm & 7) > next) { w.set(nx, y, nz, makeBlock(id, next)); w.schedule(nx, y, nz, delay); }
      continue;
    }
    if (!canFlowInto(n, id)) continue;
    if (nid === B.WATER || nid === B.LAVA) { interactInto(w, nx, y, nz, id, n); continue; }
    if (nid !== 0) w.breakDrop(nx, y, nz, n);
    w.set(nx, y, nz, makeBlock(id, next));
    w.schedule(nx, y, nz, delay);
  }
}

function passable(w: FluidWorld, x: number, y: number, z: number, id: number): boolean {
  if (!w.loaded(x, z)) return false;
  const n = w.get(x, y, z);
  if (blockId(n) === id) return blockMeta(n) !== 0;
  return canFlowInto(n, id);
}

function hole(w: FluidWorld, x: number, y: number, z: number, id: number): boolean {
  if (y <= 0) return false;
  const b = w.get(x, y - 1, z);
  return blockId(b) === id || canFlowInto(b, id);
}

function slope(w: FluidWorld, x: number, y: number, z: number, depth: number, from: number, id: number, max: number): number {
  let best = 1000;
  for (let i = 0; i < 4; i++) {
    if (i === from) continue;
    const [dx, dz] = DIRS[i];
    const nx = x + dx, nz = z + dz;
    if (!passable(w, nx, y, nz, id)) continue;
    if (hole(w, nx, y, nz, id)) return depth;
    if (depth < max) best = Math.min(best, slope(w, nx, y, nz, depth + 1, i ^ 1, id, max));
  }
  return best;
}

function spreadDirs(w: FluidWorld, x: number, y: number, z: number, id: number): [number, number][] {
  const max = id === B.LAVA ? 2 : 4;
  const cost = [1000, 1000, 1000, 1000];
  let min = 1000;
  for (let i = 0; i < 4; i++) {
    const [dx, dz] = DIRS[i];
    const nx = x + dx, nz = z + dz;
    if (!passable(w, nx, y, nz, id)) continue;
    cost[i] = hole(w, nx, y, nz, id) ? 0 : slope(w, nx, y, nz, 1, i ^ 1, id, max);
    min = Math.min(min, cost[i]);
  }
  return DIRS.filter((_, i) => cost[i] === min || (min === 1000));
}

function interact(w: FluidWorld, x: number, y: number, z: number, v: number): boolean {
  if (blockId(v) !== B.LAVA) return false;
  for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]]) {
    if (blockId(w.get(x + dx, y + dy, z + dz)) === B.WATER) {
      w.set(x, y, z, blockMeta(v) === 0 ? B.OBSIDIAN : B.COBBLESTONE);
      return true;
    }
  }
  return false;
}

function interactInto(w: FluidWorld, x: number, y: number, z: number, flowing: number, target: number): boolean {
  const tid = blockId(target);
  if (flowing === B.WATER && tid === B.LAVA) { w.set(x, y, z, blockMeta(target) === 0 ? B.OBSIDIAN : B.COBBLESTONE); return true; }
  if (flowing === B.LAVA && tid === B.WATER) { w.set(x, y, z, B.STONE); return true; }
  return false;
}

export function fluidHeight(v: number): number {
  const m = blockMeta(v);
  if (m & FALLING) return 1;
  if (m === 0) return 0.875;
  return Math.max(0.125, 0.875 - (m & 7) * 0.11);
}

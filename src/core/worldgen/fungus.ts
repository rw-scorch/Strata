import { B, X, XV, blockId, getBlock } from '../blocks';
import type { Rng } from '../rng';

export const CSTEM = X(XV.CRIMSON_STEM), WSTEM = X(XV.WARPED_STEM), CWART = X(XV.NETHER_WART_BLOCK), WWART = X(XV.WARPED_WART_BLOCK);
export const CNYL = X(XV.CRIMSON_NYLIUM), WNYL = X(XV.WARPED_NYLIUM);

type Get = (x: number, y: number, z: number) => number;
type Set = (x: number, y: number, z: number, v: number) => void;

function open(v: number): boolean {
  if (v < 0) return false;
  const id = blockId(v);
  if (id === 0) return true;
  if (id === B.WATER || id === B.LAVA) return false;
  const d = getBlock(v);
  return !!d.replaceable || id === B.CRIMSON_FUNGUS || id === B.WARPED_FUNGUS || id === B.CRIMSON_ROOTS || id === B.WARPED_ROOTS || id === B.NETHER_SPROUTS || id === B.WEEPING_VINES || id === B.TWISTING_VINES;
}

export function weepingColumn(get: Get, set: Set, rng: Rng, x: number, y: number, z: number, len: number): void {
  for (let i = 0; i < len && get(x, y - i, z) === 0; i++) set(x, y - i, z, B.WEEPING_VINES);
}

export function hugeFungus(get: Get, set: Set, rng: Rng, x: number, y: number, z: number, crimson: boolean, planted: boolean, maxY: number): boolean {
  let height = 4 + rng.int(10);
  if (rng.int(12) === 0) height *= 2;
  if (!planted && y + height + 1 >= maxY) return false;
  const thick = !planted && rng.next() < 0.06;
  const stem = crimson ? CSTEM : WSTEM, hat = crimson ? CWART : WWART;
  const r = thick ? 1 : 0;
  for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
    const corner = thick && Math.abs(dx) === r && Math.abs(dz) === r;
    for (let k = 0; k < height; k++) {
      if (!open(get(x + dx, y + k, z + dz)) && !(k === 0 && dx === 0 && dz === 0)) continue;
      if (corner && rng.next() >= 0.1) continue;
      set(x + dx, y + k, z + dz, stem);
    }
  }
  const capH = Math.min(rng.int(1 + Math.floor(height / 3)) + 5, height);
  const base = height - capH;
  const vine = (vx: number, vy: number, vz: number, chance: number) => { if (crimson && rng.next() < chance) weepingColumn(get, set, rng, vx, vy - 1, vz, 1 + rng.int(4)); };
  for (let k = base; k <= height; k++) {
    let rad = k < height - rng.int(3) ? 2 : 1;
    if (capH > 8 && k < base + 4) rad = 3;
    if (thick) rad++;
    for (let dx = -rad; dx <= rad; dx++) for (let dz = -rad; dz <= rad; dz++) {
      const ex = dx === -rad || dx === rad, ez = dz === -rad || dz === rad;
      const inside = !ex && !ez && k !== height, corner = ex && ez, low = k < base + 3;
      const px = x + dx, py = y + k, pz = z + dz;
      if (!open(get(px, py, pz))) continue;
      if (low) {
        if (inside) continue;
        if (get(px, py - 1, pz) === hat) set(px, py, pz, hat);
        else if (rng.next() < 0.15) { set(px, py, pz, hat); vine(px, py, pz, 0.11); }
        continue;
      }
      const [decor, keep, vc] = inside ? [0.1, 0.2, 0.1] : corner ? [0.01, 0.7, 0.083] : [0.0005, 0.98, 0.07];
      const roll = rng.next();
      if (roll < decor) set(px, py, pz, B.SHROOMLIGHT);
      else if (roll < keep) { set(px, py, pz, hat); vine(px, py, pz, vc); }
    }
  }
  return true;
}

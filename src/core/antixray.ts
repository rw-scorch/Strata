import { B, OPAQUE, blockId } from './blocks';
import { CHUNK_SIZE, WORLD_HEIGHT } from './constants';

export const ORE_REVEAL_RADIUS = 5;

const HIDDEN = new Uint8Array(256);
for (const id of [B.COAL_ORE, B.IRON_ORE, B.GOLD_ORE, B.AETHERITE_ORE]) HIDDEN[id] = 1;

export function isHiddenOre(v: number): boolean { return HIDDEN[blockId(v)] === 1; }

export type BlockGetter = (x: number, y: number, z: number) => number | null;

const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

export function exposed(get: BlockGetter, x: number, y: number, z: number): boolean {
  for (const [dx, dy, dz] of DIRS) {
    const ny = y + dy;
    if (ny < 0 || ny >= WORLD_HEIGHT) continue;
    const v = get(x + dx, ny, z + dz);
    if (v === null) continue;
    if (!OPAQUE[blockId(v)]) return true;
  }
  return false;
}

function chunkGetter(blocks: Uint16Array, cx: number, cz: number, world: BlockGetter): BlockGetter {
  const bx = cx * CHUNK_SIZE, bz = cz * CHUNK_SIZE;
  return (x, y, z) => {
    const lx = x - bx, lz = z - bz;
    if (lx >= 0 && lx < CHUNK_SIZE && lz >= 0 && lz < CHUNK_SIZE) return blocks[(y * CHUNK_SIZE + lz) * CHUNK_SIZE + lx];
    return world(x, y, z);
  };
}

export function maskChunk(blocks: Uint16Array, cx: number, cz: number, world: BlockGetter): Uint16Array {
  const out = blocks.slice();
  const get = chunkGetter(blocks, cx, cz, world);
  const bx = cx * CHUNK_SIZE, bz = cz * CHUNK_SIZE;
  for (let i = 0; i < blocks.length; i++) {
    if (!HIDDEN[blocks[i] & 0xff]) continue;
    const x = i & 15, z = (i >> 4) & 15, y = i >> 8;
    if (!exposed(get, bx + x, y, bz + z)) out[i] = B.STONE;
  }
  return out;
}

export function exposedOres(blocks: Uint16Array, cx: number, cz: number, world: BlockGetter): number[] {
  const out: number[] = [];
  const get = chunkGetter(blocks, cx, cz, world);
  const bx = cx * CHUNK_SIZE, bz = cz * CHUNK_SIZE;
  for (let i = 0; i < blocks.length; i++) {
    if (!HIDDEN[blocks[i] & 0xff]) continue;
    const x = i & 15, z = (i >> 4) & 15, y = i >> 8;
    if (exposed(get, bx + x, y, bz + z)) out.push(i, blocks[i]);
  }
  return out;
}

export function revealAround(get: BlockGetter, x: number, y: number, z: number, out: number[][]): void {
  const v = get(x, y, z);
  if (v === null || OPAQUE[blockId(v)]) return;
  for (const [dx, dy, dz] of DIRS) {
    const n = get(x + dx, y + dy, z + dz);
    if (n !== null && HIDDEN[blockId(n)]) out.push([x + dx, y + dy, z + dz, n]);
  }
}

export function publicValue(get: BlockGetter, x: number, y: number, z: number): number {
  const v = get(x, y, z) ?? 0;
  return HIDDEN[blockId(v)] && !exposed(get, x, y, z) ? B.STONE : v;
}

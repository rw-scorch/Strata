import { describe, it, expect } from 'vitest';
import { WorldSim, WorldStore } from '../src/core/sim/WorldSim';
import { WorldGenerator } from '../src/core/worldgen/WorldGenerator';
import { ChunkData } from '../src/core/chunk';
import { B, BLOCKS, blockId, makeBlock } from '../src/core/blocks';
import { U } from '../src/core/sim/redstone';

function world() {
  const gen = new WorldGenerator(5);
  const chunks = new Map<string, ChunkData>();
  const get = (cx: number, cz: number) => { const k = `${cx},${cz}`; let c = chunks.get(k); if (!c) { c = new ChunkData(cx, cz, new Uint16Array(16 * 16 * 256)); chunks.set(k, c); } return c; };
  const store: WorldStore = { getBlock: (x, y, z) => get(x >> 4, z >> 4).get(x & 15, y, z & 15), setBlock: (x, y, z, v) => get(x >> 4, z >> 4).set(x & 15, y, z & 15, v), isLoaded: () => true, raw: (cx, cz) => get(cx, cz).blocks };
  for (let x = -16; x <= 31; x++) for (let z = -16; z <= 16; z++) store.setBlock(x, 9, z, B.STONE);
  const sim = new WorldSim({ seed: 5, store, gen, difficulty: 'peaceful', emit: () => {}, validateMoves: false, authoritative: true, spawn: { x: 0, y: 10, z: 0 } });
  const set = (x: number, y: number, z: number, v: number) => sim.setBlock(x, y, z, v);
  const at = (x: number, y: number, z: number) => store.getBlock(x, y, z);
  const run = (n: number) => { for (let i = 0; i < n; i++) sim.tick(); };
  return { sim, store, set, at, run };
}

const kegs = (sim: WorldSim) => [...sim.entities.values()].filter((e) => e.kind === 'tnt').reduce((n, e) => n + (e.count ?? 1), 0);

describe('tnt dupers', () => {
  it('a torch riding on slime next to TNT primes it while the TNT block keeps moving', () => {
    const w = world();
    w.set(0, 10, 0, makeBlock(B.STICKY_PISTON, U));
    w.set(0, 11, 0, B.SLIME_BLOCK);
    w.set(0, 11, 1, B.SLIME_BLOCK);
    w.set(1, 11, 0, B.TNT);
    w.set(1, 11, 1, makeBlock(B.TORCH, 4));
    expect(blockId(w.at(1, 11, 1))).toBe(B.TORCH);
    w.set(-1, 10, 0, B.REDSTONE_BLOCK);
    w.run(4);
    expect(blockId(w.at(1, 12, 0))).toBe(B.TNT);
    expect(blockId(w.at(1, 12, 1))).toBe(B.TORCH);
    expect(kegs(w.sim)).toBe(1);
    w.set(-1, 10, 0, 0);
    w.run(4);
    expect(blockId(w.at(1, 11, 0))).toBe(B.TNT);
    expect(blockId(w.at(1, 11, 1))).toBe(B.TORCH);
    expect(kegs(w.sim)).toBe(2);
  });

  it('without a rider the TNT just moves', () => {
    const w = world();
    w.set(0, 10, 0, makeBlock(B.STICKY_PISTON, U));
    w.set(0, 11, 0, B.SLIME_BLOCK);
    w.set(1, 11, 0, B.TNT);
    w.set(-1, 10, 0, B.REDSTONE_BLOCK);
    w.run(4);
    expect(blockId(w.at(1, 12, 0))).toBe(B.TNT);
    expect(kegs(w.sim)).toBe(0);
  });
});

import { GEN_LEVEL, LANDFORM_LEVEL } from '../src/core/worldgen/genLevel';
import { WORLD_HEIGHT } from '../src/core/constants';

const topY = (b: Uint16Array, x: number, z: number) => { for (let y = WORLD_HEIGHT - 1; y > 0; y--) { const id = b[(y * 16 + z) * 16 + x] & 0xff; if (id && BLOCKS_SOLID(id)) return y; } return 0; };
const BLOCKS_SOLID = (id: number) => !!BLOCKS[id]?.solid && BLOCKS[id]?.render !== 'leaves';

describe('landforms', () => {
  it('reshape new land but leave older levels untouched', () => {
    const g = new WorldGenerator(777);
    let diff = 0, cols = 0;
    for (let cx = -12; cx <= 12; cx += 4) for (let cz = -12; cz <= 12; cz += 4) {
      const a = g.generate(cx, cz, LANDFORM_LEVEL - 1).blocks, b = g.generate(cx, cz, GEN_LEVEL).blocks;
      for (let x = 0; x < 16; x += 3) for (let z = 0; z < 16; z += 3) { cols++; if (topY(a, x, z) !== topY(b, x, z)) diff++; }
    }
    expect(diff).toBeGreaterThan(cols * 0.1);
  });

  it('blend into older chunks next door without a cliff', () => {
    const g = new WorldGenerator(4242);
    let worst = 0;
    for (const [cx, cz] of [[3, 0], [10, -7], [-20, 14], [33, 33]]) {
      const old = new Uint8Array(49); old[3 * 7 + 2] = 1;
      const oldChunk = g.generate(cx - 1, cz, LANDFORM_LEVEL - 1).blocks;
      const fresh = g.generate(cx, cz, GEN_LEVEL, old).blocks;
      for (let z = 0; z < 16; z++) worst = Math.max(worst, Math.abs(topY(oldChunk, 15, z) - topY(fresh, 0, z)));
    }
    expect(worst).toBeLessThanOrEqual(3);
  });

  it('is deterministic', () => {
    const a = new WorldGenerator(99).generate(5, -4).blocks, b = new WorldGenerator(99).generate(5, -4).blocks;
    expect(Buffer.from(a.buffer).equals(Buffer.from(b.buffer))).toBe(true);
  });
});

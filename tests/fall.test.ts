import { it, expect } from 'vitest';
import { WorldSim, WorldStore } from '../src/core/sim/WorldSim';
import { WorldGenerator } from '../src/core/worldgen/WorldGenerator';
import { ChunkData } from '../src/core/chunk';
import { B, blockId } from '../src/core/blocks';

it('sand and gravel fall until they land', () => {
  const gen = new WorldGenerator(1, 'spires');
  const chunks = new Map<string, ChunkData>();
  const get = (cx: number, cz: number) => { const k = `${cx},${cz}`; let c = chunks.get(k); if (!c) { c = new ChunkData(cx, cz, new Uint16Array(16 * 16 * 160)); chunks.set(k, c); } return c; };
  const store: WorldStore = { getBlock: (x, y, z) => get(x >> 4, z >> 4).get(x & 15, y, z & 15), setBlock: (x, y, z, v) => get(x >> 4, z >> 4).set(x & 15, y, z & 15, v), isLoaded: () => true };
  const sim = new WorldSim({ seed: 1, store, gen, difficulty: 'normal', emit: () => {}, validateMoves: false, authoritative: true });
  sim.setBlock(3, 10, 3, B.STONE);
  sim.setBlock(3, 20, 3, B.SAND);
  sim.setBlock(3, 21, 3, B.GRAVEL);
  for (let i = 0; i < 60; i++) sim.tick();
  expect(blockId(sim.get(3, 11, 3))).toBe(B.SAND);
  expect(blockId(sim.get(3, 12, 3))).toBe(B.GRAVEL);
  expect(blockId(sim.get(3, 20, 3))).toBe(0);
});

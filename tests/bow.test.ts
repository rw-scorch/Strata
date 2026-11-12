import { it, expect } from 'vitest';
import { WorldSim, WorldStore, newPlayer } from '../src/core/sim/WorldSim';
import { WorldGenerator } from '../src/core/worldgen/WorldGenerator';
import { ChunkData } from '../src/core/chunk';
import { B } from '../src/core/blocks';
import { I } from '../src/core/items';

it('player bow shoots an arrow that hurts a mob', () => {
  const gen = new WorldGenerator(1, 'spires');
  const chunks = new Map<string, ChunkData>();
  const get = (cx: number, cz: number) => { const k = `${cx},${cz}`; let c = chunks.get(k); if (!c) { c = new ChunkData(cx, cz, new Uint16Array(16 * 16 * 160)); chunks.set(k, c); } return c; };
  const store: WorldStore = { getBlock: (x, y, z) => get(x >> 4, z >> 4).get(x & 15, y, z & 15), setBlock: (x, y, z, v) => get(x >> 4, z >> 4).set(x & 15, y, z & 15, v), isLoaded: () => true };
  const sim = new WorldSim({ seed: 1, store, gen, difficulty: 'normal', emit: () => {}, validateMoves: false, authoritative: true });
  for (let x = -2; x < 20; x++) for (let z = -20; z < 3; z++) sim.setBlock(x, 9, z, B.STONE);
  const p = newPlayer('p1', 'Tester', 'survival', { x: 0.5, y: 10, z: 0.5 });
  sim.addPlayer(p);
  p.inv.slots[0] = { id: I.BOW, count: 1 };
  p.inv.slots[1] = { id: I.ARROW, count: 5 };
  p.inv.selected = 0;
  const m = sim.spawnMob('woolhorn', 0.5, 10, -10.5);
  m.persistent = true;
  const hp = m.health;
  expect(sim.shootBow(p, 1, 0, -0.04)).toBe(true);
  expect(p.inv.slots[1]!.count).toBe(4);
  for (let i = 0; i < 20; i++) sim.tick();
  expect(m.health).toBeLessThan(hp);
});

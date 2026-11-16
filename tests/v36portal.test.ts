import { it, expect } from 'vitest';
import { WorldSim, newPlayer, WorldStore, BlockEntity } from '../src/core/sim/WorldSim';
import { WorldGenerator } from '../src/core/worldgen/WorldGenerator';
import { ChunkData } from '../src/core/chunk';
import { B, blockId } from '../src/core/blocks';
import { NETHER_X } from '../src/core/dimension';

it('portal links survive a reload', () => {
  const gen = new WorldGenerator(5);
  const chunks = new Map<string, ChunkData>();
  const get = (cx: number, cz: number) => { const k = `${cx},${cz}`; let c = chunks.get(k); if (!c) { c = new ChunkData(cx, cz, gen.generate(cx, cz).blocks); chunks.set(k, c); } return c; };
  const store: WorldStore = { getBlock: (x, y, z) => get(x >> 4, z >> 4).get(x & 15, y, z & 15), setBlock: (x, y, z, v) => get(x >> 4, z >> 4).set(x & 15, y, z & 15, v), isLoaded: () => true, raw: (cx, cz) => get(cx, cz).blocks };
  const mk = (bes?: [string, BlockEntity][]) => {
    const sim = new WorldSim({ seed: 5, store, gen, difficulty: 'peaceful', emit: () => {}, validateMoves: false, authoritative: true, spawn: { x: 0, y: 100, z: 0 } });
    if (bes) for (const [k, v] of bes) sim.blockEntities.set(k, v);
    const p = newPlayer('a', 'A', 'creative', { x: 0.5, y: 100, z: 0.5 });
    sim.addPlayer(p);
    return { sim, p };
  };
  const { sim, p } = mk();
  const y0 = 100;
  for (let i = -1; i <= 2; i++) for (let h = -1; h <= 3; h++) store.setBlock(i, y0 + h, 0, (i === -1 || i === 2 || h === -1 || h === 3) ? B.OBSIDIAN : 0);
  expect(sim.lightPortal(0, y0, 0)).toBe(true);
  const walk = (s: WorldSim, q: typeof p, x: number, y: number, z: number) => { let went = false; for (let i = 0; i < 400; i++) { if (!went) { q.x = x; q.y = y; q.z = z; } s.tick(); if (q.travel) went = true; if (went && !q.travel) break; } };
  walk(sim, p, 0.5, y0, 0.5);
  expect(p.x).toBeGreaterThan(NETHER_X - 100);
  const n1 = [...sim.blockEntities.entries()].filter(([, b]) => b.type === 'portal');
  const nether = n1.find(([k]) => Number(k.split(',')[0]) > 300000)!;
  expect(nether).toBeTruthy();
  const saved = JSON.parse(JSON.stringify([...sim.blockEntities.entries()])) as [string, BlockEntity][];
  const b = mk(saved);
  const [nx, ny, nz] = nether[0].split(',').map(Number);
  b.p.portalLock = false;
  walk(b.sim, b.p, nx + 0.5, ny, nz + 0.5);
  expect(Math.abs(b.p.x)).toBeLessThan(10);
  const portals = [...b.sim.blockEntities.values()].filter((x) => x.type === 'portal').length;
  expect(portals).toBe(2);
  void blockId;
});

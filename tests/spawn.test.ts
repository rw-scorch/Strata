import { it, expect } from 'vitest';
import { WorldSim, WorldStore, newPlayer, villagerPhase } from '../src/core/sim/WorldSim';
import { WorldGenerator } from '../src/core/worldgen/WorldGenerator';
import { ChunkData } from '../src/core/chunk';
import { B, blockId, makeBlock } from '../src/core/blocks';
import { MOBS, MobType } from '../src/core/sim/mobs';

const ROOM = 40;

function world(opts: { roof: boolean; torches?: boolean }) {
  const gen = new WorldGenerator(1, 'spires');
  const chunks = new Map<string, ChunkData>();
  const get = (cx: number, cz: number) => {
    const k = `${cx},${cz}`;
    let c = chunks.get(k);
    if (!c) {
      c = new ChunkData(cx, cz, new Uint16Array(16 * 16 * 160));
      for (let y = 0; y < 10; y++) for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) c.set(x, y, z, B.STONE);
      for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
        const wx = cx * 16 + x, wz = cz * 16 + z;
        if (!opts.roof || Math.abs(wx) > ROOM || Math.abs(wz) > ROOM) continue;
        c.set(x, 13, z, B.STONE);
        if (Math.abs(wx) === ROOM || Math.abs(wz) === ROOM) for (let y = 10; y < 13; y++) c.set(x, y, z, B.STONE);
        if (opts.torches && wx % 10 === 0 && wz % 10 === 0) c.set(x, 10, z, B.TORCH);
      }
      chunks.set(k, c);
    }
    return c;
  };
  const store: WorldStore = { getBlock: (x, y, z) => get(x >> 4, z >> 4).get(x & 15, y, z & 15), setBlock: (x, y, z, v) => get(x >> 4, z >> 4).set(x & 15, y, z & 15, v), isLoaded: () => true };
  const sim = new WorldSim({ seed: 1, store, gen, difficulty: 'normal', emit: () => {}, validateMoves: false, authoritative: true });
  sim.time = 6000;
  sim.settings.dayCycle = false;
  const p = newPlayer('p1', 'Tester', 'survival', { x: 0.5, y: 14, z: 0.5 });
  sim.addPlayer(p);
  return { sim, p };
}

const hostiles = (sim: WorldSim) => [...sim.entities.values()].filter((e) => e.kind === 'mob' && MOBS[e.type as MobType].hostile);

it('monsters spawn in a dark roofed room during the day but not on the sunny surface', () => {
  const { sim } = world({ roof: true });
  for (let i = 0; i < 300; i++) sim.tick();
  const hs = hostiles(sim);
  expect(hs.length).toBeGreaterThan(8);
  for (const e of hs) {
    expect(Math.abs(e.x)).toBeLessThan(ROOM);
    expect(Math.abs(e.z)).toBeLessThan(ROOM);
    expect(e.y).toBeGreaterThanOrEqual(10);
    expect(e.y).toBeLessThan(13);
  }
});

it('no monsters spawn in an open field at noon', () => {
  const { sim } = world({ roof: false });
  for (let i = 0; i < 200; i++) sim.tick();
  expect(hostiles(sim).length).toBe(0);
});

it('torch light stops monster spawning', () => {
  const { sim } = world({ roof: true, torches: true });
  for (let i = 0; i < 300; i++) sim.tick();
  expect(hostiles(sim).length).toBe(0);
});

it('monsters despawn instantly beyond 128 blocks', () => {
  const { sim } = world({ roof: false });
  sim.settings.mobSpawning = false;
  const far = sim.spawnMob('hollowed', 150.5, 10, 0.5);
  const near = sim.spawnMob('hollowed', 20.5, 10, 0.5);
  for (let i = 0; i < 25; i++) sim.tick();
  expect(sim.entities.has(far.id)).toBe(false);
  expect(sim.entities.has(near.id)).toBe(true);
});

it('wheat grows on farmland with random ticks', () => {
  const { sim } = world({ roof: false });
  sim.settings.mobSpawning = false;
  sim.settings.randomTickSpeed = 64;
  for (let x = 3; x < 8; x++) for (let z = 3; z < 8; z++) { sim.setBlock(x, 9, z, B.FARMLAND); sim.setBlock(x, 10, z, makeBlock(B.WHEAT, 0)); }
  sim.setBlock(2, 9, 2, B.WATER);
  for (let i = 0; i < 400; i++) sim.tick();
  let grown = 0;
  for (let x = 3; x < 8; x++) for (let z = 3; z < 8; z++) if (blockId(sim.get(x, 10, z)) === B.WHEAT && (sim.get(x, 10, z) >>> 8) > 0) grown++;
  expect(grown).toBeGreaterThan(10);
});

it('villager schedule follows the Java day', () => {
  expect(villagerPhase(1000)).toBe('idle');
  expect(villagerPhase(5000)).toBe('work');
  expect(villagerPhase(10000)).toBe('meet');
  expect(villagerPhase(11500)).toBe('idle');
  expect(villagerPhase(18000)).toBe('rest');
});

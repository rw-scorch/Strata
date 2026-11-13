import { describe, it, expect } from 'vitest';
import { WorldSim, newPlayer, WorldStore } from '../src/core/sim/WorldSim';
import { WorldGenerator } from '../src/core/worldgen/WorldGenerator';
import { ChunkData } from '../src/core/chunk';
import { B, blockId, blockMeta, makeBlock, DOOR_OPEN, doorMeta } from '../src/core/blocks';
import { I } from '../src/core/items';
import { LEVER_ON, REP_POWERED, CMP_SUB } from '../src/core/sim/redstone';

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
  const flip = (x: number, y: number, z: number) => sim.rs.use(x, y, z, at(x, y, z));
  return { sim, store, set, at, run, flip };
}

describe('redstone signals', () => {
  it('dust carries power 15 blocks and fades by one per block', () => {
    const w = world();
    w.set(0, 10, 0, makeBlock(B.LEVER, 0));
    for (let x = 1; x <= 15; x++) w.set(x, 10, 0, B.REDSTONE_WIRE);
    w.set(16, 10, 0, B.REDSTONE_LAMP);
    w.flip(0, 10, 0);
    expect(blockMeta(w.at(1, 10, 0)) & 15).toBe(15);
    expect(blockMeta(w.at(15, 10, 0)) & 15).toBe(1);
    expect(blockId(w.at(16, 10, 0))).toBe(B.REDSTONE_LAMP_LIT);
    w.flip(0, 10, 0);
    expect(blockMeta(w.at(8, 10, 0)) & 15).toBe(0);
    w.run(5);
    expect(blockId(w.at(16, 10, 0))).toBe(B.REDSTONE_LAMP);
  });

  it('dust climbs blocks unless the corner is covered', () => {
    const w = world();
    w.set(0, 10, 0, B.REDSTONE_BLOCK);
    w.set(1, 10, 0, B.REDSTONE_WIRE);
    w.set(2, 10, 0, B.STONE);
    w.set(2, 11, 0, B.REDSTONE_WIRE);
    expect(blockMeta(w.at(2, 11, 0)) & 15).toBe(14);
    w.set(1, 11, 0, B.STONE);
    expect(blockMeta(w.at(2, 11, 0)) & 15).toBe(0);
  });

  it('torches invert the block they hang on after two ticks', () => {
    const w = world();
    w.set(0, 10, 0, B.STONE);
    w.set(1, 10, 0, makeBlock(B.REDSTONE_TORCH, 4));
    w.set(-1, 10, 0, makeBlock(B.LEVER, 2));
    expect(blockId(w.at(1, 10, 0))).toBe(B.REDSTONE_TORCH);
    w.flip(-1, 10, 0);
    w.run(1);
    expect(blockId(w.at(1, 10, 0))).toBe(B.REDSTONE_TORCH);
    w.run(1);
    expect(blockId(w.at(1, 10, 0))).toBe(B.UNLIT_REDSTONE_TORCH);
    w.flip(-1, 10, 0);
    w.run(2);
    expect(blockId(w.at(1, 10, 0))).toBe(B.REDSTONE_TORCH);
  });

  it('torches burn out when forced off more than 8 times in 3 seconds', () => {
    const w = world();
    w.set(0, 10, 0, B.STONE);
    w.set(1, 10, 0, makeBlock(B.REDSTONE_TORCH, 4));
    w.set(-1, 10, 0, makeBlock(B.LEVER, 2));
    for (let i = 0; i < 9; i++) { w.flip(-1, 10, 0); w.run(3); w.flip(-1, 10, 0); w.run(3); }
    expect(blockId(w.at(1, 10, 0))).toBe(B.UNLIT_REDSTONE_TORCH);
    w.run(200);
    expect(blockId(w.at(1, 10, 0))).toBe(B.REDSTONE_TORCH);
  });

  it('repeaters delay by their setting and restore full strength', () => {
    const w = world();
    w.set(0, 10, 0, makeBlock(B.LEVER, 0));
    w.set(1, 10, 0, makeBlock(B.REPEATER, 1 | (3 << 2)));
    for (let x = 2; x <= 5; x++) w.set(x, 10, 0, B.REDSTONE_WIRE);
    w.flip(0, 10, 0);
    w.run(7);
    expect(blockMeta(w.at(2, 10, 0)) & 15).toBe(0);
    w.run(1);
    expect(blockMeta(w.at(1, 10, 0)) & REP_POWERED).toBeTruthy();
    expect(blockMeta(w.at(2, 10, 0)) & 15).toBe(15);
  });

  it('a powered repeater facing into another locks it', () => {
    const w = world();
    w.set(0, 10, 0, makeBlock(B.LEVER, 0));
    w.set(1, 10, 0, makeBlock(B.REPEATER, 1));
    w.set(2, 10, 0, B.REDSTONE_LAMP);
    w.set(1, 10, 2, makeBlock(B.LEVER, 0));
    w.set(1, 10, 1, makeBlock(B.REPEATER, 0));
    w.flip(1, 10, 2);
    w.run(4);
    expect(blockMeta(w.at(1, 10, 0)) & 32).toBeTruthy();
    w.flip(0, 10, 0);
    w.run(10);
    expect(blockId(w.at(2, 10, 0))).toBe(B.REDSTONE_LAMP);
  });

  it('comparators read containers and subtract side inputs', () => {
    const w = world();
    w.set(0, 10, 0, B.CHEST);
    const items = new Array(27).fill(null);
    for (let i = 0; i < 14; i++) items[i] = { id: B.COBBLESTONE, count: 64 };
    w.sim.addGeneratedChest(0, 10, 0, items);
    w.set(1, 10, 0, makeBlock(B.COMPARATOR, 1));
    w.set(2, 10, 0, B.REDSTONE_WIRE);
    w.run(3);
    const full = Math.floor(1 + (14 / 27) * 14);
    expect(blockMeta(w.at(2, 10, 0)) & 15).toBe(full);
    w.flip(1, 10, 0);
    expect(blockMeta(w.at(1, 10, 0)) & CMP_SUB).toBeTruthy();
    w.set(1, 10, 1, B.REDSTONE_WIRE);
    w.set(1, 10, 2, B.REDSTONE_WIRE);
    w.set(1, 10, 3, B.REDSTONE_BLOCK);
    w.run(3);
    expect(blockMeta(w.at(2, 10, 0)) & 15).toBe(Math.max(0, full - 14));
  });

  it('a torch and repeater loop makes a clock', () => {
    const w = world();
    w.set(0, 10, 0, B.STONE);
    w.set(1, 10, 0, makeBlock(B.REDSTONE_TORCH, 4));
    w.set(1, 10, 1, B.REDSTONE_WIRE);
    w.set(1, 10, 2, B.REDSTONE_WIRE);
    w.set(0, 10, 2, B.REDSTONE_WIRE);
    w.set(0, 10, 1, makeBlock(B.REPEATER, 0 | (1 << 2)));
    let flips = 0, last = blockId(w.at(1, 10, 0));
    for (let i = 0; i < 60; i++) { w.run(1); const now = blockId(w.at(1, 10, 0)); if (now !== last) flips++; last = now; }
    expect(flips).toBeGreaterThanOrEqual(6);
    expect(flips).toBeLessThanOrEqual(12);
  });

  it('pressure plates power while stood on and release after a second', () => {
    const w = world();
    w.set(0, 10, 0, B.STONE_PRESSURE_PLATE);
    w.set(1, 10, 0, B.REDSTONE_LAMP);
    const p = newPlayer('a', 'A', 'survival', { x: 0.5, y: 10, z: 0.5 });
    w.sim.addPlayer(p);
    p.x = 0.5; p.y = 10; p.z = 0.5;
    w.run(1);
    expect(blockId(w.at(1, 10, 0))).toBe(B.REDSTONE_LAMP_LIT);
    p.x = 5.5;
    w.run(30);
    expect(blockId(w.at(1, 10, 0))).toBe(B.REDSTONE_LAMP);
  });

  it('doors open and close with power', () => {
    const w = world();
    w.set(0, 10, 0, makeBlock(B.OAK_DOOR, doorMeta(0, false, false)));
    w.set(0, 11, 0, makeBlock(B.OAK_DOOR, doorMeta(0, true, false)));
    w.set(1, 10, 0, makeBlock(B.LEVER, 0));
    w.flip(1, 10, 0);
    expect(blockMeta(w.at(0, 10, 0)) & DOOR_OPEN).toBeTruthy();
    expect(blockMeta(w.at(0, 11, 0)) & DOOR_OPEN).toBeTruthy();
    w.flip(1, 10, 0);
    expect(blockMeta(w.at(0, 10, 0)) & DOOR_OPEN).toBeFalsy();
  });

  it('buttons give a timed pulse', () => {
    const w = world();
    w.set(0, 10, 0, B.STONE_BUTTON);
    w.set(1, 10, 0, B.REDSTONE_LAMP);
    w.flip(0, 10, 0);
    expect(blockMeta(w.at(0, 10, 0)) & LEVER_ON).toBeTruthy();
    expect(blockId(w.at(1, 10, 0))).toBe(B.REDSTONE_LAMP_LIT);
    w.run(19);
    expect(blockMeta(w.at(0, 10, 0)) & LEVER_ON).toBeTruthy();
    w.run(6);
    expect(blockId(w.at(1, 10, 0))).toBe(B.REDSTONE_LAMP);
  });

  it('runs the same way every time', () => {
    const trace = () => {
      const w = world();
      w.set(0, 10, 0, makeBlock(B.LEVER, 0));
      for (let x = 1; x < 8; x++) w.set(x, 10, 0, B.REDSTONE_WIRE);
      w.set(8, 10, 0, makeBlock(B.REPEATER, 1 | (1 << 2)));
      w.set(9, 10, 0, B.STONE);
      w.set(10, 10, 0, makeBlock(B.REDSTONE_TORCH, 4));
      w.set(11, 10, 0, B.REDSTONE_LAMP);
      const out: number[] = [];
      for (let i = 0; i < 30; i++) { if (i % 7 === 0) w.flip(0, 10, 0); w.run(1); for (let x = 0; x < 12; x++) out.push(w.at(x, 10, 0)); }
      return out.join(',');
    };
    expect(trace()).toBe(trace());
  });

  it('crafts the parts', async () => {
    const { RECIPES } = await import('../src/core/crafting');
    for (const id of [B.REDSTONE_TORCH, B.LEVER, B.REPEATER, B.COMPARATOR, B.REDSTONE_LAMP, B.REDSTONE_BLOCK, B.STONE_BUTTON]) expect(RECIPES.some((r) => r.result === id)).toBe(true);
    expect(RECIPES.some((r) => r.result === I.REDSTONE)).toBe(true);
  });
});

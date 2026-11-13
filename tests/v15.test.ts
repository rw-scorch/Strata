import { describe, it, expect } from 'vitest';
import { WorldSim, newPlayer, WorldStore } from '../src/core/sim/WorldSim';
import { WorldGenerator } from '../src/core/worldgen/WorldGenerator';
import { ChunkData } from '../src/core/chunk';
import { B, blockId, makeBlock } from '../src/core/blocks';
import { I } from '../src/core/items';
import { sampleMedium } from '../src/core/physics';

function flat() {
  const gen = new WorldGenerator(3);
  const chunks = new Map<string, ChunkData>();
  const get = (cx: number, cz: number) => { const k = `${cx},${cz}`; let c = chunks.get(k); if (!c) { c = new ChunkData(cx, cz, new Uint16Array(16 * 16 * 256)); chunks.set(k, c); } return c; };
  const store: WorldStore = { getBlock: (x, y, z) => get(x >> 4, z >> 4).get(x & 15, y, z & 15), setBlock: (x, y, z, v) => get(x >> 4, z >> 4).set(x & 15, y, z & 15, v), isLoaded: () => true };
  for (let x = -12; x <= 12; x++) for (let z = -12; z <= 12; z++) store.setBlock(x, 9, z, B.STONE);
  const sim = new WorldSim({ seed: 3, store, gen, difficulty: 'normal', emit: () => {}, validateMoves: false, authoritative: true, spawn: { x: 0, y: 10, z: 0 } });
  const run = (n: number) => { for (let i = 0; i < n; i++) sim.tick(); };
  return { sim, store, run };
}

describe('v15 fluids', () => {
  it('turns flowing lava into cobblestone when water flows next to it', () => {
    const { sim, store, run } = flat();
    for (let x = -1; x <= 6; x++) { store.setBlock(x, 10, -1, B.STONE); store.setBlock(x, 10, 1, B.STONE); }
    store.setBlock(-1, 10, 0, B.STONE); store.setBlock(6, 10, 0, B.STONE);
    sim.setBlock(5, 10, 0, B.LAVA);
    sim.scheduleFluid(5, 10, 0, 1);
    run(200);
    sim.setBlock(0, 10, 0, B.WATER);
    sim.scheduleFluid(0, 10, 0, 1);
    run(200);
    const row = [0, 1, 2, 3, 4, 5].map((x) => blockId(store.getBlock(x, 10, 0)));
    expect(row).toContain(B.COBBLESTONE);
    expect(row.filter((id) => id === B.WATER).length).toBeGreaterThan(0);
    const cx = row.indexOf(B.COBBLESTONE);
    sim.setBlock(cx, 10, 0, 0);
    run(200);
    expect([0, 1, 2, 3, 4, 5].map((x) => blockId(store.getBlock(x, 10, 0)))).toContain(B.COBBLESTONE);
  });

  it('only counts lava as touching when the player is inside the lava surface', () => {
    const { store } = flat();
    store.setBlock(3, 10, 0, makeBlock(B.LAVA, 3));
    expect(sampleMedium(store, 2.5, 10, 0.5, 0.3, 1.8, 1.62).lava).toBe(false);
    expect(sampleMedium(store, 2.75, 10, 0.5, 0.3, 1.8, 1.62).lava).toBe(true);
    expect(sampleMedium(store, 3.5, 10.9, 0.5, 0.3, 1.8, 1.62).lava).toBe(false);
  });

  it('kelp grows in water and leaves water behind when broken', () => {
    const { sim, store, run } = flat();
    for (let y = 10; y < 20; y++) store.setBlock(0, y, 0, B.WATER);
    sim.setBlock(0, 10, 0, makeBlock(B.KELP, 0));
    for (let i = 0; i < 400; i++) (sim as unknown as { randomTickAt(x: number, y: number, z: number): void }).randomTickAt?.(0, 10 + i % 9, 0);
    sim.setBlock(0, 10, 0, 0);
    expect(blockId(store.getBlock(0, 10, 0))).toBe(B.WATER);
    run(5);
  });
});

describe('v15 survival', () => {
  it('golden apples give absorption hearts that soak up damage', () => {
    const { sim } = flat();
    const p = newPlayer('a', 'A', 'survival', { x: 0, y: 10, z: 0 });
    sim.addPlayer(p);
    p.food = 20;
    sim.setNow(5000);
    p.inv.slots[p.inv.selected] = { id: I.GOLDEN_APPLE, count: 1 };
    expect(sim.eat(p)).toBe(true);
    expect(p.absorb).toBe(4);
    sim.damage(p, 3, 'player', 0, 0);
    expect(p.health).toBe(20);
    expect(p.absorb).toBe(1);
  });

  it('grows a 2x2 spruce from four saplings', () => {
    const { sim, store } = flat();
    for (const [x, z] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { store.setBlock(x, 9, z, B.DIRT); store.setBlock(x, 10, z, B.SPRUCE_SAPLING); }
    expect(sim.growTree(1, 10, 1, B.SPRUCE_SAPLING)).toBe(true);
    for (const [x, z] of [[0, 0], [1, 0], [0, 1], [1, 1]]) expect(blockId(store.getBlock(x, 12, z))).toBe(B.SPRUCE_LOG);
  });

  it('/give accepts @s, minecraft: names and other players', () => {
    const { sim } = flat();
    const a = newPlayer('a', 'Ann', 'creative', { x: 0, y: 10, z: 0 }); a.op = true;
    const b = newPlayer('b', 'Bob', 'survival', { x: 0, y: 10, z: 0 });
    sim.addPlayer(a); sim.addPlayer(b);
    expect(sim.command(a, '/give @s minecraft:shears')).toMatch(/Gave 1 Shears/);
    expect(sim.command(a, '/give Bob cookie 8')).toMatch(/to Bob/);
    expect(b.inv.slots.some((s) => s?.id === I.COOKIE && s.count === 8)).toBe(true);
  });
});

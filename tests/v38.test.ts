import { describe, it, expect } from 'vitest';
import { WorldSim, newPlayer, WorldStore, SimEvent } from '../src/core/sim/WorldSim';
import { WorldGenerator, STUDIO_FLOOR } from '../src/core/worldgen/WorldGenerator';
import { ChunkData } from '../src/core/chunk';
import { B, blockId } from '../src/core/blocks';
import { I } from '../src/core/items';
import { captureBlueprint, encodeBlueprint, decodeBlueprint, bpCosts, Blueprint } from '../src/core/blueprint';
import { giveItem, countItem } from '../src/core/inventory';

function world() {
  const chunks = new Map<string, ChunkData>();
  const get = (cx: number, cz: number) => { const k = `${cx},${cz}`; let c = chunks.get(k); if (!c) { c = new ChunkData(cx, cz); chunks.set(k, c); } return c; };
  const store: WorldStore = { getBlock: (x, y, z) => get(x >> 4, z >> 4).get(x & 15, y, z & 15), setBlock: (x, y, z, v) => get(x >> 4, z >> 4).set(x & 15, y, z & 15, v), isLoaded: () => true, raw: (cx, cz) => get(cx, cz).blocks };
  for (let x = -40; x <= 40; x++) for (let z = -40; z <= 40; z++) store.setBlock(x, 9, z, B.STONE);
  const events: SimEvent[] = [];
  const sim = new WorldSim({ seed: 5, store, gen: new WorldGenerator(5), difficulty: 'peaceful', emit: (e) => events.push(e), validateMoves: false, authoritative: true, spawn: { x: 0, y: 10, z: 0 } });
  const p = newPlayer('a', 'A', 'survival', { x: 0.5, y: 10, z: 0.5 });
  sim.addPlayer(p);
  p.x = 0.5; p.y = 10; p.z = 0.5;
  const msgs = () => events.filter((e) => e.e === 'msg').map((e) => (e as { text: string }).text);
  return { sim, store, p, msgs };
}

function hut(): Blueprint {
  const { store } = world();
  for (let x = 0; x < 3; x++) for (let z = 0; z < 3; z++) for (let y = 20; y < 23; y++) if (x !== 1 || z !== 1 || y === 22) store.setBlock(x, y, z, y === 22 ? B.OAK_PLANKS : B.COBBLESTONE);
  const r = captureBlueprint(store.getBlock, [0, 20, 0], [2, 22, 2], 'Hut');
  if (typeof r === 'string') throw new Error(r);
  return r.bp;
}

describe('v38 blueprints', () => {
  it('captures, trims and round-trips', () => {
    const bp = hut();
    expect([bp.w, bp.h, bp.d]).toEqual([3, 3, 3]);
    const back = decodeBlueprint(encodeBlueprint(bp), 'Hut')!;
    expect(Array.from(back.blocks)).toEqual(Array.from(bp.blocks));
    const c = bpCosts(bp);
    expect(c.items.get(B.COBBLESTONE)).toBe(16);
    expect(c.items.get(B.OAK_PLANKS)).toBe(9);
  });

  it('leaves out blocks that cannot be placed', () => {
    const { store } = world();
    store.setBlock(0, 30, 0, B.STONE); store.setBlock(1, 30, 0, B.BEDROCK); store.setBlock(2, 30, 0, B.WATER);
    const r = captureBlueprint(store.getBlock, [0, 30, 0], [2, 30, 0], 'x');
    expect(typeof r).not.toBe('string');
    if (typeof r !== 'string') { expect(r.stripped).toBe(2); expect(r.bp.w).toBe(1); }
  });

  it('rejects tampered uploads with banned blocks', () => {
    const bp = hut();
    bp.blocks[0] = B.BEDROCK;
    expect(decodeBlueprint(encodeBlueprint(bp))).toBeNull();
  });

  it('survival placement needs every block and consumes them', () => {
    const { sim, p, store, msgs } = world();
    const bp = hut();
    expect(sim.placeBlueprint(p, bp, 5, 10, 5)).toMatch(/Preparing/);
    sim.tick();
    expect(msgs().at(-1)).toMatch(/Missing materials/);
    expect(blockId(store.getBlock(5, 10, 5))).toBe(0);
    giveItem(p.inv, { id: B.COBBLESTONE, count: 20 });
    giveItem(p.inv, { id: B.OAK_PLANKS, count: 9 });
    sim.setNow(10000);
    expect(sim.placeBlueprint(p, bp, 5, 10, 5)).toMatch(/Preparing/);
    for (let i = 0; i < 5; i++) sim.tick();
    expect(msgs().at(-1)).toMatch(/Built Hut/);
    expect(blockId(store.getBlock(5, 10, 5))).toBe(B.COBBLESTONE);
    expect(blockId(store.getBlock(6, 12, 6))).toBe(B.OAK_PLANKS);
    expect(countItem(p.inv, B.COBBLESTONE)).toBe(4);
    expect(countItem(p.inv, B.OAK_PLANKS)).toBe(0);
  });

  it('refuses to overlap existing blocks', () => {
    const { sim, p, store, msgs } = world();
    p.mode = 'creative';
    store.setBlock(6, 11, 5, B.DIRT);
    sim.placeBlueprint(p, hut(), 5, 10, 5);
    sim.tick();
    expect(msgs().at(-1)).toMatch(/overlap 1 existing block/);
  });

  it('can be turned off by the owner', () => {
    const { sim, p } = world();
    p.op = true;
    sim.command(p, '/gamerule allowBlueprints false');
    expect(sim.placeBlueprint(p, hut(), 5, 10, 5)).toMatch(/turned off/);
  });

  it('studio worlds are a flat plot', () => {
    const g = new WorldGenerator(1, null, { studio: true });
    const c = g.generate(0, 0).blocks;
    expect(c[(STUDIO_FLOOR * 16) * 16]).toBe(B.GRASS);
    expect(c[((STUDIO_FLOOR + 1) * 16) * 16]).toBe(0);
    expect(g.findSpawn().y).toBe(STUDIO_FLOOR + 1);
    void I;
  });
});

describe('v38 fire', () => {
  function forest() {
    const { sim, store, p } = world();
    p.mode = 'creative'; p.y = 40;
    const trees: number[][] = [];
    for (let tx = -6; tx <= 6; tx += 3) for (let tz = -6; tz <= 6; tz += 3) {
      for (let y = 10; y < 15; y++) store.setBlock(tx, y, tz, B.OAK_LOG);
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (let y = 14; y < 17; y++) if (dx || dz || y > 14) store.setBlock(tx + dx, y, tz + dz, B.OAK_LEAVES);
      trees.push([tx, tz]);
    }
    const logs = () => { let n = 0; for (const [tx, tz] of trees) for (let y = 10; y < 15; y++) if (blockId(store.getBlock(tx, y, tz)) === B.OAK_LOG) n++; return n; };
    return { sim, store, logs };
  }

  it('spreads through a forest and burns the trees down', () => {
    const { sim, logs } = forest();
    const start = logs();
    sim.setBlock(-5, 10, -6, B.FIRE);
    for (let i = 0; i < 6000; i++) sim.tick();
    expect(logs()).toBeLessThan(start * 0.8);
  });

  it('rain puts out exposed fires and doFireTick stops spread', () => {
    const { sim, store } = world();
    for (let x = 0; x < 12; x++) for (let z = 0; z < 12; z++) store.setBlock(x, 10, z, B.OAK_PLANKS);
    sim.weather = 'rain';
    sim.setBlock(5, 11, 5, B.FIRE);
    for (let i = 0; i < 4000; i++) sim.tick();
    let planks = 0;
    for (let x = 0; x < 12; x++) for (let z = 0; z < 12; z++) if (blockId(store.getBlock(x, 10, z)) === B.OAK_PLANKS) planks++;
    expect(planks).toBeGreaterThan(130);
    const b = forest();
    const op = newPlayer('o', 'O', 'creative', { x: 0, y: 40, z: 0 }); op.op = true; b.sim.addPlayer(op);
    b.sim.command(op, '/gamerule doFireTick false');
    b.sim.setBlock(-5, 10, -6, B.FIRE);
    for (let i = 0; i < 3000; i++) b.sim.tick();
    expect(b.logs()).toBe(125);
  });
});

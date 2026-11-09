import { describe, it, expect } from 'vitest';
import { WorldSim, newPlayer, SimEvent, WorldStore } from '../src/core/sim/WorldSim';
import { WorldGenerator } from '../src/core/worldgen/WorldGenerator';
import { ChunkData } from '../src/core/chunk';
import { B, blockId } from '../src/core/blocks';
import { I, toolId } from '../src/core/items';
import { applyInvOp, emptyInv, craftResult, invHash, cloneInv } from '../src/core/inventory';

function makeWorld(seed = 7) {
  const gen = new WorldGenerator(seed);
  const chunks = new Map<string, ChunkData>();
  const get = (cx: number, cz: number) => {
    const k = `${cx},${cz}`;
    let c = chunks.get(k);
    if (!c) { c = new ChunkData(cx, cz, gen.generate(cx, cz).blocks); chunks.set(k, c); }
    return c;
  };
  const store: WorldStore = {
    getBlock: (x, y, z) => get(x >> 4, z >> 4).get(x & 15, y, z & 15),
    setBlock: (x, y, z, v) => get(x >> 4, z >> 4).set(x & 15, y, z & 15, v),
    isLoaded: () => true,
  };
  const events: SimEvent[] = [];
  const sim = new WorldSim({ seed, store, gen, difficulty: 'normal', emit: (e) => events.push(e), validateMoves: true, authoritative: true });
  return { sim, store, events };
}

describe('inventory and crafting', () => {
  it('crafts planks, sticks and a workbench', () => {
    const inv = emptyInv();
    inv.slots[0] = { id: B.OAK_LOG, count: 2 };
    const ctx = { inv, container: null, containerKind: null, creative: false, drop: () => {} };
    applyInvOp(ctx, { t: 'click', s: { c: 'inv', i: 0 }, b: 0 });
    applyInvOp(ctx, { t: 'click', s: { c: 'craft', i: 0 }, b: 1 });
    expect(craftResult(inv)?.stack).toEqual({ id: B.OAK_PLANKS, count: 4 });
    applyInvOp(ctx, { t: 'quick', s: { c: 'out', i: 0 } });
    applyInvOp(ctx, { t: 'close' });
    const planks = inv.slots.find((s) => s?.id === B.OAK_PLANKS);
    expect(planks?.count).toBe(4);
    expect(inv.slots.some((s) => s?.id === B.OAK_LOG && s.count === 1)).toBe(true);
    expect(applyInvOp(ctx, { t: 'fill', r: 'crafting_table', all: false })).toBe(true);
    expect(craftResult(inv)?.stack.id).toBe(B.WORKBENCH);
  });
  it('is deterministic for client prediction', () => {
    const a = emptyInv();
    a.slots[3] = { id: B.DIRT, count: 64 };
    const b = cloneInv(a);
    const ops = [{ t: 'click', s: { c: 'inv', i: 3 }, b: 1 }, { t: 'click', s: { c: 'inv', i: 10 }, b: 0 }, { t: 'quick', s: { c: 'inv', i: 10 } }] as const;
    for (const op of ops) {
      applyInvOp({ inv: a, container: null, containerKind: null, creative: false, drop: () => {} }, op);
      applyInvOp({ inv: b, container: null, containerKind: null, creative: false, drop: () => {} }, op);
    }
    expect(invHash(a)).toBe(invHash(b));
  });
});

describe('world simulation', () => {
  it('validates mining time and drops cobblestone with a pickaxe', () => {
    const { sim, store, events } = makeWorld();
    const p = newPlayer('p', 'Tester', 'survival', sim.spawn);
    sim.addPlayer(p);
    let x = Math.floor(p.x), z = Math.floor(p.z), y = Math.floor(p.y) - 1;
    while (blockId(store.getBlock(x, y, z)) !== B.STONE && y > 1) y--;
    p.y = y + 1.2;
    store.setBlock(x, y + 1, z, 0); store.setBlock(x, y + 2, z, 0); store.setBlock(x, y + 3, z, 0);
    p.inv.slots[0] = { id: toolId(0, 0), count: 1 };
    sim.setNow(1000);
    expect(sim.digFinish(p, x, y, z)).toBe(false);
    sim.digStart(p, x, y, z);
    sim.setNow(1100);
    expect(sim.digFinish(p, x, y, z)).toBe(false);
    sim.digStart(p, x, y, z);
    sim.setNow(1000 + 2000);
    expect(sim.digFinish(p, x, y, z)).toBe(true);
    expect(blockId(store.getBlock(x, y, z))).toBe(0);
    expect(events.some((e) => e.e === 'spawn' && e.ent.item?.id === B.COBBLESTONE)).toBe(true);
    expect(p.inv.slots[0]?.dmg).toBe(1);
  });
  it('flows water from a placed source', () => {
    const { sim, store } = makeWorld(11);
    const x = 5000, z = 5000;
    for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) { store.setBlock(x + dx, 100, z + dz, B.STONE); for (let y = 101; y < 104; y++) store.setBlock(x + dx, y, z + dz, 0); }
    sim.setBlock(x, 101, z, B.WATER);
    sim.scheduleFluid(x, 101, z, 1);
    for (let i = 0; i < 200; i++) sim.tick();
    expect(blockId(store.getBlock(x + 3, 101, z))).toBe(B.WATER);
  });
  it('applies fall damage from positions and kills players who fall far', () => {
    const { sim } = makeWorld(3);
    const p = newPlayer('p', 'Faller', 'survival', { x: 0, y: 120, z: 0 });
    sim.players.set(p.id, p);
    p.peakY = 120; p.y = 120;
    sim.setNow(0); p.lastMove = 0;
    for (let i = 1; i <= 30; i++) { sim.setNow(i * 50); sim.move(p, 0, 120 - i * 2, 0, 0, 0, 0); }
    sim.setNow(1600);
    sim.move(p, 0, 58, 0, 0, 0, 1);
    expect(p.health).toBeLessThan(20);
  });
});

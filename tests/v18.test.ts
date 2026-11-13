import { describe, it, expect } from 'vitest';
import { WorldSim, WorldStore, newPlayer } from '../src/core/sim/WorldSim';
import { WorldGenerator } from '../src/core/worldgen/WorldGenerator';
import { ChunkData } from '../src/core/chunk';
import { B, blockId, blockMeta, makeBlock, SLAB_ITEM, STAIRS_ITEM, SLAB_TOP, shapeBoxes } from '../src/core/blocks';
import { RECIPES } from '../src/core/crafting';
import { I } from '../src/core/items';
import { E, U, N, PISTON_EXT } from '../src/core/sim/redstone';

function world(floor = B.STONE) {
  const gen = new WorldGenerator(5);
  const chunks = new Map<string, ChunkData>();
  const get = (cx: number, cz: number) => { const k = `${cx},${cz}`; let c = chunks.get(k); if (!c) { c = new ChunkData(cx, cz, new Uint16Array(16 * 16 * 256)); chunks.set(k, c); } return c; };
  const store: WorldStore = { getBlock: (x, y, z) => get(x >> 4, z >> 4).get(x & 15, y, z & 15), setBlock: (x, y, z, v) => get(x >> 4, z >> 4).set(x & 15, y, z & 15, v), isLoaded: () => true, raw: (cx, cz) => get(cx, cz).blocks };
  for (let x = -16; x <= 31; x++) for (let z = -16; z <= 16; z++) for (let y = 5; y <= 9; y++) store.setBlock(x, y, z, floor);
  const events: { e: string }[] = [];
  const sim = new WorldSim({ seed: 5, store, gen, difficulty: 'normal', emit: (e) => events.push(e), validateMoves: false, authoritative: true, spawn: { x: 0, y: 10, z: 0 } });
  const set = (x: number, y: number, z: number, v: number) => sim.setBlock(x, y, z, v);
  const at = (x: number, y: number, z: number) => store.getBlock(x, y, z);
  const run = (n: number) => { for (let i = 0; i < n; i++) sim.tick(); };
  const watcher = newPlayer('w', 'W', 'creative', { x: 0.5, y: 30, z: 12.5 });
  sim.addPlayer(watcher);
  Object.assign(watcher, { x: 0.5, y: 30, z: 12.5 });
  return { sim, store, set, at, run, events };
}

describe('slime and honey', () => {
  it('a piston drags blocks stuck to a slime block', () => {
    const w = world();
    w.set(0, 14, 0, makeBlock(B.PISTON, E));
    w.set(1, 14, 0, B.SLIME_BLOCK);
    w.set(1, 15, 0, B.COBBLESTONE);
    w.set(1, 14, 1, B.OAK_PLANKS);
    w.set(-1, 14, 0, B.REDSTONE_BLOCK);
    w.run(4);
    expect(blockId(w.at(2, 14, 0))).toBe(B.SLIME_BLOCK);
    expect(blockId(w.at(2, 15, 0))).toBe(B.COBBLESTONE);
    expect(blockId(w.at(2, 14, 1))).toBe(B.OAK_PLANKS);
    expect(blockId(w.at(1, 15, 0))).toBe(0);
  });

  it('slime and honey do not stick to each other', () => {
    const w = world();
    w.set(0, 14, 0, makeBlock(B.PISTON, E));
    w.set(1, 14, 0, B.SLIME_BLOCK);
    w.set(1, 15, 0, B.HONEY_BLOCK);
    w.set(-1, 14, 0, B.REDSTONE_BLOCK);
    w.run(4);
    expect(blockId(w.at(2, 14, 0))).toBe(B.SLIME_BLOCK);
    expect(blockId(w.at(1, 15, 0))).toBe(B.HONEY_BLOCK);
  });

  it('sticky pistons pull a slime structure back', () => {
    const w = world();
    w.set(0, 14, 0, makeBlock(B.STICKY_PISTON, E));
    w.set(1, 14, 0, B.SLIME_BLOCK);
    w.set(1, 15, 0, B.COBBLESTONE);
    w.set(-1, 14, 0, B.REDSTONE_BLOCK);
    w.run(4);
    w.set(-1, 14, 0, 0);
    w.run(4);
    expect(blockId(w.at(1, 14, 0))).toBe(B.SLIME_BLOCK);
    expect(blockId(w.at(1, 15, 0))).toBe(B.COBBLESTONE);
    expect(blockId(w.at(2, 15, 0))).toBe(0);
  });

  it('a 1-tick pulse makes a sticky piston leave its block behind', () => {
    const w = world();
    w.set(0, 14, 0, makeBlock(B.STICKY_PISTON, E));
    w.set(1, 14, 0, B.COBBLESTONE);
    w.set(-1, 14, 0, B.REDSTONE_BLOCK);
    w.run(1);
    w.set(-1, 14, 0, 0);
    w.run(4);
    expect(blockId(w.at(2, 14, 0))).toBe(B.COBBLESTONE);
    expect(blockId(w.at(1, 14, 0))).toBe(0);
    expect(blockMeta(w.at(0, 14, 0)) & PISTON_EXT).toBeFalsy();
  });
});

describe('pistons move entities', () => {
  it('a piston facing up lifts a player standing on it', () => {
    const w = world();
    w.set(0, 10, 0, makeBlock(B.PISTON, U));
    const p = newPlayer('a', 'A', 'survival', { x: 0.5, y: 11, z: 0.5 });
    w.sim.addPlayer(p);
    p.x = 0.5; p.y = 11; p.z = 0.5;
    w.set(-1, 10, 0, B.REDSTONE_BLOCK);
    w.run(5);
    expect(p.y).toBeGreaterThanOrEqual(11.99);
  });

  it('a pushed block shoves a player out of the way', () => {
    const w = world();
    w.set(0, 10, 0, makeBlock(B.PISTON, E));
    w.set(1, 10, 0, B.COBBLESTONE);
    const p = newPlayer('a', 'A', 'survival', { x: 2.5, y: 10, z: 0.5 });
    w.sim.addPlayer(p);
    p.x = 2.5; p.y = 10; p.z = 0.5;
    w.set(-1, 10, 0, B.REDSTONE_BLOCK);
    w.run(5);
    expect(p.x).toBeGreaterThanOrEqual(3.29);
  });

  it('sends animation data for moving blocks', () => {
    const w = world();
    w.set(0, 10, 0, makeBlock(B.PISTON, E));
    w.set(1, 10, 0, B.COBBLESTONE);
    w.set(-1, 10, 0, B.REDSTONE_BLOCK);
    w.run(2);
    const ev = w.events.find((e) => e.e === 'pmove') as { e: string; l: number[] } | undefined;
    expect(ev).toBeTruthy();
    expect(ev!.l).toContain(B.COBBLESTONE);
    expect(ev!.l.length % 7).toBe(0);
  });
});

describe('Thunder Keg (TNT)', () => {
  it('ignites when powered and blows a crater', () => {
    const w = world();
    w.set(0, 10, 0, B.TNT);
    w.set(-1, 10, 0, B.REDSTONE_BLOCK);
    expect(blockId(w.at(0, 10, 0))).toBe(0);
    const tnt = [...w.sim.entities.values()].find((e) => e.kind === 'tnt');
    expect(tnt).toBeTruthy();
    w.run(90);
    expect([...w.sim.entities.values()].some((e) => e.kind === 'tnt')).toBe(false);
    let gone = 0;
    for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) if (!blockId(w.at(x, 9, z))) gone++;
    expect(gone).toBeGreaterThan(8);
    expect(w.events.some((e) => e.e === 'boom')).toBe(true);
  });

  it('obsidian survives the blast and water stops block damage', () => {
    const w = world(B.OBSIDIAN);
    w.set(0, 10, 0, B.TNT);
    w.sim.primeTnt(0, 10, 0, 1);
    w.run(3);
    expect(blockId(w.at(0, 9, 0))).toBe(B.OBSIDIAN);
    const v = world();
    v.set(0, 10, 0, B.TNT);
    v.sim.primeTnt(0, 10, 0, 6);
    v.set(0, 10, 0, B.WATER);
    v.run(8);
    expect(blockId(v.at(0, 9, 0))).toBe(B.STONE);
  });

  it('chain reacts with nearby kegs', () => {
    const w = world();
    w.set(0, 10, 0, B.TNT);
    w.set(3, 10, 0, B.TNT);
    w.sim.primeTnt(0, 10, 0, 1);
    w.run(3);
    expect(blockId(w.at(3, 10, 0))).toBe(0);
    expect([...w.sim.entities.values()].some((e) => e.kind === 'tnt')).toBe(true);
  });

  it('a Firestriker lights a keg', () => {
    const w = world();
    w.set(0, 10, 0, B.TNT);
    const p = newPlayer('a', 'A', 'survival', { x: 2.5, y: 10, z: 0.5 });
    w.sim.addPlayer(p);
    Object.assign(p, { x: 2.5, y: 10, z: 0.5 });
    p.inv.slots[p.inv.selected] = { id: I.FLINT_AND_STEEL, count: 1 };
    w.sim.use(p, 0, 10, 0, 1, 0, 0);
    expect(blockId(w.at(0, 10, 0))).toBe(0);
    expect([...w.sim.entities.values()].some((e) => e.kind === 'tnt')).toBe(true);
  });

  it('duplicates when a block in front breaks mid-push (Java dupe order)', () => {
    const w = world();
    w.set(0, 14, 0, makeBlock(B.PISTON, E));
    w.set(1, 14, 0, B.COBBLESTONE);
    w.set(2, 14, 0, B.TNT);
    w.set(3, 13, 0, B.STONE);
    w.set(3, 14, 0, makeBlock(B.TORCH, 0));
    w.store.setBlock(2, 15, 0, B.REDSTONE_BLOCK);
    w.set(-1, 14, 0, B.REDSTONE_BLOCK);
    w.run(3);
    expect([...w.sim.entities.values()].filter((e) => e.kind === 'tnt').length).toBe(1);
    expect(blockId(w.at(3, 14, 0))).toBe(B.TNT);
  });
});

describe('fluids and combat', () => {
  it('lava touching water turns to cobblestone within a tick', () => {
    const w = world();
    w.set(0, 10, 0, makeBlock(B.LAVA, 2));
    w.set(1, 10, 0, B.WATER);
    w.run(2);
    expect(blockId(w.at(0, 10, 0))).toBe(B.COBBLESTONE);
  });

  it('water flows toward the nearest drop like Java', () => {
    const w = world();
    w.set(3, 9, 0, 0);
    w.set(0, 10, 0, B.WATER);
    w.run(30);
    expect(blockId(w.at(1, 10, 0))).toBe(B.WATER);
    expect(blockId(w.at(-1, 10, 0))).toBe(0);
  });

  it('players standing next to lava are not set on fire', () => {
    const w = world();
    w.set(1, 10, 0, B.LAVA);
    const p = newPlayer('a', 'A', 'survival', { x: 0.62, y: 10, z: 0.5 });
    w.sim.addPlayer(p);
    p.x = 0.62; p.y = 10; p.z = 0.5;
    w.run(20);
    expect(p.fireT).toBe(0);
  });
});
describe('slabs and stairs', () => {
  it('place, stack into a full block, and drop the right item', () => {
    const w = world();
    const p = newPlayer('a', 'A', 'survival', { x: 2.5, y: 10, z: 0.5 });
    w.sim.addPlayer(p);
    Object.assign(p, { x: 2.5, y: 10, z: 0.5 });
    p.inv.slots[p.inv.selected] = { id: SLAB_ITEM + 0, count: 4 };
    expect(w.sim.use(p, 0, 9, 0, 0, 1, 0, false, 1)).toBe(true);
    expect(blockId(w.at(0, 10, 0))).toBe(B.SLAB);
    expect(blockMeta(w.at(0, 10, 0)) & SLAB_TOP).toBe(0);
    w.sim.use(p, 0, 10, 0, 0, 1, 0, false, 0.5);
    expect(blockId(w.at(0, 10, 0))).toBe(B.OAK_PLANKS);
    w.sim.use(p, 0, 10, 0, -1, 0, 0, false, 0.8);
    expect(blockMeta(w.at(-1, 10, 0)) & SLAB_TOP).toBeTruthy();
    expect(w.sim.blockDrops(w.at(-1, 10, 0), null, false)[0].id).toBe(SLAB_ITEM);
  });

  it('stairs face away from the player and can be climbed', () => {
    const w = world();
    const p = newPlayer('a', 'A', 'survival', { x: 0.5, y: 10, z: 3.5 });
    w.sim.addPlayer(p);
    Object.assign(p, { x: 0.5, y: 10, z: 3.5, yaw: 0 });
    p.inv.slots[p.inv.selected] = { id: STAIRS_ITEM + 4, count: 4 };
    w.sim.use(p, 0, 9, 0, 0, 1, 0, false, 1);
    const v = w.at(0, 10, 0);
    expect(blockId(v)).toBe(B.STAIRS);
    const boxes = shapeBoxes(v);
    expect(boxes[1][2]).toBe(0);
    expect(boxes[1][5]).toBe(0.5);
  });

  it('have crafting recipes', () => {
    expect(RECIPES.some((r) => r.result === SLAB_ITEM + 7 && r.count === 6)).toBe(true);
    expect(RECIPES.some((r) => r.result === STAIRS_ITEM + 7 && r.count === 4)).toBe(true);
  });
});
void N;

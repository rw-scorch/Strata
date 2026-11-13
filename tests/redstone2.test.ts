import { describe, it, expect } from 'vitest';
import { WorldSim, WorldStore } from '../src/core/sim/WorldSim';
import { WorldGenerator } from '../src/core/worldgen/WorldGenerator';
import { ChunkData } from '../src/core/chunk';
import { B, blockId, blockMeta, makeBlock } from '../src/core/blocks';
import { I } from '../src/core/items';
import { W, E, D, U, N, S, PISTON_EXT, OBS_ON, HOPPER_OFF } from '../src/core/sim/redstone';

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

describe('pistons', () => {
  it('push a row of blocks and retract leaving them', () => {
    const w = world();
    w.set(0, 10, 0, makeBlock(B.PISTON, E));
    w.set(1, 10, 0, B.COBBLESTONE);
    w.set(2, 10, 0, B.OAK_PLANKS);
    w.set(-1, 10, 0, B.REDSTONE_BLOCK);
    w.run(4);
    expect(blockMeta(w.at(0, 10, 0)) & PISTON_EXT).toBeTruthy();
    expect(blockId(w.at(1, 10, 0))).toBe(B.PISTON_HEAD);
    expect(blockId(w.at(2, 10, 0))).toBe(B.COBBLESTONE);
    expect(blockId(w.at(3, 10, 0))).toBe(B.OAK_PLANKS);
    w.set(-1, 10, 0, 0);
    w.run(4);
    expect(blockMeta(w.at(0, 10, 0)) & PISTON_EXT).toBeFalsy();
    expect(blockId(w.at(1, 10, 0))).toBe(0);
    expect(blockId(w.at(2, 10, 0))).toBe(B.COBBLESTONE);
  });

  it('sticky pistons pull the block back', () => {
    const w = world();
    w.set(0, 10, 0, makeBlock(B.STICKY_PISTON, E));
    w.set(1, 10, 0, B.COBBLESTONE);
    w.set(-1, 10, 0, B.REDSTONE_BLOCK);
    w.run(4);
    expect(blockId(w.at(2, 10, 0))).toBe(B.COBBLESTONE);
    w.set(-1, 10, 0, 0);
    w.run(4);
    expect(blockId(w.at(1, 10, 0))).toBe(B.COBBLESTONE);
    expect(blockId(w.at(2, 10, 0))).toBe(0);
  });

  it('refuse more than 12 blocks and obsidian', () => {
    const w = world();
    w.set(0, 10, 0, makeBlock(B.PISTON, E));
    for (let x = 1; x <= 13; x++) w.set(x, 10, 0, B.COBBLESTONE);
    w.set(-1, 10, 0, B.REDSTONE_BLOCK);
    w.run(4);
    expect(blockMeta(w.at(0, 10, 0)) & PISTON_EXT).toBeFalsy();
    w.set(13, 10, 0, 0);
    w.run(2);
    expect(blockMeta(w.at(0, 10, 0)) & PISTON_EXT).toBeFalsy();
    w.set(-1, 10, 0, 0);
    w.set(-1, 10, 0, B.REDSTONE_BLOCK);
    w.run(4);
    expect(blockMeta(w.at(0, 10, 0)) & PISTON_EXT).toBeTruthy();
    expect(blockId(w.at(13, 10, 0))).toBe(B.COBBLESTONE);
    const v = world();
    v.set(0, 10, 0, makeBlock(B.PISTON, E));
    v.set(1, 10, 0, B.OBSIDIAN);
    v.set(-1, 10, 0, B.REDSTONE_BLOCK);
    v.run(4);
    expect(blockMeta(v.at(0, 10, 0)) & PISTON_EXT).toBeFalsy();
  });

  it('quasi-connectivity: power diagonally above activates it', () => {
    const w = world();
    w.set(0, 10, 0, makeBlock(B.PISTON, E));
    w.set(0, 11, 0, B.GLASS);
    w.set(-1, 11, 0, B.REDSTONE_BLOCK);
    w.run(1);
    expect(blockMeta(w.at(0, 10, 0)) & PISTON_EXT).toBeFalsy();
    w.set(-1, 10, 0, B.STONE);
    w.run(4);
    expect(blockMeta(w.at(0, 10, 0)) & PISTON_EXT).toBeTruthy();
  });
});

describe('observers', () => {
  it('pulse when the watched block changes', () => {
    const w = world();
    w.set(0, 10, 0, makeBlock(B.OBSERVER, E));
    w.set(-1, 10, 0, B.REDSTONE_LAMP);
    w.run(4);
    expect(blockMeta(w.at(0, 10, 0)) & OBS_ON).toBeFalsy();
    w.set(1, 10, 0, B.STONE);
    w.run(2);
    expect(blockMeta(w.at(0, 10, 0)) & OBS_ON).toBeTruthy();
    expect(blockId(w.at(-1, 10, 0))).toBe(B.REDSTONE_LAMP_LIT);
    w.run(2);
    expect(blockMeta(w.at(0, 10, 0)) & OBS_ON).toBeFalsy();
  });

  it('a sugar cane farm harvests when cane grows to three', () => {
    const w = world();
    w.set(0, 8, 0, B.STONE);
    w.set(1, 8, 0, B.STONE);
    w.set(0, 9, 0, B.SAND);
    w.set(1, 9, 0, B.WATER);
    w.set(0, 10, 0, B.SUGAR_CANE);
    w.set(0, 11, 0, B.SUGAR_CANE);
    w.set(0, 11, -1, makeBlock(B.PISTON, S));
    w.set(0, 12, -1, makeBlock(B.OBSERVER, S));
    w.set(0, 11, -2, B.STONE);
    w.set(0, 12, -2, B.REDSTONE_WIRE);
    w.run(3);
    w.set(0, 12, 0, B.SUGAR_CANE);
    w.run(12);
    expect(blockId(w.at(0, 12, 0))).toBe(0);
    expect(blockId(w.at(0, 11, 0))).not.toBe(B.SUGAR_CANE);
    expect(blockId(w.at(0, 10, 0))).toBe(B.SUGAR_CANE);
    expect(blockMeta(w.at(0, 11, -1)) & PISTON_EXT).toBeFalsy();
    const drops = [...w.sim.entities.values()].filter((e) => e.kind === 'item' && e.item?.id === B.SUGAR_CANE);
    expect(drops.length).toBeGreaterThan(0);
  });
});

describe('hoppers and dispensers', () => {
  it('hoppers move items from a chest above into a chest in front', () => {
    const w = world();
    w.set(0, 11, 0, B.CHEST);
    w.set(0, 10, 0, makeBlock(B.HOPPER, E));
    w.set(1, 10, 0, B.CHEST);
    const top = w.sim.ensureBlockEntity(0, 11, 0)!;
    top.items[0] = { id: I.COBBLESTONE, count: 3 };
    w.run(60);
    const out = w.sim.ensureBlockEntity(1, 10, 0)!;
    expect(out.items.reduce((n, s) => n + (s?.count ?? 0), 0)).toBe(3);
    expect(top.items[0]).toBeNull();
  });

  it('powered hoppers are locked', () => {
    const w = world();
    w.set(0, 11, 0, B.CHEST);
    w.set(0, 10, 0, makeBlock(B.HOPPER, D));
    w.set(1, 10, 0, B.REDSTONE_BLOCK);
    expect(blockMeta(w.at(0, 10, 0)) & HOPPER_OFF).toBeTruthy();
    w.sim.ensureBlockEntity(0, 11, 0)!.items[0] = { id: I.COBBLESTONE, count: 3 };
    w.run(30);
    expect(w.sim.ensureBlockEntity(0, 10, 0)!.items.every((s) => !s)).toBe(true);
  });

  it('hoppers collect dropped items', () => {
    const w = world();
    w.set(0, 10, 0, makeBlock(B.HOPPER, D));
    w.sim.spawnItem(0.5, 11.2, 0.5, { id: I.STICK, count: 4 }, 0, 0, 0, 0);
    w.run(20);
    expect(w.sim.ensureBlockEntity(0, 10, 0)!.items.find((s) => s)?.count).toBe(4);
  });

  it('dispensers place water and bone meal crops on a button press', () => {
    const w = world();
    w.set(0, 10, 0, makeBlock(B.DISPENSER, E));
    const be = w.sim.ensureBlockEntity(0, 10, 0)!;
    be.items[0] = { id: I.WATER_BUCKET, count: 1 };
    w.set(-1, 10, 0, B.REDSTONE_BLOCK);
    w.run(6);
    expect(blockId(w.at(1, 10, 0))).toBe(B.WATER);
    expect(be.items[0]?.id).toBe(I.BUCKET);
    const v = world();
    v.set(1, 9, 0, B.FARMLAND);
    v.set(1, 10, 0, makeBlock(B.WHEAT, 0));
    v.set(0, 10, 0, makeBlock(B.DISPENSER, E));
    v.sim.ensureBlockEntity(0, 10, 0)!.items[0] = { id: I.BONE_MEAL, count: 1 };
    v.set(-1, 10, 0, B.REDSTONE_BLOCK);
    v.run(6);
    expect(blockMeta(v.at(1, 10, 0)) & 7).toBeGreaterThan(0);
  });

  it('droppers feed containers in front', () => {
    const w = world();
    w.set(0, 10, 0, makeBlock(B.DROPPER, E));
    w.set(1, 10, 0, B.CHEST);
    w.sim.ensureBlockEntity(0, 10, 0)!.items[4] = { id: I.STICK, count: 2 };
    w.set(-1, 10, 0, B.REDSTONE_BLOCK);
    w.run(6);
    expect(w.sim.ensureBlockEntity(1, 10, 0)!.items[0]?.count).toBe(1);
  });
});
void W; void U; void N;

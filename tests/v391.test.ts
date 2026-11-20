import { describe, it, expect } from 'vitest';
import { WorldSim, WorldStore, newPlayer } from '../src/core/sim/WorldSim';
import { WorldGenerator } from '../src/core/worldgen/WorldGenerator';
import { ChunkData } from '../src/core/chunk';
import { B, X, XV, CB, DRIP_DOWN, CAULDRON_LAVA, cauldronLevel, blockId, makeBlock, blockBox, selectionBox, isFullCube } from '../src/core/blocks';
import { I } from '../src/core/items';
import { E, D } from '../src/core/sim/redstone';

function world(difficulty: 'peaceful' | 'normal' = 'peaceful') {
  const chunks = new Map<string, ChunkData>();
  const get = (cx: number, cz: number) => { const k = `${cx},${cz}`; let c = chunks.get(k); if (!c) { c = new ChunkData(cx, cz, new Uint16Array(16 * 16 * 256)); chunks.set(k, c); } return c; };
  const store: WorldStore = { getBlock: (x, y, z) => get(x >> 4, z >> 4).get(x & 15, y, z & 15), setBlock: (x, y, z, v) => get(x >> 4, z >> 4).set(x & 15, y, z & 15, v), isLoaded: () => true, raw: (cx, cz) => get(cx, cz).blocks };
  for (let x = -16; x <= 31; x++) for (let z = -16; z <= 16; z++) store.setBlock(x, 9, z, B.STONE);
  const sim = new WorldSim({ seed: 5, store, gen: new WorldGenerator(5), difficulty, emit: () => {}, validateMoves: false, authoritative: true, spawn: { x: 0, y: 10, z: 0 } });
  const p = newPlayer('a', 'A', 'creative', { x: 0.5, y: 10, z: -12.5 });
  sim.addPlayer(p); p.x = 0.5; p.y = 10; p.z = -12.5;
  return { sim, store, run: (n: number) => { for (let i = 0; i < n; i++) sim.tick(); } };
}

describe('v39.1 sugar cane farms', () => {
  it('mud and soul sand are 14/16 tall to stand on but select as full cubes', () => {
    expect(blockBox(B.MUD)![4]).toBeCloseTo(14 / 16);
    expect(blockBox(X(XV.SOUL_SAND))![4]).toBeCloseTo(14 / 16);
    expect(selectionBox(B.MUD)![4]).toBe(1);
    expect(isFullCube(B.MUD)).toBe(false);
    expect(isFullCube(B.STONE)).toBe(true);
  });

  it('a piston-harvested cane falls onto mud and the hopper below collects it', () => {
    const { sim, run } = world();
    for (const x of [5, 6]) { sim.setBlock(x, 10, 0, makeBlock(B.HOPPER, D)); sim.setBlock(x, 11, 0, B.MUD); }
    sim.setBlock(5, 10, 1, B.STONE);
    for (const [x, z] of [[4, 1], [6, 1], [5, 2]]) sim.setBlock(x, 11, z, B.GLASS);
    sim.setBlock(5, 11, 1, B.WATER);
    sim.setBlock(5, 12, 0, B.SUGAR_CANE);
    sim.setBlock(5, 13, 0, B.SUGAR_CANE);
    for (const x of [5, 6]) for (const y of [12, 13]) for (const z of [-1, 1]) sim.setBlock(x, y, z, B.GLASS);
    sim.setBlock(7, 12, 0, B.GLASS); sim.setBlock(7, 13, 0, B.GLASS);
    sim.setBlock(4, 13, 0, makeBlock(B.PISTON, E));
    run(2);
    sim.setBlock(3, 13, 0, B.REDSTONE_BLOCK);
    run(60);
    expect(blockId(sim.get(5, 12, 0))).toBe(B.SUGAR_CANE);
    let got = 0;
    for (const k of ['5,10,0', '6,10,0']) { const be = sim.blockEntities.get(k) as { items: ({ id: number; count: number } | null)[] }; got += be.items.filter(Boolean).reduce((n, st) => n + (st!.id === B.SUGAR_CANE ? st!.count : 0), 0); }
    expect(got).toBeGreaterThan(0);
  });

  it('a full block above a hopper still blocks pickup from on top of it', () => {
    const { sim, run } = world();
    sim.setBlock(8, 10, 0, makeBlock(B.HOPPER, D));
    sim.setBlock(8, 11, 0, B.STONE);
    sim.spawnItem(8.5, 12.2, 0.5, { id: B.DIRT, count: 1 }, 0, 0, 0, 0);
    run(40);
    const be = sim.blockEntities.get('8,10,0') as { items: unknown[] };
    expect(be.items.filter(Boolean).length).toBe(0);
  });
});

describe('v39.1 mob spawners', () => {
  it('a placed spawner gets a cage mob, spawns nearby mobs and caps at six', () => {
    const { sim, run } = world('normal');
    const p = [...sim.players.values()][0];
    p.x = 10.5; p.z = 3.5;
    sim.setBlock(10, 11, 0, B.SPAWNER);
    const be = sim.blockEntities.get('10,11,0') as { type: string; mob: string };
    expect(be?.type).toBe('spawner');
    run(1200);
    expect((sim.get(10, 11, 0) >>> 8) & 0xff).toBe(4);
    const near = [...sim.entities.values()].filter((e) => e.kind === 'mob' && e.type === 'hollowed' && Math.abs(e.x - 10.5) < 9 && Math.abs(e.z - 0.5) < 9);
    expect(near.length).toBeGreaterThan(0);
    expect(near.length).toBeLessThanOrEqual(6);
  });

  it('stays idle when nobody is within 16 blocks', () => {
    const { sim, run } = world('normal');
    sim.setBlock(25, 11, 14, B.SPAWNER);
    const p = [...sim.players.values()][0]; p.x = -10; p.z = -14;
    run(900);
    expect([...sim.entities.values()].filter((e) => e.kind === 'mob' && Math.abs(e.x - 25.5) < 6 && Math.abs(e.z - 14.5) < 6).length).toBe(0);
  });
});

describe('v39.1 cauldrons and dripstone', () => {
  const rig = (fluid: number) => {
    const { sim, run } = world();
    for (let x = 18; x <= 22; x++) for (let z = -2; z <= 2; z++) sim.setBlock(x, 20, z, B.STONE);
    sim.setBlock(20, 21, 0, fluid);
    sim.setBlock(20, 19, 0, makeBlock(CB.POINTED_DRIPSTONE, DRIP_DOWN | 2));
    sim.setBlock(20, 18, 0, makeBlock(CB.POINTED_DRIPSTONE, DRIP_DOWN | 1));
    sim.setBlock(20, 10, 0, B.CAULDRON);
    return { sim, run };
  };
  it('water above a stalactite fills the cauldron below one level at a time', () => {
    const { sim } = rig(B.WATER);
    const tick = (sim as unknown as { randomTick(x: number, y: number, z: number, v: number, id: number): void });
    for (let i = 0; i < 200 && cauldronLevel(sim.get(20, 10, 0)) < 3; i++) tick.randomTick(20, 18, 0, sim.get(20, 18, 0), CB.POINTED_DRIPSTONE);
    expect(cauldronLevel(sim.get(20, 10, 0))).toBe(3);
    expect((sim.get(20, 10, 0) >>> 8) & CAULDRON_LAVA).toBe(0);
  });
  it('lava above a stalactite makes a lava cauldron', () => {
    const { sim } = rig(B.LAVA);
    const tick = (sim as unknown as { randomTick(x: number, y: number, z: number, v: number, id: number): void });
    for (let i = 0; i < 600 && !cauldronLevel(sim.get(20, 10, 0)); i++) tick.randomTick(20, 18, 0, sim.get(20, 18, 0), CB.POINTED_DRIPSTONE);
    expect((sim.get(20, 10, 0) >>> 8) & CAULDRON_LAVA).toBe(CAULDRON_LAVA);
  });
  it('a bucket empties a full lava cauldron into a lava bucket', () => {
    const { sim } = rig(B.STONE);
    const p = [...sim.players.values()][0];
    p.mode = 'survival'; p.x = 20.5; p.y = 10; p.z = 2.5;
    sim.setBlock(20, 10, 0, makeBlock(B.CAULDRON, CAULDRON_LAVA | 3));
    p.inv.slots[p.inv.selected] = { id: I.BUCKET, count: 1 };
    (sim as unknown as { useBucket(p: unknown, x: number, y: number, z: number, nx: number, ny: number, nz: number, s: unknown): boolean }).useBucket(p, 20, 10, 0, 0, 1, 0, p.inv.slots[p.inv.selected]);
    expect(p.inv.slots[p.inv.selected]?.id).toBe(I.LAVA_BUCKET);
    expect(sim.get(20, 10, 0)).toBe(B.CAULDRON);
  });
});

describe('v39.1 arrows', () => {
  const shoot = (sim: WorldSim, x: number, y: number, z: number, vx: number, vy: number, vz: number) => {
    const p = [...sim.players.values()][0];
    p.mode = 'survival'; p.x = x; p.y = y - 1.52; p.z = z;
    p.inv.slots[p.inv.selected] = { id: I.BOW, count: 1 };
    p.inv.slots[5] = { id: I.ARROW, count: 4 };
    const yaw = Math.atan2(-vx, -vz), pitch = Math.atan2(vy, Math.hypot(vx, vz));
    sim.shootBow(p, 1, yaw, pitch);
    return [...sim.entities.values()].find((e) => e.kind === 'arrow')!;
  };
  it('a stuck arrow falls when its block is broken', () => {
    const { sim, run } = world();
    sim.setBlock(5, 11, -12, B.STONE);
    const a = shoot(sim, 0.5, 11.5, -11.5, 1, 0, 0);
    run(10);
    expect(a.stuck).toBeDefined();
    sim.setBlock(5, 11, -12, 0);
    run(30);
    expect(a.stuck).toBeDefined();
    expect(a.y).toBeLessThan(11);
  });
  it('arrows slow sharply in water', () => {
    const { sim, run } = world();
    for (let x = 2; x < 30; x++) for (let y = 10; y < 14; y++) sim.setBlock(x, y, -12, B.WATER);
    const a = shoot(sim, 0.5, 12.5, -11.5, 1, 0, 0);
    run(30);
    expect(a.x).toBeLessThan(14);
  });
  it('an arrow presses a wooden button', () => {
    const { sim, run } = world();
    sim.setBlock(6, 12, -12, B.STONE);
    sim.setBlock(5, 12, -12, makeBlock(B.OAK_BUTTON, 2));
    shoot(sim, 0.5, 12.5, -11.5, 1, 0, 0);
    run(6);
    expect(blockId(sim.get(5, 12, -12))).toBe(B.OAK_BUTTON);
    expect((sim.get(5, 12, -12) >>> 8) & 8).toBe(8);
  });
});

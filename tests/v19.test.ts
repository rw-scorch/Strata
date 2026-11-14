import { describe, it, expect } from 'vitest';
import { WorldSim, WorldStore, newPlayer, MF } from '../src/core/sim/WorldSim';
import { WorldGenerator } from '../src/core/worldgen/WorldGenerator';
import { ChunkData } from '../src/core/chunk';
import { B, blockId, blockMeta, makeBlock, BLAST_RES, BLOCKS } from '../src/core/blocks';
import { I } from '../src/core/items';
import { railShape, railPowered } from '../src/core/rails';
import { maceBonus } from '../src/core/sim/combat';

function world() {
  const gen = new WorldGenerator(5);
  const chunks = new Map<string, ChunkData>();
  const get = (cx: number, cz: number) => { const k = `${cx},${cz}`; let c = chunks.get(k); if (!c) { c = new ChunkData(cx, cz, new Uint16Array(16 * 16 * 256)); chunks.set(k, c); } return c; };
  const store: WorldStore = { getBlock: (x, y, z) => get(x >> 4, z >> 4).get(x & 15, y, z & 15), setBlock: (x, y, z, v) => get(x >> 4, z >> 4).set(x & 15, y, z & 15, v), isLoaded: () => true, raw: (cx, cz) => get(cx, cz).blocks };
  for (let x = -24; x <= 40; x++) for (let z = -24; z <= 24; z++) for (let y = 5; y <= 9; y++) store.setBlock(x, y, z, B.STONE);
  const events: { e: string }[] = [];
  const sim = new WorldSim({ seed: 5, store, gen, difficulty: 'normal', emit: (e) => events.push(e), validateMoves: false, authoritative: true, spawn: { x: 0, y: 10, z: 0 } });
  const watcher = newPlayer('w', 'W', 'creative', { x: 0.5, y: 40, z: 20.5 });
  sim.addPlayer(watcher);
  Object.assign(watcher, { x: 0.5, y: 40, z: 20.5 });
  const set = (x: number, y: number, z: number, v: number) => sim.setBlock(x, y, z, v);
  const at = (x: number, y: number, z: number) => store.getBlock(x, y, z);
  const run = (n: number) => { for (let i = 0; i < n; i++) sim.tick(); };
  const player = (x: number, y: number, z: number, mode: 'survival' | 'creative' = 'survival') => { const p = newPlayer(`p${Math.random()}`, 'P', mode, { x, y, z }); p.op = true; sim.addPlayer(p); Object.assign(p, { x, y, z }); return p; };
  return { sim, store, set, at, run, events, player };
}

describe('blast resistance', () => {
  it('every block has a value, matching Java for key blocks', () => {
    for (const b of BLOCKS) if (b && b.id) expect(Number.isFinite(BLAST_RES[b.id])).toBe(true);
    expect(BLAST_RES[B.OBSIDIAN]).toBe(1200);
    expect(BLAST_RES[B.STONE]).toBe(6);
    expect(BLAST_RES[B.DIRT]).toBe(0.5);
    expect(BLAST_RES[B.OAK_PLANKS]).toBe(3);
    expect(BLAST_RES[B.BEDROCK]).toBeGreaterThan(1e6);
  });

  it('stacked kegs merge into one entity and still all explode', () => {
    const w = world();
    for (let i = 0; i < 20; i++) w.sim.spawnPrimed(0.5, 10, 0.5, 40, 0, 0, 0);
    w.run(1);
    const kegs = [...w.sim.entities.values()].filter((e) => e.kind === 'tnt');
    expect(kegs.length).toBe(1);
    expect(kegs[0].count).toBe(20);
    w.run(45);
    expect(w.events.filter((e) => e.e === 'boom').length).toBe(20);
  });

  it('a big chain reaction stays fast', () => {
    const w = world();
    for (let x = 0; x < 6; x++) for (let z = 0; z < 6; z++) for (let y = 10; y < 13; y++) w.set(x, y, z, B.TNT);
    w.sim.primeTnt(0, 10, 0, 1);
    const t0 = performance.now();
    w.run(80);
    const ms = performance.now() - t0;
    expect(w.events.filter((e) => e.e === 'boom').length).toBeGreaterThan(80);
    expect(ms).toBeLessThan(6000);
  });
});

describe('rails', () => {
  it('connect into curves and slopes', () => {
    const w = world();
    const p = w.player(1.5, 10, 3.5);
    p.inv.slots[p.inv.selected] = { id: B.RAIL, count: 64 };
    w.sim.use(p, 0, 9, 0, 0, 1, 0);
    w.sim.use(p, 1, 9, 0, 0, 1, 0);
    expect(railShape(w.at(0, 10, 0))).toBe(1);
    expect(railShape(w.at(1, 10, 0))).toBe(1);
    w.sim.use(p, 1, 9, 1, 0, 1, 0);
    expect(railShape(w.at(1, 10, 0))).toBe(7);
    w.set(3, 10, 0, B.STONE);
    w.sim.use(p, 3, 10, 0, 0, 1, 0);
    w.sim.use(p, 2, 9, 0, 0, 1, 0);
    expect(railShape(w.at(2, 10, 0))).toBe(2);
  });

  it('powered rails power a line of up to 9 from one lever', () => {
    const w = world();
    for (let x = 0; x < 12; x++) w.set(x, 10, 0, makeBlock(B.POWERED_RAIL, 1));
    w.set(0, 10, 1, B.REDSTONE_BLOCK);
    w.run(2);
    expect(railPowered(w.at(0, 10, 0))).toBe(true);
    expect(railPowered(w.at(8, 10, 0))).toBe(true);
    expect(railPowered(w.at(9, 10, 0))).toBe(false);
  });
});

describe('minecarts', () => {
  it('powered rails launch a cart and it coasts along', () => {
    const w = world();
    for (let x = 0; x < 30; x++) w.set(x, 10, 0, makeBlock(x < 3 ? B.POWERED_RAIL : B.RAIL, 1));
    w.set(0, 10, 1, B.REDSTONE_BLOCK);
    w.set(-1, 10, 0, B.STONE);
    w.run(2);
    const c = w.sim.placeCart(null, 0, 10, 0, false)!;
    w.run(40);
    expect(c.x).toBeGreaterThan(6);
    expect(Math.abs(c.z - 0.5)).toBeLessThan(0.05);
  });

  it('a cart follows a curve', () => {
    const w = world();
    for (let x = 0; x < 4; x++) w.set(x, 10, 0, makeBlock(B.RAIL, 1));
    w.set(4, 10, 0, makeBlock(B.RAIL, 7));
    for (let z = 1; z < 6; z++) w.set(4, 10, z, makeBlock(B.RAIL, 0));
    const c = w.sim.placeCart(null, 1, 10, 0, false)!;
    c.vx = 8;
    w.run(30);
    expect(Math.floor(c.x)).toBe(4);
    expect(c.z).toBeGreaterThan(2);
  });

  it('players can ride and get off', () => {
    const w = world();
    for (let x = 0; x < 10; x++) w.set(x, 10, 0, makeBlock(B.RAIL, 1));
    const c = w.sim.placeCart(null, 2, 10, 0, false)!;
    const p = w.player(2.5, 10, 1.5);
    expect(w.sim.useEntity(p, c.id)).toBe(true);
    expect(p.riding).toBe(c.id);
    c.vx = 6;
    w.run(10);
    expect(p.x).toBeCloseTo(c.x, 3);
    w.sim.move(p, p.x, p.y, p.z, 0, 0, MF.CROUCH);
    expect(p.riding).toBeUndefined();
  });

  it('detector rails give off a signal under a cart', () => {
    const w = world();
    w.set(0, 10, 0, makeBlock(B.DETECTOR_RAIL, 1));
    w.set(0, 10, 1, B.REDSTONE_LAMP);
    w.sim.placeCart(null, 0, 10, 0, false);
    w.run(3);
    expect(blockMeta(w.at(0, 10, 0)) & 16).toBeTruthy();
    expect(blockId(w.at(0, 10, 1))).toBe(B.REDSTONE_LAMP_LIT);
  });

  it('Keg Carts light on a powered Trigger Rail and blast', () => {
    const w = world();
    for (let x = 0; x < 6; x++) w.set(x, 10, 0, makeBlock(x === 3 ? B.ACTIVATOR_RAIL : B.RAIL, 1));
    w.set(3, 10, 1, B.REDSTONE_BLOCK);
    w.run(2);
    const c = w.sim.placeCart(null, 3, 10, 0, true)!;
    w.run(3);
    expect(c.fuse).toBeGreaterThan(70);
    w.run(85);
    expect(w.events.some((e) => e.e === 'boom')).toBe(true);
    expect(w.sim.entities.has(c.id)).toBe(false);
  });

  it('Keg Carts explode on a hard landing', () => {
    const w = world();
    const c = w.sim.placeCart(null, 0, 10, 0, true);
    expect(c).toBeNull();
    w.set(0, 30, 0, makeBlock(B.RAIL, 0));
    w.set(0, 29, 0, B.STONE);
    const k = w.sim.placeCart(null, 0, 30, 0, true)!;
    w.set(0, 30, 0, 0); w.set(0, 29, 0, 0);
    w.run(60);
    expect(w.events.some((e) => e.e === 'boom')).toBe(true);
    expect(w.sim.entities.has(k.id)).toBe(false);
  });
});

describe('weapons', () => {
  it('mace damage grows with fall height like Java', () => {
    expect(maceBonus(1)).toBe(0);
    expect(maceBonus(3)).toBe(12);
    expect(maceBonus(8)).toBe(22);
    expect(maceBonus(10)).toBe(24);
  });

  it('a falling mace hit deals big damage and cancels fall damage', () => {
    const w = world();
    const p = w.player(0.5, 10, 0.5);
    const mob = w.sim.spawnMob('woolhorn', 1.5, 10, 0.5)!;
    mob.health = 100; mob.maxHealth = 100;
    p.inv.slots[p.inv.selected] = { id: I.MACE, count: 1 };
    p.peakY = 18; p.y = 10.5; p.flags = 0; p.lastAttack = -1e9;
    w.sim.setNow(10000);
    w.sim.attack(p, mob.id);
    expect(100 - mob.health).toBeGreaterThan(20);
    expect(p.peakY).toBe(p.y);
  });

  it('crossbows load then fire', () => {
    const w = world();
    const p = w.player(0.5, 10, 0.5);
    p.inv.slots[p.inv.selected] = { id: I.CROSSBOW, count: 1 };
    p.inv.slots[5] = { id: I.ARROW, count: 4 };
    w.sim.setNow(10000);
    expect(w.sim.shootBow(p, -1, 0, 0)).toBe(true);
    expect(p.inv.slots[p.inv.selected]!.ld).toBe(1);
    expect(p.inv.slots[5]!.count).toBe(3);
    w.sim.setNow(10500);
    expect(w.sim.shootBow(p, 1, 0, 0)).toBe(true);
    expect([...w.sim.entities.values()].some((e) => e.kind === 'arrow')).toBe(true);
    expect(p.inv.slots[p.inv.selected]!.ld).toBeFalsy();
  });

  it('spears jab from range', () => {
    const w = world();
    const p = w.player(0.5, 10, 0.5);
    const mob = w.sim.spawnMob('woolhorn', 4, 10, 0.5)!;
    mob.health = 100; mob.maxHealth = 100;
    p.inv.slots[p.inv.selected] = { id: I.SPEAR + 2, count: 1 };
    Object.assign(p, { yaw: -Math.PI / 2, pitch: -0.25 });
    w.sim.setNow(10000);
    expect(w.sim.attack(p, mob.id)).toBe(true);
    expect(100 - mob.health).toBe(3);
  });
});

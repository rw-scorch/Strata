import { describe, it, expect } from 'vitest';
import { MF } from '../src/core/sim/WorldSim';
import { WorldSim, WorldStore, newPlayer } from '../src/core/sim/WorldSim';
import { ChunkData } from '../src/core/chunk';
import { B, CB, bid, blockMeta, makeBlock, SIGN_BASE, WALL_SIGN_BASE, HANGING_SIGN_BASE, WALL_HANGING_SIGN_BASE, SIGN_ATTACHED, CHAIN, DEEPSLATE_ORE_BASE, signAngle, selectionBox, logAxis, AXIS_X } from '../src/core/blocks';
import { I, getItem, dyeId } from '../src/core/items';
import { findRecipe, findSmelt } from '../src/core/crafting';
import { WorldGenerator } from '../src/core/worldgen/WorldGenerator';
import { cleanSign, signFacesFront, darkRGB, textRGB } from '../src/core/signs';
import { GEN_LEVEL } from '../src/core/worldgen/genLevel';

function world(opts: { mode?: 'survival' | 'creative' } = {}) {
  const chunks = new Map<string, ChunkData>();
  const get = (cx: number, cz: number) => { const k = `${cx},${cz}`; let c = chunks.get(k); if (!c) { c = new ChunkData(cx, cz, new Uint32Array(16 * 16 * 160)); chunks.set(k, c); } return c; };
  const store: WorldStore = { getBlock: (x, y, z) => get(x >> 4, z >> 4).get(x & 15, y, z & 15), setBlock: (x, y, z, v) => get(x >> 4, z >> 4).set(x & 15, y, z & 15, v), isLoaded: () => true, raw: (cx, cz) => get(cx, cz).blocks };
  for (let x = -40; x <= 40; x++) for (let z = -40; z <= 40; z++) store.setBlock(x, 9, z, B.STONE);
  const events: { e: string; [k: string]: unknown }[] = [];
  const sim = new WorldSim({ seed: 9, store, gen: new WorldGenerator(9), difficulty: 'peaceful', emit: (e) => events.push(e as never), validateMoves: false, authoritative: true, spawn: { x: 0, y: 10, z: 0 } });
  const add = (id: string, op = false) => { const p = newPlayer(id, id.toUpperCase(), opts.mode ?? 'survival', { x: 0.5, y: 10, z: 0.5 }); sim.addPlayer(p); p.x = 0.5; p.y = 10; p.z = 0.5; p.op = op; return p; };
  return { sim, store, events, add };
}

const hold = (p: { inv: { slots: ({ id: number; count: number } | null)[]; selected: number } }, id: number, count = 1) => { p.inv.slots[0] = { id, count }; p.inv.selected = 0; };
const ticks = (sim: { tick(): void }, n: number) => { for (let i = 0; i < n; i++) sim.tick(); };

describe('v52 ender pearls', () => {
  it('flies at 1.5 blocks a tick, falls and teleports the thrower', () => {
    const w = world();
    for (let x = -4; x <= 4; x++) for (let z = -90; z <= 0; z++) w.store.setBlock(x, 9, z, B.STONE);
    const p = w.add('a', true);
    p.flags |= MF.GROUND;
    hold(p, I.ENDER_PEARL, 4);
    expect(w.sim.shootBow(p, 1, 0, Math.PI / 4)).toBe(true);
    const pearl = [...w.sim.entities.values()].find((e) => e.type === 'pearl')!;
    expect(Math.hypot(pearl.vx, pearl.vy, pearl.vz)).toBeCloseTo(30, 0);
    expect(p.inv.slots[0]?.count).toBe(3);
    expect(w.sim.shootBow(p, 1, 0, Math.PI / 4)).toBe(false);
    let n = 0;
    while (w.sim.entities.has(pearl.id) && n < 400) { w.sim.tick(); n++; }
    expect(w.sim.entities.has(pearl.id)).toBe(false);
    const dist = Math.hypot(p.x - 0.5, p.z - 0.5);
    expect(dist).toBeGreaterThan(46);
    expect(dist).toBeLessThan(56);
    expect(n).toBeGreaterThan(55);
    expect(n).toBeLessThan(75);
  });
});

describe('v52 boats', () => {
  const lake = () => {
    const w = world({ mode: 'creative' });
    for (let x = -40; x <= 40; x++) for (let z = -40; z <= 40; z++) { w.store.setBlock(x, 9, z, B.WATER); w.store.setBlock(x, 8, z, B.STONE); }
    return w;
  };
  const ride = (w: ReturnType<typeof world>, y: number) => {
    const p = w.add('a', true);
    expect(w.sim.placeBoat(p, 0, y, 0, 0)).toBe(true);
    const boat = [...w.sim.entities.values()].find((e) => e.kind === 'boat')!;
    p.x = boat.x; p.y = boat.y; p.z = boat.z;
    expect(w.sim.useEntity(p, boat.id)).toBe(true);
    expect(p.riding).toBe(boat.id);
    return { p, boat };
  };

  it('rows at the Java water top speed of 8 blocks a second', () => {
    const w = lake();
    const { p, boat } = ride(w, 9);
    boat.yaw = 0;
    p.flags = MF.FORWARD;
    ticks(w.sim, 120);
    expect(Math.hypot(boat.vx, boat.vz)).toBeGreaterThan(7.2);
    expect(Math.hypot(boat.vx, boat.vz)).toBeLessThan(8.4);
    expect(boat.flags & 6).toBe(6);
  });

  it('glides much faster on packed ice and blue ice', () => {
    const top = (block: number) => {
      const w = world({ mode: 'creative' });
      for (let x = -40; x <= 40; x++) for (let z = -400; z <= 40; z++) w.store.setBlock(x, 9, z, block);
      const { p, boat } = ride(w, 10);
      boat.yaw = 0;
      p.flags = MF.FORWARD;
      let best = 0;
      for (let i = 0; i < 160; i++) { w.sim.tick(); best = Math.max(best, Math.hypot(boat.vx, boat.vz)); }
      return best;
    };
    expect(top(B.PACKED_ICE)).toBeGreaterThan(30);
    expect(top(B.STONE)).toBeLessThan(2.5);
  });

  it('carries two riders, and the passenger takes the oars when the driver leaves', () => {
    const w = lake();
    const { p, boat } = ride(w, 9);
    const q = w.add('b', true);
    q.x = boat.x; q.y = boat.y; q.z = boat.z;
    expect(w.sim.useEntity(q, boat.id)).toBe(true);
    expect(boat.rider2).toBe(q.id);
    w.sim.dismount(p);
    w.sim.tick();
    expect(boat.rider).toBe(q.id);
  });
});

describe('v52 deepslate', () => {
  it('fills the deep layers with deepslate and deepslate ores', () => {
    expect(GEN_LEVEL).toBe(17);
    const g = new WorldGenerator(1234);
    let deep = 0, stone = 0, ores = 0, high = 0;
    for (let cx = 0; cx < 3; cx++) for (let cz = 0; cz < 3; cz++) {
      const c = g.generate(cx, cz, GEN_LEVEL);
      for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) for (let y = 2; y <= 40; y++) {
        const id = bid(c.blocks[(y * 16 + z) * 16 + x] ?? 0);
        if (y <= 14) { if (id === CB.DEEPSLATE) deep++; if (id === B.STONE) stone++; if (id >= DEEPSLATE_ORE_BASE && id < DEEPSLATE_ORE_BASE + 7) ores++; }
        if (y >= 30 && id === CB.DEEPSLATE) high++;
      }
    }
    expect(deep).toBeGreaterThan(stone * 10);
    expect(ores).toBeGreaterThan(0);
    expect(high).toBe(0);
  });

  it('deepslate ores drop like their stone twins and smelt', () => {
    expect(getItem(DEEPSLATE_ORE_BASE + 1)?.name).toBe('Deepslate Iron Ore');
    expect(findSmelt(DEEPSLATE_ORE_BASE + 1)?.result).toBe(I.IRON_INGOT);
  });
});

describe('v52 signs', () => {
  it('places standing, wall, hanging and wall hanging signs', () => {
    const w = world();
    const p = w.add('a', true);
    p.yaw = 0;
    hold(p, I.SIGN_BASE + 2, 8);
    expect(w.sim.use(p, 3, 9, 0, 0, 1, 0)).toBe(true);
    const st = w.sim.get(3, 10, 0);
    expect(bid(st)).toBe(SIGN_BASE + 2);
    expect(signFacesFront(signAngle(st), 3.5, 0.5, p.x, p.z)).toBe(true);
    w.store.setBlock(5, 10, 0, B.STONE);
    expect(w.sim.use(p, 5, 10, 0, -1, 0, 0)).toBe(true);
    const wall = w.sim.get(4, 10, 0);
    expect(bid(wall)).toBe(WALL_SIGN_BASE + 2);
    expect(signFacesFront(signAngle(wall), 4.5, 0.5, p.x, p.z)).toBe(true);
    expect(w.sim.use(p, 3, 9, 0, 0, -1, 0)).toBe(false);

    hold(p, I.HANGING_SIGN_BASE, 8);
    w.store.setBlock(0, 13, 3, B.STONE);
    expect(w.sim.use(p, 0, 13, 3, 0, -1, 0)).toBe(true);
    const hang = w.sim.get(0, 12, 3);
    expect(bid(hang)).toBe(HANGING_SIGN_BASE);
    expect(blockMeta(hang) & SIGN_ATTACHED).toBe(0);
    expect(blockMeta(hang) % 4).toBe(0);
    w.store.setBlock(-3, 10, -3, B.STONE);
    expect(w.sim.use(p, -3, 10, -3, 0, 0, 1)).toBe(true);
    expect(bid(w.sim.get(-3, 10, -2))).toBe(WALL_HANGING_SIGN_BASE);
    expect(selectionBox(w.sim.get(-3, 10, -2))).not.toBeNull();
  });

  it('opens the editor for the placer and stores clean text on the facing side', () => {
    const w = world();
    const p = w.add('a', true);
    hold(p, I.SIGN_BASE, 4);
    w.events.length = 0;
    w.sim.use(p, 2, 9, 0, 0, 1, 0);
    const ed = w.events.find((e) => e.e === 'signEdit') as { b: boolean } | undefined;
    expect(ed?.b).toBe(false);
    expect(w.sim.editSign(p, 2, 10, 0, ['Hello', 'a\u0000b§c', 'x'.repeat(60), 'last', 'extra'])).toBe(true);
    const d = w.sim.signAt(2, 10, 0)!;
    expect(d.f.t).toEqual(['Hello', 'abc', 'x'.repeat(24), 'last']);
    expect(d.b.t).toEqual(['', '', '', '']);
    expect(w.sim.editSign(p, 2, 10, 0, ['again'])).toBe(false);
    expect(w.sim.signsIn(0, 0).length).toBe(1);
  });

  it('dyes and lights the text, and ink sac removes the glow', () => {
    const w = world();
    const p = w.add('a', true);
    hold(p, I.SIGN_BASE, 4);
    w.sim.use(p, 2, 9, 0, 0, 1, 0);
    w.sim.editSign(p, 2, 10, 0, ['Lit']);
    hold(p, dyeId('red'), 2);
    w.sim.use(p, 2, 10, 0, 0, 1, 0);
    expect(w.sim.signAt(2, 10, 0)!.f.c).toBe(14);
    expect(p.inv.slots[0]?.count).toBe(1);
    hold(p, I.GLOW_INK_SAC, 1);
    w.sim.use(p, 2, 10, 0, 0, 1, 0);
    expect(w.sim.signAt(2, 10, 0)!.f.g).toBe(true);
    hold(p, I.INK_SAC, 1);
    w.sim.use(p, 2, 10, 0, 0, 1, 0);
    expect(w.sim.signAt(2, 10, 0)!.f.g).toBe(false);
  });

  it('only players who may build can edit, and only from close by', () => {
    const w = world();
    const owner = w.add('a', true);
    hold(owner, I.SIGN_BASE, 4);
    w.sim.use(owner, 2, 9, 0, 0, 1, 0);
    w.sim.editSign(owner, 2, 10, 0, ['Keep']);
    w.sim.settings.guestsBuild = false;
    const guest = w.add('g', false);
    w.events.length = 0;
    w.sim.use(guest, 2, 10, 0, 0, 1, 0);
    expect(w.events.some((e) => e.e === 'signEdit')).toBe(false);
    expect(w.sim.editSign(guest, 2, 10, 0, ['Vandal'])).toBe(false);
    expect(w.sim.signAt(2, 10, 0)!.f.t[0]).toBe('Keep');
  });

  it('pops off and drops when its support goes, clearing the text', () => {
    const w = world();
    const p = w.add('a', true);
    hold(p, I.SIGN_BASE + 1, 4);
    w.store.setBlock(5, 10, 0, B.STONE);
    w.sim.use(p, 5, 10, 0, -1, 0, 0);
    w.sim.editSign(p, 4, 10, 0, ['Bye']);
    w.sim.setBlock(5, 10, 0, 0);
    expect(w.sim.get(4, 10, 0)).toBe(0);
    expect(w.sim.signAt(4, 10, 0)).toBeNull();
    expect([...w.sim.entities.values()].some((e) => e.kind === 'item' && e.item?.id === I.SIGN_BASE + 1)).toBe(true);
  });

  it('crafts signs, hanging signs and chains', () => {
    const g = (id: number) => ({ id, count: 1 });
    expect(findRecipe([g(B.OAK_PLANKS), g(B.OAK_PLANKS), g(B.OAK_PLANKS), g(B.OAK_PLANKS), g(B.OAK_PLANKS), g(B.OAK_PLANKS), null, g(I.STICK), null], 3)).toMatchObject({ result: I.SIGN_BASE, count: 3 });
    expect(findRecipe([g(I.IRON_NUGGET), null, null, g(I.IRON_INGOT), null, null, g(I.IRON_NUGGET), null, null], 3)?.result).toBe(I.CHAIN);
    expect(findRecipe([g(I.CHAIN), null, g(I.CHAIN), g(1162), g(1162), g(1162), g(1162), g(1162), g(1162)], 3)).toMatchObject({ result: I.HANGING_SIGN_BASE, count: 6 });
  });

  it('chains take the axis of the clicked face and hold hanging signs', () => {
    const w = world();
    const p = w.add('a', true);
    hold(p, I.CHAIN, 4);
    w.store.setBlock(5, 12, 0, B.STONE);
    w.sim.use(p, 5, 12, 0, -1, 0, 0);
    expect(bid(w.sim.get(4, 12, 0))).toBe(CHAIN);
    expect(logAxis(w.sim.get(4, 12, 0))).toBe(AXIS_X);
    w.store.setBlock(0, 14, 0, B.STONE);
    w.store.setBlock(0, 13, 0, makeBlock(CHAIN));
    hold(p, I.HANGING_SIGN_BASE, 4);
    expect(w.sim.use(p, 0, 13, 0, 0, -1, 0)).toBe(true);
    expect(blockMeta(w.sim.get(0, 12, 0)) & SIGN_ATTACHED).toBe(SIGN_ATTACHED);
  });

  it('sanitises synced sign data and uses Java text colours', () => {
    const d = cleanSign({ f: { t: ['a', 5, 'b'], c: 99, g: 'yes' }, b: null });
    expect(d.f).toEqual({ t: ['a', '', 'b', ''], c: 15, g: false });
    expect(textRGB(14)).toBe(0xff0000);
    expect(darkRGB(14, false)).toBe(0x660000);
    expect(darkRGB(15, true)).toBe(0xf0ebcc);
  });
});

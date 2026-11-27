import { describe, it, expect } from 'vitest';
import { WorldSim, WorldStore, newPlayer } from '../src/core/sim/WorldSim';
import { WorldGenerator } from '../src/core/worldgen/WorldGenerator';
import { ChunkData } from '../src/core/chunk';
import { B, SB, bid, makeBlock, sp, SPECIES, BLOCK_BY_KEY, strippedOf, logAxis, AXIS_X, AXIS_Z, STRIPPED_LOG_BASE, WOOD_BASE, STRIPPED_WOOD_BASE, LOG_VALUES } from '../src/core/blocks';
import { toolId } from '../src/core/items';
import { findRecipe } from '../src/core/crafting';
import { blockFromState } from '../src/core/litematic';

export function world(opts: { mode?: 'survival' | 'creative' } = {}) {
  const chunks = new Map<string, ChunkData>();
  const get = (cx: number, cz: number) => { const k = `${cx},${cz}`; let c = chunks.get(k); if (!c) { c = new ChunkData(cx, cz, new Uint32Array(16 * 16 * 160)); chunks.set(k, c); } return c; };
  const store: WorldStore = { getBlock: (x, y, z) => get(x >> 4, z >> 4).get(x & 15, y, z & 15), setBlock: (x, y, z, v) => get(x >> 4, z >> 4).set(x & 15, y, z & 15, v), isLoaded: () => true, raw: (cx, cz) => get(cx, cz).blocks };
  for (let x = -40; x <= 40; x++) for (let z = -40; z <= 40; z++) store.setBlock(x, 9, z, B.STONE);
  const events: { e: string; [k: string]: unknown }[] = [];
  const sim = new WorldSim({ seed: 9, store, gen: new WorldGenerator(9), difficulty: 'peaceful', emit: (e) => events.push(e as never), validateMoves: false, authoritative: true, spawn: { x: 0, y: 10, z: 0 } });
  const add = (id: string, op = false) => { const p = newPlayer(id, id.toUpperCase(), opts.mode ?? 'survival', { x: 0.5, y: 10, z: 0.5 }); sim.addPlayer(p); p.x = 0.5; p.y = 10; p.z = 0.5; p.op = op; return p; };
  return { sim, store, events, add };
}

describe('v49 stripped wood and log rotation', () => {
  it('strips every log and wood, keeping the axis', () => {
    LOG_VALUES.forEach((lv, i) => {
      expect(bid(strippedOf(lv)!)).toBe(STRIPPED_LOG_BASE + i);
      const sideways = lv | (AXIS_X << 8);
      expect(logAxis(strippedOf(sideways)!)).toBe(AXIS_X);
      expect(bid(strippedOf(makeBlock(WOOD_BASE + i, AXIS_Z))!)).toBe(STRIPPED_WOOD_BASE + i);
    });
    expect(strippedOf(makeBlock(B.STONE))).toBeNull();
    expect(BLOCK_BY_KEY.get('stripped_dark_oak_log')?.id).toBe(STRIPPED_LOG_BASE + 5);
    expect(BLOCK_BY_KEY.get('cherry_wood')?.id).toBe(WOOD_BASE + 6);
  });

  it('an axe strips a placed log', () => {
    const w = world();
    const p = w.add('a');
    w.store.setBlock(1, 10, 0, sp(14, SPECIES.ACACIA) | (AXIS_Z << 8));
    p.inv.slots[0] = { id: toolId(0, 1), count: 1 }; p.inv.selected = 0;
    expect(w.sim.use(p, 1, 10, 0, -1, 0, 0)).toBe(true);
    const v = w.sim.get(1, 10, 0);
    expect(bid(v)).toBe(STRIPPED_LOG_BASE + 4);
    expect(logAxis(v)).toBe(AXIS_Z);
    expect(p.inv.slots[0]?.dmg).toBe(1);
  });

  it('crafts wood and planks', () => {
    const g = (id: number) => ({ id, count: 1 });
    expect(findRecipe([g(SB.CHERRY_LOG), g(SB.CHERRY_LOG), g(SB.CHERRY_LOG), g(SB.CHERRY_LOG)], 2)?.result).toBe(WOOD_BASE + 6);
    expect(findRecipe([g(STRIPPED_LOG_BASE), null, null, null], 2)).toMatchObject({ result: B.OAK_PLANKS, count: 4 });
    expect(findRecipe([g(STRIPPED_WOOD_BASE + 7), null, null, null], 2)?.result).toBe(SB.MANGROVE_PLANKS);
  });

  it('litematica keeps stripped names and log axes', () => {
    expect(bid(blockFromState('minecraft:stripped_spruce_log', { axis: 'y' })!)).toBe(STRIPPED_LOG_BASE + 2);
    expect(logAxis(blockFromState('minecraft:oak_log', { axis: 'x' })!)).toBe(AXIS_X);
    expect(logAxis(blockFromState('minecraft:birch_wood', { axis: 'z' })!)).toBe(AXIS_Z);
  });
});

import { I } from '../src/core/items';
import { presetKit, KIT_PRESETS, sanitizeKits } from '../src/core/sim/kits';
import { parseBanSpan } from '../src/core/bans';
import { LocalPlayer as Player } from '../src/game/Player';
import { InputState } from '../src/controls/InputState';
import { CB } from '../src/core/blocks';

describe('v49 kits', () => {
  it('every preset resolves its items', () => {
    for (const key of Object.keys(KIT_PRESETS)) {
      const k = presetKit(key)!;
      const want = KIT_PRESETS[key].items.length;
      expect(k.items.filter(Boolean).length, key).toBe(Math.min(36, want));
      expect(k.armor.filter(Boolean).length, key).toBe(KIT_PRESETS[key].armor.filter(Boolean).length);
    }
    const c = presetKit('crystal')!;
    expect(c.off?.id).toBe(I.TOTEM);
    expect(c.items.filter((s) => s?.id === I.TOTEM).length).toBe(14);
    expect(presetKit('nodebuff')!.items.filter((s) => s?.id === I.SPLASH_HEALING).length).toBe(33);
  });

  it('saves, claims, cools down and drives the Crucible', () => {
    const w = world();
    const op = w.add('op', true), a = w.add('a');
    op.inv.slots[0] = { id: toolId(4, 3), count: 1, en: { sharpness: 3 } };
    op.inv.armor[1] = { id: I.ELYTRA, count: 1 };
    expect(w.sim.command(op, '/kit save duel')).toMatch(/Saved/);
    expect(w.sim.command(a, '/kit save x')).toMatch(/operators/);
    expect(w.sim.command(a, '/kit duel')).toMatch(/operators only/);
    expect(w.sim.command(a, '/kit list')).not.toMatch(/duel/);
    expect(w.sim.command(a, '/kit public duel on')).toMatch(/operators/);
    expect(w.sim.command(op, '/kit public duel on')).toMatch(/10 minute/);
    expect(w.sim.command(op, '/kit cooldown duel 60')).toMatch(/once every 60s/);
    expect(w.sim.command(a, '/kit duel')).toMatch(/Claimed/);
    expect(a.inv.slots[0]).toMatchObject({ id: toolId(4, 3), en: { sharpness: 3 } });
    expect(a.inv.armor[1]?.id).toBe(I.ELYTRA);
    expect(w.sim.command(a, '/kit duel')).toMatch(/again in 60s/);
    expect(w.sim.command(op, '/kit preset nethpot')).toMatch(/Nethpot/);
    expect(w.sim.command(a, '/kit nethpot')).toMatch(/operators only/);
    expect(w.sim.command(a, '/kit list')).toMatch(/duel/);
    expect(w.sim.command(a, '/kit list')).not.toMatch(/nethpot/);
    expect(w.sim.command(op, '/kit list')).toMatch(/duel.*nethpot/);
    expect(sanitizeKits({ legacy: { items: [], ops: false } }).legacy.pub).toBe(false);
    expect(sanitizeKits({ 'Bad Name!': {}, ok: { items: [{ id: 99999, count: 3 }], cd: -5 } })).toEqual({ ok: { items: Array(36).fill(null), armor: [null, null, null, null], off: null, cd: 0, ops: true, pub: false, by: undefined } });
    const b = w.add('b');
    a.inv = { ...a.inv, slots: a.inv.slots.map(() => null) } as typeof a.inv;
    a.inv.slots[5] = { id: I.EMERALD, count: 2 };
    expect(w.sim.command(op, '/crucible start kit=duel arena=here')).toMatch(/open/i);
    w.sim.command(a, '/crucible join'); w.sim.command(b, '/crucible join');
    w.sim.command(op, '/crucible go');
    expect(a.inv.slots[0]?.en).toEqual({ sharpness: 3 });
    expect(a.inv.slots[5]).toBeNull();
    w.sim.command(op, '/crucible stop');
    expect(a.inv.slots[5]).toEqual({ id: I.EMERALD, count: 2 });
    expect(w.sim.command(op, '/crucible start kit=nosuchkit')).toMatch(/no saved kit/);
  });
});

describe('v49 totem and splash healing', () => {
  it('a totem in the offhand cheats death once', () => {
    const w = world();
    const p = w.add('a');
    p.inv.off[0] = { id: I.TOTEM, count: 1 };
    w.sim.damage(p, 50, 'player', p.x, p.z, false, true, 'X');
    expect(p.dead).toBe(false);
    expect(p.health).toBe(1);
    expect(p.inv.off[0]).toBeNull();
    for (let i = 0; i < 20; i++) w.sim.tick();
    w.sim.damage(p, 50, 'player', p.x, p.z, false, true, 'X');
    expect(p.dead).toBe(true);
  });

  it('a thrown healing potion heals the thrower and friends', () => {
    const w = world();
    const p = w.add('a'), q = w.add('b');
    q.x = 1.5;
    p.health = 6; q.health = 10;
    p.inv.slots[0] = { id: I.SPLASH_HEALING, count: 1 }; p.inv.selected = 0;
    expect(w.sim.shootBow(p, 1, 0, -Math.PI / 2)).toBe(true);
    for (let i = 0; i < 40; i++) w.sim.tick();
    expect(p.health).toBeGreaterThan(11);
    expect(q.health).toBeGreaterThan(12);
    expect(p.inv.slots[0]).toBeNull();
  });
});

describe('v49 bans, rtp and movement', () => {
  it('parses ban lengths', () => {
    expect(parseBanSpan('perm')).toBeNull();
    expect(parseBanSpan('30m')).toBe(30 * 6e4);
    expect(parseBanSpan('2w')).toBe(14 * 864e5);
    expect(parseBanSpan('3mo')).toBe(90 * 864e5);
    expect(parseBanSpan('soon')).toBeUndefined();
  });

  it('random teleport lands on dry land within 2500 blocks', () => {
    const w = world();
    const p = w.add('a', true);
    w.sim.settings.tpDelay = 0;
    const r = w.sim.command(p, '/rtp');
    expect(r).toMatch(/Sent somewhere wild/);
    expect(Math.abs(p.x)).toBeLessThanOrEqual(2501);
    expect(Math.abs(p.z)).toBeLessThanOrEqual(2501);
    expect(Math.hypot(p.x, p.z)).toBeGreaterThan(150);
  });

  it('auto-jump no longer hops into fences but still climbs steps', () => {
    const F = makeBlock(BLOCK_BY_KEY.get('oak_fence')!.id, 0);
    const run = (put: (m: Map<string, number>) => void) => {
      const m = new Map<string, number>(); put(m);
      const reader = { getBlock: (x: number, y: number, z: number) => y <= 9 ? B.STONE : m.get(`${x},${y},${z}`) ?? 0, isLoaded: () => true };
      const pl = new Player(); pl.autoJump = true; pl.setPos(0.5, 10, 0.5); pl.yaw = -Math.PI / 2;
      const i = new InputState(); i.moveZ = 1;
      let jumps = 0, was = true;
      for (let f = 0; f < 240; f++) { pl.update(1 / 60, i, reader, 'survival', false); if (was && !pl.body.onGround && pl.body.vy > 0) jumps++; was = pl.body.onGround; }
      return jumps;
    };
    expect(run((m) => { for (let z = -5; z <= 5; z++) m.set(`3,10,${z}`, F); })).toBe(0);
    expect(run((m) => { for (let z = -5; z <= 5; z++) { m.set(`3,10,${z}`, B.STONE); m.set(`2,10,${z}`, makeBlock(CB.GLOW_LICHEN, 1)); } })).toBe(1);
  });

  it('vines are climbable', () => {
    const m = new Map<string, number>();
    for (let y = 10; y <= 16; y++) { m.set(`3,${y},0`, B.STONE); m.set(`2,${y},0`, makeBlock(CB.CAVE_VINES, 0)); }
    const reader = { getBlock: (x: number, y: number, z: number) => y <= 9 ? B.STONE : m.get(`${x},${y},${z}`) ?? 0, isLoaded: () => true };
    const pl = new Player(); pl.setPos(2.5, 10, 0.5); pl.yaw = -Math.PI / 2;
    const i = new InputState(); i.moveZ = 1;
    for (let f = 0; f < 120; f++) pl.update(1 / 60, i, reader, 'survival', false);
    expect(pl.body.y).toBeGreaterThan(11);
  });
});

import { MF } from '../src/core/sim/WorldSim';

describe('v49 boats', () => {
  it('places on water, floats, rows, turns, and breaks into an item', () => {
    const w = world();
    for (let x = -30; x <= 30; x++) for (let z = -30; z <= 30; z++) { w.store.setBlock(x, 9, z, B.STONE); w.store.setBlock(x, 10, z, B.WATER); }
    const p = w.add('a');
    p.inv.slots[0] = { id: I.BOAT_BASE + 6, count: 1 }; p.inv.selected = 0;
    expect(w.sim.use(p, 2, 10, 0, 0, 1, 0)).toBe(true);
    expect(p.inv.slots[0]).toBeNull();
    const boat = [...w.sim.entities.values()].find((e) => e.kind === 'boat')!;
    expect(boat.wood).toBe(6);
    for (let i = 0; i < 40; i++) w.sim.tick();
    expect(boat.y).toBeGreaterThan(10.4);
    expect(boat.y).toBeLessThan(11.2);
    expect(w.sim.useEntity(p, boat.id)).toBe(true);
    expect(p.riding).toBe(boat.id);
    boat.yaw = 0;
    p.flags = MF.RIDE | MF.FORWARD;
    const z0 = boat.z;
    for (let i = 0; i < 60; i++) w.sim.tick();
    const speed = (z0 - boat.z) / 3;
    expect(speed).toBeGreaterThan(4);
    expect(speed).toBeLessThan(8.5);
    expect(Math.abs(p.z - boat.z)).toBeLessThan(0.01);
    p.flags = MF.RIDE | MF.LEFT;
    for (let i = 0; i < 20; i++) w.sim.tick();
    expect(boat.yaw).toBeGreaterThan(1);
    w.sim.move(p, p.x, p.y, p.z, 0, 0, MF.RIDE | MF.CROUCH);
    expect(p.riding).toBeUndefined();
    for (let i = 0; i < 4; i++) { p.lastAttack = -1e9; w.sim.attack(p, boat.id); }
    expect(w.sim.entities.has(boat.id)).toBe(false);
    expect([...w.sim.entities.values()].some((e) => e.kind === 'item' && e.item?.id === I.BOAT_BASE + 6)).toBe(true);
  });

  it('flies across ice', () => {
    const w = world();
    for (let x = -60; x <= 60; x++) for (let z = -200; z <= 10; z++) w.store.setBlock(x, 9, z, B.ICE);
    const p = w.add('a');
    p.inv.slots[0] = { id: I.BOAT_BASE, count: 1 }; p.inv.selected = 0;
    w.sim.use(p, 0, 9, 0, 0, 1, 0);
    const boat = [...w.sim.entities.values()].find((e) => e.kind === 'boat')!;
    w.sim.useEntity(p, boat.id);
    boat.yaw = 0; p.flags = MF.RIDE | MF.FORWARD;
    const z0 = boat.z;
    for (let i = 0; i < 100; i++) w.sim.tick();
    expect((z0 - boat.z) / 5).toBeGreaterThan(15);
  });

  it('crafts from planks', () => {
    const g = (id: number) => ({ id, count: 1 });
    expect(findRecipe([g(SB.MANGROVE_PLANKS), null, g(SB.MANGROVE_PLANKS), g(SB.MANGROVE_PLANKS), g(SB.MANGROVE_PLANKS), g(SB.MANGROVE_PLANKS), null, null, null], 3)?.result).toBe(I.BOAT_BASE + 7);
  });
});

describe('v49 supplant paste', () => {
  const box = () => ({ name: 'Box', w: 2, h: 2, d: 1, blocks: new Uint32Array([B.COBBLESTONE, 0, 0, B.OAK_PLANKS]) }) as never;
  it('overwrites terrain and clears air cells for operators in creative', () => {
    const w = world({ mode: 'creative' });
    const p = w.add('op', true);
    w.store.setBlock(6, 10, 5, B.DIRT);
    w.store.setBlock(5, 11, 5, B.DIRT);
    expect(w.sim.placeBlueprint(p, box(), 5, 10, 5, true)).toMatch(/Preparing/);
    for (let i = 0; i < 5; i++) w.sim.tick();
    expect(bid(w.store.getBlock(5, 10, 5))).toBe(B.COBBLESTONE);
    expect(bid(w.store.getBlock(6, 10, 5))).toBe(0);
    expect(bid(w.store.getBlock(5, 11, 5))).toBe(0);
    expect(bid(w.store.getBlock(6, 11, 5))).toBe(B.OAK_PLANKS);
  });
  it('is refused for survival and plain paste still respects terrain', () => {
    const w = world();
    const p = w.add('op', true);
    expect(w.sim.placeBlueprint(p, box(), 5, 10, 5, true)).toMatch(/creative/);
    p.mode = 'creative';
    w.store.setBlock(6, 11, 5, B.DIRT);
    w.sim.placeBlueprint(p, box(), 5, 10, 5);
    w.sim.tick();
    expect(bid(w.store.getBlock(6, 11, 5))).toBe(B.DIRT);
  });
});

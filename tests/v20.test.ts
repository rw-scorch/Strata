import { describe, it, expect } from 'vitest';
import { WorldSim, WorldStore, newPlayer, MF } from '../src/core/sim/WorldSim';
import { WorldGenerator } from '../src/core/worldgen/WorldGenerator';
import { ChunkData } from '../src/core/chunk';
import { B, makeBlock } from '../src/core/blocks';
import { I, toolId, getItem, setPackNames, usePackNames, ITEMS } from '../src/core/items';
import { RECIPES } from '../src/core/crafting';
import { attackStats, maceBonus, arrowDamage, chargeDamage, SPEAR_STATS } from '../src/core/sim/combat';
import { readLangNames } from '../src/resources/ResourcePackImporter';

function world() {
  const gen = new WorldGenerator(5);
  const chunks = new Map<string, ChunkData>();
  const get = (cx: number, cz: number) => { const k = `${cx},${cz}`; let c = chunks.get(k); if (!c) { c = new ChunkData(cx, cz, new Uint16Array(16 * 16 * 256)); chunks.set(k, c); } return c; };
  const store: WorldStore = { getBlock: (x, y, z) => get(x >> 4, z >> 4).get(x & 15, y, z & 15), setBlock: (x, y, z, v) => get(x >> 4, z >> 4).set(x & 15, y, z & 15, v), isLoaded: () => true, raw: (cx, cz) => get(cx, cz).blocks };
  for (let x = -24; x <= 40; x++) for (let z = -24; z <= 24; z++) for (let y = 5; y <= 9; y++) store.setBlock(x, y, z, B.STONE);
  const sim = new WorldSim({ seed: 5, store, gen, difficulty: 'normal', emit: () => {}, validateMoves: false, authoritative: true, spawn: { x: 0, y: 10, z: 0 } });
  sim.settings.pvp = true;
  let t = 10000;
  const run = (n: number, each?: () => void) => { for (let i = 0; i < n; i++) { each?.(); sim.tick(); t += 50; } };
  sim.setNow(t);
  const player = (x: number, y: number, z: number, yaw = -Math.PI / 2) => {
    const p = newPlayer(`p${Math.random()}`, 'P', 'survival', { x, y, z }); p.op = true; sim.addPlayer(p);
    Object.assign(p, { x, y, z, yaw, pitch: 0, flags: MF.GROUND, peakY: y });
    return p;
  };
  const pig = (x: number, y = 10, z = 0.5) => { const m = sim.spawnMob('woolhorn', x, y, z); m.health = 1000; m.maxHealth = 1000; m.vx = 0; m.vy = 0; m.vz = 0; return m; };
  return { sim, run, player, pig, now: () => t, setNow: (v: number) => { t = v; sim.setNow(v); } };
}

describe('Java weapon stats', () => {
  it('swords, axes and tools match Java damage, speed and wear', () => {
    const s = (m: number, k: number) => attackStats({ id: toolId(m, k), count: 1 });
    expect([0, 1, 2, 3, 4].map((m) => s(m, 3).damage)).toEqual([4, 5, 6, 4, 7]);
    expect([0, 1, 2, 3, 4].map((m) => s(m, 1).damage)).toEqual([7, 9, 9, 7, 9]);
    expect([0, 1, 2, 3, 4].map((m) => s(m, 1).speed)).toEqual([0.8, 0.8, 0.9, 1.0, 1.0]);
    expect(s(2, 3).speed).toBe(1.6);
    expect(s(2, 3).wear).toBe(1);
    expect(s(2, 1).wear).toBe(2);
    expect(s(2, 4).wear).toBe(2);
  });

  it('mace: 6 damage, 0.6 speed, 500 durability, 1 wear', () => {
    const m = attackStats({ id: I.MACE, count: 1 });
    expect([m.damage, m.speed, m.wear]).toEqual([6, 0.6, 1]);
    expect(getItem(I.MACE)!.durability).toBe(500);
  });

  it('mace smash bands', () => {
    expect(maceBonus(1.5)).toBe(0);
    expect(maceBonus(2)).toBe(8);
    expect(maceBonus(3)).toBe(12);
    expect(maceBonus(5)).toBe(16);
    expect(maceBonus(8)).toBe(22);
    expect(maceBonus(10)).toBe(24);
  });

  it('spears: jab damage, cooldown and durability per tier', () => {
    const order = ['wooden', 'stone', 'iron', 'golden', 'aetherite', 'copper'];
    const dmg = [1, 2, 3, 1, 4, 2], dur = [59, 131, 250, 32, 1561, 190], secs = [0.65, 0.75, 0.95, 0.95, 1.05, 0.85];
    order.forEach((k, i) => {
      const st = attackStats({ id: I.SPEAR + i, count: 1 });
      expect(getItem(I.SPEAR + i)!.key).toBe(`${k}_spear`);
      expect(st.damage).toBe(dmg[i]);
      expect(1 / st.speed).toBeCloseTo(secs[i], 5);
      expect(getItem(I.SPEAR + i)!.durability).toBe(dur[i]);
    });
    expect(RECIPES.some((r) => r.result === I.SPEAR + 5)).toBe(true);
  });

  it('arrow damage matches Java (bow 6-10 full draw, crossbow 7-11)', () => {
    expect(arrowDamage(3, 2, false, () => 0)).toBe(6);
    expect(arrowDamage(3, 2, true, (n) => n - 1)).toBe(10);
    expect(arrowDamage(3.15, 2, true, () => 0)).toBe(7);
    expect(arrowDamage(3.15, 2, true, (n) => n - 1)).toBe(11);
  });

  it('charge damage follows the wiki table', () => {
    expect(Math.floor(chargeDamage(0.7, 14.57))).toBe(11);
    expect(Math.floor(chargeDamage(1.2, 33.5))).toBe(41);
    expect(Math.floor(chargeDamage(0.95, 5.612))).toBe(6);
  });
});

describe('mace in play', () => {
  it('smash bonus is added before the critical multiplier', () => {
    const w = world();
    const p = w.player(0.5, 10.5, 0.5);
    const mob = w.pig(2.5);
    p.inv.slots[p.inv.selected] = { id: I.MACE, count: 1 };
    w.run(40);
    Object.assign(p, { peakY: 15.5, y: 10.5, flags: 0 });
    w.sim.setNow(w.now());
    expect(w.sim.attack(p, mob.id)).toBe(true);
    expect(1000 - mob.health).toBeCloseTo((6 + 16) * 1.5, 5);
    expect(p.inv.slots[p.inv.selected]!.dmg).toBe(1);
  });

  it('smash throws nearby mobs back and up', () => {
    const w = world();
    const p = w.player(0.5, 10.5, 0.5);
    const mob = w.pig(2.5), near = w.pig(4, 10, 0.5);
    p.inv.slots[p.inv.selected] = { id: I.MACE, count: 1 };
    w.run(40);
    Object.assign(p, { peakY: 14.5, y: 10.5, flags: 0 });
    w.sim.setNow(w.now());
    w.sim.attack(p, mob.id);
    expect(near.vy).toBeCloseTo(14, 5);
    expect(near.vx).toBeGreaterThan(0);
  });

  it('a mace destroys a minecart at once without wearing down', () => {
    const w = world();
    w.sim.setBlock(2, 10, 0, makeBlock(B.RAIL, 1));
    const c = w.sim.placeCart(null, 2, 10, 0, false)!;
    const p = w.player(0.5, 10, 0.5);
    p.inv.slots[p.inv.selected] = { id: I.MACE, count: 1 };
    w.sim.attack(p, c.id);
    expect(w.sim.entities.has(c.id)).toBe(false);
    expect(p.inv.slots[p.inv.selected]!.dmg ?? 0).toBe(0);
  });
});

describe('attribute swapping', () => {
  it('swapping in the same tick keeps the old attributes and charge, but the mace effects and wear come from the new item', () => {
    const w = world();
    const p = w.player(0.5, 10.5, 0.5);
    const mob = w.pig(2.5);
    p.inv.slots[0] = { id: toolId(4, 3), count: 1 };
    p.inv.slots[1] = { id: I.MACE, count: 1 };
    p.inv.selected = 0;
    w.run(40);
    Object.assign(p, { peakY: 15.5, y: 10.5, flags: 0 });
    w.sim.setNow(w.now());
    w.sim.invOp(p, { t: 'select', i: 1 });
    w.sim.attack(p, mob.id);
    expect(1000 - mob.health).toBeCloseTo((7 + 16) * 1.5, 5);
    expect(p.inv.slots[1]!.dmg).toBe(1);
    expect(p.inv.slots[0]!.dmg ?? 0).toBe(0);
  });

  it('a normal swap (a tick passes) resets the charge and uses the new item', () => {
    const w = world();
    const p = w.player(0.5, 10.5, 0.5);
    const mob = w.pig(2.5);
    p.inv.slots[0] = { id: toolId(4, 3), count: 1 };
    p.inv.slots[1] = { id: I.MACE, count: 1 };
    p.inv.selected = 0;
    w.run(40);
    w.sim.invOp(p, { t: 'select', i: 1 });
    w.run(1);
    Object.assign(p, { peakY: 15.5, y: 10.5, flags: 0 });
    w.sim.setNow(w.now());
    w.sim.attack(p, mob.id);
    const dealt = 1000 - mob.health;
    expect(dealt).toBeGreaterThan(16);
    expect(dealt).toBeLessThan(18);
  });

  it('swapping the other way uses the mace attributes with the sword', () => {
    const w = world();
    const p = w.player(0.5, 10, 0.5);
    const mob = w.pig(2.5);
    p.inv.slots[0] = { id: I.MACE, count: 1 };
    p.inv.slots[1] = { id: toolId(4, 3), count: 1 };
    p.inv.selected = 0;
    w.run(40);
    w.sim.setNow(w.now());
    w.sim.invOp(p, { t: 'select', i: 1 });
    w.sim.attack(p, mob.id);
    expect(1000 - mob.health).toBeCloseTo(6, 5);
    expect(p.inv.slots[1]!.dmg).toBe(1);
  });
});

describe('spears in play', () => {
  it('jabs only reach from 2 to 4.5 blocks and need a full cooldown', () => {
    const w = world();
    const p = w.player(0.5, 10, 0.5);
    const close = w.pig(1.9), far = w.pig(5.6), mid = w.pig(4);
    p.inv.slots[p.inv.selected] = { id: I.SPEAR + 2, count: 1 };
    w.run(40);
    Object.assign(close, { x: 1.9, y: 10, z: 0.5 }); Object.assign(far, { x: 5.6, y: 10, z: 0.5 }); Object.assign(mid, { x: 4, y: 10, z: 0.5 });
    w.sim.setNow(w.now());
    expect(w.sim.attack(p, close.id)).toBe(false);
    expect(w.sim.attack(p, mid.id)).toBe(true);
    expect(1000 - mid.health).toBeCloseTo(3, 5);
    expect(1000 - far.health).toBe(0);
    w.sim.setNow(w.now() + 200);
    expect(w.sim.attack(p, mid.id)).toBe(false);
    expect(p.inv.slots[p.inv.selected]!.dmg).toBe(1);
  });

  it('one jab hits everything along the line', () => {
    const w = world();
    const p = w.player(0.5, 10, 0.5);
    const a = w.pig(3.2), b = w.pig(4.4);
    p.inv.slots[p.inv.selected] = { id: I.SPEAR + 4, count: 1 };
    w.run(40);
    Object.assign(a, { x: 3.2, y: 10, z: 0.5 }); Object.assign(b, { x: 4.4, y: 10, z: 0.5 });
    p.pitch = -0.21;
    w.sim.setNow(w.now());
    w.sim.attack(p, a.id);
    expect(1000 - a.health).toBeCloseTo(4, 5);
    expect(1000 - b.health).toBeCloseTo(4, 5);
  });

  it('charge attacks deal 1 + multiplier x closing speed after the start-up delay', () => {
    const w = world();
    const p = w.player(0.5, 10, 0.5);
    const mob = w.pig(4);
    p.inv.slots[p.inv.selected] = { id: I.SPEAR + 2, count: 1 };
    w.run(2);
    p.flags = MF.GROUND | MF.CHARGE;
    p.pitch = -0.25;
    p.vel = { x: 0, y: 0, z: 0 };
    const hold = () => { p.lastMove = w.now(); Object.assign(mob, { x: 4, y: 10, z: 0.5, vx: 0, vy: 0, vz: 0 }); };
    w.run(10, hold);
    expect(mob.health).toBe(1000);
    p.vel = { x: 6, y: 0, z: 0 };
    w.run(4, hold);
    expect(1000 - mob.health).toBeCloseTo(1 + 0.95 * 6 * Math.cos(0.25), 5);
  });

  it('charges below 4.6 blocks per second do nothing', () => {
    const w = world();
    const p = w.player(0.5, 10, 0.5);
    const mob = w.pig(4);
    p.inv.slots[p.inv.selected] = { id: I.SPEAR, count: 1 };
    p.flags = MF.GROUND | MF.CHARGE;
    p.vel = { x: 4.5, y: 0, z: 0 };
    w.run(30, () => { p.lastMove = w.now(); Object.assign(mob, { x: 4, y: 10, z: 0.5, vx: 0, vy: 0, vz: 0 }); });
    expect(mob.health).toBe(1000);
  });

  it('a fast engaged charge knocks a rider off', () => {
    const w = world();
    for (let x = 0; x < 10; x++) w.sim.setBlock(x, 10, 0, makeBlock(B.RAIL, 1));
    const cart = w.sim.placeCart(null, 4, 10, 0, false)!;
    const t = w.player(4.5, 10, 1.5);
    w.sim.useEntity(t, cart.id);
    expect(t.riding).toBe(cart.id);
    t.y = 10.35;
    const p = w.player(0.5, 9.8, 0.5);
    p.inv.slots[p.inv.selected] = { id: I.SPEAR + 4, count: 1 };
    p.flags = MF.GROUND | MF.CHARGE;
    p.vel = { x: 12, y: 0, z: 0 };
    w.run(14, () => { p.lastMove = w.now(); cart.vx = 0; Object.assign(p, { x: 0.5, y: 9.8, z: 0.5 }); });
    expect(t.riding).toBeUndefined();
    expect(t.health).toBeLessThan(20);
  });

  it('spear stats table is complete', () => {
    expect(SPEAR_STATS.length).toBe(6);
  });
});

describe('pack names', () => {
  it('reads names from a Java language file and can switch back', () => {
    const lang = { 'block.minecraft.tnt': 'TNT', 'item.minecraft.flint_and_steel': 'Flint and Steel', 'item.minecraft.crossbow': 'Crossbow', 'item.minecraft.redstone': 'Redstone Dust', 'item.minecraft.mace': '<b>Mace</b>' };
    const names = readLangNames(new TextEncoder().encode(JSON.stringify(lang)));
    expect(names.tnt).toBe('TNT');
    expect(names.firestriker).toBe('Flint and Steel');
    expect(names.crossbow).toBe('Crossbow');
    expect(names.redstone).toBe('Redstone Dust');
    expect(names.mace).toBe('bMace/b');
    setPackNames(new Map(Object.entries(names)));
    expect(getItem(B.TNT)!.name).toBe('TNT');
    expect(getItem(I.REDSTONE)!.name).toBe('Redstone Dust');
    usePackNames(false);
    expect(getItem(B.TNT)!.name).toBe('TNT');
    usePackNames(true);
    setPackNames(null);
    expect(getItem(I.REDSTONE)!.name).toBe('Emberdust');
    expect(ITEMS.filter(Boolean).length).toBeGreaterThan(100);
  });
});

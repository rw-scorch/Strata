import { describe, it, expect } from 'vitest';
import { WorldSim, WorldStore, newPlayer, MF, breakTime, xpLevel } from '../src/core/sim/WorldSim';
import { WorldGenerator } from '../src/core/worldgen/WorldGenerator';
import { ChunkData } from '../src/core/chunk';
import { B, makeBlock } from '../src/core/blocks';
import { I, toolId, armorId, maxDurability } from '../src/core/items';
import { equipmentOf, damageHeld, applyInvOp, emptyInv } from '../src/core/inventory';
import { JavaRandom, tableCost, tableOffers, selectEnchants, compatible, supports, anvilResult, ENCH, ENCHANTS, minCost, maxCost } from '../src/core/enchants';
import { enchantBonus, armorReduce } from '../src/core/sim/combat';

function world() {
  const gen = new WorldGenerator(5);
  const chunks = new Map<string, ChunkData>();
  const get = (cx: number, cz: number) => { const k = `${cx},${cz}`; let c = chunks.get(k); if (!c) { c = new ChunkData(cx, cz, new Uint16Array(16 * 16 * 256)); chunks.set(k, c); } return c; };
  const store: WorldStore = { getBlock: (x, y, z) => get(x >> 4, z >> 4).get(x & 15, y, z & 15), setBlock: (x, y, z, v) => get(x >> 4, z >> 4).set(x & 15, y, z & 15, v), isLoaded: () => true, raw: (cx, cz) => get(cx, cz).blocks };
  for (let x = -24; x <= 40; x++) for (let z = -24; z <= 24; z++) for (let y = 5; y <= 9; y++) store.setBlock(x, y, z, B.STONE);
  const events: { e: string; [k: string]: unknown }[] = [];
  const sim = new WorldSim({ seed: 5, store, gen, difficulty: 'normal', emit: (e) => events.push(e as never), validateMoves: false, authoritative: true, spawn: { x: 0, y: 10, z: 0 } });
  sim.settings.pvp = true;
  let t = 10000;
  sim.setNow(t);
  const run = (n: number) => { for (let i = 0; i < n; i++) { sim.tick(); t += 50; } };
  const player = (x: number, y: number, z: number, yaw = -Math.PI / 2) => {
    const p = newPlayer(`p${Math.random()}`, 'P', 'survival', { x, y, z }); p.op = true; sim.addPlayer(p);
    Object.assign(p, { x, y, z, yaw, pitch: 0, flags: MF.GROUND, peakY: y });
    return p;
  };
  const mob = (type: 'woolhorn' | 'hollowed' | 'duskweaver', x: number) => { const m = sim.spawnMob(type, x, 10, 0.5); m.health = 1000; m.maxHealth = 1000; return m; };
  return { sim, run, player, mob, events, now: () => t, store };
}

describe('Java random and enchanting table maths', () => {
  it('JavaRandom matches java.util.Random', () => {
    expect(new JavaRandom(42).nextInt()).toBe(-1170105035);
    expect(new JavaRandom(42).nextInt(10)).toBe(0);
    expect(new JavaRandom(0).nextInt(100)).toBe(60);
    expect(new JavaRandom(42).nextFloat()).toBeCloseTo(0.7275637, 6);
  });

  it('slot costs match the wiki ranges', () => {
    const seen: Record<string, Set<number>> = {};
    for (let n = 1; n < 6000; n++) for (const b of [0, 15]) {
      const r = new JavaRandom(Math.imul(n, 2654435761) ^ (n << 7));
      for (let j = 0; j < 3; j++) { const c = tableCost(r, j, b, toolId(4, 3)); (seen[`${b}-${j}`] ??= new Set()).add(c); }
    }
    const range = (k: string) => [Math.min(...seen[k]), Math.max(...seen[k])];
    expect(range('0-0')).toEqual([1, 2]);
    expect(range('0-1')).toEqual([1, 6]);
    expect(range('0-2')).toEqual([1, 8]);
    expect(range('15-0')).toEqual([2, 10]);
    expect(range('15-1')).toEqual([6, 21]);
    expect(range('15-2')).toEqual([30, 30]);
  });

  it('selected enchantments always fit the item and never conflict', () => {
    for (let n = 1; n < 400; n++) for (const id of [toolId(4, 3), toolId(2, 0), armorId(1, 1), armorId(3, 3), I.BOW, I.CROSSBOW, I.MACE, I.SPEAR + 2, I.BOOK]) {
      const list = selectEnchants(new JavaRandom(Math.imul(n, 2654435761)), id, 30);
      for (const [k, l] of list) {
        expect(supports(k, id)).toBe(true);
        expect(ENCH.get(k)!.treasure).toBeFalsy();
        expect(l).toBeGreaterThanOrEqual(1);
        expect(l).toBeLessThanOrEqual(ENCH.get(k)!.max);
      }
      for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) expect(compatible(list[a][0], list[b][0])).toBe(true);
    }
  });

  it('axes never get Sharpness from the table, swords and spears can', () => {
    let axe = 0, sword = 0, spear = 0;
    for (let seed = 1; seed < 2000; seed++) {
      if (selectEnchants(new JavaRandom(seed), toolId(4, 1), 25).some(([k]) => k === 'sharpness')) axe++;
      if (selectEnchants(new JavaRandom(seed), toolId(4, 3), 25).some(([k]) => k === 'sharpness')) sword++;
      if (selectEnchants(new JavaRandom(seed), I.SPEAR + 4, 25).some(([k]) => k === 'sharpness')) spear++;
    }
    expect(axe).toBe(0);
    expect(sword).toBeGreaterThan(100);
    expect(spear).toBeGreaterThan(100);
  });

  it('cost windows match the wiki table', () => {
    const e = (k: string) => ENCH.get(k)!;
    expect([minCost(e('sharpness'), 5), maxCost(e('sharpness'), 5)]).toEqual([45, 65]);
    expect([minCost(e('unbreaking'), 3), maxCost(e('unbreaking'), 3)]).toEqual([21, 71]);
    expect([minCost(e('breach'), 4), maxCost(e('breach'), 4)]).toEqual([42, 92]);
    expect([minCost(e('lunge'), 3), maxCost(e('lunge'), 3)]).toEqual([21, 41]);
    expect(ENCHANTS.length).toBe(34);
  });

  it('offers are hidden for enchanted items and shown for books', () => {
    expect(tableOffers(5, { id: toolId(4, 3), count: 1, en: { sharpness: 1 } }, 15).every((o) => o.cost === 0)).toBe(true);
    const o = tableOffers(5, { id: I.BOOK, count: 1 }, 15);
    expect(o[2].cost).toBe(30);
    expect(o[2].clue).not.toBeNull();
  });
});

describe('anvil', () => {
  const md = maxDurability;
  it('two Sharpness IV books make Sharpness V', () => {
    const r = anvilResult({ id: I.ENCHANTED_BOOK, count: 1, en: { sharpness: 4 } }, { id: I.ENCHANTED_BOOK, count: 1, en: { sharpness: 4 } }, null, md, false);
    expect(r.stack!.en).toEqual({ sharpness: 5 });
    expect(r.cost).toBe(5);
    expect(r.stack!.rc).toBe(1);
  });

  it('applies a book to a sword and blocks unsupported or conflicting ones', () => {
    const sword = { id: toolId(4, 3), count: 1, en: { smite: 3 } };
    expect(anvilResult(sword, { id: I.ENCHANTED_BOOK, count: 1, en: { sharpness: 5 } }, null, md, false).stack).toBeNull();
    const ok = anvilResult(sword, { id: I.ENCHANTED_BOOK, count: 1, en: { looting: 3 } }, null, md, false);
    expect(ok.stack!.en).toEqual({ smite: 3, looting: 3 });
    expect(ok.cost).toBe(6);
    expect(anvilResult({ id: I.BOW, count: 1 }, { id: I.ENCHANTED_BOOK, count: 1, en: { sharpness: 1 } }, null, md, false).stack).toBeNull();
  });

  it('repairs with material, renames for 1 level and gets too expensive', () => {
    const max = md(toolId(4, 3));
    const r = anvilResult({ id: toolId(4, 3), count: 1, dmg: max - 10 }, { id: I.AETHERITE, count: 2 }, null, md, false);
    expect(r.useMaterial).toBe(2);
    expect(r.stack!.dmg).toBe(max - 10 - 2 * Math.trunc(max / 4));
    const rn = anvilResult({ id: toolId(4, 3), count: 1 }, null, 'Excalibur', md, false);
    expect(rn.stack!.nm).toBe('Excalibur');
    expect(rn.cost).toBe(1);
    expect(rn.stack!.rc).toBeUndefined();
    const pricey = anvilResult({ id: toolId(4, 3), count: 1, rc: 31 }, { id: I.ENCHANTED_BOOK, count: 1, rc: 15, en: { sharpness: 5 } }, null, md, false);
    expect(pricey.tooExpensive).toBe(true);
  });
});

describe('enchanting in the world', () => {
  it('a full table offers level 30 and enchanting costs 3 levels and 3 lapis', () => {
    const w = world();
    w.sim.setBlock(0, 10, 0, B.ENCHANTING_TABLE);
    let n = 0;
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) if ((Math.abs(dx) === 2 || Math.abs(dz) === 2) && n < 16) { w.sim.setBlock(dx, 10, dz, B.BOOKSHELF); n++; }
    expect(w.sim.bookshelves(0, 10, 0)).toBe(16);
    const p = w.player(0.5, 10, 1.5);
    p.inv.slots[0] = { id: toolId(4, 3), count: 1 };
    p.inv.slots[1] = { id: I.LAPIS, count: 5 };
    w.sim.giveXp(p, 1395);
    expect(xpLevel(p.xp).level).toBe(30);
    w.sim.openScreen(p, 'enchant', 0, 10, 0);
    w.sim.invOp(p, { t: 'click', s: { c: 'inv', i: 0 }, b: 0 });
    w.sim.invOp(p, { t: 'click', s: { c: 'cont', i: 0 }, b: 0 });
    w.sim.invOp(p, { t: 'click', s: { c: 'inv', i: 1 }, b: 0 });
    w.sim.invOp(p, { t: 'click', s: { c: 'cont', i: 1 }, b: 0 });
    const offers = w.sim.enchantOffers(p);
    expect(offers[2].cost).toBe(30);
    expect(w.sim.enchant(p, 2)).toBe(true);
    const slots = w.sim.workSlots(p);
    expect(Object.keys(slots[0]!.en!).length).toBeGreaterThan(0);
    expect(slots[1]!.count).toBe(2);
    expect(xpLevel(p.xp).level).toBe(27);
    expect(w.sim.enchant(p, 2)).toBe(false);
    w.sim.closeScreen(p);
    expect(p.inv.slots.some((s) => s?.id === toolId(4, 3) && s.en)).toBe(true);
  });

  it('blocked bookshelves do not count', () => {
    const w = world();
    w.sim.setBlock(0, 10, 0, B.ENCHANTING_TABLE);
    w.sim.setBlock(2, 10, 0, B.BOOKSHELF);
    expect(w.sim.bookshelves(0, 10, 0)).toBe(1);
    w.sim.setBlock(1, 10, 0, B.STONE);
    expect(w.sim.bookshelves(0, 10, 0)).toBe(0);
  });

  it('the anvil screen combines a book onto armour', () => {
    const w = world();
    w.sim.setBlock(0, 10, 0, B.ANVIL);
    const p = w.player(0.5, 10, 1.5);
    w.sim.giveXp(p, 200);
    w.sim.openScreen(p, 'anvil', 0, 10, 0);
    const ws = w.sim.workSlots(p);
    ws[0] = { id: armorId(3, 3), count: 1 };
    ws[1] = { id: I.ENCHANTED_BOOK, count: 1, en: { feather_falling: 4 } };
    expect(w.sim.anvil(p, null)).toBe(true);
    expect(p.inv.cursor!.en).toEqual({ feather_falling: 4 });
    expect(ws[0]).toBeNull();
    expect(ws[1]).toBeNull();
  });
});

describe('enchantment effects', () => {
  it('damage bonuses follow Java', () => {
    expect(enchantBonus({ id: toolId(4, 3), count: 1, en: { sharpness: 5 } }, null)).toBe(3);
    expect(enchantBonus({ id: toolId(4, 3), count: 1, en: { smite: 5 } }, 'hollowed')).toBe(12.5);
    expect(enchantBonus({ id: toolId(4, 3), count: 1, en: { smite: 5 } }, 'woolhorn')).toBe(0);
    expect(enchantBonus({ id: toolId(4, 3), count: 1, en: { bane_of_arthropods: 2 } }, 'duskweaver')).toBe(5);
  });

  it('Breach matches the wiki against netherite-like armour', () => {
    const inv = emptyInv();
    inv.armor = [{ id: armorId(3, 0), count: 1 }, { id: armorId(3, 1), count: 1 }, { id: armorId(3, 2), count: 1 }, { id: armorId(3, 3), count: 1 }];
    expect(armorReduce(inv, 6, 8)).toBeCloseTo(6 * (1 - (20 - 6 / 4) / 25), 5);
    expect(armorReduce(inv, 6, 8, 4)).toBeCloseTo(6 * (1 - ((20 - 6 / 4) / 25 - 0.6)), 5);
  });

  it('Sharpness adds to a real hit, Fire Aspect sets fire, Knockback pushes harder', () => {
    const w = world();
    const p = w.player(0.5, 10, 0.5);
    const m = w.mob('woolhorn', 2.5);
    p.inv.slots[p.inv.selected] = { id: toolId(4, 3), count: 1, en: { sharpness: 5, fire_aspect: 2 } };
    w.run(40);
    Object.assign(m, { x: 2.5, y: 10, z: 0.5, vx: 0, vz: 0 });
    w.sim.setNow(w.now());
    w.sim.attack(p, m.id);
    expect(1000 - m.health).toBeCloseTo(7 + 3, 5);
    expect(m.fire).toBe(160);
  });

  it('Protection, Feather Falling and Projectile Protection reduce damage', () => {
    const w = world();
    const a = w.player(0.5, 10, 0.5), b = w.player(5.5, 10, 0.5);
    b.inv.armor[3] = { id: armorId(0, 3), count: 1, en: { feather_falling: 4, protection: 4 } };
    a.inv.armor[3] = { id: armorId(0, 3), count: 1 };
    w.sim.damage(a, 10, 'fall', a.x, a.z, false);
    w.sim.damage(b, 10, 'fall', b.x, b.z, false);
    const lostA = 20 - a.health, lostB = 20 - b.health;
    expect(lostB).toBeCloseTo(lostA * (1 - 16 / 25), 1);
  });

  it('Efficiency and Aqua Affinity speed up mining', () => {
    const pick = { id: toolId(2, 0), count: 1 };
    const fast = { id: toolId(2, 0), count: 1, en: { efficiency: 5 } };
    expect(breakTime(B.STONE, fast, false)).toBeLessThan(breakTime(B.STONE, pick, false) / 3);
    expect(breakTime(B.STONE, pick, true, true)).toBeCloseTo(breakTime(B.STONE, pick, false), 5);
    expect(breakTime(B.STONE, pick, true)).toBeCloseTo(breakTime(B.STONE, pick, false) * 5, 5);
  });

  it('Silk Touch drops the block, Fortune drops more coal', () => {
    const w = world();
    expect(w.sim.blockDrops(B.STONE, { id: toolId(2, 0), count: 1, en: { silk_touch: 1 } }, false)).toEqual([{ id: B.STONE, count: 1 }]);
    expect(w.sim.blockDrops(B.LAPIS_ORE, { id: toolId(2, 0), count: 1, en: { silk_touch: 1 } }, false)).toEqual([{ id: B.LAPIS_ORE, count: 1 }]);
    let plain = 0, lucky = 0;
    for (let i = 0; i < 400; i++) {
      plain += w.sim.blockDrops(B.COAL_ORE, { id: toolId(2, 0), count: 1 }, false).reduce((n, s) => n + s.count, 0);
      lucky += w.sim.blockDrops(B.COAL_ORE, { id: toolId(2, 0), count: 1, en: { fortune: 3 } }, false).reduce((n, s) => n + s.count, 0);
    }
    expect(lucky / plain).toBeGreaterThan(1.9);
    expect(lucky / plain).toBeLessThan(2.6);
  });

  it('Unbreaking III makes a tool last about four times longer', () => {
    const inv = emptyInv();
    let used = 0;
    inv.slots[0] = { id: toolId(4, 0), count: 1, en: { unbreaking: 3 } };
    for (let i = 0; i < 4000; i++) { damageHeld(inv, 1); used = inv.slots[0]?.dmg ?? used; }
    expect(used).toBeGreaterThan(800);
    expect(used).toBeLessThan(1200);
  });

  it('Mending repairs with experience', () => {
    const w = world();
    const p = w.player(0.5, 10, 0.5);
    p.inv.slots[p.inv.selected] = { id: toolId(4, 3), count: 1, dmg: 50, en: { mending: 1 } };
    w.sim.giveXp(p, 10);
    expect(p.inv.slots[p.inv.selected]!.dmg).toBe(30);
    expect(p.xp).toBe(0);
  });

  it('Curse of Binding locks armour, Curse of Vanishing destroys on death', () => {
    const w = world();
    const p = w.player(0.5, 10, 0.5);
    p.inv.armor[0] = { id: armorId(1, 0), count: 1, en: { binding_curse: 1 } };
    expect(applyInvOp(w.sim.invCtx(p), { t: 'click', s: { c: 'armor', i: 0 }, b: 0 })).toBe(false);
    p.inv.slots[3] = { id: toolId(4, 3), count: 1, en: { vanishing_curse: 1 } };
    p.inv.slots[4] = { id: I.STICK, count: 1 };
    w.sim.damage(p, 100, 'kill', p.x, p.z, false, true);
    const dropped = [...w.sim.entities.values()].filter((e) => e.kind === 'item').map((e) => e.item!.id);
    expect(dropped).toContain(I.STICK);
    expect(dropped).not.toContain(toolId(4, 3));
  });

  it('Infinity keeps the arrow, Power raises damage, Multishot fires three, Piercing passes through', () => {
    const w = world();
    const p = w.player(0.5, 10, 0.5);
    p.inv.slots[p.inv.selected] = { id: I.BOW, count: 1, en: { infinity: 1, power: 5 } };
    p.inv.slots[5] = { id: I.ARROW, count: 1 };
    w.sim.setNow(w.now());
    w.sim.shootBow(p, 1, -Math.PI / 2, 0);
    expect(p.inv.slots[5]!.count).toBe(1);
    const arrow = [...w.sim.entities.values()].find((e) => e.kind === 'arrow')!;
    expect(arrow.base).toBe(5);
    expect(arrow.pickup).toBe(false);
    p.inv.slots[p.inv.selected] = { id: I.CROSSBOW, count: 1, ld: 1, en: { multishot: 1 } };
    w.sim.setNow(w.now() + 1000);
    w.sim.shootBow(p, 1, -Math.PI / 2, 0);
    expect([...w.sim.entities.values()].filter((e) => e.kind === 'arrow').length).toBe(4);
    expect(p.inv.slots[p.inv.selected]!.dmg).toBe(3);
  });

  it('Piercing arrows hit two mobs in a row', () => {
    const w = world();
    const p = w.player(0.5, 9, 0.5);
    const a = w.mob('woolhorn', 4.5), b = w.mob('woolhorn', 7.5);
    p.inv.slots[p.inv.selected] = { id: I.CROSSBOW, count: 1, ld: 1, en: { piercing: 1 } };
    w.sim.setNow(w.now());
    w.sim.shootBow(p, 1, -Math.PI / 2, 0);
    for (let i = 0; i < 10; i++) { Object.assign(a, { x: 4.5, y: 10, z: 0.5 }); Object.assign(b, { x: 7.5, y: 10, z: 0.5 }); w.run(1); }
    expect(a.health).toBeLessThan(1000);
    expect(b.health).toBeLessThan(1000);
  });

  it('Density adds smash damage, Wind Burst launches, Lunge pushes forward', () => {
    const w = world();
    const p = w.player(0.5, 10.5, 0.5);
    const m = w.mob('woolhorn', 2.5);
    p.inv.slots[p.inv.selected] = { id: I.MACE, count: 1, en: { density: 5, wind_burst: 1 } };
    w.run(40);
    Object.assign(m, { x: 2.5, y: 10, z: 0.5 });
    Object.assign(p, { peakY: 15.5, y: 10.5, flags: 0 });
    w.sim.setNow(w.now());
    w.events.length = 0;
    w.sim.attack(p, m.id);
    expect(1000 - m.health).toBeCloseTo((6 + 16 + 2.5 * 5) * 1.5, 5);
    expect(w.events.some((e) => e.e === 'knock' && e.y === 1.2 && e.set)).toBe(true);
    const q = w.player(0.5, 10, 5.5);
    q.inv.slots[q.inv.selected] = { id: I.SPEAR + 2, count: 1, en: { lunge: 2 } };
    w.events.length = 0;
    w.sim.setNow(w.now() + 5000);
    w.sim.swing(q);
    const k = w.events.find((e) => e.e === 'knock') as { x: number } | undefined;
    expect(k?.x).toBeCloseTo(0.916, 3);
  });

  it('Thorns hurts the attacker', () => {
    const w = world();
    const a = w.player(0.5, 10, 0.5), b = w.player(2.5, 10, 0.5);
    b.inv.armor[1] = { id: armorId(3, 1), count: 1, en: { thorns: 10 } };
    w.run(40);
    w.sim.setNow(w.now());
    w.sim.attackPlayer(a, b.id);
    expect(a.health).toBeLessThan(20);
  });
});

describe('equipment for other players', () => {
  it('lists held, offhand and armour with glint bits', () => {
    const inv = emptyInv();
    inv.slots[0] = { id: toolId(4, 3), count: 1, en: { sharpness: 1 } };
    inv.off = [{ id: I.CROSSBOW, count: 1, ld: 1 }];
    inv.armor = [{ id: armorId(1, 0), count: 1 }, null, null, { id: armorId(3, 3), count: 1, en: { feather_falling: 1 } }];
    expect(equipmentOf(inv)).toEqual([toolId(4, 3), I.CROSSBOW_LOADED, armorId(1, 0), 0, 0, armorId(3, 3), 1 | (1 << 5)]);
  });
});

import { describe, it, expect } from 'vitest';
import { attackStats, armorReduce, armorToughness, knockResist, difficultyDamage } from '../src/core/sim/combat';
import { toolId, armorId } from '../src/core/items';
import { world } from './v40.test';

const suit = (m: number) => [0, 1, 2, 3].map((s) => ({ id: armorId(m, s), count: 1 }));
const inv = (m: number) => ({ armor: suit(m) }) as never;

describe('v42 Java combat values', () => {
  it('weapon tables match Java, netherite included', () => {
    expect(attackStats({ id: toolId(4, 3), count: 1 }).damage).toBe(7);
    expect(attackStats({ id: toolId(5, 3), count: 1 }).damage).toBe(8);
    expect(attackStats({ id: toolId(5, 1), count: 1 }).damage).toBe(10);
    expect(attackStats({ id: toolId(5, 1), count: 1 }).speed).toBe(1);
    expect(attackStats({ id: toolId(5, 0), count: 1 }).damage).toBe(6);
    expect(attackStats({ id: toolId(0, 1), count: 1 }).speed).toBeCloseTo(0.8);
  });

  it('armour and toughness follow the Java formula', () => {
    expect(armorToughness(inv(3))).toBe(8);
    expect(armorToughness(inv(4))).toBe(12);
    expect(armorReduce(inv(3), 10, 8)).toBeCloseTo(3);
    expect(armorReduce(inv(4), 10, 12)).toBeCloseTo(2.8);
    expect(armorReduce(inv(1), 10, 0)).toBeCloseTo(10 * (1 - 10 / 25));
  });

  it('breach subtracts 15% armour effectiveness per level, floored at zero', () => {
    expect(armorReduce(inv(3), 10, 8, 4)).toBeCloseTo(10 * (1 - 0.1));
    expect(armorReduce(inv(1), 10, 0, 4)).toBe(10);
  });

  it('netherite gives knockback resistance', () => {
    expect(knockResist(inv(4))).toBeCloseTo(0.4);
    expect(knockResist(inv(3))).toBe(0);
  });

  it('difficulty scaling matches Java', () => {
    expect(difficultyDamage(3, 'easy')).toBe(2.5);
    expect(difficultyDamage(8, 'easy')).toBe(5);
    expect(difficultyDamage(1, 'easy')).toBe(1);
    expect(difficultyDamage(3, 'normal')).toBe(3);
    expect(difficultyDamage(3, 'hard')).toBe(4.5);
    expect(difficultyDamage(3, 'peaceful')).toBe(0);
  });

  it('a piglin brute hits an unarmoured player for 13 on normal', () => {
    const w = world({ difficulty: 'normal' });
    w.p.mode = 'survival';
    w.sim.damage(w.p, difficultyDamage(13, 'normal'), 'piglin_brute', 0, 0);
    expect(w.p.health).toBe(7);
  });

  it('fire protection covers blaze fireballs', () => {
    const w = world({ difficulty: 'normal' });
    w.p.mode = 'survival';
    w.p.inv.armor[0] = { id: armorId(3, 0), count: 1, en: { fire_protection: 4 } } as never;
    const h = w.p.health;
    w.sim.damage(w.p, 5, 'small_fireball', 0, 0);
    expect(h - w.p.health).toBeCloseTo(5 * (1 - 1 / 25) * (1 - 8 / 25), 1);
  });
});

import { I } from '../src/core/items';
import { B } from '../src/core/blocks';
import { posKey, CARGO_X } from '../src/core/sim/WorldSim';

const ents = (sim: ReturnType<typeof world>['sim'], kind: string) => [...sim.entities.values()].filter((e) => e.kind === kind);

describe('v42 item frames', () => {
  const setup = () => {
    const w = world();
    w.p.mode = 'survival';
    w.store.setBlock(2, 10, -12, B.STONE);
    w.p.inv.slots[w.p.inv.selected] = { id: I.ITEM_FRAME, count: 2 };
    expect(w.sim.use(w.p, 2, 10, -12, -1, 0, 0)).toBe(true);
    return w;
  };

  it('hangs on a wall face, takes an item, turns it, and pops it out', () => {
    const w = setup();
    const f = ents(w.sim, 'frame')[0];
    expect(f).toBeDefined();
    expect(f.face).toBe(1);
    expect(f.x).toBeCloseTo(2 - 1 / 32);
    expect(w.p.inv.slots[w.p.inv.selected]!.count).toBe(1);
    expect(w.sim.use(w.p, 2, 10, -12, -1, 0, 0)).toBe(true);
    expect(ents(w.sim, 'frame')).toHaveLength(1);
    w.p.inv.slots[w.p.inv.selected] = { id: I.DIAMOND, count: 3 } as never;
    w.p.inv.slots[w.p.inv.selected] = { id: I.AETHERITE, count: 3 };
    expect(w.sim.useEntity(w.p, f.id)).toBe(true);
    expect(f.item?.id).toBe(I.AETHERITE);
    expect(w.p.inv.slots[w.p.inv.selected]!.count).toBe(2);
    w.sim.useEntity(w.p, f.id); w.sim.useEntity(w.p, f.id);
    expect(f.rot).toBe(2);
    expect((f.flags >> 3) & 7).toBe(2);
    w.sim.setNow(w.sim.now + 1000);
    expect(w.sim.attack(w.p, f.id)).toBe(true);
    expect(f.item).toBeUndefined();
    expect(ents(w.sim, 'item').some((e) => e.item!.id === I.AETHERITE)).toBe(true);
    w.sim.setNow(w.sim.now + 1000);
    w.sim.attack(w.p, f.id);
    expect(ents(w.sim, 'frame')).toHaveLength(0);
    expect(ents(w.sim, 'item').some((e) => e.item!.id === I.ITEM_FRAME)).toBe(true);
  });

  it('drops when its wall is removed', () => {
    const w = setup();
    w.store.setBlock(2, 10, -12, 0);
    w.p.x = 0.5; w.p.z = 5.5;
    w.run(25);
    expect(ents(w.sim, 'frame')).toHaveLength(0);
    expect(ents(w.sim, 'item').some((e) => e.item!.id === I.ITEM_FRAME)).toBe(true);
  });

  it('survives a save and reload with its item and turn', () => {
    const w = setup();
    const f = ents(w.sim, 'frame')[0];
    f.item = { id: I.ELYTRA, count: 1 }; f.rot = 5;
    const saved = JSON.parse(JSON.stringify(w.sim.fixtures()));
    const w2 = world();
    w2.store.setBlock(2, 10, -12, B.STONE);
    w2.sim.loadFixtures(saved);
    const g = ents(w2.sim, 'frame')[0];
    expect(g.item?.id).toBe(I.ELYTRA);
    expect(g.rot).toBe(5);
    expect(g.sup).toEqual([2, 10, -12]);
  });
});

describe('v42 hopper and chest minecarts', () => {
  const rail = () => {
    const w = world();
    w.p.mode = 'survival';
    for (let x = 0; x <= 6; x++) w.store.setBlock(x, 10, -12, B.RAIL);
    return w;
  };

  it('places from the item, opens a cargo screen and drops itself with its contents', () => {
    const w = rail();
    w.p.inv.slots[w.p.inv.selected] = { id: I.CHEST_MINECART, count: 1 };
    expect(w.sim.use(w.p, 1, 10, -12, 0, 1, 0)).toBe(true);
    const c = ents(w.sim, 'cart')[0];
    expect(c.type).toBe('chestcart');
    expect(w.sim.useEntity(w.p, c.id)).toBe(true);
    expect(w.p.screen).toMatchObject({ type: 'chest', x: CARGO_X + c.id, y: -64 });
    expect(w.sim.cargo(c)).toHaveLength(27);
    w.sim.cargo(c)![0] = { id: I.IRON_INGOT, count: 9 };
    w.sim.closeScreen(w.p);
    expect(w.sim.blockEntities.has(posKey(CARGO_X + c.id, -64, 0))).toBe(true);
    w.sim.setNow(w.sim.now + 1000);
    w.sim.hitCart(w.p, c, 100);
    const drops = ents(w.sim, 'item').map((e) => e.item!.id);
    expect(drops).toContain(I.CHEST_MINECART);
    expect(drops).toContain(I.IRON_INGOT);
    expect(w.sim.blockEntities.has(posKey(CARGO_X + c.id, -64, 0))).toBe(false);
  });

  it('a hopper minecart draws from a chest above and gathers loose items', () => {
    const w = rail();
    const c = w.sim.placeCart(null, 3, 10, -12, 'hoppercart')!;
    w.store.setBlock(3, 11, -12, B.CHEST);
    w.sim.addGeneratedChest(3, 11, -12, [{ id: I.COAL, count: 3 }, ...new Array(26).fill(null)]);
    w.sim.spawnItem(3.5, 10.3, -11.5, { id: I.STICK, count: 4 }, 0, 0, 0, 0);
    w.run(10);
    const items = w.sim.cargo(c)!;
    const count = (id: number) => items.reduce((n, s) => n + (s?.id === id ? s.count : 0), 0);
    expect(count(I.COAL)).toBe(3);
    expect(count(I.STICK)).toBe(4);
  });

  it('a powered activator rail switches a hopper minecart off', () => {
    const w = rail();
    const c = w.sim.placeCart(null, 3, 10, -12, 'hoppercart')!;
    c.off = true;
    w.sim.spawnItem(3.5, 10.3, -11.5, { id: I.STICK, count: 4 }, 0, 0, 0, 0);
    w.run(5);
    expect(w.sim.cargo(c)!.every((s) => !s)).toBe(true);
  });

  it('a hopper under the track empties a cart above it', () => {
    const w = rail();
    w.sim.setBlock(3, 9, -12, B.HOPPER);
    const c = w.sim.placeCart(null, 3, 10, -12, 'chestcart')!;
    w.sim.cargo(c)![4] = { id: I.COAL, count: 2 };
    w.run(40);
    const be = w.sim.blockEntities.get(posKey(3, 9, -12))!;
    expect(be.items.reduce((n, s) => n + (s?.id === I.COAL ? s.count : 0), 0)).toBe(2);
  });

  it('carts and their cargo persist through fixtures', () => {
    const w = rail();
    const c = w.sim.placeCart(null, 2, 10, -12, 'hoppercart')!;
    w.sim.cargo(c)![1] = { id: I.COAL, count: 5 };
    const saved = JSON.parse(JSON.stringify(w.sim.fixtures()));
    const w2 = rail();
    w2.sim.loadFixtures(saved);
    const d = ents(w2.sim, 'cart')[0];
    expect(d.type).toBe('hoppercart');
    expect(w2.sim.cargo(d)![1]).toEqual({ id: I.COAL, count: 5 });
  });
});

import { newPlayer } from '../src/core/sim/WorldSim';
import { ENCH } from '../src/core/enchants';

describe('v42 teleport warm-up and combat timer', () => {
  const two = () => {
    const w = world({ difficulty: 'normal' });
    w.p.mode = 'survival';
    w.sim.settings.pvp = true;
    const q = newPlayer('b', 'B', 'survival', { x: 2.5, y: 10, z: -12.5 });
    w.sim.addPlayer(q); q.x = 2.5; q.y = 10; q.z = -12.5;
    return { ...w, q };
  };

  it('teleports after three seconds when standing still', () => {
    const w = two();
    w.p.homes = { home: { x: 10.5, y: 10, z: 10.5 } };
    expect(w.sim.command(w.p, '/home')).toMatch(/Teleporting in 3 seconds/);
    w.run(50);
    expect(w.p.x).toBeCloseTo(0.5);
    w.run(15);
    expect(w.p.x).toBeCloseTo(10.5);
  });

  it('moving or taking damage cancels the warm-up', () => {
    const w = two();
    w.p.homes = { home: { x: 10.5, y: 10, z: 10.5 } };
    w.sim.command(w.p, '/home');
    w.p.x += 2;
    w.run(70);
    expect(w.p.x).toBeCloseTo(2.5);
    w.p.x = 0.5;
    w.sim.command(w.p, '/home');
    w.sim.damage(w.p, 2, 'fall', 0, 0, false);
    w.run(70);
    expect(w.p.z).toBeCloseTo(-12.5);
  });

  it('a PvP hit tags both players and blocks teleports until the timer runs out', () => {
    const w = two();
    w.sim.damage(w.p, 3, 'player', w.q.x, w.q.z, true, false, 'B');
    expect(w.sim.combatLeft(w.p)).toBe(300);
    expect(w.sim.combatLeft(w.q)).toBe(300);
    expect(w.sim.command(w.p, '/spawn')).toMatch(/in combat/);
    w.sim.settings.combatTime = 15;
    w.run(301);
    expect(w.p.inCombat).toBe(false);
    expect(w.sim.command(w.p, '/spawn')).toMatch(/Teleporting/);
  });

  it('logging out in combat kills the player and drops their items', () => {
    const w = two();
    w.p.inv.slots[0] = { id: I.AETHERITE, count: 5 };
    w.sim.damage(w.p, 3, 'hollowed', 1, 1);
    expect(w.sim.combatLog(w.p)).toBe(true);
    expect(w.p.dead).toBe(true);
    expect(w.p.inv.slots[0]).toBeNull();
    expect(w.sim.combatLog(w.q)).toBe(false);
  });

  it('the combat timer can be turned off', () => {
    const w = two();
    w.sim.command(w.p, '/gamerule combattimer 0');
    w.p.op = true;
    w.sim.command(w.p, '/gamerule combattimer 0');
    w.sim.damage(w.p, 3, 'player', 0, 0, true, false, 'B');
    expect(w.p.inCombat).toBeFalsy();
  });
});

describe('v42 max enchant', () => {
  it('applies the best compatible set at max level', () => {
    const w = world();
    w.p.op = true;
    w.p.inv.slots[w.p.inv.selected] = { id: toolId(5, 3), count: 1, en: { smite: 2 } };
    expect(w.sim.command(w.p, '/enchantmax')).toMatch(/Applied/);
    const en = w.p.inv.slots[w.p.inv.selected]!.en!;
    expect(en.sharpness).toBe(ENCH.get('sharpness')!.max);
    expect(en.smite).toBeUndefined();
    expect(en.mending).toBe(1);
    expect(en.unbreaking).toBe(3);
    expect(en.looting).toBe(3);
    expect(en.vanishing_curse).toBeUndefined();
    w.p.inv.slots[w.p.inv.selected] = { id: armorId(4, 1), count: 1 };
    w.sim.command(w.p, '/enchantmax');
    const a = w.p.inv.slots[w.p.inv.selected]!.en!;
    expect(a.protection).toBe(4);
    expect(a.blast_protection).toBeUndefined();
    expect(a.binding_curse).toBeUndefined();
  });

  it('needs admin or creative', () => {
    const w = world();
    w.p.op = false; w.p.mode = 'survival';
    w.p.inv.slots[w.p.inv.selected] = { id: toolId(5, 3), count: 1 };
    expect(w.sim.command(w.p, '/enchantmax')).toMatch(/permission/);
  });
});

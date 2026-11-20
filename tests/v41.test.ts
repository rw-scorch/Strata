import { describe, it, expect } from 'vitest';
import { WorldSim } from '../src/core/sim/WorldSim';
import { B, CB, X, XV, blockId, blockMeta, makeBlock, emitOf, CAMPFIRE_LIT, LANTERN_HANGING } from '../src/core/blocks';
import { I } from '../src/core/items';
import { NETHER_X } from '../src/core/dimension';
import { world } from './v40.test';

type Ent = { kind: string; type?: string; item?: { id: number; count: number }; x: number; y: number; z: number; scared?: [number, number] | null };
const ents = (sim: WorldSim) => [...(sim as unknown as { entities: Map<number, Ent> }).entities.values()];
const drops = (sim: WorldSim) => ents(sim).filter((e) => e.kind === 'item').map((e) => e.item!);

describe('v41 soul light and campfires', () => {
  it('crafts soul torches, soul lanterns, campfires, the anchor and the lodestone', async () => {
    const { RECIPES } = await import('../src/core/crafting');
    const by = (r: number) => RECIPES.find((x) => x.result === r);
    expect(by(CB.SOUL_TORCH)?.count).toBe(4);
    for (const id of [CB.SOUL_LANTERN, CB.CAMPFIRE, CB.SOUL_CAMPFIRE, CB.RESPAWN_ANCHOR, CB.LODESTONE]) expect(by(id)).toBeTruthy();
  });

  it('places soul torches on walls and floors, and lanterns hanging under blocks', () => {
    const { sim, p, store } = world();
    p.x = 0.5; p.y = 10; p.z = -1.5;
    p.inv.slots[p.inv.selected] = { id: CB.SOUL_TORCH, count: 4 };
    expect(sim.place(p, 0, 9, 0, 0, 1, 0)).toBe(true);
    expect(blockId(sim.get(0, 10, 0))).toBe(CB.SOUL_TORCH);
    expect(emitOf(sim.get(0, 10, 0))).toBe(10);
    store.setBlock(2, 10, 0, B.STONE);
    expect(sim.place(p, 2, 10, 0, -1, 0, 0)).toBe(true);
    expect(blockMeta(sim.get(1, 10, 0))).toBeGreaterThan(0);
    store.setBlock(-2, 12, 0, B.STONE);
    p.inv.slots[p.inv.selected] = { id: CB.SOUL_LANTERN, count: 2 };
    expect(sim.place(p, -2, 12, 0, 0, -1, 0)).toBe(true);
    expect(blockMeta(sim.get(-2, 11, 0)) & LANTERN_HANGING).toBe(LANTERN_HANGING);
    sim.breakBlock(-2, 12, 0, p);
    expect(blockId(sim.get(-2, 11, 0))).toBe(0);
  });

  it('cooks food on a lit campfire in 30 seconds and burns players standing in it', () => {
    const { sim, p, run } = world();
    p.x = 0.5; p.y = 10; p.z = -1.5;
    p.inv.slots[p.inv.selected] = { id: CB.CAMPFIRE, count: 1 };
    expect(sim.place(p, 0, 9, 0, 0, 1, 0)).toBe(true);
    const v = sim.get(0, 10, 0);
    expect(blockMeta(v) & CAMPFIRE_LIT).toBe(CAMPFIRE_LIT);
    expect(emitOf(v)).toBe(15);
    p.inv.slots[p.inv.selected] = { id: I.RAW_PORK, count: 5 };
    for (let i = 0; i < 5; i++) sim.use(p, 0, 10, 0, 0, 1, 0);
    expect(p.inv.slots[p.inv.selected]?.count).toBe(1);
    run(590);
    expect(drops(sim).filter((d) => d.id === I.COOKED_PORK)).toHaveLength(0);
    run(15);
    expect(drops(sim).filter((d) => d.id === I.COOKED_PORK).reduce((n, d) => n + d.count, 0)).toBe(4);
    p.x = 0.5; p.y = 10.4375; p.z = 0.5; p.health = 20;
    run(25);
    expect(p.health).toBeLessThan(20);
  });

  it('a shovel puts a campfire out and flint and steel lights it again', () => {
    const { sim, p, store } = world();
    p.x = 0.5; p.y = 10; p.z = -1.5;
    store.setBlock(0, 10, 0, makeBlock(CB.SOUL_CAMPFIRE, CAMPFIRE_LIT));
    p.inv.slots[p.inv.selected] = { id: 302, count: 1 };
    expect(sim.use(p, 0, 10, 0, 0, 1, 0)).toBe(true);
    expect(blockMeta(sim.get(0, 10, 0)) & CAMPFIRE_LIT).toBe(0);
    expect(emitOf(sim.get(0, 10, 0))).toBe(0);
    p.inv.slots[p.inv.selected] = { id: I.FLINT_AND_STEEL, count: 1 };
    expect(sim.use(p, 0, 10, 0, 0, 1, 0)).toBe(true);
    expect(blockMeta(sim.get(0, 10, 0)) & CAMPFIRE_LIT).toBe(CAMPFIRE_LIT);
  });

  it('piglins keep away from soul fire light', () => {
    const { sim, store, run, p } = world({ difficulty: 'normal' });
    const bx = NETHER_X;
    p.mode = 'creative'; p.x = bx - 12.5; p.y = 10; p.z = 0.5;
    for (let x = bx - 16; x <= bx + 16; x++) for (let z = -16; z <= 16; z++) store.setBlock(x, 9, z, X(XV.NETHERRACK));
    store.setBlock(bx, 10, 0, makeBlock(CB.SOUL_TORCH, 0));
    const pig = sim.spawnMob('piglin', bx + 2.5, 10, 0.5);
    run(80);
    const e = ents(sim).find((o) => o.type === 'piglin')!;
    expect(e).toBe(pig);
    expect(Math.hypot(e.x - bx, e.z)).toBeGreaterThan(3.5);
  });
});

describe('v41 respawn anchor and lodestone', () => {
  const nether = () => {
    const w = world();
    for (let x = NETHER_X - 8; x <= NETHER_X + 8; x++) for (let z = -8; z <= 8; z++) w.store.setBlock(x, 9, z, X(XV.NETHERRACK));
    return w;
  };

  it('charges with glowshard, sets the respawn point in the Nether and spends a charge', () => {
    const { sim, p, store } = nether();
    p.x = NETHER_X + 0.5; p.y = 10; p.z = -1.5;
    store.setBlock(NETHER_X, 10, 0, makeBlock(CB.RESPAWN_ANCHOR, 0));
    expect(emitOf(sim.get(NETHER_X, 10, 0))).toBe(0);
    p.inv.slots[p.inv.selected] = { id: B.GLOWSTONE, count: 5 };
    for (let i = 0; i < 5; i++) sim.use(p, NETHER_X, 10, 0, 0, 1, 0);
    expect(blockMeta(sim.get(NETHER_X, 10, 0))).toBe(4);
    expect(emitOf(sim.get(NETHER_X, 10, 0))).toBe(15);
    expect(p.inv.slots[p.inv.selected]?.count).toBe(1);
    p.inv.slots[p.inv.selected] = null;
    expect(sim.use(p, NETHER_X, 10, 0, 0, 1, 0)).toBe(true);
    expect(p.anchor).toEqual([NETHER_X, 10, 0]);
    p.x = 5; p.z = 5; p.dead = true;
    sim.respawn(p);
    expect(Math.abs(p.x - NETHER_X)).toBeLessThan(2);
    expect(blockMeta(sim.get(NETHER_X, 10, 0))).toBe(3);
  });

  it('falls back to the normal spawn when the anchor is empty or gone', () => {
    const { sim, p, store } = nether();
    store.setBlock(NETHER_X, 10, 0, makeBlock(CB.RESPAWN_ANCHOR, 1));
    p.anchor = [NETHER_X, 10, 0];
    p.dead = true; sim.respawn(p);
    expect(Math.abs(p.x - NETHER_X)).toBeLessThan(2);
    p.dead = true; sim.respawn(p);
    expect(p.anchor).toBeUndefined();
    expect(p.x).toBeLessThan(1000);
  });

  it('explodes when used outside the Nether', () => {
    const { sim, p, store } = world();
    p.x = 0.5; p.y = 10; p.z = -5.5; p.mode = 'creative';
    store.setBlock(0, 10, 0, makeBlock(CB.RESPAWN_ANCHOR, 2));
    expect(sim.use(p, 0, 10, 0, 0, 1, 0)).toBe(true);
    expect(blockId(sim.get(0, 10, 0))).toBe(0);
    expect(blockId(sim.get(0, 9, 0))).toBe(0);
  });

  it('binds a compass to a lodestone', async () => {
    const { validStack } = await import('../src/core/inventory');
    const { sim, p, store } = world();
    p.x = 0.5; p.y = 10; p.z = -1.5;
    store.setBlock(0, 10, 0, makeBlock(CB.LODESTONE, 0));
    p.inv.slots[p.inv.selected] = { id: I.COMPASS, count: 3 };
    expect(sim.use(p, 0, 10, 0, 0, 1, 0)).toBe(true);
    expect(p.inv.slots[p.inv.selected]?.count).toBe(2);
    const bound = p.inv.slots.find((s) => s?.lt);
    expect(bound?.lt).toEqual([0, 10, 0]);
    expect(validStack(bound)).toBe(true);
    expect(validStack({ id: I.COMPASS, count: 1, lt: [1, 2] })).toBe(false);
  });
});

describe('v41 huge fungi and bone meal', () => {
  const CNYL = X(XV.CRIMSON_NYLIUM), WNYL = X(XV.WARPED_NYLIUM), RACK = X(XV.NETHERRACK);
  it('bone meal grows a huge crimson fungus only on crimson nylium', () => {
    const { sim, p, store } = world();
    p.x = 0.5; p.y = 10; p.z = -2.5; p.mode = 'creative';
    store.setBlock(0, 9, 0, CNYL); store.setBlock(0, 10, 0, B.CRIMSON_FUNGUS);
    store.setBlock(6, 9, 0, WNYL); store.setBlock(6, 10, 0, B.CRIMSON_FUNGUS);
    p.inv.slots[p.inv.selected] = { id: I.BONE_MEAL, count: 64 };
    for (let i = 0; i < 30 && blockId(sim.get(0, 10, 0)) === B.CRIMSON_FUNGUS; i++) sim.use(p, 0, 10, 0, 0, 1, 0);
    expect(sim.get(0, 10, 0)).toBe(X(XV.CRIMSON_STEM));
    let h = 0;
    while (sim.get(0, 10 + h, 0) === X(XV.CRIMSON_STEM)) h++;
    expect(h).toBeGreaterThanOrEqual(4);
    let wart = 0;
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) for (let dy = 0; dy < 30; dy++) if (sim.get(dx, 10 + dy, dz) === X(XV.NETHER_WART_BLOCK)) wart++;
    expect(wart).toBeGreaterThan(10);
    p.x = 6.5;
    expect(sim.use(p, 6, 10, 0, 0, 1, 0)).toBe(false);
    expect(blockId(sim.get(6, 10, 0))).toBe(B.CRIMSON_FUNGUS);
  });

  it('bone meal on nylium grows roots and fungi, and spreads nylium onto netherrack', () => {
    const { sim, p, store } = world();
    p.x = 0.5; p.y = 10; p.z = -3.5; p.mode = 'creative';
    for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) store.setBlock(x, 9, z, WNYL);
    store.setBlock(8, 9, 0, CNYL); store.setBlock(9, 9, 0, RACK);
    p.inv.slots[p.inv.selected] = { id: I.BONE_MEAL, count: 64 };
    expect(sim.use(p, 0, 9, 0, 0, 1, 0)).toBe(true);
    let plants = 0;
    for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) if ([B.WARPED_ROOTS, B.WARPED_FUNGUS, B.CRIMSON_FUNGUS, B.NETHER_SPROUTS].includes(blockId(sim.get(x, 10, z)))) plants++;
    expect(plants).toBeGreaterThan(2);
    p.x = 9.5;
    expect(sim.use(p, 9, 9, 0, 0, 1, 0)).toBe(true);
    expect(sim.get(9, 9, 0)).toBe(CNYL);
    store.setBlock(14, 9, 0, RACK);
    p.x = 14.5;
    expect(sim.use(p, 14, 9, 0, 0, 1, 0)).toBe(false);
  });

  it('bone meal lengthens weeping and twisting vines', () => {
    const { sim, p, store } = world();
    p.x = 0.5; p.y = 10; p.z = -2.5; p.mode = 'creative';
    store.setBlock(0, 20, 0, B.STONE); store.setBlock(0, 19, 0, B.WEEPING_VINES);
    store.setBlock(3, 10, 0, B.TWISTING_VINES);
    p.inv.slots[p.inv.selected] = { id: I.BONE_MEAL, count: 64 };
    p.y = 16;
    expect(sim.use(p, 0, 19, 0, 0, -1, 0)).toBe(true);
    expect(blockId(sim.get(0, 18, 0))).toBe(B.WEEPING_VINES);
    p.y = 10; p.x = 3.5;
    expect(sim.use(p, 3, 10, 0, 0, 1, 0)).toBe(true);
    expect(blockId(sim.get(3, 11, 0))).toBe(B.TWISTING_VINES);
  });

  it('new Nether worlds grow huge fungi, lavafalls, basalt columns and fossils, and old chunks stay the same', async () => {
    const { WorldGenerator } = await import('../src/core/worldgen/WorldGenerator');
    const g = new WorldGenerator(4141);
    const NX = NETHER_X / 16;
    const want = new Set(['crimson_forest', 'basalt_deltas', 'soul_sand_valley', 'nether_wastes']);
    const stats: Record<string, Record<number, number>> = {};
    for (let i = 0; i < 600 && want.size; i++) {
      const cx = NX + (i % 25) * 5 - 60, cz = Math.floor(i / 25) * 5 - 60;
      const b = g.netherBiome(cx * 16 + 8, cz * 16 + 8);
      if (!want.has(b)) continue;
      want.delete(b);
      const c: Record<number, number> = {};
      for (let a = -1; a <= 1; a++) for (let d = -1; d <= 1; d++) for (const v of g.generate(cx + a, cz + d, 15).blocks) c[v] = (c[v] ?? 0) + 1;
      stats[b] = c;
    }
    expect(want.size).toBe(0);
    expect(stats.crimson_forest[X(XV.CRIMSON_STEM)]).toBeGreaterThan(60);
    expect(stats.basalt_deltas[X(XV.BASALT)]).toBeGreaterThan(3000);
    expect(stats.nether_wastes[makeBlock(B.LAVA, 9)] ?? 0).toBeGreaterThan(5);
    const a = g.generate(NX, 0, 14).blocks, b = g.generate(NX, 0, 15).blocks;
    expect(a.length).toBe(b.length);
  });
});

describe('v41 zoglins, Soul Speed, Bottles o\' Enchanting and fireworks', () => {
  it('a hoglin outside the Nether turns into a zoglin after 15 seconds', () => {
    const { sim, p, run } = world({ difficulty: 'normal' });
    p.mode = 'creative'; p.x = 10.5; p.y = 10; p.z = 0.5;
    sim.spawnMob('hoglin', 0.5, 10, 0.5);
    run(290);
    expect(ents(sim).some((e) => e.type === 'hoglin')).toBe(true);
    run(20);
    expect(ents(sim).some((e) => e.type === 'hoglin')).toBe(false);
    expect(ents(sim).some((e) => e.type === 'zoglin')).toBe(true);
  });

  it('Soul Speed is a treasure boots enchantment that librarians never sell', async () => {
    const { ENCHANTS } = await import('../src/core/enchants');
    const ss = ENCHANTS.find((e) => e.key === 'soul_speed')!;
    expect(ss.max).toBe(3);
    expect(ss.treasure).toBe(true);
    expect(ss.supp).toEqual(['feet']);
  });

  it('a thrown Bottle o\' Enchanting shatters into 3 to 11 experience', () => {
    const { sim, p, run } = world();
    p.mode = 'survival'; p.x = 0.5; p.y = 10; p.z = 0.5;
    const before = p.xp;
    p.inv.slots[p.inv.selected] = { id: I.EXPERIENCE_BOTTLE, count: 2 };
    expect(sim.shootBow(p, 1, 0, -1.2)).toBe(true);
    expect(p.inv.slots[p.inv.selected]?.count).toBe(1);
    run(40);
    const got = p.xp - before;
    expect(got).toBeGreaterThanOrEqual(3);
    expect(got).toBeLessThanOrEqual(11);
  });

  it('the shop and the master cleric stock Bottles o\' Enchanting', async () => {
    const { SHOP } = await import('../src/core/economy');
    const { OFFERS } = await import('../src/core/trades');
    expect(SHOP.some((c) => c.items.some((i) => i.id === I.EXPERIENCE_BOTTLE))).toBe(true);
    expect(OFFERS.cleric.some((o) => o.give.id === I.EXPERIENCE_BOTTLE && o.tier === 4)).toBe(true);
  });

  it('crafts firework rockets with flight duration 1 to 3', async () => {
    const { craftResult } = await import('../src/core/inventory');
    const { sim, p } = world();
    void sim;
    p.inv.craftSize = 2;
    p.inv.craft = [{ id: I.PAPER, count: 1 }, { id: I.GUNPOWDER, count: 1 }, { id: I.GUNPOWDER, count: 1 }, { id: I.GUNPOWDER, count: 1 }, null, null, null, null, null];
    const r = craftResult(p.inv);
    expect(r?.stack).toEqual({ id: I.FIREWORK_ROCKET, count: 3, fl: 3 });
  });
});

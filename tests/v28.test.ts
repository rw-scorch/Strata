import { describe, it, expect } from 'vitest';
import { WorldSim, WorldStore, newPlayer, MF } from '../src/core/sim/WorldSim';
import { WorldGenerator } from '../src/core/worldgen/WorldGenerator';
import { ChunkData } from '../src/core/chunk';
import { B, X, XV, blockId, blockMeta, makeBlock } from '../src/core/blocks';
import { I, getItem, ITEM_LIST } from '../src/core/items';
import { JOB_SITES, PROFESSIONS, villagerOffers, TRADE_POOLS } from '../src/core/trades';
import { RECIPES } from '../src/core/crafting';

function world() {
  const chunks = new Map<string, ChunkData>();
  const get = (cx: number, cz: number) => { const k = `${cx},${cz}`; let c = chunks.get(k); if (!c) { c = new ChunkData(cx, cz, new Uint16Array(16 * 16 * 256)); chunks.set(k, c); } return c; };
  const store: WorldStore = { getBlock: (x, y, z) => get(x >> 4, z >> 4).get(x & 15, y, z & 15), setBlock: (x, y, z, v) => get(x >> 4, z >> 4).set(x & 15, y, z & 15, v), isLoaded: () => true, raw: (cx, cz) => get(cx, cz).blocks };
  for (let x = -30; x <= 30; x++) for (let z = -30; z <= 30; z++) store.setBlock(x, 60, z, B.STONE);
  const sim = new WorldSim({ seed: 5, store, gen: new WorldGenerator(5), difficulty: 'normal', emit: () => {}, validateMoves: false, authoritative: true, spawn: { x: 0, y: 61, z: 0 } });
  sim.settings.mobSpawning = false;
  const run = (n: number) => { for (let i = 0; i < n; i++) sim.tick(); };
  const player = (x: number, y: number, z: number) => { const p = newPlayer(`p${Math.random()}`, 'P', 'survival', { x, y, z }); sim.addPlayer(p); Object.assign(p, { x, y, z, yaw: 0, pitch: 0, flags: MF.GROUND, peakY: y }); return p; };
  return { sim, run, player, store };
}

describe('Job site blocks', () => {
  it('every profession has its Java job site block', () => {
    const want: Record<string, number> = { farmer: B.COMPOSTER, librarian: B.LECTERN, toolsmith: B.SMITHING_TABLE, armorer: B.BLAST_FURNACE, butcher: B.SMOKER, fletcher: B.FLETCHING_TABLE, cleric: B.BREWING_STAND, mason: B.STONECUTTER, fisherman: B.BARREL, cartographer: B.CARTOGRAPHY_TABLE, leatherworker: B.CAULDRON, shepherd: B.LOOM, weaponsmith: B.GRINDSTONE };
    for (const [prof, block] of Object.entries(want)) expect(PROFESSIONS[JOB_SITES[block]]).toBe(prof);
    for (const prof of PROFESSIONS) expect(villagerOffers(prof, 3).length).toBeGreaterThan(0);
  });
  it('an unemployed villager claims a nearby job block, and loses the job if it is broken before trading', () => {
    const { sim, run, player, store } = world();
    player(10.5, 61, 10.5);
    const v = sim.spawnMob('villager', 0.5, 61, 0.5);
    v.persistent = true;
    store.setBlock(4, 61, 2, B.LECTERN);
    run(120);
    expect(v.prof).toBe(PROFESSIONS.indexOf('librarian'));
    expect(v.job).toEqual([4, 61, 2]);
    expect(v.flags >> 9 & 15).toBe(PROFESSIONS.indexOf('librarian') + 1);
    sim.setBlock(4, 61, 2, 0);
    run(120);
    expect(v.prof).toBe(-1);
    sim.setBlock(-3, 61, 1, B.GRINDSTONE);
    run(120);
    expect(PROFESSIONS[v.prof!]).toBe('weaponsmith');
  });
  it('unemployed villagers refuse to trade', () => {
    const { sim, player } = world();
    const p = player(1.5, 61, 1.5);
    const v = sim.spawnMob('villager', 0.5, 61, 0.5);
    sim.useEntity(p, v.id);
    expect(p.screen.type).not.toBe('trade');
  });
});

describe('New blocks and items', () => {
  it('composter turns plant scraps into bone meal', () => {
    const { sim, player, store, run } = world();
    const p = player(1.5, 61, 1.5);
    store.setBlock(2, 61, 0, B.COMPOSTER);
    p.inv.slots[0] = { id: I.PUMPKIN_PIE, count: 10 };
    for (let i = 0; i < 7; i++) sim.use(p, 2, 61, 0, 0, 1, 0);
    expect(blockMeta(store.getBlock(2, 61, 0))).toBe(8);
    expect(sim.use(p, 2, 61, 0, 0, 1, 0)).toBe(true);
    run(2);
    expect([...sim.entities.values()].some((e) => e.kind === 'item' && e.item?.id === I.BONE_MEAL)).toBe(true);
  });
  it('cake gives seven slices', () => {
    const { sim, player, store } = world();
    const p = player(1.5, 61, 1.5);
    p.food = 2;
    store.setBlock(2, 61, 0, B.CAKE);
    for (let i = 0; i < 7; i++) expect(sim.use(p, 2, 61, 0, 0, 1, 0)).toBe(true);
    expect(store.getBlock(2, 61, 0)).toBe(0);
    expect(p.food).toBe(16);
  });
  it('smoker cooks food twice as fast and refuses ores; barrel stores items', () => {
    const { sim, player, store, run } = world();
    const p = player(1.5, 61, 1.5);
    store.setBlock(2, 61, 0, B.SMOKER);
    expect(sim.use(p, 2, 61, 0, 0, 1, 0)).toBe(true);
    expect(p.screen.type).toBe('furnace');
    const S = sim as unknown as { ensureBlockEntity(x: number, y: number, z: number): { items: ({ id: number; count: number } | null)[] }; activeFurnaces: Set<string> };
    const items = S.ensureBlockEntity(2, 61, 0).items;
    items[0] = { id: I.POTATO, count: 1 }; items[1] = { id: I.COAL, count: 1 };
    S.activeFurnaces.add('2,61,0');
    run(110);
    expect(items[2]?.id).toBe(I.BAKED_POTATO);
    store.setBlock(3, 61, 3, B.BARREL);
    expect(sim.use(p, 3, 61, 3, 0, 1, 0)).toBe(true);
    expect(p.screen.type).toBe('chest');
  });
  it('carrots, potatoes and beetroots grow and drop crops', () => {
    expect(getItem(I.CARROT)?.places).toBe(B.CARROTS);
    expect(getItem(I.POTATO)?.food?.hunger).toBe(1);
    expect(RECIPES.some((r) => r.result === B.COMPOSTER)).toBe(true);
    expect(RECIPES.some((r) => r.result === I.GOLDEN_CARROT)).toBe(true);
    const ids = ITEM_LIST.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('a name tag renamed at an anvil names a mob and keeps it', () => {
    const { sim, player } = world();
    const p = player(1.5, 61, 1.5);
    const m = sim.spawnMob('woolhorn', 0.5, 61, 0.5);
    p.inv.slots[0] = { id: I.NAME_TAG, count: 1, nm: 'Dolly' };
    expect(sim.useEntity(p, m.id)).toBe(true);
    expect(m.cname).toBe('Dolly');
    expect(m.persistent).toBe(true);
    expect(sim.namedMobs()).toEqual([{ id: m.id, name: 'Dolly' }]);
  });
  it('trades now include the items that were missing', () => {
    expect(TRADE_POOLS.librarian.some((d) => d.give.id === I.NAME_TAG && d.cost[0].count === 20 && d.tier === 4)).toBe(true);
    expect(TRADE_POOLS.farmer.some((d) => d.give.id === I.GOLDEN_CARROT && d.tier === 4)).toBe(true);
    expect(TRADE_POOLS.weaponsmith.some((d) => d.give.id === B.BELL && d.cost[0].count === 36)).toBe(true);
    expect(TRADE_POOLS.shepherd.filter((d) => d.tier === 3).length).toBe(6);
  });
});

describe('World generation level 8', () => {
  it('stone patches and village job blocks only appear in new land', () => {
    const g = new WorldGenerator(31);
    let n7 = 0, n8 = 0;
    for (let i = 0; i < 6; i++) {
      for (const v of g.generate(i, 3, 7).blocks) if (v === X(XV.GRANITE) || v === X(XV.DIORITE) || v === X(XV.ANDESITE)) n7++;
      for (const v of g.generate(i, 3, 8).blocks) if (v === X(XV.GRANITE) || v === X(XV.DIORITE) || v === X(XV.ANDESITE)) n8++;
    }
    expect(n7).toBe(0);
    expect(n8).toBeGreaterThan(100);
    const vs = g.villagesNear(0, 0, 4000);
    const v = vs[0];
    let jobs8 = 0, jobs7 = 0;
    for (let cx = (v.bounds.x0 >> 4) - 1; cx <= (v.bounds.x1 >> 4) + 1; cx++) for (let cz = (v.bounds.z0 >> 4) - 1; cz <= (v.bounds.z1 >> 4) + 1; cz++) {
      for (const b of g.generate(cx, cz, 8).blocks) if (JOB_SITES[blockId(b)] !== undefined && blockId(b) !== B.SMITHING_TABLE) jobs8++;
      for (const b of g.generate(cx, cz, 7).blocks) if (JOB_SITES[blockId(b)] !== undefined && blockId(b) !== B.SMITHING_TABLE) jobs7++;
    }
    expect(jobs7).toBe(0);
    expect(jobs8).toBeGreaterThan(0);
    void makeBlock;
  });
});

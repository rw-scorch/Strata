import { it, expect } from 'vitest';
import { WorldGenerator } from '../src/core/worldgen/WorldGenerator';
import { villagerOffers, performTrade, unlocked } from '../src/core/trades';
import { I } from '../src/core/items';
import { emptyInv } from '../src/core/inventory';

it('villages appear and stamp blocks', () => {
  const gen = new WorldGenerator(12345);
  const vs = gen.villagesNear(0, 0, 3000);
  expect(vs.length).toBeGreaterThan(0);
  const v = vs[0];
  expect(v.homes.length).toBeGreaterThan(1);
  expect(v.buildings.length).toBeGreaterThan(3);
  const c = gen.generate(Math.floor(v.x / 16), Math.floor(v.z / 16));
  let water = 0;
  for (let i = 0; i < c.blocks.length; i++) if ((c.blocks[i] & 0xff) === 12) water++;
  expect(water).toBeGreaterThan(0);
});

it('trades swap items', () => {
  const inv = emptyInv();
  inv.slots[0] = { id: I.WHEAT, count: 40 };
  let seed = 0;
  while (!villagerOffers('farmer', seed).some((o) => o.cost[0].id === I.WHEAT)) seed++;
  const idx = villagerOffers('farmer', seed).findIndex((o) => o.cost[0].id === I.WHEAT);
  const of = villagerOffers('farmer', seed)[idx];
  expect(unlocked('farmer', 0, seed)).toContain(idx);
  expect(performTrade(inv, of)).not.toBeNull();
  expect(inv.slots[0]!.count).toBe(20);
  expect(inv.slots.some((s) => s?.id === I.EMERALD)).toBe(true);
});

import { describe, it, expect } from 'vitest';
import { WorldSim, WorldStore, newPlayer, MF } from '../src/core/sim/WorldSim';
import { WorldGenerator } from '../src/core/worldgen/WorldGenerator';
import { ChunkData } from '../src/core/chunk';
import { B, X, XV } from '../src/core/blocks';
import { I, toolId, getItem, ITEM_LIST } from '../src/core/items';
import { NETHER_X } from '../src/core/dimension';
import { villagerOffers, unlocked, TRADE_POOLS, PROFESSIONS, LEVEL_XP } from '../src/core/trades';
import { verifyStripeSignature } from '../workers/stripe';

function world() {
  const chunks = new Map<string, ChunkData>();
  const get = (cx: number, cz: number) => { const k = `${cx},${cz}`; let c = chunks.get(k); if (!c) { c = new ChunkData(cx, cz, new Uint16Array(16 * 16 * 256)); chunks.set(k, c); } return c; };
  const store: WorldStore = { getBlock: (x, y, z) => get(x >> 4, z >> 4).get(x & 15, y, z & 15), setBlock: (x, y, z, v) => get(x >> 4, z >> 4).set(x & 15, y, z & 15, v), isLoaded: () => true, raw: (cx, cz) => get(cx, cz).blocks };
  const X0 = NETHER_X;
  for (let x = -40; x <= 40; x++) for (let z = -40; z <= 40; z++) { store.setBlock(X0 + x, 40, z, X(XV.NETHERRACK)); store.setBlock(X0 + x, 41, z, B.LAVA); }
  const sim = new WorldSim({ seed: 5, store, gen: new WorldGenerator(5), difficulty: 'normal', emit: () => {}, validateMoves: false, authoritative: true, spawn: { x: X0, y: 43, z: 0 } });
  sim.settings.mobSpawning = false;
  const run = (n: number) => { for (let i = 0; i < n; i++) sim.tick(); };
  const player = (x: number, y: number, z: number) => { const p = newPlayer(`p${Math.random()}`, 'P', 'survival', { x, y, z }); sim.addPlayer(p); Object.assign(p, { x, y, z, yaw: 0, pitch: 0, flags: MF.GROUND, peakY: y }); return p; };
  return { sim, run, player, store, X0 };
}

describe('Strider riding', () => {
  it('saddle, mount, steer with warped fungus on a stick, boost and dismount', () => {
    const { sim, run, player, X0 } = world();
    const st = sim.spawnMob('lavastrider', X0 + 0.5, 42, 0.5);
    run(10);
    const p = player(X0 + 1.5, 43.6, 1.5);
    p.inv.slots[0] = { id: I.SADDLE, count: 1 };
    expect(sim.useEntity(p, st.id)).toBe(true);
    expect(st.saddled).toBe(true);
    expect(p.inv.slots[0]).toBeNull();
    expect(sim.useEntity(p, st.id)).toBe(true);
    expect(p.riding).toBe(st.id);
    p.inv.slots[0] = { id: I.FUNGUS_STICK, count: 1 };
    p.yaw = Math.PI / 2;
    const x0 = st.x;
    for (let i = 0; i < 40; i++) { sim.move(p, p.x, p.y, p.z, Math.PI / 2, 0, 0); run(1); }
    expect(st.x).toBeLessThan(x0 - 3);
    expect(p.y).toBeCloseTo(st.y + 1.6, 1);
    expect(sim.useEntity(p, st.id)).toBe(true);
    expect(st.boost).toBeGreaterThan(0);
    expect(p.inv.slots[0]?.dmg).toBe(1);
    sim.move(p, p.x, p.y, p.z, 0, 0, MF.CROUCH);
    expect(p.riding).toBeUndefined();
  });
  it('every item has its own id', () => {
    const ids = ITEM_LIST.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(getItem(I.CINDERITE_INGOT)?.name).toBe('Netherite Ingot');
    expect(getItem(I.UPGRADE_TEMPLATE)?.name).toBe('Netherite Upgrade');
  });
  it('saddles and fungus sticks are craftable', () => {
    expect(getItem(I.SADDLE)?.name).toBe('Saddle');
    expect(getItem(I.FUNGUS_STICK)?.durability).toBe(100);
  });
});

describe('Villager trades follow Java', () => {
  it('each level offers at most two trades picked from its pool, the same for the same villager', () => {
    for (const prof of PROFESSIONS) {
      const a = villagerOffers(prof, 1234), b = villagerOffers(prof, 1234);
      expect(a).toBe(b);
      for (let t = 0; t < 5; t++) {
        const n = a.filter((o) => o.tier === t).length;
        expect(n).toBe(Math.min(2, TRADE_POOLS[prof].filter((d) => d.tier === t).length));
      }
    }
    const seen = new Set<string>();
    for (let s = 0; s < 40; s++) seen.add(villagerOffers('toolsmith', s).filter((o) => o.tier === 0).map((o) => o.give.id).join(','));
    expect(seen.size).toBeGreaterThan(3);
  });
  it('uses Java prices, stock and villager XP', () => {
    const lib = TRADE_POOLS.librarian;
    expect(lib[0].cost[0]).toEqual({ id: I.PAPER, count: 24 });
    expect(lib[0].max).toBe(16);
    expect(lib.find((d) => d.give.id === B.BOOKSHELF)?.cost[0].count).toBe(9);
    const tool = TRADE_POOLS.toolsmith.find((d) => d.give.id === toolId(4, 0))!;
    expect(tool.tier).toBe(4); expect(tool.max).toBe(3); expect(tool.xp).toBe(30);
    expect(TRADE_POOLS.fletcher.find((d) => d.give.id === I.FLINT && d.cost.length === 2)?.cost).toEqual([{ id: B.GRAVEL, count: 10 }, { id: I.EMERALD, count: 1 }]);
    expect(TRADE_POOLS.cleric.find((d) => d.cost[0].id === I.NETHER_WART)?.cost[0].count).toBe(22);
    expect(LEVEL_XP).toEqual([0, 10, 70, 150, 250]);
  });
  it('enchanted items and books get a random price and real enchantments', () => {
    let books = 0, pick = 0;
    for (let s = 0; s < 60; s++) {
      for (const o of villagerOffers('librarian', s)) if (o.give.id === I.ENCHANTED_BOOK) { books++; expect(o.cost[0].count).toBeGreaterThanOrEqual(5); expect(o.cost[0].count).toBeLessThanOrEqual(64); expect(Object.keys(o.give.en ?? {}).length).toBe(1); }
      const m = villagerOffers('toolsmith', s).find((o) => o.give.id === toolId(4, 0));
      if (m) { pick++; expect(m.cost[0].count).toBeGreaterThanOrEqual(18); expect(m.cost[0].count).toBeLessThanOrEqual(32); expect(m.give.en).toBeTruthy(); }
    }
    expect(books).toBeGreaterThan(20);
    expect(pick).toBe(60);
    expect(unlocked('mason', 0, 7).every((i) => villagerOffers('mason', 7)[i].tier === 0)).toBe(true);
  });
});

describe('Stripe webhook signatures', () => {
  async function sign(payload: string, secret: string, t: number): Promise<string> {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${payload}`));
    return `t=${t},v1=${[...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
  }
  it('accepts a valid signature and rejects tampering or old timestamps', async () => {
    const now = Date.now(), t = Math.floor(now / 1000), secret = 'whsec_test_example';
    const body = '{"id":"evt_1","type":"customer.subscription.updated"}';
    const h = await sign(body, secret, t);
    expect(await verifyStripeSignature(body, h, secret, now)).toBe(true);
    expect(await verifyStripeSignature(body + ' ', h, secret, now)).toBe(false);
    expect(await verifyStripeSignature(body, h, 'whsec_other', now)).toBe(false);
    expect(await verifyStripeSignature(body, h, secret, now + 600_000)).toBe(false);
  });
});

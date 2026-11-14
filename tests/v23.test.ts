import { describe, it, expect } from 'vitest';
import { WorldSim, WorldStore, newPlayer, MF } from '../src/core/sim/WorldSim';
import { WorldGenerator } from '../src/core/worldgen/WorldGenerator';
import { ChunkData } from '../src/core/chunk';
import { B, X, XV, XB, getBlock, blockId, makeBlock, tix } from '../src/core/blocks';
import { I, getItem } from '../src/core/items';
import { NETHER_X, isNether, toNether, toOverworld } from '../src/core/dimension';
import { portalLoot, PORTAL_GRID } from '../src/core/worldgen/ruinedPortal';
import { Rng } from '../src/core/rng';

function world(real = false) {
  const gen = new WorldGenerator(5);
  const chunks = new Map<string, ChunkData>();
  const get = (cx: number, cz: number) => {
    const k = `${cx},${cz}`; let c = chunks.get(k);
    if (!c) { c = new ChunkData(cx, cz, real || isNether(cx * 16) ? gen.generate(cx, cz).blocks : new Uint16Array(16 * 16 * 256)); chunks.set(k, c); }
    return c;
  };
  const store: WorldStore = { getBlock: (x, y, z) => get(x >> 4, z >> 4).get(x & 15, y, z & 15), setBlock: (x, y, z, v) => get(x >> 4, z >> 4).set(x & 15, y, z & 15, v), isLoaded: () => true, raw: (cx, cz) => get(cx, cz).blocks };
  if (!real) for (let x = -24; x <= 40; x++) for (let z = -24; z <= 24; z++) for (let y = 5; y <= 9; y++) store.setBlock(x, y, z, B.STONE);
  const events: { e: string; [k: string]: unknown }[] = [];
  const sim = new WorldSim({ seed: 5, store, gen, difficulty: 'normal', emit: (e) => events.push(e as never), validateMoves: false, authoritative: true, spawn: { x: 0, y: 10, z: 0 } });
  const run = (n: number) => { for (let i = 0; i < n; i++) sim.tick(); };
  const player = (x: number, y: number, z: number, mode: 'survival' | 'creative' = 'survival') => {
    const p = newPlayer(`p${Math.random()}`, 'P', mode, { x, y, z }); p.op = true; sim.addPlayer(p);
    Object.assign(p, { x, y, z, yaw: 0, pitch: 0, flags: MF.GROUND, peakY: y });
    return p;
  };
  const frame = (x: number, y: number, z: number, w = 2, h = 3, ax = 0) => {
    const dx = ax === 0 ? 1 : 0, dz = 1 - dx;
    for (let i = -1; i <= w; i++) for (let j = -1; j <= h; j++) if (i === -1 || i === w || j === -1 || j === h) sim.setBlock(x + dx * i, y + j, z + dz * i, B.OBSIDIAN);
  };
  return { sim, run, player, events, store, gen, frame };
}

describe('extended blocks', () => {
  it('resolve through meta and place from their item', () => {
    const v = X(XV.NETHERRACK);
    expect(blockId(v)).toBe(B.EXT);
    expect(getBlock(v).key).toBe('netherrack');
    expect(tix(v)).toBe(XB + XV.NETHERRACK);
    const it = getItem(XB + XV.NETHERRACK)!;
    expect(it.places).toBe(B.EXT);
    expect(it.placeMeta).toBe(XV.NETHERRACK);
    expect(getBlock(X(XV.QUARTZ_BLOCK)).name).toBe('Block of Quartz');
  });
  it('places and drops the right variant', () => {
    const w = world();
    const p = w.player(0.5, 10, 0.5);
    p.inv.slots[0] = { id: XB + XV.BLACKSTONE, count: 2 }; p.inv.selected = 0;
    expect(w.sim.use(p, 2, 9, 0, 0, 1, 0)).toBe(true);
    expect(w.sim.get(2, 10, 0)).toBe(X(XV.BLACKSTONE));
    expect(getBlock(w.sim.get(2, 10, 0)).drops[0].item).toBe(XB + XV.BLACKSTONE);
  });
});

describe('the Nether region', () => {
  it('maps coordinates eight to one', () => {
    expect(toNether(800, -160)).toEqual([NETHER_X + 100, -20]);
    expect(toOverworld(NETHER_X + 100, -20)).toEqual([800, -160]);
    expect(isNether(NETHER_X)).toBe(true);
    expect(isNether(200000)).toBe(false);
  });
  it('generates a sealed cavern of netherrack with a lava sea', () => {
    const gen = new WorldGenerator(9);
    const cx = NETHER_X >> 4;
    const c = new ChunkData(cx, 0, gen.generate(cx, 0).blocks);
    const count: Record<string, number> = {};
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) {
      expect(c.get(x, 0, z)).toBe(B.BEDROCK);
      expect(c.get(x, 127, z)).toBe(B.BEDROCK);
      for (let y = 1; y < 127; y++) { const k = getBlock(c.get(x, y, z)).key; count[k] = (count[k] ?? 0) + 1; }
    }
    expect(count.netherrack).toBeGreaterThan(5000);
    expect(count.air).toBeGreaterThan(1500);
    expect(count.stone ?? 0).toBe(0);
    expect(count.water ?? 0).toBe(0);
    const again = new WorldGenerator(9).generate(cx, 0).blocks;
    expect(Buffer.from(again.buffer).equals(Buffer.from(c.blocks.buffer))).toBe(true);
  });
  it('boils away water buckets', () => {
    const w = world();
    const p = w.player(NETHER_X + 0.5, 100, 0.5, 'creative');
    for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) { w.sim.setBlock(NETHER_X + x, 99, z, B.STONE); for (let y = 100; y < 104; y++) w.sim.setBlock(NETHER_X + x, y, z, 0); }
    p.inv.slots[0] = { id: I.WATER_BUCKET, count: 1 }; p.inv.selected = 0;
    w.sim.use(p, NETHER_X + 1, 99, 0, 0, 1, 0);
    expect(w.sim.get(NETHER_X + 1, 100, 0)).toBe(0);
  });
});

describe('portals', () => {
  it('light inside an obsidian frame on either axis and reject bad frames', () => {
    const w = world();
    w.frame(4, 10, 0);
    expect(w.sim.lightPortal(4, 10, 0)).toBe(true);
    for (let i = 0; i < 2; i++) for (let h = 0; h < 3; h++) expect(w.sim.get(4 + i, 10 + h, 0)).toBe(makeBlock(B.NETHER_PORTAL, 0));
    w.frame(12, 10, 4, 3, 5, 1);
    expect(w.sim.lightPortal(12, 12, 5)).toBe(true);
    expect(w.sim.get(12, 14, 6)).toBe(makeBlock(B.NETHER_PORTAL, 1));
    w.frame(20, 10, 0);
    w.sim.setBlock(19, 11, 0, B.CRYING_OBSIDIAN);
    expect(w.sim.lightPortal(20, 10, 0)).toBe(false);
    w.frame(28, 10, 0, 1, 3);
    expect(w.sim.lightPortal(28, 10, 0)).toBe(false);
  });
  it('lights from Flint and Steel and makes fire elsewhere', () => {
    const w = world();
    const p = w.player(0.5, 10, 2.5);
    p.inv.slots[0] = { id: I.FLINT_AND_STEEL, count: 1 }; p.inv.selected = 0;
    w.frame(0, 10, 0);
    expect(w.sim.use(p, 0, 9, 0, 0, 1, 0)).toBe(true);
    expect(blockId(w.sim.get(1, 12, 0))).toBe(B.NETHER_PORTAL);
    expect(w.sim.use(p, 0, 9, 3, 0, 1, 0)).toBe(true);
    expect(w.sim.get(0, 10, 3)).toBe(B.FIRE);
    expect(p.inv.slots[0]!.dmg).toBe(2);
  });
  it('collapse when the frame is broken', () => {
    const w = world();
    w.frame(4, 10, 0, 3, 4);
    w.sim.lightPortal(5, 10, 0);
    expect([...w.sim.blockEntities.values()].filter((b) => b.type === 'portal').length).toBe(1);
    w.sim.setBlock(3, 11, 0, 0);
    for (let i = 0; i < 3; i++) for (let h = 0; h < 4; h++) expect(w.sim.get(4 + i, 10 + h, 0)).toBe(0);
    expect([...w.sim.blockEntities.values()].filter((b) => b.type === 'portal').length).toBe(0);
  });
  it('carry a player to the Nether and back to the same portal', () => {
    const w = world();
    w.frame(16, 10, 8);
    w.sim.lightPortal(16, 10, 8);
    const p = w.player(17, 10, 8.5);
    w.run(40);
    expect(isNether(p.x)).toBe(false);
    w.run(60);
    expect(isNether(p.x)).toBe(true);
    expect(blockId(w.sim.get(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)))).toBe(B.NETHER_PORTAL);
    expect(Math.abs(p.x - (NETHER_X + 2))).toBeLessThan(18);
    expect(Math.abs(p.z - 1)).toBeLessThan(18);
    expect(p.health).toBe(20);
    const nx = p.x, ny = p.y, nz = p.z;
    w.run(200);
    expect(isNether(p.x)).toBe(true);
    p.x += 3; w.run(5); p.x = nx; p.y = ny; p.z = nz;
    w.run(100);
    expect(isNether(p.x)).toBe(false);
    expect(Math.abs(p.x - 17)).toBeLessThan(1.1);
    expect(Math.abs(p.z - 8.5)).toBeLessThan(1.1);
    expect([...w.sim.blockEntities.values()].filter((b) => b.type === 'portal').length).toBe(2);
  });
  it('is instant in creative', () => {
    const w = world();
    w.frame(16, 10, 8);
    w.sim.lightPortal(16, 10, 8);
    const p = w.player(17, 10, 8.5, 'creative');
    w.run(8);
    expect(isNether(p.x)).toBe(true);
  });
});

describe('ruined portals', () => {
  it('are planned the same way every time and sit one per region', () => {
    const a = new WorldGenerator(77), b = new WorldGenerator(77);
    let n = 0;
    for (let rx = -3; rx <= 3; rx++) for (let rz = -3; rz <= 3; rz++) {
      const p = a.ruinedPortal(rx, rz)!, q = b.ruinedPortal(rx, rz)!;
      expect(p.x).toBe(q.x); expect(p.y).toBe(q.y); expect(p.z).toBe(q.z);
      expect(p.x - rx * PORTAL_GRID).toBeLessThan(400);
      expect(p.x - rx * PORTAL_GRID).toBeGreaterThanOrEqual(0);
      n++;
    }
    expect(n).toBe(49);
  });
  it('stamp obsidian, netherrack and a loot chest into the world', () => {
    const gen = new WorldGenerator(77);
    let found = 0;
    for (let rx = 0; rx < 4 && found < 2; rx++) {
      const p = gen.ruinedPortal(rx, 0)!;
      const seen: Record<string, number> = {};
      let chests = 0;
      for (let cx = (p.x >> 4) - 1; cx <= (p.x >> 4) + 1; cx++) for (let cz = (p.z >> 4) - 1; cz <= (p.z >> 4) + 1; cz++) {
        const g = gen.generate(cx, cz);
        const c = new ChunkData(cx, cz, g.blocks);
        chests += g.entities.filter((e) => e.type === 'chest' && Math.abs(cx * 16 + e.x - p.x) < 12 && Math.abs(e.y - p.y) < 3).length;
        for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) for (let y = Math.max(1, p.y - 8); y < p.y + 12; y++) { const k = getBlock(c.get(x, y, z)).key; seen[k] = (seen[k] ?? 0) + 1; }
      }
      expect((seen.obsidian ?? 0) + (seen.crying_obsidian ?? 0)).toBeGreaterThanOrEqual(6);
      expect((seen.netherrack ?? 0) + (seen.magma_block ?? 0)).toBeGreaterThan(10);
      expect(chests).toBe(1);
      found++;
    }
    expect(found).toBe(2);
  });
  it('fill chests from the loot table', () => {
    const ids = new Set<number>();
    let ench = 0;
    for (let s = 0; s < 200; s++) {
      const items = portalLoot(new Rng(s)).filter(Boolean);
      expect(items.length).toBeGreaterThanOrEqual(1);
      expect(items.length).toBeLessThanOrEqual(8);
      for (const it of items) { ids.add(it!.id); if (it!.en) { ench++; expect(Object.keys(it!.en).length).toBe(1); } }
    }
    expect(ids.has(I.IRON_NUGGET)).toBe(true);
    expect(ids.has(I.GOLDEN_APPLE)).toBe(true);
    expect(ids.has(B.OBSIDIAN)).toBe(true);
    expect(ench).toBeGreaterThan(50);
  });
});

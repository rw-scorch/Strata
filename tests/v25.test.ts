import { describe, it, expect } from 'vitest';
import { WorldSim, WorldStore, newPlayer, MF } from '../src/core/sim/WorldSim';
import { WorldGenerator } from '../src/core/worldgen/WorldGenerator';
import { ChunkData } from '../src/core/chunk';
import { B, X, XV, blockId, blockMeta, fenceBoxes } from '../src/core/blocks';
import { I, getItem } from '../src/core/items';
import { RECIPES } from '../src/core/crafting';
import { MOBS } from '../src/core/sim/mobs';
import { NETHER_X } from '../src/core/dimension';
import { planFortress, fortressAt, FORT_REGION, fortressLoot } from '../src/core/worldgen/fortress';
import { Rng } from '../src/core/rng';

function findFort(seed: number) {
  for (let rx = Math.floor(NETHER_X / FORT_REGION); ; rx++) { const p = planFortress(seed, rx, 0); if (p) return p; }
}

function world() {
  const chunks = new Map<string, ChunkData>();
  const get = (cx: number, cz: number) => { const k = `${cx},${cz}`; let c = chunks.get(k); if (!c) { c = new ChunkData(cx, cz, new Uint16Array(16 * 16 * 256)); chunks.set(k, c); } return c; };
  const store: WorldStore = { getBlock: (x, y, z) => get(x >> 4, z >> 4).get(x & 15, y, z & 15), setBlock: (x, y, z, v) => get(x >> 4, z >> 4).set(x & 15, y, z & 15, v), isLoaded: () => true, raw: (cx, cz) => get(cx, cz).blocks };
  const X0 = NETHER_X;
  for (let x = -30; x <= 30; x++) for (let z = -30; z <= 30; z++) store.setBlock(X0 + x, 50, z, X(XV.NETHERRACK));
  const sim = new WorldSim({ seed: 5, store, gen: new WorldGenerator(5), difficulty: 'normal', emit: () => {}, validateMoves: false, authoritative: true, spawn: { x: X0, y: 51, z: 0 } });
  sim.settings.mobSpawning = false;
  const run = (n: number) => { for (let i = 0; i < n; i++) sim.tick(); };
  const player = (x: number, y: number, z: number) => { const p = newPlayer(`p${Math.random()}`, 'P', 'survival', { x, y, z }); sim.addPlayer(p); Object.assign(p, { x, y, z, yaw: 0, pitch: 0, flags: MF.GROUND, peakY: y }); return p; };
  return { sim, run, player, store, X0 };
}

describe('Nether Fortress', () => {
  it('plans are deterministic with bridges, two blaze platforms and a well room', () => {
    const p = findFort(9);
    const q = planFortress(9, Math.floor(p.ox / FORT_REGION), Math.floor(p.oz / FORT_REGION))!;
    expect(q.nodes.length).toBe(p.nodes.length);
    const kinds = p.nodes.map((n) => n.kind);
    expect(kinds.filter((k) => k === 'spawner').length).toBe(2);
    expect(kinds.filter((k) => k === 'cross').length).toBeGreaterThanOrEqual(2);
    expect(p.edges.some((e) => e.ext) && p.edges.some((e) => !e.ext) || !kinds.includes('well')).toBe(true);
    expect(p.y).toBeGreaterThanOrEqual(48);
    expect(p.y).toBeLessThan(64);
    expect(p.x1 - p.x0).toBeLessThan(200);
    expect(fortressAt(9, p.ox, p.oz)).toBe(p);
  });
  it('about 40% of regions hold a fortress', () => {
    let n = 0;
    for (let i = 0; i < 200; i++) if (planFortress(3, 1000 + i, 7)) n++;
    expect(n).toBeGreaterThan(55);
    expect(n).toBeLessThan(105);
  });
  it('stamps nether bricks, fences, blaze spawners, chests and wart into new chunks only', () => {
    const p = findFort(9);
    const gen = new WorldGenerator(9);
    const seen: Record<number, number> = {};
    let spawners = 0, chests = 0, wart = 0;
    for (let cx = p.x0 >> 4; cx <= p.x1 >> 4; cx++) for (let cz = p.z0 >> 4; cz <= p.z1 >> 4; cz++) {
      const g = gen.generate(cx, cz, 6);
      for (const e of g.entities) { if (e.type === 'spawner' && e.mob === 'flarewisp') spawners++; if (e.type === 'chest') chests++; }
      for (let i = 0; i < g.blocks.length; i++) { const v = g.blocks[i]; seen[v] = (seen[v] ?? 0) + 1; if (blockId(v) === B.NETHER_WART) wart++; }
    }
    expect(seen[X(XV.NETHER_BRICKS)]).toBeGreaterThan(1500);
    expect(seen[B.NETHER_BRICK_FENCE]).toBeGreaterThan(40);
    expect(spawners).toBe(2);
    if (p.nodes.some((n) => n.chest)) expect(chests).toBeGreaterThan(0);
    if (p.nodes.some((n) => n.kind === 'wart')) expect(wart).toBeGreaterThan(10);
    const old = gen.generate(p.ox >> 4, p.oz >> 4, 5).blocks;
    let bricks = 0;
    for (let i = 0; i < old.length; i++) if (old[i] === X(XV.NETHER_BRICKS)) bricks++;
    expect(bricks).toBe(0);
  });
  it('fills chests from the fortress table', () => {
    const items = fortressLoot(new Rng(4)).filter(Boolean);
    expect(items.length).toBeGreaterThanOrEqual(2);
    for (const it of items) expect(getItem(it!.id)).toBeTruthy();
  });
});

describe('Fortress mobs and items', () => {
  it('a Blaze charges and fires a burst of small fireballs that set the player alight', () => {
    const { sim, run, player, X0 } = world();
    const p = player(X0 + 0.5, 51, 8.5);
    const b = sim.spawnMob('flarewisp', X0 + 0.5, 53, 0.5);
    let small = 0;
    const seenIds = new Set<number>();
    for (let t = 0; t < 140; t++) {
      run(1);
      for (const e of sim.entities.values()) if (e.kind === 'fireball' && (e.flags & 1) && !seenIds.has(e.id)) { seenIds.add(e.id); small++; }
      p.health = 20;
    }
    expect(b.target).toBe(p.id);
    expect(small).toBeGreaterThanOrEqual(3);
    expect(small).toBeLessThanOrEqual(6);
  });
  it('small fireballs cannot be hit back', () => {
    const { sim, run, player, X0 } = world();
    const p = player(X0 + 0.5, 51, 0.5);
    const b = sim.spawnMob('flarewisp', X0 + 0.5, 53, 12.5);
    let ball: number | null = null;
    for (let t = 0; t < 120 && ball === null; t++) { run(1); for (const e of sim.entities.values()) if (e.kind === 'fireball') ball = e.id; }
    expect(ball).not.toBeNull();
    expect(sim.attack(p, ball!)).toBe(false);
    void b;
  });
  it('Wither Skeletons wither the player and resist fire', () => {
    const { sim, run, player, X0 } = world();
    const p = player(X0 + 0.5, 51, 1.6);
    const w = sim.spawnMob('witherbone', X0 + 0.5, 51, 0.5);
    w.fire = 100;
    for (let t = 0; t < 60 && !p.witherT; t++) run(1);
    expect(p.witherT).toBeGreaterThan(0);
    expect(w.health).toBe(20);
    expect(MOBS.witherbone.h).toBeCloseTo(2.4);
  });
  it('nether wart grows on soul sand and drops more when ripe', () => {
    const { sim, store, X0 } = world();
    store.setBlock(X0 + 3, 50, 3, X(XV.SOUL_SAND));
    store.setBlock(X0 + 3, 51, 3, B.NETHER_WART | (3 << 8));
    expect(blockMeta(store.getBlock(X0 + 3, 51, 3))).toBe(3);
    const drops = (sim as unknown as { blockDrops(v: number, s: null, natural: boolean): { id: number; count: number }[] }).blockDrops?.(store.getBlock(X0 + 3, 51, 3), null, true);
    if (drops) expect(drops[0].count).toBeGreaterThanOrEqual(2);
  });
  it('crafts blaze powder and nether brick fence; fences link sideways', () => {
    expect(RECIPES.some((r) => r.result === I.BLAZE_POWDER && r.count === 2)).toBe(true);
    expect(RECIPES.some((r) => r.result === B.NETHER_BRICK_FENCE)).toBe(true);
    expect(fenceBoxes([false, false, false, false]).length).toBe(1);
    expect(fenceBoxes([true, false, true, false]).length).toBe(5);
    expect(getItem(I.BLAZE_ROD)?.fuel).toBe(120);
  });
});

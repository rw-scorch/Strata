import { describe, it, expect } from 'vitest';
import { WorldSim, WorldStore, newPlayer, MF } from '../src/core/sim/WorldSim';
import { WorldGenerator } from '../src/core/worldgen/WorldGenerator';
import { ChunkData } from '../src/core/chunk';
import { B, X, XV, getBlock, blockId } from '../src/core/blocks';
import { I } from '../src/core/items';
import { NETHER_X, NETHER_LAVA } from '../src/core/dimension';
import { NETHER_BIOMES } from '../src/core/worldgen/nether';
import { planNetherPortal, PORTAL_GRID } from '../src/core/worldgen/ruinedPortal';

function world(gen = new WorldGenerator(5)) {
  const chunks = new Map<string, ChunkData>();
  const get = (cx: number, cz: number) => { const k = `${cx},${cz}`; let c = chunks.get(k); if (!c) { c = new ChunkData(cx, cz, new Uint16Array(16 * 16 * 256)); chunks.set(k, c); } return c; };
  const store: WorldStore = { getBlock: (x, y, z) => get(x >> 4, z >> 4).get(x & 15, y, z & 15), setBlock: (x, y, z, v) => get(x >> 4, z >> 4).set(x & 15, y, z & 15, v), isLoaded: () => true, raw: (cx, cz) => get(cx, cz).blocks };
  const X0 = NETHER_X;
  for (let x = -30; x <= 30; x++) for (let z = -30; z <= 30; z++) store.setBlock(X0 + x, 50, z, X(XV.NETHERRACK));
  const sim = new WorldSim({ seed: 5, store, gen, difficulty: 'normal', emit: () => {}, validateMoves: false, authoritative: true, spawn: { x: X0, y: 51, z: 0 } });
  sim.settings.mobSpawning = false;
  const run = (n: number) => { for (let i = 0; i < n; i++) sim.tick(); };
  const player = (x: number, y: number, z: number) => { const p = newPlayer(`p${Math.random()}`, 'P', 'survival', { x, y, z }); sim.addPlayer(p); Object.assign(p, { x, y, z, yaw: 0, pitch: 0, flags: MF.GROUND, peakY: y }); return p; };
  return { sim, run, player, store, X0 };
}

describe('Nether biomes', () => {
  it('all five biomes appear and are stable', () => {
    const gen = new WorldGenerator(31);
    const seen = new Set<string>();
    for (let x = -4000; x < 4000; x += 97) for (let z = -4000; z < 4000; z += 97) seen.add(gen.netherBiome(NETHER_X + x, z));
    for (const b of NETHER_BIOMES) expect(seen.has(b)).toBe(true);
    expect(new WorldGenerator(31).netherBiome(NETHER_X + 123, 456)).toBe(gen.netherBiome(NETHER_X + 123, 456));
  });
  it('each biome gets its own floor and growth', () => {
    const gen = new WorldGenerator(31);
    const want: Record<string, string[]> = { crimson_forest: ['crimson_nylium', 'crimson_stem'], warped_forest: ['warped_nylium', 'warped_stem'], soul_sand_valley: ['soul_sand'], basalt_deltas: ['basalt', 'blackstone'] };
    for (const [biome, keys] of Object.entries(want)) {
      const found: Record<string, number> = {};
      let chunks = 0;
      for (let x = -4000; x < 4000 && chunks < 8; x += 61) for (let z = -4000; z < 4000 && chunks < 8; z += 61) {
        const wx = NETHER_X + x;
        if (gen.netherBiome(wx + 8, z + 8) !== biome || gen.netherBiome(wx, z) !== biome) continue;
        chunks++;
        const c = new ChunkData(wx >> 4, z >> 4, gen.generate(wx >> 4, z >> 4).blocks);
        for (let i = 0; i < 16 * 16 * 128; i++) { const k = getBlock(c.blocks[i]).key; found[k] = (found[k] ?? 0) + 1; }
      }
      expect(chunks).toBeGreaterThan(0);
      for (const k of keys) expect(found[k] ?? 0, `${biome} ${k}`).toBeGreaterThan(0);
    }
  });
  it('places Nether ruined portals on the lava sea with blackstone', () => {
    const gen = new WorldGenerator(31);
    let ok = 0;
    for (let rx = Math.floor(NETHER_X / PORTAL_GRID); ok < 2; rx++) {
      const p = planNetherPortal(31, rx, 0)!;
      if (gen.netherBiome(p.x, p.z) === 'basalt_deltas') continue;
      const seen: Record<string, number> = {};
      for (let cx = (p.x >> 4) - 1; cx <= (p.x >> 4) + 1; cx++) for (let cz = (p.z >> 4) - 1; cz <= (p.z >> 4) + 1; cz++) {
        const c = new ChunkData(cx, cz, gen.generate(cx, cz).blocks);
        for (let y = NETHER_LAVA - 2; y < NETHER_LAVA + 12; y++) for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) { const k = getBlock(c.get(x, y, z)).key; seen[k] = (seen[k] ?? 0) + 1; }
      }
      expect((seen.obsidian ?? 0) + (seen.crying_obsidian ?? 0)).toBeGreaterThanOrEqual(6);
      expect(seen.stone_bricks ?? 0).toBe(0);
      ok++;
    }
  });
});

describe('Nether mobs', () => {
  it('Zombified Hogmen ignore you until one is hit, then the pack attacks', () => {
    const w = world();
    const p = w.player(w.X0 + 0.5, 51, 0.5);
    const a = w.sim.spawnMob('cinderhusk', w.X0 + 4.5, 51, 0.5), b = w.sim.spawnMob('cinderhusk', w.X0 + 8.5, 51, 4.5);
    w.run(60);
    expect(p.health).toBe(20);
    w.sim.hurtMob(a, 1, p.id, 1, 0);
    expect(b.target).toBe(p.id);
    w.run(160);
    expect(p.health).toBeLessThan(20);
  });
  it('Ghasts shoot fireballs that explode, and a hit sends them back', () => {
    const w = world();
    const p = w.player(w.X0 + 0.5, 51, 0.5);
    const g = w.sim.spawnMob('wailer', w.X0 + 0.5, 54, -18);
    let fb: { kind: string; vz: number; shooterP?: string; id: number } | undefined;
    for (let i = 0; i < 120 && !fb; i++) { w.run(1); g.x = w.X0 + 0.5; g.y = 54; g.z = -18; fb = [...w.sim.entities.values()].find((e) => e.kind === 'fireball'); }
    expect(fb).toBeTruthy();
    expect(fb!.vz).toBeGreaterThan(0);
    p.yaw = 0; p.pitch = 0.05;
    w.run(8);
    const near = [...w.sim.entities.values()].find((e) => e.kind === 'fireball')!;
    near.x = p.x; near.y = p.y + 1.6; near.z = p.z - 2;
    p.lastAttack = -1e9;
    expect(w.sim.attack(p, near.id)).toBe(true);
    expect(near.vz).toBeLessThan(0);
    expect(near.shooterP).toBe(p.id);
    let gone = false;
    for (let i = 0; i < 60 && !gone; i++) { w.run(1); g.x = w.X0 + 0.5; g.y = 54; g.z = -18; gone = !w.sim.entities.has(g.id); }
    expect(gone).toBe(true);
  });
  it('Magma Cubes split into smaller cubes', () => {
    const w = world();
    const p = w.player(w.X0 + 20.5, 51, 20.5);
    const m = w.sim.spawnMob('emberslime', w.X0 + 0.5, 51, 0.5, 4);
    expect(m.health).toBe(16);
    expect(m.hw).toBeCloseTo(1.04);
    w.sim.hurtMob(m, 100, p.id, 0, 0);
    const kids = [...w.sim.entities.values()].filter((e) => e.type === 'emberslime');
    expect(kids.length).toBeGreaterThanOrEqual(2);
    expect(kids.every((k) => k.size === 2 && k.health === 4)).toBe(true);
  });
  it('Striders stand on lava without burning and shiver on land', () => {
    const w = world();
    for (let x = -6; x <= 6; x++) for (let z = -6; z <= 6; z++) { w.store.setBlock(w.X0 + x, 50, z, B.LAVA); w.store.setBlock(w.X0 + x, 49, z, B.LAVA); }
    w.player(w.X0 + 12.5, 51, 12.5);
    const s = w.sim.spawnMob('lavastrider', w.X0 + 0.5, 50.2, 0.5);
    w.run(200);
    expect(w.sim.entities.has(s.id)).toBe(true);
    expect(s.health).toBe(20);
    expect(s.y).toBeGreaterThan(50.4);
    expect(s.flags & 32).toBe(0);
    const t = w.sim.spawnMob('lavastrider', w.X0 + 20.5, 51, 20.5);
    w.run(5);
    expect(t.flags & 32).toBe(32);
  });
});

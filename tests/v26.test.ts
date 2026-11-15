import { describe, it, expect } from 'vitest';
import { WorldSim, WorldStore, newPlayer, MF, fireproof } from '../src/core/sim/WorldSim';
import { WorldGenerator } from '../src/core/worldgen/WorldGenerator';
import { ChunkData } from '../src/core/chunk';
import { B, X, XV, blockId } from '../src/core/blocks';
import { I, toolId, armorId, getItem } from '../src/core/items';
import { NETHER_X } from '../src/core/dimension';
import { planRegion, FORT_REGION } from '../src/core/worldgen/fortress';
import { bastionLoot, type BastionPlan } from '../src/core/worldgen/bastion';
import { smithResult } from '../src/core/smithing';
import { Rng } from '../src/core/rng';

function findBastion(gen: WorldGenerator, seed: number, kind?: string): BastionPlan {
  const bio = (x: number, z: number) => gen.netherBiome(x, z);
  for (let rx = Math.floor(NETHER_X / FORT_REGION); ; rx++) for (let rz = -3; rz <= 3; rz++) { const b = planRegion(seed, rx, rz, bio).bastion; if (b && (!kind || b.kind === kind)) return b; }
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

describe('Bastion Remnants', () => {
  it('all four kinds appear and regions split between fortresses and bastions', () => {
    const gen = new WorldGenerator(11);
    const bio = (x: number, z: number) => gen.netherBiome(x, z);
    const kinds = new Set<string>();
    let f = 0, b = 0;
    for (let i = 0; i < 160; i++) { const p = planRegion(11, 1100 + i, 3, bio); if (p.fort) f++; if (p.bastion) { b++; kinds.add(p.bastion.kind); } }
    expect(kinds.size).toBe(4);
    expect(b).toBeGreaterThan(f * 0.9);
    expect(f + b).toBe(160);
  });
  for (const kind of ['housing', 'stables', 'treasure', 'bridge']) {
    it(`stamps the ${kind} bastion with bricks, chests and guards`, () => {
      const gen = new WorldGenerator(13);
      const p = findBastion(gen, 13, kind);
      let bricks = 0, chests = 0, mobs = 0, treasure = false;
      const types = new Set<string>();
      for (let cx = p.x0 >> 4; cx <= p.x1 >> 4; cx++) for (let cz = p.z0 >> 4; cz <= p.z1 >> 4; cz++) {
        const g = gen.generate(cx, cz, 7);
        for (const v of g.blocks) if (v === X(XV.POLISHED_BLACKSTONE_BRICKS)) bricks++;
        for (const e of g.entities) {
          if (e.type === 'chest') { chests++; if (e.items.some((s) => s?.id === I.UPGRADE_TEMPLATE)) treasure = true; }
          if (e.type === 'mob') { mobs++; types.add(e.mob!); }
        }
      }
      expect(bricks).toBeGreaterThan(1500);
      expect(chests).toBeGreaterThanOrEqual(1);
      expect(mobs).toBeGreaterThanOrEqual(3);
      if (kind === 'treasure') { expect(treasure).toBe(true); expect(types.has('piglin_brute')).toBe(true); }
      if (kind === 'stables') expect(types.has('hoglin')).toBe(true);
      const old = gen.generate(p.cx >> 4, p.cz >> 4, 6).blocks;
      expect(old.filter((v) => v === X(XV.POLISHED_BLACKSTONE_BRICKS)).length).toBe(0);
    });
  }
  it('treasure chests always hold the upgrade template', () => {
    for (let i = 0; i < 10; i++) expect(bastionLoot(new Rng(i), true).some((s) => s?.id === I.UPGRADE_TEMPLATE)).toBe(true);
  });
});

describe('Cinderite', () => {
  it('ancient debris only appears in new chunks and stays buried low down', () => {
    const gen = new WorldGenerator(21);
    let n6 = 0, n7 = 0, low = 0;
    for (let i = 0; i < 24; i++) {
      const cx = (NETHER_X >> 4) + 50 + i;
      for (const v of gen.generate(cx, 40, 6).blocks) if (v === X(XV.ANCIENT_DEBRIS)) n6++;
      const b = gen.generate(cx, 40, 7).blocks;
      for (let k = 0; k < b.length; k++) if (b[k] === X(XV.ANCIENT_DEBRIS)) { n7++; const y = Math.floor(k / 256); if (y < 24) low++; }
    }
    expect(n6).toBe(0);
    expect(n7).toBeGreaterThan(5);
    expect(low).toBeGreaterThan(0);
  });
  it('smithing turns diamond gear into cinderite and keeps enchantments', () => {
    const out = smithResult({ id: I.UPGRADE_TEMPLATE, count: 1 }, { id: toolId(4, 0), count: 1, dmg: 40, en: { efficiency: 3 } }, { id: I.CINDERITE_INGOT, count: 2 });
    expect(out?.id).toBe(toolId(5, 0));
    expect(out?.en?.efficiency).toBe(3);
    expect(getItem(toolId(5, 0))?.name).toBe('Netherite Pickaxe');
    expect(smithResult({ id: I.UPGRADE_TEMPLATE, count: 1 }, { id: armorId(3, 1), count: 1 }, { id: I.CINDERITE_INGOT, count: 1 })?.id).toBe(armorId(4, 1));
    expect(smithResult(null, { id: toolId(4, 0), count: 1 }, { id: I.CINDERITE_INGOT, count: 1 })).toBeNull();
    expect(fireproof(toolId(5, 3))).toBe(true);
  });
  it('the smithing table screen performs the upgrade', () => {
    const { sim, player, store, X0 } = world();
    const p = player(X0 + 0.5, 51, 0.5);
    store.setBlock(X0 + 2, 51, 0, B.SMITHING_TABLE);
    expect(sim.use(p, X0 + 2, 51, 0, 0, 1, 0)).toBe(true);
    expect(p.screen.type).toBe('smith');
    sim.setWork(p, [{ id: I.UPGRADE_TEMPLATE, count: 1 }, { id: armorId(3, 0), count: 1 }, { id: I.CINDERITE_INGOT, count: 1 }]);
    expect(sim.anvil(p, null)).toBe(true);
    expect(p.inv.cursor?.id).toBe(armorId(4, 0));
  });
});

describe('Piglins and Hoglins', () => {
  it('piglins attack players without gold but leave gold wearers alone', () => {
    const { sim, run, player, X0 } = world();
    const p = player(X0 + 0.5, 51, 4.5);
    const g = sim.spawnMob('piglin', X0 + 0.5, 51, 0.5);
    run(40);
    expect(g.target).toBe(p.id);
    const { sim: s2, run: r2, player: pl2, X0: x2 } = world();
    const q = pl2(x2 + 0.5, 51, 4.5);
    q.inv.armor[0] = { id: armorId(2, 0), count: 1 };
    const g2 = s2.spawnMob('piglin', x2 + 0.5, 51, 0.5);
    r2(60);
    expect(g2.target ?? null).toBeNull();
  });
  it('piglins barter for gold ingots', () => {
    const { sim, run, player, X0 } = world();
    const p = player(X0 + 0.5, 51, 6.5);
    p.inv.armor[3] = { id: armorId(2, 3), count: 1 };
    const g = sim.spawnMob('piglin', X0 + 0.5, 51, 0.5);
    sim.spawnItem(X0 + 0.5, 51.2, 0.9, { id: I.GOLD_INGOT, count: 1 }, 0, 0, 0, 0);
    let admired = false;
    for (let t = 0; t < 200; t++) { run(1); if (g.admire) admired = true; }
    expect(admired).toBe(true);
    const drops = [...sim.entities.values()].filter((e) => e.kind === 'item' && e.item!.id !== I.GOLD_INGOT);
    expect(drops.length).toBeGreaterThanOrEqual(1);
  });
  it('hoglins flee warped fungus', () => {
    const { sim, run, player, store, X0 } = world();
    player(X0 + 0.5, 51, 3.5);
    store.setBlock(X0 + 2, 51, 0, B.WARPED_FUNGUS);
    const h = sim.spawnMob('hoglin', X0 + 0.5, 51, 0.5);
    run(30);
    expect(h.scared).not.toBeNull();
  });
  it('piglins turn into Zombified Piglins in the Overworld', () => {
    const { sim, run, store, player } = world();
    for (let x = -5; x <= 5; x++) for (let z = -5; z <= 5; z++) store.setBlock(x, 60, z, B.STONE);
    const p = player(3.5, 61, 3.5);
    p.mode = 'creative';
    sim.spawnMob('piglin', 0.5, 61, 0.5);
    run(320);
    expect([...sim.entities.values()].some((e) => e.type === 'cinderhusk')).toBe(true);
    expect([...sim.entities.values()].some((e) => e.type === 'piglin')).toBe(false);
  });
});

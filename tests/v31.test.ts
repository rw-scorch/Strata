import { describe, it, expect } from 'vitest';
import { WorldSim, WorldStore, newPlayer, MF } from '../src/core/sim/WorldSim';
import { WorldGenerator } from '../src/core/worldgen/WorldGenerator';
import { ChunkData } from '../src/core/chunk';
import { B, SB, getBlock, sp, SPECIES, tix, blockId } from '../src/core/blocks';
import { getItem } from '../src/core/items';
import { RECIPES } from '../src/core/crafting';
import { BIOME_LEVEL, GEN_LEVEL } from '../src/core/worldgen/genLevel';

function world() {
  const chunks = new Map<string, ChunkData>();
  const get = (cx: number, cz: number) => { const k = `${cx},${cz}`; let c = chunks.get(k); if (!c) { c = new ChunkData(cx, cz, new Uint16Array(16 * 16 * 256)); chunks.set(k, c); } return c; };
  const store: WorldStore = { getBlock: (x, y, z) => get(x >> 4, z >> 4).get(x & 15, y, z & 15), setBlock: (x, y, z, v) => get(x >> 4, z >> 4).set(x & 15, y, z & 15, v), isLoaded: () => true, raw: (cx, cz) => get(cx, cz).blocks };
  for (let x = -30; x <= 30; x++) for (let z = -30; z <= 30; z++) store.setBlock(x, 60, z, B.GRASS);
  const sim = new WorldSim({ seed: 5, store, gen: new WorldGenerator(5), difficulty: 'normal', emit: () => {}, validateMoves: false, authoritative: true, spawn: { x: 0, y: 61, z: 0 } });
  sim.settings.mobSpawning = false;
  const run = (n: number) => { for (let i = 0; i < n; i++) sim.tick(); };
  const player = (x: number, y: number, z: number, mode: 'survival' | 'creative' = 'survival') => { const p = newPlayer(`p${Math.random()}`, 'P', mode, { x, y, z }); sim.addPlayer(p); Object.assign(p, { x, y, z, yaw: 0, pitch: 0, flags: MF.GROUND, peakY: y }); return p; };
  return { sim, run, player, store };
}

describe('new wood and ground blocks', () => {
  it('are variants of existing blocks with their own names, textures and items', () => {
    expect(getBlock(sp(B.OAK_LOG, SPECIES.ACACIA)).key).toBe('acacia_log');
    expect(getBlock(sp(B.OAK_LEAVES, SPECIES.DARK_OAK)).render).toBe('leaves');
    expect(tix(sp(B.SAND, 1))).toBe(SB.RED_SAND);
    expect(getItem(SB.ACACIA_PLANKS)?.places).toBe(B.OAK_PLANKS);
    expect(getItem(SB.PODZOL)?.name).toBe('Podzol');
    expect(RECIPES.some((r) => r.result === SB.ACACIA_PLANKS)).toBe(true);
    expect(RECIPES.some((r) => r.result === SB.RED_SANDSTONE)).toBe(true);
  });

  it('place as their variant and drop their own item', () => {
    const { sim, player, store, run } = world();
    const p = player(0.5, 61, 3.5, 'creative');
    p.inv.slots[0] = { id: SB.ACACIA_LOG, count: 10 }; p.inv.selected = 0;
    expect(sim.use(p, 0, 60, 0, 0, 1, 0)).toBe(true);
    expect(tix(store.getBlock(0, 61, 0))).toBe(SB.ACACIA_LOG);
    p.mode = 'survival';
    sim.breakBlock(0, 61, 0, p);
    run(2);
    expect([...sim.entities.values()].some((e) => e.kind === 'item' && e.item?.id === SB.ACACIA_LOG)).toBe(true);
  });

  it('grow acacia from one sapling and dark oak from four', () => {
    const { sim, store } = world();
    store.setBlock(0, 61, 0, sp(B.OAK_SAPLING, SPECIES.ACACIA));
    expect(sim.growTree(0, 61, 0, B.OAK_SAPLING, SPECIES.ACACIA)).toBe(true);
    let acacia = 0;
    for (let x = -6; x <= 6; x++) for (let z = -6; z <= 6; z++) for (let y = 61; y < 75; y++) if (tix(store.getBlock(x, y, z)) === SB.ACACIA_LOG) acacia++;
    expect(acacia).toBeGreaterThan(4);
    for (const [a, c] of [[10, 10], [11, 10], [10, 11], [11, 11]]) store.setBlock(a, 61, c, sp(B.OAK_SAPLING, SPECIES.DARK_OAK));
    expect(sim.growTree(10, 61, 10, B.OAK_SAPLING, SPECIES.DARK_OAK)).toBe(true);
    expect(tix(store.getBlock(10, 62, 10))).toBe(SB.DARK_OAK_LOG);
    expect(tix(store.getBlock(11, 62, 11))).toBe(SB.DARK_OAK_LOG);
    store.setBlock(20, 61, 20, sp(B.OAK_SAPLING, SPECIES.DARK_OAK));
    expect(sim.growTree(20, 61, 20, B.OAK_SAPLING, SPECIES.DARK_OAK)).toBe(false);
  });

  it('grass does not spread onto coarse dirt or podzol', () => {
    const { sim, store, run } = world();
    for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) store.setBlock(x, 60, z, (x + z) & 1 ? sp(B.DIRT, 1) : sp(B.DIRT, 2));
    store.setBlock(0, 60, 0, B.GRASS);
    run(3000);
    for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) if (x || z) expect(blockId(store.getBlock(x, 60, z))).toBe(B.DIRT);
  });
});

describe('biomes part 1', () => {
  it('appear in new land only', () => {
    const g = new WorldGenerator(777);
    const seen = new Set<string>(), old = new Set<string>();
    for (let x = -2000; x <= 2000; x += 24) for (let z = -2000; z <= 2000; z += 24) {
      seen.add(g.column(x, z).biome.id);
      old.add(BIOMES_AT(g, x, z, BIOME_LEVEL - 1));
    }
    for (const b of ['savanna', 'badlands', 'dark_forest', 'meadow', 'old_growth_taiga']) { expect(seen.has(b)).toBe(true); expect(old.has(b)).toBe(false); }
  });

  it('build their terrain and trees', () => {
    const g = new WorldGenerator(777);
    const want: Record<string, number> = { savanna: SB.ACACIA_LOG, dark_forest: SB.DARK_OAK_LOG, badlands: SB.RED_SAND };
    for (const [id, block] of Object.entries(want)) {
      let found = false;
      for (let x = -1500; x <= 1500 && !found; x += 32) for (let z = -1500; z <= 1500 && !found; z += 32) {
        if (g.column(x + 8, z + 8).biome.id !== id) continue;
        const b = g.generate(Math.floor(x / 16), Math.floor(z / 16), GEN_LEVEL).blocks;
        for (let i = 0; i < b.length; i++) if (tix(b[i]) === block) { found = true; break; }
      }
      expect(found, id).toBe(true);
    }
  });
});

function BIOMES_AT(g: WorldGenerator, x: number, z: number, lv: number): string { return g.biomeAt(x, z, lv).id; }

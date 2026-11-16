import { describe, it, expect } from 'vitest';
import { WorldSim, WorldStore } from '../src/core/sim/WorldSim';
import { WorldGenerator } from '../src/core/worldgen/WorldGenerator';
import { ChunkData } from '../src/core/chunk';
import { B, SB, X, XV, sp, SPECIES, tix, getBlock, SHAPE_MATS, slabItem, stairsItem, isWaterPlant } from '../src/core/blocks';
import { getItem, ITEMS } from '../src/core/items';
import { RECIPES } from '../src/core/crafting';
import { BIOME2_LEVEL, GEN_LEVEL } from '../src/core/worldgen/genLevel';

describe('biomes part 2 blocks', () => {
  it('adds cherry and mangrove woods, coral and mushroom blocks', () => {
    expect(getBlock(sp(B.OAK_LEAVES, SPECIES.CHERRY)).tint).toBe(null);
    expect(getBlock(sp(B.OAK_LOG, SPECIES.MANGROVE)).key).toBe('mangrove_log');
    expect(getBlock(X(XV.MYCELIUM)).key).toBe('mycelium');
    expect(isWaterPlant(sp(B.SEAGRASS, 3) & 255)).toBe(true);
    expect(getBlock(sp(B.SEAGRASS, 3)).key).toBe('bubble_coral');
    expect(RECIPES.some((r) => r.result === SB.CHERRY_PLANKS)).toBe(true);
  });

  it('gives every wood stairs and slabs without clashing item ids', () => {
    for (const k of ['acacia', 'dark_oak', 'cherry', 'mangrove']) {
      const i = SHAPE_MATS.findIndex((m) => m.key === k);
      expect(i).toBeGreaterThan(0);
      expect(getItem(slabItem(i))?.name).toContain('Slab');
      expect(getItem(stairsItem(i))?.name).toContain('Stairs');
      expect(RECIPES.some((r) => r.result === stairsItem(i))).toBe(true);
    }
    for (let i = 0; i < SHAPE_MATS.length; i++) { expect(ITEMS[slabItem(i)]?.key).toBe(`${SHAPE_MATS[i].key}_slab`); expect(ITEMS[stairsItem(i)]?.key).toBe(`${SHAPE_MATS[i].key}_stairs`); }
  });

  it('grows cherry and mangrove trees from saplings', () => {
    const chunks = new Map<string, ChunkData>();
    const get = (cx: number, cz: number) => { const k = `${cx},${cz}`; let c = chunks.get(k); if (!c) { c = new ChunkData(cx, cz, new Uint16Array(16 * 16 * 256)); chunks.set(k, c); } return c; };
    const store: WorldStore = { getBlock: (x, y, z) => get(x >> 4, z >> 4).get(x & 15, y, z & 15), setBlock: (x, y, z, v) => get(x >> 4, z >> 4).set(x & 15, y, z & 15, v), isLoaded: () => true, raw: (cx, cz) => get(cx, cz).blocks };
    for (let x = -20; x <= 40; x++) for (let z = -20; z <= 20; z++) store.setBlock(x, 60, z, B.GRASS);
    const sim = new WorldSim({ seed: 5, store, gen: new WorldGenerator(5), difficulty: 'peaceful', emit: () => {}, validateMoves: false, authoritative: true, spawn: { x: 0, y: 61, z: 0 } });
    for (const [spc, x, logId] of [[SPECIES.CHERRY, 0, SB.CHERRY_LOG], [SPECIES.MANGROVE, 25, SB.MANGROVE_LOG]] as const) {
      store.setBlock(x, 61, 0, sp(B.OAK_SAPLING, spc));
      expect(sim.growTree(x, 61, 0, B.OAK_SAPLING, spc)).toBe(true);
      let n = 0;
      for (let dx = -7; dx <= 7; dx++) for (let dz = -7; dz <= 7; dz++) for (let y = 58; y < 80; y++) if (tix(store.getBlock(x + dx, y, dz)) === logId) n++;
      expect(n).toBeGreaterThan(4);
    }
  });
});

describe('biomes part 2', () => {
  const ids = ['cherry_grove', 'mangrove_swamp', 'mushroom_fields', 'ice_spikes', 'warm_ocean'];
  it('appear only in land generated at level 12', () => {
    const g = new WorldGenerator(777);
    const now = new Set<string>(), before = new Set<string>();
    for (let x = -2400; x <= 2400; x += 24) for (let z = -2400; z <= 2400; z += 24) { now.add(g.biomeAt(x, z).id); before.add(g.biomeAt(x, z, BIOME2_LEVEL - 1).id); }
    for (const b of ids) { expect(now.has(b), b).toBe(true); expect(before.has(b), b).toBe(false); }
  });

  it('build their signature blocks', () => {
    const g = new WorldGenerator(777);
    const want: Record<string, number[]> = {
      cherry_grove: [SB.CHERRY_LEAVES], mangrove_swamp: [SB.MANGROVE_LOG], mushroom_fields: [600 + XV.MYCELIUM],
      ice_spikes: [B.PACKED_ICE], warm_ocean: [600 + XV.TUBE_CORAL_BLOCK, 600 + XV.BRAIN_CORAL_BLOCK, 600 + XV.BUBBLE_CORAL_BLOCK, 600 + XV.FIRE_CORAL_BLOCK, 600 + XV.HORN_CORAL_BLOCK],
    };
    for (const [id, blocks] of Object.entries(want)) {
      let found = false;
      for (let r = 0; r < 2400 && !found; r += 16) for (let a = 0; a < 16 && !found; a++) {
        const x = Math.round(Math.cos(a / 16 * Math.PI * 2) * r), z = Math.round(Math.sin(a / 16 * Math.PI * 2) * r);
        if (g.biomeAt(x, z).id !== id) continue;
        const b = g.generate(Math.floor(x / 16), Math.floor(z / 16), GEN_LEVEL).blocks;
        for (let i = 0; i < b.length && !found; i++) if (blocks.includes(tix(b[i]))) found = true;
      }
      expect(found, id).toBe(true);
    }
  });
});

import { describe, it, expect } from 'vitest';
import { WorldGenerator } from '../src/core/worldgen/WorldGenerator';
import { GenRegistry, GEN_LEVEL, LEGACY_LEVEL, LEGACY_RADIUS } from '../src/core/worldgen/genLevel';
import { B, BLOCKS } from '../src/core/blocks';

const count = (b: Uint16Array, ids: number[]) => { let n = 0; for (const v of b) if (ids.includes(v & 0xff)) n++; return n; };

describe('generation levels', () => {
  it('legacy level leaves out newer features and is otherwise identical', () => {
    const g = new WorldGenerator(777);
    let newer = 0, diffOther = 0;
    for (const [cx, cz] of [[-3, -3], [-3, -2], [2, -3], [26, -26], [27, -26]]) {
      const a = g.generate(cx, cz, LEGACY_LEVEL).blocks, b = g.generate(cx, cz, GEN_LEVEL).blocks;
      expect(count(a, [B.KELP, B.KELP_PLANT, B.SEAGRASS, B.VINE, B.REDSTONE_ORE])).toBe(0);
      newer += count(b, [B.KELP, B.KELP_PLANT, B.SEAGRASS, B.VINE, B.REDSTONE_ORE]);
      for (let i = 0; i < a.length; i++) {
        const x = a[i] & 0xff, y = b[i] & 0xff;
        if (x === y) continue;
        if (BLOCKS[x]?.render === 'cross' || BLOCKS[y]?.render === 'cross') continue;
        if ([B.KELP, B.KELP_PLANT, B.SEAGRASS, B.VINE, B.REDSTONE_ORE, B.WATER, B.JUNGLE_LEAVES, B.JUNGLE_LOG, B.SPRUCE_LEAVES, B.SPRUCE_LOG, B.DIRT, B.GRASS, B.TALL_GRASS, B.FERN, 0].includes(x) || [B.KELP, B.KELP_PLANT, B.SEAGRASS, B.VINE, B.REDSTONE_ORE, B.JUNGLE_LEAVES, B.JUNGLE_LOG, B.SPRUCE_LEAVES, B.SPRUCE_LOG, B.DIRT].includes(y)) continue;
        diffOther++;
      }
    }
    expect(newer).toBeGreaterThan(0);
    expect(diffOther).toBe(0);
  });

  it('keeps explored areas on their old level and new land on the new one', () => {
    const recorded: Record<string, number> = {};
    const reg = new GenRegistry(LEGACY_LEVEL, [[0, 0], [40, 40]], undefined, (k) => recorded[k], (k, v) => { recorded[k] = v; });
    expect(reg.level(3, -5)).toBe(LEGACY_LEVEL);
    expect(reg.level(LEGACY_RADIUS + 1, 0)).toBe(GEN_LEVEL);
    expect(reg.level(45, 38)).toBe(LEGACY_LEVEL);
    expect(recorded['3,-5']).toBe(LEGACY_LEVEL);
    const again = new GenRegistry(LEGACY_LEVEL, [], reg.encode());
    expect(again.level(3, -5)).toBe(LEGACY_LEVEL);
    expect(again.level(LEGACY_RADIUS + 1, 0)).toBe(GEN_LEVEL);
    expect(new GenRegistry(GEN_LEVEL).level(0, 0)).toBe(GEN_LEVEL);
  });
});

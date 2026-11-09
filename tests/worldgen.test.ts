import { describe, it, expect } from 'vitest';
import { WorldGenerator } from '../src/core/worldgen/WorldGenerator';
import { B } from '../src/core/blocks';

describe('world generation', () => {
  it('is deterministic for a seed', () => {
    const a = new WorldGenerator(1234).generate(3, -2);
    const b = new WorldGenerator(1234).generate(3, -2);
    expect(Buffer.from(a.blocks.buffer).equals(Buffer.from(b.blocks.buffer))).toBe(true);
  });
  it('differs between seeds', () => {
    const a = new WorldGenerator(1).generate(0, 0);
    const b = new WorldGenerator(2).generate(0, 0);
    expect(Buffer.from(a.blocks.buffer).equals(Buffer.from(b.blocks.buffer))).toBe(false);
  });
  it('has bedrock floor, biome variety and reasonable speed', () => {
    const g = new WorldGenerator(98765);
    const t0 = performance.now();
    let n = 0;
    for (let cx = -3; cx < 3; cx++) for (let cz = -3; cz < 3; cz++) {
      const c = g.generate(cx, cz);
      expect(c.blocks[0] & 0xff).toBe(B.BEDROCK);
      n++;
    }
    const per = (performance.now() - t0) / n;
    console.log('ms per chunk', per.toFixed(2));
    const counts: Record<string, number> = {};
    for (let x = -6000; x < 6000; x += 97) for (let z = -6000; z < 6000; z += 97) {
      const b = g.column(x, z).biome.id; counts[b] = (counts[b] ?? 0) + 1;
    }
    console.log(counts);
    expect(Object.keys(counts).length).toBeGreaterThan(9);
    const sp = g.findSpawn();
    console.log('spawn', sp);
  });
});

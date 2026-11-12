import { describe, it, expect } from 'vitest';
import { WorldGenerator } from '../src/core/worldgen/WorldGenerator';
import { maskChunk, exposedOres, isHiddenOre, publicValue } from '../src/core/antixray';
import { B } from '../src/core/blocks';

describe('anti-xray', () => {
  const server = new WorldGenerator(777, null, { secret: 123456 });
  const client = new WorldGenerator(777, null, { secret: null });
  const local = new WorldGenerator(777);

  it('client terrain matches server except hidden ores', () => {
    let ores = 0;
    for (const [cx, cz] of [[0, 0], [3, -2], [-5, 7], [10, 10]]) {
      const s = server.generate(cx, cz).blocks, c = client.generate(cx, cz).blocks;
      for (let i = 0; i < s.length; i++) {
        if (s[i] === c[i]) continue;
        expect(isHiddenOre(s[i])).toBe(true);
        expect(c[i]).toBe(B.STONE);
        ores++;
      }
      expect(client.generate(cx, cz).blocks.some((v) => isHiddenOre(v))).toBe(false);
    }
    expect(ores).toBeGreaterThan(100);
  });

  it('secret changes ore layout but not terrain', () => {
    const a = server.generate(2, 2).blocks, b = local.generate(2, 2).blocks;
    let diff = 0;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) { diff++; expect(isHiddenOre(a[i]) || isHiddenOre(b[i])).toBe(true); }
    expect(diff).toBeGreaterThan(0);
  });

  it('masks only buried ores and lists exposed ones', () => {
    const cache = new Map<string, Uint16Array>();
    const chunk = (cx: number, cz: number) => { const k = `${cx},${cz}`; if (!cache.has(k)) cache.set(k, server.generate(cx, cz).blocks); return cache.get(k)!; };
    const world = (x: number, y: number, z: number) => chunk(x >> 4, z >> 4)[(y * 16 + (z & 15)) * 16 + (x & 15)];
    let exposedCount = 0, hiddenCount = 0;
    for (const [cx, cz] of [[0, 0], [1, 0], [-3, 4], [6, -6], [8, 2]]) {
      const blocks = chunk(cx, cz);
      const masked = maskChunk(blocks, cx, cz, world);
      const list = exposedOres(blocks, cx, cz, world);
      const listed = new Set<number>();
      for (let i = 0; i < list.length; i += 2) listed.add(list[i]);
      for (let i = 0; i < blocks.length; i++) {
        if (!isHiddenOre(blocks[i])) { expect(masked[i]).toBe(blocks[i]); continue; }
        if (listed.has(i)) { expect(masked[i]).toBe(blocks[i]); exposedCount++; }
        else { expect(masked[i]).toBe(B.STONE); hiddenCount++; }
        const x = cx * 16 + (i & 15), z = cz * 16 + ((i >> 4) & 15), y = i >> 8;
        expect(publicValue(world, x, y, z)).toBe(masked[i]);
      }
    }
    expect(hiddenCount).toBeGreaterThan(exposedCount);
  });
});

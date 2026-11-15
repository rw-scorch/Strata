import { describe, it, expect } from 'vitest';
import { WorldGenerator } from '../src/core/worldgen/WorldGenerator';
import { GEN_LEVEL, RIVER_LEVEL } from '../src/core/worldgen/genLevel';
import { B } from '../src/core/blocks';
import { SEA_LEVEL, WORLD_HEIGHT } from '../src/core/constants';

const at = (b: Uint16Array, x: number, y: number, z: number) => b[(y * 16 + z) * 16 + x];

function riverChunks(g: WorldGenerator, n: number): [number, number][] {
  const out: [number, number][] = [];
  for (let x = -1200; x <= 1200 && out.length < n; x += 16) for (let z = -1200; z <= 1200 && out.length < n; z += 48) {
    const c = g.column(x + 8, z + 8);
    if (c.water !== undefined && c.water > SEA_LEVEL + 6) out.push([Math.floor(x / 16), Math.floor(z / 16)]);
  }
  return out;
}

describe('rivers above sea level', () => {
  it('fill channels high above the sea in new land', () => {
    const g = new WorldGenerator(777);
    const list = riverChunks(g, 12);
    expect(list.length).toBeGreaterThan(8);
    let high = 0;
    for (const [cx, cz] of list) {
      const b = g.generate(cx, cz).blocks;
      for (let i = 0; i < 256; i++) for (let y = SEA_LEVEL + 3; y < WORLD_HEIGHT; y++) if ((at(b, i & 15, y, i >> 4) & 255) === B.WATER) { high++; break; }
    }
    expect(high).toBeGreaterThan(200);
  });

  it('keep their water between the banks', () => {
    const g = new WorldGenerator(4242);
    let cells = 0, leaks = 0;
    for (const [cx, cz] of riverChunks(g, 14)) {
      const b = g.generate(cx, cz).blocks;
      for (let z = 1; z < 15; z++) for (let x = 1; x < 15; x++) for (let y = SEA_LEVEL + 2; y < 140; y++) {
        const v = at(b, x, y, z);
        if ((v & 255) !== B.WATER || ((v >>> 8) & 8)) continue;
        cells++;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (at(b, x + dx, y, z + dz) === 0) { leaks++; break; }
      }
    }
    expect(cells).toBeGreaterThan(300);
    expect(leaks / cells).toBeLessThan(0.03);
  });

  it('flow downhill with currents along the channel', () => {
    const g = new WorldGenerator(777);
    let found = 0;
    for (let x = -800; x <= 800; x += 7) for (let z = -800; z <= 800; z += 29) { if (g.riverCurrent(x, z)) found++; }
    expect(found).toBeGreaterThan(20);
  });

  it('leave older chunks and levels alone', () => {
    const g = new WorldGenerator(777);
    const [cx, cz] = riverChunks(g, 1)[0];
    const a = g.generate(cx, cz, RIVER_LEVEL - 1).blocks;
    let high = 0;
    for (let i = 0; i < 256; i++) for (let y = SEA_LEVEL + 1; y < WORLD_HEIGHT; y++) if ((at(a, i & 15, y, i >> 4) & 255) === B.WATER) high++;
    const b = g.generate(cx, cz, GEN_LEVEL).blocks;
    let high2 = 0;
    for (let i = 0; i < 256; i++) for (let y = SEA_LEVEL + 1; y < WORLD_HEIGHT; y++) if ((at(b, i & 15, y, i >> 4) & 255) === B.WATER) high2++;
    expect(high2).toBeGreaterThan(high);
  });
});

describe('river blending', () => {
  it('meets rivers in level 9 land without a wall', () => {
    const g = new WorldGenerator(777);
    const topY = (b: Uint16Array, x: number, z: number) => { for (let y = WORLD_HEIGHT - 1; y > 0; y--) { const id = at(b, x, y, z) & 255; if (id && id !== B.WATER && id < 14) return y; } return 0; };
    let worst = 0, n = 0;
    for (const [cx, cz] of riverChunks(g, 10)) {
      const old = new Uint8Array(49); old[3 * 7 + 2] = 9;
      const a = g.generate(cx, cz, 9).blocks, b = g.generate(cx, cz, RIVER_LEVEL, old).blocks;
      for (let z = 0; z < 16; z++) { n++; worst = Math.max(worst, Math.abs(topY(a, 0, z) - topY(b, 0, z))); }
    }
    expect(n).toBeGreaterThan(0);
    expect(worst).toBeLessThanOrEqual(2);
  });
});

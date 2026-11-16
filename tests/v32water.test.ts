import { describe, it, expect } from 'vitest';
import { WorldGenerator } from '../src/core/worldgen/WorldGenerator';
import { meshChunk, POS_SCALE, F_FLOWV } from '../src/rendering/Mesher';
import { BLOCKS, B } from '../src/core/blocks';
import { BIOMES } from '../src/core/worldgen/biomes';
import { WORLD_HEIGHT } from '../src/core/constants';

const atlasFor = () => {
  const blockTiles = new Int16Array(1024 * 8);
  for (const b of BLOCKS) if (b) for (let k = 0; k < 8; k++) blockTiles[b.id * 8 + k] = k < 6 ? b.id : -1;
  return { tileSize: 16, cols: 32, rows: 4, blockTiles, tintTable: new Uint8Array(512), special: { water: 1, lava: 2, waterFlow: 3, lavaFlow: 4, doorTop: 5, doorBottom: 6, wheat0: 7 } as Record<string, number>, biomeColors: BIOMES.map((b) => [...b.grass, ...b.foliage, ...b.water]) };
};

describe('v32.1 flowing water surface', () => {
  it('renders an uncovered falling lip flush and gives flowing tops smooth flow vectors', () => {
    const chunks: Uint16Array[] = [];
    for (let i = 0; i < 9; i++) chunks.push(new Uint16Array(16 * 16 * WORLD_HEIGHT));
    const c = chunks[4];
    const set = (x: number, y: number, z: number, v: number) => { c[(y * 16 + z) * 16 + x] = v; };
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) { for (let y = 0; y < 57; y++) set(x, y, z, B.STONE); }
    for (let z = 4; z < 10; z++) {
      for (let x = 2; x < 12; x++) set(x, 57, z, B.WATER);
      for (let x = 2; x < 8; x++) set(x, 58, z, B.WATER | ((x - 1) << 8));
      for (let x = 8; x < 12; x++) set(x, 58, z, B.WATER);
      set(8, 59, z, B.WATER | ((8 | 1) << 8));
      set(9, 59, z, B.WATER | (6 << 8));
      set(10, 59, z, B.WATER | (5 << 8));
      set(11, 59, z, B.WATER | (4 << 8));
    }
    const r = meshChunk({ atlas: atlasFor(), gen: new WorldGenerator(1) }, 0, 0, chunks, true);
    const t = r.trans!;
    const n = t.pos.length / 3;
    let maxLip = -1, flowv = 0;
    for (let i = 0; i < n; i++) {
      const x = t.pos[i * 3] / POS_SCALE, y = t.pos[i * 3 + 1] / POS_SCALE, z = t.pos[i * 3 + 2] / POS_SCALE;
      if (x >= 8 && x <= 9 && z > 4 && z < 10) maxLip = Math.max(maxLip, y);
      if (t.tint[i * 4 + 3] & F_FLOWV) flowv++;
    }
    expect(maxLip).toBeLessThan(59.5);
    expect(flowv).toBeGreaterThan(20);
  });
});

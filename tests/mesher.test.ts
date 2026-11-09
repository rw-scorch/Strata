import { describe, it, expect } from 'vitest';
import { WorldGenerator } from '../src/core/worldgen/WorldGenerator';
import { meshChunk } from '../src/rendering/Mesher';
import { BLOCKS } from '../src/core/blocks';
import { BIOMES } from '../src/core/worldgen/biomes';

describe('mesher', () => {
  it('meshes a generated chunk with lighting quickly', () => {
    const gen = new WorldGenerator(4242);
    const chunks = [];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) chunks.push(gen.generate(dx, dz).blocks);
    const blockTiles = new Int16Array(256 * 8);
    for (const b of BLOCKS) if (b) for (let k = 0; k < 8; k++) blockTiles[b.id * 8 + k] = k < 6 ? b.id : -1;
    const atlas = { tileSize: 16, cols: 32, rows: 4, blockTiles, tintTable: new Uint8Array(512), special: { water: 1, lava: 2, doorTop: 3, doorBottom: 4, wheat0: 5 } as Record<string, number>, biomeColors: BIOMES.map((b) => [...b.grass, ...b.foliage, ...b.water]) };
    meshChunk({ atlas, gen }, 0, 0, chunks, true);
    const t0 = performance.now();
    const r = meshChunk({ atlas, gen }, 0, 0, chunks, true);
    const ms = performance.now() - t0;
    const verts = (r.opaque?.pos.length ?? 0) / 3;
    console.log('mesh ms', ms.toFixed(1), 'opaque verts', verts, 'cutout', (r.cutout?.pos.length ?? 0) / 3, 'trans', (r.trans?.pos.length ?? 0) / 3);
    expect(verts).toBeGreaterThan(100);
    expect(r.opaque!.idx.length % 6).toBe(0);
    const maxIdx = Math.max(...r.opaque!.idx);
    expect(maxIdx).toBeLessThan(verts);
    const sky = r.opaque!.light.filter((_, i) => i % 4 === 0);
    expect(Math.max(...sky)).toBe(255);
  });
});

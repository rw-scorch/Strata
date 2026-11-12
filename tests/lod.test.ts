import { it, expect } from 'vitest';
import { WorldGenerator } from '../src/core/worldgen/WorldGenerator';
import { LodMesher } from '../src/rendering/lod/LodMesher';

const colors = new Uint8Array(1024).fill(128);

it('builds deterministic LOD tiles with sensible size and cost', () => {
  const gen = new WorldGenerator(12345);
  const m = new LodMesher(gen, colors);
  const t0 = performance.now();
  const a = m.build({ x0: 512, z0: -1024, size: 256, n: 32 });
  const ms = performance.now() - t0;
  const b = new LodMesher(new WorldGenerator(12345), colors).build({ x0: 512, z0: -1024, size: 256, n: 32 });
  expect(a.quads).toBeGreaterThan(200);
  expect(a.quads).toBeLessThan(6000);
  expect(Array.from(a.pos.slice(0, 300))).toEqual(Array.from(b.pos.slice(0, 300)));
  for (let i = 1; i < a.pos.length; i += 3) { expect(a.pos[i]).toBeGreaterThan(-200); expect(a.pos[i]).toBeLessThan(200); }
  for (let i = 0; i < a.pos.length; i += 3) { expect(a.pos[i]).toBeGreaterThanOrEqual(0); expect(a.pos[i]).toBeLessThanOrEqual(256); }
  console.log('lod tile', a.quads, 'quads', ms.toFixed(1), 'ms');
  expect(ms).toBeLessThan(400);
});

it('top surface matches the generator height', () => {
  const gen = new WorldGenerator(7);
  const t = new LodMesher(gen, colors).build({ x0: 0, z0: 0, size: 64, n: 64 });
  const tops = new Map<string, number>();
  for (let q = 0; q < t.quads; q++) {
    const o = q * 12;
    if (t.pos[o + 1] === t.pos[o + 4] && t.pos[o + 4] === t.pos[o + 7] && t.pos[o + 7] === t.pos[o + 10]) tops.set(`${t.pos[o]},${t.pos[o + 2]}`, t.pos[o + 1]);
  }
  let checked = 0;
  for (const [k, y] of tops) {
    const [x, z] = k.split(',').map(Number);
    const h = gen.column(x, z).height;
    if (h >= 64) { expect(y).toBeGreaterThanOrEqual(h + 1); checked++; }
  }
  expect(checked).toBeGreaterThan(0);
});

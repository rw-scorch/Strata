import { describe, it, expect } from 'vitest';
import { ChunkData, compactBlocks, encodeRLE, decodeRLE } from '../src/core/chunk';
import { CHUNK_VOLUME } from '../src/core/constants';
import { WorldGenerator } from '../src/core/worldgen/WorldGenerator';
import { GenRegistry, GEN_LEVEL, LEGACY_LEVEL } from '../src/core/worldgen/genLevel';
import { makeBlock, CB, B } from '../src/core/blocks';

describe('v35 compact chunk storage', () => {
  it('stores narrow chunks in 16 bits and widens on demand', () => {
    const c = new ChunkData(0, 0, new Uint32Array(CHUNK_VOLUME).fill(B.STONE));
    expect(c.blocks).toBeInstanceOf(Uint16Array);
    c.set(3, 40, 7, makeBlock(CB.MOSS_BLOCK, 0));
    expect(c.blocks).toBeInstanceOf(Uint32Array);
    expect(c.get(3, 40, 7)).toBe(makeBlock(CB.MOSS_BLOCK, 0));
    expect(c.get(0, 0, 0)).toBe(B.STONE);
  });

  it('keeps wide generated chunks intact through RLE', () => {
    const g = new WorldGenerator(777).generate(1, 8, GEN_LEVEL).blocks;
    const back = decodeRLE(encodeRLE(compactBlocks(g)));
    expect(Array.from(back).every((v, i) => v === g[i])).toBe(true);
  });

  it('roundtrips 16-bit arrays', () => {
    const g = compactBlocks(new WorldGenerator(5).generate(0, 0, 12).blocks);
    expect(g).toBeInstanceOf(Uint16Array);
    const back = decodeRLE(encodeRLE(g));
    expect(Array.from(back).every((v, i) => v === g[i])).toBe(true);
  });
});

describe('v35 gen registry peek cache', () => {
  it('caches unrecorded lookups without recording them', () => {
    let lookups = 0;
    const recs: string[] = [];
    const r = new GenRegistry(GEN_LEVEL, [[0, 0]], undefined, () => { lookups++; return undefined; }, (k) => recs.push(k));
    expect(r.level(2, 2, false)).toBe(LEGACY_LEVEL);
    expect(r.level(2, 2, false)).toBe(LEGACY_LEVEL);
    expect(lookups).toBe(1);
    expect(recs.length).toBe(0);
    expect(r.level(2, 2)).toBe(LEGACY_LEVEL);
    expect(recs).toEqual(['2,2']);
    expect(r.level(50, 50, false)).toBe(GEN_LEVEL);
  });

  it('old masks stay identical with caching', () => {
    const a = new GenRegistry(GEN_LEVEL, [[0, 0]]);
    const b = new GenRegistry(GEN_LEVEL, [[0, 0]]);
    for (let i = 0; i < 3; i++) a.oldMask(12, 0);
    expect(Array.from(a.oldMask(12, 0) ?? [])).toEqual(Array.from(b.oldMask(12, 0) ?? []));
  });
});

import { cmdXYZ } from '../src/core/sim/WorldSim';
import { NETHER_X } from '../src/core/dimension';

describe('v35 /tp uses the current dimension', () => {
  it('reads overworld coordinates in the overworld', () => {
    expect(cmdXYZ({ x: 10, y: 70, z: 5 }, ['100', '80', '-20'])).toEqual([100, 80, -20]);
  });
  it('reads nether coordinates in the nether', () => {
    expect(cmdXYZ({ x: NETHER_X + 12, y: 60, z: 3 }, ['100', '80', '-20'])).toEqual([NETHER_X + 100, 80, -20]);
  });
  it('supports relative coordinates', () => {
    expect(cmdXYZ({ x: NETHER_X + 12, y: 60, z: 3 }, ['~5', '~', '~-3'])).toEqual([NETHER_X + 17, 60, 0]);
  });
  it('can target the other dimension by name', () => {
    expect(cmdXYZ({ x: 10, y: 70, z: 5 }, ['1', '64', '2'], 'nether')).toEqual([NETHER_X + 1, 64, 2]);
    expect(cmdXYZ({ x: NETHER_X, y: 70, z: 5 }, ['1', '64', '2'], 'overworld')).toEqual([1, 64, 2]);
  });
  it('rejects coordinates that would cross dimensions', () => {
    expect(cmdXYZ({ x: 10, y: 70, z: 5 }, ['440000', '64', '0'])).toBeNull();
    expect(cmdXYZ({ x: 10, y: 70, z: 5 }, ['1', '64', '2'], 'end')).toBeNull();
  });
});

import { WorldSim, WorldStore, newPlayer } from '../src/core/sim/WorldSim';
import { MOBS, MobType } from '../src/core/sim/mobs';
import { B as BB } from '../src/core/blocks';

describe('v36 mob farms', () => {
  it('a dark sky platform with an open drop shaft spawns monsters in daylight', () => {
    const gen = new WorldGenerator(1, 'spires');
    const chunks = new Map<string, ChunkData>();
    const F = 20, Y = 90;
    const get = (cx: number, cz: number) => {
      const k = `${cx},${cz}`;
      let c = chunks.get(k);
      if (!c) {
        c = new ChunkData(cx, cz, new Uint16Array(16 * 16 * 160));
        for (let y = 0; y < 10; y++) for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) c.set(x, y, z, BB.STONE);
        for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
          const wx = cx * 16 + x, wz = cz * 16 + z;
          if (Math.abs(wx) > F || Math.abs(wz) > F) continue;
          const shaft = Math.abs(wx) <= 1 && Math.abs(wz) <= 1;
          if (!shaft) c.set(x, Y, z, BB.STONE);
          c.set(x, Y + 3, z, BB.STONE);
          if (Math.abs(wx) === F || Math.abs(wz) === F) for (let y = Y + 1; y < Y + 3; y++) c.set(x, y, z, BB.STONE);
        }
        chunks.set(k, c);
      }
      return c;
    };
    const store: WorldStore = { getBlock: (x, y, z) => get(x >> 4, z >> 4).get(x & 15, y, z & 15), setBlock: (x, y, z, v) => get(x >> 4, z >> 4).set(x & 15, y, z & 15, v), isLoaded: () => true };
    const sim = new WorldSim({ seed: 3, store, gen, difficulty: 'normal', emit: () => {}, validateMoves: false, authoritative: true });
    sim.time = 6000; sim.settings.dayCycle = false;
    const p = newPlayer('p1', 'Afk', 'survival', { x: 30.5, y: Y - 30, z: 0.5 });
    sim.addPlayer(p);
    for (let i = 0; i < 600; i++) sim.tick();
    const inFarm = [...sim.entities.values()].filter((e) => e.kind === 'mob' && MOBS[e.type as MobType].hostile && e.y > Y - 60 && Math.abs(e.x) < F && Math.abs(e.z) < F);
    expect(inFarm.length).toBeGreaterThan(5);
  });
});

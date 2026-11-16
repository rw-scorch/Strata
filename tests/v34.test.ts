import { describe, it, expect } from 'vitest';
import { WorldSim, newPlayer, WorldStore } from '../src/core/sim/WorldSim';
import { WorldGenerator } from '../src/core/worldgen/WorldGenerator';
import { ChunkData } from '../src/core/chunk';
import { B, CB, blockId, blockMeta, makeBlock, getBlock, blockBoxes, DRIP_DOWN, SENSOR_ACTIVE, SHRIEK_ON, SHRIEK_SUMMON, DL_TILT_SHIFT, BLOCKS } from '../src/core/blocks';
import { I, getItem } from '../src/core/items';

function world() {
  const gen = new WorldGenerator(5);
  const chunks = new Map<string, ChunkData>();
  const get = (cx: number, cz: number) => { const k = `${cx},${cz}`; let c = chunks.get(k); if (!c) { c = new ChunkData(cx, cz, new Uint32Array(16 * 16 * 256)); chunks.set(k, c); } return c; };
  const store: WorldStore = { getBlock: (x, y, z) => get(x >> 4, z >> 4).get(x & 15, y, z & 15), setBlock: (x, y, z, v) => get(x >> 4, z >> 4).set(x & 15, y, z & 15, v), isLoaded: () => true, raw: (cx, cz) => get(cx, cz).blocks };
  for (let x = -16; x <= 31; x++) for (let z = -16; z <= 16; z++) store.setBlock(x, 9, z, B.STONE);
  const events: { e: string; [k: string]: unknown }[] = [];
  const sim = new WorldSim({ seed: 5, store, gen, difficulty: 'normal', emit: (e) => events.push(e as never), validateMoves: false, authoritative: true, spawn: { x: 0, y: 10, z: 0 } });
  const at = (x: number, y: number, z: number) => store.getBlock(x, y, z);
  const p = newPlayer('a', 'A', 'survival', { x: 0.5, y: 10, z: 4.5 });
  sim.addPlayer(p); p.x = 0.5; p.y = 10; p.z = 4.5;
  return { sim, at, p, events };
}

describe('v34 cave biomes: generation', () => {
  it('decorates caves only at the new level', () => {
    const g = new WorldGenerator(777);
    const count = (lv: number) => { let n = 0; for (const [cx, cz] of [[1, 8], [-2, 1], [35, 9], [9, -34], [-10, 18]]) { const b = g.generate(cx, cz, lv).blocks; for (let i = 0; i < b.length; i++) if (blockId(b[i]) >= 1024) n++; } return n; };
    expect(count(12)).toBe(0);
    expect(count(13)).toBeGreaterThan(100);
  });

  it('names cave biomes', () => {
    const g = new WorldGenerator(777);
    expect(g.caveBiomeName(566, 26, 154)).toBe('The Hushdeep');
    expect(g.caveBiomeName(566, 200, 154)).toBe(null);
  });
});

describe('v34 cave biomes: blocks', () => {
  it('registers every cave block with an item and a box where needed', () => {
    for (let id = CB.MOSS_BLOCK; id <= CB.COBBLED_DEEPSLATE; id++) { expect(BLOCKS[id]?.id).toBe(id); expect(getItem(id)).toBeTruthy(); }
    expect(getItem(I.GLOW_BERRIES)?.places).toBe(CB.CAVE_VINES);
    expect(getBlock(makeBlock(CB.SCULK)).key).toBe('sculk');
    expect(blockBoxes(makeBlock(CB.BIG_DRIPLEAF, 3 << DL_TILT_SHIFT))).toEqual([]);
    expect(blockBoxes(makeBlock(CB.BIG_DRIPLEAF))!.length).toBe(1);
  });

  it('shapes dripstone stacks from base to tip and merges meeting tips', () => {
    const w = world();
    w.sim.setBlock(0, 20, 0, B.STONE);
    for (let y = 19; y >= 16; y--) w.sim.setBlock(0, y, 0, makeBlock(CB.POINTED_DRIPSTONE, DRIP_DOWN | 1));
    expect([19, 18, 17, 16].map((y) => blockMeta(w.at(0, y, 0)) & 7)).toEqual([4, 3, 2, 1]);
    w.sim.setBlock(0, 10, 0, makeBlock(CB.POINTED_DRIPSTONE, 1));
    for (let y = 11; y <= 15; y++) w.sim.setBlock(0, y, 0, makeBlock(CB.POINTED_DRIPSTONE, 1));
    expect(blockMeta(w.at(0, 15, 0)) & 7).toBe(0);
    expect(blockMeta(w.at(0, 16, 0)) & 7).toBe(0);
  });

  it('drops hanging blocks when their roof goes', () => {
    const w = world();
    w.sim.setBlock(0, 20, 0, B.STONE);
    w.sim.setBlock(0, 19, 0, makeBlock(CB.CAVE_VINES));
    w.sim.setBlock(0, 18, 0, makeBlock(CB.CAVE_VINES_LIT));
    w.sim.setBlock(0, 20, 0, 0);
    expect(w.at(0, 19, 0)).toBe(0);
    expect(w.at(0, 18, 0)).toBe(0);
  });

  it('picks glow berries and bone meal regrows them', () => {
    const w = world();
    w.sim.setBlock(0, 13, 0, B.STONE);
    w.sim.setBlock(0, 12, 0, makeBlock(CB.CAVE_VINES_LIT));
    w.p.x = 0.5; w.p.z = 2.5;
    w.sim.use(w.p, 0, 12, 0, 0, 0, 1);
    expect(blockId(w.at(0, 12, 0))).toBe(CB.CAVE_VINES);
    expect(w.sim.applyBoneMeal(0, 12, 0)).toBe(true);
    expect(blockId(w.at(0, 12, 0))).toBe(CB.CAVE_VINES_LIT);
  });

  it('spreads moss with bone meal', () => {
    const w = world();
    w.sim.setBlock(0, 9, 0, makeBlock(CB.MOSS_BLOCK));
    w.sim.applyBoneMeal(0, 9, 0);
    let moss = 0;
    for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) if (blockId(w.at(x, 9, z)) === CB.MOSS_BLOCK) moss++;
    expect(moss).toBeGreaterThan(5);
  });
});

describe('v34 sculk', () => {
  it('sensors hear footsteps, give power, and trigger wild shriekers into Darkness', () => {
    const w = world();
    w.sim.setBlock(4, 10, 4, makeBlock(CB.SCULK_SENSOR));
    w.sim.setBlock(5, 10, 4, B.REDSTONE_LAMP);
    w.sim.setBlock(4, 10, 8, makeBlock(CB.SCULK_SHRIEKER, SHRIEK_SUMMON));
    w.sim.vibrate(0, 10, 4, w.p.id);
    expect(blockMeta(w.at(4, 10, 4)) & SENSOR_ACTIVE).toBeTruthy();
    expect(blockId(w.at(5, 10, 4))).toBe(B.REDSTONE_LAMP_LIT);
    expect(blockMeta(w.at(4, 10, 8)) & SHRIEK_ON).toBeTruthy();
    for (let i = 0; i < 100; i++) w.sim.tick();
    expect(blockMeta(w.at(4, 10, 4)) & SENSOR_ACTIVE).toBeFalsy();
    expect(blockMeta(w.at(4, 10, 8)) & SHRIEK_ON).toBeFalsy();
    expect(w.events.some((e) => e.e === 'dark')).toBe(true);
    expect(w.p.warn).toBe(1);
  });

  it('player-placed shriekers shriek without Darkness', () => {
    const w = world();
    w.sim.setBlock(4, 10, 4, makeBlock(CB.SCULK_SENSOR));
    w.sim.setBlock(4, 10, 8, makeBlock(CB.SCULK_SHRIEKER));
    w.sim.vibrate(0, 10, 4, w.p.id);
    for (let i = 0; i < 100; i++) w.sim.tick();
    expect(w.events.some((e) => e.e === 'dark')).toBe(false);
  });
});

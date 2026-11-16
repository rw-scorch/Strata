import { describe, it, expect } from 'vitest';
import { WorldSim, newPlayer, WorldStore } from '../src/core/sim/WorldSim';
import { WorldGenerator } from '../src/core/worldgen/WorldGenerator';
import { ChunkData } from '../src/core/chunk';
import { B, SB, BLOCKS, blockMeta, makeBlock, getBlock, blockBoxes, isTrapdoor, isDoorBlock, TD_OPEN, TD_TOP, trapdoorMeta, doorMeta, DOOR_OPEN } from '../src/core/blocks';
import { getItem } from '../src/core/items';
import { RECIPES } from '../src/core/crafting';
import { ATMO, Atmosphere } from '../src/rendering/Atmosphere';
import { BIOMES } from '../src/core/worldgen/biomes';

function world() {
  const gen = new WorldGenerator(5);
  const chunks = new Map<string, ChunkData>();
  const get = (cx: number, cz: number) => { const k = `${cx},${cz}`; let c = chunks.get(k); if (!c) { c = new ChunkData(cx, cz, new Uint16Array(16 * 16 * 256)); chunks.set(k, c); } return c; };
  const store: WorldStore = { getBlock: (x, y, z) => get(x >> 4, z >> 4).get(x & 15, y, z & 15), setBlock: (x, y, z, v) => get(x >> 4, z >> 4).set(x & 15, y, z & 15, v), isLoaded: () => true, raw: (cx, cz) => get(cx, cz).blocks };
  for (let x = -16; x <= 31; x++) for (let z = -16; z <= 16; z++) store.setBlock(x, 9, z, B.STONE);
  const sim = new WorldSim({ seed: 5, store, gen, difficulty: 'peaceful', emit: () => {}, validateMoves: false, authoritative: true, spawn: { x: 0, y: 10, z: 0 } });
  const at = (x: number, y: number, z: number) => store.getBlock(x, y, z);
  const p = newPlayer('a', 'A', 'creative', { x: 0.5, y: 10, z: 3.5 });
  sim.addPlayer(p);
  p.x = 0.5; p.y = 10; p.z = 3.5;
  return { sim, at, p };
}

describe('v33 trapdoors', () => {
  it('defines nine trapdoors with items, textures and recipes', () => {
    for (let i = 0; i <= 8; i++) {
      const d = BLOCKS[SB.IRON_TRAPDOOR + i];
      expect(d.render).toBe('trapdoor');
      expect(d.category).toBe('functional');
      expect(getItem(SB.IRON_TRAPDOOR + i)?.places).toBe(B.OAK_DOOR);
      expect(RECIPES.some((r) => r.result === SB.IRON_TRAPDOOR + i)).toBe(true);
    }
    expect(BLOCKS[SB.IRON_TRAPDOOR].interactive).toBe(false);
  });

  it('keeps doors and trapdoors apart, including powered doors', () => {
    const td = makeBlock(B.OAK_DOOR, trapdoorMeta(8, 0, false, false));
    expect(isTrapdoor(td)).toBe(true);
    expect(isDoorBlock(td)).toBe(false);
    expect(getBlock(td).key).toBe('oak_trapdoor');
    const poweredDoor = makeBlock(B.OAK_DOOR, doorMeta(1, false, true) | 16);
    expect(isDoorBlock(poweredDoor)).toBe(true);
    expect(getBlock(poweredDoor).key).toBe('oak_door');
  });

  it('has slab-like boxes closed and a wall box when open', () => {
    expect(blockBoxes(makeBlock(B.OAK_DOOR, trapdoorMeta(8, 0, false, false)))![0][4]).toBeCloseTo(3 / 16);
    expect(blockBoxes(makeBlock(B.OAK_DOOR, trapdoorMeta(8, 0, true, false)))![0][1]).toBeCloseTo(13 / 16);
    const open = blockBoxes(makeBlock(B.OAK_DOOR, trapdoorMeta(8, 2, false, true)))![0];
    expect(open[4] - open[1]).toBe(1);
    expect(open[5] - open[2]).toBeCloseTo(3 / 16);
  });

  it('places on the top or bottom half, hinges on the clicked wall, and opens with a tap', () => {
    const w = world();
    w.sim.setBlock(0, 11, 0, B.STONE);
    w.p.inv.slots[w.p.inv.selected] = { id: SB.SPRUCE_TRAPDOOR, count: 4 };
    expect(w.sim.place(w.p, 0, 11, 0, 0, 0, 1, 0.8)).toBe(true);
    const v = w.at(0, 11, 1);
    expect(isTrapdoor(v)).toBe(true);
    expect(getBlock(v).key).toBe('spruce_trapdoor');
    expect(blockMeta(v) & TD_TOP).toBeTruthy();
    expect((blockMeta(v) >> 2) & 3).toBe(0);
    expect(w.at(0, 12, 1)).toBe(0);
    w.p.inv.slots[w.p.inv.selected] = null;
    w.sim.use(w.p, 0, 11, 1, 0, 0, 1);
    expect(blockMeta(w.at(0, 11, 1)) & TD_OPEN).toBeTruthy();
    w.sim.use(w.p, 0, 11, 1, 0, 0, 1);
    expect(blockMeta(w.at(0, 11, 1)) & TD_OPEN).toBeFalsy();
  });

  it('opens with redstone, and iron trapdoors ignore taps', () => {
    const w = world();
    w.sim.setBlock(0, 10, 0, makeBlock(B.OAK_DOOR, trapdoorMeta(7, 0, false, false)));
    w.sim.use(w.p, 0, 10, 0, 0, 1, 0);
    expect(blockMeta(w.at(0, 10, 0)) & TD_OPEN).toBeFalsy();
    w.sim.setBlock(1, 10, 0, makeBlock(B.LEVER, 0));
    w.sim.rs.use(1, 10, 0, w.at(1, 10, 0));
    expect(blockMeta(w.at(0, 10, 0)) & TD_OPEN).toBeTruthy();
    w.sim.rs.use(1, 10, 0, w.at(1, 10, 0));
    expect(blockMeta(w.at(0, 10, 0)) & TD_OPEN).toBeFalsy();
  });

  it('leaves a door intact when a trapdoor sits on top of it', () => {
    const w = world();
    w.sim.setBlock(0, 10, 0, makeBlock(B.OAK_DOOR, doorMeta(0, false, false)));
    w.sim.setBlock(0, 11, 0, makeBlock(B.OAK_DOOR, doorMeta(0, true, false)));
    w.sim.setBlock(0, 12, 0, makeBlock(B.OAK_DOOR, trapdoorMeta(8, 0, false, false)));
    w.p.inv.slots[w.p.inv.selected] = null;
    w.sim.use(w.p, 0, 10, 0, 0, 0, -1);
    expect(blockMeta(w.at(0, 10, 0)) & DOOR_OPEN).toBeTruthy();
    expect(blockMeta(w.at(0, 12, 0)) & TD_OPEN).toBeFalsy();
  });
});

describe('v33 atmosphere', () => {
  it('has a profile for every overworld biome', () => {
    for (const b of BIOMES) expect(ATMO[b.id], b.id).toBeTruthy();
  });

  it('peaks dawn mist around sunrise and clears by midday', () => {
    expect(Atmosphere.dawn(0)).toBeGreaterThan(0.9);
    expect(Atmosphere.dawn(6000)).toBe(0);
    expect(Atmosphere.dawn(23000)).toBeGreaterThan(0.2);
  });

  it('blends towards the local biome and pools mist in low ground', () => {
    const a = new Atmosphere();
    for (let i = 0; i < 400; i++) a.update({ dt: 0.05, x: 0, y: 80, z: 0, time: 200, rain: 0, cave: 0, active: true, biome: () => 'swamp', top: (x) => (x < 0 ? 60 : 90) }, 0);
    expect(a.haze).toBeGreaterThan(0.008);
    expect(a.fx).toBe('fireflies');
    expect(a.mist).toBeGreaterThan(0.5);
    expect(a.mistBase).toBeLessThan(70);
  });
});

describe('v34 trapdoor pathing', () => {
  it('mobs plan routes across trapdoors as if they were floor', async () => {
    const { findPath } = await import('../src/core/sim/pathfind');
    const cells = new Map<string, number>();
    const w = { getBlock: (x: number, y: number, z: number) => cells.get(`${x},${y},${z}`) ?? 0 };
    for (let x = 0; x <= 6; x++) { if (x !== 3) cells.set(`${x},9,0`, B.STONE); cells.set(`${x},10,1`, B.STONE); cells.set(`${x},11,1`, B.STONE); cells.set(`${x},10,-1`, B.STONE); cells.set(`${x},11,-1`, B.STONE); }
    const without = findPath(w, 0, 10, 0, 6, 10, 0, true) ?? [];
    expect(without.some((n) => n.x === 6 && n.y === 10)).toBe(false);
    cells.set('3,9,0', makeBlock(B.OAK_DOOR, trapdoorMeta(8, 1, true, true)));
    const path = findPath(w, 0, 10, 0, 6, 10, 0, true)!;
    expect(path.some((n) => n.x === 3 && n.y === 10)).toBe(true);
    expect(path[path.length - 1].x).toBe(6);
  });
});

describe('v34 wide block ids', () => {
  it('keeps every existing block value unchanged and round-trips wide ids', async () => {
    const { blockId: id, blockMeta: meta, makeBlock: mk, getBlock: gb, bid } = await import('../src/core/blocks');
    for (let v = 0; v < 65536; v += 97) { expect(id(v)).toBe(v & 0xff); expect(meta(v)).toBe(v >>> 8); }
    expect(mk(5, 3)).toBe(5 | (3 << 8));
    const w = mk(1300, 0xab);
    expect(id(w)).toBe(1300); expect(bid(w)).toBe(1300); expect(meta(w)).toBe(0xab);
    expect(gb(mk(5, 0)).key).toBe('oak_planks');
  });

  it('stores old chunks in the old format and wide chunks with a marker', async () => {
    const { encodeRLE, decodeRLE } = await import('../src/core/chunk');
    const { CHUNK_VOLUME } = await import('../src/core/constants');
    const a = new Uint32Array(CHUNK_VOLUME); a.fill(1, 0, 5000); a[7000] = 0x0302;
    const ra = encodeRLE(a);
    expect(ra[0]).toBe(5000);
    expect(Array.from(decodeRLE(ra))).toEqual(Array.from(a));
    const b = a.slice(); b[9000] = (1300 & 0xff) | (0x12 << 8) | ((1300 & 0xf00) << 8);
    const rb = encodeRLE(b);
    expect(rb[0]).toBe(0);
    expect(Array.from(decodeRLE(rb))).toEqual(Array.from(b));
    const legacy = Uint16Array.from([CHUNK_VOLUME, 0]);
    expect(decodeRLE(legacy).every((v) => v === 0)).toBe(true);
  });
});

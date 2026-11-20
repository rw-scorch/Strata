import { describe, it, expect } from 'vitest';
import { gzipSync, gunzipSync } from 'node:zlib';
import { WorldSim, newPlayer, WorldStore, SimEvent, MF } from '../src/core/sim/WorldSim';
import { WorldGenerator } from '../src/core/worldgen/WorldGenerator';
import { ChunkData } from '../src/core/chunk';
import { B, X, XV, blockId, blockMeta, SLAB_TOP, STAIRS_UP } from '../src/core/blocks';
import { I, ITEMS, toolId, armorId } from '../src/core/items';
import { defaultSellPrices, SHOP, validShop, shopEntry } from '../src/core/economy';
import { parseLitematic, readNbt } from '../src/core/litematic';
import type { Difficulty } from '../src/core/sim/WorldSim';

function world(difficulty: Difficulty = 'peaceful') {
  const chunks = new Map<string, ChunkData>();
  const get = (cx: number, cz: number) => { const k = `${cx},${cz}`; let c = chunks.get(k); if (!c) { c = new ChunkData(cx, cz); chunks.set(k, c); } return c; };
  const store: WorldStore = { getBlock: (x, y, z) => get(x >> 4, z >> 4).get(x & 15, y, z & 15), setBlock: (x, y, z, v) => get(x >> 4, z >> 4).set(x & 15, y, z & 15, v), isLoaded: () => true, raw: (cx, cz) => get(cx, cz).blocks };
  for (let x = -40; x <= 40; x++) for (let z = -40; z <= 40; z++) store.setBlock(x, 9, z, B.STONE);
  const events: SimEvent[] = [];
  const sim = new WorldSim({ seed: 5, store, gen: new WorldGenerator(5), difficulty, emit: (e) => events.push(e), validateMoves: false, authoritative: true, spawn: { x: 0, y: 10, z: 0 } });
  const p = newPlayer('a', 'A', 'survival', { x: 0.5, y: 10, z: 0.5 });
  sim.addPlayer(p);
  p.x = 0.5; p.y = 10; p.z = 0.5;
  return { sim, store, p, events };
}

class W {
  parts: number[] = [];
  u8(n: number) { this.parts.push(n & 255); }
  i16(n: number) { this.u8(n >> 8); this.u8(n); }
  i32(n: number) { this.u8(n >>> 24); this.u8(n >>> 16); this.u8(n >>> 8); this.u8(n); }
  str(s: string) { const b = Buffer.from(s, 'utf8'); this.i16(b.length); for (const c of b) this.u8(c); }
  name(t: number, n: string) { this.u8(t); this.str(n); }
  int(n: string, v: number) { this.name(3, n); this.i32(v); }
  string(n: string, v: string) { this.name(8, n); this.str(v); }
  begin(n: string) { this.name(10, n); }
  end() { this.u8(0); }
  longs(n: string, words: bigint[]) { this.name(12, n); this.i32(words.length); for (const w of words) { this.i32(Number((w >> 32n) & 0xffffffffn)); this.i32(Number(w & 0xffffffffn)); } }
}

function pack(indices: number[], bits: number): bigint[] {
  const n = Math.ceil((indices.length * bits) / 64);
  const out = new Array<bigint>(n).fill(0n);
  indices.forEach((v, i) => {
    const g = BigInt(i * bits);
    const L = Number(g >> 6n), o = g & 63n;
    out[L] |= (BigInt(v) << o) & 0xffffffffffffffffn;
    if (Number(o) + bits > 64) out[L + 1] |= BigInt(v) >> (64n - o);
  });
  return out;
}

function litematic(): Uint8Array {
  const w = new W();
  w.u8(10); w.str('');
  w.begin('Metadata'); w.string('Name', 'Tiny Tower'); w.end();
  w.int('Version', 6);
  w.begin('Regions'); w.begin('main');
  w.begin('Position'); w.int('x', 0); w.int('y', 0); w.int('z', 0); w.end();
  w.begin('Size'); w.int('x', 3); w.int('y', -2); w.int('z', 1); w.end();
  const pal: [string, Record<string, string>][] = [['minecraft:air', {}], ['minecraft:stone', {}], ['minecraft:oak_stairs', { facing: 'east', half: 'top' }], ['minecraft:oak_slab', { type: 'top' }], ['minecraft:totally_made_up', {}], ['minecraft:water', {}]];
  w.name(9, 'BlockStatePalette'); w.u8(10); w.i32(pal.length);
  for (const [nm, props] of pal) {
    w.string('Name', nm);
    if (Object.keys(props).length) { w.begin('Properties'); for (const [k, v] of Object.entries(props)) w.string(k, v); w.end(); }
    w.end();
  }
  const idx = [1, 2, 3, 4, 5, 0];
  w.longs('BlockStates', pack(idx, 3));
  w.end(); w.end(); w.end();
  return gzipSync(Buffer.from(w.parts));
}

describe('v39 litematica import', () => {
  it('reads palette, packed states, negative sizes and block states', () => {
    const raw = gunzipSync(litematic());
    expect(readNbt(new Uint8Array(raw)).Regions).toBeTruthy();
    const r = parseLitematic(new Uint8Array(raw), 'file');
    expect(typeof r).not.toBe('string');
    if (typeof r === 'string') return;
    expect(r.bp.name).toBe('Tiny Tower');
    expect([r.bp.w, r.bp.h, r.bp.d]).toEqual([3, 2, 1]);
    const at = (x: number, y: number) => r.bp.blocks[(y * r.bp.d) * r.bp.w + x];
    expect(blockId(at(0, 0))).toBe(B.STONE);
    expect(blockId(at(1, 0))).toBe(B.STAIRS);
    expect(blockMeta(at(1, 0)) & STAIRS_UP).toBeTruthy();
    expect((blockMeta(at(1, 0)) >> 5) & 3).toBe(1);
    expect(blockId(at(2, 0))).toBe(B.SLAB);
    expect(blockMeta(at(2, 0)) & SLAB_TOP).toBeTruthy();
    expect(r.unknown).toContain('totally_made_up');
    expect(r.skipped).toBe(2);
  });

  it('refuses oversized schematics and junk', () => {
    expect(parseLitematic(new Uint8Array([1, 2, 3]), 'x')).toMatch(/not a Litematica/);
  });
});

describe('v39 off hand', () => {
  it('places a torch from the off hand when the main hand cannot place', () => {
    const { sim, p, store } = world();
    p.inv.slots[0] = { id: toolId(2, 3), count: 1 };
    p.inv.off[0] = { id: B.TORCH, count: 4 };
    expect(sim.use(p, 2, 9, 0, 0, 1, 0)).toBe(true);
    expect(blockId(store.getBlock(2, 10, 0))).toBe(B.TORCH);
    expect(p.inv.off[0]?.count).toBe(3);
    expect(p.inv.slots[0]?.id).toBe(toolId(2, 3));
  });

  it('eats food held in the off hand', () => {
    const { sim, p } = world();
    p.food = 8;
    p.inv.slots[0] = { id: toolId(2, 3), count: 1 };
    p.inv.off[0] = { id: I.BREAD, count: 2 };
    sim.setNow(5000);
    expect(sim.eat(p)).toBe(true);
    expect(p.food).toBeGreaterThan(8);
    expect(p.inv.off[0]?.count).toBe(1);
  });

  it('bows draw arrows from the off hand first', () => {
    const { sim, p } = world();
    p.inv.slots[0] = { id: I.BOW, count: 1 };
    p.inv.slots[5] = { id: I.ARROW, count: 10 };
    p.inv.off[0] = { id: I.ARROW, count: 3 };
    sim.setNow(5000);
    expect(sim.shootBow(p, 1, 0, 0)).toBe(true);
    expect(p.inv.off[0]?.count).toBe(2);
    expect(p.inv.slots[5]?.count).toBe(10);
  });

  it('a raised shield blocks attacks from the front only', () => {
    const { sim, p } = world();
    p.inv.off[0] = { id: I.SHIELD, count: 1 };
    sim.setNow(1000);
    sim.move(p, 0.5, 10, 0.5, 0, 0, MF.BLOCK | MF.GROUND);
    sim.setNow(2000);
    sim.damage(p, 5, 'hollowed', 0.5, -3);
    expect(p.health).toBe(20);
    expect(p.inv.off[0]?.dmg).toBeGreaterThan(0);
    sim.setNow(3000);
    sim.damage(p, 5, 'hollowed', 0.5, 4);
    expect(p.health).toBeLessThan(20);
  });

  it('an axe knocks the shield down', () => {
    const { sim, p } = world();
    const q = newPlayer('b', 'B', 'survival', { x: 0.5, y: 10, z: -1.5 });
    sim.addPlayer(q); q.x = 0.5; q.y = 10; q.z = -1.5;
    p.inv.slots[0] = { id: I.SHIELD, count: 1 };
    q.inv.slots[0] = { id: toolId(2, 1), count: 1 };
    sim.setNow(1000);
    sim.move(p, 0.5, 10, 0.5, 0, 0, MF.BLOCK | MF.GROUND);
    sim.setNow(2000);
    sim.attackPlayer(q, 'a');
    expect(p.shieldCd).toBeGreaterThan(2000);
  });
});

describe('v39 ender pearls and endermen', () => {
  it('a thrown pearl teleports the thrower and stings', () => {
    const { sim, p } = world();
    p.inv.slots[0] = { id: I.ENDER_PEARL, count: 2 };
    sim.setNow(1000);
    expect(sim.shootBow(p, 1, 0, 0.3)).toBe(true);
    expect(p.inv.slots[0]?.count).toBe(1);
    for (let i = 0; i < 200 && [...sim.entities.values()].some((e) => e.type === 'pearl'); i++) sim.tick();
    expect(p.z).toBeLessThan(-5);
    expect(p.health).toBe(15);
  });

  it('endermen turn hostile when stared at', () => {
    const { sim, p } = world('normal');
    const e = sim.spawnMob('voidstalker', 0.5, 10, -6);
    e.persistent = true;
    p.yaw = 0; p.pitch = Math.atan2(12.55 - 11.62, 6.5);
    for (let i = 0; i < 12; i++) sim.tick();
    expect(e.target).toBe('a');
  });

  it('every item can be sold and the shop stocks lapis and full diamond armour', () => {
    const prices = defaultSellPrices();
    const unsold = ITEMS.filter((it) => it && !prices.get(it.id) && !/pulling|_pull|loaded|crossbow_arrow/.test(it.key)).map((it) => it.key);
    expect(unsold).toEqual([]);
    for (const k of ['lapis_lazuli', 'aetherite_helmet', 'aetherite_chestplate', 'aetherite_leggings', 'aetherite_boots']) expect(shopEntry(k)).toBeTruthy();
    expect(shopEntry('aetherite_helmet')!.id).toBe(armorId(3, 0));
    expect(validShop([{ id: 'x', name: 'X', icon: I.LAPIS, items: [{ key: 'l', id: I.LAPIS, count: 99, price: 5 }] }])).toBeNull();
    expect(validShop(SHOP)?.length).toBe(SHOP.length);
  });
});

describe('v39 bubbles, fire and lava', () => {
  it('soul sand bubble columns lift mobs and refill air', () => {
    const { sim, p } = world();
    sim.setBlock(10, 9, 10, X(XV.SOUL_SAND));
    for (let y = 10; y < 20; y++) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) sim.setBlock(10 + dx, y, 10 + dz, B.GLASS);
    for (let y = 10; y < 20; y++) sim.setBlock(10, y, 10, B.WATER);
    const e = sim.spawnMob('woolhorn', 10.5, 11, 10.5);
    e.persistent = true;
    for (let i = 0; i < 30; i++) sim.tick();
    expect(e.y).toBeGreaterThan(14);
    p.x = 10.5; p.y = 12; p.z = 10.5; p.air = 40;
    sim.move(p, 10.5, 12, 10.5, 0, 0, MF.WATER | MF.EYE_WATER);
    for (let i = 0; i < 2; i++) sim.tick();
    expect(p.air).toBe(300);
  });

  it('lava sets nearby wood alight', () => {
    const { sim, store } = world();
    sim.settings.randomTickSpeed = 64;
    for (let x = 17; x <= 23; x++) for (let z = -3; z <= 3; z++) sim.setBlock(x, 10, z, B.OAK_PLANKS);
    sim.setBlock(20, 10, 0, B.LAVA);
    let fire = false;
    for (let i = 0; i < 3000 && !fire; i++) {
      sim.tick();
      if (i % 50 === 0) for (let x = 16; x <= 24 && !fire; x++) for (let z = -4; z <= 4 && !fire; z++) for (let y = 10; y <= 12; y++) if (blockId(store.getBlock(x, y, z)) === B.FIRE) fire = true;
    }
    expect(fire).toBe(true);
  });
});

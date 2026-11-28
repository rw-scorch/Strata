import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { WorldSim, WorldStore, newPlayer, SimEvent } from '../src/core/sim/WorldSim';
import { ChunkData } from '../src/core/chunk';
import { B, blockId, makeBlock, BLOCKS, STARFALL_ORE, STARSHARD_BLOCK } from '../src/core/blocks';
import { I, getItem, CREATIVE_HIDDEN } from '../src/core/items';
import { findRecipe } from '../src/core/crafting';
import { WorldGenerator } from '../src/core/worldgen/WorldGenerator';
import { naturalBlock, STARFALL_WARN } from '../src/core/sim/starfall';
import { Duels } from '../src/core/labs/duels/Duels';
import { duelsLayout } from '../src/core/labs/duels/layout';
import { DUEL_KITS, kitInventory } from '../src/core/labs/duels/kits';
import { heldItemMatrix } from '../src/rendering/VanillaModels';

function meadow() {
  const chunks = new Map<string, ChunkData>();
  const get = (cx: number, cz: number) => { const k = `${cx},${cz}`; let c = chunks.get(k); if (!c) { c = new ChunkData(cx, cz, new Uint32Array(16 * 16 * 160)); chunks.set(k, c); } return c; };
  const store: WorldStore = { getBlock: (x, y, z) => get(x >> 4, z >> 4).get(x & 15, y, z & 15), setBlock: (x, y, z, v) => get(x >> 4, z >> 4).set(x & 15, y, z & 15, v), isLoaded: () => true, raw: (cx, cz) => get(cx, cz).blocks };
  for (let x = -100; x <= 100; x++) for (let z = -100; z <= 100; z++) { store.setBlock(x, 62, z, B.STONE); store.setBlock(x, 63, z, B.DIRT); store.setBlock(x, 64, z, B.GRASS); }
  const events: SimEvent[] = [];
  const sim = new WorldSim({ seed: 54, store, gen: new WorldGenerator(54), difficulty: 'peaceful', emit: (e) => events.push(e), validateMoves: false, authoritative: true, spawn: { x: 0, y: 65, z: 0 } });
  const add = (id: string, op = false) => { const p = newPlayer(id, id.toUpperCase(), 'survival', { x: 0.5, y: 65, z: 0.5 }); sim.addPlayer(p); p.x = 0.5; p.y = 65; p.z = 0.5; p.op = op; return p; };
  return { sim, store, events, add };
}

const ticks = (sim: { tick(): void }, n: number) => { for (let i = 0; i < n; i++) sim.tick(); };

describe('v54 starfall blocks', () => {
  it('registers the ore, block and shard and keeps them out of creative', () => {
    expect(BLOCKS[STARFALL_ORE].key).toBe('starfall_ore');
    expect(BLOCKS[STARFALL_ORE].lightEmit).toBeGreaterThan(0);
    expect(BLOCKS[STARSHARD_BLOCK].lightEmit).toBeGreaterThan(BLOCKS[STARFALL_ORE].lightEmit);
    expect(getItem(I.STARSHARD)?.key).toBe('starshard');
    expect(CREATIVE_HIDDEN.has(I.STARSHARD)).toBe(true);
    expect(CREATIVE_HIDDEN.has(STARFALL_ORE)).toBe(true);
  });

  it('packs nine shards into a block and back', () => {
    const grid = Array(9).fill({ id: I.STARSHARD, count: 1 });
    expect(findRecipe(grid, 3)?.result).toBe(STARSHARD_BLOCK);
    const one = [{ id: STARSHARD_BLOCK, count: 1 }, null, null, null];
    expect(findRecipe(one, 2)).toMatchObject({ result: I.STARSHARD, count: 9 });
  });

  it('treats terrain as natural and builds as not', () => {
    expect(naturalBlock(0)).toBe(true);
    expect(naturalBlock(makeBlock(B.GRASS))).toBe(true);
    expect(naturalBlock(makeBlock(B.STONE))).toBe(true);
    expect(naturalBlock(makeBlock(B.OAK_PLANKS))).toBe(false);
    expect(naturalBlock(makeBlock(B.CHEST))).toBe(false);
  });
});

describe('v54 starfall event', () => {
  it('only runs on the official SMP', () => {
    const w = meadow();
    const p = w.add('a', true);
    expect(w.sim.command(p, '/starfall')).toMatch(/official New Strata SMP/);
    ticks(w.sim, 50);
    expect(w.sim.starfall.next).toBe(-1);
  });

  it('schedules a first star 10 to 20 minutes out', () => {
    const w = meadow();
    w.add('a');
    w.sim.starfallOn = true;
    w.sim.tick();
    const eta = w.sim.starfall.next - w.sim.tickCount;
    expect(eta).toBeGreaterThanOrEqual(10 * 1200 - 1);
    expect(eta).toBeLessThanOrEqual(20 * 1200);
    expect(w.sim.command(w.sim.players.get('a')!, '/starfall')).toMatch(/next star falls in about/);
  });

  it('keeps /starfall now for operators', () => {
    const w = meadow();
    const p = w.add('a', false);
    w.sim.starfallOn = true;
    expect(w.sim.command(p, '/starfall now')).toMatch(/permission/);
    expect(w.sim.starfall.site).toBeNull();
  });

  it('warns, streaks, lands a crater with ore and a Star Cache', () => {
    const w = meadow();
    const p = w.add('a', true);
    w.sim.starfallOn = true;
    expect(w.sim.command(p, '/starfall now')).toMatch(/on its way/);
    const site = w.sim.starfall.site!;
    expect(site).toBeTruthy();
    expect(w.events.some((e) => e.e === 'title' && (e as { text: string }).text === 'STARFALL')).toBe(true);
    expect(w.sim.command(p, '/starfall')).toMatch(/lands near/);
    w.events.length = 0;
    ticks(w.sim, STARFALL_WARN + 2);
    expect(w.sim.starfall.site).toBeNull();
    expect(w.events.some((e) => e.e === 'particles' && (e as { k: string }).k === 'star')).toBe(true);
    expect(w.events.some((e) => e.e === 'msg' && /in 10 seconds/.test((e as { text: string }).text))).toBe(true);
    expect(w.events.some((e) => e.e === 'title' && (e as { text: string }).text === 'IMPACT')).toBe(true);
    const last = w.sim.starfall.last!;
    expect(blockId(w.store.getBlock(last.x, last.y, last.z))).toBe(B.CHEST);
    expect(blockId(w.store.getBlock(last.x, last.y - 1, last.z))).toBe(STARSHARD_BLOCK);
    const be = w.sim.getBlockEntity(last.x, last.y, last.z)!;
    const shards = be.items.filter((s) => s && s.id === I.STARSHARD).reduce((n, s) => n + s!.count, 0);
    expect(shards).toBeGreaterThanOrEqual(3);
    let ore = 0;
    for (let dx = -8; dx <= 8; dx++) for (let dz = -8; dz <= 8; dz++) for (let y = 50; y <= 66; y++) if (blockId(w.store.getBlock(last.x + dx, y, last.z + dz)) === STARFALL_ORE) ore++;
    expect(ore).toBeGreaterThan(0);
    expect(last.y).toBeLessThan(65);
    expect(w.sim.command(p, '/starfall last')).toMatch(new RegExp(`${last.x} ${last.y} ${last.z}`));
    expect(w.sim.starfall.next - w.sim.tickCount).toBeGreaterThanOrEqual(35 * 1200 - 2);
  });

  it('never lands on builds', () => {
    const w = meadow();
    const p = w.add('a', true);
    for (let x = -60; x <= 60; x++) for (let z = -60; z <= 60; z++) w.store.setBlock(x, 64, z, B.OAK_PLANKS);
    w.sim.starfallOn = true;
    expect(w.sim.command(p, '/starfall now')).toMatch(/Could not find/);
  });

  it('mining starfall ore needs iron and yields shards', () => {
    const d = BLOCKS[STARFALL_ORE];
    expect(d.tool).toBe('pickaxe');
    expect(d.tier).toBe(2);
    expect(d.drops?.[0].item).toBe(I.STARSHARD);
  });
});

function duelsWorld() {
  const gen = new WorldGenerator(1, 'duels');
  const chunks = new Map<string, ChunkData>();
  const get = (cx: number, cz: number) => { const k = `${cx},${cz}`; let c = chunks.get(k); if (!c) { c = new ChunkData(cx, cz, gen.generate(cx, cz).blocks); chunks.set(k, c); } return c; };
  const store: WorldStore = { getBlock: (x, y, z) => get(x >> 4, z >> 4).get(x & 15, y, z & 15), setBlock: (x, y, z, v) => get(x >> 4, z >> 4).set(x & 15, y, z & 15, v), isLoaded: () => true };
  const events: SimEvent[] = [];
  const sim = new WorldSim({ seed: 1, store, gen, difficulty: 'normal', emit: (e) => events.push(e), validateMoves: false, authoritative: true });
  const duels = new Duels(sim);
  sim.game = duels;
  const p = newPlayer('h1', 'Tester', 'survival', sim.spawn);
  sim.addPlayer(p);
  return { sim, duels, p, events, store };
}

describe('v54 proving grounds layout', () => {
  it('has eight separate arenas and a herald on the lobby', () => {
    const l = duelsLayout();
    expect(l.arenas.length).toBe(8);
    expect(new Set(l.arenas.map((a) => a.name)).size).toBe(8);
    for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) {
      const a = l.arenas[i].center, b = l.arenas[j].center;
      expect(Math.max(Math.abs(a[0] - b[0]), Math.abs(a[2] - b[2]))).toBeGreaterThan(l.arenas[i].half * 2 + 4);
    }
    expect(Math.hypot(l.herald[0], l.herald[2])).toBeLessThan(20);
  });

  it('generates a floor under every arena spawn and the lobby', () => {
    const { store } = duelsWorld();
    for (const a of duelsLayout().arenas) for (const s of [a.a, a.b]) expect(blockId(store.getBlock(Math.floor(s[0]), Math.floor(s[1]) - 1, Math.floor(s[2])))).not.toBe(0);
    expect(blockId(store.getBlock(0, 99, 0))).not.toBe(0);
  });

  it('kits give the advertised gear', () => {
    for (const k of DUEL_KITS) {
      const inv = kitInventory(k.id);
      expect(inv.slots.filter(Boolean).length).toBeGreaterThan(0);
      expect(inv.armor.filter(Boolean).length).toBe(4);
    }
    const bulwark = kitInventory('bulwark');
    expect([...bulwark.slots, ...bulwark.off].some((s) => s?.id === I.SHIELD)).toBe(true);
  });
});

describe('v54 duels against a fake player', () => {
  it('runs a bot match from countdown to result and cleans up', () => {
    const w = duelsWorld();
    w.sim.command(w.p, '/duel bot blade squire');
    const bot = [...w.sim.players.values()].find((x) => x.bot);
    expect(bot).toBeTruthy();
    expect(bot!.name).toMatch(/Squire/);
    expect(w.duels.state().matches[0].phase).toBe('count');
    ticks(w.sim, 61);
    expect(w.duels.state().matches[0].phase).toBe('fight');
    const start = { x: bot!.x, z: bot!.z };
    let hurt = false;
    for (let i = 0; i < 20 * 120 && w.duels.state().matches.length && w.duels.state().matches[0].phase === 'fight'; i++) {
      w.sim.tick();
      if (w.p.health < 20) hurt = true;
    }
    expect(Math.hypot(bot!.x - start.x, bot!.z - start.z)).toBeGreaterThan(1);
    expect(hurt).toBe(true);
    ticks(w.sim, 120);
    expect(w.duels.state().matches.length).toBe(0);
    expect([...w.sim.players.values()].some((x) => x.bot)).toBe(false);
    expect(w.duels.state().players.find((x) => x.id === 'h1')?.status).toBe('lobby');
    if (w.p.dead) w.sim.respawn(w.p);
    expect(w.p.dead).toBe(false);
    expect(w.p.y).toBeGreaterThan(95);
  });

  it('forfeit hands the win to the bot and records stats', () => {
    const w = duelsWorld();
    w.sim.command(w.p, '/duel bot bulwark knight');
    ticks(w.sim, 70);
    w.sim.command(w.p, '/duel leave');
    ticks(w.sim, 80);
    expect(w.sim.command(w.p, '/duel stats')).toMatch(/0 wins, 1 losses/);
  });
});

describe('v54 first-person held items', () => {
  const pos = (m: THREE.Matrix4) => new THREE.Vector3().setFromMatrixPosition(m);
  it('mirrors a sword between hands', () => {
    const r = pos(heldItemMatrix('handheld', false, 0, 0, new THREE.Matrix4()));
    const l = pos(heldItemMatrix('handheld', true, 0, 0, new THREE.Matrix4()));
    expect(r.x).toBeCloseTo(-l.x, 5);
    expect(r.y).toBeCloseTo(l.y, 5);
    expect(r.x).toBeCloseTo(0.56 + 1.13 / 16, 4);
    expect(r.y).toBeCloseTo(-0.52 + 3.2 / 16, 4);
  });

  it('holds the shield big and low, and raises it toward the middle when blocking', () => {
    const m = heldItemMatrix('shield', true, 0, 0, new THREE.Matrix4());
    const scale = new THREE.Vector3().setFromMatrixScale(m);
    expect(scale.x).toBeCloseTo(1.25, 4);
    const c = new THREE.Vector3(-0.5, -0.5, -0.5 + 1.5 / 16).applyMatrix4(m);
    expect(c.x).toBeLessThan(-0.4);
    expect(c.y).toBeLessThan(-0.8);
    const b = new THREE.Vector3(-0.5, -0.5, -0.5 + 1.5 / 16).applyMatrix4(heldItemMatrix('shieldBlock', true, 0, 0, new THREE.Matrix4()));
    expect(b.x).toBeGreaterThan(c.x);
    expect(b.y).toBeGreaterThan(c.y);
  });

  it('swings the main hand and leaves it at rest when idle', () => {
    const rest = pos(heldItemMatrix('handheld', false, 0, 0, new THREE.Matrix4()));
    const mid = pos(heldItemMatrix('handheld', false, 0.5, 0, new THREE.Matrix4()));
    expect(rest.distanceTo(mid)).toBeGreaterThan(0.1);
    const end = pos(heldItemMatrix('handheld', false, 1, 0, new THREE.Matrix4()));
    expect(rest.distanceTo(end)).toBeLessThan(1e-4);
  });
});

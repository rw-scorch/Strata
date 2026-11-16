import { describe, it, expect } from 'vitest';
import { WorldSim, newPlayer, WorldStore, SimEvent } from '../src/core/sim/WorldSim';
import { WorldGenerator } from '../src/core/worldgen/WorldGenerator';
import { ChunkData } from '../src/core/chunk';
import { B, blockId } from '../src/core/blocks';
import { PRANKS } from '../src/core/sim/mischief';

function world() {
  const gen = new WorldGenerator(5);
  const chunks = new Map<string, ChunkData>();
  const get = (cx: number, cz: number) => { const k = `${cx},${cz}`; let c = chunks.get(k); if (!c) { c = new ChunkData(cx, cz); chunks.set(k, c); } return c; };
  const store: WorldStore = { getBlock: (x, y, z) => get(x >> 4, z >> 4).get(x & 15, y, z & 15), setBlock: (x, y, z, v) => get(x >> 4, z >> 4).set(x & 15, y, z & 15, v), isLoaded: () => true, raw: (cx, cz) => get(cx, cz).blocks };
  for (let x = -40; x <= 40; x++) for (let z = -40; z <= 40; z++) for (let y = 1; y < 10; y++) store.setBlock(x, y, z, B.STONE);
  const events: SimEvent[] = [];
  const sim = new WorldSim({ seed: 5, store, gen, difficulty: 'peaceful', emit: (e) => events.push(e), validateMoves: false, authoritative: true, spawn: { x: 0, y: 10, z: 0 } });
  const admin = newPlayer('a', 'Admin', 'survival', { x: 0.5, y: 10, z: 0.5 });
  const mark = newPlayer('b', 'Mark', 'survival', { x: 20.5, y: 10, z: 20.5 });
  admin.op = true;
  sim.addPlayer(admin); sim.addPlayer(mark);
  for (const p of [admin, mark]) p.y = 10;
  admin.x = 0.5; admin.z = 0.5; mark.x = 20.5; mark.z = 20.5;
  const at = (x: number, y: number, z: number) => blockId(store.getBlock(x, y, z));
  return { sim, admin, mark, at, events };
}

describe('v36 Mischief Console', () => {
  it('is admin only', () => {
    const { sim, mark } = world();
    expect(sim.command(mark, '/troll smite Admin')).toMatch(/permission/);
  });

  it('every prank runs without errors', () => {
    const { sim, admin } = world();
    for (const pr of PRANKS) expect(sim.command(admin, `/troll ${pr.id} Mark`)).toContain(pr.name);
    for (let i = 0; i < 120; i++) sim.tick();
  });

  it('Skyfall Lance locks on, then strikes without breaking blocks', () => {
    const { sim, admin, mark, at, events } = world();
    const hp = mark.health;
    sim.command(admin, '/troll skyfall Mark');
    expect(events.some((e) => e.e === 'title' && e.to === 'b')).toBe(true);
    for (let i = 0; i < 40; i++) sim.tick();
    expect(mark.health).toBe(hp);
    for (let i = 0; i < 50; i++) sim.tick();
    expect(events.some((e) => e.e === 'lightning')).toBe(true);
    expect(mark.health).toBeLessThan(hp);
    expect(at(20, 9, 20)).toBe(B.STONE);
  });

  it('the raze version carves a crater', () => {
    const { sim, admin, at } = world();
    sim.command(admin, '/troll skyfall_raze Mark');
    for (let i = 0; i < 90; i++) sim.tick();
    expect(at(20, 9, 20)).toBe(0);
  });

  it('Obsidian Cell seals the target in', () => {
    const { sim, admin, at } = world();
    sim.command(admin, '/troll cell Mark');
    expect(at(21, 10, 20)).toBe(B.OBSIDIAN);
    expect(at(20, 12, 20)).toBe(B.OBSIDIAN);
    expect(at(21, 11, 20)).toBe(B.GLASS);
    expect(at(20, 10, 20)).toBe(0);
  });

  it('Frostbind holds them in place', () => {
    const { sim, admin, mark } = world();
    sim.command(admin, '/troll frostbind Mark');
    sim.tick();
    mark.x += 5;
    for (let i = 0; i < 8; i++) sim.tick();
    expect(mark.x).toBeCloseTo(20.5, 1);
    for (let i = 0; i < 130; i++) sim.tick();
    mark.x += 5;
    for (let i = 0; i < 8; i++) sim.tick();
    expect(mark.x).toBeGreaterThan(24);
  });

  it('targets everyone else with @o', () => {
    const { sim, admin, mark } = world();
    sim.command(admin, '/troll hotfoot @o');
    expect(mark.fireT).toBeGreaterThan(0);
    expect(admin.fireT).toBe(0);
  });
});

describe('v36 fluids move things', () => {
  it('flowing water carries items and mobs along', () => {
    const { sim } = world();
    const store = (sim as unknown as { store: WorldStore }).store;
    for (let x = -10; x <= 10; x++) { store.setBlock(x, 9, 30, B.STONE); store.setBlock(x, 11, 29, B.STONE); store.setBlock(x, 11, 31, B.STONE); store.setBlock(x, 10, 29, B.STONE); store.setBlock(x, 10, 31, B.STONE); }
    sim.setBlock(-10, 10, 30, B.WATER);
    for (let i = 0; i < 400; i++) sim.tick();
    const mob = sim.spawnMob('woolhorn', -6.5, 10, 30.5);
    const x0 = mob.x;
    for (let i = 0; i < 60; i++) sim.tick();
    expect(mob.x).toBeGreaterThan(x0 + 1.5);
  });
});

describe('v36 Unstable-style orbital strike', () => {
  it('Nuke rains rings of TNT and leaves a crater', () => {
    const { sim, admin, at } = world();
    expect(sim.command(admin, '/troll orbital_nuke at 0 9 25')).toContain('Nuke');
    for (let i = 0; i < 58; i++) sim.tick();
    const tnt = [...sim.entities.values()].filter((e) => e.kind === 'tnt').length;
    expect(tnt).toBeGreaterThan(20);
    const t0 = performance.now();
    let worst = 0;
    for (let i = 0; i < 160; i++) { const a = performance.now(); sim.tick(); worst = Math.max(worst, performance.now() - a); }
    const ms = performance.now() - t0;
    console.log('worst tick', Math.round(worst));
    expect([...sim.entities.values()].filter((e) => e.kind === 'tnt').length).toBe(0);
    let gone = 0;
    for (let x = -12; x <= 12; x += 3) for (let z = 13; z <= 37; z += 3) if (at(x, 9, z) === 0) gone++;
    expect(gone).toBeGreaterThan(30);
    console.log('nuke ms', Math.round(ms));
  });

  it('Stab drills deep', () => {
    const { sim, admin, at } = world();
    sim.command(admin, '/troll orbital_stab at 0 9 25');
    for (let i = 0; i < 400; i++) sim.tick();
    expect(at(0, 3, 25)).toBe(0);
  });

  it('needs a player for non-aimable pranks', () => {
    const { sim, admin } = world();
    expect(sim.command(admin, '/troll cell at 0 9 0')).toMatch(/needs a player/);
  });
});

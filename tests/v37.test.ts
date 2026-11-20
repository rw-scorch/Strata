import { describe, it, expect } from 'vitest';
import { WorldSim, newPlayer, WorldStore, SimEvent } from '../src/core/sim/WorldSim';
import { WorldGenerator } from '../src/core/worldgen/WorldGenerator';
import { ChunkData } from '../src/core/chunk';
import { B } from '../src/core/blocks';
import { NETHER_X } from '../src/core/dimension';

function flat(gen = new WorldGenerator(5)) {
  const chunks = new Map<string, ChunkData>();
  const get = (cx: number, cz: number) => { const k = `${cx},${cz}`; let c = chunks.get(k); if (!c) { c = new ChunkData(cx, cz); chunks.set(k, c); } return c; };
  const store: WorldStore = { getBlock: (x, y, z) => get(x >> 4, z >> 4).get(x & 15, y, z & 15), setBlock: (x, y, z, v) => get(x >> 4, z >> 4).set(x & 15, y, z & 15, v), isLoaded: () => true, raw: (cx, cz) => get(cx, cz).blocks };
  const events: SimEvent[] = [];
  const sim = new WorldSim({ seed: 5, store, gen, difficulty: 'normal', emit: (e) => events.push(e), validateMoves: false, authoritative: true, spawn: { x: 0, y: 10, z: 0 } });
  sim.settings.mobSpawning = false;
  return { sim, store, events };
}

describe('v37 ghasts', () => {
  it('fire once every three seconds like Java', () => {
    const { sim, store } = flat();
    for (let x = -30; x <= 30; x++) for (let z = -30; z <= 30; z++) store.setBlock(NETHER_X + x, 40, z, B.STONE);
    const p = newPlayer('a', 'A', 'survival', { x: NETHER_X + 0.5, y: 41, z: 0.5 });
    sim.addPlayer(p);
    const g = sim.spawnMob('wailer', NETHER_X + 0.5, 60, 20.5);
    let shots = 0;
    for (let i = 0; i < 600; i++) {
      p.x = NETHER_X + 0.5; p.y = 41; p.z = 0.5; p.health = 20; g.x = NETHER_X + 0.5; g.y = 60; g.z = 20.5;
      sim.tick();
      for (const e of sim.entities.values()) if (e.kind === 'fireball' && !(e as { counted?: boolean }).counted) { (e as { counted?: boolean }).counted = true; shots++; }
    }
    expect(shots).toBeGreaterThanOrEqual(9);
    expect(shots).toBeLessThanOrEqual(11);
  });

  it('a punched fireball flies back and kills the ghast', () => {
    const { sim, store } = flat();
    for (let x = -30; x <= 30; x++) for (let z = -30; z <= 30; z++) store.setBlock(NETHER_X + x, 40, z, B.STONE);
    const p = newPlayer('a', 'A', 'survival', { x: NETHER_X + 0.5, y: 41, z: 0.5 });
    sim.addPlayer(p);
    const g = sim.spawnMob('wailer', NETHER_X + 0.5, 50, 16.5);
    let fb = null as null | { id: number; x: number; y: number; z: number };
    for (let i = 0; i < 200 && !fb; i++) { p.x = NETHER_X + 0.5; p.y = 41; p.z = 0.5; g.x = NETHER_X + 0.5; g.y = 50; g.z = 16.5; sim.tick(); fb = [...sim.entities.values()].find((e) => e.kind === 'fireball') ?? null; }
    expect(fb).toBeTruthy();
    for (let i = 0; i < 60; i++) { if (Math.hypot(fb!.x - p.x, fb!.y - p.y - 1.6, fb!.z - p.z) < 4) break; p.x = NETHER_X + 0.5; p.y = 41; p.z = 0.5; g.x = NETHER_X + 0.5; g.y = 50; g.z = 16.5; sim.tick(); }
    const dx = g.x - p.x, dy = g.y + 2 - (p.y + 1.62), dz = g.z - p.z;
    p.yaw = Math.atan2(-dx, -dz); p.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    expect(sim.attack(p, fb!.id)).toBe(true);
    for (let i = 0; i < 60 && sim.entities.has(g.id); i++) { g.x = NETHER_X + 0.5; g.y = 50; g.z = 16.5; sim.tick(); }
    expect(sim.entities.has(g.id)).toBe(false);
  });
});

describe('v37 fluids push everything', () => {
  it('flowing water carries primed TNT', () => {
    const { sim, store } = flat();
    sim.settings.mobSpawning = false;
    const p = newPlayer('a', 'A', 'creative', { x: 0.5, y: 30, z: 0.5 });
    sim.addPlayer(p);
    for (let x = -10; x <= 10; x++) { store.setBlock(x, 9, 5, B.STONE); for (const z of [4, 6]) { store.setBlock(x, 10, z, B.STONE); store.setBlock(x, 11, z, B.STONE); } }
    store.setBlock(-11, 10, 5, B.STONE);
    sim.setBlock(-10, 10, 5, B.WATER);
    for (let i = 0; i < 300; i++) sim.tick();
    const t = sim.spawnPrimed(-6.5, 10, 5.5, 79, 0, 0, 0);
    const x0 = t.x;
    for (let i = 0; i < 60; i++) sim.tick();
    expect(t.x).toBeGreaterThan(x0 + 1.5);
  });
});

describe('v37 commands', () => {
  it('locate needs admin or creative', () => {
    const { sim } = flat();
    const p = newPlayer('a', 'A', 'survival', { x: 0.5, y: 30, z: 0.5 });
    sim.addPlayer(p);
    expect(sim.command(p, '/locate village')).toMatch(/permission/);
    expect(sim.command(p, '/setspawn')).toMatch(/permission/);
    expect(sim.command(p, '/spawn')).toMatch(/world spawn/);
    expect(sim.command(p, '/help')).not.toMatch(/\/give/);
  });

  it('locates every structure kind', () => {
    const { sim } = flat(new WorldGenerator(42));
    const p = newPlayer('a', 'A', 'creative', { x: 0.5, y: 80, z: 0.5 });
    p.op = true;
    sim.addPlayer(p);
    for (const k of ['ruined_portal', 'fortress', 'bastion', 'stronghold', 'trial_chamber']) expect(sim.command(p, `/locate ${k}`)).toMatch(/Nearest/);
    expect(sim.command(p, '/locate fortress')).toMatch(/in the Nether/);
    expect(sim.command(p, '/locate nonsense')).toMatch(/Usage/);
  });
});

describe('v37 portals', () => {
  it('items thrown into a portal come out in the Nether through a new portal', () => {
    const { sim, store } = flat();
    const p = newPlayer('a', 'A', 'creative', { x: 30.5, y: 30, z: 0.5 });
    sim.addPlayer(p);
    for (let i = -1; i <= 2; i++) for (let h = -1; h <= 3; h++) store.setBlock(i, 20 + h, 0, (i === -1 || i === 2 || h === -1 || h === 3) ? B.OBSIDIAN : 0);
    for (let x = -3; x <= 4; x++) for (let z = -3; z <= 3; z++) store.setBlock(x, 18, z, B.STONE);
    expect(sim.lightPortal(0, 20, 0)).toBe(true);
    for (let x = -20; x <= 20; x++) for (let z = -20; z <= 20; z++) store.setBlock(NETHER_X + x, 50, z, B.STONE);
    const it2 = sim.spawnMob('fernhen', 0.5, 20, 0.5);
    for (let i = 0; i < 20; i++) sim.tick();
    expect(it2.x).toBeGreaterThan(NETHER_X - 100);
  });

  it('players get a travel start and end event', () => {
    const { sim, store, events } = flat();
    for (let i = -1; i <= 2; i++) for (let h = -1; h <= 3; h++) store.setBlock(i, 20 + h, 0, (i === -1 || i === 2 || h === -1 || h === 3) ? B.OBSIDIAN : 0);
    sim.lightPortal(0, 20, 0);
    const p = newPlayer('a', 'A', 'creative', { x: 0.5, y: 20, z: 0.5 });
    sim.addPlayer(p);
    let went = false;
    for (let i = 0; i < 200; i++) { if (!went) { p.x = 0.5; p.y = 20; p.z = 0.5; } sim.tick(); if (p.travel) went = true; if (went && !p.travel) break; }
    const tr = events.filter((e) => e.e === 'travel') as Extract<SimEvent, { e: 'travel' }>[];
    expect(tr.map((e) => e.phase)).toEqual(['start', 'end']);
    expect(tr[0].nether).toBe(true);
  });
});

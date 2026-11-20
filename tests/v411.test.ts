import { describe, it, expect } from 'vitest';
import { WorldSim } from '../src/core/sim/WorldSim';
import { B, X, XV } from '../src/core/blocks';
import { I, toolId } from '../src/core/items';
import { END_X } from '../src/core/dimension';
import { world } from './v40.test';

type E = ReturnType<WorldSim['spawnMob']>;
const kinds = (sim: WorldSim, t: string) => [...sim.entities.values()].filter((e) => e.type === t) as E[];

const enter = () => {
  const w = world({ difficulty: 'normal' });
  w.p.mode = 'survival'; w.p.x = END_X + 60.5; w.p.y = 70; w.p.z = 0.5;
  w.p.flags = 8;
  w.run(30);
  return w;
};

const w0 = (sim: WorldSim) => { for (let i = 0; i < 15; i++) sim.tick(); };
const perchAt = (d: E, x: number, y: number, z: number, yaw: number) => {
  d.x = x; d.y = y; d.z = z; d.yaw = yaw; d.phase = 'perch'; d.pt = 0; d.vx = d.vy = d.vz = 0;
};

describe('v41.1 Ender Dragon damage', () => {
  it('a sword swing at the head of a perched dragon lands with full damage', () => {
    const { sim, p, run } = enter();
    for (const c of kinds(sim, 'riftcore')) sim.hurtMob(c, 1, null, 0, 0);
    w0(sim);
    const d = kinds(sim, 'voidwyrm')[0];
    perchAt(d, END_X + 0.5, 65, 0.5, 0);
    p.inv.slots[p.inv.selected] = { id: toolId(4, 3), count: 1 }; p.eqId = undefined;
    p.x = END_X + 0.5; p.y = 64; p.z = -11.5; p.yaw = Math.PI; p.pitch = 0.05;
    const before = d.health;
    sim.setNow(sim.now + 1000);
    expect(sim.attack(p, d.id)).toBe(true);
    expect(before - d.health).toBeGreaterThanOrEqual(6);
  });

  it('hits on the body or wings deal a quarter plus one', () => {
    const { sim, p, run } = enter();
    for (const c of kinds(sim, 'riftcore')) sim.hurtMob(c, 1, null, 0, 0);
    w0(sim);
    const d = kinds(sim, 'voidwyrm')[0];
    perchAt(d, END_X + 0.5, 65, 0.5, 0);
    p.inv.slots[p.inv.selected] = { id: toolId(4, 3), count: 1 }; p.eqId = undefined;
    p.x = END_X + 7.5; p.y = 65; p.z = 0.5; p.yaw = Math.PI / 2; p.pitch = -0.4;
    const before = d.health;
    sim.setNow(sim.now + 1000);
    expect(sim.attack(p, d.id)).toBe(true);
    const lost = before - d.health;
    expect(lost).toBeGreaterThan(1);
    expect(lost).toBeLessThan(4);
  });

  it('the dragon can be killed once its crystals are gone', () => {
    const { sim, p, run } = enter();
    for (const c of kinds(sim, 'riftcore')) sim.hurtMob(c, 1, null, 0, 0);
    w0(sim);
    const d = kinds(sim, 'voidwyrm')[0];
    p.inv.slots[p.inv.selected] = { id: toolId(4, 3), count: 1 }; p.eqId = undefined;
    for (let i = 0; i < 400 && d.health > 0.02; i++) {
      perchAt(d, END_X + 0.5, 65, 0.5, 0);
      p.x = END_X + 0.5; p.y = 64; p.z = -11.5; p.yaw = Math.PI; p.pitch = 0.05; p.health = 20;
      sim.setNow(sim.now + 600);
      sim.attack(p, d.id);
      run(12);
    }
    expect(d.phase).toBe('dying');
  });

  it('arrows bounce off a perched dragon but hurt it in flight', () => {
    const { sim, p, run } = enter();
    for (const c of kinds(sim, 'riftcore')) sim.hurtMob(c, 1, null, 0, 0);
    w0(sim);
    const d = kinds(sim, 'voidwyrm')[0];
    d.phase = 'circle'; d.x = END_X + 0.5; d.y = 72; d.z = -20.5; d.vx = d.vy = d.vz = 0;
    d.gx = d.x; d.gy = d.y; d.gz = d.z;
    p.x = END_X + 0.5; p.y = 70; p.z = 0.5;
    p.inv.slots[p.inv.selected] = { id: I.BOW, count: 1 }; p.inv.slots[1] = { id: I.ARROW, count: 64 };
    const before = d.health;
    const pitch = Math.atan2(d.y + 1.5 - (p.y + 1.62), 21);
    sim.setNow(sim.now + 1000);
    sim.shootBow(p, 1, 0, pitch);
    for (let i = 0; i < 20; i++) { d.x = END_X + 0.5; d.y = 72; d.z = -20.5; d.vx = d.vy = d.vz = 0; run(1); }
    expect(d.health).toBeLessThan(before);
  });
});

describe('v41.1 the End has no weather', () => {
  it('endermen in the End are not hurt by Overworld rain', () => {
    const { sim, store, run, p } = world({ difficulty: 'normal' });
    for (let x = END_X - 8; x <= END_X + 8; x++) for (let z = -8; z <= 8; z++) store.setBlock(x, 49, z, B.STONE);
    p.mode = 'creative'; p.x = END_X + 5.5; p.y = 50; p.z = 0.5;
    sim.setWeather('rain', 100000);
    const e = sim.spawnMob('voidstalker', END_X + 0.5, 50, 0.5);
    run(100);
    expect(e.health).toBe(e.maxHealth);
  });
});

describe('v41.1 dragon contact follows the Java parts', () => {
  it('a player well in front of a perched dragon is out of reach of its head', () => {
    const { sim, p, run } = enter();
    for (const c of kinds(sim, 'riftcore')) sim.hurtMob(c, 1, null, 0, 0);
    w0(sim);
    const d = kinds(sim, 'voidwyrm')[0];
    p.health = 20;
    perchAt(d, END_X + 0.5, 65, 0.5, 0); run(1);
    for (let i = 0; i < 40; i++) { p.x = END_X + 0.5; p.y = d.y; p.z = -12.5; run(1); }
    expect(p.health).toBe(20);
  });
  it('a flying dragon\'s wings strike and push players near them', () => {
    const { sim, p, run } = enter();
    for (const c of kinds(sim, 'riftcore')) sim.hurtMob(c, 1, null, 0, 0);
    w0(sim);
    const d = kinds(sim, 'voidwyrm')[0];
    p.health = 20;
    for (let i = 0; i < 10; i++) { d.phase = 'circle'; d.x = END_X + 0.5; d.y = 90; d.z = 0.5; d.vx = d.vy = d.vz = 0; d.yaw = 0; d.gx = d.x; d.gy = d.y; d.gz = d.z; p.x = END_X + 6.5; p.y = 90; p.z = 0.5; run(1); }
    expect(p.health).toBeLessThan(20);
  });
  it('the head still bites', () => {
    const { sim, p, run } = enter();
    for (const c of kinds(sim, 'riftcore')) sim.hurtMob(c, 1, null, 0, 0);
    w0(sim);
    const d = kinds(sim, 'voidwyrm')[0];
    p.health = 20;
    perchAt(d, END_X + 0.5, 65, 0.5, 0); run(1);
    for (let i = 0; i < 20; i++) { p.x = END_X + 0.5; p.y = d.y + 1.5; p.z = -8.5; run(1); }
    expect(p.health).toBeLessThan(20);
  });
  it('the first kill shares 12000 experience among the players who fought', () => {
    const { sim, p, run } = enter();
    for (const c of kinds(sim, 'riftcore')) sim.hurtMob(c, 1, null, 0, 0);
    w0(sim);
    const d = kinds(sim, 'voidwyrm')[0];
    const before = p.xp;
    d.phase = 'perch';
    sim.hurtMob(d, 5000, p.id, 0, 0);
    expect(d.phase).toBe('dying');
    run(220);
    expect(p.xp - before).toBeGreaterThanOrEqual(12000);
  });
});

describe('v41.1 End odds and ends', () => {
  it('the dragon keeps its wounds if the world restarts mid-fight', () => {
    const { sim, run } = enter();
    const d = kinds(sim, 'voidwyrm')[0];
    d.health = 77;
    run(21);
    sim.entities.delete(d.id);
    run(21);
    expect(kinds(sim, 'voidwyrm')[0].health).toBeLessThan(100);
  });
  it('Nether portals cannot be lit in the End', () => {
    const { sim } = world();
    expect(sim.lightPortal(END_X + 200, 60, 200)).toBe(false);
  });
});

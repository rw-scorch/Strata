import { describe, it, expect } from 'vitest';
import { WorldSim, WorldStore, newPlayer, MF, SimPlayer } from '../src/core/sim/WorldSim';
import { WorldGenerator } from '../src/core/worldgen/WorldGenerator';
import { ChunkData } from '../src/core/chunk';
import { B, makeBlock, shapeBlock } from '../src/core/blocks';
import { LocalPlayer as Player } from '../src/game/Player';
import { InputState } from '../src/controls/InputState';
import { aimAngle } from '../src/core/sim/anticheat';

function server() {
  const chunks = new Map<string, ChunkData>();
  const get = (cx: number, cz: number) => { const k = `${cx},${cz}`; let c = chunks.get(k); if (!c) { c = new ChunkData(cx, cz, new Uint32Array(16 * 16 * 160)); chunks.set(k, c); } return c; };
  const store: WorldStore = { getBlock: (x, y, z) => get(x >> 4, z >> 4).get(x & 15, y, z & 15), setBlock: (x, y, z, v) => get(x >> 4, z >> 4).set(x & 15, y, z & 15, v), isLoaded: () => true, raw: (cx, cz) => get(cx, cz).blocks };
  for (let x = -160; x <= 160; x++) for (let z = -160; z <= 160; z++) store.setBlock(x, 9, z, B.STONE);
  const events: { e: string; [k: string]: unknown }[] = [];
  const sim = new WorldSim({ seed: 5, store, gen: new WorldGenerator(5), difficulty: 'peaceful', emit: (e) => events.push(e as never), validateMoves: true, authoritative: true, spawn: { x: 0, y: 10, z: 0 } });
  const p = newPlayer('a', 'A', 'survival', { x: 0.5, y: 10, z: 0.5 });
  sim.addPlayer(p); p.x = 0.5; p.y = 10; p.z = 0.5;
  const step = (n = 2) => { for (let i = 0; i < n; i++) sim.tick(); };
  step(80);
  sim.move(p, p.x, p.y, p.z, 0, 0, MF.GROUND);
  sim.wardReset(p, 0);
  p.ward!.grace = 0;
  const reader = { getBlock: (x: number, y: number, z: number) => store.getBlock(x, y, z), isLoaded: () => true };
  return { sim, store, p, step, events, reader };
}

const flags = (pl: Player) => pl.flags();
const vl = (p: SimPlayer) => Object.values(p.ward?.vl ?? {}).reduce((a, b) => a + (b ?? 0), 0);

function drive(w: ReturnType<typeof server>, ticks: number, input: (i: InputState, t: number) => void, pl = new Player()) {
  if (!pl.frozen || pl.body.x === 0) pl.setPos(w.p.x, w.p.y, w.p.z);
  const i = new InputState();
  let rejected = 0;
  for (let t = 0; t < ticks; t++) {
    input(i, t);
    pl.update(0.05, i, w.reader, 'survival', false);
    w.sim.tick();
    if (t % 2 === 1) { const bx = w.p.x, by = w.p.y, bz = w.p.z; void bx; void by; void bz; (globalThis as { lastSent?: unknown }).lastSent = [pl.body.x.toFixed(3), pl.body.y.toFixed(3), pl.body.z.toFixed(3), pl.body.onGround, pl.body.vy.toFixed(3)]; if (!w.sim.move(w.p, pl.body.x, pl.body.y, pl.body.z, pl.yaw, pl.pitch, flags(pl))) { rejected++; pl.setPos(w.p.x, w.p.y, w.p.z); } }
  }
  return { pl, rejected };
}

describe('v46 Warden: honest play is never flagged', () => {
  it('walking, sprinting, sprint-jumping and strafing', () => {
    const w = server();
    const r = drive(w, 400, (i, t) => { i.moveZ = 1; i.sprint = t > 40; i.jump = t > 120 && t < 300; i.moveX = t > 200 ? Math.sin(t / 20) : 0; });
    expect(r.rejected).toBe(0);
    expect(vl(w.p)).toBe(0);
    expect(Math.hypot(w.p.x - 0.5, w.p.z - 0.5)).toBeGreaterThan(20);
  });

  it('falling off a tower and landing', () => {
    const w = server();
    for (let y = 10; y < 30; y++) w.store.setBlock(0, y, 0, B.STONE);
    w.p.y = 30; w.sim.wardReset(w.p, 0); w.p.ward!.grace = 0;
    const r = drive(w, 120, (i) => { i.moveZ = 0.6; });
    expect(r.rejected).toBe(0);
    expect(vl(w.p)).toBe(0);
    expect(w.p.health).toBeLessThan(20);
  });

  it('jumping up a staircase and across gaps', () => {
    const w = server();
    for (let k = 0; k < 10; k++) for (let z = -2; z <= 2; z++) for (let y = 10; y <= 10 + k; y++) w.store.setBlock(-2 - k, y, z, B.STONE);
    const r = drive(w, 200, (i) => { i.moveZ = 1; i.jump = true; i.sprint = true; }, (() => { const pl = new Player(); pl.yaw = Math.PI / 2; return pl; })());
    expect(r.rejected).toBe(0);
    expect(vl(w.p)).toBe(0);
  });
});

describe('v46 Warden: tricky honest movement', () => {
  const scenes: [string, (w: ReturnType<typeof server>) => void, (i: InputState, t: number) => void, number][] = [
    ['sprint-jumping on packed ice', (w) => { for (let x = -40; x <= 40; x++) for (let z = -120; z <= 4; z++) w.store.setBlock(x, 9, z, B.PACKED_ICE); }, (i) => { i.moveZ = 1; i.sprint = true; i.jump = true; }, 300],
    ['walking up slabs and stairs', (w) => { for (let k = 0; k < 20; k++) for (let x = -2; x <= 2; x++) { for (let y = 10; y < 10 + Math.floor(k / 2); y++) w.store.setBlock(x, y, -2 - k, B.STONE); if (k % 2) w.store.setBlock(x, 10 + Math.floor(k / 2), -2 - k, shapeBlock(0, false, 0)); } }, (i) => { i.moveZ = 1; }, 300],
    ['swimming across a lake', (w) => { for (let x = -10; x <= 10; x++) for (let z = -80; z <= -2; z++) for (let y = 5; y <= 9; y++) w.store.setBlock(x, y, z, y === 5 ? B.STONE : B.WATER); }, (i, t) => { i.moveZ = 1; i.sprint = true; i.jump = t % 40 < 10; }, 400],
    ['climbing a ladder', (w) => { for (let y = 10; y < 30; y++) { w.store.setBlock(0, y, -2, B.STONE); w.store.setBlock(0, y, -1, makeBlock(B.LADDER, 0)); } }, (i) => { i.moveZ = 1; }, 300],
    ['bouncing on slime', (w) => { for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) w.store.setBlock(x, 9, z, B.SLIME_BLOCK); w.p.y = 25; }, () => {}, 200],
    ['crawling under a one-block gap', (w) => { for (let z = -20; z <= -2; z++) for (let x = -1; x <= 1; x++) w.store.setBlock(x, 11, z, B.STONE); }, (i) => { i.moveZ = 1; }, 300],
  ];
  for (const [name, build, input, ticks] of scenes) it(name, () => {
    const w = server();
    build(w);
    w.sim.wardReset(w.p, 0); w.p.ward!.grace = 0;
    const orig = w.sim.wardFlag.bind(w.sim);
    w.sim.wardFlag = (pp, c, a, info) => { if (process.env.DBG) console.log('FLAG', name, c, pp.x.toFixed(3), pp.y.toFixed(3), pp.z.toFixed(3), JSON.stringify((globalThis as { lastSent?: unknown }).lastSent)); orig(pp, c, a, info); };
    const r = drive(w, ticks, input);
    expect({ rejected: r.rejected, flags: w.sim.wardLog.map((f) => `${f.check}: ${f.info}`) }).toEqual({ rejected: 0, flags: [] });
  });

  it('knockback and explosions do not count against you', () => {
    const w = server();
    for (let k = 0; k < 6; k++) { w.step(2); w.sim.damage(w.p, 1, 'mob', w.p.x + 1, w.p.z, true, false, undefined, 2); w.sim.move(w.p, w.p.x - 1.4, 10.8, w.p.z, 0, 0, 0); }
    expect(w.sim.wardLog.length).toBe(0);
  });
});

describe('v46 Warden: cheats are caught', () => {
  it('speed: moving at 15 m/s is pulled back', () => {
    const w = server();
    let rejected = 0;
    for (let t = 0; t < 30; t++) { w.step(2); if (!w.sim.move(w.p, w.p.x + 1.5, 10, w.p.z, 0, 0, MF.GROUND | MF.SPRINT)) rejected++; }
    expect(rejected).toBeGreaterThan(0);
    expect(w.sim.wardLog.some((f) => f.check === 'speed')).toBe(true);
  });

  it('fly: rising without support and hovering are pulled back', () => {
    const w = server();
    let rejected = 0;
    for (let t = 0; t < 10; t++) { w.step(2); if (!w.sim.move(w.p, w.p.x, w.p.y + 0.6, w.p.z, 0, 0, 0)) rejected++; }
    expect(rejected).toBeGreaterThan(0);
    const w2 = server();
    w2.sim.move(w2.p, 0.5, 11, 0.5, 0, 0, 0);
    let r2 = 0;
    for (let t = 0; t < 40; t++) { w2.step(2); if (!w2.sim.move(w2.p, 0.5 + t * 0.01, 11, 0.5, 0, 0, 0)) r2++; }
    expect(r2).toBeGreaterThan(0);
    expect(w2.sim.wardLog.some((f) => f.check === 'fly')).toBe(true);
  });

  it('no-fall: claiming the ground in mid-air does not dodge fall damage', () => {
    const w = server();
    w.p.y = 30; w.sim.wardReset(w.p, 0); w.p.ward!.grace = 0; w.p.peakY = 30;
    for (let y = 29; y >= 10; y -= 1) { w.step(1); w.sim.move(w.p, 0.5, Math.max(10, y), 0.5, 0, 0, MF.GROUND); }
    expect(w.p.health).toBeLessThan(10);
    expect(w.sim.wardLog.some((f) => f.check === 'nofall')).toBe(true);
  });

  it('phase: walking through a wall is pulled back', () => {
    const w = server();
    for (let y = 10; y < 13; y++) for (let z = -3; z <= 3; z++) w.store.setBlock(2, y, z, B.STONE);
    let rejected = 0;
    for (let t = 0; t < 12; t++) { w.step(2); if (!w.sim.move(w.p, Math.min(4.5, 0.5 + t * 0.3), 10, 0.5, 0, 0, MF.GROUND)) rejected++; }
    expect(rejected).toBeGreaterThan(0);
    expect(w.p.x).toBeLessThan(2);
  });

  it('aim, auto-clicking and multi-target hits are refused', () => {
    expect(aimAngle(0, 0, 0, 0, -3)).toBeLessThan(1);
    expect(aimAngle(0, 0, 0, 0, 3)).toBeGreaterThan(179);
    const w = server();
    w.sim.settings.pvp = true;
    const t = newPlayer('b', 'B', 'survival', { x: 0.5, y: 10, z: 3.5 });
    w.sim.addPlayer(t); t.x = 0.5; t.y = 10; t.z = 3.5;
    w.p.yaw = 0; w.p.pitch = 0;
    expect(w.sim.attackPlayer(w.p, 'b')).toBe(false);
    expect(w.sim.wardLog.some((f) => f.check === 'aim')).toBe(true);
    w.p.yaw = Math.PI;
    let ok = 0;
    for (let k = 0; k < 30; k++) { w.sim.setNow(w.sim.now + 30); if (w.sim.attackPlayer(w.p, 'b')) ok++; }
    expect(ok).toBeLessThan(25);
    expect(w.sim.wardLog.some((f) => f.check === 'clicks')).toBe(true);
  });

  it('fast placing is limited', () => {
    const w = server();
    w.p.inv.slots[0] = { id: B.STONE, count: 64 };
    let placed = 0;
    for (let k = 0; k < 24; k++) { w.sim.setNow(w.sim.now + 30); if (w.sim.place(w.p, 2 + (k % 4), 9, -2 + Math.floor(k / 4), 0, 1, 0)) placed++; }
    expect(placed).toBeLessThanOrEqual(15);
    expect(w.sim.wardLog.some((f) => f.check === 'fastplace')).toBe(true);
  });

  it('reaching the limit removes the player, then bars repeat offenders', () => {
    const w = server();
    w.sim.settings.anticheat = { on: true, level: 'normal', kick: 12, exemptOps: true, alerts: true };
    for (let t = 0; t < 30; t++) { w.step(2); w.sim.move(w.p, w.p.x + 1.5, 10, w.p.z, 0, 0, MF.GROUND); }
    const kicks = w.events.filter((e) => e.e === 'kick') as { banMs: number }[];
    expect(kicks.length).toBeGreaterThan(0);
    for (let t = 0; t < 30; t++) { w.step(2); w.sim.move(w.p, w.p.x + 1.5, 10, w.p.z, 0, 0, MF.GROUND); }
    const later = w.events.filter((e) => e.e === 'kick') as { banMs: number }[];
    expect(later[later.length - 1].banMs).toBeGreaterThan(0);
  });

  it('creative players, operators and disabled worlds are not checked', () => {
    for (const setup of [(p: SimPlayer) => { p.mode = 'creative'; }, (p: SimPlayer) => { p.op = true; }, (_p: SimPlayer, s: WorldSim) => { s.command(newPlayerOp(s), '/anticheat off'); }]) {
      const w = server();
      setup(w.p, w.sim);
      let rejected = 0;
      for (let t = 0; t < 20; t++) { w.step(2); if (!w.sim.move(w.p, w.p.x + 1.0, 10, w.p.z, 0, 0, MF.GROUND)) rejected++; }
      expect(rejected).toBeLessThanOrEqual(1);
      expect(w.sim.wardLog.length).toBe(0);
    }
  });

  it('operators can read the log and change settings by command', () => {
    const w = server();
    const op = newPlayerOp(w.sim);
    expect(w.sim.command(op, '/anticheat level high')).toMatch(/high/);
    expect(w.sim.wardCfg.level).toBe('high');
    expect(w.sim.command(op, '/anticheat kick off')).toMatch(/never remove/);
    for (let t = 0; t < 20; t++) { w.step(2); w.sim.move(w.p, w.p.x + 1.5, 10, w.p.z, 0, 0, MF.GROUND); }
    expect(w.sim.command(op, '/anticheat log')).toMatch(/Speed/);
    expect(w.sim.command(w.p, '/anticheat off')).toMatch(/Only operators/);
  });
});

function newPlayerOp(s: WorldSim): SimPlayer {
  const o = newPlayer('op1', 'Op', 'creative', { x: 30, y: 10, z: 30 });
  o.op = true;
  s.addPlayer(o);
  return o;
}

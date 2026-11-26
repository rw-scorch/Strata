import { describe, it, expect } from 'vitest';
import { WorldSim, WorldStore, newPlayer, SimPlayer, ruleSnapshot } from '../src/core/sim/WorldSim';
import { WorldGenerator } from '../src/core/worldgen/WorldGenerator';
import { ChunkData } from '../src/core/chunk';
import { B, blockId, getBlock } from '../src/core/blocks';
import { I, getItem } from '../src/core/items';
import { allStacks } from '../src/core/inventory';
import { parseCrucibleArgs, crucibleArgs, sanitizeCrucible, CRUCIBLE_DEFAULTS, ringRadius, kitInv } from '../src/core/sim/crucible';

function world(pvp = false) {
  const chunks = new Map<string, ChunkData>();
  const get = (cx: number, cz: number) => { const k = `${cx},${cz}`; let c = chunks.get(k); if (!c) { c = new ChunkData(cx, cz, new Uint32Array(16 * 16 * 160)); chunks.set(k, c); } return c; };
  const store: WorldStore = { getBlock: (x, y, z) => get(x >> 4, z >> 4).get(x & 15, y, z & 15), setBlock: (x, y, z, v) => get(x >> 4, z >> 4).set(x & 15, y, z & 15, v), isLoaded: () => true, raw: (cx, cz) => get(cx, cz).blocks };
  for (let x = -80; x <= 80; x++) for (let z = -80; z <= 80; z++) for (let y = 5; y <= 9; y++) store.setBlock(x, y, z, B.STONE);
  const events: { e: string; [k: string]: unknown }[] = [];
  const sim = new WorldSim({ seed: 7, store, gen: new WorldGenerator(7), difficulty: 'peaceful', emit: (e) => events.push(e as never), validateMoves: false, authoritative: true, spawn: { x: 0, y: 10, z: 0 } });
  sim.settings.pvp = pvp;
  const bal = new Map<string, number>();
  sim.bank = { on: () => true, take: (id, _n, n) => { const b = bal.get(id) ?? 0; if (b < n) return false; bal.set(id, b - n); return true; }, give: (id, _n, n) => { bal.set(id, (bal.get(id) ?? 0) + n); } };
  const add = (id: string, x: number, z: number, op = false) => { const p = newPlayer(id, id.toUpperCase(), 'survival', { x, y: 10, z }); sim.addPlayer(p); p.x = x + 0.5; p.y = 10; p.z = z + 0.5; p.op = op; return p; };
  const step = (n = 1) => { for (let i = 0; i < n; i++) sim.tick(); };
  const say = (p: SimPlayer, c: string) => sim.command(p, c);
  return { sim, store, events, bal, add, step, say };
}

const msgs = (w: ReturnType<typeof world>) => w.events.filter((e) => e.e === 'msg').map((e) => String(e.text));

describe('v47 Crucible settings', () => {
  it('parses, round-trips and validates', () => {
    const { cfg, err } = parseCrucibleArgs(CRUCIBLE_DEFAULTS, ['r=20', 'kit=own', 'fee=2k', 'prize=mace+:1,golden_apple:3', 'ring=off', 'min=9', 'max=4']);
    expect(err).toBeUndefined();
    expect(cfg.radius).toBe(20);
    expect(cfg.fee).toBe(2000);
    expect(cfg.prize).toEqual([{ key: 'mace', n: 1, maxed: true }, { key: 'golden_apple', n: 3 }]);
    expect(cfg.min).toBe(4);
    expect(sanitizeCrucible(cfg)).toEqual(cfg);
    expect(parseCrucibleArgs(cfg, crucibleArgs(cfg).split(' ')).cfg).toEqual(cfg);
    expect(parseCrucibleArgs(CRUCIBLE_DEFAULTS, ['prize=unobtainium:1']).err).toMatch(/No item/);
    expect(parseCrucibleArgs(CRUCIBLE_DEFAULTS, ['kit=gold!']).err).toBeTruthy();
    expect(parseCrucibleArgs(CRUCIBLE_DEFAULTS, ['r=99']).cfg.radius).toBe(32);
    expect(ruleSnapshot({ pvp: true, cheats: true, guestsBuild: true, dayCycle: true, weatherCycle: true, crucible: cfg })).toHaveProperty('crucible');
  });

  it('closing ring holds for half the fight then shrinks', () => {
    expect(ringRadius(20, true, 0.3)).toBe(20);
    expect(ringRadius(20, true, 0.7)).toBeLessThan(20);
    expect(ringRadius(20, true, 1)).toBe(5);
    expect(ringRadius(20, false, 1)).toBe(20);
  });

  it('kits are armoured and armed', () => {
    const inv = kitInv('diamond', () => {});
    expect(inv.armor.every(Boolean)).toBe(true);
    expect(inv.armor[0]!.en).toEqual({ protection: 2 });
    expect(inv.off[0]!.id).toBe(I.SHIELD);
    expect(inv.slots.some((s) => s && getItem(s.id)?.key.includes('sword'))).toBe(true);
  });
});

describe('v47 Crucible tournament', () => {
  it('runs open, join, fight, champion and restores everyone', () => {
    const w = world(false);
    const host = w.add('host', 0, 0, true), a = w.add('a', 40, 0), b = w.add('b', -40, 0), c = w.add('c', 0, 40), watcher = w.add('w', 0, -40);
    a.inv.slots[0] = { id: I.BREAD, count: 5 };
    c.mode = 'creative';
    w.bal.set('a', 500); w.bal.set('b', 500); w.bal.set('c', 500);
    expect(w.say(host, '/crucible start r=12 fee=100 money=1000 second=200 prize=golden_apple:4 kit=diamond join=30')).toMatch(/open/i);
    expect(blockId(w.sim.get(0, 9, 0))).not.toBe(B.STONE);
    expect(getBlock(w.sim.get(13, 12, 0)).solid).toBe(true);
    expect(w.sim.get(3, 11, 0)).toBe(0);
    expect(msgs(w).some((m) => /\/crucible join/.test(m))).toBe(true);
    for (const p of [a, b, c]) expect(w.say(p, '/crucible join')).toMatch(/You are in/);
    expect(w.bal.get('a')).toBe(400);
    expect(w.say(a, '/crucible join')).toMatch(/already/);
    expect(w.say(a, '/home')).not.toMatch(/inside the Crucible/);
    expect(w.say(a, '/crucible')).toMatch(/3\/16 entered/);
    expect(w.say(a, '/crucible go')).toMatch(/operators/i);
    w.say(host, '/crucible go');
    expect(w.sim.crucible.phase).toBe('ready');
    for (const p of [a, b, c]) {
      expect(Math.hypot(p.x, p.z)).toBeLessThan(12);
      expect(p.mode).toBe('survival');
      expect(p.inv.armor.every(Boolean)).toBe(true);
      expect(p.cru).toBeTruthy();
    }
    expect(a.inv.slots.some((s) => s?.id === I.BREAD)).toBe(false);
    w.sim.damage(a, 10, 'player', b.x, b.z, false, true, 'B');
    expect(a.health).toBe(20);
    expect(w.say(a, '/home')).toMatch(/inside the Crucible/);
    expect(w.say(a, '/give diamond 64')).toMatch(/inside the Crucible/);
    expect(w.sim.pvpOk(a, b)).toBe(false);
    w.step(101);
    expect(w.sim.crucible.phase).toBe('fight');
    expect(w.sim.pvpOk(a, b)).toBe(true);
    expect(w.sim.pvpOk(watcher, a)).toBe(false);
    expect(w.sim.pvpOk(a, watcher)).toBe(false);
    expect(w.sim.pvpOk(watcher, host)).toBe(false);
    expect(w.sim.breakBlock !== undefined).toBe(true);
    const before = [...w.sim.entities.values()].filter((e) => e.kind === 'item').length;
    w.sim.damage(a, 100, 'player', b.x, b.z, false, true, 'B');
    expect(a.dead).toBe(true);
    expect([...w.sim.entities.values()].filter((e) => e.kind === 'item').length).toBe(before);
    expect(msgs(w).some((m) => /A was struck down by B\. 2 remain/.test(m))).toBe(true);
    w.sim.respawn(a);
    expect(a.cru).toBeUndefined();
    expect(Math.hypot(a.x - 40.5, a.z - 0.5)).toBeLessThan(1);
    expect(a.inv.slots[0]).toEqual({ id: I.BREAD, count: 5 });
    w.sim.damage(c, 100, 'player', b.x, b.z, false, true, 'B');
    expect(w.sim.crucible.phase).toBe('done');
    expect(w.bal.get('b')).toBe(400 + 1000 + 300);
    expect(w.bal.get('c')).toBe(400 + 200);
    expect(msgs(w).some((m) => /B is Champion of the Crucible with 2 kills/.test(m))).toBe(true);
    w.step(90);
    expect(w.sim.crucible.active).toBe(false);
    expect(b.cru).toBeUndefined();
    expect(Math.hypot(b.x + 39.5, b.z - 0.5)).toBeLessThan(1);
    expect(allStacks(b.inv).filter((s) => s.id === I.GOLDEN_APPLE).reduce((n, s) => n + s.count, 0)).toBe(4);
    expect(b.inv.armor.some(Boolean)).toBe(false);
    w.sim.respawn(c);
    expect(c.mode).toBe('creative');
    expect(w.events.filter((e) => e.e === 'crucible').at(-1)?.v).toBeNull();
  });

  it('refunds and cancels when too few answer', () => {
    const w = world();
    const host = w.add('host', 0, 0, true), a = w.add('a', 30, 0);
    w.bal.set('a', 100);
    w.say(host, '/crucible start fee=50 join=15');
    w.say(a, '/crucible join');
    expect(w.bal.get('a')).toBe(50);
    w.step(15 * 20 + 2);
    expect(w.sim.crucible.active).toBe(false);
    expect(w.bal.get('a')).toBe(100);
    expect(msgs(w).some((m) => /Not enough challengers/.test(m))).toBe(true);
  });

  it('forfeits and logouts restore gear and end the fight', () => {
    const w = world();
    const host = w.add('host', 0, 0, true), a = w.add('a', 30, 0), b = w.add('b', -30, 0);
    a.inv.slots[3] = { id: I.EMERALD, count: 9 };
    w.say(host, '/crucible start kit=iron arena=here');
    w.say(a, '/crucible join'); w.say(b, '/crucible join');
    w.say(host, '/crucible go');
    w.step(101);
    expect(w.say(a, '/crucible leave')).toMatch(/forfeited/);
    expect(a.inv.slots[3]).toEqual({ id: I.EMERALD, count: 9 });
    expect(Math.hypot(a.x - 30.5, a.z - 0.5)).toBeLessThan(1);
    expect(w.sim.crucible.phase).toBe('done');
    w.step(90);
    const w2 = world();
    const h2 = w2.add('host', 0, 0, true), x = w2.add('x', 30, 0), y = w2.add('y', -30, 0), z = w2.add('z', 0, 30);
    x.inv.slots[0] = { id: I.EMERALD, count: 3 };
    w2.say(h2, '/crucible start kit=netherite');
    for (const p of [x, y, z]) w2.say(p, '/crucible join');
    w2.say(h2, '/crucible go');
    w2.step(101);
    w2.sim.removePlayer('x');
    expect(x.cru).toBeUndefined();
    expect(x.inv.slots[0]).toEqual({ id: I.EMERALD, count: 3 });
    expect(w2.sim.crucible.phase).toBe('fight');
  });

  it('protects the arena and keeps spectators out', () => {
    const w = world();
    const host = w.add('host', 0, 0, true), a = w.add('a', 30, 0), b = w.add('b', -30, 0), spy = w.add('spy', 0, 30);
    w.say(host, '/crucible start r=10');
    expect(w.sim.crucible.locked(spy, 3, 9, 0)).toBe(true);
    w.say(a, '/crucible join'); w.say(b, '/crucible join');
    w.say(host, '/crucible go');
    w.step(101);
    expect(w.sim.crucible.locked(a, 3, 9, 0)).toBe(true);
    expect(w.sim.crucible.locked(a, 3, 11, 0)).toBe(false);
    expect(w.sim.crucible.locked(a, 11, 12, 0)).toBe(true);
    host.mode = 'creative';
    expect(w.sim.crucible.locked(host, 3, 9, 0)).toBe(false);
    spy.x = 2.5; spy.z = 2.5; spy.y = 10;
    w.step(20);
    expect(Math.hypot(spy.x, spy.z)).toBeGreaterThan(10);
    a.x = 9.5; a.z = 0.5;
    w.step(20 * 310);
    expect(w.sim.crucible.phase === 'done' || !w.sim.crucible.active).toBe(true);
    expect(msgs(w).some((m) => /outside the ring/.test(m))).toBe(true);
  });
});

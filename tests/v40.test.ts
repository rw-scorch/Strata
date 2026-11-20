import { describe, it, expect } from 'vitest';
import { WorldSim, WorldStore, newPlayer } from '../src/core/sim/WorldSim';
import { WorldGenerator } from '../src/core/worldgen/WorldGenerator';
import { ChunkData } from '../src/core/chunk';
import { B, CB, FRAME_EYE, blockId, makeBlock, bid } from '../src/core/blocks';
import { I } from '../src/core/items';
import { END_X, END_SPAWN, isEnd } from '../src/core/dimension';
import { EXIT_Y } from '../src/core/worldgen/end';
import { portalRoomCenter } from '../src/core/worldgen/structures';

export function world(opts: { difficulty?: 'peaceful' | 'normal'; gen?: WorldGenerator } = {}) {
  const chunks = new Map<string, ChunkData>();
  const get = (cx: number, cz: number) => { const k = `${cx},${cz}`; let c = chunks.get(k); if (!c) { c = new ChunkData(cx, cz, new Uint32Array(16 * 16 * 160)); chunks.set(k, c); } return c; };
  const store: WorldStore = { getBlock: (x, y, z) => get(x >> 4, z >> 4).get(x & 15, y, z & 15), setBlock: (x, y, z, v) => get(x >> 4, z >> 4).set(x & 15, y, z & 15, v), isLoaded: () => true, raw: (cx, cz) => get(cx, cz).blocks };
  for (let x = -16; x <= 31; x++) for (let z = -16; z <= 16; z++) store.setBlock(x, 9, z, B.STONE);
  const sim = new WorldSim({ seed: 5, store, gen: opts.gen ?? new WorldGenerator(5), difficulty: opts.difficulty ?? 'peaceful', emit: () => {}, validateMoves: false, authoritative: true, spawn: { x: 0, y: 10, z: 0 } });
  const p = newPlayer('a', 'A', 'survival', { x: 0.5, y: 10, z: -12.5 });
  sim.addPlayer(p); p.x = 0.5; p.y = 10; p.z = -12.5;
  return { sim, store, p, run: (n: number) => { for (let i = 0; i < n; i++) sim.tick(); } };
}

const ring: [number, number][] = [];
for (let d = -1; d <= 1; d++) ring.push([d, -2], [d, 2], [-2, d], [2, d]);

describe('v40 the End: terrain', () => {
  const g = new WorldGenerator(12345, null, { secret: 777 });
  const cx0 = Math.floor(END_X / 16);
  it('builds a central island of end stone with an exit portal frame of bedrock', () => {
    const c = g.generate(cx0, 0);
    const at = (x: number, y: number, z: number) => bid(c.blocks[(y * 16 + z) * 16 + x]);
    expect(at(5, EXIT_Y - 5, 5)).toBe(CB.END_STONE);
    expect(at(0, EXIT_Y - 1, 0)).toBe(B.BEDROCK);
    expect(at(0, EXIT_Y + 3, 0)).toBe(B.BEDROCK);
    expect(at(1, EXIT_Y, 0)).toBe(0);
  });
  it('places ten obsidian pillars, each with a crystal on bedrock, and cages two', () => {
    const eg = g.endGen();
    const ps = eg.pillars();
    expect(ps).toHaveLength(10);
    expect(ps.filter((p) => p.caged)).toHaveLength(2);
    let crystals = 0;
    for (let i = -4; i <= 3; i++) for (let j = -4; j <= 3; j++) crystals += g.generate(cx0 + i, j).entities.filter((e) => e.mob === 'riftcore').length;
    expect(crystals).toBe(10);
    const p = ps[0];
    const c = g.generate(Math.floor((END_X + p.x) / 16), Math.floor(p.z / 16));
    expect(bid(c.blocks[(p.h * 16 + (((p.z % 16) + 16) % 16)) * 16 + (((END_X + p.x) % 16) + 16) % 16])).toBe(B.BEDROCK);
  });
  it('leaves a void ring, then outer islands with chorus plants and End cities', () => {
    expect(g.endGen().column(500, 0)).toBeNull();
    let city = null;
    for (let ri = -6; ri <= 6 && !city; ri++) for (let rj = -6; rj <= 6 && !city; rj++) city = g.endGen().city(ri, rj);
    expect(city).not.toBeNull();
    const counts = new Map<number, number>();
    const ents: string[] = [];
    for (let i = -4; i <= 4; i++) for (let j = -4; j <= 4; j++) {
      const r = g.generate(Math.floor((END_X + city!.x) / 16) + i, Math.floor(city!.z / 16) + j);
      for (const v of r.blocks) if (v) counts.set(bid(v), (counts.get(bid(v)) ?? 0) + 1);
      for (const e of r.entities) ents.push(e.type === 'chest' && e.items.some((s) => s?.id === I.ELYTRA) ? 'elytra' : `${e.type}:${e.mob ?? ''}`);
    }
    expect(counts.get(CB.PURPUR_BLOCK)).toBeGreaterThan(400);
    expect(ents.filter((e) => e === 'mob:shellward').length).toBeGreaterThan(3);
    if (city!.ship) { expect(ents).toContain('elytra'); expect(counts.get(CB.DRAGON_HEAD)).toBe(1); }
  });
  it('End cities close to the central island always carry a ship', () => {
    const eg = g.endGen();
    let near = 0;
    for (let ri = -6; ri <= 6; ri++) for (let rj = -6; rj <= 6; rj++) { const c = eg.city(ri, rj); if (c && Math.hypot(c.x, c.z) < 1500) { near++; expect(c.ship).toBe(true); } }
    expect(near).toBeGreaterThan(0);
  });
});

describe('v40 the End: portal room', () => {
  it('strongholds on the new generation level get twelve End Portal Frames', () => {
    const g = new WorldGenerator(4242, null, { secret: 99 });
    const plan = g.locate('stronghold', 0, 0)!;
    const c = portalRoomCenter(plan)!;
    const count = (lv: number) => {
      let n = 0;
      for (let dx = -16; dx <= 16; dx += 16) for (let dz = -16; dz <= 16; dz += 16) {
        const cx = Math.floor((c.x + dx) / 16), cz = Math.floor((c.z + dz) / 16);
        if (dx && Math.floor((c.x + dx) / 16) === Math.floor(c.x / 16)) continue;
        for (const v of g.generate(cx, cz, lv).blocks) if (bid(v) === CB.END_PORTAL_FRAME) n++;
      }
      return n;
    };
    expect(count(14)).toBe(12);
    expect(count(13)).toBe(0);
  });
});

describe('v40 the End: portal and travel', () => {
  it('the twelfth Eye of Ender opens the portal', () => {
    const { sim, p } = world();
    const cx = 5, cz = 0, y = 10;
    ring.forEach(([dx, dz], i) => sim.setBlock(cx + dx, y, cz + dz, makeBlock(CB.END_PORTAL_FRAME, i === 0 ? 0 : FRAME_EYE)));
    p.mode = 'survival'; p.x = 5.5; p.y = 10; p.z = -4.5;
    p.inv.slots[p.inv.selected] = { id: I.EYE_OF_ENDER, count: 2 };
    const [fx, fz] = ring[0];
    expect(sim.use(p, cx + fx, y, cz + fz, 0, 1, 0)).toBe(true);
    expect(p.inv.slots[p.inv.selected]?.count).toBe(1);
    expect(blockId(sim.get(cx, y, cz))).toBe(CB.END_PORTAL);
    expect(blockId(sim.get(cx + 1, y, cz + 1))).toBe(CB.END_PORTAL);
  });
  it('stepping into the portal sends you to an obsidian platform in the End, and the exit portal brings you home', () => {
    const { sim, p, run } = world();
    sim.setBlock(5, 10, 0, makeBlock(CB.END_PORTAL, 0));
    p.x = 5.5; p.y = 10.2; p.z = 0.5;
    run(8);
    expect(isEnd(p.x)).toBe(true);
    expect(Math.floor(p.x)).toBe(END_X + END_SPAWN.x);
    expect(sim.get(END_X + END_SPAWN.x, END_SPAWN.y - 1, END_SPAWN.z)).toBe(B.OBSIDIAN);
    p.portalLock = false;
    sim.setBlock(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z), makeBlock(CB.END_PORTAL, 0));
    run(8);
    expect(isEnd(p.x)).toBe(false);
  });
  it('a thrown Eye of Ender heads for the stronghold portal room', () => {
    const g = new WorldGenerator(4242, null, { secret: 99 });
    const { sim, p, run } = world({ gen: g });
    const c = portalRoomCenter(g.locate('stronghold', 0, 0)!)!;
    p.inv.slots[p.inv.selected] = { id: I.EYE_OF_ENDER, count: 1 };
    p.x = 0.5; p.y = 10; p.z = 0.5;
    expect(sim.shootBow(p, 1, 0, 0)).toBe(true);
    const e = [...sim.entities.values()].find((q) => q.type === 'eye')!;
    const d0 = Math.hypot(c.x - e.x, c.z - e.z);
    run(40);
    expect(Math.hypot(c.x - e.x, c.z - e.z)).toBeLessThan(d0 - 5);
    run(60);
    expect([...sim.entities.values()].some((q) => q.type === 'eye')).toBe(false);
  });
  it('the dragon egg slips away when touched', () => {
    const { sim, p } = world();
    sim.setBlock(3, 10, -10, makeBlock(CB.DRAGON_EGG, 0));
    p.x = 3.5; p.y = 10; p.z = -12.5;
    sim.use(p, 3, 10, -10, 0, 0, -1);
    expect(blockId(sim.get(3, 10, -10))).toBe(0);
  });
});

describe('v40 the End: dragon fight', () => {
  const enter = () => {
    const w = world({ difficulty: 'normal' });
    w.p.mode = 'survival'; w.p.x = END_X + 60.5; w.p.y = 70; w.p.z = 0.5;
    w.p.flags = 8;
    return w;
  };
  const kinds = (sim: WorldSim, t: string) => [...sim.entities.values()].filter((e) => e.type === t);
  it('arriving in the End wakes the dragon and lights all ten crystals', () => {
    const { sim, run } = enter();
    run(30);
    expect(kinds(sim, 'voidwyrm')).toHaveLength(1);
    expect(kinds(sim, 'riftcore')).toHaveLength(10);
    expect(sim.endState.started).toBe(true);
  });
  it('striking a crystal blows it up, and lost crystals stay lost', () => {
    const { sim, run, p } = enter();
    run(30);
    const c = kinds(sim, 'riftcore')[0];
    sim.hurtMob(c, 1, p.id, 0, 0);
    expect(sim.entities.has(c.id)).toBe(false);
    expect(sim.endState.lost).toContain(c.pil);
    run(40);
    expect(kinds(sim, 'riftcore')).toHaveLength(9);
  });
  it('a crystal heals the dragon when it is close', () => {
    const { sim, run } = enter();
    run(30);
    const d = kinds(sim, 'voidwyrm')[0], c = kinds(sim, 'riftcore')[0];
    d.health = 100;
    d.x = c.x; d.y = c.y + 6; d.z = c.z; d.phase = 'perch';
    run(1);
    const h0 = d.health;
    for (let i = 0; i < 20; i++) { d.x = c.x; d.y = c.y + 6; d.z = c.z; d.vx = d.vy = d.vz = 0; sim.tick(); }
    expect(d.health).toBeGreaterThan(h0);
  });
  it('killing the dragon opens the exit portal, lays the egg and makes a gateway', () => {
    const { sim, run, p } = enter();
    run(30);
    const d = kinds(sim, 'voidwyrm')[0];
    for (const c of kinds(sim, 'riftcore')) sim.hurtMob(c, 1, p.id, 0, 0);
    d.phase = 'perch';
    sim.hurtMob(d, 500, p.id, 0, 0);
    expect(d.phase).toBe('dying');
    run(220);
    expect(kinds(sim, 'voidwyrm')).toHaveLength(0);
    expect(sim.endState.alive).toBe(false);
    expect(sim.endState.kills).toBe(1);
    expect(blockId(sim.get(END_X + 1, EXIT_Y, 0))).toBe(CB.END_PORTAL);
    expect(blockId(sim.get(END_X, EXIT_Y + 4, 0))).toBe(CB.DRAGON_EGG);
    expect(sim.endState.gates).toHaveLength(1);
    expect(p.xp).toBeGreaterThan(0);
  });
  it('four crystals on the exit portal summon the dragon again', () => {
    const { sim, run, p } = enter();
    sim.endState = { ...sim.endState, started: true, alive: false, kills: 1, lastKill: Date.now(), exitOpen: true };
    for (const [dx, dz] of [[0, 3], [0, -3], [3, 0], [-3, 0]]) sim.setBlock(END_X + dx, EXIT_Y, dz, B.BEDROCK);
    p.mode = 'creative';
    p.inv.slots[p.inv.selected] = { id: I.END_CRYSTAL, count: 4 };
    for (const [dx, dz] of [[0, 3], [0, -3], [3, 0], [-3, 0]]) { p.x = END_X + dx * 1.7 + 0.5; p.y = EXIT_Y + 1; p.z = dz * 1.7 + 0.5; expect(sim.use(p, END_X + dx, EXIT_Y, dz, 0, 1, 0)).toBe(true); }
    expect(sim.endState.summon).toBeDefined();
    run(230);
    expect(sim.endState.alive).toBe(true);
    expect(kinds(sim, 'voidwyrm')).toHaveLength(1);
    expect(blockId(sim.get(END_X + 1, EXIT_Y, 0))).toBe(0);
  });
  it('busy servers bring the dragon back two days after it died', () => {
    const { sim, run } = enter();
    sim.endState = { ...sim.endState, started: true, alive: false, kills: 1, lastKill: Date.now() - 2 * 86400000 - 1000, exitOpen: true };
    sim.peakPlayers = 9;
    run(40);
    expect(sim.endState.summon).toBeUndefined();
    sim.peakPlayers = 10;
    run(260);
    expect(sim.endState.alive).toBe(true);
    expect(kinds(sim, 'voidwyrm')).toHaveLength(1);
  });
  it('an End Gateway flings you to the outer islands', () => {
    const g = new WorldGenerator(12345, null, { secret: 777 });
    const { sim, p, run } = world({ gen: g });
    sim.setBlock(END_X + 96, 75, 0, makeBlock(CB.END_GATEWAY, 0));
    p.x = END_X + 96.5; p.y = 75; p.z = 0.5;
    run(6);
    expect(Math.hypot(p.x - END_X, p.z)).toBeGreaterThan(1000);
  });
});

describe('v40 the End: shulkers', () => {
  it('a closed shulker shrugs off arrows', () => {
    const { sim, p, run } = world({ difficulty: 'normal' });
    const s = sim.spawnMob('shellward', 10.5, 10, -12.5);
    s.persistent = true;
    p.inv.slots[p.inv.selected] = { id: I.BOW, count: 1 };
    p.inv.slots[5] = { id: I.ARROW, count: 8 };
    p.mode = 'creative';
    p.x = 0.5; p.y = 9.9; p.z = -12.5;
    sim.shootBow(p, 1, -Math.PI / 2, 0);
    run(10);
    expect(s.health).toBe(30);
  });
  it('shulker bullets make you levitate', () => {
    const events: string[] = [];
    const w = world({ difficulty: 'normal' });
    const sim = w.sim;
    (sim as unknown as { emit: (e: { e: string }) => void }).emit = (e) => { events.push(e.e); };
    w.p.mode = 'survival';
    const s = sim.spawnMob('shellward', 4.5, 10, -12.5);
    s.persistent = true;
    w.p.x = 0.5; w.p.y = 10; w.p.z = -12.5;
    for (let i = 0; i < 400 && !events.includes('effect'); i++) { w.p.health = 20; sim.tick(); }
    expect(events).toContain('effect');
    expect(w.p.levT).toBeGreaterThan(sim.tickCount);
  });
  it('an open shulker hit by a shulker bullet teleports and leaves a copy behind', () => {
    const { sim, run } = world({ difficulty: 'normal' });
    for (let x = 14; x < 38; x++) for (let y = 2; y < 20; y++) for (let z = -10; z < 12; z++) if ((x + y + z) % 2 === 0 && !(Math.abs(x - 25) <= 1 && Math.abs(z) <= 1 && y >= 9 && y <= 11)) sim.setBlock(x, y, z, B.STONE);
    sim.setBlock(25, 9, 0, B.STONE); sim.setBlock(25, 10, 0, 0);
    const s = sim.spawnMob('shellward', 25.5, 10, 0.5);
    s.persistent = true;
    const before = [...sim.entities.values()].filter((e) => e.type === 'shellward').length;
    for (let i = 0; i < 6 && [...sim.entities.values()].filter((e) => e.type === 'shellward').length === before; i++) { s.x = 25.5; s.y = 10; s.z = 0.5; s.peek = 1; s.health = 30; (sim as unknown as { shulkerBulletHit(m: unknown): void }).shulkerBulletHit(s); }
    run(1);
    const after = [...sim.entities.values()].filter((e) => e.type === 'shellward');
    expect(after.length).toBe(before + 1);
    expect(after.some((e) => Math.abs(e.x - 25.5) < 0.01 && Math.abs(e.z - 0.5) < 0.01)).toBe(true);
  });
  it('crowded shulkers stop duplicating', () => {
    const { sim } = world({ difficulty: 'normal' });
    for (let x = 14; x < 38; x++) for (let y = 2; y < 20; y++) for (let z = -10; z < 12; z++) if ((x + y + z) % 2 === 0 && !(Math.abs(x - 25) <= 1 && Math.abs(z) <= 1 && y >= 9 && y <= 11)) sim.setBlock(x, y, z, B.STONE);
    sim.setBlock(25, 9, 0, B.STONE); sim.setBlock(25, 10, 0, 0);
    for (let i = 0; i < 6; i++) sim.spawnMob('shellward', 21.5 + i, 10, -4.5).persistent = true;
    const s = sim.spawnMob('shellward', 25.5, 10, 0.5);
    s.persistent = true; s.peek = 1; s.peekT = 1;
    const n0 = [...sim.entities.values()].filter((e) => e.type === 'shellward').length;
    for (let i = 0; i < 10; i++) { s.x = 25.5; s.y = 10; s.z = 0.5; s.peek = 1; s.health = 30; (sim as unknown as { shulkerBulletHit(m: unknown): void }).shulkerBulletHit(s); }
    expect([...sim.entities.values()].filter((e) => e.type === 'shellward').length).toBe(n0);
  });
});

describe('v40 Elytra and fireworks', () => {
  it('the server accepts fast gliding only with working Elytra', () => {
    const w = world();
    const { sim, p } = w;
    (sim as unknown as { validateMoves: boolean }).validateMoves = true;
    p.mode = 'survival'; p.x = 0.5; p.y = 60; p.z = 0.5; p.lastMove = sim.now - 50;
    expect(sim.move(p, 4.5, 59.8, 0.5, 0, 0, 131072)).toBe(false);
    p.inv.armor[1] = { id: I.ELYTRA, count: 1 };
    p.x = 0.5; p.y = 60; p.z = 0.5; p.lastMove = sim.now - 50;
    expect(sim.move(p, 4.5, 59.8, 0.5, 0, 0, 131072)).toBe(true);
  });
  it('gliding wears the Elytra and saves you from fall damage', () => {
    const { sim, p } = world();
    p.mode = 'survival'; p.inv.armor[1] = { id: I.ELYTRA, count: 1 };
    p.x = 0.5; p.y = 40; p.z = 0.5; p.peakY = 40;
    for (let i = 0; i < 30; i++) { sim.setNow(sim.now + 100); sim.move(p, 0.5 + i, 40 - i, 0.5, 0, 0, 131072); }
    expect(p.inv.armor[1]!.dmg).toBeGreaterThan(0);
    sim.move(p, 31.5, 10, 0.5, 0, 0, 1);
    expect(p.health).toBe(20);
  });
  it('a firework rocket is used up when you boost with it', () => {
    const { sim, p } = world();
    p.mode = 'survival'; p.flags = 131072; p.inv.armor[1] = { id: I.ELYTRA, count: 1 };
    p.inv.slots[p.inv.selected] = { id: I.FIREWORK_ROCKET, count: 3 };
    expect(sim.shootBow(p, 1, 0, 0)).toBe(true);
    expect(p.inv.slots[p.inv.selected]?.count).toBe(2);
  });
  it('Elytra and End items are craftable or obtainable as designed', async () => {
    const { RECIPES } = await import('../src/core/crafting');
    const outs = RECIPES.map((r) => r.result);
    expect(outs).toContain(I.EYE_OF_ENDER);
    expect(outs).toContain(I.END_CRYSTAL);
    expect(outs).toContain(CB.PURPUR_BLOCK);
    expect(outs).not.toContain(I.ELYTRA);
  });
});

describe('v40 shulker boxes', () => {
  const entItems = (sim: WorldSim) => [...(sim as unknown as { entities: Map<number, { kind: string; item?: { id: number; count: number; box?: unknown[] } }> }).entities.values()].filter((e) => e.kind === 'item').map((e) => e.item!);
  it('keeps its contents when broken and placed again, and never nests', async () => {
    const { validStack, applyInvOp } = await import('../src/core/inventory');
    const { sim, p } = world();
    p.mode = 'survival'; p.x = 0.5; p.y = 10; p.z = -1.5;
    p.inv.slots[p.inv.selected] = { id: CB.SHULKER_BOX, count: 1 };
    expect(sim.place(p, 0, 9, 0, 0, 1, 0)).toBe(true);
    expect(blockId(sim.get(0, 10, 0))).toBe(CB.SHULKER_BOX);
    expect(sim.use(p, 0, 10, 0, 0, 1, 0)).toBe(true);
    expect(p.screen.type).toBe('chest');
    const be = sim.getBlockEntity(0, 10, 0)!;
    expect(be.items).toHaveLength(27);
    be.items[3] = { id: B.STONE, count: 40 };
    p.inv.slots[0] = { id: CB.SHULKER_BOX, count: 1 };
    const ctx = sim.invCtx(p);
    expect(ctx.sealed).toBe(true);
    expect(applyInvOp(ctx, { t: 'quick', s: { c: 'inv', i: 0 } })).toBe(false);
    expect(sim.insertOne(0, 10, 0, { id: CB.SHULKER_BOX, count: 1 }, 1)).toBe(false);
    sim.breakBlock(0, 10, 0, p);
    expect(p.screen.type).toBeFalsy();
    const drops = entItems(sim);
    expect(drops).toHaveLength(1);
    expect(drops[0].id).toBe(CB.SHULKER_BOX);
    expect(validStack(drops[0])).toBe(true);
    expect(drops[0].box![3]).toEqual({ id: B.STONE, count: 40 });
    p.inv.slots[p.inv.selected] = drops[0] as never;
    expect(sim.place(p, 2, 9, 0, 0, 1, 0)).toBe(true);
    expect(sim.getBlockEntity(2, 10, 0)!.items[3]).toEqual({ id: B.STONE, count: 40 });
    expect(validStack({ id: CB.SHULKER_BOX, count: 1, box: [{ id: CB.SHULKER_BOX, count: 1 }] })).toBe(false);
    expect(validStack({ id: CB.SHULKER_BOX, count: 2 })).toBe(false);
  });
  it('an empty box broken in creative leaves nothing, a blocked lid stays shut', () => {
    const { sim, p, store } = world();
    p.mode = 'creative'; p.x = 0.5; p.y = 10; p.z = -1.5;
    store.setBlock(0, 10, 0, CB.SHULKER_BOX < 256 ? CB.SHULKER_BOX : makeBlock(CB.SHULKER_BOX, 0));
    store.setBlock(0, 11, 0, B.STONE);
    expect(sim.use(p, 0, 10, 0, 0, 1, 0)).toBe(true);
    expect(p.screen.type).toBeFalsy();
    sim.breakBlock(0, 10, 0, p);
    expect(entItems(sim)).toHaveLength(0);
  });
});

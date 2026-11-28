import { describe, it, expect } from 'vitest';
import { WorldSim, newPlayer, SimEvent, WorldStore } from '../src/core/sim/WorldSim';
import { WorldGenerator } from '../src/core/worldgen/WorldGenerator';
import { ChunkData } from '../src/core/chunk';
import { B, blockId } from '../src/core/blocks';
import { I, getItem, armorId } from '../src/core/items';
import { Minigame, GameState, rollFortune } from '../src/core/labs/minigames/Minigame';
import { ArenaKind, arenaLayout, TEAM_TINTS } from '../src/core/labs/minigames/arena';
import { SHOP, offerVisible, toolOf } from '../src/core/labs/minigames/shop';

function arena(kind: ArenaKind, bots = 3) {
  const gen = new WorldGenerator(1, kind);
  const chunks = new Map<string, ChunkData>();
  const get = (cx: number, cz: number) => { const k = `${cx},${cz}`; let c = chunks.get(k); if (!c) { c = new ChunkData(cx, cz, gen.generate(cx, cz).blocks); chunks.set(k, c); } return c; };
  const store: WorldStore = { getBlock: (x, y, z) => get(x >> 4, z >> 4).get(x & 15, y, z & 15), setBlock: (x, y, z, v) => get(x >> 4, z >> 4).set(x & 15, y, z & 15, v), isLoaded: () => true };
  const events: SimEvent[] = [];
  const sim = new WorldSim({ seed: 1, store, gen, difficulty: 'normal', emit: (e) => events.push(e), validateMoves: false, authoritative: true });
  const game = new Minigame(sim, kind);
  sim.game = game;
  game.botFill = bots;
  const p = newPlayer('h1', 'Tester', 'survival', sim.spawn);
  sim.addPlayer(p);
  for (let i = 0; i < 20 * 16; i++) sim.tick();
  const last = () => [...events].reverse().find((e) => e.e === 'game') as { state: GameState } | undefined;
  return { sim, game, p, events, last };
}

describe('v51 Fortune Spires', () => {
  it('draws from the whole item list, not a short table', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 600; i++) { const s = rollFortune(); seen.add(s.id); expect(s.count).toBeGreaterThan(0); expect(s.id).not.toBe(B.BEDROCK); }
    expect(seen.size).toBeGreaterThan(200);
    const kinds = new Set([...seen].map((id) => getItem(id)!.kind));
    for (const k of ['block', 'tool', 'armor', 'food', 'material']) expect(kinds.has(k as never)).toBe(true);
  });
  it('hands out an item every five seconds and has a time limit', () => {
    const { sim, game, p, last } = arena('spires', 2);
    expect(game.phase).toBe('playing');
    for (let i = 0; i < 20 * 11; i++) sim.tick();
    expect([...p.inv.slots, ...p.inv.armor, ...p.inv.off].filter(Boolean).length).toBeGreaterThanOrEqual(2);
    expect(last()!.state.event?.name).toBe('Time limit');
  });
});

describe('v51 Hearthfall', () => {
  it('has original team islands with forges, diamond and emerald islands', () => {
    const L = arenaLayout('hearthfall');
    expect(L.teams.length).toBe(4);
    expect(L.gens.filter((g) => g.tier === 'dia').length).toBe(4);
    expect(L.gens.filter((g) => g.tier === 'em').length).toBe(2);
    expect(new Set(L.teams.map((t) => t.wool)).size).toBe(4);
  });

  it('sells tiered tools and greaves in order and keeps them through death', () => {
    const { sim, game, p } = arena('hearthfall', 1);
    const qm = [...sim.entities.values()].find((e) => e.type === 'quartermaster' && Math.hypot(e.x - p.x, e.z - p.z) < 12)!;
    p.x = qm.x + 1; p.z = qm.z; p.y = qm.y;
    sim.attack(p, qm.id);
    p.inv.slots[8] = { id: I.IRON_INGOT, count: 64 };
    p.inv.slots[7] = { id: I.GOLD_INGOT, count: 64 };
    expect(game.buy(p, 'pick2')).toMatch(/tier before/);
    expect(game.buy(p, 'pick1')).toBeNull();
    expect(game.buy(p, 'pick2')).toBeNull();
    expect(p.inv.slots.some((s) => s?.id === toolOf('pick', 2))).toBe(true);
    expect(p.inv.slots.some((s) => s?.id === toolOf('pick', 1))).toBe(false);
    expect(game.buy(p, 'greaves1')).toBeNull();
    expect(p.inv.armor[2]?.id).toBe(armorId(2, 2));
    expect(game.buy(p, 'stone_sword')).toBeNull();
    p.health = 1;
    sim.damage(p, 50, 'void', p.x, p.z, false, true);
    for (let i = 0; i < 20 * 6; i++) sim.tick();
    if (p.dead) sim.respawn(p);
    for (let i = 0; i < 5; i++) sim.tick();
    expect(p.dead).toBe(false);
    expect(p.inv.slots.some((s) => s?.id === toolOf('pick', 1))).toBe(true);
    expect(p.inv.armor[2]?.id).toBe(armorId(2, 2));
  });

  it('team upgrades change damage and forge speed', () => {
    const { sim, game, p, last } = arena('hearthfall', 1);
    const qm = [...sim.entities.values()].find((e) => e.type === 'quartermaster' && Math.hypot(e.x - p.x, e.z - p.z) < 12)!;
    p.x = qm.x + 1; p.z = qm.z; p.y = qm.y;
    sim.attack(p, qm.id);
    p.inv.slots[8] = { id: I.AETHERITE, count: 64 };
    expect(game.damageScale(p)).toBe(1);
    expect(game.buy(p, 'bulwark2')).toMatch(/level before/);
    expect(game.buy(p, 'bulwark1')).toBeNull();
    expect(game.buy(p, 'bulwark2')).toBeNull();
    expect(game.damageScale(p)).toBeCloseTo(0.84);
    expect(game.buy(p, 'forge1')).toBeNull();
    sim.tick(); sim.tick();
    const me = last()!.state.players.find((x) => x.id === 'h1')!;
    expect(last()!.state.teams[me.team].lv.forge).toBe(1);
    const visible = SHOP.filter((o) => o.upgrade === 'forge' && offerVisible(o, { pick: 0, axe: 0, greaves: 0, lv: last()!.state.teams[me.team].lv }));
    expect(visible.map((o) => o.key)).toEqual(['forge2']);
  });

  it('TNT lights itself and cannot break the map or blastproof glass', () => {
    const { sim, game, p } = arena('hearthfall', 1);
    const me = game.parts.get('h1')!;
    const L = arenaLayout('hearthfall');
    const [bx, by, bz] = L.teams[me.team].base;
    const glass = TEAM_TINTS[me.team].glass;
    sim.setBlock(bx + 2, by + 1, bz, glass);
    sim.setBlock(bx + 3, by + 1, bz, B.OAK_PLANKS);
    sim.setBlock(bx + 1, by + 1, bz, B.TNT);
    p.x = bx + 30; p.z = bz + 30;
    sim.tick();
    expect(blockId(sim.get(bx + 1, by + 1, bz))).toBe(0);
    for (let i = 0; i < 70; i++) sim.tick();
    expect(blockId(sim.get(bx + 2, by + 1, bz))).toBe(glass);
    expect(blockId(sim.get(bx, by, bz))).not.toBe(0);
  });

  it('rivals spend real blocks and stop bridging when they run out', () => {
    const { sim, game, p } = arena('hearthfall', 3);
    p.x = 0.5; p.y = 101; p.z = 0.5;
    for (let i = 0; i < 20 * 60; i++) sim.tick();
    for (const b of [...game.parts.values()].filter((x) => x.bot)) {
      expect(b.kit!.blocks).toBeGreaterThanOrEqual(0);
      expect(b.kit!.blocks).toBeLessThan(200);
    }
    const bot = [...game.parts.values()].find((x) => x.bot && x.alive)!;
    const e = sim.entities.get(bot.ent)!;
    bot.kit!.blocks = 0;
    let placedBefore = game.placed.size;
    e.x = 0.5; e.y = 65; e.z = 0.5;
    bot.kit!.plan = 'raid'; bot.kit!.goal = { x: 40.5, y: 65, z: 0.5 };
    for (let i = 0; i < 60; i++) { game.tickNpc(e); }
    expect(game.placed.size).toBeLessThanOrEqual(placedBefore + 0);
    placedBefore = game.placed.size;
    expect(bot.kit!.blocks).toBe(0);
  });

  it('runs the diamond and emerald timeline', () => {
    const { sim, game, last } = arena('hearthfall', 1);
    expect(last()!.state.event?.name).toBe('Diamond II');
    game.elapsed = 20 * 60 * 4 - 1;
    sim.tick();
    expect(game.tier.dia).toBe(2);
    sim.tick();
    expect(last()!.state.event?.name).toBe('Emerald II');
  });

  it('bots towering is capped and unreachable targets get ignored', () => {
    const { sim, game, p } = arena('hearthfall', 1);
    const bot = [...game.parts.values()].find((x) => x.bot)!;
    const e = sim.entities.get(bot.ent)!;
    p.x = e.x; p.z = e.z; p.y = e.y + 30;
    bot.kit!.blocks = 64;
    const start = bot.kit!.blocks;
    for (let i = 0; i < 20 * 20; i++) sim.tick();
    expect(start - bot.kit!.blocks).toBeLessThanOrEqual(12);
  });
});

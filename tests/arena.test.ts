import { describe, it, expect } from 'vitest';
import { WorldSim, newPlayer, SimEvent, WorldStore } from '../src/core/sim/WorldSim';
import { WorldGenerator } from '../src/core/worldgen/WorldGenerator';
import { ChunkData } from '../src/core/chunk';
import { B, blockId } from '../src/core/blocks';
import { I } from '../src/core/items';
import { Minigame, GameState } from '../src/core/minigames/Minigame';
import { ArenaKind, arenaLayout } from '../src/core/minigames/arena';

function arenaWorld(kind: ArenaKind) {
  const gen = new WorldGenerator(1, kind);
  const chunks = new Map<string, ChunkData>();
  const get = (cx: number, cz: number) => {
    const k = `${cx},${cz}`;
    let c = chunks.get(k);
    if (!c) { c = new ChunkData(cx, cz, gen.generate(cx, cz).blocks); chunks.set(k, c); }
    return c;
  };
  const store: WorldStore = {
    getBlock: (x, y, z) => get(x >> 4, z >> 4).get(x & 15, y, z & 15),
    setBlock: (x, y, z, v) => get(x >> 4, z >> 4).set(x & 15, y, z & 15, v),
    isLoaded: () => true,
  };
  const events: SimEvent[] = [];
  const sim = new WorldSim({ seed: 1, store, gen, difficulty: 'normal', emit: (e) => events.push(e), validateMoves: false, authoritative: true });
  const game = new Minigame(sim, kind);
  sim.game = game;
  const p = newPlayer('h1', 'Tester', 'survival', sim.spawn);
  sim.addPlayer(p);
  const last = () => [...events].reverse().find((e) => e.e === 'game') as { state: GameState } | undefined;
  return { sim, game, p, events, last, store };
}

describe('arena generation', () => {
  it('builds the lobby and pillars from the layout', () => {
    const { store } = arenaWorld('spires');
    expect(blockId(store.getBlock(0, 100, 0))).toBe(B.GLOWSTONE);
    const sp = arenaLayout('spires').spawns[0];
    expect(blockId(store.getBlock(Math.floor(sp[0]), 64, Math.floor(sp[2])))).toBe(B.BEDROCK);
    expect(blockId(store.getBlock(Math.floor(sp[0]), 10, Math.floor(sp[2])))).toBe(0);
  });
});

describe('Fortune Spires', () => {
  it('counts down, places everyone on pillars and hands out lucky items', () => {
    const { sim, game, p, last } = arenaWorld('spires');
    expect(p.y).toBeGreaterThan(99);
    for (let i = 0; i < 20 * 16; i++) sim.tick();
    expect(game.phase).toBe('playing');
    expect(p.y).toBeCloseTo(65, 0);
    const st = last()!.state;
    expect(st.players.length).toBe(6);
    expect(st.players.filter((x) => x.bot).length).toBe(5);
    for (let i = 0; i < 20 * 4; i++) sim.tick();
    expect(p.inv.slots.some((s) => s)).toBe(true);
  });

  it('eliminates a player who falls into the void and ends the round', () => {
    const { sim, game, p } = arenaWorld('spires');
    game.botFill = 1;
    for (let i = 0; i < 20 * 16; i++) sim.tick();
    p.y = 5;
    for (let i = 0; i < 5; i++) sim.tick();
    expect(p.dead).toBe(true);
    expect(game.phase).toBe('ended');
  });
});

describe('Hearthfall', () => {
  it('runs forges, sells gear and snuffs hearths', () => {
    const { sim, game, p, last, events } = arenaWorld('hearthfall');
    game.botFill = 3;
    for (let i = 0; i < 20 * 16; i++) sim.tick();
    expect(game.phase).toBe('playing');
    const st = last()!.state;
    const mine = st.players.find((x) => x.id === 'h1')!;
    expect(mine.team).toBeGreaterThanOrEqual(0);
    expect([...sim.entities.values()].filter((e) => e.type === 'quartermaster').length).toBe(4);
    for (let i = 0; i < 60; i++) sim.tick();
    expect([...sim.entities.values()].some((e) => e.kind === 'item' && e.item!.id === I.IRON_INGOT)).toBe(true);
    p.inv.slots[5] = { id: I.IRON_INGOT, count: 10 };
    sim.buy(p, 'wool');
    expect(events.some((e) => e.e === 'msg' && e.kind === 'error')).toBe(true);
    const qm = [...sim.entities.values()].find((e) => e.type === 'quartermaster')!;
    p.x = qm.x + 1; p.z = qm.z; p.y = qm.y;
    sim.attack(p, qm.id);
    expect(p.screen.type).toBe('shop');
    sim.buy(p, 'wool');
    expect(p.inv.slots.some((s) => s && s.count === 16 && (s.id === B.RED_WOOL || s.id === B.WHITE_WOOL || s.id === B.YELLOW_WOOL))).toBe(true);
    expect(p.inv.slots[5]?.count).toBe(6);
    const L = arenaLayout('hearthfall');
    const enemy = L.teams.findIndex((_, i) => i !== mine.team && st.players.some((x) => x.team === i));
    const [hx, hy, hz] = L.teams[enemy].hearth;
    expect(blockId(sim.get(hx, hy, hz))).toBe(B.GLOWSTONE);
    expect(game.canBreak(p, hx, hy, hz, sim.get(hx, hy, hz))).toBe(true);
    const own = L.teams[mine.team].hearth;
    expect(game.canBreak(p, own[0], own[1], own[2], sim.get(own[0], own[1], own[2]))).toBe(false);
    sim.setBlock(hx, hy, hz, 0);
    game.onBroken('Tester', hx, hy, hz, B.GLOWSTONE);
    for (let i = 0; i < 25; i++) sim.tick();
    expect(last()!.state.teams[enemy].hearth).toBe(false);
  });

  it('restores the arena after a round', () => {
    const { sim, game, store } = arenaWorld('hearthfall');
    for (let i = 0; i < 20 * 16; i++) sim.tick();
    sim.setBlock(0, 70, 0, B.STONE);
    sim.setBlock(0, 64, 0, 0);
    game.command({ ...sim.players.get('h1')!, op: true }, ['game', 'stop']);
    expect(blockId(store.getBlock(0, 70, 0))).toBe(0);
    expect(blockId(store.getBlock(0, 64, 0))).toBe(B.AETHERITE_BLOCK);
  });

  it('lets rivals bridge and fight on their own', () => {
    const { sim, game, p } = arenaWorld('hearthfall');
    game.botFill = 3;
    for (let i = 0; i < 20 * 16; i++) sim.tick();
    p.x = 0.5; p.y = 101; p.z = 0.5;
    const before = [...sim.entities.values()].filter((e) => e.type === 'rival').map((e) => [e.x, e.z]);
    for (let i = 0; i < 20 * 20; i++) sim.tick();
    const moved = [...sim.entities.values()].filter((e) => e.type === 'rival');
    expect(before.length).toBe(3);
    let wool = 0;
    for (let x = -40; x <= 40; x++) for (let z = -40; z <= 40; z++) { const id = blockId(sim.get(x, 64, z)); if (id === B.WHITE_WOOL || id === B.RED_WOOL || id === B.YELLOW_WOOL) wool++; }
    expect(wool + moved.length).toBeGreaterThan(3);
  });
});

import { describe, it, expect } from 'vitest';
import { WorldGenerator } from '../src/core/worldgen/WorldGenerator';
import { B } from '../src/core/blocks';
import { I } from '../src/core/items';
import { Rng } from '../src/core/rng';
import { trialLoot, vaultLoot } from '../src/core/worldgen/structures';

function scan(g: WorldGenerator, type: 'stronghold' | 'trial') {
  const p = g.locate(type, 0, 0)!;
  const counts = new Map<number, number>();
  const ents: string[] = [];
  const b = p.bounds;
  for (let cz = b.z0 >> 4; cz <= b.z1 >> 4; cz++) for (let cx = b.x0 >> 4; cx <= b.x1 >> 4; cx++) {
    const c = g.generate(cx, cz);
    expect(c.special).toBe(true);
    for (const v of c.blocks) counts.set(v & 0xff, (counts.get(v & 0xff) ?? 0) + 1);
    for (const e of c.entities) ents.push(e.type);
  }
  return { p, counts, ents };
}

describe('structures', () => {
  const g = new WorldGenerator(12345);

  it('places a stronghold with a portal room and spawner', () => {
    const { p, counts, ents } = scan(g, 'stronghold');
    expect(p.pieces.length).toBeGreaterThan(6);
    expect(p.pieces.some((x) => x.kind === 'portal')).toBe(true);
    expect(counts.get(B.STONE_BRICKS) ?? 0).toBeGreaterThan(500);
    expect(counts.get(B.OBSIDIAN) ?? 0).toBeGreaterThanOrEqual(8);
    expect(ents).toContain('spawner');
    expect(ents).toContain('chest');
  });

  it('places a trial chamber with trial spawners and vaults', () => {
    const { counts, ents } = scan(g, 'trial');
    expect(counts.get(B.TUFF_BRICKS) ?? 0).toBeGreaterThan(300);
    expect(counts.get(B.COPPER_LAMP) ?? 0).toBeGreaterThan(0);
    expect(ents.filter((e) => e === 'trial').length).toBeGreaterThanOrEqual(3);
  });

  it('is deterministic and hidden from client-mode generators', () => {
    const a = g.locate('trial', 0, 0)!, b = new WorldGenerator(12345).locate('trial', 0, 0)!;
    expect([a.x, a.y, a.z]).toEqual([b.x, b.y, b.z]);
    const client = new WorldGenerator(12345, null, { secret: null });
    expect(client.locate('trial', 0, 0)).toBeNull();
    expect(client.hasStructure(a.x >> 4, a.z >> 4)).toBe(false);
    const other = new WorldGenerator(12345, null, { secret: 999 }).locate('trial', 0, 0);
    expect(other && other.x === a.x && other.z === a.z).toBeFalsy();
  });

  it('gives trial keys and vault rewards', () => {
    const r = new Rng(7);
    for (let i = 0; i < 20; i++) {
      expect(trialLoot(r).some((s) => s.id === I.TRIAL_KEY)).toBe(true);
      expect(vaultLoot(r).length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('trial cages and vaults', () => {
  it('spawns waves, drops a trial key and opens a vault once', async () => {
    const { WorldSim, newPlayer } = await import('../src/core/sim/WorldSim');
    const { ChunkData } = await import('../src/core/chunk');
    const gen = new WorldGenerator(5);
    const chunks = new Map<string, InstanceType<typeof ChunkData>>();
    const get = (cx: number, cz: number) => { const k = `${cx},${cz}`; let c = chunks.get(k); if (!c) { c = new ChunkData(cx, cz, new Uint16Array(16 * 16 * 256)); chunks.set(k, c); } return c; };
    const store = { getBlock: (x: number, y: number, z: number) => get(x >> 4, z >> 4).get(x & 15, y, z & 15), setBlock: (x: number, y: number, z: number, v: number) => get(x >> 4, z >> 4).set(x & 15, y, z & 15, v), isLoaded: () => true };
    for (let x = -8; x <= 8; x++) for (let z = -8; z <= 8; z++) store.setBlock(x, 10, z, B.STONE);
    store.setBlock(0, 11, 0, B.TRIAL_SPAWNER);
    store.setBlock(3, 11, 3, B.VAULT);
    const sim = new WorldSim({ seed: 5, store, gen, difficulty: 'normal', emit: () => {}, validateMoves: false, authoritative: true, spawn: { x: 0, y: 11, z: 0 } });
    sim.addGeneratedChest(0, 11, 0, [], 'trial', 'hollowed');
    sim.addGeneratedChest(3, 11, 3, [], 'vault');
    const p = newPlayer('p1', 'Tester', 'survival', { x: 4, y: 11, z: 4 });
    p.x = 4.5; p.y = 11; p.z = 4.5;
    sim.addPlayer(p);
    let t = 0;
    const mobs = () => [...sim.entities.values()].filter((e) => e.kind === 'mob');
    for (let i = 0; i < 4000; i++) {
      sim.setNow((t += 50)); sim.tick();
      for (const m of mobs()) m.health = 0;
      p.health = 20; p.x = 4.5; p.y = 11; p.z = 4.5;
      const be = sim.blockEntities.get('0,11,0') as { state: string };
      if (be.state === 'cooldown') break;
    }
    expect((sim.blockEntities.get('0,11,0') as { state: string }).state).toBe('cooldown');
    const key = [...sim.entities.values()].some((e) => e.kind === 'item' && (e as { item?: { id: number } }).item?.id === I.TRIAL_KEY) || p.inv.slots.some((s) => s?.id === I.TRIAL_KEY);
    expect(key).toBe(true);
    p.inv.slots = p.inv.slots.map((s) => (s?.id === I.TRIAL_KEY ? null : s));
    p.inv.slots[p.inv.selected] = { id: I.TRIAL_KEY, count: 2 };
    expect(sim.openVault(p, 3, 11, 3)).toBe(true);
    expect(p.inv.slots[p.inv.selected]?.count).toBe(1);
    sim.openVault(p, 3, 11, 3);
    expect(p.inv.slots[p.inv.selected]?.count).toBe(1);
  });
});

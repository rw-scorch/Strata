import { describe, it, expect } from 'vitest';
import { WorldGenerator } from '../src/core/worldgen/WorldGenerator';
import { LANDMARK_KINDS, compileLandmark, rotMeta, LandmarkPlan } from '../src/core/worldgen/landmarks';
import { B, NB, makeBlock, bid, shapeBlock, STAIRS_UP, connVisual, GLASS_PANE } from '../src/core/blocks';
import { I } from '../src/core/items';
import { parseLootArgs, LOOT_DEFAULTS, lootArgs, sanitizeLootCfg } from '../src/core/sim/lootdrop';
import { sampleMedium } from '../src/core/physics';
import { sanitizeInv, emptyInv } from '../src/core/inventory';
import { LocalPlayer as Player } from '../src/game/Player';
import { InputState } from '../src/controls/InputState';
import { world } from './v40.test';

const gen = new WorldGenerator(777);
const found = new Map<string, LandmarkPlan>();
for (const k of LANDMARK_KINDS) { const p = gen.locateLandmark(k, 0, 0, 10); if (p) found.set(k, p); }
const voxels = (p: LandmarkPlan) => { const out: number[] = []; for (const a of compileLandmark(p).vox.values()) for (let i = 3; i < a.length; i += 4) out.push(a[i] & 0xffffff); return out; };
const count = (p: LandmarkPlan, v: number) => voxels(p).filter((x) => x === v).length;
const ents = (p: LandmarkPlan) => [...compileLandmark(p).ents.values()].flat();

describe('v45 landmarks', () => {
  it('every classic structure is found near spawn on a test seed', () => {
    for (const k of LANDMARK_KINDS) expect(found.has(k), k).toBe(true);
  });

  it('the desert pyramid hides four chests over nine TNT under a pressure plate', () => {
    const p = found.get('desert_pyramid')!;
    expect(count(p, B.TNT)).toBe(9);
    expect(count(p, B.STONE_PRESSURE_PLATE)).toBe(1);
    expect(ents(p).filter((e) => e.type === 'chest').length).toBe(4);
  });

  it('the jungle temple arms its corridors with loaded dispensers', () => {
    const p = found.get('jungle_temple')!;
    const disp = ents(p).filter((e) => e.type === 'chest' && e.items.length === 9);
    expect(disp.length).toBe(4);
    for (const d of disp) expect(d.items.some((s) => s?.id === I.ARROW)).toBe(true);
  });

  it('the ocean monument is built from real prismarine with a gold core', () => {
    const p = found.get('ocean_monument')!;
    expect(count(p, makeBlock(NB.PRISMARINE))).toBeGreaterThan(1000);
    expect(count(p, makeBlock(NB.SEA_LANTERN))).toBeGreaterThan(20);
    expect(count(p, B.GOLD_BLOCK)).toBeGreaterThanOrEqual(17);
    expect(voxels(p).some((v) => bid(v) === 116 && (v >>> 8) === 4)).toBe(false);
  });

  it('mineshafts string cobwebs and dungeons get a spawner', () => {
    expect(count(found.get('mineshaft')!, makeBlock(NB.COBWEB))).toBeGreaterThan(5);
    expect(ents(found.get('dungeon')!).filter((e) => e.type === 'spawner').length).toBe(1);
  });

  it('structures generate the same blocks whichever order chunks load in', () => {
    const p = found.get('pillager_outpost')!;
    const cx = Math.floor(p.x / 16), cz = Math.floor(p.z / 16);
    const a = new WorldGenerator(777).generate(cx, cz).blocks;
    const g2 = new WorldGenerator(777); g2.generate(cx + 1, cz); g2.generate(cx, cz + 1);
    expect(Buffer.from(g2.generate(cx, cz).blocks.buffer).equals(Buffer.from(a.buffer))).toBe(true);
  });

  it('rotation turns stairs, ladders and chests with the building', () => {
    const st = shapeBlock(0, true, (0 << 5) | STAIRS_UP);
    expect((rotMeta(st, 1) >>> 13) & 3).toBe(1);
    expect((rotMeta(makeBlock(B.LADDER, 3), 2) >>> 8) & 3).toBe(1);
    expect((rotMeta(makeBlock(B.CHEST, 0), 3) >>> 8) & 3).toBe(3);
  });

  it('mushroom fields are rare and only on isolated islands at the new level', () => {
    let mush = 0;
    for (let x = -4000; x < 4000; x += 32) for (let z = -4000; z < 4000; z += 32) if (gen.column(x, z).biome.id === 'mushroom_fields') mush++;
    expect(mush).toBeLessThan(120);
  });

  it('strongholds and trial chambers gain new room types', () => {
    const s = gen.locate('stronghold', 0, 0)!, t = gen.locate('trial', 0, 0)!;
    const kinds = new Set([...s.pieces, ...t.pieces].map((q) => q.kind));
    expect(s.v2).toBe(true);
    expect(['pillar_hall', 'spiral', 'five_way', 'small_library', 'stairs_hall', 'prison', 'library'].filter((k) => kinds.has(k)).length).toBeGreaterThanOrEqual(3);
    expect(['pit', 'pillar_chamber', 'balcony', 'water_chamber', 'dispenser_room', 'intersection'].filter((k) => kinds.has(k)).length).toBeGreaterThanOrEqual(2);
  });
});

describe('v45 blocks', () => {
  it('glass panes are two pixels thick, even standing alone', () => {
    const boxes = connVisual(GLASS_PANE, 0);
    expect(boxes.length).toBeGreaterThan(0);
    for (const b of boxes) expect(Math.min(b[3] - b[0], b[5] - b[2])).toBeCloseTo(2 / 16, 5);
  });

  it('cobwebs slow players to a crawl', () => {
    const w = { getBlock: (x: number, y: number) => (y < 60 ? B.STONE : x >= 3 && y < 62 ? makeBlock(NB.COBWEB) : 0), isLoaded: () => true };
    expect(sampleMedium(w, 3.5, 60, 0.5, 0.3, 1.8, 1.62).web).toBe(true);
    const p = new Player(); p.setPos(0.5, 60, 0.5); p.yaw = -Math.PI / 2;
    const i = new InputState(); i.moveZ = 1;
    for (let t = 0; t < 120; t++) p.update(0.05, i, w, 'survival', false);
    expect(p.body.x).toBeLessThan(6);
  });

  it('ender chests open one private store per player that persists', () => {
    const w = world();
    w.store.setBlock(2, 10, -12, makeBlock(NB.ENDER_CHEST));
    w.sim.openEnder(w.p, 2, 10, -12);
    const items = w.sim.invCtx(w.p).container!;
    items[0] = { id: I.AETHERITE, count: 5 };
    w.sim.closeScreen(w.p);
    expect(w.p.inv.ender?.[0]?.count).toBe(5);
    const back = sanitizeInv(JSON.parse(JSON.stringify(w.p.inv)));
    expect(back.ender?.[0]?.count).toBe(5);
    expect(sanitizeInv(emptyInv()).ender).toBeUndefined();
  });
});

describe('v45 lootdrops', () => {
  it('parses every option and round-trips the saved form', () => {
    const { cfg, err } = parseLootArgs(LOOT_DEFAULTS, ['r=12', 'l=4', 'c=8', 'f=6', 'shape=crater', 'tier=rich', 'rare=5%', 'elytra=0.2', 'tp=60', 'morph=off', 'b=gold_block:5,diamond_block:1', 'i=diamond:2-6:0.5,diamond_sword+:1:1', 'fi=elytra:1:1']);
    expect(err).toBeUndefined();
    expect(cfg.radius).toBe(12); expect(cfg.rare).toBeCloseTo(0.05); expect(cfg.items[1].maxed).toBe(true);
    expect(sanitizeLootCfg(cfg)).toEqual(cfg);
    expect(parseLootArgs(LOOT_DEFAULTS, lootArgs(cfg).split(' ')).cfg).toEqual(cfg);
    expect(parseLootArgs(LOOT_DEFAULTS, ['r=999']).cfg.radius).toBe(24);
    expect(parseLootArgs(LOOT_DEFAULTS, ['nope=1']).err).toMatch(/Unknown/);
  });

  it('reshapes the ground, fills chests and hangs framed prizes', () => {
    const w = world();
    w.p.op = true;
    const msg = w.sim.command(w.p, '/lootdrop r=6 l=2 c=4 f=4 b=gold_block:1 rare=0');
    expect(msg).toMatch(/Lootdrop placed/);
    let gold = 0, chests = 0;
    for (let x = -8; x <= 8; x++) for (let z = -20; z <= -4; z++) for (let y = 5; y < 20; y++) { const id = bid(w.store.getBlock(x, y, z)); if (id === B.GOLD_BLOCK) gold++; if (id === B.CHEST) chests++; }
    expect(gold).toBeGreaterThan(60);
    expect(chests).toBe(4);
    expect([...w.sim.entities.values()].filter((e) => e.kind === 'frame' && e.item).length).toBeGreaterThanOrEqual(3);
    expect(w.sim.command(w.p, '/lootdrop show')).toMatch(/r=6/);
  });

  it('default treasure blocks keep diamond and netherite rare', () => {
    const w = world();
    w.p.op = true;
    w.sim.command(w.p, '/lootdrop r=10 l=3 c=0 f=0');
    let all = 0, rare = 0;
    for (let x = -12; x <= 12; x++) for (let z = -24; z <= 0; z++) for (let y = 3; y < 24; y++) { const v = w.store.getBlock(x, y, z), id = bid(v); if ([B.GOLD_BLOCK, B.IRON_BLOCK, B.EMERALD_BLOCK, B.LAPIS_BLOCK, B.REDSTONE_BLOCK, B.COPPER_BLOCK, B.AETHERITE_BLOCK].includes(id) || id === 218) { all++; if (id === B.AETHERITE_BLOCK || id === 218) rare++; } }
    expect(all).toBeGreaterThan(300);
    expect(rare / all).toBeLessThan(0.03);
  });
});

describe('v45 locate', () => {
  it('finds the new structures by their Java names', () => {
    const w = world({ gen: new WorldGenerator(777) });
    w.p.op = true;
    expect(w.sim.command(w.p, '/locate minecraft:desert_pyramid')).toMatch(/Nearest desert pyramid is at/);
    expect(w.sim.command(w.p, '/locate structure mineshaft')).toMatch(/Nearest mineshaft is at/);
  });
});

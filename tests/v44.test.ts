import { describe, it, expect } from 'vitest';
import { B, CB, NB, XB, XV, makeBlock, blockId, blockMeta, FENCE_BASE, GATE_BASE, WALL_BASE, GLASS_PANE, SLAB2, STAIRS2, SHAPE_MATS, slabItem, stairsItem, connMask, wallPost, GATE_OPEN, shapeMatIndex, BLOCKS, WALL_MATS, WOODS } from '../src/core/blocks';
import { boxCollides, raycast } from '../src/core/physics';
import { getItem, I } from '../src/core/items';
import { RECIPES } from '../src/core/crafting';
import { world } from './v40.test';

const grid = (cells: Record<string, number>) => ({ getBlock: (x: number, y: number, z: number) => makeBlock(cells[`${x},${y},${z}`] ?? 0) });
const W = (id: number) => makeBlock(id);

describe('v44 fences, walls and panes connect like Java', () => {
  it('wooden fences link to each other and to solid blocks but not to nether brick fences', () => {
    const oak = FENCE_BASE, w = grid({ '1,0,0': FENCE_BASE + 2, '-1,0,0': B.STONE, '0,0,1': B.NETHER_BRICK_FENCE });
    expect(connMask(oak, (dx, dz) => w.getBlock(dx, 0, dz))).toBe(1 | 4);
  });

  it('fences connect to a gate only along its span', () => {
    const gN = makeBlock(GATE_BASE, 0);
    expect(connMask(FENCE_BASE, (dx, dz) => (dx === 1 && dz === 0 ? gN : 0))).toBe(1);
    expect(connMask(FENCE_BASE, (dx, dz) => (dx === 0 && dz === 1 ? gN : 0))).toBe(0);
  });

  it('walls drop their post on straight runs unless something sits on top', () => {
    const wall = WALL_BASE;
    expect(wallPost(5, 0, () => 0)).toBe(false);
    expect(wallPost(5, B.STONE, () => 0)).toBe(true);
    expect(wallPost(5, B.TORCH, () => 0)).toBe(true);
    expect(wallPost(3, 0, () => 0)).toBe(true);
    expect(wallPost(0, 0, () => 0)).toBe(true);
    expect(wallPost(10, W(wall), () => 10)).toBe(false);
    expect(wallPost(10, W(wall), () => 11)).toBe(true);
    expect(connMask(wall, (dx) => (dx ? W(GLASS_PANE) : 0))).toBe(5);
  });

  it('fences and walls are 1.5 blocks tall to walk into, panes are not', () => {
    const w = grid({ '0,0,0': FENCE_BASE, '2,0,0': WALL_BASE, '4,0,0': GLASS_PANE });
    expect(boxCollides(w, 0.3, 1.2, 0.3, 0.7, 1.4, 0.7)).toBe(true);
    expect(boxCollides(w, 2.3, 1.2, 2.3 - 2, 2.7, 1.4, 0.7)).toBe(true);
    expect(boxCollides(w, 4.3, 1.2, 0.3, 4.7, 1.4, 0.7)).toBe(false);
    expect(boxCollides(w, 0.0, 0.2, 0.0, 0.3, 0.4, 0.3)).toBe(false);
  });

  it('the outline covers connected arms', () => {
    const w = grid({ '0,0,0': FENCE_BASE, '1,0,0': FENCE_BASE });
    const hit = raycast(w, 0.85, 0.5, 2, 0, 0, -1, 5);
    expect(hit?.x).toBe(0);
  });
});

describe('v44 fence gates', () => {
  it('open and close with a tap, face the player, and stop blocking when open', () => {
    const w = world();
    w.p.mode = 'survival';
    w.p.inv.slots[w.p.inv.selected] = { id: GATE_BASE, count: 1 };
    w.p.yaw = 0;
    expect(w.sim.use(w.p, 1, 9, -13, 0, 1, 0, 0.5)).toBe(true);
    let v = w.store.getBlock(1, 10, -13);
    expect(blockId(v)).toBe(GATE_BASE);
    const f = blockMeta(v) & 3;
    expect(boxCollides(w.store, 1.2, 10.5, -12.6, 1.8, 11.2, -12.4)).toBe(true);
    w.p.inv.slots[w.p.inv.selected] = null;
    w.sim.use(w.p, 1, 10, -13, 0, 0, 1, 0.5);
    v = w.store.getBlock(1, 10, -13);
    expect(blockMeta(v) & GATE_OPEN).toBe(GATE_OPEN);
    expect(blockMeta(v) & 3).toBe(f);
    expect(boxCollides(w.store, 1.2, 10.5, -12.6, 1.8, 11.2, -12.4)).toBe(false);
    w.sim.use(w.p, 1, 10, -13, 0, 0, 1, 0.5);
    expect(blockMeta(w.store.getBlock(1, 10, -13)) & GATE_OPEN).toBe(0);
  });

  it('a redstone block opens a gate and removing it closes it', () => {
    const w = world();
    w.sim.setBlock(4, 10, -14, makeBlock(GATE_BASE + 3, 0));
    w.sim.setBlock(5, 10, -14, B.REDSTONE_BLOCK);
    w.run(4);
    expect(blockMeta(w.store.getBlock(4, 10, -14)) & GATE_OPEN).toBe(GATE_OPEN);
    w.sim.setBlock(5, 10, -14, 0);
    w.run(4);
    expect(blockMeta(w.store.getBlock(4, 10, -14)) & GATE_OPEN).toBe(0);
  });
});

describe('v44 new slabs, stairs and blocks', () => {
  it('extended slabs place, stack into the full block and drop the right item', () => {
    const i = SHAPE_MATS.findIndex((m) => m.key === 'smooth_quartz');
    expect(i).toBeGreaterThanOrEqual(32);
    const item = getItem(slabItem(i))!;
    expect(item.key).toBe('smooth_quartz_slab');
    expect(item.places).toBe(SLAB2);
    const w = world();
    w.p.mode = 'survival';
    w.p.inv.slots[w.p.inv.selected] = { id: slabItem(i), count: 2 };
    w.sim.use(w.p, 2, 9, -13, 0, 1, 0, 0.2);
    const v = w.store.getBlock(2, 10, -13);
    expect(blockId(v)).toBe(SLAB2);
    expect(shapeMatIndex(v)).toBe(i);
    w.sim.use(w.p, 2, 10, -13, 0, 1, 0, 0.5);
    expect(w.store.getBlock(2, 10, -13)).toBe(makeBlock(SHAPE_MATS[i].id));
    expect(getItem(stairsItem(i))?.places).toBe(STAIRS2);
  });

  it('every new block, slab, stair, wall, fence, gate and pane has an item and a recipe', () => {
    const ids = [...Object.values(NB), ...WOODS.map((_, i) => FENCE_BASE + i), ...WOODS.map((_, i) => GATE_BASE + i), ...WALL_MATS.map((_, i) => WALL_BASE + i), GLASS_PANE];
    const crafted = new Set(RECIPES.map((r) => r.result));
    for (const id of ids) {
      expect(getItem(id), `item ${id}`).toBeTruthy();
      expect(BLOCKS[id], `block ${id}`).toBeTruthy();
    }
    for (const id of ids.filter((id) => id !== NB.CRACKED_DEEPSLATE_BRICKS && id !== NB.CRACKED_DEEPSLATE_TILES && id !== NB.CRACKED_NETHER_BRICKS && id !== NB.SMOOTH_QUARTZ && id !== NB.SMOOTH_RED_SANDSTONE)) expect(crafted.has(id), `recipe ${BLOCKS[id].key}`).toBe(true);
    for (let i = 27; i < SHAPE_MATS.length; i++) { expect(crafted.has(slabItem(i))).toBe(true); expect(crafted.has(stairsItem(i))).toBe(true); }
    const slabIds = SHAPE_MATS.map((_, i) => slabItem(i)), stairIds = SHAPE_MATS.map((_, i) => stairsItem(i));
    expect(new Set([...slabIds, ...stairIds]).size).toBe(SHAPE_MATS.length * 2);
    expect(getItem(I.PRISMARINE_SHARD)).toBeTruthy();
    expect(BLOCKS[NB.SEA_LANTERN].lightEmit).toBe(15);
    expect(XB + XV.GRANITE).toBe(SHAPE_MATS.find((m) => m.key === 'granite')!.id);
    void CB;
  });
});

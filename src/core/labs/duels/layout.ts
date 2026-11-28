import { BLOCK_BY_KEY, makeBlock } from '../../blocks';
import type { ArenaLayout, Box, V3 } from '../minigames/arena';

const k = (key: string): number => { const b = BLOCK_BY_KEY.get(key); if (!b) throw new Error(`missing block ${key}`); return makeBlock(b.id); };

export interface DuelArena { name: string; center: V3; a: V3; b: V3; half: number; floorY: number; }
export interface DuelsLayout extends ArenaLayout { arenas: DuelArena[]; herald: V3; }

interface Theme { name: string; floor: string; trim: string; wall: string; accent: string; light: string; cover: string; }
const THEMES: Theme[] = [
  { name: 'Granite Court', floor: 'smooth_stone', trim: 'stone_bricks', wall: 'stone_bricks', accent: 'chiseled_stone_bricks', light: 'glowstone', cover: 'polished_andesite' },
  { name: 'Sunken Dunes', floor: 'smooth_sandstone', trim: 'cut_sandstone', wall: 'sandstone', accent: 'chiseled_sandstone', light: 'glowstone', cover: 'terracotta' },
  { name: 'Tidal Hall', floor: 'prismarine_bricks', trim: 'dark_prismarine', wall: 'prismarine', accent: 'sea_lantern', light: 'sea_lantern', cover: 'dark_prismarine' },
  { name: 'Ashen Pit', floor: 'polished_deepslate', trim: 'deepslate_tiles', wall: 'deepslate_bricks', accent: 'magma_block', light: 'shroomlight', cover: 'basalt' },
  { name: 'Ember Ring', floor: 'nether_bricks', trim: 'red_nether_bricks', wall: 'nether_bricks', accent: 'magma_block', light: 'glowstone', cover: 'blackstone' },
  { name: 'Ivory Keep', floor: 'smooth_quartz', trim: 'quartz_bricks', wall: 'quartz_block', accent: 'quartz_bricks', light: 'sea_lantern', cover: 'polished_granite' },
  { name: 'Verdant Ruin', floor: 'mossy_stone_bricks', trim: 'mossy_cobblestone', wall: 'mossy_stone_bricks', accent: 'oak_planks', light: 'shroomlight', cover: 'mossy_cobblestone' },
  { name: 'Clay Bastion', floor: 'packed_mud', trim: 'mud_bricks', wall: 'mud_bricks', accent: 'bricks', light: 'glowstone', cover: 'bricks' },
];

export const DUEL_FLOOR_Y = 64;
const HALF = 14;

function lobby(boxes: Box[]): V3 {
  const y = 100, add = (a: V3, b: V3, v: number) => boxes.push({ a, b, v });
  add([-16, y - 3, -16], [16, y - 3, 16], k('stone_bricks'));
  add([-16, y - 2, -16], [16, y - 1, 16], k('stone_bricks'));
  add([-15, y - 1, -15], [15, y - 1, 15], k('smooth_stone'));
  for (let i = -15; i <= 15; i += 5) { add([i, y - 1, -15], [i, y - 1, 15], k('polished_andesite')); add([-15, y - 1, i], [15, y - 1, i], k('polished_andesite')); }
  add([-4, y - 1, -4], [4, y - 1, 4], k('chiseled_stone_bricks'));
  add([-2, y - 1, -2], [2, y - 1, 2], k('polished_deepslate'));
  add([0, y - 1, 0], [0, y - 1, 0], k('glowstone'));
  for (const [x, z] of [[-16, -16], [16, -16], [-16, 16], [16, 16], [0, -16], [0, 16], [-16, 0], [16, 0]] as const) {
    add([x, y, z], [x, y + 4, z], k('chiseled_stone_bricks'));
    add([x, y + 5, z], [x, y + 5, z], k('glowstone'));
  }
  for (const s of [-1, 1]) {
    add([-15, y, 16 * s], [15, y, 16 * s], k('stone_bricks'));
    add([16 * s, y, -15], [16 * s, y, 15], k('stone_bricks'));
    add([-15, y + 1, 16 * s], [15, y + 2, 16 * s], k('glass'));
    add([16 * s, y + 1, -15], [16 * s, y + 2, 15], k('glass'));
  }
  add([-3, y, -9], [3, y, -7], k('polished_deepslate'));
  add([-3, y + 1, -10], [3, y + 3, -10], k('deepslate_bricks'));
  add([-3, y + 4, -10], [3, y + 4, -7], k('deepslate_tiles'));
  add([-3, y + 1, -9], [-3, y + 3, -9], k('deepslate_bricks'));
  add([3, y + 1, -9], [3, y + 3, -9], k('deepslate_bricks'));
  add([0, y + 3, -9], [0, y + 3, -9], k('shroomlight'));
  return [0.5, y + 1, -7.5];
}

function arena(boxes: Box[], cx: number, cz: number, t: Theme): DuelArena {
  const y = DUEL_FLOOR_Y, H = HALF, add = (a: V3, b: V3, v: number) => boxes.push({ a: [cx + a[0], a[1], cz + a[2]], b: [cx + b[0], b[1], cz + b[2]], v });
  add([-H - 1, y - 3, -H - 1], [H + 1, y - 1, H + 1], k(t.wall));
  add([-H, y, -H], [H, y, H], k(t.floor));
  for (let i = -H; i <= H; i += 7) { add([i, y, -H], [i, y, H], k(t.trim)); add([-H, y, i], [H, y, i], k(t.trim)); }
  add([-1, y, -1], [1, y, 1], k(t.accent));
  for (const s of [-1, 1]) {
    add([-H - 1, y, (H + 1) * s], [H + 1, y + 5, (H + 1) * s], k(t.wall));
    add([(H + 1) * s, y, -H - 1], [(H + 1) * s, y + 5, H + 1], k(t.wall));
    add([-H - 1, y + 6, (H + 1) * s], [H + 1, y + 7, (H + 1) * s], k('glass'));
    add([(H + 1) * s, y + 6, -H - 1], [(H + 1) * s, y + 7, H + 1], k('glass'));
    add([-2, y, (H - 1) * s], [2, y, (H - 1) * s], k(t.trim));
  }
  for (const [x, z] of [[-H - 1, -H - 1], [H + 1, -H - 1], [-H - 1, H + 1], [H + 1, H + 1]] as const) add([x, y + 6, z], [x, y + 7, z], k(t.light));
  for (const [x, z] of [[-7, -4], [7, 4], [-4, 7], [4, -7]] as const) {
    add([x, y + 1, z], [x, y + 2, z], k(t.cover));
    add([x, y + 3, z], [x, y + 3, z], k(t.light));
  }
  for (const [x, z] of [[-8, 0], [8, 0]] as const) add([x - 1, y + 1, z], [x + 1, y + 1, z], k(t.cover));
  return { name: t.name, center: [cx + 0.5, y + 1, cz + 0.5], a: [cx + 0.5, y + 1, cz - H + 3.5], b: [cx + 0.5, y + 1, cz + H - 2.5], half: H, floorY: y };
}

export function duelsLayout(): DuelsLayout {
  const boxes: Box[] = [];
  const herald = lobby(boxes);
  const arenas: DuelArena[] = [];
  for (let i = 0; i < 8; i++) arenas.push(arena(boxes, 128 + (i % 4) * 64, -32 + Math.floor(i / 4) * 64, THEMES[i]));
  return { kind: 'duels', boxes, lobby: [0.5, 100, 0.5], spawns: [], teams: [], gens: [], voidY: 20, buildTop: DUEL_FLOOR_Y + 8, bounds: 400, arenas, herald };
}

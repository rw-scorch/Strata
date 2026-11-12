import { B } from './blocks';
import { I, toolId, armorId } from './items';
import type { ItemStack } from './inventory';

export type Ingredient = number | string;

export const TAGS: Record<string, number[]> = {
  planks: [B.OAK_PLANKS, B.BIRCH_PLANKS, B.SPRUCE_PLANKS, B.JUNGLE_PLANKS],
  logs: [B.OAK_LOG, B.BIRCH_LOG, B.SPRUCE_LOG, B.JUNGLE_LOG],
  coals: [I.COAL, I.CHARCOAL],
  stones: [B.COBBLESTONE, B.MOSSY_COBBLESTONE],
  wool: [B.WHITE_WOOL, B.RED_WOOL, B.YELLOW_WOOL],
};

export interface Recipe {
  id: string;
  pattern?: string[];
  key?: Record<string, Ingredient>;
  shapeless?: Ingredient[];
  result: number;
  count: number;
  group: 'basics' | 'building' | 'tools' | 'combat' | 'food' | 'decor';
}

const R: Recipe[] = [];
const shaped = (id: string, group: Recipe['group'], result: number, count: number, pattern: string[], key: Record<string, Ingredient>) =>
  R.push({ id, group, result, count, pattern, key });
const shapeless = (id: string, group: Recipe['group'], result: number, count: number, ings: Ingredient[]) =>
  R.push({ id, group, result, count, shapeless: ings });

shapeless('oak_planks', 'basics', B.OAK_PLANKS, 4, [B.OAK_LOG]);
shapeless('birch_planks', 'basics', B.BIRCH_PLANKS, 4, [B.BIRCH_LOG]);
shapeless('spruce_planks', 'basics', B.SPRUCE_PLANKS, 4, [B.SPRUCE_LOG]);
shapeless('jungle_planks', 'basics', B.JUNGLE_PLANKS, 4, [B.JUNGLE_LOG]);
shaped('stick', 'basics', I.STICK, 4, ['P', 'P'], { P: 'planks' });
shaped('crafting_table', 'basics', B.WORKBENCH, 1, ['PP', 'PP'], { P: 'planks' });
shaped('torch', 'basics', B.TORCH, 4, ['C', 'S'], { C: 'coals', S: I.STICK });
shaped('furnace', 'basics', B.FURNACE, 1, ['CCC', 'C C', 'CCC'], { C: 'stones' });
shaped('chest', 'basics', B.CHEST, 1, ['PPP', 'P P', 'PPP'], { P: 'planks' });
shaped('ladder', 'basics', B.LADDER, 3, ['S S', 'SSS', 'S S'], { S: I.STICK });
shaped('door', 'basics', I.DOOR, 3, ['PP', 'PP', 'PP'], { P: 'planks' });
shaped('bucket', 'basics', I.BUCKET, 1, ['I I', ' I '], { I: I.IRON_INGOT });
shaped('bread', 'food', I.BREAD, 1, ['WWW'], { W: I.WHEAT });
shaped('paper', 'basics', I.PAPER, 3, ['SSS'], { S: B.SUGAR_CANE });
shapeless('book', 'basics', I.BOOK, 1, [I.PAPER, I.PAPER, I.PAPER, I.LEATHER]);
shaped('bookshelf', 'decor', B.BOOKSHELF, 1, ['PPP', 'BBB', 'PPP'], { P: 'planks', B: I.BOOK });
shaped('glowstone', 'decor', B.GLOWSTONE, 1, ['TTT', 'TGT', 'TTT'], { T: B.TORCH, G: B.GLASS });
shaped('bricks', 'building', B.BRICKS, 1, ['BB', 'BB'], { B: I.BRICK });
shaped('stone_bricks', 'building', B.STONE_BRICKS, 4, ['SS', 'SS'], { S: B.STONE });
shaped('sandstone', 'building', B.SANDSTONE, 1, ['SS', 'SS'], { S: B.SAND });
shaped('snow_block', 'building', B.SNOW, 1, ['SS', 'SS'], { S: B.SNOW });
shaped('white_wool', 'decor', B.WHITE_WOOL, 1, ['SS', 'SS'], { S: I.STRING });
shapeless('mossy_cobblestone', 'building', B.MOSSY_COBBLESTONE, 1, [B.COBBLESTONE, B.TALL_GRASS]);
shapeless('mossy_stone_bricks', 'building', B.MOSSY_STONE_BRICKS, 1, [B.STONE_BRICKS, B.TALL_GRASS]);
shapeless('red_dye', 'decor', I.RED_DYE, 1, [B.POPPY]);
shapeless('yellow_dye', 'decor', I.YELLOW_DYE, 1, [B.DANDELION]);
shapeless('red_wool', 'decor', B.RED_WOOL, 1, [B.WHITE_WOOL, I.RED_DYE]);
shapeless('yellow_wool', 'decor', B.YELLOW_WOOL, 1, [B.WHITE_WOOL, I.YELLOW_DYE]);
shaped('clay_block', 'building', B.CLAY, 1, ['CC', 'CC'], { C: I.CLAY_BALL });
shaped('golden_apple', 'food', I.GOLDEN_APPLE, 1, ['GGG', 'GAG', 'GGG'], { G: I.GOLD_INGOT, A: I.APPLE });
shaped('bowl', 'basics', I.BOWL, 4, ['P P', ' P '], { P: 'planks' });
shapeless('mushroom_stew', 'food', I.MUSHROOM_STEW, 1, [I.BOWL, B.RED_MUSHROOM, B.BROWN_MUSHROOM]);
shaped('bow', 'combat', I.BOW, 1, [' TS', 'T S', ' TS'], { T: I.STICK, S: I.STRING });
shaped('arrow', 'combat', I.ARROW, 4, ['F', 'S', 'E'], { F: I.FLINT, S: I.STICK, E: I.FEATHER });
shaped('iron_block', 'building', B.IRON_BLOCK, 1, ['III', 'III', 'III'], { I: I.IRON_INGOT });
shaped('gold_block', 'building', B.GOLD_BLOCK, 1, ['III', 'III', 'III'], { I: I.GOLD_INGOT });
shaped('aetherite_block', 'building', B.AETHERITE_BLOCK, 1, ['III', 'III', 'III'], { I: I.AETHERITE });
shapeless('iron_from_block', 'basics', I.IRON_INGOT, 9, [B.IRON_BLOCK]);
shapeless('gold_from_block', 'basics', I.GOLD_INGOT, 9, [B.GOLD_BLOCK]);
shapeless('aetherite_from_block', 'basics', I.AETHERITE, 9, [B.AETHERITE_BLOCK]);

const toolMats: Ingredient[] = ['planks', 'stones', I.IRON_INGOT, I.GOLD_INGOT, I.AETHERITE];
const toolNames = ['wooden', 'stone', 'iron', 'golden', 'aetherite'];
const toolPatterns: string[][] = [
  ['MMM', ' S ', ' S '],
  ['MM', 'MS', ' S'],
  ['M', 'S', 'S'],
  ['M', 'M', 'S'],
  ['MM', ' S', ' S'],
];
const toolTypeNames = ['pickaxe', 'axe', 'shovel', 'sword', 'hoe'];
for (let m = 0; m < 5; m++) {
  for (let t = 0; t < 5; t++) {
    shaped(`${toolNames[m]}_${toolTypeNames[t]}`, t === 3 ? 'combat' : 'tools', toolId(m, t), 1, toolPatterns[t], { M: toolMats[m], S: I.STICK });
  }
}
const armorMats: Ingredient[] = [I.LEATHER, I.IRON_INGOT, I.GOLD_INGOT, I.AETHERITE];
const armorPatterns = [['MMM', 'M M'], ['M M', 'MMM', 'MMM'], ['MMM', 'M M', 'M M'], ['M M', 'M M']];
const armorNames = ['helmet', 'chestplate', 'leggings', 'boots'];
const armorMatNames = ['leather', 'iron', 'gold', 'aetherite'];
for (let m = 0; m < 4; m++) {
  for (let s = 0; s < 4; s++) {
    shaped(`${armorMatNames[m]}_${armorNames[s]}`, 'combat', armorId(m, s), 1, armorPatterns[s], { M: armorMats[m] });
  }
}

export const RECIPES: Recipe[] = R;
export const RECIPE_BY_ID = new Map(R.map((r) => [r.id, r]));

export function ingredientMatches(ing: Ingredient, id: number): boolean {
  if (typeof ing === 'number') return ing === id;
  return TAGS[ing]?.includes(id) ?? false;
}

export function ingredientExample(ing: Ingredient): number {
  return typeof ing === 'number' ? ing : TAGS[ing][0];
}

function patternFits(r: Recipe): { w: number; h: number } {
  const p = r.pattern!;
  return { w: Math.max(...p.map((s) => s.length)), h: p.length };
}

export function recipeSize(r: Recipe): { w: number; h: number } {
  if (r.shapeless) {
    const n = r.shapeless.length;
    return n <= 4 ? { w: 2, h: 2 } : { w: 3, h: 3 };
  }
  return patternFits(r);
}

function matchShaped(r: Recipe, grid: (ItemStack | null)[], size: number, mirror: boolean): boolean {
  const p = r.pattern!;
  const { w, h } = patternFits(r);
  if (w > size || h > size) return false;
  let minX = size, minY = size, maxX = -1, maxY = -1;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (grid[y * size + x]) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  }
  if (maxX < 0) return false;
  if (maxX - minX + 1 !== w || maxY - minY + 1 !== h) return false;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = mirror ? w - 1 - x : x;
      const ch = p[y][px] ?? ' ';
      const cell = grid[(minY + y) * size + (minX + x)];
      if (ch === ' ') { if (cell) return false; continue; }
      const ing = r.key![ch];
      if (!cell || !ingredientMatches(ing, cell.id)) return false;
    }
  }
  return true;
}

function matchShapeless(r: Recipe, grid: (ItemStack | null)[]): boolean {
  const cells = grid.filter((c): c is ItemStack => !!c);
  if (cells.length !== r.shapeless!.length) return false;
  const used = new Array(cells.length).fill(false);
  for (const ing of r.shapeless!) {
    let found = false;
    for (let i = 0; i < cells.length; i++) {
      if (!used[i] && ingredientMatches(ing, cells[i].id)) { used[i] = true; found = true; break; }
    }
    if (!found) return false;
  }
  return true;
}

export function findRecipe(grid: (ItemStack | null)[], size: number): Recipe | null {
  if (!grid.some(Boolean)) return null;
  for (const r of R) {
    if (r.shapeless) { if (matchShapeless(r, grid)) return r; continue; }
    if (matchShaped(r, grid, size, false) || matchShaped(r, grid, size, true)) return r;
  }
  return null;
}

export interface SmeltRecipe { input: Ingredient; result: number; xp: number; }
export const SMELTING: SmeltRecipe[] = [
  { input: B.IRON_ORE, result: I.IRON_INGOT, xp: 0.7 },
  { input: B.GOLD_ORE, result: I.GOLD_INGOT, xp: 1 },
  { input: B.SAND, result: B.GLASS, xp: 0.1 },
  { input: B.COBBLESTONE, result: B.STONE, xp: 0.1 },
  { input: I.CLAY_BALL, result: I.BRICK, xp: 0.3 },
  { input: 'logs', result: I.CHARCOAL, xp: 0.15 },
  { input: I.RAW_PORK, result: I.COOKED_PORK, xp: 0.35 },
  { input: I.RAW_MUTTON, result: I.COOKED_MUTTON, xp: 0.35 },
  { input: I.RAW_POULTRY, result: I.COOKED_POULTRY, xp: 0.35 },
  { input: B.CLAY, result: B.BRICKS, xp: 0.35 },
];

export function findSmelt(id: number): SmeltRecipe | null {
  for (const s of SMELTING) if (ingredientMatches(s.input, id)) return s;
  return null;
}

import { XB, XV, B, BLOCKS, COLORS, DyeColor, woolId, terracottaId, powderId, stainedGlassId, SHAPE_MATS, SLAB_ITEM, STAIRS_ITEM } from './blocks';
import { I, toolId, armorId, dyeId, SPEAR_MATS } from './items';
import type { ItemStack } from './inventory';

export type Ingredient = number | string | number[];

export const TAGS: Record<string, number[]> = {
  planks: [B.OAK_PLANKS, B.BIRCH_PLANKS, B.SPRUCE_PLANKS, B.JUNGLE_PLANKS],
  logs: [B.OAK_LOG, B.BIRCH_LOG, B.SPRUCE_LOG, B.JUNGLE_LOG],
  coals: [I.COAL, I.CHARCOAL],
  stones: [B.COBBLESTONE, B.MOSSY_COBBLESTONE],
  wool: COLORS.map(woolId),
  sand_like: [B.SAND],
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
for (const c of COLORS) {
  const dye = dyeId(c);
  if (c !== 'red') shapeless(`${c}_wool`, 'decor', woolId(c), 1, [COLORS.filter((x) => x !== c).map(woolId), dye]);
  else shapeless('red_wool', 'decor', B.RED_WOOL, 1, [COLORS.filter((x) => x !== c).map(woolId), dye]);
  shaped(`${c}_terracotta`, 'building', terracottaId(c), 8, ['TTT', 'TDT', 'TTT'], { T: B.TERRACOTTA, D: dye });
  shapeless(`${c}_concrete_powder`, 'building', powderId(c), 8, [dye, B.SAND, B.SAND, B.SAND, B.SAND, B.GRAVEL, B.GRAVEL, B.GRAVEL, B.GRAVEL]);
  shaped(`${c}_stained_glass`, 'decor', stainedGlassId(c), 8, ['GGG', 'GDG', 'GGG'], { G: B.GLASS, D: dye });
}
const flowerDye: [number, DyeColor][] = [[B.CORNFLOWER, 'blue'], [B.LILY_OF_THE_VALLEY, 'white'], [B.ALLIUM, 'magenta'], [B.AZURE_BLUET, 'light_gray'], [B.BLUE_ORCHID, 'light_blue'], [B.ORANGE_TULIP, 'orange'], [B.PINK_TULIP, 'pink'], [B.WHITE_TULIP, 'light_gray'], [B.RED_TULIP, 'red'], [B.OXEYE_DAISY, 'light_gray']];
for (const [f, c] of flowerDye) shapeless(`${c}_dye_from_${BLOCKS[f].key}`, 'decor', dyeId(c), c === 'magenta' ? 1 : 1, [f]);
shapeless('white_dye', 'decor', dyeId('white'), 1, [I.BONE_MEAL]);
shapeless('black_dye', 'decor', dyeId('black'), 1, [I.INK_SAC]);
shapeless('brown_dye', 'decor', dyeId('brown'), 1, [I.COCOA_BEANS]);
shapeless('orange_dye', 'decor', dyeId('orange'), 2, [I.RED_DYE, I.YELLOW_DYE]);
shapeless('magenta_dye', 'decor', dyeId('magenta'), 2, [dyeId('purple'), dyeId('pink')]);
shapeless('light_blue_dye', 'decor', dyeId('light_blue'), 2, [dyeId('blue'), dyeId('white')]);
shapeless('lime_dye', 'decor', dyeId('lime'), 2, [dyeId('green'), dyeId('white')]);
shapeless('pink_dye', 'decor', dyeId('pink'), 2, [I.RED_DYE, dyeId('white')]);
shapeless('gray_dye', 'decor', dyeId('gray'), 2, [dyeId('black'), dyeId('white')]);
shapeless('light_gray_dye', 'decor', dyeId('light_gray'), 2, [dyeId('gray'), dyeId('white')]);
shapeless('light_gray_dye_from_black', 'decor', dyeId('light_gray'), 3, [dyeId('black'), dyeId('white'), dyeId('white')]);
shapeless('cyan_dye', 'decor', dyeId('cyan'), 2, [dyeId('blue'), dyeId('green')]);
shapeless('purple_dye', 'decor', dyeId('purple'), 2, [I.RED_DYE, dyeId('blue')]);
shaped('copper_block', 'building', B.COPPER_BLOCK, 1, ['CCC', 'CCC', 'CCC'], { C: I.COPPER_INGOT });
shapeless('copper_from_block', 'basics', I.COPPER_INGOT, 9, [B.COPPER_BLOCK]);
shaped('cut_copper', 'building', B.CUT_COPPER, 4, ['CC', 'CC'], { C: B.COPPER_BLOCK });
shaped('copper_lamp', 'decor', B.COPPER_LAMP, 1, [' C ', 'CTC', ' C '], { C: B.COPPER_BLOCK, T: B.TORCH });
shaped('chiseled_tuff', 'building', B.CHISELED_TUFF, 1, ['P', 'P'], { P: B.POLISHED_TUFF });
shaped('shears', 'tools', I.SHEARS, 1, [' I', 'I '], { I: I.IRON_INGOT });
shaped('redstone_torch', 'decor', B.REDSTONE_TORCH, 1, ['R', 'S'], { R: I.REDSTONE, S: I.STICK });
shaped('lever', 'decor', B.LEVER, 1, ['S', 'C'], { S: I.STICK, C: B.COBBLESTONE });
shapeless('stone_button', 'decor', B.STONE_BUTTON, 1, [B.STONE]);
shapeless('oak_button', 'decor', B.OAK_BUTTON, 1, [B.OAK_PLANKS]);
shaped('stone_pressure_plate', 'decor', B.STONE_PRESSURE_PLATE, 1, ['SS'], { S: B.STONE });
shaped('oak_pressure_plate', 'decor', B.OAK_PRESSURE_PLATE, 1, ['PP'], { P: B.OAK_PLANKS });
shaped('redstone_block', 'building', B.REDSTONE_BLOCK, 1, ['RRR', 'RRR', 'RRR'], { R: I.REDSTONE });
shapeless('redstone_from_block', 'basics', I.REDSTONE, 9, [B.REDSTONE_BLOCK]);
shaped('redstone_lamp', 'decor', B.REDSTONE_LAMP, 1, [' R ', 'RGR', ' R '], { R: I.REDSTONE, G: B.GLOWSTONE });
shaped('repeater', 'decor', B.REPEATER, 1, ['TRT', 'SSS'], { T: B.REDSTONE_TORCH, R: I.REDSTONE, S: B.STONE });
shaped('comparator', 'decor', B.COMPARATOR, 1, [' T ', 'TCT', 'SSS'], { T: B.REDSTONE_TORCH, C: I.COPPER_INGOT, S: B.STONE });
SHAPE_MATS.forEach((m, i) => {
  shaped(`${m.key}_slab`, 'building', SLAB_ITEM + i, 6, ['XXX'], { X: m.id });
  shaped(`${m.key}_stairs`, 'building', STAIRS_ITEM + i, 4, ['X  ', 'XX ', 'XXX'], { X: m.id });
});
shaped('rail', 'decor', B.RAIL, 16, ['I I', 'ISI', 'I I'], { I: I.IRON_INGOT, S: I.STICK });
shaped('powered_rail', 'decor', B.POWERED_RAIL, 6, ['G G', 'GSG', 'GRG'], { G: I.GOLD_INGOT, S: I.STICK, R: I.REDSTONE });
shaped('detector_rail', 'decor', B.DETECTOR_RAIL, 6, ['I I', 'IPI', 'IRI'], { I: I.IRON_INGOT, P: B.STONE_PRESSURE_PLATE, R: I.REDSTONE });
shaped('activator_rail', 'decor', B.ACTIVATOR_RAIL, 6, ['ISI', 'ITI', 'ISI'], { I: I.IRON_INGOT, S: I.STICK, T: B.REDSTONE_TORCH });
shaped('minecart', 'tools', I.MINECART, 1, ['I I', 'III'], { I: I.IRON_INGOT });
shapeless('tnt_minecart', 'combat', I.TNT_MINECART, 1, [I.MINECART, B.TNT]);
shaped('crossbow', 'combat', I.CROSSBOW, 1, ['SIS', 'TIT', ' S '], { S: I.STICK, I: I.IRON_INGOT, T: I.STRING });
shaped('mace', 'combat', I.MACE, 1, ['B', 'S'], { B: B.IRON_BLOCK, S: I.STICK });
shaped('enchanting_table', 'decor', B.ENCHANTING_TABLE, 1, [' B ', 'DOD', 'OOO'], { B: I.BOOK, D: I.AETHERITE, O: B.OBSIDIAN });
shaped('anvil', 'decor', B.ANVIL, 1, ['BBB', ' I ', 'III'], { B: B.IRON_BLOCK, I: I.IRON_INGOT });
shaped('lapis_block', 'decor', B.LAPIS_BLOCK, 1, ['LLL', 'LLL', 'LLL'], { L: I.LAPIS });
shapeless('lapis_from_block', 'decor', I.LAPIS, 9, [B.LAPIS_BLOCK]);
shaped('iron_from_nuggets', 'basics', I.IRON_INGOT, 1, ['NNN', 'NNN', 'NNN'], { N: I.IRON_NUGGET });
shaped('gold_from_nuggets', 'basics', I.GOLD_INGOT, 1, ['NNN', 'NNN', 'NNN'], { N: I.GOLD_NUGGET });
shapeless('iron_nuggets', 'basics', I.IRON_NUGGET, 9, [I.IRON_INGOT]);
shapeless('gold_nuggets', 'basics', I.GOLD_NUGGET, 9, [I.GOLD_INGOT]);
shaped('iron_bars', 'decor', B.IRON_BARS, 16, ['III', 'III'], { I: I.IRON_INGOT });
shaped('quartz_block', 'building', XB + XV.QUARTZ_BLOCK, 1, ['QQ', 'QQ'], { Q: I.QUARTZ });
shaped('nether_bricks', 'building', XB + XV.NETHER_BRICKS, 1, ['NN', 'NN'], { N: XB + XV.NETHERRACK });
shaped('polished_blackstone', 'building', XB + XV.POLISHED_BLACKSTONE, 4, ['BB', 'BB'], { B: XB + XV.BLACKSTONE });
shaped('polished_blackstone_bricks', 'building', XB + XV.POLISHED_BLACKSTONE_BRICKS, 4, ['BB', 'BB'], { B: XB + XV.POLISHED_BLACKSTONE });
SPEAR_MATS.forEach((m, i) => shaped(`${m.key}_spear`, 'combat', I.SPEAR + i, 1, ['  M', ' S ', 'S  '], { M: ([ 'planks', B.COBBLESTONE, I.IRON_INGOT, I.GOLD_INGOT, I.AETHERITE, I.COPPER_INGOT ] as Ingredient[])[i], S: I.STICK }));
shapeless('blastpowder', 'decor', I.GUNPOWDER, 2, [I.COAL, I.FLINT, I.REDSTONE]);
shapeless('blastpowder_charcoal', 'decor', I.GUNPOWDER, 2, [I.CHARCOAL, I.FLINT, I.REDSTONE]);
shaped('tnt', 'decor', B.TNT, 1, ['GSG', 'SGS', 'GSG'], { G: I.GUNPOWDER, S: B.SAND });
shapeless('firestriker', 'tools', I.FLINT_AND_STEEL, 1, [I.IRON_INGOT, I.FLINT]);
shaped('slime_block', 'decor', B.SLIME_BLOCK, 1, ['KCK', 'CKC', 'KCK'], { K: I.DRIED_KELP, C: I.CLAY_BALL });
shaped('honey_block', 'decor', B.HONEY_BLOCK, 1, ['SS', 'SS'], { S: B.SUGAR_CANE });
shaped('observer', 'decor', B.OBSERVER, 1, ['CCC', 'RRQ', 'CCC'], { C: B.COBBLESTONE, R: I.REDSTONE, Q: I.COPPER_INGOT });
shaped('piston', 'decor', B.PISTON, 1, ['PPP', 'CIC', 'CRC'], { P: 'planks', C: B.COBBLESTONE, I: I.IRON_INGOT, R: I.REDSTONE });
shaped('sticky_piston', 'decor', B.STICKY_PISTON, 1, ['S', 'P'], { S: I.CLAY_BALL, P: B.PISTON });
shaped('hopper', 'decor', B.HOPPER, 1, ['I I', 'ICI', ' I '], { I: I.IRON_INGOT, C: B.CHEST });
shaped('dropper', 'decor', B.DROPPER, 1, ['CCC', 'C C', 'CRC'], { C: B.COBBLESTONE, R: I.REDSTONE });
shaped('dispenser', 'decor', B.DISPENSER, 1, ['CCC', 'CBC', 'CRC'], { C: B.COBBLESTONE, B: I.BOW, R: I.REDSTONE });
shaped('cookie', 'food', I.COOKIE, 8, ['WCW'], { W: I.WHEAT, C: I.COCOA_BEANS });
shapeless('mossy_cobblestone_vine', 'building', B.MOSSY_COBBLESTONE, 1, [B.COBBLESTONE, B.VINE]);
shapeless('mossy_stone_bricks_vine', 'building', B.MOSSY_STONE_BRICKS, 1, [B.STONE_BRICKS, B.VINE]);
shaped('polished_tuff', 'building', B.POLISHED_TUFF, 4, ['TT', 'TT'], { T: B.TUFF });
shaped('tuff_bricks', 'building', B.TUFF_BRICKS, 4, ['TT', 'TT'], { T: B.POLISHED_TUFF });
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
shaped('coal_block', 'building', B.COAL_BLOCK, 1, ['CCC', 'CCC', 'CCC'], { C: I.COAL });
shapeless('coal_from_block', 'basics', I.COAL, 9, [B.COAL_BLOCK]);
shaped('emerald_block', 'building', B.EMERALD_BLOCK, 1, ['EEE', 'EEE', 'EEE'], { E: I.EMERALD });
shapeless('emerald_from_block', 'basics', I.EMERALD, 9, [B.EMERALD_BLOCK]);
shaped('hay_block', 'building', B.HAY_BLOCK, 1, ['WWW', 'WWW', 'WWW'], { W: I.WHEAT });
shapeless('wheat_from_hay', 'food', I.WHEAT, 9, [B.HAY_BLOCK]);
shaped('packed_ice', 'building', B.PACKED_ICE, 1, ['III', 'III', 'III'], { I: B.ICE });
shapeless('bone_meal', 'basics', I.BONE_MEAL, 3, [I.BONE]);
shaped('bone_block', 'building', B.BONE_BLOCK, 1, ['MMM', 'MMM', 'MMM'], { M: I.BONE_MEAL });
shapeless('bone_meal_from_block', 'basics', I.BONE_MEAL, 9, [B.BONE_BLOCK]);
shaped('cut_sandstone', 'building', B.CUT_SANDSTONE, 4, ['SS', 'SS'], { S: B.SANDSTONE });
shaped('chiseled_sandstone', 'building', B.CHISELED_SANDSTONE, 1, ['S', 'S'], { S: B.CUT_SANDSTONE });
shaped('chiseled_stone_bricks', 'building', B.CHISELED_STONE_BRICKS, 1, ['S', 'S'], { S: B.STONE_BRICKS });
shapeless('mossy_cobble_vine', 'building', B.MOSSY_COBBLESTONE, 1, [B.COBBLESTONE, B.FERN]);
shapeless('mossy_bricks_vine', 'building', B.MOSSY_STONE_BRICKS, 1, [B.STONE_BRICKS, B.FERN]);

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
  if (Array.isArray(ing)) return ing.includes(id);
  return TAGS[ing]?.includes(id) ?? false;
}

export function ingredientExample(ing: Ingredient): number {
  if (typeof ing === 'number') return ing;
  if (Array.isArray(ing)) return ing[0];
  return TAGS[ing][0];
}

export function ingredientOptions(ing: Ingredient): number[] {
  if (typeof ing === 'number') return [ing];
  if (Array.isArray(ing)) return ing;
  return TAGS[ing] ?? [];
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

export function findRecipe(grid: (ItemStack | null)[], size: number, book: RecipeBook = BASE_BOOK): Recipe | null {
  if (!grid.some(Boolean)) return null;
  for (const r of book.crafting) {
    if (r.shapeless) { if (matchShapeless(r, grid)) return r; continue; }
    if (matchShaped(r, grid, size, false) || matchShaped(r, grid, size, true)) return r;
  }
  return null;
}

export interface SmeltRecipe { input: Ingredient; result: number; xp: number; }
export const SMELTING: SmeltRecipe[] = [
  { input: B.IRON_ORE, result: I.IRON_INGOT, xp: 0.7 },
  { input: B.GOLD_ORE, result: I.GOLD_INGOT, xp: 1 },
  { input: B.LAPIS_ORE, result: I.LAPIS, xp: 0.2 },
  { input: XB + XV.NETHER_QUARTZ_ORE, result: I.QUARTZ, xp: 0.2 },
  { input: XB + XV.NETHER_GOLD_ORE, result: I.GOLD_INGOT, xp: 1 },
  { input: B.SAND, result: B.GLASS, xp: 0.1 },
  { input: B.COBBLESTONE, result: B.STONE, xp: 0.1 },
  { input: I.CLAY_BALL, result: I.BRICK, xp: 0.3 },
  { input: 'logs', result: I.CHARCOAL, xp: 0.15 },
  { input: I.RAW_PORK, result: I.COOKED_PORK, xp: 0.35 },
  { input: I.RAW_MUTTON, result: I.COOKED_MUTTON, xp: 0.35 },
  { input: I.RAW_POULTRY, result: I.COOKED_POULTRY, xp: 0.35 },
  { input: B.CLAY, result: B.TERRACOTTA, xp: 0.35 },
  { input: B.STONE, result: B.SMOOTH_STONE, xp: 0.1 },
  { input: B.STONE_BRICKS, result: B.CRACKED_STONE_BRICKS, xp: 0.1 },
  { input: B.SANDSTONE, result: B.SMOOTH_SANDSTONE, xp: 0.1 },
  { input: B.COPPER_ORE, result: I.COPPER_INGOT, xp: 0.7 },
  { input: B.CACTUS, result: dyeId('green'), xp: 1 },
  { input: B.KELP, result: I.DRIED_KELP, xp: 0.1 },
  { input: B.REDSTONE_ORE, result: I.REDSTONE, xp: 0.7 },
];

export function findSmelt(id: number, book: RecipeBook = BASE_BOOK): SmeltRecipe | null {
  for (const s of book.smelting) if (ingredientMatches(s.input, id)) return s;
  return null;
}

export interface DataRecipes {
  name: string;
  hash: string;
  crafting: Recipe[];
  smelting: SmeltRecipe[];
  remove: string[];
}

export interface RecipeBook {
  crafting: Recipe[];
  smelting: SmeltRecipe[];
  byId: Map<string, Recipe>;
  data: DataRecipes | null;
}

export const BASE_BOOK: RecipeBook = { crafting: R, smelting: SMELTING, byId: RECIPE_BY_ID, data: null };

export function makeBook(d: DataRecipes | null | undefined): RecipeBook {
  if (!d || (!d.crafting.length && !d.smelting.length && !d.remove.length)) return BASE_BOOK;
  const gone = new Set(d.remove);
  for (const r of d.crafting) gone.add(r.id);
  const crafting = [...d.crafting, ...R.filter((r) => !gone.has(r.id))];
  const smelting = [...d.smelting, ...SMELTING];
  return { crafting, smelting, byId: new Map(crafting.map((r) => [r.id, r])), data: d };
}

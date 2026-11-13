export type RenderType =
  | 'none' | 'cube' | 'leaves' | 'glass' | 'translucent' | 'liquid'
  | 'cross' | 'crop' | 'torch' | 'door' | 'ladder' | 'cactus' | 'chest' | 'redstone' | 'rs6';

export type ToolType = 'pickaxe' | 'axe' | 'shovel' | 'hoe' | 'sword';
export type SoundGroup = 'stone' | 'wood' | 'grass' | 'dirt' | 'sand' | 'gravel' | 'glass' | 'snow' | 'cloth' | 'metal' | 'water' | 'lava';
export type TintType = 'grass' | 'foliage' | 'birch' | 'spruce' | null;

export interface FaceTextures {
  px: string; nx: string; py: string; ny: string; pz: string; nz: string;
}

export interface DropSpec {
  item: number | 'self';
  min?: number;
  max?: number;
  chance?: number;
}

export interface BlockDef {
  id: number;
  key: string;
  name: string;
  desc: string;
  render: RenderType;
  solid: boolean;
  opaque: boolean;
  lightEmit: number;
  lightFilter: number;
  hardness: number;
  tool: ToolType | null;
  tier: number;
  drops: DropSpec[] | null;
  xp: [number, number];
  sound: SoundGroup;
  faces: FaceTextures;
  front?: string;
  frontLit?: string;
  tint: TintType;
  tintFaces: 'all' | 'top';
  overlay?: string;
  replaceable: boolean;
  climbable: boolean;
  fluid: 'water' | 'lava' | null;
  needsSupport: 'soil' | 'sand' | 'solid' | 'farmland' | 'water-edge' | 'cactus' | 'water-plant' | null;
  orientable: boolean;
  interactive: boolean;
  category: 'building' | 'nature' | 'functional' | 'ore' | 'plants' | 'hidden';
  cullSelf: boolean;
}

export const B = {
  AIR: 0, STONE: 1, GRASS: 2, DIRT: 3, COBBLESTONE: 4, OAK_PLANKS: 5, BEDROCK: 6, SAND: 7, GRAVEL: 8,
  CLAY: 9, SNOW: 10, ICE: 11, WATER: 12, LAVA: 13, OAK_LOG: 14, OAK_LEAVES: 15, BIRCH_LOG: 16,
  BIRCH_LEAVES: 17, SPRUCE_LOG: 18, SPRUCE_LEAVES: 19, JUNGLE_LOG: 20, JUNGLE_LEAVES: 21,
  COAL_ORE: 22, IRON_ORE: 23, GOLD_ORE: 24, AETHERITE_ORE: 25, SANDSTONE: 26, CACTUS: 27,
  TALL_GRASS: 28, DANDELION: 29, POPPY: 30, DEAD_BUSH: 31, FERN: 32, SUGAR_CANE: 33,
  WORKBENCH: 34, FURNACE: 35, FURNACE_LIT: 36, CHEST: 37, TORCH: 38, GLASS: 39, BRICKS: 40,
  STONE_BRICKS: 41, OAK_DOOR: 42, LADDER: 43, WHITE_WOOL: 44, IRON_BLOCK: 45, GOLD_BLOCK: 46,
  AETHERITE_BLOCK: 47, MOSSY_COBBLESTONE: 48, OBSIDIAN: 49, SNOWY_GRASS: 50, GLOWSTONE: 51,
  MUD: 52, FARMLAND: 53, WHEAT: 54, OAK_SAPLING: 55, BIRCH_SAPLING: 56, SPRUCE_SAPLING: 57,
  JUNGLE_SAPLING: 58, RED_MUSHROOM: 59, BROWN_MUSHROOM: 60, BOOKSHELF: 61, BIRCH_PLANKS: 62,
  SPRUCE_PLANKS: 63, JUNGLE_PLANKS: 64, MOSSY_STONE_BRICKS: 65, RED_WOOL: 66, YELLOW_WOOL: 67,
  LILY_PAD: 68, SMOOTH_STONE: 69, CRACKED_STONE_BRICKS: 70, CHISELED_STONE_BRICKS: 71, CUT_SANDSTONE: 72, CHISELED_SANDSTONE: 73,
  SMOOTH_SANDSTONE: 74, COAL_BLOCK: 75, HAY_BLOCK: 76, PACKED_ICE: 77, TERRACOTTA: 78, BONE_BLOCK: 79, EMERALD_BLOCK: 80,
  CORNFLOWER: 158, LILY_OF_THE_VALLEY: 159, ALLIUM: 160, AZURE_BLUET: 161, BLUE_ORCHID: 162, ORANGE_TULIP: 163, PINK_TULIP: 164, WHITE_TULIP: 165, RED_TULIP: 166, OXEYE_DAISY: 167,
  TUFF: 168, TUFF_BRICKS: 169, CHISELED_TUFF: 170, POLISHED_TUFF: 171, COPPER_BLOCK: 172, CUT_COPPER: 173, COPPER_LAMP: 174, COPPER_ORE: 175,
  SPAWNER: 176, TRIAL_SPAWNER: 177, VAULT: 178, KELP: 179, KELP_PLANT: 180, SEAGRASS: 181, VINE: 182,
  REDSTONE_WIRE: 183, REDSTONE_TORCH: 184, LEVER: 185, STONE_BUTTON: 186, OAK_BUTTON: 187, STONE_PRESSURE_PLATE: 188, OAK_PRESSURE_PLATE: 189,
  REDSTONE_BLOCK: 190, REDSTONE_LAMP: 191, REDSTONE_LAMP_LIT: 192, UNLIT_REDSTONE_TORCH: 193, REDSTONE_ORE: 194, REPEATER: 195, COMPARATOR: 196,
  OBSERVER: 197, PISTON: 198, STICKY_PISTON: 199, PISTON_HEAD: 200, MOVING_PISTON: 201, HOPPER: 202, DROPPER: 203, DISPENSER: 204,
} as const;

export const COLORS = ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black'] as const;
export type DyeColor = (typeof COLORS)[number];
export const COLOR_NAMES: Record<DyeColor, string> = {
  white: 'Ivory', orange: 'Amber', magenta: 'Orchid', light_blue: 'Sky', yellow: 'Saffron', lime: 'Lime', pink: 'Rose', gray: 'Slate',
  light_gray: 'Ash', cyan: 'Lagoon', purple: 'Violet', blue: 'Cobalt', brown: 'Umber', green: 'Jade', red: 'Crimson', black: 'Onyx',
};
export const COLOR_RGB: Record<DyeColor, number> = {
  white: 0xf0f0f0, orange: 0xf07613, magenta: 0xbd44b3, light_blue: 0x3aafd9, yellow: 0xf8c627, lime: 0x70b919, pink: 0xed8dac, gray: 0x3e4447,
  light_gray: 0x8e8e86, cyan: 0x158991, purple: 0x792aac, blue: 0x35399d, brown: 0x724728, green: 0x546d1b, red: 0xa12722, black: 0x141519,
};
const OTHER_WOOL = COLORS.filter((c) => c !== 'white' && c !== 'yellow' && c !== 'red');
export function woolId(c: DyeColor): number { return c === 'white' ? 44 : c === 'yellow' ? 67 : c === 'red' ? 66 : 81 + OTHER_WOOL.indexOf(c); }
export function terracottaId(c: DyeColor): number { return 94 + COLORS.indexOf(c); }
export function concreteId(c: DyeColor): number { return 110 + COLORS.indexOf(c); }
export function powderId(c: DyeColor): number { return 126 + COLORS.indexOf(c); }
export function stainedGlassId(c: DyeColor): number { return 142 + COLORS.indexOf(c); }
export function isPowder(id: number): boolean { return id >= 126 && id <= 141; }

export const BLOCK_COUNT = 69;

const ALL = (t: string): FaceTextures => ({ px: t, nx: t, py: t, ny: t, pz: t, nz: t });
const COL = (side: string, end: string, bottom = end): FaceTextures => ({ px: side, nx: side, py: end, ny: bottom, pz: side, nz: side });

type Partial2 = Partial<BlockDef> & { faces: FaceTextures };

const defs: BlockDef[] = [];

function def(id: number, key: string, name: string, desc: string, p: Partial2): void {
  defs[id] = {
    id, key, name, desc,
    render: 'cube', solid: true, opaque: true, lightEmit: 0, lightFilter: 15,
    hardness: 1, tool: null, tier: 0, drops: [{ item: 'self' }], xp: [0, 0],
    sound: 'stone', tint: null, tintFaces: 'all', replaceable: false, climbable: false,
    fluid: null, needsSupport: null, orientable: false, interactive: false,
    category: 'building', cullSelf: true,
    ...p,
  };
}

const PLANT: Partial<BlockDef> = {
  render: 'cross', solid: false, opaque: false, lightFilter: 0, hardness: 0, sound: 'grass',
  replaceable: false, needsSupport: 'soil', category: 'plants',
};
const LEAVES: Partial<BlockDef> = {
  render: 'leaves', opaque: false, lightFilter: 1, hardness: 0.2, tool: 'hoe', sound: 'grass', category: 'nature', cullSelf: true,
};
const LOG: Partial<BlockDef> = { hardness: 2, tool: 'axe', sound: 'wood', category: 'nature' };
const PLANK: Partial<BlockDef> = { hardness: 2, tool: 'axe', sound: 'wood' };

def(0, 'air', 'Air', '', { faces: ALL('stone'), render: 'none', solid: false, opaque: false, lightFilter: 0, hardness: 0, drops: null, replaceable: true, category: 'hidden' });
def(1, 'stone', 'Stone', 'The bones of the world. Breaks into cobblestone.', { faces: ALL('stone'), hardness: 1.5, tool: 'pickaxe', tier: 1, drops: [{ item: 4 }], category: 'nature' });
def(2, 'grass', 'Grass Block', 'Living turf. Gives dirt when dug.', { faces: { px: 'grass_block_side', nx: 'grass_block_side', py: 'grass_block_top', ny: 'dirt', pz: 'grass_block_side', nz: 'grass_block_side' }, overlay: 'grass_block_side_overlay', tint: 'grass', tintFaces: 'top', hardness: 0.6, tool: 'shovel', drops: [{ item: 3 }], sound: 'grass', category: 'nature' });
def(3, 'dirt', 'Dirt', 'Humble soil, ready for a hoe.', { faces: ALL('dirt'), hardness: 0.5, tool: 'shovel', sound: 'dirt', category: 'nature' });
def(4, 'cobblestone', 'Cobblestone', 'Rough stone, the first building block of every wayfarer.', { faces: ALL('cobblestone'), hardness: 2, tool: 'pickaxe', tier: 1 });
def(5, 'oak_planks', 'Oak Planks', 'Sawn timber for walls, floors and tools.', { faces: ALL('oak_planks'), ...PLANK });
def(6, 'bedrock', 'Bedrock', 'The floor of the world. Unbreakable.', { faces: ALL('bedrock'), hardness: -1, drops: null, category: 'nature' });
def(7, 'sand', 'Sand', 'Fine grains that smelt into glass.', { faces: ALL('sand'), hardness: 0.5, tool: 'shovel', sound: 'sand', category: 'nature' });
def(8, 'gravel', 'Gravel', 'Loose stones. Sometimes yields flint.', { faces: ALL('gravel'), hardness: 0.6, tool: 'shovel', sound: 'gravel', drops: [{ item: 'self', chance: 0.9 }, { item: 263, chance: 0.1 }], category: 'nature' });
def(9, 'clay', 'Clay', 'Riverbed clay. Breaks into clay balls for brickmaking.', { faces: ALL('clay'), hardness: 0.6, tool: 'shovel', sound: 'dirt', drops: [{ item: 279, min: 4, max: 4 }], category: 'nature' });
def(10, 'snow_block', 'Snow', 'Packed snow from the high peaks.', { faces: ALL('snow'), hardness: 0.2, tool: 'shovel', sound: 'snow', category: 'nature' });
def(11, 'ice', 'Ice', 'Slick and translucent. Shatters when broken.', { faces: ALL('ice'), render: 'translucent', opaque: false, lightFilter: 2, hardness: 0.5, tool: 'pickaxe', drops: null, sound: 'glass', category: 'nature' });
def(12, 'water', 'Water', 'Still water.', { faces: ALL('water_still'), render: 'liquid', solid: false, opaque: false, lightFilter: 2, hardness: -1, drops: null, replaceable: true, fluid: 'water', sound: 'water', tint: null, category: 'hidden' });
def(13, 'lava', 'Lava', 'Molten rock. Keep your distance.', { faces: ALL('lava_still'), render: 'liquid', solid: false, opaque: false, lightFilter: 0, lightEmit: 15, hardness: -1, drops: null, replaceable: true, fluid: 'lava', sound: 'lava', category: 'hidden' });
def(14, 'oak_log', 'Oak Log', 'Sturdy trunk wood. Craft into planks.', { faces: COL('oak_log', 'oak_log_top'), ...LOG });
def(15, 'oak_leaves', 'Oak Leaves', 'Rustling canopy. Hides saplings and the odd apple.', { faces: ALL('oak_leaves'), ...LEAVES, tint: 'foliage', drops: [{ item: 55, chance: 0.06 }, { item: 258, chance: 0.01 }, { item: 256, chance: 0.02 }] });
def(16, 'birch_log', 'Birch Log', 'Pale, papery bark.', { faces: COL('birch_log', 'birch_log_top'), ...LOG });
def(17, 'birch_leaves', 'Birch Leaves', 'Light, bright foliage.', { faces: ALL('birch_leaves'), ...LEAVES, tint: 'birch', drops: [{ item: 56, chance: 0.06 }, { item: 256, chance: 0.02 }] });
def(18, 'spruce_log', 'Spruce Log', 'Dark resinous timber from the cold north.', { faces: COL('spruce_log', 'spruce_log_top'), ...LOG });
def(19, 'spruce_leaves', 'Spruce Needles', 'Evergreen and fragrant.', { faces: ALL('spruce_leaves'), ...LEAVES, tint: 'spruce', drops: [{ item: 57, chance: 0.06 }, { item: 256, chance: 0.02 }] });
def(20, 'jungle_log', 'Jungle Log', 'Tall timber from steaming forests.', { faces: COL('jungle_log', 'jungle_log_top'), ...LOG });
def(21, 'jungle_leaves', 'Jungle Leaves', 'Broad, dense leaves.', { faces: ALL('jungle_leaves'), ...LEAVES, tint: 'foliage', drops: [{ item: 58, chance: 0.03 }, { item: 256, chance: 0.02 }, { item: 367, chance: 0.05 }] });
def(22, 'coal_ore', 'Coal Ore', 'Black seams of fuel.', { faces: ALL('coal_ore'), hardness: 3, tool: 'pickaxe', tier: 1, drops: [{ item: 260 }], xp: [0, 2], category: 'ore' });
def(23, 'iron_ore', 'Iron Ore', 'Rust-flecked stone. Smelt for iron.', { faces: ALL('iron_ore'), hardness: 3, tool: 'pickaxe', tier: 2, category: 'ore' });
def(24, 'gold_ore', 'Gold Ore', 'Glints of soft, bright metal.', { faces: ALL('gold_ore'), hardness: 3, tool: 'pickaxe', tier: 3, category: 'ore' });
def(25, 'aetherite_ore', 'Aetherite Ore', 'Deep crystal that hums faintly. Needs iron to mine.', { faces: ALL('aetherite_ore'), hardness: 3, tool: 'pickaxe', tier: 3, drops: [{ item: 264 }], xp: [3, 7], category: 'ore' });
def(26, 'sandstone', 'Sandstone', 'Compressed desert sand.', { faces: COL('sandstone', 'sandstone_top', 'sandstone_bottom'), hardness: 0.8, tool: 'pickaxe', tier: 1, category: 'nature' });
def(27, 'cactus', 'Cactus', 'Prickly. Hurts to touch.', { faces: COL('cactus_side', 'cactus_top', 'cactus_bottom'), render: 'cactus', opaque: false, lightFilter: 0, hardness: 0.4, sound: 'cloth', needsSupport: 'cactus', category: 'plants', cullSelf: false });
def(28, 'tall_grass', 'Tall Grass', 'Wild grass. Occasionally hides seeds.', { faces: ALL('short_grass'), ...PLANT, tint: 'grass', replaceable: true, drops: [{ item: 276, chance: 0.125 }] });
def(29, 'dandelion', 'Dandelion', 'A cheerful yellow bloom.', { faces: ALL('dandelion'), ...PLANT });
def(30, 'poppy', 'Poppy', 'A vivid red flower.', { faces: ALL('poppy'), ...PLANT });
def(31, 'dead_bush', 'Dead Bush', 'Brittle desert scrub.', { faces: ALL('dead_bush'), ...PLANT, needsSupport: 'sand', replaceable: true, drops: [{ item: 256, min: 0, max: 2 }] });
def(32, 'fern', 'Fern', 'Curled fronds of the forest floor.', { faces: ALL('fern'), ...PLANT, tint: 'grass', replaceable: true, drops: [{ item: 276, chance: 0.125 }] });
def(33, 'sugar_cane', 'Sugar Cane', 'Grows beside water. Pressed into paper.', { faces: ALL('sugar_cane'), ...PLANT, tint: 'grass', needsSupport: 'water-edge' });
def(34, 'crafting_table', 'Workbench', 'A 3x3 crafting surface for advanced recipes.', { faces: { px: 'crafting_table_side', nx: 'crafting_table_front', py: 'crafting_table_top', ny: 'oak_planks', pz: 'crafting_table_side', nz: 'crafting_table_front' }, hardness: 2.5, tool: 'axe', sound: 'wood', interactive: true, category: 'functional' });
def(35, 'furnace', 'Furnace', 'Smelts ores and cooks food with fuel.', { faces: COL('furnace_side', 'furnace_top'), front: 'furnace_front', hardness: 3.5, tool: 'pickaxe', tier: 1, orientable: true, interactive: true, category: 'functional' });
def(36, 'furnace_lit', 'Lit Furnace', '', { faces: COL('furnace_side', 'furnace_top'), front: 'furnace_front_on', hardness: 3.5, tool: 'pickaxe', tier: 1, lightEmit: 13, orientable: true, interactive: true, drops: [{ item: 35 }], category: 'hidden' });
def(37, 'chest', 'Chest', 'Twenty-seven slots of safekeeping.', { faces: COL('chest_side', 'chest_top'), front: 'chest_front', render: 'chest', opaque: false, lightFilter: 0, hardness: 2.5, tool: 'axe', sound: 'wood', orientable: true, interactive: true, category: 'functional' });
def(38, 'torch', 'Torch', 'Pushes back the dark. Keeps the Hollowed at bay.', { faces: ALL('torch'), render: 'torch', solid: false, opaque: false, lightFilter: 0, lightEmit: 14, hardness: 0, sound: 'wood', needsSupport: 'solid', category: 'functional' });
def(39, 'glass', 'Glass', 'Clear panes of fused sand.', { faces: ALL('glass'), render: 'glass', opaque: false, lightFilter: 0, hardness: 0.3, drops: null, sound: 'glass' });
def(40, 'bricks', 'Bricks', 'Fired clay, neatly mortared.', { faces: ALL('bricks'), hardness: 2, tool: 'pickaxe', tier: 1 });
def(41, 'stone_bricks', 'Stone Bricks', 'Dressed stone for fine masonry.', { faces: ALL('stone_bricks'), hardness: 1.5, tool: 'pickaxe', tier: 1 });
def(42, 'oak_door', 'Oak Door', 'Swings open with a tap.', { faces: ALL('oak_door_bottom'), render: 'door', opaque: false, lightFilter: 0, hardness: 3, tool: 'axe', sound: 'wood', drops: [{ item: 280 }], interactive: true, category: 'hidden' });
def(43, 'ladder', 'Ladder', 'Climb walls and mineshafts.', { faces: ALL('ladder'), render: 'ladder', solid: false, opaque: false, lightFilter: 0, hardness: 0.4, tool: 'axe', sound: 'wood', climbable: true, needsSupport: 'solid', orientable: true, category: 'functional' });
def(44, 'white_wool', 'White Wool', 'Soft fleece from a Woolhorn.', { faces: ALL('white_wool'), hardness: 0.8, sound: 'cloth' });
def(45, 'iron_block', 'Block of Iron', 'Nine ingots, compactly stored.', { faces: ALL('iron_block'), hardness: 5, tool: 'pickaxe', tier: 2, sound: 'metal' });
def(46, 'gold_block', 'Block of Gold', 'A gleaming hoard.', { faces: ALL('gold_block'), hardness: 3, tool: 'pickaxe', tier: 3, sound: 'metal' });
def(47, 'aetherite_block', 'Block of Aetherite', 'Crystalline and luminous to the eye.', { faces: ALL('aetherite_block'), hardness: 5, tool: 'pickaxe', tier: 3, sound: 'metal' });
def(48, 'mossy_cobblestone', 'Mossy Cobblestone', 'Old stone, green with age.', { faces: ALL('mossy_cobblestone'), hardness: 2, tool: 'pickaxe', tier: 1 });
def(49, 'obsidian', 'Obsidian', 'Volcanic glass, formed where water meets lava.', { faces: ALL('obsidian'), hardness: 25, tool: 'pickaxe', tier: 4 });
def(50, 'snowy_grass', 'Snowy Turf', 'Grass beneath a frosting of snow.', { faces: { px: 'grass_block_snow', nx: 'grass_block_snow', py: 'snow', ny: 'dirt', pz: 'grass_block_snow', nz: 'grass_block_snow' }, hardness: 0.6, tool: 'shovel', drops: [{ item: 3 }], sound: 'snow', category: 'nature' });
def(51, 'glowstone', 'Glowshard', 'Crystallised light. Brighter than any torch.', { faces: ALL('glowstone'), opaque: true, lightEmit: 15, hardness: 0.3, sound: 'glass', category: 'functional' });
def(52, 'mud', 'Mud', 'Squelching swamp soil.', { faces: ALL('mud'), hardness: 0.5, tool: 'shovel', sound: 'dirt', category: 'nature' });
def(53, 'farmland', 'Farmland', 'Tilled soil for crops.', { faces: { px: 'dirt', nx: 'dirt', py: 'farmland_moist', ny: 'dirt', pz: 'dirt', nz: 'dirt' }, hardness: 0.6, tool: 'shovel', drops: [{ item: 3 }], sound: 'dirt', category: 'hidden' });
def(54, 'wheat', 'Wheat Crop', 'Golden grain, ripening slowly.', { faces: ALL('wheat_stage0'), ...PLANT, render: 'crop', needsSupport: 'farmland', drops: [{ item: 276 }], category: 'hidden' });
def(55, 'oak_sapling', 'Oak Sapling', 'Plant on soil and wait for an oak.', { faces: ALL('oak_sapling'), ...PLANT });
def(56, 'birch_sapling', 'Birch Sapling', 'Grows into a slender birch.', { faces: ALL('birch_sapling'), ...PLANT });
def(57, 'spruce_sapling', 'Spruce Sapling', 'Grows into a tall spruce.', { faces: ALL('spruce_sapling'), ...PLANT });
def(58, 'jungle_sapling', 'Jungle Sapling', 'Grows into a jungle giant.', { faces: ALL('jungle_sapling'), ...PLANT });
def(59, 'red_mushroom', 'Red Mushroom', 'Thrives in shade and damp.', { faces: ALL('red_mushroom'), ...PLANT, needsSupport: 'solid' });
def(60, 'brown_mushroom', 'Brown Mushroom', 'Earthy and faintly glowing to sharp eyes.', { faces: ALL('brown_mushroom'), ...PLANT, needsSupport: 'solid', lightEmit: 1 });
def(61, 'bookshelf', 'Bookshelf', 'Shelves of well-thumbed tomes.', { faces: COL('bookshelf', 'oak_planks'), hardness: 1.5, tool: 'axe', sound: 'wood' });
def(62, 'birch_planks', 'Birch Planks', 'Pale sawn timber.', { faces: ALL('birch_planks'), ...PLANK });
def(63, 'spruce_planks', 'Spruce Planks', 'Dark sawn timber.', { faces: ALL('spruce_planks'), ...PLANK });
def(64, 'jungle_planks', 'Jungle Planks', 'Rosy sawn timber.', { faces: ALL('jungle_planks'), ...PLANK });
def(65, 'mossy_stone_bricks', 'Mossy Stone Bricks', 'Ancient masonry reclaimed by moss.', { faces: ALL('mossy_stone_bricks'), hardness: 1.5, tool: 'pickaxe', tier: 1 });
def(66, 'red_wool', 'Crimson Wool', 'Fleece dyed with poppy red.', { faces: ALL('red_wool'), hardness: 0.8, sound: 'cloth' });
def(67, 'yellow_wool', 'Saffron Wool', 'Fleece dyed with dandelion yellow.', { faces: ALL('yellow_wool'), hardness: 0.8, sound: 'cloth' });
def(68, 'lily_pad', 'Lily Pad', 'Floats on still water.', { faces: ALL('lily_pad'), ...PLANT, render: 'ladder', tint: 'foliage', needsSupport: null, category: 'plants' });
def(69, 'smooth_stone', 'Smooth Stone', 'Stone fired until its face is even.', { faces: ALL('smooth_stone'), hardness: 2, tool: 'pickaxe', tier: 1, category: 'building' });
def(70, 'cracked_stone_bricks', 'Cracked Stone Bricks', 'Stone bricks crazed by the furnace.', { faces: ALL('cracked_stone_bricks'), hardness: 1.5, tool: 'pickaxe', tier: 1, category: 'building' });
def(71, 'chiseled_stone_bricks', 'Chiseled Stone Bricks', 'A carved keystone.', { faces: ALL('chiseled_stone_bricks'), hardness: 1.5, tool: 'pickaxe', tier: 1, category: 'building' });
def(72, 'cut_sandstone', 'Cut Sandstone', 'Sandstone squared off by the mason.', { faces: COL('cut_sandstone', 'sandstone_top'), hardness: 0.8, tool: 'pickaxe', tier: 1, category: 'building' });
def(73, 'chiseled_sandstone', 'Chiseled Sandstone', 'Old desert glyphs.', { faces: COL('chiseled_sandstone', 'sandstone_top'), hardness: 0.8, tool: 'pickaxe', tier: 1, category: 'building' });
def(74, 'smooth_sandstone', 'Smooth Sandstone', 'Sandstone baked smooth.', { faces: ALL('sandstone_top'), hardness: 2, tool: 'pickaxe', tier: 1, category: 'building' });
def(75, 'coal_block', 'Block of Coal', 'A season of furnace fuel.', { faces: ALL('coal_block'), hardness: 5, tool: 'pickaxe', tier: 1, category: 'building' });
def(76, 'hay_block', 'Hay Bale', 'Nine sheaves of wheat, tightly bound.', { faces: COL('hay_block_side', 'hay_block_top'), hardness: 0.5, tool: 'hoe', sound: 'grass', orientable: false, category: 'nature' });
def(77, 'packed_ice', 'Packed Ice', 'Ice pressed until it no longer melts.', { faces: ALL('packed_ice'), hardness: 0.5, tool: 'pickaxe', sound: 'glass', drops: [], category: 'nature' });
def(78, 'terracotta', 'Terracotta', 'Fired clay with a warm, matte face.', { faces: ALL('terracotta'), hardness: 1.25, tool: 'pickaxe', tier: 1, category: 'building' });
def(79, 'bone_block', 'Bone Block', 'Bone meal pressed into a block.', { faces: COL('bone_block_side', 'bone_block_top'), hardness: 2, tool: 'pickaxe', tier: 1, category: 'building' });
def(80, 'emerald_block', 'Block of Emerald', 'A trader\'s fortune.', { faces: ALL('emerald_block'), hardness: 5, tool: 'pickaxe', tier: 2, sound: 'metal', category: 'building' });

for (const c of OTHER_WOOL) def(woolId(c), `${c}_wool`, `${COLOR_NAMES[c]} Wool`, 'Dyed Woolhorn fleece.', { faces: ALL(`${c}_wool`), hardness: 0.8, sound: 'cloth' });
for (const c of COLORS) {
  const n = COLOR_NAMES[c];
  def(terracottaId(c), `${c}_terracotta`, `${n} Terracotta`, 'Fired clay stained with dye.', { faces: ALL(`${c}_terracotta`), hardness: 1.25, tool: 'pickaxe', tier: 1 });
  def(concreteId(c), `${c}_concrete`, `${n} Concrete`, 'Smooth, bright and hard. Made when powder meets water.', { faces: ALL(`${c}_concrete`), hardness: 1.8, tool: 'pickaxe', tier: 1 });
  def(powderId(c), `${c}_concrete_powder`, `${n} Concrete Powder`, 'Falls like sand. Turns to concrete when it touches water.', { faces: ALL(`${c}_concrete_powder`), hardness: 0.5, tool: 'shovel', sound: 'sand' });
  def(stainedGlassId(c), `${c}_stained_glass`, `${n} Stained Glass`, 'Coloured glass that tints the light behind it.', { faces: ALL(`${c}_stained_glass`), render: 'translucent', opaque: false, lightFilter: 0, hardness: 0.3, drops: null, sound: 'glass' });
}
const FLOWERS: [number, string, string, string][] = [
  [158, 'cornflower', 'Cornflower', 'A deep blue meadow flower.'], [159, 'lily_of_the_valley', 'Lily of the Valley', 'Tiny white bells on a green stem.'],
  [160, 'allium', 'Allium', 'A violet globe of petals.'], [161, 'azure_bluet', 'Azure Bluet', 'Pale and delicate.'], [162, 'blue_orchid', 'Blue Orchid', 'Grows in the shade of swamps.'],
  [163, 'orange_tulip', 'Orange Tulip', 'Bright as a sunset.'], [164, 'pink_tulip', 'Pink Tulip', 'Soft and cheerful.'], [165, 'white_tulip', 'White Tulip', 'Clean petals on a sturdy stem.'],
  [166, 'red_tulip', 'Red Tulip', 'A classic spring bloom.'], [167, 'oxeye_daisy', 'Oxeye Daisy', 'White petals around a golden eye.'],
];
for (const [id, key, name, desc] of FLOWERS) def(id, key, name, desc, { faces: ALL(key), ...PLANT });
def(168, 'tuff', 'Tuff', 'Grey volcanic stone from the deep.', { faces: ALL('tuff'), hardness: 1.5, tool: 'pickaxe', tier: 1, category: 'nature' });
def(169, 'tuff_bricks', 'Tuff Bricks', 'Neat courses of cut tuff.', { faces: COL('tuff_bricks', 'tuff_bricks'), hardness: 1.5, tool: 'pickaxe', tier: 1 });
def(170, 'chiseled_tuff', 'Chiseled Tuff', 'Carved with an old geometric pattern.', { faces: COL('chiseled_tuff', 'chiseled_tuff_top'), hardness: 1.5, tool: 'pickaxe', tier: 1 });
def(171, 'polished_tuff', 'Polished Tuff', 'Tuff ground smooth.', { faces: ALL('polished_tuff'), hardness: 1.5, tool: 'pickaxe', tier: 1 });
def(172, 'copper_block', 'Block of Copper', 'Warm metal that gleams like a new coin.', { faces: ALL('copper_block'), hardness: 3, tool: 'pickaxe', tier: 1, sound: 'metal' });
def(173, 'cut_copper', 'Cut Copper', 'Copper plates set in a grid.', { faces: ALL('cut_copper'), hardness: 3, tool: 'pickaxe', tier: 1, sound: 'metal' });
def(174, 'copper_lamp', 'Copper Lamp', 'A copper cage around a steady glow.', { faces: ALL('copper_lamp'), lightEmit: 15, hardness: 3, tool: 'pickaxe', tier: 1, sound: 'metal', category: 'functional' });
def(175, 'copper_ore', 'Copper Ore', 'Green-flecked stone with copper inside. Smelt for copper.', { faces: ALL('copper_ore'), hardness: 3, tool: 'pickaxe', tier: 2, category: 'ore' });
def(176, 'spawner', 'Monster Cage', 'A cage of black iron that calls creatures out of the dark.', { faces: ALL('spawner'), render: 'glass', opaque: false, lightFilter: 0, hardness: 5, tool: 'pickaxe', tier: 1, drops: [], xp: [15, 43], sound: 'metal', category: 'functional' });
def(177, 'trial_spawner', 'Trial Cage', 'Wakes when players come near, releases a wave, and rewards whoever clears it.', { faces: COL('trial_spawner_side', 'trial_spawner_top', 'trial_spawner_bottom'), render: 'glass', opaque: false, lightFilter: 0, lightEmit: 4, hardness: 50, tool: 'pickaxe', tier: 1, drops: [], sound: 'metal', category: 'functional' });
def(178, 'vault', 'Vault', 'Opens once for each player who brings a Trial Key.', { faces: COL('vault_side', 'vault_top', 'vault_bottom'), front: 'vault_front', orientable: true, interactive: true, render: 'glass', opaque: false, lightFilter: 0, lightEmit: 6, hardness: 50, tool: 'pickaxe', tier: 1, drops: [], sound: 'metal', category: 'functional' });

def(179, 'kelp', 'Kelp', 'Grows up from the sea floor towards the light.', { faces: ALL('kelp'), ...PLANT, needsSupport: 'water-plant', sound: 'grass', drops: [{ item: 'self' }] });
def(180, 'kelp_plant', 'Kelp Stem', 'The long body of a kelp plant.', { faces: ALL('kelp_plant'), ...PLANT, needsSupport: 'water-plant', drops: [{ item: 179 }], category: 'hidden' });
def(181, 'seagrass', 'Seagrass', 'Sways in shallow seas.', { faces: ALL('seagrass'), ...PLANT, needsSupport: 'water-plant', replaceable: true, drops: [] });
def(182, 'vine', 'Vines', 'Hangs from jungle trees. Climbable.', { faces: ALL('vine'), render: 'ladder', solid: false, opaque: false, lightFilter: 0, hardness: 0.2, tool: 'hoe', sound: 'grass', climbable: true, tint: 'foliage', needsSupport: 'solid', orientable: true, replaceable: true, drops: [], category: 'plants' });

const RS: Partial<BlockDef> = { render: 'redstone', solid: false, opaque: false, lightFilter: 0, hardness: 0, sound: 'stone', needsSupport: 'solid', category: 'functional' };
def(183, 'redstone_wire', 'Emberdust', 'Carries an ember signal up to 15 blocks, fading as it goes.', { faces: { px: 'redstone_dust_line0', nx: 'redstone_dust_line0', py: 'redstone_dust_dot', ny: 'redstone_dust_dot', pz: 'redstone_dust_line1', nz: 'redstone_dust_line1' }, ...RS, tint: null, drops: [{ item: 371 }], category: 'hidden' });
def(184, 'redstone_torch', 'Ember Torch', 'Always on, unless the block it hangs on is powered. Inverts signals.', { faces: ALL('redstone_torch'), render: 'torch', solid: false, opaque: false, lightFilter: 0, lightEmit: 7, hardness: 0, sound: 'wood', needsSupport: 'solid', category: 'functional' });
def(185, 'lever', 'Lever', 'Flick it on, flick it off. Powers the block it is fixed to.', { faces: { ...ALL('lever'), ny: 'cobblestone' }, ...RS, sound: 'wood', interactive: true });
def(186, 'stone_button', 'Stone Button', 'A short pulse of power, one second long.', { faces: ALL('stone'), ...RS, interactive: true });
def(187, 'oak_button', 'Oak Button', 'A pulse of power, one and a half seconds long.', { faces: ALL('oak_planks'), ...RS, sound: 'wood', interactive: true });
def(188, 'stone_pressure_plate', 'Stone Pressure Plate', 'Powers while a player or creature stands on it.', { faces: ALL('stone'), ...RS, hardness: 0.5, tool: 'pickaxe' });
def(189, 'oak_pressure_plate', 'Oak Pressure Plate', 'Powers while anything at all rests on it, even dropped items.', { faces: ALL('oak_planks'), ...RS, hardness: 0.5, sound: 'wood', tool: 'axe' });
def(190, 'redstone_block', 'Ember Block', 'A solid block that always gives full power.', { faces: ALL('redstone_block'), hardness: 5, tool: 'pickaxe', sound: 'metal', category: 'functional' });
def(191, 'redstone_lamp', 'Ember Lamp', 'Lights up when powered.', { faces: ALL('redstone_lamp'), hardness: 0.3, sound: 'glass', category: 'functional' });
def(192, 'redstone_lamp_lit', 'Lit Ember Lamp', '', { faces: ALL('redstone_lamp_on'), hardness: 0.3, sound: 'glass', lightEmit: 15, drops: [{ item: 191 }], category: 'hidden' });
def(193, 'unlit_redstone_torch', 'Ember Torch', '', { faces: ALL('redstone_torch_off'), render: 'torch', solid: false, opaque: false, lightFilter: 0, hardness: 0, sound: 'wood', needsSupport: 'solid', drops: [{ item: 184 }], category: 'hidden' });
def(194, 'redstone_ore', 'Ember Ore', 'Deep red veins that crumble into Emberdust.', { faces: ALL('redstone_ore'), hardness: 3, tool: 'pickaxe', tier: 2, drops: [{ item: 371, min: 4, max: 5 }], xp: [1, 5], category: 'ore' });
def(195, 'repeater', 'Ember Relay', 'Restores a signal to full strength after a delay of 1 to 4 ticks. Tap to change the delay.', { faces: { ...ALL('smooth_stone'), py: 'repeater' }, front: 'repeater_on', ...RS, interactive: true, drops: [{ item: 'self' }] });
def(196, 'comparator', 'Ember Gauge', 'Compares or subtracts signals, and reads how full a container is. Tap to switch modes.', { faces: { ...ALL('smooth_stone'), py: 'comparator' }, front: 'comparator_on', ...RS, interactive: true, drops: [{ item: 'self' }] });

const RS6: Partial<BlockDef> = { render: 'rs6', solid: true, opaque: false, lightFilter: 15, hardness: 3, tool: 'pickaxe', sound: 'stone', category: 'functional', needsSupport: null, cullSelf: false };
def(197, 'observer', 'Watcher', 'Its face watches one block. When that block changes, it sends a short pulse out of its back.', { faces: { ...ALL('observer_side'), py: 'observer_top', ny: 'observer_top' }, front: 'observer_front', ...RS6, opaque: true, drops: [{ item: 'self' }] });
def(198, 'piston', 'Piston', 'Pushes up to 12 blocks when powered.', { faces: { ...ALL('piston_side'), ny: 'piston_bottom' }, front: 'piston_top', ...RS6, hardness: 1.5, drops: [{ item: 'self' }] });
def(199, 'sticky_piston', 'Sticky Piston', 'Pushes like a piston, and pulls the block back when unpowered.', { faces: { ...ALL('piston_side'), ny: 'piston_bottom' }, front: 'piston_top_sticky', ...RS6, hardness: 1.5, drops: [{ item: 'self' }] });
def(200, 'piston_head', 'Piston Head', '', { faces: ALL('piston_side'), front: 'piston_top', ...RS6, lightFilter: 0, hardness: 1.5, drops: [], category: 'hidden' });
def(201, 'moving_piston', 'Moving Block', '', { faces: ALL('stone'), render: 'none', solid: false, opaque: false, lightFilter: 0, hardness: -1, drops: null, category: 'hidden' });
def(202, 'hopper', 'Hopper', 'Catches items from above and passes them on, one at a time.', { faces: { ...ALL('hopper_outside'), py: 'hopper_top' }, ...RS6, lightFilter: 0, interactive: true, drops: [{ item: 'self' }] });
def(203, 'dropper', 'Dropper', 'Drops one item when powered, or feeds it into a container in front.', { faces: { ...ALL('furnace_side'), py: 'furnace_top', ny: 'furnace_top' }, front: 'dropper_front', ...RS6, opaque: true, hardness: 3.5, tier: 1, interactive: true, drops: [{ item: 'self' }] });
def(204, 'dispenser', 'Dispenser', 'Uses or fires one item when powered: buckets, bone meal, arrows and more.', { faces: { ...ALL('furnace_side'), py: 'furnace_top', ny: 'furnace_top' }, front: 'dispenser_front', ...RS6, opaque: true, hardness: 3.5, tier: 1, interactive: true, drops: [{ item: 'self' }] });

export function isWaterPlant(id: number): boolean { return id === 179 || id === 180 || id === 181; }
export function isWaterLike(v: number): boolean { const id = v & 0xff; return id === 12 || id === 179 || id === 180 || id === 181; }

export const BLOCKS: BlockDef[] = defs;

export const BLOCK_BY_KEY = new Map<string, BlockDef>(defs.map((d) => [d.key, d]));

export function blockId(v: number): number { return v & 0xff; }
export function blockMeta(v: number): number { return v >>> 8; }
export function makeBlock(id: number, meta = 0): number { return (id & 0xff) | ((meta & 0xff) << 8); }

const solidTable = new Uint8Array(256);
const opaqueTable = new Uint8Array(256);
const filterTable = new Uint8Array(256);
const emitTable = new Uint8Array(256);
for (const d of defs) {
  solidTable[d.id] = d.solid ? 1 : 0;
  opaqueTable[d.id] = d.opaque ? 1 : 0;
  filterTable[d.id] = d.lightFilter;
  emitTable[d.id] = d.lightEmit;
}
export const SOLID = solidTable;
export const OPAQUE = opaqueTable;
export const LIGHT_FILTER = filterTable;
export const LIGHT_EMIT = emitTable;

export function getBlock(id: number): BlockDef {
  return defs[id & 0xff] ?? defs[0];
}

export function isSolid(v: number): boolean {
  return solidTable[v & 0xff] === 1;
}

export function isFluid(v: number): boolean {
  const id = v & 0xff;
  return id === B.WATER || id === B.LAVA;
}

export function isReplaceable(v: number): boolean {
  return defs[v & 0xff]?.replaceable ?? true;
}

export const DOOR_UPPER = 1, DOOR_OPEN = 2;
export function doorMeta(facing: number, upper: boolean, open: boolean): number {
  return ((facing & 3) << 2) | (upper ? DOOR_UPPER : 0) | (open ? DOOR_OPEN : 0);
}
export function doorFacing(meta: number): number { return (meta >> 2) & 3; }

export const FACING_DIRS: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]];

export function facingFromYaw(yaw: number): number {
  const a = ((yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const q = Math.round(a / (Math.PI / 2)) & 3;
  return [0, 3, 2, 1][q];
}

export function edgeBox(f: number, t: number): [number, number, number, number, number, number] {
  switch (f & 3) {
    case 0: return [0, 0, 0, 1, 1, t];
    case 1: return [1 - t, 0, 0, 1, 1, 1];
    case 2: return [0, 0, 1 - t, 1, 1, 1];
    default: return [0, 0, 0, t, 1, 1];
  }
}

export function torchBox(meta: number): [number, number, number, number, number, number] {
  if (meta === 0) return [6 / 16, 0, 6 / 16, 10 / 16, 10 / 16, 10 / 16];
  const [dx, dz] = FACING_DIRS[(meta - 1) & 3];
  const cx = 0.5 + dx * 0.3, cz = 0.5 + dz * 0.3;
  return [cx - 2.5 / 16, 3 / 16, cz - 2.5 / 16, cx + 2.5 / 16, 13 / 16, cz + 2.5 / 16];
}

export function blockBox(v: number): [number, number, number, number, number, number] | null {
  const id = v & 0xff;
  const d = defs[id];
  if (!d) return null;
  if (id === B.OAK_DOOR) {
    const m = v >>> 8;
    let f = doorFacing(m);
    if (m & DOOR_OPEN) f = (f + 1) & 3;
    return edgeBox(f, 3 / 16);
  }
  if (id === B.CACTUS) return [1 / 16, 0, 1 / 16, 15 / 16, 1, 15 / 16];
  if (id === B.CHEST) return [1 / 16, 0, 1 / 16, 15 / 16, 14 / 16, 15 / 16];
  if (!d.solid) return null;
  return [0, 0, 0, 1, 1, 1];
}

export function placeOnFace(face: number, b: number[]): [number, number, number, number, number, number] {
  const [x0, y0, z0, x1, y1, z1] = b;
  switch (face) {
    case 5: return [x0, 1 - y1, z0, x1, 1 - y0, z1];
    case 1: return [x0, z0, y0, x1, z1, y1];
    case 3: return [x0, z0, 1 - y1, x1, z1, 1 - y0];
    case 4: return [y0, z0, x0, y1, z1, x1];
    case 2: return [1 - y1, z0, x0, 1 - y0, z1, x1];
    default: return [x0, y0, z0, x1, y1, z1];
  }
}

function rsBox(id: number, meta: number): [number, number, number, number, number, number] {
  if (id === 183) return [0, 0, 0, 1, 1 / 16, 1];
  if (id === 188 || id === 189) return [1 / 16, 0, 1 / 16, 15 / 16, 1 / 16, 15 / 16];
  if (id === 195 || id === 196) return [0, 0, 0, 1, 2 / 16, 1];
  if (id === 185) return placeOnFace(meta & 7, [4 / 16, 0, 4 / 16, 12 / 16, 10 / 16, 12 / 16]);
  return placeOnFace(meta & 7, [5 / 16, 0, 6 / 16, 11 / 16, 2 / 16, 10 / 16]);
}

export function selectionBox(v: number): [number, number, number, number, number, number] | null {
  const id = v & 0xff;
  const d = defs[id];
  if (!d || id === 0 || d.fluid) return null;
  const solid = blockBox(v);
  if (solid) return solid;
  switch (d.render) {
    case 'torch': return torchBox(v >>> 8);
    case 'ladder': {
      if (id === B.LILY_PAD) return [0, 0, 0, 1, 1 / 16, 1];
      return edgeBox((v >>> 8) & 3, 2 / 16);
    }
    case 'cross': case 'crop': return [2 / 16, 0, 2 / 16, 14 / 16, 13 / 16, 14 / 16];
    case 'redstone': return rsBox(id, v >>> 8);
    default: return [0, 0, 0, 1, 1, 1];
  }
}

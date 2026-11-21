export type RenderType =
  | 'none' | 'cube' | 'leaves' | 'glass' | 'translucent' | 'liquid'
  | 'cross' | 'crop' | 'torch' | 'door' | 'ladder' | 'cactus' | 'chest' | 'redstone' | 'rs6' | 'shape' | 'rail' | 'boxes' | 'portal' | 'fire' | 'bars' | 'fence' | 'trapdoor' | 'cave' | 'wall' | 'gate';

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
  ext?: number;
  species?: { base: number; s: number };
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
  needsSupport: 'soil' | 'nylium' | 'hang' | 'soulsand' | 'sand' | 'solid' | 'farmland' | 'water-edge' | 'cactus' | 'water-plant' | null;
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
  OBSERVER: 197, PISTON: 198, STICKY_PISTON: 199, PISTON_HEAD: 200, MOVING_PISTON: 201, HOPPER: 202, DROPPER: 203, DISPENSER: 204, SLIME_BLOCK: 205, HONEY_BLOCK: 206, TNT: 207, SLAB: 208, STAIRS: 209, RAIL: 210, POWERED_RAIL: 211, DETECTOR_RAIL: 212, ACTIVATOR_RAIL: 213, ENCHANTING_TABLE: 214, LAPIS_ORE: 215, LAPIS_BLOCK: 216, ANVIL: 217, EXT: 218, NETHER_PORTAL: 219, FIRE: 220, CRYING_OBSIDIAN: 221, MAGMA_BLOCK: 222, IRON_BARS: 223, SHROOMLIGHT: 224, CRIMSON_ROOTS: 225, WARPED_ROOTS: 226, NETHER_SPROUTS: 227, CRIMSON_FUNGUS: 228, WARPED_FUNGUS: 229, WEEPING_VINES: 230, TWISTING_VINES: 231, SOUL_FIRE: 232, NETHER_BRICK_FENCE: 233, NETHER_WART: 234, SMITHING_TABLE: 235,
  COMPOSTER: 236, LECTERN: 237, BLAST_FURNACE: 238, SMOKER: 239, FLETCHING_TABLE: 240, BREWING_STAND: 241, STONECUTTER: 242, BARREL: 243, CARTOGRAPHY_TABLE: 244, CAULDRON: 245, LOOM: 246, GRINDSTONE: 247,
  BELL: 248, LANTERN: 249, PUMPKIN: 250, MELON: 251, CAKE: 252, CARROTS: 253, POTATOES: 254, BEETROOTS: 255,
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

export const XB = 600;
export const XV = {
  NETHERRACK: 0, NETHER_QUARTZ_ORE: 1, NETHER_GOLD_ORE: 2, BLACKSTONE: 3, SOUL_SAND: 4, SOUL_SOIL: 5, NETHER_BRICKS: 6, BASALT: 7,
  POLISHED_BLACKSTONE: 8, POLISHED_BLACKSTONE_BRICKS: 9, QUARTZ_BLOCK: 10, CRIMSON_NYLIUM: 11, WARPED_NYLIUM: 12, CRIMSON_STEM: 13, WARPED_STEM: 14,
  NETHER_WART_BLOCK: 15, WARPED_WART_BLOCK: 16, BONE_BLOCK: 17, CRIMSON_PLANKS: 18, WARPED_PLANKS: 19, SMOOTH_BASALT: 20,
  ANCIENT_DEBRIS: 21, CINDERITE_BLOCK: 22, GILDED_BLACKSTONE: 23, CRACKED_POLISHED_BLACKSTONE_BRICKS: 24, CHISELED_POLISHED_BLACKSTONE: 25,
  GRANITE: 26, POLISHED_GRANITE: 27, DIORITE: 28, POLISHED_DIORITE: 29, ANDESITE: 30, POLISHED_ANDESITE: 31, DRIPSTONE_BLOCK: 32, QUARTZ_PILLAR: 33, DRIED_KELP_BLOCK: 34, GLAZED_TERRACOTTA: 35,
  TUBE_CORAL_BLOCK: 51, BRAIN_CORAL_BLOCK: 52, BUBBLE_CORAL_BLOCK: 53, FIRE_CORAL_BLOCK: 54, HORN_CORAL_BLOCK: 55,
  RED_MUSHROOM_BLOCK: 56, BROWN_MUSHROOM_BLOCK: 57, MUSHROOM_STEM: 58, MYCELIUM: 59,
} as const;
export function X(variant: number): number { return 218 | (variant << 8); }
export const SPB = 880;
export const ID_LIMIT = 4096, WIDE_BASE = 1024;
export function isBaseId(id: number): boolean { return id >= 0 && (id < 256 || (id >= WIDE_BASE && id < ID_LIMIT)); }
export function bid(v: number): number { return (v & 0xff) | ((v >>> 8) & 0xf00); }
const SPMAP = new Int16Array(ID_LIMIT * 16);
export function tix(v: number): number {
  const id = (v & 0xff) | ((v >>> 8) & 0xf00);
  if (id === 218) return XB + ((v >>> 8) & 0xff);
  const s = (v >>> 12) & 15;
  return s ? SPMAP[id * 16 + s] || id : id;
}
export const SPECIES = { ACACIA: 1, DARK_OAK: 2, CHERRY: 3, MANGROVE: 4 } as const;
export function sp(base: number, s: number, extra = 0): number { return (base & 0xff) | (((s << 4) | (extra & 15)) << 8) | ((base & 0xf00) << 8); }
export function speciesOf(v: number): number { return (v >>> 12) & 15; }
function species(id: number, base: number, s: number, key: string, name: string, desc: string, p: Partial2): void {
  const { id: _i, key: _k, name: _n, desc: _d, ...rest } = defs[base];
  def(id, key, name, desc, { ...rest, drops: [{ item: id }], ...p });
  defs[id].species = { base, s };
  SPMAP[base * 16 + s] = id;
}

function ext(variant: number, key: string, name: string, desc: string, p: Partial2): void {
  def(XB + variant, key, name, desc, { drops: [{ item: XB + variant }], ...p });
  defs[XB + variant].ext = variant;
}

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
def(25, 'aetherite_ore', 'Diamond Ore', 'Deep crystal that hums faintly. Needs iron to mine.', { faces: ALL('aetherite_ore'), hardness: 3, tool: 'pickaxe', tier: 3, drops: [{ item: 264 }], xp: [3, 7], category: 'ore' });
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
def(38, 'torch', 'Torch', 'Pushes back the dark. Keeps the Zombie at bay.', { faces: ALL('torch'), render: 'torch', solid: false, opaque: false, lightFilter: 0, lightEmit: 14, hardness: 0, sound: 'wood', needsSupport: 'solid', category: 'functional' });
def(39, 'glass', 'Glass', 'Clear panes of fused sand.', { faces: ALL('glass'), render: 'glass', opaque: false, lightFilter: 0, hardness: 0.3, drops: null, sound: 'glass' });
def(40, 'bricks', 'Bricks', 'Fired clay, neatly mortared.', { faces: ALL('bricks'), hardness: 2, tool: 'pickaxe', tier: 1 });
def(41, 'stone_bricks', 'Stone Bricks', 'Dressed stone for fine masonry.', { faces: ALL('stone_bricks'), hardness: 1.5, tool: 'pickaxe', tier: 1 });
def(42, 'oak_door', 'Oak Door', 'Swings open with a tap.', { faces: ALL('oak_door_bottom'), render: 'door', opaque: false, lightFilter: 0, hardness: 3, tool: 'axe', sound: 'wood', drops: [{ item: 280 }], interactive: true, category: 'hidden' });
def(43, 'ladder', 'Ladder', 'Climb walls and mineshafts.', { faces: ALL('ladder'), render: 'ladder', solid: false, opaque: false, lightFilter: 0, hardness: 0.4, tool: 'axe', sound: 'wood', climbable: true, needsSupport: 'solid', orientable: true, category: 'functional' });
def(44, 'white_wool', 'White Wool', 'Soft fleece from a Sheep.', { faces: ALL('white_wool'), hardness: 0.8, sound: 'cloth' });
def(45, 'iron_block', 'Block of Iron', 'Nine ingots, compactly stored.', { faces: ALL('iron_block'), hardness: 5, tool: 'pickaxe', tier: 2, sound: 'metal' });
def(46, 'gold_block', 'Block of Gold', 'A gleaming hoard.', { faces: ALL('gold_block'), hardness: 3, tool: 'pickaxe', tier: 3, sound: 'metal' });
def(47, 'aetherite_block', 'Block of Diamond', 'Crystalline and luminous to the eye.', { faces: ALL('aetherite_block'), hardness: 5, tool: 'pickaxe', tier: 3, sound: 'metal' });
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

for (const c of OTHER_WOOL) def(woolId(c), `${c}_wool`, `${COLOR_NAMES[c]} Wool`, 'Dyed Sheep fleece.', { faces: ALL(`${c}_wool`), hardness: 0.8, sound: 'cloth' });
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
def(195, 'repeater', 'Repeater', 'Restores a signal to full strength after a delay of 1 to 4 ticks. Tap to change the delay.', { faces: { ...ALL('smooth_stone'), py: 'repeater' }, front: 'repeater_on', ...RS, interactive: true, drops: [{ item: 'self' }] });
def(196, 'comparator', 'Comparator', 'Compares or subtracts signals, and reads how full a container is. Tap to switch modes.', { faces: { ...ALL('smooth_stone'), py: 'comparator' }, front: 'comparator_on', ...RS, interactive: true, drops: [{ item: 'self' }] });

const RS6: Partial<BlockDef> = { render: 'rs6', solid: true, opaque: false, lightFilter: 15, hardness: 3, tool: 'pickaxe', sound: 'stone', category: 'functional', needsSupport: null, cullSelf: false };
def(197, 'observer', 'Observer', 'Its face watches one block. When that block changes, it sends a short pulse out of its back.', { faces: { ...ALL('observer_side'), py: 'observer_top', ny: 'observer_top' }, front: 'observer_front', ...RS6, opaque: true, drops: [{ item: 'self' }] });
def(198, 'piston', 'Piston', 'Pushes up to 12 blocks when powered.', { faces: { ...ALL('piston_side'), ny: 'piston_bottom' }, front: 'piston_top', ...RS6, hardness: 1.5, drops: [{ item: 'self' }] });
def(199, 'sticky_piston', 'Sticky Piston', 'Pushes like a piston, and pulls the block back when unpowered.', { faces: { ...ALL('piston_side'), ny: 'piston_bottom' }, front: 'piston_top_sticky', ...RS6, hardness: 1.5, drops: [{ item: 'self' }] });
def(200, 'piston_head', 'Piston Head', '', { faces: ALL('piston_side'), front: 'piston_top', ...RS6, lightFilter: 0, hardness: 1.5, drops: [], category: 'hidden' });
def(201, 'moving_piston', 'Moving Block', '', { faces: ALL('stone'), render: 'none', solid: false, opaque: false, lightFilter: 0, hardness: -1, drops: null, category: 'hidden' });
def(202, 'hopper', 'Hopper', 'Catches items from above and passes them on, one at a time.', { faces: { ...ALL('hopper_outside'), py: 'hopper_top' }, ...RS6, lightFilter: 0, interactive: true, drops: [{ item: 'self' }] });
def(203, 'dropper', 'Dropper', 'Drops one item when powered, or feeds it into a container in front.', { faces: { ...ALL('furnace_side'), py: 'furnace_top', ny: 'furnace_top' }, front: 'dropper_front', ...RS6, opaque: true, hardness: 3.5, tier: 1, interactive: true, drops: [{ item: 'self' }] });
def(205, 'slime_block', 'Slime Block', 'Wobbly kelp jelly. Pistons drag every block stuck to it, and you bounce when you land on it.', { faces: ALL('slime_block'), render: 'translucent', opaque: false, lightFilter: 1, hardness: 0, sound: 'cloth', category: 'functional', drops: [{ item: 'self' }] });
def(206, 'honey_block', 'Honey Block', 'Thick and sticky. Pistons drag blocks stuck to it, but it will not stick to Slime.', { faces: { ...ALL('honey_block_side'), py: 'honey_block_top', ny: 'honey_block_bottom' }, render: 'translucent', opaque: false, lightFilter: 1, hardness: 0, sound: 'cloth', category: 'functional', drops: [{ item: 'self' }] });
def(207, 'tnt', 'TNT', 'Blasts a crater four blocks wide. Light it with a Flint and Steel, Ember power or another blast.', { faces: { ...ALL('tnt_side'), py: 'tnt_top', ny: 'tnt_bottom' }, hardness: 0, sound: 'grass', category: 'functional', drops: [{ item: 'self' }] });
def(208, 'slab', 'Slab', 'Half a block. Two of the same make a full block.', { faces: ALL('stone'), render: 'shape', opaque: false, lightFilter: 0, hardness: 1.5, sound: 'stone', category: 'hidden', drops: [{ item: 'self' }] });
def(209, 'stairs', 'Stairs', 'Walk straight up them, no jumping needed.', { faces: ALL('stone'), render: 'shape', opaque: false, lightFilter: 0, hardness: 1.5, sound: 'stone', category: 'hidden', drops: [{ item: 'self' }] });
const RAILDEF: Partial<BlockDef> = { render: 'rail', solid: false, opaque: false, lightFilter: 0, hardness: 0.7, sound: 'stone', needsSupport: 'solid', category: 'functional' };
def(210, 'rail', 'Rail', 'Track for minecarts. Curves to meet neighbouring rails.', { faces: { ...ALL('rail'), ny: 'rail_corner' }, ...RAILDEF });
def(211, 'powered_rail', 'Powered Rail', 'Speeds carts along when powered and brakes them when not.', { faces: { ...ALL('powered_rail'), ny: 'powered_rail_on' }, ...RAILDEF });
def(212, 'detector_rail', 'Detector Rail', 'Gives off an ember signal while a cart rolls over it.', { faces: { ...ALL('detector_rail'), ny: 'detector_rail_on' }, ...RAILDEF });
def(213, 'activator_rail', 'Activator Rail', 'When powered, lights Minecarts with TNT and tips out riders.', { faces: { ...ALL('activator_rail'), ny: 'activator_rail_on' }, ...RAILDEF });
def(204, 'dispenser', 'Dispenser', 'Uses or fires one item when powered: buckets, bone meal, arrows and more.', { faces: { ...ALL('furnace_side'), py: 'furnace_top', ny: 'furnace_top' }, front: 'dispenser_front', ...RS6, opaque: true, hardness: 3.5, tier: 1, interactive: true, drops: [{ item: 'self' }] });
def(218, 'ext_block', 'Block', '', { faces: ALL('netherrack'), hardness: 0.4, tool: 'pickaxe', tier: 1, category: 'hidden' });
def(219, 'nether_portal', 'Nether Portal', 'Stand inside to cross between worlds.', { faces: ALL('nether_portal'), render: 'portal', solid: false, opaque: false, lightFilter: 0, lightEmit: 11, hardness: -1, drops: [], sound: 'glass', category: 'hidden' });
def(220, 'fire', 'Fire', 'Burns what stands in it. Lasts forever on netherrack.', { faces: ALL('fire_0'), render: 'fire', solid: false, opaque: false, lightFilter: 0, lightEmit: 15, hardness: 0, drops: [], replaceable: true, sound: 'grass', category: 'hidden' });
def(221, 'crying_obsidian', 'Crying Obsidian', 'Obsidian that weeps purple light. It cannot frame a portal.', { faces: ALL('crying_obsidian'), hardness: 50, tool: 'pickaxe', tier: 4, lightEmit: 10 });
def(222, 'magma_block', 'Magma Block', 'Hot to stand on. Crouch to cross it safely.', { faces: ALL('magma'), hardness: 0.5, tool: 'pickaxe', tier: 1, lightEmit: 3 });
def(223, 'iron_bars', 'Iron Bars', 'A thin grille that links to its neighbours.', { faces: ALL('iron_bars'), render: 'bars', opaque: false, lightFilter: 0, hardness: 5, tool: 'pickaxe', tier: 1, sound: 'metal', cullSelf: false });
def(224, 'shroomlight', 'Shroomlight', 'A glowing lump that grows in the caps of huge Nether fungi.', { faces: ALL('shroomlight'), hardness: 1, tool: 'hoe', sound: 'cloth', lightEmit: 15, category: 'nature' });
const NPLANT: Partial<BlockDef> = { ...PLANT, needsSupport: 'nylium', replaceable: true, drops: [{ item: 'self' }] };
def(225, 'crimson_roots', 'Crimson Roots', 'Red roots that sprout from crimson nylium.', { faces: ALL('crimson_roots'), ...NPLANT });
def(226, 'warped_roots', 'Warped Roots', 'Teal roots that sprout from warped nylium.', { faces: ALL('warped_roots'), ...NPLANT });
def(227, 'nether_sprouts', 'Nether Sprouts', 'Tiny teal shoots. Only shears keep them.', { faces: ALL('nether_sprouts'), ...NPLANT, drops: [] });
def(228, 'crimson_fungus', 'Crimson Fungus', 'A small red mushroom of the Nether.', { faces: ALL('crimson_fungus'), ...NPLANT, replaceable: false });
def(229, 'warped_fungus', 'Warped Fungus', 'A small teal mushroom of the Nether.', { faces: ALL('warped_fungus'), ...NPLANT, replaceable: false });
def(230, 'weeping_vines', 'Weeping Vines', 'Red vines that hang from crimson ceilings. Climbable.', { faces: ALL('weeping_vines'), ...PLANT, needsSupport: 'hang', climbable: true, drops: [{ item: 'self', chance: 0.33 }] });
def(231, 'twisting_vines', 'Twisting Vines', 'Teal vines that climb up from warped ground. Climbable.', { faces: ALL('twisting_vines'), ...PLANT, needsSupport: 'solid', climbable: true, drops: [{ item: 'self', chance: 0.33 }] });
def(232, 'soul_fire', 'Soul Fire', 'Blue flame that burns on soul sand and soul soil.', { faces: ALL('soul_fire_0'), render: 'fire', solid: false, opaque: false, lightFilter: 0, lightEmit: 10, hardness: 0, drops: [], replaceable: true, sound: 'grass', category: 'hidden' });
def(233, 'nether_brick_fence', 'Nether Brick Fence', 'A dark brick fence that links to its neighbours.', { faces: ALL('nether_bricks'), render: 'fence', opaque: false, lightFilter: 0, hardness: 2, tool: 'pickaxe', tier: 1, cullSelf: false });
def(234, 'nether_wart', 'Nether Wart', 'A red fungus that grows only on soul sand.', { faces: ALL('nether_wart_stage2'), ...PLANT, render: 'crop', needsSupport: 'soulsand', drops: [{ item: 398 }], category: 'hidden' });
ext(0, 'netherrack', 'Netherrack', 'Soft red rock of the Nether. Fire on it never goes out.', { faces: ALL('netherrack'), hardness: 0.4, tool: 'pickaxe', tier: 1, category: 'nature' });
ext(1, 'nether_quartz_ore', 'Nether Quartz Ore', 'Pale crystal set in netherrack.', { faces: ALL('nether_quartz_ore'), hardness: 3, tool: 'pickaxe', tier: 1, drops: [{ item: 391 }], xp: [2, 5], category: 'ore' });
ext(2, 'nether_gold_ore', 'Nether Gold Ore', 'Flecks of gold in netherrack. Breaks into nuggets.', { faces: ALL('nether_gold_ore'), hardness: 3, tool: 'pickaxe', tier: 1, drops: [{ item: 390, min: 2, max: 6 }], xp: [0, 1], category: 'ore' });
ext(3, 'blackstone', 'Blackstone', 'Dark stone from the Nether. Works like cobblestone.', { faces: { ...ALL('blackstone'), py: 'blackstone_top', ny: 'blackstone_top' }, hardness: 1.5, tool: 'pickaxe', tier: 1, category: 'nature' });
ext(4, 'soul_sand', 'Soul Sand', 'Grey sand full of faces. Slows anything walking on it.', { faces: ALL('soul_sand'), hardness: 0.5, tool: 'shovel', sound: 'sand', category: 'nature' });
ext(5, 'soul_soil', 'Soul Soil', 'Smooth grey soil found beside Soul Sand.', { faces: ALL('soul_soil'), hardness: 0.5, tool: 'shovel', sound: 'sand', category: 'nature' });
ext(6, 'nether_bricks', 'Nether Bricks', 'Dark red bricks baked from netherrack.', { faces: ALL('nether_bricks'), hardness: 2, tool: 'pickaxe', tier: 1 });
ext(7, 'basalt', 'Basalt', 'Grey volcanic rock.', { faces: { ...ALL('basalt_side'), py: 'basalt_top', ny: 'basalt_top' }, hardness: 1.25, tool: 'pickaxe', tier: 1, category: 'nature' });
ext(8, 'polished_blackstone', 'Polished Blackstone', 'Blackstone smoothed flat.', { faces: ALL('polished_blackstone'), hardness: 2, tool: 'pickaxe', tier: 1 });
ext(9, 'polished_blackstone_bricks', 'Polished Blackstone Bricks', 'Neat dark bricks.', { faces: ALL('polished_blackstone_bricks'), hardness: 1.5, tool: 'pickaxe', tier: 1 });
ext(10, 'quartz_block', 'Block of Quartz', 'Clean white stone made from Nether Quartz.', { faces: { ...ALL('quartz_block_side'), py: 'quartz_block_top', ny: 'quartz_block_bottom' }, hardness: 0.8, tool: 'pickaxe', tier: 1 });
ext(11, 'crimson_nylium', 'Crimson Nylium', 'Netherrack covered in red fungal growth.', { faces: { ...ALL('crimson_nylium_side'), py: 'crimson_nylium', ny: 'netherrack' }, hardness: 0.4, tool: 'pickaxe', tier: 1, drops: [{ item: XB + 0 }], category: 'nature' });
ext(12, 'warped_nylium', 'Warped Nylium', 'Netherrack covered in teal fungal growth.', { faces: { ...ALL('warped_nylium_side'), py: 'warped_nylium', ny: 'netherrack' }, hardness: 0.4, tool: 'pickaxe', tier: 1, drops: [{ item: XB + 0 }], category: 'nature' });
ext(13, 'crimson_stem', 'Crimson Stem', 'The trunk of a huge crimson fungus. Does not burn.', { faces: { ...ALL('crimson_stem'), py: 'crimson_stem_top', ny: 'crimson_stem_top' }, hardness: 2, tool: 'axe', sound: 'wood', category: 'nature' });
ext(14, 'warped_stem', 'Warped Stem', 'The trunk of a huge warped fungus. Does not burn.', { faces: { ...ALL('warped_stem'), py: 'warped_stem_top', ny: 'warped_stem_top' }, hardness: 2, tool: 'axe', sound: 'wood', category: 'nature' });
ext(15, 'nether_wart_block', 'Nether Wart Block', 'The fleshy cap of a crimson fungus.', { faces: ALL('nether_wart_block'), hardness: 1, tool: 'hoe', sound: 'cloth', category: 'nature' });
ext(16, 'warped_wart_block', 'Warped Wart Block', 'The fleshy cap of a warped fungus.', { faces: ALL('warped_wart_block'), hardness: 1, tool: 'hoe', sound: 'cloth', category: 'nature' });
ext(17, 'bone_block', 'Bone Block', 'Packed bone. Old fossils are made of it.', { faces: { ...ALL('bone_block_side'), py: 'bone_block_top', ny: 'bone_block_top' }, hardness: 2, tool: 'pickaxe', tier: 1, category: 'nature' });
ext(18, 'crimson_planks', 'Crimson Planks', 'Planks cut from crimson stems. Fireproof.', { faces: ALL('crimson_planks'), hardness: 2, tool: 'axe', sound: 'wood' });
ext(19, 'warped_planks', 'Warped Planks', 'Planks cut from warped stems. Fireproof.', { faces: ALL('warped_planks'), hardness: 2, tool: 'axe', sound: 'wood' });
ext(21, 'ancient_debris', 'Ancient Debris', 'A scorched lump buried deep in the Nether. Shrugs off explosions. Smelt it for Netherite Scrap.', { faces: { ...ALL('ancient_debris_side'), py: 'ancient_debris_top', ny: 'ancient_debris_top' }, hardness: 30, tool: 'pickaxe', tier: 4, category: 'ore' });
ext(22, 'cinderite_block', 'Block of Netherite', 'Nine Netherite Ingots pressed into one dark, heavy block.', { faces: ALL('cinderite_block'), hardness: 50, tool: 'pickaxe', tier: 4 });
ext(23, 'gilded_blackstone', 'Gilded Blackstone', 'Blackstone streaked with gold. Sometimes crumbles into nuggets.', { faces: ALL('gilded_blackstone'), hardness: 1.5, tool: 'pickaxe', tier: 1, drops: [{ item: 'self' }] });
ext(24, 'cracked_polished_blackstone_bricks', 'Cracked Polished Blackstone Bricks', 'Old blackstone bricks split by heat.', { faces: ALL('cracked_polished_blackstone_bricks'), hardness: 1.5, tool: 'pickaxe', tier: 1 });
ext(25, 'chiseled_polished_blackstone', 'Chiseled Polished Blackstone', 'Blackstone carved with a piglin face.', { faces: ALL('chiseled_polished_blackstone'), hardness: 1.5, tool: 'pickaxe', tier: 1 });
const JOB = { interactive: true, category: 'functional' as const };
def(236, 'composter', 'Composter', 'Drop in plant scraps to make bone meal. Farmers work here.', { faces: { ...ALL('composter_side'), py: 'composter_top', ny: 'composter_bottom' }, render: 'boxes', opaque: false, lightFilter: 0, hardness: 0.6, tool: 'axe', sound: 'wood', ...JOB });
def(237, 'lectern', 'Lectern', 'A reading stand. Librarians work here.', { faces: { ...ALL('lectern_sides'), py: 'lectern_top', ny: 'lectern_base', nz: 'lectern_front', pz: 'lectern_front' }, render: 'boxes', opaque: false, lightFilter: 0, hardness: 2.5, tool: 'axe', sound: 'wood', ...JOB });
def(238, 'blast_furnace', 'Blast Furnace', 'Smelts ores and metal twice as fast as a furnace. Armorers work here.', { faces: COL('blast_furnace_side', 'blast_furnace_top'), front: 'blast_furnace_front', orientable: true, hardness: 3.5, tool: 'pickaxe', tier: 1, ...JOB });
def(239, 'smoker', 'Smoker', 'Cooks food twice as fast as a furnace. Butchers work here.', { faces: { ...ALL('smoker_side'), py: 'smoker_top', ny: 'smoker_bottom' }, front: 'smoker_front', orientable: true, hardness: 3.5, tool: 'pickaxe', tier: 1, ...JOB });
def(240, 'fletching_table', 'Fletching Table', 'A bench strewn with feathers and flint. Fletchers work here.', { faces: { px: 'fletching_table_side', nx: 'fletching_table_side', py: 'fletching_table_top', ny: 'birch_planks', pz: 'fletching_table_front', nz: 'fletching_table_front' }, hardness: 2.5, tool: 'axe', sound: 'wood', ...JOB });
def(241, 'brewing_stand', 'Brewing Stand', 'A stand of glass bottles over a flame. Clerics work here.', { faces: { ...ALL('brewing_stand'), ny: 'brewing_stand_base', py: 'brewing_stand_base' }, render: 'boxes', opaque: false, solid: true, lightFilter: 0, lightEmit: 1, hardness: 0.5, tool: 'pickaxe', ...JOB });
def(242, 'stonecutter', 'Stonecutter', 'A spinning saw blade set in stone. Masons work here.', { faces: { ...ALL('stonecutter_side'), py: 'stonecutter_top', ny: 'stonecutter_bottom' }, render: 'boxes', opaque: false, lightFilter: 0, hardness: 3.5, tool: 'pickaxe', tier: 1, ...JOB });
def(243, 'barrel', 'Barrel', 'Twenty-seven slots, and it fits anywhere. Fishermen work here.', { faces: { ...ALL('barrel_side'), py: 'barrel_top', ny: 'barrel_bottom' }, hardness: 2.5, tool: 'axe', sound: 'wood', ...JOB });
def(244, 'cartography_table', 'Cartography Table', 'A desk covered in maps. Cartographers work here.', { faces: { px: 'cartography_table_side3', nx: 'cartography_table_side1', py: 'cartography_table_top', ny: 'spruce_planks', pz: 'cartography_table_side2', nz: 'cartography_table_side1' }, hardness: 2.5, tool: 'axe', sound: 'wood', ...JOB });
def(245, 'cauldron', 'Cauldron', 'A big iron pot. Leatherworkers work here.', { faces: { ...ALL('cauldron_side'), py: 'cauldron_top', ny: 'cauldron_bottom' }, render: 'boxes', opaque: false, lightFilter: 0, hardness: 2, tool: 'pickaxe', tier: 1, ...JOB });
def(246, 'loom', 'Loom', 'A frame for weaving cloth. Shepherds work here.', { faces: { ...ALL('loom_side'), py: 'loom_top', ny: 'loom_bottom' }, front: 'loom_front', orientable: true, hardness: 2.5, tool: 'axe', sound: 'wood', ...JOB });
def(247, 'grindstone', 'Grindstone', 'A stone wheel on a wooden frame. Weaponsmiths work here.', { faces: { ...ALL('grindstone_side'), py: 'grindstone_round', ny: 'grindstone_round' }, render: 'boxes', opaque: false, lightFilter: 0, hardness: 2, tool: 'pickaxe', ...JOB });
def(248, 'bell', 'Bell', 'A golden village bell. Ring it to call everyone together.', { faces: { ...ALL('bell_side'), py: 'bell_top', ny: 'bell_bottom' }, render: 'boxes', opaque: false, lightFilter: 0, hardness: 5, tool: 'pickaxe', interactive: true, category: 'functional' });
def(249, 'lantern', 'Lantern', 'An iron lantern with a candle-bright flame.', { faces: ALL('lantern'), render: 'boxes', opaque: false, lightFilter: 0, lightEmit: 15, hardness: 3.5, tool: 'pickaxe', category: 'functional' });
def(250, 'pumpkin', 'Pumpkin', 'A big orange gourd.', { faces: COL('pumpkin_side', 'pumpkin_top'), hardness: 1, tool: 'axe', sound: 'wood', category: 'plants' });
def(251, 'melon', 'Melon', 'A striped green melon. Breaks into slices.', { faces: COL('melon_side', 'melon_top'), hardness: 1, tool: 'axe', sound: 'wood', drops: [{ item: 433, min: 3, max: 7 }], category: 'plants' });
def(252, 'cake', 'Cake', 'Use it to eat a slice. Seven slices per cake.', { faces: { ...ALL('cake_side'), py: 'cake_top', ny: 'cake_bottom' }, render: 'boxes', opaque: false, lightFilter: 0, hardness: 0.5, sound: 'cloth', interactive: true, drops: [], category: 'functional' });
def(253, 'carrots', 'Carrots', 'Carrots growing in the soil.', { faces: ALL('carrots_stage3'), ...PLANT, render: 'crop', needsSupport: 'farmland', drops: [{ item: 428 }], category: 'hidden' });
def(254, 'potatoes', 'Potatoes', 'Potatoes growing in the soil.', { faces: ALL('potatoes_stage3'), ...PLANT, render: 'crop', needsSupport: 'farmland', drops: [{ item: 426 }], category: 'hidden' });
def(255, 'beetroots', 'Beetroots', 'Beetroots growing in the soil.', { faces: ALL('beetroots_stage3'), ...PLANT, render: 'crop', needsSupport: 'farmland', drops: [{ item: 430 }], category: 'hidden' });
def(235, 'smithing_table', 'Smithing Table', 'Use an upgrade template to turn Diamond gear into Netherite gear, keeping its enchantments.', { faces: { ...ALL('smithing_table_side'), py: 'smithing_table_top', ny: 'smithing_table_bottom', pz: 'smithing_table_front', nz: 'smithing_table_front' }, hardness: 2.5, tool: 'axe', sound: 'wood', interactive: true, category: 'functional' });
ext(26, 'granite', 'Granite', 'Speckled pink stone found in patches underground.', { faces: ALL('granite'), hardness: 1.5, tool: 'pickaxe', tier: 1, category: 'nature' });
ext(27, 'polished_granite', 'Polished Granite', 'Granite ground smooth.', { faces: ALL('polished_granite'), hardness: 1.5, tool: 'pickaxe', tier: 1 });
ext(28, 'diorite', 'Diorite', 'Pale grey and white stone found in patches underground.', { faces: ALL('diorite'), hardness: 1.5, tool: 'pickaxe', tier: 1, category: 'nature' });
ext(29, 'polished_diorite', 'Polished Diorite', 'Diorite ground smooth.', { faces: ALL('polished_diorite'), hardness: 1.5, tool: 'pickaxe', tier: 1 });
ext(30, 'andesite', 'Andesite', 'Mottled grey stone found in patches underground.', { faces: ALL('andesite'), hardness: 1.5, tool: 'pickaxe', tier: 1, category: 'nature' });
ext(31, 'polished_andesite', 'Polished Andesite', 'Andesite ground smooth.', { faces: ALL('polished_andesite'), hardness: 1.5, tool: 'pickaxe', tier: 1 });
ext(32, 'dripstone_block', 'Dripstone Block', 'Brown limestone built up by dripping water.', { faces: ALL('dripstone_block'), hardness: 1.5, tool: 'pickaxe', tier: 1, category: 'nature' });
ext(33, 'quartz_pillar', 'Quartz Pillar', 'A tall column of polished quartz.', { faces: { ...ALL('quartz_pillar'), py: 'quartz_pillar_top', ny: 'quartz_pillar_top' }, hardness: 0.8, tool: 'pickaxe', tier: 1 });
ext(34, 'dried_kelp_block', 'Dried Kelp Block', 'Nine bundles of dried kelp. Burns for a long time.', { faces: { ...ALL('dried_kelp_side'), py: 'dried_kelp_top', ny: 'dried_kelp_bottom' }, hardness: 0.5, tool: 'hoe', sound: 'grass' });
const CORALS = ['tube', 'brain', 'bubble', 'fire', 'horn'];
CORALS.forEach((c, i) => ext(51 + i, `${c}_coral_block`, `${c[0].toUpperCase()}${c.slice(1)} Coral Block`, 'Living reef rock from warm seas.', { faces: ALL(`${c}_coral_block`), hardness: 1.5, tool: 'pickaxe', tier: 1, category: 'nature' }));
ext(56, 'red_mushroom_block', 'Red Mushroom Block', 'The spotted cap of a huge mushroom.', { faces: ALL('red_mushroom_block'), hardness: 0.2, tool: 'axe', sound: 'wood', category: 'nature' });
ext(57, 'brown_mushroom_block', 'Brown Mushroom Block', 'The flat cap of a huge mushroom.', { faces: ALL('brown_mushroom_block'), hardness: 0.2, tool: 'axe', sound: 'wood', category: 'nature' });
ext(58, 'mushroom_stem', 'Mushroom Stem', 'The pale stalk of a huge mushroom.', { faces: ALL('mushroom_stem'), hardness: 0.2, tool: 'axe', sound: 'wood', category: 'nature' });
ext(59, 'mycelium', 'Mycelium', 'Fungal turf. Mushrooms grow here in any light.', { faces: { ...ALL('mycelium_side'), py: 'mycelium_top', ny: 'dirt' }, hardness: 0.6, tool: 'shovel', sound: 'grass', drops: [{ item: 3 }], category: 'nature' });
COLORS.forEach((c, i) => ext(35 + i, `${c}_glazed_terracotta`, `${COLOR_NAMES[c]} Glazed Terracotta`, 'Fired clay with a bold glazed pattern.', { faces: ALL(`${c}_glazed_terracotta`), hardness: 1.4, tool: 'pickaxe', tier: 1 }));
ext(20, 'smooth_basalt', 'Smooth Basalt', 'Basalt smoothed by heat.', { faces: ALL('smooth_basalt'), hardness: 1.25, tool: 'pickaxe', tier: 1 });
def(214, 'enchanting_table', 'Enchanting Table', 'Spend levels and lapis to enchant gear. Bookshelves two blocks away make it stronger.', { faces: { ...ALL('enchanting_table_side'), py: 'enchanting_table_top', ny: 'enchanting_table_bottom' }, render: 'boxes', opaque: false, lightFilter: 0, lightEmit: 7, hardness: 5, tool: 'pickaxe', tier: 1, interactive: true, sound: 'stone', category: 'functional' });
def(215, 'lapis_ore', 'Lapis Ore', 'Deep blue stone. Drops lapis for enchanting.', { faces: ALL('lapis_ore'), hardness: 3, tool: 'pickaxe', tier: 2, drops: [{ item: 389, min: 4, max: 9 }], xp: [2, 5], category: 'ore' });
def(216, 'lapis_block', 'Block of Lapis', 'Nine lapis packed together.', { faces: ALL('lapis_block'), hardness: 3, tool: 'pickaxe', tier: 2, category: 'building' });
def(217, 'anvil', 'Anvil', 'Repair, rename and combine enchanted gear for levels.', { faces: { ...ALL('anvil'), py: 'anvil_top' }, render: 'boxes', opaque: false, lightFilter: 0, hardness: 5, tool: 'pickaxe', tier: 1, interactive: true, sound: 'metal', category: 'functional' });

export function isWaterPlant(id: number): boolean { return id === 179 || id === 180 || id === 181; }
export function isWaterLike(v: number): boolean { const id = bid(v); return id === 12 || id === 179 || id === 180 || id === 181; }

export const SB = {
  ACACIA_PLANKS: SPB, ACACIA_LOG: SPB + 1, ACACIA_LEAVES: SPB + 2, ACACIA_SAPLING: SPB + 3,
  DARK_OAK_PLANKS: SPB + 4, DARK_OAK_LOG: SPB + 5, DARK_OAK_LEAVES: SPB + 6, DARK_OAK_SAPLING: SPB + 7,
  RED_SAND: SPB + 8, COARSE_DIRT: SPB + 9, PODZOL: SPB + 10, RED_SANDSTONE: SPB + 11,
  CHERRY_PLANKS: SPB + 12, CHERRY_LOG: SPB + 13, CHERRY_LEAVES: SPB + 14, CHERRY_SAPLING: SPB + 15,
  MANGROVE_PLANKS: SPB + 16, MANGROVE_LOG: SPB + 17, MANGROVE_LEAVES: SPB + 18, MANGROVE_PROPAGULE: SPB + 19,
  TUBE_CORAL: SPB + 20, BRAIN_CORAL: SPB + 21, BUBBLE_CORAL: SPB + 22, FIRE_CORAL: SPB + 23, HORN_CORAL: SPB + 24,
  IRON_TRAPDOOR: SPB + 25, OAK_TRAPDOOR: SPB + 26, SPRUCE_TRAPDOOR: SPB + 27, BIRCH_TRAPDOOR: SPB + 28, JUNGLE_TRAPDOOR: SPB + 29,
  ACACIA_TRAPDOOR: SPB + 30, DARK_OAK_TRAPDOOR: SPB + 31, CHERRY_TRAPDOOR: SPB + 32, MANGROVE_TRAPDOOR: SPB + 33,
} as const;
export const TRAPDOOR_WOODS = ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak', 'cherry', 'mangrove'] as const;
export const TD_TOP = 1, TD_OPEN = 2, TD_SPECIES_MIN = 7;
export function isTrapdoor(v: number): boolean { return bid(v) === 42 && ((v >>> 12) & 15) >= TD_SPECIES_MIN; }
export function isDoorBlock(v: number): boolean { return bid(v) === 42 && ((v >>> 12) & 15) < TD_SPECIES_MIN; }
export function trapdoorMeta(species: number, hinge: number, top: boolean, open: boolean): number {
  return ((species & 15) << 4) | ((hinge & 3) << 2) | (top ? TD_TOP : 0) | (open ? TD_OPEN : 0);
}
export function trapdoorBox(meta: number): [number, number, number, number, number, number] {
  if (meta & TD_OPEN) return edgeBox((meta >> 2) & 3, 3 / 16);
  return meta & TD_TOP ? [0, 13 / 16, 0, 1, 1, 1] : [0, 0, 0, 1, 3 / 16, 1];
}
species(SB.ACACIA_PLANKS, 5, 1, 'acacia_planks', 'Acacia Planks', 'Warm orange timber from the savanna.', { faces: ALL('acacia_planks') });
species(SB.ACACIA_LOG, 14, 1, 'acacia_log', 'Acacia Log', 'Grey bark around bright orange wood.', { faces: COL('acacia_log', 'acacia_log_top') });
species(SB.ACACIA_LEAVES, 15, 1, 'acacia_leaves', 'Acacia Leaves', 'Flat-topped canopy of the savanna.', { faces: ALL('acacia_leaves'), drops: [{ item: SPB + 3, chance: 0.05 }, { item: 256, chance: 0.02 }] });
species(SB.ACACIA_SAPLING, 55, 1, 'acacia_sapling', 'Acacia Sapling', 'Plant on soil and wait for a crooked acacia.', { faces: ALL('acacia_sapling') });
species(SB.DARK_OAK_PLANKS, 5, 2, 'dark_oak_planks', 'Dark Oak Planks', 'Deep brown timber from the thickest woods.', { faces: ALL('dark_oak_planks') });
species(SB.DARK_OAK_LOG, 14, 2, 'dark_oak_log', 'Dark Oak Log', 'Thick, nearly black bark.', { faces: COL('dark_oak_log', 'dark_oak_log_top') });
species(SB.DARK_OAK_LEAVES, 15, 2, 'dark_oak_leaves', 'Dark Oak Leaves', 'A canopy so dense the ground stays dim.', { faces: ALL('dark_oak_leaves'), drops: [{ item: SPB + 7, chance: 0.05 }, { item: 258, chance: 0.01 }, { item: 256, chance: 0.02 }] });
species(SB.DARK_OAK_SAPLING, 55, 2, 'dark_oak_sapling', 'Dark Oak Sapling', 'Plant four in a square to grow a dark oak.', { faces: ALL('dark_oak_sapling') });
species(SB.RED_SAND, 7, 1, 'red_sand', 'Red Sand', 'Iron-stained sand from the badlands.', { faces: ALL('red_sand') });
species(SB.COARSE_DIRT, 3, 1, 'coarse_dirt', 'Coarse Dirt', 'Gravelly soil that grass will not grow over.', { faces: ALL('coarse_dirt') });
species(SB.PODZOL, 3, 2, 'podzol', 'Podzol', 'Needle-strewn forest floor.', { faces: { ...ALL('podzol_side'), py: 'podzol_top', ny: 'dirt' }, drops: [{ item: 3 }] });
species(SB.CHERRY_PLANKS, 5, 3, 'cherry_planks', 'Cherry Planks', 'Pale pink timber.', { faces: ALL('cherry_planks') });
species(SB.CHERRY_LOG, 14, 3, 'cherry_log', 'Cherry Log', 'Dark bark around rosy wood.', { faces: COL('cherry_log', 'cherry_log_top') });
species(SB.CHERRY_LEAVES, 15, 3, 'cherry_leaves', 'Cherry Leaves', 'Clouds of pink blossom.', { faces: ALL('cherry_leaves'), tint: null, drops: [{ item: SPB + 15, chance: 0.05 }, { item: 256, chance: 0.02 }] });
species(SB.CHERRY_SAPLING, 55, 3, 'cherry_sapling', 'Cherry Sapling', 'Grows into a spreading cherry tree.', { faces: ALL('cherry_sapling') });
species(SB.MANGROVE_PLANKS, 5, 4, 'mangrove_planks', 'Mangrove Planks', 'Red timber that shrugs off the damp.', { faces: ALL('mangrove_planks') });
species(SB.MANGROVE_LOG, 14, 4, 'mangrove_log', 'Mangrove Log', 'Twisting wood from tidal swamps.', { faces: COL('mangrove_log', 'mangrove_log_top') });
species(SB.MANGROVE_LEAVES, 15, 4, 'mangrove_leaves', 'Mangrove Leaves', 'Waxy leaves that thrive in heat.', { faces: ALL('mangrove_leaves'), drops: [{ item: SPB + 19, chance: 0.05 }, { item: 256, chance: 0.02 }] });
species(SB.MANGROVE_PROPAGULE, 55, 4, 'mangrove_propagule', 'Mangrove Propagule', 'A seedling that roots even in shallow water.', { faces: ALL('mangrove_propagule') });
CORALS.forEach((c, i) => species(SB.TUBE_CORAL + i, 181, 1 + i, `${c}_coral`, `${c[0].toUpperCase()}${c.slice(1)} Coral`, 'A bright coral that grows on warm sea floors.', { faces: ALL(`${c}_coral`), drops: [{ item: SB.TUBE_CORAL + i }], category: 'nature' }));
const TD_BASE: Partial<BlockDef> = { render: 'trapdoor', solid: true, opaque: false, lightFilter: 0, cullSelf: false, interactive: true, category: 'functional', orientable: false };
species(SB.IRON_TRAPDOOR, 42, 7, 'iron_trapdoor', 'Iron Trapdoor', 'A heavy hatch that only redstone can open.', { faces: ALL('iron_trapdoor'), ...TD_BASE, interactive: false, hardness: 5, tool: 'pickaxe', sound: 'metal', drops: [{ item: SB.IRON_TRAPDOOR }] });
TRAPDOOR_WOODS.forEach((w, i) => {
  const nm = w.split('_').map((p) => p[0].toUpperCase() + p.slice(1)).join(' ');
  species(SB.OAK_TRAPDOOR + i, 42, 8 + i, `${w}_trapdoor`, `${nm} Trapdoor`, 'A hatch that flips open with a tap or a redstone signal.', { faces: ALL(`${w}_trapdoor`), ...TD_BASE, hardness: 3, tool: 'axe', sound: 'wood', drops: [{ item: SB.OAK_TRAPDOOR + i }] });
});
species(SB.RED_SANDSTONE, 26, 1, 'red_sandstone', 'Red Sandstone', 'Compressed red sand.', { faces: COL('red_sandstone', 'red_sandstone_top', 'red_sandstone_bottom') });

export const CB = {
  MOSS_BLOCK: 1024, MOSS_CARPET: 1025, AZALEA: 1026, FLOWERING_AZALEA: 1027, AZALEA_LEAVES: 1028, FLOWERING_AZALEA_LEAVES: 1029,
  ROOTED_DIRT: 1030, HANGING_ROOTS: 1031, CAVE_VINES: 1032, CAVE_VINES_LIT: 1033, SPORE_BLOSSOM: 1034, BIG_DRIPLEAF: 1035,
  BIG_DRIPLEAF_STEM: 1036, SMALL_DRIPLEAF: 1037, GLOW_LICHEN: 1038, POINTED_DRIPSTONE: 1039, SCULK: 1040, SCULK_VEIN: 1041,
  SCULK_SENSOR: 1042, SCULK_SHRIEKER: 1043, SCULK_CATALYST: 1044, DEEPSLATE: 1045, COBBLED_DEEPSLATE: 1046,
  END_STONE: 1047, END_STONE_BRICKS: 1048, PURPUR_BLOCK: 1049, PURPUR_PILLAR: 1050, END_ROD: 1051, CHORUS_PLANT: 1052, CHORUS_FLOWER: 1053,
  END_PORTAL_FRAME: 1054, END_PORTAL: 1055, END_GATEWAY: 1056, DRAGON_EGG: 1057, SHULKER_BOX: 1058, DRAGON_HEAD: 1059,
  SOUL_TORCH: 1060, SOUL_LANTERN: 1061, CAMPFIRE: 1062, SOUL_CAMPFIRE: 1063, RESPAWN_ANCHOR: 1064, LODESTONE: 1065,
} as const;
export const LANTERN_HANGING = 1, CAMPFIRE_LIT = 4;
export const ANCHOR_LIGHT = [0, 3, 7, 11, 15];
export function isCampfire(id: number): boolean { return id === CB.CAMPFIRE || id === CB.SOUL_CAMPFIRE; }
export function isLantern(id: number): boolean { return id === B.LANTERN || id === CB.SOUL_LANTERN; }
export function isSoulLight(id: number): boolean { return id === CB.SOUL_TORCH || id === CB.SOUL_LANTERN || id === CB.SOUL_CAMPFIRE || id === B.SOUL_FIRE; }
export const FRAME_EYE = 4, CHORUS_DEAD = 5;
export const VINE_BODY = 1, DL_TILT_SHIFT = 2, SMALL_UPPER = 1, DRIP_DOWN = 8, SENSOR_ACTIVE = 1, SENSOR_COOL = 2, SHRIEK_ON = 1, SHRIEK_SUMMON = 2;
export const CAULDRON_LAVA = 4;
export function cauldronLevel(v: number): number { return bid(v) === B.CAULDRON ? (((v >>> 8) & CAULDRON_LAVA) ? 3 : (v >>> 8) & 3) : 0; }
export const DRIP_THICK = ['tip_merge', 'tip', 'frustum', 'middle', 'base'] as const;
const CAVE_PLANT: Partial<BlockDef> = { render: 'cave', solid: false, opaque: false, lightFilter: 0, hardness: 0, sound: 'grass', category: 'plants' };
const HALF_SIDES = (side: string, top: string, bottom: string): FaceTextures => ({ px: side, nx: side, pz: side, nz: side, py: top, ny: bottom });
def(CB.MOSS_BLOCK, 'moss_block', 'Moss Block', 'Soft green moss. Bone meal spreads it, with plants on top.', { faces: ALL('moss_block'), hardness: 0.1, tool: 'hoe', sound: 'grass', category: 'nature' });
def(CB.MOSS_CARPET, 'moss_carpet', 'Moss Carpet', 'A thin layer of moss.', { faces: ALL('moss_block'), render: 'boxes', solid: false, opaque: false, lightFilter: 0, hardness: 0.1, tool: 'hoe', sound: 'grass', needsSupport: 'solid', category: 'nature' });
def(CB.AZALEA, 'azalea', 'Azalea', 'A leafy bush from lush caves. Bone meal grows an azalea tree.', { faces: ALL('azalea_side'), ...CAVE_PLANT, render: 'cross', needsSupport: 'soil' });
def(CB.FLOWERING_AZALEA, 'flowering_azalea', 'Flowering Azalea', 'An azalea bush in bloom.', { faces: ALL('flowering_azalea_side'), ...CAVE_PLANT, render: 'cross', needsSupport: 'soil' });
def(CB.AZALEA_LEAVES, 'azalea_leaves', 'Azalea Leaves', 'Glossy leaves from an azalea tree.', { faces: ALL('azalea_leaves'), ...LEAVES, drops: [{ item: CB.AZALEA, chance: 0.05 }] });
def(CB.FLOWERING_AZALEA_LEAVES, 'flowering_azalea_leaves', 'Flowering Azalea Leaves', 'Azalea leaves dotted with pink flowers.', { faces: ALL('flowering_azalea_leaves'), ...LEAVES, drops: [{ item: CB.FLOWERING_AZALEA, chance: 0.05 }] });
def(CB.ROOTED_DIRT, 'rooted_dirt', 'Rooted Dirt', 'Dirt threaded with roots from the tree above.', { faces: ALL('rooted_dirt'), hardness: 0.5, tool: 'shovel', sound: 'grass', category: 'nature' });
def(CB.HANGING_ROOTS, 'hanging_roots', 'Hanging Roots', 'Roots dangling from the cave roof.', { faces: ALL('hanging_roots'), ...CAVE_PLANT, render: 'cross', needsSupport: 'hang', replaceable: true });
def(CB.CAVE_VINES, 'cave_vines', 'Cave Vines', 'Vines that hang from the roof of lush caves.', { faces: ALL('cave_vines'), ...CAVE_PLANT, needsSupport: 'hang', climbable: true, drops: [], category: 'hidden' });
def(CB.CAVE_VINES_LIT, 'cave_vines_lit', 'Cave Vines with Glow Berries', 'Tap to pick the glowing berries.', { faces: ALL('cave_vines_lit'), ...CAVE_PLANT, needsSupport: 'hang', climbable: true, lightEmit: 14, interactive: true, drops: [{ item: 4096 }], category: 'hidden' });
def(CB.SPORE_BLOSSOM, 'spore_blossom', 'Spore Blossom', 'A flower that hangs from ceilings and drifts spores.', { faces: ALL('spore_blossom'), ...CAVE_PLANT, needsSupport: 'hang' });
def(CB.BIG_DRIPLEAF, 'big_dripleaf', 'Big Dripleaf', 'A broad leaf you can stand on, until it tips. Bone meal makes it taller.', { faces: HALF_SIDES('big_dripleaf_side', 'big_dripleaf_top', 'big_dripleaf_top'), ...CAVE_PLANT, solid: true, needsSupport: 'soil' });
def(CB.BIG_DRIPLEAF_STEM, 'big_dripleaf_stem', 'Big Dripleaf Stem', 'The stalk of a big dripleaf.', { faces: ALL('big_dripleaf_stem'), ...CAVE_PLANT, drops: [{ item: CB.BIG_DRIPLEAF }], category: 'hidden' });
def(CB.SMALL_DRIPLEAF, 'small_dripleaf', 'Small Dripleaf', 'A two-block-tall leafy plant from lush caves.', { faces: ALL('small_dripleaf_side'), ...CAVE_PLANT, needsSupport: 'soil' });
def(CB.GLOW_LICHEN, 'glow_lichen', 'Glow Lichen', 'A faintly glowing crust that clings to walls.', { faces: ALL('glow_lichen'), render: 'ladder', solid: false, opaque: false, lightFilter: 0, lightEmit: 7, hardness: 0.2, sound: 'grass', replaceable: true, category: 'nature' });
def(CB.POINTED_DRIPSTONE, 'pointed_dripstone', 'Pointed Dripstone', 'Stalactites hang from roofs and stalagmites rise from floors. Landing on one hurts.', { faces: ALL('pointed_dripstone_up_tip'), render: 'cave', solid: true, opaque: false, lightFilter: 0, hardness: 1.5, tool: 'pickaxe', sound: 'stone', category: 'nature' });
def(CB.SCULK, 'sculk', 'Sculk', 'Living blackness that spreads where creatures die.', { faces: ALL('sculk'), hardness: 0.2, tool: 'hoe', sound: 'cloth', drops: [], xp: [1, 1], category: 'nature' });
def(CB.SCULK_VEIN, 'sculk_vein', 'Sculk Vein', 'A thin creeping layer of sculk.', { faces: ALL('sculk_vein'), render: 'cave', solid: false, opaque: false, lightFilter: 0, hardness: 0.2, tool: 'hoe', sound: 'cloth', replaceable: true, drops: [], category: 'nature' });
def(CB.SCULK_SENSOR, 'sculk_sensor', 'Sculk Sensor', 'Twitches at nearby footsteps and noises and gives a redstone signal. Sneak to stay quiet.', { faces: HALF_SIDES('sculk_sensor_side', 'sculk_sensor_top', 'sculk_sensor_bottom'), render: 'boxes', opaque: false, lightFilter: 0, lightEmit: 1, hardness: 1.5, tool: 'hoe', sound: 'cloth', xp: [5, 5], category: 'functional' });
def(CB.SCULK_SHRIEKER, 'sculk_shrieker', 'Sculk Shrieker', 'Shrieks when a player is heard nearby or steps on it. The wild ones bring Darkness.', { faces: HALF_SIDES('sculk_shrieker_side', 'sculk_shrieker_top', 'sculk_shrieker_bottom'), render: 'boxes', opaque: false, lightFilter: 0, hardness: 3, tool: 'hoe', sound: 'cloth', xp: [5, 5], category: 'functional' });
def(CB.SCULK_CATALYST, 'sculk_catalyst', 'Sculk Catalyst', 'Blooms and spreads sculk when a creature dies close by.', { faces: HALF_SIDES('sculk_catalyst_side', 'sculk_catalyst_top', 'sculk_catalyst_bottom'), lightEmit: 6, hardness: 3, tool: 'hoe', sound: 'cloth', xp: [5, 5], category: 'functional' });
def(CB.DEEPSLATE, 'deepslate', 'Deepslate', 'Dense dark rock from deep underground.', { faces: COL('deepslate', 'deepslate_top'), hardness: 3, tool: 'pickaxe', tier: 1, drops: [{ item: CB.COBBLED_DEEPSLATE }] });
def(CB.COBBLED_DEEPSLATE, 'cobbled_deepslate', 'Cobbled Deepslate', 'Broken deepslate. Builds like cobblestone.', { faces: ALL('cobbled_deepslate'), hardness: 3.5, tool: 'pickaxe', tier: 1 });
def(CB.END_STONE, 'end_stone', 'End Stone', 'Pale stone from the floating islands of the End.', { faces: ALL('end_stone'), hardness: 3, tool: 'pickaxe', tier: 1, category: 'nature' });
def(CB.END_STONE_BRICKS, 'end_stone_bricks', 'End Stone Bricks', 'Neatly cut End Stone.', { faces: ALL('end_stone_bricks'), hardness: 3, tool: 'pickaxe', tier: 1 });
def(CB.PURPUR_BLOCK, 'purpur_block', 'Purpur Block', 'Lilac blocks from the towers of End cities.', { faces: ALL('purpur_block'), hardness: 1.5, tool: 'pickaxe', tier: 1 });
def(CB.PURPUR_PILLAR, 'purpur_pillar', 'Purpur Pillar', 'A ridged column of purpur.', { faces: COL('purpur_pillar_side', 'purpur_pillar_top'), hardness: 1.5, tool: 'pickaxe', tier: 1 });
def(CB.END_ROD, 'end_rod', 'End Rod', 'A glowing white rod that sheds soft light.', { faces: ALL('end_rod'), render: 'boxes', solid: false, opaque: false, lightFilter: 0, lightEmit: 14, hardness: 0, sound: 'glass', category: 'functional' });
def(CB.CHORUS_PLANT, 'chorus_plant', 'Chorus Plant', 'A branching purple plant of the outer End islands. Break it at the base and the whole plant falls.', { faces: ALL('chorus_plant'), render: 'boxes', opaque: false, lightFilter: 0, hardness: 0.4, tool: 'axe', sound: 'wood', drops: [{ item: 494, chance: 0.5 }], category: 'plants' });
def(CB.CHORUS_FLOWER, 'chorus_flower', 'Chorus Flower', 'Plant it on End Stone and it slowly grows into a chorus plant.', { faces: ALL('chorus_flower'), render: 'boxes', opaque: false, lightFilter: 0, hardness: 0.4, tool: 'axe', sound: 'wood', category: 'plants' });
def(CB.END_PORTAL_FRAME, 'end_portal_frame', 'End Portal Frame', 'Twelve of these ring the portal to the End. Each needs an Eye of Ender.', { faces: HALF_SIDES('end_portal_frame_side', 'end_portal_frame_top', 'end_stone'), render: 'boxes', opaque: false, lightFilter: 0, lightEmit: 1, hardness: -1, drops: null, interactive: true, category: 'functional' });
def(CB.END_PORTAL, 'end_portal', 'End Portal', 'A window onto the void. Step in to travel.', { faces: ALL('end_portal'), render: 'boxes', solid: false, opaque: false, lightFilter: 0, lightEmit: 15, hardness: -1, drops: null, category: 'hidden' });
def(CB.END_GATEWAY, 'end_gateway', 'End Gateway', 'A beacon of the void that flings you to the far islands.', { faces: ALL('end_portal'), solid: false, opaque: false, lightFilter: 0, lightEmit: 15, hardness: -1, drops: null, category: 'hidden', cullSelf: true });
def(CB.DRAGON_EGG, 'dragon_egg', 'Dragon Egg', 'The prize for defeating the Ender Dragon. Touch it and it slips away.', { faces: ALL('dragon_egg'), render: 'boxes', opaque: false, lightFilter: 0, lightEmit: 1, hardness: 3, interactive: true, category: 'functional' });
def(CB.SHULKER_BOX, 'shulker_box', 'Shulker Box', 'A chest that keeps its contents when you break it. Carry 27 stacks in one slot.', { faces: ALL('shulker_box'), hardness: 2, tool: 'pickaxe', interactive: true, drops: null, category: 'functional' });
def(CB.SOUL_TORCH, 'soul_torch', 'Soul Torch', 'A blue torch lit with soul sand. Dimmer than a torch, and Piglins keep away from it.', { faces: ALL('soul_torch'), render: 'torch', solid: false, opaque: false, lightFilter: 0, lightEmit: 10, hardness: 0, sound: 'wood', needsSupport: 'solid', category: 'functional' });
def(CB.SOUL_LANTERN, 'soul_lantern', 'Soul Lantern', 'A lantern with a cold blue flame. Hang it under a block or set it on one.', { faces: ALL('soul_lantern'), render: 'boxes', opaque: false, lightFilter: 0, lightEmit: 10, hardness: 3.5, tool: 'pickaxe', sound: 'metal', category: 'functional' });
def(CB.CAMPFIRE, 'campfire', 'Campfire', 'Cooks up to four pieces of food at once and sends up smoke. Burns anyone who stands in it.', { faces: ALL('campfire_log'), render: 'boxes', solid: true, opaque: false, lightFilter: 0, lightEmit: 15, hardness: 2, tool: 'axe', sound: 'wood', interactive: true, drops: [{ item: 261, min: 2, max: 2 }], category: 'functional' });
def(CB.SOUL_CAMPFIRE, 'soul_campfire', 'Soul Campfire', 'A campfire of blue soul flame. Burns harder than a campfire and keeps Piglins away.', { faces: ALL('campfire_log'), render: 'boxes', solid: true, opaque: false, lightFilter: 0, lightEmit: 10, hardness: 2, tool: 'axe', sound: 'wood', interactive: true, drops: [{ item: XB + 5 }], category: 'functional' });
def(CB.RESPAWN_ANCHOR, 'respawn_anchor', 'Respawn Anchor', 'Charge it with Glowshard and use it in the Nether to respawn there. Anywhere else it explodes.', { faces: HALF_SIDES('respawn_anchor_side0', 'respawn_anchor_top_off', 'respawn_anchor_bottom'), render: 'boxes', opaque: false, lightFilter: 15, lightEmit: 15, hardness: 50, tool: 'pickaxe', tier: 4, interactive: true, category: 'functional' });
def(CB.LODESTONE, 'lodestone', 'Lodestone', 'Use a Compass on it and the compass will point here instead of spawn, even in the Nether.', { faces: COL('lodestone_side', 'lodestone_top'), hardness: 3.5, tool: 'pickaxe', tier: 1, sound: 'metal', interactive: true, category: 'functional' });
def(CB.DRAGON_HEAD, 'dragon_head', 'Dragon Head', 'A trophy from the bow of an End ship.', { faces: ALL('dragon_head'), render: 'boxes', opaque: false, lightFilter: 0, hardness: 1, category: 'functional' });
export const NB = {
  POLISHED_DEEPSLATE: 1132, DEEPSLATE_BRICKS: 1133, CRACKED_DEEPSLATE_BRICKS: 1134, DEEPSLATE_TILES: 1135, CRACKED_DEEPSLATE_TILES: 1136, CHISELED_DEEPSLATE: 1137,
  PACKED_MUD: 1138, MUD_BRICKS: 1139, PRISMARINE: 1140, PRISMARINE_BRICKS: 1141, DARK_PRISMARINE: 1142, SEA_LANTERN: 1143,
  RED_NETHER_BRICKS: 1144, CRACKED_NETHER_BRICKS: 1145, CHISELED_NETHER_BRICKS: 1146, SMOOTH_QUARTZ: 1147, QUARTZ_BRICKS: 1148, CHISELED_QUARTZ: 1149,
  SMOOTH_RED_SANDSTONE: 1150, CUT_RED_SANDSTONE: 1151, CHISELED_RED_SANDSTONE: 1152, POLISHED_BASALT: 1153,
} as const;
export const FENCE_BASE = 1070, GATE_BASE = 1080, WALL_BASE = 1090, GLASS_PANE = 1115, STAINED_PANE_BASE = 1116, SLAB2 = 1160, STAIRS2 = 1161;
export const GATE_OPEN = 4, GATE_POWERED = 8;
const STONE_P = { hardness: 1.5, tool: 'pickaxe' as ToolType, tier: 1 };
const DS_P = { hardness: 3.5, tool: 'pickaxe' as ToolType, tier: 1, sound: 'stone' as SoundGroup };
def(NB.POLISHED_DEEPSLATE, 'polished_deepslate', 'Polished Deepslate', 'Deepslate ground smooth and dark.', { faces: ALL('polished_deepslate'), ...DS_P });
def(NB.DEEPSLATE_BRICKS, 'deepslate_bricks', 'Deepslate Bricks', 'Small, heavy bricks cut from the deep dark.', { faces: ALL('deepslate_bricks'), ...DS_P });
def(NB.CRACKED_DEEPSLATE_BRICKS, 'cracked_deepslate_bricks', 'Cracked Deepslate Bricks', 'Deepslate bricks split by heat.', { faces: ALL('cracked_deepslate_bricks'), ...DS_P });
def(NB.DEEPSLATE_TILES, 'deepslate_tiles', 'Deepslate Tiles', 'Square deepslate tiles in a tight grid.', { faces: ALL('deepslate_tiles'), ...DS_P });
def(NB.CRACKED_DEEPSLATE_TILES, 'cracked_deepslate_tiles', 'Cracked Deepslate Tiles', 'Deepslate tiles split by heat.', { faces: ALL('cracked_deepslate_tiles'), ...DS_P });
def(NB.CHISELED_DEEPSLATE, 'chiseled_deepslate', 'Chiseled Deepslate', 'Deepslate carved with an ancient pattern.', { faces: ALL('chiseled_deepslate'), ...DS_P });
def(NB.PACKED_MUD, 'packed_mud', 'Packed Mud', 'Mud and wheat pressed firm.', { faces: ALL('packed_mud'), hardness: 1, sound: 'dirt' });
def(NB.MUD_BRICKS, 'mud_bricks', 'Mud Bricks', 'Sun-baked bricks with a warm, earthy colour.', { faces: ALL('mud_bricks'), ...STONE_P });
def(NB.PRISMARINE, 'prismarine', 'Prismarine', 'Sea-green stone that shifts colour as you watch.', { faces: ALL('prismarine'), ...STONE_P });
def(NB.PRISMARINE_BRICKS, 'prismarine_bricks', 'Prismarine Bricks', 'Neat blocks of pale sea stone.', { faces: ALL('prismarine_bricks'), ...STONE_P });
def(NB.DARK_PRISMARINE, 'dark_prismarine', 'Dark Prismarine', 'Deep teal sea stone set with dark seams.', { faces: ALL('dark_prismarine'), ...STONE_P });
def(NB.SEA_LANTERN, 'sea_lantern', 'Sea Lantern', 'A glowing block of shards and crystals. Shines underwater.', { faces: ALL('sea_lantern'), hardness: 0.3, lightEmit: 15, sound: 'glass', drops: [{ item: 507, min: 2, max: 3 }] });
def(NB.RED_NETHER_BRICKS, 'red_nether_bricks', 'Red Nether Bricks', 'Nether bricks mortared with wart.', { faces: ALL('red_nether_bricks'), hardness: 2, tool: 'pickaxe', tier: 1 });
def(NB.CRACKED_NETHER_BRICKS, 'cracked_nether_bricks', 'Cracked Nether Bricks', 'Nether bricks split by heat.', { faces: ALL('cracked_nether_bricks'), hardness: 2, tool: 'pickaxe', tier: 1 });
def(NB.CHISELED_NETHER_BRICKS, 'chiseled_nether_bricks', 'Chiseled Nether Bricks', 'Nether brick carved with a skull.', { faces: ALL('chiseled_nether_bricks'), hardness: 2, tool: 'pickaxe', tier: 1 });
def(NB.SMOOTH_QUARTZ, 'smooth_quartz', 'Smooth Quartz Block', 'Flawless polished quartz.', { faces: ALL('quartz_block_bottom'), hardness: 2, tool: 'pickaxe', tier: 1 });
def(NB.QUARTZ_BRICKS, 'quartz_bricks', 'Quartz Bricks', 'Small clean bricks of quartz.', { faces: ALL('quartz_bricks'), hardness: 0.8, tool: 'pickaxe', tier: 1 });
def(NB.CHISELED_QUARTZ, 'chiseled_quartz_block', 'Chiseled Quartz Block', 'Quartz carved with deep grooves.', { faces: COL('chiseled_quartz_block', 'chiseled_quartz_block_top'), hardness: 0.8, tool: 'pickaxe', tier: 1 });
def(NB.SMOOTH_RED_SANDSTONE, 'smooth_red_sandstone', 'Smooth Red Sandstone', 'Red sandstone sanded flat.', { faces: ALL('red_sandstone_top'), hardness: 2, tool: 'pickaxe', tier: 1 });
def(NB.CUT_RED_SANDSTONE, 'cut_red_sandstone', 'Cut Red Sandstone', 'Red sandstone cut into clean blocks.', { faces: COL('cut_red_sandstone', 'red_sandstone_top'), hardness: 0.8, tool: 'pickaxe', tier: 1 });
def(NB.CHISELED_RED_SANDSTONE, 'chiseled_red_sandstone', 'Chiseled Red Sandstone', 'Red sandstone carved with a desert glyph.', { faces: COL('chiseled_red_sandstone', 'red_sandstone_top'), hardness: 0.8, tool: 'pickaxe', tier: 1 });
def(NB.POLISHED_BASALT, 'polished_basalt', 'Polished Basalt', 'Basalt columns ground smooth.', { faces: COL('polished_basalt_side', 'polished_basalt_top'), hardness: 1.25, tool: 'pickaxe', tier: 1 });

export const WOODS: [string, string, number][] = [
  ['oak', 'Oak', B.OAK_PLANKS], ['spruce', 'Spruce', B.SPRUCE_PLANKS], ['birch', 'Birch', B.BIRCH_PLANKS], ['jungle', 'Jungle', B.JUNGLE_PLANKS],
  ['acacia', 'Acacia', SB.ACACIA_PLANKS], ['dark_oak', 'Dark Oak', SB.DARK_OAK_PLANKS], ['cherry', 'Cherry', SB.CHERRY_PLANKS], ['mangrove', 'Mangrove', SB.MANGROVE_PLANKS],
  ['crimson', 'Crimson', XB + XV.CRIMSON_PLANKS], ['warped', 'Warped', XB + XV.WARPED_PLANKS],
];
const CONN: Partial<BlockDef> = { opaque: false, lightFilter: 0, cullSelf: false, category: 'building' };
WOODS.forEach(([k, n, plank], i) => {
  const nether = k === 'crimson' || k === 'warped';
  def(FENCE_BASE + i, `${k}_fence`, `${n} Fence`, 'Links to fences, gates and solid blocks. Too tall to jump.', { faces: ALL(`${k}_planks`), render: 'fence', hardness: 2, tool: 'axe', sound: 'wood', ...CONN });
  def(GATE_BASE + i, `${k}_fence_gate`, `${n} Fence Gate`, 'A gate for fences and walls. Use it to swing it open; redstone works too.', { faces: ALL(`${k}_planks`), render: 'gate', hardness: 2, tool: 'axe', sound: 'wood', interactive: true, ...CONN });
  if (nether) { defs[FENCE_BASE + i].sound = 'wood'; }
  void plank;
});

export const WALL_MATS: [string, string, number][] = [
  ['cobblestone', 'Cobblestone', B.COBBLESTONE], ['mossy_cobblestone', 'Mossy Cobblestone', B.MOSSY_COBBLESTONE], ['stone_brick', 'Stone Brick', B.STONE_BRICKS],
  ['mossy_stone_brick', 'Mossy Stone Brick', B.MOSSY_STONE_BRICKS], ['brick', 'Brick', B.BRICKS], ['sandstone', 'Sandstone', B.SANDSTONE], ['red_sandstone', 'Red Sandstone', SB.RED_SANDSTONE],
  ['nether_brick', 'Nether Brick', XB + XV.NETHER_BRICKS], ['red_nether_brick', 'Red Nether Brick', NB.RED_NETHER_BRICKS], ['granite', 'Granite', XB + XV.GRANITE],
  ['diorite', 'Diorite', XB + XV.DIORITE], ['andesite', 'Andesite', XB + XV.ANDESITE], ['blackstone', 'Blackstone', XB + XV.BLACKSTONE],
  ['polished_blackstone', 'Polished Blackstone', XB + XV.POLISHED_BLACKSTONE], ['polished_blackstone_brick', 'Polished Blackstone Brick', XB + XV.POLISHED_BLACKSTONE_BRICKS],
  ['cobbled_deepslate', 'Cobbled Deepslate', CB.COBBLED_DEEPSLATE], ['polished_deepslate', 'Polished Deepslate', NB.POLISHED_DEEPSLATE], ['deepslate_brick', 'Deepslate Brick', NB.DEEPSLATE_BRICKS],
  ['deepslate_tile', 'Deepslate Tile', NB.DEEPSLATE_TILES], ['end_stone_brick', 'End Stone Brick', CB.END_STONE_BRICKS], ['prismarine', 'Prismarine', NB.PRISMARINE],
  ['mud_brick', 'Mud Brick', NB.MUD_BRICKS], ['tuff', 'Tuff', B.TUFF], ['polished_tuff', 'Polished Tuff', B.POLISHED_TUFF], ['tuff_brick', 'Tuff Brick', B.TUFF_BRICKS],
];
WALL_MATS.forEach(([k, n, src], i) => {
  const d = defs[src];
  def(WALL_BASE + i, `${k}_wall`, `${n} Wall`, 'Links to walls, panes, gates and solid blocks. Too tall to jump.', { faces: { ...d.faces }, render: 'wall', hardness: d.hardness, tool: d.tool ?? 'pickaxe', tier: d.tier || 1, sound: d.sound, ...CONN });
});

def(GLASS_PANE, 'glass_pane', 'Glass Pane', 'A thin sheet of glass that links to panes, bars, walls and solid blocks.', { faces: ALL('glass'), render: 'bars', hardness: 0.3, drops: null, sound: 'glass', ...CONN });
COLORS.forEach((c, i) => {
  const n = COLOR_NAMES[c];
  def(STAINED_PANE_BASE + i, `${c}_stained_glass_pane`, `${n} Stained Glass Pane`, 'A thin sheet of coloured glass.', { faces: ALL(`${c}_stained_glass`), render: 'bars', hardness: 0.3, drops: null, sound: 'glass', ...CONN });
});
{
  const { id: _a, key: _b, name: _c, desc: _d, ...slab } = defs[B.SLAB];
  const { id: _e, key: _f, name: _g, desc: _h, ...stairs } = defs[B.STAIRS];
  def(SLAB2, 'slab2', 'Slab', 'Half a block.', { ...slab, category: 'hidden' });
  def(STAIRS2, 'stairs2', 'Stairs', 'Climb without jumping.', { ...stairs, category: 'hidden' });
}

export function isWoodFence(id: number): boolean { return id >= FENCE_BASE && id < FENCE_BASE + 10; }
export function isGate(id: number): boolean { return id >= GATE_BASE && id < GATE_BASE + 10; }
export function isWall(id: number): boolean { return id >= WALL_BASE && id < WALL_BASE + 25; }
export function isPane(id: number): boolean { return id === B.IRON_BARS || id === GLASS_PANE || (id >= STAINED_PANE_BASE && id < STAINED_PANE_BASE + 16); }
export function isStainedPane(id: number): boolean { return id >= STAINED_PANE_BASE && id < STAINED_PANE_BASE + 16; }
export function isConnecting(id: number): boolean { return isWoodFence(id) || id === B.NETHER_BRICK_FENCE || isWall(id) || isPane(id); }
export function isSlabId(id: number): boolean { return id === B.SLAB || id === SLAB2; }
export function isStairsId(id: number): boolean { return id === B.STAIRS || id === STAIRS2; }
export function shapeMatIndex(v: number): number { const id = bid(v); return ((v >>> 8) & 31) + (id === SLAB2 || id === STAIRS2 ? 32 : 0); }

let faceTable: Uint8Array | null = null;
function solidFace(id: number): boolean {
  if (!faceTable) {
    faceTable = new Uint8Array(ID_LIMIT);
    for (const d of defs) {
      if (!d || !isBaseId(d.id) || !d.solid) continue;
      if ((d.render === 'cube' || d.render === 'glass' || d.render === 'translucent') && !/pumpkin|melon|shulker|leaves/.test(d.key)) faceTable[d.id] = 1;
    }
  }
  return faceTable[id] === 1;
}

const DIR4: [number, number][] = [[1, 0], [0, 1], [-1, 0], [0, -1]];
export function connMask(id: number, nb: (dx: number, dz: number) => number): number {
  let m = 0;
  for (let i = 0; i < 4; i++) {
    const [dx, dz] = DIR4[i];
    const nv = nb(dx, dz), n = bid(nv);
    if (!n) continue;
    let ok = false;
    if (isGate(n)) { const [fx] = FACING_DIRS[(nv >>> 8) & 3]; ok = !isPane(id) && (fx === 0 ? dx !== 0 : dz !== 0); }
    else if (isPane(id)) ok = isPane(n) || isWall(n) || solidFace(n);
    else if (isWall(id)) ok = isWall(n) || isPane(n) || solidFace(n);
    else if (isWoodFence(id)) ok = isWoodFence(n) || solidFace(n);
    else if (id === B.NETHER_BRICK_FENCE) ok = n === id || solidFace(n);
    if (ok) m |= 1 << i;
  }
  return m;
}

export function wallPost(mask: number, above: number, aboveMask: () => number): boolean {
  if (mask !== 5 && mask !== 10) return true;
  const a = bid(above);
  if (!a) return false;
  if (isWall(a)) { const am = aboveMask(); return am !== 5 && am !== 10; }
  const d = defs[a];
  return !!d && (d.solid || d.render === 'torch' || isLantern(a));
}

type CBox = [number, number, number, number, number, number];
const q16 = (b: number[]): CBox => b.map((n) => n / 16) as CBox;
export function connVisual(id: number, mask: number, post = true): CBox[] {
  if (isWall(id)) {
    const out: CBox[] = post ? [q16([4, 0, 4, 12, 16, 12])] : [];
    if (mask & 1) out.push(q16([8, 0, 5, 16, 14, 11]));
    if (mask & 2) out.push(q16([5, 0, 8, 11, 14, 16]));
    if (mask & 4) out.push(q16([0, 0, 5, 8, 14, 11]));
    if (mask & 8) out.push(q16([5, 0, 0, 11, 14, 8]));
    return out;
  }
  if (isPane(id)) {
    const out: CBox[] = [q16([7, 0, 7, 9, 16, 9])];
    if (mask & 1) out.push(q16([9, 0, 7, 16, 16, 9]));
    if (mask & 2) out.push(q16([7, 0, 9, 9, 16, 16]));
    if (mask & 4) out.push(q16([0, 0, 7, 7, 16, 9]));
    if (mask & 8) out.push(q16([7, 0, 0, 9, 16, 7]));
    return out;
  }
  return fenceBoxes([!!(mask & 1), !!(mask & 2), !!(mask & 4), !!(mask & 8)]);
}

export function connCollision(id: number, mask: number, post = true): CBox[] {
  const [a, b, h] = isWall(id) ? [5, 11, 24] : isPane(id) ? [7, 9, 16] : [6, 10, 24];
  const out: CBox[] = [];
  if (isWall(id) && post) out.push(q16([4, 0, 4, 12, 24, 12]));
  else out.push(q16([a, 0, a, b, h, b]));
  if (mask & 1) out.push(q16([b, 0, a, 16, h, b]));
  if (mask & 2) out.push(q16([a, 0, b, b, h, 16]));
  if (mask & 4) out.push(q16([0, 0, a, a, h, b]));
  if (mask & 8) out.push(q16([a, 0, 0, b, h, a]));
  return out;
}

export function connBounds(boxes: CBox[]): CBox {
  return [Math.min(...boxes.map((b) => b[0])), 0, Math.min(...boxes.map((b) => b[2])), Math.max(...boxes.map((b) => b[3])), Math.min(1, Math.max(...boxes.map((b) => b[4]))), Math.max(...boxes.map((b) => b[5]))];
}

export function gateRot(b: number[], f: number): CBox {
  const pt = (x: number, z: number): [number, number] => f === 2 ? [x, z] : f === 0 ? [16 - x, 16 - z] : f === 1 ? [z, 16 - x] : [16 - z, x];
  const [x0, z0] = pt(b[0], b[2]), [x1, z1] = pt(b[3], b[5]);
  return q16([Math.min(x0, x1), b[1], Math.min(z0, z1), Math.max(x0, x1), b[4], Math.max(z0, z1)]);
}

const GATE_CLOSED = [[0, 5, 7, 2, 16, 9], [14, 5, 7, 16, 16, 9], [6, 6, 7, 8, 15, 9], [8, 6, 7, 10, 15, 9], [2, 6, 7, 6, 9, 9], [2, 12, 7, 6, 15, 9], [10, 6, 7, 14, 9, 9], [10, 12, 7, 14, 15, 9]];
const GATE_OPENED = [[0, 5, 7, 2, 16, 9], [14, 5, 7, 16, 16, 9], [0, 6, 13, 2, 15, 15], [14, 6, 13, 16, 15, 15], [0, 6, 9, 2, 9, 13], [0, 12, 9, 2, 15, 13], [14, 6, 9, 16, 9, 13], [14, 12, 9, 16, 15, 13]];
export function gateVisual(meta: number, lowered = false): CBox[] {
  const f = meta & 3, dy = lowered ? 3 : 0;
  return (meta & GATE_OPEN ? GATE_OPENED : GATE_CLOSED).map((b) => gateRot([b[0], b[1] - dy, b[2], b[3], b[4] - dy, b[5]], f));
}
export function gateCollision(meta: number): CBox[] {
  return meta & GATE_OPEN ? [] : [gateRot([0, 0, 6, 16, 24, 10], meta & 3)];
}

export const CAVE_TEX = [
  ...['up', 'down'].flatMap((d) => DRIP_THICK.map((t) => `pointed_dripstone_${d}_${t}`)),
  'cave_vines', 'cave_vines_lit', 'cave_vines_plant', 'cave_vines_plant_lit', 'spore_blossom', 'spore_blossom_base',
  'big_dripleaf_top', 'big_dripleaf_side', 'big_dripleaf_stem', 'small_dripleaf_top', 'small_dripleaf_side', 'small_dripleaf_stem_top', 'small_dripleaf_stem_bottom',
  'sculk_vein', 'sculk_sensor_tendril_inactive', 'sculk_sensor_tendril_active', 'sculk_shrieker_inner_top', 'sculk_shrieker_can_summon_inner_top', 'azalea_top', 'flowering_azalea_top', 'azalea_plant',
];

export const BLOCKS: BlockDef[] = defs;

export const BLOCK_BY_KEY = new Map<string, BlockDef>(defs.filter(Boolean).map((d) => [d.key, d] as [string, BlockDef]));

export function blockId(v: number): number { return (v & 0xff) | ((v >>> 8) & 0xf00); }
export function blockMeta(v: number): number { return (v >>> 8) & 0xff; }
export function makeBlock(id: number, meta = 0): number { return (id & 0xff) | ((meta & 0xff) << 8) | ((id & 0xf00) << 8); }

const solidTable = new Uint8Array(ID_LIMIT);
const opaqueTable = new Uint8Array(ID_LIMIT);
const filterTable = new Uint8Array(ID_LIMIT);
const emitTable = new Uint8Array(ID_LIMIT);
for (const d of defs) {
  if (!d || !isBaseId(d.id)) continue;
  solidTable[d.id] = d.solid ? 1 : 0;
  opaqueTable[d.id] = d.opaque ? 1 : 0;
  filterTable[d.id] = d.lightFilter;
  emitTable[d.id] = d.lightEmit;
}
export const SOLID = solidTable;
export const OPAQUE = opaqueTable;
export const LIGHT_FILTER = filterTable;
export const LIGHT_EMIT = emitTable;
export function emitOf(v: number): number {
  const id = bid(v);
  if (id === CB.RESPAWN_ANCHOR) return ANCHOR_LIGHT[Math.min(4, (v >>> 8) & 7)];
  if (id === CB.CAMPFIRE || id === CB.SOUL_CAMPFIRE) return ((v >>> 8) & CAMPFIRE_LIT) ? emitTable[id] : 0;
  return emitTable[id];
}

export function getBlock(id: number): BlockDef {
  const b = (id & 0xff) | ((id >>> 8) & 0xf00);
  if (b === 218) return defs[XB + ((id >>> 8) & 0xff)] ?? defs[218];
  const s = (id >>> 12) & 15;
  if (s) { const t = SPMAP[b * 16 + s]; if (t) return defs[t]; }
  return defs[b] ?? defs[0];
}

export function isSolid(v: number): boolean {
  return solidTable[bid(v)] === 1;
}

export function isFluid(v: number): boolean {
  const id = bid(v);
  return id === B.WATER || id === B.LAVA;
}

export function isReplaceable(v: number): boolean {
  return defs[bid(v)]?.replaceable ?? true;
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

const BLAST: Record<string, number> = {
  stone: 6, grass: 0.6, dirt: 0.5, cobblestone: 6, oak_planks: 3, birch_planks: 3, spruce_planks: 3, jungle_planks: 3, bedrock: 3600000,
  sand: 0.5, gravel: 0.6, clay: 0.6, snow_block: 0.2, ice: 0.5, packed_ice: 0.5, water: 100, lava: 100,
  oak_log: 2, birch_log: 2, spruce_log: 2, jungle_log: 2, oak_leaves: 0.2, birch_leaves: 0.2, spruce_leaves: 0.2, jungle_leaves: 0.2,
  enchanting_table: 1200, anvil: 1200, lapis_block: 3, ext_block: 0.4, nether_portal: 0, fire: 0, crying_obsidian: 1200, magma_block: 0.5, iron_bars: 6, nether_brick_fence: 6, blast_furnace: 3.5, smoker: 3.5, stonecutter: 3.5, lantern: 3.5, bell: 5, grindstone: 6, cauldron: 2, nether_wart: 0, ancient_debris: 1200, cinderite_block: 1200, gilded_blackstone: 6, cracked_polished_blackstone_bricks: 6, chiseled_polished_blackstone: 6, smithing_table: 2.5,
  netherrack: 0.4, nether_quartz_ore: 3, nether_gold_ore: 3, blackstone: 6, soul_sand: 0.5, soul_soil: 0.5, nether_bricks: 6, basalt: 4.2, polished_blackstone: 6, polished_blackstone_bricks: 6, quartz_block: 0.8,
  coal_ore: 3, iron_ore: 3, gold_ore: 3, aetherite_ore: 3, copper_ore: 3, redstone_ore: 3, emerald_ore: 3, lapis_ore: 3,
  sandstone: 0.8, cut_sandstone: 0.8, chiseled_sandstone: 0.8, smooth_sandstone: 6, cactus: 0.4, crafting_table: 2.5, furnace: 3.5, furnace_lit: 3.5,
  chest: 2.5, glass: 0.3, bricks: 6, stone_bricks: 6, mossy_stone_bricks: 6, cracked_stone_bricks: 6, chiseled_stone_bricks: 6, oak_door: 3, ladder: 0.4,
  iron_block: 6, gold_block: 6, aetherite_block: 6, emerald_block: 6, coal_block: 6, copper_block: 6, cut_copper: 6, copper_lamp: 6,
  mossy_cobblestone: 6, obsidian: 1200, snowy_grass: 0.6, glowstone: 0.3, mud: 0.5, farmland: 0.6, bookshelf: 1.5, lily_pad: 0,
  smooth_stone: 6, terracotta: 4.2, bone_block: 2, hay_block: 0.5, tuff: 6, tuff_bricks: 6, chiseled_tuff: 6, polished_tuff: 6,
  spawner: 5, trial_spawner: 50, vault: 50, kelp: 0, kelp_plant: 0, seagrass: 0, vine: 0.2, torch: 0, redstone_wire: 0, redstone_torch: 0,
  unlit_redstone_torch: 0, lever: 0.5, stone_button: 0.5, oak_button: 0.5, stone_pressure_plate: 0.5, oak_pressure_plate: 0.5,
  redstone_block: 6, redstone_lamp: 0.3, redstone_lamp_lit: 0.3, repeater: 0, comparator: 0, observer: 3, piston: 1.5, sticky_piston: 1.5,
  piston_head: 1.5, moving_piston: 1.5, hopper: 4.8, dropper: 3.5, dispenser: 3.5, slime_block: 0, honey_block: 0, tnt: 0,
  rail: 0.7, powered_rail: 0.7, detector_rail: 0.7, activator_rail: 0.7, white_wool: 0.8, red_wool: 0.8, yellow_wool: 0.8,
};

export const BLAST_RES = new Float32Array(ID_LIMIT);
for (const b of BLOCKS) {
  if (!b) continue;
  const k = b.key;
  let r = BLAST[k];
  if (r === undefined) {
    if (k.endsWith('_wool')) r = 0.8;
    else if (k.endsWith('_concrete_powder')) r = 0.5;
    else if (k.endsWith('_concrete')) r = 1.8;
    else if (k.endsWith('_terracotta')) r = 4.2;
    else if (k.endsWith('_glass')) r = 0.3;
    else if (k.endsWith('_ore')) r = 3;
    else if (b.hardness < 0) r = 3600000;
    else if (b.render === 'cross' || b.render === 'crop' || b.render === 'torch') r = 0;
    else if (b.fluid) r = 100;
    else r = b.tool === 'pickaxe' && b.hardness >= 1.5 ? 6 : b.hardness;
  }
  BLAST_RES[b.id] = r;
}

export const SHAPE_MATS: { id: number; key: string; name: string }[] = [
  { id: B.OAK_PLANKS, key: 'oak', name: 'Oak' }, { id: B.BIRCH_PLANKS, key: 'birch', name: 'Birch' }, { id: B.SPRUCE_PLANKS, key: 'spruce', name: 'Spruce' },
  { id: B.JUNGLE_PLANKS, key: 'jungle', name: 'Jungle' }, { id: B.COBBLESTONE, key: 'cobblestone', name: 'Cobblestone' }, { id: B.STONE, key: 'stone', name: 'Stone' },
  { id: B.SMOOTH_STONE, key: 'smooth_stone', name: 'Smooth Stone' }, { id: B.STONE_BRICKS, key: 'stone_brick', name: 'Stone Brick' },
  { id: B.MOSSY_COBBLESTONE, key: 'mossy_cobblestone', name: 'Mossy Cobblestone' }, { id: B.MOSSY_STONE_BRICKS, key: 'mossy_stone_brick', name: 'Mossy Stone Brick' },
  { id: B.BRICKS, key: 'brick', name: 'Brick' }, { id: B.SANDSTONE, key: 'sandstone', name: 'Sandstone' }, { id: B.CUT_SANDSTONE, key: 'cut_sandstone', name: 'Cut Sandstone' },
  { id: B.SMOOTH_SANDSTONE, key: 'smooth_sandstone', name: 'Smooth Sandstone' }, { id: B.TUFF, key: 'tuff', name: 'Tuff' }, { id: B.POLISHED_TUFF, key: 'polished_tuff', name: 'Polished Tuff' },
  { id: B.TUFF_BRICKS, key: 'tuff_brick', name: 'Tuff Brick' }, { id: B.CUT_COPPER, key: 'cut_copper', name: 'Cut Copper' },
  { id: 600 + 6, key: 'nether_brick', name: 'Nether Brick' },
  { id: 600 + 9, key: 'polished_blackstone_brick', name: 'Polished Blackstone Brick' }, { id: 600 + 3, key: 'blackstone', name: 'Blackstone' },
  { id: SPB, key: 'acacia', name: 'Acacia' }, { id: SPB + 4, key: 'dark_oak', name: 'Dark Oak' }, { id: SPB + 12, key: 'cherry', name: 'Cherry' }, { id: SPB + 16, key: 'mangrove', name: 'Mangrove' },
  { id: CB.PURPUR_BLOCK, key: 'purpur', name: 'Purpur' }, { id: CB.END_STONE_BRICKS, key: 'end_stone_brick', name: 'End Stone Brick' },
  { id: XB + XV.GRANITE, key: 'granite', name: 'Granite' }, { id: XB + XV.POLISHED_GRANITE, key: 'polished_granite', name: 'Polished Granite' },
  { id: XB + XV.DIORITE, key: 'diorite', name: 'Diorite' }, { id: XB + XV.POLISHED_DIORITE, key: 'polished_diorite', name: 'Polished Diorite' },
  { id: XB + XV.ANDESITE, key: 'andesite', name: 'Andesite' }, { id: XB + XV.POLISHED_ANDESITE, key: 'polished_andesite', name: 'Polished Andesite' },
  { id: CB.COBBLED_DEEPSLATE, key: 'cobbled_deepslate', name: 'Cobbled Deepslate' }, { id: NB.POLISHED_DEEPSLATE, key: 'polished_deepslate', name: 'Polished Deepslate' },
  { id: NB.DEEPSLATE_BRICKS, key: 'deepslate_brick', name: 'Deepslate Brick' }, { id: NB.DEEPSLATE_TILES, key: 'deepslate_tile', name: 'Deepslate Tile' },
  { id: SB.RED_SANDSTONE, key: 'red_sandstone', name: 'Red Sandstone' }, { id: NB.SMOOTH_RED_SANDSTONE, key: 'smooth_red_sandstone', name: 'Smooth Red Sandstone' },
  { id: NB.CUT_RED_SANDSTONE, key: 'cut_red_sandstone', name: 'Cut Red Sandstone' }, { id: XB + XV.QUARTZ_BLOCK, key: 'quartz', name: 'Quartz' },
  { id: NB.SMOOTH_QUARTZ, key: 'smooth_quartz', name: 'Smooth Quartz' }, { id: NB.PRISMARINE, key: 'prismarine', name: 'Prismarine' },
  { id: NB.PRISMARINE_BRICKS, key: 'prismarine_brick', name: 'Prismarine Brick' }, { id: NB.DARK_PRISMARINE, key: 'dark_prismarine', name: 'Dark Prismarine' },
  { id: NB.MUD_BRICKS, key: 'mud_brick', name: 'Mud Brick' }, { id: NB.RED_NETHER_BRICKS, key: 'red_nether_brick', name: 'Red Nether Brick' },
  { id: XB + XV.CRIMSON_PLANKS, key: 'crimson', name: 'Crimson' }, { id: XB + XV.WARPED_PLANKS, key: 'warped', name: 'Warped' },
  { id: XB + XV.POLISHED_BLACKSTONE, key: 'polished_blackstone', name: 'Polished Blackstone' },
];
export const SLAB_ITEM = 400, STAIRS_ITEM = 440, SLAB_TOP = 32, STAIRS_UP = 128;
export function slabItem(i: number): number { return i < 21 ? SLAB_ITEM + i : i < 27 ? 470 + (i - 21) : 520 + (i - 27); }
export function stairsItem(i: number): number { return i < 21 ? STAIRS_ITEM + i : i < 27 ? 480 + (i - 21) : 700 + (i - 27); }
export function shapeBlock(i: number, stairs: boolean, meta = 0): number { return makeBlock(i < 32 ? (stairs ? B.STAIRS : B.SLAB) : (stairs ? STAIRS2 : SLAB2), (i & 31) | meta); }

export function shapeBoxes(v: number): [number, number, number, number, number, number][] {
  const id = bid(v), m = (v >>> 8) & 0xff;
  if (id === B.SLAB || id === SLAB2) return [m & SLAB_TOP ? [0, 0.5, 0, 1, 1, 1] : [0, 0, 0, 1, 0.5, 1]];
  const up = !!(m & STAIRS_UP), [dx, dz] = FACING_DIRS[(m >> 5) & 3];
  const base: [number, number, number, number, number, number] = up ? [0, 0.5, 0, 1, 1, 1] : [0, 0, 0, 1, 0.5, 1];
  const y0 = up ? 0 : 0.5, y1 = up ? 0.5 : 1;
  const x0 = dx > 0 ? 0.5 : 0, x1 = dx < 0 ? 0.5 : 1, z0 = dz > 0 ? 0.5 : 0, z1 = dz < 0 ? 0.5 : 1;
  return [base, [x0, y0, z0, x1, y1, z1]];
}

type Box = [number, number, number, number, number, number];
export function fenceBoxes(n: [boolean, boolean, boolean, boolean]): Box[] {
  const p0 = 6 / 16, p1 = 10 / 16, r0 = 7 / 16, r1 = 9 / 16;
  const out: Box[] = [[p0, 0, p0, p1, 1, p1]];
  for (const [y0, y1] of [[6 / 16, 9 / 16], [12 / 16, 15 / 16]]) {
    if (n[0]) out.push([p1, y0, r0, 1, y1, r1]);
    if (n[1]) out.push([r0, y0, p1, r1, y1, 1]);
    if (n[2]) out.push([0, y0, r0, p0, y1, r1]);
    if (n[3]) out.push([r0, y0, 0, r1, y1, p0]);
  }
  return out;
}

export const CUSTOM_BOX = new Uint8Array(ID_LIMIT);
export function customBoxes(v: number): Box[] {
  const id = bid(v);
  if (id === B.ENCHANTING_TABLE) return [[0, 0, 0, 1, 0.75, 1]];
  const p = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Box => [x0 / 16, y0 / 16, z0 / 16, x1 / 16, y1 / 16, z1 / 16];
  switch (id) {
    case B.COMPOSTER: return [p(0, 0, 0, 16, 2, 16), p(0, 2, 0, 2, 16, 16), p(14, 2, 0, 16, 16, 16), p(2, 2, 0, 14, 16, 2), p(2, 2, 14, 14, 16, 16), ...(((v >>> 8) & 15) > 0 ? [p(2, 2, 2, 14, 2 + Math.min(8, (v >>> 8) & 15) * 1.6, 14)] : [])];
    case B.LECTERN: return [p(0, 0, 0, 16, 2, 16), p(4, 2, 4, 12, 13, 12), p(0, 13, 0, 16, 16, 16)];
    case B.BREWING_STAND: return [p(1, 0, 1, 15, 2, 15), p(7, 2, 7, 9, 14, 9), p(2, 2, 6, 6, 9, 10), p(10, 2, 2, 14, 9, 6), p(10, 2, 10, 14, 9, 14)];
    case B.STONECUTTER: return [p(0, 0, 0, 16, 9, 16)];
    case B.CAULDRON: return [p(0, 3, 0, 16, 4, 16), p(0, 4, 0, 2, 16, 16), p(14, 4, 0, 16, 16, 16), p(2, 4, 0, 14, 16, 2), p(2, 4, 14, 14, 16, 16), p(0, 0, 0, 4, 3, 4), p(12, 0, 0, 16, 3, 4), p(0, 0, 12, 4, 3, 16), p(12, 0, 12, 16, 3, 16)];
    case B.GRINDSTONE: return [p(4, 4, 2, 12, 16, 14), p(2, 0, 6, 4, 13, 10), p(12, 0, 6, 14, 13, 10)];
    case B.BELL: return [p(4, 3, 4, 12, 10, 12), p(5, 10, 5, 11, 12, 11), p(3, 2, 3, 13, 3, 13), p(7, 12, 7, 9, 16, 9)];
    case B.LANTERN: case CB.SOUL_LANTERN: return ((v >>> 8) & LANTERN_HANGING) ? [p(5, 1, 5, 11, 8, 11), p(6, 8, 6, 10, 10, 10), p(7, 10, 7, 9, 16, 9)] : [p(5, 0, 5, 11, 7, 11), p(6, 7, 6, 10, 9, 10), p(7, 9, 7, 9, 11, 9)];
    case CB.CAMPFIRE: case CB.SOUL_CAMPFIRE: return [p(0, 0, 0, 16, 7, 16)];
    case CB.RESPAWN_ANCHOR: return [p(0, 0, 0, 16, 16, 16)];
    case B.CAKE: { const b = Math.min(6, (v >>> 8) & 7); return [p(1 + b * 2, 0, 1, 15, 8, 15)]; }
    case CB.MOSS_CARPET: return [p(0, 0, 0, 16, 1, 16)];
    case CB.SCULK_SENSOR: case CB.SCULK_SHRIEKER: return [p(0, 0, 0, 16, 8, 16)];
    case CB.BIG_DRIPLEAF: return ((v >>> 8) & 15) >> DL_TILT_SHIFT >= 2 ? [] : [p(0, 11, 0, 16, 15, 16)];
    case CB.END_ROD: return [p(6, 0, 6, 10, 1, 10), p(7, 1, 7, 9, 16, 9)];
    case CB.CHORUS_PLANT: { const m = (v >>> 8) & 63; const out = [p(4, 4, 4, 12, 12, 12)]; if (m & 1) out.push(p(12, 4, 4, 16, 12, 12)); if (m & 2) out.push(p(0, 4, 4, 4, 12, 12)); if (m & 4) out.push(p(4, 12, 4, 12, 16, 12)); if (m & 8) out.push(p(4, 0, 4, 12, 4, 12)); if (m & 16) out.push(p(4, 4, 12, 12, 12, 16)); if (m & 32) out.push(p(4, 4, 0, 12, 12, 4)); return out; }
    case CB.CHORUS_FLOWER: return [p(2, 0, 2, 14, 14, 14), p(0, 2, 2, 16, 14, 14), p(2, 2, 0, 14, 14, 16), p(2, 14, 2, 14, 16, 14)];
    case CB.END_PORTAL_FRAME: return ((v >>> 8) & FRAME_EYE) ? [p(0, 0, 0, 16, 13, 16), p(4, 13, 4, 12, 16, 12)] : [p(0, 0, 0, 16, 13, 16)];
    case CB.END_PORTAL: return [p(0, 0, 0, 16, 12, 16)];
    case CB.DRAGON_EGG: return [p(6, 15, 6, 10, 16, 10), p(5, 14, 5, 11, 15, 11), p(4, 13, 4, 12, 14, 12), p(3, 11, 3, 13, 13, 13), p(2, 8, 2, 14, 11, 14), p(1, 3, 1, 15, 8, 15), p(2, 1, 2, 14, 3, 14), p(3, 0, 3, 13, 1, 13)];
    case CB.DRAGON_HEAD: return [p(4, 0, 4, 12, 8, 12)];
    case CB.POINTED_DRIPSTONE: { const t = (v >>> 8) & 7, dn = ((v >>> 8) & DRIP_DOWN) !== 0, r = t <= 1 ? 3 : t === 2 ? 4 : t === 3 ? 5 : 6; return [p(8 - r, t === 1 && dn ? 5 : 0, 8 - r, 8 + r, t === 1 && !dn ? 11 : 16, 8 + r)]; }
  }
  if (id === B.ANVIL) {
    const ew = ((v >>> 8) & 1) === 1;
    const b = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Box => ew ? [z0 / 16, y0 / 16, x0 / 16, z1 / 16, y1 / 16, x1 / 16] : [x0 / 16, y0 / 16, z0 / 16, x1 / 16, y1 / 16, z1 / 16];
    return [b(2, 0, 2, 14, 4, 14), b(4, 4, 3, 12, 5, 13), b(6, 5, 4, 10, 10, 12), b(3, 10, 0, 13, 16, 16)];
  }
  return [];
}

export function isSoulSand(v: number): boolean { return bid(v) === B.EXT && ((v >>> 8) & 0xff) === XV.SOUL_SAND; }

export function isFullCube(v: number): boolean {
  const bs = blockBoxes(v);
  return !!bs && bs.some((b) => b[0] <= 0 && b[1] <= 0 && b[2] <= 0 && b[3] >= 1 && b[4] >= 1 && b[5] >= 1);
}

export function blockBoxes(v: number): [number, number, number, number, number, number][] | null {
  const id = bid(v);
  if (id === B.SLAB || id === B.STAIRS || id === SLAB2 || id === STAIRS2) return shapeBoxes(v);
  if (CUSTOM_BOX[id]) return customBoxes(v);
  if (isGate(id)) return gateCollision((v >>> 8) & 0xff);
  if (isConnecting(id)) return connCollision(id, 0);
  const b = blockBox(v);
  return b ? [b] : null;
}

export function blockBox(v: number): [number, number, number, number, number, number] | null {
  const id = bid(v);
  const d = defs[id];
  if (!d) return null;
  if (id === B.OAK_DOOR && ((v >>> 12) & 15) >= TD_SPECIES_MIN) return trapdoorBox(v >>> 8);
  if (id === B.OAK_DOOR) {
    const m = v >>> 8;
    let f = doorFacing(m);
    if (m & DOOR_OPEN) f = (f + 1) & 3;
    return edgeBox(f, 3 / 16);
  }
  if (id === B.CACTUS) return [1 / 16, 0, 1 / 16, 15 / 16, 1, 15 / 16];
  if (id === B.CHEST) return [1 / 16, 0, 1 / 16, 15 / 16, 14 / 16, 15 / 16];
  if (id === B.SLAB || id === SLAB2) return shapeBoxes(v)[0];
  if (isGate(id)) return (v >>> 8) & GATE_OPEN ? null : gateRot([0, 0, 6, 16, 16, 10], (v >>> 8) & 3);
  if (id === B.ENCHANTING_TABLE) return [0, 0, 0, 1, 0.75, 1];
  if (id === B.MUD || isSoulSand(v)) return [0, 0, 0, 1, 14 / 16, 1];
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
  const id = bid(v);
  const d = defs[id];
  if (!d || id === 0 || d.fluid) return null;
  if (id === B.ANVIL) return (v >>> 8) & 1 ? [0, 0, 2 / 16, 1, 1, 14 / 16] : [2 / 16, 0, 0, 14 / 16, 1, 1];
  if (id >= WIDE_BASE && CUSTOM_BOX[id]) {
    const bs = id === CB.BIG_DRIPLEAF ? [[0, 11 / 16, 0, 1, 15 / 16, 1]] : customBoxes(v);
    if (bs.length) return [Math.min(...bs.map((b) => b[0])), Math.min(...bs.map((b) => b[1])), Math.min(...bs.map((b) => b[2])), Math.max(...bs.map((b) => b[3])), Math.max(...bs.map((b) => b[4])), Math.max(...bs.map((b) => b[5]))];
  }
  if (id === CB.SCULK_VEIN) return [0, 0, 0, 1, 1 / 16, 1];
  if (id === B.MUD || isSoulSand(v)) return [0, 0, 0, 1, 1, 1];
  if (isGate(id)) return gateRot([0, 0, 6, 16, 16, 10], (v >>> 8) & 3);
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
    case 'rail': { const sh = (v >>> 8) & 15; return [0, 0, 0, 1, sh >= 2 && sh <= 5 ? 0.5 : 2 / 16, 1]; }
    default: return [0, 0, 0, 1, 1, 1];
  }
}

for (const id of [B.ENCHANTING_TABLE, B.ANVIL, B.COMPOSTER, B.LECTERN, B.BREWING_STAND, B.STONECUTTER, B.CAULDRON, B.GRINDSTONE, B.BELL, B.LANTERN, B.CAKE, CB.MOSS_CARPET, CB.SCULK_SENSOR, CB.SCULK_SHRIEKER, CB.BIG_DRIPLEAF, CB.POINTED_DRIPSTONE, CB.END_ROD, CB.CHORUS_PLANT, CB.CHORUS_FLOWER, CB.END_PORTAL_FRAME, CB.END_PORTAL, CB.DRAGON_EGG, CB.DRAGON_HEAD, CB.SOUL_LANTERN, CB.CAMPFIRE, CB.SOUL_CAMPFIRE, CB.RESPAWN_ANCHOR]) CUSTOM_BOX[id] = 1;
export const CROPS: Record<number, { max: number; tex: string; stages: number[] }> = {
  [B.WHEAT]: { max: 7, tex: 'wheat', stages: [0, 1, 2, 3, 4, 5, 6, 7] },
  [B.CARROTS]: { max: 7, tex: 'carrots', stages: [0, 0, 1, 1, 2, 2, 2, 3] },
  [B.POTATOES]: { max: 7, tex: 'potatoes', stages: [0, 0, 1, 1, 2, 2, 2, 3] },
  [B.BEETROOTS]: { max: 3, tex: 'beetroots', stages: [0, 1, 2, 3] },
};
export const SPRITE_BLOCKS = ['hopper', 'lantern', 'soul_lantern', 'campfire', 'soul_campfire'];

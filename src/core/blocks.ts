export type RenderType =
  | 'none' | 'cube' | 'leaves' | 'glass' | 'translucent' | 'liquid'
  | 'cross' | 'crop' | 'torch' | 'door' | 'ladder' | 'cactus' | 'chest';

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
  needsSupport: 'soil' | 'sand' | 'solid' | 'farmland' | 'water-edge' | 'cactus' | null;
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
  LILY_PAD: 68,
} as const;

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
def(21, 'jungle_leaves', 'Jungle Leaves', 'Broad, dense leaves.', { faces: ALL('jungle_leaves'), ...LEAVES, tint: 'foliage', drops: [{ item: 58, chance: 0.03 }, { item: 256, chance: 0.02 }] });
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
    default: return [0, 0, 0, 1, 1, 1];
  }
}

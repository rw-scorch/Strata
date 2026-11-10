import { BLOCKS, B, ToolType } from './blocks';

export type ItemKind = 'block' | 'tool' | 'food' | 'armor' | 'material' | 'bucket' | 'placer';
export type CreativeTab = 'building' | 'nature' | 'functional' | 'tools' | 'combat' | 'food' | 'materials';

export interface ToolInfo { type: ToolType; tier: number; speed: number; damage: number; durability: number; }
export interface FoodInfo { hunger: number; saturation: number; }
export interface ArmorInfo { slot: 0 | 1 | 2 | 3; points: number; durability: number; }

export interface ItemDef {
  id: number;
  key: string;
  name: string;
  desc: string;
  kind: ItemKind;
  maxStack: number;
  texture: string;
  blockIcon: boolean;
  places?: number;
  tool?: ToolInfo;
  food?: FoodInfo;
  armor?: ArmorInfo;
  fuel?: number;
  tab: CreativeTab;
  tint?: number;
}

export const I = {
  STICK: 256, APPLE: 258, COAL: 260, CHARCOAL: 261, IRON_INGOT: 262, FLINT: 263, AETHERITE: 264,
  GOLD_INGOT: 265, FEATHER: 266, STRING: 267, BONE: 268, LEATHER: 269, RAW_PORK: 270, COOKED_PORK: 271,
  RAW_MUTTON: 272, COOKED_MUTTON: 273, RAW_POULTRY: 274, COOKED_POULTRY: 275, SEEDS: 276, WHEAT: 277,
  BREAD: 278, CLAY_BALL: 279, DOOR: 280, BRICK: 281, BUCKET: 282, WATER_BUCKET: 283, LAVA_BUCKET: 284,
  ROTTEN_FLESH: 285, PAPER: 286, BOOK: 287, RED_DYE: 288, YELLOW_DYE: 289, ARROW: 290, GOLDEN_APPLE: 291, BOWL: 292, MUSHROOM_STEW: 293,
} as const;

export const TOOL_MATERIALS = ['wood', 'stone', 'iron', 'gold', 'aetherite'] as const;
export const TOOL_TYPES: ToolType[] = ['pickaxe', 'axe', 'shovel', 'sword', 'hoe'];
export const ARMOR_MATERIALS = ['leather', 'iron', 'gold', 'aetherite'] as const;
export const ARMOR_SLOTS = ['helmet', 'chestplate', 'leggings', 'boots'] as const;

export function toolId(material: number, type: number): number { return 300 + material * 5 + type; }
export function armorId(material: number, slot: number): number { return 330 + material * 4 + slot; }

const items: ItemDef[] = [];
export const ITEMS = items;

function add(d: Omit<ItemDef, 'blockIcon' | 'maxStack' | 'tab'> & Partial<Pick<ItemDef, 'blockIcon' | 'maxStack' | 'tab'>>): void {
  items[d.id] = { blockIcon: false, maxStack: 64, tab: 'materials', ...d };
}

const TAB_FOR_CATEGORY: Record<string, CreativeTab> = {
  building: 'building', nature: 'nature', functional: 'functional', ore: 'nature', plants: 'nature', hidden: 'nature',
};

for (const b of BLOCKS) {
  if (!b || b.id === 0) continue;
  const flat = b.render === 'cross' || b.render === 'crop' || b.render === 'torch' || b.render === 'ladder' || b.render === 'door';
  add({
    id: b.id, key: b.key, name: b.name, desc: b.desc, kind: 'block', places: b.id,
    texture: b.render === 'door' ? 'oak_door_item' : b.faces.pz, blockIcon: !flat, tab: TAB_FOR_CATEGORY[b.category] ?? 'building',
  });
}

const mat = (id: number, key: string, name: string, desc: string, extra: Partial<ItemDef> = {}) =>
  add({ id, key, name, desc, kind: 'material', texture: key, ...extra });

mat(I.STICK, 'stick', 'Stick', 'Handles for tools and torches.', { fuel: 5 });
mat(I.COAL, 'coal', 'Coal', 'Burns hot and long. Fuels furnaces and torches.', { fuel: 80 });
mat(I.CHARCOAL, 'charcoal', 'Charcoal', 'Smelted wood. Burns like coal.', { fuel: 80 });
mat(I.IRON_INGOT, 'iron_ingot', 'Iron Ingot', 'Forged from ore. Strong tools await.');
mat(I.GOLD_INGOT, 'gold_ingot', 'Gold Ingot', 'Soft but swift. Gold tools mine fast and wear quickly.');
mat(I.AETHERITE, 'aetherite', 'Aetherite Shard', 'A crystal from the deep strata. The finest tool material.');
mat(I.FLINT, 'flint', 'Flint', 'A sharp stone knapped from gravel.');
mat(I.FEATHER, 'feather', 'Feather', 'Plucked from a Fernhen. Fletches arrows.');
mat(I.STRING, 'string', 'Silk Thread', 'Spun by a Duskweaver. Strong and fine.');
mat(I.BONE, 'bone', 'Bone', 'Left behind by a Rattlebone.');
mat(I.LEATHER, 'leather', 'Hide', 'Tough Mudsnout hide for armour and books.');
mat(I.SEEDS, 'wheat_seeds', 'Wheat Seeds', 'Plant on farmland near water.', { kind: 'placer', places: B.WHEAT });
mat(I.WHEAT, 'wheat', 'Wheat', 'Harvested grain. Bake into bread.');
mat(I.CLAY_BALL, 'clay_ball', 'Clay Lump', 'Fire in a furnace to make a brick.');
mat(I.BRICK, 'brick', 'Brick', 'A fired clay brick.');
mat(I.PAPER, 'paper', 'Paper', 'Pressed sugar cane sheets.');
mat(I.BOOK, 'book', 'Book', 'Bound in hide. Shelve them as you please.');
mat(I.RED_DYE, 'red_dye', 'Crimson Dye', 'Pressed from poppies.');
mat(I.YELLOW_DYE, 'yellow_dye', 'Saffron Dye', 'Pressed from dandelions.');
mat(I.ARROW, 'arrow', 'Arrow', 'Fletched with feather and flint.');
mat(I.ROTTEN_FLESH, 'rotten_flesh', 'Grave Flesh', 'Edible in a pinch, but it may sicken you.', { kind: 'food', food: { hunger: 4, saturation: 0.8 } });
add({ id: I.DOOR, key: 'oak_door_item', name: 'Oak Door', desc: 'Place on the ground. Tap to open and close.', kind: 'placer', places: B.OAK_DOOR, texture: 'oak_door_item', tab: 'functional' });
add({ id: I.BUCKET, key: 'bucket', name: 'Bucket', desc: 'Scoop up water or lava.', kind: 'bucket', texture: 'bucket', maxStack: 16, tab: 'tools' });
add({ id: I.WATER_BUCKET, key: 'water_bucket', name: 'Water Bucket', desc: 'Pour out a water source.', kind: 'bucket', texture: 'water_bucket', maxStack: 1, tab: 'tools' });
add({ id: I.LAVA_BUCKET, key: 'lava_bucket', name: 'Lava Bucket', desc: 'Pour out lava. Also a superb fuel.', kind: 'bucket', texture: 'lava_bucket', maxStack: 1, fuel: 1000, tab: 'tools' });

const food = (id: number, key: string, name: string, desc: string, hunger: number, saturation: number) =>
  add({ id, key, name, desc, kind: 'food', texture: key, food: { hunger, saturation }, tab: 'food' });
food(I.APPLE, 'apple', 'Apple', 'Crisp fruit from oak canopies.', 4, 2.4);
food(I.GOLDEN_APPLE, 'golden_apple', 'Golden Apple', 'An apple sealed in gold. Deeply restoring.', 4, 9.6);
food(I.MUSHROOM_STEW, 'mushroom_stew', 'Mushroom Stew', 'Warm and earthy.', 6, 7.2);
mat(I.BOWL, 'bowl', 'Bowl', 'Carved from planks. Holds stew.');
food(I.RAW_PORK, 'raw_pork', 'Raw Mudsnout Haunch', 'Better cooked.', 3, 1.8);
food(I.COOKED_PORK, 'cooked_pork', 'Roast Haunch', 'Hearty and filling.', 8, 12.8);
food(I.RAW_MUTTON, 'raw_mutton', 'Raw Woolhorn Chop', 'Better cooked.', 2, 1.2);
food(I.COOKED_MUTTON, 'cooked_mutton', 'Seared Chop', 'Savoury and satisfying.', 6, 9.6);
food(I.RAW_POULTRY, 'raw_poultry', 'Raw Fernhen', 'Better cooked.', 2, 1.2);
food(I.COOKED_POULTRY, 'cooked_poultry', 'Roast Fernhen', 'A traveller staple.', 6, 7.2);
food(I.BREAD, 'bread', 'Bread', 'Baked from three wheat.', 5, 6);

const TOOL_TIER = [1, 2, 3, 1, 4];
const TOOL_SPEED = [2, 4, 6, 12, 8];
const TOOL_DUR = [60, 132, 251, 33, 1562];
const TOOL_DMG_BASE = [0, 1, 2, 0, 3];
const TYPE_DMG = [2, 4, 1.5, 4, 1];
const MAT_NAMES = ['Wooden', 'Stone', 'Iron', 'Golden', 'Aetherite'];
const MAT_KEYS = ['wooden', 'stone', 'iron', 'golden', 'aetherite'];
const TYPE_NAMES = ['Pickaxe', 'Axe', 'Shovel', 'Sword', 'Hoe'];
const TYPE_DESC = [
  'Breaks stone and ore.', 'Fells trees and splits planks.', 'Digs dirt, sand and gravel.',
  'Strikes true against creatures.', 'Tills soil into farmland.',
];
for (let m = 0; m < 5; m++) {
  for (let t = 0; t < 5; t++) {
    const id = toolId(m, t);
    add({
      id, key: `${MAT_KEYS[m]}_${TOOL_TYPES[t]}`, name: `${MAT_NAMES[m]} ${TYPE_NAMES[t]}`,
      desc: TYPE_DESC[t], kind: 'tool', maxStack: 1, texture: `${MAT_KEYS[m]}_${TOOL_TYPES[t]}`,
      tool: { type: TOOL_TYPES[t], tier: TOOL_TIER[m], speed: TOOL_SPEED[m], damage: 1 + TYPE_DMG[t] + TOOL_DMG_BASE[m], durability: TOOL_DUR[m] },
      fuel: m === 0 ? 10 : undefined, tab: t === 3 ? 'combat' : 'tools',
    });
  }
}

const ARMOR_POINTS = [[1, 3, 2, 1], [2, 6, 5, 2], [2, 5, 3, 1], [3, 8, 6, 3]];
const ARMOR_DUR = [[55, 80, 75, 65], [165, 240, 225, 195], [77, 112, 105, 91], [363, 528, 495, 429]];
const ARMOR_MAT_NAMES = ['Hide', 'Iron', 'Golden', 'Aetherite'];
const ARMOR_SLOT_NAMES = ['Cap', 'Tunic', 'Greaves', 'Boots'];
const ARMOR_SLOT_NAMES_METAL = ['Helm', 'Cuirass', 'Greaves', 'Sabatons'];
for (let m = 0; m < 4; m++) {
  for (let s = 0; s < 4; s++) {
    const id = armorId(m, s);
    add({
      id, key: `${ARMOR_MATERIALS[m]}_${ARMOR_SLOTS[s]}`, name: `${ARMOR_MAT_NAMES[m]} ${m === 0 ? ARMOR_SLOT_NAMES[s] : ARMOR_SLOT_NAMES_METAL[s]}`,
      desc: `Wear for ${ARMOR_POINTS[m][s]} armour.`, kind: 'armor', maxStack: 1, texture: `${ARMOR_MATERIALS[m]}_${ARMOR_SLOTS[s]}`,
      armor: { slot: s as 0 | 1 | 2 | 3, points: ARMOR_POINTS[m][s], durability: ARMOR_DUR[m][s] }, tab: 'combat',
      tint: m === 0 ? 0xa06540 : undefined,
    });
  }
}

export const ITEM_LIST: ItemDef[] = items.filter(Boolean);
export const ITEM_BY_KEY = new Map<string, ItemDef>(ITEM_LIST.map((d) => [d.key, d]));

export function getItem(id: number): ItemDef | undefined {
  return items[id];
}

export function itemName(id: number): string {
  return items[id]?.name ?? `Unknown (${id})`;
}

export function maxStack(id: number): number {
  return items[id]?.maxStack ?? 64;
}

export function maxDurability(id: number): number {
  const d = items[id];
  return d?.tool?.durability ?? d?.armor?.durability ?? 0;
}

export function fuelSeconds(id: number): number {
  const d = items[id];
  if (!d) return 0;
  if (d.fuel) return d.fuel;
  if (d.kind === 'block') {
    const b = BLOCKS[id];
    if (b && b.sound === 'wood' && b.id !== B.TORCH) return 15;
  }
  return 0;
}

export const CREATIVE_HIDDEN = new Set<number>([B.WATER, B.LAVA, B.FURNACE_LIT, B.OAK_DOOR, B.WHEAT, B.FARMLAND]);

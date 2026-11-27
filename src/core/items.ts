import { BLOCKS, B, CB, ToolType, COLORS, COLOR_NAMES, DyeColor, SHAPE_MATS, slabItem, stairsItem, SLAB2, STAIRS2, SIGN_BASE, HANGING_SIGN_BASE, CHAIN } from './blocks';

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
  placeMeta?: number;
  tool?: ToolInfo;
  food?: FoodInfo;
  armor?: ArmorInfo;
  fuel?: number;
  durability?: number;
  tab: CreativeTab;
  tint?: number;
}

export const I = {
  GLOW_BERRIES: 4096,
  SHIELD: 490, ENDER_PEARL: 491,
  EYE_OF_ENDER: 492, END_CRYSTAL: 493, CHORUS_FRUIT: 494, POPPED_CHORUS_FRUIT: 495, SHULKER_SHELL: 496, ELYTRA: 497, FIREWORK_ROCKET: 498, DRAGON_BREATH: 499, EXPERIENCE_BOTTLE: 500, TOTEM: 508, SPLASH_HEALING: 509, BOAT_BASE: 510, CHEST_BOAT_BASE: 800, SIGN_BASE: 808, HANGING_SIGN_BASE: 816, CHAIN: 824, ITEM_FRAME: 501, GLOW_ITEM_FRAME: 502, HOPPER_MINECART: 503, CHEST_MINECART: 504, GLOW_INK_SAC: 505, PRISMARINE_SHARD: 506, PRISMARINE_CRYSTALS: 507,
  STICK: 256, APPLE: 258, COAL: 260, CHARCOAL: 261, IRON_INGOT: 262, FLINT: 263, AETHERITE: 264,
  GOLD_INGOT: 265, FEATHER: 266, STRING: 267, BONE: 268, LEATHER: 269, RAW_PORK: 270, COOKED_PORK: 271,
  RAW_MUTTON: 272, COOKED_MUTTON: 273, RAW_POULTRY: 274, COOKED_POULTRY: 275, SEEDS: 276, WHEAT: 277,
  BREAD: 278, CLAY_BALL: 279, DOOR: 280, BRICK: 281, BUCKET: 282, WATER_BUCKET: 283, LAVA_BUCKET: 284,
  ROTTEN_FLESH: 285, PAPER: 286, BOOK: 287, RED_DYE: 288, YELLOW_DYE: 289, ARROW: 290, GOLDEN_APPLE: 291, BOWL: 292, MUSHROOM_STEW: 293, BOW: 294, EMERALD: 295, BOW_PULL0: 296, BOW_PULL1: 297, BOW_PULL2: 298, BONE_MEAL: 299,
  COPPER_INGOT: 364, TRIAL_KEY: 365, INK_SAC: 366, COCOA_BEANS: 367, SHEARS: 368, COOKIE: 369, DRIED_KELP: 370, REDSTONE: 371, GUNPOWDER: 372, FLINT_AND_STEEL: 373, MINECART: 374, TNT_MINECART: 375, CROSSBOW: 376, CROSSBOW_PULL0: 377, CROSSBOW_PULL1: 378, CROSSBOW_PULL2: 379, CROSSBOW_LOADED: 380, MACE: 381, SPEAR: 382, ENCHANTED_BOOK: 388, LAPIS: 389, GOLD_NUGGET: 390, QUARTZ: 391, IRON_NUGGET: 392, TRIPWIRE_HOOK: 393, GHAST_TEAR: 394, MAGMA_CREAM: 395, BLAZE_ROD: 396, BLAZE_POWDER: 397, NETHER_WART: 398, WITHER_SKULL: 399, CINDERITE_SCRAP: 421, CINDERITE_INGOT: 422, UPGRADE_TEMPLATE: 423, SADDLE: 424, FUNGUS_STICK: 425,
  POTATO: 426, BAKED_POTATO: 427, CARROT: 428, BEETROOT: 429, BEETROOT_SEEDS: 430, BEETROOT_SOUP: 431, PUMPKIN_PIE: 432, MELON_SLICE: 433, GOLDEN_CARROT: 434, GLISTERING_MELON: 435, COMPASS: 436, CLOCK: 437, NAME_TAG: 438, GLASS_BOTTLE: 439, WRITABLE_BOOK: 461,
} as const;

const NEW_DYES = COLORS.filter((c) => c !== 'red' && c !== 'yellow');
export function dyeId(c: DyeColor): number { return c === 'red' ? 288 : c === 'yellow' ? 289 : 350 + NEW_DYES.indexOf(c); }

export const TOOL_MATERIALS = ['wood', 'stone', 'iron', 'gold', 'aetherite', 'cinderite'] as const;
export const TOOL_TYPES: ToolType[] = ['pickaxe', 'axe', 'shovel', 'sword', 'hoe'];
export const ARMOR_MATERIALS = ['leather', 'iron', 'gold', 'aetherite', 'cinderite'] as const;
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
  const flat = b.render === 'cross' || b.render === 'crop' || b.render === 'torch' || b.render === 'ladder' || b.render === 'door' || b.render === 'redstone' || b.render === 'rail' || b.render === 'fire' || b.render === 'portal' || b.render === 'bars' || b.render === 'cave';
  if (b.key === 'slab2' || b.key === 'stairs2' || b.render === 'sign' || b.key === 'chain') continue;
  if (b.render === 'fence' && b.id === B.NETHER_BRICK_FENCE) { add({ id: b.id, key: b.key, name: b.name, desc: b.desc, kind: 'block', places: b.id, texture: 'nether_brick_fence_item', blockIcon: false, tab: 'building' }); continue; }
  add({
    id: b.id, key: b.key, name: b.name, desc: b.desc, kind: 'block', places: b.ext !== undefined ? 218 : b.species ? b.species.base : b.id, placeMeta: b.ext ?? (b.species ? b.species.s << 4 : undefined),
    texture: b.render === 'door' ? 'oak_door_item' : b.render === 'redstone' || b.render === 'rail' ? b.faces.py : b.faces.pz, blockIcon: !flat, tab: TAB_FOR_CATEGORY[b.category] ?? 'building',
  });
}

if (items[CB.SHULKER_BOX]) items[CB.SHULKER_BOX].maxStack = 1;

export const SPEAR_MATS = [
  { key: 'wooden', name: 'Wooden', dmg: 2, dur: 59 }, { key: 'stone', name: 'Stone', dmg: 3, dur: 131 }, { key: 'iron', name: 'Iron', dmg: 4, dur: 250 },
  { key: 'golden', name: 'Golden', dmg: 2, dur: 32 }, { key: 'aetherite', name: 'Diamond', dmg: 5, dur: 1561 },
  { key: 'copper', name: 'Copper', dmg: 2, dur: 190 },
];
export function spearIndex(id: number): number { return id >= I.SPEAR && id < I.SPEAR + SPEAR_MATS.length ? id - I.SPEAR : -1; }

SHAPE_MATS.forEach((m, i) => {
  add({ id: slabItem(i), key: `${m.key}_slab`, name: `${m.name} Slab`, desc: 'Half a block. Place two of the same together for a full block.', kind: 'block', places: i < 32 ? B.SLAB : SLAB2, placeMeta: i & 31, texture: BLOCKS[m.id]?.faces.py ?? 'stone', tab: 'building' });
  add({ id: stairsItem(i), key: `${m.key}_stairs`, name: `${m.name} Stairs`, desc: 'Climb without jumping. Place on the underside of a block to turn them upside down.', kind: 'block', places: i < 32 ? B.STAIRS : STAIRS2, placeMeta: i & 31, texture: BLOCKS[m.id]?.faces.py ?? 'stone', tab: 'building' });
});

const mat = (id: number, key: string, name: string, desc: string, extra: Partial<ItemDef> = {}) =>
  add({ id, key, name, desc, kind: 'material', texture: key, ...extra });

mat(I.BONE_MEAL, 'bone_meal', 'Bone Meal', 'Speeds up crops and saplings. Scatter it on grass for flowers.', {});
mat(I.STICK, 'stick', 'Stick', 'Handles for tools and torches.', { fuel: 5 });
mat(I.COAL, 'coal', 'Coal', 'Burns hot and long. Fuels furnaces and torches.', { fuel: 80 });
mat(I.CHARCOAL, 'charcoal', 'Charcoal', 'Smelted wood. Burns like coal.', { fuel: 80 });
mat(I.IRON_INGOT, 'iron_ingot', 'Iron Ingot', 'Forged from ore. Strong tools await.');
mat(I.GOLD_INGOT, 'gold_ingot', 'Gold Ingot', 'Soft but swift. Gold tools mine fast and wear quickly.');
mat(I.AETHERITE, 'aetherite', 'Diamond', 'A crystal from the deep strata. The finest tool material.');
mat(I.FLINT, 'flint', 'Flint', 'A sharp stone knapped from gravel.');
mat(I.GUNPOWDER, 'blastpowder', 'Gunpowder', 'Coal, flint and Emberdust ground together. Packs a punch.');
add({ id: I.MINECART, key: 'minecart', name: 'Minecart', desc: 'Place it on a rail and climb in. Hold forward to give it a push.', kind: 'material', texture: 'minecart', maxStack: 1, tab: 'tools' });
add({ id: I.TNT_MINECART, key: 'tnt_minecart', name: 'Minecart with TNT', desc: 'A minecart carrying TNT. Lit by Activator Rails, fire, a hard landing or breaking it on the move. Faster carts blast harder.', kind: 'material', texture: 'tnt_minecart', maxStack: 1, tab: 'combat' });
add({ id: I.CROSSBOW, key: 'crossbow', name: 'Crossbow', desc: 'Hold to load an arrow, then tap to fire. Hits harder and flies flatter than a bow.', kind: 'material', texture: 'crossbow_standby', maxStack: 1, durability: 465, tab: 'combat' });
for (let i = 0; i < 3; i++) add({ id: I.CROSSBOW_PULL0 + i, key: `crossbow_pulling_${i}`, name: 'Crossbow', desc: '', kind: 'material', texture: `crossbow_pulling_${i}`, maxStack: 1, tab: 'combat' });
add({ id: I.CROSSBOW_LOADED, key: 'crossbow_arrow', name: 'Crossbow', desc: '', kind: 'material', texture: 'crossbow_arrow', maxStack: 1, tab: 'combat' });
add({ id: I.MACE, key: 'mace', name: 'Mace', desc: 'Strike while falling: every block you drop adds damage, and the impact throws back everyone nearby. Landing a smash cancels your fall damage.', kind: 'material', texture: 'mace', maxStack: 1, durability: 500, tab: 'combat' });
SPEAR_MATS.forEach((m, i) => add({ id: I.SPEAR + i, key: `${m.key}_spear`, name: `${m.name} Spear`, desc: 'Jab from 2 to 4.5 blocks away. Hold use to lower it for a charge: anything you run into takes damage that grows with your closing speed.', kind: 'material', texture: `${m.key}_spear`, maxStack: 1, durability: m.dur, tab: 'combat' }));
add({ id: I.SHIELD, key: 'shield', name: 'Shield', desc: 'Hold use to raise it. Blocks attacks and arrows from the front. Works from your off hand too. An axe blow knocks it down for a moment.', kind: 'material', texture: 'shield', maxStack: 1, durability: 336, tab: 'combat' });
add({ id: I.ENDER_PEARL, key: 'ender_pearl', name: 'Ender Pearl', desc: 'Throw it to teleport where it lands. The landing stings a little.', kind: 'material', texture: 'ender_pearl', maxStack: 16, tab: 'materials' });
add({ id: I.EYE_OF_ENDER, key: 'ender_eye', name: 'Eye of Ender', desc: 'Throw it and it flies toward the nearest stronghold. Set twelve in the portal frames to open the End.', kind: 'material', texture: 'ender_eye', tab: 'materials' });
add({ id: I.END_CRYSTAL, key: 'end_crystal', name: 'End Crystal', desc: 'Place on obsidian or bedrock. Four on the exit portal summon the Ender Dragon again. Explodes when hit.', kind: 'material', texture: 'end_crystal', tab: 'combat' });
add({ id: I.CHORUS_FRUIT, key: 'chorus_fruit', name: 'Chorus Fruit', desc: 'Eating it teleports you somewhere nearby. Smelt it into popped chorus fruit.', kind: 'food', texture: 'chorus_fruit', food: { hunger: 4, saturation: 2.4 }, tab: 'food' });
add({ id: I.POPPED_CHORUS_FRUIT, key: 'popped_chorus_fruit', name: 'Popped Chorus Fruit', desc: 'Crafts into purpur blocks and end rods.', kind: 'material', texture: 'popped_chorus_fruit', tab: 'materials' });
add({ id: I.SHULKER_SHELL, key: 'shulker_shell', name: 'Shulker Shell', desc: 'Two shells and a chest make a shulker box.', kind: 'material', texture: 'shulker_shell', tab: 'materials' });
add({ id: I.ELYTRA, key: 'elytra', name: 'Elytra', desc: 'Wear in the chest slot, then jump while falling to glide. Fireworks give a boost. Only found aboard End ships.', kind: 'armor', texture: 'elytra', maxStack: 1, durability: 432, armor: { slot: 1, points: 0, durability: 432 }, tab: 'combat' });
add({ id: I.FIREWORK_ROCKET, key: 'firework_rocket', name: 'Firework Rocket', desc: 'Launch it for a show, or use it while gliding for a burst of speed.', kind: 'material', texture: 'firework_rocket', tab: 'tools' });
for (const [i, k] of ['oak', 'birch', 'spruce', 'jungle', 'acacia', 'dark_oak', 'cherry', 'mangrove'].entries()) add({ id: I.BOAT_BASE + i, key: `${k}_boat`, name: `${k.split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ')} Boat`, desc: 'Place it on water and climb in. Forward and back to row, left and right to turn. Crouch to get out. Flies across ice.', kind: 'material', texture: `${k}_boat`, maxStack: 1, tab: 'tools' });
for (const [i, k] of ['oak', 'birch', 'spruce', 'jungle', 'acacia', 'dark_oak', 'cherry', 'mangrove'].entries()) add({ id: I.CHEST_BOAT_BASE + i, key: `${k}_chest_boat`, name: `${k.split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ')} Boat with Chest`, desc: 'A boat with a chest in the back: room for one rider and 27 stacks. Crouch and use it to open the chest.', kind: 'material', texture: `${k}_chest_boat`, maxStack: 1, tab: 'tools' });
for (const [i, k] of ['oak', 'birch', 'spruce', 'jungle', 'acacia', 'dark_oak', 'cherry', 'mangrove'].entries()) {
  const n = k.split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
  add({ id: I.SIGN_BASE + i, key: `${k}_sign`, name: `${n} Sign`, desc: 'Place on the ground or a wall, then write on it. Use it again to edit the side you face. Dye recolours the text, a Glow Ink Sac makes it shine.', kind: 'placer', places: SIGN_BASE + i, texture: `${k}_sign`, maxStack: 16, fuel: 10, tab: 'functional' });
  add({ id: I.HANGING_SIGN_BASE + i, key: `${k}_hanging_sign`, name: `${n} Hanging Sign`, desc: 'Hang it under a block, or on the side of one for a bracket. Crouch while placing to angle it freely.', kind: 'placer', places: HANGING_SIGN_BASE + i, texture: `${k}_hanging_sign`, maxStack: 16, fuel: 10, tab: 'functional' });
}
add({ id: I.CHAIN, key: 'chain', name: 'Chain', desc: 'Iron links. Runs along whichever face you place it on, and holds hanging signs and lanterns.', kind: 'placer', places: CHAIN, texture: 'chain_item', tab: 'functional' });
export function boatWood(id: number): number { return id >= I.BOAT_BASE && id < I.BOAT_BASE + 8 ? id - I.BOAT_BASE : id >= I.CHEST_BOAT_BASE && id < I.CHEST_BOAT_BASE + 8 ? id - I.CHEST_BOAT_BASE : -1; }
export function isChestBoat(id: number): boolean { return id >= I.CHEST_BOAT_BASE && id < I.CHEST_BOAT_BASE + 8; }
add({ id: I.TOTEM, key: 'totem_of_undying', name: 'Totem of Undying', desc: 'Hold it in either hand. When a blow would kill you, it shatters instead and pulls you back with regeneration and absorption.', kind: 'material', texture: 'totem_of_undying', maxStack: 1, tab: 'combat' });
add({ id: I.SPLASH_HEALING, key: 'splash_potion_healing', name: 'Splash Potion of Healing', desc: 'Throw it to heal everyone in the splash by up to 4 hearts. Throw it at your feet to heal yourself mid-fight.', kind: 'material', texture: 'splash_potion_healing', maxStack: 1, tab: 'combat' });
add({ id: I.EXPERIENCE_BOTTLE, key: 'experience_bottle', name: "Bottle o' Enchanting", desc: 'Throw it and it shatters into 3 to 11 experience for whoever is closest.', kind: 'material', texture: 'experience_bottle', tab: 'tools' });
add({ id: I.ITEM_FRAME, key: 'item_frame', name: 'Item Frame', desc: 'Hang it on a wall, floor or ceiling and set any item in it. Use it again to turn the item.', kind: 'material', texture: 'item_frame', tab: 'functional' });
add({ id: I.GLOW_ITEM_FRAME, key: 'glow_item_frame', name: 'Glow Item Frame', desc: 'An item frame whose contents shine in the dark.', kind: 'material', texture: 'glow_item_frame', tab: 'functional' });
add({ id: I.HOPPER_MINECART, key: 'hopper_minecart', name: 'Minecart with Hopper', desc: 'Rolls along rails, drawing items from containers above and gathering items it passes. Hoppers below can empty it. Powered Activator Rails switch it off.', kind: 'material', texture: 'hopper_minecart', maxStack: 1, tab: 'tools' });
add({ id: I.CHEST_MINECART, key: 'chest_minecart', name: 'Minecart with Chest', desc: 'A rolling chest. Open it to load cargo; hoppers can fill and empty it.', kind: 'material', texture: 'chest_minecart', maxStack: 1, tab: 'tools' });
add({ id: I.GLOW_INK_SAC, key: 'glow_ink_sac', name: 'Glow Ink Sac', desc: 'Faintly luminous ink. Combine with an Item Frame to make it glow.', kind: 'material', texture: 'glow_ink_sac', tab: 'materials' });
add({ id: I.PRISMARINE_SHARD, key: 'prismarine_shard', name: 'Prismarine Shard', desc: 'A sharp sea-green shard. Builds prismarine blocks.', kind: 'material', texture: 'prismarine_shard', tab: 'materials' });
add({ id: I.PRISMARINE_CRYSTALS, key: 'prismarine_crystals', name: 'Prismarine Crystals', desc: 'Glowing crystals. Four shards and five crystals make a Sea Lantern.', kind: 'material', texture: 'prismarine_crystals', tab: 'materials' });
add({ id: I.DRAGON_BREATH, key: 'dragon_breath', name: "Dragon's Breath", desc: 'Bottled from the purple cloud the Ender Dragon breathes.', kind: 'material', texture: 'dragon_breath', tab: 'materials' });
add({ id: I.FLINT_AND_STEEL, key: 'firestriker', name: 'Flint and Steel', desc: 'Strike it on TNT to light the fuse.', kind: 'material', texture: 'firestriker', maxStack: 1, durability: 64, tab: 'tools' });
mat(I.FEATHER, 'feather', 'Feather', 'Plucked from a Chicken. Fletches arrows.');
mat(I.STRING, 'string', 'Silk Thread', 'Spun by a Spider. Strong and fine.');
mat(I.BONE, 'bone', 'Bone', 'Left behind by a Skeleton.');
mat(I.LEATHER, 'leather', 'Leather', 'Tough Pig hide for armour and books.');
mat(I.SEEDS, 'wheat_seeds', 'Wheat Seeds', 'Plant on farmland near water.', { kind: 'placer', places: B.WHEAT });
mat(I.WHEAT, 'wheat', 'Wheat', 'Harvested grain. Bake into bread.');
mat(I.CLAY_BALL, 'clay_ball', 'Clay Lump', 'Fire in a furnace to make a brick.');
mat(I.BRICK, 'brick', 'Brick', 'A fired clay brick.');
mat(I.PAPER, 'paper', 'Paper', 'Pressed sugar cane sheets.');
mat(I.BOOK, 'book', 'Book', 'Bound in hide. Shelve them as you please, or enchant it at an Enchanting Table.');
mat(I.ENCHANTED_BOOK, 'enchanted_book', 'Enchanted Book', 'Combine with gear at an Anvil to pass on its enchantments.', { maxStack: 1, tab: 'tools' });
mat(I.BLAZE_ROD, 'blaze_rod', 'Blaze Rod', 'A glowing rod dropped by a Blaze. Burns in a furnace for a long time.', { fuel: 120 });
mat(I.BLAZE_POWDER, 'blaze_powder', 'Blaze Powder', 'Fiery dust ground from a Blaze Rod.');
mat(I.NETHER_WART, 'nether_wart_item', 'Nether Wart', 'Plant it on soul sand. It grows slowly, even in the dark.', { kind: 'placer', places: B.NETHER_WART });
mat(I.WITHER_SKULL, 'wither_skeleton_skull', 'Wither Skeleton Skull', 'A rare, blackened trophy from a Wither Skeleton.');
mat(I.CINDERITE_SCRAP, 'cinderite_scrap', 'Netherite Scrap', 'Smelted from Ancient Debris. Four of these and four gold make an ingot.');
mat(I.CINDERITE_INGOT, 'cinderite_ingot', 'Netherite Ingot', 'The toughest metal there is. Upgrade Diamond gear with it at a Smithing Table.');
mat(I.UPGRADE_TEMPLATE, 'cinderite_upgrade_smithing_template', 'Netherite Upgrade', 'A smithing template found in Bastion Remnants. Used up when you upgrade Diamond gear.');
add({ id: I.SADDLE, key: 'saddle', name: 'Saddle', desc: 'Put it on a Strider to ride it across lava.', kind: 'material', texture: 'saddle', maxStack: 1, tab: 'tools' });
add({ id: I.FUNGUS_STICK, key: 'warped_fungus_on_a_stick', name: 'Warped Fungus on a Stick', desc: 'Hold it while riding a Strider to steer where you look. Use it for a burst of speed.', kind: 'material', texture: 'warped_fungus_on_a_stick', maxStack: 1, durability: 100, tab: 'tools' });
mat(I.GOLD_NUGGET, 'gold_nugget', 'Gold Nugget', 'A ninth of a gold ingot.');
mat(I.QUARTZ, 'quartz', 'Nether Quartz', 'A pale crystal from the Nether.');
mat(I.IRON_NUGGET, 'iron_nugget', 'Iron Nugget', 'A ninth of an iron ingot.');
mat(I.TRIPWIRE_HOOK, 'tripwire_hook', 'Tripwire Hook', 'Used to make crossbows.');
mat(I.GHAST_TEAR, 'ghast_tear', 'Ghast Tear', 'A tear wept by a Ghast. Hard to come by.');
mat(I.MAGMA_CREAM, 'magma_cream', 'Magma Cream', 'A sticky, glowing goo from Magma Cubes.');
mat(I.LAPIS, 'lapis_lazuli', 'Lapis Lazuli', 'Blue mineral. Enchanting Tables use it as fuel.');
mat(I.RED_DYE, 'red_dye', 'Crimson Dye', 'Pressed from poppies.');
mat(I.YELLOW_DYE, 'yellow_dye', 'Saffron Dye', 'Pressed from dandelions.');
mat(I.ARROW, 'arrow', 'Arrow', 'Fletched with feather and flint.', { tab: 'combat' });
add({ id: I.BOW, key: 'bow', name: 'Bow', desc: 'Hold to draw, release to loose an arrow.', kind: 'material', texture: 'bow', maxStack: 1, durability: 384, tab: 'combat' });
mat(I.EMERALD, 'emerald', 'Emerald', 'Villagers trade for these gleaming gems.');
for (const c of NEW_DYES) mat(dyeId(c), `${c}_dye`, `${COLOR_NAMES[c]} Dye`, 'Colours wool, glass, terracotta and concrete.');
mat(I.COPPER_INGOT, 'copper_ingot', 'Copper Ingot', 'Smelted from copper ore. Builds copper blocks and lamps.');
mat(I.TRIAL_KEY, 'trial_key', 'Trial Key', 'Dropped by a cleared Trial Cage. Opens a Vault.', { tab: 'tools' });
mat(I.INK_SAC, 'ink_sac', 'Ink Sac', 'Dark ink. Makes black dye.');
mat(I.COCOA_BEANS, 'cocoa_beans', 'Cocoa Beans', 'Found in jungle canopies. Makes brown dye.');
for (let i = 0; i < 3; i++) add({ id: I.BOW_PULL0 + i, key: `bow_pulling_${i}`, name: 'Bow', desc: '', kind: 'material', texture: `bow_pulling_${i}`, maxStack: 1, tab: 'combat' });
mat(I.ROTTEN_FLESH, 'rotten_flesh', 'Grave Flesh', 'Edible in a pinch, but it may sicken you.', { kind: 'food', food: { hunger: 4, saturation: 0.8 } });
add({ id: I.DOOR, key: 'oak_door_item', name: 'Oak Door', desc: 'Place on the ground. Tap to open and close.', kind: 'placer', places: B.OAK_DOOR, texture: 'oak_door_item', tab: 'functional' });
add({ id: I.REDSTONE, key: 'redstone', name: 'Emberdust', desc: 'Lay it on the ground to carry an ember signal. Mined from Ember Ore.', kind: 'placer', places: B.REDSTONE_WIRE, texture: 'redstone', tab: 'functional' });
add({ id: I.BUCKET, key: 'bucket', name: 'Bucket', desc: 'Scoop up water or lava.', kind: 'bucket', texture: 'bucket', maxStack: 16, tab: 'tools' });
add({ id: I.WATER_BUCKET, key: 'water_bucket', name: 'Water Bucket', desc: 'Pour out a water source.', kind: 'bucket', texture: 'water_bucket', maxStack: 1, tab: 'tools' });
add({ id: I.LAVA_BUCKET, key: 'lava_bucket', name: 'Lava Bucket', desc: 'Pour out lava. Also a superb fuel.', kind: 'bucket', texture: 'lava_bucket', maxStack: 1, fuel: 1000, tab: 'tools' });

const food = (id: number, key: string, name: string, desc: string, hunger: number, saturation: number) =>
  add({ id, key, name, desc, kind: 'food', texture: key, food: { hunger, saturation }, tab: 'food' });
add({ id: I.POTATO, key: 'potato', name: 'Potato', desc: 'Plant it on farmland, or bake it for a proper meal.', kind: 'placer', places: B.POTATOES, texture: 'potato', food: { hunger: 1, saturation: 0.6 }, tab: 'food' });
add({ id: I.GLOW_BERRIES, key: 'glow_berries', name: 'Glow Berries', desc: 'Sweet berries that shine. Eat them, or plant them under a ceiling to grow cave vines.', kind: 'placer', places: CB.CAVE_VINES, texture: 'glow_berries', food: { hunger: 2, saturation: 0.4 }, tab: 'food' });
add({ id: I.CARROT, key: 'carrot', name: 'Carrot', desc: 'Crunchy and orange. Plant it on farmland.', kind: 'placer', places: B.CARROTS, texture: 'carrot', food: { hunger: 3, saturation: 3.6 }, tab: 'food' });
add({ id: I.BEETROOT_SEEDS, key: 'beetroot_seeds', name: 'Beetroot Seeds', desc: 'Plant on farmland to grow beetroots.', kind: 'placer', places: B.BEETROOTS, texture: 'beetroot_seeds', tab: 'food' });
food(I.BAKED_POTATO, 'baked_potato', 'Baked Potato', 'Hot, fluffy and filling.', 5, 6);
food(I.BEETROOT, 'beetroot', 'Beetroot', 'An earthy red root.', 1, 1.2);
food(I.PUMPKIN_PIE, 'pumpkin_pie', 'Pumpkin Pie', 'Sweet spiced pumpkin in a crust.', 8, 4.8);
food(I.MELON_SLICE, 'melon_slice', 'Melon Slice', 'Juicy and quick to eat.', 2, 1.2);
food(I.GOLDEN_CARROT, 'golden_carrot', 'Golden Carrot', 'A carrot wrapped in gold. Very nourishing.', 6, 14.4);
add({ id: I.BEETROOT_SOUP, key: 'beetroot_soup', name: 'Beetroot Soup', desc: 'A warming bowl of soup.', kind: 'food', texture: 'beetroot_soup', food: { hunger: 6, saturation: 7.2 }, maxStack: 1, tab: 'food' });
mat(I.GLISTERING_MELON, 'glistering_melon_slice', 'Glistering Melon Slice', 'A melon slice framed in gold nuggets.');
add({ id: I.COMPASS, key: 'compass', name: 'Compass', desc: 'Hold it to see which way the world spawn lies.', kind: 'material', texture: 'compass', maxStack: 64, tab: 'tools' });
add({ id: I.CLOCK, key: 'clock', name: 'Clock', desc: 'Hold it to see the time of day.', kind: 'material', texture: 'clock', maxStack: 64, tab: 'tools' });
add({ id: I.NAME_TAG, key: 'name_tag', name: 'Name Tag', desc: 'Rename it at an anvil, then use it on a mob to name it. Named mobs never despawn.', kind: 'material', texture: 'name_tag', maxStack: 64, tab: 'tools' });
mat(I.GLASS_BOTTLE, 'glass_bottle', 'Glass Bottle', 'An empty bottle, ready for brewing later.');
add({ id: I.WRITABLE_BOOK, key: 'writable_book', name: 'Book and Quill', desc: 'A blank book with a quill tucked inside.', kind: 'material', texture: 'writable_book', maxStack: 1, tab: 'tools' });
food(I.APPLE, 'apple', 'Apple', 'Crisp fruit from oak canopies.', 4, 2.4);
food(I.COOKIE, 'cookie', 'Cookie', 'Wheat and cocoa, baked by the batch.', 2, 0.4);
food(I.DRIED_KELP, 'dried_kelp', 'Dried Kelp', 'Salty and quick to eat.', 1, 0.6);
mat(I.SHEARS, 'shears', 'Shears', 'Clips leaves, vines, seagrass and grass cleanly.', { maxStack: 1, durability: 238, tab: 'tools' });
food(I.GOLDEN_APPLE, 'golden_apple', 'Golden Apple', 'An apple sealed in gold. Deeply restoring.', 4, 9.6);
food(I.MUSHROOM_STEW, 'mushroom_stew', 'Mushroom Stew', 'Warm and earthy.', 6, 7.2);
mat(I.BOWL, 'bowl', 'Bowl', 'Carved from planks. Holds stew.');
food(I.RAW_PORK, 'raw_pork', 'Raw Pig Haunch', 'Better cooked.', 3, 1.8);
food(I.COOKED_PORK, 'cooked_pork', 'Roast Haunch', 'Hearty and filling.', 8, 12.8);
food(I.RAW_MUTTON, 'raw_mutton', 'Raw Sheep Chop', 'Better cooked.', 2, 1.2);
food(I.COOKED_MUTTON, 'cooked_mutton', 'Seared Chop', 'Savoury and satisfying.', 6, 9.6);
food(I.RAW_POULTRY, 'raw_poultry', 'Raw Chicken', 'Better cooked.', 2, 1.2);
food(I.COOKED_POULTRY, 'cooked_poultry', 'Roast Chicken', 'A traveller staple.', 6, 7.2);
food(I.BREAD, 'bread', 'Bread', 'Baked from three wheat.', 5, 6);

const TOOL_TIER = [1, 2, 3, 1, 4, 5];
const TOOL_SPEED = [2, 4, 6, 12, 8, 9];
const TOOL_DUR = [60, 132, 251, 33, 1562, 2032];
const TOOL_DMG_BASE = [0, 1, 2, 0, 3, 4];
const TYPE_DMG = [2, 4, 1.5, 4, 1];
const MAT_NAMES = ['Wooden', 'Stone', 'Iron', 'Golden', 'Diamond', 'Netherite'];
const MAT_KEYS = ['wooden', 'stone', 'iron', 'golden', 'aetherite', 'cinderite'];
const TYPE_NAMES = ['Pickaxe', 'Axe', 'Shovel', 'Sword', 'Hoe'];
const TYPE_DESC = [
  'Breaks stone and ore.', 'Fells trees and splits planks.', 'Digs dirt, sand and gravel.',
  'Strikes true against creatures.', 'Tills soil into farmland.',
];
for (let m = 0; m < 6; m++) {
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

const ARMOR_POINTS = [[1, 3, 2, 1], [2, 6, 5, 2], [2, 5, 3, 1], [3, 8, 6, 3], [3, 8, 6, 3]];
const ARMOR_DUR = [[55, 80, 75, 65], [165, 240, 225, 195], [77, 112, 105, 91], [363, 528, 495, 429], [407, 592, 555, 481]];
const ARMOR_MAT_NAMES = ['Leather', 'Iron', 'Golden', 'Diamond', 'Netherite'];
const ARMOR_SLOT_NAMES = ['Cap', 'Tunic', 'Pants', 'Boots'];
const ARMOR_SLOT_NAMES_METAL = ['Helmet', 'Chestplate', 'Leggings', 'Boots'];
for (let m = 0; m < 5; m++) {
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
for (const d of ITEM_LIST) {
  const alt = d.key.replace(/aetherite/g, 'diamond').replace(/cinderite/g, 'netherite').replace(/^firestriker$/, 'flint_and_steel').replace(/^blastpowder$/, 'gunpowder');
  if (alt !== d.key && !ITEM_BY_KEY.has(alt)) ITEM_BY_KEY.set(alt, d);
}

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
  return d?.tool?.durability ?? d?.armor?.durability ?? d?.durability ?? 0;
}

export function fuelSeconds(id: number): number {
  const d = items[id];
  if (!d) return 0;
  if (d.fuel) return d.fuel;
  if (id === B.COAL_BLOCK) return 800;
  if (id === B.HAY_BLOCK) return 0;
  if (d.kind === 'block') {
    const b = BLOCKS[id];
    if (b && b.sound === 'wood' && b.id !== B.TORCH) return 15;
  }
  return 0;
}

export const CREATIVE_HIDDEN = new Set<number>([...BLOCKS.filter((b) => b && b.category === 'hidden').map((b) => b.id), B.WATER, B.LAVA, B.FURNACE_LIT, B.OAK_DOOR, B.WHEAT, B.CARROTS, B.POTATOES, B.BEETROOTS, B.NETHER_WART, B.FARMLAND, I.BOW_PULL0, I.BOW_PULL1, I.BOW_PULL2, I.CROSSBOW_PULL0, I.CROSSBOW_PULL1, I.CROSSBOW_PULL2, I.CROSSBOW_LOADED]);

const baseNames = new Map<string, string>();
let packNames: Map<string, string> | null = null;
let namesOn = true;

function applyNames(): void {
  for (const it of ITEMS) {
    if (!it) continue;
    if (!baseNames.has(it.key)) baseNames.set(it.key, it.name);
    it.name = (namesOn && packNames?.get(it.key)) || baseNames.get(it.key)!;
    if (it.kind === 'block' && it.places === it.id && BLOCKS[it.id]) BLOCKS[it.id]!.name = it.name;
  }
}

export function setPackNames(map: Map<string, string> | null): void { packNames = map && map.size ? map : null; applyNames(); }
export function usePackNames(on: boolean): void { namesOn = on; applyNames(); }
export function hasPackNames(): boolean { return !!packNames; }

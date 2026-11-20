import { I } from '../items';
import { B } from '../blocks';

export type MobType = 'woolhorn' | 'mudsnout' | 'fernhen' | 'hollowed' | 'rattlebone' | 'duskweaver' | 'rival' | 'quartermaster' | 'villager' | 'cinderhusk' | 'wailer' | 'emberslime' | 'lavastrider' | 'flarewisp' | 'witherbone' | 'piglin' | 'piglin_brute' | 'hoglin' | 'voidstalker' | 'voidwyrm' | 'riftcore' | 'shellward' | 'zoglin';

export interface MobDrop { item: number; min: number; max: number; chance?: number; }

export interface MobDef {
  type: MobType;
  code: number;
  name: string;
  hostile: boolean;
  health: number;
  speed: number;
  hw: number;
  h: number;
  damage: number;
  drops: MobDrop[];
  xp: number;
  lure?: number[];
  burnsInDay?: boolean;
  follow?: number;
  ranged?: boolean;
  climbs?: boolean;
  npc?: boolean;
  trader?: boolean;
  spawn?: { weight: number; min: number; max: number };
  neutral?: boolean;
  fireImmune?: boolean;
  flying?: boolean;
  lavaWalker?: boolean;
  nether?: Partial<Record<string, { weight: number; min: number; max: number }>>;
  fortress?: { weight: number; min: number; max: number };
  desc: string;
}

export const MOBS: Record<MobType, MobDef> = {
  woolhorn: {
    type: 'woolhorn', code: 0, name: 'Sheep', hostile: false, health: 8, speed: 1.6, hw: 0.45, h: 1.3, damage: 0,
    drops: [{ item: B.WHITE_WOOL, min: 1, max: 2 }, { item: I.RAW_MUTTON, min: 1, max: 2 }], xp: 2, lure: [I.WHEAT],
    spawn: { weight: 12, min: 4, max: 4 },
    desc: 'A curly-horned grazer with a coat of thick fleece.',
  },
  mudsnout: {
    type: 'mudsnout', code: 1, name: 'Pig', hostile: false, health: 10, speed: 1.5, hw: 0.45, h: 0.9, damage: 0,
    drops: [{ item: I.RAW_PORK, min: 1, max: 3 }, { item: I.LEATHER, min: 0, max: 2 }], xp: 2, lure: [I.WHEAT, I.APPLE],
    spawn: { weight: 10, min: 4, max: 4 },
    desc: 'A stout, snuffling forager that loves apples.',
  },
  fernhen: {
    type: 'fernhen', code: 2, name: 'Chicken', hostile: false, health: 4, speed: 1.4, hw: 0.25, h: 0.7, damage: 0,
    drops: [{ item: I.FEATHER, min: 0, max: 2 }, { item: I.RAW_POULTRY, min: 1, max: 1 }], xp: 1, lure: [I.SEEDS],
    spawn: { weight: 10, min: 4, max: 4 },
    desc: 'A skittish ground bird with leaf-green plumage.',
  },
  hollowed: {
    type: 'hollowed', code: 3, name: 'Zombie', hostile: true, health: 20, speed: 2.4, hw: 0.3, h: 1.9, damage: 3,
    drops: [{ item: I.ROTTEN_FLESH, min: 0, max: 2 }, { item: I.IRON_INGOT, min: 1, max: 1, chance: 0.025 }], xp: 5, burnsInDay: true,
    spawn: { weight: 95, min: 4, max: 4 },
    desc: 'A shambling husk that hungers in the dark. Sunlight sets it smouldering.',
  },
  rattlebone: {
    type: 'rattlebone', code: 4, name: 'Skeleton', hostile: true, health: 20, speed: 2.5, hw: 0.3, h: 1.95, damage: 2,
    drops: [{ item: I.BONE, min: 0, max: 2 }, { item: I.ARROW, min: 0, max: 2 }], xp: 5, burnsInDay: true, ranged: true,
    spawn: { weight: 100, min: 4, max: 4 },
    nether: { soul_sand_valley: { weight: 20, min: 5, max: 5 } },
    fortress: { weight: 2, min: 5, max: 5 },
    desc: 'A clattering skeleton archer that keeps its distance.',
  },
  duskweaver: {
    type: 'duskweaver', code: 5, name: 'Spider', hostile: true, health: 16, speed: 3.2, hw: 0.65, h: 0.9, damage: 2,
    drops: [{ item: I.STRING, min: 0, max: 2 }, { item: I.INK_SAC, min: 1, max: 1, chance: 0.33 }], xp: 5, climbs: true,
    spawn: { weight: 100, min: 4, max: 4 },
    desc: 'A many-eyed spider that pounces from the gloom. Calm in daylight unless provoked.',
  },
  rival: {
    type: 'rival', code: 6, name: 'Rival', hostile: false, health: 20, speed: 3.9, hw: 0.3, h: 1.8, damage: 1, drops: [], xp: 0, npc: true,
    desc: 'An arena challenger who bridges, brawls and hunts hearths.',
  },
  quartermaster: {
    type: 'quartermaster', code: 7, name: 'Quartermaster', hostile: false, health: 1000, speed: 0, hw: 0.3, h: 1.9, damage: 0, drops: [], xp: 0, npc: true,
    desc: 'Trades ingots for gear. Hit or use to open the shop.',
  },
  villager: {
    type: 'villager', code: 8, name: 'Villager', hostile: false, health: 20, speed: 1.6, hw: 0.3, h: 1.95, damage: 0, drops: [], xp: 0, trader: true,
    desc: 'A village local. Use on them to trade emeralds for goods.',
  },
  cinderhusk: {
    type: 'cinderhusk', code: 9, name: 'Zombified Piglin', hostile: false, neutral: true, fireImmune: true, health: 20, speed: 2.3, hw: 0.3, h: 1.95, damage: 5,
    drops: [{ item: I.ROTTEN_FLESH, min: 0, max: 1 }, { item: I.GOLD_NUGGET, min: 0, max: 1 }, { item: I.GOLD_INGOT, min: 1, max: 1, chance: 0.025 }], xp: 5,
    nether: { nether_wastes: { weight: 100, min: 4, max: 4 }, crimson_forest: { weight: 1, min: 2, max: 4 } },
    fortress: { weight: 5, min: 4, max: 4 },
    desc: 'A rotting piglin that wanders the Nether. Leaves you alone until you strike one, then the whole pack comes for you.',
  },
  wailer: {
    type: 'wailer', code: 10, name: 'Ghast', hostile: true, fireImmune: true, flying: true, health: 10, speed: 1.2, hw: 2, h: 4, damage: 6,
    drops: [{ item: I.GUNPOWDER, min: 0, max: 2 }, { item: I.GHAST_TEAR, min: 0, max: 1 }], xp: 5,
    nether: { nether_wastes: { weight: 50, min: 4, max: 4 }, soul_sand_valley: { weight: 50, min: 4, max: 4 }, basalt_deltas: { weight: 40, min: 1, max: 1 } },
    desc: 'A huge floating jellyfish of the Nether that wails and spits fireballs. Hit a fireball back to return it.',
  },
  emberslime: {
    type: 'emberslime', code: 11, name: 'Magma Cube', hostile: true, fireImmune: true, health: 16, speed: 2.6, hw: 1.02, h: 2.04, damage: 6,
    drops: [{ item: I.MAGMA_CREAM, min: 0, max: 1, chance: 0.25 }], xp: 4,
    nether: { nether_wastes: { weight: 2, min: 4, max: 4 }, basalt_deltas: { weight: 100, min: 2, max: 5 } },
    fortress: { weight: 3, min: 4, max: 4 },
    desc: 'A bouncing cube of molten slime. Splits into smaller cubes when beaten.',
  },
  lavastrider: {
    type: 'lavastrider', code: 12, name: 'Strider', hostile: false, fireImmune: true, lavaWalker: true, health: 20, speed: 1.6, hw: 0.45, h: 1.7, damage: 0,
    drops: [{ item: I.STRING, min: 2, max: 5 }], xp: 2,
    nether: { nether_wastes: { weight: 60, min: 1, max: 2 }, crimson_forest: { weight: 60, min: 1, max: 2 }, warped_forest: { weight: 60, min: 1, max: 2 }, soul_sand_valley: { weight: 60, min: 1, max: 2 }, basalt_deltas: { weight: 60, min: 1, max: 2 } },
    desc: 'A long-legged walker that strolls across lava seas. Shivers and turns purple when out of the heat.',
  },
  flarewisp: {
    type: 'flarewisp', code: 13, name: 'Blaze', hostile: true, fireImmune: true, flying: true, health: 20, speed: 2.3, hw: 0.3, h: 1.8, damage: 6,
    drops: [{ item: I.BLAZE_ROD, min: 0, max: 1 }], xp: 10,
    fortress: { weight: 10, min: 2, max: 3 },
    desc: 'A floating spirit of flame wrapped in spinning rods. Hurls bursts of three fireballs. Water stings it.',
  },
  witherbone: {
    type: 'witherbone', code: 14, name: 'Wither Skeleton', hostile: true, fireImmune: true, health: 20, speed: 2.5, hw: 0.35, h: 2.4, damage: 8,
    drops: [{ item: I.COAL, min: 0, max: 1, chance: 0.33 }, { item: I.BONE, min: 0, max: 2 }, { item: I.WITHER_SKULL, min: 1, max: 1, chance: 0.025 }], xp: 5,
    fortress: { weight: 8, min: 5, max: 5 },
    desc: 'A tall, soot-black skeleton with a stone sword. Its blows wither you for a while.',
  },
  piglin: {
    type: 'piglin', code: 15, name: 'Piglin', hostile: false, neutral: true, health: 16, speed: 2.5, hw: 0.3, h: 1.95, damage: 5,
    drops: [], xp: 5,
    nether: { nether_wastes: { weight: 15, min: 4, max: 4 }, crimson_forest: { weight: 5, min: 3, max: 4 } },
    desc: 'A gold-loving Nether native with a sword or crossbow. Wear something golden and it leaves you be. Toss it a gold ingot to barter.',
  },
  piglin_brute: {
    type: 'piglin_brute', code: 16, name: 'Piglin Brute', hostile: true, health: 50, speed: 2.5, hw: 0.3, h: 1.95, damage: 7,
    drops: [], xp: 20,
    desc: 'A hulking Bastion guard with a golden axe. Gold does not calm it.',
  },
  hoglin: {
    type: 'hoglin', code: 17, name: 'Hoglin', hostile: true, health: 40, speed: 2.1, hw: 0.7, h: 1.4, damage: 6,
    drops: [{ item: I.RAW_PORK, min: 2, max: 4 }, { item: I.LEATHER, min: 0, max: 1 }], xp: 5,
    nether: { crimson_forest: { weight: 9, min: 3, max: 4 } },
    desc: 'A tusked beast of the Crimson Forest that tosses you into the air. It flees from Warped Fungus.',
  },
  voidstalker: {
    type: 'voidstalker', code: 18, name: 'Enderman', hostile: false, neutral: true, health: 40, speed: 3.0, hw: 0.3, h: 2.9, damage: 7,
    drops: [{ item: I.ENDER_PEARL, min: 0, max: 1 }], xp: 5,
    spawn: { weight: 10, min: 1, max: 4 },
    nether: { nether_wastes: { weight: 1, min: 4, max: 4 }, soul_sand_valley: { weight: 1, min: 4, max: 4 } },
    desc: 'A tall wanderer from somewhere else. Leaves you alone unless you meet its eyes. Hates water and slips away from arrows.',
  },
  voidwyrm: {
    type: 'voidwyrm', code: 19, name: 'Ender Dragon', hostile: true, health: 200, speed: 0, hw: 3.5, h: 3.5, damage: 10,
    drops: [], xp: 0, flying: true, fireImmune: true,
    desc: 'The great black dragon that rules the End. The crystals on the pillars heal it; break them first.',
  },
  riftcore: {
    type: 'riftcore', code: 20, name: 'End Crystal', hostile: false, health: 1, speed: 0, hw: 1, h: 2, damage: 0,
    drops: [], xp: 0, fireImmune: true,
    desc: 'A spinning crystal that heals the Ender Dragon. Any blow sets it off.',
  },
  shellward: {
    type: 'shellward', code: 21, name: 'Shulker', hostile: true, health: 30, speed: 0, hw: 0.5, h: 1, damage: 4,
    drops: [{ item: I.SHULKER_SHELL, min: 1, max: 1, chance: 0.5 }], xp: 5, fireImmune: true,
    desc: 'A purpur box that hides on End city walls and lobs homing bullets that make you float.',
  },
  zoglin: {
    type: 'zoglin', code: 22, name: 'Zoglin', hostile: true, health: 40, speed: 2.1, hw: 0.7, h: 1.4, damage: 6,
    drops: [{ item: I.ROTTEN_FLESH, min: 1, max: 3 }], xp: 5,
    desc: 'A hoglin that rotted away outside the Nether. It fears nothing, not even Warped Fungus, and tosses anything it can reach.',
  },
};

export const MOB_BY_CODE: MobDef[] = Object.values(MOBS).sort((a, b) => a.code - b.code);
export const PASSIVE_TYPES: MobType[] = ['woolhorn', 'mudsnout', 'fernhen'];
export const HOSTILE_TYPES: MobType[] = ['hollowed', 'rattlebone', 'duskweaver', 'voidstalker'];

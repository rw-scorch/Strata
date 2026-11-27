import { B, CB } from '../../blocks';
import { I, toolId, armorId } from '../../items';

export type Currency = 'iron' | 'gold' | 'aetherite' | 'emerald';
export const CURRENCIES: Currency[] = ['iron', 'gold', 'aetherite', 'emerald'];
export const CURRENCY_ITEM: Record<Currency, number> = { iron: I.IRON_INGOT, gold: I.GOLD_INGOT, aetherite: I.AETHERITE, emerald: I.EMERALD };
export const CURRENCY_NAME: Record<Currency, string> = { iron: 'Iron', gold: 'Gold', aetherite: 'Diamond', emerald: 'Emerald' };

export type TeamBlock = 'wool' | 'clay' | 'glass';
export type UpgradeKey = 'edge' | 'bulwark' | 'forge' | 'spring' | 'snare';
export type ToolLine = 'pick' | 'axe';

export interface ShopOffer {
  key: string;
  name: string;
  desc: string;
  cost: [Currency, number];
  give?: { id: number; count: number; en?: Record<string, number> }[];
  team?: [TeamBlock, number];
  upgrade?: UpgradeKey;
  level?: number;
  tool?: ToolLine;
  tier?: number;
  greaves?: number;
  cat: 'blocks' | 'melee' | 'armour' | 'tools' | 'ranged' | 'utility' | 'upgrades';
  icon: number;
}

const sword = (m: number) => toolId(m, 3);
export const TOOL_MATS = [0, 2, 3, 4];
export const toolOf = (line: ToolLine, tier: number) => toolId(TOOL_MATS[tier - 1], line === 'pick' ? 0 : 1);
export const GREAVES_MATS = [0, 2, 1, 3];
export const UPGRADE_MAX: Record<UpgradeKey, number> = { edge: 1, bulwark: 4, forge: 4, spring: 1, snare: 1 };

export const SHOP: ShopOffer[] = [
  { key: 'wool', name: 'Team Wool x16', desc: 'Quick to place, quick to break. Your bridge home.', cost: ['iron', 4], team: ['wool', 16], cat: 'blocks', icon: B.WHITE_WOOL },
  { key: 'clay', name: 'Team Terracotta x16', desc: 'Fired clay. Takes a pickaxe to clear quickly.', cost: ['iron', 12], team: ['clay', 16], cat: 'blocks', icon: B.TERRACOTTA },
  { key: 'glass', name: 'Blastproof Glass x4', desc: 'Shrugs off TNT. Clear enough to watch raiders coming.', cost: ['iron', 12], team: ['glass', 4], cat: 'blocks', icon: B.GLASS },
  { key: 'endstone', name: 'End Stone x12', desc: 'Dense pale stone that resists blasts and slow pickaxes.', cost: ['iron', 24], give: [{ id: CB.END_STONE, count: 12 }], cat: 'blocks', icon: CB.END_STONE },
  { key: 'planks', name: 'Oak Planks x16', desc: 'Sturdy timber. An axe clears it fastest.', cost: ['gold', 4], give: [{ id: B.OAK_PLANKS, count: 16 }], cat: 'blocks', icon: B.OAK_PLANKS },
  { key: 'ladder', name: 'Ladder x8', desc: 'Climb walls, scale towers.', cost: ['iron', 4], give: [{ id: B.LADDER, count: 8 }], cat: 'blocks', icon: B.LADDER },
  { key: 'obsidian', name: 'Obsidian x4', desc: 'The last word in hearth defence.', cost: ['emerald', 4], give: [{ id: B.OBSIDIAN, count: 4 }], cat: 'blocks', icon: B.OBSIDIAN },

  { key: 'stone_sword', name: 'Stone Sword', desc: 'A reliable first upgrade. Replaces your wooden sword.', cost: ['iron', 10], give: [{ id: sword(1), count: 1 }], cat: 'melee', icon: sword(1) },
  { key: 'iron_sword', name: 'Iron Sword', desc: 'Hits hard, swings true.', cost: ['gold', 7], give: [{ id: sword(2), count: 1 }], cat: 'melee', icon: sword(2) },
  { key: 'aeth_sword', name: 'Diamond Sword', desc: 'The finest edge in the skies.', cost: ['emerald', 4], give: [{ id: sword(4), count: 1 }], cat: 'melee', icon: sword(4) },
  { key: 'kb_stick', name: 'Knockback Stick', desc: 'Barely hurts. Sends people flying off bridges.', cost: ['gold', 5], give: [{ id: I.STICK, count: 1, en: { knockback: 1 } }], cat: 'melee', icon: I.STICK },

  { key: 'greaves1', name: 'Golden Greaves', desc: 'Golden leggings and boots, kept for the whole round.', cost: ['iron', 24], greaves: 1, cat: 'armour', icon: armorId(2, 2) },
  { key: 'greaves2', name: 'Iron Greaves', desc: 'Iron leggings and boots, kept for the whole round.', cost: ['gold', 12], greaves: 2, cat: 'armour', icon: armorId(1, 2) },
  { key: 'greaves3', name: 'Diamond Greaves', desc: 'Diamond leggings and boots, kept for the whole round.', cost: ['emerald', 6], greaves: 3, cat: 'armour', icon: armorId(3, 2) },

  { key: 'pick1', name: 'Wooden Pickaxe', desc: 'Kept when you fall, but drops a tier.', cost: ['iron', 10], tool: 'pick', tier: 1, cat: 'tools', icon: toolOf('pick', 1) },
  { key: 'pick2', name: 'Iron Pickaxe', desc: 'Makes short work of terracotta and end stone.', cost: ['iron', 10], tool: 'pick', tier: 2, cat: 'tools', icon: toolOf('pick', 2) },
  { key: 'pick3', name: 'Golden Pickaxe', desc: 'Very fast, briefly glorious.', cost: ['gold', 3], tool: 'pick', tier: 3, cat: 'tools', icon: toolOf('pick', 3) },
  { key: 'pick4', name: 'Diamond Pickaxe', desc: 'Cuts through anything short of obsidian in a blink.', cost: ['gold', 6], tool: 'pick', tier: 4, cat: 'tools', icon: toolOf('pick', 4) },
  { key: 'axe1', name: 'Wooden Axe', desc: 'Kept when you fall, but drops a tier.', cost: ['iron', 10], tool: 'axe', tier: 1, cat: 'tools', icon: toolOf('axe', 1) },
  { key: 'axe2', name: 'Iron Axe', desc: 'Splits planks in a heartbeat.', cost: ['iron', 10], tool: 'axe', tier: 2, cat: 'tools', icon: toolOf('axe', 2) },
  { key: 'axe3', name: 'Golden Axe', desc: 'Quicker still.', cost: ['gold', 3], tool: 'axe', tier: 3, cat: 'tools', icon: toolOf('axe', 3) },
  { key: 'axe4', name: 'Diamond Axe', desc: 'Timber walls do not stand a chance.', cost: ['gold', 6], tool: 'axe', tier: 4, cat: 'tools', icon: toolOf('axe', 4) },
  { key: 'shears', name: 'Shears', desc: 'Clears wool in an instant. Kept when you fall.', cost: ['iron', 20], give: [{ id: I.SHEARS, count: 1 }], cat: 'tools', icon: I.SHEARS },

  { key: 'bow', name: 'Bow', desc: 'Pick people off bridges from afar.', cost: ['gold', 12], give: [{ id: I.BOW, count: 1 }], cat: 'ranged', icon: I.BOW },
  { key: 'power_bow', name: 'Bow of Power', desc: 'A bow with Power I.', cost: ['gold', 20], give: [{ id: I.BOW, count: 1, en: { power: 1 } }], cat: 'ranged', icon: I.BOW },
  { key: 'arrows', name: 'Arrows x8', desc: 'Ammunition for your bow.', cost: ['gold', 2], give: [{ id: I.ARROW, count: 8 }], cat: 'ranged', icon: I.ARROW },

  { key: 'gapple', name: 'Golden Apple', desc: 'Instant absorption and a burst of healing.', cost: ['gold', 3], give: [{ id: I.GOLDEN_APPLE, count: 1 }], cat: 'utility', icon: I.GOLDEN_APPLE },
  { key: 'tnt', name: 'TNT', desc: 'Lights itself the moment you place it. Blastproof glass and obsidian hold.', cost: ['gold', 4], give: [{ id: B.TNT, count: 1 }], cat: 'utility', icon: B.TNT },
  { key: 'pearl', name: 'Ender Pearl', desc: 'Throw it and arrive where it lands.', cost: ['emerald', 4], give: [{ id: I.ENDER_PEARL, count: 1 }], cat: 'utility', icon: I.ENDER_PEARL },
  { key: 'water', name: 'Water Bucket', desc: 'Break a fall or wash raiders off a bridge.', cost: ['gold', 3], give: [{ id: I.WATER_BUCKET, count: 1 }], cat: 'utility', icon: I.WATER_BUCKET },
  { key: 'bread', name: 'Bread x4', desc: 'Keep your strength up.', cost: ['iron', 4], give: [{ id: I.BREAD, count: 4 }], cat: 'utility', icon: I.BREAD },

  { key: 'edge', name: 'Keen Edge', desc: 'Every sword on your team strikes 1 harder.', cost: ['aetherite', 4], upgrade: 'edge', level: 1, cat: 'upgrades', icon: sword(2) },
  { key: 'bulwark1', name: 'Bulwark I', desc: 'Your whole team takes 8% less damage.', cost: ['aetherite', 2], upgrade: 'bulwark', level: 1, cat: 'upgrades', icon: armorId(1, 1) },
  { key: 'bulwark2', name: 'Bulwark II', desc: 'Your whole team takes 16% less damage.', cost: ['aetherite', 4], upgrade: 'bulwark', level: 2, cat: 'upgrades', icon: armorId(1, 1) },
  { key: 'bulwark3', name: 'Bulwark III', desc: 'Your whole team takes 24% less damage.', cost: ['aetherite', 8], upgrade: 'bulwark', level: 3, cat: 'upgrades', icon: armorId(3, 1) },
  { key: 'bulwark4', name: 'Bulwark IV', desc: 'Your whole team takes 32% less damage.', cost: ['aetherite', 16], upgrade: 'bulwark', level: 4, cat: 'upgrades', icon: armorId(3, 1) },
  { key: 'forge1', name: 'Iron Forge', desc: 'Your forge works 50% faster.', cost: ['aetherite', 2], upgrade: 'forge', level: 1, cat: 'upgrades', icon: B.IRON_BLOCK },
  { key: 'forge2', name: 'Golden Forge', desc: 'Your forge works twice as fast.', cost: ['aetherite', 4], upgrade: 'forge', level: 2, cat: 'upgrades', icon: B.GOLD_BLOCK },
  { key: 'forge3', name: 'Emerald Forge', desc: 'Your forge starts turning out emeralds too.', cost: ['aetherite', 6], upgrade: 'forge', level: 3, cat: 'upgrades', icon: B.EMERALD_BLOCK },
  { key: 'forge4', name: 'Molten Forge', desc: 'Your forge works three times as fast.', cost: ['aetherite', 8], upgrade: 'forge', level: 4, cat: 'upgrades', icon: B.MAGMA_BLOCK },
  { key: 'spring', name: 'Mending Spring', desc: 'Teammates near your island slowly heal.', cost: ['aetherite', 1], upgrade: 'spring', level: 1, cat: 'upgrades', icon: I.GOLDEN_APPLE },
  { key: 'snare', name: 'Tripwire Snare', desc: 'The next raider to set foot on your island is exposed and slowed, and your team is warned.', cost: ['aetherite', 1], upgrade: 'snare', level: 1, cat: 'upgrades', icon: I.TRIPWIRE_HOOK },
];

export function offerVisible(o: ShopOffer, ctx: { pick: number; axe: number; greaves: number; lv: Partial<Record<UpgradeKey, number>> }): boolean {
  if (o.tool) return o.tier === Math.min(4, (o.tool === 'pick' ? ctx.pick : ctx.axe) + 1);
  if (o.greaves) return o.greaves === Math.min(3, ctx.greaves + 1);
  if (o.upgrade && o.level) {
    const cur = ctx.lv[o.upgrade] ?? 0;
    return o.level === Math.min(UPGRADE_MAX[o.upgrade], cur + 1);
  }
  return true;
}

export function offerMaxed(o: ShopOffer, ctx: { pick: number; axe: number; greaves: number; lv: Partial<Record<UpgradeKey, number>> }): boolean {
  if (o.tool) return (o.tool === 'pick' ? ctx.pick : ctx.axe) >= (o.tier ?? 0);
  if (o.greaves) return ctx.greaves >= o.greaves;
  if (o.upgrade && o.level) return (ctx.lv[o.upgrade] ?? 0) >= o.level;
  return false;
}

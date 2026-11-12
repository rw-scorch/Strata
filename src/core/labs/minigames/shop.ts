import { B } from '../../blocks';
import { I, toolId, armorId } from '../../items';

export type Currency = 'iron' | 'gold' | 'aetherite';
export const CURRENCY_ITEM: Record<Currency, number> = { iron: I.IRON_INGOT, gold: I.GOLD_INGOT, aetherite: I.AETHERITE };
export const CURRENCY_NAME: Record<Currency, string> = { iron: 'Iron', gold: 'Gold', aetherite: 'Aetherite' };

export interface ShopOffer {
  key: string;
  name: string;
  desc: string;
  cost: [Currency, number];
  give?: { id: number; count: number }[];
  teamBlock?: number;
  upgrade?: 'forge' | 'blades' | 'plating';
  cat: 'blocks' | 'combat' | 'tools' | 'supplies' | 'upgrades';
  icon: number;
}

const sword = (m: number) => toolId(m, 3);
const pick = (m: number) => toolId(m, 0);

export const SHOP: ShopOffer[] = [
  { key: 'wool', name: 'Team Wool x16', desc: 'Quick to place, quick to break. Your bridge home.', cost: ['iron', 4], teamBlock: 16, cat: 'blocks', icon: B.WHITE_WOOL },
  { key: 'planks', name: 'Oak Planks x16', desc: 'Sturdier than wool. Slows raiders down.', cost: ['gold', 4], give: [{ id: B.OAK_PLANKS, count: 16 }], cat: 'blocks', icon: B.OAK_PLANKS },
  { key: 'stone', name: 'Stone x12', desc: 'Solid defence for your hearth.', cost: ['iron', 20], give: [{ id: B.STONE, count: 12 }], cat: 'blocks', icon: B.STONE },
  { key: 'glass', name: 'Glass x8', desc: 'See your attackers coming.', cost: ['iron', 12], give: [{ id: B.GLASS, count: 8 }], cat: 'blocks', icon: B.GLASS },
  { key: 'obsidian', name: 'Obsidian x4', desc: 'The last word in hearth defence.', cost: ['aetherite', 4], give: [{ id: B.OBSIDIAN, count: 4 }], cat: 'blocks', icon: B.OBSIDIAN },
  { key: 'ladder', name: 'Ladder x8', desc: 'Climb walls, scale towers.', cost: ['iron', 4], give: [{ id: B.LADDER, count: 8 }], cat: 'blocks', icon: B.LADDER },
  { key: 'stone_sword', name: 'Stone Sword', desc: 'A reliable first upgrade.', cost: ['iron', 10], give: [{ id: sword(1), count: 1 }], cat: 'combat', icon: sword(1) },
  { key: 'iron_sword', name: 'Iron Sword', desc: 'Hits hard, swings true.', cost: ['gold', 7], give: [{ id: sword(2), count: 1 }], cat: 'combat', icon: sword(2) },
  { key: 'aeth_sword', name: 'Aetherite Sword', desc: 'The finest edge in the skies.', cost: ['aetherite', 4], give: [{ id: sword(4), count: 1 }], cat: 'combat', icon: sword(4) },
  { key: 'iron_armor', name: 'Iron Plate Set', desc: 'Chestplate and leggings. Kept when you fall.', cost: ['gold', 12], give: [{ id: armorId(1, 1), count: 1 }, { id: armorId(1, 2), count: 1 }], cat: 'combat', icon: armorId(1, 1) },
  { key: 'aeth_armor', name: 'Aetherite Plate Set', desc: 'Chestplate and leggings of the rarest metal.', cost: ['aetherite', 6], give: [{ id: armorId(3, 1), count: 1 }, { id: armorId(3, 2), count: 1 }], cat: 'combat', icon: armorId(3, 1) },
  { key: 'stone_pick', name: 'Stone Pickaxe', desc: 'Chews through stone defences.', cost: ['iron', 10], give: [{ id: pick(1), count: 1 }], cat: 'tools', icon: pick(1) },
  { key: 'iron_pick', name: 'Iron Pickaxe', desc: 'Makes short work of hearth walls.', cost: ['gold', 3], give: [{ id: pick(2), count: 1 }], cat: 'tools', icon: pick(2) },
  { key: 'iron_axe', name: 'Iron Axe', desc: 'Splits planks in a heartbeat.', cost: ['gold', 3], give: [{ id: toolId(2, 1), count: 1 }], cat: 'tools', icon: toolId(2, 1) },
  { key: 'bread', name: 'Bread x4', desc: 'Keep your strength up.', cost: ['iron', 4], give: [{ id: I.BREAD, count: 4 }], cat: 'supplies', icon: I.BREAD },
  { key: 'pork', name: 'Cooked Pork x3', desc: 'Hearty food for long fights.', cost: ['gold', 2], give: [{ id: I.COOKED_PORK, count: 3 }], cat: 'supplies', icon: I.COOKED_PORK },
  { key: 'water', name: 'Water Bucket', desc: 'Break a fall or wash raiders off a bridge.', cost: ['gold', 2], give: [{ id: I.WATER_BUCKET, count: 1 }], cat: 'supplies', icon: I.WATER_BUCKET },
  { key: 'forge', name: 'Forge Upgrade', desc: 'Your team forge works faster. Two levels.', cost: ['aetherite', 4], upgrade: 'forge', cat: 'upgrades', icon: B.IRON_BLOCK },
  { key: 'blades', name: 'Sharpened Blades', desc: 'Whole team deals +1 melee damage.', cost: ['aetherite', 6], upgrade: 'blades', cat: 'upgrades', icon: sword(2) },
  { key: 'plating', name: 'Reinforced Plating', desc: 'Whole team takes 15% less damage.', cost: ['aetherite', 6], upgrade: 'plating', cat: 'upgrades', icon: armorId(1, 1) },
];

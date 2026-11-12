import { B } from './blocks';
import { I, toolId, armorId } from './items';
import type { PlayerInv, ItemStack } from './inventory';
import { countItem, giveItem } from './inventory';

export type Profession = 'farmer' | 'librarian' | 'toolsmith' | 'armorer' | 'butcher' | 'fletcher' | 'cleric' | 'mason';
export const PROFESSIONS: Profession[] = ['farmer', 'librarian', 'toolsmith', 'armorer', 'butcher', 'fletcher', 'cleric', 'mason'];
export const PROF_TITLE: Record<Profession, string> = {
  farmer: 'Farmer', librarian: 'Librarian', toolsmith: 'Toolsmith', armorer: 'Armorer', butcher: 'Butcher', fletcher: 'Fletcher', cleric: 'Cleric', mason: 'Mason',
};
export const LEVEL_NAMES = ['Novice', 'Apprentice', 'Journeyman', 'Expert', 'Master'];
export const LEVEL_XP = [0, 10, 70, 150, 250];
const TIER_XP = [2, 5, 10, 15, 30];

export interface TradeOffer {
  cost: ItemStack[];
  give: ItemStack;
  tier: number;
  max: number;
}

const E = I.EMERALD;
const s = (id: number, count = 1): ItemStack => ({ id, count });
const o = (tier: number, cost: ItemStack[], give: ItemStack, max = 12): TradeOffer => ({ tier, cost, give, max });

export const OFFERS: Record<Profession, TradeOffer[]> = {
  farmer: [
    o(0, [s(I.WHEAT, 20)], s(E), 16), o(0, [s(E)], s(I.BREAD, 6), 16),
    o(1, [s(I.APPLE, 6)], s(E), 16), o(1, [s(E)], s(I.APPLE, 4)),
    o(2, [s(B.WHITE_WOOL, 12)], s(E)), o(2, [s(E, 3)], s(I.MUSHROOM_STEW)),
    o(3, [s(E, 4)], s(I.GOLDEN_APPLE)), o(4, [s(E, 2)], s(B.OAK_SAPLING, 4)),
  ],
  librarian: [
    o(0, [s(I.PAPER, 24)], s(E), 16), o(0, [s(E, 6)], s(B.BOOKSHELF)),
    o(1, [s(I.BOOK, 4)], s(E)), o(1, [s(E)], s(B.GLASS, 4)),
    o(2, [s(I.YELLOW_DYE, 5)], s(E)), o(2, [s(E, 3)], s(B.LADDER, 8)),
    o(3, [s(E, 5)], s(B.GLOWSTONE, 2)), o(4, [s(E, 20)], s(I.AETHERITE)),
  ],
  toolsmith: [
    o(0, [s(I.COAL, 15)], s(E), 16), o(0, [s(E)], s(toolId(1, 0))), o(0, [s(E)], s(toolId(1, 1))),
    o(1, [s(I.IRON_INGOT, 4)], s(E)), o(1, [s(E, 3)], s(toolId(2, 2))),
    o(2, [s(I.FLINT, 30)], s(E)), o(2, [s(E, 6)], s(toolId(2, 0))),
    o(3, [s(E, 8)], s(toolId(2, 1))), o(4, [s(E, 18)], s(toolId(4, 0))),
  ],
  armorer: [
    o(0, [s(I.COAL, 15)], s(E), 16), o(0, [s(E, 5)], s(armorId(1, 0))), o(0, [s(E, 4)], s(armorId(1, 3))),
    o(1, [s(I.IRON_INGOT, 4)], s(E)), o(1, [s(E, 7)], s(armorId(1, 2))),
    o(2, [s(I.GOLD_INGOT, 3)], s(E)), o(2, [s(E, 9)], s(armorId(1, 1))),
    o(3, [s(E, 12)], s(toolId(2, 3))), o(4, [s(E, 24)], s(armorId(3, 1))),
  ],
  butcher: [
    o(0, [s(I.RAW_POULTRY, 14)], s(E), 16), o(0, [s(I.RAW_PORK, 7)], s(E), 16), o(0, [s(E)], s(I.COOKED_PORK, 5)),
    o(1, [s(I.COAL, 15)], s(E)), o(1, [s(E)], s(I.COOKED_POULTRY, 8)),
    o(2, [s(I.RAW_MUTTON, 7)], s(E)), o(2, [s(E)], s(I.COOKED_MUTTON, 6)),
    o(3, [s(I.LEATHER, 6)], s(E)), o(4, [s(E, 2)], s(I.BOWL, 4)),
  ],
  fletcher: [
    o(0, [s(I.STICK, 32)], s(E), 16), o(0, [s(E)], s(I.ARROW, 16)),
    o(1, [s(I.FLINT, 26)], s(E)), o(1, [s(E, 2)], s(I.BOW)),
    o(2, [s(I.STRING, 14)], s(E), 16), o(2, [s(E)], s(I.FEATHER, 6)),
    o(3, [s(I.FEATHER, 24)], s(E), 16), o(4, [s(E, 3)], s(I.ARROW, 32)),
  ],
  cleric: [
    o(0, [s(I.ROTTEN_FLESH, 32)], s(E), 16), o(0, [s(E)], s(I.RED_DYE, 4)),
    o(1, [s(I.GOLD_INGOT, 3)], s(E)), o(1, [s(E, 3)], s(B.GLOWSTONE)),
    o(2, [s(I.BONE, 16)], s(E), 16), o(2, [s(E, 5)], s(I.GOLDEN_APPLE)),
    o(3, [s(I.BUCKET, 1)], s(E, 2)), o(4, [s(E, 5)], s(B.OBSIDIAN, 4)),
  ],
  mason: [
    o(0, [s(I.CLAY_BALL, 10)], s(E), 16), o(0, [s(E)], s(I.BRICK, 10)),
    o(1, [s(B.STONE, 20)], s(E), 16), o(1, [s(E)], s(B.STONE_BRICKS, 4)),
    o(2, [s(B.SANDSTONE, 16)], s(E), 16), o(2, [s(E)], s(B.BRICKS, 4)),
    o(3, [s(B.COBBLESTONE, 32)], s(E), 16), o(4, [s(E)], s(B.MOSSY_STONE_BRICKS, 4)),
  ],
};

export function levelFor(xp: number): number {
  let l = 0;
  for (let i = 0; i < LEVEL_XP.length; i++) if (xp >= LEVEL_XP[i]) l = i;
  return l;
}

export function unlocked(prof: Profession, xp: number): number[] {
  const lvl = levelFor(xp);
  const out: number[] = [];
  OFFERS[prof].forEach((of, i) => { if (of.tier <= lvl) out.push(i); });
  return out;
}

export function canAfford(inv: PlayerInv, of: TradeOffer): boolean {
  return of.cost.every((c) => countItem(inv, c.id) >= c.count);
}

export function performTrade(inv: PlayerInv, of: TradeOffer): ItemStack | null {
  if (!canAfford(inv, of)) return null;
  for (const c of of.cost) {
    let left = c.count;
    for (let i = 0; i < inv.slots.length && left > 0; i++) {
      const st = inv.slots[i];
      if (!st || st.id !== c.id) continue;
      const take = Math.min(left, st.count);
      st.count -= take; left -= take;
      if (st.count <= 0) inv.slots[i] = null;
    }
  }
  const left = giveItem(inv, { ...of.give });
  return left > 0 ? { id: of.give.id, count: left } : { id: of.give.id, count: 0 };
}

export function tradeXp(of: TradeOffer): number { return TIER_XP[of.tier] ?? 2; }

import { B, XV, terracottaId, woolId, COLORS as DYE_COLORS } from './blocks';
import { ENCHANTS, JavaRandom, selectEnchants } from './enchants';
import { I, toolId, armorId, dyeId } from './items';
import type { PlayerInv, ItemStack } from './inventory';
import { countItem, giveItem } from './inventory';

export type Profession = 'farmer' | 'librarian' | 'toolsmith' | 'armorer' | 'butcher' | 'fletcher' | 'cleric' | 'mason' | 'fisherman' | 'cartographer' | 'leatherworker' | 'shepherd' | 'weaponsmith';
export const PROFESSIONS: Profession[] = ['farmer', 'librarian', 'toolsmith', 'armorer', 'butcher', 'fletcher', 'cleric', 'mason', 'fisherman', 'cartographer', 'leatherworker', 'shepherd', 'weaponsmith'];
export const PROF_TITLE: Record<Profession, string> = {
  farmer: 'Farmer', librarian: 'Librarian', toolsmith: 'Toolsmith', armorer: 'Armorer', butcher: 'Butcher', fletcher: 'Fletcher', cleric: 'Cleric', mason: 'Mason',
  fisherman: 'Fisherman', cartographer: 'Cartographer', leatherworker: 'Leatherworker', shepherd: 'Shepherd', weaponsmith: 'Weaponsmith',
};
export const LEVEL_NAMES = ['Novice', 'Apprentice', 'Journeyman', 'Expert', 'Master'];
export const LEVEL_XP = [0, 10, 70, 150, 250];

export interface TradeOffer {
  cost: ItemStack[];
  give: ItemStack;
  tier: number;
  max: number;
  xp: number;
}

type Special = { book?: boolean; ench?: number; dye?: boolean; glazed?: boolean; wool?: boolean };
interface OfferDef { tier: number; cost: ItemStack[]; give: ItemStack; max: number; xp: number; sp?: Special }

const E = I.EMERALD;
const s = (id: number, count = 1): ItemStack => ({ id, count });
const o = (tier: number, cost: ItemStack[], give: ItemStack, max: number, xp: number, sp?: Special): OfferDef => ({ tier, cost, give, max, xp, sp });
const book = (tier: number, xp: number) => o(tier, [s(E), s(I.BOOK)], s(I.ENCHANTED_BOOK), 12, xp, { book: true });
const ench = (tier: number, base: number, id: number, xp: number) => o(tier, [s(E, base)], s(id), 3, xp, { ench: base });

const POOLS: Record<Profession, OfferDef[]> = {
  farmer: [
    o(0, [s(I.WHEAT, 20)], s(E), 16, 2), o(0, [s(I.POTATO, 26)], s(E), 16, 2), o(0, [s(I.CARROT, 22)], s(E), 16, 2), o(0, [s(I.BEETROOT, 15)], s(E), 16, 2), o(0, [s(E)], s(I.BREAD, 6), 16, 1),
    o(1, [s(B.PUMPKIN, 6)], s(E), 12, 10), o(1, [s(E)], s(I.PUMPKIN_PIE, 4), 12, 5), o(1, [s(E)], s(I.APPLE, 4), 16, 5),
    o(2, [s(B.MELON, 4)], s(E), 12, 20), o(2, [s(E, 3)], s(I.COOKIE, 18), 12, 10),
    o(3, [s(E)], s(B.CAKE), 12, 15),
    o(4, [s(E, 3)], s(I.GOLDEN_CARROT, 3), 12, 30), o(4, [s(E, 4)], s(I.GLISTERING_MELON, 3), 12, 30),
  ],
  librarian: [
    o(0, [s(I.PAPER, 24)], s(E), 16, 2), o(0, [s(E, 9)], s(B.BOOKSHELF), 12, 1), book(0, 1),
    o(1, [s(I.BOOK, 4)], s(E), 12, 10), o(1, [s(E)], s(B.LANTERN), 12, 5), book(1, 5),
    o(2, [s(I.INK_SAC, 5)], s(E), 12, 20), o(2, [s(E)], s(B.GLASS, 4), 12, 10), book(2, 10),
    o(3, [s(I.WRITABLE_BOOK)], s(E), 12, 30), o(3, [s(E, 4)], s(I.COMPASS), 12, 15), o(3, [s(E, 5)], s(I.CLOCK), 12, 15), book(3, 15),
    o(4, [s(E, 20)], s(I.NAME_TAG), 12, 30),
  ],
  toolsmith: [
    o(0, [s(I.COAL, 15)], s(E), 16, 2), o(0, [s(E)], s(toolId(1, 1)), 12, 1), o(0, [s(E)], s(toolId(1, 2)), 12, 1), o(0, [s(E)], s(toolId(1, 0)), 12, 1), o(0, [s(E)], s(toolId(1, 4)), 12, 1),
    o(1, [s(I.IRON_INGOT, 4)], s(E), 12, 10), o(1, [s(E, 36)], s(B.BELL), 12, 5),
    o(2, [s(I.FLINT, 30)], s(E), 12, 20), ench(2, 1, toolId(2, 1), 10), ench(2, 2, toolId(2, 2), 10), ench(2, 3, toolId(2, 0), 10), o(2, [s(E, 4)], s(toolId(4, 4)), 3, 10),
    o(3, [s(I.AETHERITE)], s(E), 12, 30), ench(3, 12, toolId(4, 1), 15), ench(3, 5, toolId(4, 2), 15),
    ench(4, 13, toolId(4, 0), 30),
  ],
  armorer: [
    o(0, [s(I.COAL, 15)], s(E), 16, 2), o(0, [s(E, 5)], s(armorId(1, 0)), 12, 1), o(0, [s(E, 9)], s(armorId(1, 1)), 12, 1), o(0, [s(E, 7)], s(armorId(1, 2)), 12, 1), o(0, [s(E, 4)], s(armorId(1, 3)), 12, 1),
    o(1, [s(I.IRON_INGOT, 4)], s(E), 12, 10), o(1, [s(E, 36)], s(B.BELL), 12, 5),
    o(2, [s(I.LAVA_BUCKET)], s(E), 12, 20), o(2, [s(I.AETHERITE)], s(E), 12, 20),
    ench(3, 14, armorId(3, 2), 15), ench(3, 8, armorId(3, 3), 15),
    ench(4, 8, armorId(3, 0), 30), ench(4, 16, armorId(3, 1), 30),
  ],
  butcher: [
    o(0, [s(I.RAW_POULTRY, 14)], s(E), 16, 2), o(0, [s(I.RAW_PORK, 7)], s(E), 16, 2),
    o(1, [s(I.COAL, 15)], s(E), 16, 2), o(1, [s(E)], s(I.COOKED_POULTRY, 8), 16, 5), o(1, [s(E)], s(I.COOKED_PORK, 5), 16, 5),
    o(2, [s(I.RAW_MUTTON, 7)], s(E), 16, 20),
    o(3, [s(600 + XV.DRIED_KELP_BLOCK, 10)], s(E), 12, 30),
  ],
  fletcher: [
    o(0, [s(I.STICK, 32)], s(E), 16, 2), o(0, [s(E)], s(I.ARROW, 16), 12, 1), o(0, [s(B.GRAVEL, 10), s(E)], s(I.FLINT, 10), 12, 1),
    o(1, [s(I.FLINT, 26)], s(E), 12, 10), o(1, [s(E, 2)], s(I.BOW), 12, 5),
    o(2, [s(I.STRING, 14)], s(E), 16, 20), o(2, [s(E, 3)], s(I.CROSSBOW), 12, 10),
    o(3, [s(I.FEATHER, 24)], s(E), 16, 30), ench(3, 2, I.BOW, 15),
    o(4, [s(I.TRIPWIRE_HOOK, 8)], s(E), 12, 30), ench(4, 3, I.CROSSBOW, 15),
  ],
  cleric: [
    o(0, [s(I.ROTTEN_FLESH, 32)], s(E), 16, 2), o(0, [s(E)], s(I.REDSTONE, 2), 12, 1),
    o(1, [s(I.GOLD_INGOT, 3)], s(E), 12, 10), o(1, [s(E)], s(I.LAPIS), 12, 5),
    o(2, [s(E, 4)], s(B.GLOWSTONE), 12, 10),
    o(3, [s(I.GLASS_BOTTLE, 9)], s(E), 12, 30),
    o(4, [s(I.NETHER_WART, 22)], s(E), 12, 30),
  ],
  mason: [
    o(0, [s(I.CLAY_BALL, 10)], s(E), 16, 2), o(0, [s(E)], s(I.BRICK, 10), 16, 1),
    o(1, [s(B.STONE, 20)], s(E), 16, 10), o(1, [s(E)], s(B.CHISELED_STONE_BRICKS, 4), 16, 5),
    o(2, [s(600 + XV.GRANITE, 16)], s(E), 16, 20), o(2, [s(600 + XV.ANDESITE, 16)], s(E), 16, 20), o(2, [s(600 + XV.DIORITE, 16)], s(E), 16, 20),
    o(2, [s(E)], s(600 + XV.DRIPSTONE_BLOCK, 4), 16, 10), o(2, [s(E)], s(600 + XV.POLISHED_ANDESITE, 4), 16, 10), o(2, [s(E)], s(600 + XV.POLISHED_DIORITE, 4), 16, 10), o(2, [s(E)], s(600 + XV.POLISHED_GRANITE, 4), 16, 10),
    o(3, [s(I.QUARTZ, 12)], s(E), 12, 30), o(3, [s(E)], s(B.TERRACOTTA), 12, 15, { dye: true }), o(3, [s(E)], s(600 + XV.GLAZED_TERRACOTTA), 12, 15, { glazed: true }),
    o(4, [s(E)], s(600 + XV.QUARTZ_PILLAR), 12, 30), o(4, [s(E)], s(600 + XV.QUARTZ_BLOCK), 12, 30),
  ],
  fisherman: [
    o(0, [s(I.STRING, 20)], s(E), 16, 2), o(0, [s(I.COAL, 10)], s(E), 16, 2),
  ],
  cartographer: [
    o(0, [s(I.PAPER, 24)], s(E), 12, 2),
    o(2, [s(I.COMPASS)], s(E), 12, 20),
  ],
  leatherworker: [
    o(0, [s(I.LEATHER, 6)], s(E), 16, 2), o(0, [s(E, 3)], s(armorId(0, 2)), 12, 1), o(0, [s(E, 7)], s(armorId(0, 1)), 12, 1),
    o(1, [s(I.FLINT, 26)], s(E), 12, 10), o(1, [s(E, 5)], s(armorId(0, 0)), 12, 5), o(1, [s(E, 4)], s(armorId(0, 3)), 12, 5),
    o(2, [s(E, 7)], s(armorId(0, 1)), 12, 10),
    o(4, [s(E, 5)], s(armorId(0, 0)), 12, 30), o(4, [s(E, 6)], s(I.SADDLE), 12, 30),
  ],
  shepherd: [
    ...(['white', 'brown', 'black', 'gray'] as const).map((c) => o(0, [s(woolId(c), 18)], s(E), 16, 2)), o(0, [s(E, 2)], s(I.SHEARS), 12, 1),
    ...(['white', 'gray', 'black', 'light_blue', 'lime'] as const).map((c) => o(1, [s(dyeId(c), 12)], s(E), 16, 10)), o(1, [s(E)], s(woolId('white')), 16, 5, { wool: true }),
    ...(['yellow', 'light_gray', 'orange', 'red', 'pink'] as const).map((c) => o(2, [s(dyeId(c), 12)], s(E), 16, 20)),
    ...(['brown', 'purple', 'blue', 'green', 'magenta', 'cyan'] as const).map((c) => o(3, [s(dyeId(c), 12)], s(E), 16, 30)),
  ],
  weaponsmith: [
    o(0, [s(I.COAL, 15)], s(E), 16, 2), o(0, [s(E, 3)], s(toolId(2, 1)), 12, 1), ench(0, 2, toolId(2, 3), 1),
    o(1, [s(I.IRON_INGOT, 4)], s(E), 12, 10), o(1, [s(E, 36)], s(B.BELL), 12, 5),
    o(2, [s(I.FLINT, 24)], s(E), 12, 20),
    o(3, [s(I.AETHERITE)], s(E), 12, 30), ench(3, 12, toolId(4, 1), 15),
    ench(4, 8, toolId(4, 3), 30),
  ],
};

export const JOB_SITES: Record<number, number> = {
  [B.COMPOSTER]: 0, [B.LECTERN]: 1, [B.SMITHING_TABLE]: 2, [B.BLAST_FURNACE]: 3, [B.SMOKER]: 4, [B.FLETCHING_TABLE]: 5, [B.BREWING_STAND]: 6, [B.STONECUTTER]: 7,
  [B.BARREL]: 8, [B.CARTOGRAPHY_TABLE]: 9, [B.CAULDRON]: 10, [B.LOOM]: 11, [B.GRINDSTONE]: 12,
};
export const JOB_BLOCK: number[] = Object.entries(JOB_SITES).sort((a, b) => a[1] - b[1]).map(([id]) => Number(id));

const BOOK_EXCLUDE = new Set(['wind_burst', 'soul_speed', 'swift_sneak']);

function materialize(d: OfferDef, r: JavaRandom): TradeOffer {
  const of: TradeOffer = { tier: d.tier, cost: d.cost.map((c) => ({ ...c })), give: { ...d.give }, max: d.max, xp: d.xp };
  if (d.sp?.book) {
    const pool = ENCHANTS.filter((e) => !BOOK_EXCLUDE.has(e.key));
    const e = pool[r.nextInt(pool.length)];
    const lv = 1 + r.nextInt(e.max);
    let price = 2 + r.nextInt(5 + lv * 10) + 3 * lv;
    if (e.treasure) price *= 2;
    of.cost[0].count = Math.min(64, price);
    of.give.en = { [e.key]: lv };
  } else if (d.sp?.ench !== undefined) {
    const lvl = 5 + r.nextInt(15);
    const list = selectEnchants(r, d.give.id, lvl, false);
    if (list.length) of.give.en = Object.fromEntries(list);
    of.cost[0].count = Math.min(64, d.sp.ench + lvl);
  } else if (d.sp?.dye) {
    of.give.id = terracottaId(DYE_COLORS[r.nextInt(DYE_COLORS.length)]);
  } else if (d.sp?.glazed) {
    of.give.id = 600 + XV.GLAZED_TERRACOTTA + r.nextInt(DYE_COLORS.length);
  } else if (d.sp?.wool) {
    of.give.id = woolId(DYE_COLORS[r.nextInt(DYE_COLORS.length)]);
  }
  return of;
}

const cache = new Map<string, TradeOffer[]>();

export function villagerOffers(prof: Profession, seed: number): TradeOffer[] {
  const key = `${prof}:${seed}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const r = new JavaRandom(seed);
  const out: TradeOffer[] = [];
  for (let tier = 0; tier < 5; tier++) {
    const pool = POOLS[prof].filter((d) => d.tier === tier);
    const pick = pool.slice();
    while (pick.length > 2) pick.splice(r.nextInt(pick.length), 1);
    for (const d of pick) out.push(materialize(d, r));
  }
  if (cache.size > 256) cache.delete(cache.keys().next().value!);
  cache.set(key, out);
  return out;
}

export const OFFERS: Record<Profession, TradeOffer[]> = Object.fromEntries(PROFESSIONS.map((p) => [p, villagerOffers(p, 0)])) as Record<Profession, TradeOffer[]>;
export const TRADE_POOLS = POOLS;

export function levelFor(xp: number): number {
  let l = 0;
  for (let i = 0; i < LEVEL_XP.length; i++) if (xp >= LEVEL_XP[i]) l = i;
  return l;
}

export function unlocked(prof: Profession, xp: number, seed = 0): number[] {
  const lvl = levelFor(xp);
  const out: number[] = [];
  villagerOffers(prof, seed).forEach((of, i) => { if (of.tier <= lvl) out.push(i); });
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

export function tradeXp(of: TradeOffer): number { return of.xp; }

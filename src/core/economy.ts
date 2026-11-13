import { B } from './blocks';
import { I, ITEMS, getItem, toolId, armorId } from './items';
import { RECIPES, SMELTING, ingredientExample } from './crafting';
import type { ItemStack } from './inventory';

export const LISTING_FEE = 0.02;
export const MIN_FEE = 1;
export const MAX_LISTINGS = 10;
export const MAX_ORDERS = 10;
export const LISTING_HOURS = 48;
export const BOX_MAX = 200;
export const MAX_PRICE = 1_000_000_000;

const BASE: [number, number][] = [
  [B.DIRT, 1], [B.GRASS, 1], [B.COBBLESTONE, 1], [B.STONE, 2], [B.SAND, 1], [B.GRAVEL, 1], [B.CLAY, 6], [B.SNOW, 2], [B.ICE, 3],
  [B.OAK_LOG, 4], [B.BIRCH_LOG, 4], [B.SPRUCE_LOG, 4], [B.JUNGLE_LOG, 4], [B.OBSIDIAN, 30], [B.MUD, 1], [B.CACTUS, 3],
  [B.SUGAR_CANE, 3], [B.DANDELION, 2], [B.POPPY, 2], [B.RED_MUSHROOM, 3], [B.BROWN_MUSHROOM, 3], [B.LILY_PAD, 4],
  [B.OAK_SAPLING, 2], [B.BIRCH_SAPLING, 2], [B.SPRUCE_SAPLING, 2], [B.JUNGLE_SAPLING, 2], [B.FERN, 1], [B.TALL_GRASS, 1],
  [I.COAL, 8], [I.CHARCOAL, 6], [I.IRON_INGOT, 25], [I.GOLD_INGOT, 40], [I.AETHERITE, 200], [I.EMERALD, 150], [I.FLINT, 3],
  [I.FEATHER, 3], [I.STRING, 4], [I.BONE, 4], [I.LEATHER, 8], [I.ROTTEN_FLESH, 2], [I.RAW_PORK, 5], [I.RAW_MUTTON, 5], [I.RAW_POULTRY, 4],
  [I.COOKED_PORK, 9], [I.COOKED_MUTTON, 9], [I.COOKED_POULTRY, 8], [I.WHEAT, 3], [I.SEEDS, 1], [I.APPLE, 6], [I.CLAY_BALL, 1],
];

let cache: Map<number, number> | null = null;

export function defaultSellPrices(): Map<number, number> {
  if (cache) return cache;
  const m = new Map<number, number>(BASE);
  const busy = new Set<number>();
  const value = (id: number): number => {
    if (m.has(id)) return m.get(id)!;
    if (busy.has(id)) return 0;
    busy.add(id);
    let best = 0;
    for (const r of RECIPES) {
      if (r.result !== id) continue;
      const ings = r.shapeless ?? r.pattern!.join('').split('').filter((c) => c !== ' ').map((c) => r.key![c]);
      let total = 0, ok = true;
      for (const ing of ings) { const v = value(ingredientExample(ing)); if (!v) { ok = false; break; } total += v; }
      if (ok) best = Math.max(best, (total * 0.9) / r.count);
    }
    for (const s of SMELTING) if (s.result === id) { const v = value(ingredientExample(s.input)); if (v) best = Math.max(best, v * 1.2); }
    busy.delete(id);
    const out = best >= 1 ? Math.floor(best) : best > 0 ? 1 : 0;
    m.set(id, out);
    return out;
  };
  for (const it of ITEMS) if (it) value(it.id);
  for (const id of [I.WATER_BUCKET, I.LAVA_BUCKET, I.BOW_PULL0, I.BOW_PULL1, I.BOW_PULL2]) m.set(id, 0);
  cache = m;
  return m;
}

export function sellValue(st: ItemStack, prices: Map<number, number>): number {
  const per = prices.get(st.id) ?? 0;
  if (!per) return 0;
  const d = getItem(st.id);
  const max = d?.tool?.durability ?? d?.durability;
  const wear = max && st.dmg ? Math.max(0, 1 - st.dmg / max) : 1;
  return Math.floor(per * st.count * wear);
}

export interface ShopEntry { key: string; id: number; count: number; price: number; }
export interface ShopCategory { id: string; name: string; icon: number; items: ShopEntry[]; }

const e = (key: string, id: number, count: number, price: number): ShopEntry => ({ key, id, count, price });

export const SHOP: ShopCategory[] = [
  { id: 'food', name: 'Food', icon: I.COOKED_PORK, items: [
    e('bread', I.BREAD, 16, 240), e('cooked_pork', I.COOKED_PORK, 16, 320), e('cooked_mutton', I.COOKED_MUTTON, 16, 320), e('cooked_poultry', I.COOKED_POULTRY, 16, 280),
    e('apple', I.APPLE, 16, 200), e('mushroom_stew', I.MUSHROOM_STEW, 1, 60), e('golden_apple', I.GOLDEN_APPLE, 1, 2500),
  ] },
  { id: 'gear', name: 'Gear', icon: toolId(4, 3), items: [
    e('iron_sword', toolId(2, 3), 1, 600), e('iron_pickaxe', toolId(2, 0), 1, 800), e('iron_axe', toolId(2, 1), 1, 800), e('iron_shovel', toolId(2, 2), 1, 300),
    e('iron_helmet', armorId(1, 0), 1, 1000), e('iron_chestplate', armorId(1, 1), 1, 1600), e('iron_leggings', armorId(1, 2), 1, 1400), e('iron_boots', armorId(1, 3), 1, 800),
    e('aetherite_sword', toolId(4, 3), 1, 6000), e('aetherite_pickaxe', toolId(4, 0), 1, 8000), e('aetherite_chestplate', armorId(3, 1), 1, 16000),
    e('bow', I.BOW, 1, 400), e('arrow', I.ARROW, 16, 120),
  ] },
  { id: 'blocks', name: 'Blocks', icon: B.BRICKS, items: [
    e('oak_log', B.OAK_LOG, 64, 1200), e('spruce_log', B.SPRUCE_LOG, 64, 1200), e('stone', B.STONE, 64, 500), e('stone_bricks', B.STONE_BRICKS, 64, 900),
    e('bricks', B.BRICKS, 64, 1500), e('glass', B.GLASS, 64, 1100), e('sandstone', B.SANDSTONE, 64, 700), e('smooth_stone', B.SMOOTH_STONE, 64, 1000),
    e('white_wool', B.WHITE_WOOL, 16, 600), e('torch', B.TORCH, 16, 120), e('glowstone', B.GLOWSTONE, 16, 1600), e('packed_ice', B.PACKED_ICE, 16, 900),
  ] },
  { id: 'farming', name: 'Farming', icon: I.WHEAT, items: [
    e('wheat_seeds', I.SEEDS, 16, 60), e('sugar_cane', B.SUGAR_CANE, 16, 200), e('cactus', B.CACTUS, 16, 200), e('bone_meal', I.BONE_MEAL, 16, 200),
    e('oak_sapling', B.OAK_SAPLING, 8, 120), e('birch_sapling', B.BIRCH_SAPLING, 8, 120), e('jungle_sapling', B.JUNGLE_SAPLING, 8, 160), e('hay_block', B.HAY_BLOCK, 8, 900),
    e('bucket', I.BUCKET, 1, 300), e('water_bucket', I.WATER_BUCKET, 1, 400),
  ] },
  { id: 'rare', name: 'Rare', icon: I.AETHERITE, items: [
    e('obsidian', B.OBSIDIAN, 8, 1600), e('bookshelf', B.BOOKSHELF, 4, 1400), e('emerald', I.EMERALD, 1, 900), e('aetherite', I.AETHERITE, 1, 1500),
    e('lily_pad', B.LILY_PAD, 8, 300), e('golden_apple_8', I.GOLDEN_APPLE, 8, 19000), e('lava_bucket', I.LAVA_BUCKET, 1, 1200),
  ] },
];

export function shopEntry(key: string): ShopEntry | null {
  for (const c of SHOP) for (const it of c.items) if (it.key === key) return it;
  return null;
}

export function money(n: number): string {
  const a = Math.abs(n), sign = n < 0 ? '-' : '';
  if (a >= 1e9) return `${sign}$${trim(a / 1e9)}B`;
  if (a >= 1e6) return `${sign}$${trim(a / 1e6)}M`;
  if (a >= 1e3) return `${sign}$${trim(a / 1e3)}K`;
  return `${sign}$${Math.floor(a)}`;
}

function trim(v: number): string { return (Math.floor(v * 10) / 10).toFixed(1).replace(/\.0$/, ''); }

export function parseMoney(s: string): number | null {
  const m = /^\$?(\d+(?:\.\d+)?)([kmb])?$/i.exec(s.trim());
  if (!m) return null;
  const mult = { k: 1e3, m: 1e6, b: 1e9 }[(m[2] ?? '').toLowerCase() as 'k' | 'm' | 'b'] ?? 1;
  const v = Math.floor(Number(m[1]) * mult);
  return Number.isFinite(v) && v > 0 && v <= MAX_PRICE ? v : null;
}

export function fee(price: number): number { return Math.max(MIN_FEE, Math.ceil(price * LISTING_FEE)); }

export interface AhListing { id: number; seller: string; sellerName: string; item: ItemStack; price: number; expires: number; }
export interface BuyOrder { id: number; buyer: string; buyerName: string; itemId: number; wanted: number; filled: number; each: number; expires: number; }
export interface EcoStats { money: number; kills: number; deaths: number; playtime: number; }

export type EcoView =
  | { v: 'shop'; cat: string | null }
  | { v: 'ah'; page: number; pages: number; tab: 'all' | 'mine'; q: string; items: AhListing[] }
  | { v: 'orders'; page: number; pages: number; tab: 'all' | 'mine'; items: BuyOrder[] }
  | { v: 'box'; items: ItemStack[] };

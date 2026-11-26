import { emptyInv, type ItemStack, type PlayerInv } from '../inventory';
import { getItem } from '../items';
import { prizeId } from './crucible';

export interface KitDef { items: (ItemStack | null)[]; armor: (ItemStack | null)[]; off: ItemStack | null; cd: number; ops: boolean; by?: string }
export type KitBook = Record<string, KitDef>;

type Spec = [string, number?, Record<string, number>?];
interface Preset { label: string; blurb: string; armor: (Spec | null)[]; off?: Spec; items: Spec[] }

const P4 = { protection: 4, unbreaking: 3 }, P2 = { protection: 2, unbreaking: 3 };
const nethArmor = (e: Record<string, number> = P4): Spec[] => [['netherite_helmet', 1, e], ['netherite_chestplate', 1, e], ['netherite_leggings', 1, { ...e, protection: Math.max(0, (e.protection ?? 0)) }], ['netherite_boots', 1, { ...e, feather_falling: 4 }]];
const diaArmor = (e: Record<string, number> = P4): Spec[] => [['diamond_helmet', 1, e], ['diamond_chestplate', 1, e], ['diamond_leggings', 1, e], ['diamond_boots', 1, { ...e, feather_falling: e.protection ? 4 : 0 }]];
const many = (s: Spec, n: number): Spec[] => Array.from({ length: n }, () => s);

export const KIT_PRESETS: Record<string, Preset> = {
  crystal: {
    label: 'Crystal', blurb: 'End crystals and respawn anchors with totems in every spare slot.',
    armor: nethArmor(), off: ['totem_of_undying'],
    items: [['netherite_sword', 1, { sharpness: 5, unbreaking: 3 }], ['end_crystal', 64], ['obsidian', 64], ['respawn_anchor', 64], ['glowstone', 64], ['ender_pearl', 16], ['golden_apple', 64], ['experience_bottle', 64], ['netherite_pickaxe', 1, { efficiency: 5, unbreaking: 3 }], ...many(['totem_of_undying'], 14)],
  },
  nethpot: {
    label: 'Nethpot', blurb: 'Netherite gear, healing splash potions and a totem.',
    armor: nethArmor(), off: ['totem_of_undying'],
    items: [['netherite_sword', 1, { sharpness: 5, fire_aspect: 2, unbreaking: 3 }], ['ender_pearl', 16], ['golden_apple', 16], ['experience_bottle', 64], ...many(['splash_potion_healing'], 22), ...many(['totem_of_undying'], 3)],
  },
  diapot: {
    label: 'Diapot', blurb: 'Diamond gear and a hotbar of healing splash potions.',
    armor: diaArmor(),
    items: [['diamond_sword', 1, { sharpness: 5, unbreaking: 3 }], ['ender_pearl', 16], ['golden_apple', 8], ...many(['splash_potion_healing'], 24)],
  },
  smp: {
    label: 'SMP', blurb: 'Survival-server endgame: netherite, shield, totems and webs.',
    armor: nethArmor(), off: ['totem_of_undying'],
    items: [['netherite_sword', 1, { sharpness: 5, fire_aspect: 2, unbreaking: 3 }], ['netherite_axe', 1, { sharpness: 5, unbreaking: 3 }], ['shield', 1, { unbreaking: 3 }], ['golden_apple', 16], ['ender_pearl', 16], ['experience_bottle', 32], ['cobweb', 16], ['water_bucket'], ['totem_of_undying'], ['totem_of_undying']],
  },
  sword: { label: 'Sword', blurb: 'Pure sword duels in plain diamond.', armor: diaArmor({}), items: [['diamond_sword']] },
  axe: { label: 'Axe', blurb: 'Axe and shield fights, with a crossbow and bow for reach.', armor: diaArmor({}), off: ['shield'], items: [['diamond_axe'], ['diamond_sword'], ['crossbow'], ['bow'], ['arrow', 6]] },
  uhc: {
    label: 'UHC', blurb: 'Build, burn and bow: buckets, blocks and golden apples.',
    armor: [['diamond_helmet', 1, { protection: 3 }], ['diamond_chestplate', 1, { protection: 2 }], ['diamond_leggings', 1, { protection: 3 }], ['diamond_boots', 1, { protection: 2 }]], off: ['shield'],
    items: [['diamond_sword', 1, { sharpness: 4 }], ['diamond_axe', 1, { efficiency: 3 }], ['bow', 1, { power: 1 }], ['crossbow', 1, { piercing: 1 }], ['lava_bucket'], ['water_bucket'], ['golden_apple', 6], ['cobblestone', 64], ['oak_planks', 64], ['diamond_pickaxe', 1, { efficiency: 3 }], ['arrow', 16], ['lava_bucket'], ['water_bucket']],
  },
  mace: { label: 'Mace', blurb: 'Leap and smash: a mace with pearls to get height.', armor: nethArmor(P2), off: ['shield'], items: [['mace', 1, { density: 5, unbreaking: 3 }], ['netherite_sword', 1, { sharpness: 5 }], ['ender_pearl', 16], ['golden_apple', 12], ['totem_of_undying']] },
  nodebuff: { label: 'NoDebuff', blurb: 'Classic potion PvP: pearls and a full stack of healing.', armor: diaArmor(P2), items: [['diamond_sword', 1, { sharpness: 3, fire_aspect: 2, unbreaking: 3 }], ['ender_pearl', 16], ['cooked_porkchop', 64], ...many(['splash_potion_healing'], 33)] },
  gapple: { label: 'Gapple', blurb: 'Enchanted diamond and a stack of golden apples.', armor: diaArmor(P4), items: [['diamond_sword', 1, { sharpness: 5, unbreaking: 3 }], ['golden_apple', 64]] },
  sumo: { label: 'Sumo', blurb: 'Empty hands. Knock them off the platform.', armor: [null, null, null, null], items: [] },
  archer: { label: 'Archer', blurb: 'Leather armour and a powerful bow.', armor: [['leather_helmet'], ['leather_chestplate'], ['leather_leggings'], ['leather_boots']], items: [['bow', 1, { power: 5, punch: 1, infinity: 1 }], ['arrow', 64]] },
};

function stack([key, n = 1, en]: Spec): ItemStack | null {
  const id = prizeId(key) ?? prizeId(key.replace('cooked_porkchop', 'cooked_pork'));
  if (id === null) return null;
  const st: ItemStack = { id, count: Math.max(1, Math.min(getItem(id)?.maxStack ?? 64, n)) };
  if (en) { const e = Object.fromEntries(Object.entries(en).filter(([, l]) => l > 0)); if (Object.keys(e).length) st.en = e; }
  return st;
}

export function presetKit(name: string): KitDef | null {
  const p = KIT_PRESETS[name];
  if (!p) return null;
  const items: (ItemStack | null)[] = Array(36).fill(null);
  let i = 0;
  for (const s of p.items) { const st = stack(s); if (st && i < 36) items[i++] = st; }
  return { items, armor: p.armor.map((a) => (a ? stack(a) : null)), off: p.off ? stack(p.off) : null, cd: 0, ops: false };
}

export function kitFromInv(inv: PlayerInv): KitDef {
  const c = (s: ItemStack | null | undefined): ItemStack | null => (s ? { ...s, en: s.en ? { ...s.en } : undefined, box: undefined } : null);
  return { items: inv.slots.slice(0, 36).map(c), armor: [0, 1, 2, 3].map((k) => c(inv.armor[k])), off: c(inv.off?.[0]), cd: 0, ops: false };
}

export function kitInvOf(k: KitDef): PlayerInv {
  const inv = emptyInv();
  const c = (s: ItemStack | null | undefined): ItemStack | null => (s && getItem(s.id) ? { ...s, en: s.en ? { ...s.en } : undefined } : null);
  k.items.slice(0, 36).forEach((s, i) => { inv.slots[i] = c(s); });
  for (let a = 0; a < 4; a++) inv.armor[a] = c(k.armor[a]);
  inv.off[0] = c(k.off);
  return inv;
}

const NAME = /^[a-z0-9_-]{1,20}$/;
export function kitName(raw: string): string | null { const n = raw.trim().toLowerCase(); return NAME.test(n) ? n : null; }

function cleanStack(s: unknown): ItemStack | null {
  if (!s || typeof s !== 'object') return null;
  const o = s as { id?: unknown; count?: unknown; en?: unknown; dmg?: unknown; nm?: unknown };
  const id = Number(o.id), count = Math.floor(Number(o.count));
  if (!Number.isFinite(id) || !getItem(id) || !(count > 0)) return null;
  const st: ItemStack = { id, count: Math.min(getItem(id)!.maxStack ?? 64, count) };
  if (o.en && typeof o.en === 'object') { const e: Record<string, number> = {}; for (const [k, l] of Object.entries(o.en as Record<string, unknown>)) if (/^[a-z_]{2,24}$/.test(k) && Number(l) > 0) e[k] = Math.min(10, Math.floor(Number(l))); if (Object.keys(e).length) st.en = e; }
  if (typeof o.nm === 'string' && o.nm) st.nm = o.nm.slice(0, 40);
  return st;
}

export function sanitizeKits(raw: unknown): KitBook {
  const out: KitBook = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>).slice(0, 40)) {
    const name = kitName(k);
    if (!name || !v || typeof v !== 'object') continue;
    const d = v as Partial<KitDef>;
    out[name] = {
      items: Array.from({ length: 36 }, (_, i) => cleanStack(d.items?.[i])),
      armor: [0, 1, 2, 3].map((i) => cleanStack(d.armor?.[i])),
      off: cleanStack(d.off),
      cd: Math.max(0, Math.min(86400, Math.floor(Number(d.cd) || 0))),
      ops: !!d.ops,
      by: typeof d.by === 'string' ? d.by.slice(0, 24) : undefined,
    };
  }
  return out;
}

export function kitSummary(k: KitDef): string {
  const n = k.items.filter(Boolean).length + k.armor.filter(Boolean).length + (k.off ? 1 : 0);
  return `${n} stack${n === 1 ? '' : 's'}${k.cd ? `, ${k.cd}s cooldown` : ''}${k.ops ? ', operators only' : ''}`;
}

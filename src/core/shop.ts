export type CosKind = 'title' | 'trail' | 'cape';
export type Rarity = 'common' | 'rare' | 'epic' | 'mythic';
export type CapePattern = 'border' | 'stripe' | 'waves' | 'chevron' | 'diamond' | 'stars' | 'sunburst' | 'rift';

export interface TitleLook { text: string; color: string; }
export interface TrailLook { colors: string[]; rise: number; size: number; rate: number; cycle?: boolean; }
export interface CapeLook { base: string; accent: string; trim: string; pattern: CapePattern; }

export interface Cosmetic {
  id: string; kind: CosKind; name: string; rarity: Rarity; desc: string;
  look: TitleLook | TrailLook | CapeLook;
}

export interface CrateDef { id: string; name: string; desc: string; pool: Rarity[]; shards: number; keys: number | null; }

export const RARITY_PRICE: Record<Rarity, number> = { common: 250, rare: 500, epic: 900, mythic: 1400 };
export const RARITY_COLOR: Record<Rarity, string> = { common: '#c8ccd2', rare: '#5aa8ff', epic: '#b47cff', mythic: '#ffcf4a' };
export const KEY_CAP = 9;
export const OFFER_SIZE = 3;

const t = (id: string, name: string, rarity: Rarity, color: string, desc: string): Cosmetic => ({ id, kind: 'title', name, rarity, desc, look: { text: name, color } });
const tr = (id: string, name: string, rarity: Rarity, desc: string, look: TrailLook): Cosmetic => ({ id, kind: 'trail', name, rarity, desc, look });
const cp = (id: string, name: string, rarity: Rarity, desc: string, look: CapeLook): Cosmetic => ({ id, kind: 'cape', name, rarity, desc, look });

export const COSMETICS: Cosmetic[] = [
  t('t_wayfarer', 'Wayfarer', 'common', '#c8d0d8', 'For those who never stop walking.'),
  t('t_stonewright', 'Stonewright', 'common', '#c2ad8f', 'Shaper of walls and towers.'),
  t('t_tinkerer', 'Tinkerer', 'common', '#e8b65c', 'Has a contraption for everything.'),
  t('t_tidecaller', 'Tidecaller', 'rare', '#4fb8e8', 'The sea answers when you call.'),
  t('t_emberheart', 'Emberheart', 'rare', '#ff7a3a', 'Warm-blooded and quick to anger.'),
  t('t_greenwarden', 'Greenwarden', 'rare', '#62d862', 'Keeper of the forest paths.'),
  t('t_voidwalker', 'Voidwalker', 'epic', '#b070ff', 'Has looked into the dark between worlds.'),
  t('t_skyshaper', 'Skyshaper', 'epic', '#9fe6ff', 'Builds where the clouds drift.'),
  t('t_starforged', 'Starforged', 'mythic', '#ffd84a', 'Tempered in the heart of a falling star.'),

  tr('tr_dustwake', 'Dustwake', 'common', 'A soft puff of road dust with every step.', { colors: ['#c9b48a', '#a8916a'], rise: 0.4, size: 0.1, rate: 6 }),
  tr('tr_leafdrift', 'Leafdrift', 'common', 'Green leaves swirl behind you.', { colors: ['#5aa83c', '#7dc94e', '#3f8a2c'], rise: -0.3, size: 0.12, rate: 5 }),
  tr('tr_frostfall', 'Frostfall', 'rare', 'Snowflakes drift down where you pass.', { colors: ['#ffffff', '#cfe8ff', '#9fd0ff'], rise: -0.6, size: 0.1, rate: 8 }),
  tr('tr_emberwake', 'Emberwake', 'rare', 'Sparks rise from your footsteps.', { colors: ['#ffb040', '#ff6a20', '#ffe080'], rise: 1.2, size: 0.09, rate: 9 }),
  tr('tr_bubblewake', 'Bubblewake', 'rare', 'A stream of bubbles rises in your wake.', { colors: ['#bfefff', '#7fd4f5', '#e8fbff'], rise: 0.9, size: 0.08, rate: 8 }),
  tr('tr_amethyst', 'Amethyst Glimmer', 'epic', 'Violet motes that glitter like geode crystal.', { colors: ['#c58bff', '#9a5cf0', '#e6c8ff'], rise: 0.5, size: 0.11, rate: 10 }),
  tr('tr_gildwake', 'Gildwake', 'epic', 'A shimmer of gold dust follows you.', { colors: ['#ffd84a', '#fff1a8', '#e8a920'], rise: 0.3, size: 0.1, rate: 10 }),
  tr('tr_prismwake', 'Prismwake', 'mythic', 'Light splits into every colour behind you.', { colors: ['#ff5555', '#ffaa33', '#ffff55', '#55ff55', '#55ccff', '#aa66ff'], rise: 0.6, size: 0.12, rate: 12, cycle: true }),

  cp('c_mantle', "Wayfarer's Mantle", 'common', 'Travel-worn wool with a stitched border.', { base: '#7a5634', accent: '#c9a26a', trim: '#4e3420', pattern: 'border' }),
  cp('c_moss', 'Moss Cloak', 'common', 'Forest green with a single bold stripe.', { base: '#3d6b2c', accent: '#8fc860', trim: '#24421a', pattern: 'stripe' }),
  cp('c_tidewater', 'Tidewater', 'rare', 'Rolling waves woven in deep blue.', { base: '#1f4f8a', accent: '#5fc4ef', trim: '#12305a', pattern: 'waves' }),
  cp('c_ember', 'Ember Banner', 'rare', 'A war banner in fire colours.', { base: '#8a1f16', accent: '#ff9a2e', trim: '#4a0e0a', pattern: 'chevron' }),
  cp('c_amethyst', 'Amethyst Regalia', 'epic', 'Royal violet set with crystal diamonds.', { base: '#4a2378', accent: '#d2a0ff', trim: '#2a1048', pattern: 'diamond' }),
  cp('c_nightglass', 'Nightglass', 'epic', 'A cloak of the night sky, stars and all.', { base: '#101428', accent: '#f4f0c8', trim: '#3a4078', pattern: 'stars' }),
  cp('c_sunforged', 'Sunforged', 'mythic', 'Gold and ivory, blazing like the noon sun.', { base: '#f2e6c4', accent: '#f0b020', trim: '#a87410', pattern: 'sunburst' }),
  cp('c_riftweave', 'Riftweave', 'mythic', 'Cloth torn from the seam between worlds.', { base: '#1a0b2e', accent: '#40e8ff', trim: '#a040ff', pattern: 'rift' }),
];

export const COS_BY_ID = new Map(COSMETICS.map((c) => [c.id, c]));

export const CRATES: CrateDef[] = [
  { id: 'wanderer', name: "Wanderer's Cache", desc: 'Pick one of three common or rare cosmetics.', pool: ['common', 'rare'], shards: 350, keys: 3 },
  { id: 'reliquary', name: 'Gilded Reliquary', desc: 'Pick one of three rare, epic or mythic cosmetics.', pool: ['rare', 'epic', 'mythic'], shards: 900, keys: null },
];

export const CRATE_BY_ID = new Map(CRATES.map((c) => [c.id, c]));

export function priceOf(c: Cosmetic): number { return RARITY_PRICE[c.rarity]; }

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function dayIndex(now: number): number { return Math.floor(now / 86400000); }

export function crateOffer(crate: CrateDef, pid: string, opened: number, day: number, owned: ReadonlySet<string>): string[] {
  const pool = COSMETICS.filter((c) => crate.pool.includes(c.rarity) && !owned.has(c.id)).map((c) => c.id);
  let seed = hash(`${pid}|${crate.id}|${day}|${opened}`);
  const out: string[] = [];
  while (pool.length && out.length < OFFER_SIZE) {
    seed = Math.imul(seed ^ (seed >>> 15), 2246822507) >>> 0;
    out.push(pool.splice(seed % pool.length, 1)[0]);
  }
  return out;
}

export interface Equipped { title?: string; trail?: string; cape?: string; }

export function cleanEquipped(e: unknown): Equipped {
  const o = (e && typeof e === 'object' ? e : {}) as Record<string, unknown>;
  const out: Equipped = {};
  for (const k of ['title', 'trail', 'cape'] as const) {
    const id = o[k];
    if (typeof id === 'string' && COS_BY_ID.get(id)?.kind === k) out[k] = id;
  }
  return out;
}

export interface ShardPack { price: string; shards: number; label: string; }

export function parsePacks(raw: unknown): ShardPack[] {
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try {
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr.filter((p): p is ShardPack => !!p && typeof p.price === 'string' && /^price_\w+$/.test(p.price) && Number.isInteger(p.shards) && p.shards > 0 && p.shards <= 100000 && typeof p.label === 'string').slice(0, 6);
  } catch { return []; }
}

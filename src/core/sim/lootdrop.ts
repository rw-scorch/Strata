import { B, XV, X, NB, makeBlock, BLOCKS } from '../blocks';
import { I, armorId, toolId, getItem } from '../items';
import type { ItemStack } from '../inventory';
import type { Rng } from '../rng';

export type LootShape = 'mound' | 'flat' | 'crater';
export type LootTier = 'light' | 'normal' | 'rich';
export interface LootEntry { key: string; min: number; max: number; chance: number; maxed?: boolean }
export interface LootCfg {
  radius: number; layers: number; chests: number; frames: number; shape: LootShape; tier: LootTier;
  rare: number; elytra: number; tp: number; morph: boolean; pillars: boolean; clear: boolean;
  blocks: [string, number][]; items: LootEntry[]; frameItems: LootEntry[];
}

export const LOOT_DEFAULTS: LootCfg = {
  radius: 5, layers: 2, chests: 4, frames: 4, shape: 'mound', tier: 'normal', rare: 0.15, elytra: 0.06, tp: 180,
  morph: true, pillars: true, clear: true, blocks: [], items: [], frameItems: [],
};

export const LOOT_LIMITS = { radius: [2, 24], layers: [1, 8], chests: [0, 40], frames: [0, 40], rare: [0, 1], elytra: [0, 1], tp: [0, 600] } as const;

export const DEFAULT_PALETTE: [number, number][] = [
  [B.GOLD_BLOCK, 30], [B.IRON_BLOCK, 24], [B.EMERALD_BLOCK, 16], [B.LAPIS_BLOCK, 14], [B.REDSTONE_BLOCK, 9], [B.COPPER_BLOCK, 10],
];

export function resolveItem(key: string, byName: (k: string) => { id: number } | undefined): number | null {
  const k = key.trim().toLowerCase().replace(/^minecraft:/, '');
  if (!k) return null;
  for (const t of [k, k.replace(/netherite/g, 'cinderite').replace(/diamond/g, 'aetherite'), k.replace(/_/g, ' ')]) {
    const d = byName(t);
    if (d) return d.id;
  }
  if (/^\d+$/.test(k) && getItem(Number(k))) return Number(k);
  return null;
}

export function blockValueOf(itemId: number): number | null {
  const it = getItem(itemId);
  if (!it || it.kind !== 'block' || it.places === undefined) return null;
  const v = makeBlock(it.places, it.placeMeta ?? 0);
  const d = BLOCKS[it.places];
  if (!d || !d.solid || d.render === 'cross') return null;
  return v;
}

function num(v: string, lo: number, hi: number): number | null {
  const n = Number(v.replace(/%$/, '')) / (v.endsWith('%') ? 100 : 1);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : null;
}

function entries(v: string): LootEntry[] | string {
  if (v === 'default' || v === 'none' || v === '') return [];
  const out: LootEntry[] = [];
  for (const part of v.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 40)) {
    const [k, cnt = '1', ch = '1'] = part.split(':');
    const maxed = k.endsWith('+');
    const [a, b = a] = cnt.split('-');
    const min = Math.max(1, Math.min(64, Math.floor(Number(a)) || 1)), max = Math.max(min, Math.min(64, Math.floor(Number(b)) || min));
    const chance = num(ch, 0, 1);
    if (chance === null) return `Bad chance in "${part}"`;
    out.push({ key: maxed ? k.slice(0, -1) : k, min, max, chance, maxed });
  }
  return out;
}

const KEYS: Record<string, keyof LootCfg> = { r: 'radius', radius: 'radius', size: 'radius', l: 'layers', layers: 'layers', depth: 'layers', c: 'chests', chests: 'chests', f: 'frames', frames: 'frames', shape: 'shape', tier: 'tier', rare: 'rare', rarity: 'rare', elytra: 'elytra', tp: 'tp', time: 'tp', morph: 'morph', pillars: 'pillars', clear: 'clear', b: 'blocks', blocks: 'blocks', i: 'items', items: 'items', fi: 'frameItems', frameitems: 'frameItems' };

export function parseLootArgs(base: LootCfg, args: string[]): { cfg: LootCfg; err?: string } {
  const cfg: LootCfg = { ...base, blocks: [...base.blocks], items: [...base.items], frameItems: [...base.frameItems] };
  for (const a of args) {
    const eq = a.indexOf('=');
    if (eq < 1) return { cfg, err: `Expected key=value, got "${a}"` };
    const key = KEYS[a.slice(0, eq).toLowerCase()];
    const v = a.slice(eq + 1).toLowerCase();
    if (!key) return { cfg, err: `Unknown lootdrop option "${a.slice(0, eq)}"` };
    switch (key) {
      case 'radius': case 'layers': case 'chests': case 'frames': case 'tp': { const [lo, hi] = LOOT_LIMITS[key]; const n = num(v, lo, hi); if (n === null) return { cfg, err: `${key} must be a number` }; cfg[key] = Math.round(n); break; }
      case 'rare': case 'elytra': { const n = num(v, 0, 1); if (n === null) return { cfg, err: `${key} must be 0-1 or a percent` }; cfg[key] = n; break; }
      case 'shape': if (v !== 'mound' && v !== 'flat' && v !== 'crater') return { cfg, err: 'shape is mound, flat or crater' }; cfg.shape = v; break;
      case 'tier': if (v !== 'light' && v !== 'normal' && v !== 'rich') return { cfg, err: 'tier is light, normal or rich' }; cfg.tier = v; break;
      case 'morph': case 'pillars': case 'clear': cfg[key] = v === 'on' || v === 'true' || v === '1' || v === 'yes'; break;
      case 'blocks': {
        if (v === 'default' || v === 'none' || v === '') { cfg.blocks = []; break; }
        const list: [string, number][] = [];
        for (const part of v.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 24)) { const [k, w = '1'] = part.split(':'); const n = num(w, 0, 1000); if (n === null) return { cfg, err: `Bad weight in "${part}"` }; list.push([k, n]); }
        cfg.blocks = list;
        break;
      }
      case 'items': case 'frameItems': { const e = entries(v); if (typeof e === 'string') return { cfg, err: e }; cfg[key] = e; break; }
    }
  }
  return { cfg };
}

export function lootArgs(c: LootCfg): string {
  const ent = (e: LootEntry[]) => e.map((x) => `${x.key}${x.maxed ? '+' : ''}:${x.min === x.max ? x.min : `${x.min}-${x.max}`}:${+x.chance.toFixed(3)}`).join(',');
  const parts = [`r=${c.radius}`, `l=${c.layers}`, `c=${c.chests}`, `f=${c.frames}`, `shape=${c.shape}`, `tier=${c.tier}`, `rare=${+c.rare.toFixed(3)}`, `elytra=${+c.elytra.toFixed(3)}`, `tp=${c.tp}`, `morph=${c.morph ? 'on' : 'off'}`, `pillars=${c.pillars ? 'on' : 'off'}`, `clear=${c.clear ? 'on' : 'off'}`];
  if (c.blocks.length) parts.push(`b=${c.blocks.map(([k, w]) => `${k}:${w}`).join(',')}`);
  if (c.items.length) parts.push(`i=${ent(c.items)}`);
  if (c.frameItems.length) parts.push(`fi=${ent(c.frameItems)}`);
  return parts.join(' ');
}

export function sanitizeLootCfg(raw: unknown): LootCfg {
  if (!raw || typeof raw !== 'object') return { ...LOOT_DEFAULTS };
  try { return parseLootArgs(LOOT_DEFAULTS, lootArgs({ ...LOOT_DEFAULTS, ...(raw as Partial<LootCfg>) }).split(' ')).cfg; } catch { return { ...LOOT_DEFAULTS }; }
}

export function palette(c: LootCfg, byName: (k: string) => { id: number } | undefined): [number, number][] {
  const out: [number, number][] = [];
  if (c.blocks.length) {
    for (const [k, w] of c.blocks) { const id = resolveItem(k, byName); const v = id !== null ? blockValueOf(id) : null; if (v !== null && w > 0) out.push([v, w]); }
    if (out.length) return out;
  }
  out.push(...DEFAULT_PALETTE);
  if (c.rare > 0) { out.push([B.AETHERITE_BLOCK, 4 * c.rare]); out.push([X(XV.CINDERITE_BLOCK), 1.2 * c.rare]); }
  return out;
}

export function pick<T>(r: Rng, list: [T, number][]): T {
  let tot = 0;
  for (const [, w] of list) tot += w;
  let t = r.next() * tot;
  for (const [v, w] of list) { t -= w; if (t <= 0) return v; }
  return list[list.length - 1][0];
}

type Gen = () => ItemStack | null;

export function chestLoot(r: Rng, c: LootCfg, byName: (k: string) => { id: number } | undefined, maxEnchant: (s: ItemStack) => void, enchantSome: (s: ItemStack) => void): (ItemStack | null)[] {
  const items: (ItemStack | null)[] = new Array(27).fill(null);
  const put = (s: ItemStack | null) => { if (!s) return; for (let k = 0; k < 40; k++) { const i = r.int(27); if (!items[i]) { items[i] = s; return; } } };
  const n = (a: number, b: number) => a + r.int(b - a + 1);
  if (c.items.length) {
    for (const e of c.items) {
      if (!r.chance(e.chance)) continue;
      const id = resolveItem(e.key, byName);
      if (id === null) continue;
      const st: ItemStack = { id, count: n(e.min, e.max) };
      if (e.maxed) maxEnchant(st);
      put(st);
    }
    return items;
  }
  const gear = (tier: number, maxed: boolean): Gen => () => { const st: ItemStack = r.int(2) ? { id: armorId(tier, r.int(4)), count: 1 } : { id: toolId(tier === 4 ? 5 : 4, [0, 1, 3][r.int(3)]), count: 1 }; if (maxed) maxEnchant(st); else enchantSome(st); return st; };
  const tables: Record<LootTier, { rolls: [number, number]; pool: [Gen, number][] }> = {
    light: { rolls: [3, 5], pool: [
      [() => ({ id: I.BREAD, count: n(3, 8) }), 3], [() => ({ id: I.IRON_INGOT, count: n(2, 8) }), 3], [() => ({ id: I.GOLD_INGOT, count: n(2, 6) }), 2],
      [() => ({ id: I.EXPERIENCE_BOTTLE, count: n(4, 12) }), 2], [() => ({ id: I.ARROW, count: n(8, 24) }), 2], [() => ({ id: I.EMERALD, count: n(1, 4) }), 2],
      [() => ({ id: I.GOLDEN_APPLE, count: n(1, 2) }), 0.8], [() => ({ id: I.AETHERITE, count: n(1, 2) }), 0.5],
    ] },
    normal: { rolls: [4, 6], pool: [
      [() => ({ id: I.IRON_INGOT, count: n(4, 12) }), 3], [() => ({ id: I.GOLD_INGOT, count: n(4, 10) }), 2.5], [() => ({ id: I.EMERALD, count: n(2, 8) }), 2],
      [() => ({ id: I.GOLDEN_APPLE, count: n(1, 3) }), 1.4], [() => ({ id: I.ENDER_PEARL, count: n(2, 6) }), 1.4], [() => ({ id: I.EXPERIENCE_BOTTLE, count: n(8, 20) }), 2],
      [() => ({ id: I.FIREWORK_ROCKET, count: n(8, 24), fl: 2 }), 1.4], [() => ({ id: I.AETHERITE, count: n(1, 4) }), 1], [() => ({ id: I.ENCHANTED_BOOK, count: 1 }), 0.8],
      [gear(3, false), 0.7], [() => ({ id: I.CINDERITE_SCRAP, count: n(1, 2) }), 0.25],
    ] },
    rich: { rolls: [5, 8], pool: [
      [() => ({ id: I.AETHERITE, count: n(3, 10) }), 2], [() => ({ id: B.EMERALD_BLOCK, count: n(1, 4) }), 1.5], [() => ({ id: I.GOLDEN_APPLE, count: n(2, 6) }), 1.5],
      [() => ({ id: I.ENDER_PEARL, count: n(4, 12) }), 1.2], [() => ({ id: I.EXPERIENCE_BOTTLE, count: n(16, 40) }), 1.5], [() => ({ id: I.FIREWORK_ROCKET, count: n(16, 48), fl: 3 }), 1.2],
      [gear(3, true), 0.9], [gear(4, false), 0.4], [() => ({ id: I.CINDERITE_INGOT, count: 1 }), 0.35], [() => ({ id: I.UPGRADE_TEMPLATE, count: 1 }), 0.3], [() => ({ id: I.ENCHANTED_BOOK, count: 1 }), 1],
    ] },
  };
  const t = tables[c.tier];
  for (let k = 0, m = n(t.rolls[0], t.rolls[1]); k < m; k++) { const st = pick(r, t.pool)(); if (st?.id === I.ENCHANTED_BOOK) enchantSome(st); put(st); }
  return items;
}

export function frameLoot(r: Rng, c: LootCfg, byName: (k: string) => { id: number } | undefined, maxEnchant: (s: ItemStack) => void, enchantSome: (s: ItemStack) => void): ItemStack {
  if (c.frameItems.length) {
    const ok = c.frameItems.filter((e) => resolveItem(e.key, byName) !== null);
    if (ok.length) {
      const e = pick(r, ok.map((x) => [x, Math.max(0.001, x.chance)] as [LootEntry, number]));
      const st: ItemStack = { id: resolveItem(e.key, byName)!, count: 1 };
      if (e.maxed) maxEnchant(st);
      return st;
    }
  }
  const rich = c.tier === 'rich', light = c.tier === 'light';
  const pool: [() => ItemStack, number][] = [
    [() => ({ id: I.GOLDEN_APPLE, count: 1 }), 3], [() => ({ id: I.ENDER_PEARL, count: 1 }), 3], [() => ({ id: I.AETHERITE, count: 1 }), light ? 1 : 3],
    [() => ({ id: I.EMERALD, count: 1 }), 3], [() => { const s: ItemStack = { id: I.ENCHANTED_BOOK, count: 1 }; enchantSome(s); return s; }, 2],
    [() => { const s: ItemStack = { id: toolId(4, 0), count: 1 }; if (rich) maxEnchant(s); else enchantSome(s); return s; }, light ? 0.3 : 1.2],
    [() => { const s: ItemStack = { id: toolId(4, 1), count: 1 }; enchantSome(s); return s; }, light ? 0.3 : 1],
    [() => ({ id: I.CINDERITE_INGOT, count: 1 }), rich ? 0.6 : 0.1],
  ];
  return pick(r, pool)();
}


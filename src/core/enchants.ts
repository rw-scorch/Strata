import { I } from './items';
import type { ItemStack } from './inventory';

export type Cat = 'sword' | 'axe' | 'pick' | 'shovel' | 'hoe' | 'head' | 'chest' | 'legs' | 'feet' | 'bow' | 'crossbow' | 'mace' | 'spear' | 'shears' | 'flint' | 'book';

export interface EnchantDef {
  key: string; name: string; max: number; weight: number; anvil: number;
  min: [number, number]; maxc: [number, number];
  supp: Cat[]; prim?: Cat[]; group?: string; treasure?: boolean; curse?: boolean;
}

const ARMOR: Cat[] = ['head', 'chest', 'legs', 'feet'];
const MINING: Cat[] = ['pick', 'axe', 'shovel', 'hoe'];
const MELEE: Cat[] = ['sword', 'spear'];
const SHARP: Cat[] = ['sword', 'axe', 'spear'];
const DURABLE: Cat[] = [...ARMOR, ...MINING, 'sword', 'bow', 'crossbow', 'mace', 'spear', 'shears', 'flint'];

export const ENCHANTS: EnchantDef[] = [
  { key: 'protection', name: 'Protection', max: 4, weight: 10, anvil: 1, min: [1, 11], maxc: [12, 11], supp: ARMOR, group: 'armor' },
  { key: 'fire_protection', name: 'Fire Protection', max: 4, weight: 5, anvil: 2, min: [10, 8], maxc: [18, 8], supp: ARMOR, group: 'armor' },
  { key: 'feather_falling', name: 'Feather Falling', max: 4, weight: 5, anvil: 2, min: [5, 6], maxc: [11, 6], supp: ['feet'] },
  { key: 'blast_protection', name: 'Blast Protection', max: 4, weight: 2, anvil: 4, min: [5, 8], maxc: [13, 8], supp: ARMOR, group: 'armor' },
  { key: 'projectile_protection', name: 'Projectile Protection', max: 4, weight: 5, anvil: 2, min: [3, 6], maxc: [9, 6], supp: ARMOR, group: 'armor' },
  { key: 'respiration', name: 'Respiration', max: 3, weight: 2, anvil: 4, min: [10, 10], maxc: [40, 10], supp: ['head'] },
  { key: 'aqua_affinity', name: 'Aqua Affinity', max: 1, weight: 2, anvil: 4, min: [1, 0], maxc: [41, 0], supp: ['head'] },
  { key: 'thorns', name: 'Thorns', max: 3, weight: 1, anvil: 8, min: [10, 20], maxc: [60, 20], supp: ARMOR, prim: ['chest'] },
  { key: 'depth_strider', name: 'Depth Strider', max: 3, weight: 2, anvil: 4, min: [10, 10], maxc: [25, 10], supp: ['feet'], group: 'boots' },
  { key: 'sharpness', name: 'Sharpness', max: 5, weight: 10, anvil: 1, min: [1, 11], maxc: [21, 11], supp: SHARP, prim: MELEE, group: 'damage' },
  { key: 'smite', name: 'Smite', max: 5, weight: 5, anvil: 2, min: [5, 8], maxc: [25, 8], supp: [...SHARP, 'mace'], prim: MELEE, group: 'damage' },
  { key: 'bane_of_arthropods', name: 'Bane of Arthropods', max: 5, weight: 5, anvil: 2, min: [5, 8], maxc: [25, 8], supp: [...SHARP, 'mace'], prim: MELEE, group: 'damage' },
  { key: 'knockback', name: 'Knockback', max: 2, weight: 5, anvil: 2, min: [5, 20], maxc: [55, 20], supp: MELEE },
  { key: 'fire_aspect', name: 'Fire Aspect', max: 2, weight: 2, anvil: 4, min: [10, 20], maxc: [60, 20], supp: [...MELEE, 'mace'], prim: MELEE },
  { key: 'looting', name: 'Looting', max: 3, weight: 2, anvil: 4, min: [15, 9], maxc: [65, 9], supp: MELEE },
  { key: 'sweeping_edge', name: 'Sweeping Edge', max: 3, weight: 2, anvil: 4, min: [5, 9], maxc: [20, 9], supp: ['sword'] },
  { key: 'efficiency', name: 'Efficiency', max: 5, weight: 10, anvil: 1, min: [1, 10], maxc: [51, 10], supp: [...MINING, 'shears'], prim: MINING },
  { key: 'silk_touch', name: 'Silk Touch', max: 1, weight: 1, anvil: 8, min: [15, 0], maxc: [65, 0], supp: MINING, group: 'mining' },
  { key: 'unbreaking', name: 'Unbreaking', max: 3, weight: 5, anvil: 2, min: [5, 8], maxc: [55, 8], supp: DURABLE },
  { key: 'fortune', name: 'Fortune', max: 3, weight: 2, anvil: 4, min: [15, 9], maxc: [65, 9], supp: MINING, group: 'mining' },
  { key: 'power', name: 'Power', max: 5, weight: 10, anvil: 1, min: [1, 10], maxc: [16, 10], supp: ['bow'] },
  { key: 'punch', name: 'Punch', max: 2, weight: 2, anvil: 4, min: [12, 20], maxc: [37, 20], supp: ['bow'] },
  { key: 'flame', name: 'Flame', max: 1, weight: 2, anvil: 4, min: [20, 0], maxc: [50, 0], supp: ['bow'] },
  { key: 'infinity', name: 'Infinity', max: 1, weight: 1, anvil: 8, min: [20, 0], maxc: [50, 0], supp: ['bow'], group: 'bow' },
  { key: 'multishot', name: 'Multishot', max: 1, weight: 2, anvil: 4, min: [20, 0], maxc: [50, 0], supp: ['crossbow'], group: 'crossbow' },
  { key: 'quick_charge', name: 'Quick Charge', max: 3, weight: 5, anvil: 2, min: [12, 20], maxc: [50, 0], supp: ['crossbow'] },
  { key: 'piercing', name: 'Piercing', max: 4, weight: 10, anvil: 1, min: [1, 10], maxc: [50, 0], supp: ['crossbow'], group: 'crossbow' },
  { key: 'density', name: 'Density', max: 5, weight: 5, anvil: 2, min: [5, 8], maxc: [25, 8], supp: ['mace'], group: 'damage' },
  { key: 'breach', name: 'Breach', max: 4, weight: 2, anvil: 4, min: [15, 9], maxc: [65, 9], supp: ['mace'], group: 'damage' },
  { key: 'lunge', name: 'Lunge', max: 3, weight: 5, anvil: 2, min: [5, 8], maxc: [25, 8], supp: ['spear'] },
  { key: 'mending', name: 'Mending', max: 1, weight: 2, anvil: 4, min: [25, 25], maxc: [75, 25], supp: DURABLE, group: 'bow', treasure: true },
  { key: 'wind_burst', name: 'Wind Burst', max: 3, weight: 2, anvil: 4, min: [15, 9], maxc: [65, 9], supp: ['mace'], treasure: true },
  { key: 'binding_curse', name: 'Curse of Binding', max: 1, weight: 1, anvil: 8, min: [25, 0], maxc: [50, 0], supp: ARMOR, treasure: true, curse: true },
  { key: 'vanishing_curse', name: 'Curse of Vanishing', max: 1, weight: 1, anvil: 8, min: [25, 0], maxc: [50, 0], supp: DURABLE, treasure: true, curse: true },
];

export const ENCH = new Map(ENCHANTS.map((e) => [e.key, e]));

export function minCost(e: EnchantDef, lvl: number): number { return e.min[0] + e.min[1] * (lvl - 1); }
export function maxCost(e: EnchantDef, lvl: number): number { return e.maxc[0] + e.maxc[1] * (lvl - 1); }

export function compatible(a: string, b: string): boolean {
  if (a === b) return false;
  const ea = ENCH.get(a), eb = ENCH.get(b);
  if (!ea || !eb) return false;
  return !(ea.group && ea.group === eb.group);
}

export function catOf(id: number): Cat | null {
  if (id >= 300 && id < 325) return (['pick', 'axe', 'shovel', 'sword', 'hoe'] as Cat[])[(id - 300) % 5];
  if (id >= 330 && id < 346) return ARMOR[(id - 330) % 4];
  if (id === I.BOW) return 'bow';
  if (id === I.CROSSBOW) return 'crossbow';
  if (id === I.MACE) return 'mace';
  if (id >= I.SPEAR && id < I.SPEAR + 6) return 'spear';
  if (id === I.SHEARS) return 'shears';
  if (id === I.FLINT_AND_STEEL) return 'flint';
  if (id === I.BOOK || id === I.ENCHANTED_BOOK) return 'book';
  return null;
}

const TOOL_ENCH = [15, 5, 14, 22, 10];
const ARMOR_ENCH = [15, 9, 25, 10];
const SPEAR_ENCH = [15, 5, 14, 22, 10, 13];

export function enchantability(id: number): number {
  if (id >= 300 && id < 325) return TOOL_ENCH[Math.floor((id - 300) / 5)];
  if (id >= 330 && id < 346) return ARMOR_ENCH[Math.floor((id - 330) / 4)];
  if (id >= I.SPEAR && id < I.SPEAR + 6) return SPEAR_ENCH[id - I.SPEAR];
  if (id === I.MACE) return 15;
  if (id === I.BOW || id === I.CROSSBOW || id === I.BOOK) return 1;
  return 0;
}

export function supports(key: string, id: number): boolean {
  const e = ENCH.get(key), c = catOf(id);
  if (!e || !c) return false;
  return c === 'book' || e.supp.includes(c);
}

function primary(e: EnchantDef, id: number): boolean {
  const c = catOf(id);
  if (!c) return false;
  if (c === 'book') return true;
  return (e.prim ?? e.supp).includes(c);
}

export function lvl(s: ItemStack | null | undefined, key: string): number { return s?.en?.[key] ?? 0; }
export function isEnchanted(s: ItemStack | null | undefined): boolean { return !!s?.en && Object.keys(s.en).length > 0; }

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
export function roman(n: number): string { return ROMAN[n] ?? String(n); }
export function enchantLabel(key: string, level: number): string {
  const e = ENCH.get(key);
  if (!e) return key;
  return e.max === 1 && level === 1 ? e.name : `${e.name} ${roman(level)}`;
}

export class JavaRandom {
  private seed = 0n;
  private static readonly MUL = 0x5deece66dn;
  private static readonly MASK = (1n << 48n) - 1n;
  constructor(seed = 0) { this.setSeed(seed); }
  setSeed(s: number): void { this.seed = (BigInt.asIntN(64, BigInt(Math.trunc(s))) ^ JavaRandom.MUL) & JavaRandom.MASK; }
  next(bits: number): number {
    this.seed = (this.seed * JavaRandom.MUL + 0xbn) & JavaRandom.MASK;
    return Number(BigInt.asIntN(32, this.seed >> BigInt(48 - bits)));
  }
  nextInt(bound?: number): number {
    if (bound === undefined) return this.next(32);
    if (bound <= 0) throw new Error('bound must be positive');
    if ((bound & -bound) === bound) return Number((BigInt(bound) * BigInt(this.next(31))) >> 31n);
    let bits: number, val: number;
    do { bits = this.next(31); val = bits % bound; } while (bits - val + (bound - 1) < 0 || bits - val + (bound - 1) > 0x7fffffff);
    return val;
  }
  nextFloat(): number { return this.next(24) / (1 << 24); }
}

export function tableCost(r: JavaRandom, slot: number, shelves: number, id: number): number {
  if (enchantability(id) <= 0) return 0;
  const b = Math.min(15, shelves);
  const i = r.nextInt(8) + 1 + (b >> 1) + r.nextInt(b + 1);
  if (slot === 0) return Math.max(Math.trunc(i / 3), 1);
  if (slot === 1) return Math.trunc((i * 2) / 3) + 1;
  return Math.max(i, b * 2);
}

const fround = Math.fround;

export function selectEnchants(r: JavaRandom, id: number, level: number, treasure = false): [string, number][] {
  const out: [string, number][] = [];
  const ench = enchantability(id);
  if (ench <= 0) return out;
  level += 1 + r.nextInt(Math.trunc(ench / 4) + 1) + r.nextInt(Math.trunc(ench / 4) + 1);
  const f = fround((fround(r.nextFloat() + r.nextFloat()) - 1) * fround(0.15));
  level = Math.max(1, Math.floor(fround(level + fround(level * f)) + 0.5));
  let avail: [EnchantDef, number][] = [];
  for (const e of ENCHANTS) {
    if ((e.treasure && !treasure) || !primary(e, id)) continue;
    for (let l = e.max; l >= 1; l--) if (level >= minCost(e, l) && level <= maxCost(e, l)) { avail.push([e, l]); break; }
  }
  const pick = (): [EnchantDef, number] | null => {
    const total = avail.reduce((n, [e]) => n + e.weight, 0);
    if (total <= 0) return null;
    let j = r.nextInt(total);
    for (const a of avail) { j -= a[0].weight; if (j < 0) return a; }
    return null;
  };
  if (!avail.length) return out;
  const first = pick();
  if (first) out.push([first[0].key, first[1]]);
  while (r.nextInt(50) <= level) {
    if (out.length) { const last = out[out.length - 1][0]; avail = avail.filter(([e]) => compatible(e.key, last)); }
    if (!avail.length) break;
    const p = pick();
    if (p) out.push([p[0].key, p[1]]);
    level = Math.trunc(level / 2);
  }
  return out;
}

export interface TableOffer { cost: number; clue: string | null; clueLvl: number; }

export function tableList(seed: number, id: number, slot: number, cost: number): [string, number][] {
  const r = new JavaRandom(seed + slot);
  const list = selectEnchants(r, id, cost);
  if (id === I.BOOK && list.length > 1) list.splice(r.nextInt(list.length), 1);
  return list;
}

export function tableOffers(seed: number, stack: ItemStack | null, shelves: number): TableOffer[] {
  const none = [0, 1, 2].map(() => ({ cost: 0, clue: null, clueLvl: 0 }));
  if (!stack || stack.count < 1 || isEnchanted(stack) || enchantability(stack.id) <= 0) return none;
  const r = new JavaRandom(seed);
  const costs = [0, 1, 2].map((j) => { const c = tableCost(r, j, shelves, stack.id); return c < j + 1 ? 0 : c; });
  return costs.map((cost, j) => {
    if (cost <= 0) return { cost: 0, clue: null, clueLvl: 0 };
    const list = tableList(seed, stack.id, j, cost);
    if (!list.length) return { cost, clue: null, clueLvl: 0 };
    const e = list[r.nextInt(list.length)];
    return { cost, clue: e[0], clueLvl: e[1] };
  });
}

export interface AnvilResult { stack: ItemStack | null; cost: number; tooExpensive: boolean; useMaterial: number; }

export function repairMaterial(id: number): number | null {
  if (id >= 300 && id < 325) return [-1, 4, I.IRON_INGOT, I.GOLD_INGOT, I.AETHERITE][Math.floor((id - 300) / 5)];
  if (id >= 330 && id < 346) return [I.LEATHER, I.IRON_INGOT, I.GOLD_INGOT, I.AETHERITE][Math.floor((id - 330) / 4)];
  if (id >= I.SPEAR && id < I.SPEAR + 6) return [-1, 4, I.IRON_INGOT, I.GOLD_INGOT, I.AETHERITE, I.COPPER_INGOT][id - I.SPEAR];
  if (id === I.MACE) return I.IRON_INGOT;
  return null;
}

export function anvilResult(left: ItemStack | null, right: ItemStack | null, name: string | null, maxDur: (id: number) => number, creative: boolean, planks: (id: number) => boolean = () => false): AnvilResult {
  const fail: AnvilResult = { stack: null, cost: 0, tooExpensive: false, useMaterial: 0 };
  if (!left) return fail;
  const out: ItemStack = { id: left.id, count: left.count };
  if (left.dmg) out.dmg = left.dmg;
  if (left.ld) out.ld = left.ld;
  if (left.en) out.en = { ...left.en };
  if (left.nm) out.nm = left.nm;
  let cost = 0, useMaterial = 0;
  const base = (left.rc ?? 0) + (right?.rc ?? 0);
  let renameCost = 0;
  if (right) {
    const book = right.id === I.ENCHANTED_BOOK && !!right.en;
    const max = maxDur(left.id);
    const mat = repairMaterial(left.id);
    const isMat = max > 0 && (mat === right.id || (mat === -1 && planks(right.id)));
    if (isMat && (left.dmg ?? 0) > 0) {
      let dmg = left.dmg ?? 0, n = 0;
      let step = Math.min(dmg, Math.trunc(max / 4));
      while (step > 0 && n < right.count) { dmg -= step; cost++; n++; step = Math.min(dmg, Math.trunc(max / 4)); }
      if (dmg > 0) out.dmg = dmg; else delete out.dmg;
      useMaterial = n;
    } else if (isMat) return fail;
    else {
      if (!book && (right.id !== left.id || max <= 0) && !(left.id === I.ENCHANTED_BOOK && book)) return fail;
      if (!book && max > 0 && left.id === right.id) {
        const a = max - (left.dmg ?? 0), b = max - (right.dmg ?? 0);
        const dur = a + b + Math.trunc((max * 12) / 100);
        const dmg = Math.max(0, max - dur);
        if (dmg < (left.dmg ?? 0)) { if (dmg > 0) out.dmg = dmg; else delete out.dmg; cost += 2; }
      }
      let any = false, bad = false;
      const en = { ...(out.en ?? {}) };
      for (const [k, rl] of Object.entries(right.en ?? {})) {
        const e = ENCH.get(k);
        if (!e) continue;
        const cur = en[k] ?? 0;
        let nl = cur === rl ? rl + 1 : Math.max(rl, cur);
        const ok = (left.id === I.ENCHANTED_BOOK || creative || supports(k, left.id)) && Object.keys(en).every((o) => o === k || compatible(o, k));
        if (!ok) { bad = true; cost += 1; continue; }
        any = true;
        if (nl > e.max) nl = e.max;
        en[k] = nl;
        let m = e.anvil;
        if (book) m = Math.max(1, Math.trunc(m / 2));
        cost += m * nl;
        if (left.count > 1) cost = 40;
      }
      if (bad && !any) return fail;
      if (Object.keys(en).length) out.en = en;
    }
  }
  const nm = name?.trim().slice(0, 50) || null;
  if (nm !== (left.nm ?? null)) {
    if (nm) { renameCost = 1; out.nm = nm; } else if (left.nm) { renameCost = 1; delete out.nm; }
  }
  cost += renameCost;
  if (cost <= 0) return fail;
  let total = base + cost;
  if (renameCost > 0 && renameCost === cost && total >= 40) total = 39;
  const tooExpensive = total >= 40 && !creative;
  if (right || renameCost < cost) {
    let rc = Math.max(left.rc ?? 0, right?.rc ?? 0);
    if (!(renameCost > 0 && renameCost === cost)) rc = rc * 2 + 1;
    if (rc > 0) out.rc = rc;
  }
  return { stack: out, cost: total, tooExpensive, useMaterial };
}

export function priorWork(uses: number): number { return 2 ** uses - 1; }

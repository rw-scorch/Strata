import { getItem } from './items';
import { TAGS, DataRecipes, Recipe, SmeltRecipe, Ingredient } from './crafting';

export const MAX_DATA_RECIPES = 600;
export const MAX_DATA_BYTES = 96 * 1024;

const GROUPS = new Set<Recipe['group']>(['basics', 'building', 'tools', 'combat', 'food', 'decor']);
const ID_RE = /^[a-z0-9_.:/-]{1,96}$/;

function cleanIng(v: unknown): Ingredient | null {
  if (typeof v === 'number') return getItem(v) ? v : null;
  if (typeof v === 'string') return TAGS[v] ? v : null;
  if (Array.isArray(v)) {
    const ids = [...new Set(v.filter((x): x is number => typeof x === 'number' && !!getItem(x)))].slice(0, 48);
    if (!ids.length) return null;
    return ids.length === 1 ? ids[0] : ids;
  }
  return null;
}

function cleanRecipe(v: unknown): Recipe | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const id = typeof o.id === 'string' && ID_RE.test(o.id) ? o.id : null;
  const result = typeof o.result === 'number' && getItem(o.result) ? o.result : null;
  if (!id || result === null) return null;
  const count = Math.max(1, Math.min(64, Math.floor(Number(o.count) || 1)));
  const group = GROUPS.has(o.group as Recipe['group']) ? (o.group as Recipe['group']) : 'basics';
  if (Array.isArray(o.shapeless)) {
    if (o.shapeless.length < 1 || o.shapeless.length > 9) return null;
    const ings = o.shapeless.map(cleanIng);
    if (ings.some((x) => x === null)) return null;
    return { id, group, result, count, shapeless: ings as Ingredient[] };
  }
  if (!Array.isArray(o.pattern) || !o.key || typeof o.key !== 'object') return null;
  const pattern = o.pattern.filter((r): r is string => typeof r === 'string');
  if (pattern.length < 1 || pattern.length > 3 || pattern.length !== o.pattern.length) return null;
  if (pattern.some((r) => r.length < 1 || r.length > 3)) return null;
  const w = Math.max(...pattern.map((r) => r.length));
  const pat = pattern.map((r) => r.padEnd(w, ' '));
  const key: Record<string, Ingredient> = {};
  for (const ch of new Set(pat.join('').replace(/ /g, ''))) {
    const ing = cleanIng((o.key as Record<string, unknown>)[ch]);
    if (ing === null) return null;
    key[ch] = ing;
  }
  if (!Object.keys(key).length) return null;
  return { id, group, result, count, pattern: pat, key };
}

function cleanSmelt(v: unknown): SmeltRecipe | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const input = cleanIng(o.input);
  const result = typeof o.result === 'number' && getItem(o.result) ? o.result : null;
  if (input === null || result === null) return null;
  const xp = Math.max(0, Math.min(100, Number(o.xp) || 0));
  return { input, result, xp };
}

export function cleanDataRecipes(v: unknown): DataRecipes | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const name = typeof o.name === 'string' ? o.name.replace(/[\u0000-\u001f]/g, '').slice(0, 64) : 'Data pack';
  const hash = typeof o.hash === 'string' ? o.hash.replace(/[^a-f0-9]/g, '').slice(0, 64) : '';
  const crafting: Recipe[] = [];
  const seen = new Set<string>();
  for (const r of Array.isArray(o.crafting) ? o.crafting : []) {
    if (crafting.length >= MAX_DATA_RECIPES) break;
    const c = cleanRecipe(r);
    if (c && !seen.has(c.id)) { seen.add(c.id); crafting.push(c); }
  }
  const smelting: SmeltRecipe[] = [];
  for (const r of Array.isArray(o.smelting) ? o.smelting : []) {
    if (smelting.length >= MAX_DATA_RECIPES) break;
    const c = cleanSmelt(r);
    if (c) smelting.push(c);
  }
  const remove = (Array.isArray(o.remove) ? o.remove : []).filter((x): x is string => typeof x === 'string' && ID_RE.test(x)).slice(0, MAX_DATA_RECIPES);
  if (!crafting.length && !smelting.length && !remove.length) return null;
  return { name: name || 'Data pack', hash, crafting, smelting, remove };
}

export const MAX_DATA_PACKS = 8;

export function cleanPackList(v: unknown): DataRecipes[] {
  if (!Array.isArray(v)) return [];
  const out: DataRecipes[] = [];
  let bytes = 0;
  for (const p of v.slice(0, MAX_DATA_PACKS)) {
    const c = cleanDataRecipes(p);
    if (!c) continue;
    const n = JSON.stringify(c).length;
    if (bytes + n > MAX_DATA_BYTES) break;
    bytes += n;
    out.push(c);
  }
  return out;
}

export function mergeData(list: DataRecipes[]): DataRecipes | null {
  if (!list.length) return null;
  if (list.length === 1) return list[0];
  const crafting: Recipe[] = [];
  const seen = new Set<string>();
  for (const p of list) for (const r of p.crafting) if (!seen.has(r.id)) { seen.add(r.id); crafting.push(r); }
  return {
    name: list.map((p) => p.name).join(' + '),
    hash: list.map((p) => p.hash.slice(0, 8)).join(''),
    crafting,
    smelting: list.flatMap((p) => p.smelting),
    remove: [...new Set(list.flatMap((p) => p.remove))],
  };
}

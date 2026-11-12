import { unzipSync } from 'fflate';
import { ITEMS } from '../core/items';
import { B, BLOCKS } from '../core/blocks';
import { DataRecipes, Recipe, SmeltRecipe, Ingredient, RECIPES } from '../core/crafting';
import { cleanDataRecipes, MAX_DATA_BYTES } from '../core/datapack';
import { JAVA_BLOCK_NAMES, javaItemName } from './ResourcePackImporter';

export interface DataPackReport {
  crafting: number;
  smelting: number;
  removed: number;
  skippedItems: number;
  unsupported: number;
  missing: string[];
  kinds: Record<string, number>;
}

export interface DataPackResult { pack: DataRecipes; report: DataPackReport; }

let NAME_MAP: Map<string, number> | null = null;

export function javaIdMap(): Map<string, number> {
  if (NAME_MAP) return NAME_MAP;
  const m = new Map<string, number>();
  const placeless = new Set<number>([B.WATER, B.LAVA, B.FURNACE_LIT, B.FARMLAND, B.SNOWY_GRASS, B.WHEAT]);
  for (const b of BLOCKS) {
    if (!b || placeless.has(b.id) || !ITEMS[b.id]) continue;
    m.set(b.key, b.id);
    const j = JAVA_BLOCK_NAMES[b.key];
    if (j && !j.state?.includes('snowy=true') && !j.state?.includes('lit=true')) m.set(j.name, b.id);
  }
  for (const it of ITEMS) {
    if (!it || it.kind === 'block' || /^bow_pulling/.test(it.key)) continue;
    m.set(it.key, it.id);
    m.set(javaItemName(it.key), it.id);
  }
  m.set('grass_block', B.GRASS);
  m.set('short_grass', B.TALL_GRASS);
  NAME_MAP = m;
  return m;
}

const BUILTIN_TAGS: Record<string, string | string[]> = {
  planks: 'planks', logs: 'logs', logs_that_burn: 'logs', wool: 'wool', coals: 'coals',
  stone_crafting_materials: 'stones', stone_tool_materials: 'stones',
  oak_logs: ['oak_log'], birch_logs: ['birch_log'], spruce_logs: ['spruce_log'], jungle_logs: ['jungle_log'],
  leaves: ['oak_leaves', 'birch_leaves', 'spruce_leaves', 'jungle_leaves'],
  saplings: ['oak_sapling', 'birch_sapling', 'spruce_sapling', 'jungle_sapling'],
  small_flowers: ['dandelion', 'poppy'], flowers: ['dandelion', 'poppy'],
  sand: ['sand'], smelts_to_glass: ['sand'], stone_bricks: ['stone_bricks', 'mossy_stone_bricks', 'cracked_stone_bricks', 'chiseled_stone_bricks'],
  sandstone: ['sandstone', 'cut_sandstone', 'chiseled_sandstone', 'smooth_sandstone'],
  dirt: ['dirt', 'grass', 'mud'], eggs: [], wooden_slabs: [], wooden_stairs: [], soul_fire_base_blocks: [],
};

const GROUP: Record<string, Recipe['group']> = {
  building: 'building', building_blocks: 'building', redstone: 'basics', equipment: 'tools', misc: 'basics',
  food: 'food', decorations: 'decor', blocks: 'building',
};

type Json = Record<string, unknown>;
const dec = new TextDecoder();

function readJson(b: Uint8Array | undefined): Json | null {
  if (!b) return null;
  try { return JSON.parse(dec.decode(b).replace(/^﻿/, '')) as Json; } catch { return null; }
}

function bare(id: string): { ns: string; path: string } {
  const s = id.replace(/^#/, '');
  const i = s.indexOf(':');
  return i < 0 ? { ns: 'minecraft', path: s } : { ns: s.slice(0, i), path: s.slice(i + 1) };
}

async function sha256(data: Uint8Array): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', data as Uint8Array<ArrayBuffer>);
  return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export async function importDataPack(fileName: string, data: Uint8Array): Promise<DataPackResult> {
  const entries: Record<string, Uint8Array> = unzipSync(data, {
    filter: (f) => f.originalSize < 512 * 1024 && (/(^|\/)pack\.mcmeta$/.test(f.name) || /(^|\/)data\/[^/]+\/(recipes?|tags\/items?)\/.+\.json$/.test(f.name)),
  });
  const names = Object.keys(entries);
  const recipeFiles = names.filter((n) => /(^|\/)data\/[^/]+\/recipes?\//.test(n));
  if (!recipeFiles.length && !names.some((n) => /pack\.mcmeta$/.test(n))) throw new Error('No data pack found. Choose a .zip or .jar that contains a data folder.');
  const ids = javaIdMap();
  const report: DataPackReport = { crafting: 0, smelting: 0, removed: 0, skippedItems: 0, unsupported: 0, missing: [], kinds: {} };
  const missing = new Set<string>();

  const tagFiles = new Map<string, string>();
  for (const n of names) {
    const m = /(?:^|\/)data\/([^/]+)\/tags\/items?\/(.+)\.json$/.exec(n);
    if (m) tagFiles.set(`${m[1]}:${m[2]}`, n);
  }
  const tagCache = new Map<string, number[] | string | null>();
  const resolveTag = (ref: string, depth = 0): number[] | string | null => {
    const { ns, path } = bare(ref);
    const key = `${ns}:${path}`;
    if (tagCache.has(key)) return tagCache.get(key)!;
    tagCache.set(key, null);
    let out: number[] | string | null = null;
    const file = tagFiles.get(key);
    const j = file ? readJson(entries[file]) : null;
    const builtin = ns === 'minecraft' ? BUILTIN_TAGS[path] : undefined;
    if (j && Array.isArray(j.values) && (j.replace === true || builtin === undefined)) {
      const set = new Set<number>();
      for (const v of j.values) {
        const s = typeof v === 'string' ? v : v && typeof v === 'object' ? String((v as Json).id ?? '') : '';
        if (!s) continue;
        if (s.startsWith('#')) {
          if (depth > 8) continue;
          const t = resolveTag(s, depth + 1);
          if (Array.isArray(t)) t.forEach((x) => set.add(x));
          else if (typeof t === 'string') listTag(t).forEach((x) => set.add(x));
        } else {
          const id = ids.get(bare(s).path);
          if (id !== undefined && bare(s).ns === 'minecraft') set.add(id); else missing.add(s);
        }
      }
      out = set.size ? [...set] : null;
    } else if (builtin !== undefined) {
      out = typeof builtin === 'string' ? builtin : builtin.map((k) => ids.get(k)).filter((x): x is number => x !== undefined);
      if (j && Array.isArray(j.values) && Array.isArray(out)) {
        for (const v of j.values) { const id = typeof v === 'string' && !v.startsWith('#') ? ids.get(bare(v).path) : undefined; if (id !== undefined) out.push(id); }
      }
      if (Array.isArray(out) && !out.length) out = null;
    } else missing.add(`#${key}`);
    tagCache.set(key, out);
    return out;
  };
  const listTag = (t: string): number[] => {
    const all: Record<string, number[]> = { planks: [B.OAK_PLANKS, B.BIRCH_PLANKS, B.SPRUCE_PLANKS, B.JUNGLE_PLANKS], logs: [B.OAK_LOG, B.BIRCH_LOG, B.SPRUCE_LOG, B.JUNGLE_LOG], stones: [B.COBBLESTONE, B.MOSSY_COBBLESTONE], wool: [B.WHITE_WOOL, B.RED_WOOL, B.YELLOW_WOOL], coals: [ids.get('coal')!, ids.get('charcoal')!] };
    return all[t] ?? [];
  };

  const item = (s: string): number | null => {
    const { ns, path } = bare(s);
    const id = ns === 'minecraft' ? ids.get(path) : undefined;
    if (id === undefined) { missing.add(s); return null; }
    return id;
  };

  const ingredient = (v: unknown): Ingredient | null => {
    if (typeof v === 'string') {
      if (v.startsWith('#')) return resolveTag(v);
      return item(v);
    }
    if (Array.isArray(v)) {
      const set = new Set<number>();
      let tagName: string | null = null;
      for (const x of v) {
        const r = ingredient(x);
        if (typeof r === 'number') set.add(r);
        else if (Array.isArray(r)) r.forEach((n) => set.add(n));
        else if (typeof r === 'string') { if (v.length === 1) tagName = r; else listTag(r).forEach((n) => set.add(n)); }
      }
      if (tagName) return tagName;
      if (!set.size) return null;
      return set.size === 1 ? [...set][0] : [...set];
    }
    if (v && typeof v === 'object') {
      const o = v as Json;
      if (typeof o.tag === 'string') return resolveTag(`#${o.tag}`);
      if (typeof o.item === 'string') return item(o.item);
      if (typeof o.id === 'string') return item(o.id);
    }
    return null;
  };

  const result = (v: unknown): { id: number; count: number } | null => {
    if (typeof v === 'string') { const id = item(v); return id === null ? null : { id, count: 1 }; }
    if (v && typeof v === 'object') {
      const o = v as Json;
      const s = typeof o.id === 'string' ? o.id : typeof o.item === 'string' ? o.item : null;
      if (!s) return null;
      const id = item(s);
      return id === null ? null : { id, count: Math.max(1, Math.min(64, Number(o.count) || 1)) };
    }
    return null;
  };

  const mcmetaName = names.find((n) => /(^|\/)pack\.mcmeta$/.test(n));
  const mcmeta = mcmetaName ? readJson(entries[mcmetaName]) : null;
  const filters: { ns: RegExp; path: RegExp }[] = [];
  const fb = (mcmeta?.filter as Json | undefined)?.block;
  if (Array.isArray(fb)) {
    for (const f of fb) {
      try { filters.push({ ns: new RegExp(`^(?:${String((f as Json).namespace ?? '.*')})$`), path: new RegExp(`^(?:${String((f as Json).path ?? '.*')})$`) }); } catch { /* bad regex */ }
    }
  }
  const remove: string[] = [];
  if (filters.length) {
    for (const r of RECIPES) {
      if (filters.some((f) => f.ns.test('minecraft') && (f.path.test(`recipe/${r.id}.json`) || f.path.test(`recipes/${r.id}.json`) || f.path.test(`recipe/${r.id}`)))) remove.push(r.id);
    }
  }

  const crafting: Recipe[] = [];
  const smelting: SmeltRecipe[] = [];
  for (const file of recipeFiles.sort()) {
    const m = /(?:^|\/)data\/([^/]+)\/recipes?\/(.+)\.json$/.exec(file);
    if (!m) continue;
    const rid = (m[1] === 'minecraft' ? m[2] : `${m[1]}:${m[2]}`).toLowerCase();
    const j = readJson(entries[file]);
    if (!j) { report.unsupported++; continue; }
    const type = bare(String(j.type ?? '')).path;
    report.kinds[type] = (report.kinds[type] ?? 0) + 1;
    const group = GROUP[String(j.category ?? '')] ?? 'basics';
    if (type === 'crafting_shaped') {
      const pattern = Array.isArray(j.pattern) ? j.pattern.map(String) : [];
      const res = result(j.result);
      const key: Record<string, Ingredient> = {};
      let ok = !!res && pattern.length > 0 && pattern.length <= 3 && pattern.every((r) => r.length <= 3);
      for (const ch of new Set(pattern.join('').replace(/ /g, ''))) {
        const ing = ingredient((j.key as Json | undefined)?.[ch]);
        if (ing === null) { ok = false; break; }
        key[ch] = ing;
      }
      if (ok) crafting.push({ id: rid, group, result: res!.id, count: res!.count, pattern, key });
      else report.skippedItems++;
    } else if (type === 'crafting_shapeless') {
      const res = result(j.result);
      const list = Array.isArray(j.ingredients) ? j.ingredients : [];
      const ings = list.map(ingredient);
      if (res && ings.length && ings.length <= 9 && ings.every((x) => x !== null)) crafting.push({ id: rid, group, result: res.id, count: res.count, shapeless: ings as Ingredient[] });
      else report.skippedItems++;
    } else if (type === 'smelting') {
      const res = result(j.result);
      const ing = ingredient(j.ingredient);
      if (res && ing !== null) smelting.push({ input: ing, result: res.id, xp: Number(j.experience) || 0 });
      else report.skippedItems++;
    } else {
      report.unsupported++;
    }
  }
  const name = fileName.replace(/\.(zip|jar)$/i, '').replace(/[_-]+/g, ' ').trim().slice(0, 48) || 'Data pack';
  const pack = cleanDataRecipes({ name, hash: await sha256(data), crafting, smelting, remove });
  if (!pack) throw new Error('This pack has no recipes Strata can use.');
  if (JSON.stringify(pack).length > MAX_DATA_BYTES) throw new Error('This data pack is too large.');
  report.crafting = pack.crafting.length;
  report.smelting = pack.smelting.length;
  report.removed = pack.remove.length;
  report.missing = [...missing].slice(0, 40);
  return { pack, report };
}

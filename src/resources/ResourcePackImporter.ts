import { unzipSync } from 'fflate';
import { BLOCKS, B } from '../core/blocks';
import { ITEMS } from '../core/items';
import { decodeTGA } from './tga';

export type PackFormat = 'java' | 'bedrock';

export interface FaceOverride { px?: string; nx?: string; py?: string; ny?: string; pz?: string; nz?: string; front?: string; overlay?: string; }

export interface AnimInfo { frametime: number; frames?: number[]; interpolate?: boolean; }

export interface PackReport {
  mappedBlocks: number;
  totalBlocks: number;
  mappedItems: number;
  totalItems: number;
  textures: number;
  animated: number;
  sounds: number;
  warnings: string[];
  unsupported: string[];
  missing: string[];
}

export interface PackManifest {
  id: string;
  name: string;
  description: string;
  format: PackFormat;
  formatVersion: string;
  hash: string;
  importedAt: number;
  sizeBytes: number;
  report: PackReport;
  blockFaces: Record<string, FaceOverride>;
  itemTextures: Record<string, string>;
  animations: Record<string, AnimInfo>;
  sounds: Record<string, string[]>;
  special: Record<string, string>;
  importer?: number;
  catalog?: string;
}

export const IMPORTER_VERSION = 12;

export const CATALOG = (() => {
  let h = 2166136261;
  const keys = [...BLOCKS.map((b) => b?.key ?? ''), '|', ...ITEMS.map((i) => i?.key ?? '')].join(',');
  for (let i = 0; i < keys.length; i++) h = Math.imul(h ^ keys.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
})();

export function packStale(m: { importer?: number; catalog?: string }): boolean {
  return (m.importer ?? 0) < IMPORTER_VERSION || m.catalog !== CATALOG;
}

export const GUI_SPRITES = [
  'container/slot_highlight_back', 'container/slot_highlight_front', 'container/furnace/burn_progress', 'container/furnace/lit_progress',
  'container/villager/experience_bar_background', 'container/villager/experience_bar_current', 'container/villager/out_of_stock', 'container/villager/trade_arrow', 'container/villager/trade_arrow_out_of_stock', 'container/villager/scroller', 'container/villager/scroller_disabled',
  'container/creative_inventory/scroller', 'container/creative_inventory/scroller_disabled',
  ...[1, 2, 3, 4, 5, 6, 7].flatMap((i) => [`container/creative_inventory/tab_top_selected_${i}`, `container/creative_inventory/tab_top_unselected_${i}`, `container/creative_inventory/tab_bottom_selected_${i}`, `container/creative_inventory/tab_bottom_unselected_${i}`]),
  'widget/button', 'widget/button_highlighted', 'widget/button_disabled', 'widget/text_field', 'widget/text_field_highlighted', 'widget/slider', 'widget/slider_highlighted', 'widget/slider_handle', 'widget/slider_handle_highlighted',
  'widget/checkbox', 'widget/checkbox_selected', 'widget/checkbox_highlighted', 'widget/checkbox_selected_highlighted', 'widget/cross_button', 'widget/cross_button_highlighted', 'widget/scroller', 'widget/scroller_background',
  'tooltip/background', 'tooltip/frame', 'hud/crosshair_attack_indicator_background', 'hud/crosshair_attack_indicator_progress', 'hud/crosshair_attack_indicator_full', 'hud/experience_bar_background', 'hud/experience_bar_progress', 'hud/air', 'hud/air_empty', 'hud/air_bursting',
  'recipe_book/button', 'recipe_book/button_highlighted', 'recipe_book/slot_craftable', 'recipe_book/slot_uncraftable', 'recipe_book/slot_many_craftable', 'recipe_book/slot_many_uncraftable',
  'recipe_book/page_forward', 'recipe_book/page_backward', 'recipe_book/page_forward_highlighted', 'recipe_book/page_backward_highlighted', 'recipe_book/tab', 'recipe_book/tab_selected',
  'recipe_book/filter_enabled', 'recipe_book/filter_disabled', 'recipe_book/filter_enabled_highlighted', 'recipe_book/filter_disabled_highlighted', 'hud/hotbar_offhand_left', 'container/slot/shield', 'icon/search',
];
export const GUI_TEXTURES = ['container/inventory', 'container/crafting_table', 'container/furnace', 'container/generic_54', 'container/villager', 'container/creative_inventory/tab_items', 'container/creative_inventory/tab_item_search', 'container/creative_inventory/tab_inventory', 'recipe_book', 'menu_background', 'header_separator', 'footer_separator', 'inworld_menu_background'];


export interface PackFiles { [path: string]: Uint8Array; }

export interface ImportedPack { manifest: PackManifest; files: PackFiles; icon: Uint8Array | null; }

export const JAVA_BLOCK_NAMES: Record<string, { name: string; state?: string }> = {
  aetherite_ore: { name: 'diamond_ore' }, aetherite_block: { name: 'diamond_block' }, tall_grass: { name: 'short_grass' },
  snowy_grass: { name: 'grass_block', state: 'snowy=true' }, copper_lamp: { name: 'copper_bulb', state: 'lit=true,powered=false' }, trial_spawner: { name: 'trial_spawner', state: 'ominous=false,trial_spawner_state=inactive' }, vault: { name: 'vault', state: 'facing=north,ominous=false,vault_state=inactive' }, furnace: { name: 'furnace', state: 'facing=north,lit=false' },
  furnace_lit: { name: 'furnace', state: 'facing=north,lit=true' }, grass: { name: 'grass_block', state: 'snowy=false' },
  farmland: { name: 'farmland', state: 'moisture=7' }, wheat: { name: 'wheat', state: 'age=0' },
};

const SKIP_MODEL = new Set(['chest', 'oak_door', 'torch', 'ladder', 'water', 'lava', 'air', 'wheat', 'lily_pad']);

const JAVA_ITEM_NAMES: Record<string, string> = {
  aetherite: 'diamond', raw_pork: 'porkchop', cooked_pork: 'cooked_porkchop', raw_mutton: 'mutton', raw_poultry: 'chicken',
  cooked_poultry: 'cooked_chicken', oak_door_item: 'oak_door',
};

export function javaItemName(key: string): string {
  if (JAVA_ITEM_NAMES[key]) return JAVA_ITEM_NAMES[key];
  return key.replace(/^aetherite_/, 'diamond_').replace(/^gold_(helmet|chestplate|leggings|boots)$/, 'golden_$1');
}

const BEDROCK_BLOCK_FILES: Record<string, string[]> = {
  stone: ['stone'], dirt: ['dirt'], grass_block_top: ['grass_top'], grass_block_side: ['grass_side_carried', 'grass_side'], grass_block_side_overlay: ['grass_side'],
  grass_block_snow: ['grass_side_snowed'], snow: ['snow'], cobblestone: ['cobblestone'], mossy_cobblestone: ['cobblestone_mossy'],
  oak_planks: ['planks_oak'], birch_planks: ['planks_birch'], spruce_planks: ['planks_spruce'], jungle_planks: ['planks_jungle'],
  bedrock: ['bedrock'], sand: ['sand'], gravel: ['gravel'], clay: ['clay'], ice: ['ice'], water_still: ['water_still_grey', 'water_still'],
  lava_still: ['lava_still'], oak_log: ['log_oak'], oak_log_top: ['log_oak_top'], birch_log: ['log_birch'], birch_log_top: ['log_birch_top'],
  spruce_log: ['log_spruce'], spruce_log_top: ['log_spruce_top'], jungle_log: ['log_jungle'], jungle_log_top: ['log_jungle_top'],
  oak_leaves: ['leaves_oak', 'leaves_oak_carried'], birch_leaves: ['leaves_birch', 'leaves_birch_carried'], spruce_leaves: ['leaves_spruce', 'leaves_spruce_carried'],
  jungle_leaves: ['leaves_jungle', 'leaves_jungle_carried'], coal_ore: ['coal_ore'], iron_ore: ['iron_ore'], gold_ore: ['gold_ore'], aetherite_ore: ['diamond_ore'],
  sandstone: ['sandstone_normal'], sandstone_top: ['sandstone_top'], sandstone_bottom: ['sandstone_bottom'], cactus_side: ['cactus_side'], cactus_top: ['cactus_top'],
  cactus_bottom: ['cactus_bottom'], short_grass: ['tallgrass'], dandelion: ['flower_dandelion'], poppy: ['flower_rose'], dead_bush: ['deadbush'], fern: ['fern'],
  sugar_cane: ['reeds'], crafting_table_top: ['crafting_table_top'], crafting_table_side: ['crafting_table_side'], crafting_table_front: ['crafting_table_front'],
  furnace_front: ['furnace_front_off'], furnace_front_on: ['furnace_front_on'], furnace_side: ['furnace_side'], furnace_top: ['furnace_top'],
  torch: ['torch_on'], glass: ['glass'], bricks: ['brick'], stone_bricks: ['stonebrick'], mossy_stone_bricks: ['stonebrick_mossy'],
  oak_door_top: ['door_wood_upper'], oak_door_bottom: ['door_wood_lower'], ladder: ['ladder'], white_wool: ['wool_colored_white'], red_wool: ['wool_colored_red'],
  yellow_wool: ['wool_colored_yellow'], iron_block: ['iron_block'], gold_block: ['gold_block'], aetherite_block: ['diamond_block'], obsidian: ['obsidian'],
  glowstone: ['glowstone'], mud: ['mud'], farmland_moist: ['farmland_wet'], oak_sapling: ['sapling_oak'], birch_sapling: ['sapling_birch'],
  spruce_sapling: ['sapling_spruce'], jungle_sapling: ['sapling_jungle'], red_mushroom: ['mushroom_red'], brown_mushroom: ['mushroom_brown'],
  bookshelf: ['bookshelf'], lily_pad: ['waterlily', 'carried_waterlily'],
  smooth_stone: ['stone_slab_top'], cracked_stone_bricks: ['stonebrick_cracked'], chiseled_stone_bricks: ['stonebrick_carved'], cut_sandstone: ['sandstone_smooth'],
  chiseled_sandstone: ['sandstone_carved'], coal_block: ['coal_block'], hay_block_side: ['hay_block_side'], hay_block_top: ['hay_block_top'], packed_ice: ['ice_packed'],
  terracotta: ['hardened_clay'], bone_block_side: ['bone_block_side'], bone_block_top: ['bone_block_top'], emerald_block: ['emerald_block'],
};
for (let i = 0; i < 8; i++) BEDROCK_BLOCK_FILES[`wheat_stage${i}`] = [`wheat_stage_${i}`];
for (let i = 0; i < 10; i++) BEDROCK_BLOCK_FILES[`destroy_stage_${i}`] = [`destroy_stage_${i}`];

const BEDROCK_ITEM_FILES: Record<string, string[]> = {
  stick: ['stick'], coal: ['coal'], charcoal: ['charcoal'], iron_ingot: ['iron_ingot'], gold_ingot: ['gold_ingot'], aetherite: ['diamond'], flint: ['flint'],
  feather: ['feather'], string: ['string'], bone: ['bone'], leather: ['leather'], apple: ['apple'], bread: ['bread'], raw_pork: ['porkchop_raw'],
  cooked_pork: ['porkchop_cooked'], raw_mutton: ['mutton_raw'], cooked_mutton: ['mutton_cooked'], raw_poultry: ['chicken_raw'], cooked_poultry: ['chicken_cooked'],
  wheat_seeds: ['seeds_wheat'], wheat: ['wheat'], clay_ball: ['clay_ball'], brick: ['brick'], bucket: ['bucket_empty'], water_bucket: ['bucket_water'],
  lava_bucket: ['bucket_lava'], rotten_flesh: ['rotten_flesh'], paper: ['paper'], book: ['book_normal'], red_dye: ['dye_powder_red_new', 'dye_powder_red'],
  yellow_dye: ['dye_powder_yellow_new', 'dye_powder_yellow'], arrow: ['arrow'], oak_door_item: ['door_wood'], bow: ['bow_standby', 'bow'], emerald: ['emerald'], bone_meal: ['dye_powder_white_new', 'dye_powder_white'], bow_pulling_0: ['bow_pulling_0'], bow_pulling_1: ['bow_pulling_1'], bow_pulling_2: ['bow_pulling_2'],
};
const BR_MAT: Record<string, string> = { wooden: 'wood', stone: 'stone', iron: 'iron', golden: 'gold', aetherite: 'diamond', leather: 'leather', gold: 'gold' };
for (const m of ['wooden', 'stone', 'iron', 'golden', 'aetherite']) for (const t of ['pickaxe', 'axe', 'shovel', 'sword', 'hoe']) BEDROCK_ITEM_FILES[`${m}_${t}`] = [`${BR_MAT[m]}_${t}`];
for (const m of ['leather', 'iron', 'gold', 'aetherite']) for (const s of ['helmet', 'chestplate', 'leggings', 'boots']) BEDROCK_ITEM_FILES[`${m}_${s}`] = [`${BR_MAT[m]}_${s}`];

const SOUND_EVENTS: Record<string, { java: string[]; bedrock: string[] }> = {};
for (const g of ['stone', 'wood', 'grass', 'gravel', 'sand', 'snow', 'glass', 'metal']) {
  const jg = g === 'glass' ? 'glass' : g === 'metal' ? 'metal' : g;
  SOUND_EVENTS[`break.${g}`] = { java: [`block.${jg}.break`], bedrock: [`dig.${g === 'glass' ? 'stone' : g === 'metal' ? 'stone' : g}`] };
  SOUND_EVENTS[`place.${g}`] = { java: [`block.${jg}.place`], bedrock: [`use.${g === 'glass' ? 'stone' : g === 'metal' ? 'stone' : g}`] };
  SOUND_EVENTS[`step.${g}`] = { java: [`block.${jg}.step`], bedrock: [`step.${g === 'glass' ? 'stone' : g === 'metal' ? 'stone' : g}`] };
}
SOUND_EVENTS['ambient.rain'] = { java: ['weather.rain'], bedrock: ['ambient.weather.rain'] };
SOUND_EVENTS['ambient.thunder'] = { java: ['entity.lightning_bolt.thunder'], bedrock: ['ambient.weather.thunder'] };
SOUND_EVENTS['item.pickup'] = { java: ['entity.item.pickup'], bedrock: ['random.pop'] };
SOUND_EVENTS['player.levelup'] = { java: ['entity.player.levelup'], bedrock: ['random.levelup'] };
SOUND_EVENTS['player.hurt'] = { java: ['entity.player.hurt'], bedrock: ['game.player.hurt'] };

export class ZipReader {
  readonly data: Uint8Array;
  readonly names: string[];
  readonly prefix: string;
  constructor(data: Uint8Array) {
    this.data = data;
    const names: string[] = [];
    unzipSync(data, { filter: (f) => { names.push(f.name); return false; } });
    this.names = names;
    const marker = names.find((n) => /(^|\/)pack\.mcmeta$/.test(n)) ?? names.find((n) => /(^|\/)manifest\.json$/.test(n));
    this.prefix = marker ? marker.replace(/(pack\.mcmeta|manifest\.json)$/, '') : '';
  }
  has(path: string): boolean { return this.names.includes(this.prefix + path); }
  read(paths: Iterable<string>): Record<string, Uint8Array> {
    const want = new Set<string>();
    for (const p of paths) want.add(this.prefix + p);
    if (!want.size) return {};
    const out = unzipSync(this.data, { filter: (f) => want.has(f.name) });
    const res: Record<string, Uint8Array> = {};
    for (const [k, v] of Object.entries(out)) res[k.slice(this.prefix.length)] = v;
    return res;
  }
  list(prefix: string): string[] {
    const p = this.prefix + prefix;
    return this.names.filter((n) => n.startsWith(p)).map((n) => n.slice(this.prefix.length));
  }
}

const dec = new TextDecoder();
function parseJson(bytes: Uint8Array | undefined): unknown {
  if (!bytes) return null;
  try {
    const t = dec.decode(bytes).replace(/^﻿/, '').replace(/\/\/[^\n\r]*/g, (m) => (m.includes('"') ? m : ''));
    return JSON.parse(t);
  } catch { return null; }
}

function stripFormatting(s: string): string { return s.replace(/§./g, '').trim(); }

async function sha256Hex(chunks: Uint8Array[]): Promise<string> {
  let total = 0;
  for (const c of chunks) total += c.length;
  const all = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) { all.set(c, o); o += c.length; }
  const h = await crypto.subtle.digest('SHA-256', all);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function normRef(ref: string): string {
  return ref.replace(/^minecraft:/, '');
}

interface JModel { parent?: string; textures?: Record<string, unknown>; elements?: JElement[]; }
interface JElement { from: number[]; to: number[]; rotation?: { angle: number }; faces?: Record<string, { texture: unknown; tintindex?: number }>; }

class JavaResolver {
  private z: ZipReader;
  private json = new Map<string, unknown>();
  constructor(z: ZipReader) { this.z = z; }

  load(paths: string[]): void {
    const need = paths.filter((p) => !this.json.has(p) && this.z.has(p));
    const got = this.z.read(need);
    for (const p of paths) if (!this.json.has(p)) this.json.set(p, parseJson(got[p]) ?? null);
  }

  get(path: string): unknown { return this.json.get(path) ?? null; }

  modelChain(names: string[]): Map<string, JModel[]> {
    const chains = new Map<string, JModel[]>();
    let frontier = names.map((n) => ({ root: n, cur: n }));
    for (const n of names) chains.set(n, []);
    for (let depth = 0; depth < 12 && frontier.length; depth++) {
      this.load(frontier.map((f) => `assets/minecraft/models/${normRef(f.cur)}.json`));
      const next: { root: string; cur: string }[] = [];
      for (const f of frontier) {
        const m = this.get(`assets/minecraft/models/${normRef(f.cur)}.json`) as JModel | null;
        if (!m) continue;
        chains.get(f.root)!.push(m);
        if (m.parent && !m.parent.startsWith('builtin/')) next.push({ root: f.root, cur: m.parent.includes('/') ? m.parent : `block/${m.parent}` });
      }
      frontier = next;
    }
    return chains;
  }
}

function texValue(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (typeof o.sprite === 'string') return o.sprite;
    if (typeof o.texture === 'string') return o.texture;
  }
  return '';
}

function resolveTex(chain: JModel[], ref: unknown): string | null {
  const tex: Record<string, string> = {};
  for (let i = chain.length - 1; i >= 0; i--) for (const [k, v] of Object.entries(chain[i].textures ?? {})) tex[k] = texValue(v);
  let r = texValue(ref);
  for (let i = 0; i < 10 && r.startsWith('#'); i++) r = tex[r.slice(1)] ?? '';
  if (!r || r.startsWith('#')) return null;
  return normRef(r);
}

function chainElements(chain: JModel[]): JElement[] | null {
  for (const m of chain) if (m.elements) return m.elements;
  return null;
}

const DIR_TO_FACE: Record<string, keyof FaceOverride> = { east: 'px', west: 'nx', up: 'py', down: 'ny', south: 'pz', north: 'nz' };

export async function importPack(fileName: string, data: Uint8Array): Promise<ImportedPack> {
  const z = new ZipReader(data);
  const isJava = z.has('pack.mcmeta');
  const isBedrock = !isJava && z.has('manifest.json');
  if (!isJava && !isBedrock) throw new Error('This file is not a resource pack: no pack.mcmeta (Java) or manifest.json (Bedrock) was found.');
  const report: PackReport = { mappedBlocks: 0, totalBlocks: 0, mappedItems: 0, totalItems: 0, textures: 0, animated: 0, sounds: 0, warnings: [], unsupported: [], missing: [] };
  const files: PackFiles = {};
  const blockFaces: Record<string, FaceOverride> = {};
  const itemTextures: Record<string, string> = {};
  const animations: Record<string, AnimInfo> = {};
  const sounds: Record<string, string[]> = {};
  const special: Record<string, string> = {};
  let name = fileName.replace(/\.(zip|mcpack)$/i, '');
  let description = '';
  let formatVersion = '';
  let icon: Uint8Array | null = null;

  if (z.names.some((n) => /\.(js|mjs|html?|wasm)$/i.test(n))) report.warnings.push('The archive contains script or HTML files. They were ignored and are never executed.');

  if (isJava) {
    const base = z.read(['pack.mcmeta', 'pack.png']);
    const mc = parseJson(base['pack.mcmeta']) as { pack?: { description?: unknown; pack_format?: number; min_format?: number; max_format?: number } } | null;
    if (!mc?.pack) report.warnings.push('pack.mcmeta is missing a "pack" section.');
    const desc = mc?.pack?.description;
    description = stripFormatting(typeof desc === 'string' ? desc : Array.isArray(desc) ? desc.map((d) => (typeof d === 'string' ? d : (d as { text?: string }).text ?? '')).join('') : (desc as { text?: string })?.text ?? '');
    formatVersion = String(mc?.pack?.pack_format ?? mc?.pack?.min_format ?? '?');
    icon = base['pack.png'] ?? null;
    const r = new JavaResolver(z);
    const blockNames = new Map<number, { name: string; state?: string }>();
    for (const b of BLOCKS) {
      if (!b || b.id === 0 || SKIP_MODEL.has(b.key)) continue;
      blockNames.set(b.id, JAVA_BLOCK_NAMES[b.key] ?? { name: b.key });
    }
    r.load([...new Set([...blockNames.values()].map((n) => `assets/minecraft/blockstates/${n.name}.json`))]);
    const modelFor = new Map<number, string>();
    for (const [id, n] of blockNames) {
      const bs = r.get(`assets/minecraft/blockstates/${n.name}.json`) as { variants?: Record<string, unknown>; multipart?: { apply: unknown }[] } | null;
      if (!bs) continue;
      let v: unknown = null;
      if (bs.variants) {
        const keys = Object.keys(bs.variants);
        const want = n.state;
        const k = want ? keys.find((x) => want.split(',').every((p) => x.split(',').includes(p))) ?? keys[0] : keys.includes('') ? '' : keys[0];
        v = bs.variants[k];
      } else if (bs.multipart?.length) v = bs.multipart[0].apply;
      if (Array.isArray(v)) v = v[0];
      const model = (v as { model?: string })?.model;
      if (model) modelFor.set(id, normRef(model));
    }
    const chains = r.modelChain([...new Set(modelFor.values())]);
    const needTex = new Set<string>();
    for (const [id, model] of modelFor) {
      const chain = chains.get(model);
      if (!chain || !chain.length) continue;
      const els = chainElements(chain);
      const def = BLOCKS[id];
      const fo: FaceOverride = {};
      if (els && els.length) {
        const cube = els.find((e) => e.from.join() === '0,0,0' && e.to.join() === '16,16,16') ?? els[0];
        const isCross = els.some((e) => e.rotation && Math.abs(e.rotation.angle) === 45);
        if (isCross || def.render === 'cross' || def.render === 'crop') {
          const f = Object.values(els[0].faces ?? {})[0];
          const t = f ? resolveTex(chain, f.texture) : null;
          if (t) { fo.px = fo.nx = fo.py = fo.ny = fo.pz = fo.nz = t; }
        } else {
          for (const [dir, face] of Object.entries(cube.faces ?? {})) {
            const k = DIR_TO_FACE[dir];
            const t = resolveTex(chain, face.texture);
            if (k && t) fo[k] = t;
          }
          const over = els.find((e) => e !== cube && e.faces && Object.values(e.faces).some((f) => f.tintindex !== undefined) && e.faces.north);
          if (over && def.key.startsWith('grass')) { const t = resolveTex(chain, over.faces!.north.texture); if (t) fo.overlay = t; }
          if (def.orientable && fo.nz) { fo.front = fo.nz; fo.nz = fo.pz ?? fo.px; }
        }
      }
      if (def.key === 'snowy_grass') { fo.py = 'block/snow'; delete fo.overlay; }
      const vals = Object.values(fo).filter(Boolean) as string[];
      if (vals.length) {
        blockFaces[def.key] = fo;
        for (const t of vals) needTex.add(t);
        report.mappedBlocks++;
      }
    }
    for (const b of BLOCKS) if (b && b.id && SKIP_MODEL.has(b.key)) {
      const extra: Record<string, string[]> = {
        chest: [], oak_door: ['block/oak_door_top', 'block/oak_door_bottom'], torch: ['block/torch'], ladder: ['block/ladder'],
        water: ['block/water_still'], lava: ['block/lava_still'], wheat: Array.from({ length: 8 }, (_, i) => `block/wheat_stage${i}`), lily_pad: ['block/lily_pad'], air: [],
      };
      for (const t of extra[b.key] ?? []) needTex.add(t);
    }
    for (let i = 0; i < 10; i++) needTex.add(`block/destroy_stage_${i}`);
    for (const k of ['grass_block_top', 'grass_block_side', 'grass_block_side_overlay', 'grass_block_snow', 'farmland_moist']) needTex.add(`block/${k}`);
    const itemModelNames = new Map<string, string>();
    for (const it of ITEMS) {
      if (!it || it.kind === 'block' || it.blockIcon) continue;
      itemModelNames.set(it.key, javaItemName(it.key));
    }
    for (const it of ITEMS) if (it && it.kind === 'block' && !it.blockIcon && it.key !== 'oak_door' && !itemModelNames.has(it.key)) itemModelNames.set(it.key, '');
    r.load([...itemModelNames.values()].filter(Boolean).map((n) => `assets/minecraft/models/item/${n}.json`));
    for (const [key, jn] of itemModelNames) {
      if (!jn) continue;
      const m = r.get(`assets/minecraft/models/item/${jn}.json`) as JModel | null;
      let t = m?.textures?.layer0 ? normRef(texValue(m.textures.layer0)) : `item/${jn}`;
      if (!t.includes('/')) t = `item/${t}`;
      itemTextures[key] = t;
      needTex.add(t);
    }
    special.chest = 'entity/chest/normal';
    special.sun = 'environment/celestial/sun';
    special.moon = 'environment/celestial/moon/full_moon';
    special.clouds = 'environment/clouds';
    special.grass_colormap = 'colormap/grass';
    special.foliage_colormap = 'colormap/foliage';
    special.heart = 'gui/sprites/hud/heart/full'; special.heart_half = 'gui/sprites/hud/heart/half'; special.heart_empty = 'gui/sprites/hud/heart/container';
    special.food = 'gui/sprites/hud/food_full'; special.food_half = 'gui/sprites/hud/food_half'; special.food_empty = 'gui/sprites/hud/food_empty';
    special.armor = 'gui/sprites/hud/armor_full'; special.armor_half = 'gui/sprites/hud/armor_half'; special.armor_empty = 'gui/sprites/hud/armor_empty';
    special.bubble = 'gui/sprites/hud/air';
    special.fire_0 = 'block/fire_0'; special.fire_1 = 'block/fire_1';
    for (const g of GUI_SPRITES) if (z.has(`assets/minecraft/textures/gui/sprites/${g}.png`)) special[`gs:${g}`] = `gui/sprites/${g}`;
    for (const g of GUI_TEXTURES) if (z.has(`assets/minecraft/textures/gui/${g}.png`)) special[`gt:${g}`] = `gui/${g}`;
    if (z.has('assets/minecraft/textures/font/ascii.png')) {
      special.font_ascii = 'font/ascii';
      r.load(['assets/minecraft/font/include/default.json', 'assets/minecraft/font/default.json']);
      const fj = (r.get('assets/minecraft/font/include/default.json') ?? r.get('assets/minecraft/font/default.json')) as { providers?: { type?: string; file?: string; chars?: string[]; ascent?: number }[] } | null;
      const prov = fj?.providers?.find((pv) => pv.type === 'bitmap' && /font\/ascii\.png$/.test(pv.file ?? ''));
      if (prov?.chars) special.font_ascii_chars = JSON.stringify({ chars: prov.chars, ascent: prov.ascent ?? 7 });
    }
    const firstOf = (...cands: string[]) => cands.find((c) => z.has(`assets/minecraft/textures/${c}.png`));
    const ent: Record<string, string | undefined> = {
      ent_pig: firstOf('entity/pig/pig_temperate', 'entity/pig/temperate_pig', 'entity/pig/pig'),
      ent_sheep: firstOf('entity/sheep/sheep'),
      ent_sheep_wool: firstOf('entity/sheep/sheep_wool', 'entity/sheep/sheep_fur'),
      ent_chicken: firstOf('entity/chicken/chicken_temperate', 'entity/chicken/temperate_chicken', 'entity/chicken'),
      ent_zombie: firstOf('entity/zombie/zombie'),
      ent_skeleton: firstOf('entity/skeleton/skeleton'),
      ent_spider: firstOf('entity/spider/spider'),
      ent_spider_eyes: firstOf('entity/spider/spider_eyes', 'entity/spider_eyes'),
      ent_villager: firstOf('entity/villager/villager'),
      ent_chest: firstOf('entity/chest/normal'),
      ent_chest_left: firstOf('entity/chest/normal_left'),
      ent_chest_right: firstOf('entity/chest/normal_right'),
      ent_villager_type: firstOf('entity/villager/type/plains'),
      gui_hotbar: firstOf('gui/sprites/hud/hotbar'),
      gui_hotbar_selection: firstOf('gui/sprites/hud/hotbar_selection'),
      gui_crosshair: firstOf('gui/sprites/hud/crosshair'),
      gui_slot: firstOf('gui/sprites/container/slot'),
    };
    ['steve', 'alex', 'ari', 'efe', 'kai', 'makena', 'noor', 'sunny', 'zuri'].forEach((n, i) => { ent[`ent_player${i}`] = firstOf(`entity/player/wide/${n}`, i === 0 ? 'entity/steve' : `entity/player/wide/${n}`); });
    for (const pr of ['farmer', 'librarian', 'toolsmith', 'armorer', 'butcher', 'fletcher', 'cleric', 'mason']) ent[`ent_vprof_${pr}`] = firstOf(`entity/villager/profession/${pr}`);
    for (const [k, v] of Object.entries(ent)) if (v) special[k] = v;
    const altMoon = z.list('assets/minecraft/textures/environment/').find((n) => /moon/.test(n) && n.endsWith('.png'));
    if (!z.has(`assets/minecraft/textures/${special.moon}.png`) && altMoon) special.moon = altMoon.replace('assets/minecraft/textures/', '').replace(/\.png$/, '');
    for (const [k, v] of Object.entries(special)) if (k !== 'font_ascii_chars') needTex.add(v);
    const texPaths: string[] = [];
    for (const t of needTex) { texPaths.push(`assets/minecraft/textures/${t}.png`); texPaths.push(`assets/minecraft/textures/${t}.png.mcmeta`); }
    const got = z.read(texPaths.filter((p) => z.has(p)));
    for (const t of needTex) {
      const png = got[`assets/minecraft/textures/${t}.png`];
      if (!png) { if (!t.startsWith('gui/') && !t.startsWith('environment/') && !t.startsWith('colormap')) report.missing.push(t); continue; }
      files[t] = png;
      report.textures++;
      const meta = parseJson(got[`assets/minecraft/textures/${t}.png.mcmeta`]) as { animation?: { frametime?: number; frames?: (number | { index: number })[]; interpolate?: boolean } } | null;
      if (meta?.animation) {
        animations[t] = {
          frametime: meta.animation.frametime ?? 1,
          frames: meta.animation.frames?.map((f) => (typeof f === 'number' ? f : f.index)),
          interpolate: meta.animation.interpolate,
        };
        report.animated++;
      }
    }
    for (const k of Object.keys(special)) if (k !== 'font_ascii_chars' && !files[special[k]]) delete special[k];
    for (const [k, fo] of Object.entries(blockFaces)) {
      for (const f of Object.keys(fo) as (keyof FaceOverride)[]) if (fo[f] && !files[fo[f]!]) delete fo[f];
      if (!Object.keys(fo).length) { delete blockFaces[k]; report.mappedBlocks--; }
    }
    for (const [k, t] of Object.entries(itemTextures)) if (!files[t]) delete itemTextures[k];
    const soundsJson = z.read(['assets/minecraft/sounds.json'])['assets/minecraft/sounds.json'];
    if (soundsJson) {
      const sj = parseJson(soundsJson) as Record<string, { sounds?: (string | { name: string })[] }> | null;
      const want: string[] = [];
      for (const [ev, names] of Object.entries(SOUND_EVENTS)) {
        for (const jn of names.java) {
          const entry = sj?.[jn];
          if (!entry?.sounds?.length) continue;
          const paths = entry.sounds.map((s) => `assets/minecraft/sounds/${normRef(typeof s === 'string' ? s : s.name)}.ogg`).filter((p) => z.has(p)).slice(0, 4);
          if (paths.length) { sounds[ev] = paths.map((p) => p.replace('assets/minecraft/', '')); want.push(...paths); }
        }
      }
      const sgot = z.read(want);
      for (const [p, d] of Object.entries(sgot)) files[p.replace('assets/minecraft/', '')] = d;
      report.sounds = Object.keys(sounds).length;
    }
    report.unsupported.push('Custom block models with non-cube shapes are drawn with Strata\'s built-in shapes using the pack\'s textures.');
    report.unsupported.push('Mob textures are applied to vanilla-proportioned models: sheep, pig, chicken, zombie, skeleton and spider skins dress Strata\'s Woolhorn, Mudsnout, Fernhen, Hollowed, Rattlebone and Duskweaver. The default player skins dress players.');
    report.unsupported.push('Shaders, fonts, languages and post-processing effects are ignored.');
  } else {
    const base = z.read(['manifest.json', 'pack_icon.png', 'blocks.json', 'textures/terrain_texture.json', 'textures/item_texture.json', 'textures/flipbook_textures.json', 'sounds/sound_definitions.json']);
    const mf = parseJson(base['manifest.json']) as { header?: { name?: string; description?: string; version?: number[] }; format_version?: number; modules?: { type?: string }[] } | null;
    if (!mf?.header) throw new Error('manifest.json has no header section.');
    if (mf.modules && !mf.modules.some((m) => m.type === 'resources')) report.warnings.push('manifest.json does not declare a "resources" module; this may be a behaviour pack.');
    name = stripFormatting(mf.header.name ?? name);
    if (/^pack\.name$/.test(name)) name = fileName.replace(/\.(zip|mcpack)$/i, '');
    description = stripFormatting(mf.header.description ?? '');
    formatVersion = `${mf.format_version ?? '?'} v${(mf.header.version ?? []).join('.')}`;
    icon = base['pack_icon.png'] ?? null;
    const terrain = (parseJson(base['textures/terrain_texture.json']) as { texture_data?: Record<string, { textures: unknown }> } | null)?.texture_data ?? {};
    const itemTex = (parseJson(base['textures/item_texture.json']) as { texture_data?: Record<string, { textures: unknown }> } | null)?.texture_data ?? {};
    const flip = (parseJson(base['textures/flipbook_textures.json']) as { flipbook_texture: string; ticks_per_frame?: number }[] | null) ?? [];
    const texPath = (v: unknown, idx = 0): string | null => {
      if (typeof v === 'string') return v;
      if (Array.isArray(v)) return texPath(v[Math.min(idx, v.length - 1)]);
      if (v && typeof v === 'object' && 'path' in (v as object)) return (v as { path: string }).path;
      return null;
    };
    const wanted = new Map<string, string[]>();
    const add = (key: string, candidates: string[]) => wanted.set(key, candidates);
    for (const [key, files2] of Object.entries(BEDROCK_BLOCK_FILES)) {
      const cands: string[] = [];
      for (const f of files2) {
        const td = terrain[f];
        const pth = td ? texPath(td.textures) : null;
        if (pth) cands.push(pth);
        cands.push(`textures/blocks/${f}`);
      }
      add(`b:${key}`, cands);
    }
    for (const [key, files2] of Object.entries(BEDROCK_ITEM_FILES)) {
      const cands: string[] = [];
      for (const f of files2) {
        const td = itemTex[f];
        const pth = td ? texPath(td.textures) : null;
        if (pth) cands.push(pth);
        cands.push(`textures/items/${f}`);
      }
      add(`i:${key}`, cands);
    }
    add('s:sun', ['textures/environment/sun']);
    add('s:moon', ['textures/environment/moon_phases']);
    add('s:clouds', ['textures/environment/clouds']);
    add('s:grass_colormap', ['textures/colormap/grass']);
    add('s:ent_pig', ['textures/entity/pig/pig_temperate', 'textures/entity/pig/pig']);
    add('s:ent_chicken', ['textures/entity/chicken/chicken_temperate', 'textures/entity/chicken']);
    add('s:ent_zombie', ['textures/entity/zombie/zombie']);
    add('s:ent_skeleton', ['textures/entity/skeleton/skeleton']);
    add('s:ent_spider', ['textures/entity/spider/spider']);
    add('s:ent_spider_eyes', ['textures/entity/spider/spider_eyes', 'textures/entity/spider_eyes']);
    add('s:ent_player0', ['textures/entity/steve']);
    add('s:ent_villager', ['textures/entity/villager2/villager', 'textures/entity/villager/villager']);
    add('s:ent_villager_type', ['textures/entity/villager2/biomes/biome_plains']);
    for (const pr of ['farmer', 'librarian', 'toolsmith', 'armorer', 'butcher', 'fletcher', 'cleric', 'mason']) add(`s:ent_vprof_${pr}`, [`textures/entity/villager2/professions/${pr}`, `textures/entity/villager/profession/${pr}`]);
    add('s:foliage_colormap', ['textures/colormap/foliage']);
    const paths = new Set<string>();
    for (const c of wanted.values()) for (const p of c) { paths.add(`${p}.png`); paths.add(`${p}.tga`); }
    const got = z.read([...paths].filter((p) => z.has(p)));
    const resolved = new Map<string, string>();
    for (const [key, cands] of wanted) {
      for (const c of cands) {
        if (got[`${c}.png`]) { files[c] = got[`${c}.png`]; resolved.set(key, c); break; }
        if (got[`${c}.tga`]) {
          try { files[c] = decodeTGA(got[`${c}.tga`]); resolved.set(key, c); break; } catch { report.warnings.push(`Could not decode ${c}.tga`); }
        }
      }
    }
    const texKeyFor = new Map<string, string>();
    for (const [key, path] of resolved) {
      const [kind, k] = [key.slice(0, 1), key.slice(2)];
      if (kind === 'b') texKeyFor.set(k, path);
      else if (kind === 'i') itemTextures[k] = path;
      else special[k] = path;
    }
    for (const b of BLOCKS) {
      if (!b || b.id === 0) continue;
      const fo: FaceOverride = {};
      const map = (face: keyof FaceOverride, key: string | undefined) => { if (key && texKeyFor.has(key)) fo[face] = texKeyFor.get(key)!; };
      map('px', b.faces.px); map('nx', b.faces.nx); map('py', b.faces.py); map('ny', b.faces.ny); map('pz', b.faces.pz); map('nz', b.faces.nz);
      map('front', b.front); map('overlay', b.overlay);
      if (b.key === 'grass' && texKeyFor.has('grass_block_side_overlay')) {
        report.warnings.push('Bedrock grass sides are pre-coloured; the side overlay tint is skipped for this pack.');
        delete fo.overlay;
      }
      if (Object.keys(fo).length) { blockFaces[b.key] = fo; report.mappedBlocks++; }
    }
    for (const [k, path] of texKeyFor) if (k.startsWith('wheat_stage') || k.startsWith('destroy_stage') || k === 'oak_door_top' || k === 'oak_door_bottom' || k === 'water_still' || k === 'lava_still') special[`tex:${k}`] = path;
    for (const f of flip) {
      const p = f.flipbook_texture;
      if (files[p]) { animations[p] = { frametime: f.ticks_per_frame ?? 1 }; report.animated++; }
    }
    report.textures = Object.keys(files).length;
    const sd = parseJson(base['sounds/sound_definitions.json']) as { sound_definitions?: Record<string, { sounds?: (string | { name: string })[] }> } & Record<string, { sounds?: (string | { name: string })[] }> | null;
    const defs = sd?.sound_definitions ?? sd ?? {};
    const swant: string[] = [];
    for (const [ev, names] of Object.entries(SOUND_EVENTS)) {
      for (const bn of names.bedrock) {
        const entry = defs[bn];
        if (!entry?.sounds?.length) continue;
        const cands = entry.sounds.map((s) => (typeof s === 'string' ? s : s.name)).flatMap((n) => [`${n}.ogg`, `${n}.wav`]).filter((p) => z.has(p)).slice(0, 4);
        if (cands.length) { sounds[ev] = cands; swant.push(...cands); }
      }
    }
    const sgot = z.read(swant);
    for (const [p, d] of Object.entries(sgot)) files[p] = d;
    report.sounds = Object.keys(sounds).length;
    if (z.names.some((n) => n.endsWith('.fsb'))) report.unsupported.push('FSB sound banks are not supported.');
    report.unsupported.push('Bedrock geometry, animations, render controllers and materials are not applied; Strata uses its own shapes with the pack\'s textures.');
    report.unsupported.push('Only classic mob skins with Java-compatible layouts (pig, chicken, zombie, skeleton, spider, Steve) are applied to creatures.');
  }

  report.totalBlocks = BLOCKS.filter((b) => b && b.id && b.category !== 'hidden').length;
  report.totalItems = ITEMS.filter((i) => i && i.kind !== 'block').length;
  report.mappedItems = Object.keys(itemTextures).length;
  const sortedPaths = Object.keys(files).sort();
  const enc = new TextEncoder();
  const hash = await sha256Hex(sortedPaths.flatMap((p) => [enc.encode(p), files[p]]));
  const sizeBytes = sortedPaths.reduce((n, p) => n + files[p].length, 0);
  const manifest: PackManifest = {
    importer: IMPORTER_VERSION, catalog: CATALOG,
    id: `pack-${hash.slice(0, 16)}`, name: name.slice(0, 60) || 'Imported Pack', description: description.slice(0, 200),
    format: isJava ? 'java' : 'bedrock', formatVersion, hash, importedAt: Date.now(), sizeBytes, report,
    blockFaces, itemTextures, animations, sounds, special,
  };
  return { manifest, files, icon };
}

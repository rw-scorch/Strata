import { COLORS } from '../core/blocks';
import { DRAGON_HEAD_PARTS, DRAGON_HEAD_UV, HEAD_TILE_KEYS, headBox, headLocalFace, headTileKey } from '../core/dragonHead';
import * as THREE from 'three';
import { isSlabId, isStairsId, SLAB2, STAIRS2, gateVisual } from '../core/blocks';
import { CB, BLOCKS, BlockDef, B, SHAPE_MATS, customBoxes, CUSTOM_BOX, ID_LIMIT, isBaseId, CAVE_TEX, makeBlock, SPRITE_BLOCKS } from '../core/blocks';
import { ITEMS, ItemDef } from '../core/items';
import { BIOMES } from '../core/worldgen/biomes';
import { defaultBlockTexture, defaultItemTexture, cloudTexture, hudIcon, Px } from './DefaultTextures';
import type { ComposedPack, ImageSource } from './ResourcePackManager';
import type { AnimInfo } from './ResourcePackImporter';

export const FACE_SLOTS = 8;
export const ATLAS_COLS = 32;
export const ICON_SIZE = 32;
type IsoBox = { b: number[]; top: number; left: number; right: number; ct?: number[]; cs?: number[] };
export const ICON_COLS = 16;

export interface AnimatedTile {
  tile: number;
  frames: HTMLCanvasElement[];
  order: number[];
  frametime: number;
  current: number;
  scratch: THREE.CanvasTexture;
  mipFrames: HTMLCanvasElement[][];
  scratchMips: THREE.CanvasTexture[];
}

export interface AtlasData {
  tileSize: number;
  cols: number;
  rows: number;
  blockTiles: Int16Array;
  tintTable: Uint8Array;
  special: Record<string, number>;
  biomeColors: number[][];
}

const TINT_CODE: Record<string, number> = { grass: 1, foliage: 2, birch: 3, spruce: 4 };

function toCanvas(src: ImageSource | Px): HTMLCanvasElement {
  const c = document.createElement('canvas');
  if (src instanceof Px) {
    c.width = src.w; c.height = src.h;
    c.getContext('2d')!.putImageData(src.toImageData(), 0, 0);
    return c;
  }
  c.width = (src as ImageBitmap).width; c.height = (src as ImageBitmap).height;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  if (src instanceof ImageData) g.putImageData(src, 0, 0);
  else g.drawImage(src as CanvasImageSource, 0, 0);
  return c;
}

function crop(src: HTMLCanvasElement, x: number, y: number, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d')!.drawImage(src, x, y, w, h, 0, 0, w, h);
  return c;
}

function grayscaleLike(c: HTMLCanvasElement): boolean {
  const d = c.getContext('2d')!.getImageData(0, 0, Math.min(16, c.width), Math.min(16, c.height)).data;
  let gray = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0) { n++; if (Math.abs(d[i] - d[i + 1]) + Math.abs(d[i + 1] - d[i + 2]) < 12) gray++; }
  return n > 0 && gray / n >= 0.75;
}

export class TextureAtlas {
  readonly canvas: HTMLCanvasElement;
  readonly texture: THREE.CanvasTexture;
  readonly iconCanvas: HTMLCanvasElement;
  readonly iconTexture: THREE.CanvasTexture;
  iconURL = '';
  readonly data: AtlasData;
  readonly anims: AnimatedTile[] = [];
  readonly hudURLs: Record<string, string> = {};
  fireFrames = 1;
  readonly entityTextures = new Map<string, THREE.Texture>();
  readonly entityCanvases = new Map<string, HTMLCanvasElement>();
  sunTexture!: THREE.Texture;
  endSkyTexture!: THREE.Texture;
  moonTexture!: THREE.Texture;
  cloudTexture!: THREE.Texture;
  readonly packHash: string;
  readonly packNames: string[];
  private tileIndex = new Map<string, number>();
  private tileCanvases: HTMLCanvasElement[] = [];
  private pack: ComposedPack | null;
  private iconIndex = new Map<number, number>();
  readonly tileGray = new Map<number, boolean>();

  constructor(pack: ComposedPack | null, maxTile = 32) {
    this.pack = pack;
    this.packHash = pack?.hash ?? 'default';
    this.packNames = pack?.names ?? [];
    const special: Record<string, number> = {};
    const blockTiles = new Int16Array(ID_LIMIT * FACE_SLOTS).fill(-1);
    const tintTable = new Uint8Array(ID_LIMIT * 2);
    const sources = new Map<string, { canvas: HTMLCanvasElement; anim?: AnimInfo; fromPack: boolean }>();

    const resolveKey = (key: string): string => key;
    const get = (key: string): number => {
      const k = resolveKey(key);
      if (this.tileIndex.has(k)) return this.tileIndex.get(k)!;
      let src = sources.get(k);
      if (!src) {
        const packPath = this.packPathFor(k);
        if (packPath && pack?.files.has(packPath)) {
          src = { canvas: toCanvas(pack.files.get(packPath)!), anim: pack.animations.get(packPath), fromPack: true };
          if ((k === 'water_flow' || k === 'lava_flow') && src.canvas.width >= 32) src.canvas = flowQuadrant(src.canvas);
          if (k === 'end_portal' && src.canvas.width > 16) { const c = document.createElement('canvas'); c.width = c.height = 16; const g = c.getContext('2d')!; g.imageSmoothingEnabled = false; g.drawImage(src.canvas, 0, 0, 64, 64, 0, 0, 16, 16); src.canvas = c; }
        }
        else {
          const def = defaultBlockTexture(k.includes('/') ? k.split('/').pop()! : k);
          const anim = k === 'water_still' || k === 'water_flow' ? { frametime: 2 } : k === 'lava_still' || k === 'lava_flow' ? { frametime: 3 } : undefined;
          src = { canvas: toCanvas(def), anim, fromPack: false };
        }
        sources.set(k, src);
      }
      const idx = this.tileCanvases.length;
      this.tileCanvases.push(src.canvas);
      this.tileIndex.set(k, idx);
      return idx;
    };

    const chestTex = this.chestFaces();
    for (const [k, c] of Object.entries(this.dragonHeadFaces() ?? {})) sources.set(k, { canvas: c, fromPack: true });
    for (const b of BLOCKS) {
      if (!b) continue;
      const fo = pack?.blockFaces.get(b.key) ?? {};
      const faceKey = (slot: 'px' | 'nx' | 'py' | 'ny' | 'pz' | 'nz'): string => fo[slot] ?? b.faces[slot];
      const o = b.id * FACE_SLOTS;
      if (b.id === B.CHEST && chestTex) {
        for (const [k, c] of Object.entries(chestTex)) sources.set(k, { canvas: c, fromPack: true });
      }
      blockTiles[o] = get(faceKey('px'));
      blockTiles[o + 1] = get(faceKey('nx'));
      blockTiles[o + 2] = get(faceKey('py'));
      blockTiles[o + 3] = get(faceKey('ny'));
      blockTiles[o + 4] = get(faceKey('pz'));
      blockTiles[o + 5] = get(faceKey('nz'));
      blockTiles[o + 6] = b.front ? get(fo.front ?? b.front) : -1;
      const packFaces = Object.keys(fo).length > 0;
      blockTiles[o + 7] = packFaces ? (fo.overlay ? get(fo.overlay) : -1) : b.overlay ? get(b.overlay) : -1;
      tintTable[b.id * 2] = b.tint ? TINT_CODE[b.tint] : 0;
      tintTable[b.id * 2 + 1] = b.tintFaces === 'top' ? 1 : 0;
    }
    for (let i = 0; i < 8; i++) special[`wheat${i}`] = get(`wheat_stage${i}`);
    [0, 1, 1, 2].forEach((st, i) => { special[`wart${i}`] = get(`nether_wart_stage${st}`); });
    for (const c of ['carrots', 'potatoes', 'beetroots']) for (let i = 0; i < 4; i++) special[`${c}${i}`] = get(`${c}_stage${i}`);
    for (let i = 0; i < 10; i++) special[`destroy${i}`] = get(`destroy_stage_${i}`);
    for (const k of ['observer_side', 'observer_top', 'observer_front', 'observer_back', 'observer_back_on', 'piston_top', 'piston_top_sticky', 'piston_side', 'piston_bottom', 'piston_inner', 'hopper_outside', 'hopper_top', 'hopper_inside', 'dropper_front', 'dropper_front_vertical', 'dispenser_front', 'dispenser_front_vertical', 'furnace_side', 'furnace_top', 'cauldron_inner', 'chorus_flower_dead', 'end_portal_frame_eye', 'end_portal', 'campfire_log_lit', 'campfire_fire', 'soul_campfire_log_lit', 'soul_campfire_fire', 'respawn_anchor_side1', 'respawn_anchor_side2', 'respawn_anchor_side3', 'respawn_anchor_side4', 'respawn_anchor_top', 'item_frame', 'glow_item_frame', 'glass_pane_top', ...COLORS.map((c) => `${c}_stained_glass_pane_top`), ...HEAD_TILE_KEYS]) special[k] = get(k);
    for (const k of CAVE_TEX) special[k] = get(k);
    special.doorTop = get('oak_door_top');
    special.doorBottom = get('oak_door_bottom');
    special.water = get('water_still');
    special.lava = get('lava_still');
    special.waterFlow = get('water_flow');
    special.lavaFlow = get('lava_flow');
    special.waterSide = special.water;

    if (pack) {
      const grassTop = this.tileCanvases[blockTiles[B.GRASS * FACE_SLOTS + 2]];
      if (grassTop && !grayscaleLike(grassTop)) tintTable[B.GRASS * 2] = 0;
      for (const id of [B.OAK_LEAVES, B.BIRCH_LEAVES, B.SPRUCE_LEAVES, B.JUNGLE_LEAVES, B.TALL_GRASS, B.FERN, B.SUGAR_CANE, B.LILY_PAD]) {
        const c = this.tileCanvases[blockTiles[id * FACE_SLOTS]];
        if (c && !grayscaleLike(c)) tintTable[id * 2] = 0;
      }
    }

    let tileSize = 16;
    for (const c of this.tileCanvases) tileSize = Math.max(tileSize, c.width);
    tileSize = Math.min(maxTile, 1 << Math.ceil(Math.log2(tileSize)));
    const n = this.tileCanvases.length;
    const rows = Math.ceil(n / ATLAS_COLS);
    this.canvas = document.createElement('canvas');
    this.canvas.width = ATLAS_COLS * tileSize;
    this.canvas.height = Math.max(1, rows) * tileSize;
    const g = this.canvas.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    for (let i = 0; i < n; i++) {
      const c = this.tileCanvases[i];
      const fw = c.width;
      const tx = (i % ATLAS_COLS) * tileSize, ty = Math.floor(i / ATLAS_COLS) * tileSize;
      g.drawImage(c, 0, 0, fw, fw, tx, ty, tileSize, tileSize);
      this.tileGray.set(i, grayscaleLike(c));
    }
    for (const [k, idx] of this.tileIndex) {
      const src = sources.get(k);
      if (!src) continue;
      const c = src.canvas;
      const frames = Math.floor(c.height / c.width);
      if (frames <= 1 || !src.anim) continue;
      const fcs: HTMLCanvasElement[] = [];
      for (let f = 0; f < frames; f++) {
        const fc = document.createElement('canvas');
        fc.width = tileSize; fc.height = tileSize;
        const fg = fc.getContext('2d')!;
        fg.imageSmoothingEnabled = false;
        fg.drawImage(c, 0, f * c.width, c.width, c.width, 0, 0, tileSize, tileSize);
        fcs.push(fc);
      }
      const order = src.anim.frames?.length ? src.anim.frames.filter((x) => x < frames) : fcs.map((_, i) => i);
      const levels = mipLevels(tileSize);
      const mipFrames = fcs.map((fc) => buildMips(fc.getContext('2d')!.getImageData(0, 0, tileSize, tileSize), tileSize, levels).slice(1).map(toCanvasData));
      const scratch = new THREE.CanvasTexture(fcs[0]);
      scratch.magFilter = scratch.minFilter = THREE.NearestFilter;
      scratch.generateMipmaps = false;
      scratch.flipY = false;
      const scratchMips = mipFrames[0].map((c) => { const t = new THREE.CanvasTexture(c); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.flipY = false; return t; });
      this.anims.push({ tile: idx, frames: fcs, order, frametime: Math.max(1, src.anim.frametime), current: -1, scratch, mipFrames, scratchMips });
    }
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.magFilter = THREE.NearestFilter;
    const levels = mipLevels(tileSize);
    const mips = buildMips(g.getImageData(0, 0, this.canvas.width, this.canvas.height), tileSize, levels);
    this.texture.mipmaps = [this.canvas, ...mips.slice(1).map(toCanvasData)];
    this.texture.minFilter = THREE.NearestMipmapLinearFilter;
    this.texture.generateMipmaps = false;
    this.texture.flipY = false;
    this.texture.colorSpace = THREE.NoColorSpace;

    this.data = { tileSize, cols: ATLAS_COLS, rows: Math.max(1, rows), blockTiles, tintTable, special, biomeColors: this.biomeColors() };

    this.iconCanvas = document.createElement('canvas');
    this.iconTexture = new THREE.CanvasTexture(this.iconCanvas);
    this.buildIcons();
    this.buildHud();
    this.buildSky();
    this.buildEntities();
  }

  private buildEntities(): void {
    if (!this.pack) { this.shulkerFallback(); return; }
    for (const [k, path] of this.pack.special) {
      if (!k.startsWith('ent_') || k.startsWith('ent_vprof_') || k === 'ent_villager_type') continue;
      const src = this.pack.files.get(path);
      if (!src) continue;
      const c = toCanvas(src);
      if (!(k.startsWith('ent_arrow') && c.width === 32 && c.height === 32) && ((c.width !== 64 && c.width !== 128) || ![32, 64, 128].includes(c.height))) continue;
      const t = new THREE.CanvasTexture(c);
      t.magFilter = THREE.NearestFilter;
      t.minFilter = THREE.NearestMipmapLinearFilter;
      t.generateMipmaps = true;
      t.flipY = false;
      t.colorSpace = THREE.NoColorSpace;
      this.entityTextures.set(k.slice(4), t);
      this.entityCanvases.set(k.slice(4), c);
    }
    this.shulkerFallback();
    const sad = this.entityCanvases.get('strider_saddle');
    if (sad) for (const k of ['strider', 'strider_cold']) {
      const b = this.entityCanvases.get(k);
      if (!b) continue;
      const c = document.createElement('canvas');
      c.width = b.width; c.height = b.height;
      const g = c.getContext('2d')!;
      g.drawImage(b, 0, 0);
      g.drawImage(sad, 0, 0, b.width, b.height);
      const t = new THREE.CanvasTexture(c);
      t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestMipmapLinearFilter; t.generateMipmaps = true; t.flipY = false; t.colorSpace = THREE.NoColorSpace;
      this.entityTextures.set(`${k}_saddled`, t);
      this.entityCanvases.set(`${k}_saddled`, c);
    }
    const base = this.entityCanvases.get('villager');
    if (base) {
      const layer = (key: string) => { const pth = this.pack!.special.get(key); const src = pth ? this.pack!.files.get(pth) : undefined; if (!src) return null; const c = toCanvas(src); return c.width === 64 && c.height === 64 ? c : null; };
      const typeC = layer('ent_villager_type');
      for (const pr of ['none', 'farmer', 'librarian', 'toolsmith', 'armorer', 'butcher', 'fletcher', 'cleric', 'mason', 'fisherman', 'cartographer', 'leatherworker', 'shepherd', 'weaponsmith']) {
        const c = document.createElement('canvas');
        c.width = 64; c.height = 64;
        const g = c.getContext('2d')!;
        g.drawImage(base, 0, 0);
        if (typeC) g.drawImage(typeC, 0, 0);
        const pc = layer(`ent_vprof_${pr}`);
        if (pc) g.drawImage(pc, 0, 0);
        const t = new THREE.CanvasTexture(c);
        t.magFilter = THREE.NearestFilter;
        t.minFilter = THREE.NearestMipmapLinearFilter;
        t.generateMipmaps = true;
        t.flipY = false;
        t.colorSpace = THREE.NoColorSpace;
        this.entityTextures.set(`villager_${pr}`, t);
      }
    }
  }

  private armorTex = new Map<string, THREE.Texture>();

  private canvasTex(c: HTMLCanvasElement): THREE.Texture {
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestMipmapLinearFilter; t.generateMipmaps = true; t.flipY = false; t.colorSpace = THREE.NoColorSpace;
    return t;
  }

  private elytraTex: THREE.Texture | null = null;
  elytraFallback(): THREE.Texture {
    if (this.elytraTex) return this.elytraTex;
    const c = document.createElement('canvas'); c.width = 64; c.height = 32;
    const g = c.getContext('2d')!;
    const px = (x: number, y: number, w: number, h: number, col: string) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
    px(22, 0, 24, 22, '#7d7f8f');
    for (let i = 0; i < 10; i++) { px(24 + i, 2 + i, 1, 20 - i, i % 3 === 0 ? '#5c5e6c' : '#8e90a2'); px(34 + i, 2, 1, 20, i % 2 ? '#6c6e7e' : '#9a9cad'); }
    px(22, 2, 2, 20, '#4a4b56'); px(44, 2, 2, 20, '#4a4b56');
    return (this.elytraTex = this.canvasTex(c));
  }

  private shulkerFallback(): void {
    if (this.entityTextures.has('shulker')) return;
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const g = c.getContext('2d')!;
    const px = (x: number, y: number, w: number, h: number, col: string) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
    const shell = '#94609e', dark = '#5e3a68', light = '#b583bd', inner = '#2a1c30';
    px(0, 16, 64, 12, shell); px(16, 0, 16, 16, light); px(32, 0, 16, 16, inner);
    for (let x = 0; x < 64; x += 4) px(x, 16, 1, 12, dark);
    px(0, 26, 64, 2, dark); px(16, 0, 16, 1, dark); px(16, 15, 16, 1, dark); px(16, 0, 1, 16, dark); px(31, 0, 1, 16, dark);
    for (let i = 2; i < 14; i += 4) px(16 + i, 2, 1, 12, '#a473ad');
    px(0, 44, 64, 8, shell); px(16, 28, 16, 16, inner); px(32, 28, 16, 16, dark);
    for (let x = 0; x < 64; x += 4) px(x, 44, 1, 8, dark);
    px(0, 44, 64, 1, light);
    px(0, 58, 24, 6, '#e8d89c'); px(6, 52, 6, 6, '#f0e2a8'); px(12, 52, 6, 6, '#c8b878');
    px(7, 60, 1, 2, '#2a2018'); px(10, 60, 1, 2, '#2a2018'); px(8, 62, 2, 1, '#8a6a40');
    this.entityTextures.set('shulker', this.canvasTex(c));
    this.entityCanvases.set('shulker', c);
  }

  armorTexture(mat: string, layer: 1 | 2): THREE.Texture {
    const key = `${mat}_${layer}`;
    const hit = this.armorTex.get(key);
    if (hit) return hit;
    let c = this.entityCanvases.get(`armor_${key}`) ?? null;
    if (c && mat === 'leather') {
      const out = document.createElement('canvas');
      out.width = c.width; out.height = c.height;
      const g = out.getContext('2d')!;
      g.drawImage(c, 0, 0);
      const d = g.getImageData(0, 0, out.width, out.height);
      for (let i = 0; i < d.data.length; i += 4) { d.data[i] = d.data[i] * 0xa0 / 255; d.data[i + 1] = d.data[i + 1] * 0x65 / 255; d.data[i + 2] = d.data[i + 2] * 0x40 / 255; }
      g.putImageData(d, 0, 0);
      const ov = this.entityCanvases.get(`armor_leather_${layer}o`);
      if (ov) g.drawImage(ov, 0, 0);
      c = out;
    }
    if (!c) c = defaultArmorCanvas(mat, layer);
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.flipY = false;
    t.colorSpace = THREE.NoColorSpace;
    this.armorTex.set(key, t);
    return t;
  }

  get playerSkinCount(): number { let n = 0; while (this.entityTextures.has(`player${n}`)) n++; return n; }

  private packPathFor(key: string): string | null {
    if (!this.pack) return null;
    if (key.includes('/')) return key;
    const bedrock = this.pack.special.get(`tex:${key}`);
    if (bedrock) return bedrock;
    const alias: Record<string, string> = { aetherite_ore: 'diamond_ore', aetherite_block: 'diamond_block', cinderite_block: 'netherite_block' };
    return `block/${alias[key] ?? key}`;
  }

  private dragonHeadFaces(): Record<string, HTMLCanvasElement> | null {
    const p = this.pack?.special.get('dragon_tex');
    const src = p ? this.pack!.files.get(p) : undefined;
    if (!src) return null;
    const c = toCanvas(src);
    const s = c.width / 256, out: Record<string, HTMLCanvasElement> = {};
    const crop = (x: number, y: number, w: number, h: number) => {
      const t = document.createElement('canvas');
      t.width = t.height = 16 * Math.max(1, Math.round(s));
      const g = t.getContext('2d')!;
      g.imageSmoothingEnabled = false;
      g.drawImage(c, x * s, y * s, w * s, h * s, 0, 0, t.width, t.height);
      return t;
    };
    for (const [n, [u, v, w, h, d]] of Object.entries(DRAGON_HEAD_UV)) {
      out[`dh_${n}_t`] = crop(u + d, v, w, d);
      out[`dh_${n}_b`] = crop(u + d + w, v, w, d);
      out[`dh_${n}_px`] = crop(u, v + d, d, h);
      out[`dh_${n}_f`] = crop(u + d, v + d, w, h);
      out[`dh_${n}_nx`] = crop(u + d + w, v + d, d, h);
      out[`dh_${n}_k`] = crop(u + d + w + d, v + d, w, h);
    }
    out.dh_scale = crop(0, 6, 6, 4);
    out.dh_nostril = crop(112, 4, 4, 2);
    return out;
  }

  private chestFaces(): Record<string, HTMLCanvasElement> | null {
    const p = this.pack?.special.get('chest');
    const src = p ? this.pack!.files.get(p) : undefined;
    if (!src) return null;
    const c = toCanvas(src);
    const s = c.width / 64;
    const assemble = (lx: number, ly: number, bx: number, by: number) => {
      const out = document.createElement('canvas');
      out.width = 14 * s; out.height = 15 * s;
      const g = out.getContext('2d')!;
      g.imageSmoothingEnabled = false;
      g.save(); g.scale(1, -1); g.drawImage(c, lx * s, ly * s, 14 * s, 5 * s, 0, -5 * s, 14 * s, 5 * s); g.restore();
      g.save(); g.scale(1, -1); g.drawImage(c, bx * s, by * s, 14 * s, 10 * s, 0, -15 * s, 14 * s, 10 * s); g.restore();
      const sq = document.createElement('canvas');
      sq.width = sq.height = 16 * s;
      const sg = sq.getContext('2d')!;
      sg.imageSmoothingEnabled = false;
      sg.drawImage(out, 0, 0, 14 * s, 15 * s, 0, 0, 16 * s, 16 * s);
      return sq;
    };
    const front = assemble(14, 14, 14, 33);
    const fg = front.getContext('2d')!;
    fg.drawImage(c, 1 * s, 1 * s, 2 * s, 4 * s, 7 * s, 4 * s, 2 * s, 4 * s);
    const side = assemble(0, 14, 0, 33);
    const top = document.createElement('canvas');
    top.width = top.height = 16 * s;
    const tg = top.getContext('2d')!;
    tg.imageSmoothingEnabled = false;
    tg.drawImage(c, 14 * s, 0, 14 * s, 14 * s, 0, 0, 16 * s, 16 * s);
    return { chest_front: front, chest_side: side, chest_top: top };
  }

  private biomeColors(): number[][] {
    const out: number[][] = [];
    const MC: Record<string, [number, number]> = {
      ocean: [0.5, 0.5], deep_ocean: [0.5, 0.5], beach: [0.8, 0.4], river: [0.5, 0.5], plains: [0.8, 0.4], forest: [0.7, 0.8], birch_forest: [0.6, 0.6],
      desert: [1, 0], mountains: [0.2, 0.3], snowy_mountains: [0, 0.5], snowy_tundra: [0, 0.5], taiga: [0.25, 0.8], swamp: [0.8, 0.9], jungle: [0.95, 0.9], island: [0.8, 0.4],
      savanna: [1, 0], dark_forest: [0.7, 0.8], meadow: [0.5, 0.8], old_growth_taiga: [0.3, 0.8],
      mushroom_fields: [0.9, 1], ice_spikes: [0, 0.5], warm_ocean: [0.5, 0.5],
    };
    const sample = (key: string): ((t: number, d: number) => number[] | null) => {
      const p = this.pack?.special.get(key);
      const src = p ? this.pack!.files.get(p) : undefined;
      if (!src) return () => null;
      const c = toCanvas(src);
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      return (t, dn) => {
        const x = Math.round((1 - t) * (c.width - 1)), y = Math.round((1 - dn * t) * (c.height - 1));
        const i = (y * c.width + x) * 4;
        return [d[i], d[i + 1], d[i + 2]];
      };
    };
    const g = sample('grass_colormap'), f = sample('foliage_colormap');
    for (const b of BIOMES) {
      const [t, d] = MC[b.id] ?? [0.5, 0.5];
      let grass = g(t, d) ?? b.grass;
      let foliage = f(t, d) ?? b.foliage;
      if (b.id === 'swamp') { grass = [106, 112, 57]; foliage = [106, 112, 57]; }
      if (b.id === 'badlands') { grass = [144, 129, 77]; foliage = [158, 129, 77]; }
      if (b.id === 'cherry_grove') { grass = [182, 219, 97]; foliage = [182, 219, 97]; }
      if (b.id === 'mangrove_swamp') { grass = [106, 112, 57]; foliage = [141, 177, 39]; }
      if (b.id === 'dark_forest') grass = grass.map((c, i) => ((c & 0xfe) + [0x28, 0x34, 0x0a][i]) >> 1);
      out.push([...grass, ...foliage, ...b.water]);
    }
    return out;
  }

  tileOf(key: string): number { return this.tileIndex.get(key) ?? 0; }

  tileCanvas(tile: number): HTMLCanvasElement | undefined { return this.tileCanvases[tile]; }

  private itemSource(it: ItemDef): HTMLCanvasElement | null {
    const p = this.pack?.itemTextures.get(it.key);
    if (p && this.pack!.files.has(p)) return toCanvas(this.pack!.files.get(p)!);
    const d = defaultItemTexture(it.key);
    return d ? toCanvas(d) : null;
  }

  private drawIsoBlock(g: CanvasRenderingContext2D, b: BlockDef, x0: number, y0: number, size: number): void {
    const t = this.data.blockTiles;
    const o = b.id * FACE_SLOTS;
    const front = t[o + 6] >= 0 ? t[o + 6] : t[o + 4];
    const top = t[o + 2], right = t[o];
    const tint = this.data.tintTable[b.id * 2];
    const tintTop = this.data.tintTable[b.id * 2 + 1] === 1;
    const tintColor = tint === 0 ? null : tint === 1 ? [145, 189, 89] : tint === 3 ? [128, 167, 85] : tint === 4 ? [97, 153, 97] : [119, 171, 47];
    const draw = (tile: number, shadeF: number, tinted: boolean, m: [number, number, number, number, number, number], overlay = -1) => {
      const c = this.tileCanvases[tile];
      if (!c) return;
      const fc = document.createElement('canvas');
      const fw = this.data.tileSize;
      fc.width = fc.height = fw;
      const fg = fc.getContext('2d')!;
      fg.imageSmoothingEnabled = false;
      fg.drawImage(c, 0, 0, c.width, c.width, 0, 0, fw, fw);
      const tintImg = (cg: CanvasRenderingContext2D, col: number[]) => {
        const id = cg.getImageData(0, 0, fw, fw);
        for (let i = 0; i < id.data.length; i += 4) { id.data[i] = id.data[i] * col[0] / 255; id.data[i + 1] = id.data[i + 1] * col[1] / 255; id.data[i + 2] = id.data[i + 2] * col[2] / 255; }
        cg.putImageData(id, 0, 0);
      };
      if (tinted && tintColor) tintImg(fg, tintColor);
      if (overlay >= 0 && tintColor) {
        const oc = document.createElement('canvas');
        oc.width = oc.height = fw;
        const og = oc.getContext('2d')!;
        og.imageSmoothingEnabled = false;
        og.drawImage(this.tileCanvases[overlay], 0, 0, this.tileCanvases[overlay].width, this.tileCanvases[overlay].width, 0, 0, fw, fw);
        tintImg(og, tintColor);
        fg.drawImage(oc, 0, 0);
      }
      const id = fg.getImageData(0, 0, fw, fw);
      for (let i = 0; i < id.data.length; i += 4) { id.data[i] *= shadeF; id.data[i + 1] *= shadeF; id.data[i + 2] *= shadeF; }
      fg.putImageData(id, 0, 0);
      g.save();
      g.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
      g.drawImage(fc, 0, 0, fw, fw, 0, 0, 1, 1);
      g.restore();
    };
    const s = size * 0.5;
    const cx = x0 + size / 2, cy = y0 + size * 0.5;
    const h = s * 0.5;
    g.imageSmoothingEnabled = false;
    draw(top, 1, !!tintColor, [s, h, -s, h, cx, cy - s]);
    const overlay = this.data.blockTiles[o + 7];
    draw(front, 0.78, !!tintColor && !tintTop, [s, h, 0, s * 0.98, cx - s, cy - h], overlay);
    draw(right, 0.6, !!tintColor && !tintTop, [s, -h, 0, s * 0.98, cx, cy], overlay);
  }

  private iconBoxes(id: number): IsoBox[] | null {
    const t = this.data.blockTiles, o = id * FACE_SLOTS, sp = this.data.special;
    const px = (a: number[]) => a.map((n) => n / 16);
    const it = ITEMS[id];
    if (it?.places !== undefined && (isSlabId(it.places) || isStairsId(it.places))) {
      const m = SHAPE_MATS[(it.placeMeta ?? 0) + (it.places === SLAB2 || it.places === STAIRS2 ? 32 : 0)], mo = m.id * FACE_SLOTS;
      const tl = { top: t[mo + 2], left: t[mo + 4], right: t[mo] };
      if (isSlabId(it.places)) return [{ b: [0, 0, 0, 1, 0.5, 1], ...tl }];
      return [{ b: [0, 0, 0, 1, 0.5, 1], ...tl }, { b: [0, 0.5, 0, 1, 1, 0.5], ...tl }];
    }
    {
      const r = BLOCKS[id]?.render, tl = { top: t[o + 2], left: t[o + 4], right: t[o] };
      if (r === 'fence' && id !== B.NETHER_BRICK_FENCE) return [[2, 0, 6, 6, 16, 10], [10, 0, 6, 14, 16, 10], [0, 6, 7, 16, 9, 9], [0, 12, 7, 16, 15, 9]].map((b) => ({ b: px(b), ...tl }));
      if (r === 'wall') return [{ b: px([4, 0, 4, 12, 16, 12]), ...tl }, { b: px([0, 0, 5, 16, 13, 11]), ...tl }];
      if (r === 'gate') return gateVisual(0).map((b) => ({ b: [...b], ...tl }));
    }
    if (BLOCKS[id]?.render === 'trapdoor') return [{ b: [0, 0, 0, 1, 3 / 16, 1], top: t[o + 2], left: t[o + 4], right: t[o] }];
    if (id === CB.POINTED_DRIPSTONE) return null;
    const sk = BLOCKS[id]?.key;
    if (sk && SPRITE_BLOCKS.includes(sk) && sk !== 'hopper') { const p = this.pack?.itemTextures.get(sk); if (p && this.pack!.files.has(p)) return null; }
    if (id === CB.CAMPFIRE || id === CB.SOUL_CAMPFIRE) {
      const log = t[o], lit = (id === CB.SOUL_CAMPFIRE ? sp.soul_campfire_log_lit : sp.campfire_log_lit) ?? log;
      return [[1, 0, 0, 5, 4, 16], [11, 0, 0, 15, 4, 16], [0, 3, 1, 16, 7, 5], [0, 3, 11, 16, 7, 15]].map((b) => ({ b: px(b), top: lit, left: log, right: log }));
    }
    if (id === CB.RESPAWN_ANCHOR) return [{ b: [0, 0, 0, 1, 1, 1], top: t[o + 2], left: t[o], right: t[o] }];
    if (id === CB.DRAGON_HEAD) {
      const full = [0, 0, 1, 1], k = 0.68;
      return DRAGON_HEAD_PARTS.map((pt) => {
        const b = headBox(pt.b, 1);
        const sc = (n: number, c: number) => (n - c) * k + 0.5 * 16;
        return { b: px([sc(b[0], 8), b[1] * k, sc(b[2], 14.75), sc(b[3], 8), b[4] * k, sc(b[5], 14.75)]), top: sp[headTileKey(pt.n, 't')], left: sp[headTileKey(pt.n, headLocalFace(4, 1))], right: sp[headTileKey(pt.n, headLocalFace(0, 1))], ct: full, cs: full };
      });
    }
    if (id === CB.END_ROD) return [
      { b: px([6, 0, 6, 10, 1, 10]), top: t[o], left: t[o], right: t[o], ct: px([2, 2, 6, 6]), cs: px([2, 6, 6, 7]) },
      { b: px([7, 1, 7, 9, 16, 9]), top: t[o], left: t[o], right: t[o], ct: px([2, 0, 4, 2]), cs: px([0, 0, 2, 15]) },
    ];
    if (isBaseId(id) && CUSTOM_BOX[id]) return customBoxes(makeBlock(id, 0)).map((b) => ({ b: [...b], top: t[o + 2], left: t[o + 4], right: t[o + 4] }));
    if (id === B.STONE_PRESSURE_PLATE || id === B.OAK_PRESSURE_PLATE) return [{ b: px([1, 7, 1, 15, 8, 15]), top: t[o + 2], left: t[o + 2], right: t[o + 2] }];
    if (id === B.STONE_BUTTON || id === B.OAK_BUTTON) return [{ b: px([5, 6, 6, 11, 10, 10]), top: t[o + 2], left: t[o + 2], right: t[o + 2] }];
    if (id === B.PISTON || id === B.STICKY_PISTON) return [{ b: [0, 0, 0, 1, 1, 1], top: id === B.PISTON ? sp.piston_top : sp.piston_top_sticky, left: sp.piston_side, right: sp.piston_side }];
    if (id === B.HOPPER) {
      const p = this.pack?.itemTextures.get('hopper');
      if (p && this.pack!.files.has(p)) return null;
      const out = sp.hopper_outside;
      return [
        { b: px([6, 0, 6, 10, 4, 10]), top: out, left: out, right: out },
        { b: px([4, 4, 4, 12, 10, 12]), top: out, left: out, right: out },
        { b: px([0, 10, 0, 16, 16, 16]), top: sp.hopper_top, left: out, right: out },
      ];
    }
    return null;
  }

  private drawIsoBoxes(g: CanvasRenderingContext2D, boxes: IsoBox[], x0: number, y0: number, size: number): void {
    const s = size * 0.5, h = s * 0.5, cx = x0 + size / 2, cy = y0 + size * 0.5;
    const P = (X: number, Y: number, Z: number): [number, number] => [cx + s * (X - Z), cy - s + h * (X + Z) + 0.98 * s * (1 - Y)];
    const fw = this.data.tileSize;
    const face = (tile: number, shade: number, o: [number, number], u: [number, number], v: [number, number], crop: number[]) => {
      const c = this.tileCanvases[tile];
      if (!c) return;
      const fc = document.createElement('canvas');
      fc.width = fc.height = fw;
      const fg = fc.getContext('2d')!;
      fg.imageSmoothingEnabled = false;
      fg.drawImage(c, 0, 0, c.width, c.width, 0, 0, fw, fw);
      const d = fg.getImageData(0, 0, fw, fw);
      for (let i = 0; i < d.data.length; i += 4) { d.data[i] *= shade; d.data[i + 1] *= shade; d.data[i + 2] *= shade; }
      fg.putImageData(d, 0, 0);
      const sx = crop[0] * fw, sy = crop[1] * fw, sw = Math.max(1, (crop[2] - crop[0]) * fw), sh = Math.max(1, (crop[3] - crop[1]) * fw);
      g.save();
      g.setTransform(u[0] - o[0], u[1] - o[1], v[0] - o[0], v[1] - o[1], o[0], o[1]);
      g.drawImage(fc, sx, sy, sw, sh, 0, 0, 1, 1);
      g.restore();
    };
    g.imageSmoothingEnabled = false;
    const order = [...boxes].sort((a, b) => a.b[1] - b.b[1] || (a.b[0] + a.b[2]) - (b.b[0] + b.b[2]));
    for (const { b, top, left, right, ct, cs } of order) {
      const [x1, y1, z1, x2, y2, z2] = b;
      face(top, 1, P(x1, y2, z1), P(x2, y2, z1), P(x1, y2, z2), ct ?? [x1, z1, x2, z2]);
      face(left, 0.78, P(x1, y2, z2), P(x2, y2, z2), P(x1, y1, z2), cs ?? [x1, 1 - y2, x2, 1 - y1]);
      face(right, 0.6, P(x2, y2, z2), P(x2, y2, z1), P(x2, y1, z2), cs ?? [1 - z2, 1 - y2, 1 - z1, 1 - y1]);
    }
  }

  private buildIcons(): void {
    const list = ITEMS.filter(Boolean);
    const rows = Math.ceil(list.length / ICON_COLS) + 1;
    this.iconCanvas.width = ICON_COLS * ICON_SIZE;
    this.iconCanvas.height = rows * ICON_SIZE;
    const g = this.iconCanvas.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    let i = 0;
    for (const it of list) {
      const x = (i % ICON_COLS) * ICON_SIZE, y = Math.floor(i / ICON_COLS) * ICON_SIZE;
      const b = it.kind === 'block' && it.blockIcon ? BLOCKS[it.id] : null;
      const boxes = it.kind === 'block' ? this.iconBoxes(it.id) : null;
      const sprite = it.kind === 'block' && !boxes && SPRITE_BLOCKS.includes(it.key) && this.pack?.itemTextures.has(it.key) ? this.itemSource(it) : it.id === B.HOPPER && !boxes ? this.itemSource(it) : null;
      if (boxes) this.drawIsoBoxes(g, boxes, x + 1, y + 1, ICON_SIZE - 2);
      else if (sprite) g.drawImage(sprite, 0, 0, sprite.width, sprite.width, x, y, ICON_SIZE, ICON_SIZE);
      else if (b) this.drawIsoBlock(g, b, x + 1, y + 1, ICON_SIZE - 2);
      else {
        let src: HTMLCanvasElement | null = null;
        if (it.kind === 'block') {
          const bd = BLOCKS[it.id];
          const packItem = !!this.pack?.itemTextures.has(it.key) && this.pack.files.has(this.pack.itemTextures.get(it.key)!);
          if (bd?.render === 'door' || ((bd?.render === 'redstone' || bd?.render === 'cave') && packItem) || (bd?.render === 'cave' && !packItem && defaultItemTexture(it.key))) src = this.itemSource(it);
          else {
            const tile = it.id === B.WHEAT ? this.data.special.wheat7 : this.data.blockTiles[it.id * FACE_SLOTS + (bd?.render === 'redstone' || bd?.render === 'rail' ? 2 : 4)];
            src = this.tileCanvases[tile] ?? null;
          }
          const tint = this.data.tintTable[it.id * 2];
          if (src && tint) {
            const c = document.createElement('canvas');
            c.width = src.width; c.height = src.width;
            const cg = c.getContext('2d')!;
            cg.drawImage(src, 0, 0, src.width, src.width, 0, 0, src.width, src.width);
            const d = cg.getImageData(0, 0, c.width, c.height);
            const col = tint === 1 ? [120, 180, 80] : [100, 170, 60];
            for (let k = 0; k < d.data.length; k += 4) { d.data[k] = d.data[k] * col[0] / 255; d.data[k + 1] = d.data[k + 1] * col[1] / 255; d.data[k + 2] = d.data[k + 2] * col[2] / 255; }
            cg.putImageData(d, 0, 0);
            src = c;
          }
        } else src = this.itemSource(it);
        if (src) {
          if (it.tint && this.pack?.itemTextures.has(it.key)) {
            const c = document.createElement('canvas');
            c.width = src.width; c.height = src.height;
            const cg = c.getContext('2d')!;
            cg.drawImage(src, 0, 0);
            const d = cg.getImageData(0, 0, c.width, c.height);
            const col = [(it.tint >> 16) & 255, (it.tint >> 8) & 255, it.tint & 255];
            for (let k = 0; k < d.data.length; k += 4) { d.data[k] = d.data[k] * col[0] / 255; d.data[k + 1] = d.data[k + 1] * col[1] / 255; d.data[k + 2] = d.data[k + 2] * col[2] / 255; }
            cg.putImageData(d, 0, 0);
            src = c;
          }
          g.drawImage(src, 0, 0, src.width, src.width, x, y, ICON_SIZE, ICON_SIZE);
        }
      }
      this.iconIndex.set(it.id, i);
      i++;
    }
    this.iconTexture.magFilter = THREE.NearestFilter;
    this.iconTexture.minFilter = THREE.NearestFilter;
    this.iconTexture.generateMipmaps = false;
    this.iconTexture.flipY = false;
    this.iconTexture.colorSpace = THREE.NoColorSpace;
    this.iconTexture.needsUpdate = true;
    this.iconURL = this.iconCanvas.toDataURL('image/png');
  }

  private guiCache = new Map<string, HTMLCanvasElement | null>();
  private guiURLs = new Map<string, string>();

  guiCanvas(key: string): HTMLCanvasElement | null {
    if (this.guiCache.has(key)) return this.guiCache.get(key)!;
    const p = this.pack?.special.get(key);
    const src = p ? this.pack!.files.get(p) : undefined;
    const c = src ? toCanvas(src) : null;
    this.guiCache.set(key, c);
    return c;
  }

  guiURL(key: string): string | null {
    const hit = this.guiURLs.get(key);
    if (hit) return hit;
    const c = this.guiCanvas(key);
    if (!c) return null;
    const u = c.toDataURL('image/png');
    this.guiURLs.set(key, u);
    return u;
  }

  get fontInfo(): { canvas: HTMLCanvasElement; chars: string[]; ascent: number } | null {
    const c = this.guiCanvas('font_ascii');
    const raw = this.pack?.special.get('font_ascii_chars');
    if (!c || !raw) return null;
    try { const j = JSON.parse(raw) as { chars: string[]; ascent: number }; return { canvas: c, chars: j.chars, ascent: j.ascent }; } catch { return null; }
  }

  private tileURLs = new Map<number, string>();

  private lodTable: Uint8Array | null = null;

  lodColors(): Uint8Array {
    if (this.lodTable) return this.lodTable;
    const out = new Uint8Array(ID_LIMIT * 4);
    const c = document.createElement('canvas');
    c.width = c.height = 4;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    for (let id = 0; id < ID_LIMIT; id++) {
      if (id >= 256 && !BLOCKS[id]) continue;
      const tile = this.blockTileCanvas(id, 2) ?? this.blockTileCanvas(id, 0);
      if (!tile) continue;
      g.clearRect(0, 0, 4, 4);
      g.imageSmoothingEnabled = true;
      g.drawImage(tile, 0, 0, Math.min(tile.width, 16), Math.min(tile.height, 16), 0, 0, 4, 4);
      const d = g.getImageData(0, 0, 4, 4).data;
      let r = 0, gg = 0, b = 0, a = 0;
      for (let i = 0; i < 64; i += 4) { const w = d[i + 3] / 255; r += d[i] * w; gg += d[i + 1] * w; b += d[i + 2] * w; a += w; }
      if (a > 0) { out[id * 4] = r / a; out[id * 4 + 1] = gg / a; out[id * 4 + 2] = b / a; }
      out[id * 4 + 3] = this.data.tintTable[id * 2];
    }
    this.lodTable = out;
    return out;
  }

  blockTileCanvas(blockIdNum: number, slot = 0): HTMLCanvasElement | null {
    const idx = this.data.blockTiles[blockIdNum * FACE_SLOTS + slot];
    return idx >= 0 ? this.tileCanvases[idx] ?? null : null;
  }

  tileURL(blockIdNum: number, slot = 0): string | null {
    const k = blockIdNum * 8 + slot;
    if (this.tileURLs.has(k)) return this.tileURLs.get(k)!;
    const idx = this.data.blockTiles[blockIdNum * FACE_SLOTS + slot];
    const c = idx >= 0 ? this.tileCanvases[idx] : undefined;
    if (!c) return null;
    const url = c.toDataURL('image/png');
    this.tileURLs.set(k, url);
    return url;
  }

  iconPos(id: number): { x: number; y: number } {
    const i = this.iconIndex.get(id) ?? 0;
    return { x: (i % ICON_COLS) * ICON_SIZE, y: Math.floor(i / ICON_COLS) * ICON_SIZE };
  }

  iconUV(id: number): [number, number, number, number] {
    const p = this.iconPos(id);
    const W = this.iconCanvas.width, H = this.iconCanvas.height;
    return [p.x / W, p.y / H, (p.x + ICON_SIZE) / W, (p.y + ICON_SIZE) / H];
  }

  iconStyle(id: number, _size?: number): string {
    const p = this.iconPos(id);
    const cols = this.iconCanvas.width / ICON_SIZE, rows = this.iconCanvas.height / ICON_SIZE;
    const cx = p.x / ICON_SIZE, cy = p.y / ICON_SIZE;
    const px = cols > 1 ? (cx / (cols - 1)) * 100 : 0, py = rows > 1 ? (cy / (rows - 1)) * 100 : 0;
    return `background-image:url(${this.iconURL});background-size:${cols * 100}% ${rows * 100}%;background-position:${px.toFixed(4)}% ${py.toFixed(4)}%`;
  }

  private buildHud(): void {
    const kinds = ['heart', 'heart_half', 'heart_empty', 'food', 'food_half', 'food_empty', 'armor', 'armor_half', 'armor_empty', 'bubble'] as const;
    for (const k of kinds) {
      const p = this.pack?.special.get(k);
      const src = p ? this.pack!.files.get(p) : undefined;
      const c = src ? toCanvas(src) : toCanvas(hudIcon(k));
      this.hudURLs[k] = c.toDataURL('image/png');
    }
    const fp = this.pack?.special.get('fire_0');
    const fsrc = fp ? this.pack!.files.get(fp) : undefined;
    const fc = fsrc ? toCanvas(fsrc) : proceduralFire();
    this.fireFrames = Math.max(1, Math.round(fc.height / fc.width));
    this.hudURLs.fire = fc.toDataURL('image/png');
    for (const k of ['gui_hotbar', 'gui_hotbar_selection', 'gui_crosshair', 'gui_slot']) {
      const p = this.pack?.special.get(k);
      const src = p ? this.pack!.files.get(p) : undefined;
      if (src) this.hudURLs[k.slice(4)] = toCanvas(src).toDataURL('image/png');
    }
  }

  private buildSky(): void {
    const mk = (key: string, fallback: () => Px, wrap = false) => {
      const p = this.pack?.special.get(key);
      const src = p ? this.pack!.files.get(p) : undefined;
      let c = src ? toCanvas(src) : toCanvas(fallback());
      if (key === 'moon' && src && c.width > c.height * 2) c = crop(c, 0, 0, c.width / 4, c.height / 2);
      const t = new THREE.CanvasTexture(c);
      t.magFilter = THREE.NearestFilter;
      t.minFilter = THREE.NearestFilter;
      t.generateMipmaps = false;
      t.colorSpace = THREE.NoColorSpace;
      if (wrap) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
      return t;
    };
    this.sunTexture = mk('sun', () => defaultBlockTexture('sun'));
    this.moonTexture = mk('moon', () => defaultBlockTexture('moon'));
    this.cloudTexture = mk('clouds', () => cloudTexture(96), true);
    this.endSkyTexture = mk('end_sky', () => defaultBlockTexture('end_sky'), true);
  }

  updateAnimations(renderer: THREE.WebGLRenderer, ticks: number): void {
    for (const a of this.anims) {
      const step = Math.floor(ticks / a.frametime) % a.order.length;
      const f = a.order[step];
      if (f === a.current) continue;
      a.current = f;
      a.scratch.image = a.frames[f];
      a.scratch.needsUpdate = true;
      const ts = this.data.tileSize;
      const pos = new THREE.Vector2((a.tile % ATLAS_COLS) * ts, Math.floor(a.tile / ATLAS_COLS) * ts);
      try {
        renderer.copyTextureToTexture(a.scratch, this.texture, null, pos);
        for (let l = 0; l < a.scratchMips.length; l++) {
          const t = a.scratchMips[l];
          t.image = a.mipFrames[f][l];
          t.needsUpdate = true;
          renderer.copyTextureToTexture(t, this.texture, null, new THREE.Vector2(pos.x >> (l + 1), pos.y >> (l + 1)), 0, l + 1);
        }
      } catch { /* first frame before upload */ }
    }
  }

  dispose(): void {
    this.texture.dispose();
    this.iconTexture.dispose();
    for (const a of this.anims) { a.scratch.dispose(); for (const t of a.scratchMips) t.dispose(); }
    this.sunTexture?.dispose();
    this.endSkyTexture?.dispose();
    this.moonTexture?.dispose();
    this.cloudTexture?.dispose();
    for (const t of this.entityTextures.values()) t.dispose();
    for (const t of this.armorTex.values()) t.dispose();
  }
}

function mipLevels(tileSize: number): number {
  return Math.max(1, Math.round(Math.log2(tileSize)) + 1);
}

function toCanvasData(d: ImageData): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = d.width; c.height = d.height;
  c.getContext('2d')!.putImageData(d, 0, 0);
  return c;
}

export function buildMips(base: ImageData, tileSize: number, levels: number): ImageData[] {
  const out = [base];
  const tilesX = base.width / tileSize, tilesY = base.height / tileSize;
  const binary = new Uint8Array(tilesX * tilesY);
  for (let ty = 0; ty < tilesY; ty++) for (let tx = 0; tx < tilesX; tx++) {
    let holes = false, partial = false;
    for (let y = 0; y < tileSize && !partial; y++) for (let x = 0; x < tileSize; x++) {
      const a = base.data[((ty * tileSize + y) * base.width + tx * tileSize + x) * 4 + 3];
      if (a === 0) holes = true; else if (a < 250) { partial = true; break; }
    }
    binary[ty * tilesX + tx] = holes && !partial ? 1 : 0;
  }
  let prev = base, ts = tileSize;
  for (let l = 1; l < levels; l++) {
    const w = Math.max(1, prev.width >> 1), h = Math.max(1, prev.height >> 1);
    const next = new ImageData(w, h);
    const s = prev.data, d = next.data, pw = prev.width;
    ts >>= 1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let k = 0; k < 4; k++) {
        const i = (((y * 2 + (k >> 1)) * pw) + x * 2 + (k & 1)) * 4;
        const al = s[i + 3];
        if (al) { r += s[i] * al; g += s[i + 1] * al; b += s[i + 2] * al; n += al; }
        a += al;
      }
      const o = (y * w + x) * 4;
      if (n) { d[o] = r / n; d[o + 1] = g / n; d[o + 2] = b / n; }
      const cut = binary[Math.floor(y / Math.max(1, ts)) * tilesX + Math.floor(x / Math.max(1, ts))];
      d[o + 3] = cut ? (a / 4 >= 96 ? 255 : 0) : a / 4;
    }
    out.push(next);
    prev = next;
  }
  return out;
}

function proceduralFire(): HTMLCanvasElement {
  const W = 16, F = 16;
  const c = document.createElement('canvas');
  c.width = W; c.height = W * F;
  const g = c.getContext('2d')!;
  const img = g.createImageData(W, W * F);
  const heat = new Float32Array(W * (W + 2));
  let seed = 1337;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let warm = 0; warm < 40 + F; warm++) {
    for (let x = 0; x < W; x++) heat[(W + 1) * W + x] = 0.7 + rnd() * 0.6;
    const next = new Float32Array(heat.length);
    for (let y = 0; y <= W; y++) for (let x = 0; x < W; x++) {
      const b = heat[(y + 1) * W + x] * 2 + heat[(y + 1) * W + ((x + W - 1) % W)] + heat[(y + 1) * W + ((x + 1) % W)] + heat[y * W + x];
      next[y * W + x] = Math.max(0, b / 5.06 - 0.012 * (1 - y / W));
    }
    next.set(heat.subarray((W + 1) * W), (W + 1) * W);
    heat.set(next);
    const f = warm - 40;
    if (f < 0) continue;
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      const v = Math.min(1, heat[y * W + x] * 1.4);
      const o = ((f * W + y) * W + x) * 4;
      if (v < 0.2) { img.data[o + 3] = 0; continue; }
      img.data[o] = 255; img.data[o + 1] = Math.round(80 + v * 175); img.data[o + 2] = Math.round(Math.max(0, v - 0.7) * 300); img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

const ARMOR_COLORS: Record<string, [number, number, number]> = {
  leather: [0x5a3416, 0x9a5e2e, 0xc08a58], iron: [0x6a6a6a, 0xc6c6c6, 0xf2f2f2], gold: [0x8a6a10, 0xe8c228, 0xfff2a0], aetherite: [0x0e5f5a, 0x3fd8cc, 0xb8fff8],
};

function defaultArmorCanvas(mat: string, layer: 1 | 2): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 32;
  const g = c.getContext('2d')!;
  const [dk, md, lt] = ARMOR_COLORS[mat] ?? ARMOR_COLORS.iron;
  const rgb = (v: number) => `rgb(${v >> 16},${(v >> 8) & 255},${v & 255})`;
  let seed = mat.length * 977 + layer * 131;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const box = (u: number, v: number, w: number, h: number, d: number) => {
    const rects: [number, number, number, number][] = [[u + d, v, w, d], [u + d + w, v, w, d], [u, v + d, d, h], [u + d, v + d, w, h], [u + d + w, v + d, d, h], [u + d + w + d, v + d, w, h]];
    for (const [x, y, rw, rh] of rects) {
      for (let yy = 0; yy < rh; yy++) for (let xx = 0; xx < rw; xx++) {
        const edge = xx === 0 || yy === 0 || xx === rw - 1 || yy === rh - 1;
        const r = rnd();
        g.fillStyle = rgb(edge ? dk : r < 0.18 ? lt : r > 0.9 ? dk : md);
        g.fillRect(x + xx, y + yy, 1, 1);
      }
    }
  };
  if (layer === 1) {
    box(0, 0, 8, 8, 8);
    g.clearRect(8 + 2, 8 + 3, 4, 2);
    g.clearRect(8 + 1, 8 + 5, 6, 3);
    box(16, 16, 8, 12, 4);
    box(40, 16, 4, 12, 4);
    box(0, 16, 4, 12, 4);
    g.clearRect(4, 20, 4, 6); g.clearRect(0, 20, 4, 6); g.clearRect(8, 20, 8, 6);
  } else {
    box(16, 16, 8, 12, 4);
    g.clearRect(20, 20, 8, 6); g.clearRect(16, 20, 4, 6); g.clearRect(28, 20, 12, 6);
    box(0, 16, 4, 12, 4);
    g.clearRect(0, 26, 16, 6);
  }
  return c;
}

function flowQuadrant(c: HTMLCanvasElement): HTMLCanvasElement {
  const w = c.width, half = w >> 1, frames = Math.max(1, Math.floor(c.height / w));
  const out = document.createElement('canvas');
  out.width = half; out.height = half * frames;
  const g = out.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  for (let f = 0; f < frames; f++) g.drawImage(c, 0, f * w, half, half, 0, f * half, half, half);
  return out;
}

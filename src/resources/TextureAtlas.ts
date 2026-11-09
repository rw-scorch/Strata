import * as THREE from 'three';
import { BLOCKS, BlockDef, B } from '../core/blocks';
import { ITEMS, ItemDef } from '../core/items';
import { BIOMES } from '../core/worldgen/biomes';
import { defaultBlockTexture, defaultItemTexture, cloudTexture, hudIcon, Px } from './DefaultTextures';
import type { ComposedPack, ImageSource } from './ResourcePackManager';
import type { AnimInfo } from './ResourcePackImporter';

export const FACE_SLOTS = 8;
export const ATLAS_COLS = 32;
export const ICON_SIZE = 32;
export const ICON_COLS = 16;

export interface AnimatedTile {
  tile: number;
  frames: HTMLCanvasElement[];
  order: number[];
  frametime: number;
  current: number;
  scratch: THREE.CanvasTexture;
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
  let diff = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0) { diff += Math.abs(d[i] - d[i + 1]) + Math.abs(d[i + 1] - d[i + 2]); n++; }
  return n > 0 && diff / n < 8;
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
  readonly entityTextures = new Map<string, THREE.Texture>();
  readonly entityCanvases = new Map<string, HTMLCanvasElement>();
  sunTexture!: THREE.Texture;
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
    const blockTiles = new Int16Array(256 * FACE_SLOTS).fill(-1);
    const tintTable = new Uint8Array(256 * 2);
    const sources = new Map<string, { canvas: HTMLCanvasElement; anim?: AnimInfo; fromPack: boolean }>();

    const resolveKey = (key: string): string => key;
    const get = (key: string): number => {
      const k = resolveKey(key);
      if (this.tileIndex.has(k)) return this.tileIndex.get(k)!;
      let src = sources.get(k);
      if (!src) {
        const packPath = this.packPathFor(k);
        if (packPath && pack?.files.has(packPath)) src = { canvas: toCanvas(pack.files.get(packPath)!), anim: pack.animations.get(packPath), fromPack: true };
        else {
          const def = defaultBlockTexture(k.includes('/') ? k.split('/').pop()! : k);
          const anim = k === 'water_still' ? { frametime: 2 } : k === 'lava_still' ? { frametime: 3 } : undefined;
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
      blockTiles[o + 7] = b.overlay ? get(fo.overlay ?? b.overlay) : -1;
      tintTable[b.id * 2] = b.tint ? TINT_CODE[b.tint] : 0;
      tintTable[b.id * 2 + 1] = b.tintFaces === 'top' ? 1 : 0;
    }
    for (let i = 0; i < 8; i++) special[`wheat${i}`] = get(`wheat_stage${i}`);
    for (let i = 0; i < 10; i++) special[`destroy${i}`] = get(`destroy_stage_${i}`);
    special.doorTop = get('oak_door_top');
    special.doorBottom = get('oak_door_bottom');
    special.water = get('water_still');
    special.lava = get('lava_still');
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
      const scratch = new THREE.CanvasTexture(fcs[0]);
      scratch.magFilter = scratch.minFilter = THREE.NearestFilter;
      scratch.generateMipmaps = false;
      scratch.flipY = false;
      this.anims.push({ tile: idx, frames: fcs, order, frametime: Math.max(1, src.anim.frametime), current: -1, scratch });
    }
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.NearestFilter;
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
    if (!this.pack) return;
    for (const [k, path] of this.pack.special) {
      if (!k.startsWith('ent_')) continue;
      const src = this.pack.files.get(path);
      if (!src) continue;
      const c = toCanvas(src);
      if (c.width !== 64 || (c.height !== 64 && c.height !== 32)) continue;
      const t = new THREE.CanvasTexture(c);
      t.magFilter = t.minFilter = THREE.NearestFilter;
      t.generateMipmaps = false;
      t.flipY = false;
      t.colorSpace = THREE.NoColorSpace;
      this.entityTextures.set(k.slice(4), t);
      this.entityCanvases.set(k.slice(4), c);
    }
  }

  get playerSkinCount(): number { let n = 0; while (this.entityTextures.has(`player${n}`)) n++; return n; }

  private packPathFor(key: string): string | null {
    if (!this.pack) return null;
    if (key.includes('/')) return key;
    const bedrock = this.pack.special.get(`tex:${key}`);
    if (bedrock) return bedrock;
    const alias: Record<string, string> = { aetherite_ore: 'diamond_ore', aetherite_block: 'diamond_block' };
    return `block/${alias[key] ?? key}`;
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
      if (b) this.drawIsoBlock(g, b, x + 1, y + 1, ICON_SIZE - 2);
      else {
        let src: HTMLCanvasElement | null = null;
        if (it.kind === 'block') {
          const bd = BLOCKS[it.id];
          if (bd?.render === 'door') src = this.itemSource(it);
          else {
            const tile = it.id === B.WHEAT ? this.data.special.wheat7 : this.data.blockTiles[it.id * FACE_SLOTS + 4];
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

  iconPos(id: number): { x: number; y: number } {
    const i = this.iconIndex.get(id) ?? 0;
    return { x: (i % ICON_COLS) * ICON_SIZE, y: Math.floor(i / ICON_COLS) * ICON_SIZE };
  }

  iconUV(id: number): [number, number, number, number] {
    const p = this.iconPos(id);
    const W = this.iconCanvas.width, H = this.iconCanvas.height;
    return [p.x / W, p.y / H, (p.x + ICON_SIZE) / W, (p.y + ICON_SIZE) / H];
  }

  iconStyle(id: number, size: number): string {
    const p = this.iconPos(id);
    const scale = size / ICON_SIZE;
    return `background-image:url(${this.iconURL});background-size:${this.iconCanvas.width * scale}px ${this.iconCanvas.height * scale}px;background-position:-${p.x * scale}px -${p.y * scale}px`;
  }

  private buildHud(): void {
    const kinds = ['heart', 'heart_half', 'heart_empty', 'food', 'food_half', 'food_empty', 'armor', 'armor_half', 'armor_empty', 'bubble'] as const;
    for (const k of kinds) {
      const p = this.pack?.special.get(k);
      const src = p ? this.pack!.files.get(p) : undefined;
      const c = src ? toCanvas(src) : toCanvas(hudIcon(k));
      this.hudURLs[k] = c.toDataURL('image/png');
    }
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
    this.cloudTexture = mk('clouds', () => cloudTexture(256), true);
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
      try { renderer.copyTextureToTexture(a.scratch, this.texture, null, pos); } catch { /* first frame before upload */ }
    }
  }

  dispose(): void {
    this.texture.dispose();
    this.iconTexture.dispose();
    for (const a of this.anims) a.scratch.dispose();
    this.sunTexture?.dispose();
    this.moonTexture?.dispose();
    this.cloudTexture?.dispose();
    for (const t of this.entityTextures.values()) t.dispose();
  }
}

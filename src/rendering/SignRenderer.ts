import * as THREE from 'three';
import { cubesGeometry, type VCube } from './VanillaModels';
import { createEntityMaterial, type WorldUniforms } from './ChunkMaterial';
import { bid, signKind, signWood, signAngle, SIGN_ATTACHED, type SignKind } from '../core/blocks';
import type { TextureAtlas } from '../resources/TextureAtlas';
import { darkRGB, sideEmpty, textRGB, type SignData, type SignSide } from '../core/signs';

interface SignView {
  key: string; x: number; y: number; z: number; v: number; ver: string;
  obj: THREE.Group; mat: THREE.ShaderMaterial; texts: { mesh: THREE.Mesh; mat: THREE.ShaderMaterial; tex: THREE.CanvasTexture }[];
  light: number; lightT: number;
}

const WOOD_RGB = ['#a8834d', '#d2bf88', '#6e5134', '#a87656', '#b05d37', '#4a3220', '#e3b3ad', '#773631'];
const LOG_RGB = ['#b08d57', '#c8b77a', '#8a6a43', '#ab8659', '#af5c3a', '#6b4c31', '#d8a8a0', '#7a3a33'];
const S = 3;

const STAND: VCube[] = [{ o: [-12, -14, -1], s: [24, 12, 2], uv: [0, 0] }];
const STICK: VCube[] = [{ o: [-1, -2, -1], s: [2, 14, 2], uv: [0, 14] }];
const HBOARD: VCube[] = [{ o: [-7, 0, -1], s: [14, 10, 2], uv: [0, 12] }];
const PLANK: VCube[] = [{ o: [-8, -6, -2], s: [16, 2, 4], uv: [0, 0] }];
const CHAIN_A: VCube[] = [{ o: [-1.5, 0, 0], s: [3, 6, 0], uv: [0, 6] }];
const CHAIN_B: VCube[] = [{ o: [-1.5, 0, 0], s: [3, 6, 0], uv: [6, 6] }];
const VCHAIN: VCube[] = [{ o: [-6, -6, 0], s: [12, 6, 0], uv: [14, 6] }];

interface TextLayout { y: number; z: number; f: number; line: number; w: number; }
const LAYOUT: Record<SignKind, TextLayout> = {
  stand: { y: 0.5 + 1 / 3, z: 0.046666667, f: 0.015625 * (2 / 3), line: 10, w: 90 },
  wall: { y: 0.1875 + 1 / 3, z: 0.046666667, f: 0.015625 * (2 / 3), line: 10, w: 90 },
  hang: { y: 0.625 - 0.32, z: 0.073, f: 0.015625 * 0.9, line: 9, w: 60 },
  wallhang: { y: 0.625 - 0.32, z: 0.073, f: 0.015625 * 0.9, line: 9, w: 60 },
};

export class SignRenderer {
  readonly group = new THREE.Group();
  private chunks = new Map<string, Set<string>>();
  private views = new Map<string, SignView>();
  private geo = new Map<string, THREE.BufferGeometry>();
  private tex: { sign: THREE.Texture[]; hang: THREE.Texture[] };
  private owned: THREE.Texture[] = [];

  data: (key: string) => SignData | null = () => null;

  constructor(private u: WorldUniforms, atlas: TextureAtlas, private probe: (x: number, y: number, z: number) => number) {
    this.tex = this.load(atlas);
  }

  private load(atlas: TextureAtlas): { sign: THREE.Texture[]; hang: THREE.Texture[] } {
    for (const t of this.owned) t.dispose();
    this.owned = [];
    const get = (k: string, make: () => HTMLCanvasElement) => {
      const t = atlas.entityTextures.get(k);
      if (t) return t;
      const tex = new THREE.CanvasTexture(make());
      tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.flipY = false; tex.colorSpace = THREE.NoColorSpace;
      this.owned.push(tex);
      return tex;
    };
    return {
      sign: WOOD_RGB.map((c, i) => get(`sign_${i}`, () => woodCanvas(c, false))),
      hang: LOG_RGB.map((c, i) => get(`hanging_sign_${i}`, () => woodCanvas(c, true))),
    };
  }

  setAtlas(atlas: TextureAtlas): void {
    this.tex = this.load(atlas);
    for (const v of [...this.views.values()]) { this.removeView(v.key); this.upsert(v.key, v.x, v.y, v.z, v.v, true); }
  }

  private lightAt(x: number, y: number, z: number): number {
    let l = this.probe(x + 0.5, y + 0.5, z + 0.5);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) l = Math.max(l, this.probe(x + 0.5 + dx, y + 0.5, z + 0.5 + dz) * 0.9);
    return l;
  }

  private geometry(name: string, cubes: VCube[]): THREE.BufferGeometry {
    let g = this.geo.get(name);
    if (!g) { g = cubesGeometry(cubes, 64, 32); this.geo.set(name, g); }
    return g;
  }

  setChunk(key: string, cx: number, cz: number, list: Int32Array | number[] | null | undefined): void {
    const next = new Set<string>();
    const found: [string, number, number, number, number][] = [];
    if (list) for (let i = 0; i + 3 < list.length; i += 4) {
      const x = cx * 16 + list[i], y = list[i + 1], z = cz * 16 + list[i + 2];
      const k = `${x},${y},${z}`;
      next.add(k);
      found.push([k, x, y, z, list[i + 3]]);
    }
    const prev = this.chunks.get(key);
    if (prev) for (const k of prev) if (!next.has(k)) this.removeView(k);
    this.chunks.set(key, next);
    for (const [k, x, y, z, v] of found) this.upsert(k, x, y, z, v);
  }

  refresh(x: number, y: number, z: number): void {
    const v = this.views.get(`${x},${y},${z}`);
    if (v) this.upsert(v.key, v.x, v.y, v.z, v.v);
  }

  remove(key: string): void {
    const s = this.chunks.get(key);
    if (!s) return;
    for (const k of s) this.removeView(k);
    this.chunks.delete(key);
  }

  private upsert(key: string, x: number, y: number, z: number, v: number, force = false): void {
    const kind = signKind(bid(v));
    if (!kind) return;
    const d = this.data(key);
    const ver = d ? JSON.stringify(d) : '';
    const old = this.views.get(key);
    if (!force && old && old.v === v && old.ver === ver) return;
    if (old) this.removeView(key);
    const wood = signWood(bid(v));
    const hanging = kind === 'hang' || kind === 'wallhang';
    const mat = createEntityMaterial(this.u, hanging ? this.tex.hang[wood] : this.tex.sign[wood]);
    const obj = new THREE.Group();
    const model = new THREE.Group();
    const add = (g: THREE.BufferGeometry, parent: THREE.Object3D = model) => { const m = new THREE.Mesh(g, mat); m.castShadow = true; m.layers.enable(1); parent.add(m); return m; };
    if (hanging) {
      model.position.y = 0.625;
      model.scale.set(1 / 16, -1 / 16, -1 / 16);
      add(this.geometry('hboard', HBOARD));
      if (kind === 'wallhang') add(this.geometry('plank', PLANK));
      if (kind === 'hang' && (v >>> 8) & SIGN_ATTACHED) add(this.geometry('vchain', VCHAIN));
      else for (const sx of [-5, 5]) for (const [r, g] of [[-Math.PI / 4, 'ca'], [Math.PI / 4, 'cb']] as const) {
        const piv = new THREE.Group();
        piv.position.set(sx, -6, 0);
        piv.rotation.y = r;
        add(this.geometry(g, g === 'ca' ? CHAIN_A : CHAIN_B), piv);
        model.add(piv);
      }
    } else {
      const k = (2 / 3) / 16;
      model.scale.set(k, -k, -k);
      if (kind === 'wall') model.position.set(0, 0.1875, -0.4375);
      else model.position.y = 0.5;
      add(this.geometry('board', STAND));
      if (kind === 'stand') add(this.geometry('stick', STICK));
    }
    obj.add(model);
    const texts: SignView['texts'] = [];
    if (d) {
      const lay = LAYOUT[kind];
      const zBase = kind === 'wall' ? -0.4375 : 0;
      for (const [side, front] of [[d.f, true], [d.b, false]] as const) {
        if (sideEmpty(side)) continue;
        const t = this.textMesh(side, lay);
        t.mesh.position.set(0, lay.y, zBase + (front ? lay.z : -lay.z));
        if (!front) t.mesh.rotation.y = Math.PI;
        obj.add(t.mesh);
        texts.push(t);
      }
    }
    obj.position.set(x + 0.5, y, z + 0.5);
    obj.rotation.y = signAngle(v);
    this.group.add(obj);
    const light = old?.light ?? this.lightAt(x, y, z);
    for (const m of [mat, ...texts.map((t) => t.mat)]) m.uniforms.uLight.value = Math.max(0.12, light);
    this.views.set(key, { key, x, y, z, v, ver, obj, mat, texts, light, lightT: 0 });
  }

  private textMesh(side: SignSide, lay: TextLayout): SignView['texts'][number] {
    const wu = lay.w + 6, hu = lay.line * 4;
    const c = document.createElement('canvas');
    c.width = wu * S; c.height = hu * S;
    const g = c.getContext('2d')!;
    g.font = `${Math.round(8 * S)}px "StrataPack", Menlo, Consolas, ui-monospace, monospace`;
    g.textAlign = 'center';
    g.textBaseline = 'top';
    const css = (n: number) => `#${(n & 0xffffff).toString(16).padStart(6, '0')}`;
    const main = side.g ? textRGB(side.c) : darkRGB(side.c, false), outline = darkRGB(side.c, true);
    side.t.forEach((line, j) => {
      if (!line) return;
      const cx = (wu * S) / 2, cy = j * lay.line * S + S * 0.5;
      const maxW = lay.w * S;
      const fit = (s: string) => { const w = g.measureText(s).width; return w > maxW ? maxW / w : 1; };
      const k = fit(line);
      g.save();
      g.translate(cx, cy);
      g.scale(k, 1);
      if (side.g) {
        g.fillStyle = css(outline);
        for (const [ox, oy] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) g.fillText(line, ox * S, oy * S);
      }
      g.fillStyle = css(main);
      g.fillText(line, 0, 0);
      g.restore();
    });
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.NoColorSpace; tex.generateMipmaps = false; tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter;
    const mat = createEntityMaterial(this.u, tex);
    mat.uniforms.uEmissive.value = side.g ? 1 : 0;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(wu * lay.f, hu * lay.f), mat);
    return { mesh, mat, tex };
  }

  private removeView(key: string): void {
    const v = this.views.get(key);
    if (!v) return;
    this.group.remove(v.obj);
    v.mat.dispose();
    for (const t of v.texts) { t.mat.dispose(); t.tex.dispose(); t.mesh.geometry.dispose(); }
    this.views.delete(key);
  }

  update(dt: number, camX: number, camY: number, camZ: number, maxDist: number): void {
    const md2 = maxDist * maxDist;
    for (const v of this.views.values()) {
      const dx = v.x - camX, dy = v.y - camY, dz = v.z - camZ;
      const d2 = dx * dx + dy * dy + dz * dz;
      v.obj.visible = d2 < md2;
      if (!v.obj.visible) continue;
      for (const t of v.texts) t.mesh.visible = d2 < 48 * 48;
      v.lightT -= dt;
      if (v.lightT <= 0) {
        v.lightT = 0.4 + Math.random() * 0.2;
        v.light = this.lightAt(v.x, v.y, v.z);
        const l = Math.max(0.12, v.light);
        v.mat.uniforms.uLight.value = l;
        for (const t of v.texts) t.mat.uniforms.uLight.value = l;
      }
    }
  }

  count(): number { return this.views.size; }

  dispose(): void {
    for (const k of [...this.views.keys()]) this.removeView(k);
    for (const g of this.geo.values()) g.dispose();
    for (const t of this.owned) t.dispose();
  }
}

function woodCanvas(base: string, hanging: boolean): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 32;
  const g = c.getContext('2d')!;
  let seed = base.charCodeAt(1) * 131 + (hanging ? 7 : 0);
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const wood = (x: number, y: number, w: number, h: number) => {
    g.fillStyle = base; g.fillRect(x, y, w, h);
    for (let i = 0; i < (w * h) / 5; i++) { g.fillStyle = rnd() < 0.55 ? 'rgba(0,0,0,0.13)' : 'rgba(255,230,180,0.09)'; g.fillRect(x + Math.floor(rnd() * w), y + Math.floor(rnd() * h), 1 + Math.floor(rnd() * 4), 1); }
  };
  if (!hanging) {
    wood(0, 0, 52, 14);
    g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(2, 2, 24, 1); g.fillRect(2, 13, 24, 1);
    g.fillStyle = '#5b3d22'; g.fillRect(0, 14, 8, 16);
    g.fillStyle = 'rgba(255,220,170,0.15)'; for (let y = 16; y < 30; y += 3) g.fillRect(2, y, 2, 1);
    return c;
  }
  wood(0, 0, 40, 6);
  wood(0, 12, 32, 12);
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(2, 14, 14, 1); g.fillRect(2, 23, 14, 1);
  const link = (x0: number, w: number) => {
    for (let y = 6; y < 12; y++) {
      const a = (y - 6) % 4 < 2;
      g.fillStyle = a ? '#3c4250' : '#6a7080';
      if (a) { g.fillRect(x0, y, 1, 1); g.fillRect(x0 + w - 1, y, 1, 1); } else g.fillRect(x0 + 1, y, 1, 1);
    }
  };
  link(0, 3); link(6, 3);
  for (let y = 6; y < 12; y++) {
    const t = (y - 6) / 5;
    g.fillStyle = (y % 2) ? '#3c4250' : '#6a7080';
    g.fillRect(19 - Math.round(t * 5), y, 1, 1);
    g.fillRect(20 + Math.round(t * 5), y, 1, 1);
  }
  return c;
}

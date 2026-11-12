import * as THREE from 'three';
import { cubesGeometry, type VCube } from './VanillaModels';
import { createEntityMaterial, type WorldUniforms } from './ChunkMaterial';
import { FACING_DIRS } from '../core/blocks';
import type { TextureAtlas } from '../resources/TextureAtlas';

type Kind = 'single' | 'left' | 'right';

interface ChestView {
  key: string; x: number; y: number; z: number; f: number; kind: Kind;
  obj: THREE.Group; lid: THREE.Group; mat: THREE.ShaderMaterial;
  open: number; target: number; light: number; lightT: number;
}

const ANGLE = [Math.PI, Math.PI / 2, 0, -Math.PI / 2];

const MODELS: Record<Kind, { bottom: VCube; lid: VCube; lock: VCube }> = {
  single: { bottom: { o: [1, 0, 1], s: [14, 10, 14], uv: [0, 19] }, lid: { o: [1, 0, 0], s: [14, 5, 14], uv: [0, 0] }, lock: { o: [7, -2, 14], s: [2, 4, 1], uv: [0, 0] } },
  right: { bottom: { o: [1, 0, 1], s: [15, 10, 14], uv: [0, 19] }, lid: { o: [1, 0, 0], s: [15, 5, 14], uv: [0, 0] }, lock: { o: [15, -2, 14], s: [1, 4, 1], uv: [0, 0] } },
  left: { bottom: { o: [0, 0, 1], s: [15, 10, 14], uv: [0, 19] }, lid: { o: [0, 0, 0], s: [15, 5, 14], uv: [0, 0] }, lock: { o: [0, -2, 14], s: [1, 4, 1], uv: [0, 0] } },
};

export class ChestRenderer {
  readonly group = new THREE.Group();
  private chunks = new Map<string, Set<string>>();
  private views = new Map<string, ChestView>();
  private openCount = new Map<string, number>();
  private geo = new Map<string, THREE.BufferGeometry>();
  private textures: Record<Kind, THREE.Texture>;
  private owned: THREE.Texture[] = [];

  getBlock: (x: number, y: number, z: number) => number = () => 0;

  constructor(private u: WorldUniforms, atlas: TextureAtlas, private probe: (x: number, y: number, z: number) => number) {
    this.textures = this.loadTextures(atlas);
  }

  private loadTextures(atlas: TextureAtlas): Record<Kind, THREE.Texture> {
    for (const t of this.owned) t.dispose();
    this.owned = [];
    const get = (k: string, variant: Kind) => {
      const t = atlas.entityTextures.get(k);
      if (t) return t;
      const c = defaultChestTexture(variant);
      const tex = new THREE.CanvasTexture(c);
      tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.flipY = false; tex.colorSpace = THREE.NoColorSpace;
      this.owned.push(tex);
      return tex;
    };
    return { single: get('chest', 'single'), left: get('chest_left', 'left'), right: get('chest_right', 'right') };
  }

  setAtlas(atlas: TextureAtlas): void {
    this.textures = this.loadTextures(atlas);
    for (const v of this.views.values()) { v.mat.uniforms.uMap.value = this.textures[v.kind]; }
  }

  private geometry(kind: Kind, part: 'base' | 'lid'): THREE.BufferGeometry {
    const k = `${kind}:${part}`;
    let g = this.geo.get(k);
    if (!g) {
      const m = MODELS[kind];
      g = part === 'base' ? cubesGeometry([m.bottom], 64, 64) : cubesGeometry([m.lid, m.lock], 64, 64);
      if (!g.getAttribute('color')) {
        const n = g.getAttribute('position').count;
        g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3));
      }
      this.geo.set(k, g);
    }
    return g;
  }

  setChunk(key: string, cx: number, cz: number, list: Int32Array | number[] | null | undefined): void {
    const next = new Set<string>();
    const found: { k: string; x: number; y: number; z: number; f: number }[] = [];
    if (list) for (let i = 0; i + 3 < list.length; i += 4) {
      const x = cx * 16 + list[i], y = list[i + 1], z = cz * 16 + list[i + 2], f = list[i + 3] & 3;
      const k = `${x},${y},${z}`;
      next.add(k);
      found.push({ k, x, y, z, f });
    }
    const prev = this.chunks.get(key);
    if (prev) for (const k of prev) if (!next.has(k)) this.removeView(k);
    this.chunks.set(key, next);
    for (const c of found) this.upsert(c.k, c.x, c.y, c.z, c.f);
    for (const c of found) for (const [dx, dz] of FACING_DIRS) this.refreshNeighbour(c.x + dx, c.y, c.z + dz);
  }

  remove(key: string): void {
    const s = this.chunks.get(key);
    if (!s) return;
    for (const k of s) this.removeView(k);
    this.chunks.delete(key);
  }

  private refreshNeighbour(x: number, y: number, z: number): void {
    const v = this.views.get(`${x},${y},${z}`);
    if (v) this.upsert(v.key, v.x, v.y, v.z, v.f);
  }

  private kindFor(x: number, y: number, z: number, f: number): Kind {
    const ax = f === 0 || f === 2 ? 1 : 0, az = 1 - ax;
    const same = (k: number) => { const w = this.getBlock(x + ax * k, y, z + az * k); return (w & 0xff) === 37 && ((w >>> 8) & 3) === f; };
    let back = 0;
    while (back < 32 && same(-(back + 1))) back++;
    let dx = 0, dz = 0;
    if (back % 2 === 0) { if (!same(1)) return 'single'; dx = ax; dz = az; } else { dx = -ax; dz = -az; }
    const a = ANGLE[f];
    const lx = Math.round(-Math.cos(a)), lz = Math.round(Math.sin(a));
    return dx === lx && dz === lz ? 'left' : 'right';
  }

  private upsert(key: string, x: number, y: number, z: number, f: number): void {
    const kind = this.kindFor(x, y, z, f);
    const old = this.views.get(key);
    if (old && old.kind === kind && old.f === f) return;
    if (old) this.removeView(key, true);
    const mat = createEntityMaterial(this.u, this.textures[kind]);
    const obj = new THREE.Group();
    const inner = new THREE.Group();
    inner.position.set(-0.5, -0.5, -0.5);
    inner.scale.setScalar(1 / 16);
    const base = new THREE.Mesh(this.geometry(kind, 'base'), mat);
    const lid = new THREE.Group();
    lid.position.set(0, 9, 1);
    lid.add(new THREE.Mesh(this.geometry(kind, 'lid'), mat));
    inner.add(base, lid);
    obj.add(inner);
    obj.position.set(x + 0.5, y + 0.5, z + 0.5);
    obj.rotation.y = ANGLE[f];
    obj.matrixAutoUpdate = false;
    obj.updateMatrix();
    for (const m of [base, ...lid.children]) { m.castShadow = true; m.layers.enable(1); }
    this.group.add(obj);
    const open = old?.open ?? 0;
    this.views.set(key, { key, x, y, z, f, kind, obj, lid, mat, open, target: (this.openCount.get(key) ?? 0) > 0 ? 1 : 0, light: old?.light ?? 1, lightT: 0 });
  }

  private removeView(key: string, keepCount = false): void {
    const v = this.views.get(key);
    if (!v) return;
    this.group.remove(v.obj);
    v.mat.dispose();
    this.views.delete(key);
    if (!keepCount) this.openCount.delete(key);
  }

  setOpen(x: number, y: number, z: number, n: number): void {
    const key = `${x},${y},${z}`;
    this.openCount.set(key, n);
    const v = this.views.get(key);
    if (v) v.target = n > 0 ? 1 : 0;
    for (const [dx, dz] of FACING_DIRS) {
      const p = this.views.get(`${x + dx},${y},${z + dz}`);
      if (p && v && p.kind !== 'single' && v.kind !== 'single' && p.f === v.f) { p.target = v.target; this.openCount.set(p.key, n); }
    }
  }

  update(dt: number, camX: number, camY: number, camZ: number, maxDist: number): void {
    const step = dt * 20 * 0.1;
    const md2 = maxDist * maxDist;
    for (const v of this.views.values()) {
      const dx = v.x - camX, dy = v.y - camY, dz = v.z - camZ;
      const vis = dx * dx + dy * dy + dz * dz < md2;
      v.obj.visible = vis;
      if (!vis) continue;
      if (v.open !== v.target) {
        v.open = v.target > v.open ? Math.min(v.target, v.open + step) : Math.max(v.target, v.open - step);
        const e = 1 - Math.pow(1 - v.open, 3);
        v.lid.rotation.x = -e * Math.PI / 2;
      }
      v.lightT -= dt;
      if (v.lightT <= 0) { v.lightT = 0.4 + Math.random() * 0.2; v.light = this.probe(v.x + 0.5, v.y + 0.6, v.z + 0.5); v.mat.uniforms.uLight.value = Math.max(0.12, v.light); }
    }
  }

  dispose(): void {
    for (const k of [...this.views.keys()]) this.removeView(k);
    for (const g of this.geo.values()) g.dispose();
    for (const t of this.owned) t.dispose();
  }
}

function defaultChestTexture(kind: Kind): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const w = kind === 'single' ? 14 : 15;
  const wood = (x: number, y: number, ww: number, hh: number, base: string) => {
    g.fillStyle = base; g.fillRect(x, y, ww, hh);
    for (let i = 0; i < ww * hh / 6; i++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(255,220,160,0.08)'; g.fillRect(x + Math.floor(Math.random() * ww), y + Math.floor(Math.random() * hh), 1 + Math.floor(Math.random() * 3), 1); }
    g.strokeStyle = '#3a2410'; g.lineWidth = 1; g.strokeRect(x + 0.5, y + 0.5, ww - 1, hh - 1);
  };
  wood(0, 0, w * 2 + 28, 19, '#a0692c');
  wood(0, 19, w * 2 + 28, 24, '#8e5b24');
  g.fillStyle = '#c8c8c8'; g.fillRect(0, 0, 6, 5);
  g.fillStyle = '#7a7a7a'; g.fillRect(1, 1, 2, 4);
  return c;
}

import * as THREE from 'three';
import type { ArenaKind } from '../../core/labs/minigames/arena';
import type { LodTileMesh } from './LodMesher';
import { BLOCKS } from '../../core/blocks';

interface Tile { key: string; x0: number; z0: number; size: number; mesh: THREE.Mesh | null; pending: boolean }

const ROOT = 4096;

const SURF = new Map<number, Map<string, { h: Uint8Array; id: Uint8Array }>>();
const SKIP_TOP = new Uint8Array(256);
for (const b of BLOCKS) if (b && (b.render === 'cross' || b.render === 'crop' || b.render === 'torch' || b.render === 'redstone' || b.render === 'none' || b.render === 'ladder')) SKIP_TOP[b.id] = 1;

export const LOD_SAMPLES: Record<'low' | 'medium' | 'high', number> = { low: 32, medium: 64, high: 64 };
export const LOD_SPLIT: Record<'low' | 'medium' | 'high', number> = { low: 1.3, medium: 2.2, high: 4 };

export class LodManager {
  readonly group = new THREE.Group();
  readonly material: THREE.ShaderMaterial;
  private tiles = new Map<string, Tile>();
  private wanted = new Set<string>();
  private workers: Worker[] = [];
  private busy: boolean[] = [];
  private queue: Tile[] = [];
  private jobs = new Map<number, Tile>();
  private nextId = 1;
  private lastX = Infinity;
  private lastZ = Infinity;
  private lastInner = -1;
  distance = 0;
  samples = 32;
  readonly mask: THREE.DataTexture;
  private maskData = new Uint8Array(1);

  constructor(seed: number, arena: ArenaKind | null, colors: Uint8Array, uniforms: { uDay: { value: number }; uFogColor: { value: THREE.Color }; uSkyColor: { value: THREE.Color } }) {
    this.surfaces = LodManager.pending(seed);
    this.seed = seed;
    this.mask = new THREE.DataTexture(this.maskData, 1, 1, THREE.RedFormat, THREE.UnsignedByteType);
    this.mask.magFilter = THREE.NearestFilter;
    this.mask.minFilter = THREE.NearestFilter;
    this.mask.needsUpdate = true;
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uDay: uniforms.uDay, uFogColor: uniforms.uFogColor, uSkyColor: uniforms.uSkyColor,
        uFogNear: { value: 1000 }, uFogFar: { value: 2000 },
        uMask: { value: this.mask }, uMaskOrigin: { value: new THREE.Vector2() }, uMaskSize: { value: 1 },
      },
      vertexShader: /* glsl */ `
        attribute vec4 aColor;
        varying vec4 vColor; varying vec3 vWorld; varying float vDist;
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          vWorld = w.xyz; vColor = aColor;
          vec4 mv = viewMatrix * w;
          vDist = length(mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uDay; uniform vec3 uFogColor; uniform vec3 uSkyColor; uniform float uFogNear; uniform float uFogFar;
        uniform sampler2D uMask; uniform vec2 uMaskOrigin; uniform float uMaskSize;
        varying vec4 vColor; varying vec3 vWorld; varying float vDist;
        void main() {
          vec2 c = floor(vWorld.xz / 16.0) - uMaskOrigin;
          if (c.x >= 0.0 && c.y >= 0.0 && c.x < uMaskSize && c.y < uMaskSize && texture2D(uMask, (c + 0.5) / uMaskSize).r > 0.5) discard;
          float light = mix(0.1, 1.0, uDay) * vColor.a;
          vec3 bp = vColor.a > 0.9 ? vec3(floor(vWorld.x), 0.0, floor(vWorld.z)) : vColor.a > 0.7 ? vec3(7.0, floor(vWorld.y), floor(vWorld.z)) : vec3(floor(vWorld.x), floor(vWorld.y), 13.0);
          vec3 sp = vColor.a > 0.9 ? vec3(floor(vWorld.x * 4.0), 0.0, floor(vWorld.z * 4.0)) : vColor.a > 0.7 ? vec3(7.0, floor(vWorld.y * 4.0), floor(vWorld.z * 4.0)) : vec3(floor(vWorld.x * 4.0), floor(vWorld.y * 4.0), 13.0);
          float nb = fract(sin(dot(bp, vec3(12.9898, 78.233, 37.719))) * 43758.5453) - 0.5;
          float ns = fract(sin(dot(sp, vec3(26.651, 41.117, 17.31))) * 24634.6345) - 0.5;
          float tex = 1.0 + nb * 0.11 * (1.0 - smoothstep(350.0, 900.0, vDist)) + ns * 0.12 * (1.0 - smoothstep(90.0, 260.0, vDist));
          if (vColor.a > 0.96 && vColor.a < 0.98) tex = 1.0 + nb * 0.03;
          vec3 col = vColor.rgb * tex * light * mix(vec3(0.75, 0.8, 1.0), vec3(1.0), uDay);
          float fog = smoothstep(uFogNear, uFogFar, vDist);
          gl_FragColor = vec4(mix(col, uFogColor, fog), 1.0);
        }`,
    });
    const hc = navigator.hardwareConcurrency ?? 4;
    const n = hc >= 8 ? 3 : hc > 4 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const w = new Worker(new URL('../../workers/LodWorker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e) => this.onWorker(i, e.data);
      w.onerror = (e) => console.error('lod worker error', e.message);
      w.postMessage({ t: 'init', seed, arena, colors });
      for (const [k, s] of this.surfaces) { const [cx, cz] = k.split(',').map(Number); w.postMessage({ t: 'surf', cx, cz, h: s.h, id: s.id }); }
      this.workers.push(w);
      this.busy.push(false);
    }
  }

  get minSize(): number { return 64; }
  split = 2.2;

  setColors(colors: Uint8Array): void {
    for (const w of this.workers) w.postMessage({ t: 'colors', colors });
    this.clear();
  }

  configure(distanceChunks: number, samples: number, split = 2.2): void {
    const d = distanceChunks * 16;
    if (d === this.distance && samples === this.samples && split === this.split) return;
    if (samples !== this.samples || split !== this.split) this.clear();
    this.split = split;
    this.distance = d;
    this.samples = samples;
    this.lastX = Infinity;
  }

  clear(): void {
    for (const t of this.tiles.values()) this.dropMesh(t);
    this.tiles.clear();
    this.queue.length = 0;
    this.jobs.clear();
    this.busy.fill(false);
    this.lastX = Infinity;
  }

  dispose(): void {
    this.clear();
    for (const w of this.workers) w.terminate();
    this.workers = [];
    this.material.dispose();
    this.mask.dispose();
  }

  setMask(data: Uint8Array, size: number, ox: number, oz: number): void {
    if (this.maskData.length !== data.length) {
      this.maskData = data.slice();
      this.mask.image = { data: this.maskData, width: size, height: size } as unknown as ImageData;
    } else this.maskData.set(data);
    this.mask.needsUpdate = true;
    this.material.uniforms.uMaskOrigin.value.set(ox, oz);
    this.material.uniforms.uMaskSize.value = size;
  }

  private surfaces: Map<string, { h: Uint8Array; id: Uint8Array }>;

  static pending(seed: number): Map<string, { h: Uint8Array; id: Uint8Array }> {
    let m = SURF.get(seed);
    if (!m) { SURF.clear(); m = new Map(); SURF.set(seed, m); }
    return m;
  }

  static record(seed: number, cx: number, cz: number, blocks: Uint16Array): { h: Uint8Array; id: Uint8Array } | null {
    const h = new Uint8Array(256), id = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      for (let y = 255; y >= 0; y--) {
        const b = blocks[(y * 16 + (i >> 4)) * 16 + (i & 15)] & 0xff;
        if (b && SKIP_TOP[b] !== 1) { h[i] = y; id[i] = b; break; }
      }
    }
    const k = `${cx},${cz}`;
    const map = LodManager.pending(seed);
    const prev = map.get(k);
    if (prev && prev.h.every((v, i) => v === h[i]) && prev.id.every((v, i) => v === id[i])) return null;
    const s = { h, id };
    map.set(k, s);
    return s;
  }

  private seed = 0;

  addSurface(cx: number, cz: number, blocks: Uint16Array): void {
    const s = LodManager.record(this.seed, cx, cz, blocks);
    if (!s) return;
    const { h, id } = s;
    for (const w of this.workers) w.postMessage({ t: 'surf', cx, cz, h, id });
    const x0 = cx * 16, z0 = cz * 16;
    for (const t of this.tiles.values()) {
      if (!t.mesh || this.queue.includes(t) || [...this.jobs.values()].includes(t)) continue;
      if (x0 < t.x0 + t.size && t.x0 < x0 + 16 && z0 < t.z0 + t.size && t.z0 < z0 + 16) { t.pending = true; this.queue.push(t); }
    }
  }

  get tileCount(): number { let n = 0; for (const t of this.tiles.values()) if (t.mesh) n++; return n; }
  get pendingCount(): number { return this.queue.length + this.jobs.size; }

  update(cx: number, cz: number, innerChunks: number): void {
    if (!this.distance) { if (this.tiles.size) this.clear(); return; }
    const u = this.material.uniforms;
    u.uFogFar.value = this.distance;
    u.uFogNear.value = this.distance * 0.72;
    const inner = Math.max(0, innerChunks - 1) * 16;
    const step = this.minSize / 2;
    if (Math.abs(cx - this.lastX) < step && Math.abs(cz - this.lastZ) < step && inner === this.lastInner) { this.dispatch(); return; }
    this.lastX = cx; this.lastZ = cz; this.lastInner = inner;
    const want = new Set<string>();
    const D = this.distance, MIN = this.minSize;
    const visit = (x0: number, z0: number, size: number) => {
      const dx = Math.max(x0 - cx, 0, cx - (x0 + size)), dz = Math.max(z0 - cz, 0, cz - (z0 + size));
      const d = Math.hypot(dx, dz);
      if (d > D) return;
      if (size > MIN && d < size * this.split) {
        const h = size / 2;
        visit(x0, z0, h); visit(x0 + h, z0, h); visit(x0, z0 + h, h); visit(x0 + h, z0 + h, h);
        return;
      }
      const fx = Math.max(Math.abs(x0 - cx), Math.abs(x0 + size - cx)), fz = Math.max(Math.abs(z0 - cz), Math.abs(z0 + size - cz));
      if (Math.hypot(fx, fz) < inner) return;
      want.add(`${x0},${z0},${size}`);
    };
    for (let rz = Math.floor((cz - D) / ROOT); rz <= Math.floor((cz + D) / ROOT); rz++) {
      for (let rx = Math.floor((cx - D) / ROOT); rx <= Math.floor((cx + D) / ROOT); rx++) visit(rx * ROOT, rz * ROOT, ROOT);
    }
    this.wanted = want;
    for (const key of want) {
      if (this.tiles.has(key)) continue;
      const [x0, z0, size] = key.split(',').map(Number);
      const t: Tile = { key, x0, z0, size, mesh: null, pending: true };
      this.tiles.set(key, t);
      this.queue.push(t);
    }
    this.queue = this.queue.filter((t) => want.has(t.key));
    for (const t of [...this.tiles.values()]) if (!want.has(t.key) && t.pending && !t.mesh && ![...this.jobs.values()].includes(t)) this.tiles.delete(t.key);
    const dist = (t: Tile) => Math.hypot(t.x0 + t.size / 2 - cx, t.z0 + t.size / 2 - cz);
    this.queue.sort((a, b) => dist(a) - dist(b));
    this.prune();
    this.dispatch();
  }

  private overlaps(a: Tile, b: Tile): boolean {
    return a.x0 < b.x0 + b.size && b.x0 < a.x0 + a.size && a.z0 < b.z0 + b.size && b.z0 < a.z0 + a.size;
  }

  private prune(): void {
    const notReady = [...this.wanted].map((k) => this.tiles.get(k)).filter((t): t is Tile => !!t && !t.mesh);
    for (const t of [...this.tiles.values()]) {
      if (this.wanted.has(t.key) || !t.mesh) continue;
      if (notReady.some((w) => this.overlaps(w, t))) continue;
      this.dropMesh(t);
      this.tiles.delete(t.key);
    }
  }

  private dropMesh(t: Tile): void {
    if (!t.mesh) return;
    this.group.remove(t.mesh);
    t.mesh.geometry.dispose();
    t.mesh = null;
  }

  private dispatch(): void {
    for (let i = 0; i < this.workers.length && this.queue.length; i++) {
      if (this.busy[i]) continue;
      const t = this.queue.shift()!;
      const id = this.nextId++;
      this.jobs.set(id, t);
      this.busy[i] = true;
      this.workers[i].postMessage({ t: 'tile', id, x0: t.x0, z0: t.z0, size: t.size, n: t.size >= 512 ? Math.max(16, this.samples / 4) : t.size >= 256 ? Math.max(16, this.samples / 2) : this.samples });
    }
  }

  private onWorker(i: number, m: { t: string; id: number; mesh?: LodTileMesh; message?: string }): void {
    this.busy[i] = false;
    const t = this.jobs.get(m.id);
    this.jobs.delete(m.id);
    if (m.t === 'error') console.error('lod tile failed', m.message);
    if (t && m.mesh && this.tiles.get(t.key) === t && this.wanted.has(t.key)) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(m.mesh.pos, 3));
      g.setAttribute('aColor', new THREE.BufferAttribute(m.mesh.col, 4, true));
      g.setIndex(new THREE.BufferAttribute(m.mesh.idx, 1));
      g.boundingBox = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(t.size, 256, t.size));
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(t.size / 2, 96, t.size / 2), Math.hypot(t.size / 2, t.size / 2, 128));
      this.dropMesh(t);
      const mesh = new THREE.Mesh(g, this.material);
      mesh.position.set(t.x0, 0, t.z0);
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      t.mesh = mesh;
      t.pending = false;
      this.group.add(mesh);
      this.prune();
    } else if (t && this.tiles.get(t.key) === t && !this.wanted.has(t.key)) this.tiles.delete(t.key);
    this.dispatch();
  }
}

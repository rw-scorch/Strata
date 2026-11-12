import { CHUNK_SIZE, WORLD_HEIGHT } from '../constants';
import { LIGHT_EMIT, LIGHT_FILTER, OPAQUE } from '../blocks';

export interface LightWorld {
  getBlock(x: number, y: number, z: number): number;
  isLoaded(x: number, z: number): boolean;
  raw?(cx: number, cz: number): Uint16Array | null;
}

const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const;

export const chunkNum = (cx: number, cz: number): number => (cx + 32768) * 65536 + (cz + 32768);

export class ChunkInfo {
  private heights = new Map<number, Int16Array>();
  private emitters = new Map<number, Int32Array>();
  private masks = new Map<number, number>();
  budget = 0;
  builds = 0;

  constructor(private w: LightWorld, private tickable: (id: number) => boolean) {}

  private static key(cx: number, cz: number): number { return chunkNum(cx, cz); }

  private canBuild(cx: number, cz: number): boolean {
    if (!this.w.isLoaded(cx * CHUNK_SIZE, cz * CHUNK_SIZE)) return false;
    if (this.builds <= 0) return false;
    this.builds--;
    return true;
  }

  tickMask(cx: number, cz: number): number {
    const k = ChunkInfo.key(cx, cz);
    const m = this.masks.get(k);
    if (m !== undefined) return m;
    if (!this.canBuild(cx, cz)) return 0;
    let mask = 0;
    const bx = cx * CHUNK_SIZE, bz = cz * CHUNK_SIZE;
    const raw = this.w.raw?.(cx, cz);
    if (raw) {
      for (let i = 0; i < raw.length; i++) if (this.tickable(raw[i] & 0xff)) mask |= 1 << (i >> 12);
      this.masks.set(k, mask);
      return mask;
    }
    for (let s = 0; s * 16 < WORLD_HEIGHT; s++) {
      let hit = false;
      for (let y = s * 16; y < Math.min(WORLD_HEIGHT, s * 16 + 16) && !hit; y++) for (let lz = 0; lz < 16 && !hit; lz++) for (let lx = 0; lx < 16; lx++) {
        if (this.tickable(this.w.getBlock(bx + lx, y, bz + lz) & 0xff)) { hit = true; break; }
      }
      if (hit) mask |= 1 << s;
    }
    this.masks.set(k, mask);
    return mask;
  }

  heightMap(cx: number, cz: number): Int16Array | null {
    const k = ChunkInfo.key(cx, cz);
    let h = this.heights.get(k);
    if (h) return h;
    if (!this.w.isLoaded(cx * CHUNK_SIZE, cz * CHUNK_SIZE)) return null;
    h = new Int16Array(CHUNK_SIZE * CHUNK_SIZE);
    const raw = this.w.raw?.(cx, cz);
    for (let lz = 0; lz < CHUNK_SIZE; lz++) for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      if (raw) {
        let y = WORLD_HEIGHT - 1;
        while (y >= 0 && LIGHT_FILTER[raw[(y * CHUNK_SIZE + lz) * CHUNK_SIZE + lx] & 0xff] === 0) y--;
        h[lz * CHUNK_SIZE + lx] = y;
      } else h[lz * CHUNK_SIZE + lx] = this.scanColumn(cx * CHUNK_SIZE + lx, WORLD_HEIGHT - 1, cz * CHUNK_SIZE + lz);
    }
    this.heights.set(k, h);
    this.gens.set(k, (this.gens.get(k) ?? 0) + 1);
    return h;
  }

  private scanColumn(x: number, from: number, z: number): number {
    for (let y = from; y >= 0; y--) if (LIGHT_FILTER[this.w.getBlock(x, y, z) & 0xff] > 0) return y;
    return -1;
  }

  top(x: number, z: number): number {
    const h = this.heightMap(x >> 4, z >> 4);
    return h ? h[(z & 15) * CHUNK_SIZE + (x & 15)] : -1;
  }

  exposed(x: number, y: number, z: number): boolean { return y > this.top(x, z); }

  private emitterList(cx: number, cz: number): Int32Array | null {
    const k = ChunkInfo.key(cx, cz);
    let e = this.emitters.get(k);
    if (e) return e;
    if (!this.canBuild(cx, cz)) return null;
    const out: number[] = [];
    const bx = cx * CHUNK_SIZE, bz = cz * CHUNK_SIZE;
    const raw = this.w.raw?.(cx, cz);
    if (raw) {
      for (let i = 0; i < raw.length; i++) {
        const em = LIGHT_EMIT[raw[i] & 0xff];
        if (em > 1) out.push(bx + (i & 15), i >> 8, bz + ((i >> 4) & 15), em);
      }
    } else for (let y = 0; y < WORLD_HEIGHT; y++) for (let lz = 0; lz < CHUNK_SIZE; lz++) for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const em = LIGHT_EMIT[this.w.getBlock(bx + lx, y, bz + lz) & 0xff];
      if (em > 1) out.push(bx + lx, y, bz + lz, em);
    }
    e = Int32Array.from(out);
    this.emitters.set(k, e);
    this.gens.set(k, (this.gens.get(k) ?? 0) + 1);
    return e;
  }

  changed(x: number, y: number, z: number, oldV: number, newV: number): void {
    const cx = x >> 4, cz = z >> 4, k = ChunkInfo.key(cx, cz);
    if ((LIGHT_FILTER[oldV & 0xff] > 0) !== (LIGHT_FILTER[newV & 0xff] > 0) || OPAQUE[oldV & 0xff] !== OPAQUE[newV & 0xff] || LIGHT_EMIT[oldV & 0xff] !== LIGHT_EMIT[newV & 0xff]) {
      this.gens.set(k, (this.gens.get(k) ?? 0) + 1);
    }
    const h = this.heights.get(k);
    if (h) {
      const i = (z & 15) * CHUNK_SIZE + (x & 15);
      if (LIGHT_FILTER[newV & 0xff] > 0) { if (y > h[i]) h[i] = y; }
      else if (y === h[i]) h[i] = this.scanColumn(x, y - 1, z);
    }
    if (LIGHT_EMIT[oldV & 0xff] > 1 || LIGHT_EMIT[newV & 0xff] > 1) this.emitters.delete(k);
    const m = this.masks.get(k);
    if (m !== undefined && this.tickable(newV & 0xff)) this.masks.set(k, m | (1 << (y >> 4)));
  }

  forget(cx: number, cz: number): void {
    const k = ChunkInfo.key(cx, cz);
    this.gens.set(k, (this.gens.get(k) ?? 0) + 1);
    this.heights.delete(k); this.emitters.delete(k); this.masks.delete(k);
  }

  prune(): void {
    const keys = new Set<number>([...this.heights.keys(), ...this.emitters.keys(), ...this.masks.keys()]);
    for (const k of keys) {
      const cx = Math.floor(k / 65536) - 32768, cz = (k % 65536) - 32768;
      if (!this.w.isLoaded(cx * CHUNK_SIZE, cz * CHUNK_SIZE)) this.forget(cx, cz);
    }
  }

  private open(x: number, y: number, z: number): boolean {
    if (y < 0) return false;
    if (y >= WORLD_HEIGHT) return true;
    return OPAQUE[this.w.getBlock(x, y, z) & 0xff] === 0;
  }

  private gens = new Map<number, number>();
  private cache = new Map<number, number>();

  private genSum(cx: number, cz: number): number {
    let g = 0;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) g += this.gens.get(ChunkInfo.key(cx + dx, cz + dz)) ?? 0;
    return g;
  }

  private cached(kind: number, x: number, y: number, z: number, compute: () => number): number {
    const key = (((x + 1048576) * 2097152 + (z + 1048576)) * 256 + (y & 255)) * 2 + kind;
    const g = this.genSum(x >> 4, z >> 4);
    const hit = this.cache.get(key);
    if (hit !== undefined && Math.floor(hit / 16) === g) return hit & 15;
    const before = this.budget;
    const v = compute();
    if (this.budget >= 0 || before < 0) {
      if (this.cache.size > 250000) this.cache.clear();
      this.cache.set(key, g * 16 + v);
    }
    return v;
  }

  blockLight(x: number, y: number, z: number): number {
    return this.cached(0, x, y, z, () => this.computeBlock(x, y, z));
  }

  skyLight(x: number, y: number, z: number, _need = 0): number {
    if (this.exposed(x, y, z)) return 15;
    return this.cached(1, x, y, z, () => this.computeSky(x, y, z));
  }

  private computeBlock(x: number, y: number, z: number): number {
    const cx = x >> 4, cz = z >> 4;
    const near: number[] = [];
    let reach = 0;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const list = this.emitterList(cx + dx, cz + dz);
      if (!list) { if (this.w.isLoaded((cx + dx) * CHUNK_SIZE, (cz + dz) * CHUNK_SIZE)) return 15; continue; }
      for (let i = 0; i < list.length; i += 4) {
        const d = Math.abs(list[i] - x) + Math.abs(list[i + 1] - y) + Math.abs(list[i + 2] - z);
        const lv = list[i + 3] - d;
        if (lv > 0) { near.push(list[i], list[i + 1], list[i + 2], list[i + 3]); reach = Math.max(reach, list[i + 3] - 1); }
      }
    }
    if (!near.length) return 0;
    const at = (x: number, y: number, z: number) => {
      let best = 0;
      for (let i = 0; i < near.length; i += 4) if (near[i] === x && near[i + 1] === y && near[i + 2] === z) best = Math.max(best, near[i + 3]);
      return best;
    };
    let best = 0;
    const seen = new Set<number>();
    const k = (a: number, b: number, c: number) => ((a - x + 32) * 64 + (c - z + 32)) * 512 + (b + 64);
    let frontier: number[] = [x, y, z];
    seen.add(k(x, y, z));
    const here = at(x, y, z);
    if (here) best = here;
    for (let d = 1; d <= reach && frontier.length && best < 15 - d + 1; d++) {
      const next: number[] = [];
      for (let i = 0; i < frontier.length; i += 3) {
        const fx = frontier[i], fy = frontier[i + 1], fz = frontier[i + 2];
        for (const [ax, ay, az] of DIRS) {
          const nx = fx + ax, ny = fy + ay, nz = fz + az;
          const key = k(nx, ny, nz);
          if (seen.has(key)) continue;
          seen.add(key);
          const em = at(nx, ny, nz);
          if (em) best = Math.max(best, em - d);
          if (this.open(nx, ny, nz)) next.push(nx, ny, nz);
        }
      }
      this.budget -= next.length / 3;
      if (this.budget < 0) return best || 1;
      frontier = next;
    }
    return best;
  }

  private computeSky(x: number, y: number, z: number): number {
    const maxD = 14;
    const seen = new Set<number>();
    const k = (a: number, b: number, c: number) => ((a - x + 32) * 64 + (c - z + 32)) * 512 + (b + 64);
    let frontier: number[] = [x, y, z];
    seen.add(k(x, y, z));
    for (let d = 1; d <= maxD && frontier.length; d++) {
      const next: number[] = [];
      for (let i = 0; i < frontier.length; i += 3) {
        const fx = frontier[i], fy = frontier[i + 1], fz = frontier[i + 2];
        for (const [ax, ay, az] of DIRS) {
          const nx = fx + ax, ny = fy + ay, nz = fz + az;
          const key = k(nx, ny, nz);
          if (seen.has(key) || !this.open(nx, ny, nz)) continue;
          seen.add(key);
          if (this.exposed(nx, ny, nz)) return 15 - d;
          next.push(nx, ny, nz);
        }
      }
      this.budget -= next.length / 3;
      if (this.budget < 0) return 15 - d;
      frontier = next;
    }
    return 0;
  }
}

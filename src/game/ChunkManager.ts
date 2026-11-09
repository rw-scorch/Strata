import type { ArenaKind } from '../core/minigames/arena';
import { CHUNK_SIZE, WORLD_HEIGHT } from '../core/constants';
import { ChunkData, chunkKey } from '../core/chunk';
import { OPAQUE, LIGHT_EMIT, blockId } from '../core/blocks';
import type { WorldStore } from '../core/sim/WorldSim';
import type { GenBlockEntity } from '../core/worldgen/WorldGenerator';
import type { MeshResult } from '../rendering/Mesher';
import type { AtlasData } from '../resources/TextureAtlas';

export interface ChunkSourceHooks {
  loadStored(cx: number, cz: number): Promise<Uint16Array | null> | null;
  requestRemote?(cx: number, cz: number): void;
  onGenerated?(cx: number, cz: number, entities: GenBlockEntity[]): void;
  onMesh(key: string, cx: number, cz: number, r: MeshResult): void;
  onUnload(key: string): void;
  saveChunk?(cx: number, cz: number, data: Uint16Array): void;
}

interface CChunk {
  cx: number; cz: number; key: string; nkey: number;
  data: ChunkData | null;
  gen: Uint16Array | null;
  genRequested: boolean;
  remote: 'none' | 'waiting' | 'done';
  remoteData: Uint16Array | null;
  pending: number[][];
  meshQueued: boolean;
  meshing: boolean;
  dirty: boolean;
  urgent: boolean;
  lazyAt: number;
  saveDirty: boolean;
  meshed: boolean;
  fresh: boolean;
}

type Job = { kind: 'gen' | 'mesh'; c: CChunk; pri: number };

function nk(cx: number, cz: number): number { return (cx + 32768) * 65536 + (cz + 32768); }

export class ChunkManager implements WorldStore {
  private chunks = new Map<number, CChunk>();
  private workers: Worker[] = [];
  private busy: boolean[] = [];
  private jobs = new Map<number, Job>();
  private queue: Job[] = [];
  private nextJob = 1;
  private hooks: ChunkSourceHooks;
  private lastC: CChunk | null = null;
  private topCache = new Map<number, number>();
  remote: boolean;
  renderDistance = 6;
  smooth = true;
  centerX = 0;
  centerZ = 0;
  meshTimes: number[] = [];
  private seed: number;

  constructor(seed: number, arena: ArenaKind | null, atlas: AtlasData, hooks: ChunkSourceHooks, remote: boolean) {
    this.seed = seed;
    this.hooks = hooks;
    this.remote = remote;
    const n = Math.max(1, Math.min(4, (navigator.hardwareConcurrency ?? 4) - 1));
    for (let i = 0; i < n; i++) {
      const w = new Worker(new URL('../workers/ChunkWorker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e) => this.onWorker(i, e.data);
      w.onerror = (e) => console.error('chunk worker error', e.message);
      w.postMessage({ t: 'init', seed, arena, atlas });
      this.workers.push(w);
      this.busy.push(false);
    }
  }

  setAtlas(atlas: AtlasData): void {
    for (const w of this.workers) w.postMessage({ t: 'atlas', atlas });
    for (const c of this.chunks.values()) if (c.data) { c.dirty = true; c.meshed = false; }
  }

  dispose(): void {
    for (const w of this.workers) w.terminate();
    this.workers = [];
    this.chunks.clear();
  }

  private get_(cx: number, cz: number): CChunk | undefined {
    const l = this.lastC;
    if (l && l.cx === cx && l.cz === cz) return l;
    const c = this.chunks.get(nk(cx, cz));
    if (c) this.lastC = c;
    return c;
  }

  getBlock(x: number, y: number, z: number): number {
    if (y < 0 || y >= WORLD_HEIGHT) return 0;
    const c = this.get_(x >> 4, z >> 4);
    if (!c || !c.data) return 0;
    return c.data.blocks[(y * 16 + (z & 15)) * 16 + (x & 15)];
  }

  isLoaded(x: number, z: number): boolean {
    const c = this.get_(x >> 4, z >> 4);
    return !!c && !!c.data;
  }

  chunkReady(cx: number, cz: number): boolean { const c = this.get_(cx, cz); return !!c?.data; }
  chunkMeshed(cx: number, cz: number): boolean { const c = this.get_(cx, cz); return !!c?.meshed; }

  setBlock(x: number, y: number, z: number, v: number): void {
    if (y < 0 || y >= WORLD_HEIGHT) return;
    const cx = x >> 4, cz = z >> 4;
    const c = this.get_(cx, cz);
    if (!c || !c.data) return;
    const lx = x & 15, lz = z & 15;
    const old = c.data.get(lx, y, lz);
    if (old === v) return;
    c.data.set(lx, y, lz, v);
    c.data.modified = true;
    c.saveDirty = true;
    this.topCache.delete(x * 100003 + z);
    this.markDirty(c, true);
    const lightChange = OPAQUE[blockId(old)] !== OPAQUE[blockId(v)] || LIGHT_EMIT[blockId(old)] !== LIGHT_EMIT[blockId(v)];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const n = this.get_(cx + dx, cz + dz);
      if (!n || !n.data) continue;
      const border = (dx === -1 && lx === 0) || (dx === 1 && lx === 15) || (dz === -1 && lz === 0) || (dz === 1 && lz === 15);
      const nearX = dx === 0 || (dx === -1 ? lx < 15 : lx > 0);
      const nearZ = dz === 0 || (dz === -1 ? lz < 15 : lz > 0);
      if (border && (dx === 0 || dz === 0)) this.markDirty(n, true);
      else if (lightChange && nearX && nearZ) { n.dirty = true; n.lazyAt = performance.now() + 250; }
    }
  }

  applyRemote(x: number, y: number, z: number, v: number): void {
    const c = this.get_(x >> 4, z >> 4);
    if (!c) return;
    if (!c.data) { if (c.remote === 'done') c.pending.push([x, y, z, v]); return; }
    this.setBlock(x, y, z, v);
  }

  private markDirty(c: CChunk, urgent: boolean): void {
    c.dirty = true;
    if (urgent) { c.urgent = true; c.lazyAt = 0; }
  }

  receiveRemote(cx: number, cz: number, data: Uint16Array | null): void {
    const c = this.get_(cx, cz);
    if (!c || c.remote === 'done') return;
    c.remote = 'done';
    c.remoteData = data;
    this.tryFinalize(c);
  }

  private tryFinalize(c: CChunk): void {
    if (c.data) return;
    let blocks: Uint16Array | null = null;
    let fresh = false;
    if (this.remote) {
      if (c.remote !== 'done') return;
      if (c.remoteData) blocks = c.remoteData;
      else if (c.gen) { blocks = c.gen; fresh = true; }
      else return;
    } else {
      if (!c.gen) return;
      blocks = c.gen;
      fresh = c.fresh;
    }
    c.data = new ChunkData(c.cx, c.cz, blocks);
    c.data.modified = !fresh;
    c.gen = null;
    c.remoteData = null;
    for (const [x, y, z, v] of c.pending) c.data.set(x & 15, y, z & 15, v);
    c.pending = [];
    c.dirty = true;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const n = this.get_(c.cx + dx, c.cz + dz);
      if (n && n.data && (dx || dz)) n.dirty = true;
    }
  }

  update(px: number, pz: number): void {
    this.centerX = px; this.centerZ = pz;
    const pcx = Math.floor(px / CHUNK_SIZE), pcz = Math.floor(pz / CHUNK_SIZE);
    const rd = this.renderDistance;
    const load = rd + 1;
    const wantRemote: number[][] = [];
    for (let r = 0; r <= load; r++) {
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        if (dx * dx + dz * dz > (load + 0.5) ** 2) continue;
        const cx = pcx + dx, cz = pcz + dz;
        const key = nk(cx, cz);
        if (this.chunks.has(key)) continue;
        const c: CChunk = {
          cx, cz, key: chunkKey(cx, cz), nkey: key, data: null, gen: null, genRequested: false, remote: this.remote ? 'waiting' : 'none',
          remoteData: null, pending: [], meshQueued: false, meshing: false, dirty: false, urgent: false, lazyAt: 0, saveDirty: false, meshed: false, fresh: true,
        };
        this.chunks.set(key, c);
        if (this.remote) { wantRemote.push([cx, cz]); this.requestGen(c, r); }
        else {
          const stored = this.hooks.loadStored(cx, cz);
          if (stored) {
            c.fresh = false;
            stored.then((d) => {
              if (!this.chunks.has(key)) return;
              if (d) { c.gen = d; c.fresh = false; this.tryFinalize(c); }
              else { c.fresh = true; this.requestGen(c, r); }
            }).catch(() => { c.fresh = true; this.requestGen(c, r); });
          } else this.requestGen(c, r);
        }
      }
    }
    if (wantRemote.length && this.hooks.requestRemote) for (const [cx, cz] of wantRemote) this.hooks.requestRemote(cx, cz);
    const unload = rd + 2.5;
    for (const c of [...this.chunks.values()]) {
      const dx = c.cx - pcx, dz = c.cz - pcz;
      if (dx * dx + dz * dz > unload * unload) this.unload(c);
    }
    const now = performance.now();
    for (const c of this.chunks.values()) {
      if (!c.data || !c.dirty || c.meshQueued || c.meshing) continue;
      if (c.lazyAt && now < c.lazyAt) continue;
      const dx = c.cx - pcx, dz = c.cz - pcz;
      if (dx * dx + dz * dz > (rd + 0.5) ** 2) continue;
      let ok = true;
      for (let oz = -1; oz <= 1 && ok; oz++) for (let ox = -1; ox <= 1; ox++) if (!this.get_(c.cx + ox, c.cz + oz)?.data) { ok = false; break; }
      if (!ok) continue;
      c.dirty = false;
      c.meshQueued = true;
      const pri = c.urgent ? -1000 : dx * dx + dz * dz;
      c.urgent = false;
      this.enqueue({ kind: 'mesh', c, pri });
    }
    this.dispatch();
  }

  private requestGen(c: CChunk, dist: number): void {
    if (c.genRequested) return;
    c.genRequested = true;
    this.enqueue({ kind: 'gen', c, pri: dist * dist - 0.5 });
  }

  private enqueue(j: Job): void {
    this.queue.push(j);
  }

  private dispatch(): void {
    if (!this.queue.length) return;
    this.queue.sort((a, b) => a.pri - b.pri);
    for (let i = 0; i < this.workers.length && this.queue.length; i++) {
      if (this.busy[i]) continue;
      let job: Job | undefined;
      while (this.queue.length) {
        job = this.queue.shift();
        if (job && this.chunks.get(job.c.nkey) === job.c) break;
        job = undefined;
      }
      if (!job) break;
      const id = this.nextJob++;
      this.jobs.set(id, job);
      this.busy[i] = true;
      if (job.kind === 'gen') this.workers[i].postMessage({ t: 'gen', id, cx: job.c.cx, cz: job.c.cz });
      else {
        job.c.meshQueued = false;
        job.c.meshing = true;
        const arr: (Uint16Array | null)[] = [];
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
          const n = this.get_(job.c.cx + dx, job.c.cz + dz);
          arr.push(n?.data ? n.data.blocks.slice() : null);
        }
        this.workers[i].postMessage({ t: 'mesh', id, cx: job.c.cx, cz: job.c.cz, chunks: arr, smooth: this.smooth }, arr.filter(Boolean).map((a) => a!.buffer));
      }
    }
  }

  private onWorker(i: number, m: { t: string; id: number; cx: number; cz: number; blocks?: Uint16Array; entities?: GenBlockEntity[]; result?: MeshResult; ms?: number; message?: string }): void {
    this.busy[i] = false;
    const job = this.jobs.get(m.id);
    this.jobs.delete(m.id);
    if (m.t === 'error') { console.error('worker job failed', m.message); if (job?.kind === 'mesh') { job.c.meshing = false; job.c.dirty = true; } this.dispatch(); return; }
    if (!job) { this.dispatch(); return; }
    const c = job.c;
    const alive = this.chunks.get(c.nkey) === c;
    if (m.t === 'gen' && alive) {
      c.gen = m.blocks!;
      if (!this.remote && c.fresh && m.entities?.length) this.hooks.onGenerated?.(c.cx, c.cz, m.entities);
      this.tryFinalize(c);
    } else if (m.t === 'mesh') {
      c.meshing = false;
      if (alive) {
        this.hooks.onMesh(c.key, c.cx, c.cz, m.result!);
        c.meshed = true;
        if (m.ms) { this.meshTimes.push(m.ms); if (this.meshTimes.length > 30) this.meshTimes.shift(); }
      }
    }
    this.dispatch();
  }

  private unload(c: CChunk): void {
    if (c.saveDirty && c.data) { this.hooks.saveChunk?.(c.cx, c.cz, c.data.blocks); c.saveDirty = false; }
    this.chunks.delete(c.nkey);
    if (this.lastC === c) this.lastC = null;
    this.hooks.onUnload(c.key);
  }

  collectDirtySaves(): { cx: number; cz: number; data: Uint16Array }[] {
    const out: { cx: number; cz: number; data: Uint16Array }[] = [];
    for (const c of this.chunks.values()) if (c.saveDirty && c.data) { out.push({ cx: c.cx, cz: c.cz, data: c.data.blocks.slice() }); c.saveDirty = false; }
    return out;
  }

  topAt(x: number, z: number): number {
    const k = x * 100003 + z;
    const hit = this.topCache.get(k);
    if (hit !== undefined) return hit;
    const c = this.get_(x >> 4, z >> 4);
    if (!c || !c.data) return 0;
    let y = WORLD_HEIGHT - 1;
    const b = c.data.blocks, lx = x & 15, lz = z & 15;
    while (y > 0 && b[(y * 16 + lz) * 16 + lx] === 0) y--;
    const top = y + 1;
    if (this.topCache.size > 20000) this.topCache.clear();
    this.topCache.set(k, top);
    return top;
  }

  lightProbe(x: number, y: number, z: number, day: number): number {
    const fx = Math.floor(x), fy = Math.floor(y), fz = Math.floor(z);
    const exposed = fy >= this.topAt(fx, fz) - 1;
    let torch = 0;
    for (let dy = -3; dy <= 3; dy++) for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
      const e = LIGHT_EMIT[blockId(this.getBlock(fx + dx, fy + dy, fz + dz))];
      if (e) torch = Math.max(torch, (e - Math.abs(dx) - Math.abs(dy) - Math.abs(dz)) / 15);
    }
    const sky = exposed ? day : day * 0.2;
    return Math.max(0.08, sky, torch * 0.95);
  }

  get loadedCount(): number { let n = 0; for (const c of this.chunks.values()) if (c.data) n++; return n; }
  get pendingJobs(): number { return this.queue.length + this.jobs.size; }
  get seedValue(): number { return this.seed; }
}

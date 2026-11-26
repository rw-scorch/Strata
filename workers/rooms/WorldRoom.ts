import type { BlockArray } from '../../src/core/chunk';
import { decodeBlueprint, BP_PART, BP_MAX_PARTS } from '../../src/core/blueprint';
import { cleanKey, keyHint } from '../adminKey';
import { DurableObject } from 'cloudflare:workers';
import { parseBanSpan } from '../../src/core/bans';
import { CHUNK_SIZE, PROTOCOL_VERSION, GAME_VERSION, MIN_PROTOCOL_VERSION, DEFAULT_MAX_PLAYERS, MAX_PLAYERS_LIMIT, DIFFICULTIES, Difficulty, GameMode } from '../../src/core/constants';
import { ChunkData, chunkKey, encodeRLE, decodeRLE, u16ToBase64 } from '../../src/core/chunk';
import { WorldGenerator, type GeneratedChunk } from '../../src/core/worldgen/WorldGenerator';
import { GenRegistry, GEN_LEVEL, LEGACY_LEVEL } from '../../src/core/worldgen/genLevel';
import { sanitizeWard } from '../../src/core/sim/anticheat';
import { WorldSim, SimPlayer, SimEvent, WorldStore, newPlayer, posKey, Entity, BlockEntity, RuleSet, ruleSnapshot, entTypeCode, entExtra, EndState, freshEndState } from '../../src/core/sim/WorldSim';
import { MOBS, MobType } from '../../src/core/sim/mobs';
import { Minigame } from '../../src/core/labs/minigames/Minigame';
import { isArenaKind } from '../../src/core/labs/minigames/arena';
import { B, blockId } from '../../src/core/blocks';
import { sanitizeInv, validateOp, invHash, validStack, cloneStack, equipmentOf } from '../../src/core/inventory';
import { cleanPackList } from '../../src/core/datapack';
import { Economy } from './Economy';
import { ORE_REVEAL_RADIUS, maskChunk, exposedOres, revealAround, publicValue } from '../../src/core/antixray';
import {
  C2S, S2C, RoomMeta, RoomInfo, PublicPlayer, RoomSettings, PackRef, ENT_KIND, q2, isNum, isInt, cleanName, cleanText, cleanAppearance,
} from '../../src/core/protocol';

const SUPPORTER_GOLD = '#ffcc33';

export interface Env {
  WORLD_ROOMS: DurableObjectNamespace<WorldRoom>;
  ASSETS: Fetcher;
  ADMIN_KEY?: string;
  ACCOUNTS?: DurableObjectNamespace;
  REGISTRY?: DurableObjectNamespace;
  TURN_KEY_ID?: string;
  TURN_KEY_API_TOKEN?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_ID?: string;
  SUPPORTER_CURRENCY?: string;
  SUPPORTER_AMOUNT?: string;
}

interface StoredMeta extends RoomMeta { end?: EndState; peak?: number; genBase?: number; pvpV6?: boolean; capV10?: boolean; rules?: RuleSet; ops?: { id: string; hash: string }[]; ownerHash: string; time: number; weather: string; dayCycle: boolean; muted: string[]; bans: Record<string, number>; banInfo?: Record<string, BanInfo>; }

interface Session {
  ws: WebSocket;
  pid: string | null;
  name: string;
  op: boolean;
  joinedAt: number;
  bucket: number;
  bucketT: number;
  chatT: number;
  chatBurst: number;
  lastChat: string;
  strikes: number;
  lastSeen: number;
  sentEnts: Map<number, string>;
  sentPlayers: Map<string, string>;
  chunkCX: number;
  chunkCZ: number;
  hash?: string;
  adminTries?: number;
  adminT?: number;
  rtcN?: number;
  rtcT?: number;
  dpT?: number;
  oreSent?: Set<string>;
  oreQueue?: string[];
  chunkReq?: string[];
  bpParts?: string[];
  queuedAt?: number;
  invAck?: number;
  shareAll?: boolean;
  shareTo?: Set<string>;
  hadShares?: boolean;
}

interface Attachment { pid: string | null; name: string; op: boolean; }

const TICK_MS = 50;
const SIM_RADIUS = 4;
const CHUNK_BUDGET = 700;
const BLOCK_BROADCAST = 16 * 16;
const ENTITY_RANGE = 96;
const MAX_CACHE = 450;

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a: string, b: string): boolean {
  let d = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0;
}

function cleanSkin(v: unknown): { png: string; slim: boolean } | null {
  const o = v as { png?: unknown; slim?: unknown } | null;
  if (!o || typeof o.png !== 'string' || o.png.length > 12000 || !o.png.startsWith('data:image/png;base64,') || !/^[A-Za-z0-9+/=]+$/.test(o.png.slice(22))) return null;
  return { png: o.png, slim: o.slim === true };
}

function defaultSettings(): RoomSettings { return { pvp: true, guestsBuild: true, cheats: false, personalPacks: true, voice: true, economy: true }; }

export class WorldRoom extends DurableObject<Env> {
  private sql: SqlStorage;
  private meta: StoredMeta | null = null;
  private sim: WorldSim | null = null;
  private gen: WorldGenerator | null = null;
  private levels: GenRegistry | null = null;
  private cache = new Map<string, { c: ChunkData; dirty: boolean; used: number }>();
  private eco!: Economy;
  private playStart = new Map<string, number>();
  private sessions = new Map<WebSocket, Session>();
  private loop: ReturnType<typeof setTimeout> | null = null;
  private loadQueue: string[] = [];
  private blockBatch: number[][] = [];
  private dirtyBE = new Set<string>();
  private lastFlush = 0;
  private ticks = 0;
  private loaded = false;
  private cd: { end: number; label: string; reset: boolean; said: number } | null | undefined;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.tables();
    this.eco = new Economy(this.sql, {
      sim: () => this.ensureSim(),
      send: (pid, msg) => { const ss = this.sessionFor(pid); if (ss) this.send(ss, msg as S2C); },
      chat: (pid, text, kind = 'info') => { const ss = this.sessionFor(pid); if (ss) this.systemChat(text, kind, ss); },
      enabled: () => this.meta?.settings.economy !== false,
      playtime: (pp) => (pp.playtime ?? 0) + (Date.now() - (this.playStart.get(pp.id) ?? Date.now())) / 1000,
    });
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as Attachment | null;
      this.sessions.set(ws, this.newSession(ws, a));
    }
  }

  private tables(): void {
    this.sql.exec(`CREATE TABLE IF NOT EXISTS chunks (k TEXT PRIMARY KEY, d BLOB)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, secret TEXT, data TEXT)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS be (k TEXT PRIMARY KEY, data TEXT)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS genbe (k TEXT PRIMARY KEY)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS genlv (k TEXT PRIMARY KEY, v INTEGER)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS gcache (k TEXT PRIMARY KEY, lv INTEGER, d BLOB)`);
  }

  private async wipe(): Promise<void> {
    if (this.loop) clearTimeout(this.loop);
    if (this.pumpT !== null) clearTimeout(this.pumpT);
    this.joinQueue = [];
    this.loop = null; this.pumpT = null;
    this.sessions.clear();
    this.cache.clear();
    this.loadQueue = [];
    this.sim = null;
    this.meta = null;
    this.levels = null;
    await this.ctx.storage.deleteAll();
    this.tables();
  }

  private newSession(ws: WebSocket, a: Attachment | null): Session {
    return {
      ws, pid: a?.pid ?? null, name: a?.name ?? '', op: a?.op ?? false, joinedAt: Date.now(), bucket: 200, bucketT: Date.now(),
      chatT: 0, chatBurst: 4, lastChat: '', strikes: 0, lastSeen: Date.now(), sentEnts: new Map(), sentPlayers: new Map(),
      chunkCX: 1e9, chunkCZ: 1e9,
    };
  }

  private loadMeta(): StoredMeta | null {
    if (this.meta) return this.meta;
    let row: Record<string, SqlStorageValue> | undefined;
    try { row = this.sql.exec(`SELECT v FROM kv WHERE k = 'meta'`).toArray()[0]; }
    catch { this.tables(); row = this.sql.exec(`SELECT v FROM kv WHERE k = 'meta'`).toArray()[0]; }
    if (!row) return null;
    this.meta = JSON.parse(row.v as string) as StoredMeta;
    return this.meta;
  }

  private saveMeta(): void {
    if (!this.meta) return;
    if (this.sim) { this.meta.time = this.sim.time; this.meta.weather = this.sim.weather; this.meta.dayCycle = this.sim.settings.dayCycle; this.meta.rules = ruleSnapshot(this.sim.settings); this.meta.end = this.sim.endState; }
    this.sql.exec(`INSERT OR REPLACE INTO kv (k, v) VALUES ('meta', ?)`, JSON.stringify(this.meta));
  }

  private publicMeta(): RoomMeta {
    const m = this.meta!;
    return {
      code: m.code, name: m.name, ownerId: m.ownerId, ownerName: m.ownerName, mode: m.mode, difficulty: m.difficulty,
      maxPlayers: m.maxPlayers, seed: m.seed, createdAt: m.createdAt, version: PROTOCOL_VERSION, pack: m.pack, settings: m.settings, region: m.region, arena: m.arena ?? null, climate: m.climate,
    };
  }

  private ensureSim(): WorldSim {
    if (this.sim) return this.sim;
    const m = this.loadMeta()!;
    if (m.arena) { this.sql.exec('DELETE FROM chunks'); this.cache.clear(); }
    this.gen = new WorldGenerator(m.seed, m.arena ?? null, { secret: this.oreSeed(), climate: m.climate });
    this.levels = this.loadLevels(m);
    const store: WorldStore = {
      getBlock: (x, y, z) => {
        const c = this.peekChunk(x >> 4, z >> 4);
        if (!c) return B.STONE;
        return c.get(x & 15, y, z & 15);
      },
      setBlock: (x, y, z, v) => {
        const k = chunkKey(x >> 4, z >> 4);
        let e = this.cache.get(k);
        if (!e) { this.getChunk(x >> 4, z >> 4); e = this.cache.get(k)!; }
        e.c.set(x & 15, y, z & 15, v);
        e.c.modified = true;
        e.dirty = true;
      },
      isLoaded: (x, z) => this.cache.has(chunkKey(x >> 4, z >> 4)),
      ensure: (x, z) => { this.getChunk(x >> 4, z >> 4); },
      raw: (cx, cz) => this.cache.get(chunkKey(cx, cz))?.c.blocks ?? null,
    };
    const spawnRow = this.sql.exec(`SELECT v FROM kv WHERE k = 'spawn'`).toArray()[0];
    const spawn = spawnRow ? JSON.parse(spawnRow.v as string) : this.gen.findSpawn();
    if (!spawnRow) this.sql.exec(`INSERT OR REPLACE INTO kv (k, v) VALUES ('spawn', ?)`, JSON.stringify(spawn));
    this.sim = new WorldSim({
      seed: m.seed, store, gen: this.gen, difficulty: m.difficulty, emit: (ev) => this.onSimEvent(ev),
      validateMoves: true, authoritative: true, spawn,
    });
    this.sim.serverMode = true;
    this.sim.onVirtualClose = (pp, kind, items) => this.eco.virtualClosed(pp, kind, items);
    this.sim.bank = { on: () => this.eco.on, take: (id, name, n) => this.eco.charge(id, name, n), give: (id, name, n) => this.eco.grant(id, name, n) };
    this.sim.time = m.time ?? 1000;
    this.sim.endState = { ...freshEndState(), ...(m.end ?? {}) };
    this.sim.peakPlayers = m.peak ?? 0;
    this.sim.weather = (m.weather as 'clear') ?? 'clear';
    this.sim.settings = { pvp: m.settings.pvp, cheats: m.settings.cheats, guestsBuild: m.settings.guestsBuild, dayCycle: m.dayCycle ?? true, weatherCycle: true, ...(m.rules ?? {}) };
    const dpRow = this.sql.exec(`SELECT v FROM kv WHERE k = 'datapacks'`).toArray()[0];
    if (dpRow) { try { this.sim.setDataPacks(cleanPackList(JSON.parse(dpRow.v as string))); } catch { /* ignore corrupt */ } }
    if (!m.pvpV6) { m.settings.pvp = true; m.pvpV6 = true; this.sim.settings.pvp = true; this.saveMeta(); }
    if (!m.capV10) { if (m.maxPlayers === 8) m.maxPlayers = 20; m.capV10 = true; this.saveMeta(); }
    if (!this.loaded) {
      for (const row of this.sql.exec(`SELECT k, data FROM be`).toArray()) {
        try {
          const be = JSON.parse(row.data as string) as BlockEntity;
          be.items = be.items.map((s) => (validStack(s) ? cloneStack(s) : null));
          this.sim.blockEntities.set(row.k as string, be);
          if (be.type === 'furnace' || be.type === 'campfire') this.sim.activeFurnaces.add(row.k as string);
        } catch { /* skip corrupt */ }
      }
      this.loadPersistentMobs();
      this.loadFixtures();
      this.loaded = true;
    }
    const cx = Math.floor(spawn.x / 16), cz = Math.floor(spawn.z / 16);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) this.getChunk(cx + dx, cz + dz);
    if (m.arena && !this.sim.game) {
      for (const e of [...this.sim.entities.values()]) this.sim.entities.delete(e.id);
      this.sim.game = new Minigame(this.sim, m.arena);
      for (let cz = -5; cz <= 4; cz++) for (let cx = -5; cx <= 4; cx++) this.getChunk(cx, cz);
    }
    return this.sim;
  }

  private loadLevels(m: StoredMeta): GenRegistry {
    if (m.genBase === undefined) {
      const pts: [number, number][] = [];
      for (const row of this.sql.exec(`SELECT k FROM chunks`).toArray()) { const [a, b] = String(row.k).split(',').map(Number); if (Number.isFinite(a) && Number.isFinite(b)) pts.push([a, b]); }
      for (const row of this.sql.exec(`SELECT k FROM genbe`).toArray()) { const [a, b] = String(row.k).split(',').map(Number); if (Number.isFinite(a) && Number.isFinite(b)) pts.push([a, b]); }
      for (const row of this.sql.exec(`SELECT data FROM players`).toArray()) {
        try { const d = JSON.parse(row.data as string) as { x?: number; z?: number; spawn?: { x: number; z: number }; homes?: Record<string, { x: number; z: number }> }; for (const q of [d, d.spawn, ...Object.values(d.homes ?? {})]) if (q && Number.isFinite(q.x) && Number.isFinite(q.z)) pts.push([Math.floor(q.x! / 16), Math.floor(q.z! / 16)]); } catch { /* skip */ }
      }
      const sp = this.sql.exec(`SELECT v FROM kv WHERE k = 'spawn'`).toArray()[0];
      if (sp) { try { const s = JSON.parse(sp.v as string) as { x: number; z: number }; pts.push([Math.floor(s.x / 16), Math.floor(s.z / 16)]); } catch { /* skip */ } }
      if (!pts.length) pts.push([0, 0]);
      const reg = new GenRegistry(LEGACY_LEVEL, pts);
      this.sql.exec(`INSERT OR REPLACE INTO kv (k, v) VALUES ('genpts', ?)`, JSON.stringify(reg.points));
      m.genBase = LEGACY_LEVEL;
      this.saveMeta();
    }
    let pts: [number, number][] = [];
    const row = this.sql.exec(`SELECT v FROM kv WHERE k = 'genpts'`).toArray()[0];
    if (row) { try { pts = JSON.parse(row.v as string); } catch { pts = []; } }
    return new GenRegistry(m.genBase ?? GEN_LEVEL, pts, undefined,
      (k) => { const r = this.sql.exec(`SELECT v FROM genlv WHERE k = ?`, k).toArray()[0]; return r ? Number(r.v) : undefined; },
      (k, v) => { this.sql.exec(`INSERT OR REPLACE INTO genlv (k, v) VALUES (?, ?)`, k, v); });
  }

  private chunkLevel(cx: number, cz: number): number {
    return this.levels?.level(cx, cz) ?? GEN_LEVEL;
  }

  private oreSeed(): number {
    const row = this.sql.exec(`SELECT v FROM kv WHERE k = 'oreSeed'`).toArray()[0];
    if (row) return Number(row.v) >>> 0;
    const v = crypto.getRandomValues(new Uint32Array(1))[0];
    this.sql.exec(`INSERT OR REPLACE INTO kv (k, v) VALUES ('oreSeed', ?)`, String(v));
    return v;
  }

  private peekGet = (x: number, y: number, z: number): number | null => {
    const c = this.peekChunk(x >> 4, z >> 4);
    return c ? c.get(x & 15, y, z & 15) : null;
  };

  private forceGet = (x: number, y: number, z: number): number | null => this.getChunk(x >> 4, z >> 4).get(x & 15, y, z & 15);

  private stepNeighbours(cx: number, cz: number): boolean {
    for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (this.cache.has(chunkKey(cx + dx, cz + dz))) continue;
      this.getChunk(cx + dx, cz + dz);
      return false;
    }
    return true;
  }

  private sendChunk(s: Session, p: SimPlayer, cx: number, cz: number): boolean {
    const k = chunkKey(cx, cz);
    const near = Math.max(Math.abs(cx - Math.floor(p.x / 16)), Math.abs(cz - Math.floor(p.z / 16))) <= ORE_REVEAL_RADIUS;
    if (near && !this.stepNeighbours(cx, cz)) return false;
    const world = near ? this.forceGet : this.peekGet;
    let blocks: BlockArray | null = null;
    let modified = false;
    const e = this.cache.get(k);
    if (e) { blocks = e.c.blocks; modified = e.c.modified; e.used = this.ticks; }
    else {
      const row = this.sql.exec(`SELECT d FROM chunks WHERE k = ?`, k).toArray()[0];
      if (row) {
        const bytes = new Uint8Array(row.d as ArrayBuffer);
        blocks = decodeRLE(new Uint16Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)));
        modified = true;
        this.cost += 0.15;
      } else if (near) blocks = this.getChunk(cx, cz).blocks;
    }
    if (!modified && this.gen?.hasStructure(cx, cz)) {
      blocks ??= this.getChunk(cx, cz).blocks;
      modified = true;
    }
    const so = (s.oreSent ??= new Set());
    const lv = this.chunkLevel(cx, cz);
    const lvOut = lv < GEN_LEVEL ? lv : undefined;
    if (modified && blocks) {
      this.cost += 0.6;
      this.send(s, { t: 'chunk', cx, cz, d: u16ToBase64(encodeRLE(maskChunk(blocks, cx, cz, world))), lv: lvOut });
      if (near) so.add(k); else so.delete(k);
      return true;
    }
    const om = this.levels?.oldMask(cx, cz);
    const omOut = om ? Array.from(om) : undefined;
    if (near && blocks) {
      this.cost += 0.05;
      const o = exposedOres(blocks, cx, cz, world);
      this.send(s, { t: 'chunk', cx, cz, d: null, o: o.length ? o : undefined, lv: lvOut, om: omOut });
      so.add(k);
      return true;
    }
    so.delete(k);
    this.send(s, { t: 'chunk', cx, cz, d: null, lv: lvOut, om: omOut });
    return true;
  }

  private cost = 0;
  private pumpT: ReturnType<typeof setTimeout> | null = null;
  private rr = 0;

  private schedulePump(): void {
    if (this.pumpT !== null || !this.sim) return;
    this.pumpT = setTimeout(() => { this.pumpT = null; this.pump(); }, this.strain > 0 ? 40 : 6);
  }

  private hasWork(): boolean {
    if (this.loadQueue.length) return true;
    for (const s of this.sessions.values()) if (s.chunkReq?.length || s.oreQueue?.length) return true;
    return false;
  }

  private pump(): void {
    if (!this.sim) return;
    this.cost = 0;
    let n = 0;
    try {
      while (this.cost < (this.strain > 0 ? 0.6 : 1) && n++ < 300) if (!this.pumpOnce()) return;
    } catch (err) { console.error('pump error', err); }
    if (this.hasWork()) this.schedulePump();
  }

  private nearPlayer(cx: number, cz: number, r: number): boolean {
    for (const p of this.sim!.players.values()) if (Math.max(Math.abs(cx - Math.floor(p.x / 16)), Math.abs(cz - Math.floor(p.z / 16))) <= r) return true;
    return false;
  }

  private pumpOnce(): boolean {
    for (let i = 0; i < Math.min(48, this.loadQueue.length); i++) {
      const k = this.loadQueue[i];
      if (this.cache.has(k)) { this.loadQueue.splice(i--, 1); continue; }
      const [cx, cz] = k.split(',').map(Number);
      if (!this.nearPlayer(cx, cz, 1)) continue;
      this.loadQueue.splice(i, 1);
      this.getChunk(cx, cz);
      return true;
    }
    const ss: Session[] = [];
    for (const s of this.sessions.values()) if (s.pid && s.chunkReq?.length) ss.push(s);
    if (ss.length) {
      const s = ss[this.rr++ % ss.length];
      const k = s.chunkReq!.shift()!;
      const p = this.sim!.players.get(s.pid!);
      this.cost += 0.01;
      if (p) {
        const [cx, cz] = k.split(',').map(Number);
        if (Math.max(Math.abs(cx - Math.floor(p.x / 16)), Math.abs(cz - Math.floor(p.z / 16))) <= 20 && !this.sendChunk(s, p, cx, cz)) s.chunkReq!.unshift(k);
      }
      return true;
    }
    while (this.loadQueue.length) {
      const k = this.loadQueue.shift()!;
      if (this.cache.has(k)) continue;
      const [cx, cz] = k.split(',').map(Number);
      this.getChunk(cx, cz);
      return true;
    }
    return this.processOres(1) > 0;
  }

  private queueOres(s: Session, p: SimPlayer): void {
    const so = (s.oreSent ??= new Set());
    const q = (s.oreQueue ??= []);
    const pcx = Math.floor(p.x / 16), pcz = Math.floor(p.z / 16);
    for (const k of so) {
      const [cx, cz] = k.split(',').map(Number);
      if (Math.max(Math.abs(cx - pcx), Math.abs(cz - pcz)) > ORE_REVEAL_RADIUS + 2) so.delete(k);
    }
    const R = ORE_REVEAL_RADIUS;
    for (let r = 0; r <= R; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      const k = chunkKey(pcx + dx, pcz + dz);
      if (!so.has(k) && !q.includes(k)) q.push(k);
    }
    if (q.length > 400) q.splice(0, q.length - 400);
    this.schedulePump();
  }

  private processOres(budget: number): number {
    let used = 0;
    for (const s of this.sessions.values()) {
      if (!s.pid || !s.oreQueue?.length) continue;
      const p = this.sim!.players.get(s.pid);
      if (!p) continue;
      const pcx = Math.floor(p.x / 16), pcz = Math.floor(p.z / 16);
      let n = 0;
      while (s.oreQueue.length && n < 3 && used < budget) {
        const k = s.oreQueue.shift()!;
        if (s.oreSent!.has(k)) continue;
        const [cx, cz] = k.split(',').map(Number);
        if (Math.max(Math.abs(cx - pcx), Math.abs(cz - pcz)) > ORE_REVEAL_RADIUS) continue;
        if (!this.stepNeighbours(cx, cz)) { s.oreQueue.unshift(k); return used + 1; }
        const o = exposedOres(this.getChunk(cx, cz).blocks, cx, cz, this.forceGet);
        if (o.length) this.send(s, { t: 'ores', cx, cz, o });
        s.oreSent!.add(k);
        n++; used++;
      }
    }
    return used;
  }

  private peekChunk(cx: number, cz: number): ChunkData | null {
    const e = this.cache.get(chunkKey(cx, cz));
    if (!e) return null;
    e.used = this.ticks;
    return e.c;
  }

  private getChunk(cx: number, cz: number): ChunkData {
    const k = chunkKey(cx, cz);
    const hit = this.cache.get(k);
    if (hit) { hit.used = this.ticks; return hit.c; }
    let c: ChunkData;
    const row = this.sql.exec(`SELECT d FROM chunks WHERE k = ?`, k).toArray()[0];
    if (row) {
      const bytes = new Uint8Array(row.d as ArrayBuffer);
      const rle = new Uint16Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
      c = new ChunkData(cx, cz, decodeRLE(rle));
      c.modified = true;
    } else {
      const lv = this.chunkLevel(cx, cz), mask = this.levels?.oldMask(cx, cz) ?? null;
      const hit = mask ? undefined : this.sql.exec(`SELECT d FROM gcache WHERE k = ? AND lv = ?`, k, lv).toArray()[0];
      let g: { blocks: BlockArray; entities: GeneratedChunk['entities'] };
      if (hit) {
        const bytes = new Uint8Array(hit.d as ArrayBuffer);
        g = { blocks: decodeRLE(new Uint16Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))), entities: [] };
        this.cost += 0.15;
      } else {
        g = this.gen!.generate(cx, cz, lv, mask);
        this.cost += 1;
        if (!mask && !this.meta?.arena && (!g.entities.length || this.sim)) { const rle = encodeRLE(g.blocks); this.sql.exec(`INSERT OR REPLACE INTO gcache (k, lv, d) VALUES (?, ?, ?)`, k, lv, new Uint8Array(rle.buffer, rle.byteOffset, rle.byteLength)); }
      }
      c = new ChunkData(cx, cz, g.blocks);
      if (g.entities.length && this.sim) {
        const done = this.sql.exec(`SELECT k FROM genbe WHERE k = ?`, k).toArray().length > 0;
        if (!done) {
          for (const e of g.entities) {
            const wx = cx * 16 + e.x, wz = cz * 16 + e.z;
            this.sim.addGeneratedChest(wx, e.y, wz, e.items, e.type, e.mob, e.face);
            if (e.type !== 'mob' && e.type !== 'frame') this.dirtyBE.add(posKey(wx, e.y, wz));
          }
          this.sql.exec(`INSERT OR REPLACE INTO genbe (k) VALUES (?)`, k);
        }
      }
    }
    this.cache.set(k, { c, dirty: false, used: this.ticks });
    this.sim?.rs.queueRevalidate(cx, cz);
    if (this.cache.size > MAX_CACHE) this.evict();
    return c;
  }

  private simRadius(): number {
    const n = Math.max(1, this.sim?.players.size ?? 1);
    return Math.max(1, Math.min(SIM_RADIUS, Math.floor((Math.sqrt(CHUNK_BUDGET / n) - 1) / 2)));
  }

  private evict(): void {
    const needed = new Set<string>();
    for (const p of this.sim?.players.values() ?? []) {
      const pcx = Math.floor(p.x / 16), pcz = Math.floor(p.z / 16);
      const R = this.simRadius();
      for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) needed.add(chunkKey(pcx + dx, pcz + dz));
    }
    if (this.meta?.arena) for (let cz = -5; cz <= 4; cz++) for (let cx = -5; cx <= 4; cx++) needed.add(chunkKey(cx, cz));
    const entries = [...this.cache.entries()].filter(([k]) => !needed.has(k)).sort((a, b) => a[1].used - b[1].used);
    for (const [k, e] of entries) {
      if (this.cache.size <= MAX_CACHE * 0.8) break;
      if (e.dirty) this.writeChunk(k, e.c);
      this.cache.delete(k);
    }
  }

  private writeChunk(k: string, c: ChunkData): void {
    const rle = encodeRLE(c.blocks);
    this.sql.exec(`INSERT OR REPLACE INTO chunks (k, d) VALUES (?, ?)`, k, new Uint8Array(rle.buffer, rle.byteOffset, rle.byteLength));
  }

  private saveSome(n: number): void {
    for (const [k, e] of this.cache) {
      if (n <= 0) return;
      if (e.dirty) { this.writeChunk(k, e.c); e.dirty = false; n--; }
    }
  }

  private flush(all = true): void {
    if (all) for (const [k, e] of this.cache) if (e.dirty) { this.writeChunk(k, e.c); e.dirty = false; }
    if (this.sim) {
      for (const k of this.dirtyBE) {
        const be = this.sim.blockEntities.get(k);
        if (be) this.sql.exec(`INSERT OR REPLACE INTO be (k, data) VALUES (?, ?)`, k, JSON.stringify(be));
        else this.sql.exec(`DELETE FROM be WHERE k = ?`, k);
      }
      this.dirtyBE.clear();
      for (const p of this.sim.players.values()) this.savePlayer(p);
      this.savePersistentMobs();
      this.sql.exec(`INSERT OR REPLACE INTO kv (k, v) VALUES ('fixtures', ?)`, JSON.stringify(this.sim.fixtures()));
    }
    this.saveMeta();
    this.lastFlush = Date.now();
  }

  private savePersistentMobs(): void {
    if (!this.sim) return;
    const out: number[][] = [];
    for (const e of this.sim.entities.values()) if (e.type === 'shellward' && out.length < 4000) out.push([Math.round(e.x * 10) / 10, Math.round(e.y * 10) / 10, Math.round(e.z * 10) / 10, Math.ceil(e.health), e.att ?? 3]);
    this.sql.exec(`INSERT OR REPLACE INTO kv (k, v) VALUES ('pmobs', ?)`, JSON.stringify(out));
  }

  private loadFixtures(): void {
    const row = this.sql.exec(`SELECT v FROM kv WHERE k = 'fixtures'`).toArray()[0];
    if (!row || !this.sim) return;
    try { this.sim.loadFixtures(JSON.parse(row.v as string)); } catch { /* corrupt */ }
  }

  private loadPersistentMobs(): void {
    const row = this.sql.exec(`SELECT v FROM kv WHERE k = 'pmobs'`).toArray()[0];
    if (!row || !this.sim) return;
    let list: unknown;
    try { list = JSON.parse(row.v as string); } catch { return; }
    if (!Array.isArray(list)) return;
    for (const r of list.slice(0, 4000)) {
      if (!Array.isArray(r) || r.length < 5 || !r.every((n) => typeof n === 'number' && Number.isFinite(n))) continue;
      const e = this.sim.spawnMob('shellward', r[0], r[1], r[2]);
      e.persistent = true; e.health = Math.max(1, Math.min(30, r[3])); e.att = Math.max(0, Math.min(5, r[4] | 0));
    }
  }

  private savePlayer(p: SimPlayer): void {
    if (p.vanished) return;
    const st = p.cru;
    const data = {
      name: p.name, appearance: p.appearance, x: st?.x ?? p.x, y: st?.y ?? p.y, z: st?.z ?? p.z, yaw: p.yaw, pitch: p.pitch, mode: st?.mode ?? p.mode, inv: st?.inv ?? p.inv,
      health: p.health, food: p.food, sat: p.sat, air: p.air, xp: p.xp, dead: p.dead, spawn: p.spawn, anchor: p.anchor, homes: p.homes, back: p.back,
      kills: p.kills ?? 0, deaths: p.deaths ?? 0, playtime: Math.floor((p.playtime ?? 0) + (Date.now() - (this.playStart.get(p.id) ?? Date.now())) / 1000),
    };
    this.sql.exec(`UPDATE players SET data = ? WHERE id = ?`, JSON.stringify(data), p.id);
  }

  private handingOver = false;

  private handover(): void {
    if (this.handingOver) return;
    this.handingOver = true;
    console.log('room handing over to', GAME_VERSION, '->', 'newer build');
    try { for (const s of this.sessions.values()) if (s.pid) this.send(s, { t: 'chat', from: null, text: 'This world is updating to the new version. Reconnecting in a moment...', kind: 'info', ts: Date.now() }); } catch { /* ignore */ }
    try { if (this.sim) this.flush(true); } catch (err) { console.error('handover flush failed', err); }
    if (this.loop) { clearTimeout(this.loop); this.loop = null; }
    for (const s of this.sessions.values()) { try { s.ws.close(1012, 'World updating'); } catch { /* gone */ } }
    for (const ws of this.ctx.getWebSockets()) { try { ws.close(1012, 'World updating'); } catch { /* gone */ } }
    setTimeout(() => { try { this.ctx.abort('code update'); } catch { /* reset */ } }, 50);
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const build = req.headers.get('x-strata-build');
    if (this.handingOver || (build && newerBuild(build, GAME_VERSION))) {
      this.handover();
      return Response.json({ error: 'World is updating, please retry.', retry: true }, { status: 503, headers: { 'retry-after': '1' } });
    }
    if (url.pathname === '/init' && req.method === 'POST') return this.handleInit(req);
    if (url.pathname === '/info') { try { return Response.json(this.info()); } catch (err) { console.error('info error', err); return Response.json({ error: 'World is busy, please retry.', retry: true }, { status: 503, headers: { 'retry-after': '3' } }); } }
    if (url.pathname === '/delete' && req.method === 'POST') return this.handleDelete(req);
    if (url.pathname === '/admin' && req.method === 'POST') return this.handleAdmin(req);
    if (url.pathname === '/ws') {
      if (req.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('Expected WebSocket', { status: 426 });
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ pid: null, name: '', op: false } satisfies Attachment);
      this.sessions.set(server, this.newSession(server, null));
      this.startLoop();
      return new Response(null, { status: 101, webSocket: client });
    }
    return new Response('Not found', { status: 404 });
  }

  private info(): RoomInfo {
    const m = this.loadMeta();
    if (!m) return { exists: false, code: '' };
    const players = [...this.sessions.values()].filter((s) => s.pid).map((s) => ({ id: s.pid!, name: s.name }));
    return { exists: true, code: m.code, name: m.name, ownerName: m.ownerName, mode: m.mode, difficulty: m.difficulty, maxPlayers: m.maxPlayers, players, version: PROTOCOL_VERSION, min: MIN_PROTOCOL_VERSION, pack: m.pack, arena: m.arena ?? null };
  }

  private async handleInit(req: Request): Promise<Response> {
    if (this.loadMeta()) return Response.json({ error: 'exists' }, { status: 409 });
    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { return Response.json({ error: 'bad json' }, { status: 400 }); }
    const code = String(body.code ?? '');
    const mode: GameMode = body.mode === 'creative' ? 'creative' : 'survival';
    const difficulty: Difficulty = DIFFICULTIES.includes(body.difficulty as Difficulty) ? (body.difficulty as Difficulty) : 'normal';
    const maxPlayers = isInt(body.maxPlayers, 1, MAX_PLAYERS_LIMIT) ? body.maxPlayers : DEFAULT_MAX_PLAYERS;
    const seed = isInt(body.seed, 0, 0xffffffff) ? body.seed : (Math.random() * 0xffffffff) >>> 0;
    const ownerId = String(body.ownerId ?? '');
    const ownerSecret = String(body.ownerSecret ?? '');
    if (!/^[a-zA-Z0-9-]{8,64}$/.test(ownerId) || ownerSecret.length < 16) return Response.json({ error: 'bad owner' }, { status: 400 });
    const s = (body.settings ?? {}) as Partial<RoomSettings>;
    const pack = body.pack && typeof body.pack === 'object' ? body.pack as PackRef : null;
    const arena = isArenaKind(body.arena) ? body.arena : null;
    const climate = !arena && typeof body.climate === 'number' && Number.isFinite(body.climate) ? Math.max(0.5, Math.min(4, Math.round(body.climate * 100) / 100)) : undefined;
    this.meta = {
      code, name: cleanText(body.name, 32) || 'Untitled World', ownerId, ownerName: cleanName(body.ownerName), mode, difficulty, maxPlayers, seed,
      createdAt: Date.now(), version: PROTOCOL_VERSION,
      pack: pack && typeof pack.hash === 'string' ? { name: cleanText(pack.name, 40), hash: cleanText(pack.hash, 80) } : null,
      arena, ops: [], ...(climate === undefined ? {} : { climate }),
      pvpV6: true, genBase: GEN_LEVEL,
      settings: { ...defaultSettings(), pvp: s.pvp !== false || !!arena, guestsBuild: s.guestsBuild !== false, cheats: mode === 'creative' ? s.cheats !== false : !!s.cheats, personalPacks: s.personalPacks !== false },
      region: cleanText(body.region, 8) || 'auto',
      ownerHash: await sha256(ownerSecret), time: 1000, weather: 'clear', dayCycle: true, muted: [], bans: {},
    };
    this.saveMeta();
    return Response.json({ room: this.publicMeta() });
  }

  private async handleDelete(req: Request): Promise<Response> {
    const m = this.loadMeta();
    if (!m) return Response.json({ ok: true });
    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { return Response.json({ error: 'bad json' }, { status: 400 }); }
    if (body.ownerId !== m.ownerId || (await sha256(String(body.ownerSecret ?? ''))) !== m.ownerHash) return Response.json({ error: 'forbidden' }, { status: 403 });
    for (const s of this.sessions.values()) this.sendErr(s, 'unavailable', 'This world was deleted by its owner.');
    await this.wipe();
    const reg = this.env.REGISTRY;
    if (reg) await reg.get(reg.idFromName('global')).fetch('https://registry/remove', { method: 'POST', body: JSON.stringify({ code: m.code }) }).catch(() => undefined);
    return Response.json({ ok: true });
  }

  private lastReport = 0;

  private report(force = false): void {
    const reg = this.env.REGISTRY;
    const m = this.meta;
    if (!reg || !m) return;
    const now = Date.now();
    if (!force && now - this.lastReport < 60000) return;
    this.lastReport = now;
    const players = this.sim ? [...this.sim.players.values()].map((p) => ({ id: p.id, name: p.name, x: Math.round(p.x), y: Math.round(p.y), z: Math.round(p.z), op: p.op, mode: p.mode, health: Math.round(p.health), dead: p.dead, vanished: p.vanished })) : [];
    const body = { code: m.code, name: m.name, owner: m.ownerName, mode: m.mode, difficulty: m.difficulty, maxPlayers: m.maxPlayers, createdAt: m.createdAt, arena: m.arena ?? null, players, voice: m.settings.voice !== false };
    const stub = reg.get(reg.idFromName('global'));
    this.ctx.waitUntil(stub.fetch('https://registry/report', { method: 'POST', body: JSON.stringify(body) }).then(() => undefined).catch(() => undefined));
  }

  private async handleAdmin(req: Request): Promise<Response> {
    const m = this.loadMeta();
    if (!m) return Response.json({ error: 'This world does not exist.' }, { status: 404 });
    let b: Record<string, unknown>;
    try { b = await req.json(); } catch { return Response.json({ error: 'bad json' }, { status: 400 }); }
    const act = String(b.action ?? '');
    if (act === 'say') {
      const text = cleanText(b.text, 200);
      if (text) this.systemChat(`[Admin] ${text}`, 'info');
      return Response.json({ ok: true });
    }
    if (act === 'ban' || act === 'unban' || act === 'bans') {
      if (act === 'bans') return Response.json({ ok: true, bans: this.activeBans() });
      const who = this.findKnown(String(b.pid ?? b.name ?? ''));
      if (!who) return Response.json({ error: 'No player by that name or id has joined this world.' }, { status: 404 });
      if (act === 'unban') { const ok = this.clearBan(who.id); return Response.json(ok ? { ok: true } : { error: `${who.name} is not banned.` }, { status: ok ? 200 : 404 }); }
      if (who.id === m.ownerId) return Response.json({ error: 'The world owner cannot be banned.' }, { status: 400 });
      const ms = b.perm === true ? null : parseBanSpan(String(b.duration ?? ''));
      if (ms === undefined) return Response.json({ error: 'Duration must look like 30m, 2h, 7d, 2w, 3mo or perm.' }, { status: 400 });
      this.setBan(who.id, who.name, ms, 'server admin', cleanText(b.reason, 120));
      this.report(true);
      return Response.json({ ok: true });
    }
    if (act === 'kick') {
      const t = this.sessionFor(String(b.pid ?? ''));
      if (!t) return Response.json({ error: 'That player is not online.' }, { status: 404 });
      this.sendErr(t, 'kicked', 'You were removed from this world by a server admin.');
      try { t.ws.close(4000, 'kicked'); } catch { /* gone */ }
      this.handleLeave(t);
      this.report(true);
      return Response.json({ ok: true });
    }
    if (act === 'anticheat') {
      const sim = this.ensureSim();
      if (b.cfg && typeof b.cfg === 'object') { sim.settings.anticheat = sanitizeWard({ ...sim.wardCfg, ...(b.cfg as object) }); this.saveMeta(); }
      if (b.clear) sim.wardLog.length = 0;
      return Response.json({ ok: true, cfg: sim.wardCfg, log: sim.wardLog.slice(-200).reverse() });
    }
    if (act === 'rename' || act === 'recode') {
      if (act === 'rename') { const nm = cleanText(b.name, 32); if (!nm) return Response.json({ error: 'Enter a name.' }, { status: 400 }); m.name = nm; }
      else m.code = String(b.code ?? m.code).toUpperCase().slice(0, 12);
      this.saveMeta();
      this.broadcast({ t: 'room', room: this.publicMeta(), players: this.sim ? [...this.sim.players.values()].filter((p) => !p.vanished).map((p) => this.publicPlayer(p)) : [] });
      this.systemChat(act === 'rename' ? `This world is now called "${m.name}".` : `This world's join code is now ${m.code}. The old code no longer works.`, 'info');
      this.report(true);
      return Response.json({ ok: true, name: m.name, code: m.code });
    }
    if (act === 'settings') {
      if (isInt(b.maxPlayers, 1, MAX_PLAYERS_LIMIT)) m.maxPlayers = b.maxPlayers;
      if (typeof b.voice === 'boolean') m.settings.voice = b.voice;
      if (typeof b.pvp === 'boolean') { m.settings.pvp = b.pvp; if (this.sim) this.sim.settings.pvp = b.pvp; }
      if (typeof b.economy === 'boolean') m.settings.economy = b.economy;
      this.saveMeta();
      this.broadcast({ t: 'room', room: this.publicMeta(), players: this.sim ? [...this.sim.players.values()].filter((p) => !p.vanished).map((p) => this.publicPlayer(p)) : [] });
      this.report(true);
      return Response.json({ ok: true });
    }
    if (act === 'rule') {
      const sim = this.ensureSim();
      const parts = String(b.cmd ?? '').trim().split(/\s+/).slice(0, 3);
      const fake = newPlayer('admin-console', 'Admin', 'creative', sim.spawn);
      fake.op = true;
      const r = sim.command(fake, ['gamerule', ...parts].join(' '));
      return Response.json({ ok: true, result: r });
    }
    if (act === 'prices') {
      if (b.sell || b.shop) this.eco.setPrices({ sell: (b.sell ?? {}) as Record<string, number>, shop: (b.shop ?? {}) as Record<string, number> });
      return Response.json({ ok: true, ...this.eco.priceTable(), economy: m.settings.economy !== false });
    }
    if (act === 'economy') {
      m.settings.economy = b.on !== false;
      this.saveMeta();
      return Response.json({ ok: true, economy: m.settings.economy });
    }
    if (act === 'delete') {
      for (const s of this.sessions.values()) this.sendErr(s, 'unavailable', 'This world was deleted by a server admin.');
      await this.wipe();
      const reg = this.env.REGISTRY;
      if (reg) await reg.get(reg.idFromName('global')).fetch('https://registry/remove', { method: 'POST', body: JSON.stringify({ code: m.code }) }).catch(() => undefined);
      return Response.json({ ok: true });
    }
    return Response.json({ error: 'Unknown action' }, { status: 400 });
  }

  private nextTick = 0;
  strain = 0;
  private slowLog = 0;

  private startLoop(): void {
    if (this.loop) return;
    this.nextTick = Date.now() + TICK_MS;
    const run = () => {
      const now = Date.now();
      const late = now - this.nextTick;
      if (late > 250) {
        this.strain = Math.min(400, this.strain + 40);
        if (now - this.slowLog > 15000) { this.slowLog = now; console.warn('room strained', late, 'ms behind', JSON.stringify({ players: this.sim?.players.size ?? 0, ents: this.sim?.entities.size ?? 0, cache: this.cache.size, loadQ: this.loadQueue.length, joinQ: this.joinQueue.length })); }
        this.nextTick = now;
      } else if (this.strain > 0) this.strain--;
      this.nextTick += TICK_MS;
      try { this.tick(); } catch (err) { console.error('tick error', err); }
      if (this.loop) this.loop = setTimeout(run, Math.max(1, this.nextTick - Date.now()));
    };
    this.loop = setTimeout(run, TICK_MS);
  }

  private stopLoopIfIdle(): void {
    const active = [...this.sessions.values()].some((s) => s.pid);
    if (!active && this.sessions.size === 0 && this.loop) {
      clearTimeout(this.loop);
      this.loop = null;
      if (this.sim) this.flush();
      for (const [k, e] of this.cache) if (!e.dirty) this.cache.delete(k);
    }
  }

  private send(s: Session, msg: S2C): void {
    if ((msg.t === 'inv' || msg.t === 'cont') && s.invAck !== undefined) msg = { ...msg, q: s.invAck };
    try { s.ws.send(JSON.stringify(msg)); } catch { /* socket gone */ }
  }

  private sendSharedPositions(sim: WorldSim): void {
    const sharers: Session[] = [];
    for (const s of this.sessions.values()) if (s.pid && (s.shareAll || s.shareTo?.size)) sharers.push(s);
    for (const s of this.sessions.values()) {
      if (!s.pid) continue;
      const l: [string, string, number, number, number][] = [];
      for (const o of sharers) {
        if (o === s || !(o.shareAll || o.shareTo!.has(s.pid))) continue;
        const p = sim.players.get(o.pid!);
        if (!p || p.vanished) continue;
        l.push([p.id, p.name, Math.round(p.x * 10) / 10, Math.round(p.y), Math.round(p.z * 10) / 10]);
      }
      if (l.length || s.hadShares) this.send(s, { t: 'spos', l });
      s.hadShares = l.length > 0;
    }
  }

  private sendErr(s: Session, code: Extract<S2C, { t: 'err' }>['code'], msg: string): void {
    this.send(s, { t: 'err', code, msg });
    try { s.ws.close(4000 + ['invalid', 'full', 'version', 'auth', 'kicked', 'banned', 'unavailable', 'duplicate'].indexOf(code), msg.slice(0, 100)); } catch { /* ignore */ }
  }

  private broadcast(msg: S2C, except?: Session): void {
    const data = JSON.stringify(msg);
    for (const s of this.sessions.values()) if (s.pid && s !== except) { try { s.ws.send(data); } catch { /* ignore */ } }
  }

  private sessionFor(pid: string): Session | undefined {
    for (const s of this.sessions.values()) if (s.pid === pid) return s;
    return undefined;
  }

  private publicPlayer(p: SimPlayer): PublicPlayer {
    return { id: p.id, name: p.name, appearance: p.appearance, op: p.op, mode: p.mode, muted: this.meta?.muted.includes(p.id), skin: p.skin ?? null, sup: p.supporter };
  }

  private systemChat(text: string, kind: Extract<S2C, { t: 'chat' }>['kind'] = 'system', to?: Session): void {
    const msg: S2C = { t: 'chat', from: null, text, kind, ts: Date.now() };
    if (to) this.send(to, msg); else this.broadcast(msg);
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (this.handingOver) return;
    let s = this.sessions.get(ws);
    if (!s) { s = this.newSession(ws, ws.deserializeAttachment() as Attachment | null); this.sessions.set(ws, s); }
    if (typeof raw !== 'string' || (raw.length > 65536 && !(raw.length <= 140000 && raw.startsWith('{"t":"datapacks"')))) { s.strikes++; return; }
    const now = Date.now();
    s.lastSeen = now;
    s.bucket = Math.min(200, s.bucket + ((now - s.bucketT) / 1000) * 90);
    s.bucketT = now;
    if (--s.bucket < -60) { this.sendErr(s, 'invalid', 'Too many messages.'); return; }
    if (s.bucket < 0) return;
    let msg: C2S;
    try { msg = JSON.parse(raw) as C2S; } catch { s.strikes++; return; }
    if (!msg || typeof msg !== 'object' || typeof (msg as { t?: unknown }).t !== 'string') { s.strikes++; return; }
    if (s.strikes > 60) { this.sendErr(s, 'invalid', 'Too many invalid messages.'); return; }
    this.startLoop();
    if (msg.t === 'hello') {
      if (s.pid || s.queuedAt) return;
      if (this.joinQueue.length || !this.takeJoinToken(now)) {
        if (this.joinQueue.length >= 40) { this.sendErr(s, 'invalid', 'World is busy, please retry.'); return; }
        s.queuedAt = now;
        this.joinQueue.push({ s, msg });
        return;
      }
      await this.admit(s, msg);
      return;
    }
    if (msg.t === 'ping') { if (isNum(msg.c, 0, 1e14)) this.send(s, { t: 'pong', c: msg.c, s: now }); return; }
    if (!s.pid) return;
    const sim = this.ensureSim();
    let p = sim.players.get(s.pid);
    if (!p) { p = this.restorePlayer(s); if (!p) return; }
    sim.setNow(now);
    try { this.handleGame(s, p, msg, sim); } catch (err) { s.strikes++; console.error('msg error', msg.t, err); }
  }

  private restorePlayer(s: Session): SimPlayer | undefined {
    const row = this.sql.exec(`SELECT data FROM players WHERE id = ?`, s.pid!).toArray()[0];
    if (!row || !row.data) return undefined;
    const p = this.playerFromData(s.pid!, s.name, JSON.parse(row.data as string));
    p.op = s.op;
    this.sim!.addPlayer(p);
    return p;
  }

  private playerFromData(id: string, name: string, d: Record<string, unknown> | null): SimPlayer {
    const sim = this.sim!;
    const p = newPlayer(id, name, this.meta!.mode, sim.spawn);
    p.x += Math.floor(Math.random() * 5) - 2;
    p.z += Math.floor(Math.random() * 5) - 2;
    if (d) {
      if (isNum(d.x) && isNum(d.y) && isNum(d.z)) { p.x = d.x; p.y = d.y; p.z = d.z; p.peakY = d.y; }
      if (isNum(d.yaw)) p.yaw = d.yaw;
      if (d.mode === 'creative' || d.mode === 'survival') p.mode = d.mode;
      p.inv = sanitizeInv(d.inv);
      if (isNum(d.health, 0, 20)) p.health = d.health;
      if (isNum(d.food, 0, 20)) p.food = d.food;
      if (isNum(d.sat, 0, 20)) p.sat = d.sat;
      if (isInt(d.xp, 0, 1e7)) p.xp = d.xp;
      p.dead = d.dead === true;
      const sp = d.spawn as Record<string, unknown> | undefined;
      if (sp && isNum(sp.x) && isNum(sp.y) && isNum(sp.z)) p.spawn = { x: sp.x, y: sp.y, z: sp.z };
      if (Array.isArray(d.anchor) && d.anchor.length === 3 && d.anchor.every((n) => isInt(n, -1e7, 1e7))) p.anchor = d.anchor as [number, number, number];
      const pt = (v: unknown) => { const o = v as Record<string, unknown> | undefined; return o && isNum(o.x) && isNum(o.y) && isNum(o.z) ? { x: o.x, y: o.y, z: o.z } : null; };
      if (d.homes && typeof d.homes === 'object') {
        p.homes = {};
        for (const [k, v] of Object.entries(d.homes as Record<string, unknown>).slice(0, 20)) { const q = pt(v); if (q && /^[a-z0-9_-]{1,16}$/.test(k)) p.homes[k] = q; }
      }
      const b = pt(d.back);
      if (b) p.back = b;
      if (isInt(d.kills, 0, 1e9)) p.kills = d.kills;
      if (isInt(d.deaths, 0, 1e9)) p.deaths = d.deaths;
      if (isInt(d.playtime, 0, 1e10)) p.playtime = d.playtime;
    }
    return p;
  }

  private async handleHello(s: Session, msg: Extract<C2S, { t: 'hello' }>): Promise<void> {
    if (s.pid) return;
    const m = this.loadMeta();
    if (!m) { this.sendErr(s, 'unavailable', 'This world does not exist or was deleted.'); return; }
    if (typeof msg.v !== 'number' || msg.v < MIN_PROTOCOL_VERSION || msg.v > PROTOCOL_VERSION) { this.sendErr(s, 'version', `Version mismatch: the world runs protocol ${PROTOCOL_VERSION}, your game uses ${msg.v}. Reload the page to update.`); return; }
    const id = String(msg.id ?? ''), secret = String(msg.secret ?? '');
    if (!/^[a-zA-Z0-9-]{8,64}$/.test(id) || secret.length < 16 || secret.length > 128) { this.sendErr(s, 'auth', 'Invalid player credentials.'); return; }
    const ban = m.bans[id];
    if (ban && ban > Date.now()) { const bi = m.banInfo?.[id]; this.sendErr(s, 'banned', `${ban >= PERMA ? 'You are permanently banned from this world.' : `You are banned from this world for another ${fmtSpan(ban - Date.now())}.`}${bi?.reason ? ` Reason: ${bi.reason}` : ''}`); return; }
    if (this.joining.has(id)) { this.sendErr(s, 'duplicate', 'This player is already joining. Try again in a moment.'); return; }
    const adminKey = typeof (msg as { admin?: unknown }).admin === 'string' ? String((msg as { admin?: string }).admin) : '';
    const spectate = !!adminKey && !!cleanKey(this.env.ADMIN_KEY) && safeEqual(cleanKey(adminKey), cleanKey(this.env.ADMIN_KEY));
    if (adminKey && !spectate) { this.sendErr(s, 'auth', 'That admin key is not correct.'); return; }
    const others = [...this.sessions.values()].filter((o) => o.pid && o.pid !== id && !this.sim?.players.get(o.pid)?.vanished).length;
    if (others >= m.maxPlayers && !spectate) { this.sendErr(s, 'full', `This world is full (${m.maxPlayers} players).`); return; }
    this.joining.add(id);
    try { await this.finishHello(s, msg, m, id, secret, spectate); } finally { this.joining.delete(id); }
  }

  private joining = new Set<string>();
  private joinQueue: { s: Session; msg: Extract<C2S, { t: 'hello' }> }[] = [];
  private joinTokens = 4;
  private joinT = 0;

  private takeJoinToken(now: number): boolean {
    const rate = this.strain > 0 ? 0.6 : this.sim && this.loadQueue.length + this.pendingChunkWork() > 600 ? 1.2 : 2.5;
    this.joinTokens = Math.min(4, this.joinTokens + ((now - (this.joinT || now)) / 1000) * rate);
    this.joinT = now;
    if (this.joinTokens < 1) return false;
    this.joinTokens--;
    return true;
  }

  private pendingChunkWork(): number {
    let n = 0;
    for (const s of this.sessions.values()) n += (s.oreQueue?.length ?? 0) + Math.min(200, s.chunkReq?.length ?? 0);
    return n;
  }

  private async admit(s: Session, msg: Extract<C2S, { t: 'hello' }>): Promise<void> {
    s.queuedAt = undefined;
    s.lastSeen = Date.now();
    try { await this.handleHello(s, msg); } catch (err) { console.error('hello error', err); this.sendErr(s, 'invalid', 'World is busy, please retry.'); }
  }

  private drainJoins(now: number): void {
    while (this.joinQueue.length) {
      const q = this.joinQueue[0];
      if (!this.sessions.has(q.s.ws)) { this.joinQueue.shift(); continue; }
      if (!this.takeJoinToken(now)) return;
      this.joinQueue.shift();
      void this.admit(q.s, q.msg);
    }
  }

  private async finishHello(s: Session, msg: Extract<C2S, { t: 'hello' }>, m: NonNullable<ReturnType<WorldRoom['loadMeta']>>, id: string, secret: string, spectate: boolean): Promise<void> {
    const hash = await sha256(secret);
    const first = this.sql.exec(`SELECT secret FROM players WHERE id = ?`, id).toArray()[0];
    if (first && first.secret !== hash) { this.sendErr(s, 'auth', 'That player identity belongs to someone else.'); return; }
    let name = cleanName(msg.name);
    let supColor: string | undefined;
    if (this.env.ACCOUNTS) {
      try {
        const acc = this.env.ACCOUNTS.get(this.env.ACCOUNTS.idFromName('global'));
        const r = (await (await acc.fetch(`https://accounts/check?name=${encodeURIComponent(name)}&pid=${encodeURIComponent(id)}`)).json()) as { registered: boolean; owner: boolean; name: string | null };
        if (r.registered && !r.owner) name = `~${name}`.slice(0, 16);
        else if (r.owner && r.name) name = r.name;
        if (r.owner) {
          const sup = (await (await acc.fetch(`https://accounts/supporter?pid=${encodeURIComponent(id)}`)).json()) as { active: boolean; color: string | null };
          if (sup.active) supColor = sup.color ?? SUPPORTER_GOLD;
        }
      } catch { /* accounts unavailable: keep the requested name */ }
    }
    if (!this.sessions.has(s.ws)) return;
    const existing = this.sessionFor(id);
    if (existing && existing !== s) {
      this.sendErr(existing, 'duplicate', 'You joined from another tab or device.');
      this.sessions.delete(existing.ws);
      const old = this.sim?.players.get(id);
      if (old) { this.sim!.removePlayer(id); this.savePlayer(old); }
    }
    const row = this.sql.exec(`SELECT secret, data FROM players WHERE id = ?`, id).toArray()[0];
    if (!row) this.sql.exec(`INSERT INTO players (id, secret, data) VALUES (?, ?, ?)`, id, hash, '');
    const sim = this.ensureSim();
    sim.setNow(Date.now());
    const p = this.playerFromData(id, name, row && row.data ? JSON.parse(row.data as string) : null);
    p.appearance = cleanAppearance(msg.appearance);
    p.supporter = supColor;
    p.skin = cleanSkin(msg.skin);
    p.op = (id === m.ownerId && hash === m.ownerHash) || !!m.ops?.some((o) => o.id === id && o.hash === hash);
    if (spectate) {
      p.op = true; p.mode = 'creative'; p.vanished = true;
      const at = this.sim?.players.get(String((msg as { at?: string }).at ?? ''));
      if (at) { p.x = at.x; p.y = at.y + 2; p.z = at.z; p.peakY = p.y; }
    }
    s.hash = hash;
    const pcx = Math.floor(p.x / 16), pcz = Math.floor(p.z / 16);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) this.getChunk(pcx + dx, pcz + dz);
    sim.addPlayer(p);
    { const m = this.meta!; const n = sim.players.size; if (n > (m.peak ?? 0)) { m.peak = n; sim.peakPlayers = n; } }
    this.playStart.set(p.id, Date.now());
    if (!spectate) this.savePlayer(p);
    s.pid = id; s.name = name; s.op = p.op;
    s.ws.serializeAttachment({ pid: id, name, op: p.op } satisfies Attachment);
    this.queueChunks(s, p);
    const players = [...sim.players.values()].filter((x) => !x.vanished || p.op).map((x) => this.publicPlayer(x));
    this.send(s, {
      t: 'welcome', room: this.publicMeta(), players, time: sim.time, cycle: sim.settings.dayCycle, weather: sim.weather, wd: sim.settings.weatherCycle ? sim.weatherTimer : undefined, worldSpawn: sim.spawn, rules: ruleSnapshot(sim.settings), recipes: sim.dataPacks.length ? sim.dataPacks : undefined,
      you: { id, x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, mode: p.mode, inv: p.inv, health: p.health, food: p.food, sat: p.sat, air: p.air, xp: p.xp, dead: p.dead, spawn: p.spawn, op: p.op, sup: p.supporter },
    });
    for (const nm of sim.namedMobs()) this.send(s, { t: 'mn', id: nm.id, n: nm.name });
    const cdNow = this.countdownState();
    if (cdNow) this.send(s, { t: 'cd', ms: Math.max(0, cdNow.end - Date.now()), l: cdNow.label });
    const cru = sim.crucible.view();
    if (cru) this.send(s, { t: 'cru', s: cru });
    if (!spectate) this.eco.joined(p);
    if (spectate) { this.systemChat('You are spectating as a server admin. Other players cannot see you.', 'info', s); this.report(true); return; }
    this.broadcast({ t: 'pj', p: this.publicPlayer(p) }, s);
    this.systemChat(`${name} joined the world.`, 'join');
    this.report(true);
  }

  private queueChunks(s: Session, p: SimPlayer): void {
    const cx = Math.floor(p.x / 16), cz = Math.floor(p.z / 16);
    if (cx === s.chunkCX && cz === s.chunkCZ) return;
    s.chunkCX = cx; s.chunkCZ = cz;
    const R = this.simRadius();
    const add: string[] = [];
    for (let r = 0; r <= R; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      const k = chunkKey(cx + dx, cz + dz);
      if (!this.cache.has(k)) add.push(k);
    }
    if (add.length) {
      const seen = new Set(add);
      this.loadQueue = add.concat(this.loadQueue.filter((k) => !seen.has(k))).slice(0, 2000);
    }
    this.schedulePump();
  }

  private handleGame(s: Session, p: SimPlayer, msg: C2S, sim: WorldSim): void {
    switch (msg.t) {
      case 'mv': {
        const a = msg.p;
        if (!Array.isArray(a) || a.length < 6 || !a.every((n) => isNum(n))) { s.strikes++; return; }
        if (sim.move(p, a[0], a[1], a[2], a[3], a[4], a[5] | 0, a.length > 6 ? a[6] : undefined)) { const moved = Math.floor(p.x / 16) !== s.chunkCX || Math.floor(p.z / 16) !== s.chunkCZ; this.queueChunks(s, p); if (moved) this.queueOres(s, p); }
        return;
      }
      case 'chunks': {
        if (!Array.isArray(msg.want) || msg.want.length > 64) { s.strikes++; return; }
        const q = (s.chunkReq ??= []);
        for (const w of msg.want) {
          if (!Array.isArray(w) || !isInt(w[0], -2e6, 2e6) || !isInt(w[1], -2e6, 2e6)) continue;
          const [cx, cz] = w;
          if (Math.max(Math.abs(cx - Math.floor(p.x / 16)), Math.abs(cz - Math.floor(p.z / 16))) > 20) continue;
          const k = chunkKey(cx, cz);
          if (!q.includes(k)) q.push(k);
        }
        if (q.length > 1500) q.splice(0, q.length - 1500);
        this.schedulePump();
        return;
      }
      case 'dig': {
        if (!isInt(msg.x) || !isInt(msg.y, -64, 512) || !isInt(msg.z)) { s.strikes++; return; }
        if (msg.a === 'start') sim.digStart(p, msg.x, msg.y, msg.z);
        else if (msg.a === 'abort') sim.digAbort(p);
        else if (msg.a === 'done') sim.digFinish(p, msg.x, msg.y, msg.z);
        return;
      }
      case 'use': {
        if (![msg.x, msg.y, msg.z, msg.nx, msg.ny, msg.nz].every((n) => isInt(n))) { s.strikes++; return; }
        sim.use(p, msg.x, msg.y, msg.z, msg.nx, msg.ny, msg.nz, msg.f === 1, typeof msg.h === 'number' && msg.h >= 0 && msg.h <= 1 ? msg.h : 0.5);
        return;
      }
      case 'eat': sim.eat(p); return;
      case 'sw': sim.swing(p); return;
      case 'bow': if (typeof msg.p === 'number' && typeof msg.y === 'number' && typeof msg.x === 'number') sim.shootBow(p, msg.p, msg.y, msg.x); return;
      case 'bpc': {
        if (!isInt(msg.n, 1, BP_MAX_PARTS) || !isInt(msg.i, 0, msg.n - 1) || typeof msg.s !== 'string' || msg.s.length > BP_PART) { s.strikes++; return; }
        if (msg.i === 0) s.bpParts = new Array(msg.n).fill('');
        if (!s.bpParts || s.bpParts.length !== msg.n) { s.strikes++; return; }
        s.bpParts[msg.i] = msg.s;
        return;
      }
      case 'bp': {
        const parts = s.bpParts;
        s.bpParts = undefined;
        if (!parts || parts.length !== msg.n || !isInt(msg.x, -3e7, 3e7) || !isInt(msg.y, -64, 512) || !isInt(msg.z, -3e7, 3e7)) { this.systemChat('Blueprint upload failed. Try again.', 'error', s); return; }
        const bp = decodeBlueprint(parts.join(''), cleanText(msg.name, 32) || 'Blueprint');
        if (!bp) { this.systemChat('That blueprint contains blocks that cannot be placed.', 'error', s); return; }
        const r = sim.placeBlueprint(p, bp, msg.x, msg.y, msg.z, msg.rep === true && p.op);
        if (r) this.systemChat(r, 'info', s);
        return;
      }
      case 'atk': if (isInt(msg.id, 0, 1e9)) sim.attack(p, msg.id); return;
      case 'ue': if (isInt(msg.id, 0, 1e9)) sim.useEntity(p, msg.id); return;
      case 'ench': if (isInt(msg.i, 0, 2)) sim.enchant(p, msg.i); return;
      case 'anvil': if (msg.n === null || (typeof msg.n === 'string' && msg.n.length <= 50)) sim.anvil(p, msg.n); return;
      case 'trd': if (isInt(msg.id, 0, 1e9) && isInt(msg.i, 0, 64) && isInt(msg.n, 1, 64)) sim.trade(p, msg.id, msg.i, msg.n); return;
      case 'pvp': if (typeof msg.pid === 'string') sim.attackPlayer(p, msg.pid); return;
      case 'inv': {
        const op = validateOp(msg.op);
        if (!op || !isInt(msg.s, 0, 1e9)) { s.strikes++; return; }
        s.invAck = msg.s;
        const r = sim.invOp(p, op);
        this.send(s, { t: 'ack', s: msg.s, ok: r.ok, h: r.hash });
        return;
      }
      case 'share': {
        if (!Array.isArray(msg.to) || msg.to.length > 64) { s.strikes++; return; }
        s.shareAll = msg.all === true;
        s.shareTo = new Set(msg.to.filter((x): x is string => typeof x === 'string' && x.length <= 64));
        return;
      }
      case 'resync': {
        this.send(s, { t: 'inv', inv: p.inv });
        const v = p.screen.type ? sim.containerView(p) : null;
        if (v) this.send(s, v.type === 'furnace' ? { t: 'cont', k: v.key, type: 'furnace', items: v.items, burn: v.burn, burnMax: v.burnMax, cook: v.cook } : { t: 'cont', k: v.key, type: 'chest', items: v.items });
        this.send(s, { t: 'vit', h: p.health, f: p.food, s: p.sat, a: p.air, xp: p.xp, dead: p.dead, mode: p.mode });
        return;
      }
      case 'respawn': sim.respawn(p); return;
      case 'buy': if (typeof msg.k === 'string') sim.buy(p, msg.k); return;
      case 'chat': this.handleChat(s, p, msg.text, sim); return;
      case 'room': this.handleRoomUpdate(s, p, msg); return;
      case 'kick': this.kick(s, msg.pid, 'kicked'); return;
      case 'mute': this.mute(s, msg.pid, !!msg.on); return;
      case 'rtc': this.relayRtc(s, p, msg); return;
      case 'skin': {
        const now = Date.now();
        if (now - ((s as Session & { skinT?: number }).skinT ?? 0) < 5000) return;
        (s as Session & { skinT?: number }).skinT = now;
        p.skin = cleanSkin(msg.skin);
        if (!p.vanished) this.broadcast({ t: 'pj', p: this.publicPlayer(p) });
        return;
      }
      case 'eco': if (sim.crucible.busy(p)) { this.systemChat('The shop is closed to fighters inside the Crucible.', 'error', s); return; } this.eco.action(p, msg as unknown as Record<string, unknown>); return;
      case 'datapacks': {
        if (!p.op) { this.systemChat('Only the world owner and operators can change data packs.', 'error', s); return; }
        const now = Date.now();
        if (now - (s.dpT ?? 0) < 4000) { this.systemChat('Wait a moment before changing data packs again.', 'error', s); return; }
        s.dpT = now;
        const list = cleanPackList(msg.d);
        if (list.length) this.sql.exec(`INSERT OR REPLACE INTO kv (k, v) VALUES ('datapacks', ?)`, JSON.stringify(list));
        else this.sql.exec(`DELETE FROM kv WHERE k = 'datapacks'`);
        sim.setDataPacks(list);
        this.broadcast({ t: 'recipes', d: list });
        const n = list.reduce((a, d) => a + d.crafting.length + d.smelting.length, 0);
        this.systemChat(list.length ? `${p.name} changed the data packs: ${list.map((d) => d.name).join(', ')} (${n} recipes).` : `${p.name} removed all data packs.`, 'info');
        return;
      }
    }
  }

  private relayRtc(s: Session, p: SimPlayer, msg: Extract<C2S, { t: 'rtc' }>): void {
    const m = this.meta!;
    if (m.settings.voice === false || m.muted.includes(p.id) || p.vanished) return;
    const now = Date.now();
    if (now - (s.rtcT ?? 0) > 10000) { s.rtcT = now; s.rtcN = 0; }
    s.rtcN = (s.rtcN ?? 0) + 1;
    if (s.rtcN > 120) return;
    if (typeof msg.to !== 'string' || msg.to === p.id) return;
    const body = JSON.stringify(msg.d ?? null);
    if (body.length > 12000) return;
    const t = this.sessionFor(msg.to);
    const tp = this.sim?.players.get(msg.to);
    if (!t || !tp || tp.vanished) return;
    if (Math.hypot(tp.x - p.x, tp.y - p.y, tp.z - p.z) > 200) return;
    this.send(t, { t: 'rtc', from: p.id, d: JSON.parse(body) });
  }

  private handleChat(s: Session, p: SimPlayer, raw: unknown, sim: WorldSim): void {
    const text = cleanText(raw, p.op && typeof raw === 'string' && /^\/(lootdrop|crucible)\b/i.test(raw) ? 1500 : 200);
    if (!text) return;
    const now = Date.now();
    s.chatBurst = Math.min(4, s.chatBurst + (now - s.chatT) / 900);
    s.chatT = now;
    if (s.chatBurst < 1) { this.systemChat('You are sending messages too quickly.', 'error', s); return; }
    s.chatBurst -= 1;
    if (text.startsWith('/')) {
      const [cmd, arg] = text.slice(1).split(/\s+/, 2);
      const lc = cmd.toLowerCase();
      if (lc === 'admin') { void this.claimAdmin(s, p, text.slice(1 + cmd.length).trim()); return; }
      if (lc === 'op' || lc === 'deop') { this.setOp(s, p, arg ?? '', lc === 'op', sim); return; }
      if (lc === 'list') { this.systemChat(`Online: ${[...sim.players.values()].map((x) => x.name).join(', ')}`, 'info', s); return; }
      if (lc === 'kick' || lc === 'mute' || lc === 'unmute') {
        const target = [...sim.players.values()].find((x) => x.name.toLowerCase() === (arg ?? '').toLowerCase());
        if (!target) { this.systemChat(`No player named ${arg}.`, 'error', s); return; }
        if (lc === 'kick') this.kick(s, target.id, 'kicked'); else this.mute(s, target.id, lc === 'mute');
        return;
      }
      if (BAN_CMDS.has(lc)) { this.banCommand(s, p, lc, text.slice(1 + cmd.length).trim(), sim); return; }
      if (lc === 'countdown' || lc === 'resetworld') { this.countdownCommand(s, p, lc, text.slice(1 + cmd.length).trim()); return; }
      const caged = sim.crucible.blocks(p, lc);
      if (caged) { this.systemChat(caged, 'error', s); return; }
      if (this.eco.command(p, text)) return;
      const out = sim.command(p, text);
      if (out) this.systemChat(out, out.startsWith('Unknown') || out.startsWith('You do not') ? 'error' : 'info', s);
      return;
    }
    if (this.meta!.muted.includes(p.id)) { this.systemChat('You are muted in this world.', 'error', s); return; }
    if (text === s.lastChat && now - s.chatT < 3000) return;
    s.lastChat = text;
    this.broadcast({ t: 'chat', from: { id: p.id, name: p.name, sup: p.supporter }, text, kind: 'chat', ts: now });
  }

  private async claimAdmin(s: Session, p: SimPlayer, keyIn: string): Promise<void> {
    let key = keyIn;
    if (p.op) { this.systemChat('You already have admin rights in this world.', 'info', s); return; }
    const secret = cleanKey(this.env.ADMIN_KEY);
    key = cleanKey(key);
    if (!secret) { this.systemChat('This server has no admin key set. The world owner can grant admin with /op <name>.', 'error', s); return; }
    const now = Date.now();
    if (now - (s.adminT ?? 0) > 60000) { s.adminTries = 0; s.adminT = now; }
    s.adminTries = (s.adminTries ?? 0) + 1;
    if (s.adminTries > 3) { this.systemChat('Too many attempts. Wait a minute and try again.', 'error', s); return; }
    const [a, b] = await Promise.all([sha256(key), sha256(secret)]);
    let diff = a.length ^ b.length;
    for (let i = 0; i < Math.min(a.length, b.length); i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    if (diff !== 0 || !key) { this.systemChat(keyHint(key, secret), 'error', s); return; }
    this.grantOp(p, s, true);
    this.systemChat(`${p.name} is now an admin.`);
  }

  private grantOp(p: SimPlayer, s: Session, on: boolean): void {
    const m = this.meta!;
    m.ops = (m.ops ?? []).filter((o) => o.id !== p.id);
    if (on && s.hash) m.ops.push({ id: p.id, hash: s.hash });
    p.op = on; s.op = on;
    s.ws.serializeAttachment({ pid: p.id, name: p.name, op: on } satisfies Attachment);
    this.saveMeta();
    this.send(s, { t: 'room', room: this.publicMeta(), players: [...this.sim!.players.values()].filter((x) => !x.vanished || s.op).map((x) => this.publicPlayer(x)) });
    this.broadcast({ t: 'pj', p: this.publicPlayer(p) });
  }

  private setOp(s: Session, p: SimPlayer, name: string, on: boolean, sim: WorldSim): void {
    if (!p.op) { this.systemChat('Only admins can change admin rights.', 'error', s); return; }
    const target = [...sim.players.values()].find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (!target) { this.systemChat(`No player named ${name || '(blank)'} is online.`, 'error', s); return; }
    if (!on && target.id === this.meta!.ownerId) { this.systemChat('The world owner always keeps admin rights.', 'error', s); return; }
    const ts = this.sessionFor(target.id);
    if (!ts) return;
    this.grantOp(target, ts, on);
    this.systemChat(on ? `${target.name} is now an admin.` : `${target.name} is no longer an admin.`);
  }

  private handleRoomUpdate(s: Session, p: SimPlayer, msg: Extract<C2S, { t: 'room' }>): void {
    if (!p.op) { this.systemChat('Only admins can change room settings.', 'error', s); return; }
    const m = this.meta!;
    if (typeof msg.name === 'string') m.name = cleanText(msg.name, 32) || m.name;
    if (msg.difficulty && DIFFICULTIES.includes(msg.difficulty)) { m.difficulty = msg.difficulty; this.sim!.difficulty = msg.difficulty; }
    if (isInt(msg.maxPlayers, 1, MAX_PLAYERS_LIMIT)) m.maxPlayers = msg.maxPlayers;
    if (msg.settings && typeof msg.settings === 'object') {
      const st = msg.settings;
      if (typeof st.pvp === 'boolean') m.settings.pvp = st.pvp;
      if (typeof st.economy === 'boolean') m.settings.economy = st.economy;
      if (typeof st.guestsBuild === 'boolean') m.settings.guestsBuild = st.guestsBuild;
      if (typeof st.cheats === 'boolean') m.settings.cheats = st.cheats;
      if (typeof st.personalPacks === 'boolean') m.settings.personalPacks = st.personalPacks;
      if (typeof st.voice === 'boolean') m.settings.voice = st.voice;
      Object.assign(this.sim!.settings, { pvp: m.settings.pvp, guestsBuild: m.settings.guestsBuild, cheats: m.settings.cheats });
    }
    if (msg.pack === null) m.pack = null;
    else if (msg.pack && typeof msg.pack.hash === 'string') m.pack = { name: cleanText(msg.pack.name, 40), hash: cleanText(msg.pack.hash, 80) };
    this.saveMeta();
    this.broadcast({ t: 'room', room: this.publicMeta(), players: [...this.sim!.players.values()].filter((x) => !x.vanished).map((x) => this.publicPlayer(x)) });
    this.systemChat('World settings were updated by the owner.');
  }

  private findKnown(q: string): { id: string; name: string } | null {
    const want = q.trim().toLowerCase();
    if (!want) return null;
    for (const x of this.sessions.values()) if (x.pid && (x.pid === q || x.name.toLowerCase() === want)) return { id: x.pid, name: x.name };
    const info = this.meta?.banInfo ?? {};
    for (const [id, bi] of Object.entries(info)) if (id === q || bi.name.toLowerCase() === want) return { id, name: bi.name };
    for (const row of this.sql.exec(`SELECT id, data FROM players`).toArray()) {
      try { const nm = String((JSON.parse(String(row.data)) as { name?: string }).name ?? ''); if (row.id === q || nm.toLowerCase() === want) return { id: String(row.id), name: nm || String(row.id) }; } catch { /* skip */ }
    }
    return null;
  }

  private setBan(id: string, name: string, ms: number | null, by: string, reason: string): void {
    const m = this.meta!;
    m.bans[id] = ms === null ? PERMA : Date.now() + ms;
    (m.banInfo ??= {})[id] = { name, by, reason, at: Date.now() };
    this.saveMeta();
    const t = this.sessionFor(id);
    if (t) { this.sendErr(t, 'banned', `${ms === null ? 'You were permanently banned from this world' : `You were banned from this world for ${fmtSpan(ms)}`}${reason ? `: ${reason}` : '.'}`); this.handleLeave(t); }
  }

  private clearBan(id: string): boolean {
    const m = this.meta!;
    const had = (m.bans[id] ?? 0) > Date.now();
    delete m.bans[id];
    if (m.banInfo) delete m.banInfo[id];
    this.saveMeta();
    return had;
  }

  private activeBans(): { id: string; name: string; until: number | null; by: string; reason: string; at: number }[] {
    const m = this.meta!, now = Date.now(), out: { id: string; name: string; until: number | null; by: string; reason: string; at: number }[] = [];
    for (const [id, until] of Object.entries(m.bans)) {
      if (until <= now) { delete m.bans[id]; if (m.banInfo) delete m.banInfo[id]; continue; }
      const bi = m.banInfo?.[id];
      out.push({ id, name: bi?.name ?? id, until: until >= PERMA ? null : until, by: bi?.by ?? '', reason: bi?.reason ?? '', at: bi?.at ?? 0 });
    }
    return out.sort((a, b) => b.at - a.at);
  }

  private banCommand(s: Session, p: SimPlayer, lc: string, rest: string, sim: WorldSim): void {
    if (!s.op) { this.systemChat('Only operators can ban players.', 'error', s); return; }
    const say = (t: string, kind: 'info' | 'error' = 'info') => this.systemChat(t, kind, s);
    if (lc === 'banlist' || lc === 'bans') {
      const list = this.activeBans();
      if (!list.length) { say('Nobody is banned.'); return; }
      say(`Banned (${list.length}): ${list.slice(0, 20).map((b) => `${b.name} (${b.until === null ? 'permanent' : fmtSpan(b.until - Date.now()) + ' left'}${b.reason ? `, ${b.reason}` : ''})`).join('; ')}`);
      return;
    }
    const [name, ...more] = rest.split(/\s+/).filter(Boolean);
    if (!name) { say(lc === 'unban' || lc === 'pardon' ? 'Usage: /unban <player>' : 'Usage: /ban <player> [30m|2h|7d|2w|3mo|perm] [reason]. Without a time the ban is permanent.', 'error'); return; }
    const who = this.findKnown(name);
    if (!who) { say(`No player named ${name} has joined this world.`, 'error'); return; }
    if (lc === 'unban' || lc === 'pardon') { say(this.clearBan(who.id) ? `${who.name} is unbanned.` : `${who.name} is not banned.`, this.meta!.bans[who.id] ? 'error' : 'info'); return; }
    if (who.id === p.id) { say('You cannot ban yourself.', 'error'); return; }
    if (who.id === this.meta!.ownerId) { say('The world owner cannot be banned.', 'error'); return; }
    const tgt = sim.players.get(who.id);
    if (tgt?.op && p.id !== this.meta!.ownerId) { say('Only the world owner can ban another operator.', 'error'); return; }
    let ms: number | null = null, reasonParts = more;
    const first = more[0]?.toLowerCase();
    if (first !== undefined) {
      const span = parseBanSpan(first);
      if (span !== undefined) { ms = span; reasonParts = more.slice(1); }
      else if (lc === 'tempban') { say('Give a time like 30m, 2h, 7d, 2w or 3mo.', 'error'); return; }
    } else if (lc === 'tempban') { say('Usage: /tempban <player> <30m|2h|7d|2w|3mo> [reason]', 'error'); return; }
    const reason = reasonParts.join(' ').slice(0, 120);
    this.setBan(who.id, who.name, ms, p.name, reason);
    this.systemChat(`${who.name} was ${ms === null ? 'permanently banned' : `banned for ${fmtSpan(ms)}`} by ${p.name}${reason ? `: ${reason}` : '.'}`);
  }

  private kick(s: Session, pid: unknown, _why: string): void {
    if (!s.op) { this.systemChat('Only the world owner can remove players.', 'error', s); return; }
    if (typeof pid !== 'string' || pid === s.pid) return;
    const t = this.sessionFor(pid);
    if (!t) return;
    this.setBan(pid, t.name, 10 * 60 * 1000, s.name, 'Kicked by an operator');
    this.sendErr(t, 'kicked', 'You were removed from this world by the owner.');
    this.handleLeave(t);
  }

  private mute(s: Session, pid: unknown, on: boolean): void {
    if (!s.op) { this.systemChat('Only the world owner can mute players.', 'error', s); return; }
    if (typeof pid !== 'string' || pid === s.pid) return;
    const m = this.meta!;
    m.muted = m.muted.filter((x) => x !== pid);
    if (on) m.muted.push(pid);
    this.saveMeta();
    const target = this.sim?.players.get(pid);
    if (target) {
      this.broadcast({ t: 'pj', p: this.publicPlayer(target) });
      this.systemChat(`${target.name} was ${on ? 'muted' : 'unmuted'}.`);
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const s = this.sessions.get(ws);
    if (s) this.handleLeave(s);
    this.sessions.delete(ws);
    this.stopLoopIfIdle();
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws);
  }

  private countdownState(): { end: number; label: string; reset: boolean; said: number } | null {
    if (this.cd === undefined) {
      const r = this.sql.exec(`SELECT v FROM kv WHERE k = 'countdown'`).toArray()[0];
      try { this.cd = r ? JSON.parse(r.v as string) : null; } catch { this.cd = null; }
    }
    return this.cd ?? null;
  }

  private setCountdown(c: { end: number; label: string; reset: boolean; said: number } | null): void {
    this.cd = c;
    if (c) this.sql.exec(`INSERT OR REPLACE INTO kv (k, v) VALUES ('countdown', ?)`, JSON.stringify(c));
    else this.sql.exec(`DELETE FROM kv WHERE k = 'countdown'`);
    this.broadcast({ t: 'cd', ms: c ? Math.max(0, c.end - Date.now()) : 0, l: c?.label ?? '' });
  }

  private countdownCommand(s: Session, p: SimPlayer, cmd: string, rest: string): void {
    const m = this.meta!;
    const owner = p.op && p.id === m.ownerId;
    if (!p.op || (cmd === 'resetworld' && !owner)) { this.systemChat(cmd === 'resetworld' ? 'Only the world owner can refresh the world.' : 'You do not have permission for that command.', 'error', s); return; }
    const words = rest.split(/\s+/).filter(Boolean);
    const cur = this.countdownState();
    if (!words.length) {
      if (cur) this.systemChat(`${cur.reset ? 'World refresh' : `"${cur.label}"`} in ${fmtSpan(cur.end - Date.now())}. Use /${cmd} cancel to stop it.`, 'info', s);
      else this.systemChat(cmd === 'resetworld' ? 'Usage: /resetworld <time> confirm (for example /resetworld 10m confirm). Players keep money and inventories; the map, homes, beds and builds are wiped.' : 'Usage: /countdown <time> [label], for example /countdown 5m Boss fight. /countdown cancel stops it.', 'info', s);
      return;
    }
    if (words[0].toLowerCase() === 'cancel') {
      if (!cur || (cmd === 'countdown' && cur.reset && !owner)) { this.systemChat('There is no countdown to cancel.', 'error', s); return; }
      this.setCountdown(null);
      this.systemChat(`${p.name} cancelled the ${cur.reset ? 'world refresh' : 'countdown'}.`, 'info');
      return;
    }
    const ms = parseSpan(words[0]);
    if (ms === null || ms < 5000 || ms > 7 * 86400000) { this.systemChat('Give a time from 5s to 7d, such as 30s, 10m, 1h30m or 2d.', 'error', s); return; }
    if (cur?.reset && !owner) { this.systemChat('A world refresh countdown is running; only the owner can replace it.', 'error', s); return; }
    if (cmd === 'resetworld') {
      if ((words[1] ?? '').toLowerCase() !== 'confirm') { this.systemChat(`This wipes the whole map, every build, home and bed. Money and inventories are kept. Type /resetworld ${words[0]} confirm to schedule it.`, 'error', s); return; }
      this.setCountdown({ end: Date.now() + ms, label: 'World refresh', reset: true, said: 1e12 });
      this.systemChat(`The world will be refreshed in ${fmtSpan(ms)}. Money and inventories are kept; homes and builds are not.`, 'info');
      return;
    }
    const label = cleanText(words.slice(1).join(' '), 40) || 'Countdown';
    this.setCountdown({ end: Date.now() + ms, label, reset: false, said: 1e12 });
    this.systemChat(`${label}: ${fmtSpan(ms)}.`, 'info');
  }

  private tickCountdown(now: number): void {
    const c = this.countdownState();
    if (!c) return;
    const left = Math.ceil((c.end - now) / 1000);
    if (left <= 0) {
      this.setCountdown(null);
      if (c.reset) { this.resetWorld(); return; }
      this.systemChat(`${c.label}: time is up!`, 'info');
      return;
    }
    const marks = [3600, 1800, 600, 300, 120, 60, 30, 10, 5, 4, 3, 2, 1];
    const mark = marks.find((x) => left <= x && x < (c.said ?? 1e12));
    if (mark !== undefined && left <= mark && left > mark - 2) {
      c.said = mark;
      this.systemChat(`${c.label} in ${fmtSpan(left * 1000)}.`, mark <= 10 ? 'error' : 'info');
    } else if (mark !== undefined) c.said = mark;
  }

  private resetWorld(): void {
    const m = this.meta!;
    for (const s of [...this.sessions.values()]) if (s.pid) this.send(s, { t: 'reset', msg: 'The world was refreshed. Rejoining the new world...' });
    for (const s of [...this.sessions.values()]) { this.handleLeave(s); try { s.ws.close(4006, 'World refreshed'); } catch { /* gone */ } }
    this.sessions.clear();
    if (this.pumpT !== null) clearTimeout(this.pumpT);
    this.pumpT = null;
    this.joinQueue = [];
    for (const t of ['chunks', 'be', 'genbe', 'genlv', 'gcache']) this.sql.exec(`DELETE FROM ${t}`);
    for (const k of ['spawn', 'genpts', 'oreSeed', 'countdown', 'pmobs', 'fixtures']) this.sql.exec(`DELETE FROM kv WHERE k = ?`, k);
    m.end = undefined;
    for (const row of this.sql.exec(`SELECT id, data FROM players`).toArray()) {
      let d: Record<string, unknown>;
      try { d = row.data ? JSON.parse(row.data as string) : {}; } catch { continue; }
      for (const k of ['x', 'y', 'z', 'spawn', 'anchor', 'homes', 'back', 'dead']) delete d[k];
      d.health = 20; d.food = 20; d.air = 300; d.fire = 0;
      this.sql.exec(`UPDATE players SET data = ? WHERE id = ?`, JSON.stringify(d), row.id as string);
    }
    m.seed = (Math.random() * 0xffffffff) >>> 0;
    m.genBase = GEN_LEVEL; m.time = 1000; m.weather = 'clear';
    this.sim = null; this.gen = null; this.levels = null; this.loaded = false; this.cd = null;
    this.cache.clear(); this.loadQueue = []; this.blockBatch = []; this.dirtyBE.clear();
    this.saveMeta();
    this.report(true);
  }

  private handleLeave(s: Session): void {
    this.sessions.delete(s.ws);
    if (!s.pid || !this.sim) return;
    const p = this.sim.players.get(s.pid);
    if (p) {
      this.sim.combatLog(p);
      this.sim.removePlayer(s.pid);
      this.savePlayer(p);
    }
    const wasVanished = p?.vanished;
    if (!wasVanished) {
      this.broadcast({ t: 'pq', id: s.pid, name: s.name });
      this.systemChat(`${s.name} left the world.`, 'leave');
    }
    s.pid = null;
    this.report(true);
    this.stopLoopIfIdle();
  }

  private onSimEvent(ev: SimEvent): void {
    switch (ev.e) {
      case 'block':
        this.blockBatch.push([ev.x, ev.y, ev.z, ev.v]);
        revealAround(this.peekGet, ev.x, ev.y, ev.z, this.blockBatch);
        return;
      case 'stats': this.eco.stats(ev.p); return;
      case 'reject': {
        const s = this.sessionFor(ev.p.id);
        if (s) this.send(s, { t: 'blk', u: [[ev.x, ev.y, ev.z, publicValue(this.peekGet, ev.x, ev.y, ev.z)]] });
        return;
      }
      case 'sound': {
        const msg: S2C = { t: 'snd', s: ev.s, x: q2(ev.x), y: q2(ev.y), z: q2(ev.z), v: ev.vol, p: ev.pitch };
        if (ev.to) { const s = this.sessionFor(ev.to); if (s) this.send(s, msg); return; }
        this.sendNear(ev.x, ev.z, 48, msg, ev.src);
        return;
      }
      case 'particles':
        this.sendNear(ev.x, ev.z, 48, { t: 'fx', k: ev.k, x: q2(ev.x), y: q2(ev.y), z: q2(ev.z), d: ev.d }, ev.src);
        return;
      case 'vitals': {
        const s = this.sessionFor(ev.p.id);
        if (s) this.send(s, { t: 'vit', h: ev.p.health, f: ev.p.food, s: Math.round(ev.p.sat * 10) / 10, a: ev.p.air, xp: ev.p.xp, dead: ev.p.dead, mode: ev.p.mode, fire: ev.p.fireT > 0, ab: ev.p.absorb || undefined });
        return;
      }
      case 'inv': {
        const s = this.sessionFor(ev.p.id);
        if (s) this.send(s, { t: 'inv', inv: ev.p.inv });
        return;
      }
      case 'container': {
        if (!ev.key.includes(',-64,')) this.dirtyBE.add(ev.key);
        for (const s of this.sessions.values()) {
          if (!s.pid) continue;
          const p = this.sim!.players.get(s.pid);
          if (!p || !p.screen.type) continue;
          const v = this.sim!.containerView(p);
          if (!v || !v.keys.includes(ev.key)) continue;
          this.send(s, v.type === 'furnace' ? { t: 'cont', k: v.key, type: 'furnace', items: v.items, burn: v.burn, burnMax: v.burnMax, cook: v.cook } : { t: 'cont', k: v.key, type: 'chest', items: v.items });
        }
        return;
      }
      case 'chestLid':
        this.sendNear(ev.x + 0.5, ev.z + 0.5, 64, { t: 'lid', x: ev.x, y: ev.y, z: ev.z, n: ev.n });
        return;
      case 'screen': {
        const s = this.sessionFor(ev.p.id);
        if (!s) return;
        const sc = ev.p.screen;
        this.send(s, { t: 'scr', type: sc.type, x: sc.x, y: sc.y, z: sc.z, title: ev.p.screenTitle });
        const v = this.sim!.containerView(ev.p);
        if (v) this.send(s, v.type === 'furnace' ? { t: 'cont', k: v.key, type: 'furnace', items: v.items, burn: v.burn, burnMax: v.burnMax, cook: v.cook } : { t: 'cont', k: v.key, type: 'chest', items: v.items });
        return;
      }
      case 'hurt': {
        const s = this.sessionFor(ev.p.id);
        if (s) this.send(s, { t: 'hurt', a: ev.amount, c: ev.cause, fx: q2(ev.fx), fz: q2(ev.fz), k: ev.kb });
        this.broadcast({ t: 'phurt', id: ev.p.id }, s);
        return;
      }
      case 'death': { const s = this.sessionFor(ev.p.id); if (s) this.send(s, { t: 'death', msg: ev.msg }); return; }
      case 'respawn': { const s = this.sessionFor(ev.p.id); if (s) this.send(s, { t: 'respawn', x: ev.p.x, y: ev.p.y, z: ev.p.z }); return; }
      case 'tp': { const s = this.sessionFor(ev.p.id); if (s) this.send(s, { t: 'tp', x: ev.p.x, y: ev.p.y, z: ev.p.z }); return; }
      case 'kick': {
        const pid = ev.p.id, reason = ev.reason, banMs = ev.banMs;
        setTimeout(() => {
          const t = this.sessionFor(pid);
          if (banMs > 0 && this.meta) this.setBan(pid, ev.p.name, banMs, 'Warden', reason);
          if (!t) return;
          this.sendErr(t, 'kicked', reason);
          this.handleLeave(t);
        }, 0);
        return;
      }
      case 'mode': {
        const s = this.sessionFor(ev.p.id);
        if (s) this.send(s, { t: 'mode', mode: ev.p.mode });
        this.broadcast({ t: 'pj', p: this.publicPlayer(ev.p) });
        return;
      }
      case 'msg':
        if (ev.to) { const s = this.sessionFor(ev.to); if (s) this.systemChat(ev.text, ev.kind, s); }
        else this.systemChat(ev.text, ev.kind);
        return;
      case 'lightning': this.broadcast({ t: 'bolt', x: q2(ev.x), y: q2(ev.y), z: q2(ev.z) }); return;
      case 'dark': { const s = this.sessionFor(ev.p.id); if (s) this.send(s, { t: 'dark', d: ev.t }); return; }
      case 'travel': { const s = this.sessionFor(ev.p.id); if (s) this.send(s, { t: 'trv', s: ev.phase === 'end' ? 1 : 0, n: ev.end ? 2 : ev.nether ? 1 : 0 }); return; }
      case 'effect': { const s = this.sessionFor(ev.p.id); if (s) this.send(s, { t: 'eff', k: ev.k, d: ev.t }); return; }
      case 'knock': { const s = this.sessionFor(ev.p.id); if (s) this.send(s, { t: 'knock', x: q2(ev.x), y: q2(ev.y), z: q2(ev.z), ...(ev.set ? { s: 1 } : {}) }); return; }
      case 'ride': { const s = this.sessionFor(ev.p.id); if (s) this.send(s, { t: 'ride', id: ev.id }); return; }
      case 'work': {
        const s = this.sessionFor(ev.p.id);
        if (!s) return;
        this.send(s, { t: 'cont', k: 'work', type: 'chest', items: ev.items });
        if (ev.offers) this.send(s, { t: 'eo', o: ev.offers });
        return;
      }
      case 'pmove': this.sendNear(ev.l[0], ev.l[2], 96, { t: 'pmove', l: ev.l }); return;
      case 'boom': this.sendNear(ev.x, ev.z, 128, { t: 'boom', x: q2(ev.x), y: q2(ev.y), z: q2(ev.z), r: ev.r }); return;
      case 'weather': this.broadcast({ t: 'wx', w: ev.w, d: ev.d }); return;
      case 'time': this.broadcast({ t: 'time', time: this.sim!.time, cycle: this.sim!.settings.dayCycle }); return;
      case 'rules': this.saveMeta(); this.broadcast({ t: 'rules', r: ruleSnapshot(this.sim!.settings) }); return;
      case 'crafted': { const s = this.sessionFor(ev.p.id); if (s) this.send(s, { t: 'crafted', r: ev.recipe.id, n: ev.times }); return; }
      case 'game': this.broadcast({ t: 'game', s: ev.state as never }); return;
      case 'mobname': this.broadcast({ t: 'mn', id: ev.id, n: ev.name }); return;
      case 'trade': { const s = this.sessionFor(ev.p.id); if (s) this.send(s, { t: 'trade', id: ev.v.id, prof: ev.v.prof ?? 0, xp: ev.v.vxp ?? 0, uses: [...(ev.v.uses ?? [])].map((u) => u ?? 0), seed: ev.v.tseed ?? 0 }); return; }
      case 'crucible': this.broadcast({ t: 'cru', s: ev.v }); return;
      case 'title': {
        const msg: S2C = { t: 'title', text: ev.text, sub: ev.sub };
        if (ev.to) { const s = this.sessionFor(ev.to); if (s) this.send(s, msg); } else this.broadcast(msg);
        return;
      }
      default: return;
    }
  }

  private sendNear(x: number, z: number, r: number, msg: S2C, exceptPid?: string): void {
    const data = JSON.stringify(msg);
    for (const s of this.sessions.values()) {
      if (!s.pid || s.pid === exceptPid) continue;
      const p = this.sim?.players.get(s.pid);
      if (!p || Math.abs(p.x - x) > r || Math.abs(p.z - z) > r) continue;
      try { s.ws.send(data); } catch { /* ignore */ }
    }
  }

  private tick(): void {
    if (!this.loadMeta()) return;
    this.ticks++;
    if (this.ticks % 200 === 0) this.report();
    const now = Date.now();
    for (const s of [...this.sessions.values()]) {
      if (!s.pid && (s.queuedAt ? now - s.queuedAt > 45000 : now - s.joinedAt > 15000)) { this.sendErr(s, 'invalid', s.queuedAt ? 'World is busy, please retry.' : 'Handshake timed out.'); this.sessions.delete(s.ws); }
      else if (s.pid && now - s.lastSeen > 30000) { try { s.ws.close(4010, 'Connection timed out'); } catch { /* ignore */ } this.handleLeave(s); }
    }
    if (!this.sessions.size) { this.stopLoopIfIdle(); return; }
    if (this.joinQueue.length) this.drainJoins(now);
    if (this.ticks % 10 === 3) { this.tickCountdown(now); if (!this.sim && !this.sessions.size) { this.stopLoopIfIdle(); return; } }
    const sim = this.ensureSim();
    if (this.ticks % 20 === 7) this.sendSharedPositions(sim);
    if (this.hasWork()) this.schedulePump();
    if (this.ticks % 200 === 0) this.eco.tick(now);
    if (this.ticks % 1200 === 600) for (const pp of sim.players.values()) if (!pp.vanished) this.eco.stats(pp);
    sim.setNow(now);
    sim.tick();
    this.flushBlocks();
    this.flushPlayers();
    if (this.ticks % (this.strain > 0 ? 4 : 2) === 0) this.flushEntities();
    this.saveSome(this.strain > 0 ? 4 : 12);
    if (now - this.lastFlush > 5000) this.flush(false);
  }

  private flushBlocks(): void {
    if (!this.blockBatch.length) return;
    const batch = this.blockBatch;
    this.blockBatch = [];
    for (const s of this.sessions.values()) {
      if (!s.pid) continue;
      const p = this.sim!.players.get(s.pid);
      if (!p) continue;
      const u = batch.filter((b) => Math.abs(b[0] - p.x) < BLOCK_BROADCAST && Math.abs(b[2] - p.z) < BLOCK_BROADCAST);
      for (let i = 0; i < u.length; i += 512) this.send(s, { t: 'blk', u: u.slice(i, i + 512) });
    }
  }

  private flushN = 0;

  private flushPlayers(): void {
    const sim = this.sim!;
    const full = ++this.flushN % 10 === 0;
    for (const s of this.sessions.values()) {
      if (!s.pid) continue;
      const me = sim.players.get(s.pid);
      const u: (string | number | number[])[][] = [];
      for (const p of sim.players.values()) {
        if (p.id === s.pid) continue;
        if (p.vanished && !s.op) continue;
        if (!full && me && Math.abs(p.x - me.x) + Math.abs(p.z - me.z) > 192) continue;
        const row = [p.id, q2(p.x), q2(p.y), q2(p.z), Math.round(p.yaw * 100) / 100, Math.round(p.pitch * 100) / 100, p.flags | (p.dead ? 1 << 14 : 0), Math.ceil(p.health), p.mode === 'creative' ? 1 : 0, equipmentOf(p.inv)];
        const key = row.slice(1).join(',');
        if (s.sentPlayers.get(p.id) === key) continue;
        s.sentPlayers.set(p.id, key);
        u.push(row);
      }
      if (u.length) this.send(s, { t: 'pl', u });
    }
  }

  private entRow(e: Entity): number[] {
    const type = entTypeCode(e);
    return [e.id, ENT_KIND[e.kind], type, q2(e.x), q2(e.y), q2(e.z), Math.round(e.yaw * 100) / 100, e.flags, entExtra(e)];
  }

  private flushEntities(): void {
    const sim = this.sim!;
    for (const s of this.sessions.values()) {
      if (!s.pid) continue;
      const p = sim.players.get(s.pid);
      if (!p) continue;
      const a: number[][] = [], u: number[][] = [], r: number[] = [];
      const seen = new Set<number>();
      for (const e of sim.entities.values()) {
        if ((Math.abs(e.x - p.x) > ENTITY_RANGE || Math.abs(e.z - p.z) > ENTITY_RANGE) && !(e.type === 'voidwyrm' && Math.abs(e.x - p.x) < 320 && Math.abs(e.z - p.z) < 320)) continue;
        seen.add(e.id);
        const row = this.entRow(e);
        const key = row.slice(3).join(',');
        const prev = s.sentEnts.get(e.id);
        if (prev === undefined) { a.push(row); s.sentEnts.set(e.id, key); }
        else if (prev !== key) { u.push([row[0], ...row.slice(3)]); s.sentEnts.set(e.id, key); }
      }
      for (const id of s.sentEnts.keys()) if (!seen.has(id)) { r.push(id); s.sentEnts.delete(id); }
      if (a.length || u.length || r.length) this.send(s, { t: 'ent', a, u, r });
    }
  }
}

export function blockIsAir(v: number): boolean { return blockId(v) === 0; }

function parseSpan(t: string): number | null {
  const v = t.toLowerCase();
  if (/^\d+$/.test(v)) return Number(v) * 1000;
  const m = /^(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(v);
  if (!m || !m.slice(1).some(Boolean)) return null;
  return (((Number(m[1] ?? 0) * 24 + Number(m[2] ?? 0)) * 60 + Number(m[3] ?? 0)) * 60 + Number(m[4] ?? 0)) * 1000;
}

function fmtSpan(ms: number): string {
  let s = Math.max(0, Math.round(ms / 1000));
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60); s -= m * 60;
  const out = [d && `${d}d`, h && `${h}h`, m && `${m}m`, s && `${s}s`].filter(Boolean);
  return out.length ? out.join(' ') : '0s';
}

export function newerBuild(a: string, b: string): boolean {
  const x = a.split('.').map((n) => parseInt(n, 10) || 0), y = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] ?? 0) - (y[i] ?? 0); if (d) return d > 0; }
  return false;
}

interface BanInfo { name: string; by: string; reason: string; at: number }
const PERMA = 8.64e15;
const BAN_CMDS = new Set(['ban', 'tempban', 'unban', 'pardon', 'banlist', 'bans']);



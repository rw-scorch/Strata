import { DurableObject } from 'cloudflare:workers';
import { CHUNK_SIZE, PROTOCOL_VERSION, MIN_PROTOCOL_VERSION, DEFAULT_MAX_PLAYERS, MAX_PLAYERS_LIMIT, DIFFICULTIES, Difficulty, GameMode } from '../../src/core/constants';
import { ChunkData, chunkKey, encodeRLE, decodeRLE, u16ToBase64 } from '../../src/core/chunk';
import { WorldGenerator } from '../../src/core/worldgen/WorldGenerator';
import { WorldSim, SimPlayer, SimEvent, WorldStore, newPlayer, posKey, Entity, BlockEntity } from '../../src/core/sim/WorldSim';
import { MOBS, MobType } from '../../src/core/sim/mobs';
import { Minigame } from '../../src/core/labs/minigames/Minigame';
import { isArenaKind } from '../../src/core/labs/minigames/arena';
import { B, blockId } from '../../src/core/blocks';
import { sanitizeInv, validateOp, invHash, validStack, cloneStack } from '../../src/core/inventory';
import {
  C2S, S2C, RoomMeta, RoomInfo, PublicPlayer, RoomSettings, PackRef, ENT_KIND, q2, isNum, isInt, cleanName, cleanText, cleanAppearance,
} from '../../src/core/protocol';

export interface Env {
  WORLD_ROOMS: DurableObjectNamespace<WorldRoom>;
  ASSETS: Fetcher;
  ADMIN_KEY?: string;
  ACCOUNTS?: DurableObjectNamespace;
}

interface StoredMeta extends RoomMeta { pvpV6?: boolean; rules?: { simDistance?: number; randomTickSpeed?: number; mobSpawning?: boolean; mobCap?: number }; ops?: { id: string; hash: string }[]; ownerHash: string; time: number; weather: string; dayCycle: boolean; muted: string[]; bans: Record<string, number>; }

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
}

interface Attachment { pid: string | null; name: string; op: boolean; }

const TICK_MS = 50;
const SIM_RADIUS = 4;
const BLOCK_BROADCAST = 16 * 16;
const ENTITY_RANGE = 96;
const MAX_CACHE = 450;

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function defaultSettings(): RoomSettings { return { pvp: true, guestsBuild: true, cheats: false, personalPacks: true }; }

export class WorldRoom extends DurableObject<Env> {
  private sql: SqlStorage;
  private meta: StoredMeta | null = null;
  private sim: WorldSim | null = null;
  private gen: WorldGenerator | null = null;
  private cache = new Map<string, { c: ChunkData; dirty: boolean; used: number }>();
  private sessions = new Map<WebSocket, Session>();
  private loop: ReturnType<typeof setInterval> | null = null;
  private loadQueue: string[] = [];
  private blockBatch: number[][] = [];
  private dirtyBE = new Set<string>();
  private lastFlush = 0;
  private ticks = 0;
  private loaded = false;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS chunks (k TEXT PRIMARY KEY, d BLOB)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, secret TEXT, data TEXT)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS be (k TEXT PRIMARY KEY, data TEXT)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS genbe (k TEXT PRIMARY KEY)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT)`);
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as Attachment | null;
      this.sessions.set(ws, this.newSession(ws, a));
    }
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
    const row = this.sql.exec(`SELECT v FROM kv WHERE k = 'meta'`).toArray()[0];
    if (!row) return null;
    this.meta = JSON.parse(row.v as string) as StoredMeta;
    return this.meta;
  }

  private saveMeta(): void {
    if (!this.meta) return;
    if (this.sim) { this.meta.time = this.sim.time; this.meta.weather = this.sim.weather; this.meta.dayCycle = this.sim.settings.dayCycle; const st = this.sim.settings; this.meta.rules = { simDistance: st.simDistance, randomTickSpeed: st.randomTickSpeed, mobSpawning: st.mobSpawning, mobCap: st.mobCap }; }
    this.sql.exec(`INSERT OR REPLACE INTO kv (k, v) VALUES ('meta', ?)`, JSON.stringify(this.meta));
  }

  private publicMeta(): RoomMeta {
    const m = this.meta!;
    return {
      code: m.code, name: m.name, ownerId: m.ownerId, ownerName: m.ownerName, mode: m.mode, difficulty: m.difficulty,
      maxPlayers: m.maxPlayers, seed: m.seed, createdAt: m.createdAt, version: PROTOCOL_VERSION, pack: m.pack, settings: m.settings, region: m.region, arena: m.arena ?? null,
    };
  }

  private ensureSim(): WorldSim {
    if (this.sim) return this.sim;
    const m = this.loadMeta()!;
    if (m.arena) { this.sql.exec('DELETE FROM chunks'); this.cache.clear(); }
    this.gen = new WorldGenerator(m.seed, m.arena ?? null);
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
      raw: (cx, cz) => this.cache.get(chunkKey(cx, cz))?.c.blocks ?? null,
    };
    const spawnRow = this.sql.exec(`SELECT v FROM kv WHERE k = 'spawn'`).toArray()[0];
    const spawn = spawnRow ? JSON.parse(spawnRow.v as string) : this.gen.findSpawn();
    if (!spawnRow) this.sql.exec(`INSERT OR REPLACE INTO kv (k, v) VALUES ('spawn', ?)`, JSON.stringify(spawn));
    this.sim = new WorldSim({
      seed: m.seed, store, gen: this.gen, difficulty: m.difficulty, emit: (ev) => this.onSimEvent(ev),
      validateMoves: true, authoritative: true, spawn,
    });
    this.sim.time = m.time ?? 1000;
    this.sim.weather = (m.weather as 'clear') ?? 'clear';
    this.sim.settings = { pvp: m.settings.pvp, cheats: m.settings.cheats, guestsBuild: m.settings.guestsBuild, dayCycle: m.dayCycle ?? true, weatherCycle: true, ...(m.rules ?? {}) };
    if (!m.pvpV6) { m.settings.pvp = true; m.pvpV6 = true; this.sim.settings.pvp = true; this.saveMeta(); }
    if (!this.loaded) {
      for (const row of this.sql.exec(`SELECT k, data FROM be`).toArray()) {
        try {
          const be = JSON.parse(row.data as string) as BlockEntity;
          be.items = be.items.map((s) => (validStack(s) ? cloneStack(s) : null));
          this.sim.blockEntities.set(row.k as string, be);
          if (be.type === 'furnace') this.sim.activeFurnaces.add(row.k as string);
        } catch { /* skip corrupt */ }
      }
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
      const g = this.gen!.generate(cx, cz);
      c = new ChunkData(cx, cz, g.blocks);
      if (g.entities.length && this.sim) {
        const done = this.sql.exec(`SELECT k FROM genbe WHERE k = ?`, k).toArray().length > 0;
        if (!done) {
          for (const e of g.entities) {
            const wx = cx * 16 + e.x, wz = cz * 16 + e.z;
            this.sim.addGeneratedChest(wx, e.y, wz, e.items);
            this.dirtyBE.add(posKey(wx, e.y, wz));
          }
          this.sql.exec(`INSERT OR REPLACE INTO genbe (k) VALUES (?)`, k);
        }
      }
    }
    this.cache.set(k, { c, dirty: false, used: this.ticks });
    if (this.cache.size > MAX_CACHE) this.evict();
    return c;
  }

  private evict(): void {
    const needed = new Set<string>();
    for (const p of this.sim?.players.values() ?? []) {
      const pcx = Math.floor(p.x / 16), pcz = Math.floor(p.z / 16);
      for (let dz = -SIM_RADIUS; dz <= SIM_RADIUS; dz++) for (let dx = -SIM_RADIUS; dx <= SIM_RADIUS; dx++) needed.add(chunkKey(pcx + dx, pcz + dz));
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

  private flush(): void {
    for (const [k, e] of this.cache) if (e.dirty) { this.writeChunk(k, e.c); e.dirty = false; }
    if (this.sim) {
      for (const k of this.dirtyBE) {
        const be = this.sim.blockEntities.get(k);
        if (be) this.sql.exec(`INSERT OR REPLACE INTO be (k, data) VALUES (?, ?)`, k, JSON.stringify(be));
        else this.sql.exec(`DELETE FROM be WHERE k = ?`, k);
      }
      this.dirtyBE.clear();
      for (const p of this.sim.players.values()) this.savePlayer(p);
    }
    this.saveMeta();
    this.lastFlush = Date.now();
  }

  private savePlayer(p: SimPlayer): void {
    const data = {
      name: p.name, appearance: p.appearance, x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, mode: p.mode, inv: p.inv,
      health: p.health, food: p.food, sat: p.sat, air: p.air, xp: p.xp, dead: p.dead, spawn: p.spawn,
    };
    this.sql.exec(`UPDATE players SET data = ? WHERE id = ?`, JSON.stringify(data), p.id);
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/init' && req.method === 'POST') return this.handleInit(req);
    if (url.pathname === '/info') return Response.json(this.info());
    if (url.pathname === '/delete' && req.method === 'POST') return this.handleDelete(req);
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
    return { exists: true, code: m.code, name: m.name, ownerName: m.ownerName, mode: m.mode, difficulty: m.difficulty, maxPlayers: m.maxPlayers, players, version: PROTOCOL_VERSION, pack: m.pack, arena: m.arena ?? null };
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
    this.meta = {
      code, name: cleanText(body.name, 32) || 'Untitled World', ownerId, ownerName: cleanName(body.ownerName), mode, difficulty, maxPlayers, seed,
      createdAt: Date.now(), version: PROTOCOL_VERSION,
      pack: pack && typeof pack.hash === 'string' ? { name: cleanText(pack.name, 40), hash: cleanText(pack.hash, 80) } : null,
      arena, ops: [],
      pvpV6: true,
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
    if (this.loop) clearInterval(this.loop);
    this.loop = null;
    this.sessions.clear();
    this.cache.clear();
    this.sim = null;
    this.meta = null;
    await this.ctx.storage.deleteAll();
    return Response.json({ ok: true });
  }

  private startLoop(): void {
    if (this.loop) return;
    this.loop = setInterval(() => {
      try { this.tick(); } catch (err) { console.error('tick error', err); }
    }, TICK_MS);
  }

  private stopLoopIfIdle(): void {
    const active = [...this.sessions.values()].some((s) => s.pid);
    if (!active && this.sessions.size === 0 && this.loop) {
      clearInterval(this.loop);
      this.loop = null;
      if (this.sim) this.flush();
      for (const [k, e] of this.cache) if (!e.dirty) this.cache.delete(k);
    }
  }

  private send(s: Session, msg: S2C): void {
    try { s.ws.send(JSON.stringify(msg)); } catch { /* socket gone */ }
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
    return { id: p.id, name: p.name, appearance: p.appearance, op: p.op, mode: p.mode, muted: this.meta?.muted.includes(p.id) };
  }

  private systemChat(text: string, kind: Extract<S2C, { t: 'chat' }>['kind'] = 'system', to?: Session): void {
    const msg: S2C = { t: 'chat', from: null, text, kind, ts: Date.now() };
    if (to) this.send(to, msg); else this.broadcast(msg);
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    let s = this.sessions.get(ws);
    if (!s) { s = this.newSession(ws, ws.deserializeAttachment() as Attachment | null); this.sessions.set(ws, s); }
    if (typeof raw !== 'string' || raw.length > 65536) { s.strikes++; return; }
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
    if (msg.t === 'hello') { await this.handleHello(s, msg); return; }
    if (msg.t === 'ping') { if (isNum(msg.c)) this.send(s, { t: 'pong', c: msg.c, s: now }); return; }
    if (!s.pid) return;
    const sim = this.ensureSim();
    let p = sim.players.get(s.pid);
    if (!p) { p = this.restorePlayer(s); if (!p) return; }
    sim.setNow(now);
    this.handleGame(s, p, msg, sim);
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
    if (ban && ban > Date.now()) { this.sendErr(s, 'banned', 'You were removed from this world. Try again later.'); return; }
    const existing = this.sessionFor(id);
    const others = [...this.sessions.values()].filter((o) => o.pid && o.pid !== id).length;
    if (others >= m.maxPlayers) { this.sendErr(s, 'full', `This world is full (${m.maxPlayers} players).`); return; }
    const hash = await sha256(secret);
    const row = this.sql.exec(`SELECT secret, data FROM players WHERE id = ?`, id).toArray()[0];
    if (row && row.secret !== hash) { this.sendErr(s, 'auth', 'That player identity belongs to someone else.'); return; }
    if (existing) {
      this.sendErr(existing, 'duplicate', 'You joined from another tab or device.');
      this.sessions.delete(existing.ws);
      this.sim?.removePlayer(id);
    }
    let name = cleanName(msg.name);
    if (this.env.ACCOUNTS) {
      try {
        const acc = this.env.ACCOUNTS.get(this.env.ACCOUNTS.idFromName('global'));
        const r = (await (await acc.fetch(`https://accounts/check?name=${encodeURIComponent(name)}&pid=${encodeURIComponent(id)}`)).json()) as { registered: boolean; owner: boolean; name: string | null };
        if (r.registered && !r.owner) name = `~${name}`.slice(0, 16);
        else if (r.owner && r.name) name = r.name;
      } catch { /* accounts unavailable: keep the requested name */ }
    }
    if (!row) this.sql.exec(`INSERT INTO players (id, secret, data) VALUES (?, ?, ?)`, id, hash, '');
    const sim = this.ensureSim();
    sim.setNow(Date.now());
    const p = this.playerFromData(id, name, row && row.data ? JSON.parse(row.data as string) : null);
    p.appearance = cleanAppearance(msg.appearance);
    p.op = (id === m.ownerId && hash === m.ownerHash) || !!m.ops?.some((o) => o.id === id && o.hash === hash);
    s.hash = hash;
    const pcx = Math.floor(p.x / 16), pcz = Math.floor(p.z / 16);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) this.getChunk(pcx + dx, pcz + dz);
    sim.addPlayer(p);
    this.savePlayer(p);
    s.pid = id; s.name = name; s.op = p.op;
    s.ws.serializeAttachment({ pid: id, name, op: p.op } satisfies Attachment);
    this.queueChunks(s, p);
    const players = [...sim.players.values()].map((x) => this.publicPlayer(x));
    this.send(s, {
      t: 'welcome', room: this.publicMeta(), players, time: sim.time, cycle: sim.settings.dayCycle, weather: sim.weather, worldSpawn: sim.spawn,
      you: { id, x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, mode: p.mode, inv: p.inv, health: p.health, food: p.food, sat: p.sat, air: p.air, xp: p.xp, dead: p.dead, spawn: p.spawn, op: p.op },
    });
    this.broadcast({ t: 'pj', p: this.publicPlayer(p) }, s);
    this.systemChat(`${name} joined the world.`, 'join');
  }

  private queueChunks(s: Session, p: SimPlayer): void {
    const cx = Math.floor(p.x / 16), cz = Math.floor(p.z / 16);
    if (cx === s.chunkCX && cz === s.chunkCZ) return;
    s.chunkCX = cx; s.chunkCZ = cz;
    for (let r = 0; r <= SIM_RADIUS; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      const k = chunkKey(cx + dx, cz + dz);
      if (!this.cache.has(k)) this.loadQueue.push(k);
    }
  }

  private handleGame(s: Session, p: SimPlayer, msg: C2S, sim: WorldSim): void {
    switch (msg.t) {
      case 'mv': {
        const a = msg.p;
        if (!Array.isArray(a) || a.length < 6 || !a.every((n) => isNum(n))) { s.strikes++; return; }
        if (sim.move(p, a[0], a[1], a[2], a[3], a[4], a[5] | 0)) this.queueChunks(s, p);
        return;
      }
      case 'chunks': {
        if (!Array.isArray(msg.want) || msg.want.length > 64) { s.strikes++; return; }
        for (const w of msg.want) {
          if (!Array.isArray(w) || !isInt(w[0], -2e6, 2e6) || !isInt(w[1], -2e6, 2e6)) continue;
          const [cx, cz] = w;
          if (Math.max(Math.abs(cx - Math.floor(p.x / 16)), Math.abs(cz - Math.floor(p.z / 16))) > 20) continue;
          const k = chunkKey(cx, cz);
          const e = this.cache.get(k);
          let d: string | null = null;
          if (e) { if (e.c.modified) d = u16ToBase64(encodeRLE(e.c.blocks)); }
          else {
            const row = this.sql.exec(`SELECT d FROM chunks WHERE k = ?`, k).toArray()[0];
            if (row) {
              const bytes = new Uint8Array(row.d as ArrayBuffer);
              d = u16ToBase64(new Uint16Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)));
            }
          }
          this.send(s, { t: 'chunk', cx, cz, d });
        }
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
        sim.use(p, msg.x, msg.y, msg.z, msg.nx, msg.ny, msg.nz, msg.f === 1);
        return;
      }
      case 'eat': sim.eat(p); return;
      case 'sw': sim.swing(p); return;
      case 'bow': if (typeof msg.p === 'number' && typeof msg.y === 'number' && typeof msg.x === 'number') sim.shootBow(p, msg.p, msg.y, msg.x); return;
      case 'atk': if (isInt(msg.id, 0, 1e9)) sim.attack(p, msg.id); return;
      case 'ue': if (isInt(msg.id, 0, 1e9)) sim.useEntity(p, msg.id); return;
      case 'trd': if (isInt(msg.id, 0, 1e9) && isInt(msg.i, 0, 64) && isInt(msg.n, 1, 64)) sim.trade(p, msg.id, msg.i, msg.n); return;
      case 'pvp': if (typeof msg.pid === 'string') sim.attackPlayer(p, msg.pid); return;
      case 'inv': {
        const op = validateOp(msg.op);
        if (!op || !isInt(msg.s, 0, 1e9)) { s.strikes++; return; }
        const r = sim.invOp(p, op);
        this.send(s, { t: 'ack', s: msg.s, ok: r.ok, h: r.hash });
        return;
      }
      case 'resync': {
        this.send(s, { t: 'inv', inv: p.inv });
        this.send(s, { t: 'vit', h: p.health, f: p.food, s: p.sat, a: p.air, xp: p.xp, dead: p.dead, mode: p.mode });
        return;
      }
      case 'respawn': sim.respawn(p); return;
      case 'buy': if (typeof msg.k === 'string') sim.buy(p, msg.k); return;
      case 'chat': this.handleChat(s, p, msg.text, sim); return;
      case 'room': this.handleRoomUpdate(s, p, msg); return;
      case 'kick': this.kick(s, msg.pid, 'kicked'); return;
      case 'mute': this.mute(s, msg.pid, !!msg.on); return;
    }
  }

  private handleChat(s: Session, p: SimPlayer, raw: unknown, sim: WorldSim): void {
    const text = cleanText(raw, 200);
    if (!text) return;
    const now = Date.now();
    s.chatBurst = Math.min(4, s.chatBurst + (now - s.chatT) / 900);
    s.chatT = now;
    if (s.chatBurst < 1) { this.systemChat('You are sending messages too quickly.', 'error', s); return; }
    s.chatBurst -= 1;
    if (text.startsWith('/')) {
      const [cmd, arg] = text.slice(1).split(/\s+/, 2);
      const lc = cmd.toLowerCase();
      if (lc === 'admin') { void this.claimAdmin(s, p, arg ?? ''); return; }
      if (lc === 'op' || lc === 'deop') { this.setOp(s, p, arg ?? '', lc === 'op', sim); return; }
      if (lc === 'list') { this.systemChat(`Online: ${[...sim.players.values()].map((x) => x.name).join(', ')}`, 'info', s); return; }
      if (lc === 'kick' || lc === 'mute' || lc === 'unmute') {
        const target = [...sim.players.values()].find((x) => x.name.toLowerCase() === (arg ?? '').toLowerCase());
        if (!target) { this.systemChat(`No player named ${arg}.`, 'error', s); return; }
        if (lc === 'kick') this.kick(s, target.id, 'kicked'); else this.mute(s, target.id, lc === 'mute');
        return;
      }
      const out = sim.command(p, text);
      if (out) this.systemChat(out, out.startsWith('Unknown') || out.startsWith('You do not') ? 'error' : 'info', s);
      return;
    }
    if (this.meta!.muted.includes(p.id)) { this.systemChat('You are muted in this world.', 'error', s); return; }
    if (text === s.lastChat && now - s.chatT < 3000) return;
    s.lastChat = text;
    this.broadcast({ t: 'chat', from: { id: p.id, name: p.name }, text, kind: 'chat', ts: now });
  }

  private async claimAdmin(s: Session, p: SimPlayer, key: string): Promise<void> {
    if (p.op) { this.systemChat('You already have admin rights in this world.', 'info', s); return; }
    const secret = this.env.ADMIN_KEY;
    if (!secret) { this.systemChat('This server has no admin key set. The world owner can grant admin with /op <name>.', 'error', s); return; }
    const now = Date.now();
    if (now - (s.adminT ?? 0) > 60000) { s.adminTries = 0; s.adminT = now; }
    s.adminTries = (s.adminTries ?? 0) + 1;
    if (s.adminTries > 3) { this.systemChat('Too many attempts. Wait a minute and try again.', 'error', s); return; }
    const [a, b] = await Promise.all([sha256(key), sha256(secret)]);
    let diff = a.length ^ b.length;
    for (let i = 0; i < Math.min(a.length, b.length); i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    if (diff !== 0 || !key) { this.systemChat('That admin key is not correct.', 'error', s); return; }
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
    this.send(s, { t: 'room', room: this.publicMeta(), players: [...this.sim!.players.values()].map((x) => this.publicPlayer(x)) });
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
      if (typeof st.guestsBuild === 'boolean') m.settings.guestsBuild = st.guestsBuild;
      if (typeof st.cheats === 'boolean') m.settings.cheats = st.cheats;
      if (typeof st.personalPacks === 'boolean') m.settings.personalPacks = st.personalPacks;
      Object.assign(this.sim!.settings, { pvp: m.settings.pvp, guestsBuild: m.settings.guestsBuild, cheats: m.settings.cheats });
    }
    if (msg.pack === null) m.pack = null;
    else if (msg.pack && typeof msg.pack.hash === 'string') m.pack = { name: cleanText(msg.pack.name, 40), hash: cleanText(msg.pack.hash, 80) };
    this.saveMeta();
    this.broadcast({ t: 'room', room: this.publicMeta(), players: [...this.sim!.players.values()].map((x) => this.publicPlayer(x)) });
    this.systemChat('World settings were updated by the owner.');
  }

  private kick(s: Session, pid: unknown, _why: string): void {
    if (!s.op) { this.systemChat('Only the world owner can remove players.', 'error', s); return; }
    if (typeof pid !== 'string' || pid === s.pid) return;
    const t = this.sessionFor(pid);
    if (!t) return;
    this.meta!.bans[pid] = Date.now() + 10 * 60 * 1000;
    this.saveMeta();
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

  private handleLeave(s: Session): void {
    this.sessions.delete(s.ws);
    if (!s.pid || !this.sim) return;
    const p = this.sim.players.get(s.pid);
    if (p) {
      this.sim.removePlayer(s.pid);
      this.savePlayer(p);
    }
    this.broadcast({ t: 'pq', id: s.pid, name: s.name });
    this.systemChat(`${s.name} left the world.`, 'leave');
    s.pid = null;
    this.stopLoopIfIdle();
  }

  private onSimEvent(ev: SimEvent): void {
    switch (ev.e) {
      case 'block':
        this.blockBatch.push([ev.x, ev.y, ev.z, ev.v]);
        return;
      case 'reject': {
        const s = this.sessionFor(ev.p.id);
        if (s) this.send(s, { t: 'blk', u: [[ev.x, ev.y, ev.z, this.sim!.get(ev.x, ev.y, ev.z)]] });
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
        if (s) this.send(s, { t: 'vit', h: ev.p.health, f: ev.p.food, s: Math.round(ev.p.sat * 10) / 10, a: ev.p.air, xp: ev.p.xp, dead: ev.p.dead, mode: ev.p.mode, fire: ev.p.fireT > 0 });
        return;
      }
      case 'inv': {
        const s = this.sessionFor(ev.p.id);
        if (s) this.send(s, { t: 'inv', inv: ev.p.inv });
        return;
      }
      case 'container': {
        this.dirtyBE.add(ev.key);
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
        this.send(s, { t: 'scr', type: sc.type, x: sc.x, y: sc.y, z: sc.z });
        const v = this.sim!.containerView(ev.p);
        if (v) this.send(s, v.type === 'furnace' ? { t: 'cont', k: v.key, type: 'furnace', items: v.items, burn: v.burn, burnMax: v.burnMax, cook: v.cook } : { t: 'cont', k: v.key, type: 'chest', items: v.items });
        return;
      }
      case 'hurt': {
        const s = this.sessionFor(ev.p.id);
        if (s) this.send(s, { t: 'hurt', a: ev.amount, c: ev.cause, fx: q2(ev.fx), fz: q2(ev.fz), k: ev.kb });
        return;
      }
      case 'death': { const s = this.sessionFor(ev.p.id); if (s) this.send(s, { t: 'death', msg: ev.msg }); return; }
      case 'respawn': { const s = this.sessionFor(ev.p.id); if (s) this.send(s, { t: 'respawn', x: ev.p.x, y: ev.p.y, z: ev.p.z }); return; }
      case 'tp': { const s = this.sessionFor(ev.p.id); if (s) this.send(s, { t: 'tp', x: ev.p.x, y: ev.p.y, z: ev.p.z }); return; }
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
      case 'weather': this.broadcast({ t: 'wx', w: ev.w }); return;
      case 'time': this.broadcast({ t: 'time', time: this.sim!.time, cycle: this.sim!.settings.dayCycle }); return;
      case 'rules': this.saveMeta(); return;
      case 'crafted': { const s = this.sessionFor(ev.p.id); if (s) this.send(s, { t: 'crafted', r: ev.recipe.id, n: ev.times }); return; }
      case 'game': this.broadcast({ t: 'game', s: ev.state as never }); return;
      case 'trade': { const s = this.sessionFor(ev.p.id); if (s) this.send(s, { t: 'trade', id: ev.v.id, prof: ev.v.prof ?? 0, xp: ev.v.vxp ?? 0, uses: [...(ev.v.uses ?? [])].map((u) => u ?? 0) }); return; }
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
    const now = Date.now();
    for (const s of [...this.sessions.values()]) {
      if (!s.pid && now - s.joinedAt > 15000) { this.sendErr(s, 'invalid', 'Handshake timed out.'); this.sessions.delete(s.ws); }
      else if (s.pid && now - s.lastSeen > 30000) { try { s.ws.close(4010, 'Connection timed out'); } catch { /* ignore */ } this.handleLeave(s); }
    }
    if (!this.sessions.size) { this.stopLoopIfIdle(); return; }
    const sim = this.ensureSim();
    let loads = 0;
    while (this.loadQueue.length && loads < 4) {
      const k = this.loadQueue.shift()!;
      if (this.cache.has(k)) continue;
      const [cx, cz] = k.split(',').map(Number);
      this.getChunk(cx, cz);
      loads++;
    }
    sim.setNow(now);
    sim.tick();
    this.flushBlocks();
    this.flushPlayers();
    if (this.ticks % 2 === 0) this.flushEntities();
    if (now - this.lastFlush > 10000) this.flush();
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

  private flushPlayers(): void {
    const sim = this.sim!;
    for (const s of this.sessions.values()) {
      if (!s.pid) continue;
      const u: (string | number)[][] = [];
      for (const p of sim.players.values()) {
        if (p.id === s.pid) continue;
        const row = [p.id, q2(p.x), q2(p.y), q2(p.z), Math.round(p.yaw * 100) / 100, Math.round(p.pitch * 100) / 100, p.flags | (p.dead ? 1 << 14 : 0)];
        const key = row.slice(1).join(',');
        if (s.sentPlayers.get(p.id) === key) continue;
        s.sentPlayers.set(p.id, key);
        u.push(row);
      }
      if (u.length) this.send(s, { t: 'pl', u });
    }
  }

  private entRow(e: Entity): number[] {
    const type = e.kind === 'mob' ? MOBS[e.type as MobType].code : e.kind === 'item' ? e.item!.id : 0;
    return [e.id, ENT_KIND[e.kind], type, q2(e.x), q2(e.y), q2(e.z), Math.round(e.yaw * 100) / 100, e.flags, e.kind === 'item' ? e.item!.count : Math.ceil(e.health)];
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
        if (Math.abs(e.x - p.x) > ENTITY_RANGE || Math.abs(e.z - p.z) > ENTITY_RANGE) continue;
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

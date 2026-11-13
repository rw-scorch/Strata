import { loadCustomSkin } from '../resources/skins';
import { PROTOCOL_VERSION, GameMode } from '../core/constants';
import { WorldSim, SimPlayer, newPlayer, BlockEntity, Appearance, Weather } from '../core/sim/WorldSim';
import { WorldGenerator } from '../core/worldgen/WorldGenerator';
import { sanitizeInv, InvOp, invHash, validStack, cloneStack } from '../core/inventory';
import { cleanPackList } from '../core/datapack';
import type { DataRecipes } from '../core/crafting';
import { decodeRLE, base64ToU16 } from '../core/chunk';
import type { C2S, S2C, RoomMeta, PublicPlayer } from '../core/protocol';
import type { GameSession, SessionEvents, SessionInfo } from '../game/Session';
import type { ChunkManager } from '../game/ChunkManager';
import type { Identity } from '../storage/Settings';

const FATAL = new Set(['kicked', 'banned', 'auth', 'version', 'unavailable', 'full', 'duplicate']);
const KIND = ['mob', 'item', 'arrow', 'tnt'] as const;

export function wsURL(code: string): string {
  const base = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (base) return `${base.replace(/^http/, 'ws').replace(/\/$/, '')}/ws/${code}`;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws/${code}`;
}

export function apiURL(path: string): string {
  const base = import.meta.env.VITE_SERVER_URL as string | undefined;
  return `${(base ?? '').replace(/\/$/, '')}${path}`;
}

export class RemoteSession implements GameSession {
  info!: SessionInfo;
  sim!: WorldSim;
  me!: SimPlayer;
  room!: RoomMeta;
  players = new Map<string, PublicPlayer>();
  private ws: WebSocket | null = null;
  private ev: SessionEvents | null = null;
  private code: string;
  private id: Identity;
  private name: string;
  private appearance: Appearance;
  private closed = false;
  private attempts = 0;
  private lastMoveSent = 0;
  private lastMoveKey = '';
  private moveState: number[] | null = null;
  private seq = 1;
  private expected = new Map<number, number>();
  private lastPing = 0;
  rtt = 0;
  private inCount = 0;
  private outCount = 0;
  private rateT = 0;
  inRate = 0;
  outRate = 0;
  state: 'connecting' | 'online' | 'reconnecting' | 'offline' = 'connecting';
  private entKinds = new Map<number, [number, number]>();
  private welcomeWaiter: ((w: Extract<S2C, { t: 'welcome' }>) => void) | null = null;
  private errorWaiter: ((e: Error) => void) | null = null;
  lastError = '';
  private chunks: ChunkManager | null = null;
  private earlyChunks: Extract<S2C, { t: 'chunk' }>[] = [];
  private chunkReqs: number[][] = [];

  constructor(code: string, id: Identity, name: string, appearance: Appearance) {
    this.code = code; this.id = id; this.name = name; this.appearance = appearance;
  }

  connect(): Promise<Extract<S2C, { t: 'welcome' }>> {
    return new Promise((resolve, reject) => {
      this.welcomeWaiter = (w) => { try { sessionStorage.removeItem('strata.vreload'); } catch { /* ignore */ } resolve(w); };
      this.errorWaiter = reject;
      this.open();
      setTimeout(() => { if (this.welcomeWaiter) { this.welcomeWaiter = null; this.errorWaiter = null; this.closed = true; this.ws?.close(); reject(new Error('Connection timed out. Check the room code and your network.')); } }, 15000);
    });
  }

  private open(): void {
    this.state = this.attempts ? 'reconnecting' : 'connecting';
    this.ev?.connection(this.state);
    let ws: WebSocket;
    try { ws = new WebSocket(wsURL(this.code)); } catch (e) { this.fail(new Error('Could not open a connection.')); return; }
    this.ws = ws;
    ws.onopen = () => {
      let spec: { code?: string; key?: string; at?: string } = {};
      try { spec = JSON.parse(sessionStorage.getItem('strata.spectate') ?? '{}'); } catch { /* none */ }
      const admin = spec.code === this.code && spec.key ? { admin: spec.key, at: spec.at } : {};
      this.send({ t: 'hello', v: PROTOCOL_VERSION, id: this.id.id, secret: this.id.secret, name: this.name, appearance: this.appearance, skin: loadCustomSkin(), ...admin });
    };
    ws.onmessage = (e) => {
      this.inCount++;
      let m: S2C;
      try { m = JSON.parse(e.data as string) as S2C; } catch { return; }
      this.handle(m);
    };
    ws.onclose = (e) => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.closed) return;
      if (this.lastErrorCode === 'version') {
        try {
          if (!sessionStorage.getItem('strata.vreload')) { sessionStorage.setItem('strata.vreload', '1'); void navigator.serviceWorker?.getRegistration().then((r) => r?.update()).finally(() => location.reload()); return; }
        } catch { /* storage blocked */ }
      }
      if (this.welcomeWaiter) { this.fail(new Error(this.lastError || `Connection failed (code ${e.code}).`)); return; }
      if (FATAL.has(this.lastErrorCode) || this.attempts >= 12) {
        this.state = 'offline';
        this.ev?.connection('offline', this.lastError || 'Disconnected from the world.');
        return;
      }
      this.attempts++;
      this.state = 'reconnecting';
      this.ev?.connection('reconnecting', `Reconnecting (attempt ${this.attempts})...`);
      setTimeout(() => { if (!this.closed) this.open(); }, Math.min(10000, 800 * 2 ** (this.attempts - 1)));
    };
    ws.onerror = () => { /* close handler follows */ };
  }

  private lastErrorCode = '';

  private fail(e: Error): void {
    const rej = this.errorWaiter;
    this.welcomeWaiter = null;
    this.errorWaiter = null;
    this.closed = true;
    rej?.(e);
  }

  private send(m: C2S): void {
    if (this.ws?.readyState === WebSocket.OPEN) { this.ws.send(JSON.stringify(m)); this.outCount++; }
  }

  attach(chunks: ChunkManager, ev: SessionEvents, w: Extract<S2C, { t: 'welcome' }>): void {
    this.chunks = chunks;
    this.ev = ev;
    this.applyWelcome(w, true);
    for (const c of this.earlyChunks) this.handle(c);
    this.earlyChunks = [];
  }

  private applyWelcome(w: Extract<S2C, { t: 'welcome' }>, first: boolean): void {
    this.room = w.room;
    if (first) {
      this.sim = new WorldSim({
        seed: w.room.seed, store: this.chunks!, gen: new WorldGenerator(w.room.seed, w.room.arena ?? null, { secret: null }), difficulty: w.room.difficulty, emit: (e) => {
          if (e.e === 'sound' && e.src && e.src === this.me?.id) this.ev?.sound(e.s, e.x, e.y, e.z, e.vol, e.pitch);
          else if (e.e === 'particles' && e.src && e.src === this.me?.id) this.ev?.fx(e.k, e.x, e.y, e.z, e.d);
        },
        validateMoves: false, authoritative: false, spawn: w.worldSpawn,
      });
      this.me = newPlayer(w.you.id, this.name, w.you.mode, w.you.spawn);
      this.me.appearance = this.appearance;
      this.sim.addPlayer(this.me);
    }
    const y = w.you;
    Object.assign(this.me, { x: y.x, y: y.y, z: y.z, yaw: y.yaw, pitch: y.pitch, mode: y.mode, health: y.health, food: y.food, sat: y.sat, air: y.air, xp: y.xp, dead: y.dead, spawn: y.spawn, op: y.op });
    this.me.inv = sanitizeInv(y.inv);
    this.sim.time = w.time;
    this.sim.settings.dayCycle = w.cycle;
    this.sim.weather = w.weather as Weather;
    this.sim.settings.pvp = w.room.settings.pvp;
    this.sim.settings.guestsBuild = w.room.settings.guestsBuild;
    this.sim.settings.cheats = w.room.settings.cheats;
    if (w.rules) { Object.assign(this.sim.settings, w.rules); this.ev?.rules?.(w.rules); }
    this.sim.setDataPacks(cleanPackList(w.recipes ?? []));
    this.ev?.recipes?.(this.sim.dataPacks);
    this.info = {
      kind: 'remote', name: w.room.name, seed: w.room.seed, mode: y.mode, difficulty: w.room.difficulty, spawn: w.worldSpawn,
      roomCode: w.room.code, isOwner: y.op,
    };
    this.players.clear();
    for (const p of w.players) this.players.set(p.id, p);
    for (const p of w.players) if (p.id !== this.me.id) this.addShadow(p);
    if (this.ev) {
      this.ev.time(w.time, w.cycle);
      this.ev.weather(w.weather as Weather);
      this.ev.inventory(this.me.inv);
      this.ev.vitals({ health: y.health, food: y.food, sat: y.sat, air: y.air, xp: y.xp, dead: y.dead, mode: y.mode });
      this.ev.room(w.room, w.players);
      for (const p of w.players) if (p.id !== this.me.id) this.ev.player(p);
      if (!first) this.ev.teleport(y.x, y.y, y.z);
    }
  }

  private addShadow(p: PublicPlayer): void {
    if (this.sim.players.has(p.id)) return;
    const sp = newPlayer(p.id, p.name, p.mode, this.sim.spawn);
    sp.y = -1000;
    this.sim.players.set(p.id, sp);
  }

  private handle(m: S2C): void {
    const ev = this.ev;
    if (m.t === 'welcome') {
      this.state = 'online';
      this.attempts = 0;
      if (this.welcomeWaiter) { const w = this.welcomeWaiter; this.welcomeWaiter = null; this.errorWaiter = null; w(m); return; }
      this.applyWelcome(m, false);
      ev?.connection('online', 'reconnected');
      return;
    }
    if (m.t === 'err') {
      this.lastError = m.msg;
      this.lastErrorCode = m.code;
      if (this.welcomeWaiter) this.fail(new Error(m.msg));
      else ev?.connection('offline', m.msg);
      return;
    }
    if (m.t === 'chunk' && !this.chunks) { this.earlyChunks.push(m); return; }
    if (!ev || !this.sim) return;
    switch (m.t) {
      case 'chunk': {
        let data: Uint16Array | null = null;
        if (m.d) { try { data = decodeRLE(base64ToU16(m.d)); } catch { data = null; } }
        if (this.chunks!.chunkReady(m.cx, m.cz)) { ev.chunkData(m.cx, m.cz, data); if (m.o) this.chunks!.applyOres(m.cx, m.cz, m.o); }
        else this.chunks!.receiveRemote(m.cx, m.cz, data, m.o);
        return;
      }
      case 'ores': if (Array.isArray(m.o)) this.chunks?.applyOres(m.cx, m.cz, m.o); return;
      case 'blk': for (const u of m.u) this.chunks!.applyRemote(u[0], u[1], u[2], u[3]); return;
      case 'pl':
        for (const r of m.u) {
          const [id, x, y, z, yaw, pitch, flags, hp, cr] = r as [string, number, number, number, number, number, number, number?, number?];
          const sp = this.sim.players.get(id);
          if (sp) { sp.x = x; sp.y = y; sp.z = z; sp.dead = !!(flags & (1 << 14)); if (typeof hp === 'number') sp.health = hp; }
          ev.playerMove(id, x, y, z, yaw, pitch, flags, typeof hp === 'number' ? hp : -1, cr === 1);
        }
        return;
      case 'pj': {
        const known = this.players.has(m.p.id);
        this.players.set(m.p.id, m.p);
        if (m.p.id === this.me.id) { this.me.op = m.p.op; return; }
        if (!known) this.addShadow(m.p);
        ev.player(m.p);
        return;
      }
      case 'pq': this.players.delete(m.id); this.sim.players.delete(m.id); ev.playerLeft(m.id, m.name); return;
      case 'ent':
        for (const a of m.a) {
          this.entKinds.set(a[0], [a[1], a[2]]);
          ev.entity(String(a[0]), KIND[a[1]], a[2], a[3], a[4], a[5], a[6], a[7], a[8]);
        }
        for (const u of m.u) {
          const k = this.entKinds.get(u[0]);
          if (k) ev.entity(String(u[0]), KIND[k[0]], k[1], u[1], u[2], u[3], u[4], u[5], u[6]);
        }
        for (const id of m.r) { this.entKinds.delete(id); ev.entityRemove(String(id), false); }
        return;
      case 'vit':
        Object.assign(this.me, { health: m.h, food: m.f, sat: m.s, air: m.a, xp: m.xp, dead: m.dead, mode: m.mode });
        ev.vitals({ health: m.h, food: m.f, sat: m.s, air: m.a, xp: m.xp, dead: m.dead, mode: m.mode, fire: !!m.fire, absorb: m.ab ?? 0 });
        return;
      case 'inv': Object.assign(this.me.inv, sanitizeInv(m.inv)); this.expected.clear(); ev.inventory(this.me.inv); return;
      case 'ack': {
        const exp = this.expected.get(m.s);
        this.expected.delete(m.s);
        if (exp !== undefined && exp !== m.h) this.send({ t: 'resync' });
        return;
      }
      case 'cont': {
        const items = m.items.map((s) => (validStack(s) ? cloneStack(s) : null));
        const be: BlockEntity = m.type === 'furnace' ? { type: 'furnace', items, burn: m.burn ?? 0, burnMax: m.burnMax ?? 0, cook: m.cook ?? 0, xp: 0 } : { type: 'chest', items };
        this.sim.blockEntities.set(m.k, be);
        ev.container(m.k, m.type, items, m.burn, m.burnMax, m.cook);
        return;
      }
      case 'scr':
        this.me.screen = { type: m.type, x: m.x, y: m.y, z: m.z };
        this.me.inv.craftSize = m.type === 'workbench' ? 3 : 2;
        ev.screen(m.type, m.x, m.y, m.z, m.title);
        return;
      case 'eco': ev.eco?.(m); return;
      case 'snd': ev.sound(m.s, m.x, m.y, m.z, m.v, m.p); return;
      case 'fx': ev.fx(m.k, m.x, m.y, m.z, m.d); return;
      case 'hurt': ev.hurt(m.a, m.c, m.fx, m.fz, m.k); return;
      case 'phurt': ev.playerHurt?.(m.id); return;
      case 'death': this.me.dead = true; ev.death(m.msg); return;
      case 'respawn': Object.assign(this.me, { x: m.x, y: m.y, z: m.z, dead: false }); ev.respawn(m.x, m.y, m.z); return;
      case 'tp': Object.assign(this.me, { x: m.x, y: m.y, z: m.z }); ev.teleport(m.x, m.y, m.z); return;
      case 'chat': ev.chat(m.from, m.text, m.kind, m.ts); return;
      case 'time': this.sim.time = m.time; this.sim.settings.dayCycle = m.cycle; ev.time(m.time, m.cycle); return;
      case 'wx': this.sim.weather = m.w as Weather; ev.weather(m.w as Weather); return;
      case 'bolt': ev.lightning(m.x, m.y, m.z); return;
      case 'pmove': ev.pistonMove?.(m.l); return;
      case 'boom': ev.boom?.(m.x, m.y, m.z, m.r); return;
      case 'room':
        this.room = m.room;
        this.info.name = m.room.name;
        this.info.difficulty = m.room.difficulty;
        this.sim.difficulty = m.room.difficulty;
        Object.assign(this.sim.settings, { pvp: m.room.settings.pvp, guestsBuild: m.room.settings.guestsBuild, cheats: m.room.settings.cheats });
        for (const p of m.players) this.players.set(p.id, p);
        ev.room(m.room, m.players);
        return;
      case 'mode': this.me.mode = m.mode; this.info.mode = m.mode; ev.mode(m.mode); return;
      case 'crafted': ev.crafted(m.r, m.n); return;
      case 'game': ev.game(m.s); return;
      case 'title': ev.title(m.text, m.sub); return;
      case 'rules': Object.assign(this.sim.settings, m.r); ev.rules?.(m.r); return;
      case 'recipes': this.sim.setDataPacks(cleanPackList(m.d)); ev.recipes?.(this.sim.dataPacks); return;
      case 'rtc': ev.rtc?.(m.from, m.d); return;
      case 'lid': ev.chestLid?.(m.x, m.y, m.z, m.n); return;
      case 'trade': ev.trade?.({ id: String(m.id), prof: m.prof, xp: m.xp, uses: m.uses }); return;
      case 'pong': this.rtt = Date.now() - m.c; return;
    }
  }

  async start(): Promise<void> { /* attach() completes setup */ }

  requestChunk(cx: number, cz: number): void { this.chunkReqs.push([cx, cz]); }

  tick(dt: number, nowMs: number): void {
    if (this.chunkReqs.length) {
      for (let i = 0; i < this.chunkReqs.length; i += 48) this.send({ t: 'chunks', want: this.chunkReqs.slice(i, i + 48) });
      this.chunkReqs = [];
    }
    if (this.sim) {
      this.sim.setNow(nowMs);
      if (this.sim.settings.dayCycle) this.sim.time += dt * 20;
    }
    const now = Date.now();
    if (this.moveState && now - this.lastMoveSent > 80) {
      const key = this.moveState.map((n) => Math.round(n * 100)).join(',');
      if (key !== this.lastMoveKey || now - this.lastMoveSent > 1000) {
        this.send({ t: 'mv', p: this.moveState });
        this.lastMoveKey = key;
        this.lastMoveSent = now;
      }
    }
    if (now - this.lastPing > 3000) { this.lastPing = now; this.send({ t: 'ping', c: now }); }
    this.rateT += dt;
    if (this.rateT >= 1) { this.inRate = this.inCount / this.rateT; this.outRate = this.outCount / this.rateT; this.inCount = 0; this.outCount = 0; this.rateT = 0; }
  }

  move(x: number, y: number, z: number, yaw: number, pitch: number, flags: number): void {
    this.moveState = [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000, Math.round(z * 1000) / 1000, Math.round(yaw * 1000) / 1000, Math.round(pitch * 1000) / 1000, flags];
    this.sim.move(this.me, x, y, z, yaw, pitch, flags);
  }

  private flushMove(): void {
    if (this.moveState) { this.send({ t: 'mv', p: this.moveState }); this.lastMoveSent = Date.now(); }
  }

  digStart(x: number, y: number, z: number): void { this.flushMove(); this.sim.digStart(this.me, x, y, z); this.send({ t: 'dig', a: 'start', x, y, z }); }
  digAbort(): void { this.sim.digAbort(this.me); this.send({ t: 'dig', a: 'abort', x: 0, y: 0, z: 0 }); }
  digDone(x: number, y: number, z: number): void {
    this.flushMove();
    this.sim.digFinish(this.me, x, y, z);
    this.send({ t: 'dig', a: 'done', x, y, z });
  }
  use(x: number, y: number, z: number, nx: number, ny: number, nz: number, force = false, hy = 0.5): void {
    this.flushMove();
    this.sim.use(this.me, x, y, z, nx, ny, nz, force, hy);
    this.send({ t: 'use', x, y, z, nx, ny, nz, f: force ? 1 : 0, h: Math.round(hy * 100) / 100 });
    this.ev?.inventory(this.me.inv);
  }
  eat(): void { this.sim.eat(this.me); this.send({ t: 'eat' }); this.ev?.inventory(this.me.inv); }
  swing(): void { this.send({ t: 'sw' }); }
  shoot(power: number, yaw: number, pitch: number): void { this.flushMove(); this.send({ t: 'bow', p: power, y: yaw, x: pitch }); }
  trade(id: string, index: number, times: number): void { this.send({ t: 'trd', id: Number(id), i: index, n: times }); }
  useEntity(id: string): void { this.flushMove(); this.send({ t: 'ue', id: Number(id) }); }
  attack(id: string): void { this.flushMove(); this.send({ t: 'atk', id: Number(id) }); }
  attackPlayer(pid: string): void { this.flushMove(); this.send({ t: 'pvp', pid }); }
  invOp(op: InvOp): void {
    const s = this.seq++;
    this.sim.invOp(this.me, op);
    this.expected.set(s, invHash(this.me.inv));
    this.send({ t: 'inv', op, s });
    if (op.t === 'close') this.me.screen.type = null;
    this.ev?.inventory(this.me.inv);
  }
  chat(text: string): void { const t = text.trim(); if (t) this.send({ t: 'chat', text: t.slice(0, 200) }); }
  respawn(): void { this.send({ t: 'respawn' }); }
  buy(k: string): void { this.send({ t: 'buy', k }); }
  roomUpdate(patch: Omit<Extract<C2S, { t: 'room' }>, 't'>): void { this.send({ t: 'room', ...patch }); }
  kick(pid: string): void { this.send({ t: 'kick', pid }); }
  mute(pid: string, on: boolean): void { this.send({ t: 'mute', pid, on }); }
  rtc(to: string, d: unknown): void { this.send({ t: 'rtc', to, d }); }
  sendSkin(skin: { png: string; slim: boolean } | null): void { this.send({ t: 'skin', skin }); }
  setDataPacks(d: DataRecipes[]): void { this.send({ t: 'datapacks', d }); }
  ecoAction(a: Record<string, unknown>): void { this.send({ ...a, t: 'eco', a: String(a.a ?? '') }); }
  getBlockEntity(key: string): BlockEntity | undefined { return this.sim?.blockEntities.get(key); }
  close(): void { this.closed = true; this.ws?.close(1000, 'leaving'); this.ws = null; this.state = 'offline'; }
  stats() { return { rtt: this.rtt, inRate: this.inRate, outRate: this.outRate, state: this.state }; }
  get mode(): GameMode { return this.me.mode; }
}

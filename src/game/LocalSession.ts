import { GenRegistry, GEN_LEVEL, LEGACY_LEVEL } from '../core/worldgen/genLevel';
import { ruleSnapshot } from '../core/sim/WorldSim';
import { WorldSim, SimPlayer, SimEvent, newPlayer, BlockEntity } from '../core/sim/WorldSim';
import { Minigame, GameState } from '../core/labs/minigames/Minigame';
import { WorldGenerator } from '../core/worldgen/WorldGenerator';
import { MOBS, MobType } from '../core/sim/mobs';
import { ENT_KIND } from '../core/protocol';
import { sanitizeInv, InvOp } from '../core/inventory';
import { cleanPackList } from '../core/datapack';
import type { DataRecipes } from '../core/crafting';
import type { ChunkManager } from './ChunkManager';
import type { GameSession, SessionEvents, SessionInfo } from './Session';
import { WorldStorage, WorldMeta, WorldState } from '../storage/WorldStorage';
import type { GenBlockEntity } from '../core/worldgen/WorldGenerator';
import { chunkKey } from '../core/chunk';
import type { Appearance } from '../core/sim/WorldSim';

export class LocalSession implements GameSession {
  readonly info: SessionInfo;
  readonly sim: WorldSim;
  readonly me: SimPlayer;
  private ev: SessionEvents;
  private meta: WorldMeta;
  private acc = 0;
  private beChunks: Set<string>;
  private chunks: ChunkManager;
  private playStart = Date.now();
  flying = false;

  constructor(meta: WorldMeta, state: WorldState | null, chunks: ChunkManager, ev: SessionEvents, name: string, appearance: Appearance) {
    this.meta = meta;
    this.ev = ev;
    this.chunks = chunks;
    const gen = new WorldGenerator(meta.seed, meta.arena ?? null);
    this.sim = new WorldSim({
      seed: meta.seed, store: chunks, gen, difficulty: meta.difficulty, emit: (e) => this.onEvent(e),
      validateMoves: false, authoritative: true, spawn: state?.spawn ?? undefined,
    });
    this.sim.settings.cheats = state?.cheats ?? meta.mode === 'creative';
    if (meta.arena) this.sim.game = new Minigame(this.sim, meta.arena);
    this.sim.settings.dayCycle = state?.dayCycle ?? true;
    Object.assign(this.sim.settings, state?.rules ?? {});
    this.sim.setDataPacks(cleanPackList(state?.datapacks));
    this.sim.keepPopulated = true;
    this.sim.populated = new Set(state?.populated ?? []);
    this.beChunks = new Set(state?.beChunks ?? []);
    if (state) {
      this.sim.time = state.time;
      this.sim.weather = state.weather;
      this.sim.weatherTimer = state.weatherTimer;
      for (const [k, be] of state.blockEntities) {
        this.sim.blockEntities.set(k, be);
        if (be.type === 'furnace') this.sim.activeFurnaces.add(k);
      }
    }
    const p = newPlayer('local', name, meta.mode, this.sim.spawn);
    p.appearance = appearance;
    p.op = true;
    if (state?.player) {
      const s = state.player;
      Object.assign(p, { x: s.x, y: s.y, z: s.z, yaw: s.yaw, pitch: s.pitch, mode: s.mode, health: s.health, food: s.food, sat: s.sat, air: s.air, xp: s.xp, dead: s.dead, spawn: s.spawn, peakY: s.y });
      p.inv = sanitizeInv(s.inv);
      this.flying = s.flying;
      if (s.homes) p.homes = s.homes;
      if (s.back) p.back = s.back;
    }
    this.me = p;
    this.pendingMobs = state?.mobs ?? [];
    this.info = { kind: 'local', name: meta.name, seed: meta.seed, mode: p.mode, difficulty: meta.difficulty, spawn: this.sim.spawn, isOwner: true, arena: meta.arena ?? null };
  }

  private pendingMobs: WorldState['mobs'];

  async start(): Promise<void> {
    this.sim.addPlayer(this.me);
    this.ev.time(this.sim.time, this.sim.settings.dayCycle);
    this.ev.weather(this.sim.weather);
    this.ev.rules?.(ruleSnapshot(this.sim.settings));
    this.ev.recipes?.(this.sim.dataPacks);
    this.ev.inventory(this.me.inv);
    this.emitVitals();
  }

  private levels = new GenRegistry(GEN_LEVEL);

  initLevels(state: WorldState | null, stored: Set<string>): void {
    if (!state) { this.levels = new GenRegistry(GEN_LEVEL); return; }
    if (state.genBase === undefined) {
      const pts: [number, number][] = [];
      for (const k of stored) { const [a, b] = k.split(',').map(Number); if (Number.isFinite(a) && Number.isFinite(b)) pts.push([a, b]); }
      for (const k of state.beChunks ?? []) { const [a, b] = k.split(',').map(Number); if (Number.isFinite(a) && Number.isFinite(b)) pts.push([a, b]); }
      const p = state.player;
      for (const q of [p, p?.spawn, state.spawn, ...Object.values(p?.homes ?? {})]) if (q) pts.push([Math.floor(q.x / 16), Math.floor(q.z / 16)]);
      if (!pts.length) pts.push([0, 0]);
      this.levels = new GenRegistry(LEGACY_LEVEL, pts);
    } else this.levels = new GenRegistry(state.genBase, state.genPts ?? [], state.genLv);
  }

  chunkLevel(cx: number, cz: number): number { return this.meta.arena ? GEN_LEVEL : this.levels.level(cx, cz); }

  onGenerated(cx: number, cz: number, ents: GenBlockEntity[]): void {
    const k = chunkKey(cx, cz);
    if (this.beChunks.has(k)) return;
    this.beChunks.add(k);
    for (const e of ents) this.sim.addGeneratedChest(cx * 16 + e.x, e.y, cz * 16 + e.z, e.items, e.type, e.mob);
  }

  private emitVitals(): void {
    const p = this.me;
    this.ev.vitals({ health: p.health, food: p.food, sat: p.sat, air: p.air, xp: p.xp, dead: p.dead, mode: p.mode, fire: p.fireT > 0, absorb: p.absorb ?? 0 });
  }

  private onEvent(e: SimEvent): void {
    const ev = this.ev;
    switch (e.e) {
      case 'block': ev.block(e.x, e.y, e.z, e.v, e.old); return;
      case 'sound': if (!e.to || e.to === this.me.id) ev.sound(e.s, e.x, e.y, e.z, e.vol, e.pitch); return;
      case 'particles': ev.fx(e.k, e.x, e.y, e.z, e.d); return;
      case 'spawn': {
        const x = e.ent;
        ev.entity(String(x.id), x.kind, x.kind === 'mob' ? MOBS[x.type as MobType].code : x.kind === 'item' ? x.item!.id : 0, x.x, x.y, x.z, x.yaw, x.flags, x.kind === 'item' ? x.item!.count : x.health);
        return;
      }
      case 'remove': ev.entityRemove(String(e.id), e.why === 'death', e.by); return;
      case 'vitals': if (e.p === this.me) this.emitVitals(); return;
      case 'inv': if (e.p === this.me) ev.inventory(this.me.inv); return;
      case 'container': {
        const v = this.sim.containerView(this.me);
        if (v && v.keys.includes(e.key)) {
          if (v.type === 'furnace') ev.container(v.key, 'furnace', v.items, v.burn, v.burnMax, v.cook);
          else ev.container(v.key, 'chest', v.items);
        }
        return;
      }
      case 'chestLid': ev.chestLid?.(e.x, e.y, e.z, e.n); return;
      case 'screen': {
        const sc = e.p.screen;
        ev.screen(sc.type, sc.x, sc.y, sc.z);
        if (sc.type === 'chest' || sc.type === 'furnace') this.onEvent({ e: 'container', key: `${sc.x},${sc.y},${sc.z}` });
        return;
      }
      case 'hurt': ev.hurt(e.amount, e.cause, e.fx, e.fz, e.kb); return;
      case 'death': ev.death(e.msg); return;
      case 'respawn': ev.respawn(e.p.x, e.p.y, e.p.z); return;
      case 'tp': ev.teleport(e.p.x, e.p.y, e.p.z); return;
      case 'msg': if (e.to && e.to !== this.me.id) return; ev.chat(null, e.text, e.kind === 'death' ? 'death' : e.kind === 'error' ? 'error' : 'info', Date.now()); return;
      case 'lightning': ev.lightning(e.x, e.y, e.z); return;
      case 'weather': ev.weather(e.w); return;
      case 'time': ev.time(this.sim.time, this.sim.settings.dayCycle); return;
      case 'rules': ev.rules?.(ruleSnapshot(this.sim.settings)); return;
      case 'mode': this.info.mode = e.p.mode; ev.mode(e.p.mode); return;
      case 'crafted': ev.crafted(e.recipe.id, e.times); return;
      case 'game': ev.game(e.state as GameState); return;
      case 'title': if (!e.to || e.to === this.me.id) ev.title(e.text, e.sub); return;
      case 'trade': if (e.p === this.me) ev.trade?.({ id: String(e.v.id), prof: e.v.prof ?? 0, xp: e.v.vxp ?? 0, uses: [...(e.v.uses ?? [])] }); return;
      case 'reject': return;
    }
  }

  tick(dt: number, nowMs: number): void {
    this.acc += Math.min(dt, 0.25);
    let n = 0;
    while (this.acc >= 0.05 && n < 5) {
      this.acc -= 0.05;
      this.sim.setNow(nowMs);
      if (this.pendingMobs.length && this.chunks.isLoaded(Math.floor(this.me.x), Math.floor(this.me.z))) {
        for (const m of this.pendingMobs) if (this.chunks.isLoaded(Math.floor(m.x), Math.floor(m.z))) { const e = this.sim.spawnMob(m.type, m.x, m.y, m.z); e.health = m.health; }
        this.pendingMobs = [];
      }
      this.sim.tick();
      n++;
    }
    for (const e of this.sim.entities.values()) {
      const type = e.kind === 'mob' ? MOBS[e.type as MobType].code : e.kind === 'item' ? e.item!.id : 0;
      this.ev.entity(String(e.id), e.kind, type, e.x, e.y, e.z, e.yaw, e.flags, e.kind === 'item' ? e.item!.count : e.health);
    }
    void ENT_KIND;
  }

  move(x: number, y: number, z: number, yaw: number, pitch: number, flags: number): void { this.sim.setNow(performance.now()); this.sim.move(this.me, x, y, z, yaw, pitch, flags); }
  digStart(x: number, y: number, z: number): void { this.sim.setNow(performance.now()); this.sim.digStart(this.me, x, y, z); }
  digAbort(): void { this.sim.digAbort(this.me); }
  digDone(x: number, y: number, z: number): void { this.sim.setNow(performance.now()); this.sim.digFinish(this.me, x, y, z); }
  use(x: number, y: number, z: number, nx: number, ny: number, nz: number, force = false): void { this.sim.use(this.me, x, y, z, nx, ny, nz, force); }
  eat(): void { this.sim.setNow(performance.now()); this.sim.eat(this.me); }
  swing(): void { this.sim.setNow(performance.now()); this.sim.swing(this.me); }
  shoot(power: number, yaw: number, pitch: number): void { this.sim.setNow(performance.now()); this.sim.shootBow(this.me, power, yaw, pitch); }
  trade(id: string, index: number, times: number): void { this.sim.setNow(performance.now()); this.sim.trade(this.me, Number(id), index, times); }
  useEntity(id: string): void { this.sim.setNow(performance.now()); this.sim.useEntity(this.me, Number(id)); }
  attack(id: string): void { this.sim.setNow(performance.now()); this.sim.attack(this.me, Number(id)); }
  attackPlayer(): void { /* single player */ }
  invOp(op: InvOp): void { this.sim.invOp(this.me, op); this.ev.inventory(this.me.inv); }
  buy(key: string): void { this.sim.buy(this.me, key); }

  respawn(): void { this.sim.respawn(this.me); }
  getBlockEntity(key: string): BlockEntity | undefined { return this.sim.blockEntities.get(key); }

  chat(text: string): void {
    const t = text.trim();
    if (!t) return;
    if (t.startsWith('/')) {
      const out = this.sim.command(this.me, t);
      if (out) this.ev.chat(null, out, out.startsWith('Unknown') || out.startsWith('You do not') ? 'error' : 'info', Date.now());
      return;
    }
    this.ev.chat({ id: this.me.id, name: this.me.name }, t, 'chat', Date.now());
  }

  setDifficulty(d: WorldMeta['difficulty']): void {
    this.meta.difficulty = d;
    this.sim.difficulty = d;
    this.info.difficulty = d;
  }

  async save(_manual: boolean): Promise<void> {
    const p = this.me;
    const chunks = this.chunks.collectDirtySaves();
    if (!this.meta.arena) await WorldStorage.saveChunks(this.meta.id, chunks);
    const mobs: WorldState['mobs'] = [];
    for (const e of this.sim.entities.values()) if (e.kind === 'mob' && !MOBS[e.type as MobType].hostile) mobs.push({ type: e.type as MobType, x: e.x, y: e.y, z: e.z, health: e.health });
    const now = Date.now();
    this.meta.playTime += now - this.playStart;
    this.playStart = now;
    this.meta.mode = this.me.mode;
    await WorldStorage.saveState(this.meta, {
      player: { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, mode: p.mode, flying: this.flying, inv: p.inv, health: p.health, food: p.food, sat: p.sat, air: p.air, xp: p.xp, dead: p.dead, spawn: p.spawn, homes: p.homes, back: p.back },
      time: this.sim.time, weather: this.sim.weather, weatherTimer: this.sim.weatherTimer, spawn: this.sim.spawn,
      blockEntities: [...this.sim.blockEntities.entries()], beChunks: [...this.beChunks], mobs,
      dayCycle: this.sim.settings.dayCycle, cheats: this.sim.settings.cheats,
      populated: [...this.sim.populated],
      genBase: this.levels.base, genPts: this.levels.points.length ? this.levels.points : undefined, genLv: this.levels.encode(),
      rules: ruleSnapshot(this.sim.settings),
      datapacks: this.sim.dataPacks.length ? this.sim.dataPacks : undefined,
    });
  }

  setDataPacks(d: DataRecipes[]): void {
    this.sim.setDataPacks(cleanPackList(d));
    this.ev.recipes?.(this.sim.dataPacks);
    void this.save(false);
  }

  close(): void { /* nothing to tear down */ }
  stats() { return { rtt: 0, inRate: 0, outRate: 0, state: 'local' }; }
  get worldMeta(): WorldMeta { return this.meta; }
}

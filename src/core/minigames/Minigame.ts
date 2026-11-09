import { B, blockId, isSolid } from '../blocks';
import { I, toolId, armorId, getItem } from '../items';
import { ItemStack, giveItem, emptyInv } from '../inventory';
import { moveBody, sampleMedium } from '../physics';
import type { WorldSim, SimPlayer, Entity, GameHooks } from '../sim/WorldSim';
import { ArenaKind, ArenaLayout, arenaLayout, ARENA_INFO, V3 } from './arena';
import { SHOP, CURRENCY_ITEM, CURRENCY_NAME } from './shop';

export type Phase = 'waiting' | 'countdown' | 'playing' | 'ended';

export interface GamePlayerState { id: string; name: string; team: number; alive: boolean; bot: boolean; kills: number; ent?: number; }
export interface GameState {
  kind: ArenaKind;
  phase: Phase;
  timer: number;
  teams: { name: string; color: string; hearth: boolean; alive: number; upgrades: string[] }[];
  players: GamePlayerState[];
  winner: string | null;
  next: number;
  bots: number;
}

interface Part {
  id: string;
  name: string;
  bot: boolean;
  team: number;
  alive: boolean;
  out: boolean;
  kills: number;
  ent: number;
  respawnAt: number;
  bonus: number;
  dig: { k: string; t: number } | null;
  placeCd: number;
  target: string | null;
  lastHit: string | null;
  rushAt: number;
}

interface TeamState { hearth: boolean; forge: number; blades: boolean; plating: boolean; npc: number; }

const DT = 1 / 20;
const BOT_NAMES = ['Kestrel', 'Thornwick', 'Vesper', 'Corvin', 'Sable', 'Quillon', 'Marrow', 'Halcyon', 'Juniper', 'Brisk', 'Wren', 'Ashby'];
const WOOLS = new Set<number>([B.WHITE_WOOL, B.RED_WOOL, B.YELLOW_WOOL]);
const key = (x: number, y: number, z: number) => `${x},${y},${z}`;

const sw = (m: number): ItemStack => ({ id: toolId(m, 3), count: 1 });
const LUCKY: [number, () => ItemStack][] = [
  [10, () => ({ id: B.STONE, count: 8 + Math.floor(Math.random() * 8) })],
  [10, () => ({ id: B.WHITE_WOOL, count: 12 })],
  [8, () => ({ id: B.OAK_PLANKS, count: 10 })],
  [5, () => ({ id: B.COBBLESTONE, count: 10 })],
  [3, () => ({ id: B.GLASS, count: 6 })],
  [2, () => ({ id: B.OBSIDIAN, count: 3 })],
  [3, () => ({ id: B.LADDER, count: 6 })],
  [6, () => sw(1)], [4, () => sw(2)], [3, () => sw(3)], [1, () => sw(4)],
  [3, () => ({ id: toolId(2, 1), count: 1 })], [3, () => ({ id: toolId(1, 0), count: 1 })], [2, () => ({ id: toolId(2, 0), count: 1 })],
  [3, () => ({ id: armorId(0, 1), count: 1 })], [2, () => ({ id: armorId(1, 0), count: 1 })], [2, () => ({ id: armorId(1, 1), count: 1 })],
  [2, () => ({ id: armorId(1, 2), count: 1 })], [2, () => ({ id: armorId(1, 3), count: 1 })], [1, () => ({ id: armorId(3, 1), count: 1 })],
  [5, () => ({ id: I.BREAD, count: 3 })], [4, () => ({ id: I.COOKED_PORK, count: 2 })], [3, () => ({ id: I.APPLE, count: 3 })],
  [2, () => ({ id: I.WATER_BUCKET, count: 1 })],
];
const LUCKY_TOTAL = LUCKY.reduce((a, [w]) => a + w, 0);

export class Minigame implements GameHooks {
  readonly kind: ArenaKind;
  readonly layout: ArenaLayout;
  private sim: WorldSim;
  phase: Phase = 'waiting';
  private timer = 0;
  private parts = new Map<string, Part>();
  private teams: TeamState[] = [];
  private placed = new Set<string>();
  private changed = new Map<string, number>();
  private restoring = false;
  private genT: number[] = [];
  private luckyT = 0;
  private winner: string | null = null;
  private dirty = true;
  private elapsed = 0;
  botFill: number;

  constructor(sim: WorldSim, kind: ArenaKind) {
    this.sim = sim;
    this.kind = kind;
    this.layout = arenaLayout(kind);
    this.botFill = kind === 'spires' ? 5 : 4;
    Object.assign(sim.settings, { pvp: true, dayCycle: false, weatherCycle: false });
    sim.time = 6000;
    sim.weather = 'clear';
    const store = sim.store;
    const orig = store.setBlock.bind(store);
    store.setBlock = (x, y, z, v) => {
      if (!this.restoring) {
        const k = key(x, y, z);
        if (!this.changed.has(k)) this.changed.set(k, store.getBlock(x, y, z));
        if (this.phase === 'playing') { if (v) this.placed.add(k); else this.placed.delete(k); }
      }
      orig(x, y, z, v);
    };
  }

  private get now(): number { return this.sim.tickCount; }
  private humans(): SimPlayer[] { return [...this.sim.players.values()]; }
  private part(p: SimPlayer): Part | undefined { return this.parts.get(p.id); }
  private teamCount(): number { return this.kind === 'hearthfall' ? this.layout.teams.length : 0; }

  private title(text: string, sub = '', to?: string): void { this.sim.emit({ e: 'title', text, sub, to }); }
  private say(text: string, kind: 'system' | 'info' | 'death' | 'error' = 'system', to?: string): void { this.sim.emit({ e: 'msg', text, kind, to }); }

  private tpTo(p: SimPlayer, v: V3): void {
    p.x = v[0]; p.y = v[1]; p.z = v[2]; p.peakY = p.y;
    this.sim.emit({ e: 'tp', p });
  }

  private toLobby(p: SimPlayer): void {
    const l = this.layout.lobby;
    p.spawn = { x: l[0], y: l[1], z: l[2] };
    if (p.dead) return;
    p.health = 20; p.food = 20; p.fireT = 0;
    if (p.mode !== 'creative') { p.inv = emptyInv(); this.sim.emit({ e: 'inv', p }); }
    this.tpTo(p, [l[0] + (Math.random() - 0.5) * 6, l[1], l[2] + (Math.random() - 0.5) * 6]);
    this.sim.emit({ e: 'vitals', p });
  }

  onJoin(p: SimPlayer): void {
    if (p.mode !== 'creative') p.mode = 'survival';
    this.toLobby(p);
    this.say(`Welcome to ${ARENA_INFO[this.kind].name}. ${this.phase === 'playing' ? 'A round is under way. You will join the next one.' : 'The round starts once the countdown ends.'}`, 'info', p.id);
    this.dirty = true;
  }

  onLeave(p: SimPlayer): void {
    const pt = this.parts.get(p.id);
    if (pt && this.phase === 'playing') { pt.alive = false; pt.out = true; this.say(`${pt.name} left the arena.`); }
    this.parts.delete(p.id);
    this.dirty = true;
  }

  // ---------- round flow ----------
  private beginCountdown(): void { this.phase = 'countdown'; this.timer = 15 * 20; this.dirty = true; this.say('The round begins in 15 seconds.'); }

  start(): void {
    this.restore();
    this.clearEntities();
    this.parts.clear();
    this.placed.clear();
    this.winner = null;
    this.elapsed = 0;
    this.luckyT = 60;
    const L = this.layout;
    const hs = this.humans().filter((p) => p.mode === 'survival');
    const tc = this.teamCount();
    this.teams = L.teams.map(() => ({ hearth: true, forge: 0, blades: false, plating: false, npc: 0 }));
    const order = [...hs].sort(() => Math.random() - 0.5);
    const slots = this.kind === 'spires' ? L.spawns.length : tc * 2;
    const humanParts = order.slice(0, slots);
    humanParts.forEach((p, i) => this.parts.set(p.id, this.newPart(p.id, p.name, false, tc ? i % tc : -1)));
    const botCount = Math.max(0, Math.min(this.botFill, slots - humanParts.length));
    const want = Math.min(slots, humanParts.length + botCount);
    let bi = 0;
    while (this.parts.size < want) {
      let team = -1;
      if (tc) { const counts = new Array(tc).fill(0); for (const pt of this.parts.values()) counts[pt.team]++; team = counts.indexOf(Math.min(...counts)); }
      const name = BOT_NAMES[(bi + Math.floor(Math.random() * 3)) % BOT_NAMES.length];
      const id = `bot:${bi++}`;
      if ([...this.parts.values()].some((x) => x.name === name)) continue;
      this.parts.set(id, this.newPart(id, name, true, team));
    }
    const spawnIdx = [...L.spawns.keys()].sort(() => Math.random() - 0.5);
    let si = 0;
    for (const pt of this.parts.values()) {
      const sp = tc ? L.teams[pt.team].spawn : L.spawns[spawnIdx[si++ % spawnIdx.length]];
      if (pt.bot) this.spawnBot(pt, sp);
      else {
        const p = this.sim.players.get(pt.id)!;
        p.dead = false; p.health = 20; p.food = 20; p.sat = 5; p.air = 300; p.fireT = 0;
        p.inv = emptyInv();
        if (tc) giveItem(p.inv, sw(0));
        p.spawn = { x: sp[0], y: sp[1], z: sp[2] };
        this.sim.emit({ e: 'inv', p });
        this.sim.emit({ e: 'vitals', p });
        this.tpTo(p, sp);
        p.hurtCd = 40;
      }
    }
    for (const p of hs) if (!this.parts.has(p.id)) this.say('The arena is full this round. You are watching from the gallery.', 'info', p.id);
    if (tc) L.teams.forEach((t, i) => {
      const e = this.sim.spawnMob('quartermaster', t.npc[0], t.npc[1], t.npc[2]);
      e.yaw = Math.atan2(t.dir[0], t.dir[1]);
      this.teams[i].npc = e.id;
    });
    this.genT = L.gens.map(() => 0);
    this.phase = 'playing';
    this.timer = 0;
    this.dirty = true;
    this.title(ARENA_INFO[this.kind].name, this.kind === 'spires' ? 'Last one standing wins' : 'Guard your hearth. Snuff out theirs.');
    if (tc) for (const pt of this.parts.values()) if (!pt.bot) this.say(`You fight for ${L.teams[pt.team].name}.`, 'info', pt.id);
  }

  private newPart(id: string, name: string, bot: boolean, team: number): Part {
    return { id, name, bot, team, alive: true, out: false, kills: 0, ent: 0, respawnAt: 0, bonus: 0, dig: null, placeCd: 0, target: null, lastHit: null, rushAt: 0 };
  }

  private spawnBot(pt: Part, sp: V3): void {
    const e = this.sim.spawnMob('rival', sp[0], sp[1], sp[2]);
    e.health = e.maxHealth = 20;
    pt.ent = e.id;
    pt.alive = true;
    pt.rushAt = this.now + 500 + Math.floor(Math.random() * 700);
    this.dirty = true;
  }

  private end(winner: string | null): void {
    this.phase = 'ended';
    this.timer = 10 * 20;
    this.winner = winner;
    this.dirty = true;
    this.title(winner ? `${winner} wins` : 'Draw', 'Next round soon');
    this.say(winner ? `${winner} won the round.` : 'Nobody survived. The round is a draw.');
  }

  private finish(): void {
    this.clearEntities();
    this.restore();
    this.parts.clear();
    for (const p of this.humans()) this.toLobby(p);
    this.phase = 'waiting';
    this.timer = 0;
    this.dirty = true;
  }

  private clearEntities(): void {
    for (const e of [...this.sim.entities.values()]) {
      if (e.kind === 'item' || e.kind === 'arrow' || e.type === 'rival' || e.type === 'quartermaster') {
        this.sim.entities.delete(e.id);
        this.sim.emit({ e: 'remove', id: e.id, why: 'despawn' });
      }
    }
  }

  private restore(): void {
    this.restoring = true;
    for (const [k, v] of this.changed) {
      const [x, y, z] = k.split(',').map(Number);
      if (this.sim.get(x, y, z) !== v) this.sim.setBlock(x, y, z, v);
    }
    this.changed.clear();
    this.restoring = false;
  }

  // ---------- tick ----------
  tick(): void {
    const hs = this.humans();
    if (this.sim.time !== 6000) this.sim.time = 6000;
    if (this.phase === 'waiting') {
      const ready = hs.filter((p) => p.mode === 'survival').length;
      if (ready >= 1 && (ready >= 2 || this.botFill > 0)) this.beginCountdown();
    } else if (this.phase === 'countdown') {
      if (!hs.some((p) => p.mode === 'survival')) { this.phase = 'waiting'; this.dirty = true; }
      else {
        this.timer--;
        if (this.timer % 20 === 0) { this.dirty = true; const s = this.timer / 20; if (s <= 5 && s > 0) this.title(String(s), 'Get ready'); }
        if (this.timer <= 0) this.start();
      }
    } else if (this.phase === 'playing') this.tickPlaying(hs);
    else if (this.phase === 'ended') { if (--this.timer <= 0) this.finish(); else if (this.timer % 20 === 0) this.dirty = true; }
    for (const p of hs) {
      if (!p.dead && p.y < 90 && !this.parts.get(p.id)?.alive && this.phase !== 'playing' && p.mode === 'survival') this.toLobby(p);
    }
    if (this.dirty || this.now % 40 === 0) { this.dirty = false; this.sim.emit({ e: 'game', state: this.state() }); }
  }

  private tickPlaying(hs: SimPlayer[]): void {
    this.elapsed++;
    this.timer++;
    const L = this.layout;
    for (const p of hs) {
      const pt = this.part(p);
      if (!pt) {
        if (!p.dead && p.y < 95 && p.mode === 'survival') this.toLobby(p);
        continue;
      }
      if (!p.dead && p.y < L.voidY) this.sim.damage(p, 1000, 'void', p.x, p.z, false, true, pt.lastHit ?? undefined);
      if (p.dead && !pt.out && pt.respawnAt && this.now >= pt.respawnAt) { pt.respawnAt = 0; this.sim.respawn(p); }
    }
    for (const pt of this.parts.values()) {
      if (!pt.bot || pt.out) continue;
      if (!pt.alive && pt.respawnAt && this.now >= pt.respawnAt) { pt.respawnAt = 0; this.spawnBot(pt, L.teams[pt.team].spawn); }
    }
    if (this.kind === 'spires' && --this.luckyT <= 0) {
      this.luckyT = 140;
      for (const pt of this.parts.values()) {
        if (!pt.alive) continue;
        const st = this.rollLucky();
        if (pt.bot) { pt.bonus = Math.min(6, pt.bonus + (getItem(st.id)?.kind === 'tool' ? 1 : 0.25)); continue; }
        const p = this.sim.players.get(pt.id);
        if (!p || p.dead) continue;
        if (giveItem(p.inv, st) > 0) this.sim.spawnItem(p.x, p.y + 1, p.z, st);
        this.sim.emit({ e: 'inv', p });
        this.say(`Fortune grants you ${getItem(st.id)?.name ?? 'something'}${st.count > 1 ? ` x${st.count}` : ''}.`, 'info', p.id);
      }
      this.dirty = true;
    }
    if (this.kind === 'hearthfall') {
      L.gens.forEach((g, i) => {
        const lvl = g.team !== undefined ? this.teams[g.team].forge : 0;
        this.genT[i] += 1 + lvl * 0.5;
        if (this.genT[i] < g.every) return;
        this.genT[i] = 0;
        let near = 0;
        for (const e of this.sim.entities.values()) if (e.kind === 'item' && e.item!.id === CURRENCY_ITEM[g.item] && Math.abs(e.x - g.pos[0]) < 2 && Math.abs(e.z - g.pos[2]) < 2) near += e.item!.count;
        if (near >= (g.item === 'iron' ? 48 : 12)) return;
        const e = this.sim.spawnItem(g.pos[0], g.pos[1], g.pos[2], { id: CURRENCY_ITEM[g.item], count: 1 }, 0, 0, 0, 0);
        if (e) e.age = 0;
      });
      if (this.elapsed === 20 * 60 * 9) this.say('The hearths gutter in one minute. After that, every fall is final.');
      if (this.elapsed === 20 * 60 * 10) { this.teams.forEach((t) => { t.hearth = false; }); this.title('Sudden death', 'No more respawns'); this.dirty = true; }
    }
    if (this.now % 20 === 0) for (const e of [...this.sim.entities.values()]) if (e.kind === 'item' && e.y < L.voidY - 20) { this.sim.entities.delete(e.id); this.sim.emit({ e: 'remove', id: e.id, why: 'despawn' }); }
    this.checkWin();
  }

  private rollLucky(): ItemStack {
    let r = Math.random() * LUCKY_TOTAL;
    for (const [w, f] of LUCKY) { r -= w; if (r <= 0) return f(); }
    return LUCKY[0][1]();
  }

  private checkWin(): void {
    const ps = [...this.parts.values()];
    if (this.kind === 'spires') {
      const alive = ps.filter((p) => p.alive || (!p.out && p.respawnAt > 0));
      if (alive.length <= 1 && ps.length > 1) this.end(alive[0]?.name ?? null);
      else if (ps.length === 1 && !alive.length) this.end(null);
    } else {
      const standing = this.layout.teams.map((_, i) => ps.some((p) => p.team === i && !p.out));
      const left = standing.filter(Boolean).length;
      const playing = new Set(ps.map((p) => p.team)).size;
      if (playing > 1 && left <= 1) this.end(left ? this.layout.teams[standing.indexOf(true)].name : null);
      else if (playing === 1 && left === 0) this.end(null);
    }
  }

  // ---------- deaths ----------
  onKill(p: SimPlayer, _cause: string, killer?: string): boolean {
    const pt = this.part(p);
    if (!pt || this.phase !== 'playing') { this.toLobby(p); return false; }
    this.credit(killer ?? pt.lastHit);
    pt.lastHit = null;
    pt.alive = false;
    const canRespawn = this.kind === 'hearthfall' && this.teams[pt.team].hearth;
    let handled = false;
    if (this.kind === 'hearthfall') {
      const armor = p.inv.armor.map((s) => (s ? { ...s } : null));
      const loot = p.inv.slots.filter((s): s is ItemStack => !!s && (s.id === I.IRON_INGOT || s.id === I.GOLD_INGOT || s.id === I.AETHERITE));
      const kp = killer ? [...this.sim.players.values()].find((x) => x.name === killer) : undefined;
      if (kp && !kp.dead) { for (const s of loot) giveItem(kp.inv, s); this.sim.emit({ e: 'inv', p: kp }); }
      const sel = p.inv.selected;
      p.inv = emptyInv();
      p.inv.selected = sel;
      p.inv.armor = armor;
      handled = true;
    }
    if (canRespawn) {
      pt.respawnAt = this.now + 100;
      const sp = this.layout.teams[pt.team].spawn;
      p.spawn = { x: sp[0], y: sp[1], z: sp[2] };
      this.title('You fell', 'Respawning in 5 seconds', p.id);
    } else {
      pt.out = true;
      const l = this.layout.lobby;
      p.spawn = { x: l[0], y: l[1], z: l[2] };
      this.title('Eliminated', 'Respawn to watch from the gallery', p.id);
      this.say(`${pt.name} has been eliminated.`);
    }
    this.dirty = true;
    return handled;
  }

  private credit(name: string | null | undefined): void {
    if (!name) return;
    for (const x of this.parts.values()) if (x.name === name) { x.kills++; break; }
  }

  allowRespawn(p: SimPlayer): boolean {
    const pt = this.part(p);
    if (!pt || this.phase !== 'playing' || pt.out) return true;
    return pt.respawnAt === 0 || this.now >= pt.respawnAt;
  }

  onRespawn(p: SimPlayer): void {
    const pt = this.part(p);
    if (!pt || pt.out || this.phase !== 'playing') { this.toLobby(p); return; }
    pt.alive = true;
    pt.respawnAt = 0;
    if (this.kind === 'hearthfall') { giveItem(p.inv, sw(0)); this.sim.emit({ e: 'inv', p }); }
    this.dirty = true;
  }

  onMobDeath(e: Entity, by: string | null): void {
    const pt = [...this.parts.values()].find((x) => x.bot && x.ent === e.id);
    if (!pt) return;
    const killerName = by ? this.sim.players.get(by)?.name ?? null : pt.lastHit;
    this.credit(killerName);
    pt.alive = false;
    pt.ent = 0;
    pt.lastHit = null;
    if (this.kind === 'hearthfall' && this.teams[pt.team].hearth) pt.respawnAt = this.now + 100;
    else { pt.out = true; this.say(`${pt.name} has been eliminated.`); }
    this.say(`${pt.name} ${killerName ? `was struck down by ${killerName}` : 'fell into the void'}.`, 'death');
    this.dirty = true;
  }

  // ---------- rules ----------
  protectedPlayer(p: SimPlayer): boolean {
    if (this.phase !== 'playing') return true;
    const pt = this.part(p);
    return !pt || pt.out;
  }

  canHurtPlayer(a: SimPlayer, t: SimPlayer): boolean {
    if (this.protectedPlayer(a) || this.protectedPlayer(t)) return false;
    const pa = this.part(a), pb = this.part(t);
    if (!pa || !pb) return false;
    if (this.kind === 'hearthfall' && pa.team === pb.team) return false;
    pb.lastHit = a.name;
    return true;
  }

  damageBonus(p: SimPlayer): number {
    const pt = this.part(p);
    return pt && this.kind === 'hearthfall' && this.teams[pt.team]?.blades ? 1 : 0;
  }

  damageScale(p: SimPlayer): number {
    const pt = this.part(p);
    return pt && this.kind === 'hearthfall' && this.teams[pt.team]?.plating ? 0.85 : 1;
  }

  private inLobby(y: number): boolean { return y >= 99; }

  canBreak(p: SimPlayer, x: number, y: number, z: number, v: number): boolean {
    if (p.mode === 'creative' && p.op) return true;
    if (this.protectedPlayer(p) || this.inLobby(y)) return false;
    if (this.kind === 'spires') return true;
    const k = key(x, y, z);
    if (this.placed.has(k)) return true;
    const id = blockId(v);
    if (WOOLS.has(id)) return true;
    if (id === B.GLOWSTONE) {
      const ti = this.layout.teams.findIndex((t) => t.hearth[0] === x && t.hearth[1] === y && t.hearth[2] === z);
      if (ti < 0) return false;
      const pt = this.part(p)!;
      if (pt.team === ti) { this.say('You cannot snuff out your own hearth.', 'error', p.id); return false; }
      return true;
    }
    return false;
  }

  onBroken(by: string | null, x: number, y: number, z: number, v: number): void {
    if (this.kind !== 'hearthfall' || blockId(v) !== B.GLOWSTONE) return;
    const ti = this.layout.teams.findIndex((t) => t.hearth[0] === x && t.hearth[1] === y && t.hearth[2] === z);
    if (ti < 0 || !this.teams[ti]?.hearth) return;
    this.teams[ti].hearth = false;
    const t = this.layout.teams[ti];
    this.title(`${t.name} hearth snuffed out`, by ? `by ${by}` : '');
    this.say(`${t.name}'s hearth was snuffed out${by ? ` by ${by}` : ''}. They can no longer respawn.`);
    this.sim.emit({ e: 'sound', s: 'block.break', x, y, z, vol: 2 });
    this.dirty = true;
  }

  canPlace(p: SimPlayer, x: number, y: number, z: number): boolean {
    if (p.mode === 'creative' && p.op) return true;
    if (this.protectedPlayer(p) || this.inLobby(y)) return false;
    if (y > this.layout.buildTop || y < this.layout.voidY) return false;
    if (Math.abs(x) > this.layout.bounds || Math.abs(z) > this.layout.bounds) return false;
    if (this.kind === 'hearthfall') {
      for (const t of this.layout.teams) {
        for (const q of [t.spawn, t.npc]) if (Math.abs(q[0] - 0.5 - x) <= 1 && Math.abs(q[2] - 0.5 - z) <= 1 && y >= q[1] && y <= q[1] + 2) return false;
      }
      for (const g of this.layout.gens) if (Math.abs(g.pos[0] - 0.5 - x) <= 1 && Math.abs(g.pos[2] - 0.5 - z) <= 1 && y >= 65 && y <= 66) return false;
    }
    return true;
  }

  mobInvulnerable(e: Entity): boolean { return e.type === 'quartermaster'; }

  onAttackMob(p: SimPlayer, e: Entity): boolean {
    if (e.type === 'quartermaster') {
      if (this.protectedPlayer(p)) return true;
      this.sim.openScreen(p, 'shop', Math.floor(e.x), Math.floor(e.y), Math.floor(e.z));
      return true;
    }
    if (e.type === 'rival') {
      const pt = [...this.parts.values()].find((x) => x.ent === e.id);
      const me = this.part(p);
      if (!pt || !me || this.protectedPlayer(p)) return true;
      if (this.kind === 'hearthfall' && pt.team === me.team) return true;
      pt.lastHit = p.name;
    }
    return false;
  }

  // ---------- shop ----------
  buy(p: SimPlayer, offerKey: string): string | null {
    const pt = this.part(p);
    if (!pt || this.protectedPlayer(p) || p.dead || this.kind !== 'hearthfall') return 'The Quartermaster only trades during a round.';
    if (p.screen.type !== 'shop') return 'Walk up to your Quartermaster first.';
    const o = SHOP.find((x) => x.key === offerKey);
    if (!o) return 'That offer does not exist.';
    const team = this.teams[pt.team];
    if (o.upgrade === 'forge' && team.forge >= 2) return 'Your forge is already fully upgraded.';
    if (o.upgrade === 'blades' && team.blades) return 'Your team already has sharpened blades.';
    if (o.upgrade === 'plating' && team.plating) return 'Your team already has reinforced plating.';
    const [cur, cost] = o.cost;
    const id = CURRENCY_ITEM[cur];
    let have = 0;
    for (const s of p.inv.slots) if (s && s.id === id) have += s.count;
    if (have < cost) return `You need ${cost} ${CURRENCY_NAME[cur]} (you have ${have}).`;
    let left = cost;
    for (let i = 0; i < p.inv.slots.length && left > 0; i++) {
      const s = p.inv.slots[i];
      if (!s || s.id !== id) continue;
      const take = Math.min(left, s.count);
      s.count -= take; left -= take;
      if (s.count <= 0) p.inv.slots[i] = null;
    }
    const gifts = [...(o.give ?? [])];
    if (o.teamBlock) gifts.push({ id: this.layout.teams[pt.team].wool, count: o.teamBlock });
    for (const g of gifts) {
      const def = getItem(g.id);
      if (def?.armor && !p.inv.armor[def.armor.slot]) { p.inv.armor[def.armor.slot] = { id: g.id, count: 1 }; continue; }
      if (giveItem(p.inv, { ...g }) > 0) this.sim.spawnItem(p.x, p.y + 1, p.z, { ...g });
    }
    if (o.upgrade === 'forge') team.forge++;
    if (o.upgrade === 'blades') team.blades = true;
    if (o.upgrade === 'plating') team.plating = true;
    if (o.upgrade) { this.say(`${p.name} bought ${o.name} for team ${this.layout.teams[pt.team].name}.`); this.dirty = true; }
    this.sim.emit({ e: 'inv', p });
    this.sim.emit({ e: 'sound', s: 'ui.buy', x: p.x, y: p.y + 1, z: p.z, to: p.id });
    return null;
  }

  // ---------- bots ----------
  private enemyTargets(pt: Part): { id: string; x: number; y: number; z: number; ent?: Entity; pl?: SimPlayer }[] {
    const out: { id: string; x: number; y: number; z: number; ent?: Entity; pl?: SimPlayer }[] = [];
    for (const o of this.parts.values()) {
      if (o === pt || !o.alive || (this.kind === 'hearthfall' && o.team === pt.team)) continue;
      if (o.bot) { const e = this.sim.entities.get(o.ent); if (e) out.push({ id: o.id, x: e.x, y: e.y, z: e.z, ent: e }); }
      else { const p = this.sim.players.get(o.id); if (p && !p.dead) out.push({ id: o.id, x: p.x, y: p.y, z: p.z, pl: p }); }
    }
    return out;
  }

  tickNpc(e: Entity): boolean {
    if (e.type === 'quartermaster') {
      let best: SimPlayer | null = null, bd = 64;
      for (const p of this.sim.players.values()) { const d = (p.x - e.x) ** 2 + (p.z - e.z) ** 2; if (d < bd) { bd = d; best = p; } }
      if (best) e.yaw = Math.atan2(-(best.x - e.x), -(best.z - e.z));
      e.vx = 0; e.vz = 0; e.vy = Math.max(e.vy - 28 * DT, -40);
      moveBody(e, 0, e.vy * DT, 0, this.sim.store);
      return true;
    }
    if (e.type !== 'rival') return false;
    const pt = [...this.parts.values()].find((x) => x.ent === e.id);
    if (!pt || this.phase !== 'playing') { this.sim.entities.delete(e.id); this.sim.emit({ e: 'remove', id: e.id, why: 'despawn' }); return true; }
    this.tickBot(e, pt);
    return true;
  }

  private tickBot(e: Entity, pt: Part): void {
    const sim = this.sim, L = this.layout;
    if (e.y < L.voidY) { e.hurt = 0; sim.hurtMob(e, 1000, null, 0, 0); return; }
    if (e.attackCd! > 0) e.attackCd!--;
    if (pt.placeCd > 0) pt.placeCd--;
    let flags = 0;
    const foes = this.enemyTargets(pt);
    let goal: { x: number; y: number; z: number } | null = null;
    let foe = foes.find((f) => f.id === pt.target);
    if (!foe || this.now % 10 === e.id % 10) {
      let bd = Infinity; foe = undefined;
      for (const f of foes) { const d = (f.x - e.x) ** 2 + (f.z - e.z) ** 2 + (f.y - e.y) ** 2 * 4; if (d < bd) { bd = d; foe = f; } }
      pt.target = foe?.id ?? null;
    }
    const foeDist = foe ? Math.hypot(foe.x - e.x, foe.z - e.z) : Infinity;
    let hearth = null as V3 | null;
    const homeT = this.kind === 'hearthfall' ? L.teams[pt.team] : null;
    if (homeT && this.now < pt.rushAt && foeDist > 12) {
      const f = homeT.forge;
      if (Math.hypot(f[0] - e.x, f[2] - e.z) > 1.2) goal = { x: f[0], y: f[1], z: f[2] };
    } else if (this.kind === 'hearthfall' && foeDist > 9) {
      let bd = Infinity;
      for (let i = 0; i < L.teams.length; i++) {
        const t = L.teams[i];
        if (i === pt.team || !this.teams[i].hearth) continue;
        if (![...this.parts.values()].some((x) => x.team === i)) continue;
        const d = (t.hearth[0] - e.x) ** 2 + (t.hearth[2] - e.z) ** 2;
        if (d < bd) { bd = d; hearth = t.hearth; }
      }
    }
    if (hearth) goal = { x: hearth[0] + 0.5, y: hearth[1], z: hearth[2] + 0.5 };
    else if (foe && (!homeT || this.now >= pt.rushAt || foeDist <= 12)) goal = foe;
    let wantX = 0, wantZ = 0;
    const def = { speed: 3.9 };
    if (goal) {
      const dx = goal.x - e.x, dz = goal.z - e.z;
      const d = Math.hypot(dx, dz) || 1;
      e.yaw = Math.atan2(-dx, -dz);
      const stop = hearth ? 1.6 : 1.4;
      if (d > stop) { wantX = (dx / d) * def.speed; wantZ = (dz / d) * def.speed; }
      const ux = dx / d, uz = dz / d;
      const fy = Math.floor(e.y) - 1;
      const ax = Math.floor(e.x + ux * 0.75), az = Math.floor(e.z + uz * 0.75);
      if (e.onGround && d > stop && !isSolid(sim.get(ax, fy, az)) && !isSolid(sim.get(Math.floor(e.x + ux * 0.75), fy - 1, Math.floor(e.z + uz * 0.75)))) {
        if (pt.placeCd <= 0 && fy > L.voidY && Math.abs(ax) <= L.bounds && Math.abs(az) <= L.bounds) {
          const v = L.teams[pt.team]?.wool ?? B.WHITE_WOOL;
          sim.setBlock(ax, fy, az, v);
          sim.emit({ e: 'sound', s: 'block.place', x: ax + 0.5, y: fy + 0.5, z: az + 0.5 });
          pt.placeCd = 3;
          flags |= 4;
        } else { wantX = 0; wantZ = 0; }
      }
      if ((e.hitH || hearth && d <= 2.2) && (wantX || wantZ || hearth)) {
        let bx = Math.floor(e.x + ux * 0.9), by = Math.floor(e.y), bz = Math.floor(e.z + uz * 0.9);
        if (hearth && d <= 2.2) [bx, by, bz] = hearth;
        if (!isSolid(sim.get(bx, by, bz))) by++;
        const v = sim.get(bx, by, bz);
        const k = key(bx, by, bz);
        const breakable = isSolid(v) && (this.placed.has(k) || WOOLS.has(blockId(v)) || (hearth && bx === hearth[0] && by === hearth[1] && bz === hearth[2]) || this.kind === 'spires' && blockId(v) !== B.BEDROCK);
        if (breakable) {
          if (!pt.dig || pt.dig.k !== k) pt.dig = { k, t: 0 };
          pt.dig.t++;
          flags |= 4;
          const need = blockId(v) === B.GLOWSTONE ? 40 : WOOLS.has(blockId(v)) ? 14 : 30;
          if (pt.dig.t >= need) {
            pt.dig = null;
            sim.setBlock(bx, by, bz, 0);
            sim.emit({ e: 'particles', k: 'break', x: bx + 0.5, y: by + 0.5, z: bz + 0.5, d: v });
            this.onBroken(pt.name, bx, by, bz, v);
          }
        } else if (e.onGround) e.vy = 8.2;
      }
    }
    if (foe && foeDist < 2.6 && Math.abs(foe.y - e.y) < 1.8 && e.attackCd! <= 0) {
      e.attackCd = 12;
      flags |= 4;
      const dmg = 1 + pt.bonus + (this.kind === 'hearthfall' && this.teams[pt.team]?.blades ? 1 : 0);
      const kx = (foe.x - e.x) / (foeDist || 1), kz = (foe.z - e.z) / (foeDist || 1);
      if (foe.pl) { this.part(foe.pl)!.lastHit = pt.name; sim.damage(foe.pl, dmg * this.damageScale(foe.pl), 'player', e.x, e.z, true, false, pt.name); }
      else if (foe.ent) {
        const op = this.parts.get(foe.id);
        if (op) op.lastHit = pt.name;
        sim.hurtMob(foe.ent, dmg, null, kx, kz);
      }
    }
    const med = sampleMedium(sim.store, e.x, e.y, e.z, e.hw, e.h, e.h * 0.8);
    const acc = e.onGround ? 0.4 : 0.08;
    e.vx += (wantX - e.vx) * acc;
    e.vz += (wantZ - e.vz) * acc;
    if (med.water) { e.vy = Math.min(e.vy + 24 * DT, 2.2); e.vx *= 0.9; e.vz *= 0.9; }
    else e.vy = Math.max(e.vy - 28 * DT, -40);
    moveBody(e, e.vx * DT, e.vy * DT, e.vz * DT, sim.store);
    e.flags = flags;
  }

  // ---------- commands / state ----------
  command(p: SimPlayer, parts: string[]): string | null {
    if (parts[0] !== 'game' && parts[0] !== 'arena') return null;
    const sub = (parts[1] ?? 'info').toLowerCase();
    const info = ARENA_INFO[this.kind];
    if (sub === 'info') return `${info.name} (${info.alt}). Phase: ${this.phase}. Rivals fill: ${this.botFill}. Ops can use /game start, /game stop, /game bots <0-7>.`;
    if (!p.op) return 'You do not have permission for that command.';
    if (sub === 'start') { if (this.phase === 'playing') return 'A round is already running.'; this.start(); return 'Round started.'; }
    if (sub === 'stop' || sub === 'reset') { this.finish(); return 'Round stopped and arena restored.'; }
    if (sub === 'bots' || sub === 'rivals') {
      const n = Math.max(0, Math.min(7, Number(parts[2] ?? 'NaN')));
      if (!Number.isFinite(n)) return 'Usage: /game bots <0-7>';
      this.botFill = Math.floor(n);
      this.dirty = true;
      return `Rivals will fill up to ${this.botFill} empty slots next round.`;
    }
    return 'Usage: /game info | start | stop | bots <0-7>';
  }

  state(): GameState {
    const L = this.layout;
    return {
      kind: this.kind,
      phase: this.phase,
      timer: Math.ceil((this.phase === 'playing' ? this.timer : this.timer) / 20),
      teams: L.teams.map((t, i) => {
        const ts = this.teams[i];
        const ups: string[] = [];
        if (ts?.forge) ups.push(`Forge ${ts.forge}`);
        if (ts?.blades) ups.push('Blades');
        if (ts?.plating) ups.push('Plating');
        return { name: t.name, color: t.color, hearth: ts ? ts.hearth : true, alive: [...this.parts.values()].filter((p) => p.team === i && !p.out).length, upgrades: ups };
      }),
      players: [...this.parts.values()].map((p) => ({ id: p.id, name: p.name, team: p.team, alive: p.alive && !p.out, bot: p.bot, kills: p.kills, ent: p.bot ? p.ent : undefined })),
      winner: this.winner,
      next: this.kind === 'spires' ? Math.ceil(this.luckyT / 20) : 0,
      bots: this.botFill,
    };
  }
}

import { emptyInv } from '../../inventory';
import { newPlayer, type WorldSim, type SimPlayer, type Entity, type GameHooks, type SimEvent } from '../../sim/WorldSim';
import { duelsLayout, type DuelsLayout } from './layout';
import { DUEL_KITS, KIT_BY_ID, BOT_TIERS, kitInventory, type DuelKitId, type BotTier } from './kits';
import { SparBot } from './SparBot';
import type { V3 } from '../minigames/arena';

type Status = 'lobby' | 'queue' | 'match';

interface Match {
  id: number; arena: number; kit: DuelKitId; a: string; b: string; bot: SparBot | null; tier: BotTier | null;
  phase: 'count' | 'fight' | 'over'; t: number; winner: string | null; changed: Map<string, number>; placed: Set<string>;
}

interface Stat { name: string; wins: number; losses: number; streak: number; best: number; botWins: Partial<Record<BotTier, number>>; }

export interface DuelsState {
  kind: 'duels';
  queues: Record<string, number>;
  matches: { arena: string; kit: string; a: string; b: string; phase: string; t: number }[];
  players: { id: string; name: string; status: Status; kit: string | null; match: number | null }[];
  board: { name: string; wins: number; losses: number; best: number }[];
  challenges: { from: string; fromName: string; to: string; kit: string }[];
  tags: [number, string, string][];
  kits: { id: string; name: string; desc: string }[];
  tiers: { id: string; name: string; desc: string }[];
}

const COUNT = 60, FIGHT_LIMIT = 20 * 240, OVER = 60;
const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
const BOT_LOOKS = [{ skin: 2, hair: 3, shirt: 7, pants: 4 }, { skin: 5, hair: 1, shirt: 2, pants: 9 }, { skin: 0, hair: 6, shirt: 10, pants: 1 }, { skin: 3, hair: 4, shirt: 5, pants: 6 }];

export class Duels implements GameHooks {
  readonly sim: WorldSim;
  readonly layout: DuelsLayout;
  private status = new Map<string, { status: Status; kit: DuelKitId | null; match: number | null }>();
  private matches = new Map<number, Match>();
  private stats = new Map<string, Stat>();
  private challenges = new Map<string, { from: string; kit: DuelKitId; until: number }>();
  private bots = new Map<string, SparBot>();
  private herald = 0;
  private nextId = 1;
  private botN = 0;
  private dirty = true;
  private restoring = false;

  constructor(sim: WorldSim) {
    this.sim = sim;
    this.layout = duelsLayout();
    Object.assign(sim.settings, { pvp: true, dayCycle: false, weatherCycle: false, mobSpawning: false });
    sim.time = 6000;
    sim.weather = 'clear';
    sim.onBotEvent = (ev: SimEvent) => { const id = 'p' in ev ? (ev as { p: SimPlayer }).p.id : ''; this.bots.get(id)?.onEvent(ev); };
    const store = sim.store;
    const orig = store.setBlock.bind(store);
    store.setBlock = (x, y, z, v) => {
      if (!this.restoring) {
        const m = this.matchAt(x, z);
        if (m) { const k = key(x, y, z); if (!m.changed.has(k)) m.changed.set(k, store.getBlock(x, y, z)); if (v) m.placed.add(k); else m.placed.delete(k); }
      }
      orig(x, y, z, v);
    };
  }

  private get now(): number { return this.sim.tickCount; }
  private say(text: string, kind: 'system' | 'info' | 'death' | 'error' = 'system', to?: string): void { this.sim.emit({ e: 'msg', text, kind, to }); }
  private title(text: string, sub: string, to: string): void { this.sim.emit({ e: 'title', text, sub, to }); }
  private st(id: string) { let s = this.status.get(id); if (!s) { s = { status: 'lobby', kit: null, match: null }; this.status.set(id, s); } return s; }
  private stat(name: string): Stat { let s = this.stats.get(name); if (!s) { s = { name, wins: 0, losses: 0, streak: 0, best: 0, botWins: {} }; this.stats.set(name, s); } return s; }

  private matchAt(x: number, z: number): Match | undefined {
    for (const m of this.matches.values()) {
      const ar = this.layout.arenas[m.arena];
      if (Math.abs(x - ar.center[0]) <= ar.half + 2 && Math.abs(z - ar.center[2]) <= ar.half + 2) return m;
    }
    return undefined;
  }

  private matchOf(id: string): Match | undefined {
    const m = this.st(id).match;
    return m === null ? undefined : this.matches.get(m);
  }

  private tpTo(p: SimPlayer, v: V3, yaw?: number): void {
    p.x = v[0]; p.y = v[1]; p.z = v[2]; p.peakY = p.y;
    if (yaw !== undefined) p.yaw = yaw;
    p.vel = { x: 0, y: 0, z: 0 };
    this.sim.emit({ e: 'tp', p, yaw });
  }

  private heal(p: SimPlayer): void {
    p.health = 20; p.food = 20; p.sat = 20; p.exh = 0; p.air = 300; p.fireT = 0; p.absorb = 0; p.hurtCd = 0;
    this.sim.emit({ e: 'vitals', p });
  }

  private toLobby(p: SimPlayer): void {
    const s = this.st(p.id);
    s.status = 'lobby'; s.match = null;
    const l = this.layout.lobby;
    p.spawn = { x: l[0], y: l[1], z: l[2] };
    if (p.dead) return;
    this.heal(p);
    if (p.mode !== 'creative') { p.inv = emptyInv(); this.sim.emit({ e: 'inv', p }); }
    this.tpTo(p, [l[0] + (Math.random() - 0.5) * 6, l[1], l[2] + 3 + Math.random() * 4]);
    this.dirty = true;
  }

  private freeArena(): number {
    const used = new Set([...this.matches.values()].map((m) => m.arena));
    const free = this.layout.arenas.map((_, i) => i).filter((i) => !used.has(i));
    return free.length ? free[Math.floor(Math.random() * free.length)] : -1;
  }

  private start(a: SimPlayer, bId: string, kit: DuelKitId, tier: BotTier | null): string | null {
    const ar = this.freeArena();
    if (ar < 0) return 'Every arena is busy. Try again in a moment.';
    const arena = this.layout.arenas[ar];
    for (let x = arena.center[0] - arena.half - 2; x <= arena.center[0] + arena.half + 18; x += 16) for (let z = arena.center[2] - arena.half - 2; z <= arena.center[2] + arena.half + 18; z += 16) this.sim.store.ensure?.(Math.floor(x), Math.floor(z));
    let b = this.sim.players.get(bId);
    let bot: SparBot | null = null;
    if (tier) {
      const tname = BOT_TIERS.find((x) => x.id === tier)!.name;
      const id = `bot-${++this.botN}`;
      const bp = newPlayer(id, `${tname} Bot`, 'survival', { x: arena.b[0], y: arena.b[1], z: arena.b[2] });
      bp.bot = true;
      bp.appearance = BOT_LOOKS[this.botN % BOT_LOOKS.length];
      bp.op = false;
      this.sim.addPlayer(bp);
      this.sim.emit({ e: 'pjoin', p: bp });
      bot = new SparBot(this.sim, bp, tier, a.id);
      this.bots.set(id, bot);
      b = bp;
    }
    if (!b) return 'That player is not here any more.';
    const m: Match = { id: this.nextId++, arena: ar, kit, a: a.id, b: b.id, bot, tier, phase: 'count', t: COUNT, winner: null, changed: new Map(), placed: new Set() };
    this.matches.set(m.id, m);
    for (const [p, at, face] of [[a, arena.a, Math.PI], [b, arena.b, 0]] as const) {
      const s = this.st(p.id);
      s.status = 'match'; s.match = m.id; s.kit = kit;
      this.challenges.delete(p.id);
      if (p.dead) { p.dead = false; this.sim.emit({ e: 'respawn', p }); }
      p.inv = kitInventory(kit);
      this.heal(p);
      this.sim.emit({ e: 'inv', p });
      this.tpTo(p, at, face);
      p.spawn = { x: at[0], y: at[1], z: at[2] };
    }
    const kn = KIT_BY_ID.get(kit)!.name;
    for (const p of [a, b]) if (!p.bot) { this.title(arena.name, `${kn} duel against ${p === a ? b.name : a.name}`, p.id); this.say(`${kn} duel in ${arena.name} against ${p === a ? b.name : a.name}. Fight in 3 seconds.`, 'info', p.id); }
    this.dirty = true;
    return null;
  }

  private end(m: Match, winner: string | null, why: string): void {
    if (m.phase === 'over') return;
    m.phase = 'over'; m.t = OVER; m.winner = winner;
    if (m.bot) m.bot.active = false;
    const pa = this.sim.players.get(m.a), pb = this.sim.players.get(m.b);
    const name = (id: string, p?: SimPlayer) => p?.name ?? id;
    const kn = KIT_BY_ID.get(m.kit)!.name;
    if (winner) {
      const w = winner === m.a ? pa : pb, l = winner === m.a ? pb : pa;
      const hp = w ? Math.ceil(w.health) / 2 : 0;
      this.say(`${name(winner, w)} beat ${l?.name ?? 'their opponent'} in a ${kn} duel${why ? ` (${why})` : ''} with ${hp} heart${hp === 1 ? '' : 's'} left.`);
      if (w && !w.bot) { const s = this.stat(w.name); s.wins++; s.streak++; s.best = Math.max(s.best, s.streak); if (m.tier) s.botWins[m.tier] = (s.botWins[m.tier] ?? 0) + 1; this.title('Victory', `${hp} heart${hp === 1 ? '' : 's'} left`, w.id); }
      if (l && !l.bot) { const s = this.stat(l.name); s.losses++; s.streak = 0; this.title('Defeat', `${w?.name ?? 'Your opponent'} had ${hp} heart${hp === 1 ? '' : 's'} left`, l.id); }
    } else {
      this.say(`The ${kn} duel between ${name(m.a, pa)} and ${name(m.b, pb)} ended in a draw${why ? ` (${why})` : ''}.`);
      for (const p of [pa, pb]) if (p && !p.bot) this.title('Draw', why, p.id);
    }
    this.dirty = true;
  }

  private close(m: Match): void {
    this.restoring = true;
    for (const [k, v] of m.changed) { const [x, y, z] = k.split(',').map(Number); if (this.sim.get(x, y, z) !== v) this.sim.setBlock(x, y, z, v); }
    this.restoring = false;
    for (const e of [...this.sim.entities.values()]) {
      if ((e.kind === 'item' || e.kind === 'arrow' || e.type === 'pearl') && this.inArena(m.arena, e.x, e.z)) { this.sim.entities.delete(e.id); this.sim.emit({ e: 'remove', id: e.id, why: 'despawn' }); }
    }
    for (const id of [m.a, m.b]) {
      const p = this.sim.players.get(id);
      if (!p) continue;
      if (p.bot) { this.bots.delete(id); this.status.delete(id); this.sim.removePlayer(id); this.sim.emit({ e: 'pquit', p }); continue; }
      const s = this.st(id);
      if (s.match === m.id) this.toLobby(p);
    }
    this.matches.delete(m.id);
    this.dirty = true;
  }

  private inArena(i: number, x: number, z: number): boolean {
    const ar = this.layout.arenas[i];
    return Math.abs(x - ar.center[0]) <= ar.half + 2 && Math.abs(z - ar.center[2]) <= ar.half + 2;
  }

  private ensureHerald(): void {
    if (this.herald && this.sim.entities.has(this.herald)) return;
    const h = this.layout.herald;
    const e = this.sim.spawnMob('quartermaster', h[0], h[1], h[2]);
    if (e) this.herald = e.id;
  }

  tick(): void {
    if (this.now % 20 === 0) this.ensureHerald();
    for (const m of [...this.matches.values()]) {
      const pa = this.sim.players.get(m.a), pb = this.sim.players.get(m.b);
      const ar = this.layout.arenas[m.arena];
      if (m.phase === 'count') {
        for (const [p, at] of [[pa, ar.a], [pb, ar.b]] as const) if (p && !p.dead && Math.hypot(p.x - at[0], p.z - at[2]) > 1.2) this.tpTo(p, at);
        if (--m.t <= 0) {
          m.phase = 'fight'; m.t = FIGHT_LIMIT;
          if (m.bot) m.bot.active = true;
          for (const p of [pa, pb]) if (p && !p.bot) this.title('Fight!', '', p.id);
          this.dirty = true;
        } else if (m.t % 20 === 0) for (const p of [pa, pb]) if (p && !p.bot) this.title(String(m.t / 20), '', p.id);
      } else if (m.phase === 'fight') {
        if (!pa || !pb) { this.end(m, pa ? m.a : pb ? m.b : null, 'opponent left'); continue; }
        for (const p of [pa, pb]) if (!p.dead && (p.y < ar.floorY - 6 || !this.inArena(m.arena, p.x, p.z))) this.sim.damage(p, 1000, 'void', p.x, p.z, false, true);
        if (--m.t <= 0) {
          const ha = pa.health + (pa.absorb ?? 0), hb = pb.health + (pb.absorb ?? 0);
          this.end(m, ha === hb ? null : ha > hb ? m.a : m.b, 'time ran out');
        }
      } else if (--m.t <= 0) this.close(m);
    }
    for (const b of this.bots.values()) b.tick();
    this.matchQueues();
    for (const [to, c] of this.challenges) if (c.until < this.now) this.challenges.delete(to);
    for (const p of this.sim.players.values()) {
      if (p.bot || p.dead) continue;
      const s = this.st(p.id);
      if (s.status !== 'match' && (p.y < 90 || Math.abs(p.x) > 24 || Math.abs(p.z) > 24) && p.mode !== 'creative') this.toLobby(p);
    }
    if (this.dirty || this.now % 40 === 0) { this.dirty = false; this.sim.emit({ e: 'game', state: this.state() }); }
  }

  private matchQueues(): void {
    for (const k of DUEL_KITS) {
      const q = [...this.sim.players.values()].filter((p) => !p.bot && !p.dead && this.st(p.id).status === 'queue' && this.st(p.id).kit === k.id);
      while (q.length >= 2) {
        const a = q.shift()!, b = q.shift()!;
        const err = this.start(a, b.id, k.id, null);
        if (err) { q.length = 0; break; }
      }
    }
  }

  onJoin(p: SimPlayer): void {
    if (p.bot) return;
    if (p.mode !== 'creative') p.mode = 'survival';
    this.st(p.id);
    this.toLobby(p);
    this.say('Welcome to the Proving Grounds. Talk to the Herald (hit or use them) to pick a kit, queue for a duel or spar against a bot. Type /duel help for commands.', 'info', p.id);
  }

  onLeave(p: SimPlayer): void {
    const m = this.matchOf(p.id);
    if (m && m.phase !== 'over') this.end(m, m.a === p.id ? m.b : m.a, `${p.name} left`);
    this.status.delete(p.id);
    this.challenges.delete(p.id);
    for (const [to, c] of this.challenges) if (c.from === p.id) this.challenges.delete(to);
    this.dirty = true;
  }

  onKill(p: SimPlayer, _cause: string, killer?: string): boolean {
    const m = this.matchOf(p.id);
    if (m && m.phase === 'fight') this.end(m, m.a === p.id ? m.b : m.a, killer && killer !== p.name ? '' : 'they fell');
    if (p.bot) { p.dead = false; this.heal(p); }
    return true;
  }

  allowRespawn(): boolean { return true; }
  onRespawn(p: SimPlayer): void {
    const m = this.matchOf(p.id);
    if (m && m.phase !== 'over') return;
    this.toLobby(p);
  }

  canBreak(p: SimPlayer, x: number, y: number, z: number): boolean {
    if (p.mode === 'creative' && p.op) return true;
    const m = this.matchOf(p.id);
    return !!m && m.phase === 'fight' && m.placed.has(key(x, y, z));
  }

  canPlace(p: SimPlayer, x: number, y: number, z: number): boolean {
    if (p.mode === 'creative' && p.op) return true;
    const m = this.matchOf(p.id);
    if (!m || m.phase !== 'fight' || !KIT_BY_ID.get(m.kit)!.build) return false;
    const ar = this.layout.arenas[m.arena];
    return Math.abs(x - ar.center[0] + 0.5) <= ar.half && Math.abs(z - ar.center[2] + 0.5) <= ar.half && y > ar.floorY && y <= ar.floorY + 7;
  }

  onBroken(): void { /* tracked by the store wrapper */ }

  onAttackMob(p: SimPlayer, e: Entity): boolean {
    if (e.id === this.herald) { this.sim.openScreen(p, 'shop', Math.floor(e.x), Math.floor(e.y), Math.floor(e.z)); return true; }
    return true;
  }

  canHurtPlayer(a: SimPlayer, t: SimPlayer): boolean {
    const m = this.matchOf(a.id);
    return !!m && m.phase === 'fight' && (m.a === t.id || m.b === t.id);
  }

  protectedPlayer(p: SimPlayer): boolean {
    const m = this.matchOf(p.id);
    return !m || m.phase !== 'fight';
  }

  damageBonus(): number { return 0; }
  damageScale(): number { return 1; }

  tickNpc(e: Entity): boolean {
    if (e.id !== this.herald) return false;
    let best: SimPlayer | null = null, bd = 100;
    for (const p of this.sim.players.values()) { const d = (p.x - e.x) ** 2 + (p.z - e.z) ** 2; if (d < bd) { bd = d; best = p; } }
    if (best) e.yaw = Math.atan2(-(best.x - e.x), -(best.z - e.z));
    const h = this.layout.herald;
    e.x = h[0]; e.y = h[1]; e.z = h[2]; e.vx = e.vy = e.vz = 0;
    return true;
  }

  mobInvulnerable(e: Entity): boolean { return e.id === this.herald; }
  onMobDeath(): void { /* no mobs */ }

  private kitArg(s: string | undefined): DuelKitId | null {
    const k = (s ?? '').toLowerCase();
    return KIT_BY_ID.has(k as DuelKitId) ? (k as DuelKitId) : null;
  }

  private action(p: SimPlayer, verb: string, arg1?: string, arg2?: string): string | null {
    const s = this.st(p.id);
    if (p.bot) return null;
    const kits = DUEL_KITS.map((k) => k.id).join('|');
    switch (verb) {
      case 'bot': case 'practice': case 'spar': {
        if (s.status === 'match') return 'Finish your current duel first.';
        const kit = this.kitArg(arg1) ?? 'blade';
        const tier = (BOT_TIERS.find((t) => t.id === (arg2 ?? '').toLowerCase())?.id ?? 'knight') as BotTier;
        return this.start(p, '', kit, tier);
      }
      case 'queue': {
        if (s.status === 'match') return 'You are already in a duel.';
        const kit = this.kitArg(arg1);
        if (!kit) return `Pick a kit: /duel queue ${kits}`;
        s.status = 'queue'; s.kit = kit;
        this.dirty = true;
        this.say(`Queued for ${KIT_BY_ID.get(kit)!.name}. You will be matched with the next player who queues for it.`, 'info', p.id);
        return null;
      }
      case 'unqueue': case 'cancel':
        if (s.status === 'queue') { s.status = 'lobby'; this.dirty = true; return 'Left the queue.'; }
        return 'You are not queued.';
      case 'challenge': {
        const t = [...this.sim.players.values()].find((x) => !x.bot && x.name.toLowerCase() === (arg1 ?? '').toLowerCase());
        if (!t || t === p) return 'No player with that name is here.';
        if (this.st(t.id).status === 'match' || s.status === 'match') return 'One of you is already in a duel.';
        const kit = this.kitArg(arg2) ?? 'blade';
        this.challenges.set(t.id, { from: p.id, kit, until: this.now + 20 * 60 });
        this.say(`${p.name} challenges you to a ${KIT_BY_ID.get(kit)!.name} duel. Type /duel accept or open the Herald's menu.`, 'info', t.id);
        this.dirty = true;
        return `Challenge sent to ${t.name}.`;
      }
      case 'accept': {
        const c = this.challenges.get(p.id);
        const from = c ? this.sim.players.get(c.from) : undefined;
        if (!c || !from) return 'You have no challenge waiting.';
        if (this.st(from.id).status === 'match' || s.status === 'match') return 'One of you is already in a duel.';
        this.challenges.delete(p.id);
        return this.start(from, p.id, c.kit, null);
      }
      case 'decline': {
        const c = this.challenges.get(p.id);
        if (!c) return 'You have no challenge waiting.';
        this.challenges.delete(p.id);
        this.say(`${p.name} declined your challenge.`, 'info', c.from);
        this.dirty = true;
        return 'Challenge declined.';
      }
      case 'leave': case 'forfeit': {
        const m = this.matchOf(p.id);
        if (!m || m.phase === 'over') return 'You are not in a duel.';
        this.end(m, m.a === p.id ? m.b : m.a, `${p.name} forfeited`);
        return null;
      }
      case 'stats': {
        const st = this.stat(p.name);
        const bw = BOT_TIERS.map((t) => `${t.name} ${st.botWins[t.id] ?? 0}`).join(', ');
        return `${p.name}: ${st.wins} wins, ${st.losses} losses, best streak ${st.best}. Bots beaten: ${bw}.`;
      }
      case 'help': case '':
        return `Proving Grounds: /duel bot <${kits}> <squire|knight|champion|warlord>, /duel queue <kit>, /duel cancel, /duel challenge <player> <kit>, /duel accept, /duel decline, /duel leave, /duel stats.`;
    }
    return null;
  }

  command(p: SimPlayer, parts: string[]): string | null {
    const cmd = parts[0]?.replace(/^\//, '').toLowerCase();
    if (cmd === 'duel' || cmd === 'duels') return this.action(p, (parts[1] ?? '').toLowerCase(), parts[2], parts[3]) ?? '';
    if (cmd === 'practice' || cmd === 'spar') return this.action(p, 'bot', parts[1], parts[2]) ?? '';
    if (cmd === 'leave' || cmd === 'forfeit') return this.action(p, 'leave') ?? '';
    if (cmd === 'stats') return this.action(p, 'stats');
    return null;
  }

  buy(p: SimPlayer, k: string): string | null {
    const [verb, a, b] = k.split(':');
    const r = this.action(p, verb, a, b);
    if (r) this.say(r, 'info', p.id);
    return null;
  }

  state(): DuelsState {
    const name = (id: string) => this.sim.players.get(id)?.name ?? '?';
    const queues: Record<string, number> = {};
    for (const k of DUEL_KITS) queues[k.id] = 0;
    for (const [id, s] of this.status) if (s.status === 'queue' && s.kit && this.sim.players.has(id)) queues[s.kit]++;
    return {
      kind: 'duels',
      queues,
      matches: [...this.matches.values()].map((m) => ({ arena: this.layout.arenas[m.arena].name, kit: KIT_BY_ID.get(m.kit)!.name, a: name(m.a), b: name(m.b), phase: m.phase, t: Math.ceil(m.t / 20) })),
      players: [...this.sim.players.values()].filter((p) => !p.bot).map((p) => { const s = this.st(p.id); return { id: p.id, name: p.name, status: s.status, kit: s.kit, match: s.match }; }),
      board: [...this.stats.values()].sort((a, b) => b.wins - a.wins || a.losses - b.losses).slice(0, 8).map((s) => ({ name: s.name, wins: s.wins, losses: s.losses, best: s.best })),
      challenges: [...this.challenges].map(([to, c]) => ({ from: c.from, fromName: name(c.from), to, kit: KIT_BY_ID.get(c.kit)!.name })),
      tags: this.herald ? [[this.herald, 'Herald of the Grounds', '#f3d27a']] : [],
      kits: DUEL_KITS.map((k) => ({ id: k.id, name: k.name, desc: k.desc })),
      tiers: BOT_TIERS.map((t) => ({ id: t.id, name: t.name, desc: t.desc })),
    };
  }
}

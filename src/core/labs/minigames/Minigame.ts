import { B, blockId } from '../../blocks';
import { I, toolId, armorId, getItem, ITEM_LIST, CREATIVE_HIDDEN, maxStack } from '../../items';
import { ItemStack, giveItem, emptyInv } from '../../inventory';
import { moveBody } from '../../physics';
import type { WorldSim, SimPlayer, Entity, GameHooks } from '../../sim/WorldSim';
import { ArenaKind, ArenaLayout, arenaLayout, ARENA_INFO, V3, TEAM_TINTS, TEAM_WOOLS } from './arena';
import { SHOP, CURRENCY_ITEM, CURRENCY_NAME, CURRENCIES, ShopOffer, UpgradeKey, UPGRADE_MAX, toolOf, GREAVES_MATS, offerVisible } from './shop';
import { Rivals, Part, Host, Foe, newKit, botArmourPoints, Difficulty, SKILL } from './bots';

export type Phase = 'waiting' | 'countdown' | 'playing' | 'ended';

export interface GamePlayerState { id: string; name: string; team: number; alive: boolean; bot: boolean; kills: number; finals: number; ent?: number; pick: number; axe: number; greaves: number }
export interface GameState {
  kind: ArenaKind;
  phase: Phase;
  timer: number;
  teams: { name: string; color: string; hearth: boolean; alive: number; upgrades: string[]; lv: Partial<Record<UpgradeKey, number>> }[];
  players: GamePlayerState[];
  winner: string | null;
  next: number;
  bots: number;
  event?: { name: string; in: number } | null;
  difficulty?: Difficulty;
}

interface TeamState { hearth: boolean; lv: Record<UpgradeKey, number> }

const DT = 1 / 20;
const BOT_NAMES = ['Kestrel', 'Thornwick', 'Vesper', 'Corvin', 'Sable', 'Quillon', 'Marrow', 'Halcyon', 'Juniper', 'Brisk', 'Wren', 'Ashby', 'Lark', 'Rook', 'Fennic', 'Ostler'];
const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
const sw = (m: number): ItemStack => ({ id: toolId(m, 3), count: 1 });
const MIN = 20 * 60;

interface TimelineEvent { at: number; name: string; run: (g: Minigame) => void }
const TIMELINE: TimelineEvent[] = [
  { at: 4 * MIN, name: 'Diamond II', run: (g) => { g.tier.dia = 2; } },
  { at: 8 * MIN, name: 'Emerald II', run: (g) => { g.tier.em = 2; } },
  { at: 12 * MIN, name: 'Diamond III', run: (g) => { g.tier.dia = 3; } },
  { at: 16 * MIN, name: 'Emerald III', run: (g) => { g.tier.em = 3; } },
  { at: 20 * MIN, name: 'Hearths gutter', run: (g) => g.gutter() },
  { at: 25 * MIN, name: 'Round ends', run: (g) => g.timeUp() },
];
const GEN_EVERY = { dia: [600, 460, 240], em: [1300, 1000, 700] };
const FORGE_RATE = [1, 1.5, 2, 2, 3];

const SPIRES_LIMIT = 8 * MIN;
const FORTUNE_EVERY = 100;
const FORTUNE_BANNED = new Set<number>([B.BEDROCK]);
let fortunePool: number[] | null = null;
function fortuneItems(): number[] {
  if (!fortunePool) {
    const bad = /spawner|end_portal_frame|dragon_egg|command|structure|barrier|jigsaw/;
    fortunePool = ITEM_LIST.filter((it) => !CREATIVE_HIDDEN.has(it.id) && !FORTUNE_BANNED.has(it.id) && !bad.test(it.key)).map((it) => it.id);
  }
  return fortunePool;
}

export function rollFortune(rnd: () => number = Math.random): ItemStack {
  const pool = fortuneItems();
  const id = pool[Math.floor(rnd() * pool.length)];
  const def = getItem(id);
  const cap = maxStack(id);
  let count = 1;
  if (def?.kind === 'block') count = Math.min(cap, 6 + Math.floor(rnd() * 11));
  else if (def?.kind === 'food') count = Math.min(cap, 1 + Math.floor(rnd() * 4));
  else if (def?.kind === 'material') count = Math.min(cap, 1 + Math.floor(rnd() * 6));
  return { id, count };
}

export class Minigame implements GameHooks, Host {
  readonly kind: ArenaKind;
  readonly layout: ArenaLayout;
  readonly sim: WorldSim;
  phase: Phase = 'waiting';
  private timer = 0;
  readonly parts = new Map<string, Part>();
  private teams: TeamState[] = [];
  readonly placed = new Set<string>();
  private changed = new Map<string, number>();
  private restoring = false;
  private genT: number[] = [];
  private luckyT = 0;
  private winner: string | null = null;
  private dirty = true;
  elapsed = 0;
  botFill: number;
  difficulty: Difficulty = 'normal';
  tier = { dia: 1, em: 1 };
  private tnt: [number, number, number][] = [];
  private snared = new Set<number>();
  private rivals: Rivals;

  constructor(sim: WorldSim, kind: ArenaKind) {
    this.sim = sim;
    this.kind = kind;
    this.layout = arenaLayout(kind);
    this.botFill = kind === 'spires' ? 5 : 4;
    this.rivals = new Rivals(this);
    Object.assign(sim.settings, { pvp: true, dayCycle: false, weatherCycle: false });
    sim.time = 6000;
    sim.weather = 'clear';
    const store = sim.store;
    const orig = store.setBlock.bind(store);
    store.setBlock = (x, y, z, v) => {
      if (!this.restoring) {
        const k = key(x, y, z);
        if (!this.changed.has(k)) this.changed.set(k, store.getBlock(x, y, z));
        if (this.phase === 'playing') {
          if (v) this.placed.add(k); else this.placed.delete(k);
          if (blockId(v) === B.TNT) this.tnt.push([x, y, z]);
        }
      }
      orig(x, y, z, v);
    };
  }

  get now(): number { return this.sim.tickCount; }
  private humans(): SimPlayer[] { return [...this.sim.players.values()]; }
  private part(p: SimPlayer): Part | undefined { return this.parts.get(p.id); }
  private teamCount(): number { return this.kind === 'hearthfall' ? this.layout.teams.length : 0; }

  private title(text: string, sub = '', to?: string): void { this.sim.emit({ e: 'title', text, sub, to }); }
  private say(text: string, kind: 'system' | 'info' | 'death' | 'error' = 'system', to?: string): void { this.sim.emit({ e: 'msg', text, kind, to }); }
  private teamSay(team: number, text: string, title?: [string, string]): void {
    for (const pt of this.parts.values()) if (!pt.bot && pt.team === team) { this.say(text, 'info', pt.id); if (title) this.title(title[0], title[1], pt.id); }
  }

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
    this.snared.clear();
    this.tnt = [];
    this.winner = null;
    this.elapsed = 0;
    this.tier = { dia: 1, em: 1 };
    this.luckyT = 60;
    const L = this.layout;
    const hs = this.humans().filter((p) => p.mode === 'survival');
    const tc = this.teamCount();
    this.teams = L.teams.map(() => ({ hearth: true, lv: { edge: 0, bulwark: 0, forge: 0, spring: 0, snare: 0 } }));
    const order = [...hs].sort(() => Math.random() - 0.5);
    const slots = this.kind === 'spires' ? L.spawns.length : tc * 2;
    const humanParts = order.slice(0, slots);
    humanParts.forEach((p, i) => this.parts.set(p.id, this.newPart(p.id, p.name, false, tc ? i % tc : -1)));
    const botCount = Math.max(0, Math.min(this.botFill, slots - humanParts.length));
    const want = Math.min(slots, humanParts.length + botCount);
    let bi = 0;
    const used = new Set<string>();
    while (this.parts.size < want) {
      let team = -1;
      if (tc) { const counts = new Array(tc).fill(0); for (const pt of this.parts.values()) counts[pt.team]++; team = counts.indexOf(Math.min(...counts)); }
      const name = BOT_NAMES[(bi * 7 + Math.floor(Math.random() * BOT_NAMES.length)) % BOT_NAMES.length];
      const id = `bot:${bi++}`;
      if (used.has(name) || [...this.parts.values()].some((x) => x.name === name)) continue;
      used.add(name);
      this.parts.set(id, this.newPart(id, name, true, team));
    }
    if (tc) for (let t = 0; t < tc; t++) {
      const bots = [...this.parts.values()].filter((x) => x.bot && x.team === t);
      const humansOnTeam = [...this.parts.values()].some((x) => !x.bot && x.team === t);
      bots.forEach((b, i) => { b.kit!.role = bots.length === 1 ? (humansOnTeam ? 'guard' : 'solo') : i === 0 ? 'guard' : 'rush'; });
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
        if (tc) this.kitOut(p, pt, true);
        p.spawn = { x: sp[0], y: sp[1], z: sp[2] };
        this.sim.emit({ e: 'inv', p });
        this.sim.emit({ e: 'vitals', p });
        this.tpTo(p, sp);
        p.hurtCd = 40;
      }
    }
    for (const p of hs) if (!this.parts.has(p.id)) this.say('The arena is full this round. You are watching from the gallery.', 'info', p.id);
    if (tc) L.teams.forEach((t) => {
      const e = this.sim.spawnMob('quartermaster', t.npc[0], t.npc[1], t.npc[2]);
      e.yaw = Math.atan2(t.dir[0], t.dir[1]);
    });
    this.genT = L.gens.map(() => 0);
    this.phase = 'playing';
    this.timer = 0;
    this.dirty = true;
    this.title(ARENA_INFO[this.kind].name, this.kind === 'spires' ? 'Last one standing wins' : 'Guard your hearth. Snuff out theirs.');
    if (tc) for (const pt of this.parts.values()) if (!pt.bot) this.say(`You fight for ${L.teams[pt.team].name}. Gather iron and gold at your forge, then visit the Quartermaster.`, 'info', pt.id);
  }

  private newPart(id: string, name: string, bot: boolean, team: number): Part {
    const pt: Part = { id, name, bot, team, alive: true, out: false, kills: 0, finals: 0, ent: 0, respawnAt: 0, lastHit: null, pick: 0, axe: 0, greaves: 0, shears: false };
    if (bot) pt.kit = newKit(SKILL[this.difficulty], 'solo');
    return pt;
  }

  private kitOut(p: SimPlayer, pt: Part, fresh: boolean): void {
    giveItem(p.inv, sw(0));
    if (pt.pick) giveItem(p.inv, { id: toolOf('pick', pt.pick), count: 1 });
    if (pt.axe) giveItem(p.inv, { id: toolOf('axe', pt.axe), count: 1 });
    if (pt.shears) giveItem(p.inv, { id: I.SHEARS, count: 1 });
    if (fresh || !p.inv.armor[0]) p.inv.armor[0] = { id: armorId(0, 0), count: 1 };
    if (fresh || !p.inv.armor[1]) p.inv.armor[1] = { id: armorId(0, 1), count: 1 };
    this.wearGreaves(p, pt);
  }

  private wearGreaves(p: SimPlayer, pt: Part): void {
    const m = GREAVES_MATS[Math.min(3, pt.greaves)];
    p.inv.armor[2] = { id: armorId(m, 2), count: 1 };
    p.inv.armor[3] = { id: armorId(m, 3), count: 1 };
  }

  private spawnBot(pt: Part, sp: V3): void {
    const e = this.sim.spawnMob('rival', sp[0], sp[1], sp[2]);
    e.health = e.maxHealth = 20;
    pt.ent = e.id;
    pt.alive = true;
    const k = pt.kit!;
    k.plan = 'idle'; k.goal = null; k.foe = null; k.dig = null; k.tower = 0; k.best = Infinity; k.bestT = this.now; k.fort = 0; k.trail = []; k.back = false; k.leap = false;
    if (this.kind === 'spires') k.blocks = 0;
    this.dirty = true;
  }

  private end(winner: string | null): void {
    this.phase = 'ended';
    this.timer = 10 * 20;
    this.winner = winner;
    this.dirty = true;
    this.title(winner ? `${winner} wins` : 'Draw', 'Next round soon');
    this.say(winner ? `${winner} won the round.` : [...this.parts.values()].some((p) => !p.out) ? 'The round is a draw.' : 'Nobody survived. The round is a draw.');
    const top = [...this.parts.values()].sort((a, b) => b.finals - a.finals || b.kills - a.kills)[0];
    if (top && (top.kills || top.finals)) this.say(`Most takedowns: ${top.name} with ${top.kills}${this.kind === 'hearthfall' ? ` (${top.finals} final)` : ''}.`);
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
      if (e.kind === 'item' || e.kind === 'arrow' || e.kind === 'tnt' || e.type === 'rival' || e.type === 'quartermaster' || e.type === 'pearl') {
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

  gutter(): void {
    this.teams.forEach((t) => { t.hearth = false; });
    this.title('Hearths gutter', 'Every fall is final now');
    this.say('The hearths have guttered out. Nobody respawns from here.');
    this.dirty = true;
  }

  timeUp(): void {
    const ps = [...this.parts.values()];
    const score = this.layout.teams.map((_, i) => ({ i, alive: ps.filter((p) => p.team === i && !p.out).length, finals: ps.filter((p) => p.team === i).reduce((a, p) => a + p.finals, 0) }));
    score.sort((a, b) => b.alive - a.alive || b.finals - a.finals);
    const best = score[0];
    const tie = score[1] && score[1].alive === best.alive && score[1].finals === best.finals;
    this.say('Time is up.');
    this.end(best && best.alive > 0 && !tie ? this.layout.teams[best.i].name : null);
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
    if (this.tnt.length) {
      const q = this.tnt; this.tnt = [];
      for (const [x, y, z] of q) if (blockId(this.sim.get(x, y, z)) === B.TNT) { this.sim.setBlock(x, y, z, 0); this.sim.primeTnt(x + 0.5, y, z + 0.5, 52); }
    }
    if (this.kind === 'spires') this.tickSpires();
    else this.tickHearthfall();
    if (this.now % 20 === 0) for (const e of [...this.sim.entities.values()]) if (e.kind === 'item' && e.y < L.voidY - 20) { this.sim.entities.delete(e.id); this.sim.emit({ e: 'remove', id: e.id, why: 'despawn' }); }
    if (this.phase === 'playing') this.checkWin();
  }

  private tickSpires(): void {
    if (--this.luckyT <= 0) {
      this.luckyT = FORTUNE_EVERY;
      for (const pt of this.parts.values()) {
        if (!pt.alive) continue;
        const st = rollFortune();
        if (pt.bot) { this.botFortune(pt, st); continue; }
        const p = this.sim.players.get(pt.id);
        if (!p || p.dead) continue;
        if (giveItem(p.inv, st) > 0) this.sim.spawnItem(p.x, p.y + 1, p.z, st);
        this.sim.emit({ e: 'inv', p });
        this.say(`Fortune grants you ${getItem(st.id)?.name ?? 'something'}${st.count > 1 ? ` x${st.count}` : ''}.`, 'info', p.id);
      }
      this.dirty = true;
    }
    if (this.elapsed === SPIRES_LIMIT - MIN) this.say('One minute left. If more than one survivor remains, the one with the most takedowns wins.');
    if (this.elapsed >= SPIRES_LIMIT) {
      const alive = [...this.parts.values()].filter((p) => p.alive || (!p.out && p.respawnAt > 0)).sort((a, b) => b.kills - a.kills);
      const tie = alive.length > 1 && alive[0].kills === alive[1].kills;
      this.say('Time is up.');
      this.end(alive.length && !tie ? alive[0].name : null);
    }
  }

  private botFortune(pt: Part, st: ItemStack): void {
    const k = pt.kit!;
    const def = getItem(st.id);
    const e = this.sim.entities.get(pt.ent);
    if (def?.kind === 'block') {
      const b = def.places !== undefined ? def.places : st.id;
      if (b && b !== B.SAND && b !== B.GRAVEL && b !== B.TNT) k.blocks = Math.min(64, k.blocks + st.count);
    } else if (def?.tool?.type === 'sword' || def?.tool?.type === 'axe') {
      const tier = [0, 1, 2, 2, 3, 3][TOOL_TIER(st.id)];
      k.sword = Math.max(k.sword, tier);
    } else if (def?.armor) pt.greaves = Math.min(3, pt.greaves + (def.armor.points >= 5 ? 1 : def.armor.points >= 3 ? 0.5 : 0.25));
    else if (def?.kind === 'food' && e) { e.health = Math.min(e.maxHealth, e.health + 3); if (st.id === I.GOLDEN_APPLE) k.gapples++; }
  }

  private tickHearthfall(): void {
    const L = this.layout;
    for (const ev of TIMELINE) if (this.elapsed === ev.at) {
      ev.run(this);
      if (ev.name.startsWith('Diamond') || ev.name.startsWith('Emerald')) { this.title(ev.name, `${ev.name.split(' ')[0]} islands work faster`); this.say(`${ev.name}: ${ev.name.split(' ')[0].toLowerCase()} generators speed up.`); }
      this.dirty = true;
      if (this.phase !== 'playing') return;
    }
    if (this.elapsed === 20 * MIN - MIN) this.say('The hearths gutter in one minute. After that, every fall is final.');
    L.gens.forEach((g, i) => {
      let every = g.every, rate = 1;
      if (g.team !== undefined) {
        const lv = this.teams[g.team].lv.forge;
        if (g.needForge && lv < g.needForge) return;
        rate = FORGE_RATE[lv];
      } else if (g.tier) every = GEN_EVERY[g.tier][(g.tier === 'dia' ? this.tier.dia : this.tier.em) - 1];
      this.genT[i] += rate;
      if (this.genT[i] < every) return;
      this.genT[i] = 0;
      const id = CURRENCY_ITEM[g.item];
      let near = 0;
      for (const e of this.sim.entities.values()) if (e.kind === 'item' && e.item!.id === id && Math.abs(e.x - g.pos[0]) < 2 && Math.abs(e.z - g.pos[2]) < 2) near += e.item!.count;
      if (near >= ({ iron: 48, gold: 16, aetherite: 4, emerald: 2 } as const)[g.item]) return;
      const e = this.sim.spawnItem(g.pos[0], g.pos[1], g.pos[2], { id, count: 1 }, 0, 0, 0, 0);
      if (e) e.age = 0;
    });
    if (this.now % 40 === 0) this.teams.forEach((t, i) => {
      if (!t.lv.spring) return;
      const base = L.teams[i].base;
      for (const pt of this.parts.values()) {
        if (pt.team !== i || !pt.alive) continue;
        const b = this.body(pt);
        if (!b || Math.hypot(b.x - base[0], b.z - base[2]) > 10 || Math.abs(b.y - base[1]) > 8) continue;
        if (b.pl) { if (b.pl.health < 20) { b.pl.health = Math.min(20, b.pl.health + 1); this.sim.emit({ e: 'vitals', p: b.pl }); } }
        else if (b.ent && b.ent.health < b.ent.maxHealth) b.ent.health = Math.min(b.ent.maxHealth, b.ent.health + 1);
      }
    });
    if (this.now % 5 === 0) this.teams.forEach((t, i) => {
      if (!t.lv.snare) return;
      const base = L.teams[i].base;
      for (const pt of this.parts.values()) {
        if (pt.team === i || !pt.alive || pt.out) continue;
        const b = this.body(pt);
        if (!b || Math.hypot(b.x - base[0], b.z - base[2]) > 8 || Math.abs(b.y - base[1] - 1) > 5) continue;
        t.lv.snare = 0;
        const name = L.teams[i].name;
        this.teamSay(i, `Tripwire Snare sprung: ${pt.name} is on your island.`, ['Snare sprung', `${pt.name} is on your island`]);
        if (b.pl) { this.sim.damage(b.pl, 3, 'magic', base[0], base[2], true, true, undefined, 1.2); this.say(`You tripped ${name}'s snare.`, 'error', pt.id); }
        else if (b.ent) { this.sim.hurtMob(b.ent, 3, null, (b.ent.x - base[0]) / 8, (b.ent.z - base[2]) / 8, 0.9); b.ent.vy = 9; }
        this.dirty = true;
        break;
      }
    });
  }

  private body(pt: Part): { x: number; y: number; z: number; pl?: SimPlayer; ent?: Entity } | null {
    if (pt.bot) { const e = this.sim.entities.get(pt.ent); return e ? { x: e.x, y: e.y, z: e.z, ent: e } : null; }
    const p = this.sim.players.get(pt.id);
    return p && !p.dead ? { x: p.x, y: p.y, z: p.z, pl: p } : null;
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
    const final = this.kind === 'hearthfall' && !this.teams[pt.team].hearth;
    this.credit(killer ?? pt.lastHit, final);
    pt.lastHit = null;
    pt.alive = false;
    const canRespawn = this.kind === 'hearthfall' && this.teams[pt.team].hearth;
    let handled = false;
    if (this.kind === 'hearthfall') {
      const armor = p.inv.armor.map((s) => (s ? { ...s } : null));
      const loot = p.inv.slots.filter((s): s is ItemStack => !!s && CURRENCIES.some((c) => CURRENCY_ITEM[c] === s.id));
      const kname = killer ?? null;
      const kp = kname ? [...this.sim.players.values()].find((x) => x.name === kname) : undefined;
      if (kp && !kp.dead) { for (const s of loot) giveItem(kp.inv, s); this.sim.emit({ e: 'inv', p: kp }); if (loot.length) this.say(`You took ${loot.map((s) => `${s.count} ${getItem(s.id)?.name ?? ''}`).join(', ')} from ${pt.name}.`, 'info', kp.id); }
      else { const kb = kname ? [...this.parts.values()].find((x) => x.bot && x.name === kname) : undefined; if (kb?.kit) for (const s of loot) { const c = CURRENCIES.find((c) => CURRENCY_ITEM[c] === s.id); if (c) kb.kit.purse[c] += s.count; } }
      pt.pick = Math.max(pt.pick ? 1 : 0, pt.pick - 1);
      pt.axe = Math.max(pt.axe ? 1 : 0, pt.axe - 1);
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
      this.say(`${pt.name} has been eliminated${final ? ' (final takedown)' : ''}.`);
    }
    this.dirty = true;
    return handled;
  }

  private credit(name: string | null | undefined, final = false): void {
    if (!name) return;
    for (const x of this.parts.values()) if (x.name === name) { x.kills++; if (final) x.finals++; break; }
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
    if (this.kind === 'hearthfall') { this.kitOut(p, pt, false); this.sim.emit({ e: 'inv', p }); p.hurtCd = 60; }
    this.dirty = true;
  }

  onMobDeath(e: Entity, by: string | null): void {
    const pt = [...this.parts.values()].find((x) => x.bot && x.ent === e.id);
    if (!pt) return;
    const killerName = by ? this.sim.players.get(by)?.name ?? null : pt.lastHit;
    const final = this.kind === 'hearthfall' && !this.teams[pt.team].hearth;
    this.credit(killerName, final);
    const k = pt.kit!;
    if (this.kind === 'hearthfall') {
      const kp = killerName ? [...this.sim.players.values()].find((x) => x.name === killerName) : undefined;
      const loot = CURRENCIES.filter((c) => k.purse[c] > 0).map((c) => ({ id: CURRENCY_ITEM[c], count: k.purse[c] }));
      if (kp && !kp.dead && loot.length) { for (const s of loot) giveItem(kp.inv, { ...s }); this.sim.emit({ e: 'inv', p: kp }); this.say(`You took ${loot.map((s) => `${s.count} ${getItem(s.id)?.name ?? ''}`).join(', ')} from ${pt.name}.`, 'info', kp.id); }
      k.purse = { iron: 0, gold: 0, aetherite: 0, emerald: 0 };
      k.blocks = 0; k.sword = 0; k.gapples = 0;
      pt.pick = Math.max(pt.pick ? 1 : 0, pt.pick - 1);
    }
    pt.alive = false;
    pt.ent = 0;
    pt.lastHit = null;
    if (this.kind === 'hearthfall' && this.teams[pt.team].hearth) pt.respawnAt = this.now + 100;
    else { pt.out = true; this.say(`${pt.name} has been eliminated${final ? ' (final takedown)' : ''}.`); }
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
    if (!pt || this.kind !== 'hearthfall' || !this.teams[pt.team]?.lv.edge) return 0;
    const held = p.inv.slots[p.inv.selected];
    return held && getItem(held.id)?.tool?.type === 'sword' ? 1 : 0;
  }

  damageScale(p: SimPlayer): number {
    const pt = this.part(p);
    return pt && this.kind === 'hearthfall' ? 1 - 0.08 * (this.teams[pt.team]?.lv.bulwark ?? 0) : 1;
  }

  mobDamageScale(e: Entity): number {
    if (e.type !== 'rival') return 1;
    const pt = [...this.parts.values()].find((x) => x.ent === e.id);
    if (!pt) return 1;
    const armour = 1 - Math.min(20, botArmourPoints(pt)) / 25;
    return armour * (this.kind === 'hearthfall' ? 1 - 0.08 * (this.teams[pt.team]?.lv.bulwark ?? 0) : 1);
  }

  blastable(x: number, y: number, z: number, v: number): boolean {
    if (y >= 99) return false;
    const id = blockId(v);
    if (id === B.BEDROCK) return false;
    if (this.kind === 'spires') return true;
    if (id === B.GLASS || id === B.OBSIDIAN || TEAM_TINTS.some((t) => t.glass === id)) return false;
    return this.placed.has(key(x, y, z));
  }

  private inLobby(y: number): boolean { return y >= 99; }

  canBreak(p: SimPlayer, x: number, y: number, z: number, v: number): boolean {
    if (p.mode === 'creative' && p.op) return true;
    if (this.protectedPlayer(p) || this.inLobby(y)) return false;
    if (this.kind === 'spires') return blockId(v) !== B.BEDROCK;
    const k = key(x, y, z);
    if (this.placed.has(k)) return true;
    const id = blockId(v);
    if (TEAM_WOOLS.has(id)) return true;
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
    return this.canBotPlace(x, y, z);
  }

  canBotPlace(x: number, y: number, z: number): boolean {
    if (y > this.layout.buildTop || y < this.layout.voidY || y >= 99) return false;
    if (Math.abs(x) > this.layout.bounds || Math.abs(z) > this.layout.bounds) return false;
    if (this.kind === 'hearthfall') {
      for (const t of this.layout.teams) {
        for (const q of [t.spawn, t.npc]) if (Math.abs(q[0] - 0.5 - x) <= 1 && Math.abs(q[2] - 0.5 - z) <= 1 && y >= q[1] && y <= q[1] + 2) return false;
      }
      for (const g of this.layout.gens) if (Math.abs(g.pos[0] - 0.5 - x) <= 1 && Math.abs(g.pos[2] - 0.5 - z) <= 1 && y >= Math.floor(g.pos[1]) && y <= Math.floor(g.pos[1]) + 1) return false;
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

  // ---------- bot host ----------
  hearthAlive(team: number): boolean { return !!this.teams[team]?.hearth; }
  level(team: number, k: UpgradeKey): number { return this.teams[team]?.lv[k] ?? 0; }

  botUpgrade(pt: Part, o: ShopOffer): boolean {
    if (!o.upgrade || !o.level) return false;
    const t = this.teams[pt.team];
    if (t.lv[o.upgrade] !== o.level - 1) return false;
    t.lv[o.upgrade] = o.level;
    this.say(`${pt.name} bought ${o.name} for team ${this.layout.teams[pt.team].name}.`);
    this.dirty = true;
    return true;
  }

  botBreak(pt: Part, x: number, y: number, z: number, v: number): void {
    this.sim.setBlock(x, y, z, 0);
    this.sim.emit({ e: 'particles', k: 'break', x: x + 0.5, y: y + 0.5, z: z + 0.5, d: v });
    this.onBroken(pt.name, x, y, z, v);
  }

  botPlace(_pt: Part, x: number, y: number, z: number, v: number): void {
    this.sim.setBlock(x, y, z, v);
    this.sim.emit({ e: 'sound', s: 'block.place', x: x + 0.5, y: y + 0.5, z: z + 0.5 });
  }

  botStrike(pt: Part, foe: Foe, dmg: number): void {
    const e = this.sim.entities.get(pt.ent);
    if (!e) return;
    const d = Math.hypot(foe.x - e.x, foe.z - e.z) || 1;
    const kx = (foe.x - e.x) / d, kz = (foe.z - e.z) / d;
    foe.part.lastHit = pt.name;
    if (foe.pl) this.sim.damage(foe.pl, dmg * this.damageScale(foe.pl), 'player', e.x, e.z, true, false, pt.name);
    else if (foe.ent) this.sim.hurtMob(foe.ent, dmg, null, kx, kz);
  }

  // ---------- shop ----------
  buy(p: SimPlayer, offerKey: string): string | null {
    const pt = this.part(p);
    if (!pt || this.protectedPlayer(p) || p.dead || this.kind !== 'hearthfall') return 'The Quartermaster only trades during a round.';
    if (p.screen.type !== 'shop') return 'Walk up to your Quartermaster first.';
    const o = SHOP.find((x) => x.key === offerKey);
    if (!o) return 'That offer does not exist.';
    const team = this.teams[pt.team];
    const ctx = { pick: pt.pick, axe: pt.axe, greaves: pt.greaves, lv: team.lv };
    if (o.upgrade && o.level && team.lv[o.upgrade] >= o.level) return `Your team already has ${o.name}.`;
    if (o.upgrade && team.lv[o.upgrade] >= UPGRADE_MAX[o.upgrade]) return 'That upgrade is maxed out.';
    if (!offerVisible(o, ctx)) return o.tool || o.greaves ? 'Buy the tier before this one first.' : 'Buy the level before this one first.';
    if (o.key === 'shears' && pt.shears) return 'You already have shears.';
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
    const give = (st: ItemStack) => { if (giveItem(p.inv, st) > 0) this.sim.spawnItem(p.x, p.y + 1, p.z, st); };
    if (o.key.endsWith('_sword')) {
      for (let i = 0; i < p.inv.slots.length; i++) if (p.inv.slots[i]?.id === toolId(0, 3)) { p.inv.slots[i] = null; break; }
    }
    if (o.tool) {
      const prev = toolOf(o.tool, (o.tool === 'pick' ? pt.pick : pt.axe));
      for (let i = 0; i < p.inv.slots.length; i++) if (p.inv.slots[i]?.id === prev && (o.tool === 'pick' ? pt.pick : pt.axe) > 0) { p.inv.slots[i] = null; break; }
      if (o.tool === 'pick') pt.pick = o.tier!; else pt.axe = o.tier!;
      give({ id: toolOf(o.tool, o.tier!), count: 1 });
    }
    if (o.greaves) { pt.greaves = o.greaves; this.wearGreaves(p, pt); }
    if (o.key === 'shears') pt.shears = true;
    for (const g of o.give ?? []) give({ id: g.id, count: g.count, ...(g.en ? { en: { ...g.en } } : {}) });
    if (o.team) { const t = TEAM_TINTS[pt.team]; give({ id: t[o.team[0]], count: o.team[1] }); }
    if (o.upgrade && o.level) {
      team.lv[o.upgrade] = o.level;
      this.say(`${p.name} bought ${o.name} for team ${this.layout.teams[pt.team].name}.`);
      this.dirty = true;
    }
    this.sim.emit({ e: 'inv', p });
    this.sim.emit({ e: 'sound', s: 'ui.buy', x: p.x, y: p.y + 1, z: p.z, to: p.id });
    this.dirty = true;
    return null;
  }

  // ---------- bots ----------
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
    this.rivals.tick(e, pt);
    return true;
  }

  // ---------- commands / state ----------
  command(p: SimPlayer, parts: string[]): string | null {
    if (parts[0] !== 'game' && parts[0] !== 'arena') return null;
    const sub = (parts[1] ?? 'info').toLowerCase();
    const info = ARENA_INFO[this.kind];
    if (sub === 'info') return `${info.name} (${info.alt}). Phase: ${this.phase}. Rivals fill: ${this.botFill}, skill: ${this.difficulty}. Ops can use /game start, /game stop, /game bots <0-7>, /game skill <easy|normal|hard>.`;
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
    if (sub === 'skill' || sub === 'difficulty') {
      const d = (parts[2] ?? '').toLowerCase();
      if (d !== 'easy' && d !== 'normal' && d !== 'hard') return 'Usage: /game skill <easy|normal|hard>';
      this.difficulty = d;
      for (const pt of this.parts.values()) if (pt.kit) pt.kit.skill = SKILL[d];
      this.dirty = true;
      return `Rivals now fight at ${d} skill.`;
    }
    return 'Usage: /game info | start | stop | bots <0-7> | skill <easy|normal|hard>';
  }

  private nextEvent(): { name: string; in: number } | null {
    if (this.phase !== 'playing') return null;
    if (this.kind === 'spires') return { name: 'Time limit', in: Math.max(0, Math.ceil((SPIRES_LIMIT - this.elapsed) / 20)) };
    const ev = TIMELINE.find((x) => x.at > this.elapsed);
    return ev ? { name: ev.name, in: Math.ceil((ev.at - this.elapsed) / 20) } : null;
  }

  state(): GameState {
    const L = this.layout;
    return {
      kind: this.kind,
      phase: this.phase,
      timer: Math.ceil(this.timer / 20),
      teams: L.teams.map((t, i) => {
        const ts = this.teams[i];
        const ups: string[] = [];
        if (ts) {
          const names: Record<UpgradeKey, string[]> = { forge: ['', 'Iron Forge', 'Golden Forge', 'Emerald Forge', 'Molten Forge'], bulwark: ['', 'Bulwark I', 'Bulwark II', 'Bulwark III', 'Bulwark IV'], edge: ['', 'Keen Edge'], spring: ['', 'Mending Spring'], snare: ['', 'Snare set'] };
          for (const k of Object.keys(names) as UpgradeKey[]) if (ts.lv[k]) ups.push(names[k][ts.lv[k]]);
        }
        return { name: t.name, color: t.color, hearth: ts ? ts.hearth : true, alive: [...this.parts.values()].filter((p) => p.team === i && !p.out).length, upgrades: ups, lv: ts ? { ...ts.lv } : {} };
      }),
      players: [...this.parts.values()].map((p) => ({ id: p.id, name: p.name, team: p.team, alive: p.alive && !p.out, bot: p.bot, kills: p.kills, finals: p.finals, ent: p.bot ? p.ent : undefined, pick: p.pick, axe: p.axe, greaves: p.greaves })),
      winner: this.winner,
      next: this.kind === 'spires' ? Math.ceil(this.luckyT / 20) : 0,
      bots: this.botFill,
      event: this.nextEvent(),
      difficulty: this.difficulty,
    };
  }
}

function TOOL_TIER(id: number): number {
  const m = Math.floor((id - 300) / 5);
  return [1, 2, 3, 2, 4, 5][m] ?? 0;
}

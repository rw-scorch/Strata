import type { WorldSim, SimPlayer } from './WorldSim';
import { blockId, getBlock, isSolid, isWaterLike, B } from '../blocks';
import { WORLD_HEIGHT, type GameMode } from '../constants';
import { I, armorId, toolId, getItem, ITEM_BY_KEY } from '../items';
import { emptyInv, giveItem, type ItemStack, type PlayerInv } from '../inventory';
import { money } from '../economy';
import { resolveItem, blockValueOf } from './lootdrop';
import { kitInvOf } from './kits';
import { isNether, localX } from '../dimension';

export type BuiltinKit = 'own' | 'iron' | 'diamond' | 'netherite';
export type CrucibleKit = BuiltinKit | string;
export function isBuiltinKit(k: string): k is BuiltinKit { return k === 'own' || k === 'iron' || k === 'diamond' || k === 'netherite'; }
export type CrucibleArena = 'forge' | 'here';
export type CruciblePhase = 'open' | 'ready' | 'fight' | 'done';
export interface Prize { key: string; n: number; maxed?: boolean }
export interface CrucibleCfg {
  join: number; fight: number; radius: number; min: number; max: number;
  kit: CrucibleKit; arena: CrucibleArena; ring: boolean;
  money: number; second: number; fee: number; prize: Prize[];
}
export interface CrucibleView {
  ph: CruciblePhase; left: number; n: number; alive: number; max: number; f: string[];
  x: number; z: number; r: number; R: number; kit: CrucibleKit; pot: number; w?: string;
}
export interface CrucibleStash { x: number; y: number; z: number; mode: GameMode; inv?: PlayerInv }

export const CRUCIBLE_DEFAULTS: CrucibleCfg = {
  join: 60, fight: 300, radius: 14, min: 2, max: 16, kit: 'diamond', arena: 'forge', ring: true,
  money: 1000, second: 250, fee: 0, prize: [{ key: 'diamond', n: 8 }, { key: 'golden_apple', n: 4 }, { key: 'experience_bottle', n: 16 }],
};

export const CRUCIBLE_LIMITS = { join: [15, 600], fight: [60, 1800], radius: [6, 32], min: [2, 32], max: [2, 32], money: [0, 10_000_000], second: [0, 10_000_000], fee: [0, 1_000_000] } as const;

export const KIT_NAMES: Record<BuiltinKit, string> = { own: 'their own gear', iron: 'an iron kit', diamond: 'a diamond kit', netherite: 'a netherite kit' };

const KEYS: Record<string, keyof CrucibleCfg> = {
  join: 'join', wait: 'join', t: 'fight', time: 'fight', fight: 'fight', r: 'radius', radius: 'radius', size: 'radius', min: 'min', max: 'max',
  kit: 'kit', arena: 'arena', ring: 'ring', shrink: 'ring', money: 'money', reward: 'money', coins: 'money', second: 'second', runnerup: 'second',
  fee: 'fee', entry: 'fee', prize: 'prize', items: 'prize', i: 'prize',
};

function num(v: string, lo: number, hi: number): number | null {
  const m = /^\$?(\d+(?:\.\d+)?)([kmb])?$/i.exec(v.trim());
  if (!m) return null;
  const n = Number(m[1]) * ({ k: 1e3, m: 1e6, b: 1e9 }[(m[2] ?? '').toLowerCase() as 'k'] ?? 1);
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

function itemByName(key: string): { id: number } | undefined {
  const k = key.toLowerCase();
  const hit = ITEM_BY_KEY.get(k);
  if (hit) return hit;
  for (let i = 1; i < 8192; i++) { const d = getItem(i); if (d && (d.key === k || d.name.toLowerCase() === k)) return d; }
  return undefined;
}

export function prizeId(key: string): number | null { return resolveItem(key, itemByName); }

export function parseCrucibleArgs(base: CrucibleCfg, args: string[]): { cfg: CrucibleCfg; err?: string } {
  const cfg: CrucibleCfg = { ...base, prize: base.prize.map((p) => ({ ...p })) };
  for (const a of args) {
    const eq = a.indexOf('=');
    if (eq < 1) return { cfg, err: `Expected key=value, got "${a}"` };
    const key = KEYS[a.slice(0, eq).toLowerCase()];
    const v = a.slice(eq + 1).toLowerCase();
    if (!key) return { cfg, err: `Unknown Crucible option "${a.slice(0, eq)}"` };
    switch (key) {
      case 'join': case 'fight': case 'radius': case 'min': case 'max': case 'money': case 'second': case 'fee': {
        const [lo, hi] = CRUCIBLE_LIMITS[key];
        const n = num(v, lo, hi);
        if (n === null) return { cfg, err: `${key} must be a number` };
        cfg[key] = n;
        break;
      }
      case 'kit': if (!isBuiltinKit(v) && !/^[a-z0-9_-]{1,20}$/.test(v)) return { cfg, err: 'kit is own, iron, diamond, netherite or the name of a saved kit' }; cfg.kit = v; break;
      case 'arena': if (v !== 'forge' && v !== 'here') return { cfg, err: 'arena is forge (build one) or here (use the ground)' }; cfg.arena = v; break;
      case 'ring': cfg.ring = v === 'on' || v === 'true' || v === '1' || v === 'yes'; break;
      case 'prize': {
        if (v === 'none' || v === '') { cfg.prize = []; break; }
        if (v === 'default') { cfg.prize = CRUCIBLE_DEFAULTS.prize.map((p) => ({ ...p })); break; }
        const out: Prize[] = [];
        for (const part of v.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 27)) {
          const [k, c = '1'] = part.split(':');
          const maxed = k.endsWith('+');
          const name = maxed ? k.slice(0, -1) : k;
          if (prizeId(name) === null) return { cfg, err: `No item called "${name}"` };
          out.push({ key: name, n: Math.max(1, Math.min(64, Math.floor(Number(c)) || 1)), maxed: maxed || undefined });
        }
        cfg.prize = out;
        break;
      }
    }
  }
  if (cfg.min > cfg.max) cfg.min = cfg.max;
  return { cfg };
}

export function crucibleArgs(c: CrucibleCfg): string {
  return [`join=${c.join}`, `time=${c.fight}`, `r=${c.radius}`, `min=${c.min}`, `max=${c.max}`, `kit=${c.kit}`, `arena=${c.arena}`, `ring=${c.ring ? 'on' : 'off'}`,
    `money=${c.money}`, `second=${c.second}`, `fee=${c.fee}`, `prize=${c.prize.length ? c.prize.map((p) => `${p.key}${p.maxed ? '+' : ''}:${p.n}`).join(',') : 'none'}`].join(' ');
}

export function sanitizeCrucible(raw: unknown): CrucibleCfg {
  if (!raw || typeof raw !== 'object') return { ...CRUCIBLE_DEFAULTS, prize: CRUCIBLE_DEFAULTS.prize.map((p) => ({ ...p })) };
  try { return parseCrucibleArgs(CRUCIBLE_DEFAULTS, crucibleArgs({ ...CRUCIBLE_DEFAULTS, ...(raw as Partial<CrucibleCfg>) }).split(' ')).cfg; } catch { return { ...CRUCIBLE_DEFAULTS }; }
}

export function prizeLabel(c: CrucibleCfg, pot: number): string {
  const parts = c.prize.map((p) => `${p.n} ${itemByName(p.key) ? (getItem(prizeId(p.key)!)?.name ?? p.key) : p.key}${p.maxed ? ' (max enchanted)' : ''}`);
  if (pot > 0) parts.unshift(money(pot));
  return parts.length ? parts.join(', ') : 'glory';
}

export function ringRadius(R: number, ring: boolean, frac: number): number {
  if (!ring || frac <= 0.5) return R;
  const k = Math.min(1, (frac - 0.5) / 0.4);
  return Math.round((R - (R - Math.max(3, R * 0.25)) * k) * 10) / 10;
}

export function kitLabel(kit: string): string { return isBuiltinKit(kit) ? KIT_NAMES[kit] : `the ${kit} kit`; }

export function kitInv(kit: Exclude<BuiltinKit, 'own'>, maxEnchant: (s: ItemStack) => void): PlayerInv {
  const inv = emptyInv();
  const tool = kit === 'iron' ? 2 : kit === 'diamond' ? 4 : 5, arm = kit === 'iron' ? 1 : kit === 'diamond' ? 3 : 4;
  const en = (st: ItemStack, e: Record<string, number>): ItemStack => { if (kit === 'netherite') maxEnchant(st); else if (kit === 'diamond') st.en = e; return st; };
  for (let s = 0; s < 4; s++) inv.armor[s] = en({ id: armorId(arm, s), count: 1 }, { protection: 2 });
  const put: ItemStack[] = [
    en({ id: toolId(tool, 3), count: 1 }, { sharpness: 2 }),
    en({ id: toolId(tool, 1), count: 1 }, { efficiency: 1 }),
    en({ id: I.BOW, count: 1 }, { power: 2 }),
    { id: I.ARROW, count: kit === 'iron' ? 24 : 48 },
    { id: I.COOKED_PORK, count: 12 },
    { id: I.GOLDEN_APPLE, count: kit === 'iron' ? 1 : kit === 'diamond' ? 3 : 5 },
  ];
  put.forEach((st, i) => { inv.slots[i] = st; });
  inv.off[0] = { id: I.SHIELD, count: 1 };
  return inv;
}

interface Entrant { id: string; name: string; paid: number; alive: boolean; kills: number; place: number; staged: boolean }
interface Bout {
  ph: CruciblePhase; cfg: CrucibleCfg; host: string;
  cx: number; cz: number; fy: number; R: number; r: number; built: boolean; nether: boolean;
  until: number; start: number; pot: number;
  entrants: Map<string, Entrant>;
  winner: string | null; warned: Map<string, number>; said: number;
}

const WALL = 5;
const OK_CMDS = new Set(['crucible', 'pvpevent', 'msg', 'tell', 'w', 'r', 'me', 'help', 'list', 'bal', 'balance', 'money']);

export class Crucible {
  private b: Bout | null = null;

  constructor(private sim: WorldSim) {}

  get active(): boolean { return !!this.b; }
  get phase(): CruciblePhase | null { return this.b?.ph ?? null; }
  get cfg(): CrucibleCfg { return sanitizeCrucible(this.sim.settings.crucible); }

  private staged(p: SimPlayer): Entrant | null {
    const b = this.b;
    if (!b || b.ph === 'open') return null;
    const e = b.entrants.get(p.id);
    return e && e.staged ? e : null;
  }

  private alive(): Entrant[] { return this.b ? [...this.b.entrants.values()].filter((e) => e.staged && e.alive) : []; }

  pvp(a: SimPlayer, t: SimPlayer): boolean | null {
    const b = this.b;
    if (!b || b.ph === 'open') return null;
    const ea = this.staged(a), et = this.staged(t);
    if (!ea && !et) return null;
    return b.ph === 'fight' && !!ea?.alive && !!et?.alive;
  }

  shield(p: SimPlayer): boolean {
    const e = this.staged(p);
    return !!e && e.alive && this.b!.ph !== 'fight';
  }

  busy(p: SimPlayer): boolean { const e = this.staged(p); return !!e && e.alive; }

  blocks(p: SimPlayer, cmd: string): string | null {
    if (!this.busy(p) || OK_CMDS.has(cmd)) return null;
    return `You cannot use /${cmd} inside the Crucible. Type /crucible leave to forfeit.`;
  }

  private inside(x: number, y: number, z: number, pad = 2): boolean {
    const b = this.b!;
    return Math.hypot(x + 0.5 - b.cx, z + 0.5 - b.cz) <= b.R + pad && y >= b.fy - 6 && y <= b.fy + 24;
  }

  locked(p: SimPlayer, x: number, y: number, z: number): boolean {
    const b = this.b;
    if (!b || (p.op && p.mode === 'creative') || !this.inside(x, y, z)) return false;
    const e = this.staged(p);
    if (!e || !e.alive || b.ph !== 'fight') return true;
    return b.built && (y <= b.fy || Math.hypot(x + 0.5 - b.cx, z + 0.5 - b.cz) >= b.R + 0.5);
  }

  stashOf(p: SimPlayer): CrucibleStash | undefined { return p.cru; }

  view(): CrucibleView | null {
    const b = this.b;
    if (!b) return null;
    const list = b.ph === 'open' ? [...b.entrants.values()] : this.alive();
    return {
      ph: b.ph, left: Math.max(0, Math.ceil((b.until - this.sim.tickCount) / 20)), n: b.entrants.size, alive: this.alive().length, max: b.cfg.max,
      f: list.map((e) => e.id), x: b.cx, z: b.cz, r: b.r, R: b.R, kit: b.cfg.kit, pot: b.cfg.money + b.pot, w: b.winner ? b.entrants.get(b.winner)?.name : undefined,
    };
  }

  private push(): void { this.sim.emit({ e: 'crucible', v: this.view() }); }
  private say(text: string, to?: string): void { this.sim.emit({ e: 'msg', text, kind: 'info', to }); }
  private bank() { const k = this.sim.bank; return k && k.on() ? k : null; }

  command(p: SimPlayer, parts: string[], allowed: boolean): string {
    const sub = (parts[1] ?? '').toLowerCase();
    const need = 'Only operators can run the Crucible.';
    switch (sub) {
      case '': case 'status': case 'info': return this.status();
      case 'join': case 'enter': return this.join(p);
      case 'leave': case 'quit': case 'forfeit': return this.leave(p);
      case 'watch': case 'spectate': return this.watch(p);
      case 'help': return 'Players: /crucible join, /crucible leave, /crucible watch, /crucible status. Operators: /crucible start [options], /crucible go, /crucible stop, /crucible set [options], /crucible show, /crucible reset. Options: join=seconds time=seconds r=6-32 min=2-32 max=2-32 kit=own|iron|diamond|netherite arena=forge|here ring=on|off money=coins second=coins fee=coins prize=item:count,... (add + after a name for max enchants, prize=none for coins only).';
      case 'show': case 'config': if (!allowed) return need; return `Crucible settings: ${crucibleArgs(this.cfg)}`;
      case 'reset': if (!allowed) return need; this.sim.settings.crucible = { ...CRUCIBLE_DEFAULTS }; this.sim.emit({ e: 'rules' }); return 'Crucible settings reset to the defaults.';
      case 'set': case 'save': {
        if (!allowed) return need;
        const { cfg, err } = parseCrucibleArgs(this.cfg, parts.slice(2).filter(Boolean));
        if (err) return `${err}. Try /crucible help.`;
        this.sim.settings.crucible = cfg; this.sim.emit({ e: 'rules' });
        return `Crucible settings saved: ${crucibleArgs(cfg)}`;
      }
      case 'start': case 'open': case 'host': {
        if (!allowed) return need;
        const { cfg, err } = parseCrucibleArgs(this.cfg, parts.slice(2).filter(Boolean));
        if (err) return `${err}. Try /crucible help.`;
        return this.open(p, cfg);
      }
      case 'go': case 'begin': case 'now': {
        if (!allowed) return need;
        if (this.b?.ph !== 'open') return 'There is no Crucible waiting for challengers.';
        this.begin();
        return '';
      }
      case 'stop': case 'cancel': case 'end': {
        if (!allowed) return need;
        if (!this.b) return 'There is no Crucible running.';
        this.cancel(`${p.name} called off the Crucible.`);
        return '';
      }
      default: return 'Unknown option. Try /crucible help.';
    }
  }

  private status(): string {
    const b = this.b;
    if (!b) return 'No Crucible is running. Operators can open one from the Sovereign Console or with /crucible start.';
    const v = this.view()!;
    const t = `${Math.floor(v.left / 60)}:${String(v.left % 60).padStart(2, '0')}`;
    if (b.ph === 'open') return `The Crucible is open: ${b.entrants.size}/${b.cfg.max} entered, fight starts in ${t}. Prize: ${prizeLabel(b.cfg, b.cfg.money + b.pot)}. Type /crucible join.`;
    if (b.ph === 'fight') return `The Crucible is fighting: ${v.alive} remain, ${t} left${b.cfg.ring ? `, ring ${Math.round(b.r)} blocks` : ''}.`;
    return `The Crucible is ${b.ph === 'ready' ? 'about to begin' : 'finishing'}.`;
  }

  open(p: SimPlayer, cfg: CrucibleCfg): string {
    const sim = this.sim;
    if (!sim.authoritative) return '';
    if (this.b) return 'A Crucible is already running. Use /crucible stop first.';
    if (p.dead) return 'You cannot do that while dead.';
    const cx = Math.floor(p.x), cz = Math.floor(p.z);
    let fy = Math.floor(p.y - 0.01);
    while (fy > Math.floor(p.y) - 5 && fy > 1 && !isSolid(sim.get(cx, fy, cz))) fy--;
    if (fy < 2 || fy > WORLD_HEIGHT - 30 || !isSolid(sim.get(cx, fy, cz))) return 'Stand on solid ground to open the Crucible.';
    if (!isBuiltinKit(cfg.kit) && !sim.kits[cfg.kit]) return `There is no saved kit called ${cfg.kit}. Use /kit list.`;
    for (const [dx, dz] of [[0, 0], [cfg.radius, 0], [-cfg.radius, 0], [0, cfg.radius], [0, -cfg.radius]]) if (!sim.store.isLoaded(cx + dx, cz + dz)) return 'Part of that area is not loaded. Try a smaller radius or move closer to the middle.';
    const b: Bout = {
      ph: 'open', cfg, host: p.name, cx: cx + 0.5, cz: cz + 0.5, fy, R: cfg.radius, r: cfg.radius, built: cfg.arena === 'forge', nether: isNether(cx),
      until: sim.tickCount + cfg.join * 20, start: 0, pot: 0, entrants: new Map(), winner: null, warned: new Map(), said: cfg.join,
    };
    this.b = b;
    if (b.built) this.build();
    const where = `${Math.round(localX(cx))} ${fy + 1} ${cz}${b.nether ? ' in the Nether' : ''}`;
    const bank = this.bank();
    const fee = cfg.fee > 0 && bank ? ` Entry costs ${money(cfg.fee)}, added to the prize.` : '';
    this.say(`[Crucible] ${p.name} opened the Crucible at ${where}. Fighters use ${kitLabel(cfg.kit)}, last one standing wins ${prizeLabel(cfg, bank ? cfg.money : 0)}.${fee} Type /crucible join to enter (${cfg.join}s).`);
    sim.emit({ e: 'title', text: 'THE CRUCIBLE', sub: `${p.name} calls for challengers - open chat and tap Enter` });
    sim.emit({ e: 'sound', s: 'bell.ring', x: b.cx, y: fy + 2, z: b.cz, vol: 4 });
    this.push();
    const notes = [!bank && (cfg.money > 0 || cfg.fee > 0) ? 'the economy is off, so coin rewards and fees are skipped' : '', cfg.kit === 'own' ? 'fighters keep their own gear and lose nothing when they fall' : ''].filter(Boolean);
    return `Crucible open for ${cfg.join}s${b.built ? `, arena built with radius ${b.R}` : ''}.${notes.length ? ` Note: ${notes.join('; ')}.` : ''}`;
  }

  private join(p: SimPlayer): string {
    const b = this.b;
    if (!b) return 'No Crucible is open right now.';
    if (b.ph !== 'open') return 'The Crucible has already begun. Wait for the next one.';
    if (b.entrants.has(p.id)) return 'You are already entered. Type /crucible leave to withdraw.';
    if (p.dead) return 'You cannot enter while dead.';
    if (b.entrants.size >= b.cfg.max) return 'The Crucible is full.';
    let paid = 0;
    const bank = this.bank();
    if (b.cfg.fee > 0 && bank) {
      if (!bank.take(p.id, p.name, b.cfg.fee)) return `Entry costs ${money(b.cfg.fee)}. You do not have enough.`;
      paid = b.cfg.fee; b.pot += paid;
    }
    b.entrants.set(p.id, { id: p.id, name: p.name, paid, alive: true, kills: 0, place: 0, staged: false });
    this.say(`[Crucible] ${p.name} entered the Crucible (${b.entrants.size}/${b.cfg.max}).`);
    this.push();
    if (b.entrants.size >= b.cfg.max) this.begin();
    return paid ? `You are in. ${money(paid)} paid. Stay online - you will be pulled into the arena when it starts.` : 'You are in. Stay online - you will be pulled into the arena when it starts.';
  }

  private leave(p: SimPlayer): string {
    const b = this.b;
    const e = b?.entrants.get(p.id);
    if (!b || !e) return 'You are not in the Crucible.';
    if (b.ph === 'open') { this.refund(e); b.entrants.delete(p.id); this.say(`[Crucible] ${p.name} withdrew (${b.entrants.size}/${b.cfg.max}).`); this.push(); return 'You withdrew from the Crucible.'; }
    if (!e.alive || b.ph === 'done') return 'Your fight is already over.';
    this.out(e, null, 'forfeit');
    this.restore(p, true);
    return 'You forfeited and were sent back.';
  }

  private watch(p: SimPlayer): string {
    const b = this.b;
    if (!b) return 'No Crucible is running.';
    if (this.staged(p)) return 'You are fighting!';
    if (!b.built) return 'This Crucible has no stands. Its centre is at ' + `${Math.round(localX(b.cx))} ${b.fy + 1} ${Math.floor(b.cz)}.`;
    const a = Math.atan2(p.z - b.cz, p.x - b.cx);
    const x = Math.floor(b.cx + Math.cos(a) * (b.R + 1)), z = Math.floor(b.cz + Math.sin(a) * (b.R + 1));
    return this.sim.warpPlayer(p, x + 0.5, b.fy + WALL + 2, z + 0.5, false, 'You took a seat on the Crucible wall.').msg;
  }

  private refund(e: Entrant): void {
    const bank = this.bank();
    if (e.paid > 0 && bank) { bank.give(e.id, e.name, e.paid); this.b!.pot -= e.paid; this.say(`Your ${money(e.paid)} entry was refunded.`, e.id); }
    e.paid = 0;
  }

  private spots(n: number): [number, number, number][] {
    const b = this.b!, sim = this.sim, out: [number, number, number][] = [];
    const off = sim.rng.next() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const a = off + (i / n) * Math.PI * 2, rr = b.R * 0.72;
      const x = Math.floor(b.cx + Math.cos(a) * rr), z = Math.floor(b.cz + Math.sin(a) * rr);
      let y = b.fy + 1;
      if (!b.built) {
        for (let yy = Math.min(WORLD_HEIGHT - 3, b.fy + 12); yy >= Math.max(1, b.fy - 12); yy--) {
          if (isSolid(sim.get(x, yy, z)) && !isSolid(sim.get(x, yy + 1, z)) && !isSolid(sim.get(x, yy + 2, z))) { y = yy + 1; break; }
        }
      }
      out.push([x, y, z]);
    }
    return out;
  }

  begin(): void {
    const b = this.b, sim = this.sim;
    if (!b || b.ph !== 'open') return;
    for (const e of [...b.entrants.values()]) { const p = sim.players.get(e.id); if (!p || p.dead) { this.refund(e); b.entrants.delete(e.id); } }
    if (b.entrants.size < b.cfg.min) { this.cancel(`Not enough challengers answered (${b.entrants.size}/${b.cfg.min} needed).`); return; }
    const list = [...b.entrants.values()];
    const at = this.spots(list.length);
    list.forEach((e, i) => this.stage(sim.players.get(e.id)!, e, at[i]));
    b.ph = 'ready';
    b.until = sim.tickCount + 100;
    this.say(`[Crucible] The gates close. ${list.map((e) => e.name).join(', ')} enter the Crucible.`);
    for (const e of list) sim.emit({ e: 'title', text: 'THE CRUCIBLE', sub: `${list.length} enter. One leaves victorious.`, to: e.id });
    this.push();
  }

  private stage(p: SimPlayer, e: Entrant, [x, y, z]: [number, number, number]): void {
    const sim = this.sim, b = this.b!;
    p.tpWarm = undefined;
    if (p.screen.type) sim.closeScreen(p);
    if (p.riding !== undefined) sim.dismount(p);
    const custom = isBuiltinKit(b.cfg.kit) ? null : sim.kits[b.cfg.kit] ?? null;
    const own = b.cfg.kit === 'own' || (!custom && !isBuiltinKit(b.cfg.kit));
    p.cru = { x: p.x, y: p.y, z: p.z, mode: p.mode, inv: own ? undefined : p.inv };
    if (custom) p.inv = kitInvOf(custom);
    else if (!own) p.inv = kitInv(b.cfg.kit as Exclude<BuiltinKit, 'own'>, (s) => sim.maxEnchant(s));
    if (p.mode !== 'survival') { p.mode = 'survival'; sim.emit({ e: 'mode', p }); }
    p.health = 20; p.food = 20; p.sat = 5; p.exh = 0; p.air = 300; p.fireT = 0; p.absorb = 0; p.witherT = 0;
    p.inCombat = false; p.combatT = 0;
    e.staged = true; e.alive = true;
    sim.teleportTo(p, x + 0.5, y, z + 0.5, false);
    sim.emit({ e: 'inv', p });
    sim.emit({ e: 'vitals', p });
  }

  restore(p: SimPlayer, revive = false, quiet = false): void {
    const s = p.cru, sim = this.sim;
    if (!s) return;
    p.cru = undefined;
    if (s.inv) p.inv = s.inv;
    if (p.mode !== s.mode) { p.mode = s.mode; sim.emit({ e: 'mode', p }); }
    if (revive && p.dead) p.dead = false;
    p.health = 20; p.food = 20; p.sat = 5; p.fireT = 0; p.air = 300; p.absorb = 0;
    p.inCombat = false; p.combatT = 0;
    if (p.dead) { p.x = s.x; p.y = s.y; p.z = s.z; p.peakY = s.y; }
    else if (quiet) { p.x = s.x; p.y = s.y; p.z = s.z; p.peakY = s.y; }
    else { sim.teleportTo(p, s.x, s.y, s.z, false); p.back = undefined; }
    sim.emit({ e: 'inv', p });
    sim.emit({ e: 'vitals', p });
  }

  private out(e: Entrant, killer: Entrant | null, why: 'death' | 'forfeit' | 'gone' | 'fled'): void {
    const b = this.b!;
    if (!e.alive) return;
    e.alive = false;
    e.place = this.alive().length + 1;
    if (killer && killer !== e) killer.kills++;
    const left = this.alive().length;
    const how = why === 'forfeit' ? 'forfeited' : why === 'gone' ? 'abandoned the fight' : why === 'fled' ? 'fled the Crucible' : killer && killer !== e ? `was struck down by ${killer.name}` : 'fell';
    this.say(`[Crucible] ${e.name} ${how}. ${left} remain${left === 1 ? 's' : ''}.`);
    this.push();
    if (left <= 1 && b.ph === 'fight') this.finish();
  }

  onKill(p: SimPlayer, cause: string, killer?: string): boolean {
    const e = this.staged(p);
    if (!e || !e.alive) return false;
    const k = killer && cause === 'player' ? [...this.b!.entrants.values()].find((x) => x.name === killer) ?? null : null;
    this.out(e, k, 'death');
    return true;
  }

  onRespawn(p: SimPlayer): void {
    if (!p.cru) return;
    const e = this.staged(p);
    if (e && e.alive) return;
    this.restore(p, false, true);
  }

  onLeave(p: SimPlayer): void {
    const b = this.b;
    const e = b?.entrants.get(p.id);
    if (b && e) {
      if (b.ph === 'open') { this.refund(e); b.entrants.delete(p.id); this.push(); }
      else if (e.alive && b.ph !== 'done') this.out(e, null, 'gone');
    }
    if (p.cru) this.restore(p, true, true);
  }

  private finish(): void {
    const b = this.b!, sim = this.sim;
    if (b.ph !== 'fight') return;
    const ranked = [...b.entrants.values()].filter((e) => e.staged).sort((x, y) => {
      if (x.alive !== y.alive) return x.alive ? -1 : 1;
      if (x.alive && y.alive) { if (y.kills !== x.kills) return y.kills - x.kills; return (sim.players.get(y.id)?.health ?? 0) - (sim.players.get(x.id)?.health ?? 0); }
      return x.place - y.place;
    });
    const champ = ranked[0], second = ranked[1];
    b.ph = 'done';
    b.until = sim.tickCount + 80;
    if (!champ) { this.say('[Crucible] The Crucible ends with no champion.'); this.push(); return; }
    b.winner = champ.id;
    const bank = this.bank();
    const pot = bank ? b.cfg.money + b.pot : 0;
    if (pot > 0) bank!.give(champ.id, champ.name, pot);
    if (second && bank && b.cfg.second > 0) { bank.give(second.id, second.name, b.cfg.second); this.say(`Runner-up prize: ${money(b.cfg.second)}.`, second.id); }
    const timeUp = this.alive().length > 1;
    this.say(`[Crucible] ${champ.name} is Champion of the Crucible${timeUp ? ' (time ran out, most kills wins)' : ''} with ${champ.kills} kill${champ.kills === 1 ? '' : 's'}! Prize: ${prizeLabel(b.cfg, pot)}.${second ? ` Runner-up: ${second.name}.` : ''}`);
    sim.emit({ e: 'title', text: 'CHAMPION', sub: `${champ.name} conquers the Crucible` });
    const cp = sim.players.get(champ.id);
    if (cp) {
      sim.emit({ e: 'sound', s: 'player.levelup', x: cp.x, y: cp.y + 1, z: cp.z, vol: 2 });
      for (let i = 0; i < 5; i++) sim.fireworkShows.push({ x: cp.x + (sim.rng.next() - 0.5) * 6, y: cp.y + 8 + sim.rng.int(5), z: cp.z + (sim.rng.next() - 0.5) * 6, t: sim.tickCount + 6 + i * 9 });
    }
    this.push();
  }

  private close(): void {
    const b = this.b!, sim = this.sim;
    for (const e of b.entrants.values()) {
      const p = sim.players.get(e.id);
      if (p && p.cru && !p.dead) this.restore(p);
    }
    const champ = b.winner ? sim.players.get(b.winner) : null;
    if (champ && !champ.dead && !champ.cru) {
      for (const pz of b.cfg.prize) {
        const id = prizeId(pz.key);
        if (id === null) continue;
        const st: ItemStack = { id, count: pz.n };
        if (pz.maxed) sim.maxEnchant(st);
        const left = giveItem(champ.inv, st);
        if (left > 0) sim.spawnItem(champ.x, champ.y + 1, champ.z, { ...st, count: left }, 0, 2, 0, 20);
      }
      sim.emit({ e: 'inv', p: champ });
    }
    if (b.cfg.kit !== 'own') {
      for (const en of [...sim.entities.values()]) {
        if (en.kind !== 'item' && en.kind !== 'arrow') continue;
        if (!this.inside(Math.floor(en.x), Math.floor(en.y), Math.floor(en.z), 6)) continue;
        sim.entities.delete(en.id);
        sim.emit({ e: 'remove', id: en.id, why: 'despawn' });
      }
    }
    this.b = null;
    this.push();
  }

  cancel(reason: string): void {
    const b = this.b, sim = this.sim;
    if (!b) return;
    for (const e of b.entrants.values()) {
      this.refund(e);
      const p = sim.players.get(e.id);
      if (p && p.cru && !p.dead) this.restore(p);
    }
    this.b = null;
    this.say(`[Crucible] ${reason}`);
    this.push();
  }

  tick(): void {
    const b = this.b, sim = this.sim;
    if (!b) return;
    const t = sim.tickCount;
    if (b.ph === 'open') {
      const left = Math.ceil((b.until - t) / 20);
      if ((left === 30 || left === 10) && b.said !== left) { b.said = left; this.say(`[Crucible] ${left} seconds to enter - ${b.entrants.size}/${b.cfg.max} so far. Type /crucible join.`); this.push(); }
      if (t >= b.until) this.begin();
      return;
    }
    if (b.ph === 'ready') {
      if ((b.until - t) % 20 === 0) this.sweep();
      const left = Math.ceil((b.until - t) / 20);
      if ((b.until - t) % 20 === 0 && left > 0 && left <= 3) for (const e of this.alive()) sim.emit({ e: 'title', text: String(left), sub: 'Ready yourself', to: e.id });
      if (t >= b.until) {
        b.ph = 'fight'; b.start = t; b.until = t + b.cfg.fight * 20;
        for (const e of this.alive()) sim.emit({ e: 'title', text: 'FIGHT', sub: 'Last one standing takes the prize', to: e.id });
        sim.emit({ e: 'sound', s: 'bell.ring', x: b.cx, y: b.fy + 2, z: b.cz, vol: 4 });
        this.push();
        if (this.alive().length <= 1) this.finish();
      }
      return;
    }
    if (b.ph === 'done') { if (t >= b.until) this.close(); return; }
    if ((t - b.start) % 20 === 0) {
      const r = ringRadius(b.R, b.cfg.ring, (t - b.start) / (b.cfg.fight * 20));
      const shrank = r !== b.r;
      b.r = r;
      for (const e of this.alive()) {
        const p = sim.players.get(e.id);
        if (!p) { this.out(e, null, 'gone'); if (!this.b || this.b.ph !== 'fight') return; continue; }
        if (p.dead) continue;
        if (isNether(Math.floor(p.x)) !== b.nether || Math.hypot(p.x - b.cx, p.z - b.cz) > b.R + 40) { this.out(e, null, 'fled'); this.restore(p); if (!this.b || this.b.ph !== 'fight') return; continue; }
        const d = Math.hypot(p.x - b.cx, p.z - b.cz);
        if (d > r + 0.4 || p.y < b.fy - 3 || p.y > b.fy + 30) {
          if ((b.warned.get(p.id) ?? -999) < t - 100) { b.warned.set(p.id, t); sim.emit({ e: 'msg', text: 'You are outside the ring! Get back in or it will burn you.', kind: 'error', to: p.id }); }
          sim.damage(p, 2, 'crucible', p.x, p.z, false, true);
          if (!this.b || this.b.ph !== 'fight') return;
        }
      }
      this.sweep();
      if (this.alive().length <= 1 || t >= b.until) { this.finish(); return; }
      if (shrank && (t - b.start) % 100 === 0) this.push();
    }
  }

  private sweep(): void {
    const b = this.b!, sim = this.sim;
    for (const o of sim.players.values()) {
      if (o.dead || (o.op && o.mode === 'creative') || this.staged(o)) continue;
      const d = Math.hypot(o.x - b.cx, o.z - b.cz);
      if (d >= b.R + 0.5 || o.y < b.fy - 1 || o.y > b.fy + WALL + 1.5) continue;
      const a = Math.atan2(o.z - b.cz, o.x - b.cx);
      sim.teleportTo(o, b.cx + Math.cos(a) * (b.R + 4), b.fy + 1, b.cz + Math.sin(a) * (b.R + 4), true);
      sim.emit({ e: 'msg', text: 'Only fighters may stand inside the Crucible. Try /crucible watch.', kind: 'error', to: o.id });
    }
  }

  private build(): void {
    const b = this.b!, sim = this.sim, r = sim.rng;
    const blk = (name: string, fallback: number) => { const id = prizeId(name); const v = id !== null ? blockValueOf(id) : null; return v ?? fallback; };
    const BRICK = blk('polished_blackstone_bricks', B.COBBLESTONE), SMOOTH = blk('polished_blackstone', BRICK), CRACK = blk('blackstone', SMOOTH);
    const BASE = CRACK, GILD = B.GOLD_BLOCK, LIGHT = blk('shroomlight', B.GLOWSTONE), CRY = blk('crying_obsidian', B.OBSIDIAN), SEAL = CRY;
    const cx = Math.floor(b.cx), cz = Math.floor(b.cz), fy = b.fy, R = b.R;
    const soft = (v: number) => { const id = blockId(v); if (!id) return true; const d = getBlock(v); return !d.solid || d.replaceable || d.render === 'leaves' || d.render === 'cross' || isWaterLike(v); };
    const spoke = (a: number, d: number, n: number) => { const s = (Math.PI * 2) / n; const m = ((a % s) + s) % s; return Math.min(m, s - m) * d < 0.55; };
    for (let dx = -R - 2; dx <= R + 2; dx++) for (let dz = -R - 2; dz <= R + 2; dz++) {
      const x = cx + dx, z = cz + dz, d = Math.hypot(dx, dz);
      if (d > R + 1.5 || !sim.store.isLoaded(x, z)) continue;
      const wall = d > R + 0.5, a = Math.atan2(dz, dx);
      for (let y = fy + 1; y <= Math.min(WORLD_HEIGHT - 2, fy + WALL + 10); y++) if (blockId(sim.get(x, y, z)) && blockId(sim.get(x, y, z)) !== B.BEDROCK) sim.setBlock(x, y, z, 0);
      for (let y = fy - 1, n = 0; y > 1 && n < 16 && (soft(sim.get(x, y, z))); y--, n++) sim.setBlock(x, y, z, BASE);
      if (wall) {
        for (let y = fy; y <= fy + WALL; y++) sim.setBlock(x, y, z, y === fy + 3 && spoke(a, d, 16) ? LIGHT : (r.chance(0.08) ? CRACK : BRICK));
        sim.setBlock(x, fy + WALL + 1, z, SMOOTH);
        continue;
      }
      let v = r.chance(0.1) ? CRACK : BRICK;
      if (d < 1.5) v = SEAL;
      else if (d < 2.5) v = GILD;
      else if (Math.round(d) % 5 === 0 || spoke(a, d, 8)) v = SMOOTH;
      if (Math.abs(d - R * 0.3) < 0.5 && spoke(a, d, 8)) v = LIGHT;
      sim.setBlock(x, fy, z, v);
    }
    const P = R >= 12 ? 6 : 4;
    for (let j = 0; j < P; j++) {
      const a = ((j + 0.5) / P) * Math.PI * 2;
      const px = Math.floor(cx + Math.cos(a) * R * 0.45), pz = Math.floor(cz + Math.sin(a) * R * 0.45);
      for (let ox = 0; ox < 2; ox++) for (let oz = 0; oz < 2; oz++) {
        if (!sim.store.isLoaded(px + ox, pz + oz)) continue;
        for (let y = fy + 1; y <= fy + 3; y++) sim.setBlock(px + ox, y, pz + oz, y === fy + 3 ? CRY : BRICK);
      }
    }
  }
}

import { B, CB, blockId, isSolid } from '../../blocks';
import { moveBody, sampleMedium } from '../../physics';
import type { WorldSim, SimPlayer, Entity } from '../../sim/WorldSim';
import type { ArenaLayout, ArenaKind, V3 } from './arena';
import { TEAM_WOOLS, TEAM_TINTS } from './arena';
import { SHOP, Currency, CURRENCY_ITEM, ShopOffer, UpgradeKey } from './shop';

export type Plan = 'idle' | 'gather' | 'shop' | 'fortify' | 'guard' | 'raid' | 'hunt' | 'fight' | 'retreat' | 'loot';
export type Difficulty = 'easy' | 'normal' | 'hard';
export const SKILL: Record<Difficulty, number> = { easy: 0.42, normal: 0.6, hard: 0.78 };

export interface BotKit {
  blocks: number;
  purse: Record<Currency, number>;
  sword: number;
  gapples: number;
  role: 'rush' | 'guard' | 'solo';
  skill: number;
  plan: Plan;
  planAt: number;
  goal: { x: number; y: number; z: number } | null;
  best: number;
  bestT: number;
  ignore: Map<string, number>;
  tower: number;
  strafe: number;
  strafeT: number;
  react: number;
  foe: string | null;
  fort: number;
  fortAt: number;
  dig: { k: string; t: number } | null;
  placeCd: number;
  attackCd: number;
  regenT: number;
  shopT: number;
  loot: number;
  armour: number;
  trail: number[];
  back: boolean;
  backT: number;
  leap: boolean;
}

export interface Part {
  id: string;
  name: string;
  bot: boolean;
  team: number;
  alive: boolean;
  out: boolean;
  kills: number;
  finals: number;
  ent: number;
  respawnAt: number;
  lastHit: string | null;
  pick: number;
  axe: number;
  greaves: number;
  shears: boolean;
  kit?: BotKit;
}

export interface Foe { id: string; x: number; y: number; z: number; ent?: Entity; pl?: SimPlayer; hp: number; part: Part }

export interface Host {
  readonly sim: WorldSim;
  readonly layout: ArenaLayout;
  readonly kind: ArenaKind;
  readonly now: number;
  readonly elapsed: number;
  readonly parts: Map<string, Part>;
  readonly placed: Set<string>;
  hearthAlive(team: number): boolean;
  level(team: number, k: UpgradeKey): number;
  botUpgrade(pt: Part, o: ShopOffer): boolean;
  canBotPlace(x: number, y: number, z: number): boolean;
  botBreak(pt: Part, x: number, y: number, z: number, v: number): void;
  botPlace(pt: Part, x: number, y: number, z: number, v: number): void;
  botStrike(pt: Part, foe: Foe, dmg: number): void;
}

const DT = 1 / 20;
const SWORD_DMG = [4, 5, 6, 7];
const GREAVE_PTS = [3, 4, 7, 9];
const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
const rand = (a: number, b: number) => a + Math.random() * (b - a);

export function newKit(skill: number, role: BotKit['role']): BotKit {
  return {
    blocks: 0, purse: { iron: 0, gold: 0, aetherite: 0, emerald: 0 }, sword: 0, gapples: 0, role,
    skill: Math.max(0.25, Math.min(0.92, skill + rand(-0.07, 0.07))),
    plan: 'idle', planAt: 0, goal: null, best: Infinity, bestT: 0, ignore: new Map(), tower: 0, strafe: 1, strafeT: 0,
    react: 0, foe: null, fort: 0, fortAt: 0, dig: null, placeCd: 0, attackCd: 0, regenT: 0, shopT: 0, loot: 0, armour: 4, trail: [], back: false, backT: 0, leap: false,
  };
}

export function botArmourPoints(pt: Part): number {
  return 4 + GREAVE_PTS[Math.max(0, Math.min(3, Math.floor(pt.greaves)))];
}

export class Rivals {
  constructor(private host: Host) {}

  private get sim(): WorldSim { return this.host.sim; }

  foes(pt: Part): Foe[] {
    const out: Foe[] = [];
    const team = this.host.kind === 'hearthfall';
    for (const o of this.host.parts.values()) {
      if (o === pt || !o.alive || o.out || (team && o.team === pt.team)) continue;
      if (o.bot) { const e = this.sim.entities.get(o.ent); if (e) out.push({ id: o.id, x: e.x, y: e.y, z: e.z, ent: e, hp: e.health, part: o }); }
      else { const p = this.sim.players.get(o.id); if (p && !p.dead) out.push({ id: o.id, x: p.x, y: p.y, z: p.z, pl: p, hp: p.health, part: o }); }
    }
    return out;
  }

  private home(pt: Part): V3 | null {
    return this.host.kind === 'hearthfall' ? this.host.layout.teams[pt.team].spawn : null;
  }

  private ground(x: number, y: number, z: number): boolean {
    return isSolid(this.sim.get(Math.floor(x), Math.floor(y) - 1, Math.floor(z)));
  }

  private hasFooting(x: number, y: number, z: number): boolean {
    const fx = Math.floor(x), fy = Math.floor(y), fz = Math.floor(z);
    for (let d = 1; d <= 3; d++) if (isSolid(this.sim.get(fx, fy - d, fz))) return true;
    return false;
  }

  collect(e: Entity, k: BotKit): void {
    for (const it of this.sim.entities.values()) {
      if (it.kind !== 'item' || !it.item) continue;
      if (Math.abs(it.x - e.x) > 1.6 || Math.abs(it.z - e.z) > 1.6 || Math.abs(it.y - e.y) > 2) continue;
      const cur = (Object.keys(CURRENCY_ITEM) as Currency[]).find((c) => CURRENCY_ITEM[c] === it.item!.id);
      if (!cur) continue;
      k.purse[cur] += it.item.count;
      this.sim.entities.delete(it.id);
      this.sim.emit({ e: 'remove', id: it.id, why: 'despawn' });
    }
  }

  private wants(pt: Part, k: BotKit): ShopOffer | null {
    const pick = (key: string) => SHOP.find((o) => o.key === key)!;
    const need = k.role === 'guard' ? 32 : 48;
    const list: [boolean, ShopOffer][] = [
      [k.blocks < 16, pick('wool')],
      [k.sword < 1, pick('stone_sword')],
      [k.blocks < need, pick('wool')],
      [pt.greaves < 1, pick('greaves1')],
      [pt.pick < 2 && this.host.elapsed > 20 * 90, pick(pt.pick < 1 ? 'pick1' : 'pick2')],
      [k.sword < 2, pick('iron_sword')],
      [pt.greaves < 2, pick('greaves2')],
      [k.gapples < 2, pick('gapple')],
      [this.host.level(pt.team, 'forge') < 1, pick('forge1')],
      [this.host.level(pt.team, 'bulwark') < 1, pick('bulwark1')],
      [this.host.level(pt.team, 'edge') < 1, pick('edge')],
      [this.host.level(pt.team, 'spring') < 1, pick('spring')],
      [this.host.level(pt.team, 'bulwark') === 1, pick('bulwark2')],
      [k.sword < 3, pick('aeth_sword')],
      [pt.greaves < 3, pick('greaves3')],
    ];
    for (const [cond, o] of list) if (cond && k.purse[o.cost[0]] >= o.cost[1]) return o;
    return null;
  }

  private nextGoal(pt: Part, k: BotKit): ShopOffer | null {
    const pick = (key: string) => SHOP.find((o) => o.key === key)!;
    if (k.blocks < 16) return pick('wool');
    if (k.sword < 1) return pick('stone_sword');
    if (k.blocks < (k.role === 'guard' ? 32 : 48)) return pick('wool');
    if (pt.greaves < 1 && k.role === 'guard') return pick('greaves1');
    return null;
  }

  private buy(pt: Part, k: BotKit, o: ShopOffer): boolean {
    if (k.purse[o.cost[0]] < o.cost[1]) return false;
    if (o.upgrade) { if (!this.host.botUpgrade(pt, o)) return false; }
    else if (o.team) k.blocks += o.team[1];
    else if (o.key.endsWith('_sword')) k.sword = o.key === 'stone_sword' ? 1 : o.key === 'iron_sword' ? 2 : 3;
    else if (o.greaves) pt.greaves = o.greaves;
    else if (o.tool === 'pick') pt.pick = o.tier!;
    else if (o.tool === 'axe') pt.axe = o.tier!;
    else if (o.key === 'gapple') k.gapples++;
    else return false;
    k.purse[o.cost[0]] -= o.cost[1];
    return true;
  }

  private fortSpots(pt: Part): V3[] {
    const t = this.host.layout.teams[pt.team];
    const [hx, hy, hz] = t.hearth;
    const out: V3[] = [];
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) if (Math.max(Math.abs(dx), Math.abs(dz)) === 2) out.push([hx + dx, hy, hz + dz]);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (dx || dz) out.push([hx + dx, hy + 1, hz + dz]);
    out.push([hx, hy + 2, hz]);
    return out;
  }

  private think(e: Entity, pt: Part, k: BotKit, foes: Foe[]): void {
    const L = this.host.layout, H = this.host;
    const now = H.now;
    for (const [id, until] of k.ignore) if (until <= now) k.ignore.delete(id);
    const visible = foes.filter((f) => !k.ignore.has(f.id));
    let foe: Foe | undefined; let fd = Infinity;
    for (const f of visible) {
      const d = Math.hypot(f.x - e.x, f.z - e.z) + Math.abs(f.y - e.y) * 2 + (f.hp < 8 ? -3 : 0);
      if (d < fd) { fd = d; foe = f; }
    }
    const foeDist = foe ? Math.hypot(foe.x - e.x, foe.z - e.z) : Infinity;
    if (foe && foe.id !== k.foe) { k.react = Math.round(rand(5, 11) - k.skill * 4); k.foe = foe.id; }
    const home = this.home(pt);
    const homeT = H.kind === 'hearthfall' ? L.teams[pt.team] : null;
    const set = (plan: Plan, goal: { x: number; y: number; z: number } | null) => {
      if (k.plan !== plan) { k.plan = plan; k.planAt = now; k.best = Infinity; k.bestT = now; k.tower = 0; }
      k.goal = goal;
    };
    if (e.health < 8 && k.gapples > 0 && (!foe || foeDist > 2.5 || Math.random() < 0.3)) {
      k.gapples--; e.health = Math.min(e.maxHealth, e.health + 4); k.regenT = 100;
      this.sim.emit({ e: 'sound', s: 'player.eat', x: e.x, y: e.y + 1, z: e.z });
    }
    if (H.kind === 'spires') {
      const reach = foe && foeDist < 5 && Math.abs(foe.y - e.y) < 2.5;
      if (reach) { set('fight', foe!); return; }
      if (k.plan === 'raid' && k.goal && foe && k.blocks > 0) { set('raid', foe); return; }
      const ready = H.elapsed > 20 * 40 && (k.sword >= 1 || H.elapsed > 20 * 100);
      if (foe && ready && this.gaps(e, foe.x, foe.z) + 4 <= k.blocks && Math.random() < 0.25) { set('raid', foe); return; }
      const mid = L.spawns.length ? { x: 0.5, y: 59, z: 0.5 } : null;
      if (mid && ready && this.gaps(e, mid.x, mid.z) + 4 <= k.blocks && Math.random() < 0.04) { set('raid', mid); return; }
      set('idle', null);
      return;
    }
    if (!homeT || !home) return;
    const atHome = Math.hypot(e.x - homeT.base[0], e.z - homeT.base[2]) < 8 && Math.abs(e.y - homeT.base[1] - 1) < 3;
    const hearthUp = H.hearthAlive(pt.team);
    const raider = foes.find((f) => Math.hypot(f.x - homeT.hearth[0], f.z - homeT.hearth[2]) < 14 && Math.abs(f.y - homeT.hearth[1]) < 6);
    if (foe && foeDist < 9 && Math.abs(foe.y - e.y) < 5) {
      if (e.health < 6 && hearthUp && foe.hp > e.health + 4 && !atHome) { set('retreat', { x: home[0], y: home[1], z: home[2] }); return; }
      set('fight', foe); return;
    }
    if (raider && (k.role !== 'rush' || atHome || Math.hypot(e.x - homeT.base[0], e.z - homeT.base[2]) < 22)) { set('guard', raider); return; }
    if (atHome) {
      const want = this.wants(pt, k);
      if (want) {
        const npc = homeT.npc;
        if (Math.hypot(npc[0] - e.x, npc[2] - e.z) > 2.6) { set('shop', { x: npc[0], y: npc[1], z: npc[2] }); return; }
        if (now >= k.shopT) { this.buy(pt, k, want); k.shopT = now + 12; }
        set('shop', null); return;
      }
    }
    const spots = k.role !== 'rush' && hearthUp ? this.fortSpots(pt) : [];
    if (spots.length && k.fort < spots.length && k.blocks > 4 && H.elapsed < 20 * 60 * 6) {
      while (k.fort < spots.length && isSolid(this.sim.get(...spots[k.fort]))) k.fort++;
      if (k.plan !== 'fortify') k.fortAt = now;
      else if (now - k.fortAt > 20 * 10) { k.fort++; k.fortAt = now; }
      while (k.fort < spots.length && isSolid(this.sim.get(...spots[k.fort]))) k.fort++;
      if (k.fort < spots.length) { const s = spots[k.fort]; set('fortify', { x: s[0] + 0.5, y: s[1], z: s[2] + 0.5 }); return; }
    }
    const goalBuy = this.nextGoal(pt, k);
    if (goalBuy && k.purse[goalBuy.cost[0]] < goalBuy.cost[1]) {
      const f = homeT.forge;
      set('gather', { x: f[0], y: f[1], z: f[2] }); return;
    }
    if (k.role === 'guard' && hearthUp) {
      if (H.elapsed < 20 * 60 * 8 || Math.random() < 0.6) {
        const f = homeT.forge;
        if (k.purse.iron < 30) { set('gather', { x: f[0], y: f[1], z: f[2] }); return; }
        set('guard', { x: homeT.hearth[0] + 0.5 + homeT.dir[0] * 2, y: homeT.hearth[1], z: homeT.hearth[2] + 0.5 + homeT.dir[1] * 2 }); return;
      }
    }
    if (k.blocks < 6) { const f = homeT.forge; set('gather', { x: f[0], y: f[1], z: f[2] }); return; }
    if (k.plan === 'loot' && now - k.planAt < 20 * 22 && k.purse.aetherite < 4) return;
    if (H.elapsed > 20 * 120 && k.purse.aetherite < 4 && Math.random() < 0.08) {
      const gens = L.gens.filter((g) => g.tier === 'dia');
      let best = gens[0], bd = Infinity;
      for (const g of gens) { const d = Math.hypot(g.pos[0] - e.x, g.pos[2] - e.z); if (d < bd) { bd = d; best = g; } }
      if (best && bd < 40 && this.gaps(e, best.pos[0], best.pos[2]) + 3 <= k.blocks) { set('loot', { x: best.pos[0], y: best.pos[1], z: best.pos[2] }); return; }
    }
    let target: V3 | null = null, td = Infinity;
    for (let i = 0; i < L.teams.length; i++) {
      if (i === pt.team || !H.hearthAlive(i)) continue;
      if (![...H.parts.values()].some((x) => x.team === i && !x.out)) continue;
      const t = L.teams[i].hearth;
      const d = Math.hypot(t[0] - e.x, t[2] - e.z);
      if (d < td) { td = d; target = t; }
    }
    if (target) {
      if (k.plan === 'raid' && k.blocks < 3 && !this.onIsland(e, pt) && td > 8 && k.trail.length >= 6) { k.back = true; k.backT = now; return; }
      if (k.plan !== 'raid' && this.gaps(e, target[0] + 0.5, target[2] + 0.5) + 3 > k.blocks) { const f = homeT.forge; set('gather', { x: f[0], y: f[1], z: f[2] }); return; }
      set('raid', { x: target[0] + 0.5, y: target[1], z: target[2] + 0.5 }); return;
    }
    if (foe) { set('hunt', foe); return; }
    set('idle', null);
  }

  tick(e: Entity, pt: Part): void {
    const sim = this.sim, H = this.host, L = H.layout;
    const k = pt.kit!;
    if (e.y < L.voidY) { e.hurt = 0; sim.hurtMob(e, 1000, null, 0, 0); return; }
    if (k.attackCd > 0) k.attackCd--;
    if (k.placeCd > 0) k.placeCd--;
    if (k.react > 0) k.react--;
    if (k.regenT > 0) { k.regenT--; if (k.regenT % 25 === 0 && e.health < e.maxHealth) e.health = Math.min(e.maxHealth, e.health + 1); }
    this.collect(e, k);
    const foes = this.foes(pt);
    if (e.onGround) {
      const t = k.trail, n = t.length;
      if (!n || Math.hypot(e.x - t[n - 3], e.z - t[n - 1]) > 1.2 || Math.abs(e.y - t[n - 2]) > 0.9) { t.push(e.x, e.y, e.z); if (t.length > 600) t.splice(0, 3); }
    }
    if (k.back) {
      const t = k.trail;
      while (t.length >= 3 && Math.hypot(e.x - t[t.length - 3], e.z - t[t.length - 1]) < 1.1) { t.length -= 3; k.backT = H.now; }
      const near = foes.find((f) => Math.hypot(f.x - e.x, f.z - e.z) < 4);
      if (H.now - k.backT > 160) { k.back = false; k.trail = []; if (H.hearthAlive(pt.team) && !this.onIsland(e, pt)) k.leap = true; }
      else if (t.length < 3 || near || this.onIsland(e, pt)) { k.back = false; k.trail = []; }
      else { k.plan = 'retreat'; k.goal = { x: t[t.length - 3], y: t[t.length - 2], z: t[t.length - 1] }; }
    }
    if (!k.back && ((H.now + e.id) % 8 === 0 || !k.goal && k.plan !== 'idle' && k.plan !== 'shop')) this.think(e, pt, k, foes);
    if (k.goal && (k.plan === 'fight' || k.plan === 'guard' || k.plan === 'hunt' || (k.plan === 'raid' && H.kind === 'spires'))) {
      const f = foes.find((x) => x.id === k.foe) ?? foes.find((x) => Math.abs(x.x - k.goal!.x) < 0.01 && Math.abs(x.z - k.goal!.z) < 0.01);
      if (f) k.goal = f;
    }
    let flags = 0;
    let wantX = 0, wantZ = 0;
    const g = k.goal;
    const close = g ? foes.find((f) => f.id === k.foe && Math.hypot(f.x - e.x, f.z - e.z) < 3.6) : undefined;
    let speed = 4.3;
    if (g) {
      const dx = g.x - e.x, dz = g.z - e.z, dy = g.y - e.y;
      const d = Math.hypot(dx, dz) || 0.0001;
      const ux = dx / d, uz = dz / d;
      e.yaw = Math.atan2(-dx, -dz);
      const fighting = k.plan === 'fight' || k.plan === 'guard' || k.plan === 'hunt';
      if (fighting && d < 6) speed = 5.4;
      const stop = k.plan === 'fortify' ? 2.6 : k.plan === 'raid' && H.kind === 'hearthfall' ? 2.2 : k.plan === 'shop' ? 2.2 : k.plan === 'gather' || k.plan === 'loot' ? 0.6 : fighting ? 1.8 : 1.2;
      if (d > stop) { wantX = ux * speed; wantZ = uz * speed; }
      if (fighting && d < 4) {
        if (H.now >= k.strafeT) { k.strafe = Math.random() < 0.5 ? -1 : 1; k.strafeT = H.now + Math.round(rand(12, 34)); }
        const s = 1.8 * k.skill;
        wantX += -uz * k.strafe * s; wantZ += ux * k.strafe * s;
      }
      if (d < 0.9 && dy > 1.4 && k.blocks > 0 && k.tower < 10 && fighting) this.towerUp(e, pt, k);
      else if (fighting && dy > 2.5 && d < 1.5 && (k.blocks === 0 || k.tower >= 10)) { k.ignore.set(k.foe ?? '', H.now + 300); k.goal = null; }
      const fy = Math.floor(e.y) - 1;
      const ax = Math.floor(e.x + ux * 0.8), az = Math.floor(e.z + uz * 0.8);
      const gapAhead = d > stop && e.onGround && !isSolid(sim.get(ax, fy, az)) && !isSolid(sim.get(ax, fy - 1, az)) && !isSolid(sim.get(ax, fy - 2, az));
      if (gapAhead) {
        if (k.blocks > 0 && fy > L.voidY && H.canBotPlace(ax, fy, az)) {
          speed = 1.7; wantX = ux * speed; wantZ = uz * speed;
          if (k.placeCd <= 0) {
            H.botPlace(pt, ax, fy, az, this.blockFor(pt));
            k.blocks--; k.placeCd = 4 + Math.round((1 - k.skill) * 4);
            flags |= 4;
          } else { wantX *= 0.2; wantZ *= 0.2; }
        } else {
          wantX = 0; wantZ = 0;
          if (H.kind === 'hearthfall' && !k.back && k.trail.length >= 6) { k.back = true; k.backT = H.now; k.goal = null; }
        }
      }
      const blocked = e.hitH && (wantX || wantZ);
      const atHearth = k.plan === 'raid' && H.kind === 'hearthfall' && d <= 3.2;
      if (blocked || atHearth) {
        const target = atHearth ? this.hearthDigTarget(e, pt, g) : this.aheadBlock(e, ux, uz);
        if (target) {
          const [bx, by, bz] = target;
          const v = sim.get(bx, by, bz);
          if (this.botCanBreak(pt, bx, by, bz, v)) {
            const kk = key(bx, by, bz);
            if (!k.dig || k.dig.k !== kk) k.dig = { k: kk, t: 0 };
            k.dig.t++;
            flags |= 4;
            if (k.dig.t >= this.digTime(pt, v)) { k.dig = null; H.botBreak(pt, bx, by, bz, v); }
          } else if (e.onGround && !isSolid(sim.get(bx, by + 1, bz)) && !isSolid(sim.get(Math.floor(e.x), Math.floor(e.y) + 2, Math.floor(e.z)))) e.vy = 8.2;
        } else if (e.onGround) e.vy = 8.2;
      }
      if (H.now - k.bestT > 20) {
        const dist = Math.hypot(dx, dz) + Math.abs(dy) * 0.5;
        if (dist < k.best - 0.5) { k.best = dist; k.bestT = H.now; }
        else if (H.now - k.bestT > 140 && d > stop + 0.5) {
          if (k.foe && fighting) k.ignore.set(k.foe, H.now + 400);
          k.goal = null; k.plan = 'idle'; k.best = Infinity; k.bestT = H.now;
        }
      }
    }
    if (k.plan === 'fortify' && g && k.placeCd <= 0 && k.blocks > 0) {
      const sx = Math.floor(g.x), sy = Math.floor(g.y), sz = Math.floor(g.z);
      const reach = Math.hypot(g.x - e.x, g.y + 0.5 - (e.y + 1.5), g.z - e.z);
      const inside = Math.abs(sx + 0.5 - e.x) < 0.8 && Math.abs(sz + 0.5 - e.z) < 0.8 && sy >= Math.floor(e.y) - 1 && sy <= Math.floor(e.y) + 1;
      if (reach < 4.5 && !inside && !isSolid(sim.get(sx, sy, sz)) && H.canBotPlace(sx, sy, sz) && this.hasSupport(sx, sy, sz)) {
        H.botPlace(pt, sx, sy, sz, this.blockFor(pt));
        k.blocks--; k.fort++; k.fortAt = H.now; k.placeCd = 5; flags |= 4;
        k.goal = null;
      } else if (reach < 3.2 && (inside || !H.canBotPlace(sx, sy, sz))) { k.fort++; k.fortAt = H.now; k.goal = null; }
    }
    if (close && k.attackCd <= 0 && k.react <= 0) {
      const dist = Math.hypot(close.x - e.x, close.z - e.z);
      if (dist < 3.0 && Math.abs(close.y - e.y) < 2) {
        k.attackCd = Math.round(rand(11, 16));
        flags |= 4;
        e.yaw = Math.atan2(-(close.x - e.x), -(close.z - e.z));
        if (Math.random() < k.skill) {
          const edge = H.kind === 'hearthfall' ? H.level(pt.team, 'edge') : 0;
          H.botStrike(pt, close, SWORD_DMG[Math.min(3, k.sword)] + edge);
        }
      }
    }
    if (!g || (k.plan === 'idle' && H.kind === 'spires')) {
      if (H.kind === 'spires' && e.onGround && !this.hasFooting(e.x + e.vx * 0.2, e.y, e.z + e.vz * 0.2)) { e.vx = 0; e.vz = 0; }
    }
    if (k.leap) {
      const home = this.home(pt);
      if (home) { const dx = home[0] - e.x, dz = home[2] - e.z, d = Math.hypot(dx, dz) || 1; wantX = dx / d * 4.3; wantZ = dz / d * 4.3; e.yaw = Math.atan2(-dx, -dz); }
      if (this.onIsland(e, pt)) k.leap = false;
    } else if (wantX || wantZ) {
      const fx = e.x + wantX * 0.18, fz = e.z + wantZ * 0.18;
      if (e.onGround && !this.hasFooting(fx, e.y, fz) && k.blocks === 0) { wantX = 0; wantZ = 0; }
    }
    const med = sampleMedium(sim.store, e.x, e.y, e.z, e.hw, e.h, e.h * 0.8);
    const acc = e.onGround ? 0.35 : 0.06;
    e.vx += (wantX - e.vx) * acc;
    e.vz += (wantZ - e.vz) * acc;
    if (med.water) { e.vy = Math.min(e.vy + 24 * DT, 2.2); e.vx *= 0.9; e.vz *= 0.9; }
    else if (med.ladder && (wantX || wantZ)) e.vy = 2.4;
    else e.vy = Math.max(e.vy - 28 * DT, -40);
    moveBody(e, e.vx * DT, e.vy * DT, e.vz * DT, sim.store);
    e.flags = flags | (Math.min(4, k.sword + 1) << 9) | (Math.min(3, Math.floor(pt.greaves)) << 12);
  }

  gaps(e: Entity, tx: number, tz: number): number {
    const fy = Math.floor(e.y) - 1;
    const d = Math.hypot(tx - e.x, tz - e.z);
    let n = 0, lastX = NaN, lastZ = NaN;
    for (let s = 1; s < d; s += 0.7) {
      const x = Math.floor(e.x + (tx - e.x) * s / d), z = Math.floor(e.z + (tz - e.z) * s / d);
      if (x === lastX && z === lastZ) continue;
      lastX = x; lastZ = z;
      if (!isSolid(this.sim.get(x, fy, z)) && !isSolid(this.sim.get(x, fy - 1, z))) n++;
    }
    return n;
  }

  private onIsland(e: Entity, pt: Part): boolean {
    if (this.host.kind !== 'hearthfall') return true;
    const L = this.host.layout;
    for (const t of L.teams) if (Math.abs(e.x - t.base[0]) < 7.5 && Math.abs(e.z - t.base[2]) < 7.5) return true;
    if (Math.abs(e.x) < 8.5 && Math.abs(e.z) < 8.5) return true;
    for (const g of L.gens) if (g.tier === 'dia' && Math.abs(e.x - g.pos[0]) < 3.5 && Math.abs(e.z - g.pos[2]) < 3.5) return true;
    void pt;
    return false;
  }

  private hasSupport(x: number, y: number, z: number): boolean {
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) if (isSolid(this.sim.get(x + dx, y + dy, z + dz))) return true;
    return false;
  }

  private towerUp(e: Entity, pt: Part, k: BotKit): void {
    const H = this.host, sim = this.sim;
    const fx = Math.floor(e.x), fz = Math.floor(e.z);
    if (e.onGround && k.placeCd <= 0) { e.vy = 8.4; return; }
    const fy = Math.floor(e.y - 0.05) - 1;
    if (e.vy < 1 && !e.onGround && !isSolid(sim.get(fx, fy, fz)) && isSolid(sim.get(fx, fy - 1, fz)) && e.y - (fy + 1) > 0.15 && H.canBotPlace(fx, fy, fz)) {
      H.botPlace(pt, fx, fy, fz, this.blockFor(pt));
      k.blocks--; k.tower++; k.placeCd = 3;
    }
  }

  private blockFor(pt: Part): number {
    return this.host.kind === 'hearthfall' ? TEAM_TINTS[pt.team].wool : B.COBBLESTONE;
  }

  private aheadBlock(e: Entity, ux: number, uz: number): V3 | null {
    const bx = Math.floor(e.x + ux * 0.9), bz = Math.floor(e.z + uz * 0.9);
    const by = Math.floor(e.y);
    if (isSolid(this.sim.get(bx, by + 1, bz))) return [bx, by + 1, bz];
    if (isSolid(this.sim.get(bx, by, bz))) {
      if (!isSolid(this.sim.get(bx, by + 1, bz)) && !isSolid(this.sim.get(Math.floor(e.x), by + 2, Math.floor(e.z)))) return null;
      return [bx, by, bz];
    }
    return null;
  }

  private hearthDigTarget(e: Entity, pt: Part, g: { x: number; y: number; z: number }): V3 | null {
    const sx = e.x, sy = e.y + 1.5, sz = e.z;
    const tx = g.x, ty = g.y + 0.5, tz = g.z;
    const n = 24;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const x = Math.floor(sx + (tx - sx) * t), y = Math.floor(sy + (ty - sy) * t), z = Math.floor(sz + (tz - sz) * t);
      const v = this.sim.get(x, y, z);
      if (isSolid(v) && this.botCanBreak(pt, x, y, z, v)) return [x, y, z];
    }
    return null;
  }

  botCanBreak(pt: Part, x: number, y: number, z: number, v: number): boolean {
    const H = this.host, id = blockId(v);
    if (!isSolid(v) || id === B.BEDROCK) return false;
    if (H.kind === 'spires') return y < 99;
    if (id === B.GLOWSTONE) {
      const ti = H.layout.teams.findIndex((t) => t.hearth[0] === x && t.hearth[1] === y && t.hearth[2] === z);
      return ti >= 0 && ti !== pt.team && H.hearthAlive(ti);
    }
    if (id === B.OBSIDIAN && pt.pick < 4) return false;
    return H.placed.has(key(x, y, z)) || TEAM_WOOLS.has(id);
  }

  private digTime(pt: Part, v: number): number {
    const id = blockId(v);
    const k = pt.kit!;
    if (id === B.GLOWSTONE) return 30;
    if (TEAM_WOOLS.has(id) || id === B.WHITE_WOOL) return pt.shears ? 4 : 12;
    if (id === B.OBSIDIAN) return 180;
    const pickSpeed = [1, 2, 6, 12, 8][Math.min(4, pt.pick)];
    const axeSpeed = [1, 2, 6, 12, 8][Math.min(4, pt.axe)];
    if (id === B.OAK_PLANKS || id === B.LADDER) return Math.round(45 / axeSpeed) + 6;
    if (id === CB.END_STONE) return Math.round(160 / pickSpeed) + 6;
    if (id === B.GLASS || id >= 142 && id < 158) return 10;
    return Math.round((70 + (1 - k.skill) * 20) / pickSpeed) + 6;
  }
}

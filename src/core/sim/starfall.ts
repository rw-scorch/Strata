import type { WorldSim, SimPlayer } from './WorldSim';
import { blockId, getBlock, B, X, XV, makeBlock, STARFALL_ORE, STARSHARD_BLOCK } from '../blocks';
import { WORLD_HEIGHT } from '../constants';
import { I } from '../items';
import type { ItemStack } from '../inventory';
import { dimOf } from '../dimension';

export const STARFALL_WARN = 60 * 20;
export const STARFALL_GAP: [number, number] = [35 * 60 * 20, 60 * 60 * 20];
export const STARFALL_FIRST: [number, number] = [10 * 60 * 20, 20 * 60 * 20];
const STREAK = 6 * 20;

export interface StarSite { x: number; y: number; z: number; r: number; dx: number; dz: number }
export interface StarLanding { x: number; y: number; z: number; at: number }

export function naturalBlock(v: number): boolean {
  if (!blockId(v)) return true;
  const d = getBlock(v);
  if (d.fluid) return true;
  return d.category === 'nature' || d.category === 'ore' || d.category === 'plants';
}

const sec = (t: number) => Math.max(0, Math.ceil(t / 20));
const mins = (t: number) => { const m = Math.max(1, Math.round(t / 1200)); return `${m} minute${m === 1 ? '' : 's'}`; };

export class Starfall {
  next = -1;
  site: StarSite | null = null;
  impactAt = 0;
  last: StarLanding | null = null;
  landed = 0;
  private said = new Set<number>();

  constructor(private sim: WorldSim) {}

  private watchers(): SimPlayer[] {
    return [...this.sim.players.values()].filter((p) => !p.bot && !p.dead && dimOf(p.x) === 'overworld');
  }

  private span([a, b]: [number, number]): number { return a + this.sim.rng.int(b - a + 1); }

  private say(text: string): void { this.sim.emit({ e: 'msg', text, kind: 'info' }); }

  tick(): void {
    const sim = this.sim;
    if (!sim.authoritative) return;
    if (!sim.starfallOn) { this.next = -1; this.site = null; return; }
    const now = sim.tickCount;
    if (this.next < 0) this.next = now + this.span(STARFALL_FIRST);
    if (this.site) { this.tickFall(now); return; }
    if (now < this.next) return;
    const ws = this.watchers();
    if (!ws.length) { this.next = now + 600; return; }
    const p = ws[sim.rng.int(ws.length)];
    if (!this.begin(p)) this.next = now + 1200;
  }

  begin(p: SimPlayer, near = false): boolean {
    const site = this.findSite(p, near);
    if (!site) return false;
    this.site = site;
    this.impactAt = this.sim.tickCount + STARFALL_WARN;
    this.said.clear();
    const where = `${site.x} ${site.y + 1} ${site.z}`;
    this.say(`[Starfall] A star is falling! It will land near ${where} in ${sec(STARFALL_WARN)} seconds. Starshards wait in the crater for whoever reaches it first.`);
    this.sim.emit({ e: 'title', text: 'STARFALL', sub: `A star will land near ${site.x} ${site.z}` });
    this.sim.emit({ e: 'sound', s: 'bell.ring', x: p.x, y: p.y + 1, z: p.z, vol: 3 });
    return true;
  }

  private tickFall(now: number): void {
    const s = this.site!;
    const left = this.impactAt - now;
    for (const mark of [30, 10]) if (left === mark * 20 && !this.said.has(mark)) { this.said.add(mark); this.say(`[Starfall] Impact near ${s.x} ${s.z} in ${mark} seconds.`); }
    if (left <= STREAK && left > 0 && left % 2 === 0) {
      const t = 1 - left / STREAK;
      const h = 110 * (1 - t);
      this.sim.emit({ e: 'particles', k: 'star', x: s.x + 0.5 + s.dx * h * 0.7, y: Math.min(WORLD_HEIGHT + 40, s.y + 2 + h), z: s.z + 0.5 + s.dz * h * 0.7 });
    }
    if (left > 0) return;
    this.site = null;
    this.next = now + this.span(STARFALL_GAP);
    let site: StarSite | null = s;
    if (!this.clear(s)) {
      const ws = this.watchers();
      site = ws.length ? this.findSite(ws[this.sim.rng.int(ws.length)], false) : null;
      if (!site) { this.say('[Starfall] The star burned up before it reached the ground.'); return; }
      this.say(`[Starfall] The star veered off course and came down near ${site.x} ${site.z}.`);
    }
    this.impact(site);
  }

  private surface(x: number, z: number): number {
    const sim = this.sim;
    for (let y = WORLD_HEIGHT - 2; y > 2; y--) {
      const v = sim.get(x, y, z);
      if (!blockId(v)) continue;
      const d = getBlock(v);
      if (d.fluid) return -1;
      if (!d.solid || d.render === 'cross') continue;
      if (d.render === 'leaves' || /_log$|_wood$/.test(d.key)) return -1;
      return y;
    }
    return -1;
  }

  private clear(s: StarSite): boolean {
    const sim = this.sim, R = s.r + 2;
    for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) {
      if (dx * dx + dz * dz > R * R) continue;
      const x = s.x + dx, z = s.z + dz;
      if (!sim.store.isLoaded(x, z)) return false;
      for (let y = s.y - 6; y <= s.y + 12; y++) if (!naturalBlock(sim.get(x, y, z))) return false;
    }
    return true;
  }

  findSite(p: SimPlayer, near: boolean): StarSite | null {
    const sim = this.sim, r = sim.rng;
    for (let tries = 0; tries < 24; tries++) {
      const a = r.next() * Math.PI * 2, dist = near ? 10 + r.int(14) : 28 + r.int(52);
      const x = Math.floor(p.x + Math.cos(a) * dist), z = Math.floor(p.z + Math.sin(a) * dist);
      if (dimOf(x) !== 'overworld' || !sim.store.isLoaded(x, z)) continue;
      const y = this.surface(x, z);
      if (y < 40 || y > WORLD_HEIGHT - 40) continue;
      const rad = 4 + r.int(3);
      let ok = true;
      for (const [ox, oz] of [[rad, 0], [-rad, 0], [0, rad], [0, -rad]]) { const yy = this.surface(x + ox, z + oz); if (yy < 0 || Math.abs(yy - y) > 4) { ok = false; break; } }
      if (!ok) continue;
      const da = r.next() * Math.PI * 2;
      const s: StarSite = { x, y, z, r: rad, dx: Math.cos(da), dz: Math.sin(da) };
      if (this.clear(s)) return s;
    }
    return null;
  }

  private cache(): (ItemStack | null)[] {
    const r = this.sim.rng;
    const items: ItemStack[] = [{ id: I.STARSHARD, count: 3 + r.int(4) }, { id: I.EXPERIENCE_BOTTLE, count: 4 + r.int(9) }];
    if (r.chance(0.6)) items.push({ id: I.AETHERITE, count: 1 + r.int(3) });
    if (r.chance(0.5)) items.push({ id: I.GOLDEN_APPLE, count: 1 + r.int(2) });
    if (r.chance(0.35)) items.push({ id: I.ENDER_PEARL, count: 2 + r.int(4) });
    if (r.chance(0.7)) { const b: ItemStack = { id: I.ENCHANTED_BOOK, count: 1 }; this.sim.enchantSome(b); items.push(b); }
    const out: (ItemStack | null)[] = new Array(27).fill(null);
    for (const st of items) { let i = r.int(27); while (out[i]) i = (i + 1) % 27; out[i] = st; }
    return out;
  }

  impact(s: StarSite): void {
    const sim = this.sim, r = sim.rng, R = s.r, D = Math.max(2, Math.round(R * 0.6));
    const scorch = [X(XV.BLACKSTONE), X(XV.BASALT), B.MAGMA_BLOCK, B.OBSIDIAN, B.GRAVEL];
    let ores = 0;
    for (let dx = -R - 2; dx <= R + 2; dx++) for (let dz = -R - 2; dz <= R + 2; dz++) {
      const d = Math.hypot(dx, dz);
      const x = s.x + dx, z = s.z + dz;
      if (d > R + 1.5) continue;
      const top = this.surface(x, z);
      if (top < 0) continue;
      for (let y = top + 1; y <= top + 3; y++) { const v = sim.get(x, y, z); if (blockId(v) && getBlock(v).render === 'cross') sim.setBlock(x, y, z, 0); }
      if (d > R) {
        if (r.chance(0.55)) sim.setBlock(x, top + 1, z, scorch[r.int(scorch.length)]);
        continue;
      }
      const depth = Math.round((1 - (d / R) * (d / R)) * D);
      for (let y = top; y > top - depth; y--) if (blockId(sim.get(x, y, z)) !== B.BEDROCK) sim.setBlock(x, y, z, 0);
      const floor = top - depth;
      const core = d < R * 0.5;
      for (let k = 0; k < 2; k++) {
        const y = floor - k;
        if (y < 2 || blockId(sim.get(x, y, z)) === B.BEDROCK) break;
        const ore = r.chance(core ? (k ? 0.3 : 0.55) : (k ? 0.08 : 0.2));
        if (ore) ores++;
        sim.setBlock(x, y, z, ore ? makeBlock(STARFALL_ORE) : scorch[r.int(scorch.length)]);
      }
    }
    const fy = this.surface(s.x, s.z);
    const cy = fy < 0 ? s.y : fy;
    sim.setBlock(s.x, cy, s.z, makeBlock(STARSHARD_BLOCK));
    sim.setBlock(s.x, cy + 1, s.z, makeBlock(B.CHEST, r.int(4)));
    sim.addGeneratedChest(s.x, cy + 1, s.z, this.cache());
    sim.explode(s.x + 0.5, cy + 1.5, s.z + 0.5, 4, { noBlocks: true });
    for (let i = 0; i < 6; i++) sim.emit({ e: 'particles', k: 'star', x: s.x + 0.5 + (r.next() - 0.5) * R, y: cy + 1.5 + r.next() * 2, z: s.z + 0.5 + (r.next() - 0.5) * R });
    sim.emit({ e: 'sound', s: 'explode', x: s.x + 0.5, y: cy + 1, z: s.z + 0.5, vol: 6 });
    this.last = { x: s.x, y: cy + 1, z: s.z, at: sim.tickCount };
    this.landed++;
    this.say(`[Starfall] The star has landed at ${s.x} ${cy + 1} ${s.z}! A Star Cache and ${ores} starfall ore wait in the crater.`);
    sim.emit({ e: 'title', text: 'IMPACT', sub: `The star landed at ${s.x} ${cy + 1} ${s.z}` });
  }

  command(p: SimPlayer, args: string[]): string {
    const sim = this.sim, sub = (args[0] ?? '').toLowerCase();
    if (!sim.starfallOn) return 'Starfall only happens on the official New Strata SMP.';
    if (sub === 'help') return 'Usage: /starfall shows when the next star falls. /starfall last shows where the last one landed. Operators: /starfall now drops one near you.';
    if (sub === 'now') {
      if (!p.op) return 'You do not have permission for that command.';
      if (this.site) return 'A star is already falling.';
      if (dimOf(p.x) !== 'overworld') return 'Stars only fall in the overworld.';
      return this.begin(p, true) ? 'A star is on its way.' : 'Could not find open natural ground nearby. Try somewhere flatter, away from builds.';
    }
    if (sub === 'last' || sub === 'where') return this.last ? `The last star landed at ${this.last.x} ${this.last.y} ${this.last.z}, ${mins(sim.tickCount - this.last.at)} ago.` : 'No star has landed since the server started.';
    if (this.site) return `A star lands near ${this.site.x} ${this.site.z} in ${sec(this.impactAt - sim.tickCount)} seconds.`;
    const eta = this.next < 0 ? STARFALL_FIRST[0] : this.next - sim.tickCount;
    return `The next star falls in about ${mins(eta)}. Stars land in open, natural ground near players.`;
  }
}

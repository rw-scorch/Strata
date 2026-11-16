import type { WorldSim, SimPlayer } from './WorldSim';
import { B, blockId, isSolid } from '../blocks';
import { WORLD_HEIGHT } from '../constants';
import type { MobType } from './mobs';
import { cmdXYZ } from '../dimension';

export interface Prank { id: string; name: string; blurb: string; razes?: boolean; aim?: boolean }

export const PRANKS: Prank[] = [
  { id: 'orbital_nuke', name: 'Orbital Strike: Nuke', blurb: 'Unstable-style orbital cannon. Rings of TNT rain from the sky and flatten everything.', razes: true, aim: true },
  { id: 'orbital_stab', name: 'Orbital Strike: Stab', blurb: 'A column of TNT drills straight down towards bedrock.', razes: true, aim: true },
  { id: 'skyfall', name: 'Skyfall Lance', aim: true, blurb: 'Orbital strike. A targeting beam locks on for three seconds, then the sky answers.' },
  { id: 'skyfall_raze', name: 'Skyfall Lance (Raze)', blurb: 'The same strike, but it carves a crater.', razes: true, aim: true },
  { id: 'smite', name: 'Smite', blurb: 'A lightning bolt straight down on their head.', aim: true },
  { id: 'catapult', name: 'Catapult', blurb: 'Fling them high into the air.' },
  { id: 'skydrop', name: 'Sky Drop', blurb: 'Teleport them to the top of the sky. Good luck.' },
  { id: 'cell', name: 'Obsidian Cell', blurb: 'Seal them in an obsidian box with a glass window.' },
  { id: 'frostbind', name: 'Frostbind', blurb: 'Freeze them in place for six seconds.' },
  { id: 'nightfall', name: 'Nightfall', blurb: 'Pull the world into a pulsing gloom for twelve seconds.' },
  { id: 'hotfoot', name: 'Hotfoot', blurb: 'Set them on fire.' },
  { id: 'ambush', name: 'Hollow Ambush', blurb: 'Surround them with hollowed and rattlebones.' },
  { id: 'featherstorm', name: 'Feather Storm', blurb: 'Rain two dozen fernhens down on them.' },
  { id: 'cascade', name: 'Gravel Cascade', blurb: 'Drop a column of gravel on their head.' },
  { id: 'powderkeg', name: 'Powder Keg', blurb: 'A lit TNT appears at their feet.', razes: true },
  { id: 'tornado', name: 'Pocket Tornado', blurb: 'Shuffle their hotbar.' },
  { id: 'switcheroo', name: 'Switcheroo', blurb: 'Swap places with another random player.' },
  { id: 'phantom', name: 'Phantom Blast', blurb: 'They alone hear an explosion right behind them.' },
];

type Job = { at: number; run: () => void };

export class Mischief {
  private jobs: Job[] = [];
  private frozen = new Map<string, { x: number; y: number; z: number; until: number }>();

  constructor(private sim: WorldSim) {}

  get busy(): boolean { return this.jobs.length > 0 || this.frozen.size > 0; }

  private later(ticks: number, run: () => void): void { this.jobs.push({ at: this.sim.tickCount + ticks, run }); }

  private targets(op: SimPlayer, who: string | undefined): SimPlayer[] {
    const ps = [...this.sim.players.values()].filter((p) => !p.dead);
    if (!who || who === '@s' || who === 'me') return [op];
    if (who === '@a' || who === 'everyone') return ps;
    if (who === '@o' || who === 'others') return ps.filter((p) => p !== op);
    if (who === '@r') return ps.length ? [ps[Math.floor(Math.random() * ps.length)]] : [];
    const n = who.toLowerCase();
    const p = ps.find((q) => q.name.toLowerCase() === n) ?? ps.find((q) => q.name.toLowerCase().startsWith(n));
    return p ? [p] : [];
  }

  run(op: SimPlayer, parts: string[]): string {
    const id = (parts[1] ?? '').toLowerCase();
    const pr = PRANKS.find((q) => q.id === id);
    if (!pr) return `Mischief: /troll <${PRANKS.map((q) => q.id).join('|')}> [player|@a|@o|@r]`;
    if (parts[2] === 'at') {
      if (!pr.aim) return `${pr.name} needs a player target.`;
      const xyz = cmdXYZ(op, parts.slice(3, 6));
      if (!xyz) return 'Usage: /troll <prank> at <x> <y> <z>';
      this.strikeAt(pr.id, xyz[0], xyz[1], xyz[2]);
      return `${pr.name} → ${parts.slice(3, 6).join(' ')}.`;
    }
    const ts = this.targets(op, parts[2]);
    if (!ts.length) return 'No player by that name.';
    for (const t of ts) this.apply(pr.id, op, t);
    return `${pr.name} → ${ts.length > 1 ? `${ts.length} players` : ts[0].name}.`;
  }

  private ground(x: number, z: number, from: number): number {
    let y = Math.min(WORLD_HEIGHT - 2, Math.floor(from));
    while (y > 1 && !isSolid(this.sim.get(Math.floor(x), y - 1, Math.floor(z)))) y--;
    return y;
  }

  private sound(s: string, x: number, y: number, z: number, vol = 1, pitch?: number, to?: string): void {
    this.sim.emit({ e: 'sound', s, x, y, z, vol, pitch, to });
  }

  private fallTicks(h: number): number {
    let y = 0, vy = -2, t = 0;
    while (y > -h && t < 200) { vy -= 0.8; y += vy / 20; vy *= 0.98; t++; }
    return t;
  }

  private beam(x: number, z: number, from: number, ticks: number): void {
    for (let i = 0; i < ticks; i += 4) {
      this.later(i, () => {
        const gy = this.ground(x, z, from);
        for (let y = gy; y < Math.min(WORLD_HEIGHT, gy + 48); y += 3) this.sim.emit({ e: 'particles', k: 'crit', x, y, z });
        this.sound('click', x, gy, z, 0.8, 1.2 + i / ticks);
      });
    }
  }

  private dropTnt(x: number, z: number, top: number, extra = 0): void {
    const gy = this.ground(x, z, top);
    const sy = Math.min(WORLD_HEIGHT - 2, Math.max(gy + 30, top));
    this.sim.spawnPrimed(x, sy, z, this.fallTicks(sy - gy) + 2 + extra, 0, -2, 0);
  }

  strikeAt(id: string, x: number, y: number, z: number): void {
    const sim = this.sim;
    const top = Math.min(WORLD_HEIGHT - 2, this.ground(x, z, WORLD_HEIGHT - 2) + 45);
    if (id === 'orbital_nuke') {
      this.beam(x, z, y + 1, 40);
      this.later(40, () => {
        sim.emit({ e: 'lightning', x, y: this.ground(x, z, y + 1), z });
        this.sound('thunder', x, y, z, 4, 0.6);
      });
      const rings = [0, 3.5, 7, 10.5, 14, 17.5];
      rings.forEach((r, ri) => {
        const n = r ? Math.round((2 * Math.PI * r) / 3) : 1;
        this.later(40 + ri * 3, () => {
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2 + ri * 0.37;
            this.dropTnt(x + Math.cos(a) * r, z + Math.sin(a) * r, top, ri * 2 + Math.floor(Math.random() * 4));
          }
        });
      });
      return;
    }
    if (id === 'orbital_stab') {
      this.beam(x, z, y + 1, 30);
      for (let i = 0; i < 40; i++) this.later(30 + i * 4, () => this.dropTnt(x, z, top));
      return;
    }
    if (id === 'smite') {
      const gy = this.ground(x, z, y + 1);
      sim.emit({ e: 'lightning', x, y: gy, z });
      this.sound('thunder', x, gy, z, 3);
      return;
    }
    if (id === 'skyfall' || id === 'skyfall_raze') {
      this.beam(x, z, y + 1, 60);
      this.later(60, () => {
        const cy = this.ground(x, z, y + 1);
        sim.emit({ e: 'lightning', x, y: cy, z });
        this.sound('thunder', x, cy, z, 4);
        const ring = [[0, 0], [3, 0], [-3, 0], [0, 3], [0, -3], [2.2, 2.2], [-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2]];
        ring.forEach(([dx, dz], i) => this.later(i * 2, () => sim.explode(x + dx, this.ground(x + dx, z + dz, cy + 3), z + dz, i ? 3.2 : 4.5, { noBlocks: id === 'skyfall' })));
      });
    }
  }

  private apply(id: string, _op: SimPlayer, t: SimPlayer): void {
    const sim = this.sim;
    switch (id) {
      case 'orbital_nuke': case 'orbital_stab': {
        sim.emit({ e: 'title', text: 'ORBITAL STRIKE', sub: 'Inbound', to: t.id });
        const tx = t.x, tz = t.z, ty = t.y;
        this.strikeAt(id, tx, ty, tz);
        return;
      }
      case 'skyfall': case 'skyfall_raze': {
        const raze = id === 'skyfall_raze';
        sim.emit({ e: 'title', text: 'TARGET LOCKED', sub: 'Skyfall Lance inbound', to: t.id });
        for (let i = 0; i < 60; i += 4) {
          this.later(i, () => {
            const gy = this.ground(t.x, t.z, t.y + 1);
            for (let y = gy; y < Math.min(WORLD_HEIGHT, gy + 40); y += 3) sim.emit({ e: 'particles', k: 'crit', x: t.x, y, z: t.z });
            this.sound('click', t.x, t.y, t.z, 0.6, 1.4 + i / 60);
          });
        }
        this.later(60, () => {
          const cx = t.x, cz = t.z, cy = this.ground(cx, cz, t.y + 1);
          sim.emit({ e: 'lightning', x: cx, y: cy, z: cz });
          this.sound('thunder', cx, cy, cz, 4);
          const ring = [[0, 0], [3, 0], [-3, 0], [0, 3], [0, -3], [2.2, 2.2], [-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2]];
          ring.forEach(([dx, dz], i) => this.later(i * 2, () => sim.explode(cx + dx, this.ground(cx + dx, cz + dz, cy + 3), cz + dz, i ? 3.2 : 4.5, { noBlocks: !raze })));
        });
        return;
      }
      case 'smite': {
        const y = this.ground(t.x, t.z, t.y + 1);
        sim.emit({ e: 'lightning', x: t.x, y, z: t.z });
        this.sound('thunder', t.x, y, t.z, 3);
        sim.damage(t, 5, 'fire', t.x, t.z);
        t.fireT = Math.max(t.fireT, 160);
        return;
      }
      case 'catapult':
        sim.emit({ e: 'knock', p: t, x: (Math.random() - 0.5) * 0.6, y: 3.2, z: (Math.random() - 0.5) * 0.6, set: true });
        this.sound('piston', t.x, t.y, t.z, 1, 0.6);
        return;
      case 'skydrop':
        t.back = { x: t.x, y: t.y, z: t.z };
        t.y = WORLD_HEIGHT + 20; t.peakY = t.y;
        sim.emit({ e: 'tp', p: t });
        return;
      case 'cell': {
        const bx = Math.floor(t.x), by = Math.floor(t.y), bz = Math.floor(t.z);
        for (let dy = -1; dy <= 2; dy++) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
          const shell = dy === -1 || dy === 2 || dx !== 0 || dz !== 0;
          if (!shell) continue;
          const y = by + dy;
          if (y < 1 || y >= WORLD_HEIGHT) continue;
          const cur = blockId(sim.get(bx + dx, y, bz + dz));
          if (cur === B.BEDROCK) continue;
          sim.setBlock(bx + dx, y, bz + dz, dy === 1 && (dx === 0 || dz === 0) ? B.GLASS : B.OBSIDIAN, 'troll');
        }
        t.x = bx + 0.5; t.z = bz + 0.5; t.y = by;
        sim.emit({ e: 'tp', p: t });
        this.sound('piston', t.x, t.y, t.z, 1, 0.5);
        return;
      }
      case 'frostbind':
        this.frozen.set(t.id, { x: t.x, y: t.y, z: t.z, until: sim.tickCount + 120 });
        sim.emit({ e: 'title', text: '', sub: 'Frostbound', to: t.id });
        return;
      case 'nightfall':
        sim.emit({ e: 'dark', p: t, t: 240 });
        this.sound('sculk', t.x, t.y, t.z, 1.4, 0.5, t.id);
        return;
      case 'hotfoot':
        t.fireT = Math.max(t.fireT, 200);
        this.sound('fire', t.x, t.y, t.z);
        sim.emit({ e: 'vitals', p: t });
        return;
      case 'ambush': {
        const kinds: MobType[] = ['hollowed', 'hollowed', 'rattlebone', 'hollowed', 'rattlebone', 'duskweaver'];
        kinds.forEach((k, i) => {
          const a = (i / kinds.length) * Math.PI * 2;
          const x = t.x + Math.cos(a) * 4, z = t.z + Math.sin(a) * 4;
          const e = sim.spawnMob(k, x, this.ground(x, z, t.y + 3), z);
          e.persistent = false;
        });
        return;
      }
      case 'featherstorm':
        for (let i = 0; i < 24; i++) this.later(i * 2, () => { sim.spawnMob('fernhen', t.x + (Math.random() - 0.5) * 6, Math.min(WORLD_HEIGHT - 2, t.y + 12 + Math.random() * 6), t.z + (Math.random() - 0.5) * 6); });
        return;
      case 'cascade': {
        const bx = Math.floor(t.x), bz = Math.floor(t.z), top = Math.floor(t.y) + 8;
        for (let i = 0; i < 6; i++) {
          const y = top + i;
          if (y >= WORLD_HEIGHT) break;
          if (blockId(sim.get(bx, y, bz)) === 0) sim.setBlock(bx, y, bz, B.GRAVEL, 'troll');
        }
        return;
      }
      case 'powderkeg':
        sim.spawnPrimed(t.x, t.y + 0.1, t.z, 50);
        this.sound('tnt', t.x, t.y, t.z);
        return;
      case 'tornado': {
        const hb = t.inv.slots.slice(0, 9);
        for (let i = hb.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [hb[i], hb[j]] = [hb[j], hb[i]]; }
        for (let i = 0; i < 9; i++) t.inv.slots[i] = hb[i];
        sim.emit({ e: 'inv', p: t });
        return;
      }
      case 'switcheroo': {
        const others = [...sim.players.values()].filter((p) => p !== t && !p.dead);
        if (!others.length) return;
        const o = others[Math.floor(Math.random() * others.length)];
        const a = { x: t.x, y: t.y, z: t.z };
        t.x = o.x; t.y = o.y; t.z = o.z; t.peakY = t.y;
        o.x = a.x; o.y = a.y; o.z = a.z; o.peakY = o.y;
        sim.emit({ e: 'tp', p: t });
        sim.emit({ e: 'tp', p: o });
        return;
      }
      case 'phantom': {
        const bx = t.x - Math.sin(t.yaw) * -2, bz = t.z - Math.cos(t.yaw) * -2;
        this.sound('tnt', bx, t.y, bz, 1, 1, t.id);
        this.later(30, () => this.sound('explode', bx, t.y + 1, bz, 3, 1, t.id));
        return;
      }
    }
  }

  tick(): void {
    const now = this.sim.tickCount;
    if (this.jobs.length) {
      const due = this.jobs.filter((j) => j.at <= now);
      if (due.length) {
        this.jobs = this.jobs.filter((j) => j.at > now);
        for (const j of due) j.run();
      }
    }
    for (const [id, f] of this.frozen) {
      const p = this.sim.players.get(id);
      if (!p || p.dead || now > f.until) { this.frozen.delete(id); continue; }
      if (now % 4 === 0 && Math.hypot(p.x - f.x, p.y - f.y, p.z - f.z) > 0.2) {
        p.x = f.x; p.y = f.y; p.z = f.z; p.peakY = p.y;
        this.sim.emit({ e: 'tp', p });
      }
    }
  }
}

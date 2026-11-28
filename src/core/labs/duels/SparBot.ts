import { moveStep, type Body, type BlockReader } from '../../physics';
import { I, getItem } from '../../items';
import { heldStack } from '../../inventory';
import { attackCharge, attackStats } from '../../sim/combat';
import { MF, type WorldSim, type SimPlayer, type SimEvent } from '../../sim/WorldSim';
import type { BotTier } from './kits';

export interface TierSkill { react: number; aim: number; turn: number; charge: number; crit: number; wtap: number; strafe: number; block: number; pearl: boolean; heal: number; reach: number; }

export const SKILLS: Record<BotTier, TierSkill> = {
  squire: { react: 9, aim: 0.2, turn: 0.18, charge: 0.55, crit: 0.05, wtap: 0, strafe: 0.25, block: 0.12, pearl: false, heal: 5, reach: 2.55 },
  knight: { react: 6, aim: 0.1, turn: 0.3, charge: 0.8, crit: 0.3, wtap: 0.35, strafe: 0.6, block: 0.4, pearl: true, heal: 8, reach: 2.8 },
  champion: { react: 3, aim: 0.05, turn: 0.5, charge: 0.92, crit: 0.6, wtap: 0.75, strafe: 0.85, block: 0.7, pearl: true, heal: 10, reach: 2.95 },
  warlord: { react: 1, aim: 0.02, turn: 0.8, charge: 0.97, crit: 0.85, wtap: 0.95, strafe: 0.95, block: 0.9, pearl: true, heal: 11, reach: 3.0 },
};

const wrap = (a: number) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

export class SparBot {
  readonly body: Body;
  readonly skill: TierSkill;
  private hist: [number, number, number][] = [];
  private strafeDir = 1;
  private strafeT = 0;
  private wtapT = 0;
  private critPlan = false;
  private blockT = 0;
  private blockCd = 0;
  private eatT = 0;
  private healCd = 0;
  private bowT = 0;
  private pearlCd = 100;
  private swapBack = -1;
  private noise = 0;
  private sprinting = false;
  active = false;
  private readonly world: BlockReader;

  constructor(private sim: WorldSim, readonly p: SimPlayer, readonly tier: BotTier, public target: string) {
    this.skill = SKILLS[tier];
    this.body = { x: p.x, y: p.y, z: p.z, vx: 0, vy: 0, vz: 0, hw: 0.3, h: 1.8, onGround: false, hitH: false, hitCeil: false };
    this.world = { getBlock: (x, y, z) => sim.get(x, y, z) };
  }

  onEvent(ev: SimEvent): void {
    const b = this.body;
    if (ev.e === 'tp' || ev.e === 'respawn') { b.x = this.p.x; b.y = this.p.y; b.z = this.p.z; b.vx = b.vy = b.vz = 0; this.hist.length = 0; return; }
    if (ev.e === 'knock') { b.vx += ev.x; b.vz += ev.z; b.vy = ev.set ? ev.y : Math.max(b.vy, ev.y); return; }
    if (ev.e === 'hurt' && (ev.kb ?? 0) > 0) {
      const kb = ev.kb ?? 0;
      let dx = ev.fx - b.x, dz = ev.fz - b.z;
      if (Math.hypot(dx, dz) < 1e-4) { dx = Math.random() - 0.5; dz = Math.random() - 0.5; }
      const l = Math.hypot(dx, dz) || 1;
      b.vx = b.vx / 2 - (dx / l) * kb;
      b.vz = b.vz / 2 - (dz / l) * kb;
      if (b.onGround) b.vy = Math.min(0.4, b.vy / 2 + kb);
      this.sprinting = false;
      if (this.p.inv.off[0]?.id === I.SHIELD && Math.random() < this.skill.block * 0.5 && this.blockCd <= 0) this.blockT = 6 + Math.floor(Math.random() * 8);
    }
  }

  private slotOf(pred: (id: number) => boolean): number {
    for (let i = 0; i < 9; i++) { const s = this.p.inv.slots[i]; if (s && pred(s.id)) return i; }
    return -1;
  }

  private select(i: number): void {
    if (i < 0 || this.p.inv.selected === i) return;
    this.p.inv.selected = i;
    this.p.lastSwing = this.sim.clock;
  }

  private weaponSlot(): number {
    const sw = this.slotOf((id) => !!getItem(id)?.tool && getItem(id)!.tool!.type === 'sword');
    return sw >= 0 ? sw : this.slotOf((id) => getItem(id)?.tool?.type === 'axe');
  }

  tick(): void {
    const p = this.p, b = this.body, sim = this.sim, sk = this.skill;
    if (p.dead) return;
    let flags = 0, fwd = 0, side = 0, jump = false;
    const t = sim.players.get(this.target);
    if (this.swapBack >= 0) { this.select(this.swapBack); this.swapBack = -1; }
    if (this.active && t && !t.dead) {
      this.hist.push([t.x, t.y, t.z]);
      if (this.hist.length > 20) this.hist.shift();
      const seen = this.hist[Math.max(0, this.hist.length - 1 - sk.react)];
      const dx = seen[0] - b.x, dz = seen[2] - b.z, dist = Math.hypot(dx, dz);
      const realD = Math.hypot(t.x - b.x, t.z - b.z), dy3 = t.y + 0.9 - (b.y + 1.62);
      this.noise += (Math.random() - 0.5) * sk.aim * 0.8;
      this.noise *= 0.9;
      const want = Math.atan2(-dx, -dz) + this.noise;
      const turn = wrap(want - p.yaw);
      p.yaw = wrap(p.yaw + Math.max(-sk.turn, Math.min(sk.turn, turn)));
      const wantPitch = Math.atan2(seen[1] + 1.1 - (b.y + 1.62), Math.max(0.5, dist));
      p.pitch += (wantPitch - p.pitch) * 0.5;
      const aimed = Math.abs(wrap(Math.atan2(-(t.x - b.x), -(t.z - b.z)) - p.yaw)) < 0.45 + 0.25 / Math.max(1, realD);
      if (this.blockCd > 0) this.blockCd--;
      if (this.healCd > 0) this.healCd--;
      if (this.pearlCd > 0) this.pearlCd--;
      const gap = this.slotOf((id) => id === I.GOLDEN_APPLE);
      const hasShield = p.inv.off[0]?.id === I.SHIELD && sim.clock >= (p.shieldCd ?? 0);
      if (this.eatT > 0) {
        this.eatT--;
        flags |= MF.EAT;
        fwd = realD < 5 ? -1 : 0;
        side = this.strafeDir;
        if (this.eatT === 0) { sim.eat(p); this.select(this.weaponSlot()); this.healCd = 60; }
      } else if (p.health <= sk.heal && gap >= 0 && this.healCd <= 0 && (p.absorb ?? 0) <= 0 && (realD > 3.2 || this.tier === 'squire')) {
        this.select(gap);
        this.eatT = 33;
        flags |= MF.EAT;
      } else if (this.bowT > 0) {
        this.bowT--;
        flags |= MF.CHARGE;
        side = this.strafeDir;
        if (this.bowT === 0) {
          const lead = realD / 3;
          const ax = t.x + (t.vel?.x ?? 0) * 0.05 * lead, az = t.z + (t.vel?.z ?? 0) * 0.05 * lead;
          const yaw = Math.atan2(-(ax - b.x), -(az - b.z)) + this.noise * 0.5;
          sim.shootBow(p, 1, yaw, Math.atan2(dy3, realD) + realD * 0.011);
          this.select(this.weaponSlot());
        }
      } else {
        const pearl = this.slotOf((id) => id === I.ENDER_PEARL);
        const bow = this.slotOf((id) => id === I.BOW);
        const arrows = this.p.inv.slots.some((s) => s?.id === I.ARROW);
        if (sk.pearl && pearl >= 0 && realD > 13 && this.pearlCd <= 0 && b.onGround) {
          this.select(pearl);
          sim.shootBow(p, 1, Math.atan2(-(t.x - b.x), -(t.z - b.z)), 0.32 + realD * 0.006);
          this.swapBack = this.weaponSlot();
          this.pearlCd = 160 + Math.floor(Math.random() * 120);
        } else if (bow >= 0 && arrows && realD > 9 && realD < 28 && Math.random() < 0.08) {
          this.select(bow);
          this.bowT = 20 + Math.floor(Math.random() * 6);
          flags |= MF.CHARGE;
        } else {
          if (this.blockT > 0) {
            this.blockT--;
            if (hasShield) flags |= MF.BLOCK; else this.blockT = 0;
            if (this.blockT === 0) this.blockCd = 10 + Math.floor((1 - sk.block) * 30);
          } else if (hasShield && realD < 4.2 && this.blockCd <= 0 && (t.flags & MF.SWING || Math.random() < 0.04) && Math.random() < sk.block * 0.35) {
            this.blockT = 5 + Math.floor(Math.random() * 10);
          }
          const held = heldStack(p.inv);
          const charge = attackCharge(sim.clock - Math.max(p.strengthAt ?? 0, p.lastSwing ?? 0), attackStats(held).speed);
          if (charge > 0.6 && realD < sk.reach + 1.5 && !this.critPlan && b.onGround) this.critPlan = Math.random() < sk.crit;
          const reach = Math.hypot(t.x - b.x, Math.max(0, Math.abs(dy3) - 0.9), t.z - b.z) - 0.3;
          const inReach = reach <= sk.reach;
          const falling = !b.onGround && b.vy < -0.02;
          if (!(flags & MF.BLOCK) && inReach && aimed && charge >= sk.charge && (!this.critPlan || falling)) {
            const axe = this.slotOf((id) => getItem(id)?.tool?.type === 'axe');
            if (t.flags & MF.BLOCK && axe >= 0 && getItem(held?.id ?? -1)?.tool?.type !== 'axe') { this.select(axe); this.swapBack = this.weaponSlot(); }
            if (this.critPlan) this.sprinting = false;
            sim.move(p, b.x, b.y, b.z, p.yaw, p.pitch, (p.flags & ~MF.SPRINT) | (this.sprinting ? MF.SPRINT : 0));
            sim.attackPlayer(p, t.id);
            flags |= MF.SWING;
            this.critPlan = false;
            if (Math.random() < sk.wtap) this.wtapT = 2 + Math.floor(Math.random() * 3);
          } else if (this.critPlan && inReach && b.onGround && charge > 0.75) jump = true;
          if (this.critPlan && charge < 0.3) this.critPlan = false;
          const close = this.tier === 'squire' ? 2.2 : 2.6;
          if (dist > close) fwd = 1;
          else if (dist < 1.4) fwd = -1;
          if (--this.strafeT <= 0) { this.strafeDir = Math.random() < 0.5 ? -1 : 1; this.strafeT = 12 + Math.floor(Math.random() * 25); }
          if (realD < 6 && Math.random() < sk.strafe) side = this.strafeDir;
        }
      }
      if (this.wtapT > 0) { this.wtapT--; if (fwd > 0) fwd = 0; this.sprinting = false; }
      else this.sprinting = fwd > 0 && !(flags & (MF.BLOCK | MF.EAT | MF.CHARGE)) && p.food > 6;
      if (this.critPlan) this.sprinting = false;
    } else {
      this.sprinting = false;
    }
    if (b.hitH && b.onGround && fwd > 0) jump = true;
    this.physics(fwd, side, jump, flags);
    if (b.onGround) flags |= MF.GROUND;
    if (this.sprinting) flags |= MF.SPRINT;
    if (fwd > 0) flags |= MF.FORWARD;
    if (jump) flags |= MF.JUMP;
    sim.move(p, b.x, b.y, b.z, p.yaw, p.pitch, flags);
  }

  private physics(fwd: number, side: number, jump: boolean, flags: number): void {
    const b = this.body;
    const slow = flags & (MF.BLOCK | MF.EAT | MF.CHARGE) ? 0.2 : 1;
    const ground = b.onGround;
    const mult = ground ? 0.546 : 0.91;
    const accel = (ground ? (this.sprinting ? 0.13 : 0.1) : (this.sprinting ? 0.026 : 0.02)) * slow;
    const fx = -Math.sin(this.p.yaw), fz = -Math.cos(this.p.yaw), rx = Math.cos(this.p.yaw), rz = -Math.sin(this.p.yaw);
    let ix = fx * fwd + rx * side, iz = fz * fwd + rz * side;
    const il = Math.hypot(ix, iz);
    if (il > 1) { ix /= il; iz /= il; }
    b.vx += ix * accel; b.vz += iz * accel;
    if (jump && ground) {
      b.vy = 0.42;
      if (this.sprinting) { b.vx += fx * 0.2; b.vz += fz * 0.2; }
    }
    moveStep(b, b.vx, b.vy, b.vz, this.world, ground ? 0.6 : 0);
    if (b.hitCeil && b.vy > 0) b.vy = 0;
    if (b.onGround && b.vy < 0) b.vy = 0;
    b.vy = (b.vy - 0.08) * 0.98;
    b.vx *= mult; b.vz *= mult;
    if (Math.abs(b.vx) < 0.003) b.vx = 0;
    if (Math.abs(b.vz) < 0.003) b.vz = 0;
  }
}

import { MOB_BY_CODE } from '../core/sim/mobs';
import * as THREE from 'three';
import { raycast, RayHit } from '../core/physics';
import { getBlock, selectionBox, blockId } from '../core/blocks';
import { getItem, I, spearIndex } from '../core/items';
import { attackStats, attackRange, attackCharge, SPEAR_MIN } from '../core/sim/combat';
import { breakTime, canHarvest } from '../core/sim/WorldSim';
import { heldStack } from '../core/inventory';
import { REACH_CREATIVE, REACH_SURVIVAL } from '../core/constants';
import type { InputState } from '../controls/InputState';
import type { GameSession } from './Session';
import type { ChunkManager } from './ChunkManager';
import type { Renderer } from '../rendering/Renderer';
import type { LocalPlayer } from './Player';
import type { EntityView } from '../rendering/EntityRenderer';

export interface Target { kind: 'block'; hit: RayHit; }
export interface EntityTarget { kind: 'entity'; view: EntityView; dist: number; }

export class BlockInteraction {
  target: RayHit | null = null;
  entityTarget: EntityView | null = null;
  private digPos: [number, number, number] | null = null;
  progress = 0;
  private digSoundT = 0;
  private useCd = 0;
  private breakCd = 0;
  private creativeStreak = 0;
  private attackCd = 0;
  eating = 0;
  lastSwing = 0;
  drawing = 0;
  charging = false;
  strengthT = 0;
  private seenId = -1;
  private xbSent = false;
  riding?: () => boolean;
  private ray = new THREE.Raycaster();
  onSwing: (() => void) | null = null;
  onDigSound: ((group: string, x: number, y: number, z: number) => void) | null = null;
  onDigParticles: ((x: number, y: number, z: number, v: number) => void) | null = null;
  onEatTick: (() => void) | null = null;
  pvpCheck: (() => boolean) | null = null;

  update(dt: number, input: InputState, session: GameSession, world: ChunkManager, renderer: Renderer, player: LocalPlayer, blocked: boolean): void {
    const me = session.me;
    const creative = me.mode === 'creative';
    const reach = creative ? REACH_CREATIVE : REACH_SURVIVAL;
    if (this.useCd > 0) this.useCd -= dt;
    if (this.breakCd > 0) this.breakCd -= dt;
    if (!input.breaking) this.creativeStreak = 0;
    if (this.attackCd > 0) this.attackCd -= dt;
    const cam = renderer.camera;
    let origin = new THREE.Vector3(player.x, player.eyeY, player.z);
    let dir = new THREE.Vector3();
    if (input.touchAim) {
      const ndc = new THREE.Vector2((input.touchAim.x / window.innerWidth) * 2 - 1, -(input.touchAim.y / window.innerHeight) * 2 + 1);
      this.ray.setFromCamera(ndc, cam);
      dir.copy(this.ray.ray.direction);
      origin = new THREE.Vector3(player.x, player.eyeY, player.z);
    } else {
      cam.getWorldDirection(dir);
    }
    const held = heldStack(me.inv);
    const item = held ? getItem(held.id) : undefined;
    const fluids = item?.kind === 'bucket' && held!.id === 282 || item?.key === 'lily_pad';
    const hit = blocked || me.dead ? null : raycast(world, origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, reach, fluids);
    const spear = spearIndex(held?.id ?? 0) >= 0;
    if ((held?.id ?? 0) !== this.seenId) { this.seenId = held?.id ?? 0; this.strengthT = performance.now(); }
    const jabReady = !spear || attackCharge(performance.now() - Math.max(this.lastSwing, this.strengthT), attackStats(held).speed) >= 1;
    const entReach = attackRange(attackStats(held), creative);
    let ent = blocked || me.dead ? null : renderer.entities.pick(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, entReach, (v) => v.kind === 'mob' || v.kind === 'cart' || (v.kind === 'player' && v.id !== 'me' && !(v.flags & (1 << 14))));
    if (ent && spear && ent.dist < SPEAR_MIN) ent = null;
    const entityFirst = ent && (!hit || ent.dist < hit.dist);
    this.entityTarget = entityFirst ? ent!.view : null;
    this.target = entityFirst ? null : hit;

    const tdef = this.entityTarget?.kind === 'mob' ? MOB_BY_CODE[this.entityTarget.type] : undefined;
    const lure = this.entityTarget?.kind === 'cart' || !!tdef?.trader || (held ? !!tdef?.lure?.includes(held.id) : false);
    if (this.entityTarget && lure && input.usePressed && this.useCd <= 0) {
      session.useEntity(this.entityTarget.id);
      this.useCd = 0.3;
      this.onSwing?.();
      input.usePressed = false;
      if (input.touchAim && !input.breaking) input.touchAim = null;
    }
    const t0Interactive = !!this.target && !!getBlock(world.getBlock(this.target.x, this.target.y, this.target.z)).interactive;
    this.charging = spear && input.using && !me.dead && !lure && !t0Interactive;
    if (this.entityTarget && jabReady && (input.attackPressed || (input.usePressed && input.touchAim)) && this.attackCd <= 0) {
      const v = this.entityTarget;
      if (v.kind === 'mob' || v.kind === 'cart') session.attack(v.id);
      else if (this.pvpCheck?.() && !(v.extra & 256)) session.attackPlayer(v.id.replace(/^p:/, ''));
      this.attackCd = 0.05;
      this.lastSwing = performance.now();
      this.onSwing?.();
      input.usePressed = false;
      if (input.touchAim && !input.breaking) input.touchAim = null;
    }

    if (!this.entityTarget && input.attackPressed) { this.lastSwing = performance.now(); session.swing?.(); this.onSwing?.(); }
    const t = this.target;
    if (t && input.breaking && !this.entityTarget && !spear) {
      const same = this.digPos && this.digPos[0] === t.x && this.digPos[1] === t.y && this.digPos[2] === t.z;
      if (!same) {
        if (this.digPos) session.digAbort();
        this.digPos = [t.x, t.y, t.z];
        this.progress = 0;
        if (!creative) session.digStart(t.x, t.y, t.z);
      }
      if (creative) {
        if (this.breakCd <= 0) {
          session.digDone(t.x, t.y, t.z);
          this.onSwing?.();
          this.breakCd = Math.max(0.07, 0.22 * Math.pow(0.85, this.creativeStreak));
          this.creativeStreak++;
          this.digPos = null;
        }
      } else {
        const v = world.getBlock(t.x, t.y, t.z);
        const bt = breakTime(v, held, player.medium.eyeWater, (me.inv.armor[0]?.en?.aqua_affinity ?? 0) > 0);
        if (!isFinite(bt)) { this.progress = 0; }
        else {
          this.progress += dt / bt;
          this.digSoundT -= dt;
          if (this.digSoundT <= 0) {
            this.digSoundT = 0.24;
            this.onSwing?.();
            this.onDigSound?.(getBlock(v).sound, t.x + 0.5, t.y + 0.5, t.z + 0.5);
            this.onDigParticles?.(t.hx, t.hy, t.hz, v);
          }
          if (this.progress >= 1) {
            session.digDone(t.x, t.y, t.z);
            this.digPos = null;
            this.progress = 0;
            this.breakCd = 0.12;
          }
        }
      }
    } else if (this.digPos) {
      session.digAbort();
      this.digPos = null;
      this.progress = 0;
    }

    const bow = held?.id === I.BOW;
    const xbow = held?.id === I.CROSSBOW;
    const tInteractive = !!t && !!getBlock(world.getBlock(t.x, t.y, t.z)).interactive;
    if (xbow) {
      const hasArrow = creative || me.inv.slots.some((s) => s?.id === I.ARROW);
      if (held!.ld) {
        this.drawing = 0; this.xbSent = false;
        if (input.usePressed && !tInteractive && !me.dead) { session.shoot(1, player.yaw, player.pitch); this.onSwing?.(); input.usePressed = false; }
      } else if (input.using && hasArrow && !tInteractive && !me.dead) {
        this.drawing += dt;
        if (this.drawing >= 1.25 - 0.25 * Math.min(3, held!.en?.quick_charge ?? 0) && !this.xbSent) { session.shoot(-1, player.yaw, player.pitch); this.xbSent = true; }
      } else { this.drawing = 0; this.xbSent = false; }
    } else if (bow) {
      const hasArrow = creative || me.inv.slots.some((s) => s?.id === I.ARROW);
      if (input.using && hasArrow && !tInteractive && !me.dead) this.drawing += dt;
      else if (this.drawing > 0) {
        const f = Math.min(1, this.drawing);
        const power = Math.min(1, (f * f + 2 * f) / 3);
        if (power >= 0.1) { session.shoot(power, player.yaw, player.pitch); this.onSwing?.(); }
        this.drawing = 0;
      }
    } else this.drawing = 0;
    const food = item?.food && !creative;
    const wantsUse = input.usePressed || (input.using && this.useCd <= 0 && !food);
    if (food && input.using && !(t && getBlock(world.getBlock(t.x, t.y, t.z)).interactive)) {
      if (me.food < 20 || session.info.difficulty === 'peaceful') {
        this.eating += dt;
        this.onEatTick?.();
        if (this.eating >= 1.6) { session.eat(); this.eating = 0; }
      }
    } else this.eating = 0;
    if (wantsUse && t && !this.entityTarget && !((bow || xbow) && !tInteractive) && !(food && !getBlock(world.getBlock(t.x, t.y, t.z)).interactive)) {
      session.use(t.x, t.y, t.z, t.nx, t.ny, t.nz, input.touchMode && input.forcePlace, Math.max(0, Math.min(1, t.hy - t.y)));
      this.useCd = input.usePressed ? 0.25 : 0.2;
      this.onSwing?.();
    } else if (input.usePressed && food && !t) {
      this.eating = 0.001;
    }
    if (input.touchAim && !input.breaking && !input.usePressed) input.touchAim = null;

    if (t) {
      const v = world.getBlock(t.x, t.y, t.z);
      const box = selectionBox(v) ?? [0, 0, 0, 1, 1, 1];
      const stage = this.digPos && !creative ? Math.floor(this.progress * 10) : -1;
      renderer.setSelection(box, t.x, t.y, t.z, stage);
    } else renderer.setSelection(null);
  }

  pickBlock(session: GameSession, world: ChunkManager): void {
    const t = this.target;
    if (!t) return;
    const v = world.getBlock(t.x, t.y, t.z);
    let id = blockId(v);
    if (id === 36) id = 35;
    if (id === 42) id = 280;
    if (id === 54) id = 276;
    if (!getItem(id)) return;
    const inv = session.me.inv;
    const slot = inv.slots.findIndex((s, i) => i < 9 && s?.id === id);
    if (slot >= 0) { session.invOp({ t: 'select', i: slot }); return; }
    if (session.me.mode === 'creative') {
      const empty = inv.slots.findIndex((s, i) => i < 9 && !s);
      const target = empty >= 0 ? empty : inv.selected;
      session.invOp({ t: 'creative', id, count: 64, s: { c: 'inv', i: target } });
      session.invOp({ t: 'select', i: target });
    }
  }

  harvestHint(world: ChunkManager, session: GameSession): boolean {
    const t = this.target;
    if (!t) return true;
    return canHarvest(world.getBlock(t.x, t.y, t.z), heldStack(session.me.inv));
  }
}

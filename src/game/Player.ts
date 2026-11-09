import { Body, moveBody, sampleMedium, boxCollides, BlockReader, Medium } from '../core/physics';
import { getBlock, blockId, B } from '../core/blocks';
import { MF } from '../core/sim/WorldSim';
import type { InputState } from '../controls/InputState';
import type { GameMode } from '../core/constants';

const HW = 0.3;
const STEP = 1 / 120;

export class LocalPlayer {
  body: Body = { x: 0, y: 80, z: 0, vx: 0, vy: 0, vz: 0, hw: HW, h: 1.8, onGround: false, hitH: false, hitCeil: false };
  yaw = 0;
  pitch = 0;
  crouching = false;
  sprinting = false;
  flying = false;
  medium: Medium = { water: false, lava: false, ladder: false, eyeWater: false, cactus: false };
  eyeHeight = 1.62;
  walkDist = 0;
  private stepAcc = 0;
  bobPhase = 0;
  jumpedFlag = false;
  autoJump = false;
  frozen = true;
  landed = false;
  enteredWater = false;
  private jumpCooldown = 0;
  fovBoost = 0;
  stepSound: ((material: string) => void) | null = null;
  swimSound: (() => void) | null = null;

  get x(): number { return this.body.x; }
  get y(): number { return this.body.y; }
  get z(): number { return this.body.z; }
  get eyeY(): number { return this.body.y + this.eyeHeight; }

  setPos(x: number, y: number, z: number): void {
    this.body.x = x; this.body.y = y; this.body.z = z;
    this.body.vx = this.body.vy = this.body.vz = 0;
  }

  look(dx: number, dy: number): void {
    this.yaw += dx;
    this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch + dy));
  }

  flags(): number {
    let f = 0;
    const b = this.body, m = this.medium;
    if (b.onGround) f |= MF.GROUND;
    if (this.crouching) f |= MF.CROUCH;
    if (this.sprinting) f |= MF.SPRINT;
    if (this.flying) f |= MF.FLY;
    if (m.water) f |= MF.WATER;
    if (m.eyeWater) f |= MF.EYE_WATER;
    if (m.lava) f |= MF.LAVA;
    if (m.ladder) f |= MF.LADDER;
    if (m.cactus) f |= MF.CACTUS;
    if (this.jumpedFlag) f |= MF.JUMP;
    return f;
  }

  update(dt: number, input: InputState, world: BlockReader & { isLoaded(x: number, z: number): boolean }, mode: GameMode, dead: boolean): void {
    this.landed = false;
    this.enteredWater = false;
    if (dead) { this.body.vx = this.body.vz = 0; return; }
    if (!world.isLoaded(Math.floor(this.body.x), Math.floor(this.body.z))) { this.frozen = true; return; }
    this.frozen = false;
    if (input.flyToggle && mode === 'creative') { this.flying = !this.flying; this.body.vy = 0; }
    if (mode !== 'creative') this.flying = false;
    let remaining = Math.min(dt, 0.1);
    while (remaining > 1e-6) {
      const h = Math.min(STEP, remaining);
      this.step(h, input, world, mode);
      remaining -= h;
    }
    this.jumpedFlag = false;
  }

  private canStand(world: BlockReader): boolean {
    const b = this.body;
    return !boxCollides(world, b.x - HW, b.y, b.z - HW, b.x + HW, b.y + 1.8, b.z + HW);
  }

  private step(dt: number, input: InputState, world: BlockReader, mode: GameMode): void {
    const b = this.body;
    const wasWater = this.medium.water;
    const m = sampleMedium(world, b.x, b.y, b.z, HW, b.h, this.eyeHeight);
    this.medium = m;
    if (m.water && !wasWater && b.vy < -4) this.enteredWater = true;
    const wantCrouch = input.crouch && !this.flying;
    if (wantCrouch !== this.crouching) {
      if (wantCrouch) this.crouching = true;
      else if (this.canStand(world)) this.crouching = false;
    }
    b.h = this.crouching ? 1.5 : 1.8;
    const targetEye = this.crouching ? 1.27 : 1.62;
    this.eyeHeight += (targetEye - this.eyeHeight) * Math.min(1, dt * 18);

    const mx = input.moveX, mz = input.moveZ;
    const len = Math.hypot(mx, mz);
    const nx = len > 1 ? mx / len : mx, nz = len > 1 ? mz / len : mz;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const fx = -sin * nz + cos * nx;
    const fz = -cos * nz - sin * nx;
    this.sprinting = input.sprint && nz > 0.3 && !this.crouching;
    let speed = 4.317;
    if (this.flying) speed = this.sprinting ? 21.6 : 10.9;
    else if (m.water || m.lava) speed = m.lava ? 1.4 : this.sprinting ? 3.4 : 2.3;
    else if (this.crouching) speed = 1.3;
    else if (this.sprinting) speed = 5.61;
    const tx = fx * speed, tz = fz * speed;
    const accel = this.flying ? 9 : b.onGround ? 14 : m.water ? 5 : 2.4;
    const k = Math.min(1, accel * dt);
    b.vx += (tx - b.vx) * k;
    b.vz += (tz - b.vz) * k;
    if (this.jumpCooldown > 0) this.jumpCooldown -= dt;

    if (this.flying) {
      const vt = (input.jump ? 9 : 0) - (input.crouch ? 9 : 0);
      b.vy += (vt - b.vy) * Math.min(1, dt * 10);
    } else if (m.water || m.lava) {
      b.vy -= (m.lava ? 4 : 7) * dt;
      b.vy *= Math.pow(m.lava ? 0.3 : 0.45, dt);
      if (input.jump) b.vy = Math.min(b.vy + 26 * dt, m.lava ? 1.5 : 3.2);
      if (b.hitH && input.jump) b.vy = 4.5;
      b.vy = Math.max(b.vy, -5);
      if (input.jump && Math.random() < dt * 2) this.swimSound?.();
    } else if (m.ladder) {
      b.vy = Math.max(b.vy - 32 * dt, -2.3);
      if (b.hitH || input.jump) b.vy = 2.6;
      if (this.crouching) b.vy = Math.max(b.vy, 0);
    } else {
      b.vy = Math.max(b.vy - 32 * dt, -78);
      const wantJump = input.jump || this.shouldAutoJump(world, fx, fz, len);
      if (wantJump && b.onGround && this.jumpCooldown <= 0) {
        b.vy = 9.1;
        this.jumpCooldown = 0.25;
        this.jumpedFlag = true;
        if (this.sprinting) { b.vx += -sin * 1.6; b.vz += -cos * 1.6; }
      }
    }

    let dx = b.vx * dt, dz = b.vz * dt;
    const dy = b.vy * dt;
    if (this.crouching && b.onGround && !this.flying) {
      const supported = (x: number, z: number) => boxCollides(world, x - HW + 0.02, b.y - 0.6, z - HW + 0.02, x + HW - 0.02, b.y - 0.01, z + HW - 0.02);
      if (!supported(b.x + dx, b.z)) { dx = 0; b.vx = 0; }
      if (!supported(b.x + dx, b.z + dz)) { dz = 0; b.vz = 0; }
    }
    const wasGround = b.onGround;
    const vyBefore = b.vy;
    moveBody(b, dx, dy, dz, world);
    if (b.onGround && !wasGround && vyBefore < -8) this.landed = true;
    if (this.flying && b.onGround && input.crouch) this.flying = false;
    if (b.onGround || m.water) {
      const moved = Math.hypot(dx, dz);
      this.walkDist += moved;
      this.bobPhase += moved * 2.2;
      this.stepAcc += moved;
      if (b.onGround && this.stepAcc > (this.sprinting ? 2.1 : 1.7)) {
        this.stepAcc = 0;
        if (!this.crouching) {
          const under = world.getBlock(Math.floor(b.x), Math.floor(b.y - 0.2), Math.floor(b.z));
          const d = getBlock(under);
          if (blockId(under) !== 0) this.stepSound?.(d.sound);
        }
      }
    }
    this.fovBoost += ((this.sprinting && len > 0.1 ? 1 : 0) - this.fovBoost) * Math.min(1, dt * 8);
  }

  private shouldAutoJump(world: BlockReader, fx: number, fz: number, len: number): boolean {
    if (!this.autoJump || len < 0.3 || !this.body.onGround || this.crouching) return false;
    const b = this.body;
    const ahead = 0.45;
    const ax = b.x + fx / (Math.hypot(fx, fz) || 1) * ahead, az = b.z + fz / (Math.hypot(fx, fz) || 1) * ahead;
    const by = Math.floor(b.y + 0.01);
    const front = world.getBlock(Math.floor(ax), by, Math.floor(az));
    if (!getBlock(front).solid || blockId(front) === B.OAK_DOOR) return false;
    const up1 = world.getBlock(Math.floor(ax), by + 1, Math.floor(az));
    const up2 = world.getBlock(Math.floor(ax), by + 2, Math.floor(az));
    const head = world.getBlock(Math.floor(b.x), by + 2, Math.floor(b.z));
    return !getBlock(up1).solid && !getBlock(up2).solid && !getBlock(head).solid;
  }

  knockback(fromX: number, fromZ: number, strength = 7): void {
    const dx = this.body.x - fromX, dz = this.body.z - fromZ;
    const d = Math.hypot(dx, dz) || 1;
    this.body.vx += (dx / d) * strength;
    this.body.vz += (dz / d) * strength;
    this.body.vy = Math.max(this.body.vy, 5);
  }
}

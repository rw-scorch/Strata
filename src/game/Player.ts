import { NETHER_EDGE } from '../core/dimension';
import { Body, moveStep, sampleMedium, boxCollides, BlockReader, Medium, bubbleColumn, bubbleSurface, slipperiness } from '../core/physics';
import { getBlock, blockId, B, isSoulSand, X, XV } from '../core/blocks';
import { MF } from '../core/sim/WorldSim';
import type { InputState } from '../controls/InputState';
import type { GameMode } from '../core/constants';

const HW = 0.3;
const TICK = 0.05;
const STEP_HEIGHT = 0.6;
const GRAVITY = 0.08;


export class LocalPlayer {
  body: Body = { x: 0, y: 80, z: 0, vx: 0, vy: 0, vz: 0, hw: HW, h: 1.8, onGround: false, hitH: false, hitCeil: false };
  private prev = { x: 0, y: 80, z: 0 };
  private acc = 0;
  private alpha = 1;
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
  private noJumpDelay = 0;
  fovBoost = 0;
  food = 20;
  stepSound: ((material: string) => void) | null = null;
  swimSound: (() => void) | null = null;
  usingItem = false;
  blocking = false;
  inBubbles = 0;
  levitateT = 0;
  elytra = false;
  soulSpeed = 0;
  gliding = false;
  rocketT = 0;
  roll = 0;
  rollStyle = true;
  speedFov = 0;
  private keyBank = 0;
  private mouseBank = 0;
  private lookRate = 0;
  private twirlDir = 0;
  private twirlT = 0;
  private tapDir = 0;
  private tapAt = -99;
  private strafeWas = 0;
  private clock = 0;
  private glideTicks = 0;
  private jumpWas = false;
  depthStrider = 0;
  flow: ((x: number, y: number, z: number) => [number, number] | null) | null = null;

  get x(): number { return this.prev.x + (this.body.x - this.prev.x) * this.alpha; }
  get y(): number { return this.prev.y + (this.body.y - this.prev.y) * this.alpha; }
  get z(): number { return this.prev.z + (this.body.z - this.prev.z) * this.alpha; }
  get eyeY(): number { return this.y + this.eyeHeight; }
  get speedBps(): number { return Math.hypot(this.body.vx, this.body.vz) * 20; }

  setPos(x: number, y: number, z: number): void {
    this.body.x = x; this.body.y = y; this.body.z = z;
    this.body.vx = this.body.vy = this.body.vz = 0;
    this.prev = { x, y, z };
  }

  look(dx: number, dy: number): void {
    if (this.gliding) this.lookRate += dx;
    this.yaw += dx;
    this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch + dy));
  }

  private flightFrame(dt: number, strafeIn: number): void {
    this.clock += dt;
    const k = 1 - Math.exp(-dt * 7);
    const rate = dt > 0 ? this.lookRate / dt : 0;
    this.lookRate = 0;
    if (!this.gliding || !this.rollStyle) {
      this.keyBank += (0 - this.keyBank) * k; this.mouseBank += (0 - this.mouseBank) * k;
      this.twirlDir = 0; this.twirlT = 0; this.strafeWas = 0;
    } else {
      const strafe = Math.max(-1, Math.min(1, strafeIn));
      const dir = strafe > 0.5 ? 1 : strafe < -0.5 ? -1 : 0;
      if (dir && dir !== this.strafeWas) {
        if (dir === this.tapDir && this.clock - this.tapAt < 0.3 && !this.twirlDir) { this.twirlDir = dir; this.twirlT = 0; }
        this.tapDir = dir; this.tapAt = this.clock;
      }
      this.strafeWas = dir;
      this.keyBank += (strafe * 0.7 - this.keyBank) * k;
      this.mouseBank += (Math.max(-0.45, Math.min(0.45, -rate * 0.09)) - this.mouseBank) * (1 - Math.exp(-dt * 4));
      const sp = Math.min(1, Math.hypot(this.body.vx, this.body.vz) / 0.6);
      if (!this.twirlDir) this.yaw -= Math.sin(this.keyBank) * 1.1 * sp * dt;
      if (this.twirlDir) { this.twirlT += dt; if (this.twirlT >= 0.65) { this.twirlDir = 0; this.twirlT = 0; } }
    }
    let twirl = 0;
    if (this.twirlDir) { const p = Math.min(1, this.twirlT / 0.65); twirl = this.twirlDir * Math.PI * 2 * (p < 0.5 ? 2 * p * p : 1 - (2 - 2 * p) ** 2 / 2); }
    this.roll = this.keyBank + this.mouseBank + twirl;
    if (Math.abs(this.roll) < 1e-4) this.roll = 0;
  }

  flags(): number {
    let f = 0;
    const b = this.body, m = this.medium;
    if (b.onGround) f |= MF.GROUND;
    if (this.crouching) f |= MF.CROUCH;
    if (this.blocking) f |= MF.BLOCK;
    if (this.swimming) f |= MF.PRONE;
    if (this.sprinting) f |= MF.SPRINT;
    if (this.flying) f |= MF.FLY;
    if (this.gliding) f |= MF.GLIDE;
    if (this.levitateT > 0) f |= MF.LEVITATE;
    if (m.water) f |= MF.WATER;
    if (m.eyeWater) f |= MF.EYE_WATER;
    if (m.lava) f |= MF.LAVA;
    if (m.ladder) f |= MF.LADDER;
    if (m.cactus) f |= MF.CACTUS;
    if (this.jumpedFlag) f |= MF.JUMP;
    return f;
  }

  swimming = false;
  others: () => { x: number; y: number; z: number; hw: number; h: number }[] = () => [];

  update(dt: number, input: InputState, world: BlockReader & { isLoaded(x: number, z: number): boolean }, mode: GameMode, dead: boolean): void {
    this.landed = false;
    this.enteredWater = false;
    if (dead) { this.body.vx = this.body.vz = 0; this.alpha = 1; return; }
    if (!world.isLoaded(Math.floor(this.body.x), Math.floor(this.body.z))) { this.frozen = true; this.alpha = 1; return; }
    this.frozen = false;
    if (input.flyToggle && mode === 'creative') { this.flying = !this.flying; this.body.vy = 0; }
    if (mode !== 'creative') this.flying = false;
    this.acc += Math.min(dt, 0.25);
    let n = 0;
    while (this.acc >= TICK && n < 5) {
      this.acc -= TICK;
      this.prev = { x: this.body.x, y: this.body.y, z: this.body.z };
      this.tick(input, world, mode);
      n++;
    }
    if (n === 5) this.acc = 0;
    this.alpha = Math.min(1, this.acc / TICK);
    const targetEye = this.swimming ? 0.4 : this.crouching ? 1.27 : 1.62;
    this.eyeHeight += (targetEye - this.eyeHeight) * Math.min(1, dt * 18);
    this.fovBoost += ((this.sprinting && this.speedBps > 2 ? 1 : 0) - this.fovBoost) * Math.min(1, dt * 8);
    const v3 = Math.hypot(this.body.vx, this.body.vy, this.body.vz) * 20;
    this.speedFov += (Math.max(0, Math.min(1, (v3 - 9) / 35)) - this.speedFov) * Math.min(1, dt * 3);
    this.flightFrame(dt, input.moveX);
  }

  private canStand(world: BlockReader): boolean {
    const b = this.body;
    return !boxCollides(world, b.x - HW, b.y, b.z - HW, b.x + HW, b.y + 1.8, b.z + HW);
  }

  private tick(input: InputState, world: BlockReader, mode: GameMode): void {
    const b = this.body;
    const wasWater = this.medium.water;
    const m = sampleMedium(world, b.x, b.y, b.z, HW, b.h, this.eyeHeight);
    this.medium = m;
    if (m.water && !wasWater && b.vy < -0.2) this.enteredWater = true;
    const wantCrouch = input.crouch && !this.flying;
    if (wantCrouch !== this.crouching) {
      if (wantCrouch) this.crouching = true;
      else if (this.canStand(world)) this.crouching = false;
    }
    const wantSwim = this.sprinting && m.water && !this.flying && (m.eyeWater || this.swimming);
    if (wantSwim) this.swimming = true;
    else if (this.swimming) { b.h = 1.8; if (this.canStand(world)) this.swimming = false; }
    else if (!this.flying && b.onGround && boxCollides(world, b.x - HW, b.y, b.z - HW, b.x + HW, b.y + 1.5, b.z + HW) && !boxCollides(world, b.x - HW, b.y, b.z - HW, b.x + HW, b.y + 0.6, b.z + HW)) this.swimming = true;
    b.h = this.swimming ? 0.6 : this.crouching ? 1.5 : 1.8;

    let strafe = Math.max(-1, Math.min(1, input.moveX));
    let forward = Math.max(-1, Math.min(1, input.moveZ));
    const canSprint = forward >= 0.8 && !this.crouching && !this.usingItem && (mode === 'creative' || this.food > 6);
    if (input.sprint && canSprint) this.sprinting = true;
    if (!canSprint || (b.hitH && b.onGround)) this.sprinting = false;
    if ((this.crouching || (this.swimming && !m.water)) && !this.flying) { strafe *= 0.3; forward *= 0.3; }
    if (this.usingItem && !this.flying) { strafe *= 0.2; forward *= 0.2; }
    strafe *= 0.98; forward *= 0.98;

    if (!this.flying) for (const o of this.others()) {
      if (Math.abs(o.y - b.y) > Math.max(b.h, o.h)) continue;
      if (o.y + o.h <= b.y || o.y >= b.y + b.h) continue;
      let dx = o.x - b.x, dz = o.z - b.z;
      if (Math.abs(dx) >= HW + o.hw || Math.abs(dz) >= HW + o.hw) continue;
      let d = Math.max(Math.abs(dx), Math.abs(dz));
      if (d < 0.01) continue;
      d = Math.sqrt(d);
      dx /= d; dz /= d;
      const f = Math.min(1, 1 / d) * 0.05;
      b.vx -= dx * f; b.vz -= dz * f;
    }

    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const moveRelative = (speed: number) => {
      let s = strafe, f = forward;
      const l2 = s * s + f * f;
      if (l2 < 1e-7) return;
      if (l2 > 1) { const l = Math.sqrt(l2); s /= l; f /= l; }
      s *= speed; f *= speed;
      b.vx += -sin * f + cos * s;
      b.vz += -cos * f - sin * s;
    };

    if (this.noJumpDelay > 0) this.noJumpDelay--;
    const inFluid = m.water || m.lava;
    const jumpEdge = input.jump && !this.jumpWas;
    this.jumpWas = input.jump;
    if (this.levitateT > 0) this.levitateT--;
    if (this.gliding && (b.onGround || inFluid || !this.elytra || this.flying || this.levitateT > 0)) this.gliding = false;
    else if (!this.gliding && jumpEdge && this.elytra && !b.onGround && !inFluid && !this.flying && !m.ladder && this.levitateT <= 0) this.gliding = true;
    if (!this.gliding) { this.rocketT = 0; this.glideTicks = 0; }
    if (this.gliding) {
      this.glideTicks++;
      const ys = Math.sin(this.yaw), yc = Math.cos(this.yaw), cp = Math.cos(this.pitch);
      const lx = -ys * cp, ly = Math.sin(this.pitch), lz = -yc * cp;
      const jp = -this.pitch;
      if (this.rocketT > 0) { this.rocketT--; b.vx += lx * 0.1 + (lx * 1.5 - b.vx) * 0.5; b.vy += ly * 0.1 + (ly * 1.5 - b.vy) * 0.5; b.vz += lz * 0.1 + (lz * 1.5 - b.vz) * 0.5; }
      const hLook = Math.hypot(lx, lz), hVel = Math.hypot(b.vx, b.vz);
      const c2 = Math.cos(jp) ** 2;
      b.vy += GRAVITY * (-1 + c2 * 0.75);
      if (b.vy < 0 && hLook > 0) { const d = b.vy * -0.1 * c2; b.vx += (lx * d) / hLook; b.vy += d; b.vz += (lz * d) / hLook; }
      if (jp < 0 && hLook > 0) { const d = hVel * -Math.sin(jp) * 0.04; b.vx -= (lx * d) / hLook; b.vy += d * 3.2; b.vz -= (lz * d) / hLook; }
      if (hLook > 0) { b.vx += ((lx / hLook) * hVel - b.vx) * 0.1; b.vz += ((lz / hLook) * hVel - b.vz) * 0.1; }
      b.vx *= 0.99; b.vy *= 0.98; b.vz *= 0.99;
      this.move(world, b.vx, b.vy, b.vz);
      if (b.hitH || b.onGround) this.gliding = b.onGround ? false : this.gliding;
    } else if (this.flying) {
      if (input.crouch) b.vy -= 0.15;
      if (input.jump) b.vy += 0.15;
    } else if (input.jump || this.shouldAutoJump(world, strafe, forward)) {
      if (inFluid) b.vy += 0.04;
      else if (b.onGround && this.noJumpDelay === 0) {
        const jb = blockId(world.getBlock(Math.floor(b.x), Math.floor(b.y - 0.5000001), Math.floor(b.z)));
        b.vy = jb === B.HONEY_BLOCK ? 0.21 : 0.42;
        if (this.sprinting) { b.vx += -sin * 0.2; b.vz += -cos * 0.2; }
        this.noJumpDelay = 10;
        this.jumpedFlag = true;
      }
    } else this.noJumpDelay = 0;

    const vyBefore = b.vy;
    const wasGround = b.onGround;
    if (this.gliding) {
      if (b.onGround) this.gliding = false;
    } else if (this.flying) {
      moveRelative(this.sprinting ? 0.1 : 0.05);
      this.move(world, b.vx, b.vy, b.vz);
      b.vx *= 0.91; b.vz *= 0.91; b.vy *= 0.6;
      if (b.onGround && input.crouch) this.flying = false;
    } else if (m.water && !m.lava) {
      const swimming = this.sprinting && m.eyeWater;
      let f = this.sprinting ? 0.9 : 0.8;
      let acc = swimming ? 0.04 : 0.02;
      let ds = Math.min(3, this.depthStrider) / 3;
      if (!b.onGround) ds *= 0.5;
      if (ds > 0) { f += (0.546 - f) * ds; acc += (0.1 * (this.sprinting ? 1.3 : 1) - acc) * ds; }
      const cur = this.flow?.(b.x, b.y, b.z);
      if (cur) { b.vx += cur[0] * 0.014; b.vz += cur[1] * 0.014; }
      if (swimming) {
        const ly = Math.sin(this.pitch);
        const k = ly < -0.2 ? 0.085 : 0.06;
        if (ly <= 0 || input.jump) b.vy += (ly - b.vy) * k;
      }
      moveRelative(acc);
      const oy = b.y;
      this.move(world, b.vx, b.vy, b.vz);
      if (b.hitH && m.ladder) b.vy = 0.2;
      b.vx *= f; b.vy *= 0.8; b.vz *= f;
      const bc = bubbleColumn(world, b.x, b.y + 0.2, b.z);
      if (bc) {
        const top = bubbleSurface(world, b.x, b.y + 0.2, b.z);
        b.vy = bc > 0 ? Math.min(top ? 1.8 : 0.7, b.vy + (top ? 0.1 : 0.06)) : Math.max(top ? -0.9 : -0.3, b.vy - 0.03);
        this.inBubbles = bc;
      } else this.inBubbles = 0;
      if (!this.sprinting) b.vy -= GRAVITY / 16;
      if (b.hitH && !boxCollides(world, b.x - HW + b.vx, b.y + 0.6 - (b.y - oy) + b.vy, b.z - HW + b.vz, b.x + HW + b.vx, b.y + b.h + 0.6 - (b.y - oy) + b.vy, b.z + HW + b.vz)) b.vy = 0.3;
      if (input.jump && Math.random() < 0.1) this.swimSound?.();
    } else if (m.lava) {
      const cur = this.flow?.(b.x, b.y, b.z);
      if (cur) { const k = b.x >= NETHER_EDGE ? 0.007 : 0.0023333; b.vx += cur[0] * k * 6; b.vz += cur[1] * k * 6; }
      moveRelative(0.02);
      this.move(world, b.vx, b.vy, b.vz);
      b.vx *= 0.5; b.vy *= 0.5; b.vz *= 0.5;
      b.vy -= GRAVITY / 4;
    } else {
      const under = world.getBlock(Math.floor(b.x), Math.floor(b.y - 0.5000001), Math.floor(b.z));
      const slip = b.onGround ? slipperiness(under) : 1;
      const f = slip * 0.91;
      const soulBlock = b.onGround && (isSoulSand(under) || under === X(XV.SOUL_SOIL));
      const base = 0.1 + (soulBlock && this.soulSpeed > 0 ? 0.03 * (1 + this.soulSpeed * 0.35) : 0);
      const speed = b.onGround ? base * (this.sprinting ? 1.3 : 1) * (0.21600002 / (slip * slip * slip)) : this.sprinting ? 0.025999999 : 0.02;
      moveRelative(speed);
      if (m.ladder) {
        b.vx = Math.max(-0.15, Math.min(0.15, b.vx));
        b.vz = Math.max(-0.15, Math.min(0.15, b.vz));
        b.vy = Math.max(b.vy, -0.15);
        if (this.crouching && b.vy < 0) b.vy = 0;
      }
      const vyPre = b.vy;
      this.move(world, b.vx, b.vy, b.vz);
      if (b.onGround) {
        const ub = blockId(world.getBlock(Math.floor(b.x), Math.floor(b.y - 0.2), Math.floor(b.z)));
        if (ub === B.SLIME_BLOCK && !this.crouching && vyPre < -0.1) { b.vy = -vyPre; b.onGround = false; }
        else if (ub === B.SLIME_BLOCK && Math.abs(vyPre) < 0.1 && !this.crouching) { const k = 0.4 + Math.abs(vyPre) * 0.2; b.vx *= k; b.vz *= k; }
        if (ub === B.HONEY_BLOCK) { b.vx *= 0.4; b.vz *= 0.4; }
        if (this.soulSpeed === 0 && isSoulSand(world.getBlock(Math.floor(b.x), Math.floor(b.y - 0.2), Math.floor(b.z)))) { b.vx *= 0.4; b.vz *= 0.4; }
      }
      if ((b.hitH || input.jump) && m.ladder) b.vy = 0.2;
      b.vy = this.levitateT > 0 ? b.vy + (0.05 - b.vy) * 0.2 : (b.vy - GRAVITY) * 0.98;
      b.vx *= f; b.vz *= f;
    }
    if (b.onGround && !wasGround && vyBefore < -0.4) this.landed = true;

    if (b.onGround || m.water) {
      const moved = Math.hypot(b.x - this.prev.x, b.z - this.prev.z);
      this.walkDist += moved;
      this.bobPhase += moved * 2.2;
      this.stepAcc += moved;
      if (b.onGround && this.stepAcc > (this.sprinting ? 2.1 : 1.7)) {
        this.stepAcc = 0;
        if (!this.crouching) {
          const under = world.getBlock(Math.floor(b.x), Math.floor(b.y - 0.2), Math.floor(b.z));
          if (blockId(under) !== 0) this.stepSound?.(getBlock(under).sound);
        }
      }
    }
  }

  private move(world: BlockReader, dx: number, dy: number, dz: number): void {
    const b = this.body;
    if (this.crouching && b.onGround && !this.flying) {
      const off = (x: number, z: number) => !boxCollides(world, b.x - HW + x + 0.001, b.y - STEP_HEIGHT, b.z - HW + z + 0.001, b.x + HW + x - 0.001, b.y - 0.001, b.z + HW + z - 0.001);
      while (dx !== 0 && off(dx, 0)) dx = Math.abs(dx) < 0.05 ? 0 : dx - Math.sign(dx) * 0.05;
      while (dz !== 0 && off(0, dz)) dz = Math.abs(dz) < 0.05 ? 0 : dz - Math.sign(dz) * 0.05;
      while (dx !== 0 && dz !== 0 && off(dx, dz)) {
        dx = Math.abs(dx) < 0.05 ? 0 : dx - Math.sign(dx) * 0.05;
        dz = Math.abs(dz) < 0.05 ? 0 : dz - Math.sign(dz) * 0.05;
      }
      if (dx !== b.vx) b.vx = dx;
      if (dz !== b.vz) b.vz = dz;
    }
    if (this.medium.web && !this.flying) { dx *= 0.25; dy *= 0.05; dz *= 0.25; b.vx = 0; b.vy = 0; b.vz = 0; }
    moveStep(b, dx, dy, dz, world, this.flying || this.medium.water ? STEP_HEIGHT : b.onGround ? STEP_HEIGHT : 0);
  }

  private shouldAutoJump(world: BlockReader, strafe: number, forward: number): boolean {
    if (!this.autoJump || Math.hypot(strafe, forward) < 0.3 || !this.body.onGround || this.crouching) return false;
    const b = this.body;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const fx = -sin * forward + cos * strafe, fz = -cos * forward - sin * strafe;
    const l = Math.hypot(fx, fz) || 1;
    const dx = (fx / l) * 0.32, dz = (fz / l) * 0.32, hw = b.hw - 0.02;
    const hit = (ox: number, oy: number, oz: number, h = b.h) => boxCollides(world, b.x + ox - hw, b.y + oy, b.z + oz - hw, b.x + ox + hw, b.y + oy + h, b.z + oz + hw);
    if (!hit(dx, 0.02, dz)) return false;
    if (!hit(dx, STEP_HEIGHT + 0.02, dz)) return false;
    if (hit(dx, 1.22, dz)) return false;
    if (hit(0, 1.22, 0)) return false;
    return true;
  }

  knockback(fromX: number, fromZ: number, strength = 0.4): void {
    const b = this.body;
    let dx = fromX - b.x, dz = fromZ - b.z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-4) { dx = Math.random() - 0.5; dz = Math.random() - 0.5; }
    const l = Math.hypot(dx, dz) || 1;
    b.vx = b.vx / 2 - (dx / l) * strength;
    b.vz = b.vz / 2 - (dz / l) * strength;
    if (b.onGround) b.vy = Math.min(0.4, b.vy / 2 + strength);
    this.sprinting = false;
  }
}

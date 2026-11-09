import { CHUNK_SIZE, WORLD_HEIGHT, TICKS_PER_DAY, REACH_CREATIVE, REACH_SURVIVAL, GameMode, Difficulty } from '../constants';
import {
  B, BLOCKS, getBlock, blockId, blockMeta, makeBlock, isSolid, isReplaceable, blockBox, facingFromYaw,
  FACING_DIRS, DOOR_OPEN, DOOR_UPPER, doorMeta, doorFacing, LIGHT_EMIT,
} from '../blocks';
import { getItem, I, fuelSeconds } from '../items';
import {
  PlayerInv, ItemStack, InvOp, applyInvOp, emptyInv, giveItem, heldStack, damageHeld, consumeHeld,
  armorPoints, damageArmor, allStacks, CHEST_SIZE, FURNACE_SIZE, invHash, sameKind, cloneStack,
} from '../inventory';
import { findSmelt, Recipe } from '../crafting';
import { BlockReader, Body, moveBody, raycast, boxCollides, sampleMedium } from '../physics';
import { Rng } from '../rng';
import { WorldGenerator } from '../worldgen/WorldGenerator';
import { MOBS, MobType, MobDef, PASSIVE_TYPES, HOSTILE_TYPES } from './mobs';
import { findPath, standable, PathNode } from './pathfind';
import { tickFluid, fluidDelay, FluidWorld } from './fluids';

export interface WorldStore extends BlockReader {
  setBlock(x: number, y: number, z: number, v: number): void;
  isLoaded(x: number, z: number): boolean;
}

export interface Appearance { skin: number; hair: number; shirt: number; pants: number; }

export const MF = {
  GROUND: 1, CROUCH: 2, SPRINT: 4, FLY: 8, WATER: 16, EYE_WATER: 32, LAVA: 64, LADDER: 128, CACTUS: 256,
  JUMP: 512, SWING: 1024, EAT: 2048,
} as const;

export interface SimPlayer {
  id: string;
  name: string;
  appearance: Appearance;
  x: number; y: number; z: number; yaw: number; pitch: number; flags: number;
  mode: GameMode;
  inv: PlayerInv;
  health: number; food: number; sat: number; exh: number; air: number; xp: number;
  dead: boolean;
  spawn: { x: number; y: number; z: number };
  screen: { type: ScreenType | null; x: number; y: number; z: number };
  dig: { x: number; y: number; z: number; t: number } | null;
  hurtCd: number; fireT: number; peakY: number;
  t: { lava: number; drown: number; cactus: number; void: number; starve: number; regen: number; fire: number };
  lastAttack: number; lastEat: number; lastMove: number;
  op: boolean;
  sel: [number[] | null, number[] | null];
}

export type EntityKind = 'mob' | 'item' | 'arrow';
export type ScreenType = 'chest' | 'furnace' | 'workbench' | 'shop';

export interface GameHooks {
  tick(): void;
  onJoin(p: SimPlayer): void;
  onLeave(p: SimPlayer): void;
  onKill(p: SimPlayer, cause: string, killer?: string): boolean;
  allowRespawn(p: SimPlayer): boolean;
  onRespawn(p: SimPlayer): void;
  canBreak(p: SimPlayer, x: number, y: number, z: number, v: number): boolean;
  canPlace(p: SimPlayer, x: number, y: number, z: number): boolean;
  onBroken(by: string | null, x: number, y: number, z: number, v: number): void;
  onAttackMob(p: SimPlayer, e: Entity): boolean;
  canHurtPlayer(a: SimPlayer, t: SimPlayer): boolean;
  protectedPlayer(p: SimPlayer): boolean;
  damageBonus(p: SimPlayer): number;
  damageScale(p: SimPlayer): number;
  tickNpc(e: Entity): boolean;
  mobInvulnerable(e: Entity): boolean;
  onMobDeath(e: Entity, by: string | null): void;
  command(p: SimPlayer, parts: string[]): string | null;
  buy(p: SimPlayer, key: string): string | null;
  state(): unknown;
}

export interface Entity extends Body {
  id: number;
  kind: EntityKind;
  type: MobType | 'item' | 'arrow';
  yaw: number;
  health: number;
  maxHealth: number;
  hurt: number;
  age: number;
  fire: number;
  flags: number;
  item?: ItemStack;
  pickupDelay?: number;
  shooter?: number;
  dmg?: number;
  stuck?: number;
  target?: string | null;
  path?: PathNode[] | null;
  pathT?: number;
  wanderT?: number;
  panic?: number;
  attackCd?: number;
  provoked?: number;
  attacker?: string;
  persistent?: boolean;
  inWater?: boolean;
}

export type BlockEntity =
  | { type: 'chest'; items: (ItemStack | null)[] }
  | { type: 'furnace'; items: (ItemStack | null)[]; burn: number; burnMax: number; cook: number; xp: number };

export type Weather = 'clear' | 'rain' | 'thunder';

export type SimEvent =
  | { e: 'block'; x: number; y: number; z: number; v: number; old: number; src?: string }
  | { e: 'sound'; s: string; x: number; y: number; z: number; vol?: number; pitch?: number; src?: string; to?: string }
  | { e: 'particles'; k: 'break' | 'hurt' | 'smoke' | 'splash' | 'xp' | 'crit'; x: number; y: number; z: number; d?: number; src?: string }
  | { e: 'spawn'; ent: Entity }
  | { e: 'remove'; id: number; why: 'death' | 'pickup' | 'despawn' | 'hit'; by?: string }
  | { e: 'vitals'; p: SimPlayer }
  | { e: 'inv'; p: SimPlayer }
  | { e: 'container'; key: string }
  | { e: 'screen'; p: SimPlayer }
  | { e: 'hurt'; p: SimPlayer; amount: number; cause: string; fx: number; fz: number }
  | { e: 'death'; p: SimPlayer; msg: string }
  | { e: 'respawn'; p: SimPlayer }
  | { e: 'tp'; p: SimPlayer }
  | { e: 'msg'; text: string; kind: 'system' | 'death' | 'info' | 'error'; to?: string }
  | { e: 'lightning'; x: number; y: number; z: number }
  | { e: 'reject'; p: SimPlayer; x: number; y: number; z: number }
  | { e: 'weather'; w: Weather }
  | { e: 'time' }
  | { e: 'mode'; p: SimPlayer }
  | { e: 'crafted'; p: SimPlayer; recipe: Recipe; times: number }
  | { e: 'game'; state: unknown }
  | { e: 'title'; text: string; sub: string; to?: string };

export interface SimOptions {
  seed: number;
  store: WorldStore;
  gen: WorldGenerator;
  difficulty: Difficulty;
  emit: (ev: SimEvent) => void;
  validateMoves: boolean;
  authoritative: boolean;
  spawn?: { x: number; y: number; z: number };
}

export interface SimSettings { pvp: boolean; cheats: boolean; guestsBuild: boolean; dayCycle: boolean; weatherCycle: boolean; }

const DT = 1 / 20;
const DIFF_DMG: Record<Difficulty, number> = { peaceful: 0, easy: 0.5, normal: 1, hard: 1.5 };
const HOSTILE_CAP: Record<Difficulty, number> = { peaceful: 0, easy: 5, normal: 9, hard: 13 };
const PLAYER_HW = 0.3, PLAYER_H = 1.8;

export function posKey(x: number, y: number, z: number): string { return `${x},${y},${z}`; }
export function parsePosKey(k: string): [number, number, number] { const p = k.split(','); return [+p[0], +p[1], +p[2]]; }

export function xpLevel(total: number): { level: number; progress: number; need: number } {
  let level = 0, rem = total;
  for (;;) {
    const need = level < 16 ? 2 * level + 7 : level < 31 ? 5 * level - 38 : 9 * level - 158;
    if (rem < need) return { level, progress: rem / need, need };
    rem -= need;
    level++;
  }
}

export function toolFor(stack: ItemStack | null) {
  return stack ? getItem(stack.id)?.tool ?? null : null;
}

export function canHarvest(blockV: number, stack: ItemStack | null): boolean {
  const d = getBlock(blockV);
  if (d.tier <= 0) return true;
  const t = toolFor(stack);
  return !!t && t.type === d.tool && t.tier >= d.tier;
}

export function breakTime(blockV: number, stack: ItemStack | null, underwater: boolean): number {
  const d = getBlock(blockV);
  if (d.hardness < 0) return Infinity;
  if (d.hardness === 0) return 0.05;
  const t = toolFor(stack);
  let speed = 1;
  if (t && (t.type === d.tool || (t.type === 'sword' && (d.render === 'leaves' || d.id === B.CACTUS)))) speed = t.type === 'sword' ? 1.5 : t.speed;
  let time = d.hardness * (canHarvest(blockV, stack) ? 1.5 : 5) / speed;
  if (underwater) time *= 5;
  return Math.max(0.05, time);
}

export function defaultAppearance(): Appearance { return { skin: 0, hair: 0, shirt: 0, pants: 0 }; }

export function newPlayer(id: string, name: string, mode: GameMode, spawn: { x: number; y: number; z: number }): SimPlayer {
  return {
    id, name, appearance: defaultAppearance(),
    x: spawn.x, y: spawn.y, z: spawn.z, yaw: 0, pitch: 0, flags: 0,
    mode, inv: emptyInv(), health: 20, food: 20, sat: 5, exh: 0, air: 300, xp: 0,
    dead: false, spawn: { ...spawn }, screen: { type: null, x: 0, y: 0, z: 0 }, dig: null,
    hurtCd: 0, fireT: 0, peakY: spawn.y,
    t: { lava: 0, drown: 0, cactus: 0, void: 0, starve: 0, regen: 0, fire: 0 },
    lastAttack: 0, lastEat: 0, lastMove: 0, op: false, sel: [null, null],
  };
}

export class WorldSim {
  readonly seed: number;
  readonly store: WorldStore;
  readonly gen: WorldGenerator;
  difficulty: Difficulty;
  readonly emit: (ev: SimEvent) => void;
  readonly validateMoves: boolean;
  readonly authoritative: boolean;
  settings: SimSettings = { pvp: false, cheats: true, guestsBuild: true, dayCycle: true, weatherCycle: true };
  spawn: { x: number; y: number; z: number };
  game: GameHooks | null = null;

  players = new Map<string, SimPlayer>();
  entities = new Map<number, Entity>();
  blockEntities = new Map<string, BlockEntity>();
  activeFurnaces = new Set<string>();
  time = 1000;
  tickCount = 0;
  weather: Weather = 'clear';
  weatherTimer = 12000;
  rng: Rng;
  private nextEntityId = 1;
  private fluidQueue = new Map<string, number>();
  private now = 0;

  constructor(o: SimOptions) {
    this.seed = o.seed;
    this.store = o.store;
    this.gen = o.gen;
    this.difficulty = o.difficulty;
    this.emit = o.emit;
    this.validateMoves = o.validateMoves;
    this.authoritative = o.authoritative;
    this.spawn = o.spawn ?? o.gen.findSpawn();
    this.rng = new Rng((o.seed ^ 0x5eed) >>> 0 || 1);
  }

  nowMs(): number { return this.now; }
  setNow(ms: number): void { this.now = ms; }

  get(x: number, y: number, z: number): number { return this.store.getBlock(x, y, z); }

  dayFactor(): number {
    const t = this.time % TICKS_PER_DAY;
    const d = Math.cos(((t - 6000) / TICKS_PER_DAY) * Math.PI * 2);
    let f = Math.max(0, Math.min(1, d * 1.6 + 0.5));
    if (this.weather !== 'clear') f *= this.weather === 'thunder' ? 0.55 : 0.75;
    return f;
  }

  isNight(): boolean { return this.dayFactor() < 0.3; }

  allocId(): number { return this.nextEntityId++; }

  setBlock(x: number, y: number, z: number, v: number, src?: string): void {
    if (y < 0 || y >= WORLD_HEIGHT) return;
    const old = this.get(x, y, z);
    if (old === v) return;
    this.store.setBlock(x, y, z, v);
    this.emit({ e: 'block', x, y, z, v, old, src });
    this.afterChange(x, y, z, old, v);
  }

  private afterChange(x: number, y: number, z: number, old: number, v: number): void {
    const oid = blockId(old), nid = blockId(v);
    if (oid === B.CHEST || oid === B.FURNACE || oid === B.FURNACE_LIT) {
      if (!(nid === B.FURNACE || nid === B.FURNACE_LIT) || oid === B.CHEST) this.removeBlockEntity(x, y, z, true);
    }
    this.scheduleFluidAround(x, y, z);
    this.checkSupport(x, y + 1, z);
    for (let f = 0; f < 4; f++) {
      const [dx, dz] = FACING_DIRS[f];
      this.checkSupport(x - dx, y, z - dz);
    }
    if (oid === B.OAK_LOG || oid === B.BIRCH_LOG || oid === B.SPRUCE_LOG || oid === B.JUNGLE_LOG) this.scheduleLeafDecay(x, y, z);
  }

  private leafDecayQueue: [number, number, number, number][] = [];
  private scheduleLeafDecay(x: number, y: number, z: number): void {
    for (let dy = -3; dy <= 4; dy++) for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) {
      const v = this.get(x + dx, y + dy, z + dz);
      if (getBlock(v).render === 'leaves' && blockMeta(v) === 0) {
        this.leafDecayQueue.push([x + dx, y + dy, z + dz, this.tickCount + 20 + this.rng.int(200)]);
      }
    }
  }

  private hasLogNear(x: number, y: number, z: number): boolean {
    for (let dy = -4; dy <= 4; dy++) for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) {
      if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) > 6) continue;
      const id = blockId(this.get(x + dx, y + dy, z + dz));
      if (id === B.OAK_LOG || id === B.BIRCH_LOG || id === B.SPRUCE_LOG || id === B.JUNGLE_LOG) return true;
    }
    return false;
  }

  private scheduleFluidAround(x: number, y: number, z: number): void {
    for (const [dx, dy, dz] of [[0, 0, 0], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
      const v = this.get(x + dx, y + dy, z + dz);
      const id = blockId(v);
      if (id === B.WATER || id === B.LAVA) this.scheduleFluid(x + dx, y + dy, z + dz, fluidDelay(id));
    }
  }

  scheduleFluid(x: number, y: number, z: number, delay: number): void {
    const k = posKey(x, y, z);
    const due = this.tickCount + delay;
    const cur = this.fluidQueue.get(k);
    if (cur === undefined || cur > due) this.fluidQueue.set(k, due);
  }

  supported(x: number, y: number, z: number, v: number): boolean {
    const d = getBlock(v);
    const id = d.id;
    if (id === B.OAK_DOOR) {
      const m = blockMeta(v);
      if (m & DOOR_UPPER) return blockId(this.get(x, y - 1, z)) === B.OAK_DOOR;
      return isSolid(this.get(x, y - 1, z)) && blockId(this.get(x, y + 1, z)) === B.OAK_DOOR;
    }
    if (id === B.TORCH) {
      const m = blockMeta(v);
      if (m === 0) return isSolid(this.get(x, y - 1, z));
      const [dx, dz] = FACING_DIRS[(m - 1) & 3];
      return isSolid(this.get(x + dx, y, z + dz));
    }
    if (id === B.LADDER) {
      const [dx, dz] = FACING_DIRS[blockMeta(v) & 3];
      return isSolid(this.get(x + dx, y, z + dz));
    }
    if (id === B.LILY_PAD) return blockId(this.get(x, y - 1, z)) === B.WATER;
    const below = blockId(this.get(x, y - 1, z));
    switch (d.needsSupport) {
      case 'soil': return below === B.GRASS || below === B.DIRT || below === B.FARMLAND || below === B.SNOWY_GRASS || below === B.MUD || (id >= B.OAK_SAPLING && id <= B.JUNGLE_SAPLING ? false : below === B.SAND && id === B.DEAD_BUSH);
      case 'sand': return below === B.SAND || below === B.DIRT || below === B.GRASS;
      case 'farmland': return below === B.FARMLAND;
      case 'solid': return isSolid(this.get(x, y - 1, z));
      case 'cactus': {
        if (below !== B.SAND && below !== B.CACTUS) return false;
        for (const [dx, dz] of FACING_DIRS) if (isSolid(this.get(x + dx, y, z + dz))) return false;
        return true;
      }
      case 'water-edge': {
        if (below === B.SUGAR_CANE) return true;
        if (below !== B.GRASS && below !== B.DIRT && below !== B.SAND && below !== B.MUD) return false;
        for (const [dx, dz] of FACING_DIRS) if (blockId(this.get(x + dx, y - 1, z + dz)) === B.WATER) return true;
        return false;
      }
      default: return true;
    }
  }

  private checkSupport(x: number, y: number, z: number, depth = 0): void {
    if (depth > 64) return;
    const v = this.get(x, y, z);
    const id = blockId(v);
    if (id === 0 || id === B.WATER || id === B.LAVA) return;
    if (this.supported(x, y, z, v)) return;
    this.store.setBlock(x, y, z, 0);
    this.emit({ e: 'block', x, y, z, v: 0, old: v });
    if (!(id === B.OAK_DOOR && blockMeta(v) & DOOR_UPPER)) this.spawnDrops(x, y, z, v, null, true);
    this.emit({ e: 'particles', k: 'break', x: x + 0.5, y: y + 0.5, z: z + 0.5, d: v });
    this.checkSupport(x, y + 1, z, depth + 1);
    if (id === B.OAK_DOOR) { this.checkSupport(x, y - 1, z, depth + 1); }
    this.scheduleFluidAround(x, y, z);
  }

  blockDrops(v: number, stack: ItemStack | null, natural: boolean): ItemStack[] {
    const d = getBlock(v);
    if (!d.drops) return [];
    if (!natural && !canHarvest(v, stack)) return [];
    const id = d.id;
    if (id === B.WHEAT) {
      const stage = blockMeta(v) & 7;
      if (stage >= 7) return [{ id: I.WHEAT, count: 1 }, { id: I.SEEDS, count: 1 + this.rng.int(3) }];
      return [{ id: I.SEEDS, count: 1 }];
    }
    if (id === B.GRAVEL) return [{ id: this.rng.chance(0.1) ? I.FLINT : B.GRAVEL, count: 1 }];
    const out: ItemStack[] = [];
    for (const dr of d.drops) {
      if (dr.chance !== undefined && this.rng.next() >= dr.chance) continue;
      const itemId = dr.item === 'self' ? id : dr.item;
      const min = dr.min ?? 1, max = dr.max ?? min;
      const count = min + this.rng.int(max - min + 1);
      if (count > 0 && getItem(itemId)) out.push({ id: itemId, count });
    }
    return out;
  }

  private spawnDrops(x: number, y: number, z: number, v: number, stack: ItemStack | null, natural: boolean): void {
    for (const s of this.blockDrops(v, stack, natural)) this.spawnItem(x + 0.5, y + 0.4, z + 0.5, s);
  }

  spawnItem(x: number, y: number, z: number, stack: ItemStack, vx?: number, vy?: number, vz?: number, delay = 10): Entity | null {
    if (!this.authoritative) return null;
    const e: Entity = {
      id: this.allocId(), kind: 'item', type: 'item', x, y, z,
      vx: vx ?? (this.rng.next() - 0.5) * 2.4, vy: vy ?? 3.5, vz: vz ?? (this.rng.next() - 0.5) * 2.4,
      hw: 0.125, h: 0.25, onGround: false, hitH: false, hitCeil: false, yaw: this.rng.next() * 6.28,
      health: 5, maxHealth: 5, hurt: 0, age: 0, fire: 0, flags: 0, item: cloneStack(stack)!, pickupDelay: delay,
    };
    this.entities.set(e.id, e);
    this.emit({ e: 'spawn', ent: e });
    return e;
  }

  getBlockEntity(x: number, y: number, z: number): BlockEntity | undefined {
    return this.blockEntities.get(posKey(x, y, z));
  }

  ensureBlockEntity(x: number, y: number, z: number): BlockEntity | null {
    const k = posKey(x, y, z);
    let be = this.blockEntities.get(k);
    if (be) return be;
    const id = blockId(this.get(x, y, z));
    if (id === B.CHEST) be = { type: 'chest', items: new Array(CHEST_SIZE).fill(null) };
    else if (id === B.FURNACE || id === B.FURNACE_LIT) be = { type: 'furnace', items: new Array(FURNACE_SIZE).fill(null), burn: 0, burnMax: 0, cook: 0, xp: 0 };
    else return null;
    this.blockEntities.set(k, be);
    return be;
  }

  private removeBlockEntity(x: number, y: number, z: number, drop: boolean): void {
    const k = posKey(x, y, z);
    const be = this.blockEntities.get(k);
    if (!be) return;
    this.blockEntities.delete(k);
    this.activeFurnaces.delete(k);
    if (drop) for (const s of be.items) if (s) this.spawnItem(x + 0.5, y + 0.5, z + 0.5, s);
    for (const p of this.players.values()) {
      if (p.screen.type && p.screen.x === x && p.screen.y === y && p.screen.z === z && p.screen.type !== 'workbench') this.closeScreen(p);
    }
    this.emit({ e: 'container', key: k });
  }

  addGeneratedChest(x: number, y: number, z: number, items: (ItemStack | null)[]): void {
    const k = posKey(x, y, z);
    if (this.blockEntities.has(k)) return;
    this.blockEntities.set(k, { type: 'chest', items: items.map(cloneStack) });
  }

  addPlayer(p: SimPlayer): void {
    this.players.set(p.id, p);
    if (this.game) this.game.onJoin(p); else this.makeSafe(p);
  }

  buy(p: SimPlayer, key: string): void {
    if (!this.game) return;
    const err = this.game.buy(p, String(key).slice(0, 32));
    if (err) this.emit({ e: 'msg', text: err, kind: 'error', to: p.id });
  }

  removePlayer(id: string): void {
    const p = this.players.get(id);
    if (!p) return;
    if (p.screen.type) this.closeScreen(p);
    this.game?.onLeave(p);
    this.players.delete(id);
  }

  makeSafe(p: SimPlayer): void {
    if (!this.store.isLoaded(Math.floor(p.x), Math.floor(p.z))) return;
    let y = Math.max(1, Math.floor(p.y));
    for (let i = 0; i < WORLD_HEIGHT; i++) {
      if (!boxCollides(this.store, p.x - PLAYER_HW, y, p.z - PLAYER_HW, p.x + PLAYER_HW, y + PLAYER_H, p.z + PLAYER_HW)) break;
      y++;
    }
    if (y !== Math.floor(p.y)) { p.y = y; p.peakY = y; this.emit({ e: 'tp', p }); }
  }

  reach(p: SimPlayer): number { return p.mode === 'creative' ? REACH_CREATIVE : REACH_SURVIVAL; }

  private inReach(p: SimPlayer, x: number, y: number, z: number, extra = 1.2): boolean {
    const ex = p.x, ey = p.y + 1.62, ez = p.z;
    const dx = x + 0.5 - ex, dy = y + 0.5 - ey, dz = z + 0.5 - ez;
    return dx * dx + dy * dy + dz * dz <= (this.reach(p) + extra) ** 2;
  }

  canBuild(p: SimPlayer): boolean {
    return !p.dead && (p.op || this.settings.guestsBuild);
  }

  move(p: SimPlayer, x: number, y: number, z: number, yaw: number, pitch: number, flags: number): boolean {
    if (p.dead) return false;
    if (![x, y, z, yaw, pitch].every(Number.isFinite)) return false;
    if (this.validateMoves) {
      const dtMs = Math.max(50, this.now - p.lastMove);
      const dist = Math.hypot(x - p.x, z - p.z);
      const maxH = (p.mode === 'creative' && flags & MF.FLY ? 32 : 13) * (dtMs / 1000) + 1.5;
      const maxUp = (p.mode === 'creative' ? 32 : 14) * (dtMs / 1000) + 1.6;
      if (dist > maxH || y - p.y > maxUp || y < -64 || y > WORLD_HEIGHT + 64) {
        this.emit({ e: 'tp', p });
        return false;
      }
    }
    const horiz = Math.hypot(x - p.x, z - p.z);
    p.x = x; p.y = y; p.z = z; p.yaw = yaw; p.pitch = pitch;
    p.lastMove = this.now;
    const prevFlags = p.flags;
    p.flags = flags;
    if (p.mode === 'survival' && this.difficulty !== 'peaceful') {
      if (flags & MF.SPRINT) p.exh += horiz * 0.1;
      else if (flags & MF.WATER) p.exh += horiz * 0.01;
      if (flags & MF.JUMP && !(prevFlags & MF.JUMP)) p.exh += flags & MF.SPRINT ? 0.2 : 0.05;
    }
    const safe = flags & (MF.WATER | MF.LADDER | MF.FLY) || p.mode === 'creative';
    if (safe) p.peakY = y;
    else if (flags & MF.GROUND) {
      const fall = p.peakY - y;
      if (fall > 3.5) this.damage(p, Math.floor(fall - 3), 'fall', p.x, p.z, false);
      p.peakY = y;
    } else p.peakY = Math.max(p.peakY, y);
    if (p.screen.type && !this.inReach(p, p.screen.x, p.screen.y, p.screen.z, 3)) this.closeScreen(p);
    return true;
  }

  damage(p: SimPlayer, amount: number, cause: string, fx: number, fz: number, knock = true, bypassArmor = false, killer?: string): void {
    if (p.dead || p.mode === 'creative' || amount <= 0) return;
    if (this.game) { if (this.game.protectedPlayer(p)) return; amount *= this.game.damageScale(p); }
    if (p.hurtCd > 0 && cause !== 'void' && cause !== 'drown' && cause !== 'starve') return;
    let dmg = amount;
    if (!bypassArmor) {
      const ap = Math.min(20, armorPoints(p.inv));
      dmg = amount * (1 - ap / 25);
      if (ap > 0) { damageArmor(p.inv, amount); this.emit({ e: 'inv', p }); }
    }
    dmg = Math.max(0.5, Math.round(dmg * 2) / 2);
    p.health = Math.max(0, p.health - dmg);
    p.hurtCd = 10;
    p.exh += 0.1;
    this.emit({ e: 'hurt', p, amount: dmg, cause, fx: knock ? fx : p.x, fz: knock ? fz : p.z });
    this.emit({ e: 'sound', s: 'player.hurt', x: p.x, y: p.y + 1, z: p.z });
    this.emit({ e: 'vitals', p });
    if (p.health <= 0) this.kill(p, cause, killer);
  }

  private kill(p: SimPlayer, cause: string, killer?: string): void {
    p.dead = true;
    p.dig = null;
    const msgs: Record<string, string> = {
      fall: 'hit the ground too hard', lava: 'tried to swim in lava', drown: 'ran out of air', cactus: 'was pricked to death',
      void: 'fell out of the world', starve: 'starved to death', fire: 'burned to a crisp', arrow: 'was shot by a Rattlebone',
      kill: 'gave up on this life', player: `was struck down by ${killer ?? 'a rival'}`,
    };
    const mob = MOBS[cause as MobType];
    const text = `${p.name} ${mob ? `was slain by a ${mob.name}` : msgs[cause] ?? 'died'}`;
    if (p.screen.type) this.closeScreen(p);
    applyInvOp(this.invCtx(p), { t: 'close' });
    if (this.game?.onKill(p, cause, killer)) {
      this.emit({ e: 'inv', p });
      this.emit({ e: 'death', p, msg: text });
      this.emit({ e: 'msg', text, kind: 'death' });
      this.emit({ e: 'vitals', p });
      return;
    }
    for (const s of allStacks(p.inv)) {
      this.spawnItem(p.x, p.y + 1, p.z, s, (this.rng.next() - 0.5) * 5, 4, (this.rng.next() - 0.5) * 5, 40);
    }
    const keep = p.inv.selected;
    p.inv = emptyInv();
    p.inv.selected = keep;
    p.xp = 0;
    this.emit({ e: 'inv', p });
    this.emit({ e: 'death', p, msg: text });
    this.emit({ e: 'msg', text, kind: 'death' });
    this.emit({ e: 'vitals', p });
  }

  respawn(p: SimPlayer): void {
    if (!p.dead) return;
    if (this.game && !this.game.allowRespawn(p)) return;
    p.dead = false;
    p.health = 20; p.food = 20; p.sat = 5; p.exh = 0; p.air = 300; p.fireT = 0;
    p.x = p.spawn.x; p.y = p.spawn.y; p.z = p.spawn.z; p.peakY = p.y;
    p.hurtCd = 40;
    if (!this.game) this.makeSafe(p);
    this.game?.onRespawn(p);
    this.emit({ e: 'respawn', p });
    this.emit({ e: 'vitals', p });
  }

  invCtx(p: SimPlayer) {
    let container: (ItemStack | null)[] | null = null;
    let kind: 'chest' | 'furnace' | null = null;
    if (p.screen.type === 'chest' || p.screen.type === 'furnace') {
      const be = this.getBlockEntity(p.screen.x, p.screen.y, p.screen.z);
      if (be && be.type === p.screen.type) { container = be.items; kind = be.type; }
    }
    return {
      inv: p.inv, container, containerKind: kind, creative: p.mode === 'creative',
      drop: (s: ItemStack) => {
        const yaw = p.yaw;
        this.spawnItem(p.x, p.y + 1.3, p.z, s, -Math.sin(yaw) * 5, 2.5, -Math.cos(yaw) * 5, 30);
      },
      crafted: (recipe: Recipe, times: number) => this.emit({ e: 'crafted', p, recipe, times }),
    };
  }

  invOp(p: SimPlayer, op: InvOp): { ok: boolean; hash: number } {
    if (p.dead && op.t !== 'close') return { ok: false, hash: invHash(p.inv) };
    const ctx = this.invCtx(p);
    const wasFurnaceOut = op.t === 'click' && op.s.c === 'cont' && op.s.i === 2 && ctx.containerKind === 'furnace' || op.t === 'quick' && op.s.c === 'cont' && op.s.i === 2 && ctx.containerKind === 'furnace';
    const ok = applyInvOp(ctx, op);
    if (ok) {
      if (ctx.container) {
        const k = posKey(p.screen.x, p.screen.y, p.screen.z);
        this.emit({ e: 'container', key: k });
        if (ctx.containerKind === 'furnace') {
          this.activeFurnaces.add(k);
          if (wasFurnaceOut) {
            const be = this.getBlockEntity(p.screen.x, p.screen.y, p.screen.z);
            if (be && be.type === 'furnace' && be.xp >= 1) { const g = Math.floor(be.xp); be.xp -= g; this.giveXp(p, g); }
          }
        }
      }
      if (op.t === 'close') { p.screen.type = null; this.emit({ e: 'screen', p }); }
    }
    if (!ok) this.emit({ e: 'inv', p });
    return { ok, hash: invHash(p.inv) };
  }

  giveXp(p: SimPlayer, n: number): void {
    if (n <= 0) return;
    const before = xpLevel(p.xp).level;
    p.xp += n;
    const after = xpLevel(p.xp).level;
    this.emit({ e: 'sound', s: after > before ? 'player.levelup' : 'player.xp', x: p.x, y: p.y, z: p.z, to: p.id });
    this.emit({ e: 'vitals', p });
  }

  closeScreen(p: SimPlayer): void {
    if (!p.screen.type) return;
    applyInvOp(this.invCtx(p), { t: 'close' });
    p.screen.type = null;
    this.emit({ e: 'screen', p });
    this.emit({ e: 'inv', p });
  }

  openScreen(p: SimPlayer, type: ScreenType, x: number, y: number, z: number): void {
    if (p.screen.type) applyInvOp(this.invCtx(p), { t: 'close' });
    p.screen = { type, x, y, z };
    p.inv.craftSize = type === 'workbench' ? 3 : 2;
    if (type === 'chest' || type === 'furnace') this.ensureBlockEntity(x, y, z);
    this.emit({ e: 'screen', p });
    this.emit({ e: 'inv', p });
    if (type === 'chest') this.emit({ e: 'sound', s: 'chest.open', x: x + 0.5, y: y + 0.5, z: z + 0.5 });
  }

  digStart(p: SimPlayer, x: number, y: number, z: number): boolean {
    if (p.dead || !this.canBuild(p)) return false;
    if (!this.inReach(p, x, y, z)) return false;
    p.dig = { x, y, z, t: this.now };
    return true;
  }

  digAbort(p: SimPlayer): void { p.dig = null; }

  digFinish(p: SimPlayer, x: number, y: number, z: number): boolean {
    const fail = () => { this.emit({ e: 'reject', p, x, y, z }); return false; };
    if (p.dead || !this.canBuild(p)) return fail();
    if (!this.inReach(p, x, y, z)) return fail();
    const v = this.get(x, y, z);
    const d = getBlock(v);
    if (blockId(v) === 0 || d.fluid) return fail();
    const stack = heldStack(p.inv);
    if (p.mode !== 'creative') {
      if (d.hardness < 0) return fail();
      const need = breakTime(v, stack, !!(p.flags & MF.EYE_WATER));
      const started = p.dig && p.dig.x === x && p.dig.y === y && p.dig.z === z ? p.dig.t : -1;
      if (need > 0.06) {
        if (started < 0) return fail();
        if ((this.now - started) / 1000 < need * 0.7 - 0.15) return fail();
      }
    } else if (blockId(v) === B.BEDROCK && !p.op) return fail();
    if (this.game && !this.game.canBreak(p, x, y, z, v)) return fail();
    p.dig = null;
    this.breakBlock(x, y, z, p);
    this.game?.onBroken(p.name, x, y, z, v);
    return true;
  }

  breakBlock(x: number, y: number, z: number, p: SimPlayer | null): void {
    const v = this.get(x, y, z);
    const id = blockId(v);
    const d = getBlock(v);
    const stack = p ? heldStack(p.inv) : null;
    if (id === B.OAK_DOOR) {
      const upper = blockMeta(v) & DOOR_UPPER;
      const oy = upper ? y - 1 : y + 1;
      if (blockId(this.get(x, oy, z)) === B.OAK_DOOR) { this.store.setBlock(x, oy, z, 0); this.emit({ e: 'block', x, y: oy, z, v: 0, old: this.get(x, oy, z) }); }
    }
    const be = this.getBlockEntity(x, y, z);
    let replacement = 0;
    if (id === B.ICE && p?.mode === 'survival' && isSolid(this.get(x, y - 1, z))) replacement = B.WATER;
    this.setBlock(x, y, z, replacement, p?.id);
    if (be) this.removeBlockEntity(x, y, z, true);
    this.emit({ e: 'particles', k: 'break', x: x + 0.5, y: y + 0.5, z: z + 0.5, d: v, src: p?.id });
    this.emit({ e: 'sound', s: `break.${d.sound}`, x: x + 0.5, y: y + 0.5, z: z + 0.5, src: p?.id });
    if (p && p.mode === 'survival') {
      if (getBlock(v).render === 'leaves' || getBlock(v).hardness > 0) {
        const broke = damageHeld(p.inv, toolFor(stack)?.type === 'sword' ? 2 : 1);
        if (toolFor(stack)) this.emit({ e: 'inv', p });
        if (broke) this.emit({ e: 'sound', s: 'tool.break', x: p.x, y: p.y + 1, z: p.z });
      }
      p.exh += 0.005;
      this.spawnDrops(x, y, z, v, stack, false);
      const [a, b] = d.xp;
      if (b > 0 && canHarvest(v, stack)) this.giveXp(p, a + this.rng.int(b - a + 1));
    }
  }

  use(p: SimPlayer, x: number, y: number, z: number, nx: number, ny: number, nz: number, forcePlace = false): boolean {
    if (p.dead) return false;
    if (Math.abs(nx) + Math.abs(ny) + Math.abs(nz) !== 1) return false;
    if (!this.inReach(p, x, y, z)) { this.emit({ e: 'reject', p, x: x + nx, y: y + ny, z: z + nz }); return false; }
    const v = this.get(x, y, z);
    const id = blockId(v);
    const d = getBlock(v);
    const crouch = !!(p.flags & MF.CROUCH);
    const stack = heldStack(p.inv);
    const item = stack ? getItem(stack.id) : undefined;
    if (d.interactive && !(crouch && stack) && !(forcePlace && stack && getItem(stack.id)?.places !== undefined)) {
      if (id === B.WORKBENCH) { this.openScreen(p, 'workbench', x, y, z); return true; }
      if (id === B.CHEST) { this.openScreen(p, 'chest', x, y, z); return true; }
      if (id === B.FURNACE || id === B.FURNACE_LIT) { this.openScreen(p, 'furnace', x, y, z); return true; }
      if (id === B.OAK_DOOR) {
        if (!this.canBuild(p)) return false;
        const m = blockMeta(v);
        const by = m & DOOR_UPPER ? y - 1 : y;
        for (const yy of [by, by + 1]) {
          const dv = this.get(x, yy, z);
          if (blockId(dv) === B.OAK_DOOR) this.setBlock(x, yy, z, makeBlock(B.OAK_DOOR, blockMeta(dv) ^ DOOR_OPEN), p.id);
        }
        this.emit({ e: 'sound', s: m & DOOR_OPEN ? 'door.close' : 'door.open', x: x + 0.5, y: y + 0.5, z: z + 0.5, src: p.id });
        return true;
      }
    }
    if (!this.canBuild(p)) { this.emit({ e: 'reject', p, x: x + nx, y: y + ny, z: z + nz }); return false; }
    if (item?.tool?.type === 'hoe' && (id === B.GRASS || id === B.DIRT || id === B.SNOWY_GRASS) && blockId(this.get(x, y + 1, z)) === 0) {
      this.setBlock(x, y, z, B.FARMLAND, p.id);
      this.emit({ e: 'sound', s: 'place.dirt', x: x + 0.5, y: y + 1, z: z + 0.5, src: p.id });
      if (p.mode === 'survival') { damageHeld(p.inv); this.emit({ e: 'inv', p }); }
      return true;
    }
    if (item?.kind === 'bucket') return this.useBucket(p, x, y, z, nx, ny, nz, stack!);
    if (item?.kind === 'food' && !(item.places)) return false;
    return this.place(p, x, y, z, nx, ny, nz);
  }

  private useBucket(p: SimPlayer, x: number, y: number, z: number, nx: number, ny: number, nz: number, stack: ItemStack): boolean {
    const v = this.get(x, y, z);
    if (stack.id === I.BUCKET) {
      const id = blockId(v);
      if ((id === B.WATER || id === B.LAVA) && blockMeta(v) === 0) {
        this.setBlock(x, y, z, 0, p.id);
        this.emit({ e: 'sound', s: id === B.WATER ? 'bucket.fill' : 'bucket.fill_lava', x, y, z });
        if (p.mode === 'survival') {
          consumeHeld(p.inv);
          const full = { id: id === B.WATER ? I.WATER_BUCKET : I.LAVA_BUCKET, count: 1 };
          if (!p.inv.slots[p.inv.selected]) p.inv.slots[p.inv.selected] = full;
          else if (giveItem(p.inv, full) > 0) this.invCtx(p).drop(full);
          this.emit({ e: 'inv', p });
        }
        return true;
      }
      return false;
    }
    let tx = x, ty = y, tz = z;
    if (!isReplaceable(v) || blockId(v) === B.WATER || blockId(v) === B.LAVA) { tx += nx; ty += ny; tz += nz; }
    if (!this.inReach(p, tx, ty, tz)) return false;
    const tv = this.get(tx, ty, tz);
    if (!isReplaceable(tv)) { this.emit({ e: 'reject', p, x: tx, y: ty, z: tz }); return false; }
    const fluid = stack.id === I.WATER_BUCKET ? B.WATER : B.LAVA;
    if (blockId(tv) !== 0 && blockId(tv) !== B.WATER && blockId(tv) !== B.LAVA) this.spawnDrops(tx, ty, tz, tv, null, true);
    this.setBlock(tx, ty, tz, fluid, p.id);
    this.scheduleFluid(tx, ty, tz, 2);
    this.emit({ e: 'sound', s: 'bucket.empty', x: tx, y: ty, z: tz });
    if (p.mode === 'survival') { p.inv.slots[p.inv.selected] = { id: I.BUCKET, count: 1 }; this.emit({ e: 'inv', p }); }
    return true;
  }

  place(p: SimPlayer, x: number, y: number, z: number, nx: number, ny: number, nz: number): boolean {
    const stack = heldStack(p.inv);
    const item = stack ? getItem(stack.id) : undefined;
    if (!stack || !item || item.places === undefined) return false;
    let bid = item.places;
    const clicked = this.get(x, y, z);
    let tx = x, ty = y, tz = z;
    const clickedReplaceable = isReplaceable(clicked) && blockId(clicked) !== bid && blockId(clicked) !== 0 && !getBlock(clicked).fluid;
    if (!clickedReplaceable) { tx += nx; ty += ny; tz += nz; }
    const fail = () => { this.emit({ e: 'reject', p, x: tx, y: ty, z: tz }); return false; };
    if (this.game && !this.game.canPlace(p, tx, ty, tz)) return fail();
    if (ty < 1 || ty >= WORLD_HEIGHT - 1) return fail();
    if (!this.store.isLoaded(tx, tz)) return fail();
    if (!this.inReach(p, tx, ty, tz)) return fail();
    const target = this.get(tx, ty, tz);
    if (!isReplaceable(target)) return fail();
    let meta = 0;
    const look = facingFromYaw(p.yaw);
    const def = BLOCKS[bid];
    if (bid === B.LILY_PAD) {
      if (blockId(clicked) !== B.WATER) return fail();
      tx = x; ty = y + 1; tz = z;
      if (blockId(this.get(tx, ty, tz)) !== 0) return fail();
    }
    if (def.orientable) meta = (look + 2) & 3;
    if (bid === B.TORCH) {
      if (ny === 1) meta = 0;
      else if (ny === -1) return fail();
      else {
        const f = FACING_DIRS.findIndex(([dx, dz]) => dx === -nx && dz === -nz);
        meta = f + 1;
      }
    }
    if (bid === B.LADDER) {
      if (ny !== 0) return fail();
      meta = FACING_DIRS.findIndex(([dx, dz]) => dx === -nx && dz === -nz);
    }
    if (def.render === 'leaves') meta = 1;
    let v = makeBlock(bid, meta);
    if (bid === B.OAK_DOOR) {
      const above = this.get(tx, ty + 1, tz);
      if (!isReplaceable(above) || !isSolid(this.get(tx, ty - 1, tz))) return fail();
      v = makeBlock(B.OAK_DOOR, doorMeta(look, false, false));
    }
    if (def.solid) {
      for (const op of this.players.values()) {
        if (op.dead) continue;
        const bb = blockBox(v)!;
        if (op.x + PLAYER_HW > tx + bb[0] && op.x - PLAYER_HW < tx + bb[3] && op.y + PLAYER_H > ty + bb[1] && op.y < ty + bb[4] && op.z + PLAYER_HW > tz + bb[2] && op.z - PLAYER_HW < tz + bb[5]) return fail();
      }
      for (const e of this.entities.values()) {
        if (e.kind !== 'mob') continue;
        if (e.x + e.hw > tx && e.x - e.hw < tx + 1 && e.y + e.h > ty && e.y < ty + 1 && e.z + e.hw > tz && e.z - e.hw < tz + 1) return fail();
      }
    }
    if (bid !== B.LILY_PAD && !this.supported(tx, ty, tz, v)) {
      if (!(bid === B.OAK_DOOR)) return fail();
    }
    if (blockId(target) !== 0 && !getBlock(target).fluid) this.spawnDrops(tx, ty, tz, target, null, true);
    this.setBlock(tx, ty, tz, v, p.id);
    if (bid === B.OAK_DOOR) this.setBlock(tx, ty + 1, tz, makeBlock(B.OAK_DOOR, doorMeta(look, true, false)), p.id);
    this.emit({ e: 'sound', s: `place.${def.sound}`, x: tx + 0.5, y: ty + 0.5, z: tz + 0.5, src: p.id });
    if (p.mode === 'survival') { consumeHeld(p.inv); this.emit({ e: 'inv', p }); }
    return true;
  }

  eat(p: SimPlayer): boolean {
    if (p.dead) return false;
    const stack = heldStack(p.inv);
    const food = stack ? getItem(stack.id)?.food : undefined;
    if (!food) return false;
    if (p.food >= 20 && p.mode === 'survival' && this.difficulty !== 'peaceful') return false;
    if (this.now - p.lastEat < 1300) return false;
    p.lastEat = this.now;
    p.food = Math.min(20, p.food + food.hunger);
    p.sat = Math.min(p.food, p.sat + food.saturation);
    if (stack!.id === I.ROTTEN_FLESH && this.rng.chance(0.8)) p.exh += 6;
    if (p.mode === 'survival') { consumeHeld(p.inv); this.emit({ e: 'inv', p }); }
    this.emit({ e: 'sound', s: 'player.burp', x: p.x, y: p.y + 1.5, z: p.z });
    this.emit({ e: 'vitals', p });
    return true;
  }

  attack(p: SimPlayer, entityId: number): boolean {
    if (p.dead) return false;
    const e = this.entities.get(entityId);
    if (!e || e.kind !== 'mob') return false;
    if (this.game?.onAttackMob(p, e)) return true;
    const dx = e.x - p.x, dy = e.y + e.h / 2 - (p.y + 1.62), dz = e.z - p.z;
    if (dx * dx + dy * dy + dz * dz > (p.mode === 'creative' ? 6.5 : 5) ** 2) return false;
    if (this.now - p.lastAttack < 250) return false;
    p.lastAttack = this.now;
    const stack = heldStack(p.inv);
    const tool = toolFor(stack);
    let dmg = (tool?.damage ?? 1) + (this.game?.damageBonus(p) ?? 0);
    const crit = !(p.flags & MF.GROUND) && !(p.flags & MF.WATER) && !(p.flags & MF.LADDER) && !(p.flags & MF.FLY);
    if (crit) dmg *= 1.5;
    if (p.mode === 'creative') dmg = Math.max(dmg, 20);
    if (p.mode === 'survival') { p.exh += 0.1; if (tool) { damageHeld(p.inv, tool.type === 'sword' ? 1 : 2); this.emit({ e: 'inv', p }); } }
    const len = Math.hypot(dx, dz) || 1;
    this.hurtMob(e, dmg, p.id, dx / len, dz / len);
    if (crit) this.emit({ e: 'particles', k: 'crit', x: e.x, y: e.y + e.h, z: e.z });
    return true;
  }

  attackPlayer(p: SimPlayer, targetId: string): boolean {
    if (!this.settings.pvp || p.dead) return false;
    const t = this.players.get(targetId);
    if (!t || t.dead || t === p) return false;
    if (this.game && !this.game.canHurtPlayer(p, t)) return false;
    const dx = t.x - p.x, dy = t.y - p.y, dz = t.z - p.z;
    if (dx * dx + dy * dy + dz * dz > 25) return false;
    if (this.now - p.lastAttack < 400) return false;
    p.lastAttack = this.now;
    const tool = toolFor(heldStack(p.inv));
    let dmg = (tool?.damage ?? 1) + (this.game?.damageBonus(p) ?? 0);
    const crit = !(p.flags & MF.GROUND) && !(p.flags & MF.WATER) && !(p.flags & MF.LADDER) && !(p.flags & MF.FLY);
    if (crit) { dmg *= 1.5; this.emit({ e: 'particles', k: 'crit', x: t.x, y: t.y + 1.8, z: t.z }); }
    if (p.mode === 'survival' && tool) { damageHeld(p.inv, tool.type === 'sword' ? 1 : 2); this.emit({ e: 'inv', p }); }
    this.damage(t, dmg, 'player', p.x, p.z, true, false, p.name);
    return true;
  }

  hurtMob(e: Entity, dmg: number, by: string | null, kx: number, kz: number): void {
    if (e.hurt > 0 || e.health <= 0) return;
    if (this.game?.mobInvulnerable(e)) return;
    e.health -= dmg;
    e.hurt = 10;
    e.vx += kx * 6; e.vz += kz * 6; e.vy = Math.max(e.vy, 4.5);
    const def = MOBS[e.type as MobType];
    if (by) { e.attacker = by; e.provoked = 400; if (!def.hostile) e.panic = 80; else e.target = by; }
    this.emit({ e: 'sound', s: `mob.${e.type}.hurt`, x: e.x, y: e.y + 0.5, z: e.z });
    this.emit({ e: 'particles', k: 'hurt', x: e.x, y: e.y + e.h * 0.6, z: e.z });
    if (e.health <= 0) {
      this.entities.delete(e.id);
      this.emit({ e: 'remove', id: e.id, why: 'death', by: by ?? undefined });
      this.emit({ e: 'sound', s: `mob.${e.type}.death`, x: e.x, y: e.y + 0.5, z: e.z });
      this.emit({ e: 'particles', k: 'smoke', x: e.x, y: e.y + e.h / 2, z: e.z });
      const killer = by ? this.players.get(by) : undefined;
      if (killer || e.fire > 0) {
        for (const dr of def.drops) {
          if (dr.chance !== undefined && !this.rng.chance(dr.chance)) continue;
          const n = dr.min + this.rng.int(dr.max - dr.min + 1);
          let item = dr.item;
          if (e.fire > 0) { if (item === I.RAW_PORK) item = I.COOKED_PORK; if (item === I.RAW_MUTTON) item = I.COOKED_MUTTON; if (item === I.RAW_POULTRY) item = I.COOKED_POULTRY; }
          if (n > 0) this.spawnItem(e.x, e.y + 0.5, e.z, { id: item, count: n });
        }
      }
      if (killer && killer.mode === 'survival') this.giveXp(killer, def.xp);
      this.game?.onMobDeath(e, by);
    }
  }

  spawnMob(type: MobType, x: number, y: number, z: number): Entity {
    const def = MOBS[type];
    const e: Entity = {
      id: this.allocId(), kind: 'mob', type, x, y, z, vx: 0, vy: 0, vz: 0, hw: def.hw, h: def.h,
      onGround: false, hitH: false, hitCeil: false, yaw: this.rng.next() * Math.PI * 2,
      health: def.health, maxHealth: def.health, hurt: 0, age: 0, fire: 0, flags: 0,
      target: null, path: null, pathT: 0, wanderT: this.rng.int(100), panic: 0, attackCd: 0, provoked: 0,
    };
    this.entities.set(e.id, e);
    this.emit({ e: 'spawn', ent: e });
    return e;
  }

  tick(): void {
    this.tickCount++;
    this.now += 50;
    if (this.settings.dayCycle) this.time++;
    if (this.tickCount % 200 === 0) this.emit({ e: 'time' });
    this.tickWeather();
    for (const p of this.players.values()) this.tickPlayer(p);
    if (!this.authoritative) return;
    this.tickFluids();
    this.tickFurnaces();
    this.tickRandom();
    this.tickLeafDecay();
    for (const e of [...this.entities.values()]) this.tickEntity(e);
    if (this.game) this.game.tick();
    else if (this.tickCount % 20 === 0) this.spawnCycle();
  }

  setWeather(w: Weather, duration?: number): void {
    this.weather = w;
    this.weatherTimer = duration ?? (w === 'clear' ? 6000 + this.rng.int(12000) : 2400 + this.rng.int(6000));
    this.emit({ e: 'weather', w });
  }

  private tickWeather(): void {
    if (!this.authoritative) return;
    if (this.settings.weatherCycle && --this.weatherTimer <= 0) {
      if (this.weather === 'clear') this.setWeather(this.rng.chance(0.25) ? 'thunder' : 'rain');
      else this.setWeather('clear');
    }
    if (this.weather === 'thunder' && this.rng.chance(1 / 160) && this.players.size) {
      const ps = [...this.players.values()];
      const p = ps[this.rng.int(ps.length)];
      const x = Math.floor(p.x + (this.rng.next() - 0.5) * 80), z = Math.floor(p.z + (this.rng.next() - 0.5) * 80);
      if (this.store.isLoaded(x, z)) {
        let y = WORLD_HEIGHT - 1;
        while (y > 0 && blockId(this.get(x, y, z)) === 0) y--;
        this.emit({ e: 'lightning', x: x + 0.5, y: y + 1, z: z + 0.5 });
        for (const op of this.players.values()) {
          if (Math.hypot(op.x - x, op.z - z) < 3 && Math.abs(op.y - y) < 4) { this.damage(op, 5, 'fire', x, z); op.fireT = 160; }
        }
      }
    }
  }

  private tickPlayer(p: SimPlayer): void {
    if (p.hurtCd > 0) p.hurtCd--;
    if (p.dead || !this.authoritative) return;
    const f = p.flags;
    let changed = false;
    if (p.mode === 'survival') {
      if (f & MF.LAVA) { p.fireT = 300; if (--p.t.lava <= 0) { p.t.lava = 10; this.damage(p, 4, 'lava', p.x, p.z, false); } }
      if (f & MF.WATER) p.fireT = 0;
      if (p.fireT > 0) { p.fireT--; if (--p.t.fire <= 0) { p.t.fire = 20; if (!(f & MF.LAVA)) this.damage(p, 1, 'fire', p.x, p.z, false); } }
      if (f & MF.EYE_WATER) {
        p.air--;
        if (p.air <= 0) { p.air = 0; if (--p.t.drown <= 0) { p.t.drown = 20; this.damage(p, 2, 'drown', p.x, p.z, false, true); } }
        if (p.air % 20 === 0) changed = true;
      } else if (p.air < 300) { p.air = Math.min(300, p.air + 5); changed = true; }
      if (f & MF.CACTUS) { if (--p.t.cactus <= 0) { p.t.cactus = 10; this.damage(p, 1, 'cactus', p.x, p.z, false); } }
      if (p.y < -8) { if (--p.t.void <= 0) { p.t.void = 10; this.damage(p, 4, 'void', p.x, p.z, false, true); } }
      if (this.difficulty === 'peaceful') {
        if (this.tickCount % 20 === 0) {
          if (p.health < 20) { p.health = Math.min(20, p.health + 1); changed = true; }
          if (p.food < 20) { p.food = Math.min(20, p.food + 1); changed = true; }
        }
      } else {
        while (p.exh >= 4) {
          p.exh -= 4;
          if (p.sat > 0) p.sat = Math.max(0, p.sat - 1);
          else { p.food = Math.max(0, p.food - 1); changed = true; }
        }
        if (p.food >= 18 && p.health < 20) {
          if (++p.t.regen >= (p.sat > 0 && p.food >= 20 ? 10 : 80)) { p.t.regen = 0; p.health = Math.min(20, p.health + 1); p.exh += 6; changed = true; }
        } else if (p.food <= 0) {
          if (++p.t.starve >= 80) {
            p.t.starve = 0;
            const floor = this.difficulty === 'easy' ? 10 : this.difficulty === 'normal' ? 1 : 0;
            if (p.health > floor) this.damage(p, 1, 'starve', p.x, p.z, false, true);
          }
        }
      }
    } else {
      p.air = 300;
      if (p.health < 20 || p.food < 20) { p.health = 20; p.food = 20; changed = true; }
    }
    if (changed) this.emit({ e: 'vitals', p });
  }

  private fluidWorld: FluidWorld = {
    get: (x, y, z) => this.get(x, y, z),
    set: (x, y, z, v) => this.setBlockNoFluid(x, y, z, v),
    loaded: (x, z) => this.store.isLoaded(x, z),
    schedule: (x, y, z, d) => this.scheduleFluid(x, y, z, d),
    breakDrop: (x, y, z, v) => this.spawnDrops(x, y, z, v, null, true),
  };

  private setBlockNoFluid(x: number, y: number, z: number, v: number): void {
    if (y < 0 || y >= WORLD_HEIGHT) return;
    const old = this.get(x, y, z);
    if (old === v) return;
    this.store.setBlock(x, y, z, v);
    this.emit({ e: 'block', x, y, z, v, old });
    this.checkSupport(x, y + 1, z);
    if (blockId(v) === B.LAVA || blockId(old) === B.LAVA) {
      for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
        if (blockId(this.get(x + dx, y + dy, z + dz)) === B.WATER) this.scheduleFluid(x + dx, y + dy, z + dz, 1);
      }
    }
  }

  private tickFluids(): void {
    if (this.fluidQueue.size === 0) return;
    const due: string[] = [];
    for (const [k, t] of this.fluidQueue) if (t <= this.tickCount) due.push(k);
    let n = 0;
    for (const k of due) {
      this.fluidQueue.delete(k);
      if (++n > 600) { this.fluidQueue.set(k, this.tickCount + 1); continue; }
      const [x, y, z] = parsePosKey(k);
      tickFluid(this.fluidWorld, x, y, z);
    }
  }

  private tickFurnaces(): void {
    for (const k of [...this.activeFurnaces]) {
      const be = this.blockEntities.get(k);
      if (!be || be.type !== 'furnace') { this.activeFurnaces.delete(k); continue; }
      const [x, y, z] = parsePosKey(k);
      const input = be.items[0], fuel = be.items[1], out = be.items[2];
      const smelt = input ? findSmelt(input.id) : null;
      const canCook = !!smelt && (!out || (out.id === smelt.result && out.count < (getItem(out.id)?.maxStack ?? 64)));
      let changed = false;
      if (be.burn <= 0 && canCook && fuel && fuelSeconds(fuel.id) > 0) {
        be.burnMax = be.burn = fuelSeconds(fuel.id) * 20;
        if (fuel.id === I.LAVA_BUCKET) be.items[1] = { id: I.BUCKET, count: 1 };
        else { fuel.count--; if (fuel.count <= 0) be.items[1] = null; }
        changed = true;
      }
      if (be.burn > 0) {
        be.burn--;
        if (canCook) {
          be.cook++;
          if (be.cook >= 200) {
            be.cook = 0;
            input!.count--;
            if (input!.count <= 0) be.items[0] = null;
            if (out) out.count++; else be.items[2] = { id: smelt!.result, count: 1 };
            be.xp += smelt!.xp;
            changed = true;
          }
        } else if (be.cook > 0) be.cook = 0;
      } else if (be.cook > 0) be.cook = Math.max(0, be.cook - 2);
      const v = this.get(x, y, z);
      const lit = be.burn > 0;
      const id = blockId(v);
      if (lit && id === B.FURNACE) this.store.setBlock(x, y, z, makeBlock(B.FURNACE_LIT, blockMeta(v))), this.emit({ e: 'block', x, y, z, v: makeBlock(B.FURNACE_LIT, blockMeta(v)), old: v });
      else if (!lit && id === B.FURNACE_LIT) this.store.setBlock(x, y, z, makeBlock(B.FURNACE, blockMeta(v))), this.emit({ e: 'block', x, y, z, v: makeBlock(B.FURNACE, blockMeta(v)), old: v });
      if (changed || this.tickCount % 10 === 0) this.emit({ e: 'container', key: k });
      if (!lit && be.cook === 0 && !canCook) this.activeFurnaces.delete(k);
      else if (!lit && !(fuel && fuelSeconds(fuel.id) > 0) && be.cook === 0) this.activeFurnaces.delete(k);
    }
  }

  private loadedTickChunks(): [number, number][] {
    const set = new Set<string>();
    const out: [number, number][] = [];
    for (const p of this.players.values()) {
      const pcx = Math.floor(p.x / CHUNK_SIZE), pcz = Math.floor(p.z / CHUNK_SIZE);
      for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
        const k = `${pcx + dx},${pcz + dz}`;
        if (set.has(k)) continue;
        set.add(k);
        if (this.store.isLoaded((pcx + dx) * CHUNK_SIZE, (pcz + dz) * CHUNK_SIZE)) out.push([pcx + dx, pcz + dz]);
      }
    }
    return out;
  }

  private tickRandom(): void {
    const chunks = this.loadedTickChunks();
    for (const [cx, cz] of chunks) {
      for (let n = 0; n < 24; n++) {
        const lx = this.rng.int(16), lz = this.rng.int(16), y = 1 + this.rng.int(WORLD_HEIGHT - 2);
        const x = cx * 16 + lx, z = cz * 16 + lz;
        const v = this.get(x, y, z);
        const id = blockId(v);
        if (id === 0 || id === B.STONE) continue;
        this.randomTick(x, y, z, v, id);
      }
    }
  }

  private randomTick(x: number, y: number, z: number, v: number, id: number): void {
    switch (id) {
      case B.WHEAT: {
        const st = blockMeta(v) & 7;
        if (st < 7 && this.rng.chance(0.3)) this.setBlock(x, y, z, makeBlock(B.WHEAT, st + 1));
        break;
      }
      case B.OAK_SAPLING: case B.BIRCH_SAPLING: case B.SPRUCE_SAPLING: case B.JUNGLE_SAPLING:
        if (this.rng.chance(0.12)) this.growTree(x, y, z, id);
        break;
      case B.SUGAR_CANE: case B.CACTUS: {
        if (blockId(this.get(x, y + 1, z)) !== 0 || !this.rng.chance(0.15)) break;
        let h = 1;
        while (blockId(this.get(x, y - h, z)) === id) h++;
        if (h < 3 && this.supported(x, y + 1, z, id)) this.setBlock(x, y + 1, z, id);
        break;
      }
      case B.DIRT: {
        if (isSolid(this.get(x, y + 1, z)) || blockId(this.get(x, y + 1, z)) === B.WATER) break;
        for (let i = 0; i < 4; i++) {
          const [dx, dz] = FACING_DIRS[i];
          for (let dy = -1; dy <= 1; dy++) {
            if (blockId(this.get(x + dx, y + dy, z + dz)) === B.GRASS) { this.setBlock(x, y, z, B.GRASS); return; }
          }
        }
        break;
      }
      case B.GRASS: case B.SNOWY_GRASS:
        if (getBlock(this.get(x, y + 1, z)).opaque) this.setBlock(x, y, z, B.DIRT);
        break;
      case B.ICE: {
        for (let dy = -2; dy <= 2; dy++) for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
          if (LIGHT_EMIT[blockId(this.get(x + dx, y + dy, z + dz))] >= 13) { this.setBlock(x, y, z, B.WATER); return; }
        }
        break;
      }
    }
  }

  growTree(x: number, y: number, z: number, sapling: number): boolean {
    const kind = sapling - B.OAK_SAPLING;
    const LOG = [B.OAK_LOG, B.BIRCH_LOG, B.SPRUCE_LOG, B.JUNGLE_LOG][kind];
    const LEAF = [B.OAK_LEAVES, B.BIRCH_LEAVES, B.SPRUCE_LEAVES, B.JUNGLE_LEAVES][kind];
    const h = [5, 6, 7, 9][kind] + this.rng.int(2);
    for (let i = 1; i <= h + 1; i++) if (!isReplaceable(this.get(x, y + i, z)) && getBlock(this.get(x, y + i, z)).render !== 'leaves') return false;
    const leaf = (lx: number, ly: number, lz: number) => { if (isReplaceable(this.get(lx, ly, lz)) && !getBlock(this.get(lx, ly, lz)).fluid) this.setBlock(lx, ly, lz, LEAF); };
    const top = y + h;
    if (kind === 2) {
      let r = 0;
      for (let ly = top; ly >= y + 2; ly--) {
        for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (Math.abs(dx) + Math.abs(dz) <= r + (r > 1 ? 1 : 0)) leaf(x + dx, ly, z + dz);
        r = r >= 2 ? ((top - ly) & 1 ? 1 : 2) : r + 1;
      }
      leaf(x, top + 1, z);
    } else {
      const R = kind === 3 ? 3 : 2;
      for (let ly = top - 3; ly <= top; ly++) {
        const rad = ly >= top - 1 ? R - 1 : R;
        for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) {
          if (Math.abs(dx) === rad && Math.abs(dz) === rad && (ly === top || this.rng.chance(0.5))) continue;
          leaf(x + dx, ly, z + dz);
        }
      }
    }
    for (let i = 0; i < h; i++) this.setBlock(x, y + i, z, LOG);
    return true;
  }

  private tickLeafDecay(): void {
    if (!this.leafDecayQueue.length) return;
    const keep: [number, number, number, number][] = [];
    let n = 0;
    for (const item of this.leafDecayQueue) {
      if (item[3] > this.tickCount || n > 40) { keep.push(item); continue; }
      n++;
      const [x, y, z] = item;
      const v = this.get(x, y, z);
      if (getBlock(v).render !== 'leaves' || blockMeta(v) !== 0) continue;
      if (this.hasLogNear(x, y, z)) continue;
      this.setBlock(x, y, z, 0);
      this.emit({ e: 'particles', k: 'break', x: x + 0.5, y: y + 0.5, z: z + 0.5, d: v });
      this.spawnDrops(x, y, z, v, null, true);
    }
    this.leafDecayQueue = keep;
  }

  private skyExposed(x: number, y: number, z: number): boolean {
    for (let yy = Math.floor(y) + 1; yy < WORLD_HEIGHT; yy++) {
      const v = this.get(Math.floor(x), yy, Math.floor(z));
      if (getBlock(v).opaque) return false;
    }
    return true;
  }

  private lightNear(x: number, y: number, z: number, r: number): boolean {
    for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (LIGHT_EMIT[blockId(this.get(x + dx, y + dy, z + dz))] >= 10) return true;
    }
    return false;
  }

  private isDark(x: number, y: number, z: number): boolean {
    if (this.skyExposed(x, y, z)) return this.isNight() && !this.lightNear(x, y, z, 5);
    return !this.lightNear(x, y, z, 6);
  }

  private spawnCycle(): void {
    const ps = [...this.players.values()].filter((p) => !p.dead);
    if (!ps.length) return;
    for (const e of [...this.entities.values()]) {
      if (e.kind !== 'mob') continue;
      const def = MOBS[e.type as MobType];
      if (def.hostile && this.difficulty === 'peaceful') { this.entities.delete(e.id); this.emit({ e: 'remove', id: e.id, why: 'despawn' }); continue; }
      let near = Infinity;
      for (const p of ps) near = Math.min(near, Math.hypot(p.x - e.x, p.z - e.z));
      const loaded = this.store.isLoaded(Math.floor(e.x), Math.floor(e.z));
      if (!loaded || near > (def.hostile ? 72 : 110) || (def.hostile && near > 36 && e.age > 600 && this.rng.chance(0.02))) {
        this.entities.delete(e.id);
        this.emit({ e: 'remove', id: e.id, why: 'despawn' });
      }
    }
    for (const p of ps) {
      let passive = 0, hostile = 0;
      for (const e of this.entities.values()) {
        if (e.kind !== 'mob') continue;
        if (Math.hypot(e.x - p.x, e.z - p.z) > 64) continue;
        if (MOBS[e.type as MobType].hostile) hostile++; else passive++;
      }
      if (passive < 8 && this.rng.chance(0.08)) this.trySpawn(p, false);
      if (hostile < HOSTILE_CAP[this.difficulty] && this.rng.chance(0.5)) this.trySpawn(p, true);
    }
  }

  private trySpawn(p: SimPlayer, hostile: boolean): void {
    const ang = this.rng.next() * Math.PI * 2;
    const dist = 24 + this.rng.next() * 20;
    const x = Math.floor(p.x + Math.cos(ang) * dist), z = Math.floor(p.z + Math.sin(ang) * dist);
    if (!this.store.isLoaded(x, z)) return;
    for (const op of this.players.values()) if (Math.hypot(op.x - x, op.z - z) < 20) return;
    let y = -1;
    const underground = hostile && this.rng.chance(0.55);
    if (underground) {
      const top = Math.min(WORLD_HEIGHT - 3, Math.floor(p.y) + 16);
      for (let t = 0; t < 8; t++) {
        const yy = 4 + this.rng.int(Math.max(1, top - 4));
        if (standable(this.store, x, yy, z, true) && !this.skyExposed(x, yy, z)) { y = yy; break; }
      }
    } else {
      for (let yy = WORLD_HEIGHT - 2; yy > 1; yy--) {
        const v = this.get(x, yy, z);
        if (isSolid(v) || blockId(v) === B.WATER || blockId(v) === B.LAVA) { y = yy + 1; break; }
      }
      if (y > 0 && !standable(this.store, x, y, z, true)) y = -1;
    }
    if (y < 0) return;
    const ground = blockId(this.get(x, y - 1, z));
    if (hostile) {
      if (this.difficulty === 'peaceful') return;
      if (!this.isDark(x, y, z)) return;
      const r = this.rng.next();
      const type: MobType = r < 0.45 ? 'hollowed' : r < 0.78 ? 'rattlebone' : 'duskweaver';
      if (type === 'duskweaver' && !standable(this.store, x + 1, y, z, false)) return;
      this.spawnMob(type, x + 0.5, y, z + 0.5);
    } else {
      if (ground !== B.GRASS && ground !== B.SNOWY_GRASS) return;
      if (!this.skyExposed(x, y, z)) return;
      const type = PASSIVE_TYPES[this.rng.int(PASSIVE_TYPES.length)];
      const n = 1 + this.rng.int(3);
      for (let i = 0; i < n; i++) {
        const ox = x + this.rng.int(3) - 1, oz = z + this.rng.int(3) - 1;
        if (standable(this.store, ox, y, oz, true)) this.spawnMob(type, ox + 0.5, y, oz + 0.5);
      }
    }
  }

  private nearestPlayer(e: Entity, range: number, survivalOnly: boolean): SimPlayer | null {
    let best: SimPlayer | null = null, bd = range;
    for (const p of this.players.values()) {
      if (p.dead || (survivalOnly && p.mode !== 'survival')) continue;
      const d = Math.hypot(p.x - e.x, p.y - e.y, p.z - e.z);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  private lineOfSight(e: Entity, p: SimPlayer): boolean {
    const ox = e.x, oy = e.y + e.h * 0.85, oz = e.z;
    const dx = p.x - ox, dy = p.y + 1.5 - oy, dz = p.z - oz;
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.5) return true;
    const hit = raycast(this.store, ox, oy, oz, dx / len, dy / len, dz / len, len);
    return !hit || !isSolid(hit.value);
  }

  private tickEntity(e: Entity): void {
    e.age++;
    if (e.hurt > 0) e.hurt--;
    if (!this.store.isLoaded(Math.floor(e.x), Math.floor(e.z))) return;
    if (e.kind === 'item') return this.tickItem(e);
    if (e.kind === 'arrow') return this.tickArrow(e);
    this.tickMob(e);
  }

  private tickItem(e: Entity): void {
    if (e.age > 6000) { this.entities.delete(e.id); this.emit({ e: 'remove', id: e.id, why: 'despawn' }); return; }
    const med = sampleMedium(this.store, e.x, e.y, e.z, e.hw, e.h, 0.1);
    if (med.water) { e.vy = Math.min(e.vy + 22 * DT, 1.5); e.vx *= 0.9; e.vz *= 0.9; }
    else e.vy -= 18 * DT;
    if (med.lava) { this.entities.delete(e.id); this.emit({ e: 'remove', id: e.id, why: 'despawn' }); this.emit({ e: 'particles', k: 'smoke', x: e.x, y: e.y, z: e.z }); return; }
    moveBody(e, e.vx * DT, e.vy * DT, e.vz * DT, this.store);
    const fr = e.onGround ? 0.6 : 0.98;
    e.vx *= fr; e.vz *= fr;
    if (e.pickupDelay! > 0) e.pickupDelay!--;
    if (this.tickCount % 20 === e.id % 20) {
      for (const o of this.entities.values()) {
        if (o === e || o.kind !== 'item' || !sameKind(o.item!, e.item!)) continue;
        if (Math.abs(o.x - e.x) < 1 && Math.abs(o.y - e.y) < 0.6 && Math.abs(o.z - e.z) < 1) {
          const max = getItem(e.item!.id)?.maxStack ?? 64;
          if (e.item!.count + o.item!.count <= max) {
            e.item!.count += o.item!.count;
            this.entities.delete(o.id);
            this.emit({ e: 'remove', id: o.id, why: 'despawn' });
          }
        }
      }
    }
    if (e.pickupDelay! > 0) return;
    for (const p of this.players.values()) {
      if (p.dead) continue;
      if (Math.abs(p.x - e.x) < 1.3 && Math.abs(p.z - e.z) < 1.3 && e.y > p.y - 0.8 && e.y < p.y + 2.2) {
        const before = e.item!.count;
        const left = giveItem(p.inv, e.item!);
        if (left === before) continue;
        this.emit({ e: 'sound', s: 'item.pickup', x: e.x, y: e.y, z: e.z });
        this.emit({ e: 'inv', p });
        if (left <= 0) { this.entities.delete(e.id); this.emit({ e: 'remove', id: e.id, why: 'pickup', by: p.id }); return; }
        e.item!.count = left;
      }
    }
  }

  private tickArrow(e: Entity): void {
    if (e.age > 400) { this.entities.delete(e.id); this.emit({ e: 'remove', id: e.id, why: 'despawn' }); return; }
    if (e.stuck !== undefined) {
      if (++e.stuck > 60) { this.entities.delete(e.id); this.emit({ e: 'remove', id: e.id, why: 'despawn' }); }
      return;
    }
    e.vy -= 20 * DT;
    const sp = Math.hypot(e.vx, e.vy, e.vz);
    const step = sp * DT;
    const dx = e.vx / sp, dy = e.vy / sp, dz = e.vz / sp;
    for (const p of this.players.values()) {
      if (p.dead || p.mode === 'creative') continue;
      for (let s = 0; s <= 4; s++) {
        const t = (s / 4) * step;
        const ax = e.x + dx * t, ay = e.y + dy * t, az = e.z + dz * t;
        if (Math.abs(ax - p.x) < 0.45 && Math.abs(az - p.z) < 0.45 && ay > p.y && ay < p.y + 1.85) {
          this.damage(p, Math.max(1, Math.round((e.dmg ?? 3) * DIFF_DMG[this.difficulty])), 'arrow', e.x - e.vx, e.z - e.vz);
          this.entities.delete(e.id);
          this.emit({ e: 'remove', id: e.id, why: 'hit' });
          return;
        }
      }
    }
    const hit = raycast(this.store, e.x, e.y, e.z, dx, dy, dz, step);
    if (hit && isSolid(hit.value)) {
      e.x = hit.hx - dx * 0.1; e.y = hit.hy - dy * 0.1; e.z = hit.hz - dz * 0.1;
      e.vx = e.vy = e.vz = 0;
      e.stuck = 0;
      this.emit({ e: 'sound', s: 'arrow.hit', x: e.x, y: e.y, z: e.z });
      return;
    }
    e.x += e.vx * DT; e.y += e.vy * DT; e.z += e.vz * DT;
    e.yaw = Math.atan2(-e.vx, -e.vz);
  }

  private tickMob(e: Entity): void {
    if (this.game?.tickNpc(e)) return;
    const def = MOBS[e.type as MobType];
    const med = sampleMedium(this.store, e.x, e.y, e.z, e.hw, e.h, e.h * 0.8);
    e.inWater = med.water;
    if (med.lava) { e.fire = 160; if (e.age % 10 === 0) this.hurtMob(e, 4, null, 0, 0); }
    if (def.burnsInDay && this.dayFactor() > 0.6 && this.weather === 'clear' && !med.water && e.age % 20 === 0 && this.skyExposed(e.x, e.y + e.h, e.z)) e.fire = 100;
    if (med.water) e.fire = 0;
    if (e.fire > 0) { e.fire--; if (e.fire % 20 === 0) this.hurtMob(e, 1, null, 0, 0); if (!this.entities.has(e.id)) return; }
    if (med.cactus && e.age % 10 === 0) { this.hurtMob(e, 1, null, 0, 0); if (!this.entities.has(e.id)) return; }
    if (e.y < -16) { this.entities.delete(e.id); this.emit({ e: 'remove', id: e.id, why: 'despawn' }); return; }
    if (e.attackCd! > 0) e.attackCd!--;
    if (e.provoked! > 0) e.provoked!--;
    let goalX: number | null = null, goalZ: number | null = null, speed = def.speed;
    let flags = 0;
    if (def.hostile) {
      const aggressive = e.type !== 'duskweaver' || e.provoked! > 0 || this.isDark(Math.floor(e.x), Math.floor(e.y), Math.floor(e.z));
      let target = e.target ? this.players.get(e.target) : undefined;
      if (target && (target.dead || target.mode !== 'survival' || Math.hypot(target.x - e.x, target.z - e.z) > 32)) { target = undefined; e.target = null; }
      if (!target && aggressive && e.age % 10 === 0) {
        const near = this.nearestPlayer(e, 16, true);
        if (near && this.lineOfSight(e, near)) { e.target = near.id; target = near; }
      }
      if (target && this.difficulty !== 'peaceful') {
        flags |= 16;
        const dx = target.x - e.x, dz = target.z - e.z;
        const dist = Math.hypot(dx, dz);
        const dy = target.y - e.y;
        e.yaw = Math.atan2(-dx, -dz);
        if (def.ranged) {
          const los = e.age % 5 === 0 ? this.lineOfSight(e, target) : true;
          if (dist > 10 || !los) { goalX = target.x; goalZ = target.z; }
          else if (dist < 5) { goalX = e.x - dx; goalZ = e.z - dz; speed *= 0.9; }
          else { e.path = null; }
          if (dist < 14 && los && e.attackCd! <= 0) {
            e.attackCd = 40 + this.rng.int(20);
            this.shootArrow(e, target);
            flags |= 4;
          }
        } else {
          goalX = target.x; goalZ = target.z;
          if (e.type === 'duskweaver' && dist < 4 && dist > 1.5 && e.onGround && e.attackCd! <= 0 && this.rng.chance(0.15)) {
            e.vy = 6.5; e.vx = (dx / dist) * 7; e.vz = (dz / dist) * 7;
          }
          if (dist < 1.1 + e.hw && Math.abs(dy) < 1.6 && e.attackCd! <= 0) {
            e.attackCd = 20;
            flags |= 4;
            this.damage(target, Math.max(1, Math.round(def.damage * DIFF_DMG[this.difficulty] * 2) / 2), e.type, e.x, e.z);
          }
        }
      }
    } else {
      if (e.panic! > 0) {
        e.panic!--;
        const att = e.attacker ? this.players.get(e.attacker) : undefined;
        if (att) { goalX = e.x + (e.x - att.x) * 2; goalZ = e.z + (e.z - att.z) * 2; }
        speed *= 1.8;
      } else if (def.lure && e.age % 10 === 0) {
        const near = this.nearestPlayer(e, 9, false);
        const held = near ? heldStack(near.inv) : null;
        if (near && held && def.lure.includes(held.id)) e.target = near.id; else e.target = null;
      }
      const t = e.target ? this.players.get(e.target) : undefined;
      if (t && !e.panic) {
        const d = Math.hypot(t.x - e.x, t.z - e.z);
        if (d > 2) { goalX = t.x; goalZ = t.z; } else { e.path = null; e.yaw = Math.atan2(-(t.x - e.x), -(t.z - e.z)); }
      }
    }
    if (goalX === null && !def.hostile || goalX === null && !e.target) {
      if (--e.wanderT! <= 0) {
        e.wanderT = 80 + this.rng.int(200);
        if (this.rng.chance(0.6)) {
          const wx = Math.floor(e.x + (this.rng.next() - 0.5) * 14), wz = Math.floor(e.z + (this.rng.next() - 0.5) * 14);
          e.path = findPath(this.store, e.x, e.y, e.z, wx, e.y, wz, e.h > 1, 160);
          e.pathT = 200;
        }
      }
    } else if (goalX !== null && goalZ !== null) {
      if (--e.pathT! <= 0 || !e.path || e.path.length === 0) {
        e.path = findPath(this.store, e.x, e.y, e.z, goalX, e.y, goalZ, e.h > 1, 260);
        e.pathT = 20;
      }
    }
    let wantX = 0, wantZ = 0;
    if (e.path && e.path.length) {
      const n = e.path[0];
      const dx = n.x + 0.5 - e.x, dz = n.z + 0.5 - e.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.35) e.path.shift();
      else {
        wantX = (dx / d) * speed; wantZ = (dz / d) * speed;
        e.yaw = Math.atan2(-dx, -dz);
        if (n.y > Math.floor(e.y) && e.onGround) e.vy = 8.2;
      }
    } else if (goalX !== null && goalZ !== null && def.hostile) {
      const dx = goalX - e.x, dz = goalZ - e.z;
      const d = Math.hypot(dx, dz) || 1;
      if (d > 0.8) { wantX = (dx / d) * speed; wantZ = (dz / d) * speed; }
    }
    const acc = e.onGround ? 0.35 : med.water ? 0.15 : 0.06;
    e.vx += (wantX - e.vx) * acc;
    e.vz += (wantZ - e.vz) * acc;
    if (med.water) {
      e.vy = Math.min(e.vy + 24 * DT, 2.2);
      e.vx *= 0.9; e.vz *= 0.9;
      flags |= 8;
    } else e.vy = Math.max(e.vy - 28 * DT, -40);
    if (e.hitH && (wantX || wantZ)) {
      if (def.climbs) e.vy = 3.5;
      else if (e.onGround) e.vy = 8.2;
    }
    moveBody(e, e.vx * DT, e.vy * DT, e.vz * DT, this.store);
    if (e.hurt > 0) flags |= 1;
    if (e.fire > 0) flags |= 2;
    e.flags = flags;
  }

  private shootArrow(e: Entity, t: SimPlayer): void {
    const ox = e.x, oy = e.y + e.h * 0.85, oz = e.z;
    const dx = t.x - ox, dz = t.z - oz, dy = t.y + 1.2 - oy;
    const dist = Math.hypot(dx, dz);
    const speed = 22;
    const time = dist / speed;
    const inacc = { easy: 0.12, normal: 0.07, hard: 0.035, peaceful: 0 }[this.difficulty];
    const a: Entity = {
      id: this.allocId(), kind: 'arrow', type: 'arrow', x: ox + (dx / dist) * 0.6, y: oy, z: oz + (dz / dist) * 0.6,
      vx: (dx / dist) * speed + (this.rng.next() - 0.5) * speed * inacc, vy: dy / time + 10 * time + (this.rng.next() - 0.5) * speed * inacc,
      vz: (dz / dist) * speed + (this.rng.next() - 0.5) * speed * inacc,
      hw: 0.1, h: 0.1, onGround: false, hitH: false, hitCeil: false, yaw: e.yaw, health: 1, maxHealth: 1, hurt: 0, age: 0, fire: 0, flags: 0,
      shooter: e.id, dmg: 3,
    };
    this.entities.set(a.id, a);
    this.emit({ e: 'spawn', ent: a });
    this.emit({ e: 'sound', s: 'arrow.shoot', x: ox, y: oy, z: oz });
  }

  setTime(ticks: number): void {
    this.time = Math.max(0, Math.floor(ticks));
    this.emit({ e: 'time' });
  }

  command(p: SimPlayer, raw: string): string {
    const parts = raw.trim().replace(/^\//, '').split(/\s+/);
    const cmd = (parts[0] ?? '').toLowerCase();
    const allowed = p.op || (this.settings.cheats && p.mode === 'creative');
    const need = () => 'You do not have permission for that command.';
    if (this.game) { const r = this.game.command(p, [cmd, ...parts.slice(1)]); if (r !== null) return r; }
    switch (cmd) {
      case 'help':
        return 'Commands: /time set day|noon|night|midnight|<n>, /time cycle on|off, /weather clear|rain|thunder, /gamemode survival|creative, /give <item> [n], /tp <x> <y> <z>, /spawn, /setspawn, /summon <creature> [n], /pos1, /pos2, /fill <block> [hollow|outline], /replace <from> <to>, /clearsel, /seed, /kill';
      case 'seed': return `Seed: ${this.seed}`;
      case 'time': {
        if (!allowed) return need();
        if (parts[1] === 'cycle') { this.settings.dayCycle = parts[2] !== 'off'; return `Day cycle ${this.settings.dayCycle ? 'on' : 'off'}.`; }
        const named: Record<string, number> = { day: 1000, noon: 6000, sunset: 12000, night: 13000, midnight: 18000, sunrise: 23000 };
        const v = parts[2] ?? parts[1];
        const n = named[v] ?? Number(v);
        if (!Number.isFinite(n)) return 'Usage: /time set day|noon|night|midnight|<ticks>';
        const base = Math.floor(this.time / TICKS_PER_DAY) * TICKS_PER_DAY;
        this.setTime(base + (n % TICKS_PER_DAY) + (n % TICKS_PER_DAY < this.time % TICKS_PER_DAY ? TICKS_PER_DAY : 0));
        return `Time set to ${v}.`;
      }
      case 'weather': {
        if (!allowed) return need();
        const w = parts[1] as Weather;
        if (!['clear', 'rain', 'thunder'].includes(w)) return 'Usage: /weather clear|rain|thunder';
        this.setWeather(w);
        return `Weather set to ${w}.`;
      }
      case 'gamemode': case 'gm': {
        if (!p.op && !this.settings.cheats) return need();
        const m = parts[1]?.startsWith('c') ? 'creative' : parts[1]?.startsWith('s') ? 'survival' : null;
        if (!m) return 'Usage: /gamemode survival|creative';
        p.mode = m;
        this.emit({ e: 'mode', p });
        this.emit({ e: 'vitals', p });
        return `Game mode set to ${m}.`;
      }
      case 'give': {
        if (!allowed) return need();
        const key = parts[1];
        const it = [...Array(400).keys()].map((i) => getItem(i)).find((d) => d && (d.key === key || d.name.toLowerCase() === key?.toLowerCase()));
        if (!it) return `Unknown item: ${key}`;
        const n = Math.max(1, Math.min(640, Number(parts[2] ?? 1) || 1));
        let left = n;
        while (left > 0) {
          const c = Math.min(left, it.maxStack);
          const rem = giveItem(p.inv, { id: it.id, count: c });
          if (rem > 0) this.invCtx(p).drop({ id: it.id, count: rem });
          left -= c;
        }
        this.emit({ e: 'inv', p });
        return `Gave ${n} ${it.name}.`;
      }
      case 'tp': {
        if (!allowed) return need();
        const [x, y, z] = parts.slice(1, 4).map(Number);
        if (![x, y, z].every(Number.isFinite)) return 'Usage: /tp <x> <y> <z>';
        p.x = x; p.y = y; p.z = z; p.peakY = y;
        this.emit({ e: 'tp', p });
        return `Teleported to ${x} ${y} ${z}.`;
      }
      case 'spawn': {
        if (p.mode === 'survival' && !p.op && !this.settings.cheats) return need();
        p.x = p.spawn.x; p.y = p.spawn.y; p.z = p.spawn.z; p.peakY = p.y;
        this.makeSafe(p);
        this.emit({ e: 'tp', p });
        return 'Returned to spawn.';
      }
      case 'setspawn': {
        p.spawn = { x: p.x, y: p.y, z: p.z };
        return 'Personal spawn point set here.';
      }
      case 'summon': {
        if (!allowed) return need();
        const t = (parts[1] ?? '').toLowerCase() as MobType;
        if (!MOBS[t] || MOBS[t].npc) return `Unknown creature. Try: ${Object.keys(MOBS).filter((k) => !MOBS[k as MobType].npc).join(', ')}`;
        if (!this.authoritative) return '';
        const n = Math.max(1, Math.min(10, Number(parts[2] ?? 1) || 1));
        for (let i = 0; i < n; i++) {
          const sx = Math.floor(p.x - Math.sin(p.yaw) * 3.5) + (i % 3) - (n > 1 ? 1 : 0), sz = Math.floor(p.z - Math.cos(p.yaw) * 3.5) + Math.floor(i / 3);
          let sy = Math.floor(p.y) + 3;
          while (sy > Math.floor(p.y) - 6 && !isSolid(this.get(sx, sy - 1, sz))) sy--;
          while (sy < WORLD_HEIGHT - 2 && isSolid(this.get(sx, sy, sz))) sy++;
          this.spawnMob(t, sx + 0.5, sy, sz + 0.5);
        }
        return `Summoned ${n} ${MOBS[t].name}.`;
      }
      case 'kill': this.damage(p, 1000, 'kill', p.x, p.z, false, true); return '';
      case 'pos1': case 'pos2': {
        if (!allowed) return need();
        const i = cmd === 'pos1' ? 0 : 1;
        const xyz = parts.length >= 4 ? parts.slice(1, 4).map(Number) : [Math.floor(p.x), Math.floor(p.y) - 1, Math.floor(p.z)];
        if (!xyz.every(Number.isFinite)) return 'Usage: /pos1 [x y z]';
        p.sel[i] = xyz.map(Math.floor);
        return `Corner ${i + 1} set to ${p.sel[i]!.join(' ')}.`;
      }
      case 'clearsel': p.sel = [null, null]; return 'Selection cleared.';
      case 'fill': case 'replace': {
        if (!allowed) return need();
        const [a, b] = p.sel;
        if (!a || !b) return 'Set both corners first with /pos1 and /pos2 (or the World Shaper panel).';
        const vol = (Math.abs(a[0] - b[0]) + 1) * (Math.abs(a[1] - b[1]) + 1) * (Math.abs(a[2] - b[2]) + 1);
        if (vol > 32768) return `Selection too large (${vol} blocks, max 32768).`;
        const lookup = (k?: string) => {
          if (!k) return -1;
          if (k === 'air') return 0;
          const d = BLOCKS.find((bd) => bd && (bd.key === k || bd.name.toLowerCase() === k.toLowerCase()));
          return d ? d.id : -1;
        };
        const target = lookup(cmd === 'fill' ? parts[1] : parts[2]);
        const from = cmd === 'replace' ? lookup(parts[1]) : -1;
        if (target < 0 || (cmd === 'replace' && from < 0)) return 'Unknown block.';
        const mode = cmd === 'fill' ? parts[2] : undefined;
        const [x0, x1] = [Math.min(a[0], b[0]), Math.max(a[0], b[0])];
        const [y0, y1] = [Math.max(0, Math.min(a[1], b[1])), Math.min(WORLD_HEIGHT - 1, Math.max(a[1], b[1]))];
        const [z0, z1] = [Math.min(a[2], b[2]), Math.max(a[2], b[2])];
        let n = 0;
        for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
          if (!this.store.isLoaded(x, z)) continue;
          const edge = x === x0 || x === x1 || y === y0 || y === y1 || z === z0 || z === z1;
          let v = target;
          if (cmd === 'replace' && blockId(this.get(x, y, z)) !== from) continue;
          if (mode === 'hollow' && !edge) v = 0;
          if (mode === 'outline' && !edge) continue;
          if (this.get(x, y, z) !== v) { this.store.setBlock(x, y, z, v); this.emit({ e: 'block', x, y, z, v, old: -1 }); n++; }
        }
        return `${n} blocks changed.`;
      }
      default:
        return `Unknown command: /${cmd}. Try /help.`;
    }
  }
}

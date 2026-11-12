import { CHUNK_SIZE, WORLD_HEIGHT, TICKS_PER_DAY, timeRate, REACH_CREATIVE, REACH_SURVIVAL, GameMode, Difficulty } from '../constants';
import {
  B, BLOCKS, getBlock, blockId, blockMeta, makeBlock, isSolid, isReplaceable, blockBox, facingFromYaw,
  FACING_DIRS, DOOR_OPEN, DOOR_UPPER, doorMeta, doorFacing, LIGHT_EMIT, OPAQUE,
} from '../blocks';
import { getItem, I, fuelSeconds } from '../items';
import {
  PlayerInv, ItemStack, InvOp, applyInvOp, emptyInv, giveItem, heldStack, damageHeld, consumeHeld,
  armorPoints, damageArmor, allStacks, CHEST_SIZE, FURNACE_SIZE, invHash, sameKind, cloneStack,
} from '../inventory';
import { findSmelt, Recipe } from '../crafting';
import { attackStats, attackCharge, scaledDamage, armorReduce, armorToughness } from './combat';
import { PROFESSIONS, OFFERS, unlocked, performTrade, tradeXp, levelFor, Profession } from '../trades';
import { BlockReader, Body, moveBody, raycast, boxCollides, sampleMedium } from '../physics';
import { Rng } from '../rng';
import { WorldGenerator } from '../worldgen/WorldGenerator';
import { MOBS, MobType, MobDef, PASSIVE_TYPES, HOSTILE_TYPES } from './mobs';
import { findPath, standable, PathNode } from './pathfind';
import { tickFluid, fluidDelay, FluidWorld } from './fluids';
import { ChunkInfo, chunkNum } from './light';

export interface WorldStore extends BlockReader {
  setBlock(x: number, y: number, z: number, v: number): void;
  isLoaded(x: number, z: number): boolean;
  raw?(cx: number, cz: number): Uint16Array | null;
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
  t: { lava: number; suffocate?: number; drown: number; cactus: number; void: number; starve: number; regen: number; fire: number };
  lastAttack: number; lastEat: number; lastMove: number; lastShot?: number; wasFire?: boolean; lastSwing?: number; lastHurt?: number;
  op: boolean;
  sel: [number[] | null, number[] | null];
  homes?: Record<string, { x: number; y: number; z: number }>;
  back?: { x: number; y: number; z: number };
  vanished?: boolean;
  skin?: { png: string; slim: boolean } | null;
}

export type EntityKind = 'mob' | 'item' | 'arrow';
export type ScreenType = 'chest' | 'furnace' | 'workbench' | 'shop' | 'trade';

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
  shooterP?: string;
  pickup?: boolean;
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
  love?: number;
  breedCd?: number;
  baby?: number;
  prof?: number;
  vxp?: number;
  uses?: number[];
  home?: [number, number];
  vid?: string;
  vc?: [number, number];
  tradeWith?: string;
  restockAt?: number;
  lastHurt?: number;
  noAct?: number;
  dim?: boolean;
  wanderR?: number;
  work?: [number, number];
  bed?: [number, number];
  doors?: [number, number, number, number][];
}

export type BlockEntity =
  | { type: 'chest'; items: (ItemStack | null)[] }
  | { type: 'furnace'; items: (ItemStack | null)[]; burn: number; burnMax: number; cook: number; xp: number };

export type Weather = 'clear' | 'rain' | 'thunder';

export type SimEvent =
  | { e: 'block'; x: number; y: number; z: number; v: number; old: number; src?: string }
  | { e: 'sound'; s: string; x: number; y: number; z: number; vol?: number; pitch?: number; src?: string; to?: string }
  | { e: 'particles'; k: 'break' | 'hurt' | 'smoke' | 'splash' | 'xp' | 'crit' | 'heart' | 'sweep'; x: number; y: number; z: number; d?: number; src?: string }
  | { e: 'spawn'; ent: Entity }
  | { e: 'remove'; id: number; why: 'death' | 'pickup' | 'despawn' | 'hit'; by?: string }
  | { e: 'vitals'; p: SimPlayer }
  | { e: 'inv'; p: SimPlayer }
  | { e: 'container'; key: string }
  | { e: 'screen'; p: SimPlayer }
  | { e: 'hurt'; p: SimPlayer; amount: number; cause: string; fx: number; fz: number; kb?: number }
  | { e: 'death'; p: SimPlayer; msg: string }
  | { e: 'respawn'; p: SimPlayer }
  | { e: 'tp'; p: SimPlayer }
  | { e: 'msg'; text: string; kind: 'system' | 'death' | 'info' | 'error'; to?: string }
  | { e: 'lightning'; x: number; y: number; z: number }
  | { e: 'reject'; p: SimPlayer; x: number; y: number; z: number }
  | { e: 'weather'; w: Weather }
  | { e: 'time' }
  | { e: 'rules' }
  | { e: 'mode'; p: SimPlayer }
  | { e: 'crafted'; p: SimPlayer; recipe: Recipe; times: number }
  | { e: 'game'; state: unknown }
  | { e: 'title'; text: string; sub: string; to?: string }
  | { e: 'trade'; p: SimPlayer; v: Entity }
  | { e: 'chestLid'; x: number; y: number; z: number; n: number };

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

export interface SimSettings {
  pvp: boolean; cheats: boolean; guestsBuild: boolean; dayCycle: boolean; weatherCycle: boolean;
  simDistance?: number; randomTickSpeed?: number; mobSpawning?: boolean; mobCap?: number;
  maxHomes?: number; tpa?: boolean; allowMinimap?: boolean; allowCoords?: boolean;
}

const DT = 1 / 20;
const DIFF_DMG: Record<Difficulty, number> = { peaceful: 0, easy: 0.5, normal: 1, hard: 1.5 };
export const RULE_KEYS = ['simDistance', 'randomTickSpeed', 'mobSpawning', 'mobCap', 'maxHomes', 'tpa', 'allowMinimap', 'allowCoords'] as const;
export type RuleSet = Partial<Pick<SimSettings, (typeof RULE_KEYS)[number]>>;
export function ruleSnapshot(s: SimSettings): RuleSet {
  const out: Record<string, unknown> = {};
  for (const k of RULE_KEYS) if (s[k] !== undefined) out[k] = s[k];
  return out as RuleSet;
}

export function villagerPhase(time: number): 'idle' | 'work' | 'meet' | 'rest' {
  const t = ((time % 24000) + 24000) % 24000;
  if (t < 10) return 'rest';
  if (t < 2000) return 'idle';
  if (t < 9000) return 'work';
  if (t < 11000) return 'meet';
  if (t < 12000) return 'idle';
  return 'rest';
}

const MONSTER_CAP = 70;
const CREATURE_CAP = 10;
const SPAWN_RANGE = 128;
const MAX_NATURAL = 480;
const TICKABLE = new Uint8Array(256);
for (const id of [B.WHEAT, B.OAK_SAPLING, B.BIRCH_SAPLING, B.SPRUCE_SAPLING, B.JUNGLE_SAPLING, B.SUGAR_CANE, B.CACTUS, B.GRASS, B.SNOWY_GRASS, B.ICE]) TICKABLE[id] = 1;
const PLAYER_HW = 0.3, PLAYER_H = 1.8;

export function posKey(x: number, y: number, z: number): string { return `${x},${y},${z}`; }

export function chestPartner(store: { getBlock(x: number, y: number, z: number): number }, x: number, y: number, z: number): [number, number, number, boolean] | null {
  const v = store.getBlock(x, y, z);
  if (blockId(v) !== B.CHEST) return null;
  const f = blockMeta(v) & 3;
  const ax = f === 0 || f === 2 ? 1 : 0, az = 1 - ax;
  const same = (k: number) => { const w = store.getBlock(x + ax * k, y, z + az * k); return blockId(w) === B.CHEST && (blockMeta(w) & 3) === f; };
  let back = 0;
  while (back < 32 && same(-(back + 1))) back++;
  if (back % 2 === 0) return same(1) ? [x + ax, y, z + az, true] : null;
  return [x - ax, y, z - az, false];
}
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
  readonly info: ChunkInfo;
  readonly gen: WorldGenerator;
  difficulty: Difficulty;
  readonly emit: (ev: SimEvent) => void;
  readonly validateMoves: boolean;
  readonly authoritative: boolean;
  settings: SimSettings = { pvp: true, cheats: true, guestsBuild: true, dayCycle: true, weatherCycle: true };
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
    this.info = new ChunkInfo(o.store, (id) => TICKABLE[id] === 1);
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

  private timeAcc = 0;

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
    this.info.changed(x, y, z, old, v);
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
    if (nid === B.SAND || nid === B.GRAVEL) this.fallQueue.push([x, y, z, this.tickCount + 2]);
    const up = blockId(this.get(x, y + 1, z));
    if (up === B.SAND || up === B.GRAVEL) this.fallQueue.push([x, y + 1, z, this.tickCount + 2]);
  }

  private fallQueue: [number, number, number, number][] = [];

  private tickFalling(): void {
    if (!this.fallQueue.length) return;
    const due = this.fallQueue.filter((q) => q[3] <= this.tickCount).slice(0, 64);
    this.fallQueue = this.fallQueue.filter((q) => !due.includes(q));
    for (const [x, y, z] of due) {
      const v = this.get(x, y, z), id = blockId(v);
      if (id !== B.SAND && id !== B.GRAVEL) continue;
      if (!this.store.isLoaded(x, z)) continue;
      const below = this.get(x, y - 1, z);
      const bid = blockId(below), bd = getBlock(below);
      const passable = bid === 0 || bid === B.WATER || bid === B.LAVA || bd.render === 'cross' || bd.render === 'crop' || bd.render === 'torch';
      if (!passable) continue;
      if (y - 1 < 1) { this.setBlock(x, y, z, 0); continue; }
      if (bid !== 0 && bid !== B.WATER && bid !== B.LAVA) this.spawnDrops(x, y - 1, z, below, null, true);
      this.setBlock(x, y - 1, z, v);
      this.setBlock(x, y, z, 0);
    }
  }

  private leafDecayQueue: [number, number, number, number][] = [];
  private scheduleLeafDecay(x: number, y: number, z: number): void {
    for (let dy = -3; dy <= 4; dy++) for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) {
      const v = this.get(x + dx, y + dy, z + dz);
      if (getBlock(v).render === 'leaves' && blockMeta(v) === 0) {
        this.leafDecayQueue.push([x + dx, y + dy, z + dz, this.tickCount + 60 + this.rng.int(900)]);
      }
    }
  }

  private hasLogNear(x: number, y: number, z: number): boolean {
    const seen = new Set<string>([`${x},${y},${z}`]);
    let frontier: [number, number, number][] = [[x, y, z]];
    for (let step = 0; step < 6 && frontier.length; step++) {
      const next: [number, number, number][] = [];
      for (const [cx, cy, cz] of frontier) for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
        const nx = cx + dx, ny = cy + dy, nz = cz + dz, k = `${nx},${ny},${nz}`;
        if (seen.has(k)) continue;
        seen.add(k);
        const v = this.get(nx, ny, nz), id = blockId(v);
        if (id === B.OAK_LOG || id === B.BIRCH_LOG || id === B.SPRUCE_LOG || id === B.JUNGLE_LOG) return true;
        if (getBlock(v).render === 'leaves') next.push([nx, ny, nz]);
      }
      frontier = next;
    }
    return false;
  }

  useEntity(p: SimPlayer, entityId: number): boolean {
    const e = this.entities.get(entityId);
    if (!e || e.kind !== 'mob' || p.dead) return false;
    if (Math.hypot(e.x - p.x, e.z - p.z) > 6) return false;
    const def = MOBS[e.type as MobType];
    if (def?.trader) return this.openTrade(p, e);
    const held = heldStack(p.inv);
    if (!def?.lure || !held || !def.lure.includes(held.id)) return false;
    if (e.baby) { e.baby = Math.max(1, e.baby - 1200); }
    else if (e.love || e.breedCd) return false;
    else e.love = 600;
    if (p.mode === 'survival') { held.count--; if (held.count <= 0) p.inv.slots[p.inv.selected] = null; this.emit({ e: 'inv', p }); }
    this.emit({ e: 'particles', k: 'heart', x: e.x, y: e.y + e.h + 0.3, z: e.z });
    this.emit({ e: 'sound', s: 'mob.eat', x: e.x, y: e.y, z: e.z });
    e.persistent = true;
    return true;
  }

  openTrade(p: SimPlayer, e: Entity): boolean {
    if (e.health <= 0 || e.baby) return false;
    for (const o of this.players.values()) if (o !== p && o.screen.type === 'trade' && e.tradeWith === o.id) { this.emit({ e: 'msg', text: 'That villager is busy trading.', kind: 'info', to: p.id }); return false; }
    this.restock(e);
    e.tradeWith = p.id;
    this.openScreen(p, 'trade', Math.floor(e.x), Math.floor(e.y), Math.floor(e.z));
    this.emit({ e: 'trade', p, v: e });
    this.emit({ e: 'sound', s: 'villager.trade', x: e.x, y: e.y + 1.5, z: e.z });
    return true;
  }

  private restock(e: Entity): void {
    if (!e.uses) e.uses = [];
    if ((e.restockAt ?? 0) <= this.tickCount) { e.uses = []; e.restockAt = this.tickCount + 12000; }
  }

  trade(p: SimPlayer, entityId: number, index: number, times = 1): boolean {
    const e = this.entities.get(entityId);
    if (!e || p.dead || p.screen.type !== 'trade' || e.tradeWith !== p.id || !Number.isInteger(index)) return false;
    if (Math.hypot(e.x - p.x, e.z - p.z) > 8) return false;
    const prof = PROFESSIONS[e.prof ?? 0] as Profession;
    if (!unlocked(prof, e.vxp ?? 0).includes(index)) return false;
    const of = OFFERS[prof][index];
    this.restock(e);
    const uses = e.uses!;
    let done = 0;
    times = Math.max(1, Math.min(64, Math.floor(times) || 1));
    while (done < times && (uses[index] ?? 0) < of.max) {
      const left = performTrade(p.inv, of);
      if (!left) break;
      if (left.count > 0) this.spawnItem(p.x, p.y + 1.2, p.z, left);
      uses[index] = (uses[index] ?? 0) + 1;
      const before = levelFor(e.vxp ?? 0);
      e.vxp = (e.vxp ?? 0) + tradeXp(of);
      if (levelFor(e.vxp) > before) this.emit({ e: 'particles', k: 'xp', x: e.x, y: e.y + 2.1, z: e.z });
      if (p.mode === 'survival') this.giveXp(p, 3 + this.rng.int(4));
      done++;
    }
    if (!done) return false;
    this.emit({ e: 'inv', p });
    this.emit({ e: 'trade', p, v: e });
    this.emit({ e: 'sound', s: 'villager.yes', x: e.x, y: e.y + 1.5, z: e.z });
    return true;
  }

  locateVillage(x: number, z: number): { x: number; y: number; z: number } | null {
    let best: { x: number; y: number; z: number } | null = null, bd = Infinity;
    for (const v of this.gen.villagesNear(x, z, 2400)) {
      const d = Math.hypot(v.x - x, v.z - z);
      if (d < bd) { bd = d; best = { x: v.x, y: v.y, z: v.z }; }
    }
    return best;
  }

  private doorReader = { getBlock: (x: number, y: number, z: number): number => {
    const v = this.store.getBlock(x, y, z);
    return (v & 0xff) === B.OAK_DOOR ? 0 : v;
  } };

  private setDoor(x: number, y: number, z: number, open: boolean): boolean {
    let v = this.get(x, y, z);
    if (blockId(v) !== B.OAK_DOOR) return false;
    if (blockMeta(v) & DOOR_UPPER) { y--; v = this.get(x, y, z); if (blockId(v) !== B.OAK_DOOR) return false; }
    if (!!(blockMeta(v) & DOOR_OPEN) === open) return false;
    for (let yy = y; yy <= y + 1; yy++) {
      const dv = this.get(x, yy, z);
      if (blockId(dv) === B.OAK_DOOR) this.setBlock(x, yy, z, makeBlock(B.OAK_DOOR, blockMeta(dv) ^ DOOR_OPEN));
    }
    this.emit({ e: 'sound', s: open ? 'door.open' : 'door.close', x: x + 0.5, y: y + 0.5, z: z + 0.5 });
    return true;
  }

  private openDoorFor(e: Entity, x: number, y: number, z: number): void {
    for (let yy = y; yy <= y + 1; yy++) {
      if (blockId(this.get(x, yy, z)) !== B.OAK_DOOR) continue;
      const by = blockMeta(this.get(x, yy, z)) & DOOR_UPPER ? yy - 1 : yy;
      if (this.setDoor(x, by, z, true)) (e.doors ??= []).push([x, by, z, this.tickCount + 30]);
      else if (e.doors) for (const d of e.doors) if (d[0] === x && d[1] === by && d[2] === z) d[3] = this.tickCount + 30;
      return;
    }
  }

  private closeDoorsFor(e: Entity): void {
    e.doors = e.doors!.filter((d) => {
      if (d[3] > this.tickCount) return true;
      if (Math.abs(e.x - d[0] - 0.5) < 1.2 && Math.abs(e.z - d[2] - 0.5) < 1.2) return true;
      this.setDoor(d[0], d[1], d[2], false);
      return false;
    });
  }

  private populateVillages(p: SimPlayer): void {
    for (const v of this.gen.villagesNear(p.x, p.z, 64)) {
      if (!this.store.isLoaded(v.x, v.z)) continue;
      let count = 0;
      for (const e of this.entities.values()) if (e.vid === v.id) count++;
      const target = Math.min(8, v.homes.length);
      if (count >= target) continue;
      const n = count === 0 ? target : this.rng.chance(0.05) ? 1 : 0;
      for (let i = 0; i < n; i++) {
        const home = v.homes[(count + i) % v.homes.length];
        if (!this.store.isLoaded(home.x, home.z)) continue;
        let y = -1;
        for (let yy = Math.min(WORLD_HEIGHT - 3, v.y + 12); yy > Math.max(2, v.y - 12); yy--) {
          if (standable(this.store, home.x, yy, home.z, true)) { y = yy; break; }
        }
        if (y < 0) continue;
        const e = this.spawnMob('villager', home.x + 0.5, y, home.z + 0.5);
        e.prof = Math.max(0, PROFESSIONS.indexOf(home.prof));
        e.vid = v.id; e.home = [home.x + 0.5, home.z + 0.5]; e.vc = [v.x + 0.5, v.z + 0.5];
        if (home.ix !== undefined && home.iz !== undefined) { e.bed = [home.ix + 0.5, home.iz + 0.5]; e.work = e.bed; }
        e.vxp = 0; e.uses = []; e.persistent = true;
        e.flags = (e.prof + 1) << 9;
      }
    }
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
      if (fall > 3.0001) this.damage(p, Math.ceil(fall - 3), 'fall', p.x, p.z, false);
      p.peakY = y;
    } else p.peakY = Math.max(p.peakY, y);
    if (p.screen.type && !this.inReach(p, p.screen.x, p.screen.y, p.screen.z, 3)) this.closeScreen(p);
    return true;
  }

  damage(p: SimPlayer, amount: number, cause: string, fx: number, fz: number, knock = true, bypassArmor = false, killer?: string, kb = 0.4): void {
    if (p.dead || p.mode === 'creative' || amount <= 0) return;
    if (this.game) { if (this.game.protectedPlayer(p)) return; amount *= this.game.damageScale(p); }
    const exempt = cause === 'void' || cause === 'drown' || cause === 'starve';
    if (p.hurtCd > 0 && !exempt) {
      if (amount <= (p.lastHurt ?? 0)) return;
      const add = amount - (p.lastHurt ?? 0);
      p.lastHurt = amount;
      amount = add;
      knock = false;
    } else { p.lastHurt = amount; p.hurtCd = 10; }
    let dmg = amount;
    if (!bypassArmor) {
      const ap = Math.min(20, armorPoints(p.inv));
      dmg = armorReduce(p.inv, amount, armorToughness(p.inv));
      if (ap > 0) { damageArmor(p.inv, amount); this.emit({ e: 'inv', p }); }
    }
    dmg = Math.round(dmg * 100) / 100;
    if (dmg <= 0) return;
    p.health = Math.max(0, Math.round((p.health - dmg) * 100) / 100);
    p.exh += 0.1;
    this.emit({ e: 'hurt', p, amount: dmg, cause, fx: knock ? fx : p.x, fz: knock ? fz : p.z, kb: knock ? kb : 0 });
    this.emit({ e: 'sound', s: 'player.hurt', x: p.x, y: p.y + 1, z: p.z });
    this.emit({ e: 'vitals', p });
    if (p.health <= 0) this.kill(p, cause, killer);
  }

  private kill(p: SimPlayer, cause: string, killer?: string): void {
    p.dead = true;
    p.back = { x: p.x, y: p.y, z: p.z };
    p.dig = null;
    const msgs: Record<string, string> = {
      fall: 'hit the ground too hard', lava: 'tried to swim in lava', drown: 'ran out of air', suffocate: 'suffocated in a wall', cactus: 'was pricked to death',
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
    let split: ((joined: (ItemStack | null)[]) => void) | null = null;
    if (p.screen.type === 'chest' || p.screen.type === 'furnace') {
      const be = this.getBlockEntity(p.screen.x, p.screen.y, p.screen.z);
      if (be && be.type === p.screen.type) { container = be.items; kind = be.type; }
      const pr = be && be.type === 'chest' ? chestPartner(this.store, p.screen.x, p.screen.y, p.screen.z) : null;
      const other = pr ? this.ensureBlockEntity(pr[0], pr[1], pr[2]) : null;
      if (be && other && other.type === 'chest') {
        const [a, b] = pr![3] ? [be, other] : [other, be];
        container = [...a.items, ...b.items];
        split = (j) => { for (let i = 0; i < a.items.length; i++) a.items[i] = j[i]; for (let i = 0; i < b.items.length; i++) b.items[i] = j[a.items.length + i]; };
      }
    }
    return {
      inv: p.inv, container, containerKind: kind, creative: p.mode === 'creative', split,
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
    if (ctx.split && ctx.container) ctx.split(ctx.container);
    if (ok) {
      if (ctx.container) {
        const k = posKey(p.screen.x, p.screen.y, p.screen.z);
        this.emit({ e: 'container', key: k });
        const pr = ctx.split ? chestPartner(this.store, p.screen.x, p.screen.y, p.screen.z) : null;
        if (pr) this.emit({ e: 'container', key: posKey(pr[0], pr[1], pr[2]) });
        if (ctx.containerKind === 'furnace') {
          this.activeFurnaces.add(k);
          if (wasFurnaceOut) {
            const be = this.getBlockEntity(p.screen.x, p.screen.y, p.screen.z);
            if (be && be.type === 'furnace' && be.xp >= 1) { const g = Math.floor(be.xp); be.xp -= g; this.giveXp(p, g); }
          }
        }
      }
      if (op.t === 'close') {
        const was = p.screen.type;
        p.screen.type = null;
        this.emit({ e: 'screen', p });
        if (was === 'chest') this.emit({ e: 'chestLid', x: p.screen.x, y: p.screen.y, z: p.screen.z, n: this.chestViewers(p.screen.x, p.screen.y, p.screen.z) });
      }
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

  containerView(p: SimPlayer): { key: string; keys: string[]; type: 'chest' | 'furnace'; items: (ItemStack | null)[]; burn?: number; burnMax?: number; cook?: number } | null {
    const sc = p.screen;
    if (sc.type !== 'chest' && sc.type !== 'furnace') return null;
    const be = this.getBlockEntity(sc.x, sc.y, sc.z);
    if (!be || be.type !== sc.type) return null;
    const key = posKey(sc.x, sc.y, sc.z);
    if (be.type === 'furnace') return { key, keys: [key], type: 'furnace', items: be.items, burn: be.burn, burnMax: be.burnMax, cook: be.cook };
    const pr = chestPartner(this.store, sc.x, sc.y, sc.z);
    const other = pr ? this.getBlockEntity(pr[0], pr[1], pr[2]) : undefined;
    if (!pr || !other || other.type !== 'chest') return { key, keys: [key], type: 'chest', items: be.items };
    const [a, b] = pr[3] ? [be, other] : [other, be];
    return { key, keys: [key, posKey(pr[0], pr[1], pr[2])], type: 'chest', items: [...a.items, ...b.items] };
  }

  chestViewers(x: number, y: number, z: number): number {
    const pr = chestPartner(this.store, x, y, z);
    let n = 0;
    for (const o of this.players.values()) {
      if (o.screen.type !== 'chest') continue;
      if ((o.screen.x === x && o.screen.y === y && o.screen.z === z) || (pr && o.screen.x === pr[0] && o.screen.y === pr[1] && o.screen.z === pr[2])) n++;
    }
    return n;
  }

  closeScreen(p: SimPlayer): void {
    if (!p.screen.type) return;
    { const ctx = this.invCtx(p); applyInvOp(ctx, { t: 'close' }); if (ctx.split && ctx.container) ctx.split(ctx.container); }
    const was = p.screen.type;
    p.screen.type = null;
    if (was === 'chest') this.emit({ e: 'chestLid', x: p.screen.x, y: p.screen.y, z: p.screen.z, n: this.chestViewers(p.screen.x, p.screen.y, p.screen.z) });
    this.emit({ e: 'screen', p });
    this.emit({ e: 'inv', p });
  }

  openScreen(p: SimPlayer, type: ScreenType, x: number, y: number, z: number): void {
    const prev = p.screen.type === 'chest' ? { ...p.screen } : null;
    if (p.screen.type) { const ctx = this.invCtx(p); applyInvOp(ctx, { t: 'close' }); if (ctx.split && ctx.container) ctx.split(ctx.container); }
    p.screen = { type, x, y, z };
    p.inv.craftSize = type === 'workbench' ? 3 : 2;
    if (prev) this.emit({ e: 'chestLid', x: prev.x, y: prev.y, z: prev.z, n: this.chestViewers(prev.x, prev.y, prev.z) });
    if (type === 'chest' || type === 'furnace') this.ensureBlockEntity(x, y, z);
    if (type === 'chest') { const pr = chestPartner(this.store, x, y, z); if (pr) this.ensureBlockEntity(pr[0], pr[1], pr[2]); this.emit({ e: 'chestLid', x, y, z, n: this.chestViewers(x, y, z) }); }
    this.emit({ e: 'screen', p });
    this.emit({ e: 'inv', p });
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
    if (bid === B.CHEST && !(p.flags & MF.CROUCH)) {
      for (const [dx, dz] of FACING_DIRS) {
        const nv = this.get(tx + dx, ty, tz + dz);
        if (blockId(nv) !== B.CHEST) continue;
        const g = blockMeta(nv) & 3;
        const [fx, fz] = FACING_DIRS[g];
        if (fx * dx + fz * dz !== 0) continue;
        if (chestPartner(this.store, tx + dx, ty, tz + dz)) continue;
        meta = g;
        break;
      }
    }
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
    const eatenId = stack!.id;
    if (eatenId === I.ROTTEN_FLESH && this.rng.chance(0.8)) p.exh += 6;
    if (eatenId === I.GOLDEN_APPLE) p.health = Math.min(20, p.health + 4);
    if (p.mode === 'survival') {
      consumeHeld(p.inv);
      if (eatenId === I.MUSHROOM_STEW) { if (!heldStack(p.inv)) p.inv.slots[p.inv.selected] = { id: I.BOWL, count: 1 }; else if (giveItem(p.inv, { id: I.BOWL, count: 1 }) > 0) this.spawnItem(p.x, p.y + 1, p.z, { id: I.BOWL, count: 1 }); }
      this.emit({ e: 'inv', p });
    }
    this.emit({ e: 'sound', s: 'player.burp', x: p.x, y: p.y + 1.5, z: p.z });
    this.emit({ e: 'vitals', p });
    return true;
  }

  swing(p: SimPlayer): void {
    if (this.now - (p.lastSwing ?? 0) > 40) p.lastSwing = this.now;
  }

  private strike(p: SimPlayer): { dmg: number; charge: number; crit: boolean; sweep: boolean; knock: number; stats: ReturnType<typeof attackStats> } {
    const stats = attackStats(heldStack(p.inv));
    const since = this.now - Math.max(p.lastAttack, p.lastSwing ?? 0);
    const charge = attackCharge(since, stats.speed);
    p.lastAttack = this.now;
    let dmg = scaledDamage(stats.damage + (this.game?.damageBonus(p) ?? 0), charge);
    const strong = charge > 0.9;
    const falling = !(p.flags & MF.GROUND) && p.peakY > p.y + 0.01;
    const crit = strong && falling && !(p.flags & (MF.WATER | MF.LADDER | MF.FLY)) && !(p.flags & MF.SPRINT);
    if (crit) dmg *= 1.5;
    const sweep = strong && stats.sword && !!(p.flags & MF.GROUND) && !(p.flags & MF.SPRINT) && !crit;
    const knock = 0.4 + (strong && p.flags & MF.SPRINT ? 0.5 : 0);
    return { dmg, charge, crit, sweep, knock, stats };
  }

  attack(p: SimPlayer, entityId: number): boolean {
    if (p.dead) return false;
    const e = this.entities.get(entityId);
    if (!e || e.kind !== 'mob') return false;
    if (this.game?.onAttackMob(p, e)) return true;
    const dx = e.x - p.x, dy = e.y + e.h / 2 - (p.y + 1.62), dz = e.z - p.z;
    if (dx * dx + dy * dy + dz * dz > (p.mode === 'creative' ? 6.5 : 5) ** 2) return false;
    if (this.now - p.lastAttack < 45) return false;
    const st = this.strike(p);
    let dmg = st.dmg;
    if (p.mode === 'creative') dmg = Math.max(dmg, 20);
    if (p.mode === 'survival') { p.exh += 0.1; if (st.stats.damage > 1) { damageHeld(p.inv, st.stats.sword ? 1 : 2); this.emit({ e: 'inv', p }); } }
    const len = Math.hypot(dx, dz) || 1;
    this.hurtMob(e, dmg, p.id, dx / len, dz / len, st.knock);
    if (st.crit) this.emit({ e: 'particles', k: 'crit', x: e.x, y: e.y + e.h, z: e.z });
    if (st.sweep) this.sweepAround(p, e.x, e.y, e.z, e.id, null);
    return true;
  }

  private sweepAround(p: SimPlayer, x: number, y: number, z: number, skipEnt: number | null, skipPlayer: string | null): void {
    this.emit({ e: 'particles', k: 'sweep', x, y: y + 1, z });
    this.emit({ e: 'sound', s: 'player.sweep', x, y, z });
    for (const o of this.entities.values()) {
      if (o.kind !== 'mob' || o.id === skipEnt || o.health <= 0) continue;
      if (Math.abs(o.x - x) > 1.3 || Math.abs(o.z - z) > 1.3 || Math.abs(o.y - y) > 0.6) continue;
      const l = Math.hypot(o.x - p.x, o.z - p.z) || 1;
      this.hurtMob(o, 1, p.id, (o.x - p.x) / l, (o.z - p.z) / l, 0.4);
    }
    if (!this.settings.pvp) return;
    for (const o of this.players.values()) {
      if (o === p || o.id === skipPlayer || o.dead) continue;
      if (Math.abs(o.x - x) > 1.3 || Math.abs(o.z - z) > 1.3 || Math.abs(o.y - y) > 0.6) continue;
      if (this.game && !this.game.canHurtPlayer(p, o)) continue;
      this.damage(o, 1, 'player', p.x, p.z, true, false, p.name, 0.4);
    }
  }

  attackPlayer(p: SimPlayer, targetId: string): boolean {
    if (!this.settings.pvp || p.dead) return false;
    const t = this.players.get(targetId);
    if (!t || t.dead || t === p) return false;
    if (this.game && !this.game.canHurtPlayer(p, t)) return false;
    const dx = t.x - p.x, dy = t.y - p.y, dz = t.z - p.z;
    if (dx * dx + dy * dy + dz * dz > 25) return false;
    if (this.now - p.lastAttack < 45) return false;
    const st = this.strike(p);
    if (st.crit) this.emit({ e: 'particles', k: 'crit', x: t.x, y: t.y + 1.8, z: t.z });
    if (p.mode === 'survival') { p.exh += 0.1; if (st.stats.damage > 1) { damageHeld(p.inv, st.stats.sword ? 1 : 2); this.emit({ e: 'inv', p }); } }
    this.damage(t, st.dmg, 'player', p.x, p.z, true, false, p.name, st.knock);
    if (st.sweep) this.sweepAround(p, t.x, t.y, t.z, null, t.id);
    return true;
  }

  hurtMob(e: Entity, dmg: number, by: string | null, kx: number, kz: number, knock = 0.4): void {
    if (e.health <= 0) return;
    if (this.game?.mobInvulnerable(e)) return;
    let fresh = true;
    if (e.hurt > 0) {
      if (dmg <= (e.lastHurt ?? 0)) return;
      const add = dmg - (e.lastHurt ?? 0);
      e.lastHurt = dmg;
      dmg = add;
      fresh = false;
    } else { e.lastHurt = dmg; e.hurt = 10; }
    e.noAct = 0;
    e.health -= dmg;
    if (fresh) { e.vx = e.vx / 2 + kx * knock * 20; e.vz = e.vz / 2 + kz * knock * 20; if (e.onGround) e.vy = Math.max(e.vy, 8); }
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
    if (this.settings.dayCycle) {
      this.timeAcc += timeRate(this.time);
      const step = Math.floor(this.timeAcc);
      if (step > 0) { this.time += step; this.timeAcc -= step; }
    }
    if (this.tickCount % 200 === 0) this.emit({ e: 'time' });
    this.tickWeather();
    for (const p of this.players.values()) this.tickPlayer(p);
    if (!this.authoritative) return;
    this.info.builds = this.store.raw ? 32 : 6;
    this.info.budget = 20000;
    if (this.tickCount % 10 === 1 || this.players.size !== this.tickingFor) this.refreshTicking();
    if (this.tickCount % 600 === 0) this.info.prune();
    this.tickFluids();
    this.tickFurnaces();
    this.tickRandom();
    this.tickLeafDecay();
    this.tickFalling();
    for (const e of [...this.entities.values()]) this.tickEntity(e);
    if (this.game) this.game.tick();
    else {
      this.naturalSpawn();
      if (this.tickCount % 20 === 0) for (const p of this.players.values()) if (!p.dead) this.populateVillages(p);
    }
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
      if ((p.fireT > 0) !== !!p.wasFire) { p.wasFire = p.fireT > 0; changed = true; }
      if (p.fireT > 0) { p.fireT--; if (--p.t.fire <= 0) { p.t.fire = 20; if (!(f & MF.LAVA)) this.damage(p, 1, 'fire', p.x, p.z, false); } }
      if (f & MF.EYE_WATER) {
        p.air--;
        if (p.air <= 0) { p.air = 0; if (--p.t.drown <= 0) { p.t.drown = 20; this.damage(p, 2, 'drown', p.x, p.z, false, true); } }
        if (p.air % 20 === 0) changed = true;
      } else if (p.air < 300) { p.air = Math.min(300, p.air + 5); changed = true; }
      const hb = getBlock(this.get(Math.floor(p.x), Math.floor(p.y + (f & MF.CROUCH ? 1.27 : 1.62)), Math.floor(p.z)));
      if (hb.solid && hb.opaque && hb.render === 'cube') { p.t.suffocate = (p.t.suffocate ?? 10) - 1; if (p.t.suffocate <= 0) { p.t.suffocate = 10; this.damage(p, 1, 'suffocate', p.x, p.z, false, true); } }
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

  private ticking = new Set<number>();
  private spawnChunks = new Map<number, number[]>();
  private tickingFor = -1;
  populated = new Set<number>();
  keepPopulated = false;

  simDistance(): number { return Math.max(2, Math.min(16, this.settings.simDistance ?? 8)); }

  private refreshTicking(): void {
    this.ticking.clear();
    this.spawnChunks.clear();
    this.tickingFor = this.players.size;
    const sd = this.simDistance();
    const ps = [...this.players.values()];
    const r = Math.ceil(SPAWN_RANGE / CHUNK_SIZE);
    ps.forEach((p, i) => {
      const pcx = Math.floor(p.x / CHUNK_SIZE), pcz = Math.floor(p.z / CHUNK_SIZE);
      for (let dz = -sd; dz <= sd; dz++) for (let dx = -sd; dx <= sd; dx++) this.ticking.add(chunkNum(pcx + dx, pcz + dz));
      if (p.dead) return;
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) > sd || Math.abs(dz) > sd) continue;
        const cx = pcx + dx, cz = pcz + dz;
        const mx = cx * CHUNK_SIZE + 8 - p.x, mz = cz * CHUNK_SIZE + 8 - p.z;
        if (mx * mx + mz * mz > SPAWN_RANGE * SPAWN_RANGE) continue;
        const k = chunkNum(cx, cz);
        const list = this.spawnChunks.get(k);
        if (list) list.push(i); else this.spawnChunks.set(k, [i]);
      }
    });
    if (this.game || this.settings.mobSpawning === false) return;
    let budget = 24;
    for (const k of this.spawnChunks.keys()) {
      if (this.populated.has(k)) continue;
      const cx = Math.floor(k / 65536) - 32768, cz = (k % 65536) - 32768;
      if (!this.store.isLoaded(cx * 16, cz * 16) || !this.info.heightMap(cx, cz)) continue;
      this.populated.add(k);
      if (this.rng.next() < 0.1) this.populateChunk(cx, cz);
      if (--budget <= 0) break;
    }
    if (!this.keepPopulated && this.tickCount % 600 === 1) {
      for (const k of this.populated) {
        const cx = Math.floor(k / 65536) - 32768, cz = (k % 65536) - 32768;
        if (!this.store.isLoaded(cx * 16, cz * 16)) this.populated.delete(k);
      }
    }
  }

  private populateChunk(cx: number, cz: number): void {
    const def = this.pickSpawn(false);
    if (!def) return;
    const n = def.spawn!.min + this.rng.int(def.spawn!.max - def.spawn!.min + 1);
    let x = cx * 16 + this.rng.int(16), z = cz * 16 + this.rng.int(16);
    let placed = 0;
    for (let tries = 0; tries < n * 4 && placed < n; tries++) {
      const y = this.info.top(x, z) + 1;
      const g = blockId(this.get(x, y - 1, z));
      if ((g === B.GRASS || g === B.SNOWY_GRASS) && this.spawnRoom(def, x, y, z)) {
        const e = this.spawnMob(def.type, x + 0.5, y, z + 0.5);
        e.yaw = this.rng.next() * Math.PI * 2;
        placed++;
      }
      x += this.rng.int(5) - this.rng.int(5);
      z += this.rng.int(5) - this.rng.int(5);
      x = Math.max(cx * 16, Math.min(cx * 16 + 15, x));
      z = Math.max(cz * 16, Math.min(cz * 16 + 15, z));
    }
  }

  isTicking(x: number, z: number): boolean {
    return this.ticking.has(chunkNum(Math.floor(x) >> 4, Math.floor(z) >> 4));
  }

  skyDarken(): number {
    if (this.weather === 'thunder') return 10;
    return Math.round((1 - this.dayFactor()) * 11);
  }

  brightAtLeast(x: number, y: number, z: number, n: number): boolean {
    if (n <= 0) return true;
    const d = this.skyDarken();
    if (n + d <= 15 && this.info.exposed(x, y, z)) return true;
    if (this.info.blockLight(x, y, z) >= n) return true;
    if (n + d > 15) return false;
    return this.info.skyLight(x, y, z, n + d) - d >= n;
  }

  private darkEnoughForMonsters(x: number, y: number, z: number): boolean {
    const r1 = this.rng.int(32);
    if (r1 < 15 && this.info.skyLight(x, y, z, r1 + 1) > r1) return false;
    if (this.info.blockLight(x, y, z) > 0) return false;
    const need = this.rng.int(8) + this.skyDarken() + 1;
    if (need > 15) return true;
    return this.info.skyLight(x, y, z, need) < need;
  }

  private tickRandom(): void {
    const speed = Math.max(0, Math.min(64, this.settings.randomTickSpeed ?? 3));
    if (!speed) return;
    for (const k of this.spawnChunks.keys()) {
      const cx = Math.floor(k / 65536) - 32768, cz = (k % 65536) - 32768;
      const mask = this.info.tickMask(cx, cz);
      if (!mask) continue;
      for (let sct = 0; sct * 16 < WORLD_HEIGHT; sct++) {
        if (!(mask & (1 << sct))) continue;
        for (let n = 0; n < speed; n++) {
          const x = cx * 16 + this.rng.int(16), z = cz * 16 + this.rng.int(16), y = sct * 16 + this.rng.int(16);
          if (y >= WORLD_HEIGHT) continue;
          const v = this.get(x, y, z);
          const id = blockId(v);
          if (TICKABLE[id]) this.randomTick(x, y, z, v, id);
        }
      }
    }
  }

  private moistFarmland(x: number, y: number, z: number): boolean {
    for (let dy = 0; dy <= 1; dy++) for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) {
      if (blockId(this.get(x + dx, y + dy, z + dz)) === B.WATER) return true;
    }
    return false;
  }

  private cropSpeed(x: number, y: number, z: number, id: number): number {
    let f = 1;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (blockId(this.get(x + dx, y - 1, z + dz)) !== B.FARMLAND) continue;
      let g = this.moistFarmland(x + dx, y - 1, z + dz) ? 3 : 1;
      if (dx || dz) g /= 4;
      f += g;
    }
    const same = (dx: number, dz: number) => blockId(this.get(x + dx, y, z + dz)) === id;
    const row = (same(-1, 0) || same(1, 0)) && (same(0, -1) || same(0, 1));
    const diag = same(-1, -1) || same(1, -1) || same(1, 1) || same(-1, 1);
    if (row || diag) f /= 2;
    return f;
  }

  private randomTick(x: number, y: number, z: number, v: number, id: number): void {
    switch (id) {
      case B.WHEAT: {
        const st = blockMeta(v) & 7;
        if (st >= 7 || !this.brightAtLeast(x, y + 1, z, 9)) break;
        const f = this.cropSpeed(x, y, z, id);
        if (this.rng.int(Math.floor(25 / f) + 1) === 0) this.setBlock(x, y, z, makeBlock(B.WHEAT, st + 1));
        break;
      }
      case B.OAK_SAPLING: case B.BIRCH_SAPLING: case B.SPRUCE_SAPLING: case B.JUNGLE_SAPLING:
        if (this.rng.int(7) !== 0 || this.rng.int(2) !== 0 || !this.brightAtLeast(x, y + 1, z, 9)) break;
        this.growTree(x, y, z, id);
        break;
      case B.SUGAR_CANE: case B.CACTUS: {
        if (blockId(this.get(x, y + 1, z)) !== 0) break;
        let h = 1;
        while (blockId(this.get(x, y - h, z)) === id) h++;
        if (h < 3 && this.rng.int(16) === 0 && this.supported(x, y + 1, z, id)) this.setBlock(x, y + 1, z, id);
        break;
      }
      case B.GRASS: case B.SNOWY_GRASS: {
        const above = this.get(x, y + 1, z);
        if (getBlock(above).opaque || blockId(above) === B.WATER) { this.setBlock(x, y, z, B.DIRT); break; }
        if (!this.brightAtLeast(x, y + 1, z, 9)) break;
        for (let i = 0; i < 4; i++) {
          const tx = x + this.rng.int(3) - 1, ty = y + this.rng.int(5) - 3, tz = z + this.rng.int(3) - 1;
          if (blockId(this.get(tx, ty, tz)) !== B.DIRT) continue;
          const up = this.get(tx, ty + 1, tz);
          if (getBlock(up).opaque || blockId(up) === B.WATER || isSolid(up)) continue;
          if (!this.brightAtLeast(tx, ty + 1, tz, 4)) continue;
          this.setBlock(tx, ty, tz, B.GRASS);
        }
        break;
      }
      case B.ICE:
        if (this.info.blockLight(x, y, z) > 11) this.setBlock(x, y, z, B.WATER);
        break;
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
    return this.info.exposed(Math.floor(x), Math.floor(y), Math.floor(z));
  }

  private mobCounts(): { mon: number[]; cre: number[]; total: number } {
    const ps = [...this.players.values()];
    const mon = new Array(ps.length).fill(0), cre = new Array(ps.length).fill(0);
    let total = 0;
    for (const e of this.entities.values()) {
      if (e.kind !== 'mob') continue;
      const def = MOBS[e.type as MobType];
      if (def.npc || def.trader) continue;
      total++;
      const ccx = (Math.floor(e.x) >> 4) * 16 + 8, ccz = (Math.floor(e.z) >> 4) * 16 + 8;
      for (let i = 0; i < ps.length; i++) {
        const dx = ccx - ps[i].x, dz = ccz - ps[i].z;
        if (dx * dx + dz * dz > SPAWN_RANGE * SPAWN_RANGE) continue;
        if (def.hostile) mon[i]++; else cre[i]++;
      }
    }
    return { mon, cre, total };
  }

  private naturalSpawn(): void {
    if (this.settings.mobSpawning === false || !this.spawnChunks.size) return;
    const monsters = this.difficulty !== 'peaceful';
    const creatures = this.tickCount % 400 === 0;
    if (!monsters && !creatures) return;
    const counts = this.mobCounts();
    if (counts.total >= MAX_NATURAL) return;
    const cap = this.settings.mobCap ?? MONSTER_CAP;
    const keys = [...this.spawnChunks.keys()];
    for (let i = keys.length - 1; i > 0; i--) { const j = this.rng.int(i + 1); const t = keys[i]; keys[i] = keys[j]; keys[j] = t; }
    if (keys.length > 2400) keys.length = 2400;
    for (const k of keys) {
      const near = this.spawnChunks.get(k)!;
      const cx = Math.floor(k / 65536) - 32768, cz = (k % 65536) - 32768;
      if (monsters && near.some((i) => counts.mon[i] < cap)) {
        const n = this.spawnForChunk(true, cx, cz);
        if (n) near.forEach((i) => (counts.mon[i] += n));
      }
      if (creatures && near.some((i) => counts.cre[i] < CREATURE_CAP)) {
        const n = this.spawnForChunk(false, cx, cz);
        if (n) near.forEach((i) => (counts.cre[i] += n));
      }
      if (this.info.budget < 0) break;
    }
  }

  private pickSpawn(hostile: boolean): MobDef | null {
    const list = (hostile ? HOSTILE_TYPES : PASSIVE_TYPES).map((t) => MOBS[t]).filter((d) => d.spawn);
    let total = 0;
    for (const d of list) total += d.spawn!.weight;
    let r = this.rng.int(Math.max(1, total));
    for (const d of list) { r -= d.spawn!.weight; if (r < 0) return d; }
    return null;
  }

  private spawnRoom(def: MobDef, x: number, y: number, z: number): boolean {
    const below = this.get(x, y - 1, z), bid = blockId(below);
    if (!OPAQUE[bid] || !isSolid(below) || bid === B.BEDROCK) return false;
    const r = def.hw > 0.5 ? 1 : 0;
    const hc = Math.ceil(def.h);
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) for (let dy = 0; dy < hc; dy++) {
      const v = this.get(x + dx, y + dy, z + dz);
      if (isSolid(v) || getBlock(v).fluid) return false;
    }
    return true;
  }

  private spawnForChunk(hostile: boolean, cx: number, cz: number): number {
    const sx = cx * 16 + this.rng.int(16), sz = cz * 16 + this.rng.int(16);
    const top = this.info.top(sx, sz);
    if (top < 0 && !this.info.heightMap(cx, cz)) return 0;
    const y = this.rng.int(Math.min(WORLD_HEIGHT - 2, top + 1) + 1);
    if (y < 1 || isSolid(this.get(sx, y, sz))) return 0;
    let spawned = 0;
    for (let g = 0; g < 3; g++) {
      let x = sx, z = sz;
      let def: MobDef | null = null;
      let size = Math.ceil(this.rng.next() * 4), inGroup = 0;
      for (let q = 0; q < size; q++) {
        x += this.rng.int(6) - this.rng.int(6);
        z += this.rng.int(6) - this.rng.int(6);
        if (!this.store.isLoaded(x, z) || !this.isTicking(x, z)) continue;
        let nearest = Infinity;
        for (const p of this.players.values()) nearest = Math.min(nearest, (p.x - x - 0.5) ** 2 + (p.y - y) ** 2 + (p.z - z - 0.5) ** 2);
        if (nearest <= 576) continue;
        if (!def) {
          def = this.pickSpawn(hostile);
          if (!def) break;
          size = def.spawn!.min + this.rng.int(def.spawn!.max - def.spawn!.min + 1);
        }
        if (!this.spawnRoom(def, x, y, z)) continue;
        if (hostile) {
          if (!this.darkEnoughForMonsters(x, y, z)) continue;
        } else {
          const g2 = blockId(this.get(x, y - 1, z));
          if (g2 !== B.GRASS && g2 !== B.SNOWY_GRASS) continue;
          if (!this.brightAtLeast(x, y, z, 9)) continue;
        }
        const e = this.spawnMob(def.type, x + 0.5, y, z + 0.5);
        e.yaw = this.rng.next() * Math.PI * 2;
        spawned++; inGroup++;
        if (spawned >= 4) return spawned;
        if (inGroup >= size) break;
      }
    }
    return spawned;
  }

  private checkDespawn(e: Entity): boolean {
    const def = MOBS[e.type as MobType];
    if (def.hostile && this.difficulty === 'peaceful') return true;
    if (!def.hostile || e.persistent || def.npc || def.trader) return false;
    let d = Infinity;
    for (const p of this.players.values()) d = Math.min(d, (p.x - e.x) ** 2 + (p.y - e.y) ** 2 + (p.z - e.z) ** 2);
    if (d === Infinity) return false;
    if (d > 128 * 128) return true;
    e.noAct = (e.noAct ?? 0) + 20;
    if (d < 32 * 32) { e.noAct = 0; return false; }
    return e.noAct > 600 && this.rng.int(40) === 0;
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
    const loaded = this.store.isLoaded(Math.floor(e.x), Math.floor(e.z));
    if (e.kind === 'mob' && !this.game && (this.tickCount + e.id) % 20 === 0) {
      if (!loaded || this.checkDespawn(e)) { this.entities.delete(e.id); this.emit({ e: 'remove', id: e.id, why: 'despawn' }); return; }
    }
    if (!loaded || !this.isTicking(e.x, e.z)) return;
    e.age++;
    if (e.hurt > 0) e.hurt--;
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
    if (e.age > 400 && e.stuck === undefined) { this.entities.delete(e.id); this.emit({ e: 'remove', id: e.id, why: 'despawn' }); return; }
    if (e.stuck !== undefined) {
      e.stuck++;
      if (e.pickup && e.stuck > 5) {
        for (const p of this.players.values()) {
          if (p.dead || Math.abs(p.x - e.x) > 1.3 || Math.abs(p.z - e.z) > 1.3 || e.y < p.y - 0.8 || e.y > p.y + 2.2) continue;
          if (giveItem(p.inv, { id: I.ARROW, count: 1 }) > 0) continue;
          this.emit({ e: 'sound', s: 'item.pickup', x: e.x, y: e.y, z: e.z });
          this.emit({ e: 'inv', p });
          this.entities.delete(e.id); this.emit({ e: 'remove', id: e.id, why: 'pickup', by: p.id });
          return;
        }
      }
      if (e.stuck > (e.pickup ? 1200 : 60)) { this.entities.delete(e.id); this.emit({ e: 'remove', id: e.id, why: 'despawn' }); }
      return;
    }
    e.vy -= 20 * DT;
    const sp = Math.hypot(e.vx, e.vy, e.vz);
    const step = sp * DT;
    const dx = e.vx / sp, dy = e.vy / sp, dz = e.vz / sp;
    e.vx *= 0.99; e.vy *= 0.99; e.vz *= 0.99;
    if (e.shooterP) {
      for (const m of this.entities.values()) {
        if (m.kind !== 'mob' || m.health <= 0) continue;
        for (let s = 0; s <= 6; s++) {
          const t = (s / 6) * step;
          const ax = e.x + dx * t, ay = e.y + dy * t, az = e.z + dz * t;
          if (Math.abs(ax - m.x) < m.hw + 0.15 && Math.abs(az - m.z) < m.hw + 0.15 && ay > m.y && ay < m.y + m.h) {
            const l = Math.hypot(dx, dz) || 1;
            this.hurtMob(m, e.dmg ?? 3, e.shooterP, dx / l * 0.6, dz / l * 0.6);
            if (m.fire === 0 && e.fire > 0) m.fire = 100;
            this.entities.delete(e.id);
            this.emit({ e: 'remove', id: e.id, why: 'hit' });
            this.emit({ e: 'sound', s: 'arrow.hit', x: e.x, y: e.y, z: e.z });
            return;
          }
        }
      }
    }
    for (const p of this.players.values()) {
      if (p.dead || p.mode === 'creative' || p.id === e.shooterP) continue;
      if (e.shooterP) {
        const sh = this.players.get(e.shooterP);
        if (!this.settings.pvp || (sh && this.game && !this.game.canHurtPlayer(sh, p))) continue;
      }
      for (let s = 0; s <= 4; s++) {
        const t = (s / 4) * step;
        const ax = e.x + dx * t, ay = e.y + dy * t, az = e.z + dz * t;
        if (Math.abs(ax - p.x) < 0.45 && Math.abs(az - p.z) < 0.45 && ay > p.y && ay < p.y + 1.85) {
          const sh = e.shooterP ? this.players.get(e.shooterP) : undefined;
          this.damage(p, e.shooterP ? (e.dmg ?? 3) : Math.max(1, Math.round((e.dmg ?? 3) * DIFF_DMG[this.difficulty])), e.shooterP ? 'player' : 'arrow', e.x - e.vx, e.z - e.vz, true, false, sh?.name);
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
      if (e.type === 'duskweaver' && e.age % 20 === 1) e.dim = !this.brightAtLeast(Math.floor(e.x), Math.floor(e.y + 0.5), Math.floor(e.z), 12);
      const aggressive = e.type !== 'duskweaver' || e.provoked! > 0 || e.dim !== false;
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
      if (def.trader) {
        const tp = e.tradeWith ? this.players.get(e.tradeWith) : undefined;
        if (tp && tp.screen.type === 'trade' && !tp.dead) {
          e.path = null; e.wanderT = 40;
          e.yaw = Math.atan2(-(tp.x - e.x), -(tp.z - e.z));
        } else {
          e.tradeWith = undefined;
          if (!e.panic && e.age % 10 === 0) {
            for (const o of this.entities.values()) {
              if (o.kind !== 'mob' || !MOBS[o.type as MobType].hostile) continue;
              if (Math.abs(o.x - e.x) < 7 && Math.abs(o.z - e.z) < 7 && Math.abs(o.y - e.y) < 4) { e.panic = 40; e.attacker = undefined; e.home && (e.path = null); break; }
            }
          }
          if (!e.panic) {
            const phase = villagerPhase(this.time);
            const [tx, tz] = phase === 'rest' ? e.bed ?? e.home ?? e.vc ?? [e.x, e.z]
              : phase === 'work' ? e.work ?? e.home ?? e.vc ?? [e.x, e.z]
              : e.vc ?? [e.x, e.z];
            const d = Math.hypot(tx - e.x, tz - e.z);
            const reach = phase === 'rest' ? 0.9 : phase === 'work' ? 3 : phase === 'meet' ? 4 : 24;
            e.wanderR = phase === 'idle' ? 7 : 2;
            if (d > reach) { goalX = tx; goalZ = tz; }
            else if (phase === 'rest') { e.path = null; e.wanderT = 40; }
            else if (e.age % 40 === 0) {
              const near = this.nearestPlayer(e, 4, false);
              if (near && this.rng.chance(0.5)) { e.path = null; e.wanderT = 30; e.yaw = Math.atan2(-(near.x - e.x), -(near.z - e.z)); }
            }
          } else if (e.vc) { goalX = e.vc[0]; goalZ = e.vc[1]; }
        }
      }
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
      if (e.breedCd) e.breedCd--;
      if (e.baby && --e.baby <= 0) { e.baby = 0; }
      if (e.love && e.love > 0) {
        e.love--;
        if (e.age % 20 === 0) this.emit({ e: 'particles', k: 'heart', x: e.x, y: e.y + e.h + 0.2, z: e.z });
        let mate: Entity | null = null, md = 64;
        for (const o of this.entities.values()) {
          if (o === e || o.type !== e.type || !o.love || o.baby) continue;
          const d = (o.x - e.x) ** 2 + (o.z - e.z) ** 2;
          if (d < md) { md = d; mate = o; }
        }
        if (mate) {
          if (md < 2.2) {
            e.love = 0; mate.love = 0; e.breedCd = 6000; mate.breedCd = 6000;
            const b = this.spawnMob(e.type as MobType, (e.x + mate.x) / 2, e.y, (e.z + mate.z) / 2);
            b.baby = 24000; b.persistent = true;
            this.emit({ e: 'particles', k: 'heart', x: b.x, y: b.y + 0.8, z: b.z });
          } else { goalX = mate.x; goalZ = mate.z; e.target = null; }
        }
      }
      const t = e.target ? this.players.get(e.target) : undefined;
      if (t && !e.panic && goalX === null) {
        const d = Math.hypot(t.x - e.x, t.z - e.z);
        if (d > 2) { goalX = t.x; goalZ = t.z; } else { e.path = null; e.yaw = Math.atan2(-(t.x - e.x), -(t.z - e.z)); }
      }
    }
    if (goalX === null && !def.hostile || goalX === null && !e.target) {
      if (--e.wanderT! <= 0) {
        e.wanderT = 80 + this.rng.int(200);
        if (this.rng.chance(0.6)) {
          const wr = (e.wanderR ?? 7) * 2;
          const wx = Math.floor(e.x + (this.rng.next() - 0.5) * wr), wz = Math.floor(e.z + (this.rng.next() - 0.5) * wr);
          e.path = findPath(def.trader ? this.doorReader : this.store, e.x, e.y, e.z, wx, e.y, wz, e.h > 1, 160);
          e.pathT = 200;
        }
      }
    } else if (goalX !== null && goalZ !== null) {
      if (--e.pathT! <= 0 || !e.path || e.path.length === 0) {
        e.path = findPath(def.trader ? this.doorReader : this.store, e.x, e.y, e.z, goalX, e.y, goalZ, e.h > 1, 260);
        e.pathT = 20;
      }
    }
    if (e.doors?.length) this.closeDoorsFor(e);
    let wantX = 0, wantZ = 0;
    if (e.path && e.path.length) {
      const n = e.path[0];
      const dx = n.x + 0.5 - e.x, dz = n.z + 0.5 - e.z;
      const d = Math.hypot(dx, dz);
      if (def.trader && d < 1.6) this.openDoorFor(e, n.x, n.y, n.z);
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
    if (e.baby) flags |= 128;
    if (e.fire > 0) flags |= 2;
    if (e.prof !== undefined) flags |= (e.prof + 1) << 9;
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

  shootBow(p: SimPlayer, power: number, yaw: number, pitch: number): boolean {
    if (p.dead || !isFinite(power) || !isFinite(yaw) || !isFinite(pitch)) return false;
    const held = heldStack(p.inv);
    if (!held || held.id !== I.BOW) return false;
    if (this.now - (p.lastShot ?? -1e9) < 250) return false;
    power = Math.max(0, Math.min(1, power));
    if (power < 0.1) return false;
    const creative = p.mode === 'creative';
    const ai = creative ? -1 : p.inv.slots.findIndex((s) => s?.id === I.ARROW);
    if (!creative && ai < 0) return false;
    p.lastShot = this.now;
    if (!creative) {
      const st = p.inv.slots[ai]!;
      if (--st.count <= 0) p.inv.slots[ai] = null;
      damageHeld(p.inv, 1);
      this.emit({ e: 'inv', p });
    }
    pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch));
    const cp = Math.cos(pitch);
    const dx = -Math.sin(yaw) * cp, dy = Math.sin(pitch), dz = -Math.cos(yaw) * cp;
    const speed = 60 * power;
    const ey = p.y + (p.flags & MF.CROUCH ? 1.27 : 1.62) - 0.1;
    const crit = power >= 1;
    const a: Entity = {
      id: this.allocId(), kind: 'arrow', type: 'arrow', x: p.x + dx * 0.4, y: ey + dy * 0.4, z: p.z + dz * 0.4,
      vx: dx * speed, vy: dy * speed, vz: dz * speed,
      hw: 0.1, h: 0.1, onGround: false, hitH: false, hitCeil: false, yaw, health: 1, maxHealth: 1, hurt: 0, age: 0, fire: 0, flags: crit ? 4 : 0,
      shooterP: p.id, pickup: !creative, dmg: Math.ceil(power * 6) + (crit ? this.rng.int(3) : 0),
    };
    this.entities.set(a.id, a);
    this.emit({ e: 'spawn', ent: a });
    this.emit({ e: 'sound', s: 'arrow.shoot', x: p.x, y: ey, z: p.z });
    return true;
  }

  setTime(ticks: number): void {
    this.time = Math.max(0, Math.floor(ticks));
    this.emit({ e: 'time' });
  }

  private tpaReq = new Map<string, { from: string; here: boolean; until: number }>();

  private findPlayer(name: string | undefined): SimPlayer | null {
    if (!name) return null;
    const n = name.toLowerCase().replace(/^@/, '');
    const all = [...this.players.values()].filter((o) => !o.vanished);
    return all.find((o) => o.name.toLowerCase() === n) ?? all.find((o) => o.name.toLowerCase().startsWith(n)) ?? null;
  }

  teleportTo(p: SimPlayer, x: number, y: number, z: number, safe = true): void {
    p.back = { x: p.x, y: p.y, z: p.z };
    p.x = x; p.y = y; p.z = z; p.peakY = y;
    if (safe) this.makeSafe(p);
    this.emit({ e: 'tp', p });
  }

  private homeCommand(p: SimPlayer, cmd: string, parts: string[]): string {
    const max = this.settings.maxHomes ?? 2;
    if (max <= 0) return 'Homes are turned off in this world.';
    const homes = (p.homes ??= {});
    const name = (parts[1] ?? 'home').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 16) || 'home';
    const list = Object.keys(homes);
    if (cmd === 'homes') return list.length ? `Homes (${list.length}/${max}): ${list.join(', ')}` : 'You have no homes. Set one with /sethome [name].';
    if (cmd === 'sethome') {
      if (!homes[name] && list.length >= max) return `You can only have ${max} home${max === 1 ? '' : 's'}. Remove one with /delhome <name>.`;
      homes[name] = { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10, z: Math.round(p.z * 10) / 10 };
      return `Home "${name}" set.`;
    }
    if (cmd === 'delhome') {
      if (!homes[name]) return `You have no home called "${name}".`;
      delete homes[name];
      return `Home "${name}" removed.`;
    }
    const h = homes[name] ?? (parts[1] ? undefined : homes[list[0]]);
    if (!h) return list.length ? `No home called "${name}". Your homes: ${list.join(', ')}` : 'You have no homes. Set one with /sethome [name].';
    this.teleportTo(p, h.x, h.y, h.z);
    return `Teleported home.`;
  }

  private tpaCommand(p: SimPlayer, cmd: string, parts: string[]): string {
    if (this.settings.tpa === false) return 'Teleport requests are turned off in this world.';
    const now = this.tickCount;
    if (cmd === 'tpa' || cmd === 'tpahere') {
      const t = this.findPlayer(parts[1]);
      if (!t) return `Usage: /${cmd} <player>. No player found with that name.`;
      if (t === p) return 'You cannot send a request to yourself.';
      this.tpaReq.set(t.id, { from: p.id, here: cmd === 'tpahere', until: now + 20 * 120 });
      this.emit({ e: 'msg', text: cmd === 'tpa' ? `${p.name} wants to teleport to you. Type /tpaccept or /tpdeny.` : `${p.name} wants you to teleport to them. Type /tpaccept or /tpdeny.`, kind: 'info', to: t.id });
      return `Request sent to ${t.name}. It expires in 2 minutes.`;
    }
    const r = this.tpaReq.get(p.id);
    if (!r || r.until < now) { this.tpaReq.delete(p.id); return 'You have no pending teleport requests.'; }
    this.tpaReq.delete(p.id);
    const from = this.players.get(r.from);
    if (!from) return 'That player has left.';
    if (cmd === 'tpdeny') { this.emit({ e: 'msg', text: `${p.name} declined your teleport request.`, kind: 'info', to: from.id }); return 'Request declined.'; }
    const mover = r.here ? p : from, target = r.here ? from : p;
    if (mover.dead) return 'That player is dead right now.';
    this.teleportTo(mover, target.x, target.y, target.z, false);
    this.emit({ e: 'msg', text: `Teleported to ${target.name}.`, kind: 'info', to: mover.id });
    if (mover !== p) return `${mover.name} teleported to you.`;
    return `Teleported to ${target.name}.`;
  }

  command(p: SimPlayer, raw: string): string {
    const parts = raw.trim().replace(/^\//, '').split(/\s+/);
    const cmd = (parts[0] ?? '').toLowerCase();
    const allowed = p.op || (this.settings.cheats && p.mode === 'creative');
    const need = () => 'You do not have permission for that command.';
    if (this.game) { const r = this.game.command(p, [cmd, ...parts.slice(1)]); if (r !== null) return r; }
    switch (cmd) {
      case 'sethome': case 'home': case 'delhome': case 'homes':
        return this.homeCommand(p, cmd, parts);
      case 'tpa': case 'tpahere': case 'tpaccept': case 'tpdeny': case 'tpyes': case 'tpno':
        return this.tpaCommand(p, cmd === 'tpyes' ? 'tpaccept' : cmd === 'tpno' ? 'tpdeny' : cmd, parts);
      case 'back': {
        if (this.settings.tpa === false && (this.settings.maxHomes ?? 2) <= 0) return 'Teleport commands are turned off in this world.';
        if (!p.back) return 'There is nowhere to go back to.';
        const b = p.back;
        this.teleportTo(p, b.x, b.y, b.z);
        return 'Returned to your previous location.';
      }
      case 'help':
        return 'Teleports: /sethome [name], /home [name], /delhome <name>, /homes, /tpa <player>, /tpahere <player>, /tpaccept, /tpdeny, /back. Commands: /time set day|noon|night|midnight|<n>, /time cycle on|off, /weather clear|rain|thunder, /gamemode survival|creative, /give <item> [n], /tp <x> <y> <z>, /spawn, /setspawn, /summon <creature> [n], /pos1, /pos2, /fill <block> [hollow|outline], /replace <from> <to>, /clearsel, /seed, /locate village, /gamerule <rule> [value], /kill';
      case 'seed': return `Seed: ${this.seed}`;
      case 'gamerule': {
        const rules: Record<string, [() => string, (v: string) => string | null]> = {
          randomtickspeed: [() => String(this.settings.randomTickSpeed ?? 3), (v) => { const n = Math.floor(Number(v)); if (!Number.isFinite(n) || n < 0 || n > 64) return 'Use a number from 0 to 64.'; this.settings.randomTickSpeed = n; return null; }],
          domobspawning: [() => String(this.settings.mobSpawning !== false), (v) => { if (v !== 'true' && v !== 'false') return 'Use true or false.'; this.settings.mobSpawning = v === 'true'; return null; }],
          simulationdistance: [() => String(this.simDistance()), (v) => { const n = Math.floor(Number(v)); if (!Number.isFinite(n) || n < 2 || n > 16) return 'Use a number from 2 to 16.'; this.settings.simDistance = n; this.tickingFor = -1; return null; }],
          mobcap: [() => String(this.settings.mobCap ?? MONSTER_CAP), (v) => { const n = Math.floor(Number(v)); if (!Number.isFinite(n) || n < 0 || n > 200) return 'Use a number from 0 to 200.'; this.settings.mobCap = n; return null; }],
          maxhomes: [() => String(this.settings.maxHomes ?? 2), (v) => { const n = Math.floor(Number(v)); if (!Number.isFinite(n) || n < 0 || n > 20) return 'Use a number from 0 to 20.'; this.settings.maxHomes = n; return null; }],
          allowtpa: [() => String(this.settings.tpa !== false), (v) => { if (v !== 'true' && v !== 'false') return 'Use true or false.'; this.settings.tpa = v === 'true'; return null; }],
          showminimap: [() => String(this.settings.allowMinimap !== false), (v) => { if (v !== 'true' && v !== 'false') return 'Use true or false.'; this.settings.allowMinimap = v === 'true'; return null; }],
          showcoordinates: [() => String(this.settings.allowCoords !== false), (v) => { if (v !== 'true' && v !== 'false') return 'Use true or false.'; this.settings.allowCoords = v === 'true'; return null; }],
          dodaylightcycle: [() => String(this.settings.dayCycle), (v) => { if (v !== 'true' && v !== 'false') return 'Use true or false.'; this.settings.dayCycle = v === 'true'; return null; }],
        };
        const name = (parts[1] ?? '').toLowerCase();
        const rule = rules[name];
        if (!rule) return 'Rules: randomTickSpeed, doMobSpawning, simulationDistance, mobCap, doDaylightCycle, maxHomes, allowTpa, showMinimap, showCoordinates';
        if (parts[2] === undefined) return `Gamerule ${parts[1]} is currently set to: ${rule[0]()}`;
        if (!allowed) return need();
        const err = rule[1](parts[2].toLowerCase());
        if (err) return err;
        this.emit({ e: 'rules' });
        return `Gamerule ${parts[1]} is now set to: ${rule[0]()}`;
      }
      case 'locate': {
        if ((parts[1] ?? 'village') !== 'village') return 'Usage: /locate village';
        const v = this.locateVillage(p.x, p.z);
        return v ? `Nearest village is at ${v.x} ${v.y + 1} ${v.z} (${Math.round(Math.hypot(v.x - p.x, v.z - p.z))} blocks away).` : 'No village found within 2400 blocks.';
      }
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
        if (!this.settings.cheats) return 'Game modes are locked in this world. The mode is chosen when the world is created.';
        if (!p.op) return need();
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

import { isRail, railShape, railPowered, railHeight, railLine, RAIL_EXITS, shapeFor, reshapeNeighbor, neighborRails } from '../rails';
import { CHUNK_SIZE, WORLD_HEIGHT, TICKS_PER_DAY, timeRate, DEFAULT_DAY_LENGTH, DEFAULT_NIGHT_LENGTH, REACH_CREATIVE, REACH_SURVIVAL, GameMode, Difficulty } from '../constants';
import {
  B, BLOCKS, isPowder, getBlock, blockId, blockMeta, makeBlock, isSolid, isReplaceable, blockBox, facingFromYaw,
  FACING_DIRS, DOOR_OPEN, DOOR_UPPER, doorMeta, doorFacing, LIGHT_EMIT, OPAQUE, isWaterPlant, isWaterLike,
  SHAPE_MATS, SLAB_TOP, STAIRS_UP, SLAB_ITEM, STAIRS_ITEM, BLAST_RES, X, XV,
} from '../blocks';
import { getItem, I, fuelSeconds, spearIndex, maxDurability, ITEM_BY_KEY } from '../items';
import { lvl, tableOffers, tableList, anvilResult, JavaRandom, ENCH, ENCHANTS, supports, compatible, enchantLabel, type TableOffer } from '../enchants';
import {
  PlayerInv, ItemStack, InvOp, applyInvOp, emptyInv, giveItem, heldStack, damageHeld, consumeHeld,
  armorPoints, damageArmor, allStacks, CHEST_SIZE, FURNACE_SIZE, invHash, sameKind, cloneStack,
} from '../inventory';
import { findSmelt, Recipe, RecipeBook, BASE_BOOK, DataRecipes, makeBook, ingredientMatches } from '../crafting';
import { mergeData } from '../datapack';
import { trialLoot, vaultLoot } from '../worldgen/structures';
import { Redstone, isButton, isPlate, isTorch, isDiode, attachOut, DIR6, LEVER_ON, isPiston, HOPPER_OFF } from './redstone';
import { TreeSet, megaJungle, megaSpruce, jungleVines } from '../worldgen/trees';
import { enchantBonus, WIND_BURST, attackStats, attackCharge, scaledDamage, armorReduce, armorToughness, maceBonus, arrowDamage, attackRange, SPEAR_STATS, SPEAR_MIN, SPEAR_MARGIN, CHARGE_HURT_SPEED, CHARGE_KNOCK_SPEED, chargeDamage, SMASH_RANGE, SMASH_PUSH, SMASH_HEAVY, type AttackStats } from './combat';
import { PROFESSIONS, OFFERS, unlocked, performTrade, tradeXp, levelFor, Profession } from '../trades';
import { BlockReader, Body, moveBody, raycast, boxCollides, sampleMedium } from '../physics';
import { Rng } from '../rng';
import { WorldGenerator } from '../worldgen/WorldGenerator';
import { MOBS, MobType, MobDef, PASSIVE_TYPES, HOSTILE_TYPES } from './mobs';
import { findPath, standable, PathNode } from './pathfind';
import { tickFluid, fluidDelay, FluidWorld } from './fluids';
import { ChunkInfo, chunkNum } from './light';
import { isNether, toNether, toOverworld, NETHER_HEIGHT, NETHER_LAVA } from '../dimension';

export interface WorldStore extends BlockReader {
  setBlock(x: number, y: number, z: number, v: number): void;
  isLoaded(x: number, z: number): boolean;
  ensure?(x: number, z: number): void;
  raw?(cx: number, cz: number): Uint16Array | null;
}

function getItemByName(key: string): ReturnType<typeof getItem> | undefined {
  const k = key.toLowerCase();
  const hit = ITEM_BY_KEY.get(k);
  if (hit) return hit;
  for (let i = 1; i < 1024; i++) { const d = getItem(i); if (d && (d.key === k || d.name.toLowerCase() === k)) return d; }
  return undefined;
}

export interface Appearance { skin: number; hair: number; shirt: number; pants: number; }

export function entTypeCode(e: Entity): number {
  if (e.kind === 'mob') return MOBS[e.type as MobType].code;
  if (e.kind === 'item') return e.item!.id;
  if (e.kind === 'cart') return e.type === 'tntcart' ? 1 : 0;
  return 0;
}

const SIX = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const;
const RAYS: Float32Array = (() => {
  const out: number[] = [];
  for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) for (let k = 0; k < 16; k++) {
    if (i !== 0 && i !== 15 && j !== 0 && j !== 15 && k !== 0 && k !== 15) continue;
    const rx = i / 15 * 2 - 1, ry = j / 15 * 2 - 1, rz = k / 15 * 2 - 1, l = Math.hypot(rx, ry, rz);
    out.push(rx / l, ry / l, rz / l);
  }
  return new Float32Array(out);
})();

export const MF = {
  GROUND: 1, CROUCH: 2, SPRINT: 4, FLY: 8, WATER: 16, EYE_WATER: 32, LAVA: 64, LADDER: 128, CACTUS: 256,
  JUMP: 512, SWING: 1024, EAT: 2048, FORWARD: 4096, RIDE: 8192, PRONE: 16384, CHARGE: 32768,
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
  portalT?: number; portalLock?: boolean;
  travel?: { tx: number; ty: number; tz: number; t: number; ox: number; oy: number; oz: number; axis: number; nether: boolean; dest?: { x: number; y: number; z: number; axis: number; exist: boolean } };
  hurtCd: number; fireT: number; peakY: number; absorb?: number; absorbT?: number; regenT?: number;
  t: { lava: number; suffocate?: number; drown: number; cactus: number; void: number; starve: number; regen: number; fire: number };
  riding?: number;
  speed?: number;
  vel?: { x: number; y: number; z: number };
  vref?: { x: number; y: number; z: number; t: number };
  eqId?: number;
  strengthAt?: number;
  charge?: { t0: number; hits: Record<string, number>; done: boolean };
  eseed?: number;
  lastAttack: number; lastEat: number; lastMove: number; lastShot?: number; wasFire?: boolean; lastSwing?: number; lastHurt?: number;
  op: boolean;
  sel: [number[] | null, number[] | null];
  homes?: Record<string, { x: number; y: number; z: number }>;
  back?: { x: number; y: number; z: number };
  vanished?: boolean;
  skin?: { png: string; slim: boolean } | null;
  kills?: number; deaths?: number; playtime?: number;
  screenTitle?: string;
}

export type EntityKind = 'mob' | 'item' | 'arrow' | 'tnt' | 'cart';
export type ScreenType = 'chest' | 'furnace' | 'workbench' | 'shop' | 'trade' | 'enchant' | 'anvil';

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
  type: MobType | 'item' | 'arrow' | 'tnt' | 'cart' | 'tntcart';
  rider?: string;
  fall?: number;
  wob?: number;
  fuse?: number;
  count?: number;
  base?: number;
  crit?: boolean;
  punch?: number;
  pierce?: number;
  pierced?: number[];
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
  los?: boolean;
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
  | { type: 'furnace'; items: (ItemStack | null)[]; burn: number; burnMax: number; cook: number; xp: number }
  | { type: 'spawner'; items: (ItemStack | null)[]; mob: string; delay: number }
  | { type: 'trial'; items: (ItemStack | null)[]; mob: string; state: 'idle' | 'active' | 'cooldown'; left: number; wave: number[]; until: number }
  | { type: 'vault'; items: (ItemStack | null)[]; opened: string[] }
  | { type: 'portal'; items: (ItemStack | null)[]; axis: number };

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
  | { e: 'pmove'; l: number[] }
  | { e: 'ride'; p: SimPlayer; id: number }
  | { e: 'knock'; p: SimPlayer; x: number; y: number; z: number; set?: boolean }
  | { e: 'work'; p: SimPlayer; items: (ItemStack | null)[]; offers?: TableOffer[] }
  | { e: 'boom'; x: number; y: number; z: number; r: number }
  | { e: 'reject'; p: SimPlayer; x: number; y: number; z: number }
  | { e: 'stats'; p: SimPlayer }
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
  dayLength?: number; nightLength?: number;
  simDistance?: number; randomTickSpeed?: number; mobSpawning?: boolean; mobCap?: number;
  maxHomes?: number; tpa?: boolean; allowMinimap?: boolean; allowCoords?: boolean;
}

const DT = 1 / 20;
const DIFF_DMG: Record<Difficulty, number> = { peaceful: 0, easy: 0.5, normal: 1, hard: 1.5 };
export const RULE_KEYS = ['simDistance', 'randomTickSpeed', 'mobSpawning', 'mobCap', 'maxHomes', 'tpa', 'allowMinimap', 'allowCoords', 'dayLength', 'nightLength'] as const;
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
for (const id of [B.KELP, B.VINE, B.WHEAT, B.OAK_SAPLING, B.BIRCH_SAPLING, B.SPRUCE_SAPLING, B.JUNGLE_SAPLING, B.SUGAR_CANE, B.CACTUS, B.GRASS, B.SNOWY_GRASS, B.ICE, B.FIRE]) TICKABLE[id] = 1;
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

export function breakTime(blockV: number, stack: ItemStack | null, underwater: boolean, aqua = false): number {
  const d = getBlock(blockV);
  if (d.hardness < 0) return Infinity;
  if (d.hardness === 0) return 0.05;
  if (stack?.id === I.SHEARS && (d.render === 'leaves' || d.id === B.VINE || d.sound === 'cloth')) return d.render === 'leaves' ? 0.05 : Math.max(0.05, d.hardness * 0.3);
  const t = toolFor(stack);
  let speed = 1;
  if (t && (t.type === d.tool || (t.type === 'sword' && (d.render === 'leaves' || d.id === B.CACTUS)))) speed = t.type === 'sword' ? 1.5 : t.speed;
  const ef = lvl(stack, 'efficiency');
  if (ef > 0 && speed > 1) speed += ef * ef + 1;
  let time = d.hardness * (canHarvest(blockV, stack) ? 1.5 : 5) / speed;
  if (underwater && !aqua) time *= 5;
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
  book: RecipeBook = BASE_BOOK;
  serverMode = false;

  dataPacks: DataRecipes[] = [];

  setDataPacks(list: DataRecipes[]): void { this.dataPacks = list; this.book = makeBook(mergeData(list)); }
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
  readonly rs: Redstone;
  private hoppers = new Set<string>();
  private rsQuiet = false;
  private now = 0;

  constructor(o: SimOptions) {
    this.seed = o.seed;
    this.store = o.store;
    this.info = new ChunkInfo(o.store, (id) => TICKABLE[id] === 1);
    this.gen = o.gen;
    this.difficulty = o.difficulty;
    this.validateMoves = o.validateMoves;
    this.authoritative = o.authoritative;
    this.emit = (ev) => {
      if (ev.e === 'container' && this.authoritative) { const [x, y, z] = parsePosKey(ev.key); this.rs.containerChanged(x, y, z); }
      o.emit(ev);
    };
    this.rs = new Redstone({
      get: (x, y, z) => this.get(x, y, z),
      raw: (cx, cz) => this.store.raw?.(cx, cz) ?? null,
      setState: (x, y, z, v) => { const q = this.rsQuiet; this.rsQuiet = true; try { this.setBlock(x, y, z, v); } finally { this.rsQuiet = q; } },
      loaded: (x, z) => this.store.isLoaded(x, z),
      tick: () => this.tickCount,
      container: (x, y, z) => {
        const be = this.getBlockEntity(x, y, z);
        if (!be) return null;
        if (be.type !== 'chest' || blockId(this.get(x, y, z)) !== B.CHEST) return be.items;
        const pr = chestPartner(this.store, x, y, z);
        const other = pr ? this.getBlockEntity(pr[0], pr[1], pr[2]) : undefined;
        return other ? [...be.items, ...other.items] : be.items;
      },
      plateHasEntity: (x, y, z, wooden) => this.plateOccupied(x, y, z, wooden),
      sound: (s, x, y, z) => this.emit({ e: 'sound', s, x: x + 0.5, y: y + 0.5, z: z + 0.5 }),
      smoke: (x, y, z) => this.emit({ e: 'particles', k: 'smoke', x: x + 0.5, y: y + 0.7, z: z + 0.5 }),
      breakBlock: (x, y, z) => {
        const v = this.get(x, y, z);
        if (!blockId(v)) return;
        this.setBlock(x, y, z, 0);
        this.spawnDrops(x, y, z, v, null, true);
        this.emit({ e: 'particles', k: 'break', x: x + 0.5, y: y + 0.5, z: z + 0.5, d: v });
      },
      moveEntities: (cells, dir, from, to) => this.moveEntities(cells, dir, from, to),
      animate: (l) => this.emit({ e: 'pmove', l }),
      primeTnt: (x, y, z, fuse) => this.primeTnt(x, y, z, fuse),
      cartAt: (x, y, z) => [...this.entities.values()].some((e) => e.kind === 'cart' && Math.floor(e.x) === x && Math.floor(e.z) === z && Math.abs(Math.floor(e.y) - y) <= 1),
      dispense: (x, y, z, v, dir) => this.dispense(x, y, z, v, dir),
    });
    this.rs.arrivals = (x, y, z, v) => this.setBlock(x, y, z, v);
    this.rs.onHopper = (x, y, z) => this.hoppers.add(posKey(x, y, z));
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
    if (v === 0 && isWaterPlant(blockId(old))) v = B.WATER;
    if (old === v) return;
    this.store.setBlock(x, y, z, v);
    this.emit({ e: 'block', x, y, z, v, old, src });
    this.afterChange(x, y, z, old, v);
  }

  private afterChange(x: number, y: number, z: number, old: number, v: number): void {
    const oid = blockId(old), nid = blockId(v);
    this.info.changed(x, y, z, old, v);
    if (this.authoritative && !this.rsQuiet) this.rs.blockChanged(x, y, z, old, v);
    if (this.authoritative) this.rs.observe(x, y, z);
    if (nid === B.HOPPER && oid !== B.HOPPER && this.authoritative) { this.ensureBlockEntity(x, y, z); this.hoppers.add(posKey(x, y, z)); }
    if (oid === B.CHEST || oid === B.FURNACE || oid === B.FURNACE_LIT) {
      if (!(nid === B.FURNACE || nid === B.FURNACE_LIT) || oid === B.CHEST) this.removeBlockEntity(x, y, z, true);
    }
    if ((oid === B.HOPPER || oid === B.DROPPER || oid === B.DISPENSER) && nid !== oid) this.removeBlockEntity(x, y, z, true);
    if (this.authoritative && nid !== oid && (oid === B.NETHER_PORTAL || oid === B.OBSIDIAN)) {
      if (oid === B.NETHER_PORTAL && this.blockEntities.delete(posKey(x, y, z))) this.emit({ e: 'container', key: posKey(x, y, z) });
      for (const [ax, ay, az] of DIR6) this.checkPortal(x + ax, y + ay, z + az);
    }
    if (this.authoritative && nid !== B.FIRE && blockId(this.get(x, y + 1, z)) === B.FIRE && !isSolid(v)) this.setBlock(x, y + 1, z, 0);
    this.scheduleFluidAround(x, y, z);
    this.fluidContact(x, y, z, isWaterPlant(nid) ? B.WATER : nid);
    this.checkSupport(x, y + 1, z);
    for (let f = 0; f < 4; f++) {
      const [dx, dz] = FACING_DIRS[f];
      this.checkSupport(x - dx, y, z - dz);
    }
    if (!this.noLeafDecay && (oid === B.OAK_LOG || oid === B.BIRCH_LOG || oid === B.SPRUCE_LOG || oid === B.JUNGLE_LOG)) this.scheduleLeafDecay(x, y, z);
    if (nid === B.SAND || nid === B.GRAVEL || isPowder(nid)) this.fallQueue.push([x, y, z, this.tickCount + 2]);
    const up = blockId(this.get(x, y + 1, z));
    if (up === B.SAND || up === B.GRAVEL || isPowder(up)) this.fallQueue.push([x, y + 1, z, this.tickCount + 2]);
    if (isPowder(nid)) this.hardenPowder(x, y, z);
    if (nid === B.WATER) for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) if (isPowder(blockId(this.get(x + dx, y + dy, z + dz)))) this.hardenPowder(x + dx, y + dy, z + dz);
  }

  private fallQueue: [number, number, number, number][] = [];

  private hardenPowder(x: number, y: number, z: number): void {
    const id = blockId(this.get(x, y, z));
    if (!isPowder(id)) return;
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, 0, 1], [0, 0, -1]]) {
      if (blockId(this.get(x + dx, y + dy, z + dz)) === B.WATER) { this.setBlock(x, y, z, id - 16); return; }
    }
  }

  private tickFalling(): void {
    if (!this.fallQueue.length) return;
    const due = this.fallQueue.filter((q) => q[3] <= this.tickCount).slice(0, 64);
    this.fallQueue = this.fallQueue.filter((q) => !due.includes(q));
    for (const [x, y, z] of due) {
      const v = this.get(x, y, z), id = blockId(v);
      if (id !== B.SAND && id !== B.GRAVEL && !isPowder(id)) continue;
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
    if (e?.kind === 'cart' && !p.dead && Math.hypot(e.x - p.x, e.z - p.z) <= 6) {
      const held = heldStack(p.inv);
      if (e.type === 'tntcart' && held?.id === I.FLINT_AND_STEEL) { this.cartFuse(e, 80); if (p.mode === 'survival') { damageHeld(p.inv, 1); this.emit({ e: 'inv', p }); } return true; }
      if (p.riding === e.id) { this.dismount(p); return true; }
      return this.mount(p, e);
    }
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
    if (isNether(p.x)) return;
    for (const v of this.gen.villagesNear(p.x, p.z, 64)) {
      if (!this.store.isLoaded(v.x, v.z)) continue;
      let count = 0;
      for (const e of this.entities.values()) {
        if (e.vid !== v.id) continue;
        count++;
        if (e.bed && Math.hypot(e.x - e.bed[0], e.z - e.bed[1]) < 7 && e.y > v.y + 3) {
          const bx = Math.floor(e.bed[0]), bz = Math.floor(e.bed[1]);
          for (let yy = Math.max(2, v.y - 10); yy < v.y + 14; yy++) if (standable(this.store, bx, yy, bz, true)) { if (yy < e.y - 2) { e.x = e.bed[0]; e.y = yy; e.z = e.bed[1]; e.vx = e.vy = e.vz = 0; } break; }
        }
      }
      const target = Math.min(8, v.homes.length);
      if (count >= target) continue;
      const n = count === 0 ? target : this.rng.chance(0.05) ? 1 : 0;
      for (let i = 0; i < n; i++) {
        const home = v.homes[(count + i) % v.homes.length];
        if (!this.store.isLoaded(home.x, home.z)) continue;
        const sx = home.ix ?? home.x, sz = home.iz ?? home.z;
        if (!this.store.isLoaded(sx, sz)) continue;
        let y = -1;
        for (let yy = Math.max(2, v.y - 10); yy < Math.min(WORLD_HEIGHT - 3, v.y + 14); yy++) {
          if (standable(this.store, sx, yy, sz, true)) { y = yy; break; }
        }
        if (y < 0) continue;
        const e = this.spawnMob('villager', sx + 0.5, y, sz + 0.5);
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
      const id = isWaterPlant(blockId(v)) ? B.WATER : blockId(v);
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
    if (id === B.LEVER || isButton(id)) {
      const o = attachOut(blockMeta(v) & 7);
      const [dx, dy, dz] = DIR6[o ^ 1];
      return isSolid(this.get(x + dx, y + dy, z + dz));
    }
    if (id === B.TORCH || isTorch(id)) {
      const m = blockMeta(v) & 7;
      if (m === 0) return isSolid(this.get(x, y - 1, z));
      const [dx, dz] = FACING_DIRS[(m - 1) & 3];
      return isSolid(this.get(x + dx, y, z + dz));
    }
    if (id === B.LADDER || id === B.VINE) {
      const [dx, dz] = FACING_DIRS[blockMeta(v) & 3];
      return isSolid(this.get(x + dx, y, z + dz)) || (id === B.VINE && blockId(this.get(x, y + 1, z)) === B.VINE);
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
      case 'water-plant': {
        if (id === B.KELP || id === B.KELP_PLANT) { if (below === B.KELP_PLANT || below === B.KELP) return true; }
        return isSolid(this.get(x, y - 1, z)) && below !== B.ICE && below !== B.PACKED_ICE;
      }
      case 'water-edge': {
        if (below === B.SUGAR_CANE) return true;
        if (below !== B.GRASS && below !== B.DIRT && below !== B.SAND && below !== B.MUD) return false;
        for (const [dx, dz] of FACING_DIRS) if (isWaterLike(this.get(x + dx, y - 1, z + dz))) return true;
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
    const rest = isWaterPlant(id) ? B.WATER : 0;
    this.store.setBlock(x, y, z, rest);
    this.emit({ e: 'block', x, y, z, v: rest, old: v });
    this.info.changed(x, y, z, v, rest);
    if (this.authoritative) { this.rs.blockChanged(x, y, z, v, rest); this.rs.observe(x, y, z); }
    if (!(id === B.OAK_DOOR && blockMeta(v) & DOOR_UPPER)) this.spawnDrops(x, y, z, v, null, true);
    this.emit({ e: 'particles', k: 'break', x: x + 0.5, y: y + 0.5, z: z + 0.5, d: v });
    this.checkSupport(x, y + 1, z, depth + 1);
    if (id === B.OAK_DOOR) { this.checkSupport(x, y - 1, z, depth + 1); }
    this.scheduleFluidAround(x, y, z);
  }

  blockDrops(v: number, stack: ItemStack | null, natural: boolean): ItemStack[] {
    const d = getBlock(v);
    const id = d.id;
    if (id === B.SLAB) return [{ id: SLAB_ITEM + (blockMeta(v) & 31), count: 1 }];
    if (id === B.STAIRS) return [{ id: STAIRS_ITEM + (blockMeta(v) & 31), count: 1 }];
    if (!natural && stack?.id === I.SHEARS && (d.render === 'leaves' || id === B.VINE || id === B.SEAGRASS || id === B.TALL_GRASS || id === B.FERN || id === B.DEAD_BUSH)) return [{ id, count: 1 }];
    const silk = !natural && lvl(stack, 'silk_touch') > 0;
    if (silk && canHarvest(v, stack) && d.category !== 'hidden' && d.render !== 'crop' && d.render !== 'door' && !d.fluid && getItem(id)) return [{ id, count: 1 }];
    if (!d.drops) return [];
    if (!natural && !canHarvest(v, stack)) return [];
    const fortune = natural ? 0 : lvl(stack, 'fortune');
    if (id === B.WHEAT) {
      const stage = blockMeta(v) & 7;
      if (stage >= 7) return [{ id: I.WHEAT, count: 1 }, { id: I.SEEDS, count: 1 + this.rng.int(3) }];
      return [{ id: I.SEEDS, count: 1 }];
    }
    if (id === B.GRAVEL) return [{ id: this.rng.chance([0.1, 1 / 7, 0.25, 1][Math.min(3, fortune)]) ? I.FLINT : B.GRAVEL, count: 1 }];
    const out: ItemStack[] = [];
    for (const dr of d.drops) {
      if (dr.chance !== undefined && this.rng.next() >= dr.chance) continue;
      const itemId = dr.item === 'self' ? id : dr.item;
      const min = dr.min ?? 1, max = dr.max ?? min;
      let count = min + this.rng.int(max - min + 1);
      if (fortune > 0 && d.category === 'ore' && itemId !== id) {
        if (id === B.REDSTONE_ORE || id === B.LAPIS_ORE) count += this.rng.int(fortune + 1);
        else count *= Math.max(0, this.rng.int(fortune + 2) - 1) + 1;
      }
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
    else if (id === B.HOPPER) be = { type: 'chest', items: new Array(5).fill(null) };
    else if (id === B.DROPPER || id === B.DISPENSER) be = { type: 'chest', items: new Array(9).fill(null) };
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
    if (drop && (be.type === 'chest' || be.type === 'furnace')) for (const s of be.items) if (s) this.spawnItem(x + 0.5, y + 0.5, z + 0.5, s);
    for (const p of this.players.values()) {
      if (p.screen.type && p.screen.x === x && p.screen.y === y && p.screen.z === z && p.screen.type !== 'workbench') this.closeScreen(p);
    }
    this.emit({ e: 'container', key: k });
  }

  addGeneratedChest(x: number, y: number, z: number, items: (ItemStack | null)[], type: 'chest' | 'spawner' | 'trial' | 'vault' = 'chest', mob = 'hollowed'): void {
    const k = posKey(x, y, z);
    if (this.blockEntities.has(k)) return;
    if (type === 'spawner') this.blockEntities.set(k, { type: 'spawner', items: [], mob, delay: 200 });
    else if (type === 'trial') this.blockEntities.set(k, { type: 'trial', items: [], mob, state: 'idle', left: 0, wave: [], until: 0 });
    else if (type === 'vault') this.blockEntities.set(k, { type: 'vault', items: [], opened: [] });
    else this.blockEntities.set(k, { type: 'chest', items: items.map(cloneStack) });
  }

  private tickSpawners(): void {
    if (this.tickCount % 10 !== 0 || !this.authoritative) return;
    for (const [k, be] of this.blockEntities) {
      if (be.type !== 'spawner' && be.type !== 'trial') continue;
      const [x, y, z] = k.split(',').map(Number);
      if (!this.store.isLoaded(x, z)) continue;
      const id = blockId(this.get(x, y, z));
      if ((be.type === 'spawner' && id !== B.SPAWNER) || (be.type === 'trial' && id !== B.TRIAL_SPAWNER)) { this.blockEntities.delete(k); continue; }
      let near: SimPlayer[] = [];
      for (const p of this.players.values()) if (!p.dead && p.mode === 'survival' && Math.abs(p.x - x) < 15 && Math.abs(p.y - y) < 10 && Math.abs(p.z - z) < 15) near.push(p);
      if (this.difficulty === 'peaceful') near = [];
      const type = (MOBS[be.mob as MobType] ? be.mob : 'hollowed') as MobType;
      const place = (): Entity | null => {
        for (let tries = 0; tries < 8; tries++) {
          const sx = x + this.rng.int(9) - 4, sz = z + this.rng.int(9) - 4, sy = y + this.rng.int(3) - 1;
          if (standable(this.store, sx, sy, sz, true)) { const e = this.spawnMob(type, sx + 0.5, sy, sz + 0.5); e.persistent = true; this.emit({ e: 'particles', k: 'smoke', x: sx + 0.5, y: sy + 1, z: sz + 0.5 }); return e; }
        }
        return null;
      };
      if (be.type === 'spawner') {
        if (!near.length) continue;
        be.delay -= 10;
        if (be.delay > 0) continue;
        be.delay = 200 + this.rng.int(600);
        let count = 0;
        for (const e of this.entities.values()) if (e.kind === 'mob' && e.type === type && Math.abs(e.x - x) < 9 && Math.abs(e.z - z) < 9) count++;
        if (count >= 6) continue;
        for (let i = 0, n = 1 + this.rng.int(4); i < n; i++) place();
        continue;
      }
      if (be.state === 'cooldown') { if (this.now >= be.until) be.state = 'idle'; continue; }
      if (be.state === 'idle') {
        if (!near.length) continue;
        be.state = 'active'; be.left = 4 + 2 * (near.length - 1); be.wave = [];
        this.emit({ e: 'sound', s: 'mob.hurt', x: x + 0.5, y: y + 0.5, z: z + 0.5 });
      }
      be.wave = be.wave.filter((eid) => { const e = this.entities.get(eid); return !!e && e.health > 0; });
      if (be.left > 0 && be.wave.length < 2 && this.tickCount % 40 === 0) { const e = place(); if (e) { be.wave.push(e.id); be.left--; } }
      if (be.left <= 0 && !be.wave.length) {
        be.state = 'cooldown'; be.until = this.now + 30 * 60_000;
        const loot = trialLoot(this.rng);
        for (const st of loot) this.spawnItem(x + 0.5, y + 1.2, z + 0.5, st, (this.rng.next() - 0.5) * 2, 3, (this.rng.next() - 0.5) * 2, 10);
        this.emit({ e: 'sound', s: 'player.levelup', x: x + 0.5, y: y + 0.5, z: z + 0.5 });
      }
      if (!near.length && be.state === 'active' && be.wave.length === 0 && be.left > 0) { be.state = 'idle'; }
    }
  }

  openVault(p: SimPlayer, x: number, y: number, z: number): boolean {
    const k = posKey(x, y, z);
    let be = this.blockEntities.get(k);
    if (!be) { this.addGeneratedChest(x, y, z, [], 'vault'); be = this.blockEntities.get(k); }
    if (!be || be.type !== 'vault') return false;
    const held = heldStack(p.inv);
    if (be.opened.includes(p.id)) { this.emit({ e: 'msg', text: 'You have already opened this vault.', kind: 'info', to: p.id }); return true; }
    if (held?.id !== I.TRIAL_KEY) { this.emit({ e: 'msg', text: 'This vault needs a Trial Key. Clear a Trial Cage to get one.', kind: 'info', to: p.id }); return true; }
    consumeHeld(p.inv);
    be.opened.push(p.id);
    for (const st of vaultLoot(this.rng)) this.spawnItem(x + 0.5, y + 1.1, z + 0.5, st, (this.rng.next() - 0.5) * 2, 3, (this.rng.next() - 0.5) * 2, 10);
    this.emit({ e: 'sound', s: 'player.levelup', x: x + 0.5, y: y + 0.5, z: z + 0.5 });
    this.emit({ e: 'inv', p });
    this.emit({ e: 'container', key: k });
    return true;
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
    if (p.riding !== undefined) this.dismount(p);
    if (p.screen.type) this.closeScreen(p);
    else if (p.inv.cursor || p.inv.craft.some(Boolean)) applyInvOp(this.invCtx(p), { t: 'close' });
    this.game?.onLeave(p);
    this.players.delete(id);
  }

  private portalEmpty(v: number): boolean { const id = v & 255; return id === 0 || id === B.FIRE || id === B.NETHER_PORTAL; }

  portalShape(x: number, y: number, z: number, axis: number): { x: number; y: number; z: number; w: number; h: number } | null {
    const dx = axis === 0 ? 1 : 0, dz = 1 - dx;
    const lim = Math.max(1, y - 21);
    while (y > lim && this.portalEmpty(this.get(x, y - 1, z))) y--;
    const dist = (sx: number, sz: number, sg: number): number => {
      for (let i = 0; i <= 21; i++) {
        const px = sx + dx * sg * i, pz = sz + dz * sg * i;
        const v = this.get(px, y, pz);
        if (!this.portalEmpty(v)) return v === B.OBSIDIAN ? i : 0;
        if (this.get(px, y - 1, pz) !== B.OBSIDIAN) return 0;
      }
      return 0;
    };
    const left = dist(x, z, -1) - 1;
    if (left < 0) return null;
    const bx = x - dx * left, bz = z - dz * left;
    const w = dist(bx, bz, 1);
    if (w < 2 || w > 21) return null;
    let h = 0;
    scan: for (; h < 21; h++) {
      if (this.get(bx - dx, y + h, bz - dz) !== B.OBSIDIAN || this.get(bx + dx * w, y + h, bz + dz * w) !== B.OBSIDIAN) break;
      for (let i = 0; i < w; i++) if (!this.portalEmpty(this.get(bx + dx * i, y + h, bz + dz * i))) break scan;
    }
    if (h < 3) return null;
    for (let i = 0; i < w; i++) if (this.get(bx + dx * i, y + h, bz + dz * i) !== B.OBSIDIAN) return null;
    return { x: bx, y, z: bz, w, h };
  }

  lightPortal(x: number, y: number, z: number): boolean {
    for (const axis of [0, 1]) {
      const sh = this.portalShape(x, y, z, axis);
      if (!sh) continue;
      const dx = axis === 0 ? 1 : 0, dz = 1 - dx;
      for (let h = 0; h < sh.h; h++) for (let i = 0; i < sh.w; i++) this.setBlock(sh.x + dx * i, sh.y + h, sh.z + dz * i, makeBlock(B.NETHER_PORTAL, axis));
      this.blockEntities.set(posKey(sh.x, sh.y, sh.z), { type: 'portal', items: [], axis });
      this.emit({ e: 'container', key: posKey(sh.x, sh.y, sh.z) });
      this.emit({ e: 'sound', s: 'portal.trigger', x: x + 0.5, y: y + 0.5, z: z + 0.5 });
      return true;
    }
    return false;
  }

  private checkPortal(x: number, y: number, z: number): void {
    const v = this.get(x, y, z);
    if (blockId(v) !== B.NETHER_PORTAL) return;
    const dx = (blockMeta(v) & 1) === 0 ? 1 : 0, dz = 1 - dx;
    for (const [ax, ay, az] of [[dx, 0, dz], [-dx, 0, -dz], [0, 1, 0], [0, -1, 0]]) {
      if (!this.store.isLoaded(x + ax, z + az)) continue;
      const n = this.get(x + ax, y + ay, z + az);
      if (n !== B.OBSIDIAN && blockId(n) !== B.NETHER_PORTAL) { this.setBlock(x, y, z, 0); return; }
    }
  }

  private tickPortal(p: SimPlayer): void {
    if (p.travel) { this.tickTravel(p); return; }
    const bx = Math.floor(p.x), bz = Math.floor(p.z), by = Math.floor(p.y + 0.1);
    const v0 = this.get(bx, by, bz), v1 = this.get(bx, by + 1, bz);
    const pv = blockId(v0) === B.NETHER_PORTAL ? v0 : blockId(v1) === B.NETHER_PORTAL ? v1 : 0;
    if (!pv) { p.portalLock = false; if (p.portalT) p.portalT = Math.max(0, p.portalT - 4); return; }
    if (p.portalLock || p.riding !== undefined) return;
    p.portalT = (p.portalT ?? 0) + 1;
    if (p.portalT < (p.mode === 'creative' ? 1 : 80)) return;
    const nether = !isNether(p.x);
    const [tx, tz] = nether ? toNether(p.x, p.z) : toOverworld(p.x, p.z);
    const ty = Math.max(nether ? NETHER_LAVA + 4 : 8, Math.min(nether ? NETHER_HEIGHT - 12 : WORLD_HEIGHT - 12, Math.floor(p.y)));
    p.travel = { tx, ty, tz, t: 0, ox: p.x, oy: p.y, oz: p.z, axis: blockMeta(pv) & 1, nether };
    p.portalT = 0; p.portalLock = true;
    if (p.screen.type) this.closeScreen(p);
    this.emit({ e: 'sound', s: 'portal.travel', x: p.x, y: p.y, z: p.z, to: p.id });
    this.movePlayerTo(p, tx + 0.5, ty, tz + 0.5);
  }

  private movePlayerTo(p: SimPlayer, x: number, y: number, z: number): void {
    p.x = x; p.y = y; p.z = z; p.peakY = y; p.vel = undefined;
    this.emit({ e: 'tp', p });
  }

  private nearestPortal(x: number, y: number, z: number, r: number, nether: boolean): { x: number; y: number; z: number; axis: number } | null {
    let best: { x: number; y: number; z: number; axis: number } | null = null, bd = Infinity;
    for (const [k, be] of this.blockEntities) {
      if (be.type !== 'portal') continue;
      const [px, py, pz] = k.split(',').map(Number);
      if (isNether(px) !== nether || Math.abs(px - x) > r || Math.abs(pz - z) > r) continue;
      const d = (px - x) ** 2 + (py - y) ** 2 + (pz - z) ** 2;
      if (d < bd) { bd = d; best = { x: px, y: py, z: pz, axis: be.axis }; }
    }
    return best;
  }

  private tickTravel(p: SimPlayer): void {
    const tr = p.travel!;
    if (++tr.t > 600) { p.travel = undefined; this.movePlayerTo(p, tr.ox, tr.oy, tr.oz); return; }
    if (!tr.dest) {
      const found = this.nearestPortal(tr.tx, tr.ty, tr.tz, tr.nether ? 16 : 128, tr.nether);
      tr.dest = found ? { ...found, exist: true } : { x: tr.tx, y: tr.ty, z: tr.tz, axis: tr.axis, exist: false };
      if (found) this.movePlayerTo(p, found.x + 0.5, found.y, found.z + 0.5);
    }
    const d = tr.dest;
    const R = d.exist ? 2 : 16;
    for (let ox = -R; ox <= R; ox += R) for (let oz = -R; oz <= R; oz += R) { this.store.ensure?.(d.x + ox, d.z + oz); if (!this.store.isLoaded(d.x + ox, d.z + oz)) return; }
    if (tr.t < 3) return;
    if (d.exist && blockId(this.get(d.x, d.y, d.z)) !== B.NETHER_PORTAL) {
      this.blockEntities.delete(posKey(d.x, d.y, d.z));
      this.emit({ e: 'container', key: posKey(d.x, d.y, d.z) });
      tr.dest = undefined;
      this.movePlayerTo(p, tr.tx + 0.5, tr.ty, tr.tz + 0.5);
      return;
    }
    const at = d.exist ? d : this.makePortal(d.x, d.y, d.z, d.axis, tr.nether);
    p.travel = undefined;
    p.portalLock = true;
    p.fireT = Math.min(p.fireT, 0);
    this.movePlayerTo(p, at.x + (at.axis === 0 ? 1 : 0.5), at.y, at.z + (at.axis === 0 ? 0.5 : 1));
    this.emit({ e: 'sound', s: 'portal.travel', x: p.x, y: p.y, z: p.z, to: p.id });
  }

  makePortal(tx: number, ty: number, tz: number, axis: number, nether: boolean): { x: number; y: number; z: number; axis: number } {
    const lo = nether ? NETHER_LAVA + 2 : 2, hi = nether ? NETHER_HEIGHT - 8 : WORLD_HEIGHT - 8;
    let best: [number, number, number, number] | null = null, bd = Infinity;
    const fits = (x: number, y: number, z: number, a: number): boolean => {
      const dx = a === 0 ? 1 : 0, dz = 1 - dx;
      for (let i = 0; i < 4; i++) for (let j = -1; j <= 1; j++) {
        const px = x + dx * i + dz * j, pz = z + dz * i + dx * j;
        if (!isSolid(this.get(px, y - 1, pz))) return false;
        for (let h = 0; h < 4; h++) if (this.get(px, y + h, pz) !== 0) return false;
      }
      return true;
    };
    for (let ox = -12; ox <= 12; ox++) for (let oz = -12; oz <= 12; oz++) {
      const x = tx + ox, z = tz + oz;
      let air = 0;
      for (let y = hi + 3; y >= lo; y--) {
        const v = this.get(x, y, z);
        if (v === 0) { air++; continue; }
        const run = air;
        air = 0;
        if (run < 4 || !isSolid(v)) continue;
        const d = ox * ox + oz * oz + (y + 1 - ty) ** 2;
        if (d >= bd) continue;
        for (const a of [axis, 1 - axis]) if (fits(x, y + 1, z, a)) { bd = d; best = [x, y + 1, z, a]; break; }
      }
    }
    let [x, y, z, a] = best ?? [tx - 1, Math.max(nether ? 40 : 70, Math.min(hi - 2, ty)), tz, axis];
    const dx = a === 0 ? 1 : 0, dz = 1 - dx;
    if (!best) {
      for (let i = 0; i < 4; i++) for (let j = -1; j <= 1; j++) {
        const px = x + dx * i + dz * j, pz = z + dz * i + dx * j;
        this.setBlock(px, y - 1, pz, B.OBSIDIAN);
        for (let h = 0; h < 4; h++) this.setBlock(px, y + h, pz, 0);
      }
    }
    for (let i = 0; i < 4; i++) for (let h = -1; h <= 3; h++) {
      if (i === 0 || i === 3 || h === -1 || h === 3) this.setBlock(x + dx * i, y + h, z + dz * i, B.OBSIDIAN);
    }
    for (let i = 1; i <= 2; i++) for (let h = 0; h < 3; h++) this.setBlock(x + dx * i, y + h, z + dz * i, makeBlock(B.NETHER_PORTAL, a));
    const k = posKey(x + dx, y, z + dz);
    this.blockEntities.set(k, { type: 'portal', items: [], axis: a });
    this.emit({ e: 'container', key: k });
    return { x: x + dx, y, z: z + dz, axis: a };
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
    if (p.riding !== undefined) {
      const cart = this.entities.get(p.riding);
      p.yaw = yaw; p.pitch = pitch; p.lastMove = this.now;
      p.flags = flags | MF.RIDE;
      if (!cart || flags & MF.CROUCH) { this.dismount(p); return true; }
      p.vel = { x: cart.vx, y: cart.vy, z: cart.vz };
      p.speed = Math.hypot(cart.vx, cart.vz);
      p.x = cart.x; p.y = cart.y + 0.35; p.z = cart.z; p.peakY = p.y;
      return true;
    }
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
    this.trackVelocity(p, x, y, z);
    p.x = x; p.y = y; p.z = z; p.yaw = yaw; p.pitch = pitch;
    p.lastMove = this.now;
    const prevFlags = p.flags;
    p.flags = flags;
    if (p.mode === 'survival' && this.difficulty !== 'peaceful') {
      if (flags & MF.SPRINT) p.exh += horiz * 0.1;
      else if (flags & MF.WATER) p.exh += horiz * 0.01;
      if (flags & MF.JUMP && !(prevFlags & MF.JUMP)) p.exh += flags & MF.SPRINT ? 0.2 : 0.05;
    }
    const onSlime = !(flags & MF.CROUCH) && blockId(this.get(Math.floor(x), Math.floor(y - 0.6), Math.floor(z))) === B.SLIME_BLOCK;
    const safe = flags & (MF.WATER | MF.LADDER | MF.FLY) || p.mode === 'creative' || onSlime;
    if (safe) p.peakY = y;
    else if (flags & MF.GROUND) {
      const under = blockId(this.get(Math.floor(x), Math.floor(y - 0.2), Math.floor(z)));
      let fall = p.peakY - y;
      if (under === B.SLIME_BLOCK && !(flags & MF.CROUCH)) fall = 0;
      if (under === B.HONEY_BLOCK) fall = 3 + (fall - 3) * 0.2;
      if (fall > 3.0001) this.damage(p, Math.ceil(fall - 3), 'fall', p.x, p.z, false);
      p.peakY = y;
    } else p.peakY = Math.max(p.peakY, y);
    if (p.screen.type && p.screen.y >= 0 && !this.inReach(p, p.screen.x, p.screen.y, p.screen.z, 3)) this.closeScreen(p);
    return true;
  }

  private protectionPoints(p: SimPlayer, cause: string): number {
    const fire = cause === 'fire' || cause === 'lava', blast = cause === 'explosion', proj = cause === 'arrow' || this.projectileHit, fall = cause === 'fall';
    let n = 0;
    for (const a of p.inv.armor) {
      if (!a?.en) continue;
      n += a.en.protection ?? 0;
      if (fire) n += 2 * (a.en.fire_protection ?? 0);
      if (blast) n += 2 * (a.en.blast_protection ?? 0);
      if (proj) n += 2 * (a.en.projectile_protection ?? 0);
      if (fall) n += 3 * (a.en.feather_falling ?? 0);
    }
    return n;
  }

  private projectileHit = false;

  private thorns(p: SimPlayer, by: { mob?: Entity; pl?: SimPlayer }): void {
    this.hitBy = null;
    for (let i = 0; i < 4; i++) {
      const a = p.inv.armor[i], l = a?.en?.thorns ?? 0;
      if (!a || l <= 0 || this.rng.next() >= 0.15 * l) continue;
      const d = l > 10 ? l - 10 : 1 + this.rng.int(4);
      if (by.mob) { const dx = by.mob.x - p.x, dz = by.mob.z - p.z, ll = Math.hypot(dx, dz) || 1; this.hurtMob(by.mob, d, p.id, dx / ll, dz / ll); }
      else if (by.pl && !by.pl.dead) this.damage(by.pl, d, 'thorns', p.x, p.z, true, false, p.name);
      const max = getItem(a.id)?.armor?.durability ?? 0;
      a.dmg = (a.dmg ?? 0) + 2;
      if (max && a.dmg >= max) p.inv.armor[i] = null;
      this.emit({ e: 'inv', p });
    }
  }

  private trackVelocity(p: SimPlayer, x: number, y: number, z: number): void {
    const r = p.vref;
    if (!r || this.now - r.t > 400) { p.vref = { x, y, z, t: this.now }; if (!r) p.vel = { x: 0, y: 0, z: 0 }; return; }
    const dt = (this.now - r.t) / 1000;
    if (dt < 0.045) return;
    const v = { x: (x - r.x) / dt, y: (y - r.y) / dt, z: (z - r.z) / dt };
    const o = p.vel ?? v;
    p.vel = { x: o.x * 0.3 + v.x * 0.7, y: o.y * 0.3 + v.y * 0.7, z: o.z * 0.3 + v.z * 0.7 };
    p.speed = Math.hypot(p.vel.x, p.vel.z);
    p.vref = { x, y, z, t: this.now };
  }

  damage(p: SimPlayer, amount: number, cause: string, fx: number, fz: number, knock = true, bypassArmor = false, killer?: string, kb = 0.4): void {
    if (p.dead || p.mode === 'creative' || amount <= 0 || p.travel) return;
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
      dmg = armorReduce(p.inv, amount, armorToughness(p.inv), this.hitBy?.breach ?? 0);
      if (ap > 0) { damageArmor(p.inv, amount); this.emit({ e: 'inv', p }); }
    }
    if (cause !== 'void' && cause !== 'starve' && cause !== 'kill') {
      const epf = this.protectionPoints(p, cause);
      if (epf > 0) dmg *= 1 - Math.min(20, epf) / 25;
    }
    if (this.hitBy && (cause === 'player' || MOBS[cause as MobType])) this.thorns(p, this.hitBy);
    dmg = Math.round(dmg * 100) / 100;
    if (dmg <= 0) return;
    if (p.absorb && p.absorb > 0) {
      const take = Math.min(p.absorb, dmg);
      p.absorb = Math.round((p.absorb - take) * 100) / 100;
      dmg = Math.round((dmg - take) * 100) / 100;
      if (dmg <= 0) {
        this.emit({ e: 'hurt', p, amount: take, cause, fx: knock ? fx : p.x, fz: knock ? fz : p.z, kb: knock ? kb : 0 });
        this.emit({ e: 'sound', s: 'player.hurt', x: p.x, y: p.y + 1, z: p.z });
        this.emit({ e: 'vitals', p });
        return;
      }
    }
    p.health = Math.max(0, Math.round((p.health - dmg) * 100) / 100);
    p.exh += 0.1;
    this.emit({ e: 'hurt', p, amount: dmg, cause, fx: knock ? fx : p.x, fz: knock ? fz : p.z, kb: knock ? kb : 0 });
    this.emit({ e: 'sound', s: 'player.hurt', x: p.x, y: p.y + 1, z: p.z });
    this.emit({ e: 'vitals', p });
    if (p.health <= 0) this.kill(p, cause, killer);
  }

  private kill(p: SimPlayer, cause: string, killer?: string): void {
    if (p.riding !== undefined) this.dismount(p);
    p.dead = true;
    p.deaths = (p.deaths ?? 0) + 1;
    if (cause === 'player' && killer) { const k = this.findPlayer(killer); if (k && k !== p) { k.kills = (k.kills ?? 0) + 1; this.emit({ e: 'stats', p: k }); } }
    this.emit({ e: 'stats', p });
    p.back = { x: p.x, y: p.y, z: p.z };
    p.dig = null;
    const msgs: Record<string, string> = {
      fall: 'hit the ground too hard', lava: 'tried to swim in lava', drown: 'ran out of air', suffocate: 'suffocated in a wall', cactus: 'was pricked to death',
      void: 'fell out of the world', starve: 'starved to death', fire: 'burned to a crisp', arrow: 'was shot by a Skeleton',
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
      if (lvl(s, 'vanishing_curse') > 0) continue;
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
    let kind: 'chest' | 'furnace' | 'enchant' | 'anvil' | null = null;
    let split: ((joined: (ItemStack | null)[]) => void) | null = null;
    if (p.screen.type === 'enchant' || p.screen.type === 'anvil') { container = this.workSlots(p); kind = p.screen.type; }
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
      book: this.book,
    };
  }

  invOp(p: SimPlayer, op: InvOp): { ok: boolean; hash: number } {
    if (p.dead && op.t !== 'close') return { ok: false, hash: invHash(p.inv) };
    const ctx = this.invCtx(p);
    const wasFurnaceOut = op.t === 'click' && op.s.c === 'cont' && op.s.i === 2 && ctx.containerKind === 'furnace' || op.t === 'quick' && op.s.c === 'cont' && op.s.i === 2 && ctx.containerKind === 'furnace';
    const ok = applyInvOp(ctx, op);
    if (ctx.split && ctx.container) ctx.split(ctx.container);
    if (ok && (ctx.containerKind === 'enchant' || ctx.containerKind === 'anvil') && op.t !== 'close') this.emitWork(p);
    if (ok) {
      if (ctx.container && ctx.containerKind !== 'enchant' && ctx.containerKind !== 'anvil') {
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
        this.returnWork(p);
        p.screen.type = null;
        if (this.authoritative) this.finishVirtual(p, p.screen.x, p.screen.y, p.screen.z);
        this.emit({ e: 'screen', p });
        if (was === 'chest') this.emit({ e: 'chestLid', x: p.screen.x, y: p.screen.y, z: p.screen.z, n: this.chestViewers(p.screen.x, p.screen.y, p.screen.z) });
      }
    }
    if (!ok) this.emit({ e: 'inv', p });
    return { ok, hash: invHash(p.inv) };
  }

  giveXp(p: SimPlayer, n: number): void {
    if (n <= 0) return;
    const mend = [heldStack(p.inv), p.inv.off?.[0] ?? null, ...p.inv.armor].filter((s): s is ItemStack => !!s && lvl(s, 'mending') > 0 && (s.dmg ?? 0) > 0);
    if (mend.length) {
      const s = mend[this.rng.int(mend.length)];
      const fix = Math.min(s.dmg!, n * 2);
      s.dmg! -= fix;
      if (s.dmg === 0) delete s.dmg;
      n -= Math.ceil(fix / 2);
      this.emit({ e: 'inv', p });
      if (n <= 0) { this.emit({ e: 'sound', s: 'player.xp', x: p.x, y: p.y, z: p.z, to: p.id }); return; }
    }
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

  onVirtualClose: ((p: SimPlayer, kind: string, items: (ItemStack | null)[]) => void) | null = null;
  private virtualKinds = new Map<string, string>();
  private virtualSeq = 0;

  emitInv(p: SimPlayer): void { this.emit({ e: 'inv', p }); }

  openVirtual(p: SimPlayer, kind: string, size: number, title: string): void {
    if (p.screen.type) this.closeScreen(p);
    const x = 1_000_000 + (this.virtualSeq++ % 100000);
    const k = posKey(x, -64, 0);
    this.blockEntities.set(k, { type: 'chest', items: new Array(size).fill(null) });
    this.virtualKinds.set(k, kind);
    p.screen = { type: 'chest', x, y: -64, z: 0 };
    p.screenTitle = title;
    p.inv.craftSize = 2;
    this.emit({ e: 'screen', p });
    this.emit({ e: 'inv', p });
  }

  private finishVirtual(p: SimPlayer, x: number, y: number, z: number): void {
    if (y !== -64) return;
    const k = posKey(x, y, z);
    const be = this.blockEntities.get(k);
    const kind = this.virtualKinds.get(k) ?? 'box';
    this.blockEntities.delete(k);
    this.virtualKinds.delete(k);
    p.screenTitle = undefined;
    if (!be || be.type !== 'chest') return;
    if (this.onVirtualClose) this.onVirtualClose(p, kind, be.items);
    else for (const st of be.items) if (st) { const left = giveItem(p.inv, st); if (left > 0) this.spawnItem(p.x, p.y + 1, p.z, { ...st, count: left }, 0, 2, 0, 20); }
    this.emit({ e: 'inv', p });
  }

  closeScreen(p: SimPlayer): void {
    if (!p.screen.type) return;
    { const ctx = this.invCtx(p); applyInvOp(ctx, { t: 'close' }); if (ctx.split && ctx.container) ctx.split(ctx.container); }
    this.returnWork(p);
    const was = p.screen.type;
    p.screen.type = null;
    this.finishVirtual(p, p.screen.x, p.screen.y, p.screen.z);
    if (was === 'chest') this.emit({ e: 'chestLid', x: p.screen.x, y: p.screen.y, z: p.screen.z, n: this.chestViewers(p.screen.x, p.screen.y, p.screen.z) });
    this.emit({ e: 'screen', p });
    this.emit({ e: 'inv', p });
  }

  openScreen(p: SimPlayer, type: ScreenType, x: number, y: number, z: number): void {
    const prev = p.screen.type === 'chest' ? { ...p.screen } : null;
    if (p.screen.type) { const ctx = this.invCtx(p); applyInvOp(ctx, { t: 'close' }); if (ctx.split && ctx.container) ctx.split(ctx.container); }
    this.returnWork(p);
    p.screen = { type, x, y, z };
    p.inv.craftSize = type === 'workbench' ? 3 : 2;
    if (prev) this.emit({ e: 'chestLid', x: prev.x, y: prev.y, z: prev.z, n: this.chestViewers(prev.x, prev.y, prev.z) });
    if (type === 'chest' || type === 'furnace') this.ensureBlockEntity(x, y, z);
    if (type === 'chest') { const pr = chestPartner(this.store, x, y, z); if (pr) this.ensureBlockEntity(pr[0], pr[1], pr[2]); this.emit({ e: 'chestLid', x, y, z, n: this.chestViewers(x, y, z) }); }
    this.emit({ e: 'screen', p });
    this.emit({ e: 'inv', p });
    if (type === 'enchant' || type === 'anvil') this.emitWork(p);
  }

  private work = new Map<string, (ItemStack | null)[]>();

  workSlots(p: SimPlayer): (ItemStack | null)[] {
    let w = this.work.get(p.id);
    if (!w) this.work.set(p.id, (w = [null, null]));
    return w;
  }

  setWork(p: SimPlayer, items: (ItemStack | null)[]): void { this.work.set(p.id, [items[0] ?? null, items[1] ?? null]); }

  private returnWork(p: SimPlayer): void {
    const w = this.work.get(p.id);
    if (!w) return;
    this.work.delete(p.id);
    if (!this.authoritative) return;
    let any = false;
    for (const st of w) if (st) { any = true; const left = giveItem(p.inv, st); if (left > 0) this.spawnItem(p.x, p.y + 1, p.z, { ...st, count: left }, 0, 2, 0, 20); }
    if (any) this.emit({ e: 'inv', p });
  }

  bookshelves(x: number, y: number, z: number): number {
    let n = 0;
    for (let dy = 0; dy <= 1; dy++) for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      if (Math.abs(dx) !== 2 && Math.abs(dz) !== 2) continue;
      if (blockId(this.get(x + dx, y + dy, z + dz)) !== B.BOOKSHELF) continue;
      const mid = this.get(x + Math.trunc(dx / 2), y + dy, z + Math.trunc(dz / 2));
      const md = getBlock(mid);
      if (blockId(mid) === 0 || md.replaceable || (!md.solid && md.render !== 'cube')) n++;
    }
    return n;
  }

  enchantOffers(p: SimPlayer): TableOffer[] {
    if (p.eseed === undefined || p.eseed === 0) p.eseed = (this.rng.next() * 0x7fffffff) | 0 || 1;
    const w = this.workSlots(p);
    return tableOffers(p.eseed, w[0], this.bookshelves(p.screen.x, p.screen.y, p.screen.z));
  }

  private emitWork(p: SimPlayer): void {
    const items = this.workSlots(p);
    this.emit({ e: 'work', p, items, offers: p.screen.type === 'enchant' ? this.enchantOffers(p) : undefined });
  }

  private levelOf(p: SimPlayer): number { return xpLevel(p.xp).level; }

  takeLevels(p: SimPlayer, n: number): void {
    const cur = xpLevel(p.xp);
    const target = Math.max(0, cur.level - n);
    let total = 0;
    for (let l = 0; l < target; l++) total += l < 16 ? 2 * l + 7 : l < 31 ? 5 * l - 38 : 9 * l - 158;
    const need = target < 16 ? 2 * target + 7 : target < 31 ? 5 * target - 38 : 9 * target - 158;
    p.xp = total + Math.floor(cur.progress * need);
    this.emit({ e: 'vitals', p });
  }

  enchant(p: SimPlayer, slot: number): boolean {
    if (p.dead || p.screen.type !== 'enchant' || !Number.isInteger(slot) || slot < 0 || slot > 2) return false;
    if (blockId(this.get(p.screen.x, p.screen.y, p.screen.z)) !== B.ENCHANTING_TABLE) return false;
    const w = this.workSlots(p);
    const item = w[0];
    if (!item) return false;
    const offer = this.enchantOffers(p)[slot];
    const creative = p.mode === 'creative';
    if (!offer || offer.cost <= 0) return false;
    if (!creative && (this.levelOf(p) < offer.cost || (w[1]?.count ?? 0) < slot + 1)) return false;
    const list = tableList(p.eseed!, item.id, slot, offer.cost);
    if (!list.length) return false;
    if (item.id === I.BOOK) item.id = I.ENCHANTED_BOOK;
    item.en = Object.fromEntries(list);
    if (!creative) {
      const lap = w[1]!;
      lap.count -= slot + 1;
      if (lap.count <= 0) w[1] = null;
      this.takeLevels(p, slot + 1);
    }
    p.eseed = (new JavaRandom(p.eseed!).nextInt()) || 1;
    this.emit({ e: 'sound', s: 'enchant.use', x: p.screen.x + 0.5, y: p.screen.y + 1, z: p.screen.z + 0.5 });
    this.emitWork(p);
    return true;
  }

  anvil(p: SimPlayer, name: string | null): boolean {
    if (p.dead || p.screen.type !== 'anvil') return false;
    if (blockId(this.get(p.screen.x, p.screen.y, p.screen.z)) !== B.ANVIL) return false;
    const w = this.workSlots(p);
    const creative = p.mode === 'creative';
    const r = anvilResult(w[0], w[1], typeof name === 'string' ? name : null, maxDurability, creative, (id) => ingredientMatches('planks', id));
    if (!r.stack || r.tooExpensive) return false;
    if (!creative && this.levelOf(p) < r.cost) return false;
    if (p.inv.cursor) return false;
    p.inv.cursor = r.stack;
    w[0] = null;
    if (w[1]) {
      if (r.useMaterial > 0) { w[1].count -= r.useMaterial; if (w[1].count <= 0) w[1] = null; }
      else w[1] = null;
    }
    if (!creative) this.takeLevels(p, r.cost);
    this.emit({ e: 'sound', s: 'anvil.use', x: p.screen.x + 0.5, y: p.screen.y + 1, z: p.screen.z + 0.5 });
    this.emit({ e: 'inv', p });
    this.emitWork(p);
    return true;
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
      const need = breakTime(v, stack, !!(p.flags & MF.EYE_WATER), lvl(p.inv.armor[0], 'aqua_affinity') > 0);
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
        if (toolFor(stack) || stack?.id === I.SHEARS) this.emit({ e: 'inv', p });
        if (broke) this.emit({ e: 'sound', s: 'tool.break', x: p.x, y: p.y + 1, z: p.z });
      }
      p.exh += 0.005;
      this.spawnDrops(x, y, z, v, stack, false);
      const [a, b] = d.xp;
      if (b > 0 && canHarvest(v, stack)) this.giveXp(p, a + this.rng.int(b - a + 1));
    }
  }

  use(p: SimPlayer, x: number, y: number, z: number, nx: number, ny: number, nz: number, forcePlace = false, hy = 0.5): boolean {
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
      if (id === B.ENCHANTING_TABLE) { this.openScreen(p, 'enchant', x, y, z); return true; }
      if (id === B.ANVIL) { this.openScreen(p, 'anvil', x, y, z); return true; }
      if (id === B.CHEST) { this.openScreen(p, 'chest', x, y, z); return true; }
      if (id === B.VAULT) return this.openVault(p, x, y, z);
      if (id === B.FURNACE || id === B.FURNACE_LIT) { this.openScreen(p, 'furnace', x, y, z); return true; }
      if (id === B.HOPPER || id === B.DROPPER || id === B.DISPENSER) { this.openScreen(p, 'chest', x, y, z); return true; }
    }
    if ((stack?.id === I.MINECART || stack?.id === I.TNT_MINECART) && isRail(id)) {
      if (!this.canBuild(p)) return false;
      if (this.authoritative && this.placeCart(p, x, y, z, stack.id === I.TNT_MINECART) && p.mode === 'survival') { consumeHeld(p.inv); this.emit({ e: 'inv', p }); }
      return true;
    }
    if (stack?.id === I.FLINT_AND_STEEL && id !== B.TNT) {
      if (!this.canBuild(p)) return false;
      const fx = x + nx, fy = y + ny, fz = z + nz;
      const fv = this.get(fx, fy, fz);
      if (blockId(fv) !== 0 || !this.store.isLoaded(fx, fz)) return false;
      if (this.game && !this.game.canPlace(p, fx, fy, fz)) return false;
      if (this.authoritative && !this.lightPortal(fx, fy, fz)) {
        if (!isSolid(this.get(fx, fy - 1, fz))) return false;
        this.setBlock(fx, fy, fz, B.FIRE, p.id);
      }
      this.emit({ e: 'sound', s: 'fire.ignite', x: fx + 0.5, y: fy + 0.5, z: fz + 0.5, src: p.id });
      if (p.mode === 'survival') { damageHeld(p.inv, 1); this.emit({ e: 'inv', p }); }
      return true;
    }
    if (stack?.id === I.FLINT_AND_STEEL && id === B.TNT) {
      if (!this.canBuild(p)) return false;
      if (this.authoritative) this.primeTnt(x, y, z, 80);
      this.emit({ e: 'sound', s: 'fire.ignite', x: x + 0.5, y: y + 0.5, z: z + 0.5, src: p.id });
      if (p.mode === 'survival') { damageHeld(p.inv, 1); this.emit({ e: 'inv', p }); }
      return true;
    }
    if (d.interactive && !(crouch && stack) && !(forcePlace && stack && getItem(stack.id)?.places !== undefined)) {
      if (id === B.LEVER || isButton(id) || isDiode(id)) { if (!this.canBuild(p)) return false; return this.authoritative ? this.rs.use(x, y, z, v) : true; }
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
    if (stack?.id === I.BONE_MEAL) return this.boneMeal(p, x, y, z);
    if (item?.kind === 'bucket') return this.useBucket(p, x, y, z, nx, ny, nz, stack!);
    if (item?.kind === 'food' && !(item.places)) return false;
    const off = p.inv.off?.[0];
    if ((!item || item.places === undefined) && off && getItem(off.id)?.places !== undefined) {
      const sel = p.inv.selected, main = p.inv.slots[sel];
      p.inv.slots[sel] = off;
      const ok = this.place(p, x, y, z, nx, ny, nz, hy);
      p.inv.off[0] = p.inv.slots[sel];
      p.inv.slots[sel] = main;
      if (ok) this.emit({ e: 'inv', p });
      return ok;
    }
    return this.place(p, x, y, z, nx, ny, nz, hy);
  }

  applyBoneMeal(x: number, y: number, z: number, src?: string): boolean {
    const v = this.get(x, y, z), id = blockId(v);
    let used = false;
    if (id === B.WHEAT && (blockMeta(v) & 7) < 7) {
      this.setBlock(x, y, z, makeBlock(B.WHEAT, Math.min(7, (blockMeta(v) & 7) + 2 + this.rng.int(4))), src);
      used = true;
    } else if (id === B.OAK_SAPLING || id === B.BIRCH_SAPLING || id === B.SPRUCE_SAPLING || id === B.JUNGLE_SAPLING) {
      if (this.rng.chance(0.45)) this.growTree(x, y, z, id);
      used = true;
    } else if ((id === B.GRASS || id === B.SNOWY_GRASS) && blockId(this.get(x, y + 1, z)) === 0) {
      for (let i = 0; i < 24; i++) {
        const tx = x + this.rng.int(7) - 3, tz = z + this.rng.int(7) - 3;
        for (let ty = y + 1; ty >= y - 1; ty--) {
          if (blockId(this.get(tx, ty, tz)) === B.GRASS && blockId(this.get(tx, ty + 1, tz)) === 0) {
            const r = this.rng.next();
            this.setBlock(tx, ty + 1, tz, r < 0.8 ? B.TALL_GRASS : r < 0.9 ? B.DANDELION : B.POPPY, src);
            break;
          }
        }
      }
      used = true;
    }
    if (!used) return false;
    this.emit({ e: 'particles', k: 'heart', x: x + 0.5, y: y + 1, z: z + 0.5 });
    this.emit({ e: 'sound', s: 'place.grass', x: x + 0.5, y: y + 0.5, z: z + 0.5, src });
    return true;
  }

  private boneMeal(p: SimPlayer, x: number, y: number, z: number): boolean {
    if (!this.applyBoneMeal(x, y, z, p.id)) return false;
    if (p.mode === 'survival') { consumeHeld(p.inv); this.emit({ e: 'inv', p }); }
    return true;
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
    if (fluid === B.WATER && isNether(tx)) {
      this.emit({ e: 'sound', s: 'fire.fizz', x: tx + 0.5, y: ty + 0.5, z: tz + 0.5 });
      this.emit({ e: 'particles', k: 'smoke', x: tx + 0.5, y: ty + 0.5, z: tz + 0.5 });
    } else {
      if (blockId(tv) !== 0 && blockId(tv) !== B.WATER && blockId(tv) !== B.LAVA) this.spawnDrops(tx, ty, tz, tv, null, true);
      this.setBlock(tx, ty, tz, fluid, p.id);
      this.scheduleFluid(tx, ty, tz, 2);
      this.emit({ e: 'sound', s: 'bucket.empty', x: tx, y: ty, z: tz });
    }
    if (p.mode === 'survival') { p.inv.slots[p.inv.selected] = { id: I.BUCKET, count: 1 }; this.emit({ e: 'inv', p }); }
    return true;
  }

  place(p: SimPlayer, x: number, y: number, z: number, nx: number, ny: number, nz: number, hy = 0.5): boolean {
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
    let target = this.get(tx, ty, tz);
    let combine = -1;
    if (bid === B.SLAB) {
      const mat = item.placeMeta ?? 0;
      const same = (v: number) => blockId(v) === B.SLAB && (blockMeta(v) & 31) === mat;
      if (same(clicked) && ((ny === 1 && !(blockMeta(clicked) & SLAB_TOP)) || (ny === -1 && blockMeta(clicked) & SLAB_TOP))) { tx = x; ty = y; tz = z; target = clicked; combine = SHAPE_MATS[mat].id; }
      else if (same(target)) combine = SHAPE_MATS[mat].id;
    }
    if (!isReplaceable(target) && combine < 0) return fail();
    let meta = 0;
    const look = facingFromYaw(p.yaw);
    if (bid === B.EXT) meta = item.placeMeta ?? 0;
    if (bid === B.SLAB) meta = (item.placeMeta ?? 0) | (ny === -1 || (ny === 0 && hy > 0.5) ? SLAB_TOP : 0);
    if (bid === B.STAIRS) meta = (item.placeMeta ?? 0) | (look << 5) | (ny === -1 || (ny === 0 && hy > 0.5) ? STAIRS_UP : 0);
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
    if (bid === B.LEVER || isButton(bid)) {
      if (ny === 1) meta = 0; else if (ny === -1) meta = 5;
      else meta = FACING_DIRS.findIndex(([dx, dz]) => dx === -nx && dz === -nz) + 1;
      if (bid === B.LEVER && (meta === 0 || meta === 5) && (look & 1)) meta |= 16;
    }
    if (isDiode(bid)) meta = look & 3;
    if (bid === B.OBSERVER || isPiston(bid) || bid === B.DROPPER || bid === B.DISPENSER) {
      const cp = Math.cos(p.pitch), fx = -Math.sin(p.yaw) * cp, fy = Math.sin(p.pitch), fz = -Math.cos(p.yaw) * cp;
      const ax = Math.abs(fx), ay = Math.abs(fy), az = Math.abs(fz);
      const lookDir = ay > ax && ay > az ? (fy > 0 ? 3 : 2) : ax > az ? (fx > 0 ? 1 : 0) : (fz > 0 ? 5 : 4);
      meta = bid === B.OBSERVER ? lookDir : lookDir ^ 1;
    }
    if (bid === B.HOPPER) meta = ny !== 0 ? 2 : DIR6.findIndex(([a, b, c]) => a === -nx && b === 0 && c === -nz);
    if (bid === B.TORCH || bid === B.REDSTONE_TORCH) {
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
    if (bid === B.ANVIL) meta = look === 1 || look === 3 ? 0 : 1;
    if (isRail(bid)) meta = shapeFor((a, b, c) => this.get(a, b, c), tx, ty, tz, bid, look === 1 || look === 3 ? 1 : 0);
    let v = combine >= 0 ? makeBlock(combine, 0) : makeBlock(bid, meta);
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
    if (isRail(bid)) {
      const g = (a: number, b: number, c: number) => this.get(a, b, c);
      for (const [nx, ny, nz] of neighborRails(g, tx, ty, tz)) { const nv = reshapeNeighbor(g, nx, ny, nz, tx, ty, tz); if (nv !== null) this.setBlock(nx, ny, nz, nv, p.id); }
    }
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
    if (p.food >= 20 && p.mode === 'survival' && this.difficulty !== 'peaceful' && stack!.id !== I.GOLDEN_APPLE) return false;
    if (this.now - p.lastEat < 1300) return false;
    p.lastEat = this.now;
    p.food = Math.min(20, p.food + food.hunger);
    p.sat = Math.min(p.food, p.sat + food.saturation);
    const eatenId = stack!.id;
    if (eatenId === I.ROTTEN_FLESH && this.rng.chance(0.8)) p.exh += 6;
    if (eatenId === I.GOLDEN_APPLE) { p.absorb = Math.max(p.absorb ?? 0, 4); p.absorbT = 2400; p.regenT = 100; }
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
    const held = heldStack(p.inv), st = attackStats(held);
    if (st.spear && lvl(held, 'lunge') > 0 && attackCharge(this.now - Math.max(p.strengthAt ?? 0, p.lastSwing ?? 0), st.speed) >= 1) { p.strengthAt = this.now; p.lastSwing = this.now; this.lunge(p); return; }
    if (this.now - (p.lastSwing ?? 0) > 40) p.lastSwing = this.now;
  }

  private strike(p: SimPlayer, mobType: string | null = null): { dmg: number; charge: number; crit: boolean; sweep: boolean; knock: number; stats: AttackStats; attr: AttackStats; smash: boolean; fall: number; base: number } {
    const held = heldStack(p.inv);
    const stats = attackStats(held);
    const attr = p.eqId !== undefined ? attackStats(p.eqId ? { id: p.eqId, count: 1 } : null) : stats;
    const since = this.now - Math.max(p.strengthAt ?? 0, p.lastSwing ?? 0);
    const charge = attackCharge(since, attr.speed);
    p.lastAttack = this.now;
    p.strengthAt = this.now;
    this.lastStriker = p;
    let dmg = scaledDamage(attr.damage + (this.game?.damageBonus(p) ?? 0), charge);
    const strong = charge > 0.9;
    const fall = Math.max(0, p.peakY - p.y);
    let smash = false;
    if (stats.mace && !(p.flags & MF.FLY) && p.riding === undefined) {
      const bonus = maceBonus(fall);
      if (bonus > 0) { dmg += bonus + 0.5 * lvl(held, 'density') * fall; smash = true; }
    }
    const base = dmg;
    const falling = !(p.flags & MF.GROUND) && fall > 0;
    const crit = !stats.spear && strong && falling && !(p.flags & (MF.WATER | MF.LADDER | MF.FLY | MF.SPRINT)) && p.riding === undefined;
    if (crit) dmg *= 1.5;
    dmg += enchantBonus(held, mobType) * charge;
    const sweep = strong && stats.sword && !!(p.flags & MF.GROUND) && !(p.flags & MF.SPRINT) && !crit;
    const knock = 0.4 + (!stats.spear && strong && p.flags & MF.SPRINT ? 0.5 : 0) + 0.5 * lvl(held, 'knockback');
    return { dmg, charge, crit, sweep, knock, stats, attr, smash, fall, base };
  }

  private afterStrike(p: SimPlayer, st: ReturnType<WorldSim['strike']>): void {
    if (st.smash) {
      p.peakY = p.y;
      const wb = Math.min(3, lvl(heldStack(p.inv), 'wind_burst'));
      this.emit({ e: 'knock', p, x: 0, y: wb > 0 ? WIND_BURST[wb] : 0.01, z: 0, set: true });
    }
    if (p.mode === 'survival') { p.exh += 0.1; if (st.stats.wear) { damageHeld(p.inv, st.stats.wear); this.emit({ e: 'inv', p }); } }
  }

  private lookDir(p: SimPlayer): { x: number; y: number; z: number; ey: number } {
    const cp = Math.cos(p.pitch);
    return { x: -Math.sin(p.yaw) * cp, y: Math.sin(p.pitch), z: -Math.cos(p.yaw) * cp, ey: p.y + (p.flags & MF.CROUCH ? 1.27 : 1.62) };
  }

  private rayBox(p: SimPlayer, bx: number, by: number, bz: number, hw: number, h: number, margin: number): number | null {
    const d = this.lookDir(p);
    const o = [p.x, d.ey, p.z], v = [d.x, d.y, d.z];
    const lo = [bx - hw - margin, by - margin, bz - hw - margin], hi = [bx + hw + margin, by + h + margin, bz + hw + margin];
    let t0 = 0, t1 = 64;
    for (let i = 0; i < 3; i++) {
      if (Math.abs(v[i]) < 1e-9) { if (o[i] < lo[i] || o[i] > hi[i]) return null; continue; }
      let a = (lo[i] - o[i]) / v[i], b = (hi[i] - o[i]) / v[i];
      if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a); t1 = Math.min(t1, b);
      if (t0 > t1) return null;
    }
    return t0;
  }

  private spearTargets(p: SimPlayer, max: number): { mob?: Entity; pl?: SimPlayer; dist: number }[] {
    const out: { mob?: Entity; pl?: SimPlayer; dist: number }[] = [];
    for (const e of this.entities.values()) {
      if (e.kind !== 'mob' || e.health <= 0 || Math.abs(e.x - p.x) > max + 2 || Math.abs(e.z - p.z) > max + 2) continue;
      const d = this.rayBox(p, e.x, e.y, e.z, e.hw, e.h, SPEAR_MARGIN);
      if (d !== null && d >= SPEAR_MIN && d <= max) out.push({ mob: e, dist: d });
    }
    if (this.settings.pvp) for (const o of this.players.values()) {
      if (o === p || o.dead || o.mode === 'spectator' as GameMode || (this.game && !this.game.canHurtPlayer(p, o))) continue;
      if (Math.abs(o.x - p.x) > max + 2 || Math.abs(o.z - p.z) > max + 2) continue;
      const d = this.rayBox(p, o.x, o.y, o.z, PLAYER_HW, PLAYER_H, SPEAR_MARGIN);
      if (d !== null && d >= SPEAR_MIN && d <= max) out.push({ pl: o, dist: d });
    }
    return out;
  }

  private jab(p: SimPlayer, first: { mob?: Entity; pl?: SimPlayer }): boolean {
    const held = heldStack(p.inv);
    const stats = attackStats(held);
    const attr = p.eqId !== undefined ? attackStats(p.eqId ? { id: p.eqId, count: 1 } : null) : stats;
    if (attackCharge(this.now - Math.max(p.strengthAt ?? 0, p.lastSwing ?? 0), attr.speed) < 1) return false;
    const max = attackRange(stats, p.mode === 'creative');
    const list = this.spearTargets(p, max + 0.5);
    if (!list.some((t) => (first.mob && t.mob === first.mob) || (first.pl && t.pl === first.pl))) {
      const fx = first.mob ?? first.pl!, fh = first.mob ? first.mob.h : PLAYER_H, fw = first.mob ? first.mob.hw : PLAYER_HW;
      const d = this.rayBox(p, fx.x, fx.y, fx.z, fw, fh, SPEAR_MARGIN + 0.6);
      if (d === null || d < SPEAR_MIN - 0.6 || d > max + 1) return false;
      list.push({ ...first, dist: d });
    }
    const st = this.strike(p, first.mob ? first.mob.type as string : null);
    const fa = lvl(held, 'fire_aspect');
    for (const t of list) {
      if (t.mob) {
        const dx = t.mob.x - p.x, dz = t.mob.z - p.z, l = Math.hypot(dx, dz) || 1;
        if (this.game?.onAttackMob(p, t.mob)) continue;
        this.hurtMob(t.mob, p.mode === 'creative' ? Math.max(st.dmg, 20) : st.dmg, p.id, dx / l, dz / l, st.knock);
        if (fa > 0 && t.mob.health > 0) t.mob.fire = Math.max(t.mob.fire, 80 * fa);
      } else if (t.pl) {
        this.damage(t.pl, st.dmg, 'player', p.x, p.z, true, false, p.name, st.knock);
        if (fa > 0 && !t.pl.dead) t.pl.fireT = Math.max(t.pl.fireT, 80 * fa);
      }
    }
    this.emit({ e: 'sound', s: 'spear.jab', x: p.x, y: p.y + 1.5, z: p.z });
    this.afterStrike(p, st);
    this.lunge(p);
    return true;
  }

  private lunge(p: SimPlayer): void {
    const held = heldStack(p.inv);
    const l = Math.min(3, lvl(held, 'lunge'));
    if (l <= 0 || p.riding !== undefined || p.flags & (MF.WATER | MF.FLY) || (p.food < 6 && p.mode !== 'creative')) return;
    const d = this.lookDir(p), h = Math.hypot(d.x, d.z) || 1;
    const v = 0.458 * l;
    this.emit({ e: 'knock', p, x: (d.x / h) * v, y: 0, z: (d.z / h) * v });
    this.emit({ e: 'sound', s: 'spear.lunge', x: p.x, y: p.y + 1, z: p.z });
    if (p.mode === 'survival') { p.exh += 4 * l; damageHeld(p.inv, 1); this.emit({ e: 'inv', p }); }
  }

  private tickCharge(p: SimPlayer, si: number): void {
    const c = p.charge!, t = SPEAR_STATS[si];
    const age = (this.now - c.t0) / 1000 - t.delay;
    if (age < 0) return;
    if (age > t.s1 + t.s2 + t.s3) { c.done = true; return; }
    const engaged = age < t.s1, knockable = age < t.s1 + t.s2;
    const look = this.lookDir(p);
    const pv = p.vel ?? { x: 0, y: 0, z: 0 };
    const max = attackRange(attackStats({ id: I.SPEAR + si, count: 1 }), p.mode === 'creative');
    for (const tg of this.spearTargets(p, max)) {
      const key = tg.mob ? `m${tg.mob.id}` : `p${tg.pl!.id}`;
      if (c.hits[key] !== undefined && this.tickCount - c.hits[key] < 10) continue;
      const tv = tg.mob ? { x: tg.mob.vx, y: tg.mob.vy, z: tg.mob.vz } : (tg.pl!.vel ?? { x: 0, y: 0, z: 0 });
      const closing = (pv.x - tv.x) * look.x + (pv.y - tv.y) * look.y + (pv.z - tv.z) * look.z;
      if (closing < CHARGE_HURT_SPEED) continue;
      c.hits[key] = this.tickCount;
      const dmg = chargeDamage(t.mult, closing);
      const knock = knockable && closing >= CHARGE_KNOCK_SPEED ? 0.4 : 0;
      const l = Math.hypot(look.x, look.z) || 1;
      if (tg.mob) {
        if (this.game?.onAttackMob(p, tg.mob)) continue;
        this.hurtMob(tg.mob, dmg, p.id, look.x / l, look.z / l, knock);
      } else {
        const o = tg.pl!;
        if (engaged && closing >= t.dismount && o.riding !== undefined) this.dismount(o);
        this.damage(o, dmg, 'player', o.x - look.x, o.z - look.z, knock > 0, false, p.name, knock);
      }
      this.emit({ e: 'sound', s: 'spear.hit', x: p.x, y: p.y + 1.5, z: p.z });
      if (p.mode === 'survival') { damageHeld(p.inv, 1); this.emit({ e: 'inv', p }); }
    }
  }

  attack(p: SimPlayer, entityId: number): boolean {
    if (p.dead) return false;
    const e = this.entities.get(entityId);
    if (e?.kind === 'cart') {
      if (Math.hypot(e.x - p.x, e.y - p.y, e.z - p.z) > 6 || this.now - p.lastAttack < 45) return false;
      if (attackStats(heldStack(p.inv)).mace) { p.lastAttack = this.now; p.strengthAt = this.now; if (e.type === 'tntcart' && p.mode !== 'creative') this.hitCart(p, e, 100); else this.removeCart(e, p.mode !== 'creative'); return true; }
      this.hitCart(p, e, this.strike(p).dmg);
      return true;
    }
    if (!e || e.kind !== 'mob') return false;
    if (this.game?.onAttackMob(p, e)) return true;
    const dx = e.x - p.x, dy = e.y + e.h / 2 - (p.y + 1.62), dz = e.z - p.z;
    const ws = attackStats(heldStack(p.inv));
    if (Math.hypot(dx, dy, dz) > attackRange(ws, p.mode === 'creative') + e.hw + 1.5) return false;
    if (this.now - p.lastAttack < 45) return false;
    if (ws.spear) return this.jab(p, { mob: e });
    const fa = lvl(heldStack(p.inv), 'fire_aspect');
    const st = this.strike(p, e.type as string);
    if (st.smash) this.smashAround(p, e.x, e.y, e.z, e.id, null, st.fall);
    let dmg = st.dmg;
    if (p.mode === 'creative') dmg = Math.max(dmg, 20);
    this.afterStrike(p, st);
    const len = Math.hypot(dx, dz) || 1;
    this.hurtMob(e, dmg, p.id, dx / len, dz / len, st.knock);
    if (fa > 0 && e.health > 0) e.fire = Math.max(e.fire, 80 * fa);
    if (st.crit) this.emit({ e: 'particles', k: 'crit', x: e.x, y: e.y + e.h, z: e.z });
    if (st.sweep) this.sweepAround(p, e.x, e.y, e.z, e.id, null, this.sweepDamage(st));
    return true;
  }

  private sweepDamage(st: { base: number; charge: number; stats: AttackStats }): number {
    const se = lvl(heldStack(this.lastStriker!.inv), 'sweeping_edge');
    return 1 + st.base * (se / (se + 1));
  }

  private lastStriker: SimPlayer | null = null;
  private hitBy: { mob?: Entity; pl?: SimPlayer; breach: number } | null = null;

  private sweepAround(p: SimPlayer, x: number, y: number, z: number, skipEnt: number | null, skipPlayer: string | null, sdmg = 1): void {
    this.emit({ e: 'particles', k: 'sweep', x, y: y + 1, z });
    this.emit({ e: 'sound', s: 'player.sweep', x, y, z });
    for (const o of this.entities.values()) {
      if (o.kind !== 'mob' || o.id === skipEnt || o.health <= 0) continue;
      if (Math.abs(o.x - x) > 1.3 || Math.abs(o.z - z) > 1.3 || Math.abs(o.y - y) > 0.6) continue;
      const l = Math.hypot(o.x - p.x, o.z - p.z) || 1;
      this.hurtMob(o, sdmg, p.id, (o.x - p.x) / l, (o.z - p.z) / l, 0.4);
    }
    if (!this.settings.pvp) return;
    for (const o of this.players.values()) {
      if (o === p || o.id === skipPlayer || o.dead) continue;
      if (Math.abs(o.x - x) > 1.3 || Math.abs(o.z - z) > 1.3 || Math.abs(o.y - y) > 0.6) continue;
      if (this.game && !this.game.canHurtPlayer(p, o)) continue;
      this.damage(o, sdmg, 'player', p.x, p.z, true, false, p.name, 0.4);
    }
  }

  attackPlayer(p: SimPlayer, targetId: string): boolean {
    if (!this.settings.pvp || p.dead) return false;
    const t = this.players.get(targetId);
    if (!t || t.dead || t === p) return false;
    if (this.game && !this.game.canHurtPlayer(p, t)) return false;
    const dx = t.x - p.x, dy = t.y + 0.9 - (p.y + 1.62), dz = t.z - p.z;
    const ws = attackStats(heldStack(p.inv));
    if (Math.hypot(dx, dy, dz) > attackRange(ws, p.mode === 'creative') + 0.3 + 1.5) return false;
    if (this.now - p.lastAttack < 45) return false;
    if (ws.spear) return this.jab(p, { pl: t });
    const fa = lvl(heldStack(p.inv), 'fire_aspect');
    const st = this.strike(p);
    if (st.smash) this.smashAround(p, t.x, t.y, t.z, null, t.id, st.fall);
    if (st.crit) this.emit({ e: 'particles', k: 'crit', x: t.x, y: t.y + 1.8, z: t.z });
    this.afterStrike(p, st);
    this.hitBy = { pl: p, breach: lvl(heldStack(p.inv), 'breach') };
    this.damage(t, st.dmg, 'player', p.x, p.z, true, false, p.name, st.knock);
    this.hitBy = null;
    if (fa > 0 && !t.dead) t.fireT = Math.max(t.fireT, 80 * fa);
    if (st.sweep) this.sweepAround(p, t.x, t.y, t.z, null, t.id, this.sweepDamage(st));
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
          const loot = killer ? lvl(heldStack(killer.inv), 'looting') : 0;
          const n = dr.min + this.rng.int(dr.max - dr.min + 1) + (loot > 0 ? this.rng.int(loot + 1) : 0);
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
      this.timeAcc += timeRate(this.time, this.settings.dayLength, this.settings.nightLength);
      const step = Math.floor(this.timeAcc);
      if (step > 0) { this.time += step; this.timeAcc -= step; }
    }
    if (this.tickCount % 200 === 0) this.emit({ e: 'time' });
    this.tickWeather();
    this.tickSpawners();
    for (const p of this.players.values()) this.tickPlayer(p);
    if (!this.authoritative) return;
    this.info.builds = this.store.raw ? 32 : 6;
    this.info.budget = 20000;
    if (this.tickCount % 10 === 1 || this.players.size !== this.tickingFor) this.refreshTicking();
    if (this.tickCount % 600 === 0) this.info.prune();
    this.rs.tickScheduled();
    this.tickFluids();
    this.tickRandom();
    this.rs.tickBlockEvents();
    this.tickLeafDecay();
    this.tickFalling();
    this.mergeTnt();
    for (const e of [...this.entities.values()]) this.tickEntity(e);
    this.runBlasts();
    this.tickPlates();
    this.rs.tickMoving();
    this.tickHoppers();
    this.tickFurnaces();
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
    const held = heldStack(p.inv);
    const hid = held?.id ?? 0;
    if (hid !== p.eqId) { if (p.eqId !== undefined) p.strengthAt = this.now; p.eqId = hid; }
    if (p.riding === undefined && this.now - p.lastMove > 150 && p.vel) { p.vel = { x: 0, y: 0, z: 0 }; p.speed = 0; p.vref = undefined; }
    if (p.dead || !this.authoritative) return;
    const si = spearIndex(hid);
    if (si < 0 || !(p.flags & MF.CHARGE)) p.charge = undefined;
    else {
      if (!p.charge) p.charge = { t0: this.now, hits: {}, done: false };
      if (!p.charge.done) this.tickCharge(p, si);
    }
    const f = p.flags;
    let changed = false;
    this.tickPortal(p);
    if (p.mode === 'survival' && !p.travel) {
      const fbx = Math.floor(p.x), fby = Math.floor(p.y + 0.05), fbz = Math.floor(p.z);
      if (blockId(this.get(fbx, fby, fbz)) === B.FIRE) p.fireT = Math.max(p.fireT, 160);
      if (!(f & MF.CROUCH) && this.get(fbx, Math.floor(p.y - 0.05), fbz) === B.MAGMA_BLOCK && p.y - Math.floor(p.y) < 0.02 && this.tickCount % 10 === 0) this.damage(p, 1, 'fire', p.x, p.z, false);
    }
    if (p.mode === 'survival') {
      const med = sampleMedium(this.store, p.x, p.y, p.z, f & MF.LAVA ? 0.3 : 0.15, f & MF.CROUCH ? 1.5 : 1.8, 1.62);
      if (med.lava) { p.fireT = 300; if (--p.t.lava <= 0) { p.t.lava = 10; this.damage(p, 4, 'lava', p.x, p.z, false); } }
      if (med.water || (f & MF.WATER && !med.lava)) p.fireT = 0;
      if ((p.fireT > 0) !== !!p.wasFire) { p.wasFire = p.fireT > 0; changed = true; }
      if (p.fireT > 0) { p.fireT--; if (--p.t.fire <= 0) { p.t.fire = 20; if (!med.lava) this.damage(p, 1, 'fire', p.x, p.z, false); } }
      if (p.absorbT && --p.absorbT <= 0) { p.absorb = 0; changed = true; }
      if (p.regenT && p.regenT > 0) { if (p.regenT-- % 25 === 0 && p.health < 20) { p.health = Math.min(20, p.health + 1); changed = true; } }
      if (f & MF.EYE_WATER) {
        const resp = lvl(p.inv.armor[0], 'respiration');
        if (resp <= 0 || this.rng.int(resp + 1) === 0) p.air--;
        if (p.air <= 0) { p.air = 0; if (--p.t.drown <= 0) { p.t.drown = 20; this.damage(p, 2, 'drown', p.x, p.z, false, true); } }
        if (p.air % 20 === 0) changed = true;
      } else if (p.air < 300) { p.air = Math.min(300, p.air + 5); changed = true; }
      const hb = getBlock(this.get(Math.floor(p.x), Math.floor(p.y + ((f & MF.PRONE) || ((f & MF.WATER) && (f & MF.SPRINT)) ? 0.4 : f & MF.CROUCH ? 1.27 : 1.62)), Math.floor(p.z)));
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
      if (p.air < 300) { p.air = 300; changed = true; }
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
    if (this.authoritative) { this.rs.blockChanged(x, y, z, old, v); this.rs.observe(x, y, z); }
    this.checkSupport(x, y + 1, z);
    const nid = isWaterPlant(blockId(v)) ? B.WATER : blockId(v), oid = isWaterPlant(blockId(old)) ? B.WATER : blockId(old);
    if (nid === B.LAVA || oid === B.LAVA || nid === B.WATER || oid === B.WATER) {
      for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
        const n0 = blockId(this.get(x + dx, y + dy, z + dz)), n = isWaterPlant(n0) ? B.WATER : n0;
        if ((n === B.WATER && (nid === B.LAVA || oid === B.LAVA)) || (n === B.LAVA && (nid === B.WATER || oid === B.WATER))) this.scheduleFluid(x + dx, y + dy, z + dz, 1);
      }
    }
    this.fluidContact(x, y, z, nid);
  }

  private fluidContact(x: number, y: number, z: number, nid: number): void {
    if (nid !== B.LAVA && nid !== B.WATER) return;
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
      const n0 = blockId(this.get(x + dx, y + dy, z + dz)), n = isWaterPlant(n0) ? B.WATER : n0;
      if (nid === B.LAVA && n === B.WATER && dy !== -1) { this.scheduleFluid(x, y, z, 1); return; }
      if (nid === B.WATER && n === B.LAVA && dy !== 1) this.scheduleFluid(x + dx, y + dy, z + dz, 1);
    }
  }

  private moveEntities(cells: { x: number; y: number; z: number; sticky: boolean }[], dir: number, from: number, to: number): void {
    const [dx, dy, dz] = DIR6[dir];
    const axis = dx ? 0 : dy ? 1 : 2, sgn = dx + dy + dz;
    const shift = new Map<Entity | SimPlayer, number>();
    const bodies: { o: Entity | SimPlayer; hw: number; h: number }[] = [];
    for (const e of this.entities.values()) if (e.kind !== 'mob' || e.health > 0) bodies.push({ o: e, hw: e.hw, h: e.h });
    for (const p of this.players.values()) if (!p.dead && !(p.flags & MF.FLY && p.mode === 'creative' && false)) bodies.push({ o: p, hw: 0.3, h: p.flags & MF.CROUCH ? 1.5 : 1.8 });
    for (const c of cells) {
      const off = -(1 - to);
      const bx = c.x + dx * off, by = c.y + dy * off, bz = c.z + dz * off;
      const box = [bx, by, bz, bx + 1, by + 1, bz + 1];
      for (const b of bodies) {
        const o = b.o;
        if (Math.abs(o.x - bx - 0.5) > 2 || Math.abs(o.z - bz - 0.5) > 2 || Math.abs(o.y - by) > 3) continue;
        const lo = [o.x - b.hw, o.y, o.z - b.hw], hi = [o.x + b.hw, o.y + b.h, o.z + b.hw];
        const hits = lo[0] < box[3] && hi[0] > box[0] && lo[1] < box[4] && hi[1] > box[1] && lo[2] < box[5] && hi[2] > box[2];
        let need = 0;
        if (hits) need = (sgn > 0 ? box[3 + axis] - lo[axis] : hi[axis] - box[axis]) + 0.01;
        else if (c.sticky && dir !== 3) {
          const prevTop = box[4] - dy * (to - from);
          const over = lo[0] < box[3] && hi[0] > box[0] && lo[2] < box[5] && hi[2] > box[2];
          if (over && Math.abs(o.y - prevTop) < 0.1) need = to - from;
        }
        if (need > 0) shift.set(o, Math.max(shift.get(o) ?? 0, Math.min(1.01, need)));
      }
    }
    for (const [o, n] of shift) {
      o.x += dx * n; o.y += dy * n; o.z += dz * n;
      if ('inv' in o) { (o as SimPlayer).peakY = o.y; this.emit({ e: 'tp', p: o as SimPlayer }); }
    }
  }

  primeTnt(x: number, y: number, z: number, fuse: number, vx?: number, vy?: number, vz?: number): void {
    if (blockId(this.get(x, y, z)) !== B.TNT) return;
    this.setBlock(x, y, z, 0);
    this.spawnPrimed(x + 0.5, y, z + 0.5, fuse, vx, vy, vz);
    this.emit({ e: 'sound', s: 'tnt.primed', x: x + 0.5, y: y + 0.5, z: z + 0.5 });
  }

  spawnPrimed(x: number, y: number, z: number, fuse: number, vx?: number, vy?: number, vz?: number): Entity {
    const a = this.rng.next() * Math.PI * 2;
    const e: Entity = {
      id: this.allocId(), kind: 'tnt', type: 'tnt', x, y, z, vx: vx ?? -Math.sin(a) * 0.4, vy: vy ?? 4, vz: vz ?? -Math.cos(a) * 0.4,
      hw: 0.49, h: 0.98, onGround: false, hitH: false, hitCeil: false, yaw: 0, health: 1, maxHealth: 1, hurt: 0, age: 0, fire: 0, flags: 0, fuse, count: 1,
    };
    this.entities.set(e.id, e);
    this.emit({ e: 'spawn', ent: e });
    return e;
  }

  private tickTnt(e: Entity): void {
    e.vy -= 0.8;
    moveBody(e, e.vx * DT, e.vy * DT, e.vz * DT, this.store);
    e.vx *= 0.98; e.vy *= 0.98; e.vz *= 0.98;
    if (e.onGround) { e.vx *= 0.7; e.vz *= 0.7; e.vy *= -0.5; if (Math.abs(e.vy) < 1) e.vy = 0; }
    e.fuse = (e.fuse ?? 80) - 1;
    e.flags = (e.fuse >> 2) & 1;
    if (e.fuse > 0) return;
    this.entities.delete(e.id);
    this.emit({ e: 'remove', id: e.id, why: 'despawn' });
    for (let k = 0; k < (e.count ?? 1); k++) this.blasts.push({ x: e.x, y: e.y + 0.0625, z: e.z, power: 4 });
  }

  private blasts: { x: number; y: number; z: number; power: number }[] = [];

  placeCart(p: SimPlayer | null, x: number, y: number, z: number, tnt: boolean): Entity | null {
    const rv = this.get(x, y, z);
    if (!isRail(blockId(rv))) return null;
    const shape = railShape(rv);
    const e: Entity = {
      id: this.allocId(), kind: 'cart', type: tnt ? 'tntcart' : 'cart', x: x + 0.5, y: y + 1 / 16 + railHeight(shape, 0.5, 0.5), z: z + 0.5, vx: 0, vy: 0, vz: 0,
      hw: 0.49, h: 0.7, onGround: true, hitH: false, hitCeil: false, yaw: p ? p.yaw : 0, health: 1, maxHealth: 1, hurt: 0, age: 0, fire: 0, flags: 0, wob: 0, fall: 0,
    };
    this.entities.set(e.id, e);
    this.emit({ e: 'spawn', ent: e });
    this.emit({ e: 'sound', s: 'place.stone', x: e.x, y: e.y, z: e.z });
    return e;
  }

  mount(p: SimPlayer, e: Entity): boolean {
    if (e.kind !== 'cart' || e.type !== 'cart' || e.rider || p.riding || p.dead) return false;
    e.rider = p.id;
    p.riding = e.id;
    p.x = e.x; p.y = e.y + 0.35; p.z = e.z; p.peakY = p.y;
    this.emit({ e: 'ride', p, id: e.id });
    return true;
  }

  dismount(p: SimPlayer): void {
    if (p.riding === undefined) return;
    const e = this.entities.get(p.riding);
    p.riding = undefined;
    if (e) { e.rider = undefined; p.x = e.x; p.y = e.y + 0.75; p.z = e.z; }
    p.peakY = p.y;
    this.emit({ e: 'ride', p, id: -1 });
    this.emit({ e: 'tp', p });
  }

  private cartFuse(e: Entity, fuse: number): void {
    if (e.type !== 'tntcart' || (e.fuse !== undefined && e.fuse >= 0 && e.fuse <= fuse)) return;
    e.fuse = fuse;
    this.emit({ e: 'sound', s: 'tnt.primed', x: e.x, y: e.y, z: e.z });
  }

  private cartExplode(e: Entity, bonus: number): void {
    if (!this.entities.has(e.id)) return;
    this.removeCart(e, false);
    this.blasts.push({ x: e.x, y: e.y + 0.35, z: e.z, power: 4 + this.rng.next() * 1.5 * Math.min(5, bonus) });
  }

  private removeCart(e: Entity, drop: boolean): void {
    if (e.rider) { const r = this.players.get(e.rider); if (r) this.dismount(r); }
    this.entities.delete(e.id);
    this.emit({ e: 'remove', id: e.id, why: 'despawn' });
    if (!drop) return;
    this.spawnItem(e.x, e.y + 0.3, e.z, { id: I.MINECART, count: 1 });
    if (e.type === 'tntcart') this.spawnItem(e.x, e.y + 0.3, e.z, { id: B.TNT, count: 1 });
  }

  private cartBlasted(e: Entity): void {
    if (e.type === 'tntcart') this.cartFuse(e, 1 + this.rng.int(38));
    else this.removeCart(e, true);
  }

  hitCart(p: SimPlayer, e: Entity, dmg: number): void {
    if (p.mode === 'creative') { this.removeCart(e, false); return; }
    e.wob = (e.wob ?? 0) + dmg * 10;
    e.hurt = 10;
    if (e.wob <= 40) return;
    const moving = Math.hypot(e.vx, e.vz) > 0.2;
    if (e.type === 'tntcart' && moving) { this.cartFuse(e, 1 + this.rng.int(38)); return; }
    this.removeCart(e, true);
  }

  private tickCart(e: Entity): void {
    if (e.wob) e.wob = Math.max(0, e.wob - 1);
    if (e.fuse !== undefined && e.fuse >= 0) {
      e.fuse--;
      e.flags = (e.fuse >> 2) & 1;
      if (e.fuse <= 0) { this.cartExplode(e, Math.hypot(e.vx, e.vz) * DT); return; }
    }
    let vx = e.vx * DT, vy = e.vy * DT, vz = e.vz * DT;
    let bx = Math.floor(e.x), by = Math.floor(e.y), bz = Math.floor(e.z);
    let rv = this.get(bx, by, bz);
    if (!isRail(blockId(rv))) { const below = this.get(bx, by - 1, bz); if (isRail(blockId(below))) { rv = below; by--; } }
    const here = blockId(this.get(bx, Math.floor(e.y + 0.2), bz));
    if (here === B.LAVA && e.type === 'tntcart') this.cartFuse(e, 1 + this.rng.int(38));
    const wet = here === B.WATER;
    if (isRail(blockId(rv))) {
      const id = blockId(rv), shape = railShape(rv), powered = railPowered(rv);
      e.fall = 0;
      const SL = 0.0078125;
      if (shape === 2) vx -= SL; else if (shape === 3) vx += SL; else if (shape === 4) vz += SL; else if (shape === 5) vz -= SL;
      const [a, b] = RAIL_EXITS[shape];
      let dx = b[0] - a[0], dz = b[2] - a[2];
      const dl = Math.hypot(dx, dz);
      dx /= dl; dz /= dl;
      if (e.rider) {
        const r = this.players.get(e.rider);
        if (r && r.flags & MF.FORWARD && vx * vx + vz * vz < 0.01) { vx += -Math.sin(r.yaw) * 0.1; vz += -Math.cos(r.yaw) * 0.1; }
      }
      if (vx * dx + vz * dz < 0) { dx = -dx; dz = -dz; }
      let speed = Math.hypot(vx, vz);
      vx = dx * speed; vz = dz * speed;
      if (id === B.POWERED_RAIL) {
        if (powered) {
          if (speed > 0.01) { vx += dx * 0.06; vz += dz * 0.06; }
          else if (shape === 1) { if (isSolid(this.get(bx - 1, by, bz))) vx = 0.02; else if (isSolid(this.get(bx + 1, by, bz))) vx = -0.02; }
          else if (shape === 0) { if (isSolid(this.get(bx, by, bz - 1))) vz = 0.02; else if (isSolid(this.get(bx, by, bz + 1))) vz = -0.02; }
        } else if (speed < 0.03) { vx = 0; vz = 0; } else { vx *= 0.5; vz *= 0.5; }
      }
      const max = wet ? 0.2 : 0.4;
      vx = Math.max(-max, Math.min(max, vx)); vz = Math.max(-max, Math.min(max, vz));
      speed = Math.hypot(vx, vz);
      if (speed > 0) {
        const ahead = this.get(Math.floor(e.x + Math.sign(vx) * 0.55), by, Math.floor(e.z + Math.sign(vz) * 0.55));
        const aheadUp = shape >= 2 && shape <= 5;
        if (isSolid(ahead) && !aheadUp && !isRail(blockId(ahead))) {
          if (e.type === 'tntcart' && speed > 0.2) { this.cartExplode(e, speed); return; }
          vx = 0; vz = 0;
        }
      }
      const [lax, laz, lbx, lbz] = railLine(shape);
      const Ax = bx + lax, Az = bz + laz, Bx = bx + lbx, Bz = bz + lbz;
      const nx = e.x + vx, nz = e.z + vz;
      const ux = Bx - Ax, uz = Bz - Az, ul = ux * ux + uz * uz;
      const t = ((nx - Ax) * ux + (nz - Az) * uz) / ul;
      e.x = Ax + ux * t; e.z = Az + uz * t;
      const fx = Math.max(0, Math.min(1, e.x - bx)), fz = Math.max(0, Math.min(1, e.z - bz));
      e.y = by + 1 / 16 + railHeight(shape, fx, fz);
      if (Math.floor(e.x) !== bx || Math.floor(e.z) !== bz) {
        const nb = this.get(Math.floor(e.x), by, Math.floor(e.z));
        const up = this.get(Math.floor(e.x), by + 1, Math.floor(e.z));
        if (!isRail(blockId(nb)) && isRail(blockId(up))) e.y = by + 1 + 1 / 16;
      }
      const fr = e.rider ? 0.997 : 0.96;
      vx *= wet ? 0.95 : fr; vz *= wet ? 0.95 : fr;
      if (speed > 0.001) e.yaw = Math.atan2(-vx, -vz);
      if (id === B.DETECTOR_RAIL && this.authoritative) this.rs.setDetector(bx, by, bz, true);
      if (id === B.ACTIVATOR_RAIL && powered) {
        if (e.type === 'tntcart') this.cartFuse(e, 80);
        if (e.rider) { const r = this.players.get(e.rider); if (r) this.dismount(r); }
      }
      e.onGround = true;
      vy = 0;
    } else {
      const wasAir = !e.onGround;
      vy -= 0.04;
      moveBody(e, vx, vy, vz, this.store);
      if (e.onGround) {
        if (wasAir && e.type === 'tntcart' && (e.fall ?? 0) > 3) { this.cartExplode(e, (e.fall ?? 0) / 10); return; }
        e.fall = 0;
        vx *= 0.5; vz *= 0.5; vy = 0;
      } else if (vy < 0) e.fall = (e.fall ?? 0) - vy;
      vx *= 0.95; vz *= 0.95; vy *= 0.98;
      const max = 0.4;
      vx = Math.max(-max, Math.min(max, vx)); vz = Math.max(-max, Math.min(max, vz));
    }
    for (const o of this.entities.values()) {
      if (o === e || o.kind !== 'cart') continue;
      const ddx = o.x - e.x, ddz = o.z - e.z, d2 = ddx * ddx + ddz * ddz;
      if (d2 > 0.8 || Math.abs(o.y - e.y) > 0.7) continue;
      const d = Math.sqrt(d2) || 0.01;
      vx -= (ddx / d) * 0.01; vz -= (ddz / d) * 0.01;
    }
    for (const p of this.players.values()) {
      if (p.dead || p.riding === e.id) continue;
      const ddx = e.x - p.x, ddz = e.z - p.z;
      if (Math.abs(ddx) > 0.8 || Math.abs(ddz) > 0.8 || p.y > e.y + e.h || p.y + 1.8 < e.y) continue;
      const d = Math.hypot(ddx, ddz) || 0.01;
      vx += (ddx / d) * 0.02; vz += (ddz / d) * 0.02;
    }
    e.vx = vx / DT; e.vy = vy / DT; e.vz = vz / DT;
    if (e.rider) {
      const r = this.players.get(e.rider);
      if (!r || r.dead) e.rider = undefined;
      else { r.x = e.x; r.y = e.y + 0.35; r.z = e.z; r.peakY = r.y; r.flags |= MF.RIDE; }
    }
  }


  private mergeTnt(): void {
    let seen: Map<string, Entity> | null = null;
    for (const e of this.entities.values()) {
      if (e.kind !== 'tnt') continue;
      seen ??= new Map();
      const k = `${Math.round(e.x * 64)},${Math.round(e.y * 64)},${Math.round(e.z * 64)},${e.fuse},${Math.round(e.vx * 8)},${Math.round(e.vy * 8)},${Math.round(e.vz * 8)}`;
      const first = seen.get(k);
      if (!first) { seen.set(k, e); continue; }
      first.count = (first.count ?? 1) + (e.count ?? 1);
      this.entities.delete(e.id);
      this.emit({ e: 'remove', id: e.id, why: 'despawn' });
    }
  }

  private runBlasts(): void {
    let n = 0;
    while (this.blasts.length && n < 512) {
      const b = this.blasts.shift()!;
      n++;
      this.explode(b.x, b.y, b.z, b.power);
    }
    this.exposureCache.clear();
    this.lastBlast = null;
  }

  private exposureCache = new Map<string, number>();
  private lastBlast: { x: number; y: number; z: number; power: number; broke: number } | null = null;

  private resAt(v: number): number {
    const id = v & 0xff;
    if (id === B.SLAB || id === B.STAIRS) return BLAST_RES[SHAPE_MATS[(v >>> 8) & 31]?.id ?? 1];
    return BLAST_RES[id];
  }

  explode(x: number, y: number, z: number, power: number, opts: { fire?: boolean; noBlocks?: boolean } = {}): void {
    const cv = this.get(Math.floor(x), Math.floor(y), Math.floor(z));
    const wet = !!getBlock(cv).fluid || opts.noBlocks;
    const lb = this.lastBlast;
    const repeat = !!lb && lb.broke === 0 && lb.power === power && Math.abs(lb.x - x) < 0.01 && Math.abs(lb.y - y) < 0.01 && Math.abs(lb.z - z) < 0.01;
    const hit: number[] = [];
    if (!wet && !repeat) {
      const seen = new Set<number>();
      const R = RAYS;
      for (let r = 0; r < R.length; r += 3) {
        const rx = R[r] * 0.3, ry = R[r + 1] * 0.3, rz = R[r + 2] * 0.3;
        let f = power * (0.7 + this.rng.next() * 0.6);
        let px = x, py = y, pz = z, lastK = -1, lastV = 0;
        while (f > 0) {
          const bx = Math.floor(px), by = Math.floor(py), bz = Math.floor(pz);
          if (by < 0 || by >= WORLD_HEIGHT) break;
          const k = ((bx + 1048576) * 512 + by) * 2097152 + (bz + 1048576);
          let v: number;
          if (k === lastK) v = lastV;
          else {
            if (!this.store.isLoaded(bx, bz)) break;
            v = this.get(bx, by, bz);
            lastK = k; lastV = v;
          }
          if (v) {
            f -= (this.resAt(v) + 0.3) * 0.3;
            if (f > 0 && !seen.has(k) && !getBlock(v).fluid) { seen.add(k); hit.push(bx, by, bz); }
          }
          px += rx; py += ry; pz += rz;
          f -= 0.22500001;
        }
      }
    }
    const r = power * 2;
    const exposure = (id: string | number, bx: number, by: number, bz: number, hw: number, h: number): number => {
      const ck = `${id}|${x.toFixed(2)},${y.toFixed(2)},${z.toFixed(2)}`;
      const c = this.exposureCache.get(ck);
      if (c !== undefined) return c;
      let seen = 0, n = 0;
      for (const sy of [0.1, 0.5, 0.9]) for (const sx of [-0.8, 0.8]) {
        const tx = bx + sx * hw, ty = by + sy * h, tz = bz;
        const ddx = tx - x, ddy = ty - y, ddz = tz - z, len = Math.hypot(ddx, ddy, ddz);
        n++;
        if (len < 0.01) { seen++; continue; }
        const rh = raycast(this.store, x, y, z, ddx / len, ddy / len, ddz / len, len);
        if (!rh || !isSolid(rh.value)) seen++;
      }
      const out = seen / n;
      this.exposureCache.set(ck, out);
      return out;
    };
    const impactOf = (id: string | number, bx: number, by: number, bz: number, hw: number, h: number): number => {
      const dist = Math.hypot(bx - x, by + h / 2 - y, bz - z) / r;
      if (dist > 1) return 0;
      return (1 - dist) * exposure(id, bx, by, bz, hw, h);
    };
    for (const e of [...this.entities.values()]) {
      if (Math.abs(e.x - x) > r + 1 || Math.abs(e.y - y) > r + 1 || Math.abs(e.z - z) > r + 1) continue;
      const imp = impactOf(e.id, e.x, e.y, e.z, e.hw, e.h);
      if (imp <= 0) continue;
      const ddx = e.x - x, ddy = e.y + e.h / 2 - y, ddz = e.z - z, dl = Math.hypot(ddx, ddy, ddz) || 1;
      if (e.kind === 'mob') this.hurtMob(e, Math.floor((imp * imp + imp) / 2 * 7 * r + 1), null, ddx / dl * imp, ddz / dl * imp, imp);
      else if (e.kind === 'item' && imp > 0.5) { this.entities.delete(e.id); this.emit({ e: 'remove', id: e.id, why: 'despawn' }); continue; }
      else if (e.kind === 'cart') { this.cartBlasted(e); if (!this.entities.has(e.id)) continue; }
      e.vx += ddx / dl * imp * 20; e.vy += ddy / dl * imp * 20; e.vz += ddz / dl * imp * 20;
    }
    for (const p of this.players.values()) {
      if (p.dead || p.mode === 'creative') continue;
      if (Math.abs(p.x - x) > r + 1 || Math.abs(p.y - y) > r + 1 || Math.abs(p.z - z) > r + 1) continue;
      const imp = impactOf(p.id, p.x, p.y, p.z, 0.3, 1.8);
      if (imp <= 0) continue;
      this.damage(p, Math.floor((imp * imp + imp) / 2 * 7 * r + 1), 'explosion', x, z, true, false, undefined, imp * 1.6);
    }
    this.lastBlast = { x, y, z, power, broke: hit.length / 3 };
    if (hit.length) this.bulkBlast(hit, x, y, z);
    this.emit({ e: 'boom', x, y, z, r: power });
    this.emit({ e: 'sound', s: 'explode', x, y, z, vol: 4 });
  }

  private bulkBlast(hit: number[], cx: number, cy: number, cz: number): void {
    const removed = new Set<number>();
    const olds: number[] = [];
    const drops = new Map<number, number>();
    const kegs: [number, number, number][] = [];
    const key = (x: number, y: number, z: number) => ((x + 1048576) * 512 + y) * 2097152 + (z + 1048576);
    for (let i = 0; i < hit.length; i += 3) {
      const x = hit[i], y = hit[i + 1], z = hit[i + 2];
      const old = this.get(x, y, z);
      if (!blockId(old)) { olds.push(0); continue; }
      if (blockId(old) === B.TNT) { kegs.push([x, y, z]); olds.push(0); continue; }
      for (const d of this.blockDrops(old, null, true)) drops.set(d.id, (drops.get(d.id) ?? 0) + d.count);
      const nv = isWaterPlant(blockId(old)) ? B.WATER : 0;
      this.store.setBlock(x, y, z, nv);
      this.emit({ e: 'block', x, y, z, v: nv, old });
      removed.add(key(x, y, z));
      olds.push(old);
    }
    const logs: [number, number, number][] = [];
    for (let i = 0, j = 0; i < hit.length; i += 3, j++) {
      const old = olds[j];
      if (!old) continue;
      const x = hit[i], y = hit[i + 1], z = hit[i + 2];
      let surface = false;
      for (const [dx, dy, dz] of SIX) {
        if (removed.has(key(x + dx, y + dy, z + dz))) continue;
        if (blockId(this.get(x + dx, y + dy, z + dz))) { surface = true; break; }
      }
      const oid = blockId(old);
      if (oid === B.OAK_LOG || oid === B.BIRCH_LOG || oid === B.SPRUCE_LOG || oid === B.JUNGLE_LOG) logs.push([x, y, z]);
      if (surface) { this.noLeafDecay = true; this.afterChange(x, y, z, old, this.get(x, y, z)); this.noLeafDecay = false; }
      else {
        this.info.changed(x, y, z, old, 0);
        if (oid === B.CHEST || oid === B.FURNACE || oid === B.FURNACE_LIT || oid === B.HOPPER || oid === B.DROPPER || oid === B.DISPENSER) this.removeBlockEntity(x, y, z, true);
      }
    }
    const cells = new Set<string>();
    for (const [x, y, z] of logs) { const c = `${x >> 3},${y >> 3},${z >> 3}`; if (!cells.has(c)) { cells.add(c); this.scheduleLeafDecay(x, y, z); } }
    for (const [id, count] of drops) {
      const max = getItem(id)?.maxStack ?? 64;
      for (let left = count; left > 0; left -= max) this.spawnItem(cx + (this.rng.next() - 0.5) * 2, cy, cz + (this.rng.next() - 0.5) * 2, { id, count: Math.min(max, left) });
    }
    for (const [x, y, z] of kegs) this.primeTnt(x, y, z, 10 + this.rng.int(20));
  }

  private noLeafDecay = false;

  private containerSlots(x: number, y: number, z: number): (ItemStack | null)[][] | null {
    const id = blockId(this.get(x, y, z));
    if (id !== B.CHEST && id !== B.HOPPER && id !== B.DROPPER && id !== B.DISPENSER && id !== B.FURNACE && id !== B.FURNACE_LIT) return null;
    const be = this.ensureBlockEntity(x, y, z);
    if (!be) return null;
    if (id !== B.CHEST) return [be.items];
    const pr = chestPartner(this.store, x, y, z);
    const other = pr ? this.ensureBlockEntity(pr[0], pr[1], pr[2]) : null;
    if (!other) return [be.items];
    return pr![3] ? [be.items, other.items] : [other.items, be.items];
  }

  private fits(items: (ItemStack | null)[], idx: number, s: ItemStack): boolean {
    const t = items[idx];
    if (!t) return true;
    return t.id === s.id && !t.dmg && !s.dmg && t.count < (getItem(t.id)?.maxStack ?? 64);
  }

  insertOne(x: number, y: number, z: number, s: ItemStack, from: number): boolean {
    const id = blockId(this.get(x, y, z));
    const groups = this.containerSlots(x, y, z);
    if (!groups) return false;
    let slots: number[] | null = null;
    if (id === B.FURNACE || id === B.FURNACE_LIT) {
      if (from === 2) slots = [0];
      else if (getItem(s.id)?.fuel) slots = [1];
      else return false;
    }
    for (const items of groups) {
      const order = slots ?? items.map((_, i) => i);
      for (const i of order) if (items[i] && this.fits(items, i, s)) { items[i]!.count++; this.containerTouched(x, y, z); return true; }
      for (const i of order) if (!items[i]) { items[i] = { ...s, count: 1 }; this.containerTouched(x, y, z); return true; }
    }
    return false;
  }

  private containerTouched(x: number, y: number, z: number): void {
    const k = posKey(x, y, z);
    this.emit({ e: 'container', key: k });
    const id = blockId(this.get(x, y, z));
    if ((id === B.FURNACE || id === B.FURNACE_LIT) && !this.activeFurnaces.has(k)) this.activeFurnaces.add(k);
  }

  private tickHoppers(): void {
    for (const k of [...this.hoppers]) {
      const [x, y, z] = parsePosKey(k);
      if (!this.store.isLoaded(x, z)) continue;
      const v = this.get(x, y, z);
      if (blockId(v) !== B.HOPPER) { this.hoppers.delete(k); continue; }
      const be = this.ensureBlockEntity(x, y, z) as { items: (ItemStack | null)[]; cd?: number } | null;
      if (!be) continue;
      be.cd = (be.cd ?? 0) - 1;
      if (be.cd > 0 || blockMeta(v) & HOPPER_OFF) continue;
      let moved = false;
      const f = blockMeta(v) & 7;
      const [dx, dy, dz] = DIR6[f];
      for (let i = 0; i < be.items.length && !moved; i++) {
        const s = be.items[i];
        if (!s) continue;
        if (this.insertOne(x + dx, y + dy, z + dz, s, f)) { s.count--; if (s.count <= 0) be.items[i] = null; moved = true; }
      }
      const above = this.containerSlots(x, y + 1, z);
      if (above) {
        const aid = blockId(this.get(x, y + 1, z));
        outer: for (const items of above) {
          const order = aid === B.FURNACE || aid === B.FURNACE_LIT ? [2] : items.map((_, i) => i);
          for (const i of order) {
            const s = items[i];
            if (!s) continue;
            const slot = be.items.findIndex((t, j) => t && this.fits(be.items, j, s));
            const empty = be.items.findIndex((t) => !t);
            const at = slot >= 0 ? slot : empty;
            if (at < 0) continue;
            if (be.items[at]) be.items[at]!.count++; else be.items[at] = { ...s, count: 1 };
            s.count--; if (s.count <= 0) items[i] = null;
            this.containerTouched(x, y + 1, z);
            moved = true;
            break outer;
          }
        }
      } else {
        for (const e of this.entities.values()) {
          if (e.kind !== 'item' || !e.item) continue;
          if (e.x < x || e.x > x + 1 || e.z < z || e.z > z + 1 || e.y < y + 0.6 || e.y > y + 2) continue;
          if (isSolid(this.get(x, y + 1, z)) && e.y >= y + 1.01) continue;
          let left = e.item.count;
          for (let j = 0; j < be.items.length && left > 0; j++) {
            const t = be.items[j];
            const max = getItem(e.item.id)?.maxStack ?? 64;
            if (!t) { const n = Math.min(left, max); be.items[j] = { ...e.item, count: n }; left -= n; }
            else if (t.id === e.item.id && !t.dmg && !e.item.dmg && t.count < max) { const n = Math.min(left, max - t.count); t.count += n; left -= n; }
          }
          if (left === e.item.count) continue;
          if (left <= 0) { this.entities.delete(e.id); this.emit({ e: 'remove', id: e.id, why: 'pickup' }); }
          else e.item.count = left;
          this.emit({ e: 'container', key: k });
        }
      }
      if (moved) { be.cd = 8; this.emit({ e: 'container', key: k }); }
    }
  }

  private dispense(x: number, y: number, z: number, v: number, dir: number): void {
    const be = this.ensureBlockEntity(x, y, z);
    if (!be) return;
    const filled = be.items.map((s, i) => (s ? i : -1)).filter((i) => i >= 0);
    if (!filled.length) { this.emit({ e: 'sound', s: 'click', x: x + 0.5, y: y + 0.5, z: z + 0.5, pitch: 1.2 }); return; }
    const i = filled[this.rng.int(filled.length)];
    const s = be.items[i]!;
    const [dx, dy, dz] = DIR6[dir];
    const tx = x + dx, ty = y + dy, tz = z + dz;
    const take = () => { s.count--; if (s.count <= 0) be.items[i] = null; this.emit({ e: 'container', key: posKey(x, y, z) }); };
    const eject = () => {
      take();
      const e = this.spawnItem(x + 0.5 + dx * 0.7, y + 0.5 + dy * 0.7 - (dy === 0 ? 0.15 : 0), z + 0.5 + dz * 0.7, { ...s, count: 1 }, dx * 2.5 + (this.rng.next() - 0.5) * 0.3, dy * 2.5 + (dy === 0 ? 1 : 0), dz * 2.5 + (this.rng.next() - 0.5) * 0.3, 10);
      if (e) this.emit({ e: 'sound', s: 'click', x: x + 0.5, y: y + 0.5, z: z + 0.5 });
    };
    if (blockId(v) === B.DROPPER) {
      if (this.containerSlots(tx, ty, tz)) { if (this.insertOne(tx, ty, tz, s, dir)) take(); return; }
      eject();
      return;
    }
    const tv = this.get(tx, ty, tz), tid = blockId(tv);
    if (s.id === I.WATER_BUCKET || s.id === I.LAVA_BUCKET) {
      if (!isReplaceable(tv) || (getBlock(tv).fluid && blockMeta(tv) === 0)) { eject(); return; }
      if (tid !== 0 && !getBlock(tv).fluid) this.spawnDrops(tx, ty, tz, tv, null, true);
      if (!(s.id === I.WATER_BUCKET && isNether(tx))) this.setBlock(tx, ty, tz, s.id === I.WATER_BUCKET ? B.WATER : B.LAVA);
      this.scheduleFluid(tx, ty, tz, 2);
      be.items[i] = { id: I.BUCKET, count: 1 };
      this.emit({ e: 'container', key: posKey(x, y, z) });
      this.emit({ e: 'sound', s: 'bucket.empty', x: tx + 0.5, y: ty + 0.5, z: tz + 0.5 });
      return;
    }
    if (s.id === I.BUCKET) {
      if ((tid === B.WATER || tid === B.LAVA) && blockMeta(tv) === 0) {
        this.setBlock(tx, ty, tz, 0);
        const full: ItemStack = { id: tid === B.WATER ? I.WATER_BUCKET : I.LAVA_BUCKET, count: 1 };
        take();
        const slot = be.items.findIndex((t) => !t);
        if (slot >= 0) be.items[slot] = full; else this.spawnItem(tx + 0.5, ty + 0.5, tz + 0.5, full);
        this.emit({ e: 'sound', s: 'bucket.fill', x: tx + 0.5, y: ty + 0.5, z: tz + 0.5 });
        return;
      }
      eject();
      return;
    }
    if (s.id === I.BONE_MEAL) { if (this.applyBoneMeal(tx, ty, tz)) take(); return; }
    if (s.id === B.TNT) {
      if (!isReplaceable(tv) || getBlock(tv).fluid) { eject(); return; }
      take();
      this.setBlock(tx, ty, tz, B.TNT);
      this.primeTnt(tx, ty, tz, 80);
      return;
    }
    if (s.id === I.FLINT_AND_STEEL) {
      if (tid === B.TNT) { this.primeTnt(tx, ty, tz, 80); s.dmg = (s.dmg ?? 0) + 1; if (s.dmg >= 64) be.items[i] = null; this.emit({ e: 'container', key: posKey(x, y, z) }); }
      return;
    }
    if (s.id === I.ARROW) {
      take();
      const sp = 30;
      const a: Entity = {
        id: this.allocId(), kind: 'arrow', type: 'arrow', x: x + 0.5 + dx * 0.7, y: y + 0.5 + dy * 0.7, z: z + 0.5 + dz * 0.7,
        vx: dx * sp, vy: dy * sp + 2, vz: dz * sp, hw: 0.1, h: 0.1, onGround: false, hitH: false, hitCeil: false, yaw: Math.atan2(-dx, -dz), health: 1, maxHealth: 1, hurt: 0, age: 0, fire: 0, flags: 0,
        pickup: true, dmg: 3,
      };
      this.entities.set(a.id, a);
      this.emit({ e: 'spawn', ent: a });
      this.emit({ e: 'sound', s: 'arrow.shoot', x: x + 0.5, y: y + 0.5, z: z + 0.5 });
      return;
    }
    eject();
  }

  private plateOccupied(x: number, y: number, z: number, wooden: boolean): boolean {
    const x0 = x + 1 / 16, x1 = x + 15 / 16, z0 = z + 1 / 16, z1 = z + 15 / 16, y0 = y, y1 = y + 0.25;
    for (const p of this.players.values()) {
      if (p.dead || (p as { spectating?: unknown }).spectating) continue;
      if (p.x + 0.3 > x0 && p.x - 0.3 < x1 && p.z + 0.3 > z0 && p.z - 0.3 < z1 && p.y < y1 && p.y + 1.8 > y0) return true;
    }
    for (const e of this.entities.values()) {
      if (e.kind !== 'mob' && !wooden) continue;
      if (e.kind === 'mob' && e.health <= 0) continue;
      if (e.x + e.hw > x0 && e.x - e.hw < x1 && e.z + e.hw > z0 && e.z - e.hw < z1 && e.y < y1 && e.y + e.h > y0) return true;
    }
    return false;
  }

  private tickPlates(): void {
    const check = (x: number, y: number, z: number, hw: number, mobOrPlayer: boolean) => {
      const by = Math.floor(y + 0.01);
      for (let bx = Math.floor(x - hw); bx <= Math.floor(x + hw); bx++) for (let bz = Math.floor(z - hw); bz <= Math.floor(z + hw); bz++) {
        const v = this.get(bx, by, bz), id = blockId(v);
        if (!isPlate(id) || blockMeta(v) & 1) continue;
        if (!mobOrPlayer && id !== B.OAK_PRESSURE_PLATE) continue;
        if (this.plateOccupied(bx, by, bz, id === B.OAK_PRESSURE_PLATE)) this.rs.pressPlate(bx, by, bz);
      }
    };
    for (const p of this.players.values()) if (!p.dead) check(p.x, p.y, p.z, 0.3, true);
    for (const e of this.entities.values()) if (e.kind !== 'mob' || e.health > 0) check(e.x, e.y, e.z, e.hw, e.kind === 'mob');
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
      const smelt = input ? findSmelt(input.id, this.book) : null;
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
      case B.FIRE: {
        const below = this.get(x, y - 1, z);
        if (below !== X(XV.NETHERRACK) && below !== B.MAGMA_BLOCK && this.rng.chance(0.6)) this.setBlock(x, y, z, 0);
        break;
      }
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
      case B.KELP: {
        const age = blockMeta(v);
        const up = this.get(x, y + 1, z);
        if (age >= 25 || blockId(up) !== B.WATER || blockMeta(up) !== 0 || !this.rng.chance(0.14)) break;
        this.setBlock(x, y, z, B.KELP_PLANT);
        this.setBlock(x, y + 1, z, makeBlock(B.KELP, age + 1));
        break;
      }
      case B.VINE: {
        if (!this.rng.chance(0.25) || blockId(this.get(x, y - 1, z)) !== 0) break;
        let n = 0;
        for (let i = 1; i <= 8 && blockId(this.get(x, y + i, z)) === B.VINE; i++) n++;
        if (n < 6) this.setBlock(x, y - 1, z, v);
        break;
      }
    }
  }

  growTree(x: number, y: number, z: number, sapling: number): boolean {
    const kind = sapling - B.OAK_SAPLING;
    if (kind >= 2) {
      for (const [ox, oz] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) {
        const tx = x + ox, tz = z + oz;
        if (![[0, 0], [1, 0], [0, 1], [1, 1]].every(([a, c]) => blockId(this.get(tx + a, y, tz + c)) === sapling)) continue;
        const h = kind === 3 ? 14 + this.rng.int(10) : 16 + this.rng.int(9);
        for (let i = 1; i < h + 2; i++) for (const [a, c] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const v = this.get(tx + a, y + i, tz + c); if (!isReplaceable(v) && getBlock(v).render !== 'leaves') return false; }
        for (const [a, c] of [[0, 0], [1, 0], [0, 1], [1, 1]]) this.setBlock(tx + a, y, tz + c, 0);
        const set: TreeSet = (sx, sy, sz, v, isLeaf) => {
          const cur = this.get(sx, sy, sz);
          if (isLeaf) { if (isReplaceable(cur) && !getBlock(cur).fluid) this.setBlock(sx, sy, sz, v); }
          else if (isReplaceable(cur) || getBlock(cur).render === 'leaves' || blockId(cur) === sapling) this.setBlock(sx, sy, sz, v);
        };
        const rnd = (n: number) => this.rng.int(n);
        if (kind === 3) megaJungle(set, tx, y, tz, h, rnd); else megaSpruce(set, tx, y, tz, h, rnd);
        return true;
      }
    }
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
    if (kind === 3) {
      const set: TreeSet = (sx, sy, sz, v) => { if (blockId(this.get(sx, sy, sz)) === 0) this.setBlock(sx, sy, sz, v); };
      jungleVines(set, x, y, z, h - 2, (n) => this.rng.int(n));
    }
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
    if (isNether(cx * 16)) return 0;
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
    if (e.kind === 'tnt') return this.tickTnt(e);
    if (e.kind === 'cart') return this.tickCart(e);
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
    const wall = raycast(this.store, e.x, e.y, e.z, dx, dy, dz, step);
    const reach = wall && isSolid(wall.value) ? wall.dist : step;
    if (e.shooterP) {
      for (const m of this.entities.values()) {
        if (m.kind !== 'mob' || m.health <= 0) continue;
        for (let s = 0; s <= 6; s++) {
          const t = (s / 6) * reach;
          const ax = e.x + dx * t, ay = e.y + dy * t, az = e.z + dz * t;
          if (Math.abs(ax - m.x) < m.hw + 0.15 && Math.abs(az - m.z) < m.hw + 0.15 && ay > m.y && ay < m.y + m.h) {
            if (e.pierced?.includes(m.id)) continue;
            const l = Math.hypot(dx, dz) || 1;
            this.hurtMob(m, this.arrowHit(e, sp), e.shooterP, dx / l * 0.6, dz / l * 0.6, 0.4 + 0.6 * (e.punch ?? 0));
            if (m.fire === 0 && e.fire > 0) m.fire = 100;
            this.emit({ e: 'sound', s: 'arrow.hit', x: e.x, y: e.y, z: e.z });
            if ((e.pierce ?? 0) > 0) { e.pierce!--; (e.pierced ??= []).push(m.id); break; }
            this.entities.delete(e.id);
            this.emit({ e: 'remove', id: e.id, why: 'hit' });
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
        const t = (s / 4) * reach;
        const ax = e.x + dx * t, ay = e.y + dy * t, az = e.z + dz * t;
        if (Math.abs(ax - p.x) < 0.45 && Math.abs(az - p.z) < 0.45 && ay > p.y && ay < p.y + 1.85) {
          const sh = e.shooterP ? this.players.get(e.shooterP) : undefined;
          if (e.fire > 0) p.fireT = Math.max(p.fireT, 100);
          this.projectileHit = true;
          this.damage(p, e.shooterP ? this.arrowHit(e, sp) : Math.max(1, Math.round((e.dmg ?? 3) * DIFF_DMG[this.difficulty])), e.shooterP ? 'player' : 'arrow', e.x - e.vx, e.z - e.vz, true, false, sh?.name);
          this.projectileHit = false;
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
          if (e.age % 5 === 0 || e.los === undefined) e.los = this.lineOfSight(e, target);
          const los = e.los;
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
            this.hitBy = { mob: e, breach: 0 };
            this.damage(target, Math.max(1, Math.round(def.damage * DIFF_DMG[this.difficulty] * 2) / 2), e.type, e.x, e.z);
            this.hitBy = null;
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
    if (held?.id === I.CROSSBOW) return this.crossbow(p, held, power < 0, yaw, pitch);
    if (!held || held.id !== I.BOW) return false;
    if (this.now - (p.lastShot ?? -1e9) < 250) return false;
    power = Math.max(0, Math.min(1, power));
    if (power < 0.1) return false;
    const creative = p.mode === 'creative';
    const infinity = lvl(held, 'infinity') > 0;
    const ai = creative ? -1 : p.inv.slots.findIndex((s) => s?.id === I.ARROW);
    if (!creative && ai < 0) return false;
    p.lastShot = this.now;
    if (!creative) {
      const st = p.inv.slots[ai]!;
      if (!infinity && --st.count <= 0) p.inv.slots[ai] = null;
      damageHeld(p.inv, 1);
      this.emit({ e: 'inv', p });
    }
    const powerLv = lvl(held, 'power');
    pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch));
    const cp = Math.cos(pitch);
    const dx = -Math.sin(yaw) * cp, dy = Math.sin(pitch), dz = -Math.cos(yaw) * cp;
    const speed = 60 * power;
    const ey = p.y + (p.flags & MF.CROUCH ? 1.27 : 1.62) - 0.1;
    const crit = power >= 1;
    const a: Entity = {
      id: this.allocId(), kind: 'arrow', type: 'arrow', x: p.x + dx * 0.4, y: ey + dy * 0.4, z: p.z + dz * 0.4,
      vx: dx * speed, vy: dy * speed, vz: dz * speed,
      hw: 0.1, h: 0.1, onGround: false, hitH: false, hitCeil: false, yaw, health: 1, maxHealth: 1, hurt: 0, age: 0, fire: lvl(held, 'flame') > 0 ? 1 : 0, flags: crit ? 4 : 0,
      shooterP: p.id, pickup: !creative && !infinity, base: 2 + (powerLv > 0 ? 0.5 * powerLv + 0.5 : 0), crit, punch: lvl(held, 'punch'),
    };
    this.entities.set(a.id, a);
    this.emit({ e: 'spawn', ent: a });
    this.emit({ e: 'sound', s: 'arrow.shoot', x: p.x, y: ey, z: p.z });
    return true;
  }

  private smashAround(p: SimPlayer, x: number, y: number, z: number, skipMob: number | null, skipPlayer: string | null, fall: number): void {
    this.emit({ e: 'sound', s: fall > SMASH_HEAVY ? 'mace.smash_heavy' : 'mace.smash', x, y, z, vol: 2 });
    this.emit({ e: 'particles', k: 'break', x, y: y + 0.1, z, d: this.get(Math.floor(x), Math.floor(y) - 1, Math.floor(z)) });
    const heavy = fall > SMASH_HEAVY ? 2 : 1;
    const push = (dx: number, dy: number, dz: number): [number, number, number] | null => {
      const d = Math.hypot(dx, dy, dz);
      if (d > SMASH_RANGE) return null;
      const pw = (SMASH_RANGE - d) * SMASH_PUSH * heavy;
      if (pw <= 0) return null;
      return [(dx / (d || 1)) * pw, SMASH_PUSH, (dz / (d || 1)) * pw];
    };
    for (const e of this.entities.values()) {
      if (e.kind !== 'mob' || e.id === skipMob || e.health <= 0) continue;
      const v = push(e.x - x, e.y - y, e.z - z);
      if (!v) continue;
      e.vx += v[0] * 20; e.vy += v[1] * 20; e.vz += v[2] * 20;
    }
    for (const o of this.players.values()) {
      if (o === p || o.id === skipPlayer || o.dead) continue;
      if (this.game && !this.game.canHurtPlayer(p, o)) continue;
      const v = push(o.x - x, o.y - y, o.z - z);
      if (v) this.emit({ e: 'knock', p: o, x: v[0], y: v[1], z: v[2] });
    }
  }

  private crossbow(p: SimPlayer, held: ItemStack, load: boolean, yaw: number, pitch: number): boolean {
    const creative = p.mode === 'creative';
    if (load) {
      if (held.ld) return false;
      if (this.now - (p.lastShot ?? -1e9) < Math.max(200, 1000 - 250 * lvl(held, 'quick_charge'))) return false;
      const ai = creative ? -1 : p.inv.slots.findIndex((s) => s?.id === I.ARROW);
      if (!creative && ai < 0) return false;
      if (!creative) { const st = p.inv.slots[ai]!; if (--st.count <= 0) p.inv.slots[ai] = null; }
      held.ld = 1;
      p.lastShot = this.now;
      this.emit({ e: 'inv', p });
      this.emit({ e: 'sound', s: 'crossbow.load', x: p.x, y: p.y + 1.5, z: p.z });
      return true;
    }
    if (!held.ld || this.now - (p.lastShot ?? -1e9) < 100) return false;
    held.ld = 0;
    p.lastShot = this.now;
    const multi = lvl(held, 'multishot') > 0, pierce = lvl(held, 'piercing');
    if (!creative) damageHeld(p.inv, multi ? 3 : 1);
    this.emit({ e: 'inv', p });
    pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch));
    const ey = p.y + (p.flags & MF.CROUCH ? 1.27 : 1.62) - 0.1;
    for (const off of multi ? [0, -0.1745, 0.1745] : [0]) {
      const yw = yaw + off;
      const cp = Math.cos(pitch);
      const dx = -Math.sin(yw) * cp, dy = Math.sin(pitch), dz = -Math.cos(yw) * cp;
      const speed = 63;
      const a: Entity = {
        id: this.allocId(), kind: 'arrow', type: 'arrow', x: p.x + dx * 0.4, y: ey + dy * 0.4, z: p.z + dz * 0.4,
        vx: dx * speed, vy: dy * speed, vz: dz * speed,
        hw: 0.1, h: 0.1, onGround: false, hitH: false, hitCeil: false, yaw: yw, health: 1, maxHealth: 1, hurt: 0, age: 0, fire: 0, flags: 0,
        shooterP: p.id, pickup: !creative && (off === 0 || pierce > 0), base: 2, crit: true, pierce,
      };
      this.entities.set(a.id, a);
      this.emit({ e: 'spawn', ent: a });
    }
    this.emit({ e: 'sound', s: 'crossbow.shoot', x: p.x, y: ey, z: p.z });
    return true;
  }

  private arrowHit(e: Entity, sp: number): number {
    return e.base !== undefined ? arrowDamage(sp / 20, e.base, !!e.crit, (n) => this.rng.int(n)) : (e.dmg ?? 3);
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
        return 'Teleports: /sethome [name], /home [name], /delhome <name>, /homes, /tpa <player>, /tpahere <player>, /tpaccept, /tpdeny, /back. Commands: /time set day|noon|night|midnight|<n>, /time cycle on|off, /weather clear|rain|thunder, /gamemode survival|creative, /give <item> [n], /enchant <enchantment> [level], /tp <x> <y> <z>, /spawn, /setspawn, /summon <creature> [n], /pos1, /pos2, /fill <block> [hollow|outline], /replace <from> <to>, /clearsel, /seed, /locate village, /gamerule <rule> [value], /kill';
      case 'seed': if (this.serverMode && !p.op) return 'Only operators can see the seed on a server.'; return `Seed: ${this.seed}`;
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
          daylength: [() => String(this.settings.dayLength ?? DEFAULT_DAY_LENGTH), (v) => { const n = Number(v); if (!Number.isFinite(n) || n < 0.25 || n > 10) return 'Use a multiplier from 0.25 to 10 (3 means daytime lasts three times as long as Java).'; this.settings.dayLength = Math.round(n * 100) / 100; return null; }],
          nightlength: [() => String(this.settings.nightLength ?? DEFAULT_NIGHT_LENGTH), (v) => { const n = Number(v); if (!Number.isFinite(n) || n < 0.25 || n > 10) return 'Use a multiplier from 0.25 to 10 (1 is the Java night length).'; this.settings.nightLength = Math.round(n * 100) / 100; return null; }],
          dodaylightcycle: [() => String(this.settings.dayCycle), (v) => { if (v !== 'true' && v !== 'false') return 'Use true or false.'; this.settings.dayCycle = v === 'true'; return null; }],
        };
        const name = (parts[1] ?? '').toLowerCase();
        const rule = rules[name];
        if (!rule) return 'Rules: randomTickSpeed, doMobSpawning, simulationDistance, mobCap, doDaylightCycle, dayLength, nightLength, maxHomes, allowTpa, showMinimap, showCoordinates';
        if (parts[2] === undefined) return `Gamerule ${parts[1]} is currently set to: ${rule[0]()}`;
        if (!allowed) return need();
        const err = rule[1](parts[2].toLowerCase());
        if (err) return err;
        this.emit({ e: 'rules' });
        return `Gamerule ${parts[1]} is now set to: ${rule[0]()}`;
      }
      case 'locate': {
        const what = (parts[1] ?? 'village').replace(/^minecraft:/, '');
        if (what === 'stronghold' || what === 'trial_chamber' || what === 'trial') {
          if (!allowed) return need();
          const st = this.gen.locate(what === 'stronghold' ? 'stronghold' : 'trial', p.x, p.z);
          const name = what === 'stronghold' ? 'stronghold' : 'trial chamber';
          return st ? `Nearest ${name} is at ${st.x} ${st.y + 1} ${st.z} (${Math.round(Math.hypot(st.x - p.x, st.z - p.z))} blocks away).` : `No ${name} found nearby.`;
        }
        if (what !== 'village') return 'Usage: /locate village|stronghold|trial_chamber';
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
      case 'enchant': {
        if (!allowed) return need();
        const held = heldStack(p.inv);
        if (!held) return 'Hold the item you want to enchant.';
        const key = (parts[1] ?? '').replace(/^minecraft:/, '').toLowerCase();
        const def = ENCH.get(key);
        if (!def) return `Unknown enchantment: ${key || '(none)'}. Try one of: ${ENCHANTS.map((e) => e.key).join(', ')}`;
        const level = Math.max(1, Math.min(def.max, Math.floor(Number(parts[2] ?? 1) || 1)));
        if (held.id === I.BOOK) held.id = I.ENCHANTED_BOOK;
        if (held.id !== I.ENCHANTED_BOOK && !supports(key, held.id)) return `${def.name} cannot go on that item.`;
        const clash = Object.keys(held.en ?? {}).find((k) => k !== key && !compatible(k, key));
        if (clash) return `${def.name} cannot be combined with ${ENCH.get(clash)?.name ?? clash}.`;
        held.en = { ...(held.en ?? {}), [key]: level };
        this.emit({ e: 'inv', p });
        return `Applied ${enchantLabel(key, level)}.`;
      }
      case 'give': {
        if (!allowed) return need();
        let args = parts.slice(1);
        let target = p;
        if (args[0] && (args[0].startsWith('@') || (args.length > 1 && this.findPlayer(args[0]) && !getItemByName(args[0])))) {
          const t = args[0] === '@s' || args[0] === '@p' ? p : this.findPlayer(args[0]);
          if (!t) return 'No player by that name.';
          target = t; args = args.slice(1);
        }
        const key = (args[0] ?? '').replace(/^minecraft:/, '');
        const it = getItemByName(key);
        if (!it) return `Unknown item: ${key || '(none)'}`;
        const n = Math.max(1, Math.min(640, Number(args[1] ?? 1) || 1));
        let left = n;
        while (left > 0) {
          const c = Math.min(left, it.maxStack);
          const rem = giveItem(target.inv, { id: it.id, count: c });
          if (rem > 0) this.invCtx(target).drop({ id: it.id, count: rem });
          left -= c;
        }
        this.emit({ e: 'inv', p: target });
        return `Gave ${n} ${it.name}${target === p ? '' : ` to ${target.name}`}.`;
      }
      case 'tp': {
        if (!allowed) return need();
        if (parts.length === 2 || parts.length === 3) {
          const who = parts.length === 3 ? this.findPlayer(parts[1]) : p;
          const to = this.findPlayer(parts[parts.length - 1]);
          if (!who || !to) return 'No player by that name.';
          who.back = { x: who.x, y: who.y, z: who.z };
          who.x = to.x; who.y = to.y; who.z = to.z; who.peakY = to.y;
          this.emit({ e: 'tp', p: who });
          return `Teleported ${who === p ? 'to' : `${who.name} to`} ${to.name}.`;
        }
        const [x, y, z] = parts.slice(1, 4).map(Number);
        if (![x, y, z].every(Number.isFinite)) return 'Usage: /tp <x> <y> <z> or /tp <player> or /tp <player> <player>';
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

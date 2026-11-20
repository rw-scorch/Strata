import type { BlockArray } from '../chunk';
import { fortressAt, fortressesNear, bastionsNear } from '../worldgen/fortress';
import { PORTAL_GRID } from '../worldgen/ruinedPortal';
import { smithResult } from '../smithing';
import { FRAME_EYE, CHORUS_DEAD, isFluid, CROPS, sp, SPECIES, speciesOf, tix, SB, isTrapdoor, isDoorBlock, TD_OPEN, TD_SPECIES_MIN, trapdoorMeta, ID_LIMIT, CB, DRIP_DOWN, SMALL_UPPER, DL_TILT_SHIFT, SHRIEK_ON, SHRIEK_SUMMON, isLantern, isCampfire, isSoulLight, LANTERN_HANGING, CAMPFIRE_LIT, ANCHOR_LIGHT, isSoulSand } from '../blocks';
import { isRail, railShape, railPowered, railHeight, railLine, RAIL_EXITS, shapeFor, reshapeNeighbor, neighborRails } from '../rails';
import { CHUNK_SIZE, WORLD_HEIGHT, TICKS_PER_DAY, timeRate, DEFAULT_DAY_LENGTH, DEFAULT_NIGHT_LENGTH, REACH_CREATIVE, REACH_SURVIVAL, GameMode, Difficulty } from '../constants';
import {
  B, BLOCKS, CAULDRON_LAVA, isPowder, getBlock, blockId, blockMeta, makeBlock, isSolid, isReplaceable, blockBox, facingFromYaw,
  FACING_DIRS, DOOR_OPEN, DOOR_UPPER, doorMeta, doorFacing, LIGHT_EMIT, OPAQUE, isWaterPlant, isWaterLike,
  SHAPE_MATS, SLAB_TOP, STAIRS_UP, slabItem, stairsItem, BLAST_RES, X, XV, isFullCube,
} from '../blocks';
import { getItem, I, fuelSeconds, spearIndex, maxDurability, ITEM_BY_KEY, armorId, toolId } from '../items';
import { catOf, lvl, tableOffers, tableList, anvilResult, JavaRandom, ENCH, ENCHANTS, supports, compatible, enchantLabel, type TableOffer } from '../enchants';
import {
  PlayerInv, ItemStack, InvOp, applyInvOp, emptyInv, giveItem, heldStack, damageHeld, consumeHeld,
  armorPoints, damageArmor, allStacks, CHEST_SIZE, FURNACE_SIZE, invHash, sameKind, cloneStack,
  countItem, removeItem,
} from '../inventory';
import { findSmelt, campfireResult, CAMPFIRE_COOK, Recipe, RecipeBook, BASE_BOOK, DataRecipes, makeBook, ingredientMatches } from '../crafting';
import { mergeData } from '../datapack';
import { trialLoot, vaultLoot } from '../worldgen/structures';
import { Redstone, isButton, isPlate, isTorch, isDiode, attachOut, DIR6, LEVER_ON, isPiston, HOPPER_OFF } from './redstone';
import { TreeSet, megaJungle, megaSpruce, jungleVines, acacia, darkOak, cherry, mangrove } from '../worldgen/trees';
import { enchantBonus, WIND_BURST, attackStats, attackCharge, scaledDamage, armorReduce, armorToughness, maceBonus, arrowDamage, attackRange, SPEAR_STATS, SPEAR_MIN, SPEAR_MARGIN, CHARGE_HURT_SPEED, CHARGE_KNOCK_SPEED, chargeDamage, SMASH_RANGE, SMASH_PUSH, SMASH_HEAVY, type AttackStats } from './combat';
import { JOB_SITES, JOB_BLOCK, PROFESSIONS, villagerOffers, unlocked, performTrade, tradeXp, levelFor, Profession } from '../trades';
import { BlockReader, Body, moveBody, raycast, boxCollides, sampleMedium, fluidFlow, bubbleColumn, bubbleSurface } from '../physics';
import { Rng } from '../rng';
import { WorldGenerator } from '../worldgen/WorldGenerator';
import { MOBS, MobType, MobDef, PASSIVE_TYPES, HOSTILE_TYPES, MOB_BY_CODE } from './mobs';
import { findPath, standable, PathNode } from './pathfind';
import { hugeFungus, CNYL, WNYL } from '../worldgen/fungus';
import { tickFluid, fluidDelay, FluidWorld } from './fluids';
import { ChunkInfo, chunkNum } from './light';
import { Mischief } from './mischief';
import { Blueprint, bpCosts, bpItem } from '../blueprint';
import { isNether, isEnd, toNether, toOverworld, NETHER_HEIGHT, NETHER_LAVA, localX, cmdXYZ, END_X, END_SPAWN, dimOf } from '../dimension';
import { portalRoomCenter } from '../worldgen/structures';
import { EXIT_Y, exitPortalCells, gatewaySpot } from '../worldgen/end';

export interface WorldStore extends BlockReader {
  setBlock(x: number, y: number, z: number, v: number): void;
  isLoaded(x: number, z: number): boolean;
  ensure?(x: number, z: number): void;
  raw?(cx: number, cz: number): BlockArray | null;
}

function getItemByName(key: string): ReturnType<typeof getItem> | undefined {
  const k = key.toLowerCase();
  const hit = ITEM_BY_KEY.get(k);
  if (hit) return hit;
  for (let i = 1; i < 8192; i++) { const d = getItem(i); if (d && (d.key === k || d.name.toLowerCase() === k)) return d; }
  return undefined;
}

export interface Appearance { skin: number; hair: number; shirt: number; pants: number; }

export function entTypeCode(e: Entity): number {
  if (e.kind === 'mob') return MOBS[e.type as MobType].code;
  if (e.kind === 'item') return e.item!.id;
  if (e.kind === 'cart') return e.type === 'tntcart' ? 1 : 0;
  if (e.kind === 'fireball') return e.type === 'dfire' ? 1 : 0;
  if (e.kind === 'arrow' && e.type === 'bullet') return 60001;
  if (e.kind === 'arrow' && e.type === 'pearl') return I.ENDER_PEARL;
  if (e.kind === 'arrow' && e.type === 'xpbottle') return I.EXPERIENCE_BOTTLE;
  if (e.kind === 'arrow' && e.type === 'eye') return I.EYE_OF_ENDER;
  return 0;
}

const SIX = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const;
const EXP_Y = [0.1, 0.5, 0.9], EXP_X = [-0.8, 0.8], EXP_Y_FEW = [0.25, 0.75], EXP_X_FEW = [0];
const FLUID_ID = (() => { const t = new Uint8Array(ID_LIMIT); for (let i = 0; i < 256; i++) if (BLOCKS[i]?.fluid) t[i] = 1; return t; })();
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
  JUMP: 512, SWING: 1024, EAT: 2048, FORWARD: 4096, RIDE: 8192, PRONE: 16384, CHARGE: 32768, BLOCK: 65536, GLIDE: 131072, LEVITATE: 262144 } as const;

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
  anchor?: [number, number, number];
  screen: { type: ScreenType | null; x: number; y: number; z: number };
  dig: { x: number; y: number; z: number; t: number } | null;
  portalT?: number; portalLock?: boolean;
  endTrip?: { x: number; y: number; z: number; t: number; toEnd: boolean; gate?: { x: number; y: number; z: number } };
  levT?: number;
  glideWear?: number;
  glideH?: number;
  glideDir?: [number, number];
  rocketAt?: number;
  lastDragonHit?: number;
  travel?: { tx: number; ty: number; tz: number; t: number; ox: number; oy: number; oz: number; axis: number; nether: boolean; src?: string; dest?: { x: number; y: number; z: number; axis: number; exist: boolean } };
  hurtCd: number; fireT: number; peakY: number; absorb?: number; absorbT?: number; regenT?: number; witherT?: number;
  t: { lava: number; suffocate?: number; drown: number; cactus: number; void: number; starve: number; regen: number; fire: number };
  riding?: number;
  speed?: number;
  vel?: { x: number; y: number; z: number };
  vref?: { x: number; y: number; z: number; t: number };
  eqId?: number;
  strengthAt?: number;
  charge?: { t0: number; hits: Record<string, number>; done: boolean };
  eseed?: number;
  lastAttack: number; lastEat: number; lastMove: number; lastShot?: number; blockAt?: number; shieldCd?: number; pearlCd?: number; wasFire?: boolean; lastSwing?: number; lastHurt?: number;
  op: boolean;
  sel: [number[] | null, number[] | null];
  homes?: Record<string, { x: number; y: number; z: number }>;
  supporter?: string;
  back?: { x: number; y: number; z: number };
  bpAt?: number;
  vanished?: boolean;
  skin?: { png: string; slim: boolean } | null;
  kills?: number; deaths?: number; playtime?: number;
  screenTitle?: string;
  stepAcc?: number; warn?: number; warnT?: number; shriekCd?: number;
}

export type EntityKind = 'mob' | 'item' | 'arrow' | 'tnt' | 'cart' | 'fireball';
export type ScreenType = 'chest' | 'furnace' | 'workbench' | 'shop' | 'trade' | 'enchant' | 'anvil' | 'smith';

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
  type: MobType | 'item' | 'arrow' | 'tnt' | 'cart' | 'tntcart' | 'fireball' | 'pearl' | 'xpbottle' | 'eye' | 'bullet' | 'firework' | 'dfire';
  tx?: number;
  tz?: number;
  ty?: number;
  size?: number;
  charge?: number;
  wield?: number;
  tseed?: number;
  job?: [number, number, number];
  jobless?: number;
  cname?: string;
  saddled?: boolean;
  boost?: number;
  admire?: number;
  zomb?: number;
  scared?: [number, number] | null;
  goal?: [number, number, number];
  rider?: string;
  fall?: number;
  wob?: number;
  fuse?: number;
  portalCd?: number;
  dodgeT?: number;
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
  sb?: number[];
  target?: string | null;
  path?: PathNode[] | null;
  pathT?: number;
  wanderT?: number;
  panic?: number;
  attackCd?: number;
  provoked?: number;
  attacker?: string;
  persistent?: boolean;
  phase?: string;
  pt?: number;
  ang?: number;
  gx?: number;
  gy?: number;
  gz?: number;
  pil?: number;
  att?: number;
  peek?: number;
  peekT?: number;
  taken?: number;
  bulletCd?: number;
  homeT?: number;
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
  | { type: 'portal'; items: (ItemStack | null)[]; axis: number; link?: string }
  | { type: 'campfire'; items: (ItemStack | null)[]; cook: number[] };

export type Weather = 'clear' | 'rain' | 'thunder';

export type SimEvent =
  | { e: 'block'; x: number; y: number; z: number; v: number; old: number; src?: string }
  | { e: 'sound'; s: string; x: number; y: number; z: number; vol?: number; pitch?: number; src?: string; to?: string }
  | { e: 'particles'; k: 'break' | 'hurt' | 'smoke' | 'splash' | 'xp' | 'crit' | 'heart' | 'sweep' | 'shriek' | 'portal' | 'breath' | 'firework' | 'dragon'; x: number; y: number; z: number; d?: number; src?: string }
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
  | { e: 'dark'; p: SimPlayer; t: number }
  | { e: 'travel'; p: SimPlayer; phase: 'start' | 'end'; nether: boolean; end?: boolean }
  | { e: 'work'; p: SimPlayer; items: (ItemStack | null)[]; offers?: TableOffer[] }
  | { e: 'boom'; x: number; y: number; z: number; r: number }
  | { e: 'reject'; p: SimPlayer; x: number; y: number; z: number }
  | { e: 'stats'; p: SimPlayer }
  | { e: 'weather'; w: Weather; d?: number }
  | { e: 'time' }
  | { e: 'rules' }
  | { e: 'mode'; p: SimPlayer }
  | { e: 'crafted'; p: SimPlayer; recipe: Recipe; times: number }
  | { e: 'game'; state: unknown }
  | { e: 'title'; text: string; sub: string; to?: string }
  | { e: 'trade'; p: SimPlayer; v: Entity }
  | { e: 'mobname'; id: number; name: string }
  | { e: 'chestLid'; x: number; y: number; z: number; n: number }
  | { e: 'effect'; p: SimPlayer; k: 'levitation'; t: number };

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
  maxHomes?: number; tpa?: boolean; allowMinimap?: boolean; allowCoords?: boolean; allowBlueprints?: boolean; fireTick?: boolean;
}

const DT = 1 / 20;
const DIFF_DMG: Record<Difficulty, number> = { peaceful: 0, easy: 0.5, normal: 1, hard: 1.5 };
export const RULE_KEYS = ['simDistance', 'randomTickSpeed', 'mobSpawning', 'mobCap', 'maxHomes', 'tpa', 'allowMinimap', 'allowCoords', 'dayLength', 'nightLength', 'allowBlueprints', 'fireTick'] as const;
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
const FOLLOW: Record<string, number> = { hollowed: 35, cinderhusk: 35, piglin_brute: 16 };
const CREATURE_CAP = 10;
const SPAWN_RANGE = 128;
const DIR4H = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const FLAM: [number, number][] = [];
const WOOD_MAT: boolean[] = SHAPE_MATS.map((m) => /_planks$/.test(m.key) && !/crimson|warped/.test(m.key));
for (const d of BLOCKS) {
  if (!d) continue;
  const k = d.key;
  if (/crimson|warped/.test(k)) continue;
  if (/_planks$|_fence$|_fence_gate$|bookshelf$|^lectern$|^composter$|^barrel$|^crafting_table$|^loom$|^cartography_table$|^fletching_table$|^smithing_table$|^beehive$|^chest$|_door$|_trapdoor$|^ladder$|^jukebox$|^note_block$/.test(k)) FLAM[d.id] = /bookshelf/.test(k) ? [30, 20] : [5, 20];
  else if (/_log$|_wood$|^stripped_|_stem$|^coal_block$/.test(k)) FLAM[d.id] = [5, 5];
  else if (/_leaves$|_wool$|^wool$|^dried_kelp_block$|^azalea|^moss_block$|^moss_carpet$/.test(k)) FLAM[d.id] = [30, 60];
  else if (/_carpet$|^hay_block$|^target$/.test(k)) FLAM[d.id] = k === 'target' ? [15, 20] : [60, 20];
  else if (/^tnt$/.test(k)) FLAM[d.id] = [15, 100];
  else if (/^vine$|^glow_lichen$|^cave_vines/.test(k)) FLAM[d.id] = [15, 100];
  else if (/^short_grass$|^tall_grass$|^grass_plant$|^fern$|^large_fern$|^dead_bush$|^dandelion$|^poppy$|^cornflower$|^allium$|^azure_bluet$|_tulip$|^oxeye_daisy$|^lily_of_the_valley$|^blue_orchid$|^sweet_berry_bush$|^spore_blossom$|^big_dripleaf|^small_dripleaf|^hanging_roots$/.test(k)) FLAM[d.id] = [60, 100];
  else if (/^scaffolding$/.test(k)) FLAM[d.id] = [60, 60];
}
const GHAST_SPACING = 40;
type BpJobT = { bp: Blueprint; x0: number; y0: number; z0: number };
export type LocateKind = 'village' | 'stronghold' | 'trial_chamber' | 'ruined_portal' | 'fortress' | 'bastion_remnant';
const LOCATE_NAMES: Record<LocateKind, string> = { village: 'village', stronghold: 'stronghold', trial_chamber: 'trial chamber', ruined_portal: 'ruined portal', fortress: 'Nether fortress', bastion_remnant: 'bastion remnant' };
const LOCATE_ALIASES: Record<string, LocateKind> = {
  village: 'village', villages: 'village', village_plains: 'village', village_desert: 'village', village_savanna: 'village', village_snowy: 'village', village_taiga: 'village',
  stronghold: 'stronghold', trial: 'trial_chamber', trial_chamber: 'trial_chamber', trial_chambers: 'trial_chamber',
  ruined_portal: 'ruined_portal', ruined_portals: 'ruined_portal', portal: 'ruined_portal',
  fortress: 'fortress', nether_fortress: 'fortress', bastion: 'bastion_remnant', bastion_remnant: 'bastion_remnant',
};
const V_SCALE = 384 / WORLD_HEIGHT;
const mobDist2 = (dx: number, dy: number, dz: number): number => dx * dx + (dy * V_SCALE) ** 2 + dz * dz;
const MAX_NATURAL = 480;
const TICKABLE = new Uint8Array(ID_LIMIT);
for (const id of [B.KELP, B.VINE, B.WHEAT, B.OAK_SAPLING, B.BIRCH_SAPLING, B.SPRUCE_SAPLING, B.JUNGLE_SAPLING, B.SUGAR_CANE, B.CACTUS, B.GRASS, B.SNOWY_GRASS, B.ICE, B.FIRE, B.NETHER_WART, B.CARROTS, B.POTATOES, B.BEETROOTS, CB.CAVE_VINES, CB.CAVE_VINES_LIT, B.NETHER_PORTAL, B.LAVA, CB.POINTED_DRIPSTONE, B.CAULDRON, CB.CHORUS_FLOWER]) TICKABLE[id] = 1;
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

export function fireproof(id: number): boolean {
  return id === I.CINDERITE_SCRAP || id === I.CINDERITE_INGOT || id === 600 + XV.ANCIENT_DEBRIS || id === 600 + XV.CINDERITE_BLOCK || (id >= 325 && id < 330) || (id >= 346 && id < 350);
}

export const BLAST_OUT = new Set<number>([I.IRON_INGOT, I.GOLD_INGOT, I.COPPER_INGOT, I.IRON_NUGGET, I.GOLD_NUGGET, I.CINDERITE_SCRAP, I.AETHERITE, I.COAL, I.REDSTONE, I.LAPIS, I.QUARTZ, I.EMERALD]);
const COMPOST: Record<number, number> = {
  [I.SEEDS]: 0.3, [I.BEETROOT_SEEDS]: 0.3, [B.GRASS]: 0.3, [B.OAK_LEAVES]: 0.3, [I.DRIED_KELP]: 0.3, [B.OAK_SAPLING]: 0.3, [B.BIRCH_SAPLING]: 0.3, [B.SPRUCE_SAPLING]: 0.3, [B.JUNGLE_SAPLING]: 0.3,
  [I.MELON_SLICE]: 0.5, [B.CACTUS]: 0.5, [B.SUGAR_CANE]: 0.5, [B.VINE]: 0.5, [600 + XV.DRIED_KELP_BLOCK]: 0.5,
  [I.APPLE]: 0.65, [I.BEETROOT]: 0.65, [I.CARROT]: 0.65, [I.POTATO]: 0.65, [I.WHEAT]: 0.65, [B.PUMPKIN]: 0.65, [B.MELON]: 0.65, [B.LILY_PAD]: 0.65, [I.NETHER_WART]: 0.65, [B.CRIMSON_FUNGUS]: 0.65, [B.WARPED_FUNGUS]: 0.65,
  [I.BAKED_POTATO]: 0.85, [I.BREAD]: 0.85, [I.COOKIE]: 0.85, [B.HAY_BLOCK]: 0.85,
  [I.PUMPKIN_PIE]: 1, [B.CAKE]: 1,
};

export function rideOffset(e: { type: string }): number { return e.type === 'lavastrider' ? 1.6 : 0.35; }

export function wearsGold(p: SimPlayer): boolean { return p.inv.armor.some((a) => !!a && a.id >= 338 && a.id < 342); }

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

export interface EndState { started: boolean; alive: boolean; kills: number; lastKill: number; exitOpen: boolean; gates: number[]; lost: number[]; warned?: boolean; summon?: number; auto?: boolean; }
export function freshEndState(): EndState { return { started: false, alive: true, kills: 0, lastKill: 0, exitOpen: false, gates: [], lost: [] }; }
export const DRAGON_RESPAWN_MS = 2 * 86400000, DRAGON_PEAK = 10;
const RIM: [number, number][] = [[0, 3], [0, -3], [3, 0], [-3, 0]];
const DRAGON_IMMUNE = new Set<number>([B.OBSIDIAN, B.BEDROCK, B.IRON_BARS, CB.END_STONE, CB.END_PORTAL, CB.END_GATEWAY, CB.END_PORTAL_FRAME, B.CRYING_OBSIDIAN]);

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
  readonly mischief = new Mischief(this);
  entities = new Map<number, Entity>();
  blockEntities = new Map<string, BlockEntity>();
  activeFurnaces = new Set<string>();
  time = 1000;
  tickCount = 0;
  weather: Weather = 'clear';
  weatherTimer = 12000;
  endState: EndState = freshEndState();
  peakPlayers = 0;
  private clouds: { x: number; y: number; z: number; r: number; t: number; by?: number }[] = [];
  rng: Rng;
  private nextEntityId = 1;
  private fluidQueue = new Map<string, number>();
  private fireQueue = new Map<string, number>();

  private scheduleFire(x: number, y: number, z: number, delay: number): void {
    if (this.fireQueue.size > 20000) return;
    this.fireQueue.set(posKey(x, y, z), this.tickCount + delay);
  }

  private flam(v: number): [number, number] { return FLAM[tix(v)] ?? (blockId(v) === B.SLAB || blockId(v) === B.STAIRS ? (WOOD_MAT[(blockMeta(v) & 31)] ? [5, 20] : [0, 0]) : [0, 0]); }

  private fireCanLive(x: number, y: number, z: number): boolean {
    if (isSolid(this.get(x, y - 1, z))) return true;
    for (const [dx, dy, dz] of DIR6) if (this.flam(this.get(x + dx, y + dy, z + dz))[0] > 0) return true;
    return false;
  }

  private rainAt(x: number, y: number, z: number): boolean {
    if (this.weather === 'clear' || isNether(x)) return false;
    if (!this.info.exposed(x, y, z)) return false;
    const b = this.gen.column(x, z).biome.id;
    return b !== 'desert' && b !== 'badlands' && b !== 'savanna';
  }

  private tickFire(): void {
    if (!this.fireQueue.size || !this.authoritative) return;
    const due: string[] = [];
    for (const [k, t] of this.fireQueue) { if (t <= this.tickCount) { due.push(k); if (due.length >= 300) break; } }
    for (const k of due) {
      this.fireQueue.delete(k);
      const [x, y, z] = k.split(',').map(Number);
      const v = this.get(x, y, z);
      if (blockId(v) !== B.FIRE || !this.store.isLoaded(x, z)) continue;
      this.fireTick(x, y, z, v);
    }
  }

  private fireTick(x: number, y: number, z: number, v: number): void {
    if (this.settings.fireTick === false) return;
    if (!this.fireCanLive(x, y, z)) { this.setBlock(x, y, z, 0); return; }
    const below = this.get(x, y - 1, z);
    const infini = below === X(XV.NETHERRACK) || below === B.MAGMA_BLOCK || (blockId(below) === B.BEDROCK && isNether(x));
    const age = blockMeta(v) & 15;
    if (!infini && this.rng.next() < 0.2 + age * 0.03 && (this.rainAt(x, y, z) || DIR4H.some(([dx, dz]) => this.rainAt(x + dx, y, z + dz)))) { this.setBlock(x, y, z, 0); return; }
    const na = Math.min(15, age + (this.rng.int(3) >> 1));
    if (na !== age) this.store.setBlock(x, y, z, makeBlock(B.FIRE, na));
    this.scheduleFire(x, y, z, 30 + this.rng.int(10));
    if (!infini) {
      let near = false;
      for (const [dx, dy, dz] of DIR6) if (this.flam(this.get(x + dx, y + dy, z + dz))[0] > 0) { near = true; break; }
      if (!near) { if (!isSolid(below) || age > 3) this.setBlock(x, y, z, 0); return; }
      if (age === 15 && this.rng.int(4) === 0 && this.flam(below)[1] === 0) { this.setBlock(x, y, z, 0); return; }
    }
    const hum = 0;
    for (const [dx, dy, dz] of DIR6) this.catchFire(x + dx, y + dy, z + dz, (dy === 0 ? 300 : 250) + hum, age);
    const diff = this.difficulty === 'peaceful' ? 0 : this.difficulty === 'easy' ? 1 : this.difficulty === 'normal' ? 2 : 3;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 4; dy++) {
      if (!dx && !dy && !dz) continue;
      const tx = x + dx, ty = y + dy, tz = z + dz;
      if (ty < 1 || ty >= WORLD_HEIGHT - 1 || this.get(tx, ty, tz) !== 0 || !this.store.isLoaded(tx, tz)) continue;
      let k = 100;
      if (dy > 1) k += (dy - 1) * 100;
      let enc = 0;
      for (const [ax, ay, az] of DIR6) enc = Math.max(enc, this.flam(this.get(tx + ax, ty + ay, tz + az))[0]);
      if (enc <= 0) continue;
      const odds = Math.floor((enc + 40 + diff * 7) / (age + 30));
      if (odds > 0 && this.rng.int(k) <= odds && !this.rainAt(tx, ty, tz)) this.setBlock(tx, ty, tz, makeBlock(B.FIRE, Math.min(15, age + (this.rng.int(5) >> 2))), 'fire');
    }
  }

  private catchFire(x: number, y: number, z: number, chance: number, age: number): void {
    const v = this.get(x, y, z);
    const f = this.flam(v)[1];
    if (f <= 0 || this.rng.int(chance) >= f) return;
    if (blockId(v) === B.TNT) { this.setBlock(x, y, z, 0); this.spawnPrimed(x + 0.5, y, z + 0.5, 40 + this.rng.int(20)); return; }
    if (this.rng.int(age + 10) < 5 && !this.rainAt(x, y, z)) this.setBlock(x, y, z, makeBlock(B.FIRE, Math.min(15, age + (this.rng.int(5) >> 2))), 'fire');
    else this.setBlock(x, y, z, 0, 'fire');
  }
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
      dupeTnt: (x, y, z) => { this.spawnPrimed(x + 0.5, y, z + 0.5, 80); this.emit({ e: 'sound', s: 'tnt.primed', x: x + 0.5, y: y + 0.5, z: z + 0.5 }); },
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
    if (oid === CB.SHULKER_BOX && nid !== oid) this.sealShulker(x, y, z);
    if (isCampfire(oid) && !isCampfire(nid)) this.removeBlockEntity(x, y, z, true);
    if (nid === B.SPAWNER && this.authoritative && !this.blockEntities.has(posKey(x, y, z))) {
      const m = blockMeta(v), def = m ? MOB_BY_CODE[m - 1] : undefined;
      this.blockEntities.set(posKey(x, y, z), { type: 'spawner', items: [], mob: def && def.code === m - 1 ? def.type : 'hollowed', delay: 200 });
    }
    if (oid === B.SPAWNER && nid !== B.SPAWNER && this.blockEntities.get(posKey(x, y, z))?.type === 'spawner') this.blockEntities.delete(posKey(x, y, z));
    if (this.authoritative && nid !== oid && (oid === B.NETHER_PORTAL || oid === B.OBSIDIAN)) {
      if (oid === B.NETHER_PORTAL && this.blockEntities.delete(posKey(x, y, z))) this.emit({ e: 'container', key: posKey(x, y, z) });
      for (const [ax, ay, az] of DIR6) this.checkPortal(x + ax, y + ay, z + az);
    }
    if (this.authoritative && nid !== B.FIRE && blockId(this.get(x, y + 1, z)) === B.FIRE && !isSolid(v) && !this.fireCanLive(x, y + 1, z)) this.setBlock(x, y + 1, z, 0);
    if (this.authoritative && nid === B.FIRE && oid !== B.FIRE) this.scheduleFire(x, y, z, 30 + this.rng.int(10));
    this.scheduleFluidAround(x, y, z);
    this.fluidContact(x, y, z, isWaterPlant(nid) ? B.WATER : nid);
    this.checkSupport(x, y + 1, z);
    this.checkSupport(x, y - 1, z);
    for (let f = 0; f < 4; f++) {
      const [dx, dz] = FACING_DIRS[f];
      this.checkSupport(x - dx, y, z - dz);
    }
    if (this.authoritative && (oid === CB.CHORUS_PLANT || nid === CB.CHORUS_PLANT || oid === CB.CHORUS_FLOWER || nid === CB.CHORUS_FLOWER)) {
      for (const [dx, dy, dz] of SIX) this.fixChorus(x + dx, y + dy, z + dz);
      if (nid === CB.CHORUS_PLANT) this.fixChorus(x, y, z);
      if (nid === 0) for (const [dx, dy, dz] of SIX) if (dy >= 0) this.checkSupport(x + dx, y + dy, z + dz);
    }
    if (this.authoritative && (oid === CB.POINTED_DRIPSTONE || nid === CB.POINTED_DRIPSTONE)) { this.fixDripstone(x, y + 1, z); this.fixDripstone(x, y - 1, z); if (nid === CB.POINTED_DRIPSTONE) this.fixDripstone(x, y, z); }
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

  private growSpeciesTree(x: number, y: number, z: number, spc: number): boolean {
    const sap = sp(B.OAK_SAPLING, spc);
    const set: TreeSet = (sx, sy, sz, v, isLeaf) => {
      const cur = this.get(sx, sy, sz);
      if (isLeaf) { if (isReplaceable(cur) && !getBlock(cur).fluid) this.setBlock(sx, sy, sz, v); }
      else if (isReplaceable(cur) || getBlock(cur).render === 'leaves' || cur === sap) this.setBlock(sx, sy, sz, v);
    };
    const rnd = (n: number) => this.rng.int(n);
    const clear = (tx: number, tz: number, w: number, h: number) => {
      for (let i = 1; i < h; i++) for (let a = 0; a < w; a++) for (let c = 0; c < w; c++) { const v = this.get(tx + a, y + i, tz + c); if (!isReplaceable(v) && getBlock(v).render !== 'leaves') return false; }
      return true;
    };
    if (spc === SPECIES.DARK_OAK) {
      for (const [ox, oz] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) {
        const tx = x + ox, tz = z + oz;
        if (![[0, 0], [1, 0], [0, 1], [1, 1]].every(([a, c]) => this.get(tx + a, y, tz + c) === sap)) continue;
        if (!clear(tx, tz, 2, 8)) return false;
        for (const [a, c] of [[0, 0], [1, 0], [0, 1], [1, 1]]) this.setBlock(tx + a, y, tz + c, 0);
        darkOak(set, tx, y, tz, 6 + rnd(3), rnd);
        return true;
      }
      return false;
    }
    if (!clear(x, z, 1, 7)) return false;
    this.setBlock(x, y, z, 0);
    if (spc === SPECIES.CHERRY) cherry(set, x, y, z, 5 + rnd(3), rnd);
    else if (spc === SPECIES.MANGROVE) mangrove(set, x, y, z, 4 + rnd(3), rnd, 0);
    else acacia(set, x, y, z, 5 + rnd(3), rnd);
    return true;
  }

  private leafDecayQueue: [number, number, number, number][] = [];
  private scheduleLeafDecay(x: number, y: number, z: number): void {
    for (let dy = -3; dy <= 4; dy++) for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) {
      const v = this.get(x + dx, y + dy, z + dz);
      if (getBlock(v).render === 'leaves' && (blockMeta(v) & 15) === 0) {
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
    if (e.type === 'lavastrider' && !e.baby) {
      const held = heldStack(p.inv);
      if (p.riding === e.id) {
        if (held?.id === I.FUNGUS_STICK) {
          if ((e.boost ?? 0) > 0) return false;
          e.boost = 60 + this.rng.int(40);
          if (p.mode === 'survival') { damageHeld(p.inv, 1); this.emit({ e: 'inv', p }); }
          this.emit({ e: 'sound', s: 'mob.lavastrider.ambient', x: e.x, y: e.y + 1, z: e.z });
          return true;
        }
        this.dismount(p);
        return true;
      }
      if (!e.saddled && held?.id === I.SADDLE) {
        e.saddled = true; e.persistent = true;
        if (p.mode === 'survival') { held.count--; if (held.count <= 0) p.inv.slots[p.inv.selected] = null; this.emit({ e: 'inv', p }); }
        this.emit({ e: 'sound', s: 'armor.equip', x: e.x, y: e.y, z: e.z });
        return true;
      }
      if (e.saddled) return this.mount(p, e);
    }
    const def = MOBS[e.type as MobType];
    if (def?.trader && (e.prof === undefined || e.prof < 0)) {
      if (heldStack(p.inv)?.id === I.NAME_TAG && heldStack(p.inv)?.nm) return this.nameMob(p, e);
      this.emit({ e: 'sound', s: 'villager.no', x: e.x, y: e.y + 1.5, z: e.z });
      return true;
    }
    if (heldStack(p.inv)?.id === I.NAME_TAG && heldStack(p.inv)?.nm) return this.nameMob(p, e);
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

  nameMob(p: SimPlayer, e: Entity): boolean {
    const held = heldStack(p.inv)!;
    e.cname = held.nm!.slice(0, 32);
    e.persistent = true;
    if (p.mode === 'survival') { held.count--; if (held.count <= 0) p.inv.slots[p.inv.selected] = null; this.emit({ e: 'inv', p }); }
    this.emit({ e: 'mobname', id: e.id, name: e.cname });
    return true;
  }

  namedMobs(): { id: number; name: string }[] {
    const out: { id: number; name: string }[] = [];
    for (const e of this.entities.values()) if (e.cname) out.push({ id: e.id, name: e.cname });
    return out;
  }

  openTrade(p: SimPlayer, e: Entity): boolean {
    if (e.health <= 0 || e.baby) return false;
    for (const o of this.players.values()) if (o !== p && o.screen.type === 'trade' && e.tradeWith === o.id) { this.emit({ e: 'msg', text: 'That villager is busy trading.', kind: 'info', to: p.id }); return false; }
    this.restock(e);
    if (e.tseed === undefined) e.tseed = this.rng.int(0x7fffffff);
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
    if (e.prof === undefined || e.prof < 0) return false;
    const prof = PROFESSIONS[e.prof] as Profession;
    if (!unlocked(prof, e.vxp ?? 0, e.tseed ?? 0).includes(index)) return false;
    const of = villagerOffers(prof, e.tseed ?? 0)[index];
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

  private bpJobs: { pid: string; name: string; bp: Blueprint; x0: number; y0: number; z0: number; phase: 'prep' | 'place'; t0: number; i: number; chunks: number[][] }[] = [];

  private bpSay(pid: string, text: string, kind: 'info' | 'error' = 'info'): void { this.emit({ e: 'msg', text, kind, to: pid }); }

  placeBlueprint(p: SimPlayer, bp: Blueprint, x0: number, y0: number, z0: number): string {
    if (!this.authoritative) return '';
    if (this.settings.allowBlueprints === false) return 'Blueprints are turned off in this world.';
    if (this.game) return 'Blueprints cannot be used in arena games.';
    if (p.dead) return 'You cannot build while dead.';
    if (this.serverMode && !p.op && !this.settings.guestsBuild) return 'Only the owner can build in this world.';
    if (this.bpJobs.some((j) => j.pid === p.id)) return 'Your last blueprint is still being built.';
    if (p.bpAt && this.now - p.bpAt < 3000) return 'Wait a moment before placing another blueprint.';
    if (![x0, y0, z0].every(Number.isInteger)) return 'Bad position.';
    if (y0 < 1 || y0 + bp.h > (isNether(x0) ? NETHER_HEIGHT : WORLD_HEIGHT)) return 'The blueprint does not fit between the bottom and top of the world here.';
    const cx = x0 + bp.w / 2, cz = z0 + bp.d / 2;
    if (Math.hypot(cx - p.x, cz - p.z) > 48 + Math.max(bp.w, bp.d) / 2 || Math.abs(y0 - p.y) > 64) return 'Stand closer to where you want to build.';
    const chunks: number[][] = [];
    for (let qx = x0 >> 4; qx <= (x0 + bp.w - 1) >> 4; qx++) for (let qz = z0 >> 4; qz <= (z0 + bp.d - 1) >> 4; qz++) chunks.push([qx, qz]);
    p.bpAt = this.now;
    this.bpJobs.push({ pid: p.id, name: bp.name, bp, x0, y0, z0, phase: 'prep', t0: this.tickCount, i: 0, chunks });
    return `Preparing ${bp.name}...`;
  }

  private bpCheck(p: SimPlayer, j: BpJobT): string | null {
    const { bp, x0, y0, z0 } = j;
    let blocked = 0;
    for (let y = 0; y < bp.h; y++) for (let z = 0; z < bp.d; z++) for (let x = 0; x < bp.w; x++) {
      if (!bp.blocks[(y * bp.d + z) * bp.w + x]) continue;
      const v = this.get(x0 + x, y0 + y, z0 + z);
      if (blockId(v) && !isReplaceable(v)) blocked++;
    }
    if (blocked) return `${bp.name} would overlap ${blocked} existing block${blocked === 1 ? '' : 's'}. Find a clear spot.`;
    for (const o of this.players.values()) {
      if (o.dead) continue;
      for (let y = Math.floor(o.y); y <= Math.floor(o.y + 1.8); y++) for (const [dx, dz] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) {
        const bx = Math.floor(o.x + dx) - x0, by = y - y0, bz = Math.floor(o.z + dz) - z0;
        if (bx < 0 || by < 0 || bz < 0 || bx >= bp.w || by >= bp.h || bz >= bp.d) continue;
        if (bp.blocks[(by * bp.d + bz) * bp.w + bx]) return `${o === p ? 'You are' : `${o.name} is`} standing where ${bp.name} would go.`;
      }
    }
    if (p.mode === 'creative') return null;
    const missing: string[] = [];
    for (const [id, n] of bpCosts(bp).items) {
      const have = countItem(p.inv, id);
      if (have < n) missing.push(`${n - have} ${getItem(id)?.name ?? `item ${id}`}`);
    }
    if (missing.length) return `Missing materials: ${missing.slice(0, 6).join(', ')}${missing.length > 6 ? ` and ${missing.length - 6} more` : ''}.`;
    return null;
  }

  private tickBlueprints(): void {
    const j = this.bpJobs[0];
    if (!j) return;
    const p = this.players.get(j.pid);
    if (j.phase === 'prep') {
      if (!p) { this.bpJobs.shift(); return; }
      let pending = 0, loaded = 0;
      for (const [qx, qz] of j.chunks) {
        if (this.store.isLoaded(qx * 16, qz * 16)) continue;
        pending++;
        if (loaded < 2 && this.store.ensure) { this.store.ensure(qx * 16, qz * 16); loaded++; }
      }
      if (pending > loaded || (pending && !this.store.ensure)) {
        if (this.tickCount - j.t0 > 400) { this.bpJobs.shift(); this.bpSay(j.pid, 'That area is not loaded. Move closer and try again.', 'error'); }
        return;
      }
      const err = this.bpCheck(p, j);
      if (err) { this.bpJobs.shift(); this.bpSay(j.pid, err, 'error'); return; }
      if (p.mode !== 'creative') {
        for (const [id, n] of bpCosts(j.bp).items) removeItem(p.inv, (q) => q === id, n);
        this.emit({ e: 'inv', p });
      }
      j.phase = 'place';
      return;
    }
    const { bp, x0, y0, z0 } = j;
    const total = bp.w * bp.h * bp.d;
    let n = 0;
    while (j.i < total && n < 2500) {
      const i = j.i++;
      const v = bp.blocks[i];
      if (!v) continue;
      const x = i % bp.w, z = Math.floor(i / bp.w) % bp.d, y = Math.floor(i / (bp.w * bp.d));
      const cur = this.get(x0 + x, y0 + y, z0 + z);
      if (blockId(cur) && !isReplaceable(cur)) continue;
      this.setBlock(x0 + x, y0 + y, z0 + z, v, 'blueprint');
      n++;
    }
    if (j.i >= total) {
      this.bpJobs.shift();
      const c = bpCosts(bp);
      this.emit({ e: 'sound', s: 'block.place', x: x0 + bp.w / 2, y: y0, z: z0 + bp.d / 2, vol: 1.5 });
      this.bpSay(j.pid, `Built ${bp.name} (${c.blocks} blocks).`);
    }
  }

  locateStructure(kind: LocateKind, x: number, z: number): { x: number; y: number | null; z: number; nether: boolean } | null {
    const netherKind = kind === 'fortress' || kind === 'bastion_remnant';
    let sx = x, sz = z;
    if (netherKind && !isNether(x)) [sx, sz] = toNether(x, z);
    if (!netherKind && isNether(x)) [sx, sz] = toOverworld(x, z);
    if (kind === 'village') { const v = this.locateVillage(sx, sz); return v ? { x: v.x, y: v.y + 1, z: v.z, nether: false } : null; }
    if (kind === 'stronghold' || kind === 'trial_chamber') {
      const st = this.gen.locate(kind === 'stronghold' ? 'stronghold' : 'trial', sx, sz);
      return st ? { x: st.x, y: st.y + 1, z: st.z, nether: false } : null;
    }
    if (kind === 'ruined_portal') {
      const crx = Math.floor(sx / PORTAL_GRID), crz = Math.floor(sz / PORTAL_GRID);
      let best: { x: number; y: number; z: number } | null = null, bd = Infinity;
      for (let ring = 0; ring <= 4 && !best; ring++) for (let rz = crz - ring; rz <= crz + ring; rz++) for (let rx = crx - ring; rx <= crx + ring; rx++) {
        if (Math.max(Math.abs(rx - crx), Math.abs(rz - crz)) !== ring) continue;
        const pp = this.gen.ruinedPortal(rx, rz);
        if (!pp) continue;
        const d = Math.hypot(pp.x - sx, pp.z - sz);
        if (d < bd) { bd = d; best = pp; }
      }
      return best ? { x: best.x, y: best.y, z: best.z, nether: false } : null;
    }
    const biome = (bx: number, bz: number) => this.gen.netherBiome(bx, bz);
    for (const r of [600, 1500, 3000]) {
      const list = kind === 'fortress' ? fortressesNear(this.gen.seed, sx - r, sz - r, sx + r, sz + r, biome) : bastionsNear(this.gen.seed, sx - r, sz - r, sx + r, sz + r, biome);
      let best: { x: number; y: number; z: number } | null = null, bd = Infinity;
      for (const f of list) {
        const cx = (f.x0 + f.x1) / 2, cz = (f.z0 + f.z1) / 2;
        const d = Math.hypot(cx - sx, cz - sz);
        if (d < bd) { bd = d; best = { x: Math.floor(cx), y: f.y, z: Math.floor(cz) }; }
      }
      if (best) return { ...best, nether: true };
    }
    return null;
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
    return isDoorBlock(v) ? 0 : v;
  } };

  private setDoor(x: number, y: number, z: number, open: boolean): boolean {
    let v = this.get(x, y, z);
    if (!isDoorBlock(v)) return false;
    if (blockMeta(v) & DOOR_UPPER) { y--; v = this.get(x, y, z); if (!isDoorBlock(v)) return false; }
    if (!!(blockMeta(v) & DOOR_OPEN) === open) return false;
    for (let yy = y; yy <= y + 1; yy++) {
      const dv = this.get(x, yy, z);
      if (isDoorBlock(dv)) this.setBlock(x, yy, z, makeBlock(B.OAK_DOOR, blockMeta(dv) ^ DOOR_OPEN));
    }
    this.emit({ e: 'sound', s: open ? 'door.open' : 'door.close', x: x + 0.5, y: y + 0.5, z: z + 0.5 });
    return true;
  }

  private openDoorFor(e: Entity, x: number, y: number, z: number): void {
    for (let yy = y; yy <= y + 1; yy++) {
      if (!isDoorBlock(this.get(x, yy, z))) continue;
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
        const taken = new Set<string>();
        for (const o of this.entities.values()) if (o.job) taken.add(posKey(o.job[0], o.job[1], o.job[2]));
        for (let dy = -2; dy <= 3 && !e.job; dy++) for (let dz = -4; dz <= 4 && !e.job; dz++) for (let dx = -4; dx <= 4 && !e.job; dx++) {
          const jx = sx + dx, jy = y + dy, jz = sz + dz;
          const jp = JOB_SITES[blockId(this.get(jx, jy, jz))];
          if (jp !== undefined && !taken.has(posKey(jx, jy, jz))) { e.job = [jx, jy, jz]; e.prof = jp; }
        }
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
      if (m & DOOR_UPPER) return isDoorBlock(this.get(x, y - 1, z));
      return isSolid(this.get(x, y - 1, z)) && isDoorBlock(this.get(x, y + 1, z));
    }
    if (id === B.LEVER || isButton(id)) {
      const o = attachOut(blockMeta(v) & 7);
      const [dx, dy, dz] = DIR6[o ^ 1];
      return isSolid(this.get(x + dx, y + dy, z + dz));
    }
    if (isLantern(id)) return blockMeta(v) & LANTERN_HANGING ? isSolid(this.get(x, y + 1, z)) : isSolid(this.get(x, y - 1, z));
    if (id === B.TORCH || isTorch(id) || id === CB.SOUL_TORCH) {
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
    if (id >= CB.MOSS_BLOCK && id <= CB.COBBLED_DEEPSLATE) {
      if (id === CB.GLOW_LICHEN) { const [dx, dz] = FACING_DIRS[blockMeta(v) & 3]; return isSolid(this.get(x + dx, y, z + dz)); }
      if (id === CB.CAVE_VINES || id === CB.CAVE_VINES_LIT) { const a = this.get(x, y + 1, z), ai = blockId(a); return ai === CB.CAVE_VINES || ai === CB.CAVE_VINES_LIT || isSolid(a); }
      if (id === CB.POINTED_DRIPSTONE) return isSolid(this.get(x, blockMeta(v) & DRIP_DOWN ? y + 1 : y - 1, z));
      if (id === CB.SMALL_DRIPLEAF && blockMeta(v) & SMALL_UPPER) return blockId(this.get(x, y - 1, z)) === CB.SMALL_DRIPLEAF;
      if (id === CB.BIG_DRIPLEAF || id === CB.BIG_DRIPLEAF_STEM) {
        const b = blockId(this.get(x, y - 1, z)), a = blockId(this.get(x, y + 1, z));
        if (id === CB.BIG_DRIPLEAF_STEM && a !== CB.BIG_DRIPLEAF && a !== CB.BIG_DRIPLEAF_STEM) return false;
        return b === CB.BIG_DRIPLEAF_STEM || b === B.GRASS || b === B.DIRT || b === B.CLAY || b === CB.MOSS_BLOCK || b === CB.ROOTED_DIRT || b === B.MUD || b === B.FARMLAND;
      }
    }
    if (id === CB.CHORUS_PLANT || id === CB.CHORUS_FLOWER) {
      const b = blockId(this.get(x, y - 1, z));
      if (b === CB.CHORUS_PLANT || b === CB.END_STONE) return true;
      for (const [dx, dz] of FACING_DIRS) {
        if (blockId(this.get(x + dx, y, z + dz)) !== CB.CHORUS_PLANT) continue;
        if (id === CB.CHORUS_FLOWER && b === 0) return true;
        const nb = blockId(this.get(x + dx, y - 1, z + dz));
        if (nb === CB.CHORUS_PLANT || nb === CB.END_STONE) return true;
      }
      return false;
    }
    const below = blockId(this.get(x, y - 1, z));
    if (d.needsSupport === 'nylium') { const bv = this.get(x, y - 1, z); return bv === X(XV.CRIMSON_NYLIUM) || bv === X(XV.WARPED_NYLIUM) || bv === X(XV.SOUL_SOIL) || below === B.GRASS || below === B.DIRT || below === B.FARMLAND || below === B.MUD; }
    if (d.needsSupport === 'hang') { const a = this.get(x, y + 1, z); return blockId(a) === id || isSolid(a); }
    if (id === B.TWISTING_VINES && below === id) return true;
    switch (d.needsSupport) {
      case 'soil': return below === B.GRASS || below === B.DIRT || below === B.FARMLAND || below === B.SNOWY_GRASS || below === B.MUD || below === CB.MOSS_BLOCK || below === CB.ROOTED_DIRT || (below === B.CLAY && id >= CB.MOSS_BLOCK) || (id >= B.OAK_SAPLING && id <= B.JUNGLE_SAPLING ? false : below === B.SAND && id === B.DEAD_BUSH);
      case 'sand': return below === B.SAND || below === B.DIRT || below === B.GRASS;
      case 'farmland': return below === B.FARMLAND;
      case 'soulsand': return this.get(x, y - 1, z) === X(XV.SOUL_SAND);
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
    if (!(isDoorBlock(v) && blockMeta(v) & DOOR_UPPER)) this.spawnDrops(x, y, z, v, null, true);
    this.emit({ e: 'particles', k: 'break', x: x + 0.5, y: y + 0.5, z: z + 0.5, d: v });
    this.checkSupport(x, y + 1, z, depth + 1);
    this.checkSupport(x, y - 1, z, depth + 1);
    this.scheduleFluidAround(x, y, z);
  }

  blockDrops(v: number, stack: ItemStack | null, natural: boolean): ItemStack[] {
    const d = getBlock(v);
    const id = d.id;
    if (id === B.SLAB) return [{ id: slabItem(blockMeta(v) & 31), count: 1 }];
    if (id === B.STAIRS) return [{ id: stairsItem(blockMeta(v) & 31), count: 1 }];
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
    if (id === B.CARROTS || id === B.POTATOES) {
      const ripe = (blockMeta(v) & 7) >= 7, item = id === B.CARROTS ? I.CARROT : I.POTATO;
      const out: ItemStack[] = [{ id: item, count: ripe ? 2 + this.rng.int(3 + fortune) : 1 }];
      if (ripe && id === B.POTATOES && this.rng.chance(0.02)) out.push({ id: I.BEETROOT_SEEDS, count: 1 });
      return out;
    }
    if (id === B.BEETROOTS) return (blockMeta(v) & 3) >= 3 ? [{ id: I.BEETROOT, count: 1 }, { id: I.BEETROOT_SEEDS, count: 1 + this.rng.int(3) }] : [{ id: I.BEETROOT_SEEDS, count: 1 }];
    if (v === X(XV.GILDED_BLACKSTONE) && this.rng.chance([0.1, 0.14, 0.25, 1][Math.min(3, fortune)])) return [{ id: I.GOLD_NUGGET, count: 2 + this.rng.int(4) }];
    if (id === B.NETHER_WART) return [{ id: I.NETHER_WART, count: (blockMeta(v) & 3) >= 3 ? 2 + this.rng.int(3 + fortune) : 1 }];
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
    if (id === B.CHEST || id === B.BARREL || id === CB.SHULKER_BOX) be = { type: 'chest', items: new Array(CHEST_SIZE).fill(null) };
    else if (id === B.FURNACE || id === B.FURNACE_LIT || id === B.BLAST_FURNACE || id === B.SMOKER) be = { type: 'furnace', items: new Array(FURNACE_SIZE).fill(null), burn: 0, burnMax: 0, cook: 0, xp: 0 };
    else if (isCampfire(id)) be = { type: 'campfire', items: [null, null, null, null], cook: [0, 0, 0, 0] };
    else if (id === B.HOPPER) be = { type: 'chest', items: new Array(5).fill(null) };
    else if (id === B.DROPPER || id === B.DISPENSER) be = { type: 'chest', items: new Array(9).fill(null) };
    else return null;
    this.blockEntities.set(k, be);
    return be;
  }

  private breaker: SimPlayer | null = null;

  private useCampfire(p: SimPlayer, x: number, y: number, z: number, v: number, stack: ItemStack | null): boolean {
    if (!stack) return false;
    const lit = (blockMeta(v) & CAMPFIRE_LIT) !== 0;
    const tool = stack.id === I.FLINT_AND_STEEL ? 'light' : catOf(stack.id) === 'shovel' ? 'douse' : null;
    if (tool) {
      if ((tool === 'light') === lit || !this.canBuild(p)) return false;
      if (this.authoritative) this.setBlock(x, y, z, makeBlock(blockId(v), lit ? blockMeta(v) & ~CAMPFIRE_LIT : blockMeta(v) | CAMPFIRE_LIT), p.id);
      this.emit({ e: 'sound', s: lit ? 'fire.extinguish' : 'fire.ignite', x: x + 0.5, y: y + 0.5, z: z + 0.5, src: p.id });
      if (p.mode === 'survival') { damageHeld(p.inv, 1); this.emit({ e: 'inv', p }); }
      return true;
    }
    if (!campfireResult(stack.id, this.book)) return false;
    if (!this.authoritative) return true;
    const be = this.ensureBlockEntity(x, y, z);
    if (!be || be.type !== 'campfire') return false;
    const slot = be.items.findIndex((s) => !s);
    if (slot < 0) return false;
    be.items[slot] = { id: stack.id, count: 1 }; be.cook[slot] = 0;
    if (p.mode !== 'creative') { consumeHeld(p.inv); this.emit({ e: 'inv', p }); }
    this.activeFurnaces.add(posKey(x, y, z));
    this.emit({ e: 'container', key: posKey(x, y, z) });
    this.emit({ e: 'sound', s: 'block.place', x: x + 0.5, y: y + 0.5, z: z + 0.5 });
    return true;
  }

  private tickCampfire(k: string, be: Extract<BlockEntity, { type: 'campfire' }>): void {
    const [x, y, z] = parsePosKey(k);
    const v = this.get(x, y, z);
    if (!isCampfire(blockId(v))) { this.activeFurnaces.delete(k); return; }
    const lit = (blockMeta(v) & CAMPFIRE_LIT) !== 0;
    let any = false, changed = false;
    for (let i = 0; i < be.items.length; i++) {
      const s = be.items[i];
      if (!s) continue;
      any = true;
      if (!lit) { be.cook[i] = Math.max(0, be.cook[i] - 2); continue; }
      if (++be.cook[i] < CAMPFIRE_COOK) continue;
      const out = campfireResult(s.id, this.book);
      be.items[i] = null; be.cook[i] = 0; changed = true;
      if (out) this.spawnItem(x + 0.5, y + 1, z + 0.5, { id: out, count: 1 }, 0, 1.5, 0, 0);
    }
    if (lit && any && this.tickCount % 20 === 0) this.emit({ e: 'particles', k: 'smoke', x: x + 0.5, y: y + 0.8, z: z + 0.5 });
    if (changed) this.emit({ e: 'container', key: k });
    if (!any) this.activeFurnaces.delete(k);
  }

  private useAnchor(p: SimPlayer, x: number, y: number, z: number, v: number, stack: ItemStack | null): boolean {
    const c = blockMeta(v) & 7;
    if (stack?.id === B.GLOWSTONE && c < 4) {
      if (!this.canBuild(p)) return false;
      if (this.authoritative) this.setBlock(x, y, z, makeBlock(CB.RESPAWN_ANCHOR, c + 1), p.id);
      if (p.mode === 'survival') { consumeHeld(p.inv); this.emit({ e: 'inv', p }); }
      this.emit({ e: 'sound', s: 'anchor.charge', x: x + 0.5, y: y + 0.5, z: z + 0.5, src: p.id });
      return true;
    }
    if (c === 0) return false;
    if (!isNether(x)) {
      if (!this.canBuild(p)) return false;
      if (this.authoritative) { this.setBlock(x, y, z, 0, p.id); this.explode(x + 0.5, y + 0.5, z + 0.5, 5, { fire: true }); }
      return true;
    }
    if (!this.authoritative) return true;
    const same = p.anchor && p.anchor[0] === x && p.anchor[1] === y && p.anchor[2] === z;
    p.anchor = [x, y, z];
    if (!same) this.emit({ e: 'msg', text: 'Respawn point set.', kind: 'info', to: p.id });
    this.emit({ e: 'sound', s: 'anchor.set', x: x + 0.5, y: y + 0.5, z: z + 0.5, src: p.id });
    return true;
  }

  private bindCompass(p: SimPlayer, x: number, y: number, z: number, stack: ItemStack): boolean {
    if (!this.authoritative) return true;
    const bound: ItemStack = { id: I.COMPASS, count: 1, lt: [x, y, z] };
    if (stack.count === 1) stack.lt = [x, y, z];
    else { stack.count--; if (giveItem(p.inv, bound) > 0) this.spawnItem(p.x, p.y + 1, p.z, bound); }
    this.emit({ e: 'inv', p });
    this.emit({ e: 'sound', s: 'lodestone.bind', x: x + 0.5, y: y + 0.5, z: z + 0.5, src: p.id });
    return true;
  }

  private anchorSpot(p: SimPlayer): { x: number; y: number; z: number } | null {
    const a = p.anchor;
    if (!a) return null;
    const [ax, ay, az] = a;
    if (!this.store.isLoaded(ax, az)) return { x: ax + 0.5, y: ay + 1, z: az + 0.5 };
    const v = this.get(ax, ay, az);
    const c = blockId(v) === CB.RESPAWN_ANCHOR ? blockMeta(v) & 7 : 0;
    if (!c) { p.anchor = undefined; this.emit({ e: 'msg', text: blockId(v) === CB.RESPAWN_ANCHOR ? 'Your respawn anchor was out of charges.' : 'Your respawn anchor is missing.', kind: 'info', to: p.id }); return null; }
    this.setBlock(ax, ay, az, makeBlock(CB.RESPAWN_ANCHOR, c - 1));
    for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) for (const dy of [1, 0, -1]) {
      const sx = ax + dx, sy = ay + dy, sz = az + dz;
      if ((dx || dz || dy > 0) && standable(this.store, sx, sy, sz, true)) return { x: sx + 0.5, y: sy, z: sz + 0.5 };
    }
    return { x: ax + 0.5, y: ay + 1, z: az + 0.5 };
  }

  private sealShulker(x: number, y: number, z: number): void {
    const be = this.blockEntities.get(posKey(x, y, z));
    const kept: (ItemStack | null)[] = [];
    const loose: ItemStack[] = [];
    for (const s of be?.items ?? []) {
      if (s && (s.id === CB.SHULKER_BOX || s.box)) { loose.push(s); kept.push(null); } else kept.push(s ? cloneStack(s) : null);
    }
    this.removeBlockEntity(x, y, z, false);
    if (!this.authoritative) return;
    for (const s of loose) this.spawnItem(x + 0.5, y + 0.5, z + 0.5, s);
    const full = kept.some((s) => s);
    if (!full && this.breaker?.mode === 'creative') return;
    const item: ItemStack = { id: CB.SHULKER_BOX, count: 1 };
    if (full) { while (kept.length && !kept[kept.length - 1]) kept.pop(); item.box = kept; }
    this.spawnItem(x + 0.5, y + 0.5, z + 0.5, item);
  }

  private removeBlockEntity(x: number, y: number, z: number, drop: boolean): void {
    const k = posKey(x, y, z);
    const be = this.blockEntities.get(k);
    if (!be) return;
    this.blockEntities.delete(k);
    this.activeFurnaces.delete(k);
    if (drop && (be.type === 'chest' || be.type === 'furnace' || be.type === 'campfire')) for (const s of be.items) if (s) this.spawnItem(x + 0.5, y + 0.5, z + 0.5, s);
    for (const p of this.players.values()) {
      if (p.screen.type && p.screen.x === x && p.screen.y === y && p.screen.z === z && p.screen.type !== 'workbench') this.closeScreen(p);
    }
    this.emit({ e: 'container', key: k });
  }

  addGeneratedChest(x: number, y: number, z: number, items: (ItemStack | null)[], type: 'chest' | 'spawner' | 'trial' | 'vault' | 'mob' = 'chest', mob = 'hollowed'): void {
    if (type === 'mob') {
      if (!this.authoritative || !MOBS[mob as MobType] || mob === 'riftcore' || mob === 'voidwyrm') return;
      const e = this.spawnMob(mob as MobType, x + 0.5, y, z + 0.5);
      e.persistent = true;
      return;
    }
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
      const type = (MOBS[be.mob as MobType] ? be.mob : 'hollowed') as MobType;
      if (be.type === 'spawner') {
        const want = Math.min(255, MOBS[type].code + 1);
        if (blockMeta(this.get(x, y, z)) !== want) this.setBlock(x, y, z, makeBlock(B.SPAWNER, want));
      }
      let near: SimPlayer[] = [];
      for (const p of this.players.values()) {
        if (p.dead) continue;
        if (be.type === 'trial' ? p.mode === 'survival' && Math.abs(p.x - x) < 15 && Math.abs(p.y - y) < 10 && Math.abs(p.z - z) < 15 : Math.hypot(p.x - x - 0.5, p.y - y - 0.5, p.z - z - 0.5) <= 16) near.push(p);
      }
      if (this.difficulty === 'peaceful' && MOBS[type].hostile) near = [];
      const place = (): Entity | null => {
        for (let tries = 0; tries < 8; tries++) {
          const sx = x + this.rng.int(9) - 4, sz = z + this.rng.int(9) - 4, sy = y + this.rng.int(3) - 1;
          if (standable(this.store, sx, sy, sz, MOBS[type].h > 1) && (MOBS[type].hw <= 0.5 || standable(this.store, sx + 1, sy, sz, false)) && (!MOBS[type].hostile || be.type === 'trial' || this.info.blockLight(sx, sy, sz) <= 11)) { const e = this.spawnMob(type, sx + 0.5, sy, sz + 0.5); e.persistent = be.type === 'trial'; this.emit({ e: 'particles', k: 'smoke', x: sx + 0.5, y: sy + 1, z: sz + 0.5 }); return e; }
        }
        return null;
      };
      if (be.type === 'spawner') {
        if (!near.length) continue;
        be.delay -= 10;
        if (be.delay > 0) continue;
        be.delay = 200 + this.rng.int(600);
        let count = 0;
        for (const e of this.entities.values()) if (e.kind === 'mob' && e.type === type && Math.abs(e.x - x) < 9 && Math.abs(e.y - y) < 5 && Math.abs(e.z - z) < 9) count++;
        if (count >= 6) { be.delay = 40; continue; }
        let made = 0;
        for (let i = 0; i < 4 && count + made < 6; i++) if (place()) made++;
        if (!made) be.delay = 20;
        else this.emit({ e: 'particles', k: 'smoke', x: x + 0.5, y: y + 0.5, z: z + 0.5 });
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

  private portalEmpty(v: number): boolean { const id = blockId(v); return id === 0 || id === B.FIRE || id === B.NETHER_PORTAL; }

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
    if (p.endTrip) { this.tickEndTrip(p); return; }
    if (p.travel) { this.tickTravel(p); return; }
    const bx = Math.floor(p.x), bz = Math.floor(p.z), by = Math.floor(p.y + 0.1);
    const v0 = this.get(bx, by, bz), v1 = this.get(bx, by + 1, bz);
    if (blockId(v0) === CB.END_PORTAL || blockId(this.get(bx, Math.floor(p.y), bz)) === CB.END_PORTAL) {
      if (!p.portalLock && p.riding === undefined && !p.dead) this.startEndTrip(p);
      return;
    }
    if (blockId(v0) === CB.END_GATEWAY || blockId(v1) === CB.END_GATEWAY) {
      if (!p.portalLock && p.riding === undefined && !p.dead && isEnd(p.x)) this.gatewayJump(p);
      return;
    }
    const pv = blockId(v0) === B.NETHER_PORTAL ? v0 : blockId(v1) === B.NETHER_PORTAL ? v1 : 0;
    if (!pv) { p.portalLock = false; if (p.portalT) p.portalT = Math.max(0, p.portalT - 4); return; }
    if (p.portalLock || p.riding !== undefined) return;
    p.portalT = (p.portalT ?? 0) + 1;
    if (p.portalT < (p.mode === 'creative' ? 1 : 80)) return;
    const nether = !isNether(p.x);
    const [tx, tz] = nether ? toNether(p.x, p.z) : toOverworld(p.x, p.z);
    const ty = Math.max(nether ? NETHER_LAVA + 4 : 8, Math.min(nether ? NETHER_HEIGHT - 12 : WORLD_HEIGHT - 12, Math.floor(p.y)));
    p.travel = { tx, ty, tz, t: 0, ox: p.x, oy: p.y, oz: p.z, axis: blockMeta(pv) & 1, nether, src: this.portalKeyNear(bx, blockId(v0) === B.NETHER_PORTAL ? by : by + 1, bz) };
    p.portalT = 0; p.portalLock = true;
    if (p.screen.type) this.closeScreen(p);
    this.emit({ e: 'sound', s: 'portal.travel', x: p.x, y: p.y, z: p.z, to: p.id });
    this.emit({ e: 'travel', p, phase: 'start', nether });
    this.movePlayerTo(p, tx + 0.5, ty, tz + 0.5);
  }

  private startEndTrip(p: SimPlayer): void {
    const toEnd = !isEnd(p.x);
    const dest = toEnd ? { x: END_X + END_SPAWN.x, y: END_SPAWN.y, z: END_SPAWN.z } : { x: Math.floor(p.spawn.x), y: Math.floor(p.spawn.y), z: Math.floor(p.spawn.z) };
    if (!toEnd && isEnd(dest.x)) { dest.x = Math.floor(this.spawn.x); dest.y = Math.floor(this.spawn.y); dest.z = Math.floor(this.spawn.z); }
    p.endTrip = { ...dest, t: 0, toEnd };
    p.portalLock = true;
    if (p.screen.type) this.closeScreen(p);
    this.emit({ e: 'sound', s: 'portal.travel', x: p.x, y: p.y, z: p.z, to: p.id });
    this.emit({ e: 'travel', p, phase: 'start', nether: false, end: toEnd });
    this.movePlayerTo(p, dest.x + 0.5, dest.y, dest.z + 0.5);
  }

  private tickEndTrip(p: SimPlayer): void {
    const tr = p.endTrip!;
    tr.t++;
    for (let ox = -16; ox <= 16; ox += 16) for (let oz = -16; oz <= 16; oz += 16) { this.store.ensure?.(tr.x + ox, tr.z + oz); if (!this.store.isLoaded(tr.x + ox, tr.z + oz)) { if (tr.t < 600) { p.vel = undefined; return; } } }
    if (tr.t < 3) return;
    p.endTrip = undefined;
    if (tr.gate) {
      const g = tr.gate;
      if (blockId(this.get(g.x, g.y, g.z)) !== CB.END_GATEWAY) { this.setBlock(g.x, g.y, g.z, makeBlock(CB.END_GATEWAY, 0)); this.setBlock(g.x, g.y - 1, g.z, B.BEDROCK); this.setBlock(g.x, g.y + 1, g.z, B.BEDROCK); }
      this.movePlayerTo(p, tr.x + 0.5, tr.y, tr.z + 0.5);
      this.makeSafe(p);
      this.emit({ e: 'tp', p });
      this.emit({ e: 'sound', s: 'portal.gateway', x: p.x, y: p.y, z: p.z, to: p.id });
      return;
    }
    if (tr.toEnd) {
      for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
        this.setBlock(tr.x + dx, tr.y - 1, tr.z + dz, B.OBSIDIAN);
        for (let dy = 0; dy < 3; dy++) if (this.get(tr.x + dx, tr.y + dy, tr.z + dz)) this.setBlock(tr.x + dx, tr.y + dy, tr.z + dz, 0);
      }
      this.movePlayerTo(p, tr.x + 0.5, tr.y, tr.z + 0.5);
      p.yaw = Math.PI / 2;
    } else {
      this.movePlayerTo(p, tr.x + 0.5, tr.y, tr.z + 0.5);
      this.makeSafe(p);
      this.emit({ e: 'tp', p });
    }
    p.fireT = Math.min(p.fireT, 0);
    this.emit({ e: 'travel', p, phase: 'end', nether: false, end: tr.toEnd });
    this.emit({ e: 'sound', s: 'portal.travel', x: p.x, y: p.y, z: p.z, to: p.id });
  }

  private endFrameRing(): [number, number][] {
    const out: [number, number][] = [];
    for (let d = -1; d <= 1; d++) out.push([d, -2], [d, 2], [-2, d], [2, d]);
    return out;
  }

  private tryOpenEndPortal(x: number, y: number, z: number): boolean {
    const ring = this.endFrameRing();
    for (const [ox, oz] of ring) {
      const cx = x - ox, cz = z - oz;
      if (!ring.every(([rx, rz]) => { const v = this.get(cx + rx, y, cz + rz); return blockId(v) === CB.END_PORTAL_FRAME && (blockMeta(v) & FRAME_EYE); })) continue;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) this.setBlock(cx + dx, y, cz + dz, makeBlock(CB.END_PORTAL, 0));
      this.emit({ e: 'sound', s: 'portal.end_open', x: cx + 0.5, y: y + 0.5, z: cz + 0.5 });
      this.emit({ e: 'particles', k: 'portal', x: cx + 0.5, y: y + 1, z: cz + 0.5 });
      return true;
    }
    return false;
  }

  private eggHop(x: number, y: number, z: number): void {
    for (let i = 0; i < 1000; i++) {
      const nx = x + this.rng.int(31) - 15, ny = y + this.rng.int(15) - 7, nz = z + this.rng.int(31) - 15;
      if (ny < 1 || ny >= WORLD_HEIGHT - 1 || !this.store.isLoaded(nx, nz) || this.get(nx, ny, nz) !== 0) continue;
      this.setBlock(x, y, z, 0);
      this.setBlock(nx, ny, nz, makeBlock(CB.DRAGON_EGG, 0));
      this.emit({ e: 'particles', k: 'portal', x: x + 0.5, y: y + 0.5, z: z + 0.5 });
      this.emit({ e: 'sound', s: 'pearl.land', x: nx + 0.5, y: ny + 0.5, z: nz + 0.5 });
      return;
    }
  }

  private throwEye(p: SimPlayer, yaw: number, pitch: number): boolean {
    if (this.now < (p.pearlCd ?? 0)) return false;
    const st = heldStack(p.inv);
    if (!st || st.id !== I.EYE_OF_ENDER) return false;
    if (isNether(p.x) || isEnd(p.x)) return false;
    const plan = this.gen.locate('stronghold', p.x, p.z);
    const c = plan ? portalRoomCenter(plan) : null;
    if (!c) return false;
    p.pearlCd = this.now + 600;
    if (p.mode !== 'creative' && --st.count <= 0) p.inv.slots[p.inv.selected] = null;
    const e: Entity = {
      id: this.allocId(), kind: 'arrow', type: 'eye', x: p.x - Math.sin(yaw) * 0.4, y: p.y + 1.6, z: p.z - Math.cos(yaw) * 0.4,
      vx: 0, vy: 0, vz: 0, hw: 0.12, h: 0.24, onGround: false, hitH: false, hitCeil: false, yaw, health: 1, maxHealth: 1, hurt: 0, age: 0, fire: 0, flags: 0,
      shooterP: p.id, dmg: 0, tx: c.x + 0.5, tz: c.z + 0.5,
    };
    this.entities.set(e.id, e);
    this.emit({ e: 'spawn', ent: e });
    this.emit({ e: 'inv', p });
    this.emit({ e: 'sound', s: 'eye.launch', x: p.x, y: p.y + 1.5, z: p.z });
    return true;
  }

  private tickEye(e: Entity): void {
    e.age++;
    const dx = (e.tx ?? e.x) - e.x, dz = (e.tz ?? e.z) - e.z, d = Math.hypot(dx, dz);
    const far = d > 12;
    const gx = far ? e.x + (dx / d) * 12 : e.tx!, gz = far ? e.z + (dz / d) * 12 : e.tz!;
    const gy = far ? e.y + 8 : e.y - 0.6;
    const hx = gx - e.x, hz = gz - e.z, hd = Math.hypot(hx, hz) || 1;
    const sp = Math.hypot(e.vx, e.vz) * 0.05;
    const target = Math.min(0.5, sp + (0.5 - sp) * 0.0025 * 20) * 20;
    e.vx = (hx / hd) * target; e.vz = (hz / hd) * target;
    e.vy += ((gy > e.y ? 1 : -1) * 3 - e.vy) * 0.15;
    e.x += e.vx * DT; e.y += e.vy * DT; e.z += e.vz * DT;
    e.yaw = Math.atan2(-hx, -hz);
    if (e.age % 2 === 0) this.emit({ e: 'particles', k: 'portal', x: e.x, y: e.y, z: e.z });
    if (e.age < 80) return;
    this.entities.delete(e.id);
    this.emit({ e: 'remove', id: e.id, why: 'despawn' });
    if (this.rng.next() < 0.8) this.spawnItem(e.x, e.y, e.z, { id: I.EYE_OF_ENDER, count: 1 });
    else { this.emit({ e: 'particles', k: 'smoke', x: e.x, y: e.y, z: e.z }); this.emit({ e: 'sound', s: 'glass.break', x: e.x, y: e.y, z: e.z }); }
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

  private portalKeyNear(x: number, y: number, z: number): string | undefined {
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
      const k = posKey(x + dx, y + dy, z + dz);
      if (this.blockEntities.get(k)?.type === 'portal') return k;
    }
    return undefined;
  }

  private tickTravel(p: SimPlayer): void {
    const tr = p.travel!;
    if (++tr.t > 600) { p.travel = undefined; this.movePlayerTo(p, tr.ox, tr.oy, tr.oz); this.emit({ e: 'travel', p, phase: 'end', nether: isNether(tr.ox) }); return; }
    if (!tr.dest) {
      let found = this.nearestPortal(tr.tx, tr.ty, tr.tz, tr.nether ? 16 : 128, tr.nether);
      if (!found && tr.src) {
        const sb = this.blockEntities.get(tr.src);
        const lk = sb?.type === 'portal' ? sb.link : undefined;
        const lb = lk ? this.blockEntities.get(lk) : undefined;
        if (lk && lb?.type === 'portal') { const [lx, ly, lz] = lk.split(',').map(Number); found = { x: lx, y: ly, z: lz, axis: lb.axis }; }
      }
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
    if (!d.exist && tr.src) {
      const nk = this.portalKeyNear(at.x, at.y, at.z);
      const sb = this.blockEntities.get(tr.src), nb = nk ? this.blockEntities.get(nk) : undefined;
      if (sb?.type === 'portal' && nb?.type === 'portal' && nk) { sb.link = nk; nb.link = tr.src; this.emit({ e: 'container', key: tr.src }); this.emit({ e: 'container', key: nk }); }
    }
    p.travel = undefined;
    p.portalLock = true;
    p.fireT = Math.min(p.fireT, 0);
    this.movePlayerTo(p, at.x + (at.axis === 0 ? 1 : 0.5), at.y, at.z + (at.axis === 0 ? 0.5 : 1));
    this.emit({ e: 'travel', p, phase: 'end', nether: tr.nether });
    this.emit({ e: 'sound', s: 'portal.travel', x: p.x, y: p.y, z: p.z, to: p.id });
  }

  private entityPortal(e: Entity): void {
    e.portalCd = 300;
    const nether = !isNether(e.x);
    const [tx, tz] = nether ? toNether(e.x, e.z) : toOverworld(e.x, e.z);
    const ty = Math.max(nether ? NETHER_LAVA + 4 : 8, Math.min(nether ? NETHER_HEIGHT - 12 : WORLD_HEIGHT - 12, Math.floor(e.y)));
    for (let ox = -16; ox <= 16; ox += 16) for (let oz = -16; oz <= 16; oz += 16) { this.store.ensure?.(tx + ox, tz + oz); if (!this.store.isLoaded(tx + ox, tz + oz)) return; }
    let at = this.nearestPortal(tx, ty, tz, nether ? 16 : 128, nether);
    if (at && blockId(this.get(at.x, at.y, at.z)) !== B.NETHER_PORTAL) { this.blockEntities.delete(posKey(at.x, at.y, at.z)); at = null; }
    at ??= this.makePortal(tx, ty, tz, blockMeta(this.get(Math.floor(e.x), Math.floor(e.y + 0.1), Math.floor(e.z))) & 1, nether);
    e.x = at.x + (at.axis === 0 ? 1 : 0.5); e.y = at.y; e.z = at.z + (at.axis === 0 ? 0.5 : 1);
    if (e.kind === 'mob') { e.path = null; e.goal = undefined; }
    this.emit({ e: 'remove', id: e.id, why: 'despawn' });
    this.emit({ e: 'spawn', ent: e });
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
    for (let ox = -16; ox <= 16; ox++) for (let oz = -16; oz <= 16; oz++) {
      const x = tx + ox, z = tz + oz;
      let air = 0;
      for (let y = hi + 3; y >= lo; y--) {
        const v = this.get(x, y, z);
        if (v === 0) { air++; continue; }
        const run = air;
        air = 0;
        if (run < 4 || !isSolid(v)) continue;
        const d = (ox * ox + oz * oz) * 4 + (y + 1 - ty) ** 2;
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
      p.x = cart.x; p.y = cart.y + rideOffset(cart); p.z = cart.z; p.peakY = p.y;
      return true;
    }
    if (this.validateMoves) {
      const dtMs = Math.max(50, this.now - p.lastMove);
      const dist = Math.hypot(x - p.x, z - p.z);
      const glide = !!(flags & MF.GLIDE) && this.wearsElytra(p);
      const maxH = (glide ? 80 : p.mode === 'creative' && flags & MF.FLY ? 32 : 13) * (dtMs / 1000) + 1.5;
      const maxUp = (glide ? 40 : p.mode === 'creative' ? 32 : 14) * (dtMs / 1000) + 1.6;
      if (dist > maxH || y - p.y > maxUp || y < -64 || y > WORLD_HEIGHT + 64) {
        this.emit({ e: 'tp', p });
        return false;
      }
    }
    const horiz = Math.hypot(x - p.x, z - p.z);
    const oy = p.y, mdt = Math.max(50, this.now - p.lastMove), mdx = x - p.x, mdz = z - p.z;
    this.trackVelocity(p, x, y, z);
    p.x = x; p.y = y; p.z = z; p.yaw = yaw; p.pitch = pitch;
    p.lastMove = this.now;
    const prevFlags = p.flags;
    if (flags & MF.BLOCK && !(prevFlags & MF.BLOCK)) p.blockAt = this.now;
    if (flags & MF.BLOCK && !this.holdsShield(p)) flags &= ~MF.BLOCK;
    if (flags & MF.GLIDE && !this.wearsElytra(p)) flags &= ~MF.GLIDE;
    if (flags & MF.LEVITATE && (p.levT ?? 0) < this.tickCount) flags &= ~MF.LEVITATE;
    p.flags = flags;
    if (flags & MF.GLIDE && p.mode === 'survival' && this.now - (p.glideWear ?? 0) >= 1000) {
      p.glideWear = this.now;
      const el = p.inv.armor[1];
      const ub = el?.en?.unbreaking ?? 0;
      if (el && el.id === I.ELYTRA && (ub === 0 || this.rng.int(ub + 1) === 0)) { el.dmg = Math.min(maxDurability(I.ELYTRA) - 1, (el.dmg ?? 0) + 1); this.emit({ e: 'inv', p }); }
    }
    const boots = p.inv.armor[3];
    if (boots?.en?.soul_speed && p.mode === 'survival' && flags & MF.GROUND && horiz > 0.02) {
      const ub = this.get(Math.floor(x), Math.floor(y - 0.2), Math.floor(z));
      if ((isSoulSand(ub) || ub === X(XV.SOUL_SOIL)) && this.rng.next() < 1 - Math.pow(0.96, mdt / 50)) {
        boots.dmg = (boots.dmg ?? 0) + 1;
        if (boots.dmg >= maxDurability(boots.id)) { p.inv.armor[3] = null; this.emit({ e: 'sound', s: 'item.break', x: p.x, y: p.y, z: p.z }); }
        this.emit({ e: 'inv', p });
      }
    }
    const wasGliding = (prevFlags & MF.GLIDE) !== 0, gliding = (flags & MF.GLIDE) !== 0;
    if (gliding || wasGliding) {
      const ticks = mdt / 50, h = horiz / ticks;
      if (p.glideH !== undefined && p.glideDir && p.mode === 'survival') {
        const hurt = (p.glideH - h) * 10 - 3;
        const ax = x + p.glideDir[0] * 0.45, az = z + p.glideDir[1] * 0.45;
        if (hurt > 0 && (isSolid(this.get(Math.floor(ax), Math.floor(y + 0.2), Math.floor(az))) || isSolid(this.get(Math.floor(ax), Math.floor(y + 1.4), Math.floor(az))))) this.damage(p, hurt, 'kinetic', p.x, p.z, false);
      }
      p.glideH = gliding ? h : undefined;
      if (gliding && horiz > 0.01) p.glideDir = [mdx / horiz, mdz / horiz];
    } else p.glideH = undefined;
    if (p.mode === 'survival' && this.difficulty !== 'peaceful') {
      if (flags & MF.SPRINT) p.exh += horiz * 0.1;
      else if (flags & MF.WATER) p.exh += horiz * 0.01;
      if (flags & MF.JUMP && !(prevFlags & MF.JUMP)) p.exh += flags & MF.SPRINT ? 0.2 : 0.05;
    }
    const onSlime = !(flags & MF.CROUCH) && blockId(this.get(Math.floor(x), Math.floor(y - 0.6), Math.floor(z))) === B.SLIME_BLOCK;
    const safe = flags & (MF.WATER | MF.LADDER | MF.FLY | MF.LEVITATE) || p.mode === 'creative' || onSlime;
    if (safe) p.peakY = y;
    else if (flags & MF.GROUND) {
      const under = blockId(this.get(Math.floor(x), Math.floor(y - 0.2), Math.floor(z)));
      let fall = p.peakY - y;
      if (under === B.SLIME_BLOCK && !(flags & MF.CROUCH)) fall = 0;
      if (under === B.HONEY_BLOCK) fall = 3 + (fall - 3) * 0.2;
      const uv = this.get(Math.floor(x), Math.floor(y - 0.2), Math.floor(z));
      if (under === CB.POINTED_DRIPSTONE && !(blockMeta(uv) & DRIP_DOWN) && (blockMeta(uv) & 7) <= 1 && fall > 1) this.damage(p, Math.max(1, Math.ceil((fall - 2) * 2)), 'stalagmite', p.x, p.z, false);
      else if (fall > 3.0001) this.damage(p, Math.ceil(fall - 3), 'fall', p.x, p.z, false);
      p.peakY = y;
    } else p.peakY = Math.max(p.peakY, y);
    if (flags & MF.GLIDE && (y - oy) / (mdt / 50) > -0.5) p.peakY = y + 1;
    if (p.screen.type && p.screen.y >= 0 && !this.inReach(p, p.screen.x, p.screen.y, p.screen.z, 3)) this.closeScreen(p);
    if (this.authoritative && flags & MF.GROUND && !(flags & (MF.CROUCH | MF.FLY))) {
      p.stepAcc = (p.stepAcc ?? 0) + horiz;
      if (p.stepAcc > 1.4) { p.stepAcc = 0; this.vibrate(Math.floor(x), Math.floor(y), Math.floor(z), p.id); }
      const fv = this.get(Math.floor(x), Math.floor(y - 0.1), Math.floor(z));
      if (blockId(fv) === CB.SCULK_SHRIEKER) this.shriek(Math.floor(x), Math.floor(y - 0.1), Math.floor(z), p);
      else if (blockId(fv) === CB.BIG_DRIPLEAF) this.tiltDripleaf(Math.floor(x), Math.floor(y - 0.1), Math.floor(z));
    }
    return true;
  }

  private sculkTimers: { x: number; y: number; z: number; t: number; k: 'shriek' | 'leaf'; pid?: string }[] = [];

  vibrate(x: number, y: number, z: number, pid: string | null): void {
    const hit = this.rs.vibrate(x, y, z);
    if (!pid || !hit.length) return;
    const p = this.players.get(pid);
    if (!p) return;
    for (const [sx, sy, sz] of hit) for (const [kx, ky, kz] of this.rs.sculkNear(sx, sy, sz, 8, CB.SCULK_SHRIEKER)) this.shriek(kx, ky, kz, p);
  }

  private shriek(x: number, y: number, z: number, p: SimPlayer): void {
    const v = this.get(x, y, z);
    if (blockId(v) !== CB.SCULK_SHRIEKER || blockMeta(v) & SHRIEK_ON || p.mode !== 'survival' || (p.shriekCd ?? 0) > this.tickCount) return;
    p.shriekCd = this.tickCount + 200;
    this.setBlock(x, y, z, makeBlock(CB.SCULK_SHRIEKER, blockMeta(v) | SHRIEK_ON));
    this.emit({ e: 'sound', s: 'sculk.shriek', x: x + 0.5, y: y + 0.5, z: z + 0.5 });
    this.emit({ e: 'particles', k: 'shriek', x: x + 0.5, y: y + 0.6, z: z + 0.5 });
    this.sculkTimers.push({ x, y, z, t: this.tickCount + 90, k: 'shriek', pid: p.id });
  }

  private tiltDripleaf(x: number, y: number, z: number): void {
    const v = this.get(x, y, z), m = blockMeta(v);
    if ((m >> DL_TILT_SHIFT) & 3 || this.rs.hasNeighborSignal(x, y, z)) return;
    this.setBlock(x, y, z, makeBlock(CB.BIG_DRIPLEAF, (m & 3) | (1 << DL_TILT_SHIFT)));
    this.sculkTimers.push({ x, y, z, t: this.tickCount + 10, k: 'leaf' });
  }

  private tickSculk(): void {
    if (!this.sculkTimers.length) return;
    const due = this.sculkTimers.filter((t) => t.t <= this.tickCount);
    if (!due.length) return;
    this.sculkTimers = this.sculkTimers.filter((t) => t.t > this.tickCount);
    for (const t of due) {
      const v = this.get(t.x, t.y, t.z), m = blockMeta(v);
      if (t.k === 'leaf') {
        if (blockId(v) !== CB.BIG_DRIPLEAF) continue;
        const tilt = (m >> DL_TILT_SHIFT) & 3, next = tilt === 3 ? 0 : tilt + 1;
        this.setBlock(t.x, t.y, t.z, makeBlock(CB.BIG_DRIPLEAF, (m & 3) | (next << DL_TILT_SHIFT)));
        if (next === 2) this.emit({ e: 'sound', s: 'dripleaf.tilt', x: t.x + 0.5, y: t.y + 0.5, z: t.z + 0.5 });
        if (next) this.sculkTimers.push({ ...t, t: this.tickCount + (next === 3 ? 100 : 10) });
        continue;
      }
      if (blockId(v) !== CB.SCULK_SHRIEKER) continue;
      this.setBlock(t.x, t.y, t.z, makeBlock(CB.SCULK_SHRIEKER, m & ~SHRIEK_ON));
      if (!(m & SHRIEK_SUMMON)) continue;
      const src = t.pid ? this.players.get(t.pid) : undefined;
      if (src) { src.warn = Math.min(4, (src.warn ?? 0) + 1); src.warnT = this.tickCount + 12000; }
      for (const o of this.players.values()) {
        if (o.dead || o.mode !== 'survival') continue;
        if ((o.x - t.x) ** 2 + (o.y - t.y) ** 2 + (o.z - t.z) ** 2 > 40 * 40) continue;
        this.emit({ e: 'dark', p: o, t: 240 });
      }
      if (src && (src.warn ?? 0) >= 4) this.emit({ e: 'msg', text: 'Something stirs far below...', kind: 'info', to: src.id });
    }
  }

  private catalystBloom(x: number, y: number, z: number, xp: number): void {
    if (!this.authoritative || xp <= 0) return;
    const bx = Math.floor(x), by = Math.floor(y), bz = Math.floor(z);
    let found = false;
    for (let dy = -8; dy <= 8 && !found; dy++) for (let dz = -8; dz <= 8 && !found; dz++) for (let dx = -8; dx <= 8; dx++) if (blockId(this.get(bx + dx, by + dy, bz + dz)) === CB.SCULK_CATALYST) { found = true; this.emit({ e: 'particles', k: 'shriek', x: bx + dx + 0.5, y: by + dy + 1.1, z: bz + dz + 0.5 }); break; }
    if (!found) return;
    const SK = makeBlock(CB.SCULK), host = (v: number) => v === B.STONE || v === B.DIRT || v === B.GRASS || v === B.GRAVEL || v === B.SAND || v === makeBlock(CB.DEEPSLATE) || v === B.TUFF || v === X(XV.GRANITE) || v === X(XV.DIORITE) || v === X(XV.ANDESITE);
    let charge = Math.min(24, xp * 2);
    for (let i = 0; i < 80 && charge > 0; i++) {
      const tx = bx + this.rng.int(9) - 4, tz = bz + this.rng.int(9) - 4;
      for (let ty = by + 2; ty >= by - 3; ty--) {
        const v = this.get(tx, ty, tz);
        if (!host(v) || blockId(this.get(tx, ty + 1, tz)) !== 0) continue;
        this.setBlock(tx, ty, tz, SK);
        charge--;
        const r = this.rng.next();
        if (r < 0.06) this.setBlock(tx, ty + 1, tz, makeBlock(CB.SCULK_SENSOR));
        else if (r < 0.08) this.setBlock(tx, ty + 1, tz, makeBlock(CB.SCULK_SHRIEKER));
        else if (r < 0.3) this.setBlock(tx, ty + 1, tz, makeBlock(CB.SCULK_VEIN));
        break;
      }
    }
  }

  private fixChorus(x: number, y: number, z: number): void {
    const v = this.get(x, y, z);
    if (blockId(v) !== CB.CHORUS_PLANT) return;
    const c = (dx: number, dy: number, dz: number) => { const b = blockId(this.get(x + dx, y + dy, z + dz)); return b === CB.CHORUS_PLANT || b === CB.CHORUS_FLOWER || (dy === -1 && b === CB.END_STONE); };
    const m = (c(1, 0, 0) ? 1 : 0) | (c(-1, 0, 0) ? 2 : 0) | (c(0, 1, 0) ? 4 : 0) | (c(0, -1, 0) ? 8 : 0) | (c(0, 0, 1) ? 16 : 0) | (c(0, 0, -1) ? 32 : 0);
    if (m !== blockMeta(v)) { this.store.setBlock(x, y, z, makeBlock(CB.CHORUS_PLANT, m)); this.emit({ e: 'block', x, y, z, v: makeBlock(CB.CHORUS_PLANT, m), old: v }); }
  }

  private growChorus(x: number, y: number, z: number, v: number): void {
    const age = blockMeta(v) & 7;
    if (age >= CHORUS_DEAD || this.get(x, y + 1, z) !== 0 || y >= WORLD_HEIGHT - 2) return;
    if (!this.rng.chance(0.3)) return;
    let stem = 0;
    while (stem < 6 && blockId(this.get(x, y - 1 - stem, z)) === CB.CHORUS_PLANT) stem++;
    const onStone = blockId(this.get(x, y - 1 - stem, z)) === CB.END_STONE;
    const grow = stem < (onStone ? 4 : 2) || (stem < 5 && this.rng.chance(0.25));
    const free = (ax: number, ay: number, az: number) => this.get(ax, ay, az) === 0 && this.get(ax, ay - 1, az) === 0 && FACING_DIRS.every(([dx, dz]) => this.get(ax + dx, ay, az + dz) === 0 || (ax + dx === x && az + dz === z));
    if (grow && this.get(x, y + 2, z) === 0) {
      this.setBlock(x, y, z, makeBlock(CB.CHORUS_PLANT, 0));
      this.setBlock(x, y + 1, z, makeBlock(CB.CHORUS_FLOWER, age));
      return;
    }
    if (age < 4) {
      let placed = 0;
      for (let i = 0, n = 1 + this.rng.int(age === 0 ? 4 : 3); i < n; i++) {
        const [dx, dz] = FACING_DIRS[this.rng.int(4)];
        if (!free(x + dx, y, z + dz)) continue;
        this.setBlock(x + dx, y, z + dz, makeBlock(CB.CHORUS_FLOWER, age + 1));
        placed++;
      }
      if (placed) { this.setBlock(x, y, z, makeBlock(CB.CHORUS_PLANT, 0)); return; }
    }
    this.setBlock(x, y, z, makeBlock(CB.CHORUS_FLOWER, CHORUS_DEAD));
  }

  private chorusTeleport(p: SimPlayer): void {
    for (let i = 0; i < 16; i++) {
      const x = Math.floor(p.x) + this.rng.int(17) - 8, z = Math.floor(p.z) + this.rng.int(17) - 8;
      let y = Math.min(WORLD_HEIGHT - 3, Math.floor(p.y) + this.rng.int(17) - 8);
      if (!this.store.isLoaded(x, z)) continue;
      while (y > 1 && !isSolid(this.get(x, y - 1, z))) y--;
      if (y <= 1 || this.get(x, y, z) !== 0 || this.get(x, y + 1, z) !== 0 || isFluid(this.get(x, y - 1, z))) continue;
      this.emit({ e: 'particles', k: 'portal', x: p.x, y: p.y + 1, z: p.z });
      this.teleportTo(p, x + 0.5, y, z + 0.5, false);
      this.emit({ e: 'sound', s: 'chorus.teleport', x: p.x, y: p.y, z: p.z });
      return;
    }
  }

  fixDripstone(x: number, y: number, z: number): void {
    const v = this.get(x, y, z);
    if (blockId(v) !== CB.POINTED_DRIPSTONE) return;
    const dn = blockMeta(v) & DRIP_DOWN, step = dn ? 1 : -1, same = (yy: number) => { const w = this.get(x, yy, z); return blockId(w) === CB.POINTED_DRIPSTONE && (blockMeta(w) & DRIP_DOWN) === dn; };
    let root = y;
    while (same(root + step)) root += step;
    const cells: number[] = [];
    for (let yy = root; same(yy) && cells.length < 32; yy -= step) cells.push(yy);
    const n = cells.length, tipY = cells[n - 1], beyond = this.get(x, tipY - step, z);
    const merge = blockId(beyond) === CB.POINTED_DRIPSTONE && (blockMeta(beyond) & DRIP_DOWN) !== dn;
    cells.forEach((yy, k) => {
      const t = k === n - 1 ? (merge ? 0 : 1) : k === n - 2 ? 2 : k === 0 ? 4 : 3;
      const nv = makeBlock(CB.POINTED_DRIPSTONE, dn | t);
      if (this.get(x, yy, z) !== nv) this.store.setBlock(x, yy, z, nv), this.emit({ e: 'block', x, y: yy, z, v: nv, old: this.get(x, yy, z) });
    });
  }

  private protectionPoints(p: SimPlayer, cause: string): number {
    const fire = cause === 'fire' || cause === 'lava', blast = cause === 'explosion', proj = cause === 'arrow' || this.projectileHit, fall = cause === 'fall' || cause === 'stalagmite';
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
    if (!exempt && this.shieldBlocks(p, amount, cause, fx, fz)) return;
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
      fall: 'hit the ground too hard', kinetic: 'experienced kinetic energy', stalagmite: 'was impaled on a stalagmite', lava: 'tried to swim in lava', drown: 'ran out of air', suffocate: 'suffocated in a wall', cactus: 'was pricked to death', wither: 'withered away', small_fireball: 'was fireballed by a Blaze',
      void: 'fell out of the world', breath: "was withered by the Ender Dragon's breath", starve: 'starved to death', fire: 'burned to a crisp', arrow: 'was shot by a Skeleton',
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
    p.health = 20; p.food = 20; p.sat = 5; p.exh = 0; p.air = 300; p.fireT = 0; p.witherT = 0;
    const at = this.authoritative && !this.game ? this.anchorSpot(p) : null;
    const to = at ?? p.spawn;
    p.x = to.x; p.y = to.y; p.z = to.z; p.peakY = p.y;
    p.hurtCd = 40;
    if (!this.game && !at) this.makeSafe(p);
    this.game?.onRespawn(p);
    this.emit({ e: 'respawn', p });
    this.emit({ e: 'vitals', p });
  }

  invCtx(p: SimPlayer) {
    let container: (ItemStack | null)[] | null = null;
    let kind: 'chest' | 'furnace' | 'enchant' | 'anvil' | 'smith' | null = null;
    let split: ((joined: (ItemStack | null)[]) => void) | null = null;
    if (p.screen.type === 'enchant' || p.screen.type === 'anvil' || p.screen.type === 'smith') { container = this.workSlots(p); kind = p.screen.type; }
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
      sealed: kind === 'chest' && blockId(this.get(p.screen.x, p.screen.y, p.screen.z)) === CB.SHULKER_BOX,
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
    if (ok && (ctx.containerKind === 'enchant' || ctx.containerKind === 'anvil' || ctx.containerKind === 'smith') && op.t !== 'close') this.emitWork(p);
    if (ok) {
      if (ctx.container && ctx.containerKind !== 'enchant' && ctx.containerKind !== 'anvil' && ctx.containerKind !== 'smith') {
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
    if (type === 'chest') this.angerPiglins(p, x, y, z);
    if (type === 'chest') { const pr = chestPartner(this.store, x, y, z); if (pr) this.ensureBlockEntity(pr[0], pr[1], pr[2]); this.emit({ e: 'chestLid', x, y, z, n: this.chestViewers(x, y, z) }); }
    this.emit({ e: 'screen', p });
    this.emit({ e: 'inv', p });
    if (type === 'enchant' || type === 'anvil' || type === 'smith') this.emitWork(p);
  }

  private work = new Map<string, (ItemStack | null)[]>();

  workSlots(p: SimPlayer): (ItemStack | null)[] {
    let w = this.work.get(p.id);
    if (!w) this.work.set(p.id, (w = [null, null, null]));
    return w;
  }

  setWork(p: SimPlayer, items: (ItemStack | null)[]): void { this.work.set(p.id, [items[0] ?? null, items[1] ?? null, items[2] ?? null]); }

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

  smith(p: SimPlayer): boolean {
    if (p.dead || p.screen.type !== 'smith' || p.inv.cursor) return false;
    if (blockId(this.get(p.screen.x, p.screen.y, p.screen.z)) !== B.SMITHING_TABLE) return false;
    const w = this.workSlots(p);
    const out = smithResult(w[0], w[1], w[2]);
    if (!out) return false;
    p.inv.cursor = out;
    for (const i of [0, 2]) { w[i]!.count--; if (w[i]!.count <= 0) w[i] = null; }
    w[1] = null;
    this.emit({ e: 'sound', s: 'anvil.use', x: p.screen.x + 0.5, y: p.screen.y + 1, z: p.screen.z + 0.5 });
    this.emit({ e: 'inv', p });
    this.emitWork(p);
    return true;
  }

  anvil(p: SimPlayer, name: string | null): boolean {
    if (p.screen.type === 'smith') return this.smith(p);
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
    if (isDoorBlock(v)) {
      const upper = blockMeta(v) & DOOR_UPPER;
      const oy = upper ? y - 1 : y + 1;
      if (isDoorBlock(this.get(x, oy, z))) { this.store.setBlock(x, oy, z, 0); this.emit({ e: 'block', x, y: oy, z, v: 0, old: this.get(x, oy, z) }); }
    }
    const be = this.getBlockEntity(x, y, z);
    let replacement = 0;
    this.breaker = p;
    if (id === B.ICE && p?.mode === 'survival' && isSolid(this.get(x, y - 1, z))) replacement = B.WATER;
    this.setBlock(x, y, z, replacement, p?.id);
    this.breaker = null;
    if (this.authoritative && p) this.vibrate(x, y, z, p.id);
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
    if (this.useMain(p, x, y, z, nx, ny, nz, forcePlace, hy)) return true;
    const off = p.inv.off?.[0];
    if (!off || p.dead) return false;
    const main = heldStack(p.inv);
    if (main && getItem(main.id)?.places !== undefined) return false;
    return this.withOff(p, () => this.useMain(p, x, y, z, nx, ny, nz, true, hy));
  }

  private withOff<T>(p: SimPlayer, fn: () => T): T {
    const sel = p.inv.selected;
    const a = p.inv.slots[sel] ?? null, b = p.inv.off[0] ?? null;
    p.inv.slots[sel] = b; p.inv.off[0] = a;
    try { return fn(); }
    finally {
      const na = p.inv.slots[sel] ?? null, nb = p.inv.off[0] ?? null;
      p.inv.slots[sel] = nb; p.inv.off[0] = na && na.count > 0 ? na : null;
      this.emit({ e: 'inv', p });
    }
  }

  wearsElytra(p: SimPlayer): boolean {
    const el = p.inv.armor[1];
    return !!el && el.id === I.ELYTRA && (el.dmg ?? 0) < maxDurability(I.ELYTRA) - 1;
  }

  holdsShield(p: SimPlayer): boolean {
    return heldStack(p.inv)?.id === I.SHIELD || p.inv.off?.[0]?.id === I.SHIELD;
  }

  private useMain(p: SimPlayer, x: number, y: number, z: number, nx: number, ny: number, nz: number, forcePlace = false, hy = 0.5): boolean {
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
      if (id === B.SMITHING_TABLE) { this.openScreen(p, 'smith', x, y, z); return true; }
      if (id === B.BARREL) { this.openScreen(p, 'chest', x, y, z); return true; }
      if (id === CB.SHULKER_BOX) { if (isFullCube(this.get(x, y + 1, z))) return true; this.openScreen(p, 'chest', x, y, z); return true; }
      if (isCampfire(id)) { if (this.useCampfire(p, x, y, z, v, stack)) return true; }
      if (id === CB.RESPAWN_ANCHOR) { if (this.useAnchor(p, x, y, z, v, stack)) return true; }
      if (id === CB.LODESTONE && stack?.id === I.COMPASS) return this.bindCompass(p, x, y, z, stack);
      if (id === B.BLAST_FURNACE || id === B.SMOKER) { this.openScreen(p, 'furnace', x, y, z); return true; }
      if (id === B.BELL) { this.emit({ e: 'sound', s: 'bell.ring', x: x + 0.5, y: y + 0.5, z: z + 0.5 }); return true; }
      if (id === CB.END_PORTAL_FRAME) {
        if (stack?.id !== I.EYE_OF_ENDER || (blockMeta(v) & FRAME_EYE)) return true;
        this.setBlock(x, y, z, makeBlock(CB.END_PORTAL_FRAME, blockMeta(v) | FRAME_EYE), p.id);
        if (p.mode !== 'creative') { consumeHeld(p.inv); this.emit({ e: 'inv', p }); }
        this.emit({ e: 'sound', s: 'portal.eye', x: x + 0.5, y: y + 1, z: z + 0.5 });
        this.tryOpenEndPortal(x, y, z);
        return true;
      }
      if (id === CB.DRAGON_EGG) { this.eggHop(x, y, z); return true; }
      if (id === CB.CAVE_VINES_LIT) {
        this.setBlock(x, y, z, makeBlock(CB.CAVE_VINES, blockMeta(v)), p.id);
        this.spawnItem(x + 0.5, y + 0.3, z + 0.5, { id: I.GLOW_BERRIES, count: 1 });
        this.emit({ e: 'sound', s: 'place.grass', x: x + 0.5, y: y + 0.5, z: z + 0.5, src: p.id });
        return true;
      }
      if (id === B.CAKE) {
        if (p.food >= 20 && p.mode === 'survival' && this.difficulty !== 'peaceful') return false;
        p.food = Math.min(20, p.food + 2); p.sat = Math.min(p.food, p.sat + 0.4);
        const bites = (blockMeta(v) & 7) + 1;
        this.setBlock(x, y, z, bites >= 7 ? 0 : makeBlock(B.CAKE, bites), p.id);
        this.emit({ e: 'sound', s: 'player.eat', x: x + 0.5, y: y + 0.5, z: z + 0.5 });
        this.emit({ e: 'vitals', p });
        return true;
      }
      if (id === B.COMPOSTER) return this.useComposter(p, x, y, z, v);
      if (JOB_SITES[id] !== undefined) return false;
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
      if ((blockId(fv) !== 0 && !getBlock(fv).replaceable) || blockId(fv) === B.WATER || blockId(fv) === B.LAVA || blockId(fv) === B.FIRE || !this.store.isLoaded(fx, fz)) return false;
      if (this.game && !this.game.canPlace(p, fx, fy, fz)) return false;
      if (this.authoritative && !this.lightPortal(fx, fy, fz)) {
        if (!isSolid(this.get(fx, fy - 1, fz)) && !isSolid(v)) return false;
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
      if (isTrapdoor(v)) {
        if (!this.canBuild(p)) return false;
        const m = blockMeta(v);
        this.setBlock(x, y, z, makeBlock(B.OAK_DOOR, m ^ TD_OPEN), p.id);
        this.emit({ e: 'sound', s: m & TD_OPEN ? 'door.close' : 'door.open', x: x + 0.5, y: y + 0.5, z: z + 0.5, src: p.id });
        return true;
      }
      if (id === B.OAK_DOOR) {
        if (!this.canBuild(p)) return false;
        const m = blockMeta(v);
        const by = m & DOOR_UPPER ? y - 1 : y;
        for (const yy of [by, by + 1]) {
          const dv = this.get(x, yy, z);
          if (isDoorBlock(dv)) this.setBlock(x, yy, z, makeBlock(B.OAK_DOOR, blockMeta(dv) ^ DOOR_OPEN), p.id);
        }
        this.emit({ e: 'sound', s: m & DOOR_OPEN ? 'door.close' : 'door.open', x: x + 0.5, y: y + 0.5, z: z + 0.5, src: p.id });
        return true;
      }
    }
    if (!this.canBuild(p)) { this.emit({ e: 'reject', p, x: x + nx, y: y + ny, z: z + nz }); return false; }
    if (item?.tool?.type === 'hoe' && (id === B.GRASS || id === B.DIRT || id === B.SNOWY_GRASS) && blockId(this.get(x, y + 1, z)) === 0 && tix(v) !== SB.PODZOL) {
      this.setBlock(x, y, z, tix(v) === SB.COARSE_DIRT ? B.DIRT : B.FARMLAND, p.id);
      this.emit({ e: 'sound', s: 'place.dirt', x: x + 0.5, y: y + 1, z: z + 0.5, src: p.id });
      if (p.mode === 'survival') { damageHeld(p.inv); this.emit({ e: 'inv', p }); }
      return true;
    }
    if (stack?.id === I.BONE_MEAL) return this.boneMeal(p, x, y, z);
    if (stack?.id === I.END_CRYSTAL && this.placeCrystal(p, x, y, z, ny)) return true;
    if (stack?.id === I.FIREWORK_ROCKET) return this.useFirework(p, [x + nx + 0.5, y + ny, z + nz + 0.5]);
    if (stack?.id === I.GLASS_BOTTLE && this.clouds.length && this.bottleBreath(p)) return true;
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
    if (CROPS[id] && (blockMeta(v) & 7) < CROPS[id].max) {
      const mx = CROPS[id].max;
      this.setBlock(x, y, z, makeBlock(id, Math.min(mx, (blockMeta(v) & 7) + (mx === 3 ? (this.rng.chance(0.75) ? 1 : 0) : 2 + this.rng.int(4)))), src);
      used = true;
    } else if (id === B.OAK_SAPLING || id === B.BIRCH_SAPLING || id === B.SPRUCE_SAPLING || id === B.JUNGLE_SAPLING) {
      if (this.rng.chance(0.45)) this.growTree(x, y, z, id, speciesOf(v));
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
    if (!used) used = this.netherBoneMeal(x, y, z, v, id, src);
    if (!used) used = this.caveBoneMeal(x, y, z, v, id, src);
    if (!used) return false;
    this.emit({ e: 'particles', k: 'heart', x: x + 0.5, y: y + 1, z: z + 0.5 });
    this.emit({ e: 'sound', s: 'place.grass', x: x + 0.5, y: y + 0.5, z: z + 0.5, src });
    return true;
  }

  private netherBoneMeal(x: number, y: number, z: number, v: number, id: number, src?: string): boolean {
    const set = (a: number, b: number, c: number, nv: number) => this.setBlock(a, b, c, nv, src);
    const get = (a: number, b: number, c: number) => this.get(a, b, c);
    if (id === B.CRIMSON_FUNGUS || id === B.WARPED_FUNGUS) {
      const crimson = id === B.CRIMSON_FUNGUS;
      if (this.get(x, y - 1, z) !== (crimson ? CNYL : WNYL)) return false;
      if (this.rng.chance(0.4)) hugeFungus(get, set, this.rng, x, y, z, crimson, true, WORLD_HEIGHT - 1);
      return true;
    }
    if ((v === CNYL || v === WNYL) && blockId(this.get(x, y + 1, z)) === 0) {
      const crimson = v === CNYL;
      const pick = () => { const r = this.rng.int(100); return crimson ? (r < 87 ? B.CRIMSON_ROOTS : r < 98 ? B.CRIMSON_FUNGUS : B.WARPED_FUNGUS) : (r < 85 ? B.WARPED_ROOTS : r < 98 ? B.WARPED_FUNGUS : B.CRIMSON_FUNGUS); };
      const scatter = (choose: () => number) => {
        for (let i = 0; i < 9; i++) {
          const tx = x + this.rng.int(3) - this.rng.int(3), tz = z + this.rng.int(3) - this.rng.int(3);
          const below = this.get(tx, y, tz);
          if (blockId(this.get(tx, y + 1, tz)) === 0 && (below === CNYL || below === WNYL || below === X(XV.SOUL_SOIL))) set(tx, y + 1, tz, choose());
        }
      };
      scatter(pick);
      if (!crimson) {
        scatter(() => B.NETHER_SPROUTS);
        if (this.rng.int(8) === 0) { const len = 1 + this.rng.int(4); for (let k = 1; k <= len && blockId(this.get(x, y + k, z)) === 0; k++) set(x, y + k, z, B.TWISTING_VINES); }
      }
      return true;
    }
    if (v === X(XV.NETHERRACK) && blockId(this.get(x, y + 1, z)) === 0) {
      const found: number[] = [];
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) { const n = this.get(x + dx, y + dy, z + dz); if ((n === CNYL || n === WNYL) && !found.includes(n)) found.push(n); }
      if (!found.length) return false;
      set(x, y, z, found[this.rng.int(found.length)]);
      return true;
    }
    if (id === B.WEEPING_VINES || id === B.TWISTING_VINES) {
      const dir = id === B.WEEPING_VINES ? -1 : 1;
      let ty = y;
      while (blockId(this.get(x, ty + dir, z)) === id) ty += dir;
      let n = 1;
      while (this.rng.next() < 0.826) n++;
      let grew = false;
      for (let i = 0; i < n && blockId(this.get(x, ty + dir, z)) === 0 && ty + dir > 0 && ty + dir < WORLD_HEIGHT - 1; i++) { ty += dir; set(x, ty, z, id); grew = true; }
      return grew;
    }
    return false;
  }

  private caveBoneMeal(x: number, y: number, z: number, v: number, id: number, src?: string): boolean {
    if (id === CB.CAVE_VINES) { this.setBlock(x, y, z, makeBlock(CB.CAVE_VINES_LIT, blockMeta(v)), src); return true; }
    if (id === CB.MOSS_BLOCK && blockId(this.get(x, y + 1, z)) === 0) {
      const MOSS = makeBlock(CB.MOSS_BLOCK), ok = (w: number) => w === B.STONE || w === B.DIRT || w === B.GRASS || w === B.GRAVEL || w === B.TUFF || w === makeBlock(CB.DEEPSLATE) || w === X(XV.GRANITE) || w === X(XV.DIORITE) || w === X(XV.ANDESITE);
      for (let i = 0; i < 40; i++) {
        const tx = x + this.rng.int(7) - 3, tz = z + this.rng.int(7) - 3;
        for (let ty = y + 1; ty >= y - 1; ty--) {
          const w = this.get(tx, ty, tz);
          if ((!ok(w) && w !== MOSS) || blockId(this.get(tx, ty + 1, tz)) !== 0) continue;
          this.setBlock(tx, ty, tz, MOSS, src);
          const r = this.rng.next();
          if (r < 0.25) this.setBlock(tx, ty + 1, tz, makeBlock(CB.MOSS_CARPET), src);
          else if (r < 0.5) this.setBlock(tx, ty + 1, tz, B.TALL_GRASS, src);
          else if (r < 0.54) this.setBlock(tx, ty + 1, tz, makeBlock(CB.AZALEA), src);
          else if (r < 0.56) this.setBlock(tx, ty + 1, tz, makeBlock(CB.FLOWERING_AZALEA), src);
          break;
        }
      }
      return true;
    }
    if (id === CB.AZALEA || id === CB.FLOWERING_AZALEA) { if (this.rng.chance(0.45)) this.growAzalea(x, y, z); return true; }
    if (id === CB.BIG_DRIPLEAF) {
      let top = y;
      while (blockId(this.get(x, top + 1, z)) === CB.BIG_DRIPLEAF) top++;
      if (blockId(this.get(x, top + 1, z)) !== 0) return false;
      const m = blockMeta(this.get(x, top, z)) & 3;
      this.setBlock(x, top, z, makeBlock(CB.BIG_DRIPLEAF_STEM, m), src);
      this.setBlock(x, top + 1, z, makeBlock(CB.BIG_DRIPLEAF, m), src);
      return true;
    }
    if (id === CB.SMALL_DRIPLEAF) {
      const by = blockMeta(v) & SMALL_UPPER ? y - 1 : y;
      let h = 2 + this.rng.int(4);
      while (h > 2 && blockId(this.get(x, by + h - 1, z)) !== 0) h--;
      const f = this.rng.int(4);
      for (let k = 0; k < h - 1; k++) this.store.setBlock(x, by + k, z, makeBlock(CB.BIG_DRIPLEAF_STEM, f));
      for (let k = 0; k < h - 1; k++) this.emit({ e: 'block', x, y: by + k, z, v: makeBlock(CB.BIG_DRIPLEAF_STEM, f), old: 0 });
      this.setBlock(x, by + h - 1, z, makeBlock(CB.BIG_DRIPLEAF, f), src);
      return true;
    }
    return false;
  }

  private growAzalea(x: number, y: number, z: number): void {
    const h = 4 + this.rng.int(2);
    for (let k = 1; k <= h + 1; k++) if (k > 0 && !isReplaceable(this.get(x, y + k, z)) && blockId(this.get(x, y + k, z)) !== CB.AZALEA_LEAVES) return;
    const below = blockId(this.get(x, y - 1, z));
    if (below === B.DIRT || below === B.GRASS || below === CB.MOSS_BLOCK) this.setBlock(x, y - 1, z, makeBlock(CB.ROOTED_DIRT));
    for (let k = 0; k < h; k++) this.setBlock(x, y + k, z, B.OAK_LOG);
    for (let dy = -1; dy <= 1; dy++) for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      if (Math.abs(dx) + Math.abs(dz) + Math.abs(dy) > 3 || (dy === 1 && Math.abs(dx) + Math.abs(dz) > 1)) continue;
      const tx = x + dx, ty = y + h - 1 + dy, tz = z + dz;
      if (!isReplaceable(this.get(tx, ty, tz))) continue;
      this.setBlock(tx, ty, tz, makeBlock(this.rng.chance(0.25) ? CB.FLOWERING_AZALEA_LEAVES : CB.AZALEA_LEAVES));
    }
  }

  private boneMeal(p: SimPlayer, x: number, y: number, z: number): boolean {
    if (!this.applyBoneMeal(x, y, z, p.id)) return false;
    if (p.mode === 'survival') { consumeHeld(p.inv); this.emit({ e: 'inv', p }); }
    return true;
  }

  private useBucket(p: SimPlayer, x: number, y: number, z: number, nx: number, ny: number, nz: number, stack: ItemStack): boolean {
    const v = this.get(x, y, z);
    if (blockId(v) === B.CAULDRON && !(p.flags & MF.CROUCH)) return this.bucketCauldron(p, x, y, z, v, stack);
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

  private bucketCauldron(p: SimPlayer, x: number, y: number, z: number, v: number, stack: ItemStack): boolean {
    const cm = blockMeta(v), lava = !!(cm & CAULDRON_LAVA), lvl = cm & 3;
    let give: number | null = null, nv = v, snd = '';
    if (stack.id === I.BUCKET) {
      if (lava) { give = I.LAVA_BUCKET; nv = B.CAULDRON; snd = 'bucket.fill_lava'; }
      else if (lvl === 3) { give = I.WATER_BUCKET; nv = B.CAULDRON; snd = 'bucket.fill'; }
      else return true;
    } else if (stack.id === I.WATER_BUCKET) { if (lava || lvl === 3) return true; give = I.BUCKET; nv = makeBlock(B.CAULDRON, 3); snd = 'bucket.empty'; }
    else if (stack.id === I.LAVA_BUCKET) { if (lava || lvl > 0) return true; give = I.BUCKET; nv = makeBlock(B.CAULDRON, CAULDRON_LAVA | 3); snd = 'bucket.empty_lava'; }
    else return false;
    this.setBlock(x, y, z, nv, p.id);
    this.emit({ e: 'sound', s: snd, x: x + 0.5, y: y + 0.8, z: z + 0.5 });
    if (p.mode === 'survival' && give !== null) {
      const out = { id: give, count: 1 };
      if (stack.count <= 1) p.inv.slots[p.inv.selected] = out;
      else { consumeHeld(p.inv); if (giveItem(p.inv, out) > 0) this.invCtx(p).drop(out); }
      this.emit({ e: 'inv', p });
    }
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
    if (bid === B.TORCH || bid === B.REDSTONE_TORCH || bid === CB.SOUL_TORCH) {
      if (ny === 1) meta = 0;
      else if (ny === -1) return fail();
      else {
        const f = FACING_DIRS.findIndex(([dx, dz]) => dx === -nx && dz === -nz);
        meta = f + 1;
      }
    }
    if (bid === B.LADDER || bid === CB.GLOW_LICHEN) {
      if (ny !== 0) return fail();
      meta = FACING_DIRS.findIndex(([dx, dz]) => dx === -nx && dz === -nz);
    }
    if (bid === CB.POINTED_DRIPSTONE) meta = (ny === -1 ? DRIP_DOWN : ny === 1 ? 0 : isSolid(this.get(tx, ty + 1, tz)) && !isSolid(this.get(tx, ty - 1, tz)) ? DRIP_DOWN : 0) | 1;
    if (bid === CB.BIG_DRIPLEAF) meta = (look + 2) & 3;
    if (isLantern(bid)) {
      const hang = ny === -1 ? isSolid(this.get(tx, ty + 1, tz)) : !isSolid(this.get(tx, ty - 1, tz)) && isSolid(this.get(tx, ty + 1, tz));
      if (!hang && !isSolid(this.get(tx, ty - 1, tz))) return fail();
      meta = hang ? LANTERN_HANGING : 0;
    }
    if (isCampfire(bid)) meta = (look & 3) | (blockId(this.get(tx, ty, tz)) === B.WATER ? 0 : CAMPFIRE_LIT);
    if (bid === CB.SMALL_DRIPLEAF && !isReplaceable(this.get(tx, ty + 1, tz))) return fail();
    if (def.render === 'leaves') meta = 1;
    if (item.placeMeta && bid !== B.EXT && bid !== B.SLAB && bid !== B.STAIRS) meta = (meta & 15) | item.placeMeta;
    const td = bid === B.OAK_DOOR && (item.placeMeta ?? 0) >= TD_SPECIES_MIN << 4;
    if (td) {
      const hinge = ny === 0 ? FACING_DIRS.findIndex(([dx, dz]) => dx === -nx && dz === -nz) : look;
      meta = trapdoorMeta((item.placeMeta ?? 0) >> 4, hinge, ny === -1 || (ny === 0 && hy > 0.5), false);
    }
    if (bid === B.ANVIL) meta = look === 1 || look === 3 ? 0 : 1;
    if (isRail(bid)) meta = shapeFor((a, b, c) => this.get(a, b, c), tx, ty, tz, bid, look === 1 || look === 3 ? 1 : 0);
    let v = combine >= 0 ? makeBlock(combine, 0) : makeBlock(bid, meta);
    if (bid === B.OAK_DOOR && !td) {
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
      if (!(bid === B.OAK_DOOR && !td)) return fail();
    }
    if (blockId(target) !== 0 && !getBlock(target).fluid) this.spawnDrops(tx, ty, tz, target, null, true);
    this.setBlock(tx, ty, tz, v, p.id);
    if (isRail(bid)) {
      const g = (a: number, b: number, c: number) => this.get(a, b, c);
      for (const [nx, ny, nz] of neighborRails(g, tx, ty, tz)) { const nv = reshapeNeighbor(g, nx, ny, nz, tx, ty, tz); if (nv !== null) this.setBlock(nx, ny, nz, nv, p.id); }
    }
    if (bid === B.OAK_DOOR && !td) this.setBlock(tx, ty + 1, tz, makeBlock(B.OAK_DOOR, doorMeta(look, true, false)), p.id);
    if (bid === CB.SMALL_DRIPLEAF) this.setBlock(tx, ty + 1, tz, makeBlock(CB.SMALL_DRIPLEAF, SMALL_UPPER), p.id);
    if (bid === CB.SHULKER_BOX && stack.box && this.authoritative) {
      const be = this.ensureBlockEntity(tx, ty, tz);
      if (be) for (let i = 0; i < be.items.length; i++) be.items[i] = cloneStack(stack.box[i] ?? null);
    }
    if (this.authoritative) this.vibrate(tx, ty, tz, p.id);
    this.emit({ e: 'sound', s: `place.${def.sound}`, x: tx + 0.5, y: ty + 0.5, z: tz + 0.5, src: p.id });
    if (p.mode === 'survival') { consumeHeld(p.inv); this.emit({ e: 'inv', p }); }
    return true;
  }

  eat(p: SimPlayer): boolean {
    if (p.dead) return false;
    const mainFood = getItem(heldStack(p.inv)?.id ?? -1)?.food;
    const offFood = getItem(p.inv.off?.[0]?.id ?? -1)?.food;
    if (!mainFood && offFood) return this.withOff(p, () => this.eatMain(p));
    return this.eatMain(p);
  }

  private eatMain(p: SimPlayer): boolean {
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
    if (eatenId === I.CHORUS_FRUIT) this.chorusTeleport(p);
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
    if (e?.kind === 'fireball') {
      if (e.flags & 1) return false;
      if (Math.hypot(e.x - p.x, e.y - p.y - 1.6, e.z - p.z) > 6) return false;
      const cp = Math.cos(p.pitch), sp = Math.hypot(e.vx, e.vy, e.vz) * 1.1 + 2;
      e.vx = -Math.sin(p.yaw) * cp * sp; e.vy = Math.sin(p.pitch) * sp; e.vz = -Math.cos(p.yaw) * cp * sp;
      e.shooterP = p.id; e.shooter = undefined;
      this.emit({ e: 'sound', s: 'arrow.hit', x: e.x, y: e.y, z: e.z });
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

  private shieldBlocks(p: SimPlayer, amount: number, cause: string, fx: number, fz: number): boolean {
    if (!(p.flags & MF.BLOCK) || !this.holdsShield(p)) return false;
    if (this.now - (p.blockAt ?? this.now) < 250 || this.now < (p.shieldCd ?? 0)) return false;
    const blockable = cause === 'player' || cause === 'arrow' || cause === 'explosion' || cause === 'fireball' || !!MOBS[cause as MobType];
    if (!blockable) return false;
    const dx = fx - p.x, dz = fz - p.z, d = Math.hypot(dx, dz);
    if (d > 0.01) {
      const lx = -Math.sin(p.yaw), lz = -Math.cos(p.yaw);
      if ((dx * lx + dz * lz) / d < 0) return false;
    }
    const inMain = heldStack(p.inv)?.id === I.SHIELD;
    if (p.mode === 'survival' && amount >= 3) {
      const st = inMain ? p.inv.slots[p.inv.selected]! : p.inv.off[0]!;
      st.dmg = (st.dmg ?? 0) + 1 + Math.floor(amount);
      if (st.dmg >= 336) { if (inMain) p.inv.slots[p.inv.selected] = null; else p.inv.off[0] = null; this.emit({ e: 'sound', s: 'item.break', x: p.x, y: p.y + 1, z: p.z }); }
      this.emit({ e: 'inv', p });
    }
    if (this.hitBy?.mob && d > 0.01) { const m = this.hitBy.mob; m.vx = (m.vx ?? 0) - (dx / d) * 4; m.vz = (m.vz ?? 0) - (dz / d) * 4; }
    this.emit({ e: 'sound', s: 'shield.block', x: p.x, y: p.y + 1, z: p.z });
    return true;
  }

  private tickEnderman(e: Entity, inWater: boolean): void {
    const wet = inWater || ((this.weather === 'rain' || this.weather === 'thunder') && !isNether(e.x) && e.age % 10 === 0 && this.skyExposed(e.x, e.y + e.h, e.z));
    if (wet && e.age % 10 === 0) { this.hurtMob(e, 1, null, 0, 0); return; }
    if (e.age % 5 === 0 && !(e.provoked! > 0 && e.target) && this.difficulty !== 'peaceful') {
      const ex = e.x, ey = e.y + 2.55, ez = e.z;
      for (const p of this.players.values()) {
        if (p.dead || p.mode !== 'survival') continue;
        const vx = ex - p.x, vy = ey - (p.y + 1.62), vz = ez - p.z, d = Math.hypot(vx, vy, vz);
        if (d > 64 || d < 0.5) continue;
        const cp = Math.cos(p.pitch);
        const lx = -Math.sin(p.yaw) * cp, ly = Math.sin(p.pitch), lz = -Math.cos(p.yaw) * cp;
        if ((vx * lx + vy * ly + vz * lz) / d > 1 - 0.025 / d && this.lineOfSight(e, p)) {
          e.target = p.id; e.provoked = 600; e.path = null;
          e.yaw = Math.atan2(vx, vz);
          this.emit({ e: 'sound', s: 'enderman.scream', x: e.x, y: e.y + 2.5, z: e.z });
          break;
        }
      }
    }
    const t = e.target ? this.players.get(e.target) : undefined;
    if (t && e.provoked! > 0) {
      const d = Math.hypot(t.x - e.x, t.y - e.y, t.z - e.z);
      if (d < 32) e.provoked = Math.max(e.provoked!, 200);
      if (d > 16 && e.age % 30 === 0 && this.rng.chance(0.5)) this.endermanTeleportNear(e, t.x, t.y, t.z);
    } else if (e.age % 400 === 0 && this.rng.chance(0.1)) this.endermanTeleport(e);
  }

  private endermanTeleport(e: Entity): boolean {
    return this.endermanTeleportNear(e, e.x + (this.rng.next() - 0.5) * 64, e.y + this.rng.int(64) - 32, e.z + (this.rng.next() - 0.5) * 64);
  }

  private endermanTeleportNear(e: Entity, tx: number, ty: number, tz: number): boolean {
    for (let attempt = 0; attempt < 16; attempt++) {
      const x = Math.floor(attempt ? tx + (this.rng.next() - 0.5) * 16 : tx), z = Math.floor(attempt ? tz + (this.rng.next() - 0.5) * 16 : tz);
      let y = Math.min(WORLD_HEIGHT - 4, Math.max(2, Math.floor(ty)));
      while (y > 1 && !isSolid(this.get(x, y - 1, z))) y--;
      if (y <= 1 || isNether(x) !== isNether(e.x)) continue;
      let clear = true;
      for (let dy = 0; dy < 3; dy++) { const v = this.get(x, y + dy, z); if (isSolid(v) || getBlock(v).fluid) { clear = false; break; } }
      if (!clear || getBlock(this.get(x, y - 1, z)).fluid) continue;
      this.emit({ e: 'particles', k: 'smoke', x: e.x, y: e.y + 1.5, z: e.z });
      this.emit({ e: 'sound', s: 'enderman.teleport', x: e.x, y: e.y + 1.5, z: e.z });
      e.x = x + 0.5; e.y = y; e.z = z + 0.5; e.vx = e.vy = e.vz = 0; e.path = null;
      this.emit({ e: 'sound', s: 'enderman.teleport', x: e.x, y: e.y + 1.5, z: e.z });
      return true;
    }
    return false;
  }

  private tickPearl(e: Entity): void {
    e.age++;
    const owner = e.shooterP ? this.players.get(e.shooterP) : undefined;
    if (!owner || owner.dead || e.age > 400 || e.y < -16) { this.entities.delete(e.id); this.emit({ e: 'remove', id: e.id, why: 'despawn' }); return; }
    e.vy -= 20 * DT;
    const sp = Math.hypot(e.vx, e.vy, e.vz) || 1e-6;
    const step = sp * DT;
    const dx = e.vx / sp, dy = e.vy / sp, dz = e.vz / sp;
    e.vx *= 0.99; e.vy *= 0.99; e.vz *= 0.99;
    const wall = raycast(this.store, e.x, e.y, e.z, dx, dy, dz, step);
    let hit: [number, number, number] | null = wall && isSolid(wall.value) ? [e.x + dx * wall.dist, e.y + dy * wall.dist, e.z + dz * wall.dist] : null;
    const reach = hit ? wall!.dist : step;
    let mobHit = false;
    outer: for (const m of this.entities.values()) {
      if (m.kind !== 'mob' || m.health <= 0) continue;
      for (let k = 0; k <= 4; k++) {
        const t = (reach * k) / 4, px = e.x + dx * t, py = e.y + dy * t, pz = e.z + dz * t;
        if (Math.abs(px - m.x) < m.hw + 0.15 && py > m.y - 0.1 && py < m.y + m.h + 0.1 && Math.abs(pz - m.z) < m.hw + 0.15) {
          this.hurtMob(m, 0.01, owner.id, dx * 0.3, dz * 0.3, 0.2);
          hit = [px, py, pz]; mobHit = true;
          break outer;
        }
      }
    }
    if (!hit) { e.x += dx * step; e.y += dy * step; e.z += dz * step; e.yaw = Math.atan2(-dx, -dz); return; }
    this.entities.delete(e.id);
    this.emit({ e: 'remove', id: e.id, why: 'hit' });
    this.emit({ e: 'particles', k: 'smoke', x: hit[0], y: hit[1], z: hit[2] });
    let tx = hit[0] - dx * 0.3, ty = hit[1] - dy * 0.3, tz = hit[2] - dz * 0.3;
    if (!mobHit && wall && isSolid(wall.value) && wall.ny === 1) ty = wall.y + 1;
    else ty = Math.floor(ty);
    for (let n = 0; n < 3 && (this.solidAt(tx, ty, tz) || this.solidAt(tx, ty + 1, tz)); n++) ty++;
    if (owner.travel || (isNether(owner.x) !== isNether(tx))) return;
    owner.x = tx; owner.y = ty; owner.z = tz; owner.peakY = ty;
    this.emit({ e: 'tp', p: owner });
    this.emit({ e: 'sound', s: 'pearl.land', x: owner.x, y: owner.y + 1, z: owner.z });
    if (owner.mode === 'survival') this.damage(owner, 5, 'fall', owner.x, owner.z, false, true);
  }

  private throwXpBottle(p: SimPlayer, yaw: number, pitch: number): boolean {
    if (this.now < (p.pearlCd ?? 0) - 750) return false;
    const st = heldStack(p.inv);
    if (!st || st.id !== I.EXPERIENCE_BOTTLE) return false;
    p.pearlCd = this.now + 250;
    if (p.mode !== 'creative' && --st.count <= 0) p.inv.slots[p.inv.selected] = null;
    const pt = pitch + 20 * Math.PI / 180, cy = Math.cos(pt), sp = 14;
    const e: Entity = {
      id: this.allocId(), kind: 'arrow', type: 'xpbottle', x: p.x - Math.sin(yaw) * 0.3, y: p.y + 1.5, z: p.z - Math.cos(yaw) * 0.3,
      vx: -Math.sin(yaw) * cy * sp + (p.vel?.x ?? 0), vy: Math.sin(pt) * sp, vz: -Math.cos(yaw) * cy * sp + (p.vel?.z ?? 0),
      hw: 0.12, h: 0.24, onGround: false, hitH: false, hitCeil: false, yaw, health: 1, maxHealth: 1, hurt: 0, age: 0, fire: 0, flags: 0,
      shooterP: p.id, dmg: 0,
    };
    this.entities.set(e.id, e);
    this.emit({ e: 'spawn', ent: e });
    this.emit({ e: 'inv', p });
    this.emit({ e: 'sound', s: 'pearl.throw', x: p.x, y: p.y + 1.5, z: p.z });
    return true;
  }

  private tickXpBottle(e: Entity): void {
    e.age++;
    if (e.age > 600 || e.y < -16) { this.entities.delete(e.id); this.emit({ e: 'remove', id: e.id, why: 'despawn' }); return; }
    e.vy -= 28 * DT;
    e.vx *= 0.99; e.vy *= 0.99; e.vz *= 0.99;
    const sp = Math.hypot(e.vx, e.vy, e.vz) || 1e-6, step = sp * DT;
    const dx = e.vx / sp, dy = e.vy / sp, dz = e.vz / sp;
    const wall = raycast(this.store, e.x, e.y, e.z, dx, dy, dz, step);
    let hit: [number, number, number] | null = wall && isSolid(wall.value) ? [e.x + dx * wall.dist, e.y + dy * wall.dist, e.z + dz * wall.dist] : null;
    if (!hit) for (const m of this.entities.values()) {
      if (m.kind !== 'mob' || m.health <= 0) continue;
      if (Math.abs(e.x - m.x) < m.hw + 0.15 && e.y > m.y - 0.1 && e.y < m.y + m.h + 0.1 && Math.abs(e.z - m.z) < m.hw + 0.15) { hit = [e.x, e.y, e.z]; break; }
    }
    if (!hit) for (const o of this.players.values()) {
      if (o.id === e.shooterP && e.age < 5 || o.dead) continue;
      if (Math.abs(e.x - o.x) < 0.45 && e.y > o.y - 0.1 && e.y < o.y + 1.9 && Math.abs(e.z - o.z) < 0.45) { hit = [e.x, e.y, e.z]; break; }
    }
    if (!hit) { e.x += dx * step; e.y += dy * step; e.z += dz * step; return; }
    this.entities.delete(e.id);
    this.emit({ e: 'remove', id: e.id, why: 'hit' });
    this.emit({ e: 'sound', s: 'block.break.glass', x: hit[0], y: hit[1], z: hit[2] });
    this.emit({ e: 'particles', k: 'xp', x: hit[0], y: hit[1], z: hit[2] });
    const amount = 3 + this.rng.int(5) + this.rng.int(5);
    let best: SimPlayer | null = null, bd = 8;
    for (const o of this.players.values()) {
      if (o.dead || dimOf(o.x) !== dimOf(hit[0])) continue;
      const d = Math.hypot(o.x - hit[0], o.y + 0.9 - hit[1], o.z - hit[2]);
      if (d < bd) { bd = d; best = o; }
    }
    if (best) { this.giveXp(best, amount); this.emit({ e: 'sound', s: 'xp.orb', x: best.x, y: best.y + 1, z: best.z }); }
  }

  private solidAt(x: number, y: number, z: number): boolean { return isSolid(this.get(Math.floor(x), Math.floor(y), Math.floor(z))); }

  private throwPearl(p: SimPlayer, yaw: number, pitch: number): boolean {
    if (this.now < (p.pearlCd ?? 0)) return false;
    const st = heldStack(p.inv);
    if (!st || st.id !== I.ENDER_PEARL) return false;
    p.pearlCd = this.now + 1000;
    if (p.mode !== 'creative' && --st.count <= 0) p.inv.slots[p.inv.selected] = null;
    const cy = Math.cos(pitch), sp = 30;
    const e: Entity = {
      id: this.allocId(), kind: 'arrow', type: 'pearl', x: p.x - Math.sin(yaw) * 0.3, y: p.y + 1.5, z: p.z - Math.cos(yaw) * 0.3,
      vx: -Math.sin(yaw) * cy * sp, vy: Math.sin(pitch) * sp, vz: -Math.cos(yaw) * cy * sp,
      hw: 0.12, h: 0.24, onGround: false, hitH: false, hitCeil: false, yaw, health: 1, maxHealth: 1, hurt: 0, age: 0, fire: 0, flags: 0,
      shooterP: p.id, dmg: 0,
    };
    this.entities.set(e.id, e);
    this.emit({ e: 'spawn', ent: e });
    this.emit({ e: 'inv', p });
    this.emit({ e: 'sound', s: 'pearl.throw', x: p.x, y: p.y + 1.5, z: p.z });
    return true;
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
    if (getItem(heldStack(p.inv)?.id ?? -1)?.tool?.type === 'axe' && t.flags & MF.BLOCK && this.holdsShield(t)) {
      t.shieldCd = this.now + 5000;
      this.emit({ e: 'sound', s: 'shield.break', x: t.x, y: t.y + 1, z: t.z });
    }
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
    if (e.type === 'riftcore') { this.burstCrystal(e); return; }
    if (e.type === 'voidwyrm') { this.hurtDragon(e, dmg, by); return; }
    if (e.type === 'shellward') {
      if ((e.peek ?? 0) < 0.3) dmg = Math.max(0, dmg - 8);
      if (e.health - dmg < e.maxHealth / 2 && e.health - dmg > 0 && this.rng.chance(0.25)) this.shulkerTeleport(e);
    }
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
    if (by) {
      e.attacker = by; e.provoked = 400;
      if (def.neutral) {
        e.target = by; e.provoked = 400 + this.rng.int(400);
        for (const o of this.entities.values()) if (o.type === e.type && o !== e && Math.abs(o.x - e.x) < 20 && Math.abs(o.z - e.z) < 20 && Math.abs(o.y - e.y) < 10) { o.target = by; o.provoked = 400 + this.rng.int(400); }
      } else if (!def.hostile) e.panic = 80; else e.target = by;
      if (e.type === 'flarewisp' && this.players.has(by)) for (const o of this.entities.values()) if (o.type === 'flarewisp' && o !== e && !o.target && Math.hypot(o.x - e.x, o.y - e.y, o.z - e.z) < 24) o.target = by;
    }
    this.emit({ e: 'sound', s: `mob.${e.type}.hurt`, x: e.x, y: e.y + 0.5, z: e.z });
    if (e.type === 'voidstalker' && !by && e.health > 0 && this.rng.chance(0.9)) this.endermanTeleport(e);
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
      if (e.rider) { const r = this.players.get(e.rider); if (r) this.dismount(r); }
      if (e.saddled) this.spawnItem(e.x, e.y + 0.5, e.z, { id: I.SADDLE, count: 1 });
      if (killer && killer.mode === 'survival') this.giveXp(killer, def.xp);
      const wpn = e.type === 'piglin' ? (e.wield === 1 ? I.CROSSBOW : toolId(3, 3)) : e.type === 'piglin_brute' ? toolId(3, 1) : e.type === 'cinderhusk' ? toolId(3, 3) : 0;
      if (wpn && killer && this.rng.chance(0.085)) this.spawnItem(e.x, e.y + 0.5, e.z, { id: wpn, count: 1, dmg: Math.floor(this.rng.next() * maxDurability(wpn) * 0.8) });
      if (e.type === 'emberslime' && (e.size ?? 1) > 1) {
        const n = 2 + this.rng.int(3), half = (e.size ?? 2) / 2;
        for (let i = 0; i < n; i++) { const c = this.spawnMob('emberslime', e.x + (this.rng.next() - 0.5) * half * 0.5, e.y + 0.5, e.z + (this.rng.next() - 0.5) * half * 0.5, half); c.target = e.target; c.persistent = e.persistent; }
      }
      this.game?.onMobDeath(e, by);
      this.catalystBloom(e.x, e.y, e.z, def.xp);
    }
  }

  private sizeCube(e: Entity, n: number): void {
    e.size = n; e.hw = 0.26 * n; e.h = 0.52 * n; e.health = e.maxHealth = n * n;
  }

  spawnMob(type: MobType, x: number, y: number, z: number, size?: number): Entity {
    const def = MOBS[type];
    const e: Entity = {
      id: this.allocId(), kind: 'mob', type, x, y, z, vx: 0, vy: 0, vz: 0, hw: def.hw, h: def.h,
      onGround: false, hitH: false, hitCeil: false, yaw: this.rng.next() * Math.PI * 2,
      health: def.health, maxHealth: def.health, hurt: 0, age: 0, fire: 0, flags: 0,
      target: null, path: null, pathT: 0, wanderT: this.rng.int(100), panic: 0, attackCd: 0, provoked: 0,
    };
    if (type === 'emberslime') this.sizeCube(e, size ?? [1, 2, 4][this.rng.int(3)]);
    if (type === 'piglin') { e.wield = this.rng.chance(0.5) ? 1 : 0; if (e.wield) e.flags = 32; }
    if (type === 'piglin_brute') { e.wield = 2; e.persistent = true; }
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
    this.tickSculk();
    if (this.tickCount % 200 === 0) for (const p of this.players.values()) if (p.warn && (p.warnT ?? 0) <= this.tickCount) { p.warn--; p.warnT = this.tickCount + 12000; }
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
    if (this.tickCount % 20 === 7 || this.endState.summon !== undefined) this.tickEndFight();
    if (this.clouds.length) this.tickClouds();
    if (this.fireworkShows.length) this.fireworkShows = this.fireworkShows.filter((f) => { if (f.t > this.tickCount) return true; this.emit({ e: 'particles', k: 'firework', x: f.x, y: f.y, z: f.z }); this.emit({ e: 'sound', s: 'firework.blast', x: f.x, y: f.y, z: f.z, vol: 3 }); return false; });
    this.runBlasts();
    this.tickPlates();
    this.rs.tickMoving();
    this.tickHoppers();
    this.tickFurnaces();
    this.mischief.tick();
    this.tickBlueprints();
    this.tickFire();
    if (this.game) this.game.tick();
    else {
      this.naturalSpawn();
      if (this.tickCount % 20 === 0) for (const p of this.players.values()) if (!p.dead) this.populateVillages(p);
    }
  }

  setWeather(w: Weather, duration?: number): void {
    this.weather = w;
    this.weatherTimer = duration ?? (w === 'clear' ? 6000 + this.rng.int(12000) : 2400 + this.rng.int(6000));
    this.emit({ e: 'weather', w, d: this.settings.weatherCycle ? this.weatherTimer : undefined });
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
      const camp = this.get(fbx, Math.floor(p.y - 0.05), fbz);
      if (isCampfire(blockId(camp)) && (blockMeta(camp) & CAMPFIRE_LIT) && p.y - Math.floor(p.y - 0.05) < 0.5 && this.tickCount % 10 === 0) this.damage(p, blockId(camp) === CB.SOUL_CAMPFIRE ? 2 : 1, 'fire', p.x, p.z, false);
    }
    if (p.mode === 'survival') {
      const med = sampleMedium(this.store, p.x, p.y, p.z, f & MF.LAVA ? 0.3 : 0.15, f & MF.CROUCH ? 1.5 : 1.8, 1.62);
      if (med.lava) { p.fireT = 300; if (--p.t.lava <= 0) { p.t.lava = 10; this.damage(p, 4, 'lava', p.x, p.z, false); } }
      if (med.water || (f & MF.WATER && !med.lava)) p.fireT = 0;
      if ((p.fireT > 0) !== !!p.wasFire) { p.wasFire = p.fireT > 0; changed = true; }
      if (p.fireT > 0) { p.fireT--; if (--p.t.fire <= 0) { p.t.fire = 20; if (!med.lava) this.damage(p, 1, 'fire', p.x, p.z, false); } }
      if (p.absorbT && --p.absorbT <= 0) { p.absorb = 0; changed = true; }
      if (p.witherT && p.witherT > 0) { if (p.witherT-- % 40 === 0) this.damage(p, 1, 'wither', p.x, p.z, false, true); }
      if (p.regenT && p.regenT > 0) { if (p.regenT-- % 25 === 0 && p.health < 20) { p.health = Math.min(20, p.health + 1); changed = true; } }
      if (f & MF.EYE_WATER && bubbleColumn(this.store, p.x, p.y + 1.62, p.z)) { if (p.air < 300) { p.air = 300; changed = true; } }
      else if (f & MF.EYE_WATER) {
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

  private moveEntities(cells: { x: number; y: number; z: number; sticky: boolean; slime?: boolean }[], dir: number, from: number, to: number): void {
    const [dx, dy, dz] = DIR6[dir];
    const axis = dx ? 0 : dy ? 1 : 2, sgn = dx + dy + dz;
    const shift = new Map<Entity | SimPlayer, number>();
    const launch = new Set<Entity | SimPlayer>();
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
        if (need > 0) { shift.set(o, Math.max(shift.get(o) ?? 0, Math.min(1.01, need))); if (c.slime && hits && to >= 1) launch.add(o); }
      }
    }
    for (const [o, n] of shift) {
      o.x += dx * n; o.y += dy * n; o.z += dz * n;
      if ('inv' in o) { (o as SimPlayer).peakY = o.y; this.emit({ e: 'tp', p: o as SimPlayer }); }
    }
    for (const o of launch) {
      if ('inv' in o) this.emit({ e: 'knock', p: o as SimPlayer, x: dx, y: dy > 0 ? 1 : dy < 0 ? -1 : 0.01, z: dz, set: dy !== 0 });
      else { const e = o as Entity; if (dx) e.vx = dx * 20; if (dy) e.vy = dy * 20; if (dz) e.vz = dz * 20; }
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
    const med = sampleMedium(this.store, e.x, e.y, e.z, e.hw, e.h, 0.5);
    if (med.water || med.lava) { this.pushByFluid(e, 0.3); e.vx *= 0.9; e.vz *= 0.9; e.vy *= 0.9; }
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
    const strider = e.type === 'lavastrider' && !!e.saddled;
    if ((!strider && (e.kind !== 'cart' || e.type !== 'cart')) || e.rider || p.riding !== undefined || p.dead) return false;
    e.rider = p.id;
    p.riding = e.id;
    p.x = e.x; p.y = e.y + rideOffset(e); p.z = e.z; p.peakY = p.y;
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
    {
      const fx = Math.floor(e.x), fy = Math.floor(e.y), fz = Math.floor(e.z);
      if (!isRail(blockId(this.get(fx, fy, fz))) && !isRail(blockId(this.get(fx, fy - 1, fz)))) {
        const fl = blockId(this.get(fx, Math.floor(e.y + 0.2), fz));
        if (fl === B.WATER || fl === B.LAVA) this.pushByFluid(e, 0.3);
      }
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
    while (this.blasts.length && n < 24) {
      const b = this.blasts.shift()!;
      const lb = this.lastBlast;
      n += lb && lb.broke === 0 && lb.power === b.power && Math.abs(lb.x - b.x) < 0.01 && Math.abs(lb.y - b.y) < 0.01 && Math.abs(lb.z - b.z) < 0.01 ? 0.05 : 1;
      this.explode(b.x, b.y, b.z, b.power);
    }
    this.exposureCache.clear();
    this.lastBlast = null;
  }

  private exposureCache = new Map<string, number>();
  private blastSeen = new Int32Array(0);
  private blastStamp = 0;
  private lastBlast: { x: number; y: number; z: number; power: number; broke: number } | null = null;

  private resAt(v: number): number {
    const id = blockId(v);
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
      const span = Math.ceil(power * 1.85) + 2, G = span * 2 + 1, G3 = G * G * G;
      if (this.blastSeen.length < G3) this.blastSeen = new Int32Array(G3);
      const seen = this.blastSeen;
      const st = ++this.blastStamp;
      const ox = Math.floor(x) - span, oy = Math.floor(y) - span, oz = Math.floor(z) - span;
      const raw = this.store.raw ? (cx: number, cz: number) => this.store.raw!(cx, cz) : null;
      let ccx = 0x7fffffff, ccz = 0x7fffffff, arr: BlockArray | null = null, loaded = false;
      const R = RAYS;
      for (let r = 0; r < R.length; r += 3) {
        const rx = R[r] * 0.3, ry = R[r + 1] * 0.3, rz = R[r + 2] * 0.3;
        let f = power * (0.7 + this.rng.next() * 0.6);
        let px = x, py = y, pz = z;
        while (f > 0) {
          const bx = Math.floor(px), by = Math.floor(py), bz = Math.floor(pz);
          if (by < 0 || by >= WORLD_HEIGHT) break;
          const kx = bx >> 4, kz = bz >> 4;
          if (kx !== ccx || kz !== ccz) { ccx = kx; ccz = kz; loaded = this.store.isLoaded(bx, bz); arr = loaded && raw ? raw(kx, kz) : null; }
          if (!loaded) break;
          const v = arr ? arr[(by * 16 + (bz & 15)) * 16 + (bx & 15)] : this.get(bx, by, bz);
          if (v) {
            f -= (this.resAt(v) + 0.3) * 0.3;
            if (f > 0) {
              const gx = bx - ox, gy = by - oy, gz = bz - oz;
              if (gx >= 0 && gy >= 0 && gz >= 0 && gx < G && gy < G && gz < G) {
                const gi = (gx * G + gy) * G + gz;
                if (seen[gi] !== st && !FLUID_ID[blockId(v)]) { seen[gi] = st; hit.push(bx, by, bz); }
              }
            }
          }
          px += rx; py += ry; pz += rz;
          f -= 0.22500001;
        }
      }
    }
    const r = power * 2;
    const rayMemo = new Map<number, boolean>();
    const exposure = (id: string | number, bx: number, by: number, bz: number, hw: number, h: number): number => {
      const ck = `${id}|${x.toFixed(2)},${y.toFixed(2)},${z.toFixed(2)}`;
      const c = this.exposureCache.get(ck);
      if (c !== undefined) return c;
      let seen = 0, n = 0;
      const few = typeof id === 'number' && this.entities.get(id)?.kind === 'tnt';
      for (const sy of few ? EXP_Y_FEW : EXP_Y) for (const sx of few ? EXP_X_FEW : EXP_X) {
        const tx = bx + sx * hw, ty = by + sy * h, tz = bz;
        const ddx = tx - x, ddy = ty - y, ddz = tz - z, len = Math.hypot(ddx, ddy, ddz);
        n++;
        if (len < 0.01) { seen++; continue; }
        const qk = (Math.floor(tx * 4) + 4194304) * 8388608 + (Math.floor(ty * 4) + 1024) * 8192 + (Math.floor(tz * 4) & 8191);
        let open = rayMemo.get(qk);
        if (open === undefined) { const rh = raycast(this.store, x, y, z, ddx / len, ddy / len, ddz / len, len); open = !rh || !isSolid(rh.value); rayMemo.set(qk, open); }
        if (open) seen++;
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
        if (oid === B.CHEST || oid === B.BARREL || oid === B.FURNACE || oid === B.FURNACE_LIT || oid === B.BLAST_FURNACE || oid === B.SMOKER || oid === B.HOPPER || oid === B.DROPPER || oid === B.DISPENSER) this.removeBlockEntity(x, y, z, true);
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
    if (id !== B.CHEST && id !== B.BARREL && id !== B.HOPPER && id !== B.DROPPER && id !== B.DISPENSER && id !== B.FURNACE && id !== B.FURNACE_LIT && id !== B.BLAST_FURNACE && id !== B.SMOKER && id !== CB.SHULKER_BOX) return null;
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
    if (id === CB.SHULKER_BOX && (s.id === CB.SHULKER_BOX || s.box)) return false;
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
    if ((id === B.FURNACE || id === B.FURNACE_LIT || id === B.BLAST_FURNACE || id === B.SMOKER) && !this.activeFurnaces.has(k)) this.activeFurnaces.add(k);
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
          if (e.y >= y + 1.01 && isFullCube(this.get(x, y + 1, z))) continue;
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
      if (be?.type === 'campfire') { this.tickCampfire(k, be); continue; }
      if (!be || be.type !== 'furnace') { this.activeFurnaces.delete(k); continue; }
      const [x, y, z] = parsePosKey(k);
      const input = be.items[0], fuel = be.items[1], out = be.items[2];
      const fid = blockId(this.get(x, y, z));
      let smelt = input ? findSmelt(input.id, this.book) : null;
      if (smelt && fid === B.BLAST_FURNACE && !BLAST_OUT.has(smelt.result)) smelt = null;
      if (smelt && fid === B.SMOKER && !getItem(smelt.result)?.food) smelt = null;
      const cookTime = fid === B.BLAST_FURNACE || fid === B.SMOKER ? 100 : 200;
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
          if (be.cook >= cookTime) {
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
    if (r1 < 15 && this.info.skyAbove(x, y, z, r1) !== false) return false;
    if (this.info.blockLight(x, y, z) > 0) return false;
    const need = this.rng.int(8) + this.skyDarken() + 1;
    if (need > 15) return true;
    return this.info.skyAbove(x, y, z, need - 1) === false;
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

  private dripInto(x: number, y: number, z: number, v: number): void {
    const m = blockMeta(v);
    if (!(m & DRIP_DOWN) || (m & 7) > 1) return;
    let root = y;
    while (root < WORLD_HEIGHT - 3 && blockId(this.get(x, root + 1, z)) === CB.POINTED_DRIPSTONE && blockMeta(this.get(x, root + 1, z)) & DRIP_DOWN) root++;
    if (!isSolid(this.get(x, root + 1, z))) return;
    const src = this.get(x, root + 2, z), sid = blockId(src);
    const water = (sid === B.WATER && blockMeta(src) === 0) || (isWaterPlant(sid) && sid !== B.WATER);
    const lava = sid === B.LAVA && blockMeta(src) === 0;
    if (!water && !lava) return;
    if (water && isNether(x)) return;
    for (let yy = y - 1; yy >= Math.max(0, y - 11); yy--) {
      const b = this.get(x, yy, z), id = blockId(b);
      if (id === 0) continue;
      if (id !== B.CAULDRON) return;
      const cm = blockMeta(b);
      if (lava) { if (cm === 0 && this.rng.int(256) < 15) { this.setBlock(x, yy, z, makeBlock(B.CAULDRON, CAULDRON_LAVA | 3)); this.emit({ e: 'sound', s: 'drip.lava', x: x + 0.5, y: yy + 1, z: z + 0.5 }); } }
      else if (!(cm & CAULDRON_LAVA) && (cm & 3) < 3 && this.rng.int(256) < 45) { this.setBlock(x, yy, z, makeBlock(B.CAULDRON, (cm & 3) + 1)); this.emit({ e: 'sound', s: 'drip.water', x: x + 0.5, y: yy + 1, z: z + 0.5 }); }
      return;
    }
  }

  private randomTick(x: number, y: number, z: number, v: number, id: number): void {
    switch (id) {
      case CB.POINTED_DRIPSTONE: this.dripInto(x, y, z, v); break;
      case CB.CHORUS_FLOWER: this.growChorus(x, y, z, v); break;
      case B.CAULDRON: {
        const cm = blockMeta(v);
        if (this.weather !== 'clear' && !(cm & CAULDRON_LAVA) && (cm & 3) < 3 && !isNether(x) && this.info.exposed(x, y + 1, z) && this.rng.int(20) === 0) this.setBlock(x, y, z, makeBlock(B.CAULDRON, (cm & 3) + 1));
        break;
      }
      case B.NETHER_PORTAL: {
        if (isNether(x) || this.game || this.settings.mobSpawning === false || this.difficulty === 'peaceful') break;
        const lvl = this.difficulty === 'easy' ? 1 : this.difficulty === 'normal' ? 2 : 3;
        if (this.rng.int(2000) >= lvl) break;
        let fy = y;
        while (fy > 1 && blockId(this.get(x, fy - 1, z)) === B.NETHER_PORTAL) fy--;
        if (!isSolid(this.get(x, fy - 1, z))) break;
        const e = this.spawnMob('cinderhusk', x + 0.5, fy, z + 0.5);
        e.portalCd = 300;
        break;
      }
      case CB.CAVE_VINES: case CB.CAVE_VINES_LIT: {
        if (blockId(this.get(x, y - 1, z)) === 0 && this.rng.chance(0.1)) {
          let len = 0;
          for (let k = 1; k <= 25; k++) { const a = blockId(this.get(x, y + k, z)); if (a !== CB.CAVE_VINES && a !== CB.CAVE_VINES_LIT) break; len++; }
          if (len < 24) this.setBlock(x, y - 1, z, makeBlock(this.rng.chance(0.11) ? CB.CAVE_VINES_LIT : CB.CAVE_VINES));
        }
        break;
      }
      case B.FIRE: {
        if (!this.fireQueue.has(posKey(x, y, z))) this.scheduleFire(x, y, z, 1 + this.rng.int(20));
        break;
      }
      case B.LAVA: {
        if (this.settings.fireTick === false || this.game) break;
        const n = this.rng.int(3);
        if (n > 0) {
          let px = x, py = y, pz = z;
          for (let k = 0; k < n; k++) {
            px += this.rng.int(3) - 1; py++; pz += this.rng.int(3) - 1;
            if (py >= WORLD_HEIGHT) break;
            const t = this.get(px, py, pz);
            if (blockId(t) === 0) {
              let near = false;
              for (const [dx, dy, dz] of SIX) if (this.flam(this.get(px + dx, py + dy, pz + dz))[0] > 0) { near = true; break; }
              if (near) { this.setBlock(px, py, pz, B.FIRE); break; }
            } else if (isSolid(t)) break;
          }
        } else {
          for (let k = 0; k < 3; k++) {
            const px = x + this.rng.int(3) - 1, pz = z + this.rng.int(3) - 1;
            if (blockId(this.get(px, y + 1, pz)) === 0 && this.flam(this.get(px, y, pz))[0] > 0) this.setBlock(px, y + 1, pz, B.FIRE);
          }
        }
        break;
      }
      case B.WHEAT: case B.CARROTS: case B.POTATOES: case B.BEETROOTS: {
        const st = blockMeta(v) & 7;
        if (st >= CROPS[id].max || !this.brightAtLeast(x, y + 1, z, 9)) break;
        const f = this.cropSpeed(x, y, z, id);
        if (this.rng.int(Math.floor(25 / f) + 1) === 0) this.setBlock(x, y, z, makeBlock(id, st + 1));
        break;
      }
      case B.NETHER_WART: {
        const st = blockMeta(v) & 3;
        if (st < 3 && this.rng.int(10) === 0) this.setBlock(x, y, z, makeBlock(B.NETHER_WART, st + 1));
        break;
      }
      case B.OAK_SAPLING: case B.BIRCH_SAPLING: case B.SPRUCE_SAPLING: case B.JUNGLE_SAPLING:
        if (this.rng.int(7) !== 0 || this.rng.int(2) !== 0 || !this.brightAtLeast(x, y + 1, z, 9)) break;
        this.growTree(x, y, z, id, speciesOf(v));
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
          if (this.get(tx, ty, tz) !== B.DIRT) continue;
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

  growTree(x: number, y: number, z: number, sapling: number, spc = 0): boolean {
    if (spc) return this.growSpeciesTree(x, y, z, spc);
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
      for (let i = 0; i < ps.length; i++) {
        if (mobDist2(e.x - ps[i].x, e.y - ps[i].y, e.z - ps[i].z) > SPAWN_RANGE * SPAWN_RANGE) continue;
        if (def.hostile || def.neutral) mon[i]++; else cre[i]++;
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
    if (isNether(cx * 16)) return this.spawnNether(hostile, cx, cz);
    if (isEnd(cx * 16)) return this.spawnEnd(hostile, cx, cz);
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
        let nearest = Infinity, reach = Infinity;
        for (const p of this.players.values()) {
          nearest = Math.min(nearest, (p.x - x - 0.5) ** 2 + (p.y - y) ** 2 + (p.z - z - 0.5) ** 2);
          reach = Math.min(reach, mobDist2(p.x - x - 0.5, p.y - y, p.z - z - 0.5));
        }
        if (nearest <= 576 || reach > SPAWN_RANGE * SPAWN_RANGE) continue;
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
    if ((!def.hostile && !def.neutral && !def.nether) || e.persistent || def.npc || def.trader) return false;
    let d = Infinity;
    for (const p of this.players.values()) d = Math.min(d, mobDist2(p.x - e.x, p.y - e.y, p.z - e.z));
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
    if (e.portalCd) e.portalCd--;
    else if (e.kind !== 'fireball' && e.age % 4 === 0 && blockId(this.get(Math.floor(e.x), Math.floor(e.y + 0.1), Math.floor(e.z))) === B.NETHER_PORTAL && !e.rider && !this.game) { this.entityPortal(e); return; }
    if (e.kind === 'item') return this.tickItem(e);
    if (e.kind === 'arrow' && e.type === 'pearl') return this.tickPearl(e);
    if (e.kind === 'arrow' && e.type === 'xpbottle') return this.tickXpBottle(e);
    if (e.kind === 'arrow' && e.type === 'eye') return this.tickEye(e);
    if (e.kind === 'arrow' && e.type === 'bullet') return this.tickBullet(e);
    if (e.kind === 'arrow') return this.tickArrow(e);
    if (e.kind === 'tnt') return this.tickTnt(e);
    if (e.kind === 'cart') return this.tickCart(e);
    if (e.kind === 'fireball' && e.type === 'dfire') return this.tickDragonFire(e);
    if (e.kind === 'fireball') return this.tickFireball(e);
    this.tickMob(e);
  }

  private pushByFluid(e: Entity, k: number): void {
    const bc = e.kind === 'arrow' ? 0 : bubbleColumn(this.store, e.x, e.y + 0.1, e.z);
    if (bc) {
      const top = bubbleSurface(this.store, e.x, e.y + 0.1, e.z);
      e.vy = bc > 0 ? Math.min(top ? 20 : 14, e.vy + (top ? 2 : 1.2)) : Math.max(top ? -12 : -6, e.vy - 0.6);
    }
    const f = fluidFlow(this.store, e.x, e.y, e.z);
    if (!f) return;
    const m = f.lava ? (isNether(e.x) ? 0.5 : 0.17) : 1;
    e.vx += f.x * k * m; e.vz += f.z * k * m;
  }

  private tickItem(e: Entity): void {
    if (e.age > 6000) { this.entities.delete(e.id); this.emit({ e: 'remove', id: e.id, why: 'despawn' }); return; }
    const med = sampleMedium(this.store, e.x, e.y, e.z, e.hw, e.h, 0.1);
    if (med.water) { e.vy = Math.min(e.vy + 22 * DT, 1.5); e.vx *= 0.9; e.vz *= 0.9; }
    else e.vy -= 18 * DT;
    const fp = !!e.item && fireproof(e.item.id);
    if (med.water || (med.lava && fp)) this.pushByFluid(e, 0.3);
    if (med.lava && fp) { e.vy = Math.min(e.vy + 40 * DT, 1.5); e.vx *= 0.9; e.vz *= 0.9; }
    else if (med.lava) { this.entities.delete(e.id); this.emit({ e: 'remove', id: e.id, why: 'despawn' }); this.emit({ e: 'particles', k: 'smoke', x: e.x, y: e.y, z: e.z }); return; }
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
      if (e.sb && e.stuck % 4 === 0) {
        const sv = this.get(e.sb[0], e.sb[1], e.sb[2]);
        if (!isSolid(sv) && blockId(sv) !== B.OAK_BUTTON) { e.stuck = undefined; e.sb = undefined; e.vx = e.vz = 0; e.vy = -1; e.crit = false; e.flags &= ~4; return; }
      }
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
      if (e.stuck > 1200) { this.entities.delete(e.id); this.emit({ e: 'remove', id: e.id, why: 'despawn' }); }
      return;
    }
    const here = blockId(this.get(Math.floor(e.x), Math.floor(e.y), Math.floor(e.z)));
    const wet = here === B.WATER || isWaterPlant(here);
    if (wet) { this.pushByFluid(e, 0.2); e.fire = 0; if (e.age % 4 === 0) this.emit({ e: 'particles', k: 'splash', x: e.x, y: e.y, z: e.z }); }
    else if (here === B.LAVA || here === B.FIRE) e.fire = 1;
    e.vy -= 20 * DT;
    const sp = Math.hypot(e.vx, e.vy, e.vz) || 1e-6;
    const step = sp * DT;
    const dx = e.vx / sp, dy = e.vy / sp, dz = e.vz / sp;
    const drag = wet ? 0.6 : 0.99;
    e.vx *= drag; e.vy *= drag; e.vz *= drag;
    const wall = raycast(this.store, e.x, e.y, e.z, dx, dy, dz, step);
    if (wall && blockId(wall.value) === B.OAK_BUTTON && !(blockMeta(wall.value) & LEVER_ON) && this.authoritative) this.rs.use(wall.x, wall.y, wall.z, wall.value);
    const reach = wall && isSolid(wall.value) ? wall.dist : step;
    if (e.shooterP) {
      for (const m of this.entities.values()) {
        if (m.kind !== 'mob' || m.health <= 0) continue;
        for (let s = 0; s <= 6; s++) {
          const t = (s / 6) * reach;
          const ax = e.x + dx * t, ay = e.y + dy * t, az = e.z + dz * t;
          if (Math.abs(ax - m.x) < m.hw + 0.15 && Math.abs(az - m.z) < m.hw + 0.15 && ay > m.y && ay < m.y + m.h) {
            if (e.pierced?.includes(m.id)) continue;
            if (m.type === 'voidstalker') { if (!m.dodgeT || this.tickCount - m.dodgeT > 4) { m.dodgeT = this.tickCount; this.endermanTeleport(m); } break; }
            if (m.type === 'shellward' && (m.peek ?? 0) < 0.3) { e.vx *= -0.1; e.vy = Math.abs(e.vy) * 0.1; e.vz *= -0.1; e.shooterP = undefined; this.emit({ e: 'sound', s: 'shulker.bounce', x: e.x, y: e.y, z: e.z }); return; }
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
    if (hit && (isSolid(hit.value) || blockId(hit.value) === B.OAK_BUTTON)) {
      e.x = hit.hx - dx * 0.1; e.y = hit.hy - dy * 0.1; e.z = hit.hz - dz * 0.1;
      e.vx = e.vy = e.vz = 0;
      e.stuck = 0; e.sb = [hit.x, hit.y, hit.z];
      if (e.fire > 0 && blockId(hit.value) === B.TNT && this.authoritative) { this.primeTnt(hit.x, hit.y, hit.z, 80); }
      this.emit({ e: 'sound', s: 'arrow.hit', x: e.x, y: e.y, z: e.z });
      return;
    }
    e.x += e.vx * DT; e.y += e.vy * DT; e.z += e.vz * DT;
    e.yaw = Math.atan2(-e.vx, -e.vz);
  }

  private tickMob(e: Entity): void {
    if (this.game?.tickNpc(e)) return;
    if (e.type === 'voidwyrm') return this.tickDragon(e);
    if (e.type === 'riftcore') { e.age++; e.vx = e.vy = e.vz = 0; return; }
    if (e.type === 'shellward') return this.tickShulker(e);
    const def = MOBS[e.type as MobType];
    const med = sampleMedium(this.store, e.x, e.y, e.z, e.hw, e.h, e.h * 0.8);
    e.inWater = med.water;
    if (med.water || (med.lava && !def.lavaWalker)) this.pushByFluid(e, 0.5);
    if (def.fireImmune) { e.fire = 0; if (e.type === 'wailer') return this.tickGhast(e, def); if (e.type === 'emberslime') return this.tickCube(e, def, med); if (e.type === 'lavastrider') return this.tickStrider(e, def, med); if (e.type === 'flarewisp') return this.tickBlaze(e, def, med); }
    if (med.lava && !def.fireImmune) { e.fire = 160; if (e.age % 10 === 0) this.hurtMob(e, 4, null, 0, 0); }
    if (def.burnsInDay && this.dayFactor() > 0.6 && this.weather === 'clear' && !med.water && e.age % 20 === 0 && this.skyExposed(e.x, e.y + e.h, e.z)) e.fire = 100;
    if (med.water) e.fire = 0;
    if (e.fire > 0) { e.fire--; if (e.fire % 20 === 0) this.hurtMob(e, 1, null, 0, 0); if (!this.entities.has(e.id)) return; }
    if (med.cactus && e.age % 10 === 0) { this.hurtMob(e, 1, null, 0, 0); if (!this.entities.has(e.id)) return; }
    if (e.y < -16) { this.entities.delete(e.id); this.emit({ e: 'remove', id: e.id, why: 'despawn' }); return; }
    if (e.attackCd! > 0) e.attackCd!--;
    if (e.provoked! > 0) e.provoked!--;
    let goalX: number | null = null, goalZ: number | null = null, speed = def.speed;
    let flags = 0;
    if ((e.type === 'piglin' || e.type === 'piglin_brute') && !isNether(e.x)) {
      e.zomb = (e.zomb ?? 0) + 1;
      if (e.zomb > 300) { this.entities.delete(e.id); this.emit({ e: 'remove', id: e.id, why: 'despawn' }); const z = this.spawnMob('cinderhusk', e.x, e.y, e.z); z.persistent = e.persistent; this.emit({ e: 'particles', k: 'smoke', x: e.x, y: e.y + 1, z: e.z }); return; }
    }
    if (e.type === 'hoglin' && !isNether(e.x)) {
      e.zomb = (e.zomb ?? 0) + 1;
      if (e.zomb > 300) { this.entities.delete(e.id); this.emit({ e: 'remove', id: e.id, why: 'despawn' }); const z = this.spawnMob('zoglin', e.x, e.y, e.z); z.persistent = e.persistent; z.yaw = e.yaw; this.emit({ e: 'particles', k: 'smoke', x: e.x, y: e.y + 1, z: e.z }); this.emit({ e: 'sound', s: 'mob.zoglin.hurt', x: e.x, y: e.y, z: e.z }); return; }
    }
    if (e.type === 'piglin' && !e.admire && !e.target && e.age % 10 === 3 && this.difficulty !== 'peaceful') {
      const near = this.nearestPlayer(e, 16, true);
      if (near && !wearsGold(near) && this.lineOfSight(e, near)) { e.target = near.id; e.provoked = 300; }
    }
    if (e.type === 'hoglin' && e.age % 20 === 5) e.scared = this.findNear(e, B.WARPED_FUNGUS, 7);
    if (e.type === 'piglin' && e.age % 20 === 6) e.scared = this.findNearAny(e, isSoulLight, 8);
    if (e.admire && e.admire > 0) {
      e.admire--; e.path = null; flags |= 64;
      if (e.admire === 0) this.barter(e);
    }
    if (e.type === 'voidstalker') { this.tickEnderman(e, med.water); if (!this.entities.has(e.id)) return; }
    const angry = !e.admire && (def.hostile || (def.neutral && e.provoked! > 0 && !!e.target));
    if (def.neutral && !angry) e.target = null;
    if (angry) {
      if (e.type === 'duskweaver' && e.age % 20 === 1) e.dim = !this.brightAtLeast(Math.floor(e.x), Math.floor(e.y + 0.5), Math.floor(e.z), 12);
      const aggressive = e.type !== 'duskweaver' || e.provoked! > 0 || e.dim !== false;
      let target = e.target ? this.players.get(e.target) : undefined;
      const follow = def.follow ?? FOLLOW[e.type] ?? 16;
      if (target && (target.dead || target.mode !== 'survival' || Math.hypot(target.x - e.x, target.y - e.y, target.z - e.z) > Math.max(32, follow + 6))) { target = undefined; e.target = null; }
      if (!target && aggressive && def.hostile && e.age % 10 === 0) {
        const near = this.nearestPlayer(e, follow, true);
        if (near && this.lineOfSight(e, near)) { e.target = near.id; target = near; }
      }
      if (target && this.difficulty !== 'peaceful') {
        flags |= 16;
        const dx = target.x - e.x, dz = target.z - e.z;
        const dist = Math.hypot(dx, dz);
        const dy = target.y - e.y;
        e.yaw = Math.atan2(-dx, -dz);
        if (e.scared) { goalX = e.x + (e.x - e.scared[0]) * 3; goalZ = e.z + (e.z - e.scared[1]) * 3; speed *= 1.3; }
        else if (def.ranged || (e.type === 'piglin' && e.wield === 1)) {
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
            this.damage(target, Math.max(1, Math.round(def.damage * DIFF_DMG[this.difficulty] * 2) / 2), e.type, e.x, e.z, true, false, undefined, e.type === 'hoglin' || e.type === 'zoglin' ? 1.2 : 0.4);
            this.hitBy = null;
            if (e.type === 'witherbone' && !target.dead) target.witherT = 200;
          }
        }
      }
    } else {
      if (e.type === 'piglin' && !e.admire && e.age % 10 === 0) {
        let best: Entity | null = null, bd = 64;
        for (const o of this.entities.values()) {
          if (o.kind !== 'item' || o.item?.id !== I.GOLD_INGOT) continue;
          const d = (o.x - e.x) ** 2 + (o.y - e.y) ** 2 + (o.z - e.z) ** 2;
          if (d < bd) { bd = d; best = o; }
        }
        if (best && bd < 2.2) {
          best.item!.count--;
          if (best.item!.count <= 0) { this.entities.delete(best.id); this.emit({ e: 'remove', id: best.id, why: 'pickup' }); }
          e.admire = 120;
          this.emit({ e: 'sound', s: 'mob.piglin.ambient', x: e.x, y: e.y + 1.5, z: e.z });
        } else if (best) e.goal = [best.x, best.y, best.z];
        else e.goal = undefined;
      }
      if (e.type === 'piglin' && e.goal && !e.admire) { goalX = e.goal[0]; goalZ = e.goal[2]; }
      if ((e.type === 'hoglin' || e.type === 'piglin') && e.scared) { goalX = e.x + (e.x - e.scared[0]) * 3; goalZ = e.z + (e.z - e.scared[1]) * 3; }
      if (def.trader && !e.baby && (this.tickCount + e.id) % 100 === 0) this.tickJob(e);
      if (def.trader && e.job && e.prof !== undefined && e.prof >= 0 && !e.tradeWith && !e.panic && !this.isNight() && (this.tickCount + e.id) % 600 < 120) {
        const dj = Math.hypot(e.job[0] + 0.5 - e.x, e.job[2] + 0.5 - e.z);
        if (dj > 1.8 && dj < 48) { goalX = e.job[0] + 0.5; goalZ = e.job[2] + 0.5; }
      }
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
    if (goalX === null && !angry || goalX === null && !e.target) {
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
    } else if (goalX !== null && goalZ !== null && angry) {
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
    if (e.prof !== undefined && e.prof >= 0) flags |= (e.prof + 1) << 9;
    if (e.wield === 1) flags |= 32;
    e.flags = flags;
  }

  private spawnEnd(hostile: boolean, cx: number, cz: number): number {
    if (!hostile || this.difficulty === 'peaceful') return 0;
    const sx = cx * 16 + this.rng.int(16), sz = cz * 16 + this.rng.int(16);
    if (!this.store.isLoaded(sx, sz) || !this.isTicking(sx, sz)) return 0;
    let y = WORLD_HEIGHT - 2;
    while (y > 1 && this.get(sx, y - 1, sz) === 0) y--;
    if (y <= 1 || blockId(this.get(sx, y - 1, sz)) !== CB.END_STONE || this.get(sx, y, sz) !== 0 || this.get(sx, y + 1, sz) !== 0 || this.get(sx, y + 2, sz) !== 0) return 0;
    if (this.info.blockLight(sx, y, sz) > 0) return 0;
    for (const p of this.players.values()) if (Math.hypot(p.x - sx, p.y - y, p.z - sz) < 24) return 0;
    let n = 0;
    for (let i = 0, k = 1 + this.rng.int(4); i < k; i++) {
      const x = sx + this.rng.int(5) - 2, z = sz + this.rng.int(5) - 2;
      if (this.get(x, y, z) !== 0 || this.get(x, y + 1, z) !== 0 || this.get(x, y + 2, z) !== 0 || blockId(this.get(x, y - 1, z)) !== CB.END_STONE) continue;
      this.spawnMob('voidstalker', x + 0.5, y, z + 0.5);
      n++;
    }
    return n;
  }

  private spawnNether(hostile: boolean, cx: number, cz: number): number {
    const sx = cx * 16 + this.rng.int(16), sz = cz * 16 + this.rng.int(16);
    if (!this.store.isLoaded(sx, sz) || !this.isTicking(sx, sz)) return 0;
    if (hostile && this.difficulty !== 'peaceful') {
      const fort = fortressAt(this.gen.seed, sx, sz, (x, z) => this.gen.netherBiome(x, z));
      if (fort && sx >= fort.x0 && sx <= fort.x1 && sz >= fort.z0 && sz <= fort.z1) {
        const n = this.spawnFortress(fort.y, sx, sz);
        if (n >= 0) return n;
      }
    }
    const biome = this.gen.netherBiome(sx, sz);
    const list = Object.values(MOBS).filter((d) => d.nether?.[biome] && (hostile ? d.hostile || d.neutral : !d.hostile && !d.neutral) && (!hostile || this.difficulty !== 'peaceful'));
    let total = 0;
    for (const d of list) total += d.nether![biome]!.weight;
    if (!total) return 0;
    let r = this.rng.int(total), def: MobDef | null = null;
    for (const d of list) { r -= d.nether![biome]!.weight; if (r < 0) { def = d; break; } }
    if (!def) return 0;
    const sp = def.nether![biome]!;
    let y = NETHER_LAVA + 1 + this.rng.int(90);
    if (def.lavaWalker) {
      y = NETHER_LAVA;
      if (blockId(this.get(sx, y, sz)) !== B.LAVA || this.get(sx, y + 1, sz) !== 0 || this.get(sx, y + 2, sz) !== 0) return 0;
      y += 1;
    } else {
      let k = 0;
      while (k < 24 && (this.get(sx, y, sz) !== 0 || this.get(sx, y - 1, sz) === 0)) { y--; k++; }
      if (this.get(sx, y, sz) !== 0 || !isSolid(this.get(sx, y - 1, sz))) return 0;
      if (def.flying) { y += 2; for (let dy = 0; dy < 5; dy++) for (let dx = -2; dx <= 2; dx += 2) for (let dz = -2; dz <= 2; dz += 2) if (this.get(sx + dx, y + dy, sz + dz) !== 0) return 0; }
    }
    for (const p of this.players.values()) if ((p.x - sx) ** 2 + (p.y - y) ** 2 + (p.z - sz) ** 2 < 576) return 0;
    if (def.type === 'wailer') for (const o of this.entities.values()) if (o.type === 'wailer' && (o.x - sx) ** 2 + (o.y - y) ** 2 + (o.z - sz) ** 2 < GHAST_SPACING * GHAST_SPACING) return 0;
    const n = def.flying ? 1 : sp.min + this.rng.int(sp.max - sp.min + 1);
    let spawned = 0;
    for (let i = 0; i < n; i++) {
      const x = sx + (i ? this.rng.int(5) - 2 : 0), z = sz + (i ? this.rng.int(5) - 2 : 0);
      if (!def.flying && !def.lavaWalker && (!this.spawnRoom(def, x, y, z))) continue;
      const e = this.spawnMob(def.type, x + 0.5, y, z + 0.5);
      if (def.flying) e.goal = [e.x, e.y, e.z];
      spawned++;
    }
    return spawned;
  }

  private findNearAny(e: Entity, test: (id: number) => boolean, r: number): [number, number] | null {
    const bx = Math.floor(e.x), by = Math.floor(e.y), bz = Math.floor(e.z);
    let best: [number, number] | null = null, bd = Infinity;
    for (let dy = -2; dy <= 2; dy++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (!test(blockId(this.get(bx + dx, by + dy, bz + dz)))) continue;
      const d = dx * dx + dz * dz + dy * dy;
      if (d < bd) { bd = d; best = [bx + dx + 0.5, bz + dz + 0.5]; }
    }
    return best;
  }

  private findNear(e: Entity, id: number, r: number): [number, number] | null {
    const bx = Math.floor(e.x), by = Math.floor(e.y), bz = Math.floor(e.z);
    for (let dy = -1; dy <= 1; dy++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (blockId(this.get(bx + dx, by + dy, bz + dz)) === id) return [bx + dx + 0.5, bz + dz + 0.5];
    return null;
  }

  private barter(e: Entity): void {
    const r = this.rng;
    const table: [number, () => ItemStack][] = [
      [5, () => ({ id: I.ENCHANTED_BOOK, count: 1, en: { soul_speed: 1 + r.int(3) } })], [8, () => ({ id: armorId(1, 3), count: 1, en: { soul_speed: 1 + r.int(3) } })],
      [10, () => ({ id: I.ENDER_PEARL, count: 2 + r.int(3) })], [10, () => ({ id: I.IRON_NUGGET, count: 10 + r.int(27) })], [20, () => ({ id: I.STRING, count: 3 + r.int(7) })],
      [20, () => ({ id: I.QUARTZ, count: 5 + r.int(8) })], [40, () => ({ id: B.OBSIDIAN, count: 1 })], [40, () => ({ id: B.CRYING_OBSIDIAN, count: 1 + r.int(3) })],
      [40, () => ({ id: I.LEATHER, count: 2 + r.int(3) })], [40, () => ({ id: 600 + XV.SOUL_SAND, count: 2 + r.int(7) })], [40, () => ({ id: 600 + XV.NETHER_BRICKS, count: 1 + r.int(2) })],
      [40, () => ({ id: I.ARROW, count: 6 + r.int(7) })], [40, () => ({ id: B.GRAVEL, count: 8 + r.int(9) })], [40, () => ({ id: 600 + XV.BLACKSTONE, count: 8 + r.int(9) })],
    ];
    let q = r.int(table.reduce((n, t) => n + t[0], 0));
    for (const [w, mk] of table) if ((q -= w) < 0) {
      const near = this.nearestPlayer(e, 8, false);
      const dx = near ? near.x - e.x : -Math.sin(e.yaw), dz = near ? near.z - e.z : -Math.cos(e.yaw), l = Math.hypot(dx, dz) || 1;
      this.spawnItem(e.x, e.y + 1.2, e.z, mk(), (dx / l) * 3, 3, (dz / l) * 3, 10);
      break;
    }
    this.emit({ e: 'sound', s: 'mob.piglin.ambient', x: e.x, y: e.y + 1.5, z: e.z });
  }

  private tickJob(e: Entity): void {
    if (e.job) {
      const [jx, jy, jz] = e.job;
      if (!this.store.isLoaded(jx, jz)) return;
      const ok = JOB_SITES[blockId(this.get(jx, jy, jz))] === e.prof;
      if (ok) return;
      e.job = undefined;
      if (!e.vxp) { e.prof = -1; e.uses = []; e.tseed = undefined; this.emit({ e: 'particles', k: 'smoke', x: e.x, y: e.y + 2, z: e.z }); }
      return;
    }
    const legacy = e.prof !== undefined && e.prof >= 0 && e.job === undefined && !e.vxp && e.jobless === undefined;
    if (legacy) { e.jobless = 1; return; }
    const want = e.prof !== undefined && e.prof >= 0 && e.vxp ? JOB_BLOCK[e.prof] : -1;
    if (e.prof !== undefined && e.prof >= 0 && !e.vxp && e.jobless) return;
    const bx = Math.floor(e.x), by = Math.floor(e.y), bz = Math.floor(e.z);
    const taken = new Set<string>();
    for (const o of this.entities.values()) if (o.job && o !== e) taken.add(posKey(o.job[0], o.job[1], o.job[2]));
    let best: [number, number, number] | null = null, bd = Infinity;
    for (let dy = -4; dy <= 4; dy++) for (let dz = -16; dz <= 16; dz++) for (let dx = -16; dx <= 16; dx++) {
      const id = blockId(this.get(bx + dx, by + dy, bz + dz));
      if (JOB_SITES[id] === undefined || (want >= 0 && id !== want)) continue;
      const d = dx * dx + dy * dy + dz * dz;
      if (d >= bd || taken.has(posKey(bx + dx, by + dy, bz + dz))) continue;
      best = [bx + dx, by + dy, bz + dz]; bd = d;
    }
    if (!best) return;
    e.job = best;
    const np = JOB_SITES[blockId(this.get(best[0], best[1], best[2]))];
    if (np !== e.prof) { e.prof = np; e.uses = []; e.tseed = undefined; }
    this.emit({ e: 'particles', k: 'xp', x: best[0] + 0.5, y: best[1] + 1.2, z: best[2] + 0.5 });
    this.emit({ e: 'sound', s: 'villager.yes', x: e.x, y: e.y + 1.5, z: e.z });
  }

  private useComposter(p: SimPlayer, x: number, y: number, z: number, v: number): boolean {
    const lv = blockMeta(v) & 15;
    if (lv >= 8) {
      this.setBlock(x, y, z, makeBlock(B.COMPOSTER, 0), p.id);
      this.spawnItem(x + 0.5, y + 1.1, z + 0.5, { id: I.BONE_MEAL, count: 1 }, 0, 2, 0, 5);
      this.emit({ e: 'sound', s: 'composter.empty', x: x + 0.5, y: y + 0.5, z: z + 0.5 });
      return true;
    }
    const held = heldStack(p.inv);
    const chance = held ? COMPOST[held.id] : undefined;
    if (chance === undefined || lv >= 7) return false;
    if (p.mode === 'survival') { held!.count--; if (held!.count <= 0) p.inv.slots[p.inv.selected] = null; this.emit({ e: 'inv', p }); }
    const up = lv === 0 || this.rng.next() < chance;
    if (up) this.setBlock(x, y, z, makeBlock(B.COMPOSTER, lv + 1 === 7 ? 8 : lv + 1), p.id);
    this.emit({ e: 'particles', k: 'heart', x: x + 0.5, y: y + 1, z: z + 0.5 });
    this.emit({ e: 'sound', s: up ? 'composter.fill_success' : 'composter.fill', x: x + 0.5, y: y + 0.5, z: z + 0.5 });
    return true;
  }

  angerPiglins(p: SimPlayer, x: number, y: number, z: number): void {
    if (!isNether(x) || p.mode !== 'survival') return;
    for (const o of this.entities.values()) if (o.type === 'piglin' && Math.hypot(o.x - x, o.y - y, o.z - z) < 16 && this.lineOfSight(o, p)) { o.target = p.id; o.provoked = 600; o.admire = 0; }
  }

  private spawnFortress(fy: number, sx: number, sz: number): number {
    const NBV = X(XV.NETHER_BRICKS);
    let y = -1;
    for (let yy = fy + 6; yy >= fy; yy--) if (this.get(sx, yy - 1, sz) === NBV && this.get(sx, yy, sz) === 0 && this.get(sx, yy + 1, sz) === 0 && this.get(sx, yy + 2, sz) === 0) { y = yy; break; }
    if (y < 0) return -1;
    for (const p of this.players.values()) if ((p.x - sx) ** 2 + (p.y - y) ** 2 + (p.z - sz) ** 2 < 576) return 0;
    const list = Object.values(MOBS).filter((d) => d.fortress);
    let r = this.rng.int(list.reduce((n, d) => n + d.fortress!.weight, 0)), def: MobDef = list[0];
    for (const d of list) { r -= d.fortress!.weight; if (r < 0) { def = d; break; } }
    const sp = def.fortress!;
    const n = sp.min + this.rng.int(sp.max - sp.min + 1);
    let spawned = 0;
    for (let i = 0; i < n; i++) {
      const x = sx + (i ? this.rng.int(5) - 2 : 0), z = sz + (i ? this.rng.int(5) - 2 : 0);
      if (this.get(x, y - 1, z) !== NBV || this.get(x, y, z) !== 0 || this.get(x, y + 1, z) !== 0 || (def.h > 2 && this.get(x, y + 2, z) !== 0)) continue;
      const e = this.spawnMob(def.type, x + 0.5, y, z + 0.5, def.type === 'emberslime' ? [1, 2, 4][this.rng.int(3)] : undefined);
      if (def.flying) e.goal = [e.x, e.y, e.z];
      spawned++;
    }
    return spawned;
  }

  private tickGhast(e: Entity, def: MobDef): void {
    if (e.y < -16) { this.entities.delete(e.id); this.emit({ e: 'remove', id: e.id, why: 'despawn' }); return; }
    if (e.attackCd! > 0) e.attackCd!--;
    let target = e.target ? this.players.get(e.target) : undefined;
    if (target && (target.dead || target.mode !== 'survival' || Math.hypot(target.x - e.x, target.y - e.y, target.z - e.z) > 64)) { target = undefined; e.target = null; }
    if (!target && e.age % 20 === 0 && this.difficulty !== 'peaceful') {
      const near = this.nearestPlayer(e, 64, true);
      if (near && this.lineOfSight(e, near)) { e.target = near.id; target = near; }
    }
    if (!e.goal || Math.hypot(e.goal[0] - e.x, e.goal[1] - e.y, e.goal[2] - e.z) < 2 || this.rng.int(200) === 0) {
      const gx = e.x + (this.rng.next() - 0.5) * 32, gy = Math.max(NETHER_LAVA + 4, Math.min(NETHER_HEIGHT - 10, e.y + (this.rng.next() - 0.5) * 16)), gz = e.z + (this.rng.next() - 0.5) * 32;
      e.goal = [gx, gy, gz];
    }
    const [gx, gy, gz] = e.goal;
    const dx = gx - e.x, dy = gy - e.y, dz = gz - e.z, d = Math.hypot(dx, dy, dz) || 1;
    e.vx += ((dx / d) * def.speed - e.vx) * 0.05; e.vy += ((dy / d) * def.speed - e.vy) * 0.05; e.vz += ((dz / d) * def.speed - e.vz) * 0.05;
    let flags = 0;
    if (target) {
      e.yaw = Math.atan2(-(target.x - e.x), -(target.z - e.z));
      if (e.age % 5 === 0 || e.los === undefined) e.los = this.lineOfSight(e, target);
      if (e.los) {
        e.charge = (e.charge ?? 0) + 1;
        if (e.charge === 10) this.emit({ e: 'sound', s: 'mob.wailer.warn', x: e.x, y: e.y + 2, z: e.z });
        if (e.charge >= 20) {
          e.charge = -40;
          const ox = e.x - Math.sin(e.yaw) * 2.2, oy = e.y + 2, oz = e.z - Math.cos(e.yaw) * 2.2;
          const tx = target.x - ox, ty = target.y + 1 - oy, tz = target.z - oz, tl = Math.hypot(tx, ty, tz) || 1;
          const sp = 16;
          const f: Entity = { id: this.allocId(), kind: 'fireball', type: 'fireball', x: ox, y: oy, z: oz, vx: (tx / tl) * sp, vy: (ty / tl) * sp, vz: (tz / tl) * sp, hw: 0.5, h: 1, onGround: false, hitH: false, hitCeil: false, yaw: e.yaw, health: 1, maxHealth: 1, hurt: 0, age: 0, fire: 0, flags: 0, shooter: e.id };
          this.entities.set(f.id, f);
          this.emit({ e: 'spawn', ent: f });
          this.emit({ e: 'sound', s: 'mob.wailer.shoot', x: ox, y: oy, z: oz });
        }
      } else if ((e.charge ?? 0) > 0) e.charge = (e.charge ?? 0) - 1;
      else if ((e.charge ?? 0) < 0) e.charge!++;
      if ((e.charge ?? 0) > 10) flags |= 4;
      flags |= 16;
    } else { e.charge = Math.min(0, e.charge ?? 0) + (e.charge && e.charge < 0 ? 1 : 0); if (Math.hypot(e.vx, e.vz) > 0.2) e.yaw = Math.atan2(-e.vx, -e.vz); }
    moveBody(e, e.vx * DT, e.vy * DT, e.vz * DT, this.store);
    if (e.hitH || e.hitCeil || e.onGround) { e.goal = undefined; if (e.onGround) e.vy = 1.5; }
    if (e.hurt > 0) flags |= 1;
    e.flags = flags;
    if (e.age % 300 === 0 && this.rng.chance(0.5)) this.emit({ e: 'sound', s: 'mob.wailer.ambient', x: e.x, y: e.y + 2, z: e.z });
  }

  private endPillarsWorld(): { i: number; x: number; z: number; r: number; h: number; caged: boolean }[] {
    return this.gen.endGen().pillars().map((p, i) => ({ i, x: END_X + p.x, z: p.z, r: p.r, h: p.h, caged: p.caged }));
  }

  private say(text: string): void { this.emit({ e: 'msg', text, kind: 'info' }); }

  private tickEndFight(): void {
    const st = this.endState;
    const here = [...this.players.values()].filter((p) => !p.dead && isEnd(p.x) && Math.hypot(p.x - END_X, p.z) < 260);
    if (st.summon !== undefined) { this.tickSummon(here.length > 0); return; }
    if (!st.alive && st.kills > 0 && this.peakPlayers >= DRAGON_PEAK) {
      const now = Date.now(), due = st.lastKill + DRAGON_RESPAWN_MS;
      if (!st.warned && now >= due - 300000) { st.warned = true; this.say('The End stirs. The Ender Dragon returns within five minutes.'); }
      if (now >= due && here.length && this.store.isLoaded(END_X, 0)) { st.auto = true; this.beginSummon(); return; }
    }
    if (!here.length || !this.store.isLoaded(END_X, 0)) return;
    if (!st.started) { st.started = true; st.alive = true; }
    if (!st.alive) { this.checkRespawnCrystals(); return; }
    let dragon: Entity | null = null;
    for (const e of this.entities.values()) if (e.type === 'voidwyrm') { dragon = e; break; }
    if (!dragon) this.spawnDragon();
    for (const p of this.endPillarsWorld()) {
      if (st.lost.includes(p.i) || !this.store.isLoaded(p.x, p.z)) continue;
      let has = false;
      for (const e of this.entities.values()) if (e.type === 'riftcore' && e.pil === p.i) { has = true; break; }
      if (!has) { const c = this.spawnMob('riftcore', p.x + 0.5, p.h + 1, p.z + 0.5); c.persistent = true; c.pil = p.i; }
    }
  }

  private spawnDragon(): Entity {
    const e = this.spawnMob('voidwyrm', END_X + 0.5, EXIT_Y + 40, 30.5);
    e.persistent = true; e.phase = 'circle'; e.pt = 0; e.ang = this.rng.next() * Math.PI * 2; e.taken = 0;
    return e;
  }

  private burstCrystal(e: Entity): void {
    if (e.health <= 0) return;
    e.health = 0;
    this.entities.delete(e.id);
    this.emit({ e: 'remove', id: e.id, why: 'death' });
    if (e.pil !== undefined && !this.endState.lost.includes(e.pil)) this.endState.lost.push(e.pil);
    for (const d of this.entities.values()) if (d.type === 'voidwyrm' && d.phase !== 'dying' && Math.hypot(d.x - e.x, d.y - e.y, d.z - e.z) < 32 && d.pil === e.id) { d.pil = undefined; this.hurtDragon(d, 10, null); }
    this.explode(e.x, e.y, e.z, 6, { noBlocks: isEnd(e.x) && Math.hypot(e.x - END_X, e.z) < 12 });
  }

  private hurtDragon(e: Entity, dmg: number, by: string | null): void {
    if (e.phase === 'dying' || e.health <= 0) return;
    if (e.hurt > 0 && dmg <= (e.lastHurt ?? 0)) return;
    e.lastHurt = dmg; e.hurt = 10;
    if (by && e.phase !== 'perch') dmg = dmg / 4 + 1;
    e.health -= dmg;
    e.taken = (e.taken ?? 0) + dmg;
    this.emit({ e: 'sound', s: 'mob.voidwyrm.hurt', x: e.x, y: e.y + 2, z: e.z, vol: 3 });
    if (e.phase === 'perch' && e.taken > 25) { e.phase = 'takeoff'; e.pt = 0; }
    if (by) e.target = by;
    if (e.health <= 0) {
      e.health = 0.01; e.phase = 'dying'; e.pt = 0; e.vx = e.vy = e.vz = 0; e.flags |= 0x10000;
      e.attacker = by ?? e.attacker;
      this.emit({ e: 'sound', s: 'mob.voidwyrm.death', x: e.x, y: e.y, z: e.z, vol: 4 });
    }
  }

  private tickDragon(e: Entity): void {
    e.age++;
    if (e.hurt > 0) e.hurt--;
    const cx = END_X + 0.5, cz = 0.5;
    if (!isEnd(e.x)) { this.entities.delete(e.id); this.emit({ e: 'remove', id: e.id, why: 'despawn' }); return; }
    if (e.phase === 'dying') {
      e.pt = (e.pt ?? 0) + 1;
      e.y += 0.1;
      if (e.pt % 4 === 0) this.emit({ e: 'particles', k: 'dragon', x: e.x + (this.rng.next() - 0.5) * 6, y: e.y + this.rng.next() * 4, z: e.z + (this.rng.next() - 0.5) * 6 });
      if (e.pt >= 200) this.dragonDeath(e);
      return;
    }
    let best: Entity | null = null, bd = 32;
    for (const c of this.entities.values()) if (c.type === 'riftcore') { const d = Math.hypot(c.x - e.x, c.y - e.y, c.z - e.z); if (d < bd) { bd = d; best = c; } }
    e.pil = best ? best.id : undefined;
    if (best && e.age % 10 === 0 && e.health < e.maxHealth) e.health = Math.min(e.maxHealth, e.health + 1);
    const players = [...this.players.values()].filter((p) => !p.dead && p.mode === 'survival' && isEnd(p.x) && Math.hypot(p.x - cx, p.z - cz) < 200);
    const crystals = [...this.entities.values()].filter((c) => c.type === 'riftcore').length;
    e.pt = (e.pt ?? 0) + 1;
    let tx = e.gx ?? cx, ty = e.gy ?? EXIT_Y + 40, tz = e.gz ?? cz, speed = 18;
    const reach = (x: number, y: number, z: number, r: number) => Math.hypot(x - e.x, y - e.y, z - e.z) < r;
    switch (e.phase) {
      case 'circle': {
        const R = 46 + Math.sin((e.ang ?? 0) * 3) * 10;
        tx = cx + Math.cos(e.ang!) * R; tz = cz + Math.sin(e.ang!) * R; ty = EXIT_Y + 22 + Math.sin((e.ang ?? 0) * 2) * 8;
        if (reach(tx, ty, tz, 10)) {
          e.ang = (e.ang ?? 0) + 0.45;
          const roll = this.rng.next();
          if (roll < 1 / (crystals + 3)) { e.phase = 'approach'; e.pt = 0; }
          else if (players.length && roll > 0.78) { e.phase = 'strafe'; e.pt = 0; e.target = players[this.rng.int(players.length)].id; }
        }
        break;
      }
      case 'strafe': {
        const t = e.target ? this.players.get(e.target) : undefined;
        if (!t || t.dead || !isEnd(t.x) || e.pt > 300) { e.phase = 'circle'; break; }
        tx = t.x; ty = t.y + 14; tz = t.z;
        if (reach(t.x, t.y, t.z, 48) && e.pt % 30 === 0) this.dragonFireball(e, t);
        if (e.pt > 90 && reach(tx, ty, tz, 18)) { e.phase = 'circle'; e.pt = 0; }
        break;
      }
      case 'approach': {
        tx = cx; tz = cz; ty = EXIT_Y + 4.6; speed = 12;
        if (reach(tx, ty + 6, tz, 30)) { ty = EXIT_Y + 4.6; speed = 8; }
        if (reach(tx, ty, tz, 2.2)) { e.phase = 'perch'; e.pt = 0; e.taken = 0; e.x = cx; e.y = EXIT_Y + 4.6; e.z = cz; }
        if (e.pt > 600) { e.phase = 'circle'; e.pt = 0; }
        break;
      }
      case 'perch': {
        e.vx = e.vy = e.vz = 0; e.x = cx; e.y = EXIT_Y + 4.6; e.z = cz;
        let near: SimPlayer | null = null, nd = 40;
        for (const p of players) { const d = Math.hypot(p.x - cx, p.z - cz); if (d < nd) { nd = d; near = p; } }
        if (near) e.yaw = Math.atan2(-(near.x - cx), -(near.z - cz));
        if (near && e.pt % 50 === 25) {
          const dx = near.x - cx, dz = near.z - cz, l = Math.hypot(dx, dz) || 1;
          const bx = cx + (dx / l) * Math.min(8, l), bz = cz + (dz / l) * Math.min(8, l);
          this.addCloud(bx, EXIT_Y + 1, bz, 2.5, 100);
          this.emit({ e: 'sound', s: 'mob.voidwyrm.breath', x: cx, y: e.y, z: cz, vol: 3 });
        }
        if (e.pt > 260) { e.phase = 'takeoff'; e.pt = 0; }
        return this.dragonContact(e);
      }
      case 'takeoff': {
        tx = cx + Math.cos(e.ang ?? 0) * 30; tz = cz + Math.sin(e.ang ?? 0) * 30; ty = EXIT_Y + 30; speed = 14;
        if (reach(tx, ty, tz, 8) || e.pt > 200) { e.phase = 'circle'; e.pt = 0; }
        break;
      }
      default: e.phase = 'circle';
    }
    e.gx = tx; e.gy = ty; e.gz = tz;
    const dx = tx - e.x, dy = ty - e.y, dz = tz - e.z, l = Math.hypot(dx, dy, dz) || 1;
    const want = Math.min(speed, l * 3);
    const k = 0.06;
    e.vx += ((dx / l) * want - e.vx) * k; e.vy += ((dy / l) * want - e.vy) * k; e.vz += ((dz / l) * want - e.vz) * k;
    e.x += e.vx * DT; e.y += e.vy * DT; e.z += e.vz * DT;
    const hs = Math.hypot(e.vx, e.vz);
    if (hs > 0.5) e.yaw = Math.atan2(-e.vx, -e.vz);
    if (e.age % 2 === 0) this.dragonCrush(e);
    this.dragonContact(e);
  }

  private dragonContact(e: Entity): void {
    for (const p of this.players.values()) {
      if (p.dead || p.mode !== 'survival') continue;
      const dx = p.x - e.x, dz = p.z - e.z, dy = p.y - e.y;
      if (Math.abs(dx) < e.hw + 0.3 && Math.abs(dz) < e.hw + 0.3 && dy > -2 && dy < e.h) {
        if ((p.lastDragonHit ?? 0) > this.now - 500) continue;
        p.lastDragonHit = this.now;
        const l = Math.hypot(dx, dz) || 1;
        this.damage(p, 10 * DIFF_DMG[this.difficulty] / DIFF_DMG.normal || 5, 'voidwyrm', e.x, e.z, true, false, undefined, 1.6);
        this.emit({ e: 'knock', p, x: (dx / l) * 18, y: 9, z: (dz / l) * 18, set: true });
      }
    }
  }

  private dragonCrush(e: Entity): void {
    if (this.game) return;
    const x0 = Math.floor(e.x - 3), x1 = Math.floor(e.x + 3), z0 = Math.floor(e.z - 3), z1 = Math.floor(e.z + 3), y0 = Math.floor(e.y), y1 = Math.floor(e.y + 3);
    let broke = false;
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const v = this.get(x, y, z);
      if (!v || DRAGON_IMMUNE.has(blockId(v)) || getBlock(v).hardness < 0 || isFluid(v)) continue;
      this.setBlock(x, y, z, 0);
      broke = true;
    }
    if (broke) this.emit({ e: 'sound', s: 'mob.voidwyrm.crush', x: e.x, y: e.y, z: e.z });
  }

  private dragonFireball(e: Entity, t: SimPlayer): void {
    const ox = e.x - Math.sin(e.yaw) * 4, oy = e.y + 1.5, oz = e.z - Math.cos(e.yaw) * 4;
    const dx = t.x - ox, dy = t.y + 1 - oy, dz = t.z - oz, l = Math.hypot(dx, dy, dz) || 1;
    const f: Entity = {
      id: this.allocId(), kind: 'fireball', type: 'dfire', x: ox, y: oy, z: oz, vx: (dx / l) * 14, vy: (dy / l) * 14, vz: (dz / l) * 14,
      hw: 0.5, h: 1, onGround: false, hitH: false, hitCeil: false, yaw: 0, health: 1, maxHealth: 1, hurt: 0, age: 0, fire: 0, flags: 2, shooter: e.id,
    };
    this.entities.set(f.id, f);
    this.emit({ e: 'spawn', ent: f });
    this.emit({ e: 'sound', s: 'mob.voidwyrm.shoot', x: ox, y: oy, z: oz, vol: 3 });
  }

  private tickDragonFire(e: Entity): void {
    e.age++;
    if (e.age > 200) { this.entities.delete(e.id); this.emit({ e: 'remove', id: e.id, why: 'despawn' }); return; }
    const sp = Math.hypot(e.vx, e.vy, e.vz) || 1, step = sp * DT, dx = e.vx / sp, dy = e.vy / sp, dz = e.vz / sp;
    const wall = raycast(this.store, e.x, e.y, e.z, dx, dy, dz, step);
    let hit = !!(wall && isSolid(wall.value));
    if (!hit) for (const p of this.players.values()) if (!p.dead && Math.abs(p.x - e.x) < 0.9 && Math.abs(p.z - e.z) < 0.9 && e.y > p.y - 0.5 && e.y < p.y + 2.2) { hit = true; break; }
    if (hit) {
      const hx = wall ? e.x + dx * wall.dist : e.x, hy = wall ? e.y + dy * wall.dist : e.y, hz = wall ? e.z + dz * wall.dist : e.z;
      this.entities.delete(e.id);
      this.emit({ e: 'remove', id: e.id, why: 'hit' });
      this.addCloud(hx, hy, hz, 3, 300);
      return;
    }
    e.x += e.vx * DT; e.y += e.vy * DT; e.z += e.vz * DT;
    if (e.age % 3 === 0) this.emit({ e: 'particles', k: 'breath', x: e.x, y: e.y, z: e.z });
  }

  private addCloud(x: number, y: number, z: number, r: number, t: number): void {
    if (this.clouds.length > 32) this.clouds.shift();
    this.clouds.push({ x, y, z, r, t });
  }

  private tickClouds(): void {
    for (const c of this.clouds) {
      c.t--;
      if (this.tickCount % 6 === 0) this.emit({ e: 'particles', k: 'breath', x: c.x + (this.rng.next() - 0.5) * c.r * 2, y: c.y + 0.2, z: c.z + (this.rng.next() - 0.5) * c.r * 2 });
      if (this.tickCount % 20 !== 0) continue;
      for (const p of this.players.values()) if (!p.dead && p.mode === 'survival' && Math.hypot(p.x - c.x, p.z - c.z) < c.r && p.y > c.y - 1.5 && p.y < c.y + 2) this.damage(p, 6, 'breath', c.x, c.z, false, true);
    }
    this.clouds = this.clouds.filter((c) => c.t > 0 && c.r > 0.4);
  }

  private bottleBreath(p: SimPlayer): boolean {
    const st = heldStack(p.inv);
    if (st?.id !== I.GLASS_BOTTLE) return false;
    const c = this.clouds.find((q) => Math.hypot(p.x - q.x, p.z - q.z) < q.r + 1.5 && Math.abs(p.y - q.y) < 3);
    if (!c) return false;
    c.r -= 0.5;
    if (p.mode !== 'creative') consumeHeld(p.inv);
    if (giveItem(p.inv, { id: I.DRAGON_BREATH, count: 1 }) > 0) this.invCtx(p).drop({ id: I.DRAGON_BREATH, count: 1 });
    this.emit({ e: 'inv', p });
    this.emit({ e: 'sound', s: 'bottle.fill_dragonbreath', x: p.x, y: p.y + 1, z: p.z });
    return true;
  }

  private dragonDeath(e: Entity): void {
    const st = this.endState;
    this.entities.delete(e.id);
    this.emit({ e: 'remove', id: e.id, why: 'death', by: e.attacker ?? undefined });
    this.emit({ e: 'boom', x: e.x, y: e.y, z: e.z, r: 6 });
    const first = st.kills === 0;
    st.kills++; st.alive = false; st.lastKill = Date.now(); st.warned = false; st.auto = false;
    for (const p of this.players.values()) if (!p.dead && p.mode === 'survival' && isEnd(p.x) && Math.hypot(p.x - e.x, p.z - e.z) < 160) this.giveXp(p, first ? 1200 : 100);
    this.setExitPortal(true);
    if (first) this.setBlock(END_X, EXIT_Y + 4, 0, makeBlock(CB.DRAGON_EGG, 0));
    this.spawnGateway();
    this.clouds = [];
    const killer = e.attacker ? this.players.get(e.attacker) : undefined;
    this.say(killer ? `${killer.name} defeated the Ender Dragon!` : 'The Ender Dragon has been defeated!');
    this.emit({ e: 'title', text: 'The Ender Dragon falls', sub: 'The exit portal is open', to: undefined });
  }

  private setExitPortal(open: boolean): void {
    for (const [dx, dz] of exitPortalCells()) this.setBlock(END_X + dx, EXIT_Y, dz, open ? makeBlock(CB.END_PORTAL, 0) : 0);
    this.endState.exitOpen = open;
  }

  private gatewayOrder(): number[] {
    const r = new Rng(this.gen.seed ^ 0x6a7e);
    const o = Array.from({ length: 20 }, (_, i) => i);
    for (let i = 19; i > 0; i--) { const j = r.int(i + 1); [o[i], o[j]] = [o[j], o[i]]; }
    return o;
  }

  private spawnGateway(): void {
    const st = this.endState;
    if (st.gates.length >= 20) return;
    const i = this.gatewayOrder()[st.gates.length];
    st.gates.push(i);
    const g = gatewaySpot(i);
    const x = END_X + g.x;
    this.setBlock(x, g.y, g.z, makeBlock(CB.END_GATEWAY, 0));
    this.setBlock(x, g.y - 1, g.z, B.BEDROCK);
    this.setBlock(x, g.y + 1, g.z, B.BEDROCK);
    this.emit({ e: 'sound', s: 'portal.end_open', x, y: g.y, z: g.z });
  }

  private checkRespawnCrystals(): void {
    const found: Entity[] = [];
    for (const [dx, dz] of RIM) {
      for (const e of this.entities.values()) if (e.type === 'riftcore' && e.pil === undefined && Math.abs(e.x - (END_X + dx + 0.5)) < 0.6 && Math.abs(e.z - (dz + 0.5)) < 0.6 && Math.abs(e.y - (EXIT_Y + 1)) < 0.6) { found.push(e); break; }
    }
    if (found.length === 4) { this.endState.auto = false; this.beginSummon(); }
  }

  private beginSummon(): void {
    this.endState.summon = 0;
    this.say(this.endState.auto ? 'The Ender Dragon is returning to the End!' : 'The crystals sing. The Ender Dragon is being summoned!');
  }

  private tickSummon(anyone: boolean): void {
    const st = this.endState;
    const t = st.summon!;
    if (!anyone && t === 0) return;
    st.summon = t + 1;
    if (t % 10 === 0) for (const [dx, dz] of RIM) this.emit({ e: 'particles', k: 'portal', x: END_X + dx + 0.5, y: EXIT_Y + 2 + (t % 40) / 10, z: dz + 0.5 });
    if (t === 100) {
      for (const p of this.endPillarsWorld()) {
        if (!this.store.isLoaded(p.x, p.z)) continue;
        for (let dz = -p.r; dz <= p.r; dz++) for (let dx = -p.r; dx <= p.r; dx++) if (dx * dx + dz * dz <= p.r * p.r + 1) for (let y = p.h - 14; y < p.h; y++) if (!this.get(p.x + dx, y, p.z + dz)) this.setBlock(p.x + dx, y, p.z + dz, B.OBSIDIAN);
        this.setBlock(p.x, p.h, p.z, B.BEDROCK);
        for (let y = p.h + 1; y <= p.h + 4; y++) if (blockId(this.get(p.x, y, p.z)) !== B.IRON_BARS) this.setBlock(p.x, y, p.z, 0);
      }
      st.lost = [];
    }
    if (t === 200) {
      for (const e of [...this.entities.values()]) if (e.type === 'riftcore' && e.pil === undefined && isEnd(e.x) && Math.hypot(e.x - END_X - 0.5, e.z - 0.5) < 5) this.burstCrystal(e);
      this.setExitPortal(false);
      st.alive = true; st.summon = undefined; st.warned = false;
      this.spawnDragon();
      this.say('The Ender Dragon has returned!');
    }
  }

  private placeCrystal(p: SimPlayer, x: number, y: number, z: number, ny: number): boolean {
    const b = blockId(this.get(x, y, z));
    if (ny !== 1 || (b !== B.OBSIDIAN && b !== B.BEDROCK)) return false;
    if (this.get(x, y + 1, z) !== 0 || this.get(x, y + 2, z) !== 0) return true;
    for (const e of this.entities.values()) if (e.kind === 'mob' && Math.abs(e.x - x - 0.5) < 1 && Math.abs(e.z - z - 0.5) < 1 && Math.abs(e.y - y - 1) < 2) return true;
    const c = this.spawnMob('riftcore', x + 0.5, y + 1, z + 0.5);
    c.persistent = true;
    if (p.mode !== 'creative') { consumeHeld(p.inv); this.emit({ e: 'inv', p }); }
    if (!this.endState.alive && isEnd(x)) this.checkRespawnCrystals();
    return true;
  }

  private gatewayJump(p: SimPlayer): void {
    const lx = p.x - END_X, lz = p.z, d = Math.hypot(lx, lz) || 1;
    const eg = this.gen.endGen();
    let dest: { x: number; y: number; z: number } | null = null, gate: { x: number; y: number; z: number } | undefined;
    if (d < 400) {
      const ux = lx / d, uz = lz / d;
      for (let r = 1024; r < 1800 && !dest; r += 6) {
        const X = Math.round(ux * r), Z = Math.round(uz * r), top = eg.topAt(X, Z);
        if (top > 0) dest = { x: END_X + X, y: top + 1, z: Z };
      }
      dest ??= { x: END_X + Math.round(ux * 1030), y: 70, z: Math.round(uz * 1030) };
      gate = { x: dest.x + 3, y: dest.y + 6, z: dest.z };
    } else {
      let bi = -1, ba = Infinity;
      const a = Math.atan2(lz, lx);
      for (const i of this.endState.gates) { const g = gatewaySpot(i); const da = Math.abs(Math.atan2(Math.sin(Math.atan2(g.z, g.x) - a), Math.cos(Math.atan2(g.z, g.x) - a))); if (da < ba) { ba = da; bi = i; } }
      const g = bi >= 0 ? gatewaySpot(bi) : { x: 80, y: EXIT_Y, z: 0 };
      const X = Math.round(g.x * 0.8), Z = Math.round(g.z * 0.8);
      dest = { x: END_X + X, y: Math.max(eg.topAt(X, Z) + 1, 40), z: Z };
    }
    p.endTrip = { x: dest.x, y: dest.y, z: dest.z, t: 0, toEnd: false, gate };
    p.portalLock = true;
    this.emit({ e: 'sound', s: 'portal.gateway', x: p.x, y: p.y, z: p.z, to: p.id });
  }

  private attachFace(x: number, y: number, z: number): number {
    if (isSolid(this.get(x, y - 1, z))) return 3;
    for (let i = 0; i < 6; i++) { const [dx, dy, dz] = SIX[i]; if (isSolid(this.get(x + dx, y + dy, z + dz))) return i; }
    return -1;
  }

  private tickShulker(e: Entity): void {
    e.age++;
    e.vx = e.vy = e.vz = 0;
    if (e.hurt > 0) e.hurt--;
    if (e.attackCd! > 0) e.attackCd!--;
    const bx = Math.floor(e.x), by = Math.floor(e.y), bz = Math.floor(e.z);
    if (e.att === undefined) e.att = this.attachFace(bx, by, bz);
    if (e.age % 10 === 0) {
      const [dx, dy, dz] = e.att >= 0 ? SIX[e.att] : [0, -1, 0];
      if (!isSolid(this.get(bx + dx, by + dy, bz + dz))) { const f = this.attachFace(bx, by, bz); if (f >= 0) e.att = f; else this.shulkerTeleport(e); }
    }
    const t = this.difficulty !== 'peaceful' ? this.nearestPlayer(e, 16, true) : null;
    const sees = !!t && this.lineOfSight(e, t);
    if (sees) {
      e.target = t!.id;
      e.peekT = 0.5;
      e.bulletCd = (e.bulletCd ?? 20) - 1;
      if (e.bulletCd <= 0) { e.bulletCd = 20 + this.rng.int(10) * 10; this.shulkerBullet(e, t!); }
    } else {
      e.target = null;
      if (e.peekT && e.peekT > 0 && this.rng.chance(0.02)) e.peekT = 0;
      else if (!e.peekT && this.rng.chance(1 / 120)) e.peekT = 0.3 + this.rng.next() * 0.7;
    }
    const want = e.peekT ?? 0, cur = e.peek ?? 0;
    e.peek = Math.abs(want - cur) < 0.05 ? want : cur + Math.sign(want - cur) * 0.05;
    e.flags = (e.flags & ~0xf00) | (Math.round(e.peek * 15) << 8) | ((e.att ?? 3) << 12);
  }

  private shulkerBullet(e: Entity, t: SimPlayer): void {
    const b: Entity = {
      id: this.allocId(), kind: 'arrow', type: 'bullet', x: e.x, y: e.y + 0.5, z: e.z, vx: 0, vy: 0, vz: 0, hw: 0.15, h: 0.3,
      onGround: false, hitH: false, hitCeil: false, yaw: 0, health: 1, maxHealth: 1, hurt: 0, age: 0, fire: 0, flags: 0, shooter: e.id, target: t.id, dmg: 4,
    };
    this.entities.set(b.id, b);
    this.emit({ e: 'spawn', ent: b });
    this.emit({ e: 'sound', s: 'shulker.shoot', x: e.x, y: e.y + 0.5, z: e.z });
  }

  private tickBullet(e: Entity): void {
    e.age++;
    const gone = () => { this.entities.delete(e.id); this.emit({ e: 'remove', id: e.id, why: 'hit' }); this.emit({ e: 'particles', k: 'crit', x: e.x, y: e.y, z: e.z }); };
    if (e.age > 300) return gone();
    const t = e.target ? this.players.get(e.target) : undefined;
    if (t && !t.dead) {
      const dx = t.x - e.x, dy = t.y + 1 - e.y, dz = t.z - e.z, l = Math.hypot(dx, dy, dz) || 1;
      e.vx += ((dx / l) * 6 - e.vx) * 0.15; e.vy += ((dy / l) * 6 - e.vy) * 0.15; e.vz += ((dz / l) * 6 - e.vz) * 0.15;
    } else e.vy -= 0.4;
    const nx = e.x + e.vx * DT, ny = e.y + e.vy * DT, nz = e.z + e.vz * DT;
    if (isSolid(this.get(Math.floor(nx), Math.floor(ny), Math.floor(nz)))) return gone();
    e.x = nx; e.y = ny; e.z = nz;
    for (const p of this.players.values()) {
      if (p.dead || p.mode !== 'survival') continue;
      if (Math.abs(p.x - e.x) < 0.5 && Math.abs(p.z - e.z) < 0.5 && e.y > p.y - 0.1 && e.y < p.y + 1.9) {
        this.damage(p, 4, 'shellward', e.x, e.z, true, false);
        this.levitate(p, 200);
        return gone();
      }
    }
    for (const m of this.entities.values()) {
      if (m.kind !== 'mob' || m.id === e.shooter || m.health <= 0) continue;
      if (Math.abs(m.x - e.x) < m.hw + 0.15 && Math.abs(m.z - e.z) < m.hw + 0.15 && e.y > m.y && e.y < m.y + m.h) {
        if (m.type === 'shellward') this.shulkerBulletHit(m);
        else { this.hurtMob(m, 4, null, 0, 0); if (m.health > 0) m.vy = 8; }
        return gone();
      }
    }
  }

  private shulkerBulletHit(m: Entity): void {
    const ox = m.x, oy = m.y, oz = m.z, open = (m.peek ?? 0) >= 0.3;
    this.hurtMob(m, 4, null, 0, 0);
    if (!open || m.health <= 0 || !this.entities.has(m.id)) return;
    if (!this.shulkerTeleport(m)) return;
    let count = 0;
    for (const o of this.entities.values()) if (o.type === 'shellward' && Math.abs(o.x - ox) < 8.5 && Math.abs(o.y - oy) < 8.5 && Math.abs(o.z - oz) < 8.5) count++;
    if (this.rng.next() < (count - 1) / 5) return;
    const c = this.spawnMob('shellward', ox, oy, oz);
    c.persistent = true;
    this.emit({ e: 'sound', s: 'shulker.duplicate', x: ox, y: oy + 0.5, z: oz });
  }

  shulkerTeleport(e: Entity): boolean {
    const bx = Math.floor(e.x), by = Math.floor(e.y), bz = Math.floor(e.z);
    for (let i = 0; i < 5; i++) {
      const x = bx + this.rng.int(17) - 8, y = by + this.rng.int(17) - 8, z = bz + this.rng.int(17) - 8;
      if (y < 1 || y >= WORLD_HEIGHT - 1 || !this.store.isLoaded(x, z) || this.get(x, y, z) !== 0) continue;
      const f = this.attachFace(x, y, z);
      if (f < 0) continue;
      let blocked = false;
      for (const o of this.entities.values()) if (o !== e && o.kind === 'mob' && Math.abs(o.x - x - 0.5) < o.hw + 0.5 && Math.abs(o.z - z - 0.5) < o.hw + 0.5 && o.y < y + 1 && o.y + o.h > y) { blocked = true; break; }
      if (blocked) continue;
      this.emit({ e: 'particles', k: 'portal', x: e.x, y: e.y + 0.5, z: e.z });
      e.x = x + 0.5; e.y = y; e.z = z + 0.5; e.att = f; e.peek = 0; e.peekT = 0;
      this.emit({ e: 'sound', s: 'shulker.teleport', x: e.x, y: e.y + 0.5, z: e.z });
      return true;
    }
    return false;
  }

  private useFirework(p: SimPlayer, at: [number, number, number] | null): boolean {
    if (p.dead || this.now - (p.rocketAt ?? -1e9) < 400) return false;
    const st = heldStack(p.inv);
    if (!st || st.id !== I.FIREWORK_ROCKET) return false;
    p.rocketAt = this.now;
    if (p.mode !== 'creative') { consumeHeld(p.inv); this.emit({ e: 'inv', p }); }
    if (!at && p.flags & MF.GLIDE) { this.emit({ e: 'sound', s: 'firework.launch', x: p.x, y: p.y, z: p.z }); this.emit({ e: 'particles', k: 'firework', x: p.x, y: p.y, z: p.z }); return true; }
    const [x, y, z] = at ?? [p.x - Math.sin(p.yaw) * 1.5, p.y + 1.5, p.z - Math.cos(p.yaw) * 1.5];
    this.emit({ e: 'sound', s: 'firework.launch', x, y, z });
    this.fireworkShows.push({ x, y: y + 10 + this.rng.int(4), z, t: this.tickCount + 22 });
    return true;
  }

  private fireworkShows: { x: number; y: number; z: number; t: number }[] = [];

  levitate(p: SimPlayer, ticks: number): void {
    p.levT = this.tickCount + ticks;
    this.emit({ e: 'effect', p, k: 'levitation', t: ticks });
  }

  private tickFireball(e: Entity): void {
    if (e.age > 200) { this.entities.delete(e.id); this.emit({ e: 'remove', id: e.id, why: 'despawn' }); return; }
    const sp = Math.hypot(e.vx, e.vy, e.vz) || 1;
    const step = sp * DT;
    const dx = e.vx / sp, dy = e.vy / sp, dz = e.vz / sp;
    let hit = false;
    const wall = raycast(this.store, e.x, e.y, e.z, dx, dy, dz, step);
    if (wall && isSolid(wall.value)) hit = true;
    const small = (e.flags & 1) !== 0;
    if (!hit) for (const p of this.players.values()) {
      if (p.dead) continue;
      const r = small ? 0.5 : 0.9;
      if (Math.abs(p.x - e.x) < r && Math.abs(p.z - e.z) < r && e.y > p.y - (small ? 0.2 : 0.5) && e.y < p.y + (small ? 1.9 : 2.2)) {
        hit = true;
        if (small) { this.damage(p, 5 * DIFF_DMG[this.difficulty] / DIFF_DMG.normal, 'small_fireball', e.x, e.z); if (p.mode === 'survival' && !p.dead) p.fireT = Math.max(p.fireT, 100); }
        else this.damage(p, 6 * DIFF_DMG[this.difficulty] / DIFF_DMG.normal, 'fireball', e.x, e.z);
        break;
      }
    }
    if (!hit) for (const m of this.entities.values()) {
      if (m.kind !== 'mob' || m.id === e.shooter || m.health <= 0) continue;
      if (small && MOBS[m.type as MobType]?.fireImmune) continue;
      if (Math.abs(m.x - e.x) < m.hw + 0.5 && Math.abs(m.z - e.z) < m.hw + 0.5 && e.y > m.y - 0.5 && e.y < m.y + m.h + 0.5) { hit = true; if (small) { this.hurtMob(m, 5, null, dx, dz); m.fire = 100; } else this.hurtMob(m, m.type === 'wailer' && e.shooterP ? 1000 : 6, e.shooterP ?? null, dx, dz); break; }
    }
    if (hit && small) {
      this.entities.delete(e.id);
      this.emit({ e: 'remove', id: e.id, why: 'hit' });
      if (wall && !this.game) {
        const fx = wall.x + wall.nx, fy = wall.y + wall.ny, fz = wall.z + wall.nz;
        if (this.get(fx, fy, fz) === 0 && isSolid(this.get(fx, fy - 1, fz))) this.setBlock(fx, fy, fz, B.FIRE);
      }
      this.emit({ e: 'particles', k: 'smoke', x: e.x, y: e.y, z: e.z });
      return;
    }
    if (hit) {
      this.entities.delete(e.id);
      this.emit({ e: 'remove', id: e.id, why: 'hit' });
      this.explode(e.x, e.y, e.z, 1, { fire: true });
      return;
    }
    e.x += e.vx * DT; e.y += e.vy * DT; e.z += e.vz * DT;
    if (e.age % 4 === 0) this.emit({ e: 'particles', k: 'smoke', x: e.x, y: e.y, z: e.z });
  }

  private tickCube(e: Entity, def: MobDef, med: { lava: boolean; water: boolean }): void {
    if (e.y < -16) { this.entities.delete(e.id); this.emit({ e: 'remove', id: e.id, why: 'despawn' }); return; }
    if (e.attackCd! > 0) e.attackCd!--;
    const n = e.size ?? 1;
    let target = e.target ? this.players.get(e.target) : undefined;
    if (target && (target.dead || target.mode !== 'survival' || Math.hypot(target.x - e.x, target.z - e.z) > 24)) { target = undefined; e.target = null; }
    if (!target && e.age % 10 === 0 && this.difficulty !== 'peaceful') { const near = this.nearestPlayer(e, 16, true); if (near) { e.target = near.id; target = near; } }
    let flags = 0;
    if (target) { e.yaw = Math.atan2(-(target.x - e.x), -(target.z - e.z)); flags |= 16; }
    if (e.onGround) {
      e.vx *= 0.5; e.vz *= 0.5;
      e.wanderT = (e.wanderT ?? 0) - 1;
      if (e.wanderT! <= 0) {
        e.wanderT = target ? 10 + this.rng.int(10) : 20 + this.rng.int(40);
        if (!target) e.yaw += (this.rng.next() - 0.5) * 1.5;
        const sp = def.speed * (target ? 1.4 : 0.8) * (0.8 + n * 0.1);
        e.vx = -Math.sin(e.yaw) * sp; e.vz = -Math.cos(e.yaw) * sp;
        e.vy = 7 + n * 0.8 + (target ? 2 : 0);
        this.emit({ e: 'sound', s: 'mob.emberslime.jump', x: e.x, y: e.y, z: e.z });
      }
    }
    if (med.lava) e.vy = Math.min(e.vy + 30 * DT, 4); else e.vy = Math.max(e.vy - 28 * DT, -40);
    moveBody(e, e.vx * DT, e.vy * DT, e.vz * DT, this.store);
    if (target && e.attackCd! <= 0 && Math.abs(target.x - e.x) < e.hw + 0.4 && Math.abs(target.z - e.z) < e.hw + 0.4 && target.y < e.y + e.h && target.y + 1.8 > e.y) {
      e.attackCd = 20;
      flags |= 4;
      this.hitBy = { mob: e, breach: 0 };
      this.damage(target, Math.max(1, Math.round([0, 3, 4, 0, 6][n] * DIFF_DMG[this.difficulty] * 2) / 2), e.type, e.x, e.z);
      this.hitBy = null;
    }
    if (!e.onGround) flags |= 4096;
    if (e.hurt > 0) flags |= 1;
    flags |= (n === 4 ? 2 : n === 2 ? 1 : 0) << 13;
    e.flags = flags;
  }

  private tickBlaze(e: Entity, def: MobDef, med: { lava: boolean; water: boolean }): void {
    if (e.y < -16) { this.entities.delete(e.id); this.emit({ e: 'remove', id: e.id, why: 'despawn' }); return; }
    if (med.water && e.age % 10 === 0) { this.hurtMob(e, 1, null, 0, 0); if (!this.entities.has(e.id)) return; }
    if (e.attackCd! > 0) e.attackCd!--;
    let target = e.target ? this.players.get(e.target) : undefined;
    if (target && (target.dead || target.mode !== 'survival' || Math.hypot(target.x - e.x, target.y - e.y, target.z - e.z) > 48)) { target = undefined; e.target = null; }
    if (!target && e.age % 10 === 0 && this.difficulty !== 'peaceful') {
      const near = this.nearestPlayer(e, 24, true);
      if (near && this.lineOfSight(e, near)) { e.target = near.id; target = near; }
    }
    let flags = 0, wx = 0, wz = 0, wy = -2.28;
    if (target && this.difficulty !== 'peaceful') {
      flags |= 16;
      const dx = target.x - e.x, dz = target.z - e.z, dist = Math.hypot(dx, dz) || 1;
      e.yaw = Math.atan2(-dx, -dz);
      if (e.age % 5 === 0 || e.los === undefined) e.los = this.lineOfSight(e, target);
      if (e.y < target.y + 1.6 + (e.id % 3) * 0.5) wy = 2.4;
      if (dist < 2 && Math.abs(target.y - e.y) < 2.5) {
        wx = (dx / dist) * def.speed; wz = (dz / dist) * def.speed;
        if (e.attackCd! <= 0) {
          e.attackCd = 20; flags |= 4;
          this.hitBy = { mob: e, breach: 0 };
          this.damage(target, Math.max(1, Math.round(def.damage * DIFF_DMG[this.difficulty] * 2) / 2), e.type, e.x, e.z);
          this.hitBy = null;
        }
      } else if (!e.los || dist > 12) { wx = (dx / dist) * def.speed; wz = (dz / dist) * def.speed; }
      else if (dist < 5) { wx = -(dx / dist) * def.speed * 0.5; wz = -(dz / dist) * def.speed * 0.5; }
      if (e.los && dist < 24) {
        e.charge = (e.charge ?? 0) + 1;
        const c = e.charge;
        if (c === 1) this.emit({ e: 'sound', s: 'mob.flarewisp.warn', x: e.x, y: e.y + 1, z: e.z });
        if (c > 60 && c <= 72 && (c - 60) % 6 === 0 || c === 61) {
          const ox = e.x, oy = e.y + 1.3, oz = e.z;
          const spread = Math.sqrt(Math.hypot(target.x - ox, target.z - oz)) * 0.25;
          const tx = target.x - ox + (this.rng.next() - 0.5) * spread, ty = target.y + 1 - oy, tz = target.z - oz + (this.rng.next() - 0.5) * spread;
          const tl = Math.hypot(tx, ty, tz) || 1, sp = 14;
          const f: Entity = { id: this.allocId(), kind: 'fireball', type: 'fireball', x: ox - Math.sin(e.yaw) * 0.6, y: oy, z: oz - Math.cos(e.yaw) * 0.6, vx: (tx / tl) * sp, vy: (ty / tl) * sp, vz: (tz / tl) * sp, hw: 0.2, h: 0.4, onGround: false, hitH: false, hitCeil: false, yaw: e.yaw, health: 1, maxHealth: 1, hurt: 0, age: 0, fire: 0, flags: 1, shooter: e.id };
          this.entities.set(f.id, f);
          this.emit({ e: 'spawn', ent: f });
          this.emit({ e: 'sound', s: 'mob.flarewisp.shoot', x: ox, y: oy, z: oz });
        }
        if (c > 72) e.charge = -100;
      } else if ((e.charge ?? 0) > 0) e.charge = 0;
      if ((e.charge ?? 0) > 0) flags |= 2;
    } else {
      if (--e.wanderT! <= 0) { e.wanderT = 40 + this.rng.int(80); e.yaw += (this.rng.next() - 0.5) * 2.5; e.panic = this.rng.chance(0.5) ? 1 : 0; }
      if (e.panic) { wx = -Math.sin(e.yaw) * def.speed * 0.4; wz = -Math.cos(e.yaw) * def.speed * 0.4; }
      let ground = 0;
      for (let k = 1; k <= 3 && !ground; k++) if (isSolid(this.get(Math.floor(e.x), Math.floor(e.y) - k, Math.floor(e.z)))) ground = k;
      wy = ground && ground < 2 ? 1.2 : -1.2;
      if ((e.charge ?? 0) > 0) e.charge = 0;
    }
    if ((e.charge ?? 0) < 0) e.charge!++;
    e.vx += (wx - e.vx) * 0.12; e.vz += (wz - e.vz) * 0.12;
    e.vy += (wy - e.vy) * 0.12;
    moveBody(e, e.vx * DT, e.vy * DT, e.vz * DT, this.store);
    if (e.hitH && (wx || wz)) e.vy = 3;
    if (e.hurt > 0) flags |= 1;
    e.flags = flags;
    if (e.age % 160 === 0 && this.rng.chance(0.5)) this.emit({ e: 'sound', s: 'mob.flarewisp.ambient', x: e.x, y: e.y + 1, z: e.z });
    if (e.age % 6 === 0) this.emit({ e: 'particles', k: 'smoke', x: e.x + (this.rng.next() - 0.5) * 0.6, y: e.y + 0.6 + this.rng.next(), z: e.z + (this.rng.next() - 0.5) * 0.6 });
  }

  private tickStrider(e: Entity, def: MobDef, med: { lava: boolean; water: boolean }): void {
    if (e.y < -16) { this.entities.delete(e.id); this.emit({ e: 'remove', id: e.id, why: 'despawn' }); return; }
    let flags = 0;
    const below = blockId(this.get(Math.floor(e.x), Math.floor(e.y - 0.05), Math.floor(e.z)));
    const onLava = med.lava || below === B.LAVA;
    if (--e.wanderT! <= 0) { e.wanderT = 60 + this.rng.int(120); e.yaw += (this.rng.next() - 0.5) * 2.4; e.panic = this.rng.chance(0.75) ? 1 : 0; }
    const sp = e.panic ? def.speed : 0;
    let wx = -Math.sin(e.yaw) * sp, wz = -Math.cos(e.yaw) * sp;
    const rider = e.rider ? this.players.get(e.rider) : undefined;
    if (e.rider && (!rider || rider.dead || rider.riding !== e.id)) e.rider = undefined;
    if (rider) {
      e.panic = 0;
      if (heldStack(rider.inv)?.id === I.FUNGUS_STICK || (rider.inv.off[0]?.id === I.FUNGUS_STICK)) {
        const boost = (e.boost ?? 0) > 0 ? 1.8 : 1;
        const rs = (onLava ? 3.4 : 1.6) * boost * (onLava ? 1 : 0.8);
        e.yaw = rider.yaw;
        wx = -Math.sin(rider.yaw) * rs; wz = -Math.cos(rider.yaw) * rs;
      } else { wx = 0; wz = 0; }
    }
    if ((e.boost ?? 0) > 0) e.boost!--;
    if (onLava && !rider) {
      const ax = Math.floor(e.x + wx * 0.6), az = Math.floor(e.z + wz * 0.6), ay = Math.floor(e.y - 0.5);
      const ahead = blockId(this.get(ax, ay, az));
      if (ahead !== B.LAVA && !isSolid(this.get(ax, ay, az)) && !isSolid(this.get(ax, ay + 1, az))) { e.yaw += Math.PI * 0.7; wx = 0; wz = 0; }
    }
    e.vx += (wx - e.vx) * 0.3; e.vz += (wz - e.vz) * 0.3;
    if (med.lava) {
      const surf = Math.floor(e.y) + 1;
      e.vy = blockId(this.get(Math.floor(e.x), surf, Math.floor(e.z))) === B.LAVA ? 3 : Math.max(0, (surf - e.y) * 6);
      if (e.y > surf - 0.02 && e.vy <= 0) { e.vy = 0; e.y = Math.max(e.y, surf); }
    } else if (below === B.LAVA) e.vy = 0;
    else e.vy = Math.max(e.vy - 28 * DT, -40);
    if (e.hitH && e.onGround) e.vy = 8.2;
    moveBody(e, e.vx * DT, e.vy * DT, e.vz * DT, this.store);
    if (below === B.LAVA && e.y - Math.floor(e.y) < 0.05) { e.onGround = true; }
    if (!rider && Math.hypot(e.vx, e.vz) > 0.1) e.yaw = Math.atan2(-e.vx, -e.vz);
    if (!onLava) flags |= 32;
    if (e.saddled) flags |= 64;
    if (e.hurt > 0) flags |= 1;
    e.flags = flags;
  }

  private shootArrow(e: Entity, t: SimPlayer): void {
    const ox = e.x, oy = e.y + e.h * 0.85, oz = e.z;
    const dx = t.x - ox, dz = t.z - oz, dy = t.y + 1.2 - oy;
    const dist = Math.hypot(dx, dz);
    const speed = 32;
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
    if (held?.id === I.ENDER_PEARL) return this.throwPearl(p, yaw, pitch);
    if (held?.id === I.EYE_OF_ENDER) return this.throwEye(p, yaw, pitch);
    if (held?.id === I.EXPERIENCE_BOTTLE) return this.throwXpBottle(p, yaw, pitch);
    if (held?.id === I.FIREWORK_ROCKET) return this.useFirework(p, null);
    if (held?.id === I.CROSSBOW) return this.crossbow(p, held, power < 0, yaw, pitch);
    if (p.inv.off?.[0]?.id === I.ENDER_PEARL && (!held || (held.id !== I.BOW && getItem(held.id)?.places === undefined && !getItem(held.id)?.food))) return this.withOff(p, () => this.throwPearl(p, yaw, pitch));
    if (!held || held.id !== I.BOW) return false;
    if (this.now - (p.lastShot ?? -1e9) < 250) return false;
    power = Math.max(0, Math.min(1, power));
    if (power < 0.1) return false;
    const creative = p.mode === 'creative';
    const infinity = lvl(held, 'infinity') > 0;
    const offA = !creative && p.inv.off?.[0]?.id === I.ARROW;
    const ai = creative || offA ? -1 : p.inv.slots.findIndex((s) => s?.id === I.ARROW);
    if (!creative && !offA && ai < 0) return false;
    p.lastShot = this.now;
    if (!creative) {
      const st = offA ? p.inv.off[0]! : p.inv.slots[ai]!;
      if (!infinity && --st.count <= 0) { if (offA) p.inv.off[0] = null; else p.inv.slots[ai] = null; }
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
      const offA = !creative && p.inv.off?.[0]?.id === I.ARROW;
      const ai = creative || offA ? -1 : p.inv.slots.findIndex((s) => s?.id === I.ARROW);
      if (!creative && !offA && ai < 0) return false;
      if (offA) { const st = p.inv.off[0]!; if (--st.count <= 0) p.inv.off[0] = null; }
      else if (!creative) { const st = p.inv.slots[ai]!; if (--st.count <= 0) p.inv.slots[ai] = null; }
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
    const base = this.settings.maxHomes ?? 2;
    if (base <= 0) return 'Homes are turned off in this world.';
    const max = base + (p.supporter ? 2 : 0);
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
      case 'help': {
        const base = 'Teleports: /spawn, /sethome [name], /home [name], /delhome <name>, /homes, /tpa <player>, /tpahere <player>, /tpaccept, /tpdeny, /back. Other: /coords, /clearsel, /help.';
        if (!allowed) return base;
        return `${base} Admin and creative: /time set day|noon|night|midnight|<n>, /time cycle on|off, /weather clear|rain|thunder, /give <item> [n], /enchant <enchantment> [level], /tp <x> <y> <z> [overworld|nether] (~ for relative), /setspawn, /summon <creature> [n], /kill, /pos1, /pos2, /fill <block> [hollow|outline], /replace <from> <to>, /seed, /locate <${Object.keys(LOCATE_NAMES).join('|')}>, /gamerule <rule> [value]${p.op ? ', /gamemode survival|creative, /troll <prank> <player>' : ''}${p.op && this.serverMode ? ', /countdown <time> [label], /resetworld <time> confirm (owner)' : ''}.`;
      }
      case 'seed': if (this.serverMode && !p.op) return 'Only operators can see the seed on a server.'; return `Seed: ${this.seed}`;
      case 'gamerule': {
        const rules: Record<string, [() => string, (v: string) => string | null]> = {
          randomtickspeed: [() => String(this.settings.randomTickSpeed ?? 3), (v) => { const n = Math.floor(Number(v)); if (!Number.isFinite(n) || n < 0 || n > 64) return 'Use a number from 0 to 64.'; this.settings.randomTickSpeed = n; return null; }],
          dofiretick: [() => String(this.settings.fireTick !== false), (v) => { if (v !== 'true' && v !== 'false') return 'Use true or false.'; this.settings.fireTick = v === 'true'; return null; }],
          domobspawning: [() => String(this.settings.mobSpawning !== false), (v) => { if (v !== 'true' && v !== 'false') return 'Use true or false.'; this.settings.mobSpawning = v === 'true'; return null; }],
          simulationdistance: [() => String(this.simDistance()), (v) => { const n = Math.floor(Number(v)); if (!Number.isFinite(n) || n < 2 || n > 16) return 'Use a number from 2 to 16.'; this.settings.simDistance = n; this.tickingFor = -1; return null; }],
          mobcap: [() => String(this.settings.mobCap ?? MONSTER_CAP), (v) => { const n = Math.floor(Number(v)); if (!Number.isFinite(n) || n < 0 || n > 200) return 'Use a number from 0 to 200.'; this.settings.mobCap = n; return null; }],
          maxhomes: [() => String(this.settings.maxHomes ?? 2), (v) => { const n = Math.floor(Number(v)); if (!Number.isFinite(n) || n < 0 || n > 20) return 'Use a number from 0 to 20.'; this.settings.maxHomes = n; return null; }],
          allowtpa: [() => String(this.settings.tpa !== false), (v) => { if (v !== 'true' && v !== 'false') return 'Use true or false.'; this.settings.tpa = v === 'true'; return null; }],
          showminimap: [() => String(this.settings.allowMinimap !== false), (v) => { if (v !== 'true' && v !== 'false') return 'Use true or false.'; this.settings.allowMinimap = v === 'true'; return null; }],
          allowblueprints: [() => String(this.settings.allowBlueprints !== false), (v) => { if (v !== 'true' && v !== 'false') return 'Use true or false.'; this.settings.allowBlueprints = v === 'true'; return null; }],
          showcoordinates: [() => String(this.settings.allowCoords !== false), (v) => { if (v !== 'true' && v !== 'false') return 'Use true or false.'; this.settings.allowCoords = v === 'true'; return null; }],
          daylength: [() => String(this.settings.dayLength ?? DEFAULT_DAY_LENGTH), (v) => { const n = Number(v); if (!Number.isFinite(n) || n < 0.25 || n > 10) return 'Use a multiplier from 0.25 to 10 (3 means daytime lasts three times as long as Java).'; this.settings.dayLength = Math.round(n * 100) / 100; return null; }],
          nightlength: [() => String(this.settings.nightLength ?? DEFAULT_NIGHT_LENGTH), (v) => { const n = Number(v); if (!Number.isFinite(n) || n < 0.25 || n > 10) return 'Use a multiplier from 0.25 to 10 (1 is the Java night length).'; this.settings.nightLength = Math.round(n * 100) / 100; return null; }],
          dodaylightcycle: [() => String(this.settings.dayCycle), (v) => { if (v !== 'true' && v !== 'false') return 'Use true or false.'; this.settings.dayCycle = v === 'true'; return null; }],
        };
        const name = (parts[1] ?? '').toLowerCase();
        const rule = rules[name];
        if (!rule) return 'Rules: randomTickSpeed, doMobSpawning, simulationDistance, mobCap, doDaylightCycle, dayLength, nightLength, maxHomes, allowTpa, allowBlueprints, showMinimap, showCoordinates';
        if (parts[2] === undefined) return `Gamerule ${parts[1]} is currently set to: ${rule[0]()}`;
        if (!allowed) return need();
        const err = rule[1](parts[2].toLowerCase());
        if (err) return err;
        this.emit({ e: 'rules' });
        return `Gamerule ${parts[1]} is now set to: ${rule[0]()}`;
      }
      case 'locate': {
        if (!allowed) return need();
        const raw = (parts[1] === 'structure' ? parts[2] : parts[1]) ?? '';
        const kind = LOCATE_ALIASES[raw.toLowerCase().replace(/^minecraft:/, '').replace(/^#/, '')];
        if (!kind) return `Usage: /locate <${Object.keys(LOCATE_NAMES).join('|')}>`;
        const r = this.locateStructure(kind, p.x, p.z);
        if (!r) return `No ${LOCATE_NAMES[kind]} found nearby.`;
        const here = isNether(p.x) === r.nether;
        const dist = here ? ` (${Math.round(Math.hypot(r.x - p.x, r.z - p.z))} blocks away)` : '';
        return `Nearest ${LOCATE_NAMES[kind]} is at ${Math.floor(localX(r.x))} ${r.y === null ? '~' : r.y} ${Math.floor(r.z)}${r.nether ? ' in the Nether' : here ? '' : ' in the Overworld'}${dist}.`;
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
        const xyz = cmdXYZ(p, parts.slice(1, 4), parts[4]);
        if (!xyz) return 'Usage: /tp <x> <y> <z> [overworld|nether] (use ~ for relative) or /tp <player> or /tp <player> <player>';
        p.back = { x: p.x, y: p.y, z: p.z };
        [p.x, p.y, p.z] = xyz; p.peakY = p.y;
        this.emit({ e: 'tp', p });
        return `Teleported to ${+localX(p.x).toFixed(2)} ${+p.y.toFixed(2)} ${+p.z.toFixed(2)}${isNether(p.x) ? ' in the Nether' : ''}.`;
      }
      case 'spawn': {
        if (p.dead) return 'You cannot do that while dead.';
        this.teleportTo(p, this.spawn.x, this.spawn.y, this.spawn.z);
        return 'Teleported to the world spawn.';
      }
      case 'setspawn': {
        if (!allowed) return need();
        p.spawn = { x: p.x, y: p.y, z: p.z };
        return 'Personal spawn point set here.';
      }
      case 'summon': {
        if (!allowed) return need();
        const raw = (parts[1] ?? '').toLowerCase().replace(/^minecraft:/, '');
        const ALIAS: Record<string, MobType> = { sheep: 'woolhorn', pig: 'mudsnout', chicken: 'fernhen', zombie: 'hollowed', skeleton: 'rattlebone', spider: 'duskweaver', zombified_piglin: 'cinderhusk', zombified_hogman: 'cinderhusk', ghast: 'wailer', magma_cube: 'emberslime', strider: 'lavastrider', blaze: 'flarewisp', wither_skeleton: 'witherbone', piglin: 'piglin', piglin_brute: 'piglin_brute', hoglin: 'hoglin', zoglin: 'zoglin', enderman: 'voidstalker' };
        const t = (ALIAS[raw] ?? raw) as MobType;
        if (!MOBS[t] || MOBS[t].npc) return `Unknown creature. Try: ${[...Object.keys(ALIAS), 'villager'].join(', ')}`;
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
      case 'kill': if (!allowed) return need(); this.damage(p, 1000, 'kill', p.x, p.z, false, true); return '';
      case 'troll': case 'mischief': {
        if (!p.op) return need();
        if (!this.authoritative) return '';
        return this.mischief.run(p, parts);
      }
      case 'pos1': case 'pos2': {
        if (!allowed) return need();
        const i = cmd === 'pos1' ? 0 : 1;
        const xyz = parts.length >= 4 ? cmdXYZ(p, parts.slice(1, 4)) : [p.x, p.y - 1, p.z];
        if (!xyz) return 'Usage: /pos1 [x y z] (use ~ for relative)';
        p.sel[i] = xyz.map(Math.floor);
        return `Corner ${i + 1} set to ${localX(p.sel[i]![0])} ${p.sel[i]![1]} ${p.sel[i]![2]}.`;
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

export { cmdXYZ } from '../dimension';

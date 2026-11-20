import { CHUNK_SIZE, WORLD_HEIGHT, SEA_LEVEL, CHUNK_VOLUME } from '../constants';
import { Simplex, smoothstep, lerp } from '../noise';
import { Rng, hash2, hash3, hashFloat2, mix32 } from '../rng';
import { B, CB, makeBlock, X, XV, sp, SPECIES, terracottaId, bid, VINE_BODY, DL_TILT_SHIFT, SMALL_UPPER, DRIP_DOWN, SHRIEK_SUMMON, FACING_DIRS } from '../blocks';
import { I, toolId } from '../items';
import { BIOMES, Biome, BiomeId, biome } from './biomes';
import type { ItemStack } from '../inventory';
import { ArenaKind, arenaLayout, generateArenaChunk } from '../labs/minigames/arena';
import { VillagePlan, VILLAGE_REGION, planVillage, stampVillage } from './village';
import { GEN_LEVEL, LANDFORM_LEVEL, RIVER_LEVEL, BIOME_LEVEL, BIOME2_LEVEL, CAVE_LEVEL } from './genLevel';
import { NetherGen, type NetherBiome } from './nether';
import { isNether, isEnd, END_X } from '../dimension';
import { EndGen } from './end';
import { PortalPlan, PORTAL_GRID, planRuinedPortal, stampRuinedPortal } from './ruinedPortal';
import { TreeSet, megaJungle, megaSpruce, jungleVines, hangingVines, acacia, darkOak, cherry, mangrove, hugeMushroom, iceSpike } from './trees';
import { StructurePlan, STRONGHOLD_REGION, TRIAL_REGION, planStronghold, planTrial, stampStructure } from './structures';

export interface Column {
  height: number;
  biome: Biome;
  temp: number;
  humid: number;
  mountain: number;
  river: number;
  water?: number;
  wlv?: number;
}

export interface GenBlockEntity { x: number; y: number; z: number; type: 'chest' | 'spawner' | 'trial' | 'vault' | 'mob'; items: (ItemStack | null)[]; mob?: string; }
export interface GeneratedChunk { blocks: Uint32Array; entities: GenBlockEntity[]; special?: boolean; }
export interface GenOptions { secret?: number | null; climate?: number; studio?: boolean; }
export const STUDIO_FLOOR = 6, STUDIO_PLOT = 64;

const S = CHUNK_SIZE;
const M = 5;
const RG = 16;
const W = S + M * 2;

export class WorldGenerator {
  readonly seed: number;
  private nCont: Simplex; private nErode: Simplex; private nPeak: Simplex; private nTemp: Simplex; private nHum: Simplex;
  private nDetail: Simplex; private nHill: Simplex; private nRiver: Simplex; private nLake: Simplex; private nIsland: Simplex;
  private nCave1: Simplex; private nCave2: Simplex; private nCave3: Simplex; private nRavine: Simplex; private nRavMask: Simplex;
  private nPatch: Simplex;
  private nRidge: Simplex; private nWarp: Simplex; private nValley: Simplex; private nPlateau: Simplex; private nPlatH: Simplex;
  private nHilly: Simplex; private nRoll: Simplex; private nCrag: Simplex;
  private nVariety: Simplex; private nBand: Simplex; private nLush: Simplex; private nDrip: Simplex; private nDeep: Simplex;

  readonly arena: ArenaKind | null;
  private flatCol: Column | null = null;
  private villageCache = new Map<string, VillagePlan | null>();

  village(rx: number, rz: number): VillagePlan | null {
    if (this.arena || this.studio) return null;
    const k = `${rx},${rz}`;
    if (!this.villageCache.has(k)) {
      if (this.villageCache.size > 64) this.villageCache.clear();
      this.villageCache.set(k, planVillage(this.seed, rx, rz, (x, z) => this.columnV1(x, z)));
    }
    return this.villageCache.get(k)!;
  }

  villagesNear(x: number, z: number, r: number): VillagePlan[] {
    const out: VillagePlan[] = [];
    const R = VILLAGE_REGION;
    for (let rz = Math.floor((z - r - 80) / R); rz <= Math.floor((z + r + 80) / R); rz++) {
      for (let rx = Math.floor((x - r - 80) / R); rx <= Math.floor((x + r + 80) / R); rx++) {
        const v = this.village(rx, rz);
        if (!v) continue;
        if (v.bounds.x1 + r < x || v.bounds.x0 - r > x || v.bounds.z1 + r < z || v.bounds.z0 - r > z) continue;
        out.push(v);
      }
    }
    return out;
  }

  readonly oreSeed: number | null;
  private structCache = new Map<string, StructurePlan | null>();

  private structure(type: 'stronghold' | 'trial', rx: number, rz: number): StructurePlan | null {
    if (this.arena || this.studio || this.oreSeed === null) return null;
    const k = `${type[0]}${rx},${rz}`;
    if (!this.structCache.has(k)) {
      if (this.structCache.size > 96) this.structCache.clear();
      const sec = this.oreSeed;
      this.structCache.set(k, type === 'stronghold' ? planStronghold(sec, rx, rz, (x, z) => this.column(x, z).height) : planTrial(sec, rx, rz));
    }
    return this.structCache.get(k)!;
  }

  structuresNear(x0: number, z0: number, x1: number, z1: number): StructurePlan[] {
    const out: StructurePlan[] = [];
    if (this.arena || this.studio || this.oreSeed === null) return out;
    for (const [type, R, pad] of [['stronghold', STRONGHOLD_REGION, 0], ['trial', TRIAL_REGION, 0]] as const) {
      for (let rz = Math.floor((z0 - R / 2) / R); rz <= Math.floor((z1 + R / 2) / R); rz++) for (let rx = Math.floor((x0 - R / 2) / R); rx <= Math.floor((x1 + R / 2) / R); rx++) {
        const p = this.structure(type, rx, rz);
        if (!p) continue;
        const b = p.bounds;
        if (b.x1 + pad < x0 || b.x0 - pad > x1 || b.z1 + pad < z0 || b.z0 - pad > z1) continue;
        out.push(p);
      }
    }
    return out;
  }

  hasStructure(cx: number, cz: number): boolean {
    return this.structuresNear(cx * S, cz * S, cx * S + S - 1, cz * S + S - 1).length > 0;
  }

  locate(type: 'stronghold' | 'trial', x: number, z: number): StructurePlan | null {
    if (this.arena || this.studio || this.oreSeed === null) return null;
    const R = type === 'stronghold' ? STRONGHOLD_REGION : TRIAL_REGION;
    const crx = Math.floor(x / R), crz = Math.floor(z / R);
    let best: StructurePlan | null = null, bd = Infinity;
    for (let ring = 0; ring <= 4 && !best; ring++) for (let rz = crz - ring; rz <= crz + ring; rz++) for (let rx = crx - ring; rx <= crx + ring; rx++) {
      if (Math.max(Math.abs(rx - crx), Math.abs(rz - crz)) !== ring) continue;
      const p = this.structure(type, rx, rz);
      if (!p) continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  private nether: NetherGen | null = null;
  private endG: EndGen | null = null;
  endGen(): EndGen { return (this.endG ??= new EndGen(this.seed)); }
  netherBiome(x: number, z: number): NetherBiome { return (this.nether ??= new NetherGen(this.seed)).biome(x, z); }
  private portalPlans = new Map<string, PortalPlan | null>();

  ruinedPortal(rx: number, rz: number): PortalPlan | null {
    const k = `${rx},${rz}`;
    if (this.portalPlans.has(k)) return this.portalPlans.get(k)!;
    const p = planRuinedPortal(this.seed, rx, rz, (x, z) => this.columnV1(x, z));
    if (this.portalPlans.size > 64) this.portalPlans.clear();
    this.portalPlans.set(k, p);
    return p;
  }

  portalsNear(bx: number, bz: number): PortalPlan[] {
    const out: PortalPlan[] = [];
    const seen = new Set<string>();
    for (const [ox, oz] of [[-24, -24], [40, -24], [-24, 40], [40, 40]]) {
      const rx = Math.floor((bx + ox) / PORTAL_GRID), rz = Math.floor((bz + oz) / PORTAL_GRID);
      const k = `${rx},${rz}`;
      if (seen.has(k)) continue;
      seen.add(k);
      const p = this.ruinedPortal(rx, rz);
      if (p) out.push(p);
    }
    return out;
  }

  private readonly climate: number | undefined;
  readonly studio: boolean;
  private readonly ck: number;

  constructor(seed: number, arena: ArenaKind | null = null, opts?: GenOptions) {
    this.seed = seed >>> 0;
    this.climate = opts?.climate === undefined ? undefined : Math.max(0.5, Math.min(4, opts.climate));
    this.ck = this.climate ?? 1;
    this.studio = !!opts?.studio && !arena;
    this.arena = arena;
    this.oreSeed = opts && 'secret' in opts ? (opts.secret === null || opts.secret === undefined ? null : opts.secret >>> 0) : mix32(this.seed ^ 0x0a5e7c11);
    let k = 0;
    const mk = () => new Simplex(mix32(this.seed + 0x1234567 * ++k));
    this.nCont = mk(); this.nErode = mk(); this.nPeak = mk(); this.nTemp = mk(); this.nHum = mk();
    this.nDetail = mk(); this.nHill = mk(); this.nRiver = mk(); this.nLake = mk(); this.nIsland = mk();
    this.nCave1 = mk(); this.nCave2 = mk(); this.nCave3 = mk(); this.nRavine = mk(); this.nRavMask = mk();
    this.nPatch = mk();
    this.nRidge = mk(); this.nWarp = mk(); this.nValley = mk(); this.nPlateau = mk(); this.nPlatH = mk();
    this.nHilly = mk(); this.nRoll = mk(); this.nCrag = mk();
    this.nVariety = mk(); this.nBand = mk();
    this.nLush = mk(); this.nDrip = mk(); this.nDeep = mk();
  }

  private studioCol: Column | null = null;
  private raw = { h: 0, land: 0, swamp: 0, lake: 0, d: 0, hills: 0, h2: 0 };

  column(x: number, z: number): Column {
    if (this.studio && !isNether(x)) return this.studioCol ??= { height: STUDIO_FLOOR, biome: BIOMES.find((b) => b.id === 'plains') ?? BIOMES[0], temp: 0.6, humid: 0.5, mountain: 0, river: 0 };
    if (this.arena) return this.columnV1(x, z);
    const c1 = this.columnV1(x, z);
    if (this.lv >= RIVER_LEVEL && c1.river > 0.02) return this.riverColumn(x, z, c1);
    return this.columnV2(x, z, false, c1);
  }

  private columnV2(x: number, z: number, noRiver = false, pre?: Column): Column {
    const c1 = pre ?? this.columnV1(x, z, noRiver);
    if (this.lv < LANDFORM_LEVEL) return c1;
    const r = this.raw, h1 = r.h, land = r.land, sw = r.swamp, lk = r.lake, d = r.d, hills = r.hills;
    r.h2 = h1;
    let w = this.blendW(x, z);
    if (w <= 0) return c1;
    w *= this.siteAtten(x, z);
    if (w <= 0) { r.h = h1; r.d = d; r.h2 = h1; return c1; }
    const h2 = this.landform(x, z, c1, h1, land, sw, lk, d, hills);
    const h = h1 + (h2 - h1) * w;
    r.h = h1; r.d = d; r.h2 = h;
    const height = Math.max(4, Math.min(WORLD_HEIGHT - 12, Math.floor(h)));
    return height === c1.height ? c1 : { ...c1, height };
  }

  private landform(x: number, z: number, col: Column, h1: number, land: number, swampW: number, lakeW: number, d: number, hills: number): number {
    if (h1 < SEA_LEVEL - 0.5 && col.mountain < 0.05) return h1;
    const b = col.biome.id;
    if (b === 'ocean' || b === 'deep_ocean' || b === 'river' || b === 'warm_ocean') return h1;
    const mw = col.mountain, riverW = col.river;
    const coast = b === 'beach' || b === 'island' || b === 'mushroom_fields' ? 0 : smoothstep(SEA_LEVEL + 1, SEA_LEVEL + 5, h1);
    let h = h1;
    const wx = x + this.nWarp.fbm2(x / 160, z / 160, 2) * 38, wz = z + this.nWarp.fbm2(z / 160 + 31.7, x / 160 - 12.3, 2) * 38;
    if (mw > 0.01) {
      let ridge = 0, amp = 1, f = 1 / 430, sum = 0, prev = 1;
      for (let o = 0; o < 5; o++) {
        const n = 1 - Math.abs(this.nRidge.noise2(wx * f, wz * f));
        const v = n * n * prev;
        ridge += v * amp; sum += amp; prev = Math.min(1, v * 1.7);
        amp *= 0.48; f *= 2.1;
      }
      ridge /= sum;
      const mass = smoothstep(0.02, 0.6, mw);
      const crag = Math.abs(this.nCrag.fbm2(x / 17, z / 17, 2));
      let peak = SEA_LEVEL + 10 + mass * (8 + Math.pow(ridge, 1.25) * 92) + crag * 4 * ridge * mass + d * 3 + hills * 5;
      const vn = Math.abs(this.nValley.fbm2(wx / 260, wz / 260, 3));
      const valley = (1 - smoothstep(0.02, 0.22, vn)) * mass;
      peak = lerp(peak, Math.max(SEA_LEVEL + 8, Math.min(peak, SEA_LEVEL + 10 + ridge * 22 + d * 3)), valley * 0.8);
      if (peak > 124) peak = 124 + (peak - 124) * 0.55;
      h = lerp(h, Math.max(h * 0.4 + peak * 0.6, peak), smoothstep(0.01, 0.35, mw) * (1 - riverW * 0.7));
    }
    const flat = land * (1 - smoothstep(0.05, 0.45, mw)) * (1 - riverW) * (1 - swampW) * (1 - lakeW) * coast;
    if (flat > 0.01) {
      const hil = smoothstep(-0.15, 0.45, this.nHilly.fbm2(x / 520, z / 520, 2));
      const roll = this.nRoll.fbm2(wx / 85, wz / 85, 3);
      h += hil * roll * 11 * flat;
      const rv = Math.abs(this.nValley.fbm2(x / 330 + 77.1, z / 330 - 41.9, 3));
      const dale = (1 - smoothstep(0.03, 0.2, rv)) * flat;
      h = lerp(h, Math.max(SEA_LEVEL + 2.2, SEA_LEVEL + 2 + (h - SEA_LEVEL - 2) * 0.3), dale * 0.75);
      const pm = this.nPlateau.fbm2(x / 640, z / 640, 3);
      const mask = smoothstep(0.2, 0.3, pm) * flat * (b === 'swamp' || b === 'jungle' || b === 'mangrove_swamp' ? 0.3 : 1);
      if (mask > 0.01) {
        const top = SEA_LEVEL + 20 + this.nPlatH.fbm2(x / 280, z / 280, 2) * 14 + d * 1.5;
        const edge = smoothstep(0.24, 0.27, pm + this.nCrag.fbm2(x / 23, z / 23, 2) * 0.025);
        let t = lerp(h, Math.max(h, top), edge);
        const step = 6, fl = Math.floor(t / step) * step, fr = (t - fl) / step;
        t = fl + step * smoothstep(0.62, 0.88, fr);
        h = lerp(h, t, mask);
      }
    }
    if (h1 >= SEA_LEVEL + 1 && h < SEA_LEVEL + 1) h = SEA_LEVEL + 1;
    return h;
  }

  private blend: ArrayLike<number> | null = null;
  private bcx = 0;
  private bcz = 0;

  private blendW(x: number, z: number): number {
    const m = this.blend;
    if (!m) return 1;
    let best = 1e9;
    for (let i = 0; i < 49; i++) {
      if (!m[i] || m[i] >= LANDFORM_LEVEL) continue;
      const ox = (this.bcx + (i % 7) - 3) * S, oz = (this.bcz + Math.floor(i / 7) - 3) * S;
      const dx = x < ox ? ox - x : x > ox + S - 1 ? x - (ox + S - 1) : 0;
      const dz = z < oz ? oz - z : z > oz + S - 1 ? z - (oz + S - 1) : 0;
      const dd = Math.hypot(dx, dz);
      if (dd < best) best = dd;
    }
    return best >= 1e8 ? 1 : smoothstep(1, 28, best);
  }

  private riverBlendW(x: number, z: number): number {
    const m = this.blend;
    if (!m) return 1;
    let best = 1e9;
    for (let i = 0; i < 49; i++) {
      if (!m[i] || m[i] >= RIVER_LEVEL) continue;
      const ox = (this.bcx + (i % 7) - 3) * S, oz = (this.bcz + Math.floor(i / 7) - 3) * S;
      const dx = x < ox ? ox - x : x > ox + S - 1 ? x - (ox + S - 1) : 0;
      const dz = z < oz ? oz - z : z > oz + S - 1 ? z - (oz + S - 1) : 0;
      best = Math.min(best, Math.hypot(dx, dz));
    }
    return best >= 1e8 ? 1 : smoothstep(1, 28, best);
  }

  private hsCache = new Map<number, number>();

  private terrainAt(x: number, z: number): number {
    const lv = this.lv, bl = this.blend, st = this.sites;
    this.lv = GEN_LEVEL; this.blend = null; this.sites = null;
    try { this.columnV2(x, z, true); return this.raw.h2; } finally { this.lv = lv; this.blend = bl; this.sites = st; }
  }

  private hsCorner(gx: number, gz: number): number {
    if (this.hsCache.size > 8192) this.hsCache.clear();
    const k = (gx + 32768) * 65536 + (gz + 32768);
    let v = this.hsCache.get(k);
    if (v === undefined) { v = this.terrainAt(gx * RG, gz * RG); this.hsCache.set(k, v); }
    return v;
  }

  private smoothTerrain(x: number, z: number): number {
    const gx = Math.floor(x / RG), gz = Math.floor(z / RG), fx = x / RG - gx, fz = z / RG - gz;
    const a = this.hsCorner(gx, gz), b = this.hsCorner(gx + 1, gz), c = this.hsCorner(gx, gz + 1), d = this.hsCorner(gx + 1, gz + 1);
    return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz;
  }

  riverSurface(x: number, z: number): number {
    const hs = this.smoothTerrain(x, z);
    return SEA_LEVEL + Math.max(0, hs - SEA_LEVEL - 4) * 0.85 * this.riverBlendW(x, z);
  }

  private riverColumn(x: number, z: number, c1: Column): Column {
    const d = this.raw.d;
    const riverW = Math.min(1, c1.river / Math.max(0.05, this.raw.land * (1 - c1.mountain * 0.75)));
    const base = this.columnV2(x, z, true);
    const T = this.raw.h2;
    const Sf = this.riverSurface(x, z);
    const Sq = Math.floor(Sf);
    const core = smoothstep(0.35, 1, riverW);
    const bottom = Sq - (1 + 2.5 * core) + d * 0.6;
    let h = T + (Math.min(bottom, T) - T) * riverW;
    const wR = this.riverBlendW(x, z);
    if (wR < 1) { this.columnV2(x, z); h = this.raw.h2 + (h - this.raw.h2) * wR; }
    const height = Math.max(4, Math.min(WORLD_HEIGHT - 12, Math.floor(h)));
    const out: Column = { ...base, biome: c1.biome, river: c1.river, mountain: c1.mountain, height };
    if (height < Sq && riverW > 0.04 && Sq > SEA_LEVEL) {
      const gx = this.riverSurface(x + 1, z) - this.riverSurface(x - 1, z), gz = this.riverSurface(x, z + 1) - this.riverSurface(x, z - 1);
      const g = Math.hypot(gx, gz) * 0.5;
      const dEdge = (Sf - Sq) / Math.max(g, 1e-3);
      out.water = Sq;
      out.wlv = dEdge < 6 ? Math.min(6, Math.max(1, Math.ceil(6 - dEdge))) : 0;
    }
    return out;
  }

  riverCurrent(x: number, z: number): [number, number] | null {
    if (this.arena || this.studio || isNether(x)) return null;
    const lv = this.lv, bl = this.blend;
    this.lv = GEN_LEVEL; this.blend = null;
    try {
      const c = this.columnV1(x, z);
      if (c.river < 0.3) return null;
      const e = 2;
      const f = (px: number, pz: number) => this.nRiver.fbm2(px / 420, pz / 420, 4);
      const v = f(x, z), gx = (f(x + e, z) - f(x - e, z)) * Math.sign(v || 1), gz = (f(x, z + e) - f(x, z - e)) * Math.sign(v || 1);
      let tx = -gz, tz = gx;
      const tl = Math.hypot(tx, tz);
      if (tl < 1e-9) return null;
      tx /= tl; tz /= tl;
      const sx = this.smoothTerrain(x + 8, z) - this.smoothTerrain(x - 8, z), sz = this.smoothTerrain(x, z + 8) - this.smoothTerrain(x, z - 8);
      if (tx * sx + tz * sz > 0) { tx = -tx; tz = -tz; }
      return [tx, tz];
    } finally { this.lv = lv; this.blend = bl; }
  }

  private sites: { x0: number; z0: number; x1: number; z1: number }[] | null = null;

  private sitesNear(x0: number, z0: number, x1: number, z1: number): { x0: number; z0: number; x1: number; z1: number }[] {
    const out: { x0: number; z0: number; x1: number; z1: number }[] = [];
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, r = Math.max(x1 - x0, z1 - z0) / 2 + 40;
    for (const v of this.villagesNear(cx, cz, r)) out.push({ x0: v.bounds.x0 - 6, z0: v.bounds.z0 - 6, x1: v.bounds.x1 + 6, z1: v.bounds.z1 + 6 });
    for (const [ox, oz] of [[x0 - 40, z0 - 40], [x1 + 40, z0 - 40], [x0 - 40, z1 + 40], [x1 + 40, z1 + 40], [cx, cz]]) {
      const p = this.ruinedPortal(Math.floor(ox / PORTAL_GRID), Math.floor(oz / PORTAL_GRID));
      if (p && !out.some((q) => q.x0 === p.x - 14 && q.z0 === p.z - 14)) out.push({ x0: p.x - 14, z0: p.z - 14, x1: p.x + 14, z1: p.z + 14 });
    }
    return out;
  }

  private siteAtten(x: number, z: number): number {
    const list = this.sites ?? this.sitesNear(x, z, x, z);
    let a = 1;
    for (const q of list) {
      const dx = x < q.x0 ? q.x0 - x : x > q.x1 ? x - q.x1 : 0;
      const dz = z < q.z0 ? q.z0 - z : z > q.z1 ? z - q.z1 : 0;
      a = Math.min(a, smoothstep(0, 24, Math.hypot(dx, dz)));
      if (a <= 0) return 0;
    }
    return a;
  }

  columnV1(x: number, z: number, noRiver = false): Column {
    if (this.arena) return this.flatCol ??= { height: 64, biome: BIOMES.find((b) => b.id === 'plains') ?? BIOMES[0], temp: 0.6, humid: 0.5, mountain: 0, river: 0 };
    const c = this.nCont.fbm2(x / 900, z / 900, 4) * 1.4 + 0.18;
    const e = this.nErode.fbm2(x / 480, z / 480, 3);
    const p = 1 - Math.abs(this.nPeak.fbm2(x / 230, z / 230, 4));
    const cl = this.climate !== undefined;
    const temp = cl ? this.nTemp.fbm2(x / (820 * this.ck), z / (820 * this.ck), 2) * 1.4 : this.nTemp.fbm2(x / 820, z / 820, 3) * 1.3;
    const humid = cl ? this.nHum.fbm2(x / (700 * this.ck), z / (700 * this.ck), 2) * 1.4 : this.nHum.fbm2(x / 700, z / 700, 3) * 1.3;
    const d = this.nDetail.fbm2(x / 48, z / 48, 3);
    const hills = this.nHill.fbm2(x / 140, z / 140, 4);

    const land = smoothstep(-0.32, -0.05, c);
    const deep = smoothstep(-0.55, -0.85, c);
    let oceanH = SEA_LEVEL - 12 + d * 5 - deep * 14;
    const isl = this.nIsland.fbm2(x / 95, z / 95, 3);
    if (isl > 0.42) oceanH = lerp(oceanH, SEA_LEVEL + 4 + (isl - 0.42) * 30, smoothstep(0.42, 0.55, isl) * (1 - land));
    const landH = SEA_LEVEL + 4 + hills * 9 + d * 3 + smoothstep(-0.05, 0.4, c) * 6;
    const mw = smoothstep(0.12, 0.5, e) * land;
    const mountainH = SEA_LEVEL + 16 + p * p * 74 + d * 6 + hills * 6;
    let h = lerp(oceanH, landH, land);
    h = lerp(h, mountainH, mw);

    const swampW = smoothstep(0.3, 0.55, humid) * smoothstep(-0.15, 0.15, temp) * (1 - smoothstep(0.35, 0.6, temp)) * (1 - mw) * land;
    h = lerp(h, SEA_LEVEL + 0.6 + d * 1.6, swampW * 0.85);

    const rv = Math.abs(this.nRiver.fbm2(x / 420, z / 420, 4));
    const riverW = noRiver ? 0 : (1 - smoothstep(0.012, 0.05, rv)) * land * (1 - mw * 0.75);
    h = lerp(h, SEA_LEVEL - 3.5 + d, riverW);

    const lk = this.nLake.fbm2(x / 150, z / 150, 3);
    const lakeW = smoothstep(0.5, 0.68, lk) * land * (1 - mw) * (1 - swampW);
    h = lerp(h, SEA_LEVEL - 5 + d * 2, lakeW);

    const height = Math.max(4, Math.min(WORLD_HEIGHT - 12, Math.floor(h)));
    const rw = this.raw; rw.h = h; rw.land = land; rw.swamp = swampW; rw.lake = lakeW; rw.d = d; rw.hills = hills;

    let id: BiomeId;
    if (height < SEA_LEVEL - 1 && land < 0.5) id = height < SEA_LEVEL - 18 ? 'deep_ocean' : 'ocean';
    else if (riverW > 0.55 && height < SEA_LEVEL + 1) id = temp < -0.45 ? 'snowy_tundra' : 'river';
    else if (land < 0.5 && height >= SEA_LEVEL + 2) id = 'island';
    else if (height <= SEA_LEVEL + 2 && land < 0.85 && temp > -0.45 && swampW < 0.4) id = 'beach';
    else if (mw > 0.45) id = (height > 112 && !(cl && temp > 0.25)) || temp < -0.3 ? 'snowy_mountains' : 'mountains';
    else if (swampW > 0.4) id = 'swamp';
    else if (temp > 0.42) id = humid < 0.05 ? 'desert' : humid > 0.25 ? 'jungle' : 'plains';
    else if (temp < -0.45) id = humid > -0.1 ? 'taiga' : 'snowy_tundra';
    else if (temp < -0.2 && humid > 0.1) id = 'taiga';
    else if (humid > 0.08) id = d > 0.25 ? 'birch_forest' : 'forest';
    else id = 'plains';
    if (this.lv >= BIOME_LEVEL) id = this.refineBiome(id, x, z, temp, humid, height);
    if (this.lv >= BIOME2_LEVEL) id = this.refineBiome2(id, x, z, temp, height);

    return { height, biome: biome(id), temp, humid, mountain: mw, river: riverW };
  }

  private refineBiome(id: BiomeId, x: number, z: number, temp: number, humid: number, height: number): BiomeId {
    if (id !== 'plains' && id !== 'forest' && id !== 'birch_forest' && id !== 'desert' && id !== 'jungle' && id !== 'taiga') return id;
    if (temp > 0.42) {
      if (humid < -0.2 && this.nVariety.fbm2(x / (360 * this.ck) + 51, z / (360 * this.ck), 2) + (height > SEA_LEVEL + 9 ? 0.12 : 0) > 0.22) return 'badlands';
      if (humid < 0.05) return 'desert';
      if (humid > 0.19) return 'jungle';
      return 'savanna';
    }
    if (id === 'taiga') return humid > 0.3 ? 'old_growth_taiga' : 'taiga';
    if ((id === 'forest' || id === 'birch_forest') && humid > 0.34) return 'dark_forest';
    if ((id === 'plains' || id === 'forest') && this.nVariety.fbm2(x / (420 * this.ck), z / (420 * this.ck), 2) > 0.42) return 'meadow';
    return id;
  }

  private refineBiome2(id: BiomeId, x: number, z: number, temp: number, height: number): BiomeId {
    switch (id) {
      case 'ocean': return temp > 0.42 ? 'warm_ocean' : id;
      case 'island': return this.nVariety.fbm2(x / (260 * this.ck) - 300, z / (260 * this.ck) + 170, 2) > 0.18 ? 'mushroom_fields' : id;
      case 'snowy_tundra': return this.nVariety.fbm2(x / (300 * this.ck) + 400, z / (300 * this.ck), 2) > 0.22 ? 'ice_spikes' : id;
      case 'swamp': return temp > 0.25 ? 'mangrove_swamp' : id;
      case 'forest': case 'meadow': case 'plains': case 'birch_forest':
        return height > SEA_LEVEL + 13 && this.nVariety.fbm2(x / (380 * this.ck) + 200, z / (380 * this.ck) - 90, 2) > 0.24 ? 'cherry_grove' : id;
      default: return id;
    }
  }

  private bandAt(y: number, x: number, z: number): number {
    const k = y + Math.round(this.nBand.noise2(x / 140, z / 140) * 2.5);
    const h = hash2(k, 0, this.seed ^ 0xba4d) % 13;
    const pal = [B.TERRACOTTA, terracottaId('orange'), B.TERRACOTTA, terracottaId('yellow'), terracottaId('brown'), B.TERRACOTTA, terracottaId('red'), terracottaId('white'), B.TERRACOTTA, terracottaId('light_gray'), terracottaId('orange'), B.TERRACOTTA, terracottaId('brown')];
    return pal[h];
  }

  heightAt(x: number, z: number): number {
    return this.column(x, z).height;
  }

  surface(col: Column, wx: number, wz: number, slope: number): [number, number, number] {
    const h = col.height;
    const b = col.biome.id;
    const patch = this.nPatch.noise2(wx / 9, wz / 9);
    let top: number = B.GRASS, filler: number = B.DIRT, depth = 3 + (hash2(wx, wz, this.seed) & 1);
    const underwater = h < (col.water ?? SEA_LEVEL);
    if (b === 'desert') { top = B.SAND; filler = B.SAND; depth = 4; }
    else if (b === 'beach' || b === 'island' && h <= SEA_LEVEL + 2) { top = B.SAND; filler = B.SAND; depth = 3; }
    else if (b === 'snowy_tundra' || b === 'taiga' && col.temp < -0.5) { top = B.SNOWY_GRASS; }
    else if (b === 'snowy_mountains') {
      if (slope > 4) { top = B.STONE; filler = B.STONE; }
      else if (h > 92 || slope > 1) { top = B.SNOW; filler = B.SNOW; depth = 2 + (hash2(wx, wz, this.seed) & 1); }
      else top = B.SNOWY_GRASS;
    } else if (b === 'mountains') {
      if (slope > 4) { top = B.STONE; filler = B.STONE; }
      else if (h > 104) { top = B.SNOW; filler = B.SNOW; depth = 2; }
      else if (patch > 0.55) { top = B.GRAVEL; filler = B.GRAVEL; }
    } else if (b === 'swamp' && patch > 0.3) { top = B.MUD; filler = B.MUD; }
    else if (b === 'savanna' && patch > 0.42) top = sp(B.DIRT, SPECIES.ACACIA);
    else if (b === 'badlands') { top = sp(B.SAND, 1); filler = B.TERRACOTTA; depth = 2; }
    else if (b === 'old_growth_taiga') { if (patch > -0.15) top = patch > 0.55 ? sp(B.DIRT, 1) : sp(B.DIRT, 2); }
    else if (b === 'mushroom_fields') top = X(XV.MYCELIUM);
    else if (b === 'ice_spikes') { top = B.SNOW; filler = B.DIRT; }
    else if (b === 'mangrove_swamp') { top = patch > -0.2 ? B.MUD : B.GRASS; filler = B.MUD; depth = 4; }
    if (this.lv >= LANDFORM_LEVEL && slope >= 5 && !underwater && b !== 'desert' && b !== 'beach') { top = B.STONE; filler = B.STONE; }
    if (underwater) {
      if (b === 'ocean' || b === 'deep_ocean') { top = h < SEA_LEVEL - 16 ? B.GRAVEL : patch > 0.4 ? B.CLAY : B.SAND; filler = B.SAND; }
      else if (b === 'warm_ocean') { top = B.SAND; filler = B.SAND; }
      else if (b === 'mangrove_swamp') { top = B.MUD; filler = B.MUD; }
      else if (b === 'mushroom_fields') { top = B.SAND; filler = B.SAND; }
      else if (b === 'river' || b === 'swamp') { top = patch > 0.35 ? B.CLAY : patch < -0.4 ? B.GRAVEL : B.SAND; filler = B.DIRT; if (b === 'swamp') top = patch > 0 ? B.MUD : B.DIRT; }
      else if (top === B.GRASS || top === B.SNOWY_GRASS) { top = patch > 0.2 ? B.SAND : patch < -0.3 ? B.CLAY : B.DIRT; }
      else if (top === B.SNOW) top = B.STONE;
    }
    return [top, filler, depth];
  }

  private lv = GEN_LEVEL;

  generate(cx: number, cz: number, level = GEN_LEVEL, old: ArrayLike<number> | null = null): GeneratedChunk {
    if (this.arena) return { blocks: generateArenaChunk(this.arena, cx, cz), entities: [] };
    if (this.studio && !isNether(cx * S) && !isEnd(cx * S + S - 1)) return { blocks: studioChunk(cx, cz), entities: [] };
    if (isNether(cx * S)) return (this.nether ??= new NetherGen(this.seed)).generate(cx, cz, level);
    if (isEnd(cx * S + S - 1)) return this.endGen().generate(cx, cz);
    this.lv = level;
    this.blend = old && Array.prototype.some.call(old, (v: number) => v) ? old : null;
    this.bcx = cx; this.bcz = cz;
    try {
      if (level >= LANDFORM_LEVEL) this.sites = this.sitesNear(cx * S - M, cz * S - M, cx * S + S + M, cz * S + S + M);
      return this.generateOverworld(cx, cz);
    } finally {
      this.lv = GEN_LEVEL; this.blend = null; this.sites = null;
    }
  }

  private generateOverworld(cx: number, cz: number): GeneratedChunk {
    const blocks = new Uint32Array(CHUNK_VOLUME);
    const entities: GenBlockEntity[] = [];
    const bx = cx * S, bz = cz * S;
    const cols: Column[] = new Array(W * W);
    for (let z = 0; z < W; z++) for (let x = 0; x < W; x++) cols[z * W + x] = this.column(bx + x - M, bz + z - M);
    const colAt = (lx: number, lz: number) => cols[(lz + M) * W + (lx + M)];
    const rng = new Rng(hash2(cx, cz, this.seed ^ 0x51ed270b));

    const set = (x: number, y: number, z: number, v: number) => {
      if (x < 0 || x >= S || z < 0 || z >= S || y < 0 || y >= WORLD_HEIGHT) return;
      blocks[(y * S + z) * S + x] = v;
    };
    const get = (x: number, y: number, z: number) => {
      if (x < 0 || x >= S || z < 0 || z >= S || y < 0 || y >= WORLD_HEIGHT) return -1;
      return blocks[(y * S + z) * S + x];
    };

    for (let z = 0; z < S; z++) {
      for (let x = 0; x < S; x++) {
        const col = colAt(x, z);
        const h = col.height;
        const wx = bx + x, wz = bz + z;
        const slope = Math.max(
          Math.abs(colAt(x + 1, z).height - h), Math.abs(colAt(x - 1, z).height - h),
          Math.abs(colAt(x, z + 1).height - h), Math.abs(colAt(x, z - 1).height - h),
        );
        const b = col.biome.id;
        const [top, filler, depth] = this.surface(col, wx, wz, slope);
        set(x, 0, z, makeBlock(B.BEDROCK));
        for (let y = 1; y <= h; y++) {
          let v: number;
          if (y <= 3 && (hash2(wx * 7 + y, wz, this.seed) & 3) < 4 - y) v = B.BEDROCK;
          else if (y === h) v = b === 'badlands' && slope >= 3 ? this.bandAt(y, wx, wz) : top;
          else if (y > h - depth) v = filler;
          else if (b === 'badlands' && y >= SEA_LEVEL - 6 && y > h - 26) v = this.bandAt(y, wx, wz);
          else if (b === 'desert' && y > h - depth - 4) v = B.SANDSTONE;
          else if ((b === 'beach') && y > h - depth - 2) v = B.SANDSTONE;
          else v = B.STONE;
          set(x, y, z, v);
        }
        for (let y = h + 1; y <= SEA_LEVEL; y++) set(x, y, z, B.WATER);
        if (h < SEA_LEVEL && col.biome.cold) set(x, SEA_LEVEL, z, B.ICE);
        if (col.water !== undefined && col.water > SEA_LEVEL) {
          for (let y = Math.max(h, SEA_LEVEL) + 1; y < col.water; y++) set(x, y, z, B.WATER);
          set(x, col.water, z, col.wlv ? makeBlock(B.WATER, col.wlv) : col.biome.cold ? B.ICE : B.WATER);
        }
      }
    }
    if (this.lv >= RIVER_LEVEL) this.shapeRiverBanks(cols, colAt, set, get);

    this.carveCaves(cx, cz, blocks, colAt);
    if (this.lv >= CAVE_LEVEL) this.decorateCaves(cx, cz, blocks, colAt);
    this.placeOres(rng, blocks, colAt, cx, cz);
    this.placeFeatures(cx, cz, cols, set, get, entities);
    const structs = this.structuresNear(bx, bz, bx + S - 1, bz + S - 1);
    for (const p of structs) stampStructure(p, this.oreSeed!, bx, bz, S, set, entities, this.lv);
    for (const v of this.villagesNear(bx + 8, bz + 8, 12)) stampVillage(v, bx, bz, S, set, get, (x, z) => this.column(x, z), entities, this.lv);
    if (this.lv >= 5) for (const pp of this.portalsNear(bx, bz)) stampRuinedPortal(pp, bx, bz, S, set, get, entities);
    if (this.lv >= BIOME_LEVEL) this.placeBoulders(cx, cz, cols, set);
    this.placeVegetation(cx, cz, rng, set, get, colAt);
    this.placeWaterfalls(rng, set, get, colAt);
    return structs.length ? { blocks, entities, special: true } : { blocks, entities };
  }

  private carveCaves(cx: number, cz: number, blocks: Uint32Array, colAt: (x: number, z: number) => Column): void {
    const GX = 5, GY = Math.ceil(WORLD_HEIGHT / 4) + 1;
    const f1 = new Float32Array(GX * GX * GY), f2 = new Float32Array(GX * GX * GY), f3 = new Float32Array(GX * GX * GY);
    const bx = cx * S, bz = cz * S;
    for (let gy = 0; gy < GY; gy++) for (let gz = 0; gz < GX; gz++) for (let gx = 0; gx < GX; gx++) {
      const wx = bx + gx * 4, wy = gy * 4, wz = bz + gz * 4;
      const i = (gy * GX + gz) * GX + gx;
      f1[i] = this.nCave1.noise3(wx / 42, wy / 26, wz / 42);
      f2[i] = this.nCave2.noise3(wx / 42 + 100, wy / 26, wz / 42 - 100);
      f3[i] = this.nCave3.fbm3(wx / 72, wy / 48, wz / 72, 2);
    }
    const sample = (f: Float32Array, x: number, y: number, z: number) => {
      const gx = x >> 2, gy = y >> 2, gz = z >> 2;
      const tx = (x & 3) / 4, ty = (y & 3) / 4, tz = (z & 3) / 4;
      const i000 = (gy * GX + gz) * GX + gx;
      const dy = GX * GX, dz = GX;
      const c00 = f[i000] + (f[i000 + 1] - f[i000]) * tx;
      const c01 = f[i000 + dz] + (f[i000 + dz + 1] - f[i000 + dz]) * tx;
      const c10 = f[i000 + dy] + (f[i000 + dy + 1] - f[i000 + dy]) * tx;
      const c11 = f[i000 + dy + dz] + (f[i000 + dy + dz + 1] - f[i000 + dy + dz]) * tx;
      const c0 = c00 + (c01 - c00) * tz;
      const c1 = c10 + (c11 - c10) * tz;
      return c0 + (c1 - c0) * ty;
    };
    for (let z = 0; z < S; z++) for (let x = 0; x < S; x++) {
      const col = colAt(x, z);
      const h = col.height;
      const wx = bx + x, wz = bz + z;
      const wet = h < SEA_LEVEL + 2;
      const topLimit = wet ? h - 6 : h + 1;
      const rav = Math.abs(this.nRavine.fbm2(wx / 260, wz / 260, 2));
      const ravMask = this.nRavMask.noise2(wx / 600, wz / 600);
      const ravine = !wet && ravMask > 0.35 && rav < 0.018 * (ravMask - 0.2) * 3;
      const ravBottom = Math.max(6, h - 46 + Math.floor(this.nDetail.noise2(wx / 20, wz / 20) * 6));
      for (let y = 4; y <= topLimit && y < WORLD_HEIGHT - 1; y++) {
        const idx = (y * S + z) * S + x;
        const cur = bid(blocks[idx]);
        if (cur === B.BEDROCK || cur === B.WATER || cur === 0) continue;
        let carve = false;
        if (ravine && y >= ravBottom) carve = true;
        else {
          const a = sample(f1, x, y, z), b2 = sample(f2, x, y, z);
          const depthFade = y > h - 4 ? 0.0028 : 0.0055;
          if (a * a + b2 * b2 < depthFade) carve = true;
          else if (y < h - 10 && y < 70) {
            const cheese = sample(f3, x, y, z);
            if (cheese > 0.52 - (y < 30 ? 0.06 : 0)) carve = true;
          }
        }
        if (carve) {
          if (y <= h && y > 0) {
            const above = y + 1 < WORLD_HEIGHT ? bid(blocks[idx + S * S]) : 0;
            if (above === B.WATER || above === B.SAND || above === B.GRAVEL && y > h - 3) continue;
          }
          blocks[idx] = y <= 10 ? B.LAVA : 0;
        }
      }
      for (let y = h; y > 1; y--) {
        const idx = (y * S + z) * S + x;
        const id = bid(blocks[idx]);
        if (id === 0) continue;
        if (id === B.DIRT && y < h && (bid(blocks[idx + S * S])) === 0) {
          const top = col.biome.cold ? B.SNOWY_GRASS : B.GRASS;
          if (y > SEA_LEVEL) blocks[idx] = top;
        }
        break;
      }
    }
  }

  caveKind(wx: number, wy: number, wz: number, h: number): number {
    if (this.arena) return 0;
    if (wy <= 26 && h > 70 && this.nDeep.noise2(wx / 230, wz / 230) > 0.4) return 3;
    if (wy > h - 7 || wy < 6) return 0;
    if (this.nLush.noise2(wx / 190, wz / 190) > 0.42) return 1;
    if (this.nDrip.noise2(wx / 170 + 300, wz / 170 - 200) > 0.42) return 2;
    return 0;
  }

  caveBiomeName(x: number, y: number, z: number, lv?: number): string | null {
    const prev = this.lv;
    this.lv = lv ?? GEN_LEVEL;
    try {
      if (this.lv < CAVE_LEVEL) return null;
      const h = this.column(Math.floor(x), Math.floor(z)).height;
      if (y > h - 4) return null;
      const k = this.caveKind(Math.floor(x), Math.floor(y), Math.floor(z), h);
      return k === 1 ? 'Verdant Hollow' : k === 2 ? 'Fangspire Caverns' : k === 3 ? 'The Hushdeep' : null;
    } finally { this.lv = prev; }
  }

  private decorateCaves(cx: number, cz: number, blocks: Uint32Array, colAt: (x: number, z: number) => Column): void {
    const bx = cx * S, bz = cz * S;
    const G = X(XV.GRANITE), D = X(XV.DIORITE), A = X(XV.ANDESITE), DRIP = X(XV.DRIPSTONE_BLOCK);
    const DS = makeBlock(CB.DEEPSLATE), MOSS = makeBlock(CB.MOSS_BLOCK);
    const host = (v: number) => v === B.STONE || v === B.DIRT || v === B.GRAVEL || v === B.TUFF || v === G || v === D || v === A || v === DS || v === B.CLAY;
    const at = (x: number, y: number, z: number) => (x < 0 || x >= S || z < 0 || z >= S || y < 0 || y >= WORLD_HEIGHT ? -1 : blocks[(y * S + z) * S + x]);
    const put = (x: number, y: number, z: number, v: number) => { if (x >= 0 && x < S && z >= 0 && z < S && y > 0 && y < WORLD_HEIGHT) blocks[(y * S + z) * S + x] = v; };
    const drip = (down: boolean, t: number) => makeBlock(CB.POINTED_DRIPSTONE, (down ? DRIP_DOWN : 0) | t);
    const thick = (k: number, len: number) => (k === len - 1 ? 1 : k === len - 2 ? 2 : k === 0 ? 4 : 3);
    for (let z = 0; z < S; z++) for (let x = 0; x < S; x++) {
      const h = colAt(x, z).height, wx = bx + x, wz = bz + z;
      const top = Math.min(h - 5, WORLD_HEIGHT - 3);
      if (this.caveKind(wx, 20, wz, h) === 3) for (let y = 4; y <= 26; y++) { const i = (y * S + z) * S + x; if (host(blocks[i]) && blocks[i] !== B.CLAY) blocks[i] = DS; }
      for (let y = 5; y <= top; y++) {
        if (blocks[(y * S + z) * S + x] !== 0) continue;
        const kind = this.caveKind(wx, y, wz, h);
        if (!kind) continue;
        const hh = hash3(wx, y, wz, this.seed ^ 0x3c6ef372);
        const r = (hh & 0xffff) / 65536, r2 = ((hh >>> 16) & 0xffff) / 65536;
        const below = at(x, y - 1, z), above = at(x, y + 1, z);
        const floor = host(below), ceil = host(above);
        if (kind === 1) {
          if (floor) {
            const pool = this.nLush.noise2(wx / 9 + 50, wz / 9 - 80) > 0.45;
            let ground: number = MOSS;
            if (pool) {
              let closed = host(at(x, y - 2, z));
              for (const [dx, dz] of FACING_DIRS) { const n = at(x + dx, y - 1, z + dz); if (n !== B.WATER && !host(n)) closed = false; }
              if (closed) { put(x, y - 1, z, B.WATER); put(x, y - 2, z, B.CLAY); continue; }
              ground = B.CLAY;
            }
            if (ground === B.CLAY || r2 < 0.9) put(x, y - 1, z, ground);
            if (r < 0.28) put(x, y, z, makeBlock(CB.MOSS_CARPET));
            else if (r < 0.38) put(x, y, z, B.TALL_GRASS);
            else if (r < 0.41) put(x, y, z, makeBlock(CB.AZALEA));
            else if (r < 0.425) put(x, y, z, makeBlock(CB.FLOWERING_AZALEA));
            else if (r < 0.46 && at(x, y + 1, z) === 0) { const f = hh & 3; put(x, y, z, makeBlock(CB.SMALL_DRIPLEAF, f << 1)); put(x, y + 1, z, makeBlock(CB.SMALL_DRIPLEAF, SMALL_UPPER | (f << 1))); }
            else if (r < 0.5) {
              const f = (hh >>> 3) & 3; let n = 1 + Math.floor(r2 * 3);
              while (n > 1 && at(x, y + n - 1, z) !== 0) n--;
              for (let k = 0; k < n - 1; k++) put(x, y + k, z, makeBlock(CB.BIG_DRIPLEAF_STEM, f));
              put(x, y + n - 1, z, makeBlock(CB.BIG_DRIPLEAF, f));
            }
          } else if (ceil) {
            if (r2 < 0.7) put(x, y + 1, z, MOSS);
            if (r < 0.11) {
              const len = 1 + Math.floor(r2 * 6);
              for (let k = 0; k < len && at(x, y - k, z) === 0; k++) {
                const lit = ((hh >>> (k + 4)) & 7) === 0;
                put(x, y - k, z, makeBlock(lit ? CB.CAVE_VINES_LIT : CB.CAVE_VINES, k ? VINE_BODY : 0));
              }
            } else if (r < 0.122) put(x, y, z, makeBlock(CB.SPORE_BLOSSOM));
          } else if (r < 0.03) {
            for (let f = 0; f < 4; f++) { const [dx, dz] = FACING_DIRS[f]; if (host(at(x + dx, y, z + dz))) { put(x, y, z, makeBlock(CB.GLOW_LICHEN, f)); break; } }
          }
        } else if (kind === 2) {
          if (floor && r2 < 0.75) put(x, y - 1, z, DRIP);
          if (ceil && r2 < 0.75) put(x, y + 1, z, DRIP);
          if (ceil && r < 0.1) {
            let len = 1 + Math.floor(r2 * 5);
            let gap = 0;
            while (gap < 10 && at(x, y - gap, z) === 0) gap++;
            len = Math.min(len, gap);
            const mite = host(at(x, y - gap, z)) || at(x, y - gap, z) === DRIP;
            const up = mite && (hh >>> 20) % 10 < 6 ? Math.min(1 + ((hh >>> 24) & 3), gap - len) : 0;
            const merge = mite && up > 0 && len + up === gap;
            for (let k = 0; k < len; k++) put(x, y - k, z, drip(true, merge && k === len - 1 ? 0 : thick(k, len)));
            for (let k = 0; k < up; k++) put(x, y - gap + 1 + k, z, drip(false, merge && k === up - 1 ? 0 : thick(k, up)));
          } else if (floor && r < 0.14 && at(x, y, z) === 0) {
            let len = 1 + Math.floor(r2 * 3);
            while (len > 1 && at(x, y + len - 1, z) !== 0) len--;
            for (let k = 0; k < len; k++) put(x, y + k, z, drip(false, thick(k, len)));
          }
        } else {
          if (floor) {
            const patch = this.nDeep.noise2(wx / 7, wz / 7 + y) > -0.25;
            if (patch) put(x, y - 1, z, r2 < 0.004 ? makeBlock(CB.SCULK_CATALYST) : makeBlock(CB.SCULK));
            if (patch && r < 0.1) put(x, y, z, makeBlock(CB.SCULK_VEIN));
            else if (patch && r < 0.118) put(x, y, z, makeBlock(CB.SCULK_SENSOR));
            else if (patch && r < 0.124) put(x, y, z, makeBlock(CB.SCULK_SHRIEKER, SHRIEK_SUMMON));
          } else if (ceil && r2 < 0.35) put(x, y + 1, z, makeBlock(CB.SCULK));
        }
      }
    }
  }

  private placeOres(pub: Rng, blocks: Uint32Array, colAt: (x: number, z: number) => Column, cx: number, cz: number): void {
    let rng = pub;
    let write = false;
    const vein = (ore: number, count: number, size: number, minY: number, maxY: number) => {
      for (let n = 0; n < count; n++) {
        let x = rng.int(S), y = minY + rng.int(maxY - minY), z = rng.int(S);
        for (let k = 0; k < size; k++) {
          if (write && x >= 0 && x < S && z >= 0 && z < S && y > 0 && y < WORLD_HEIGHT) {
            const i = (y * S + z) * S + x;
            if ((bid(blocks[i])) === B.STONE) blocks[i] = ore;
          }
          const d = rng.int(6);
          if (d === 0) x++; else if (d === 1) x--; else if (d === 2) y++; else if (d === 3) y--; else if (d === 4) z++; else z--;
        }
      }
    };
    const mountain = colAt(8, 8).mountain > 0.4;
    const ores = () => {
      vein(B.COAL_ORE, 18, 10, 6, mountain ? 130 : 90);
      vein(B.IRON_ORE, 12, 7, 4, 70);
      vein(B.GOLD_ORE, 3, 7, 4, 34);
      vein(B.AETHERITE_ORE, rng.chance(0.75) ? 2 : 1, 5, 3, 18);
      vein(B.COPPER_ORE, 8, 9, 20, 90);
    };
    ores();
    write = true;
    vein(B.GRAVEL, 4, 24, 8, 70);
    vein(B.DIRT, 5, 24, 8, 80);
    vein(B.TUFF, 3, 32, 3, 22);
    write = false;
    if (mountain) vein(B.IRON_ORE, 4, 6, 70, 120);
    if (this.lv >= 8) {
      const keep = rng;
      rng = new Rng(hash2(cx, cz, this.seed ^ 0x57a7e));
      write = true;
      vein(X(XV.GRANITE), 2, 33, 0, 80); vein(X(XV.DIORITE), 2, 33, 0, 80); vein(X(XV.ANDESITE), 2, 33, 0, 80);
      if (rng.chance(0.15)) vein(X(XV.DRIPSTONE_BLOCK), 1, 28, 0, 50);
      write = false;
      rng = keep;
    }
    if (this.oreSeed === null) return;
    rng = new Rng(hash2(cx, cz, this.oreSeed));
    write = true;
    ores();
    if (mountain) vein(B.IRON_ORE, 4, 6, 70, 120);
    if (this.lv >= CAVE_LEVEL && this.caveKind(cx * S + 8, 40, cz * S + 8, colAt(8, 8).height) === 2) vein(B.COPPER_ORE, 12, 10, 10, 90);
    if (this.lv >= 4) { vein(B.REDSTONE_ORE, 7, 7, 2, 18); vein(B.LAPIS_ORE, 2, 7, 3, 34); }
  }

  private treeAt(wx: number, wz: number, col: Column): { kind: number; height: number } | null {
    const b = col.biome.id;
    const cell = b === 'jungle' ? 4 : b === 'forest' || b === 'birch_forest' || b === 'taiga' || b === 'dark_forest' || b === 'old_growth_taiga' ? 4 : b === 'savanna' || b === 'cherry_grove' ? 7 : b === 'mangrove_swamp' ? 5 : b === 'mushroom_fields' || b === 'ice_spikes' ? 9 : 6;
    const gx = Math.floor(wx / cell), gz = Math.floor(wz / cell);
    const hh = hash2(gx, gz, this.seed ^ 0x7ee5);
    const jx = gx * cell + (hh % cell), jz = gz * cell + ((hh >>> 8) % cell);
    if (jx !== wx || jz !== wz) return null;
    const density: Partial<Record<BiomeId, number>> = {
      forest: 0.8, birch_forest: 0.8, taiga: 0.7, jungle: 0.95, plains: 0.07, swamp: 0.45, mountains: 0.12,
      snowy_tundra: 0.05, snowy_mountains: 0.04, island: 0.25, river: 0, beach: 0,
      savanna: 0.16, badlands: 0, dark_forest: 0.9, meadow: 0.05, old_growth_taiga: 0.85,
      cherry_grove: 0.5, mangrove_swamp: 0.75, mushroom_fields: 0.08, ice_spikes: 0.3, warm_ocean: 0,
    };
    const p = density[b] ?? 0;
    const roll = ((hh >>> 16) & 0xffff) / 65536;
    if (roll >= p) return null;
    if (b === 'mangrove_swamp') { if (col.height < SEA_LEVEL - 3 || col.height > 100) return null; }
    else if (col.height <= SEA_LEVEL || col.height > 125 || (col.water !== undefined && col.height < col.water)) return null;
    const r2 = hash2(wx, wz, this.seed ^ 0xa11);
    let kind = 0;
    if (b === 'birch_forest') kind = (r2 & 7) < 6 ? 1 : 0;
    else if (b === 'forest') kind = (r2 & 7) < 2 ? 1 : 0;
    else if (b === 'taiga' || b === 'snowy_tundra' || b === 'snowy_mountains' || b === 'mountains') kind = this.lv >= 3 && b === 'taiga' && ((r2 >>> 4) & 15) === 3 ? 7 : 2;
    else if (b === 'jungle') kind = this.lv >= 3 && ((r2 >>> 4) & 7) === 5 ? 6 : (r2 & 3) === 0 ? 4 : 3;
    else if (b === 'swamp') kind = 5;
    else if (b === 'savanna') kind = (r2 & 7) < 6 ? 8 : 0;
    else if (b === 'dark_forest') kind = (r2 & 15) < 11 ? 9 : (r2 & 15) < 14 ? 0 : 1;
    else if (b === 'meadow') kind = (r2 & 3) === 0 ? 1 : 0;
    else if (b === 'old_growth_taiga') kind = ((r2 >>> 4) & 7) < 3 ? 7 : 2;
    else if (b === 'cherry_grove') kind = 10;
    else if (b === 'mangrove_swamp') kind = 11;
    else if (b === 'mushroom_fields') kind = 12;
    else if (b === 'ice_spikes') kind = 13;
    if (b === 'jungle' && this.lv >= BIOME_LEVEL && kind !== 6 && ((r2 >>> 4) & 7) === 2) kind = 6;
    const base = [4, 5, 6, 9, 1, 4, 14, 16, 5, 6, 5, 5, 5, 6][kind];
    const varr = [3, 3, 4, 6, 1, 2, 10, 9, 3, 3, 3, 4, 3, 9][kind];
    let height = base + ((r2 >>> 8) % varr);
    if (kind === 13 && ((r2 >>> 20) & 15) === 0) height = 18 + ((r2 >>> 12) & 15);
    return { kind, height };
  }

  private placeFeatures(cx: number, cz: number, cols: Column[], set: (x: number, y: number, z: number, v: number) => void, get: (x: number, y: number, z: number) => number, entities: GenBlockEntity[]): void {
    const bx = cx * S, bz = cz * S;
    const leaf = (x: number, y: number, z: number, v: number) => { const cur = get(x, y, z); if (cur === 0 || cur === B.TALL_GRASS || cur === B.FERN) set(x, y, z, v); };
    for (let lz = -M; lz < S + M; lz++) {
      for (let lx = -M; lx < S + M; lx++) {
        const col = cols[(lz + M) * W + (lx + M)];
        const wx = bx + lx, wz = bz + lz;
        const t = this.treeAt(wx, wz, col);
        if (t) {
          const y0 = col.height + 1;
          const LOGS = [B.OAK_LOG, B.BIRCH_LOG, B.SPRUCE_LOG, B.JUNGLE_LOG, B.JUNGLE_LOG, B.OAK_LOG];
          const LEAVES = [B.OAK_LEAVES, B.BIRCH_LEAVES, B.SPRUCE_LEAVES, B.JUNGLE_LEAVES, B.JUNGLE_LEAVES, B.OAK_LEAVES];
          const log = LOGS[t.kind], lv = LEAVES[t.kind];
          const top = y0 + t.height;
          const hr = hash2(wx, wz, this.seed ^ 0x3c);
          if (t.kind >= 8) {
            let hs = hr;
            const rnd = (n: number) => { hs = Math.imul(hs ^ (hs >>> 15), 0x2c1b3c6d) ^ 0x297a2d39; return ((hs >>> 8) & 0xffff) % n; };
            const tset: TreeSet = (x, y, z, v, isLeaf) => { if (isLeaf) leaf(x, y, z, v); else set(x, y, z, v); };
            if (t.kind === 13) { iceSpike(tset, lx, y0, lz, t.height, rnd); continue; }
            if (t.kind === 12) { hugeMushroom(tset, lx, y0, lz, t.height, (hr & 1) === 0); continue; }
            if (t.kind === 10) { cherry(tset, lx, y0, lz, t.height, rnd); continue; }
            if (t.kind === 11) { const ys = Math.max(y0, SEA_LEVEL + 1); mangrove(tset, lx, ys - 2, lz, t.height, rnd, ys - 2 - y0); continue; }
            if (t.kind === 8) acacia(tset, lx, y0, lz, t.height, rnd);
            else { for (const [ox, oz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) if (lx + ox >= 0 && lx + ox < S && lz + oz >= 0 && lz + oz < S) set(lx + ox, y0 - 1, lz + oz, B.DIRT); darkOak(tset, lx, y0, lz, t.height, rnd); }
            continue;
          }
          if (t.kind >= 6) {
            let hs = hr;
            const rnd = (n: number) => { hs = Math.imul(hs ^ (hs >>> 15), 0x2c1b3c6d) ^ 0x297a2d39; return ((hs >>> 8) & 0xffff) % n; };
            const tset: TreeSet = (x, y, z, v, isLeaf) => { if (isLeaf) leaf(x, y, z, v); else set(x, y, z, v); };
            for (const [ox, oz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) if (lx + ox >= 0 && lx + ox < S && lz + oz >= 0 && lz + oz < S) set(lx + ox, y0 - 1, lz + oz, B.DIRT);
            if (t.kind === 6) megaJungle(tset, lx, y0, lz, t.height, rnd); else megaSpruce(tset, lx, y0, lz, t.height, rnd);
            continue;
          }
          if (t.kind === 4) {
            set(lx, y0, lz, log);
            for (let dy = 0; dy <= 2; dy++) for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
              if (Math.abs(dx) + Math.abs(dz) + dy > 3) continue;
              leaf(lx + dx, y0 + dy, lz + dz, lv);
            }
            continue;
          }
          for (let y = y0; y < top; y++) set(lx, y, lz, log);
          if (lx >= 0 && lx < S && lz >= 0 && lz < S && get(lx, y0 - 1, lz) === B.GRASS) set(lx, y0 - 1, lz, B.DIRT);
          if (t.kind === 2) {
            let r = 0;
            for (let y = top; y >= y0 + 2; y--) {
              const rad = r;
              for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) {
                if (Math.abs(dx) + Math.abs(dz) > rad + (rad > 1 ? 1 : 0)) continue;
                leaf(lx + dx, y, lz + dz, lv);
              }
              r = r >= 2 ? ((top - y) & 1 ? 1 : 2) : r + 1;
            }
            leaf(lx, top + 1, lz, lv);
          } else {
            const R = t.kind === 3 ? 3 : 2;
            for (let y = top - 3; y <= top; y++) {
              const rad = y >= top - 1 ? R - 1 : R;
              for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) {
                const corner = Math.abs(dx) === rad && Math.abs(dz) === rad;
                if (corner && (y === top || ((hr >>> ((dx + dz + y) & 15)) & 1))) continue;
                leaf(lx + dx, y, lz + dz, lv);
              }
            }
            if (t.kind === 3) {
              for (let y = top - 3; y < top; y++) set(lx, y, lz, log);
              if (this.lv < 3) continue;
              let hs = hr;
              const rnd = (n: number) => { hs = Math.imul(hs ^ (hs >>> 15), 0x2c1b3c6d) ^ 0x297a2d39; return ((hs >>> 8) & 0xffff) % n; };
              const tset: TreeSet = (x, y, z, v) => leaf(x, y, z, v);
              jungleVines(tset, lx, y0, lz, t.height - 3, rnd);
              hangingVines(tset, get, lx, top - 3, lz, 3, rnd);
            }
          }
          continue;
        }
        const b = col.biome.id;
        if ((b === 'forest' || b === 'taiga' || b === 'mountains') && col.height > SEA_LEVEL) {
          const h = hash2(wx, wz, this.seed ^ 0xb0b);
          if ((h & 1023) === 7) {
            const r = 1 + ((h >>> 10) & 1);
            const cyb = col.height + r - 1;
            for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
              if (dx * dx + dy * dy + dz * dz > r * r + 1) continue;
              set(lx + dx, cyb + dy, lz + dz, ((h >>> (dx + dy + dz + 12)) & 3) === 0 ? B.COBBLESTONE : B.MOSSY_COBBLESTONE);
            }
          }
        }
      }
    }
    if (this.lv >= 3) this.placeWaterPlants(cx, cz, cols, set, get);
    this.placeRuins(cx, cz, cols, set, get, entities);
  }

  private placeWaterPlants(cx: number, cz: number, cols: Column[], set: (x: number, y: number, z: number, v: number) => void, get: (x: number, y: number, z: number) => number): void {
    for (let lz = 0; lz < S; lz++) for (let lx = 0; lx < S; lx++) {
      const col = cols[(lz + M) * W + (lx + M)];
      const fy = col.height;
      if (fy >= SEA_LEVEL - 1) continue;
      if ((bid(get(lx, fy + 1, lz))) !== B.WATER || (get(lx, fy + 1, lz) >>> 8) !== 0) continue;
      const floor = bid(get(lx, fy, lz));
      if (floor !== B.SAND && floor !== B.GRAVEL && floor !== B.DIRT && floor !== B.CLAY && floor !== B.MUD) continue;
      const h = hash2(cx * S + lx, cz * S + lz, this.seed ^ 0x5ea9);
      const b = col.biome.id;
      const depth = SEA_LEVEL - fy;
      const ocean = b === 'ocean' || b === 'deep_ocean' || b === 'island' || b === 'warm_ocean';
      if (b === 'warm_ocean' && depth > 2) {
        const reef = this.nVariety.noise2((cx * S + lx) / 14, (cz * S + lz) / 14);
        const kind = (h >>> 6) % 5;
        if (reef > 0.15) {
          const tall = depth > 5 && reef > 0.4 ? 1 + ((h >>> 9) % 3) : 0;
          for (let k = 0; k < tall; k++) set(lx, fy + 1 + k, lz, X(XV.TUBE_CORAL_BLOCK + ((kind + k) % 5)));
          set(lx, fy, lz, X(XV.TUBE_CORAL_BLOCK + kind));
          if ((h & 3) !== 0) set(lx, fy + 1 + tall, lz, sp(B.SEAGRASS, 1 + ((h >>> 12) % 5)));
          continue;
        }
        if ((h & 15) < 4) { set(lx, fy + 1, lz, (h & 1) ? B.SEAGRASS : sp(B.SEAGRASS, 1 + ((h >>> 12) % 5))); continue; }
        continue;
      }
      if (ocean && depth > 4 && (h & 15) < 2) {
        const len = Math.min(depth - 2, 2 + ((h >>> 4) % 14));
        let y = fy + 1;
        for (let k = 0; k < len; k++, y++) {
          const w = get(lx, y + 1, lz);
          if ((bid(w)) !== B.WATER || (w >>> 8) !== 0 || k === len - 1) { set(lx, y, lz, makeBlock(B.KELP, Math.min(25, 10 + ((h >>> 9) & 7)))); break; }
          set(lx, y, lz, B.KELP_PLANT);
        }
      } else if ((h & 15) < (ocean ? 6 : 3)) set(lx, fy + 1, lz, B.SEAGRASS);
    }
  }

  private placeRuins(cx: number, cz: number, cols: Column[], set: (x: number, y: number, z: number, v: number) => void, get: (x: number, y: number, z: number) => number, entities: GenBlockEntity[]): void {
    const REG = 64;
    const bx = cx * S, bz = cz * S;
    const regs = new Set<string>();
    for (const [ox, oz] of [[0, 0], [S - 1, 0], [0, S - 1], [S - 1, S - 1]]) regs.add(`${Math.floor((bx + ox) / REG)},${Math.floor((bz + oz) / REG)}`);
    for (const r of regs) {
      const [rx, rz] = r.split(',').map(Number);
      const h = hash2(rx, rz, this.seed ^ 0xca1e5);
      if ((h & 255) > 90) continue;
      const wx = rx * REG + 8 + ((h >>> 8) % (REG - 16));
      const wz = rz * REG + 8 + ((h >>> 16) % (REG - 16));
      const lx = wx - bx, lz = wz - bz;
      if (lx < -4 || lx > S + 3 || lz < -4 || lz > S + 3) continue;
      const col = this.column(wx, wz);
      const okBiome = ['plains', 'forest', 'birch_forest', 'desert', 'taiga', 'snowy_tundra', 'mountains', 'jungle'].includes(col.biome.id);
      if (!okBiome || col.height <= SEA_LEVEL + 1 || col.height > 120) continue;
      const y0 = col.height;
      const desert = col.biome.id === 'desert';
      const brick = desert ? B.SANDSTONE : B.STONE_BRICKS;
      const mossy = desert ? B.SANDSTONE : B.MOSSY_STONE_BRICKS;
      const rr = new Rng(h);
      for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
        set(lx + dx, y0, lz + dz, rr.chance(0.35) ? mossy : brick);
        for (let y = y0 + 1; y <= y0 + 5; y++) {
          const cur = get(lx + dx, y, lz + dz);
          if (cur !== -1 && cur !== B.WATER) set(lx + dx, y, lz + dz, 0);
        }
        for (let y = y0 - 1; y > y0 - 6; y--) {
          const cur = get(lx + dx, y, lz + dz);
          if (cur === 0 || cur === B.WATER) set(lx + dx, y, lz + dz, B.COBBLESTONE);
        }
      }
      for (const [px, pz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) {
        const ph = 1 + rr.int(4);
        for (let y = 1; y <= ph; y++) set(lx + px, y0 + y, lz + pz, rr.chance(0.4) ? mossy : brick);
      }
      for (let i = -2; i <= 2; i++) {
        if (rr.chance(0.6)) set(lx + i, y0 + 1, lz - 3, brick);
        if (rr.chance(0.6)) set(lx - 3, y0 + 1, lz + i, mossy);
      }
      set(lx, y0 + 1, lz, makeBlock(B.CHEST, 2));
      set(lx + 1, y0 + 1, lz + 1, B.TORCH);
      if (lx >= 0 && lx < S && lz >= 0 && lz < S) {
        entities.push({ x: lx, y: y0 + 1, z: lz, type: 'chest', items: this.ruinLoot(rr) });
      }
    }
  }

  private ruinLoot(r: Rng): (ItemStack | null)[] {
    const items: (ItemStack | null)[] = new Array(27).fill(null);
    const table: [number, number, number, number][] = [
      [I.BREAD, 1, 4, 0.6], [I.APPLE, 1, 4, 0.5], [I.COAL, 3, 10, 0.6], [I.IRON_INGOT, 1, 5, 0.5],
      [B.TORCH, 4, 12, 0.5], [I.SEEDS, 2, 6, 0.4], [I.STRING, 1, 4, 0.3], [I.BONE, 1, 5, 0.3],
      [I.GOLD_INGOT, 1, 3, 0.25], [I.AETHERITE, 1, 2, 0.12], [toolId(2, 0), 1, 1, 0.12], [I.BUCKET, 1, 1, 0.15],
      [B.OAK_SAPLING, 1, 3, 0.3], [I.LEATHER, 1, 3, 0.25],
    ];
    for (const [id, a, b, p] of table) {
      if (!r.chance(p)) continue;
      let slot = r.int(27);
      for (let k = 0; k < 27 && items[slot]; k++) slot = (slot + 1) % 27;
      items[slot] = { id, count: a + r.int(b - a + 1) };
    }
    return items;
  }

  private placeVegetation(cx: number, cz: number, rng: Rng, set: (x: number, y: number, z: number, v: number) => void, get: (x: number, y: number, z: number) => number, colAt: (x: number, z: number) => Column): void {
    for (let z = 0; z < S; z++) for (let x = 0; x < S; x++) {
      const col = colAt(x, z);
      let y = col.height;
      while (y > 0 && get(x, y, z) === 0) y--;
      const ground = get(x, y, z);
      const above = get(x, y + 1, z);
      if (above !== 0) {
        if (above === B.WATER && col.biome.id === 'swamp' && get(x, y + 2, z) === 0 && y + 1 === SEA_LEVEL && rng.chance(0.06)) {
          set(x, y + 2, z, makeBlock(B.LILY_PAD, rng.int(4)));
        }
        continue;
      }
      const b = col.biome.id;
      const r = rng.next();
      if (ground === B.GRASS && this.lv >= 8) {
        const hh = hash2(cx * S + x, cz * S + z, this.seed ^ 0x9a3b);
        const gate = b === 'jungle' ? 5 : b === 'plains' || b === 'forest' || b === 'taiga' || b === 'birch_forest' ? 2 : 0;
        if ((hh & 2047) < gate && (hash2(cx >> 1, cz >> 1, this.seed ^ 0x51) & 3) === 0) { set(x, y + 1, z, b === 'jungle' ? B.MELON : B.PUMPKIN); continue; }
      }
      if (this.lv >= BIOME_LEVEL && this.newVegetation(b, ground, x, y, z, r, rng, set)) continue;
      if (ground === B.GRASS) {
        const nearWater = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => get(x + dx, y, z + dz) === B.WATER);
        if (nearWater && rng.chance(b === 'swamp' || b === 'jungle' ? 0.35 : 0.12)) {
          const hgt = 1 + rng.int(3);
          for (let k = 1; k <= hgt; k++) set(x, y + k, z, B.SUGAR_CANE);
          continue;
        }
        const grassP = b === 'plains' ? 0.32 : b === 'jungle' ? 0.45 : b === 'swamp' ? 0.25 : b === 'forest' || b === 'birch_forest' ? 0.18 : b === 'taiga' ? 0.12 : 0.1;
        if (r < grassP) set(x, y + 1, z, b === 'taiga' || b === 'jungle' ? (rng.chance(0.5) ? B.FERN : B.TALL_GRASS) : B.TALL_GRASS);
        else if (r < grassP + (b === 'plains' ? 0.025 : b === 'forest' ? 0.02 : b === 'swamp' ? 0.012 : 0.006)) {
          const pick = rng.next();
          const fl = b === 'swamp' ? B.BLUE_ORCHID
            : b === 'plains' ? [B.DANDELION, B.POPPY, B.OXEYE_DAISY, B.AZURE_BLUET, B.CORNFLOWER, B.ORANGE_TULIP, B.PINK_TULIP, B.WHITE_TULIP, B.RED_TULIP][Math.floor(pick * 9)]
            : b === 'forest' || b === 'birch_forest' ? [B.DANDELION, B.POPPY, B.LILY_OF_THE_VALLEY, B.ALLIUM, B.LILY_OF_THE_VALLEY][Math.floor(pick * 5)]
            : pick < 0.5 ? B.DANDELION : B.POPPY;
          set(x, y + 1, z, fl);
        }
        else if ((b === 'swamp' || b === 'forest' || b === 'taiga') && r > 0.993) set(x, y + 1, z, rng.chance(0.5) ? B.RED_MUSHROOM : B.BROWN_MUSHROOM);
      } else if (ground === B.SAND && b === 'desert') {
        if (r < 0.006 && x > 0 && x < S - 1 && z > 0 && z < S - 1) {
          const hgt = 1 + rng.int(3);
          for (let k = 1; k <= hgt; k++) set(x, y + k, z, B.CACTUS);
        } else if (r < 0.014) set(x, y + 1, z, B.DEAD_BUSH);
      } else if (ground === B.SNOWY_GRASS && r < 0.04) {
        set(x, y + 1, z, B.FERN);
      } else if (ground === B.STONE && y < 50 && r < 0.004) {
        set(x, y + 1, z, rng.chance(0.5) ? B.RED_MUSHROOM : B.BROWN_MUSHROOM);
      }
    }
  }

  private newVegetation(b: BiomeId, ground: number, x: number, y: number, z: number, r: number, rng: Rng, set: (x: number, y: number, z: number, v: number) => void): boolean {
    const grassy = ground === B.GRASS || (bid(ground)) === B.DIRT;
    switch (b) {
      case 'savanna':
        if (!grassy) return true;
        if (r < 0.34) set(x, y + 1, z, B.TALL_GRASS);
        else if (r < 0.345) set(x, y + 1, z, rng.chance(0.5) ? B.DANDELION : B.ORANGE_TULIP);
        return true;
      case 'badlands':
        if ((bid(ground)) !== B.SAND) return true;
        if (r < 0.005 && x > 0 && x < S - 1 && z > 0 && z < S - 1) { const hgt = 1 + rng.int(3); for (let k = 1; k <= hgt; k++) set(x, y + k, z, B.CACTUS); }
        else if (r < 0.03) set(x, y + 1, z, B.DEAD_BUSH);
        return true;
      case 'meadow':
        if (!grassy) return true;
        if (r < 0.3) set(x, y + 1, z, B.TALL_GRASS);
        else if (r < 0.52) {
          const patch = this.nVariety.noise2((x + this.bcx * S) / 18, (z + this.bcz * S) / 18);
          const kinds = [B.CORNFLOWER, B.AZURE_BLUET, B.OXEYE_DAISY, B.ALLIUM, B.DANDELION, B.POPPY, B.PINK_TULIP, B.WHITE_TULIP, B.LILY_OF_THE_VALLEY];
          set(x, y + 1, z, kinds[Math.min(8, Math.floor((patch * 0.5 + 0.5) * 9 + rng.next() * 1.5))]);
        }
        return true;
      case 'dark_forest':
        if (!grassy) return true;
        if (r < 0.1) set(x, y + 1, z, B.TALL_GRASS);
        else if (r < 0.125) set(x, y + 1, z, rng.chance(0.5) ? B.RED_MUSHROOM : B.BROWN_MUSHROOM);
        else if (r < 0.13) set(x, y + 1, z, B.LILY_OF_THE_VALLEY);
        return true;
      case 'cherry_grove':
        if (!grassy) return true;
        if (r < 0.22) set(x, y + 1, z, B.TALL_GRASS);
        else if (r < 0.26) set(x, y + 1, z, rng.chance(0.6) ? B.PINK_TULIP : B.ALLIUM);
        return true;
      case 'mangrove_swamp':
        if (ground === B.GRASS && r < 0.2) set(x, y + 1, z, B.TALL_GRASS);
        return true;
      case 'mushroom_fields':
        if (r < 0.04) set(x, y + 1, z, rng.chance(0.5) ? B.RED_MUSHROOM : B.BROWN_MUSHROOM);
        return true;
      case 'ice_spikes':
        return true;
      case 'old_growth_taiga':
        if (!grassy) return true;
        if (r < 0.28) set(x, y + 1, z, rng.chance(0.7) ? B.FERN : B.TALL_GRASS);
        else if (r < 0.29) set(x, y + 1, z, rng.chance(0.5) ? B.RED_MUSHROOM : B.BROWN_MUSHROOM);
        return true;
      default:
        return false;
    }
  }

  private placeBoulders(cx: number, cz: number, cols: Column[], set: (x: number, y: number, z: number, v: number) => void): void {
    for (let lz = -M; lz < S + M; lz++) for (let lx = -M; lx < S + M; lx++) {
      const col = cols[(lz + M) * W + (lx + M)];
      if (col.biome.id !== 'old_growth_taiga' || (col.water !== undefined && col.height < col.water)) continue;
      const wx = cx * S + lx, wz = cz * S + lz;
      const hh = hash2(wx, wz, this.seed ^ 0xb01d);
      if ((hh & 1023) >= 3) continue;
      const r = 1 + ((hh >>> 10) & 1), y0 = col.height;
      for (let dy = -1; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy + dz * dz > r * r + 1) continue;
        set(lx + dx, y0 + dy, lz + dz, ((hh >>> (12 + ((dx + dz + dy) & 7))) & 3) ? B.MOSSY_COBBLESTONE : B.COBBLESTONE);
      }
    }
  }

  private shapeRiverBanks(cols: Column[], colAt: (x: number, z: number) => Column, set: (x: number, y: number, z: number, v: number) => void, get: (x: number, y: number, z: number) => number): void {
    const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const wet = (c: Column) => c.water !== undefined && c.height < c.water;
    for (let z = 0; z < S; z++) for (let x = 0; x < S; x++) {
      const c = colAt(x, z);
      let up = -1;
      for (const [dx, dz] of N4) { const n = colAt(x + dx, z + dz); if (wet(n) && n.water! > up) up = n.water!; }
      if (up < 0) continue;
      if (!wet(c)) {
        if (c.height >= up) continue;
        const top = get(x, c.height, z);
        for (let y = c.height; y < up; y++) set(x, y, z, B.DIRT);
        set(x, up, z, top > 0 && top !== B.WATER ? top : B.GRASS);
        cols[(z + M) * W + (x + M)] = { ...c, height: up };
      } else if (up > c.water!) {
        for (let y = c.water! + 1; y <= up; y++) if (get(x, y, z) === 0) set(x, y, z, makeBlock(B.WATER, 8 | 1));
      }
    }
  }

  private placeWaterfalls(rng: Rng, set: (x: number, y: number, z: number, v: number) => void, get: (x: number, y: number, z: number) => number, colAt: (x: number, z: number) => Column): void {
    const tries = colAt(8, 8).mountain > 0.3 ? 6 : 1;
    for (let t = 0; t < tries; t++) {
      if (!rng.chance(0.35)) continue;
      const x = 1 + rng.int(S - 2), z = 1 + rng.int(S - 2);
      const h = colAt(x, z).height;
      if (h < SEA_LEVEL + 14) continue;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz;
        const nh = colAt(nx, nz).height;
        if (h - nh < 5) continue;
        const sy = h - 2;
        if (get(nx, sy, nz) !== 0) continue;
        set(x, sy, z, B.WATER);
        set(x, sy + 1, z, get(x, sy + 1, z) === 0 ? B.STONE : get(x, sy + 1, z));
        for (let y = sy; y > nh; y--) {
          if (get(nx, y, nz) !== 0) break;
          set(nx, y, nz, makeBlock(B.WATER, 8 | 1));
        }
        break;
      }
    }
  }

  findSpawn(): { x: number; y: number; z: number } {
    if (this.arena) { const l = arenaLayout(this.arena).lobby; return { x: l[0], y: l[1], z: l[2] }; }
    if (this.studio) return { x: 0.5, y: STUDIO_FLOOR + 1, z: 0.5 };
    for (let r = 0; r < 4000; r += 16) {
      for (let a = 0; a < 8; a++) {
        const x = Math.round(Math.cos((a / 8) * Math.PI * 2) * r);
        const z = Math.round(Math.sin((a / 8) * Math.PI * 2) * r);
        const c = this.column(x, z);
        const b = c.biome.id;
        if (c.height > SEA_LEVEL && c.height < 100 && b !== 'ocean' && b !== 'deep_ocean' && b !== 'river' && b !== 'swamp') {
          return { x: x + 0.5, y: c.height + 1, z: z + 0.5 };
        }
      }
    }
    return { x: 0.5, y: this.heightAt(0, 0) + 2, z: 0.5 };
  }

  biomeIndex(x: number, z: number, lv?: number): number {
    if (isNether(x) || this.arena) return this.column(x, z).biome.index;
    const old = this.lv;
    this.lv = lv ?? GEN_LEVEL;
    try { return this.columnV1(x, z).biome.index; } finally { this.lv = old; }
  }

  biomeAt(x: number, z: number, lv?: number): Biome {
    return BIOMES[this.biomeIndex(Math.floor(x), Math.floor(z), lv)];
  }
}

export function biomeNameAt(gen: WorldGenerator, x: number, z: number, lv?: number): string {
  if (isEnd(x)) return Math.hypot(x - END_X, z) < 1000 ? 'The End' : 'End Highlands';
  if (isNether(x)) return gen.netherBiome(Math.floor(x), Math.floor(z)).split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
  return gen.biomeAt(x, z, lv).name;
}

export { BIOMES, hashFloat2 };

function studioChunk(cx: number, cz: number): Uint32Array {
  const b = new Uint32Array(CHUNK_VOLUME);
  for (let z = 0; z < S; z++) for (let x = 0; x < S; x++) {
    const wx = cx * S + x, wz = cz * S + z;
    const edge = (Math.abs(wx + 0.5) === STUDIO_PLOT + 0.5 || Math.abs(wz + 0.5) === STUDIO_PLOT + 0.5) && Math.abs(wx + 0.5) <= STUDIO_PLOT + 0.5 && Math.abs(wz + 0.5) <= STUDIO_PLOT + 0.5;
    const col = (y: number, v: number) => { b[(y * S + z) * S + x] = v; };
    col(0, B.BEDROCK);
    for (let y = 1; y <= 3; y++) col(y, B.STONE);
    col(4, B.DIRT); col(5, B.DIRT);
    col(STUDIO_FLOOR, edge ? B.COBBLESTONE : B.GRASS);
  }
  return b;
}

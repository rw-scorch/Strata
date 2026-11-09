import { CHUNK_SIZE, WORLD_HEIGHT, SEA_LEVEL, CHUNK_VOLUME } from '../constants';
import { Simplex, smoothstep, lerp } from '../noise';
import { Rng, hash2, hashFloat2, mix32 } from '../rng';
import { B, makeBlock } from '../blocks';
import { I, toolId } from '../items';
import { BIOMES, Biome, BiomeId, biome } from './biomes';
import type { ItemStack } from '../inventory';
import { ArenaKind, arenaLayout, generateArenaChunk } from '../minigames/arena';

export interface Column {
  height: number;
  biome: Biome;
  temp: number;
  humid: number;
  mountain: number;
  river: number;
}

export interface GenBlockEntity { x: number; y: number; z: number; type: 'chest'; items: (ItemStack | null)[]; }
export interface GeneratedChunk { blocks: Uint16Array; entities: GenBlockEntity[]; }

const S = CHUNK_SIZE;
const M = 5;
const W = S + M * 2;

export class WorldGenerator {
  readonly seed: number;
  private nCont: Simplex; private nErode: Simplex; private nPeak: Simplex; private nTemp: Simplex; private nHum: Simplex;
  private nDetail: Simplex; private nHill: Simplex; private nRiver: Simplex; private nLake: Simplex; private nIsland: Simplex;
  private nCave1: Simplex; private nCave2: Simplex; private nCave3: Simplex; private nRavine: Simplex; private nRavMask: Simplex;
  private nPatch: Simplex;

  readonly arena: ArenaKind | null;
  private flatCol: Column | null = null;

  constructor(seed: number, arena: ArenaKind | null = null) {
    this.seed = seed >>> 0;
    this.arena = arena;
    let k = 0;
    const mk = () => new Simplex(mix32(this.seed + 0x1234567 * ++k));
    this.nCont = mk(); this.nErode = mk(); this.nPeak = mk(); this.nTemp = mk(); this.nHum = mk();
    this.nDetail = mk(); this.nHill = mk(); this.nRiver = mk(); this.nLake = mk(); this.nIsland = mk();
    this.nCave1 = mk(); this.nCave2 = mk(); this.nCave3 = mk(); this.nRavine = mk(); this.nRavMask = mk();
    this.nPatch = mk();
  }

  column(x: number, z: number): Column {
    if (this.arena) return this.flatCol ??= { height: 64, biome: BIOMES.find((b) => b.id === 'plains') ?? BIOMES[0], temp: 0.6, humid: 0.5, mountain: 0, river: 0 };
    const c = this.nCont.fbm2(x / 900, z / 900, 4) * 1.4 + 0.18;
    const e = this.nErode.fbm2(x / 480, z / 480, 3);
    const p = 1 - Math.abs(this.nPeak.fbm2(x / 230, z / 230, 4));
    const temp = this.nTemp.fbm2(x / 820, z / 820, 3) * 1.3;
    const humid = this.nHum.fbm2(x / 700, z / 700, 3) * 1.3;
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
    const riverW = (1 - smoothstep(0.012, 0.05, rv)) * land * (1 - mw * 0.75);
    h = lerp(h, SEA_LEVEL - 3.5 + d, riverW);

    const lk = this.nLake.fbm2(x / 150, z / 150, 3);
    const lakeW = smoothstep(0.5, 0.68, lk) * land * (1 - mw) * (1 - swampW);
    h = lerp(h, SEA_LEVEL - 5 + d * 2, lakeW);

    const height = Math.max(4, Math.min(WORLD_HEIGHT - 12, Math.floor(h)));

    let id: BiomeId;
    if (height < SEA_LEVEL - 1 && land < 0.5) id = height < SEA_LEVEL - 18 ? 'deep_ocean' : 'ocean';
    else if (riverW > 0.55 && height < SEA_LEVEL + 1) id = temp < -0.45 ? 'snowy_tundra' : 'river';
    else if (land < 0.5 && height >= SEA_LEVEL + 2) id = 'island';
    else if (height <= SEA_LEVEL + 2 && land < 0.85 && temp > -0.45 && swampW < 0.4) id = 'beach';
    else if (mw > 0.45) id = height > 112 || temp < -0.3 ? 'snowy_mountains' : 'mountains';
    else if (swampW > 0.4) id = 'swamp';
    else if (temp > 0.42) id = humid < 0.05 ? 'desert' : humid > 0.25 ? 'jungle' : 'plains';
    else if (temp < -0.45) id = humid > -0.1 ? 'taiga' : 'snowy_tundra';
    else if (temp < -0.2 && humid > 0.1) id = 'taiga';
    else if (humid > 0.08) id = d > 0.25 ? 'birch_forest' : 'forest';
    else id = 'plains';

    return { height, biome: biome(id), temp, humid, mountain: mw, river: riverW };
  }

  heightAt(x: number, z: number): number {
    return this.column(x, z).height;
  }

  generate(cx: number, cz: number): GeneratedChunk {
    if (this.arena) return { blocks: generateArenaChunk(this.arena, cx, cz), entities: [] };
    const blocks = new Uint16Array(CHUNK_VOLUME);
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
        const patch = this.nPatch.noise2(wx / 9, wz / 9);
        let top: number = B.GRASS, filler: number = B.DIRT, depth = 3 + (hash2(wx, wz, this.seed) & 1);
        const underwater = h < SEA_LEVEL;
        if (b === 'desert') { top = B.SAND; filler = B.SAND; depth = 4; }
        else if (b === 'beach' || b === 'island' && h <= SEA_LEVEL + 2) { top = B.SAND; filler = B.SAND; depth = 3; }
        else if (b === 'snowy_tundra' || b === 'taiga' && col.temp < -0.5) { top = B.SNOWY_GRASS; }
        else if (b === 'snowy_mountains') {
          if (slope > 3) { top = B.STONE; filler = B.STONE; }
          else top = h > 100 ? B.SNOW : B.SNOWY_GRASS;
        } else if (b === 'mountains') {
          if (slope > 3 || h > 118) { top = B.STONE; filler = B.STONE; }
          else if (h > 108) top = B.SNOWY_GRASS;
          else if (patch > 0.55) { top = B.GRAVEL; filler = B.GRAVEL; }
        } else if (b === 'swamp' && patch > 0.3) { top = B.MUD; filler = B.MUD; }
        if (underwater) {
          if (b === 'ocean' || b === 'deep_ocean') { top = h < SEA_LEVEL - 16 ? B.GRAVEL : patch > 0.4 ? B.CLAY : B.SAND; filler = B.SAND; }
          else if (b === 'river' || b === 'swamp') { top = patch > 0.35 ? B.CLAY : patch < -0.4 ? B.GRAVEL : B.SAND; filler = B.DIRT; if (b === 'swamp') top = patch > 0 ? B.MUD : B.DIRT; }
          else if (top === B.GRASS || top === B.SNOWY_GRASS) { top = patch > 0.2 ? B.SAND : patch < -0.3 ? B.CLAY : B.DIRT; }
          else if (top === B.SNOW) top = B.STONE;
        }
        set(x, 0, z, makeBlock(B.BEDROCK));
        for (let y = 1; y <= h; y++) {
          let v: number;
          if (y <= 3 && (hash2(wx * 7 + y, wz, this.seed) & 3) < 4 - y) v = B.BEDROCK;
          else if (y === h) v = top;
          else if (y > h - depth) v = filler;
          else if (b === 'desert' && y > h - depth - 4) v = B.SANDSTONE;
          else if ((b === 'beach') && y > h - depth - 2) v = B.SANDSTONE;
          else v = B.STONE;
          set(x, y, z, v);
        }
        for (let y = h + 1; y <= SEA_LEVEL; y++) set(x, y, z, B.WATER);
        if (h < SEA_LEVEL && col.biome.cold) set(x, SEA_LEVEL, z, B.ICE);
      }
    }

    this.carveCaves(cx, cz, blocks, colAt);
    this.placeOres(rng, blocks, colAt);
    this.placeFeatures(cx, cz, cols, set, get, entities);
    this.placeVegetation(cx, cz, rng, set, get, colAt);
    this.placeWaterfalls(rng, set, get, colAt);
    return { blocks, entities };
  }

  private carveCaves(cx: number, cz: number, blocks: Uint16Array, colAt: (x: number, z: number) => Column): void {
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
        const cur = blocks[idx] & 0xff;
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
            const above = y + 1 < WORLD_HEIGHT ? blocks[idx + S * S] & 0xff : 0;
            if (above === B.WATER || above === B.SAND || above === B.GRAVEL && y > h - 3) continue;
          }
          blocks[idx] = y <= 10 ? B.LAVA : 0;
        }
      }
      for (let y = h; y > 1; y--) {
        const idx = (y * S + z) * S + x;
        const id = blocks[idx] & 0xff;
        if (id === 0) continue;
        if (id === B.DIRT && y < h && (blocks[idx + S * S] & 0xff) === 0) {
          const top = col.biome.cold ? B.SNOWY_GRASS : B.GRASS;
          if (y > SEA_LEVEL) blocks[idx] = top;
        }
        break;
      }
    }
  }

  private placeOres(rng: Rng, blocks: Uint16Array, colAt: (x: number, z: number) => Column): void {
    const vein = (ore: number, count: number, size: number, minY: number, maxY: number) => {
      for (let n = 0; n < count; n++) {
        let x = rng.int(S), y = minY + rng.int(maxY - minY), z = rng.int(S);
        for (let k = 0; k < size; k++) {
          if (x >= 0 && x < S && z >= 0 && z < S && y > 0 && y < WORLD_HEIGHT) {
            const i = (y * S + z) * S + x;
            if ((blocks[i] & 0xff) === B.STONE) blocks[i] = ore;
          }
          const d = rng.int(6);
          if (d === 0) x++; else if (d === 1) x--; else if (d === 2) y++; else if (d === 3) y--; else if (d === 4) z++; else z--;
        }
      }
    };
    const mountain = colAt(8, 8).mountain > 0.4;
    vein(B.COAL_ORE, 18, 10, 6, mountain ? 130 : 90);
    vein(B.IRON_ORE, 12, 7, 4, 70);
    vein(B.GOLD_ORE, 3, 7, 4, 34);
    vein(B.AETHERITE_ORE, rng.chance(0.75) ? 2 : 1, 5, 3, 18);
    vein(B.GRAVEL, 4, 24, 8, 70);
    vein(B.DIRT, 5, 24, 8, 80);
    if (mountain) vein(B.IRON_ORE, 4, 6, 70, 120);
  }

  private treeAt(wx: number, wz: number, col: Column): { kind: number; height: number } | null {
    const b = col.biome.id;
    const cell = b === 'jungle' ? 4 : b === 'forest' || b === 'birch_forest' || b === 'taiga' ? 4 : 6;
    const gx = Math.floor(wx / cell), gz = Math.floor(wz / cell);
    const hh = hash2(gx, gz, this.seed ^ 0x7ee5);
    const jx = gx * cell + (hh % cell), jz = gz * cell + ((hh >>> 8) % cell);
    if (jx !== wx || jz !== wz) return null;
    const density: Partial<Record<BiomeId, number>> = {
      forest: 0.8, birch_forest: 0.8, taiga: 0.7, jungle: 0.95, plains: 0.07, swamp: 0.45, mountains: 0.12,
      snowy_tundra: 0.05, snowy_mountains: 0.04, island: 0.25, river: 0, beach: 0,
    };
    const p = density[b] ?? 0;
    const roll = ((hh >>> 16) & 0xffff) / 65536;
    if (roll >= p) return null;
    if (col.height <= SEA_LEVEL || col.height > 125) return null;
    const r2 = hash2(wx, wz, this.seed ^ 0xa11);
    let kind = 0;
    if (b === 'birch_forest') kind = (r2 & 7) < 6 ? 1 : 0;
    else if (b === 'forest') kind = (r2 & 7) < 2 ? 1 : 0;
    else if (b === 'taiga' || b === 'snowy_tundra' || b === 'snowy_mountains' || b === 'mountains') kind = 2;
    else if (b === 'jungle') kind = (r2 & 3) === 0 ? 4 : 3;
    else if (b === 'swamp') kind = 5;
    const base = [4, 5, 6, 9, 1, 4][kind];
    const varr = [3, 3, 4, 6, 1, 2][kind];
    return { kind, height: base + ((r2 >>> 8) % varr) };
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
            if (t.kind === 3) for (let y = top - 3; y < top; y++) set(lx, y, lz, log);
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
    this.placeRuins(cx, cz, cols, set, get, entities);
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
      if (ground === B.GRASS) {
        const nearWater = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => get(x + dx, y, z + dz) === B.WATER);
        if (nearWater && rng.chance(b === 'swamp' || b === 'jungle' ? 0.35 : 0.12)) {
          const hgt = 1 + rng.int(3);
          for (let k = 1; k <= hgt; k++) set(x, y + k, z, B.SUGAR_CANE);
          continue;
        }
        const grassP = b === 'plains' ? 0.32 : b === 'jungle' ? 0.45 : b === 'swamp' ? 0.25 : b === 'forest' || b === 'birch_forest' ? 0.18 : b === 'taiga' ? 0.12 : 0.1;
        if (r < grassP) set(x, y + 1, z, b === 'taiga' || b === 'jungle' ? (rng.chance(0.5) ? B.FERN : B.TALL_GRASS) : B.TALL_GRASS);
        else if (r < grassP + (b === 'plains' ? 0.025 : b === 'forest' ? 0.02 : 0.006)) set(x, y + 1, z, rng.chance(0.5) ? B.DANDELION : B.POPPY);
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

  biomeIndex(x: number, z: number): number {
    return this.column(x, z).biome.index;
  }
}

export function biomeNameAt(gen: WorldGenerator, x: number, z: number): string {
  return gen.column(Math.floor(x), Math.floor(z)).biome.name;
}

export { BIOMES, hashFloat2 };

import { CHUNK_SIZE, CHUNK_VOLUME } from '../constants';
import { Simplex } from '../noise';
import { Rng, hash2 } from '../rng';
import { B, X, XV } from '../blocks';
import { NETHER_HEIGHT, NETHER_LAVA } from '../dimension';
import { planNetherPortal, stampRuinedPortal, PORTAL_GRID } from './ruinedPortal';
import type { GenBlockEntity } from './WorldGenerator';

const S = CHUNK_SIZE;
const RACK = X(XV.NETHERRACK), QUARTZ = X(XV.NETHER_QUARTZ_ORE), GOLD = X(XV.NETHER_GOLD_ORE), SOUL = X(XV.SOUL_SAND), SOIL = X(XV.SOUL_SOIL);
const BASALT = X(XV.BASALT), BLACK = X(XV.BLACKSTONE), BONE = X(XV.BONE_BLOCK);
const CNYL = X(XV.CRIMSON_NYLIUM), WNYL = X(XV.WARPED_NYLIUM), CSTEM = X(XV.CRIMSON_STEM), WSTEM = X(XV.WARPED_STEM);
const CWART = X(XV.NETHER_WART_BLOCK), WWART = X(XV.WARPED_WART_BLOCK);

export type NetherBiome = 'nether_wastes' | 'crimson_forest' | 'warped_forest' | 'soul_sand_valley' | 'basalt_deltas';
export const NETHER_BIOMES: NetherBiome[] = ['nether_wastes', 'crimson_forest', 'warped_forest', 'soul_sand_valley', 'basalt_deltas'];
const POINTS: [NetherBiome, number, number, number][] = [
  ['nether_wastes', 0, 0, 0], ['soul_sand_valley', 0, -0.5, 0], ['crimson_forest', 0.4, 0, 0], ['warped_forest', 0, 0.5, 0.375], ['basalt_deltas', -0.5, 0, 0.175],
];
export const NETHER_FOG: Record<NetherBiome, [number, number, number]> = {
  nether_wastes: [0.2, 0.031, 0.031], crimson_forest: [0.2, 0.012, 0.012], warped_forest: [0.102, 0.02, 0.102],
  soul_sand_valley: [0.106, 0.278, 0.271], basalt_deltas: [0.408, 0.373, 0.439],
};

export class NetherGen {
  private n3: Simplex;
  private n2: Simplex;
  private tN: Simplex;
  private hN: Simplex;
  constructor(private seed: number) {
    this.n3 = new Simplex(seed ^ 0x6e657468);
    this.n2 = new Simplex(seed ^ 0x736f756c);
    this.tN = new Simplex(seed ^ 0x74656d70);
    this.hN = new Simplex(seed ^ 0x68756d64);
  }

  biome(x: number, z: number): NetherBiome {
    const t = this.tN.fbm2(x * 0.0022, z * 0.0022, 2) * 1.4, h = this.hN.fbm2(x * 0.0022, z * 0.0022, 2) * 1.4;
    let best: NetherBiome = 'nether_wastes', bd = Infinity;
    for (const [b, pt, ph, off] of POINTS) { const d = (t - pt) ** 2 + (h - ph) ** 2 + off * off; if (d < bd) { bd = d; best = b; } }
    return best;
  }

  private density(x: number, y: number, z: number): number {
    const n = this.n3.fbm3(x * 0.011, y * 0.021, z * 0.011, 3);
    const bias = y < 34 ? ((34 - y) / 34) * 0.85 : y > 92 ? ((y - 92) / 32) * 1.3 : 0;
    const open = this.n2.fbm2(x * 0.004, z * 0.004, 2) * 0.12;
    return n + bias - 0.02 + open;
  }

  generate(cx: number, cz: number): { blocks: Uint16Array; entities: GenBlockEntity[] } {
    const blocks = new Uint16Array(CHUNK_VOLUME);
    const entities: GenBlockEntity[] = [];
    const bx = cx * S, bz = cz * S;
    const NX = 5, NY = 17, SXZ = 4, SY = 8;
    const lat = new Float32Array(NX * NY * NX);
    for (let j = 0; j < NY; j++) for (let k = 0; k < NX; k++) for (let i = 0; i < NX; i++) lat[(j * NX + k) * NX + i] = this.density(bx + i * SXZ, j * SY, bz + k * SXZ);
    const idx = (x: number, y: number, z: number) => (y * S + z) * S + x;
    for (let y = 0; y < NETHER_HEIGHT; y++) {
      const j = Math.min(NY - 2, Math.floor(y / SY)), fy = (y - j * SY) / SY;
      for (let z = 0; z < S; z++) {
        const k = z >> 2, fz = (z & 3) / 4;
        for (let x = 0; x < S; x++) {
          const i = x >> 2, fx = (x & 3) / 4;
          const at = (a: number, b: number, c: number) => lat[((j + b) * NX + k + c) * NX + i + a];
          const l = (a: number, b: number, t: number) => a + (b - a) * t;
          const d = l(l(l(at(0, 0, 0), at(1, 0, 0), fx), l(at(0, 0, 1), at(1, 0, 1), fx), fz), l(l(at(0, 1, 0), at(1, 1, 0), fx), l(at(0, 1, 1), at(1, 1, 1), fx), fz), fy);
          let v = 0;
          if (y === 0 || y === NETHER_HEIGHT - 1) v = B.BEDROCK;
          else if ((y <= 3 && (hash2((bx + x) * 7 + y, bz + z, this.seed) & 3) < 4 - y) || (y >= NETHER_HEIGHT - 4 && (hash2((bx + x) * 5 + y, bz + z, this.seed) & 3) < y - (NETHER_HEIGHT - 5))) v = B.BEDROCK;
          else if (d > 0) v = RACK;
          else if (y <= NETHER_LAVA) v = B.LAVA;
          blocks[idx(x, y, z)] = v;
        }
      }
    }
    const get = (x: number, y: number, z: number) => (x < 0 || x >= S || z < 0 || z >= S || y < 0 || y >= NETHER_HEIGHT ? -1 : blocks[idx(x, y, z)]);
    const set = (x: number, y: number, z: number, v: number) => { if (x >= 0 && x < S && z >= 0 && z < S && y > 0 && y < NETHER_HEIGHT - 1) blocks[idx(x, y, z)] = v; };
    const biomes: NetherBiome[] = [];
    for (let z = 0; z < S; z++) for (let x = 0; x < S; x++) biomes.push(this.biome(bx + x, bz + z));
    const bAt = (x: number, z: number) => biomes[Math.max(0, Math.min(15, z)) * S + Math.max(0, Math.min(15, x))];

    for (let z = 0; z < S; z++) for (let x = 0; x < S; x++) {
      const wx = bx + x, wz = bz + z, bio = bAt(x, z);
      const soul = this.n2.fbm2(wx * 0.013 + 40, wz * 0.013 - 17, 2);
      const grav = this.n2.fbm2(wx * 0.05 - 90, wz * 0.05 + 33, 2);
      const patch = this.n2.fbm2(wx * 0.08 + 300, wz * 0.08 - 120, 2);
      for (let y = NETHER_HEIGHT - 6; y > 4; y--) {
        if (blocks[idx(x, y, z)] !== RACK) continue;
        const up = blocks[idx(x, y + 1, z)], down = blocks[idx(x, y - 1, z)];
        if (bio === 'soul_sand_valley') {
          if (up === 0 || down === 0) set(x, y, z, patch > 0.1 ? SOIL : SOUL);
          else if (blocks[idx(x, y + 2, z)] === 0 || blocks[idx(x, y + 3, z)] === 0) set(x, y, z, SOUL);
          continue;
        }
        if (bio === 'basalt_deltas') {
          if (up === 0 || down === 0) set(x, y, z, patch > 0.15 ? BLACK : BASALT);
          else if (blocks[idx(x, y + 2, z)] === 0) set(x, y, z, BASALT);
          continue;
        }
        if (up === 0) {
          if (bio === 'crimson_forest') set(x, y, z, CNYL);
          else if (bio === 'warped_forest') set(x, y, z, WNYL);
          else if (soul > 0.42) { set(x, y, z, soul > 0.62 ? SOIL : SOUL); if (get(x, y - 1, z) === RACK) set(x, y - 1, z, SOUL); if (get(x, y - 2, z) === RACK) set(x, y - 2, z, SOUL); }
          else if (grav > 0.55 && y < 70) set(x, y, z, B.GRAVEL);
        } else if (up === B.LAVA && y >= NETHER_LAVA - 4 && (hash2(wx, wz + y * 131, this.seed) & 7) < 3) set(x, y, z, B.MAGMA_BLOCK);
        if (y >= NETHER_LAVA - 1 && y <= NETHER_LAVA + 1 && up === 0 && (hash2(wx * 3, wz * 5 + y, this.seed) & 7) < 2) {
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (get(x + dx, y, z + dz) === B.LAVA) { set(x, y, z, B.MAGMA_BLOCK); break; }
        }
      }
    }

    const rng = new Rng(hash2(cx, cz, this.seed ^ 0x51a7));
    const vein = (ore: number, count: number, size: number) => {
      for (let n = 0; n < count; n++) {
        let x = rng.int(S), y = 10 + rng.int(108), z = rng.int(S);
        for (let i = 0; i < size; i++) {
          if (get(x, y, z) === RACK) set(x, y, z, ore);
          x += rng.int(3) - 1; y += rng.int(3) - 1; z += rng.int(3) - 1;
        }
      }
    };
    vein(QUARTZ, 12, 12);
    vein(GOLD, 8, 9);
    const center = bAt(8, 8);
    const floors = (x: number, z: number, lo = NETHER_LAVA + 1, hi = 118): number[] => {
      const out: number[] = [];
      for (let y = lo; y < hi; y++) { const g = get(x, y - 1, z); if (get(x, y, z) === 0 && g !== 0 && g !== B.LAVA && g !== -1) out.push(y); }
      return out;
    };
    const ceilings = (x: number, z: number): number[] => {
      const out: number[] = [];
      for (let y = NETHER_LAVA + 2; y < 120; y++) if (get(x, y, z) === 0 && get(x, y + 1, z) !== 0 && get(x, y + 1, z) !== B.LAVA) out.push(y);
      return out;
    };
    const glow = center === 'basalt_deltas' ? 1 : center === 'soul_sand_valley' ? 1 : 3;
    for (let n = 0; n < glow; n++) {
      const x = 2 + rng.int(12), z = 2 + rng.int(12);
      let y = 40 + rng.int(70);
      while (y < NETHER_HEIGHT - 4 && get(x, y, z) === 0) y++;
      if (get(x, y, z) === 0 || get(x, y - 1, z) !== 0) continue;
      set(x, y - 1, z, B.GLOWSTONE);
      for (let i = 0; i < 60; i++) {
        const gx = x + rng.int(5) - 2 + rng.int(3) - 1, gz = z + rng.int(5) - 2 + rng.int(3) - 1, gy = y - 1 - rng.int(5) - rng.int(3);
        if (get(gx, gy, gz) !== 0) continue;
        let touch = 0;
        for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) if (get(gx + dx, gy + dy, gz + dz) === B.GLOWSTONE) touch++;
        if (touch === 1) set(gx, gy, gz, B.GLOWSTONE);
      }
    }

    if (center === 'nether_wastes') {
      if (rng.chance(0.35)) {
        const x = 3 + rng.int(10), z = 3 + rng.int(10);
        for (const y of floors(x, z).reverse()) { if (get(x, y - 1, z) !== RACK) continue; for (let i = 0; i < 6; i++) { const fx = x + rng.int(5) - 2, fz = z + rng.int(5) - 2; if (get(fx, y, fz) === 0 && get(fx, y - 1, fz) === RACK) set(fx, y, fz, B.FIRE); } break; }
      }
      for (let i = 0; i < 4; i++) { const x = rng.int(S), z = rng.int(S); const fl = floors(x, z); if (fl.length && rng.chance(0.5)) { const y = fl[rng.int(fl.length)]; set(x, y, z, rng.chance(0.5) ? B.RED_MUSHROOM : B.BROWN_MUSHROOM); } }
    }

    if (center === 'crimson_forest' || center === 'warped_forest') {
      const crimson = center === 'crimson_forest';
      const NYL = crimson ? CNYL : WNYL, STEM = crimson ? CSTEM : WSTEM, WART = crimson ? CWART : WWART;
      for (let z = 0; z < S; z++) for (let x = 0; x < S; x++) {
        for (const y of floors(x, z)) {
          if (get(x, y - 1, z) !== NYL) continue;
          const r = rng.next();
          if (crimson) { if (r < 0.22) set(x, y, z, B.CRIMSON_ROOTS); else if (r < 0.26) set(x, y, z, B.CRIMSON_FUNGUS); else if (r < 0.27) set(x, y, z, B.WARPED_FUNGUS); }
          else { if (r < 0.16) set(x, y, z, B.WARPED_ROOTS); else if (r < 0.26) set(x, y, z, B.NETHER_SPROUTS); else if (r < 0.29) set(x, y, z, B.WARPED_FUNGUS); else if (r < 0.295) set(x, y, z, B.CRIMSON_FUNGUS);
            else if (r < 0.32) { const hgt = 1 + rng.int(8); for (let k = 0; k < hgt && get(x, y + k, z) === 0; k++) set(x, y + k, z, B.TWISTING_VINES); } }
        }
      }
      const trees = 3 + rng.int(4);
      for (let t = 0; t < trees; t++) {
        const x = 3 + rng.int(10), z = 3 + rng.int(10);
        const fl = floors(x, z).filter((y) => get(x, y - 1, z) === NYL);
        if (!fl.length) continue;
        const y0 = fl[rng.int(fl.length)];
        let hgt = 4 + rng.int(10);
        if (rng.int(12) === 0) hgt *= 2;
        let room = 0;
        while (room < hgt + 3 && get(x, y0 + room, z) !== -1 && (get(x, y0 + room, z) === 0 || room === 0)) room++;
        if (room < 7) continue;
        hgt = Math.min(hgt, room - 3);
        for (let k = 0; k < hgt; k++) set(x, y0 + k, z, STEM);
        const capH = Math.max(3, Math.min(6, Math.round(hgt / 3) + 1));
        const rad = hgt > 9 ? 3 : 2;
        const top = y0 + hgt;
        for (let k = 0; k < capH; k++) {
          const yy = top - k;
          const rr = k === 0 ? rad - 1 : rad;
          for (let dz = -rr; dz <= rr; dz++) for (let dx = -rr; dx <= rr; dx++) {
            const edge = Math.abs(dx) === rr || Math.abs(dz) === rr;
            if (Math.abs(dx) === rr && Math.abs(dz) === rr && rng.chance(0.6)) continue;
            if (k > 0 && !edge && k < capH - 1 && rng.chance(0.7)) continue;
            if (get(x + dx, yy, z + dz) !== 0 && !(dx === 0 && dz === 0)) continue;
            if (dx === 0 && dz === 0 && k > 0) continue;
            set(x + dx, yy, z + dz, rng.chance(0.06) ? B.SHROOMLIGHT : WART);
            if (crimson && edge && k === capH - 1 && rng.chance(0.25)) {
              const len = 1 + rng.int(4);
              for (let v = 1; v <= len && get(x + dx, yy - v, z + dz) === 0; v++) set(x + dx, yy - v, z + dz, B.WEEPING_VINES);
            }
          }
        }
      }
      if (crimson) {
        for (let n = 0; n < 10; n++) {
          const x = rng.int(S), z = rng.int(S);
          const cs = ceilings(x, z);
          if (!cs.length) continue;
          const y = cs[rng.int(cs.length)];
          const len = 1 + rng.int(8);
          for (let v = 0; v < len && get(x, y - v, z) === 0; v++) set(x, y - v, z, B.WEEPING_VINES);
        }
      }
    }

    if (center === 'soul_sand_valley') {
      for (let n = 0; n < 5; n++) {
        const x = rng.int(S), z = rng.int(S);
        const fl = floors(x, z);
        if (fl.length && get(x, fl[0] - 1, z) === SOIL && rng.chance(0.6)) set(x, fl[0], z, B.SOUL_FIRE);
      }
      if (rng.chance(0.25)) {
        const x = 2 + rng.int(12), z = 2 + rng.int(12);
        const fl = floors(x, z);
        if (fl.length) {
          const y = fl[0];
          let h = 0;
          while (h < 40 && get(x, y + h, z) === 0) h++;
          if (get(x, y + h, z) !== 0 && get(x, y + h, z) !== -1) for (let k = 0; k < h; k++) { set(x, y + k, z, BASALT); if (k < 2 || k > h - 3) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (rng.chance(0.5) && get(x + dx, y + k, z + dz) === 0) set(x + dx, y + k, z + dz, BASALT); }
        }
      }
      if (rng.chance(0.12)) this.fossil(rng, get, set, floors);
    }

    if (center === 'basalt_deltas') {
      for (let n = 0; n < 6; n++) {
        const x = 1 + rng.int(14), z = 1 + rng.int(14);
        const fl = floors(x, z);
        if (!fl.length) continue;
        const y = fl[rng.int(fl.length)];
        const r = 1 + rng.int(3);
        for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dz * dz > r * r + 1) continue;
          const px = x + dx, pz = z + dz, py = y - 1;
          const g = get(px, py, pz);
          if (g !== BASALT && g !== BLACK) continue;
          let walled = true;
          for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const w = get(px + ax, py, pz + az); if (w === 0 || w === -1) walled = false; }
          if (walled && get(px, py - 1, pz) !== 0) { set(px, py, pz, B.LAVA); for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const w = get(px + ax, py, pz + az); if (w !== B.LAVA && rng.chance(0.4)) set(px + ax, py, pz + az, B.MAGMA_BLOCK); } }
        }
      }
      for (let n = 0; n < 8; n++) {
        const x = rng.int(S), z = rng.int(S);
        const fl = floors(x, z);
        if (!fl.length) continue;
        const y = fl[rng.int(fl.length)];
        const h = 1 + rng.int(rng.chance(0.25) ? 9 : 4);
        for (let k = 0; k < h && get(x, y + k, z) === 0; k++) set(x, y + k, z, BASALT);
      }
    }

    if (center !== 'basalt_deltas') this.ruinedPortal(cx, cz, get, set, entities);
    return { blocks, entities };
  }

  private fossil(rng: Rng, get: (x: number, y: number, z: number) => number, set: (x: number, y: number, z: number, v: number) => void, floors: (x: number, z: number) => number[]): void {
    const x = 4 + rng.int(8), z = 4 + rng.int(8);
    const fl = floors(x, z);
    if (!fl.length) return;
    const y = fl[0];
    const len = 5 + rng.int(6), ribs = 2 + rng.int(4);
    const alongX = rng.chance(0.5);
    for (let i = -Math.floor(len / 2); i <= Math.floor(len / 2); i++) {
      const sx = alongX ? x + i : x, sz = alongX ? z : z + i;
      set(sx, y + 2, sz, BONE);
    }
    for (let r = 0; r < ribs; r++) {
      const off = -Math.floor(len / 2) + 1 + Math.floor((r * (len - 2)) / Math.max(1, ribs - 1));
      for (const side of [-1, 1]) {
        for (let k = 0; k < 3; k++) {
          const w = side * (1 + (k > 0 ? 1 : 0)), yy = y + 2 - k;
          const px = alongX ? x + off : x + w, pz = alongX ? z + w : z + off;
          if (get(px, yy, pz) === 0) set(px, yy, pz, BONE);
        }
      }
    }
  }

  private ruinedPortal(cx: number, cz: number, get: (x: number, y: number, z: number) => number, set: (x: number, y: number, z: number, v: number) => void, entities: GenBlockEntity[]): void {
    const bx = cx * S, bz = cz * S;
    for (const [ox, oz] of [[-24, -24], [40, -24], [-24, 40], [40, 40]]) {
      const rx = Math.floor((bx + ox) / PORTAL_GRID), rz = Math.floor((bz + oz) / PORTAL_GRID);
      const p = planNetherPortal(this.seed, rx, rz);
      if (!p || seen.has(p.seed)) continue;
      seen.add(p.seed);
      stampRuinedPortal(p, bx, bz, S, set, (x, y, z) => Math.max(0, get(x, y, z)), entities);
    }
    seen.clear();
  }
}

const seen = new Set<number>();

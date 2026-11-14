import { CHUNK_SIZE, CHUNK_VOLUME } from '../constants';
import { Simplex } from '../noise';
import { Rng, hash2 } from '../rng';
import { B, X, XV } from '../blocks';
import { NETHER_HEIGHT, NETHER_LAVA } from '../dimension';

const S = CHUNK_SIZE;
const RACK = X(XV.NETHERRACK), QUARTZ = X(XV.NETHER_QUARTZ_ORE), GOLD = X(XV.NETHER_GOLD_ORE), SOUL = X(XV.SOUL_SAND), SOIL = X(XV.SOUL_SOIL);

export class NetherGen {
  private n3: Simplex;
  private n2: Simplex;
  constructor(private seed: number) {
    this.n3 = new Simplex(seed ^ 0x6e657468);
    this.n2 = new Simplex(seed ^ 0x736f756c);
  }

  private density(x: number, y: number, z: number): number {
    const n = this.n3.fbm3(x * 0.011, y * 0.021, z * 0.011, 3);
    const bias = y < 34 ? ((34 - y) / 34) * 0.85 : y > 92 ? ((y - 92) / 32) * 1.3 : 0;
    const open = this.n2.fbm2(x * 0.004, z * 0.004, 2) * 0.12;
    return n + bias - 0.02 + open;
  }

  generate(cx: number, cz: number): Uint16Array {
    const blocks = new Uint16Array(CHUNK_VOLUME);
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

    for (let z = 0; z < S; z++) for (let x = 0; x < S; x++) {
      const wx = bx + x, wz = bz + z;
      const soul = this.n2.fbm2(wx * 0.013 + 40, wz * 0.013 - 17, 2);
      const grav = this.n2.fbm2(wx * 0.05 - 90, wz * 0.05 + 33, 2);
      for (let y = NETHER_HEIGHT - 6; y > 4; y--) {
        if (blocks[idx(x, y, z)] !== RACK) continue;
        const up = blocks[idx(x, y + 1, z)];
        if (up === 0) {
          if (soul > 0.42) { set(x, y, z, soul > 0.62 ? SOIL : SOUL); if (get(x, y - 1, z) === RACK) set(x, y - 1, z, SOUL); if (get(x, y - 2, z) === RACK) set(x, y - 2, z, SOUL); }
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
    for (let n = 0; n < 3; n++) {
      const x = 2 + rng.int(12), z = 2 + rng.int(12);
      let y = 40 + rng.int(70);
      while (y < NETHER_HEIGHT - 4 && get(x, y, z) === 0) y++;
      if (get(x, y, z) !== RACK || get(x, y - 1, z) !== 0) continue;
      set(x, y - 1, z, B.GLOWSTONE);
      for (let i = 0; i < 60; i++) {
        const gx = x + rng.int(5) - 2 + rng.int(3) - 1, gz = z + rng.int(5) - 2 + rng.int(3) - 1, gy = y - 1 - rng.int(5) - rng.int(3);
        if (get(gx, gy, gz) !== 0) continue;
        let touch = 0;
        for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) if (get(gx + dx, gy + dy, gz + dz) === B.GLOWSTONE) touch++;
        if (touch === 1) set(gx, gy, gz, B.GLOWSTONE);
      }
    }
    if (rng.chance(0.35)) {
      const x = 3 + rng.int(10), z = 3 + rng.int(10);
      for (let y = 100; y > NETHER_LAVA + 1; y--) {
        if (get(x, y, z) === 0 && get(x, y - 1, z) === RACK) {
          for (let i = 0; i < 6; i++) { const fx = x + rng.int(5) - 2, fz = z + rng.int(5) - 2; if (get(fx, y, fz) === 0 && get(fx, y - 1, fz) === RACK) set(fx, y, fz, B.FIRE); }
          break;
        }
      }
    }
    return blocks;
  }
}

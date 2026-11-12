import { SEA_LEVEL } from '../../core/constants';
import { B } from '../../core/blocks';
import type { WorldGenerator, Column } from '../../core/worldgen/WorldGenerator';
import { hash2 } from '../../core/rng';

export interface LodTileReq { x0: number; z0: number; size: number; n: number }
export interface LodTileMesh { pos: Float32Array; col: Uint8Array; idx: Uint32Array | Uint16Array; quads: number }

const LEAF_TINT: Record<number, [number, number, number] | null> = { 0: null, 1: [128, 167, 85], 2: [97, 153, 97], 3: null, 4: null, 5: null };
const TREE_CELL = (b: string) => (b === 'jungle' || b === 'forest' || b === 'birch_forest' || b === 'taiga' ? 4 : 6);

export class LodMesher {
  constructor(private gen: WorldGenerator, private colors: Uint8Array) {}

  private blockColor(id: number, col: Column, out: number[]): void {
    const c = this.colors;
    let r = c[id * 4], g = c[id * 4 + 1], b = c[id * 4 + 2];
    const tint = c[id * 4 + 3];
    if (tint === 1) { r = r * col.biome.grass[0] / 255; g = g * col.biome.grass[1] / 255; b = b * col.biome.grass[2] / 255; }
    else if (tint === 2) { r = r * col.biome.foliage[0] / 255; g = g * col.biome.foliage[1] / 255; b = b * col.biome.foliage[2] / 255; }
    else if (tint === 3) { r = r * 128 / 255; g = g * 167 / 255; b = b * 85 / 255; }
    else if (tint === 4) { r = r * 97 / 255; g = g * 153 / 255; b = b * 97 / 255; }
    out[0] = r; out[1] = g; out[2] = b;
  }

  private tree(wx: number, wz: number, col: Column): { top: number; kind: number } | null {
    const b = col.biome.id;
    if (col.height <= SEA_LEVEL || col.height > 125) return null;
    const cell = TREE_CELL(b);
    const gen = this.gen as unknown as { treeAt(x: number, z: number, c: Column): { kind: number; height: number } | null };
    for (let gz = Math.floor((wz - 2) / cell); gz <= Math.floor((wz + 2) / cell); gz++) {
      for (let gx = Math.floor((wx - 2) / cell); gx <= Math.floor((wx + 2) / cell); gx++) {
        const hh = hash2(gx, gz, this.gen.seed ^ 0x7ee5);
        const jx = gx * cell + (hh % cell), jz = gz * cell + ((hh >>> 8) % cell);
        if (Math.abs(jx - wx) > 2 || Math.abs(jz - wz) > 2) continue;
        const t = gen.treeAt(jx, jz, col);
        if (t && t.kind !== 4) return { top: col.height + t.height + 1, kind: t.kind };
      }
    }
    return null;
  }

  build(req: LodTileReq): LodTileMesh {
    const { x0, z0, size, n } = req;
    const s = size / n;
    const W = n + 2;
    const H = new Float32Array(W * W);
    const C = new Uint8Array(W * W * 3);
    const cols: Column[] = new Array(W * W);
    for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) {
      const wx = Math.floor(x0 + (i - 1 + 0.5) * s), wz = Math.floor(z0 + (j - 1 + 0.5) * s);
      cols[j * W + i] = this.gen.column(wx, wz);
    }
    const rgb = [0, 0, 0];
    const leaves = [0, 0, 0];
    this.blockColor(B.OAK_LEAVES, cols[0], leaves);
    for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) {
      const k = j * W + i;
      const col = cols[k];
      const wx = Math.floor(x0 + (i - 1 + 0.5) * s), wz = Math.floor(z0 + (j - 1 + 0.5) * s);
      const h = col.height;
      let slope = 0;
      if (i > 0) slope = Math.max(slope, Math.abs(cols[k - 1].height - h));
      if (i < W - 1) slope = Math.max(slope, Math.abs(cols[k + 1].height - h));
      if (j > 0) slope = Math.max(slope, Math.abs(cols[k - W].height - h));
      if (j < W - 1) slope = Math.max(slope, Math.abs(cols[k + W].height - h));
      slope /= Math.max(1, s / 2);
      let top = h + 1;
      if (h < SEA_LEVEL) {
        top = SEA_LEVEL + 1;
        if (col.biome.cold) this.blockColor(B.ICE, col, rgb);
        else {
          this.blockColor(B.WATER, col, rgb);
          const w = col.biome.water;
          const depth = Math.min(1, (SEA_LEVEL - h) / 20);
          const f = 1.08 - depth * 0.22;
          rgb[0] = rgb[0] * w[0] / 255 * f; rgb[1] = rgb[1] * w[1] / 255 * f; rgb[2] = rgb[2] * w[2] / 255 * f;
        }
      } else {
        const t = this.tree(wx, wz, col);
        if (t) {
          top = t.top;
          const lid = t.kind === 1 ? B.BIRCH_LEAVES : t.kind === 2 ? B.SPRUCE_LEAVES : t.kind === 3 ? B.JUNGLE_LEAVES : B.OAK_LEAVES;
          this.blockColor(lid, col, rgb);
          const lt = LEAF_TINT[t.kind];
          if (lt && this.colors[lid * 4 + 3] === 0) { rgb[0] = rgb[0] * lt[0] / 255; rgb[1] = rgb[1] * lt[1] / 255; rgb[2] = rgb[2] * lt[2] / 255; }
        } else {
          const [tb] = this.gen.surface(col, wx, wz, slope);
          this.blockColor(tb, col, rgb);
        }
      }
      H[k] = top;
      C[k * 3] = Math.max(0, Math.min(255, rgb[0])); C[k * 3 + 1] = Math.max(0, Math.min(255, rgb[1])); C[k * 3 + 2] = Math.max(0, Math.min(255, rgb[2]));
    }
    const pos: number[] = [], colr: number[] = [];
    let quads = 0;
    const quad = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number, dx: number, dy: number, dz: number, k: number, shade: number) => {
      pos.push(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz);
      const r = C[k * 3], g = C[k * 3 + 1], b = C[k * 3 + 2], sh = Math.round(shade * 255);
      for (let v = 0; v < 4; v++) colr.push(r, g, b, sh);
      quads++;
    };
    for (let j = 1; j <= n; j++) {
      for (let i = 1; i <= n;) {
        const k = j * W + i;
        let w = 1;
        while (i + w <= n && H[k + w] === H[k] && C[(k + w) * 3] === C[k * 3] && C[(k + w) * 3 + 1] === C[k * 3 + 1] && C[(k + w) * 3 + 2] === C[k * 3 + 2]) w++;
        const xa = (i - 1) * s, xb = (i - 1 + w) * s, za = (j - 1) * s, zb = j * s, y = H[k];
        quad(xa, y, za, xa, y, zb, xb, y, zb, xb, y, za, k, 1);
        i += w;
      }
    }
    const skirt = Math.max(2, s * 2);
    for (let j = 1; j <= n; j++) for (let i = 1; i <= n; i++) {
      const k = j * W + i, y = H[k];
      const xa = (i - 1) * s, xb = i * s, za = (j - 1) * s, zb = j * s;
      const side = (nk: number, edge: boolean, emit: (lo: number) => void) => {
        let lo = H[nk];
        if (edge) lo = Math.min(lo, y) - skirt;
        if (lo < y) emit(lo);
      };
      side(k + 1, i === n, (lo) => quad(xb, y, za, xb, y, zb, xb, lo, zb, xb, lo, za, k, 0.8));
      side(k - 1, i === 1, (lo) => quad(xa, y, zb, xa, y, za, xa, lo, za, xa, lo, zb, k, 0.8));
      side(k + W, j === n, (lo) => quad(xb, y, zb, xa, y, zb, xa, lo, zb, xb, lo, zb, k, 0.62));
      side(k - W, j === 1, (lo) => quad(xa, y, za, xb, y, za, xb, lo, za, xa, lo, za, k, 0.62));
    }
    const nv = quads * 4;
    const idx = nv > 65535 ? new Uint32Array(quads * 6) : new Uint16Array(quads * 6);
    for (let q = 0; q < quads; q++) {
      const b = q * 4, o = q * 6;
      idx[o] = b; idx[o + 1] = b + 1; idx[o + 2] = b + 2; idx[o + 3] = b; idx[o + 4] = b + 2; idx[o + 5] = b + 3;
    }
    return { pos: Float32Array.from(pos), col: Uint8Array.from(colr), idx, quads };
  }
}

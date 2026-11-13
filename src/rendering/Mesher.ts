import { WORLD_HEIGHT } from '../core/constants';
import { BLOCKS, B, OPAQUE, LIGHT_FILTER, LIGHT_EMIT, DOOR_OPEN, DOOR_UPPER, doorFacing, edgeBox, FACING_DIRS, isWaterPlant } from '../core/blocks';
import { wireShape } from '../core/sim/redstone';
import { fluidHeight } from '../core/sim/fluids';
import type { WorldGenerator } from '../core/worldgen/WorldGenerator';
import type { AtlasData } from '../resources/TextureAtlas';
import { hash2 } from '../core/rng';

const H = WORLD_HEIGHT;
const R = 48;
const RA = R * R;
const VOL = RA * H;
const FS = 8;

export interface MeshBuffers { pos: Int16Array; uv: Int16Array; light: Uint8Array; tint: Uint8Array; idx: Uint16Array | Uint32Array; sec?: Uint32Array; }
export const SECTIONS = Math.ceil(WORLD_HEIGHT / 16);
export const POS_SCALE = 64;
export const F_TINT = 1, F_WAVE = 2, F_FOLIAGE = 4, F_EMIT = 8, F_LEAF = 16, F_GLOW = 32, F_WATER = 64;
export interface MeshResult { opaque: MeshBuffers | null; cutout: MeshBuffers | null; trans: MeshBuffers | null; chests?: Int32Array | null; vis?: Uint16Array; }

const RENDER: number[] = [];
const RCODE: Record<string, number> = { none: 0, cube: 1, leaves: 2, glass: 3, translucent: 4, liquid: 5, cross: 6, crop: 7, torch: 8, door: 9, ladder: 10, cactus: 11, chest: 12, redstone: 13, rs6: 13 };
const CULLSELF = new Uint8Array(256);
for (const b of BLOCKS) if (b) { RENDER[b.id] = RCODE[b.render]; CULLSELF[b.id] = b.cullSelf ? 1 : 0; }
const ORIENT = new Uint8Array(256);
for (const b of BLOCKS) if (b && b.orientable && b.render === 'cube') ORIENT[b.id] = 1;
const OFFSET_PLANT = new Uint8Array(256);
for (const id of [B.TALL_GRASS, B.FERN, B.DANDELION, B.POPPY, B.DEAD_BUSH]) OFFSET_PLANT[id] = 1;
const EXTRA = new Uint8Array(256);
for (const b of BLOCKS) if (b) {
  if (b.render === 'leaves') EXTRA[b.id] |= F_LEAF;
  if (b.lightEmit >= 12 && b.id !== B.FURNACE_LIT) EXTRA[b.id] |= F_EMIT;
}
for (const id of [B.GOLD_ORE, B.AETHERITE_ORE, B.IRON_ORE, B.FURNACE_LIT]) EXTRA[id] |= F_GLOW;

class Builder {
  pos = new Int16Array(4096 * 3);
  uv = new Int16Array(4096 * 4);
  light = new Uint8Array(4096 * 4);
  tint = new Uint8Array(4096 * 4);
  idx = new Uint32Array(4096 * 1.5);
  nv = 0;
  ni = 0;
  reset(): void { this.nv = 0; this.ni = 0; }
  private grow(): void {
    const g = <T extends Int16Array | Uint8Array | Uint32Array>(a: T): T => { const n = new (a.constructor as new (n: number) => T)(a.length * 2); n.set(a); return n; };
    this.pos = g(this.pos); this.uv = g(this.uv); this.light = g(this.light); this.tint = g(this.tint);
  }
  private growIdx(): void { const n = new Uint32Array(this.idx.length * 2); n.set(this.idx); this.idx = n; }
  vert(x: number, y: number, z: number, u: number, v: number, tile: number, ov: number, sky: number, blk: number, ao: number, shade: number, r: number, g: number, b: number, flags: number): void {
    if ((this.nv + 1) * 4 > this.uv.length) this.grow();
    const i = this.nv;
    this.pos[i * 3] = Math.round(x * POS_SCALE); this.pos[i * 3 + 1] = Math.round(y * POS_SCALE); this.pos[i * 3 + 2] = Math.round(z * POS_SCALE);
    this.uv[i * 4] = Math.round(u * POS_SCALE); this.uv[i * 4 + 1] = Math.round(v * POS_SCALE); this.uv[i * 4 + 2] = tile; this.uv[i * 4 + 3] = ov;
    this.light[i * 4] = sky; this.light[i * 4 + 1] = blk; this.light[i * 4 + 2] = ao; this.light[i * 4 + 3] = shade;
    this.tint[i * 4] = r; this.tint[i * 4 + 1] = g; this.tint[i * 4 + 2] = b; this.tint[i * 4 + 3] = flags;
    this.nv++;
  }
  quad(reverse: boolean, alt = false): void {
    if (this.ni + 6 > this.idx.length) this.growIdx();
    const b = this.nv - 4;
    const U = this.uv;
    let mu = U[b * 4], mv = U[b * 4 + 1];
    for (let k = 1; k < 4; k++) { mu = Math.min(mu, U[(b + k) * 4]); mv = Math.min(mv, U[(b + k) * 4 + 1]); }
    const su = Math.floor(mu / POS_SCALE) * POS_SCALE, sv = Math.floor(mv / POS_SCALE) * POS_SCALE;
    if (su || sv) for (let k = 0; k < 4; k++) { U[(b + k) * 4] -= su; U[(b + k) * 4 + 1] -= sv; }
    const o = alt ? 1 : 0;
    const v0 = b + o, v1 = b + ((1 + o) & 3), v2 = b + ((2 + o) & 3), v3 = b + ((3 + o) & 3);
    const I = this.idx;
    if (!reverse) { I[this.ni++] = v0; I[this.ni++] = v1; I[this.ni++] = v2; I[this.ni++] = v0; I[this.ni++] = v2; I[this.ni++] = v3; }
    else { I[this.ni++] = v0; I[this.ni++] = v2; I[this.ni++] = v1; I[this.ni++] = v0; I[this.ni++] = v3; I[this.ni++] = v2; }
  }
  finish(): MeshBuffers | null {
    if (!this.ni) return null;
    const nq = this.ni / 6;
    const secOf = new Uint8Array(nq);
    const counts = new Uint32Array(SECTIONS + 1);
    const I = this.idx, P = this.pos, lim = 16 * POS_SCALE;
    for (let q = 0; q < nq; q++) {
      let my = Infinity;
      for (let k = 0; k < 6; k++) { const y = P[I[q * 6 + k] * 3 + 1]; if (y < my) my = y; }
      const sc = Math.max(0, Math.min(SECTIONS - 1, Math.floor((my + 1) / lim)));
      secOf[q] = sc;
      counts[sc + 1] += 6;
    }
    for (let i = 1; i <= SECTIONS; i++) counts[i] += counts[i - 1];
    const sec = counts.slice();
    const out = this.nv <= 65535 ? new Uint16Array(this.ni) : new Uint32Array(this.ni);
    const at = counts.slice();
    for (let q = 0; q < nq; q++) {
      const o = at[secOf[q]];
      for (let k = 0; k < 6; k++) out[o + k] = I[q * 6 + k];
      at[secOf[q]] += 6;
    }
    return {
      pos: this.pos.slice(0, this.nv * 3), uv: this.uv.slice(0, this.nv * 4), light: this.light.slice(0, this.nv * 4),
      tint: this.tint.slice(0, this.nv * 4), idx: out, sec,
    };
  }
}

const region = new Uint16Array(VOL);
const sky = new Uint8Array(VOL);
const blk = new Uint8Array(VOL);
const queue = new Int32Array(VOL);
const builders = [new Builder(), new Builder(), new Builder()];

const SHADE = [153, 153, 255, 128, 204, 204];
const NORMALS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const TANG: [number, number][] = [[2, 1], [2, 1], [0, 2], [0, 2], [0, 1], [0, 1]];
const UVMAP: [number, number, number, number][] = [[2, -1, 1, -1], [2, 1, 1, -1], [0, 1, 2, 1], [0, 1, 2, -1], [0, 1, 1, -1], [0, -1, 1, -1]];
const CTM_BASE = 0xfef;
const FLIPWIND: boolean[] = [];
for (let d = 0; d < 6; d++) {
  const [a, b] = TANG[d];
  const e1 = [0, 0, 0], e2 = [0, 0, 0];
  e1[a] = 1; e2[b] = 1;
  const cx = e1[1] * e2[2] - e1[2] * e2[1], cy = e1[2] * e2[0] - e1[0] * e2[2], cz = e1[0] * e2[1] - e1[1] * e2[0];
  const n = NORMALS[d];
  FLIPWIND[d] = cx * n[0] + cy * n[1] + cz * n[2] < 0;
}

export interface MesherContext { atlas: AtlasData; gen: WorldGenerator; opts?: { glass: boolean; grass: 'off' | 'fast' | 'fancy' } }

function ridx(x: number, y: number, z: number): number { return (y * R + z) * R + x; }

function buildRegion(chunks: (Uint16Array | null)[]): number {
  let maxY = 0;
  for (let cz = 0; cz < 3; cz++) for (let cx = 0; cx < 3; cx++) {
    const c = chunks[cz * 3 + cx];
    const ox = cx * 16, oz = cz * 16;
    for (let y = 0; y < H; y++) for (let z = 0; z < 16; z++) {
      const ro = (y * R + oz + z) * R + ox;
      const co = (y * 16 + z) * 16;
      if (!c) { region.fill(0, ro, ro + 16); continue; }
      for (let x = 0; x < 16; x++) {
        const v = c[co + x];
        region[ro + x] = v;
        if (v !== 0 && y > maxY) maxY = y;
      }
    }
  }
  return Math.min(H - 1, maxY + 1);
}

function computeLight(maxY: number): void {
  sky.fill(0); blk.fill(0);
  for (let z = 0; z < R; z++) for (let x = 0; x < R; x++) {
    let level = 15;
    for (let y = H - 1; y >= 0; y--) {
      const i = ridx(x, y, z);
      if (level > 0) {
        const f = LIGHT_FILTER[region[i] & 255];
        if (f >= 15) level = 0; else if (f > 0) level = Math.max(0, level - f);
      }
      sky[i] = level;
    }
  }
  let qh = 0, qt = 0;
  for (let y = 0; y <= maxY; y++) for (let z = 0; z < R; z++) for (let x = 0; x < R; x++) {
    const i = ridx(x, y, z);
    const L = sky[i];
    if (L <= 1) continue;
    const need = L - 1;
    if ((x > 0 && sky[i - 1] < need && !OPAQUE[region[i - 1] & 255]) || (x < R - 1 && sky[i + 1] < need && !OPAQUE[region[i + 1] & 255])
      || (z > 0 && sky[i - R] < need && !OPAQUE[region[i - R] & 255]) || (z < R - 1 && sky[i + R] < need && !OPAQUE[region[i + R] & 255])
      || (y > 0 && sky[i - RA] < need && !OPAQUE[region[i - RA] & 255])) queue[qt++] = i;
  }
  const spread = (arr: Uint8Array) => {
    while (qh < qt) {
      const i = queue[qh++];
      const L = arr[i];
      if (L <= 1) continue;
      const y = (i / RA) | 0, rem = i - y * RA, z = (rem / R) | 0, x = rem - z * R;
      const tryN = (n: number) => {
        const id = region[n] & 255;
        if (OPAQUE[id]) return;
        const nl = L - Math.max(1, LIGHT_FILTER[id]);
        if (nl > arr[n]) { arr[n] = nl; if (qt < VOL) queue[qt++] = n; }
      };
      if (x > 0) tryN(i - 1);
      if (x < R - 1) tryN(i + 1);
      if (z > 0) tryN(i - R);
      if (z < R - 1) tryN(i + R);
      if (y > 0) tryN(i - RA);
      if (y < H - 1) tryN(i + RA);
    }
  };
  spread(sky);
  qh = 0; qt = 0;
  for (let y = 0; y <= maxY; y++) for (let z = 0; z < R; z++) for (let x = 0; x < R; x++) {
    const i = ridx(x, y, z);
    const e = LIGHT_EMIT[region[i] & 255];
    if (e) { blk[i] = e; queue[qt++] = i; }
  }
  spread(blk);
}

function cellOpaque(x: number, y: number, z: number): number {
  if (y < 0) return 1;
  if (y >= H) return 0;
  return OPAQUE[region[ridx(x, y, z)] & 255];
}

function cellSky(x: number, y: number, z: number): number { return y >= H ? 15 : y < 0 ? 0 : sky[ridx(x, y, z)]; }
function cellBlk(x: number, y: number, z: number): number { return y >= H || y < 0 ? 0 : blk[ridx(x, y, z)]; }

const cornerSky = new Float32Array(4), cornerBlk = new Float32Array(4), cornerAo = new Uint8Array(4);

function faceCorners(rx: number, y: number, rz: number, d: number, smooth: boolean): void {
  const n = NORMALS[d];
  const qx = rx + n[0], qy = y + n[1], qz = rz + n[2];
  const baseS = cellSky(qx, qy, qz), baseB = cellBlk(qx, qy, qz);
  if (!smooth) {
    for (let k = 0; k < 4; k++) { cornerSky[k] = baseS; cornerBlk[k] = baseB; cornerAo[k] = 3; }
    return;
  }
  const [a, b] = TANG[d];
  const t1 = [0, 0, 0], t2 = [0, 0, 0];
  for (let k = 0; k < 4; k++) {
    const su = k === 1 || k === 2 ? 1 : -1;
    const sv = k === 2 || k === 3 ? 1 : -1;
    t1[0] = t1[1] = t1[2] = 0; t2[0] = t2[1] = t2[2] = 0;
    t1[a] = su; t2[b] = sv;
    const s1x = qx + t1[0], s1y = qy + t1[1], s1z = qz + t1[2];
    const s2x = qx + t2[0], s2y = qy + t2[1], s2z = qz + t2[2];
    const cx = qx + t1[0] + t2[0], cy = qy + t1[1] + t2[1], cz = qz + t1[2] + t2[2];
    const inR = (x: number, z: number) => x >= 0 && x < R && z >= 0 && z < R;
    const o1 = inR(s1x, s1z) ? cellOpaque(s1x, s1y, s1z) : 0;
    const o2 = inR(s2x, s2z) ? cellOpaque(s2x, s2y, s2z) : 0;
    const oc = inR(cx, cz) ? cellOpaque(cx, cy, cz) : 0;
    cornerAo[k] = o1 && o2 ? 0 : 3 - (o1 + o2 + oc);
    let ss = baseS, sb = baseB, cnt = 1;
    if (!o1 && inR(s1x, s1z)) { ss += cellSky(s1x, s1y, s1z); sb += cellBlk(s1x, s1y, s1z); cnt++; }
    if (!o2 && inR(s2x, s2z)) { ss += cellSky(s2x, s2y, s2z); sb += cellBlk(s2x, s2y, s2z); cnt++; }
    if (!oc && !(o1 && o2) && inR(cx, cz)) { ss += cellSky(cx, cy, cz); sb += cellBlk(cx, cy, cz); cnt++; }
    cornerSky[k] = ss / cnt; cornerBlk[k] = sb / cnt;
  }
}

const biomeGrid = new Float32Array(5 * 5 * 9);

function computeBiomeGrid(ctx: MesherContext, cx: number, cz: number): void {
  for (let gz = 0; gz < 5; gz++) for (let gx = 0; gx < 5; gx++) {
    const bi = ctx.gen.biomeIndex(cx * 16 + gx * 4, cz * 16 + gz * 4);
    const col = ctx.atlas.biomeColors[bi];
    for (let k = 0; k < 9; k++) biomeGrid[(gz * 5 + gx) * 9 + k] = col[k];
  }
}

const tintOut = [0, 0, 0];
function tintAt(lx: number, lz: number, code: number): void {
  if (code === 3) { tintOut[0] = 128; tintOut[1] = 167; tintOut[2] = 85; return; }
  if (code === 4) { tintOut[0] = 97; tintOut[1] = 153; tintOut[2] = 97; return; }
  const off = code === 1 ? 0 : code === 2 ? 3 : 6;
  const fx = Math.min(3.999, lx / 4), fz = Math.min(3.999, lz / 4);
  const gx = Math.floor(fx), gz = Math.floor(fz), tx = fx - gx, tz = fz - gz;
  for (let k = 0; k < 3; k++) {
    const a = biomeGrid[(gz * 5 + gx) * 9 + off + k], b = biomeGrid[(gz * 5 + gx + 1) * 9 + off + k];
    const c = biomeGrid[((gz + 1) * 5 + gx) * 9 + off + k], d = biomeGrid[((gz + 1) * 5 + gx + 1) * 9 + off + k];
    tintOut[k] = ((a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * tz) & 0xf8;
  }
}

const maskTex = new Int32Array(160 * 16), maskLight = new Int32Array(160 * 16), maskAo = new Int32Array(160 * 16), maskTint = new Int32Array(160 * 16);

function cubePass(code: number): number {
  return code === 1 ? 0 : code === 4 ? 2 : 1;
}

function faceVisible(id: number, code: number, nv: number, ny: number): boolean {
  if (ny < 0) return false;
  if (ny >= H) return true;
  const nid = nv & 255;
  if (OPAQUE[nid]) return false;
  if (nid === id && CULLSELF[id]) return false;
  return true;
}

export function meshChunk(ctx: MesherContext, cx: number, cz: number, chunks: (Uint16Array | null)[], smooth: boolean): MeshResult {
  const maxY = buildRegion(chunks);
  computeLight(maxY);
  computeBiomeGrid(ctx, cx, cz);
  for (const b of builders) b.reset();
  const tiles = ctx.atlas.blockTiles;
  const tintT = ctx.atlas.tintTable;
  const top = Math.min(H, maxY + 1);
  const grassMode = ctx.opts?.grass ?? 'fancy';
  const glassOn = ctx.opts?.glass !== false;

  for (let d = 0; d < 6; d++) {
    const n = NORMALS[d];
    const [ua, va] = TANG[d];
    const axis = n[0] ? 0 : n[1] ? 1 : 2;
    const dimU = ua === 1 ? top : 16, dimV = va === 1 ? top : 16;
    const slices = axis === 1 ? top : 16;
    for (let s = 0; s < slices; s++) {
      let any = false;
      for (let v = 0; v < dimV; v++) for (let u = 0; u < dimU; u++) {
        const p = [0, 0, 0];
        p[axis] = s; p[ua] = u; p[va] = v;
        const x = p[0], y = p[1], z = p[2];
        const mi = v * dimU + u;
        maskTex[mi] = 0;
        const rx = x + 16, rz = z + 16;
        const bv = region[ridx(rx, y, rz)];
        const id = bv & 255;
        const code = RENDER[id];
        if (code < 1 || code > 4) continue;
        const ny = y + n[1];
        const nv = ny >= 0 && ny < H ? region[ridx(rx + n[0], ny, rz + n[2])] : 0;
        if (!faceVisible(id, code, nv, ny)) continue;
        let tile = tiles[id * FS + d];
        if (ORIENT[id]) {
          const f = (bv >>> 8) & 3;
          const fd = f === 0 ? 5 : f === 1 ? 0 : f === 2 ? 4 : 1;
          if (fd === d && tiles[id * FS + 6] >= 0) tile = tiles[id * FS + 6];
        }
        let ovTile = d !== 2 && d !== 3 ? tiles[id * FS + 7] : -1;
        const tcode = tintT[id * 2];
        let tintBase = tcode && (!tintT[id * 2 + 1] || d === 2) ? 1 : 0;
        if (d !== 2 && d !== 3 && (id === B.GRASS || id === B.SNOWY_GRASS) && grassMode !== 'off' && y > 0) {
          const below = region[ridx(rx + n[0], y - 1, rz + n[2])] & 255;
          if (grassMode === 'fast' || below === id) { tile = tiles[id * FS + 2]; ovTile = -1; tintBase = tcode ? 1 : 0; }
        }
        if (code === 3 && glassOn) {
          const [uAx, uS, vAx, vS] = UVMAP[d];
          const chk = (ax: number, sg: number) => {
            const o = [0, 0, 0]; o[ax] = sg;
            const ny2 = y + o[1];
            if (ny2 < 0 || ny2 >= H) return false;
            if ((region[ridx(rx + o[0], ny2, rz + o[2])] & 255) !== id) return false;
            const fy = ny2 + n[1];
            const fr = fy >= 0 && fy < H ? region[ridx(rx + o[0] + n[0], fy, rz + o[2] + n[2])] & 255 : 0;
            return fr !== id && !OPAQUE[fr];
          };
          let ctm = 0;
          if (chk(uAx, -uS)) ctm |= 1;
          if (chk(uAx, uS)) ctm |= 2;
          if (chk(vAx, -vS)) ctm |= 4;
          if (chk(vAx, vS)) ctm |= 8;
          if (ctm) ovTile = CTM_BASE + ctm;
        }
        faceCorners(rx, y, rz, d, smooth);
        let lk = 0, ak = 0;
        for (let k = 0; k < 4; k++) {
          lk |= (Math.round(cornerSky[k]) & 15) << (k * 4);
          lk |= (Math.round(cornerBlk[k]) & 15) << (16 + k * 4);
          ak |= cornerAo[k] << (k * 2);
        }
        let tk = 0;
        if (tcode && (tintBase || ovTile >= 0)) { tintAt(x, z, tcode); tk = (tintOut[0] << 16) | (tintOut[1] << 8) | tintOut[2]; }
        maskTex[mi] = (tile + 1) | ((ovTile + 1) << 12) | (cubePass(code) << 24) | (tintBase << 26) | ((EXTRA[id] >> 3) << 27);
        maskLight[mi] = lk;
        maskAo[mi] = ak;
        maskTint[mi] = tk;
        any = true;
      }
      if (!any) continue;
      for (let v = 0; v < dimV; v++) {
        for (let u = 0; u < dimU;) {
          const mi = v * dimU + u;
          const t = maskTex[mi];
          if (!t) { u++; continue; }
          const L = maskLight[mi], A = maskAo[mi], T = maskTint[mi];
          let w = 1;
          while (u + w < dimU) {
            if (ua === 1 && (u + w) % 16 === 0) break;
            const j = mi + w;
            if (maskTex[j] !== t || maskLight[j] !== L || maskAo[j] !== A || maskTint[j] !== T) break;
            w++;
          }
          let h = 1;
          outer: while (v + h < dimV) {
            if (va === 1 && (v + h) % 16 === 0) break;
            const row = (v + h) * dimU + u;
            for (let k = 0; k < w; k++) {
              const j = row + k;
              if (maskTex[j] !== t || maskLight[j] !== L || maskAo[j] !== A || maskTint[j] !== T) break outer;
            }
            h++;
          }
          for (let dv = 0; dv < h; dv++) maskTex.fill(0, (v + dv) * dimU + u, (v + dv) * dimU + u + w);
          const tile = (t & 0xfff) - 1, ovRaw = ((t >> 12) & 0xfff) - 1, ov = ovRaw >= CTM_BASE ? -1 - (ovRaw - CTM_BASE) : ovRaw, pass = (t >> 24) & 3, tb = ((t >> 26) & 1) | (((t >> 27) & 7) << 3);
          emitQuad(builders[pass], d, axis, s, ua, u, w, va, v, h, tile, ov, L, A, T, tb);
          u += w;
        }
      }
    }
  }

  const chests: number[] = [];
  for (let y = 0; y < top; y++) for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
    const rx = x + 16, rz = z + 16;
    const v = region[ridx(rx, y, rz)];
    const id = v & 255;
    const code = RENDER[id];
    if (code < 5) continue;
    if (code === 12) { chests.push(x, y, z, (v >>> 8) & 3); continue; }
    special(ctx, code, id, v, x, y, z, rx, rz, smooth);
  }
  return { opaque: builders[0].finish(), cutout: builders[1].finish(), trans: builders[2].finish(), chests: chests.length ? new Int32Array(chests) : null, vis: visGraph() };
}

const visSeen = new Uint8Array(4096);
const visQ = new Int32Array(4096);
const OCC = new Uint8Array(256);
for (const b of BLOCKS) if (b && b.opaque && b.render === 'cube') OCC[b.id] = 1;

export function facePair(a: number, b: number): number {
  if (a > b) { const t = a; a = b; b = t; }
  return [0, 0, 1, 2, 3, 4, 0, 0, 5, 6, 7, 8, 0, 0, 0, 9, 10, 11, 0, 0, 0, 0, 12, 13, 0, 0, 0, 0, 0, 14][a * 6 + b] ?? 0;
}

function visGraph(): Uint16Array {
  const out = new Uint16Array(SECTIONS);
  for (let sc = 0; sc < SECTIONS; sc++) {
    const y0 = sc * 16;
    let open = 0;
    for (let i = 0; i < 4096; i++) {
      const x = i & 15, z = (i >> 4) & 15, y = y0 + (i >> 8);
      const solid = y >= H || OCC[region[ridx(x + 16, y, z + 16)] & 255] === 1;
      visSeen[i] = solid ? 1 : 0;
      if (!solid) open++;
    }
    if (open === 0) { out[sc] = 0; continue; }
    if (open === 4096) { out[sc] = 0x7fff; continue; }
    let mask = 0;
    for (let st = 0; st < 4096; st++) {
      if (visSeen[st]) continue;
      let head = 0, tail = 0, faces = 0;
      visQ[tail++] = st; visSeen[st] = 1;
      while (head < tail) {
        const i = visQ[head++];
        const x = i & 15, z = (i >> 4) & 15, y = i >> 8;
        if (x === 0) faces |= 2; else if (x === 15) faces |= 1;
        if (y === 0) faces |= 8; else if (y === 15) faces |= 4;
        if (z === 0) faces |= 32; else if (z === 15) faces |= 16;
        if (x > 0 && !visSeen[i - 1]) { visSeen[i - 1] = 1; visQ[tail++] = i - 1; }
        if (x < 15 && !visSeen[i + 1]) { visSeen[i + 1] = 1; visQ[tail++] = i + 1; }
        if (z > 0 && !visSeen[i - 16]) { visSeen[i - 16] = 1; visQ[tail++] = i - 16; }
        if (z < 15 && !visSeen[i + 16]) { visSeen[i + 16] = 1; visQ[tail++] = i + 16; }
        if (y > 0 && !visSeen[i - 256]) { visSeen[i - 256] = 1; visQ[tail++] = i - 256; }
        if (y < 15 && !visSeen[i + 256]) { visSeen[i + 256] = 1; visQ[tail++] = i + 256; }
      }
      for (let a = 0; a < 6; a++) if (faces & (1 << a)) for (let b = a + 1; b < 6; b++) if (faces & (1 << b)) mask |= 1 << facePair(a, b);
    }
    out[sc] = mask;
  }
  return out;
}

function emitQuad(bd: Builder, d: number, axis: number, s: number, ua: number, u0: number, w: number, va: number, v0: number, h: number, tile: number, ov: number, L: number, A: number, T: number, tb: number): void {
  const n = NORMALS[d];
  const plane = s + (n[axis] > 0 ? 1 : 0);
  const [uAx, uS, vAx, vS] = UVMAP[d];
  const r = (T >> 16) & 255, g = (T >> 8) & 255, b = T & 255;
  const shade = SHADE[d];
  const aos = [A & 3, (A >> 2) & 3, (A >> 4) & 3, (A >> 6) & 3];
  for (let k = 0; k < 4; k++) {
    const su = k === 1 || k === 2 ? w : 0;
    const sv = k === 2 || k === 3 ? h : 0;
    const p = [0, 0, 0];
    p[axis] = plane; p[ua] = u0 + su; p[va] = v0 + sv;
    const tu = p[uAx] * uS, tv = p[vAx] * vS;
    const skyL = ((L >> (k * 4)) & 15) * 17, blkL = ((L >> (16 + k * 4)) & 15) * 17;
    bd.vert(p[0], p[1], p[2], tu, tv, tile, ov + 1, skyL, blkL, aos[k] * 85, shade, r, g, b, tb);
  }
  bd.quad(FLIPWIND[d], aos[0] + aos[2] < aos[1] + aos[3]);
}

function quadRaw(bd: Builder, pts: number[][], uvs: number[][], tile: number, sk: number, bl: number, shade: number, r: number, g: number, b: number, flags: number, both: boolean): void {
  for (let k = 0; k < 4; k++) bd.vert(pts[k][0], pts[k][1], pts[k][2], uvs[k][0], uvs[k][1], tile, 0, sk, bl, 255, shade, r, g, b, flags);
  bd.quad(false);
  if (both) {
    for (let k = 3; k >= 0; k--) bd.vert(pts[k][0], pts[k][1], pts[k][2], uvs[k][0], uvs[k][1], tile, 0, sk, bl, 255, shade, r, g, b, flags);
    bd.quad(false);
  }
}

function boxFaces(bd: Builder, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, tileFor: (d: number) => number, sk: number, bl: number, r: number, g: number, b: number, skip?: (d: number) => boolean, uvOverride?: (d: number) => number[][] | null, flags = 0): void {
  const faces: number[][][] = [
    [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]],
    [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]],
    [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]],
    [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]],
    [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]],
    [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]],
  ];
  for (let d = 0; d < 6; d++) {
    if (skip?.(d)) continue;
    const pts = faces[d];
    const [uAx, uS, vAx, vS] = UVMAP[d];
    const uvs = uvOverride?.(d) ?? pts.map((p) => [p[uAx] * uS, p[vAx] * vS]);
    quadRaw(bd, pts, uvs, tileFor(d), sk, bl, SHADE[d], r, g, b, flags, false);
  }
}

function special(ctx: MesherContext, code: number, id: number, v: number, x: number, y: number, z: number, rx: number, rz: number, smooth: boolean): void {
  const tiles = ctx.atlas.blockTiles;
  const sp = ctx.atlas.special;
  const sk = sky[ridx(rx, y, rz)] * 17, bl = blk[ridx(rx, y, rz)] * 17;
  const meta = v >>> 8;
  const tcode = ctx.atlas.tintTable[id * 2];
  let r = 255, g = 255, b = 255;
  if (tcode) { tintAt(x, z, tcode); r = tintOut[0]; g = tintOut[1]; b = tintOut[2]; }
  const cut = builders[1];
  switch (code) {
    case 5: {
      const water = id === B.WATER;
      const bd = water ? builders[2] : builders[0];
      const tile = water ? sp.water : sp.lava;
      if (water) { tintAt(x, z, 0); r = tintOut[0]; g = tintOut[1]; b = tintOut[2]; } else { r = g = b = 255; }
      const wmap = (n: number) => (water && isWaterPlant(n) ? B.WATER : n);
      const above = wmap(y + 1 < H ? region[ridx(rx, y + 1, rz)] & 255 : 0);
      const ht = above === id ? 1 : fluidHeight(v);
      const neigh = (dx: number, dy: number, dz: number) => wmap((y + dy < 0 || y + dy >= H) ? (dy < 0 ? B.STONE : 0) : region[ridx(rx + dx, y + dy, rz + dz)] & 255);
      for (let d = 0; d < 6; d++) {
        const nn = NORMALS[d];
        const nid = neigh(nn[0], nn[1], nn[2]);
        if (nid === id) continue;
        if (OPAQUE[nid] && d !== 2) continue;
        if (d === 2 && OPAQUE[nid] && ht >= 1) continue;
        if (water && nid === B.ICE) continue;
        const nsk = cellSky(rx + nn[0], y + nn[1], rz + nn[2]) * 17, nbl = Math.max(cellBlk(rx + nn[0], y + nn[1], rz + nn[2]), water ? 0 : 15) * 17;
        const y1 = y + ht;
        const P: number[][][] = [
          [[x + 1, y, z + 1], [x + 1, y, z], [x + 1, y1, z], [x + 1, y1, z + 1]],
          [[x, y, z], [x, y, z + 1], [x, y1, z + 1], [x, y1, z]],
          [[x, y1, z + 1], [x + 1, y1, z + 1], [x + 1, y1, z], [x, y1, z]],
          [[x, y, z], [x + 1, y, z], [x + 1, y, z + 1], [x, y, z + 1]],
          [[x, y, z + 1], [x + 1, y, z + 1], [x + 1, y1, z + 1], [x, y1, z + 1]],
          [[x + 1, y, z], [x, y, z], [x, y1, z], [x + 1, y1, z]],
        ];
        const [uAx, uS, vAx, vS] = UVMAP[d];
        const pts = P[d];
        const uvs = pts.map((p) => [p[uAx] * uS, p[vAx] * vS]);
        const flags = (water && d === 2 && ht < 1 ? F_WAVE : 0) | (water ? F_TINT | F_WATER : F_EMIT);
        for (let k = 0; k < 4; k++) bd.vert(pts[k][0], pts[k][1], pts[k][2], uvs[k][0], uvs[k][1], tile, 0, nsk, nbl, 255, SHADE[d], r, g, b, flags);
        bd.quad(false);
        if (water && d === 2) {
          for (let k = 3; k >= 0; k--) bd.vert(pts[k][0], pts[k][1], pts[k][2], uvs[k][0], uvs[k][1], tile, 0, nsk, nbl, 255, 128, r, g, b, F_TINT | F_WATER | (ht < 1 ? F_WAVE : 0));
          bd.quad(false);
        }
      }
      return;
    }
    case 6: case 7: {
      let ox = 0, oz = 0;
      if (OFFSET_PLANT[id]) {
        const hh = hash2(x + 7919 * 0, z, y * 31 + 17);
        ox = ((hh & 15) / 15 - 0.5) * 0.35; oz = (((hh >> 4) & 15) / 15 - 0.5) * 0.35;
      }
      const tile = code === 7 ? sp[`wheat${meta & 7}`] : tiles[id * FS + 4];
      const flags = (id === B.TALL_GRASS || id === B.FERN || code === 7 || isWaterPlant(id) ? 4 : 0) | (tcode ? 1 : 0);
      if (isWaterPlant(id)) special(ctx, 5, B.WATER, B.WATER, x, y, z, rx, rz, smooth);
      const bx = x + ox, bz = z + oz;
      if (code === 6) {
        const a = 0.15, c = 0.85, top2 = y + (id === B.SUGAR_CANE ? 1 : 0.95);
        quadRaw(cut, [[bx + a, y, bz + a], [bx + c, y, bz + c], [bx + c, top2, bz + c], [bx + a, top2, bz + a]], [[0, 1], [1, 1], [1, 0], [0, 0]], tile, sk, bl, 230, r, g, b, flags, true);
        quadRaw(cut, [[bx + a, y, bz + c], [bx + c, y, bz + a], [bx + c, top2, bz + a], [bx + a, top2, bz + c]], [[0, 1], [1, 1], [1, 0], [0, 0]], tile, sk, bl, 230, r, g, b, flags, true);
      } else {
        for (const k of [0.25, 0.75]) {
          quadRaw(cut, [[x + k, y - 1 / 16, z], [x + k, y - 1 / 16, z + 1], [x + k, y + 15 / 16, z + 1], [x + k, y + 15 / 16, z]], [[0, 1], [1, 1], [1, 0], [0, 0]], tile, sk, bl, 220, 255, 255, 255, flags, true);
          quadRaw(cut, [[x, y - 1 / 16, z + k], [x + 1, y - 1 / 16, z + k], [x + 1, y + 15 / 16, z + k], [x, y + 15 / 16, z + k]], [[0, 1], [1, 1], [1, 0], [0, 0]], tile, sk, bl, 220, 255, 255, 255, flags, true);
        }
      }
      return;
    }
    case 13: { redstoneMesh(ctx, id, v, x, y, z, sk, bl); return; }
    case 8: {
      const tile = tiles[id * FS + 4];
      const TE = LIGHT_EMIT[id] > 0 ? F_EMIT : 0;
      const p0 = 7 / 16, p1 = 9 / 16;
      const sideUV = [[p0, 1], [p1, 1], [p1, 6 / 16], [p0, 6 / 16]];
      if (meta === 0) {
        boxFaces(cut, x + p0, y, z + p0, x + p1, y + 10 / 16, z + p1, () => tile, sk, bl, 255, 255, 255, (d) => d === 3, (d) => d === 2 ? [[p0, 8 / 16], [p1, 8 / 16], [p1, 6 / 16], [p0, 6 / 16]] : sideUV, TE);
      } else {
        const [dx, dz] = FACING_DIRS[(meta - 1) & 3];
        const shift = 5.5 / 16, lean = 3 / 16;
        const bx0 = x + p0 + dx * shift, bz0 = z + p0 + dz * shift;
        const y0 = y + 3 / 16, y1 = y + 13 / 16;
        const w = 2 / 16;
        const base = [[bx0, bz0], [bx0 + w, bz0], [bx0 + w, bz0 + w], [bx0, bz0 + w]];
        const topP = base.map(([a, c]) => [a - dx * lean, c - dz * lean]);
        const B0 = base.map(([a, c]) => [a, y0, c]), T0 = topP.map(([a, c]) => [a, y1, c]);
        const sides: [number, number][] = [[1, 2], [3, 0], [2, 3], [0, 1]];
        for (const [i, j] of sides) quadRaw(cut, [B0[i], B0[j], T0[j], T0[i]], sideUV, tile, sk, bl, 220, 255, 255, 255, TE, true);
        quadRaw(cut, [T0[3], T0[2], T0[1], T0[0]], [[p0, 8 / 16], [p1, 8 / 16], [p1, 6 / 16], [p0, 6 / 16]], tile, sk, bl, 255, 255, 255, 255, TE, false);
      }
      return;
    }
    case 9: {
      let f = doorFacing(meta);
      if (meta & DOOR_OPEN) f = (f + 1) & 3;
      const bb = edgeBox(f, 3 / 16);
      const tile = meta & DOOR_UPPER ? sp.doorTop : sp.doorBottom;
      boxFaces(cut, x + bb[0], y + bb[1], z + bb[2], x + bb[3], y + bb[4], z + bb[5], () => tile, sk, bl, 255, 255, 255);
      return;
    }
    case 10: {
      const tile = tiles[id * FS + 4];
      if (id === B.LILY_PAD) {
        const yy = y + 1 / 64;
        const rot = meta & 3;
        const uv = [[0, 1], [1, 1], [1, 0], [0, 0]];
        const ruv = uv.map((_, k) => uv[(k + rot) & 3]);
        quadRaw(cut, [[x, yy, z + 1], [x + 1, yy, z + 1], [x + 1, yy, z], [x, yy, z]], ruv, tile, sk, bl, 255, r, g, b, tcode ? 1 : 0, true);
        return;
      }
      const f = meta & 3;
      const t = 1 / 16;
      const pts: Record<number, number[][]> = {
        0: [[x + 1, y, z + t], [x, y, z + t], [x, y + 1, z + t], [x + 1, y + 1, z + t]],
        1: [[x + 1 - t, y, z + 1], [x + 1 - t, y, z], [x + 1 - t, y + 1, z], [x + 1 - t, y + 1, z + 1]],
        2: [[x, y, z + 1 - t], [x + 1, y, z + 1 - t], [x + 1, y + 1, z + 1 - t], [x, y + 1, z + 1 - t]],
        3: [[x + t, y, z], [x + t, y, z + 1], [x + t, y + 1, z + 1], [x + t, y + 1, z]],
      };
      quadRaw(cut, pts[f], [[0, 1], [1, 1], [1, 0], [0, 0]], tile, sk, bl, 220, 255, 255, 255, 0, true);
      return;
    }
    case 11: {
      const t = 1 / 16;
      const above = y + 1 < H ? region[ridx(rx, y + 1, rz)] & 255 : 0;
      const below = y > 0 ? region[ridx(rx, y - 1, rz)] & 255 : 1;
      boxFaces(cut, x + t, y, z + t, x + 1 - t, y + 1, z + 1 - t, (d) => tiles[id * FS + d], sk, bl, 255, 255, 255,
        (d) => (d === 2 && (above === id || OPAQUE[above] === 1)) || (d === 3 && (below === id || OPAQUE[below] === 1)),
        (d) => {
          if (d === 2 || d === 3) return null;
          const pts = [[0, 1], [1, 1], [1, 0], [0, 0]];
          return pts;
        });
      void smooth;
      return;
    }
  }
}

const RS_TORCH_SIDE_UV = [[7 / 16, 1], [9 / 16, 1], [9 / 16, 6 / 16], [7 / 16, 6 / 16]];
const RS_TORCH_TOP_UV = [[7 / 16, 8 / 16], [9 / 16, 8 / 16], [9 / 16, 6 / 16], [7 / 16, 6 / 16]];

function wireColor(p: number): [number, number, number] {
  const f = p / 15;
  const r = f * 0.6 + (f > 0 ? 0.4 : 0.3), g = Math.max(0, Math.min(1, f * f * 0.7 - 0.5)), b = Math.max(0, Math.min(1, f * f * 0.6 - 0.7));
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function placeBox(face: number, b: number[]): number[] {
  const [x0, y0, z0, x1, y1, z1] = b;
  switch (face) {
    case 0: return b;
    case 5: return [x0, 1 - y1, z0, x1, 1 - y0, z1];
    case 1: return [x0, z0, y0, x1, z1, y1];
    case 3: return [x0, z0, 1 - y1, x1, z1, 1 - y0];
    case 4: return [y0, z0, x0, y1, z1, x1];
    case 2: return [1 - y1, z0, x0, 1 - y0, z1, x1];
    default: return b;
  }
}

const D6_TO_BOX = [1, 0, 3, 2, 5, 4];
const D6V: number[][] = [[-1, 0, 0], [1, 0, 0], [0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1]];

function orientPt(f: number, x: number, y: number, z: number): number[] {
  switch (f) {
    case 2: return [x, 1 - y, 1 - z];
    case 4: return [x, z, 1 - y];
    case 5: return [x, 1 - z, y];
    case 1: return [y, 1 - x, z];
    case 0: return [1 - y, x, z];
    default: return [x, y, z];
  }
}

function cross(a: number[], b: number[]): number[] { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }

function rs6Mesh(ctx: MesherContext, id: number, meta: number, x: number, y: number, z: number, sk0: number, bl0: number): void {
  const sp = ctx.atlas.special;
  const cut = builders[1];
  const rx = x + 16, rz = z + 16;
  const f = meta & 7;
  const fv = D6V[f > 5 ? 3 : f];
  const full = id === B.OBSERVER || id === B.DROPPER || id === B.DISPENSER || ((id === B.PISTON || id === B.STICKY_PISTON) && !(meta & 8));
  const light = (d: number): [number, number] => {
    const n = NORMALS[d];
    const ax = rx + n[0], ay = y + n[1], az = rz + n[2];
    if (!full && (sk0 || bl0)) return [sk0, bl0];
    return [cellSky(ax, ay, az) * 17, (ay < 0 || ay >= H ? 0 : blk[ridx(ax, ay, az)]) * 17];
  };
  const upFor = (n: number[]): number[] => {
    const dot = n[0] * fv[0] + n[1] * fv[1] + n[2] * fv[2];
    if (dot === 0) return fv;
    if (n[1] !== 0) return [0, 0, -1];
    return [0, 1, 0];
  };
  const obox = (lb: number[], tileFor: (d: number, along: number) => number, skipD?: (d: number) => boolean, flags = 0, cull = false, uvFn?: (d: number, p: number[]) => number[]) => {
    const a = orientPt(f, lb[0], lb[1], lb[2]), b = orientPt(f, lb[3], lb[4], lb[5]);
    const x0 = Math.min(a[0], b[0]), y0 = Math.min(a[1], b[1]), z0 = Math.min(a[2], b[2]);
    const x1 = Math.max(a[0], b[0]), y1 = Math.max(a[1], b[1]), z1 = Math.max(a[2], b[2]);
    const faces: number[][][] = [
      [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]],
      [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]],
      [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]],
      [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]],
      [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]],
      [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]],
    ];
    for (let d = 0; d < 6; d++) {
      if (skipD?.(d)) continue;
      const n = NORMALS[d];
      const onEdge = (n[0] > 0 && x1 === 1) || (n[0] < 0 && x0 === 0) || (n[1] > 0 && y1 === 1) || (n[1] < 0 && y0 === 0) || (n[2] > 0 && z1 === 1) || (n[2] < 0 && z0 === 0);
      if (cull && onEdge) {
        const ny = y + n[1];
        if (ny >= 0 && ny < H && OPAQUE[region[ridx(rx + n[0], ny, rz + n[2])] & 255]) continue;
      }
      const along = n[0] * fv[0] + n[1] * fv[1] + n[2] * fv[2];
      const up = upFor(n), right = cross(up, n);
      const uvs = faces[d].map((pt) => {
        if (uvFn) return uvFn(d, pt);
        const q = [pt[0] - 0.5, pt[1] - 0.5, pt[2] - 0.5];
        return [0.5 + q[0] * right[0] + q[1] * right[1] + q[2] * right[2], 0.5 - (q[0] * up[0] + q[1] * up[1] + q[2] * up[2])];
      });
      const [sk, bl] = onEdge || !(sk0 || bl0) ? light(d) : [sk0, bl0];
      quadRaw(cut, faces[d].map((pt) => [x + pt[0], y + pt[1], z + pt[2]]), uvs, tileFor(d, along), sk, bl, SHADE[d], 255, 255, 255, flags, false);
    }
  };
  if (id === B.OBSERVER) {
    const back = meta & 8 ? sp.observer_back_on : sp.observer_back;
    const vert = f === 2 || f === 3;
    obox([0, 0, 0, 1, 1, 1], (d, al) => {
      if (al > 0) return sp.observer_front;
      if (al < 0) return back;
      const n = NORMALS[d];
      return vert ? (n[0] !== 0 ? sp.observer_top : sp.observer_side) : n[1] !== 0 ? sp.observer_top : sp.observer_side;
    }, undefined, 0, true);
    return;
  }
  if (id === B.DROPPER || id === B.DISPENSER) {
    const vert = f === 2 || f === 3;
    const front = id === B.DROPPER ? (vert ? sp.dropper_front_vertical : sp.dropper_front) : vert ? sp.dispenser_front_vertical : sp.dispenser_front;
    obox([0, 0, 0, 1, 1, 1], (d, al) => {
      if (al > 0) return front;
      if (vert || NORMALS[d][1] !== 0 || al < 0) return sp.furnace_top;
      return sp.furnace_side;
    }, undefined, 0, true);
    return;
  }
  const sticky = id === B.STICKY_PISTON || (id === B.PISTON_HEAD && !!(meta & 8));
  const top = sticky ? sp.piston_top_sticky : sp.piston_top;
  if (id === B.PISTON || id === B.STICKY_PISTON) {
    if (!(meta & 8)) {
      obox([0, 0, 0, 1, 1, 1], (_d, al) => (al > 0 ? top : al < 0 ? sp.piston_bottom : sp.piston_side), undefined, 0, true);
      return;
    }
    obox([0, 0, 0, 1, 12 / 16, 1], (_d, al) => (al > 0 ? sp.piston_inner : al < 0 ? sp.piston_bottom : sp.piston_side), undefined, 0, true);
    return;
  }
  if (id === B.PISTON_HEAD) {
    obox([0, 12 / 16, 0, 1, 1, 1], (_d, al) => (al > 0 ? top : al < 0 ? sp.piston_top : sp.piston_side));
    const arm = (d: number, pt: number[]): number[] => {
      const along = (pt[0] - 0.5) * fv[0] + (pt[1] - 0.5) * fv[1] + (pt[2] - 0.5) * fv[2];
      const n = NORMALS[d];
      const side = cross(n, fv);
      const across = (pt[0] - 0.5) * side[0] + (pt[1] - 0.5) * side[1] + (pt[2] - 0.5) * side[2];
      return [along + 0.75, across + 0.125];
    };
    obox([6 / 16, -4 / 16, 6 / 16, 10 / 16, 12 / 16, 10 / 16], () => sp.piston_side, (d) => { const n = NORMALS[d]; return n[0] * fv[0] + n[1] * fv[1] + n[2] * fv[2] !== 0; }, 0, false, arm);
    return;
  }
  if (id === B.HOPPER) {
    const out = sp.hopper_outside, inside = sp.hopper_inside;
    const hb = (b: number[], t: (d: number) => number, skip?: (d: number) => boolean) => boxFaces(cut, x + b[0], y + b[1], z + b[2], x + b[3], y + b[4], z + b[5], t, sk0, bl0, 255, 255, 255, skip);
    const yy = 10 / 16, w = 2 / 16;
    hb([0, yy, 0, 1, 1, w], (d) => (d === 2 ? sp.hopper_top : d === 4 ? inside : out));
    hb([0, yy, 1 - w, 1, 1, 1], (d) => (d === 2 ? sp.hopper_top : d === 5 ? inside : out));
    hb([0, yy, w, w, 1, 1 - w], (d) => (d === 2 ? sp.hopper_top : d === 0 ? inside : out), (d) => d === 4 || d === 5);
    hb([1 - w, yy, w, 1, 1, 1 - w], (d) => (d === 2 ? sp.hopper_top : d === 1 ? inside : out), (d) => d === 4 || d === 5);
    hb([w, yy, w, 1 - w, 11 / 16, 1 - w], (d) => (d === 2 ? inside : out), (d) => d !== 2 && d !== 3);
    hb([4 / 16, 4 / 16, 4 / 16, 12 / 16, yy, 12 / 16], () => out, (d) => d === 2);
    const o = meta & 7;
    const spout = o === 2 ? [6 / 16, 0, 6 / 16, 10 / 16, 4 / 16, 10 / 16]
      : o === 0 ? [0, 4 / 16, 6 / 16, 4 / 16, 8 / 16, 10 / 16]
      : o === 1 ? [12 / 16, 4 / 16, 6 / 16, 1, 8 / 16, 10 / 16]
      : o === 4 ? [6 / 16, 4 / 16, 0, 10 / 16, 8 / 16, 4 / 16]
      : [6 / 16, 4 / 16, 12 / 16, 10 / 16, 8 / 16, 1];
    hb(spout, () => out);
  }
}

function redstoneMesh(ctx: MesherContext, id: number, v: number, x: number, y: number, z: number, sk: number, bl: number): void {
  const tiles = ctx.atlas.blockTiles;
  const cut = builders[1];
  const meta = v >>> 8;
  const rx = x + 16, rz = z + 16;
  const box = (b: number[], tileFor: (d: number) => number, flags = 0, uv?: (d: number) => number[][] | null, rr = 255, gg = 255, bb = 255) =>
    boxFaces(cut, x + b[0], y + b[1], z + b[2], x + b[3], y + b[4], z + b[5], tileFor, sk, bl, rr, gg, bb, undefined, uv, flags);
  if (id === B.REDSTONE_WIRE) {
    const get = (a: number, b: number, c: number) => (b < 0 || b >= H ? 0 : region[ridx(a - x + rx, b, c - z + rz)]);
    const shape = wireShape(get, x, y, z);
    const [r, g, b] = wireColor(meta & 15);
    const dot = tiles[id * FS + 2], line0 = tiles[id * FS + 0], line1 = tiles[id * FS + 4];
    const h = y + 1 / 64;
    const conn = [shape & 3, (shape >> 2) & 3, (shape >> 4) & 3, (shape >> 6) & 3];
    const straightX = conn[0] && conn[1] && !conn[2] && !conn[3], straightZ = conn[2] && conn[3] && !conn[0] && !conn[1];
    const flat = (x0: number, z0: number, x1: number, z1: number, tile: number, uvs: number[][]) =>
      quadRaw(cut, [[x + x0, h, z + z1], [x + x1, h, z + z1], [x + x1, h, z + z0], [x + x0, h, z + z0]], uvs, tile, sk, bl, 255, r, g, b, F_TINT, false);
    const rx2 = (x0: number, z0: number, x1: number, z1: number) => [[z1, x0], [z1, x1], [z0, x1], [z0, x0]];
    if (straightX) flat(0, 0, 1, 1, line1, rx2(0, 0, 1, 1));
    else if (straightZ) flat(0, 0, 1, 1, line0, [[0, 1], [1, 1], [1, 0], [0, 0]]);
    else {
      flat(0, 0, 1, 1, dot, [[0, 1], [1, 1], [1, 0], [0, 0]]);
      if (conn[0]) flat(0, 0, 0.5, 1, line1, rx2(0, 0, 0.5, 1));
      if (conn[1]) flat(0.5, 0, 1, 1, line1, rx2(0.5, 0, 1, 1));
      if (conn[2]) flat(0, 0, 1, 0.5, line0, [[0, 0.5], [1, 0.5], [1, 0], [0, 0]]);
      if (conn[3]) flat(0, 0.5, 1, 1, line0, [[0, 1], [1, 1], [1, 0.5], [0, 0.5]]);
    }
    const sides: [number, number, number][] = [[0, -1, 0], [1, 1, 0], [2, 0, -1], [3, 0, 1]];
    for (const [i, dx, dz] of sides) {
      if (conn[i] !== 2) continue;
      const e = 1 / 64;
      const px = dx < 0 ? x + e : dx > 0 ? x + 1 - e : 0, pz = dz < 0 ? z + e : dz > 0 ? z + 1 - e : 0;
      const pts = dx ? [[px, y, z], [px, y, z + 1], [px, y + 1, z + 1], [px, y + 1, z]] : [[x, y, pz], [x + 1, y, pz], [x + 1, y + 1, pz], [x, y + 1, pz]];
      quadRaw(cut, pts, [[0, 1], [1, 1], [1, 0], [0, 0]], line0, sk, bl, 230, r, g, b, F_TINT, true);
    }
    return;
  }
  if (id === B.LEVER || id === B.STONE_BUTTON || id === B.OAK_BUTTON || id === B.STONE_PRESSURE_PLATE || id === B.OAK_PRESSURE_PLATE) {
    const t = (d: number) => tiles[id * FS + d];
    if (id === B.STONE_PRESSURE_PLATE || id === B.OAK_PRESSURE_PLATE) { box([1 / 16, 0, 1 / 16, 15 / 16, meta & 1 ? 0.5 / 16 : 1 / 16, 15 / 16], t); return; }
    const face = meta & 7, on = !!(meta & 8);
    if (id !== B.LEVER) {
      const hgt = on ? 1 / 16 : 2 / 16;
      const flr = face === 0 || face === 5 ? [5 / 16, 0, 6 / 16, 11 / 16, hgt, 10 / 16] : [5 / 16, 0, 6 / 16, 11 / 16, hgt, 10 / 16];
      box(placeBox(face, face === 0 || face === 5 ? flr : [flr[0], flr[1], flr[2], flr[3], flr[4], flr[5]]), t);
      return;
    }
    const alongX = !!(meta & 16);
    const base = alongX ? [4 / 16, 0, 5 / 16, 12 / 16, 3 / 16, 11 / 16] : [5 / 16, 0, 4 / 16, 11 / 16, 3 / 16, 12 / 16];
    const baseTile = tiles[id * FS + 3];
    box(placeBox(face, base), () => baseTile);
    const lean = on ? 3 / 16 : -3 / 16;
    const hx = alongX ? lean : 0, hz = alongX ? 0 : lean;
    const handle = [7 / 16 + hx, 3 / 16, 7 / 16 + hz, 9 / 16 + hx, 11 / 16, 9 / 16 + hz];
    box(placeBox(face, handle), () => tiles[id * FS + 4], 0, (d) => (d === 2 || d === 3 ? RS_TORCH_TOP_UV : RS_TORCH_SIDE_UV));
    return;
  }
  if (id >= B.OBSERVER && id <= B.DISPENSER && id !== B.MOVING_PISTON) { rs6Mesh(ctx, id, meta, x, y, z, sk, bl); return; }
  if (id === B.REPEATER || id === B.COMPARATOR) {
    const out = meta & 3;
    const powered = id === B.REPEATER ? !!(meta & 16) : !!(meta & 8);
    const topTile = powered && tiles[id * FS + 6] >= 0 ? tiles[id * FS + 6] : tiles[id * FS + 2];
    const rot = (lx: number, lz: number): number[] => out === 0 ? [lx, lz] : out === 2 ? [1 - lx, 1 - lz] : out === 1 ? [lz, 1 - lx] : [1 - lz, lx];
    box([0, 0, 0, 1, 2 / 16, 1], (d) => (d === 2 ? topTile : tiles[id * FS + d]), 0, (d) => (d === 2 ? [rot(0, 1), rot(1, 1), rot(1, 0), rot(0, 0)] : null));
    const [fx, fz] = FACING_DIRS[out];
    const torchAt = (f: number, l: number, lit: boolean) => {
      const cx = 0.5 + fx * f - fz * l, cz = 0.5 + fz * f + fx * l;
      const tile = tiles[(lit ? B.REDSTONE_TORCH : B.UNLIT_REDSTONE_TORCH) * FS + 4];
      box([cx - 1 / 16, 2 / 16, cz - 1 / 16, cx + 1 / 16, 7 / 16, cz + 1 / 16], () => tile, lit ? F_EMIT : 0, (d) => (d === 2 || d === 3 ? RS_TORCH_TOP_UV : RS_TORCH_SIDE_UV));
    };
    if (id === B.REPEATER) {
      const delay = ((meta >> 2) & 3) + 1;
      torchAt(5 / 16, 0, powered);
      const back = 1 / 16 - (delay - 1) * 2 / 16;
      if (meta & 32) {
        const bt = tiles[B.BEDROCK * FS + 2];
        const w = 1 / 16, cx = 0.5 + fx * back, cz = 0.5 + fz * back;
        box(fx ? [cx - w, 2 / 16, 2 / 16, cx + w, 4 / 16, 14 / 16] : [2 / 16, 2 / 16, cz - w, 14 / 16, 4 / 16, cz + w], () => bt);
      } else torchAt(back, 0, powered);
    } else {
      torchAt(-5 / 16, 3 / 16, powered);
      torchAt(-5 / 16, -3 / 16, powered);
      torchAt(5 / 16, 0, !!(meta & 4));
    }
  }
}

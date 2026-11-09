import { isSolid, B } from '../blocks';
import type { BlockReader } from '../physics';

export interface PathNode { x: number; y: number; z: number; }

function passable(w: BlockReader, x: number, y: number, z: number): boolean {
  const v = w.getBlock(x, y, z);
  if (isSolid(v)) return false;
  return (v & 0xff) !== B.LAVA && (v & 0xff) !== B.CACTUS;
}

export function standable(w: BlockReader, x: number, y: number, z: number, tall: boolean): boolean {
  if (!passable(w, x, y, z)) return false;
  if (tall && !passable(w, x, y + 1, z)) return false;
  const below = w.getBlock(x, y - 1, z);
  const bid = below & 0xff;
  if (bid === B.LAVA || bid === B.CACTUS) return false;
  if (isSolid(below)) return true;
  const here = w.getBlock(x, y, z) & 0xff;
  return here === B.WATER || bid === B.WATER;
}

export function findPath(w: BlockReader, sx: number, sy: number, sz: number, tx: number, ty: number, tz: number, tall: boolean, maxNodes = 320): PathNode[] | null {
  sx = Math.floor(sx); sy = Math.floor(sy); sz = Math.floor(sz);
  tx = Math.floor(tx); ty = Math.floor(ty); tz = Math.floor(tz);
  const key = (x: number, y: number, z: number) => ((x - sx + 512) * 1024 + (z - sz + 512)) * 256 + (y & 255);
  const open: { x: number; y: number; z: number; g: number; f: number; k: number }[] = [];
  const came = new Map<number, number>();
  const gScore = new Map<number, number>();
  const nodes = new Map<number, PathNode>();
  const h = (x: number, y: number, z: number) => Math.abs(x - tx) + Math.abs(z - tz) + Math.abs(y - ty) * 0.5;
  const sk = key(sx, sy, sz);
  open.push({ x: sx, y: sy, z: sz, g: 0, f: h(sx, sy, sz), k: sk });
  gScore.set(sk, 0);
  nodes.set(sk, { x: sx, y: sy, z: sz });
  let best = sk, bestH = h(sx, sy, sz);
  let expanded = 0;
  while (open.length && expanded < maxNodes) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
    const cur = open[bi];
    open[bi] = open[open.length - 1];
    open.pop();
    expanded++;
    const ch = h(cur.x, cur.y, cur.z);
    if (ch < bestH) { bestH = ch; best = cur.k; }
    if (cur.x === tx && cur.z === tz && Math.abs(cur.y - ty) <= 1) { best = cur.k; break; }
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cur.x + dx, nz = cur.z + dz;
      let ny = -999;
      if (standable(w, nx, cur.y, nz, tall)) ny = cur.y;
      else if (standable(w, nx, cur.y + 1, nz, tall) && passable(w, cur.x, cur.y + 2, cur.z)) ny = cur.y + 1;
      else {
        for (let d = 1; d <= 3; d++) {
          if (!passable(w, nx, cur.y - d + 1, nz)) break;
          if (standable(w, nx, cur.y - d, nz, tall)) { ny = cur.y - d; break; }
        }
      }
      if (ny === -999) continue;
      const nk = key(nx, ny, nz);
      const water = (w.getBlock(nx, ny, nz) & 0xff) === B.WATER;
      const g = cur.g + 1 + (ny !== cur.y ? 0.4 : 0) + (water ? 2 : 0);
      const prev = gScore.get(nk);
      if (prev !== undefined && prev <= g) continue;
      gScore.set(nk, g);
      came.set(nk, cur.k);
      nodes.set(nk, { x: nx, y: ny, z: nz });
      open.push({ x: nx, y: ny, z: nz, g, f: g + h(nx, ny, nz), k: nk });
    }
  }
  if (best === sk) return null;
  const path: PathNode[] = [];
  let k: number | undefined = best;
  while (k !== undefined && k !== sk) {
    path.push(nodes.get(k)!);
    k = came.get(k);
  }
  path.reverse();
  return path;
}

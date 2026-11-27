import { BLOCKS, blockBoxes, selectionBox, B, getBlock, isFluid, isWaterPlant, bid, isSoulSand, isConnecting, isWall, connMask, connCollision, connVisual, connBounds, wallPost, NB, blockId } from './blocks';

function connShape(world: BlockReader, v: number, x: number, y: number, z: number, collide: boolean): number[][] {
  const id = bid(v);
  const nb = (yy: number) => (dx: number, dz: number) => world.getBlock(x + dx, yy, z + dz);
  const mask = connMask(id, nb(y));
  const post = isWall(id) ? wallPost(mask, world.getBlock(x, y + 1, z), () => connMask(bid(world.getBlock(x, y + 1, z)), nb(y + 1))) : true;
  return collide ? connCollision(id, mask, post) : connVisual(id, mask, post);
}

export function selectionAt(world: BlockReader, v: number, x: number, y: number, z: number): [number, number, number, number, number, number] | null {
  if (isConnecting(bid(v))) return connBounds(connShape(world, v, x, y, z, false) as [number, number, number, number, number, number][]);
  return selectionBox(v);
}

export interface BlockReader {
  getBlock(x: number, y: number, z: number): number;
}

export interface Body {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  hw: number; h: number;
  onGround: boolean;
  hitH: boolean;
  hitCeil: boolean;
}

const EPS = 1e-4;

function collectBoxes(world: BlockReader, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, out: number[]): void {
  out.length = 0;
  const ix0 = Math.floor(x0), iy0 = Math.floor(y0) - 1, iz0 = Math.floor(z0);
  const ix1 = Math.floor(x1), iy1 = Math.floor(y1), iz1 = Math.floor(z1);
  for (let y = iy0; y <= iy1; y++) for (let z = iz0; z <= iz1; z++) for (let x = ix0; x <= ix1; x++) {
    const v = world.getBlock(x, y, z);
    if (v === 0) continue;
    const list = isConnecting(bid(v)) ? connShape(world, v, x, y, z, true) : blockBoxes(v);
    if (!list) continue;
    for (const bb of list) out.push(x + bb[0], y + bb[1], z + bb[2], x + bb[3], y + bb[4], z + bb[5]);
  }
}

const boxes: number[] = [];

export function moveBody(b: Body, dx: number, dy: number, dz: number, world: BlockReader): void {
  const minX = b.x - b.hw, maxX = b.x + b.hw, minY = b.y, maxY = b.y + b.h, minZ = b.z - b.hw, maxZ = b.z + b.hw;
  collectBoxes(world,
    Math.min(minX, minX + dx), Math.min(minY, minY + dy), Math.min(minZ, minZ + dz),
    Math.max(maxX, maxX + dx), Math.max(maxY, maxY + dy), Math.max(maxZ, maxZ + dz), boxes);
  let ax0 = minX, ax1 = maxX, ay0 = minY, ay1 = maxY, az0 = minZ, az1 = maxZ;

  const odx = dx, ody = dy, odz = dz;
  for (let i = 0; i < boxes.length; i += 6) {
    const bx0 = boxes[i], by0 = boxes[i + 1], bz0 = boxes[i + 2], bx1 = boxes[i + 3], by1 = boxes[i + 4], bz1 = boxes[i + 5];
    if (ax1 <= bx0 + EPS || ax0 >= bx1 - EPS || az1 <= bz0 + EPS || az0 >= bz1 - EPS) continue;
    if (dy > 0 && ay1 <= by0 + EPS) dy = Math.min(dy, by0 - ay1);
    else if (dy < 0 && ay0 >= by1 - EPS) dy = Math.max(dy, by1 - ay0);
  }
  ay0 += dy; ay1 += dy;
  for (let i = 0; i < boxes.length; i += 6) {
    const bx0 = boxes[i], by0 = boxes[i + 1], bz0 = boxes[i + 2], bx1 = boxes[i + 3], by1 = boxes[i + 4], bz1 = boxes[i + 5];
    if (ay1 <= by0 + EPS || ay0 >= by1 - EPS || az1 <= bz0 + EPS || az0 >= bz1 - EPS) continue;
    if (dx > 0 && ax1 <= bx0 + EPS) dx = Math.min(dx, bx0 - ax1);
    else if (dx < 0 && ax0 >= bx1 - EPS) dx = Math.max(dx, bx1 - ax0);
  }
  ax0 += dx; ax1 += dx;
  for (let i = 0; i < boxes.length; i += 6) {
    const bx0 = boxes[i], by0 = boxes[i + 1], bz0 = boxes[i + 2], bx1 = boxes[i + 3], by1 = boxes[i + 4], bz1 = boxes[i + 5];
    if (ay1 <= by0 + EPS || ay0 >= by1 - EPS || ax1 <= bx0 + EPS || ax0 >= bx1 - EPS) continue;
    if (dz > 0 && az1 <= bz0 + EPS) dz = Math.min(dz, bz0 - az1);
    else if (dz < 0 && az0 >= bz1 - EPS) dz = Math.max(dz, bz1 - az0);
  }
  b.x += dx; b.y += dy; b.z += dz;
  b.onGround = ody < 0 && dy !== ody;
  b.hitCeil = ody > 0 && dy !== ody;
  b.hitH = dx !== odx || dz !== odz;
  if (dx !== odx) b.vx = 0;
  if (dz !== odz) b.vz = 0;
  if (dy !== ody) b.vy = 0;
}

export function moveStep(b: Body, dx: number, dy: number, dz: number, world: BlockReader, step: number): void {
  const sx = b.x, sy = b.y, sz = b.z, svx = b.vx, svz = b.vz;
  const wasGround = b.onGround;
  moveBody(b, dx, dy, dz, world);
  if (step <= 0 || !b.hitH || !(wasGround || b.onGround) || (dx === 0 && dz === 0)) return;
  const d1 = (b.x - sx) ** 2 + (b.z - sz) ** 2;
  const t: Body = { ...b, x: sx, y: sy, z: sz, vx: 0, vy: 0, vz: 0 };
  moveBody(t, 0, step, 0, world);
  const rose = t.y - sy;
  moveBody(t, dx, 0, dz, world);
  const mx = t.x - sx, mz = t.z - sz;
  moveBody(t, 0, -rose + Math.min(0, dy), 0, world);
  const d2 = mx * mx + mz * mz;
  if (d2 <= d1 + 1e-7) return;
  b.x = t.x; b.y = t.y; b.z = t.z;
  b.onGround = t.onGround || t.y > sy;
  const bx = Math.abs(mx - dx) > 1e-6, bz = Math.abs(mz - dz) > 1e-6;
  b.vx = bx ? 0 : svx; b.vz = bz ? 0 : svz;
  b.hitH = bx || bz;
  if (b.onGround && b.vy < 0) b.vy = 0;
}

export function boxCollides(world: BlockReader, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): boolean {
  collectBoxes(world, x0, y0, z0, x1, y1, z1, boxes);
  for (let i = 0; i < boxes.length; i += 6) {
    if (x1 > boxes[i] + EPS && x0 < boxes[i + 3] - EPS && y1 > boxes[i + 1] + EPS && y0 < boxes[i + 4] - EPS && z1 > boxes[i + 2] + EPS && z0 < boxes[i + 5] - EPS) return true;
  }
  return false;
}

export function bodyCollides(world: BlockReader, b: Body, x = b.x, y = b.y, z = b.z): boolean {
  return boxCollides(world, x - b.hw, y, z - b.hw, x + b.hw, y + b.h, z + b.hw);
}

function liquidTop(v: number, above: number, id: number): number {
  if (above === id || (id === B.WATER && isWaterPlant(above))) return 1;
  const m = v >>> 8;
  if (m & 8) return 1;
  if (m === 0) return 0.9;
  return Math.max(0.15, 0.9 - (m & 7) * 0.11);
}


export interface Medium { water: boolean; lava: boolean; ladder: boolean; eyeWater: boolean; cactus: boolean; web?: boolean; }

const CLIMB = new Uint8Array(4096);
for (const d of BLOCKS) if (d && d.climbable && d.id !== NB.COBWEB) CLIMB[d.id] = 1;
CLIMB[B.VINE] = 1; CLIMB[B.WEEPING_VINES] = 1; CLIMB[B.TWISTING_VINES] = 1;

export function sampleMedium(world: BlockReader, x: number, y: number, z: number, hw: number, h: number, eye: number): Medium {
  const m: Medium = { water: false, lava: false, ladder: false, eyeWater: false, cactus: false, web: false };
  const e = 0.001;
  const x0 = Math.floor(x - hw + e), x1 = Math.floor(x + hw - e), z0 = Math.floor(z - hw + e), z1 = Math.floor(z + hw - e);
  const y0 = Math.floor(y + 0.1), y1 = Math.floor(y + h - 0.1);
  for (let by = Math.floor(y + e); by <= y1; by++) for (let bz = z0; bz <= z1; bz++) for (let bx = x0; bx <= x1; bx++) {
    const v = world.getBlock(bx, by, bz);
    const id = bid(v);
    if (id === B.WATER || id === B.LAVA || isWaterPlant(id)) {
      const top = by + (id === B.WATER || id === B.LAVA ? liquidTop(v, bid(world.getBlock(bx, by + 1, bz)), id) : 1);
      if (y + e >= top) continue;
      if (id === B.LAVA) m.lava = true; else m.water = true;
    } else if (by >= y0 && (id === B.LADDER || CLIMB[id])) m.ladder = true;
    else if (id === NB.COBWEB) m.web = true;
    else if (id === B.CAULDRON && ((v >>> 8) & 4) && y + e < by + 15 / 16 && y + e >= by + 3 / 16 && x > bx + 0.1 && x < bx + 0.9 && z > bz + 0.1 && z < bz + 0.9) m.lava = true;
  }
  for (let bz = Math.floor(z - hw - 0.05); bz <= Math.floor(z + hw + 0.05); bz++) for (let bx = Math.floor(x - hw - 0.05); bx <= Math.floor(x + hw + 0.05); bx++) {
    for (let by = y0; by <= y1; by++) if ((bid(world.getBlock(bx, by, bz))) === B.CACTUS) m.cactus = true;
  }
  const ev = world.getBlock(Math.floor(x), Math.floor(y + eye), Math.floor(z));
  const eid = bid(ev);
  m.eyeWater = (eid === B.WATER && Math.floor(y + eye) + liquidTop(ev, bid(world.getBlock(Math.floor(x), Math.floor(y + eye) + 1, Math.floor(z))), eid) > y + eye) || isWaterPlant(eid);
  return m;
}

export interface RayHit {
  x: number; y: number; z: number;
  nx: number; ny: number; nz: number;
  dist: number;
  value: number;
  hx: number; hy: number; hz: number;
}

function rayBox(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, b: number[], maxT: number): { t: number; axis: number; sign: number } | null {
  let tmin = 0, tmax = maxT, axis = -1, sign = 0;
  const o = [ox, oy, oz], d = [dx, dy, dz];
  for (let a = 0; a < 3; a++) {
    const lo = b[a], hi = b[a + 3];
    if (Math.abs(d[a]) < 1e-9) {
      if (o[a] < lo || o[a] > hi) return null;
      continue;
    }
    let t1 = (lo - o[a]) / d[a], t2 = (hi - o[a]) / d[a];
    let s = -1;
    if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
    if (t1 > tmin) { tmin = t1; axis = a; sign = s; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  return { t: tmin, axis, sign };
}

export function raycast(world: BlockReader, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number, hitFluids = false): RayHit | null {
  let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
  const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
  const tdx = Math.abs(1 / dx), tdy = Math.abs(1 / dy), tdz = Math.abs(1 / dz);
  let tmx = dx > 0 ? (x + 1 - ox) * tdx : (ox - x) * tdx;
  let tmy = dy > 0 ? (y + 1 - oy) * tdy : (oy - y) * tdy;
  let tmz = dz > 0 ? (z + 1 - oz) * tdz : (oz - z) * tdz;
  if (!isFinite(tmx)) tmx = Infinity;
  if (!isFinite(tmy)) tmy = Infinity;
  if (!isFinite(tmz)) tmz = Infinity;
  const tmp: number[] = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < 256; i++) {
    const v = world.getBlock(x, y, z);
    if (v !== 0) {
      let sb = selectionAt(world, v, x, y, z);
      if (!sb && hitFluids && isFluid(v) && (v >>> 8) === 0) sb = [0, 0, 0, 1, 0.875, 1];
      if (sb) {
        tmp[0] = x + sb[0]; tmp[1] = y + sb[1]; tmp[2] = z + sb[2]; tmp[3] = x + sb[3]; tmp[4] = y + sb[4]; tmp[5] = z + sb[5];
        const r = rayBox(ox, oy, oz, dx, dy, dz, tmp, maxDist);
        if (r) {
          const n = [0, 0, 0];
          if (r.axis >= 0) n[r.axis] = r.sign;
          return { x, y, z, nx: n[0], ny: n[1], nz: n[2], dist: r.t, value: v, hx: ox + dx * r.t, hy: oy + dy * r.t, hz: oz + dz * r.t };
        }
      }
    }
    if (tmx < tmy && tmx < tmz) { if (tmx > maxDist) break; x += stepX; tmx += tdx; }
    else if (tmy < tmz) { if (tmy > maxDist) break; y += stepY; tmy += tdy; }
    else { if (tmz > maxDist) break; z += stepZ; tmz += tdz; }
  }
  return null;
}

export function isClimbable(v: number): boolean {
  return getBlock(v).climbable;
}

const fluidH = (w: number): number => ((w >>> 8) & 8 ? 1 : (8 - ((w >>> 8) & 7)) / 9);

export function fluidFlow(world: BlockReader, px: number, py: number, pz: number): { x: number; z: number; lava: boolean } | null {
  const x = Math.floor(px), z = Math.floor(pz);
  for (const y of [Math.floor(py + 0.05), Math.floor(py + 0.5)]) {
    const v = world.getBlock(x, y, z);
    const fl = bid(v);
    if (fl !== B.WATER && fl !== B.LAVA) continue;
    if (!((v >>> 8) & 15)) continue;
    const me = fluidH(v);
    let fx = 0, fz = 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = world.getBlock(x + dx, y, z + dz);
      if (bid(n) === fl) { const d = me - fluidH(n); fx += dx * d; fz += dz * d; }
      else if (n === 0) {
        const below = world.getBlock(x + dx, y - 1, z + dz);
        if (below === 0 || bid(below) === fl) { fx += dx * me; fz += dz * me; }
      }
    }
    const l = Math.hypot(fx, fz);
    return l > 1e-4 ? { x: fx / l, z: fz / l, lava: fl === B.LAVA } : null;
  }
  return null;
}

export function bubbleColumn(world: BlockReader, x: number, y: number, z: number): number {
  const bx = Math.floor(x), bz = Math.floor(z);
  let by = Math.floor(y);
  if (bid(world.getBlock(bx, by, bz)) !== B.WATER) return 0;
  for (let n = 0; n < 48 && by > 0; n++) {
    by--;
    const v = world.getBlock(bx, by, bz), id = bid(v);
    if (id === B.WATER) continue;
    return isSoulSand(v) ? 1 : id === B.MAGMA_BLOCK ? -1 : 0;
  }
  return 0;
}

export function bubbleSurface(world: BlockReader, x: number, y: number, z: number): boolean {
  return bid(world.getBlock(Math.floor(x), Math.floor(y) + 1, Math.floor(z))) === 0;
}

export function slipperiness(v: number): number {
  const id = blockId(v);
  if (id === B.ICE || id === B.PACKED_ICE) return 0.98;
  if (id === B.SLIME_BLOCK) return 0.8;
  const k = getBlock(v).key;
  if (k === 'blue_ice') return 0.989;
  if (k === 'frosted_ice' || k.endsWith('_ice')) return 0.98;
  return 0.6;
}

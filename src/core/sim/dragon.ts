export interface DragonPart { n: string; x: number; y: number; z: number; hw: number; h: number; head: boolean }

const PARTS: { n: string; f: number; s: number; y: number; hw: number; h: number }[] = [
  { n: 'head', f: 8.8, s: 0, y: 1.9, hw: 1.3, h: 2.0 },
  { n: 'neck', f: 5.0, s: 0, y: 1.8, hw: 1.1, h: 1.8 },
  { n: 'body', f: 0, s: 0, y: 0, hw: 2.8, h: 3.8 },
  { n: 'tail1', f: -4.4, s: 0, y: 1.5, hw: 0.9, h: 1.5 },
  { n: 'tail2', f: -6.9, s: 0, y: 1.4, hw: 0.8, h: 1.3 },
  { n: 'tail3', f: -9.4, s: 0, y: 1.3, hw: 0.7, h: 1.1 },
  { n: 'wing1', f: -0.9, s: -5, y: 2.3, hw: 2.6, h: 1.6 },
  { n: 'wing2', f: -0.9, s: 5, y: 2.3, hw: 2.6, h: 1.6 },
];

export function dragonParts(x: number, y: number, z: number, yaw: number): DragonPart[] {
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
  return PARTS.map((p) => ({ n: p.n, x: x + fx * p.f + rx * p.s, y: y + p.y, z: z + fz * p.f + rz * p.s, hw: p.hw, h: p.h, head: p.n === 'head' }));
}

export function rayPart(parts: DragonPart[], ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max: number, pad = 0): { part: DragonPart; dist: number } | null {
  let best: { part: DragonPart; dist: number } | null = null;
  for (const p of parts) {
    const lo = [p.x - p.hw - pad, p.y - pad, p.z - p.hw - pad], hi = [p.x + p.hw + pad, p.y + p.h + pad, p.z + p.hw + pad];
    const o = [ox, oy, oz], d = [dx, dy, dz];
    let tmin = 0, tmax = max, ok = true;
    for (let a = 0; a < 3; a++) {
      if (Math.abs(d[a]) < 1e-9) { if (o[a] < lo[a] || o[a] > hi[a]) { ok = false; break; } continue; }
      let t1 = (lo[a] - o[a]) / d[a], t2 = (hi[a] - o[a]) / d[a];
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) { ok = false; break; }
    }
    if (ok && (!best || tmin < best.dist)) best = { part: p, dist: tmin };
  }
  return best;
}

export function partDistance(p: DragonPart, x: number, y: number, z: number): number {
  const dx = Math.max(p.x - p.hw - x, 0, x - p.x - p.hw), dy = Math.max(p.y - y, 0, y - p.y - p.h), dz = Math.max(p.z - p.hw - z, 0, z - p.z - p.hw);
  return Math.hypot(dx, dy, dz);
}

export function pointPart(parts: DragonPart[], x: number, y: number, z: number, pad: number): DragonPart | null {
  for (const p of parts) if (Math.abs(x - p.x) < p.hw + pad && Math.abs(z - p.z) < p.hw + pad && y > p.y - pad && y < p.y + p.h + pad) return p;
  return null;
}

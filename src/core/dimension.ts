export const NETHER_X = 440000;
export const NETHER_EDGE = 300000;
export const OVERWORLD_LIMIT = 240000;
export const NETHER_HEIGHT = 128;
export const NETHER_LAVA = 31;

export function isNether(x: number): boolean { return x >= NETHER_EDGE; }
export function toNether(x: number, z: number): [number, number] { return [NETHER_X + Math.floor(x / 8), Math.floor(z / 8)]; }
export function toOverworld(x: number, z: number): [number, number] { return [Math.floor((x - NETHER_X) * 8), Math.floor(z * 8)]; }
export function localX(x: number): number { return isNether(x) ? x - NETHER_X : x; }

export function cmdXYZ(p: { x: number; y: number; z: number }, args: string[], dim?: string): [number, number, number] | null {
  if (args.length < 3) return null;
  const nether = dim === 'nether' || dim === 'the_nether' || dim === 'minecraft:the_nether' ? true : dim === 'overworld' || dim === 'minecraft:overworld' ? false : dim === undefined ? isNether(p.x) : null;
  if (nether === null) return null;
  const here = isNether(p.x) === nether;
  const base = [here ? localX(p.x) : 0, here ? p.y : 64, here ? p.z : 0];
  const out = args.map((a, i) => {
    if (a.startsWith('~')) return base[i] + (a.length > 1 ? Number(a.slice(1)) : 0);
    return Number(a);
  });
  if (!out.every(Number.isFinite)) return null;
  const lim = nether ? NETHER_X - NETHER_EDGE - 16 : NETHER_EDGE - 16;
  if (Math.abs(out[0]) > lim || Math.abs(out[2]) > 3e7 || out[1] < -64 || out[1] > 512) return null;
  return [out[0] + (nether ? NETHER_X : 0), out[1], out[2]];
}

export const NETHER_X = 440000;
export const NETHER_EDGE = 300000;
export const OVERWORLD_LIMIT = 240000;
export const NETHER_HEIGHT = 128;
export const NETHER_LAVA = 31;

export const END_X = -440000;
export const END_EDGE = -300000;
export const END_SPAWN = { x: 100, y: 49, z: 0 };

export function isNether(x: number): boolean { return x >= NETHER_EDGE; }
export function isEnd(x: number): boolean { return x <= END_EDGE; }
export type Dim = 'overworld' | 'nether' | 'end';
export function dimOf(x: number): Dim { return x >= NETHER_EDGE ? 'nether' : x <= END_EDGE ? 'end' : 'overworld'; }
export function dimName(x: number): string { return x >= NETHER_EDGE ? 'the Nether' : x <= END_EDGE ? 'the End' : 'the Overworld'; }
export function toNether(x: number, z: number): [number, number] { return [NETHER_X + Math.floor(x / 8), Math.floor(z / 8)]; }
export function toOverworld(x: number, z: number): [number, number] { return [Math.floor((x - NETHER_X) * 8), Math.floor(z * 8)]; }
export function localX(x: number): number { return isNether(x) ? x - NETHER_X : isEnd(x) ? x - END_X : x; }

export function cmdXYZ(p: { x: number; y: number; z: number }, args: string[], dim?: string): [number, number, number] | null {
  if (args.length < 3) return null;
  const d = (dim ?? '').replace(/^minecraft:/, '');
  const want: Dim | null = dim === undefined ? dimOf(p.x) : d === 'nether' || d === 'the_nether' ? 'nether' : d === 'end' || d === 'the_end' ? 'end' : d === 'overworld' ? 'overworld' : null;
  if (want === null) return null;
  const here = dimOf(p.x) === want;
  const base = [here ? localX(p.x) : 0, here ? p.y : 64, here ? p.z : 0];
  const out = args.map((a, i) => {
    if (a.startsWith('~')) return base[i] + (a.length > 1 ? Number(a.slice(1)) : 0);
    return Number(a);
  });
  if (!out.every(Number.isFinite)) return null;
  const lim = want === 'nether' ? NETHER_X - NETHER_EDGE - 16 : want === 'end' ? END_EDGE - END_X - 16 : NETHER_EDGE - 16;
  if (Math.abs(out[0]) > lim || Math.abs(out[2]) > 3e7 || out[1] < -64 || out[1] > 512) return null;
  if (want === 'overworld' && out[0] < END_EDGE + 16) return null;
  return [out[0] + (want === 'nether' ? NETHER_X : want === 'end' ? END_X : 0), out[1], out[2]];
}

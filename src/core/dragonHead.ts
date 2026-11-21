export type HeadPiece = 'head' | 'lip' | 'jaw' | 'scale' | 'nostril';
export type HeadFace = 't' | 'b' | 'f' | 'k' | 'px' | 'nx';

export const DRAGON_HEAD_PARTS: { n: HeadPiece; b: [number, number, number, number, number, number] }[] = [
  { n: 'head', b: [-6, 0, -7.5, 6, 12, 4.5] },
  { n: 'lip', b: [-4.5, 3, -18, 4.5, 6.75, -6] },
  { n: 'jaw', b: [-4.5, 0, -18, 4.5, 3, -6] },
  { n: 'scale', b: [-3.75, 12, -3, -2.25, 15, 1.5] },
  { n: 'scale', b: [2.25, 12, -3, 3.75, 15, 1.5] },
  { n: 'nostril', b: [-3.75, 6.75, -16.5, -2.25, 8.25, -13.5] },
  { n: 'nostril', b: [2.25, 6.75, -16.5, 3.75, 8.25, -13.5] },
];

export const DRAGON_HEAD_UV: Record<'head' | 'lip' | 'jaw', [number, number, number, number, number]> = {
  head: [112, 30, 16, 16, 16],
  lip: [176, 44, 12, 5, 16],
  jaw: [176, 65, 12, 4, 16],
};

export function headRot(x: number, z: number, f: number): [number, number] {
  if (f === 0) return [-z, x];
  if (f === 1) return [-x, -z];
  if (f === 2) return [z, -x];
  return [x, z];
}

const WORLD_N: [number, number][] = [[1, 0], [-1, 0], [0, 0], [0, 0], [0, 1], [0, -1]];

export function headLocalFace(d: number, f: number): HeadFace {
  if (d === 2) return 't';
  if (d === 3) return 'b';
  let [X, Z] = WORLD_N[d];
  if (f === 0) [X, Z] = [Z, -X];
  else if (f === 1) [X, Z] = [-X, -Z];
  else if (f === 2) [X, Z] = [-Z, X];
  return Z < 0 ? 'f' : Z > 0 ? 'k' : X > 0 ? 'px' : 'nx';
}

export function headBox(b: readonly number[], f: number): [number, number, number, number, number, number] {
  const [a, c] = headRot(b[0], b[2], f), [d, e] = headRot(b[3], b[5], f);
  return [Math.min(a, d) + 8, b[1], Math.min(c, e) + 8, Math.max(a, d) + 8, b[4], Math.max(c, e) + 8];
}

export const HEAD_TILE_KEYS: string[] = [
  ...(['head', 'lip', 'jaw'] as const).flatMap((n) => (['t', 'b', 'f', 'k', 'px', 'nx'] as const).map((s) => `dh_${n}_${s}`)),
  'dh_scale', 'dh_nostril',
];

export function headTileKey(n: HeadPiece, s: HeadFace): string {
  return n === 'scale' || n === 'nostril' ? `dh_${n}` : `dh_${n}_${s}`;
}

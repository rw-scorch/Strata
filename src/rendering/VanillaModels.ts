import * as THREE from 'three';
import type { MobType } from '../core/sim/mobs';

export type EntityTexKey = 'pig' | 'sheep' | 'sheep_wool' | 'chicken' | 'zombie' | 'skeleton' | 'spider' | 'spider_eyes' | `player${number}`;

interface VPart {
  n: string;
  tex: 'main' | 'overlay';
  size: [number, number, number];
  uv: [number, number];
  pivot: [number, number, number];
  off?: [number, number, number];
  rot?: [number, number, number];
  inflate?: number;
  mirror?: boolean;
  parent?: string;
  boxRotX?: boolean;
  emissive?: boolean;
}

export interface VanillaSpec { main: EntityTexKey; overlay?: EntityTexKey; texH: number; height: number; parts: VPart[]; }

const humanoid = (main: EntityTexKey, tall64: boolean, thin: boolean): VPart[] => {
  const lw = thin ? 2 : 4;
  return [
    { n: 'legR', tex: 'main', size: [lw, 12, lw], uv: [0, 16], pivot: [2, 12, 0], off: [0, -6, 0] },
    { n: 'legL', tex: 'main', size: [lw, 12, lw], uv: tall64 ? [16, 48] : [0, 16], mirror: !tall64, pivot: [-2, 12, 0], off: [0, -6, 0] },
    { n: 'body', tex: 'main', size: [8, 12, 4], uv: [16, 16], pivot: [0, 18, 0] },
    { n: 'armR', tex: 'main', size: [lw, 12, lw], uv: [40, 16], pivot: [thin ? 5 : 6, 22, 0], off: [0, -4, 0] },
    { n: 'armL', tex: 'main', size: [lw, 12, lw], uv: tall64 ? [32, 48] : [40, 16], mirror: !tall64, pivot: [thin ? -5 : -6, 22, 0], off: [0, -4, 0] },
    { n: 'head', tex: 'main', size: [8, 8, 8], uv: [0, 0], pivot: [0, 24, 0], off: [0, 4, 0] },
    { n: 'hat', tex: 'main', size: [8, 8, 8], uv: [32, 0], pivot: [0, 0, 0], off: [0, 4, 0], inflate: 0.5, parent: 'head' },
  ].map((p) => ({ ...p, tex: p.tex as 'main' })) as VPart[];
  void main;
};

export const VANILLA: Partial<Record<MobType | 'player', VanillaSpec>> = {
  mudsnout: {
    main: 'pig', texH: 64, height: 0.9,
    parts: [
      { n: 'body', tex: 'main', size: [10, 16, 8], uv: [28, 8], pivot: [0, 11, 0], boxRotX: true },
      { n: 'head', tex: 'main', size: [8, 8, 8], uv: [0, 0], pivot: [0, 12, -6], off: [0, 0, -4] },
      { n: 'snout', tex: 'main', size: [4, 3, 1], uv: [16, 16], pivot: [0, 0, 0], off: [0, -1.5, -8.5], parent: 'head' },
      { n: 'leg0', tex: 'main', size: [4, 6, 4], uv: [0, 16], pivot: [-3, 6, -5], off: [0, -3, 0] },
      { n: 'leg1', tex: 'main', size: [4, 6, 4], uv: [0, 16], pivot: [3, 6, -5], off: [0, -3, 0] },
      { n: 'leg2', tex: 'main', size: [4, 6, 4], uv: [0, 16], pivot: [-3, 6, 7], off: [0, -3, 0] },
      { n: 'leg3', tex: 'main', size: [4, 6, 4], uv: [0, 16], pivot: [3, 6, 7], off: [0, -3, 0] },
    ],
  },
  woolhorn: {
    main: 'sheep', overlay: 'sheep_wool', texH: 32, height: 1.3,
    parts: [
      { n: 'body', tex: 'main', size: [8, 16, 6], uv: [28, 8], pivot: [0, 16.5, 1], boxRotX: true },
      { n: 'wool', tex: 'overlay', size: [8, 16, 6], uv: [28, 8], pivot: [0, 16.5, 1], boxRotX: true, inflate: 1.75 },
      { n: 'head', tex: 'main', size: [6, 6, 8], uv: [0, 0], pivot: [0, 18, -8], off: [0, 1, -2] },
      { n: 'headWool', tex: 'overlay', size: [6, 6, 6], uv: [0, 0], pivot: [0, 0, 0], off: [0, 1, -1], inflate: 0.6, parent: 'head' },
      ...[[-3, -5], [3, -5], [-3, 7], [3, 7]].flatMap(([x, z], i) => [
        { n: `leg${i}`, tex: 'main' as const, size: [4, 12, 4] as [number, number, number], uv: [0, 16] as [number, number], pivot: [x, 12, z] as [number, number, number], off: [0, -6, 0] as [number, number, number] },
        { n: `legWool${i}`, tex: 'overlay' as const, size: [4, 6, 4] as [number, number, number], uv: [0, 16] as [number, number], pivot: [0, 0, 0] as [number, number, number], off: [0, -3, 0] as [number, number, number], inflate: 0.5, parent: `leg${i}` },
      ]),
    ],
  },
  fernhen: {
    main: 'chicken', texH: 32, height: 0.7,
    parts: [
      { n: 'body', tex: 'main', size: [6, 8, 6], uv: [0, 9], pivot: [0, 8, 0], boxRotX: true },
      { n: 'head', tex: 'main', size: [4, 6, 3], uv: [0, 0], pivot: [0, 9, -4], off: [0, 3, -0.5] },
      { n: 'beak', tex: 'main', size: [4, 2, 2], uv: [14, 0], pivot: [0, 0, 0], off: [0, 3, -3], parent: 'head' },
      { n: 'wattle', tex: 'main', size: [2, 2, 2], uv: [14, 4], pivot: [0, 0, 0], off: [0, 1, -2], parent: 'head' },
      { n: 'wingL', tex: 'main', size: [1, 4, 6], uv: [24, 13], pivot: [-3.5, 11, 0], off: [0, -2, 0] },
      { n: 'wingR', tex: 'main', size: [1, 4, 6], uv: [24, 13], pivot: [3.5, 11, 0], off: [0, -2, 0] },
      { n: 'legL', tex: 'main', size: [3, 5, 3], uv: [26, 0], pivot: [-1.5, 5, 0.5], off: [0, -2.5, 0] },
      { n: 'legR', tex: 'main', size: [3, 5, 3], uv: [26, 0], pivot: [1.5, 5, 0.5], off: [0, -2.5, 0] },
    ],
  },
  hollowed: { main: 'zombie', texH: 64, height: 1.95, parts: humanoid('zombie', true, false) },
  rattlebone: { main: 'skeleton', texH: 32, height: 1.95, parts: humanoid('skeleton', false, true).filter((p) => p.n !== 'hat') },
  duskweaver: {
    main: 'spider', overlay: 'spider_eyes', texH: 32, height: 0.9,
    parts: [
      { n: 'neck', tex: 'main', size: [6, 6, 6], uv: [0, 0], pivot: [0, 9, 0] },
      { n: 'body', tex: 'main', size: [10, 8, 12], uv: [0, 12], pivot: [0, 9, 9] },
      { n: 'head', tex: 'main', size: [8, 8, 8], uv: [32, 4], pivot: [0, 9, -3], off: [0, 0, -4] },
      { n: 'eyes', tex: 'overlay', size: [8, 8, 8], uv: [32, 4], pivot: [0, 0, 0], off: [0, 0, -4], inflate: 0.05, parent: 'head', emissive: true },
      ...[0, 1, 2, 3].flatMap((i) => [
        { n: `legL${i}`, tex: 'main' as const, size: [16, 2, 2] as [number, number, number], uv: [18, 0] as [number, number], pivot: [-4, 9, 2 - i] as [number, number, number], off: [-8, 0, 0] as [number, number, number], rot: [0, (i - 1.5) * 0.35, 0.6] as [number, number, number] },
        { n: `legR${i}`, tex: 'main' as const, size: [16, 2, 2] as [number, number, number], uv: [18, 0] as [number, number], pivot: [4, 9, 2 - i] as [number, number, number], off: [8, 0, 0] as [number, number, number], rot: [0, -(i - 1.5) * 0.35, -0.6] as [number, number, number], mirror: true },
      ]),
    ],
  },
  player: { main: 'player0', texH: 64, height: 1.8, parts: humanoid('player0', true, false) },
};

export function boxUV(g: THREE.BoxGeometry, size: [number, number, number], uv: [number, number], texW: number, texH: number, mirror: boolean): void {
  const [w, h, d] = size;
  const [u, v] = uv;
  const rects: Record<string, [number, number, number, number]> = {
    px: [u, v + d, d, h], nz: [u + d, v + d, w, h], nx: [u + d + w, v + d, d, h], pz: [u + 2 * d + w, v + d, w, h],
    py: [u + d, v, w, d], ny: [u + d + w, v, w, d],
  };
  if (mirror) { const t = rects.px; rects.px = rects.nx; rects.nx = t; }
  const order = ['px', 'nx', 'py', 'ny', 'pz', 'nz'];
  const a = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let f = 0; f < 6; f++) {
    const [x, y, rw, rh] = rects[order[f]];
    let x0 = x / texW, x1 = (x + rw) / texW;
    if (mirror) [x0, x1] = [x1, x0];
    const y0 = y / texH, y1 = (y + rh) / texH;
    const base = f * 4;
    a.setXY(base, x0, y0); a.setXY(base + 1, x1, y0); a.setXY(base + 2, x0, y1); a.setXY(base + 3, x1, y1);
  }
  a.needsUpdate = true;
}

export function buildVanilla(spec: VanillaSpec, mainMat: THREE.ShaderMaterial, overlayMat: THREE.ShaderMaterial | null, emissiveMat: THREE.ShaderMaterial | null): { obj: THREE.Group; parts: Map<string, THREE.Object3D> } {
  const obj = new THREE.Group();
  const root = new THREE.Group();
  const S = 1 / 16;
  const heights: Record<string, number> = { pig: 16, sheep: 22, chicken: 15, zombie: 32, skeleton: 32, spider: 13 };
  const modelH = heights[spec.main] ?? 32;
  root.scale.setScalar((spec.height / (modelH * S)) * S);
  obj.add(root);
  const parts = new Map<string, THREE.Object3D>();
  for (const p of spec.parts) {
    const mat = p.emissive ? emissiveMat : p.tex === 'overlay' ? overlayMat : mainMat;
    if (!mat) continue;
    const inf = (p.inflate ?? 0) * 2;
    const g = new THREE.BoxGeometry(p.size[0] + inf, p.size[1] + inf, p.size[2] + inf);
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 3).fill(1), 3));
    boxUV(g, p.size, p.uv, 64, spec.texH, !!p.mirror);
    const mesh = new THREE.Mesh(g, mat);
    if (p.boxRotX) mesh.rotation.x = Math.PI / 2;
    if (p.off) mesh.position.set(...p.off);
    const pivot = new THREE.Group();
    pivot.position.set(...p.pivot);
    if (p.rot) pivot.rotation.set(...p.rot);
    pivot.add(mesh);
    (p.parent ? parts.get(p.parent) ?? root : root).add(pivot);
    parts.set(p.n, pivot);
  }
  return { obj, parts };
}

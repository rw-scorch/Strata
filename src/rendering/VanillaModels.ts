import * as THREE from 'three';
import type { MobType } from '../core/sim/mobs';

export type EntityTexKey = 'pig' | 'sheep' | 'sheep_wool' | 'chicken' | 'zombie' | 'skeleton' | 'spider' | 'spider_eyes' | `player${number}`;
export type Rig = 'humanoid' | 'quadruped' | 'chicken' | 'spider';
type V3 = [number, number, number];

export interface VCube { o: V3; s: V3; uv: [number, number]; inf?: number; mirror?: boolean; layer?: 'overlay' | 'emissive'; }
export interface VPart { n: string; pivot: V3; rot?: V3; cubes: VCube[]; parent?: string; }
export interface VanillaSpec { key: string; main: EntityTexKey; overlay?: EntityTexKey; texH: number; height: number; modelH: number; rig: Rig; parts: VPart[]; }

const HALF_PI = Math.PI / 2;

function humanoid(kind: 'player' | 'zombie' | 'skeleton'): VPart[] {
  const thin = kind === 'skeleton';
  const split = kind === 'player';
  const armBox: VCube = thin ? { o: [-1, -2, -1], s: [2, 12, 2], uv: [40, 16] } : { o: [-3, -2, -2], s: [4, 12, 4], uv: [40, 16] };
  const armBoxL: VCube = thin ? { o: [-1, -2, -1], s: [2, 12, 2], uv: [40, 16], mirror: true } : split ? { o: [-1, -2, -2], s: [4, 12, 4], uv: [32, 48] } : { o: [-1, -2, -2], s: [4, 12, 4], uv: [40, 16], mirror: true };
  const leg: VCube = thin ? { o: [-1, 0, -1], s: [2, 12, 2], uv: [0, 16] } : { o: [-2, 0, -2], s: [4, 12, 4], uv: [0, 16] };
  const legL: VCube = split ? { ...leg, uv: [16, 48] } : { ...leg, mirror: true };
  const parts: VPart[] = [
    { n: 'head', pivot: [0, 0, 0], cubes: [{ o: [-4, -8, -4], s: [8, 8, 8], uv: [0, 0] }, ...(thin ? [] : [{ o: [-4, -8, -4] as V3, s: [8, 8, 8] as V3, uv: [32, 0] as [number, number], inf: 0.5 }])] },
    { n: 'body', pivot: [0, 0, 0], cubes: [{ o: [-4, 0, -2], s: [8, 12, 4], uv: [16, 16] }] },
    { n: 'right_arm', pivot: [-5, 2, 0], cubes: [armBox] },
    { n: 'left_arm', pivot: [5, 2, 0], cubes: [armBoxL] },
    { n: 'right_leg', pivot: [thin ? -2 : -1.9, 12, 0], cubes: [leg] },
    { n: 'left_leg', pivot: [thin ? 2 : 1.9, 12, 0], cubes: [legL] },
  ];
  if (split) {
    const add = (n: string, c: VCube) => parts.find((p) => p.n === n)!.cubes.push({ ...c, inf: 0.25 });
    add('body', { o: [-4, 0, -2], s: [8, 12, 4], uv: [16, 32] });
    add('right_arm', { o: [-3, -2, -2], s: [4, 12, 4], uv: [40, 32] });
    add('left_arm', { o: [-1, -2, -2], s: [4, 12, 4], uv: [48, 48] });
    add('right_leg', { o: [-2, 0, -2], s: [4, 12, 4], uv: [0, 32] });
    add('left_leg', { o: [-2, 0, -2], s: [4, 12, 4], uv: [0, 48] });
  }
  return parts;
}

function legs(h: number, cube: VCube, front: number, hind: number, extra: VCube[] = []): VPart[] {
  const y = 24 - h;
  return ([['right_hind_leg', -3, hind], ['left_hind_leg', 3, hind], ['right_front_leg', -3, front], ['left_front_leg', 3, front]] as const)
    .map(([n, x, z]) => ({ n, pivot: [x, y, z] as V3, cubes: [cube, ...extra] }));
}

const SPIDER_LEGS: [string, number, number, number][] = [
  ['hind', 2, Math.PI / 4, Math.PI / 4], ['middle_hind', 1, 0.58119464, 0.3926991],
  ['middle_front', 0, 0.58119464, -0.3926991], ['front', -1, Math.PI / 4, -Math.PI / 4],
];

export const VANILLA: Partial<Record<MobType | 'player', VanillaSpec>> = {
  mudsnout: {
    key: 'mudsnout', main: 'pig', texH: 64, height: 0.9, modelH: 16, rig: 'quadruped',
    parts: [
      { n: 'head', pivot: [0, 12, -6], cubes: [{ o: [-4, -4, -8], s: [8, 8, 8], uv: [0, 0] }, { o: [-2, 0, -9], s: [4, 3, 1], uv: [16, 16] }] },
      { n: 'body', pivot: [0, 11, 2], rot: [HALF_PI, 0, 0], cubes: [{ o: [-5, -10, -7], s: [10, 16, 8], uv: [28, 8] }] },
      ...legs(6, { o: [-2, 0, -2], s: [4, 6, 4], uv: [0, 16] }, -5, 7),
    ],
  },
  woolhorn: {
    key: 'woolhorn', main: 'sheep', overlay: 'sheep_wool', texH: 32, height: 1.3, modelH: 22, rig: 'quadruped',
    parts: [
      { n: 'head', pivot: [0, 6, -8], cubes: [{ o: [-3, -4, -6], s: [6, 6, 8], uv: [0, 0] }, { o: [-3, -4, -4], s: [6, 6, 6], uv: [0, 0], inf: 0.6, layer: 'overlay' }] },
      { n: 'body', pivot: [0, 5, 2], rot: [HALF_PI, 0, 0], cubes: [{ o: [-4, -10, -7], s: [8, 16, 6], uv: [28, 8] }, { o: [-4, -10, -7], s: [8, 16, 6], uv: [28, 8], inf: 1.75, layer: 'overlay' }] },
      ...legs(12, { o: [-2, 0, -2], s: [4, 12, 4], uv: [0, 16] }, -5, 7, [{ o: [-2, 0, -2], s: [4, 6, 4], uv: [0, 16], inf: 0.5, layer: 'overlay' }]),
    ],
  },
  fernhen: {
    key: 'fernhen', main: 'chicken', texH: 32, height: 0.7, modelH: 15, rig: 'chicken',
    parts: [
      { n: 'head', pivot: [0, 15, -4], cubes: [{ o: [-2, -6, -2], s: [4, 6, 3], uv: [0, 0] }, { o: [-2, -4, -4], s: [4, 2, 2], uv: [14, 0] }, { o: [-1, -2, -3], s: [2, 2, 2], uv: [14, 4] }] },
      { n: 'body', pivot: [0, 16, 0], rot: [HALF_PI, 0, 0], cubes: [{ o: [-3, -4, -3], s: [6, 8, 6], uv: [0, 9] }] },
      { n: 'right_leg', pivot: [-2, 19, 1], cubes: [{ o: [-1, 0, -3], s: [3, 5, 3], uv: [26, 0] }] },
      { n: 'left_leg', pivot: [1, 19, 1], cubes: [{ o: [-1, 0, -3], s: [3, 5, 3], uv: [26, 0] }] },
      { n: 'right_wing', pivot: [-4, 13, 0], cubes: [{ o: [0, 0, -3], s: [1, 4, 6], uv: [24, 13] }] },
      { n: 'left_wing', pivot: [4, 13, 0], cubes: [{ o: [-1, 0, -3], s: [1, 4, 6], uv: [24, 13] }] },
    ],
  },
  hollowed: { key: 'hollowed', main: 'zombie', texH: 64, height: 1.95, modelH: 32, rig: 'humanoid', parts: humanoid('zombie') },
  rattlebone: { key: 'rattlebone', main: 'skeleton', texH: 32, height: 1.95, modelH: 32, rig: 'humanoid', parts: humanoid('skeleton') },
  duskweaver: {
    key: 'duskweaver', main: 'spider', overlay: 'spider_eyes', texH: 32, height: 0.9, modelH: 13, rig: 'spider',
    parts: [
      { n: 'head', pivot: [0, 15, -3], cubes: [{ o: [-4, -4, -8], s: [8, 8, 8], uv: [32, 4] }, { o: [-4, -4, -8], s: [8, 8, 8], uv: [32, 4], inf: 0.02, layer: 'emissive' }] },
      { n: 'neck', pivot: [0, 15, 0], cubes: [{ o: [-3, -3, -3], s: [6, 6, 6], uv: [0, 0] }] },
      { n: 'abdomen', pivot: [0, 15, 9], cubes: [{ o: [-5, -4, -6], s: [10, 8, 12], uv: [0, 12] }] },
      ...SPIDER_LEGS.flatMap(([n, z, zr, yr]) => [
        { n: `right_${n}_leg`, pivot: [-4, 15, z] as V3, rot: [0, yr, -zr] as V3, cubes: [{ o: [-15, -1, -1] as V3, s: [16, 2, 2] as V3, uv: [18, 0] as [number, number] }] },
        { n: `left_${n}_leg`, pivot: [4, 15, z] as V3, rot: [0, -yr, zr] as V3, cubes: [{ o: [-1, -1, -1] as V3, s: [16, 2, 2] as V3, uv: [18, 0] as [number, number] }] },
      ]),
    ],
  },
  player: { key: 'player', main: 'player0', texH: 64, height: 1.8, modelH: 32, rig: 'humanoid', parts: humanoid('player') },
};

function cubeData(c: VCube, texW: number, texH: number): { pos: number[]; uv: number[]; nrm: number[]; idx: number[] } {
  const inf = c.inf ?? 0;
  let x0 = c.o[0] - inf, x1 = c.o[0] + c.s[0] + inf;
  const y0 = c.o[1] - inf, y1 = c.o[1] + c.s[1] + inf, z0 = c.o[2] - inf, z1 = c.o[2] + c.s[2] + inf;
  if (c.mirror) [x0, x1] = [x1, x0];
  const [w, h, d] = c.s;
  const [u, v] = c.uv;
  const p7: V3 = [x0, y0, z0], p0: V3 = [x1, y0, z0], p1: V3 = [x1, y1, z0], p2: V3 = [x0, y1, z0];
  const p3: V3 = [x0, y0, z1], p4: V3 = [x1, y0, z1], p5: V3 = [x1, y1, z1], p6: V3 = [x0, y1, z1];
  const u1 = u + d, u2 = u + d + w, u3 = u + d + w + w, u4 = u + d + w + d, u5 = u + d + w + d + w;
  const v1 = v + d, v2 = v + d + h;
  const faces: [V3[], number, number, number, number][] = [
    [[p4, p3, p7, p0], u1, v, u2, v1],
    [[p1, p2, p6, p5], u2, v1, u3, v],
    [[p7, p3, p6, p2], u, v1, u1, v2],
    [[p0, p7, p2, p1], u1, v1, u2, v2],
    [[p4, p0, p1, p5], u2, v1, u4, v2],
    [[p3, p4, p5, p6], u4, v1, u5, v2],
  ];
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
  const pos: number[] = [], uv: number[] = [], nrm: number[] = [], idx: number[] = [];
  for (const [vs, a, b, cc, dd] of faces) {
    const base = pos.length / 3;
    const uvs = [[cc, b], [a, b], [a, dd], [cc, dd]];
    for (let i = 0; i < 4; i++) { pos.push(...vs[i]); uv.push(uvs[i][0] / texW, uvs[i][1] / texH); }
    const fx = (vs[0][0] + vs[2][0]) / 2 - cx, fy = (vs[0][1] + vs[2][1]) / 2 - cy, fz = (vs[0][2] + vs[2][2]) / 2 - cz;
    const ax = Math.abs(fx) / (Math.abs(x1 - x0) || 1), ay = Math.abs(fy) / (y1 - y0 || 1), az = Math.abs(fz) / (z1 - z0 || 1);
    const n: V3 = ax >= ay && ax >= az ? [Math.sign(fx), 0, 0] : ay >= az ? [0, Math.sign(fy), 0] : [0, 0, Math.sign(fz)];
    for (let i = 0; i < 4; i++) nrm.push(...n);
    const e1 = [vs[1][0] - vs[0][0], vs[1][1] - vs[0][1], vs[1][2] - vs[0][2]];
    const e2 = [vs[2][0] - vs[0][0], vs[2][1] - vs[0][1], vs[2][2] - vs[0][2]];
    const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const out = cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] > 0;
    if (out) idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    else idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }
  return { pos, uv, nrm, idx };
}

export function cubesGeometry(cubes: VCube[], texW: number, texH: number): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [], nrm: number[] = [], idx: number[] = [];
  for (const c of cubes) {
    const d = cubeData(c, texW, texH);
    const off = pos.length / 3;
    pos.push(...d.pos); uv.push(...d.uv); nrm.push(...d.nrm); idx.push(...d.idx.map((i) => i + off));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(pos.length).fill(1), 3));
  g.setIndex(idx);
  return g;
}

const geoCache = new Map<string, THREE.BufferGeometry>();

function partGeometry(spec: VanillaSpec, p: VPart, layer: VCube['layer'] | 'main'): THREE.BufferGeometry | null {
  const key = `${spec.key}|${p.n}|${layer}`;
  if (geoCache.has(key)) return geoCache.get(key)!;
  const cubes = p.cubes.filter((c) => (c.layer ?? 'main') === layer);
  const g = cubes.length ? cubesGeometry(cubes, 64, spec.texH) : null;
  if (g) geoCache.set(key, g);
  return g;
}

export interface RigPart { obj: THREE.Object3D; pos: THREE.Vector3; rot: THREE.Euler; }

export function buildVanilla(spec: VanillaSpec, mainMat: THREE.ShaderMaterial, overlayMat: THREE.ShaderMaterial | null, emissiveMat: THREE.ShaderMaterial | null): { obj: THREE.Group; parts: Map<string, THREE.Object3D>; rig: Map<string, RigPart> } {
  const obj = new THREE.Group();
  const root = new THREE.Group();
  const k = (spec.height * 16) / spec.modelH;
  root.scale.set(-k / 16, -k / 16, k / 16);
  root.position.y = (24 * k) / 16;
  obj.add(root);
  const parts = new Map<string, THREE.Object3D>();
  const rig = new Map<string, RigPart>();
  for (const p of spec.parts) {
    const pivot = new THREE.Group();
    pivot.rotation.order = 'ZYX';
    pivot.position.set(...p.pivot);
    if (p.rot) pivot.rotation.set(...p.rot);
    for (const [layer, mat] of [['main', mainMat], ['overlay', overlayMat], ['emissive', emissiveMat]] as const) {
      if (!mat) continue;
      const g = partGeometry(spec, p, layer === 'main' ? 'main' : layer);
      if (g) pivot.add(new THREE.Mesh(g, mat));
    }
    (p.parent ? parts.get(p.parent) ?? root : root).add(pivot);
    parts.set(p.n, pivot);
    rig.set(p.n, { obj: pivot, pos: pivot.position.clone(), rot: pivot.rotation.clone() });
  }
  return { obj, parts, rig };
}

export interface AnimState { ls: number; amt: number; age: number; pitch: number; aggressive: boolean; attack: number; crouch: boolean; type: string; }

function reset(rig: Map<string, RigPart>): void {
  for (const r of rig.values()) { r.obj.position.copy(r.pos); r.obj.rotation.copy(r.rot); }
}

export function animateVanilla(spec: VanillaSpec, rig: Map<string, RigPart>, s: AnimState): void {
  reset(rig);
  const g = (n: string) => rig.get(n)?.obj;
  const c = Math.cos, sn = Math.sin, PI = Math.PI;
  const head = g('head');
  if (head) head.rotation.x += -s.pitch;
  if (spec.rig === 'humanoid') {
    const ra = g('right_arm')!, la = g('left_arm')!, rl = g('right_leg')!, ll = g('left_leg')!, body = g('body')!;
    ra.rotation.x = c(s.ls * 0.6662 + PI) * s.amt;
    la.rotation.x = c(s.ls * 0.6662) * s.amt;
    rl.rotation.x = c(s.ls * 0.6662) * 1.4 * s.amt;
    ll.rotation.x = c(s.ls * 0.6662 + PI) * 1.4 * s.amt;
    if (s.type === 'hollowed') {
      const f = sn(s.attack * PI), f1 = sn((1 - (1 - s.attack) ** 2) * PI);
      const up = -PI / (s.aggressive ? 1.5 : 2.25);
      ra.rotation.set(up + f * 1.2 - f1 * 0.4, -(0.1 - f * 0.6), 0);
      la.rotation.set(up + f * 1.2 - f1 * 0.4, 0.1 - f * 0.6, 0);
    } else if (s.type === 'rattlebone' && s.aggressive) {
      ra.rotation.set(-HALF_PI - s.pitch, -0.1, 0);
      la.rotation.set(-HALF_PI - s.pitch, 0.5, 0);
    } else if (s.attack > 0) {
      const f = sn(Math.sqrt(s.attack) * PI);
      body.rotation.y = sn(Math.sqrt(s.attack) * PI * 2) * 0.2;
      ra.rotation.x -= f * 1.2 + sn(s.attack * PI) * 0.6;
      ra.rotation.y = body.rotation.y * 2;
    }
    const bob = c(s.age * 0.09) * 0.05 + 0.05, bx = sn(s.age * 0.067) * 0.05;
    ra.rotation.z += bob; la.rotation.z -= bob; ra.rotation.x += bx; la.rotation.x -= bx;
    if (s.crouch) {
      body.rotation.x = 0.5; ra.rotation.x += 0.4; la.rotation.x += 0.4;
      rl.position.z = 4; ll.position.z = 4; rl.position.y = 12.2; ll.position.y = 12.2;
      if (head) head.position.y = 4.2;
      body.position.y = 3.2; ra.position.y = 5.2; la.position.y = 5.2;
    }
  } else if (spec.rig === 'quadruped') {
    const a = c(s.ls * 0.6662) * 1.4 * s.amt, b = c(s.ls * 0.6662 + PI) * 1.4 * s.amt;
    g('right_hind_leg')!.rotation.x = a; g('left_hind_leg')!.rotation.x = b;
    g('right_front_leg')!.rotation.x = b; g('left_front_leg')!.rotation.x = a;
  } else if (spec.rig === 'chicken') {
    g('right_leg')!.rotation.x = c(s.ls * 0.6662) * 1.4 * s.amt;
    g('left_leg')!.rotation.x = c(s.ls * 0.6662 + PI) * 1.4 * s.amt;
    const flap = s.amt > 0.6 ? (sn(s.age * 1.4) + 1) * 0.4 : 0;
    g('right_wing')!.rotation.z = flap; g('left_wing')!.rotation.z = -flap;
  } else if (spec.rig === 'spider') {
    const L = s.ls * 0.6662;
    const yr = [0, PI, HALF_PI, PI * 1.5].map((o) => -(c(L * 2 + o) * 0.4) * s.amt);
    const zr = [0, PI, HALF_PI, PI * 1.5].map((o) => Math.abs(sn(L + o) * 0.4) * s.amt);
    SPIDER_LEGS.forEach(([n], i) => {
      const r = g(`right_${n}_leg`)!, l = g(`left_${n}_leg`)!;
      r.rotation.y += yr[i]; l.rotation.y -= yr[i];
      r.rotation.z += zr[i]; l.rotation.z -= zr[i];
    });
  }
}

const D = Math.PI / 180;

export function firstPersonArmMatrix(swing: number, out: THREE.Matrix4): THREE.Matrix4 {
  const sq = Math.sqrt(swing);
  const f2 = -0.3 * Math.sin(sq * Math.PI), f3 = 0.4 * Math.sin(sq * Math.PI * 2), f4 = -0.4 * Math.sin(swing * Math.PI);
  const f5 = Math.sin(swing * swing * Math.PI), f6 = Math.sin(sq * Math.PI);
  const m = new THREE.Matrix4(), t = new THREE.Matrix4();
  out.makeTranslation(f2 + 0.64, f3 - 0.6, f4 - 0.72);
  out.multiply(m.makeRotationY(45 * D)).multiply(m.makeRotationY(f6 * 70 * D)).multiply(m.makeRotationZ(-f5 * 20 * D));
  out.multiply(t.makeTranslation(-1, 3.6, 3.5));
  out.multiply(m.makeRotationZ(120 * D)).multiply(m.makeRotationX(200 * D)).multiply(m.makeRotationY(-135 * D));
  out.multiply(t.makeTranslation(5.6, 0, 0)).multiply(t.makeTranslation(-5 / 16, 2 / 16, 0)).multiply(m.makeScale(1 / 16, 1 / 16, 1 / 16));
  return out;
}

export const PLAYER_ARM_CUBES: VCube[] = [{ o: [-3, -2, -2], s: [4, 12, 4], uv: [40, 16] }, { o: [-3, -2, -2], s: [4, 12, 4], uv: [40, 32], inf: 0.25 }];

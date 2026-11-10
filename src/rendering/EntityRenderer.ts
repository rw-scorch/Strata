import * as THREE from 'three';
import { MOB_BY_CODE, MobType, MOBS } from '../core/sim/mobs';
import { getItem } from '../core/items';
import { BLOCKS } from '../core/blocks';
import type { Appearance } from '../core/sim/WorldSim';
import type { TextureAtlas } from '../resources/TextureAtlas';
import { FACE_SLOTS } from '../resources/TextureAtlas';
import type { WorldUniforms } from './ChunkMaterial';
import { VANILLA, buildVanilla, animateVanilla, cubesGeometry, PLAYER_ARM_CUBES, VanillaSpec, RigPart } from './VanillaModels';

export const SKIN = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac, 0x5c3a21, 0xd4a373, 0xa0522d];
export const HAIR = [0x2b1d0e, 0x5a3825, 0xb5651d, 0xe6c35c, 0x111111, 0xa83232, 0xdddddd, 0x3a5fcd];
export const CLOTH = [0x3366cc, 0xcc3333, 0x33aa55, 0xe0b030, 0x7a3fb5, 0x222831, 0xe8e8e8, 0xd2691e, 0x1aa3a3, 0xff69b4, 0x556b2f, 0x8b4513];

interface PartSpec { n: string; s: [number, number, number]; p: [number, number, number]; o?: [number, number, number]; c: number; e?: boolean; parent?: string; r?: [number, number, number]; }

const MOB_PARTS: Partial<Record<MobType, PartSpec[]>> = {
  woolhorn: [
    { n: 'body', s: [0.78, 0.66, 1.05], p: [0, 0.86, 0], c: 0xf0ead6 },
    { n: 'head', s: [0.42, 0.42, 0.48], p: [0, 1.05, -0.55], o: [0, 0.02, -0.18], c: 0xe8e0c8 },
    { n: 'face', s: [0.32, 0.3, 0.06], p: [0, 0, 0], o: [0, -0.02, -0.42], c: 0x5a4636, parent: 'head' },
    { n: 'eyeL', s: [0.06, 0.06, 0.02], p: [0, 0, 0], o: [-0.09, 0.04, -0.46], c: 0x111111, parent: 'head' },
    { n: 'eyeR', s: [0.06, 0.06, 0.02], p: [0, 0, 0], o: [0.09, 0.04, -0.46], c: 0x111111, parent: 'head' },
    { n: 'hornL', s: [0.12, 0.22, 0.22], p: [0, 0, 0], o: [-0.27, 0.1, -0.12], c: 0x8a6a4a, parent: 'head' },
    { n: 'hornR', s: [0.12, 0.22, 0.22], p: [0, 0, 0], o: [0.27, 0.1, -0.12], c: 0x8a6a4a, parent: 'head' },
    { n: 'hornLt', s: [0.1, 0.1, 0.14], p: [0, 0, 0], o: [-0.27, -0.04, -0.28], c: 0x6e5236, parent: 'head' },
    { n: 'hornRt', s: [0.1, 0.1, 0.14], p: [0, 0, 0], o: [0.27, -0.04, -0.28], c: 0x6e5236, parent: 'head' },
    { n: 'leg0', s: [0.18, 0.56, 0.18], p: [-0.22, 0.56, -0.34], o: [0, -0.28, 0], c: 0x4a3a2c },
    { n: 'leg1', s: [0.18, 0.56, 0.18], p: [0.22, 0.56, -0.34], o: [0, -0.28, 0], c: 0x4a3a2c },
    { n: 'leg2', s: [0.18, 0.56, 0.18], p: [-0.22, 0.56, 0.34], o: [0, -0.28, 0], c: 0x4a3a2c },
    { n: 'leg3', s: [0.18, 0.56, 0.18], p: [0.22, 0.56, 0.34], o: [0, -0.28, 0], c: 0x4a3a2c },
  ],
  mudsnout: [
    { n: 'body', s: [0.8, 0.58, 1.1], p: [0, 0.62, 0], c: 0xc98a6a },
    { n: 'mud', s: [0.5, 0.06, 0.5], p: [0.1, 0.94, 0.15], c: 0x6e4a2e },
    { n: 'head', s: [0.5, 0.48, 0.46], p: [0, 0.72, -0.58], o: [0, 0.04, -0.18], c: 0xd49478 },
    { n: 'snout', s: [0.26, 0.2, 0.12], p: [0, 0, 0], o: [0, -0.04, -0.46], c: 0xe8a090, parent: 'head' },
    { n: 'nose', s: [0.16, 0.06, 0.02], p: [0, 0, 0], o: [0, -0.04, -0.53], c: 0x8a4a3a, parent: 'head' },
    { n: 'eyeL', s: [0.06, 0.06, 0.02], p: [0, 0, 0], o: [-0.14, 0.08, -0.42], c: 0x111111, parent: 'head' },
    { n: 'eyeR', s: [0.06, 0.06, 0.02], p: [0, 0, 0], o: [0.14, 0.08, -0.42], c: 0x111111, parent: 'head' },
    { n: 'earL', s: [0.14, 0.14, 0.06], p: [0, 0, 0], o: [-0.2, 0.28, -0.12], c: 0xb87a5a, parent: 'head' },
    { n: 'earR', s: [0.14, 0.14, 0.06], p: [0, 0, 0], o: [0.2, 0.28, -0.12], c: 0xb87a5a, parent: 'head' },
    { n: 'leg0', s: [0.22, 0.34, 0.22], p: [-0.24, 0.34, -0.36], o: [0, -0.17, 0], c: 0xa86a4c },
    { n: 'leg1', s: [0.22, 0.34, 0.22], p: [0.24, 0.34, -0.36], o: [0, -0.17, 0], c: 0xa86a4c },
    { n: 'leg2', s: [0.22, 0.34, 0.22], p: [-0.24, 0.34, 0.36], o: [0, -0.17, 0], c: 0xa86a4c },
    { n: 'leg3', s: [0.22, 0.34, 0.22], p: [0.24, 0.34, 0.36], o: [0, -0.17, 0], c: 0xa86a4c },
  ],
  fernhen: [
    { n: 'body', s: [0.38, 0.36, 0.5], p: [0, 0.42, 0], c: 0x5f9a4a },
    { n: 'wingL', s: [0.06, 0.24, 0.36], p: [-0.22, 0.48, 0], c: 0x4a8038 },
    { n: 'wingR', s: [0.06, 0.24, 0.36], p: [0.22, 0.48, 0], c: 0x4a8038 },
    { n: 'tail', s: [0.3, 0.3, 0.06], p: [0, 0.58, 0.28], r: [-0.4, 0, 0], c: 0x3f7a2c },
    { n: 'head', s: [0.24, 0.3, 0.24], p: [0, 0.62, -0.24], o: [0, 0.12, -0.04], c: 0x74b45a },
    { n: 'beak', s: [0.12, 0.08, 0.12], p: [0, 0, 0], o: [0, 0.12, -0.22], c: 0xf0a020, parent: 'head' },
    { n: 'crest', s: [0.05, 0.14, 0.2], p: [0, 0, 0], o: [0, 0.32, 0], c: 0x2f8a2a, parent: 'head' },
    { n: 'eyeL', s: [0.02, 0.05, 0.05], p: [0, 0, 0], o: [-0.13, 0.18, -0.06], c: 0x111111, parent: 'head' },
    { n: 'eyeR', s: [0.02, 0.05, 0.05], p: [0, 0, 0], o: [0.13, 0.18, -0.06], c: 0x111111, parent: 'head' },
    { n: 'leg0', s: [0.06, 0.28, 0.06], p: [-0.08, 0.28, 0.02], o: [0, -0.14, 0], c: 0xe0b030 },
    { n: 'leg1', s: [0.06, 0.28, 0.06], p: [0.08, 0.28, 0.02], o: [0, -0.14, 0], c: 0xe0b030 },
  ],
  hollowed: [
    { n: 'body', s: [0.5, 0.7, 0.28], p: [0, 1.04, 0], c: 0x3a3a4a },
    { n: 'rags', s: [0.52, 0.18, 0.3], p: [0, 0.74, 0], c: 0x2a2a34 },
    { n: 'head', s: [0.48, 0.48, 0.48], p: [0, 1.4, 0], o: [0, 0.24, 0], c: 0x7a8a6a },
    { n: 'eyeL', s: [0.1, 0.08, 0.02], p: [0, 0, 0], o: [-0.11, 0.26, -0.25], c: 0xd8f0c0, e: true, parent: 'head' },
    { n: 'eyeR', s: [0.1, 0.08, 0.02], p: [0, 0, 0], o: [0.11, 0.26, -0.25], c: 0xd8f0c0, e: true, parent: 'head' },
    { n: 'mouth', s: [0.2, 0.06, 0.02], p: [0, 0, 0], o: [0, 0.1, -0.25], c: 0x2a3020, parent: 'head' },
    { n: 'armL', s: [0.22, 0.7, 0.22], p: [-0.37, 1.36, 0], o: [0, -0.3, 0], c: 0x7a8a6a },
    { n: 'armR', s: [0.22, 0.7, 0.22], p: [0.37, 1.36, 0], o: [0, -0.3, 0], c: 0x7a8a6a },
    { n: 'legL', s: [0.23, 0.7, 0.23], p: [-0.12, 0.7, 0], o: [0, -0.35, 0], c: 0x2e3a4e },
    { n: 'legR', s: [0.23, 0.7, 0.23], p: [0.12, 0.7, 0], o: [0, -0.35, 0], c: 0x2e3a4e },
  ],
  rattlebone: [
    { n: 'body', s: [0.44, 0.7, 0.2], p: [0, 1.06, 0], c: 0xd8d4c4 },
    { n: 'ribs', s: [0.34, 0.06, 0.22], p: [0, 1.1, 0], c: 0x8a8678 },
    { n: 'head', s: [0.48, 0.48, 0.48], p: [0, 1.42, 0], o: [0, 0.24, 0], c: 0xe4e0d0 },
    { n: 'eyeL', s: [0.12, 0.1, 0.02], p: [0, 0, 0], o: [-0.11, 0.26, -0.25], c: 0x1a1a1a, parent: 'head' },
    { n: 'eyeR', s: [0.12, 0.1, 0.02], p: [0, 0, 0], o: [0.11, 0.26, -0.25], c: 0x1a1a1a, parent: 'head' },
    { n: 'jaw', s: [0.3, 0.06, 0.02], p: [0, 0, 0], o: [0, 0.08, -0.25], c: 0x3a3a3a, parent: 'head' },
    { n: 'armL', s: [0.12, 0.72, 0.12], p: [-0.32, 1.38, 0], o: [0, -0.32, 0], c: 0xd8d4c4 },
    { n: 'armR', s: [0.12, 0.72, 0.12], p: [0.32, 1.38, 0], o: [0, -0.32, 0], c: 0xd8d4c4 },
    { n: 'bow', s: [0.05, 0.7, 0.05], p: [0, 0, 0], o: [0, -0.62, -0.12], c: 0x6b4a2a, parent: 'armR' },
    { n: 'string', s: [0.01, 0.62, 0.01], p: [0, 0, 0], o: [0, -0.62, -0.02], c: 0xeeeeee, parent: 'armR' },
    { n: 'legL', s: [0.12, 0.72, 0.12], p: [-0.12, 0.72, 0], o: [0, -0.36, 0], c: 0xd8d4c4 },
    { n: 'legR', s: [0.12, 0.72, 0.12], p: [0.12, 0.72, 0], o: [0, -0.36, 0], c: 0xd8d4c4 },
  ],
  duskweaver: [
    { n: 'body', s: [0.86, 0.55, 0.9], p: [0, 0.58, 0.38], c: 0x2a1e34 },
    { n: 'mark', s: [0.4, 0.04, 0.4], p: [0, 0.86, 0.42], c: 0x6a2a6a },
    { n: 'head', s: [0.6, 0.46, 0.56], p: [0, 0.52, -0.32], o: [0, 0, -0.1], c: 0x3a2a44 },
    { n: 'eye0', s: [0.1, 0.08, 0.02], p: [0, 0, 0], o: [-0.15, 0.08, -0.39], c: 0xff4060, e: true, parent: 'head' },
    { n: 'eye1', s: [0.1, 0.08, 0.02], p: [0, 0, 0], o: [0.15, 0.08, -0.39], c: 0xff4060, e: true, parent: 'head' },
    { n: 'eye2', s: [0.06, 0.06, 0.02], p: [0, 0, 0], o: [-0.06, 0.16, -0.39], c: 0xff8090, e: true, parent: 'head' },
    { n: 'eye3', s: [0.06, 0.06, 0.02], p: [0, 0, 0], o: [0.06, 0.16, -0.39], c: 0xff8090, e: true, parent: 'head' },
    ...[0, 1, 2, 3].flatMap((i) => [
      { n: `legL${i}`, s: [0.9, 0.07, 0.07] as [number, number, number], p: [-0.25, 0.55, -0.4 + i * 0.22] as [number, number, number], o: [-0.42, 0, 0] as [number, number, number], r: [0, (i - 1.5) * 0.35, 0.55] as [number, number, number], c: 0x1e1626 },
      { n: `legR${i}`, s: [0.9, 0.07, 0.07] as [number, number, number], p: [0.25, 0.55, -0.4 + i * 0.22] as [number, number, number], o: [0.42, 0, 0] as [number, number, number], r: [0, -(i - 1.5) * 0.35, -0.55] as [number, number, number], c: 0x1e1626 },
    ]),
  ],
};

function playerParts(a: Appearance): PartSpec[] {
  const skin = SKIN[a.skin % SKIN.length], hair = HAIR[a.hair % HAIR.length], shirt = CLOTH[a.shirt % CLOTH.length], pants = CLOTH[a.pants % CLOTH.length];
  const dark = (c: number) => (((c >> 16) & 255) * 0.6) << 16 | (((c >> 8) & 255) * 0.6) << 8 | ((c & 255) * 0.6);
  return [
    { n: 'body', s: [0.46, 0.68, 0.24], p: [0, 1.02, 0], c: shirt },
    { n: 'belt', s: [0.47, 0.06, 0.25], p: [0, 0.71, 0], c: dark(pants) },
    { n: 'head', s: [0.46, 0.46, 0.46], p: [0, 1.36, 0], o: [0, 0.23, 0], c: skin },
    { n: 'hair', s: [0.5, 0.14, 0.5], p: [0, 0, 0], o: [0, 0.43, 0.01], c: hair, parent: 'head' },
    { n: 'hairB', s: [0.5, 0.34, 0.08], p: [0, 0, 0], o: [0, 0.3, 0.23], c: hair, parent: 'head' },
    { n: 'eyeL', s: [0.08, 0.06, 0.02], p: [0, 0, 0], o: [-0.1, 0.24, -0.235], c: 0xffffff, parent: 'head' },
    { n: 'eyeR', s: [0.08, 0.06, 0.02], p: [0, 0, 0], o: [0.1, 0.24, -0.235], c: 0xffffff, parent: 'head' },
    { n: 'pupL', s: [0.04, 0.06, 0.02], p: [0, 0, 0], o: [-0.08, 0.24, -0.24], c: 0x2a3a6a, parent: 'head' },
    { n: 'pupR', s: [0.04, 0.06, 0.02], p: [0, 0, 0], o: [0.12, 0.24, -0.24], c: 0x2a3a6a, parent: 'head' },
    { n: 'armL', s: [0.2, 0.68, 0.2], p: [-0.34, 1.32, 0], o: [0, -0.28, 0], c: shirt },
    { n: 'handL', s: [0.2, 0.2, 0.2], p: [0, 0, 0], o: [0, -0.56, 0], c: skin, parent: 'armL' },
    { n: 'armR', s: [0.2, 0.68, 0.2], p: [0.34, 1.32, 0], o: [0, -0.28, 0], c: shirt },
    { n: 'handR', s: [0.2, 0.2, 0.2], p: [0, 0, 0], o: [0, -0.56, 0], c: skin, parent: 'armR' },
    { n: 'legL', s: [0.22, 0.68, 0.22], p: [-0.115, 0.68, 0], o: [0, -0.34, 0], c: pants },
    { n: 'legR', s: [0.22, 0.68, 0.22], p: [0.115, 0.68, 0], o: [0, -0.34, 0], c: pants },
    { n: 'shoeL', s: [0.23, 0.1, 0.24], p: [0, 0, 0], o: [0, -0.63, -0.01], c: 0x2a2018, parent: 'legL' },
    { n: 'shoeR', s: [0.23, 0.1, 0.24], p: [0, 0, 0], o: [0, -0.63, -0.01], c: 0x2a2018, parent: 'legR' },
  ];
}

const geoCache = new Map<string, THREE.BufferGeometry>();
function boxGeo(s: [number, number, number], c: number): THREE.BufferGeometry {
  const key = `${s.join(',')}|${c}`;
  let g = geoCache.get(key);
  if (g) return g;
  g = new THREE.BoxGeometry(s[0], s[1], s[2]);
  const n = g.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  const r = ((c >> 16) & 255) / 255, gg = ((c >> 8) & 255) / 255, b = (c & 255) / 255;
  for (let i = 0; i < n; i++) {
    const f = Math.floor(i / 4);
    const v = 0.94 + ((f * 37 + i * 13) % 7) / 60;
    col[i * 3] = r * v; col[i * 3 + 1] = gg * v; col[i * 3 + 2] = b * v;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geoCache.set(key, g);
  return g;
}

interface Snap { t: number; x: number; y: number; z: number; yaw: number; pitch: number; }

export interface EntityView {
  id: string;
  kind: 'mob' | 'item' | 'arrow' | 'player';
  type: number;
  obj: THREE.Group;
  parts: Map<string, THREE.Object3D>;
  mats: THREE.ShaderMaterial[];
  snaps: Snap[];
  x: number; y: number; z: number; yaw: number; pitch: number;
  flags: number;
  extra: number;
  walk: number;
  lastX: number; lastZ: number;
  dying: number;
  hurtT: number;
  lightT: number;
  light: number;
  name?: string;
  tag?: THREE.Sprite;
  hw: number; h: number;
  swing: number;
  bob: number;
  age: number;
  spd: number;
  spec?: VanillaSpec;
  rig?: Map<string, RigPart>;
  limbs?: [THREE.Object3D, number][];
}

type Built = { obj: THREE.Group; parts: Map<string, THREE.Object3D>; mats: THREE.ShaderMaterial[]; spec?: VanillaSpec; rig?: Map<string, RigPart> };
const armGeoCache: { g?: THREE.BufferGeometry } = {};

export type LightProbe = (x: number, y: number, z: number) => number;

export class EntityRenderer {
  readonly group = new THREE.Group();
  readonly views = new Map<string, EntityView>();
  private u: WorldUniforms;
  private atlas: TextureAtlas;
  private probe: LightProbe;
  interpDelay = 110;

  constructor(u: WorldUniforms, atlas: TextureAtlas, probe: LightProbe) {
    this.u = u; this.atlas = atlas; this.probe = probe;
  }

  setAtlas(a: TextureAtlas): void {
    this.atlas = a;
    const now = performance.now();
    for (const v of [...this.views.values()]) {
      const app = (v as EntityView & { app?: Appearance }).app;
      const snap = { id: v.id, kind: v.kind, type: v.type, x: v.x, y: v.y, z: v.z, yaw: v.yaw, pitch: v.pitch, flags: v.flags, extra: v.extra, name: v.name };
      this.removeNow(v.id);
      this.upsert(snap.id, snap.kind, snap.type, snap.x, snap.y, snap.z, snap.yaw, snap.pitch, snap.flags, snap.extra, now, snap.name ? { name: snap.name, appearance: app } : undefined);
    }
  }

  private vanilla(key: MobType | 'player', skin = 0): Built | null {
    const spec = VANILLA[key];
    if (!spec) return null;
    const count = this.atlas.playerSkinCount;
    const mainKey = key === 'player' ? (count ? `player${skin % count}` : '') : spec.main;
    const tex = this.atlas.entityTextures.get(mainKey);
    if (!tex) return null;
    const mats: THREE.ShaderMaterial[] = [];
    const main = this.material(tex);
    mats.push(main);
    let overlay: THREE.ShaderMaterial | null = null, emissive: THREE.ShaderMaterial | null = null;
    const ovTex = spec.overlay ? this.atlas.entityTextures.get(spec.overlay) : undefined;
    if (ovTex) {
      const m = this.material(ovTex, spec.overlay === 'spider_eyes');
      mats.push(m);
      if (spec.overlay === 'spider_eyes') emissive = m; else overlay = m;
    }
    const b = buildVanilla(spec, main, overlay, emissive);
    return { obj: b.obj, parts: b.parts, mats, spec, rig: b.rig };
  }

  private material(map: THREE.Texture | null = null, emissive = false): THREE.ShaderMaterial {
    const m = new THREE.ShaderMaterial({
      uniforms: {
        uFogColor: this.u.uFogColor, uFogNear: this.u.uFogNear, uFogFar: this.u.uFogFar, uLight: { value: 1 }, uHurt: { value: 0 },
        uMap: { value: map }, uUseMap: { value: map ? 1 : 0 }, uEmissive: { value: emissive ? 1 : 0 }, uOpacity: { value: 1 },
      },
      vertexShader: `attribute vec3 color; varying vec3 vColor; varying vec2 vUv; varying float vFog; varying float vShade;
        void main(){ vColor = color; vUv = uv; vec3 n = normalize(mat3(modelMatrix) * normal);
        vShade = 0.6 + 0.4 * max(n.y, 0.0) + 0.15 * abs(n.z) - 0.12 * max(-n.y, 0.0);
        vec4 mv = modelViewMatrix * vec4(position, 1.0); vFog = length(mv.xyz); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar; uniform float uLight; uniform float uHurt;
        uniform sampler2D uMap; uniform float uUseMap; uniform float uEmissive; uniform float uOpacity;
        varying vec3 vColor; varying vec2 vUv; varying float vFog; varying float vShade;
        void main(){ vec4 base = vec4(vColor, 1.0);
          if (uUseMap > 0.5) { vec4 t = texture2D(uMap, vUv); if (t.a < 0.5) discard; base.rgb *= t.rgb; }
          float l = mix(uLight * vShade, 1.6, uEmissive);
          vec3 c = mix(base.rgb * l, vec3(1.0, 0.12, 0.08), uHurt * 0.55);
          gl_FragColor = vec4(mix(c, uFogColor, smoothstep(uFogNear, uFogFar, vFog)), uOpacity); }`,
      side: map ? THREE.DoubleSide : THREE.FrontSide,
      transparent: false,
    });
    return m;
  }

  private build(specs: PartSpec[]): { obj: THREE.Group; parts: Map<string, THREE.Object3D>; mats: THREE.ShaderMaterial[] } {
    const obj = new THREE.Group();
    const parts = new Map<string, THREE.Object3D>();
    const mat = this.material();
    const emat = this.material(null, true);
    for (const s of specs) {
      const pivot = new THREE.Group();
      pivot.position.set(...s.p);
      if (s.r) pivot.rotation.set(...s.r);
      const mesh = new THREE.Mesh(boxGeo(s.s, s.c), s.e ? emat : mat);
      if (s.o) mesh.position.set(...s.o);
      pivot.add(mesh);
      const parent = s.parent ? parts.get(s.parent) : obj;
      (parent ?? obj).add(pivot);
      parts.set(s.n, pivot);
    }
    return { obj, parts, mats: [mat, emat] };
  }

  armModel(skin: number): { obj: THREE.Group; mats: THREE.ShaderMaterial[]; vanilla: boolean } {
    const obj = new THREE.Group();
    const count = this.atlas.playerSkinCount;
    const tex = count ? this.atlas.entityTextures.get(`player${skin % count}`) : undefined;
    if (tex) {
      const m = this.material(tex);
      armGeoCache.g ??= cubesGeometry(PLAYER_ARM_CUBES, 64, 64);
      obj.add(new THREE.Mesh(armGeoCache.g, m));
      return { obj, mats: [m], vanilla: true };
    }
    const m = this.material();
    const arm = new THREE.Mesh(boxGeo([0.2, 0.7, 0.2], SKIN[skin % SKIN.length]), m);
    obj.add(arm);
    return { obj, mats: [m], vanilla: false };
  }

  itemModel(itemId: number): { obj: THREE.Group; mats: THREE.ShaderMaterial[] } {
    const obj = new THREE.Group();
    const it = getItem(itemId);
    const b = it?.kind === 'block' && it.blockIcon ? BLOCKS[itemId] : null;
    if (b) {
      const g = new THREE.BoxGeometry(0.26, 0.26, 0.26);
      const uv = g.getAttribute('uv') as THREE.BufferAttribute;
      const d = this.atlas.data;
      const col = new Float32Array(g.getAttribute('position').count * 3).fill(1);
      for (let f = 0; f < 6; f++) {
        const slot = [0, 1, 2, 3, 4, 5][f];
        let tile = d.blockTiles[itemId * FACE_SLOTS + slot];
        if (b.front && f === 4) tile = d.blockTiles[itemId * FACE_SLOTS + 6];
        const tx = tile % d.cols, ty = Math.floor(tile / d.cols);
        for (let k = 0; k < 4; k++) {
          const i = f * 4 + k;
          const u0 = uv.getX(i), v0 = uv.getY(i);
          uv.setXY(i, (tx + u0) / d.cols, (ty + 1 - v0) / d.rows);
          const tintCode = d.tintTable[itemId * 2];
          const tintTop = d.tintTable[itemId * 2 + 1] === 1;
          if (tintCode && (!tintTop || f === 2)) { col[i * 3] = 0.57; col[i * 3 + 1] = 0.74; col[i * 3 + 2] = 0.35; }
        }
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const m = this.material(this.atlas.texture);
      m.side = THREE.FrontSide;
      obj.add(new THREE.Mesh(g, m));
      return { obj, mats: [m] };
    }
    const g = new THREE.PlaneGeometry(0.42, 0.42);
    const [u0, v0, u1, v1] = this.atlas.iconUV(itemId);
    const uv = g.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) ? u1 : u0, uv.getY(i) ? v0 : v1);
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(uv.count * 3).fill(1), 3));
    const m = this.material(this.atlas.iconTexture);
    obj.add(new THREE.Mesh(g, m));
    return { obj, mats: [m] };
  }

  private tags = new Map<string, { name: string; color: string }>();

  setTags(map: Map<string, { name: string; color: string }>): void {
    this.tags = map;
    for (const [id, tg] of map) {
      const v = this.views.get(id);
      if (!v || v.kind !== 'mob' || v.name === tg.name) continue;
      if (v.tag) v.obj.remove(v.tag);
      v.name = tg.name; v.tag = this.nameTag(tg.name, tg.color); v.obj.add(v.tag);
    }
  }

  private nameTag(name: string, color = '#fff'): THREE.Sprite {
    const c = document.createElement('canvas');
    const g = c.getContext('2d')!;
    g.font = 'bold 28px system-ui, sans-serif';
    const w = Math.ceil(g.measureText(name).width) + 20;
    c.width = w; c.height = 40;
    g.font = 'bold 28px system-ui, sans-serif';
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.fillRect(0, 0, w, 40);
    g.fillStyle = color;
    g.textBaseline = 'middle';
    g.fillText(name, 10, 21);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.NoColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: true, transparent: true }));
    s.scale.set(w / 80, 0.5, 1);
    s.position.y = 2.15;
    return s;
  }

  upsert(id: string, kind: EntityView['kind'], type: number, x: number, y: number, z: number, yaw: number, pitch: number, flags: number, extra: number, now: number, opts?: { name?: string; appearance?: Appearance }): EntityView {
    let v = this.views.get(id);
    if (v && v.kind === 'player' && opts?.appearance && JSON.stringify(opts.appearance) !== JSON.stringify((v as EntityView & { app?: Appearance }).app)) {
      this.removeNow(id);
      v = undefined;
    }
    if (!v) {
      let built: Built;
      let hw = 0.3, h = 1.8;
      if (kind === 'mob') {
        const def = MOB_BY_CODE[type] ?? MOBS.woolhorn;
        if (def.npc) {
          const n = Number(id.replace(/\D/g, '')) || 0;
          const ap = def.type === 'quartermaster' ? { skin: 3, hair: 5, shirt: 7, pants: 2 } : { skin: n % 6, hair: n % 8, shirt: (n * 3) % 12, pants: (n * 5) % 12 };
          built = this.vanilla('player', def.type === 'quartermaster' ? 7 : n) ?? this.build(playerParts(ap));
        } else built = this.vanilla(def.type) ?? this.build(MOB_PARTS[def.type] ?? MOB_PARTS.woolhorn!);
        hw = def.hw; h = def.h;
      } else if (kind === 'player') {
        const ap = opts?.appearance ?? { skin: 0, hair: 0, shirt: 0, pants: 0 };
        built = this.vanilla('player', ap.skin) ?? this.build(playerParts(ap));
      } else if (kind === 'item') {
        const m = this.itemModel(type);
        built = { obj: m.obj, parts: new Map(), mats: m.mats };
        hw = 0.15; h = 0.3;
      } else {
        const g = new THREE.Group();
        const m = this.material();
        const shaft = new THREE.Mesh(boxGeo([0.04, 0.04, 0.55], 0x8a6a3e), m);
        const tip = new THREE.Mesh(boxGeo([0.07, 0.07, 0.1], 0x6a6a6a), m);
        tip.position.z = -0.3;
        const fl = new THREE.Mesh(boxGeo([0.12, 0.02, 0.12], 0xe8e8e8), m);
        fl.position.z = 0.25;
        g.add(shaft, tip, fl);
        built = { obj: g, parts: new Map(), mats: [m] };
        hw = 0.05; h = 0.05;
      }
      v = {
        id, kind, type, obj: built.obj, parts: built.parts, mats: built.mats, snaps: [], x, y, z, yaw, pitch, flags, extra,
        walk: 0, lastX: x, lastZ: z, dying: 0, hurtT: 0, lightT: 0, light: 1, hw, h, swing: 0, bob: Math.random() * 6,
        age: Math.random() * 100, spd: 0, spec: built.spec, rig: built.rig,
        limbs: [...built.parts].filter(([n]) => /^leg([0-3LR])$/.test(n)).map(([n, o]) => { const c = n.slice(3); return [o, c === 'L' ? 0 : c === 'R' ? 1 : Number(c)] as [THREE.Object3D, number]; }),
      };
      if (kind === 'player' && opts?.name) { v.name = opts.name; v.tag = this.nameTag(opts.name); v.obj.add(v.tag); (v as EntityView & { app?: Appearance }).app = opts.appearance; }
      if (kind === 'mob') {
        const def = MOB_BY_CODE[type];
        const tg = this.tags.get(id) ?? (def?.type === 'quartermaster' ? { name: 'Quartermaster', color: '#f3d27a' } : undefined);
        if (tg) { v.name = tg.name; v.tag = this.nameTag(tg.name, tg.color); v.obj.add(v.tag); }
      }
      v.obj.position.set(x, y, z);
      this.group.add(v.obj);
      this.views.set(id, v);
    }
    if ((flags & 1) && !(v.flags & 1) && kind === 'mob') v.hurtT = 0.4;
    if (kind === 'player' && (flags & 1024) && !(v.flags & 1024)) v.swing = 1;
    if (kind === 'mob' && (flags & 4) && !(v.flags & 4)) v.swing = 1;
    v.flags = flags;
    v.extra = extra;
    v.snaps.push({ t: now, x, y, z, yaw, pitch });
    if (v.snaps.length > 12) v.snaps.shift();
    return v;
  }

  remove(id: string, death: boolean): void {
    const v = this.views.get(id);
    if (!v) return;
    if (death && v.kind === 'mob') { v.dying = 0.0001; return; }
    this.removeNow(id);
  }

  removeNow(id: string): void {
    const v = this.views.get(id);
    if (!v) return;
    this.group.remove(v.obj);
    for (const m of v.mats) m.dispose();
    if (v.tag) { (v.tag.material as THREE.SpriteMaterial).map?.dispose(); v.tag.material.dispose(); }
    if (v.kind === 'item') v.obj.traverse((o) => { if ((o as THREE.Mesh).geometry) (o as THREE.Mesh).geometry.dispose(); });
    this.views.delete(id);
  }

  clear(): void { for (const id of [...this.views.keys()]) this.removeNow(id); }

  update(dt: number, now: number): void {
    const rt = now - this.interpDelay;
    for (const v of [...this.views.values()]) {
      const s = v.snaps;
      if (s.length) {
        let a = s[0], b = s[s.length - 1];
        for (let i = 0; i < s.length - 1; i++) if (s[i].t <= rt && s[i + 1].t >= rt) { a = s[i]; b = s[i + 1]; break; }
        if (rt >= b.t) a = b;
        const span = b.t - a.t;
        const t = span > 0 ? Math.min(1, Math.max(0, (rt - a.t) / span)) : 1;
        v.x = a.x + (b.x - a.x) * t; v.y = a.y + (b.y - a.y) * t; v.z = a.z + (b.z - a.z) * t;
        let dy = b.yaw - a.yaw;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        v.yaw = a.yaw + dy * t;
        v.pitch = a.pitch + (b.pitch - a.pitch) * t;
      }
      const moved = Math.hypot(v.x - v.lastX, v.z - v.lastZ);
      v.lastX = v.x; v.lastZ = v.z;
      v.walk += moved * 4.5;
      v.spd += ((dt > 0 ? moved / dt : 0) - v.spd) * Math.min(1, dt * 12);
      const speed = v.spd;
      const amp = Math.min(1, speed / 3);
      v.obj.position.set(v.x, v.y, v.z);
      if (v.kind === 'item') {
        v.bob += dt * 2;
        v.obj.position.y += 0.18 + Math.sin(v.bob) * 0.06;
        v.obj.rotation.y += dt * 1.6;
      } else if (v.kind === 'arrow') {
        v.obj.rotation.set(0, v.yaw, 0);
      } else {
        v.obj.rotation.y = v.yaw;
        v.obj.scale.setScalar(v.kind === 'mob' && (v.flags & 128) ? 0.55 : 1);
        v.age += dt * 20;
        if (v.swing > 0) v.swing = Math.max(0, v.swing - dt * 4);
        const aggressive = (v.flags & 16) !== 0;
        const mtype = v.kind === 'mob' ? MOB_BY_CODE[v.type]?.type ?? '' : 'player';
        if (v.spec && v.rig) {
          animateVanilla(v.spec, v.rig, { ls: v.walk, amt: Math.min(1, speed / 5), age: v.age, pitch: v.kind === 'player' ? v.pitch : 0, aggressive, attack: v.swing > 0 ? 1 - v.swing : 0, crouch: v.kind === 'player' && (v.flags & 2) !== 0, type: mtype });
        } else {
          this.animateSimple(v, amp, aggressive, mtype);
        }
        if (v.kind === 'player') {
          const crouch = (v.flags & 2) !== 0;
          if (!v.rig) {
            const body = v.parts.get('body'), head = v.parts.get('head');
            if (body) body.rotation.x = crouch ? -0.35 : 0;
            if (head) head.position.z = crouch ? -0.12 : 0;
          }
          v.obj.position.y -= crouch ? 0.12 : 0;
          if (v.tag) v.tag.visible = !crouch;
          v.obj.visible = !(v.flags & (1 << 14));
        }
        if (v.hurtT > 0) v.hurtT -= dt;
        if (v.dying > 0) {
          v.dying += dt;
          v.obj.rotation.z = Math.min(Math.PI / 2, v.dying * 5);
          for (const m of v.mats) m.uniforms.uHurt.value = 1;
          if (v.dying > 0.7) { this.removeNow(v.id); continue; }
        }
      }
      v.lightT -= dt;
      if (v.lightT <= 0) { v.lightT = 0.25 + Math.random() * 0.1; v.light = this.probe(v.x, v.y + Math.min(1.2, v.h * 0.6), v.z); }
      const hurt = v.hurtT > 0 || (v.kind === 'mob' && (v.flags & 1)) ? 1 : 0;
      for (const m of v.mats) { m.uniforms.uLight.value = v.light; if (!v.dying) m.uniforms.uHurt.value = hurt; }
      if (v.flags & 2 && v.kind === 'mob') for (const m of v.mats) m.uniforms.uLight.value = Math.max(v.light, 0.95);
    }
  }

  private animateSimple(v: EntityView, amp: number, aggressive: boolean, mtype: string): void {
    const sw = Math.sin(v.walk) * 0.8 * amp;
    const p = v.parts;
    for (const [o, idx] of v.limbs ?? []) o.rotation.x = idx === 0 || idx === 3 ? sw : -sw;
    if (mtype === 'duskweaver') {
      for (let i = 0; i < 4; i++) {
        const a = Math.sin(v.walk * 1.5 + i * 1.6) * 0.35 * amp;
        const l = p.get(`legL${i}`), r = p.get(`legR${i}`);
        if (l) l.rotation.y = (i - 1.5) * 0.35 + a;
        if (r) r.rotation.y = -(i - 1.5) * 0.35 - a;
      }
    }
    const armL = p.get('armL'), armR = p.get('armR');
    if (armL && armR) {
      if (mtype === 'hollowed') { const up = aggressive ? 2.09 : 1.4; armL.rotation.x = up + sw * 0.1; armR.rotation.x = up - sw * 0.1; }
      else if (mtype === 'rattlebone' && aggressive) { armR.rotation.x = 1.5; armL.rotation.x = 1.3; armL.rotation.y = 0.5; }
      else { armL.rotation.x = -sw * 0.9; armR.rotation.x = sw * 0.9; armL.rotation.y = 0; }
      if (v.swing > 0) armR.rotation.x = Math.sin(v.swing * Math.PI) * 1.6;
    }
    const head = p.get('head');
    if (head) head.rotation.x = v.kind === 'player' ? v.pitch * 0.8 : 0;
  }

  pick(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number, filter: (v: EntityView) => boolean): { view: EntityView; dist: number } | null {
    let best: { view: EntityView; dist: number } | null = null;
    for (const v of this.views.values()) {
      if (!filter(v) || v.dying) continue;
      const x0 = v.x - v.hw, x1 = v.x + v.hw, y0 = v.y, y1 = v.y + v.h, z0 = v.z - v.hw, z1 = v.z + v.hw;
      let tmin = 0, tmax = maxDist;
      const o = [ox, oy, oz], d = [dx, dy, dz], lo = [x0, y0, z0], hi = [x1, y1, z1];
      let ok = true;
      for (let a = 0; a < 3; a++) {
        if (Math.abs(d[a]) < 1e-9) { if (o[a] < lo[a] || o[a] > hi[a]) { ok = false; break; } continue; }
        let t1 = (lo[a] - o[a]) / d[a], t2 = (hi[a] - o[a]) / d[a];
        if (t1 > t2) [t1, t2] = [t2, t1];
        tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
        if (tmin > tmax) { ok = false; break; }
      }
      if (ok && (!best || tmin < best.dist)) best = { view: v, dist: tmin };
    }
    return best;
  }
}

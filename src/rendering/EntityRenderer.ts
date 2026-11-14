import * as THREE from 'three';
import { MOB_BY_CODE, MobType, MOBS } from '../core/sim/mobs';
import { PROFESSIONS } from '../core/trades';
import { I, getItem } from '../core/items';
import { BLOCKS, B } from '../core/blocks';
import type { Appearance } from '../core/sim/WorldSim';
import type { TextureAtlas } from '../resources/TextureAtlas';
import { FACE_SLOTS } from '../resources/TextureAtlas';
import type { WorldUniforms } from './ChunkMaterial';
import { VANILLA, buildVanilla, animateVanilla, cubesGeometry, PLAYER_ARM_CUBES, PLAYER_ARM_CUBES_SLIM, playerSpec, VanillaSpec, RigPart, type VCube } from './VanillaModels';

const armorGeoCache = new Map<string, THREE.BufferGeometry>();
function armorGeo(key: string, cubes: VCube[]): THREE.BufferGeometry {
  let g = armorGeoCache.get(key);
  if (!g) { g = cubesGeometry(cubes, 64, 32); armorGeoCache.set(key, g); }
  return g;
}

export const SKIN = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac, 0x5c3a21, 0xd4a373, 0xa0522d];
export const HAIR = [0x2b1d0e, 0x5a3825, 0xb5651d, 0xe6c35c, 0x111111, 0xa83232, 0xdddddd, 0x3a5fcd];
export const CLOTH = [0x3366cc, 0xcc3333, 0x33aa55, 0xe0b030, 0x7a3fb5, 0x222831, 0xe8e8e8, 0xd2691e, 0x1aa3a3, 0xff69b4, 0x556b2f, 0x8b4513];

interface PartSpec { n: string; s: [number, number, number]; p: [number, number, number]; o?: [number, number, number]; c: number; e?: boolean; parent?: string; r?: [number, number, number]; }

const ROBE = [0x5a8a3a, 0xe8e0d0, 0x3a3a3a, 0x6a6a74, 0xd8d0c0, 0x7a5a2a, 0x7a3a8a, 0x8a6a4a];
function villagerParts(prof: number): PartSpec[] {
  const robe = ROBE[prof] ?? 0x6a5040;
  return [
    { n: 'body', s: [0.5, 0.75, 0.38], p: [0, 1.1, 0], c: 0x6a5040 },
    { n: 'robe', s: [0.54, 1.1, 0.42], p: [0, 0.9, 0], c: robe },
    { n: 'head', s: [0.5, 0.62, 0.5], p: [0, 1.48, 0], o: [0, 0.31, 0], c: 0xc8a080 },
    { n: 'nose', s: [0.12, 0.25, 0.12], p: [0, 0, 0], o: [0, 0.18, -0.3], c: 0xb08868, parent: 'head' },
    { n: 'brow', s: [0.42, 0.06, 0.02], p: [0, 0, 0], o: [0, 0.4, -0.26], c: 0x3a2a1a, parent: 'head' },
    { n: 'eyeL', s: [0.08, 0.06, 0.02], p: [0, 0, 0], o: [-0.12, 0.34, -0.26], c: 0x2a6a2a, parent: 'head' },
    { n: 'eyeR', s: [0.08, 0.06, 0.02], p: [0, 0, 0], o: [0.12, 0.34, -0.26], c: 0x2a6a2a, parent: 'head' },
    { n: 'arms', s: [0.7, 0.24, 0.24], p: [0, 1.22, -0.2], r: [-0.75, 0, 0], c: robe },
    { n: 'legL', s: [0.2, 0.7, 0.2], p: [-0.12, 0.7, 0], o: [0, -0.35, 0], c: 0x4a3a2a },
    { n: 'legR', s: [0.2, 0.7, 0.2], p: [0.12, 0.7, 0], o: [0, -0.35, 0], c: 0x4a3a2a },
  ];
}

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
  kind: 'mob' | 'item' | 'arrow' | 'tnt' | 'cart' | 'player';
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
  swimT?: number;
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
const armGeoCache: { g?: THREE.BufferGeometry; s?: THREE.BufferGeometry } = {};

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
      const skin = (v as EntityView & { skin?: { png: string; slim: boolean } | null }).skin;
      const snap = { id: v.id, kind: v.kind, type: v.type, x: v.x, y: v.y, z: v.z, yaw: v.yaw, pitch: v.pitch, flags: v.flags, extra: v.extra, name: v.name };
      this.removeNow(v.id);
      this.upsert(snap.id, snap.kind, snap.type, snap.x, snap.y, snap.z, snap.yaw, snap.pitch, snap.flags, snap.extra, now, snap.name ? { name: snap.name, appearance: app, skin } : undefined);
    }
  }

  private skinTex = new Map<string, THREE.Texture>();

  customSkinTexture(png: string): THREE.Texture {
    let t = this.skinTex.get(png);
    if (t) return t;
    const img = new Image();
    t = new THREE.Texture(img);
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.flipY = false;
    const tex = t;
    img.onload = () => { tex.needsUpdate = true; };
    img.src = png;
    if (this.skinTex.size > 80) { const first = this.skinTex.keys().next().value!; this.skinTex.get(first)?.dispose(); this.skinTex.delete(first); }
    this.skinTex.set(png, t);
    return t;
  }

  private vanilla(key: MobType | 'player', skin = 0, texKey?: string, custom?: { png: string; slim: boolean }): Built | null {
    const spec = key === 'player' && custom ? playerSpec(custom.slim) : VANILLA[key];
    if (!spec) return null;
    const count = this.atlas.playerSkinCount;
    const mainKey = key === 'player' ? (count ? `player${skin % count}` : '') : spec.main;
    const tex = custom ? this.customSkinTexture(custom.png) : (texKey ? this.atlas.entityTextures.get(texKey) : undefined) ?? this.atlas.entityTextures.get(mainKey);
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
        uFogColor: this.u.uFogColor, uFogNear: this.u.uFogNear, uFogFar: this.u.uFogFar, uLight: { value: 1 }, uHurt: { value: 0 }, uWhite: { value: 0 },
        uMap: { value: map }, uUseMap: { value: map ? 1 : 0 }, uEmissive: { value: emissive ? 1 : 0 }, uOpacity: { value: 1 }, uGlint: { value: 0 }, uTime: this.u.uTime,
      },
      vertexShader: `attribute vec3 color; varying vec3 vColor; varying vec2 vUv; varying float vFog; varying float vShade;
        void main(){ vColor = color; vUv = uv; vec3 n = normalize(mat3(modelMatrix) * normal);
        vShade = 0.6 + 0.4 * max(n.y, 0.0) + 0.15 * abs(n.z) - 0.12 * max(-n.y, 0.0);
        vec4 mv = modelViewMatrix * vec4(position, 1.0); vFog = length(mv.xyz); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar; uniform float uLight; uniform float uHurt; uniform float uWhite;
        uniform sampler2D uMap; uniform float uUseMap; uniform float uEmissive; uniform float uOpacity; uniform float uGlint; uniform float uTime;
        varying vec3 vColor; varying vec2 vUv; varying float vFog; varying float vShade;
        void main(){ vec4 base = vec4(vColor, 1.0);
          if (uUseMap > 0.5) { vec4 t = texture2D(uMap, vUv); if (t.a < 0.5) discard; base.rgb *= t.rgb; }
          float l = mix(uLight * vShade, 1.6, uEmissive);
          vec3 c = mix(base.rgb * l, vec3(1.0, 0.12, 0.08), uHurt * 0.55);
          c = mix(c, vec3(1.0), uWhite);
          if (uGlint > 0.5) { float w = fract((vUv.x + vUv.y) * 6.0 - uTime * 0.6); c += vec3(0.42, 0.2, 0.75) * (0.25 + 0.55 * smoothstep(0.0, 0.25, w) * (1.0 - smoothstep(0.25, 0.6, w))); }
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

  armModel(skin: number, custom?: { png: string; slim: boolean } | null): { obj: THREE.Group; mats: THREE.ShaderMaterial[]; vanilla: boolean } {
    const obj = new THREE.Group();
    const count = this.atlas.playerSkinCount;
    const tex = custom ? this.customSkinTexture(custom.png) : count ? this.atlas.entityTextures.get(`player${skin % count}`) : undefined;
    if (tex) {
      const m = this.material(tex);
      armGeoCache.g ??= cubesGeometry(PLAYER_ARM_CUBES, 64, 64);
      armGeoCache.s ??= cubesGeometry(PLAYER_ARM_CUBES_SLIM, 64, 64);
      obj.add(new THREE.Mesh(custom?.slim ? armGeoCache.s : armGeoCache.g, m));
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

  private equip = new Map<string, number[]>();

  setEquipment(id: string, e: number[] | null): void {
    const prev = this.equip.get(id);
    if ((prev ? prev.join(',') : '') === (e ? e.join(',') : '')) return;
    if (e) this.equip.set(id, e); else this.equip.delete(id);
    const v = this.views.get(id);
    if (v && v.kind === 'player') this.applyEquip(v);
  }

  private holdState(v: EntityView): { holdR?: boolean; holdL?: boolean; xbow?: boolean; lance?: boolean } {
    if (v.kind !== 'player') return {};
    const e = this.equip.get(v.id);
    if (!e) return {};
    return { holdR: !!e[0], holdL: !!e[1], xbow: e[0] === I.CROSSBOW_LOADED || (!e[0] && e[1] === I.CROSSBOW_LOADED), lance: !!(v.flags & 32768) && e[0] >= I.SPEAR && e[0] < I.SPEAR + 6 };
  }

  private applyEquip(v: EntityView): void {
    const ex = v as EntityView & { eqObjs?: THREE.Object3D[]; eqMats?: THREE.ShaderMaterial[] };
    for (const o of ex.eqObjs ?? []) o.parent?.remove(o);
    if (ex.eqMats?.length) { const drop = new Set(ex.eqMats); v.mats = v.mats.filter((m) => !drop.has(m)); for (const m of ex.eqMats) m.dispose(); }
    ex.eqObjs = []; ex.eqMats = [];
    const e = this.equip.get(v.id);
    if (!e) return;
    const glint = e[6] ?? 0;
    const add = (parent: THREE.Object3D | undefined, obj: THREE.Object3D, mats: THREE.ShaderMaterial[], g: boolean) => {
      if (!parent) { for (const m of mats) m.dispose(); return; }
      parent.add(obj);
      ex.eqObjs!.push(obj);
      for (const m of mats) { if (g) m.uniforms.uGlint.value = 1; ex.eqMats!.push(m); v.mats.push(m); }
    };
    const vanilla = !!v.rig;
    const held = (id: number, slot: number, left: boolean) => {
      if (!id) return;
      const it = getItem(id);
      if (!it) return;
      const block = it.kind === 'block' && it.blockIcon;
      const m = block ? this.itemModel(id) : this.heldModel(id);
      const holder = new THREE.Group();
      if (vanilla) {
        const sg = left ? -1 : 1;
        const deg = Math.PI / 180;
        const k = it.key;
        const d = block ? { t: [0, 2.5, 0], r: [75, 45, 0], s: 0.375 }
          : k === 'mace' ? { t: [0, 4, 1], r: [0, -90, 55], s: 1 }
          : k.startsWith('crossbow') ? { t: [2, 0.1, -3], r: [-90, 0, left ? -30 : -60], s: 0.9, raw: true }
          : k.startsWith('bow') ? { t: [-1, -2, 2.5], r: [-80, left ? 280 : 260, -40], s: 0.9, raw: true }
          : k.endsWith('_spear') ? { t: [0, 2, 0.5], r: [0, -90, 55], s: 1.15 }
          : /sword|axe|pickaxe|shovel|hoe|stick|shears|firestriker/.test(k) ? { t: [0, 4, 0.5], r: [0, -90, 55], s: 0.85 }
          : { t: [0, 3, 1], r: [0, 0, 0], s: 0.55 };
        const raw = !!(d as { raw?: boolean }).raw;
        const g1 = new THREE.Group(); g1.rotation.x = -Math.PI / 2;
        const g2 = new THREE.Group(); g2.rotation.y = Math.PI;
        const g3 = new THREE.Group(); g3.position.set(sg, 2, -10);
        const g4 = new THREE.Group(); g4.position.set(d.t[0] * sg, d.t[1], d.t[2]);
        g4.rotation.order = 'XYZ'; g4.rotation.set(d.r[0] * deg, d.r[1] * deg * (block ? sg : 1), d.r[2] * deg);
        void raw;
        g4.scale.setScalar(d.s);
        m.obj.scale.setScalar(16 / (block ? 0.26 : 0.42));
        g4.add(m.obj); g3.add(g4); g2.add(g3); g1.add(g2); holder.add(g1);
        add(v.parts.get(left ? 'left_arm' : 'right_arm'), holder, m.mats, !!(glint & (1 << slot)));
      } else {
        holder.position.set(0, -0.6, -0.12);
        if (block) m.obj.scale.setScalar(0.9); else { m.obj.rotation.set(-0.6, left ? -Math.PI / 4 : Math.PI / 4, 0); m.obj.position.z = -0.12; }
        holder.add(m.obj);
        add(v.parts.get(left ? 'armL' : 'armR'), holder, m.mats, !!(glint & (1 << slot)));
      }
    };
    held(e[0], 0, false);
    held(e[1], 1, true);
    for (let s = 0; s < 4; s++) {
      const id = e[2 + s];
      if (id < 330 || id >= 346) continue;
      const mat = ['leather', 'iron', 'gold', 'aetherite'][Math.floor((id - 330) / 4)];
      const g = !!(glint & (1 << (2 + s)));
      const layer: 1 | 2 = s === 2 ? 2 : 1;
      if (vanilla) {
        const tex = this.atlas.armorTexture(mat, layer);
        const inf = layer === 2 ? 0.5 : 1;
        const pieces: [string, VCube[]][] = s === 0 ? [['head', [{ o: [-4, -8, -4], s: [8, 8, 8], uv: [0, 0], inf }, { o: [-4, -8, -4], s: [8, 8, 8], uv: [32, 0], inf: inf + 0.5 }]]]
          : s === 1 ? [['body', [{ o: [-4, 0, -2], s: [8, 12, 4], uv: [16, 16], inf }]], ['right_arm', [{ o: [-3, -2, -2], s: [4, 12, 4], uv: [40, 16], inf }]], ['left_arm', [{ o: [-1, -2, -2], s: [4, 12, 4], uv: [40, 16], inf, mirror: true }]]]
          : s === 2 ? [['body', [{ o: [-4, 0, -2], s: [8, 12, 4], uv: [16, 16], inf }]], ['right_leg', [{ o: [-2, 0, -2], s: [4, 12, 4], uv: [0, 16], inf }]], ['left_leg', [{ o: [-2, 0, -2], s: [4, 12, 4], uv: [0, 16], inf, mirror: true }]]]
          : [['right_leg', [{ o: [-2, 0, -2], s: [4, 12, 4], uv: [0, 16], inf }]], ['left_leg', [{ o: [-2, 0, -2], s: [4, 12, 4], uv: [0, 16], inf, mirror: true }]]];
        for (const [part, cubes] of pieces) {
          const m = this.material(tex);
          add(v.parts.get(part), new THREE.Mesh(armorGeo(`${s}|${part}`, cubes), m), [m], g);
        }
      } else {
        const col = [0x9a5e2e, 0xc6c6c6, 0xe8c228, 0x3fd8cc][Math.floor((id - 330) / 4)];
        const box = (part: string, size: [number, number, number], off: [number, number, number]) => {
          const m = this.material();
          const mesh = new THREE.Mesh(boxGeo(size, col), m);
          mesh.position.set(...off);
          add(v.parts.get(part), mesh, [m], g);
        };
        if (s === 0) box('head', [0.52, 0.5, 0.52], [0, 0.25, 0]);
        else if (s === 1) { box('body', [0.52, 0.72, 0.3], [0, 0, 0]); box('armL', [0.26, 0.4, 0.26], [0, -0.12, 0]); box('armR', [0.26, 0.4, 0.26], [0, -0.12, 0]); }
        else if (s === 2) { box('legL', [0.27, 0.5, 0.27], [0, -0.25, 0]); box('legR', [0.27, 0.5, 0.27], [0, -0.25, 0]); }
        else { box('legL', [0.28, 0.2, 0.3], [0, -0.6, -0.01]); box('legR', [0.28, 0.2, 0.3], [0, -0.6, -0.01]); }
      }
    }
  }

  private heldGeo = new Map<number, THREE.BufferGeometry>();
  private heldAtlas: TextureAtlas | null = null;

  heldModel(itemId: number): { obj: THREE.Group; mats: THREE.ShaderMaterial[] } {
    if (this.heldAtlas !== this.atlas) { for (const g of this.heldGeo.values()) g.dispose(); this.heldGeo.clear(); this.heldAtlas = this.atlas; }
    let g = this.heldGeo.get(itemId);
    if (!g) { g = this.extrude(itemId); this.heldGeo.set(itemId, g); }
    const m = this.material(this.atlas.iconTexture);
    m.side = THREE.DoubleSide;
    const obj = new THREE.Group();
    obj.add(new THREE.Mesh(g, m));
    return { obj, mats: [m] };
  }

  private extrude(itemId: number): THREE.BufferGeometry {
    const [u0, v0, u1, v1] = this.atlas.iconUV(itemId);
    const cv = this.atlas.iconCanvas;
    const N = 16, size = 0.42, px = size / N, th = px;
    const sx = Math.round(u0 * cv.width), sy = Math.round(v0 * cv.height), step = Math.round((u1 - u0) * cv.width) / N;
    let alpha: Uint8ClampedArray | null = null;
    try { alpha = cv.getContext('2d', { willReadFrequently: true })!.getImageData(sx, sy, N * step, N * step).data; } catch { alpha = null; }
    const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < N && y < N && !!alpha && alpha[((Math.floor(y * step + step / 2)) * N * step + Math.floor(x * step + step / 2)) * 4 + 3] > 127;
    const pos: number[] = [], uv: number[] = [], nrm: number[] = [], idx: number[] = [];
    const quad = (pts: number[][], uvs: number[][], n: number[]) => {
      const o = pos.length / 3;
      for (let i = 0; i < 4; i++) { pos.push(...pts[i]); uv.push(...uvs[i]); nrm.push(...n); }
      idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
    };
    const X = (x: number) => -size / 2 + x * px, Y = (y: number) => size / 2 - y * px;
    const U = (x: number) => u0 + ((u1 - u0) * x) / N, V = (y: number) => v0 + ((v1 - v0) * y) / N;
    quad([[X(0), Y(N), th / 2], [X(N), Y(N), th / 2], [X(N), Y(0), th / 2], [X(0), Y(0), th / 2]], [[U(0), V(N)], [U(N), V(N)], [U(N), V(0)], [U(0), V(0)]], [0, 0, 1]);
    quad([[X(N), Y(N), -th / 2], [X(0), Y(N), -th / 2], [X(0), Y(0), -th / 2], [X(N), Y(0), -th / 2]], [[U(N), V(N)], [U(0), V(N)], [U(0), V(0)], [U(N), V(0)]], [0, 0, -1]);
    if (alpha) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (!solid(x, y)) continue;
      const c = [U(x + 0.5), V(y + 0.5)], cu = [c, c, c, c];
      const z0 = -th / 2, z1 = th / 2;
      if (!solid(x - 1, y)) quad([[X(x), Y(y + 1), z0], [X(x), Y(y + 1), z1], [X(x), Y(y), z1], [X(x), Y(y), z0]], cu, [-1, 0, 0]);
      if (!solid(x + 1, y)) quad([[X(x + 1), Y(y + 1), z1], [X(x + 1), Y(y + 1), z0], [X(x + 1), Y(y), z0], [X(x + 1), Y(y), z1]], cu, [1, 0, 0]);
      if (!solid(x, y - 1)) quad([[X(x), Y(y), z1], [X(x + 1), Y(y), z1], [X(x + 1), Y(y), z0], [X(x), Y(y), z0]], cu, [0, 1, 0]);
      if (!solid(x, y + 1)) quad([[X(x), Y(y + 1), z0], [X(x + 1), Y(y + 1), z0], [X(x + 1), Y(y + 1), z1], [X(x), Y(y + 1), z1]], cu, [0, -1, 0]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(pos.length).fill(1), 3));
    g.setIndex(idx);
    return g;
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

  upsert(id: string, kind: EntityView['kind'], type: number, x: number, y: number, z: number, yaw: number, pitch: number, flags: number, extra: number, now: number, opts?: { name?: string; appearance?: Appearance; skin?: { png: string; slim: boolean } | null }): EntityView {
    let v = this.views.get(id);
    if (v && v.kind === 'player' && opts?.appearance && (JSON.stringify(opts.appearance) !== JSON.stringify((v as EntityView & { app?: Appearance }).app) || (opts.skin?.png ?? '') + (opts.skin?.slim ? 's' : '') !== (v as EntityView & { skinKey?: string }).skinKey)) {
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
        } else if (def.type === 'villager') {
          const prof = Math.max(0, ((flags >> 9) & 15) - 1);
          built = this.vanilla('villager', 0, `villager_${PROFESSIONS[prof] ?? 'farmer'}`) ?? this.build(villagerParts(prof));
        } else {
          const vb = this.vanilla(def.type);
          if (vb && def.type === 'rattlebone') {
            const ra = vb.parts.get('right_arm');
            if (ra) {
              const bm = this.itemModel(I.BOW);
              const holder = new THREE.Group();
              holder.position.set(-1, 10.5, 0);
              bm.obj.scale.set(-30, -30, 30);
              bm.obj.rotation.set(Math.PI / 2, Math.PI / 2, Math.PI / 4);
              holder.add(bm.obj);
              ra.add(holder);
              vb.mats.push(...bm.mats);
            }
          }
          built = vb ?? this.build(MOB_PARTS[def.type] ?? MOB_PARTS.woolhorn!);
        }
        hw = def.hw; h = def.h;
      } else if (kind === 'player') {
        const ap = opts?.appearance ?? { skin: 0, hair: 0, shirt: 0, pants: 0 };
        built = (opts?.skin ? this.vanilla('player', ap.skin, undefined, opts.skin) : null) ?? this.vanilla('player', ap.skin) ?? this.build(playerParts(ap));
      } else if (kind === 'item') {
        const m = this.itemModel(type);
        built = { obj: m.obj, parts: new Map(), mats: m.mats };
        hw = 0.15; h = 0.3;
      } else if (kind === 'cart') {
        const g = new THREE.Group();
        const mats: THREE.ShaderMaterial[] = [];
        const part = (sx: number, sy: number, sz: number, px: number, py: number, pz: number) => {
          const im = this.itemModel(B.IRON_BLOCK);
          im.obj.scale.set(sx / 0.26, sy / 0.26, sz / 0.26);
          im.obj.position.set(px, py, pz);
          for (const m of im.mats) { m.uniforms.uLight.value = 0.55; mats.push(m); }
          g.add(im.obj);
        };
        part(0.9, 0.1, 1.25, 0, 0.15, 0);
        part(0.08, 0.5, 1.25, -0.45, 0.45, 0);
        part(0.08, 0.5, 1.25, 0.45, 0.45, 0);
        part(0.9, 0.5, 0.08, 0, 0.45, -0.6);
        part(0.9, 0.5, 0.08, 0, 0.45, 0.6);
        if (type === 1) {
          const t = this.itemModel(B.TNT);
          t.obj.scale.setScalar(0.75 / 0.26);
          t.obj.position.y = 0.55;
          g.add(t.obj);
          mats.push(...t.mats);
        }
        built = { obj: g, parts: new Map(), mats };
        hw = 0.49; h = 0.7;
      } else if (kind === 'tnt') {
        const im = this.itemModel(B.TNT);
        im.obj.scale.setScalar(0.98 / 0.26);
        im.obj.position.y = 0.49;
        const g = new THREE.Group();
        g.add(im.obj);
        built = { obj: g, parts: new Map(), mats: im.mats };
        hw = 0.49; h = 0.98;
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
      if (kind === 'player' && opts?.name) { v.name = opts.name; v.tag = this.nameTag(opts.name); v.obj.add(v.tag); (v as EntityView & { app?: Appearance }).app = opts.appearance; (v as EntityView & { skinKey?: string }).skinKey = (opts.skin?.png ?? '') + (opts.skin?.slim ? 's' : ''); (v as EntityView & { skin?: { png: string; slim: boolean } | null }).skin = opts.skin ?? null; }
      if (kind === 'mob') {
        const def = MOB_BY_CODE[type];
        const tg = this.tags.get(id) ?? (def?.type === 'quartermaster' ? { name: 'Quartermaster', color: '#f3d27a' } : undefined);
        if (tg) { v.name = tg.name; v.tag = this.nameTag(tg.name, tg.color); v.obj.add(v.tag); }
      }
      v.obj.position.set(x, y, z);
      this.group.add(v.obj);
      this.views.set(id, v);
      if (kind === 'player') this.applyEquip(v);
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

  cull: ((x: number, y: number, z: number) => boolean) | null = null;

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
      if (this.cull && !v.dying && !this.cull(v.x, v.y + Math.min(1, v.h * 0.5), v.z)) { v.obj.visible = false; v.lastX = v.x; v.lastZ = v.z; continue; }
      v.obj.visible = true;
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
          animateVanilla(v.spec, v.rig, { ls: v.walk, amt: Math.min(1, speed / 5), age: v.age, pitch: v.kind === 'player' ? v.pitch : 0, aggressive, attack: v.swing > 0 ? 1 - v.swing : 0, crouch: v.kind === 'player' && (v.flags & 2) !== 0 && !v.swimT, type: mtype, swim: v.swimT ?? 0, crawl: (v.flags & 16384) !== 0 && (v.flags & 16) === 0, riding: v.kind === 'player' && !!(v.flags & 8192), ...this.holdState(v) });
        } else {
          this.animateSimple(v, amp, aggressive, mtype);
        }
        if (v.kind === 'player') {
          const swimming = (v.flags & 16384) !== 0 || ((v.flags & 16) !== 0 && (v.flags & 4) !== 0);
          v.swimT = Math.max(0, Math.min(1, (v.swimT ?? 0) + (swimming ? dt : -dt) * 5));
          v.obj.rotation.order = 'YXZ';
          v.obj.rotation.x = -(v.swimT ?? 0) * Math.PI / 2;
          if (v.swimT) { v.obj.position.y += v.swimT * 0.35; v.obj.position.x += Math.sin(v.yaw) * 0.9 * v.swimT; v.obj.position.z += Math.cos(v.yaw) * 0.9 * v.swimT; }
          const crouch = (v.flags & 2) !== 0 && !v.swimT;
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
      for (const m of v.mats) { m.uniforms.uLight.value = Math.max(0.2, v.light); if (!v.dying) m.uniforms.uHurt.value = hurt; }
      if (v.kind === 'tnt' || v.kind === 'cart') for (const m of v.mats) if (m.uniforms.uWhite) m.uniforms.uWhite.value = v.flags & 1 ? 0.7 : 0;
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

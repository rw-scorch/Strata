import { dragonParts, rayPart } from '../core/sim/dragon';
import * as THREE from 'three';
import { MOB_BY_CODE, MobType, MOBS } from '../core/sim/mobs';
import { PROFESSIONS } from '../core/trades';
import { I, getItem, toolId, armorId } from '../core/items';
import { BLOCKS, B, SB, customBoxes, CUSTOM_BOX, makeBlock } from '../core/blocks';
import type { Appearance } from '../core/sim/WorldSim';
import type { TextureAtlas } from '../resources/TextureAtlas';
import { FACE_SLOTS } from '../resources/TextureAtlas';
import type { WorldUniforms } from './ChunkMaterial';
import { VANILLA, buildVanilla, animateVanilla, cubesGeometry, PLAYER_ARM_CUBES, PLAYER_ARM_CUBES_SLIM, playerSpec, VanillaSpec, RigPart, MAGMA_OLD, type VCube } from './VanillaModels';

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

const ROBE = [0x5a8a3a, 0xe8e0d0, 0x3a3a3a, 0x6a6a74, 0xd8d0c0, 0x7a5a2a, 0x7a3a8a, 0x8a6a4a, 0x3a6a8a, 0xc8b070, 0x8a4a2a, 0xf0f0f0, 0x2a2a2a];
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
  cinderhusk: [
    { n: 'body', s: [0.5, 0.7, 0.28], p: [0, 1.04, 0], c: 0x6a5a4a },
    { n: 'head', s: [0.58, 0.48, 0.48], p: [0, 1.4, 0], o: [0, 0.24, 0], c: 0xd89a8a },
    { n: 'snout', s: [0.24, 0.22, 0.06], p: [0, 0, 0], o: [0, 0.12, -0.27], c: 0xe8a8a0, parent: 'head' },
    { n: 'eyeL', s: [0.08, 0.08, 0.02], p: [0, 0, 0], o: [-0.14, 0.3, -0.25], c: 0xe0d060, e: true, parent: 'head' },
    { n: 'eyeR', s: [0.08, 0.08, 0.02], p: [0, 0, 0], o: [0.14, 0.3, -0.25], c: 0xe0d060, e: true, parent: 'head' },
    { n: 'armL', s: [0.22, 0.7, 0.22], p: [-0.37, 1.36, 0], o: [0, -0.3, 0], c: 0x7aa070 },
    { n: 'armR', s: [0.22, 0.7, 0.22], p: [0.37, 1.36, 0], o: [0, -0.3, 0], c: 0xd89a8a },
    { n: 'legL', s: [0.23, 0.7, 0.23], p: [-0.12, 0.7, 0], o: [0, -0.35, 0], c: 0x5a4a3a },
    { n: 'legR', s: [0.23, 0.7, 0.23], p: [0.12, 0.7, 0], o: [0, -0.35, 0], c: 0x5a4a3a },
  ],
  flarewisp: [
    { n: 'head', s: [0.5, 0.5, 0.5], p: [0, 1.5, 0], c: 0xf0c030, e: true },
    { n: 'eyeL', s: [0.1, 0.06, 0.02], p: [-0.12, 1.52, -0.26], c: 0x3a1a00 },
    { n: 'eyeR', s: [0.1, 0.06, 0.02], p: [0.12, 1.52, -0.26], c: 0x3a1a00 },
    ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ n: `r${i}`, s: [0.12, 0.5, 0.12] as [number, number, number], p: [Math.cos(i * Math.PI / 4) * (i % 2 ? 0.45 : 0.32), i % 2 ? 1.05 : 0.55, Math.sin(i * Math.PI / 4) * (i % 2 ? 0.45 : 0.32)] as [number, number, number], c: 0xe8a020, e: true })),
  ],
  piglin: [
    { n: 'body', s: [0.5, 0.75, 0.25], p: [0, 1.12, 0], c: 0x7a4a2a },
    { n: 'head', s: [0.62, 0.5, 0.5], p: [0, 1.5, 0], o: [0, 0.25, 0], c: 0xe8a090 },
    { n: 'snout', s: [0.25, 0.25, 0.06], p: [0, 0, 0], o: [0, 0.18, -0.28], c: 0xf0b0a0, parent: 'head' },
    { n: 'armL', s: [0.25, 0.75, 0.25], p: [-0.37, 1.45, 0], o: [0, -0.3, 0], c: 0xe8a090 },
    { n: 'armR', s: [0.25, 0.75, 0.25], p: [0.37, 1.45, 0], o: [0, -0.3, 0], c: 0xe8a090 },
    { n: 'legL', s: [0.25, 0.75, 0.25], p: [-0.125, 0.75, 0], o: [0, -0.375, 0], c: 0x5a3a20 },
    { n: 'legR', s: [0.25, 0.75, 0.25], p: [0.125, 0.75, 0], o: [0, -0.375, 0], c: 0x5a3a20 },
  ],
  piglin_brute: [
    { n: 'body', s: [0.5, 0.75, 0.25], p: [0, 1.12, 0], c: 0x3a2a20 },
    { n: 'head', s: [0.62, 0.5, 0.5], p: [0, 1.5, 0], o: [0, 0.25, 0], c: 0xd08878 },
    { n: 'snout', s: [0.25, 0.25, 0.06], p: [0, 0, 0], o: [0, 0.18, -0.28], c: 0xe0a090, parent: 'head' },
    { n: 'armL', s: [0.25, 0.75, 0.25], p: [-0.37, 1.45, 0], o: [0, -0.3, 0], c: 0xd08878 },
    { n: 'armR', s: [0.25, 0.75, 0.25], p: [0.37, 1.45, 0], o: [0, -0.3, 0], c: 0xd08878 },
    { n: 'legL', s: [0.25, 0.75, 0.25], p: [-0.125, 0.75, 0], o: [0, -0.375, 0], c: 0x2a2018 },
    { n: 'legR', s: [0.25, 0.75, 0.25], p: [0.125, 0.75, 0], o: [0, -0.375, 0], c: 0x2a2018 },
  ],
  hoglin: [
    { n: 'body', s: [1.0, 0.9, 1.6], p: [0, 0.95, 0], c: 0xb87a60 },
    { n: 'mane', s: [0.04, 0.6, 1.1], p: [0, 1.65, -0.1], c: 0xe8d0a0 },
    { n: 'head', s: [0.85, 0.4, 1.0], p: [0, 1.0, -0.95], c: 0xc88a6a },
    { n: 'tuskL', s: [0.12, 0.6, 0.12], p: [-0.45, 1.2, -1.3], c: 0xf0e8d8 },
    { n: 'tuskR', s: [0.12, 0.6, 0.12], p: [0.45, 1.2, -1.3], c: 0xf0e8d8 },
    { n: 'legFL', s: [0.36, 0.85, 0.36], p: [-0.25, 0.85, -0.53], o: [0, -0.42, 0], c: 0x9a6248 },
    { n: 'legFR', s: [0.36, 0.85, 0.36], p: [0.25, 0.85, -0.53], o: [0, -0.42, 0], c: 0x9a6248 },
    { n: 'legBL', s: [0.3, 0.7, 0.3], p: [-0.3, 0.7, 0.62], o: [0, -0.35, 0], c: 0x9a6248 },
    { n: 'legBR', s: [0.3, 0.7, 0.3], p: [0.3, 0.7, 0.62], o: [0, -0.35, 0], c: 0x9a6248 },
  ],
  zoglin: [
    { n: 'body', s: [1.0, 0.9, 1.6], p: [0, 0.95, 0], c: 0xc07888 },
    { n: 'mane', s: [0.04, 0.6, 1.1], p: [0, 1.65, -0.1], c: 0xd8e0c0 },
    { n: 'head', s: [0.85, 0.4, 1.0], p: [0, 1.0, -0.95], c: 0xd08a96 },
    { n: 'tuskL', s: [0.12, 0.6, 0.12], p: [-0.45, 1.2, -1.3], c: 0xe8e8d8 },
    { n: 'tuskR', s: [0.12, 0.6, 0.12], p: [0.45, 1.2, -1.3], c: 0xe8e8d8 },
    { n: 'legFL', s: [0.36, 0.85, 0.36], p: [-0.25, 0.85, -0.53], o: [0, -0.42, 0], c: 0x9a5a68 },
    { n: 'legFR', s: [0.36, 0.85, 0.36], p: [0.25, 0.85, -0.53], o: [0, -0.42, 0], c: 0x9a5a68 },
    { n: 'legBL', s: [0.3, 0.7, 0.3], p: [-0.3, 0.7, 0.62], o: [0, -0.35, 0], c: 0x9a5a68 },
    { n: 'legBR', s: [0.3, 0.7, 0.3], p: [0.3, 0.7, 0.62], o: [0, -0.35, 0], c: 0x9a5a68 },
  ],
  witherbone: [
    { n: 'body', s: [0.55, 0.85, 0.24], p: [0, 1.3, 0], c: 0x2a2a2a },
    { n: 'head', s: [0.58, 0.58, 0.58], p: [0, 1.73, 0], o: [0, 0.29, 0], c: 0x343434 },
    { n: 'eyeL', s: [0.14, 0.12, 0.02], p: [0, 0, 0], o: [-0.13, 0.32, -0.3], c: 0x0a0a0a, parent: 'head' },
    { n: 'eyeR', s: [0.14, 0.12, 0.02], p: [0, 0, 0], o: [0.13, 0.32, -0.3], c: 0x0a0a0a, parent: 'head' },
    { n: 'armL', s: [0.14, 0.85, 0.14], p: [-0.38, 1.66, 0], o: [0, -0.36, 0], c: 0x2e2e2e },
    { n: 'armR', s: [0.14, 0.85, 0.14], p: [0.38, 1.66, 0], o: [0, -0.36, 0], c: 0x2e2e2e },
    { n: 'legL', s: [0.14, 0.85, 0.14], p: [-0.14, 0.85, 0], o: [0, -0.42, 0], c: 0x262626 },
    { n: 'legR', s: [0.14, 0.85, 0.14], p: [0.14, 0.85, 0], o: [0, -0.42, 0], c: 0x262626 },
  ],
  wailer: [
    { n: 'body', s: [4, 4, 4], p: [0, 2, 0], c: 0xeeeeee },
    { n: 'eyeL', s: [0.5, 0.25, 0.05], p: [0, 0, 0], o: [-0.9, 0.4, -2.02], c: 0x222222, parent: 'body' },
    { n: 'eyeR', s: [0.5, 0.25, 0.05], p: [0, 0, 0], o: [0.9, 0.4, -2.02], c: 0x222222, parent: 'body' },
    { n: 'mouth', s: [0.5, 0.25, 0.05], p: [0, 0, 0], o: [0, -0.6, -2.02], c: 0x444444, parent: 'body' },
    ...[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => ({ n: `t${i}`, s: [0.5, 2.5, 0.5] as [number, number, number], p: [((i % 3) - 1) * 1.25, 0.1, (Math.floor(i / 3) - 1) * 1.25] as [number, number, number], o: [0, -1.25, 0] as [number, number, number], c: 0xdddddd })),
  ],
  emberslime: [
    { n: 'body', s: [0.52, 0.52, 0.52], p: [0, 0.26, 0], c: 0x4a1a0a },
    { n: 'core', s: [0.26, 0.26, 0.26], p: [0, 0.26, 0], c: 0xf0a020, e: true },
    { n: 'eyeL', s: [0.1, 0.06, 0.02], p: [-0.12, 0.34, -0.27], c: 0xf8d040, e: true },
    { n: 'eyeR', s: [0.1, 0.06, 0.02], p: [0.12, 0.34, -0.27], c: 0xf8d040, e: true },
  ],
  lavastrider: [
    { n: 'body', s: [1, 0.88, 1], p: [0, 1.25, 0], c: 0x9a2a2a },
    { n: 'eyeL', s: [0.14, 0.08, 0.02], p: [-0.2, 1.45, -0.51], c: 0x111111 },
    { n: 'eyeR', s: [0.14, 0.08, 0.02], p: [0.2, 1.45, -0.51], c: 0x111111 },
    { n: 'leg0', s: [0.25, 1, 0.25], p: [-0.25, 1, 0], o: [0, -0.5, 0], c: 0x5a1a2a },
    { n: 'leg1', s: [0.25, 1, 0.25], p: [0.25, 1, 0], o: [0, -0.5, 0], c: 0x5a1a2a },
  ],
  voidwyrm: [
    { n: 'body', s: [3, 2.2, 6], p: [0, 2.2, 0], c: 0x16141a },
    { n: 'belly', s: [2.4, 0.4, 5], p: [0, 1.05, 0], c: 0x2a2630 },
    ...[0, 1, 2, 3].map((i) => ({ n: `spine${i}`, s: [0.3, 0.6, 0.6] as [number, number, number], p: [0, 3.55, -2 + i * 1.4] as [number, number, number], c: 0x3a3442 })),
    ...[0, 1, 2].map((i) => ({ n: `neck${i}`, s: [1.1, 1, 1.3] as [number, number, number], p: [0, 2.5 + i * 0.15, -3.6 - i * 1.25] as [number, number, number], c: 0x1c1a22 })),
    { n: 'head', s: [1.7, 1.3, 2.4], p: [0, 3.0, -8.2], c: 0x121016 },
    { n: 'snout', s: [1.2, 0.6, 1.4], p: [0, 2.75, -9.9], c: 0x18161c },
    { n: 'jaw', s: [1.2, 0.35, 1.8], p: [0, 2.2, -9.2], c: 0x1e1a24 },
    { n: 'eyeL', s: [0.35, 0.18, 0.06], p: [-0.55, 3.25, -9.42], c: 0xd27bff, e: true },
    { n: 'eyeR', s: [0.35, 0.18, 0.06], p: [0.55, 3.25, -9.42], c: 0xd27bff, e: true },
    { n: 'hornL', s: [0.2, 0.5, 0.6], p: [-0.55, 3.85, -7.6], c: 0xd8d0c8 },
    { n: 'hornR', s: [0.2, 0.5, 0.6], p: [0.55, 3.85, -7.6], c: 0xd8d0c8 },
    { n: 'wingL', s: [0.1, 0.1, 0.1], p: [-1.5, 3.0, -1.2], c: 0x16141a },
    { n: 'wingBoneL', s: [7, 0.35, 0.35], p: [0, 0, 0], o: [-3.5, 0, 0], c: 0x26222c, parent: 'wingL' },
    { n: 'wingSkinL', s: [7, 0.08, 4.2], p: [0, 0, 0], o: [-3.5, 0, 2.1], c: 0x3c2e48, parent: 'wingL' },
    { n: 'wingR', s: [0.1, 0.1, 0.1], p: [1.5, 3.0, -1.2], c: 0x16141a },
    { n: 'wingBoneR', s: [7, 0.35, 0.35], p: [0, 0, 0], o: [3.5, 0, 0], c: 0x26222c, parent: 'wingR' },
    { n: 'wingSkinR', s: [7, 0.08, 4.2], p: [0, 0, 0], o: [3.5, 0, 2.1], c: 0x3c2e48, parent: 'wingR' },
    ...[0, 1, 2, 3, 4, 5].map((i) => ({ n: `tail${i}`, s: [1 - i * 0.12, 0.9 - i * 0.1, 1.4] as [number, number, number], p: [0, 2.3 - i * 0.12, 3.7 + i * 1.35] as [number, number, number], c: 0x1c1a22 })),
    ...[0, 1].flatMap((side) => [0, 1].map((f) => ({ n: `leg${side}${f}`, s: [0.6, 1.4, 0.6] as [number, number, number], p: [side ? 1.2 : -1.2, 1.4, f ? 1.8 : -1.8] as [number, number, number], o: [0, -0.7, 0] as [number, number, number], c: 0x1a1820 }))),
  ],
  riftcore: [
    { n: 'base', s: [1.2, 0.25, 1.2], p: [0, 0.12, 0], c: 0x2c2a30 },
    { n: 'frame', s: [0.05, 0.05, 0.05], p: [0, 1.3, 0], c: 0xd8e8f0 },
    ...[[0, 1, 1], [0, 1, -1], [0, -1, 1], [0, -1, -1], [1, 0, 1], [1, 0, -1], [-1, 0, 1], [-1, 0, -1], [1, 1, 0], [1, -1, 0], [-1, 1, 0], [-1, -1, 0]].map(([a, b, c], i) => ({ n: `bar${i}`, s: (a === 0 ? [0.95, 0.07, 0.07] : b === 0 ? [0.07, 0.95, 0.07] : [0.07, 0.07, 0.95]) as [number, number, number], p: [0, 0, 0] as [number, number, number], o: [a * 0.45, b * 0.45, c * 0.45] as [number, number, number], c: 0xd8ecf8, e: true, parent: 'frame' })),
    { n: 'core', s: [0.5, 0.5, 0.5], p: [0, 1.3, 0], c: 0xf06ab0, e: true },
  ],
  shellward: [
    { n: 'base', s: [1, 0.5, 1], p: [0, -0.25, 0], c: 0x7e4e8a },
    { n: 'head', s: [0.55, 0.55, 0.55], p: [0, -0.05, 0], c: 0xe8d8a0 },
    { n: 'eyeL', s: [0.1, 0.08, 0.02], p: [-0.12, 0.05, -0.28], c: 0x3a2a20 },
    { n: 'eyeR', s: [0.1, 0.08, 0.02], p: [0.12, 0.05, -0.28], c: 0x3a2a20 },
    { n: 'lid', s: [1.02, 0.55, 1.02], p: [0, 0, 0], o: [0, 0.27, 0], c: 0x9a6aa8 },
  ],
  voidstalker: [
    { n: 'body', s: [0.5, 0.75, 0.25], p: [0, 2.1, 0], c: 0x111116 },
    { n: 'head', s: [0.5, 0.5, 0.5], p: [0, 2.45, 0], o: [0, 0.25, 0], c: 0x16161c },
    { n: 'eyeL', s: [0.16, 0.05, 0.02], p: [0, 0, 0], o: [-0.12, 0.22, -0.26], c: 0xd27bff, e: true, parent: 'head' },
    { n: 'eyeR', s: [0.16, 0.05, 0.02], p: [0, 0, 0], o: [0.12, 0.22, -0.26], c: 0xd27bff, e: true, parent: 'head' },
    { n: 'armL', s: [0.12, 1.85, 0.12], p: [-0.32, 2.4, 0], o: [0, -0.9, 0], c: 0x111116 },
    { n: 'armR', s: [0.12, 1.85, 0.12], p: [0.32, 2.4, 0], o: [0, -0.9, 0], c: 0x111116 },
    { n: 'legL', s: [0.12, 1.75, 0.12], p: [-0.12, 1.75, 0], o: [0, -0.875, 0], c: 0x111116 },
    { n: 'legR', s: [0.12, 1.75, 0.12], p: [0.12, 1.75, 0], o: [0, -0.875, 0], c: 0x111116 },
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
  squish?: number;
  wings?: [THREE.Object3D, THREE.Object3D] | null;
  peekS?: number;
  cage?: boolean;
  id: string;
  kind: 'mob' | 'item' | 'arrow' | 'tnt' | 'cart' | 'fireball' | 'frame' | 'boat' | 'player';
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
    if (this.tntMesh) { this.group.remove(this.tntMesh); this.tntMesh.dispose(); this.tntMesh = null; this.tntCap = 0; }
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
    let spec = key === 'player' && custom ? playerSpec(custom.slim) : VANILLA[key];
    if (!spec) return null;
    if (key === 'emberslime' && (this.atlas.entityCanvases.get('magmacube')?.height ?? 64) === 32) spec = MAGMA_OLD;
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
      const glow = spec.overlay === 'spider_eyes' || spec.overlay === 'enderman_eyes';
      const m = this.material(ovTex, glow);
      mats.push(m);
      if (glow) emissive = m; else overlay = m;
    }
    const b = buildVanilla(spec, main, overlay, emissive);
    if (key === 'shellward') b.obj.children[0].position.y -= 0.5;
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
      const d = this.atlas.data;
      const custom = b.render === 'trapdoor' ? [[0, 0, 0, 1, 3 / 16, 1]] : CUSTOM_BOX[itemId] ? customBoxes(makeBlock(itemId, 0)) : [];
      const boxes = custom.length ? custom : [[0, 0, 0, 1, 1, 1]];
      const m = this.material(this.atlas.texture);
      m.side = THREE.FrontSide;
      for (const [x0, y0, z0, x1, y1, z1] of boxes) {
        const g = new THREE.BoxGeometry((x1 - x0) * 0.26, (y1 - y0) * 0.26, (z1 - z0) * 0.26);
        g.translate(((x0 + x1) / 2 - 0.5) * 0.26, ((y0 + y1) / 2 - 0.5) * 0.26, ((z0 + z1) / 2 - 0.5) * 0.26);
        const uv = g.getAttribute('uv') as THREE.BufferAttribute;
        const col = new Float32Array(g.getAttribute('position').count * 3).fill(1);
        for (let f = 0; f < 6; f++) {
          let tile = d.blockTiles[itemId * FACE_SLOTS + f];
          if (b.front && f === 4) tile = d.blockTiles[itemId * FACE_SLOTS + 6];
          const tx = tile % d.cols, ty = Math.floor(tile / d.cols);
          const [ua, ub] = f < 2 ? [z0, z1] : [x0, x1];
          const [va, vb] = f === 2 || f === 3 ? [z0, z1] : [y0, y1];
          for (let k = 0; k < 4; k++) {
            const i = f * 4 + k;
            const u0 = ua + (ub - ua) * uv.getX(i), v0 = va + (vb - va) * uv.getY(i);
            uv.setXY(i, (tx + u0) / d.cols, (ty + 1 - v0) / d.rows);
            const tintCode = d.tintTable[itemId * 2];
            const tintTop = d.tintTable[itemId * 2 + 1] === 1;
            if (tintCode && (!tintTop || f === 2)) { col[i * 3] = 0.57; col[i * 3 + 1] = 0.74; col[i * 3 + 2] = 0.35; }
          }
        }
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        obj.add(new THREE.Mesh(g, m));
      }
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

  private frameModel(glow: boolean, item: number, face: number, rot: number): { obj: THREE.Group; mats: THREE.ShaderMaterial[] } {
    const d = this.atlas.data, sp = d.special;
    const m = this.material(this.atlas.texture);
    const wood = d.blockTiles[B.BIRCH_PLANKS * FACE_SLOTS], back = sp[glow ? 'glow_item_frame' : 'item_frame'] ?? wood;
    const inner = new THREE.Group();
    const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, tile: number) => {
      const g = new THREE.BoxGeometry((x1 - x0) / 16, (y1 - y0) / 16, (z1 - z0) / 16);
      g.translate((x0 + x1) / 32 - 0.5, (y0 + y1) / 32 - 0.5, (z0 + z1) / 32);
      const uv = g.getAttribute('uv') as THREE.BufferAttribute;
      const tx = tile % d.cols, ty = Math.floor(tile / d.cols);
      for (let f = 0; f < 6; f++) {
        const [ua, ub] = f < 2 ? [z0, z1] : [x0, x1];
        const [va, vb] = f === 2 || f === 3 ? [z0, z1] : [y0, y1];
        for (let k = 0; k < 4; k++) {
          const i = f * 4 + k;
          uv.setXY(i, (tx + (ua + (ub - ua) * uv.getX(i)) / 16) / d.cols, (ty + 1 - (va + (vb - va) * uv.getY(i)) / 16) / d.rows);
        }
      }
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 3).fill(1), 3));
      inner.add(new THREE.Mesh(g, m));
    };
    box(3, 3, 0, 13, 13, 0.5, back);
    box(2, 2, 0, 14, 3, 1, wood); box(2, 13, 0, 14, 14, 1, wood);
    box(2, 3, 0, 3, 13, 1, wood); box(13, 3, 0, 14, 13, 1, wood);
    const mats = [m];
    if (item) {
      const it = this.itemModel(item);
      const block = getItem(item)?.kind === 'block' && getItem(item)?.blockIcon;
      const holder = new THREE.Group();
      holder.rotation.z = -rot * Math.PI / 4;
      if (block) { it.obj.scale.setScalar(0.5 / 0.26); it.obj.position.z = 1 / 16 + 0.25; it.obj.rotation.y = Math.PI / 4; }
      else { it.obj.scale.setScalar(0.5 / 0.42); it.obj.position.z = 1 / 16 + 0.005; }
      holder.add(it.obj);
      inner.add(holder);
      mats.push(...it.mats);
    }
    const orient = new THREE.Group();
    if (face === 0) orient.rotation.y = Math.PI / 2;
    else if (face === 1) orient.rotation.y = -Math.PI / 2;
    else if (face === 2) orient.rotation.x = -Math.PI / 2;
    else if (face === 3) orient.rotation.x = Math.PI / 2;
    else if (face === 5) orient.rotation.y = Math.PI;
    orient.add(inner);
    const obj = new THREE.Group();
    orient.position.y = 0.375;
    obj.add(orient);
    return { obj, mats };
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
    v.wings = null;
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
    if (e[3] === I.ELYTRA) {
      const g = !!(glint & (1 << 3));
      const tex = vanilla ? this.atlas.entityTextures.get('elytra') ?? this.atlas.elytraFallback() : null;
      const root = vanilla ? v.parts.get('body')?.parent ?? undefined : v.parts.get('body');
      const wing = (left: boolean) => {
        const pivot = new THREE.Group();
        pivot.rotation.order = 'ZYX';
        const m = this.material(tex);
        if (vanilla) {
          pivot.position.set(left ? 5 : -5, 0, 2);
          pivot.add(new THREE.Mesh(armorGeo(left ? 'elytra|l' : 'elytra|r', [left ? { o: [-10, 0, 0], s: [10, 20, 2], uv: [22, 0], inf: 1 } : { o: [0, 0, 0], s: [10, 20, 2], uv: [22, 0], inf: 1, mirror: true }]), m));
        } else {
          pivot.position.set(left ? 0.14 : -0.14, 0.36, 0.17);
          const mesh = new THREE.Mesh(boxGeo([0.62, 1.25, 0.12], 0x8a8a9a), m);
          mesh.position.set(left ? 0.31 : -0.31, -0.62, 0);
          pivot.add(mesh);
        }
        add(root, pivot, [m], g);
        return pivot;
      };
      const l = wing(true), r = wing(false);
      if (root) v.wings = [l, r];
    }
    for (let s = 0; s < 4; s++) {
      const id = e[2 + s];
      if (id < 330 || id >= 350) continue;
      const mat = ['leather', 'iron', 'gold', 'aetherite', 'cinderite'][Math.floor((id - 330) / 4)];
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
        const col = [0x9a5e2e, 0xc6c6c6, 0xe8c228, 0x3fd8cc, 0x4a4248][Math.floor((id - 330) / 4)];
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
  private mobNames = new Map<string, string>();

  setMobName(id: string, name: string): void {
    this.mobNames.set(id, name);
    if (this.mobNames.size > 2000) this.mobNames.delete(this.mobNames.keys().next().value!);
    const v = this.views.get(id);
    if (!v || v.kind !== 'mob') return;
    if (v.tag) v.obj.remove(v.tag);
    v.name = name; v.tag = this.nameTag(name); v.tag.position.y = Math.max(1.2, v.h + 0.35); v.obj.add(v.tag);
  }

  setTags(map: Map<string, { name: string; color: string }>): void {
    this.tags = map;
    for (const [id, tg] of map) {
      const v = this.views.get(id);
      if (!v || v.kind !== 'mob' || v.name === tg.name) continue;
      if (v.tag) v.obj.remove(v.tag);
      v.name = tg.name; v.tag = this.nameTag(tg.name, tg.color); v.obj.add(v.tag);
    }
  }

  private nameTag(name: string, color = '#fff', badge = false): THREE.Sprite {
    const c = document.createElement('canvas');
    const g = c.getContext('2d')!;
    g.font = 'bold 28px system-ui, sans-serif';
    const bw = badge ? 30 : 0;
    const w = Math.ceil(g.measureText(name).width) + 20 + bw;
    c.width = w; c.height = 40;
    g.font = 'bold 28px system-ui, sans-serif';
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.fillRect(0, 0, w, 40);
    if (badge) {
      g.fillStyle = '#ffcc33';
      g.beginPath();
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 5 : 12; g.lineTo(22 + Math.cos(a) * r, 20 + Math.sin(a) * r); }
      g.closePath(); g.fill();
    }
    g.fillStyle = color;
    g.textBaseline = 'middle';
    g.fillText(name, 10 + bw, 21);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.NoColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: true, transparent: true }));
    s.scale.set(w / 80, 0.5, 1);
    s.position.y = 2.15;
    return s;
  }

  upsert(id: string, kind: EntityView['kind'], type: number, x: number, y: number, z: number, yaw: number, pitch: number, flags: number, extra: number, now: number, opts?: { name?: string; appearance?: Appearance; skin?: { png: string; slim: boolean } | null; sup?: string }): EntityView {
    let v = this.views.get(id);
    if (v && v.kind === 'player' && opts?.appearance && (JSON.stringify(opts.appearance) !== JSON.stringify((v as EntityView & { app?: Appearance }).app) || (opts.skin?.png ?? '') + (opts.skin?.slim ? 's' : '') !== (v as EntityView & { skinKey?: string }).skinKey)) {
      this.removeNow(id);
      v = undefined;
    }
    if (v && kind === 'frame' && (v.extra !== extra || v.flags !== flags)) {
      this.removeNow(id);
      v = undefined;
    }
    if (v && kind === 'mob' && (v as EntityView & { pb?: number }).pb !== undefined && (v as EntityView & { pb?: number }).pb !== ((flags >> 9) & (MOB_BY_CODE[type]?.type === 'rival' ? 31 : 15))) {
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
          const pb = (flags >> 9) & 15, prof = Math.max(0, pb - 1);
          built = this.vanilla('villager', 0, pb ? `villager_${PROFESSIONS[prof] ?? 'farmer'}` : 'villager_none') ?? this.build(villagerParts(pb ? prof : -1));
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
          const wpn = def.type === 'witherbone' ? toolId(1, 3) : def.type === 'piglin' ? (flags & 32 ? I.CROSSBOW : toolId(3, 3)) : def.type === 'piglin_brute' ? toolId(3, 1) : def.type === 'cinderhusk' ? toolId(3, 3) : 0;
          if (vb && wpn) {
            const ra = vb.parts.get('right_arm');
            if (ra) {
              const m = this.heldModel(wpn), deg = Math.PI / 180;
              const g1 = new THREE.Group(); g1.rotation.x = -Math.PI / 2;
              const g2 = new THREE.Group(); g2.rotation.y = Math.PI;
              const g3 = new THREE.Group(); g3.position.set(1, 2, -10);
              const g4 = new THREE.Group(); g4.position.set(0, 4, 0.5); g4.rotation.set(0, -90 * deg, 55 * deg); g4.scale.setScalar(0.85);
              m.obj.scale.setScalar(16 / 0.42);
              g4.add(m.obj); g3.add(g4); g2.add(g3); g1.add(g2); ra.add(g1);
              vb.mats.push(...m.mats);
            }
          }
          if (vb && def.type === 'flarewisp') for (const m of vb.mats) m.uniforms.uEmissive.value = 0.85;
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
        const cartTex = this.atlas.entityTextures.get('minecart');
        if (cartTex) {
          const mat = this.material(cartTex);
          mat.side = THREE.DoubleSide;
          mats.push(mat);
          const body = new THREE.Group();
          body.scale.set(1 / 16, -1 / 16, 1 / 16);
          body.position.y = 0.375;
          body.rotation.y = Math.PI / 2;
          const panel = (uv: [number, number], o: [number, number, number], sz: [number, number, number], px: number, pz: number, rx: number, ry: number) => {
            const mesh = new THREE.Mesh(cubesGeometry([{ o, s: sz, uv }], 64, 32), mat);
            mesh.position.set(px, 4, pz); mesh.rotation.set(rx, ry, 0);
            body.add(mesh);
          };
          panel([0, 10], [-10, -8, -1], [20, 16, 2], 0, 0, Math.PI / 2, 0);
          panel([0, 0], [-8, -9, -1], [16, 8, 2], -9, 0, 0, Math.PI * 1.5);
          panel([0, 0], [-8, -9, -1], [16, 8, 2], 9, 0, 0, Math.PI / 2);
          panel([0, 0], [-8, -9, -1], [16, 8, 2], 0, -7, 0, Math.PI);
          panel([0, 0], [-8, -9, -1], [16, 8, 2], 0, 7, 0, 0);
          g.add(body);
        } else {
          part(0.9, 0.1, 1.25, 0, 0.15, 0);
          part(0.08, 0.5, 1.25, -0.45, 0.45, 0);
          part(0.08, 0.5, 1.25, 0.45, 0.45, 0);
          part(0.9, 0.5, 0.08, 0, 0.45, -0.6);
          part(0.9, 0.5, 0.08, 0, 0.45, 0.6);
        }
        if (type === 2 || type === 3) {
          const t = this.itemModel(type === 2 ? B.HOPPER : B.CHEST);
          t.obj.scale.setScalar(0.75 / 0.26);
          t.obj.position.y = type === 2 ? 0.62 : 0.55;
          g.add(t.obj);
          mats.push(...t.mats);
        }
        if (type === 1) {
          const t = this.itemModel(B.TNT);
          t.obj.scale.setScalar(0.75 / 0.26);
          t.obj.position.y = 0.55;
          g.add(t.obj);
          mats.push(...t.mats);
        }
        built = { obj: g, parts: new Map(), mats };
        hw = 0.49; h = 0.7;
      } else if (kind === 'boat') {
        const g = new THREE.Group();
        const mats: THREE.ShaderMaterial[] = [];
        const plank = [B.OAK_PLANKS, B.BIRCH_PLANKS, B.SPRUCE_PLANKS, B.JUNGLE_PLANKS, SB.ACACIA_PLANKS, SB.DARK_OAK_PLANKS, SB.CHERRY_PLANKS, SB.MANGROVE_PLANKS][type] ?? B.OAK_PLANKS;
        const part = (sx: number, sy: number, sz: number, px: number, py: number, pz: number, ry = 0, id = plank) => {
          const im = this.itemModel(id);
          im.obj.scale.set(sx / 0.26, sy / 0.26, sz / 0.26);
          im.obj.position.set(px, py, pz);
          im.obj.rotation.y = ry;
          for (const m of im.mats) { m.uniforms.uLight.value = 0.6; mats.push(m); }
          g.add(im.obj);
        };
        part(1.1, 0.1, 1.5, 0, 0.06, 0);
        part(0.1, 0.36, 1.5, -0.55, 0.26, 0);
        part(0.1, 0.36, 1.5, 0.55, 0.26, 0);
        part(1.0, 0.36, 0.1, 0, 0.26, 0.72);
        part(0.8, 0.3, 0.1, 0, 0.3, -0.8);
        part(0.9, 0.06, 0.32, 0, 0.32, 0.15);
        part(0.05, 0.05, 1.0, -0.7, 0.42, 0.05, 0.25, B.OAK_PLANKS);
        part(0.05, 0.05, 1.0, 0.7, 0.42, 0.05, -0.25, B.OAK_PLANKS);
        built = { obj: g, parts: new Map(), mats };
        hw = 0.68; h = 0.56;
      } else if (kind === 'frame') {
        built = { ...this.frameModel(type === 1, extra, flags & 7, (flags >> 3) & 7), parts: new Map() };
        hw = 0.375; h = 0.75;
      } else if (kind === 'fireball') {
        const g = new THREE.Group();
        const m = this.material(null, true);
        const core = new THREE.Mesh(boxGeo([0.5, 0.5, 0.5], type === 1 ? 0xe080f0 : 0xf8b030), m);
        core.position.y = 0.25;
        const shell = new THREE.Mesh(boxGeo([0.7, 0.7, 0.7], type === 1 ? 0x5a1a7a : 0x8a2a08), this.material(null, true));
        shell.position.y = 0.25;
        (shell.material as THREE.ShaderMaterial).uniforms.uOpacity.value = 0.5;
        (shell.material as THREE.ShaderMaterial).transparent = true;
        g.add(core, shell);
        if (flags & 1) { g.scale.setScalar(0.45); g.position.y = -0.1; }
        built = { obj: g, parts: new Map(), mats: [m, shell.material as THREE.ShaderMaterial] };
        hw = flags & 1 ? 0.2 : 0.5; h = flags & 1 ? 0.4 : 1;
      } else if (kind === 'tnt') {
        built = { obj: new THREE.Group(), parts: new Map(), mats: [] };
        hw = 0.49; h = 0.98;
      } else if (kind === 'arrow' && type === 60001) {
        const g = new THREE.Group();
        const m = this.material(null, true);
        const core = new THREE.Mesh(boxGeo([0.3, 0.3, 0.3], 0xf8f0c0), m);
        const shell = new THREE.Mesh(boxGeo([0.42, 0.42, 0.42], 0xb87ad8), this.material(null, true));
        (shell.material as THREE.ShaderMaterial).uniforms.uOpacity.value = 0.45;
        (shell.material as THREE.ShaderMaterial).transparent = true;
        g.add(core, shell);
        built = { obj: g, parts: new Map(), mats: [m, shell.material as THREE.ShaderMaterial] };
        hw = 0.15; h = 0.3;
      } else if (kind === 'arrow' && type > 0) {
        const m = this.itemModel(type);
        m.obj.scale.multiplyScalar(0.6);
        built = { obj: m.obj, parts: new Map(), mats: m.mats };
        hw = 0.12; h = 0.24;
      } else if (kind === 'arrow' && this.atlas.entityTextures.get('arrow')) {
        const m = this.material(this.atlas.entityTextures.get('arrow')!);
        m.side = THREE.DoubleSide;
        const g = new THREE.Group();
        const geo = new THREE.BufferGeometry();
        const zb = 0.7, zt = -0.2, w = 0.1125, zc = zb - 0.05625, q = 1 / 32;
        const pos = [0, w, zb, 0, w, zt, 0, -w, zt, 0, -w, zb, -w, 0, zb, -w, 0, zt, w, 0, zt, w, 0, zb, -w, w, zc, w, w, zc, w, -w, zc, -w, -w, zc];
        const uv = [0, 0, 16 * q, 0, 16 * q, 5 * q, 0, 5 * q, 0, 0, 16 * q, 0, 16 * q, 5 * q, 0, 5 * q, 0, 5 * q, 5 * q, 5 * q, 5 * q, 10 * q, 0, 10 * q];
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(36).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(new Array(36).fill(1), 3));
        geo.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 8, 9, 10, 8, 10, 11]);
        g.add(new THREE.Mesh(geo, m));
        built = { obj: g, parts: new Map(), mats: [m] };
        hw = 0.05; h = 0.05;
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
      if (kind === 'player' && opts?.name) { v.name = opts.name; v.tag = this.nameTag(opts.name, opts.sup ?? '#fff', !!opts.sup); v.obj.add(v.tag); (v as EntityView & { app?: Appearance }).app = opts.appearance; (v as EntityView & { skinKey?: string }).skinKey = (opts.skin?.png ?? '') + (opts.skin?.slim ? 's' : ''); (v as EntityView & { skin?: { png: string; slim: boolean } | null }).skin = opts.skin ?? null; }
      if (kind === 'mob') {
        const def = MOB_BY_CODE[type];
        const tg = this.tags.get(id) ?? (def?.type === 'quartermaster' ? { name: 'Quartermaster', color: '#f3d27a' } : undefined);
        if (tg) { v.name = tg.name; v.tag = this.nameTag(tg.name, tg.color); v.obj.add(v.tag); }
        else { const mn = this.mobNames.get(id); if (mn) { v.name = mn; v.tag = this.nameTag(mn); v.tag.position.y = Math.max(1.2, v.h + 0.35); v.obj.add(v.tag); } }
      }
      if (kind === 'mob' && MOB_BY_CODE[type]?.type === 'villager') (v as EntityView & { pb?: number }).pb = (flags >> 9) & 15;
      if (kind === 'mob' && MOB_BY_CODE[type]?.type === 'rival') {
        const pb = (flags >> 9) & 31;
        (v as EntityView & { pb?: number }).pb = pb;
        const sw = pb & 7, gr = (pb >> 3) & 3;
        const gm = [0, 2, 1, 3][gr];
        this.equip.set(id, [sw ? toolId([0, 0, 1, 2, 4][sw], 3) : 0, 0, armorId(0, 0), armorId(0, 1), armorId(gm, 2), armorId(gm, 3), 0]);
      }
      v.obj.position.set(x, y, z);
      this.group.add(v.obj);
      this.views.set(id, v);
      if (kind === 'player' || (kind === 'mob' && MOB_BY_CODE[type]?.type === 'rival')) this.applyEquip(v);
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
      } else if (v.kind === 'frame') {
        v.obj.rotation.set(0, 0, 0);
      } else if (v.kind === 'arrow' && v.type > 0) {
        v.obj.rotation.set(0, v.age * 0.25, 0);
      } else if (v.kind === 'arrow') {
        const a = v as EntityView & { py?: number; px?: number; pz?: number; ay?: number; ap?: number };
        if (a.px !== undefined) {
          const dx = v.x - a.px, dy = v.y - a.py!, dz = v.z - a.pz!, hz = Math.hypot(dx, dz);
          if (hz + Math.abs(dy) > 1e-3) { a.ay = Math.atan2(-dx, -dz); a.ap = Math.atan2(dy, hz); }
        }
        a.px = v.x; a.py = v.y; a.pz = v.z;
        v.obj.rotation.order = 'YXZ';
        v.obj.rotation.set(a.ap ?? 0, a.ay ?? v.yaw, 0);
      } else {
        v.obj.rotation.y = v.yaw;
        v.obj.scale.setScalar(v.kind === 'mob' && (v.flags & 128) ? 0.55 : 1);
        if (v.kind === 'mob') {
          const mt = MOB_BY_CODE[v.type]?.type;
          if (mt === 'emberslime') {
            const n = [1, 2, 4][(v.flags >> 13) & 3] ?? 1;
            v.obj.scale.setScalar(n);
            v.hw = 0.26 * n; v.h = 0.52 * n;
            const target = (v.flags & 4096) ? 0.8 : 0;
            v.squish = (v.squish ?? 0) + (target - (v.squish ?? 0)) * Math.min(1, dt * 10);
            if (!v.rig) v.obj.scale.y = n * (1 + (v.squish ?? 0) * 0.3);
          } else if (mt === 'wailer' || mt === 'lavastrider') {
            const alt = mt === 'wailer' ? ((v.flags & 4) ? 'ghast_shooting' : 'ghast') : ((v.flags & 32) ? 'strider_cold' : 'strider') + ((v.flags & 64) && this.atlas.entityTextures.has('strider_saddled') ? '_saddled' : '');
            const tex = this.atlas.entityTextures.get(alt);
            if (tex && v.rig && v.mats[0]?.uniforms.uMap && v.mats[0].uniforms.uMap.value !== tex) v.mats[0].uniforms.uMap.value = tex;
            if (mt === 'wailer') v.obj.position.y += Math.sin(v.age * 0.05) * 0.15;
          }
        }
        v.age += dt * 20;
        if (v.swing > 0) v.swing = Math.max(0, v.swing - dt * 4);
        const aggressive = (v.flags & 16) !== 0;
        const mtype = v.kind === 'mob' ? MOB_BY_CODE[v.type]?.type ?? '' : 'player';
        if (v.spec && v.rig) {
          animateVanilla(v.spec, v.rig, { ls: v.walk, amt: Math.min(1, speed / 5), age: v.age, pitch: v.kind === 'player' ? v.pitch : 0, aggressive, attack: v.swing > 0 ? 1 - v.swing : 0, crouch: v.kind === 'player' && (v.flags & 2) !== 0 && !v.swimT, type: mtype, swim: v.swimT ?? 0, crawl: (v.flags & 16384) !== 0 && (v.flags & 16) === 0, squish: v.squish, cold: (v.flags & 32) !== 0 && mtype === 'lavastrider', riding: v.kind === 'player' && !!(v.flags & 8192), ...this.holdState(v), ...(mtype === 'piglin' && (v.flags & 32) && aggressive ? { xbow: true } : {}), ...(mtype === 'shellward' ? { peek: this.shulkerPeek(v, dt) } : {}) });
          if (mtype === 'shellward') this.attachShulker(v);
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
          if (v.wings) this.animateWings(v, crouch);
          if (!v.rig) {
            const body = v.parts.get('body'), head = v.parts.get('head');
            if (body) body.rotation.x = crouch ? -0.35 : 0;
            if (head) head.position.z = crouch ? -0.12 : 0;
          }
          v.obj.position.y -= crouch ? 0.12 : 0;
          if (v.tag) v.tag.visible = !crouch;
          v.obj.visible = !(v.flags & (1 << 14));
        }
        if (v.cage) {
          const sc = Math.min(0.45, 0.75 / Math.max(v.h, v.hw * 2, 0.5));
          v.obj.scale.setScalar(sc);
          v.obj.rotation.y = now * 0.0025;
          v.obj.position.y = v.y + 0.5 - Math.min(v.h, 1.6) * sc * 0.5;
          if (v.tag) v.tag.visible = false;
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
      if (v.lightT <= 0) { v.lightT = (v.kind === 'tnt' ? 1 : 0.25) + Math.random() * 0.1; v.light = this.probe(v.x, v.y + Math.min(1.2, v.h * 0.6), v.z); }
      const hurt = v.hurtT > 0 || (v.kind === 'mob' && (v.flags & 1)) ? 1 : 0;
      for (const m of v.mats) { m.uniforms.uLight.value = Math.max(0.2, v.light); if (!v.dying) m.uniforms.uHurt.value = hurt; }
      if (v.kind === 'frame' && v.type === 1) for (const m of v.mats) m.uniforms.uLight.value = 1;
      if (v.kind === 'tnt' || v.kind === 'cart' || v.kind === 'boat') for (const m of v.mats) if (m.uniforms.uWhite) m.uniforms.uWhite.value = v.flags & 1 ? 0.7 : 0;
      if (v.flags & 2 && v.kind === 'mob') for (const m of v.mats) m.uniforms.uLight.value = Math.max(v.light, 0.95);
    }
    this.drawTnt();
  }

  private tntMesh: THREE.InstancedMesh | null = null;
  private tntCap = 0;

  private tntBatch(cap: number): THREE.InstancedMesh {
    if (this.tntMesh && this.tntCap >= cap) return this.tntMesh;
    if (this.tntMesh) { this.group.remove(this.tntMesh); this.tntMesh.dispose(); }
    const src = this.itemModel(B.TNT).obj.children[0] as THREE.Mesh;
    const g = src.geometry.clone();
    g.scale(0.98 / 0.26, 0.98 / 0.26, 0.98 / 0.26);
    g.translate(0, 0.49, 0);
    const n = Math.max(64, 1 << Math.ceil(Math.log2(cap)));
    g.setAttribute('aFx', new THREE.InstancedBufferAttribute(new Float32Array(n * 2), 2));
    const m = new THREE.ShaderMaterial({
      uniforms: { uFogColor: this.u.uFogColor, uFogNear: this.u.uFogNear, uFogFar: this.u.uFogFar, uMap: { value: this.atlas.texture } },
      vertexShader: `attribute vec3 color; attribute vec2 aFx; varying vec3 vColor; varying vec2 vUv; varying float vFog; varying float vShade; varying vec2 vFx;
        void main(){ vColor = color; vUv = uv; vFx = aFx; vec3 n = normalize(normal);
        vShade = 0.6 + 0.4 * max(n.y, 0.0) + 0.15 * abs(n.z) - 0.12 * max(-n.y, 0.0);
        vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0); vFog = length(mv.xyz); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar; uniform sampler2D uMap;
        varying vec3 vColor; varying vec2 vUv; varying float vFog; varying float vShade; varying vec2 vFx;
        void main(){ vec4 t = texture2D(uMap, vUv); if (t.a < 0.5) discard;
          vec3 c = mix(vColor * t.rgb * vFx.x * vShade, vec3(1.0), vFx.y);
          gl_FragColor = vec4(mix(c, uFogColor, smoothstep(uFogNear, uFogFar, vFog)), 1.0); }`,
    });
    const im = new THREE.InstancedMesh(g, m, n);
    im.frustumCulled = false;
    im.count = 0;
    this.tntMesh = im; this.tntCap = n;
    this.group.add(im);
    return im;
  }

  private tntMat = new THREE.Matrix4();

  private drawTnt(): void {
    let n = 0;
    for (const v of this.views.values()) if (v.kind === 'tnt' && v.obj.visible) n++;
    if (!n) { if (this.tntMesh) this.tntMesh.count = 0; return; }
    const im = this.tntBatch(n);
    const fx = im.geometry.getAttribute('aFx') as THREE.InstancedBufferAttribute;
    let i = 0;
    for (const v of this.views.values()) {
      if (v.kind !== 'tnt' || !v.obj.visible) continue;
      const o = v.obj.position;
      this.tntMat.makeTranslation(o.x, o.y, o.z);
      im.setMatrixAt(i, this.tntMat);
      fx.setXY(i, Math.max(0.2, v.light), v.flags & 1 ? 0.7 : 0);
      i++;
    }
    im.count = i;
    im.instanceMatrix.needsUpdate = true;
    fx.needsUpdate = true;
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
    if (mtype === 'voidwyrm') {
      const flap = Math.sin(v.age * 0.12) * 0.55, wl = p.get('wingL'), wr = p.get('wingR');
      const perched = (v.flags & 0x10000) === 0 && v.snaps.length > 1 && Math.hypot(v.snaps[v.snaps.length - 1].x - v.snaps[0].x, v.snaps[v.snaps.length - 1].z - v.snaps[0].z) < 0.05;
      if (wl) wl.rotation.z = perched ? -0.9 : flap;
      if (wr) wr.rotation.z = perched ? 0.9 : -flap;
      for (let i = 0; i < 6; i++) { const t = p.get(`tail${i}`); if (t) t.rotation.y = Math.sin(v.age * 0.06 - i * 0.6) * 0.12 * i; }
      const jaw = p.get('jaw'); if (jaw) jaw.rotation.x = Math.max(0, Math.sin(v.age * 0.05)) * 0.25;
      if (v.flags & 0x10000) { v.obj.rotation.z = Math.sin(v.age * 0.4) * 0.05; }
    } else if (mtype === 'riftcore') {
      const f = p.get('frame'), c = p.get('core');
      if (f) { f.rotation.y = v.age * 0.08; f.rotation.x = v.age * 0.05; f.position.y = 1.3 + Math.sin(v.age * 0.1) * 0.25; }
      if (c) { c.rotation.y = -v.age * 0.12; c.rotation.z = v.age * 0.07; c.position.y = 1.3 + Math.sin(v.age * 0.1) * 0.25; }
    } else if (mtype === 'shellward') {
      const peek = this.shulkerPeek(v, 1 / 60);
      const lid = p.get('lid'); if (lid) lid.position.y = Math.max(0, -Math.sin((0.5 + peek) * Math.PI) + 1) * 0.5;
      const hd = p.get('head'); if (hd) hd.scale.setScalar(0.6 + peek * 0.4);
      this.attachShulker(v);
    }
  }

  private shulkerPeek(v: EntityView, dt: number): number {
    const want = ((v.flags >> 8) & 15) / 15, cur = v.peekS ?? want;
    v.peekS = Math.abs(want - cur) <= dt ? want : cur + Math.sign(want - cur) * dt;
    return v.peekS;
  }

  private attachShulker(v: EntityView): void {
    const att = (v.flags >> 12) & 7;
    const rot: [number, number][] = [[0, Math.PI / 2], [0, -Math.PI / 2], [Math.PI, 0], [0, 0], [-Math.PI / 2, 0], [Math.PI / 2, 0]];
    const [rx, rz] = rot[att] ?? [0, 0];
    v.obj.rotation.order = 'YXZ';
    v.obj.rotation.x = rx; v.obj.rotation.z = rz;
    v.obj.position.y += 0.5;
  }

  private animateWings(v: EntityView, crouch: boolean): void {
    const [l, r] = v.wings!;
    let xr = 0.2617994, zr = -0.2617994, y = 0, yr = 0;
    if (v.flags & 131072) {
      let f4 = 1;
      const a = v.snaps[v.snaps.length - 1], b = v.snaps[v.snaps.length - 2];
      if (a && b) {
        const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z, len = Math.hypot(dx, dy, dz);
        if (dy < 0 && len > 1e-4) f4 = 1 - Math.pow(-dy / len, 1.5);
      }
      xr = f4 * 0.34906584 + (1 - f4) * 0.2617994;
      zr = f4 * (-Math.PI / 2) + (1 - f4) * -0.2617994;
    } else if (crouch) { xr = 0.6981317; zr = -Math.PI / 4; y = 3; yr = 0.08726646; }
    const k = v.rig ? 1 : -1;
    const base = v.rig ? 0 : 0.36;
    l.position.y = v.rig ? y : base - y / 16; r.position.y = l.position.y;
    l.rotation.set(xr * k, yr, zr); r.rotation.set(xr * k, -yr, -zr);
  }

  gliders(): { id: string; x: number; y: number; z: number }[] {
    const out: { id: string; x: number; y: number; z: number }[] = [];
    for (const v of this.views.values()) if (v.kind === 'player' && (v.flags & 131072) && !v.dying) out.push({ id: v.id, x: v.x, y: v.y, z: v.z });
    return out;
  }

  pick(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number, filter: (v: EntityView) => boolean): { view: EntityView; dist: number } | null {
    let best: { view: EntityView; dist: number } | null = null;
    for (const v of this.views.values()) {
      if (!filter(v) || v.dying || v.cage) continue;
      if (v.kind === 'mob' && v.type === 19) {
        const h = rayPart(dragonParts(v.x, v.y, v.z, v.yaw), ox, oy, oz, dx, dy, dz, maxDist);
        if (h && (!best || h.dist < best.dist)) best = { view: v, dist: h.dist };
        continue;
      }
      const pad = v.kind === 'fireball' ? 0.45 : 0;
      const x0 = v.x - v.hw - pad, x1 = v.x + v.hw + pad, y0 = v.y - pad, y1 = v.y + v.h + pad, z0 = v.z - v.hw - pad, z1 = v.z + v.hw + pad;
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

import * as THREE from 'three';
import { meshChunk, POS_SCALE, type MesherContext } from './Mesher';
import { chunkGeometry } from './ChunkMaterial';
import { B } from '../core/blocks';

type Mats = { opaque: THREE.ShaderMaterial; cutout: THREE.ShaderMaterial; trans: THREE.ShaderMaterial };

interface Anim { obj: THREE.Group; from: number[]; to: number[]; t0: number }

const DURATION = 100;
const SIZE = 16 * 16 * 256;

export class MovingBlocks {
  readonly group = new THREE.Group();
  private cache = new Map<number, THREE.BufferGeometry[]>();
  private anims: Anim[] = [];
  private scratch = new Uint16Array(SIZE);
  ctx: MesherContext | null = null;

  constructor(private mats: Mats) {}

  private geometry(v: number): THREE.BufferGeometry[] {
    const hit = this.cache.get(v);
    if (hit) return hit;
    const out: THREE.BufferGeometry[] = [];
    if (this.ctx) {
      this.scratch.fill(0);
      this.scratch[0] = v;
      const chunks: (Uint16Array | null)[] = [null, null, null, null, this.scratch, null, null, null, null];
      const r = meshChunk(this.ctx, 0, 0, chunks, false);
      for (const [b, m] of [[r.opaque, 0], [r.cutout, 1], [r.trans, 2]] as const) {
        if (!b || !b.idx.length) continue;
        const g = chunkGeometry(b, 2);
        g.userData.layer = m;
        out.push(g);
      }
    }
    this.cache.set(v, out);
    return out;
  }

  add(list: number[], now: number): void {
    for (let i = 0; i + 6 < list.length; i += 7) {
      const v = list[i + 6];
      const obj = new THREE.Group();
      for (const g of this.geometry(v)) {
        const layer = g.userData.layer as number;
        const m = new THREE.Mesh(g, layer === 0 ? this.mats.opaque : layer === 1 ? this.mats.cutout : this.mats.trans);
        m.scale.setScalar(1 / POS_SCALE);
        m.renderOrder = layer;
        m.frustumCulled = false;
        obj.add(m);
      }
      const from = [list[i], list[i + 1], list[i + 2]], to = [list[i + 3], list[i + 4], list[i + 5]];
      obj.position.set(from[0], from[1], from[2]);
      this.group.add(obj);
      this.anims.push({ obj, from, to, t0: now });
    }
  }

  update(now: number, getBlock: (x: number, y: number, z: number) => number): void {
    if (!this.anims.length) return;
    this.anims = this.anims.filter((a) => {
      const p = Math.min(1, (now - a.t0) / DURATION);
      a.obj.position.set(a.from[0] + (a.to[0] - a.from[0]) * p, a.from[1] + (a.to[1] - a.from[1]) * p, a.from[2] + (a.to[2] - a.from[2]) * p);
      const settled = p >= 1 && (getBlock(a.to[0], a.to[1], a.to[2]) & 0xff) !== B.MOVING_PISTON;
      if (settled || now - a.t0 > 700) { this.group.remove(a.obj); return false; }
      return true;
    });
  }

  clear(): void {
    for (const a of this.anims) this.group.remove(a.obj);
    this.anims = [];
    for (const gs of this.cache.values()) for (const g of gs) g.dispose();
    this.cache.clear();
  }
}

import * as THREE from 'three';
import { meshChunk, POS_SCALE, type MesherContext } from './Mesher';
import { chunkGeometry, createChunkMaterial } from './ChunkMaterial';
import type { WorldUniforms } from './ChunkMaterial';
import type { Blueprint } from '../core/blueprint';
import { CHUNK_VOLUME } from '../core/constants';

export class BlueprintGhost {
  readonly group = new THREE.Group();
  private mat: THREE.ShaderMaterial;
  private box: THREE.LineSegments;
  private built: Blueprint | null = null;
  ctx: MesherContext | null = null;

  constructor(uniforms: WorldUniforms) {
    this.mat = createChunkMaterial(uniforms, 'trans');
    this.mat.uniforms.uOpacity.value = 0.55;
    this.mat.uniforms.uAlphaTest.value = 0.3;
    this.mat.depthWrite = false;
    this.mat.transparent = true;
    this.box = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: 0x5fd3ff, transparent: true, opacity: 0.9, depthTest: false }));
    this.box.renderOrder = 10;
    this.group.visible = false;
    this.group.add(this.box);
  }

  show(bp: Blueprint | null): void {
    if (bp === this.built) { this.group.visible = !!bp; return; }
    this.clearMeshes();
    this.built = bp;
    this.group.visible = !!bp;
    if (!bp || !this.ctx) return;
    this.box.scale.set(bp.w, bp.h, bp.d);
    this.box.position.set(bp.w / 2, bp.h / 2, bp.d / 2);
    const tw = Math.ceil(bp.w / 16), td = Math.ceil(bp.d / 16);
    const tiles: (Uint32Array | null)[] = [];
    for (let tz = 0; tz < td; tz++) for (let tx = 0; tx < tw; tx++) {
      const arr = new Uint32Array(CHUNK_VOLUME);
      let any = false;
      for (let y = 0; y < bp.h; y++) for (let lz = 0; lz < 16; lz++) {
        const z = tz * 16 + lz;
        if (z >= bp.d) break;
        for (let lx = 0; lx < 16; lx++) {
          const x = tx * 16 + lx;
          if (x >= bp.w) break;
          const v = bp.blocks[(y * bp.d + z) * bp.w + x];
          if (v) { arr[(y * 16 + lz) * 16 + lx] = v; any = true; }
        }
      }
      tiles.push(any ? arr : null);
    }
    const at = (tx: number, tz: number) => (tx < 0 || tz < 0 || tx >= tw || tz >= td ? null : tiles[tz * tw + tx]);
    for (let tz = 0; tz < td; tz++) for (let tx = 0; tx < tw; tx++) {
      const mid = at(tx, tz);
      if (!mid) continue;
      const chunks = [at(tx - 1, tz - 1), at(tx, tz - 1), at(tx + 1, tz - 1), at(tx - 1, tz), mid, at(tx + 1, tz), at(tx - 1, tz + 1), at(tx, tz + 1), at(tx + 1, tz + 1)];
      const r = meshChunk(this.ctx, 0, 0, chunks, false);
      for (const b of [r.opaque, r.cutout, r.trans]) {
        if (!b || !b.idx.length) continue;
        const m = new THREE.Mesh(chunkGeometry(b, 2), this.mat);
        m.scale.setScalar(1 / POS_SCALE);
        m.position.set(tx * 16, 0, tz * 16);
        m.renderOrder = 9;
        m.frustumCulled = false;
        this.group.add(m);
      }
    }
  }

  place(x: number, y: number, z: number, ok: boolean): void {
    this.group.position.set(x, y, z);
    (this.box.material as THREE.LineBasicMaterial).color.setHex(ok ? 0x5fd3ff : 0xff5a4f);
  }

  private clearMeshes(): void {
    for (const c of [...this.group.children]) {
      if (c === this.box) continue;
      this.group.remove(c);
      (c as THREE.Mesh).geometry?.dispose();
    }
  }
}

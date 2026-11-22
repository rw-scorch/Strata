import * as THREE from 'three';

export interface Glider { id: string; x: number; y: number; z: number; roll?: number }

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
const MAX = 180, LIFE = 2.6, MIN_SPEED = 11, WIDTH = 0.11, TIP = 0.95;

interface Ribbon { mesh: THREE.Mesh; pos: Float32Array; col: Float32Array }
interface Trail { l: Ribbon; r: Ribbon; pts: { l: THREE.Vector3; r: THREE.Vector3; t: number }[]; px: number; py: number; pz: number; pt: number; v: THREE.Vector3; seen: number }

export class Contrails {
  private trails = new Map<string, Trail>();
  private mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true });
  private index: THREE.BufferAttribute;

  constructor(private scene: THREE.Scene) {
    const idx = new Uint16Array((MAX - 1) * 6);
    for (let i = 0; i < MAX - 1; i++) idx.set([i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2], i * 6);
    this.index = new THREE.BufferAttribute(idx, 1);
  }

  private ribbon(): Ribbon {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(MAX * 6), col = new Float32Array(MAX * 8);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(this.index);
    g.setDrawRange(0, 0);
    const mesh = new THREE.Mesh(g, this.mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 5;
    this.scene.add(mesh);
    return { mesh, pos, col };
  }

  update(now: number, cam: THREE.Vector3, gliders: Glider[], enabled: boolean): void {
    const t = now / 1000;
    if (enabled) for (const gl of gliders) {
      let tr = this.trails.get(gl.id);
      if (!tr) { tr = { l: this.ribbon(), r: this.ribbon(), pts: [], px: gl.x, py: gl.y, pz: gl.z, pt: t, v: new THREE.Vector3(), seen: t }; this.trails.set(gl.id, tr); continue; }
      tr.seen = t;
      const dt = t - tr.pt;
      if (dt < 1 / 40) continue;
      const nv = _a.set(gl.x - tr.px, gl.y - tr.py, gl.z - tr.pz).divideScalar(dt);
      tr.v.lerp(nv, tr.v.lengthSq() ? 0.5 : 1);
      tr.px = gl.x; tr.py = gl.y; tr.pz = gl.z; tr.pt = t;
      const sp = tr.v.length();
      if (sp < MIN_SPEED || sp > 400) continue;
      const fwd = _a.copy(tr.v).divideScalar(sp);
      const right = _b.crossVectors(fwd, UP);
      if (right.lengthSq() < 1e-4) right.set(1, 0, 0);
      right.normalize();
      const up = _c.crossVectors(right, fwd);
      const r = gl.roll ?? 0;
      const side = right.multiplyScalar(Math.cos(r)).addScaledVector(up, -Math.sin(r)).multiplyScalar(TIP);
      const old = tr.pts.length >= MAX ? tr.pts.shift()! : { l: new THREE.Vector3(), r: new THREE.Vector3(), t };
      old.l.set(gl.x - side.x, gl.y + 0.3 - side.y, gl.z - side.z);
      old.r.set(gl.x + side.x, gl.y + 0.3 + side.y, gl.z + side.z);
      old.t = t;
      tr.pts.push(old);
    }
    for (const [id, tr] of this.trails) {
      while (tr.pts.length && t - tr.pts[0].t > LIFE) tr.pts.shift();
      if (!tr.pts.length && t - tr.seen > 1) { this.drop(id, tr); continue; }
      this.fill(tr.l, tr.pts, 'l', t, cam);
      this.fill(tr.r, tr.pts, 'r', t, cam);
    }
  }

  private fill(rb: Ribbon, src: { l: THREE.Vector3; r: THREE.Vector3; t: number }[], k: 'l' | 'r', t: number, cam: THREE.Vector3): void {
    const n = src.length;
    const g = rb.mesh.geometry;
    if (n < 2) { g.setDrawRange(0, 0); return; }
    const tan = _a, view = _b, off = _c, P = rb.pos, C = rb.col;
    let along = 0;
    for (let i = n - 1; i >= 0; i--) {
      const p = src[i][k];
      tan.subVectors(src[Math.min(n - 1, i + 1)][k], src[Math.max(0, i - 1)][k]);
      view.subVectors(p, cam);
      off.crossVectors(tan, view);
      const ol = off.length();
      if (i < n - 1) along += src[i + 1][k].distanceTo(p);
      const age = (t - src[i].t) / LIFE;
      const w = WIDTH * Math.min(1, along / 2.5 + 0.15) * Math.min(1, (1 - age) * 3);
      if (ol > 1e-6) off.multiplyScalar(w / 2 / ol); else off.set(0, w / 2, 0);
      const o = i * 6;
      P[o] = p.x - off.x; P[o + 1] = p.y - off.y; P[o + 2] = p.z - off.z; P[o + 3] = p.x + off.x; P[o + 4] = p.y + off.y; P[o + 5] = p.z + off.z;
      const a = Math.max(0, Math.pow(1 - age, 1.4)) * 0.75 * Math.min(1, along / 1.2);
      const c = i * 8;
      C[c] = C[c + 1] = C[c + 2] = C[c + 4] = C[c + 5] = C[c + 6] = 1; C[c + 3] = C[c + 7] = a;
    }
    (g.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
    g.setDrawRange(0, (n - 1) * 6);
  }

  private drop(id: string, tr: Trail): void {
    for (const rb of [tr.l, tr.r]) { this.scene.remove(rb.mesh); rb.mesh.geometry.dispose(); }
    this.trails.delete(id);
  }

  dispose(): void {
    for (const [id, tr] of this.trails) this.drop(id, tr);
    this.mat.dispose();
  }
}

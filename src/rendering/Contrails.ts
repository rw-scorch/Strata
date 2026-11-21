import * as THREE from 'three';

export interface Glider { id: string; x: number; y: number; z: number; roll?: number }

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
      const nv = new THREE.Vector3(gl.x - tr.px, gl.y - tr.py, gl.z - tr.pz).divideScalar(dt);
      tr.v.lerp(nv, tr.v.lengthSq() ? 0.5 : 1);
      tr.px = gl.x; tr.py = gl.y; tr.pz = gl.z; tr.pt = t;
      const sp = tr.v.length();
      if (sp < MIN_SPEED || sp > 400) continue;
      const fwd = tr.v.clone().divideScalar(sp);
      const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0));
      if (right.lengthSq() < 1e-4) right.set(1, 0, 0);
      right.normalize();
      const up = new THREE.Vector3().crossVectors(right, fwd);
      const r = gl.roll ?? 0;
      const side = right.multiplyScalar(Math.cos(r)).addScaledVector(up, -Math.sin(r)).multiplyScalar(TIP);
      const c = new THREE.Vector3(gl.x, gl.y + 0.3, gl.z);
      tr.pts.push({ l: c.clone().sub(side), r: c.clone().add(side), t });
      if (tr.pts.length > MAX) tr.pts.shift();
    }
    for (const [id, tr] of this.trails) {
      while (tr.pts.length && t - tr.pts[0].t > LIFE) tr.pts.shift();
      if (!tr.pts.length && t - tr.seen > 1) { this.drop(id, tr); continue; }
      this.fill(tr.l, tr.pts.map((p) => p.l), tr.pts, t, cam);
      this.fill(tr.r, tr.pts.map((p) => p.r), tr.pts, t, cam);
    }
  }

  private fill(rb: Ribbon, pts: THREE.Vector3[], src: { t: number }[], t: number, cam: THREE.Vector3): void {
    const n = pts.length;
    const g = rb.mesh.geometry;
    if (n < 2) { g.setDrawRange(0, 0); return; }
    const tan = new THREE.Vector3(), view = new THREE.Vector3(), off = new THREE.Vector3();
    let along = 0;
    for (let i = n - 1; i >= 0; i--) {
      const p = pts[i];
      tan.subVectors(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]);
      view.subVectors(p, cam);
      off.crossVectors(tan, view);
      const ol = off.length();
      if (i < n - 1) along += pts[i + 1].distanceTo(p);
      const age = (t - src[i].t) / LIFE;
      const w = WIDTH * Math.min(1, along / 2.5 + 0.15) * Math.min(1, (1 - age) * 3);
      if (ol > 1e-6) off.multiplyScalar(w / 2 / ol); else off.set(0, w / 2, 0);
      rb.pos.set([p.x - off.x, p.y - off.y, p.z - off.z, p.x + off.x, p.y + off.y, p.z + off.z], i * 6);
      const a = Math.max(0, Math.pow(1 - age, 1.4)) * 0.75 * Math.min(1, along / 1.2);
      rb.col.set([1, 1, 1, a, 1, 1, 1, a], i * 8);
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

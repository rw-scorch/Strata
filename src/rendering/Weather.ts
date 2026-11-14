import * as THREE from 'three';

const DROPS = 1000;
const FLAKES = 900;
const RADIUS = 22;

export type ColumnTop = (x: number, z: number) => number;
export type PrecipKind = (x: number, z: number) => 'rain' | 'snow' | 'none';

export class Weather {
  readonly group = new THREE.Group();
  private rain: THREE.LineSegments;
  private snow: THREE.Points;
  private rainPos = new Float32Array(DROPS * 6);
  private snowPos = new Float32Array(FLAKES * 3);
  private drops: { x: number; y: number; z: number; v: number }[] = [];
  private flakes: { x: number; y: number; z: number; v: number; ph: number }[] = [];
  private bolt: THREE.Mesh | null = null;
  private boltT = 0;
  intensity = 0;
  splash: ((x: number, y: number, z: number) => void) | null = null;

  constructor() {
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0x9fb8d8, transparent: true, opacity: 0.55, depthWrite: false }));
    this.rain.frustumCulled = false;
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(this.snowPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.snow = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.12, transparent: true, opacity: 0.9, depthWrite: false }));
    this.snow.frustumCulled = false;
    for (let i = 0; i < DROPS; i++) this.drops.push({ x: 0, y: -999, z: 0, v: 18 + Math.random() * 8 });
    for (let i = 0; i < FLAKES; i++) this.flakes.push({ x: 0, y: -999, z: 0, v: 1.5 + Math.random() * 1.5, ph: Math.random() * 6 });
    this.group.add(this.rain, this.snow);
  }

  lightning(x: number, y: number, z: number): void {
    if (this.bolt) { this.group.remove(this.bolt); this.bolt.geometry.dispose(); }
    const pos: number[] = [], col: number[] = [];
    const seg = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, w: number, a: number) => {
      for (const [ox, oz] of [[w, 0], [0, w]]) {
        pos.push(ax - ox, ay, az - oz, ax + ox, ay, az + oz, bx + ox, by, bz + oz, ax - ox, ay, az - oz, bx + ox, by, bz + oz, bx - ox, by, bz - oz);
        for (let i = 0; i < 6; i++) col.push(0.75 * a, 0.8 * a, a);
      }
    };
    const strand = (sx: number, sy: number, sz: number, ey: number, w: number, spread: number, depth: number) => {
      let cx = sx, cy = sy, cz = sz;
      while (cy > ey) {
        const ny = Math.max(ey, cy - (5 + Math.random() * 6));
        const k = ny <= ey && depth === 0 ? 0 : 1;
        const nx = k ? cx + (Math.random() - 0.5) * spread : x, nz = k ? cz + (Math.random() - 0.5) * spread : z;
        seg(cx, cy, cz, nx, ny, nz, w, 1);
        seg(cx, cy, cz, nx, ny, nz, w * 3.2, 0.28);
        if (depth < 2 && Math.random() < 0.3) strand(nx, ny, nz, ny - 14 - Math.random() * 22, w * 0.55, spread * 1.6, depth + 1);
        cx = nx; cy = ny; cz = nz;
      }
    };
    strand(x + (Math.random() - 0.5) * 14, Math.max(y + 60, 150), z + (Math.random() - 0.5) * 14, y, 0.22, 7, 0);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    this.bolt = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    this.bolt.frustumCulled = false;
    this.group.add(this.bolt);
    this.boltT = 0.55;
  }

  update(dt: number, cam: THREE.Vector3, top: ColumnTop, kind: PrecipKind, budget: number): void {
    if (this.bolt) {
      this.boltT -= dt;
      this.bolt.visible = this.boltT > 0.3 || Math.sin(this.boltT * 70) > -0.1;
      (this.bolt.material as THREE.MeshBasicMaterial).opacity = Math.min(1, this.boltT / 0.25);
      if (this.boltT <= 0) { this.group.remove(this.bolt); this.bolt.geometry.dispose(); this.bolt = null; }
    }
    const active = this.intensity > 0.02;
    const k = active ? kind(Math.floor(cam.x), Math.floor(cam.z)) : 'none';
    const nDrops = k === 'rain' ? Math.floor(DROPS * this.intensity * budget) : 0;
    const nFlakes = k === 'snow' ? Math.floor(FLAKES * this.intensity * budget) : 0;
    let n = 0;
    for (let i = 0; i < nDrops; i++) {
      const d = this.drops[i];
      d.y -= d.v * dt;
      const t = top(Math.floor(d.x), Math.floor(d.z));
      if (d.y < t || d.y < cam.y - 14 || Math.abs(d.x - cam.x) > RADIUS || Math.abs(d.z - cam.z) > RADIUS) {
        if (d.y < t && d.y > cam.y - 14 && Math.random() < 0.05) this.splash?.(d.x, t + 0.05, d.z);
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * RADIUS;
        d.x = cam.x + Math.cos(a) * r; d.z = cam.z + Math.sin(a) * r;
        d.y = cam.y + 8 + Math.random() * 12;
        if (d.y < top(Math.floor(d.x), Math.floor(d.z))) d.y = -999;
      }
      this.rainPos[n * 6] = d.x; this.rainPos[n * 6 + 1] = d.y; this.rainPos[n * 6 + 2] = d.z;
      this.rainPos[n * 6 + 3] = d.x + 0.05; this.rainPos[n * 6 + 4] = d.y + 0.7; this.rainPos[n * 6 + 5] = d.z;
      n++;
    }
    this.rain.geometry.setDrawRange(0, n * 2);
    (this.rain.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    this.rain.visible = n > 0;
    let m = 0;
    for (let i = 0; i < nFlakes; i++) {
      const f = this.flakes[i];
      f.y -= f.v * dt;
      f.ph += dt;
      f.x += Math.sin(f.ph * 1.3) * dt * 0.5;
      const t = top(Math.floor(f.x), Math.floor(f.z));
      if (f.y < t || f.y < cam.y - 12 || Math.abs(f.x - cam.x) > RADIUS || Math.abs(f.z - cam.z) > RADIUS) {
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * RADIUS;
        f.x = cam.x + Math.cos(a) * r; f.z = cam.z + Math.sin(a) * r;
        f.y = cam.y + 6 + Math.random() * 12;
        if (f.y < top(Math.floor(f.x), Math.floor(f.z))) f.y = -999;
      }
      this.snowPos[m * 3] = f.x; this.snowPos[m * 3 + 1] = f.y; this.snowPos[m * 3 + 2] = f.z;
      m++;
    }
    this.snow.geometry.setDrawRange(0, m);
    (this.snow.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    this.snow.visible = m > 0;
  }
}

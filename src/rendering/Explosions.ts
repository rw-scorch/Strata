import * as THREE from 'three';
import type { WorldUniforms } from './ChunkMaterial';

const CAP = 160;
interface Puff { x: number; y: number; z: number; t: number; life: number; size: number; shade: number; }

function sheet(): THREE.CanvasTexture {
  const F = 16, S = 32;
  const c = document.createElement('canvas');
  c.width = S * 4; c.height = S * 4;
  const g = c.getContext('2d')!;
  let seed = 9173;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const blobs: [number, number, number][] = [];
  for (let i = 0; i < 11; i++) blobs.push([(rnd() - 0.5) * 0.9, (rnd() - 0.5) * 0.9, 0.22 + rnd() * 0.24]);
  for (let f = 0; f < F; f++) {
    const k = f / (F - 1);
    const grow = k < 0.25 ? 0.55 + k * 1.8 : 1 - (k - 0.25) * 0.35;
    const thin = Math.max(0, (k - 0.35) / 0.65);
    const ox = (f % 4) * S, oy = Math.floor(f / 4) * S;
    for (let py = 0; py < S; py += 2) for (let px = 0; px < S; px += 2) {
      const u = (px + 1) / S * 2 - 1, v = (py + 1) / S * 2 - 1;
      let d = 0;
      for (const [bx, by, br] of blobs) { const q = Math.hypot(u - bx * grow, v - by * grow) / (br * grow * (1 - thin * 0.75)); if (q < 1) d = Math.max(d, 1 - q); }
      if (d <= 0.08 + thin * 0.2) continue;
      const hot = k < 0.2 ? 1 : 0;
      const l = Math.round((150 + d * 105) / 24) * 24;
      g.fillStyle = hot && d > 0.55 ? `rgb(255,${220 + Math.round(d * 30)},${150 + Math.round(d * 60)})` : `rgb(${Math.min(255, l)},${Math.min(255, l)},${Math.min(255, l)})`;
      g.fillRect(ox + px, oy + py, 2, 2);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.flipY = false; t.generateMipmaps = false;
  return t;
}

export class Explosions {
  readonly points: THREE.Points;
  private ps: Puff[] = [];
  private pos = new Float32Array(CAP * 3);
  private data = new Float32Array(CAP * 3);
  private geo = new THREE.BufferGeometry();
  private mat: THREE.ShaderMaterial;
  origin = new THREE.Vector3();

  constructor(u: WorldUniforms) {
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aData', new THREE.BufferAttribute(this.data, 3).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: sheet() }, uScale: { value: 600 }, uFogColor: u.uFogColor, uFogNear: u.uFogNear, uFogFar: u.uFogFar },
      vertexShader: `attribute vec3 aData; uniform float uScale; varying vec3 vData; varying float vFog;
        void main(){ vData = aData; vec4 mv = modelViewMatrix * vec4(position, 1.0); vFog = length(mv.xyz);
        gl_PointSize = clamp(aData.x * uScale / max(0.3, -mv.z), 1.0, 480.0); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D uMap; uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar; varying vec3 vData; varying float vFog;
        void main(){ float f = floor(vData.y + 0.001); vec2 cell = vec2(mod(f, 4.0), floor(f / 4.0));
          vec4 c = texture2D(uMap, (cell + clamp(gl_PointCoord, 0.01, 0.99)) / 4.0);
          if (c.a < 0.5) discard;
          gl_FragColor = vec4(mix(c.rgb * vData.z, uFogColor, smoothstep(uFogNear, uFogFar, vFog) * 0.7), 1.0); }`,
      depthWrite: true,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.geo.setDrawRange(0, 0);
  }

  setScale(px: number): void { this.mat.uniforms.uScale.value = px; }

  spawn(x: number, y: number, z: number, r: number): void {
    const room = CAP - this.ps.length;
    const n = Math.min(room, this.ps.length > 80 ? 3 : Math.max(5, Math.min(14, Math.round(r * 3))));
    for (let i = 0; i < n; i++) {
      const a = i === 0 ? 0 : 1;
      this.ps.push({
        x: x + (Math.random() - 0.5) * r * 1.1 * a, y: y + (Math.random() - 0.5) * r * 0.9 * a, z: z + (Math.random() - 0.5) * r * 1.1 * a,
        t: -Math.random() * 0.3 * a, life: 0.32 + Math.random() * 0.2, size: (1.7 + Math.random() * 1.5) * Math.min(1.4, 0.6 + r * 0.12), shade: 0.62 + Math.random() * 0.38,
      });
    }
  }

  update(dt: number): void {
    let n = 0;
    const O = this.origin;
    for (let i = this.ps.length - 1; i >= 0; i--) {
      const p = this.ps[i];
      p.t += dt;
      if (p.t >= p.life) { this.ps[i] = this.ps[this.ps.length - 1]; this.ps.pop(); }
    }
    for (const p of this.ps) {
      if (p.t < 0) continue;
      this.pos[n * 3] = p.x - O.x; this.pos[n * 3 + 1] = p.y; this.pos[n * 3 + 2] = p.z - O.z;
      this.data[n * 3] = p.size; this.data[n * 3 + 1] = Math.min(15, Math.floor((p.t / p.life) * 16)); this.data[n * 3 + 2] = p.shade;
      n++;
    }
    this.geo.setDrawRange(0, n);
    if (n) { this.geo.attributes.position.needsUpdate = true; this.geo.attributes.aData.needsUpdate = true; }
  }
}

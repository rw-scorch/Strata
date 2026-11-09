import * as THREE from 'three';
import type { WorldUniforms } from './ChunkMaterial';
import type { BlockReader } from '../core/physics';
import { isSolid } from '../core/blocks';

const MAX = 1400;

interface P { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; tile: number; su: number; sv: number; size: number; r: number; g: number; b: number; grav: number; bright: number; }

export class Particles {
  readonly points: THREE.Points;
  private ps: P[] = [];
  private pos = new Float32Array(MAX * 3);
  private data = new Float32Array(MAX * 4);
  private col = new Float32Array(MAX * 4);
  private geo: THREE.BufferGeometry;
  level: 'off' | 'low' | 'high' = 'high';

  constructor(u: WorldUniforms) {
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aData', new THREE.BufferAttribute(this.data, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aCol', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uAtlas: u.uAtlas, uAtlasGrid: u.uAtlasGrid, uScale: { value: 600 }, uFogColor: u.uFogColor, uFogNear: u.uFogNear, uFogFar: u.uFogFar },
      vertexShader: `attribute vec4 aData; attribute vec4 aCol; uniform float uScale; varying vec4 vData; varying vec4 vCol; varying float vFog;
        void main(){ vData = aData; vCol = aCol; vec4 mv = modelViewMatrix * vec4(position,1.0); vFog = length(mv.xyz);
        gl_PointSize = max(1.0, aData.w * uScale / max(0.2, -mv.z)); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D uAtlas; uniform vec2 uAtlasGrid; uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar;
        varying vec4 vData; varying vec4 vCol; varying float vFog;
        void main(){ vec4 c;
          if (vData.x >= 0.0) { float col = mod(vData.x, uAtlasGrid.x); float row = floor(vData.x / uAtlasGrid.x + 0.0001);
            vec2 f = vec2(vData.y, vData.z) + gl_PointCoord * 0.25; c = texture2D(uAtlas, (vec2(col,row) + clamp(f, 0.02, 0.98)) / uAtlasGrid);
            if (c.a < 0.5) discard; c.rgb *= vCol.rgb; }
          else { c = vec4(vCol.rgb, 1.0); }
          c.rgb *= vCol.a;
          gl_FragColor = vec4(mix(c.rgb, uFogColor, smoothstep(uFogNear, uFogFar, vFog)), 1.0); }`,
      depthWrite: true,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    this.geo.setDrawRange(0, 0);
  }

  setScale(px: number): void { (this.points.material as THREE.ShaderMaterial).uniforms.uScale.value = px; }

  private add(p: P): void {
    if (this.level === 'off') return;
    if (this.ps.length >= MAX) this.ps.shift();
    this.ps.push(p);
  }

  blockBreak(x: number, y: number, z: number, tile: number, tint: [number, number, number] | null, bright: number, many = true): void {
    if (this.level === 'off') return;
    const n = this.level === 'low' ? (many ? 6 : 2) : (many ? 18 : 4);
    for (let i = 0; i < n; i++) {
      this.add({
        x: x + (Math.random() - 0.5) * 0.8, y: y + (Math.random() - 0.5) * 0.8, z: z + (Math.random() - 0.5) * 0.8,
        vx: (Math.random() - 0.5) * 4, vy: Math.random() * 4 + 1, vz: (Math.random() - 0.5) * 4,
        life: 0, max: 0.5 + Math.random() * 0.7, tile, su: Math.floor(Math.random() * 3) * 0.25, sv: Math.floor(Math.random() * 3) * 0.25,
        size: 0.09 + Math.random() * 0.05, r: tint ? tint[0] : 1, g: tint ? tint[1] : 1, b: tint ? tint[2] : 1, grav: 18, bright,
      });
    }
  }

  puff(x: number, y: number, z: number, r: number, g: number, b: number, n: number, speed = 1.5, grav = -1, size = 0.12, life = 0.9): void {
    if (this.level === 'off') return;
    const count = this.level === 'low' ? Math.ceil(n / 3) : n;
    for (let i = 0; i < count; i++) {
      this.add({
        x: x + (Math.random() - 0.5) * 0.5, y: y + (Math.random() - 0.5) * 0.5, z: z + (Math.random() - 0.5) * 0.5,
        vx: (Math.random() - 0.5) * speed, vy: (Math.random() - 0.2) * speed, vz: (Math.random() - 0.5) * speed,
        life: 0, max: life * (0.6 + Math.random() * 0.6), tile: -1, su: 0, sv: 0, size: size * (0.7 + Math.random() * 0.6),
        r, g, b, grav, bright: 1,
      });
    }
  }

  update(dt: number, world: BlockReader): void {
    let n = 0;
    const keep: P[] = [];
    for (const p of this.ps) {
      p.life += dt;
      if (p.life >= p.max) continue;
      p.vy -= p.grav * dt;
      const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt, nz = p.z + p.vz * dt;
      if (p.grav > 0 && isSolid(world.getBlock(Math.floor(nx), Math.floor(ny), Math.floor(nz)))) {
        p.vx *= 0.3; p.vz *= 0.3; p.vy = 0;
      } else { p.x = nx; p.y = ny; p.z = nz; }
      keep.push(p);
      this.pos[n * 3] = p.x; this.pos[n * 3 + 1] = p.y; this.pos[n * 3 + 2] = p.z;
      this.data[n * 4] = p.tile; this.data[n * 4 + 1] = p.su; this.data[n * 4 + 2] = p.sv; this.data[n * 4 + 3] = p.size * (p.tile < 0 ? 1 - p.life / p.max * 0.5 : 1);
      this.col[n * 4] = p.r; this.col[n * 4 + 1] = p.g; this.col[n * 4 + 2] = p.b; this.col[n * 4 + 3] = p.bright;
      n++;
    }
    this.ps = keep;
    this.geo.setDrawRange(0, n);
    for (const name of ['position', 'aData', 'aCol']) (this.geo.getAttribute(name) as THREE.BufferAttribute).needsUpdate = true;
  }
}

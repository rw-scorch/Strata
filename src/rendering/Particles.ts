import * as THREE from 'three';
import type { WorldUniforms } from './ChunkMaterial';
import type { BlockReader } from '../core/physics';
import { isSolid, BLOCKS, blockId, isBaseId, ID_LIMIT, CB, DRIP_DOWN } from '../core/blocks';

const MAX = 1400;

interface P { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; tile: number; su: number; sv: number; size: number; r: number; g: number; b: number; grav: number; bright: number; wander?: number; glow?: number; leaf?: boolean; }

export interface AmbientEnv { night: number; cave: number; rain: number; underwater: boolean; fx?: string | null; fxAmt?: number; day?: number; dust?: [number, number, number]; }
const LEAVES = new Uint8Array(ID_LIMIT);
for (const b of BLOCKS) if (b && isBaseId(b.id) && b.render === "leaves") LEAVES[b.id] = 1;

export class Particles {
  readonly points: THREE.Points;
  private ps: P[] = [];
  private pos = new Float32Array(MAX * 3);
  private data = new Float32Array(MAX * 4);
  private col = new Float32Array(MAX * 4);
  private geo: THREE.BufferGeometry;
  level: 'off' | 'low' | 'high' = 'high';
  fallingLeaves = true;
  leafLook: ((id: number) => { tile: number; r: number; g: number; b: number }) | null = null;
  private leafT = 0;

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
          else { c = vec4(vCol.rgb, 1.0); if (vData.y > 1.5) { float r = length(gl_PointCoord - 0.5); float a = (1.0 - r * 2.0) * 0.6; if (fract(sin(dot(floor(gl_FragCoord.xy * 0.5), vec2(12.9898, 78.233))) * 43758.5453) > a) discard; } else if (vData.y > 0.5) { float r = length(gl_PointCoord - 0.5); if (r > 0.5) discard; c.rgb *= 1.0 - r * 1.4; } }
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
    if (this.ps.length >= MAX) { this.ps[this.head] = p; this.head = (this.head + 1) % MAX; return; }
    this.ps.push(p);
  }
  private head = 0;
  private ambT = 0;
  private mistScanT = 9;
  private mistPts: number[] = [];
  private mistT = 0;
  private caveScanT = 9;
  private spores: number[] = [];
  private drips: number[] = [];
  private sporeT = 0;
  private dripT = 0;

  ambient(dt: number, cx: number, cy: number, cz: number, env: AmbientEnv, world: BlockReader): void {
    if (this.level === 'off') return;
    this.ambT += dt;
    const rate = this.level === 'low' ? 0.08 : 0.035;
    while (this.ambT > rate) {
      this.ambT -= rate;
      const x = cx + (Math.random() - 0.5) * 28, z = cz + (Math.random() - 0.5) * 28, y = cy + (Math.random() - 0.4) * 12;
      const here = world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z));
      if (blockId(here) !== 0) continue;
      const roll = Math.random();
      const ff = env.fx === 'fireflies' ? (env.fxAmt ?? 0) : 0;
      if (env.night > 0.6 - ff * 0.3 && env.rain < 0.2 && !env.underwater && env.cave < 0.3 && roll < 0.35 + ff * 0.4) {
        let ground = false;
        for (let k = 1; k <= 3 && !ground; k++) ground = isSolid(world.getBlock(Math.floor(x), Math.floor(y) - k, Math.floor(z)));
        if (!ground) continue;
        this.add({ x, y, z, vx: 0, vy: 0, vz: 0, life: 0, max: 4 + Math.random() * 4, tile: -1, su: 1, sv: 0, size: 0.06, r: 0.75, g: 1, b: 0.35, grav: 0, bright: 1.8, wander: 0.8, glow: Math.random() * 6 });
      } else if (env.cave > 0.5 && roll < 0.5) {
        this.add({ x, y, z, vx: (Math.random() - 0.5) * 0.1, vy: (Math.random() - 0.5) * 0.06, vz: (Math.random() - 0.5) * 0.1, life: 0, max: 5 + Math.random() * 4, tile: -1, su: 1, sv: 0, size: 0.025, r: 0.8, g: 0.78, b: 0.72, grav: 0, bright: 0.5, wander: 0.08 });
      } else if (roll < 0.6 && env.cave < 0.5 && !this.fallingLeaves) {
        const above = world.getBlock(Math.floor(x), Math.floor(y) + 1, Math.floor(z));
        if (!LEAVES[blockId(above)]) continue;
        this.add({ x, y: Math.floor(y) + 0.95, z, vx: 0, vy: -0.4, vz: 0, life: 0, max: 6, tile: -1, su: 0, sv: 0, size: 0.07, r: 0.32, g: 0.5, b: 0.18, grav: 0, bright: 0.85, wander: 0.6 });
      }
    }
    if (env.fx && env.fx !== 'fireflies' && env.cave < 0.5 && !env.underwater) this.biomeFx(dt, cx, cy, cz, env, world);
    this.caveScanT += dt;
    if (this.caveScanT > 1.5) {
      this.caveScanT = 0;
      const sp: number[] = [], dr: number[] = [];
      const bx = Math.floor(cx), by = Math.floor(cy), bz = Math.floor(cz);
      for (let dz = -10; dz <= 10; dz++) for (let dx = -10; dx <= 10; dx++) for (let dy = -6; dy <= 10; dy++) {
        const v = world.getBlock(bx + dx, by + dy, bz + dz), id = blockId(v);
        if (id === CB.SPORE_BLOSSOM && sp.length < 60) sp.push(bx + dx, by + dy, bz + dz);
        else if (id === CB.POINTED_DRIPSTONE && (v >>> 8 & DRIP_DOWN) && ((v >>> 8) & 7) === 1 && dr.length < 90) dr.push(bx + dx, by + dy, bz + dz);
      }
      this.spores = sp; this.drips = dr;
    }
    if (this.spores.length && !env.underwater) {
      this.sporeT += dt * this.spores.length / 3 * (this.level === 'low' ? 1.5 : 5);
      while (this.sporeT >= 1) {
        this.sporeT -= 1;
        const i = Math.floor(Math.random() * this.spores.length / 3) * 3;
        this.add({ x: this.spores[i] + 0.5 + (Math.random() - 0.5) * 9, y: this.spores[i + 1] + 0.8 - Math.random() * 1.5, z: this.spores[i + 2] + 0.5 + (Math.random() - 0.5) * 9, vx: 0, vy: -0.25, vz: 0, life: 0, max: 7 + Math.random() * 4, tile: -1, su: 1, sv: 0, size: 0.025, r: 0.55, g: 0.9, b: 0.4, grav: 0, bright: 1.2, wander: 0.25 });
      }
    }
    if (this.drips.length && !env.underwater) {
      this.dripT += dt * this.drips.length / 3 * 0.35;
      while (this.dripT >= 1) {
        this.dripT -= 1;
        const i = Math.floor(Math.random() * this.drips.length / 3) * 3;
        this.add({ x: this.drips[i] + 0.5, y: this.drips[i + 1] + 0.3, z: this.drips[i + 2] + 0.5, vx: 0, vy: -0.2, vz: 0, life: 0, max: 2.2, tile: -1, su: 1, sv: 0, size: 0.035, r: 0.55, g: 0.7, b: 1, grav: 9, bright: 0.9 });
      }
    }
    this.mistScanT += dt;
    if (this.mistScanT > 1.2) {
      this.mistScanT = 0;
      const pts: number[] = [];
      const bx = Math.floor(cx), by = Math.floor(cy), bz = Math.floor(cz);
      for (let dz = -14; dz <= 14 && pts.length < 96; dz++) for (let dx = -14; dx <= 14 && pts.length < 96; dx++) {
        let prevFall = false;
        for (let y = by + 12; y >= by - 12; y--) {
          const v = world.getBlock(bx + dx, y, bz + dz);
          const fall = blockId(v) === 12 && ((v >>> 8) & 8) !== 0;
          if (prevFall && !fall) { const X = bx + dx, Z = bz + dz; if (blockId(world.getBlock(X + 1, y + 1, Z)) === 0 || blockId(world.getBlock(X - 1, y + 1, Z)) === 0 || blockId(world.getBlock(X, y + 1, Z + 1)) === 0 || blockId(world.getBlock(X, y + 1, Z - 1)) === 0) pts.push(X, y + 1, Z); break; }
          prevFall = fall;
        }
      }
      this.mistPts = pts;
    }
    if (this.mistPts.length && !env.underwater) {
      this.mistT += dt;
      const n = this.mistPts.length / 3, mrate = (this.level === 'low' ? 0.12 : 0.03) / Math.min(4, Math.sqrt(n));
      while (this.mistT > mrate) {
        this.mistT -= mrate;
        const i = Math.floor(Math.random() * n) * 3;
        const a = Math.random() * Math.PI * 2, rr = 0.55 + Math.random() * 0.35, sp = 0.6 + Math.random() * 1.4;
        const px = this.mistPts[i] + 0.5 + Math.cos(a) * rr, py = this.mistPts[i + 1] + 0.1, pz = this.mistPts[i + 2] + 0.5 + Math.sin(a) * rr;
        if (Math.random() < 0.55) this.add({ x: px, y: py, z: pz, vx: Math.cos(a) * sp, vy: 1.6 + Math.random() * 1.8, vz: Math.sin(a) * sp, life: 0, max: 0.6 + Math.random() * 0.4, tile: -1, su: 0, sv: 0, size: 0.05 + Math.random() * 0.03, r: 0.9, g: 0.96, b: 1, grav: 9, bright: 1.25, wander: 0 });
        else this.add({ x: px, y: py + Math.random() * 0.6, z: pz, vx: Math.cos(a) * 0.5, vy: 0.5 + Math.random() * 0.5, vz: Math.sin(a) * 0.5, life: 0, max: 1.6 + Math.random() * 1.2, tile: -1, su: 2, sv: 0, size: 0.35 + Math.random() * 0.3, r: 0.92, g: 0.96, b: 1, grav: -0.1, bright: 1.15, wander: 0.5 });
      }
    }
    if (this.fallingLeaves && env.cave < 0.5 && !env.underwater) {
      this.leafT += dt;
      const lrate = (this.level === 'low' ? 0.05 : 0.016) * (env.rain > 0.3 ? 0.6 : 1);
      let tries = 0;
      while (this.leafT > lrate && tries++ < 40) {
        this.leafT -= lrate;
        const x = Math.floor(cx + (Math.random() - 0.5) * 40), z = Math.floor(cz + (Math.random() - 0.5) * 40);
        let y = Math.floor(cy + 10);
        let leaf = 0;
        for (let k = 0; k < 22; k++, y--) { const v = world.getBlock(x, y, z); if (LEAVES[blockId(v)]) { leaf = blockId(v); break; } }
        if (!leaf || blockId(world.getBlock(x, y - 1, z)) !== 0) continue;
        const look = this.leafLook?.(leaf) ?? { tile: -1, r: 0.36, g: 0.56, b: 0.2 };
        this.add({ x: x + Math.random(), y: y - 0.05, z: z + Math.random(), vx: (Math.random() - 0.5) * 0.4 + (env.rain > 0.3 ? 0.8 : 0.2), vy: -0.5 - Math.random() * 0.3, vz: (Math.random() - 0.5) * 0.4, life: 0, max: 9 + Math.random() * 4, tile: look.tile, su: Math.floor(Math.random() * 3) * 0.25, sv: Math.floor(Math.random() * 3) * 0.25, size: 0.13 + Math.random() * 0.05, r: look.r, g: look.g, b: look.b, grav: 0, bright: 0.9, wander: 0.9, leaf: true });
      }
    }
  }

  private fxT = 0;
  private biomeFx(dt: number, cx: number, cy: number, cz: number, env: AmbientEnv, world: BlockReader): void {
    const amt = env.fxAmt ?? 1, day = env.day ?? 1, fx = env.fx;
    let rate = 0;
    if (fx === 'petals') rate = 22 * (1 - env.rain * 0.6);
    else if (fx === 'spores') rate = 16;
    else if (fx === 'dust') rate = 14 * Math.max(0, day - 0.3) * (1 - env.rain);
    else if (fx === 'pollen') rate = 8 * Math.max(0, day - 0.4) * (1 - env.rain);
    else if (fx === 'sparkle') rate = 18 * (1 - env.rain);
    rate *= amt * (this.level === 'low' ? 0.35 : 1);
    if (rate <= 0) return;
    this.fxT += dt * rate;
    let tries = 0;
    while (this.fxT >= 1 && tries++ < 24) {
      this.fxT -= 1;
      const x = cx + (Math.random() - 0.5) * 30, z = cz + (Math.random() - 0.5) * 30;
      const y = fx === 'petals' || fx === 'sparkle' ? cy + 2 + Math.random() * 9 : cy - 2 + Math.random() * 7;
      const bx = Math.floor(x), by = Math.floor(y), bz = Math.floor(z);
      if (blockId(world.getBlock(bx, by, bz)) !== 0) continue;
      let open = true;
      for (let k = 1; k < 12 && open; k++) { const id = blockId(world.getBlock(bx, by + k, bz)); if (id !== 0 && !LEAVES[id]) open = false; }
      if (!open && fx !== 'spores') continue;
      if (fx === 'petals') {
        const pk = Math.random();
        this.add({ x, y, z, vx: 0.35 + Math.random() * 0.3, vy: -0.45 - Math.random() * 0.25, vz: (Math.random() - 0.5) * 0.3, life: 0, max: 10 + Math.random() * 5, tile: -1, su: 0, sv: 0, size: 0.045 + Math.random() * 0.02, r: 1, g: 0.66 + pk * 0.16, b: 0.8 + pk * 0.1, grav: 0, bright: 1.05, wander: 0.7, leaf: true });
      } else if (fx === 'spores') {
        this.add({ x, y, z, vx: (Math.random() - 0.5) * 0.1, vy: 0.08 + Math.random() * 0.12, vz: (Math.random() - 0.5) * 0.1, life: 0, max: 6 + Math.random() * 5, tile: -1, su: 1, sv: 0, size: 0.03 + Math.random() * 0.015, r: 0.82, g: 0.72, b: 0.95, grav: -0.01, bright: 0.9 + env.night * 0.6, wander: 0.12, glow: Math.random() * 6 });
      } else if (fx === 'dust') {
        const c = env.dust ?? [0.95, 0.8, 0.6];
        this.add({ x, y, z, vx: 0.9 + Math.random() * 0.8, vy: (Math.random() - 0.5) * 0.15, vz: 0.3 + (Math.random() - 0.5) * 0.4, life: 0, max: 5 + Math.random() * 3, tile: -1, su: 2, sv: 0, size: 0.06 + Math.random() * 0.06, r: c[0], g: c[1], b: c[2], grav: 0, bright: 0.85, wander: 0.25 });
      } else if (fx === 'pollen') {
        this.add({ x, y, z, vx: (Math.random() - 0.5) * 0.15, vy: (Math.random() - 0.3) * 0.08, vz: (Math.random() - 0.5) * 0.15, life: 0, max: 6 + Math.random() * 4, tile: -1, su: 1, sv: 0, size: 0.018 + Math.random() * 0.01, r: 1, g: 0.97, b: 0.75, grav: 0, bright: 1.3, wander: 0.18 });
      } else if (fx === 'sparkle') {
        this.add({ x, y, z, vx: 0.08, vy: -0.12 - Math.random() * 0.08, vz: 0, life: 0, max: 6 + Math.random() * 4, tile: -1, su: 0, sv: 0, size: 0.02, r: 0.92, g: 0.96, b: 1, grav: 0, bright: 2.2, wander: 0.08, glow: Math.random() * 6 });
      }
    }
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
    const ps = this.ps;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      p.life += dt;
      if (p.life >= p.max) continue;
      if (p.wander) {
        p.vx += (Math.random() - 0.5) * p.wander * dt * 6; p.vz += (Math.random() - 0.5) * p.wander * dt * 6; p.vy += (Math.random() - 0.5) * p.wander * dt * 3;
        const damp = Math.max(0, 1 - dt * 1.5); p.vx *= damp; p.vz *= damp; if (!p.grav && !p.leaf) p.vy *= damp;
        if (p.leaf) { p.vy = Math.max(-0.9, Math.min(-0.25, p.vy)); p.vx += Math.sin(p.life * 2.3 + p.max) * dt * 0.8; }
      }
      p.vy -= p.grav * dt;
      const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt, nz = p.z + p.vz * dt;
      if ((p.grav > 0 || p.wander) && isSolid(world.getBlock(Math.floor(nx), Math.floor(ny), Math.floor(nz)))) {
        p.vx *= 0.3; p.vz *= 0.3; p.vy = 0;
        if (p.wander && p.life < p.max - 0.6) p.max = p.life + (p.leaf ? 2.5 : 0.6);
      } else { p.x = nx; p.y = ny; p.z = nz; }
      ps[n] = p;
      const fade = p.glow !== undefined ? Math.max(0, Math.sin(p.life * 2.2 + p.glow)) * Math.min(1, (p.max - p.life) * 2, p.life * 2) : 1;
      this.pos[n * 3] = p.x; this.pos[n * 3 + 1] = p.y; this.pos[n * 3 + 2] = p.z;
      this.data[n * 4] = p.tile; this.data[n * 4 + 1] = p.su; this.data[n * 4 + 2] = p.sv; this.data[n * 4 + 3] = p.size * (p.tile < 0 && !p.wander ? 1 - p.life / p.max * 0.5 : 1);
      this.col[n * 4] = p.r; this.col[n * 4 + 1] = p.g; this.col[n * 4 + 2] = p.b; this.col[n * 4 + 3] = p.bright * fade;
      n++;
    }
    ps.length = n;
    if (this.head >= n) this.head = 0;
    this.geo.setDrawRange(0, n);
    for (const name of ['position', 'aData', 'aCol']) {
      const a = this.geo.getAttribute(name) as THREE.BufferAttribute;
      a.clearUpdateRanges();
      if (n) a.addUpdateRange(0, n * a.itemSize);
      a.needsUpdate = true;
    }
  }
}

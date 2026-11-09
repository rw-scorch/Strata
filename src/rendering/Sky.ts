import * as THREE from 'three';
import { TICKS_PER_DAY } from '../core/constants';
import type { TextureAtlas } from '../resources/TextureAtlas';

export interface SkyState {
  sunDir: THREE.Vector3;
  day: number;
  skyTop: THREE.Color;
  horizon: THREE.Color;
  skyLight: THREE.Color;
  night: number;
}

const DAY_TOP = new THREE.Color(0.36, 0.58, 1.0);
const DAY_HOR = new THREE.Color(0.72, 0.84, 1.0);
const SET_HOR = new THREE.Color(1.0, 0.55, 0.3);
const NIGHT_TOP = new THREE.Color(0.01, 0.015, 0.05);
const NIGHT_HOR = new THREE.Color(0.03, 0.04, 0.09);
const RAIN_TOP = new THREE.Color(0.32, 0.36, 0.42);
const RAIN_HOR = new THREE.Color(0.48, 0.52, 0.58);

export function computeSky(time: number, rain: number, thunder: number): SkyState {
  const t = (time % TICKS_PER_DAY) / TICKS_PER_DAY;
  const a = t * Math.PI * 2;
  const sunDir = new THREE.Vector3(Math.cos(a), Math.sin(a), 0.25).normalize();
  const elev = Math.sin(a);
  let day = THREE.MathUtils.clamp(elev * 1.6 + 0.5, 0, 1);
  const night = 1 - THREE.MathUtils.clamp(elev * 4 + 0.6, 0, 1);
  const sunset = Math.max(0, 1 - Math.abs(elev) * 5) * (elev > -0.25 ? 1 : 0);
  const skyTop = NIGHT_TOP.clone().lerp(DAY_TOP, day);
  const horizon = NIGHT_HOR.clone().lerp(DAY_HOR, day).lerp(SET_HOR, sunset * 0.6);
  if (rain > 0) {
    skyTop.lerp(RAIN_TOP.clone().multiplyScalar(0.25 + day * 0.75), rain * 0.85);
    horizon.lerp(RAIN_HOR.clone().multiplyScalar(0.25 + day * 0.75), rain * 0.85);
    day *= 1 - rain * 0.25 - thunder * 0.2;
  }
  const skyLight = new THREE.Color(1, 1, 1).lerp(new THREE.Color(1, 0.8, 0.65), sunset * 0.5).lerp(new THREE.Color(0.6, 0.65, 0.9), night * 0.5);
  return { sunDir, day: Math.max(0.06, day), skyTop, horizon, skyLight, night };
}

export class Sky {
  readonly group = new THREE.Group();
  private dome: THREE.Mesh;
  private sun: THREE.Mesh;
  private moon: THREE.Mesh;
  private stars: THREE.Points;
  private clouds: THREE.Mesh;
  private domeMat: THREE.ShaderMaterial;
  private cloudMat: THREE.ShaderMaterial;
  private starMat!: THREE.ShaderMaterial;
  cloudsEnabled = true;
  aurora = 0;
  private t = 0;

  constructor(atlas: TextureAtlas) {
    this.domeMat = new THREE.ShaderMaterial({
      uniforms: {
        uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uSun: { value: new THREE.Vector3() }, uGlow: { value: 1 },
        uNight: { value: 0 }, uTime: { value: 0 }, uAurora: { value: 0 }, uStarRot: { value: 0 }, uRain: { value: 0 },
      },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uSun; uniform float uGlow; uniform float uNight; uniform float uTime; uniform float uAurora; uniform float uStarRot; uniform float uRain;
        varying vec3 vDir;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
        float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += vnoise(p) * a; p *= 2.03; a *= 0.5; } return s; }
        void main(){
          vec3 d = normalize(vDir);
          float h = clamp(d.y, -0.2, 1.0);
          vec3 c = mix(uHorizon, uTop, smoothstep(-0.05, 0.55, h));
          float sd = max(dot(d, uSun), 0.0);
          float sunUp = smoothstep(-0.25, 0.1, uSun.y);
          float low = clamp(1.0 - abs(uSun.y) * 3.5, 0.0, 1.0);
          vec2 az = normalize(d.xz + 1e-4), saz = normalize(uSun.xz + 1e-4);
          float band = low * pow(1.0 - abs(h), 5.0) * pow(max(dot(az, saz), 0.0), 2.0) * sunUp;
          c += vec3(1.0, 0.42, 0.18) * band * 0.55 * uGlow;
          c += vec3(1.0, 0.82, 0.55) * (pow(sd, 10.0) * 0.28 + pow(sd, 90.0) * 0.45) * uGlow * sunUp;
          float md = max(dot(d, -uSun), 0.0);
          c += vec3(0.55, 0.65, 0.95) * pow(md, 40.0) * 0.18 * uNight * uGlow;
          float cr = cos(uStarRot), sr = sin(uStarRot);
          vec3 r = vec3(d.x * cr + d.y * sr, -d.x * sr + d.y * cr, d.z);
          float mw = exp(-pow(dot(r, normalize(vec3(0.35, 0.25, 0.9))) / 0.16, 2.0));
          c += vec3(0.5, 0.55, 0.75) * mw * (0.35 + 0.65 * fbm(r.xy * 6.0 + r.z * 3.0)) * 0.1 * uNight * uGlow * smoothstep(0.0, 0.2, h);
          if (uAurora > 0.01 && h > 0.0) {
            vec2 p = d.xz / (h + 0.18);
            float a = 0.0;
            for (int i = 0; i < 3; i++) {
              float fi = float(i);
              float n = fbm(vec2(p.x * 0.6 + fi * 3.1 + uTime * 0.02, p.y * 0.25 + uTime * 0.01));
              float curtain = smoothstep(0.08, 0.0, abs(p.y + 1.6 + fi * 0.5 + (n - 0.5) * 1.6));
              a += curtain * (0.6 + 0.4 * sin(p.x * 3.0 + uTime * 0.6 + fi)) * (1.0 - fi * 0.25);
            }
            vec3 ac = mix(vec3(0.1, 1.0, 0.45), vec3(0.45, 0.25, 1.0), smoothstep(0.1, 0.5, h));
            c += ac * a * 0.35 * uAurora * uNight * uGlow * smoothstep(0.0, 0.15, h);
          }
          if (h < -0.02) c = mix(c, uHorizon * 0.6, smoothstep(-0.02, -0.2, h));
          gl_FragColor = vec4(c, 1.0); }`,
      side: THREE.BackSide, depthWrite: false, depthTest: false,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(450, 24, 16), this.domeMat);
    this.dome.renderOrder = -20;
    this.dome.frustumCulled = false;
    const sprite = (tex: THREE.Texture, size: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, fog: false }));
      m.renderOrder = -19;
      m.frustumCulled = false;
      return m;
    };
    this.sun = sprite(atlas.sunTexture, 70);
    this.moon = sprite(atlas.moonTexture, 50);
    const sg = new THREE.BufferGeometry();
    const pts: number[] = [];
    const rnds: number[] = [];
    let s = 1234567;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let i = 0; i < 900; i++) {
      const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      pts.push(r * Math.cos(th) * 420, Math.abs(u) * 420, r * Math.sin(th) * 420);
      rnds.push(rnd());
    }
    sg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    sg.setAttribute('aRnd', new THREE.Float32BufferAttribute(rnds, 1));
    this.starMat = new THREE.ShaderMaterial({
      uniforms: { uOpacity: { value: 0 }, uTime: { value: 0 }, uPx: { value: 1 } },
      vertexShader: `attribute float aRnd; uniform float uTime; uniform float uPx; varying float vA;
        void main(){ vA = (0.55 + 0.45 * sin(uTime * (1.5 + aRnd * 3.0) + aRnd * 60.0)) * (0.4 + aRnd * 0.6);
          gl_PointSize = (1.0 + aRnd * aRnd * 1.6) * uPx; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: 'uniform float uOpacity; varying float vA; void main(){ gl_FragColor = vec4(vec3(1.0, 0.97, 0.92), vA * uOpacity); }',
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    });
    this.stars = new THREE.Points(sg, this.starMat);
    this.stars.renderOrder = -19;
    this.stars.frustumCulled = false;
    this.cloudMat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: atlas.cloudTexture }, uOffset: { value: new THREE.Vector2() }, uColor: { value: new THREE.Color(1, 1, 1) }, uFogColor: { value: new THREE.Color() }, uOpacity: { value: 0.8 } },
      vertexShader: 'varying vec2 vUv; varying float vD; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.0); vD = length(mv.xz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: `uniform sampler2D uMap; uniform vec2 uOffset; uniform vec3 uColor; uniform vec3 uFogColor; uniform float uOpacity; varying vec2 vUv; varying float vD;
        void main(){ vec4 t = texture2D(uMap, vUv * 4.0 + uOffset); if (t.a < 0.4) discard;
        float f = smoothstep(120.0, 380.0, vD); gl_FragColor = vec4(mix(uColor, uFogColor, f), uOpacity * (1.0 - f)); }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    this.clouds = new THREE.Mesh(new THREE.PlaneGeometry(1024, 1024), this.cloudMat);
    this.clouds.rotation.x = -Math.PI / 2;
    this.clouds.renderOrder = 5;
    this.clouds.frustumCulled = false;
    this.group.add(this.dome, this.stars, this.sun, this.moon);
  }

  get cloudMesh(): THREE.Mesh { return this.clouds; }

  setTextures(atlas: TextureAtlas): void {
    (this.sun.material as THREE.MeshBasicMaterial).map = atlas.sunTexture;
    (this.moon.material as THREE.MeshBasicMaterial).map = atlas.moonTexture;
    this.cloudMat.uniforms.uMap.value = atlas.cloudTexture;
  }

  update(camera: THREE.Camera, state: SkyState, time: number, rain: number): void {
    const cp = camera.position;
    this.group.position.copy(cp);
    this.domeMat.uniforms.uTop.value.copy(state.skyTop);
    this.domeMat.uniforms.uHorizon.value.copy(state.horizon);
    this.domeMat.uniforms.uSun.value.copy(state.sunDir);
    this.domeMat.uniforms.uGlow.value = 1 - rain;
    const sd = state.sunDir;
    this.sun.position.copy(sd).multiplyScalar(380);
    this.sun.lookAt(0, 0, 0);
    this.moon.position.copy(sd).multiplyScalar(-380);
    this.moon.lookAt(0, 0, 0);
    (this.sun.material as THREE.MeshBasicMaterial).opacity = 1 - rain;
    (this.moon.material as THREE.MeshBasicMaterial).opacity = 1 - rain;
    this.t += 1 / 60;
    this.starMat.uniforms.uOpacity.value = state.night * (1 - rain) * 0.95;
    this.starMat.uniforms.uTime.value = this.t;
    this.starMat.uniforms.uPx.value = Math.min(2, window.devicePixelRatio || 1);
    this.stars.rotation.z = (time / 24000) * Math.PI * 2;
    const du = this.domeMat.uniforms;
    du.uNight.value = state.night; du.uTime.value = this.t; du.uAurora.value = this.aurora; du.uStarRot.value = this.stars.rotation.z; du.uRain.value = rain;
    this.clouds.visible = this.cloudsEnabled;
    this.clouds.position.set(cp.x, 132, cp.z);
    this.cloudMat.uniforms.uOffset.value.x = ((cp.x + time * 0.03) / 256) % 1;
    this.cloudMat.uniforms.uOffset.value.y = (-cp.z / 256) % 1;
    const cc = new THREE.Color(1, 1, 1).multiplyScalar(0.25 + state.day * 0.75);
    if (rain) cc.lerp(new THREE.Color(0.45, 0.47, 0.5), rain * 0.7);
    this.cloudMat.uniforms.uColor.value.copy(cc);
    this.cloudMat.uniforms.uFogColor.value.copy(state.horizon);
  }
}

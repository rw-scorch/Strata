import * as THREE from 'three';

export interface PostConfig {
  msaa: number;
  bloom: number;
  godRays: boolean;
  ssao: boolean;
  fog: boolean;
  dof: boolean;
  motionBlur: number;
  autoExposure: boolean;
  fxaa: boolean;
  vignette: boolean;
  grain: boolean;
  chromatic: boolean;
  lensFlare: boolean;
  filmic: boolean;
  saturation: number;
  contrast: number;
  sceneTextures: boolean;
}

export interface PostFrame {
  camera: THREE.PerspectiveCamera;
  sunDir: THREE.Vector3;
  sunColor: THREE.Color;
  fogColor: THREE.Color;
  day: number;
  night: number;
  rain: number;
  underwater: number;
  lava: number;
  flash: number;
  time: number;
  dt: number;
  cave: number;
  lensRain: number;
}

const VERT = 'varying vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }';

const LIN = /* glsl */ `
uniform float uNear; uniform float uFar;
float linZ(float d) { float z = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
`;

function pass(frag: string, uniforms: Record<string, THREE.IUniform>, defines: Record<string, string | number> = {}): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, defines, depthTest: false, depthWrite: false });
}

export class PostFX {
  private gl: THREE.WebGLRenderer;
  readonly hdr: boolean;
  sceneRT: THREE.WebGLRenderTarget;
  private halfRT: THREE.WebGLRenderTarget;
  private down: THREE.WebGLRenderTarget[] = [];
  private up: THREE.WebGLRenderTarget[] = [];
  private raysRT: THREE.WebGLRenderTarget;
  private aoRT: THREE.WebGLRenderTarget;
  private expRT: THREE.WebGLRenderTarget[];
  ldrRT: THREE.WebGLRenderTarget;
  private quadScene = new THREE.Scene();
  private quadCam = new THREE.Camera();
  private quad: THREE.Mesh;
  private mDown: THREE.ShaderMaterial;
  private mBloomDown: THREE.ShaderMaterial;
  private mBloomUp: THREE.ShaderMaterial;
  private mRays: THREE.ShaderMaterial;
  private mAO: THREE.ShaderMaterial;
  private mExp: THREE.ShaderMaterial;
  private mComp: THREE.ShaderMaterial;
  private mFinal: THREE.ShaderMaterial;
  private expIdx = 0;
  private prevVP = new THREE.Matrix4();
  private invVP = new THREE.Matrix4();
  private tmp = new THREE.Matrix4();
  private size = new THREE.Vector2(1, 1);
  cfg: PostConfig;
  needsFinal = false;

  constructor(gl: THREE.WebGLRenderer, cfg: PostConfig) {
    this.gl = gl;
    this.cfg = cfg;
    const ctx = gl.getContext() as WebGL2RenderingContext;
    this.hdr = !!(ctx.getExtension('EXT_color_buffer_half_float') || ctx.getExtension('EXT_color_buffer_float'));
    const type = this.hdr ? THREE.HalfFloatType : THREE.UnsignedByteType;
    const rt = (w: number, h: number, o: Partial<THREE.RenderTargetOptions> = {}) => new THREE.WebGLRenderTarget(w, h, { type, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, ...o });
    this.sceneRT = rt(1, 1, { depthBuffer: true, samples: Math.max(cfg.sceneTextures ? 1 : 0, cfg.msaa) });
    this.sceneRT.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
    this.halfRT = rt(1, 1, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
    for (let i = 0; i < 5; i++) { this.down.push(rt(1, 1)); this.up.push(rt(1, 1)); }
    this.raysRT = rt(1, 1);
    this.aoRT = rt(1, 1, { type: THREE.UnsignedByteType });
    this.expRT = [rt(1, 1, { type: THREE.HalfFloatType }), rt(1, 1, { type: THREE.HalfFloatType })];
    if (!this.hdr) this.expRT = [rt(1, 1, { type: THREE.UnsignedByteType }), rt(1, 1, { type: THREE.UnsignedByteType })];
    this.ldrRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.UnsignedByteType, depthBuffer: true, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.quad = new THREE.Mesh(g);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);

    const texel = () => ({ value: new THREE.Vector2() });
    this.mDown = pass(`uniform sampler2D uSrc; uniform vec2 uTexel; varying vec2 vUv;
      void main(){ vec2 o = uTexel * 0.5;
        vec3 c = texture2D(uSrc, vUv + vec2(-o.x, -o.y)).rgb + texture2D(uSrc, vUv + vec2(o.x, -o.y)).rgb + texture2D(uSrc, vUv + vec2(-o.x, o.y)).rgb + texture2D(uSrc, vUv + vec2(o.x, o.y)).rgb;
        gl_FragColor = vec4(c * 0.25, 1.0); }`, { uSrc: { value: null }, uTexel: texel() });
    this.mBloomDown = pass(`uniform sampler2D uSrc; uniform vec2 uTexel; uniform float uThreshold; uniform float uFirst; varying vec2 vUv;
      vec3 thr(vec3 c){ float b = max(c.r, max(c.g, c.b)); float k = uThreshold * 0.5; float s = clamp(b - uThreshold + k, 0.0, 2.0 * k); s = s * s / (4.0 * k + 1e-4); return c * max(s, b - uThreshold) / max(b, 1e-4); }
      void main(){ vec2 o = uTexel;
        vec3 c = texture2D(uSrc, vUv).rgb * 4.0 + texture2D(uSrc, vUv + vec2(-o.x, -o.y)).rgb + texture2D(uSrc, vUv + vec2(o.x, -o.y)).rgb + texture2D(uSrc, vUv + vec2(-o.x, o.y)).rgb + texture2D(uSrc, vUv + vec2(o.x, o.y)).rgb;
        c /= 8.0; if (any(isnan(c)) || any(isinf(c))) c = vec3(0.0); c = clamp(c, 0.0, 48.0); if (uFirst > 0.5) c = thr(c); gl_FragColor = vec4(c, 1.0); }`, { uSrc: { value: null }, uTexel: texel(), uThreshold: { value: 0.85 }, uFirst: { value: 0 } });
    this.mBloomUp = pass(`uniform sampler2D uSrc; uniform sampler2D uBase; uniform vec2 uTexel; varying vec2 vUv;
      void main(){ vec2 o = uTexel;
        vec3 c = texture2D(uSrc, vUv + vec2(-o.x * 2.0, 0.0)).rgb + texture2D(uSrc, vUv + vec2(o.x * 2.0, 0.0)).rgb + texture2D(uSrc, vUv + vec2(0.0, -o.y * 2.0)).rgb + texture2D(uSrc, vUv + vec2(0.0, o.y * 2.0)).rgb;
        c += (texture2D(uSrc, vUv + vec2(-o.x, o.y)).rgb + texture2D(uSrc, vUv + vec2(o.x, o.y)).rgb + texture2D(uSrc, vUv + vec2(-o.x, -o.y)).rgb + texture2D(uSrc, vUv + vec2(o.x, -o.y)).rgb) * 2.0;
        gl_FragColor = vec4(c / 12.0 + texture2D(uBase, vUv).rgb, 1.0); }`, { uSrc: { value: null }, uBase: { value: null }, uTexel: texel() });
    this.mRays = pass(`uniform sampler2D uDepth; uniform vec2 uSun; uniform vec3 uColor; uniform float uStrength; uniform float uAspect; varying vec2 vUv;
      float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
      void main(){
        vec2 d = (uSun - vUv) / 28.0; vec2 p = vUv + d * ign(gl_FragCoord.xy); float acc = 0.0, w = 1.0;
        for (int i = 0; i < 28; i++) { vec2 q = p; float sky = step(0.99999, texture2D(uDepth, clamp(q, 0.0, 1.0)).r);
          vec2 dd = (q - uSun) * vec2(uAspect, 1.0); acc += sky * w * exp(-dot(dd, dd) * 6.0); w *= 0.965; p += d; }
        gl_FragColor = vec4(uColor * acc / 28.0 * uStrength, 1.0); }`, { uDepth: { value: null }, uSun: { value: new THREE.Vector2() }, uColor: { value: new THREE.Color() }, uStrength: { value: 0 }, uAspect: { value: 1 } });
    this.mAO = pass(`${LIN} uniform sampler2D uDepth; uniform vec2 uTexel; uniform float uProjScale; varying vec2 vUv;
      float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
      void main(){ float d0 = texture2D(uDepth, vUv).r; if (d0 >= 0.99999) { gl_FragColor = vec4(1.0); return; }
        float z0 = linZ(d0); float r = clamp(uProjScale * 0.6 / z0, 2.0, 40.0); float a0 = ign(gl_FragCoord.xy) * 6.2831; float occ = 0.0;
        for (int i = 0; i < 10; i++) { float t = (float(i) + 0.5) / 10.0; float a = a0 + float(i) * 2.39996; vec2 o = vec2(cos(a), sin(a)) * r * t * uTexel;
          float z = linZ(texture2D(uDepth, vUv + o).r); float dz = z0 - z; occ += step(0.04, dz) * smoothstep(1.2, 0.3, dz); }
        gl_FragColor = vec4(vec3(1.0 - occ / 10.0 * 0.85), 1.0); }`, { uDepth: { value: null }, uTexel: texel(), uProjScale: { value: 500 }, uNear: { value: 0.08 }, uFar: { value: 1000 } });
    this.mExp = pass(`uniform sampler2D uSrc; uniform sampler2D uPrev; uniform float uRate; varying vec2 vUv;
      void main(){ float l = 0.0;
        for (int y = 0; y < 4; y++) for (int x = 0; x < 4; x++) { vec3 c = textureLod(uSrc, vec2(0.125 + float(x) * 0.25, 0.125 + float(y) * 0.25), 4.0).rgb; l += log(max(dot(c, vec3(0.2126, 0.7152, 0.0722)), 0.004)); }
        float avg = exp(l / 16.0); float target = clamp(0.36 / avg, 0.85, 1.7);
        float prev = texture2D(uPrev, vec2(0.5)).r * 2.0; if (prev <= 0.01) prev = 1.0;
        gl_FragColor = vec4(vec3(mix(prev, target, uRate) / 2.0), 1.0); }`, { uSrc: { value: null }, uPrev: { value: null }, uRate: { value: 0.05 } });
    this.mComp = pass(`${LIN}
      uniform sampler2D uScene; uniform sampler2D uDepth; uniform sampler2D uHalf; uniform sampler2D uBloom; uniform sampler2D uRays; uniform sampler2D uAO; uniform sampler2D uExp;
      uniform float uBloomAmt; uniform float uRaysOn; uniform float uAOOn; uniform float uExpOn; uniform float uFogOn; uniform float uDof; uniform float uMotion;
      uniform mat4 uInvVP; uniform mat4 uPrevVP; uniform vec3 uCam; uniform vec3 uSunDir; uniform vec3 uSunColor; uniform vec3 uFogColor; uniform float uDay; uniform float uNight; uniform float uRain;
      uniform float uUnder; uniform float uLava; uniform float uFlash; uniform float uTime; uniform float uCave; uniform float uLensRain;
      uniform float uFilmic; uniform float uSat; uniform float uContrast; uniform float uVignette; uniform float uGrain; uniform float uChroma; uniform float uFlare; uniform vec2 uSun; uniform float uSunVis; uniform float uAspect; uniform vec2 uTexel;
      varying vec2 vUv;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      vec3 worldAt(vec2 uv, float d){ vec4 p = uInvVP * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); return p.xyz / p.w; }
      vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
      vec3 soft(vec3 x){ vec3 k = vec3(0.8); return mix(x, k + (1.0 - k) * (1.0 - exp(-(x - k) / (1.0 - k))), step(k, x)); }
      vec2 drops(vec2 uv){ vec2 g = uv * vec2(uAspect, 1.0) * 9.0; vec2 id = floor(g); vec2 f = fract(g) - 0.5; float h = hash(id);
        float t = fract(uTime * (0.15 + h * 0.2) + h); vec2 c = vec2(hash(id + 3.1) - 0.5, 0.35 - t * 0.7) * 0.6; vec2 dd = f - c; float r = length(dd * vec2(1.0, 0.8));
        float m = smoothstep(0.12, 0.05, r) * step(0.55, h); return dd * m * 0.06; }
      void main(){
        vec2 uv = vUv;
        if (uUnder > 0.5) uv += vec2(sin(uv.y * 24.0 + uTime * 2.2), cos(uv.x * 20.0 + uTime * 1.8)) * 0.0025;
        if (uLensRain > 0.0) uv += drops(uv) * uLensRain;
        float d = texture2D(uDepth, uv).r;
        bool sky = d >= 0.99999;
        vec3 col;
        if (uChroma > 0.0) { vec2 o = (uv - 0.5) * uChroma * 0.006; col = vec3(texture2D(uScene, uv + o).r, texture2D(uScene, uv).g, texture2D(uScene, uv - o).b); }
        else col = texture2D(uScene, uv).rgb;
        if (any(isnan(col)) || any(isinf(col))) col = vec3(0.0);
        vec3 wp = worldAt(uv, d);
        if (uMotion > 0.0) {
          vec4 pc = uPrevVP * vec4(sky ? uCam + normalize(wp - uCam) * 500.0 : wp, 1.0);
          vec2 vel = (uv - (pc.xy / pc.w * 0.5 + 0.5)) * uMotion;
          float len = length(vel); if (len > 0.04) vel *= 0.04 / len;
          if (len > 0.0008) { vec3 acc = col; for (int i = 1; i < 6; i++) acc += texture2D(uScene, uv - vel * (float(i) / 5.0)).rgb; col = acc / 6.0; }
        }
        float vz = linZ(d);
        if (uDof > 0.0) {
          float fz = linZ(texture2D(uDepth, vec2(0.5)).r);
          float coc = clamp(abs(vz - fz) / max(fz * 1.5, 6.0), 0.0, 1.0) * uDof;
          if (coc > 0.02) col = mix(col, textureLod(uHalf, uv, coc * 2.5).rgb, smoothstep(0.0, 0.6, coc));
        }
        if (uAOOn > 0.5 && !sky) {
          float a = texture2D(uAO, uv).r * 0.4 + (texture2D(uAO, uv + vec2(uTexel.x * 2.0, 0.0)).r + texture2D(uAO, uv - vec2(uTexel.x * 2.0, 0.0)).r + texture2D(uAO, uv + vec2(0.0, uTexel.y * 2.0)).r + texture2D(uAO, uv - vec2(0.0, uTexel.y * 2.0)).r) * 0.15;
          col *= mix(a, 1.0, smoothstep(40.0, 90.0, vz));
        }
        if (uFogOn > 0.5 && uUnder < 0.5 && uLava < 0.5) {
          vec3 rd = wp - uCam; float dist = sky ? 300.0 : length(rd); rd /= max(length(rd), 1e-4);
          float k = 0.045, base = 64.0;
          float h0 = max(uCam.y - base, 0.0);
          float dens = (0.006 + uRain * 0.01) * exp(-h0 * k);
          float fy = rd.y * k; float integ = abs(fy) > 1e-4 ? (1.0 - exp(-dist * fy)) / fy : dist;
          float fogAmt = 1.0 - exp(-dens * integ);
          float mie = pow(max(dot(rd, uSunDir), 0.0), 8.0);
          vec3 inscat = uFogColor * (0.8 + 0.2 * uDay) + uSunColor * mie * 0.5 * uDay * (1.0 - uRain);
          col = mix(col, inscat, fogAmt * (sky ? 0.35 : 1.0));
          if (uCave > 0.0 && !sky) col = mix(col, vec3(0.06, 0.065, 0.08), (1.0 - exp(-dist * 0.02)) * uCave * 0.6);
        }
        if (uRaysOn > 0.5) col += texture2D(uRays, uv).rgb;
        col += texture2D(uBloom, uv).rgb * uBloomAmt;
        float sunOcc = 0.0;
        if (uSunVis > 0.0) { for (int k = 0; k < 9; k++) { vec2 o = vec2(float(k % 3) - 1.0, float(k / 3) - 1.0) * 0.012; sunOcc += step(0.99999, texture2D(uDepth, clamp(uSun + o, 0.001, 0.999)).r); } sunOcc /= 9.0; }
        if (uFlare > 0.0 && uSunVis * sunOcc > 0.0) {
          vec2 sv = uSun; vec2 axis = vec2(0.5) - sv; vec2 a = vec2(uAspect, 1.0); float fl = 0.0;
          for (int i = 1; i < 5; i++) { float t = float(i) * 0.42; vec2 p = sv + axis * t * 2.0; float r = 0.025 + float(i) * 0.018; fl += smoothstep(r, r * 0.6, length((uv - p) * a)) * (0.18 / float(i)); }
          vec2 ds = (uv - sv) * a; float gl = exp(-length(ds) * 7.0) * 0.45 + exp(-abs(ds.x * ds.y) * 9000.0) * exp(-length(ds) * 4.0) * 0.25;
          col += uSunColor * (fl + gl) * uSunVis * sunOcc * uFlare;
        }
        if (uUnder > 0.5) { col = mix(col, vec3(0.04, 0.16, 0.32) * (0.3 + uDay * 0.7), 0.25); }
        if (uLava > 0.5) col = mix(col, vec3(1.0, 0.35, 0.05), 0.55);
        if (uExpOn > 0.5) col *= texture2D(uExp, vec2(0.5)).r * 2.0;
        col = uFilmic > 0.5 ? aces(col * 1.15) : soft(col);
        float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
        col = mix(vec3(l), col, uSat);
        col = (col - 0.5) * uContrast + 0.5;
        col += vec3(uFlash * 0.25 * (1.0 - uCave) * (1.0 - uUnder));
        if (uVignette > 0.0) { vec2 v = uv - 0.5; col *= 1.0 - dot(v, v) * 0.55 * uVignette; }
        if (uGrain > 0.0) col += (hash(uv * 913.0 + fract(uTime) * 71.0) - 0.5) * 0.035 * uGrain;
        gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
      }`, {
      uScene: { value: null }, uDepth: { value: null }, uHalf: { value: null }, uBloom: { value: null }, uRays: { value: null }, uAO: { value: null }, uExp: { value: null },
      uBloomAmt: { value: 0 }, uRaysOn: { value: 0 }, uAOOn: { value: 0 }, uExpOn: { value: 0 }, uFogOn: { value: 0 }, uDof: { value: 0 }, uMotion: { value: 0 },
      uInvVP: { value: new THREE.Matrix4() }, uPrevVP: { value: new THREE.Matrix4() }, uCam: { value: new THREE.Vector3() }, uSunDir: { value: new THREE.Vector3() }, uSunColor: { value: new THREE.Color() }, uFogColor: { value: new THREE.Color() },
      uDay: { value: 1 }, uNight: { value: 0 }, uRain: { value: 0 }, uUnder: { value: 0 }, uLava: { value: 0 }, uFlash: { value: 0 }, uTime: { value: 0 }, uCave: { value: 0 }, uLensRain: { value: 0 },
      uFilmic: { value: 0 }, uSat: { value: 1 }, uContrast: { value: 1 }, uVignette: { value: 0 }, uGrain: { value: 0 }, uChroma: { value: 0 }, uFlare: { value: 0 }, uSun: { value: new THREE.Vector2() }, uSunVis: { value: 0 }, uAspect: { value: 1 }, uTexel: texel(),
      uNear: { value: 0.08 }, uFar: { value: 1000 },
    });
    this.mFinal = pass(`uniform sampler2D uSrc; uniform vec2 uTexel; uniform float uFxaa; uniform float uSharpen; varying vec2 vUv;
      float lu(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
      void main(){
        vec3 c = texture2D(uSrc, vUv).rgb;
        vec3 n = texture2D(uSrc, vUv + vec2(0.0, uTexel.y)).rgb, s = texture2D(uSrc, vUv - vec2(0.0, uTexel.y)).rgb;
        vec3 e = texture2D(uSrc, vUv + vec2(uTexel.x, 0.0)).rgb, w = texture2D(uSrc, vUv - vec2(uTexel.x, 0.0)).rgb;
        if (uFxaa > 0.5) {
          float lN = lu(n), lS = lu(s), lE = lu(e), lW = lu(w), lM = lu(c);
          float mn = min(lM, min(min(lN, lS), min(lE, lW))), mx = max(lM, max(max(lN, lS), max(lE, lW)));
          float range = mx - mn;
          if (range > max(0.04, mx * 0.12)) {
            float lNW = lu(texture2D(uSrc, vUv + vec2(-uTexel.x, uTexel.y)).rgb), lNE = lu(texture2D(uSrc, vUv + uTexel).rgb);
            float lSW = lu(texture2D(uSrc, vUv - uTexel).rgb), lSE = lu(texture2D(uSrc, vUv + vec2(uTexel.x, -uTexel.y)).rgb);
            vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), ((lNW + lSW) - (lNE + lSE)));
            float red = max((lNW + lNE + lSW + lSE) * 0.03125, 0.0078);
            float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + red);
            dir = clamp(dir * rcp, -8.0, 8.0) * uTexel;
            vec3 a = 0.5 * (texture2D(uSrc, vUv + dir * (1.0 / 3.0 - 0.5)).rgb + texture2D(uSrc, vUv + dir * (2.0 / 3.0 - 0.5)).rgb);
            vec3 b = a * 0.5 + 0.25 * (texture2D(uSrc, vUv - dir * 0.5).rgb + texture2D(uSrc, vUv + dir * 0.5).rgb);
            float lb = lu(b);
            c = (lb < mn || lb > mx) ? a : b;
          }
        }
        if (uSharpen > 0.0) c = clamp(c + (c * 4.0 - n - s - e - w) * uSharpen * 0.25, 0.0, 1.0);
        gl_FragColor = vec4(c, 1.0);
      }`, { uSrc: { value: null }, uTexel: texel(), uFxaa: { value: 0 }, uSharpen: { value: 0 } });
  }

  setSize(w: number, h: number): void {
    w = Math.max(1, Math.floor(w)); h = Math.max(1, Math.floor(h));
    if (this.size.x === w && this.size.y === h) return;
    this.size.set(w, h);
    this.sceneRT.setSize(w, h);
    this.ldrRT.setSize(w, h);
    const hw = Math.max(1, w >> 1), hh = Math.max(1, h >> 1);
    this.halfRT.setSize(hw, hh);
    for (let i = 0; i < this.down.length; i++) {
      const s = 2 << i;
      this.down[i].setSize(Math.max(1, Math.floor(w / s / 2)), Math.max(1, Math.floor(h / s / 2)));
      this.up[i].setSize(Math.max(1, Math.floor(w / s / 2)), Math.max(1, Math.floor(h / s / 2)));
    }
    this.raysRT.setSize(Math.max(1, w >> 2), Math.max(1, h >> 2));
    this.aoRT.setSize(hw, hh);
  }

  get width(): number { return this.size.x; }
  get height(): number { return this.size.y; }

  private draw(m: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null): void {
    this.quad.material = m;
    this.gl.setRenderTarget(target);
    this.gl.render(this.quadScene, this.quadCam);
  }

  private texelOf(rt: THREE.WebGLRenderTarget): THREE.Vector2 { return new THREE.Vector2(1 / rt.width, 1 / rt.height); }

  /** Runs every post pass. Writes the tone-mapped image into ldrRT (when a final pass follows) or the screen. */
  process(f: PostFrame, toScreen: boolean): void {
    const c = this.cfg;
    const cam = f.camera;
    const depth = this.sceneRT.depthTexture!;
    const comp = this.mComp.uniforms;
    const needHalf = c.bloom > 0 || c.dof || c.autoExposure;
    if (needHalf) {
      this.mDown.uniforms.uSrc.value = this.sceneRT.texture;
      this.mDown.uniforms.uTexel.value.set(1 / this.sceneRT.width, 1 / this.sceneRT.height);
      this.draw(this.mDown, this.halfRT);
    }
    if (c.bloom > 0) {
      const levels = this.down.length;
      let src: THREE.Texture = this.halfRT.texture, sw = this.halfRT.width, sh = this.halfRT.height;
      for (let i = 0; i < levels; i++) {
        const u = this.mBloomDown.uniforms;
        u.uSrc.value = src; u.uTexel.value.set(1 / sw, 1 / sh); u.uFirst.value = i === 0 ? 1 : 0;
        u.uThreshold.value = this.hdr ? 0.95 : 0.82;
        this.draw(this.mBloomDown, this.down[i]);
        src = this.down[i].texture; sw = this.down[i].width; sh = this.down[i].height;
      }
      let prev = this.down[levels - 1];
      for (let i = levels - 2; i >= 0; i--) {
        const u = this.mBloomUp.uniforms;
        u.uSrc.value = prev.texture; u.uBase.value = this.down[i].texture; u.uTexel.value.set(1 / prev.width, 1 / prev.height);
        this.draw(this.mBloomUp, this.up[i]);
        prev = this.up[i];
      }
      comp.uBloom.value = this.up[0].texture;
    }
    comp.uBloomAmt.value = c.bloom * 0.6;

    const sunWorld = cam.position.clone().addScaledVector(f.sunDir, 400);
    const sp = sunWorld.project(cam);
    const sunUV = new THREE.Vector2(sp.x * 0.5 + 0.5, sp.y * 0.5 + 0.5);
    const facing = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion).dot(f.sunDir);
    const onScreen = sp.z < 1 && facing > 0 ? 1 - THREE.MathUtils.smoothstep(Math.max(Math.abs(sp.x), Math.abs(sp.y)), 1.0, 1.6) : 0;
    const sunUp = THREE.MathUtils.smoothstep(f.sunDir.y, -0.02, 0.12);
    const vis = onScreen * sunUp * (1 - f.rain) * (1 - f.underwater);
    const aspect = this.sceneRT.width / this.sceneRT.height;
    if (c.godRays && vis > 0.01) {
      const u = this.mRays.uniforms;
      u.uDepth.value = depth; u.uSun.value.copy(sunUV); u.uColor.value.copy(f.sunColor); u.uStrength.value = 0.55 * vis * (0.4 + 0.6 * f.day); u.uAspect.value = aspect;
      this.draw(this.mRays, this.raysRT);
      comp.uRays.value = this.raysRT.texture;
      comp.uRaysOn.value = 1;
    } else comp.uRaysOn.value = 0;
    if (c.ssao) {
      const u = this.mAO.uniforms;
      u.uDepth.value = depth; u.uTexel.value.set(1 / this.aoRT.width, 1 / this.aoRT.height);
      u.uProjScale.value = this.aoRT.height / (2 * Math.tan((cam.fov * Math.PI) / 360));
      u.uNear.value = cam.near; u.uFar.value = cam.far;
      this.draw(this.mAO, this.aoRT);
      comp.uAO.value = this.aoRT.texture;
      comp.uAOOn.value = 1;
      comp.uTexel.value.set(1 / this.aoRT.width, 1 / this.aoRT.height);
    } else comp.uAOOn.value = 0;
    if (c.autoExposure) {
      const u = this.mExp.uniforms;
      const prev = this.expRT[this.expIdx], next = this.expRT[1 - this.expIdx];
      u.uSrc.value = this.halfRT.texture; u.uPrev.value = prev.texture; u.uRate.value = Math.min(1, f.dt * 1.2);
      this.draw(this.mExp, next);
      this.expIdx = 1 - this.expIdx;
      comp.uExp.value = next.texture;
      comp.uExpOn.value = 1;
    } else comp.uExpOn.value = 0;

    cam.updateMatrixWorld();
    const vp = this.tmp.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this.invVP.copy(vp).invert();
    comp.uScene.value = this.sceneRT.texture;
    comp.uDepth.value = depth;
    comp.uHalf.value = this.halfRT.texture;
    comp.uFogOn.value = c.fog ? 1 : 0;
    comp.uDof.value = c.dof ? 1 : 0;
    comp.uMotion.value = c.motionBlur;
    comp.uInvVP.value.copy(this.invVP);
    comp.uPrevVP.value.copy(this.prevVP);
    this.prevVP.copy(vp);
    comp.uCam.value.copy(cam.position);
    comp.uSunDir.value.copy(f.sunDir);
    comp.uSunColor.value.copy(f.sunColor);
    comp.uFogColor.value.copy(f.fogColor);
    comp.uDay.value = f.day; comp.uNight.value = f.night; comp.uRain.value = f.rain;
    comp.uUnder.value = f.underwater; comp.uLava.value = f.lava; comp.uFlash.value = f.flash; comp.uTime.value = f.time;
    comp.uCave.value = f.cave; comp.uLensRain.value = f.lensRain;
    comp.uFilmic.value = c.filmic ? 1 : 0; comp.uSat.value = c.saturation; comp.uContrast.value = c.contrast;
    comp.uVignette.value = c.vignette ? 1 : 0; comp.uGrain.value = c.grain ? 1 : 0; comp.uChroma.value = c.chromatic ? 1 : 0;
    comp.uFlare.value = c.lensFlare ? 1 : 0; comp.uSun.value.copy(sunUV); comp.uSunVis.value = vis; comp.uAspect.value = aspect;
    comp.uNear.value = cam.near; comp.uFar.value = cam.far;
    this.draw(this.mComp, toScreen ? null : this.ldrRT);
  }

  final(sharpen: number): void {
    const u = this.mFinal.uniforms;
    u.uSrc.value = this.ldrRT.texture;
    u.uTexel.value.copy(this.texelOf(this.ldrRT));
    u.uFxaa.value = this.cfg.fxaa ? 1 : 0;
    u.uSharpen.value = sharpen;
    this.draw(this.mFinal, null);
  }

  dispose(): void {
    for (const rt of [this.sceneRT, this.halfRT, this.raysRT, this.aoRT, this.ldrRT, ...this.down, ...this.up, ...this.expRT]) rt.dispose();
    for (const m of [this.mDown, this.mBloomDown, this.mBloomUp, this.mRays, this.mAO, this.mExp, this.mComp, this.mFinal]) m.dispose();
    this.quad.geometry.dispose();
  }
}

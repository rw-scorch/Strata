import * as THREE from 'three';
import { POS_SCALE } from './Mesher';

export interface WorldUniforms {
  uAtlas: { value: THREE.Texture | null };
  uAtlasGrid: { value: THREE.Vector2 };
  uTexel: { value: number };
  uDay: { value: number };
  uSkyColor: { value: THREE.Color };
  uSkyTop: { value: THREE.Color };
  uFogColor: { value: THREE.Color };
  uFogNear: { value: number };
  uFogFar: { value: number };
  uTime: { value: number };
  uBrightness: { value: number };
  uShadowMap: { value: THREE.Texture | null };
  uShadowMatrix: { value: THREE.Matrix4 };
  uShadowOn: { value: number };
  uShadowTexel: { value: number };
  uSunDir: { value: THREE.Vector3 };
  uFlash: { value: number };
  uRain: { value: number };
  uWind: { value: number };
  uCloudMap: { value: THREE.Texture | null };
  uCloudShift: { value: number };
  uCloudShadow: { value: number };
  uUnderwater: { value: number };
  uSceneColor: { value: THREE.Texture | null };
  uSceneDepth: { value: THREE.Texture | null };
  uResolution: { value: THREE.Vector2 };
  uCamNear: { value: number };
  uCamFar: { value: number };
  uProj: { value: THREE.Matrix4 };
  uLodScale: { value: number };
  uEmitBoost: { value: number };
}

export function createWorldUniforms(): WorldUniforms {
  return {
    uAtlas: { value: null }, uAtlasGrid: { value: new THREE.Vector2(32, 8) }, uTexel: { value: 0.5 / 16 },
    uDay: { value: 1 }, uSkyColor: { value: new THREE.Color(1, 1, 1) }, uSkyTop: { value: new THREE.Color(0.4, 0.6, 1) }, uFogColor: { value: new THREE.Color(0.7, 0.8, 1) },
    uFogNear: { value: 60 }, uFogFar: { value: 96 }, uTime: { value: 0 }, uBrightness: { value: 0.5 },
    uShadowMap: { value: null }, uShadowMatrix: { value: new THREE.Matrix4() }, uShadowOn: { value: 0 }, uShadowTexel: { value: 1 / 2048 },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uFlash: { value: 0 }, uRain: { value: 0 }, uWind: { value: 0 },
    uCloudMap: { value: null }, uCloudShift: { value: 0 }, uCloudShadow: { value: 0 }, uUnderwater: { value: 0 },
    uSceneColor: { value: null }, uSceneDepth: { value: null }, uResolution: { value: new THREE.Vector2(1, 1) },
    uCamNear: { value: 0.08 }, uCamFar: { value: 1000 }, uProj: { value: new THREE.Matrix4() }, uLodScale: { value: 1 }, uEmitBoost: { value: 1 },
  };
}

export interface ChunkFx {
  shadowTaps: 0 | 4 | 8 | 12;
  cloudShadows: boolean;
  wet: boolean;
  caustics: boolean;
  leafLight: boolean;
  glow: boolean;
  water: 0 | 1 | 2;
  reflect: 0 | 1 | 2;
}

export const FX_LOW: ChunkFx = { shadowTaps: 0, cloudShadows: false, wet: false, caustics: false, leafLight: false, glow: false, water: 0, reflect: 0 };

const COMMON = /* glsl */ `
float bitf(float f, float b) { return mod(floor(f / b + 0.001), 2.0); }
`;

const VERT = /* glsl */ `
attribute vec4 aUV;
attribute vec4 aLight;
attribute vec4 aTint;
uniform float uTime;
uniform float uWind;
uniform mat4 uShadowMatrix;
varying vec4 vUV;
varying vec4 vLight;
varying vec4 vTint;
varying float vFogDepth;
varying vec4 vShadow;
varying vec3 vWorld;
${COMMON}
vec3 animate(vec3 world, float flags, vec2 tuv) {
  if (bitf(flags, 2.0) > 0.5) world.y += (sin(world.x * 1.3 + uTime * 1.7) + cos(world.z * 1.1 + uTime * 1.3)) * 0.03 - 0.06;
  float sway = 0.7 + uWind;
  if (bitf(flags, 4.0) > 0.5) {
    float w = clamp(1.0 - tuv.y, 0.0, 1.0);
    world.x += sin(uTime * 1.6 + world.x * 0.7 + world.z * 0.4) * 0.05 * w * sway;
    world.z += cos(uTime * 1.3 + world.z * 0.6) * 0.04 * w * sway;
  }
  if (bitf(flags, 16.0) > 0.5) {
    float ph = uTime * 1.3 + world.x * 0.55 + world.y * 0.35 + world.z * 0.45;
    world.x += sin(ph) * 0.018 * sway;
    world.z += cos(ph * 1.27) * 0.018 * sway;
    world.y += sin(ph * 0.83) * 0.008 * sway;
  }
  return world;
}
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  float flags = floor(aTint.a * 255.0 + 0.5);
  vec2 tuv = aUV.xy / ${POS_SCALE.toFixed(1)};
  world.xyz = animate(world.xyz, flags, tuv);
  vUV = vec4(tuv, aUV.zw);
  vLight = aLight;
  vTint = aTint;
  vWorld = world.xyz;
  vShadow = uShadowMatrix * world;
  vec4 mv = viewMatrix * world;
  vFogDepth = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
uniform sampler2D uAtlas;
uniform vec2 uAtlasGrid;
uniform float uTexel;
uniform float uDay;
uniform vec3 uSkyColor;
uniform vec3 uSkyTop;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uAlphaTest;
uniform float uOpacity;
uniform float uBrightness;
uniform sampler2D uShadowMap;
uniform float uShadowOn;
uniform float uShadowTexel;
uniform vec3 uSunDir;
uniform float uFlash;
uniform float uTime;
uniform float uRain;
uniform sampler2D uCloudMap;
uniform float uCloudShift;
uniform float uCloudShadow;
uniform float uUnderwater;
uniform sampler2D uSceneColor;
uniform sampler2D uSceneDepth;
uniform vec2 uResolution;
uniform float uCamNear;
uniform float uCamFar;
uniform mat4 uProj;
uniform float uLodScale;
uniform float uEmitBoost;
varying vec4 vUV;
varying vec4 vLight;
varying vec4 vTint;
varying float vFogDepth;
varying vec4 vShadow;
varying vec3 vWorld;
${COMMON}

vec4 tileSample(float tile, vec2 f, vec2 gx, vec2 gy) {
  float col = mod(tile, uAtlasGrid.x);
  float row = floor(tile / uAtlasGrid.x + 0.0001);
  vec2 uv = (vec2(col, row) + clamp(f, vec2(uTexel), vec2(1.0 - uTexel))) / uAtlasGrid;
  return textureGrad(uAtlas, uv, gx, gy);
}

float curve(float l) {
  float c = pow(0.8, (1.0 - l) * 15.0);
  return mix(c, l, uBrightness * 0.55);
}

float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

#if SHADOW_TAPS > 0
const vec2 POISSON[12] = vec2[](
  vec2(-0.326, -0.406), vec2(-0.840, -0.074), vec2(-0.696, 0.457), vec2(-0.203, 0.621),
  vec2(0.962, -0.195), vec2(0.473, -0.480), vec2(0.519, 0.767), vec2(0.185, -0.893),
  vec2(0.507, 0.064), vec2(0.896, 0.412), vec2(-0.322, -0.933), vec2(-0.792, -0.598));
float shadowFactor(vec3 n, bool foliage) {
  float nl = foliage ? 1.0 : dot(n, uSunDir);
  if (nl <= 0.0) return 0.0;
  vec3 sc = vShadow.xyz / vShadow.w * 0.5 + 0.5;
  if (sc.x < 0.0 || sc.x > 1.0 || sc.y < 0.0 || sc.y > 1.0 || sc.z > 1.0) return 1.0;
  float bias = uShadowTexel * (foliage ? 2.0 : 0.9) + 0.0008 * (1.0 - nl);
  float a = ign(gl_FragCoord.xy) * 6.2831853;
  mat2 rot = mat2(cos(a), sin(a), -sin(a), cos(a));
  float s = 0.0;
  for (int i = 0; i < SHADOW_TAPS; i++) s += step(sc.z - bias, texture2D(uShadowMap, sc.xy + rot * POISSON[i] * uShadowTexel * 1.1).r);
  s /= float(SHADOW_TAPS);
  float edge = smoothstep(0.0, 0.1, min(min(sc.x, 1.0 - sc.x), min(sc.y, 1.0 - sc.y)));
  return mix(1.0, s, edge);
}
#endif

#ifdef CAUSTICS
float caustic(vec2 p, float t) {
  vec2 q = p * 0.7;
  float c = 0.0;
  for (int i = 0; i < 3; i++) {
    q = vec2(q.x + sin(q.y * 1.3 + t * 0.7), q.y + cos(q.x * 1.1 - t * 0.6));
    c += abs(sin(q.x + q.y));
  }
  return pow(1.0 - c / 3.0, 3.0) * 1.8;
}
#endif

#ifdef IS_TRANS
float linZ(float d) { float z = d * 2.0 - 1.0; return 2.0 * uCamNear * uCamFar / (uCamFar + uCamNear - z * (uCamFar - uCamNear)); }
vec3 waterNormal(vec2 p, float t) {
  vec2 g = vec2(0.0);
  vec2 d1 = vec2(0.8, 0.6), d2 = vec2(-0.5, 0.86), d3 = vec2(0.95, -0.3), d4 = vec2(-0.2, -0.98);
  g += cos(dot(p, d1) * 1.2 + t * 1.4) * d1 * 0.05;
  g += cos(dot(p, d2) * 2.3 + t * 1.9) * d2 * 0.045;
  g += cos(dot(p, d3) * 4.1 + t * 2.7) * d3 * 0.04;
  g += cos(dot(p, d4) * 6.7 + t * 3.3) * d4 * 0.035;
  if (uRain > 0.01) {
    vec2 cell = floor(p * 1.5), fp = fract(p * 1.5) - 0.5;
    float ph = fract(hash(cell) + t * 0.8);
    float r = length(fp);
    g += fp / max(r, 0.01) * sin((r - ph * 0.6) * 40.0) * (1.0 - ph) * smoothstep(0.5, 0.0, r) * 0.25 * uRain;
  }
  return normalize(vec3(-g.x, 1.0, -g.y));
}
#if REFLECT > 0
vec4 ssr(vec3 wp, vec3 N) {
  vec3 vp = (viewMatrix * vec4(wp, 1.0)).xyz;
  vec3 vn = normalize((viewMatrix * vec4(N, 0.0)).xyz);
  vec3 dir = normalize(reflect(normalize(vp), vn));
  if (dir.z > 0.3) return vec4(0.0);
  float stepLen = REFLECT > 1 ? 0.45 : 0.9;
  vec3 p = vp + dir * stepLen * ign(gl_FragCoord.xy);
  for (int i = 0; i < SSR_STEPS; i++) {
    p += dir * stepLen;
    stepLen *= 1.16;
    vec4 cp = uProj * vec4(p, 1.0);
    if (cp.w <= 0.0) break;
    vec2 uv = cp.xy / cp.w * 0.5 + 0.5;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) break;
    float d = texture2D(uSceneDepth, uv).r;
    float dd = -p.z - linZ(d);
    if (dd > 0.0 && dd < stepLen * 2.5 + 0.4) {
      vec3 a = p - dir * stepLen, b = p;
      for (int j = 0; j < 4; j++) {
        vec3 m = (a + b) * 0.5;
        vec4 cm = uProj * vec4(m, 1.0);
        if (-m.z > linZ(texture2D(uSceneDepth, cm.xy / cm.w * 0.5 + 0.5).r)) b = m; else a = m;
      }
      vec4 cb = uProj * vec4(b, 1.0);
      uv = cb.xy / cb.w * 0.5 + 0.5;
      if (texture2D(uSceneDepth, uv).r >= 0.99999) return vec4(0.0);
      vec2 e = smoothstep(0.0, 0.1, uv) * smoothstep(1.0, 0.9, uv);
      return vec4(texture2D(uSceneColor, uv).rgb, e.x * e.y * smoothstep(0.3, 0.0, dir.z));
    }
  }
  return vec4(0.0);
}
#endif
#endif

void main() {
  float flags = floor(vTint.a * 255.0 + 0.5);
  vec2 f = fract(vUV.xy);
  vec2 gx = dFdx(vUV.xy) * uLodScale / uAtlasGrid, gy = dFdy(vUV.xy) * uLodScale / uAtlasGrid;
  vec4 c = tileSample(vUV.z, f, gx, gy);
  if (bitf(flags, 1.0) > 0.5) c.rgb *= vTint.rgb;
  if (vUV.w > 0.5) {
    vec4 o = tileSample(vUV.w - 1.0, f, gx, gy);
    c.rgb = mix(c.rgb, o.rgb * vTint.rgb, o.a);
  }
  if (c.a < uAlphaTest) discard;
  vec3 cr = cross(dFdx(vWorld), dFdy(vWorld));
  float crl = length(cr);
  vec3 n = crl > 1e-10 ? cr / crl : vec3(0.0, 1.0, 0.0);
  float skyL = vLight.x;
  float sun = 1.0;
#if SHADOW_TAPS > 0
  if (uShadowOn > 0.5 && skyL > 0.6) sun = shadowFactor(n, bitf(flags, 4.0) > 0.5 || bitf(flags, 16.0) > 0.5);
#endif
#ifdef CLOUD_SHADOWS
  if (uCloudShadow > 0.0 && uSunDir.y > 0.05) {
    vec3 cp = vWorld + uSunDir * ((132.0 - vWorld.y) / uSunDir.y);
    float cl = texture2D(uCloudMap, vec2((cp.x + uCloudShift) / 256.0, -cp.z / 256.0)).a;
    sun *= 1.0 - smoothstep(0.3, 0.5, cl) * 0.4 * uCloudShadow;
  }
#endif
  float sky = curve(skyL) * uDay;
  sky *= mix(1.0, mix(0.55, 1.0, sun), smoothstep(0.6, 0.85, skyL) * smoothstep(0.2, 0.45, uDay));
  float flick = 1.0 + 0.035 * sin(uTime * 9.0 + dot(floor(vWorld), vec3(1.7, 2.3, 1.1)));
  float blk = curve(vLight.y) * flick;
  vec3 light = max(vec3(sky) * uSkyColor, vec3(blk) * vec3(1.0, 0.86, 0.66));
  light = max(light, vec3(0.1 + uBrightness * 0.12) * vec3(0.92, 0.95, 1.0));
  light *= (0.42 + 0.58 * vLight.z) * vLight.w;
  light += vec3(uFlash * skyL);
  vec3 albedo = c.rgb;
  float open = smoothstep(0.85, 1.0, skyL);
#ifdef WET
  float wet = uRain * open * step(0.6, n.y);
  float puddle = wet * smoothstep(0.5, 0.75, vnoise(vWorld.xz * 0.32));
  albedo *= 1.0 - 0.32 * wet;
#endif
  vec3 col = albedo * light;
#ifdef LEAF_LIGHT
  if (bitf(flags, 16.0) > 0.5 || bitf(flags, 4.0) > 0.5) {
    vec3 V = normalize(vWorld - cameraPosition);
    float t = pow(max(dot(V, uSunDir), 0.0), 5.0);
    col += albedo * uSkyColor * t * 0.7 * uDay * sun * open;
  }
#endif
  if (bitf(flags, 8.0) > 0.5) col = max(col, albedo) * uEmitBoost;
#ifdef GLOW
  if (bitf(flags, 32.0) > 0.5) {
    float mx = max(albedo.r, max(albedo.g, albedo.b)), mn = min(albedo.r, min(albedo.g, albedo.b));
    float g = smoothstep(0.3, 0.6, (mx - mn) / max(mx, 0.001)) * smoothstep(0.3, 0.65, mx);
    col = mix(col, albedo * 1.15 * uEmitBoost, g * 0.75);
  }
#endif
#ifdef WET
  if (wet > 0.0) {
    vec3 V = normalize(cameraPosition - vWorld);
    float fres = 0.04 + 0.96 * pow(1.0 - max(V.y, 0.0), 5.0);
    vec3 R = reflect(-V, vec3(0.0, 1.0, 0.0));
    vec3 refl = mix(uFogColor, uSkyTop, smoothstep(0.0, 0.6, R.y)) * (0.35 + 0.65 * uDay);
    col = mix(col, refl, fres * (0.2 * wet + 0.65 * puddle));
  }
#endif
#ifdef CAUSTICS
  if (uUnderwater > 0.5) col *= 1.0 + caustic(vWorld.xz, uTime) * 0.4 * skyL * uDay;
#endif
  float alpha = c.a * uOpacity;
#ifdef IS_TRANS
  if (bitf(flags, 64.0) > 0.5) {
    vec3 V = normalize(cameraPosition - vWorld);
    bool top = n.y > 0.5;
    vec3 N = top ? waterNormal(vWorld.xz, uTime) : n;
    float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
    vec3 R = reflect(-V, N);
    float skyVis = smoothstep(0.5, 1.0, skyL);
    vec3 skyRefl = mix(uFogColor, uSkyTop, smoothstep(-0.05, 0.6, R.y)) * mix(0.12, 1.0, skyVis);
    float spec = pow(max(dot(R, uSunDir), 0.0), 320.0) * 5.0 * uDay * (1.0 - uRain) * skyVis * sun;
#if WATER_Q > 0
    vec2 suv = gl_FragCoord.xy / uResolution;
    float wz = linZ(gl_FragCoord.z);
    float sd0 = linZ(texture2D(uSceneDepth, suv).r);
    vec2 ruv = suv + (top ? N.xz * 0.04 * clamp((sd0 - wz) * 0.4, 0.0, 1.0) : vec2(0.0));
    if (linZ(texture2D(uSceneDepth, ruv).r) < wz) ruv = suv;
    vec3 refr = texture2D(uSceneColor, ruv).rgb;
    float dz = max(linZ(texture2D(uSceneDepth, ruv).r) - wz, 0.0);
    if (!top) dz = 0.6;
    vec3 absorb = exp(-dz * vec3(0.34, 0.1, 0.07));
    vec3 deep = vTint.rgb * 0.32 * light;
    vec3 body = mix(deep, refr, absorb);
    body = mix(body, col, 0.28);
    vec3 refl = skyRefl;
#if REFLECT > 0
    if (top) { vec4 ss = ssr(vWorld, N); refl = mix(refl, ss.rgb, ss.a); }
#endif
    float foam = top ? (1.0 - smoothstep(0.0, 0.3, dz)) * smoothstep(0.35, 0.8, vnoise(vWorld.xz * 5.0 + uTime * 0.6)) : 0.0;
    col = mix(body, refl, top ? fres : 0.0) + spec + foam * light * 0.6;
    alpha = 1.0;
#else
    col = mix(col, skyRefl, fres * 0.65) + spec;
    alpha = clamp(alpha + fres * 0.25, 0.0, 1.0);
#endif
  }
#endif
  float fog = smoothstep(uFogNear, uFogFar, vFogDepth);
  gl_FragColor = vec4(mix(col, uFogColor, fog), alpha);
}
`;

export function chunkDefines(fx: ChunkFx, pass: 'opaque' | 'cutout' | 'trans'): Record<string, string | number | boolean> {
  const d: Record<string, string | number | boolean> = { SHADOW_TAPS: pass === 'trans' ? 0 : fx.shadowTaps };
  if (fx.cloudShadows) d.CLOUD_SHADOWS = 1;
  if (fx.wet && pass === 'opaque') d.WET = 1;
  if (fx.caustics && pass !== 'trans') d.CAUSTICS = 1;
  if (fx.leafLight && pass === 'cutout') d.LEAF_LIGHT = 1;
  if (fx.glow && pass === 'opaque') d.GLOW = 1;
  if (pass === 'trans') {
    d.IS_TRANS = 1;
    d.WATER_Q = fx.water;
    d.REFLECT = fx.water > 0 ? fx.reflect : 0;
    d.SSR_STEPS = fx.reflect > 1 ? 28 : 14;
  }
  return d;
}

export function createChunkMaterial(u: WorldUniforms, pass: 'opaque' | 'cutout' | 'trans', fx: ChunkFx = FX_LOW): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { ...u, uAlphaTest: { value: pass === 'opaque' ? 0.0 : pass === 'cutout' ? 0.5 : 0.02 }, uOpacity: { value: pass === 'trans' ? 0.8 : 1 } },
    vertexShader: VERT,
    fragmentShader: FRAG,
    defines: chunkDefines(fx, pass),
    transparent: pass === 'trans',
    depthWrite: true,
    side: THREE.FrontSide,
  });
}

export function setChunkFx(m: THREE.ShaderMaterial, fx: ChunkFx, pass: 'opaque' | 'cutout' | 'trans'): void {
  const next = chunkDefines(fx, pass);
  if (JSON.stringify(next) === JSON.stringify(m.defines)) return;
  m.defines = next;
  m.needsUpdate = true;
}

export function chunkGeometry(b: { pos: Int16Array; uv: Int16Array; light: Uint8Array; tint: Uint8Array; idx: Uint16Array | Uint32Array }, height: number): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const S = POS_SCALE;
  g.setAttribute('position', new THREE.BufferAttribute(b.pos, 3));
  g.setAttribute('aUV', new THREE.BufferAttribute(b.uv, 4));
  g.setAttribute('aLight', new THREE.BufferAttribute(b.light, 4, true));
  g.setAttribute('aTint', new THREE.BufferAttribute(b.tint, 4, true));
  g.setIndex(new THREE.BufferAttribute(b.idx, 1));
  g.boundingBox = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(16 * S, height * S, 16 * S));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(8 * S, (height / 2) * S, 8 * S), Math.sqrt(128 + (height / 2) ** 2) * S);
  return g;
}

export const DEPTH_MATERIAL = new THREE.ShaderMaterial({
  vertexShader: 'void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: 'void main(){ gl_FragColor = vec4(1.0); }',
  colorWrite: false,
  side: THREE.DoubleSide,
});

export function createTerrainDepthMaterial(u: WorldUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uAtlas: u.uAtlas, uAtlasGrid: u.uAtlasGrid, uTexel: u.uTexel, uTime: u.uTime, uWind: u.uWind },
    vertexShader: /* glsl */ `
      attribute vec4 aUV; attribute vec4 aTint; uniform float uTime; uniform float uWind; varying vec3 vT;
      ${COMMON}
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        float flags = floor(aTint.a * 255.0 + 0.5);
        vec2 tuv = aUV.xy / ${POS_SCALE.toFixed(1)};
        float sway = 0.7 + uWind;
        if (bitf(flags, 4.0) > 0.5) { float w = clamp(1.0 - tuv.y, 0.0, 1.0); world.x += sin(uTime * 1.6 + world.x * 0.7 + world.z * 0.4) * 0.05 * w * sway; world.z += cos(uTime * 1.3 + world.z * 0.6) * 0.04 * w * sway; }
        vT = vec3(tuv, aUV.z);
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uAtlas; uniform vec2 uAtlasGrid; uniform float uTexel; varying vec3 vT;
      void main() {
        float col = mod(vT.z, uAtlasGrid.x); float row = floor(vT.z / uAtlasGrid.x + 0.0001);
        vec2 uv = (vec2(col, row) + clamp(fract(vT.xy), vec2(uTexel), vec2(1.0 - uTexel))) / uAtlasGrid;
        if (textureLod(uAtlas, uv, 0.0).a < 0.5) discard;
        gl_FragColor = vec4(1.0);
      }`,
    colorWrite: false,
    side: THREE.DoubleSide,
  });
}

export function createEntityMaterial(u: WorldUniforms, map: THREE.Texture | null = null): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uFogColor: u.uFogColor, uFogNear: u.uFogNear, uFogFar: u.uFogFar, uLight: { value: 1 }, uHurt: { value: 0 },
      uMap: { value: map }, uUseMap: { value: map ? 1 : 0 }, uEmissive: { value: 0 }, uOpacity: { value: 1 },
    },
    vertexShader: /* glsl */ `
      attribute vec3 color;
      varying vec3 vColor;
      varying vec2 vUv;
      varying float vFog;
      varying float vShade;
      void main() {
        vColor = color;
        vUv = uv;
        vec3 n = normalize(mat3(modelMatrix) * normal);
        vShade = 0.62 + 0.38 * max(n.y, 0.0) + 0.16 * abs(n.z) - 0.1 * max(-n.y, 0.0);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vFog = length(mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar; uniform float uLight; uniform float uHurt;
      uniform sampler2D uMap; uniform float uUseMap; uniform float uEmissive; uniform float uOpacity;
      varying vec3 vColor; varying vec2 vUv; varying float vFog; varying float vShade;
      void main() {
        vec4 base = vec4(vColor, 1.0);
        if (uUseMap > 0.5) { base = texture2D(uMap, vUv); if (base.a < 0.5) discard; }
        float l = mix(uLight * vShade, 1.0, uEmissive);
        vec3 c = base.rgb * l;
        c = mix(c, vec3(1.0, 0.15, 0.1), uHurt * 0.55);
        gl_FragColor = vec4(mix(c, uFogColor, smoothstep(uFogNear, uFogFar, vFog)), uOpacity);
      }`,
  });
}

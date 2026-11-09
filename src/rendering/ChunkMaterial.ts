import * as THREE from 'three';

export interface WorldUniforms {
  uAtlas: { value: THREE.Texture | null };
  uAtlasGrid: { value: THREE.Vector2 };
  uTexel: { value: number };
  uDay: { value: number };
  uSkyColor: { value: THREE.Color };
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
}

export function createWorldUniforms(): WorldUniforms {
  return {
    uAtlas: { value: null }, uAtlasGrid: { value: new THREE.Vector2(32, 8) }, uTexel: { value: 0.5 / 16 },
    uDay: { value: 1 }, uSkyColor: { value: new THREE.Color(1, 1, 1) }, uFogColor: { value: new THREE.Color(0.7, 0.8, 1) },
    uFogNear: { value: 60 }, uFogFar: { value: 96 }, uTime: { value: 0 }, uBrightness: { value: 0.5 },
    uShadowMap: { value: null }, uShadowMatrix: { value: new THREE.Matrix4() }, uShadowOn: { value: 0 }, uShadowTexel: { value: 1 / 2048 },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uFlash: { value: 0 },
  };
}

const VERT = /* glsl */ `
attribute vec4 aUV;
attribute vec4 aLight;
attribute vec4 aTint;
uniform float uTime;
uniform mat4 uShadowMatrix;
varying vec4 vUV;
varying vec4 vLight;
varying vec4 vTint;
varying float vFogDepth;
varying vec4 vShadow;
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  float flags = floor(aTint.a * 255.0 + 0.5);
  if (mod(flags, 4.0) >= 2.0) {
    world.y += (sin(world.x * 1.3 + uTime * 1.7) + cos(world.z * 1.1 + uTime * 1.3)) * 0.03 - 0.06;
  }
  if (flags >= 4.0) {
    float w = clamp(1.0 - aUV.y, 0.0, 1.0);
    world.x += sin(uTime * 1.6 + world.x * 0.7 + world.z * 0.4) * 0.05 * w;
    world.z += cos(uTime * 1.3 + world.z * 0.6) * 0.04 * w;
  }
  vUV = aUV;
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
varying vec4 vUV;
varying vec4 vLight;
varying vec4 vTint;
varying float vFogDepth;
varying vec4 vShadow;
varying vec3 vWorld;

vec4 tileSample(float tile, vec2 f) {
  float col = mod(tile, uAtlasGrid.x);
  float row = floor(tile / uAtlasGrid.x + 0.0001);
  vec2 uv = (vec2(col, row) + clamp(f, vec2(uTexel), vec2(1.0 - uTexel))) / uAtlasGrid;
  return texture2D(uAtlas, uv);
}

float curve(float l) {
  float c = pow(0.8, (1.0 - l) * 15.0);
  return mix(c, l, uBrightness * 0.55);
}

float shadowFactor() {
  vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  if (dot(n, uSunDir) <= 0.02) return 0.0;
  vec3 sc = vShadow.xyz / vShadow.w * 0.5 + 0.5;
  if (sc.x < 0.0 || sc.x > 1.0 || sc.y < 0.0 || sc.y > 1.0 || sc.z > 1.0) return 1.0;
  float bias = 0.0012;
  float s = 0.0;
  float t = uShadowTexel;
  s += step(sc.z - bias, texture2D(uShadowMap, sc.xy + vec2(-t, -t)).r);
  s += step(sc.z - bias, texture2D(uShadowMap, sc.xy + vec2(t, -t)).r);
  s += step(sc.z - bias, texture2D(uShadowMap, sc.xy + vec2(-t, t)).r);
  s += step(sc.z - bias, texture2D(uShadowMap, sc.xy + vec2(t, t)).r);
  float edge = smoothstep(0.0, 0.08, min(min(sc.x, 1.0 - sc.x), min(sc.y, 1.0 - sc.y)));
  return mix(1.0, s * 0.25, edge);
}

void main() {
  vec2 f = fract(vUV.xy);
  vec4 c = tileSample(vUV.z, f);
  float flags = floor(vTint.a * 255.0 + 0.5);
  if (mod(flags, 2.0) >= 1.0) c.rgb *= vTint.rgb;
  if (vUV.w > 0.5) {
    vec4 o = tileSample(vUV.w - 1.0, f);
    c.rgb = mix(c.rgb, o.rgb * vTint.rgb, o.a);
  }
  if (c.a < uAlphaTest) discard;
  float sky = curve(vLight.x) * uDay;
  if (uShadowOn > 0.5 && vLight.x > 0.8) sky *= mix(0.6, 1.0, shadowFactor());
  float blk = curve(vLight.y);
  vec3 light = max(vec3(sky) * uSkyColor, vec3(blk) * vec3(1.0, 0.88, 0.7));
  light = max(light, vec3(0.03 + uBrightness * 0.07));
  light *= (0.42 + 0.58 * vLight.z) * vLight.w;
  light += vec3(uFlash * vLight.x);
  vec3 col = c.rgb * light;
  float fog = smoothstep(uFogNear, uFogFar, vFogDepth);
  gl_FragColor = vec4(mix(col, uFogColor, fog), c.a * uOpacity);
}
`;

export function createChunkMaterial(u: WorldUniforms, pass: 'opaque' | 'cutout' | 'trans'): THREE.ShaderMaterial {
  const m = new THREE.ShaderMaterial({
    uniforms: { ...u, uAlphaTest: { value: pass === 'opaque' ? 0.0 : pass === 'cutout' ? 0.5 : 0.02 }, uOpacity: { value: pass === 'trans' ? 0.8 : 1 } },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: pass === 'trans',
    depthWrite: true,
    side: THREE.FrontSide,
  });
  return m;
}

export function chunkGeometry(b: { pos: Float32Array; uv: Float32Array; light: Uint8Array; tint: Uint8Array; idx: Uint32Array }, height: number): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(b.pos, 3));
  g.setAttribute('aUV', new THREE.BufferAttribute(b.uv, 4));
  g.setAttribute('aLight', new THREE.BufferAttribute(b.light, 4, true));
  g.setAttribute('aTint', new THREE.BufferAttribute(b.tint, 4, true));
  g.setIndex(new THREE.BufferAttribute(b.idx, 1));
  g.boundingBox = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(16, height, 16));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(8, height / 2, 8), Math.sqrt(128 + (height / 2) ** 2));
  return g;
}

export const DEPTH_MATERIAL = new THREE.ShaderMaterial({
  vertexShader: 'void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: 'void main(){ gl_FragColor = vec4(1.0); }',
  colorWrite: false,
  side: THREE.DoubleSide,
});

export function createEntityMaterial(u: WorldUniforms, map: THREE.Texture | null = null): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uFogColor: u.uFogColor, uFogNear: u.uFogNear, uFogFar: u.uFogFar, uLight: { value: 1 }, uHurt: { value: 0 },
      uMap: { value: map }, uUseMap: { value: map ? 1 : 0 }, uEmissive: { value: 0 }, uOpacity: { value: 1 },
    },
    vertexShader: /* glsl */ `
      attribute vec3 color;
      attribute vec2 uv;
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

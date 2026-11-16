import * as THREE from 'three';
import { TICKS_PER_DAY, SEA_LEVEL } from '../core/constants';
import type { SkyState } from './Sky';

export type AtmoFx = 'spores' | 'petals' | 'dust' | 'pollen' | 'fireflies' | 'sparkle' | null;

export interface AtmoProfile { tint: [number, number, number]; amt: number; haze: number; humid: number; heat: number; fx: AtmoFx; }

const P = (tint: [number, number, number], amt: number, haze: number, humid: number, heat: number, fx: AtmoFx): AtmoProfile => ({ tint, amt, haze, humid, heat, fx });
const NEUTRAL: [number, number, number] = [0.72, 0.84, 1.0];

export const ATMO: Record<string, AtmoProfile> = {
  ocean: P([0.62, 0.78, 0.95], 0.1, 0.0022, 0.35, 0, null),
  deep_ocean: P([0.58, 0.74, 0.95], 0.12, 0.0024, 0.35, 0, null),
  warm_ocean: P([0.55, 0.86, 0.9], 0.22, 0.0022, 0.45, 0, null),
  beach: P(NEUTRAL, 0, 0.0018, 0.3, 0, null),
  river: P(NEUTRAL, 0, 0.002, 0.65, 0, null),
  plains: P(NEUTRAL, 0, 0.0016, 0.4, 0, 'pollen'),
  island: P(NEUTRAL, 0, 0.0016, 0.4, 0, 'pollen'),
  forest: P([0.7, 0.82, 0.88], 0.08, 0.0022, 0.55, 0, null),
  birch_forest: P([0.75, 0.85, 0.92], 0.06, 0.002, 0.5, 0, 'pollen'),
  desert: P([0.96, 0.86, 0.66], 0.38, 0.0042, 0.0, 1, 'dust'),
  mountains: P([0.68, 0.8, 1.0], 0.1, 0.0011, 0.25, 0, null),
  snowy_mountains: P([0.84, 0.9, 1.0], 0.16, 0.0011, 0.15, 0, 'sparkle'),
  snowy_tundra: P([0.86, 0.91, 1.0], 0.26, 0.0026, 0.2, 0, 'sparkle'),
  taiga: P([0.7, 0.78, 0.86], 0.16, 0.003, 0.65, 0, null),
  swamp: P([0.56, 0.62, 0.46], 0.52, 0.011, 1.0, 0, 'fireflies'),
  jungle: P([0.68, 0.85, 0.7], 0.26, 0.0052, 0.9, 0, 'fireflies'),
  savanna: P([0.95, 0.85, 0.62], 0.3, 0.0034, 0.15, 0.5, 'dust'),
  badlands: P([0.96, 0.66, 0.46], 0.46, 0.0042, 0.0, 1, 'dust'),
  dark_forest: P([0.46, 0.56, 0.46], 0.42, 0.0075, 0.85, 0, 'spores'),
  meadow: P([0.82, 0.9, 1.0], 0.1, 0.0015, 0.45, 0, 'pollen'),
  old_growth_taiga: P([0.64, 0.75, 0.76], 0.26, 0.006, 0.9, 0, null),
  cherry_grove: P([1.0, 0.8, 0.88], 0.32, 0.0026, 0.45, 0, 'petals'),
  mangrove_swamp: P([0.56, 0.64, 0.46], 0.5, 0.0105, 1.0, 0, 'fireflies'),
  mushroom_fields: P([0.76, 0.62, 0.86], 0.46, 0.006, 0.7, 0, 'spores'),
  ice_spikes: P([0.8, 0.9, 1.0], 0.3, 0.0018, 0.1, 0, 'sparkle'),
};
const DEFAULT = P(NEUTRAL, 0, 0.0016, 0.4, 0, null);

export const ATMO_GLSL = /* glsl */ `
uniform vec4 uAtmo; uniform vec3 uAtmoColor; uniform vec3 uMistColor;
vec3 atmoApply(vec3 col, vec3 wp, vec3 cam) {
  if (uAtmo.x + uAtmo.y <= 0.0) return col;
  float dist = length(wp - cam);
  float haze = 1.0 - exp(-dist * uAtmo.x);
  float H = uAtmo.w, b = uAtmo.z;
  float y0 = min(cam.y, wp.y), y1 = max(cam.y, wp.y), dy = y1 - y0;
  float avg;
  if (dy < 0.05) avg = exp(-max(y0 - b, 0.0) / H);
  else { float lo = clamp(b - y0, 0.0, dy); float a0 = max(y0, b); avg = (lo + H * (exp(-(a0 - b) / H) - exp(-max(y1 - b, 0.0) / H))) / dy; }
  float mist = 1.0 - exp(-dist * uAtmo.y * avg);
  col = mix(col, uAtmoColor, haze * 0.92);
  return mix(col, uMistColor, mist * 0.9);
}
`;

export interface AtmoUniforms {
  uAtmo: { value: THREE.Vector4 };
  uAtmoColor: { value: THREE.Color };
  uMistColor: { value: THREE.Color };
  uAtmoOn: { value: number };
}

export function atmoUniforms(): AtmoUniforms {
  return { uAtmo: { value: new THREE.Vector4(0, 0, SEA_LEVEL, 4) }, uAtmoColor: { value: new THREE.Color() }, uMistColor: { value: new THREE.Color() }, uAtmoOn: { value: 1 } };
}

export interface AtmoInput {
  dt: number;
  x: number; y: number; z: number;
  time: number;
  rain: number;
  cave: number;
  active: boolean;
  biome: (x: number, z: number) => string;
  top: (x: number, z: number) => number;
}

const W = [0.6, 1, 0.6];

export class Atmosphere {
  tint = new THREE.Color(...NEUTRAL);
  tintAmt = 0;
  haze = DEFAULT.haze;
  humid = DEFAULT.humid;
  heat = 0;
  fx: AtmoFx = null;
  fxAmt = 0;
  dustColor = new THREE.Color(0.95, 0.8, 0.6);
  mist = 0;
  mistBase = SEA_LEVEL + 2;
  mistThick = 4;
  wet = 0;
  enabled = true;
  private sampleT = 9;
  private baseT = 9;
  private target = { tint: new THREE.Color(...NEUTRAL), amt: 0, haze: DEFAULT.haze, humid: DEFAULT.humid, heat: 0 };
  private fxTarget: AtmoFx = null;
  private baseTarget = SEA_LEVEL + 2;

  static dawn(time: number): number {
    let t = (((time % TICKS_PER_DAY) + TICKS_PER_DAY) % TICKS_PER_DAY) / TICKS_PER_DAY;
    if (t > 0.5) t -= 1;
    const s = (a: number, b: number, v: number) => { const k = Math.min(1, Math.max(0, (v - a) / (b - a))); return k * k * (3 - 2 * k); };
    return s(-0.09, -0.025, t) * (1 - s(0.035, 0.13, t));
  }

  update(i: AtmoInput, night: number): void {
    this.sampleT += i.dt;
    if (this.sampleT > 0.35) {
      this.sampleT = 0;
      const tc = this.target.tint.setRGB(0, 0, 0);
      let amt = 0, haze = 0, humid = 0, heat = 0, ws = 0;
      const votes = new Map<AtmoFx, number>();
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        const w = W[a + 1] * W[b + 1];
        const p = ATMO[i.biome(Math.floor(i.x + a * 14), Math.floor(i.z + b * 14))] ?? DEFAULT;
        tc.r += p.tint[0] * w; tc.g += p.tint[1] * w; tc.b += p.tint[2] * w;
        amt += p.amt * w; haze += p.haze * w; humid += p.humid * w; heat += p.heat * w; ws += w;
        votes.set(p.fx, (votes.get(p.fx) ?? 0) + w);
      }
      tc.multiplyScalar(1 / ws);
      this.target.amt = amt / ws; this.target.haze = haze / ws; this.target.humid = humid / ws; this.target.heat = heat / ws;
      let best: AtmoFx = null, bw = 0;
      for (const [k, v] of votes) if (k && v > bw) { best = k; bw = v; }
      this.fxTarget = bw / ws > 0.3 ? best : null;
      const here = ATMO[i.biome(Math.floor(i.x), Math.floor(i.z))] ?? DEFAULT;
      if (here.fx === 'dust') this.dustColor.setRGB(here.tint[0], here.tint[1] * 0.92, here.tint[2] * 0.85);
    }
    this.baseT += i.dt;
    if (this.baseT > 1.5) {
      this.baseT = 0;
      const hs: number[] = [];
      for (let a = -4; a <= 4; a++) for (let b = -4; b <= 4; b++) hs.push(i.top(Math.floor(i.x + a * 9), Math.floor(i.z + b * 9)));
      hs.sort((p, q) => p - q);
      this.baseTarget = Math.max(SEA_LEVEL - 1, hs[Math.floor(hs.length * 0.2)] + 1.5);
    }
    const k = Math.min(1, i.dt * 0.6);
    this.tint.lerp(this.target.tint, k);
    this.tintAmt += (this.target.amt - this.tintAmt) * k;
    this.haze += (this.target.haze - this.haze) * k;
    this.humid += (this.target.humid - this.humid) * k;
    this.heat += (this.target.heat - this.heat) * k;
    this.mistBase += (this.baseTarget - this.mistBase) * Math.min(1, i.dt * 0.25);
    if (this.fx !== this.fxTarget) { this.fxAmt -= i.dt * 0.5; if (this.fxAmt <= 0) { this.fxAmt = 0; this.fx = this.fxTarget; } }
    else this.fxAmt = Math.min(1, this.fxAmt + i.dt * 0.5);
    this.wet = i.rain > this.wet ? this.wet + (i.rain - this.wet) * Math.min(1, i.dt * 0.2) : Math.max(0, this.wet - i.dt / 240);
    const dawn = Atmosphere.dawn(i.time);
    const m = this.humid * (dawn + night * 0.3 + this.wet * 0.45 + 0.04) * (1 - i.cave);
    this.mist += (m - this.mist) * Math.min(1, i.dt * 0.4);
    this.mistThick = 3.5 + this.humid * 4;
  }

  tintSky(st: SkyState, rain: number): void {
    if (!this.enabled || this.tintAmt <= 0.001) return;
    const a = this.tintAmt * (1 - rain * 0.5);
    const lum = (c: THREE.Color) => c.r * 0.3 + c.g * 0.55 + c.b * 0.15;
    const hl = lum(st.horizon), tl = lum(this.tint);
    const h = this.tint.clone().multiplyScalar(hl / Math.max(0.05, tl));
    st.horizon.lerp(h, a * 0.75);
    const top = this.tint.clone().multiplyScalar(lum(st.skyTop) / Math.max(0.05, tl));
    st.skyTop.lerp(top, a * 0.25);
  }

  apply(u: AtmoUniforms, st: SkyState, rain: number, active: boolean): void {
    if (!this.enabled || !active) { u.uAtmo.value.x = 0; u.uAtmo.value.y = 0; return; }
    const haze = this.haze * (1 + rain * 1.6);
    u.uAtmo.value.set(haze, this.mist * 0.075, this.mistBase, this.mistThick);
    u.uAtmoColor.value.copy(st.horizon);
    const lit = Math.max(0.04, (st.day - 0.24) / 0.76);
    u.uMistColor.value.copy(st.horizon).lerp(new THREE.Color(0.84, 0.87, 0.91).multiplyScalar(lit), 0.6);
  }
}

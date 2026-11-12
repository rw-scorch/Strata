import type { Settings } from '../storage/Settings';
import type { ChunkFx } from './ChunkMaterial';
import type { PostConfig } from './PostFX';

export interface GfxConfig {
  post: PostConfig | null;
  fx: ChunkFx;
  shadowRes: number;
  shadowDist: number;
  entityShadows: boolean;
  lodScale: number;
  lensRain: boolean;
}

export function deriveGfx(s: Settings, pressure = 0): GfxConfig {
  const shadowRes = { off: 0, low: 1024, high: 2048, ultra: 4096 }[s.shadowQuality] ?? 0;
  const water = s.waterQuality === 'ultra' ? 2 : s.waterQuality === 'high' ? 1 : 0;
  const fx: ChunkFx = {
    shadowTaps: shadowRes === 0 ? 0 : shadowRes <= 1024 ? 4 : shadowRes <= 2048 ? 8 : 12,
    cloudShadows: s.cloudShadows && s.clouds,
    wet: s.wetSurfaces,
    caustics: s.waterQuality !== 'low',
    leafLight: s.foliageLighting,
    glow: s.glowingOres,
    water: water as 0 | 1 | 2,
    reflect: (s.reflections === 'high' ? 2 : s.reflections === 'low' ? 1 : 0) as 0 | 1 | 2,
  };
  const p: PostConfig = {
    msaa: s.antiAliasing === 'msaa' ? 4 : 0,
    bloom: pressure >= 3 ? 0 : s.bloom,
    godRays: s.godRays && pressure < 2,
    ssao: s.ambientOcclusion === 'enhanced' && pressure < 1,
    dof: s.depthOfField && pressure < 2,
    motionBlur: s.motionBlur,
    autoExposure: s.autoExposure,
    fxaa: s.antiAliasing === 'fxaa',
    vignette: s.vignette,
    grain: s.filmGrain,
    chromatic: s.chromaticAberration,
    lensFlare: s.lensFlare,
    filmic: s.toneMapping === 'filmic',
    saturation: s.saturation,
    contrast: s.contrast,
    sceneTextures: water > 0,
  };
  const anyPost = p.msaa > 0 || p.bloom > 0 || p.godRays || p.ssao || p.dof || p.motionBlur > 0 || p.autoExposure || p.fxaa
    || p.vignette || p.grain || p.chromatic || p.lensFlare || p.filmic || p.saturation !== 1 || p.contrast !== 1 || p.sceneTextures;
  if (!anyPost) { fx.water = 0; }
  return {
    post: anyPost ? p : null,
    fx,
    shadowRes,
    shadowDist: s.shadowDistance,
    entityShadows: shadowRes >= 2048,
    lodScale: s.textureQuality === 'low' ? 2 : 1,
    lensRain: anyPost && s.waterQuality !== 'low',
  };
}

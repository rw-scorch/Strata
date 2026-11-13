import type { Appearance } from '../core/sim/WorldSim';

export type GraphicsPreset = 'low' | 'medium' | 'high' | 'ultra' | 'custom';

export interface ButtonLayout { [id: string]: { x?: number; y?: number; size?: number; hidden?: boolean }; }

export interface Settings {
  controlScheme: 'auto' | 'touch' | 'mouse';
  labs: boolean;
  guiScale: number;
  touchLayout: 'full' | 'minimal' | 'none';
  buttonOpacity: number;
  fireOverlay: 'normal' | 'low';
  chatTimestamps: boolean;
  showCoords: boolean;
  showMinimap: boolean;
  menuBlur: number;
  advancedTooltips: boolean;
  preset: GraphicsPreset;
  renderDistance: number;
  lodDistance: number;
  lodQuality: 'low' | 'medium' | 'high';
  caveCulling: boolean;
  idleFps: boolean;
  voiceEnabled: boolean;
  foodStats: boolean;
  sidebar: boolean;
  lookInfo: boolean;
  dynamicLights: boolean;
  fallingLeaves: boolean;
  connectedGlass: boolean;
  betterGrass: 'off' | 'fast' | 'fancy';
  soundPhysics: boolean;
  mouseTweaks: boolean;
  voiceMode: 'ptt' | 'vad';
  voiceVolume: number;
  micGain: number;
  voiceThreshold: number;
  resolutionScale: number;
  adaptiveResolution: boolean;
  shadows: boolean;
  particles: 'off' | 'low' | 'high';
  smoothLighting: boolean;
  clouds: boolean;
  fov: number;
  showFps: boolean;
  sensitivity: number;
  touchSensitivity: number;
  joystickSize: number;
  buttonSize: number;
  leftHanded: boolean;
  invertY: boolean;
  autoJump: boolean;
  tapToInteract: boolean;
  buttonLayout: ButtonLayout;
  master: number;
  music: number;
  effects: number;
  ambient: number;
  muted: boolean;
  difficulty: 'peaceful' | 'easy' | 'normal' | 'hard';
  viewBobbing: boolean;
  reconnect: boolean;
  region: string;
  activePacks: string[];
  playerName: string;
  appearance: Appearance;
  hudScale: number;
  chatOpacity: number;
  brightness: number;
  shadowQuality: 'off' | 'low' | 'high' | 'ultra';
  shadowDistance: number;
  waterQuality: 'low' | 'high' | 'ultra';
  reflections: 'off' | 'low' | 'high';
  godRays: boolean;
  bloom: number;
  ambientOcclusion: 'standard' | 'enhanced';
  motionBlur: number;
  antiAliasing: 'off' | 'fxaa' | 'msaa';
  depthOfField: boolean;
  autoExposure: boolean;
  toneMapping: 'vanilla' | 'filmic';
  saturation: number;
  contrast: number;
  vignette: boolean;
  filmGrain: boolean;
  chromaticAberration: boolean;
  lensFlare: boolean;
  cloudShadows: boolean;
  wetSurfaces: boolean;
  foliageLighting: boolean;
  glowingOres: boolean;
  fpsLimit: number;
  textureQuality: 'low' | 'high';
}

const KEY = 'strata.settings.v1';

const LOW_FX: Partial<Settings> = {
  shadowQuality: 'off', shadowDistance: 48, waterQuality: 'low', reflections: 'off', godRays: false, bloom: 0,
  ambientOcclusion: 'standard', motionBlur: 0, antiAliasing: 'off', depthOfField: false, autoExposure: false, lensFlare: false,
  cloudShadows: false, wetSurfaces: false, foliageLighting: false, glowingOres: false, vignette: false, textureQuality: 'high',
};

export const PRESETS: Record<Exclude<GraphicsPreset, 'custom'>, Partial<Settings>> = {
  low: { ...LOW_FX, renderDistance: 4, lodDistance: 16, lodQuality: 'low', resolutionScale: 0.75, shadows: false, particles: 'low', smoothLighting: true, clouds: false, adaptiveResolution: true },
  medium: {
    ...LOW_FX, renderDistance: 6, lodDistance: 32, lodQuality: 'medium', resolutionScale: 1, shadows: false, particles: 'high', smoothLighting: true, clouds: true, adaptiveResolution: true,
    bloom: 0.45, antiAliasing: 'fxaa', cloudShadows: true, wetSurfaces: true, foliageLighting: true, glowingOres: true, vignette: true,
  },
  high: {
    renderDistance: 8, lodDistance: 64, lodQuality: 'medium', resolutionScale: 1, shadows: true, particles: 'high', smoothLighting: true, clouds: true, adaptiveResolution: true,
    shadowQuality: 'high', shadowDistance: 64, waterQuality: 'high', reflections: 'low', godRays: true, bloom: 0.55,
    ambientOcclusion: 'standard', motionBlur: 0, antiAliasing: 'msaa', depthOfField: false, autoExposure: true, lensFlare: true,
    cloudShadows: true, wetSurfaces: true, foliageLighting: true, glowingOres: true, vignette: true, textureQuality: 'high',
  },
  ultra: {
    renderDistance: 10, lodDistance: 128, lodQuality: 'high', resolutionScale: 1, shadows: true, particles: 'high', smoothLighting: true, clouds: true, adaptiveResolution: true,
    shadowQuality: 'ultra', shadowDistance: 96, waterQuality: 'ultra', reflections: 'high', godRays: true, bloom: 0.6,
    ambientOcclusion: 'enhanced', motionBlur: 0, antiAliasing: 'msaa', depthOfField: false, autoExposure: true, lensFlare: true,
    cloudShadows: true, wetSurfaces: true, foliageLighting: true, glowingOres: true, vignette: true, textureQuality: 'high',
  },
};

export const PRESET_KEYS: (keyof Settings)[] = ['renderDistance', 'lodDistance', 'lodQuality', 'resolutionScale', 'shadows', 'particles', 'smoothLighting', 'clouds', 'adaptiveResolution', ...(Object.keys(LOW_FX) as (keyof Settings)[])];

export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const scheme = current?.controlScheme;
  if (scheme === 'touch') return true;
  if (scheme === 'mouse') return false;
  const ipad = /iPad|iPhone|Android/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return ipad || matchMedia('(pointer: coarse)').matches;
}

function defaults(): Settings {
  const touch = isTouchDevice();
  const ipad = /iPad/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const lowEnd = !ipad && ((navigator.hardwareConcurrency ?? 4) <= 4 || /iPhone|Android/i.test(navigator.userAgent));
  const preset: GraphicsPreset = lowEnd ? 'low' : touch ? 'medium' : 'high';
  return {
    preset, renderDistance: 6, lodDistance: 32, lodQuality: 'medium', caveCulling: true, idleFps: true, voiceEnabled: false, foodStats: true, sidebar: true, lookInfo: true, dynamicLights: true, fallingLeaves: true, connectedGlass: true, betterGrass: 'off', soundPhysics: true, mouseTweaks: true, voiceMode: 'ptt', voiceVolume: 1, micGain: 1, voiceThreshold: 0.03, resolutionScale: 1, adaptiveResolution: true, shadows: false, particles: 'high', smoothLighting: true, clouds: true,
    fov: 72, showFps: false, sensitivity: 1, touchSensitivity: 1, joystickSize: 1, buttonSize: 1, leftHanded: false, invertY: false,
    controlScheme: 'auto', labs: false, guiScale: 0, touchLayout: 'full', buttonOpacity: 0.85, fireOverlay: 'low', chatTimestamps: false, showCoords: true, showMinimap: true, menuBlur: 5, advancedTooltips: false, autoJump: touch, tapToInteract: true, buttonLayout: {}, master: 0.8, music: 0.5, effects: 0.8, ambient: 0.6, muted: false,
    difficulty: 'normal', viewBobbing: true, reconnect: true, region: 'auto', activePacks: [],
    playerName: '', appearance: { skin: Math.floor(Math.random() * 6), hair: Math.floor(Math.random() * 8), shirt: Math.floor(Math.random() * 12), pants: Math.floor(Math.random() * 12) },
    hudScale: 1, chatOpacity: 0.55, brightness: 0.5,
    ...LOW_FX, toneMapping: 'vanilla', saturation: 1, contrast: 1, filmGrain: false, chromaticAberration: false, fpsLimit: 0,
    ...PRESETS[preset],
  } as Settings;
}

let current: Settings | null = null;
const listeners = new Set<(s: Settings) => void>();

export function getSettings(): Settings {
  if (current) return current;
  const d = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<Settings> & { _v?: number };
      current = { ...d, ...saved };
      if ((saved._v ?? 1) < 3 && current.betterGrass === 'fancy') current.betterGrass = 'off';
      if ((saved._v ?? 1) < 2 && current.preset !== 'custom') Object.assign(current, PRESETS[current.preset as Exclude<GraphicsPreset, 'custom'>]);
      if (saved.lodDistance === undefined && current.preset !== 'custom') {
        const pr = PRESETS[current.preset as Exclude<GraphicsPreset, 'custom'>];
        current.lodDistance = pr.lodDistance ?? 32; current.lodQuality = pr.lodQuality ?? 'medium';
      }
    }
  } catch { /* ignore */ }
  current ??= d;
  return current!;
}

export function updateSettings(patch: Partial<Settings>): Settings {
  const s = { ...getSettings(), ...patch };
  if (patch.preset && patch.preset !== 'custom') Object.assign(s, PRESETS[patch.preset]);
  else if (Object.keys(patch).some((k) => (PRESET_KEYS as string[]).includes(k)) && !patch.preset) s.preset = 'custom';
  if ('shadowQuality' in patch) s.shadows = s.shadowQuality !== 'off';
  current = s;
  try { localStorage.setItem(KEY, JSON.stringify({ ...s, _v: 3 })); } catch { /* storage full */ }
  for (const l of listeners) l(s);
  return s;
}

export function onSettings(fn: (s: Settings) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export interface Identity { id: string; secret: string; }

export interface Account { name: string; id: string; secret: string; }
const ACCOUNT_KEY = 'strata.account.v1';

export function getAccount(): Account | null {
  try {
    const v = JSON.parse(localStorage.getItem(ACCOUNT_KEY) ?? 'null') as Account | null;
    return v && v.id && v.secret && v.name ? v : null;
  } catch { return null; }
}

export function setAccount(a: Account | null): void {
  try {
    if (a) localStorage.setItem(ACCOUNT_KEY, JSON.stringify(a)); else localStorage.removeItem(ACCOUNT_KEY);
  } catch { /* storage unavailable */ }
  if (a) updateSettings({ playerName: a.name });
}

export function loginSeen(): boolean { try { return !!localStorage.getItem('strata.login.seen') || !!getAccount(); } catch { return true; } }
export function markLoginSeen(): void { try { localStorage.setItem('strata.login.seen', '1'); } catch { /* ignore */ } }

export async function accountRequest(kind: 'login' | 'register' | 'password', body: Record<string, string>): Promise<{ ok: true; account?: Account } | { ok: false; error: string }> {
  let res: Response;
  try {
    const base = ((import.meta.env.VITE_SERVER_URL as string | undefined) ?? '').replace(/\/$/, '');
    res = await fetch(`${base}/api/auth/${kind}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    return { ok: false, error: 'Could not reach the server. Check your connection.' };
  }
  const data = await res.json().catch(() => null) as (Account & { error?: string; ok?: boolean }) | null;
  if (!data) return { ok: false, error: res.status === 404 ? 'Accounts need the game server. Use npm run preview or the deployed site, or play as a guest.' : 'The server sent an unexpected reply.' };
  if (!res.ok || data.error) return { ok: false, error: data.error ?? `Request failed (${res.status}).` };
  if (kind === 'password') return { ok: true };
  return { ok: true, account: { name: data.name, id: data.id, secret: data.secret } };
}

export function getIdentity(): Identity {
  const acc = getAccount();
  if (acc) return { id: acc.id, secret: acc.secret };
  const k = 'strata.identity.v1';
  try {
    const raw = localStorage.getItem(k);
    if (raw) {
      const v = JSON.parse(raw) as Identity;
      if (v.id && v.secret) return v;
    }
  } catch { /* ignore */ }
  const rand = (n: number) => {
    const b = new Uint8Array(n);
    crypto.getRandomValues(b);
    return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  };
  const v = { id: `p-${rand(12)}`, secret: rand(24) };
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ }
  return v;
}

export interface RoomRecord { code: string; name: string; at: number; owner: boolean; mode?: string; }

export function getRooms(kind: 'recent' | 'hosted'): RoomRecord[] {
  try { return JSON.parse(localStorage.getItem(`strata.rooms.${kind}`) ?? '[]') as RoomRecord[]; } catch { return []; }
}

export function rememberRoom(kind: 'recent' | 'hosted', r: RoomRecord): void {
  const list = getRooms(kind).filter((x) => x.code !== r.code);
  list.unshift(r);
  try { localStorage.setItem(`strata.rooms.${kind}`, JSON.stringify(list.slice(0, 20))); } catch { /* ignore */ }
}

export function forgetRoom(kind: 'recent' | 'hosted', code: string): void {
  try { localStorage.setItem(`strata.rooms.${kind}`, JSON.stringify(getRooms(kind).filter((x) => x.code !== code))); } catch { /* ignore */ }
}

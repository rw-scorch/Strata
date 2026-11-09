import type { Appearance } from '../core/sim/WorldSim';

export type GraphicsPreset = 'low' | 'medium' | 'high' | 'custom';

export interface ButtonLayout { [id: string]: { x: number; y: number }; }

export interface Settings {
  preset: GraphicsPreset;
  renderDistance: number;
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
}

const KEY = 'strata.settings.v1';

export const PRESETS: Record<Exclude<GraphicsPreset, 'custom'>, Partial<Settings>> = {
  low: { renderDistance: 4, resolutionScale: 0.6, shadows: false, particles: 'low', smoothLighting: true, clouds: false, adaptiveResolution: true },
  medium: { renderDistance: 6, resolutionScale: 0.85, shadows: false, particles: 'high', smoothLighting: true, clouds: true, adaptiveResolution: true },
  high: { renderDistance: 9, resolutionScale: 1, shadows: true, particles: 'high', smoothLighting: true, clouds: true, adaptiveResolution: true },
};

export function isTouchDevice(): boolean {
  return typeof window !== 'undefined' && (('ontouchstart' in window) || navigator.maxTouchPoints > 0 || matchMedia('(pointer: coarse)').matches);
}

function defaults(): Settings {
  const touch = isTouchDevice();
  const lowEnd = (navigator.hardwareConcurrency ?? 4) <= 4 || /iPhone|Android/i.test(navigator.userAgent);
  const preset: GraphicsPreset = lowEnd ? 'low' : touch ? 'medium' : 'high';
  return {
    preset, renderDistance: 6, resolutionScale: 0.85, adaptiveResolution: true, shadows: false, particles: 'high', smoothLighting: true, clouds: true,
    ...PRESETS[preset],
    fov: 72, showFps: false, sensitivity: 1, touchSensitivity: 1, joystickSize: 1, buttonSize: 1, leftHanded: false, invertY: false,
    autoJump: touch, tapToInteract: true, buttonLayout: {}, master: 0.8, music: 0.5, effects: 0.8, ambient: 0.6, muted: false,
    difficulty: 'normal', viewBobbing: true, reconnect: true, region: 'auto', activePacks: [],
    playerName: '', appearance: { skin: Math.floor(Math.random() * 6), hair: Math.floor(Math.random() * 8), shirt: Math.floor(Math.random() * 12), pants: Math.floor(Math.random() * 12) },
    hudScale: 1, chatOpacity: 0.55, brightness: 0.5,
  };
}

let current: Settings | null = null;
const listeners = new Set<(s: Settings) => void>();

export function getSettings(): Settings {
  if (current) return current;
  const d = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) current = { ...d, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  current ??= d;
  return current!;
}

export function updateSettings(patch: Partial<Settings>): Settings {
  const s = { ...getSettings(), ...patch };
  const presetKeys = ['renderDistance', 'resolutionScale', 'shadows', 'particles', 'smoothLighting', 'clouds'];
  if (patch.preset && patch.preset !== 'custom') Object.assign(s, PRESETS[patch.preset]);
  else if (Object.keys(patch).some((k) => presetKeys.includes(k)) && !patch.preset) s.preset = 'custom';
  current = s;
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage full */ }
  for (const l of listeners) l(s);
  return s;
}

export function onSettings(fn: (s: Settings) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export interface Identity { id: string; secret: string; }

export function getIdentity(): Identity {
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

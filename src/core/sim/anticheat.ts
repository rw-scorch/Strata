export type WardLevel = 'low' | 'normal' | 'high';
export interface WardCfg { on: boolean; level: WardLevel; kick: number; exemptOps: boolean; alerts: boolean }
export const WARD_DEFAULTS: WardCfg = { on: true, level: 'normal', kick: 40, exemptOps: true, alerts: true };

export type Check = 'speed' | 'fly' | 'nofall' | 'phase' | 'reach' | 'aim' | 'clicks' | 'multiaura' | 'fastbreak' | 'fastplace';
export const CHECK_NAMES: Record<Check, string> = {
  speed: 'Speed', fly: 'Fly', nofall: 'No Fall', phase: 'Phase', reach: 'Reach', aim: 'Kill Aura (aim)', clicks: 'Auto-clicker', multiaura: 'Kill Aura (multi)', fastbreak: 'Fast Break', fastplace: 'Fast Place',
};

export interface WardFlag { t: number; id: string; name: string; check: Check; vl: number; info: string }

export interface WardState {
  vl: Partial<Record<Check, number>>;
  decayAt: number;
  grace: number;
  knock: number;
  ice: number;
  slime: number;
  safe: { x: number; y: number; z: number } | null;
  airAt: number; airY: number; airMaxY: number;
  win: { t: number; x: number; z: number }[];
  yHist: { t: number; y: number }[];
  hits: { t: number; target: string }[];
  places: number[];
  phase: number;
  alertAt: number;
  pin?: { x: number; y: number; z: number; until: number };
}

export const LEVEL = {
  low: { speed: 1.5, aim: 115, cps: 22, place: 20, reach: 1.2, air: 1.6 },
  normal: { speed: 1.28, aim: 95, cps: 17, place: 14, reach: 0.75, air: 1.25 },
  high: { speed: 1.12, aim: 75, cps: 14, place: 11, reach: 0.45, air: 1.0 },
} as const;

export function newWardState(now: number): WardState {
  return { vl: {}, decayAt: now, grace: now + 3000, knock: 0, ice: 0, slime: 0, safe: null, airAt: now, airY: 0, airMaxY: 0, win: [], yHist: [], hits: [], places: [], phase: 0, alertAt: 0 };
}

export function sanitizeWard(raw: unknown): WardCfg {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<WardCfg>;
  return {
    on: r.on !== false,
    level: r.level === 'low' || r.level === 'high' ? r.level : 'normal',
    kick: typeof r.kick === 'number' && Number.isFinite(r.kick) ? Math.max(0, Math.min(500, Math.round(r.kick))) : WARD_DEFAULTS.kick,
    exemptOps: r.exemptOps !== false,
    alerts: r.alerts !== false,
  };
}

export function totalVl(s: WardState): number {
  let n = 0;
  for (const v of Object.values(s.vl)) n += v ?? 0;
  return n;
}

export function decay(s: WardState, now: number): void {
  const steps = Math.floor((now - s.decayAt) / 3000);
  if (steps <= 0) return;
  s.decayAt += steps * 3000;
  for (const k of Object.keys(s.vl) as Check[]) { const v = Math.max(0, (s.vl[k] ?? 0) - steps); if (v > 0) s.vl[k] = v; else delete s.vl[k]; }
}

export function windowSpeed(s: WardState, now: number, x: number, z: number): { speed: number; span: number; rate: number; from: { x: number; z: number } | null } {
  s.win.push({ t: now, x, z });
  while (s.win.length > 2 && now - s.win[0].t > 1200) s.win.shift();
  if (s.win.length < 2) return { speed: 0, span: 0, rate: 0, from: null };
  let d = 0, span = 0;
  for (let i = 1; i < s.win.length; i++) {
    d += Math.hypot(s.win[i].x - s.win[i - 1].x, s.win[i].z - s.win[i - 1].z);
    span += Math.max(0.1, (s.win[i].t - s.win[i - 1].t) / 1000);
  }
  const real = (now - s.win[0].t) / 1000;
  return { speed: span > 0 ? d / span : 0, span, rate: real > 0.5 ? (s.win.length - 1) / real : 0, from: s.win[0] };
}

export function speedBudget(o: { water: boolean; ice: boolean; soul: boolean; crouch: boolean }): number {
  if (o.ice) return 28;
  if (o.water) return 14;
  if (o.soul) return 11;
  return 7.6;
}

export function aimAngle(yaw: number, pitch: number, dx: number, dy: number, dz: number): number {
  const cp = Math.cos(pitch);
  const lx = -Math.sin(yaw) * cp, ly = Math.sin(pitch), lz = -Math.cos(yaw) * cp;
  const l = Math.hypot(dx, dy, dz) || 1;
  const c = Math.max(-1, Math.min(1, (lx * dx + ly * dy + lz * dz) / l));
  return (Math.acos(c) * 180) / Math.PI;
}

export function clickRate(s: WardState, now: number, target: string): { cps: number; distinct: number } {
  s.hits.push({ t: now, target });
  while (s.hits.length && now - s.hits[0].t > 1000) s.hits.shift();
  const recent = new Set(s.hits.filter((h) => now - h.t <= 150).map((h) => h.target));
  return { cps: s.hits.length, distinct: recent.size };
}

export function placeRate(s: WardState, now: number): number {
  s.places.push(now);
  while (s.places.length && now - s.places[0] > 1000) s.places.shift();
  return s.places.length;
}

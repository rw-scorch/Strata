export const DAY = 864e5;
export const HOST_FREE_DAYS = 30;
export const HOST_TRIAL_DAYS = 3;
export const HOST_GRACE = 12 * 36e5;
export const HOST_PURGE_DAYS = 60;
export const HOST_WARN_DAYS = 7;

export interface HostState {
  start: number;
  free: number;
  paid: number;
  status: string | null;
  sub: string | null;
  customer: string | null;
  comp?: boolean;
  ev?: string[];
}

export type HostPhase = 'off' | 'comp' | 'active' | 'locked' | 'purge';

export interface HostView {
  phase: HostPhase;
  until: number;
  lockAt: number;
  purgeAt: number;
  paid: boolean;
  renewing: boolean;
}

export function freshHost(now: number, days: number): HostState {
  return { start: now, free: now + days * DAY, paid: 0, status: null, sub: null, customer: null };
}

const LIVE = new Set(['active', 'trialing', 'past_due']);

export function hostView(h: HostState | null | undefined, now: number): HostView {
  if (!h) return { phase: 'off', until: 0, lockAt: 0, purgeAt: 0, paid: false, renewing: false };
  const until = Math.max(h.free, h.paid);
  const lockAt = until + HOST_GRACE;
  const purgeAt = lockAt + HOST_PURGE_DAYS * DAY;
  const renewing = !!h.sub && LIVE.has(h.status ?? '');
  const base = { until, lockAt, purgeAt, paid: h.paid > now, renewing };
  if (h.comp) return { ...base, phase: 'comp' };
  if (now < lockAt) return { ...base, phase: 'active' };
  if (now < purgeAt) return { ...base, phase: 'locked' };
  return { ...base, phase: 'purge' };
}

export interface SubEvent { event: string; sub: string; status: string; until: number; customer?: string | null }

export function applySubEvent(h: HostState, e: SubEvent): boolean {
  h.ev ??= [];
  if (e.event && h.ev.includes(e.event)) return false;
  if (e.event) { h.ev.push(e.event); if (h.ev.length > 24) h.ev.splice(0, h.ev.length - 24); }
  if (h.sub && e.sub !== h.sub && LIVE.has(h.status ?? '') && !LIVE.has(e.status)) return false;
  h.sub = e.sub;
  h.status = e.status;
  if (e.customer) h.customer = e.customer;
  if (LIVE.has(e.status) && Number.isFinite(e.until)) h.paid = Math.max(h.paid, e.until);
  return true;
}

export function fmtDay(t: number): string {
  return new Date(t).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function daysLeft(t: number, now: number): number {
  return Math.max(0, Math.ceil((t - now) / DAY));
}

export function hostLine(v: HostView, now: number): string {
  switch (v.phase) {
    case 'off': return '';
    case 'comp': return 'Hosted free by the server admin.';
    case 'active':
      if (v.renewing) return `Realm Hosting active, renews ${fmtDay(v.until)}.`;
      if (v.paid) return `Hosting paid until ${fmtDay(v.until)} (not renewing).`;
      return `Free hosting ends in ${daysLeft(v.until, now)} day${daysLeft(v.until, now) === 1 ? '' : 's'} (${fmtDay(v.until)}).`;
    case 'locked': return `Hosting lapsed. The world is frozen and will be deleted on ${fmtDay(v.purgeAt)} unless it is renewed.`;
    case 'purge': return 'Hosting lapsed and the world is being deleted.';
  }
}

import { cleanKey, keyHint } from './adminKey';
import { WorldRoom, Env } from './rooms/WorldRoom';
import { Accounts } from './accounts/Accounts';
import { Registry } from './registry/Registry';
import { supporterRoute, hostingRoute, RoomLookup } from './stripe';
import { shopRoute, adminShards } from './shop';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, isValidRoomCode, PROTOCOL_VERSION, GAME_VERSION } from '../src/core/constants';

function stamped(stub: DurableObjectStub) {
  return {
    fetch(input: string | Request, init?: RequestInit): Promise<Response> {
      const r = new Request(input, init);
      const h = new Headers(r.headers);
      h.set('x-strata-build', GAME_VERSION);
      return stub.fetch(new Request(r, { headers: h }));
    },
  };
}

function roomStub(env: Env, name: string, opts?: DurableObjectNamespaceGetDurableObjectOptions) {
  const id = env.WORLD_ROOMS.idFromName(name);
  return stamped(opts ? env.WORLD_ROOMS.get(id, opts) : env.WORLD_ROOMS.get(id));
}

export { WorldRoom, Accounts, Registry };

const REGIONS = new Set(['wnam', 'enam', 'sam', 'weur', 'eeur', 'apac', 'oc', 'afr', 'me']);

function makeCode(): string {
  const bytes = new Uint8Array(ROOM_CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let s = '';
  for (const b of bytes) s += ROOM_CODE_ALPHABET[b % ROOM_CODE_ALPHABET.length];
  return s;
}

const resolveCache = new Map<string, { at: number; target: string | null }>();

async function resolveCode(env: Env, code: string): Promise<string | null> {
  if (!env.REGISTRY) return code;
  const hit = resolveCache.get(code);
  if (hit && Date.now() - hit.at < 30000) return hit.target;
  try {
    const r = await env.REGISTRY.get(env.REGISTRY.idFromName('global')).fetch(`https://registry/resolve?code=${encodeURIComponent(code)}`);
    const j = (await r.json()) as { target: string | null };
    if (resolveCache.size > 2000) resolveCache.clear();
    resolveCache.set(code, { at: Date.now(), target: j.target });
    return j.target;
  } catch { return code; }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

const STUN_ONLY = { iceServers: [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }] };
let turnCache: { at: number; body: unknown } | null = null;

async function turnServers(env: Env): Promise<Response> {
  if (!env.TURN_KEY_ID || !env.TURN_KEY_API_TOKEN) return json(STUN_ONLY);
  if (turnCache && Date.now() - turnCache.at < 3600_000) return json(turnCache.body);
  try {
    const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(env.TURN_KEY_ID)}/credentials/generate-ice-servers`, {
      method: 'POST',
      headers: { authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ ttl: 4 * 3600 }),
    });
    if (!r.ok) return json(STUN_ONLY);
    const data = (await r.json()) as { iceServers?: { urls: string | string[]; username?: string; credential?: string }[] };
    const servers = (data.iceServers ?? []).map((s) => ({ ...s, urls: (Array.isArray(s.urls) ? s.urls : [s.urls]).filter((u) => !/:53(\?|$)/.test(u)) }));
    turnCache = { at: Date.now(), body: { iceServers: servers } };
    return json(turnCache.body);
  } catch {
    return json(STUN_ONLY);
  }
}

const adminFails = new Map<string, { n: number; t: number }>();

function safeEqual(a: string, b: string): boolean {
  let d = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0;
}

function adminAuth(req: Request, env: Env): Response | null {
  if (!cleanKey(env.ADMIN_KEY)) return json({ error: 'This server has no ADMIN_KEY secret set. Add one in the Cloudflare dashboard to use the admin console.' }, 503);
  const ip = req.headers.get('cf-connecting-ip') ?? 'local';
  const now = Date.now();
  const f = adminFails.get(ip);
  if (f && now - f.t < 60000 && f.n >= 5) return json({ error: 'Too many wrong keys. Wait a minute.' }, 429);
  let key = (req.headers.get('x-admin-key') ?? '').trim();
  try { key = decodeURIComponent(key).trim(); } catch { /* raw header */ }
  key = cleanKey(key);
  if (!key || !safeEqual(key, cleanKey(env.ADMIN_KEY))) {
    const g = f && now - f.t < 60000 ? f : { n: 0, t: now };
    g.n++;
    adminFails.set(ip, g);
    return json({ error: keyHint(key, cleanKey(env.ADMIN_KEY)) }, 401);
  }
  return null;
}

async function admin(req: Request, env: Env, path: string): Promise<Response> {
  const bad = adminAuth(req, env);
  if (bad) return bad;
  if (path === '/api/admin/rooms' && req.method === 'GET') {
    if (!env.REGISTRY) return json({ rooms: [], now: Date.now() });
    const stub = env.REGISTRY.get(env.REGISTRY.idFromName('global'));
    return json(await (await stub.fetch('https://registry/list')).json());
  }
  if (path === '/api/admin/shards' && req.method === 'POST') return adminShards(env, (await req.json().catch(() => ({}))) as Record<string, unknown>);
  if (path === '/api/admin/featured' && req.method === 'POST') {
    if (!env.REGISTRY) return json({ error: 'No registry' }, 503);
    const b = (await req.json().catch(() => ({}))) as { code?: string; on?: boolean; blurb?: string };
    const code = String(b.code ?? '').toUpperCase();
    if (!isValidRoomCode(code)) return json({ error: 'Invalid room code' }, 400);
    await env.REGISTRY.get(env.REGISTRY.idFromName('global')).fetch('https://registry/feature', { method: 'POST', body: JSON.stringify({ code, on: b.on !== false, blurb: String(b.blurb ?? '').slice(0, 140) }) });
    return json({ ok: true });
  }
  const m = path.match(/^\/api\/admin\/rooms\/([A-Za-z0-9]+)$/);
  if (m && req.method === 'POST') {
    const code = m[1].toUpperCase();
    if (!isValidRoomCode(code)) return json({ error: 'Invalid room code' }, 400);
    const target = await resolveCode(env, code);
    if (!target) return json({ error: 'That code is no longer in use.' }, 404);
    const stub = roomStub(env, target);
    const text = (await req.text()).slice(0, 4096);
    let body: Record<string, unknown> = {};
    try { body = JSON.parse(text); } catch { /* handled by room */ }
    if (body.action === 'recode') {
      const to = String(body.to ?? '').toUpperCase().trim();
      if (!isValidRoomCode(to)) return json({ error: `Codes are ${ROOM_CODE_LENGTH} characters from ${ROOM_CODE_ALPHABET}.` }, 400);
      if (to === code) return json({ ok: true, code });
      if (!env.REGISTRY) return json({ error: 'No registry' }, 503);
      const clash = (await (await roomStub(env, to).fetch('https://room/info')).json()) as { exists?: boolean };
      if (clash.exists && to !== target) return json({ error: 'Another world already uses that code.' }, 409);
      const reg = env.REGISTRY.get(env.REGISTRY.idFromName('global'));
      const rr = await reg.fetch('https://registry/recode', { method: 'POST', body: JSON.stringify({ from: code, to, target }) });
      if (!rr.ok) return json(await rr.json(), rr.status);
      resolveCache.delete(code); resolveCache.delete(to);
      const res = await stub.fetch('https://room/admin', { method: 'POST', body: JSON.stringify({ action: 'recode', code: to }) });
      return json({ ...(await res.json() as object), code: to }, res.status);
    }
    const res = await stub.fetch('https://room/admin', { method: 'POST', body: text });
    return json(await res.json(), res.status);
  }
  const ex = path.match(/^\/api\/admin\/rooms\/([A-Za-z0-9]+)\/export$/);
  if (ex && req.method === 'POST') {
    const found = await roomsFor(env)(ex[1]);
    if (!found) return json({ error: 'That code is no longer in use.' }, 404);
    return found.stub.fetch('https://room/export', { method: 'POST', headers: { 'x-strata-admin': '1' }, body: '{}' });
  }
  if (path === '/api/admin/check') return json({ ok: true });
  return json({ error: 'Not found' }, 404);
}

async function createRoom(req: Request, env: Env): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    const text = await req.text();
    if (text.length > 8192) return json({ error: 'Request too large' }, 413);
    body = JSON.parse(text);
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
  const region = typeof body.region === 'string' && REGIONS.has(body.region) ? body.region : undefined;
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = makeCode();
    if ((await resolveCode(env, code)) !== code) continue;
    const id = env.WORLD_ROOMS.idFromName(code);
    const stub = stamped(region ? env.WORLD_ROOMS.get(id, { locationHint: region as DurableObjectLocationHint }) : env.WORLD_ROOMS.get(id));
    const res = await stub.fetch('https://room/init', { method: 'POST', body: JSON.stringify({ ...body, code }) });
    if (res.status === 409) continue;
    if (!res.ok) return json(await res.json().catch(() => ({ error: 'Room creation failed' })), res.status);
    const data = (await res.json()) as Record<string, unknown>;
    return json({ code, ...data });
  }
  return json({ error: 'Could not allocate a room code, please retry' }, 503);
}

function failure(err: unknown): Response {
  const e = err as { overloaded?: boolean; retryable?: boolean; message?: string } | null;
  const busy = !!e?.overloaded || /overloaded/i.test(e?.message ?? '');
  const retry = busy || !!e?.retryable;
  console.error(busy ? 'room busy' : 'route error', e?.message ?? err);
  return new Response(JSON.stringify({ error: busy ? 'World is busy, retrying shortly' : 'Server hiccup, please retry', retry }), {
    status: retry ? 503 : 500,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...(retry ? { 'retry-after': busy ? String(5 + Math.floor(Math.random() * 10)) : '2' } : {}) },
  });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    try { return await route(req, env); } catch (err) { return failure(err); }
  },
} satisfies ExportedHandler<Env>;

async function route(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;

    if (path === '/api/health') return json({ ok: true, protocol: PROTOCOL_VERSION });

    if (path === '/api/turn') return turnServers(env);

    if (path.startsWith('/api/admin/')) return admin(req, env, path);

    if (path === '/api/rooms' && req.method === 'POST') return createRoom(req, env);

    if (path === '/api/featured') {
      if (!env.REGISTRY) return json({ worlds: [] });
      const r = await env.REGISTRY.get(env.REGISTRY.idFromName('global')).fetch('https://registry/featured');
      return new Response(r.body, { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=20' } });
    }

    if (path.startsWith('/api/supporter/') || path === '/api/stripe/webhook') return supporterRoute(req, env, path, roomsFor(env));

    if (path.startsWith('/api/hosting/')) return hostingRoute(req, env, path, roomsFor(env));

    if (path.startsWith('/api/shop/')) return shopRoute(req, env, path);

    const auth = path.match(/^\/api\/auth\/(register|login|password)$/);
    if (auth) {
      if (!env.ACCOUNTS) return json({ error: 'Accounts are not enabled on this server.' }, 503);
      if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
      const stub = env.ACCOUNTS.get(env.ACCOUNTS.idFromName('global'));
      const res = await stub.fetch(`https://accounts/${auth[1]}`, { method: 'POST', body: (await req.text()).slice(0, 2048), headers: { 'cf-connecting-ip': req.headers.get('cf-connecting-ip') ?? 'local' } });
      return new Response(res.body, { status: res.status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
    }

    const exportMatch = path.match(/^\/api\/rooms\/([A-Za-z0-9]+)\/export$/);
    if (exportMatch && req.method === 'POST') {
      const found = await roomsFor(env)(exportMatch[1]);
      if (!found) return json({ error: 'No world uses that code.' }, 404);
      return found.stub.fetch('https://room/export', { method: 'POST', body: (await req.text()).slice(0, 2048) });
    }

    const roomMatch = path.match(/^\/api\/rooms\/([A-Za-z0-9]+)(\/delete)?$/);
    if (roomMatch) {
      const code = roomMatch[1].toUpperCase();
      if (!isValidRoomCode(code)) return json({ exists: false, code, error: 'Invalid room code' }, 400);
      const target = await resolveCode(env, code);
      if (!target) return json({ exists: false, code });
      const stub = roomStub(env, target);
      if (roomMatch[2] && req.method === 'POST') {
        const res = await stub.fetch('https://room/delete', { method: 'POST', body: await req.text() });
        return json(await res.json(), res.status);
      }
      const res = await stub.fetch('https://room/info');
      const info = (await res.json()) as Record<string, unknown>;
      return json({ ...info, code });
    }

    const wsMatch = path.match(/^\/ws\/([A-Za-z0-9]+)$/);
    if (wsMatch) {
      if (req.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('Expected WebSocket upgrade', { status: 426 });
      const code = wsMatch[1].toUpperCase();
      if (!isValidRoomCode(code)) return new Response('Invalid room code', { status: 400 });
      const target = await resolveCode(env, code);
      if (!target) return new Response('Unknown room', { status: 404 });
      const stub = roomStub(env, target);
      return stub.fetch(new Request('https://room/ws', req));
    }

    if (path.startsWith('/api/')) return json({ error: 'Not found' }, 404);
    return env.ASSETS.fetch(req);
}

function roomsFor(env: Env): RoomLookup {
  return async (raw: string) => {
    const str = String(raw ?? '');
    if (str.startsWith('@')) { const t = str.slice(1); return /^[A-Za-z0-9]{4,16}$/.test(t) ? { target: t, stub: roomStub(env, t) } : null; }
    const code = str.toUpperCase();
    if (!isValidRoomCode(code)) return null;
    const target = await resolveCode(env, code);
    return target ? { target, stub: roomStub(env, target) } : null;
  };
}

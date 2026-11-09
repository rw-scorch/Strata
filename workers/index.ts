import { WorldRoom, Env } from './rooms/WorldRoom';
import { Accounts } from './accounts/Accounts';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, isValidRoomCode, PROTOCOL_VERSION } from '../src/core/constants';

export { WorldRoom, Accounts };

const REGIONS = new Set(['wnam', 'enam', 'sam', 'weur', 'eeur', 'apac', 'oc', 'afr', 'me']);

function makeCode(): string {
  const bytes = new Uint8Array(ROOM_CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let s = '';
  for (const b of bytes) s += ROOM_CODE_ALPHABET[b % ROOM_CODE_ALPHABET.length];
  return s;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
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
    const id = env.WORLD_ROOMS.idFromName(code);
    const stub = region ? env.WORLD_ROOMS.get(id, { locationHint: region as DurableObjectLocationHint }) : env.WORLD_ROOMS.get(id);
    const res = await stub.fetch('https://room/init', { method: 'POST', body: JSON.stringify({ ...body, code }) });
    if (res.status === 409) continue;
    if (!res.ok) return json(await res.json().catch(() => ({ error: 'Room creation failed' })), res.status);
    const data = (await res.json()) as Record<string, unknown>;
    return json({ code, ...data });
  }
  return json({ error: 'Could not allocate a room code, please retry' }, 503);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;

    if (path === '/api/health') return json({ ok: true, protocol: PROTOCOL_VERSION });

    if (path === '/api/rooms' && req.method === 'POST') return createRoom(req, env);

    const auth = path.match(/^\/api\/auth\/(register|login|password)$/);
    if (auth) {
      if (!env.ACCOUNTS) return json({ error: 'Accounts are not enabled on this server.' }, 503);
      if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
      const stub = env.ACCOUNTS.get(env.ACCOUNTS.idFromName('global'));
      const res = await stub.fetch(`https://accounts/${auth[1]}`, { method: 'POST', body: (await req.text()).slice(0, 2048), headers: { 'cf-connecting-ip': req.headers.get('cf-connecting-ip') ?? 'local' } });
      return new Response(res.body, { status: res.status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
    }

    const roomMatch = path.match(/^\/api\/rooms\/([A-Za-z0-9]+)(\/delete)?$/);
    if (roomMatch) {
      const code = roomMatch[1].toUpperCase();
      if (!isValidRoomCode(code)) return json({ exists: false, code, error: 'Invalid room code' }, 400);
      const stub = env.WORLD_ROOMS.get(env.WORLD_ROOMS.idFromName(code));
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
      const stub = env.WORLD_ROOMS.get(env.WORLD_ROOMS.idFromName(code));
      return stub.fetch(new Request('https://room/ws', req));
    }

    if (path.startsWith('/api/')) return json({ error: 'Not found' }, 404);
    return env.ASSETS.fetch(req);
  },
} satisfies ExportedHandler<Env>;

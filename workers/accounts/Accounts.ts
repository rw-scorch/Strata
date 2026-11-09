import { DurableObject } from 'cloudflare:workers';

export const NAME_RE = /^[A-Za-z0-9_]{3,16}$/;
const ITER = 100000;

function hex(b: Uint8Array): string { return [...b].map((x) => x.toString(16).padStart(2, '0')).join(''); }
function rand(n: number): string { const b = new Uint8Array(n); crypto.getRandomValues(b); return hex(b); }

async function hashPw(pw: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: ITER }, key, 256);
  return hex(new Uint8Array(bits));
}

function same(a: string, b: string): boolean {
  let d = a.length ^ b.length;
  for (let i = 0; i < Math.min(a.length, b.length); i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function out(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}

interface UserRow { name_lc: string; name: string; salt: string; hash: string; pid: string; psecret: string; created: number; [k: string]: SqlStorageValue; }

/** One global instance. Stores accounts and hands back the player identity used by world rooms. */
export class Accounts extends DurableObject<Record<string, unknown>> {
  private sql: SqlStorage;
  private tries = new Map<string, { n: number; t: number }>();

  constructor(ctx: DurableObjectState, env: Record<string, unknown>) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS users (name_lc TEXT PRIMARY KEY, name TEXT NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL, pid TEXT NOT NULL UNIQUE, psecret TEXT NOT NULL, created INTEGER NOT NULL)');
  }

  private limited(ip: string, max: number): boolean {
    const now = Date.now();
    const r = this.tries.get(ip);
    if (!r || now - r.t > 60000) { this.tries.set(ip, { n: 1, t: now }); return false; }
    r.n++;
    if (this.tries.size > 5000) this.tries.clear();
    return r.n > max;
  }

  private user(name: string): UserRow | null {
    return this.sql.exec<UserRow>('SELECT * FROM users WHERE name_lc = ?', name.toLowerCase()).toArray()[0] ?? null;
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const ip = req.headers.get('cf-connecting-ip') ?? 'local';
    if (url.pathname === '/check') {
      const name = url.searchParams.get('name') ?? '';
      const pid = url.searchParams.get('pid') ?? '';
      const u = this.user(name);
      return out({ registered: !!u, owner: !!u && u.pid === pid, name: u?.name ?? null });
    }
    if (req.method !== 'POST') return out({ error: 'Method not allowed' }, 405);
    let body: { name?: unknown; password?: unknown };
    try { body = JSON.parse((await req.text()).slice(0, 2048)); } catch { return out({ error: 'Invalid request' }, 400); }
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const pw = typeof body.password === 'string' ? body.password : '';
    if (url.pathname === '/register') {
      if (this.limited(`r:${ip}`, 5)) return out({ error: 'Too many new accounts from your network. Try again in a minute.' }, 429);
      if (!NAME_RE.test(name)) return out({ error: 'Names are 3 to 16 letters, numbers or underscores.' }, 400);
      if (pw.length < 6 || pw.length > 128) return out({ error: 'Passwords need at least 6 characters.' }, 400);
      if (this.user(name)) return out({ error: 'That name is already taken.' }, 409);
      const salt = rand(16);
      const row = { name, salt, hash: await hashPw(pw, salt), pid: `a-${rand(12)}`, psecret: rand(24) };
      this.sql.exec('INSERT INTO users (name_lc, name, salt, hash, pid, psecret, created) VALUES (?, ?, ?, ?, ?, ?, ?)', name.toLowerCase(), row.name, row.salt, row.hash, row.pid, row.psecret, Date.now());
      return out({ name: row.name, id: row.pid, secret: row.psecret });
    }
    if (url.pathname === '/login') {
      if (this.limited(`l:${ip}`, 10)) return out({ error: 'Too many sign-in attempts. Wait a minute and try again.' }, 429);
      const u = this.user(name);
      const h = await hashPw(pw, u?.salt ?? 'no-such-user-salt');
      if (!u || !same(h, u.hash)) return out({ error: 'Name or password is not correct.' }, 401);
      return out({ name: u.name, id: u.pid, secret: u.psecret });
    }
    if (url.pathname === '/password') {
      const next = typeof (body as { next?: unknown }).next === 'string' ? (body as { next: string }).next : '';
      if (this.limited(`l:${ip}`, 10)) return out({ error: 'Too many attempts. Wait a minute.' }, 429);
      const u = this.user(name);
      if (!u || !same(await hashPw(pw, u.salt), u.hash)) return out({ error: 'Current password is not correct.' }, 401);
      if (next.length < 6 || next.length > 128) return out({ error: 'New password needs at least 6 characters.' }, 400);
      const salt = rand(16);
      this.sql.exec('UPDATE users SET salt = ?, hash = ? WHERE name_lc = ?', salt, await hashPw(next, salt), u.name_lc);
      return out({ ok: true });
    }
    return out({ error: 'Not found' }, 404);
  }
}

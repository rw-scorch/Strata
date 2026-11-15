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
    this.sql.exec('CREATE TABLE IF NOT EXISTS supporters (pid TEXT PRIMARY KEY, customer TEXT, sub TEXT, status TEXT, until INTEGER NOT NULL DEFAULT 0, color TEXT)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS stripe_events (id TEXT PRIMARY KEY, at INTEGER NOT NULL)');
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
    if (url.pathname === '/supporter') return out(this.supporter(url.searchParams.get('pid') ?? ''));
    if (req.method !== 'POST') return out({ error: 'Method not allowed' }, 405);
    if (url.pathname.startsWith('/sup/')) return this.supporterOp(url.pathname, req);
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

  private supporter(pid: string): { active: boolean; until: number; color: string | null; status: string | null; customer: boolean } {
    const r = this.sql.exec<{ until: number; color: string | null; status: string | null; customer: string | null; [k: string]: SqlStorageValue }>('SELECT until, color, status, customer FROM supporters WHERE pid = ?', pid).toArray()[0];
    if (!r) return { active: false, until: 0, color: null, status: null, customer: false };
    const live = r.status === 'active' || r.status === 'trialing' || r.status === 'past_due';
    return { active: live && r.until > Date.now() - 3 * 86400_000, until: r.until, color: r.color, status: r.status, customer: !!r.customer };
  }

  private async supporterOp(path: string, req: Request): Promise<Response> {
    let b: Record<string, unknown>;
    try { b = JSON.parse((await req.text()).slice(0, 4096)); } catch { return out({ error: 'Invalid request' }, 400); }
    const str = (k: string) => (typeof b[k] === 'string' ? (b[k] as string).slice(0, 200) : '');
    if (path === '/sup/verify') {
      const u = this.sql.exec<UserRow>('SELECT * FROM users WHERE pid = ?', str('id')).toArray()[0];
      if (!u || !same(u.psecret, str('secret'))) return out({ error: 'Sign in again to manage your supporter status.' }, 401);
      const row = this.sql.exec<{ customer: string | null; [k: string]: SqlStorageValue }>('SELECT customer FROM supporters WHERE pid = ?', u.pid).toArray()[0];
      return out({ ...this.supporter(u.pid), ok: true, name: u.name, pid: u.pid, customerId: row?.customer ?? null });
    }
    if (path === '/sup/event') {
      const id = str('event');
      if (id) {
        if (this.sql.exec('SELECT id FROM stripe_events WHERE id = ?', id).toArray().length) return out({ ok: true, duplicate: true });
        this.sql.exec('INSERT INTO stripe_events (id, at) VALUES (?, ?)', id, Date.now());
        this.sql.exec('DELETE FROM stripe_events WHERE at < ?', Date.now() - 30 * 86400_000);
      }
      let pid = str('pid');
      const customer = str('customer'), sub = str('sub');
      if (!pid && customer) pid = (this.sql.exec<{ pid: string; [k: string]: SqlStorageValue }>('SELECT pid FROM supporters WHERE customer = ?', customer).toArray()[0]?.pid) ?? '';
      if (!pid) return out({ ok: false, error: 'No player for this event' });
      const until = typeof b.until === 'number' ? b.until : null;
      const status = str('status') || null;
      const cur = this.sql.exec('SELECT pid FROM supporters WHERE pid = ?', pid).toArray()[0];
      if (!cur) this.sql.exec('INSERT INTO supporters (pid, customer, sub, status, until) VALUES (?, ?, ?, ?, ?)', pid, customer || null, sub || null, status, until ?? 0);
      else this.sql.exec('UPDATE supporters SET customer = COALESCE(?, customer), sub = COALESCE(?, sub), status = COALESCE(?, status), until = COALESCE(?, until) WHERE pid = ?', customer || null, sub || null, status, until, pid);
      return out({ ok: true, pid });
    }
    if (path === '/sup/color') {
      const u = this.sql.exec<UserRow>('SELECT * FROM users WHERE pid = ?', str('id')).toArray()[0];
      if (!u || !same(u.psecret, str('secret'))) return out({ error: 'Not signed in.' }, 401);
      if (!this.supporter(u.pid).active) return out({ error: 'Name colours are a Supporter perk.' }, 403);
      const color = str('color');
      if (!/^#[0-9a-f]{6}$/i.test(color)) return out({ error: 'Pick one of the listed colours.' }, 400);
      this.sql.exec('UPDATE supporters SET color = ? WHERE pid = ?', color, u.pid);
      return out({ ok: true, color });
    }
    return out({ error: 'Not found' }, 404);
  }
}

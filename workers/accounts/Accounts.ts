import { DurableObject } from 'cloudflare:workers';
import { COS_BY_ID, CRATES, CRATE_BY_ID, KEY_CAP, cleanEquipped, crateOffer, dayIndex, priceOf, type Equipped } from '../../src/core/shop';

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

export type StaffRole = 'owner' | 'admin' | 'mod';

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
    this.sql.exec('CREATE TABLE IF NOT EXISTS wallet (pid TEXT PRIMARY KEY, shards INTEGER NOT NULL DEFAULT 0, keys INTEGER NOT NULL DEFAULT 0, daily INTEGER NOT NULL DEFAULT -1, equipped TEXT NOT NULL DEFAULT \'{}\')');
    this.sql.exec('CREATE TABLE IF NOT EXISTS owned (pid TEXT NOT NULL, item TEXT NOT NULL, at INTEGER NOT NULL, how TEXT, PRIMARY KEY (pid, item))');
    this.sql.exec('CREATE TABLE IF NOT EXISTS crates (pid TEXT NOT NULL, crate TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (pid, crate))');
    this.sql.exec('CREATE TABLE IF NOT EXISTS staff (pid TEXT PRIMARY KEY, role TEXT NOT NULL, by TEXT, at INTEGER NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS shard_orders (session TEXT PRIMARY KEY, pid TEXT NOT NULL, shards INTEGER NOT NULL, at INTEGER NOT NULL)');
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
    if (url.pathname === '/cosmetics') return out(this.equippedOf(url.searchParams.get('pid') ?? ''));
    if (url.pathname === '/staff') return out({ role: this.roleOf(url.searchParams.get('pid') ?? '') });
    if (url.pathname === '/staff/list') return out({ staff: this.staffList() });
    if (req.method !== 'POST') return out({ error: 'Method not allowed' }, 405);
    if (url.pathname.startsWith('/sup/')) return this.supporterOp(url.pathname, req);
    if (url.pathname.startsWith('/shop/')) return this.shopOp(url.pathname, req);
    if (url.pathname.startsWith('/staff/')) return this.staffOp(url.pathname, req);
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

  private ownerNames(): Set<string> {
    const raw = typeof this.env.OWNER_ACCOUNTS === 'string' ? this.env.OWNER_ACCOUNTS : '';
    return new Set(raw.split(',').map((n) => n.trim().toLowerCase()).filter((n) => NAME_RE.test(n)));
  }

  roleOf(pid: string): StaffRole | null {
    if (!pid) return null;
    const u = this.sql.exec<{ name_lc: string; [k: string]: SqlStorageValue }>('SELECT name_lc FROM users WHERE pid = ?', pid).toArray()[0];
    if (!u) return null;
    if (this.ownerNames().has(u.name_lc)) return 'owner';
    const r = this.sql.exec<{ role: string; [k: string]: SqlStorageValue }>('SELECT role FROM staff WHERE pid = ?', pid).toArray()[0]?.role;
    return r === 'admin' || r === 'mod' ? r : null;
  }

  private staffList(): { name: string; role: StaffRole }[] {
    const list: { name: string; role: StaffRole }[] = [];
    for (const n of this.ownerNames()) { const u = this.user(n); if (u) list.push({ name: u.name, role: 'owner' }); }
    for (const r of this.sql.exec<{ name: string; role: string; [k: string]: SqlStorageValue }>('SELECT u.name AS name, s.role AS role FROM staff s JOIN users u ON u.pid = s.pid ORDER BY s.role, u.name_lc').toArray()) {
      if (!this.ownerNames().has(r.name.toLowerCase())) list.push({ name: r.name, role: r.role as StaffRole });
    }
    return list;
  }

  private async staffOp(path: string, req: Request): Promise<Response> {
    let b: Record<string, unknown>;
    try { b = JSON.parse((await req.text()).slice(0, 2048)); } catch { return out({ error: 'Invalid request' }, 400); }
    const str = (k: string) => (typeof b[k] === 'string' ? (b[k] as string).slice(0, 200) : '');
    if (path === '/staff/verify') {
      const u = this.sql.exec<UserRow>('SELECT * FROM users WHERE pid = ?', str('id')).toArray()[0];
      if (!u || !same(u.psecret, str('secret'))) return out({ error: 'Sign in again.' }, 401);
      return out({ ok: true, pid: u.pid, name: u.name, role: this.roleOf(u.pid) });
    }
    if (path === '/staff/set') {
      if (this.roleOf(str('by')) !== 'owner') return out({ error: 'Only the server owner can hand out ranks.' }, 403);
      const target = this.user(str('name'));
      if (!target) return out({ error: 'No registered account has that name.' }, 404);
      if (this.ownerNames().has(target.name_lc)) return out({ error: 'Owner accounts are set in the server config and cannot be changed here.' }, 400);
      const role = str('role');
      if (role === 'none') this.sql.exec('DELETE FROM staff WHERE pid = ?', target.pid);
      else if (role === 'admin' || role === 'mod') this.sql.exec('INSERT INTO staff (pid, role, by, at) VALUES (?, ?, ?, ?) ON CONFLICT (pid) DO UPDATE SET role = excluded.role, by = excluded.by, at = excluded.at', target.pid, role, str('by'), Date.now());
      else return out({ error: 'Ranks are admin, mod or none.' }, 400);
      return out({ ok: true, name: target.name, pid: target.pid, role: role === 'none' ? null : role });
    }
    return out({ error: 'Not found' }, 404);
  }

  private wallet(pid: string): { shards: number; keys: number; daily: number; equipped: Equipped } {
    const r = this.sql.exec<{ shards: number; keys: number; daily: number; equipped: string; [k: string]: SqlStorageValue }>('SELECT shards, keys, daily, equipped FROM wallet WHERE pid = ?', pid).toArray()[0];
    if (!r) return { shards: 0, keys: 0, daily: -1, equipped: {} };
    let eq: unknown = {};
    try { eq = JSON.parse(r.equipped); } catch { /* bad row */ }
    return { shards: r.shards, keys: r.keys, daily: r.daily, equipped: cleanEquipped(eq) };
  }

  private ensureWallet(pid: string): void {
    this.sql.exec('INSERT OR IGNORE INTO wallet (pid) VALUES (?)', pid);
  }

  private ownedSet(pid: string): Set<string> {
    return new Set(this.sql.exec<{ item: string; [k: string]: SqlStorageValue }>('SELECT item FROM owned WHERE pid = ?', pid).toArray().map((r) => r.item));
  }

  private equippedOf(pid: string): Equipped {
    const eq = this.wallet(pid).equipped, own = this.ownedSet(pid), outEq: Equipped = {};
    for (const k of ['title', 'trail', 'cape'] as const) if (eq[k] && own.has(eq[k]!)) outEq[k] = eq[k];
    return outEq;
  }

  private opened(pid: string, crate: string): number {
    return this.sql.exec<{ n: number; [k: string]: SqlStorageValue }>('SELECT n FROM crates WHERE pid = ? AND crate = ?', pid, crate).toArray()[0]?.n ?? 0;
  }

  private shopState(pid: string): Record<string, unknown> {
    const w = this.wallet(pid), own = this.ownedSet(pid), day = dayIndex(Date.now());
    const offers: Record<string, string[]> = {};
    for (const c of CRATES) offers[c.id] = crateOffer(c, pid, this.opened(pid, c.id), day, own);
    return { ok: true, shards: w.shards, keys: w.keys, canClaim: w.daily < day && w.keys < KEY_CAP, owned: [...own], equipped: this.equippedOf(pid), offers };
  }

  private grant(pid: string, item: string, how: string): void {
    this.sql.exec('INSERT OR IGNORE INTO owned (pid, item, at, how) VALUES (?, ?, ?, ?)', pid, item, Date.now(), how);
  }

  private async shopOp(path: string, req: Request): Promise<Response> {
    let b: Record<string, unknown>;
    try { b = JSON.parse((await req.text()).slice(0, 4096)); } catch { return out({ error: 'Invalid request' }, 400); }
    const str = (k: string) => (typeof b[k] === 'string' ? (b[k] as string).slice(0, 200) : '');
    if (path === '/shop/grant') {
      const session = str('session'), pid = str('pid'), n = typeof b.shards === 'number' ? Math.floor(b.shards) : 0;
      if (!session || !pid || n <= 0 || n > 100000) return out({ error: 'Bad grant' }, 400);
      if (!this.sql.exec('SELECT pid FROM users WHERE pid = ?', pid).toArray().length) return out({ error: 'No such player' }, 404);
      if (this.sql.exec('SELECT session FROM shard_orders WHERE session = ?', session).toArray().length) return out({ ok: true, duplicate: true });
      this.sql.exec('INSERT INTO shard_orders (session, pid, shards, at) VALUES (?, ?, ?, ?)', session, pid, n, Date.now());
      this.ensureWallet(pid);
      this.sql.exec('UPDATE wallet SET shards = shards + ? WHERE pid = ?', n, pid);
      return out({ ok: true });
    }
    if (path === '/shop/adjust') {
      const u = this.user(str('name'));
      if (!u) return out({ error: 'No account with that name.' }, 404);
      const d = typeof b.shards === 'number' ? Math.trunc(b.shards) : 0, k = typeof b.keys === 'number' ? Math.trunc(b.keys) : 0;
      this.ensureWallet(u.pid);
      this.sql.exec('UPDATE wallet SET shards = MAX(0, shards + ?), keys = MIN(?, MAX(0, keys + ?)) WHERE pid = ?', d, KEY_CAP, k, u.pid);
      const item = str('item');
      if (item && COS_BY_ID.has(item)) { if (b.revoke === true) this.sql.exec('DELETE FROM owned WHERE pid = ? AND item = ?', u.pid, item); else this.grant(u.pid, item, 'admin'); }
      const w = this.wallet(u.pid);
      return out({ ok: true, name: u.name, shards: w.shards, keys: w.keys, owned: [...this.ownedSet(u.pid)] });
    }
    const u = this.sql.exec<UserRow>('SELECT * FROM users WHERE pid = ?', str('id')).toArray()[0];
    if (!u || !same(u.psecret, str('secret'))) return out({ error: 'Sign in again to use the shop.' }, 401);
    const pid = u.pid;
    if (path === '/shop/state') return out(this.shopState(pid));
    if (path === '/shop/daily') {
      const w = this.wallet(pid), day = dayIndex(Date.now());
      if (w.daily >= day) return out({ error: 'You have already claimed today\'s key. Come back tomorrow.' }, 409);
      if (w.keys >= KEY_CAP) return out({ error: `You can hold up to ${KEY_CAP} keys. Open a cache first.` }, 409);
      this.ensureWallet(pid);
      this.sql.exec('UPDATE wallet SET keys = keys + 1, daily = ? WHERE pid = ?', day, pid);
      return out(this.shopState(pid));
    }
    if (path === '/shop/buy') {
      const c = COS_BY_ID.get(str('item'));
      if (!c) return out({ error: 'That item is not in the shop.' }, 404);
      if (this.ownedSet(pid).has(c.id)) return out({ error: 'You already own that.' }, 409);
      const cost = priceOf(c);
      if (this.wallet(pid).shards < cost) return out({ error: 'Not enough shards.' }, 402);
      this.sql.exec('UPDATE wallet SET shards = shards - ? WHERE pid = ?', cost, pid);
      this.grant(pid, c.id, 'buy');
      return out(this.shopState(pid));
    }
    if (path === '/shop/crate') {
      const crate = CRATE_BY_ID.get(str('crate'));
      if (!crate) return out({ error: 'Unknown cache.' }, 404);
      const item = str('item'), pay = str('pay') === 'keys' ? 'keys' : 'shards';
      const offer = crateOffer(crate, pid, this.opened(pid, crate.id), dayIndex(Date.now()), this.ownedSet(pid));
      if (!offer.includes(item)) return out({ error: 'That choice is no longer on offer. The cache has been refreshed.' }, 409);
      const w = this.wallet(pid);
      if (pay === 'keys') {
        if (crate.keys === null) return out({ error: 'This cache can only be opened with shards.' }, 400);
        if (w.keys < crate.keys) return out({ error: 'Not enough keys.' }, 402);
        this.sql.exec('UPDATE wallet SET keys = keys - ? WHERE pid = ?', crate.keys, pid);
      } else {
        if (w.shards < crate.shards) return out({ error: 'Not enough shards.' }, 402);
        this.sql.exec('UPDATE wallet SET shards = shards - ? WHERE pid = ?', crate.shards, pid);
      }
      this.grant(pid, item, `crate:${crate.id}`);
      this.sql.exec('INSERT INTO crates (pid, crate, n) VALUES (?, ?, 1) ON CONFLICT (pid, crate) DO UPDATE SET n = n + 1', pid, crate.id);
      return out({ ...this.shopState(pid), got: item });
    }
    if (path === '/shop/equip') {
      const kind = str('kind') as keyof Equipped, item = str('item');
      if (kind !== 'title' && kind !== 'trail' && kind !== 'cape') return out({ error: 'Unknown slot.' }, 400);
      const eq = { ...this.wallet(pid).equipped };
      if (!item) delete eq[kind];
      else {
        if (COS_BY_ID.get(item)?.kind !== kind) return out({ error: 'That does not go in this slot.' }, 400);
        if (!this.ownedSet(pid).has(item)) return out({ error: 'You do not own that yet.' }, 403);
        eq[kind] = item;
      }
      this.ensureWallet(pid);
      this.sql.exec('UPDATE wallet SET equipped = ? WHERE pid = ?', JSON.stringify(eq), pid);
      return out(this.shopState(pid));
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

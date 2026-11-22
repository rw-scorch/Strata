import { DurableObject } from 'cloudflare:workers';

export interface RoomReport {
  code: string; name: string; owner: string; mode: string; difficulty: string; maxPlayers: number; createdAt: number; arena: string | null;
  players: { id: string; name: string; x: number; y: number; z: number; op: boolean; mode: string; health: number; dead: boolean; vanished?: boolean }[];
  voice: boolean;
}

/** One global instance. World rooms report who is online so admins can see every world. */
export class Registry extends DurableObject<Record<string, unknown>> {
  private sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Record<string, unknown>) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS rooms (code TEXT PRIMARY KEY, data TEXT NOT NULL, updated INTEGER NOT NULL, online INTEGER NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS featured (code TEXT PRIMARY KEY, blurb TEXT NOT NULL, ord INTEGER NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS aliases (code TEXT PRIMARY KEY, target TEXT NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS retired (code TEXT PRIMARY KEY)');
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/report' && req.method === 'POST') {
      const r = (await req.json()) as RoomReport;
      if (!r || typeof r.code !== 'string' || r.code.length > 12) return new Response('bad', { status: 400 });
      const body = JSON.stringify(r).slice(0, 60000);
      const online = Array.isArray(r.players) ? r.players.length : 0;
      this.sql.exec('INSERT INTO rooms (code, data, updated, online) VALUES (?, ?, ?, ?) ON CONFLICT(code) DO UPDATE SET data = excluded.data, updated = excluded.updated, online = excluded.online', r.code, body, Date.now(), online);
      return new Response('ok');
    }
    if (url.pathname === '/remove' && req.method === 'POST') {
      const { code } = (await req.json()) as { code: string };
      this.sql.exec('DELETE FROM rooms WHERE code = ?', String(code));
      return new Response('ok');
    }
    if (url.pathname === '/resolve') {
      const code = String(url.searchParams.get('code') ?? '');
      const a = this.sql.exec('SELECT target FROM aliases WHERE code = ?', code).toArray()[0];
      if (a) return Response.json({ target: a.target as string });
      const r = this.sql.exec('SELECT code FROM retired WHERE code = ?', code).toArray()[0];
      return Response.json({ target: r ? null : code });
    }
    if (url.pathname === '/recode' && req.method === 'POST') {
      const { from, to, target } = (await req.json()) as { from: string; to: string; target: string };
      if (this.sql.exec('SELECT code FROM aliases WHERE code = ?', to).toArray().length || this.sql.exec('SELECT code FROM rooms WHERE code = ?', to).toArray().length) return Response.json({ error: 'That code is already in use.' }, { status: 409 });
      this.sql.exec('DELETE FROM aliases WHERE code = ?', from);
      this.sql.exec('DELETE FROM retired WHERE code = ?', to);
      if (to !== target) this.sql.exec('INSERT INTO aliases (code, target) VALUES (?, ?)', to, target);
      this.sql.exec('INSERT OR IGNORE INTO retired (code) VALUES (?)', from);
      if (from === to) this.sql.exec('DELETE FROM retired WHERE code = ?', to);
      this.sql.exec('UPDATE rooms SET code = ? WHERE code = ?', to, from);
      this.sql.exec('UPDATE featured SET code = ? WHERE code = ?', to, from);
      return Response.json({ ok: true });
    }
    if (url.pathname === '/feature' && req.method === 'POST') {
      const { code, on, blurb } = (await req.json()) as { code: string; on: boolean; blurb?: string };
      if (on) {
        const n = this.sql.exec('SELECT COUNT(*) AS n FROM featured').one().n as number;
        this.sql.exec('INSERT INTO featured (code, blurb, ord) VALUES (?, ?, ?) ON CONFLICT(code) DO UPDATE SET blurb = excluded.blurb', String(code).slice(0, 12), String(blurb ?? '').slice(0, 140), n);
      } else this.sql.exec('DELETE FROM featured WHERE code = ?', String(code));
      return Response.json({ ok: true });
    }
    if (url.pathname === '/featured') {
      const now = Date.now();
      const rows = this.sql.exec('SELECT f.code AS code, f.blurb AS blurb, r.data AS data, r.updated AS updated FROM featured f LEFT JOIN rooms r ON r.code = f.code ORDER BY f.ord LIMIT 12').toArray();
      const worlds = rows.map((row) => {
        const d = row.data ? JSON.parse(row.data as string) as RoomReport : null;
        const live = !!d && now - (row.updated as number) < 150000;
        return { code: row.code as string, blurb: row.blurb as string, name: d?.name ?? (row.code as string), mode: d?.mode ?? 'survival', maxPlayers: d?.maxPlayers ?? 0, online: live ? d!.players.filter((p) => !p.vanished).length : 0 };
      });
      return Response.json({ worlds });
    }
    if (url.pathname === '/list') {
      const rows = this.sql.exec('SELECT data, updated, online FROM rooms ORDER BY online DESC, updated DESC LIMIT 500').toArray();
      const featured = new Set(this.sql.exec('SELECT code FROM featured').toArray().map((r) => r.code as string));
      const now = Date.now();
      const rooms = rows.map((row) => {
        const d = JSON.parse(row.data as string) as RoomReport;
        const live = now - (row.updated as number) < 150000;
        return { ...d, updated: row.updated as number, live, players: live ? d.players : [], featured: featured.has(d.code) };
      });
      return Response.json({ rooms, now });
    }
    return new Response('Not found', { status: 404 });
  }
}

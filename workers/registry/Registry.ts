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
    if (url.pathname === '/list') {
      const rows = this.sql.exec('SELECT data, updated, online FROM rooms ORDER BY online DESC, updated DESC LIMIT 500').toArray();
      const now = Date.now();
      const rooms = rows.map((row) => {
        const d = JSON.parse(row.data as string) as RoomReport;
        const live = now - (row.updated as number) < 150000;
        return { ...d, updated: row.updated as number, live, players: live ? d.players : [] };
      });
      return Response.json({ rooms, now });
    }
    return new Response('Not found', { status: 404 });
  }
}

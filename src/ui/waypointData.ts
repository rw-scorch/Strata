export interface Waypoint {
  id: string;
  name: string;
  x: number; y: number; z: number;
  color: string;
  shown: boolean;
  group?: string;
  icon?: string;
  death?: boolean;
  arrive?: boolean;
  beam?: boolean;
  created?: number;
}

export const WP_COLORS = ['#ff5a4e', '#ffb53b', '#ffe14d', '#5fd16b', '#45c6e8', '#5b7bff', '#c46bff', '#ffffff', '#ff7ac8', '#9a6a3a', '#7f8c8d', '#1abc9c'];

export const newId = (): string => Math.random().toString(36).slice(2, 10);

const clampName = (s: unknown, fb = 'Waypoint'): string => (String(s ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 32) || fb);
const num = (v: unknown): number | null => { const n = typeof v === 'string' ? Number(v.trim()) : typeof v === 'number' ? v : NaN; return Number.isFinite(n) && Math.abs(n) < 3e7 ? n : null; };
const hexColor = (v: unknown, i: number): string => {
  if (typeof v === 'string' && /^#?[0-9a-f]{6}$/i.test(v.trim())) return `#${v.trim().replace('#', '').toLowerCase()}`;
  if (typeof v === 'number' && Number.isFinite(v)) return `#${((v >>> 0) & 0xffffff).toString(16).padStart(6, '0')}`;
  return WP_COLORS[i % WP_COLORS.length];
};

export function normalize(raw: Partial<Waypoint> & Record<string, unknown>, i = 0): Waypoint | null {
  const x = num(raw.x), y = num(raw.y), z = num(raw.z);
  if (x === null || y === null || z === null) return null;
  return {
    id: typeof raw.id === 'string' && /^[a-z0-9]{4,16}$/i.test(raw.id) ? raw.id : newId(),
    name: clampName(raw.name),
    x: Math.floor(x), y: Math.floor(y), z: Math.floor(z),
    color: hexColor(raw.color, i),
    shown: raw.shown !== false,
    group: raw.group ? clampName(raw.group, '').slice(0, 24) || undefined : undefined,
    icon: typeof raw.icon === 'string' && raw.icon.trim() ? [...raw.icon.trim()].slice(0, 2).join('') : undefined,
    death: raw.death === true || undefined,
    arrive: raw.arrive === true || undefined,
    beam: raw.beam === false ? false : undefined,
    created: typeof raw.created === 'number' ? raw.created : Date.now(),
  };
}

export interface ExportFile { format: 'strata-waypoints'; version: 1; world: string; exportedAt: string; waypoints: Waypoint[] }

export function exportJson(world: string, list: Waypoint[]): string {
  const f: ExportFile = { format: 'strata-waypoints', version: 1, world, exportedAt: new Date().toISOString(), waypoints: list.map((w) => ({ ...w })) };
  return JSON.stringify(f, null, 2);
}

export function exportText(list: Waypoint[]): string {
  return list.map((w) => `${w.group ? `${w.group}/` : ''}${w.name}: ${w.x} ${w.y} ${w.z} ${w.color}`).join('\n');
}

export function exportXaero(list: Waypoint[]): string {
  const XAERO = ['#000000', '#0000aa', '#00aa00', '#00aaaa', '#aa0000', '#aa00aa', '#ffaa00', '#aaaaaa', '#555555', '#5555ff', '#55ff55', '#55ffff', '#ff5555', '#ff55ff', '#ffff55', '#ffffff'];
  const nearest = (c: string) => {
    const v = parseInt(c.slice(1), 16);
    let best = 15, bd = Infinity;
    XAERO.forEach((x, i) => { const u = parseInt(x.slice(1), 16); const d = ((u >> 16) - (v >> 16)) ** 2 + (((u >> 8) & 255) - ((v >> 8) & 255)) ** 2 + ((u & 255) - (v & 255)) ** 2; if (d < bd) { bd = d; best = i; } });
    return best;
  };
  const lines = ['#', '#waypoint:name:initials:x:y:z:color:disabled:type:set:rotate_on_tp:tp_yaw:visibility_type:destination', '#'];
  for (const w of list) {
    const nm = w.name.replace(/:/g, '§§');
    lines.push(`waypoint:${nm}:${(w.icon ?? w.name[0] ?? 'W').toUpperCase().replace(/:/g, '')}:${w.x}:${w.y}:${w.z}:${nearest(w.color)}:${!w.shown}:${w.death ? 1 : 0}:${w.group ?? 'gui.xaero_default'}:false:0:0:false`);
  }
  return lines.join('\n');
}

export interface ImportResult { waypoints: Waypoint[]; format: string }

function walkJson(node: unknown, out: Waypoint[], group: string | undefined, depth: number): void {
  if (depth > 12 || node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const n of node) walkJson(n, out, group, depth + 1); return; }
  const o = node as Record<string, unknown>;
  const pos = (o.pos ?? o.position ?? o.blockPos ?? o.coords) as Record<string, unknown> | number[] | undefined;
  let x: unknown = o.x, y: unknown = o.y, z: unknown = o.z;
  if (Array.isArray(pos) && pos.length >= 3) [x, y, z] = pos;
  else if (pos && typeof pos === 'object') { const q = pos as Record<string, unknown>; x = q.x ?? q.X; y = q.y ?? q.Y; z = q.z ?? q.Z; }
  const name = o.name ?? o.title ?? o.label;
  if (num(x) !== null && num(y) !== null && num(z) !== null && (typeof name === 'string' || typeof o.id === 'string')) {
    let color: unknown = o.color ?? o.colour;
    if (color === undefined && num(o.r) !== null && num(o.g) !== null && num(o.b) !== null) color = ((Number(o.r) & 255) << 16) | ((Number(o.g) & 255) << 8) | (Number(o.b) & 255);
    if (color && typeof color === 'object') {
      const c = color as Record<string, unknown>;
      if (num(c.r) !== null) color = ((Number(c.r) & 255) << 16) | ((Number(c.g) & 255) << 8) | (Number(c.b) & 255);
      else if (num(c.hue) !== null || num(c.h) !== null) color = hsvHex(Number(c.hue ?? c.h), Number(c.sat ?? c.s ?? 1), Number(c.val ?? c.v ?? 1));
    }
    const w = normalize({ name: typeof name === 'string' ? name : String(o.id), x: num(x)!, y: num(y)!, z: num(z)!, color: color as string, shown: !(o.hidden === true || o.enable === false || o.enabled === false), group: (typeof o.group === 'string' ? o.group : undefined) ?? group, icon: typeof o.icon === 'string' && o.icon.length <= 2 ? o.icon : undefined, death: o.deathWaypoint === true || o.type === 'Death' || o.death === true }, out.length);
    if (w) out.push(w);
    return;
  }
  const nextGroup = typeof o.name === 'string' && (Array.isArray(o.members) || Array.isArray(o.waypoints) || Array.isArray(o.children)) ? o.name : group;
  for (const [k, v] of Object.entries(o)) if (v && typeof v === 'object' && k !== 'color') walkJson(v, out, nextGroup, depth + 1);
}

function hsvHex(h: number, s: number, v: number): string {
  const hh = (((h > 1 ? h / 360 : h) % 1) + 1) % 1;
  const i = Math.floor(hh * 6), f = hh * 6 - i;
  const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  const [r, g, b] = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6];
  return `#${[r, g, b].map((c) => Math.round(Math.max(0, Math.min(1, c)) * 255).toString(16).padStart(2, '0')).join('')}`;
}

export function importWaypoints(text: string): ImportResult {
  const t = text.trim();
  if (!t) return { waypoints: [], format: 'empty' };
  if (t.startsWith('{') || t.startsWith('[')) {
    try {
      const j = JSON.parse(t) as Record<string, unknown>;
      const out: Waypoint[] = [];
      walkJson(j, out, undefined, 0);
      const fmt = j && typeof j === 'object' && !Array.isArray(j) ? String(j.format ?? '') : '';
      return { waypoints: out, format: fmt === 'strata-waypoints' ? 'Strata' : /wwaypoints/i.test(fmt) ? 'wWaypoints' : 'JSON' };
    } catch { /* fall through to text */ }
  }
  const out: Waypoint[] = [];
  let format = 'text';
  for (const line of t.split(/\r?\n/)) {
    const l = line.trim();
    if (!l || l.startsWith('#')) continue;
    if (l.startsWith('waypoint:')) {
      const f = l.split(':');
      if (f.length >= 7) {
        const XAERO = ['#000000', '#0000aa', '#00aa00', '#00aaaa', '#aa0000', '#aa00aa', '#ffaa00', '#aaaaaa', '#555555', '#5555ff', '#55ff55', '#55ffff', '#ff5555', '#ff55ff', '#ffff55', '#ffffff'];
        const w = normalize({ name: f[1].replace(/§§/g, ':'), icon: f[2], x: num(f[3]) ?? NaN, y: num(f[4]) ?? 64, z: num(f[5]) ?? NaN, color: XAERO[Number(f[6]) & 15], shown: f[7] !== 'true', death: f[8] === '1' || f[8] === '2', group: f[9] && f[9] !== 'gui.xaero_default' ? f[9] : undefined }, out.length);
        if (w) { out.push(w); format = 'Xaero'; continue; }
      }
    }
    if (/name:.*x:-?\d/i.test(l) && l.includes(',')) {
      const kv = Object.fromEntries(l.split(',').map((p) => { const i = p.indexOf(':'); return [p.slice(0, i).trim().toLowerCase(), p.slice(i + 1).trim()]; }));
      const c = kv.red !== undefined ? ((Math.round(Number(kv.red) * 255) << 16) | (Math.round(Number(kv.green) * 255) << 8) | Math.round(Number(kv.blue) * 255)) : undefined;
      const w = normalize({ name: kv.name?.replace(/~comma~/g, ','), x: num(kv.x) ?? NaN, y: num(kv.y) ?? 64, z: num(kv.z) ?? NaN, color: c as unknown as string, shown: kv.enabled !== 'false' }, out.length);
      if (w) { out.push(w); format = 'VoxelMap'; continue; }
    }
    const m = l.match(/^(?:(.*?)(?:\s*[:=]\s*|\s+-\s+|\s+))?\s*(?:x\s*[:=]?\s*)?(-?\d+(?:\.\d+)?)[\s,/]+(?:y\s*[:=]?\s*)?(-?\d+(?:\.\d+)?)[\s,/]+(?:z\s*[:=]?\s*)?(-?\d+(?:\.\d+)?)(?:\s+(#[0-9a-f]{6}))?\s*$/i);
    if (m) {
      let name = (m[1] ?? '').trim(), group: string | undefined;
      const slash = name.lastIndexOf('/');
      if (slash > 0) { group = name.slice(0, slash); name = name.slice(slash + 1); }
      const w = normalize({ name: name || `Waypoint ${out.length + 1}`, x: Number(m[2]), y: Number(m[3]), z: Number(m[4]), color: m[5], group }, out.length);
      if (w) out.push(w);
    }
  }
  return { waypoints: out, format };
}

const COORD_RE = /(?:^|[^\w.-])(?:x\s*[:=]?\s*)?(-?\d{1,8})(?:\s*,\s*|\s+)(?:y\s*[:=]?\s*)?(-?\d{1,3})(?:\s*,\s*|\s+)(?:z\s*[:=]?\s*)?(-?\d{1,8})(?=$|[^\w.])/i;

export function findCoords(text: string): { x: number; y: number; z: number } | null {
  const m = COORD_RE.exec(text);
  if (!m) return null;
  const x = Number(m[1]), y = Number(m[2]), z = Number(m[3]);
  if (y < -64 || y > 512) return null;
  return { x, y, z };
}

export function fmtDist(d: number): string {
  return d >= 10000 ? `${Math.round(d / 1000)}k` : d >= 1000 ? `${(d / 1000).toFixed(1)}k` : `${Math.round(d)}`;
}

import * as THREE from 'three';
import { h, clear } from './dom';
import { B, blockId, getBlock } from '../core/blocks';
import { WORLD_HEIGHT } from '../core/constants';

import { Waypoint, WP_COLORS, newId, normalize, importWaypoints, exportJson, exportXaero, exportText, fmtDist } from './waypointData';
export type { Waypoint } from './waypointData';

interface MapHost {
  pos(): { x: number; y: number; z: number; yaw: number };
  getBlock(x: number, y: number, z: number): number;
  isLoaded(x: number, z: number): boolean;
  players(): { name: string; x: number; z: number }[];
  camera: THREE.PerspectiveCamera;
  sendChat(text: string): void;
  toast(text: string): void;
  setModal(open: boolean): void;
}

const COLORS = WP_COLORS;
const WP_RE = /\[Waypoint\] (.{1,24}) at (-?\d{1,8}) (-?\d{1,4}) (-?\d{1,8})/;

const PALETTE: Record<number, number> = {
  [B.GRASS]: 0x6aa84f, [B.DIRT]: 0x8a6142, [B.STONE]: 0x808080, [B.COBBLESTONE]: 0x7a7a7a, [B.SAND]: 0xdccf9a, [B.GRAVEL]: 0x8e8580,
  [B.CLAY]: 0xa3a8b8, [B.SNOW]: 0xf4f8ff, [B.SNOWY_GRASS]: 0xeef4fa, [B.ICE]: 0x9cc0ff, [B.WATER]: 0x3f6fd8, [B.LAVA]: 0xe0601c,
  [B.OAK_LEAVES]: 0x3f8f2f, [B.BIRCH_LEAVES]: 0x6a9a3a, [B.SPRUCE_LEAVES]: 0x3a6040, [B.JUNGLE_LEAVES]: 0x2f9a20,
  [B.OAK_LOG]: 0x6b5232, [B.BIRCH_LOG]: 0xd8d2c0, [B.SPRUCE_LOG]: 0x4a3420, [B.JUNGLE_LOG]: 0x5a4422,
  [B.SANDSTONE]: 0xd8c890, [B.CACTUS]: 0x3f8030, [B.MUD]: 0x4a3c3a, [B.FARMLAND]: 0x6a4422, [B.OBSIDIAN]: 0x1c1430,
  [B.BEDROCK]: 0x404040, [B.GLASS]: 0xc8e0f0, [B.BRICKS]: 0x9a4a3a, [B.STONE_BRICKS]: 0x7a7a7a, [B.GLOWSTONE]: 0xf0d080,
};

function colorFor(v: number): number | null {
  const id = blockId(v);
  if (!id) return null;
  const c = PALETTE[id];
  if (c !== undefined) return c;
  const b = getBlock(v);
  if (b.render === 'cross' || b.render === 'torch' || b.render === 'none' || b.render === 'ladder' || b.render === 'crop') return null;
  if (b.category === 'functional') return 0xa07a50;
  if (b.render === 'leaves') return 0x3f8f2f;
  return 0x8a8a8a;
}

function hex(c: number, shade: number): string {
  const r = Math.min(255, ((c >> 16) & 255) * shade), g = Math.min(255, ((c >> 8) & 255) * shade), b = Math.min(255, (c & 255) * shade);
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

export class Minimap {
  private host: MapHost;
  private root: HTMLElement;
  private canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private coords: HTMLElement;
  private markers: HTMLElement;
  private markerEls = new Map<string, HTMLElement>();
  private cols = new Map<string, { c: string | null; h: number; t: number }>();
  private key: string;
  private lastDraw = 0;
  waypoints: Waypoint[] = [];
  private big: HTMLElement | null = null;
  private radius = 40;

  constructor(hudRoot: HTMLElement, host: MapHost, worldKey: string) {
    this.host = host;
    this.key = `strata.wp.${worldKey}`;
    this.worldKey = worldKey;
    try { this.waypoints = (JSON.parse(localStorage.getItem(this.key) ?? '[]') as Waypoint[]).map((w, i) => normalize(w as Waypoint & Record<string, unknown>, i)).filter((w): w is Waypoint => !!w); } catch { this.waypoints = []; }
    this.canvas = h('canvas', { class: 'mm-canvas', width: 160, height: 160 }) as HTMLCanvasElement;
    this.g = this.canvas.getContext('2d')!;
    this.coords = h('div', { class: 'mm-coords' });
    this.root = h('div', { class: 'minimap', title: 'Open map and waypoints', onclick: () => this.openBig() }, this.canvas, this.coords);
    this.markers = h('div', { class: 'wp-markers' });
    hudRoot.append(this.root, this.markers);
  }

  version = 0;
  hideAll = false;
  private worldKey = '';

  private save(): void { this.version++; try { localStorage.setItem(this.key, JSON.stringify(this.waypoints)); } catch { /* full */ } }

  get coordsAllowed(): boolean { return this.serverCoords; }
  get mapAllowed(): boolean { return this.serverMap; }

  visibleWaypoints(): Waypoint[] { return this.hideAll || !this.serverMap ? [] : this.waypoints.filter((w) => w.shown); }

  toggleHideAll(): void { this.hideAll = !this.hideAll; this.version++; this.host.toast(this.hideAll ? 'Waypoints hidden.' : 'Waypoints shown.'); }

  addDeath(x: number, y: number, z: number): void {
    const d = new Date();
    this.waypoints.push({ id: newId(), name: `Death ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`, x: Math.floor(x), y: Math.floor(y), z: Math.floor(z), color: '#ff5a4e', shown: true, group: 'Deaths', icon: 'X', death: true, arrive: true, created: Date.now() });
    const deaths = this.waypoints.filter((w) => w.death);
    if (deaths.length > 3) { const drop = new Set(deaths.slice(0, deaths.length - 3).map((w) => w.id)); this.waypoints = this.waypoints.filter((w) => !drop.has(w.id)); }
    this.save();
  }

  private prefMap = true;
  private prefCoords = true;
  private serverMap = true;
  private serverCoords = true;
  private visible = true;

  setVisible(v: boolean): void { this.visible = v; this.applyVis(); }

  setPrefs(map: boolean, coords: boolean): void { this.prefMap = map; this.prefCoords = coords; this.applyVis(); }

  setServerRules(map: boolean, coords: boolean): void { this.serverMap = map; this.serverCoords = coords; this.applyVis(); }

  private applyVis(): void {
    const map = this.visible && this.prefMap && this.serverMap;
    const coords = this.visible && this.prefCoords && this.serverCoords;
    this.root.style.display = map || coords ? '' : 'none';
    this.canvas.style.display = map ? '' : 'none';
    this.coords.style.display = coords ? '' : 'none';
    this.markers.style.display = map ? '' : 'none';
    this.root.style.pointerEvents = map ? '' : 'none';
  }

  private column(x: number, z: number, now: number): { c: string | null; h: number } {
    const k = `${x},${z}`;
    const hit = this.cols.get(k);
    if (hit && now - hit.t < 8000) return hit;
    if (!this.host.isLoaded(x, z)) return { c: null, h: 0 };
    let y = WORLD_HEIGHT - 1, c: number | null = null, water = 0;
    for (; y > 0; y--) {
      const v = this.host.getBlock(x, y, z);
      if (!blockId(v)) continue;
      if (blockId(v) === B.WATER) { water++; if (water === 1) c = PALETTE[B.WATER]; continue; }
      const cc = colorFor(v);
      if (cc === null) continue;
      if (!water) c = cc;
      break;
    }
    const shade = water ? Math.max(0.55, 1 - water * 0.06) : 1;
    const res = { c: c === null ? null : hex(c, shade), h: water ? y + water : y, t: now };
    this.cols.set(k, res);
    if (this.cols.size > 40000) this.cols.clear();
    return res;
  }

  update(): void {
    const now = performance.now();
    const p = this.host.pos();
    const fx = Math.floor(p.x), fy = Math.floor(p.y), fz = Math.floor(p.z);
    const dirs = ['S', 'SW', 'W', 'NW', 'N', 'NE', 'E', 'SE'];
    const deg = ((-p.yaw * 180) / Math.PI + 360) % 360;
    this.coords.textContent = `${fx}, ${fy}, ${fz}  ${dirs[Math.round(deg / 45) % 8]}`;
    this.updateMarkers(p);
    if (now - this.lastDraw < 250) return;
    this.lastDraw = now;
    this.draw(this.g, 160, this.radius, p, now);
  }

  private draw(g: CanvasRenderingContext2D, size: number, R: number, p: { x: number; z: number; yaw: number }, now: number): void {
    const cx = Math.floor(p.x), cz = Math.floor(p.z);
    const px = size / (R * 2);
    g.fillStyle = '#1b2230';
    g.fillRect(0, 0, size, size);
    for (let dz = -R; dz < R; dz++) {
      for (let dx = -R; dx < R; dx++) {
        const col = this.column(cx + dx, cz + dz, now);
        if (!col.c) continue;
        const north = this.column(cx + dx, cz + dz - 1, now);
        g.fillStyle = col.c;
        g.fillRect((dx + R) * px, (dz + R) * px, px + 0.6, px + 0.6);
        if (north.c && north.h !== col.h) { g.fillStyle = north.h < col.h ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.2)'; g.fillRect((dx + R) * px, (dz + R) * px, px + 0.6, px + 0.6); }
      }
    }
    const toMap = (x: number, z: number): [number, number, boolean] => {
      let mx = (x - p.x) * px + size / 2, mz = (z - p.z) * px + size / 2;
      const inside = mx >= 4 && mx <= size - 4 && mz >= 4 && mz <= size - 4;
      mx = Math.max(5, Math.min(size - 5, mx)); mz = Math.max(5, Math.min(size - 5, mz));
      return [mx, mz, inside];
    };
    for (const o of this.host.players()) {
      const [mx, mz] = toMap(o.x, o.z);
      g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 1.5;
      g.beginPath(); g.arc(mx, mz, 3.5, 0, Math.PI * 2); g.fill(); g.stroke();
    }
    for (const w of this.visibleWaypoints()) {
      const [mx, mz, inside] = toMap(w.x + 0.5, w.z + 0.5);
      g.save(); g.translate(mx, mz); g.rotate(Math.PI / 4);
      g.fillStyle = w.color; g.strokeStyle = '#000'; g.lineWidth = 1.5;
      const s = inside ? 4.5 : 3.5;
      g.fillRect(-s, -s, s * 2, s * 2); g.strokeRect(-s, -s, s * 2, s * 2);
      g.restore();
    }
    g.save();
    g.translate(size / 2, size / 2);
    g.rotate(-p.yaw + Math.PI);
    g.fillStyle = '#ff4040'; g.strokeStyle = '#fff'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(0, -7); g.lineTo(5, 5); g.lineTo(0, 2.5); g.lineTo(-5, 5); g.closePath(); g.fill(); g.stroke();
    g.restore();
    g.fillStyle = 'rgba(255,255,255,0.9)'; g.font = 'bold 11px system-ui, sans-serif'; g.textAlign = 'center';
    g.fillText('N', size / 2, 12);
  }

  private updateMarkers(p: { x: number; y: number; z: number }): void {
    const cam = this.host.camera;
    const v = new THREE.Vector3();
    const W = window.innerWidth, H = window.innerHeight;
    const seen = new Set<string>();
    let arrived: Waypoint | null = null;
    for (const w of this.visibleWaypoints()) {
      const dist = Math.hypot(w.x + 0.5 - p.x, w.y - p.y, w.z + 0.5 - p.z);
      if (w.arrive && dist < 4) { arrived = w; continue; }
      seen.add(w.id);
      let el = this.markerEls.get(w.id);
      if (!el) { el = h('div', { class: 'wp-marker' }); this.markers.appendChild(el); this.markerEls.set(w.id, el); }
      v.set(w.x + 0.5, w.y + 1.2, w.z + 0.5).project(cam);
      if (v.z > 1) { el.style.display = 'none'; continue; }
      const sx = ((v.x + 1) / 2) * W, sy = ((1 - v.y) / 2) * H;
      const near = Math.hypot(sx - W / 2, sy - H / 2) < 60;
      el.style.display = '';
      el.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -100%)`;
      el.style.setProperty('--wpc', w.color);
      el.style.opacity = near || dist < 64 ? '1' : '0.8';
      const label = near || dist < 24 ? `${w.name}  ${fmtDist(dist)}m` : `${fmtDist(dist)}m`;
      const key = `${w.icon ?? ''}|${label}`;
      if (el.dataset.k !== key) { el.dataset.k = key; el.innerHTML = ''; el.append(h('span', { class: 'wp-ic' }, w.icon ?? w.name[0]?.toUpperCase() ?? '?'), h('span', { class: 'wp-lb' }, label)); }
    }
    for (const [id, el] of this.markerEls) if (!seen.has(id)) { el.remove(); this.markerEls.delete(id); }
    if (arrived) { this.waypoints = this.waypoints.filter((w) => w !== arrived); this.save(); this.host.toast(`Reached ${arrived.name}.`); }
  }

  add(name: string, x: number, y: number, z: number, color?: string, extra: Partial<Waypoint> = {}): Waypoint {
    const w: Waypoint = { id: newId(), name: name.slice(0, 32) || 'Waypoint', x: Math.floor(x), y: Math.floor(y), z: Math.floor(z), color: color ?? COLORS[this.waypoints.length % COLORS.length], shown: true, created: Date.now(), ...extra };
    this.waypoints.push(w);
    this.save();
    return w;
  }

  /** Returns waypoint data if a chat message is a shared waypoint. */
  static parse(text: string): { name: string; x: number; y: number; z: number } | null {
    const m = WP_RE.exec(text);
    return m ? { name: m[1], x: Number(m[2]), y: Number(m[3]), z: Number(m[4]) } : null;
  }

  share(w: Waypoint): void {
    this.host.sendChat(`[Waypoint] ${w.name.replace(/\s+at\s+/gi, ' ')} at ${w.x} ${w.y} ${w.z}`);
    this.host.toast(`Shared ${w.name} in chat.`);
  }

  openBig(): void {
    if (this.big) return;
    this.host.setModal(true);
    const size = Math.min(window.innerWidth - 40, window.innerHeight - 260, 460);
    const cv = h('canvas', { class: 'mm-big', width: size, height: size }) as HTMLCanvasElement;
    const list = h('div', { class: 'wp-list' });
    const search = h('input', { class: 'input', maxlength: 32, placeholder: 'Search waypoints' }) as HTMLInputElement;
    const folded = new Set<string>();
    let zoom = 96;
    const coordsOk = this.serverCoords;
    const mapOk = this.serverMap;
    const redraw = () => { if (mapOk) this.draw(cv.getContext('2d')!, size, zoom, this.host.pos(), performance.now()); };
    const close = () => { this.big?.remove(); this.big = null; this.host.setModal(false); };
    const stop = (e: Event) => e.stopPropagation();
    const renderList = () => {
      clear(list);
      const q = search.value.trim().toLowerCase();
      const items = this.waypoints.filter((w) => !q || w.name.toLowerCase().includes(q) || (w.group ?? '').toLowerCase().includes(q));
      if (!items.length) { list.appendChild(h('div', { class: 'small muted' }, this.waypoints.length ? 'No matches.' : 'No waypoints yet. Press "New here" or B in game to drop one where you stand.')); return; }
      const groups = new Map<string, Waypoint[]>();
      for (const w of items) { const g = w.group ?? ''; if (!groups.has(g)) groups.set(g, []); groups.get(g)!.push(w); }
      const p = this.host.pos();
      for (const [g, ws] of [...groups].sort((a, b) => (a[0] === '' ? -1 : b[0] === '' ? 1 : a[0].localeCompare(b[0])))) {
        if (g) {
          const allShown = ws.every((w) => w.shown);
          list.appendChild(h('div', { class: 'wp-group' },
            h('button', { class: 'wp-fold', onclick: () => { if (folded.has(g)) folded.delete(g); else folded.add(g); renderList(); } }, `${folded.has(g) ? '+' : '-'} ${g} (${ws.length})`),
            h('button', { class: 'btn small', onclick: () => { for (const w of ws) w.shown = !allShown; this.save(); renderList(); redraw(); } }, allShown ? 'Hide all' : 'Show all'),
          ));
          if (folded.has(g)) continue;
        }
        for (const w of ws) {
          const d = Math.hypot(w.x - p.x, w.y - p.y, w.z - p.z);
          list.appendChild(h('div', { class: `wp-row${w.shown ? '' : ' off'}` },
            h('span', { class: 'wp-sw', style: `background:${w.color}` }, w.icon ?? ''),
            h('div', { class: 'wp-info' }, h('b', {}, w.name), h('div', { class: 'small muted' }, coordsOk ? `${w.x}, ${w.y}, ${w.z} · ${fmtDist(d)} m` : `${fmtDist(d)} m away`)),
            h('button', { class: 'btn small', onclick: () => this.editWaypoint(w, () => { renderList(); redraw(); }) }, 'Edit'),
            h('button', { class: 'btn small', onclick: () => { w.shown = !w.shown; this.save(); renderList(); redraw(); } }, w.shown ? 'Hide' : 'Show'),
            coordsOk ? h('button', { class: 'btn small', onclick: () => this.share(w) }, 'Share') : null,
          ));
        }
      }
    };
    const addHere = () => { const p = this.host.pos(); const w = this.add(`Waypoint ${this.waypoints.length + 1}`, p.x, p.y, p.z); this.editWaypoint(w, () => { renderList(); redraw(); }, true); };
    const download = (name: string, text: string, type: string) => {
      const url = URL.createObjectURL(new Blob([text], { type }));
      const a = h('a', { href: url, download: name }) as HTMLAnchorElement;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    };
    const safeName = this.worldKey.replace(/[^a-z0-9]+/gi, '_').slice(0, 40) || 'world';
    const exportMenu = () => {
      const box = h('div', { class: 'stack' },
        h('div', { class: 'small muted' }, `${this.waypoints.length} waypoints. Strata JSON keeps everything (groups, icons, colours). The Xaero format can be read by Xaero's Minimap and other tools.`),
        h('button', { class: 'btn primary block', onclick: () => download(`strata-waypoints-${safeName}.json`, exportJson(this.worldKey, this.waypoints), 'application/json') }, 'Download Strata JSON'),
        h('button', { class: 'btn block', onclick: () => download(`waypoints-${safeName}.txt`, exportXaero(this.waypoints), 'text/plain') }, 'Download Xaero format'),
        h('button', { class: 'btn block', onclick: async () => { try { await navigator.clipboard.writeText(exportJson(this.worldKey, this.waypoints)); this.host.toast('Copied all waypoints.'); } catch { this.host.toast('Copy failed.'); } } }, 'Copy all (JSON)'),
        h('button', { class: 'btn block', onclick: async () => { try { await navigator.clipboard.writeText(exportText(this.waypoints)); this.host.toast('Copied as text.'); } catch { this.host.toast('Copy failed.'); } } }, 'Copy as text lines'),
      );
      this.subModal('Export waypoints', box);
    };
    const importMenu = () => {
      const area = h('textarea', { class: 'input', rows: 6, placeholder: 'Paste waypoints here: Strata JSON, wWaypoints clipboard JSON, Xaero lines, VoxelMap lines, JourneyMap JSON, or lines like "Home: 120 64 -30".', style: 'width:100%;font-family:monospace;font-size:12px' }) as HTMLTextAreaElement;
      area.addEventListener('keydown', stop);
      const file = h('input', { type: 'file', accept: '.json,.txt,.points,.xaero,text/plain,application/json', style: 'display:none' }) as HTMLInputElement;
      const info = h('div', { class: 'small muted' }, 'Nothing loaded yet.');
      let parsed: Waypoint[] = [];
      const check = () => { const r = importWaypoints(area.value); parsed = r.waypoints; info.textContent = parsed.length ? `Found ${parsed.length} waypoint${parsed.length === 1 ? '' : 's'} (${r.format} format).` : 'No waypoints found in that text.'; };
      area.addEventListener('input', check);
      file.addEventListener('change', async () => { const f = file.files?.[0]; if (!f) return; if (f.size > 2_000_000) { info.textContent = 'That file is too large.'; return; } area.value = await f.text(); check(); });
      const apply = (replace: boolean) => {
        if (!parsed.length) { info.textContent = 'Load or paste some waypoints first.'; return; }
        if (replace) this.waypoints = [];
        const have = new Set(this.waypoints.map((w) => `${w.name}|${w.x}|${w.y}|${w.z}`));
        let n = 0;
        for (const w of parsed) { const k = `${w.name}|${w.x}|${w.y}|${w.z}`; if (have.has(k)) continue; have.add(k); this.waypoints.push({ ...w, id: newId() }); n++; }
        this.save(); renderList(); redraw(); closeSub(); this.host.toast(`Imported ${n} waypoint${n === 1 ? '' : 's'}.`);
      };
      const box = h('div', { class: 'stack' }, area, h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => file.click() }, 'Choose file...'), file), info,
        h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => apply(false) }, 'Add to my waypoints'), h('button', { class: 'btn danger', onclick: () => apply(true) }, 'Replace all')));
      const closeSub = this.subModal('Import waypoints', box);
    };
    search.addEventListener('keydown', stop);
    search.addEventListener('input', renderList);
    this.big = h('div', { class: 'modal-backdrop map-screen', onclick: (e: Event) => { if (e.target === this.big) close(); } },
      h('div', { class: 'card panel map-card' },
        h('div', { class: 'card-head' }, h('h2', {}, 'Map and waypoints'), h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: close, html: '&times;' })),
        h('div', { class: 'card-body' },
          mapOk ? h('div', { class: 'map-wrap' }, cv, h('div', { class: 'map-zoom' },
            h('button', { class: 'btn small', onclick: () => { zoom = Math.max(32, zoom / 1.5); redraw(); } }, '+'),
            h('button', { class: 'btn small', onclick: () => { zoom = Math.min(256, zoom * 1.5); redraw(); } }, '-'))) : h('div', { class: 'small muted' }, 'The map is turned off in this world.'),
          coordsOk ? h('div', { class: 'small muted' }, (() => { const p = this.host.pos(); return `You are at ${Math.floor(p.x)}, ${Math.floor(p.y)}, ${Math.floor(p.z)}`; })()) : null,
          h('div', { class: 'row wp-tools' },
            h('button', { class: 'btn primary', onclick: addHere }, 'New here'),
            h('button', { class: 'btn', onclick: importMenu }, 'Import'),
            h('button', { class: 'btn', onclick: exportMenu }, 'Export'),
            h('button', { class: 'btn ghost', onclick: () => { this.toggleHideAll(); close(); } }, this.hideAll ? 'Show in world' : 'Hide in world')),
          search,
          list)));
    document.getElementById('modals')!.appendChild(this.big);
    renderList();
    redraw();
  }

  private subModal(title: string, body: HTMLElement): () => void {
    const close = () => el.remove();
    const el = h('div', { class: 'modal-backdrop', style: 'z-index:80', onclick: (e: Event) => { if (e.target === el) close(); } },
      h('div', { class: 'card panel', style: 'max-width:520px;width:calc(100% - 24px)' },
        h('div', { class: 'card-head' }, h('h2', {}, title), h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: close, html: '&times;' })),
        h('div', { class: 'card-body' }, body)));
    document.getElementById('modals')!.appendChild(el);
    return close;
  }

  editWaypoint(w: Waypoint, done: () => void, isNew = false): void {
    const coordsOk = this.serverCoords;
    const d = { ...w };
    const stop = (e: Event) => e.stopPropagation();
    const field = (label: string, value: string, set: (v: string) => void, attrs: Record<string, string | number> = {}, grow = false) => {
      const i = h('input', { class: 'input', value, ...attrs, style: `${attrs.style ?? ''};width:100%;box-sizing:border-box` }) as HTMLInputElement;
      i.addEventListener('keydown', stop);
      i.addEventListener('input', () => set(i.value));
      return h('label', { class: 'field', style: grow ? 'flex:1;min-width:0' : '' }, h('span', {}, label), i);
    };
    const groups = [...new Set(this.waypoints.map((x) => x.group).filter((g): g is string => !!g))];
    const dl = h('datalist', { id: 'wp-groups' }, ...groups.map((g) => h('option', { value: g })));
    const sw = h('div', { class: 'row', style: 'flex-wrap:wrap;gap:6px' });
    const hexIn = h('input', { class: 'input', value: d.color, maxlength: 7, style: 'width:7em' }) as HTMLInputElement;
    const paintSw = () => { clear(sw); for (const c of WP_COLORS) sw.appendChild(h('button', { class: `wp-sw${c === d.color ? ' sel' : ''}`, style: `background:${c}`, onclick: () => { d.color = c; hexIn.value = c; paintSw(); } })); };
    hexIn.addEventListener('keydown', stop);
    hexIn.addEventListener('input', () => { if (/^#[0-9a-f]{6}$/i.test(hexIn.value)) { d.color = hexIn.value.toLowerCase(); paintSw(); } });
    paintSw();
    const xyz = coordsOk ? h('div', { class: 'row', style: 'gap:6px' },
      field('X', String(d.x), (v) => { d.x = Math.floor(Number(v)); }, { inputmode: 'numeric' }, true),
      field('Y', String(d.y), (v) => { d.y = Math.floor(Number(v)); }, { inputmode: 'numeric' }, true),
      field('Z', String(d.z), (v) => { d.z = Math.floor(Number(v)); }, { inputmode: 'numeric' }, true)) : h('div', { class: 'small muted' }, 'Coordinates are hidden in this world.');
    const tog = (label: string, on: boolean, set: (v: boolean) => void) => { const b = h('button', { class: `btn small${on ? ' primary' : ''}`, onclick: () => { on = !on; set(on); b.classList.toggle('primary', on); b.textContent = `${label}: ${on ? 'on' : 'off'}`; } }, `${label}: ${on ? 'on' : 'off'}`) as HTMLButtonElement; return b; };
    const body = h('div', { class: 'stack' },
      field('Name', d.name, (v) => { d.name = v.slice(0, 32); }, { maxlength: 32 }),
      xyz,
      coordsOk ? h('button', { class: 'btn small', onclick: () => { const p = this.host.pos(); d.x = Math.floor(p.x); d.y = Math.floor(p.y); d.z = Math.floor(p.z); close(); this.editWaypoint({ ...w, ...d }, done, isNew); } }, 'Use my position') : null,
      h('div', { class: 'row', style: 'gap:6px' },
        h('label', { class: 'field grow', style: 'flex:1;min-width:0' }, h('span', {}, 'Group'), (() => { const i = h('input', { class: 'input', value: d.group ?? '', list: 'wp-groups', maxlength: 24, placeholder: 'None' }) as HTMLInputElement; i.addEventListener('keydown', stop); i.addEventListener('input', () => { d.group = i.value.trim() || undefined; }); return i; })(), dl),
        (() => { const f = field('Icon', d.icon ?? '', (v) => { d.icon = [...v.trim()].slice(0, 2).join('') || undefined; }, { maxlength: 4, placeholder: d.name[0]?.toUpperCase() ?? '' }); f.style.cssText = 'width:5em;flex:none'; return f; })()),
      h('div', { class: 'field' }, h('span', {}, 'Colour'), sw, hexIn),
      h('div', { class: 'row', style: 'gap:6px;flex-wrap:wrap' },
        tog('Shown', d.shown, (v) => { d.shown = v; }),
        tog('Beam', d.beam !== false, (v) => { d.beam = v ? undefined : false; }),
        tog('Remove on arrival', !!d.arrive, (v) => { d.arrive = v || undefined; })),
      h('div', { class: 'row', style: 'gap:6px;justify-content:space-between' },
        h('button', { class: 'btn danger', onclick: () => { this.waypoints = this.waypoints.filter((x) => x.id !== w.id); this.save(); close(); done(); } }, 'Delete'),
        h('div', { class: 'row', style: 'gap:6px' },
          h('button', { class: 'btn ghost', onclick: () => { if (isNew) { this.waypoints = this.waypoints.filter((x) => x.id !== w.id); this.save(); } close(); done(); } }, 'Cancel'),
          h('button', { class: 'btn primary', onclick: () => {
            const n = normalize({ ...d } as Waypoint & Record<string, unknown>);
            if (!n) { this.host.toast('Those coordinates are not valid.'); return; }
            const i = this.waypoints.findIndex((x) => x.id === w.id);
            if (i >= 0) this.waypoints[i] = { ...n, id: w.id }; else this.waypoints.push({ ...n, id: w.id });
            this.save(); close(); done();
          } }, 'Save'))),
    );
    const close = this.subModal(isNew ? 'New waypoint' : 'Edit waypoint', body);
  }

  get isOpen(): boolean { return !!this.big; }

  dispose(): void { this.root.remove(); this.markers.remove(); this.big?.remove(); }
}

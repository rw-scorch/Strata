import * as THREE from 'three';
import { h, clear } from './dom';
import { B, blockId, getBlock } from '../core/blocks';
import { WORLD_HEIGHT } from '../core/constants';

export interface Waypoint { id: string; name: string; x: number; y: number; z: number; color: string; shown: boolean; }

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

const COLORS = ['#ff5a4e', '#ffb53b', '#ffe14d', '#5fd16b', '#45c6e8', '#5b7bff', '#c46bff', '#ffffff'];
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
    try { this.waypoints = JSON.parse(localStorage.getItem(this.key) ?? '[]'); } catch { this.waypoints = []; }
    this.canvas = h('canvas', { class: 'mm-canvas', width: 160, height: 160 }) as HTMLCanvasElement;
    this.g = this.canvas.getContext('2d')!;
    this.coords = h('div', { class: 'mm-coords' });
    this.root = h('div', { class: 'minimap', title: 'Open map and waypoints', onclick: () => this.openBig() }, this.canvas, this.coords);
    this.markers = h('div', { class: 'wp-markers' });
    hudRoot.append(this.root, this.markers);
  }

  private save(): void { try { localStorage.setItem(this.key, JSON.stringify(this.waypoints)); } catch { /* full */ } }

  setVisible(v: boolean): void { this.root.style.display = v ? '' : 'none'; this.markers.style.display = v ? '' : 'none'; }

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
    for (const w of this.waypoints) {
      if (!w.shown) continue;
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
    for (const w of this.waypoints) {
      if (!w.shown) continue;
      seen.add(w.id);
      let el = this.markerEls.get(w.id);
      if (!el) { el = h('div', { class: 'wp-marker' }); this.markers.appendChild(el); this.markerEls.set(w.id, el); }
      v.set(w.x + 0.5, w.y + 1.2, w.z + 0.5).project(cam);
      const behind = v.z > 1;
      if (behind) { el.style.display = 'none'; continue; }
      const dist = Math.round(Math.hypot(w.x + 0.5 - p.x, w.y - p.y, w.z + 0.5 - p.z));
      el.style.display = '';
      el.style.transform = `translate(${((v.x + 1) / 2) * W}px, ${((1 - v.y) / 2) * H}px) translate(-50%, -100%)`;
      el.style.setProperty('--wpc', w.color);
      el.textContent = `${w.name}  ${dist}m`;
    }
    for (const [id, el] of this.markerEls) if (!seen.has(id)) { el.remove(); this.markerEls.delete(id); }
  }

  add(name: string, x: number, y: number, z: number, color?: string): Waypoint {
    const w: Waypoint = { id: Math.random().toString(36).slice(2, 10), name: name.slice(0, 24) || 'Waypoint', x: Math.floor(x), y: Math.floor(y), z: Math.floor(z), color: color ?? COLORS[this.waypoints.length % COLORS.length], shown: true };
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
    const size = Math.min(window.innerWidth - 40, window.innerHeight - 220, 520);
    const cv = h('canvas', { class: 'mm-big', width: size, height: size }) as HTMLCanvasElement;
    const list = h('div', { class: 'wp-list' });
    const name = h('input', { class: 'input', maxlength: 24, placeholder: 'Waypoint name' }) as HTMLInputElement;
    let zoom = 96;
    const redraw = () => this.draw(cv.getContext('2d')!, size, zoom, this.host.pos(), performance.now());
    const close = () => { this.big?.remove(); this.big = null; this.host.setModal(false); };
    const renderList = () => {
      clear(list);
      if (!this.waypoints.length) list.appendChild(h('div', { class: 'small muted' }, 'No waypoints yet. Name one and tap Add here.'));
      for (const w of this.waypoints) {
        const p = this.host.pos();
        const d = Math.round(Math.hypot(w.x - p.x, w.z - p.z));
        list.appendChild(h('div', { class: 'wp-row' },
          h('button', { class: 'wp-sw', style: `background:${w.color}`, title: 'Change colour', onclick: () => { w.color = COLORS[(COLORS.indexOf(w.color) + 1) % COLORS.length]; this.save(); renderList(); redraw(); } }),
          h('div', { class: 'wp-info' }, h('b', {}, w.name), h('div', { class: 'small muted' }, `${w.x}, ${w.y}, ${w.z}  (${d} m)`)),
          h('button', { class: 'btn small', onclick: () => { w.shown = !w.shown; this.save(); renderList(); redraw(); } }, w.shown ? 'Hide' : 'Show'),
          h('button', { class: 'btn small', onclick: () => this.share(w) }, 'Share'),
          h('button', { class: 'btn small danger', onclick: () => { this.waypoints = this.waypoints.filter((x) => x !== w); this.save(); renderList(); redraw(); } }, 'Delete'),
        ));
      }
    };
    const addHere = () => { const p = this.host.pos(); this.add(name.value.trim() || `Waypoint ${this.waypoints.length + 1}`, p.x, p.y, p.z); name.value = ''; renderList(); redraw(); };
    this.big = h('div', { class: 'modal-backdrop map-screen', onclick: (e: Event) => { if (e.target === this.big) close(); } },
      h('div', { class: 'card panel map-card' },
        h('div', { class: 'card-head' }, h('h2', {}, 'Map and waypoints'), h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: close, html: '&times;' })),
        h('div', { class: 'card-body' },
          h('div', { class: 'map-wrap' }, cv, h('div', { class: 'map-zoom' },
            h('button', { class: 'btn small', onclick: () => { zoom = Math.max(32, zoom / 1.5); redraw(); } }, '+'),
            h('button', { class: 'btn small', onclick: () => { zoom = Math.min(160, zoom * 1.5); redraw(); } }, '-'))),
          h('div', { class: 'small muted' }, (() => { const p = this.host.pos(); return `You are at ${Math.floor(p.x)}, ${Math.floor(p.y)}, ${Math.floor(p.z)}`; })()),
          h('div', { class: 'row' }, name, h('button', { class: 'btn primary', onclick: addHere }, 'Add here')),
          list)));
    name.addEventListener('keydown', (e) => { e.stopPropagation(); if ((e as KeyboardEvent).key === 'Enter') addHere(); });
    document.getElementById('modals')!.appendChild(this.big);
    renderList();
    redraw();
  }

  get isOpen(): boolean { return !!this.big; }

  dispose(): void { this.root.remove(); this.markers.remove(); this.big?.remove(); }
}

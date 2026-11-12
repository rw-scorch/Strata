import * as THREE from 'three';
import { h, clear } from './dom';
import { buildVanilla, playerSpec, animateVanilla } from '../rendering/VanillaModels';
import { canvas64, detectSlim, readSkinFile, skinImage } from '../resources/skins';

interface Region { name: string; x: number; y: number; w: number; h: number; outer?: boolean }

const REGIONS: Region[] = [
  { name: 'Head', x: 0, y: 0, w: 32, h: 16 }, { name: 'Hat', x: 32, y: 0, w: 32, h: 16, outer: true },
  { name: 'Right leg', x: 0, y: 16, w: 16, h: 16 }, { name: 'Body', x: 16, y: 16, w: 24, h: 16 }, { name: 'Right arm', x: 40, y: 16, w: 16, h: 16 },
  { name: 'Right leg outer', x: 0, y: 32, w: 16, h: 16, outer: true }, { name: 'Jacket', x: 16, y: 32, w: 24, h: 16, outer: true }, { name: 'Right sleeve', x: 40, y: 32, w: 16, h: 16, outer: true },
  { name: 'Left leg outer', x: 0, y: 48, w: 16, h: 16, outer: true }, { name: 'Left leg', x: 16, y: 48, w: 16, h: 16 }, { name: 'Left arm', x: 32, y: 48, w: 16, h: 16 }, { name: 'Left sleeve', x: 48, y: 48, w: 16, h: 16, outer: true },
];

function mirrorLimbs(g: CanvasRenderingContext2D): void {
  const flip = (sx: number, sy: number, w: number, hh: number, dx: number, dy: number) => {
    const img = g.getImageData(sx, sy, w, hh);
    const out = g.createImageData(w, hh);
    for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) { const a = (y * w + x) * 4, b = (y * w + (w - 1 - x)) * 4; for (let k = 0; k < 4; k++) out.data[b + k] = img.data[a + k]; }
    g.putImageData(out, dx, dy);
  };
  const limb = (u: number, v: number, nu: number, nv: number) => {
    flip(u + 4, v, 4, 4, nu + 4, nv); flip(u + 8, v, 4, 4, nu + 8, nv);
    flip(u + 8, v + 4, 4, 12, nu, nv + 4); flip(u + 4, v + 4, 4, 12, nu + 4, nv + 4);
    flip(u, v + 4, 4, 12, nu + 8, nv + 4); flip(u + 12, v + 4, 4, 12, nu + 12, nv + 4);
  };
  limb(0, 16, 16, 48); limb(40, 16, 32, 48); limb(0, 32, 0, 48); limb(40, 32, 48, 48);
}

export class SkinPreview {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private cam: THREE.PerspectiveCamera;
  private model: THREE.Group | null = null;
  private tex: THREE.CanvasTexture;
  private yaw = 0.6;
  private raf = 0;
  private t = 0;
  private dragging = false;
  showOuter = true;
  private outerMeshes: THREE.Mesh[] = [];
  private rig: ReturnType<typeof buildVanilla>['rig'] | null = null;
  private spec = playerSpec(false);

  constructor(private src: HTMLCanvasElement, size: number) {
    this.canvas = h('canvas', { width: size, height: Math.round(size * 1.3), class: 'skin-3d' }) as HTMLCanvasElement;
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.cam = new THREE.PerspectiveCamera(32, 1 / 1.3, 0.1, 50);
    this.cam.position.set(0, 1.0, 4.4);
    this.cam.lookAt(0, 0.95, 0);
    this.tex = new THREE.CanvasTexture(src);
    this.tex.magFilter = THREE.NearestFilter; this.tex.minFilter = THREE.NearestFilter; this.tex.generateMipmaps = false; this.tex.flipY = false;
    this.tex.colorSpace = THREE.SRGBColorSpace;
    let lastX = 0;
    this.canvas.addEventListener('pointerdown', (e) => { this.dragging = true; lastX = e.clientX; this.canvas.setPointerCapture(e.pointerId); });
    this.canvas.addEventListener('pointermove', (e) => { if (this.dragging) { this.yaw += (e.clientX - lastX) * 0.012; lastX = e.clientX; } });
    this.canvas.addEventListener('pointerup', () => { this.dragging = false; });
  }

  setSlim(slim: boolean): void {
    this.spec = playerSpec(slim);
    if (this.model) this.scene.remove(this.model);
    const mat = new THREE.MeshBasicMaterial({ map: this.tex, alphaTest: 0.5, side: THREE.DoubleSide });
    const b = buildVanilla(this.spec, mat as unknown as THREE.ShaderMaterial, null, null);
    this.model = b.obj;
    this.rig = b.rig;
    this.outerMeshes = [];
    b.obj.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { const g = m.geometry as THREE.BufferGeometry; if (g.boundingBox === null) g.computeBoundingBox(); } });
    this.scene.add(this.model);
  }

  refresh(): void { this.tex.needsUpdate = true; }

  start(): void {
    const loop = () => {
      if (this.canvas.isConnected) this.attached = true;
      else if (this.attached || this.t > 10) { this.dispose(); return; }
      this.raf = requestAnimationFrame(loop);
      this.t += 1 / 60;
      if (!this.dragging) this.yaw += 0.004;
      if (this.model && this.rig) {
        this.model.rotation.y = this.yaw;
        animateVanilla(this.spec, this.rig, { ls: this.t * 3, amt: 0.35, age: this.t * 20, pitch: 0, aggressive: false, attack: 0, crouch: false, type: 'player' });
      }
      this.renderer.render(this.scene, this.cam);
    };
    loop();
  }

  private disposed = false;
  private attached = false;

  dispose(): void { if (this.disposed) return; this.disposed = true; cancelAnimationFrame(this.raf); this.tex.dispose(); this.renderer.dispose(); this.renderer.forceContextLoss(); }
}

export function openSkinEditor(start: HTMLCanvasElement, startSlim: boolean, onSave: (png: string, slim: boolean) => void, templates: { name: string; make: () => HTMLCanvasElement }[]): void {
  const c = canvas64();
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(start, 0, 0);
  let slim = startSlim;
  let tool: 'pen' | 'erase' | 'fill' | 'pick' = 'pen';
  let color = '#3a7bd5';
  const recent: string[] = ['#000000', '#ffffff', '#3a7bd5', '#c0392b', '#27ae60', '#f1c40f', '#8e5a3c', '#e8b98a'];
  const undo: ImageData[] = [], redo: ImageData[] = [];
  const snapshot = () => { undo.push(g.getImageData(0, 0, 64, 64)); if (undo.length > 60) undo.shift(); redo.length = 0; };
  const vw = Math.min(window.innerWidth - 40, 1000);
  const S = Math.max(4, Math.min(8, Math.floor(Math.min(vw * 0.55, window.innerHeight - 220) / 64)));
  const view = h('canvas', { width: 64 * S, height: 64 * S, class: 'skin-edit-canvas' }) as HTMLCanvasElement;
  const vg = view.getContext('2d')!;
  let showGrid = true, showLabels = false;
  const preview = new SkinPreview(c, Math.min(260, Math.max(160, vw - 64 * S - 80)));
  preview.setSlim(slim);
  const drawView = () => {
    vg.imageSmoothingEnabled = false;
    vg.clearRect(0, 0, view.width, view.height);
    for (let y = 0; y < 64; y += 2) for (let x = 0; x < 64; x += 2) { vg.fillStyle = (x + y) % 4 === 0 ? '#2b2f38' : '#22262e'; vg.fillRect(x * S, y * S, 2 * S, 2 * S); }
    vg.drawImage(c, 0, 0, 64 * S, 64 * S);
    if (showGrid) {
      vg.strokeStyle = 'rgba(255,255,255,0.07)'; vg.lineWidth = 1;
      vg.beginPath();
      for (let i = 0; i <= 64; i++) { vg.moveTo(i * S + 0.5, 0); vg.lineTo(i * S + 0.5, 64 * S); vg.moveTo(0, i * S + 0.5); vg.lineTo(64 * S, i * S + 0.5); }
      vg.stroke();
    }
    vg.strokeStyle = 'rgba(243,210,122,0.5)';
    for (const r of REGIONS) {
      vg.strokeRect(r.x * S + 0.5, r.y * S + 0.5, r.w * S - 1, r.h * S - 1);
      if (showLabels) { vg.fillStyle = r.outer ? 'rgba(150,200,255,0.9)' : 'rgba(243,210,122,0.95)'; vg.font = `${Math.max(9, S * 1.4)}px system-ui`; vg.fillText(r.name, r.x * S + 3, r.y * S + S * 2); }
    }
    preview.refresh();
  };
  const at = (e: PointerEvent): [number, number] => { const r = view.getBoundingClientRect(); return [Math.floor(((e.clientX - r.left) / r.width) * 64), Math.floor(((e.clientY - r.top) / r.height) * 64)]; };
  const hex = (d: Uint8ClampedArray) => `#${[d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  const setColor = (v: string) => { color = v; colorIn.value = v; if (!recent.includes(v)) { recent.unshift(v); recent.length = Math.min(recent.length, 12); } paintRecent(); };
  const fill = (x: number, y: number) => {
    const img = g.getImageData(0, 0, 64, 64), d = img.data;
    const region = REGIONS.find((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
    if (!region) return;
    const i0 = (y * 64 + x) * 4, t = [d[i0], d[i0 + 1], d[i0 + 2], d[i0 + 3]];
    const n = parseInt(color.slice(1), 16), nc = [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
    if (t.every((v, k) => v === nc[k])) return;
    const st = [[x, y]];
    while (st.length) {
      const [px, py] = st.pop()!;
      if (px < region.x || py < region.y || px >= region.x + region.w || py >= region.y + region.h) continue;
      const i = (py * 64 + px) * 4;
      if (d[i] !== t[0] || d[i + 1] !== t[1] || d[i + 2] !== t[2] || d[i + 3] !== t[3]) continue;
      d[i] = nc[0]; d[i + 1] = nc[1]; d[i + 2] = nc[2]; d[i + 3] = 255;
      st.push([px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]);
    }
    g.putImageData(img, 0, 0);
  };
  let painting = false, lastP: [number, number] | null = null;
  const plot = (x: number, y: number) => {
    if (x < 0 || y < 0 || x > 63 || y > 63) return;
    if (tool === 'erase') g.clearRect(x, y, 1, 1);
    else { g.fillStyle = color; g.fillRect(x, y, 1, 1); }
  };
  view.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const [x, y] = at(e);
    if (tool === 'pick') { setColor(hex(g.getImageData(x, y, 1, 1).data)); return; }
    snapshot();
    if (tool === 'fill') { fill(x, y); drawView(); return; }
    painting = true; lastP = [x, y];
    view.setPointerCapture(e.pointerId);
    plot(x, y); drawView();
  });
  view.addEventListener('pointermove', (e) => {
    if (!painting) return;
    const [x, y] = at(e);
    if (lastP) {
      const [lx, ly] = lastP, n = Math.max(Math.abs(x - lx), Math.abs(y - ly));
      for (let i = 1; i <= n; i++) plot(Math.round(lx + ((x - lx) * i) / n), Math.round(ly + ((y - ly) * i) / n));
    }
    lastP = [x, y];
    drawView();
  });
  view.addEventListener('pointerup', () => { painting = false; lastP = null; });
  const colorIn = h('input', { type: 'color', value: color, class: 'skin-color' }) as HTMLInputElement;
  colorIn.addEventListener('input', () => { color = colorIn.value; });
  colorIn.addEventListener('change', () => setColor(colorIn.value));
  const recentBox = h('div', { class: 'row skin-recent' });
  const paintRecent = () => { clear(recentBox); for (const r of recent) recentBox.appendChild(h('button', { class: `wp-sw${r === color ? ' sel' : ''}`, style: `background:${r}`, onclick: () => { color = r; colorIn.value = r; paintRecent(); } })); };
  paintRecent();
  const toolBtns = new Map<string, HTMLButtonElement>();
  const toolBtn = (id: typeof tool, label: string) => { const b = h('button', { class: 'btn small', onclick: () => { tool = id; for (const [k, x] of toolBtns) x.classList.toggle('primary', k === id); } }, label) as HTMLButtonElement; toolBtns.set(id, b); return b; };
  const tools = h('div', { class: 'row', style: 'gap:6px;flex-wrap:wrap' }, toolBtn('pen', 'Pencil'), toolBtn('erase', 'Eraser'), toolBtn('fill', 'Fill'), toolBtn('pick', 'Pick colour'));
  toolBtns.get('pen')!.classList.add('primary');
  const slimBtn = h('button', { class: 'btn small', onclick: () => { slim = !slim; slimBtn.textContent = `Arms: ${slim ? 'Slim' : 'Wide'}`; preview.setSlim(slim); } }, `Arms: ${slim ? 'Slim' : 'Wide'}`) as HTMLButtonElement;
  const file = h('input', { type: 'file', accept: 'image/png', style: 'display:none' }) as HTMLInputElement;
  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    if (!f) return;
    try {
      const r = await readSkinFile(f);
      const img = await skinImage(r.skin.png);
      snapshot(); g.clearRect(0, 0, 64, 64); g.drawImage(img, 0, 0);
      slim = r.skin.slim; slimBtn.textContent = `Arms: ${slim ? 'Slim' : 'Wide'}`; preview.setSlim(slim); drawView();
    } catch (e) { alert((e as Error).message); }
  });
  const actions = h('div', { class: 'row', style: 'gap:6px;flex-wrap:wrap' },
    h('button', { class: 'btn small', onclick: () => { const u = undo.pop(); if (u) { redo.push(g.getImageData(0, 0, 64, 64)); g.putImageData(u, 0, 0); drawView(); } } }, 'Undo'),
    h('button', { class: 'btn small', onclick: () => { const r = redo.pop(); if (r) { undo.push(g.getImageData(0, 0, 64, 64)); g.putImageData(r, 0, 0); drawView(); } } }, 'Redo'),
    h('button', { class: 'btn small', onclick: () => { snapshot(); mirrorLimbs(g); drawView(); } }, 'Copy right limbs to left'),
    h('button', { class: 'btn small', onclick: () => { snapshot(); for (const r of REGIONS) if (r.outer) g.clearRect(r.x, r.y, r.w, r.h); drawView(); } }, 'Clear outer layer'),
    h('button', { class: 'btn small', onclick: () => { showLabels = !showLabels; drawView(); } }, 'Labels'),
    h('button', { class: 'btn small', onclick: () => { showGrid = !showGrid; drawView(); } }, 'Grid'),
    slimBtn,
  );
  const tmpl = h('div', { class: 'row', style: 'gap:6px;flex-wrap:wrap' }, h('span', { class: 'small muted' }, 'Start from:'),
    ...templates.map((t) => h('button', { class: 'btn small ghost', onclick: () => { snapshot(); g.clearRect(0, 0, 64, 64); g.drawImage(t.make(), 0, 0); slim = detectSlim(c); slimBtn.textContent = `Arms: ${slim ? 'Slim' : 'Wide'}`; preview.setSlim(slim); drawView(); } }, t.name)),
    h('button', { class: 'btn small ghost', onclick: () => file.click() }, 'Import PNG...'), file);
  const close = () => { preview.dispose(); el.remove(); window.removeEventListener('keydown', keys, true); };
  const keys = (e: KeyboardEvent) => {
    e.stopPropagation();
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); const u = undo.pop(); if (u) { redo.push(g.getImageData(0, 0, 64, 64)); g.putImageData(u, 0, 0); drawView(); } }
    if (e.key === 'Escape') close();
  };
  window.addEventListener('keydown', keys, true);
  const el = h('div', { class: 'modal-backdrop', style: 'z-index:90' },
    h('div', { class: 'card panel skin-editor', style: `width:min(1040px, calc(100vw - 16px))` },
      h('div', { class: 'card-head' }, h('h2', {}, 'Skin editor'), h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: close, html: '&times;' })),
      h('div', { class: 'card-body' },
        h('div', { class: 'row', style: 'gap:14px;align-items:flex-start;flex-wrap:wrap' },
          h('div', { class: 'stack', style: 'gap:8px' }, view, tools, h('div', { class: 'row', style: 'gap:8px;align-items:center' }, colorIn, recentBox)),
          h('div', { class: 'stack', style: 'gap:8px;flex:1;min-width:160px' }, preview.canvas, h('div', { class: 'small muted' }, 'Drag the model to turn it. Pixels outside the outlined areas are not used by the game.'), actions, tmpl,
            h('div', { class: 'row', style: 'gap:6px;justify-content:flex-end' },
              h('button', { class: 'btn ghost', onclick: close }, 'Cancel'),
              h('button', { class: 'btn primary', onclick: () => {
                const png = c.toDataURL('image/png');
                if (png.length > 12000) { alert('This skin has too much detail to share in multiplayer (over 12 KB). Simplify it a little, for example by clearing unused areas.'); return; }
                onSave(png, slim); close();
              } }, 'Save skin'))))),
    ));
  document.getElementById('modals')!.appendChild(el);
  drawView();
  preview.start();
}

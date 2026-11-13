import { h, clear } from './dom';
import type { TextureAtlas } from '../resources/TextureAtlas';
import type { PlayerInv, ItemStack } from '../core/inventory';
import { armorPoints } from '../core/inventory';
import { getItem, maxDurability } from '../core/items';
import { xpLevel } from '../core/sim/WorldSim';
import type { Vitals } from '../game/Session';
import { getSettings, isTouchDevice } from '../storage/Settings';
import { guiFallback } from './mc/GuiPaint';
import { guiURL } from './mc/Gui';

export function slotContent(atlas: TextureAtlas, s: ItemStack | null, size: number): Node[] {
  if (!s) return [];
  const out: Node[] = [h('div', { class: 'ico', style: atlas.iconStyle(s.id, size) })];
  if (s.count > 1) out.push(h('span', { class: 'cnt' }, String(s.count)));
  const max = maxDurability(s.id);
  if (max && s.dmg) {
    const f = Math.max(0, 1 - s.dmg / max);
    const col = `hsl(${Math.round(f * 120)}, 85%, 50%)`;
    out.push(h('div', { class: 'dur' }, h('i', { style: `width:${Math.round(f * 100)}%;background:${col}` })));
  }
  return out;
}

function icon(src: string, x: number, y = 0): HTMLElement {
  return h('img', { src, alt: '', class: 'mc-icon', style: `left:calc(var(--hs) * ${x});top:calc(var(--hs) * ${y})` });
}

export function slotPx(): number {
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--slot')) || 46;
}

export class HUD {
  readonly root: HTMLElement;
  private hotbar: HTMLElement;
  private sidebar: HTMLElement;
  private offEl!: HTMLElement;
  private slots: HTMLElement[] = [];
  private hearts: HTMLElement;
  private food: HTMLElement;
  private armor: HTMLElement;
  private air: HTMLElement;
  private xpFill: HTMLElement;
  private xpLevel: HTMLElement;
  readonly crosshair: HTMLElement;
  private itemName: HTMLElement;
  private nameTimer = 0;
  readonly debug: HTMLElement;
  readonly fps: HTMLElement;
  private status: HTMLElement;
  private roomChip: HTMLElement;
  readonly chatBox: HTMLElement;
  private atlas: TextureAtlas;
  private lastSel = -1;
  private lastInvKey = '';
  private lastVit = '';
  private survival = true;
  onSlotTap: ((i: number) => void) | null = null;
  onSlotHold: ((i: number) => void) | null = null;
  onInventory: (() => void) | null = null;
  onRoomChip: (() => void) | null = null;
  private bossMsg: HTMLElement;

  constructor(parent: HTMLElement, atlas: TextureAtlas) {
    this.atlas = atlas;
    this.crosshair = h('div', { class: 'crosshair' });
    this.atkBar = h('div', { class: 'atk-ind' }, h('i'));
    this.hearts = h('div', { class: 'mc-row hearts' });
    this.food = h('div', { class: 'mc-row food' });
    this.armor = h('div', { class: 'mc-row armor' });
    this.air = h('div', { class: 'mc-row air' });
    this.xpFill = h('i', { class: 'xp-fill' });
    this.xpLevel = h('span', { class: 'xplevel' });
    this.hotbar = h('div', { class: 'mc-hotbar' });
    this.selEl = h('div', { class: 'mc-hotsel' });
    this.hotbar.appendChild(this.selEl);
    this.offEl = h('div', { class: 'mc-offhand' }, h('div', { class: 'slot mc' }));
    this.hotbar.appendChild(this.offEl);
    for (let i = 0; i < 9; i++) {
      const s = h('div', { class: 'slot mc hb', 'data-i': i, style: `left:calc(var(--hs) * ${20 * i + 2});top:calc(var(--hs) * 2)` });
      let timer = 0;
      let held = false;
      s.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        held = false;
        timer = window.setTimeout(() => { held = true; this.onSlotHold?.(i); }, 450);
      });
      s.addEventListener('pointerup', (e) => { e.stopPropagation(); clearTimeout(timer); if (!held) this.onSlotTap?.(i); });
      s.addEventListener('pointercancel', () => clearTimeout(timer));
      this.slots.push(s);
      this.hotbar.appendChild(s);
    }
    const invBtn = h('button', { class: 'hud-btn', 'aria-label': 'Inventory', html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="7" height="7"/><rect x="13" y="4" width="7" height="7"/><rect x="4" y="13" width="7" height="7"/><rect x="13" y="13" width="7" height="7"/></svg>' });
    invBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); this.onInventory?.(); });
    this.itemName = h('div', { class: 'item-name' });
    this.debug = h('div', { class: 'debug' });
    this.fps = h('div', { class: 'fps' });
    this.status = h('div', { class: 'chip', style: 'display:none' });
    this.roomChip = h('div', { class: 'chip', style: 'display:none;pointer-events:auto;cursor:pointer' });
    this.roomChip.addEventListener('click', () => this.onRoomChip?.());
    this.chatBox = h('div', { class: 'chat' });
    this.bossMsg = h('div', { class: 'boss-msg' });
    this.sidebar = h('div', { class: 'mc-sidebar', style: 'display:none' });
    this.root = h('div', { id: 'hud' },
      this.crosshair, this.atkBar, this.itemName, this.chatBox, this.debug, this.fps, this.bossMsg, this.sidebar,
      h('div', { class: 'hud-top' }, this.status, this.roomChip),
      h('div', { class: 'hud-mc' }, this.armor, this.air, this.hearts, this.food, h('div', { class: 'mc-xp' }, this.xpFill), this.xpLevel, this.hotbar, invBtn),
    );
    parent.appendChild(this.root);
    this.applySprites();
    this.layout();
    window.addEventListener('resize', () => this.layout());
  }

  private selEl: HTMLElement;
  private atkBar: HTMLElement;
  private atkShown = -1;

  setAttackCharge(c: number): void {
    const v = c >= 0.999 ? -1 : Math.round(c * 16);
    if (v === this.atkShown) return;
    this.atkShown = v;
    this.atkBar.style.display = v < 0 ? 'none' : 'block';
    if (v >= 0) (this.atkBar.firstChild as HTMLElement).style.width = `${(v / 16) * 100}%`;
  }
  hs = 2;

  layout(): void {
    const st = getSettings();
    const auto = Math.max(1, Math.min(Math.floor(window.innerWidth / 320), Math.floor(window.innerHeight / 240)));
    let s = st.guiScale > 0 ? st.guiScale : auto;
    if (isTouchDevice()) s = Math.max(2, s);
    s = Math.max(1, Math.min(6, Math.round(s * (st.hudScale || 1))));
    while (s > 1 && 182 * s + 80 > window.innerWidth) s--;
    this.hs = s;
    const r = document.documentElement;
    r.style.setProperty('--hs', `${s}px`);
    r.style.setProperty('--slot', `${20 * s}px`);
  }

  private applySprites(): void {
    const u = this.atlas.hudURLs;
    const root = document.documentElement;
    root.style.setProperty('--hb-img', `url(${u.hotbar ?? guiFallback('gs:hud/hotbar')!.toDataURL()})`);
    root.style.setProperty('--hb-sel', `url(${u.hotbar_selection ?? guiFallback('gs:hud/hotbar_selection')!.toDataURL()})`);
    { const off = this.atlas.guiURL('gs:hud/hotbar_offhand_left') ?? guiFallback('gs:hud/hotbar_offhand_left')?.toDataURL(); if (off) root.style.setProperty('--hb-off', `url(${off})`); }
    root.style.setProperty('--atk-bg', `url(${guiURL(this.atlas, 'gs:hud/crosshair_attack_indicator_background')})`);
    root.style.setProperty('--atk-fg', `url(${guiURL(this.atlas, 'gs:hud/crosshair_attack_indicator_progress')})`);
    root.style.setProperty('--xp-bg', `url(${guiURL(this.atlas, 'gs:hud/experience_bar_background')})`);
    root.style.setProperty('--xp-fg', `url(${guiURL(this.atlas, 'gs:hud/experience_bar_progress')})`);
    this.crosshair.classList.toggle('img', !!u.crosshair);
    root.style.setProperty('--xh-img', u.crosshair ? `url(${u.crosshair})` : 'none');
    document.body.classList.toggle('vanilla-slots', !!u.slot);
    root.style.setProperty('--slot-img', u.slot ? `url(${u.slot})` : 'none');
  }

  setAtlas(a: TextureAtlas): void { this.atlas = a; this.lastInvKey = ''; this.lastVit = ''; this.applySprites(); }

  show(v: boolean): void { this.root.classList.toggle('show', v); }

  updateInventory(inv: PlayerInv): void {
    const key = JSON.stringify(inv.slots.slice(0, 9)) + inv.selected + JSON.stringify(inv.off ?? null);
    if (key === this.lastInvKey) return;
    this.lastInvKey = key;
    const size = 16 * this.hs;
    const off = inv.off?.[0] ?? null;
    this.offEl.style.display = off ? 'block' : 'none';
    const os = this.offEl.firstElementChild as HTMLElement;
    clear(os);
    if (off) for (const n of slotContent(this.atlas, off, size)) os.appendChild(n);
    for (let i = 0; i < 9; i++) {
      const el = this.slots[i];
      clear(el);
      for (const n of slotContent(this.atlas, inv.slots[i], size)) el.appendChild(n);
      el.classList.toggle('sel', i === inv.selected);
    }
    this.selEl.style.left = `calc(var(--hs) * ${inv.selected * 20 - 1})`;
    if (inv.selected !== this.lastSel) {
      this.lastSel = inv.selected;
      const s = inv.slots[inv.selected];
      this.itemName.textContent = s ? getItem(s.id)?.name ?? '' : '';
      this.itemName.classList.add('show');
      this.nameTimer = 2;
    }
    this.renderArmor(armorPoints(inv));
  }

  private armorPts = 0;
  private renderArmor(pts: number): void {
    if (pts === this.armorPts && this.armor.childElementCount) return;
    this.armorPts = pts;
    clear(this.armor);
    if (!pts || !this.survival) return;
    const u = this.atlas.hudURLs;
    for (let i = 0; i < 10; i++) {
      const v = pts - i * 2;
      this.armor.appendChild(icon(v >= 2 ? u.armor : v === 1 ? u.armor_half : u.armor_empty, i * 8));
    }
  }

  foodStats = true;

  setSidebar(title: string | null, rows: [string, string][]): void {
    if (!title) { this.sidebar.style.display = 'none'; return; }
    this.sidebar.style.display = '';
    clear(this.sidebar);
    this.sidebar.appendChild(h('div', { class: 'sb-title' }, title));
    for (const [k, v] of rows) this.sidebar.appendChild(h('div', { class: 'sb-row' }, h('span', {}, k), h('span', { class: 'sb-val' }, v)));
  }

  private satCache = new Map<string, string | null>();

  private satOutline(src: string | null | undefined): string | null {
    if (!src) return null;
    if (this.satCache.has(src)) return this.satCache.get(src)!;
    this.satCache.set(src, null);
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth, hgt = img.naturalHeight;
      const c = document.createElement('canvas');
      c.width = w; c.height = hgt;
      const g = c.getContext('2d')!;
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, w, hgt);
      const out = g.createImageData(w, hgt);
      const op = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < hgt && d.data[(y * w + x) * 4 + 3] > 40;
      for (let y = 0; y < hgt; y++) for (let x = 0; x < w; x++) {
        if (!op(x, y)) continue;
        if (op(x - 1, y) && op(x + 1, y) && op(x, y - 1) && op(x, y + 1)) continue;
        const k = (y * w + x) * 4;
        out.data[k] = 255; out.data[k + 1] = 214; out.data[k + 2] = 60; out.data[k + 3] = 255;
      }
      g.putImageData(out, 0, 0);
      this.satCache.set(src, c.toDataURL());
      this.lastVit = '';
    };
    img.src = src;
    return null;
  }

  updateVitals(v: Vitals, hurtShake: boolean, held?: { hunger: number; saturation: number } | null): void {
    const flash = held && this.foodStats ? Math.floor(performance.now() / 400) % 2 : 0;
    const key = `${v.health}|${v.food}|${Math.ceil(v.air / 30)}|${v.xp}|${v.mode}|${this.foodStats ? Math.round(v.sat * 2) : 0}|${held ? `${held.hunger},${held.saturation},${flash}` : ''}`;
    this.survival = v.mode === 'survival';
    this.hearts.classList.toggle('shake', hurtShake);
    if (key === this.lastVit) return;
    this.lastVit = key;
    const u = this.atlas.hudURLs;
    clear(this.hearts); clear(this.food); clear(this.air);
    const surv = v.mode === 'survival';
    this.hearts.style.display = this.food.style.display = surv ? '' : 'none';
    (this.xpFill.parentElement as HTMLElement).style.visibility = surv ? 'visible' : 'hidden';
    this.xpLevel.style.visibility = surv ? 'visible' : 'hidden';
    if (surv) {
      const low = v.health <= 4;
      for (let i = 0; i < 10; i++) {
        const hv = v.health - i * 2;
        const jig = low ? Math.floor(Math.random() * 2) : 0;
        this.hearts.appendChild(icon(u.heart_empty, i * 8, jig));
        if (hv >= 1) this.hearts.appendChild(icon(hv >= 2 ? u.heart : u.heart_half, i * 8, jig));
        const fv = v.food - i * 2;
        const fx = 182 - 9 - i * 8;
        this.food.appendChild(icon(u.food_empty, fx));
        if (fv >= 1) this.food.appendChild(icon(fv >= 2 ? u.food : u.food_half, fx));
        if (this.foodStats) {
          const sv = v.sat - i * 2;
          const ol = this.satOutline(u.food);
          const part = (n: number) => `${(1 - Math.min(1, Math.ceil(Math.min(2, n) * 2) / 4)) * 100}%`;
          if (sv > 0 && ol) this.food.appendChild(icon(ol, fx)).style.clipPath = `inset(0 0 0 ${part(sv)})`;
          if (held && flash) {
            const nf = Math.min(20, v.food + held.hunger) - i * 2;
            if (nf > fv && nf >= 1) this.food.appendChild(icon(nf >= 2 ? u.food : u.food_half, fx)).classList.add('food-preview');
            const ns = Math.min(Math.min(20, v.food + held.hunger), v.sat + held.saturation) - i * 2;
            if (ns > Math.max(0, sv) && ol) { const e = icon(ol, fx); e.style.clipPath = `inset(0 0 0 ${part(ns)})`; e.classList.add('sat-preview'); this.food.appendChild(e); }
          }
        }
      }
      if (v.air < 300) {
        const bubbles = Math.ceil((v.air / 300) * 10);
        const empty = this.atlas.guiURL('gs:hud/air_empty');
        for (let i = 0; i < 10; i++) {
          if (i < bubbles) this.air.appendChild(icon(this.atlas.guiURL('gs:hud/air') ?? u.bubble, 182 - 9 - i * 8));
          else if (empty) this.air.appendChild(icon(empty, 182 - 9 - i * 8));
        }
      }
    }
    const xl = xpLevel(v.xp);
    this.xpFill.style.width = `${Math.round(xl.progress * 100)}%`;
    this.xpLevel.textContent = xl.level > 0 ? String(xl.level) : '';
    this.armorPts = -1;
  }

  tick(dt: number): void {
    if (this.nameTimer > 0) { this.nameTimer -= dt; if (this.nameTimer <= 0) this.itemName.classList.remove('show'); }
  }

  setStatus(text: string | null, kind: 'good' | 'warn' | 'bad' = 'good'): void {
    if (!text) { this.status.style.display = 'none'; return; }
    this.status.style.display = '';
    this.status.className = `chip ${kind === 'good' ? '' : kind}`;
    this.status.innerHTML = '';
    this.status.append(h('span', { class: 'dot' }), text);
  }

  setRoom(text: string | null): void {
    this.roomChip.style.display = text ? '' : 'none';
    this.roomChip.textContent = text ?? '';
  }

  setTarget(on: boolean): void { this.crosshair.classList.toggle('target', on); }

  message(text: string, seconds = 3): void {
    this.bossMsg.textContent = text;
    clearTimeout((this.bossMsg as HTMLElement & { _t?: number })._t);
    (this.bossMsg as HTMLElement & { _t?: number })._t = window.setTimeout(() => { this.bossMsg.textContent = ''; }, seconds * 1000);
  }
}

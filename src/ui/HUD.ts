import { h, clear } from './dom';
import type { TextureAtlas } from '../resources/TextureAtlas';
import type { PlayerInv, ItemStack } from '../core/inventory';
import { armorPoints } from '../core/inventory';
import { getItem, maxDurability } from '../core/items';
import { xpLevel } from '../core/sim/WorldSim';
import type { Vitals } from '../game/Session';

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

export function slotPx(): number {
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--slot')) || 46;
}

export class HUD {
  readonly root: HTMLElement;
  private hotbar: HTMLElement;
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
    this.hearts = h('div', { class: 'icons-row' });
    this.food = h('div', { class: 'icons-row right' });
    this.armor = h('div', { class: 'icons-row' });
    this.air = h('div', { class: 'icons-row right' });
    this.xpFill = h('i');
    this.xpLevel = h('span', { class: 'xplevel' });
    this.hotbar = h('div', { class: 'hotbar' });
    for (let i = 0; i < 9; i++) {
      const s = h('div', { class: 'slot', 'data-i': i });
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
    this.root = h('div', { id: 'hud' },
      this.crosshair, this.itemName, this.chatBox, this.debug, this.fps, this.bossMsg,
      h('div', { class: 'hud-top' }, this.status, this.roomChip),
      h('div', { class: 'hud-bottom' },
        h('div', { class: 'vitals' }, h('div', { class: 'stack', style: 'gap:2px' }, this.armor, this.hearts), h('div', { class: 'stack', style: 'gap:2px;align-items:flex-end' }, this.air, this.food)),
        h('div', { class: 'xpbar' }, this.xpFill, this.xpLevel),
        h('div', { class: 'hotbar-wrap' }, this.hotbar, invBtn),
      ),
    );
    parent.appendChild(this.root);
    this.applySprites();
  }

  private applySprites(): void {
    const u = this.atlas.hudURLs;
    const root = document.documentElement;
    this.hotbar.classList.toggle('vanilla', !!u.hotbar);
    root.style.setProperty('--hb-img', u.hotbar ? `url(${u.hotbar})` : 'none');
    root.style.setProperty('--hb-sel', u.hotbar_selection ? `url(${u.hotbar_selection})` : 'none');
    this.crosshair.classList.toggle('img', !!u.crosshair);
    root.style.setProperty('--xh-img', u.crosshair ? `url(${u.crosshair})` : 'none');
    document.body.classList.toggle('vanilla-slots', !!u.slot);
    root.style.setProperty('--slot-img', u.slot ? `url(${u.slot})` : 'none');
  }

  setAtlas(a: TextureAtlas): void { this.atlas = a; this.lastInvKey = ''; this.lastVit = ''; this.applySprites(); }

  show(v: boolean): void { this.root.classList.toggle('show', v); }

  updateInventory(inv: PlayerInv): void {
    const key = JSON.stringify(inv.slots.slice(0, 9)) + inv.selected;
    if (key === this.lastInvKey) return;
    this.lastInvKey = key;
    const size = slotPx() - 8;
    for (let i = 0; i < 9; i++) {
      const el = this.slots[i];
      clear(el);
      for (const n of slotContent(this.atlas, inv.slots[i], size)) el.appendChild(n);
      el.classList.toggle('sel', i === inv.selected);
    }
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
      this.armor.appendChild(h('img', { src: v >= 2 ? u.armor : v === 1 ? u.armor_half : u.armor_empty, alt: '' }));
    }
  }

  updateVitals(v: Vitals, hurtShake: boolean): void {
    const key = `${v.health}|${v.food}|${Math.ceil(v.air / 30)}|${v.xp}|${v.mode}`;
    this.survival = v.mode === 'survival';
    this.hearts.classList.toggle('shake', hurtShake);
    if (key === this.lastVit) return;
    this.lastVit = key;
    const u = this.atlas.hudURLs;
    clear(this.hearts); clear(this.food); clear(this.air);
    const surv = v.mode === 'survival';
    this.hearts.style.display = this.food.style.display = surv ? '' : 'none';
    (this.xpFill.parentElement as HTMLElement).style.visibility = surv ? 'visible' : 'hidden';
    if (surv) {
      for (let i = 0; i < 10; i++) {
        const hv = v.health - i * 2;
        this.hearts.appendChild(h('img', { src: hv >= 2 ? u.heart : hv >= 1 ? u.heart_half : u.heart_empty, alt: '' }));
        const fv = v.food - i * 2;
        this.food.appendChild(h('img', { src: fv >= 2 ? u.food : fv >= 1 ? u.food_half : u.food_empty, alt: '' }));
      }
      if (v.air < 300) {
        const bubbles = Math.ceil((v.air / 300) * 10);
        for (let i = 0; i < bubbles; i++) this.air.appendChild(h('img', { src: u.bubble, alt: '' }));
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

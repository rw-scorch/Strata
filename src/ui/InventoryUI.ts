import { h, clear } from './dom';
import { slotContent, slotPx } from './HUD';
import type { TextureAtlas } from '../resources/TextureAtlas';
import type { GameSession } from '../game/Session';
import { ItemStack, SlotRef, craftResult, countItem, InvOp } from '../core/inventory';
import { RECIPES, recipeSize, ingredientMatches, Recipe } from '../core/crafting';
import { ITEM_LIST, getItem, CREATIVE_HIDDEN, CreativeTab, maxDurability, fuelSeconds } from '../core/items';
import { findSmelt } from '../core/crafting';
import { drawAvatar } from './avatar';
import { audio } from '../audio/AudioEngine';

export type InvScreen = 'player' | 'creative' | 'workbench' | 'chest' | 'furnace';

const TABS: [CreativeTab | 'search' | 'all', string][] = [['all', 'All'], ['building', 'Building'], ['nature', 'Nature'], ['functional', 'Useful'], ['tools', 'Tools'], ['combat', 'Combat'], ['food', 'Food'], ['materials', 'Materials']];

export class InventoryUI {
  private root: HTMLElement;
  private screen: InvScreen = 'player';
  private session: GameSession | null = null;
  private atlas: TextureAtlas;
  private cursorEl: HTMLElement;
  private info: HTMLElement | null = null;
  private slotEls: { el: HTMLElement; ref: SlotRef | null; get: () => ItemStack | null; ghost?: number }[] = [];
  private tab: CreativeTab | 'all' = 'all';
  private search = '';
  private bookOpen = false;
  private container: { items: (ItemStack | null)[]; burn?: number; burnMax?: number; cook?: number } | null = null;
  isOpen = false;
  onClose: (() => void) | null = null;
  private pointer = { x: 0, y: 0 };
  private drag: { from: HTMLElement; startX: number; startY: number; active: boolean; pid: number; lp: number | null; long: boolean } | null = null;
  private lastTap = { el: null as HTMLElement | null, t: 0 };
  private creativeScroll = 0;

  constructor(parent: HTMLElement, atlas: TextureAtlas) {
    this.atlas = atlas;
    this.root = h('div', { class: 'screen dim inv-screen', style: 'display:none' });
    this.cursorEl = h('div', { class: 'cursor-item', style: 'display:none' });
    parent.appendChild(this.root);
    document.body.appendChild(this.cursorEl);
    const track = (e: PointerEvent) => { this.pointer = { x: e.clientX, y: e.clientY }; this.cursorEl.style.left = `${e.clientX}px`; this.cursorEl.style.top = `${e.clientY}px`; };
    this.root.addEventListener('pointermove', (e) => { track(e); this.onDragMove(e); });
    this.root.addEventListener('pointerdown', (e) => {
      track(e);
      if (e.target === this.root) {
        const cur = this.session?.me.inv.cursor;
        if (cur) this.op({ t: 'dropCursor', all: e.button !== 2 });
        else this.close();
      }
    });
    this.root.addEventListener('pointerup', (e) => this.onPointerUp(e));
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  setAtlas(a: TextureAtlas): void { this.atlas = a; if (this.isOpen) this.render(); }

  open(session: GameSession, screen: InvScreen): void {
    this.session = session;
    this.screen = screen;
    this.isOpen = true;
    this.root.style.display = 'flex';
    this.render();
    audio.play('ui.open');
  }

  setContainer(items: (ItemStack | null)[], burn?: number, burnMax?: number, cook?: number): void {
    this.container = { items, burn, burnMax, cook };
    if (this.isOpen) this.refresh();
  }

  close(fromServer = false): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.root.style.display = 'none';
    this.cursorEl.style.display = 'none';
    this.container = null;
    if (!fromServer) this.session?.invOp({ t: 'close' });
    this.onClose?.();
  }

  get current(): InvScreen { return this.screen; }

  private op(o: InvOp): void {
    this.session?.invOp(o);
    audio.play('ui.click', undefined, undefined, undefined, 0.5);
    this.refresh();
  }

  private slot(ref: SlotRef | null, get: () => ItemStack | null, extraClass = '', ghost?: number): HTMLElement {
    const el = h('div', { class: `slot ${extraClass}` });
    this.slotEls.push({ el, ref, get, ghost });
    el.addEventListener('pointerdown', (e) => this.onSlotDown(e, el));
    el.addEventListener('pointerenter', () => { el.classList.add('hover'); this.showInfo(get()); });
    el.addEventListener('pointerleave', () => el.classList.remove('hover'));
    return el;
  }

  private findSlot(el: Element | null): { el: HTMLElement; ref: SlotRef | null; get: () => ItemStack | null } | undefined {
    const s = el?.closest('.slot');
    return this.slotEls.find((x) => x.el === s);
  }

  private onSlotDown(e: PointerEvent, el: HTMLElement): void {
    e.stopPropagation();
    e.preventDefault();
    const s = this.findSlot(el);
    if (!s) return;
    this.showInfo(s.get());
    const touch = e.pointerType !== 'mouse';
    const special = (el as HTMLElement & { _action?: (e: PointerEvent) => void })._action;
    if (special) { special(e); return; }
    if (!s.ref) return;
    if (!touch) {
      if (e.shiftKey) this.op({ t: 'quick', s: s.ref });
      else this.op({ t: 'click', s: s.ref, b: e.button === 2 ? 1 : 0 });
      this.drag = { from: el, startX: e.clientX, startY: e.clientY, active: true, pid: e.pointerId, lp: null, long: false };
      return;
    }
    const d = { from: el, startX: e.clientX, startY: e.clientY, active: false, pid: e.pointerId, lp: null as number | null, long: false };
    d.lp = window.setTimeout(() => {
      if (this.drag !== d || d.active) return;
      d.long = true;
      this.op({ t: 'click', s: s.ref!, b: 1 });
      navigator.vibrate?.(15);
    }, 430);
    this.drag = d;
  }

  private onDragMove(e: PointerEvent): void {
    const d = this.drag;
    if (!d || d.pid !== e.pointerId) return;
    if (!d.active && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 10) {
      if (d.lp) clearTimeout(d.lp);
      d.active = true;
      const s = this.findSlot(d.from);
      if (s?.ref && !d.long && !this.session?.me.inv.cursor) this.op({ t: 'click', s: s.ref, b: 0 });
    }
  }

  private onPointerUp(e: PointerEvent): void {
    const d = this.drag;
    this.drag = null;
    if (!d || d.pid !== e.pointerId) return;
    if (d.lp) clearTimeout(d.lp);
    const over = document.elementFromPoint(e.clientX, e.clientY);
    const target = this.findSlot(over);
    const touch = e.pointerType !== 'mouse';
    if (d.active) {
      if (target && target.el !== d.from && target.ref && this.session?.me.inv.cursor) this.op({ t: 'click', s: target.ref, b: 0 });
      return;
    }
    if (!touch || d.long) return;
    const s = this.findSlot(d.from);
    if (!s?.ref) return;
    const now = performance.now();
    this.op({ t: 'click', s: s.ref, b: 0 });
    if (this.lastTap.el === d.from && now - this.lastTap.t < 320) {
      this.op({ t: 'quick', s: s.ref });
      this.lastTap = { el: null, t: 0 };
    } else this.lastTap = { el: d.from, t: now };
  }

  private showInfo(s: ItemStack | null): void {
    if (!this.info) return;
    clear(this.info);
    if (!s) return;
    const it = getItem(s.id);
    if (!it) return;
    const parts: (Node | string)[] = [h('b', {}, it.name)];
    if (it.desc) parts.push(h('br'), it.desc);
    const extra: string[] = [];
    const max = maxDurability(s.id);
    if (max) extra.push(`Durability ${max - (s.dmg ?? 0)} / ${max}`);
    if (it.food) extra.push(`Restores ${it.food.hunger / 2} hunger`);
    if (it.tool) extra.push(`Damage ${it.tool.damage}`);
    if (it.armor) extra.push(`Armour +${it.armor.points}`);
    if (fuelSeconds(s.id)) extra.push(`Fuel: ${fuelSeconds(s.id)}s`);
    if (findSmelt(s.id)) extra.push(`Smelts into ${getItem(findSmelt(s.id)!.result)?.name}`);
    if (extra.length) parts.push(h('br'), h('span', { style: 'color:var(--teal)' }, extra.join(' · ')));
    for (const p of parts) this.info.append(p);
  }

  refresh(): void {
    if (!this.isOpen || !this.session) return;
    const size = slotPx() - 8;
    for (const s of this.slotEls) {
      if ((s.el as HTMLElement & { _static?: boolean })._static) continue;
      clear(s.el);
      const st = s.get();
      for (const n of slotContent(this.atlas, st, size)) s.el.appendChild(n);
      if (!st && s.ghost !== undefined) {
        const g = h('div', { class: 'ico ghost-ico', style: this.atlas.iconStyle(s.ghost, size) });
        s.el.appendChild(g);
      }
    }
    const cur = this.session.me.inv.cursor;
    clear(this.cursorEl);
    if (cur) {
      for (const n of slotContent(this.atlas, cur, slotPx() - 6)) this.cursorEl.appendChild(n);
      this.cursorEl.style.display = 'block';
      this.cursorEl.style.left = `${this.pointer.x}px`;
      this.cursorEl.style.top = `${this.pointer.y}px`;
    } else this.cursorEl.style.display = 'none';
    this.refreshFurnace();
    this.refreshBook();
  }

  private flameEl: HTMLElement | null = null;
  private arrowEl: HTMLElement | null = null;
  private bookEl: HTMLElement | null = null;

  private refreshFurnace(): void {
    if (!this.flameEl || !this.arrowEl) return;
    const c = this.container;
    const burn = c?.burnMax ? (c.burn ?? 0) / c.burnMax : 0;
    this.flameEl.style.height = `${Math.round(burn * 100)}%`;
    this.arrowEl.style.width = `${Math.round(((c?.cook ?? 0) / 200) * 100)}%`;
  }

  private render(): void {
    const s = this.session!;
    this.slotEls = [];
    clear(this.root);
    this.flameEl = this.arrowEl = this.bookEl = null;
    const inv = s.me.inv;
    const ref = (c: SlotRef['c'], i: number): SlotRef => ({ c, i });
    const invGrid = () => {
      const main = h('div', { class: 'grid grid-9' });
      for (let i = 9; i < 36; i++) main.appendChild(this.slot(ref('inv', i), () => inv.slots[i]));
      const bar = h('div', { class: 'grid grid-9', style: 'margin-top:6px' });
      for (let i = 0; i < 9; i++) bar.appendChild(this.slot(ref('inv', i), () => inv.slots[i]));
      return h('div', {}, main, bar);
    };
    this.info = h('div', { class: 'inv-info' });
    const closeBtn = h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: () => this.close(), html: '&times;' });
    let top: HTMLElement;
    const titleFor: Record<InvScreen, string> = { player: 'Inventory', creative: 'Architect\'s Palette', workbench: 'Workbench', chest: 'Chest', furnace: 'Furnace' };
    const head = h('div', { class: 'inv-title' }, h('span', { class: 'grow' }, titleFor[this.screen]), this.bookToggle(), closeBtn);
    if (this.screen === 'player' || this.screen === 'workbench') {
      const n = this.screen === 'workbench' ? 3 : 2;
      const craft = h('div', { class: `grid grid-${n}` });
      for (let i = 0; i < n * n; i++) craft.appendChild(this.slot(ref('craft', i), () => inv.craft[i]));
      const out = this.slot(ref('out', 0), () => craftResult(inv)?.stack ?? null, 'out');
      const parts: HTMLElement[] = [];
      if (this.screen === 'player') {
        const armor = h('div', { class: 'armor-col' });
        const ghosts = [330, 331, 332, 333];
        for (let i = 0; i < 4; i++) armor.appendChild(this.slot(ref('armor', i), () => inv.armor[i], '', ghosts[i] + 4));
        const prev = h('div', { class: 'player-preview' }, drawAvatar(s.me.appearance, 4, true));
        parts.push(armor, prev);
      }
      parts.push(h('div', { class: 'craft-row' }, craft, h('span', { class: 'arrow' }, '→'), out));
      top = h('div', { class: 'inv-top' }, ...parts);
    } else if (this.screen === 'chest') {
      const g = h('div', { class: 'grid grid-9' });
      for (let i = 0; i < 27; i++) g.appendChild(this.slot(ref('cont', i), () => this.container?.items[i] ?? null));
      top = g;
    } else if (this.screen === 'furnace') {
      this.flameEl = h('i');
      this.arrowEl = h('i');
      top = h('div', { class: 'furnace-row' },
        h('div', { class: 'stack', style: 'gap:2px' }, this.slot(ref('cont', 0), () => this.container?.items[0] ?? null), h('div', { class: 'flame' }, this.flameEl), this.slot(ref('cont', 1), () => this.container?.items[1] ?? null, '', 260)),
        h('div', { class: 'progress-arrow' }, this.arrowEl),
        this.slot(ref('cont', 2), () => this.container?.items[2] ?? null, 'out'),
      );
    } else {
      top = this.creativePanel();
    }
    const panel = h('div', { class: 'panel inv-panel' }, head, top, invGrid(), this.info);
    const wrap = h('div', { class: 'inv-wrap' });
    if (this.bookOpen && (this.screen === 'player' || this.screen === 'workbench')) wrap.appendChild(this.recipeBook());
    wrap.appendChild(panel);
    this.root.appendChild(wrap);
    this.refresh();
  }

  private bookToggle(): HTMLElement | null {
    if (this.screen !== 'player' && this.screen !== 'workbench') return null;
    return h('button', { class: 'btn small ghost', onclick: () => { this.bookOpen = !this.bookOpen; this.render(); } }, this.bookOpen ? 'Hide recipes' : 'Recipes');
  }

  private recipeBook(): HTMLElement {
    const list = h('div', { class: 'recipe-list' });
    const input = h('input', { class: 'input', placeholder: 'Search recipes', value: this.search, oninput: (e: Event) => { this.search = (e.target as HTMLInputElement).value; this.refreshBook(); } });
    this.bookEl = list;
    const box = h('div', { class: 'panel recipe-book' }, h('div', { class: 'inv-title' }, 'Recipe book'), input, h('div', { class: 'small muted' }, 'Tap a lit recipe to fill the grid. Hold Shift or long-press to fill as many as possible.'), list);
    return box;
  }

  private canCraft(r: Recipe): boolean {
    const inv = this.session!.me.inv;
    const need = new Map<string, number>();
    const ings = r.shapeless ?? r.pattern!.join('').split('').filter((c) => c !== ' ').map((c) => r.key![c]);
    for (const i of ings) need.set(String(i), (need.get(String(i)) ?? 0) + 1);
    for (const [ing, n] of need) {
      let have = 0;
      const key = isNaN(Number(ing)) ? ing : Number(ing);
      for (const s of [...inv.slots, ...inv.craft]) if (s && ingredientMatches(key as never, s.id)) have += s.count;
      if (have < n) return false;
    }
    return true;
  }

  private refreshBook(): void {
    const list = this.bookEl;
    if (!list || !this.session) return;
    clear(list);
    const size = this.session.me.inv.craftSize;
    const q = this.search.trim().toLowerCase();
    const size2 = slotPx() - 8;
    const recipes = RECIPES.filter((r) => { const s = recipeSize(r); return s.w <= size && s.h <= size; })
      .filter((r) => !q || (getItem(r.result)?.name.toLowerCase().includes(q) ?? false))
      .map((r) => ({ r, ok: this.canCraft(r) }))
      .sort((a, b) => Number(b.ok) - Number(a.ok));
    for (const { r, ok } of recipes) {
      const el = h('div', { class: `slot${ok ? '' : ' no'}`, title: getItem(r.result)?.name ?? '' });
      for (const n of slotContent(this.atlas, { id: r.result, count: r.count }, size2)) el.appendChild(n);
      let lp = 0;
      let long = false;
      el.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        this.showInfo({ id: r.result, count: 1 });
        long = false;
        if (e.pointerType !== 'mouse') lp = window.setTimeout(() => { long = true; if (ok) this.op({ t: 'fill', r: r.id, all: true }); }, 450);
        else if (ok) this.op({ t: 'fill', r: r.id, all: e.shiftKey });
      });
      el.addEventListener('pointerup', (e) => { clearTimeout(lp); if (e.pointerType !== 'mouse' && !long && ok) this.op({ t: 'fill', r: r.id, all: false }); });
      list.appendChild(el);
    }
    void countItem;
  }

  private creativePanel(): HTMLElement {
    const tabs = h('div', { class: 'creative-tabs' });
    for (const [id, label] of TABS) {
      if (id === 'search') continue;
      tabs.appendChild(h('button', { class: this.tab === id ? 'on' : '', onclick: () => { this.tab = id as CreativeTab | 'all'; this.creativeScroll = 0; this.render(); } }, label));
    }
    const search = h('input', { class: 'input', placeholder: 'Search items', value: this.search, oninput: (e: Event) => { this.search = (e.target as HTMLInputElement).value; fill(); } });
    const grid = h('div', { class: 'grid grid-9' });
    const scroller = h('div', { class: 'creative-grid' }, grid);
    scroller.addEventListener('scroll', () => { this.creativeScroll = scroller.scrollTop; });
    const fill = () => {
      clear(grid);
      this.slotEls = this.slotEls.filter((s) => s.ref !== null || !grid.contains(s.el));
      const q = this.search.trim().toLowerCase();
      const items = ITEM_LIST.filter((it) => !CREATIVE_HIDDEN.has(it.id) && (this.tab === 'all' || it.tab === this.tab) && (!q || it.name.toLowerCase().includes(q) || it.key.includes(q)));
      const size = slotPx() - 8;
      for (const it of items) {
        const el = this.slot(null, () => ({ id: it.id, count: 1 }));
        for (const n of slotContent(this.atlas, { id: it.id, count: 1 }, size)) el.appendChild(n);
        (el as HTMLElement & { _action?: (e: PointerEvent) => void })._action = (e: PointerEvent) => {
          const cur = this.session!.me.inv.cursor;
          if (cur) { this.op({ t: 'creativeDelete' }); return; }
          if (e.shiftKey) {
            const inv = this.session!.me.inv;
            const free = inv.slots.findIndex((x) => !x);
            if (free >= 0) this.op({ t: 'creative', id: it.id, count: it.maxStack, s: { c: 'inv', i: free } });
            return;
          }
          this.op({ t: 'creative', id: it.id, count: e.button === 2 ? 1 : it.maxStack });
        };
        grid.appendChild(el);
      }
      requestAnimationFrame(() => { scroller.scrollTop = this.creativeScroll; });
    };
    fill();
    const trash = this.slot(null, () => null, 'trash');
    (trash as HTMLElement & { _static?: boolean })._static = true;
    (trash as HTMLElement & { _action?: () => void })._action = () => { if (this.session!.me.inv.cursor) this.op({ t: 'creativeDelete' }); };
    const trashWrap = h('div', { class: 'row' }, h('span', { class: 'small muted grow' }, 'Tap an item to pick up a full stack. Drop it in your inventory below.'), h('span', { class: 'small muted' }, 'Delete'), trash);
    trash.append(h('span', { html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>', style: 'position:absolute;inset:8px;color:var(--danger)' }));
    return h('div', { class: 'stack' }, tabs, search, scroller, trashWrap);
  }
}

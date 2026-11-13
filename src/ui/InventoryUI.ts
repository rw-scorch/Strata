import { h, clear } from './dom';
import { slotContent } from './HUD';
import type { TextureAtlas } from '../resources/TextureAtlas';
import type { GameSession, TradeInfo } from '../game/Session';
import { ItemStack, SlotRef, craftResult, countItem, InvOp, PlayerInv } from '../core/inventory';
import { recipeSize, ingredientMatches, ingredientExample, Recipe, Ingredient } from '../core/crafting';
import { ITEM_LIST, CREATIVE_HIDDEN, CreativeTab, I, toolId } from '../core/items';
import { B } from '../core/blocks';
import { SkinPreview } from './SkinEditor';
import { loadCustomSkin, skinFromAppearance, convertLegacy, detectSlim } from '../resources/skins';
import { audio } from '../audio/AudioEngine';
import { crop, sprite, label, guiScale, guiURL, nineSlice, tooltip, itemTooltipLines } from './mc/Gui';
import { getSettings } from '../storage/Settings';
import { sellValue, money } from '../core/economy';
import { OFFERS, PROFESSIONS, PROF_TITLE, LEVEL_NAMES, LEVEL_XP, levelFor, unlocked, canAfford } from '../core/trades';

let sharedPreview: SkinPreview | null = null;
let previewKey = '';

export type InvScreen = 'player' | 'creative' | 'workbench' | 'chest' | 'furnace' | 'trade';
type CTab = CreativeTab | 'search' | 'inventory';

const CTABS: { id: CTab; name: string; icon: number; top: boolean; col: number }[] = [
  { id: 'building', name: 'Building Blocks', icon: B.BRICKS, top: true, col: 0 },
  { id: 'nature', name: 'Natural Blocks', icon: B.GRASS, top: true, col: 1 },
  { id: 'functional', name: 'Functional Blocks', icon: B.WORKBENCH, top: true, col: 2 },
  { id: 'search', name: 'Search Items', icon: I.BOOK, top: true, col: 6 },
  { id: 'tools', name: 'Tools & Utilities', icon: toolId(2, 0), top: false, col: 0 },
  { id: 'combat', name: 'Combat', icon: toolId(2, 3), top: false, col: 1 },
  { id: 'food', name: 'Food & Drinks', icon: I.APPLE, top: false, col: 2 },
  { id: 'materials', name: 'Ingredients', icon: I.IRON_INGOT, top: false, col: 3 },
  { id: 'inventory', name: 'Survival Inventory', icon: B.CHEST, top: false, col: 6 },
];

interface SlotEntry { el: HTMLElement; ref: SlotRef | null; get: () => ItemStack | null; ghost?: number; action?: (e: PointerEvent) => void; fixed?: boolean }

export class InventoryUI {
  private root: HTMLElement;
  private screen: InvScreen = 'player';
  private session: GameSession | null = null;
  private atlas: TextureAtlas;
  private cursorEl: HTMLElement;
  private slotEls: SlotEntry[] = [];
  private tab: CTab = 'building';
  private search = '';
  private bookSearch = '';
  private bookOpen = false;
  private bookPage = 0;
  private bookTab: 'all' | 'tools' | 'building' | 'food' | 'misc' = 'all';
  private bookCraftable = false;
  private ghost: Recipe | null = null;
  private container: { items: (ItemStack | null)[]; burn?: number; burnMax?: number; cook?: number } | null = null;
  private trade: TradeInfo | null = null;
  private tradeSel = 0;
  private tradeScroll = 0;
  private onTrade: ((id: string, i: number, n: number) => void) | null = null;
  isOpen = false;
  title: string | null = null;
  sellPrices: Map<number, number> | null = null;
  private sellLabel: HTMLElement | null = null;
  onClose: (() => void) | null = null;
  private pointer = { x: 0, y: 0 };
  private drag: { from: HTMLElement; startX: number; startY: number; active: boolean; pid: number; lp: number | null; long: boolean } | null = null;
  private cscroll: { startY: number; startRow: number; moved: boolean; entry: SlotEntry; pid: number } | null = null;
  private lastTap = { el: null as HTMLElement | null, t: 0 };
  private creativeRow = 0;
  private s = 2;
  private litEl: HTMLElement | null = null;
  private burnEl: HTMLElement | null = null;
  private bookEl: HTMLElement | null = null;
  private gridRefill: (() => void) | null = null;
  private thumb: HTMLElement | null = null;
  private painted = new Set<HTMLElement>();

  constructor(parent: HTMLElement, atlas: TextureAtlas) {
    this.atlas = atlas;
    this.root = h('div', { class: 'screen dim inv-screen mc-screen', style: 'display:none' });
    this.cursorEl = h('div', { class: 'cursor-item mc', style: 'display:none' });
    parent.appendChild(this.root);
    document.body.appendChild(this.cursorEl);
    const track = (e: PointerEvent) => { this.pointer = { x: e.clientX, y: e.clientY }; this.trackPreview(e.clientX, e.clientY); this.cursorEl.style.left = `${e.clientX}px`; this.cursorEl.style.top = `${e.clientY}px`; };
    this.root.addEventListener('pointermove', (e) => { track(e); this.onDragMove(e); });
    this.root.addEventListener('pointerdown', (e) => {
      track(e);
      if (e.target === this.root || (e.target as HTMLElement).classList.contains('inv-wrap')) {
        const cur = this.session?.me.inv.cursor;
        if (cur) this.op({ t: 'dropCursor', all: e.button !== 2 });
        else this.close();
      }
    });
    this.root.addEventListener('pointerup', (e) => this.onPointerUp(e));
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
    this.root.addEventListener('wheel', (e) => {
      if (this.screen === 'creative' && this.tab !== 'inventory') { this.scrollCreative(this.creativeRow + Math.sign(e.deltaY)); e.preventDefault(); }
      else if (this.screen === 'trade') { this.tradeScroll = Math.max(0, this.tradeScroll + Math.sign(e.deltaY)); this.render(); e.preventDefault(); }
    }, { passive: false });
    window.addEventListener('resize', () => { if (this.isOpen) this.render(); });
  }

  setAtlas(a: TextureAtlas): void { this.atlas = a; if (this.isOpen) this.render(); }

  open(session: GameSession, screen: InvScreen): void {
    this.session = session;
    this.screen = screen;
    this.isOpen = true;
    if (screen !== 'trade') this.trade = null;
    this.root.style.display = 'flex';
    this.render();
    audio.play('ui.open');
  }

  openTrade(session: GameSession, onTrade: (id: string, i: number, n: number) => void): void {
    this.onTrade = onTrade;
    this.trade = null;
    this.tradeSel = 0;
    this.tradeScroll = 0;
    this.open(session, 'trade');
  }

  setTrade(info: TradeInfo): void {
    if (this.trade?.id !== info.id) { this.tradeSel = 0; this.tradeScroll = 0; }
    this.trade = info;
    if (this.isOpen && this.screen === 'trade') this.render();
  }

  setContainer(items: (ItemStack | null)[], burn?: number, burnMax?: number, cook?: number): void {
    const resized = (this.container?.items.length ?? -1) !== items.length;
    this.container = { items, burn, burnMax, cook };
    if (this.isOpen) { if (resized && this.screen === 'chest') this.render(); else this.refresh(); }
  }

  close(fromServer = false): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.root.style.display = 'none';
    this.cursorEl.style.display = 'none';
    tooltip().hide();
    this.container = null;
    this.trade = null;
    if (!fromServer) this.session?.invOp({ t: 'close' });
    this.onClose?.();
  }

  get current(): InvScreen { return this.screen; }

  private op(o: InvOp): void {
    this.session?.invOp(o);
    audio.play('ui.click', undefined, undefined, undefined, 0.5);
    this.refresh();
  }

  private wheelT = 0;
  private previewBox: HTMLElement | null = null;

  private preview(x: number, y: number, w: number, hh: number, s: number): HTMLElement {
    const box = h('div', { class: 'mc-preview', style: `left:${x * s}px;top:${y * s}px;width:${w * s}px;height:${hh * s}px` });
    this.previewBox = box;
    const me = this.session!.me;
    const custom = loadCustomSkin();
    const count = this.atlas.playerSkinCount;
    const key = custom ? `c:${custom.png.length}:${custom.slim}` : count ? `p:${this.atlas.packHash}:${me.appearance.skin % count}` : `a:${JSON.stringify(me.appearance)}`;
    if (!sharedPreview) { sharedPreview = new SkinPreview(skinFromAppearance(me.appearance), 160, 1.45); sharedPreview.persistent = true; sharedPreview.follow = { x: 0, y: 0 }; previewKey = ''; }
    const pv = sharedPreview;
    if (key !== previewKey) {
      previewKey = key;
      if (custom) {
        const img = new Image();
        img.onload = () => { const c = convertLegacy(img); pv.setSource(c); pv.setSlim(custom.slim); };
        img.src = custom.png;
      } else {
        const c = (count ? this.atlas.entityCanvases.get(`player${me.appearance.skin % count}`) : null) ?? skinFromAppearance(me.appearance);
        pv.setSource(c);
        pv.setSlim(c.height === 64 && detectSlim(c));
      }
    }
    pv.canvas.style.width = `${Math.min(w, hh / 1.45) * s}px`;
    pv.canvas.style.height = `${Math.min(w * 1.45, hh) * s}px`;
    box.appendChild(pv.canvas);
    pv.start();
    return box;
  }

  private trackPreview(cx: number, cy: number): void {
    const b = this.previewBox;
    if (!b || !sharedPreview?.follow) return;
    const r = b.getBoundingClientRect();
    sharedPreview.follow.x = (cx - (r.left + r.width / 2)) / Math.max(40, r.width);
    sharedPreview.follow.y = (cy - (r.top + r.height * 0.25)) / Math.max(40, r.height);
  }

  private liveInv(): PlayerInv {
    const self = this;
    return new Proxy({} as PlayerInv, { get: (_t, k) => (self.session!.me.inv as unknown as Record<string | symbol, unknown>)[k] });
  }

  private slot(parent: HTMLElement, ref: SlotRef | null, get: () => ItemStack | null, x: number, y: number, opts: { ghost?: number; action?: (e: PointerEvent) => void; fixed?: boolean; size?: number } = {}): HTMLElement {
    const s = this.s;
    const sz = opts.size ?? 18;
    const el = h('div', { class: 'slot mc', style: `left:${(x - 1) * s}px;top:${(y - 1) * s}px;width:${sz * s}px;height:${sz * s}px` });
    const entry: SlotEntry = { el, ref, get, ghost: opts.ghost, action: opts.action, fixed: opts.fixed };
    this.slotEls.push(entry);
    el.addEventListener('pointerdown', (e) => this.onSlotDown(e, entry));
    el.addEventListener('pointerenter', (e) => { el.classList.add('hover'); if (e.pointerType === 'mouse') this.tipFor(get(), e.clientX, e.clientY); });
    el.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' && !this.session?.me.inv.cursor) this.tipFor(get(), e.clientX, e.clientY); });
    el.addEventListener('pointerleave', () => { el.classList.remove('hover'); tooltip().hide(); });
    el.addEventListener('wheel', (e) => {
      if (!getSettings().mouseTweaks || !entry.ref || entry.action || !get()) return;
      e.preventDefault(); e.stopPropagation();
      const now = performance.now();
      if (now - this.wheelT < 45) return;
      this.wheelT = now;
      if (e.deltaY > 0) this.op({ t: 'quickOne', s: entry.ref });
    }, { passive: false });
    parent.appendChild(el);
    return el;
  }

  private tipFor(st: ItemStack | null, x: number, y: number, ms = 0): void {
    if (!st || this.session?.me.inv.cursor) { tooltip().hide(); return; }
    tooltip().show(this.atlas, itemTooltipLines(st, getSettings().advancedTooltips), x, y, ms);
  }

  private findSlot(el: Element | null): SlotEntry | undefined {
    const s = el?.closest('.slot');
    return this.slotEls.find((x) => x.el === s);
  }

  private onSlotDown(e: PointerEvent, s: SlotEntry): void {
    e.stopPropagation();
    e.preventDefault();
    const touch = e.pointerType !== 'mouse';
    if (touch) this.tipFor(s.get(), e.clientX, e.clientY - 40, 1400);
    if (s.action) {
      if (touch && this.screen === 'creative') { this.cscroll = { startY: e.clientY, startRow: this.creativeRow, moved: false, entry: s, pid: e.pointerId }; return; }
      s.action(e);
      return;
    }
    if (!s.ref) return;
    if (!touch) {
      if (e.shiftKey) this.op({ t: 'quick', s: s.ref });
      else this.op({ t: 'click', s: s.ref, b: e.button === 2 ? 1 : 0 });
      this.drag = { from: s.el, startX: e.clientX, startY: e.clientY, active: true, pid: e.pointerId, lp: null, long: false };
      this.painted = new Set([s.el]);
      return;
    }
    const d = { from: s.el, startX: e.clientX, startY: e.clientY, active: false, pid: e.pointerId, lp: null as number | null, long: false };
    d.lp = window.setTimeout(() => {
      if (this.drag !== d || d.active) return;
      d.long = true;
      this.op({ t: 'click', s: s.ref!, b: 1 });
      navigator.vibrate?.(15);
    }, 430);
    this.drag = d;
  }

  private onDragMove(e: PointerEvent): void {
    const cs = this.cscroll;
    if (cs && cs.pid === e.pointerId) {
      const dy = cs.startY - e.clientY;
      if (Math.abs(dy) > 10) cs.moved = true;
      if (cs.moved) this.scrollCreative(cs.startRow + Math.round(dy / (18 * this.s)));
      return;
    }
    const d = this.drag;
    if (!d || d.pid !== e.pointerId) return;
    if (getSettings().mouseTweaks && e.pointerType === 'mouse' && e.shiftKey && (e.buttons & 1) && !this.session?.me.inv.cursor) {
      const t = this.findSlot(document.elementFromPoint(e.clientX, e.clientY));
      if (t?.ref && !t.action && t.get() && !this.painted.has(t.el)) { this.painted.add(t.el); this.op({ t: 'quick', s: t.ref }); }
      return;
    }
    if (!d.active && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 10) {
      if (d.lp) clearTimeout(d.lp);
      d.active = true;
      const s = this.findSlot(d.from);
      if (s?.ref && !d.long && !this.session?.me.inv.cursor) this.op({ t: 'click', s: s.ref, b: 0 });
      this.painted = new Set();
    }
    if (d.active && this.session?.me.inv.cursor && (e.pointerType !== 'mouse' || e.buttons & 2)) {
      const t = this.findSlot(document.elementFromPoint(e.clientX, e.clientY));
      if (t?.ref && (t.ref.c === 'craft' || t.ref.c === 'inv' || t.ref.c === 'cont') && !this.painted.has(t.el)) {
        const cur = this.session.me.inv.cursor, here = t.get();
        if (!here || (here.id === cur.id && here.count < 64)) { this.painted.add(t.el); this.op({ t: 'click', s: t.ref, b: 1 }); }
      }
    }
  }

  private onPointerUp(e: PointerEvent): void {
    const cs = this.cscroll;
    if (cs && cs.pid === e.pointerId) { this.cscroll = null; if (!cs.moved) cs.entry.action?.(e); return; }
    const d = this.drag;
    this.drag = null;
    if (!d || d.pid !== e.pointerId) return;
    if (d.lp) clearTimeout(d.lp);
    const target = this.findSlot(document.elementFromPoint(e.clientX, e.clientY));
    const touch = e.pointerType !== 'mouse';
    if (d.active) {
      const paintedAny = this.painted.size > (touch ? 0 : 1);
      this.painted = new Set();
      if (!paintedAny && target && target.el !== d.from && target.ref && this.session?.me.inv.cursor) this.op({ t: 'click', s: target.ref, b: 0 });
      return;
    }
    if (!touch || d.long) return;
    const s = this.findSlot(d.from);
    if (!s?.ref) return;
    const now = performance.now();
    const cur = this.session?.me.inv.cursor, here = s.get();
    const one = !!cur && s.ref.c === 'craft' && (!here || here.id === cur.id);
    this.op({ t: 'click', s: s.ref, b: one ? 1 : 0 });
    if (this.lastTap.el === d.from && now - this.lastTap.t < 320) {
      this.op({ t: 'quick', s: s.ref });
      this.lastTap = { el: null, t: 0 };
    } else this.lastTap = { el: d.from, t: now };
  }

  refresh(): void {
    if (!this.isOpen || !this.session) return;
    const isz = 16 * this.s;
    for (const s of this.slotEls) {
      if (s.fixed) continue;
      clear(s.el);
      s.el.classList.remove('ghost-out');
      const st = s.get();
      for (const n of slotContent(this.atlas, st, isz)) s.el.appendChild(n);
      if (!st && s.ghost !== undefined) s.el.appendChild(h('div', { class: 'ico ghost-ico', style: this.atlas.iconStyle(s.ghost, isz) }));
    }
    this.paintGhost(isz);
    const cur = this.session.me.inv.cursor;
    clear(this.cursorEl);
    this.cursorEl.style.setProperty('--s', `${this.s}px`);
    if (cur) {
      for (const n of slotContent(this.atlas, cur, isz)) this.cursorEl.appendChild(n);
      this.cursorEl.style.display = 'block';
      this.cursorEl.style.left = `${this.pointer.x}px`;
      this.cursorEl.style.top = `${this.pointer.y}px`;
      tooltip().hide();
    } else this.cursorEl.style.display = 'none';
    this.refreshFurnace();
    this.refreshBook();
    if (this.sellLabel && this.container) {
      let total = 0;
      for (const st of this.container.items) if (st) total += sellValue(st, this.sellPrices ?? new Map());
      this.sellLabel.textContent = `Sell items: ${money(total)} (close to sell)`;
    }
    if (this.screen === 'trade') this.refreshTradeAfford();
  }

  private refreshFurnace(): void {
    const c = this.container;
    const s = this.s;
    if (this.litEl) {
      const f = c?.burnMax ? (c.burn ?? 0) / c.burnMax : 0;
      const k = f > 0 ? Math.ceil(f * 13) + 1 : 0;
      this.litEl.style.height = `${k * s}px`;
      this.litEl.style.top = `${(36 + 14 - k) * s}px`;
    }
    if (this.burnEl) this.burnEl.style.width = `${Math.ceil(((c?.cook ?? 0) / 200) * 24) * s}px`;
  }

  private layoutSize(): [number, number] {
    switch (this.screen) {
      case 'chest': { const n = this.container?.items.length ?? 27; if (n === 5) return [176, 133]; if (n === 9) return [176, 166]; const rows = n === 54 ? 6 : 3; return [176, 114 + rows * 18]; }
      case 'creative': return [195, 136 + 56];
      case 'trade': return [276, 166];
      default: return [176, 166];
    }
  }

  private render(): void {
    const sess = this.session!;
    this.slotEls = [];
    this.litEl = this.burnEl = this.bookEl = this.thumb = null;
    this.previewBox = null;
    this.sellLabel = null;
    this.gridRefill = null;
    clear(this.root);
    tooltip().hide();
    const [w, hgt] = this.layoutSize();
    const bookable = this.screen === 'player' || this.screen === 'workbench';
    const showBook = bookable && this.bookOpen;
    const s = this.s = guiScale(w + (showBook ? 182 : 0), hgt + 8);
    const win = h('div', { class: 'mc-win', style: `width:${w * s}px;height:${hgt * s}px;--s:${s}px` });
    const inv = this.liveInv();
    const ref = (c: SlotRef['c'], i: number): SlotRef => ({ c, i });
    const A = this.atlas;
    const invSlots = (x: number, y: number) => {
      for (let r = 0; r < 3; r++) for (let c = 0; c < 9; c++) { const i = 9 + r * 9 + c; this.slot(win, ref('inv', i), () => inv.slots[i], x + c * 18, y + r * 18); }
      for (let c = 0; c < 9; c++) this.slot(win, ref('inv', c), () => inv.slots[c], x + c * 18, y + 58);
    };
    const bookBtn = (x: number, y: number) => {
      const b = sprite(A, 'gs:recipe_book/button', 20, 18, s, x, y, 'mc-sprite mc-btnimg');
      b.addEventListener('pointerenter', () => { b.style.backgroundImage = `url(${guiURL(A, 'gs:recipe_book/button_highlighted')})`; });
      b.addEventListener('pointerleave', () => { b.style.backgroundImage = `url(${guiURL(A, 'gs:recipe_book/button')})`; });
      b.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.bookOpen = !this.bookOpen; this.render(); });
      win.appendChild(b);
    };

    if (this.screen === 'player') {
      win.appendChild(crop(A, 'gt:container/inventory', 256, 256, 0, 0, 176, 166, s));
      for (let i = 0; i < 4; i++) this.slot(win, ref('armor', i), () => inv.armor[i], 8, 8 + i * 18, { ghost: 334 + i });
      win.appendChild(this.preview(26, 8, 49, 70, s));
      win.appendChild(label('Crafting', 97, 8, s));
      for (let i = 0; i < 4; i++) this.slot(win, ref('craft', i), () => inv.craft[i], 98 + (i % 2) * 18, 18 + Math.floor(i / 2) * 18);
      this.slot(win, ref('out', 0), () => craftResult(inv, this.session?.sim.book)?.stack ?? null, 154, 28);
      this.slot(win, ref('off', 0), () => inv.off?.[0] ?? null, 77, 62);
      bookBtn(104, 61);
      invSlots(8, 84);
    } else if (this.screen === 'workbench') {
      win.appendChild(crop(A, 'gt:container/crafting_table', 256, 256, 0, 0, 176, 166, s));
      win.appendChild(label('Crafting', 28, 6, s));
      win.appendChild(label('Inventory', 8, 72, s));
      for (let i = 0; i < 9; i++) this.slot(win, ref('craft', i), () => inv.craft[i], 30 + (i % 3) * 18, 17 + Math.floor(i / 3) * 18);
      this.slot(win, ref('out', 0), () => craftResult(inv, this.session?.sim.book)?.stack ?? null, 124, 35);
      bookBtn(5, 34);
      invSlots(8, 84);
    } else if (this.screen === 'furnace') {
      win.appendChild(crop(A, 'gt:container/furnace', 256, 256, 0, 0, 176, 166, s));
      win.appendChild(label('Furnace', 88, 6, s, { center: true }));
      win.appendChild(label('Inventory', 8, 72, s));
      this.slot(win, ref('cont', 0), () => this.container?.items[0] ?? null, 56, 17);
      this.slot(win, ref('cont', 1), () => this.container?.items[1] ?? null, 56, 53, { ghost: 260 });
      this.slot(win, ref('cont', 2), () => this.container?.items[2] ?? null, 116, 35);
      const lit = h('div', { class: 'mc-progress', style: `left:${56 * s}px;top:${50 * s}px;width:${14 * s}px;height:0;background-image:url(${guiURL(A, 'gs:container/furnace/lit_progress')});background-size:${14 * s}px ${14 * s}px;background-position:bottom left` });
      const burn = h('div', { class: 'mc-progress', style: `left:${79 * s}px;top:${34 * s}px;width:0;height:${16 * s}px;background-image:url(${guiURL(A, 'gs:container/furnace/burn_progress')});background-size:${24 * s}px ${16 * s}px;background-position:top left` });
      win.append(lit, burn);
      this.litEl = lit; this.burnEl = burn;
      invSlots(8, 84);
    } else if (this.screen === 'chest' && (this.container?.items.length === 5 || this.container?.items.length === 9)) {
      const n = this.container!.items.length;
      if (n === 5) {
        win.appendChild(crop(A, 'gt:container/hopper', 256, 256, 0, 0, 176, 133, s));
        win.appendChild(label(this.title ?? 'Hopper', 8, 6, s));
        win.appendChild(label('Inventory', 8, 40, s));
        for (let i = 0; i < 5; i++) this.slot(win, ref('cont', i), () => this.container?.items[i] ?? null, 44 + i * 18, 20);
        invSlots(8, 51);
      } else {
        win.appendChild(crop(A, 'gt:container/dispenser', 256, 256, 0, 0, 176, 166, s));
        win.appendChild(label(this.title ?? 'Dispenser', 88, 6, s, { center: true }));
        win.appendChild(label('Inventory', 8, 72, s));
        for (let i = 0; i < 9; i++) this.slot(win, ref('cont', i), () => this.container?.items[i] ?? null, 62 + (i % 3) * 18, 17 + Math.floor(i / 3) * 18);
        invSlots(8, 84);
      }
    } else if (this.screen === 'chest') {
      const rows = this.container?.items.length === 54 ? 6 : 3;
      win.appendChild(crop(A, 'gt:container/generic_54', 256, 256, 0, 0, 176, rows * 18 + 17, s));
      win.appendChild(crop(A, 'gt:container/generic_54', 256, 256, 0, 126, 176, 96, s, 0, rows * 18 + 17));
      const ttl = label(this.title ?? (rows === 6 ? 'Large Chest' : 'Chest'), 8, 6, s);
      win.appendChild(ttl);
      if (this.title === 'Sell items') this.sellLabel = ttl;
      win.appendChild(label('Inventory', 8, hgt - 94, s));
      for (let i = 0; i < rows * 9; i++) this.slot(win, ref('cont', i), () => this.container?.items[i] ?? null, 8 + (i % 9) * 18, 18 + Math.floor(i / 9) * 18);
      invSlots(8, 103 + (rows - 4) * 18);
    } else if (this.screen === 'trade') {
      this.renderTrade(win, s, invSlots);
    } else {
      this.renderCreative(win, s, invSlots);
    }
    const close = h('div', { class: 'mc-close', style: `right:${3 * s}px;top:${3 * s}px;width:${9 * s}px;height:${9 * s}px;font-size:${9 * s}px;line-height:${8 * s}px` }, '×');
    close.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.close(); });
    if (this.screen !== 'creative') win.appendChild(close);
    const wrap = h('div', { class: 'inv-wrap' });
    if (showBook) wrap.appendChild(this.recipeBook(s, hgt));
    wrap.appendChild(win);
    this.root.appendChild(wrap);
    this.refresh();
  }

  private renderCreative(win: HTMLElement, s: number, invSlots: (x: number, y: number) => void): void {
    const A = this.atlas;
    const sess = this.session!;
    const inv = this.liveInv();
    const body = h('div', { class: 'mc-layer', style: `left:0;top:${28 * s}px;width:${195 * s}px;height:${136 * s}px` });
    const tabsBack = h('div', { class: 'mc-layer', style: 'inset:0' });
    const tabsFront = h('div', { class: 'mc-layer', style: 'inset:0;z-index:3' });
    win.append(tabsBack, body, tabsFront);
    for (const t of CTABS) {
      const sel = t.id === this.tab;
      const x = t.col === 6 ? 195 - 27 + 1 : t.col * 27;
      const y = t.top ? 0 : 28 + 132;
      const key = `gs:container/creative_inventory/tab_${t.top ? 'top' : 'bottom'}_${sel ? 'selected' : 'unselected'}_${t.col + 1}`;
      const el = sprite(A, key, 26, 32, s, x, y, 'mc-sprite mc-tab');
      el.appendChild(h('div', { class: 'ico', style: `position:absolute;left:${5 * s}px;top:${(t.top ? 9 : 7) * s}px;width:${16 * s}px;height:${16 * s}px;${A.iconStyle(t.icon)}` }));
      el.title = t.name;
      el.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.tab = t.id; this.creativeRow = 0; this.render(); });
      el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') tooltip().show(A, [{ text: t.name, color: '#ffffff' }], e.clientX, e.clientY); });
      el.addEventListener('pointerleave', () => tooltip().hide());
      (sel ? tabsFront : tabsBack).appendChild(el);
    }
    if (this.tab === 'inventory') {
      body.appendChild(crop(A, 'gt:container/creative_inventory/tab_inventory', 256, 256, 0, 0, 195, 136, s));
      const ghosts = [334, 335, 336, 337];
      const armorPos: [number, number][] = [[54, 6], [54, 33], [108, 6], [108, 33]];
      armorPos.forEach(([x, y], i) => this.slot(body, { c: 'armor', i }, () => inv.armor[i], x, y, { ghost: ghosts[i] }));
      this.slot(body, { c: 'off', i: 0 }, () => inv.off?.[0] ?? null, 35, 20);
      body.appendChild(this.preview(73, 6, 32, 43, s));
      for (let r = 0; r < 3; r++) for (let c = 0; c < 9; c++) { const i = 9 + r * 9 + c; this.slot(body, { c: 'inv', i }, () => inv.slots[i], 9 + c * 18, 54 + r * 18); }
      for (let c = 0; c < 9; c++) this.slot(body, { c: 'inv', i: c }, () => inv.slots[c], 9 + c * 18, 112);
      const trash = this.slot(body, null, () => null, 173, 112, { fixed: true, action: () => { if (inv.cursor) this.op({ t: 'creativeDelete' }); } });
      trash.classList.add('trash');
      trash.appendChild(h('div', { class: 'mc-x', style: `font-size:${14 * s}px` }, '×'));
      void invSlots;
      return;
    }
    const isSearch = this.tab === 'search';
    body.appendChild(crop(A, isSearch ? 'gt:container/creative_inventory/tab_item_search' : 'gt:container/creative_inventory/tab_items', 256, 256, 0, 0, 195, 136, s));
    body.appendChild(label(CTABS.find((t) => t.id === this.tab)?.name ?? '', 8, 6, s));
    if (isSearch) {
      const input = h('input', { class: 'mc-input', value: this.search, spellcheck: 'false', style: `left:${82 * s}px;top:${6 * s}px;width:${89 * s}px;height:${10 * s}px;font-size:${8 * s}px` }) as HTMLInputElement;
      input.addEventListener('input', () => { this.search = input.value; this.creativeRow = 0; this.gridRefill?.(); });
      input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') this.close(); });
      body.appendChild(input);
      requestAnimationFrame(() => { if (!('ontouchstart' in window)) input.focus(); });
    }
    const q = this.search.trim().toLowerCase();
    const items = ITEM_LIST.filter((it) => !CREATIVE_HIDDEN.has(it.id) && (isSearch ? (!q || it.name.toLowerCase().includes(q) || it.key.includes(q)) : it.tab === this.tab));
    const rows = Math.ceil(items.length / 9);
    const maxRow = Math.max(0, rows - 5);
    this.creativeRow = Math.min(this.creativeRow, maxRow);
    const cells: SlotEntry[] = [];
    for (let i = 0; i < 45; i++) {
      const x = 9 + (i % 9) * 18, y = 18 + Math.floor(i / 9) * 18;
      const getIt = () => items[this.creativeRow * 9 + i] ?? null;
      this.slot(body, null, () => { const it = getIt(); return it ? { id: it.id, count: 1 } : null; }, x, y, {
        action: (e) => {
          const it = getIt();
          const cur = inv.cursor;
          if (cur) { this.op({ t: 'creativeDelete' }); return; }
          if (!it) return;
          if (e.shiftKey) { const free = inv.slots.findIndex((z) => !z); if (free >= 0) this.op({ t: 'creative', id: it.id, count: it.maxStack, s: { c: 'inv', i: free } }); return; }
          this.op({ t: 'creative', id: it.id, count: e.button === 2 ? 1 : it.maxStack });
        },
      });
      cells.push(this.slotEls[this.slotEls.length - 1]);
    }
    for (let c = 0; c < 9; c++) this.slot(body, { c: 'inv', i: c }, () => inv.slots[c], 9 + c * 18, 112);
    const thumb = sprite(A, maxRow > 0 ? 'gs:container/creative_inventory/scroller' : 'gs:container/creative_inventory/scroller_disabled', 12, 15, s, 175, 18, 'mc-sprite mc-thumb');
    body.appendChild(thumb);
    this.thumb = thumb;
    const setThumb = () => { thumb.style.top = `${(18 + (maxRow ? (this.creativeRow / maxRow) * 97 : 0)) * s}px`; };
    setThumb();
    const track = h('div', { class: 'mc-layer', style: `left:${175 * s}px;top:${18 * s}px;width:${12 * s}px;height:${112 * s}px;cursor:pointer` });
    body.appendChild(track);
    const dragTo = (cy: number) => { const r = track.getBoundingClientRect(); const t = Math.max(0, Math.min(1, (cy - r.top - 7 * s) / (97 * s))); this.scrollCreative(Math.round(t * maxRow)); };
    track.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      track.setPointerCapture(e.pointerId);
      dragTo(e.clientY);
      const mv = (ev: PointerEvent) => dragTo(ev.clientY);
      const up = () => { track.removeEventListener('pointermove', mv); track.removeEventListener('pointerup', up); };
      track.addEventListener('pointermove', mv);
      track.addEventListener('pointerup', up);
    });
    this.maxCreativeRow = maxRow;
    this.gridRefill = () => { if (isSearch) this.render(); else { setThumb(); this.refresh(); } };
    void cells;
  }

  private maxCreativeRow = 0;

  private scrollCreative(row: number): void {
    const r = Math.max(0, Math.min(this.maxCreativeRow, row));
    if (r === this.creativeRow) return;
    this.creativeRow = r;
    if (this.thumb) this.thumb.style.top = `${(18 + (this.maxCreativeRow ? (r / this.maxCreativeRow) * 97 : 0)) * this.s}px`;
    this.refresh();
  }

  private tradeAffordEls: { el: HTMLElement; i: number }[] = [];

  private renderTrade(win: HTMLElement, s: number, invSlots: (x: number, y: number) => void): void {
    const A = this.atlas;
    win.appendChild(crop(A, 'gt:container/villager', 512, 256, 0, 0, 276, 166, s));
    win.appendChild(label('Trades', 49, 6, s, { center: true }));
    win.appendChild(label('Inventory', 108, 72, s));
    this.tradeAffordEls = [];
    const info = this.trade;
    invSlots(108, 84);
    if (!info) { win.appendChild(label('...', 187, 6, s, { center: true })); return; }
    const prof = PROFESSIONS[info.prof] ?? 'farmer';
    const lvl = levelFor(info.xp);
    win.appendChild(label(`${PROF_TITLE[prof]} - ${LEVEL_NAMES[lvl]}`, 187, 6, s, { center: true }));
    win.appendChild(sprite(A, 'gs:container/villager/experience_bar_background', 102, 5, s, 136, 16));
    const next = LEVEL_XP[lvl + 1];
    const frac = next === undefined ? 1 : (info.xp - LEVEL_XP[lvl]) / (next - LEVEL_XP[lvl]);
    const cur = h('div', { class: 'mc-progress', style: `left:${136 * s}px;top:${16 * s}px;width:${Math.round(102 * frac) * s}px;height:${5 * s}px;background-image:url(${guiURL(A, 'gs:container/villager/experience_bar_current')});background-size:${102 * s}px ${5 * s}px` });
    win.appendChild(cur);
    const offers = unlocked(prof, info.xp);
    if (!offers.includes(this.tradeSel)) this.tradeSel = offers[0] ?? 0;
    const maxScroll = Math.max(0, offers.length - 7);
    this.tradeScroll = Math.min(this.tradeScroll, maxScroll);
    const inv = this.liveInv();
    offers.slice(this.tradeScroll, this.tradeScroll + 7).forEach((oi, row) => {
      const of = OFFERS[prof][oi];
      const out = (info.uses[oi] ?? 0) >= of.max;
      const sel = oi === this.tradeSel;
      const btn = h('div', { class: `mc-tradebtn${sel ? ' sel' : ''}`, style: `left:${5 * s}px;top:${(18 + row * 20) * s}px;width:${88 * s}px;height:${20 * s}px;${nineSlice(A, sel ? 'gs:widget/button_highlighted' : 'gs:widget/button', 3, s)}` });
      const ic = (st: ItemStack, x: number) => { const d = h('div', { class: 'slot mc static', style: `left:${(x - 1 - 3) * s}px;top:${(2 - 1 - 3) * s}px;width:${18 * s}px;height:${18 * s}px` }); for (const n of slotContent(A, st, 16 * s)) d.appendChild(n); return d; };
      btn.appendChild(ic(of.cost[0], 5));
      if (of.cost[1]) btn.appendChild(ic(of.cost[1], 35));
      btn.appendChild(sprite(A, out ? 'gs:container/villager/trade_arrow_out_of_stock' : 'gs:container/villager/trade_arrow', 10, 9, s, 60 - 3, 6 - 3));
      btn.appendChild(ic(of.give, 68));
      btn.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.tradeSel = oi; audio.play('ui.click'); this.render(); });
      btn.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') tooltip().show(A, itemTooltipLines(of.give), e.clientX, e.clientY); });
      btn.addEventListener('pointerleave', () => tooltip().hide());
      win.appendChild(btn);
      this.tradeAffordEls.push({ el: btn, i: oi });
    });
    if (offers.length > 7) win.appendChild(sprite(A, 'gs:container/villager/scroller', 6, 27, s, 94, 18 + Math.round((this.tradeScroll / maxScroll) * 113)));
    const of = OFFERS[prof][this.tradeSel];
    if (!of) return;
    const left = of.max - (info.uses[this.tradeSel] ?? 0);
    this.slot(win, null, () => of.cost[0], 136, 37, { fixed: false });
    if (of.cost[1]) this.slot(win, null, () => of.cost[1], 162, 37);
    const resEl = this.slot(win, null, () => of.give, 220, 37, {
      action: (e) => {
        if (left <= 0 || !canAfford(inv, of)) { audio.play('ui.error'); return; }
        let n = 1;
        if (e.shiftKey || e.button === 2) { n = left; for (const c of of.cost) n = Math.min(n, Math.floor(countItem(inv, c.id) / c.count)); }
        this.onTrade?.(info.id, this.tradeSel, Math.max(1, n));
      },
    });
    resEl.classList.add('result');
    if (left <= 0) win.appendChild(sprite(A, 'gs:container/villager/out_of_stock', 28, 21, s, 186, 35));
    win.appendChild(label(`${Math.max(0, left)} left`, 220 + 8, 57, s, { center: true, color: left > 0 ? '#404040' : '#aa0000' }));
  }

  private refreshTradeAfford(): void {
    const info = this.trade;
    if (!info || !this.session) return;
    const prof = PROFESSIONS[info.prof] ?? 'farmer';
    for (const { el, i } of this.tradeAffordEls) el.classList.toggle('poor', !canAfford(this.session.me.inv, OFFERS[prof][i]));
  }

  private showGhost(r: Recipe): void {
    if (!this.session) return;
    if (this.session.me.inv.craft.some(Boolean)) { audio.play('ui.error'); return; }
    this.ghost = r;
    audio.play('ui.click');
    this.refresh();
  }

  private canCraft(r: Recipe): boolean {
    const inv = this.session!.me.inv;
    const need = new Map<string, { ing: Ingredient; n: number }>();
    const ings = r.shapeless ?? r.pattern!.join('').split('').filter((c) => c !== ' ').map((c) => r.key![c]);
    for (const i of ings) { const k = JSON.stringify(i); const e = need.get(k); if (e) e.n++; else need.set(k, { ing: i, n: 1 }); }
    for (const { ing, n } of need.values()) {
      let have = 0;
      for (const s of [...inv.slots, ...inv.craft]) if (s && ingredientMatches(ing, s.id)) have += s.count;
      if (have < n) return false;
    }
    return true;
  }

  private ghostCells(r: Recipe, size: number): (number | null)[] {
    const cells: (number | null)[] = new Array(size * size).fill(null);
    const ex = (ing: Ingredient) => (typeof ing === 'number' ? ing : Array.isArray(ing) ? ing[0] : ingredientExample(ing));
    if (r.pattern) r.pattern.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] !== ' ' && y < size && x < size) cells[y * size + x] = ex(r.key![row[x]]); });
    else r.shapeless!.forEach((ing, i) => { if (i < cells.length) cells[i] = ex(ing); });
    return cells;
  }

  private paintGhost(isz: number): void {
    const g = this.ghost;
    if (!g || !this.session) return;
    const inv = this.session.me.inv;
    if (inv.craft.some(Boolean)) { this.ghost = null; return; }
    const cells = this.ghostCells(g, inv.craftSize);
    for (const e of this.slotEls) {
      if (!e.ref) continue;
      if (e.ref.c === 'craft' && cells[e.ref.i] != null) e.el.appendChild(h('div', { class: 'ico ghost-ico ghost-recipe', style: this.atlas.iconStyle(cells[e.ref.i]!, isz) }));
      if (e.ref.c === 'out') { clear(e.el); for (const n of slotContent(this.atlas, { id: g.result, count: g.count }, isz)) e.el.appendChild(n); e.el.classList.add('ghost-out'); }
    }
  }

  private recipeBook(s: number, hgt: number): HTMLElement {
    const A = this.atlas;
    const book = h('div', { class: 'mc-win mc-book', style: `width:${147 * s}px;height:${166 * s}px;margin-left:${32 * s}px;margin-right:${s}px;margin-top:${Math.max(0, (hgt - 166) / 2) * s}px;--s:${s}px` });
    const tabs: { id: InventoryUI['bookTab']; icon: number; name: string }[] = [
      { id: 'all', icon: B.WORKBENCH, name: 'All recipes' }, { id: 'tools', icon: toolId(2, 0), name: 'Equipment' },
      { id: 'building', icon: B.BRICKS, name: 'Building blocks' }, { id: 'food', icon: I.APPLE, name: 'Food' }, { id: 'misc', icon: B.TORCH, name: 'Miscellaneous' },
    ];
    tabs.forEach((t, i) => {
      const sel = t.id === this.bookTab;
      const el = sprite(A, sel ? 'gs:recipe_book/tab_selected' : 'gs:recipe_book/tab', 35, 27, s, sel ? -32 : -30, 5 + i * 27, 'mc-sprite mc-tab');
      el.appendChild(h('div', { class: 'ico', style: `position:absolute;left:${(sel ? 9 : 9) * s}px;top:${5 * s}px;width:${16 * s}px;height:${16 * s}px;${A.iconStyle(t.icon)}` }));
      el.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.bookTab = t.id; this.bookPage = 0; audio.play('ui.click'); this.render(); });
      el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') tooltip().show(A, [{ text: t.name, color: '#ffffff' }], e.clientX, e.clientY); });
      el.addEventListener('pointerleave', () => tooltip().hide());
      book.appendChild(el);
    });
    book.appendChild(crop(A, 'gt:recipe_book', 256, 256, 1, 1, 147, 166, s));
    const fk = `gs:recipe_book/filter_${this.bookCraftable ? 'enabled' : 'disabled'}`;
    const filter = sprite(A, fk, 26, 16, s, 110, 12, 'mc-sprite mc-btnimg');
    filter.addEventListener('pointerenter', (e) => { filter.style.backgroundImage = `url(${guiURL(A, fk + '_highlighted')})`; if (e.pointerType === 'mouse') tooltip().show(A, [{ text: this.bookCraftable ? 'Showing craftable' : 'Showing all', color: '#ffffff' }], e.clientX, e.clientY); });
    filter.addEventListener('pointerleave', () => { filter.style.backgroundImage = `url(${guiURL(A, fk)})`; tooltip().hide(); });
    filter.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.bookCraftable = !this.bookCraftable; this.bookPage = 0; audio.play('ui.click'); this.render(); });
    book.appendChild(filter);
    const input = h('input', { class: 'mc-input', value: this.bookSearch, placeholder: 'Search...', spellcheck: 'false', style: `left:${27 * s}px;top:${15 * s}px;width:${79 * s}px;height:${11 * s}px;font-size:${8 * s}px` }) as HTMLInputElement;
    input.addEventListener('input', () => { this.bookSearch = input.value; this.bookPage = 0; this.refreshBook(); });
    input.addEventListener('keydown', (e) => e.stopPropagation());
    book.appendChild(input);
    const grid = h('div', { class: 'mc-layer', style: 'inset:0' });
    book.appendChild(grid);
    this.bookEl = grid;
    return book;
  }

  private refreshBook(): void {
    const grid = this.bookEl;
    if (!grid || !this.session) return;
    clear(grid);
    const A = this.atlas, s = this.s;
    const size = this.session.me.inv.craftSize;
    const q = this.bookSearch.trim().toLowerCase();
    const recipes = this.session.sim.book.crafting.filter((r) => { const z = recipeSize(r); return z.w <= size && z.h <= size; })
      .filter((r) => !q || (ITEM_LIST.find((it) => it.id === r.result)?.name.toLowerCase().includes(q) ?? false))
      .filter((r) => this.bookTab === 'all' || (this.bookTab === 'tools' ? r.group === 'tools' || r.group === 'combat' : this.bookTab === 'building' ? r.group === 'building' : this.bookTab === 'food' ? r.group === 'food' : r.group === 'basics' || r.group === 'decor'))
      .map((r) => ({ r, ok: this.canCraft(r) }))
      .filter((x) => !this.bookCraftable || x.ok)
      .sort((a, b) => Number(b.ok) - Number(a.ok));
    const pages = Math.max(1, Math.ceil(recipes.length / 20));
    this.bookPage = Math.min(this.bookPage, pages - 1);
    recipes.slice(this.bookPage * 20, this.bookPage * 20 + 20).forEach(({ r, ok }, i) => {
      const x = 11 + (i % 5) * 25, y = 31 + Math.floor(i / 5) * 25;
      const el = sprite(A, ok ? 'gs:recipe_book/slot_craftable' : 'gs:recipe_book/slot_uncraftable', 25, 25, s, x, y, 'mc-sprite mc-recipe');
      const ic = h('div', { class: 'slot mc static', style: `left:${3 * s}px;top:${3 * s}px;width:${18 * s}px;height:${18 * s}px` });
      for (const n of slotContent(A, { id: r.result, count: r.count }, 16 * s)) ic.appendChild(n);
      el.appendChild(ic);
      let lp = 0, long = false;
      el.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        long = false;
        if (e.pointerType !== 'mouse') { this.tipFor({ id: r.result, count: 1 }, e.clientX, e.clientY - 40, 1400); lp = window.setTimeout(() => { long = true; if (ok) this.op({ t: 'fill', r: r.id, all: true }); }, 450); }
        else if (ok) { this.ghost = null; this.op({ t: 'fill', r: r.id, all: e.shiftKey }); }
        else this.showGhost(r);
      });
      el.addEventListener('pointerup', (e) => { clearTimeout(lp); if (e.pointerType !== 'mouse' && !long) { if (ok) { this.ghost = null; this.op({ t: 'fill', r: r.id, all: false }); } else this.showGhost(r); } });
      el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') this.tipFor({ id: r.result, count: r.count }, e.clientX, e.clientY); });
      el.addEventListener('pointerleave', () => tooltip().hide());
      grid.appendChild(el);
    });
    if (pages > 1) {
      const mk = (fwd: boolean, x: number) => {
        const k = fwd ? 'page_forward' : 'page_backward';
        const b = sprite(A, `gs:recipe_book/${k}`, 12, 17, s, x, 137, 'mc-sprite mc-btnimg');
        b.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.bookPage = (this.bookPage + (fwd ? 1 : pages - 1)) % pages; this.refreshBook(); });
        grid.appendChild(b);
      };
      mk(false, 38); mk(true, 93);
      grid.appendChild(label(`${this.bookPage + 1}/${pages}`, 73, 141, s, { center: true, color: '#ffffff', shadow: true }));
    }
  }
}

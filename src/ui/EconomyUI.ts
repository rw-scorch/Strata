import { h, clear, modal, toast } from './dom';
import { slotContent } from './HUD';
import type { TextureAtlas } from '../resources/TextureAtlas';
import { crop, label, guiScale, tooltip, itemTooltipLines } from './mc/Gui';

type TipLine = { text: string; color: string };
import { audio } from '../audio/AudioEngine';
import { B } from '../core/blocks';
import { I, ITEM_LIST, getItem } from '../core/items';
import type { ItemStack } from '../core/inventory';
import { SHOP, ShopEntry, EcoView, money, fee, AhListing, BuyOrder, parseMoney, LISTING_HOURS } from '../core/economy';

type Act = (m: Record<string, unknown>) => void;

interface Cell { icon: ItemStack | null; tip: TipLine[]; act?: (long: boolean, shift: boolean) => void; dim?: boolean }

const GOLD = '#ffaa00', GRAY = '#aaaaaa', GREEN = '#55ff55', RED = '#ff5555', WHITE = '#ffffff', AQUA = '#55ffff';

function left(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60000));
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}

export class EconomyUI {
  private root: HTMLElement;
  isOpen = false;
  onClose: (() => void) | null = null;
  shopPrices: Record<string, number> = {};
  private view: EcoView | null = null;
  private atlas: TextureAtlas;
  private act: Act = () => undefined;
  private me = '';
  private balance = 0;

  constructor(parent: HTMLElement, atlas: TextureAtlas) {
    this.atlas = atlas;
    this.root = h('div', { class: 'screen dim inv-screen mc-screen eco-screen', style: 'display:none' });
    this.root.addEventListener('pointerdown', (e) => { if (e.target === this.root || (e.target as HTMLElement).classList.contains('inv-wrap')) this.close(); });
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
    parent.appendChild(this.root);
    window.addEventListener('resize', () => { if (this.isOpen) this.render(); });
  }

  setAtlas(a: TextureAtlas): void { this.atlas = a; if (this.isOpen) this.render(); }
  setBalance(n: number): void { if (n === this.balance) return; this.balance = n; if (this.isOpen) this.render(); }

  show(view: EcoView, me: string, act: Act): void {
    this.view = view;
    this.me = me;
    this.act = act;
    if (!this.isOpen) audio.play('ui.open');
    this.isOpen = true;
    this.root.style.display = 'flex';
    this.render();
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.root.style.display = 'none';
    tooltip().hide();
    this.onClose?.();
  }

  private price(e: ShopEntry): number { return this.shopPrices[e.key] ?? e.price; }

  private render(): void {
    const v = this.view;
    if (!v) return;
    clear(this.root);
    tooltip().hide();
    if (v.v === 'shop' && !v.cat) return this.grid('Shop', 3, this.shopHome(), []);
    if (v.v === 'shop') {
      const cat = SHOP.find((c) => c.id === v.cat);
      if (!cat) return this.grid('Shop', 3, this.shopHome(), []);
      const cells: Cell[] = cat.items.map((e) => ({
        icon: { id: e.id, count: e.count },
        tip: [{ text: `${getItem(e.id)?.name ?? e.key} x${e.count}`, color: WHITE }, { text: `Price: ${money(this.price(e))}`, color: GOLD }, { text: 'Click to choose an amount', color: GRAY }],
        act: () => this.quantity(e),
      }));
      return this.grid(`Shop - ${cat.name}`, 6, cells, [{ slot: 49, icon: { id: I.ARROW, count: 1 }, tip: [{ text: 'Back', color: WHITE }], act: () => { this.view = { v: 'shop', cat: null }; this.render(); } }]);
    }
    if (v.v === 'ah') return this.renderAh(v);
    if (v.v === 'orders') return this.renderOrders(v);
    if (v.v === 'box') {
      const cells: Cell[] = v.items.map((st, i) => ({ icon: st, tip: [...itemTooltipLines(st), { text: 'Click to take', color: GREEN }], act: () => this.act({ a: 'claim', i }) }));
      return this.grid(`Collection box (${v.items.length})`, 6, cells, [
        { slot: 45, icon: { id: I.ARROW, count: 1 }, tip: [{ text: 'Auction House', color: WHITE }], act: () => this.act({ a: 'ah', page: 0, tab: 'all' }) },
        { slot: 49, icon: { id: B.CHEST, count: 1 }, tip: [{ text: 'Take everything', color: GREEN }], act: () => this.act({ a: 'claim', i: -1 }) },
      ]);
    }
  }

  private shopHome(): Cell[] {
    const cells: Cell[] = new Array(27).fill(null).map(() => ({ icon: null, tip: [] }));
    const start = 13 - Math.floor(SHOP.length / 2);
    SHOP.forEach((c, i) => {
      cells[start + i] = { icon: { id: c.icon, count: 1 }, tip: [{ text: c.name, color: AQUA }, { text: `${c.items.length} items`, color: GRAY }, { text: 'Click to browse', color: GREEN }], act: () => { this.view = { v: 'shop', cat: c.id }; this.render(); } };
    });
    return cells;
  }

  private quantity(e: ShopEntry): void {
    let n = 1;
    const name = getItem(e.id)?.name ?? e.key;
    const body = h('div', { class: 'stack eco-qty' });
    const line = h('div', { class: 'eco-qty-line' });
    const draw = () => {
      clear(line);
      line.appendChild(h('div', { class: 'slot mc static eco-qty-ico' }, ...slotContent(this.atlas, { id: e.id, count: Math.min(64, e.count * n) }, 32)));
      line.appendChild(h('div', {}, h('div', {}, `${e.count * n} ${name}`), h('div', { class: 'eco-gold' }, `${money(this.price(e) * n)}`), h('div', { class: 'small muted' }, `Balance: ${money(this.balance)}`)));
    };
    const step = (d: number) => { n = Math.max(1, Math.min(64, n + d)); draw(); };
    draw();
    body.append(line, h('div', { class: 'row eco-qty-btns' },
      ...[-16, -4, -1].map((d) => h('button', { class: 'btn small danger', onclick: () => step(d) }, String(d))),
      ...[1, 4, 16].map((d) => h('button', { class: 'btn small', onclick: () => step(d) }, `+${d}`)),
    ));
    modal(`Buy ${name}`, body, [{ label: 'Back', kind: 'ghost' }, { label: 'Buy', kind: 'primary', onClick: () => { this.act({ a: 'buy', key: e.key, n }); } }]);
  }

  private renderAh(v: Extract<EcoView, { v: 'ah' }>): void {
    const now = Date.now();
    const cells: Cell[] = v.items.map((l: AhListing) => {
      const mine = l.seller === this.me;
      return {
        icon: l.item,
        tip: [...itemTooltipLines(l.item), { text: `Price: ${money(l.price)}`, color: GOLD }, { text: `Seller: ${l.sellerName}`, color: GRAY }, { text: `Expires in ${left(l.expires - now)}`, color: GRAY }, { text: mine ? 'Click to cancel' : 'Click to buy', color: mine ? RED : GREEN }],
        act: () => (mine ? this.confirm(`Cancel this listing? The item goes back to you.`, () => this.act({ a: 'ahCancel', id: l.id })) : this.confirm(`Buy ${l.item.count} ${getItem(l.item.id)?.name ?? 'item'} from ${l.sellerName} for ${money(l.price)}?`, () => this.act({ a: 'ahBuy', id: l.id }))),
      };
    });
    const pg = (p: number) => this.act({ a: 'ah', page: p, tab: v.tab, q: v.q });
    this.grid(`Auction House ${v.tab === 'mine' ? '- Yours ' : ''}(${v.page + 1}/${v.pages})`, 6, cells, [
      { slot: 45, icon: { id: I.ARROW, count: 1 }, tip: [{ text: 'Previous page', color: WHITE }], act: () => pg(Math.max(0, v.page - 1)), dim: v.page === 0 },
      { slot: 46, icon: { id: I.BOOK, count: 1 }, tip: [{ text: v.q ? `Search: ${v.q}` : 'Search', color: WHITE }, { text: 'Click to search by item or seller', color: GRAY }], act: () => this.search(v.q, (q) => this.act({ a: 'ah', page: 0, tab: 'all', q })) },
      { slot: 47, icon: { id: B.CHEST, count: 1 }, tip: [{ text: v.tab === 'mine' ? 'All listings' : 'Your listings', color: WHITE }], act: () => this.act({ a: 'ah', page: 0, tab: v.tab === 'mine' ? 'all' : 'mine' }) },
      { slot: 49, icon: { id: I.EMERALD, count: 1 }, tip: [{ text: 'Sell the item in your hand', color: GREEN }, { text: `Listing fee 2%. Listings last ${LISTING_HOURS} hours.`, color: GRAY }, { text: 'Or type /ah sell <price>', color: GRAY }], act: () => this.sellHeld() },
      { slot: 51, icon: { id: B.CHEST, count: 1 }, tip: [{ text: 'Collection box', color: WHITE }, { text: 'Expired listings and bought items', color: GRAY }], act: () => this.act({ a: 'box' }) },
      { slot: 52, icon: { id: I.PAPER, count: 1 }, tip: [{ text: 'Buy orders', color: WHITE }], act: () => this.act({ a: 'orders', page: 0, tab: 'all' }) },
      { slot: 53, icon: { id: I.ARROW, count: 1 }, tip: [{ text: 'Next page', color: WHITE }], act: () => pg(Math.min(v.pages - 1, v.page + 1)), dim: v.page >= v.pages - 1 },
    ]);
  }

  private renderOrders(v: Extract<EcoView, { v: 'orders' }>): void {
    const now = Date.now();
    const cells: Cell[] = v.items.map((o: BuyOrder) => {
      const mine = o.buyer === this.me;
      const need = o.wanted - o.filled;
      return {
        icon: { id: o.itemId, count: Math.max(1, Math.min(64, need)) },
        tip: [{ text: getItem(o.itemId)?.name ?? 'Item', color: WHITE }, { text: `Wants ${need} more (${o.filled}/${o.wanted})`, color: AQUA }, { text: `Pays ${money(o.each)} each`, color: GOLD }, { text: `Buyer: ${o.buyerName}`, color: GRAY }, { text: `Expires in ${left(o.expires - now)}`, color: GRAY }, { text: mine ? 'Click to cancel and refund' : 'Click to deliver from your inventory', color: mine ? RED : GREEN }],
        act: () => (mine ? this.confirm('Cancel this order? Unspent money is refunded.', () => this.act({ a: 'orderCancel', id: o.id })) : this.act({ a: 'fill', id: o.id })),
      };
    });
    const pg = (p: number) => this.act({ a: 'orders', page: p, tab: v.tab });
    this.grid(`Orders ${v.tab === 'mine' ? '- Yours ' : ''}(${v.page + 1}/${v.pages})`, 6, cells, [
      { slot: 45, icon: { id: I.ARROW, count: 1 }, tip: [{ text: 'Previous page', color: WHITE }], act: () => pg(Math.max(0, v.page - 1)), dim: v.page === 0 },
      { slot: 47, icon: { id: B.CHEST, count: 1 }, tip: [{ text: v.tab === 'mine' ? 'All orders' : 'Your orders', color: WHITE }], act: () => this.act({ a: 'orders', page: 0, tab: v.tab === 'mine' ? 'all' : 'mine' }) },
      { slot: 49, icon: { id: I.EMERALD, count: 1 }, tip: [{ text: 'New buy order', color: GREEN }, { text: 'The money is held until the order fills or expires.', color: GRAY }, { text: 'Or type /order <item> <amount> <price each>', color: GRAY }], act: () => this.newOrder() },
      { slot: 51, icon: { id: B.CHEST, count: 1 }, tip: [{ text: 'Collection box', color: WHITE }, { text: 'Items delivered to your orders', color: GRAY }], act: () => this.act({ a: 'box' }) },
      { slot: 52, icon: { id: I.GOLD_INGOT, count: 1 }, tip: [{ text: 'Auction House', color: WHITE }], act: () => this.act({ a: 'ah', page: 0, tab: 'all' }) },
      { slot: 53, icon: { id: I.ARROW, count: 1 }, tip: [{ text: 'Next page', color: WHITE }], act: () => pg(Math.min(v.pages - 1, v.page + 1)), dim: v.page >= v.pages - 1 },
    ]);
  }

  private confirm(text: string, ok: () => void): void {
    modal('Confirm', h('p', {}, text), [{ label: 'Cancel', kind: 'ghost' }, { label: 'Confirm', kind: 'primary', onClick: () => { ok(); } }]);
  }

  private search(q: string, go: (q: string) => void): void {
    const input = h('input', { class: 'input', value: q, maxlength: 32, placeholder: 'Item or seller' }) as HTMLInputElement;
    modal('Search the Auction House', input, [{ label: 'Clear', kind: 'ghost', onClick: () => go('') }, { label: 'Search', kind: 'primary', onClick: () => go(input.value.trim()) }]);
    setTimeout(() => input.focus(), 50);
  }

  private sellHeld(): void {
    const input = h('input', { class: 'input', placeholder: 'Price, for example 2500 or 2.5k', maxlength: 16, inputmode: 'decimal' }) as HTMLInputElement;
    const note = h('div', { class: 'small muted' }, 'Lists the whole stack in your hand. A 2% fee is charged now.');
    input.addEventListener('input', () => { const p = parseMoney(input.value); note.textContent = p ? `Price ${money(p)}, fee ${money(fee(p))}.` : 'Lists the whole stack in your hand. A 2% fee is charged now.'; });
    modal('Sell held item', h('div', { class: 'stack' }, input, note), [{ label: 'Cancel', kind: 'ghost' }, { label: 'List it', kind: 'primary', onClick: () => {
      const p = parseMoney(input.value);
      if (!p) { toast('Enter a price', 'error'); return false; }
      this.act({ a: 'chat', text: `/ah sell ${p}` });
      return true;
    } }]);
    setTimeout(() => input.focus(), 50);
  }

  private newOrder(): void {
    let sel = ITEM_LIST.find((i) => i.id === I.IRON_INGOT)!;
    const q = h('input', { class: 'input', placeholder: 'Search items', maxlength: 24 }) as HTMLInputElement;
    const list = h('div', { class: 'eco-pick' });
    const amount = h('input', { class: 'input', value: '64', inputmode: 'numeric', maxlength: 5 }) as HTMLInputElement;
    const each = h('input', { class: 'input', placeholder: 'Price each', inputmode: 'decimal', maxlength: 12 }) as HTMLInputElement;
    const note = h('div', { class: 'small muted' });
    const upd = () => {
      const a = Math.floor(Number(amount.value)), e = parseMoney(each.value);
      note.textContent = a > 0 && e ? `${a} ${sel.name} at ${money(e)} each = ${money(a * e)} held, plus a ${money(fee(a * e))} fee.` : `Selected: ${sel.name}`;
    };
    const fill = () => {
      clear(list);
      const t = q.value.trim().toLowerCase();
      for (const it of ITEM_LIST.filter((i) => !t || i.name.toLowerCase().includes(t)).slice(0, 40)) {
        const b = h('button', { class: `slot mc static eco-pick-item${it.id === sel.id ? ' sel' : ''}`, title: it.name, onclick: () => { sel = it; fill(); upd(); } }, ...slotContent(this.atlas, { id: it.id, count: 1 }, 24));
        list.appendChild(b);
      }
    };
    q.addEventListener('input', fill); amount.addEventListener('input', upd); each.addEventListener('input', upd);
    fill(); upd();
    modal('New buy order', h('div', { class: 'stack' }, q, list, h('div', { class: 'row' }, h('label', { class: 'field' }, h('span', {}, 'Amount'), amount), h('label', { class: 'field' }, h('span', {}, 'Price each'), each)), note), [
      { label: 'Cancel', kind: 'ghost' },
      { label: 'Place order', kind: 'primary', onClick: () => {
        const a = Math.floor(Number(amount.value)), e = parseMoney(each.value);
        if (!(a > 0) || !e) { toast('Enter an amount and a price', 'error'); return false; }
        this.act({ a: 'chat', text: `/order ${sel.key} ${a} ${e}` });
        return true;
      } },
    ], { wide: true });
  }

  private grid(title: string, rows: 3 | 6, cells: Cell[], controls: (Cell & { slot: number })[]): void {
    const A = this.atlas;
    const w = 176, hgt = 17 + rows * 18 + 7;
    const s = guiScale(w, hgt + 30);
    const win = h('div', { class: 'mc-win', style: `width:${w * s}px;height:${hgt * s}px;--s:${s}px` });
    win.appendChild(crop(A, 'gt:container/generic_54', 256, 256, 0, 0, w, rows * 18 + 17, s));
    win.appendChild(crop(A, 'gt:container/generic_54', 256, 256, 0, 215, w, 7, s, 0, rows * 18 + 17));
    win.appendChild(label(title, 8, 6, s));
    win.appendChild(label(money(this.balance), 16, 6, s, { right: true, color: '#2f6b14' }));
    const all: (Cell | null)[] = new Array(rows * 9).fill(null);
    const usable = rows === 6 ? 45 : 27;
    cells.slice(0, usable).forEach((c, i) => { all[i] = c; });
    for (const c of controls) all[c.slot] = c;
    all.forEach((c, i) => {
      const x = 7 + (i % 9) * 18, y = 17 + Math.floor(i / 9) * 18;
      const el = h('div', { class: `slot mc${c?.dim ? ' eco-dim' : ''}`, style: `left:${x * s}px;top:${y * s}px;width:${18 * s}px;height:${18 * s}px` });
      if (c?.icon) for (const n of slotContent(A, c.icon, 16 * s)) el.appendChild(n);
      if (c) {
        let lp = 0, long = false;
        el.addEventListener('pointerenter', (e) => { el.classList.add('hover'); if (e.pointerType === 'mouse' && c.tip.length) tooltip().show(A, c.tip, e.clientX, e.clientY); });
        el.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' && c.tip.length) tooltip().show(A, c.tip, e.clientX, e.clientY); });
        el.addEventListener('pointerleave', () => { el.classList.remove('hover'); tooltip().hide(); clearTimeout(lp); });
        el.addEventListener('pointerdown', (e) => {
          e.stopPropagation(); e.preventDefault();
          if (e.pointerType === 'mouse') { if (c.act && !c.dim) { audio.play('ui.click'); c.act(false, e.shiftKey); } return; }
          long = false;
          if (c.tip.length) tooltip().show(A, c.tip, e.clientX, e.clientY - 60, 2600);
          lp = window.setTimeout(() => { long = true; }, 450);
        });
        el.addEventListener('pointerup', (e) => { if (e.pointerType === 'mouse') return; clearTimeout(lp); if (!long && c.act && !c.dim) { audio.play('ui.click'); c.act(false, false); } });
      }
      win.appendChild(el);
    });
    const close = h('div', { class: 'mc-close', style: `right:${3 * s}px;top:${3 * s}px;width:${9 * s}px;height:${9 * s}px;font-size:${9 * s}px;line-height:${8 * s}px` }, '×');
    close.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.close(); });
    win.appendChild(close);
    this.root.appendChild(h('div', { class: 'inv-wrap' }, win));
  }
}

import { h } from './dom';
import type { TextureAtlas } from '../resources/TextureAtlas';
import type { PlayerInv, ItemStack } from '../core/inventory';
import { countItem } from '../core/inventory';
import { itemName } from '../core/items';
import { OFFERS, PROFESSIONS, PROF_TITLE, LEVEL_NAMES, LEVEL_XP, levelFor, unlocked, canAfford } from '../core/trades';
import type { TradeInfo } from '../game/Session';

export class TradeUI {
  private el: HTMLElement;
  private atlas: TextureAtlas;
  private info: TradeInfo | null = null;
  private inv: PlayerInv | null = null;
  private sel = -1;
  private onTrade: ((id: string, i: number, n: number) => void) | null = null;
  isOpen = false;
  onClose: (() => void) | null = null;

  constructor(screens: HTMLElement, atlas: TextureAtlas) {
    this.atlas = atlas;
    this.el = h('div', { class: 'trade-screen modal-backdrop', style: 'display:none' });
    screens.append(this.el);
  }

  setAtlas(a: TextureAtlas): void { this.atlas = a; if (this.isOpen) this.render(); }

  open(inv: PlayerInv, onTrade: (id: string, i: number, n: number) => void): void {
    this.inv = inv;
    this.onTrade = onTrade;
    this.isOpen = true;
    this.info = null;
    this.sel = -1;
    this.el.style.display = '';
    this.render();
  }

  update(info: TradeInfo): void {
    const changed = this.info?.id !== info.id;
    this.info = info;
    if (changed) this.sel = -1;
    if (this.isOpen) this.render();
  }

  refresh(inv: PlayerInv): void { if (this.isOpen) { this.inv = inv; this.render(); } }

  close(silent = false): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.el.style.display = 'none';
    if (!silent) this.onClose?.();
  }

  dispose(): void { this.el.remove(); }

  private icon(st: ItemStack, size: number, cls = 'tr-slot'): HTMLElement {
    return h('span', { class: cls, title: itemName(st.id) },
      h('span', { class: 'tr-ico', style: `${this.atlas.iconStyle(st.id, size)};width:${size}px;height:${size}px` }),
      st.count > 1 ? h('span', { class: 'tr-n' }, String(st.count)) : null);
  }

  private render(): void {
    const head = h('div', { class: 'card-head' });
    const body = h('div', { class: 'card-body trade-body' });
    if (!this.info || !this.inv) {
      head.append(h('h2', {}, 'Villager'), h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: () => this.close(), html: '&times;' }));
      body.append(h('div', { class: 'tr-wait' }, 'Greeting the villager...'));
      this.el.replaceChildren(h('div', { class: 'card panel trade-card' }, head, body));
      return;
    }
    const info = this.info, inv = this.inv;
    const prof = PROFESSIONS[info.prof] ?? 'farmer';
    const lvl = levelFor(info.xp);
    const nextXp = LEVEL_XP[lvl + 1];
    const pct = nextXp === undefined ? 100 : Math.round(((info.xp - LEVEL_XP[lvl]) / (nextXp - LEVEL_XP[lvl])) * 100);
    head.append(
      h('div', { class: 'tr-title' }, h('h2', {}, `${PROF_TITLE[prof]} - ${LEVEL_NAMES[lvl]}`),
        h('div', { class: 'tr-xp', title: nextXp === undefined ? 'Master' : `${info.xp} / ${nextXp}` }, h('div', { class: 'tr-xp-fill', style: `width:${pct}%` }))),
      h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: () => this.close(), html: '&times;' }),
    );
    const list = h('div', { class: 'tr-list' });
    const offers = unlocked(prof, info.xp);
    if (this.sel < 0 || !offers.includes(this.sel)) this.sel = offers[0] ?? -1;
    for (const i of offers) {
      const of = OFFERS[prof][i];
      const out = (info.uses[i] ?? 0) >= of.max;
      const afford = canAfford(inv, of);
      list.append(h('button', {
        class: `tr-offer${i === this.sel ? ' on' : ''}${out ? ' out' : ''}${!afford ? ' poor' : ''}`,
        onclick: () => { this.sel = i; this.render(); },
      },
      h('span', { class: 'tr-cost' }, ...of.cost.map((c) => this.icon(c, 28))),
      h('span', { class: 'tr-arrow' }, out ? 'x' : '>'),
      this.icon(of.give, 28)));
    }
    const detail = h('div', { class: 'tr-detail' });
    if (this.sel >= 0) {
      const of = OFFERS[prof][this.sel];
      const left = of.max - (info.uses[this.sel] ?? 0);
      const afford = canAfford(inv, of);
      let maxTimes = left;
      for (const c of of.cost) maxTimes = Math.min(maxTimes, Math.floor(countItem(inv, c.id) / c.count));
      detail.append(
        h('div', { class: 'tr-row' },
          ...of.cost.map((c) => h('div', { class: 'tr-cell' }, this.icon(c, 40, 'tr-slot big'), h('div', { class: `tr-have${countItem(inv, c.id) >= c.count ? '' : ' bad'}` }, `${itemName(c.id)}`), h('div', { class: 'tr-have-n' }, `You have ${countItem(inv, c.id)}`))),
          h('div', { class: 'tr-big-arrow' }, left > 0 ? '>' : 'x'),
          h('div', { class: 'tr-cell' }, this.icon(of.give, 40, 'tr-slot big out-slot'), h('div', { class: 'tr-have' }, itemName(of.give.id)))),
        h('div', { class: 'tr-stock' }, left > 0 ? `${left} trade${left === 1 ? '' : 's'} left before restock` : 'Sold out. Come back tomorrow.'),
        h('div', { class: 'tr-actions' },
          h('button', { class: 'btn primary', disabled: !afford || left <= 0, onclick: () => this.onTrade?.(info.id, this.sel, 1) }, 'Trade'),
          h('button', { class: 'btn', disabled: maxTimes < 2, onclick: () => this.onTrade?.(info.id, this.sel, maxTimes) }, maxTimes > 1 ? `Trade x${maxTimes}` : 'Trade all')),
      );
    } else detail.append(h('div', { class: 'tr-wait' }, 'This villager has nothing to trade yet.'));
    const emeralds = countItem(inv, 295);
    body.append(h('div', { class: 'tr-wallet' }, this.icon({ id: 295, count: 1 }, 22, 'tr-mini'), `${emeralds} Emerald${emeralds === 1 ? '' : 's'}`), h('div', { class: 'tr-split' }, list, detail));
    this.el.replaceChildren(h('div', { class: 'card panel trade-card' }, head, body));
  }
}

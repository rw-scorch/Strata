import { h } from './dom';
import type { TextureAtlas } from '../resources/TextureAtlas';
import type { GameState } from '../core/minigames/Minigame';
import { ARENA_INFO } from '../core/minigames/arena';
import { SHOP, CURRENCY_ITEM, CURRENCY_NAME, ShopOffer, Currency } from '../core/minigames/shop';
import type { PlayerInv } from '../core/inventory';

const CATS: [ShopOffer['cat'], string][] = [['blocks', 'Blocks'], ['combat', 'Combat'], ['tools', 'Tools'], ['supplies', 'Supplies'], ['upgrades', 'Team upgrades']];

function mmss(s: number): string { return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }

export class ArenaUI {
  private board: HTMLElement;
  private titleEl: HTMLElement;
  private shopEl: HTMLElement;
  private atlas: TextureAtlas;
  private titleT = 0;
  private cat: ShopOffer['cat'] = 'blocks';
  private onBuy: ((k: string) => void) | null = null;
  private inv: PlayerInv | null = null;
  state: GameState | null = null;
  shopOpen = false;
  onShopClose: (() => void) | null = null;

  constructor(hudRoot: HTMLElement, screens: HTMLElement, atlas: TextureAtlas) {
    this.atlas = atlas;
    this.board = h('div', { class: 'arena-board' });
    this.titleEl = h('div', { class: 'arena-title' });
    this.shopEl = h('div', { class: 'arena-shop modal-backdrop', style: 'display:none' });
    hudRoot.append(this.board, this.titleEl);
    screens.append(this.shopEl);
  }

  setState(s: GameState, myId: string): void {
    this.state = s;
    const info = ARENA_INFO[s.kind];
    const me = s.players.find((p) => p.id === myId);
    let phase = '';
    if (s.phase === 'waiting') phase = 'Waiting for players';
    else if (s.phase === 'countdown') phase = `Starting in ${s.timer}s`;
    else if (s.phase === 'playing') phase = s.kind === 'spires' ? `Fortune in ${s.next}s` : `Time ${mmss(s.timer)}`;
    else phase = s.winner ? `${s.winner} wins` : 'Draw';
    const rows: HTMLElement[] = [];
    if (s.kind === 'hearthfall' && s.phase !== 'waiting' && s.phase !== 'countdown') {
      s.teams.forEach((t, i) => {
        if (!s.players.some((p) => p.team === i)) return;
        rows.push(h('div', { class: `ab-row${me?.team === i ? ' mine' : ''}${!t.hearth && !t.alive ? ' out' : ''}` },
          h('span', { class: 'ab-sw', style: `background:${t.color}` }),
          h('span', { class: 'ab-name' }, t.name),
          h('span', { class: `ab-hearth ${t.hearth ? 'ok' : 'gone'}` }, t.hearth ? 'Hearth' : `${t.alive} left`),
        ));
        if (t.upgrades.length && me?.team === i) rows.push(h('div', { class: 'ab-ups' }, t.upgrades.join(' / ')));
      });
    } else if (s.phase === 'playing' || s.phase === 'ended') {
      [...s.players].sort((a, b) => Number(b.alive) - Number(a.alive) || b.kills - a.kills).forEach((p) => {
        rows.push(h('div', { class: `ab-row${p.id === myId ? ' mine' : ''}${p.alive ? '' : ' out'}` },
          h('span', { class: 'ab-name' }, p.name), h('span', { class: 'ab-k' }, `${p.kills} KO`)));
      });
    } else {
      rows.push(h('div', { class: 'ab-hint' }, info.desc));
      rows.push(h('div', { class: 'ab-hint dim' }, `Rivals fill ${s.bots} empty slot${s.bots === 1 ? '' : 's'}. Type /game for options.`));
    }
    this.board.replaceChildren(
      h('div', { class: 'ab-title' }, info.name, h('span', { class: 'ab-alt' }, info.alt)),
      h('div', { class: 'ab-phase' }, phase),
      ...rows,
    );
    this.board.style.display = 'block';
  }

  dispose(): void { this.board.remove(); this.titleEl.remove(); this.shopEl.remove(); }

  hide(): void { this.board.style.display = 'none'; this.closeShop(true); }

  title(text: string, sub: string): void {
    this.titleEl.replaceChildren(h('div', { class: 'at-main' }, text), h('div', { class: 'at-sub' }, sub));
    this.titleEl.classList.add('on');
    clearTimeout(this.titleT);
    this.titleT = window.setTimeout(() => this.titleEl.classList.remove('on'), 2600);
  }

  openShop(inv: PlayerInv, onBuy: (k: string) => void): void {
    this.inv = inv;
    this.onBuy = onBuy;
    this.shopOpen = true;
    this.board.style.visibility = 'hidden';
    this.shopEl.style.display = '';
    this.renderShop();
  }

  refreshShop(inv: PlayerInv): void { if (this.shopOpen) { this.inv = inv; this.renderShop(); } }

  closeShop(silent = false): void {
    if (!this.shopOpen) return;
    this.shopOpen = false;
    this.board.style.visibility = '';
    this.shopEl.style.display = 'none';
    if (!silent) this.onShopClose?.();
  }

  private count(c: Currency): number {
    let n = 0;
    for (const s of this.inv?.slots ?? []) if (s && s.id === CURRENCY_ITEM[c]) n += s.count;
    return n;
  }

  private renderShop(): void {
    const wallet = (['iron', 'gold', 'aetherite'] as Currency[]).map((c) => h('span', { class: `wallet ${c}` },
      h('span', { class: 'shop-ico', style: `${this.atlas.iconStyle(CURRENCY_ITEM[c], 22)};width:22px;height:22px` }), `${this.count(c)} ${CURRENCY_NAME[c]}`));
    const tabs = CATS.map(([k, label]) => h('button', { class: `tab${k === this.cat ? ' on' : ''}`, onclick: () => { this.cat = k; this.renderShop(); } }, label));
    const offers = SHOP.filter((o) => o.cat === this.cat).map((o) => {
      const afford = this.count(o.cost[0]) >= o.cost[1];
      return h('div', { class: `offer${afford ? '' : ' poor'}` },
        h('span', { class: 'shop-ico', style: `${this.atlas.iconStyle(o.icon, 40)};width:40px;height:40px` }),
        h('div', { class: 'of-text' }, h('div', { class: 'of-name' }, o.name), h('div', { class: 'of-desc' }, o.desc)),
        h('button', { class: `btn ${afford ? 'primary' : ''} of-buy`, disabled: !afford, onclick: () => this.onBuy?.(o.key) }, `${o.cost[1]} ${CURRENCY_NAME[o.cost[0]]}`),
      );
    });
    this.shopEl.replaceChildren(h('div', { class: 'card panel shop-card' },
      h('div', { class: 'card-head' }, h('h2', {}, 'Quartermaster'), h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: () => this.closeShop(), html: '&times;' })),
      h('div', { class: 'card-body' },
        h('div', { class: 'wallet-row' }, ...wallet),
        h('div', { class: 'tabs' }, ...tabs),
        h('div', { class: 'offers' }, ...offers)),
    ));
  }
}

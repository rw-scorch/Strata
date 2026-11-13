import type { WorldSim, SimPlayer } from '../../src/core/sim/WorldSim';
import { ItemStack, giveItem, validStack, cloneStack } from '../../src/core/inventory';
import { getItem, maxStack, ITEM_LIST } from '../../src/core/items';
import {
  defaultSellPrices, sellValue, SHOP, shopEntry, money, parseMoney, fee, MAX_LISTINGS, MAX_ORDERS, LISTING_HOURS, BOX_MAX, MAX_PRICE,
  AhListing, BuyOrder, EcoView, EcoStats,
} from '../../src/core/economy';

export interface EcoHooks {
  sim(): WorldSim;
  send(pid: string, msg: unknown): void;
  chat(pid: string, text: string, kind?: 'info' | 'error' | 'system'): void;
  enabled(): boolean;
  playtime(p: SimPlayer): number;
}

const PAGE = 45;
const HOUR = 3600_000;

export class Economy {
  private prices: Map<number, number>;
  private shopPrices = new Map<string, number>();

  constructor(private sql: SqlStorage, private h: EcoHooks) {
    sql.exec(`CREATE TABLE IF NOT EXISTS eco_bal (id TEXT PRIMARY KEY, name TEXT, money INTEGER NOT NULL DEFAULT 0)`);
    sql.exec(`CREATE TABLE IF NOT EXISTS eco_ah (id INTEGER PRIMARY KEY AUTOINCREMENT, seller TEXT, seller_name TEXT, item TEXT, price INTEGER, expires INTEGER)`);
    sql.exec(`CREATE TABLE IF NOT EXISTS eco_orders (id INTEGER PRIMARY KEY AUTOINCREMENT, buyer TEXT, buyer_name TEXT, item_id INTEGER, wanted INTEGER, filled INTEGER, each_price INTEGER, expires INTEGER)`);
    sql.exec(`CREATE TABLE IF NOT EXISTS eco_box (owner TEXT PRIMARY KEY, items TEXT)`);
    this.prices = new Map(defaultSellPrices());
    const row = sql.exec(`SELECT v FROM kv WHERE k = 'eco_prices'`).toArray()[0];
    if (row) {
      try {
        const o = JSON.parse(row.v as string) as { sell?: Record<string, number>; shop?: Record<string, number> };
        for (const [k, v] of Object.entries(o.sell ?? {})) if (getItem(Number(k)) && Number.isInteger(v) && v >= 0) this.prices.set(Number(k), v);
        for (const [k, v] of Object.entries(o.shop ?? {})) if (shopEntry(k) && Number.isInteger(v) && v > 0) this.shopPrices.set(k, v);
      } catch { /* ignore corrupt overrides */ }
    }
  }

  sellPrices(): Record<number, number> { return Object.fromEntries([...this.prices].filter(([, v]) => v > 0)); }

  shopPrice(key: string): number { return this.shopPrices.get(key) ?? shopEntry(key)?.price ?? 0; }

  priceTable(): { sell: Record<number, number>; shop: Record<string, number> } {
    return { sell: Object.fromEntries(this.prices), shop: Object.fromEntries(SHOP.flatMap((c) => c.items.map((i) => [i.key, this.shopPrice(i.key)]))) };
  }

  setPrices(patch: { sell?: Record<string, number>; shop?: Record<string, number> }): void {
    const defaults = defaultSellPrices();
    for (const [k, v] of Object.entries(patch.sell ?? {})) { const id = Number(k), n = Math.floor(Number(v)); if (getItem(id) && Number.isFinite(n) && n >= 0 && n <= MAX_PRICE) this.prices.set(id, n); }
    for (const [k, v] of Object.entries(patch.shop ?? {})) { const n = Math.floor(Number(v)); if (shopEntry(k) && Number.isFinite(n) && n > 0 && n <= MAX_PRICE) this.shopPrices.set(k, n); }
    const sell: Record<number, number> = {};
    for (const [id, v] of this.prices) if (defaults.get(id) !== v) sell[id] = v;
    this.sql.exec(`INSERT OR REPLACE INTO kv (k, v) VALUES ('eco_prices', ?)`, JSON.stringify({ sell, shop: Object.fromEntries(this.shopPrices) }));
    const msg = { t: 'eco', k: 'prices', sell: this.sellPrices(), shop: this.priceTable().shop };
    for (const p of this.h.sim().players.values()) this.h.send(p.id, msg);
  }

  balance(id: string): number { return Number(this.sql.exec(`SELECT money FROM eco_bal WHERE id = ?`, id).toArray()[0]?.money ?? 0); }

  private add(id: string, name: string, n: number): void {
    this.sql.exec(`INSERT INTO eco_bal (id, name, money) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET money = money + excluded.money, name = excluded.name`, id, name, Math.floor(n));
  }

  private take(p: SimPlayer, n: number): boolean {
    if (n <= 0) return true;
    if (this.balance(p.id) < n) return false;
    this.add(p.id, p.name, -n);
    return true;
  }

  private credit(id: string, name: string | null, n: number): void {
    if (n <= 0) return;
    const nm = name ?? String(this.sql.exec(`SELECT name FROM eco_bal WHERE id = ?`, id).toArray()[0]?.name ?? '');
    this.add(id, nm, n);
    const p = this.h.sim().players.get(id);
    if (p) this.stats(p);
  }

  joined(p: SimPlayer): void {
    this.sql.exec(`INSERT INTO eco_bal (id, name, money) VALUES (?, ?, 0) ON CONFLICT(id) DO UPDATE SET name = excluded.name`, p.id, p.name);
    this.h.send(p.id, { t: 'eco', k: 'prices', sell: this.sellPrices(), shop: this.priceTable().shop, on: this.h.enabled() });
    this.stats(p);
    const box = this.box(p.id);
    if (box.length) this.h.chat(p.id, `You have ${box.length} item stack${box.length === 1 ? '' : 's'} waiting. Type /ah collect.`, 'info');
  }

  stats(p: SimPlayer): void {
    const st: EcoStats = { money: this.balance(p.id), kills: p.kills ?? 0, deaths: p.deaths ?? 0, playtime: Math.floor(this.h.playtime(p)) };
    this.h.send(p.id, { t: 'eco', k: 'stats', ...st });
  }

  private box(id: string): ItemStack[] {
    const row = this.sql.exec(`SELECT items FROM eco_box WHERE owner = ?`, id).toArray()[0];
    if (!row) return [];
    try { return (JSON.parse(row.items as string) as unknown[]).filter(validStack).map((s) => cloneStack(s)!); } catch { return []; }
  }

  private saveBox(id: string, items: ItemStack[]): void {
    if (!items.length) this.sql.exec(`DELETE FROM eco_box WHERE owner = ?`, id);
    else this.sql.exec(`INSERT OR REPLACE INTO eco_box (owner, items) VALUES (?, ?)`, id, JSON.stringify(items.slice(0, BOX_MAX)));
  }

  private toBox(id: string, st: ItemStack): void {
    const b = this.box(id);
    let left = st.count;
    for (const s of b) if (s.id === st.id && (s.dmg ?? 0) === (st.dmg ?? 0) && s.count < maxStack(s.id) && left > 0) { const n = Math.min(left, maxStack(s.id) - s.count); s.count += n; left -= n; }
    while (left > 0 && b.length < BOX_MAX) { const n = Math.min(left, maxStack(st.id)); b.push({ ...st, count: n }); left -= n; }
    this.saveBox(id, b);
  }

  private deliver(p: SimPlayer, st: ItemStack): void {
    const left = giveItem(p.inv, st);
    if (left > 0) { this.toBox(p.id, { ...st, count: left }); this.h.chat(p.id, 'Your inventory is full, so the rest went to your collection box (/ah collect).', 'info'); }
    this.h.sim().emitInv(p);
  }

  tick(now: number): void {
    const ah = this.sql.exec(`SELECT id, seller, item FROM eco_ah WHERE expires < ? LIMIT 50`, now).toArray();
    for (const r of ah) {
      this.sql.exec(`DELETE FROM eco_ah WHERE id = ?`, r.id);
      try { const st = JSON.parse(r.item as string); if (validStack(st)) { this.toBox(String(r.seller), st); this.h.chat(String(r.seller), `Your auction listing expired. ${getItem(st.id)?.name ?? 'The item'} is in /ah collect.`, 'info'); } } catch { /* skip */ }
    }
    const ord = this.sql.exec(`SELECT id, buyer, buyer_name, wanted, filled, each_price FROM eco_orders WHERE expires < ? LIMIT 50`, now).toArray();
    for (const r of ord) {
      this.sql.exec(`DELETE FROM eco_orders WHERE id = ?`, r.id);
      const refund = (Number(r.wanted) - Number(r.filled)) * Number(r.each_price);
      if (refund > 0) { this.credit(String(r.buyer), String(r.buyer_name), refund); this.h.chat(String(r.buyer), `Your buy order expired. ${money(refund)} was refunded.`, 'info'); }
    }
  }

  command(p: SimPlayer, text: string): boolean {
    const parts = text.trim().slice(1).split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const known = ['sell', 'shop', 'ah', 'auction', 'order', 'orders', 'pay', 'bal', 'balance', 'money', 'baltop', 'eco'];
    if (!known.includes(cmd)) return false;
    if (!this.h.enabled() && cmd !== 'eco') { this.h.chat(p.id, 'The economy is turned off in this world.', 'error'); return true; }
    const say = (t: string, k: 'info' | 'error' = 'info') => this.h.chat(p.id, t, k);
    switch (cmd) {
      case 'bal': case 'balance': case 'money': {
        if (parts[1]) { const o = this.findAccount(parts[1]); say(o ? `${o.name} has ${money(o.money)}.` : 'No player by that name.', o ? 'info' : 'error'); }
        else say(`Balance: ${money(this.balance(p.id))}`);
        return true;
      }
      case 'baltop': {
        const rows = this.sql.exec(`SELECT name, money FROM eco_bal ORDER BY money DESC LIMIT 10`).toArray();
        say(['Richest players:', ...rows.map((r, i) => `${i + 1}. ${r.name} ${money(Number(r.money))}`)].join('\n'));
        return true;
      }
      case 'pay': {
        const to = parts[1] ? this.findAccount(parts[1]) : null;
        const n = parts[2] ? parseMoney(parts[2]) : null;
        if (!to || !n) { say('Usage: /pay <player> <amount>', 'error'); return true; }
        if (to.id === p.id) { say('You cannot pay yourself.', 'error'); return true; }
        if (!this.take(p, n)) { say(`You only have ${money(this.balance(p.id))}.`, 'error'); return true; }
        this.credit(to.id, to.name, n);
        this.stats(p);
        say(`You paid ${to.name} ${money(n)}.`);
        this.h.chat(to.id, `${p.name} paid you ${money(n)}.`, 'info');
        return true;
      }
      case 'sell': {
        const sub = (parts[1] ?? '').toLowerCase();
        if (sub === 'hand') { this.sellSlots(p, [p.inv.selected]); return true; }
        if (sub === 'all') { this.sellSlots(p, p.inv.slots.map((_, i) => i)); return true; }
        this.h.sim().openVirtual(p, 'sell', 54, 'Sell items');
        return true;
      }
      case 'shop': this.h.send(p.id, { t: 'eco', k: 'view', view: { v: 'shop', cat: parts[1] ?? null } satisfies EcoView }); return true;
      case 'ah': case 'auction': {
        const sub = (parts[1] ?? '').toLowerCase();
        if (sub === 'sell' || sub === 'list') { this.ahList(p, parts[2] ?? ''); return true; }
        if (sub === 'collect' || sub === 'box') { this.showBox(p); return true; }
        if (sub === 'mine') { this.showAh(p, 0, 'mine', ''); return true; }
        this.showAh(p, 0, 'all', sub ? parts.slice(1).join(' ') : '');
        return true;
      }
      case 'order': case 'orders': {
        if (parts.length >= 4) { this.orderCreate(p, parts[1], parts[2], parts[3]); return true; }
        if ((parts[1] ?? '').toLowerCase() === 'mine') { this.showOrders(p, 0, 'mine'); return true; }
        if (parts.length > 1) { say('Usage: /order <item> <amount> <price each>, for example /order iron_ingot 64 30', 'error'); return true; }
        this.showOrders(p, 0, 'all');
        return true;
      }
      case 'eco': {
        if (!p.op) { say('Only operators can use /eco.', 'error'); return true; }
        const sub = (parts[1] ?? '').toLowerCase();
        if (sub === 'give' || sub === 'take' || sub === 'set') {
          const o = parts[2] ? this.findAccount(parts[2]) : null;
          const n = parts[3] ? (parts[3] === '0' ? 0 : parseMoney(parts[3])) : null;
          if (!o || n === null) { say('Usage: /eco give|take|set <player> <amount>', 'error'); return true; }
          const cur = this.balance(o.id);
          const next = sub === 'give' ? cur + n : sub === 'take' ? Math.max(0, cur - n) : n;
          this.add(o.id, o.name, next - cur);
          const op = this.h.sim().players.get(o.id); if (op) this.stats(op);
          say(`${o.name} now has ${money(next)}.`);
          return true;
        }
        if (sub === 'price' || sub === 'shopprice') {
          const key = (parts[2] ?? '').toLowerCase();
          const n = parts[3] === '0' ? 0 : parts[3] ? parseMoney(parts[3]) : null;
          if (sub === 'price') {
            const it = ITEM_LIST.find((i) => i.key === key);
            if (!it || n === null) { say('Usage: /eco price <item> <sell price each, 0 to stop selling>', 'error'); return true; }
            this.setPrices({ sell: { [it.id]: n } });
            say(`${it.name} now sells for ${money(n)} each.`);
          } else {
            if (!shopEntry(key) || !n) { say('Usage: /eco shopprice <shop key> <price>', 'error'); return true; }
            this.setPrices({ shop: { [key]: n } });
            say(`Shop price for ${key} is now ${money(n)}.`);
          }
          return true;
        }
        if (sub === 'on' || sub === 'off') return false;
        say('Usage: /eco give|take|set <player> <amount>, /eco price <item> <amount>, /eco shopprice <key> <amount>');
        return true;
      }
    }
    return false;
  }

  private findAccount(name: string): { id: string; name: string; money: number } | null {
    const online = [...this.h.sim().players.values()].find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (online) return { id: online.id, name: online.name, money: this.balance(online.id) };
    const r = this.sql.exec(`SELECT id, name, money FROM eco_bal WHERE lower(name) = ? LIMIT 1`, name.toLowerCase()).toArray()[0];
    return r ? { id: String(r.id), name: String(r.name), money: Number(r.money) } : null;
  }

  private sellSlots(p: SimPlayer, idx: number[]): void {
    let total = 0, n = 0;
    for (const i of idx) {
      const st = p.inv.slots[i];
      if (!st) continue;
      const v = sellValue(st, this.prices);
      if (v <= 0) continue;
      total += v; n += st.count;
      p.inv.slots[i] = null;
    }
    if (!n) { this.h.chat(p.id, 'Nothing there can be sold.', 'error'); return; }
    this.credit(p.id, p.name, total);
    this.h.sim().emitInv(p);
    this.h.chat(p.id, `Sold ${n} item${n === 1 ? '' : 's'} for ${money(total)}.`);
  }

  virtualClosed(p: SimPlayer, kind: string, items: (ItemStack | null)[]): void {
    if (kind !== 'sell') { for (const st of items) if (st) this.deliver(p, st); return; }
    let total = 0, n = 0;
    for (const st of items) {
      if (!st) continue;
      const v = sellValue(st, this.prices);
      if (v > 0) { total += v; n += st.count; } else this.deliver(p, st);
    }
    if (n) { this.credit(p.id, p.name, total); this.h.chat(p.id, `Sold ${n} item${n === 1 ? '' : 's'} for ${money(total)}.`); }
  }

  action(p: SimPlayer, m: Record<string, unknown>): void {
    if (!this.h.enabled()) return;
    const a = String(m.a ?? '');
    const id = Number(m.id);
    switch (a) {
      case 'buy': this.shopBuy(p, String(m.key ?? ''), Math.floor(Number(m.n) || 1)); return;
      case 'ah': this.showAh(p, Math.max(0, Math.floor(Number(m.page) || 0)), m.tab === 'mine' ? 'mine' : 'all', String(m.q ?? '').slice(0, 32)); return;
      case 'ahBuy': if (Number.isInteger(id)) this.ahBuy(p, id); return;
      case 'ahCancel': if (Number.isInteger(id)) this.ahCancel(p, id); return;
      case 'orders': this.showOrders(p, Math.max(0, Math.floor(Number(m.page) || 0)), m.tab === 'mine' ? 'mine' : 'all'); return;
      case 'fill': if (Number.isInteger(id)) this.orderFill(p, id); return;
      case 'orderCancel': if (Number.isInteger(id)) this.orderCancel(p, id); return;
      case 'box': this.showBox(p); return;
      case 'claim': this.claim(p, Number.isInteger(m.i) ? Number(m.i) : -1); return;
    }
  }

  private shopBuy(p: SimPlayer, key: string, times: number): void {
    const e = shopEntry(key);
    if (!e || times < 1 || times > 64) return;
    const cost = this.shopPrice(key) * times;
    if (!this.take(p, cost)) { this.h.chat(p.id, `You need ${money(cost)} but have ${money(this.balance(p.id))}.`, 'error'); return; }
    let total = e.count * times;
    while (total > 0) { const n = Math.min(total, maxStack(e.id)); this.deliver(p, { id: e.id, count: n }); total -= n; }
    this.stats(p);
    this.h.chat(p.id, `Bought ${e.count * times} ${getItem(e.id)?.name ?? key} for ${money(cost)}.`);
  }

  private showAh(p: SimPlayer, page: number, tab: 'all' | 'mine', q: string): void {
    const now = Date.now();
    let rows = (tab === 'mine'
      ? this.sql.exec(`SELECT * FROM eco_ah WHERE seller = ? ORDER BY id DESC`, p.id)
      : this.sql.exec(`SELECT * FROM eco_ah WHERE expires > ? ORDER BY id DESC LIMIT 2000`, now)).toArray();
    const ql = q.toLowerCase();
    const items: AhListing[] = [];
    for (const r of rows) {
      let st: ItemStack;
      try { st = JSON.parse(r.item as string); } catch { continue; }
      if (!validStack(st)) continue;
      if (ql && !(getItem(st.id)?.name.toLowerCase().includes(ql) || String(r.seller_name).toLowerCase().includes(ql))) continue;
      items.push({ id: Number(r.id), seller: String(r.seller), sellerName: String(r.seller_name), item: st, price: Number(r.price), expires: Number(r.expires) });
    }
    rows = [];
    const pages = Math.max(1, Math.ceil(items.length / PAGE));
    const pg = Math.min(page, pages - 1);
    this.h.send(p.id, { t: 'eco', k: 'view', view: { v: 'ah', page: pg, pages, tab, q, items: items.slice(pg * PAGE, pg * PAGE + PAGE) } satisfies EcoView });
  }

  private ahList(p: SimPlayer, priceText: string): void {
    const price = parseMoney(priceText);
    const st = p.inv.slots[p.inv.selected];
    if (!price) { this.h.chat(p.id, 'Usage: /ah sell <price>, while holding the item. Example: /ah sell 2.5k', 'error'); return; }
    if (!st) { this.h.chat(p.id, 'Hold the item you want to sell.', 'error'); return; }
    const active = Number(this.sql.exec(`SELECT COUNT(*) AS n FROM eco_ah WHERE seller = ?`, p.id).toArray()[0]?.n ?? 0);
    if (active >= MAX_LISTINGS) { this.h.chat(p.id, `You can have at most ${MAX_LISTINGS} listings at once.`, 'error'); return; }
    const f = fee(price);
    if (!this.take(p, f)) { this.h.chat(p.id, `Listing costs a ${money(f)} fee, but you have ${money(this.balance(p.id))}.`, 'error'); return; }
    p.inv.slots[p.inv.selected] = null;
    this.sql.exec(`INSERT INTO eco_ah (seller, seller_name, item, price, expires) VALUES (?, ?, ?, ?, ?)`, p.id, p.name, JSON.stringify(st), price, Date.now() + LISTING_HOURS * HOUR);
    this.h.sim().emitInv(p);
    this.stats(p);
    this.h.chat(p.id, `Listed ${st.count} ${getItem(st.id)?.name ?? 'item'} for ${money(price)} (fee ${money(f)}). It expires in ${LISTING_HOURS} hours.`);
  }

  private ahBuy(p: SimPlayer, id: number): void {
    const r = this.sql.exec(`SELECT * FROM eco_ah WHERE id = ?`, id).toArray()[0];
    if (!r || Number(r.expires) < Date.now()) { this.h.chat(p.id, 'That listing is no longer available.', 'error'); this.showAh(p, 0, 'all', ''); return; }
    if (String(r.seller) === p.id) { this.h.chat(p.id, 'That is your own listing. Use Cancel to take it back.', 'error'); return; }
    const price = Number(r.price);
    if (!this.take(p, price)) { this.h.chat(p.id, `You need ${money(price)} but have ${money(this.balance(p.id))}.`, 'error'); return; }
    this.sql.exec(`DELETE FROM eco_ah WHERE id = ?`, id);
    const st = JSON.parse(r.item as string) as ItemStack;
    this.deliver(p, st);
    this.credit(String(r.seller), String(r.seller_name), price);
    this.stats(p);
    this.h.chat(p.id, `Bought ${st.count} ${getItem(st.id)?.name ?? 'item'} for ${money(price)}.`);
    this.h.chat(String(r.seller), `${p.name} bought your ${getItem(st.id)?.name ?? 'item'} for ${money(price)}.`, 'info');
    this.showAh(p, 0, 'all', '');
  }

  private ahCancel(p: SimPlayer, id: number): void {
    const r = this.sql.exec(`SELECT * FROM eco_ah WHERE id = ? AND seller = ?`, id, p.id).toArray()[0];
    if (!r) return;
    this.sql.exec(`DELETE FROM eco_ah WHERE id = ?`, id);
    this.deliver(p, JSON.parse(r.item as string) as ItemStack);
    this.showAh(p, 0, 'mine', '');
  }

  private showOrders(p: SimPlayer, page: number, tab: 'all' | 'mine'): void {
    const rows = (tab === 'mine'
      ? this.sql.exec(`SELECT * FROM eco_orders WHERE buyer = ? ORDER BY id DESC`, p.id)
      : this.sql.exec(`SELECT * FROM eco_orders WHERE expires > ? ORDER BY each_price DESC, id ASC LIMIT 2000`, Date.now())).toArray();
    const items: BuyOrder[] = rows.map((r) => ({ id: Number(r.id), buyer: String(r.buyer), buyerName: String(r.buyer_name), itemId: Number(r.item_id), wanted: Number(r.wanted), filled: Number(r.filled), each: Number(r.each_price), expires: Number(r.expires) }));
    const pages = Math.max(1, Math.ceil(items.length / PAGE));
    const pg = Math.min(page, pages - 1);
    this.h.send(p.id, { t: 'eco', k: 'view', view: { v: 'orders', page: pg, pages, tab, items: items.slice(pg * PAGE, pg * PAGE + PAGE) } satisfies EcoView });
  }

  private orderCreate(p: SimPlayer, key: string, amountText: string, eachText: string): void {
    const it = ITEM_LIST.find((i) => i.key === key.toLowerCase() || i.name.toLowerCase().replace(/\s+/g, '_') === key.toLowerCase());
    const amount = Math.floor(Number(amountText));
    const each = parseMoney(eachText);
    if (!it || !Number.isInteger(amount) || amount < 1 || amount > 64 * 36 || !each) { this.h.chat(p.id, 'Usage: /order <item> <amount> <price each>, for example /order iron_ingot 64 30', 'error'); return; }
    const active = Number(this.sql.exec(`SELECT COUNT(*) AS n FROM eco_orders WHERE buyer = ?`, p.id).toArray()[0]?.n ?? 0);
    if (active >= MAX_ORDERS) { this.h.chat(p.id, `You can have at most ${MAX_ORDERS} orders at once.`, 'error'); return; }
    const total = amount * each;
    const f = fee(total);
    if (total > MAX_PRICE) { this.h.chat(p.id, 'That order is too large.', 'error'); return; }
    if (!this.take(p, total + f)) { this.h.chat(p.id, `This order needs ${money(total)} plus a ${money(f)} fee, but you have ${money(this.balance(p.id))}.`, 'error'); return; }
    this.sql.exec(`INSERT INTO eco_orders (buyer, buyer_name, item_id, wanted, filled, each_price, expires) VALUES (?, ?, ?, ?, 0, ?, ?)`, p.id, p.name, it.id, amount, each, Date.now() + LISTING_HOURS * HOUR);
    this.stats(p);
    this.h.chat(p.id, `Order placed: ${amount} ${it.name} at ${money(each)} each. ${money(total)} is held until it fills or expires (fee ${money(f)}).`);
  }

  private orderFill(p: SimPlayer, id: number): void {
    const r = this.sql.exec(`SELECT * FROM eco_orders WHERE id = ?`, id).toArray()[0];
    if (!r || Number(r.expires) < Date.now()) { this.h.chat(p.id, 'That order is no longer open.', 'error'); return; }
    if (String(r.buyer) === p.id) { this.h.chat(p.id, 'That is your own order.', 'error'); return; }
    const itemId = Number(r.item_id);
    const need = Number(r.wanted) - Number(r.filled);
    const have = p.inv.slots.reduce((n, s) => n + (s && s.id === itemId && !s.dmg ? s.count : 0), 0);
    const n = Math.min(need, have);
    if (n <= 0) { this.h.chat(p.id, `You have no ${getItem(itemId)?.name ?? 'items'} to deliver.`, 'error'); return; }
    let left = n;
    for (let i = 0; i < p.inv.slots.length && left > 0; i++) {
      const s = p.inv.slots[i];
      if (!s || s.id !== itemId || s.dmg) continue;
      const k = Math.min(s.count, left);
      s.count -= k; left -= k;
      if (s.count <= 0) p.inv.slots[i] = null;
    }
    const pay = n * Number(r.each_price);
    const filled = Number(r.filled) + n;
    if (filled >= Number(r.wanted)) this.sql.exec(`DELETE FROM eco_orders WHERE id = ?`, id);
    else this.sql.exec(`UPDATE eco_orders SET filled = ? WHERE id = ?`, filled, id);
    let give = n;
    while (give > 0) { const k = Math.min(give, maxStack(itemId)); this.toBox(String(r.buyer), { id: itemId, count: k }); give -= k; }
    this.credit(p.id, p.name, pay);
    this.h.sim().emitInv(p);
    this.h.chat(p.id, `Delivered ${n} ${getItem(itemId)?.name ?? 'items'} for ${money(pay)}.`);
    this.h.chat(String(r.buyer), `${p.name} delivered ${n} ${getItem(itemId)?.name ?? 'items'} to your order. Collect them with /ah collect.`, 'info');
    this.showOrders(p, 0, 'all');
  }

  private orderCancel(p: SimPlayer, id: number): void {
    const r = this.sql.exec(`SELECT * FROM eco_orders WHERE id = ? AND buyer = ?`, id, p.id).toArray()[0];
    if (!r) return;
    this.sql.exec(`DELETE FROM eco_orders WHERE id = ?`, id);
    const refund = (Number(r.wanted) - Number(r.filled)) * Number(r.each_price);
    this.credit(p.id, p.name, refund);
    this.h.chat(p.id, `Order cancelled. ${money(refund)} refunded.`);
    this.showOrders(p, 0, 'mine');
  }

  private showBox(p: SimPlayer): void {
    this.h.send(p.id, { t: 'eco', k: 'view', view: { v: 'box', items: this.box(p.id) } satisfies EcoView });
  }

  private claim(p: SimPlayer, i: number): void {
    const b = this.box(p.id);
    const idx = i < 0 ? b.map((_, k) => k) : [i];
    const keep: ItemStack[] = [];
    b.forEach((st, k) => {
      if (!idx.includes(k)) { keep.push(st); return; }
      const left = giveItem(p.inv, st);
      if (left > 0) keep.push({ ...st, count: left });
    });
    this.saveBox(p.id, keep);
    this.h.sim().emitInv(p);
    if (keep.length && i < 0) this.h.chat(p.id, 'Your inventory is full. Some items are still in the box.', 'info');
    this.showBox(p);
  }

}

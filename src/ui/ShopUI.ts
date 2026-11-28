import { h, clear, toast, modal, confirmDialog, segmented } from './dom';
import { shopRequest, type ShopState } from '../storage/Settings';
import { COSMETICS, COS_BY_ID, CRATES, KEY_CAP, RARITY_COLOR, priceOf, type Cosmetic, type CosKind, type CapeLook, type TitleLook, type TrailLook, type CrateDef } from '../core/shop';
import { capePreview } from '../rendering/CapeArt';

const KIND_LABEL: Record<CosKind, string> = { title: 'Titles', trail: 'Trails', cape: 'Capes' };
const fmt = (n: number) => n.toLocaleString('en-US');

function preview(c: Cosmetic): HTMLElement {
  if (c.kind === 'title') { const l = c.look as TitleLook; return h('div', { class: 'cos-prev title', style: `color:${l.color}` }, `[${l.text}]`); }
  if (c.kind === 'trail') {
    const l = c.look as TrailLook;
    return h('div', { class: 'cos-prev trail' }, ...l.colors.slice(0, 6).map((col, i) => h('span', { style: `background:${col};transform:translateY(${Math.round(Math.sin(i * 1.3) * 6 - l.rise * 3)}px)` })));
  }
  const cv = capePreview(c.look as CapeLook, 4);
  cv.className = 'cos-prev cape';
  return cv;
}

function tile(c: Cosmetic, foot: Node | null, onClick?: () => void): HTMLElement {
  return h('div', { class: `cos-tile${onClick ? ' pick' : ''}`, style: `--rar:${RARITY_COLOR[c.rarity]}`, onclick: onClick ?? null, title: c.desc },
    preview(c),
    h('div', { class: 'cos-name' }, c.name),
    h('div', { class: 'cos-rar' }, `${c.rarity[0].toUpperCase()}${c.rarity.slice(1)} ${c.kind}`),
    foot);
}

export function buildShop(): HTMLElement {
  const root = h('div', { class: 'shop' }, h('div', { class: 'small muted' }, 'Loading the shop...'));
  let st: ShopState | null = null;
  let tab: CosKind = 'cape';
  let busy = false;

  const act = async (op: Parameters<typeof shopRequest>[0], extra: Record<string, unknown>, okMsg?: (d: ShopState) => string) => {
    if (busy) return;
    busy = true;
    const r = await shopRequest(op, extra);
    busy = false;
    if (!r.ok) { toast(r.error, 'error'); return; }
    if (op === 'checkout') { location.href = r.data.url!; return; }
    st = r.data;
    if (okMsg) toast(okMsg(r.data), 'info');
    draw();
  };

  const crateBox = (c: CrateDef) => {
    const offer = st!.offers[c.id] ?? [];
    const cost = `${fmt(c.shards)} shards${c.keys ? ` or ${c.keys} keys` : ''}`;
    const choose = (id: string) => {
      const it = COS_BY_ID.get(id)!;
      const buttons: { label: string; kind?: 'primary' | 'ghost' | 'danger'; onClick: () => void }[] = [{ label: 'Cancel', kind: 'ghost', onClick: () => {} }];
      if (c.keys) buttons.push({ label: `Use ${c.keys} keys`, kind: 'primary', onClick: () => void act('crate', { crate: c.id, item: id, pay: 'keys' }, () => `${it.name} is yours.`) });
      buttons.push({ label: `Pay ${fmt(c.shards)} shards`, kind: 'primary', onClick: () => void act('crate', { crate: c.id, item: id, pay: 'shards' }, () => `${it.name} is yours.`) });
      modal(`Take ${it.name}?`, h('div', { class: 'stack' }, tile(it, null), h('p', { class: 'small' }, `Open ${c.name} and keep ${it.name}. The other two choices go back, and a new set appears.`)), buttons);
    };
    return h('div', { class: 'crate-box' },
      h('div', { class: 'row', style: 'justify-content:space-between' }, h('b', {}, c.name), h('span', { class: 'small' }, cost)),
      h('div', { class: 'small muted' }, `${c.desc} You see exactly what is inside before you pay, and you choose.`),
      offer.length
        ? h('div', { class: 'cos-grid' }, ...offer.map((id) => tile(COS_BY_ID.get(id)!, h('div', { class: 'cos-foot' }, 'Choose'), () => choose(id))))
        : h('div', { class: 'small muted' }, 'You own everything this cache can hold.'));
  };

  const wardrobe = () => {
    const owned = new Set(st!.owned);
    const tabs = segmented((['cape', 'trail', 'title'] as CosKind[]).map((k) => [k, KIND_LABEL[k]] as [CosKind, string]), tab, (k) => { tab = k; draw(); });
    const items = COSMETICS.filter((c) => c.kind === tab);
    const grid = h('div', { class: 'cos-grid' }, ...items.map((c) => {
      const worn = st!.equipped[c.kind] === c.id;
      const foot = owned.has(c.id)
        ? h('button', { class: `btn small${worn ? '' : ' primary'}`, onclick: (e: Event) => { e.stopPropagation(); void act('equip', { kind: c.kind, item: worn ? '' : c.id }, () => (worn ? `${c.name} taken off.` : `${c.name} equipped. It shows the next time you join a world.`)); } }, worn ? 'Take off' : 'Equip')
        : h('button', { class: 'btn small', onclick: async (e: Event) => {
          e.stopPropagation();
          if (st!.shards < priceOf(c)) { toast(`You need ${fmt(priceOf(c) - st!.shards)} more shards.`, 'error'); return; }
          if (await confirmDialog(`Buy ${c.name}?`, `${c.name} costs ${fmt(priceOf(c))} shards. You have ${fmt(st!.shards)}.`, 'Buy')) void act('buy', { item: c.id }, () => `${c.name} is yours.`);
        } }, `${fmt(priceOf(c))} shards`);
      return tile(c, foot);
    }));
    return h('div', { class: 'stack' }, h('div', { class: 'section-title' }, 'Wardrobe'), tabs, grid);
  };

  const draw = () => {
    clear(root);
    if (!st) return;
    const s = st;
    root.append(
      h('div', { class: 'shop-wallet' },
        h('div', {}, h('span', { class: 'shard-ico' }), h('b', {}, fmt(s.shards)), ' Amethyst Shards'),
        h('div', {}, h('span', { class: 'key-ico' }), h('b', {}, String(s.keys)), ` / ${KEY_CAP} cache keys`),
        h('button', { class: `btn small${s.canClaim ? ' primary' : ''}`, disabled: s.canClaim ? null : 'true', onclick: () => void act('daily', {}, () => 'Daily key claimed.') }, s.canClaim ? 'Claim daily key' : 'Next key tomorrow')),
      h('div', { class: 'section-title' }, 'Get shards'),
      h('div', { class: 'pack-row' }, ...(s.packs ?? []).map((p) => h('button', { class: 'pack', onclick: () => void act('checkout', { pack: p.i }) }, h('span', { class: 'shard-ico big' }), h('b', {}, `${fmt(p.shards)} shards`), h('span', { class: 'small' }, p.label)))),
      h('div', { class: 'small muted' }, 'Shards only buy cosmetics: titles, trails and capes. They never give an advantage in a game. Payments go through Stripe, and shards arrive as soon as the payment is confirmed.'),
      h('div', { class: 'section-title' }, 'Caches'),
      ...CRATES.map(crateBox),
      wardrobe(),
    );
  };

  void (async () => {
    const r = await shopRequest('state');
    if (!r.ok) { clear(root); root.appendChild(h('div', { class: 'form-error' }, r.error)); return; }
    st = r.data;
    draw();
  })();
  return root;
}

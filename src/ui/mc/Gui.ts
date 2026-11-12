import { h } from '../dom';
import type { TextureAtlas } from '../../resources/TextureAtlas';
import { guiFallback } from './GuiPaint';
import { getSettings } from '../../storage/Settings';
import { getItem, maxDurability, fuelSeconds, type ItemDef } from '../../core/items';
import { findSmelt, RecipeBook, BASE_BOOK } from '../../core/crafting';

let tipBook: RecipeBook = BASE_BOOK;
export function setTooltipBook(b: RecipeBook): void { tipBook = b; }
import type { ItemStack } from '../../core/inventory';

const urls = new Map<string, string>();
let urlAtlas: TextureAtlas | null = null;

export function guiURL(atlas: TextureAtlas, key: string): string {
  if (urlAtlas !== atlas) { urls.clear(); urlAtlas = atlas; }
  const hit = urls.get(key);
  if (hit) return hit;
  const u = atlas.guiURL(key) ?? guiFallback(key)?.toDataURL('image/png') ?? '';
  urls.set(key, u);
  return u;
}

export function hasPackGui(atlas: TextureAtlas): boolean { return !!atlas.guiCanvas('gt:container/inventory'); }

export function guiScale(w: number, h: number): number {
  const pref = getSettings().guiScale ?? 0;
  const vw = window.innerWidth - 12, vh = window.innerHeight - 12;
  const fit = Math.max(1, Math.min(Math.floor(vw / w), Math.floor(vh / h)));
  const s = pref > 0 ? Math.min(pref, fit) : Math.min(fit, 6);
  return Math.max(1, s);
}

export function crop(atlas: TextureAtlas, key: string, texW: number, texH: number, sx: number, sy: number, sw: number, sh: number, s: number, dx = 0, dy = 0, cls = 'mc-bg'): HTMLElement {
  return h('div', { class: cls, style: `left:${dx * s}px;top:${dy * s}px;width:${sw * s}px;height:${sh * s}px;background-image:url(${guiURL(atlas, key)});background-size:${texW * s}px ${texH * s}px;background-position:${-sx * s}px ${-sy * s}px` });
}

export function sprite(atlas: TextureAtlas, key: string, w: number, h2: number, s: number, x: number, y: number, cls = 'mc-sprite'): HTMLElement {
  return h('div', { class: cls, style: `left:${x * s}px;top:${y * s}px;width:${w * s}px;height:${h2 * s}px;background-image:url(${guiURL(atlas, key)});background-size:100% 100%` });
}

export function nineSlice(atlas: TextureAtlas, key: string, border: number, s: number): string {
  return `border-style:solid;border-width:${border * s}px;border-image:url(${guiURL(atlas, key)}) ${border} fill / ${border * s}px stretch`;
}

export function label(text: string, x: number, y: number, s: number, opts: { color?: string; shadow?: boolean; center?: boolean; right?: boolean } = {}): HTMLElement {
  const col = opts.color ?? '#404040';
  const style = [`top:${y * s}px`, `font-size:${8 * s}px`, `line-height:${9 * s}px`, `color:${col}`];
  if (opts.center) style.push(`left:${x * s}px`, 'transform:translateX(-50%)');
  else if (opts.right) style.push(`right:${x * s}px`);
  else style.push(`left:${x * s}px`);
  if (opts.shadow) style.push(`text-shadow:${s}px ${s}px 0 ${shadowOf(col)}`);
  return h('div', { class: 'mc-label', style: style.join(';') }, text);
}

export function shadowOf(col: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(col);
  if (!m) return '#3f3f3f';
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgb(${r >> 2},${g >> 2},${b >> 2})`;
}

export function itemTooltipLines(st: ItemStack, advanced = false): { text: string; color: string }[] {
  const it = getItem(st.id) as ItemDef | undefined;
  if (!it) return [];
  const out: { text: string; color: string }[] = [{ text: it.name, color: '#ffffff' }];
  if (it.desc) out.push({ text: it.desc, color: '#aaaaaa' });
  if (it.food) out.push({ text: `Hunger +${it.food.hunger / 2}  Saturation +${Math.round(it.food.saturation * 10) / 10}`, color: '#ffaa00' });
  if (it.tool) {
    out.push({ text: '', color: '#aaaaaa' }, { text: 'When in Main Hand:', color: '#aaaaaa' });
    out.push({ text: ` ${it.tool.damage} Attack Damage`, color: '#00aa00' });
    if (it.tool.speed) out.push({ text: ` ${it.tool.speed} Mining Speed`, color: '#00aa00' });
  }
  if (it.armor) {
    out.push({ text: '', color: '#aaaaaa' }, { text: 'When on Body:', color: '#aaaaaa' });
    out.push({ text: `+${it.armor.points} Armor`, color: '#5555ff' });
  }
  const max = maxDurability(st.id);
  if (max && (st.dmg || advanced)) out.push({ text: `Durability: ${max - (st.dmg ?? 0)} / ${max}`, color: '#ffffff' });
  if (fuelSeconds(st.id)) out.push({ text: `Burns for ${fuelSeconds(st.id)}s`, color: '#aaaaaa' });
  const sm = findSmelt(st.id, tipBook);
  if (sm) out.push({ text: `Smelts into ${getItem(sm.result)?.name ?? '?'}`, color: '#aaaaaa' });
  if (advanced) out.push({ text: `strata:${it.key}`, color: '#555555' });
  return out;
}

class TooltipEl {
  private el: HTMLElement;
  private atlas: TextureAtlas | null = null;
  private key = '';
  private hideT = 0;

  constructor() {
    this.el = h('div', { class: 'mc-tooltip', style: 'display:none' });
    document.body.appendChild(this.el);
  }

  show(atlas: TextureAtlas, lines: { text: string; color: string }[], x: number, y: number, ms = 0): void {
    if (!lines.length) { this.hide(); return; }
    const s = Math.max(1, Math.min(4, Number(getComputedStyle(document.documentElement).getPropertyValue('--gs')) || 2));
    const key = `${lines.map((l) => l.text).join('|')}:${s}`;
    if (key !== this.key || atlas !== this.atlas) {
      this.key = key;
      this.atlas = atlas;
      const pack = !!atlas.guiCanvas('gs:tooltip/background') && !!atlas.guiCanvas('gs:tooltip/frame');
      this.el.className = `mc-tooltip${pack ? ' pack' : ''}`;
      this.el.style.setProperty('--ts', String(s));
      if (pack) {
        this.el.style.setProperty('--tt-bg', `url(${guiURL(atlas, 'gs:tooltip/background')})`);
        this.el.style.setProperty('--tt-frame', `url(${guiURL(atlas, 'gs:tooltip/frame')})`);
      }
      this.el.replaceChildren(...lines.map((l, i) => h('div', { class: `tt-line${i === 0 ? ' first' : ''}`, style: `color:${l.color};text-shadow:${s}px ${s}px 0 ${shadowOf(l.color)}` }, l.text || ' ')));
    }
    this.el.style.display = 'block';
    const r = this.el.getBoundingClientRect();
    let left = x + 12 * s, top = y - 12 * s;
    if (left + r.width > window.innerWidth - 4) left = Math.max(4, x - 16 - r.width);
    if (top + r.height > window.innerHeight - 4) top = window.innerHeight - 4 - r.height;
    if (top < 4) top = 4;
    this.el.style.left = `${left}px`;
    this.el.style.top = `${top}px`;
    clearTimeout(this.hideT);
    if (ms > 0) this.hideT = window.setTimeout(() => this.hide(), ms);
  }

  hide(): void { this.el.style.display = 'none'; this.key = ''; clearTimeout(this.hideT); }
}

let tip: TooltipEl | null = null;
export function tooltip(): TooltipEl { return (tip ??= new TooltipEl()); }

export function applyGuiVars(): void {
  const s = guiScale(176, 166);
  document.documentElement.style.setProperty('--gs', String(Math.min(4, s)));
}

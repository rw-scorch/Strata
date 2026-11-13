import { h } from '../dom';
import type { TextureAtlas } from '../../resources/TextureAtlas';
import { guiURL, tooltip } from './Gui';
import { isTouchDevice } from '../../storage/Settings';
import { audio } from '../../audio/AudioEngine';

let themeAtlas: TextureAtlas | null = null;

export function applyMcTheme(atlas: TextureAtlas): void {
  themeAtlas = atlas;
  const r = document.documentElement.style;
  const set = (v: string, k: string) => r.setProperty(v, `url(${guiURL(atlas, k)})`);
  set('--mcb', 'gs:widget/button'); set('--mcb-hi', 'gs:widget/button_highlighted'); set('--mcb-dis', 'gs:widget/button_disabled');
  set('--mcs', 'gs:widget/slider'); set('--mcs-hi', 'gs:widget/slider_highlighted');
  set('--mcs-h', 'gs:widget/slider_handle'); set('--mcs-hh', 'gs:widget/slider_handle_highlighted');
  set('--mctf', 'gs:widget/text_field'); set('--mctf-hi', 'gs:widget/text_field_highlighted');
  set('--mc-x', 'gs:widget/cross_button'); set('--mc-x-hi', 'gs:widget/cross_button_highlighted');
  set('--mc-menu-bg', 'gt:menu_background'); set('--mc-hdr', 'gt:header_separator'); set('--mc-ftr', 'gt:footer_separator');
  menuScale();
}

export function menuScale(): number {
  const auto = Math.max(1, Math.min(Math.floor(window.innerWidth / 320), Math.floor(window.innerHeight / 240)));
  let s = Math.min(4, auto);
  if (isTouchDevice()) s = Math.max(2, s);
  while (s > 1 && 310 * s + 20 > window.innerWidth) s--;
  document.documentElement.style.setProperty('--ms', `${s}px`);
  return s;
}

if (typeof window !== 'undefined') window.addEventListener('resize', () => menuScale());

function withTip(el: HTMLElement, tip?: string): HTMLElement {
  if (!tip) return el;
  el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse' && themeAtlas) tooltip().show(themeAtlas, wrap(tip), e.clientX, e.clientY); });
  el.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' && themeAtlas) tooltip().show(themeAtlas, wrap(tip), e.clientX, e.clientY); });
  el.addEventListener('pointerleave', () => tooltip().hide());
  let lp = 0;
  el.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') lp = window.setTimeout(() => { if (themeAtlas) tooltip().show(themeAtlas, wrap(tip), e.clientX, e.clientY - 60, 2500); }, 500); });
  el.addEventListener('pointerup', () => clearTimeout(lp));
  el.addEventListener('pointercancel', () => clearTimeout(lp));
  return el;
}

function wrap(t: string): { text: string; color: string }[] {
  const out: { text: string; color: string }[] = [];
  let line = '';
  for (const w of t.split(' ')) {
    if ((line + ' ' + w).trim().length > 38) { out.push({ text: line.trim(), color: '#ffffff' }); line = w; } else line += ' ' + w;
  }
  if (line.trim()) out.push({ text: line.trim(), color: '#ffffff' });
  return out;
}

export function mcButton(text: string | Node, onClick: () => void, w = 150, opts: { tip?: string; disabled?: boolean; cls?: string } = {}): HTMLButtonElement {
  const b = h('button', { class: `mcb${opts.cls ? ' ' + opts.cls : ''}`, style: `width:calc(var(--ms) * ${w})`, disabled: !!opts.disabled, type: 'button' }, text) as HTMLButtonElement;
  b.addEventListener('click', () => { audio.play('ui.click'); onClick(); });
  withTip(b, opts.tip);
  return b;
}

export function mcCycle<T extends string | number | boolean>(label: string, options: [T, string][], value: T, onChange: (v: T) => void, opts: { tip?: string; w?: number } = {}): HTMLButtonElement {
  let i = Math.max(0, options.findIndex(([v]) => v === value));
  const b = h('button', { class: 'mcb', type: 'button', style: `width:calc(var(--ms) * ${opts.w ?? 150})` }) as HTMLButtonElement;
  const draw = () => { b.textContent = `${label}: ${options[i][1]}`; };
  draw();
  const step = (d: number) => { i = (i + d + options.length) % options.length; draw(); audio.play('ui.click'); onChange(options[i][0]); };
  b.addEventListener('click', (e) => step((e as MouseEvent).shiftKey ? -1 : 1));
  b.addEventListener('contextmenu', (e) => { e.preventDefault(); step(-1); });
  withTip(b, opts.tip);
  return b;
}

export function mcToggle(label: string, value: boolean, onChange: (v: boolean) => void, tip?: string): HTMLButtonElement {
  return mcCycle(label, [[true, 'ON'], [false, 'OFF']], value, onChange, { tip });
}

export function mcSlider(label: string, min: number, max: number, step: number, value: number, fmt: (v: number) => string, onChange: (v: number) => void, opts: { tip?: string; w?: number } = {}): HTMLElement {
  const w = opts.w ?? 150;
  let v = value;
  const text = h('span', { class: 'mcs-text' });
  const handle = h('div', { class: 'mcs-handle' });
  const el = h('div', { class: 'mcs', style: `width:calc(var(--ms) * ${w})`, tabindex: '0', role: 'slider' }, handle, text);
  const draw = () => {
    text.textContent = `${label}: ${fmt(v)}`;
    const t = (v - min) / (max - min || 1);
    handle.style.left = `calc((100% - var(--ms) * 8) * ${t})`;
    el.setAttribute('aria-valuenow', String(v));
  };
  draw();
  const setFrom = (cx: number) => {
    const r = el.getBoundingClientRect();
    const hw = r.height * 0.4;
    const t = Math.max(0, Math.min(1, (cx - r.left - hw / 2) / (r.width - hw)));
    const nv = Math.round((min + t * (max - min)) / step) * step;
    const fixed = Number(nv.toFixed(4));
    if (fixed !== v) { v = fixed; draw(); onChange(v); }
  };
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    el.classList.add('drag');
    setFrom(e.clientX);
    const mv = (ev: PointerEvent) => setFrom(ev.clientX);
    const up = () => { el.classList.remove('drag'); el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); audio.play('ui.click'); };
    el.addEventListener('pointermove', mv);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { v = Math.max(min, Math.min(max, Number((v + (e.key === 'ArrowLeft' ? -step : step)).toFixed(4)))); draw(); onChange(v); e.preventDefault(); }
  });
  withTip(el, opts.tip);
  return el;
}

export function mcInput(value: string, placeholder: string, onInput: (v: string) => void, w = 200, max = 64): HTMLInputElement {
  const i = h('input', { class: 'mctf', value, placeholder, maxlength: max, spellcheck: 'false', style: `width:calc(var(--ms) * ${w})` }) as HTMLInputElement;
  i.addEventListener('input', () => onInput(i.value));
  i.addEventListener('keydown', (e) => e.stopPropagation());
  return i;
}

export function mcText(text: string, opts: { color?: string; center?: boolean; small?: boolean } = {}): HTMLElement {
  return h('div', { class: `mct${opts.center ? ' center' : ''}${opts.small ? ' small' : ''}`, style: opts.color ? `color:${opts.color}` : '' }, text);
}

export interface McScreenOpts { title: string; onDone: () => void; doneLabel?: string; footer?: HTMLElement[]; inGame?: boolean; }

export function mcScreen(o: McScreenOpts, ...rows: (HTMLElement | null)[]): { el: HTMLElement; body: HTMLElement; close: () => void } {
  menuScale();
  const body = h('div', { class: 'mc-list-inner' });
  for (const r of rows) if (r) body.appendChild(r);
  const close = () => { el.remove(); tooltip().hide(); };
  const done = mcButton(o.doneLabel ?? 'Done', () => { close(); o.onDone(); }, 200);
  const el = h('div', { class: `screen mc-menu${o.inGame ? ' in-game' : ''}`, style: 'z-index:35' },
    h('div', { class: 'mc-head' }, h('div', { class: 'mct center title' }, o.title)),
    h('div', { class: 'mc-list' }, body),
    h('div', { class: 'mc-foot' }, ...(o.footer ?? []), done),
  );
  el.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); o.onDone(); } });
  return { el, body, close };
}

export function mcRow(...items: (HTMLElement | null)[]): HTMLElement {
  return h('div', { class: 'mc-row2' }, ...items.filter(Boolean) as HTMLElement[]);
}

export function mcHeading(text: string): HTMLElement {
  return h('div', { class: 'mc-heading mct center' }, text);
}

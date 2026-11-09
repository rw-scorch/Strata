type Attrs = Record<string, string | number | boolean | ((e: Event) => void) | undefined | null>;
type Child = Node | string | null | undefined | false | Child[];

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (k === 'style') el.setAttribute('style', String(v));
    else if (k === 'html') el.innerHTML = String(v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  append(el, children);
  return el;
}

function append(el: Node, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
}

export function clear(el: Element): void { while (el.firstChild) el.removeChild(el.firstChild); }

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

let toastRoot: HTMLElement | null = null;
export function toast(text: string, kind: 'info' | 'error' | 'success' = 'info', ms = 3200): void {
  toastRoot ??= document.getElementById('toasts');
  if (!toastRoot) return;
  const t = h('div', { class: `toast toast-${kind}` }, text);
  toastRoot.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, ms);
}

export function modal(title: string, body: Node | string, actions: { label: string; kind?: 'primary' | 'danger' | 'ghost'; onClick?: () => void | boolean | Promise<void | boolean> }[], opts: { wide?: boolean; onClose?: () => void } = {}): { close: () => void; el: HTMLElement } {
  const root = document.getElementById('modals')!;
  const backdrop = h('div', { class: 'modal-backdrop' });
  const close = () => { backdrop.remove(); opts.onClose?.(); };
  const box = h('div', { class: `modal panel${opts.wide ? ' wide' : ''}`, role: 'dialog', 'aria-modal': 'true' },
    h('div', { class: 'modal-head' }, h('h2', {}, title), h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: close, html: '&times;' })),
    h('div', { class: 'modal-body' }, typeof body === 'string' ? h('p', {}, body) : body),
    actions.length ? h('div', { class: 'modal-actions' }, actions.map((a) => h('button', {
      class: `btn ${a.kind ?? ''}`,
      onclick: async () => { const r = await a.onClick?.(); if (r !== false) close(); },
    }, a.label))) : null,
  );
  backdrop.appendChild(box);
  backdrop.addEventListener('pointerdown', (e) => { if (e.target === backdrop) close(); });
  root.appendChild(backdrop);
  return { close, el: box };
}

export function confirmDialog(title: string, text: string, okLabel = 'Confirm', danger = false): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    modal(title, text, [
      { label: 'Cancel', kind: 'ghost', onClick: () => { done = true; resolve(false); } },
      { label: okLabel, kind: danger ? 'danger' : 'primary', onClick: () => { done = true; resolve(true); } },
    ], { onClose: () => { if (!done) resolve(false); } });
  });
}

export function promptDialog(title: string, label: string, value = '', maxLength = 32): Promise<string | null> {
  return new Promise((resolve) => {
    const input = h('input', { class: 'input', value, maxlength: maxLength, 'aria-label': label });
    let done = false;
    const m = modal(title, h('label', { class: 'field' }, h('span', {}, label), input), [
      { label: 'Cancel', kind: 'ghost', onClick: () => { done = true; resolve(null); } },
      { label: 'Save', kind: 'primary', onClick: () => { done = true; resolve(input.value.trim()); } },
    ], { onClose: () => { if (!done) resolve(null); } });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { done = true; resolve(input.value.trim()); m.close(); } });
    setTimeout(() => input.focus(), 50);
  });
}

export function toggle(label: string, value: boolean, onChange: (v: boolean) => void, hint?: string): HTMLElement {
  const input = h('input', { type: 'checkbox', checked: value, onchange: (e: Event) => onChange((e.target as HTMLInputElement).checked) });
  return h('label', { class: 'toggle' }, input, h('span', { class: 'switch' }), h('span', { class: 'toggle-text' }, label, hint ? h('small', {}, hint) : null));
}

export function slider(label: string, min: number, max: number, step: number, value: number, fmt: (v: number) => string, onChange: (v: number) => void): HTMLElement {
  const out = h('span', { class: 'slider-val' }, fmt(value));
  const input = h('input', { type: 'range', min, max, step, value, oninput: (e: Event) => { const v = Number((e.target as HTMLInputElement).value); out.textContent = fmt(v); onChange(v); } });
  return h('label', { class: 'slider' }, h('span', { class: 'slider-label' }, label, out), input);
}

export function select<T extends string>(label: string, options: [T, string][], value: T, onChange: (v: T) => void): HTMLElement {
  return h('label', { class: 'field' }, h('span', {}, label), h('select', { class: 'input', onchange: (e: Event) => onChange((e.target as HTMLSelectElement).value as T) },
    options.map(([v, t]) => h('option', { value: v, selected: v === value }, t))));
}

export function segmented<T extends string>(options: [T, string][], value: T, onChange: (v: T) => void): HTMLElement {
  const wrap = h('div', { class: 'segmented', role: 'radiogroup' });
  for (const [v, t] of options) {
    const b = h('button', { class: v === value ? 'on' : '', type: 'button', role: 'radio', 'aria-checked': v === value ? 'true' : 'false', onclick: () => { for (const c of wrap.children) c.classList.remove('on'); b.classList.add('on'); onChange(v); } }, t);
    wrap.appendChild(b);
  }
  return wrap;
}

export function fmtTime(ms: number): string {
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

export function fmtDate(t: number): string {
  const d = new Date(t);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return `Today ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
}

export function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    const ta = h('textarea', { style: 'position:fixed;opacity:0' }) as HTMLTextAreaElement;
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

import { h } from './dom';

const CLIENT = ((import.meta.env.VITE_ADSENSE_CLIENT as string | undefined) ?? '').trim();
const SLOT = ((import.meta.env.VITE_ADSENSE_SLOT as string | undefined) ?? '').trim();
const VALID = /^ca-pub-\d{10,20}$/.test(CLIENT) && /^\d{6,14}$/.test(SLOT);
let loaded = false;

export function adsEnabled(): boolean { return VALID; }

function load(): void {
  if (loaded) return;
  loaded = true;
  const s = document.createElement('script');
  s.async = true;
  s.crossOrigin = 'anonymous';
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(CLIENT)}`;
  document.head.appendChild(s);
}

export function adBanner(place: string): HTMLElement | null {
  if (!VALID) return null;
  load();
  const ins = h('ins', { class: 'adsbygoogle', style: 'display:block;width:100%;height:100%', 'data-ad-client': CLIENT, 'data-ad-slot': SLOT, 'data-ad-format': 'horizontal', 'data-full-width-responsive': 'false' });
  const box = h('div', { class: 'ad-banner', 'data-place': place, 'aria-label': 'Advertisement' }, h('span', { class: 'ad-tag' }, 'Ad'), ins);
  requestAnimationFrame(() => {
    if (!box.isConnected) return;
    try { ((window as unknown as { adsbygoogle?: unknown[] }).adsbygoogle ??= []).push({}); } catch { box.remove(); }
  });
  return box;
}

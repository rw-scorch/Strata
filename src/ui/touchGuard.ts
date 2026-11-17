const editable = (t: EventTarget | null): boolean => {
  const el = t as HTMLElement | null;
  if (!el || !el.closest) return false;
  return !!el.closest('input, textarea, select, [contenteditable="true"], .chat.open .line, .allow-select');
};

let installed = false;

export function installTouchGuard(): void {
  if (installed) return;
  installed = true;
  const opt = { passive: false, capture: true } as AddEventListenerOptions;
  const block = (e: Event) => { if (e.cancelable) e.preventDefault(); };
  for (const t of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(t, block, opt);
  document.addEventListener('touchmove', (e) => {
    const sc = (e as TouchEvent & { scale?: number }).scale;
    if (e.touches.length > 1 || (sc !== undefined && sc !== 1)) block(e);
  }, opt);
  let lastEnd = 0, lx = 0, ly = 0;
  document.addEventListener('touchend', (e) => {
    const now = performance.now();
    const t = e.changedTouches[0];
    const near = t ? Math.hypot(t.clientX - lx, t.clientY - ly) < 60 : true;
    if (now - lastEnd < 350 && near && !editable(e.target)) block(e);
    lastEnd = now;
    if (t) { lx = t.clientX; ly = t.clientY; }
  }, opt);
  document.addEventListener('dblclick', (e) => { if (!editable(e.target)) block(e); }, opt);
  document.addEventListener('contextmenu', (e) => { if (!editable(e.target)) block(e); }, opt);
  document.addEventListener('selectstart', (e) => { if (!editable(e.target)) block(e); }, opt);
  document.addEventListener('dragstart', (e) => { if (!editable(e.target)) block(e); }, opt);
  window.addEventListener('wheel', (e) => { if (e.ctrlKey) block(e); }, opt);
}

export function guardHistory(active: () => boolean, onBack: () => void): () => void {
  const push = () => { try { history.pushState({ strata: Date.now() }, '', location.href); } catch { /* blocked */ } };
  push();
  const pop = () => { if (!active()) return; push(); onBack(); };
  window.addEventListener('popstate', pop);
  return () => window.removeEventListener('popstate', pop);
}

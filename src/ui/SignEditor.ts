import { h } from './dom';
import { mcButton } from './mc/Widgets';
import { SIGN_CHARS, SIGN_LINES, darkRGB, textRGB, type SignSide } from '../core/signs';

const WOOD_CSS = ['#a8834d', '#d2bf88', '#6e5134', '#a87656', '#b05d37', '#4a3220', '#e3b3ad', '#773631'];
const LOG_CSS = ['#b08d57', '#c8b77a', '#8a6a43', '#ab8659', '#af5c3a', '#6b4c31', '#d8a8a0', '#7a3a33'];

export interface SignEditorOpts { side: SignSide; wood: number; hanging: boolean; board?: HTMLCanvasElement | null; onDone: (lines: string[]) => void; }

export function openSignEditor(o: SignEditorOpts): { close: () => void } {
  const hex = (n: number) => `#${(n & 0xffffff).toString(16).padStart(6, '0')}`;
  const color = hex(o.side.g ? textRGB(o.side.c) : darkRGB(o.side.c, false));
  const glow = o.side.g ? `0 0 3px ${hex(darkRGB(o.side.c, true))}` : 'none';
  const base = (o.hanging ? LOG_CSS : WOOD_CSS)[o.wood] ?? WOOD_CSS[0];
  const w = o.hanging ? 'min(64vw, 380px)' : 'min(84vw, 560px)';
  const ht = o.hanging ? 'min(38vw, 230px)' : 'min(42vw, 280px)';
  const limit = o.hanging ? Math.min(SIGN_CHARS, 16) : SIGN_CHARS;
  const board = h('div', { class: 'sign-board', style: `width:${w};height:${ht};background:${base};` });
  if (o.board) {
    const img = o.board.toDataURL();
    board.style.backgroundImage = `url(${img})`;
    board.style.backgroundSize = '100% 100%';
    board.style.imageRendering = 'pixelated';
  }
  const inputs: HTMLInputElement[] = [];
  for (let i = 0; i < SIGN_LINES; i++) {
    const inp = h('input', { class: 'sign-line', maxlength: String(limit), autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', style: `color:${color};text-shadow:${glow};` }) as HTMLInputElement;
    inp.value = o.side.t[i] ?? '';
    inp.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); if (i < SIGN_LINES - 1) inputs[i + 1].focus(); else done(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (i > 0) inputs[i - 1].focus(); }
      else if (e.key === 'Escape') { e.preventDefault(); done(); }
    });
    inp.addEventListener('keyup', (e) => e.stopPropagation());
    inputs.push(inp);
    board.appendChild(inp);
  }
  let closed = false;
  const root = h('div', { class: 'sign-editor' },
    h('div', { class: 'sign-title' }, 'Edit Sign Message'),
    board,
    mcButton('Done', () => done(), 200),
  );
  const done = () => {
    if (closed) return;
    closed = true;
    root.remove();
    o.onDone(inputs.map((i) => i.value.slice(0, limit)));
  };
  document.body.appendChild(root);
  inputs[0]?.focus();
  setTimeout(() => { if (!closed && !inputs.includes(document.activeElement as HTMLInputElement)) inputs[0]?.focus(); }, 30);
  return { close: done };
}

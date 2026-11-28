import type { CapeLook } from '../core/shop';

const cache = new Map<string, HTMLCanvasElement>();

function face(g: CanvasRenderingContext2D, ox: number, oy: number, l: CapeLook): void {
  const W = 10, H = 16;
  const px = (x: number, y: number, c: string) => { if (x >= 0 && x < W && y >= 0 && y < H) { g.fillStyle = c; g.fillRect(ox + x, oy + y, 1, 1); } };
  g.fillStyle = l.base; g.fillRect(ox, oy, W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (((x * 7 + y * 13) % 11) === 0) px(x, y, 'rgba(0,0,0,0.12)');
  switch (l.pattern) {
    case 'border':
      for (let y = 0; y < H; y++) { px(1, y, l.accent); px(8, y, l.accent); }
      for (let x = 1; x < 9; x++) { px(x, 1, l.accent); px(x, 14, l.accent); }
      break;
    case 'stripe':
      for (let y = 0; y < H; y++) { px(4, y, l.accent); px(5, y, l.accent); }
      break;
    case 'waves':
      for (const row of [3, 8, 13]) for (let x = 0; x < W; x++) { const yy = row + (x % 4 < 2 ? 0 : 1); px(x, yy, l.accent); if (x % 4 === 1) px(x, yy - 1, l.accent); }
      break;
    case 'chevron':
      for (const top of [2, 7, 12]) for (let x = 0; x < W; x++) { const d = Math.abs(x - 4.5) | 0; px(x, top + 4 - d, l.accent); px(x, top + 5 - d, l.accent); }
      break;
    case 'diamond':
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const d = Math.abs(x - 4.5) + Math.abs(((y + 2) % 8) - 3.5); if (d < 2.6) px(x, y, l.accent); else if (d < 3.2) px(x, y, l.trim); }
      break;
    case 'stars':
      for (const [x, y] of [[2, 2], [7, 3], [4, 6], [8, 8], [1, 9], [5, 11], [7, 14], [2, 13]]) { px(x, y, l.accent); if ((x + y) % 3 === 0) { px(x - 1, y, l.trim); px(x + 1, y, l.trim); } }
      break;
    case 'sunburst':
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const dx = x - 4.5, dy = y - 6.5, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
        if (r < 2.2) px(x, y, l.accent);
        else if (Math.cos(a * 6) > 0.55 && r < 7) px(x, y, l.accent);
        else if (r < 2.9) px(x, y, l.trim);
      }
      break;
    case 'rift':
      for (let y = 0; y < H; y++) { const x0 = Math.round(4.5 + Math.sin(y * 0.9) * 2.5); px(x0, y, l.accent); px(x0 + 1, y, l.trim); if (y % 3 === 0) px(x0 - 1, y, l.trim); }
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((x * 5 + y * 3) % 17 === 0) px(x, y, l.trim);
      break;
  }
  for (let y = 0; y < H; y++) { px(0, y, l.trim); px(W - 1, y, l.trim); }
  for (let x = 0; x < W; x++) px(x, H - 1, l.trim);
}

export function capeCanvas(l: CapeLook): HTMLCanvasElement {
  const key = JSON.stringify(l);
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = 64; c.height = 32;
  const g = c.getContext('2d')!;
  g.fillStyle = l.trim; g.fillRect(0, 0, 23, 18);
  face(g, 1, 1, l);
  face(g, 12, 1, l);
  cache.set(key, c);
  return c;
}

export function capePreview(l: CapeLook, scale = 6): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 10 * scale; c.height = 16 * scale;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  g.drawImage(capeCanvas(l), 1, 1, 10, 16, 0, 0, c.width, c.height);
  return c;
}

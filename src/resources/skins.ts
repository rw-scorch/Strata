import type { Appearance } from '../core/sim/WorldSim';
import { SKIN, HAIR, CLOTH } from '../rendering/EntityRenderer';

export interface CustomSkin { png: string; slim: boolean }

const KEY = 'strata.skin.v1';
export const SKIN_MAX_CHARS = 12000;

export function loadCustomSkin(): CustomSkin | null {
  try {
    const j = JSON.parse(localStorage.getItem(KEY) ?? 'null') as CustomSkin | null;
    return j && validSkinData(j.png) ? { png: j.png, slim: !!j.slim } : null;
  } catch { return null; }
}

export function saveCustomSkin(s: CustomSkin | null): void {
  try { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY); } catch { /* full */ }
  window.dispatchEvent(new CustomEvent('strata-skin'));
}

export function validSkinData(png: unknown): png is string {
  return typeof png === 'string' && png.startsWith('data:image/png;base64,') && png.length <= SKIN_MAX_CHARS && /^[A-Za-z0-9+/=]+$/.test(png.slice(22));
}

export function canvas64(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  return c;
}

function flipRegion(src: CanvasRenderingContext2D, dst: CanvasRenderingContext2D, sx: number, sy: number, w: number, h: number, dx: number, dy: number): void {
  const img = src.getImageData(sx, sy, w, h);
  const out = dst.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const a = (y * w + x) * 4, b = (y * w + (w - 1 - x)) * 4;
    out.data[b] = img.data[a]; out.data[b + 1] = img.data[a + 1]; out.data[b + 2] = img.data[a + 2]; out.data[b + 3] = img.data[a + 3];
  }
  dst.putImageData(out, dx, dy);
}

function mirrorLimb(g: CanvasRenderingContext2D, u: number, v: number, nu: number, nv: number): void {
  flipRegion(g, g, u + 4, v, 4, 4, nu + 4, nv);
  flipRegion(g, g, u + 8, v, 4, 4, nu + 8, nv);
  flipRegion(g, g, u + 8, v + 4, 4, 12, nu, nv + 4);
  flipRegion(g, g, u + 4, v + 4, 4, 12, nu + 4, nv + 4);
  flipRegion(g, g, u, v + 4, 4, 12, nu + 8, nv + 4);
  flipRegion(g, g, u + 12, v + 4, 4, 12, nu + 12, nv + 4);
}

export function convertLegacy(src: HTMLCanvasElement | HTMLImageElement): HTMLCanvasElement {
  const c = canvas64();
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(src, 0, 0, 64, 32, 0, 0, 64, 32);
  mirrorLimb(g, 0, 16, 16, 48);
  mirrorLimb(g, 40, 16, 32, 48);
  return c;
}

export function detectSlim(c: HTMLCanvasElement): boolean {
  const g = c.getContext('2d', { willReadFrequently: true })!;
  const d = g.getImageData(54, 20, 2, 12).data;
  for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) return false;
  return true;
}

function clearOverlayBackground(c: HTMLCanvasElement): void {
  const g = c.getContext('2d', { willReadFrequently: true })!;
  const head = g.getImageData(32, 0, 32, 16);
  let opaque = true;
  for (let i = 3; i < head.data.length; i += 4) if (head.data[i] < 255) { opaque = false; break; }
  if (!opaque) return;
  const first = [head.data[0], head.data[1], head.data[2]];
  let same = true;
  for (let i = 0; i < head.data.length; i += 4) if (head.data[i] !== first[0] || head.data[i + 1] !== first[1] || head.data[i + 2] !== first[2]) { same = false; break; }
  if (same) g.clearRect(32, 0, 32, 16);
}

export async function readSkinFile(file: Blob): Promise<{ skin: CustomSkin; converted: boolean }> {
  if (file.size > 200_000) throw new Error('That file is too big for a skin.');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('That file is not a readable image.')); i.src = url; });
    const w = img.naturalWidth, h = img.naturalHeight;
    let c: HTMLCanvasElement;
    let converted = false;
    if (w === h && w >= 64 && (w & (w - 1)) === 0) {
      c = canvas64();
      const g = c.getContext('2d', { willReadFrequently: true })!;
      g.imageSmoothingEnabled = false;
      g.drawImage(img, 0, 0, 64, 64);
      if (w > 64) converted = true;
    } else if (w === h * 2 && w >= 64) {
      const tmp = document.createElement('canvas');
      tmp.width = 64; tmp.height = 32;
      const tg = tmp.getContext('2d')!;
      tg.imageSmoothingEnabled = false;
      tg.drawImage(img, 0, 0, 64, 32);
      c = convertLegacy(tmp);
      converted = true;
    } else throw new Error(`Skins must be 64×64 or 64×32 pixels. This image is ${w}×${h}.`);
    clearOverlayBackground(c);
    const png = c.toDataURL('image/png');
    if (!validSkinData(png)) throw new Error('That skin is too detailed to share. Try a simpler image.');
    return { skin: { png, slim: detectSlim(c) }, converted };
  } finally { URL.revokeObjectURL(url); }
}

const css = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * f)), g = Math.min(255, Math.round(((n >> 8) & 255) * f)), b = Math.min(255, Math.round((n & 255) * f));
  return `rgb(${r},${g},${b})`;
}

/** An original 64×64 skin painted from the simple appearance options. */
export function skinFromAppearance(a: Appearance): HTMLCanvasElement {
  const c = canvas64();
  const g = c.getContext('2d')!;
  const skin = css(SKIN[a.skin % SKIN.length]), hair = css(HAIR[a.hair % HAIR.length]), shirt = css(CLOTH[a.shirt % CLOTH.length]), pants = css(CLOTH[a.pants % CLOTH.length]);
  const box = (u: number, v: number, w: number, h: number, d: number, side: string, front: string, top: string, bottom: string) => {
    g.fillStyle = top; g.fillRect(u + d, v, w, d);
    g.fillStyle = bottom; g.fillRect(u + d + w, v, w, d);
    g.fillStyle = side; g.fillRect(u, v + d, d, h); g.fillRect(u + d + w, v + d, d, h);
    g.fillStyle = front; g.fillRect(u + d, v + d, w, h);
    g.fillStyle = shade(side.startsWith('#') ? side : '#888888', 0.85); g.fillRect(u + d + w + d, v + d, w, h);
  };
  box(0, 0, 8, 8, 8, skin, skin, hair, skin);
  g.fillStyle = hair;
  g.fillRect(8, 8, 8, 2); g.fillRect(8, 10, 1, 2); g.fillRect(15, 10, 1, 2);
  g.fillRect(0, 8, 8, 3); g.fillRect(16, 8, 8, 3); g.fillRect(24, 8, 8, 6);
  g.fillStyle = '#ffffff'; g.fillRect(9, 12, 2, 1); g.fillRect(13, 12, 2, 1);
  g.fillStyle = '#2a3a6a'; g.fillRect(10, 12, 1, 1); g.fillRect(13, 12, 1, 1);
  g.fillStyle = shade(skin, 0.8); g.fillRect(11, 13, 2, 1);
  g.fillStyle = '#7a4a3a'; g.fillRect(11, 14, 2, 1);
  box(16, 16, 8, 12, 4, shirt, shirt, shirt, shirt);
  g.fillStyle = shade(shirt, 0.8); g.fillRect(20, 26, 8, 2);
  box(40, 16, 4, 12, 4, shirt, shirt, shirt, skin);
  g.fillStyle = skin; g.fillRect(40, 28, 16, 4);
  box(32, 48, 4, 12, 4, shirt, shirt, shirt, skin);
  g.fillStyle = skin; g.fillRect(32, 60, 16, 4);
  box(0, 16, 4, 12, 4, pants, pants, pants, '#2a2018');
  g.fillStyle = '#2a2018'; g.fillRect(0, 29, 16, 3);
  box(16, 48, 4, 12, 4, pants, pants, pants, '#2a2018');
  g.fillStyle = '#2a2018'; g.fillRect(16, 61, 16, 3);
  return c;
}

export async function skinImage(png: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('bad skin')); i.src = png; });
}

import { COLORS } from './blocks';

export interface SignSide { t: string[]; c: number; g: boolean; }
export interface SignData { f: SignSide; b: SignSide; }

export const SIGN_LINES = 4;
export const SIGN_CHARS = 24;
export const SIGN_BLACK = COLORS.indexOf('black');

const TEXT_RGB: Record<string, number> = {
  white: 0xffffff, orange: 0xff681f, magenta: 0xff00ff, light_blue: 0x9ac0cd, yellow: 0xffff00, lime: 0xbfff00, pink: 0xff69b4, gray: 0x808080,
  light_gray: 0xd3d3d3, cyan: 0x00ffff, purple: 0xa020f0, blue: 0x0000ff, brown: 0x8b4513, green: 0x00ff00, red: 0xff0000, black: 0x000000,
};

export function blankSide(): SignSide { return { t: ['', '', '', ''], c: SIGN_BLACK, g: false }; }
export function blankSign(): SignData { return { f: blankSide(), b: blankSide() }; }

export function cleanLine(s: unknown): string {
  if (typeof s !== 'string') return '';
  return [...s.replace(/[\u0000-\u001f\u007f-\u009f\u00a7\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, '')].slice(0, SIGN_CHARS).join('');
}

export function cleanSide(s: unknown): SignSide {
  const o = (s && typeof s === 'object' ? s : {}) as Partial<SignSide>;
  const t = Array.isArray(o.t) ? o.t : [];
  const c = Number.isInteger(o.c) && (o.c as number) >= 0 && (o.c as number) < 16 ? (o.c as number) : SIGN_BLACK;
  return { t: Array.from({ length: SIGN_LINES }, (_, i) => cleanLine(t[i])), c, g: o.g === true };
}

export function cleanSign(d: unknown): SignData {
  const o = (d && typeof d === 'object' ? d : {}) as Partial<SignData>;
  return { f: cleanSide(o.f), b: cleanSide(o.b) };
}

export function sideEmpty(s: SignSide): boolean { return s.t.every((l) => !l); }

export function textRGB(c: number): number { return TEXT_RGB[COLORS[c] ?? 'black'] ?? 0; }

export function darkRGB(c: number, glow: boolean): number {
  const rgb = textRGB(c);
  if (rgb === 0 && glow) return 0xf0ebcc;
  return ((((rgb >> 16) & 255) * 0.4) << 16) | ((((rgb >> 8) & 255) * 0.4) << 8) | ((rgb & 255) * 0.4);
}

export function signFacesFront(angle: number, cx: number, cz: number, px: number, pz: number): boolean {
  return (px - cx) * Math.sin(angle) + (pz - cz) * Math.cos(angle) >= 0;
}

import type { Appearance } from '../core/sim/WorldSim';
import { SKIN, HAIR, CLOTH } from '../rendering/EntityRenderer';

const css = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

export function drawAvatar(a: Appearance, scale = 4, full = false): HTMLCanvasElement {
  const W = 8, Hh = full ? 32 : 8;
  const c = document.createElement('canvas');
  c.width = W * scale; c.height = Hh * scale;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  const px = (x: number, y: number, w: number, h: number, col: string) => { g.fillStyle = col; g.fillRect(x * scale, y * scale, w * scale, h * scale); };
  const skin = css(SKIN[a.skin % SKIN.length]), hair = css(HAIR[a.hair % HAIR.length]), shirt = css(CLOTH[a.shirt % CLOTH.length]), pants = css(CLOTH[a.pants % CLOTH.length]);
  px(0, 0, 8, 8, skin);
  px(0, 0, 8, 2, hair);
  px(0, 2, 1, 2, hair); px(7, 2, 1, 2, hair);
  px(1, 4, 2, 1, '#ffffff'); px(5, 4, 2, 1, '#ffffff');
  px(2, 4, 1, 1, '#2a3a6a'); px(5, 4, 1, 1, '#2a3a6a');
  px(3, 6, 2, 1, '#7a4a3a');
  if (full) {
    px(2, 8, 4, 12, shirt);
    px(0, 8, 2, 10, shirt); px(6, 8, 2, 10, shirt);
    px(0, 18, 2, 2, skin); px(6, 18, 2, 2, skin);
    px(2, 20, 4, 10, pants);
    px(4, 20, 0.5, 10, 'rgba(0,0,0,0.25)');
    px(2, 30, 4, 2, '#2a2018');
  }
  return c;
}

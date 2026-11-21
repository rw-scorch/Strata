import { Rng, hashString } from '../core/rng';

export type RGBA = [number, number, number, number];

export class Px {
  readonly w: number;
  readonly h: number;
  readonly d: Uint8ClampedArray;
  constructor(w = 16, h = 16) {
    this.w = w; this.h = h;
    this.d = new Uint8ClampedArray(w * h * 4);
  }
  set(x: number, y: number, c: RGBA): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2]; this.d[i + 3] = c[3];
  }
  get(x: number, y: number): RGBA {
    const i = (y * this.w + x) * 4;
    return [this.d[i], this.d[i + 1], this.d[i + 2], this.d[i + 3]];
  }
  fill(c: RGBA): this { for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) this.set(x, y, c); return this; }
  toImageData(): ImageData { return new ImageData(new Uint8ClampedArray(this.d), this.w, this.h); }
}

const hex = (h: number, a = 255): RGBA => [(h >> 16) & 255, (h >> 8) & 255, h & 255, a];
const shade = (c: RGBA, f: number): RGBA => [c[0] * f, c[1] * f, c[2] * f, c[3]];
const mixc = (a: RGBA, b: RGBA, t: number): RGBA => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t];

function rngFor(key: string): Rng { return new Rng(hashString(key) ^ 0x9e3779b9); }

function noise(key: string, base: RGBA, amt: number, p = new Px()): Px {
  const r = rngFor(key);
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) p.set(x, y, shade(base, 1 - amt + r.next() * amt * 2));
  return p;
}

function speckle(p: Px, key: string, colors: RGBA[], count: number, size = 1): Px {
  const r = rngFor(key + 'sp');
  for (let i = 0; i < count; i++) {
    const x = r.int(p.w), y = r.int(p.h), c = colors[r.int(colors.length)];
    for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) if (r.next() > 0.25 || (dx === 0 && dy === 0)) p.set((x + dx) % p.w, (y + dy) % p.h, c);
  }
  return p;
}

function oreTex(key: string, ore: RGBA, dark: RGBA): Px {
  const p = stone(key);
  const r = rngFor(key);
  const clusters = 4 + r.int(2);
  for (let i = 0; i < clusters; i++) {
    const cx = 2 + r.int(12), cy = 2 + r.int(12);
    const n = 3 + r.int(3);
    for (let k = 0; k < n; k++) {
      const x = cx + r.int(3) - 1, y = cy + r.int(3) - 1;
      p.set(x, y, k === 0 ? shade(ore, 1.15) : ore);
      p.set(x + 1, y + 1, dark);
    }
  }
  return p;
}

function stone(key = 'stone'): Px {
  const p = noise(key, hex(0x7f7f7f), 0.09);
  const r = rngFor(key + 'c');
  for (let i = 0; i < 7; i++) {
    let x = r.int(16), y = r.int(16);
    const len = 2 + r.int(3);
    for (let k = 0; k < len; k++) { p.set(x, y, hex(0x6a6a6a)); x += r.int(2); y += r.int(3) - 1; }
  }
  return p;
}

function cobble(key: string, base: RGBA, mortar: RGBA, moss?: RGBA): Px {
  const p = new Px().fill(mortar);
  const r = rngFor(key);
  const pts: [number, number, number][] = [];
  for (let i = 0; i < 11; i++) pts.push([r.next() * 16, r.next() * 16, 0.85 + r.next() * 0.3]);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    let d1 = 99, d2 = 99, best = 0;
    for (let i = 0; i < pts.length; i++) {
      for (const [ox, oy] of [[0, 0], [16, 0], [-16, 0], [0, 16], [0, -16]]) {
        const dx = x - pts[i][0] - ox, dy = y - pts[i][1] - oy;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < d1) { d2 = d1; d1 = d; best = i; } else if (d < d2) d2 = d;
      }
    }
    if (d2 - d1 > 1.1) {
      let c = shade(base, pts[best][2] * (0.92 + r.next() * 0.16));
      if (d2 - d1 < 2) c = shade(c, 0.85);
      if (moss && r.next() < 0.35) c = mixc(c, moss, 0.75);
      p.set(x, y, c);
    }
  }
  return p;
}

function planks(key: string, base: RGBA): Px {
  const p = new Px();
  const r = rngFor(key);
  for (let y = 0; y < 16; y++) {
    const board = y >> 2;
    const off = (board * 7) % 16;
    for (let x = 0; x < 16; x++) {
      let c = shade(base, 0.92 + r.next() * 0.1 + ((x + y * 3) % 5 === 0 ? -0.06 : 0));
      if (y % 4 === 3) c = shade(base, 0.68);
      if ((x + off) % 16 === 0 && y % 4 !== 3) c = shade(base, 0.72);
      p.set(x, y, c);
    }
  }
  return p;
}

function logSide(key: string, bark: RGBA, streak: RGBA, birch = false): Px {
  const p = new Px();
  const r = rngFor(key);
  for (let x = 0; x < 16; x++) {
    const colShade = 0.85 + r.next() * 0.25;
    for (let y = 0; y < 16; y++) {
      let c = shade(bark, colShade * (0.95 + r.next() * 0.08));
      if (r.next() < 0.12) c = streak;
      p.set(x, y, c);
    }
  }
  if (birch) {
    for (let i = 0; i < 6; i++) {
      const y = r.int(16), x = r.int(14), len = 1 + r.int(3);
      for (let k = 0; k < len; k++) p.set(x + k, y, hex(0x3a3a32));
    }
  }
  return p;
}

function logTop(key: string, bark: RGBA, inner: RGBA): Px {
  const p = new Px();
  const r = rngFor(key);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    let c: RGBA;
    if (d > 6.6) c = shade(bark, 0.9 + r.next() * 0.15);
    else c = shade(inner, (Math.floor(d) % 2 === 0 ? 1 : 0.86) * (0.96 + r.next() * 0.06));
    p.set(x, y, c);
  }
  return p;
}

function leaves(key: string): Px {
  const p = new Px();
  const r = rngFor(key);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const v = r.next();
    if (v < 0.16) continue;
    const g = 110 + r.int(90);
    p.set(x, y, [g, g, g, 255]);
  }
  for (let i = 0; i < 10; i++) p.set(r.int(16), r.int(16), [70, 70, 70, 255]);
  return p;
}

function bricks(key: string, brick: RGBA, mortar: RGBA, h = 4, w = 8): Px {
  const p = new Px();
  const r = rngFor(key);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const row = Math.floor(y / h);
    const off = row % 2 ? w / 2 : 0;
    const mortarH = y % h === h - 1;
    const mortarV = (x + off) % w === 0;
    p.set(x, y, mortarH || mortarV ? shade(mortar, 0.95 + r.next() * 0.1) : shade(brick, 0.88 + r.next() * 0.18));
  }
  return p;
}

function plant(key: string, draw: (p: Px, r: Rng) => void): Px {
  const p = new Px();
  draw(p, rngFor(key));
  return p;
}

function stem(p: Px, x: number, y0: number, y1: number, c: RGBA): void {
  for (let y = y0; y <= y1; y++) p.set(x, y, c);
}

function flower(petal: RGBA, center: RGBA) {
  return (p: Px) => {
    const g = hex(0x3f8a2e);
    stem(p, 7, 8, 15, g);
    p.set(6, 12, g); p.set(5, 11, g); p.set(8, 11, g); p.set(9, 10, g);
    for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1], [0, -2], [-2, 0], [2, 0]]) p.set(7 + dx, 5 + dy, (Math.abs(dx) + Math.abs(dy)) === 2 && dx * dy !== 0 ? shade(petal, 0.8) : petal);
    p.set(7, 5, center);
  };
}

function grassBlades(gray: boolean, dense: number) {
  return (p: Px, r: Rng) => {
    for (let i = 0; i < dense; i++) {
      const x = 1 + r.int(14);
      const top = 3 + r.int(9);
      for (let y = top; y < 16; y++) {
        const g = 120 + r.int(100);
        const xx = x + (y < top + 3 && r.next() < 0.4 ? (r.next() < 0.5 ? -1 : 1) : 0);
        p.set(xx, y, gray ? [g, g, g, 255] : [g * 0.5, g, g * 0.4, 255]);
      }
    }
  };
}

function wheatStage(stage: number) {
  return (p: Px, r: Rng) => {
    const h = 3 + stage * 1.6;
    const col: RGBA = stage < 5 ? hex(0x4f9a2a) : stage < 7 ? hex(0x9caa34) : hex(0xc8a53a);
    for (const x of [1, 4, 7, 10, 13]) {
      const top = Math.floor(16 - h + r.int(2));
      stem(p, x, top, 15, shade(col, 0.85));
      if (stage >= 5) for (let y = top; y < top + 3; y++) { p.set(x - 1, y, col); p.set(x + 1, y, shade(col, 1.1)); }
    }
  };
}

function waterFrames(n: number, base: number, amp: number, key: string, alpha = 255): Px {
  const p = new Px(16, 16 * n);
  for (let f = 0; f < n; f++) {
    const t = (f / n) * Math.PI * 2;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const v = Math.sin((x + y) * 0.7 + t) * 0.5 + Math.sin((x * 0.45 - y * 0.8) + t * 2) * 0.3 + Math.sin(y * 1.1 - t) * 0.2;
      const g = base + v * amp;
      p.set(x, y + f * 16, key === 'lava' ? [255, Math.min(255, 80 + g * 0.8), Math.max(0, g * 0.25 - 20), alpha] : [g, g, g, alpha]);
    }
  }
  return p;
}

function crack(stage: number): Px {
  const p = new Px();
  const r = new Rng(777);
  const lines = 2 + stage * 2;
  for (let i = 0; i < lines; i++) {
    let x = 4 + r.int(8), y = 4 + r.int(8);
    const len = 3 + r.int(3 + stage);
    for (let k = 0; k < len; k++) {
      p.set(x, y, [20, 20, 20, 210]);
      x += r.int(3) - 1; y += r.int(3) - 1;
      x = Math.max(0, Math.min(15, x)); y = Math.max(0, Math.min(15, y));
    }
  }
  return p;
}

function metalBlock(key: string, c: RGBA): Px {
  const p = noise(key, c, 0.05);
  for (let i = 0; i < 16; i++) { p.set(i, 0, shade(c, 1.2)); p.set(0, i, shade(c, 1.2)); p.set(i, 15, shade(c, 0.7)); p.set(15, i, shade(c, 0.7)); }
  for (let i = 3; i < 13; i++) { p.set(i, 3, shade(c, 0.85)); p.set(3, i, shade(c, 0.85)); p.set(i, 12, shade(c, 1.1)); p.set(12, i, shade(c, 1.1)); }
  return p;
}

function wool(key: string, c: RGBA): Px {
  const p = noise(key, c, 0.06);
  const r = rngFor(key + 'w');
  for (let i = 0; i < 30; i++) { const x = r.int(16), y = r.int(16); p.set(x, y, shade(c, 0.88)); p.set(x + 1, y, shade(c, 0.92)); }
  return p;
}

function door(top: boolean): Px {
  const p = planks('oak_door', hex(0xa07a45));
  for (let i = 0; i < 16; i++) { p.set(0, i, hex(0x6b4f2a)); p.set(15, i, hex(0x6b4f2a)); }
  if (top) {
    for (let y = 3; y < 13; y++) for (let x = 3; x < 13; x++) {
      if (x === 7 || x === 8 || y === 7 || y === 8) p.set(x, y, hex(0x6b4f2a));
      else p.set(x, y, [0, 0, 0, 0]);
    }
    for (let i = 0; i < 16; i++) p.set(i, 0, hex(0x6b4f2a));
  } else {
    for (let i = 0; i < 16; i++) p.set(i, 15, hex(0x6b4f2a));
    p.set(12, 3, hex(0x3a3a3a)); p.set(12, 4, hex(0x3a3a3a));
  }
  return p;
}

function trapdoorTex(key: string, base: RGBA, metal = false): Px {
  const p = metal ? noise(key, base, 0.05) : planks(key + '_td', base);
  const edge = shade(base, metal ? 0.72 : 0.62);
  for (let i = 0; i < 16; i++) { p.set(i, 0, edge); p.set(i, 15, edge); p.set(0, i, edge); p.set(15, i, edge); }
  const holes = metal ? [[3, 3, 5, 6], [10, 3, 12, 6], [3, 10, 5, 13], [10, 10, 12, 13]] : [[3, 3, 6, 6], [9, 3, 12, 6], [3, 9, 6, 12], [9, 9, 12, 12]];
  for (const [x0, y0, x1, y1] of holes) {
    for (let y = y0 - 1; y <= y1 + 1; y++) for (let x = x0 - 1; x <= x1 + 1; x++) p.set(x, y, edge);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) p.set(x, y, [0, 0, 0, 0]);
  }
  if (metal) for (const [x, y] of [[7, 7], [8, 8], [7, 8], [8, 7]]) p.set(x, y, shade(base, 1.2));
  return p;
}

const TEX: Record<string, () => Px> = {
  oak_trapdoor: () => trapdoorTex('oak', hex(0xa8834d)),
  spruce_trapdoor: () => trapdoorTex('spruce', hex(0x6e5134)),
  birch_trapdoor: () => trapdoorTex('birch', hex(0xd2bf88)),
  jungle_trapdoor: () => trapdoorTex('jungle', hex(0xa87656)),
  acacia_trapdoor: () => trapdoorTex('acacia', hex(0xb05d37)),
  dark_oak_trapdoor: () => trapdoorTex('dark_oak', hex(0x4a3220)),
  cherry_trapdoor: () => trapdoorTex('cherry', hex(0xe3b3ad)),
  mangrove_trapdoor: () => trapdoorTex('mangrove', hex(0x773631)),
  iron_trapdoor: () => trapdoorTex('iron_td', hex(0xc8c8c8), true),
  stone: () => stone(),
  dirt: () => speckle(noise('dirt', hex(0x7a5536), 0.1), 'dirt', [hex(0x5e4027), hex(0x8f6845), hex(0x9a7a5a)], 26),
  grass_block_top: () => { const p = noise('gtop', [180, 180, 180, 255], 0.16); return speckle(p, 'gtop', [[140, 140, 140, 255], [215, 215, 215, 255]], 30); },
  grass_block_side: () => speckle(noise('dirt', hex(0x7a5536), 0.1), 'dirt', [hex(0x5e4027), hex(0x8f6845)], 26),
  grass_block_side_overlay: () => {
    const p = new Px();
    const r = rngFor('gso');
    for (let x = 0; x < 16; x++) {
      const h = 3 + r.int(3);
      for (let y = 0; y < h; y++) { const g = 150 + r.int(70); p.set(x, y, [g, g, g, 255]); }
    }
    return p;
  },
  grass_block_snow: () => {
    const p = TEX.dirt();
    const r = rngFor('gss');
    for (let x = 0; x < 16; x++) { const h = 3 + r.int(3); for (let y = 0; y < h; y++) p.set(x, y, shade(hex(0xf4f8fb), 0.94 + r.next() * 0.06)); }
    return p;
  },
  snow: () => speckle(noise('snow', hex(0xf2f6f8), 0.03), 'snow', [hex(0xdfe7ee)], 14),
  cobblestone: () => cobble('cobble', hex(0x8a8a8a), hex(0x4e4e4e)),
  mossy_cobblestone: () => cobble('cobble', hex(0x8a8a8a), hex(0x4e4e4e), hex(0x5c7f3a)),
  oak_planks: () => planks('oak', hex(0xa8834d)),
  acacia_planks: () => planks('acacia', hex(0xb05d37)),
  dark_oak_planks: () => planks('dark_oak', hex(0x4a3220)),
  acacia_log: () => logSide('acacia_log', hex(0x6a645c), hex(0x524c45)),
  acacia_log_top: () => logTop('acacia_top', hex(0x6a645c), hex(0xb05d37)),
  dark_oak_log: () => logSide('dark_oak_log', hex(0x3b2a19), hex(0x2a1d10)),
  dark_oak_log_top: () => logTop('dark_oak_top', hex(0x3b2a19), hex(0x5a4129)),
  acacia_leaves: () => leaves('acacia_leaves'),
  dark_oak_leaves: () => leaves('dark_oak_leaves'),
  acacia_sapling: () => plant('asap', (p) => { stem(p, 7, 8, 15, hex(0x6a645c)); for (let y = 2; y < 7; y++) for (let x = 2; x < 14; x++) if (Math.abs(y - 4) * 3 + Math.abs(x - 7.5) < 7 && (x + y) % 3) p.set(x, y, hex(0x6f8f2c)); }),
  dark_oak_sapling: () => plant('dsap', (p) => { stem(p, 7, 9, 15, hex(0x3b2a19)); for (let y = 2; y < 10; y++) for (let x = 3; x < 12; x++) if ((x - 7) ** 2 + (y - 6) ** 2 < 15 && (x * y + 1) % 3) p.set(x, y, hex(0x2f6a1c)); }),
  cherry_planks: () => planks('cherry', hex(0xe3b3ad)),
  mangrove_planks: () => planks('mangrove', hex(0x773631)),
  cherry_log: () => logSide('cherry_log', hex(0x3a2230), hex(0x2a1622)),
  cherry_log_top: () => logTop('cherry_top', hex(0x3a2230), hex(0xd9a29a)),
  mangrove_log: () => logSide('mangrove_log', hex(0x544433), hex(0x3d3024)),
  mangrove_log_top: () => logTop('mangrove_top', hex(0x544433), hex(0x7a3a33)),
  cherry_leaves: () => { const p = noise('cherryl', hex(0xf0a6c8), 0.12); for (let i = 0; i < 40; i++) { const x = (i * 7) % 16, y = (i * 11) % 16; p.set(x, y, i % 3 ? hex(0xf7c1da) : hex(0xd97fae)); } for (let i = 0; i < 18; i++) p.set((i * 5 + 3) % 16, (i * 9 + 1) % 16, [0, 0, 0, 0]); return p; },
  mangrove_leaves: () => leaves('mangrove_leaves'),
  cherry_sapling: () => plant('csap', (p) => { stem(p, 7, 9, 15, hex(0x3a2230)); for (let y = 2; y < 9; y++) for (let x = 3; x < 13; x++) if ((x - 7.5) ** 2 + (y - 5) ** 2 < 14 && (x + 2 * y) % 3) p.set(x, y, hex(0xf0a6c8)); }),
  mangrove_propagule: () => plant('mprop', (p) => { stem(p, 7, 4, 13, hex(0x6f8f2c)); for (let y = 1; y < 5; y++) for (let x = 5; x < 11; x++) if ((x + y) % 2) p.set(x, y, hex(0x4f7a28)); p.set(7, 14, hex(0x7a5a2a)); }),
  tube_coral_block: () => speckle(noise('tcb', hex(0x3157d0), 0.1), 'tcb', [hex(0x2742a8), hex(0x4a74e8)], 40),
  brain_coral_block: () => speckle(noise('bcb', hex(0xcf5b9f), 0.1), 'bcb', [hex(0xa8467f), hex(0xe57ab7)], 40),
  bubble_coral_block: () => speckle(noise('bucb', hex(0xa519a1), 0.1), 'bucb', [hex(0x84137f), hex(0xc23dbf)], 40),
  fire_coral_block: () => speckle(noise('fcb', hex(0xa3232e), 0.1), 'fcb', [hex(0x821b24), hex(0xc43a45)], 40),
  horn_coral_block: () => speckle(noise('hcb', hex(0xd8c742), 0.1), 'hcb', [hex(0xb3a332), hex(0xeadb62)], 40),
  tube_coral: () => plant('tc', (p) => { for (let y = 3; y < 16; y++) for (const x of [4, 7, 11]) if ((y + x) % 4) p.set(x + ((y >> 2) & 1), y, hex(0x3157d0)); }),
  brain_coral: () => plant('bc', (p) => { for (let y = 6; y < 16; y++) for (let x = 3; x < 13; x++) if ((x - 8) ** 2 + (y - 11) ** 2 < 22 && (x * y) % 3) p.set(x, y, hex(0xcf5b9f)); }),
  bubble_coral: () => plant('buc', (p) => { for (let y = 4; y < 16; y++) for (let x = 2; x < 14; x++) if (((x - 8) ** 2 + (y - 9) ** 2) % 7 < 2) p.set(x, y, hex(0xa519a1)); }),
  fire_coral: () => plant('fc', (p) => { for (let y = 2; y < 16; y++) for (const x of [3, 6, 9, 12]) if ((x + y) % 3) p.set(x + (y % 2), y, hex(0xa3232e)); }),
  horn_coral: () => plant('hc', (p) => { for (let y = 3; y < 16; y++) for (let x = 2; x < 14; x++) if (Math.abs(x - 8) < (16 - y) / 2 && (x + y) % 2) p.set(x, y, hex(0xd8c742)); }),
  red_mushroom_block: () => { const p = noise('rmb', hex(0xc22b28), 0.06); for (const [x, y, r] of [[3, 3, 2], [11, 4, 2], [7, 10, 2], [13, 12, 1], [2, 12, 1]]) for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) if (dx * dx + dy * dy <= r * r) p.set((x + dx + 16) % 16, (y + dy + 16) % 16, hex(0xe8e4d8)); return p; },
  brown_mushroom_block: () => speckle(noise('bmb', hex(0x956f51), 0.06), 'bmb', [hex(0x7f5c42), hex(0xa77f60)], 30),
  mushroom_stem: () => speckle(noise('mst', hex(0xcbc4b8), 0.05), 'mst', [hex(0xb8b0a2), hex(0xdcd6cb)], 24),
  mycelium_top: () => speckle(noise('myc', hex(0x6f6265), 0.1), 'myc', [hex(0x8a7d84), hex(0x5c5052), hex(0x9a8c96)], 60),
  mycelium_side: () => { const p = TEX.dirt(); for (let x = 0; x < 16; x++) for (let y = 0; y < 3 + ((x * 5) % 3); y++) p.set(x, y, (x + y) % 3 ? hex(0x6f6265) : hex(0x8a7d84)); return p; },
  red_sand: () => speckle(noise('rsand', hex(0xbe6621), 0.06), 'rsand', [hex(0xa85818), hex(0xd27a35)], 30),
  coarse_dirt: () => speckle(noise('cdirt', hex(0x77553a), 0.12), 'cdirt', [hex(0x5a3f2a), hex(0x8f8f8f), hex(0x6b6b6b), hex(0x9a7a5a)], 40),
  podzol_top: () => speckle(noise('podz', hex(0x5b3e1d), 0.12), 'podz', [hex(0x7a5a2a), hex(0x3f2a12), hex(0x6a4f22)], 44),
  podzol_side: () => { const p = TEX.dirt(); for (let x = 0; x < 16; x++) for (let y = 0; y < 3 + ((x * 7) % 3); y++) p.set(x, y, (x + y) % 3 ? hex(0x5b3e1d) : hex(0x7a5a2a)); return p; },
  red_sandstone: () => { const p = noise('rss', hex(0xb5621f), 0.05); for (let x = 0; x < 16; x++) { p.set(x, 3, hex(0x9c521a)); p.set(x, 10, hex(0x9c521a)); p.set(x, 11, hex(0xc97a35)); } return p; },
  red_sandstone_top: () => speckle(noise('rsst', hex(0xbb6a26), 0.04), 'rsst', [hex(0xa85d1f)], 12),
  red_sandstone_bottom: () => speckle(noise('rssb', hex(0xb0601e), 0.08), 'rssb', [hex(0x96501a)], 20),
  birch_planks: () => planks('birch', hex(0xd2bf88)),
  spruce_planks: () => planks('spruce', hex(0x6e5134)),
  jungle_planks: () => planks('jungle', hex(0xa87656)),
  bedrock: () => speckle(noise('bedrock', hex(0x555555), 0.4), 'bedrock', [hex(0x222222), hex(0x9a9a9a)], 40, 2),
  sand: () => speckle(noise('sand', hex(0xdbcf9c), 0.06), 'sand', [hex(0xc9bb83), hex(0xe9dfb4)], 30),
  gravel: () => speckle(noise('gravel', hex(0x857d7a), 0.12), 'gravel', [hex(0x5f5754), hex(0xa09893), hex(0x6e6f75)], 40, 2),
  clay: () => speckle(noise('clay', hex(0x9ea4b0), 0.05), 'clay', [hex(0x8d93a0)], 12),
  ice: () => {
    const p = noise('ice', [150, 190, 245, 200], 0.06);
    const r = rngFor('ice2');
    for (let i = 0; i < 4; i++) { const y = r.int(16); for (let x = r.int(6); x < 16; x += 1) if (r.next() < 0.7) p.set(x, (y + (x >> 2)) % 16, [210, 230, 255, 220]); }
    return p;
  },
  water_still: () => waterFrames(32, 200, 30, 'water', 255),
  lava_still: () => waterFrames(20, 170, 70, 'lava', 255),
  water_flow: () => waterFrames(32, 200, 30, 'water', 255),
  lava_flow: () => waterFrames(20, 170, 70, 'lava', 255),
  oak_log: () => logSide('oak_log', hex(0x6b5233), hex(0x4f3b22)),
  oak_log_top: () => logTop('oak_top', hex(0x6b5233), hex(0xb08d57)),
  birch_log: () => logSide('birch_log', hex(0xd9d6cc), hex(0xbcb8ab), true),
  birch_log_top: () => logTop('birch_top', hex(0xd9d6cc), hex(0xcdb87f)),
  spruce_log: () => logSide('spruce_log', hex(0x3e2b18), hex(0x2c1e10)),
  spruce_log_top: () => logTop('spruce_top', hex(0x3e2b18), hex(0x7a5a38)),
  jungle_log: () => logSide('jungle_log', hex(0x5a4a1e), hex(0x6c5a26)),
  jungle_log_top: () => logTop('jungle_top', hex(0x5a4a1e), hex(0xa8794f)),
  oak_leaves: () => leaves('oak_leaves'),
  birch_leaves: () => leaves('birch_leaves'),
  spruce_leaves: () => leaves('spruce_leaves'),
  jungle_leaves: () => leaves('jungle_leaves'),
  coal_ore: () => oreTex('coal_ore', hex(0x2b2b2b), hex(0x111111)),
  iron_ore: () => oreTex('iron_ore', hex(0xd8af93), hex(0x8b6550)),
  gold_ore: () => oreTex('gold_ore', hex(0xf5d94a), hex(0xb08a14)),
  aetherite_ore: () => oreTex('aeth_ore', hex(0x5ff3e6), hex(0x1d8f89)),
  sandstone: () => { const p = noise('ss', hex(0xd8c88f), 0.05); for (let x = 0; x < 16; x++) { p.set(x, 3, hex(0xc4b47a)); p.set(x, 10, hex(0xc4b47a)); p.set(x, 11, hex(0xe2d5a2)); } return p; },
  sandstone_top: () => speckle(noise('sst', hex(0xddcd96), 0.04), 'sst', [hex(0xcfbf86)], 12),
  sandstone_bottom: () => speckle(noise('ssb', hex(0xd2c289), 0.08), 'ssb', [hex(0xbfae74)], 20),
  cactus_side: () => {
    const p = noise('cac', hex(0x3f7a2a), 0.08);
    for (let y = 0; y < 16; y++) { p.set(0, y, [0, 0, 0, 0]); p.set(15, y, [0, 0, 0, 0]); p.set(1, y, hex(0x2c5a1c)); p.set(14, y, hex(0x2c5a1c)); }
    for (let y = 1; y < 16; y += 4) { p.set(4, y, hex(0xe8e0b0)); p.set(11, y + 2, hex(0xe8e0b0)); p.set(8, y + 1, hex(0x2c5a1c)); }
    return p;
  },
  cactus_top: () => { const p = noise('cact', hex(0x4f8e34), 0.06); for (let i = 0; i < 16; i++) { p.set(i, 0, [0, 0, 0, 0]); p.set(0, i, [0, 0, 0, 0]); p.set(i, 15, [0, 0, 0, 0]); p.set(15, i, [0, 0, 0, 0]); } p.set(7, 7, hex(0xc9d68a)); return p; },
  cactus_bottom: () => noise('cacb', hex(0x9cae6b), 0.05),
  short_grass: () => plant('short_grass', grassBlades(true, 9)),
  fern: () => plant('fern', (p, r) => {
    for (const [x0, dir] of [[7, -1], [8, 1], [6, -1], [9, 1]] as [number, number][]) {
      let x = x0;
      for (let y = 15; y > 3 + r.int(4); y--) { const g = 120 + r.int(90); p.set(x, y, [g, g, g, 255]); if (y % 2 === 0) { p.set(x + dir, y, [g * 0.9, g * 0.9, g * 0.9, 255]); } if (y % 4 === 0) x += dir; }
    }
  }),
  dandelion: () => plant('dandelion', flower(hex(0xf5d72b), hex(0xd4a014))),
  poppy: () => plant('poppy', flower(hex(0xd8241f), hex(0x2a2a1a))),
  dead_bush: () => plant('dead_bush', (p, r) => {
    const c = hex(0x7a5a2e);
    stem(p, 7, 8, 15, c);
    for (let i = 0; i < 6; i++) { let x = 7, y = 11 - r.int(3); const d = r.next() < 0.5 ? -1 : 1; for (let k = 0; k < 4; k++) { x += d; y -= r.int(2); p.set(x, y, c); } }
  }),
  sugar_cane: () => plant('cane', (p, r) => {
    for (const x of [3, 7, 11]) for (let y = 0; y < 16; y++) { const g = 150 + r.int(60); p.set(x, y, [g, g, g, 255]); p.set(x + 1, y, [g * 0.85, g * 0.85, g * 0.85, 255]); if (y % 5 === 0) { p.set(x, y, [110, 110, 110, 255]); p.set(x + 2, y + 1, [g, g, g, 255]); } }
  }),
  oak_sapling: () => plant('osap', (p) => { stem(p, 7, 9, 15, hex(0x6b5233)); for (let y = 2; y < 10; y++) for (let x = 3; x < 12; x++) if ((x - 7) ** 2 + (y - 6) ** 2 < 14 && (x * y) % 3) p.set(x, y, hex(0x4c8f2c)); }),
  birch_sapling: () => plant('bsap', (p) => { stem(p, 7, 9, 15, hex(0xd9d6cc)); for (let y = 2; y < 10; y++) for (let x = 4; x < 11; x++) if ((x - 7) ** 2 + (y - 6) ** 2 < 10 && (x + y) % 3) p.set(x, y, hex(0x80a755)); }),
  spruce_sapling: () => plant('ssap', (p) => { stem(p, 7, 10, 15, hex(0x3e2b18)); for (let y = 1; y < 11; y++) { const w = Math.floor((y - 1) / 2); for (let x = 7 - w; x <= 7 + w; x++) if ((x + y) % 2) p.set(x, y, hex(0x2f5a2f)); } }),
  jungle_sapling: () => plant('jsap', (p) => { stem(p, 7, 8, 15, hex(0x5a4a1e)); for (let y = 1; y < 9; y++) for (let x = 2; x < 13; x++) if (Math.abs(x - 7) + Math.abs(y - 5) < 6 && (x * 3 + y) % 4) p.set(x, y, hex(0x3a9a1a)); }),
  red_mushroom: () => plant('rmush', (p) => { stem(p, 7, 9, 14, hex(0xe8dcc8)); stem(p, 8, 9, 14, hex(0xd8ccb8)); for (let y = 4; y < 9; y++) for (let x = 3; x < 13; x++) if ((x - 7.5) ** 2 / 25 + (y - 8.5) ** 2 / 20 < 1) p.set(x, y, (x + y) % 4 === 0 && y < 8 ? hex(0xf2f2f2) : hex(0xc8241e)); }),
  brown_mushroom: () => plant('bmush', (p) => { stem(p, 7, 10, 14, hex(0xd8ccb8)); for (let y = 7; y < 11; y++) for (let x = 3; x < 13; x++) if ((x - 7.5) ** 2 / 25 + (y - 10.5) ** 2 / 10 < 1) p.set(x, y, hex(0x9a6e4a)); }),
  lily_pad: () => plant('lily', (p) => { for (let y = 1; y < 15; y++) for (let x = 1; x < 15; x++) if ((x - 7.5) ** 2 + (y - 7.5) ** 2 < 42 && !(x > 7 && Math.abs(y - 7.5) < x - 7)) { const g = 150 + ((x * 7 + y * 3) % 40); p.set(x, y, [g, g, g, 255]); } }),
  crafting_table_top: () => { const p = planks('ctt', hex(0xa8834d)); for (let i = 0; i < 16; i++) { p.set(i, 0, hex(0x5d4224)); p.set(0, i, hex(0x5d4224)); p.set(i, 15, hex(0x5d4224)); p.set(15, i, hex(0x5d4224)); p.set(i, 5, hex(0x7a5836)); p.set(i, 10, hex(0x7a5836)); p.set(5, i, hex(0x7a5836)); p.set(10, i, hex(0x7a5836)); } return p; },
  crafting_table_side: () => { const p = planks('cts', hex(0x9a7646)); for (let i = 0; i < 16; i++) { p.set(i, 0, hex(0x5d4224)); p.set(i, 1, hex(0x7a5836)); } for (let y = 4; y < 12; y++) { p.set(4, y, hex(0x4a4a4a)); p.set(11, y, hex(0x6b5233)); } p.set(3, 4, hex(0x4a4a4a)); p.set(5, 4, hex(0x4a4a4a)); p.set(10, 4, hex(0x8a8a8a)); p.set(12, 4, hex(0x8a8a8a)); p.set(11, 3, hex(0x8a8a8a)); return p; },
  crafting_table_front: () => { const p = planks('ctf', hex(0x9a7646)); for (let i = 0; i < 16; i++) { p.set(i, 0, hex(0x5d4224)); p.set(i, 1, hex(0x7a5836)); } for (let y = 5; y < 13; y++) { p.set(7, y, hex(0x6b5233)); } for (let x = 4; x < 11; x++) p.set(x, 5, hex(0x9a9a9a)); p.set(4, 6, hex(0x9a9a9a)); p.set(10, 6, hex(0x9a9a9a)); return p; },
  furnace_side: () => cobble('fside', hex(0x7d7d7d), hex(0x5a5a5a)),
  furnace_top: () => noise('ftop', hex(0x6e6e6e), 0.08),
  furnace_front: () => { const p = cobble('ffront', hex(0x7d7d7d), hex(0x5a5a5a)); for (let y = 8; y < 14; y++) for (let x = 4; x < 12; x++) p.set(x, y, y === 8 || x === 4 || x === 11 ? hex(0x3a3a3a) : hex(0x1a1a1a)); return p; },
  furnace_front_on: () => { const p = cobble('ffront', hex(0x7d7d7d), hex(0x5a5a5a)); const r = rngFor('fire'); for (let y = 8; y < 14; y++) for (let x = 4; x < 12; x++) p.set(x, y, y === 8 || x === 4 || x === 11 ? hex(0x3a3a3a) : y > 10 - r.int(2) ? hex(r.next() < 0.5 ? 0xffb52e : 0xff6a1a) : hex(0x3a1a0a)); return p; },
  chest_front: () => { const p = planks('chf', hex(0xa4752f)); for (let i = 0; i < 16; i++) { p.set(i, 0, hex(0x4f3214)); p.set(i, 15, hex(0x4f3214)); p.set(0, i, hex(0x4f3214)); p.set(15, i, hex(0x4f3214)); p.set(i, 5, hex(0x4f3214)); } for (let y = 4; y < 8; y++) for (let x = 7; x < 9; x++) p.set(x, y, hex(0xc8c8c8)); return p; },
  chest_side: () => { const p = planks('chs', hex(0x9a6c2a)); for (let i = 0; i < 16; i++) { p.set(i, 0, hex(0x4f3214)); p.set(i, 15, hex(0x4f3214)); p.set(0, i, hex(0x4f3214)); p.set(15, i, hex(0x4f3214)); p.set(i, 5, hex(0x4f3214)); } return p; },
  chest_top: () => { const p = planks('cht', hex(0xa4752f)); for (let i = 0; i < 16; i++) { p.set(i, 0, hex(0x4f3214)); p.set(i, 15, hex(0x4f3214)); p.set(0, i, hex(0x4f3214)); p.set(15, i, hex(0x4f3214)); } return p; },
  torch: () => { const p = new Px(); for (let y = 6; y < 16; y++) { p.set(7, y, hex(0x6b5233)); p.set(8, y, hex(0x4f3b22)); } p.set(7, 6, hex(0xffe08a)); p.set(8, 6, hex(0xffc040)); p.set(7, 7, hex(0xffa020)); p.set(8, 7, hex(0xff8010)); p.set(7, 5, hex(0xfff2c0)); p.set(8, 5, hex(0xffe08a)); return p; },
  glass: () => { const p = new Px(); for (let i = 0; i < 16; i++) { p.set(i, 0, hex(0xd8eef2)); p.set(0, i, hex(0xd8eef2)); p.set(i, 15, hex(0xa8c8d0)); p.set(15, i, hex(0xa8c8d0)); } for (let i = 3; i < 7; i++) p.set(i, 9 - i, hex(0xf0fbff)); p.set(10, 4, hex(0xf0fbff)); p.set(11, 3, hex(0xf0fbff)); return p; },
  smooth_stone: () => { const p = noise('smst', hex(0x9f9f9f), 0.025); for (let i = 0; i < 16; i++) { p.set(i, 0, hex(0xb4b4b4)); p.set(0, i, hex(0xb4b4b4)); p.set(i, 15, hex(0x777777)); p.set(15, i, hex(0x777777)); } return p; },
  cracked_stone_bricks: () => { const p = bricks('cstone_bricks', hex(0x7c7c7c), hex(0x5c5c5c), 8, 16); const r = rngFor('crack'); let x = 3 + r.int(4), y = 0; while (y < 16) { p.set(x, y, hex(0x4a4a4a)); y++; x = Math.max(0, Math.min(15, x + r.int(3) - 1)); } x = 10 + r.int(3); for (y = 2; y < 12; y++) { p.set(x, y, hex(0x4e4e4e)); x = Math.max(0, Math.min(15, x + r.int(3) - 1)); } return p; },
  chiseled_stone_bricks: () => { const p = noise('chst', hex(0x7a7a7a), 0.05); for (let i = 0; i < 16; i++) { p.set(i, 0, hex(0x5c5c5c)); p.set(i, 15, hex(0x5c5c5c)); p.set(0, i, hex(0x5c5c5c)); p.set(15, i, hex(0x5c5c5c)); } for (let i = 3; i < 13; i++) { p.set(i, 3, hex(0x606060)); p.set(i, 12, hex(0x969696)); p.set(3, i, hex(0x606060)); p.set(12, i, hex(0x969696)); } for (let y = 6; y < 10; y++) for (let x = 6; x < 10; x++) p.set(x, y, hex((x + y) % 2 ? 0x6a6a6a : 0x8a8a8a)); return p; },
  cut_sandstone: () => { const p = noise('cutss', hex(0xd8c88f), 0.04); for (let i = 0; i < 16; i++) { p.set(i, 0, hex(0xe2d5a2)); p.set(i, 15, hex(0xc4b47a)); p.set(0, i, hex(0xe2d5a2)); p.set(15, i, hex(0xc4b47a)); p.set(i, 7, hex(0xc4b47a)); p.set(i, 8, hex(0xe2d5a2)); } return p; },
  chiseled_sandstone: () => { const p = noise('chss', hex(0xd8c88f), 0.04); for (let i = 0; i < 16; i++) { p.set(i, 1, hex(0xc4b47a)); p.set(i, 14, hex(0xc4b47a)); } for (let y = 4; y < 12; y++) for (let x = 4; x < 12; x++) if (Math.abs(x - 7.5) + Math.abs(y - 7.5) < 4.5 && Math.abs(x - 7.5) + Math.abs(y - 7.5) > 2.5) p.set(x, y, hex(0xb8a86e)); return p; },
  coal_block: () => speckle(noise('coalb', hex(0x161616), 0.25), 'coalb', [hex(0x2c2c2c), hex(0x0a0a0a)], 40),
  hay_block_side: () => { const p = noise('hays', hex(0xc9a42b), 0.08); const r = rngFor('hay'); for (let x = 0; x < 16; x++) for (let y = 0; y < 16; y++) if ((x + r.int(2)) % 3 === 0) p.set(x, y, hex(0xa98a20)); for (let x = 0; x < 16; x++) { p.set(x, 3, hex(0x7a5a1a)); p.set(x, 12, hex(0x7a5a1a)); } return p; },
  hay_block_top: () => { const p = noise('hayt', hex(0xb8962a), 0.12); for (let i = 0; i < 16; i++) { p.set(i, 0, hex(0x7a5a1a)); p.set(i, 15, hex(0x7a5a1a)); p.set(0, i, hex(0x7a5a1a)); p.set(15, i, hex(0x7a5a1a)); } return p; },
  packed_ice: () => { const p = noise('pice', hex(0x8db4f0), 0.06); const r = rngFor('pice'); for (let i = 0; i < 6; i++) { let x = r.int(16), y = r.int(16); for (let k = 0; k < 6; k++) { p.set(x, y, hex(0xc8dcff)); x = (x + 1) % 16; y = (y + r.int(2)) % 16; } } return p; },
  terracotta: () => noise('terra', hex(0x985e43), 0.05),
  bone_block_side: () => { const p = noise('bones', hex(0xe3dcc4), 0.04); for (let x = 0; x < 16; x++) { p.set(x, 0, hex(0xc9c0a4)); p.set(x, 15, hex(0xc9c0a4)); } for (let y = 1; y < 15; y += 3) for (let x = 0; x < 16; x++) if ((x + y) % 7 === 0) p.set(x, y, hex(0xcfc6a8)); return p; },
  bone_block_top: () => { const p = noise('bonet', hex(0xe3dcc4), 0.04); for (let i = 0; i < 16; i++) { p.set(i, 0, hex(0xc9c0a4)); p.set(i, 15, hex(0xc9c0a4)); p.set(0, i, hex(0xc9c0a4)); p.set(15, i, hex(0xc9c0a4)); } for (let y = 5; y < 11; y++) for (let x = 5; x < 11; x++) if ((x - 7.5) ** 2 + (y - 7.5) ** 2 < 8 && (x - 7.5) ** 2 + (y - 7.5) ** 2 > 2) p.set(x, y, hex(0xbdb495)); return p; },
  emerald_block: () => { const p = noise('emb', hex(0x2fd06a), 0.08); for (let i = 0; i < 16; i++) { p.set(i, 0, hex(0x6ff4a2)); p.set(0, i, hex(0x6ff4a2)); p.set(i, 15, hex(0x0f8a3c)); p.set(15, i, hex(0x0f8a3c)); } for (let y = 3; y < 13; y += 3) for (let x = 3; x < 13; x += 3) { p.set(x, y, hex(0xbaffd6)); p.set(x + 1, y + 1, hex(0x149c48)); } return p; },
  bricks: () => bricks('bricks', hex(0x9a4f3c), hex(0xa8a093)),
  stone_bricks: () => bricks('stone_bricks', hex(0x7c7c7c), hex(0x5c5c5c), 8, 16),
  mossy_stone_bricks: () => { const p = bricks('mstone_bricks', hex(0x7c7c7c), hex(0x5c5c5c), 8, 16); const r = rngFor('moss'); for (let i = 0; i < 70; i++) { const x = r.int(16), y = r.int(16); p.set(x, y, mixc(p.get(x, y), hex(0x5c7f3a), 0.7)); } return p; },
  oak_door_top: () => door(true),
  oak_door_bottom: () => door(false),
  ladder: () => { const p = new Px(); for (let y = 0; y < 16; y++) { p.set(2, y, hex(0x7a5836)); p.set(3, y, hex(0x9a7646)); p.set(12, y, hex(0x7a5836)); p.set(13, y, hex(0x9a7646)); } for (const y of [1, 5, 9, 13]) for (let x = 2; x < 14; x++) { p.set(x, y, hex(0xa8834d)); p.set(x, y + 1, hex(0x7a5836)); } return p; },
  white_wool: () => wool('wwool', hex(0xe9ecec)),
  red_wool: () => wool('rwool', hex(0xa12722)),
  yellow_wool: () => wool('ywool', hex(0xf8c527)),
  iron_block: () => metalBlock('ironb', hex(0xd8d8d8)),
  gold_block: () => metalBlock('goldb', hex(0xf5d33a)),
  aetherite_block: () => metalBlock('aethb', hex(0x5fe8dc)),
  obsidian: () => speckle(noise('obs', hex(0x1b1426), 0.25), 'obs', [hex(0x3a2a55), hex(0x0c0812)], 30, 2),
  glowstone: () => { const p = noise('glow', hex(0xb98a4a), 0.15); return speckle(p, 'glow', [hex(0xffe9a0), hex(0xffd060), hex(0xfff4d0)], 50, 2); },
  mud: () => speckle(noise('mud', hex(0x3c3238), 0.1), 'mud', [hex(0x2c242a), hex(0x4c4048)], 20),
  farmland_moist: () => { const p = noise('farm', hex(0x4a3020), 0.12); for (let y = 0; y < 16; y += 4) for (let x = 0; x < 16; x++) p.set(x, y, hex(0x2e1c12)); return p; },
  bookshelf: () => { const p = planks('bookshelf', hex(0xa8834d)); const cols = [0x8a2a2a, 0x2a4a8a, 0x2a7a3a, 0x8a7a2a, 0x5a2a7a]; const r = rngFor('books'); for (const y0 of [1, 9]) { for (let x = 1; x < 15; x++) { const c = hex(cols[r.int(cols.length)]); const h = 5 + r.int(2); for (let y = y0 + 6 - h; y < y0 + 6; y++) p.set(x, y, shade(c, x % 2 ? 1 : 0.85)); } } return p; },
  dirt_path: () => TEX.dirt(),
  sun: () => { const p = new Px(32, 32); for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const d = Math.max(Math.abs(x - 15.5), Math.abs(y - 15.5)); if (d < 8) p.set(x, y, [255, 250, 210, 255]); else if (d < 11) p.set(x, y, [255, 230, 140, Math.floor(200 - (d - 8) * 55)]); } return p; },
  moon: () => { const p = new Px(32, 32); for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const d = Math.max(Math.abs(x - 15.5), Math.abs(y - 15.5)); if (d < 7) { const crater = ((x - 13) ** 2 + (y - 13) ** 2 < 5) || ((x - 18) ** 2 + (y - 19) ** 2 < 3); p.set(x, y, crater ? [170, 178, 200, 255] : [220, 226, 240, 255]); } } return p; },
};
for (let i = 0; i < 8; i++) TEX[`wheat_stage${i}`] = () => plant(`wheat${i}`, wheatStage(i));
const OAKC = hex(0xa2824e), SPRC = hex(0x6b4f2e), BIRC = hex(0xc4b07a), STONEC = hex(0x8a8a8a), DARKS = hex(0x4a4a4e), IRONC = hex(0x5e5e64);
const box = (base: Px, c: RGBA, x0: number, y0: number, x1: number, y1: number) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) base.set(x, y, c); return base; };
const rim = (base: Px, c: RGBA) => { for (let i = 0; i < 16; i++) { base.set(i, 0, c); base.set(i, 15, c); base.set(0, i, c); base.set(15, i, c); } return base; };
Object.assign(TEX, {
  composter_side: () => { const p = planks('comp', OAKC); for (let x = 0; x < 16; x += 5) box(p, shade(OAKC, 0.6), x, 0, x, 15); return p; },
  composter_top: () => rim(box(planks('compt', OAKC), hex(0x5a3e22), 2, 2, 13, 13), shade(OAKC, 0.7)),
  composter_bottom: () => planks('compb', shade(OAKC, 0.85)),
  lectern_sides: () => planks('lecs', OAKC), lectern_base: () => planks('lecb', shade(OAKC, 0.9)),
  lectern_front: () => box(planks('lecf', OAKC), shade(OAKC, 0.65), 6, 2, 9, 13),
  lectern_top: () => { const p = planks('lect', OAKC); box(p, hex(0xe8e0c8), 2, 4, 13, 11); box(p, hex(0x7a5a3a), 7, 4, 8, 11); return p; },
  blast_furnace_side: () => rim(noise('bfs', DARKS, 0.08), shade(DARKS, 0.7)), blast_furnace_top: () => box(noise('bft', DARKS, 0.08), IRONC, 3, 3, 12, 12),
  blast_furnace_front: () => { const p = rim(noise('bff', DARKS, 0.08), shade(DARKS, 0.7)); box(p, IRONC, 3, 2, 12, 13); for (let x = 4; x < 12; x += 2) box(p, hex(0x1a1a1a), x, 8, x, 12); return p; },
  smoker_side: () => box(cobble('smks', STONEC, shade(STONEC, 0.6)), SPRC, 0, 12, 15, 15), smoker_top: () => box(planks('smkt', SPRC), DARKS, 4, 4, 11, 11), smoker_bottom: () => cobble('smkb', STONEC, shade(STONEC, 0.6)),
  smoker_front: () => { const p = box(cobble('smkf', STONEC, shade(STONEC, 0.6)), SPRC, 0, 12, 15, 15); box(p, hex(0x1a1a1a), 4, 5, 11, 10); return p; },
  fletching_table_side: () => planks('fls', BIRC), fletching_table_top: () => box(planks('flt', BIRC), hex(0x9a8a6a), 3, 3, 12, 12),
  fletching_table_front: () => { const p = planks('flf', BIRC); for (let i = 0; i < 6; i++) { p.set(4 + i, 4 + i, hex(0xf0f0f0)); p.set(5 + i, 4 + i, hex(0xd0d0d0)); } box(p, hex(0x4a4a4a), 10, 10, 12, 12); return p; },
  brewing_stand_base: () => noise('brb', STONEC, 0.08), brewing_stand: () => { const p = new Px(); box(p, hex(0xb08a3a), 7, 1, 8, 13); box(p, hex(0x9ad0f0), 2, 8, 4, 13); box(p, hex(0x9ad0f0), 11, 8, 13, 13); return p; },
  stonecutter_side: () => box(noise('stcs', STONEC, 0.06), shade(STONEC, 0.7), 0, 0, 15, 2), stonecutter_bottom: () => noise('stcb', STONEC, 0.06),
  stonecutter_top: () => { const p = noise('stct', STONEC, 0.06); box(p, hex(0xc8c8c8), 1, 7, 14, 8); return p; },
  barrel_side: () => { const p = planks('brs', SPRC); box(p, IRONC, 0, 2, 15, 2); box(p, IRONC, 0, 13, 15, 13); return p; },
  barrel_top: () => { const p = rim(planks('brt', SPRC), shade(SPRC, 0.6)); box(p, shade(SPRC, 0.5), 6, 6, 9, 9); return p; }, barrel_bottom: () => rim(planks('brb2', SPRC), shade(SPRC, 0.6)),
  cartography_table_side1: () => box(planks('cts1', SPRC), hex(0xe8dcb8), 3, 3, 12, 9), cartography_table_side2: () => box(planks('cts2', SPRC), hex(0xe8dcb8), 2, 2, 8, 12), cartography_table_side3: () => planks('cts3', SPRC),
  cartography_table_top: () => { const p = box(planks('ctt', SPRC), hex(0xe8dcb8), 1, 1, 14, 14); for (let i = 2; i < 14; i += 3) box(p, hex(0x7a9a5a), i, 3, i + 1, 5); box(p, hex(0x5a8ac8), 3, 9, 12, 12); return p; },
  end_sky: () => speckle(noise('endsky', hex(0x2c2a2e), 0.35), 'endsky', [hex(0x48444c), hex(0x1a181c)], 60, 2),
  end_stone: () => speckle(speckle(noise('ends', hex(0xdcdea2), 0.05), 'ends', [hex(0xc4c68a), hex(0xeef0b8)], 26, 2), 'endd', [hex(0xb2b47a)], 9),
  end_stone_bricks: () => bricks('endb', hex(0xe0e2a6), hex(0xaeb078), 8, 8),
  purpur_block: () => { const p = noise('purp', hex(0xa97ca9), 0.05); for (let i = 0; i < 16; i++) for (const k of [0, 8]) { p.set(i, k, hex(0x8a5e8c)); p.set(k, i, hex(0x8a5e8c)); p.set(i, k + 1, hex(0xc49cc4)); p.set(k + 1, i, hex(0xc49cc4)); } return p; },
  purpur_pillar_side: () => { const p = noise('purpp', hex(0xab7fab), 0.04); for (let y = 0; y < 16; y++) for (const x of [0, 3, 12, 15]) p.set(x, y, hex(x === 0 || x === 12 ? 0x8a5e8c : 0xc8a0c8)); return p; },
  purpur_pillar_top: () => { const p = noise('purpt', hex(0xab7fab), 0.04); for (const r of [0, 3, 6]) for (let i = r; i < 16 - r; i++) { const c = hex(r === 3 ? 0xc8a0c8 : 0x8a5e8c); p.set(i, r, c); p.set(r, i, c); p.set(i, 15 - r, c); p.set(15 - r, i, c); } return p; },
  end_rod: () => { const p = new Px(); for (let y = 0; y < 15; y++) { p.set(0, y, hex(0xfaf6f2)); p.set(1, y, hex(0xd8cce4)); } for (let y = 2; y < 7; y++) for (let x = 2; x < 6; x++) p.set(x, y, hex(y === 6 ? 0x9a8aa8 : 0xc0b2cc)); return p; },
  chorus_plant: () => speckle(noise('chp', hex(0x5e3a6a), 0.08), 'chp', [hex(0x8a5e96), hex(0x40264a)], 30, 2),
  chorus_flower: () => { const p = rim(speckle(noise('chf', hex(0x9a6aa8), 0.06), 'chf', [hex(0xc8a0d4)], 18, 2), hex(0x6a4078)); return box(p, hex(0xdcc0e4), 6, 6, 9, 9); },
  chorus_flower_dead: () => rim(speckle(noise('chd', hex(0x6e605c), 0.06), 'chd', [hex(0x8a7a74)], 14, 2), hex(0x4a3e3a)),
  end_portal_frame_top: () => { const p = rim(noise('efs', hex(0x3e6e5c), 0.05), hex(0xd6d8a0)); return box(box(p, hex(0x2a4a40), 3, 3, 12, 12), hex(0x101414), 4, 4, 11, 11); },
  end_portal_frame_side: () => { const p = speckle(noise('efd', hex(0xd6d8a0), 0.05), 'efd', [hex(0xbfc28a)], 18); for (let y = 0; y < 3; y++) for (let x = 0; x < 16; x++) p.set(x, y, hex(y === 2 ? 0x2a4a40 : 0x3e6e5c)); return p; },
  end_portal_frame_eye: () => { const p = new Px(); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const d = Math.hypot(x - 7.5, y - 7.5); if (d < 7.5) p.set(x, y, d < 2.2 ? hex(0x0a1a12) : d < 4.5 ? hex(0x1f7a4e) : hex(0x2fa86a)); } return p; },
  end_portal: () => { const p = new Px().fill(hex(0x060410)); const r = rngFor('endp'); for (let i = 0; i < 34; i++) { const x = r.int(16), y = r.int(16), c = [0x2fd8c8, 0x7a4ad8, 0x3a8ad8, 0xc84ad8, 0x9ae8e0][r.int(5)]; p.set(x, y, hex(c, 200 + r.int(55))); } return p; },
  dragon_egg: () => speckle(noise('egg', hex(0x120a1c), 0.12), 'egg', [hex(0x4a2a6a), hex(0x2a1640)], 24),
  shulker_box: () => { const p = rim(noise('shb', hex(0x8e5e9a), 0.05), hex(0x6a4076)); for (let x = 1; x < 15; x++) p.set(x, 5, hex(0x6a4076)); return p; },
  dragon_head: () => speckle(noise('dhd', hex(0x1c1a20), 0.1), 'dhd', [hex(0x2c2834), hex(0x0e0c10)], 30, 2),
  soul_torch: () => { const p = new Px(); for (let y = 6; y < 16; y++) { p.set(7, y, hex(0x6b5233)); p.set(8, y, hex(0x4f3b22)); } p.set(7, 6, hex(0x9af0ff)); p.set(8, 6, hex(0x60d8f0)); p.set(7, 7, hex(0x3ab8d8)); p.set(8, 7, hex(0x2a98c0)); p.set(7, 5, hex(0xe0fcff)); p.set(8, 5, hex(0x9af0ff)); return p; },
  soul_lantern: () => { const p = box(new Px(), hex(0x3a3a40), 4, 2, 11, 15); box(p, hex(0x7ae8f8), 5, 5, 10, 12); return p; },
  campfire_log: () => campLog(false, false),
  campfire_log_lit: () => campLog(true, false),
  soul_campfire_log_lit: () => campLog(true, true),
  item_frame: () => speckle(noise('ifr', hex(0x8a5428), 0.1), 'ifr', [hex(0x6a3a1a), hex(0x9a6436)], 40),
  glow_item_frame: () => speckle(noise('gifr', hex(0x2a9a8c), 0.1), 'gifr', [hex(0x1a6a62), hex(0x7af0d8)], 40),
  campfire_fire: () => flame([0xfff4b0, 0xffc040, 0xf07a18, 0xc84010]),
  soul_campfire_fire: () => flame([0xe8ffff, 0x8af0ff, 0x3ab8e0, 0x1a6aa8]),
  respawn_anchor_bottom: () => speckle(noise('rab', hex(0x15101e), 0.08), 'rab', [hex(0x2a1e3a)], 20),
  respawn_anchor_top_off: () => rim(box(speckle(noise('rat', hex(0x1c1428), 0.08), 'rat', [hex(0x3a2a4e)], 18), hex(0x0c0812), 4, 4, 11, 11), hex(0x2c2c34)),
  respawn_anchor_top: () => { const p = rim(box(speckle(noise('ratl', hex(0x1c1428), 0.08), 'ratl', [hex(0x3a2a4e)], 18), hex(0x8a3ad8), 4, 4, 11, 11), hex(0x2c2c34)); box(p, hex(0xd890ff), 6, 6, 9, 9); return p; },
  respawn_anchor_side0: () => anchorSide(0), respawn_anchor_side1: () => anchorSide(1), respawn_anchor_side2: () => anchorSide(2), respawn_anchor_side3: () => anchorSide(3), respawn_anchor_side4: () => anchorSide(4),
  lodestone_side: () => { const p = rim(noise('lds', hex(0x8e9092), 0.05), hex(0x5e6062)); for (let x = 2; x < 14; x++) { p.set(x, 7, hex(0x4a4c50)); p.set(x, 8, hex(0xb0b2b6)); } return p; },
  lodestone_top: () => { const p = rim(noise('ldt', hex(0x9a9c9e), 0.05), hex(0x5e6062)); box(p, hex(0x3a3c40), 4, 4, 11, 11); box(p, hex(0xb8bcc2), 6, 6, 9, 9); return p; },
  cauldron_side: () => rim(noise('cas', IRONC, 0.06), shade(IRONC, 0.7)), cauldron_top: () => box(rim(noise('cat', IRONC, 0.06), shade(IRONC, 1.2)), hex(0x2a2a2e), 2, 2, 13, 13), cauldron_bottom: () => noise('cab', shade(IRONC, 0.8), 0.06), cauldron_inner: () => noise('cai', shade(IRONC, 0.7), 0.06),
  loom_side: () => planks('lms', OAKC), loom_top: () => box(planks('lmt', OAKC), hex(0xe8e8e8), 2, 5, 13, 10), loom_bottom: () => planks('lmb', shade(OAKC, 0.85)),
  loom_front: () => { const p = planks('lmf', OAKC); for (let x = 3; x < 13; x += 2) box(p, hex(0xe8e8e8), x, 2, x, 13); box(p, hex(0x6a4a2a), 2, 7, 13, 8); return p; },
  grindstone_side: () => rim(noise('gss', hex(0x9a9a9a), 0.05), hex(0x6a6a6a)), grindstone_round: () => noise('gsr', hex(0x8a8a8a), 0.05), grindstone_pivot: () => planks('gsp', SPRC),
  bell_side: () => noise('bls', hex(0xe8c040), 0.05), bell_top: () => noise('blt', hex(0xd0a830), 0.05), bell_bottom: () => box(noise('blb', hex(0xd0a830), 0.05), hex(0x5a4010), 5, 5, 10, 10),
  lantern: () => { const p = box(new Px(), hex(0x3a3a40), 4, 2, 11, 15); box(p, hex(0xffc860), 5, 5, 10, 12); return p; },
  pumpkin_side: () => { const p = noise('pks', hex(0xd08a1a), 0.06); for (let x = 1; x < 16; x += 4) box(p, hex(0xb06a10), x, 0, x, 15); return p; },
  pumpkin_top: () => { const p = noise('pkt', hex(0xc8821a), 0.06); box(p, hex(0x5a7a2a), 7, 7, 8, 8); return p; },
  melon_side: () => { const p = noise('mls', hex(0x6a9a2a), 0.06); for (let x = 2; x < 16; x += 4) box(p, hex(0xb8c840), x, 0, x, 15); return p; },
  melon_top: () => { const p = noise('mlt', hex(0x7aa832), 0.06); box(p, hex(0x4a6a1a), 7, 7, 8, 8); return p; },
  cake_side: () => { const p = box(new Px(), hex(0xc88a5a), 0, 0, 15, 15); box(p, hex(0xf8f0f0), 0, 0, 15, 3); box(p, hex(0xe03030), 0, 7, 15, 8); return p; },
  cake_top: () => { const p = noise('ckt', hex(0xf8f0f0), 0.03); for (const [x, y] of [[3, 4], [10, 3], [6, 9], [12, 11], [2, 12]]) p.set(x, y, hex(0xe03030)); return p; },
  cake_bottom: () => noise('ckb', hex(0xb07a4a), 0.05), cake_inner: () => noise('cki', hex(0xd8a070), 0.05),
  granite: () => speckle(noise('gra', hex(0x9a6a56), 0.06), 'gra', [hex(0xc8907a), hex(0x6a4a3a)], 22),
  polished_granite: () => rim(noise('pgra', hex(0xa2725e), 0.03), hex(0x7a5040)),
  diorite: () => speckle(noise('dio', hex(0xc8c8c8), 0.05), 'dio', [hex(0xf0f0f0), hex(0x7a7a7a)], 26),
  polished_diorite: () => rim(noise('pdio', hex(0xd0d0d0), 0.03), hex(0x9a9a9a)),
  andesite: () => speckle(noise('and', hex(0x868686), 0.06), 'and', [hex(0xa0a0a0), hex(0x5a5a5a)], 26),
  polished_andesite: () => rim(noise('pand', hex(0x8a8c8c), 0.03), hex(0x5e6060)),
  dripstone_block: () => { const p = noise('drp', hex(0x8a6a50), 0.06); for (let y = 2; y < 16; y += 4) box(p, hex(0x6a4e3a), 0, y, 15, y); return p; },
  quartz_pillar: () => { const p = noise('qp', hex(0xece6dc), 0.02); box(p, hex(0xd8d0c4), 2, 0, 2, 15); box(p, hex(0xd8d0c4), 13, 0, 13, 15); return p; },
  quartz_pillar_top: () => rim(noise('qpt', hex(0xece6dc), 0.02), hex(0xd0c8bc)),
  dried_kelp_side: () => { const p = noise('dks', hex(0x3a4a26), 0.08); for (let y = 0; y < 16; y += 3) box(p, hex(0x2a3a1a), 0, y, 15, y); return p; },
  dried_kelp_top: () => noise('dkt', hex(0x445a2c), 0.08), dried_kelp_bottom: () => noise('dkb', hex(0x3a4a26), 0.08),
});
for (const [i, c] of (['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black'] as const).entries()) {
  const base = hex([0xf0f0f0, 0xe08030, 0xc050c0, 0x60a0e0, 0xf0d040, 0x80c030, 0xf0a0c0, 0x505058, 0xa0a0a8, 0x30a0a8, 0x8040b0, 0x3050b0, 0x806040, 0x507030, 0xb03030, 0x202024][i]);
  TEX[`${c}_glazed_terracotta`] = () => { const p = noise(`gt${c}`, base, 0.04); for (let k = 0; k < 16; k++) { p.set(k, k, shade(base, 0.6)); p.set(15 - k, k, shade(base, 1.25)); } box(p, shade(base, 0.8), 6, 6, 9, 9); return rim(p, shade(base, 0.7)); };
}
const cropStage = (key: string, stage: number, leaf: RGBA, root: RGBA | null) => () => plant(`${key}${stage}`, (p: Px, r: Rng) => {
  for (const x of [2, 5, 9, 12]) {
    const top = 15 - (2 + stage * 3) - r.int(2);
    stem(p, x, top, 15, leaf);
    p.set(x - 1, top + 1, leaf); p.set(x + 1, top + 1, leaf);
    if (root && stage === 3) { p.set(x, 15, root); p.set(x, 14, root); }
  }
});
for (let i = 0; i < 4; i++) {
  TEX[`carrots_stage${i}`] = cropStage('car', i, hex(0x4a9a2a), hex(0xf08a20));
  TEX[`potatoes_stage${i}`] = cropStage('pot', i, hex(0x5aa83a), hex(0xd8b060));
  TEX[`beetroots_stage${i}`] = cropStage('bet', i, hex(0x4a8a2a), hex(0xa02040));
}
for (let i = 0; i < 3; i++) TEX[`nether_wart_stage${i}`] = () => plant(`nwart${i}`, (p: Px, r: Rng) => {
  const stalk = hex(0x6a1418), bulb = hex(0xa8242a), hi = hex(0xd8443a);
  for (const x of [2, 6, 10, 13]) {
    const top = 15 - (3 + i * 3) - r.int(2);
    stem(p, x, top + 1, 15, stalk);
    for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [0, -1], ...(i > 0 ? [[-1, -1], [1, -1]] : []), ...(i > 1 ? [[0, -2], [-1, 1], [1, 1]] : [])]) p.set(x + dx, top + dy, (dx + dy) % 2 ? bulb : hi);
  }
});
for (let i = 0; i < 10; i++) TEX[`destroy_stage_${i}`] = () => crack(i);

function framed(base: Px, light: RGBA, dark: RGBA): Px {
  for (let i = 0; i < 16; i++) { base.set(i, 0, light); base.set(0, i, light); base.set(i, 15, dark); base.set(15, i, dark); }
  return base;
}

function cage(key: string, bar: RGBA, glow: RGBA | null): Px {
  const p = new Px();
  const r = rngFor(key);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const edge = x === 0 || y === 0 || x === 15 || y === 15;
    const grid = x % 5 === 0 || y % 5 === 0;
    if (edge || grid) p.set(x, y, shade(bar, 0.85 + r.next() * 0.3));
    else if (glow && r.next() < 0.12) p.set(x, y, glow);
  }
  return p;
}

{
  const COLOR_HEX: Record<string, number> = {
    white: 0xf0f0f0, orange: 0xf07613, magenta: 0xbd44b3, light_blue: 0x3aafd9, yellow: 0xf8c627, lime: 0x70b919, pink: 0xed8dac, gray: 0x3e4447,
    light_gray: 0x8e8e86, cyan: 0x158991, purple: 0x792aac, blue: 0x35399d, brown: 0x724728, green: 0x546d1b, red: 0xa12722, black: 0x141519,
  };
  for (const [c, hx] of Object.entries(COLOR_HEX)) {
    const col = hex(hx);
    if (!TEX[`${c}_wool`]) TEX[`${c}_wool`] = () => wool(`${c}_wool`, col);
    TEX[`${c}_terracotta`] = () => noise(`${c}_terra`, mixc(col, hex(0x985e43), 0.45), 0.05);
    TEX[`${c}_concrete`] = () => noise(`${c}_conc`, col, 0.025);
    TEX[`${c}_concrete_powder`] = () => speckle(noise(`${c}_pow`, mixc(col, hex(0xffffff), 0.12), 0.1), `${c}_pow`, [shade(col, 0.8), mixc(col, hex(0xffffff), 0.3)], 60);
    TEX[`${c}_stained_glass`] = () => { const p = new Px().fill([col[0], col[1], col[2], 120]); const e: RGBA = [col[0], col[1], col[2], 220]; for (let i = 0; i < 16; i++) { p.set(i, 0, e); p.set(0, i, e); p.set(i, 15, e); p.set(15, i, e); } for (let i = 3; i < 7; i++) p.set(i, 9 - i, [255, 255, 255, 170]); return p; };
  }
  const fl: [string, number, number][] = [['cornflower', 0x4466dd, 0x2a3a90], ['lily_of_the_valley', 0xffffff, 0xd8d8c8], ['allium', 0xb060d8, 0x7a30a8], ['azure_bluet', 0xd8e8f0, 0xf0d040],
    ['blue_orchid', 0x3aa8e8, 0x1a70b0], ['orange_tulip', 0xf07a20, 0xc05010], ['pink_tulip', 0xf0a0c0, 0xc06a8a], ['white_tulip', 0xf4f4f4, 0xb8b8b8], ['red_tulip', 0xd82a20, 0x901a12], ['oxeye_daisy', 0xf4f4f4, 0xf0c020]];
  for (const [k, a, b] of fl) TEX[k] = () => plant(k, flower(hex(a), hex(b)));
  TEX.tuff = () => speckle(noise('tuff', hex(0x6c6d66), 0.1), 'tuff', [hex(0x5a5b55), hex(0x84857c)], 40);
  TEX.polished_tuff = () => framed(noise('ptuff', hex(0x707169), 0.04), hex(0x86877e), hex(0x55564f));
  TEX.tuff_bricks = () => bricks('tuff_bricks', hex(0x6e6f68), hex(0x4f504a), 8, 8);
  TEX.chiseled_tuff = () => { const p = framed(noise('ctuff', hex(0x6c6d66), 0.05), hex(0x86877e), hex(0x4f504a)); for (let i = 4; i < 12; i++) { p.set(i, 4, hex(0x4f504a)); p.set(i, 11, hex(0x4f504a)); p.set(4, i, hex(0x4f504a)); p.set(11, i, hex(0x4f504a)); } return p; };
  TEX.chiseled_tuff_top = () => framed(noise('ctufft', hex(0x707169), 0.04), hex(0x86877e), hex(0x4f504a));
  TEX.copper_block = () => framed(speckle(noise('cub', hex(0xc06a48), 0.06), 'cub', [hex(0xe08a62), hex(0x9a4e34)], 25), hex(0xeaa07a), hex(0x8a4430));
  TEX.cut_copper = () => { const p = noise('cutc', hex(0xc06a48), 0.05); for (let i = 0; i < 16; i++) { p.set(i, 0, hex(0xe8a07a)); p.set(0, i, hex(0xe8a07a)); p.set(i, 7, hex(0x8a4430)); p.set(7, i, hex(0x8a4430)); p.set(i, 8, hex(0xe8a07a)); p.set(8, i, hex(0xe8a07a)); p.set(i, 15, hex(0x8a4430)); p.set(15, i, hex(0x8a4430)); } return p; };
  TEX.copper_lamp = () => { const p = cage('clamp', hex(0xb0603e), null); for (let y = 1; y < 15; y++) for (let x = 1; x < 15; x++) if (x % 5 && y % 5) p.set(x, y, mixc(hex(0xffe8a0), hex(0xffb040), (x + y) / 30)); return p; };
  TEX.copper_ore = () => oreTex('copper_ore', hex(0xd07a4a), hex(0x3e8a6a));
  const dust = (key: string, kind: 'dot' | 'v' | 'h') => plant(key, (p, r) => {
    const put = (x: number, y: number) => { const g = 200 + r.int(55); p.set(x, y, [g, g, g, 255]); };
    if (kind === 'dot') { for (let y = 5; y < 11; y++) for (let x = 5; x < 11; x++) if ((x - 7.5) ** 2 + (y - 7.5) ** 2 < 8 + r.next() * 3) put(x, y); }
    else for (let a = 0; a < 16; a++) for (let b = 6; b < 10; b++) if (b === 6 || b === 9 ? r.next() < 0.6 : true) { if (kind === 'v') put(b, a); else put(a, b); }
  });
  TEX.redstone_dust_dot = () => dust('rdot', 'dot');
  TEX.redstone_dust_line0 = () => dust('rl0', 'v');
  TEX.redstone_dust_line1 = () => dust('rl1', 'v');
  const rtorch = (on: boolean) => { const p = new Px(); for (let y = 6; y < 16; y++) { p.set(7, y, hex(0x6b5233)); p.set(8, y, hex(0x4f3b22)); } const c = on ? [0xff6a50, 0xe02010, 0xb01008] : [0x6a2a24, 0x4a1a16, 0x3a1210]; p.set(7, 5, hex(c[0])); p.set(8, 5, hex(c[1])); p.set(7, 6, hex(c[1])); p.set(8, 6, hex(c[2])); p.set(7, 7, hex(c[2])); p.set(8, 7, hex(c[2])); return p; };
  TEX.redstone_torch = () => rtorch(true);
  TEX.redstone_torch_off = () => rtorch(false);
  TEX.lever = () => { const p = new Px(); for (let y = 6; y < 16; y++) { p.set(7, y, hex(0x8a6a40)); p.set(8, y, hex(0x6b5233)); } p.set(7, 6, hex(0xa08050)); return p; };
  TEX.redstone_block = () => framed(speckle(noise('rblk', hex(0xb01810), 0.12), 'rblk', [hex(0xe03020), hex(0x701008)], 40), hex(0xe84030), hex(0x600808));
  TEX.redstone_lamp = () => { const p = framed(noise('rlamp', hex(0x5a3420), 0.08), hex(0x7a4a30), hex(0x2a1810)); for (let y = 3; y < 13; y++) for (let x = 3; x < 13; x++) if ((x + y) % 3 === 0) p.set(x, y, hex(0x8a5a3a)); return p; };
  TEX.redstone_lamp_on = () => { const p = framed(noise('rlampon', hex(0xd88a40), 0.08), hex(0xffe0a0), hex(0x8a4a20)); for (let y = 3; y < 13; y++) for (let x = 3; x < 13; x++) if ((x + y) % 3 === 0) p.set(x, y, hex(0xfff0c0)); return p; };
  TEX.redstone_ore = () => oreTex('redstone_ore', hex(0xd02010), hex(0x701008));
  const diode = (key: string, on: boolean, cmp: boolean) => { const p = noise(key, hex(0xa8a8a8), 0.04); for (let i = 0; i < 16; i++) { p.set(i, 0, hex(0xc8c8c8)); p.set(0, i, hex(0xc8c8c8)); p.set(i, 15, hex(0x7a7a7a)); p.set(15, i, hex(0x7a7a7a)); } const red = on ? hex(0xff3020) : hex(0x6a1810); for (let y = 2; y < 14; y++) p.set(7, y, red), p.set(8, y, red); for (const [x, y] of cmp ? [[4, 12], [11, 12], [7, 3]] : [[7, 3], [7, 10]]) { p.set(x, y, hex(on ? 0xff6a50 : 0x5a2a20)); p.set(x + 1, y, hex(on ? 0xff6a50 : 0x5a2a20)); } p.set(6, 1, hex(0x505050)); p.set(9, 1, hex(0x505050)); p.set(7, 0, hex(0x505050)); p.set(8, 0, hex(0x505050)); return p; };
  const stoneFace = (key: string) => framed(noise(key, hex(0x8a8a8a), 0.06), hex(0xa8a8a8), hex(0x5a5a5a));
  TEX.observer_side = () => { const p = stoneFace('obs_s'); for (let x = 3; x < 13; x++) p.set(x, 7, hex(0x3a3a3a)); for (let i = 0; i < 4; i++) { p.set(9 + i, 7 - i, hex(0x3a3a3a)); p.set(9 + i, 7 + i, hex(0x3a3a3a)); } return p; };
  TEX.observer_top = () => { const p = stoneFace('obs_t'); for (let y = 3; y < 13; y++) p.set(7, y, hex(0x3a3a3a)), p.set(8, y, hex(0x3a3a3a)); return p; };
  TEX.observer_front = () => { const p = stoneFace('obs_f'); for (let y = 4; y < 12; y++) for (let x = 2; x < 14; x++) if (y === 4 || y === 11 || x === 2 || x === 13) p.set(x, y, hex(0x2a2a2a)); for (let y = 6; y < 10; y++) for (let x = 4; x < 7; x++) p.set(x, y, hex(0x1a1a1a)), p.set(x + 5, y, hex(0x1a1a1a)); return p; };
  TEX.observer_back = () => { const p = stoneFace('obs_b'); for (let y = 6; y < 10; y++) for (let x = 6; x < 10; x++) p.set(x, y, hex(0x4a1a14)); return p; };
  TEX.observer_back_on = () => { const p = stoneFace('obs_bo'); for (let y = 6; y < 10; y++) for (let x = 6; x < 10; x++) p.set(x, y, hex(0xff3020)); return p; };
  const planksTop = (key: string, sticky: boolean) => { const p = noise(key, hex(0xb8945f), 0.06); for (let i = 0; i < 16; i++) { p.set(i, 0, hex(0x8a6a3e)); p.set(0, i, hex(0x8a6a3e)); p.set(i, 15, hex(0x6a4a2e)); p.set(15, i, hex(0x6a4a2e)); } for (let y = 4; y < 12; y++) for (let x = 4; x < 12; x++) p.set(x, y, sticky ? hex(0x6ac04a) : hex(0x9a9a9a)); return p; };
  TEX.piston_top = () => planksTop('pt', false);
  TEX.piston_top_sticky = () => planksTop('pts', true);
  TEX.piston_side = () => { const p = noise('ps', hex(0x7a7a7a), 0.07); for (let y = 0; y < 4; y++) for (let x = 0; x < 16; x++) p.set(x, y, shade(hex(0xb8945f), 0.9 + (x % 3) * 0.05)); for (let x = 0; x < 16; x++) p.set(x, 4, hex(0x4a4a4a)); return p; };
  TEX.piston_bottom = () => stoneFace('pb');
  TEX.piston_inner = () => { const p = stoneFace('pi'); for (let y = 6; y < 10; y++) for (let x = 6; x < 10; x++) p.set(x, y, hex(0xb8945f)); return p; };
  TEX.hopper_outside = () => framed(noise('hop', hex(0x4a4a4e), 0.06), hex(0x6a6a70), hex(0x2a2a2e));
  TEX.hopper_top = () => { const p = framed(noise('hopt', hex(0x4a4a4e), 0.06), hex(0x6a6a70), hex(0x2a2a2e)); for (let y = 2; y < 14; y++) for (let x = 2; x < 14; x++) p.set(x, y, hex(0x1e1e22)); return p; };
  TEX.hopper_inside = () => noise('hopi', hex(0x2a2a2e), 0.06);
  const disp = (key: string, round: boolean) => { const p = framed(noise(key, hex(0x7a7a7a), 0.07), hex(0x9a9a9a), hex(0x4a4a4a)); for (let y = 4; y < 12; y++) for (let x = 4; x < 12; x++) if (!round || (x - 7.5) ** 2 + (y - 7.5) ** 2 < 14) p.set(x, y, hex(0x1a1a1a)); return p; };
  TEX.dropper_front = () => disp('drp', false);
  TEX.dropper_front_vertical = () => disp('drpv', false);
  TEX.dispenser_front = () => disp('dsp', true);
  TEX.dispenser_front_vertical = () => disp('dspv', true);
  TEX.slime_block = () => { const p = noise('slime', hex(0x6ac04a, 200), 0.08); for (let i = 0; i < 16; i++) { p.set(i, 0, hex(0x8ae06a, 230)); p.set(0, i, hex(0x8ae06a, 230)); p.set(i, 15, hex(0x3a7a2a, 230)); p.set(15, i, hex(0x3a7a2a, 230)); } for (let y = 4; y < 12; y++) for (let x = 4; x < 12; x++) p.set(x, y, hex(y === 4 || x === 4 ? 0x9af07a : 0x58b03a, 240)); return p; };
  const honey = (key: string, top: boolean) => { const p = noise(key, hex(0xe8a020, 210), 0.07); for (let i = 0; i < 16; i++) { p.set(i, 0, hex(0xf8c050, 230)); p.set(0, i, hex(0xf8c050, 230)); p.set(i, 15, hex(0xa86a10, 230)); p.set(15, i, hex(0xa86a10, 230)); } if (top) for (let y = 5; y < 11; y++) for (let x = 5; x < 11; x++) p.set(x, y, hex(0xf8d070, 230)); return p; };
  TEX.honey_block_side = () => honey('hs', false);
  TEX.honey_block_top = () => honey('ht', true);
  TEX.honey_block_bottom = () => honey('hb', false);
  TEX.lapis_ore = () => oreTex('lapis_ore', hex(0x3b6fd8), hex(0x1a3a8a));
  TEX.lapis_block = () => framed(speckle(noise('lapb', hex(0x2350b8), 0.1), 'lapb', [hex(0x4a7ae8), hex(0x173a8a), hex(0xd8c070)], 34), hex(0x5a8af0), hex(0x10286a));
  TEX.enchanting_table_bottom = () => speckle(noise('obs', hex(0x1b1426), 0.25), 'obs', [hex(0x3a2a55), hex(0x0c0812)], 30, 2);
  TEX.enchanting_table_side = () => {
    const p = speckle(noise('ets', hex(0x1b1426), 0.25), 'ets', [hex(0x3a2a55), hex(0x0c0812)], 24, 2);
    for (let x = 0; x < 16; x++) { for (let y = 4; y < 7; y++) p.set(x, y, hex(y === 4 ? 0xd04040 : 0x9a1e24)); p.set(x, 7, hex(0x5a0e14)); }
    for (const x of [2, 7, 12]) for (let y = 8; y < 11; y++) p.set(x, y, hex(0x2a8a7a));
    return p;
  };
  TEX.enchanting_table_top = () => {
    const p = noise('ett', hex(0xa81e28), 0.05);
    for (let i = 0; i < 16; i++) { p.set(i, 0, hex(0x5a0e14)); p.set(i, 15, hex(0x5a0e14)); p.set(0, i, hex(0x5a0e14)); p.set(15, i, hex(0x5a0e14)); }
    for (const [cx, cy] of [[2, 2], [13, 2], [2, 13], [13, 13]]) { p.set(cx, cy, hex(0x3fd8cc)); p.set(cx - 1, cy, hex(0x1b1426)); p.set(cx + 1, cy, hex(0x1b1426)); p.set(cx, cy - 1, hex(0x1b1426)); p.set(cx, cy + 1, hex(0x1b1426)); }
    for (let y = 5; y < 11; y++) for (let x = 4; x < 12; x++) p.set(x, y, hex(x === 7 || x === 8 ? 0x6a3a1a : 0xe8dcc0));
    for (let y = 6; y < 10; y += 2) for (let x = 5; x < 11; x++) if (x !== 7 && x !== 8) p.set(x, y, hex(0x8a7a60));
    return p;
  };
  TEX.anvil = () => { const p = noise('anv', hex(0x48484c), 0.08); for (let x = 0; x < 16; x++) { p.set(x, 0, hex(0x2a2a2e)); p.set(x, 15, hex(0x2a2a2e)); } return p; };
  TEX.anvil_top = () => { const p = noise('anvt', hex(0x505056), 0.06); for (let y = 1; y < 15; y++) for (let x = 3; x < 13; x++) if ((x + y) % 7 === 0) p.set(x, y, hex(0x6a6a72)); return p; };
  TEX.netherrack = () => speckle(noise('nrk', hex(0x6f2a2a), 0.18), 'nrk', [hex(0x8a3a3a), hex(0x4a1818), hex(0x5a2020)], 46, 2);
  TEX.nether_quartz_ore = () => speckle(TEX.netherrack(), 'nqo', [hex(0xe8e0d8), hex(0xd0c4b8)], 14, 2);
  TEX.nether_gold_ore = () => speckle(TEX.netherrack(), 'ngo', [hex(0xf0cc2a), hex(0xfff2a0)], 12, 2);
  TEX.blackstone = () => speckle(noise('bks', hex(0x2a252c), 0.15), 'bks', [hex(0x3c3640), hex(0x18141a)], 30, 2);
  TEX.blackstone_top = () => speckle(noise('bkt', hex(0x302a32), 0.12), 'bkt', [hex(0x3c3640), hex(0x1c181e)], 24, 2);
  TEX.soul_sand = () => speckle(noise('sls', hex(0x51402f), 0.12), 'sls', [hex(0x2e231a), hex(0x6a5642)], 26, 2);
  TEX.soul_soil = () => noise('slo', hex(0x4b3a2c), 0.1);
  TEX.nether_bricks = () => bricks('nbr', hex(0x2d171b), hex(0x1a0c0f));
  TEX.basalt_side = () => { const p = noise('bas', hex(0x4b4b50), 0.1); for (let x = 0; x < 16; x += 3) for (let y = 0; y < 16; y++) p.set(x, y, hex(0x38383c)); return p; };
  TEX.basalt_top = () => speckle(noise('bat', hex(0x55555a), 0.1), 'bat', [hex(0x38383c)], 20, 2);
  TEX.polished_blackstone = () => framed(noise('pbk', hex(0x353039), 0.06), hex(0x45404a), hex(0x201c24));
  TEX.polished_blackstone_bricks = () => bricks('pbb', hex(0x322d36), hex(0x1a161c));
  TEX.quartz_block_side = () => noise('qzs', hex(0xece6df), 0.04);
  TEX.quartz_block_top = () => framed(noise('qzt', hex(0xece6df), 0.03), hex(0xf8f4ee), hex(0xcfc6bc));
  TEX.quartz_block_bottom = () => noise('qzb', hex(0xe6dfd6), 0.04);
  TEX.crying_obsidian = () => speckle(noise('cob', hex(0x1b1426), 0.25), 'cob', [hex(0x8a3ae8), hex(0x5a1ea8), hex(0x0c0812)], 34, 2);
  TEX.magma = () => { const p = noise('mgm', hex(0x8a2a0c), 0.2); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (((x * 7 + y * 3) % 11) < 3) p.set(x, y, hex((x + y) % 2 ? 0xf0a020 : 0xe06010)); return p; };
  TEX.nether_portal = () => { const p = new Px(); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const w = Math.sin(x * 0.9 + y * 0.5) + Math.cos(y * 1.1 - x * 0.3); const c = hex(w > 0.6 ? 0xb060ff : w > -0.4 ? 0x7a2ae0 : 0x4a10a0); c[3] = 200; p.set(x, y, c); } return p; };
  TEX.fire_0 = () => { const p = new Px(); for (let x = 0; x < 16; x++) { const h = 6 + ((x * 37 + 11) % 9); for (let y = 15; y > 15 - h; y--) p.set(x, y, hex(15 - y < 3 ? 0xfff0a0 : 15 - y < 7 ? 0xf8a020 : 0xe04a10)); } return p; };
  const stalk = (key: string, stem: RGBA, tip: RGBA, n: number, maxH: number): Px => { const p = new Px(); const r = rngFor(key); for (let i = 0; i < n; i++) { const x = 1 + r.int(14); const hgt = 4 + r.int(maxH); let cx = x; for (let k = 0; k < hgt; k++) { const y = 15 - k; if (r.next() < 0.25) cx = Math.max(0, Math.min(15, cx + (r.next() < 0.5 ? -1 : 1))); p.set(cx, y, k >= hgt - 2 ? tip : stem); } } return p; };
  const fungus = (key: string, cap: RGBA, spot: RGBA, stemC: RGBA): Px => { const p = new Px(); for (let y = 8; y < 16; y++) { p.set(7, y, stemC); p.set(8, y, shade(stemC, 0.85)); } for (let y = 3; y < 8; y++) for (let x = 3; x < 13; x++) { const dx = x - 7.5, dy = (y - 6) * 1.6; if (dx * dx + dy * dy < 26) p.set(x, y, ((x * 5 + y * 3) % 7 === 0) ? spot : shade(cap, 1 - (7 - y) * 0.04)); } return p; };
  const wart = (key: string, base: number, hi: number, lo: number): Px => speckle(speckle(noise(key, hex(base), 0.12), key, [hex(hi)], 22, 2), key + 'l', [hex(lo)], 18, 2);
  const nyliumTop = (key: string, base: number, hi: number, lo: number): Px => speckle(noise(key, hex(base), 0.14), key, [hex(hi), hex(lo)], 40, 2);
  const nyliumSide = (key: string, top: Px): Px => { const p = TEX.netherrack(); const r = rngFor(key); for (let x = 0; x < 16; x++) { const d = 3 + r.int(3); for (let y = 0; y < d; y++) p.set(x, y, top.get(x, y)); } return p; };
  const stemSide = (key: string, base: number, dark: number, glow: number): Px => { const p = noise(key, hex(base), 0.12); const r = rngFor(key); for (let x = 0; x < 16; x++) if (x % 4 === 1) for (let y = 0; y < 16; y++) p.set(x, y, hex(dark)); for (let i = 0; i < 10; i++) p.set(r.int(16), r.int(16), hex(glow)); return p; };
  const stemTop = (key: string, base: number, ring: number, core: number): Px => { const p = noise(key, hex(core), 0.1); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)); if (d > 6.5) p.set(x, y, hex(base)); else if (Math.round(d) % 3 === 0) p.set(x, y, hex(ring)); } return p; };
  TEX.shroomlight = () => { const p = noise('shl', hex(0xf0a03a), 0.1); speckle(p, 'shl', [hex(0xffd27a), hex(0xfff0b0)], 26, 2); speckle(p, 'shl2', [hex(0xc06a20)], 16, 1); return p; };
  TEX.crimson_roots = () => stalk('crr', hex(0x8e1e1e), hex(0xd8443a), 7, 6);
  TEX.warped_roots = () => stalk('wrr', hex(0x147a72), hex(0x2ec4b0), 7, 6);
  TEX.nether_sprouts = () => stalk('nsp', hex(0x167a6a), hex(0x3ad4be), 9, 3);
  TEX.crimson_fungus = () => fungus('crf', hex(0xb81e1e), hex(0xf08a4a), hex(0xd8c8a0));
  TEX.warped_fungus = () => fungus('wrf', hex(0x16907e), hex(0xf08a2a), hex(0xd8c8a0));
  TEX.weeping_vines = () => { const p = new Px(); const r = rngFor('wpv'); for (let i = 0; i < 4; i++) { let x = 3 + i * 3 + r.int(2); for (let y = 0; y < 16; y++) { if (r.next() < 0.2) x = Math.max(1, Math.min(14, x + (r.next() < 0.5 ? -1 : 1))); p.set(x, y, hex(y % 5 === 4 ? 0xe0503a : 0x9a1e1e)); if (y % 4 === 2) p.set(x + 1, y, hex(0xc02a24)); } } return p; };
  TEX.twisting_vines = () => { const p = new Px(); const r = rngFor('twv'); for (let i = 0; i < 4; i++) { let x = 3 + i * 3 + r.int(2); for (let y = 0; y < 16; y++) { if (r.next() < 0.3) x = Math.max(1, Math.min(14, x + (r.next() < 0.5 ? -1 : 1))); p.set(x, y, hex(y % 5 === 0 ? 0x5ae8d0 : 0x148a7a)); if (y % 4 === 1) p.set(x - 1, y, hex(0x20a892)); } } return p; };
  TEX.soul_fire_0 = () => { const p = new Px(); for (let x = 0; x < 16; x++) { const h = 6 + ((x * 37 + 11) % 9); for (let y = 15; y > 15 - h; y--) p.set(x, y, hex(15 - y < 3 ? 0xd0ffff : 15 - y < 7 ? 0x40e0f0 : 0x1890b0)); } return p; };
  TEX.crimson_nylium = () => nyliumTop('crn', 0x8a1616, 0xb8302a, 0x5a0c10);
  TEX.warped_nylium = () => nyliumTop('wrn', 0x167060, 0x2aa08a, 0x0c4a40);
  TEX.crimson_nylium_side = () => nyliumSide('crns', TEX.crimson_nylium());
  TEX.warped_nylium_side = () => nyliumSide('wrns', TEX.warped_nylium());
  TEX.crimson_stem = () => stemSide('crs', 0x5c1c2c, 0x401220, 0xe0503a);
  TEX.warped_stem = () => stemSide('wrs', 0x2a3e48, 0x1c2a32, 0x30e0c0);
  TEX.crimson_stem_top = () => stemTop('crst', 0x5c1c2c, 0x6a2a3a, 0x8a3a48);
  TEX.warped_stem_top = () => stemTop('wrst', 0x2a3e48, 0x2e6a6a, 0x3a8a84);
  TEX.nether_wart_block = () => wart('nwb', 0x7a0a0a, 0xa8201a, 0x520606);
  TEX.warped_wart_block = () => wart('wwb', 0x167c74, 0x2aa898, 0x0c5450);
  TEX.bone_block_side = () => { const p = noise('bbs', hex(0xe6e0c8), 0.05); for (let y = 0; y < 16; y++) { p.set(0, y, hex(0xc8c0a4)); p.set(15, y, hex(0xc8c0a4)); if (y % 5 === 2) for (let x = 1; x < 15; x++) p.set(x, y, hex(0xd2caae)); } return p; };
  TEX.bone_block_top = () => { const p = noise('bbt', hex(0xd8d0b4), 0.05); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)); if (d > 6.5) p.set(x, y, hex(0xe6e0c8)); else if (d < 2.5) p.set(x, y, hex(0xb8ae90)); } return p; };
  TEX.crimson_planks = () => planks('crp', hex(0x6a3448));
  TEX.warped_planks = () => planks('wrp', hex(0x2c7a74));
  TEX.smooth_basalt = () => noise('sbs', hex(0x48484e), 0.08);
  TEX.iron_bars = () => { const p = new Px(); for (let x = 1; x < 16; x += 4) for (let y = 0; y < 16; y++) { p.set(x, y, hex(0x8a8f96)); p.set(x + 1, y, hex(0x5c6066)); } for (let x = 0; x < 16; x++) { p.set(x, 0, hex(0x6c7076)); p.set(x, 15, hex(0x6c7076)); } return p; };
  TEX.tnt_side = () => { const p = noise('tnts', hex(0xc8301e), 0.06); for (let y = 6; y < 10; y++) for (let x = 0; x < 16; x++) p.set(x, y, hex(0xe8e0d0)); for (const [x, ch] of [[3, 1], [7, 1], [11, 1]]) for (let y = 7; y < 9; y++) p.set(x, y, hex(0x1a1a1a)), p.set(x + ch, y, hex(0x1a1a1a)); for (let x = 0; x < 16; x += 4) for (let y = 0; y < 16; y++) if (y < 6 || y > 9) p.set(x, y, hex(0x8a1a10)); return p; };
  TEX.tnt_top = () => { const p = noise('tntt', hex(0xb02a1a), 0.06); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (x % 5 === 0 || y % 5 === 0) p.set(x, y, hex(0x6a1a10)); p.set(7, 7, hex(0x3a3a3a)); p.set(8, 7, hex(0x3a3a3a)); p.set(7, 8, hex(0x3a3a3a)); p.set(8, 8, hex(0x3a3a3a)); return p; };
  TEX.tnt_bottom = () => { const p = noise('tntb', hex(0xb02a1a), 0.06); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (x % 5 === 0 || y % 5 === 0) p.set(x, y, hex(0x6a1a10)); return p; };
  TEX.rail = () => drawSprite(['..ij........ji..', '.tijttttttttjit.', '.tijttttttttjit.', '..ij........ji..', '..ij........ji..', '.tijttttttttjit.', '.tijttttttttjit.', '..ij........ji..', '..ij........ji..', '.tijttttttttjit.', '.tijttttttttjit.', '..ij........ji..', '..ij........ji..', '.tijttttttttjit.', '.tijttttttttjit.', '..ij........ji..'], { i: 0xa8a8a8, j: 0x6a6a6a, t: 0x6b4a26 });
  TEX.rail_corner = () => drawSprite(['................', '.............iii', '..........iiiiii', '........iii.ttt.', '.......iit...tt.', '......iitt...tt.', '.....iitttt..tt.', '....ii..ttt...tt', '...ii....ttt..tt', '...ittt...tt..tt', '..iitttt...tt..t', '..i..ttttt..tt.t', '..i.....ttt..tii', '.ii.......tt.ii.', '.iitttt.....ii..', '.iittttttttti...'], { i: 0xa8a8a8, t: 0x6b4a26 });
  TEX.powered_rail = () => drawSprite(['..ij........ji..', '.tijtttrrtttjit.', '.tijtttrrtttjit.', '..ij...rr...ji..', '..ij........ji..', '.tijtttrrtttjit.', '.tijtttrrtttjit.', '..ij...rr...ji..', '..ij........ji..', '.tijtttrrtttjit.', '.tijtttrrtttjit.', '..ij...rr...ji..', '..ij........ji..', '.tijtttrrtttjit.', '.tijtttrrtttjit.', '..ij...rr...ji..'], { i: 0xe8c040, j: 0xa08020, t: 0x6b4a26, r: 0x5a1010 });
  TEX.powered_rail_on = () => drawSprite(['..ij........ji..', '.tijtttrrtttjit.', '.tijtttrrtttjit.', '..ij...rr...ji..', '..ij........ji..', '.tijtttrrtttjit.', '.tijtttrrtttjit.', '..ij...rr...ji..', '..ij........ji..', '.tijtttrrtttjit.', '.tijtttrrtttjit.', '..ij...rr...ji..', '..ij........ji..', '.tijtttrrtttjit.', '.tijtttrrtttjit.', '..ij...rr...ji..'], { i: 0xe8c040, j: 0xa08020, t: 0x6b4a26, r: 0xff3020 });
  TEX.detector_rail = () => drawSprite(['..ij........ji..', '.tijtttrrtttjit.', '.tijtttrrtttjit.', '..ij...rr...ji..', '..ij........ji..', '.tijtttrrtttjit.', '.tijtttrrtttjit.', '..ij...rr...ji..', '..ij........ji..', '.tijtttrrtttjit.', '.tijtttrrtttjit.', '..ij...rr...ji..', '..ij........ji..', '.tijtttrrtttjit.', '.tijtttrrtttjit.', '..ij...rr...ji..'], { i: 0xa8a8a8, j: 0x6a6a6a, t: 0x6b4a26, r: 0x6a2a2a });
  TEX.detector_rail_on = () => drawSprite(['..ij........ji..', '.tijtttrrtttjit.', '.tijtttrrtttjit.', '..ij...rr...ji..', '..ij........ji..', '.tijtttrrtttjit.', '.tijtttrrtttjit.', '..ij...rr...ji..', '..ij........ji..', '.tijtttrrtttjit.', '.tijtttrrtttjit.', '..ij...rr...ji..', '..ij........ji..', '.tijtttrrtttjit.', '.tijtttrrtttjit.', '..ij...rr...ji..'], { i: 0xa8a8a8, j: 0x6a6a6a, t: 0x6b4a26, r: 0xff4040 });
  TEX.activator_rail = () => drawSprite(['..ij........ji..', '.tijtttrrtttjit.', '.tijtttrrtttjit.', '..ij...rr...ji..', '..ij........ji..', '.tijtttrrtttjit.', '.tijtttrrtttjit.', '..ij...rr...ji..', '..ij........ji..', '.tijtttrrtttjit.', '.tijtttrrtttjit.', '..ij...rr...ji..', '..ij........ji..', '.tijtttrrtttjit.', '.tijtttrrtttjit.', '..ij...rr...ji..'], { i: 0xa8a8a8, j: 0x6a6a6a, t: 0x6b4a26, r: 0x6a1818 });
  TEX.activator_rail_on = () => drawSprite(['..ij........ji..', '.tijtttrrtttjit.', '.tijtttrrtttjit.', '..ij...rr...ji..', '..ij........ji..', '.tijtttrrtttjit.', '.tijtttrrtttjit.', '..ij...rr...ji..', '..ij........ji..', '.tijtttrrtttjit.', '.tijtttrrtttjit.', '..ij...rr...ji..', '..ij........ji..', '.tijtttrrtttjit.', '.tijtttrrtttjit.', '..ij...rr...ji..'], { i: 0xa8a8a8, j: 0x6a6a6a, t: 0x6b4a26, r: 0xff2a2a });
  TEX.repeater = () => diode('rep', false, false);
  TEX.repeater_on = () => diode('repon', true, false);
  TEX.comparator = () => diode('cmp', false, true);
  TEX.comparator_on = () => diode('cmpon', true, true);
  const kelpTex = (key: string, top: boolean) => plant(key, (p, r) => {
    const dark = hex(0x3c6e1e), mid = hex(0x5a8f2a), lite = hex(0x7fb040);
    for (let y = top ? 3 : 0; y < 16; y++) {
      const x = 7 + Math.round(Math.sin(y * 0.7) * 1.2);
      p.set(x, y, mid); p.set(x + 1, y, dark);
      if (y % 4 === 1) { const side = (y >> 2) & 1 ? 1 : -1; for (let k = 1; k < 5; k++) p.set(x + side * k + (side > 0 ? 1 : 0), y - (k >> 1), k < 3 ? lite : mid); }
      if (r.next() < 0.15) p.set(x, y, lite);
    }
    if (top) { p.set(7, 2, lite); p.set(8, 1, mid); }
  });
  TEX.kelp = () => kelpTex('kelp', true);
  TEX.kelp_plant = () => kelpTex('kelp_plant', false);
  TEX.seagrass = () => plant('seagrass', (p, r) => {
    for (let i = 0; i < 7; i++) {
      const x0 = 1 + r.int(14), top = 2 + r.int(8), lean = r.next() < 0.5 ? -1 : 1;
      for (let y = top; y < 16; y++) p.set(x0 + (y < top + 4 ? lean : 0), y, mixc(hex(0x2f7a2a), hex(0x6cb84a), (16 - y) / 16 + r.next() * 0.2));
    }
  });
  TEX.vine = () => plant('vine', (p, r) => {
    for (let x = 0; x < 16; x++) {
      if (r.next() < 0.35) continue;
      const len = 3 + r.int(13);
      for (let y = 0; y < len; y++) p.set(x, y, [150 + r.int(60), 150 + r.int(60), 150 + r.int(60), 255]);
      if (r.next() < 0.5) p.set(x + 1, len - 1, [190, 190, 190, 255]);
    }
  });
  TEX.spawner = () => cage('spawner', hex(0x24303a), null);
  TEX.trial_spawner_side = () => cage('trials', hex(0x5a5048), hex(0xf09030));
  TEX.trial_spawner_top = () => cage('trialt', hex(0x5a5048), null);
  TEX.trial_spawner_bottom = () => framed(noise('trialb', hex(0x4a423c), 0.06), hex(0x6a6058), hex(0x2a2420));
  TEX.vault_side = () => cage('vaults', hex(0x5c5650), hex(0x8ad0ff));
  TEX.vault_top = () => framed(noise('vaultt', hex(0x625c56), 0.05), hex(0x827a72), hex(0x3a3430));
  TEX.vault_bottom = () => framed(noise('vaultb', hex(0x4a4440), 0.05), hex(0x6a6058), hex(0x2a2420));
  TEX.vault_front = () => { const p = cage('vaultf', hex(0x5c5650), null); for (let y = 6; y < 10; y++) for (let x = 6; x < 10; x++) p.set(x, y, hex(0xffd36a)); p.set(7, 10, hex(0x3a3430)); p.set(8, 10, hex(0x3a3430)); return p; };
}

{
  const T = TEX;
  const blob = (key: string, c: RGBA, c2: RGBA, holes = 0.12, p = new Px()) => { const r = rngFor(key); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { if (r.next() < holes) continue; p.set(x, y, shade(r.next() < 0.3 ? c2 : c, 0.85 + r.next() * 0.25)); } return p; };
  const dots = (p: Px, key: string, c: RGBA, n: number) => { const r = rngFor(key + 'd'); for (let i = 0; i < n; i++) { const x = r.int(15), y = r.int(15); p.set(x, y, c); p.set(x + 1, y, shade(c, 0.85)); } return p; };
  const strands = (key: string, c: RGBA, berries: RGBA | null, hang = true) => { const p = new Px(); const r = rngFor(key); for (const x0 of [3, 7, 11]) { let x = x0 + r.int(2); for (let y = 0; y < 16; y++) { p.set(x, y, shade(c, 0.8 + r.next() * 0.3)); if (r.next() < 0.35) p.set(x + 1, y, shade(c, 0.7)); if (r.next() < 0.12) x += r.int(3) - 1; x = Math.max(1, Math.min(14, x)); if (berries && r.next() < 0.12) { p.set(x - 1, y, berries); p.set(x - 1, Math.min(15, y + 1), shade(berries, 0.8)); } } } if (!hang) return p; return p; };
  const moss: RGBA = hex(0x5c7a2c), mossD: RGBA = hex(0x40581e), leaf: RGBA = hex(0x5e8a30), pink: RGBA = hex(0xd877c4);
  T.moss_block = () => speckle(noise('moss', moss, 0.12), 'moss', [mossD, hex(0x76963a)], 40);
  T.azalea_leaves = () => blob('azl', leaf, hex(0x4a6e26));
  T.flowering_azalea_leaves = () => dots(blob('fazl', leaf, hex(0x4a6e26)), 'fazl', pink, 9);
  const bush = (key: string, flowers: boolean) => { const p = new Px(); const r = rngFor(key); for (let y = 0; y < 10; y++) for (let x = 1; x < 15; x++) { const dx = (x - 7.5) / 7, dy = (y - 5) / 5.5; if (dx * dx + dy * dy < 1 && r.next() > 0.1) p.set(x, y, shade(leaf, 0.75 + r.next() * 0.35)); } for (let y = 9; y < 16; y++) { p.set(7, y, hex(0x6a5030)); p.set(8, y, hex(0x55402a)); } if (flowers) dots(p, key, pink, 6); return p; };
  T.azalea_side = () => bush('azs', false); T.flowering_azalea_side = () => bush('fazs', true);
  T.azalea_top = () => blob('azt', leaf, hex(0x4a6e26), 0.05); T.flowering_azalea_top = () => dots(blob('fazt', leaf, hex(0x4a6e26), 0.05), 'fazt', pink, 8);
  T.azalea_plant = () => { const p = new Px(); for (let y = 4; y < 16; y++) { p.set(7, y, hex(0x6a5030)); p.set(8, y, hex(0x55402a)); } return p; };
  T.rooted_dirt = () => { const p = speckle(noise('rdirt', hex(0x7a5536), 0.1), 'rdirt', [hex(0x5e4027)], 20); const r = rngFor('rroot'); for (let i = 0; i < 5; i++) { let x = r.int(16); for (let y = 0; y < 16; y++) { p.set(x, y, hex(0xa07a50)); if (r.next() < 0.3) x = (x + r.int(3) + 15) % 16; } } return p; };
  T.hanging_roots = () => strands('hroot', hex(0x9a7048), null);
  T.cave_vines = () => strands('cvine', hex(0x4f7a2a), null); T.cave_vines_plant = () => strands('cvinep', hex(0x4f7a2a), null);
  T.cave_vines_lit = () => strands('cvine', hex(0x4f7a2a), hex(0xffb030)); T.cave_vines_plant_lit = () => strands('cvinep', hex(0x4f7a2a), hex(0xffb030));
  T.spore_blossom = () => { const p = new Px(); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const dx = x - 7.5, dy = y - 7.5, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx); const petal = 4.5 + Math.cos(a * 4) * 2.5; if (d < petal) p.set(x, y, d < 2 ? hex(0xf0d0e8) : shade(pink, 0.8 + (d / petal) * 0.3)); } return p; };
  T.spore_blossom_base = () => blob('sbb', leaf, hex(0x3e6020), 0.4);
  T.big_dripleaf_top = () => { const p = new Px(); const r = rngFor('bdt'); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const dx = (x - 7.5) / 7.8, dy = (y - 7.5) / 7.8; if (dx * dx + dy * dy < 1) p.set(x, y, (x === 7 || x === 8) ? hex(0x5e9a2a) : shade(hex(0x6eaa36), 0.85 + r.next() * 0.2)); } return p; };
  T.big_dripleaf_side = () => { const p = new Px(); for (let x = 0; x < 16; x++) { p.set(x, 0, hex(0x5e9a2a)); p.set(x, 1, hex(0x4e8a22)); } return p; };
  T.big_dripleaf_stem = () => { const p = new Px(); for (let y = 0; y < 16; y++) { p.set(7, y, hex(0x5e9a2a)); p.set(8, y, hex(0x4a7e20)); } return p; };
  T.small_dripleaf_side = () => { const p = new Px(); for (let y = 2; y < 16; y++) p.set(7 + ((y >> 2) & 1), y, hex(0x5e9a2a)); for (const [cx, cy] of [[4, 4], [11, 3], [6, 9]]) for (let y = -2; y <= 2; y++) for (let x = -3; x <= 3; x++) if (x * x / 9 + y * y / 4 < 1) p.set(cx + x, cy + y, hex(0x6eaa36)); return p; };
  T.small_dripleaf_top = () => T.big_dripleaf_top(); T.small_dripleaf_stem_top = () => T.small_dripleaf_side(); T.small_dripleaf_stem_bottom = () => T.big_dripleaf_stem();
  T.glow_lichen = () => { const p = new Px(); const r = rngFor('glich'); for (let i = 0; i < 9; i++) { const cx = r.int(16), cy = r.int(16), rad = 1 + r.int(3); for (let y = -rad; y <= rad; y++) for (let x = -rad; x <= rad; x++) if (x * x + y * y <= rad * rad && r.next() > 0.25) p.set((cx + x + 16) % 16, (cy + y + 16) % 16, r.next() < 0.3 ? hex(0xb8f0d0) : hex(0x6ab890)); } return p; };
  const drip = (up: boolean, thick: number) => { const p = new Px(); const r = rngFor(`drip${up}${thick}`); const base = [2, 3, 4.5, 5.5, 6.5][thick], tip = [0.5, 0.5, 2, 4.5, 5.5][thick]; for (let y = 0; y < 16; y++) { const t = up ? y / 15 : 1 - y / 15; const w = tip + (base - tip) * t; if (thick <= 1 && t < 0.3) continue; for (let x = 0; x < 16; x++) if (Math.abs(x - 7.5) < w) p.set(x, y, shade(hex(0x8a6a50), 0.8 + r.next() * 0.3)); } return p; };
  ['up', 'down'].forEach((d, di) => ['tip_merge', 'tip', 'frustum', 'middle', 'base'].forEach((t, ti) => { T[`pointed_dripstone_${d}_${t}`] = () => drip(di === 0, ti); }));
  const sk: RGBA = hex(0x0b2a32), skL: RGBA = hex(0x2fd6d6);
  T.sculk = () => speckle(noise('sculk', sk, 0.18), 'sculk', [hex(0x0f3c46), skL], 14);
  T.sculk_vein = () => { const p = new Px(); const r = rngFor('svein'); for (let i = 0; i < 6; i++) { let x = r.int(16), y = r.int(16); for (let k = 0; k < 10; k++) { p.set(x, y, r.next() < 0.15 ? skL : sk); x = (x + r.int(3) + 15) % 16; y = (y + r.int(3) + 15) % 16; } } return p; };
  T.sculk_sensor_side = () => { const p = noise('sss', sk, 0.15); for (let x = 0; x < 16; x++) { p.set(x, 0, skL); if (x % 4 === 1) for (let y = 1; y < 6; y++) p.set(x, y, hex(0x146470)); } return p; };
  T.sculk_sensor_top = () => { const p = noise('sst', sk, 0.15); for (let i = 3; i < 13; i++) { p.set(i, 3, skL); p.set(i, 12, skL); p.set(3, i, skL); p.set(12, i, skL); } return p; };
  T.sculk_sensor_bottom = () => noise('ssb', hex(0x10343c), 0.1);
  T.sculk_sensor_tendril_inactive = () => { const p = new Px(); for (let y = 6; y < 16; y++) { p.set(7, y, hex(0x146470)); p.set(8, y, hex(0x0f5058)); } return p; };
  T.sculk_sensor_tendril_active = () => { const p = new Px(); for (let y = 6; y < 16; y++) { p.set(7, y, skL); p.set(8, y, hex(0x22b0b0)); } return p; };
  T.sculk_shrieker_side = () => { const p = noise('shs', hex(0xd8d0b8), 0.08); for (let y = 8; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, shade(sk, 0.9 + (x % 3) * 0.05)); return p; };
  T.sculk_shrieker_top = () => { const p = noise('sht', hex(0xd8d0b8), 0.08); for (let y = 4; y < 12; y++) for (let x = 4; x < 12; x++) p.set(x, y, hex(0x0a1a20)); return p; };
  T.sculk_shrieker_bottom = () => noise('shb', sk, 0.12);
  T.sculk_shrieker_inner_top = () => noise('shi', hex(0x0a1a20), 0.1); T.sculk_shrieker_can_summon_inner_top = () => speckle(noise('shc', hex(0x0a1a20), 0.1), 'shc', [skL], 6);
  T.sculk_catalyst_side = () => { const p = noise('scs', sk, 0.15); for (let y = 0; y < 5; y++) for (let x = 0; x < 16; x++) p.set(x, y, shade(hex(0xd8d0b8), 0.9 + (y & 1) * 0.08)); return p; };
  T.sculk_catalyst_top = () => { const p = noise('sct', hex(0xd8d0b8), 0.08); for (let y = 5; y < 11; y++) for (let x = 5; x < 11; x++) p.set(x, y, (x + y) & 1 ? skL : hex(0x16a0a0)); return p; };
  T.sculk_catalyst_bottom = () => noise('scb', sk, 0.12);
  T.deepslate = () => { const p = noise('dslate', hex(0x4a4a50), 0.08); const r = rngFor('dsl'); for (let y = 0; y < 16; y += 3 + r.int(2)) for (let x = 0; x < 16; x++) if (r.next() < 0.7) p.set(x, y, hex(0x3a3a40)); return p; };
  T.deepslate_top = () => speckle(noise('dslatet', hex(0x4c4c52), 0.08), 'dslatet', [hex(0x3a3a40)], 30);
  T.cobbled_deepslate = () => cobble('cdslate', hex(0x505056), hex(0x2c2c30));
}

function dragonScale(key: string): Px {
  const p = speckle(noise(key, hex(0x1e1b24), 0.12), key, [hex(0x2e2a38), hex(0x0e0c12), hex(0x3a3446)], 34, 2);
  for (let y = 0; y < 16; y += 4) for (let x = (y >> 2) & 1 ? 2 : 0; x < 16; x += 4) p.set(x, y, hex(0x0a090c));
  if (key === 'dh_head_f') for (const ex of [2, 11]) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 3; dx++) p.set(ex + dx, 5 + dy, dx === 1 && dy === 0 ? hex(0xd8c8f0) : hex(0x8a6ac0));
  if (key === 'dh_nostril' || key === 'dh_lip_f') for (const ex of [3, 11]) p.set(ex, 2, hex(0x050406));
  if (key === 'dh_jaw_t' || key === 'dh_lip_b') for (let x = 1; x < 15; x += 2) p.set(x, 15, hex(0xd8d0c0));
  return p;
}

export function defaultBlockTexture(key: string): Px {
  const f = TEX[key];
  if (f) return f();
  if (key.startsWith('dh_')) return dragonScale(key);
  const p = new Px().fill([255, 0, 255, 255]);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (((x >> 3) + (y >> 3)) & 1) p.set(x, y, [0, 0, 0, 255]);
  return p;
}

export function hasDefaultTexture(key: string): boolean { return key in TEX; }
export const DEFAULT_TEXTURE_KEYS = Object.keys(TEX);

const TOOL_SHAPES: Record<string, string[]> = {
  pickaxe: [
    '................', '................', '...bbbbbbbb.....', '..bcccccccbb....', '..bbb...hHbcb...', '.......hH..bcb..',
    '......hH....bcb.', '.....hH......bb.', '....hH..........', '...hH...........', '..hH............', '.hH.............',
    'hH..............', 'h...............', '................', '................',
  ],
  axe: [
    '................', '................', '.......bbb......', '......bcccb.....', '.....bccbcb.....', '.....bcbhHb.....',
    '......bhH.......', '.....hH.........', '....hH..........', '...hH...........', '..hH............', '.hH.............',
    'hH..............', 'h...............', '................', '................',
  ],
  shovel: [
    '................', '..........bbb...', '.........bcccb..', '........bcccb...', '........bccb....', '.......hbbb.....',
    '......hH........', '.....hH.........', '....hH..........', '...hH...........', '..hH............', '.hH.............',
    'hH..............', 'h...............', '................', '................',
  ],
  sword: [
    '..............bb', '.............bcb', '............bcb.', '...........bcb..', '..........bcb...', '.........bcb....',
    '........bcb.....', '...b...bcb......', '....b.bcb.......', '.....bcb........', '.....hb.........', '....hH.b........',
    '...hH...b.......', '..hH............', '.bb.............', '................',
  ],
  hoe: [
    '................', '................', '......bbbbb.....', '.....bcccbbb....', '..........hHb...', '.........hH.....',
    '........hH......', '.......hH.......', '......hH........', '.....hH.........', '....hH..........', '...hH...........',
    '..hH............', '.hH.............', '.h..............', '................',
  ],
};

const ARMOR_SHAPES: string[][] = [
  ['................', '................', '................', '....bbbbbbbb....', '...bccccccccb...', '...bcbbbbbbcb...', '...bcb....bcb...', '...bb......bb...', '................', '................', '................', '................', '................', '................', '................', '................'],
  ['................', '...bbb....bbb...', '..bccbbbbbbccb..', '..bcccccccccb...', '..bbcccccccbb...', '....bcccccb.....', '....bcccccb.....', '....bcccccb.....', '....bcccccb.....', '....bbbbbbb.....', '................', '................', '................', '................', '................', '................'],
  ['................', '................', '....bbbbbbbb....', '....bccccccb....', '....bccbbccb....', '....bcb..bcb....', '....bcb..bcb....', '....bcb..bcb....', '....bcb..bcb....', '....bbb..bbb....', '................', '................', '................', '................', '................', '................'],
  ['................', '................', '................', '................', '................', '...bbb....bbb...', '...bcb....bcb...', '...bcb....bcb...', '..bccb...bccb...', '..bbbb...bbbb...', '................', '................', '................', '................', '................', '................'],
];

const BOWL_ROWS = ['................', '................', '................', '................', '................', '................', '.aaaaaaaaaaaaaa.', '.acccccccccccca.', '.abbbbbbbbbbbba.', '..abbbbbbbbbba..', '..abbbbbbbbbba..', '...abbbbbbbba...', '....aaaaaaaa....', '................', '................', '................'];
const SPRITES: Record<string, { rows: string[]; pal: Record<string, number> }> = {
  stick: { rows: ['................', '................', '................', '...........hH...', '..........hH....', '.........hH.....', '........hH......', '.......hH.......', '......hH........', '.....hH.........', '....hH..........', '...hH...........', '...h............', '................', '................', '................'], pal: { h: 0x5e4527, H: 0x8a6a3e } },
  coal: { rows: ['................', '................', '.....aaaa.......', '....abbbba......', '...abbcbbba.....', '...abbbbbbaa....', '..abcbbbbbbba...', '..abbbbbbcbba...', '..abbbbbbbbba...', '...abbcbbbba....', '....abbbbba.....', '.....aaaaa......', '................', '................', '................', '................'], pal: { a: 0x0e0e0e, b: 0x2b2b2b, c: 0x555555 } },
  charcoal: { rows: ['................', '................', '.....aaaa.......', '....abbbba......', '...abbcbbba.....', '...abbbbbbaa....', '..abcbbbbbbba...', '..abbbbbbcbba...', '..abbbbbbbbba...', '...abbcbbbba....', '....abbbbba.....', '.....aaaaa......', '................', '................', '................', '................'], pal: { a: 0x1e140c, b: 0x3a2a1c, c: 0x5e4a36 } },
  ingot: { rows: ['................', '................', '................', '................', '.......aaaaaa...', '.....aacccccba..', '...aacccccccba..', '.aaccccccccba...', 'abbbbbbbbbba....', 'abbbbbbbbba.....', '.aaaaaaaaa......', '................', '................', '................', '................', '................'], pal: { a: 0x555555, b: 0x999999, c: 0xdddddd } },
  gem: { rows: ['................', '................', '.....aaaaaa.....', '....acccccba....', '...accbbbbbba...', '..acbbbbbbbbba..', '..abbbbbbbbbba..', '...abbbbbbbba...', '....abbbbbba....', '.....abbbba.....', '......abba......', '.......aa.......', '................', '................', '................', '................'], pal: { a: 0x0e5f5a, b: 0x3fd8cc, c: 0xb8fff8 } },
  flint: { rows: ['................', '................', '.......aa.......', '......abba......', '.....abccba.....', '....abccbbba....', '....abcbbbba....', '...abbbbbbbba...', '...abbbbbbba....', '....abbbbba.....', '.....aaaaa......', '................', '................', '................', '................', '................'], pal: { a: 0x1a1a1a, b: 0x3e3e3e, c: 0x6a6a6a } },
  feather: { rows: ['................', '...........aa...', '..........abba..', '.........abbba..', '........abbba...', '.......abbba....', '......abbba.....', '.....abbba......', '....abbba.......', '...abbba........', '...hbba.........', '..h.aa..........', '.h..............', '................', '................', '................'], pal: { a: 0x8ab070, b: 0xe8f0e0, h: 0x707070 } },
  string: { rows: ['................', '................', '...........a....', '..........a.....', '.........a......', '....aaa.a.......', '...a...a........', '...a..a.a.......', '....aa...a......', '..........a.....', '...........a....', '............a...', '................', '................', '................', '................'], pal: { a: 0xeeeeee } },
  bone: { rows: ['................', '.............aa.', '............abba', '...........abba.', '..........aba...', '.........aba....', '........aba.....', '.......aba......', '......aba.......', '.....aba........', '....aba.........', '.abba...........', 'abba............', '.aa.............', '................', '................'], pal: { a: 0xb8b0a0, b: 0xf2eedd } },
  leather: { rows: ['................', '................', '...aaa....aaa...', '..abbbaaaabbba..', '..abbbbbbbbbba..', '...abbbcbbbba...', '...abbbbbbbba...', '...abbcbbbbba...', '...abbbbbcbba...', '..abbbbbbbbbba..', '..abbbaaaabbba..', '...aaa....aaa...', '................', '................', '................', '................'], pal: { a: 0x5a3416, b: 0x9a5e2e, c: 0x7a4620 } },
  apple: { rows: ['................', '........h.......', '.......hgg......', '.......h........', '....aaa.aaa.....', '...abbbabbba....', '..abcbbbbbbba...', '..abcbbbbbbba...', '..abbbbbbbbba...', '..abbbbbbbbba...', '...abbbbbbba....', '....abbbbba.....', '.....aaaaa......', '................', '................', '................'], pal: { a: 0x8a1010, b: 0xd8242a, c: 0xff8888, h: 0x5a3a1a, g: 0x3a9a2a } },
  bread: { rows: ['................', '................', '................', '.......aaaaa....', '.....aabcbcba...', '...aabbbbbbbba..', '..abcbcbcbbbba..', '.abbbbbbbbbba...', '.abbbbbbbbba....', '.aabbbbbbaa.....', '...aaaaaa.......', '................', '................', '................', '................', '................'], pal: { a: 0x7a4a14, b: 0xc8882e, c: 0xe8b860 } },
  meat: { rows: ['................', '................', '.........aaa....', '.......aabbba...', '.....aabbcbbba..', '....abbbbbbbba..', '...abbcbbbbba...', '...abbbbbbba....', '..abbbbbbaa.....', '..abbbbaa.......', '.hhaaaa.........', 'hHh.............', '.h..............', '................', '................', '................'], pal: { a: 0x7a2020, b: 0xd86a6a, c: 0xf8b0b0, h: 0xe8e0d0, H: 0xfff8f0 } },
  cooked: { rows: ['................', '................', '.........aaa....', '.......aabbba...', '.....aabbcbbba..', '....abbbbbbbba..', '...abbcbbbbba...', '...abbbbbbba....', '..abbbbbbaa.....', '..abbbbaa.......', '.hhaaaa.........', 'hHh.............', '.h..............', '................', '................', '................'], pal: { a: 0x4a2410, b: 0xa0602a, c: 0xd09050, h: 0xe8e0d0, H: 0xfff8f0 } },
  seeds: { rows: ['................', '................', '................', '....a....a......', '...aba..aba.....', '....a...aba..a..', '.........a..aba.', '..a....a.....a..', '.aba..aba.......', '..a...aba..a....', '.......a..aba...', '...a.......a....', '..aba...........', '...a............', '................', '................'], pal: { a: 0x3a6a1a, b: 0x7aba3a } },
  wheat: { rows: ['................', '.........a..a...', '........aba.ab..', '.......abaaba...', '......abaabaa...', '.....a.abaab....', '....a..aaba.....', '...a....aa......', '..a.....a.......', '.a.....a........', 'a.....a.........', '.....a..........', '................', '................', '................', '................'], pal: { a: 0xb08a22, b: 0xe8c860 } },
  clay_ball: { rows: ['................', '................', '................', '......aaaa......', '....aabbbbaa....', '...abbcbbbbba...', '...abcbbbbbba...', '...abbbbbbbba...', '...abbbbbbbba...', '....abbbbbba....', '.....aaaaaa.....', '................', '................', '................', '................', '................'], pal: { a: 0x6a7080, b: 0x9ea4b0, c: 0xc8ccd8 } },
  brick: { rows: ['................', '................', '................', '................', '.......aaaaaa...', '.....aacccccba..', '...aacccccccba..', '.aaccccccccba...', 'abbbbbbbbbba....', 'abbbbbbbbba.....', '.aaaaaaaaa......', '................', '................', '................', '................', '................'], pal: { a: 0x5a2a1a, b: 0x8a4a2e, c: 0xb8664a } },
  bucket: { rows: ['................', '................', '....aaaaaaaa....', '...a........a...', '..a..........a..', '..abbbbbbbbbba..', '..accccccccbba..', '...abcbbbbbba...', '...abbbbbbbba...', '....abbbbbba....', '....abbbbbba....', '.....aaaaaa.....', '................', '................', '................', '................'], pal: { a: 0x3a3a3a, b: 0x9a9a9a, c: 0xd8d8d8 } },
  water_bucket: { rows: ['................', '................', '....aaaaaaaa....', '...a........a...', '..a..........a..', '..awwwwwwwwwwa..', '..accccccccbba..', '...abcbbbbbba...', '...abbbbbbbba...', '....abbbbbba....', '....abbbbbba....', '.....aaaaaa.....', '................', '................', '................', '................'], pal: { a: 0x3a3a3a, b: 0x9a9a9a, c: 0xd8d8d8, w: 0x3060e0 } },
  lava_bucket: { rows: ['................', '................', '....aaaaaaaa....', '...a........a...', '..a..........a..', '..awwwwwwwwwwa..', '..accccccccbba..', '...abcbbbbbba...', '...abbbbbbbba...', '....abbbbbba....', '....abbbbbba....', '.....aaaaaa.....', '................', '................', '................', '................'], pal: { a: 0x3a3a3a, b: 0x9a9a9a, c: 0xd8d8d8, w: 0xff7010 } },
  rotten_flesh: { rows: ['................', '................', '.....aaa..aa....', '....abbba.aba...', '...abbcbbabba...', '...abbbbbbbba...', '..abcbbbbcbba...', '..abbbbbbbba....', '..abbcbbbbba....', '...abbbbbba.....', '....aaabbba.....', '.......aaa......', '................', '................', '................', '................'], pal: { a: 0x4a3a1a, b: 0x8a6a2a, c: 0x5a7a2a } },
  paper: { rows: ['................', '................', '...aaaaaaaaa....', '...abbbbbbbba...', '...abccccccba...', '...abbbbbbbba...', '...abccccccba...', '...abbbbbbbba...', '...abcccccbba...', '...abbbbbbbba...', '...aaaaaaaaaa...', '................', '................', '................', '................', '................'], pal: { a: 0xb8b0a0, b: 0xf8f4ea, c: 0xc8c0b0 } },
  book: { rows: ['................', '................', '...aaaaaaaaa....', '..abbbbbbbbba...', '..abccccccbba...', '..abbbbbbbbba...', '..abbbcccbbba...', '..abbbbbbbbba...', '..abbbbbbbbba...', '..aaaaaaaaaaa...', '..awwwwwwwwwa...', '...aaaaaaaaa....', '................', '................', '................', '................'], pal: { a: 0x3a1e0e, b: 0x7a3a1a, c: 0xc89a3a, w: 0xf0ead8 } },
  dye: { rows: ['................', '................', '................', '.......aa.......', '......abba......', '.....abbbba.....', '....abbcbbba....', '....abbbbbba....', '....abbbbbba....', '.....abbbba.....', '......aaaa......', '................', '................', '................', '................', '................'], pal: { a: 0x2a2a2a, b: 0xffffff, c: 0xffffff } },
  arrow: { rows: ['..............aa', '.............aba', '............aba.', '...........hh...', '..........hh....', '.........hh.....', '........hh......', '.......hh.......', '......hh........', '.....hh.........', '....hh..........', '.fffh...........', '.ff.............', '.f.f............', '................', '................'], pal: { a: 0x4a4a4a, b: 0x9a9a9a, h: 0x7a5a36, f: 0xe8e8e8 } },
  door_item: { rows: ['................', '.....aaaaaa.....', '.....abbbba.....', '.....ab..ba.....', '.....ab..ba.....', '.....abbbba.....', '.....abbbba.....', '.....abbbba.....', '.....abbbca.....', '.....abbbba.....', '.....abbbba.....', '.....abbbba.....', '.....abbbba.....', '.....aaaaaa.....', '................', '................'], pal: { a: 0x5d4224, b: 0xa07a45, c: 0x3a3a3a } },
};

const MAT_PAL: Record<string, [number, number, number]> = {
  wooden: [0x4a3418, 0x8a6a3e, 0xb08d57], stone: [0x3a3a3a, 0x7a7a7a, 0xa8a8a8], iron: [0x4a4a4a, 0xc8c8c8, 0xf4f4f4],
  golden: [0x8a6a10, 0xf0cc2a, 0xfff2a0], aetherite: [0x0e5f5a, 0x3fd8cc, 0xb8fff8], leather: [0x5a3416, 0x9a5e2e, 0xb87a48],
  gold: [0x8a6a10, 0xf0cc2a, 0xfff2a0], cinderite: [0x1e1a20, 0x4a4248, 0x7a6e78], copper: [0x6a3018, 0xc06a48, 0xf0b090],
};

function drawSprite(rows: string[], pal: Record<string, number>): Px {
  const p = new Px();
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const ch = rows[y]?.[x] ?? '.';
    if (ch === '.' || pal[ch] === undefined) continue;
    p.set(x, y, hex(pal[ch]));
  }
  return p;
}

const ITEM_MAP: Record<string, () => Px> = {
  shield: () => { const p = new Px(); const r = rngFor('shield'); for (let y = 1; y < 15; y++) { const w = y < 11 ? 5.5 : 5.5 - (y - 10) * 1.2; for (let x = 0; x < 16; x++) { const d = Math.abs(x - 7.5); if (d >= w) continue; const rim = d > w - 1.1 || y === 1 || y === 14; p.set(x, y, rim ? shade(hex(0x8a8a90), 0.85 + r.next() * 0.25) : shade(hex(x % 5 === 2 ? 0x7a5432 : 0x8f6a40), 0.85 + r.next() * 0.2)); } } for (let y = 5; y < 10; y++) p.set(7, y, hex(0x9a9aa2)); return p; },
  ender_eye: () => { const p = new Px(); for (let y = 3; y < 13; y++) for (let x = 3; x < 13; x++) { const d = Math.hypot(x - 7.5, y - 7.5); if (d < 4.8) p.set(x, y, Math.abs(x - 7.5) < 0.8 && d < 3.6 ? hex(0x0a1410) : d < 3.2 ? hex(0x5ad09a) : hex(0x1f6e4a)); } p.set(6, 5, hex(0xd8fff0)); return p; },
  end_crystal: () => { const p = new Px(); for (let i = 2; i < 14; i++) for (const k of [2, 13]) { p.set(i, k, hex(0xd8e8f0)); p.set(k, i, hex(0xd8e8f0)); } for (let y = 5; y < 11; y++) for (let x = 5; x < 11; x++) p.set(x, y, hex((x + y) % 2 ? 0xf080c0 : 0xd84aa0)); p.set(6, 6, hex(0xffd8f0)); return p; },
  chorus_fruit: () => { const p = new Px(); for (let y = 3; y < 14; y++) for (let x = 3; x < 13; x++) { const d = Math.hypot(x - 7.5, y - 8.5); if (d < 5) p.set(x, y, (x * 3 + y * 5) % 7 < 2 ? hex(0xa878b8) : hex(0x7a4a8a)); } p.set(7, 2, hex(0x5a3a2a)); p.set(8, 2, hex(0x6a8a3a)); return p; },
  popped_chorus_fruit: () => { const p = new Px(); for (let y = 3; y < 14; y++) for (let x = 2; x < 14; x++) { const d = Math.hypot(x - 7.5, y - 8.5); if (d < 5.6) p.set(x, y, (x * 5 + y * 3) % 6 < 2 ? hex(0xe8d0ee) : hex(0xc8a0d0)); } return p; },
  shulker_shell: () => { const p = new Px(); for (let y = 4; y < 13; y++) for (let x = 2; x < 14; x++) { const d = Math.hypot(x - 7.5, (y - 12) * 1.3); if (d < 6) p.set(x, y, y === 12 ? hex(0x5e3a6a) : (x + y) % 4 === 0 ? hex(0xa878b4) : hex(0x8e5e9a)); } return p; },
  elytra: () => { const p = new Px(); for (let y = 1; y < 15; y++) for (let x = 1; x < 15; x++) { const side = x < 8 ? 7.5 - x : x - 7.5; const edge = 1 + (y / 15) * 6.5; if (side < 0.5 || side > edge) continue; p.set(x, y, side > edge - 1 ? hex(0x6a6478) : (y % 3 === 0) ? hex(0x9a94aa) : hex(0xb8b2c8)); } return p; },
  firework_rocket: () => { const p = new Px(); for (let y = 4; y < 11; y++) for (let x = 6; x < 10; x++) p.set(x, y, x === 6 ? hex(0x8a1a1a) : hex(0xd83a2a)); for (let x = 6; x < 10; x++) { p.set(x, 3, hex(0xf0e8d0)); p.set(x, 4, hex(0xe8d8b0)); } p.set(7, 2, hex(0xf0e8d0)); p.set(8, 2, hex(0xf0e8d0)); for (let y = 11; y < 15; y++) p.set(8, y, hex(0x8a6a3e)); return p; },
  experience_bottle: () => { const p = new Px(); for (let y = 5; y < 15; y++) for (let x = 4; x < 12; x++) { const d = Math.hypot(x - 7.5, y - 10); if (d < 4) p.set(x, y, d > 3.2 ? hex(0xd8f0e0, 220) : hex((x + y) % 4 === 0 ? 0xf0ff90 : y < 8 ? 0x9af060 : 0x4ab830)); } for (let y = 2; y < 6; y++) for (let x = 6; x < 10; x++) p.set(x, y, y === 2 ? hex(0x8a6a3e) : hex(0xd8f0e0, 220)); return p; },
  dragon_breath: () => { const p = new Px(); for (let y = 5; y < 15; y++) for (let x = 4; x < 12; x++) { const d = Math.hypot(x - 7.5, y - 10); if (d < 4) p.set(x, y, d > 3.2 ? hex(0xd8e8f0, 220) : hex(y < 8 ? 0xf0a0d0 : 0xc84aa0)); } for (let y = 2; y < 6; y++) for (let x = 6; x < 10; x++) p.set(x, y, y === 2 ? hex(0x8a6a3e) : hex(0xd8e8f0, 220)); return p; },
  ender_pearl: () => { const p = new Px(); for (let y = 3; y < 13; y++) for (let x = 3; x < 13; x++) { const d = Math.hypot(x - 7.5, y - 7.5); if (d < 4.8) p.set(x, y, d < 1.6 ? hex(0x9ff0d8) : d < 3.2 ? hex(0x1f8a6e) : hex(0x0f4a3e)); } p.set(6, 5, hex(0xd8fff2)); return p; },
  pointed_dripstone: () => { const p = new Px(); const r = rngFor('dripitem'); for (let y = 1; y < 16; y++) { const w = 0.6 + (y / 15) * 4.2; for (let x = 0; x < 16; x++) if (Math.abs(x - 7.5) < w) p.set(x, y, shade(hex(y % 4 === 0 ? 0x7a5c44 : 0x8a6a50), 0.8 + r.next() * 0.3)); } return p; },
  stick: () => drawSprite(SPRITES.stick.rows, SPRITES.stick.pal),
  coal: () => drawSprite(SPRITES.coal.rows, SPRITES.coal.pal),
  charcoal: () => drawSprite(SPRITES.charcoal.rows, SPRITES.charcoal.pal),
  iron_ingot: () => drawSprite(SPRITES.ingot.rows, SPRITES.ingot.pal),
  gold_ingot: () => drawSprite(SPRITES.ingot.rows, { a: 0x8a6a10, b: 0xd8b020, c: 0xfff0a0 }),
  aetherite: () => drawSprite(SPRITES.gem.rows, SPRITES.gem.pal),
  flint: () => drawSprite(SPRITES.flint.rows, SPRITES.flint.pal),
  feather: () => drawSprite(SPRITES.feather.rows, SPRITES.feather.pal),
  string: () => drawSprite(SPRITES.string.rows, SPRITES.string.pal),
  bone: () => drawSprite(SPRITES.bone.rows, SPRITES.bone.pal),
  bone_meal: () => drawSprite(['................', '................', '......a.........', '.....aba..a.....', '....abba.aba....', '.....aa..ab.....', '..a.......a.a...', '.aba..aa...aba..', '..a..abba...a...', '.....abba.......', '......aa..aa....', '...a.....abba...', '..aba.....aa....', '...a............', '................', '................'], { a: 0xc8c0aa, b: 0xf8f4e8 }),
  leather: () => drawSprite(SPRITES.leather.rows, SPRITES.leather.pal),
  apple: () => drawSprite(SPRITES.apple.rows, SPRITES.apple.pal),
  golden_apple: () => drawSprite(SPRITES.apple.rows, Object.fromEntries(Object.entries(SPRITES.apple.pal).map(([k, v]) => [k, k === 'g' || k === 'h' ? v : (v & 0x0000ff) < 0x40 ? 0xe8b020 : 0xfff090]))),
  bowl: () => drawSprite(BOWL_ROWS, { a: 0x4a2c10, b: 0x8a5a2a, c: 0x4a2c10 }),
  mushroom_stew: () => drawSprite(BOWL_ROWS, { a: 0x4a2c10, b: 0x8a5a2a, c: 0xb07a4a }),
  bread: () => drawSprite(SPRITES.bread.rows, SPRITES.bread.pal),
  raw_pork: () => drawSprite(SPRITES.meat.rows, SPRITES.meat.pal),
  cooked_pork: () => drawSprite(SPRITES.cooked.rows, SPRITES.cooked.pal),
  raw_mutton: () => drawSprite(SPRITES.meat.rows, { ...SPRITES.meat.pal, b: 0xc85050 }),
  cooked_mutton: () => drawSprite(SPRITES.cooked.rows, { ...SPRITES.cooked.pal, b: 0x8a4a22 }),
  raw_poultry: () => drawSprite(SPRITES.meat.rows, { ...SPRITES.meat.pal, a: 0xa07060, b: 0xf0c8b0, c: 0xfff0e0 }),
  cooked_poultry: () => drawSprite(SPRITES.cooked.rows, { ...SPRITES.cooked.pal, b: 0xc88a40, c: 0xe8b870 }),
  wheat_seeds: () => drawSprite(SPRITES.seeds.rows, SPRITES.seeds.pal),
  wheat: () => drawSprite(SPRITES.wheat.rows, SPRITES.wheat.pal),
  clay_ball: () => drawSprite(SPRITES.clay_ball.rows, SPRITES.clay_ball.pal),
  brick: () => drawSprite(SPRITES.brick.rows, SPRITES.brick.pal),
  bucket: () => drawSprite(SPRITES.bucket.rows, SPRITES.bucket.pal),
  water_bucket: () => drawSprite(SPRITES.water_bucket.rows, SPRITES.water_bucket.pal),
  lava_bucket: () => drawSprite(SPRITES.lava_bucket.rows, SPRITES.lava_bucket.pal),
  rotten_flesh: () => drawSprite(SPRITES.rotten_flesh.rows, SPRITES.rotten_flesh.pal),
  paper: () => drawSprite(SPRITES.paper.rows, SPRITES.paper.pal),
  book: () => drawSprite(SPRITES.book.rows, SPRITES.book.pal),
  red_dye: () => drawSprite(SPRITES.dye.rows, { a: 0x5a0a0a, b: 0xc02020, c: 0xff7070 }),
  yellow_dye: () => drawSprite(SPRITES.dye.rows, { a: 0x6a5a0a, b: 0xf0c820, c: 0xfff0a0 }),
  arrow: () => drawSprite(SPRITES.arrow.rows, SPRITES.arrow.pal),
  bow: () => drawSprite(['................', '.........wwww...', '.......ww..s.w..', '......w...s..w..', '.....w...s...w..', '....w...s...w...', '....w..s....w...', '...w..s....w....', '...w.s.....w....', '..w.s.....w.....', '..ws.....w......', '..s.....w.......', '.s....ww........', '.wwwww..........', '................', '................'], { w: 0x7a5426, s: 0xdedede }),
  bow_pulling_0: () => drawSprite(['................', '.........wwww...', '.......ww.s..w..', '......w..s...w..', '.....w..s....w..', '....w..s....w...', '....w.ss....w...', '...w.sa....w....', '...w.as....w....', '..w.s.....w.....', '..ws.....w......', '..s.....w.......', '.s....ww........', '.wwwww..........', '................', '................'], { w: 0x7a5426, s: 0xdedede, a: 0x9a9a9a }),
  bow_pulling_1: () => drawSprite(['................', '.........wwww...', '.......ww....w..', '......w.s....w..', '.....w.s.....w..', '....w.s.....w...', '....wsaa....w...', '...w.aas...w....', '...w..s....w....', '..w.s.....w.....', '..ws.....w......', '..s.....w.......', '.s....ww........', '.wwwww..........', '................', '................'], { w: 0x7a5426, s: 0xdedede, a: 0x9a9a9a }),
  bow_pulling_2: () => drawSprite(['................', '.........wwww...', '.......ww....w..', '......w......w..', '.....ws......w..', '....wsaa....w...', '....saaa....w...', '...waas....w....', '...ws......w....', '..ws......w.....', '..s......w......', '..s.....w.......', '.s....ww........', '.wwwww..........', '................', '................'], { w: 0x7a5426, s: 0xdedede, a: 0x9a9a9a }),
  emerald: () => drawSprite(['................', '................', '.......aa.......', '......abba......', '.....abccba.....', '....abcbbcba....', '...abcbddbcba...', '...abbdeedbba...', '...abbdeedbba...', '...abcbddbcba...', '....abcbbcba....', '.....abccba.....', '......abba......', '.......aa.......', '................', '................'], { a: 0x0a4a20, b: 0x17a84a, c: 0x41f384, d: 0x0e7a34, e: 0xd8ffe8 }),
  oak_door_item: () => drawSprite(SPRITES.door_item.rows, SPRITES.door_item.pal),
};

{
  const DYE: Record<string, [number, number, number]> = {
    white: [0x8a8a80, 0xf0f0e8, 0xffffff], orange: [0x7a3a08, 0xf07a20, 0xffb060], magenta: [0x5a1a58, 0xc050c0, 0xf0a0f0], light_blue: [0x1a4a6a, 0x48b8e8, 0xb0e8ff],
    lime: [0x2a5a0a, 0x80d020, 0xc8f080], pink: [0x7a3a50, 0xf098b8, 0xffd0e0], gray: [0x1a1c1e, 0x4a5054, 0x80888c], light_gray: [0x4a4a46, 0x9e9e96, 0xd8d8d0],
    cyan: [0x0a3a40, 0x18a0a8, 0x80e0e8], purple: [0x3a1058, 0x8a38c0, 0xc890f0], blue: [0x10144a, 0x3a44b8, 0x8a98f0], brown: [0x3a2210, 0x7a4c2a, 0xb08058],
    green: [0x223008, 0x5a7a20, 0x9ab860], black: [0x050505, 0x1e1e24, 0x4a4a52],
  };
  for (const [c, [a, b, d]] of Object.entries(DYE)) ITEM_MAP[`${c}_dye`] = () => drawSprite(SPRITES.dye.rows, { a, b, c: d });
  ITEM_MAP.redstone = () => drawSprite(['................', '................', '................', '......aa........', '.....abba..a....', '....abbbba.ab...', '...abbccbba.....', '...abbbbbbba....', '....abbcbbba....', '.a...abbbba.....', 'aba...aaaa..a...', '.a.........aba..', '............a...', '................', '................', '................'], { a: 0x5a0808, b: 0xc01810, c: 0xff5a40 });
  ITEM_MAP.shears = () => drawSprite(['................', '................', '..........aa....', '.........abba...', '........abba....', '.......abba.....', '...cc.abba......', '..cddcaba.......', '..cd.dca........', '..cddcdc........', '...ccd.dc.......', '.....cddc.......', '......cc........', '................', '................', '................'], { a: 0x5a5a5a, b: 0xd8d8d8, c: 0x3a2010, d: 0xc04020 });
  ITEM_MAP.cookie = () => drawSprite(['................', '................', '................', '.....aaaaaa.....', '....abbbbbba....', '...abbcbbbbba...', '...abbbbbcbba...', '...abcbbbbbba...', '...abbbbcbbba...', '...abbbbbbcba...', '....abcbbbba....', '.....aaaaaa.....', '................', '................', '................', '................'], { a: 0x8a5420, b: 0xd8963a, c: 0x3a2010 });
  ITEM_MAP.dried_kelp = () => drawSprite(['................', '................', '..........aa....', '.........abba...', '........abba....', '.......abba.....', '......abba......', '.....abba.......', '....abba........', '...abba.........', '..abba..........', '..aaa...........', '................', '................', '................', '................'], { a: 0x1e2a14, b: 0x3e5a24 });
  ITEM_MAP.minecart = () => drawSprite(['................', '................', '................', '................', '.a............a.', '.abbbbbbbbbbbba.', '.abccccccccccba.', '.abccccccccccba.', '.abbbbbbbbbbbba.', '..aaaaaaaaaaaa..', '...dd......dd...', '..dddd....dddd..', '...dd......dd...', '................', '................', '................'], { a: 0x3a3a3a, b: 0x8a8a8a, c: 0x5a5a5a, d: 0x2a2a2a });
  ITEM_MAP.tnt_minecart = () => drawSprite(['................', '................', '....rrrrrrrr....', '....rwwwwwwr....', '.a..rrrrrrrr..a.', '.abbbbbbbbbbbba.', '.abccccccccccba.', '.abccccccccccba.', '.abbbbbbbbbbbba.', '..aaaaaaaaaaaa..', '...dd......dd...', '..dddd....dddd..', '...dd......dd...', '................', '................', '................'], { a: 0x3a3a3a, b: 0x8a8a8a, c: 0x5a5a5a, d: 0x2a2a2a, r: 0xc8301e, w: 0xe8e0d0 });
  ITEM_MAP.crossbow_standby = () => drawSprite(['................', '.........aaaa...', '.......aa....a..', '......a.s....a..', '.....a..s....a..', '....a...s...a...', '....a..sbb..a...', '...a..sbbb.a....', '...a.s.bb..a....', '..a.s..b..a.....', '..as..b..a......', '..s..b..a.......', '.s..b.aa........', '.aab.a..........', '..bb............', '.bb.............'], { a: 0x7a5426, s: 0xdedede, b: 0x5a5a5a });
  ITEM_MAP.mace = () => drawSprite(['................', '..........aaa...', '.........abbba..', '........abcccba.', '........abcbcba.', '........abcccba.', '.........abbba..', '........d.aaa...', '.......d........', '......d.........', '.....d..........', '....d...........', '...d............', '..e.............', '.ee.............', '................'], { a: 0x3a3a3a, b: 0x7a7a7a, c: 0xb8b8b8, d: 0x6a4a2a, e: 0x4a3a2a });
  ITEM_MAP.crossbow = ITEM_MAP.crossbow_standby;
  const nug = (a: number, b: number, c: number) => () => drawSprite(['................', '................', '................', '................', '................', '......aaa.......', '.....abbca......', '....abbbcca.....', '....abbbbba.....', '.....abbba......', '......aaa.......', '................', '................', '................', '................', '................'], { a, b, c });
  ITEM_MAP.gold_nugget = nug(0x8a6a10, 0xf0cc2a, 0xfff2a0);
  ITEM_MAP.iron_nugget = nug(0x55585e, 0xc6c6c6, 0xf2f2f2);
  ITEM_MAP.ghast_tear = () => drawSprite(['................', '................', '.......a........', '......aba.......', '......aba.......', '.....abbba......', '.....abcba......', '....abbcbba.....', '....abbbbba.....', '....abbbbba.....', '.....abbba......', '......aaa.......', '................', '................', '................', '................'], { a: 0x6aa0b0, b: 0xc8eef4, c: 0xffffff });
  ITEM_MAP.blaze_rod = () => drawSprite(['................', '...........aa...', '..........abba..', '.........abba...', '........abba....', '.......abba.....', '......abba......', '.....abba.......', '....abba........', '...abba.........', '..abba..........', '.abba...........', '.aa.............', '................', '................', '................'], { a: 0x8a4a00, b: 0xffd040 });
  ITEM_MAP.blaze_powder = () => drawSprite(['................', '................', '................', '.......a........', '.....a.b..a.....', '....ab.bba.b....', '...abbbcbbba....', '...bbcccccbb....', '..abbccdccbba...', '..bbccddddcbb...', '...abbccccba....', '....aabbbaa.....', '................', '................', '................', '................'], { a: 0xa04800, b: 0xe08a10, c: 0xf8c030, d: 0xfff080 });
  ITEM_MAP.nether_wart_item = () => drawSprite(['................', '................', '......aab.......', '.....abbcb......', '....abbbbcb.....', '....abbbbbb.....', '.....abbbba.....', '......aaaa......', '.......dd.......', '......d..d......', '.....d....d.....', '................', '................', '................', '................', '................'], { a: 0x6a1418, b: 0xa8242a, c: 0xd8443a, d: 0x4a1012 });
  ITEM_MAP.wither_skeleton_skull = () => drawSprite(['................', '................', '...aaaaaaaaaa...', '..abbbbbbbbbba..', '..abbbbbbbbbba..', '..abccbbbbccba..', '..abccbbbbccba..', '..abbbbbbbbbba..', '..abbbbccbbbba..', '..abbbbbbbbbba..', '..abcbcbcbcbba..', '..abbbbbbbbbba..', '...aaaaaaaaaa...', '................', '................', '................'], { a: 0x101010, b: 0x3a3a3a, c: 0x0a0a0a });
  ITEM_MAP.nether_brick_fence_item = () => drawSprite(['................', '................', '...aa......aa...', '...ab......ab...', '...abaaaaaaab...', '...abbbbbbbbb...', '...abaaaaaaab...', '...ab......ab...', '...abaaaaaaab...', '...abbbbbbbbb...', '...abaaaaaaab...', '...ab......ab...', '...ab......ab...', '...ab......ab...', '...aa......aa...', '................'], { a: 0x1a0c0f, b: 0x3d1f24 });
  ITEM_MAP.potato = () => drawSprite(['................', '................', '.....aaaa.......', '....abbbba......', '...abbbbbba.....', '...abbcbbbba....', '...abbbbbbba....', '....abbbcbba....', '....abbbbbba....', '.....abbbba.....', '......aaaa......', '................', '................', '................', '................', '................'], { a: 0x8a6a30, b: 0xd8b060, c: 0x6a5020 });
  ITEM_MAP.baked_potato = () => drawSprite(['................', '................', '.....aaaa.......', '....abbbba......', '...abbcbbba.....', '...abbbbbbba....', '...abbbbcbba....', '....abbbbbba....', '....abbcbbba....', '.....abbbba.....', '......aaaa......', '................', '................', '................', '................', '................'], { a: 0x8a5a20, b: 0xe8b850, c: 0xf8e0a0 });
  ITEM_MAP.carrot = () => drawSprite(['..........g.g...', '..........ggg...', '.........aagg...', '........abba....', '.......abba.....', '......abba......', '.....abba.......', '....abba........', '...abba.........', '..abba..........', '..aba...........', '..aa............', '................', '................', '................', '................'], { a: 0xb05a10, b: 0xf08a20, g: 0x4a9a2a });
  ITEM_MAP.golden_carrot = () => drawSprite(['..........g.g...', '..........ggg...', '.........aagg...', '........abba....', '.......abca.....', '......abba......', '.....acba.......', '....abba........', '...abca.........', '..abba..........', '..aba...........', '..aa............', '................', '................', '................', '................'], { a: 0xb08a10, b: 0xf0d040, c: 0xfff0a0, g: 0x4a9a2a });
  ITEM_MAP.beetroot = () => drawSprite(['.......gg.......', '......g..g......', '.......gg.......', '.....aaaaaa.....', '....abbbbbba....', '....abbbbbba....', '....abbbbbba....', '.....abbbba.....', '......abba......', '.......aa.......', '.......a........', '................', '................', '................', '................', '................'], { a: 0x6a1020, b: 0xa02040, g: 0x4a8a2a });
  ITEM_MAP.beetroot_seeds = () => drawSprite(['................', '................', '................', '.....a...a......', '......b.....a...', '....a....b......', '.......a.....b..', '...b.......a....', '......a.b.......', '....a.......a...', '........a.......', '................', '................', '................', '................', '................'], { a: 0xc8b070, b: 0x8a7040 });
  ITEM_MAP.beetroot_soup = () => drawSprite(['................', '................', '................', '................', '................', '..aaaaaaaaaaaa..', '..abbbbbbbbbba..', '..abbbcbbbbbba..', '...abbbbbbbba...', '....aaaaaaaa....', '.....aaaaaa.....', '................', '................', '................', '................', '................'], { a: 0x6a4a2a, b: 0xa02040, c: 0xd04060 });
  ITEM_MAP.pumpkin_pie = () => drawSprite(['................', '................', '................', '.....aaaaaa.....', '...aabbbbbbaa...', '..abbbbcbbbbba..', '..abbcbbbbcbba..', '..abbbbbbbbbba..', '...aabbbbbbaa...', '.....aaaaaa.....', '................', '................', '................', '................', '................', '................'], { a: 0xb07a3a, b: 0xe0902a, c: 0xf8c070 });
  ITEM_MAP.melon_slice = () => drawSprite(['................', '................', '................', '..a.............', '..aa............', '..aba...........', '..abba..........', '..abcba.........', '..abbbba........', '..abbcbba.......', '..aaaaaaaa......', '..gggggggggg....', '................', '................', '................', '................'], { a: 0xc83030, b: 0xe85050, c: 0x202020, g: 0x4a8a2a });
  ITEM_MAP.glistering_melon_slice = () => drawSprite(['................', '...........y....', '................', '..a......y......', '..aa............', '..aya...........', '..abba.....y....', '..abcba.........', '..abbbya........', '..abbcbba.......', '..aaaaaaaa......', '..yyyyyyyyyy....', '................', '................', '................', '................'], { a: 0xc83030, b: 0xe85050, c: 0x202020, y: 0xf8d840 });
  ITEM_MAP.compass = () => drawSprite(['................', '................', '.....aaaaaa.....', '....abbbbbba....', '...abbbbcbbba...', '...abbbbcbbba...', '...abbbccbbba...', '...abbbcdbbba...', '...abbbddbbba...', '...abbbdbbbba...', '...abbbdbbbba...', '....abbbbbba....', '.....aaaaaa.....', '................', '................', '................'], { a: 0x5a5a60, b: 0xb0b0b8, c: 0xe03030, d: 0x404048 });
  ITEM_MAP.clock = () => drawSprite(['................', '................', '.....aaaaaa.....', '....abbbbbba....', '...abbbcbbbba...', '...abbbcbbbba...', '...abbbcbbbba...', '...abbbccccba...', '...abbbbbbbba...', '...abbbbbbbba...', '....abbbbbba....', '.....aaaaaa.....', '................', '................', '................', '................'], { a: 0xb08a10, b: 0xf0e0a0, c: 0x404040 });
  ITEM_MAP.name_tag = () => drawSprite(['................', '................', '..........aa....', '.........a..a...', '........a....a..', '.......abbbbba..', '......abbbbbba..', '.....abbbbbba...', '....abbbbbba....', '...abbbbbba.....', '...abbbbba......', '...aaaaaa.......', '................', '................', '................', '................'], { a: 0x6a5a40, b: 0xe8dcb8 });
  ITEM_MAP.glass_bottle = () => drawSprite(['................', '.......aa.......', '.......bb.......', '......abba......', '......a..a......', '.....a....a.....', '....a......a....', '....a......a....', '....a......a....', '....a......a....', '.....aaaaaa.....', '................', '................', '................', '................', '................'], { a: 0xc8e0f0, b: 0x8a6a40 });
  ITEM_MAP.writable_book = () => drawSprite(['................', '...........ff...', '..........ff....', '...aaaaaaff.....', '...abbbbff......', '...abbbfbba.....', '...abbbbbba.....', '...abbbbbba.....', '...abbbbbba.....', '...abbbbbba.....', '...aaaaaaaa.....', '................', '................', '................', '................', '................'], { a: 0x6a3a1a, b: 0xa05a2a, f: 0xf0f0f0 });
  ITEM_MAP.magma_cream = () => drawSprite(['................', '................', '................', '.....aaaaa......', '....abbbbba.....', '...abccbbcba....', '...abcdbbdcba...', '...abbbbbbbba...', '...abdcbbcdba...', '....abccccba....', '.....aaaaaa.....', '................', '................', '................', '................', '................'], { a: 0x5a2a08, b: 0xd86a10, c: 0xf8b030, d: 0xfff070 });
  ITEM_MAP.tripwire_hook = () => drawSprite(['................', '......aaaa......', '.....abbbba.....', '.....ab..ba.....', '.....abbbba.....', '......aaaa......', '.......cc.......', '.......cc.......', '.......cc.......', '.......cc.......', '.....dddddd.....', '.....deeeed.....', '.....deeeed.....', '.....dddddd.....', '................', '................'], { a: 0x4a4a4a, b: 0xcfcfcf, c: 0x6b4a2a, d: 0x5a4020, e: 0xa8834e });
  ITEM_MAP.quartz = () => drawSprite(['................', '................', '.........aa.....', '........abca....', '.......abbca....', '......abbba.....', '.....abbcba.....', '....abbbba......', '....abcba.......', '...abbba........', '...abba.........', '....aa..........', '................', '................', '................', '................'], { a: 0xa89a90, b: 0xece6df, c: 0xffffff });
  ITEM_MAP.enchanted_book = () => drawSprite(['................', '................', '..aaaaaaaaaa....', '..abbbbbbbbca...', '..abddbbbbbca...', '..abbbbddbbca...', '..abbbbbbbbca...', '..abbddbbbbca...', '..abbbbbbddca...', '..abbbbbbbbca...', '..abddbbbbbca...', '..abbbbbbbbca...', '..aaaaaaaaaaa...', '...ccccccccca...', '................', '................'], { a: 0x3a1a4a, b: 0x8a3ab8, c: 0xe8dcc0, d: 0xd8a8ff });
  ITEM_MAP.lapis_lazuli = () => drawSprite(['................', '................', '.......aa.......', '......abba......', '.....abbcba.....', '....abbbbbba....', '...abbcbbbbba...', '...abbbbbcbba...', '....abbbbbba....', '.....abbbba.....', '......abba......', '.......aa.......', '................', '................', '................', '................'], { a: 0x10286a, b: 0x2c5ad0, c: 0x9ab8ff });
  ITEM_MAP.crossbow_pulling_0 = ITEM_MAP.crossbow_standby;
  ITEM_MAP.crossbow_pulling_1 = ITEM_MAP.crossbow_standby;
  ITEM_MAP.crossbow_pulling_2 = ITEM_MAP.crossbow_standby;
  ITEM_MAP.crossbow_arrow = ITEM_MAP.crossbow_standby;
  for (const m of ['wooden', 'stone', 'iron', 'golden', 'aetherite', 'copper']) { const c = MAT_PAL[m]; ITEM_MAP[`${m}_spear`] = () => drawSprite(['..............aa', '.............abb', '............abc.', '...........ab...', '..........h.....', '.........h......', '........h.......', '.......h........', '......h.........', '.....h..........', '....h...........', '...h............', '..h.............', '.h..............', 'h...............', '................'], { a: c[0], b: c[1], c: c[2], h: 0x7a5a36 }); }
  ITEM_MAP.blastpowder = () => drawSprite(['................', '................', '................', '......a.a.......', '.....abab.a.....', '....abbbbaba....', '...abbcbbbba....', '..abbbbbcbbba...', '..abcbbbbbbba...', '...abbbcbbba....', '....aabbbaa.....', '......aaa.......', '................', '................', '................', '................'], { a: 0x2a2a2a, b: 0x5a5a5a, c: 0x9a9a9a });
  ITEM_MAP.firestriker = () => drawSprite(['................', '................', '..aaaa..........', '.abbbba.........', '.ab..ba.........', '.ab..ba.........', '.abbbba...cc....', '..aaaa...cddc...', '........cdddc...', '.......cdddc....', '......cdddc.....', '.....cdddc......', '......ccc.......', '................', '................', '................'], { a: 0x3a3a3a, b: 0xb8b8b8, c: 0x1a1a20, d: 0x4a4a58 });
  ITEM_MAP.copper_ingot = () => drawSprite(SPRITES.ingot.rows, { a: 0x6a3018, b: 0xc06a48, c: 0xf0b090 });
  ITEM_MAP.trial_key = () => drawSprite(['................', '................', '..aaa...........', '.abbba..........', '.ab.ba..........', '.abbbaaaaaaaaa..', '..aaabbbbbbbbba.', '.....aaaaaba.ba.', '..........a..a..', '................', '................', '................', '................', '................', '................', '................'], { a: 0x4a3010, b: 0xe8b040 });
  ITEM_MAP.glow_ink_sac = () => drawSprite(['................', '................', '......aaaa......', '.....abbbba.....', '....abbcbbba....', '....abbbbbba....', '....abcbbbba....', '.....abbbba.....', '......abba......', '.....a.aa.a.....', '....a..aa..a....', '.......aa.......', '................', '................', '................', '................'], { a: 0x0a4a50, b: 0x2ab8b0, c: 0xb0fff0 });
  const frameSprite = (b: number, c: number) => () => drawSprite(['................', '.aaaaaaaaaaaaaa.', '.abbbbbbbbbbbba.', '.abccccccccccba.', '.abcddddddddcba.', '.abcdeeeeeedcba.', '.abcdeeeeeedcba.', '.abcdeeeeeedcba.', '.abcdeeeeeedcba.', '.abcdeeeeeedcba.', '.abcdeeeeeedcba.', '.abcddddddddcba.', '.abccccccccccba.', '.abbbbbbbbbbbba.', '.aaaaaaaaaaaaaa.', '................'], { a: 0x5a4020, b: 0xc8a868, c: 0x9a7a44, d: b, e: c });
  ITEM_MAP.item_frame = frameSprite(0x6a3a1a, 0x8a5428);
  ITEM_MAP.glow_item_frame = frameSprite(0x1a7a70, 0x5ae0c8);
  ITEM_MAP.hopper_minecart = () => drawSprite(['................', '................', '...hhhhhhhhhh...', '...hiiiiiiiih...', '.a..hhiiiihh..a.', '.abbbbhhhhbbbba.', '.abccccccccccba.', '.abccccccccccba.', '.abbbbbbbbbbbba.', '..aaaaaaaaaaaa..', '...dd......dd...', '..dddd....dddd..', '...dd......dd...', '................', '................', '................'], { a: 0x3a3a3a, b: 0x8a8a8a, c: 0x5a5a5a, d: 0x2a2a2a, h: 0x4a4a4e, i: 0x22222a });
  ITEM_MAP.chest_minecart = () => drawSprite(['................', '................', '...wwwwwwwwww...', '...wvvvvvvvvw...', '.a.wwwwggwwww.a.', '.abbbbbbbbbbbba.', '.abccccccccccba.', '.abccccccccccba.', '.abbbbbbbbbbbba.', '..aaaaaaaaaaaa..', '...dd......dd...', '..dddd....dddd..', '...dd......dd...', '................', '................', '................'], { a: 0x3a3a3a, b: 0x8a8a8a, c: 0x5a5a5a, d: 0x2a2a2a, w: 0x6a4420, v: 0xa8743a, g: 0xd8d8d8 });
  ITEM_MAP.ink_sac = () => drawSprite(['................', '................', '......aaaa......', '.....abbbba.....', '....abbcbbba....', '....abbbbbba....', '....abbbbbba....', '.....abbbba.....', '......abba......', '.....a.aa.a.....', '....a..aa..a....', '.......aa.......', '................', '................', '................', '................'], { a: 0x101014, b: 0x2a2a34, c: 0x6a6a7a });
  ITEM_MAP.cocoa_beans = () => drawSprite(['................', '................', '................', '.....aa...aa....', '....abba.abba...', '....abca.abca...', '....abba.abba...', '.....aa...aa....', '.......aa.......', '......abba......', '......abca......', '......abba......', '.......aa.......', '................', '................', '................'], { a: 0x3a2010, b: 0x7a4a24, c: 0xa87040 });
}

ITEM_MAP.glow_berries = () => drawSprite(['................', '........a.......', '.......a........', '......a.........', '.....bb..bb.....', '....bccb.bccb...', '....bccb.bccb...', '.....bb...bb....', '.......a........', '......bb........', '.....bccb.......', '.....bccb.......', '......bb........', '................', '................', '................'], { a: 0x4f7a2a, b: 0xd07a10, c: 0xffc040 });

export function defaultItemTexture(key: string): Px | null {
  if (ITEM_MAP[key]) return ITEM_MAP[key]();
  const tool = key.match(/^(wooden|stone|iron|golden|aetherite)_(pickaxe|axe|shovel|sword|hoe)$/);
  if (tool) {
    const [d, m, l] = MAT_PAL[tool[1]];
    return drawSprite(TOOL_SHAPES[tool[2]], { b: d, c: tool[1] === 'wooden' ? m : l, h: 0x4a3418, H: 0x8a6a3e });
  }
  const armor = key.match(/^(leather|iron|gold|aetherite)_(helmet|chestplate|leggings|boots)$/);
  if (armor) {
    const [d, m] = MAT_PAL[armor[1]];
    const slot = ['helmet', 'chestplate', 'leggings', 'boots'].indexOf(armor[2]);
    return drawSprite(ARMOR_SHAPES[slot], { b: d, c: m });
  }
  return null;
}

export function cloudTexture(size = 256): Px {
  const p = new Px(size, size);
  const r = new Rng(4242);
  const cell = size >= 256 ? 8 : 2;
  const n = size / cell;
  const grid: number[] = [];
  for (let i = 0; i < n * n; i++) grid.push(r.next());
  const smooth = (gx: number, gy: number) => {
    let s = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += grid[((gy + dy + n) % n) * n + ((gx + dx + n) % n)];
    return s / 9;
  };
  for (let gy = 0; gy < n; gy++) for (let gx = 0; gx < n; gx++) {
    const v = smooth(gx, gy) * 0.7 + grid[gy * n + gx] * 0.3;
    if (v < 0.56) continue;
    for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) p.set(gx * cell + x, gy * cell + y, [255, 255, 255, 230]);
  }
  return p;
}

export function hudIcon(kind: 'heart' | 'heart_half' | 'heart_empty' | 'food' | 'food_half' | 'food_empty' | 'armor' | 'armor_half' | 'armor_empty' | 'bubble'): Px {
  const heart = ['.........', '.aa...aa.', 'abba.abba', 'abbbabbba', 'abbbbbbba', '.abbbbba.', '..abbba..', '...aba...', '....a....'];
  const food = ['.........', '.....aa..', '....abba.', '...abbba.', '..abbcba.', '.abbbba..', 'aaabba...', 'acaa.....', '.a.......'];
  const armor = ['.........', '.aaa.aaa.', '.abbabba.', '.abbbbba.', '.abbbbba.', '.abbbbba.', '..abbba..', '...aba...', '....a....'];
  const bubble = ['.........', '...aaa...', '..abcca..', '.abbbcba.', '.abbbbba.', '.abbbbba.', '..abbba..', '...aaa...', '.........'];
  const base = kind.startsWith('heart') ? heart : kind.startsWith('food') ? food : kind.startsWith('armor') ? armor : bubble;
  const pal: Record<string, number> = kind.startsWith('heart') ? { a: 0x2a0606, b: 0xe02424, c: 0xff8a8a }
    : kind.startsWith('food') ? { a: 0x3a1e08, b: 0xb8743a, c: 0xe8e0d0 } : kind.startsWith('armor') ? { a: 0x2a2a2a, b: 0xd8d8d8, c: 0xffffff } : { a: 0x1a3a8a, b: 0x5aa0ff, c: 0xe0f0ff };
  const p = new Px(9, 9);
  const empty = kind.endsWith('empty'), half = kind.endsWith('half');
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
    const ch = base[y][x];
    if (ch === '.') continue;
    let c = pal[ch];
    if (ch !== 'a' && (empty || (half && x > 4))) c = 0x3a3a3a;
    p.set(x, y, hex(c, ch !== 'a' && (empty || (half && x > 4)) ? 200 : 255));
  }
  return p;
}

function campLog(lit: boolean, soul: boolean): Px {
  const p = new Px(), bark = [0x4a3a26, 0x5e4a30, 0x3a2c1c], glow = soul ? [0x6ae0f0, 0x2a9ac8] : [0xffa030, 0xe06010];
  const r = rngFor(lit ? (soul ? 'cls' : 'cll') : 'clo');
  for (let y = 0; y < 4; y++) for (let x = 0; x < 16; x++) p.set(x, y, hex(lit && y >= 2 && r.int(3) === 0 ? glow[r.int(2)] : bark[(x * 3 + y * 7 + r.int(2)) % 3]));
  for (let y = 4; y < 8; y++) for (let x = 0; x < 4; x++) p.set(x, y, hex(x === 0 || x === 3 || y === 4 || y === 7 ? 0x4a3a26 : 0x9a7a4a));
  for (let y = 8; y < 14; y++) for (let x = 0; x < 16; x++) p.set(x, y, hex(r.int(4) === 0 ? (lit ? glow[1] : 0x3a3a3a) : 0x1e1a18));
  return p;
}

function flame(c: number[]): Px {
  const p = new Px();
  for (let x = 0; x < 16; x++) {
    const h = 6 + Math.round(8 * Math.sin(((x + 0.5) / 16) * Math.PI) * (0.75 + 0.25 * Math.sin(x * 2.3)));
    for (let y = 16 - h; y < 16; y++) { const t = (y - (16 - h)) / h, edge = x < 2 || x > 13; p.set(x, y, hex(c[edge ? 3 : t < 0.2 ? 0 : t < 0.5 ? 1 : t < 0.8 ? 2 : 3])); }
  }
  return p;
}

function anchorSide(charge: number): Px {
  const p = speckle(noise(`ras${charge}`, hex(0x1a1224), 0.08), `ras${charge}`, [hex(0x3a2a4e), hex(0x2a1a3a)], 22);
  for (let x = 0; x < 16; x++) { p.set(x, 0, hex(0x3a3a42)); p.set(x, 15, hex(0x3a3a42)); }
  for (let i = 0; i < 4; i++) for (let y = 3; y < 13; y++) p.set(2 + i * 4, y, hex(i < charge ? (y % 3 === 0 ? 0xf0b0ff : 0xa040e0) : 0x2c2238));
  return p;
}

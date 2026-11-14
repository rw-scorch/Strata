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

const TEX: Record<string, () => Px> = {
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

export function defaultBlockTexture(key: string): Px {
  const f = TEX[key];
  if (f) return f();
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
  gold: [0x8a6a10, 0xf0cc2a, 0xfff2a0], copper: [0x6a3018, 0xc06a48, 0xf0b090],
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
  ITEM_MAP.ink_sac = () => drawSprite(['................', '................', '......aaaa......', '.....abbbba.....', '....abbcbbba....', '....abbbbbba....', '....abbbbbba....', '.....abbbba.....', '......abba......', '.....a.aa.a.....', '....a..aa..a....', '.......aa.......', '................', '................', '................', '................'], { a: 0x101014, b: 0x2a2a34, c: 0x6a6a7a });
  ITEM_MAP.cocoa_beans = () => drawSprite(['................', '................', '................', '.....aa...aa....', '....abba.abba...', '....abca.abca...', '....abba.abba...', '.....aa...aa....', '.......aa.......', '......abba......', '......abca......', '......abba......', '.......aa.......', '................', '................', '................'], { a: 0x3a2010, b: 0x7a4a24, c: 0xa87040 });
}

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
  const cell = 8;
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

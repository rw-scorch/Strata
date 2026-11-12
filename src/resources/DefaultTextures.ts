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
  gold: [0x8a6a10, 0xf0cc2a, 0xfff2a0],
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

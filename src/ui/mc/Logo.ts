const GLYPHS: Record<string, string[]> = {
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
};

export function drawLogo(text: string, stone: HTMLCanvasElement | null, cell: number): HTMLCanvasElement {
  const letters = [...text].map((ch) => GLYPHS[ch] ?? GLYPHS.A);
  const cols = letters.reduce((a, g) => a + g[0].length + 1, -1);
  const depth = Math.max(2, Math.round(cell * 0.45));
  const c = document.createElement('canvas');
  c.width = cols * cell + depth + 2;
  c.height = 7 * cell + depth + 2;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  const cells: [number, number][] = [];
  let ox = 0;
  for (const gl of letters) {
    gl.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === '#') cells.push([ox + x, y]); }));
    ox += gl[0].length + 1;
  }
  const pat = (dark: number) => {
    if (!stone) return `rgb(${130 * dark},${130 * dark},${130 * dark})`;
    const t = document.createElement('canvas');
    t.width = t.height = cell * 2;
    const tg = t.getContext('2d')!;
    tg.imageSmoothingEnabled = false;
    tg.drawImage(stone, 0, 0, t.width, t.height);
    tg.fillStyle = `rgba(0,0,0,${1 - dark})`;
    tg.fillRect(0, 0, t.width, t.height);
    return g.createPattern(t, 'repeat')!;
  };
  g.fillStyle = '#000';
  for (const [x, y] of cells) g.fillRect(x * cell, y * cell, cell + depth + 2, cell + depth + 2);
  const side = pat(0.38);
  for (let d = depth; d >= 1; d--) {
    g.fillStyle = side;
    for (const [x, y] of cells) g.fillRect(x * cell + 1 + d, y * cell + 1 + d, cell, cell);
  }
  g.fillStyle = pat(1);
  for (const [x, y] of cells) g.fillRect(x * cell + 1, y * cell + 1, cell, cell);
  g.fillStyle = 'rgba(255,255,255,0.18)';
  const on = new Set(cells.map(([x, y]) => `${x},${y}`));
  for (const [x, y] of cells) {
    if (!on.has(`${x},${y - 1}`)) g.fillRect(x * cell + 1, y * cell + 1, cell, Math.max(1, cell >> 3));
    if (!on.has(`${x - 1},${y}`)) g.fillRect(x * cell + 1, y * cell + 1, Math.max(1, cell >> 3), cell);
  }
  return c;
}

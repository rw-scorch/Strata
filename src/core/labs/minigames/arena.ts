import { CHUNK_SIZE, CHUNK_VOLUME } from '../../constants';
import { B } from '../../blocks';

export type ArenaKind = 'spires' | 'hearthfall';
export const ARENA_KINDS: ArenaKind[] = ['spires', 'hearthfall'];
export const ARENA_INFO: Record<ArenaKind, { name: string; alt: string; desc: string }> = {
  spires: { name: 'Fortune Spires', alt: 'Lucky Pillars', desc: 'Everyone starts on a lonely pillar over the void. Fortune hands out a random item every few seconds. Bridge, brawl, be the last one standing.' },
  hearthfall: { name: 'Hearthfall', alt: 'Bedwars', desc: 'Four teams, four island hearths. Forges pour out iron and gold, the Quartermaster sells gear. While your hearth burns you respawn. Snuff out the rest.' },
};

export type V3 = [number, number, number];
export interface Box { a: V3; b: V3; v: number; }

export interface TeamDef { key: string; name: string; color: string; floor: number; wool: number; base: V3; hearth: V3; spawn: V3; forge: V3; npc: V3; dir: [number, number]; }
export interface GenDef { pos: V3; item: 'iron' | 'gold' | 'aetherite'; every: number; team?: number; }

export interface ArenaLayout {
  kind: ArenaKind;
  boxes: Box[];
  lobby: V3;
  spawns: V3[];
  teams: TeamDef[];
  gens: GenDef[];
  voidY: number;
  buildTop: number;
  bounds: number;
}

export const FLOOR_Y = 64;

function lobbyBoxes(): Box[] {
  const y = 100;
  return [
    { a: [-6, y, -6], b: [6, y, 6], v: B.GLASS },
    { a: [-6, y + 1, -6], b: [6, y + 3, -6], v: B.GLASS },
    { a: [-6, y + 1, 6], b: [6, y + 3, 6], v: B.GLASS },
    { a: [-6, y + 1, -6], b: [-6, y + 3, 6], v: B.GLASS },
    { a: [6, y + 1, -6], b: [6, y + 3, 6], v: B.GLASS },
    { a: [-1, y, -1], b: [1, y, 1], v: B.GLOWSTONE },
  ];
}

function spires(): ArenaLayout {
  const boxes = lobbyBoxes();
  const spawns: V3[] = [];
  const n = 8, r = 16;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = Math.round(Math.cos(a) * r), z = Math.round(Math.sin(a) * r);
    boxes.push({ a: [x, 34, z], b: [x, FLOOR_Y, z], v: B.BEDROCK });
    spawns.push([x + 0.5, FLOOR_Y + 1, z + 0.5]);
  }
  boxes.push({ a: [-3, 56, -3], b: [3, 57, 3], v: B.DIRT });
  boxes.push({ a: [-3, 58, -3], b: [3, 58, 3], v: B.GRASS });
  boxes.push({ a: [-2, 62, -2], b: [2, 64, 2], v: B.OAK_LEAVES });
  boxes.push({ a: [0, 59, 0], b: [0, 64, 0], v: B.OAK_LOG });
  return { kind: 'spires', boxes, lobby: [0.5, 101, 0.5], spawns, teams: [], gens: [], voidY: 20, buildTop: 96, bounds: 48 };
}

const TEAMS: [string, string, string, number, number][] = [
  ['ember', 'Ember', '#e5533d', B.RED_WOOL, B.RED_WOOL],
  ['frost', 'Frost', '#cfe3f2', B.WHITE_WOOL, B.WHITE_WOOL],
  ['dawn', 'Dawn', '#e8c547', B.YELLOW_WOOL, B.YELLOW_WOOL],
  ['grove', 'Grove', '#62c25c', B.MOSSY_COBBLESTONE, B.WHITE_WOOL],
];

function hearthfall(): ArenaLayout {
  const boxes = lobbyBoxes();
  const teams: TeamDef[] = [];
  const gens: GenDef[] = [];
  const dirs: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  const Y = FLOOR_Y;
  dirs.forEach(([dx, dz], i) => {
    const [key, name, color, floor, wool] = TEAMS[i];
    const cx = dx * 36, cz = dz * 36;
    const px = -dz, pz = dx;
    boxes.push({ a: [cx - 5, Y - 1, cz - 5], b: [cx + 5, Y - 1, cz + 5], v: B.STONE });
    boxes.push({ a: [cx - 5, Y, cz - 5], b: [cx + 5, Y, cz + 5], v: floor });
    boxes.push({ a: [cx - 2, Y, cz - 2], b: [cx + 2, Y, cz + 2], v: B.STONE_BRICKS });
    const hx = cx - dx * 4, hz = cz - dz * 4;
    boxes.push({ a: [hx - 1, Y + 1, hz - 1], b: [hx + 1, Y + 1, hz + 1], v: wool });
    boxes.push({ a: [hx, Y + 2, hz], b: [hx, Y + 2, hz], v: wool });
    boxes.push({ a: [hx, Y + 1, hz], b: [hx, Y + 1, hz], v: B.GLOWSTONE });
    const fx = cx + dx * 4, fz = cz + dz * 4;
    boxes.push({ a: [fx - 1, Y, fz - 1], b: [fx + 1, Y, fz + 1], v: B.IRON_BLOCK });
    const nx = cx + px * 4 + dx, nz = cz + pz * 4 + dz;
    boxes.push({ a: [nx, Y, nz], b: [nx, Y, nz], v: B.GOLD_BLOCK });
    teams.push({
      key, name, color, floor, wool, dir: [dx, dz],
      base: [cx, Y, cz], hearth: [hx, Y + 1, hz], spawn: [cx + dx * 1.5 + 0.5, Y + 1, cz + dz * 1.5 + 0.5],
      forge: [fx + 0.5, Y + 1.2, fz + 0.5], npc: [nx + 0.5, Y + 1, nz + 0.5],
    });
    gens.push({ pos: [fx + 0.5, Y + 1.2, fz + 0.5], item: 'iron', every: 24, team: i });
    gens.push({ pos: [fx + 0.5, Y + 1.2, fz + 0.5], item: 'gold', every: 160, team: i });
  });
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const x = sx * 22, z = sz * 22;
    boxes.push({ a: [x - 2, Y - 1, z - 2], b: [x + 2, Y, z + 2], v: B.STONE_BRICKS });
    boxes.push({ a: [x, Y, z], b: [x, Y, z], v: B.AETHERITE_BLOCK });
    gens.push({ pos: [x + 0.5, Y + 1.2, z + 0.5], item: 'aetherite', every: 600 });
  }
  boxes.push({ a: [-5, Y - 1, -5], b: [5, Y - 1, 5], v: B.STONE });
  boxes.push({ a: [-5, Y, -5], b: [5, Y, 5], v: B.STONE_BRICKS });
  boxes.push({ a: [-1, Y, -1], b: [1, Y, 1], v: B.GOLD_BLOCK });
  boxes.push({ a: [0, Y, 0], b: [0, Y, 0], v: B.AETHERITE_BLOCK });
  gens.push({ pos: [0.5, Y + 1.2, 0.5], item: 'aetherite', every: 400 });
  gens.push({ pos: [0.5, Y + 1.2, 0.5], item: 'gold', every: 100 });
  return { kind: 'hearthfall', boxes, lobby: [0.5, 101, 0.5], spawns: teams.map((t) => t.spawn), teams, gens, voidY: 30, buildTop: 92, bounds: 64 };
}

const cache = new Map<ArenaKind, ArenaLayout>();
export function arenaLayout(kind: ArenaKind): ArenaLayout {
  let l = cache.get(kind);
  if (!l) { l = kind === 'spires' ? spires() : hearthfall(); cache.set(kind, l); }
  return l;
}

export function arenaBlockAt(kind: ArenaKind, x: number, y: number, z: number): number {
  const l = arenaLayout(kind);
  let v = 0;
  for (const b of l.boxes) {
    if (x >= Math.min(b.a[0], b.b[0]) && x <= Math.max(b.a[0], b.b[0]) && y >= Math.min(b.a[1], b.b[1]) && y <= Math.max(b.a[1], b.b[1]) && z >= Math.min(b.a[2], b.b[2]) && z <= Math.max(b.a[2], b.b[2])) v = b.v;
  }
  return v;
}

export function generateArenaChunk(kind: ArenaKind, cx: number, cz: number): Uint16Array {
  const out = new Uint16Array(CHUNK_VOLUME);
  const S = CHUNK_SIZE, bx = cx * S, bz = cz * S;
  for (const b of arenaLayout(kind).boxes) {
    const x0 = Math.max(Math.min(b.a[0], b.b[0]), bx), x1 = Math.min(Math.max(b.a[0], b.b[0]), bx + S - 1);
    const z0 = Math.max(Math.min(b.a[2], b.b[2]), bz), z1 = Math.min(Math.max(b.a[2], b.b[2]), bz + S - 1);
    if (x0 > x1 || z0 > z1) continue;
    const y0 = Math.min(b.a[1], b.b[1]), y1 = Math.max(b.a[1], b.b[1]);
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) out[(y * S + (z - bz)) * S + (x - bx)] = b.v;
  }
  return out;
}

export function isArenaKind(v: unknown): v is ArenaKind {
  return v === 'spires' || v === 'hearthfall';
}

import { CHUNK_SIZE, CHUNK_VOLUME } from '../../constants';
import { duelsLayout } from '../duels/layout';
import { B, DyeColor, woolId, terracottaId, stainedGlassId, concreteId } from '../../blocks';

export type ArenaKind = 'spires' | 'hearthfall' | 'duels';
export const ARENA_KINDS: ArenaKind[] = ['spires', 'hearthfall', 'duels'];
export const ARENA_INFO: Record<ArenaKind, { name: string; alt: string; desc: string }> = {
  spires: { name: 'Fortune Spires', alt: 'Pillars of Fortune', desc: 'Everyone starts on a lonely pillar over the void. Every five seconds Fortune hands out a random item from anywhere in the game. Bridge, brawl, be the last one standing.' },
  hearthfall: { name: 'Hearthfall', alt: 'Bedwars', desc: 'Four teams, four island hearths. Forges pour out iron and gold, diamonds and emeralds wait on the outer islands. Buy gear and team upgrades from the Quartermaster. While your hearth burns you respawn. Snuff out the rest.' },
  duels: { name: 'Proving Grounds', alt: 'PvP Duels', desc: 'Pick a kit and fight one on one: queue for another player, challenge a friend, or spar against a bot from Squire to Warlord. Bots crit, strafe, W-tap, block with shields and throw pearls.' },
};

export type V3 = [number, number, number];
export interface Box { a: V3; b: V3; v: number; }

export interface TeamDef { key: string; name: string; color: string; floor: number; wool: number; base: V3; hearth: V3; spawn: V3; forge: V3; npc: V3; dir: [number, number]; }
export interface GenDef { pos: V3; item: 'iron' | 'gold' | 'aetherite' | 'emerald'; every: number; team?: number; tier?: 'dia' | 'em'; needForge?: number; }

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

export interface TeamTint { wool: number; clay: number; glass: number; concrete: number }
const tint = (c: DyeColor): TeamTint => ({ wool: woolId(c), clay: terracottaId(c), glass: stainedGlassId(c), concrete: concreteId(c) });
const TEAMS: [string, string, string, DyeColor][] = [
  ['ember', 'Ember', '#e5533d', 'red'],
  ['frost', 'Frost', '#7fc8f0', 'light_blue'],
  ['dawn', 'Dawn', '#e8c547', 'yellow'],
  ['grove', 'Grove', '#62c25c', 'lime'],
];
export const TEAM_TINTS: TeamTint[] = TEAMS.map((t) => tint(t[3]));
export const TEAM_WOOLS = new Set<number>(TEAM_TINTS.map((t) => t.wool));

export const HEARTH_DIST = 40;

function hearthfall(): ArenaLayout {
  const boxes = lobbyBoxes();
  const teams: TeamDef[] = [];
  const gens: GenDef[] = [];
  const Y = FLOOR_Y;
  const add = (a: V3, b: V3, v: number) => boxes.push({ a, b, v });
  const dirs: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  dirs.forEach(([dx, dz], i) => {
    const [key, name, color] = TEAMS[i];
    const tt = TEAM_TINTS[i];
    const cx = dx * HEARTH_DIST, cz = dz * HEARTH_DIST;
    const px = -dz, pz = dx;
    const at = (u: number, v: number): [number, number] => [cx + dx * u + px * v, cz + dz * u + pz * v];
    const L = (u0: number, v0: number, u1: number, v1: number, y0: number, y1: number, v: number) => {
      const [x0, z0] = at(u0, v0), [x1, z1] = at(u1, v1);
      add([x0, y0, z0], [x1, y1, z1], v);
    };
    L(-2, -2, 2, 2, Y - 4, Y - 4, B.COBBLESTONE);
    L(-4, -4, 4, 4, Y - 3, Y - 3, B.STONE);
    L(-6, -6, 6, 6, Y - 2, Y - 2, B.STONE);
    L(-7, -7, 7, 7, Y - 1, Y - 1, B.DIRT);
    L(-7, -7, 7, 7, Y, Y, tt.concrete);
    L(-6, -6, 6, 6, Y, Y, B.STONE_BRICKS);
    L(-2, -6, 2, 6, Y, Y, B.SMOOTH_STONE);
    for (const [u, v] of [[-6, -6], [-6, 6], [6, -6], [6, 6]] as const) L(u, v, u, v, Y, Y, B.GLOWSTONE);
    L(-5, -1, -3, 1, Y + 1, Y + 1, tt.wool);
    L(-4, 0, -4, 0, Y + 2, Y + 2, tt.wool);
    L(-4, 0, -4, 0, Y + 1, Y + 1, B.GLOWSTONE);
    L(4, -1, 6, 1, Y, Y, B.IRON_BLOCK);
    L(7, -2, 7, 2, Y + 1, Y + 1, B.COBBLESTONE);
    L(4, -2, 4, -2, Y + 1, Y + 1, B.COBBLESTONE);
    L(4, 2, 4, 2, Y + 1, Y + 1, B.COBBLESTONE);
    for (const [u, v] of [[0, 4], [2, 4], [0, 6], [2, 6]] as const) L(u, v, u, v, Y + 1, Y + 3, B.OAK_LOG);
    L(0, 4, 2, 6, Y + 4, Y + 4, B.OAK_PLANKS);
    L(1, 5, 1, 5, Y, Y, B.GOLD_BLOCK);
    L(5, -5, 5, -5, Y + 1, Y + 4, B.OAK_LOG);
    L(4, -6, 6, -4, Y + 4, Y + 5, B.OAK_LEAVES);
    L(5, -5, 5, -5, Y + 4, Y + 4, B.OAK_LOG);
    L(5, -5, 5, -5, Y + 6, Y + 6, B.OAK_LEAVES);
    const [hx, hz] = at(-4, 0), [fx, fz] = at(5, 0), [nx, nz] = at(1, 5), [sx, sz] = at(1, 0);
    teams.push({
      key, name, color, floor: tt.concrete, wool: tt.wool, dir: [dx, dz],
      base: [cx, Y, cz], hearth: [hx, Y + 1, hz], spawn: [sx + 0.5, Y + 1, sz + 0.5],
      forge: [fx + 0.5, Y + 1.2, fz + 0.5], npc: [nx + 0.5, Y + 1, nz + 0.5],
    });
    gens.push({ pos: [fx + 0.5, Y + 1.2, fz + 0.5], item: 'iron', every: 22, team: i });
    gens.push({ pos: [fx + 0.5, Y + 1.2, fz + 0.5], item: 'gold', every: 150, team: i });
    gens.push({ pos: [fx + 0.5, Y + 1.2, fz + 0.5], item: 'emerald', every: 1200, team: i, needForge: 3 });
  });
  const D = 24;
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const x = sx * D, z = sz * D;
    add([x - 1, Y - 3, z - 1], [x + 1, Y - 3, z + 1], B.COBBLESTONE);
    add([x - 2, Y - 2, z - 2], [x + 2, Y - 2, z + 2], B.STONE);
    add([x - 3, Y - 1, z - 3], [x + 3, Y - 1, z + 3], B.DIRT);
    add([x - 3, Y, z - 3], [x + 3, Y, z + 3], B.GRASS);
    add([x - 1, Y, z - 1], [x + 1, Y, z + 1], B.STONE_BRICKS);
    add([x, Y, z], [x, Y, z], B.AETHERITE_BLOCK);
    add([x + sx * 3, Y + 1, z + sz * 3], [x + sx * 3, Y + 2, z + sz * 3], B.MOSSY_COBBLESTONE);
    add([x + sx * 3, Y + 3, z + sz * 3], [x + sx * 3, Y + 3, z + sz * 3], B.GLOWSTONE);
    gens.push({ pos: [x + 0.5, Y + 1.2, z + 0.5], item: 'aetherite', every: 600, tier: 'dia' });
  }
  add([-2, Y - 4, -2], [2, Y - 4, 2], B.COBBLESTONE);
  add([-4, Y - 3, -4], [4, Y - 3, 4], B.STONE);
  add([-6, Y - 2, -6], [6, Y - 2, 6], B.STONE);
  add([-8, Y - 1, -8], [8, Y - 1, 8], B.STONE);
  add([-8, Y, -8], [8, Y, 8], B.STONE_BRICKS);
  add([-7, Y, -7], [7, Y, 7], B.SMOOTH_STONE);
  add([-3, Y + 1, -3], [3, Y + 1, 3], B.STONE_BRICKS);
  for (const [a, b] of [[-3, -3], [-3, 3], [3, -3], [3, 3]]) add([a, Y + 1, b], [a, Y + 1, b], B.CHISELED_STONE_BRICKS);
  for (const [a, b] of [[-7, -7], [-7, 7], [7, -7], [7, 7]]) { add([a, Y + 1, b], [a, Y + 3, b], B.CHISELED_STONE_BRICKS); add([a, Y + 4, b], [a, Y + 4, b], B.GLOWSTONE); }
  add([-2, Y + 1, 0], [-2, Y + 1, 0], B.EMERALD_BLOCK);
  add([2, Y + 1, 0], [2, Y + 1, 0], B.EMERALD_BLOCK);
  gens.push({ pos: [-1.5, Y + 2.2, 0.5], item: 'emerald', every: 1300, tier: 'em' });
  gens.push({ pos: [2.5, Y + 2.2, 0.5], item: 'emerald', every: 1300, tier: 'em' });
  return { kind: 'hearthfall', boxes, lobby: [0.5, 101, 0.5], spawns: teams.map((t) => t.spawn), teams, gens, voidY: 30, buildTop: 96, bounds: 64 };
}

const cache = new Map<ArenaKind, ArenaLayout>();
export function arenaLayout(kind: ArenaKind): ArenaLayout {
  let l = cache.get(kind);
  if (!l) { l = kind === 'spires' ? spires() : kind === 'duels' ? duelsLayout() : hearthfall(); cache.set(kind, l); }
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

export function generateArenaChunk(kind: ArenaKind, cx: number, cz: number): Uint32Array {
  const out = new Uint32Array(CHUNK_VOLUME);
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
  return v === 'spires' || v === 'hearthfall' || v === 'duels';
}

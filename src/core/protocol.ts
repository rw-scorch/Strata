import type { ArenaKind } from './labs/minigames/arena';
import type { GameState } from './labs/minigames/Minigame';
import type { ScreenType } from './sim/WorldSim';
import type { GameMode, Difficulty } from './constants';
import type { Appearance } from './sim/WorldSim';
import type { PlayerInv, ItemStack, InvOp } from './inventory';

export interface PackRef { name: string; hash: string; }

export interface RoomSettings {
  pvp: boolean;
  guestsBuild: boolean;
  cheats: boolean;
  personalPacks: boolean;
}

export interface RoomMeta {
  code: string;
  name: string;
  ownerId: string;
  ownerName: string;
  mode: GameMode;
  difficulty: Difficulty;
  maxPlayers: number;
  seed: number;
  createdAt: number;
  version: number;
  pack: PackRef | null;
  settings: RoomSettings;
  region: string;
  arena?: ArenaKind | null;
}

export interface RoomInfo {
  exists: boolean;
  code: string;
  name?: string;
  ownerName?: string;
  mode?: GameMode;
  difficulty?: Difficulty;
  maxPlayers?: number;
  players?: { id: string; name: string }[];
  version?: number;
  pack?: PackRef | null;
  arena?: ArenaKind | null;
}

export interface PublicPlayer { id: string; name: string; appearance: Appearance; op: boolean; mode: GameMode; muted?: boolean; }

export interface YouState {
  id: string; x: number; y: number; z: number; yaw: number; pitch: number;
  mode: GameMode; inv: PlayerInv; health: number; food: number; sat: number; air: number; xp: number; dead: boolean;
  spawn: { x: number; y: number; z: number }; op: boolean;
}

export type C2S =
  | { t: 'hello'; v: number; id: string; secret: string; name: string; appearance: Appearance }
  | { t: 'mv'; p: number[] }
  | { t: 'chunks'; want: number[][] }
  | { t: 'dig'; a: 'start' | 'abort' | 'done'; x: number; y: number; z: number }
  | { t: 'use'; x: number; y: number; z: number; nx: number; ny: number; nz: number; f?: number }
  | { t: 'eat' }
  | { t: 'bow'; p: number; y: number; x: number }
  | { t: 'trd'; id: number; i: number; n: number }
  | { t: 'atk'; id: number }
  | { t: 'pvp'; pid: string }
  | { t: 'inv'; op: InvOp; s: number }
  | { t: 'chat'; text: string }
  | { t: 'respawn' }
  | { t: 'room'; name?: string; difficulty?: Difficulty; maxPlayers?: number; settings?: Partial<RoomSettings>; pack?: PackRef | null }
  | { t: 'kick'; pid: string }
  | { t: 'mute'; pid: string; on: boolean }
  | { t: 'ping'; c: number }
  | { t: 'resync' }
  | { t: 'buy'; k: string }
  | { t: 'ue'; id: number };

export type S2C =
  | { t: 'welcome'; you: YouState; room: RoomMeta; players: PublicPlayer[]; time: number; cycle: boolean; weather: string; worldSpawn: { x: number; y: number; z: number } }
  | { t: 'err'; code: 'invalid' | 'full' | 'version' | 'auth' | 'kicked' | 'banned' | 'unavailable' | 'duplicate'; msg: string }
  | { t: 'chunk'; cx: number; cz: number; d: string | null }
  | { t: 'blk'; u: number[][] }
  | { t: 'pl'; u: (string | number)[][] }
  | { t: 'pj'; p: PublicPlayer }
  | { t: 'pq'; id: string; name: string }
  | { t: 'ent'; a: number[][]; u: number[][]; r: number[] }
  | { t: 'vit'; h: number; f: number; s: number; a: number; xp: number; dead: boolean; mode: GameMode; fire?: boolean }
  | { t: 'inv'; inv: PlayerInv }
  | { t: 'ack'; s: number; ok: boolean; h: number }
  | { t: 'cont'; k: string; type: 'chest' | 'furnace'; items: (ItemStack | null)[]; burn?: number; burnMax?: number; cook?: number }
  | { t: 'scr'; type: ScreenType | null; x: number; y: number; z: number }
  | { t: 'snd'; s: string; x: number; y: number; z: number; v?: number; p?: number }
  | { t: 'fx'; k: string; x: number; y: number; z: number; d?: number }
  | { t: 'hurt'; a: number; c: string; fx: number; fz: number }
  | { t: 'death'; msg: string }
  | { t: 'respawn'; x: number; y: number; z: number }
  | { t: 'tp'; x: number; y: number; z: number }
  | { t: 'chat'; from: { id: string; name: string } | null; text: string; kind: 'chat' | 'system' | 'death' | 'join' | 'leave' | 'info' | 'error'; ts: number }
  | { t: 'time'; time: number; cycle: boolean }
  | { t: 'wx'; w: string }
  | { t: 'bolt'; x: number; y: number; z: number }
  | { t: 'room'; room: RoomMeta; players: PublicPlayer[] }
  | { t: 'pong'; c: number; s: number }
  | { t: 'mode'; mode: GameMode }
  | { t: 'crafted'; r: string; n: number }
  | { t: 'game'; s: GameState }
  | { t: 'title'; text: string; sub: string }
  | { t: 'trade'; id: number; prof: number; xp: number; uses: number[] }
  | { t: 'lid'; x: number; y: number; z: number; n: number };

export const ENT_KIND = { mob: 0, item: 1, arrow: 2 } as const;

export function q2(n: number): number { return Math.round(n * 100) / 100; }

export function isNum(v: unknown, min = -1e7, max = 1e7): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
}

export function isInt(v: unknown, min = -1e7, max = 1e7): v is number {
  return Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
}

export function cleanName(raw: unknown): string {
  const s = typeof raw === 'string' ? raw : '';
  const t = s.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);
  return t || 'Wanderer';
}

export function cleanText(raw: unknown, max = 200): string {
  const s = typeof raw === 'string' ? raw : '';
  return s.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
}

export function cleanAppearance(raw: unknown): Appearance {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const pick = (v: unknown, n: number) => (isInt(v, 0, n - 1) ? v : 0);
  return { skin: pick(o.skin, 8), hair: pick(o.hair, 8), shirt: pick(o.shirt, 12), pants: pick(o.pants, 12) };
}

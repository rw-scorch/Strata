export const GAME_NAME = 'Strata';
export const GAME_VERSION = '0.11.0';
export const PROTOCOL_VERSION = 6;
/** Oldest client protocol a server still accepts, so players on a cached page keep working after a deploy. */
export const MIN_PROTOCOL_VERSION = 3;
export const SAVE_VERSION = 2;

export const CHUNK_SIZE = 16;
export const CHUNK_SHIFT = 4;
export const WORLD_HEIGHT = 160;
export const SEA_LEVEL = 56;
export const CHUNK_VOLUME = CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT;

export const TICKS_PER_DAY = 24000;

export function timeRate(time: number): number {
  const t = ((time % TICKS_PER_DAY) + TICKS_PER_DAY) % TICKS_PER_DAY;
  if (t < 12000) return 1 / 3;
  if (t >= 13000 && t < 23000) return 2;
  return 1;
}
export const TICK_RATE = 20;

export const REACH_SURVIVAL = 5;
export const REACH_CREATIVE = 7;

export const DEFAULT_MAX_PLAYERS = 20;
export const MAX_PLAYERS_LIMIT = 50;

export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 8;

export type GameMode = 'survival' | 'creative';
export type Difficulty = 'peaceful' | 'easy' | 'normal' | 'hard';
export const DIFFICULTIES: Difficulty[] = ['peaceful', 'easy', 'normal', 'hard'];

export const MODE_TITLES: Record<GameMode, { title: string; sub: string }> = {
  survival: { title: 'Wayfarer', sub: 'Survival' },
  creative: { title: 'Architect', sub: 'Creative' },
};

export function isValidRoomCode(code: string): boolean {
  if (code.length !== ROOM_CODE_LENGTH) return false;
  for (const ch of code) if (!ROOM_CODE_ALPHABET.includes(ch)) return false;
  return true;
}

export function normalizeRoomCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, ROOM_CODE_LENGTH);
}

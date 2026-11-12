import type { ArenaKind } from '../core/labs/minigames/arena';
import { dbGet, dbPut, dbDelete, dbKeys, dbAll, dbPutMany, prefixRange } from './db';
import { encodeRLE, decodeRLE, u16ToBase64, base64ToU16 } from '../core/chunk';
import { SAVE_VERSION, GameMode, Difficulty } from '../core/constants';
import type { PlayerInv } from '../core/inventory';
import type { BlockEntity, Weather } from '../core/sim/WorldSim';
import type { MobType } from '../core/sim/mobs';

export interface WorldMeta {
  id: string;
  name: string;
  seed: number;
  mode: GameMode;
  difficulty: Difficulty;
  createdAt: number;
  lastPlayed: number;
  version: number;
  playTime: number;
  arena?: ArenaKind | null;
}

export interface SavedPlayer {
  x: number; y: number; z: number; yaw: number; pitch: number; mode: GameMode; flying: boolean;
  inv: PlayerInv; health: number; food: number; sat: number; air: number; xp: number; dead: boolean;
  spawn: { x: number; y: number; z: number };
  homes?: Record<string, { x: number; y: number; z: number }>;
  back?: { x: number; y: number; z: number };
}

export interface WorldState {
  player: SavedPlayer | null;
  time: number;
  weather: Weather;
  weatherTimer: number;
  spawn: { x: number; y: number; z: number } | null;
  blockEntities: [string, BlockEntity][];
  beChunks: string[];
  mobs: { type: MobType; x: number; y: number; z: number; health: number }[];
  dayCycle: boolean;
  populated?: number[];
  rules?: { simDistance?: number; randomTickSpeed?: number; mobSpawning?: boolean; mobCap?: number; maxHomes?: number; tpa?: boolean; allowMinimap?: boolean; allowCoords?: boolean };
  cheats: boolean;
}

interface WorldRecord { meta: WorldMeta; state: WorldState | null; }

function newId(): string {
  const b = new Uint8Array(8);
  crypto.getRandomValues(b);
  return 'w-' + [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

function migrate(rec: WorldRecord): WorldRecord {
  const m = rec.meta;
  if (m.version < 2 && rec.state) {
    rec.state.beChunks ??= [];
    rec.state.mobs ??= [];
    rec.state.dayCycle ??= true;
    rec.state.cheats ??= m.mode === 'creative';
  }
  m.playTime ??= 0;
  m.version = SAVE_VERSION;
  return rec;
}

export const WorldStorage = {
  async list(): Promise<WorldMeta[]> {
    const all = await dbAll<WorldRecord>('worlds');
    return all.map((r) => migrate(r).meta).sort((a, b) => b.lastPlayed - a.lastPlayed);
  },

  async create(name: string, seed: number, mode: GameMode, difficulty: Difficulty, arena: ArenaKind | null = null): Promise<WorldMeta> {
    const meta: WorldMeta = { id: newId(), name: name.slice(0, 32) || 'New World', seed, mode, difficulty, createdAt: Date.now(), lastPlayed: Date.now(), version: SAVE_VERSION, playTime: 0, arena };
    await dbPut('worlds', meta.id, { meta, state: null } satisfies WorldRecord);
    return meta;
  },

  async load(id: string): Promise<WorldRecord | null> {
    const r = await dbGet<WorldRecord>('worlds', id);
    return r ? migrate(r) : null;
  },

  async saveState(meta: WorldMeta, state: WorldState): Promise<void> {
    meta.lastPlayed = Date.now();
    await dbPut('worlds', meta.id, { meta, state } satisfies WorldRecord);
  },

  async rename(id: string, name: string): Promise<void> {
    const r = await this.load(id);
    if (!r) return;
    r.meta.name = name.slice(0, 32) || r.meta.name;
    await dbPut('worlds', id, r);
  },

  async remove(id: string): Promise<void> {
    const keys = await dbKeys('chunks', prefixRange(`${id}|`));
    for (let i = 0; i < keys.length; i += 500) await Promise.all(keys.slice(i, i + 500).map((k) => dbDelete('chunks', k)));
    await dbDelete('worlds', id);
  },

  async duplicate(id: string): Promise<WorldMeta | null> {
    const r = await this.load(id);
    if (!r) return null;
    const meta: WorldMeta = { ...r.meta, id: newId(), name: `${r.meta.name} (copy)`.slice(0, 32), createdAt: Date.now(), lastPlayed: Date.now() };
    const keys = (await dbKeys('chunks', prefixRange(`${id}|`))) as string[];
    const batch: [string, unknown][] = [];
    for (const k of keys) {
      const v = await dbGet<Uint16Array>('chunks', k);
      if (v) batch.push([`${meta.id}|${k.slice(id.length + 1)}`, v]);
      if (batch.length >= 200) await dbPutMany('chunks', batch.splice(0));
    }
    await dbPutMany('chunks', batch);
    await dbPut('worlds', meta.id, { meta, state: r.state } satisfies WorldRecord);
    return meta;
  },

  async chunkKeys(id: string): Promise<Set<string>> {
    const keys = (await dbKeys('chunks', prefixRange(`${id}|`))) as string[];
    return new Set(keys.map((k) => k.slice(id.length + 1)));
  },

  async loadChunk(id: string, cx: number, cz: number): Promise<Uint16Array | null> {
    const v = await dbGet<Uint16Array>('chunks', `${id}|${cx},${cz}`);
    if (!v) return null;
    try { return decodeRLE(v instanceof Uint16Array ? v : new Uint16Array(v as ArrayBuffer)); } catch { return null; }
  },

  async saveChunks(id: string, chunks: { cx: number; cz: number; data: Uint16Array }[]): Promise<void> {
    if (!chunks.length) return;
    await dbPutMany('chunks', chunks.map((c) => [`${id}|${c.cx},${c.cz}`, encodeRLE(c.data)]));
  },

  async exportWorld(id: string): Promise<Blob> {
    const r = await this.load(id);
    if (!r) throw new Error('World not found');
    const keys = (await dbKeys('chunks', prefixRange(`${id}|`))) as string[];
    const chunks: Record<string, string> = {};
    for (const k of keys) {
      const v = await dbGet<Uint16Array>('chunks', k);
      if (v) chunks[k.slice(id.length + 1)] = u16ToBase64(v);
    }
    return new Blob([JSON.stringify({ format: 'strata-world', version: SAVE_VERSION, meta: r.meta, state: r.state, chunks })], { type: 'application/json' });
  },

  async importWorld(file: File): Promise<WorldMeta> {
    const j = JSON.parse(await file.text()) as { format?: string; meta: WorldMeta; state: WorldState | null; chunks: Record<string, string> };
    if (j.format !== 'strata-world' || !j.meta) throw new Error('This is not a Strata world file.');
    const meta: WorldMeta = { ...j.meta, id: newId(), lastPlayed: Date.now() };
    const batch: [string, unknown][] = Object.entries(j.chunks ?? {}).map(([k, b64]) => [`${meta.id}|${k}`, base64ToU16(b64).slice()]);
    for (let i = 0; i < batch.length; i += 200) await dbPutMany('chunks', batch.slice(i, i + 200));
    await dbPut('worlds', meta.id, migrate({ meta, state: j.state }));
    return meta;
  },
};

import type { RuleSet } from '../core/sim/WorldSim';
export interface TradeInfo { id: string; prof: number; xp: number; uses: number[]; }
import type { GameMode, Difficulty } from '../core/constants';
import type { PlayerInv, InvOp, ItemStack } from '../core/inventory';
import type { Weather, Appearance, SimPlayer, BlockEntity, WorldSim, ScreenType } from '../core/sim/WorldSim';
import type { GameState } from '../core/labs/minigames/Minigame';
import type { ArenaKind } from '../core/labs/minigames/arena';
import type { RoomMeta, PublicPlayer, S2C } from '../core/protocol';
import type { DataRecipes } from '../core/crafting';

export type ChatKind = 'chat' | 'system' | 'death' | 'join' | 'leave' | 'info' | 'error';

export interface Vitals { health: number; food: number; sat: number; air: number; xp: number; dead: boolean; mode: GameMode; fire?: boolean; absorb?: number; }

export interface SessionEvents {
  block(x: number, y: number, z: number, v: number, old: number): void;
  entity(id: string, kind: 'mob' | 'item' | 'arrow', type: number, x: number, y: number, z: number, yaw: number, flags: number, extra: number): void;
  entityRemove(id: string, death: boolean, pickupBy?: string): void;
  sound(name: string, x: number, y: number, z: number, vol?: number, pitch?: number): void;
  fx(kind: string, x: number, y: number, z: number, data?: number): void;
  vitals(v: Vitals): void;
  inventory(inv: PlayerInv): void;
  container(key: string, type: 'chest' | 'furnace', items: (ItemStack | null)[], burn?: number, burnMax?: number, cook?: number): void;
  screen(type: ScreenType | null, x: number, y: number, z: number, title?: string): void;
  eco?(m: Extract<S2C, { t: 'eco' }>): void;
  game(state: GameState): void;
  title(text: string, sub: string): void;
  trade?(info: TradeInfo): void;
  chestLid?(x: number, y: number, z: number, n: number): void;
  hurt(amount: number, cause: string, fx: number, fz: number, kb?: number): void;
  death(msg: string): void;
  respawn(x: number, y: number, z: number): void;
  teleport(x: number, y: number, z: number): void;
  chat(from: { id: string; name: string } | null, text: string, kind: ChatKind, ts: number): void;
  time(time: number, cycle: boolean): void;
  weather(w: Weather): void;
  lightning(x: number, y: number, z: number): void;
  player(p: PublicPlayer): void;
  playerLeft(id: string, name: string): void;
  playerMove(id: string, x: number, y: number, z: number, yaw: number, pitch: number, flags: number): void;
  room(meta: RoomMeta, players: PublicPlayer[]): void;
  mode(mode: GameMode): void;
  crafted(recipeId: string, times: number): void;
  connection(state: 'connecting' | 'online' | 'reconnecting' | 'offline', detail?: string): void;
  chunkData(cx: number, cz: number, data: Uint16Array | null): void;
  rules?(r: RuleSet): void;
  rtc?(from: string, d: unknown): void;
  recipes?(d: DataRecipes[]): void;
}

export interface SessionInfo {
  kind: 'local' | 'remote';
  name: string;
  seed: number;
  mode: GameMode;
  difficulty: Difficulty;
  spawn: { x: number; y: number; z: number };
  roomCode?: string;
  isOwner: boolean;
  arena?: ArenaKind | null;
}

export interface GameSession {
  readonly info: SessionInfo;
  readonly sim: WorldSim;
  readonly me: SimPlayer;
  start(): Promise<void>;
  tick(dt: number, nowMs: number): void;
  move(x: number, y: number, z: number, yaw: number, pitch: number, flags: number): void;
  digStart(x: number, y: number, z: number): void;
  digAbort(): void;
  digDone(x: number, y: number, z: number): void;
  use(x: number, y: number, z: number, nx: number, ny: number, nz: number, forcePlace?: boolean): void;
  eat(): void;
  attack(entityId: string): void;
  useEntity(entityId: string): void;
  shoot(power: number, yaw: number, pitch: number): void;
  swing?(): void;
  trade(entityId: string, index: number, times: number): void;
  attackPlayer(pid: string): void;
  invOp(op: InvOp): void;
  chat(text: string): void;
  respawn(): void;
  buy?(key: string): void;
  roomUpdate?(patch: { name?: string; difficulty?: Difficulty; maxPlayers?: number; settings?: Partial<RoomMeta['settings']>; pack?: RoomMeta['pack'] }): void;
  kick?(pid: string): void;
  mute?(pid: string, on: boolean): void;
  requestChunk?(cx: number, cz: number): void;
  setAppearance?(a: Appearance): void;
  getBlockEntity(key: string): BlockEntity | undefined;
  save?(manual: boolean): Promise<void>;
  close(): void;
  stats(): { rtt: number; inRate: number; outRate: number; state: string };
  setDataPacks?(d: DataRecipes[]): void;
}

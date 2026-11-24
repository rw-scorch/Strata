import type { CrucibleView } from '../core/sim/crucible';
import { Contrails, type Glider } from '../rendering/Contrails';
import type { BlockArray } from '../core/chunk';
import { isNether, isEnd, localX, dimOf } from '../core/dimension';
import { NETHER_FOG, type NetherBiome } from '../core/worldgen/nether';
import { GEN_LEVEL } from '../core/worldgen/genLevel';
import { MOB_BY_CODE } from '../core/sim/mobs';
import { loadCustomSkin } from '../resources/skins';
import { VoiceChat, VoiceState } from '../audio/VoiceChat';
import type { RuleSet } from '../core/sim/WorldSim';
import { MF } from '../core/sim/WorldSim';
import * as THREE from 'three';
import { raycast } from '../core/physics';
import { bound, bindOf, keyName } from '../controls/keybinds';
import { guardHistory } from '../ui/touchGuard';
import { showBlueprints } from '../ui/BlueprintUI';
import type { Blueprint } from '../core/blueprint';
import { Renderer, FrameEnv } from '../rendering/Renderer';
import { ChunkManager } from './ChunkManager';
import { LocalPlayer } from './Player';
import { BlockInteraction } from './BlockInteraction';
import { InputState } from '../controls/InputState';
import { DesktopControls } from '../controls/DesktopControls';
import { MobileControls } from '../controls/MobileControls';
import { HUD } from '../ui/HUD';
import { InventoryUI, InvScreen } from '../ui/InventoryUI';
import { showDataPacks } from '../ui/DataPacksUI';
import { EconomyUI } from '../ui/EconomyUI';
import type { S2C } from '../core/protocol';
import { money } from '../core/economy';
import { setTooltipBook } from '../ui/mc/Gui';
import { BASE_BOOK } from '../core/crafting';
import { ChatUI, showPause, showInvite, showPlayers, showRoomSettings, showShaper, showDeath, showMischief, showSovereign } from '../ui/GameUI';
import { h, toast, modal } from '../ui/dom';
import type { TextureAtlas } from '../resources/TextureAtlas';
import { FACE_SLOTS } from '../resources/TextureAtlas';
import type { GameSession, SessionEvents, Vitals } from './Session';
import { LocalSession } from './LocalSession';
import { RemoteSession } from '../multiplayer/RemoteSession';
import { ArenaUI } from '../ui/labs/ArenaUI';
import { Minimap } from '../ui/Minimap';
import type { ArenaKind } from '../core/labs/minigames/arena';
import type { ScreenType } from '../core/sim/WorldSim';
import { getSettings, onSettings, updateSettings, Settings, isTouchDevice, getIdentity } from '../storage/Settings';
import { WorldStorage, WorldMeta } from '../storage/WorldStorage';
import { audio } from '../audio/AudioEngine';
import { B, CB, getBlock, blockId, LIGHT_EMIT, isWaterLike, tix, bid, WIDE_BASE, ID_LIMIT, isReplaceable } from '../core/blocks';
import { heldStack, equipmentOf } from '../core/inventory';
import { attackCharge, attackStats } from '../core/sim/combat';
import { MODE_TITLES, TICKS_PER_DAY, WORLD_HEIGHT, timeRate } from '../core/constants';
import { biomeNameAt, WorldGenerator } from '../core/worldgen/WorldGenerator';
import type { RoomMeta, PublicPlayer } from '../core/protocol';
import type { Weather } from '../core/sim/WorldSim';
import { getItem, I, maxDurability } from '../core/items';

export interface AppHooks {
  exitToTitle(reason?: string): void;
  openSettings(onClose: () => void): void;
  openPacks(onClose: () => void): void;
  currentAtlas(): TextureAtlas;
  rebuildAtlas(packIds?: string[]): Promise<TextureAtlas>;
  activePackRef(): { name: string; hash: string } | null;
  packIdForHash(hash: string, name?: string): Promise<string | null>;
}

type State = 'loading' | 'playing' | 'paused' | 'inventory' | 'chat' | 'dead' | 'menu';

export class Game {
  private app: AppHooks;
  private canvas: HTMLCanvasElement;
  private screens: HTMLElement;
  renderer!: Renderer;
  chunks!: ChunkManager;
  session!: GameSession;
  private player = new LocalPlayer();
  private input = new InputState();
  private desktop!: DesktopControls;
  private mobile!: MobileControls;
  private interaction = new BlockInteraction();
  private hud!: HUD;
  private bowShown = false;
  private panoDone = false;
  private overlay!: { root: HTMLElement; wall: HTMLElement; fireL: HTMLElement; fireR: HTMLElement; wallId: number };
  private inv!: InventoryUI;
  private eco!: EconomyUI;
  private ecoOn = false;
  private ecoStats: { money: number; kills: number; deaths: number; playtime: number } | null = null;
  private chatUI!: ChatUI;
  private atlas: TextureAtlas;
  private state: State = 'loading';
  private running = false;
  private last = 0;
  private time = 1000;
  private dayCycle = true;
  private weather: Weather = 'clear';
  private weatherEnd = 0;
  private rain = 0;
  private thunder = 0;
  private flash = 0;
  private vitals: Vitals = { health: 20, food: 20, sat: 5, air: 300, xp: 0, dead: false, mode: 'survival' };
  private hurtShake = 0;
  private contrails: Contrails | null = null;
  private closePause: (() => void) | null = null;
  private closeDeath: (() => void) | null = null;
  private players = new Map<string, PublicPlayer>();
  private room: RoomMeta | null = null;
  private saveTimer = 45;
  private frames = 0;
  private lastInput = performance.now();
  private rulesState: RuleSet = {};
  private cru: CrucibleView | null = null;
  zoomHeld = false;
  zoomLevel = 4;
  private dynLights: [number, number, number, number][] = [];
  private darkT = 0;
  private loadSkip = false;
  private dim: { el: HTMLElement; phase: 'start' | 'end'; t0: number; tEnd: number; nether: boolean } | null = null;

  private onTravel(phase: 'start' | 'end', nether: boolean, end = false): void {
    const now = performance.now();
    if (phase === 'start') {
      this.dim?.el.remove();
      const grid = document.createElement('canvas');
      grid.width = grid.height = 5 * 6;
      grid.className = 'load-grid';
      const el = h('div', { class: `screen loading-screen mc-load dim-load${nether ? ' to-nether' : end ? ' to-end' : ''}` },
        h('div', { class: 'load-title' }, nether ? 'Entering the Nether' : end ? 'Entering the End' : 'Returning to the Overworld'),
        h('div', { class: 'load-step' }, 'Loading terrain...'), grid);
      this.screens.appendChild(el);
      this.dim = { el, phase, t0: now, tEnd: 0, nether };
      return;
    }
    if (!this.dim) return;
    this.dim.phase = 'end';
    this.dim.tEnd = now;
  }

  private updateDim(): void {
    const d = this.dim;
    if (!d) return;
    const now = performance.now();
    const pcx = Math.floor(this.player.x / 16), pcz = Math.floor(this.player.z / 16);
    const cv = d.el.querySelector('.load-grid') as HTMLCanvasElement;
    const g = cv.getContext('2d')!;
    g.clearRect(0, 0, cv.width, cv.height);
    let done = 0, total = 0;
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      const m = this.chunks.chunkMeshed(pcx + dx, pcz + dz), r = this.chunks.chunkReady(pcx + dx, pcz + dz);
      g.fillStyle = m ? (d.nether ? '#c8402a' : '#7fcc19') : r ? (d.nether ? '#6a1e14' : '#3a7d1e') : '#333333';
      g.fillRect((dx + 2) * 6, (dz + 2) * 6, 6, 6);
      total++; if (m) done++;
    }
    (d.el.querySelector('.load-step') as HTMLElement).textContent = d.phase === 'start' ? 'Finding the way through...' : done < total ? `Building terrain... ${done}/${total}` : 'Arriving...';
    const ready = d.phase === 'end' && (done >= total || now - d.tEnd > 12000) && now - d.t0 > 600;
    if (ready || now - d.t0 > 45000) {
      d.el.remove();
      this.dim = null;
    }
  }

  private emitOf(id: number): number {
    if (id === I.LAVA_BUCKET) return 15;
    return id > 0 && id < 256 ? LIGHT_EMIT[id] : id >= WIDE_BASE && id < ID_LIMIT ? LIGHT_EMIT[id] : 0;
  }

  private updateDynLights(): number {
    const arr = this.renderer.uniforms.uDynLights.value;
    const out: [number, number, number, number][] = [];
    if (getSettings().dynamicLights) {
      const held = heldStack(this.session.me.inv);
      const e = held ? this.emitOf(held.id) : 0;
      if (e > 0) out.push([this.player.x, this.player.eyeY - 0.4, this.player.z, e]);
      const items: [number, number, number, number, number][] = [];
      for (const v of this.renderer.entities.views.values()) {
        if (v.kind === 'item') { const em = this.emitOf(v.type); if (em > 0) items.push([Math.hypot(v.x - this.player.x, v.z - this.player.z), v.x, v.y + 0.3, v.z, em]); }
        else if (v.kind === 'mob' && (v.flags & 2)) items.push([Math.hypot(v.x - this.player.x, v.z - this.player.z), v.x, v.y + 0.8, v.z, 13]);
      }
      items.sort((a, b) => a[0] - b[0]);
      for (const it of items) { if (out.length >= 4 || it[0] > 40) break; out.push([it[1], it[2], it[3], it[4]]); }
    }
    const O = this.renderer.origin;
    for (let i = 0; i < 4; i++) { const o = out[i]; if (o) arr[i].set(o[0] - O.x, o[1], o[2] - O.z, o[3] - 1); else arr[i].set(0, 0, 0, 0); }
    this.dynLights = out;
    return out.length ? Math.max(0, (out[0][3] - 1) / 15) : 0;
  }

  dynLightAt(x: number, y: number, z: number): number {
    let best = 0;
    for (const L of this.dynLights) best = Math.max(best, (L[3] - 1 - Math.hypot(x - L[0], y - L[1], z - L[2])) / 15);
    return best;
  }

  private lookEl: HTMLDivElement | null = null;
  private lookKey = '';
  private lookT = 0;

  private updateLook(dt: number): void {
    this.lookT -= dt;
    if (this.lookT > 0) return;
    this.lookT = 0.1;
    const st = getSettings();
    let lines: { t: string; c?: string }[] | null = null;
    let hearts: [number, number] | null = null;
    const ent = this.interaction?.entityTarget;
    if (st.lookInfo && this.state === 'playing' && ent) {
      if (ent.kind === 'mob') {
        const def = MOB_BY_CODE[ent.type];
        if (def) { lines = [{ t: def.name }, { t: 'Strata', c: '#5555ff' }]; hearts = [ent.extra, def.health]; }
      } else if (ent.kind === 'player') {
        const creative = !!(ent.extra & 256);
        const pvp = !!this.interaction?.pvpCheck?.();
        lines = [{ t: ent.name ?? 'Player' }, { t: creative ? 'Creative mode: cannot be hurt' : pvp ? 'PvP on' : 'PvP is off in this world', c: creative || !pvp ? '#aaaaaa' : '#ff5555' }, { t: 'Player', c: '#5555ff' }];
        if (!creative) hearts = [ent.extra & 255, 20];
      }
      else if (ent.kind === 'item') { const it = getItem(ent.type); lines = [{ t: `${it?.name ?? 'Item'}${ent.extra > 1 ? ` × ${ent.extra}` : ''}` }]; }
    } else if (st.lookInfo && this.state === 'playing' && this.interaction?.target) {
      const t = this.interaction.target;
      const v = this.session.sim.get(t.x, t.y, t.z);
      const b = getBlock(v);
      if (blockId(v)) {
        const held = heldStack(this.session.me.inv);
        const hd = held ? getItem(held.id) : undefined;
        const toolOk = !b.tool || hd?.tool?.type === b.tool;
        lines = [{ t: b.name }];
        if (b.tool && this.session.me.mode === 'survival') lines.push({ t: `${toolOk ? '✔' : '✘'} Best tool: ${b.tool}`, c: toolOk ? '#55ff55' : '#ff5555' });
        const pr = this.interaction.progress;
        if (pr > 0) lines.push({ t: `Breaking ${Math.round(pr * 100)}%`, c: '#ffaa00' });
        lines.push({ t: 'Strata', c: '#5555ff' });
      }
    }
    const key = JSON.stringify([lines, hearts]);
    if (key === this.lookKey) return;
    this.lookKey = key;
    if (!lines) { this.lookEl?.remove(); this.lookEl = null; return; }
    if (!this.lookEl) { this.lookEl = h('div', { class: 'look-info' }) as HTMLDivElement; document.getElementById('hud-root')?.appendChild(this.lookEl); }
    this.lookEl.replaceChildren(...lines.map((l) => h('div', { style: l.c ? `color:${l.c}` : '' }, l.t)),
      ...(hearts ? [h('div', { class: 'look-hearts' }, `${'♥'.repeat(Math.min(10, Math.ceil(hearts[0] / 2)))}${'♡'.repeat(Math.max(0, Math.min(10, Math.ceil(hearts[1] / 2)) - Math.min(10, Math.ceil(hearts[0] / 2))))}`, h('span', {}, ` ${hearts[0]}/${hearts[1]}`))] : []));
  }
  voice: VoiceChat | null = null;
  private voiceEl: HTMLDivElement | null = null;

  private syncVoice(): void {
    const s = getSettings();
    const remote = this.session?.info.kind === 'remote';
    const allowed = remote && this.room?.settings.voice !== false && (this.room?.version ?? 0) >= 6;
    if (!s.voiceEnabled || !remote) {
      if (this.voice) { this.voice.disable(); this.voice = null; }
      this.renderVoice(null);
      return;
    }
    if (!this.voice) {
      const rs = this.session as unknown as { rtc(to: string, d: unknown): void };
      this.voice = new VoiceChat({
        selfId: this.session.me.id,
        send: (to, d) => rs.rtc(to, d),
        peers: () => {
          const out = [];
          for (const [id, pp] of this.players) {
            if (this.chatUI.localMuted.has(id)) continue;
            const v = this.renderer.entities.views.get(`p:${id}`);
            if (v) out.push({ id, name: pp.name, x: v.x, y: v.y, z: v.z });
          }
          return out;
        },
        me: () => ({ x: this.player.x, y: this.player.y, z: this.player.z, yaw: this.player.yaw, pitch: this.player.pitch }),
        onState: (st) => this.renderVoice(st),
      });
      void this.voice.enable().then((ok) => { if (!ok) toast(this.voice?.error || 'Voice chat could not start.', 'error'); });
    }
    this.voice.allowed = allowed;
    this.voice.applyOptions({ mode: s.voiceMode, volume: s.voiceVolume, micGain: s.micGain, threshold: s.voiceThreshold });
    this.mobile?.setVoice(s.voiceMode === 'ptt');
  }

  private renderVoice(st: VoiceState | null): void {
    if (!st || (!st.on && !st.error)) { this.voiceEl?.remove(); this.voiceEl = null; this.mobile?.setVoice(false); return; }
    if (!this.voiceEl) { this.voiceEl = document.createElement('div'); this.voiceEl.className = 'voice-ind'; document.body.appendChild(this.voiceEl); }
    const icon = st.error ? 'mic-x' : st.muted ? 'mic-off' : st.talking ? 'mic-on' : 'mic';
    const notAllowed = this.voice && !this.voice.allowed;
    this.voiceEl.innerHTML = `<span class="vi ${icon}"></span><span class="vt">${st.error ? st.error : notAllowed ? 'Voice is off in this world' : st.muted ? 'Muted (M)' : st.talking ? 'Talking' : st.connected ? `${st.connected} nearby` : 'Voice on'}</span>${st.speaking.map((n) => `<div class="vs">${n.replace(/[<>&]/g, '')}</div>`).join('')}`;
  }

  private applyRules(): void {
    const op = this.session?.me?.op === true, r = this.rulesState;
    this.minimap?.setServerRules(r.allowMinimap !== false || op, r.allowCoords !== false || op);
  }
  private fpsT = 0;
  private fpsVal = 0;
  private debugOn = false;
  private loadingEl: HTMLElement | null = null;
  private loadStart = 0;
  private gen: WorldGenerator | null = null;
  private unsub: (() => void) | null = null;
  private caveT = 20;
  private disposers: (() => void)[] = [];
  private hurtEl: HTMLElement;
  private worldMeta: WorldMeta | null = null;
  private moveSendT = 0;
  private lastPlace = 0;

  private arena!: ArenaUI;
  private caveFx = 0;
  private nfBiome: NetherBiome | null = null;
  private minimap: Minimap | null = null;
  constructor(app: AppHooks, atlas: TextureAtlas) {
    if (import.meta.env.DEV) Object.assign(window, { __strata: this, __settings: updateSettings });
    this.app = app;
    this.atlas = atlas;
    this.canvas = document.getElementById('game') as HTMLCanvasElement;
    this.screens = document.getElementById('screens')!;
    this.hurtEl = document.getElementById('hurt-flash')!;
  }

  private setupCommon(seed: number, remote: boolean, arena: ArenaKind | null = null, climate?: number, studio = false): void {
    const s = getSettings();
    const tint = document.getElementById('tint') as HTMLDivElement;
    this.renderer = new Renderer(this.canvas, this.atlas, (x, y, z) => Math.max(this.chunks?.lightProbe(x, y, z, this.renderer.skyState.day) ?? 1, this.dynLightAt(x, y, z)), tint);
    this.gen = new WorldGenerator(seed, arena, remote ? { secret: null, climate } : climate === undefined && !studio ? undefined : { climate, studio });
    this.renderer.setLodWorld(seed, arena, climate, studio);
    this.renderer.moving.ctx = { atlas: this.atlas.data, gen: this.gen };
    this.renderer.ghost.ctx = { atlas: this.atlas.data, gen: this.gen };
    this.renderer.ghost.show(null);
    const curCache = new Map<number, [number, number] | null>();
    this.player.flow = (px, py, pz) => {
      const x = Math.floor(px), z = Math.floor(pz);
      for (const y of [Math.floor(py), Math.floor(py + 0.5)]) {
        const v = this.chunks.getBlock(x, y, z);
        const fl = bid(v);
        if (fl !== B.WATER && fl !== B.LAVA) continue;
        const lv = (v >>> 8) & 15;
        const hOf = (w: number) => ((w >>> 8) & 8 ? 1 : (8 - ((w >>> 8) & 7)) / 9);
        if (lv) {
          let fx = 0, fz = 0;
          const me = hOf(v);
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const n = this.chunks.getBlock(x + dx, y, z + dz);
            if ((bid(n)) === fl) { const d = me - hOf(n); fx += dx * d; fz += dz * d; }
            else if (n === 0 && (bid(this.chunks.getBlock(x + dx, y - 1, z + dz))) === fl || n === 0 && this.chunks.getBlock(x + dx, y - 1, z + dz) === 0) { fx += dx * me; fz += dz * me; }
          }
          const l = Math.hypot(fx, fz);
          return l > 1e-4 ? [fx / l, fz / l] : null;
        }
        if (fl === B.LAVA || (bid(this.chunks.getBlock(x, y + 1, z))) === B.WATER) return null;
        const k = (x + 1048576) * 2097152 + (z + 1048576);
        if (!curCache.has(k)) { if (curCache.size > 512) curCache.clear(); curCache.set(k, this.gen?.riverCurrent(x + 0.5, z + 0.5) ?? null); }
        const c = curCache.get(k);
        return c ? [c[0] * 0.5, c[1] * 0.5] : null;
      }
      return null;
    };
    this.chunks = new ChunkManager(seed, arena, this.atlas.data, { climate, studio }, {
      loadStored: (cx, cz) => this.storedKeys?.has(`${cx},${cz}`) && this.worldMeta ? WorldStorage.loadChunk(this.worldMeta.id, cx, cz) : null,
      requestRemote: (cx, cz) => this.session?.requestChunk?.(cx, cz),
      onGenerated: (cx, cz, ents) => { if (this.session instanceof LocalSession) this.session.onGenerated(cx, cz, ents); },
      onMesh: (key, cx, cz, r) => this.renderer.setChunkMesh(key, cx, cz, r),
      onUnload: (key) => this.renderer.removeChunk(key),
      saveChunk: (cx, cz, data) => { if (this.worldMeta) void WorldStorage.saveChunks(this.worldMeta.id, [{ cx, cz, data }]); },
      onSurface: (cx, cz, blocks) => this.renderer?.addSurface(cx, cz, blocks),
      onLoaded: (cx, cz) => { if (this.session instanceof LocalSession) this.session.sim.rs.queueRevalidate(cx, cz); },
      genLevel: (cx, cz) => (this.session instanceof LocalSession ? this.session.chunkLevel(cx, cz) : undefined) ?? GEN_LEVEL,
      genOld: (cx, cz) => (this.session instanceof LocalSession ? this.session.chunkOld(cx, cz) : null),
    }, remote);
    this.renderer.chests.getBlock = (x, y, z) => this.chunks.getBlock(x, y, z);
    this.player.others = () => {
      const out: { x: number; y: number; z: number; hw: number; h: number }[] = [];
      const px = this.player.x, pz = this.player.z;
      for (const v of this.renderer.entities.views.values()) {
        if (v.kind !== 'player' && v.kind !== 'mob') continue;
        if (v.kind === 'player' && (v.flags & (1 << 14) || v.flags & 8)) continue;
        if (v.kind === 'mob' && (v.dying > 0 || v.cage)) continue;
        if (Math.abs(v.x - px) > 2 || Math.abs(v.z - pz) > 2) continue;
        out.push({ x: v.x, y: v.y, z: v.z, hw: v.hw, h: v.h });
      }
      return out;
    };
    const hudRoot = document.getElementById('hud-root')!;
    this.hud = new HUD(hudRoot, this.atlas);
    {
      const root = h('div', { class: 'screen-fx' });
      const wall = h('div', { class: 'fx-wall' });
      const fireL = h('div', { class: 'fx-fire l' });
      const fireR = h('div', { class: 'fx-fire r' });
      root.append(wall, fireL, fireR);
      hudRoot.parentElement!.insertBefore(root, hudRoot);
      this.overlay = { root, wall, fireL, fireR, wallId: -1 };
      this.disposers.push(() => root.remove());
    }
    this.inv = new InventoryUI(this.screens, this.atlas);
    this.inv.onClose = () => { if (this.state === 'inventory') this.setState('playing'); };
    this.eco = new EconomyUI(this.screens, this.atlas);
    this.eco.onClose = () => { if (this.state === 'inventory') this.setState('playing'); };
    this.disposers.push(() => this.hud?.setSidebar(null, []));
    this.arena = new ArenaUI(hudRoot, this.screens, this.atlas);
    this.arena.onShopClose = () => { this.session.invOp({ t: 'close' }); if (this.state === 'inventory') this.setState('playing'); };
    this.chatUI = new ChatUI(this.hud.chatBox, hudRoot);
    this.chatUI.onSend = (t) => this.sendChat(t);
    this.chatUI.onClose = () => { if (this.state === 'chat') this.setState('playing'); };
    this.hud.onSlotTap = (i) => { this.session.invOp({ t: 'select', i }); };
    this.hud.onSlotHold = (i) => { this.session.invOp({ t: 'drop', s: { c: 'inv', i }, all: false }); };
    this.hud.onInventory = () => this.toggleInventory();
    this.hud.onRoomChip = () => { if (this.session.info.roomCode) showInvite(this.session.info.roomCode, this.session.info.name); };
    this.desktop = new DesktopControls(this.canvas, this.input, {
      isPlaying: () => this.state === 'playing',
      onInventory: () => this.toggleInventory(),
      onChat: (p) => this.openChat(p),
      onPause: () => this.pause(),
      onToggleDebug: () => { this.debugOn = !this.debugOn; this.hud.debug.classList.toggle('show', this.debugOn); },
      onToggleHud: () => { const v = this.hud.root.style.visibility === 'hidden'; this.hud.root.style.visibility = v ? '' : 'hidden'; this.renderer.showHand = v; },
      onThirdPerson: () => this.toggleCamera(),
      onPointerLockLost: () => { if (this.state === 'playing' && !this.input.touchMode) this.pause(); },
      onMessage: (t) => this.chatUI?.add(null, t, 'info', Date.now()),
      onSwapHands: () => { if (this.state === 'playing' && !this.vitals.dead) { this.session.invOp({ t: 'swapHand' }); this.setHeld(); } },
      onMouseMode: () => { if (getSettings().controlScheme !== 'touch') { this.mobile.setVisible(false); document.body.classList.remove('touch-active'); } },
    });
    this.mobile = new MobileControls(document.getElementById('touch-root')!, this.input, {
      onPause: () => this.pause(),
      onChat: () => this.openChat(''),
      onPlayers: () => this.openPlayers(),
      onCamera: () => this.toggleCamera(),
      isFlying: () => this.player.flying,
      canFly: () => this.session?.me.mode === 'creative',
      isMultiplayer: () => this.session?.info.kind === 'remote',
      setCrouchToggled: () => { /* state kept in controls */ },
      onTalk: (down) => this.voice?.setPtt(down),
    });
    this.input.touchMode = isTouchDevice();
    if (this.input.touchMode) document.body.classList.add('touch-active');
    const showTouch = () => { if (getSettings().controlScheme === 'mouse') return; if (!this.mobile.visible && this.state !== 'loading') { this.mobile.setVisible(this.state === 'playing'); document.body.classList.add('touch-active'); } this.input.touchMode = true; this.desktop?.unlock(); };
    const onTouch = () => showTouch();
    window.addEventListener('touchstart', onTouch, { passive: true });
    this.disposers.push(() => window.removeEventListener('touchstart', onTouch));
    const onResize = () => this.renderer.resize();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    this.disposers.push(() => { window.removeEventListener('resize', onResize); window.removeEventListener('orientationchange', onResize); });
    const onVis = () => { if (document.visibilityState === 'hidden') { void this.session?.save?.(false); if (this.state === 'playing' && this.session?.info.kind === 'local') this.pause(); } };
    document.addEventListener('visibilitychange', onVis);
    this.disposers.push(() => document.removeEventListener('visibilitychange', onVis));
    const release = () => { this.mobile?.releaseAll(); this.input.breaking = false; this.input.using = false; };
    const onHide = () => { if (document.visibilityState === 'hidden') release(); };
    window.addEventListener('blur', release);
    window.addEventListener('pagehide', release);
    document.addEventListener('visibilitychange', onHide);
    this.disposers.push(() => { window.removeEventListener('blur', release); window.removeEventListener('pagehide', release); document.removeEventListener('visibilitychange', onHide); });
    this.disposers.push(guardHistory(() => this.running, () => {
      if (this.inv?.isOpen) { this.inv.close(); return; }
      if (this.state === 'playing' || this.state === 'chat') this.pause();
    }));
    this.player.stepSound = (m) => audio.play(`step.${m}`, this.player.x, this.player.y, this.player.z);
    this.player.swimSound = () => audio.play('swim', this.player.x, this.player.y, this.player.z);
    this.interaction.onSwing = () => { this.renderer.handSwing = 1; };
    this.interaction.onDigSound = (g, x, y, z) => audio.play(`dig.${g}`, x, y, z);
    this.interaction.onDigParticles = (x, y, z, v) => this.breakParticles(x, y, z, v, false);
    this.interaction.onEatTick = () => { this.renderer.handEat += 1 / 60; if (Math.random() < 0.08) audio.play('player.eat', this.player.x, this.player.eyeY, this.player.z); };
    this.interaction.riding = () => !!this.riding;
    this.interaction.pvpCheck = () => this.session?.info.kind === 'remote' && ((this.cru?.ph === 'fight' && this.cru.f.includes(this.session.me.id)) || ((this.session as unknown as { sim?: { settings: { pvp: boolean } } }).sim?.settings.pvp ?? !!this.room?.settings.pvp));
    this.unsub = onSettings((st) => this.applySettings(st));
    this.applySettings(s);
    this.showLoading('Shaping the strata...');
  }

  private storedKeys: Set<string> | null = null;

  private readonly ev: SessionEvents = {
    block: () => this.onBlock(),
    entity: (id, k, t, x, y, z, yaw, f, e) => this.onEntity(id, k, t, x, y, z, yaw, f, e),
    entityRemove: (id, d) => this.onEntityRemove(id, d),
    sound: (n, x, y, z, v, p) => this.onSound(n, x, y, z, v, p),
    fx: (k, x, y, z, d) => this.onFx(k, x, y, z, d),
    vitals: (v) => this.onVitals(v),
    inventory: () => this.onInventory(),
    container: (k, t, items, b, bm, c) => this.onContainer(k, t, items, b, bm, c),
    screen: (t, x, y, z, title) => this.onScreen(t, title ?? (t === 'chest' ? ({ 202: 'Hopper', 203: 'Dropper', 204: 'Dispenser', [CB.SHULKER_BOX]: 'Shulker Box' } as Record<number, string>)[blockId(this.chunks.getBlock(x, y, z))] : undefined)),
    eco: (m) => this.onEco(m),
    game: (st) => { this.arena?.setState(st, this.session.me.id); this.renderer?.entities.setTags(new Map(st.players.filter((p) => p.ent).map((p) => [String(p.ent), { name: p.name, color: st.teams[p.team]?.color ?? '#ffffff' }]))); },
    title: (t, s) => this.arena?.title(t, s),
    countdown: (ms, l) => this.hud?.setCountdown(ms, l),
    crucible: (v) => { this.cru = v; this.hud?.setCrucible(v, this.session.me.id, () => this.session.chat('/crucible join')); },
    trade: (info) => this.inv?.setTrade(info),
    mobName: (id, name) => this.renderer?.entities.setMobName(id, name),
    chestLid: (x, y, z, n) => { this.renderer?.chests.setOpen(x, y, z, n); audio.play(n > 0 ? 'chest.open' : 'chest.close', x + 0.5, y + 0.5, z + 0.5); },
    hurt: (a, c, fx, fz, kb) => this.onHurt(a, c, fx, fz, kb),
    playerHurt: (id) => { const v = this.renderer?.entities.views.get(`p:${id}`); if (v) { v.hurtT = 0.4; v.swing = 0; } },
    death: (m) => this.onDeath(m),
    respawn: (x, y, z) => this.onRespawn(x, y, z),
    teleport: (x, y, z) => this.onTeleport(x, y, z),
    chat: (from, text, kind, ts) => this.chatUI?.add(from, text, kind, ts),
    time: (t, cycle) => { this.time = t; this.dayCycle = cycle; },
    weather: (w, d) => { this.weather = w; this.weatherEnd = d === undefined ? 0 : performance.now() / 1000 + d / 20; },
    lightning: (x, y, z) => this.onLightning(x, y, z),
    pistonMove: (l) => this.renderer?.moving.add(l, performance.now()),
    ride: (id) => { this.riding = id >= 0 ? String(id) : null; },
    enchantOffers: (o) => { this.inv?.setOffers(o); },
    equipment: (id, eq) => { this.renderer?.entities.setEquipment(`p:${id}`, eq); },
    dark: (t) => { this.darkT = Math.max(this.darkT, t / 20); },
    travel: (phase, nether, end) => this.onTravel(phase, nether, end),
    effect: (k, t) => { if (k === 'levitation') this.player.levitateT = t; },
    knock: (x, y, z, set) => { this.player.body.vx += x; this.player.body.vy = set ? y : Math.max(this.player.body.vy, y); this.player.body.vz += z; },
    boom: (x, y, z, r) => this.onBoom(x, y, z, r),
    player: (p) => this.onPlayer(p),
    playerLeft: (id) => this.onPlayerLeft(id),
    playerMove: (id, x, y, z, yaw, pitch, f, hp, cr) => this.onPlayerMove(id, x, y, z, yaw, pitch, f, hp, cr),
    room: (m, ps) => this.onRoom(m, ps),
    mode: () => this.onMode(),
    crafted: () => this.onCrafted(),
    connection: (st, d) => this.onConnection(st, d),
    chunkData: (cx, cz, d) => this.onChunkData(cx, cz, d),
    rules: (r) => { this.rulesState = r; this.applyRules(); },
    rtc: (from, d) => this.voice?.signal(from, d),
    recipes: () => { setTooltipBook(this.session.sim.book); },
  };

  async startLocal(meta: WorldMeta): Promise<void> {
    const rec = await WorldStorage.load(meta.id);
    if (!rec) throw new Error('World not found');
    this.worldMeta = rec.meta;
    this.storedKeys = await WorldStorage.chunkKeys(meta.id);
    this.setupCommon(rec.meta.seed, false, rec.meta.arena ?? null, rec.meta.climate, !!rec.meta.studio);
    const s = getSettings();
    const local = new LocalSession(rec.meta, rec.state, this.chunks, this.ev, s.playerName || 'Wayfarer', s.appearance);
    local.initLevels(rec.state, this.storedKeys ?? new Set());
    this.session = local;
    this.player.flying = local.flying;
    const p = local.me;
    this.player.setPos(p.x, p.y, p.z);
    this.player.yaw = p.yaw;
    this.player.pitch = p.pitch;
    await local.start();
    this.hud.setRoom(null);
    this.begin();
  }

  async startRemote(code: string): Promise<void> {
    const s = getSettings();
    const remote = new RemoteSession(code, getIdentity(), s.playerName || 'Wayfarer', s.appearance);
    const welcome = await remote.connect();
    const room = welcome.room;
    let packIds = s.activePacks;
    let packNote = '';
    if (room.pack) {
      const id = await this.app.packIdForHash(room.pack.hash, room.pack.name);
      if (id) { packIds = [id]; packNote = `This world shares the resource pack "${room.pack.name}". It is installed, so you will see it.`; }
      else { packIds = room.settings.personalPacks ? s.activePacks : []; packNote = `This world suggests the resource pack "${room.pack.name}". You do not have it installed, so ${room.settings.personalPacks ? 'your own packs' : 'default textures'} are used. To see it, open Resource Packs from the pause menu and import your own copy of "${room.pack.name}". Gameplay is unaffected.`; }
    } else if (!room.settings.personalPacks) { packIds = []; if (s.activePacks.length) packNote = 'This world uses default textures for everyone.'; }
    this.atlas = await this.app.rebuildAtlas(packIds);
    this.setupCommon(room.seed, true, room.arena ?? null, room.climate, false);
    this.session = remote;
    remote.attach(this.chunks, this.ev, welcome);
    const p = remote.me;
    this.player.setPos(p.x, p.y, p.z);
    this.player.yaw = p.yaw;
    this.room = room;
    this.hud.setRoom(`Room ${room.code}`);
    if (packNote) this.chatUI.add(null, packNote, 'info', Date.now());
    this.begin();
  }

  private begin(): void {
    const info = this.session.info;
    this.minimap?.dispose();
    this.minimap = new Minimap(document.getElementById('hud-root')!, {
      pos: () => ({ x: this.player.x, y: this.player.y, z: this.player.z, yaw: this.player.yaw }),
      getBlock: (x, y, z) => this.chunks.getBlock(x, y, z),
      isLoaded: (x, z) => this.chunks.isLoaded(x, z),
      players: () => (this.session.sharedPositions?.() ?? []).filter((o) => dimOf(o.x) === dimOf(this.player.x)).map((o) => ({ name: o.name, x: o.x, z: o.z })),
      roster: this.session.roster ? () => this.session.roster!() : undefined,
      shareState: this.session.shareState ? () => this.session.shareState!() : undefined,
      setShare: this.session.setShare ? (to, all) => this.session.setShare!(to, all) : undefined,
      camera: this.renderer.camera,
      sendChat: (t) => this.sendChat(t),
      toast: (t) => toast(t, 'info'),
      setModal: (open) => { if (open) { this.desktop.unlock(); this.setState('inventory'); } else if (this.state === 'inventory') this.setState('playing'); },
    }, info.kind === 'remote' ? `room:${info.roomCode}` : `local:${info.seed}:${info.name}`);
    this.minimap.setPrefs(getSettings().showMinimap, getSettings().showCoords);
    this.applyRules();
    this.chatUI.onWaypoint = (w) => { const nw = this.minimap?.add(w.name, w.x, w.y, w.z); toast(`Saved waypoint ${w.name}.`, 'info'); if (nw && this.minimap) { this.desktop?.unlock(); this.minimap.editWaypoint(nw, () => {}); } };
    this.running = true;
    this.loadStart = performance.now();
    this.last = performance.now();
    this.setHeld();
    const voiceKey = (e: KeyboardEvent, down: boolean) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (bound(e.code, 'talk') && !e.repeat) this.voice?.setPtt(down);
      if (this.bpMode && down && (e.code === 'BracketLeft' || e.code === 'BracketRight')) { this.bpMode.dy += e.code === 'BracketRight' ? 1 : -1; this.bpMode.checkAt = 0; return; }
      if (bound(e.code, 'zoom') && !e.repeat) { this.zoomHeld = down && this.state === 'playing'; if (!down) this.zoomLevel = 4; }
      if (bound(e.code, 'mute') && down && !e.repeat && this.voice) { this.voice.setMuted(!this.voice.muted); }
      if (down && !e.repeat && this.state === 'playing' && this.minimap) {
        if (bound(e.code, 'map') && e.shiftKey) this.minimap.toggleHideAll();
        else if (bound(e.code, 'map')) { this.desktop?.unlock(); this.minimap.openBig(); }
        else if (bound(e.code, 'waypoint')) {
          const p = this.player;
          const w = this.minimap.add(`Waypoint ${this.minimap.waypoints.length + 1}`, p.x, p.y, p.z);
          toast(`Dropped ${w.name}. Press ${keyName(bindOf('map'))} to edit it.`, 'info');
        }
      }
    };
    const vd = (e: KeyboardEvent) => voiceKey(e, true), vu = (e: KeyboardEvent) => voiceKey(e, false);
    window.addEventListener('keydown', vd); window.addEventListener('keyup', vu);
    this.disposers.push(() => { window.removeEventListener('keydown', vd); window.removeEventListener('keyup', vu); this.voice?.disable(); this.voice = null; this.voiceEl?.remove(); this.voiceEl = null; });
    audio.occlusion = (x, y, z) => {
      const c = this.renderer.camera.position;
      const dx = x - c.x, dy = y - c.y, dz = z - c.z;
      const d = Math.hypot(dx, dy, dz);
      if (d < 1.5) return 0;
      const n = Math.min(48, Math.ceil(d * 2));
      let hits = 0, last = '';
      for (let i = 1; i < n; i++) {
        const t = i / n;
        const bx = Math.floor(c.x + dx * t), by = Math.floor(c.y + dy * t), bz = Math.floor(c.z + dz * t);
        const k = `${bx},${by},${bz}`;
        if (k === last) continue;
        last = k;
        if (getBlock(this.chunks.getBlock(bx, by, bz)).opaque) hits++;
      }
      return hits;
    };
    this.disposers.push(() => { audio.occlusion = null; audio.setCave(0); });
    this.syncVoice();
    const onSkin = () => {
      this.renderer.selfSkin = loadCustomSkin();
      this.renderer.refreshHand();
      this.setHeld(true);
      const rs = this.session as unknown as { sendSkin?: (s: unknown) => void };
      rs.sendSkin?.(this.renderer.selfSkin);
    };
    this.renderer.selfSkin = loadCustomSkin();
    this.renderer.refreshHand();
    this.setHeld(true);
    window.addEventListener('strata-skin', onSkin);
    this.disposers.push(() => window.removeEventListener('strata-skin', onSkin));
    const poke = () => { this.lastInput = performance.now(); };
    for (const ev of ['keydown', 'pointerdown', 'pointermove', 'touchstart', 'wheel']) window.addEventListener(ev, poke, { passive: true });
    this.disposers.push(() => { for (const ev of ['keydown', 'pointerdown', 'pointermove', 'touchstart', 'wheel']) window.removeEventListener(ev, poke); });
    requestAnimationFrame((t) => this.frame(t));
  }

  private showLoading(text: string): void {
    const grid = document.createElement('canvas');
    grid.width = grid.height = 11 * 4;
    grid.className = 'load-grid';
    this.loadSkip = false;
    this.loadingEl = h('div', { class: 'screen loading-screen mc-load' }, h('div', { class: 'load-title' }, text), h('div', { class: 'load-step' }, 'Loading terrain...'), grid, h('div', { class: 'load-pct' }, '0%'), h('button', { class: 'btn load-skip', style: 'visibility:hidden', onclick: () => { this.loadSkip = true; } }, 'Play now'));
    this.screens.appendChild(this.loadingEl);
  }

  private updateLoading(): boolean {
    if (!this.loadingEl) return true;
    const pcx = Math.floor(this.player.x / 16), pcz = Math.floor(this.player.z / 16);
    let done = 0, total = 0, gen = 0, core = 0;
    const R = Math.max(2, Math.min(8, getSettings().renderDistance - 1));
    const cv = this.loadingEl.querySelector('.load-grid') as HTMLCanvasElement;
    const cell = 4, W = (R * 2 + 1) * cell;
    if (cv.width !== W) cv.width = cv.height = W;
    const g = cv.getContext('2d')!;
    g.clearRect(0, 0, cv.width, cv.height);
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      if (dx * dx + dz * dz > (R + 0.5) * (R + 0.5)) continue;
      const m = this.chunks.chunkMeshed(pcx + dx, pcz + dz), r = this.chunks.chunkReady(pcx + dx, pcz + dz);
      g.fillStyle = m ? '#7fcc19' : r ? '#3a7d1e' : '#333333';
      g.fillRect((dx + R) * cell, (dz + R) * cell, cell, cell);
      total++; if (m) done++; if (r) gen++;
      if (m && Math.abs(dx) <= 1 && Math.abs(dz) <= 1) core++;
    }
    const pct = Math.round(((gen + done) / (total * 2)) * 100);
    (this.loadingEl.querySelector('.load-pct') as HTMLElement).textContent = `${pct}%`;
    (this.loadingEl.querySelector('.load-step') as HTMLElement).textContent = gen < total ? `Loading terrain... ${gen}/${total}` : done < total ? `Building chunks... ${done}/${total}` : 'Joining world...';
    const waited = performance.now() - this.loadStart;
    const skipBtn = this.loadingEl.querySelector('.load-skip') as HTMLElement | null;
    if (skipBtn) skipBtn.style.visibility = core >= 9 && done < total && waited > 1500 ? 'visible' : 'hidden';
    const ready = done >= total || (this.loadSkip && core >= 9) || (waited > 30000 && core >= 9) || (waited > 45000 && this.chunks.chunkMeshed(pcx, pcz));
    if (ready) {
      this.loadingEl.remove();
      this.loadingEl = null;
      if (this.session.info.kind === 'local') (this.session as LocalSession).sim.makeSafe(this.session.me);
      this.player.setPos(this.session.me.x, this.session.me.y, this.session.me.z);
      this.hud.show(true);
      this.setState('playing');
      if (this.vitals.dead) this.onDeath('You were defeated before you left.');
      const mt = MODE_TITLES[this.session.me.mode];
      this.hud.message(`${this.session.info.name}`, 2.5);
      void mt;
      if (!this.input.touchMode) this.desktop.lock();
      return true;
    }
    return false;
  }

  private setState(s: State): void {
    this.state = s;
    const playing = s === 'playing';
    this.mobile.setVisible(playing && this.input.touchMode);
    if (playing && !this.input.touchMode) this.desktop?.lock();
    if (!playing) this.input.reset();
    this.hud.crosshair.style.display = playing ? '' : 'none';
    this.mobile.refreshState();
  }

  private bpMode: { bp: Blueprint; el: HTMLElement; status: HTMLElement; dy: number; pos: [number, number, number] | null; cells: Int32Array; checkAt: number; blocked: number } | null = null;

  private openBlueprints(): void {
    const s = this.session;
    const local = s.info.kind === 'local';
    const blocked = s.info.arena ? 'Not available in arena games.' : this.rulesState.allowBlueprints === false && !local ? 'The owner has turned blueprints off here.' : !s.placeBlueprint ? 'Not available here.' : null;
    showBlueprints({
      studio: !!s.info.studio,
      placeBlocked: blocked,
      creative: s.me.mode === 'creative',
      inv: s.me.inv,
      sel: () => [s.me.sel?.[0] ?? null, s.me.sel?.[1] ?? null],
      get: (x, y, z) => this.chunks.getBlock(x, y, z),
      onPlace: (bp) => { this.resume(); this.startBlueprint(bp); },
      onShaper: this.session.me.mode === 'creative' && local ? () => showShaper((c) => this.session.chat(c), () => { const t = this.interaction.target; return t ? [t.x, t.y, t.z] : null; }, () => heldStack(this.session.me.inv)?.id ?? null) : undefined,
    });
  }

  private startBlueprint(bp: Blueprint): void {
    this.endBlueprint();
    const cells: number[] = [];
    for (let i = 0; i < bp.blocks.length; i++) if (bp.blocks[i]) cells.push(i);
    const status = h('div', { class: 'bp-status' }, 'Aim at the ground where you want to build.');
    const hint = matchMedia('(pointer: coarse)').matches ? null : h('div', { class: 'small muted' }, 'Right-click to place, middle-click to cancel, [ and ] to lower or raise.');
    const el = h('div', { class: 'bp-hud' },
      h('div', {}, h('b', {}, bp.name), ` (${bp.w} x ${bp.h} x ${bp.d})`),
      status,
      hint,
      h('div', { class: 'row' },
        h('button', { class: 'btn small', onclick: () => { if (this.bpMode) { this.bpMode.dy--; this.bpMode.checkAt = 0; } } }, 'Lower'),
        h('button', { class: 'btn small', onclick: () => { if (this.bpMode) { this.bpMode.dy++; this.bpMode.checkAt = 0; } } }, 'Raise'),
        h('button', { class: 'btn small primary', onclick: () => this.confirmBlueprint() }, 'Place'),
        h('button', { class: 'btn small danger', onclick: () => this.endBlueprint() }, 'Cancel')));
    document.getElementById('hud-root')!.appendChild(el);
    this.bpMode = { bp, el, status, dy: 0, pos: null, cells: Int32Array.from(cells), checkAt: 0, blocked: -1 };
    this.renderer.ghost.show(bp);
  }

  private endBlueprint(): void {
    if (!this.bpMode) return;
    this.bpMode.el.remove();
    this.bpMode = null;
    this.renderer.ghost.show(null);
  }

  private confirmBlueprint(): void {
    const m = this.bpMode;
    if (!m?.pos) { toast('Aim at the ground first', 'error'); return; }
    if (m.blocked > 0) { toast(`Blocked by ${m.blocked} block${m.blocked === 1 ? '' : 's'}. Move it to a clear spot.`, 'error'); return; }
    this.session.placeBlueprint?.(m.bp, m.pos[0], m.pos[1], m.pos[2]);
    this.endBlueprint();
  }

  private updateBlueprint(): void {
    const m = this.bpMode;
    if (!m) return;
    const cam = this.renderer.camera;
    const d = new THREE.Vector3();
    cam.getWorldDirection(d);
    const hit = raycast(this.chunks, cam.position.x, cam.position.y, cam.position.z, d.x, d.y, d.z, 64);
    if (!hit) { m.pos = null; this.renderer.ghost.group.visible = false; m.status.textContent = 'Aim at the ground where you want to build.'; return; }
    const { bp } = m;
    const pos: [number, number, number] = [hit.x + hit.nx - Math.floor(bp.w / 2), hit.y + hit.ny + m.dy, hit.z + hit.nz - Math.floor(bp.d / 2)];
    const moved = !m.pos || pos.some((v, i) => v !== m.pos![i]);
    m.pos = pos;
    const now = performance.now();
    if (moved || now > m.checkAt) {
      m.checkAt = now + 400;
      let blocked = 0;
      const stride = Math.max(1, Math.floor(m.cells.length / 60000));
      for (let k = 0; k < m.cells.length; k += stride) {
        const i = m.cells[k];
        const x = i % bp.w, z = Math.floor(i / bp.w) % bp.d, y = Math.floor(i / (bp.w * bp.d));
        const v = this.chunks.getBlock(pos[0] + x, pos[1] + y, pos[2] + z);
        if (bid(v) && !isReplaceable(v)) blocked += stride;
      }
      m.blocked = blocked;
      m.status.textContent = blocked ? `Overlaps about ${blocked} block${blocked === 1 ? '' : 's'}. Move it or raise it.` : 'Clear spot. Tap Place to build.';
      m.status.classList.toggle('bad', blocked > 0);
    }
    this.renderer.ghost.group.visible = true;
    this.renderer.ghost.place(pos[0], pos[1], pos[2], m.blocked === 0);
  }

  private aimFar(): [number, number, number] | null {
    const cam = this.renderer.camera;
    const d = new THREE.Vector3();
    cam.getWorldDirection(d);
    const hit = raycast(this.chunks, cam.position.x, cam.position.y, cam.position.z, d.x, d.y, d.z, 320);
    return hit ? [Math.floor(localX(hit.x)), hit.y, hit.z] : null;
  }

  private preStorm(): number {
    if (this.weather !== 'clear') return 0;
    const local = this.session.info.kind === 'local';
    const sim = this.session.sim;
    if (!sim.settings.weatherCycle) return 0;
    const left = local ? sim.weatherTimer / 20 : this.weatherEnd ? this.weatherEnd - performance.now() / 1000 : Infinity;
    const k = Math.min(1, Math.max(0, (150 - left) / 120));
    return k * k * (3 - 2 * k);
  }

  private sendChat(t: string): void {
    const m = /^\/coords(?:\s+(on|off))?\s*$/i.exec(t.trim());
    if (m) {
      const on = m[1] ? m[1].toLowerCase() === 'on' : !getSettings().showCoords;
      updateSettings({ showCoords: on });
      this.chatUI?.add(null, on ? 'Coordinates shown. Type /coords to hide them.' : 'Coordinates hidden. Type /coords to show them.', 'info', Date.now());
      return;
    }
    this.session.chat(t);
  }

  private applySettings(s: Settings): void {
    if (this.ecoStats) this.renderSidebar();
    if (!this.renderer) return;
    this.renderer.setFov(s.fov);
    this.renderer.adaptive = s.adaptiveResolution;
    this.renderer.maxResScale = s.resolutionScale;
    this.renderer.applyGraphics(s);
    this.renderer.particles.level = s.particles;
    this.renderer.sky.cloudsEnabled = s.clouds;
    this.renderer.uniforms.uBrightness.value = s.brightness;
    const mo = { glass: s.connectedGlass !== false, grass: s.betterGrass ?? 'fancy' };
    if (this.chunks.smooth !== s.smoothLighting || this.chunks.meshOpts.glass !== mo.glass || this.chunks.meshOpts.grass !== mo.grass) { this.chunks.smooth = s.smoothLighting; this.chunks.meshOpts = mo; this.chunks.setAtlas(this.atlas.data); }
    this.renderer.particles.fallingLeaves = s.fallingLeaves !== false;
    if (this.hud) this.hud.foodStats = s.foodStats !== false;
    audio.soundPhysics = s.soundPhysics !== false;
    this.chunks.renderDistance = s.renderDistance;
    if (this.session) this.syncVoice();
    this.desktop.sensitivity = s.sensitivity;
    this.desktop.invertY = s.invertY;
    this.mobile.layout();
    this.player.autoJump = s.autoJump;
    document.documentElement.style.setProperty('--hud-scale', String(s.hudScale));
    document.documentElement.style.setProperty('--chat-op', String(s.chatOpacity));
    this.hud.fps.classList.toggle('show', s.showFps);
    this.hud.layout();
    this.hud.chatBox.classList.toggle('show-ts', s.chatTimestamps);
    this.overlay.root.classList.toggle('fire-normal', s.fireOverlay === 'normal');
    this.minimap?.setPrefs(s.showMinimap, s.showCoords);
    audio.setVolumes({ master: s.master, music: s.music, effects: s.effects, ambient: s.ambient, muted: s.muted });
  }

  setAtlas(a: TextureAtlas): void {
    this.atlas = a;
    this.renderer.setAtlas(a);
    this.chunks.setAtlas(a.data);
    this.hud.setAtlas(a);
    this.inv.setAtlas(a);
    this.eco?.setAtlas(a);
    this.setHeld(true);
  }

  private toggleInventory(): void {
    if (this.state === 'inventory') {
      if (this.arena?.shopOpen) { this.arena.closeShop(); return; }
      if (this.eco?.isOpen) { this.eco.close(); return; }
      this.inv.close(); return;
    }
    if (this.state !== 'playing') return;
    this.desktop.unlock();
    this.setState('inventory');
    this.inv.open(this.session, this.session.me.mode === 'creative' ? 'creative' : 'player');
  }

  private openChat(prefix: string): void {
    if (this.state !== 'playing') return;
    this.desktop.unlock();
    this.setState('chat');
    this.chatUI.open(prefix);
  }

  private openPlayers(): void {
    if (this.session.info.kind !== 'remote') return;
    const rs = this.session as RemoteSession;
    showPlayers([...rs.players.values()], rs.me.id, rs.me.op, this.chatUI.localMuted, { kick: (id) => rs.kick(id), mute: (id, on) => rs.mute(id, on), maxPlayers: rs.room.maxPlayers, command: (t) => rs.chat(t), tpa: this.rulesState.tpa !== false });
  }

  private toggleCamera(): void {
    this.renderer.thirdPerson = !this.renderer.thirdPerson;
    if (!this.renderer.thirdPerson) this.renderer.entities.removeNow('me');
  }

  private pause(): void {
    if (this.state !== 'playing' && this.state !== 'chat') return;
    this.desktop.unlock();
    this.setState('paused');
    const local = this.session.info.kind === 'local';
    const remote = this.session as RemoteSession;
    const canShape = this.session.me.mode === 'creative' && (local || remote.me.op || !!remote.room?.settings.cheats);
    this.closePause = showPause(this.screens, {
      title: local ? `${this.session.info.name} · seed ${this.session.info.seed}` : `${this.session.info.name} · room ${this.session.info.roomCode}`,
      sub: `${MODE_TITLES[this.session.me.mode].title} · ${MODE_TITLES[this.session.me.mode].sub}`,
      resume: () => this.resume(),
      save: local ? () => { void this.session.save!(true).then(() => toast('World saved', 'success')); } : undefined,
      settings: () => this.app.openSettings(() => { /* stays paused */ }),
      packs: () => this.app.openPacks(() => { /* stays paused */ }),
      datapacks: this.session.setDataPacks ? () => showDataPacks(this.session.sim.dataPacks, local || remote.me.op, !local, (l) => this.session.setDataPacks!(l)) : undefined,
      players: local ? undefined : () => this.openPlayers(),
      economy: !local && this.room?.settings.economy !== false ? (cmd: string) => { this.resume(); this.session.chat(cmd); } : undefined,
      invite: local ? undefined : () => showInvite(this.session.info.roomCode!, this.session.info.name),
      room: !local && remote.me.op ? () => showRoomSettings(remote.room, (patch) => remote.roomUpdate(patch), this.app.activePackRef(), this.rulesState, (cmds) => { cmds.forEach((c, i) => setTimeout(() => remote.chat(c), i * 400)); }) : undefined,
      admin: local || remote.me.op ? () => showSovereign((c) => this.session.chat(c), () => { const s = heldStack(this.session.me.inv); return s ? { id: s.id, name: getItem(s.id)?.name ?? 'Item', en: s.en, dmg: s.dmg } : null; }, () => this.rulesState ?? {}, this.atlas) : undefined,
      mischief: local || remote.me.op ? () => showMischief(() => (local ? [this.session.me.name] : [...remote.players.values()].map((q) => q.name)), this.session.me.name, (c) => this.session.chat(c), () => this.aimFar()) : undefined,
      blueprints: !this.session.info.arena ? () => this.openBlueprints() : undefined,
      waypoints: this.minimap ? () => { this.closePause?.(); this.minimap?.openBig(); } : undefined,
      shaper: canShape ? () => showShaper((c) => this.session.chat(c), () => { const t = this.interaction.target; return t ? [t.x, t.y, t.z] : null; }, () => heldStack(this.session.me.inv)?.id ?? null) : undefined,
      difficulty: local ? { value: this.session.info.difficulty, set: (d) => (this.session as LocalSession).setDifficulty(d) } : undefined,
      quit: () => void this.quit(),
    });
  }

  private resume(): void {
    this.closePause?.();
    this.closePause = null;
    this.setState('playing');
    if (!this.input.touchMode) this.desktop.lock();
  }

  capturePanorama(force = false): void {
    if (!this.renderer || this.state === 'loading') return;
    const p = this.player;
    const sky = this.chunks.lightProbe(p.x, p.eyeY, p.z, 1);
    if (!force && sky < 0.6) return;
    const faces = this.renderer.capturePanorama(p.x, p.eyeY + 0.2, p.z);
    if (faces) try { localStorage.setItem('strata.panorama', JSON.stringify(faces)); } catch { /* storage full */ }
  }

  async quit(reason?: string): Promise<void> {
    this.endBlueprint();
    if (!this.running) return;
    this.capturePanorama();
    this.running = false;
    try { await this.session?.save?.(true); } catch (e) { console.error(e); toast('Saving failed: ' + (e as Error).message, 'error'); }
    this.session?.close();
    this.dispose();
    this.app.exitToTitle(reason);
  }

  private dispose(): void {
    try { sessionStorage.removeItem('strata.spectate'); } catch { /* ignore */ }
    setTooltipBook(BASE_BOOK);
    this.arena?.dispose();
    this.minimap?.dispose();
    this.minimap = null;
    this.closePause?.();
    this.closeDeath?.();
    this.inv?.close(true);
    this.desktop?.dispose();
    this.mobile?.root.remove();
    this.hud?.root.remove();
    this.loadingEl?.remove();
    this.chunks?.dispose();
    this.renderer?.clearChunks();
    this.renderer?.disposeLod();
    this.renderer?.entities.clear();
    this.contrails?.dispose(); this.contrails = null;
    this.renderer?.gl.dispose();
    this.unsub?.();
    for (const d of this.disposers) d();
    document.querySelector('.chat-input-row')?.remove();
    document.body.classList.remove('touch-active');
    audio.setRain(0, false);
    if (this.portalEl) this.portalEl.style.opacity = '0';
  }

  private setHeld(force = false): void {
    if (!this.session) return;
    const s = heldStack(this.session.me.inv);
    let id = s?.id ?? null;
    if (id === I.CROSSBOW) { const d = this.interaction?.drawing ?? 0; id = s?.ld ? I.CROSSBOW_LOADED : d > 0 ? (d > 1.1 ? I.CROSSBOW_PULL2 : d > 0.6 ? I.CROSSBOW_PULL1 : I.CROSSBOW_PULL0) : I.CROSSBOW; }
    if (id === I.BOW && this.interaction?.drawing > 0) { const d = this.interaction.drawing; id = d > 0.9 ? I.BOW_PULL2 : d > 0.45 ? I.BOW_PULL1 : I.BOW_PULL0; }
    if (force) this.renderer.setHeld(-99, this.session.me.appearance.skin);
    this.renderer.setHeld(id, this.session.me.appearance.skin);
    this.renderer.setOffHeld(this.session.me.inv.off?.[0]?.id ?? null);
  }

  private breakParticles(x: number, y: number, z: number, v: number, many: boolean): void {
    const d = this.atlas.data;
    const id = blockId(v);
    if (!id) return;
    const tile = d.blockTiles[tix(v) * FACE_SLOTS + (getBlock(v).render === 'cross' ? 4 : 2)];
    const tint = d.tintTable[id * 2] ? [0.55, 0.75, 0.35] as [number, number, number] : null;
    const light = this.chunks.lightProbe(x, y, z, this.renderer.skyState.day);
    this.renderer.particles.blockBreak(x, y, z, tile, tint, light, many);
  }

  // ---- SessionEvents ----
  private onBlock(): void { /* chunk data is updated by the store */ }

  onEntity(id: string, kind: 'mob' | 'item' | 'arrow' | 'tnt' | 'cart' | 'fireball' | 'frame', type: number, x: number, y: number, z: number, yaw: number, flags: number, extra: number): void {
    this.renderer?.entities.upsert(id, kind, type, x, y, z, yaw, 0, flags, extra, performance.now());
  }

  onEntityRemove(id: string, death: boolean): void { this.renderer?.entities.remove(id, death); }

  onSound(name: string, x: number, y: number, z: number, vol?: number, pitch?: number): void {
    if (name === 'explode') { const now = performance.now(); if (now - this.boomSndAt > 250) { this.boomSndAt = now; this.boomSndN = 0; } if (++this.boomSndN > 3) return; }
    audio.play(name, x, y, z, vol, pitch);
    if (name === 'player.burp') this.renderer.handEat = 0;
  }

  onFx(kind: string, x: number, y: number, z: number, data?: number): void {
    if (!this.renderer) return;
    const p = this.renderer.particles;
    switch (kind) {
      case 'break': if (data !== undefined) this.breakParticles(x, y, z, data, true); break;
      case 'hurt': p.puff(x, y, z, 0.8, 0.1, 0.1, 6, 2, 4, 0.08, 0.5); break;
      case 'smoke': p.puff(x, y, z, 0.7, 0.7, 0.7, 14, 1.2, -1.5, 0.14, 1.2); break;
      case 'crit': p.puff(x, y, z, 1, 0.85, 0.3, 10, 4, 6, 0.06, 0.5); break;
      case 'sweep': p.puff(x, y, z, 0.95, 0.95, 0.95, 14, 1.5, 1, 0.08, 0.35); break;
      case 'heart': p.puff(x, y, z, 1, 0.25, 0.35, 5, 0.6, -0.6, 0.09, 1.1); break;
      case 'shriek': p.puff(x, y, z, 0.2, 0.85, 0.85, 18, 1.1, -1.6, 0.08, 1.6); break;
      case 'splash': p.puff(x, y, z, 0.6, 0.75, 1, 10, 3, 9, 0.06, 0.6); break;
      case 'xp': p.puff(x, y, z, 0.7, 1, 0.3, 8, 2, -2, 0.07, 0.8); break;
      case 'portal': p.puff(x, y, z, 0.75, 0.3, 0.95, 10, 1.4, -0.6, 0.07, 1.2); break;
      case 'breath': p.puff(x, y, z, 0.85, 0.3, 0.75, 16, 1.6, -0.4, 0.14, 1.6); break;
      case 'firework': { const c = [[1, 0.3, 0.3], [0.3, 0.8, 1], [1, 0.85, 0.3], [0.6, 1, 0.4]][Math.floor(Math.random() * 4)]; p.puff(x, y, z, c[0], c[1], c[2], 40, 9, 3, 0.09, 1.3); break; }
      case 'dragon': p.puff(x, y, z, 0.95, 0.75, 1, 60, 6, -3, 0.18, 2.4); break;
    }
  }

  private portalFx = 0;
  private portalEl: HTMLElement | null = null;
  private updatePortalFx(dt: number): void {
    const p = this.player;
    const bx = Math.floor(p.x), by = Math.floor(p.y + 0.1), bz = Math.floor(p.z);
    const inside = blockId(this.chunks.getBlock(bx, by, bz)) === 219 || blockId(this.chunks.getBlock(bx, by + 1, bz)) === 219;
    this.portalFx = Math.max(0, Math.min(1, this.portalFx + (inside ? dt / 4 : -dt * 1.5)));
    if (!this.portalEl) {
      const el = document.createElement('div');
      el.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:3;background:radial-gradient(circle at 50% 50%,rgba(150,60,230,0.55),rgba(60,10,120,0.9));opacity:0;';
      document.body.appendChild(el);
      this.portalEl = el;
    }
    this.portalEl.style.opacity = String(this.portalFx * 0.85);
  }

  private updateScreenFx(camId: number, now: number): void {
    const o = this.overlay;
    const d = getBlock(camId);
    const inWall = camId !== 0 && d.solid && d.opaque && d.render === 'cube';
    const wid = inWall ? camId : -1;
    if (wid !== o.wallId) {
      o.wallId = wid;
      const url = wid >= 0 ? this.atlas.tileURL(wid) : null;
      o.wall.style.display = url ? 'block' : 'none';
      if (url) o.wall.style.backgroundImage = `url(${url})`;
    }
    const fire = !!this.vitals.fire && !this.renderer.thirdPerson && !this.vitals.dead && this.state !== 'loading';
    const show = fire ? 'block' : 'none';
    if (o.fireL.style.display !== show) {
      o.fireL.style.display = o.fireR.style.display = show;
      const url = this.atlas.hudURLs.fire;
      if (fire && url) for (const f of [o.fireL, o.fireR]) { f.style.backgroundImage = `url(${url})`; f.style.backgroundSize = `100% ${this.atlas.fireFrames * 100}%`; }
    }
    if (fire) {
      const n = this.atlas.fireFrames;
      const fr = Math.floor(now / 50) % n;
      const pos = n > 1 ? `0% ${(fr / (n - 1)) * 100}%` : '0% 0%';
      o.fireL.style.backgroundPosition = pos;
      o.fireR.style.backgroundPosition = n > 1 ? `0% ${(((fr + Math.floor(n / 2)) % n) / (n - 1)) * 100}%` : pos;
    }
  }

  onVitals(v: Vitals): void {
    const wasMode = this.vitals.mode;
    this.vitals = v;
    this.player.food = v.food;
    this.hud?.updateVitals(v, this.hurtShake > 0);
    if (v.mode !== wasMode) { this.mobile?.refreshState(); if (v.mode === 'survival') this.player.flying = false; }
  }

  onInventory(): void {
    if (!this.hud) return;
    this.hud.updateInventory(this.session.me.inv);
    this.inv.refresh();
    this.arena?.refreshShop(this.session.me.inv);
    this.setHeld();
  }

  onContainer(_key: string, _type: 'chest' | 'furnace', items: import('../core/inventory').ItemStack[] | (import('../core/inventory').ItemStack | null)[], burn?: number, burnMax?: number, cook?: number): void {
    this.inv?.setContainer(items as never, burn, burnMax, cook);
  }

  onEco(m: Extract<S2C, { t: 'eco' }>): void {
    if (m.k === 'prices') {
      this.inv.sellPrices = new Map(Object.entries(m.sell).map(([k, v]) => [Number(k), Number(v)]));
      this.eco.shopPrices = m.shop;
      if (m.cat) this.eco.catalog = m.cat;
      this.eco.isAdmin = !!this.session.me.op;
      if (m.on !== undefined) this.ecoOn = m.on;
      return;
    }
    if (m.k === 'stats') {
      this.ecoOn = true;
      this.ecoStats = { money: m.money, kills: m.kills, deaths: m.deaths, playtime: m.playtime };
      this.eco.setBalance(m.money);
      this.renderSidebar();
      return;
    }
    if (m.k === 'view') {
      if (this.inv.isOpen) this.inv.close();
      this.desktop.unlock();
      this.setState('inventory');
      this.eco.isAdmin = !!this.session.me.op;
      this.eco.show(m.view, this.session.me.id, (a) => {
        if (a.a === 'chat') { this.session.chat(String(a.text)); this.eco.close(); return; }
        (this.session as RemoteSession).ecoAction?.(a);
      });
    }
  }

  private renderSidebar(): void {
    const st = this.ecoStats;
    if (!st || !getSettings().sidebar || !this.hud) { this.hud?.setSidebar(null, []); return; }
    const pt = st.playtime;
    const play = pt >= 86400 ? `${Math.floor(pt / 86400)}d ${Math.floor((pt % 86400) / 3600)}h` : pt >= 3600 ? `${Math.floor(pt / 3600)}h ${Math.floor((pt % 3600) / 60)}m` : `${Math.floor(pt / 60)}m`;
    this.hud.setSidebar(this.session.info.name.slice(0, 20), [['Money', money(st.money)], ['Kills', String(st.kills)], ['Deaths', String(st.deaths)], ['Playtime', play]]);
  }

  onScreen(type: ScreenType | null, title?: string): void {
    if (!this.inv) return;
    this.inv.title = title ?? null;
    if (type === 'shop') {
      this.desktop.unlock();
      this.setState('inventory');
      this.arena.openShop(this.session.me.inv, (k) => this.session.buy?.(k));
      return;
    }
    if (type === 'trade') {
      this.desktop.unlock();
      this.setState('inventory');
      this.inv.openTrade(this.session, (id, i, n) => this.session.trade(id, i, n));
      return;
    }
    if (!type && this.arena?.shopOpen) { this.arena.closeShop(true); if (this.state === 'inventory') this.setState('playing'); return; }
    if (type) {
      this.desktop.unlock();
      this.setState('inventory');
      this.inv.open(this.session, type as InvScreen);
    } else if (this.inv.isOpen && ['chest', 'furnace', 'workbench', 'trade', 'enchant', 'anvil', 'smith'].includes(this.inv.current)) {
      this.inv.close(true);
    }
  }

  onHurt(amount: number, _cause: string, fx: number, fz: number, kb?: number): void {
    this.hurtEl.classList.add('on');
    setTimeout(() => this.hurtEl.classList.remove('on'), 120);
    this.hurtShake = 0.3;
    if (fx !== this.player.x || fz !== this.player.z) this.player.knockback(fx, fz, kb ?? 0.4);
    navigator.vibrate?.(30);
  }

  onDeath(msg: string): void {
    if (this.minimap) { const p = this.player; this.minimap.addDeath(p.x, p.y, p.z); }
    this.inv?.close(true);
    this.closePause?.();
    this.desktop?.unlock();
    this.setState('dead');
    this.closeDeath?.();
    this.closeDeath = showDeath(this.screens, msg, () => this.session.respawn(), () => void this.quit());
  }

  onRespawn(x: number, y: number, z: number): void {
    this.player.setPos(x, y, z);
    this.closeDeath?.();
    this.closeDeath = null;
    this.setState('playing');
    if (!this.input.touchMode) this.desktop.lock();
  }

  onTeleport(x: number, y: number, z: number): void { this.player.setPos(x, y, z); }



  onBoom(x: number, y: number, z: number, r: number): void {
    if (!this.renderer) return;
    const p = this.renderer.particles;
    const now = performance.now();
    if (now - this.boomAt > 400) { this.boomAt = now; this.boomN = 0; }
    this.boomN++;
    this.renderer.explosions.spawn(x, y, z, r);
    if (this.boomN <= 3) p.puff(x, y, z, 0.35, 0.35, 0.35, 10, 2.2, -0.4, 0.22, 1.3);
    const d = Math.hypot(this.player.x - x, this.player.y - y, this.player.z - z);
    if (d < r * 6) this.shake = Math.max(this.shake, (1 - d / (r * 6)) * 0.6);
  }

  private shake = 0;
  private nfAt = 0;
  private nfTarget: [number, number, number] = [0.2, 0.03, 0.03];
  private nfCol: [number, number, number] = [0.2, 0.03, 0.03];
  private boomAt = 0;
  private boomN = 0;
  private boomSndAt = 0;
  private boomSndN = 0;
  private riding: string | null = null;

  onLightning(x: number, y: number, z: number): void {
    this.renderer?.weather.lightning(x, y, z);
    const d = Math.hypot(x - this.player.x, z - this.player.z);
    this.flash = Math.max(this.flash, (1 - this.caveFx) * Math.max(0, 1 - d / 180));
    setTimeout(() => audio.play('thunder', x, y, z, 1), Math.min(4000, d * 3));
  }

  onPlayer(p: PublicPlayer): void {
    const known = this.players.has(p.id);
    this.players.set(p.id, p);
    if (known) {
      const v = this.renderer?.entities.views.get(`p:${p.id}`);
      if (v) this.renderer.entities.upsert(`p:${p.id}`, 'player', 0, v.x, v.y, v.z, v.yaw, v.pitch, v.flags, 0, performance.now(), { name: p.name, appearance: p.appearance, skin: p.skin ?? null, sup: p.sup });
    }
  }

  onPlayerLeft(id: string): void { this.players.delete(id); this.renderer?.entities.removeNow(`p:${id}`); }

  onPlayerMove(id: string, x: number, y: number, z: number, yaw: number, pitch: number, flags: number, hp = -1, creative = false): void {
    const p = this.players.get(id);
    const prev = this.renderer?.entities.views.get(`p:${id}`);
    const extra = hp >= 0 ? hp | (creative ? 1 << 8 : 0) : prev?.extra ?? 20;
    this.renderer?.entities.upsert(`p:${id}`, 'player', 0, x, y, z, yaw, pitch, flags, extra, performance.now(), p ? { name: p.name, appearance: p.appearance, skin: p.skin ?? null, sup: p.sup } : undefined);
  }

  onRoom(meta: RoomMeta, players: PublicPlayer[]): void {
    this.room = meta;
    for (const p of players) this.players.set(p.id, p);
    this.hud?.setRoom(`Room ${meta.code}`);
    this.syncVoice();
  }

  onMode(): void { this.mobile?.refreshState(); if (this.session.me.mode === 'survival') this.player.flying = false; if (this.inv?.isOpen) this.inv.close(); }

  onCrafted(): void { audio.play('ui.craft'); }

  onConnection(state: 'connecting' | 'online' | 'reconnecting' | 'offline', detail?: string): void {
    if (!this.hud) return;
    if (state === 'online') {
      this.hud.setStatus(null);
      if (detail === 'reconnected') { this.chatUI.add(null, 'Reconnected to the world.', 'info', Date.now()); this.reloadWorldView(); }
    } else if (state === 'reconnecting') this.hud.setStatus(detail ?? 'Reconnecting...', 'warn');
    else if (state === 'offline') {
      this.hud.setStatus('Offline', 'bad');
      modal('Disconnected', detail ?? 'The connection to the world was lost.', [{ label: 'Back to title', kind: 'primary', onClick: () => void this.quit(detail) }], { onClose: () => void this.quit(detail) });
    }
  }

  onChunkData(cx: number, cz: number, data: BlockArray | null): void {
    if (!data) return;
    for (let y = 0; y < WORLD_HEIGHT; y++) for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const v = data[(y * 16 + z) * 16 + x];
      if (this.chunks.getBlock(cx * 16 + x, y, cz * 16 + z) !== v) this.chunks.setBlock(cx * 16 + x, y, cz * 16 + z, v);
    }
  }

  private reloadWorldView(): void {
    const pcx = Math.floor(this.player.x / 16), pcz = Math.floor(this.player.z / 16);
    const rd = getSettings().renderDistance + 1;
    for (let dz = -rd; dz <= rd; dz++) for (let dx = -rd; dx <= rd; dx++) if (this.chunks.chunkReady(pcx + dx, pcz + dz)) this.session.requestChunk?.(pcx + dx, pcz + dz);
    this.renderer.entities.clear();
  }

  // ---- main loop ----
  private frame(t: number): void {
    if (!this.running) return;
    requestAnimationFrame((tt) => this.frame(tt));
    const st = getSettings();
    let lim = st.fpsLimit;
    if (st.idleFps !== false) {
      const idle = !document.hasFocus() ? 15 : this.state === 'paused' ? 30 : performance.now() - this.lastInput > 90000 ? 30 : 0;
      if (idle && (!lim || idle < lim)) lim = idle;
    }
    if (lim > 0 && t - this.last < 1000 / lim - 1.5) return;
    const dt = Math.min(0.1, Math.max(0.0001, (t - this.last) / 1000));
    this.last = t;
    try { this.step(dt, t); } catch (e) { console.error(e); }
  }

  private step(dt: number, now: number): void {
    const s = this.session;
    const me = s.me;
    const playing = this.state === 'playing';
    const loading = this.state === 'loading';
    const local = s.info.kind === 'local';
    const frozen = local && (this.state === 'paused' || loading);
    if (!frozen && this.dayCycle && !local) this.time += dt * 20 * timeRate(this.time, this.rulesState.dayLength, this.rulesState.nightLength);
    if (local) this.time = (s as LocalSession).sim.time;
    this.voice?.update();
    if (playing) {
      const [lx, ly] = this.input.consumeLook();
      this.player.look(lx, ly);
      if (this.zoomHeld && this.input.hotbarDelta) { this.zoomLevel = Math.max(1.5, Math.min(30, this.zoomLevel * (this.input.hotbarDelta < 0 ? 1.25 : 0.8))); this.input.hotbarDelta = 0; }
      if (this.input.hotbarDelta) s.invOp({ t: 'select', i: (((me.inv.selected + this.input.hotbarDelta) % 9) + 9) % 9 });
      if (this.input.hotbarSelect !== null) s.invOp({ t: 'select', i: this.input.hotbarSelect });
      if (this.input.drop || this.input.dropAll) s.invOp({ t: 'drop', s: { c: 'inv', i: me.inv.selected }, all: this.input.dropAll });
      if (this.input.pick) this.interaction.pickBlock(s, this.chunks);
    } else this.input.consumeLook();
    const cartView = this.riding ? this.renderer.entities.views.get(this.riding) : undefined;
    if (this.riding && !cartView && !frozen) this.riding = null;
    if (cartView && !frozen) {
      this.player.setPos(cartView.x, cartView.y + (cartView.kind === 'mob' ? 1.6 : 0.35), cartView.z);
      if (playing && this.input.usePressed && heldStack(me.inv)?.id === I.FUNGUS_STICK) { s.useEntity(this.riding!); this.input.usePressed = false; }
      const rf = MF.RIDE | (playing && this.input.moveZ > 0.3 ? MF.FORWARD : 0) | (playing && this.input.crouch ? MF.CROUCH : 0) | (this.interaction?.charging ? MF.CHARGE : 0);
      if (!me.dead) s.move(this.player.x, this.player.y, this.player.z, this.player.yaw, this.player.pitch, rf);
      s.tick(dt, performance.now());
    } else if (!frozen && !this.dim) {
      const wasFlying = this.player.flying;
      this.player.update(dt, playing ? this.input : new InputState(), this.chunks, me.mode, me.dead);
      if (this.player.flying && !wasFlying) { this.input.crouchLatch = this.input.crouch = false; this.mobile.refreshState(); }
      if (this.player.landed) audio.play('player.fall', this.player.x, this.player.y, this.player.z, 0.6);
      if (this.player.enteredWater) { audio.play('splash', this.player.x, this.player.y, this.player.z); this.onFx('splash', this.player.x, this.player.y + 0.5, this.player.z); }
      if (!this.player.frozen && !me.dead) {
        this.moveSendT -= dt;
        s.move(this.player.x, this.player.y, this.player.z, this.player.yaw, this.player.pitch, this.player.flags() | (this.renderer.handSwing > 0.9 ? 1024 : 0) | (this.interaction?.charging ? MF.CHARGE : 0));
      }
      s.tick(dt, performance.now());
    } else if (!local || (this.dim && !frozen)) s.tick(dt, performance.now());
    if (playing && !loading && !this.dim && this.bpMode) {
      if (this.input.usePressed) this.confirmBlueprint();
      else if (this.input.pick) this.endBlueprint();
      this.input.usePressed = false; this.input.using = false; this.input.pick = false; this.input.attackPressed = false; this.input.breaking = false;
    }
    if (playing && !loading && !this.dim && !this.bpMode) this.interaction.update(dt, this.input, s, this.chunks, this.renderer, this.player, false);
    else this.renderer.setSelection(null);
    this.hud.setTarget(!!this.interaction.entityTarget);
    this.minimap?.setSupporter(!!this.session.me.supporter);
    const heldId = heldStack(this.session.me.inv)?.id ?? 0;
    if (heldId === I.COMPASS || heldId === I.CLOCK) {
      let text: string;
      const held = heldStack(this.session.me.inv);
      if (heldId === I.COMPASS && held?.lt) {
        const [lx, ly, lz] = held.lt, here = dimOf(this.player.x);
        const loaded = this.chunks.isLoaded(lx, lz);
        const gone = loaded && blockId(this.chunks.getBlock(lx, ly, lz)) !== CB.LODESTONE;
        if (dimOf(lx) !== here || gone) text = 'Lodestone Compass: the needle spins wildly';
        else {
          const dx = lx + 0.5 - this.player.x, dz = lz + 0.5 - this.player.z, d = Math.round(Math.hypot(dx, dz));
          const dirs = ['south', 'south-west', 'west', 'north-west', 'north', 'north-east', 'east', 'south-east'];
          text = d < 2 ? 'Lodestone Compass: the lodestone is right here' : `Lodestone Compass: lodestone is ${d} blocks ${dirs[(Math.round(Math.atan2(-dx, dz) / (Math.PI / 4)) + 8) % 8]}`;
        }
      } else if (heldId === I.COMPASS) {
        if (dimOf(this.player.x) !== 'overworld') text = 'Compass: the needle spins wildly';
        else {
          const sp = this.session.info.spawn, dx = sp.x - this.player.x, dz = sp.z - this.player.z, d = Math.round(Math.hypot(dx, dz));
          const dirs = ['south', 'south-west', 'west', 'north-west', 'north', 'north-east', 'east', 'south-east'];
          text = d < 3 ? 'Compass: you are at the world spawn' : `Compass: spawn is ${d} blocks ${dirs[(Math.round(Math.atan2(-dx, dz) / (Math.PI / 4)) + 8) % 8]}`;
        }
      } else {
        if (dimOf(this.player.x) !== 'overworld') text = 'Clock: the hands spin wildly';
        else { const t = ((Math.floor(this.time) % 24000) + 24000) % 24000, hh = Math.floor((t / 1000 + 6) % 24), mm = Math.floor(((t % 1000) / 1000) * 60); text = `Clock: ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} ${t < 12500 ? '(day)' : '(night)'}`; }
      }
      this.hud.setInstrument(text);
    } else this.hud.setInstrument(null);
    this.input.endFrame();
    this.chunks.update(this.player.x, this.player.z, this.player.gliding ? this.player.body.vx : 0, this.player.gliding ? this.player.body.vz : 0);
    if (loading && this.updateLoading()) { /* now playing */ }

    const cam = this.renderer.camera;
    const st = getSettings();
    let bobY = 0, bobX = 0;
    if (st.viewBobbing && this.player.body.onGround && !this.player.flying) {
      const sp = this.player.speedBps;
      const a = Math.min(1, sp / 5);
      bobY = Math.abs(Math.sin(this.player.bobPhase)) * 0.07 * a;
      bobX = Math.cos(this.player.bobPhase) * 0.03 * a;
    }
    this.renderer.handBob = this.player.bobPhase;
    let shakeX = 0;
    if (this.hurtShake > 0) { this.hurtShake -= dt; shakeX = Math.sin(this.hurtShake * 60) * 0.02; }
    this.player.rollStyle = (st.flightStyle ?? 'roll') === 'roll';
    cam.rotation.set(this.player.pitch, this.player.yaw, shakeX + bobX * 0.3 - (this.renderer.thirdPerson ? 0 : this.player.roll));
    const eye = new THREE.Vector3(this.player.x, this.player.eyeY + bobY, this.player.z);
    if (this.renderer.thirdPerson) {
      const dir = new THREE.Vector3();
      cam.position.copy(eye);
      cam.updateMatrixWorld();
      cam.getWorldDirection(dir);
      let dist = 4;
      const solidAt = (x: number, y: number, z: number) => getBlock(this.chunks.getBlock(Math.floor(x), Math.floor(y), Math.floor(z))).opaque;
      outer: for (let d = 0.1; d <= 4; d += 0.1) {
        const p = eye.clone().addScaledVector(dir, -d);
        for (const [ox, oy, oz] of [[0, 0, 0], [0.12, 0.12, 0.12], [-0.12, -0.12, 0.12], [0.12, -0.12, -0.12], [-0.12, 0.12, -0.12]]) {
          if (solidAt(p.x + ox, p.y + oy, p.z + oz)) { dist = Math.max(0, d - 0.15); break outer; }
        }
      }
      cam.position.copy(eye).addScaledVector(dir, -dist);
      this.renderer.entities.setEquipment('me', equipmentOf(me.inv));
      this.renderer.entities.upsert('me', 'player', 0, this.player.x, this.player.y, this.player.z, this.player.yaw, this.player.pitch, this.player.flags() | (this.renderer.handSwing > 0.9 ? 1024 : 0) | (this.riding ? MF.RIDE : 0), 0, performance.now(), { name: me.name, appearance: me.appearance, skin: this.renderer.selfSkin });
    } else cam.position.copy(eye);
    const draw = Math.min(1, this.interaction.drawing);
    const zoom = this.zoomHeld && this.state === 'playing' ? this.zoomLevel : 1;
    const fovTarget = ((st.fov + this.player.fovBoost * 9 * (this.player.flying ? 1.4 : 1) + this.player.speedFov * 26 * (st.speedFov ?? 0.6)) * (1 - 0.15 * draw * draw)) / zoom;
    if (Math.abs(cam.fov - fovTarget) > 0.05) this.renderer.setFov(cam.fov + (fovTarget - cam.fov) * Math.min(1, dt * (zoom > 1 || cam.fov < st.fov * 0.8 ? 14 : 10)));
    this.input.lookScale = zoom > 1 ? 1 / Math.sqrt(zoom) : 1;

    const rainTarget = this.weather === 'clear' ? 0 : 1;
    this.rain += (rainTarget - this.rain) * Math.min(1, dt * 0.4);
    this.thunder += ((this.weather === 'thunder' ? 1 : 0) - this.thunder) * Math.min(1, dt * 0.4);
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 3);
    const camBlock = this.chunks.getBlock(Math.floor(cam.position.x), Math.floor(cam.position.y), Math.floor(cam.position.z));
    const underwater = isWaterLike(camBlock);
    this.updateScreenFx(blockId(camBlock), now);
    const inLava = blockId(camBlock) === 13;
    this.renderer.entities.interpDelay = local ? 60 : 110;
    this.renderer.updateCages(dt, this.player.x, this.player.y, this.player.z);
    {
      let dragon: { x: number; y: number; z: number; extra: number } | null = null;
      const crystals: { x: number; y: number; z: number }[] = [];
      for (const v of this.renderer.entities.views.values()) {
        if (v.kind !== 'mob') continue;
        if (v.type === 19 && Math.hypot(v.x - this.player.x, v.z - this.player.z) < 220) dragon = v;
        else if (v.type === 20) crystals.push(v);
      }
      this.hud?.setBoss(dragon ? 'Ender Dragon' : null, dragon ? dragon.extra / 200 : 0);
      const beams: [number, number, number, number, number, number][] = [];
      if (dragon) { let best = null as { x: number; y: number; z: number } | null, bd = 32; for (const c of crystals) { const d = Math.hypot(c.x - dragon.x, c.y + 1.3 - dragon.y - 2, c.z - dragon.z); if (d < bd) { bd = d; best = c; } } if (best) beams.push([best.x, best.y + 1.3, best.z, dragon.x, dragon.y + 2.2, dragon.z]); }
      this.renderer.setBeams(beams);
    }
    this.renderer.entities.update(dt, performance.now());
    if (!this.contrails) this.contrails = new Contrails(this.renderer.scene);
    {
      const gl: Glider[] = this.renderer.entities.gliders();
      if (this.player.gliding) gl.push({ id: '__me', x: this.player.x, y: this.player.y, z: this.player.z, roll: this.player.roll });
      this.contrails.update(performance.now(), cam.position, gl, st.contrails ?? true);
    }
    this.renderer.moving.update(performance.now(), (x, y, z) => this.chunks.getBlock(x, y, z));
    if (this.shake > 0) { this.shake = Math.max(0, this.shake - dt * 1.2); this.renderer.camera.position.x += (Math.random() - 0.5) * this.shake * 0.3; this.renderer.camera.position.y += (Math.random() - 0.5) * this.shake * 0.3; }
    this.renderer.chests.update(dt, cam.position.x, cam.position.y, cam.position.z, Math.min(64, st.renderDistance * 16));
    this.renderer.particles.update(dt, this.chunks);
    if (!loading) this.renderer.particles.bubbles(dt, this.player.x, this.player.eyeY, this.player.z, this.chunks);
    if (!loading) this.renderer.particles.ambient(dt, this.player.x, this.player.eyeY, this.player.z, { night: this.renderer.skyState.night, cave: this.caveFx, rain: this.rain, underwater: blockId(this.chunks.getBlock(Math.floor(this.player.x), Math.floor(this.player.eyeY), Math.floor(this.player.z))) === 12, fx: dimOf(this.player.x) === 'nether' ? (this.nfBiome ? `n:${this.nfBiome}` : null) : dimOf(this.player.x) !== 'overworld' ? null : this.renderer.atmo.fx, fxAmt: this.renderer.atmo.fxAmt, day: this.renderer.skyState.day, dust: [this.renderer.atmo.dustColor.r, this.renderer.atmo.dustColor.g, this.renderer.atmo.dustColor.b] }, this.chunks);
    const biomeAt = (x: number, z: number) => this.gen!.biomeAt(x, z, this.chunks.levelAt(x, z));
    this.renderer.weather.intensity = dimOf(this.player.x) !== 'overworld' ? 0 : this.rain;
    this.renderer.weather.splash = (x, y, z) => this.renderer.particles.puff(x, y, z, 0.6, 0.7, 0.9, 2, 1.2, 6, 0.04, 0.3);
    this.renderer.weather.update(dt, cam.position, (x, z) => this.chunks.topAt(x, z), (x, z) => {
      const b = biomeAt(x, z);
      if (!b.rain) return 'none';
      return b.cold || cam.position.y > 115 ? 'snow' : 'rain';
    }, st.particles === 'low' ? 0.45 : st.particles === 'off' ? 0.2 : 1);
    audio.setListener(cam.position.x, cam.position.y, cam.position.z, this.player.yaw);
    audio.setCave(this.caveFx ?? 0);

    audio.setUnderwater(underwater);
    const sheltered = this.chunks.topAt(Math.floor(this.player.x), Math.floor(this.player.z)) > this.player.eyeY + 1;
    const precip = biomeAt(Math.floor(this.player.x), Math.floor(this.player.z));
    audio.setRain(precip.rain && !precip.cold && dimOf(this.player.x) === 'overworld' ? this.rain * (sheltered ? 0.35 : 1) : 0, this.weather === 'thunder');
    const underground = this.player.y < 50 && sheltered;
    audio.tickMusic(dt, this.renderer.skyState.night > 0.5, underground);
    if (underground) { this.caveT -= dt; if (this.caveT <= 0) { this.caveT = 25 + Math.random() * 60; audio.ambientCave(); } }
    this.atlas.updateAnimations(this.renderer.gl, Math.floor(now / 50));
    this.caveFx += ((underground ? 1 : 0) - this.caveFx) * Math.min(1, dt * 0.8);
    const wetSky = precip.rain && !precip.cold && !sheltered && !underwater ? this.rain : 0;
    this.renderer.sky.aurora += ((precip.cold ? 1 : 0) - this.renderer.sky.aurora) * Math.min(1, dt * 0.3);
    const inEnd = isEnd(this.player.x);
    const nether = isNether(this.player.x) || inEnd;
    if (!nether && this.gen && !loading) this.renderer.atmo.update({ dt, x: cam.position.x, y: cam.position.y, z: cam.position.z, time: this.time, rain: this.rain, pre: this.preStorm(), cave: this.caveFx, active: true, biome: (x, z) => biomeAt(x, z).id, top: (x, z) => this.chunks.topAt(x, z) }, this.renderer.skyState.night);
    if (nether && this.gen) {
      if (performance.now() - this.nfAt > 250) { this.nfAt = performance.now(); this.nfBiome = inEnd ? null : this.gen.netherBiome(Math.floor(this.player.x), Math.floor(this.player.z)); this.nfTarget = this.nfBiome ? NETHER_FOG[this.nfBiome] : [0.06, 0.045, 0.075]; }
      const k = Math.min(1, dt * 1.5);
      for (let i = 0; i < 3; i++) this.nfCol[i] += (this.nfTarget[i] - this.nfCol[i]) * k;
    }
    audio.setNetherAmbient(nether && !inEnd && !loading ? this.nfBiome : null, dt);
    this.updatePortalFx(dt);
    this.updateDim();
    this.updateBlueprint();
    if (this.darkT > 0) this.darkT = Math.max(0, this.darkT - dt);
    const env: FrameEnv = { dark: this.darkT > 0 ? Math.min(1, this.darkT / 1.5) * (0.65 + 0.35 * Math.sin(performance.now() / 1000 * Math.PI * 2 / 3)) : 0, nether, end: inEnd, netherFog: this.nfCol, time: inEnd ? 6000 : this.time, rain: nether ? 0 : this.rain, thunder: nether ? 0 : this.thunder, underwater, inLava, renderDistance: st.renderDistance, flash: this.flash, cave: this.caveFx, lensRain: wetSky };
    const dl = this.updateDynLights();
    const pl = Math.max(this.chunks.lightProbe(this.player.x, this.player.eyeY, this.player.z, this.renderer.skyState.day), dl);
    if (this.interaction.eating > 0) this.renderer.handEat = this.interaction.eating; else if (this.renderer.handEat > 0 && this.interaction.eating === 0) this.renderer.handEat = 0;
    if (!loading && !(this.dim && performance.now() - this.dim.t0 > 300)) this.renderer.render(dt, env, pl);

    this.hud.tick(dt);
    this.updateLook(dt);
    this.chatUI.tick();
    if (!this.panoDone && this.state === 'playing' && performance.now() - this.loadStart > 20000) { this.panoDone = true; if (!localStorage.getItem('strata.panorama')) this.capturePanorama(); }
    if (this.player.inBubbles && Math.random() < dt * 4) audio.play('bubble.' + (this.player.inBubbles > 0 ? 'up' : 'down'));
    this.player.usingItem = this.interaction.eating > 0 || this.interaction.drawing > 0 || this.interaction.blocking;
    this.player.blocking = this.interaction.blocking;
    this.renderer.blocking = this.interaction.blocking;
    this.player.depthStrider = this.session.me.inv.armor[3]?.en?.depth_strider ?? 0;
    { const el = this.session.me.inv.armor[1]; this.player.elytra = !!el && el.id === I.ELYTRA && (el.dmg ?? 0) < maxDurability(I.ELYTRA) - 1; this.player.soulSpeed = this.session.me.inv.armor[3]?.en?.soul_speed ?? 0; }
    { const held = heldStack(this.session.me.inv); this.hud.setAttackCharge(attackCharge(performance.now() - Math.max(this.interaction.lastSwing, this.interaction.strengthT), attackStats(held).speed)); }
    if (this.interaction.drawing > 0 || this.bowShown) { this.bowShown = this.interaction.drawing > 0; this.setHeld(); }
    if (!loading && this.minimap) { this.minimap.update(); this.renderer.beams.set(this.minimap.visibleWaypoints(), this.minimap.version * 2 + (this.minimap.hideAll ? 1 : 0) + (this.minimap.mapAllowed ? 0 : 7919)); }
    { const hs = heldStack(this.session.me.inv); const fd = hs ? getItem(hs.id)?.food : undefined; this.hud.updateVitals(this.vitals, this.hurtShake > 0, fd && this.vitals.food < 20 ? fd : null); }
    this.frames++;
    this.fpsT += dt;
    if (this.fpsT >= 0.5) {
      this.fpsVal = Math.round(this.frames / this.fpsT);
      this.frames = 0; this.fpsT = 0;
      this.hud.fps.textContent = `${this.fpsVal} FPS`;
      if (this.debugOn) this.updateDebug();
    }
    if (local && this.state !== 'loading') {
      this.saveTimer -= dt;
      if (this.saveTimer <= 0) { this.saveTimer = 45; void s.save?.(false).catch((e) => toast('Autosave failed: ' + (e as Error).message, 'error')); }
    }
    void this.lastPlace;
  }

  private updateDebug(): void {
    const p = this.player;
    const yaw = ((p.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const facing = ['north (-Z)', 'west (-X)', 'south (+Z)', 'east (+X)'][Math.round(yaw / (Math.PI / 2)) & 3];
    const st = this.session.stats();
    const mt = this.chunks.meshTimes;
    const avgMesh = mt.length ? (mt.reduce((a, b) => a + b, 0) / mt.length).toFixed(1) : '-';
    const t = Math.floor(this.time % TICKS_PER_DAY);
    const held = heldStack(this.session.me.inv);
    const lines = [
      `Strata  ${this.fpsVal} fps  scale ${this.renderer.effectiveScale.toFixed(2)}`,
      ...(this.session.sim.settings.allowCoords === false && !this.session.me.op ? [`Facing ${facing}`] : [
        `${isNether(p.x) ? 'Nether ' : isEnd(p.x) ? 'End ' : ''}XYZ ${localX(p.x).toFixed(2)} ${p.y.toFixed(2)} ${p.z.toFixed(2)}`,
        `Chunk ${Math.floor(p.x / 16)}, ${Math.floor(p.z / 16)}  facing ${facing}`]),
      `Biome ${(dimOf(p.x) !== 'overworld' ? null : this.gen!.caveBiomeName(p.x, p.y, p.z, this.chunks.levelAt(p.x, p.z))) ?? biomeNameAt(this.gen!, p.x, p.z, this.chunks.levelAt(p.x, p.z))}`,
      `Chunks ${this.chunks.loadedCount} loaded, ${this.renderer.chunkCount} meshed, ${this.chunks.pendingJobs} jobs, mesh ${avgMesh} ms`,
      `Draw calls ${this.renderer.drawCalls}  triangles ${(this.renderer.triangles / 1000).toFixed(0)}k  sections ${this.renderer.visibleSections}${this.renderer.lod ? `  distant tiles ${this.renderer.lod.tileCount}` : ''}`,
      `Entities ${this.renderer.entities.views.size}  time ${t}  weather ${this.weather}`,
      `Holding ${held ? getItem(held.id)?.name : 'nothing'}  mode ${this.session.me.mode}${p.flying ? ' (flying)' : ''}`,
      this.session.info.kind === 'remote' ? `Net ${st.state}  rtt ${st.rtt} ms  in ${st.inRate.toFixed(0)}/s  out ${st.outRate.toFixed(0)}/s` : 'Single player',
    ];
    this.hud.debug.textContent = lines.join('\n');
  }
}

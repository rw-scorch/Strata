import { GEN_LEVEL } from '../core/worldgen/genLevel';
import { MOB_BY_CODE } from '../core/sim/mobs';
import { loadCustomSkin } from '../resources/skins';
import { VoiceChat, VoiceState } from '../audio/VoiceChat';
import type { RuleSet } from '../core/sim/WorldSim';
import * as THREE from 'three';
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
import { ChatUI, showPause, showInvite, showPlayers, showRoomSettings, showShaper, showDeath } from '../ui/GameUI';
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
import { getBlock, blockId, LIGHT_EMIT, isWaterLike } from '../core/blocks';
import { heldStack } from '../core/inventory';
import { attackCharge, attackStats } from '../core/sim/combat';
import { MODE_TITLES, TICKS_PER_DAY, WORLD_HEIGHT, timeRate } from '../core/constants';
import { biomeNameAt, WorldGenerator } from '../core/worldgen/WorldGenerator';
import type { RoomMeta, PublicPlayer } from '../core/protocol';
import type { Weather } from '../core/sim/WorldSim';
import { getItem, I } from '../core/items';

export interface AppHooks {
  exitToTitle(reason?: string): void;
  openSettings(onClose: () => void): void;
  openPacks(onClose: () => void): void;
  currentAtlas(): TextureAtlas;
  rebuildAtlas(packIds?: string[]): Promise<TextureAtlas>;
  activePackRef(): { name: string; hash: string } | null;
  packIdForHash(hash: string): Promise<string | null>;
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
  private rain = 0;
  private thunder = 0;
  private flash = 0;
  private vitals: Vitals = { health: 20, food: 20, sat: 5, air: 300, xp: 0, dead: false, mode: 'survival' };
  private hurtShake = 0;
  private closePause: (() => void) | null = null;
  private closeDeath: (() => void) | null = null;
  private players = new Map<string, PublicPlayer>();
  private room: RoomMeta | null = null;
  private saveTimer = 45;
  private frames = 0;
  private lastInput = performance.now();
  private rulesState: RuleSet = {};
  zoomHeld = false;
  zoomLevel = 4;
  private dynLights: [number, number, number, number][] = [];

  private emitOf(id: number): number {
    if (id === I.LAVA_BUCKET) return 15;
    return id > 0 && id < 256 ? LIGHT_EMIT[id] : 0;
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
    for (let i = 0; i < 4; i++) { const o = out[i]; if (o) arr[i].set(o[0], o[1], o[2], o[3] - 1); else arr[i].set(0, 0, 0, 0); }
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
      } else if (ent.kind === 'player') lines = [{ t: ent.name ?? 'Player' }, { t: 'Player', c: '#5555ff' }];
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
  private minimap: Minimap | null = null;
  constructor(app: AppHooks, atlas: TextureAtlas) {
    if (import.meta.env.DEV) Object.assign(window, { __strata: this, __settings: updateSettings });
    this.app = app;
    this.atlas = atlas;
    this.canvas = document.getElementById('game') as HTMLCanvasElement;
    this.screens = document.getElementById('screens')!;
    this.hurtEl = document.getElementById('hurt-flash')!;
  }

  private setupCommon(seed: number, remote: boolean, arena: ArenaKind | null = null): void {
    const s = getSettings();
    const tint = document.getElementById('tint') as HTMLDivElement;
    this.renderer = new Renderer(this.canvas, this.atlas, (x, y, z) => Math.max(this.chunks?.lightProbe(x, y, z, this.renderer.skyState.day) ?? 1, this.dynLightAt(x, y, z)), tint);
    this.gen = new WorldGenerator(seed, arena, remote ? { secret: null } : undefined);
    this.renderer.setLodWorld(seed, arena);
    this.chunks = new ChunkManager(seed, arena, this.atlas.data, {
      loadStored: (cx, cz) => this.storedKeys?.has(`${cx},${cz}`) && this.worldMeta ? WorldStorage.loadChunk(this.worldMeta.id, cx, cz) : null,
      requestRemote: (cx, cz) => this.session?.requestChunk?.(cx, cz),
      onGenerated: (cx, cz, ents) => { if (this.session instanceof LocalSession) this.session.onGenerated(cx, cz, ents); },
      onMesh: (key, cx, cz, r) => this.renderer.setChunkMesh(key, cx, cz, r),
      onUnload: (key) => this.renderer.removeChunk(key),
      saveChunk: (cx, cz, data) => { if (this.worldMeta) void WorldStorage.saveChunks(this.worldMeta.id, [{ cx, cz, data }]); },
      onLoaded: (cx, cz) => { if (this.session instanceof LocalSession) this.session.sim.rs.queueRevalidate(cx, cz); },
      genLevel: (cx, cz) => (this.session instanceof LocalSession ? this.session.chunkLevel(cx, cz) : undefined) ?? GEN_LEVEL,
    }, remote);
    this.renderer.chests.getBlock = (x, y, z) => this.chunks.getBlock(x, y, z);
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
    this.chatUI.onSend = (t) => this.session.chat(t);
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
    const gesture = (e: Event) => e.preventDefault();
    document.addEventListener('gesturestart', gesture);
    this.disposers.push(() => document.removeEventListener('gesturestart', gesture));
    this.player.stepSound = (m) => audio.play(`step.${m}`, this.player.x, this.player.y, this.player.z);
    this.player.swimSound = () => audio.play('swim', this.player.x, this.player.y, this.player.z);
    this.interaction.onSwing = () => { this.renderer.handSwing = 1; };
    this.interaction.onDigSound = (g, x, y, z) => audio.play(`dig.${g}`, x, y, z);
    this.interaction.onDigParticles = (x, y, z, v) => this.breakParticles(x, y, z, v, false);
    this.interaction.onEatTick = () => { this.renderer.handEat += 1 / 60; if (Math.random() < 0.08) audio.play('player.eat', this.player.x, this.player.eyeY, this.player.z); };
    this.interaction.pvpCheck = () => this.session?.info.kind === 'remote' && ((this.session as unknown as { sim?: { settings: { pvp: boolean } } }).sim?.settings.pvp ?? !!this.room?.settings.pvp);
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
    screen: (t, _x, _y, _z, title) => this.onScreen(t, title),
    eco: (m) => this.onEco(m),
    game: (st) => { this.arena?.setState(st, this.session.me.id); this.renderer?.entities.setTags(new Map(st.players.filter((p) => p.ent).map((p) => [String(p.ent), { name: p.name, color: st.teams[p.team]?.color ?? '#ffffff' }]))); },
    title: (t, s) => this.arena?.title(t, s),
    trade: (info) => this.inv?.setTrade(info),
    chestLid: (x, y, z, n) => { this.renderer?.chests.setOpen(x, y, z, n); audio.play(n > 0 ? 'chest.open' : 'chest.close', x + 0.5, y + 0.5, z + 0.5); },
    hurt: (a, c, fx, fz, kb) => this.onHurt(a, c, fx, fz, kb),
    death: (m) => this.onDeath(m),
    respawn: (x, y, z) => this.onRespawn(x, y, z),
    teleport: (x, y, z) => this.onTeleport(x, y, z),
    chat: (from, text, kind, ts) => this.chatUI?.add(from, text, kind, ts),
    time: (t, cycle) => { this.time = t; this.dayCycle = cycle; },
    weather: (w) => { this.weather = w; },
    lightning: (x, y, z) => this.onLightning(x, y, z),
    player: (p) => this.onPlayer(p),
    playerLeft: (id) => this.onPlayerLeft(id),
    playerMove: (id, x, y, z, yaw, pitch, f) => this.onPlayerMove(id, x, y, z, yaw, pitch, f),
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
    this.setupCommon(rec.meta.seed, false, rec.meta.arena ?? null);
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
      const id = await this.app.packIdForHash(room.pack.hash);
      if (id) { packIds = [id]; packNote = `This world shares the resource pack "${room.pack.name}". It is installed, so you will see it.`; }
      else { packIds = room.settings.personalPacks ? s.activePacks : []; packNote = `This world suggests the resource pack "${room.pack.name}". You do not have it installed, so ${room.settings.personalPacks ? 'your own packs' : 'default textures'} are used. Gameplay is unaffected.`; }
    } else if (!room.settings.personalPacks) { packIds = []; if (s.activePacks.length) packNote = 'This world uses default textures for everyone.'; }
    this.atlas = await this.app.rebuildAtlas(packIds);
    this.setupCommon(room.seed, true, room.arena ?? null);
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
      players: () => [...this.renderer.entities.views.values()].filter((v) => v.kind === 'player' && v.id !== this.session.me.id).map((v) => ({ name: v.name ?? '', x: v.obj.position.x, z: v.obj.position.z })),
      camera: this.renderer.camera,
      sendChat: (t) => this.session.chat(t),
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
      if (e.code === 'KeyV' && !e.repeat) this.voice?.setPtt(down);
      if (e.code === 'KeyC' && !e.repeat) { this.zoomHeld = down && this.state === 'playing'; if (!down) this.zoomLevel = 4; }
      if (e.code === 'KeyM' && down && !e.repeat && this.voice) { this.voice.setMuted(!this.voice.muted); }
      if (down && !e.repeat && this.state === 'playing' && this.minimap) {
        if (e.code === 'KeyN' && e.shiftKey) this.minimap.toggleHideAll();
        else if (e.code === 'KeyN') { this.desktop?.unlock(); this.minimap.openBig(); }
        else if (e.code === 'KeyB') {
          const p = this.player;
          const w = this.minimap.add(`Waypoint ${this.minimap.waypoints.length + 1}`, p.x, p.y, p.z);
          toast(`Dropped ${w.name}. Press N to edit it.`, 'info');
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
    this.loadingEl = h('div', { class: 'screen loading-screen' }, h('h2', {}, text), h('div', { class: 'loading-bar' }, h('i')), h('div', { class: 'small muted' }, 'Generating terrain and lighting'));
    this.screens.appendChild(this.loadingEl);
  }

  private updateLoading(): boolean {
    if (!this.loadingEl) return true;
    const pcx = Math.floor(this.player.x / 16), pcz = Math.floor(this.player.z / 16);
    let done = 0, total = 0;
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) { total++; if (this.chunks.chunkMeshed(pcx + dx, pcz + dz)) done++; }
    const bar = this.loadingEl.querySelector('.loading-bar i') as HTMLElement;
    bar.style.width = `${Math.round((done / total) * 100)}%`;
    const ready = done >= total || (performance.now() - this.loadStart > 20000 && this.chunks.chunkMeshed(pcx, pcz));
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
    this.renderer?.gl.dispose();
    this.unsub?.();
    for (const d of this.disposers) d();
    document.querySelector('.chat-input-row')?.remove();
    document.body.classList.remove('touch-active');
    audio.setRain(0, false);
  }

  private setHeld(force = false): void {
    if (!this.session) return;
    const s = heldStack(this.session.me.inv);
    let id = s?.id ?? null;
    if (id === I.BOW && this.interaction?.drawing > 0) { const d = this.interaction.drawing; id = d > 0.9 ? I.BOW_PULL2 : d > 0.45 ? I.BOW_PULL1 : I.BOW_PULL0; }
    if (force) this.renderer.setHeld(-99, this.session.me.appearance.skin);
    this.renderer.setHeld(id, this.session.me.appearance.skin);
  }

  private breakParticles(x: number, y: number, z: number, v: number, many: boolean): void {
    const d = this.atlas.data;
    const id = blockId(v);
    if (!id) return;
    const tile = d.blockTiles[id * FACE_SLOTS + (getBlock(v).render === 'cross' ? 4 : 2)];
    const tint = d.tintTable[id * 2] ? [0.55, 0.75, 0.35] as [number, number, number] : null;
    const light = this.chunks.lightProbe(x, y, z, this.renderer.skyState.day);
    this.renderer.particles.blockBreak(x, y, z, tile, tint, light, many);
  }

  // ---- SessionEvents ----
  private onBlock(): void { /* chunk data is updated by the store */ }

  onEntity(id: string, kind: 'mob' | 'item' | 'arrow', type: number, x: number, y: number, z: number, yaw: number, flags: number, extra: number): void {
    this.renderer?.entities.upsert(id, kind, type, x, y, z, yaw, 0, flags, extra, performance.now());
  }

  onEntityRemove(id: string, death: boolean): void { this.renderer?.entities.remove(id, death); }

  onSound(name: string, x: number, y: number, z: number, vol?: number, pitch?: number): void {
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
      case 'splash': p.puff(x, y, z, 0.6, 0.75, 1, 10, 3, 9, 0.06, 0.6); break;
      case 'xp': p.puff(x, y, z, 0.7, 1, 0.3, 8, 2, -2, 0.07, 0.8); break;
    }
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
    } else if (this.inv.isOpen && ['chest', 'furnace', 'workbench', 'trade'].includes(this.inv.current)) {
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
      if (v) this.renderer.entities.upsert(`p:${p.id}`, 'player', 0, v.x, v.y, v.z, v.yaw, v.pitch, v.flags, 0, performance.now(), { name: p.name, appearance: p.appearance, skin: p.skin ?? null });
    }
  }

  onPlayerLeft(id: string): void { this.players.delete(id); this.renderer?.entities.removeNow(`p:${id}`); }

  onPlayerMove(id: string, x: number, y: number, z: number, yaw: number, pitch: number, flags: number): void {
    const p = this.players.get(id);
    this.renderer?.entities.upsert(`p:${id}`, 'player', 0, x, y, z, yaw, pitch, flags, 0, performance.now(), p ? { name: p.name, appearance: p.appearance, skin: p.skin ?? null } : undefined);
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

  onChunkData(cx: number, cz: number, data: Uint16Array | null): void {
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
    if (!frozen) {
      this.player.update(dt, playing ? this.input : new InputState(), this.chunks, me.mode, me.dead);
      if (this.player.landed) audio.play('player.fall', this.player.x, this.player.y, this.player.z, 0.6);
      if (this.player.enteredWater) { audio.play('splash', this.player.x, this.player.y, this.player.z); this.onFx('splash', this.player.x, this.player.y + 0.5, this.player.z); }
      if (!this.player.frozen && !me.dead) {
        this.moveSendT -= dt;
        s.move(this.player.x, this.player.y, this.player.z, this.player.yaw, this.player.pitch, this.player.flags() | (this.renderer.handSwing > 0.9 ? 1024 : 0));
      }
      s.tick(dt, performance.now());
    } else if (!local) s.tick(dt, performance.now());
    if (playing && !loading) this.interaction.update(dt, this.input, s, this.chunks, this.renderer, this.player, false);
    else this.renderer.setSelection(null);
    this.hud.setTarget(!!this.interaction.entityTarget);
    this.input.endFrame();
    this.chunks.update(this.player.x, this.player.z);
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
    cam.rotation.set(this.player.pitch, this.player.yaw, shakeX + bobX * 0.3);
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
      this.renderer.entities.upsert('me', 'player', 0, this.player.x, this.player.y, this.player.z, this.player.yaw, this.player.pitch, this.player.flags() | (this.renderer.handSwing > 0.9 ? 1024 : 0), 0, performance.now(), { name: me.name, appearance: me.appearance, skin: this.renderer.selfSkin });
    } else cam.position.copy(eye);
    const draw = Math.min(1, this.interaction.drawing);
    const zoom = this.zoomHeld && this.state === 'playing' ? this.zoomLevel : 1;
    const fovTarget = ((st.fov + this.player.fovBoost * 9 * (this.player.flying ? 1.4 : 1)) * (1 - 0.15 * draw * draw)) / zoom;
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
    this.renderer.entities.update(dt, performance.now());
    this.renderer.chests.update(dt, cam.position.x, cam.position.y, cam.position.z, Math.min(64, st.renderDistance * 16));
    this.renderer.particles.update(dt, this.chunks);
    if (!loading) this.renderer.particles.ambient(dt, this.player.x, this.player.eyeY, this.player.z, { night: this.renderer.skyState.night, cave: this.caveFx, rain: this.rain, underwater: blockId(this.chunks.getBlock(Math.floor(this.player.x), Math.floor(this.player.eyeY), Math.floor(this.player.z))) === 12 }, this.chunks);
    const biomeAt = (x: number, z: number) => this.gen!.column(x, z).biome;
    this.renderer.weather.intensity = this.rain;
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
    audio.setRain(precip.rain && !precip.cold ? this.rain * (sheltered ? 0.35 : 1) : 0, this.weather === 'thunder');
    const underground = this.player.y < 50 && sheltered;
    audio.tickMusic(dt, this.renderer.skyState.night > 0.5, underground);
    if (underground) { this.caveT -= dt; if (this.caveT <= 0) { this.caveT = 25 + Math.random() * 60; audio.ambientCave(); } }
    this.atlas.updateAnimations(this.renderer.gl, Math.floor(now / 50));
    this.caveFx += ((underground ? 1 : 0) - this.caveFx) * Math.min(1, dt * 0.8);
    const wetSky = precip.rain && !precip.cold && !sheltered && !underwater ? this.rain : 0;
    this.renderer.sky.aurora += ((precip.cold ? 1 : 0) - this.renderer.sky.aurora) * Math.min(1, dt * 0.3);
    const env: FrameEnv = { time: this.time, rain: this.rain, thunder: this.thunder, underwater, inLava, renderDistance: st.renderDistance, flash: this.flash, cave: this.caveFx, lensRain: wetSky };
    const dl = this.updateDynLights();
    const pl = Math.max(this.chunks.lightProbe(this.player.x, this.player.eyeY, this.player.z, this.renderer.skyState.day), dl);
    if (this.interaction.eating > 0) this.renderer.handEat = this.interaction.eating; else if (this.renderer.handEat > 0 && this.interaction.eating === 0) this.renderer.handEat = 0;
    if (!loading) this.renderer.render(dt, env, pl);

    this.hud.tick(dt);
    this.updateLook(dt);
    this.chatUI.tick();
    if (!this.panoDone && this.state === 'playing' && performance.now() - this.loadStart > 20000) { this.panoDone = true; if (!localStorage.getItem('strata.panorama')) this.capturePanorama(); }
    this.player.usingItem = this.interaction.eating > 0 || this.interaction.drawing > 0;
    { const held = heldStack(this.session.me.inv); this.hud.setAttackCharge(attackCharge(performance.now() - this.interaction.lastSwing, attackStats(held).speed)); }
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
        `XYZ ${p.x.toFixed(2)} ${p.y.toFixed(2)} ${p.z.toFixed(2)}`,
        `Chunk ${Math.floor(p.x / 16)}, ${Math.floor(p.z / 16)}  facing ${facing}`]),
      `Biome ${biomeNameAt(this.gen!, p.x, p.z)}`,
      `Chunks ${this.chunks.loadedCount} loaded, ${this.renderer.chunkCount} meshed, ${this.chunks.pendingJobs} jobs, mesh ${avgMesh} ms`,
      `Draw calls ${this.renderer.drawCalls}  triangles ${(this.renderer.triangles / 1000).toFixed(0)}k  sections ${this.renderer.visibleSections}${this.renderer.lod ? `  distant tiles ${this.renderer.lod.tileCount}` : ''}`,
      `Entities ${this.renderer.entities.views.size}  time ${t}  weather ${this.weather}`,
      `Holding ${held ? getItem(held.id)?.name : 'nothing'}  mode ${this.session.me.mode}${p.flying ? ' (flying)' : ''}`,
      this.session.info.kind === 'remote' ? `Net ${st.state}  rtt ${st.rtt} ms  in ${st.inRate.toFixed(0)}/s  out ${st.outRate.toFixed(0)}/s` : 'Single player',
    ];
    this.hud.debug.textContent = lines.join('\n');
  }
}

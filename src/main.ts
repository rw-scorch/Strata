import { setPackNames, usePackNames } from './core/items';
import './styles.css';
import { Menus } from './ui/Menus';
import { Game } from './game/Game';
import { TextureAtlas } from './resources/TextureAtlas';
import { ResourcePackManager } from './resources/ResourcePackManager';
import { loginSeen, getSettings, isTouchDevice, onSettings } from './storage/Settings';
import { showSettings } from './ui/SettingsUI';
import { showResourcePacks } from './ui/ResourcePackUI';
import { h, toast, modal } from './ui/dom';
import { installPackFont } from './ui/mc/BitmapFont';
import { applyMcTheme } from './ui/mc/Widgets';
import { audio } from './audio/AudioEngine';
import { isValidRoomCode, normalizeRoomCode } from './core/constants';
import type { WorldMeta } from './storage/WorldStorage';
import type { RemoteSession } from './multiplayer/RemoteSession';

interface BeforeInstallPromptEvent extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }>; }

class App {
  readonly screens = document.getElementById('screens')!;
  private atlas: TextureAtlas | null = null;
  private game: Game | null = null;
  private menus: Menus;
  private installEvt: BeforeInstallPromptEvent | null = null;
  private atlasKey = '';

  constructor() {
    const blur = () => document.documentElement.style.setProperty('--blur', String(getSettings().menuBlur ?? 5));
    blur();
    onSettings(blur);
    this.menus = new Menus({
      screens: this.screens,
      playLocal: (m) => void this.playLocal(m),
      playRemote: (c) => void this.playRemote(c),
      openSettings: () => this.openSettings(() => { /* back to menu */ }),
      openPacks: (auto?: boolean) => this.openPacks(() => this.menus.title(), auto),
      activePackRef: () => this.activePackRef(),
      canInstall: () => !!this.installEvt,
      install: () => void this.install(),
      atlas: () => this.atlas,
    });
  }

  async init(): Promise<void> {
    const unlock = () => audio.unlock();
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); this.installEvt = e as BeforeInstallPromptEvent; });
    if (isTouchDevice()) document.body.classList.add('touch-device');
    try { await this.rebuildAtlas(getSettings().activePacks); }
    catch (e) { console.error(e); await this.rebuildAtlas([]); toast('A resource pack failed to load; using built-in textures.', 'error'); }
    this.registerSW();
    const m = location.pathname.match(/^\/join\/([A-Za-z0-9]+)/);
    if (m) {
      const code = normalizeRoomCode(m[1]);
      history.replaceState(null, '', '/');
      this.menus.title();
      if (isValidRoomCode(code)) this.menus.multiplayer(code);
      else toast('That invitation link has an invalid room code.', 'error');
      return;
    }
    if (!loginSeen()) this.menus.login();
    else this.menus.title();
  }

  activePackRef(): { name: string; hash: string } | null {
    if (!this.atlas || this.atlas.packHash === 'default') return null;
    return { name: this.atlas.packNames[0] ?? 'Pack', hash: this.atlas.packHash.split('+')[0] };
  }

  async rebuildAtlas(ids: string[]): Promise<TextureAtlas> {
    const key = ids.join('|');
    if (this.atlas && key === this.atlasKey) return this.atlas;
    if (ids.length) {
      const up = await ResourcePackManager.upgrade(ids, (n) => toast(`Updating ${n} for this version...`, 'info', 2500));
      if (up.missing.length && !(window as unknown as { __reimp?: boolean }).__reimp) (window as unknown as { __reimp?: boolean }).__reimp = true, toast(`${up.missing.join(', ')} was imported by an older version. Open Resource Packs and tap "Re-import this pack" to get textures for new blocks, villagers and screens.`, 'info', 15000);
    }
    const composed = ids.length ? await ResourcePackManager.compose(ids) : null;
    setPackNames(composed?.itemNames ?? null);
    usePackNames(getSettings().packNames !== false);
    const maxTile = isTouchDevice() ? 32 : 64;
    const next = new TextureAtlas(composed, maxTile);
    if (composed?.sounds.size) void audio.setPackSounds(composed.sounds);
    else void audio.setPackSounds(new Map());
    void installPackFont(next.fontInfo);
    applyMcTheme(next);
    const old = this.atlas;
    this.atlas = next;
    this.atlasKey = key;
    if (this.game) this.game.setAtlas(next);
    else old?.dispose();
    return next;
  }

  private openSettings(onClose: () => void): void {
    showSettings(this.screens, {
      netStats: () => (this.game?.session?.info.kind === 'remote' ? (this.game.session as RemoteSession).stats() : null),
      canInstall: () => !!this.installEvt,
      install: () => void this.install(),
      openPacks: (done) => this.openPacks(done),
      inGame: !!this.game,
    }, onClose);
  }

  private openPacks(onClose: () => void, autoImport = false): void {
    const inRemote = this.game?.session?.info.kind === 'remote';
    const room = inRemote ? (this.game!.session as RemoteSession).room : null;
    const locked = room && !room.settings.personalPacks ? 'This world does not allow personal packs. Changes apply after you leave.' : undefined;
    showResourcePacks(this.screens, async (ids) => { if (!locked) await this.rebuildAtlas(ids); }, onClose, locked, autoImport);
  }

  private async install(): Promise<void> {
    const e = this.installEvt;
    if (!e) return;
    await e.prompt();
    const r = await e.userChoice;
    if (r.outcome === 'accepted') toast('Strata installed', 'success');
    this.installEvt = null;
  }

  private gameHooks() {
    return {
      exitToTitle: (reason?: string) => { this.game = null; document.body.classList.remove('in-game'); this.menus.title(); if (reason) toast(reason, 'info', 5000); void this.rebuildAtlas(getSettings().activePacks); },
      openSettings: (c: () => void) => this.openSettings(c),
      openPacks: (c: () => void) => this.openPacks(c),
      currentAtlas: () => this.atlas!,
      rebuildAtlas: (ids?: string[]) => this.rebuildAtlas(ids ?? getSettings().activePacks),
      activePackRef: () => this.activePackRef(),
      packIdForHash: async (hash: string) => (await ResourcePackManager.findByHash(hash))?.id ?? null,
    };
  }

  private async enterFullscreen(): Promise<void> {
    if (!isTouchDevice()) return;
    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
    try { if (!document.fullscreenElement) await (el.requestFullscreen?.({ navigationUI: 'hide' }) ?? el.webkitRequestFullscreen?.()); } catch { /* not supported, e.g. iPhone Safari */ }
    try { await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape'); } catch { /* not supported */ }
  }

  async playLocal(meta: WorldMeta): Promise<void> {
    this.menus.hide();
    void this.enterFullscreen();
    document.body.classList.add('in-game');
    const g = new Game(this.gameHooks(), this.atlas!);
    this.game = g;
    try { await g.startLocal(meta); }
    catch (e) {
      console.error(e);
      this.game = null;
      document.body.classList.remove('in-game');
      document.querySelectorAll('.loading-screen').forEach((x) => x.remove());
      this.menus.worlds();
      modal('Could not open world', (e as Error).message, [{ label: 'OK', kind: 'primary' }]);
    }
  }

  async playRemote(code: string): Promise<void> {
    this.menus.hide();
    const connecting = h('div', { class: 'screen loading-screen' }, h('h2', {}, `Joining ${code}`), h('div', { class: 'small muted' }, 'Connecting to the world server...'));
    this.screens.appendChild(connecting);
    void this.enterFullscreen();
    document.body.classList.add('in-game');
    const g = new Game(this.gameHooks(), this.atlas!);
    this.game = g;
    try { await g.startRemote(code); connecting.remove(); }
    catch (e) {
      console.error(e);
      connecting.remove();
      this.game = null;
      document.body.classList.remove('in-game');
      document.querySelectorAll('.loading-screen').forEach((x) => x.remove());
      this.menus.multiplayer();
      modal('Could not join', (e as Error).message || 'Connection failed.', [{ label: 'OK', kind: 'primary' }]);
    }
  }

  private registerSW(): void {
    if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      const prompt = (w: ServiceWorker) => {
        const bar = h('div', { class: 'update-banner panel' }, h('span', {}, 'A new version of Strata is ready.'), h('button', { class: 'btn small primary', onclick: () => { w.postMessage('SKIP_WAITING'); } }, 'Update'), h('button', { class: 'btn small ghost', onclick: () => bar.remove() }, 'Later'));
        document.body.appendChild(bar);
      };
      if (reg.waiting && navigator.serviceWorker.controller) prompt(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) prompt(w); });
      });
      setInterval(() => void reg.update().catch(() => { /* offline */ }), 30 * 60 * 1000);
    }).catch((e) => console.warn('service worker registration failed', e));
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      reloading = true;
      if (this.game) { toast('Update installed. It will apply next time you open Strata.', 'info', 5000); return; }
      location.reload();
    });
  }
}

const app = new App();
void app.init().catch((e) => {
  console.error(e);
  document.body.innerHTML = `<div style="padding:24px;color:#fff;font-family:system-ui">Strata could not start: ${String((e as Error).message ?? e)}. Your browser needs WebGL 2 and IndexedDB.</div>`;
});

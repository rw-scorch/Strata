import { ARENA_KINDS, ARENA_INFO, ArenaKind } from '../core/labs/minigames/arena';
import { h, clear, toast, modal, confirmDialog, promptDialog, toggle, segmented, slider, select, copyText, fmtDate, fmtTime, download } from './dom';
import { WorldStorage, WorldMeta } from '../storage/WorldStorage';
import { getSettings, updateSettings, getIdentity, getRooms, rememberRoom, forgetRoom, RoomRecord, getAccount, setAccount, accountRequest, markLoginSeen } from '../storage/Settings';
import { GAME_VERSION, MODE_TITLES, GameMode, Difficulty, DIFFICULTIES, DEFAULT_MAX_PLAYERS, MAX_PLAYERS_LIMIT, isValidRoomCode, normalizeRoomCode, PROTOCOL_VERSION } from '../core/constants';
import { seedFromInput } from '../core/rng';
import { drawAvatar } from './avatar';
import { apiURL } from '../multiplayer/RemoteSession';
import { REGIONS } from './SettingsUI';
import type { RoomInfo, RoomMeta } from '../core/protocol';
import { ResourcePackManager } from '../resources/ResourcePackManager';
import type { TextureAtlas } from '../resources/TextureAtlas';
import { Panorama } from './mc/Panorama';
import { mcButton, menuScale } from './mc/Widgets';
import { drawLogo } from './mc/Logo';
import { SHOP } from '../core/economy';
import { ITEM_LIST, getItem } from '../core/items';

const SPLASHES = ['Dig deep!', 'Build together!', 'Now with villagers!', 'Made in a browser!', 'Blocks all the way down!', 'iPad approved!', 'Try a double chest!', 'Emeralds wanted!', 'Thirty-minute days!', 'Watch your step!', 'Hand-placed pixels!', 'Fresh from the forge!', 'One more block!', 'Strata strata strata!', 'Sunsets included!', 'Villagers say hmm!'];

export interface MenuApp {
  screens: HTMLElement;
  playLocal(meta: WorldMeta): void;
  playRemote(code: string): void;
  openSettings(): void;
  openPacks(autoImport?: boolean): void;
  activePackRef(): { name: string; hash: string } | null;
  canInstall(): boolean;
  install(): void;
  atlas(): TextureAtlas | null;
}

function card(title: string, onBack: (() => void) | null, ...body: (Node | null)[]): HTMLElement {
  return h('div', { class: 'screen dim' },
    h('div', { class: 'card panel' },
      h('div', { class: 'card-head' }, onBack ? h('button', { class: 'icon-btn back-btn', 'aria-label': 'Back', onclick: onBack, html: '&larr;' }) : null, h('h2', {}, title)),
      h('div', { class: 'card-body' }, ...body),
    ),
  );
}

export class Menus {
  private app: MenuApp;
  private current: HTMLElement | null = null;

  constructor(app: MenuApp) { this.app = app; }

  private show(el: HTMLElement): void {
    this.current?.remove();
    this.current = el;
    this.app.screens.appendChild(el);
  }

  hide(): void { this.current?.remove(); this.current = null; this.pano?.dispose(); this.pano = null; }

  private pano: Panorama | null = null;

  private ensurePanorama(): void {
    if (this.pano?.ok) return;
    const faces = Panorama.stored();
    if (!faces) return;
    this.pano = new Panorama(faces);
    if (!this.pano.ok) { this.pano = null; return; }
    this.app.screens.prepend(this.pano.canvas);
  }

  title(): void {
    const s = getSettings();
    this.ensurePanorama();
    const atlas = this.app.atlas();
    const ms = menuScale();
    const bg = this.pano ? h('div', { class: 'mc-title-dim' }) : h('div', { class: 'strata-bg' }, h('div', { class: 'sky' }), h('div', { class: 'sun' }), h('div', { class: 'ridge r1' }), h('div', { class: 'ridge r2' }), h('div', { class: 'ridge r3' }));
    const splash = SPLASHES[Math.floor(Math.random() * SPLASHES.length)];
    const logo = h('div', { class: 'mc-logo' },
      (() => { const c = drawLogo('STRATA', atlas?.blockTileCanvas(1) ?? null, Math.max(4, Math.round(ms * 6))); c.className = 'mc-logo-img'; return c; })(),
      h('div', { class: 'mc-logo-sub' }, 'SANDBOX EDITION'),
      h('div', { class: 'mc-splash' }, splash));
    const head = drawAvatar(s.appearance, 2);
    const acct = getAccount();
    const profileBtn = mcButton(head, () => (acct ? this.profile() : this.login()), 20, { cls: 'square', tip: acct ? `Signed in as ${acct.name}` : 'Profile and sign in' });
    const creditsBtn = mcButton('i', () => this.credits(), 20, { cls: 'square', tip: 'Credits and attribution' });
    const packBtn = h('div', { class: 'mc-title-row' });
    void ResourcePackManager.list().then((packs) => {
      if (!packs.length) packBtn.appendChild(mcButton('Use Your Minecraft Textures', () => this.app.openPacks(true), 200, { tip: 'Import your own Minecraft resource pack. It stays on this device.' }));
    }).catch(() => { /* storage unavailable */ });
    const el = h('div', { class: 'screen title-screen mc-title' }, bg,
      logo,
      h('div', { class: 'mc-title-buttons' },
        mcButton('Singleplayer', () => this.worlds(), 200),
        mcButton('Multiplayer', () => this.multiplayer(), 200),
        getSettings().labs ? mcButton('Arena Games (Labs)', () => this.createWorld(false, 'spires'), 200) : packBtn,
        h('div', { class: 'mc-title-row last' }, profileBtn, mcButton('Options...', () => this.app.openSettings(), 98), mcButton(this.app.canInstall() ? 'Install App' : 'Resource Packs...', () => (this.app.canInstall() ? this.app.install() : this.app.openPacks()), 98), creditsBtn),
      ),
      h('div', { class: 'mc-title-foot' },
        h('span', { class: 'mct' }, `Strata ${GAME_VERSION}${acct ? `  (${acct.name})` : ''}`),
        h('span', { class: 'mct' }, 'Fan-made. Not affiliated with Mojang or Microsoft.')),
    );
    this.show(el);
  }

  login(after: () => void = () => this.title(), startTab: 'in' | 'new' = 'in'): void {
    let tab = startTab;
    const name = h('input', { class: 'input', maxlength: 16, placeholder: 'Your name', autocomplete: 'username', autocapitalize: 'off', spellcheck: 'false' }) as HTMLInputElement;
    const pw = h('input', { class: 'input', type: 'password', maxlength: 128, placeholder: 'Password', autocomplete: 'current-password' }) as HTMLInputElement;
    const pw2 = h('input', { class: 'input', type: 'password', maxlength: 128, placeholder: 'Repeat password', autocomplete: 'new-password' }) as HTMLInputElement;
    const guestName = h('input', { class: 'input', maxlength: 16, placeholder: 'Wayfarer', value: getSettings().playerName }) as HTMLInputElement;
    const err = h('div', { class: 'form-error', role: 'alert' });
    const go = h('button', { class: 'btn primary block' }) as HTMLButtonElement;
    const tabs = h('div', { class: 'segmented' });
    const repeatRow = h('label', { class: 'field' }, h('span', {}, 'Repeat password'), pw2);
    const draw = () => {
      clear(tabs);
      for (const [k, label] of [['in', 'Sign in'], ['new', 'Create account']] as const) tabs.appendChild(h('button', { class: tab === k ? 'on' : '', onclick: () => { tab = k; draw(); } }, label));
      go.textContent = tab === 'in' ? 'Sign in' : 'Create account';
      repeatRow.style.display = tab === 'new' ? '' : 'none';
      pw.autocomplete = tab === 'in' ? 'current-password' : 'new-password';
      err.textContent = '';
    };
    const submit = async () => {
      const n = name.value.trim();
      err.textContent = '';
      if (!/^[A-Za-z0-9_]{3,16}$/.test(n)) { err.textContent = 'Names are 3 to 16 letters, numbers or underscores.'; return; }
      if (pw.value.length < 6) { err.textContent = 'Passwords need at least 6 characters.'; return; }
      if (tab === 'new' && pw.value !== pw2.value) { err.textContent = 'The two passwords do not match.'; return; }
      go.disabled = true;
      go.textContent = tab === 'in' ? 'Signing in...' : 'Creating...';
      const r = await accountRequest(tab === 'in' ? 'login' : 'register', { name: n, password: pw.value });
      go.disabled = false;
      draw();
      if (!r.ok) { err.textContent = r.error; return; }
      setAccount(r.account!);
      markLoginSeen();
      toast(tab === 'in' ? `Welcome back, ${r.account!.name}.` : `Account created. Welcome, ${r.account!.name}.`, 'info');
      after();
    };
    go.addEventListener('click', () => void submit());
    for (const i of [name, pw, pw2]) i.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') void submit(); });
    draw();
    this.show(card('Your account', () => { markLoginSeen(); after(); },
      h('p', { class: 'small muted' }, 'An account keeps your name and your progress in multiplayer worlds on every device. Your password is never stored in the game.'),
      tabs,
      h('label', { class: 'field' }, h('span', {}, 'Name'), name),
      h('label', { class: 'field' }, h('span', {}, 'Password'), pw),
      repeatRow,
      err,
      go,
      h('div', { class: 'section-title' }, 'Or play as a guest'),
      h('div', { class: 'row' }, guestName, h('button', { class: 'btn', onclick: () => { const g = guestName.value.replace(/[<>~]/g, '').trim().slice(0, 16); if (g) updateSettings({ playerName: g }); markLoginSeen(); after(); } }, 'Play as guest')),
      h('p', { class: 'small muted' }, 'Guests keep progress only on this device. Registered names are protected, so a guest using one appears with a ~ in front.'),
    ));
    setTimeout(() => name.focus({ preventScroll: true }), 50);
  }

  profile(): void {
    const s = getSettings();
    const acc = getAccount();
    const name = h('input', { class: 'input', value: s.playerName, maxlength: 16, placeholder: 'Wayfarer' }) as HTMLInputElement;
    const prev = h('div', { class: 'player-preview', style: 'width:110px;height:170px' });
    const redraw = () => { clear(prev); prev.appendChild(drawAvatar(getSettings().appearance, 5, true)); };
    redraw();
    const pick = (label: string, key: 'skin' | 'hair' | 'shirt' | 'pants', n: number) => {
      const val = h('span', { style: 'width:28px;text-align:center' }, String(s.appearance[key] + 1));
      const btn = (d: number) => h('button', { class: 'btn small', onclick: () => { const a = { ...getSettings().appearance }; a[key] = (a[key] + d + n) % n; updateSettings({ appearance: a }); redraw(); val.textContent = String(a[key] + 1); } }, d < 0 ? '‹' : '›');
      return h('div', { class: 'row' }, h('span', { style: 'width:70px' }, label), btn(-1), val, btn(1));
    };
    this.show(card('Your wayfarer', () => this.title(),
      acc
        ? h('div', { class: 'account-box' }, h('div', {}, 'Signed in as ', h('b', {}, acc.name)), h('div', { class: 'row' },
            h('button', { class: 'btn small', onclick: () => this.changePassword(acc.name) }, 'Change password'),
            h('button', { class: 'btn small danger', onclick: () => { setAccount(null); toast('Signed out. You are playing as a guest.', 'info'); this.profile(); } }, 'Sign out')))
        : h('div', { class: 'account-box' }, h('div', { class: 'small muted' }, 'Playing as a guest.'), h('button', { class: 'btn small primary', onclick: () => this.login(() => this.profile()) }, 'Sign in or create account')),
      acc ? h('div', { class: 'small muted' }, 'Your account name is shown to other players.') : h('label', { class: 'field' }, h('span', {}, 'Name shown to other players'), name),
      h('div', { class: 'row', style: 'align-items:flex-start;gap:18px' }, prev, h('div', { class: 'stack' }, pick('Skin', 'skin', 8), pick('Hair', 'hair', 8), pick('Shirt', 'shirt', 12), pick('Trousers', 'pants', 12))),
      h('button', { class: 'btn primary', onclick: () => { if (!acc) updateSettings({ playerName: name.value.replace(/[<>~]/g, '').trim().slice(0, 16) }); this.title(); } }, 'Save'),
    ));
  }

  changePassword(accName: string): void {
    const cur = h('input', { class: 'input', type: 'password', autocomplete: 'current-password' }) as HTMLInputElement;
    const next = h('input', { class: 'input', type: 'password', autocomplete: 'new-password' }) as HTMLInputElement;
    const err = h('div', { class: 'form-error' });
    this.show(card('Change password', () => this.profile(),
      h('label', { class: 'field' }, h('span', {}, 'Current password'), cur),
      h('label', { class: 'field' }, h('span', {}, 'New password'), next),
      err,
      h('button', { class: 'btn primary', onclick: async () => {
        const r = await accountRequest('password', { name: accName, password: cur.value, next: next.value });
        if (!r.ok) { err.textContent = r.error; return; }
        toast('Password changed.', 'info');
        this.profile();
      } }, 'Change password'),
    ));
  }

  async worlds(): Promise<void> {
    const list = h('div', { class: 'list' }, h('div', { class: 'empty' }, 'Loading worlds...'));
    const importInput = h('input', { type: 'file', accept: '.json,application/json', style: 'display:none' }) as HTMLInputElement;
    importInput.addEventListener('change', async () => {
      const f = importInput.files?.[0];
      importInput.value = '';
      if (!f) return;
      try { const m = await WorldStorage.importWorld(f); toast(`Imported "${m.name}"`, 'success'); void this.worlds(); } catch (e) { toast((e as Error).message, 'error'); }
    });
    this.show(card('Singleplayer', () => this.title(),
      h('div', { class: 'row' }, h('button', { class: 'btn primary grow', onclick: () => this.createWorld(false) }, 'Create new world'), h('button', { class: 'btn ghost', onclick: () => importInput.click() }, 'Import'), importInput),
      list,
    ));
    let worlds: WorldMeta[] = [];
    try { worlds = await WorldStorage.list(); } catch (e) { clear(list); list.appendChild(h('div', { class: 'error-box' }, `Storage unavailable: ${(e as Error).message}`)); return; }
    clear(list);
    if (!worlds.length) list.appendChild(h('div', { class: 'empty' }, 'No worlds yet. Create one to begin your journey.'));
    for (const w of worlds) {
      const thumb = h('canvas', { class: 'world-thumb', width: 4, height: 4 }) as HTMLCanvasElement;
      const g = thumb.getContext('2d')!;
      const pal = [['#56a04a', '#6b4a30', '#4e4a50', '#3a3d46'], ['#e8d9a0', '#d2bf88', '#8a7a5a', '#4e4a50'], ['#f2f6f8', '#8a8a8a', '#5a5a5a', '#3a3d46']][w.seed % 3];
      for (let y = 0; y < 4; y++) { g.fillStyle = pal[y]; g.fillRect(0, y, 4, 1); }
      list.appendChild(h('div', { class: 'list-item' }, thumb,
        h('div', { class: 'meta' },
          h('div', { class: 'name' }, w.name),
          h('div', { class: 'sub' }, `${MODE_TITLES[w.mode].title} (${MODE_TITLES[w.mode].sub}) · ${w.difficulty} · ${fmtDate(w.lastPlayed)}${w.playTime ? ` · ${fmtTime(w.playTime)}` : ''}`),
        ),
        h('div', { class: 'actions' },
          h('button', { class: 'btn small primary', onclick: () => this.app.playLocal(w) }, 'Play'),
          h('button', { class: 'btn small ghost', onclick: () => this.worldActions(w) }, 'More'),
        ),
      ));
    }
  }

  private worldActions(w: WorldMeta): void {
    const m = modal(w.name, h('div', { class: 'stack' },
      h('div', { class: 'kv small' }, h('dt', {}, 'Seed'), h('dd', {}, String(w.seed)), h('dt', {}, 'Created'), h('dd', {}, fmtDate(w.createdAt)), h('dt', {}, 'Mode'), h('dd', {}, `${MODE_TITLES[w.mode].title} (${MODE_TITLES[w.mode].sub})`)),
      h('button', { class: 'btn', onclick: async () => { const n = await promptDialog('Rename world', 'World name', w.name); if (n) { await WorldStorage.rename(w.id, n); m.close(); void this.worlds(); } } }, 'Rename'),
      h('button', { class: 'btn', onclick: async () => { const d = await WorldStorage.duplicate(w.id); if (d) toast(`Created "${d.name}"`, 'success'); m.close(); void this.worlds(); } }, 'Duplicate'),
      h('button', { class: 'btn', onclick: async () => { try { download(await WorldStorage.exportWorld(w.id), `${w.name.replace(/[^a-z0-9]+/gi, '_')}.strata.json`); } catch (e) { toast((e as Error).message, 'error'); } } }, 'Export backup'),
      h('button', { class: 'btn danger', onclick: async () => { if (await confirmDialog('Delete world', `Delete "${w.name}" forever? This cannot be undone.`, 'Delete', true)) { await WorldStorage.remove(w.id); m.close(); void this.worlds(); } } }, 'Delete'),
    ), [{ label: 'Close', kind: 'ghost' }]);
  }

  createWorld(multi: boolean, preset: ArenaKind | null = null): void {
    const s = getSettings();
    let arena: ArenaKind | null = preset;
    let mode: GameMode = 'survival';
    let difficulty: Difficulty = s.difficulty;
    let maxPlayers = DEFAULT_MAX_PLAYERS;
    let region = s.region;
    let pvp = true, guestsBuild = true, cheats = false, sharePack = !!this.app.activePackRef(), personalPacks = true;
    const name = h('input', { class: 'input', value: multi ? `${s.playerName || 'Wayfarer'}'s World` : 'New World', maxlength: 32 }) as HTMLInputElement;
    const seed = h('input', { class: 'input', placeholder: 'Leave blank for a random seed', maxlength: 40 }) as HTMLInputElement;
    const err = h('div');
    const modes = h('div', { class: 'mode-cards' });
    const renderModes = () => {
      clear(modes);
      for (const m of ['survival', 'creative'] as GameMode[]) {
        const t = MODE_TITLES[m];
        modes.appendChild(h('button', { class: `mode-card${mode === m ? ' on' : ''}`, onclick: () => { mode = m; if (m === 'creative') cheats = true; renderModes(); } },
          h('b', {}, t.title), h('span', { class: 'badge' }, t.sub),
          h('small', {}, m === 'survival' ? 'Gather, craft and survive the night. Health, hunger and hostile creatures.' : 'Unlimited blocks, flight, instant breaking and the World Shaper.')));
      }
    };
    renderModes();
    const types = h('div', { class: `mode-cards${getSettings().labs ? ' three' : ''}` });
    const modeBlock = h('div');
    const renderTypes = () => {
      clear(types);
      const opts: [ArenaKind | null, string, string, string][] = [
        [null, 'Open World', 'Endless', 'The full seeded world. Explore, build and survive.'],
        ...(getSettings().labs || arena ? ARENA_KINDS : []).map((k) => [k, ARENA_INFO[k].name, ARENA_INFO[k].alt, ARENA_INFO[k].desc] as [ArenaKind, string, string, string]),
      ];
      for (const [k, title, sub, desc] of opts) {
        types.appendChild(h('button', { class: `mode-card${arena === k ? ' on' : ''}`, onclick: () => { arena = k; if (k) { mode = 'survival'; pvp = true; } renderTypes(); } },
          h('b', {}, title), h('span', { class: 'badge' }, sub), h('small', {}, desc)));
      }
      modeBlock.style.display = arena ? 'none' : '';
      if (arena && name.value.match(/World$/)) name.value = ARENA_INFO[arena].name;
    };
    renderTypes();
    const create = h('button', { class: 'btn primary block' }, multi ? 'Create online world' : 'Create and play') as HTMLButtonElement;
    create.addEventListener('click', async () => {
      clear(err);
      const sd = seedFromInput(seed.value);
      if (!multi) {
        const meta = await WorldStorage.create(name.value.trim() || 'New World', sd, mode, difficulty, arena);
        this.app.playLocal(meta);
        return;
      }
      create.disabled = true;
      create.textContent = 'Creating...';
      const id = getIdentity();
      try {
        const res = await fetch(apiURL('/api/rooms'), {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            name: name.value.trim() || 'Untitled World', seed: sd, mode, difficulty, maxPlayers, ownerId: id.id, ownerSecret: id.secret,
            ownerName: s.playerName || 'Wayfarer', region: region === 'auto' ? undefined : region,
            settings: { pvp: pvp || !!arena, guestsBuild, cheats, personalPacks }, pack: sharePack ? this.app.activePackRef() : null, arena,
          }),
        });
        const j = await res.json() as { code?: string; room?: RoomMeta; error?: string };
        if (!res.ok || !j.code) throw new Error(j.error ?? `Server error ${res.status}`);
        rememberRoom('hosted', { code: j.code, name: j.room?.name ?? name.value, at: Date.now(), owner: true, mode });
        this.roomCreated(j.code, j.room!);
      } catch (e) {
        err.appendChild(h('div', { class: 'error-box' }, `Could not create the world: ${(e as Error).message}. Multiplayer needs an internet connection and a deployed Strata server.`));
        create.disabled = false;
        create.textContent = 'Create online world';
      }
    });
    modeBlock.append(h('div', { class: 'section-title' }, 'Game mode'), modes);
    const mpOptions = multi ? [
      slider('Maximum players', 1, MAX_PLAYERS_LIMIT, 1, maxPlayers, (v) => `${v}`, (v) => { maxPlayers = v; }),
      select('Server region', REGIONS as [string, string][], region, (v) => { region = v; }),
      toggle('Player combat (PvP)', pvp, (v) => { pvp = v; }),
      toggle('Guests can build', guestsBuild, (v) => { guestsBuild = v; }),
      toggle('Share my active resource pack', sharePack, (v) => { sharePack = v; }, this.app.activePackRef() ? `Players with "${this.app.activePackRef()!.name}" installed will see it.` : 'No pack is active.'),
      toggle('Allow personal resource packs', personalPacks, (v) => { personalPacks = v; }),
    ] : [];
    this.show(card(multi ? 'Create online world' : 'Create world', () => (multi ? this.multiplayer() : this.worlds()),
      h('label', { class: 'field' }, h('span', {}, 'World name'), name),
      h('div', { class: 'section-title' }, 'World type'), types,
      h('label', { class: 'field' }, h('span', {}, 'Seed'), seed),
      modeBlock,
      h('div', { class: 'section-title' }, 'Difficulty'),
      segmented(DIFFICULTIES.map((d) => [d, d[0].toUpperCase() + d.slice(1)] as [Difficulty, string]), difficulty, (d) => { difficulty = d; }),
      toggle('Allow commands', cheats, (v) => { cheats = v; }, '/time, /weather, /give, /tp and the World Shaper.'),
      ...mpOptions, err, create,
    ));
  }

  roomCreated(code: string, room: RoomMeta): void {
    const link = `${location.origin}/join/${code}`;
    this.show(card('Your world is ready', () => this.multiplayer(),
      h('p', { class: 'muted', style: 'margin:0' }, `Share this code so friends can join "${room.name}". It stays online even when you close your browser.`),
      h('div', { class: 'room-code' }, code),
      h('div', { class: 'menu-row' },
        h('button', { class: 'btn', onclick: async () => toast((await copyText(code)) ? 'Room code copied' : 'Copy failed', 'success') }, 'Copy code'),
        h('button', { class: 'btn', onclick: async () => toast((await copyText(link)) ? 'Invitation link copied' : 'Copy failed', 'success') }, 'Copy link'),
      ),
      'share' in navigator ? h('button', { class: 'btn teal block', onclick: () => { navigator.share({ title: 'Join my Strata world', text: `Join "${room.name}" in Strata with code ${code}`, url: link }).catch(() => { /* cancelled */ }); } }, 'Share invitation') : null,
      h('button', { class: 'btn primary block', onclick: () => this.app.playRemote(code) }, 'Start playing'),
    ));
  }

  multiplayer(prefill = ''): void {
    const codeInput = h('input', { class: 'input code-input', maxlength: 9, placeholder: 'ABCD2345', value: prefill, autocapitalize: 'characters', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Room code' }) as HTMLInputElement;
    const err = h('div');
    codeInput.addEventListener('input', () => { codeInput.value = normalizeRoomCode(codeInput.value); });
    const go = () => {
      clear(err);
      let v = codeInput.value.trim();
      const m = v.match(/join\/([A-Za-z0-9]+)/);
      if (m) v = m[1];
      v = normalizeRoomCode(v);
      if (!isValidRoomCode(v)) { err.appendChild(h('div', { class: 'error-box' }, 'Room codes are 8 characters using letters A-Z (no I or O) and digits 2-9.')); return; }
      void this.joinPreview(v);
    };
    codeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    const recent = h('div', { class: 'list' });
    const hosted = h('div', { class: 'list' });
    const renderRooms = (box: HTMLElement, kind: 'recent' | 'hosted') => {
      clear(box);
      const rooms = getRooms(kind);
      if (!rooms.length) { box.appendChild(h('div', { class: 'small muted' }, kind === 'recent' ? 'Worlds you join appear here.' : 'Worlds you create appear here.')); return; }
      for (const r of rooms) box.appendChild(this.roomRow(r, kind, () => renderRooms(box, kind)));
    };
    renderRooms(recent, 'recent');
    renderRooms(hosted, 'hosted');
    if (!navigator.onLine) err.appendChild(h('div', { class: 'error-box' }, 'You appear to be offline. Multiplayer needs an internet connection; single-player still works.'));
    this.show(card('Multiplayer', () => this.title(),
      h('button', { class: 'btn primary block', onclick: () => this.createWorld(true) }, 'Create online world'),
      h('div', { class: 'section-title' }, 'Join with a code'),
      h('div', { class: 'row' }, h('div', { class: 'grow' }, codeInput), h('button', { class: 'btn teal', onclick: go }, 'Join')),
      h('div', { class: 'small muted' }, 'You can also paste an invitation link, or simply open it in your browser.'),
      err,
      h('div', { class: 'section-title' }, 'Hosted worlds'), hosted,
      h('div', { class: 'section-title' }, 'Recent worlds'), recent,
      h('div', { class: 'row', style: 'justify-content:flex-end;margin-top:10px' }, h('button', { class: 'btn small ghost', onclick: () => void this.adminConsole() }, 'Server admin console')),
    ));
    if (prefill && isValidRoomCode(prefill)) void this.joinPreview(prefill);
  }

  async adminConsole(): Promise<void> {
    const keyIn = h('input', { class: 'input', type: 'password', placeholder: 'ADMIN_KEY', autocomplete: 'off', value: sessionStorage.getItem('strata.adminKey') ?? '' }) as HTMLInputElement;
    const list = h('div', { class: 'stack' });
    const status = h('div', { class: 'small muted' });
    const api = async (path: string, body?: unknown) => {
      const res = await fetch(apiURL(path), { method: body ? 'POST' : 'GET', headers: { 'x-admin-key': keyIn.value.trim(), 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      const j = await res.json().catch(() => ({})) as Record<string, unknown>;
      if (!res.ok) throw new Error(String(j.error ?? res.status));
      return j;
    };
    type Rep = { code: string; name: string; owner: string; mode: string; difficulty: string; maxPlayers: number; live: boolean; updated: number; voice: boolean; arena: string | null; players: { id: string; name: string; x: number; y: number; z: number; op: boolean; mode: string; health: number; dead: boolean; vanished?: boolean }[] };
    const spectate = (code: string, at?: string) => {
      sessionStorage.setItem('strata.spectate', JSON.stringify({ code, key: keyIn.value.trim(), at: at ?? '' }));
      this.app.playRemote(code);
    };
    const act = async (code: string, body: Record<string, unknown>, done: string) => {
      try { const r = await api(`/api/admin/rooms/${code}`, body); toast(r.result ? String(r.result) : done, 'success'); void load(); } catch (e) { toast(`Failed: ${(e as Error).message}`, 'error'); }
    };
    const prices = async (code: string, name: string) => {
      let data: { sell: Record<string, number>; shop: Record<string, number>; economy: boolean };
      try { data = (await api(`/api/admin/rooms/${code}`, { action: 'prices' })) as typeof data; } catch (e) { toast(`Failed: ${(e as Error).message}`, 'error'); return; }
      const q = h('input', { class: 'input', placeholder: 'Search items or shop entries' }) as HTMLInputElement;
      const box = h('div', { class: 'stack price-list' });
      const sellPatch: Record<string, number> = {}, shopPatch: Record<string, number> = {};
      const draw = () => {
        clear(box);
        const t = q.value.trim().toLowerCase();
        box.appendChild(h('div', { class: 'section-title' }, 'Shop prices (what /shop charges)'));
        for (const c of SHOP) for (const e of c.items) {
          if (t && !e.key.includes(t) && !(getItem(e.id)?.name.toLowerCase().includes(t))) continue;
          const inp = h('input', { class: 'input', value: String(shopPatch[e.key] ?? data.shop[e.key] ?? e.price), inputmode: 'numeric', style: 'width:110px' }) as HTMLInputElement;
          inp.addEventListener('change', () => { const n = Math.floor(Number(inp.value)); if (n > 0) shopPatch[e.key] = n; });
          box.appendChild(h('div', { class: 'player-row' }, h('span', { class: 'nm' }, `${c.name}: ${getItem(e.id)?.name ?? e.key} x${e.count}`), inp));
        }
        box.appendChild(h('div', { class: 'section-title' }, 'Sell prices per item (what /sell pays, 0 = cannot sell)'));
        let n = 0;
        for (const it of ITEM_LIST) {
          if (t && !it.name.toLowerCase().includes(t) && !it.key.includes(t)) continue;
          if (++n > 120) break;
          const inp = h('input', { class: 'input', value: String(sellPatch[it.id] ?? data.sell[it.id] ?? 0), inputmode: 'numeric', style: 'width:110px' }) as HTMLInputElement;
          inp.addEventListener('change', () => { const v = Math.floor(Number(inp.value)); if (v >= 0) sellPatch[it.id] = v; });
          box.appendChild(h('div', { class: 'player-row' }, h('span', { class: 'nm' }, it.name), inp));
        }
      };
      q.addEventListener('input', draw);
      draw();
      modal(`Prices: ${name}`, h('div', { class: 'stack' }, h('div', { class: 'small muted' }, `Economy is ${data.economy ? 'on' : 'off'} in this world. Changes apply to everyone right away.`), q, box), [
        { label: data.economy ? 'Turn economy off' : 'Turn economy on', kind: 'ghost', onClick: () => void act(code, { action: 'economy', on: !data.economy }, data.economy ? 'Economy turned off.' : 'Economy turned on.') },
        { label: 'Close', kind: 'ghost' },
        { label: 'Save prices', kind: 'primary', onClick: async () => {
          const chunks: Record<string, number>[] = [];
          const entries = Object.entries(sellPatch);
          for (let i = 0; i < entries.length; i += 150) chunks.push(Object.fromEntries(entries.slice(i, i + 150)));
          try {
            await api(`/api/admin/rooms/${code}`, { action: 'prices', shop: shopPatch, sell: chunks[0] ?? {} });
            for (const c of chunks.slice(1)) await api(`/api/admin/rooms/${code}`, { action: 'prices', sell: c });
            toast('Prices saved.', 'success');
          } catch (e) { toast(`Failed: ${(e as Error).message}`, 'error'); }
        } },
      ], { wide: true });
    };
    const row = (r: Rep): HTMLElement => {
      const players = h('div', { class: 'stack', style: 'margin-top:6px' });
      for (const p of r.players) {
        players.appendChild(h('div', { class: 'list-item' },
          h('div', { class: 'meta' }, h('div', { class: 'name' }, p.name, p.op ? h('span', { class: 'badge gold', style: 'margin-left:6px' }, 'Admin') : null, p.vanished ? h('span', { class: 'badge', style: 'margin-left:6px' }, 'Spectating') : null),
            h('div', { class: 'sub' }, `${p.x}, ${p.y}, ${p.z} · ${p.mode} · ${p.dead ? 'dead' : `${p.health} hp`}`)),
          h('div', { class: 'actions' },
            h('button', { class: 'btn small teal', onclick: () => spectate(r.code, p.id) }, 'Watch'),
            h('button', { class: 'btn small danger', onclick: async () => { if (await confirmDialog('Kick player', `Remove ${p.name} from "${r.name}"?`, 'Kick', true)) void act(r.code, { action: 'kick', pid: p.id }, `${p.name} was kicked.`); } }, 'Kick'),
          )));
      }
      const msg = h('input', { class: 'input', placeholder: 'Message everyone in this world', maxlength: 200, style: 'width:100%' }) as HTMLInputElement;
      return h('div', { class: 'list-item', style: 'flex-direction:column;align-items:stretch' },
        h('div', { class: 'row', style: 'justify-content:space-between;gap:8px;flex-wrap:wrap' },
          h('div', { class: 'meta' }, h('div', { class: 'name' }, r.name, h('span', { class: `badge ${r.live ? 'teal' : ''}`, style: 'margin-left:6px' }, r.live ? `${r.players.length}/${r.maxPlayers} online` : 'idle')),
            h('div', { class: 'sub' }, `${r.code} · owner ${r.owner} · ${r.mode} · ${r.difficulty}${r.arena ? ` · ${r.arena}` : ''} · last seen ${fmtDate(r.updated)}`)),
          h('div', { class: 'actions' },
            h('button', { class: 'btn small teal', onclick: () => spectate(r.code) }, 'Spectate'),
            h('button', { class: 'btn small', onclick: () => void prices(r.code, r.name) }, 'Prices'),
            h('button', { class: 'btn small danger', onclick: async () => { if (await confirmDialog('Delete world', `Permanently delete "${r.name}" (${r.code})? This cannot be undone.`, 'Delete', true)) void act(r.code, { action: 'delete' }, 'World deleted.'); } }, 'Delete'),
          )),
        players,
        h('div', { class: 'row', style: 'gap:6px;margin-top:6px' },
          h('div', { class: 'grow', style: 'flex:1;min-width:0' }, msg),
          h('button', { class: 'btn small', onclick: () => { if (msg.value.trim()) void act(r.code, { action: 'say', text: msg.value.trim() }, 'Message sent.'); msg.value = ''; } }, 'Send')),
        h('div', { class: 'row', style: 'gap:6px;flex-wrap:wrap;margin-top:6px' },
          h('button', { class: 'btn small ghost', onclick: () => void act(r.code, { action: 'settings', voice: !r.voice }, r.voice ? 'Voice chat turned off.' : 'Voice chat turned on.') }, r.voice ? 'Voice: on' : 'Voice: off'),
          h('button', { class: 'btn small ghost', onclick: () => void act(r.code, { action: 'settings', maxPlayers: r.maxPlayers >= MAX_PLAYERS_LIMIT ? 10 : Math.min(MAX_PLAYERS_LIMIT, r.maxPlayers + 10) }, 'Player cap changed.') }, `Cap: ${r.maxPlayers}`),
          h('button', { class: 'btn small ghost', onclick: () => void act(r.code, { action: 'rule', cmd: 'showMinimap false' }, 'Minimap hidden.') }, 'Hide minimap'),
          h('button', { class: 'btn small ghost', onclick: () => void act(r.code, { action: 'rule', cmd: 'showCoordinates false' }, 'Coordinates hidden.') }, 'Hide coords'),
          h('button', { class: 'btn small ghost', onclick: () => { void act(r.code, { action: 'rule', cmd: 'showMinimap true' }, 'Minimap allowed.'); void act(r.code, { action: 'rule', cmd: 'showCoordinates true' }, 'Coordinates allowed.'); } }, 'Allow both'),
        ));
    };
    const load = async () => {
      clear(list);
      status.textContent = 'Loading...';
      try {
        const j = await api('/api/admin/rooms') as { rooms: Rep[] };
        sessionStorage.setItem('strata.adminKey', keyIn.value.trim());
        const live = j.rooms.filter((r) => r.live);
        status.textContent = `${j.rooms.length} worlds, ${live.length} active, ${live.reduce((a, r) => a + r.players.length, 0)} players online. Worlds appear here after someone joins them on this version.`;
        for (const r of j.rooms) list.appendChild(row(r));
      } catch (e) { status.textContent = `Could not load: ${(e as Error).message}`; }
    };
    this.show(card('Server admin console', () => this.multiplayer(),
      h('div', { class: 'small muted' }, 'Enter the ADMIN_KEY secret set on your Cloudflare Worker. It is only kept for this browser tab.'),
      h('div', { class: 'row' }, h('div', { class: 'grow' }, keyIn), h('button', { class: 'btn primary', onclick: () => void load() }, 'Open')),
      status, list,
    ));
    if (keyIn.value) void load();
  }

  private roomRow(r: RoomRecord, kind: 'recent' | 'hosted', refresh: () => void): HTMLElement {
    const sub = h('div', { class: 'sub' }, `${r.code} · ${fmtDate(r.at)}`);
    void fetch(apiURL(`/api/rooms/${r.code}`)).then((x) => x.json()).then((info: RoomInfo) => {
      sub.textContent = info.exists ? `${r.code} · ${info.players?.length ?? 0}/${info.maxPlayers} online · ${MODE_TITLES[info.mode ?? 'survival'].title}` : `${r.code} · no longer exists`;
    }).catch(() => { sub.textContent = `${r.code} · status unavailable`; });
    return h('div', { class: 'list-item' },
      h('div', { class: 'meta' }, h('div', { class: 'name' }, r.name, kind === 'hosted' ? h('span', { class: 'badge gold', style: 'margin-left:6px' }, 'Owner') : null), sub),
      h('div', { class: 'actions' },
        h('button', { class: 'btn small primary', onclick: () => void this.joinPreview(r.code) }, 'Join'),
        h('button', { class: 'btn small ghost', onclick: async () => toast((await copyText(r.code)) ? 'Code copied' : 'Copy failed', 'success') }, 'Copy'),
        kind === 'hosted' ? h('button', { class: 'btn small danger', onclick: async () => {
          if (!(await confirmDialog('Delete online world', `Permanently delete "${r.name}" from the server? Everyone will lose access.`, 'Delete', true))) return;
          const id = getIdentity();
          try {
            const res = await fetch(apiURL(`/api/rooms/${r.code}/delete`), { method: 'POST', body: JSON.stringify({ ownerId: id.id, ownerSecret: id.secret }) });
            if (!res.ok) throw new Error((await res.json() as { error?: string }).error ?? 'failed');
            forgetRoom('hosted', r.code); toast('World deleted', 'success'); refresh();
          } catch (e) { toast(`Could not delete: ${(e as Error).message}`, 'error'); }
        } }, 'Delete') : h('button', { class: 'btn small ghost', onclick: () => { forgetRoom(kind, r.code); refresh(); } }, 'Forget'),
      ),
    );
  }

  async joinPreview(code: string): Promise<void> {
    const box = h('div', { class: 'stack' }, h('div', { class: 'muted' }, `Looking up ${code}...`));
    this.show(card(`World ${code}`, () => this.multiplayer(), box));
    let info: RoomInfo;
    try {
      const res = await fetch(apiURL(`/api/rooms/${code}`));
      info = await res.json() as RoomInfo;
    } catch {
      clear(box);
      box.append(h('div', { class: 'error-box' }, 'Connection failed. Check your internet connection and try again.'), h('button', { class: 'btn', onclick: () => void this.joinPreview(code) }, 'Retry'));
      return;
    }
    clear(box);
    if (!info.exists) { box.append(h('div', { class: 'error-box' }, 'No world uses that code. It may have been typed incorrectly, or the owner deleted it.')); return; }
    const full = (info.players?.length ?? 0) >= (info.maxPlayers ?? DEFAULT_MAX_PLAYERS);
    const versionOk = info.version === PROTOCOL_VERSION;
    const mine = getRooms('hosted').some((r) => r.code === code);
    box.append(
      h('div', { class: 'kv' },
        h('dt', {}, 'World'), h('dd', {}, info.name ?? ''),
        h('dt', {}, 'Owner'), h('dd', {}, info.ownerName ?? ''),
        h('dt', {}, 'Mode'), h('dd', {}, `${MODE_TITLES[info.mode ?? 'survival'].title} (${MODE_TITLES[info.mode ?? 'survival'].sub}), ${info.difficulty}`),
        h('dt', {}, 'Players'), h('dd', {}, `${info.players?.length ?? 0} of ${info.maxPlayers} (${Math.max(0, (info.maxPlayers ?? 0) - (info.players?.length ?? 0))} slots free)`),
        info.pack ? h('dt', {}, 'Resource pack') : null, info.pack ? h('dd', {}, info.pack.name) : null,
      ),
      ...[
        info.players?.length ? h('div', { class: 'small muted' }, `Online: ${info.players.map((p) => p.name).join(', ')}`) : null,
        !versionOk ? h('div', { class: 'error-box' }, `Version mismatch: this world runs protocol ${info.version}, your game uses ${PROTOCOL_VERSION}. Reload the page to update.`) : null,
        full && !mine ? h('div', { class: 'error-box' }, 'This world is full right now.') : null,
      ].filter((x): x is HTMLDivElement => !!x),
      h('button', { class: 'btn primary block', disabled: !versionOk || (full && !mine), onclick: () => {
        rememberRoom('recent', { code, name: info.name ?? code, at: Date.now(), owner: mine, mode: info.mode });
        this.app.playRemote(code);
      } }, 'Join world'),
    );
  }

  credits(): void {
    this.show(card('Credits', () => this.title(),
      h('p', { style: 'margin:0' }, h('b', {}, 'Strata'), ' is an original voxel sandbox for the browser, built with TypeScript, Three.js and Cloudflare Durable Objects.'),
      h('div', { class: 'section-title' }, 'Art and sound'),
      h('p', { class: 'small', style: 'margin:0' }, 'Every built-in texture, creature, icon, sound effect and music phrase is generated procedurally by the game itself. No third-party art or audio is bundled.'),
      h('div', { class: 'section-title' }, 'Resource packs'),
      h('p', { class: 'small', style: 'margin:0' }, 'Imported resource packs stay on your device and remain the property of their creators. Use them in line with their licences and, for official Minecraft packs, the Minecraft EULA and usage guidelines.'),
      h('div', { class: 'section-title' }, 'Open-source libraries'),
      h('p', { class: 'small', style: 'margin:0' }, 'three.js (MIT licence) · fflate (MIT licence)'),
      h('div', { class: 'section-title' }, 'Notice'),
      h('p', { class: 'small muted', style: 'margin:0' }, 'Strata is not an official Minecraft product and is not approved by or associated with Mojang or Microsoft. Minecraft is a trademark of Mojang Synergies AB.'),
    ));
  }
}

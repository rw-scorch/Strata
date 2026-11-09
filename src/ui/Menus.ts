import { h, clear, toast, modal, confirmDialog, promptDialog, toggle, segmented, slider, select, copyText, fmtDate, fmtTime, download } from './dom';
import { WorldStorage, WorldMeta } from '../storage/WorldStorage';
import { getSettings, updateSettings, getIdentity, getRooms, rememberRoom, forgetRoom, RoomRecord } from '../storage/Settings';
import { GAME_VERSION, MODE_TITLES, GameMode, Difficulty, DIFFICULTIES, DEFAULT_MAX_PLAYERS, MAX_PLAYERS_LIMIT, isValidRoomCode, normalizeRoomCode, PROTOCOL_VERSION } from '../core/constants';
import { seedFromInput } from '../core/rng';
import { drawAvatar } from './avatar';
import { apiURL } from '../multiplayer/RemoteSession';
import { REGIONS } from './SettingsUI';
import type { RoomInfo, RoomMeta } from '../core/protocol';
import { ResourcePackManager } from '../resources/ResourcePackManager';

export interface MenuApp {
  screens: HTMLElement;
  playLocal(meta: WorldMeta): void;
  playRemote(code: string): void;
  openSettings(): void;
  openPacks(autoImport?: boolean): void;
  activePackRef(): { name: string; hash: string } | null;
  canInstall(): boolean;
  install(): void;
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

  hide(): void { this.current?.remove(); this.current = null; }

  title(): void {
    const s = getSettings();
    const bg = h('div', { class: 'strata-bg' }, h('div', { class: 'sky' }), h('div', { class: 'sun' }), h('div', { class: 'ridge r1' }), h('div', { class: 'ridge r2' }), h('div', { class: 'ridge r3' }));
    for (let i = 0; i < 7; i++) bg.appendChild(h('div', { class: 'ore', style: `left:${8 + i * 13}%;bottom:${4 + ((i * 37) % 22)}%;animation-delay:${i * 0.4}s` }));
    const avatar = drawAvatar(s.appearance, 4);
    avatar.className = 'avatar';
    const vanillaSlot = h('div', { style: 'width:100%' });
    void ResourcePackManager.list().then((packs) => {
      if (!packs.length) vanillaSlot.appendChild(h('button', { class: 'btn ghost block', onclick: () => this.app.openPacks(true) }, 'Use your Minecraft textures'));
    }).catch(() => { /* storage unavailable */ });
    const el = h('div', { class: 'screen title-screen' }, bg,
      h('div', { class: 'title-wrap' },
        h('h1', { class: 'logo' }, 'STRATA'),
        h('p', { class: 'tagline' }, 'Dig deep. Build together.'),
        h('div', { class: 'menu-buttons' },
          h('button', { class: 'btn primary', onclick: () => this.worlds() }, 'Singleplayer'),
          h('button', { class: 'btn teal', onclick: () => this.multiplayer() }, 'Multiplayer'),
          h('div', { class: 'menu-row' }, h('button', { class: 'btn', onclick: () => this.app.openSettings() }, 'Settings'), h('button', { class: 'btn', onclick: () => this.app.openPacks() }, 'Resource Packs')),
          h('div', { class: 'menu-row' }, h('button', { class: 'btn ghost', onclick: () => this.credits() }, 'Credits'), this.app.canInstall() ? h('button', { class: 'btn ghost', onclick: () => this.app.install() }, 'Install app') : h('button', { class: 'btn ghost', onclick: () => this.profile() }, 'Profile')),
        ),
        vanillaSlot,
        h('div', { class: 'profile-chip', onclick: () => this.profile() }, avatar, h('span', {}, s.playerName || 'Set your name')),
      ),
      h('div', { class: 'title-foot' }, h('span', {}, `Strata ${GAME_VERSION}`), h('span', {}, 'Not affiliated with Mojang or Microsoft')),
    );
    this.show(el);
  }

  profile(): void {
    const s = getSettings();
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
      h('label', { class: 'field' }, h('span', {}, 'Name shown to other players'), name),
      h('div', { class: 'row', style: 'align-items:flex-start;gap:18px' }, prev, h('div', { class: 'stack' }, pick('Skin', 'skin', 8), pick('Hair', 'hair', 8), pick('Shirt', 'shirt', 12), pick('Trousers', 'pants', 12))),
      h('button', { class: 'btn primary', onclick: () => { updateSettings({ playerName: name.value.replace(/[<>]/g, '').trim().slice(0, 16) }); this.title(); } }, 'Save'),
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

  createWorld(multi: boolean): void {
    const s = getSettings();
    let mode: GameMode = 'survival';
    let difficulty: Difficulty = s.difficulty;
    let maxPlayers = DEFAULT_MAX_PLAYERS;
    let region = s.region;
    let pvp = false, guestsBuild = true, cheats = false, sharePack = !!this.app.activePackRef(), personalPacks = true;
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
    const create = h('button', { class: 'btn primary block' }, multi ? 'Create online world' : 'Create and play') as HTMLButtonElement;
    create.addEventListener('click', async () => {
      clear(err);
      const sd = seedFromInput(seed.value);
      if (!multi) {
        const meta = await WorldStorage.create(name.value.trim() || 'New World', sd, mode, difficulty);
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
            settings: { pvp, guestsBuild, cheats, personalPacks }, pack: sharePack ? this.app.activePackRef() : null,
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
      h('label', { class: 'field' }, h('span', {}, 'Seed'), seed),
      h('div', { class: 'section-title' }, 'Game mode'), modes,
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
    ));
    if (prefill && isValidRoomCode(prefill)) void this.joinPreview(prefill);
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

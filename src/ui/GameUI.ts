import { findCoords } from './waypointData';
import { getSettings, updateSettings } from '../storage/Settings';
import type { RuleSet } from '../core/sim/WorldSim';
import { mcButton, mcCycle, menuScale, menuSpread } from './mc/Widgets';
import { Minimap } from './Minimap';
import { h, clear, toast, modal, toggle, segmented, copyText, confirmDialog, slider } from './dom';
import type { ChatKind } from '../game/Session';
import type { RoomMeta, PublicPlayer } from '../core/protocol';
import { DIFFICULTIES, Difficulty, MAX_PLAYERS_LIMIT, DEFAULT_DAY_LENGTH, DEFAULT_NIGHT_LENGTH } from '../core/constants';
import { BLOCKS } from '../core/blocks';
import { getItem, I, ITEM_LIST } from '../core/items';
import { sanitizeLootCfg, LootEntry } from '../core/sim/lootdrop';
import { sanitizeWard } from '../core/sim/anticheat';
import { sanitizeCrucible, crucibleArgs, type CrucibleKit, type CrucibleArena } from '../core/sim/crucible';
import { sanitizeKits, kitSummary, KIT_PRESETS } from '../core/sim/kits';
import type { TextureAtlas } from '../resources/TextureAtlas';
import { slotContent } from './HUD';
import { ENCHANTS, supports, compatible, enchantLabel } from '../core/enchants';

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];
import { PRANKS } from '../core/sim/mischief';

export class ChatUI {
  onWaypoint: ((w: { name: string; x: number; y: number; z: number }) => void) | null = null;
  private box: HTMLElement;
  private row: HTMLElement;
  private input: HTMLInputElement;
  lines: { el: HTMLElement; t: number }[] = [];
  isOpen = false;
  onSend: ((text: string) => void) | null = null;
  onClose: (() => void) | null = null;
  localMuted = new Set<string>();
  private history: string[] = [];
  private kbUpdate: (() => void) | null = null;
  private hIdx = -1;

  constructor(box: HTMLElement, parent: HTMLElement) {
    this.box = box;
    this.input = h('input', { class: 'input', maxlength: 256, placeholder: '', enterkeyhint: 'send', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false' }) as HTMLInputElement;
    const send = h('button', { class: 'btn primary touch-only', onclick: () => this.submit() }, 'Send');
    const close = h('button', { class: 'btn ghost touch-only', onclick: () => this.close() }, 'Close');
    this.row = h('div', { class: 'chat-input-row' }, this.input, send, close);
    const vv = window.visualViewport;
    if (vv) {
      const kb = () => {
        const off = this.isOpen ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
        document.documentElement.style.setProperty('--kb', `${Math.round(off)}px`);
      };
      vv.addEventListener('resize', kb);
      vv.addEventListener('scroll', kb);
      this.kbUpdate = kb;
    }
    this.box.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (this.isOpen && !t.closest('button')) {
        const line = t.closest('.line');
        for (const l of this.box.querySelectorAll('.line.sel')) if (l !== line) l.classList.remove('sel');
        line?.classList.toggle('sel');
      }
      if (t.classList.contains('copy')) {
        const line = t.closest('.line') as HTMLElement | null;
        const text = line?.dataset.text ?? '';
        void navigator.clipboard?.writeText(text).then(() => { t.textContent = 'Copied'; setTimeout(() => { t.textContent = 'Copy'; }, 1200); }).catch(() => { this.input.value += text; });
      }
    });
    this.input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') this.submit();
      else if (e.key === 'Escape') this.close();
      else if (e.key === 'ArrowUp' && this.history.length) { this.hIdx = Math.min(this.history.length - 1, this.hIdx + 1); this.input.value = this.history[this.history.length - 1 - this.hIdx]; e.preventDefault(); }
      else if (e.key === 'ArrowDown') { this.hIdx = Math.max(-1, this.hIdx - 1); this.input.value = this.hIdx >= 0 ? this.history[this.history.length - 1 - this.hIdx] : ''; e.preventDefault(); }
    });
    parent.appendChild(this.row);
  }

  open(prefix = ''): void {
    this.isOpen = true;
    this.row.classList.add('show');
    this.box.classList.add('open', 'chat-log-scroll');
    this.input.value = prefix;
    this.hIdx = -1;
    this.input.focus({ preventScroll: true });
    this.kbUpdate?.();
    this.box.scrollTop = this.box.scrollHeight;
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.row.classList.remove('show');
    this.box.classList.remove('open', 'chat-log-scroll');
    this.input.blur();
    document.documentElement.style.setProperty('--kb', '0px');
    this.box.scrollTop = this.box.scrollHeight;
    this.onClose?.();
  }

  private submit(): void {
    const t = this.input.value.trim();
    if (t) { this.onSend?.(t); this.history.push(t); if (this.history.length > 30) this.history.shift(); }
    this.input.value = '';
    this.close();
  }

  add(from: { id: string; name: string; sup?: string } | null, text: string, kind: ChatKind, ts: number): void {
    if (from && this.localMuted.has(from.id)) return;
    const d = new Date(ts);
    const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const found = Minimap.parse(text);
    const loose = !found && from ? findCoords(text) : null;
    const wp = found ?? (loose ? { name: `From ${from!.name}`, ...loose } : null);
    const full = from ? `<${from.name}> ${text}` : text;
    const el = h('div', { class: `line ${from ? 'msg' : kind}` }, h('span', { class: 'ts' }, time), from ? h('span', { class: 'who' }, '<', from.sup ? h('span', { class: 'sup-badge', title: 'Supporter' }) : null, from.sup ? h('span', { style: `color:${from.sup}` }, from.name) : from.name, '>') : null, text,
      wp ? h('button', { class: 'wp-save', onclick: (e: Event) => { e.stopPropagation(); this.onWaypoint?.(wp); } }, found ? 'Save waypoint' : `Save ${wp.x} ${wp.y} ${wp.z}`) : null,
      !from && /\/crucible join/.test(text) ? h('button', { class: 'wp-save tpa-yes', onclick: (e: Event) => { e.stopPropagation(); this.onSend?.('/crucible join'); } }, 'Enter') : null,
      !from && /\/lootdrop tp/.test(text) ? h('button', { class: 'wp-save tpa-yes', onclick: (e: Event) => { e.stopPropagation(); this.onSend?.('/lootdrop tp'); } }, 'Teleport') : null,
      !from && /Type \/tpaccept or \/tpdeny/.test(text) ? h('span', { class: 'tpa-btns' },
        h('button', { class: 'wp-save tpa-yes', onclick: (e: Event) => { e.stopPropagation(); this.onSend?.('/tpaccept'); (e.target as HTMLElement).parentElement!.remove(); } }, 'Accept'),
        h('button', { class: 'wp-save tpa-no', onclick: (e: Event) => { e.stopPropagation(); this.onSend?.('/tpdeny'); (e.target as HTMLElement).parentElement!.remove(); } }, 'Deny')) : null,
      h('button', { class: 'copy', tabindex: '-1' }, 'Copy'));
    el.dataset.text = full;
    const stick = this.box.scrollHeight - this.box.scrollTop - this.box.clientHeight < 30;
    this.box.appendChild(el);
    this.lines.push({ el, t: performance.now() });
    while (this.lines.length > 100) this.lines.shift()!.el.remove();
    if (!this.isOpen || stick) this.box.scrollTop = this.box.scrollHeight;
    this.tick();
  }

  tick(): void {
    const now = performance.now();
    const n = this.lines.length;
    for (let i = 0; i < n; i++) {
      const l = this.lines[i];
      const age = now - l.t;
      l.el.classList.toggle('over', n - i > 10);
      l.el.classList.toggle('fade', !this.isOpen && age > 9000);
      l.el.classList.toggle('gone', !this.isOpen && age > 10000);
    }
  }
}

export interface PauseActions {
  resume(): void;
  save?(): void;
  settings(): void;
  players?(): void;
  invite?(): void;
  room?(): void;
  shaper?(): void;
  mischief?(): void;
  admin?(): void;
  blueprints?(): void;
  waypoints?(): void;
  packs(): void;
  datapacks?(): void;
  economy?(cmd: string): void;
  quit(): void;
  difficulty?: { value: Difficulty; set(d: Difficulty): void };
  title: string;
  sub: string;
}

export function showPause(root: HTMLElement, a: PauseActions): () => void {
  menuScale();
  const close = () => el.remove();
  const row = (...b: (HTMLElement | null)[]) => h('div', { class: 'mc-row2' }, ...b.filter(Boolean) as HTMLElement[]);
  const el = h('div', { class: 'screen mc-pause', style: `z-index:22;--mw:${menuSpread(204)}` },
    h('div', { class: 'mct center', style: 'margin-bottom:calc(var(--ms) * 12)' }, 'Game Menu'),
    h('div', { class: 'mc-list-inner' },
      mcButton('Back to Game', () => { close(); a.resume(); }, 204),
      row(a.invite ? mcButton('Invite Friends', () => a.invite!(), 98) : null, a.players ? mcButton('Players', () => a.players!(), 98) : null),
      row(a.room ? mcButton('World Settings', () => a.room!(), 98) : null, a.shaper ? mcButton('World Shaper', () => a.shaper!(), 98) : null),
      row(a.blueprints ? mcButton('Blueprints', () => a.blueprints!(), a.waypoints ? 98 : 204) : null, a.waypoints ? mcButton('Waypoints', () => a.waypoints!(), a.blueprints ? 98 : 204) : null),
      row(a.admin ? mcButton('Sovereign Console', () => a.admin!(), a.mischief ? 98 : 204) : null, a.mischief ? mcButton('Mischief Console', () => a.mischief!(), a.admin ? 98 : 204) : null),
      a.difficulty ? mcCycle('Difficulty', DIFFICULTIES.map((d) => [d, d[0].toUpperCase() + d.slice(1)] as [Difficulty, string]), a.difficulty.value, (d) => a.difficulty!.set(d), { w: 204 }) : null,
      row(mcCycle('Minimap', [[true, 'ON'], [false, 'OFF']], getSettings().showMinimap, (v) => updateSettings({ showMinimap: v }), { w: 98 }), mcCycle('Coords', [[true, 'ON'], [false, 'OFF']], getSettings().showCoords, (v) => updateSettings({ showCoords: v }), { w: 98 })),
      row(mcButton('Options...', () => a.settings(), 98), mcButton('Resource Packs...', () => a.packs(), 98)),
      a.datapacks ? mcButton('Data Packs...', () => a.datapacks!(), 204) : null,
      a.economy ? row(mcButton('Shop', () => a.economy!('/shop'), 98), mcButton('Sell', () => a.economy!('/sell'), 98)) : null,
      a.economy ? row(mcButton('Auction House', () => a.economy!('/ah'), 98), mcButton('Orders', () => a.economy!('/order'), 98)) : null,
      a.save ? mcButton('Save Now', () => a.save!(), 204) : null,
      mcButton(a.save ? 'Save and Quit to Title' : 'Disconnect', () => { close(); a.quit(); }, 204),
    ),
    h('div', { class: 'mct small center', style: 'margin-top:calc(var(--ms) * 10)' }, `${a.title}  ${a.sub}`),
  );
  root.appendChild(el);
  return close;
}

export function showInvite(code: string, name: string): void {
  const link = `${location.origin}/join/${code}`;
  const body = h('div', { class: 'stack' },
    h('p', { class: 'muted' }, `Friends can join "${name}" by entering this code in Multiplayer, or by opening the link.`),
    h('div', { class: 'room-code' }, code),
    h('div', { class: 'menu-row' },
      h('button', { class: 'btn', onclick: async () => toast((await copyText(code)) ? 'Room code copied' : 'Copy failed', 'success') }, 'Copy code'),
      h('button', { class: 'btn', onclick: async () => toast((await copyText(link)) ? 'Invitation link copied' : 'Copy failed', 'success') }, 'Copy link'),
    ),
    'share' in navigator ? h('button', { class: 'btn teal block', onclick: () => { navigator.share({ title: 'Join my Strata world', text: `Join "${name}" in Strata with code ${code}`, url: link }).catch(() => { /* cancelled */ }); } }, 'Share invitation') : null,
    h('div', { class: 'small muted', style: 'word-break:break-all' }, link),
  );
  modal('Invite friends', body, [{ label: 'Done', kind: 'primary' }]);
}

export function showPlayers(players: PublicPlayer[], meId: string, isOwner: boolean, localMuted: Set<string>, act: { kick(id: string): void; mute(id: string, on: boolean): void; maxPlayers: number; command?(text: string): void; tpa?: boolean }): void {
  const list = h('div', { class: 'stack' });
  const render = () => {
    clear(list);
    list.appendChild(h('div', { class: 'small muted' }, `${players.length} of ${act.maxPlayers} players online`));
    for (const p of players) {
      const me = p.id === meId;
      const row = h('div', { class: 'player-row' },
        h('span', { class: 'nm' }, p.name, me ? h('span', { class: 'muted small' }, ' (you)') : null),
        p.op ? h('span', { class: 'badge gold' }, 'Owner') : null,
        p.mode === 'creative' ? h('span', { class: 'badge teal' }, 'Architect') : null,
        p.muted ? h('span', { class: 'badge red' }, 'Muted') : null,
      );
      if (!me) {
        const hidden = localMuted.has(p.id);
        if (act.command && (act.tpa !== false || isOwner)) {
          row.appendChild(h('button', { class: 'btn small primary', title: 'Ask to teleport to this player', onclick: () => { act.command!(isOwner ? `/tp ${p.name}` : `/tpa ${p.name}`); if (isOwner) document.querySelector('.modal-backdrop')?.remove(); } }, isOwner ? 'Teleport' : 'Request TP'));
          if (!isOwner) row.appendChild(h('button', { class: 'btn small', title: 'Ask this player to teleport to you', onclick: () => act.command!(`/tpahere ${p.name}`) }, 'Invite here'));
        }
        row.appendChild(h('button', { class: 'btn small ghost', onclick: () => { if (hidden) localMuted.delete(p.id); else localMuted.add(p.id); render(); } }, hidden ? 'Show chat' : 'Hide chat'));
        if (isOwner) {
          row.appendChild(h('button', { class: 'btn small', onclick: () => { act.mute(p.id, !p.muted); p.muted = !p.muted; render(); } }, p.muted ? 'Unmute' : 'Mute'));
          row.appendChild(h('button', { class: 'btn small danger', onclick: async () => { if (await confirmDialog('Remove player', `Remove ${p.name} from this world? They will not be able to rejoin for 10 minutes.`, 'Remove', true)) { act.kick(p.id); } } }, 'Kick'));
        }
      }
      list.appendChild(row);
    }
  };
  render();
  modal('Players', list, [{ label: 'Close', kind: 'primary' }]);
}

export function showRoomSettings(room: RoomMeta, onSave: (patch: { name?: string; difficulty?: Difficulty; maxPlayers?: number; settings?: Partial<RoomMeta['settings']>; pack?: RoomMeta['pack'] }) => void, activePack: { name: string; hash: string } | null, rules: RuleSet = {}, onRules?: (cmds: string[]) => void): void {
  const s = { ...room.settings };
  const r = { map: rules.allowMinimap !== false, coords: rules.allowCoords !== false, homes: rules.maxHomes ?? 2, tpa: rules.tpa !== false, bp: rules.allowBlueprints !== false, day: rules.dayLength ?? DEFAULT_DAY_LENGTH, night: rules.nightLength ?? DEFAULT_NIGHT_LENGTH };
  let name = room.name, diff = room.difficulty, max = room.maxPlayers;
  let cdT = '', cdL = '';
  let pack = room.pack;
  const packLine = h('div', { class: 'small muted' });
  const renderPack = () => { packLine.textContent = pack ? `Shared pack: ${pack.name}. Players who have it installed see it; others see default textures.` : 'No shared resource pack. Everyone uses default textures unless personal packs are allowed.'; };
  renderPack();
  const body = h('div', { class: 'stack' },
    h('label', { class: 'field' }, h('span', {}, 'World name'), h('input', { class: 'input', value: name, maxlength: 32, oninput: (e: Event) => { name = (e.target as HTMLInputElement).value; } })),
    h('div', { class: 'section-title' }, 'Difficulty'),
    segmented(DIFFICULTIES.map((d) => [d, d[0].toUpperCase() + d.slice(1)] as [Difficulty, string]), diff, (d) => { diff = d; }),
    slider('Maximum players', 1, MAX_PLAYERS_LIMIT, 1, max, (v) => String(v), (v) => { max = v; }),
    toggle('Player combat (PvP)', s.pvp, (v) => { s.pvp = v; }),
    toggle('Guests can build', s.guestsBuild, (v) => { s.guestsBuild = v; }, 'When off, only the owner can break and place blocks.'),
    toggle('Commands for creative players', s.cheats, (v) => { s.cheats = v; }, 'Allows /time, /weather, /give and the World Shaper for players in Architect mode.'),
    toggle('Allow personal resource packs', s.personalPacks, (v) => { s.personalPacks = v; }, 'When off, everyone sees the shared pack or default textures.'),
    toggle('Proximity voice chat', s.voice !== false, (v) => { s.voice = v; }, 'Players can talk to others within 48 blocks if they turn voice on in Options.'),
    toggle('Economy', s.economy !== false, (v) => { s.economy = v; }, 'Money, /sell, /shop, the Auction House (/ah), buy orders (/order), /pay and the sidebar. Operators set prices with /eco or the admin console.'),
    h('div', { class: 'section-title' }, 'Server rules'),
    toggle('Minimap allowed', r.map, (v) => { r.map = v; }, 'When off, nobody except admins sees the minimap or waypoint markers.'),
    toggle('Coordinates allowed', r.coords, (v) => { r.coords = v; }, 'When off, coordinates are hidden from the HUD and debug screen, to stop screen-peeking.'),
    slider('Homes per player', 0, 10, 1, r.homes, (v) => (v ? String(v) : 'Off'), (v) => { r.homes = v; }),
    toggle('Teleport requests (/tpa)', r.tpa, (v) => { r.tpa = v; }),
    toggle('Blueprints', r.bp, (v) => { r.bp = v; }, 'Players can build their saved blueprints here if they carry every block needed and the spot is clear.'),
    slider('Daytime length', 1, 20, 1, Math.round(r.day * 2), (v) => `${v / 2}x (${Math.round((10 * v) / 2)} min)`, (v) => { r.day = v / 2; }),
    slider('Night length', 1, 8, 1, Math.round(r.night * 4), (v) => `${v / 4}x (${((25 * v) / 12).toFixed(1)} min)`, (v) => { r.night = v / 4; }),
    h('div', { class: 'section-title' }, 'Countdown and world refresh'),
    h('div', { class: 'small muted' }, 'Show everyone a timer at the top of the screen, for events or a planned refresh. Times look like 30s, 10m, 1h30m or 2d.'),
    h('div', { class: 'row' },
      h('input', { class: 'input', placeholder: '10m', maxlength: 12, style: 'width:6em', oninput: (e: Event) => { cdT = (e.target as HTMLInputElement).value.trim(); } }),
      h('input', { class: 'input', placeholder: 'Label (optional)', maxlength: 40, oninput: (e: Event) => { cdL = (e.target as HTMLInputElement).value.trim(); } }),
    ),
    h('div', { class: 'row' },
      h('button', { class: 'btn small primary', onclick: () => { if (cdT) onRules?.([`/countdown ${cdT}${cdL ? ` ${cdL}` : ''}`]); } }, 'Start countdown'),
      h('button', { class: 'btn small ghost', onclick: () => onRules?.(['/countdown cancel']) }, 'Cancel countdown'),
      h('button', { class: 'btn small danger', onclick: async () => {
        if (!cdT) { cdT = '5m'; }
        if (await confirmDialog('Refresh world', `In ${cdT}, the map is replaced with a brand new world. Every build, chest, home and bed is wiped. Money, inventories and the shop are kept. Continue?`, 'Schedule refresh', true)) onRules?.([`/resetworld ${cdT} confirm`]);
      } }, 'Refresh world...'),
    ),
    h('div', { class: 'section-title' }, 'Shared resource pack'),
    packLine,
    h('div', { class: 'row' },
      activePack ? h('button', { class: 'btn small', onclick: () => { pack = activePack; renderPack(); } }, `Use "${activePack.name}"`) : h('span', { class: 'small muted' }, 'Activate a pack in Resource Packs to share it.'),
      pack ? h('button', { class: 'btn small ghost', onclick: () => { pack = null; renderPack(); } }, 'Clear') : null,
    ),
  );
  modal('World settings', body, [
    { label: 'Cancel', kind: 'ghost' },
    { label: 'Save', kind: 'primary', onClick: () => {
      onSave({ name, difficulty: diff, maxPlayers: max, settings: s, pack });
      const cmds: string[] = [];
      if (r.map !== (rules.allowMinimap !== false)) cmds.push(`/gamerule showMinimap ${r.map}`);
      if (r.coords !== (rules.allowCoords !== false)) cmds.push(`/gamerule showCoordinates ${r.coords}`);
      if (r.homes !== (rules.maxHomes ?? 2)) cmds.push(`/gamerule maxHomes ${r.homes}`);
      if (r.tpa !== (rules.tpa !== false)) cmds.push(`/gamerule allowTpa ${r.tpa}`);
      if (r.bp !== (rules.allowBlueprints !== false)) cmds.push(`/gamerule allowBlueprints ${r.bp}`);
      if (r.day !== (rules.dayLength ?? DEFAULT_DAY_LENGTH)) cmds.push(`/gamerule dayLength ${r.day}`);
      if (r.night !== (rules.nightLength ?? DEFAULT_NIGHT_LENGTH)) cmds.push(`/gamerule nightLength ${r.night}`);
      if (cmds.length) onRules?.(cmds);
    } },
  ]);
}

export function showShaper(run: (cmd: string) => void, target: () => [number, number, number] | null, held: () => number | null): void {
  const status = h('div', { class: 'info-box small' }, 'Look at a block, then set corner A and corner B. The fill block is the block in your selected hotbar slot.');
  const setCorner = (i: 1 | 2) => {
    const t = target();
    if (!t) { toast('Look at a block first', 'error'); return; }
    run(`/pos${i} ${t[0]} ${t[1]} ${t[2]}`);
  };
  const blockKey = () => {
    const id = held();
    if (id === null) return null;
    const b = BLOCKS[id];
    return b && getItem(id)?.kind === 'block' ? b.key : null;
  };
  const fill = (mode: '' | 'hollow' | 'outline' | 'clear') => {
    if (mode === 'clear') { run('/fill air'); return; }
    const k = blockKey();
    if (!k) { toast('Select a block in your hotbar to fill with', 'error'); return; }
    run(`/fill ${k}${mode ? ' ' + mode : ''}`);
  };
  const body = h('div', { class: 'stack' },
    status,
    h('div', { class: 'menu-row' }, h('button', { class: 'btn', onclick: () => setCorner(1) }, 'Set corner A'), h('button', { class: 'btn', onclick: () => setCorner(2) }, 'Set corner B')),
    h('div', { class: 'section-title' }, 'Shape'),
    h('div', { class: 'menu-row' }, h('button', { class: 'btn primary', onclick: () => fill('') }, 'Fill solid'), h('button', { class: 'btn', onclick: () => fill('hollow') }, 'Hollow box')),
    h('div', { class: 'menu-row' }, h('button', { class: 'btn', onclick: () => fill('outline') }, 'Outline only'), h('button', { class: 'btn danger', onclick: () => fill('clear') }, 'Clear to air')),
    h('button', { class: 'btn ghost', onclick: () => run('/clearsel') }, 'Clear selection'),
    h('div', { class: 'section-title' }, 'Time and weather'),
    h('div', { class: 'menu-row' }, h('button', { class: 'btn small', onclick: () => run('/time set day') }, 'Morning'), h('button', { class: 'btn small', onclick: () => run('/time set noon') }, 'Noon')),
    h('div', { class: 'menu-row' }, h('button', { class: 'btn small', onclick: () => run('/time set sunset') }, 'Dusk'), h('button', { class: 'btn small', onclick: () => run('/time set midnight') }, 'Midnight')),
    h('div', { class: 'menu-row' }, h('button', { class: 'btn small', onclick: () => run('/time cycle off') }, 'Freeze time'), h('button', { class: 'btn small', onclick: () => run('/time cycle on') }, 'Resume time')),
    h('div', { class: 'menu-row' }, h('button', { class: 'btn small', onclick: () => run('/weather clear') }, 'Clear skies'), h('button', { class: 'btn small', onclick: () => run('/weather rain') }, 'Rain')),
    h('button', { class: 'btn small', onclick: () => run('/weather thunder') }, 'Thunderstorm'),
    h('div', { class: 'small muted' }, 'Selections are limited to 32,768 blocks. Changes apply to loaded chunks.'),
  );
  modal('World Shaper', body, [{ label: 'Done', kind: 'primary' }]);
}

export function showDeath(root: HTMLElement, msg: string, onRespawn: () => void, onQuit: () => void): () => void {
  const el = h('div', { class: 'screen death-screen' },
    h('h1', {}, 'You fell'),
    h('p', {}, msg),
    h('div', { class: 'row', style: 'justify-content:center' },
      h('button', { class: 'btn primary', onclick: () => { el.remove(); onRespawn(); } }, 'Rise again'),
      h('button', { class: 'btn ghost', onclick: () => { el.remove(); onQuit(); } }, 'Quit to title'),
    ),
  );
  root.appendChild(el);
  return () => el.remove();
}

export interface SovereignHeld { id: number; name: string; en?: Record<string, number>; dmg?: number }

export function showSovereign(run: (cmd: string) => void, held: () => SovereignHeld | null, rules: () => { tpDelay?: number; combatTime?: number; lootdrop?: unknown; anticheat?: unknown; crucible?: unknown; kits?: unknown }, atlas?: TextureAtlas): void {
  const tabs = h('div', { class: 'tabs sov-tabs' });
  const pane = h('div', { class: 'stack sov-pane' });
  let tab = 'item';
  const later = (f: () => void) => setTimeout(f, 250);
  const act = (label: string, cmd: string, kind = '', after?: () => void) => h('button', { class: `btn ${kind}`, onclick: () => { run(cmd); if (after) later(after); } }, label);
  const pickRow = (title: string, rule: string, cur: number, opts: [number, string][]) => {
    const seg = h('div', { class: 'segmented' });
    let val = cur;
    const draw = () => { clear(seg); for (const [v, l] of opts) seg.appendChild(h('button', { class: v === val ? 'on' : '', onclick: () => { val = v; run(`/gamerule ${rule} ${v}`); draw(); } }, l)); };
    draw();
    return h('div', { class: 'stack' }, h('div', { class: 'small' }, title), seg);
  };
  const itemTab = (): HTMLElement => {
    const it = held();
    const wrap = h('div', { class: 'stack' });
    if (!it) { wrap.append(h('div', { class: 'small muted' }, 'Hold a tool, weapon or piece of armour in your hotbar, then come back here.')); return wrap; }
    const en = it.en ?? {};
    wrap.append(
      h('div', { class: 'sov-held' }, h('b', {}, it.name), h('span', { class: 'small muted' }, Object.keys(en).length ? Object.entries(en).map(([k, l]) => enchantLabel(k, l)).join(', ') : 'No enchantments')),
      h('div', { class: 'row wrap' }, act('Max enchant', '/enchantmax', 'primary', redraw), act('Remove all', '/unenchant all', '', redraw), act('Repair', '/repair', '', redraw)),
      h('div', { class: 'section-title' }, 'Choose enchantments'),
    );
    const list = ENCHANTS.filter((e) => it.id === I.ENCHANTED_BOOK || it.id === I.BOOK || supports(e.key, it.id));
    if (!list.length) { wrap.append(h('div', { class: 'small muted' }, 'Nothing can be enchanted onto this item.')); return wrap; }
    const grid = h('div', { class: 'sov-ench' });
    for (const e of list) {
      const cur = en[e.key] ?? 0;
      const clash = Object.keys(en).find((k) => k !== e.key && !compatible(k, e.key));
      const lv = h('div', { class: 'segmented sov-lv' });
      for (let l = 1; l <= e.max; l++) lv.appendChild(h('button', { class: l === cur ? 'on' : '', disabled: !!clash, onclick: () => { run(`/enchant ${e.key} ${l}`); later(redraw); } }, ROMAN[l] ?? String(l)));
      if (cur) lv.appendChild(h('button', { class: 'sov-x', onclick: () => { run(`/unenchant ${e.key}`); later(redraw); } }, 'Remove'));
      grid.append(h('div', { class: `sov-ench-row${cur ? ' on' : ''}${clash ? ' off' : ''}` },
        h('div', { class: 'sov-ench-name' }, e.name, e.curse ? h('span', { class: 'small muted' }, ' (curse)') : null, clash ? h('div', { class: 'small muted' }, `Conflicts with ${ENCHANTS.find((x) => x.key === clash)?.name ?? clash}`) : null),
        lv));
    }
    wrap.append(grid);
    return wrap;
  };
  const kitTab = (): HTMLElement => h('div', { class: 'stack' },
    h('div', { class: 'small muted' }, 'Each kit gives full armour (worn if the slot is empty), sword, pickaxe, axe, shovel, hoe, bow, crossbow, shield, mace and 64 arrows, all with the best enchantments at their top levels.'),
    h('div', { class: 'sov-kits' },
      h('button', { class: 'sov-kit diamond', onclick: () => run('/kit maxdiamond') }, h('b', {}, 'Maxed Diamond'), h('span', { class: 'small' }, 'Protection IV, Sharpness V, Efficiency V, Mending...')),
      h('button', { class: 'sov-kit netherite', onclick: () => run('/kit maxnetherite') }, h('b', {}, 'Maxed Netherite'), h('span', { class: 'small' }, 'Toughness 3 and knockback resistance on every piece'))),
  );
  const eventTab = (): HTMLElement => {
    const c = sanitizeLootCfg(rules().lootdrop);
    const pct = (v: number) => `${Math.round(v * 100)}%`;
    const field = (label: string, v: string, ph: string, set: (t: string) => void) => {
      const i = h('input', { class: 'input', value: v, placeholder: ph, spellcheck: 'false', autocapitalize: 'off' }) as HTMLInputElement;
      i.addEventListener('input', () => set(i.value.trim()));
      return { el: h('label', { class: 'field' }, h('span', {}, label), i), i };
    };
    const ent = (e: LootEntry[]) => e.map((x) => `${x.key}${x.maxed ? '+' : ''}:${x.min === x.max ? x.min : `${x.min}-${x.max}`}:${+x.chance.toFixed(3)}`).join(',');
    let blocksT = c.blocks.map(([k, w]) => `${k}:${w}`).join(','), itemsT = ent(c.items), framesT = ent(c.frameItems);
    const fb = field('Blocks (name:weight, blank = default palette)', blocksT, 'gold_block:5,emerald_block:3,diamond_block:0.2', (t) => { blocksT = t; });
    const fiItems = field('Chest items (name:min-max:chance, + = max enchants, blank = tier table)', itemsT, 'diamond:2-6:0.5,golden_apple:1-3:0.8,diamond_sword+:1:0.2', (t) => { itemsT = t; });
    const fiFrames = field('Item frame prizes (name:1:weight, blank = default prizes)', framesT, 'diamond_sword+:1:1,totem:1:0.3', (t) => { framesT = t; });
    let target: 'items' | 'frames' | 'blocks' = 'items';
    const add = (key: string) => {
      const f = target === 'items' ? fiItems : target === 'frames' ? fiFrames : fb;
      const piece = target === 'blocks' ? `${key}:5` : target === 'frames' ? `${key}:1:1` : `${key}:1-4:0.5`;
      f.i.value = f.i.value.trim() ? `${f.i.value.trim()},${piece}` : piece;
      f.i.dispatchEvent(new Event('input'));
    };
    const q = h('input', { class: 'input', placeholder: 'Search an item or block to add', maxlength: 24 }) as HTMLInputElement;
    const list = h('div', { class: 'eco-pick' });
    const fill = () => {
      clear(list);
      const t = q.value.trim().toLowerCase();
      if (!t) return;
      for (const it of ITEM_LIST.filter((x) => x.name.toLowerCase().includes(t) || x.key.includes(t)).filter((x) => target !== 'blocks' || x.kind === 'block').slice(0, 36)) {
        const b2 = h('button', { class: 'slot mc static eco-pick-item', title: `${it.name} (${it.key})`, onclick: () => add(it.key) }, ...(atlas ? slotContent(atlas, { id: it.id, count: 1 }, 24) : [h('span', { class: 'small' }, it.name.slice(0, 3))]));
        list.appendChild(b2);
      }
    };
    q.addEventListener('input', fill);
    const args = () => {
      const parts = [`r=${c.radius}`, `l=${c.layers}`, `c=${c.chests}`, `f=${c.frames}`, `shape=${c.shape}`, `tier=${c.tier}`, `rare=${+c.rare.toFixed(3)}`, `elytra=${+c.elytra.toFixed(3)}`, `tp=${c.tp}`, `morph=${c.morph ? 'on' : 'off'}`, `pillars=${c.pillars ? 'on' : 'off'}`, `clear=${c.clear ? 'on' : 'off'}`];
      parts.push(`b=${blocksT.replace(/\s+/g, '') || 'default'}`, `i=${itemsT.replace(/\s+/g, '') || 'default'}`, `fi=${framesT.replace(/\s+/g, '') || 'default'}`);
      return parts.join(' ');
    };
    return h('div', { class: 'stack' },
      h('div', { class: 'section-title' }, 'Lootdrop'),
      h('div', { class: 'small muted' }, 'Reshapes the ground where you stand into a treasure mound, with chests, glowing item frames and a teleport message for every player. Everything below is saved for this world.'),
      slider('Size (radius)', 2, 24, 1, c.radius, (v) => `${v} blocks`, (v) => { c.radius = v; }),
      slider('Layers of treasure blocks', 1, 8, 1, c.layers, (v) => String(v), (v) => { c.layers = v; }),
      slider('Chests', 0, 40, 1, c.chests, (v) => String(v), (v) => { c.chests = v; }),
      slider('Item frames', 0, 40, 1, c.frames, (v) => String(v), (v) => { c.frames = v; }),
      slider('Diamond and Netherite block rarity', 0, 1, 0.01, c.rare, pct, (v) => { c.rare = v; }),
      slider('Elytra chance', 0, 1, 0.01, c.elytra, pct, (v) => { c.elytra = v; }),
      slider('Teleport window', 0, 600, 15, c.tp, (v) => (v ? `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}` : 'off'), (v) => { c.tp = v; }),
      h('div', { class: 'small' }, 'Shape'), segmented([['mound', 'Mound'], ['flat', 'Flat'], ['crater', 'Crater']], c.shape, (v) => { c.shape = v; }),
      h('div', { class: 'small' }, 'Chest loot'), segmented([['light', 'Light'], ['normal', 'Normal'], ['rich', 'Rich']], c.tier, (v) => { c.tier = v; }),
      toggle('Morph the land', c.morph, (v) => { c.morph = v; }, 'Ragged natural edges that blend into the terrain'),
      toggle('Pillars under frames', c.pillars, (v) => { c.pillars = v; }),
      toggle('Clear trees and plants', c.clear, (v) => { c.clear = v; }),
      fb.el, fiItems.el, fiFrames.el,
      h('div', { class: 'small' }, 'Add from the item list to'),
      segmented([['items', 'Chest items'], ['frames', 'Frame prizes'], ['blocks', 'Blocks']], target, (v) => { target = v; fill(); }),
      q, list,
      h('div', { class: 'row wrap' },
        h('button', { class: 'btn primary', onclick: () => run(`/lootdrop ${args()}`) }, 'Spawn lootdrop here'),
        h('button', { class: 'btn', onclick: () => run(`/lootdrop set ${args()}`) }, 'Save settings'),
        h('button', { class: 'btn ghost', onclick: () => run('/lootdrop reset') }, 'Reset to defaults')),
    );
  };
  const armouryTab = (): HTMLElement => {
    const run2 = (c: string) => { run(c); later(redraw); };
    const book = sanitizeKits(rules().kits);
    const list = h('div', { class: 'stack' });
    const names = Object.keys(book);
    if (!names.length) list.appendChild(h('div', { class: 'small muted' }, 'No kits yet. Start from a preset below, or arrange your own inventory and save it.'));
    for (const n of names) {
      const k = book[n];
      const icons = h('div', { class: 'row kit-icons' }, ...[...k.armor, k.off, ...k.items].filter((s): s is NonNullable<typeof s> => !!s).slice(0, 14).map((s) => h('div', { class: 'slot mc static kit-ico', title: `${s.count} x ${s.id}` }, ...(atlas ? slotContent(atlas, s, 22) : []))));
      const cd = h('input', { class: 'input eco-num', value: String(k.cd), inputmode: 'numeric', maxlength: 5, style: 'width:70px' }) as HTMLInputElement;
      list.appendChild(h('div', { class: 'list-item', style: 'flex-direction:column;align-items:stretch;gap:6px' },
        h('div', { class: 'row', style: 'justify-content:space-between;gap:8px;flex-wrap:wrap' },
          h('div', { class: 'meta' }, h('div', { class: 'name' }, n), h('div', { class: 'sub' }, `${kitSummary(k)}${k.by ? ` · made by ${k.by}` : ''}`)),
          h('div', { class: 'actions' },
            h('button', { class: 'btn small teal', onclick: () => run(`/kit ${n}`) }, 'Claim'),
            h('button', { class: `btn small ${k.pub ? '' : 'gold'}`, onclick: () => run2(`/kit public ${n} ${k.pub ? 'off' : 'on'}`) }, k.pub ? 'Everyone' : 'Operators only'),
            h('button', { class: 'btn small danger', onclick: () => run2(`/kit delete ${n}`) }, 'Delete'))),
        icons,
        h('div', { class: 'row', style: 'gap:6px;align-items:center' }, h('span', { class: 'small' }, 'Cooldown (seconds)'), cd, h('button', { class: 'btn small', onclick: () => run2(`/kit cooldown ${n} ${Math.max(0, Math.floor(Number(cd.value) || 0))}`) }, 'Set'))));
    }
    const nm = h('input', { class: 'input', placeholder: 'Kit name (letters, numbers, - and _)', maxlength: 20, autocapitalize: 'off', spellcheck: 'false' }) as HTMLInputElement;
    return h('div', { class: 'stack' },
      h('div', { class: 'section-title' }, 'Armoury'),
      h('div', { class: 'small muted' }, 'Kits are loadouts players claim with /kit <name>. Fill your inventory, armour and offhand exactly how you want the kit, then save it. Saved kits also appear as choices in the Crucible.'),
      list,
      h('div', { class: 'row wrap', style: 'gap:6px' }, nm, h('button', { class: 'btn primary', onclick: () => { const v = nm.value.trim().toLowerCase(); if (v) run2(`/kit save ${v}`); } }, 'Save my inventory as a kit')),
      h('div', { class: 'section-title' }, 'Maxed kits'),
      kitTab(),
      h('div', { class: 'section-title' }, 'Popular PvP kits'),
      h('div', { class: 'small muted' }, 'Loadouts modelled on the kits used across competitive PvP servers. Add one, then edit it by claiming it, changing your inventory and saving over it.'),
      h('div', { class: 'stack' }, ...Object.entries(KIT_PRESETS).map(([key, pr]) => h('div', { class: 'list-item' },
        h('div', { class: 'meta' }, h('div', { class: 'name' }, pr.label), h('div', { class: 'sub' }, pr.blurb)),
        h('div', { class: 'actions' }, h('button', { class: 'btn small', onclick: () => run2(`/kit preset ${key}`) }, book[key] ? 'Reset' : 'Add'))))),
    );
  };
  const tribunalTab = (): HTMLElement => {
    let span = '7d';
    const who = h('input', { class: 'input', placeholder: 'Player name (online or has joined before)', maxlength: 24, autocapitalize: 'off', spellcheck: 'false' }) as HTMLInputElement;
    const custom = h('input', { class: 'input', placeholder: 'Or a custom time: 45m, 12h, 3w, 6mo', maxlength: 8, autocapitalize: 'off' }) as HTMLInputElement;
    const why = h('input', { class: 'input', placeholder: 'Reason shown to the player (optional)', maxlength: 120 }) as HTMLInputElement;
    const name = () => who.value.trim().split(/\s+/)[0] ?? '';
    return h('div', { class: 'stack' },
      h('div', { class: 'section-title' }, 'Tribunal'),
      h('div', { class: 'small muted' }, 'Ban players for as long as you choose, or for good. Bans work on players who are offline too, and the player sees the reason and time left when they try to join. Only the world owner can ban another operator.'),
      who,
      h('div', { class: 'small' }, 'Length'),
      segmented<string>([['1h', '1 hour'], ['1d', '1 day'], ['7d', '7 days'], ['30d', '30 days'], ['perm', 'Permanent']], span, (v) => { span = v; custom.value = ''; }),
      custom, why,
      h('div', { class: 'row wrap' },
        h('button', { class: 'btn danger', onclick: () => { const n = name(); if (!n) return; const t = custom.value.trim() || span; run(`/ban ${n} ${t}${why.value.trim() ? ` ${why.value.trim()}` : ''}`); } }, 'Ban'),
        h('button', { class: 'btn', onclick: () => { const n = name(); if (n) run(`/unban ${n}`); } }, 'Unban'),
        h('button', { class: 'btn ghost', onclick: () => run('/banlist') }, 'Show bans')),
      h('div', { class: 'small muted' }, 'Chat commands: /ban <player> [30m|2h|7d|2w|3mo|perm] [reason], /tempban <player> <time> [reason], /unban <player>, /banlist.'),
    );
  };
  const crucibleTab = (): HTMLElement => {
    const c = sanitizeCrucible(rules().crucible);
    const clock = (v: number) => `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
    const coin = (label: string, v: number, set: (n: number) => void) => {
      const i = h('input', { class: 'input eco-num', value: String(v), inputmode: 'numeric', maxlength: 9 }) as HTMLInputElement;
      i.addEventListener('input', () => set(Math.max(0, Math.floor(Number(i.value.replace(/[^\d]/g, ''))) || 0)));
      return h('label', { class: 'field' }, h('span', {}, label), i);
    };
    let prizeT = c.prize.map((p) => `${p.key}${p.maxed ? '+' : ''}:${p.n}`).join(',');
    const pi = h('input', { class: 'input', value: prizeT, placeholder: 'diamond:8,golden_apple:4,mace+:1 (blank = coins only)', spellcheck: 'false', autocapitalize: 'off' }) as HTMLInputElement;
    pi.addEventListener('input', () => { prizeT = pi.value.trim(); });
    const q = h('input', { class: 'input', placeholder: 'Search an item to add to the prize', maxlength: 24 }) as HTMLInputElement;
    const list = h('div', { class: 'eco-pick' });
    q.addEventListener('input', () => {
      clear(list);
      const t = q.value.trim().toLowerCase();
      if (!t) return;
      for (const it of ITEM_LIST.filter((x) => x.name.toLowerCase().includes(t) || x.key.includes(t)).slice(0, 36)) {
        list.appendChild(h('button', { class: 'slot mc static eco-pick-item', title: `${it.name} (${it.key})`, onclick: () => { pi.value = pi.value.trim() ? `${pi.value.trim()},${it.key}:1` : `${it.key}:1`; pi.dispatchEvent(new Event('input')); } }, ...(atlas ? slotContent(atlas, { id: it.id, count: 1 }, 24) : [h('span', { class: 'small' }, it.name.slice(0, 3))])));
      }
    });
    const args = () => crucibleArgs({ ...c, prize: [] }).replace(/prize=\S*/, `prize=${prizeT.replace(/\s+/g, '') || 'none'}`);
    return h('div', { class: 'stack' },
      h('div', { class: 'section-title' }, 'The Crucible'),
      h('div', { class: 'small muted' }, 'A free-for-all PvP tournament. Opening it announces the event to everyone; players type /crucible join or tap Enter in chat while the gates are open. Then every fighter is pulled into the arena, and the last one standing (or whoever has the most kills when time runs out) takes the prize. Fighters get their own gear, position and game mode back afterwards, and nobody drops items inside. Works on online servers.'),
      slider('Join window', 15, 600, 15, c.join, clock, (v) => { c.join = v; }),
      slider('Fight time limit', 60, 1800, 30, c.fight, clock, (v) => { c.fight = v; }),
      slider('Arena size (radius)', 6, 32, 1, c.radius, (v) => `${v} blocks`, (v) => { c.radius = v; }),
      slider('Fewest fighters to start', 2, 32, 1, c.min, String, (v) => { c.min = v; }),
      slider('Most fighters', 2, 32, 1, c.max, String, (v) => { c.max = v; }),
      h('div', { class: 'small' }, 'Fighters use'), segmented<CrucibleKit>([['own', 'Own gear'], ['iron', 'Iron kit'], ['diamond', 'Diamond kit'], ['netherite', 'Netherite kit'], ...Object.keys(sanitizeKits(rules().kits)).map((n): [string, string] => [n, n])], c.kit, (v) => { c.kit = v; }),
      h('div', { class: 'small' }, 'Arena'), segmented<CrucibleArena>([['forge', 'Build the Crucible here'], ['here', 'Use the ground here']], c.arena, (v) => { c.arena = v; }),
      toggle('Closing ring', c.ring, (v) => { c.ring = v; }, 'After half the time, the edge burns inwards and forces a finish'),
      h('div', { class: 'row wrap' }, coin('Champion coins', c.money, (n) => { c.money = n; }), coin('Runner-up coins', c.second, (n) => { c.second = n; }), coin('Entry fee (added to the prize)', c.fee, (n) => { c.fee = n; })),
      h('label', { class: 'field' }, h('span', {}, 'Champion items (name:count, + after a name = max enchants)'), pi),
      q, list,
      h('div', { class: 'row wrap' },
        h('button', { class: 'btn primary', onclick: () => run(`/crucible start ${args()}`) }, 'Open the Crucible here'),
        h('button', { class: 'btn', onclick: () => run(`/crucible set ${args()}`) }, 'Save settings'),
        h('button', { class: 'btn ghost', onclick: () => run('/crucible reset') }, 'Reset to defaults')),
      h('div', { class: 'row wrap' }, act('Start the fight now', '/crucible go'), act('Call it off', '/crucible stop'), act('Status', '/crucible status')),
    );
  };
  const youTab = (): HTMLElement => h('div', { class: 'stack' },
    h('div', { class: 'row wrap' }, act('Heal and feed', '/heal'), act('Survival', '/gamemode survival'), act('Creative', '/gamemode creative')),
    h('div', { class: 'section-title' }, 'World'),
    h('div', { class: 'row wrap' }, act('Day', '/time set day'), act('Night', '/time set night'), act('Clear skies', '/weather clear'), act('Rain', '/weather rain'), act('Thunder', '/weather thunder')),
  );
  const rulesTab = (): HTMLElement => {
    const r = rules();
    return h('div', { class: 'stack' },
      pickRow('Teleport warm-up', 'teleportdelay', r.tpDelay ?? 3, [[0, 'Instant'], [3, '3s'], [5, '5s'], [10, '10s']]),
      pickRow('Combat timer (blocks teleports, logging out kills)', 'combattimer', r.combatTime ?? 15, [[0, 'Off'], [10, '10s'], [15, '15s'], [30, '30s']]),
      wardBox());
  };
  const wardBox = (): HTMLElement => {
    const w = sanitizeWard(rules().anticheat);
    const kick = h('input', { class: 'input eco-num', value: String(w.kick), inputmode: 'numeric', maxlength: 3 }) as HTMLInputElement;
    return h('div', { class: 'stack' },
      h('div', { class: 'section-title' }, 'Warden anticheat'),
      h('div', { class: 'small muted' }, 'Runs on online servers. Checks speed, flying, no-fall, walking through blocks, reach, aiming away, auto-clicking, multi-target hits, fast breaking and fast placing. Cheating moves are pulled back, points fade over time, and reaching the limit removes the player (repeat offenders are barred for longer). Creative players are never checked.'),
      toggle('Enabled', w.on, (v) => run(`/anticheat ${v ? 'on' : 'off'}`)),
      h('div', { class: 'small' }, 'Sensitivity'), segmented([['low', 'Low'], ['normal', 'Normal'], ['high', 'High']], w.level, (v) => run(`/anticheat level ${v}`)),
      h('div', { class: 'row' }, h('span', { class: 'small' }, 'Remove at'), kick, h('span', { class: 'small muted' }, 'points (0 = never)'), h('button', { class: 'btn small', onclick: () => run(`/anticheat kick ${Math.max(0, Math.floor(Number(kick.value)) || 0) || 'off'}`) }, 'Set')),
      toggle('Operators are exempt', w.exemptOps, (v) => run(`/anticheat ops ${v ? 'on' : 'off'}`)),
      toggle('Alert operators in chat', w.alerts, (v) => run(`/anticheat alerts ${v ? 'on' : 'off'}`)),
      h('div', { class: 'row wrap' }, act('Show status', '/anticheat status'), act('Recent flags', '/anticheat log')));
  };
  const TABS: [string, string, () => HTMLElement][] = [['item', 'Held Item', itemTab], ['kits', 'Armoury', armouryTab], ['events', 'Events', eventTab], ['crucible', 'Crucible', crucibleTab], ['tribunal', 'Tribunal', tribunalTab], ['you', 'You and World', youTab], ['rules', 'Rules', rulesTab]];
  function redraw(): void {
    clear(tabs);
    for (const [k, l] of TABS) tabs.appendChild(h('button', { class: k === tab ? 'on' : '', onclick: () => { tab = k; redraw(); } }, l));
    clear(pane);
    pane.appendChild(TABS.find((t) => t[0] === tab)![2]());
  }
  redraw();
  modal('Sovereign Console', h('div', { class: 'stack' }, tabs, pane), [{ label: 'Close', kind: 'primary' }], { full: true });
}

export function showMischief(names: () => string[], me: string, run: (cmd: string) => void, aim?: () => [number, number, number] | null): void {
  let target = '@o';
  const pick = h('div', { class: 'segmented mischief-targets' });
  const renderPick = () => {
    clear(pick);
    const opts: [string, string][] = [...(aim ? [['@aim', 'Where I am looking'] as [string, string]] : []), ['@o', 'Everyone else'], ['@a', 'Everyone'], ['@r', 'Random'], ...names().map((n) => [n, n === me ? `${n} (you)` : n] as [string, string])];
    if (!opts.some(([v]) => v === target)) target = '@o';
    for (const [v, label] of opts) pick.appendChild(h('button', { class: v === target ? 'on' : '', onclick: () => { target = v; renderPick(); } }, label));
  };
  renderPick();
  const grid = h('div', { class: 'mischief-grid' }, ...PRANKS.map((pr) => h('button', {
    class: `mischief-card${pr.razes ? ' razes' : ''}`,
    onclick: () => {
      if (target === '@aim') {
        if (!pr.aim) { toast(`${pr.name} needs a player target`, 'error'); return; }
        const t = aim?.();
        if (!t) { toast('Look at a block first', 'error'); return; }
        run(`/troll ${pr.id} at ${t[0]} ${t[1]} ${t[2]}`);
      } else run(`/troll ${pr.id} ${target}`);
      toast(`${pr.name} sent`, 'success');
    },
  }, h('span', { class: 'mischief-name' }, pr.name), h('span', { class: 'mischief-blurb' }, pr.blurb), h('span', { class: 'mischief-tags' }, pr.razes ? h('span', { class: 'badge red' }, 'Breaks blocks') : null, pr.aim ? h('span', { class: 'badge teal' }, 'Can aim') : null))));
  const body = h('div', { class: 'stack' },
    h('div', { class: 'small muted' }, 'Admin-only pranks. Pick a target, then tap a prank. Also works as /troll <prank> <player>.'),
    h('div', { class: 'section-title' }, 'Target'),
    pick,
    h('div', { class: 'section-title' }, 'Pranks'),
    grid,
  );
  modal('Mischief Console', body, [{ label: 'Close', kind: 'primary' }], { full: true });
}

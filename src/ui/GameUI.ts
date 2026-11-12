import type { RuleSet } from '../core/sim/WorldSim';
import { mcButton, mcCycle, menuScale } from './mc/Widgets';
import { Minimap } from './Minimap';
import { h, clear, toast, modal, toggle, segmented, copyText, confirmDialog, slider } from './dom';
import type { ChatKind } from '../game/Session';
import type { RoomMeta, PublicPlayer } from '../core/protocol';
import { DIFFICULTIES, Difficulty, MAX_PLAYERS_LIMIT } from '../core/constants';
import { BLOCKS } from '../core/blocks';
import { getItem } from '../core/items';

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
    this.input = h('input', { class: 'input', maxlength: 256, placeholder: '', enterkeyhint: 'send', autocomplete: 'off', autocapitalize: 'sentences', spellcheck: 'false' }) as HTMLInputElement;
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

  add(from: { id: string; name: string } | null, text: string, kind: ChatKind, ts: number): void {
    if (from && this.localMuted.has(from.id)) return;
    const d = new Date(ts);
    const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const wp = Minimap.parse(text);
    const full = from ? `<${from.name}> ${text}` : text;
    const el = h('div', { class: `line ${from ? 'msg' : kind}` }, h('span', { class: 'ts' }, time), from ? h('span', { class: 'who' }, `<${from.name}>`) : null, text,
      wp ? h('button', { class: 'wp-save', onclick: (e: Event) => { e.stopPropagation(); this.onWaypoint?.(wp); } }, 'Save waypoint') : null,
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
  packs(): void;
  quit(): void;
  difficulty?: { value: Difficulty; set(d: Difficulty): void };
  title: string;
  sub: string;
}

export function showPause(root: HTMLElement, a: PauseActions): () => void {
  menuScale();
  const close = () => el.remove();
  const row = (...b: (HTMLElement | null)[]) => h('div', { class: 'mc-row2' }, ...b.filter(Boolean) as HTMLElement[]);
  const el = h('div', { class: 'screen mc-pause', style: 'z-index:22' },
    h('div', { class: 'mct center', style: 'margin-bottom:calc(var(--ms) * 12)' }, 'Game Menu'),
    h('div', { class: 'mc-list-inner' },
      mcButton('Back to Game', () => { close(); a.resume(); }, 204),
      row(a.invite ? mcButton('Invite Friends', () => a.invite!(), 98) : null, a.players ? mcButton('Players', () => a.players!(), 98) : null),
      row(a.room ? mcButton('World Settings', () => a.room!(), 98) : null, a.shaper ? mcButton('World Shaper', () => a.shaper!(), 98) : null),
      a.difficulty ? mcCycle('Difficulty', DIFFICULTIES.map((d) => [d, d[0].toUpperCase() + d.slice(1)] as [Difficulty, string]), a.difficulty.value, (d) => a.difficulty!.set(d), { w: 204 }) : null,
      row(mcButton('Options...', () => a.settings(), 98), mcButton('Resource Packs...', () => a.packs(), 98)),
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

export function showPlayers(players: PublicPlayer[], meId: string, isOwner: boolean, localMuted: Set<string>, act: { kick(id: string): void; mute(id: string, on: boolean): void; maxPlayers: number }): void {
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
  const r = { map: rules.allowMinimap !== false, coords: rules.allowCoords !== false, homes: rules.maxHomes ?? 2, tpa: rules.tpa !== false };
  let name = room.name, diff = room.difficulty, max = room.maxPlayers;
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
    h('div', { class: 'section-title' }, 'Server rules'),
    toggle('Minimap allowed', r.map, (v) => { r.map = v; }, 'When off, nobody except admins sees the minimap or waypoint markers.'),
    toggle('Coordinates allowed', r.coords, (v) => { r.coords = v; }, 'When off, coordinates are hidden from the HUD and debug screen, to stop screen-peeking.'),
    slider('Homes per player', 0, 10, 1, r.homes, (v) => (v ? String(v) : 'Off'), (v) => { r.homes = v; }),
    toggle('Teleport requests (/tpa)', r.tpa, (v) => { r.tpa = v; }),
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

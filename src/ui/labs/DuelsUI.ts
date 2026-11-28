import { h, clear } from '../dom';
import type { DuelsState } from '../../core/labs/duels/Duels';

export class DuelsUI {
  private hud: HTMLElement;
  private menu: HTMLElement;
  state: DuelsState | null = null;
  private myId = '';
  private kit = 'blade';
  private tier = 'knight';
  menuOpen = false;
  onAction: ((k: string) => void) | null = null;
  onClose: (() => void) | null = null;

  constructor(hudRoot: HTMLElement, screens: HTMLElement) {
    this.hud = h('div', { class: 'duels-hud', style: 'display:none' });
    this.menu = h('div', { class: 'duels-menu modal-backdrop', style: 'display:none' });
    this.menu.addEventListener('pointerdown', (e) => { if (e.target === this.menu) this.close(); });
    hudRoot.append(this.hud);
    screens.append(this.menu);
  }

  setState(s: DuelsState, myId: string): void {
    this.state = s;
    this.myId = myId;
    this.drawHud();
    if (this.menuOpen) this.drawMenu();
  }

  hide(): void { this.hud.style.display = 'none'; this.close(); this.state = null; }

  private me() { return this.state?.players.find((p) => p.id === this.myId) ?? null; }

  private drawHud(): void {
    const s = this.state, me = this.me();
    if (!s || !me) { this.hud.style.display = 'none'; return; }
    clear(this.hud);
    this.hud.style.display = '';
    const kitName = (id: string | null) => s.kits.find((k) => k.id === id)?.name ?? id ?? '';
    const ch = s.challenges.find((c) => c.to === this.myId);
    if (me.status === 'match') {
      const m = s.matches.find((x) => x.a === me.name || x.b === me.name);
      if (m) this.hud.append(h('b', {}, `${m.kit} duel`), ` ${m.a} vs ${m.b} · ${m.arena}`, m.phase === 'fight' ? ` · ${Math.floor(m.t / 60)}:${String(m.t % 60).padStart(2, '0')}` : '');
    } else if (me.status === 'queue') {
      this.hud.append(h('b', {}, 'In queue'), ` for ${kitName(me.kit)} (${s.queues[me.kit ?? ''] ?? 1} waiting) `, h('button', { class: 'btn small', onclick: () => this.onAction?.('cancel') }, 'Leave queue'));
    } else {
      this.hud.append(h('b', {}, 'Proving Grounds'), ' · Talk to the Herald or ', h('button', { class: 'btn small primary', onclick: () => this.open() }, 'Open duel menu'));
    }
    if (ch) this.hud.append(h('div', { class: 'duels-challenge' }, `${ch.fromName} challenges you (${ch.kit}) `, h('button', { class: 'btn small primary', onclick: () => this.onAction?.('accept') }, 'Accept'), h('button', { class: 'btn small', onclick: () => this.onAction?.('decline') }, 'Decline')));
  }

  open(): void {
    if (!this.state) return;
    this.menuOpen = true;
    this.menu.style.display = '';
    this.drawMenu();
  }

  close(): void {
    if (!this.menuOpen) return;
    this.menuOpen = false;
    this.menu.style.display = 'none';
    this.onClose?.();
  }

  private act(k: string, close = true): void { this.onAction?.(k); if (close) this.close(); }

  private drawMenu(): void {
    const s = this.state;
    if (!s) return;
    clear(this.menu);
    const me = this.me();
    const pick = <T extends string>(list: { id: T; name: string; desc: string }[], cur: string, set: (v: T) => void) =>
      h('div', { class: 'duels-picks' }, ...list.map((x) => h('button', { class: `duels-pick${x.id === cur ? ' on' : ''}`, onclick: () => { set(x.id); this.drawMenu(); } }, h('b', {}, x.name), h('span', {}, x.desc))));
    const others = s.players.filter((p) => p.id !== this.myId && p.status === 'lobby');
    const busy = me?.status === 'match';
    this.menu.append(h('div', { class: 'modal duels-box' },
      h('div', { class: 'duels-head' }, h('b', {}, 'Proving Grounds'), h('button', { class: 'icon-btn', onclick: () => this.close() }, '×')),
      h('div', { class: 'section-title' }, 'Kit'),
      pick(s.kits as { id: string; name: string; desc: string }[], this.kit, (v) => { this.kit = v; }),
      h('div', { class: 'section-title' }, 'Spar against a bot'),
      pick(s.tiers as { id: string; name: string; desc: string }[], this.tier, (v) => { this.tier = v; }),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', disabled: busy ? 'true' : null, onclick: () => this.act(`bot:${this.kit}:${this.tier}`) }, `Fight ${s.tiers.find((t) => t.id === this.tier)?.name ?? ''} Bot`),
        h('button', { class: 'btn', disabled: busy ? 'true' : null, onclick: () => this.act(`queue:${this.kit}`) }, `Queue for ${s.kits.find((k) => k.id === this.kit)?.name ?? ''} (${s.queues[this.kit] ?? 0} waiting)`)),
      others.length ? h('div', { class: 'section-title' }, 'Challenge a player') : null,
      others.length ? h('div', { class: 'duels-picks' }, ...others.map((p) => h('button', { class: 'duels-pick', onclick: () => this.act(`challenge:${p.name}:${this.kit}`) }, h('b', {}, p.name), h('span', {}, `Challenge with ${s.kits.find((k) => k.id === this.kit)?.name}`)))) : null,
      s.matches.length ? h('div', { class: 'section-title' }, 'Duels in progress') : null,
      ...s.matches.map((m) => h('div', { class: 'small' }, `${m.a} vs ${m.b} · ${m.kit} · ${m.arena}`)),
      h('div', { class: 'section-title' }, 'Leaderboard'),
      s.board.length ? h('div', { class: 'duels-board' }, ...s.board.map((b, i) => h('div', {}, h('span', {}, `${i + 1}. ${b.name}`), h('span', {}, `${b.wins}W ${b.losses}L · best streak ${b.best}`)))) : h('div', { class: 'small muted' }, 'No duels finished yet. Be the first.'),
      busy ? h('button', { class: 'btn danger small', onclick: () => this.act('leave') }, 'Forfeit current duel') : null,
    ));
  }
}

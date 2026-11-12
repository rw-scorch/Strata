import type { InputState } from './InputState';
import { getSettings, updateSettings } from '../storage/Settings';

export type TouchButton = 'jump' | 'crouch' | 'break' | 'place' | 'use' | 'sprint' | 'fly' | 'pause' | 'chat' | 'players' | 'camera' | 'talk';

interface BtnDef { id: TouchButton; label: string; icon: string; x: number; y: number; size: number; top?: boolean; }

const ICONS: Record<string, string> = {
  up: '<path d="M6 15l6-6 6 6" />',
  down: '<path d="M6 9l6 6 6-6" />',
  pick: '<path d="M4 9c4-5 12-5 16 0" /><path d="M12 6l-6 14" />',
  cube: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" /><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" />',
  hand: '<path d="M8 13V6a1.5 1.5 0 013 0v5M11 11V4.5a1.5 1.5 0 013 0V11M14 11V6a1.5 1.5 0 013 0v7c0 4-2.5 7-6 7-2.5 0-4-1.5-5.5-4L4 12.5a1.5 1.5 0 012.5-1.5L8 13" />',
  run: '<path d="M5 12l5-5M5 12l5 5M12 12l5-5M12 12l5 5" />',
  wing: '<path d="M3 15c4 0 7-3 9-8 2 5 5 8 9 8" /><path d="M7 18c2 0 4-1.5 5-4 1 2.5 3 4 5 4" />',
  pause: '<path d="M9 5v14M15 5v14" />',
  chat: '<path d="M4 5h16v10H9l-5 4z" />',
  people: '<circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M3 20c0-4 3-6 6-6s6 2 6 6M15 20c0-3 1.5-5 3-5s3 1.5 3 4" />',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0014 0M12 18v3" />',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" />',
};

const svg = (k: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${ICONS[k]}</svg>`;

export const DEFAULT_BUTTONS: BtnDef[] = [
  { id: 'break', label: 'Break', icon: 'pick', x: 80, y: 60, size: 1.2 },
  { id: 'place', label: 'Place', icon: 'cube', x: 91.5, y: 49, size: 1.05 },
  { id: 'use', label: 'Interact', icon: 'hand', x: 80.5, y: 41, size: 0.9 },
  { id: 'jump', label: 'Jump', icon: 'up', x: 92, y: 70, size: 1.1 },
  { id: 'crouch', label: 'Crouch', icon: 'down', x: 83, y: 80, size: 0.95 },
  { id: 'sprint', label: 'Sprint', icon: 'run', x: 7, y: 44, size: 0.85 },
  { id: 'fly', label: 'Fly', icon: 'wing', x: 92, y: 30, size: 0.85 },
  { id: 'pause', label: 'Pause', icon: 'pause', x: 96, y: 6, size: 0.7, top: true },
  { id: 'chat', label: 'Chat', icon: 'chat', x: 89.5, y: 6, size: 0.7, top: true },
  { id: 'players', label: 'Players', icon: 'people', x: 83, y: 6, size: 0.7, top: true },
  { id: 'camera', label: 'View', icon: 'eye', x: 76.5, y: 6, size: 0.7, top: true },
  { id: 'talk', label: 'Talk', icon: 'mic', x: 7, y: 28, size: 0.85 },
];

export interface MobileHooks {
  onPause(): void;
  onChat(): void;
  onPlayers(): void;
  onCamera(): void;
  isFlying(): boolean;
  canFly(): boolean;
  isMultiplayer(): boolean;
  setCrouchToggled(v: boolean): void;
  onTalk?(down: boolean): void;
}

export class MobileControls {
  readonly root: HTMLDivElement;
  private input: InputState;
  private hooks: MobileHooks;
  private joyBase: HTMLDivElement;
  private joyKnob: HTMLDivElement;
  private joyId: number | null = null;
  private joyOrigin = { x: 0, y: 0 };
  private camId: number | null = null;
  private camLast = { x: 0, y: 0 };
  private camStart = { x: 0, y: 0, t: 0 };
  private camMoved = 0;
  private holdTimer: number | null = null;
  private holdBreaking = false;
  private buttons = new Map<TouchButton, HTMLButtonElement>();
  private pressed = new Map<number, TouchButton>();
  private sprintLock = false;
  private crouchOn = false;
  private lastJump = 0;
  editing = false;
  private editSel: TouchButton | null = null;
  private editLabel: HTMLElement | null = null;
  private editBar: HTMLDivElement | null = null;
  visible = false;
  private placeRepeat: number | null = null;

  constructor(parent: HTMLElement, input: InputState, hooks: MobileHooks) {
    this.input = input;
    this.hooks = hooks;
    this.root = document.createElement('div');
    this.root.className = 'touch-layer';
    (this.root as HTMLElement & { _ctl?: MobileControls })._ctl = this;
    this.joyBase = document.createElement('div');
    this.joyBase.className = 'joy-base';
    this.joyKnob = document.createElement('div');
    this.joyKnob.className = 'joy-knob';
    this.joyBase.appendChild(this.joyKnob);
    this.root.appendChild(this.joyBase);
    for (const b of DEFAULT_BUTTONS) {
      const el = document.createElement('button');
      el.className = `tbtn tbtn-${b.id}${b.top ? ' tbtn-top' : ''}`;
      el.innerHTML = `${svg(b.icon)}<span>${b.label}</span>`;
      el.dataset.b = b.id;
      el.setAttribute('aria-label', b.label);
      this.root.appendChild(el);
      this.buttons.set(b.id, el);
    }
    parent.appendChild(this.root);
    this.root.addEventListener('pointerdown', (e) => this.down(e), { passive: false });
    this.root.addEventListener('pointermove', (e) => this.move(e), { passive: false });
    this.root.addEventListener('pointerup', (e) => this.up(e), { passive: false });
    this.root.addEventListener('pointercancel', (e) => this.up(e), { passive: false });
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
    this.layout();
  }

  layout(): void {
    const s = getSettings();
    const L = s.buttonLayout;
    const MINIMAL = new Set<TouchButton>(['jump', 'crouch', 'fly', 'pause', 'chat', 'players', 'camera', 'talk']);
    const NONE = new Set<TouchButton>(['pause', 'chat', 'players', 'talk']);
    this.root.style.setProperty('--tb-op', String(s.buttonOpacity ?? 0.85));
    for (const b of DEFAULT_BUTTONS) {
      const el = this.buttons.get(b.id)!;
      const c = L[b.id] ?? {};
      const x = c.x ?? (s.leftHanded && !b.top ? 100 - b.x : b.x), y = c.y ?? b.y;
      const size = Math.round(62 * b.size * (c.size ?? 1) * s.buttonSize);
      el.style.left = `${x}%`;
      el.style.top = `${y}%`;
      el.style.width = el.style.height = `${size}px`;
      const modeHidden = s.touchLayout === 'minimal' ? !MINIMAL.has(b.id) : s.touchLayout === 'none' ? !NONE.has(b.id) : false;
      el.classList.toggle('user-hidden', !!c.hidden || modeHidden || (b.id === 'talk' && !this.voiceOn));
      el.classList.toggle('sel-edit', this.editSel === b.id);
    }
    const js = Math.round(130 * s.joystickSize);
    this.joyBase.style.width = this.joyBase.style.height = `${js}px`;
    this.joyKnob.style.width = this.joyKnob.style.height = `${Math.round(js * 0.45)}px`;
  }

  private voiceOn = false;

  setVoice(on: boolean): void { if (on !== this.voiceOn) { this.voiceOn = on; this.layout(); } }

  setVisible(v: boolean): void {
    this.visible = v;
    this.root.style.display = v ? 'block' : 'none';
    if (!v) this.releaseAll();
  }

  refreshState(): void {
    const fly = this.buttons.get('fly')!;
    fly.style.display = this.hooks.canFly() ? '' : 'none';
    fly.classList.toggle('on', this.hooks.isFlying());
    this.buttons.get('players')!.style.display = this.hooks.isMultiplayer() ? '' : 'none';
    this.buttons.get('crouch')!.classList.toggle('on', this.crouchOn);
    this.buttons.get('sprint')!.classList.toggle('on', this.sprintLock);
  }

  private leftZone(x: number): boolean {
    const w = window.innerWidth;
    return getSettings().leftHanded ? x > w * 0.58 : x < w * 0.42;
  }

  private down(e: PointerEvent): void {
    e.preventDefault();
    this.input.touchMode = true;
    const btn = (e.target as HTMLElement).closest('.tbtn') as HTMLButtonElement | null;
    if (this.editing) { if (btn) this.startDrag(e, btn); return; }
    try { this.root.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    if (btn) {
      const id = btn.dataset.b as TouchButton;
      this.pressed.set(e.pointerId, id);
      btn.classList.add('active');
      this.press(id, true);
      return;
    }
    if (this.joyId === null && this.leftZone(e.clientX)) {
      this.joyId = e.pointerId;
      const js = this.joyBase.offsetWidth || 130;
      const x = Math.max(js / 2 + 8, Math.min(window.innerWidth - js / 2 - 8, e.clientX));
      const y = Math.max(js / 2 + 8, Math.min(window.innerHeight - js / 2 - 8, e.clientY));
      this.joyOrigin = { x, y };
      this.joyBase.style.left = `${x}px`;
      this.joyBase.style.top = `${y}px`;
      this.joyBase.classList.add('show');
      this.updateJoy(e.clientX, e.clientY);
      return;
    }
    if (this.camId === null) {
      this.camId = e.pointerId;
      this.camLast = { x: e.clientX, y: e.clientY };
      this.camStart = { x: e.clientX, y: e.clientY, t: performance.now() };
      this.camMoved = 0;
      this.holdBreaking = false;
      if (getSettings().tapToInteract) {
        this.holdTimer = window.setTimeout(() => {
          if (this.camMoved < 14 && this.camId !== null) {
            this.holdBreaking = true;
            this.input.breaking = true;
            this.input.attackPressed = true;
            this.input.touchAim = { x: this.camLast.x, y: this.camLast.y };
          }
        }, 320);
      }
    }
  }

  private move(e: PointerEvent): void {
    if (this.editing) { this.dragMove(e); return; }
    if (e.pointerId === this.joyId) { e.preventDefault(); this.updateJoy(e.clientX, e.clientY); return; }
    if (e.pointerId === this.camId) {
      e.preventDefault();
      const dx = e.clientX - this.camLast.x, dy = e.clientY - this.camLast.y;
      this.camLast = { x: e.clientX, y: e.clientY };
      this.camMoved += Math.abs(dx) + Math.abs(dy);
      if (this.holdBreaking) { this.input.touchAim = { x: e.clientX, y: e.clientY }; return; }
      const s = getSettings();
      const k = 0.0055 * s.touchSensitivity;
      this.input.lookDX -= dx * k;
      this.input.lookDY -= dy * k * (s.invertY ? -1 : 1);
    }
  }

  private up(e: PointerEvent): void {
    if (this.editing) { this.dragEnd(); return; }
    const id = this.pressed.get(e.pointerId);
    if (id) {
      this.pressed.delete(e.pointerId);
      this.buttons.get(id)?.classList.remove('active');
      this.press(id, false);
      return;
    }
    if (e.pointerId === this.joyId) {
      this.joyId = null;
      this.joyBase.classList.remove('show');
      this.input.moveX = this.input.moveZ = 0;
      if (!this.sprintLock) this.input.sprint = false;
      return;
    }
    if (e.pointerId === this.camId) {
      if (this.holdTimer) { clearTimeout(this.holdTimer); this.holdTimer = null; }
      const dt = performance.now() - this.camStart.t;
      if (this.holdBreaking) { this.input.breaking = false; this.input.touchAim = null; }
      else if (getSettings().tapToInteract && dt < 260 && this.camMoved < 12) {
        this.input.touchAim = { x: e.clientX, y: e.clientY };
        this.input.usePressed = true;
        setTimeout(() => { if (this.camId === null && !this.input.breaking) this.input.touchAim = null; }, 60);
      }
      this.holdBreaking = false;
      this.camId = null;
    }
  }

  private updateJoy(x: number, y: number): void {
    const R = (this.joyBase.offsetWidth || 130) / 2;
    let dx = x - this.joyOrigin.x, dy = y - this.joyOrigin.y;
    const d = Math.hypot(dx, dy);
    const m = Math.min(1, d / R);
    if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
    this.joyKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    const dead = 0.14;
    const mag = m < dead ? 0 : (m - dead) / (1 - dead);
    const ang = Math.atan2(dy, dx);
    this.input.moveX = d ? Math.cos(ang) * mag : 0;
    this.input.moveZ = d ? -Math.sin(ang) * mag : 0;
    const sprint = this.sprintLock || (m > 0.97 && this.input.moveZ > 0.7);
    this.input.sprint = sprint && this.input.moveZ > 0.3;
    this.joyBase.classList.toggle('sprint', this.input.sprint);
  }

  private press(id: TouchButton, down: boolean): void {
    const i = this.input;
    switch (id) {
      case 'jump':
        i.jump = down;
        if (down) {
          i.jumpPressed = true;
          const now = performance.now();
          if (now - this.lastJump < 300 && this.hooks.canFly()) i.flyToggle = true;
          this.lastJump = now;
        }
        break;
      case 'crouch':
        if (this.hooks.isFlying()) { i.crouch = down; break; }
        if (down) { this.crouchOn = !this.crouchOn; i.crouch = this.crouchOn; this.hooks.setCrouchToggled(this.crouchOn); }
        break;
      case 'break': i.breaking = down; if (down) { i.attackPressed = true; i.touchAim = null; } break;
      case 'place': case 'use':
        i.using = down;
        i.forcePlace = id === 'place';
        if (down) { i.usePressed = true; i.touchAim = null; }
        break;
      case 'sprint': if (down) { this.sprintLock = !this.sprintLock; if (!this.sprintLock) i.sprint = false; } break;
      case 'fly': if (down) i.flyToggle = true; break;
      case 'pause': if (down) this.hooks.onPause(); break;
      case 'chat': if (down) this.hooks.onChat(); break;
      case 'players': if (down) this.hooks.onPlayers(); break;
      case 'camera': if (down) this.hooks.onCamera(); break;
      case 'talk': this.hooks.onTalk?.(down); break;
    }
    if (this.placeRepeat) { clearInterval(this.placeRepeat); this.placeRepeat = null; }
    this.refreshState();
  }

  releaseAll(): void {
    for (const [, id] of this.pressed) { this.buttons.get(id)?.classList.remove('active'); this.press(id, false); }
    this.pressed.clear();
    this.joyId = null;
    this.camId = null;
    this.joyBase.classList.remove('show');
    const i = this.input;
    i.moveX = i.moveZ = 0;
    i.breaking = i.using = i.jump = false;
    i.touchAim = null;
  }

  resetCrouch(): void { this.crouchOn = false; this.input.crouch = false; this.refreshState(); }

  private dragEl: HTMLButtonElement | null = null;
  private dragOff = { x: 0, y: 0 };

  enterEdit(onDone: () => void): void {
    this.editing = true;
    this.setVisible(true);
    this.root.classList.add('editing');
    for (const b of this.buttons.values()) b.style.display = '';
    const bar = document.createElement('div');
    bar.className = 'edit-bar';
    bar.innerHTML = '<span data-a="label">Drag a button to move it. Tap one to resize or hide it.</span><div class="edit-row"><button class="btn small" data-a="smaller">Smaller</button><button class="btn small" data-a="bigger">Bigger</button><button class="btn small" data-a="hide">Hide</button></div><div class="edit-row"><button class="btn small" data-a="reset">Reset all</button><button class="btn small primary" data-a="done">Done</button></div>';
    bar.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.editLabel = bar.querySelector('[data-a=label]');
    const patch = (fn: (c: { x?: number; y?: number; size?: number; hidden?: boolean }) => void) => {
      if (!this.editSel) return;
      const L = { ...getSettings().buttonLayout };
      const c = { ...(L[this.editSel] ?? {}) };
      fn(c);
      L[this.editSel] = c;
      updateSettings({ buttonLayout: L });
      this.layout();
      this.updateEditLabel();
    };
    bar.querySelector('[data-a=smaller]')!.addEventListener('click', () => patch((c) => { c.size = Math.max(0.5, (c.size ?? 1) - 0.1); }));
    bar.querySelector('[data-a=bigger]')!.addEventListener('click', () => patch((c) => { c.size = Math.min(2, (c.size ?? 1) + 0.1); }));
    bar.querySelector('[data-a=hide]')!.addEventListener('click', () => patch((c) => { c.hidden = !c.hidden; }));
    bar.querySelector('[data-a=reset]')!.addEventListener('click', () => { updateSettings({ buttonLayout: {} }); this.editSel = null; this.layout(); this.updateEditLabel(); });
    bar.querySelector('[data-a=done]')!.addEventListener('click', () => { this.exitEdit(); onDone(); });
    this.root.appendChild(bar);
    this.editBar = bar;
  }

  private updateEditLabel(): void {
    if (!this.editLabel) return;
    const b = DEFAULT_BUTTONS.find((d) => d.id === this.editSel);
    const c = this.editSel ? getSettings().buttonLayout[this.editSel] : undefined;
    this.editLabel.textContent = b ? `${b.label}: ${Math.round((c?.size ?? 1) * 100)}%${c?.hidden ? ', hidden' : ''}` : 'Drag a button to move it. Tap one to resize or hide it.';
    const hide = this.editBar?.querySelector('[data-a=hide]');
    if (hide) hide.textContent = c?.hidden ? 'Show' : 'Hide';
  }

  exitEdit(): void {
    this.editSel = null;
    this.layout();
    this.editing = false;
    this.root.classList.remove('editing');
    this.editBar?.remove();
    this.editBar = null;
    this.refreshState();
  }

  private startDrag(e: PointerEvent, btn: HTMLButtonElement): void {
    this.dragEl = btn;
    this.editSel = btn.dataset.b as TouchButton;
    this.layout();
    this.updateEditLabel();
    const r = btn.getBoundingClientRect();
    this.dragOff = { x: e.clientX - (r.left + r.width / 2), y: e.clientY - (r.top + r.height / 2) };
    try { this.root.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  }

  private dragMove(e: PointerEvent): void {
    if (!this.dragEl) return;
    const x = ((e.clientX - this.dragOff.x) / window.innerWidth) * 100;
    const y = ((e.clientY - this.dragOff.y) / window.innerHeight) * 100;
    this.dragEl.style.left = `${Math.max(3, Math.min(97, x))}%`;
    this.dragEl.style.top = `${Math.max(3, Math.min(97, y))}%`;
  }

  private dragEnd(): void {
    if (!this.dragEl) return;
    const id = this.dragEl.dataset.b as TouchButton;
    const prev = getSettings().buttonLayout[id] ?? {};
    const layout = { ...getSettings().buttonLayout, [id]: { ...prev, x: parseFloat(this.dragEl.style.left), y: parseFloat(this.dragEl.style.top) } };
    updateSettings({ buttonLayout: layout });
    this.dragEl = null;
  }
}

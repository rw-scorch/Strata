import { actionsFor, bindOf, bound, BindAction } from './keybinds';
import { getSettings, updateSettings } from '../storage/Settings';
import type { InputState } from './InputState';

export interface DesktopHooks {
  isPlaying(): boolean;
  onInventory(): void;
  onChat(prefix: string): void;
  onPause(): void;
  onToggleDebug(): void;
  onToggleHud(): void;
  onThirdPerson(): void;
  onPointerLockLost(): void;
  onMouseMode?(): void;
  onMessage?(text: string): void;
  onSwapHands?(): void;
}

export class DesktopControls {
  private keys = new Set<string>();
  private canvas: HTMLCanvasElement;
  private input: InputState;
  private hooks: DesktopHooks;
  sensitivity = 1;
  invertY = false;
  private lastW = 0;
  private sprintLatch = false;
  private disposers: (() => void)[] = [];
  locked = false;
  private lastTouch = 0;
  private gestureT = -1e9;
  lockFailed = false;
  private f3 = false;
  private f3Combo = false;

  constructor(canvas: HTMLCanvasElement, input: InputState, hooks: DesktopHooks) {
    this.canvas = canvas;
    this.input = input;
    this.hooks = hooks;
    const on = <K extends keyof WindowEventMap>(t: K, f: (e: WindowEventMap[K]) => void, target: Window | Document | HTMLElement = window) => {
      target.addEventListener(t, f as EventListener, { passive: false });
      this.disposers.push(() => target.removeEventListener(t, f as EventListener));
    };
    on('keydown', (e) => this.key(e, true));
    on('keyup', (e) => this.key(e, false));
    on('blur', () => { this.keys.clear(); this.sync(); this.input.breaking = false; this.input.using = false; });
    const uiTarget = (t: EventTarget | null) => { const el = t as HTMLElement | null; return !!el && el !== this.canvas && !el.closest?.('.touch-layer') && !!el.closest?.('button, input, textarea, select, a, .slot, .panel, .card, .minimap, .chat, .hotbar, [data-ui]'); };
    const free = () => this.lockFailed && !this.locked && !this.input.touchMode && this.hooks.isPlaying();
    on('mousemove', (e) => {
      if (!this.locked || performance.now() - this.lastTouch < 900) return;
      const s = 0.0022 * this.sensitivity;
      this.input.lookDX -= e.movementX * s;
      this.input.lookDY -= e.movementY * s * (this.invertY ? -1 : 1);
    });
    on('touchstart', () => { this.lastTouch = performance.now(); }, document);
    on('touchend', () => { this.lastTouch = performance.now(); }, document);
    on('pointerdown', (e) => {
      if (e.pointerType !== 'mouse') { this.lastTouch = performance.now(); return; }
      if (!this.hooks.isPlaying() || this.locked) return;
      if (uiTarget(e.target)) return;
      this.input.touchMode = false;
      this.hooks.onMouseMode?.();
      this.gestureT = performance.now();
      if (!this.lockSupported) { this.noLockNotice(); return; }
      this.lock();
    }, document);
    on('mousedown', (e) => {
      if (!this.hooks.isPlaying() || !(this.locked || free())) return;
      if (performance.now() - this.lastTouch < 900) return;
      if (!this.locked && uiTarget(e.target)) return;
      this.input.touchMode = false;
      if (e.button === 1) e.preventDefault();
      this.press(`Mouse${e.button}`, true, false, false);
    });
    on('mouseup', (e) => { this.press(`Mouse${e.button}`, false, false, false); });
    on('contextmenu', (e) => { if (this.hooks.isPlaying()) e.preventDefault(); });
    on('wheel', (e) => {
      if (!this.locked && !free()) return;
      this.input.hotbarDelta += Math.sign(e.deltaY);
      e.preventDefault();
    });
    const plc = () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === this.canvas;
      if (was && !this.locked) { this.keys.clear(); this.sync(); this.input.breaking = this.input.using = false; this.hooks.onPointerLockLost(); }
    };
    document.addEventListener('pointerlockchange', plc);
    this.disposers.push(() => document.removeEventListener('pointerlockchange', plc));
    const ple = () => { this.pending = false; this.lastFail = performance.now(); if (!this.lockFailed && performance.now() - this.gestureT < 1500) { this.lockFailed = true; this.hooks.onMessage?.('This browser did not allow mouse lock. Click and drag to look around.'); } };
    document.addEventListener('pointerlockerror', ple);
    this.disposers.push(() => document.removeEventListener('pointerlockerror', ple));
    let lx = -1, ly = -1, ex = 0.5, ey = 0.5, lastMove = 0;
    on('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const dx = lx < 0 ? 0 : e.clientX - lx, dy = ly < 0 ? 0 : e.clientY - ly;
      lx = e.clientX; ly = e.clientY;
      ex = e.clientX / Math.max(1, window.innerWidth); ey = e.clientY / Math.max(1, window.innerHeight);
      if (this.locked || !this.lockFailed || !this.hooks.isPlaying() || this.input.touchMode) return;
      lastMove = performance.now();
      const s = 0.0035 * this.sensitivity;
      this.input.lookDX -= dx * s;
      this.input.lookDY -= dy * s * (this.invertY ? -1 : 1);
    }, document);
    let raf = 0, lastT = performance.now();
    const edge = () => {
      raf = requestAnimationFrame(edge);
      const now = performance.now(), dt = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;
      if (!free() || now - lastMove > 4000) return;
      const m = 0.05, sp = 2.4 * this.sensitivity;
      const push = (v: number) => v < m ? (m - v) / m : v > 1 - m ? -(v - (1 - m)) / m : 0;
      this.input.lookDX += push(ex) * sp * dt;
      this.input.lookDY += push(ey) * sp * 0.6 * dt * (this.invertY ? -1 : 1);
    };
    raf = requestAnimationFrame(edge);
    this.disposers.push(() => cancelAnimationFrame(raf));
  }

  private pending = false;
  private lastFail = 0;
  readonly lockSupported = typeof HTMLCanvasElement !== 'undefined' && typeof HTMLCanvasElement.prototype.requestPointerLock === 'function';
  private noticeShown = false;

  private noLockNotice(): void {
    this.lockFailed = true;
    if (this.noticeShown) return;
    this.noticeShown = true;
    this.hooks.onMessage?.('This browser does not let websites lock the mouse (Safari on iPad). Move the mouse to look, and push it against a screen edge to keep turning; left click breaks, right click places.');
  }

  lock(): void {
    if (document.pointerLockElement === this.canvas || this.pending) return;
    if (performance.now() - this.lastFail < 400) return;
    this.pending = true;
    const done = () => { this.pending = false; };
    const fail = () => { this.pending = false; this.lastFail = performance.now(); };
    const plain = () => {
      try {
        const p = this.canvas.requestPointerLock?.() as unknown as Promise<void> | undefined;
        if (p?.then) p.then(done, fail); else done();
      } catch { fail(); }
    };
    try {
      const r = this.canvas.requestPointerLock?.({ unadjustedMovement: true } as never) as unknown as Promise<void> | undefined;
      if (r?.then) r.then(done, (e: { name?: string }) => { if (e?.name === 'NotSupportedError') plain(); else fail(); });
      else done();
    } catch { plain(); }
  }

  unlock(): void { if (document.pointerLockElement) document.exitPointerLock(); }

  private key(e: KeyboardEvent, down: boolean): void {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.code === 'F3') {
      e.preventDefault();
      if (down) { if (!this.f3) { this.f3 = true; this.f3Combo = false; } }
      else { this.f3 = false; if (!this.f3Combo && this.hooks.isPlaying()) this.hooks.onToggleDebug(); }
      return;
    }
    if (down && this.f3 && e.code === 'KeyH') {
      this.f3Combo = true;
      const v = !getSettings().advancedTooltips;
      updateSettings({ advancedTooltips: v });
      this.hooks.onMessage?.(`Advanced tooltips: ${v ? 'shown' : 'hidden'}`);
      return;
    }
    if (!this.hooks.isPlaying()) {
      if (down && (bound(e.code, 'inventory') || e.code === 'Escape')) this.hooks.onInventory();
      return;
    }
    const c = e.code;
    if (down) {
      if (c === 'Enter') { e.preventDefault(); this.hooks.onChat(''); return; }
      if (c === 'Escape') { this.hooks.onPause(); return; }
      if (['Space', 'ArrowUp', 'ArrowDown', 'Tab', 'F1', 'F5', 'Slash'].includes(c) || actionsFor(c).length) e.preventDefault();
    }
    if (down && !e.repeat && getSettings().toggleCrouch && (bound(c, 'sneak') || (bindOf('sneak') === 'ShiftLeft' && c === 'ShiftRight'))) { this.input.crouchLatch = !this.input.crouchLatch; this.input.touchMode = false; }
    this.press(c, down, e.repeat, e.ctrlKey);
  }

  private press(c: string, down: boolean, repeat: boolean, ctrl: boolean): void {
    const acts = actionsFor(c);
    if (down) {
      for (const a of acts) {
        switch (a) {
          case 'hud': this.hooks.onToggleHud(); return;
          case 'perspective': this.hooks.onThirdPerson(); return;
          case 'inventory': this.hooks.onInventory(); return;
          case 'chat': this.hooks.onChat(''); return;
          case 'command': this.hooks.onChat('/'); return;
          case 'drop': if (ctrl) this.input.dropAll = true; else this.input.drop = true; break;
          case 'swap': if (!repeat) this.hooks.onSwapHands?.(); break;
          case 'attack': if (!repeat) { this.input.breaking = true; this.input.attackPressed = true; } break;
          case 'use': if (!repeat) { this.input.using = true; this.input.usePressed = true; } break;
          case 'pick': if (!repeat) this.input.pick = true; break;
          case 'forward': if (!repeat) { const now = performance.now(); if (now - this.lastW < 280) this.sprintLatch = true; this.lastW = now; } break;
          case 'jump': if (!repeat) { this.input.jumpPressed = true; const now = performance.now(); if (now - this.input.lastJumpTap < 300) this.input.flyToggle = true; this.input.lastJumpTap = now; } break;
          default: if (a.startsWith('hot')) this.input.hotbarSelect = Number(a.slice(3)) - 1;
        }
      }
      this.keys.add(c);
    } else {
      this.keys.delete(c);
      if (acts.includes('forward')) this.sprintLatch = false;
      if (acts.includes('attack')) this.input.breaking = false;
      if (acts.includes('use')) this.input.using = false;
    }
    this.sync();
  }

  private sync(): void {
    const k = this.keys;
    const i = this.input;
    const b = (a: BindAction) => k.has(bindOf(a));
    i.moveZ = (b('forward') || k.has('ArrowUp') ? 1 : 0) - (b('back') || k.has('ArrowDown') ? 1 : 0);
    i.moveX = (b('right') || k.has('ArrowRight') ? 1 : 0) - (b('left') || k.has('ArrowLeft') ? 1 : 0);
    i.jump = b('jump');
    i.crouch = getSettings().toggleCrouch ? i.crouchLatch : b('sneak') || (bindOf('sneak') === 'ShiftLeft' && k.has('ShiftRight'));
    i.sprint = (b('sprint') || this.sprintLatch) && i.moveZ > 0;
    if (i.moveX || i.moveZ || i.jump) i.touchMode = false;
  }

  dispose(): void { for (const d of this.disposers) d(); this.unlock(); }
}

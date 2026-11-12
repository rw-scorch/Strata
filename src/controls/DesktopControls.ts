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
      const t = e.target as HTMLElement | null;
      if (t && t !== this.canvas && !t.closest?.('.touch-layer') && t.closest?.('button, input, textarea, select, a, .slot, .panel, .card, .minimap, .chat, .hotbar, [data-ui]')) return;
      this.input.touchMode = false;
      this.hooks.onMouseMode?.();
      this.gestureT = performance.now();
      this.lock();
    }, document);
    on('mousedown', (e) => {
      if (!this.hooks.isPlaying() || !this.locked) return;
      if (performance.now() - this.lastTouch < 900) return;
      this.input.touchMode = false;
      if (e.button === 0) { this.input.breaking = true; this.input.attackPressed = true; }
      else if (e.button === 2) { this.input.using = true; this.input.usePressed = true; }
      else if (e.button === 1) { this.input.pick = true; e.preventDefault(); }
    });
    on('mouseup', (e) => {
      if (e.button === 0) this.input.breaking = false;
      else if (e.button === 2) this.input.using = false;
    });
    on('contextmenu', (e) => { if (this.hooks.isPlaying()) e.preventDefault(); });
    on('wheel', (e) => {
      if (!this.locked) return;
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
    on('pointermove', (e) => {
      if (this.locked || e.pointerType !== 'mouse' || !this.lockFailed || !(e.buttons & 1) || !this.hooks.isPlaying() || this.input.touchMode) return;
      const s = 0.0035 * this.sensitivity;
      this.input.lookDX -= e.movementX * s;
      this.input.lookDY -= e.movementY * s * (this.invertY ? -1 : 1);
    }, document);
  }

  private pending = false;
  private lastFail = 0;

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
      if (down && (e.code === 'KeyE' || e.code === 'Escape')) this.hooks.onInventory();
      return;
    }
    const c = e.code;
    if (down) {
      if (c === 'F1') { e.preventDefault(); this.hooks.onToggleHud(); return; }
      if (c === 'F5') { e.preventDefault(); this.hooks.onThirdPerson(); return; }
      if (c === 'KeyE') { this.hooks.onInventory(); return; }
      if (c === 'KeyT' || c === 'Enter') { e.preventDefault(); this.hooks.onChat(''); return; }
      if (c === 'Slash') { e.preventDefault(); this.hooks.onChat('/'); return; }
      if (c === 'Escape') { this.hooks.onPause(); return; }
      if (c === 'KeyQ') { if (e.ctrlKey) this.input.dropAll = true; else this.input.drop = true; }
      if (c === 'KeyF' && !e.repeat) this.hooks.onSwapHands?.();
      if (c.startsWith('Digit')) { const n = Number(c.slice(5)); if (n >= 1 && n <= 9) this.input.hotbarSelect = n - 1; }
      if (c === 'KeyW' && !e.repeat) {
        const now = performance.now();
        if (now - this.lastW < 280) this.sprintLatch = true;
        this.lastW = now;
      }
      if (c === 'Space' && !e.repeat) {
        this.input.jumpPressed = true;
        const now = performance.now();
        if (now - this.input.lastJumpTap < 300) this.input.flyToggle = true;
        this.input.lastJumpTap = now;
      }
      if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(c)) e.preventDefault();
      this.keys.add(c);
    } else {
      this.keys.delete(c);
      if (c === 'KeyW') this.sprintLatch = false;
    }
    this.sync();
  }

  private sync(): void {
    const k = this.keys;
    const i = this.input;
    i.moveZ = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    i.moveX = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    i.jump = k.has('Space');
    i.crouch = k.has('ShiftLeft') || k.has('ShiftRight');
    i.sprint = (k.has('ControlLeft') || this.sprintLatch) && i.moveZ > 0;
    if (i.moveX || i.moveZ || i.jump) i.touchMode = false;
  }

  dispose(): void { for (const d of this.disposers) d(); this.unlock(); }
}

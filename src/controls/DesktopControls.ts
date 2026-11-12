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
      if (!this.locked) return;
      const s = 0.0022 * this.sensitivity;
      this.input.lookDX -= e.movementX * s;
      this.input.lookDY -= e.movementY * s * (this.invertY ? -1 : 1);
    });
    on('mousedown', (e) => {
      if (!this.hooks.isPlaying()) return;
      if (!this.locked) {
        const t = e.target as HTMLElement | null;
        if (t && t !== this.canvas && t.closest?.('button, input, textarea, select, a, .slot, .panel, .card, .minimap, .chat, [data-ui]')) return;
        this.input.touchMode = false;
        this.hooks.onMouseMode?.();
        this.lock();
        return;
      }
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
    if (!this.hooks.isPlaying()) {
      if (down && (e.code === 'KeyE' || e.code === 'Escape')) this.hooks.onInventory();
      return;
    }
    const c = e.code;
    if (down) {
      if (c === 'F3') { e.preventDefault(); this.hooks.onToggleDebug(); return; }
      if (c === 'F1') { e.preventDefault(); this.hooks.onToggleHud(); return; }
      if (c === 'F5') { e.preventDefault(); this.hooks.onThirdPerson(); return; }
      if (c === 'KeyE') { this.hooks.onInventory(); return; }
      if (c === 'KeyT' || c === 'Enter') { e.preventDefault(); this.hooks.onChat(''); return; }
      if (c === 'Slash') { e.preventDefault(); this.hooks.onChat('/'); return; }
      if (c === 'Escape') { this.hooks.onPause(); return; }
      if (c === 'KeyQ') { if (e.ctrlKey) this.input.dropAll = true; else this.input.drop = true; }
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

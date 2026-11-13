import { B, BLOCKS, FACING_DIRS, blockId, blockMeta, makeBlock, DOOR_UPPER, DOOR_OPEN } from '../blocks';
import { getItem } from '../items';
import type { ItemStack } from '../inventory';

export const DIR6: [number, number, number][] = [[-1, 0, 0], [1, 0, 0], [0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1]];
export const W = 0, E = 1, D = 2, U = 3, N = 4, S = 5;
const opp = (d: number) => d ^ 1;
const NEIGHBOR_TORCH_ORDER = [D, U, N, S, W, E];
export const FACE_TO_DIR6 = [N, E, S, W];
export const DIR6_TO_FACE = [3, 1, -1, -1, 0, 2];

export const DOOR_POWERED = 16;
export const LEVER_ON = 8;
export const PLATE_ON = 1;
export const REP_POWERED = 16, REP_LOCKED = 32;
export const CMP_SUB = 4, CMP_POWERED = 8;

export interface RsHost {
  get(x: number, y: number, z: number): number;
  raw(cx: number, cz: number): Uint16Array | null;
  setState(x: number, y: number, z: number, v: number): void;
  loaded(x: number, z: number): boolean;
  tick(): number;
  container(x: number, y: number, z: number): (ItemStack | null)[] | null;
  plateHasEntity(x: number, y: number, z: number, wooden: boolean): boolean;
  sound(s: string, x: number, y: number, z: number): void;
  smoke(x: number, y: number, z: number): void;
  breakBlock(x: number, y: number, z: number): void;
  pushEntities(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, dx: number, dy: number, dz: number): void;
  dispense(x: number, y: number, z: number, v: number, dir: number): void;
}

interface Sched { x: number; y: number; z: number; due: number; prio: number; seq: number; id: number }

const key = (x: number, y: number, z: number) => `${x},${y},${z}`;

const conductorTable = new Uint8Array(256);
for (const b of BLOCKS) if (b && b.solid && b.opaque && b.render === 'cube' && b.id !== B.REDSTONE_BLOCK && b.id !== B.GLOWSTONE) conductorTable[b.id] = 1;
conductorTable[B.DROPPER] = conductorTable[B.DISPENSER] = 1;

export function isConductor(v: number): boolean { return conductorTable[v & 0xff] === 1; }

export function isWire(v: number): boolean { return (v & 0xff) === B.REDSTONE_WIRE; }
export function isTorch(id: number): boolean { return id === B.REDSTONE_TORCH || id === B.UNLIT_REDSTONE_TORCH; }
export function isDiode(id: number): boolean { return id === B.REPEATER || id === B.COMPARATOR; }
export function isButton(id: number): boolean { return id === B.STONE_BUTTON || id === B.OAK_BUTTON; }
export function isPlate(id: number): boolean { return id === B.STONE_PRESSURE_PLATE || id === B.OAK_PRESSURE_PLATE; }
export function isLamp(id: number): boolean { return id === B.REDSTONE_LAMP || id === B.REDSTONE_LAMP_LIT; }

export function isSignalSource(id: number): boolean {
  return id === B.REDSTONE_WIRE || isTorch(id) || id === B.LEVER || isButton(id) || isPlate(id) || id === B.REDSTONE_BLOCK || isDiode(id) || id === B.OBSERVER;
}

export function isPiston(id: number): boolean { return id === B.PISTON || id === B.STICKY_PISTON; }
export function isRedstoneId(id: number): boolean { return isSignalSource(id) || isLamp(id) || isPiston(id) || id === B.HOPPER || id === B.DROPPER || id === B.DISPENSER || id === B.PISTON_HEAD; }
export const PISTON_EXT = 8, OBS_ON = 8, HOPPER_OFF = 8, DISP_TRIG = 8;

export type PushReaction = 'empty' | 'destroy' | 'block' | 'normal';
export function pushReaction(v: number): PushReaction {
  const id = v & 0xff;
  if (id === 0) return 'empty';
  const d = BLOCKS[id];
  if (!d) return 'block';
  if (d.fluid) return 'empty';
  if (d.hardness < 0 || id === B.OBSIDIAN || id === B.SPAWNER || id === B.TRIAL_SPAWNER || id === B.VAULT || id === B.PISTON_HEAD || id === B.MOVING_PISTON) return 'block';
  if (isPiston(id)) return (v >>> 8) & PISTON_EXT ? 'block' : 'normal';
  if (id === B.CHEST || id === B.FURNACE || id === B.FURNACE_LIT || id === B.HOPPER || id === B.DROPPER || id === B.DISPENSER) return 'block';
  if (id === B.OBSERVER) return 'normal';
  if (d.render === 'cross' || d.render === 'crop' || d.render === 'torch' || d.render === 'ladder' || d.render === 'door' || d.render === 'redstone' || id === B.CACTUS || id === B.SUGAR_CANE) return 'destroy';
  return 'normal';
}

export function diodeOut(v: number): number { return FACE_TO_DIR6[blockMeta(v) & 3]; }
export function repeaterDelay(v: number): number { return ((blockMeta(v) >> 2) & 3) + 1; }

export function attachFace(id: number, meta: number): number {
  if (isTorch(id)) return meta & 7;
  return meta & 7;
}

export function attachOut(face: number): number {
  if (face === 0) return U;
  if (face === 5) return D;
  return opp(FACE_TO_DIR6[(face - 1) & 3]);
}

export type Getter = (x: number, y: number, z: number) => number;

export function wireLinks(get: Getter, x: number, y: number, z: number, out: [number, number, number][]): void {
  out.length = 0;
  const aboveCond = isConductor(get(x, y + 1, z));
  for (const d of [W, E, N, S]) {
    const [dx, , dz] = DIR6[d];
    const sx = x + dx, sz = z + dz;
    const side = get(sx, y, sz);
    if (isWire(side)) { out.push([sx, y, sz]); continue; }
    if (isConductor(side)) { if (!aboveCond && isWire(get(sx, y + 1, sz))) out.push([sx, y + 1, sz]); }
    else if (isWire(get(sx, y - 1, sz))) out.push([sx, y - 1, sz]);
  }
}

function connectsTo(v: number, side: number): boolean {
  const id = v & 0xff;
  if (id === B.REDSTONE_WIRE) return true;
  if (id === B.REPEATER) { const o = diodeOut(v); return o === side || o === opp(side); }
  if (id === B.OBSERVER) return side === opp((v >>> 8) & 7);
  return isSignalSource(id);
}

export function wireShape(get: Getter, x: number, y: number, z: number): number {
  let m = 0;
  const aboveCond = isConductor(get(x, y + 1, z));
  const sides = [W, E, N, S];
  for (let i = 0; i < 4; i++) {
    const d = sides[i];
    const [dx, , dz] = DIR6[d];
    const side = get(x + dx, y, z + dz);
    let c = 0;
    if (connectsTo(side, opp(d))) c = 1;
    else if (isConductor(side)) { if (!aboveCond && isWire(get(x + dx, y + 1, z + dz))) c = 2; }
    else if (isWire(get(x + dx, y - 1, z + dz))) c = 1;
    m |= c << (i * 2);
  }
  const w = m & 3, e = (m >> 2) & 3, n = (m >> 4) & 3, s = (m >> 6) & 3;
  const count = (w ? 1 : 0) + (e ? 1 : 0) + (n ? 1 : 0) + (s ? 1 : 0);
  if (count === 0) return 0b01010101;
  if (count === 1) {
    if (w || e) m |= w ? 1 << 2 : 1;
    else m |= n ? 1 << 6 : 1 << 4;
  }
  return m;
}

export function wireConnected(shape: number, side: number): boolean {
  const i = side === W ? 0 : side === E ? 1 : side === N ? 2 : side === S ? 3 : -1;
  return i >= 0 && ((shape >> (i * 2)) & 3) !== 0;
}

export function isAnalogSource(id: number): boolean {
  return id === B.CHEST || id === B.FURNACE || id === B.FURNACE_LIT || id === B.HOPPER || id === B.DROPPER || id === B.DISPENSER;
}

export function analogOf(items: (ItemStack | null)[]): number {
  let sum = 0, any = false;
  for (const s of items) {
    if (!s || s.count <= 0) continue;
    any = true;
    sum += s.count / (getItem(s.id)?.maxStack ?? 64);
  }
  if (!any) return 0;
  return Math.floor(1 + (sum / items.length) * 14);
}

export class Redstone {
  private sched = new Map<string, Sched>();
  private seq = 0;
  private toggles = new Map<string, number[]>();
  private compOut = new Map<string, number>();
  private wiresSignal = true;
  private solving: Set<string> | null = null;
  private stack: { x: number; y: number; z: number; i: number; skip: number }[] = [];
  private running = false;
  updates = 0;
  budget = 300000;
  overBudget = 0;
  private links: [number, number, number][] = [];

  constructor(private h: RsHost) {}

  get pending(): number { return this.sched.size; }

  private g(x: number, y: number, z: number): number { return y < 0 || y >= 256 ? 0 : this.h.get(x, y, z); }

  hasScheduled(x: number, y: number, z: number): boolean { return this.sched.has(key(x, y, z)); }

  schedule(x: number, y: number, z: number, delay: number, prio = 0): void {
    const k = key(x, y, z);
    if (this.sched.has(k)) return;
    if (this.sched.size >= 65536) return;
    this.sched.set(k, { x, y, z, due: this.h.tick() + Math.max(1, delay), prio, seq: this.seq++, id: blockId(this.g(x, y, z)) });
  }

  private reval: [number, number][] = [];

  queueRevalidate(cx: number, cz: number): void { if (this.reval.length < 4096) this.reval.push([cx, cz]); }

  tickScheduled(): void {
    this.updates = 0;
    if (this.reval.length) {
      const list = this.reval; this.reval = [];
      for (const [cx, cz] of list) { const b = this.h.raw(cx, cz); if (b) this.revalidateChunk(b, cx, cz); }
    }
    if (!this.sched.size) return;
    const now = this.h.tick();
    const due: Sched[] = [];
    for (const s of this.sched.values()) if (s.due <= now) due.push(s);
    if (!due.length) return;
    due.sort((a, b) => a.due - b.due || a.prio - b.prio || a.seq - b.seq);
    for (const s of due.slice(0, 65536)) {
      const k = key(s.x, s.y, s.z);
      if (this.sched.get(k) !== s) continue;
      this.sched.delete(k);
      if (!this.h.loaded(s.x, s.z)) continue;
      const v = this.g(s.x, s.y, s.z), id = blockId(v);
      if (!sameFamily(id, s.id)) continue;
      this.onTick(s.x, s.y, s.z, v);
    }
  }

  updateNeighbors(x: number, y: number, z: number, skip = -1): void {
    this.stack.push({ x, y, z, i: 0, skip });
    if (this.running) return;
    this.running = true;
    try {
      while (this.stack.length) {
        const t = this.stack[this.stack.length - 1];
        if (t.i >= 6) { this.stack.pop(); continue; }
        const d = t.i++;
        if (d === t.skip) continue;
        const [dx, dy, dz] = DIR6[d];
        this.neighborChanged(t.x + dx, t.y + dy, t.z + dz);
      }
    } finally { this.running = false; }
  }

  neighborChanged(x: number, y: number, z: number): void {
    if (y < 0 || y >= 256 || !this.h.loaded(x, z)) return;
    if (++this.updates > this.budget) { this.overBudget++; return; }
    const v = this.g(x, y, z);
    const id = blockId(v);
    if (id === 0) return;
    if (id === B.REDSTONE_WIRE) { if (!this.solving?.has(key(x, y, z))) this.solveWires([[x, y, z]]); return; }
    if (isTorch(id)) { const lit = id === B.REDSTONE_TORCH; if (lit === this.torchPowered(x, y, z, v) && !this.hasScheduled(x, y, z)) this.schedule(x, y, z, 2); return; }
    if (id === B.REPEATER) { this.repeaterLockCheck(x, y, z, v); this.diodeCheck(x, y, z, this.g(x, y, z)); return; }
    if (id === B.COMPARATOR) { this.diodeCheck(x, y, z, v); return; }
    if (isLamp(id)) {
      const lit = id === B.REDSTONE_LAMP_LIT, p = this.hasNeighborSignal(x, y, z);
      if (lit && !p) { if (!this.hasScheduled(x, y, z)) this.schedule(x, y, z, 4); }
      else if (!lit && p) this.h.setState(x, y, z, B.REDSTONE_LAMP_LIT);
      return;
    }
    if (id === B.OAK_DOOR) { this.doorCheck(x, y, z, v); return; }
    if (isPiston(id)) { this.pistonCheck(x, y, z, v); return; }
    if (id === B.HOPPER) {
      const off = this.hasNeighborSignal(x, y, z), m = blockMeta(v);
      if (off !== !!(m & HOPPER_OFF)) this.h.setState(x, y, z, makeBlock(id, off ? m | HOPPER_OFF : m & ~HOPPER_OFF));
      return;
    }
    if (id === B.DROPPER || id === B.DISPENSER) {
      const p = this.hasNeighborSignal(x, y, z) || this.hasNeighborSignal(x, y + 1, z), m = blockMeta(v);
      if (p && !(m & DISP_TRIG)) { this.schedule(x, y, z, 4); this.h.setState(x, y, z, makeBlock(id, m | DISP_TRIG)); }
      else if (!p && m & DISP_TRIG) this.h.setState(x, y, z, makeBlock(id, m & ~DISP_TRIG));
      return;
    }
  }

  blockChanged(x: number, y: number, z: number, old: number, v: number): void {
    const oid = blockId(old), nid = blockId(v);
    if (oid === nid && oid !== B.REDSTONE_WIRE && !isRedstoneId(oid)) { this.updateNeighbors(x, y, z); return; }
    if (oid === B.REDSTONE_WIRE || nid === B.REDSTONE_WIRE) {
      this.updateNeighbors(x, y, z);
      const starts: [number, number, number][] = [];
      if (nid === B.REDSTONE_WIRE) starts.push([x, y, z]);
      for (let dy = -1; dy <= 1; dy++) for (const d of [W, E, N, S]) {
        const [dx, , dz] = DIR6[d];
        if (isWire(this.g(x + dx, y + dy, z + dz))) starts.push([x + dx, y + dy, z + dz]);
      }
      if (starts.length) this.solveWires(starts);
      if (oid === B.REDSTONE_WIRE && nid !== B.REDSTONE_WIRE) for (const [dx, dy, dz] of DIR6) this.updateNeighbors(x + dx, y + dy, z + dz);
      return;
    }
    this.updateNeighbors(x, y, z);
    if (isTorch(oid) || isTorch(nid)) this.torchUpdates(x, y, z);
    if (oid === B.LEVER && blockMeta(old) & LEVER_ON || isButton(oid) && blockMeta(old) & LEVER_ON) this.updateNeighborsAttach(x, y, z, blockMeta(old));
    if (isPlate(oid) && blockMeta(old) & PLATE_ON) this.updateNeighbors(x, y - 1, z);
    if (isDiode(oid)) this.frontUpdates(x, y, z, diodeOut(old));
    if (oid === B.COMPARATOR && nid !== B.COMPARATOR) this.compOut.delete(key(x, y, z));
    if (isDiode(nid)) { this.frontUpdates(x, y, z, diodeOut(v)); this.diodeCheck(x, y, z, v); }
    if (isTorch(nid)) this.neighborChanged(x, y, z);
    if (isLamp(nid)) this.neighborChanged(x, y, z);
    if (nid === B.OAK_DOOR) this.doorCheck(x, y, z, v);
    if (isPiston(nid) || nid === B.HOPPER || nid === B.DROPPER || nid === B.DISPENSER) this.neighborChanged(x, y, z);
    if (oid === B.PISTON_HEAD && nid !== B.PISTON_HEAD) {
      const f = blockMeta(old) & 7, [dx, dy, dz] = DIR6[opp(f)];
      const bv = this.g(x + dx, y + dy, z + dz);
      if (isPiston(blockId(bv)) && (blockMeta(bv) & 7) === f && blockMeta(bv) & PISTON_EXT) this.h.breakBlock(x + dx, y + dy, z + dz);
    }
    if (isPiston(oid) && blockMeta(old) & PISTON_EXT && !isPiston(nid)) {
      const f = blockMeta(old) & 7, [dx, dy, dz] = DIR6[f];
      const hv = this.g(x + dx, y + dy, z + dz);
      if (blockId(hv) === B.PISTON_HEAD && (blockMeta(hv) & 7) === f) { this.h.setState(x + dx, y + dy, z + dz, 0); this.updateNeighbors(x + dx, y + dy, z + dz); }
    }
    if (isAnalogSource(oid) || isAnalogSource(nid)) this.containerChanged(x, y, z);
  }

  containerChanged(x: number, y: number, z: number): void {
    for (const d of [N, E, S, W]) {
      const [dx, , dz] = DIR6[d];
      const v = this.g(x + dx, y, z + dz);
      if (blockId(v) === B.COMPARATOR) this.neighborChanged(x + dx, y, z + dz);
      else if (isConductor(v)) { const v2 = this.g(x + 2 * dx, y, z + 2 * dz); if (blockId(v2) === B.COMPARATOR && diodeOut(v2) === opp(d)) this.neighborChanged(x + 2 * dx, y, z + 2 * dz); }
    }
  }

  private torchUpdates(x: number, y: number, z: number): void {
    for (const d of NEIGHBOR_TORCH_ORDER) { const [dx, dy, dz] = DIR6[d]; this.updateNeighbors(x + dx, y + dy, z + dz); }
  }

  private updateNeighborsAttach(x: number, y: number, z: number, meta: number): void {
    const o = attachOut(meta & 7);
    const [dx, dy, dz] = DIR6[opp(o)];
    this.updateNeighbors(x, y, z);
    this.updateNeighbors(x + dx, y + dy, z + dz);
  }

  private frontUpdates(x: number, y: number, z: number, out: number): void {
    const [dx, dy, dz] = DIR6[out];
    this.neighborChanged(x + dx, y + dy, z + dz);
    this.updateNeighbors(x + dx, y + dy, z + dz, opp(out));
  }

  blockSignal(x: number, y: number, z: number, d: number): number {
    const v = this.g(x, y, z), id = blockId(v), m = blockMeta(v);
    switch (id) {
      case B.REDSTONE_WIRE: {
        if (!this.wiresSignal || d === D) return 0;
        const p = m & 15;
        if (!p) return 0;
        if (d === U) return p;
        return wireConnected(wireShape((a, b, c) => this.g(a, b, c), x, y, z), opp(d)) ? p : 0;
      }
      case B.REDSTONE_TORCH: return attachOut(m & 7) === d ? 0 : 15;
      case B.LEVER: case B.STONE_BUTTON: case B.OAK_BUTTON: return m & LEVER_ON ? 15 : 0;
      case B.STONE_PRESSURE_PLATE: case B.OAK_PRESSURE_PLATE: return m & PLATE_ON ? 15 : 0;
      case B.REDSTONE_BLOCK: return 15;
      case B.REPEATER: return m & REP_POWERED && d === opp(diodeOut(v)) ? 15 : 0;
      case B.COMPARATOR: return d === opp(diodeOut(v)) ? this.compOut.get(key(x, y, z)) ?? 0 : 0;
      case B.OBSERVER: return m & OBS_ON && d === (m & 7) ? 15 : 0;
      default: return 0;
    }
  }

  directSignal(x: number, y: number, z: number, d: number): number {
    const v = this.g(x, y, z), id = blockId(v), m = blockMeta(v);
    switch (id) {
      case B.REDSTONE_WIRE: case B.REPEATER: case B.COMPARATOR: case B.OBSERVER: return this.blockSignal(x, y, z, d);
      case B.REDSTONE_TORCH: return d === D ? this.blockSignal(x, y, z, d) : 0;
      case B.LEVER: case B.STONE_BUTTON: case B.OAK_BUTTON: return m & LEVER_ON && attachOut(m & 7) === d ? 15 : 0;
      case B.STONE_PRESSURE_PLATE: case B.OAK_PRESSURE_PLATE: return m & PLATE_ON && d === U ? 15 : 0;
      default: return 0;
    }
  }

  directSignalTo(x: number, y: number, z: number): number {
    let best = 0;
    for (let d = 0; d < 6 && best < 15; d++) { const [dx, dy, dz] = DIR6[d]; best = Math.max(best, this.directSignal(x + dx, y + dy, z + dz, d)); }
    return best;
  }

  signal(x: number, y: number, z: number, d: number): number {
    return isConductor(this.g(x, y, z)) ? this.directSignalTo(x, y, z) : this.blockSignal(x, y, z, d);
  }

  bestNeighborSignal(x: number, y: number, z: number): number {
    let best = 0;
    for (let d = 0; d < 6 && best < 15; d++) { const [dx, dy, dz] = DIR6[d]; best = Math.max(best, this.signal(x + dx, y + dy, z + dz, d)); }
    return best;
  }

  hasNeighborSignal(x: number, y: number, z: number): boolean {
    for (let d = 0; d < 6; d++) { const [dx, dy, dz] = DIR6[d]; if (this.signal(x + dx, y + dy, z + dz, d) > 0) return true; }
    return false;
  }

  private torchPowered(x: number, y: number, z: number, v: number): boolean {
    const toAttach = opp(attachOut(blockMeta(v) & 7));
    const [dx, dy, dz] = DIR6[toAttach];
    return this.signal(x + dx, y + dy, z + dz, toAttach) > 0;
  }

  private toggledTooOften(x: number, y: number, z: number, add: boolean): boolean {
    const k = key(x, y, z), now = this.h.tick();
    let a = this.toggles.get(k);
    if (!a) { if (!add) return false; this.toggles.set(k, (a = [])); }
    while (a.length && a[0] < now - 60) a.shift();
    if (add) a.push(now);
    if (!a.length) this.toggles.delete(k);
    return a.length >= 8;
  }

  private onTick(x: number, y: number, z: number, v: number): void {
    const id = blockId(v), m = blockMeta(v);
    if (isTorch(id)) {
      const powered = this.torchPowered(x, y, z, v);
      if (id === B.REDSTONE_TORCH) {
        if (powered) {
          this.h.setState(x, y, z, makeBlock(B.UNLIT_REDSTONE_TORCH, m));
          this.torchUpdates(x, y, z);
          if (this.toggledTooOften(x, y, z, true)) { this.h.smoke(x, y, z); this.h.sound('redstone.burnout', x, y, z); this.schedule(x, y, z, 160); }
        }
      } else if (!powered && !this.toggledTooOften(x, y, z, false)) {
        this.h.setState(x, y, z, makeBlock(B.REDSTONE_TORCH, m));
        this.torchUpdates(x, y, z);
      }
      return;
    }
    if (isButton(id)) {
      if (m & LEVER_ON) { this.h.setState(x, y, z, makeBlock(id, m & ~LEVER_ON)); this.h.sound('button.off', x, y, z); this.updateNeighborsAttach(x, y, z, m); }
      return;
    }
    if (isPlate(id)) {
      if (!(m & PLATE_ON)) return;
      if (this.h.plateHasEntity(x, y, z, id === B.OAK_PRESSURE_PLATE)) { this.schedule(x, y, z, 20); return; }
      this.h.setState(x, y, z, makeBlock(id, m & ~PLATE_ON));
      this.h.sound('plate.off', x, y, z);
      this.updateNeighbors(x, y, z); this.updateNeighbors(x, y - 1, z);
      return;
    }
    if (isLamp(id)) {
      if (id === B.REDSTONE_LAMP_LIT && !this.hasNeighborSignal(x, y, z)) this.h.setState(x, y, z, B.REDSTONE_LAMP);
      return;
    }
    if (id === B.REPEATER) {
      if (m & REP_LOCKED) return;
      const powered = !!(m & REP_POWERED), should = this.diodeInput(x, y, z, v) > 0;
      if (powered && !should) { this.h.setState(x, y, z, makeBlock(id, m & ~REP_POWERED)); this.frontUpdates(x, y, z, diodeOut(v)); }
      else if (!powered) {
        this.h.setState(x, y, z, makeBlock(id, m | REP_POWERED));
        this.frontUpdates(x, y, z, diodeOut(v));
        if (!should) this.schedule(x, y, z, repeaterDelay(v) * 2, -2);
      }
      return;
    }
    if (id === B.COMPARATOR) { this.refreshComparator(x, y, z, v); return; }
    if (id === B.OBSERVER) {
      const out = opp(m & 7);
      if (m & OBS_ON) this.h.setState(x, y, z, makeBlock(id, m & ~OBS_ON));
      else { this.h.setState(x, y, z, makeBlock(id, m | OBS_ON)); this.schedule(x, y, z, 2); }
      this.frontUpdates(x, y, z, out);
      return;
    }
    if (id === B.DROPPER || id === B.DISPENSER) { this.h.dispense(x, y, z, v, m & 7); return; }
  }

  observe(x: number, y: number, z: number): void {
    for (let d = 0; d < 6; d++) {
      const [dx, dy, dz] = DIR6[d];
      const nx = x + dx, ny = y + dy, nz = z + dz;
      const v = this.g(nx, ny, nz);
      if (blockId(v) !== B.OBSERVER || (blockMeta(v) & 7) !== opp(d)) continue;
      if (!(blockMeta(v) & OBS_ON) && !this.hasScheduled(nx, ny, nz)) this.schedule(nx, ny, nz, 2);
    }
  }

  private events: { x: number; y: number; z: number; type: number }[] = [];
  private eventKeys = new Set<string>();
  private moving: { x: number; y: number; z: number; v: number; due: number }[] = [];

  private pistonSignal(x: number, y: number, z: number, facing: number): boolean {
    for (let d = 0; d < 6; d++) {
      if (d === facing) continue;
      const [dx, dy, dz] = DIR6[d];
      if (this.signal(x + dx, y + dy, z + dz, d) > 0) return true;
    }
    for (let d = 0; d < 6; d++) {
      if (d === D) continue;
      const [dx, dy, dz] = DIR6[d];
      if (this.signal(x + dx, y + 1 + dy, z + dz, d) > 0) return true;
    }
    return false;
  }

  private pistonCheck(x: number, y: number, z: number, v: number): void {
    const m = blockMeta(v), f = m & 7, ext = !!(m & PISTON_EXT);
    const should = this.pistonSignal(x, y, z, f);
    const k = key(x, y, z);
    if (this.eventKeys.has(k)) return;
    if (should && !ext) { if (this.resolve(x, y, z, f)) { this.events.push({ x, y, z, type: 0 }); this.eventKeys.add(k); } }
    else if (!should && ext) { this.events.push({ x, y, z, type: 1 }); this.eventKeys.add(k); }
  }

  private resolve(x: number, y: number, z: number, f: number): { push: [number, number, number][]; destroy: [number, number, number] | null } | null {
    const [dx, dy, dz] = DIR6[f];
    const push: [number, number, number][] = [];
    let cx = x + dx, cy = y + dy, cz = z + dz;
    for (;;) {
      if (cy < 0 || cy >= 255) return null;
      if (!this.h.loaded(cx, cz)) return null;
      const r = pushReaction(this.g(cx, cy, cz));
      if (r === 'empty') return { push, destroy: null };
      if (r === 'destroy') return { push, destroy: [cx, cy, cz] };
      if (r === 'block') return null;
      push.push([cx, cy, cz]);
      if (push.length > 12) return null;
      cx += dx; cy += dy; cz += dz;
    }
  }

  tickBlockEvents(): void {
    let n = 0;
    while (this.events.length && n++ < 4096) {
      const e = this.events.shift()!;
      this.eventKeys.delete(key(e.x, e.y, e.z));
      const v = this.g(e.x, e.y, e.z);
      if (!isPiston(blockId(v))) continue;
      this.pistonEvent(e.x, e.y, e.z, v, e.type);
    }
  }

  private pistonEvent(x: number, y: number, z: number, v: number, type: number): void {
    const id = blockId(v), m = blockMeta(v), f = m & 7;
    const powered = this.pistonSignal(x, y, z, f);
    const [dx, dy, dz] = DIR6[f];
    if (type === 0) {
      if (!powered || m & PISTON_EXT) return;
      const r = this.resolve(x, y, z, f);
      if (!r) return;
      if (r.destroy) this.h.breakBlock(r.destroy[0], r.destroy[1], r.destroy[2]);
      const due = this.h.tick() + 2;
      const changed: [number, number, number][] = [];
      for (let i = r.push.length - 1; i >= 0; i--) {
        const [sx, sy, sz] = r.push[i];
        const bv = this.g(sx, sy, sz);
        this.h.setState(sx + dx, sy + dy, sz + dz, B.MOVING_PISTON);
        this.moving.push({ x: sx + dx, y: sy + dy, z: sz + dz, v: bv, due });
        changed.push([sx + dx, sy + dy, sz + dz]);
      }
      this.h.setState(x + dx, y + dy, z + dz, makeBlock(B.PISTON_HEAD, f | (id === B.STICKY_PISTON ? 8 : 0)));
      this.h.setState(x, y, z, makeBlock(id, m | PISTON_EXT));
      changed.push([x + dx, y + dy, z + dz], [x, y, z]);
      const n = r.push.length;
      const lo = [Math.min(x + dx, x + dx * (n + 1)), Math.min(y + dy, y + dy * (n + 1)), Math.min(z + dz, z + dz * (n + 1))];
      const hi = [Math.max(x + dx, x + dx * (n + 1)) + 1, Math.max(y + dy, y + dy * (n + 1)) + 1, Math.max(z + dz, z + dz * (n + 1)) + 1];
      this.h.pushEntities(lo[0], lo[1], lo[2], hi[0], hi[1], hi[2], dx, dy, dz);
      this.h.sound('piston.out', x, y, z);
      for (const [cx, cy, cz] of changed) this.updateNeighbors(cx, cy, cz);
      return;
    }
    if (powered) return;
    if (!(m & PISTON_EXT)) return;
    const hx = x + dx, hy = y + dy, hz = z + dz;
    if (blockId(this.g(hx, hy, hz)) === B.PISTON_HEAD) this.h.setState(hx, hy, hz, 0);
    this.h.setState(x, y, z, makeBlock(id, m & ~PISTON_EXT));
    if (id === B.STICKY_PISTON) {
      const sx = hx + dx, sy = hy + dy, sz = hz + dz;
      const sv = this.g(sx, sy, sz);
      if (pushReaction(sv) === 'normal') {
        this.h.setState(sx, sy, sz, 0);
        this.h.setState(hx, hy, hz, B.MOVING_PISTON);
        this.moving.push({ x: hx, y: hy, z: hz, v: sv, due: this.h.tick() + 2 });
        this.updateNeighbors(sx, sy, sz);
      }
    }
    this.h.sound('piston.in', x, y, z);
    this.updateNeighbors(hx, hy, hz);
    this.updateNeighbors(x, y, z);
  }

  arrivals: (x: number, y: number, z: number, v: number) => void = () => {};
  onHopper: (x: number, y: number, z: number) => void = () => {};

  tickMoving(): void {
    if (!this.moving.length) return;
    const now = this.h.tick();
    const keep: typeof this.moving = [];
    const done: typeof this.moving = [];
    for (const mv of this.moving) (mv.due <= now ? done : keep).push(mv);
    this.moving = keep;
    for (const mv of done) {
      if (blockId(this.g(mv.x, mv.y, mv.z)) !== B.MOVING_PISTON) continue;
      this.arrivals(mv.x, mv.y, mv.z, mv.v);
      if (blockId(mv.v) === B.OBSERVER && !(blockMeta(mv.v) & OBS_ON)) this.schedule(mv.x, mv.y, mv.z, 2);
    }
  }

  get movingCount(): number { return this.moving.length; }

  private diodeInput(x: number, y: number, z: number, v: number): number {
    const back = opp(diodeOut(v));
    const [dx, dy, dz] = DIR6[back];
    const bx = x + dx, by = y + dy, bz = z + dz;
    let i = this.signal(bx, by, bz, back);
    const bv = this.g(bx, by, bz);
    if (i < 15 && isWire(bv)) i = Math.max(i, blockMeta(bv) & 15);
    if (blockId(v) === B.COMPARATOR) {
      const a = this.analogAt(bx, by, bz);
      if (a >= 0) i = a;
      else if (i < 15 && isConductor(bv)) { const a2 = this.analogAt(bx + dx, by + dy, bz + dz); if (a2 >= 0) i = a2; }
    }
    return i;
  }

  private analogAt(x: number, y: number, z: number): number {
    const id = blockId(this.g(x, y, z));
    if (!isAnalogSource(id)) return -1;
    const items = this.h.container(x, y, z);
    return items ? analogOf(items) : 0;
  }

  private sideInput(x: number, y: number, z: number, v: number, diodesOnly: boolean): number {
    const out = diodeOut(v);
    let best = 0;
    for (const s of out === N || out === S ? [W, E] : [N, S]) {
      const [dx, dy, dz] = DIR6[s];
      const nv = this.g(x + dx, y + dy, z + dz), nid = blockId(nv);
      if (diodesOnly ? !isDiode(nid) : !isSignalSource(nid)) continue;
      const p = nid === B.REDSTONE_BLOCK ? 15 : nid === B.REDSTONE_WIRE ? blockMeta(nv) & 15 : this.directSignal(x + dx, y + dy, z + dz, s);
      best = Math.max(best, p);
    }
    return best;
  }

  private repeaterLockCheck(x: number, y: number, z: number, v: number): void {
    const locked = this.sideInput(x, y, z, v, true) > 0;
    const m = blockMeta(v);
    if (locked !== !!(m & REP_LOCKED)) this.h.setState(x, y, z, makeBlock(B.REPEATER, locked ? m | REP_LOCKED : m & ~REP_LOCKED));
  }

  private compOutput(x: number, y: number, z: number, v: number): number {
    const i = this.diodeInput(x, y, z, v);
    if (i === 0) return 0;
    const j = this.sideInput(x, y, z, v, false);
    if (j > i) return 0;
    return blockMeta(v) & CMP_SUB ? i - j : i;
  }

  private shouldTurnOn(x: number, y: number, z: number, v: number): boolean {
    const i = this.diodeInput(x, y, z, v);
    if (blockId(v) === B.REPEATER) return i > 0;
    if (i === 0) return false;
    const j = this.sideInput(x, y, z, v, false);
    return i > j || (i === j && !(blockMeta(v) & CMP_SUB));
  }

  private prioritized(x: number, y: number, z: number, v: number): boolean {
    const out = diodeOut(v);
    const [dx, dy, dz] = DIR6[out];
    const f = this.g(x + dx, y + dy, z + dz);
    return isDiode(blockId(f)) && diodeOut(f) !== opp(out);
  }

  private diodeCheck(x: number, y: number, z: number, v: number): void {
    const id = blockId(v), m = blockMeta(v);
    if (id === B.REPEATER) {
      if (m & REP_LOCKED) return;
      const powered = !!(m & REP_POWERED);
      if (powered !== this.shouldTurnOn(x, y, z, v) && !this.hasScheduled(x, y, z)) {
        this.schedule(x, y, z, repeaterDelay(v) * 2, this.prioritized(x, y, z, v) ? -3 : powered ? -2 : -1);
      }
      return;
    }
    if (this.hasScheduled(x, y, z)) return;
    const out = this.compOutput(x, y, z, v);
    const stored = this.compOut.get(key(x, y, z)) ?? 0;
    if (out !== stored || !!(m & CMP_POWERED) !== this.shouldTurnOn(x, y, z, v)) this.schedule(x, y, z, 2, this.prioritized(x, y, z, v) ? -1 : 0);
  }

  private refreshComparator(x: number, y: number, z: number, v: number): void {
    const k = key(x, y, z);
    const out = this.compOutput(x, y, z, v);
    const old = this.compOut.get(k) ?? 0;
    if (out) this.compOut.set(k, out); else this.compOut.delete(k);
    const m = blockMeta(v);
    if (old !== out || !(m & CMP_SUB)) {
      const should = this.shouldTurnOn(x, y, z, v), powered = !!(m & CMP_POWERED);
      if (powered && !should) this.h.setState(x, y, z, makeBlock(B.COMPARATOR, m & ~CMP_POWERED));
      else if (!powered && should) this.h.setState(x, y, z, makeBlock(B.COMPARATOR, m | CMP_POWERED));
      this.frontUpdates(x, y, z, diodeOut(v));
    }
  }

  private doorCheck(x: number, y: number, z: number, v: number): void {
    const m = blockMeta(v);
    const by = m & DOOR_UPPER ? y - 1 : y;
    const lower = this.g(x, by, z), upper = this.g(x, by + 1, z);
    if (blockId(lower) !== B.OAK_DOOR || blockId(upper) !== B.OAK_DOOR) return;
    const powered = this.hasNeighborSignal(x, by, z) || this.hasNeighborSignal(x, by + 1, z);
    if (powered === !!(blockMeta(lower) & DOOR_POWERED)) return;
    const open = !!(blockMeta(lower) & DOOR_OPEN);
    for (const [yy, dv] of [[by, lower], [by + 1, upper]] as const) {
      let nm = blockMeta(dv);
      nm = powered ? nm | DOOR_POWERED : nm & ~DOOR_POWERED;
      nm = powered ? nm | DOOR_OPEN : nm & ~DOOR_OPEN;
      this.h.setState(x, yy, z, makeBlock(B.OAK_DOOR, nm));
    }
    if (open !== powered) this.h.sound(powered ? 'door.open' : 'door.close', x, by, z);
  }

  private wireSource(x: number, y: number, z: number): number {
    this.wiresSignal = false;
    const s = this.bestNeighborSignal(x, y, z);
    this.wiresSignal = true;
    return s;
  }

  solveWires(starts: [number, number, number][]): void {
    const get: Getter = (a, b, c) => this.g(a, b, c);
    const net = new Map<string, [number, number, number]>();
    const q: [number, number, number][] = [];
    for (const p of starts) { const k = key(p[0], p[1], p[2]); if (!net.has(k) && isWire(this.g(p[0], p[1], p[2]))) { net.set(k, p); q.push(p); } }
    while (q.length) {
      const [x, y, z] = q.pop()!;
      wireLinks(get, x, y, z, this.links);
      for (const n of this.links) {
        const k = key(n[0], n[1], n[2]);
        if (net.has(k) || !this.h.loaded(n[0], n[2])) continue;
        net.set(k, [n[0], n[1], n[2]]);
        q.push([n[0], n[1], n[2]]);
        if (net.size > 20000) break;
      }
    }
    if (!net.size) return;
    const pow = new Map<string, number>();
    const buckets: string[][] = Array.from({ length: 16 }, () => []);
    for (const [k, [x, y, z]] of net) { const s = this.wireSource(x, y, z); pow.set(k, s); if (s > 0) buckets[s].push(k); }
    for (let lv = 15; lv >= 2; lv--) {
      for (const k of buckets[lv]) {
        if (pow.get(k) !== lv) continue;
        const [x, y, z] = net.get(k)!;
        wireLinks(get, x, y, z, this.links);
        for (const n of this.links) {
          const nk = key(n[0], n[1], n[2]);
          const cur = pow.get(nk);
          if (cur === undefined || cur >= lv - 1) continue;
          pow.set(nk, lv - 1);
          buckets[lv - 1].push(nk);
        }
      }
    }
    const changed: { k: string; p: [number, number, number]; old: number; now: number }[] = [];
    for (const [k, p] of net) {
      const v = this.g(p[0], p[1], p[2]);
      const old = blockMeta(v) & 15, now = pow.get(k)!;
      if (old !== now) changed.push({ k, p, old, now });
    }
    if (!changed.length) return;
    changed.sort((a, b) => Math.max(b.now, b.old) - Math.max(a.now, a.old));
    for (const c of changed) this.h.setState(c.p[0], c.p[1], c.p[2], makeBlock(B.REDSTONE_WIRE, c.now));
    const prev = this.solving;
    this.solving = new Set(net.keys());
    try {
      const done = new Set<string>();
      const upd = (x: number, y: number, z: number) => { const k = key(x, y, z); if (done.has(k)) return; done.add(k); this.updateNeighbors(x, y, z); };
      for (const c of changed) {
        const [x, y, z] = c.p;
        upd(x, y, z);
        for (const [dx, dy, dz] of DIR6) upd(x + dx, y + dy, z + dz);
      }
    } finally { this.solving = prev; }
  }

  use(x: number, y: number, z: number, v: number): boolean {
    const id = blockId(v), m = blockMeta(v);
    if (id === B.LEVER) {
      const nm = m ^ LEVER_ON;
      this.h.setState(x, y, z, makeBlock(id, nm));
      this.h.sound(nm & LEVER_ON ? 'lever.on' : 'lever.off', x, y, z);
      this.updateNeighborsAttach(x, y, z, nm);
      return true;
    }
    if (isButton(id)) {
      if (m & LEVER_ON) return true;
      this.h.setState(x, y, z, makeBlock(id, m | LEVER_ON));
      this.h.sound('button.on', x, y, z);
      this.updateNeighborsAttach(x, y, z, m);
      this.schedule(x, y, z, id === B.OAK_BUTTON ? 30 : 20);
      return true;
    }
    if (id === B.REPEATER) {
      const d = ((m >> 2) & 3) + 1 & 3;
      this.h.setState(x, y, z, makeBlock(id, (m & ~12) | (d << 2)));
      this.h.sound('click', x, y, z);
      return true;
    }
    if (id === B.COMPARATOR) {
      const nm = m ^ CMP_SUB;
      this.h.setState(x, y, z, makeBlock(id, nm));
      this.h.sound('click', x, y, z);
      this.refreshComparator(x, y, z, makeBlock(id, nm));
      return true;
    }
    return false;
  }

  pressPlate(x: number, y: number, z: number): void {
    const v = this.g(x, y, z), id = blockId(v), m = blockMeta(v);
    if (!isPlate(id) || m & PLATE_ON) return;
    this.h.setState(x, y, z, makeBlock(id, m | PLATE_ON));
    this.h.sound('plate.on', x, y, z);
    this.updateNeighbors(x, y, z); this.updateNeighbors(x, y - 1, z);
    this.schedule(x, y, z, 20);
  }

  revalidateChunk(blocks: Uint16Array, cx: number, cz: number): void {
    const wires: [number, number, number][] = [];
    for (let i = 0; i < blocks.length; i++) {
      const id = blocks[i] & 0xff;
      if (id === B.MOVING_PISTON && !this.moving.some((mv) => mv.x === cx * 16 + (i & 15) && mv.y === Math.floor(i / 256) && mv.z === cz * 16 + ((i >> 4) & 15))) { this.h.setState(cx * 16 + (i & 15), Math.floor(i / 256), cz * 16 + ((i >> 4) & 15), 0); continue; }
      if (!isRedstoneId(id) && id !== B.OAK_DOOR) continue;
      const y = Math.floor(i / 256), z = cz * 16 + ((i >> 4) & 15), x = cx * 16 + (i & 15);
      const v = blocks[i], m = v >>> 8;
      if (id === B.REDSTONE_WIRE) wires.push([x, y, z]);
      else if ((isButton(id) && m & LEVER_ON) || (isPlate(id) && m & PLATE_ON) || (id === B.OBSERVER && m & OBS_ON)) this.schedule(x, y, z, 1);
      else if (isTorch(id) || isDiode(id) || isLamp(id) || isPiston(id) || id === B.DROPPER || id === B.DISPENSER || id === B.HOPPER) this.neighborChanged(x, y, z);
      if (id === B.HOPPER) this.onHopper(x, y, z);
    }
    if (wires.length) this.solveWires(wires);
  }
}

function sameFamily(a: number, b: number): boolean {
  if (a === b) return true;
  if (isTorch(a) && isTorch(b)) return true;
  if (isLamp(a) && isLamp(b)) return true;
  return false;
}

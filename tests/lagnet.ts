import { WorldSim, WorldStore, newPlayer, MF } from '../src/core/sim/WorldSim';
import { WorldGenerator } from '../src/core/worldgen/WorldGenerator';
import { ChunkData } from '../src/core/chunk';
import { B } from '../src/core/blocks';
import { LocalPlayer as Player } from '../src/game/Player';
import { InputState } from '../src/controls/InputState';

export interface Net {
  lat: number;
  jitter: number;
  spikes?: { every: number; min: number; max: number };
  serverStalls?: { every: number; min: number; max: number };
  seed?: number;
  legacy?: boolean;
  skew?: number;
  speedup?: number;
}

function rng(seed: number) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function lagWorld(build?: (store: WorldStore) => void) {
  const chunks = new Map<string, ChunkData>();
  const get = (cx: number, cz: number) => { const k = `${cx},${cz}`; let c = chunks.get(k); if (!c) { c = new ChunkData(cx, cz, new Uint32Array(16 * 16 * 160)); chunks.set(k, c); } return c; };
  const store: WorldStore = { getBlock: (x, y, z) => get(x >> 4, z >> 4).get(x & 15, y, z & 15), setBlock: (x, y, z, v) => get(x >> 4, z >> 4).set(x & 15, y, z & 15, v), isLoaded: () => true, raw: (cx, cz) => get(cx, cz).blocks };
  for (let x = -400; x <= 400; x++) for (let z = -400; z <= 400; z++) store.setBlock(x, 9, z, B.STONE);
  build?.(store);
  const events: { e: string; [k: string]: unknown }[] = [];
  const sim = new WorldSim({ seed: 5, store, gen: new WorldGenerator(5), difficulty: 'peaceful', emit: (e) => events.push(e as never), validateMoves: true, authoritative: true, spawn: { x: 0, y: 10, z: 0 } });
  return { sim, store, events };
}

type Act = { t: number; kind: 'mv'; p: number[] } | { t: number; kind: 'dig'; a: 'start' | 'done'; x: number; y: number; z: number };

export function playLagged(net: Net, seconds: number, input: (i: InputState, t: number, pl: Player) => Act[] | void, opts: { build?: (s: WorldStore) => void; start?: [number, number, number]; yaw?: number; setup?: (p: ReturnType<typeof newPlayer>) => void } = {}) {
  const w = lagWorld(opts.build);
  const r = rng(net.seed ?? 1);
  const [sx, sy, sz] = opts.start ?? [0.5, 10, 0.5];
  const p = newPlayer('a', 'A', 'survival', { x: sx, y: sy, z: sz });
  w.sim.setNow(1000);
  w.sim.addPlayer(p); p.x = sx; p.y = sy; p.z = sz;
  opts.setup?.(p);
  w.sim.wardReset(p, 0); p.ward!.grace = 0;
  const pl = new Player(); pl.setPos(p.x, p.y, p.z); pl.yaw = opts.yaw ?? 0;
  const reader = { getBlock: (x: number, y: number, z: number) => w.store.getBlock(x, y, z), isLoaded: () => true };
  const inp = new InputState();
  const spikes: [number, number][] = [], stalls: [number, number][] = [];
  const mk = (cfg: Net['spikes'], out: [number, number][]) => { if (!cfg) return; for (let t = 1500 + r() * cfg.every; t < seconds * 1000 + 2000; t += cfg.every * (0.6 + r() * 0.8)) out.push([1000 + t, 1000 + t + cfg.min + r() * (cfg.max - cfg.min)]); };
  mk(net.spikes, spikes); mk(net.serverStalls, stalls);
  const queue: { arrive: number; act: Act }[] = [];
  const toClient: { arrive: number; x: number; y: number; z: number }[] = [];
  let lastArrive = 0, lastSent = -1e9, lastKey = '', nextTick = 1050, seen = 0, setbacks = 0;
  const send = (now: number, act: Act) => {
    let a = now + net.lat + (r() * 2 - 1) * net.jitter;
    for (const [s, e] of spikes) if (now >= s && now < e) a = Math.max(a, e + net.lat);
    a = Math.max(a, lastArrive);
    for (const [s, e] of stalls) if (a >= s && a < e) a = e;
    lastArrive = a;
    queue.push({ arrive: a, act });
  };
  const frame = 1000 / 60;
  for (let now = 1000; now < 1000 + seconds * 1000; now += frame) {
    const extra = input(inp, now - 1000, pl) ?? [];
    pl.update((frame / 1000) * (net.speedup ?? 1), inp, reader, 'survival', false);
    const state = [pl.body.x, pl.body.y, pl.body.z, pl.yaw, pl.pitch, pl.flags()].map((n, i) => i === 5 ? n : Math.round(n * 1000) / 1000);
    for (const a of extra) { send(now, { t: now, kind: 'mv', p: state }); lastSent = now; send(now, { ...a, t: now }); }
    if (now - lastSent > 100) {
      const key = state.map((n) => Math.round(n * 100)).join(',');
      if (key !== lastKey || now - lastSent > 1000) { send(now, { t: now, kind: 'mv', p: state }); lastKey = key; lastSent = now; }
    }
    while (true) {
      const qi = queue.length ? queue[0].arrive : Infinity;
      if (Math.min(qi, nextTick) > now) break;
      if (nextTick <= qi) { w.sim.setNow(nextTick); w.sim.tick(); nextTick += 50; continue; }
      const m = queue.shift()!;
      w.sim.setNow(m.arrive);
      if (m.act.kind === 'mv') w.sim.move(p, m.act.p[0], m.act.p[1], m.act.p[2], m.act.p[3], m.act.p[4], m.act.p[5], net.legacy ? undefined : 50000 + (m.act.t - 1000) * (net.skew ?? 1));
      else if (m.act.a === 'start') w.sim.digStart(p, m.act.x, m.act.y, m.act.z);
      else w.sim.digFinish(p, m.act.x, m.act.y, m.act.z);
    }
    for (; seen < w.events.length; seen++) {
      const e = w.events[seen];
      if (e.e === 'tp' && e.p === p) { setbacks++; toClient.push({ arrive: now + net.lat, x: p.x, y: p.y, z: p.z }); }
      if (e.e === 'kick') setbacks += 1000;
    }
    while (toClient.length && toClient[0].arrive <= now) { const t = toClient.shift()!; pl.setPos(t.x, t.y, t.z); }
  }
  const byCheck: Record<string, number> = {};
  for (const f of w.sim.wardLog) byCheck[f.check] = (byCheck[f.check] ?? 0) + 1;
  const peak = Math.max(0, ...w.sim.wardLog.map((f) => f.vl));
  return { w, p, pl, setbacks, flags: w.sim.wardLog.length, byCheck, peak, kicked: w.events.some((e) => e.e === 'kick'), log: w.sim.wardLog };
}

export const NETS: Record<string, Net> = {
  clean: { lat: 30, jitter: 5 },
  wifi: { lat: 70, jitter: 60 },
  mobile: { lat: 120, jitter: 90, spikes: { every: 9000, min: 400, max: 1600 } },
  bad: { lat: 180, jitter: 120, spikes: { every: 5000, min: 600, max: 2500 } },
  serverHitch: { lat: 40, jitter: 15, serverStalls: { every: 8000, min: 300, max: 1200 } },
};

export const MF_ = MF;

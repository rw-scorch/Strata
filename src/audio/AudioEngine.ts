type Env = { a: number; d: number; v: number };

const MATERIAL: Record<string, { f: number; q: number; type: BiquadFilterType; dur: number; tone?: number }> = {
  stone: { f: 900, q: 1.2, type: 'bandpass', dur: 0.16 },
  wood: { f: 420, q: 2.5, type: 'bandpass', dur: 0.14, tone: 180 },
  grass: { f: 3200, q: 0.6, type: 'highpass', dur: 0.18 },
  dirt: { f: 700, q: 0.8, type: 'lowpass', dur: 0.15 },
  sand: { f: 2200, q: 0.5, type: 'bandpass', dur: 0.2 },
  gravel: { f: 1500, q: 0.9, type: 'bandpass', dur: 0.2 },
  glass: { f: 4500, q: 4, type: 'bandpass', dur: 0.3, tone: 2400 },
  snow: { f: 1800, q: 0.4, type: 'lowpass', dur: 0.2 },
  cloth: { f: 800, q: 0.5, type: 'lowpass', dur: 0.14 },
  metal: { f: 2600, q: 8, type: 'bandpass', dur: 0.25, tone: 1300 },
  water: { f: 600, q: 0.7, type: 'lowpass', dur: 0.3 },
  lava: { f: 300, q: 0.7, type: 'lowpass', dur: 0.4 },
};

const MOB_VOICE: Record<string, { base: number; kind: 'bleat' | 'grunt' | 'cluck' | 'groan' | 'rattle' | 'hiss' | 'hum' }> = {
  woolhorn: { base: 420, kind: 'bleat' }, mudsnout: { base: 140, kind: 'grunt' }, fernhen: { base: 1300, kind: 'cluck' },
  hollowed: { base: 95, kind: 'groan' }, rattlebone: { base: 0, kind: 'rattle' }, duskweaver: { base: 0, kind: 'hiss' }, villager: { base: 210, kind: 'hum' },
};

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private musicBus!: GainNode;
  private ambient!: GainNode;
  private lowpass!: BiquadFilterNode;
  private noise!: AudioBuffer;
  private reverb!: ConvolverNode;
  private rainNode: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private packBuffers = new Map<string, AudioBuffer[]>();
  private listener = { x: 0, y: 0, z: 0, yaw: 0 };
  private nextMusic = 30;
  private musicT = 0;
  volumes = { master: 0.8, music: 0.5, effects: 0.8, ambient: 0.6, muted: false };
  private unlocked = false;
  soundPhysics = true;
  cave = 0;
  occlusion: ((x: number, y: number, z: number) => number) | null = null;
  private room!: ConvolverNode;
  private roomGain!: GainNode;
  private curOcc = 0;

  unlock(): void {
    if (this.unlocked && this.ctx?.state === 'running') return;
    try {
      if (!this.ctx) this.init();
      void this.ctx!.resume();
      this.unlocked = true;
    } catch { /* audio unavailable */ }
  }

  private init(): void {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC({ latencyHint: 'interactive' });
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.lowpass = ctx.createBiquadFilter();
    this.lowpass.type = 'lowpass';
    this.lowpass.frequency.value = 20000;
    this.master.connect(this.lowpass).connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.connect(this.master);
    this.musicBus = ctx.createGain(); this.musicBus.connect(this.master);
    this.ambient = ctx.createGain(); this.ambient.connect(this.master);
    this.room = ctx.createConvolver();
    const rlen = Math.floor(ctx.sampleRate * 1.8);
    const rir = ctx.createBuffer(2, rlen, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = rir.getChannelData(ch); for (let i = 0; i < rlen; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / rlen, 3.2) * (i < 300 ? i / 300 : 1); }
    this.room.buffer = rir;
    this.roomGain = ctx.createGain();
    this.roomGain.gain.value = 0;
    this.room.connect(this.roomGain).connect(this.sfx);
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.reverb = ctx.createConvolver();
    const ir = ctx.createBuffer(2, ctx.sampleRate * 2.5, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const ch = ir.getChannelData(c);
      for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / ch.length, 2.6);
    }
    this.reverb.buffer = ir;
    const rv = ctx.createGain(); rv.gain.value = 0.55;
    this.reverb.connect(rv).connect(this.musicBus);
    this.applyVolumes();
    this.buildPending();
  }

  setVolumes(v: Partial<AudioEngine['volumes']>): void {
    Object.assign(this.volumes, v);
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const m = this.volumes.muted ? 0 : this.volumes.master;
    this.master.gain.value = m;
    this.sfx.gain.value = this.volumes.effects;
    this.musicBus.gain.value = this.volumes.music * 0.6;
    this.ambient.gain.value = this.volumes.ambient;
  }

  private pendingPack: Map<string, Uint8Array[]> | null = null;
  async setPackSounds(map: Map<string, Uint8Array[]>): Promise<number> {
    this.pendingPack = map;
    if (!this.ctx) return 0;
    return this.buildPending();
  }

  private async buildPending(): Promise<number> {
    if (!this.ctx || !this.pendingPack) return 0;
    const map = this.pendingPack;
    this.pendingPack = null;
    this.packBuffers.clear();
    let ok = 0;
    for (const [ev, list] of map) {
      const bufs: AudioBuffer[] = [];
      for (const b of list) {
        try { bufs.push(await this.ctx.decodeAudioData(b.slice().buffer)); ok++; } catch { /* format not supported by this browser */ }
      }
      if (bufs.length) this.packBuffers.set(ev, bufs);
    }
    return ok;
  }

  setListener(x: number, y: number, z: number, yaw: number): void {
    this.listener.x = x; this.listener.y = y; this.listener.z = z; this.listener.yaw = yaw;
  }

  setUnderwater(on: boolean): void {
    if (!this.ctx) return;
    this.lowpass.frequency.setTargetAtTime(on ? 700 : 20000, this.ctx.currentTime, 0.1);
  }

  private spatial(x?: number, y?: number, z?: number, range = 24): { gain: number; pan: number } {
    if (x === undefined || y === undefined || z === undefined) return { gain: 1, pan: 0 };
    const dx = x - this.listener.x, dy = y - this.listener.y, dz = z - this.listener.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist > range) return { gain: 0, pan: 0 };
    const gain = Math.max(0, 1 - dist / range) ** 1.3;
    const yaw = this.listener.yaw;
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const pan = dist > 0.5 ? Math.max(-1, Math.min(1, (dx * rx + dz * rz) / dist)) : 0;
    return { gain, pan };
  }

  setCave(c: number): void {
    this.cave = c;
    if (this.ctx && this.roomGain) this.roomGain.gain.setTargetAtTime(this.soundPhysics ? 0.12 + c * 0.55 : 0, this.ctx.currentTime, 0.4);
  }

  private out(gain: number, pan: number, bus?: AudioNode): AudioNode {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    const occ = this.soundPhysics && !bus ? this.curOcc : 0;
    g.gain.value = gain * Math.pow(0.78, occ);
    let tail: AudioNode = g;
    if (occ > 0) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = Math.max(350, 9000 * Math.pow(0.45, occ));
      g.connect(lp);
      tail = lp;
    }
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      tail.connect(p).connect(bus ?? this.sfx);
    } else tail.connect(bus ?? this.sfx);
    if (this.soundPhysics && !bus && this.room) {
      const send = ctx.createGain();
      send.gain.value = Math.min(1, 0.5 + occ * 0.15);
      tail.connect(send).connect(this.room);
    }
    return g;
  }

  private env(g: GainNode, t: number, e: Env): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, e.v), t + e.a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + e.a + e.d);
  }

  private noiseHit(dest: AudioNode, t: number, f: number, q: number, type: BiquadFilterType, e: Env, rate = 1): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = rate;
    const flt = ctx.createBiquadFilter();
    flt.type = type; flt.frequency.value = f; flt.Q.value = q;
    const g = ctx.createGain();
    this.env(g, t, e);
    src.connect(flt).connect(g).connect(dest);
    src.start(t, Math.random() * 1.5);
    src.stop(t + e.a + e.d + 0.05);
  }

  private tone(dest: AudioNode, t: number, f: number, type: OscillatorType, e: Env, slideTo?: number, vib?: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + e.a + e.d);
    if (vib) {
      const l = ctx.createOscillator(); const lg = ctx.createGain();
      l.frequency.value = vib; lg.gain.value = f * 0.06;
      l.connect(lg).connect(o.frequency);
      l.start(t); l.stop(t + e.a + e.d + 0.05);
    }
    const g = ctx.createGain();
    this.env(g, t, e);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + e.a + e.d + 0.05);
  }

  play(name: string, x?: number, y?: number, z?: number, vol = 1, pitch = 1): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || this.volumes.muted) return;
    const { gain, pan } = this.spatial(x, y, z, name.startsWith('mob.') || name === 'thunder' ? 40 : 24);
    if (gain <= 0.01) return;
    this.curOcc = this.soundPhysics && this.occlusion && x !== undefined && y !== undefined && z !== undefined && name !== 'thunder' ? Math.min(4, this.occlusion(x, y, z)) : 0;
    const t = ctx.currentTime + 0.005;
    const [cat, sub] = name.split('.');
    const packKey = cat === 'dig' ? `break.${sub}` : name;
    const pb = this.packBuffers.get(packKey);
    if (pb && (cat === 'break' || cat === 'place' || cat === 'step' || cat === 'dig' || cat === 'item' || cat === 'player')) {
      const s = ctx.createBufferSource();
      s.buffer = pb[Math.floor(Math.random() * pb.length)];
      s.playbackRate.value = pitch * (0.9 + Math.random() * 0.2) * (cat === 'dig' ? 1.3 : 1);
      s.connect(this.out(gain * vol * (cat === 'step' ? 0.35 : cat === 'dig' ? 0.4 : 0.9), pan));
      s.start(t);
      return;
    }
    const dest = this.out(gain * vol, pan);
    const rnd = () => 0.9 + Math.random() * 0.2;
    switch (cat) {
      case 'break': case 'place': case 'dig': case 'step': {
        const m = MATERIAL[sub] ?? MATERIAL.stone;
        const v = cat === 'step' ? 0.13 : cat === 'dig' ? 0.22 : cat === 'place' ? 0.4 : 0.55;
        const dur = m.dur * (cat === 'step' ? 0.6 : cat === 'break' ? 1.3 : 0.8);
        this.noiseHit(dest, t, m.f * rnd() * pitch * (cat === 'place' ? 0.8 : 1), m.q, m.type, { a: 0.004, d: dur, v });
        if (cat === 'break') this.noiseHit(dest, t + 0.03, m.f * 0.6 * rnd(), m.q, m.type, { a: 0.004, d: dur * 0.8, v: v * 0.6 });
        if (m.tone && cat !== 'step') this.tone(dest, t, m.tone * rnd(), sub === 'glass' ? 'triangle' : 'sine', { a: 0.002, d: dur * (sub === 'glass' ? 2 : 0.6), v: v * 0.5 }, sub === 'glass' ? m.tone * 0.7 : undefined);
        if (sub === 'glass' && cat === 'break') for (let i = 0; i < 4; i++) this.tone(dest, t + 0.02 * i, 3000 + Math.random() * 2500, 'sine', { a: 0.001, d: 0.15, v: 0.08 });
        break;
      }
      case 'player':
        if (sub === 'hurt') { this.noiseHit(dest, t, 400, 1, 'lowpass', { a: 0.005, d: 0.15, v: 0.5 }); this.tone(dest, t, 220, 'square', { a: 0.005, d: 0.12, v: 0.12 }, 120); }
        else if (sub === 'levelup') [523, 659, 784, 1047].forEach((f, i) => this.tone(dest, t + i * 0.09, f, 'triangle', { a: 0.01, d: 0.4, v: 0.18 }));
        else if (sub === 'xp') this.tone(dest, t, 1400 + Math.random() * 600, 'sine', { a: 0.003, d: 0.12, v: 0.12 });
        else if (sub === 'burp') { this.tone(dest, t, 160, 'sawtooth', { a: 0.02, d: 0.25, v: 0.12 }, 90, 22); }
        else if (sub === 'eat') this.noiseHit(dest, t, 1800 * rnd(), 1.5, 'bandpass', { a: 0.003, d: 0.08, v: 0.3 });
        else if (sub === 'fall') this.noiseHit(dest, t, 250, 0.8, 'lowpass', { a: 0.003, d: 0.2, v: 0.5 });
        else if (sub === 'sweep') this.noiseHit(dest, t, 2200, 0.7, 'bandpass', { a: 0.02, d: 0.22, v: 0.35 }, 0.6);
        break;
      case 'item':
        if (sub === 'pickup') this.tone(dest, t, 700 * rnd(), 'sine', { a: 0.002, d: 0.08, v: 0.22 }, 1400);
        break;
      case 'ui':
        if (sub === 'click') this.tone(dest, t, 900, 'square', { a: 0.001, d: 0.04, v: 0.06 });
        else if (sub === 'craft') { this.noiseHit(dest, t, 2500, 0.8, 'bandpass', { a: 0.01, d: 0.12, v: 0.2 }); this.tone(dest, t + 0.06, 880, 'triangle', { a: 0.005, d: 0.2, v: 0.12 }); }
        else if (sub === 'open') this.tone(dest, t, 440, 'triangle', { a: 0.005, d: 0.1, v: 0.08 }, 660);
        else if (sub === 'error') this.tone(dest, t, 180, 'square', { a: 0.005, d: 0.15, v: 0.08 });
        break;
      case 'chest': this.noiseHit(dest, t, 300, 3, 'bandpass', { a: 0.02, d: 0.35, v: 0.4 }); this.tone(dest, t, 110, 'triangle', { a: 0.01, d: 0.3, v: 0.15 }, 80); break;
      case 'door': this.noiseHit(dest, t, sub === 'open' ? 500 : 350, 4, 'bandpass', { a: 0.01, d: 0.22, v: 0.4 }); this.tone(dest, t, sub === 'open' ? 260 : 200, 'sawtooth', { a: 0.01, d: 0.18, v: 0.06 }, sub === 'open' ? 320 : 150); break;
      case 'lever': case 'button': case 'plate': case 'click': {
        const on = sub === 'on' || cat === 'click';
        const f = cat === 'plate' ? 700 : cat === 'lever' ? 1500 : 1900;
        this.noiseHit(dest, t, f * (on ? 1.15 : 0.85) * rnd(), 6, 'bandpass', { a: 0.001, d: 0.05, v: 0.35 });
        this.tone(dest, t, (on ? 600 : 480) * rnd(), 'square', { a: 0.001, d: 0.03, v: 0.06 });
        break;
      }
      case 'redstone': this.noiseHit(dest, t, 4000, 1, 'highpass', { a: 0.01, d: 0.35, v: 0.25 }, 0.4); break;
      case 'bucket': this.noiseHit(dest, t, sub === 'empty' ? 900 : 600, 1, 'lowpass', { a: 0.01, d: 0.4, v: 0.4 }); break;
      case 'tool': this.noiseHit(dest, t, 3000, 3, 'bandpass', { a: 0.002, d: 0.3, v: 0.5 }); this.tone(dest, t, 1800, 'square', { a: 0.002, d: 0.2, v: 0.08 }, 900); break;
      case 'arrow':
        if (sub === 'shoot') this.noiseHit(dest, t, 1800, 2, 'bandpass', { a: 0.005, d: 0.18, v: 0.25 }, 1.5);
        else this.noiseHit(dest, t, 700, 2, 'bandpass', { a: 0.002, d: 0.1, v: 0.3 });
        break;
      case 'splash': this.noiseHit(dest, t, 1200, 0.6, 'lowpass', { a: 0.01, d: 0.5, v: 0.5 }); break;
      case 'swim': this.noiseHit(dest, t, 800, 0.6, 'lowpass', { a: 0.03, d: 0.3, v: 0.15 }); break;
      case 'thunder': {
        this.noiseHit(dest, t, 180, 0.5, 'lowpass', { a: 0.05, d: 3.5, v: 0.9 }, 0.5);
        this.noiseHit(dest, t + 0.3, 90, 0.5, 'lowpass', { a: 0.2, d: 4, v: 0.7 }, 0.4);
        break;
      }
      case 'mob': {
        const voice = MOB_VOICE[sub];
        if (!voice) break;
        const kind = name.split('.')[2];
        const p = kind === 'hurt' ? 1.25 : kind === 'death' ? 0.8 : 1;
        const len = kind === 'death' ? 0.7 : 0.35;
        switch (voice.kind) {
          case 'bleat': this.tone(dest, t, voice.base * p * rnd(), 'sawtooth', { a: 0.03, d: len, v: 0.14 }, voice.base * 0.85 * p, 9); break;
          case 'grunt': this.tone(dest, t, voice.base * p * rnd(), 'sawtooth', { a: 0.02, d: len * 0.7, v: 0.2 }, voice.base * 0.7, 30); this.noiseHit(dest, t, 500, 1, 'lowpass', { a: 0.01, d: 0.15, v: 0.15 }); break;
          case 'cluck': for (let i = 0; i < (kind === 'death' ? 4 : 2); i++) this.tone(dest, t + i * 0.09, voice.base * p * rnd(), 'square', { a: 0.003, d: 0.05, v: 0.08 }, voice.base * 0.6); break;
          case 'groan': this.tone(dest, t, voice.base * p * rnd(), 'sawtooth', { a: 0.12, d: len * 2, v: 0.18 }, voice.base * 0.75, 4); this.noiseHit(dest, t, 300, 2, 'bandpass', { a: 0.1, d: len * 1.5, v: 0.1 }); break;
          case 'rattle': for (let i = 0; i < 6; i++) this.noiseHit(dest, t + i * 0.035, 2500 * rnd(), 6, 'bandpass', { a: 0.001, d: 0.03, v: 0.25 }); break;
          case 'hiss': this.noiseHit(dest, t, 4500 * p, 1, 'highpass', { a: 0.05, d: len, v: 0.2 }); break;
          case 'hum': this.hum(dest, t, voice.base * p * rnd(), len, kind === 'hurt' ? -1 : 0); break;
        }
        break;
      }
      case 'villager': this.hum(dest, t, 210 * rnd(), sub === 'yes' ? 0.28 : 0.4, sub === 'yes' ? 1 : 0); break;
    }
  }

  private hum(dest: AudioNode, t: number, f: number, len: number, bend: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f, t);
    o.frequency.linearRampToValueAtTime(f * (bend > 0 ? 1.35 : bend < 0 ? 0.7 : 0.92), t + len);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 3;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.22, t + 0.04);
    g.gain.linearRampToValueAtTime(0, t + len);
    o.connect(bp); bp.connect(g); g.connect(dest);
    o.start(t); o.stop(t + len + 0.05);
  }

  setRain(intensity: number, thunder: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (intensity > 0.02 && !this.rainNode) {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 2800;
      const f2 = ctx.createBiquadFilter();
      f2.type = 'highpass'; f2.frequency.value = 300;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(f).connect(f2).connect(g).connect(this.ambient);
      src.start();
      this.rainNode = { src, gain: g };
    }
    if (this.rainNode) {
      this.rainNode.gain.gain.setTargetAtTime(intensity * (thunder ? 0.22 : 0.16), ctx.currentTime, 0.5);
      if (intensity <= 0.02 && this.rainNode.gain.gain.value < 0.003) { this.rainNode.src.stop(); this.rainNode = null; }
    }
  }

  tickMusic(dt: number, night: boolean, underground: boolean): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || this.volumes.music <= 0 || this.volumes.muted) return;
    this.musicT += dt;
    if (this.musicT < this.nextMusic) return;
    this.musicT = 0;
    this.nextMusic = 70 + Math.random() * 150;
    const roots = night || underground ? [220, 196, 174.6] : [261.6, 293.7, 329.6];
    const root = roots[Math.floor(Math.random() * roots.length)];
    const scale = night || underground ? [0, 3, 5, 7, 10, 12, 15] : [0, 2, 4, 7, 9, 12, 14];
    const t0 = ctx.currentTime + 0.1;
    const n = 10 + Math.floor(Math.random() * 10);
    let step = Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      step = Math.max(0, Math.min(scale.length - 1, step + Math.floor(Math.random() * 3) - 1));
      const f = root * Math.pow(2, scale[step] / 12) * (Math.random() < 0.15 ? 0.5 : 1);
      const t = t0 + i * (0.55 + Math.random() * 0.5);
      const g = ctx.createGain();
      g.connect(this.musicBus);
      g.connect(this.reverb);
      this.tone(g, t, f, 'sine', { a: 0.02, d: 2.2, v: 0.12 });
      this.tone(g, t, f * 2, 'triangle', { a: 0.01, d: 0.8, v: 0.03 });
      if (i % 4 === 0) this.tone(g, t, f / 2, 'sine', { a: 0.3, d: 3, v: 0.06 });
    }
  }

  ambientCave(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const g = this.out(0.5, (Math.random() - 0.5) * 1.6, this.ambient);
    this.tone(g, t, 55 + Math.random() * 40, 'sine', { a: 1.5, d: 3, v: 0.12 }, 40);
    this.noiseHit(g, t + 0.5, 200, 3, 'bandpass', { a: 1, d: 2, v: 0.05 });
  }
}

export const audio = new AudioEngine();

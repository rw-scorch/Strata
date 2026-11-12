export interface VoicePeerInfo { id: string; name: string; x: number; y: number; z: number }

export interface VoiceHooks {
  selfId: string;
  send(to: string, d: unknown): void;
  peers(): VoicePeerInfo[];
  me(): { x: number; y: number; z: number; yaw: number; pitch: number };
  onState?(s: VoiceState): void;
}

export interface VoiceState { on: boolean; talking: boolean; muted: boolean; error: string; speaking: string[]; connected: number }

export interface VoiceOptions { mode: 'ptt' | 'vad'; volume: number; micGain: number; threshold: number; range: number }

interface Peer {
  id: string;
  pc: RTCPeerConnection;
  el: HTMLAudioElement;
  src: MediaStreamAudioSourceNode | null;
  panner: PannerNode | null;
  gain: GainNode | null;
  analyser: AnalyserNode | null;
  pendingIce: RTCIceCandidateInit[];
  speaking: boolean;
  level: number;
  lastSignal: number;
}

const FALLBACK_ICE: RTCIceServer[] = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }];

export class VoiceChat {
  private ctx: AudioContext | null = null;
  private mic: MediaStream | null = null;
  private micTrack: MediaStreamTrack | null = null;
  private micGain: GainNode | null = null;
  private micAnalyser: AnalyserNode | null = null;
  private sendStream: MediaStream | null = null;
  private peers = new Map<string, Peer>();
  private ice: RTCIceServer[] = FALLBACK_ICE;
  private pttDown = false;
  private vadHold = 0;
  private buf = new Float32Array(1024);
  private blocked = new Set<string>();
  private lastState = '';
  opts: VoiceOptions = { mode: 'ptt', volume: 1, micGain: 1, threshold: 0.03, range: 48 };
  muted = false;
  enabled = false;
  error = '';
  allowed = true;

  constructor(private h: VoiceHooks) {}

  async enable(): Promise<boolean> {
    if (this.enabled) return true;
    this.error = '';
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === 'undefined') throw new Error('This browser cannot do voice chat.');
      this.mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx();
      await this.ctx.resume().catch(() => {});
      const src = this.ctx.createMediaStreamSource(this.mic);
      this.micGain = this.ctx.createGain();
      this.micGain.gain.value = this.opts.micGain;
      this.micAnalyser = this.ctx.createAnalyser();
      this.micAnalyser.fftSize = 1024;
      const dest = this.ctx.createMediaStreamDestination();
      src.connect(this.micGain);
      this.micGain.connect(this.micAnalyser);
      this.micGain.connect(dest);
      this.sendStream = dest.stream;
      this.micTrack = dest.stream.getAudioTracks()[0];
      this.micTrack.enabled = false;
      this.enabled = true;
      void this.loadIce();
      this.emitState(true);
      return true;
    } catch (e) {
      this.error = (e as Error)?.name === 'NotAllowedError' ? 'Microphone permission was denied.' : String((e as Error)?.message ?? e);
      this.disable();
      this.emitState(true);
      return false;
    }
  }

  private async loadIce(): Promise<void> {
    try {
      const r = await fetch('/api/turn');
      if (!r.ok) return;
      const j = (await r.json()) as { iceServers?: RTCIceServer[] };
      if (j.iceServers?.length) this.ice = j.iceServers;
    } catch { /* keep STUN only */ }
  }

  disable(): void {
    for (const id of [...this.peers.keys()]) this.drop(id, true);
    this.mic?.getTracks().forEach((t) => t.stop());
    this.mic = null; this.micTrack = null; this.sendStream = null;
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.enabled = false;
    this.emitState(true);
  }

  setPtt(down: boolean): void { this.pttDown = down; }
  setMuted(m: boolean): void { this.muted = m; this.emitState(true); }
  block(id: string, on: boolean): void { if (on) { this.blocked.add(id); this.drop(id, true); } else this.blocked.delete(id); }

  applyOptions(o: Partial<VoiceOptions>): void {
    Object.assign(this.opts, o);
    if (this.micGain) this.micGain.gain.value = this.opts.micGain;
    for (const p of this.peers.values()) if (p.panner) p.panner.maxDistance = this.opts.range;
  }

  private level(an: AnalyserNode): number {
    an.getFloatTimeDomainData(this.buf);
    let s = 0;
    for (let i = 0; i < this.buf.length; i++) s += this.buf[i] * this.buf[i];
    return Math.sqrt(s / this.buf.length);
  }

  private makePeer(id: string): Peer {
    const pc = new RTCPeerConnection({ iceServers: this.ice });
    const el = new Audio();
    el.autoplay = true;
    const p: Peer = { id, pc, el, src: null, panner: null, gain: null, analyser: null, pendingIce: [], speaking: false, level: 0, lastSignal: performance.now() };
    if (this.sendStream) for (const t of this.sendStream.getAudioTracks()) pc.addTrack(t, this.sendStream);
    pc.onicecandidate = (e) => { if (e.candidate) this.h.send(id, { ice: e.candidate.toJSON() }); };
    pc.ontrack = (e) => {
      const stream = e.streams[0] ?? new MediaStream([e.track]);
      el.srcObject = stream;
      const ctx = this.ctx;
      if (!ctx) { el.muted = false; return; }
      try {
        el.muted = true;
        void el.play().catch(() => {});
        p.src = ctx.createMediaStreamSource(stream);
        p.panner = ctx.createPanner();
        p.panner.panningModel = 'HRTF';
        p.panner.distanceModel = 'linear';
        p.panner.refDistance = 1;
        p.panner.maxDistance = this.opts.range;
        p.panner.rolloffFactor = 1;
        p.gain = ctx.createGain();
        p.gain.gain.value = this.opts.volume;
        p.analyser = ctx.createAnalyser();
        p.analyser.fftSize = 1024;
        p.src.connect(p.analyser);
        p.src.connect(p.panner);
        p.panner.connect(p.gain);
        p.gain.connect(ctx.destination);
      } catch {
        el.muted = false;
        void el.play().catch(() => {});
      }
    };
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed' || pc.connectionState === 'closed') this.drop(id, false); };
    this.peers.set(id, p);
    return p;
  }

  private drop(id: string, notify: boolean): void {
    const p = this.peers.get(id);
    if (!p) return;
    this.peers.delete(id);
    if (notify) this.h.send(id, { bye: 1 });
    try { p.pc.close(); } catch { /* closed */ }
    p.src?.disconnect(); p.panner?.disconnect(); p.gain?.disconnect();
    p.el.srcObject = null;
  }

  async signal(from: string, d: unknown): Promise<void> {
    if (!this.enabled || !this.allowed || this.blocked.has(from)) return;
    const m = d as { sdp?: RTCSessionDescriptionInit; ice?: RTCIceCandidateInit; bye?: number };
    if (m.bye) { this.drop(from, false); return; }
    try {
      let p = this.peers.get(from);
      if (m.sdp) {
        if (m.sdp.type === 'offer') {
          if (p && p.pc.signalingState !== 'stable') { this.drop(from, false); p = undefined; }
          if (!this.inRange(from, this.opts.range + 16)) return;
          p ??= this.makePeer(from);
          await p.pc.setRemoteDescription(m.sdp);
          const ans = await p.pc.createAnswer();
          await p.pc.setLocalDescription(ans);
          this.h.send(from, { sdp: p.pc.localDescription!.toJSON() });
        } else if (p) await p.pc.setRemoteDescription(m.sdp);
        if (p) { for (const c of p.pendingIce) await p.pc.addIceCandidate(c).catch(() => {}); p.pendingIce = []; p.lastSignal = performance.now(); }
      } else if (m.ice && p) {
        if (p.pc.remoteDescription) await p.pc.addIceCandidate(m.ice).catch(() => {});
        else p.pendingIce.push(m.ice);
      }
    } catch (e) {
      console.warn('voice signal failed', e);
      this.drop(from, true);
    }
  }

  private inRange(id: string, r: number): boolean {
    const o = this.h.peers().find((q) => q.id === id);
    if (!o) return false;
    const me = this.h.me();
    return Math.hypot(o.x - me.x, o.y - me.y, o.z - me.z) <= r;
  }

  private async call(id: string): Promise<void> {
    const p = this.makePeer(id);
    try {
      const off = await p.pc.createOffer();
      await p.pc.setLocalDescription(off);
      this.h.send(id, { sdp: p.pc.localDescription!.toJSON() });
    } catch { this.drop(id, false); }
  }

  update(): void {
    if (!this.enabled || !this.ctx) return;
    const me = this.h.me();
    const L = this.ctx.listener;
    const fx = -Math.sin(me.yaw) * Math.cos(me.pitch), fy = Math.sin(me.pitch), fz = -Math.cos(me.yaw) * Math.cos(me.pitch);
    if (L.positionX) {
      L.positionX.value = me.x; L.positionY.value = me.y + 1.6; L.positionZ.value = me.z;
      L.forwardX.value = fx; L.forwardY.value = fy; L.forwardZ.value = fz;
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else {
      L.setPosition(me.x, me.y + 1.6, me.z);
      L.setOrientation(fx, fy, fz, 0, 1, 0);
    }
    const others = this.allowed ? this.h.peers() : [];
    const near = new Map<string, VoicePeerInfo>();
    for (const o of others) {
      if (o.id === this.h.selfId || this.blocked.has(o.id)) continue;
      const d = Math.hypot(o.x - me.x, o.y - me.y, o.z - me.z);
      const has = this.peers.has(o.id);
      if (d <= this.opts.range + (has ? 16 : 8)) near.set(o.id, o);
    }
    for (const id of [...this.peers.keys()]) if (!near.has(id)) this.drop(id, true);
    for (const [id, o] of near) {
      let p = this.peers.get(id);
      if (!p && this.h.selfId < id) { void this.call(id); p = this.peers.get(id); }
      if (p?.panner) {
        if (p.panner.positionX) { p.panner.positionX.value = o.x; p.panner.positionY.value = o.y + 1.6; p.panner.positionZ.value = o.z; }
        else p.panner.setPosition(o.x, o.y + 1.6, o.z);
        if (p.gain) p.gain.gain.value = this.opts.volume;
      }
      if (p?.analyser) {
        const lv = this.level(p.analyser);
        p.level = lv;
        p.speaking = lv > 0.01;
      }
      if (p && p.pc.connectionState === 'new' && performance.now() - p.lastSignal > 15000) this.drop(id, false);
    }
    let talking = false;
    if (!this.muted && this.micAnalyser) {
      if (this.opts.mode === 'ptt') talking = this.pttDown;
      else {
        const lv = this.level(this.micAnalyser);
        if (lv > this.opts.threshold) this.vadHold = 18;
        else if (this.vadHold > 0) this.vadHold--;
        talking = this.vadHold > 0;
      }
    }
    if (this.micTrack) this.micTrack.enabled = talking;
    this.talking = talking;
    this.emitState(false);
  }

  talking = false;

  micLevel(): number { return this.micAnalyser ? this.level(this.micAnalyser) : 0; }

  state(): VoiceState {
    const names = new Map(this.h.peers().map((p) => [p.id, p.name]));
    const speaking = [...this.peers.values()].filter((p) => p.speaking).map((p) => names.get(p.id) ?? '?');
    return { on: this.enabled, talking: this.talking, muted: this.muted, error: this.error, speaking, connected: [...this.peers.values()].filter((p) => p.pc.connectionState === 'connected').length };
  }

  private emitState(force: boolean): void {
    if (!this.h.onState) return;
    const st = this.state();
    const key = JSON.stringify(st);
    if (!force && key === this.lastState) return;
    this.lastState = key;
    this.h.onState(st);
  }
}

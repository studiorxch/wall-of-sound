// 0722C_MUSIC_Production_Stem_Export — synchronized 4-stem playback.
//
// PURE functions below the imports (fully unit tested): start-time/elapsed
// math and mute/solo gain resolution. The AudioContext-driving class below
// the "---" banner is real node-graph wiring, live-verified only — this
// repo's existing, explicit doctrine for every real audio engine (see
// loopchainPlaybackEngine.ts's own header comment and dualDeckPlayback.test.ts).
//
// Generalizes loopchainPlaybackEngine's one-anchor-time pattern
// (chainStartContextTime / stopAllActiveNodes) to 4 named AudioBuffers, all
// started via .start(startContextTime, offset) in the SAME synchronous
// block (no awaits between the 4 calls) so they share one literal instant
// — the actual mechanism behind "one authoritative clock." Mute/solo is an
// instantaneous GainNode.gain.value write (DualDeckPlaybackEngine.
// setDeckGainValue's pattern), never a ramp — it must never restart or
// desync a source.
//
// Before load and again before start, the caller (StemSublayer / its
// hook) MUST have already confirmed live lifecycle === "current" via
// GET /stem-sets — this class itself has no network access and trusts
// whatever buffers it's given; the CURRENT-only gate is enforced one layer
// up, deliberately, so this class stays pure audio-graph plumbing.

import { STEM_ROLES, type StemRole } from "../data/trackStemTypes";

const LEAD_SECONDS = 0.05;

// Pure — exported for unit tests. The AudioContext time at which
// offsetSeconds=0 of "elapsed" would have started; `elapsedSeconds()` is
// `ctx.currentTime - anchorContextTime`, and the real `.start()` call time
// for every stem is `anchorContextTime + offsetSeconds` (always
// `ctx.currentTime + LEAD_SECONDS`, regardless of offset) — this is the
// exact anchor convention loopchainPlaybackEngine.ts already uses.
export function computeStemStartContextTime(ctxCurrentTime: number, offsetSeconds: number, leadSeconds: number = LEAD_SECONDS): number {
  return ctxCurrentTime + leadSeconds - offsetSeconds;
}

export function stemElapsedSeconds(ctxCurrentTime: number, anchorContextTime: number): number {
  return ctxCurrentTime - anchorContextTime;
}

// Pure — exported for unit tests. Solo is exclusive: if ANY role is
// soloed, only soloed (and not muted) roles play; muting always wins over
// soloing itself (a soloed-and-muted role stays silent). With nothing
// soloed, plain mute state applies per role.
export function resolveStemGainForMuteSolo(
  role: StemRole,
  muted: Partial<Record<StemRole, boolean>>,
  soloed: Partial<Record<StemRole, boolean>>,
): number {
  if (muted[role]) return 0;
  const anySoloed = STEM_ROLES.some((r) => soloed[r]);
  if (anySoloed) return soloed[role] ? 1 : 0;
  return 1;
}

// ---------------------------------------------------------------------

export interface StemPlaybackEngineOptions {
  audioContext: AudioContext;
  destination?: AudioNode;
}

interface StemNodes {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

export class StemPlaybackEngine {
  private ctx: AudioContext;
  private destination: AudioNode;
  private buffers = new Map<StemRole, AudioBuffer>();
  private nodes = new Map<StemRole, StemNodes>();
  private anchorContextTime = 0;
  private playing = false;
  private pausedAtElapsedSeconds: number | null = null;
  private durationSeconds = 0;
  private muted: Partial<Record<StemRole, boolean>> = {};
  private soloed: Partial<Record<StemRole, boolean>> = {};

  constructor(opts: StemPlaybackEngineOptions) {
    this.ctx = opts.audioContext;
    this.destination = opts.destination ?? opts.audioContext.destination;
  }

  setBuffer(role: StemRole, buffer: AudioBuffer) {
    this.buffers.set(role, buffer);
    this.durationSeconds = Math.max(this.durationSeconds, buffer.duration);
  }

  hasAllFourBuffers(): boolean {
    return STEM_ROLES.every((r) => this.buffers.has(r));
  }

  isPlaying(): boolean {
    return this.playing;
  }

  elapsedSeconds(): number {
    if (this.pausedAtElapsedSeconds != null) return this.pausedAtElapsedSeconds;
    if (!this.playing) return 0;
    return stemElapsedSeconds(this.ctx.currentTime, this.anchorContextTime);
  }

  private stopAllActiveNodes() {
    for (const n of this.nodes.values()) {
      try { n.source.stop(); } catch { /* already stopped */ }
      n.source.disconnect();
      n.gain.disconnect();
    }
    this.nodes = new Map();
  }

  private currentGainFor(role: StemRole): number {
    return resolveStemGainForMuteSolo(role, this.muted, this.soloed);
  }

  // Starts all 4 stems at the SAME literal AudioContext instant — every
  // .start() call happens in this one synchronous loop, no awaits between
  // them, so they cannot drift relative to each other at the moment of
  // creation. Each occurrence gets a brand-new node pair, never reused.
  private startAllFrom(offsetSeconds: number) {
    this.stopAllActiveNodes();
    const startContextTime = computeStemStartContextTime(this.ctx.currentTime, offsetSeconds, LEAD_SECONDS);
    this.anchorContextTime = startContextTime;
    const realStartTime = startContextTime + offsetSeconds; // == ctx.currentTime + LEAD_SECONDS

    for (const role of STEM_ROLES) {
      const buffer = this.buffers.get(role);
      if (!buffer) continue;
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      const gain = this.ctx.createGain();
      gain.gain.value = this.currentGainFor(role);
      source.connect(gain);
      gain.connect(this.destination);
      source.start(realStartTime, Math.min(offsetSeconds, buffer.duration));
      this.nodes.set(role, { source, gain });
      source.onended = () => {
        source.disconnect();
        gain.disconnect();
        this.nodes.delete(role);
      };
    }
  }

  play(fromElapsedSeconds: number = 0) {
    if (!this.hasAllFourBuffers()) return;
    this.playing = true;
    this.pausedAtElapsedSeconds = null;
    this.startAllFrom(Math.max(0, fromElapsedSeconds));
  }

  pause() {
    if (!this.playing) return;
    this.pausedAtElapsedSeconds = this.elapsedSeconds();
    this.playing = false;
    this.stopAllActiveNodes();
  }

  resume() {
    if (this.playing || this.pausedAtElapsedSeconds == null) return;
    this.playing = true;
    const from = this.pausedAtElapsedSeconds;
    this.pausedAtElapsedSeconds = null;
    this.startAllFrom(from);
  }

  // No occurrence-snapping needed here (unlike loopchain) — a stem set is
  // one continuous file per role, so seeking is a direct offset restart.
  seek(seconds: number): number {
    const clamped = Math.min(Math.max(seconds, 0), this.durationSeconds);
    if (this.playing) {
      this.startAllFrom(clamped);
    } else {
      this.pausedAtElapsedSeconds = clamped;
    }
    return clamped;
  }

  stop() {
    this.playing = false;
    this.pausedAtElapsedSeconds = null;
    this.stopAllActiveNodes();
  }

  // Instantaneous gain writes only — never restarts or desyncs a source.
  setMuted(role: StemRole, muted: boolean) {
    this.muted = { ...this.muted, [role]: muted };
    this.applyGains();
  }

  setSoloed(role: StemRole, soloed: boolean) {
    this.soloed = { ...this.soloed, [role]: soloed };
    this.applyGains();
  }

  private applyGains() {
    for (const role of STEM_ROLES) {
      const nodes = this.nodes.get(role);
      if (nodes) nodes.gain.gain.value = this.currentGainFor(role);
    }
  }

  getDurationSeconds(): number {
    return this.durationSeconds;
  }
}

// Dual-Deck Playback and Crossfade Execution (0714_MUSIC_Dual_Deck_Playback_
// And_Crossfade_Execution v1.0.0) — the real playback engine (§3, §17, §21).
// Two HTMLAudioElement decks, each routed through an independent GainNode on
// a single shared AudioContext, so a real equal-power crossfade can run
// entirely on the audio thread (setValueCurveAtTime) rather than via
// React-driven polling. Consumes PlaylistTransitionPlan directly (§29) — no
// parallel transition-plan schema.

import type { PlaylistTransitionPlan } from "../data/playlistTransitionTypes";
import type {
  PlaybackDeckState, TransitionCancellationReason, PausedTransitionSnapshot,
  TransitionSchedulingMetric, DualDeckLifecycleMetrics, GainEnvelope,
  DeckAudioGraphState, EngineAudibleReadiness, HardCutExecutionResult,
} from "./dualDeckTypes";
import { createIdleDeck, loadDeck, markDeckReady, markDeckPlaying, markDeckPaused, markDeckEnded, markDeckError, resetDeckToIdle, setDeckGain } from "./deckTransport";
import { buildCrossfadeEnvelopes, buildHardCutEnvelopes, computeTransitionProgress } from "./transitionScheduler";
import { gainAtContextTime } from "./gainEnvelope";
import { evaluateAudibleReadiness } from "./handoffReadiness";

// §6 — recommended position-observation window (100-300ms); documented
// tolerance for this browser environment's timer/AudioContext granularity.
const DEFAULT_READINESS_OBSERVATION_MS = 200;

const CURVE_SAMPLE_COUNT = 64;

interface DeckNodes {
  audio: HTMLAudioElement;
  source: MediaElementAudioSourceNode | null;
  gain: GainNode;
}

export type DualDeckEventListener = (decks: Record<"A" | "B", PlaybackDeckState>) => void;

export class DualDeckPlaybackEngine {
  private ctx: AudioContext | null = null;
  private nodes: Record<"A" | "B", DeckNodes>;
  private states: Record<"A" | "B", PlaybackDeckState> = { A: createIdleDeck("A"), B: createIdleDeck("B") };
  private listeners = new Set<DualDeckEventListener>();
  private endedHandlers = new Set<(deckId: "A" | "B") => void>();
  private activeTransitionRaf: number | null = null;
  private onTransitionComplete: (() => void) | null = null;

  // §12/§13/§25 — the in-flight transition's own bookkeeping, needed so
  // pauseAll()/resumeAll() can freeze and resume the SAME envelope instead
  // of restarting it (§13: "do not restart the fade").
  private inFlightTransition: {
    transitionId: string;
    outgoingDeckId: "A" | "B";
    incomingDeckId: "A" | "B";
    outEnv: GainEnvelope;
    inEnv: GainEnvelope;
    startTime: number;
    duration: number;
    plannedStartContextTime: number;
    plannedEndContextTime: number;
  } | null = null;
  private pausedSnapshot: PausedTransitionSnapshot | null = null;
  private jitterMetrics: TransitionSchedulingMetric[] = [];
  private completedTransitionCount = 0;
  private cancelledTransitionCount = 0;
  // §16 — promotion idempotence guard. A transitionId can only ever
  // complete (promote) once, even under a pause/resume race where both the
  // original tick and a resumed continuation might otherwise reach the
  // completion branch.
  private promotedTransitionIds = new Set<string>();

  constructor() {
    const audioA = new Audio();
    const audioB = new Audio();
    audioA.crossOrigin = "anonymous";
    audioB.crossOrigin = "anonymous";
    this.nodes = {
      A: { audio: audioA, source: null, gain: this.silentGainStub() },
      B: { audio: audioB, source: null, gain: this.silentGainStub() },
    };
    this.wireEndedListener("A");
    this.wireEndedListener("B");
  }

  // GainNode requires an AudioContext; stub replaced once ensureContext()
  // runs (must happen inside a user gesture per browser autoplay policy).
  private silentGainStub(): GainNode {
    return { gain: { value: 1 } } as unknown as GainNode;
  }

  private ensureContext(): AudioContext {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    this.ctx = ctx;
    (["A", "B"] as const).forEach((id) => {
      const n = this.nodes[id];
      const source = ctx.createMediaElementSource(n.audio);
      const gain = ctx.createGain();
      source.connect(gain).connect(ctx.destination);
      this.nodes[id] = { ...n, source, gain };
    });
    return ctx;
  }

  private wireEndedListener(deckId: "A" | "B") {
    this.nodes[deckId].audio.addEventListener("ended", () => {
      this.setState(deckId, markDeckEnded(this.states[deckId]));
      // §12 — media-ended trigger path: the caller (hook) decides whether
      // this ended deck has a pending hard-cut transition to execute; the
      // engine itself never assumes which plan is active.
      for (const h of this.endedHandlers) h(deckId);
    });
    this.nodes[deckId].audio.addEventListener("error", () => {
      this.setState(deckId, markDeckError(this.states[deckId], "source_error"));
    });
  }

  subscribe(listener: DualDeckEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // §12 — subscribe to the media-ended trigger path for either deck.
  onDeckEnded(handler: (deckId: "A" | "B") => void): () => void {
    this.endedHandlers.add(handler);
    return () => this.endedHandlers.delete(handler);
  }

  getContextState(): AudioContextState | "closed" {
    return this.ctx?.state ?? "closed";
  }

  // §9 — audio graph connectivity tracked explicitly rather than inferred
  // from object existence: source/gain/master are all wired together in
  // ensureContext(), so a real (non-stub) source node implies all three.
  getGraphState(deckId: "A" | "B"): DeckAudioGraphState {
    const connected = this.nodes[deckId].source != null;
    return { mediaSourceConnected: connected, gainConnected: connected, masterConnected: connected };
  }

  getState(): Record<"A" | "B", PlaybackDeckState> {
    return this.states;
  }

  private setState(deckId: "A" | "B", next: PlaybackDeckState) {
    this.states = { ...this.states, [deckId]: next };
    for (const l of this.listeners) l(this.states);
  }

  // §9 — preload: load the source and seek to the incoming cue, but stay
  // silent/paused until the transition scheduler starts it.
  async preload(deckId: "A" | "B", params: { trackId: string; slotId: string; sourceUrl: string; cueStartSeconds: number; cueEndSeconds?: number }): Promise<void> {
    this.ensureContext();
    const n = this.nodes[deckId];
    this.setState(deckId, loadDeck(this.states[deckId], { ...params, role: "incoming" }));
    n.gain.gain.value = 0;
    n.audio.src = params.sourceUrl;
    n.audio.currentTime = params.cueStartSeconds;
    await new Promise<void>((resolve, reject) => {
      const onReady = () => { n.audio.removeEventListener("canplay", onReady); resolve(); };
      const onError = () => { n.audio.removeEventListener("error", onError); reject(new Error("source_error")); };
      n.audio.addEventListener("canplay", onReady, { once: true });
      n.audio.addEventListener("error", onError, { once: true });
      n.audio.load();
    }).then(
      () => this.setState(deckId, markDeckReady(this.states[deckId], n.audio.duration)),
      () => this.setState(deckId, markDeckError(this.states[deckId], "source_error")),
    );
  }

  async playDeck(deckId: "A" | "B") {
    const n = this.nodes[deckId];
    this.ensureContext();
    await n.audio.play();
    this.setState(deckId, markDeckPlaying(this.states[deckId]));
  }

  // §4/§5/§6 — the core safety rule: "engine state says playing" is NOT
  // audible-output readiness. Samples currentTime across an observation
  // window (default 200ms, within the spec's documented 100-300ms range) so
  // a resolved play() promise on a suspended AudioContext, a muted element,
  // or a zero gain path can never be mistaken for real audible output.
  async confirmAudibleReadiness(deckId: "A" | "B", observationWindowMs = DEFAULT_READINESS_OBSERVATION_MS): Promise<EngineAudibleReadiness> {
    const n = this.nodes[deckId];
    if (this.ctx?.state === "suspended") {
      try { await this.ctx.resume(); } catch { /* evaluated below via audioContextState */ }
    }
    const positionBeforeSeconds = n.audio.currentTime;
    await new Promise<void>((resolve) => setTimeout(resolve, observationWindowMs));
    const positionAfterSeconds = n.audio.currentTime;
    return evaluateAudibleReadiness({
      audioContextState: this.getContextState(),
      audioElementPaused: n.audio.paused,
      elementMuted: n.audio.muted,
      elementVolume: n.audio.volume,
      deckGain: n.gain.gain.value,
      sourceConnected: this.getGraphState(deckId).mediaSourceConnected,
      positionBeforeSeconds, positionAfterSeconds,
      playRejected: false,
      sourceLoadFailed: this.states[deckId].state === "error",
    });
  }

  pauseDeck(deckId: "A" | "B") {
    this.nodes[deckId].audio.pause();
    this.setState(deckId, markDeckPaused(this.states[deckId]));
  }

  seekDeck(deckId: "A" | "B", timeSeconds: number) {
    this.nodes[deckId].audio.currentTime = Math.max(0, timeSeconds);
    this.syncDeckPosition(deckId);
  }

  // Dual-Deck Control Edge-Case Verification — root cause of the reported
  // "position stuck" family of symptoms: PlaybackDeckState.currentTimeSeconds
  // was only ever set once, at loadDeck() time, and never refreshed
  // afterward — so the deck's REPORTED state (gain, playing/paused) stayed
  // live and correct while its POSITION silently froze. Call this each tick
  // to pull the real <audio>.currentTime into the React-visible state.
  syncDeckPosition(deckId: "A" | "B") {
    const real = this.nodes[deckId].audio.currentTime;
    if (this.states[deckId].currentTimeSeconds !== real) {
      this.setState(deckId, { ...this.states[deckId], currentTimeSeconds: real });
    }
  }

  setDeckMuted(deckId: "A" | "B", muted: boolean) {
    this.nodes[deckId].audio.muted = muted;
    this.setState(deckId, { ...this.states[deckId], muted });
  }

  // §4/§5 — root cause of Defect A: preload() intentionally zeros a deck's
  // gain so it stays silent while loading during a crossfade — correct for
  // the INCOMING deck mid-session, but the very first (non-crossfade) deck
  // in a prepared-playback handoff never has an envelope that raises its
  // gain back to 1, so it played back at gain 0 forever. The caller must
  // explicitly restore full gain for a solo (non-crossfade) start.
  setDeckGainValue(deckId: "A" | "B", value: number) {
    this.nodes[deckId].gain.gain.value = value;
    this.setState(deckId, setDeckGain(this.states[deckId], value));
  }

  getCurrentTime(deckId: "A" | "B"): number {
    return this.nodes[deckId].audio.currentTime;
  }

  // §11/§12/§13/§14 — a hard cut has zero overlap. Reachable from BOTH the
  // scheduled (tick-based) path and the media `ended` event; both call this
  // SAME executor, sharing the SAME `promotedTransitionIds` idempotence
  // guard already used by the crossfade completion paths (§16) — a
  // transitionId can promote exactly once no matter which trigger reaches
  // it first, or if both reach it in the same tick.
  async executeHardCut(
    transitionId: string,
    outgoingDeckId: "A" | "B",
    incomingDeckId: "A" | "B",
    _trigger: "scheduled" | "media_ended",
  ): Promise<HardCutExecutionResult> {
    if (this.promotedTransitionIds.has(transitionId)) {
      return { executed: false, reason: "already_promoted" };
    }
    const incomingState = this.states[incomingDeckId];
    if (incomingState.state !== "ready" && incomingState.state !== "playing") {
      return { executed: false, reason: "incoming_not_ready" };
    }
    // Claim the id BEFORE any await so a second trigger arriving in the same
    // tick (scheduled and media_ended both firing) sees the guard already
    // set and bails out at the check above, rather than racing past it.
    this.promotedTransitionIds.add(transitionId);

    const ctx = this.ensureContext();
    const outgoing = this.nodes[outgoingDeckId];
    const incoming = this.nodes[incomingDeckId];
    const { outgoing: outEnv, incoming: inEnv } = buildHardCutEnvelopes();
    void outEnv; void inEnv;
    outgoing.gain.gain.cancelScheduledValues(ctx.currentTime);
    outgoing.gain.gain.setValueAtTime(0, ctx.currentTime);
    incoming.gain.gain.cancelScheduledValues(ctx.currentTime);
    incoming.gain.gain.setValueAtTime(1, ctx.currentTime);
    outgoing.audio.pause();

    try {
      if (incomingState.state !== "playing") await this.playDeck(incomingDeckId);
    } catch {
      // §16 — the incoming deck failed to start; release the claim so a
      // fallback retry (or a later, different trigger) can attempt again.
      this.promotedTransitionIds.delete(transitionId);
      return { executed: false, reason: "incoming_play_failed" };
    }

    this.setState(outgoingDeckId, resetDeckToIdle(outgoingDeckId));
    this.completedTransitionCount++;
    return { executed: true };
  }

  // §12/§13/§14 — schedules the gain automation for a transition using the
  // shared AudioContext clock (context-time scheduling — §17), and resolves
  // once the incoming deck has been promoted. `mode` is the ALREADY-RESOLVED
  // execution mode (post-downgrade, from resolveExecutionSyncMode).
  async runTransition(
    plan: PlaylistTransitionPlan,
    mode: "timed_crossfade" | "gapless" | "hard_cut" | "beat_sync" | "bar_sync",
    outgoingDeckId: "A" | "B",
    incomingDeckId: "A" | "B",
  ): Promise<void> {
    const ctx = this.ensureContext();
    const outgoing = this.nodes[outgoingDeckId];
    const incoming = this.nodes[incomingDeckId];

    if (mode === "hard_cut") {
      const result = await this.executeHardCut(plan.transitionId, outgoingDeckId, incomingDeckId, "scheduled");
      if (!result.executed && result.reason && result.reason !== "already_promoted") {
        throw new Error(result.reason);
      }
      return;
    }

    // timed_crossfade, gapless, beat_sync, bar_sync all use the same
    // equal-power envelope machinery — beat/bar sync only changes WHEN the
    // incoming deck's start is scheduled (already baked into cue values by
    // the preparation stage), never the fade shape itself.
    const { outgoing: outEnv, incoming: inEnv } = buildCrossfadeEnvelopes(plan);
    const duration = Math.max(0.001, plan.transitionDurationSeconds);
    const plannedStartContextTime = ctx.currentTime;
    const startTime = plannedStartContextTime;

    const outCurve = sampleCurve(outEnv);
    const inCurve = sampleCurve(inEnv);
    outgoing.gain.gain.setValueCurveAtTime(outCurve, startTime, duration);
    incoming.gain.gain.setValueCurveAtTime(inCurve, startTime, duration);

    this.inFlightTransition = {
      transitionId: plan.transitionId, outgoingDeckId, incomingDeckId, outEnv, inEnv,
      startTime, duration, plannedStartContextTime, plannedEndContextTime: plannedStartContextTime + duration,
    };

    await this.playDeck(incomingDeckId);
    const actualStartContextTime = ctx.currentTime;

    await new Promise<void>((resolve) => {
      this.onTransitionComplete = resolve;
      const tick = () => {
        const elapsed = ctx.currentTime - startTime;
        const t = Math.min(1, elapsed / duration);
        this.setState(outgoingDeckId, setDeckGain(this.states[outgoingDeckId], gainAtContextTime(outEnv, elapsed)));
        this.setState(incomingDeckId, setDeckGain(this.states[incomingDeckId], gainAtContextTime(inEnv, elapsed)));
        if (t >= 1) {
          // §16 — a transitionId may promote exactly once, even under a
          // pause/resume race with the reconstructed tick in resumeAll().
          if (this.promotedTransitionIds.has(plan.transitionId)) {
            this.inFlightTransition = null;
            this.onTransitionComplete = null;
            return;
          }
          this.promotedTransitionIds.add(plan.transitionId);
          const actualEndContextTime = ctx.currentTime;
          outgoing.audio.pause();
          this.setState(outgoingDeckId, resetDeckToIdle(outgoingDeckId));
          this.jitterMetrics.push({
            transitionId: plan.transitionId,
            plannedStartContextTime, actualStartContextTime,
            plannedEndContextTime: plannedStartContextTime + duration, actualEndContextTime,
            startJitterMs: (actualStartContextTime - plannedStartContextTime) * 1000,
            endJitterMs: (actualEndContextTime - (plannedStartContextTime + duration)) * 1000,
          });
          this.completedTransitionCount++;
          this.inFlightTransition = null;
          this.onTransitionComplete?.();
          this.onTransitionComplete = null;
          return;
        }
        this.activeTransitionRaf = requestAnimationFrame(tick);
      };
      this.activeTransitionRaf = requestAnimationFrame(tick);
    });
  }

  // §12 — pause routes to the current authority; for the engine, BOTH decks
  // must stop, and if a transition is in flight, its envelope is FROZEN (not
  // cancelled) so resumeAll() can continue it from the exact gains it had.
  pauseAll() {
    const ctx = this.ctx;
    (["A", "B"] as const).forEach((id) => {
      if (this.states[id].state === "playing") {
        this.nodes[id].audio.pause();
        this.setState(id, markDeckPaused(this.states[id]));
      }
    });
    if (this.inFlightTransition && ctx) {
      if (this.activeTransitionRaf != null) {
        cancelAnimationFrame(this.activeTransitionRaf);
        this.activeTransitionRaf = null;
      }
      const { transitionId, outgoingDeckId, incomingDeckId, outEnv, inEnv, startTime, duration } = this.inFlightTransition;
      const elapsed = ctx.currentTime - startTime;
      const activeDeckGain = gainAtContextTime(outEnv, elapsed);
      const incomingDeckGain = gainAtContextTime(inEnv, elapsed);
      // Freeze gain automation at its current value — never let a scheduled
      // curve keep animating on a paused (silent) audio graph.
      this.nodes[outgoingDeckId].gain.gain.cancelScheduledValues(ctx.currentTime);
      this.nodes[outgoingDeckId].gain.gain.setValueAtTime(activeDeckGain, ctx.currentTime);
      this.nodes[incomingDeckId].gain.gain.cancelScheduledValues(ctx.currentTime);
      this.nodes[incomingDeckId].gain.gain.setValueAtTime(incomingDeckGain, ctx.currentTime);
      this.pausedSnapshot = {
        transitionId,
        elapsedSeconds: elapsed, remainingSeconds: Math.max(0, duration - elapsed), progress: Math.min(1, elapsed / duration),
        activeDeckGain, incomingDeckGain,
        activeDeckPositionSeconds: this.getCurrentTime(outgoingDeckId), incomingDeckPositionSeconds: this.getCurrentTime(incomingDeckId),
        pausedAtContextTime: ctx.currentTime,
      };
    }
  }

  // §13 — resume continues the remaining envelope from current gains; it
  // never restarts the fade from t=0.
  async resumeAll() {
    const ctx = this.ensureContext();
    for (const id of ["A", "B"] as const) {
      if (this.states[id].state === "paused") {
        await this.nodes[id].audio.play();
        this.setState(id, markDeckPlaying(this.states[id]));
      }
    }
    if (this.pausedSnapshot && this.inFlightTransition) {
      const { outgoingDeckId, incomingDeckId, outEnv, inEnv } = this.inFlightTransition;
      const remaining = this.pausedSnapshot.remainingSeconds;
      const resumeStart = ctx.currentTime;
      if (remaining > 0) {
        const outCurve = sampleRemainingCurve(outEnv, this.pausedSnapshot.progress);
        const inCurve = sampleRemainingCurve(inEnv, this.pausedSnapshot.progress);
        this.nodes[outgoingDeckId].gain.gain.setValueCurveAtTime(outCurve, resumeStart, remaining);
        this.nodes[incomingDeckId].gain.gain.setValueCurveAtTime(inCurve, resumeStart, remaining);
      }
      // Re-anchor the RAF-driven progress tick to the resumed clock — the
      // original startTime is shifted forward by however long the pause
      // lasted, so elapsed/duration math in the tick loop stays correct.
      const pauseDurationContextSeconds = resumeStart - this.pausedSnapshot.pausedAtContextTime;
      this.inFlightTransition = { ...this.inFlightTransition, startTime: this.inFlightTransition.startTime + pauseDurationContextSeconds };
      this.pausedSnapshot = null;
      if (this.onTransitionComplete) {
        const resolve = this.onTransitionComplete;
        const { startTime, duration, transitionId } = this.inFlightTransition;
        const tick = () => {
          const elapsed = ctx.currentTime - startTime;
          const t = Math.min(1, elapsed / duration);
          this.setState(outgoingDeckId, setDeckGain(this.states[outgoingDeckId], gainAtContextTime(outEnv, elapsed)));
          this.setState(incomingDeckId, setDeckGain(this.states[incomingDeckId], gainAtContextTime(inEnv, elapsed)));
          if (t >= 1) {
            // §16 — same idempotence guard as the normal-completion path.
            if (this.promotedTransitionIds.has(transitionId)) {
              this.inFlightTransition = null;
              this.onTransitionComplete = null;
              return;
            }
            this.promotedTransitionIds.add(transitionId);
            this.nodes[outgoingDeckId].audio.pause();
            this.setState(outgoingDeckId, resetDeckToIdle(outgoingDeckId));
            this.completedTransitionCount++;
            this.inFlightTransition = null;
            resolve();
            this.onTransitionComplete = null;
            return;
          }
          this.activeTransitionRaf = requestAnimationFrame(tick);
        };
        this.activeTransitionRaf = requestAnimationFrame(tick);
      }
    }
  }

  getPausedTransitionSnapshot(): PausedTransitionSnapshot | null {
    return this.pausedSnapshot;
  }

  getJitterMetrics(): TransitionSchedulingMetric[] {
    return this.jitterMetrics;
  }

  getLifecycleMetrics(): DualDeckLifecycleMetrics {
    return {
      activeAudioElements: 2,
      connectedMediaSources: this.ctx ? 2 : 0,
      connectedGainNodes: this.ctx ? 2 : 0,
      activeTimers: this.activeTransitionRaf != null ? 1 : 0,
      activeSubscriptions: this.listeners.size,
      // Object URLs (blob: sources) are the caller's responsibility to
      // create/revoke — this engine only ever receives a sourceUrl string
      // and assigns it to `<audio>.src`; it never calls
      // URL.createObjectURL itself, so it retains none.
      retainedObjectUrls: 0,
      completedTransitions: this.completedTransitionCount,
      cancelledTransitions: this.cancelledTransitionCount,
    };
  }

  // §21 — cancellation must stop scheduled automation, mute/stop the
  // incoming deck, and never leave both decks audibly active.
  cancelTransition(activeDeckId: "A" | "B", incomingDeckId: "A" | "B", _reason: TransitionCancellationReason) {
    const wasInFlight = this.inFlightTransition != null;
    if (this.activeTransitionRaf != null) {
      cancelAnimationFrame(this.activeTransitionRaf);
      this.activeTransitionRaf = null;
    }
    const ctx = this.ctx;
    if (ctx) {
      this.nodes[activeDeckId].gain.gain.cancelScheduledValues(ctx.currentTime);
      this.nodes[activeDeckId].gain.gain.setValueAtTime(1, ctx.currentTime);
      this.nodes[incomingDeckId].gain.gain.cancelScheduledValues(ctx.currentTime);
      this.nodes[incomingDeckId].gain.gain.setValueAtTime(0, ctx.currentTime);
    }
    this.nodes[incomingDeckId].audio.pause();
    this.setState(activeDeckId, setDeckGain(this.states[activeDeckId], 1));
    this.setState(incomingDeckId, resetDeckToIdle(incomingDeckId));
    // §16 — a cancelled transitionId must never promote later (blocks the
    // idempotence guard permanently for this id, same as a real promotion).
    if (this.inFlightTransition) this.promotedTransitionIds.add(this.inFlightTransition.transitionId);
    this.onTransitionComplete = null;
    this.inFlightTransition = null;
    this.pausedSnapshot = null;
    if (wasInFlight) this.cancelledTransitionCount++;
  }

  transitionProgress(outgoingDeckId: "A" | "B", plan: PlaylistTransitionPlan): number {
    return computeTransitionProgress(this.getCurrentTime(outgoingDeckId), plan);
  }

  // §21 — stop must release both decks, clear automation, and prevent any
  // hidden playback; distinct from destroy() in that the engine instance
  // stays usable afterward (destroy() additionally closes the AudioContext).
  stopAll() {
    if (this.activeTransitionRaf != null) {
      cancelAnimationFrame(this.activeTransitionRaf);
      this.activeTransitionRaf = null;
    }
    const ctx = this.ctx;
    (["A", "B"] as const).forEach((id) => {
      if (ctx) {
        this.nodes[id].gain.gain.cancelScheduledValues(ctx.currentTime);
        this.nodes[id].gain.gain.setValueAtTime(1, ctx.currentTime);
      }
      this.nodes[id].audio.pause();
      this.setState(id, resetDeckToIdle(id));
    });
    this.onTransitionComplete = null;
    this.inFlightTransition = null;
    this.pausedSnapshot = null;
  }

  destroy() {
    if (this.activeTransitionRaf != null) cancelAnimationFrame(this.activeTransitionRaf);
    (["A", "B"] as const).forEach((id) => {
      const n = this.nodes[id];
      n.audio.pause();
      n.audio.src = "";
    });
    this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}

function sampleCurve(env: GainEnvelope): Float32Array {
  const out = new Float32Array(CURVE_SAMPLE_COUNT);
  const span = env.endTimeContextSeconds - env.startTimeContextSeconds || 1;
  for (let i = 0; i < CURVE_SAMPLE_COUNT; i++) {
    const t = i / (CURVE_SAMPLE_COUNT - 1);
    out[i] = gainAtContextTime(env, env.startTimeContextSeconds + t * span);
  }
  return out;
}

// §13 — samples ONLY the remaining portion of an envelope (from
// `fromProgress`..1), remapped onto [0, CURVE_SAMPLE_COUNT-1] so
// setValueCurveAtTime can animate the rest of the SAME fade rather than
// restarting it from t=0.
function sampleRemainingCurve(env: GainEnvelope, fromProgress: number): Float32Array {
  const out = new Float32Array(CURVE_SAMPLE_COUNT);
  const span = env.endTimeContextSeconds - env.startTimeContextSeconds || 1;
  const clampedFrom = Math.max(0, Math.min(1, fromProgress));
  for (let i = 0; i < CURVE_SAMPLE_COUNT; i++) {
    const localT = i / (CURVE_SAMPLE_COUNT - 1);
    const t = clampedFrom + (1 - clampedFrom) * localT;
    out[i] = gainAtContextTime(env, env.startTimeContextSeconds + t * span);
  }
  return out;
}

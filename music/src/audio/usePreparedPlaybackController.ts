// Dual-Deck Playback and Crossfade Execution — React integration point
// (§7, §17, §27). Owns one DualDeckPlaybackEngine and drives it from the
// SAME playlist/preparation data App.tsx already has — this is the delegate
// the existing player authority hands off to when Prepared Playback is on,
// not a second independent player (contrast with the pre-existing
// DeckBPlayer/SamplerPlayer pattern, which this deliberately does not
// repeat). Standard playback (`audioRef` in App.tsx) is untouched and
// remains the default; this hook only takes the wheel when `enabled` is
// true AND the current adjacency is prepared-playback-eligible.

import { useEffect, useMemo, useRef, useState } from "react";
import type { Track } from "../data/trackTypes";
import type { TrackSlot } from "../data/playlistTypes";
import type { PlaylistPlaybackPreparation, PlaylistTransitionPlan } from "../data/playlistTransitionTypes";
import type {
  PlaybackDeckState, PlaylistPlaybackSession, PreparedPlaybackProgress,
  PlaybackAuthority, PlaybackAuthorityState, PlaybackAuthorityEvent,
  TransitionSchedulingMetric, DualDeckLifecycleMetrics,
  PreparedPlaybackHandoffPhase, PreparedPlaybackRuntimeFallback,
  HardCutExecutionResult,
} from "./dualDeckTypes";
import { DualDeckPlaybackEngine } from "./DualDeckPlaybackEngine";
import { evaluatePreparedPlaybackEligibility, resolveExecutionSyncMode, decideRuntimeTransitionPolicy } from "./transitionFallback";
import { shouldPreloadNextTrack, DEFAULT_PRELOAD_LEAD_SECONDS } from "./transitionScheduler";
import { buildInitialSession, findOutgoingPlan, derivePreparedProgress } from "./preparedPlaybackSession";
import { buildAuthorityState, decideSkipNext, resolvePreviousSlot, isLastAssignedSlot } from "./playbackAuthority";
// DJ Transition Engine (0722D) — active-mode adapter wiring. This hook is
// the ONE place a transition actually executes against the engine, so the
// authority gate is evaluated here, synchronously, immediately before the
// existing legacy transition logic — never a second scheduler/transport.
import type { DjTransitionMode } from "../logic/djTransitionModeStorage";
import type { DjTransitionPlan } from "../data/djTransitionTypes";
import type { CompleteSongAnalysis } from "../data/songAnalysisTypes";
import { assembleDjTransitionTrackEvidence } from "../logic/djTransitionEvidence";
import { selectDjTransitionRegions } from "../logic/djTransitionRegions";
import { sourceFingerprintFor, analysisRevisionMarkerFor } from "../logic/djTransitionShadowResolve";
import { evaluateDjTransitionAuthority, type DjTransitionAuthorityGateName } from "../logic/djTransitionAuthorityGate";
import { compileDjTransition, executeCompiledDjTransition, type DjTransitionExecutionStrategy } from "./djTransitionPlayback";

const MAX_EVENT_LOG = 20;
// §6 — recommended position-observation window (100-300ms).
const HANDOFF_READINESS_WINDOW_MS = 200;

// §5/§7 — a tagged error so the rollback catch block can distinguish "the
// engine failed to confirm audible readiness" (a specific, named reason)
// from any other unexpected rejection along the handoff chain.
class HandoffReadinessError extends Error {
  reason: string;
  constructor(reason: string) {
    super(`handoff_readiness_failed: ${reason}`);
    this.reason = reason;
  }
}

export interface PreparedPlaybackControllerParams {
  enabled: boolean;
  playlistId: string | undefined;
  slots: TrackSlot[];
  tracksById: Map<string, Track>;
  preparation: PlaylistPlaybackPreparation | undefined;
  resolveTrackUrl: (track: Track) => string | null;
  blockedTrackIds?: ReadonlySet<string>;
  startAtSlotId?: string;
  // §7/§17 — handoff from the standard player. When enabled flips true,
  // the engine's active deck is seeded at the CURRENT standard-playback
  // position (not restarted from 0) and the standard <audio> element is
  // paused so exactly one source is ever audible — never two independent
  // players running at once.
  standardPlaybackTimeSeconds: number;
  onHandoffToEngine: () => void;
  onHandoffToStandard: () => void;
  // DJ Transition Engine (0722D) — off by default; "shadow" never reaches
  // this hook's execution path at all (only the diagnostic panel resolves
  // in shadow mode). Only "active" is ever evaluated here.
  djTransitionMode?: DjTransitionMode;
  djTransitionPlans?: DjTransitionPlan[];
  songAnalyses?: CompleteSongAnalysis[];
}

// §8 diagnostics — distinguishes resolution/authorization/compilation/
// scheduling/execution explicitly rather than collapsing them into one
// "did it work" boolean, per this checkpoint's own reporting requirement.
export interface DjActiveExecutionDiagnostics {
  legacyTransitionId: string;
  djPlanId: string | null;
  authorized: boolean;
  gate: DjTransitionAuthorityGateName;
  reason: string;
  compiledStrategy: DjTransitionExecutionStrategy | null;
  executed: boolean;
  executionFailureReason: string | null;
  legacyExecutedInstead: boolean;
  recordedAt: string;
}

export interface PreparedPlaybackControllerResult {
  session: PlaylistPlaybackSession | null;
  decks: Record<"A" | "B", PlaybackDeckState> | null;
  progress: PreparedPlaybackProgress | null;
  fallbackReason?: string;
  // Prepared Playback Handoff and Hard-Cut Repair — §21 diagnostics: the
  // handoff phase and (on failure) the specific readiness reason, tracked
  // separately from `session` since a handoff can fail before any session
  // status transition would otherwise reflect it.
  handoffPhase: PreparedPlaybackHandoffPhase;
  handoffFailureReason?: string;
  runtimeFallback?: PreparedPlaybackRuntimeFallback;
  authority: PlaybackAuthority;
  authorityState: PlaybackAuthorityState | null;
  authorityEvents: PlaybackAuthorityEvent[];
  jitterMetrics: TransitionSchedulingMetric[];
  lifecycleMetrics: DualDeckLifecycleMetrics | null;
  // DJ Transition Engine (0722D) — the most recent authorization/
  // compilation/execution outcome for whichever adjacency was last
  // evaluated. Null until the first transition is attempted under
  // djTransitionMode==="active".
  djActiveDiagnostics: DjActiveExecutionDiagnostics | null;
  // §20 — transport command router. No-ops when authority is still
  // "standard_player" — the caller's existing standard controls remain
  // authoritative in that case (never command both systems at once).
  pause: () => void;
  resume: () => Promise<void>;
  seek: (seconds: number) => void;
  skipNext: () => Promise<void>;
  skipPrevious: () => Promise<void>;
  stop: () => void;
  // Dual-Deck Control Edge-Case Verification — deterministic mid-transition
  // pause trigger (§ Next Recommended Step in the 0714I report). Six live
  // attempts to catch a real ~4s crossfade via real-time polling proved
  // unreliable against remote-tool round-trip latency; this arms a one-shot
  // pause that fires from the SAME 250ms tick that already drives
  // transitionProgress, removing the timing race entirely. Debug/
  // verification use only — not part of the spec's public control surface.
  armMidTransitionPause: (atProgressFraction: number) => void;
}

export function usePreparedPlaybackController(params: PreparedPlaybackControllerParams): PreparedPlaybackControllerResult {
  const {
    enabled, playlistId, slots, tracksById, preparation, resolveTrackUrl, blockedTrackIds, startAtSlotId,
    standardPlaybackTimeSeconds, onHandoffToEngine, onHandoffToStandard,
    djTransitionMode = "off", djTransitionPlans = [], songAnalyses = [],
  } = params;
  const handoffTimeRef = useRef(standardPlaybackTimeSeconds);
  handoffTimeRef.current = standardPlaybackTimeSeconds;

  const engineRef = useRef<DualDeckPlaybackEngine | null>(null);
  const preloadedForRef = useRef<string | null>(null);
  const transitionRunningForRef = useRef<string | null>(null);
  const completedTrackIdsRef = useRef<string[]>([]);
  const [djActiveDiagnostics, setDjActiveDiagnostics] = useState<DjActiveExecutionDiagnostics | null>(null);

  const [session, setSession] = useState<PlaylistPlaybackSession | null>(null);
  const [decks, setDecks] = useState<Record<"A" | "B", PlaybackDeckState> | null>(null);
  const [authority, setAuthority] = useState<PlaybackAuthority>("standard_player");
  const [authorityEvents, setAuthorityEvents] = useState<PlaybackAuthorityEvent[]>([]);
  const [tick, setTick] = useState(0); // forces re-render to pick up jitter/lifecycle metrics from the engine instance
  const [handoffPhase, setHandoffPhase] = useState<PreparedPlaybackHandoffPhase>("idle");
  const [handoffFailureReason, setHandoffFailureReason] = useState<string | undefined>(undefined);

  // §8 — no-silent-clock watchdog: tracks authority/preparation via refs (not
  // closed-over state) so the tick effect's dependency array doesn't need to
  // include them, matching the existing sessionRef/decksRef pattern.
  const authorityRef = useRef<PlaybackAuthority>("standard_player");
  authorityRef.current = authority;
  const preparationRef = useRef<PlaylistPlaybackPreparation | undefined>(preparation);
  preparationRef.current = preparation;
  const watchdogPrevPositionRef = useRef<number | null>(null);
  // §12 — shared by both the scheduled (tick) and media-ended trigger paths,
  // assigned by the tick effect (which has the full closure it needs) and
  // invoked by the engine-lifecycle effect's `ended` subscription.
  const executeTransitionRef = useRef<((plan: PlaylistTransitionPlan, trigger: "scheduled" | "media_ended") => void) | null>(null);

  // Dual-Deck Control Edge-Case Verification (0714_MUSIC_Dual_Deck_Control_
  // Edge_Case_Verification v1.0.0) — §12 "stale closure in subscription
  // callback" / "delayed React state update". The tick interval previously
  // had `session` in its dependency array, so it was torn down and rebuilt
  // on EVERY session change — including every 250ms transition-progress
  // update and every promotion, i.e. dozens of times during a single
  // crossfade. Reading current session/decks through refs instead lets the
  // interval live for the lifetime of `enabled`+`playlistId`, eliminating
  // that churn as a source of races near promotion/end-of-playlist
  // boundaries.
  const sessionRef = useRef<PlaylistPlaybackSession | null>(null);
  sessionRef.current = session;
  const decksRef = useRef<Record<"A" | "B", PlaybackDeckState> | null>(null);
  decksRef.current = decks;
  const midTransitionPauseArmedAtRef = useRef<number | null>(null);

  function emitEvent(e: PlaybackAuthorityEvent) {
    setAuthorityEvents((prev) => [...prev.slice(-(MAX_EVENT_LOG - 1)), e]);
  }

  const slotsById = useMemo(() => new Map(slots.map((s) => [s.slotId, s])), [slots]);

  // Engine lifecycle — one instance per mount, torn down on unmount or when
  // Prepared Playback is switched off (never leaves orphaned AudioNodes).
  useEffect(() => {
    if (!enabled) {
      engineRef.current?.destroy();
      engineRef.current = null;
      setSession(null);
      setDecks(null);
      completedTrackIdsRef.current = [];
      setHandoffPhase("idle");
      setHandoffFailureReason(undefined);
      watchdogPrevPositionRef.current = null;
      onHandoffToStandard();
      setAuthority((prev) => {
        if (prev === "dual_deck_engine") emitEvent({ type: "authority_released", from: "dual_deck_engine", reason: "user_disabled_prepared_mode" });
        return "standard_player";
      });
      return;
    }
    const engine = new DualDeckPlaybackEngine();
    engineRef.current = engine;
    const unsubscribe = engine.subscribe((next) => setDecks(next));
    // §12 — media-ended trigger path: when the ACTIVE deck ends, check for a
    // pending outgoing plan on the current slot and, if one exists, run it
    // through the SAME executor as the scheduled path (idempotence guard
    // lives in the engine, so whichever trigger arrives first wins safely).
    const unsubscribeEnded = engine.onDeckEnded((deckId) => {
      const s = sessionRef.current;
      if (!s || s.activeDeckId !== deckId) return;
      const plan = findOutgoingPlan(preparationRef.current, s.currentSlotId);
      if (!plan) return;
      executeTransitionRef.current?.(plan, "media_ended");
    });
    return () => {
      unsubscribe();
      unsubscribeEnded();
      engine.destroy();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // DJ Transition Engine (0722D) §7 mode safety — switching active->shadow
  // or active->off must restore the normal (bypassed) engine path
  // immediately, not just stop attempting new DJ executions on the next
  // tick. Clean Cut never engages the EQ chain, so in practice this is a
  // defensive no-op today, but it's the correct, explicit mechanism for
  // when a future family does use it.
  useEffect(() => {
    if (djTransitionMode === "active") return;
    const engine = engineRef.current;
    if (!engine) return;
    engine.bypassDeckEq("A");
    engine.bypassDeckEq("B");
  }, [djTransitionMode]);

  // §27 — session is rebuilt from the playlist + preparation record, never
  // persisted or restored from a serialized runtime snapshot. §7/§17 — the
  // engine's active deck is seeded at the standard player's CURRENT
  // position (a real handoff, not a restart-from-zero), and the standard
  // <audio> element is paused the moment the engine deck is confirmed
  // playing — never two audible sources at once.
  useEffect(() => {
    if (!enabled || !playlistId) return;
    const engine = engineRef.current;
    if (!engine) return;
    const initial = buildInitialSession(playlistId, slots);
    const startSlotId = startAtSlotId ?? initial.currentSlotId;
    const startSlot = startSlotId ? slotsById.get(startSlotId) : undefined;
    const startTrack = startSlot?.assignedTrackId ? tracksById.get(startSlot.assignedTrackId) : undefined;
    completedTrackIdsRef.current = [];
    preloadedForRef.current = null;
    transitionRunningForRef.current = null;

    if (startSlot && startTrack) {
      const url = resolveTrackUrl(startTrack);
      if (url) {
        // §6 — handoff sequence: prepare → start engine → confirm audible
        // readiness → ONLY THEN switch authority. Standard playback remains
        // authoritative (audible, uninterrupted) through every step until
        // readiness is confirmed — the core safety rule (§4): engine state
        // saying "playing" is never treated as sufficient on its own.
        setHandoffPhase("preparing");
        emitEvent({ type: "authority_handoff_started", from: "standard_player", to: "dual_deck_engine" });
        (async () => {
          try {
            await engine.preload("A", {
              trackId: startTrack.trackId, slotId: startSlot.slotId, sourceUrl: url,
              cueStartSeconds: handoffTimeRef.current,
            });
            setHandoffPhase("starting_engine");
            // §4/§5 — preload() intentionally starts the deck silent (gain
            // 0) for the crossfade case; this is a solo, non-crossfade start
            // with no envelope to raise it back — restore full gain before
            // confirming audible readiness, or readiness would correctly
            // (but avoidably) fail with gain_zero every single handoff.
            engine.setDeckGainValue("A", 1);
            await engine.playDeck("A");
            setHandoffPhase("confirming_audible_readiness");
            const readiness = await engine.confirmAudibleReadiness("A", HANDOFF_READINESS_WINDOW_MS);
            if (!readiness.ok) {
              throw new HandoffReadinessError(readiness.failureReason ?? "unknown");
            }
            // §6 — only switch authority AFTER the engine confirms playback
            // AND confirms genuinely audible output.
            onHandoffToEngine();
            setAuthority("dual_deck_engine");
            setHandoffPhase("completed");
            setHandoffFailureReason(undefined);
            emitEvent({ type: "authority_handoff_completed", from: "standard_player", to: "dual_deck_engine" });
            setSession((s) => (s ? { ...s, status: "playing" } : s));
          } catch (err) {
            // §7 — rollback: engine deck stops, gain automation is cleared
            // (pauseDeck already reflects "not audible" in state), authority
            // is never granted, standard playback remains untouched and
            // audible throughout — there is no "pause standard first" step
            // to undo because standard playback was never paused.
            const reason = err instanceof HandoffReadinessError ? err.reason : "source_error";
            engine.pauseDeck("A");
            setHandoffPhase("rolled_back");
            setHandoffFailureReason(reason);
            emitEvent({ type: "authority_handoff_failed", from: "standard_player", to: "dual_deck_engine", reason });
            setSession((s) => (s ? { ...s, fallbackReason: reason } : s));
          }
        })();
      }
    }

    setSession({
      ...initial,
      currentSlotId: startSlot?.slotId,
      currentTrackId: startSlot?.assignedTrackId,
      preparedPlaybackEnabled: true,
      status: "loading",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, playlistId]);

  // Main tick — polls the active deck's currentTime to decide preload/
  // transition timing (§9, §10). requestAnimationFrame would also work;
  // interval keeps this independent of visible-tab throttling assumptions.
  // Reads session/decks via refs (not the closed-over state values) so this
  // effect does NOT need `session`/`decks` in its dependency array — it no
  // longer tears down and rebuilds on every transition-progress tick or
  // promotion (previously dozens of times per crossfade), removing that
  // churn as a source of races near promotion/end-of-playlist boundaries.
  useEffect(() => {
    if (!enabled) return;
    const engine = engineRef.current;
    if (!engine) return;
    const eng: DualDeckPlaybackEngine = engine;

    function promoteAfterTransition(plan: PlaylistTransitionPlan, activeDeckId: "A" | "B", incomingDeckId: "A" | "B") {
      completedTrackIdsRef.current = [...completedTrackIdsRef.current, plan.fromTrackId];
      setSession((s) => {
        if (!s) return s;
        return {
          ...s,
          currentPosition: plan.toPosition,
          currentSlotId: plan.toSlotId,
          currentTrackId: plan.toTrackId,
          activeDeckId: incomingDeckId,
          incomingDeckId: activeDeckId,
          status: "playing",
          activeTransitionId: undefined,
          transitionProgress: undefined,
        };
      });
      preloadedForRef.current = null;
      transitionRunningForRef.current = null;
      emitEvent({ type: "active_deck_promoted", previousDeckId: activeDeckId, nextDeckId: incomingDeckId });
      setTick((t) => t + 1);
    }

    // §16 — shared by the legacy hard-cut path and the DJ Transition Engine
    // active-mode path: one retry of playDeck() before giving up, exactly
    // as originally written for legacy hard cuts. Reused rather than
    // duplicated so both paths share identical, already-proven recovery
    // semantics.
    async function runHardCutWithRetry(
      transitionId: string, activeDeckId: "A" | "B", incomingDeckId: "A" | "B", trigger: "scheduled" | "media_ended",
    ): Promise<HardCutExecutionResult> {
      let result = await eng.executeHardCut(transitionId, activeDeckId, incomingDeckId, trigger);
      if (!result.executed && result.reason === "incoming_not_ready") {
        try { await eng.playDeck(incomingDeckId); } catch { /* handled by the retry result below */ }
        result = await eng.executeHardCut(transitionId, activeDeckId, incomingDeckId, trigger);
      }
      return result;
    }

    // Same retry shape as runHardCutWithRetry, but routed through the
    // djTransitionPlayback.ts adapter (compile -> execute) rather than
    // calling eng.executeHardCut directly, so the adapter's own explicit
    // EQ-bypass defense-in-depth (§2) actually runs on every DJ attempt.
    async function runDjHardCutWithRetry(
      compiled: import("./djTransitionPlayback").CompiledDjTransitionExecution,
      activeDeckId: "A" | "B", incomingDeckId: "A" | "B", trigger: "scheduled" | "media_ended",
    ): Promise<HardCutExecutionResult> {
      let outcome = await executeCompiledDjTransition(eng, compiled, activeDeckId, incomingDeckId, trigger);
      if (!outcome.executed && outcome.reason === "incoming_not_ready") {
        try { await eng.playDeck(incomingDeckId); } catch { /* handled by the retry result below */ }
        outcome = await executeCompiledDjTransition(eng, compiled, activeDeckId, incomingDeckId, trigger);
      }
      return { executed: outcome.executed, reason: outcome.reason as HardCutExecutionResult["reason"] };
    }

    // DJ Transition Engine (0722D) §3 — the full authority gate evaluated
    // synchronously, immediately before any engine mutation. Re-derives
    // evidence/regions from CURRENTLY in-memory track data (no I/O — stem
    // availability is intentionally passed as {} here, since the only
    // family this build can execute, clean_cut, never depends on stems;
    // see djTransitionAuthorityGate.ts's own header comment for why a
    // synchronous re-check is correct here rather than a fresh async
    // resolution).
    function evaluateDjAuthorizationForLegacyPlan(legacyPlan: PlaylistTransitionPlan, activeDeckId: "A" | "B", incomingDeckId: "A" | "B") {
      const outgoingTrack = tracksById.get(legacyPlan.fromTrackId);
      const incomingTrack = tracksById.get(legacyPlan.toTrackId);
      const djPlan = djTransitionPlans.find((p) => p.outgoingSlotId === legacyPlan.fromSlotId && p.incomingSlotId === legacyPlan.toSlotId);

      if (!outgoingTrack || !incomingTrack) {
        return {
          authorization: { authorized: false, gate: "no_plan_for_pair" as const, reason: "Missing track data for this adjacency." },
          djPlan, compiled: null,
        };
      }

      const outgoingSongAnalysis = songAnalyses.find((a) => a.sourceTrackId === outgoingTrack.trackId);
      const incomingSongAnalysis = songAnalyses.find((a) => a.sourceTrackId === incomingTrack.trackId);

      const outgoingEvidence = assembleDjTransitionTrackEvidence({
        track: outgoingTrack, beatMap: outgoingTrack.beatMap, playbackBounds: outgoingTrack.playbackBounds,
        songAnalysis: outgoingSongAnalysis, currentStemRoleAvailability: {},
        sourceFingerprint: sourceFingerprintFor(outgoingTrack, outgoingSongAnalysis),
      });
      const incomingEvidence = assembleDjTransitionTrackEvidence({
        track: incomingTrack, beatMap: incomingTrack.beatMap, playbackBounds: incomingTrack.playbackBounds,
        songAnalysis: incomingSongAnalysis, currentStemRoleAvailability: {},
        sourceFingerprint: sourceFingerprintFor(incomingTrack, incomingSongAnalysis),
      });
      const outgoingRegionsNow = selectDjTransitionRegions({ side: "outgoing", evidence: outgoingEvidence, playbackBounds: outgoingTrack.playbackBounds });
      const incomingRegionsNow = selectDjTransitionRegions({ side: "incoming", evidence: incomingEvidence, playbackBounds: incomingTrack.playbackBounds });

      const deckStates = eng.getState();
      // Deck-specific readiness is decided INSIDE evaluateDjTransitionAuthority
      // via two distinct predicates (isOutgoingDeckReadyForCleanCut /
      // isIncomingDeckReadyToStart) — this call site only supplies the raw
      // current state strings, never a pre-collapsed boolean, so the gate
      // itself stays the one place that decides what "ready" means for
      // each side.
      const outgoingDeckState = deckStates[activeDeckId].state;
      const incomingDeckState = deckStates[incomingDeckId].state;

      const authorization = evaluateDjTransitionAuthority({
        djTransitionMode, plan: djPlan,
        currentOutgoingTrackId: outgoingTrack.trackId, currentIncomingTrackId: incomingTrack.trackId,
        currentOutgoingSourceFingerprint: sourceFingerprintFor(outgoingTrack, outgoingSongAnalysis),
        currentIncomingSourceFingerprint: sourceFingerprintFor(incomingTrack, incomingSongAnalysis),
        currentAnalysisRevisionKey: `${analysisRevisionMarkerFor(outgoingTrack)}::${analysisRevisionMarkerFor(incomingTrack)}`,
        outgoingRegionsNow, incomingRegionsNow,
        // clean_cut, the only supported family, never touches stems — always
        // false is the honest value for this family, not a guess.
        activeStemSetLostCurrency: false,
        outgoingDeckState, incomingDeckState,
      });

      const compiled = authorization.authorized && djPlan ? compileDjTransition(djPlan) : null;
      return { authorization, djPlan, compiled };
    }

    // §17/§18 — the ONE place plan.status is read at runtime and turned into
    // a policy decision (needs_review → conservative hard cut; blocked →
    // hard cut if the incoming track is playable, otherwise explicit stop).
    // §11-§14 — hard cut is reachable from BOTH the scheduled tick (this
    // function called with trigger="scheduled") and the media `ended` event
    // (called with trigger="media_ended" from the engine-lifecycle effect's
    // subscription) — both share the engine's promotion idempotence guard.
    // The existing, UNMODIFIED legacy transition logic (only the hard_cut
    // branch now calls the shared runHardCutWithRetry helper instead of
    // inlining its own copy — identical behavior, no duplication). This is
    // exactly what ran before this build whenever djTransitionMode is not
    // "active", and exactly what the DJ path falls back to on a pre-
    // control-transfer failure (§4).
    function runLegacyTransition(plan: PlaylistTransitionPlan, trigger: "scheduled" | "media_ended") {
      if (transitionRunningForRef.current === plan.transitionId) return;
      const session = sessionRef.current;
      if (!session) return;
      const activeDeckId = session.activeDeckId;
      const incomingDeckId = session.incomingDeckId;

      const { mode: resolvedMode } = resolveExecutionSyncMode(plan, 1.0);
      if (resolvedMode === "unsynced") {
        setSession((s) => (s ? { ...s, fallbackReason: "plan_unsynced" } : s));
        return;
      }
      const executionModeAfterSync = resolvedMode === "phrase_sync" ? "timed_crossfade" : resolvedMode;

      const toTrack = tracksById.get(plan.toTrackId);
      const incomingTrackPlayable = !!(toTrack && resolveTrackUrl(toTrack));
      const policy = decideRuntimeTransitionPolicy(plan, executionModeAfterSync, incomingTrackPlayable);

      if (policy.stopWithError) {
        // §18 — a blocked adjacency with no playable fallback: stop with an
        // explicit error rather than silently ending the playlist or
        // disabling the rest of the prepared session.
        transitionRunningForRef.current = plan.transitionId;
        eng.stopAll();
        setAuthority("standard_player");
        emitEvent({ type: "authority_released", from: "dual_deck_engine", reason: "blocked_transition_no_fallback" });
        setSession((s) => (s ? { ...s, status: "error", fallbackReason: "blocked_transition_no_fallback", runtimeFallback: "stopped" } : s));
        onHandoffToStandard();
        return;
      }

      transitionRunningForRef.current = plan.transitionId;
      setSession((s) => (s ? {
        ...s, status: "transitioning", activeTransitionId: plan.transitionId,
        runtimeFallback: policy.runtimeFallback,
      } : s));

      if (policy.mode === "hard_cut") {
        void (async () => {
          const result = await runHardCutWithRetry(plan.transitionId, activeDeckId, incomingDeckId, trigger);
          if (result.executed) {
            promoteAfterTransition(plan, activeDeckId, incomingDeckId);
            return;
          }
          if (result.reason === "already_promoted") {
            // Another trigger (scheduled vs. media_ended) already completed
            // this exact transitionId — treat as success, not a failure.
            transitionRunningForRef.current = null;
            return;
          }
          // §16 — incoming deck could not be started even after one retry:
          // release prepared mode and stop with an explicit error rather
          // than leaving the session on an ended outgoing deck.
          eng.stopAll();
          setAuthority("standard_player");
          emitEvent({ type: "authority_released", from: "dual_deck_engine", reason: "hard_cut_failed" });
          setSession((s) => (s ? { ...s, status: "error", fallbackReason: "hard_cut_failed", runtimeFallback: "stopped" } : s));
          onHandoffToStandard();
        })();
        return;
      }

      eng.runTransition(plan, policy.mode, activeDeckId, incomingDeckId).then(() => {
        promoteAfterTransition(plan, activeDeckId, incomingDeckId);
      }).catch(() => {
        // Unexpected engine rejection on a non-hard-cut path — never leave
        // the session stuck mid-transition; release prepared mode.
        eng.stopAll();
        setAuthority("standard_player");
        emitEvent({ type: "authority_released", from: "dual_deck_engine", reason: "transition_execution_failed" });
        setSession((s) => (s ? { ...s, status: "error", fallbackReason: "transition_execution_failed", runtimeFallback: "stopped" } : s));
        onHandoffToStandard();
      });
    }

    // §17/§18 — the ONE place plan.status is read at runtime and turned into
    // a policy decision (needs_review → conservative hard cut; blocked →
    // hard cut if the incoming track is playable, otherwise explicit stop).
    // §11-§14 — hard cut is reachable from BOTH the scheduled tick (this
    // function called with trigger="scheduled") and the media `ended` event
    // (called with trigger="media_ended" from the engine-lifecycle effect's
    // subscription) — both share the engine's promotion idempotence guard.
    //
    // DJ Transition Engine (0722D) — this is the public entry point both
    // triggers actually call. It evaluates DJ authorization FIRST, fully
    // synchronously and without touching the engine; only once authorized
    // AND compiled does it ever call into the engine via the DJ path.
    // Everything else — unauthorized, uncompilable, wrong mode — falls
    // straight through to runLegacyTransition, unchanged.
    function runTransitionForPlan(plan: PlaylistTransitionPlan, trigger: "scheduled" | "media_ended") {
      if (transitionRunningForRef.current === plan.transitionId) return;
      const session = sessionRef.current;
      if (!session) return;
      const activeDeckId = session.activeDeckId;
      const incomingDeckId = session.incomingDeckId;

      const { authorization, djPlan, compiled } = evaluateDjAuthorizationForLegacyPlan(plan, activeDeckId, incomingDeckId);

      function recordDjDiagnostics(patch: Partial<DjActiveExecutionDiagnostics>) {
        setDjActiveDiagnostics({
          legacyTransitionId: plan.transitionId,
          djPlanId: djPlan?.id ?? null,
          authorized: authorization.authorized,
          gate: authorization.gate,
          reason: authorization.reason,
          compiledStrategy: compiled && compiled.compiled ? compiled.strategy : null,
          executed: false,
          executionFailureReason: null,
          legacyExecutedInstead: false,
          recordedAt: new Date().toISOString(),
          ...patch,
        });
      }

      if (authorization.authorized && compiled && compiled.compiled) {
        const djPlanId = compiled.djPlanId;
        transitionRunningForRef.current = plan.transitionId;
        setSession((s) => (s ? { ...s, status: "transitioning", activeTransitionId: djPlanId, runtimeFallback: undefined } : s));
        recordDjDiagnostics({});
        void (async () => {
          const result = await runDjHardCutWithRetry(compiled, activeDeckId, incomingDeckId, trigger);
          if (result.executed) {
            recordDjDiagnostics({ executed: true });
            promoteAfterTransition(plan, activeDeckId, incomingDeckId);
            return;
          }
          if (result.reason === "already_promoted") {
            transitionRunningForRef.current = null;
            recordDjDiagnostics({ executed: true, executionFailureReason: "already_promoted" });
            return;
          }
          if (result.reason === "incoming_not_ready") {
            // §4 atomic fallback, pre-control-transfer case: the readiness
            // check is the very first thing executeHardCut does, before any
            // gain/pause mutation — nothing was touched. Safe to cancel the
            // DJ attempt cleanly and run the existing legacy transition,
            // completely unchanged.
            recordDjDiagnostics({ executed: false, executionFailureReason: "incoming_not_ready", legacyExecutedInstead: true });
            transitionRunningForRef.current = null;
            runLegacyTransition(plan, trigger);
            return;
          }
          // §4 atomic fallback, post-control-transfer case (incoming_play_
          // failed, or an unexpected rejection): the outgoing deck has
          // already been silenced and paused by executeHardCut before this
          // reason is ever returned. Blindly replaying the legacy schedule
          // here — which might resolve to a multi-second crossfade
          // expecting the outgoing deck to still be audibly playing — would
          // not be a safe recovery. The deterministic, engine-state-aware
          // recovery is the same terminal action the legacy hard-cut path
          // already takes at its own worst case: stop everything and hand
          // control back to the standard player.
          recordDjDiagnostics({ executed: false, executionFailureReason: result.reason ?? "unknown", legacyExecutedInstead: false });
          eng.stopAll();
          setAuthority("standard_player");
          emitEvent({ type: "authority_released", from: "dual_deck_engine", reason: "dj_transition_failed" });
          setSession((s) => (s ? { ...s, status: "error", fallbackReason: "dj_transition_failed", runtimeFallback: "stopped" } : s));
          onHandoffToStandard();
        })();
        return;
      }

      recordDjDiagnostics({ legacyExecutedInstead: true });
      runLegacyTransition(plan, trigger);
    }

    executeTransitionRef.current = runTransitionForPlan;

    const interval = window.setInterval(() => {
      const session = sessionRef.current;
      if (!session) return;

      // Root cause of the reported "position stuck" family of symptoms:
      // PlaybackDeckState.currentTimeSeconds was only ever set at load
      // time and never refreshed — sync both decks' REAL <audio>.currentTime
      // into state every tick, unconditionally (even at end-of-playlist),
      // so the UI's position display can never silently freeze while the
      // deck's own playing/gain state stays correct.
      engine.syncDeckPosition(session.activeDeckId);
      engine.syncDeckPosition(session.incomingDeckId);

      // §8 — no-silent-clock watchdog: if the engine's active-deck position
      // is advancing while every audible-output condition is false, this is
      // a safety net (not the primary readiness mechanism, which is the
      // handoff sequence's own confirmAudibleReadiness check) — release
      // engine authority and attempt standard-player recovery immediately.
      if (authorityRef.current === "dual_deck_engine") {
        const activeState = engine.getState()[session.activeDeckId];
        const prevPos = watchdogPrevPositionRef.current;
        const currPos = activeState.currentTimeSeconds;
        // Only evaluate the watchdog while the deck's OWN reported state
        // claims "playing" — a legitimate, user-initiated pause (or any
        // other non-playing state) already reports itself accurately and
        // must never be treated as a silent-clock defect. Comparing this
        // tick's position against the LAST "playing" sample (not simply the
        // previous tick, which may straddle a just-issued pause) avoids a
        // false trigger from position still reading a hair above its
        // pre-pause value while pause() takes effect.
        if (activeState.state === "playing") {
          const graph = engine.getGraphState(session.activeDeckId);
          const audibleOk = graph.mediaSourceConnected
            && engine.getContextState() === "running"
            && activeState.gain > 0
            && !activeState.muted;
          if (prevPos != null && currPos > prevPos && !audibleOk) {
            engine.stopAll();
            setAuthority("standard_player");
            emitEvent({ type: "authority_released", from: "dual_deck_engine", reason: "silent_clock_detected" });
            setSession((s) => (s ? { ...s, fallbackReason: "silent_clock_detected", runtimeFallback: "standard_player" } : s));
            onHandoffToStandard();
            watchdogPrevPositionRef.current = null;
            return;
          }
          watchdogPrevPositionRef.current = currPos;
        } else {
          watchdogPrevPositionRef.current = null;
        }
      } else {
        watchdogPrevPositionRef.current = null;
      }

      // End of playlist: the last assigned slot has no outgoing plan by
      // design — this is a normal, expected state, never a fallback/error.
      if (isLastAssignedSlot(slots, session.currentSlotId) && !findOutgoingPlan(preparation, session.currentSlotId)) {
        if (session.status !== "complete") {
          setSession((s) => (s ? { ...s, status: "complete", fallbackReason: undefined, runtimeFallback: "none" } : s));
        }
        return;
      }

      const eligibility = evaluatePreparedPlaybackEligibility(slots, tracksById, preparation, session.currentSlotId, blockedTrackIds);
      if (!eligibility.eligible) {
        setSession((s) => (s ? { ...s, fallbackReason: eligibility.reason } : s));
        return;
      }
      const plan = findOutgoingPlan(preparation, session.currentSlotId);
      if (!plan) return;

      const activeDeckId = session.activeDeckId;
      const incomingDeckId = session.incomingDeckId;
      const currentTime = engine.getCurrentTime(activeDeckId);

      // Preload (§9)
      if (preloadedForRef.current !== plan.transitionId && shouldPreloadNextTrack(currentTime, plan, DEFAULT_PRELOAD_LEAD_SECONDS)) {
        const toTrack = tracksById.get(plan.toTrackId);
        const toSlot = slotsById.get(plan.toSlotId);
        const url = toTrack ? resolveTrackUrl(toTrack) : null;
        if (toTrack && toSlot && url) {
          preloadedForRef.current = plan.transitionId;
          engine.preload(incomingDeckId, {
            trackId: toTrack.trackId, slotId: toSlot.slotId, sourceUrl: url,
            cueStartSeconds: plan.incomingCueSeconds,
          }).catch(() => {
            setSession((s) => (s ? { ...s, fallbackReason: "source_error" } : s));
          });
        }
      }

      // Transition execution — scheduled path (§10, §12). The media-ended
      // path is wired separately (engine-lifecycle effect's onDeckEnded
      // subscription), sharing this SAME runTransitionForPlan function via
      // executeTransitionRef.
      if (transitionRunningForRef.current !== plan.transitionId && currentTime >= plan.outgoingCueSeconds) {
        runTransitionForPlan(plan, "scheduled");
      } else if (transitionRunningForRef.current === plan.transitionId) {
        const liveProgress = engine.transitionProgress(activeDeckId, plan);
        setSession((s) => (s ? { ...s, transitionProgress: liveProgress } : s));
        // Deterministic mid-transition pause trigger — fires from this SAME
        // tick, eliminating the real-time-polling race entirely.
        const armedAt = midTransitionPauseArmedAtRef.current;
        if (armedAt != null && liveProgress >= armedAt) {
          midTransitionPauseArmedAtRef.current = null;
          engine.pauseAll();
          setSession((s) => (s ? { ...s } : s));
        }
      }
    }, 250);

    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, slots, tracksById, preparation, blockedTrackIds, resolveTrackUrl, slotsById, djTransitionMode, djTransitionPlans, songAnalyses]);

  const progress = useMemo(() => {
    if (!enabled || !session || !playlistId) return null;
    return derivePreparedProgress(
      slots, tracksById, preparation,
      completedTrackIdsRef.current, session.currentTrackId,
      decks && session ? engineRef.current?.getCurrentTime(session.activeDeckId) ?? 0 : 0,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, session, slots, tracksById, preparation, decks, playlistId]);

  // §20 — transport command router. Every command is a no-op unless
  // `authority === "dual_deck_engine"` — the caller's existing standard
  // controls remain in charge otherwise (never command both systems).
  function pause() {
    if (authority !== "dual_deck_engine") return;
    engineRef.current?.pauseAll();
    setSession((s) => (s ? { ...s } : s));
  }

  async function resume() {
    if (authority !== "dual_deck_engine") return;
    await engineRef.current?.resumeAll();
    setSession((s) => (s ? { ...s } : s));
  }

  function seek(seconds: number) {
    if (authority !== "dual_deck_engine" || !session) return;
    const engine = engineRef.current;
    if (!engine) return;
    const plan = findOutgoingPlan(preparation, session.currentSlotId);
    // §16 — seeking into (or past) the transition window cancels it safely
    // rather than attempting arbitrary partial-crossfade reconstruction.
    if (session.status === "transitioning" && plan) {
      engine.cancelTransition(session.activeDeckId, session.incomingDeckId, "seek");
      transitionRunningForRef.current = null;
      preloadedForRef.current = null;
      setSession((s) => (s ? { ...s, status: "playing", activeTransitionId: undefined, transitionProgress: undefined } : s));
    }
    engine.seekDeck(session.activeDeckId, seconds);
  }

  async function skipNext() {
    if (authority !== "dual_deck_engine" || !session) return;
    const engine = engineRef.current;
    if (!engine || !decks) return;
    if (session.status === "transitioning") {
      engine.cancelTransition(session.activeDeckId, session.incomingDeckId, "skip");
      transitionRunningForRef.current = null;
      preloadedForRef.current = null;
    }
    const decision = decideSkipNext(slots, tracksById, session, decks);
    if (!decision) return;
    const outgoingDeckId = session.activeDeckId;
    engine.pauseDeck(outgoingDeckId);
    if (decision.action === "promote") {
      await engine.playDeck(session.incomingDeckId);
      completedTrackIdsRef.current = [...completedTrackIdsRef.current, session.currentTrackId ?? ""];
      setSession((s) => (s ? {
        ...s, currentPosition: s.currentPosition + 1, currentSlotId: decision.targetSlot.slotId, currentTrackId: decision.targetTrack.trackId,
        activeDeckId: s.incomingDeckId, incomingDeckId: s.activeDeckId, status: "playing", activeTransitionId: undefined, transitionProgress: undefined,
      } : s));
      emitEvent({ type: "active_deck_promoted", previousDeckId: outgoingDeckId, nextDeckId: session.incomingDeckId });
    } else {
      const url = resolveTrackUrl(decision.targetTrack);
      if (!url) return;
      await engine.preload(outgoingDeckId, { trackId: decision.targetTrack.trackId, slotId: decision.targetSlot.slotId, sourceUrl: url, cueStartSeconds: 0 });
      // §4/§5 — solo (non-crossfade) start: restore full gain, same fix as
      // the initial handoff sequence (preload() leaves gain at 0).
      engine.setDeckGainValue(outgoingDeckId, 1);
      await engine.playDeck(outgoingDeckId);
      setSession((s) => (s ? {
        ...s, currentPosition: s.currentPosition + 1, currentSlotId: decision.targetSlot.slotId, currentTrackId: decision.targetTrack.trackId,
        status: "playing", activeTransitionId: undefined, transitionProgress: undefined,
      } : s));
    }
    preloadedForRef.current = null;
  }

  async function skipPrevious() {
    if (authority !== "dual_deck_engine" || !session) return;
    const engine = engineRef.current;
    if (!engine) return;
    if (session.status === "transitioning") {
      engine.cancelTransition(session.activeDeckId, session.incomingDeckId, "skip");
      transitionRunningForRef.current = null;
      preloadedForRef.current = null;
    }
    const prevSlot = resolvePreviousSlot(slots, session.currentSlotId);
    if (!prevSlot || !prevSlot.assignedTrackId) return;
    const prevTrack = tracksById.get(prevSlot.assignedTrackId);
    if (!prevTrack) return;
    const url = resolveTrackUrl(prevTrack);
    if (!url) return;
    // §18 — never reuse stale incoming-deck state; reset roles to A active.
    engine.pauseDeck(session.activeDeckId);
    engine.pauseDeck(session.incomingDeckId);
    await engine.preload("A", { trackId: prevTrack.trackId, slotId: prevSlot.slotId, sourceUrl: url, cueStartSeconds: 0 });
    // §4/§5 — solo (non-crossfade) start: restore full gain, same fix as
    // the initial handoff sequence (preload() leaves gain at 0).
    engine.setDeckGainValue("A", 1);
    await engine.playDeck("A");
    completedTrackIdsRef.current = completedTrackIdsRef.current.slice(0, -1);
    setSession((s) => (s ? {
      ...s, currentPosition: Math.max(0, s.currentPosition - 1), currentSlotId: prevSlot.slotId, currentTrackId: prevTrack.trackId,
      activeDeckId: "A", incomingDeckId: "B", status: "playing", activeTransitionId: undefined, transitionProgress: undefined,
    } : s));
    preloadedForRef.current = null;
  }

  function stop() {
    if (authority !== "dual_deck_engine") return;
    engineRef.current?.stopAll();
    emitEvent({ type: "authority_released", from: "dual_deck_engine", reason: "unknown" });
    setSession(null);
    setAuthority("standard_player");
  }

  const nowMs = typeof performance !== "undefined" ? performance.now() : Date.now();
  const authorityState = useMemo(
    () => buildAuthorityState(
      authority,
      { positionSeconds: standardPlaybackTimeSeconds, isPlaying: false, isPaused: false },
      session, decks, nowMs,
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [authority, session, decks, standardPlaybackTimeSeconds, tick],
  );

  function armMidTransitionPause(atProgressFraction: number) {
    midTransitionPauseArmedAtRef.current = Math.max(0, Math.min(1, atProgressFraction));
  }

  return {
    session, decks, progress, fallbackReason: session?.fallbackReason,
    handoffPhase, handoffFailureReason, runtimeFallback: session?.runtimeFallback,
    authority, authorityState, authorityEvents,
    jitterMetrics: engineRef.current?.getJitterMetrics() ?? [],
    lifecycleMetrics: engineRef.current?.getLifecycleMetrics() ?? null,
    djActiveDiagnostics,
    pause, resume, seek, skipNext, skipPrevious, stop,
    armMidTransitionPause,
  };
}

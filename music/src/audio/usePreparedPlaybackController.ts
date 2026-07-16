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
} from "./dualDeckTypes";
import { DualDeckPlaybackEngine } from "./DualDeckPlaybackEngine";
import { evaluatePreparedPlaybackEligibility, resolveExecutionSyncMode, decideRuntimeTransitionPolicy } from "./transitionFallback";
import { shouldPreloadNextTrack, DEFAULT_PRELOAD_LEAD_SECONDS } from "./transitionScheduler";
import { buildInitialSession, findOutgoingPlan, derivePreparedProgress } from "./preparedPlaybackSession";
import { buildAuthorityState, decideSkipNext, resolvePreviousSlot, isLastAssignedSlot } from "./playbackAuthority";

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
  } = params;
  const handoffTimeRef = useRef(standardPlaybackTimeSeconds);
  handoffTimeRef.current = standardPlaybackTimeSeconds;

  const engineRef = useRef<DualDeckPlaybackEngine | null>(null);
  const preloadedForRef = useRef<string | null>(null);
  const transitionRunningForRef = useRef<string | null>(null);
  const completedTrackIdsRef = useRef<string[]>([]);

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

    // §17/§18 — the ONE place plan.status is read at runtime and turned into
    // a policy decision (needs_review → conservative hard cut; blocked →
    // hard cut if the incoming track is playable, otherwise explicit stop).
    // §11-§14 — hard cut is reachable from BOTH the scheduled tick (this
    // function called with trigger="scheduled") and the media `ended` event
    // (called with trigger="media_ended" from the engine-lifecycle effect's
    // subscription) — both share the engine's promotion idempotence guard.
    function runTransitionForPlan(plan: PlaylistTransitionPlan, trigger: "scheduled" | "media_ended") {
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
          let result = await eng.executeHardCut(plan.transitionId, activeDeckId, incomingDeckId, trigger);
          if (!result.executed && result.reason === "incoming_not_ready") {
            // §16 — retry incoming play once before falling back further.
            try { await eng.playDeck(incomingDeckId); } catch { /* handled by the retry result below */ }
            result = await eng.executeHardCut(plan.transitionId, activeDeckId, incomingDeckId, trigger);
          }
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
  }, [enabled, slots, tracksById, preparation, blockedTrackIds, resolveTrackUrl, slotsById]);

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
    pause, resume, seek, skipNext, skipPrevious, stop,
    armMidTransitionPause,
  };
}

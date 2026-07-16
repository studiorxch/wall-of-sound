// Dual-Deck Playback and Crossfade Execution — compact player status (§25,
// §26). No raw Web Audio internals exposed; diagnostics are opt-in.
// Extended for Dual-Deck Transport Authority Completion (§23) — shows
// which authority is current and, in diagnostics, jitter/lifecycle metrics.

import { useState } from "react";
import type { Track } from "../../data/trackTypes";
import type {
  PlaylistPlaybackSession, PlaybackDeckState, PlaybackAuthority, PlaybackAuthorityState,
  PlaybackAuthorityEvent, TransitionSchedulingMetric, DualDeckLifecycleMetrics,
  PreparedPlaybackHandoffPhase, PreparedPlaybackRuntimeFallback,
} from "../../audio/dualDeckTypes";
import type { PlaylistTransitionPlan } from "../../data/playlistTransitionTypes";

const SYNC_MODE_LABEL: Record<string, string> = {
  beat_sync: "Beat Sync", bar_sync: "Bar Sync", phrase_sync: "Phrase Sync",
  timed_crossfade: "Timed Crossfade", gapless: "Gapless", hard_cut: "Hard Cut", unsynced: "Unsynced",
};

function fmtTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

interface Props {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  session: PlaylistPlaybackSession | null;
  decks: Record<"A" | "B", PlaybackDeckState> | null;
  currentTrack?: Track;
  nextTrack?: Track;
  nextPlan?: PlaylistTransitionPlan;
  authority?: PlaybackAuthority;
  authorityState?: PlaybackAuthorityState | null;
  authorityEvents?: PlaybackAuthorityEvent[];
  jitterMetrics?: TransitionSchedulingMetric[];
  lifecycleMetrics?: DualDeckLifecycleMetrics | null;
  // Prepared Playback Handoff and Hard-Cut Repair — §20 UI states.
  handoffPhase?: PreparedPlaybackHandoffPhase;
  handoffFailureReason?: string;
  runtimeFallback?: PreparedPlaybackRuntimeFallback;
}

const RUNTIME_FALLBACK_LABEL: Record<string, string> = {
  review_hard_cut: "Review fallback · Hard Cut",
  blocked_standard_fallback: "Blocked plan · Standard fallback",
  standard_player: "Standard fallback",
  stopped: "Stopped",
};

export function PreparedPlaybackStatus({
  enabled, onToggle, session, decks, currentTrack, nextTrack, nextPlan,
  authority, authorityState, authorityEvents, jitterMetrics, lifecycleMetrics,
  handoffPhase, handoffFailureReason, runtimeFallback,
}: Props) {
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  return (
    <div className="pps-bar">
      <button
        className={`pps-toggle${enabled ? " pps-toggle--on" : ""}`}
        onClick={() => onToggle(!enabled)}
        title="Prepared Playback: dual-deck execution of prepared transition plans"
      >
        Prepared Playback: {enabled ? "On" : "Off"}
      </button>

      {/* §20 — handoff failed: standard playback is retained, never muted. */}
      {enabled && handoffPhase === "rolled_back" && (
        <div className="pps-status pps-status--handoff-failed">
          <span className="pps-fallback-warning">
            Prepared Playback unavailable · Standard playback retained
            {handoffFailureReason && <> · Reason: {handoffFailureReason.replace(/_/g, " ")}</>}
          </span>
        </div>
      )}

      {enabled && runtimeFallback && runtimeFallback !== "none" && (
        <div className="pps-status pps-status--runtime-fallback">
          <span className="pps-fallback-warning">
            Prepared Playback · {RUNTIME_FALLBACK_LABEL[runtimeFallback] ?? runtimeFallback}
          </span>
        </div>
      )}

      {enabled && session && (
        <div className="pps-status">
          <span className="pps-authority" title="Which player currently owns transport commands">
            {authority === "dual_deck_engine" ? "Engine Authority" : "Standard Authority"}
          </span>
          <span className="pps-now-playing">
            {authorityState?.isPaused ? "Paused" : "Playing"} · {currentTrack?.title ?? "—"}
            {authorityState && authorityState.durationSeconds != null && (
              <> · {fmtTime(authorityState.positionSeconds)} / {fmtTime(authorityState.durationSeconds)}</>
            )}
          </span>
          {nextTrack && nextPlan && (
            <span className="pps-next">
              Next · {nextTrack.title} · {SYNC_MODE_LABEL[nextPlan.syncMode]} · {nextPlan.transitionDurationSeconds.toFixed(0)}s
            </span>
          )}
          {session.status === "transitioning" && session.transitionProgress != null && (
            <span className="pps-transition-progress">
              Transition {Math.round(session.transitionProgress * 100)}%
            </span>
          )}
          {session.fallbackReason && (
            <span className="pps-fallback-warning" title={session.fallbackReason}>
              ⚠ Fallback: {session.fallbackReason.replace(/_/g, " ")}
            </span>
          )}
          <button className="tb-btn sm" onClick={() => setShowDiagnostics((v) => !v)}>
            {showDiagnostics ? "Hide" : "Diagnostics"}
          </button>
        </div>
      )}

      {enabled && showDiagnostics && decks && (
        <div className="pps-diagnostics">
          <div>Authority: {authority} · Active deck: {session?.activeDeckId} · Incoming deck: {session?.incomingDeckId}</div>
          <div>Transition mode: {nextPlan ? SYNC_MODE_LABEL[nextPlan.syncMode] : "—"}</div>
          <div>Deck A: {decks.A.state} · gain {decks.A.gain.toFixed(2)}</div>
          <div>Deck B: {decks.B.state} · gain {decks.B.gain.toFixed(2)}</div>
          {lifecycleMetrics && (
            <div>
              Lifecycle: {lifecycleMetrics.activeAudioElements} audio · {lifecycleMetrics.connectedGainNodes} gain nodes ·
              {" "}{lifecycleMetrics.activeTimers} timers · {lifecycleMetrics.activeSubscriptions} subs ·
              {" "}{lifecycleMetrics.completedTransitions} completed transitions
            </div>
          )}
          {jitterMetrics && jitterMetrics.length > 0 && (
            <div>
              Last jitter: start {jitterMetrics[jitterMetrics.length - 1].startJitterMs.toFixed(1)}ms ·
              {" "}end {jitterMetrics[jitterMetrics.length - 1].endJitterMs.toFixed(1)}ms
            </div>
          )}
          {authorityEvents && authorityEvents.length > 0 && (
            <div>Last event: {authorityEvents[authorityEvents.length - 1].type}</div>
          )}
        </div>
      )}
    </div>
  );
}

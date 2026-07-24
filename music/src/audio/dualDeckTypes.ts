// Dual-Deck Playback and Crossfade Execution (0714_MUSIC_Dual_Deck_Playback_
// And_Crossfade_Execution v1.0.0) — canonical state types (§5, §6, §7).
// Mirrors the spec's interfaces exactly.

export type DeckRole = "active" | "incoming" | "idle";

export type DeckPlaybackState =
  | "empty"
  | "loading"
  | "ready"
  | "playing"
  | "paused"
  | "ended"
  | "error";

export interface PlaybackDeckState {
  deckId: "A" | "B";
  role: DeckRole;
  state: DeckPlaybackState;

  trackId?: string;
  slotId?: string;

  sourceUrl?: string;

  currentTimeSeconds: number;
  durationSeconds?: number;

  cueStartSeconds?: number;
  cueEndSeconds?: number;

  gain: number;
  muted: boolean;

  error?: string;
}

export type PlaylistPlaybackSessionStatus =
  | "idle"
  | "loading"
  | "playing"
  | "paused"
  | "transitioning"
  | "complete"
  | "error";

export interface PlaylistPlaybackSession {
  playlistId: string;

  currentPosition: number;
  currentSlotId?: string;
  currentTrackId?: string;

  nextPosition?: number;
  nextSlotId?: string;
  nextTrackId?: string;

  activeDeckId: "A" | "B";
  incomingDeckId: "A" | "B";

  status: PlaylistPlaybackSessionStatus;

  activeTransitionId?: string;
  transitionProgress?: number;

  preparedPlaybackEnabled: boolean;
  fallbackReason?: string;

  // Prepared Playback Handoff and Hard-Cut Repair (0714_MUSIC_Prepared_
  // Playback_Handoff_And_Hard_Cut_Repair v1.0.0) — §17/§18/§21 runtime
  // fallback classification, distinct from `fallbackReason` (a free-text
  // diagnostic string): this is the specific policy branch that was taken,
  // surfaced so the UI can render §20's exact states.
  runtimeFallback?: PreparedPlaybackRuntimeFallback;
}

// §21 — handoff phase, tracked separately from `status` so the UI can show
// "confirming audible readiness" distinctly from "loading" or "playing".
export type PreparedPlaybackHandoffPhase =
  | "idle"
  | "preparing"
  | "starting_engine"
  | "confirming_audible_readiness"
  | "completed"
  | "rolled_back";

export type PreparedPlaybackRuntimeFallback =
  | "none"
  | "standard_player"
  | "review_hard_cut"
  | "blocked_standard_fallback"
  | "stopped";

export type PlaylistPlaybackMode = "standard" | "prepared";

export type CrossfadeCurve = "linear" | "equal_power" | "constant_power";

export interface GainEnvelope {
  startTimeContextSeconds: number;
  endTimeContextSeconds: number;

  startGain: number;
  endGain: number;

  curve: CrossfadeCurve;
}

export type TransitionCancellationReason =
  | "pause"
  | "seek"
  | "skip"
  | "playlist_changed"
  | "plan_stale"
  | "source_error"
  | "user_disabled_prepared_mode"
  | "unknown";

// §24 — prepared playback progress accounting.
export interface PreparedPlaybackProgress {
  sourceTotalSeconds: number;
  effectiveTotalSeconds: number;
  preparedTotalSeconds: number;
  elapsedPreparedSeconds: number;
  remainingPreparedSeconds: number;
}

// Dual-Deck Transport Authority Completion (0714_MUSIC_Dual_Deck_Transport_
// Authority_Completion v1.0.0) — canonical authority state (§5). There is
// exactly one playback authority at a time; the UI reads from and sends
// commands to whichever one is current.

export type PlaybackAuthority = "standard_player" | "dual_deck_engine";

export interface PlaybackAuthorityState {
  authority: PlaybackAuthority;

  playlistId?: string;
  slotId?: string;
  trackId?: string;

  positionSeconds: number;
  durationSeconds?: number;

  isPlaying: boolean;
  isPaused: boolean;
  isTransitioning: boolean;

  activeDeckId?: "A" | "B";
  incomingDeckId?: "A" | "B";

  transitionId?: string;
  transitionProgress?: number;

  updatedAtMonotonicMs: number;
}

// §7 — authority events, inspectable in development diagnostics.
export type PlaybackAuthorityEvent =
  | { type: "authority_handoff_started"; from: PlaybackAuthority; to: PlaybackAuthority }
  | { type: "authority_handoff_completed"; from: PlaybackAuthority; to: PlaybackAuthority }
  | { type: "authority_handoff_failed"; from: PlaybackAuthority; to: PlaybackAuthority; reason: string }
  | { type: "active_deck_promoted"; previousDeckId: "A" | "B"; nextDeckId: "A" | "B" }
  | { type: "authority_released"; from: PlaybackAuthority; reason: string };

// §8 — the displayed position after handoff must come from this snapshot,
// never from the paused standard <audio> element.
export interface EngineTransportSnapshot {
  activeDeckId: "A" | "B";
  incomingDeckId: "A" | "B";

  activeTrackId?: string;
  incomingTrackId?: string;

  activePositionSeconds: number;
  activeDurationSeconds?: number;

  playlistElapsedSeconds: number;
  playlistRemainingSeconds?: number;

  transitionProgress?: number;
  isTransitioning: boolean;

  isPlaying: boolean;
  isPaused: boolean;
}

// §14 — runtime-only; never persisted. Captures exactly enough state to
// resume a paused crossfade from its CURRENT gains rather than restarting.
export interface PausedTransitionSnapshot {
  transitionId: string;

  elapsedSeconds: number;
  remainingSeconds: number;
  progress: number;

  activeDeckGain: number;
  incomingDeckGain: number;

  activeDeckPositionSeconds: number;
  incomingDeckPositionSeconds: number;

  pausedAtContextTime: number;
}

// §25 — scheduling jitter instrumentation.
export interface TransitionSchedulingMetric {
  transitionId: string;

  plannedStartContextTime: number;
  actualStartContextTime: number;

  plannedEndContextTime: number;
  actualEndContextTime: number;

  startJitterMs: number;
  endJitterMs: number;
}

// §26 — lifecycle/resource instrumentation, used to verify repeated
// transitions don't leak audio elements, nodes, timers, or subscriptions.
export interface DualDeckLifecycleMetrics {
  activeAudioElements: number;
  connectedMediaSources: number;
  connectedGainNodes: number;
  activeTimers: number;
  activeSubscriptions: number;
  // Dual-Deck Control Edge-Case Verification (0714_MUSIC_Dual_Deck_Control_
  // Edge_Case_Verification v1.0.0) — §18 additions.
  retainedObjectUrls: number;
  completedTransitions: number;
  cancelledTransitions: number;
}

// Playback Authority Surface and Control Completion (0714_MUSIC_Playback_
// Authority_Surface_And_Control_Completion v1.0.0) — §8. One shared
// selector every visible playback surface derives from, instead of each
// component re-deriving (and potentially diverging on) authority state.
export interface PlaybackSurfaceSnapshot {
  authority: PlaybackAuthority;

  activeTrackId?: string;
  activeSlotId?: string;
  incomingTrackId?: string;
  incomingSlotId?: string;

  positionSeconds: number;
  durationSeconds?: number;

  isPlaying: boolean;
  isPaused: boolean;
  isTransitioning: boolean;

  transitionId?: string;
  transitionProgress?: number;

  statusLabel: string;
}

// §17 — per-row playback state, derived from the surface snapshot + a
// slot's own identity. One row may be "playing"; one adjacent row may be
// "incoming"; both may show "transitioning" during overlap.
export type PlaylistPlaybackRowState = "idle" | "completed" | "playing" | "incoming" | "transitioning" | "paused" | "error";

// Prepared Playback Handoff and Hard-Cut Repair (0714_MUSIC_Prepared_
// Playback_Handoff_And_Hard_Cut_Repair v1.0.0) — §5, §9, §21. The core
// safety rule: engine state saying "playing" is NOT audible-output
// readiness. This is the confirmed-readiness contract the handoff sequence
// must pass before authority is ever switched.
export type PreparedPlaybackHandoffFailureReason =
  | "audio_context_suspended"
  | "audio_element_not_playing"
  | "audio_element_muted"
  | "audio_element_zero_volume"
  | "gain_zero"
  | "source_not_connected"
  | "position_not_advancing"
  | "play_rejected"
  | "source_load_failed"
  | "unknown";

export interface EngineAudibleReadiness {
  ok: boolean;

  audioElementPlaying: boolean;
  audioContextRunning: boolean;
  sourceConnected: boolean;

  elementMuted: boolean;
  elementVolume: number;
  deckGain: number;

  positionAdvanced: boolean;

  failureReason?: PreparedPlaybackHandoffFailureReason;
}

// §9 — audio graph connectivity must be tracked explicitly, never inferred
// from object existence alone.
export interface DeckAudioGraphState {
  mediaSourceConnected: boolean;
  gainConnected: boolean;
  masterConnected: boolean;
}

// Raw <audio>-element diagnostic snapshot — see
// DualDeckPlaybackEngine.getDeckDiagnostics(). Additive read-only surface,
// never used to drive playback logic itself (that stays EngineAudibleReadiness's job).
export interface DeckDiagnosticsSnapshot {
  readyState: number;
  networkState: number;
  currentSrc: string;
  paused: boolean;
  ended: boolean;
  mediaError: string | null;
  gain: number;
  contextState: AudioContextState | "closed";
}

// §11/§12 — hard-cut runtime contract: zero overlap, reachable from both the
// scheduled (tick-based) path and the media `ended` event, sharing one
// idempotent executor (§13, §14).
export type HardCutTrigger = "scheduled" | "media_ended";

export interface HardCutExecutionResult {
  executed: boolean;
  reason?: "already_promoted" | "incoming_not_ready" | "incoming_play_failed";
}

// §22 — full diagnostics surface (subset actually wired into the UI in this
// build; the rest is available to callers via the engine/hook return value).
export interface PreparedPlaybackDiagnostics {
  handoffPhase: PreparedPlaybackHandoffPhase;
  readiness?: EngineAudibleReadiness;
  hardCutTrigger?: HardCutTrigger;
  hardCutExecuted?: boolean;
  runtimeFallback?: PreparedPlaybackRuntimeFallback;
}

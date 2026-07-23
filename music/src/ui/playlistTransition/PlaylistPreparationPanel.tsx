// Playlist Transition Preparation — compact preparation panel (§30). No
// waveform editor; expandable per-transition diagnostics only.
//
// DJ Transition Engine (0722D) — when djTransitionMode is "shadow" or
// "active", this panel resolves and displays a DJ Engine comparison per
// real adjacent pair. In both modes the resolution here is diagnostic
// only — it NEVER touches playback/scheduling/gain/EQ/transport/playlist
// order. The one real side effect this file can cause is persisting an
// operator's explicit "Approve for Active Execution" click (clean_cut
// only, the sole family with a real execution path — see
// djTransitionAuthorityGate.ts's SUPPORTED_ACTIVE_TRANSITION_FAMILIES) via
// onDjTransitionPlansChange; actual execution happens entirely inside
// usePreparedPlaybackController.ts's authority-gated playback path, not
// here. The focused two-track editor remains out of scope.

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { PlaylistRecord } from "../../data/playProjectTypes";
import type { Track } from "../../data/trackTypes";
import type { CompleteSongAnalysis } from "../../data/songAnalysisTypes";
import type { DjTransitionPlan } from "../../data/djTransitionTypes";
import { preparePlaylistForPlayback } from "../../logic/playlistTransition/preparePlaylist";
import { computePreparedPlaylistDuration } from "../../logic/playlistTransition/preparedDuration";
import { isPreparationStale } from "../../logic/playlistTransition/transitionStaleness";
import type { DjTransitionMode } from "../../logic/djTransitionModeStorage";
import { SUPPORTED_ACTIVE_TRANSITION_FAMILIES } from "../../logic/djTransitionAuthorityGate";
import type { DjActiveExecutionDiagnostics } from "../../audio/usePreparedPlaybackController";
import {
  computeAdjacentAssignedPairs,
  findLegacyPlanForPair,
  resolveDjTransitionPairShadow,
  type DjTransitionShadowPair,
  type DjTransitionShadowResolution,
} from "../../logic/djTransitionShadowResolve";

interface Props {
  playlist: PlaylistRecord;
  libraryTracks: Track[];
  onPreparationChange: (preparation: PlaylistRecord["playbackPreparation"]) => void;
  songAnalyses?: CompleteSongAnalysis[];
  djTransitionMode?: DjTransitionMode;
  onDjTransitionModeChange?: (mode: DjTransitionMode) => void;
  onDjTransitionPlansChange?: (plans: DjTransitionPlan[]) => void;
  djActiveDiagnostics?: DjActiveExecutionDiagnostics | null;
  onClose: () => void;
}

function nowIso(): string {
  return new Date().toISOString();
}

const READINESS_LABEL: Record<string, string> = {
  unprepared: "Unprepared",
  prepared: "Prepared",
  ready: "Ready",
  ready_with_fallbacks: "Ready with fallbacks",
  needs_review: "Needs review",
  blocked: "Blocked",
};

const MODE_LABEL: Record<string, string> = {
  beat_sync: "Beat Sync", bar_sync: "Bar Sync", phrase_sync: "Phrase Sync",
  timed_crossfade: "Crossfade", gapless: "Gapless", hard_cut: "Hard Cut", unsynced: "Unsynced",
};

const FAMILY_LABEL: Record<string, string> = {
  phrase_eq_blend: "Phrase EQ Blend",
  short_rhythmic_blend: "Short Rhythmic Blend",
  loop_assisted_handoff: "Loop-Assisted Handoff",
  stem_assisted_transition: "Stem-Assisted Transition",
  effect_handoff: "Effect Handoff",
  clean_cut: "Clean Cut",
  reset_bridge: "Reset / Bridge",
  do_not_place_adjacent: "Do Not Place Adjacent",
  free_time_perceptual_handoff: "Free-Time Perceptual Handoff",
};

const TRUST_LABEL: Record<string, string> = {
  trusted_rhythmic: "Trusted Rhythmic",
  manually_authored: "Manually Authored",
  partially_trusted: "Partially Trusted",
  free_time_or_incompatible: "Free-Time / Incompatible",
};

const AUTHORITY_GATE_LABEL: Record<string, string> = {
  mode_not_active: "Mode not active",
  no_plan_for_pair: "No approved plan for this pair",
  not_approved: "Plan not approved",
  stale: "Plan is stale",
  unsupported_family: "Family not implemented",
  regions_invalid: "Selected region no longer valid",
  outgoing_deck_not_ready: "Outgoing deck not ready",
  incoming_deck_not_ready: "Incoming deck not ready",
  authorized: "Authorized",
};

type ShadowEntryState =
  | { status: "loading" }
  | { status: "done"; resolution: DjTransitionShadowResolution }
  | { status: "error"; message: string };

export function PlaylistPreparationPanel({
  playlist, libraryTracks, onPreparationChange, songAnalyses = [],
  djTransitionMode = "off", onDjTransitionModeChange, onDjTransitionPlansChange, djActiveDiagnostics = null,
  onClose,
}: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const tracksById = new Map(libraryTracks.map((t) => [t.trackId, t]));

  const preparation = playlist.playbackPreparation;
  const stale = isPreparationStale(preparation, playlist.slots, tracksById);
  const duration = computePreparedPlaylistDuration(playlist.slots, tracksById, stale ? undefined : preparation);

  function prepare() {
    const next = preparePlaylistForPlayback(playlist.playlistId, playlist.slots, tracksById, nowIso(), preparation?.overrides);
    onPreparationChange(next);
  }

  // ── DJ Transition Engine — resolved diagnostics (shadow AND active) ────
  const djEngineActive = djTransitionMode === "shadow" || djTransitionMode === "active";
  const songAnalysesByTrackId = new Map(songAnalyses.map((a) => [a.sourceTrackId, a]));
  const djPairs: DjTransitionShadowPair[] = djEngineActive ? computeAdjacentAssignedPairs(playlist, tracksById) : [];
  const [djResults, setDjResults] = useState<Record<string, ShadowEntryState>>({});
  const [expandedDjKey, setExpandedDjKey] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const thisRequestId = ++requestIdRef.current;
    if (!djEngineActive) {
      Promise.resolve().then(() => { if (requestIdRef.current === thisRequestId) setDjResults({}); });
      return;
    }
    const pairs = computeAdjacentAssignedPairs(playlist, tracksById);
    Promise.resolve().then(() => {
      if (requestIdRef.current !== thisRequestId) return;
      setDjResults(Object.fromEntries(pairs.map((p) => [p.pairKey, { status: "loading" as const }])));
    });

    pairs.forEach((pair) => {
      resolveDjTransitionPairShadow(pair, playlist.playlistId, songAnalysesByTrackId)
        .then((resolution) => {
          if (requestIdRef.current !== thisRequestId) return; // a newer request superseded this one
          setDjResults((prev) => ({ ...prev, [pair.pairKey]: { status: "done", resolution } }));
        })
        .catch((err) => {
          if (requestIdRef.current !== thisRequestId) return;
          setDjResults((prev) => ({ ...prev, [pair.pairKey]: { status: "error", message: err instanceof Error ? err.message : "Resolution failed" } }));
        });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-resolve on playlist slot/track/mode changes; songAnalysesByTrackId is derived fresh each render from stable `songAnalyses`.
  }, [djEngineActive, playlist.playlistId, playlist.slots, libraryTracks]);

  function approveForActiveExecution(pair: DjTransitionShadowPair, resolvedPlan: DjTransitionPlan) {
    if (!onDjTransitionPlansChange) return;
    const now = nowIso();
    const approved: DjTransitionPlan = { ...resolvedPlan, origin: "manual", evidenceState: "approved", approvedAt: now, updatedAt: now };
    const existing = playlist.djTransitionPlans ?? [];
    const next = existing.filter((p) => !(p.outgoingSlotId === pair.outgoingSlot.slotId && p.incomingSlotId === pair.incomingSlot.slotId));
    onDjTransitionPlansChange([...next, approved]);
  }

  return createPortal(
    <div className="par-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ptp-modal">
        <div className="ptp-header">
          <div>
            <div className="ptp-title">Playback Preparation</div>
            <div className="ptp-subtitle">
              {preparation && !stale ? READINESS_LABEL[preparation.readiness] : "Unprepared"}
              {stale && preparation && " · Stale"}
            </div>
          </div>
          <button className="npw-close" onClick={onClose}>✕</button>
        </div>

        <div className="ptp-body">
          <button className="tb-btn" onClick={prepare}>
            {preparation ? (stale ? "Reprepare for Playback" : "Prepare for Playback") : "Prepare for Playback"}
          </button>

          {preparation && !stale && (
            <div className="ptp-summary">
              {preparation.readyCount} ready · {preparation.fallbackCount} fallback · {preparation.reviewCount} review · {preparation.blockedCount} blocked
              <div className="ptp-duration">
                Source {duration.sourceTotalSeconds.toFixed(0)}s · Effective {duration.effectiveTotalSeconds.toFixed(0)}s · Prepared {duration.preparedTotalSeconds.toFixed(0)}s
              </div>
            </div>
          )}

          {preparation && !stale && (
            <div className="ptp-list">
              {preparation.transitionPlans.map((plan) => (
                <div key={plan.transitionId} className={`ptp-row ptp-row--${plan.status}`}>
                  <div className="ptp-row-main" onClick={() => setExpandedId(expandedId === plan.transitionId ? null : plan.transitionId)}>
                    <span>{plan.fromPosition + 1} → {plan.toPosition + 1}</span>
                    <span>{MODE_LABEL[plan.syncMode]}</span>
                    <span className="ptp-status">{plan.status.replace(/_/g, " ")}</span>
                  </div>
                  {expandedId === plan.transitionId && (
                    <div className="ptp-row-detail">
                      <div>Confidence: {Math.round(plan.confidence * 100)}%</div>
                      <div>Tempo: {plan.tempoRelationship.replace(/_/g, " ")}</div>
                      <div>Duration: {plan.transitionDurationSeconds.toFixed(1)}s{plan.transitionBars ? ` (${plan.transitionBars} bars)` : ""}</div>
                      {plan.warnings.length > 0 && <div className="ptp-warnings">{plan.warnings.join(", ")}</div>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="ptp-dj-section">
            <div className="ptp-dj-header">
              <span className="ptp-dj-title">DJ Transition Engine</span>
              <div className="ptp-dj-mode-toggle" role="radiogroup" aria-label="DJ Transition Engine mode">
                {(["off", "shadow", "active"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    role="radio"
                    aria-checked={djTransitionMode === mode}
                    className={`ptp-dj-mode-btn${djTransitionMode === mode ? " ptp-dj-mode-btn--active" : ""}`}
                    onClick={() => onDjTransitionModeChange?.(mode)}
                  >
                    {mode === "off" ? "Off" : mode === "shadow" ? "Shadow" : "Active"}
                  </button>
                ))}
              </div>
            </div>

            {djTransitionMode === "off" && (
              <div className="ptp-dj-hint">DJ Transition Engine is off — legacy playlist crossfades drive playback unchanged.</div>
            )}

            {djTransitionMode === "shadow" && (
              <div className="ptp-dj-hint">
                Shadow mode: resolving and comparing only. Playback still uses the legacy crossfade plan above — nothing here is saved or executed.
              </div>
            )}

            {djTransitionMode === "active" && (
              <div className="ptp-dj-hint">
                Active mode: only an explicitly-approved Clean Cut plan can execute, and only after passing every authority check live. Every other pair falls back to the legacy plan automatically.
              </div>
            )}

            {djEngineActive && djPairs.length === 0 && (
              <div className="ptp-dj-hint">No adjacent assigned-track pairs to resolve yet.</div>
            )}

            {djEngineActive && djPairs.length > 0 && (
              <div className="ptp-list ptp-dj-list">
                {djPairs.map((pair) => {
                  const entry = djResults[pair.pairKey];
                  const legacyPlan = findLegacyPlanForPair(playlist, pair);
                  const approvedPlan = (playlist.djTransitionPlans ?? []).find(
                    (p) => p.outgoingSlotId === pair.outgoingSlot.slotId && p.incomingSlotId === pair.incomingSlot.slotId && p.evidenceState === "approved",
                  );
                  const liveDiagnostics = djTransitionMode === "active" && djActiveDiagnostics?.legacyTransitionId === pair.pairKey ? djActiveDiagnostics : null;
                  return (
                    <DjPairRow
                      key={pair.pairKey}
                      pair={pair}
                      entry={entry}
                      legacyPlan={legacyPlan}
                      legacyPrepStale={stale}
                      legacyPrepExists={Boolean(preparation)}
                      approvedPlan={approvedPlan}
                      djTransitionMode={djTransitionMode}
                      liveDiagnostics={liveDiagnostics}
                      canApprove={Boolean(onDjTransitionPlansChange)}
                      onApprove={(resolvedPlan) => approveForActiveExecution(pair, resolvedPlan)}
                      expanded={expandedDjKey === pair.pairKey}
                      onToggle={() => setExpandedDjKey(expandedDjKey === pair.pairKey ? null : pair.pairKey)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function DjPairRow({
  pair, entry, legacyPlan, legacyPrepStale, legacyPrepExists, approvedPlan, djTransitionMode, liveDiagnostics, canApprove, onApprove, expanded, onToggle,
}: {
  pair: DjTransitionShadowPair;
  entry: ShadowEntryState | undefined;
  legacyPlan: ReturnType<typeof findLegacyPlanForPair>;
  legacyPrepStale: boolean;
  legacyPrepExists: boolean;
  approvedPlan: DjTransitionPlan | undefined;
  djTransitionMode: DjTransitionMode;
  liveDiagnostics: DjActiveExecutionDiagnostics | null;
  canApprove: boolean;
  onApprove: (resolvedPlan: DjTransitionPlan) => void;
  expanded: boolean;
  onToggle: () => void;
}) {
  const pairLabel = `${pair.outgoingTrack.title} → ${pair.incomingTrack.title}`;

  if (!entry || entry.status === "loading") {
    return (
      <div className="ptp-row ptp-dj-row">
        <div className="ptp-row-main">
          <span>{pairLabel}</span>
          <span className="ptp-status">Resolving…</span>
        </div>
      </div>
    );
  }

  if (entry.status === "error") {
    return (
      <div className="ptp-row ptp-dj-row ptp-row--blocked">
        <div className="ptp-row-main">
          <span>{pairLabel}</span>
          <span className="ptp-status">Resolution failed</span>
        </div>
        <div className="ptp-row-detail">
          <div className="ptp-warnings">{entry.message}</div>
        </div>
      </div>
    );
  }

  const { result, evidence, outgoingRegions, incomingRegions } = entry.resolution;
  const plan = result.recommended;
  const legacyStrategy = legacyPrepExists ? (legacyPlan ? `${MODE_LABEL[legacyPlan.syncMode]} · ${legacyPlan.transitionDurationSeconds.toFixed(1)}s` : "No legacy plan for this pair") : "Not prepared";
  const isSupportedFamily = SUPPORTED_ACTIVE_TRANSITION_FAMILIES.has(plan.family);

  return (
    <div className="ptp-row ptp-dj-row">
      <div className="ptp-row-main" onClick={onToggle}>
        <span>{pairLabel}</span>
        <span>{FAMILY_LABEL[plan.family]}</span>
        <span className="ptp-status">{approvedPlan ? "Approved" : TRUST_LABEL[plan.trust]}</span>
      </div>
      {expanded && (
        <div className="ptp-row-detail ptp-dj-detail">
          <div><strong>Pair:</strong> {pair.outgoingTrack.title} ({pair.outgoingSlot.slotId}) → {pair.incomingTrack.title} ({pair.incomingSlot.slotId})</div>
          <div><strong>Legacy strategy:</strong> {legacyStrategy}{legacyPrepExists && legacyPrepStale ? " (stale)" : ""}</div>
          <div><strong>DJ family / technique:</strong> {FAMILY_LABEL[plan.family]} · {plan.timeBasis} basis · {plan.doNotLayer ? "Do Not Layer" : "Layered"}</div>
          <div><strong>Confidence / authority:</strong> {TRUST_LABEL[plan.trust]} · evidence state: {approvedPlan?.evidenceState ?? plan.evidenceState}</div>
          <div>
            <strong>Selected regions:</strong> out={plan.outgoingCue.regionId ?? "none"} ({outgoingRegions.find((r) => r.regionId === plan.outgoingCue.regionId)?.role ?? "n/a"}) ·
            in={plan.incomingCue.regionId ?? "none"} ({incomingRegions.find((r) => r.regionId === plan.incomingCue.regionId)?.role ?? "n/a"})
          </div>
          <div>
            <strong>Tempo / key:</strong> pulse ratio {plan.pulseRatio ?? "unknown"} · adjustment {plan.tempoAdjustmentPercentA}% / {plan.tempoAdjustmentPercentB}% ·
            key {evidence.outgoing.key.value ?? "unknown"} → {evidence.incoming.key.value ?? "unknown"}
          </div>
          <div>
            <strong>Accepted evidence:</strong> beat {evidence.outgoing.beatTrusted && evidence.incoming.beatTrusted ? "trusted" : "untrusted"} ·
            bar {evidence.outgoing.barTrusted && evidence.incoming.barTrusted ? "trusted" : "untrusted"} ·
            phrase {evidence.outgoing.phraseTrusted && evidence.incoming.phraseTrusted ? "trusted" : "untrusted"} ·
            BPM {evidence.outgoing.bpm.value ?? "?"}→{evidence.incoming.bpm.value ?? "?"}
          </div>
          {result.rejectedCandidates.length > 0 && (
            <div className="ptp-warnings">
              <strong>Unsupported / rejected:</strong> {result.rejectedCandidates.map((r) => `${FAMILY_LABEL[r.family]} (${r.reason})`).join("; ")}
            </div>
          )}
          {plan.warnings.length > 0 && <div className="ptp-warnings"><strong>Warnings:</strong> {plan.warnings.join(", ")}</div>}
          {plan.explanation.length > 0 && <div>{plan.explanation.join(" ")}</div>}

          {canApprove && isSupportedFamily && !approvedPlan && (
            <button className="tb-btn ptp-dj-approve-btn" onClick={(e) => { e.stopPropagation(); onApprove(plan); }}>
              Approve for Active Execution
            </button>
          )}
          {approvedPlan && <div className="ptp-dj-approved-note">Approved {approvedPlan.approvedAt} — eligible for active-mode execution while current.</div>}
          {canApprove && !isSupportedFamily && (
            <div className="ptp-dj-hint">Family "{FAMILY_LABEL[plan.family]}" has no implemented execution path yet — cannot be approved for active execution.</div>
          )}

          {djTransitionMode === "active" && (
            <div className="ptp-dj-live">
              <strong>Live authorization:</strong>{" "}
              {liveDiagnostics ? (
                <>
                  {AUTHORITY_GATE_LABEL[liveDiagnostics.gate] ?? liveDiagnostics.gate} — {liveDiagnostics.reason}
                  {liveDiagnostics.compiledStrategy && <> · compiled: {liveDiagnostics.compiledStrategy}</>}
                  {liveDiagnostics.executed && <> · executed via DJ path</>}
                  {liveDiagnostics.executionFailureReason && <> · execution issue: {liveDiagnostics.executionFailureReason}</>}
                  {liveDiagnostics.legacyExecutedInstead && <> · legacy transition executed instead</>}
                </>
              ) : (
                "Not yet evaluated live (playback hasn't reached this pair)."
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

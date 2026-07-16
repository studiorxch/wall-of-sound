// Playlist Transition Preparation — compact preparation panel (§30). No
// waveform editor; expandable per-transition diagnostics only.

import { useState } from "react";
import { createPortal } from "react-dom";
import type { PlaylistRecord } from "../../data/playProjectTypes";
import type { Track } from "../../data/trackTypes";
import { preparePlaylistForPlayback } from "../../logic/playlistTransition/preparePlaylist";
import { computePreparedPlaylistDuration } from "../../logic/playlistTransition/preparedDuration";
import { isPreparationStale } from "../../logic/playlistTransition/transitionStaleness";

interface Props {
  playlist: PlaylistRecord;
  libraryTracks: Track[];
  onPreparationChange: (preparation: PlaylistRecord["playbackPreparation"]) => void;
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

export function PlaylistPreparationPanel({ playlist, libraryTracks, onPreparationChange, onClose }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const tracksById = new Map(libraryTracks.map((t) => [t.trackId, t]));

  const preparation = playlist.playbackPreparation;
  const stale = isPreparationStale(preparation, playlist.slots, tracksById);
  const duration = computePreparedPlaylistDuration(playlist.slots, tracksById, stale ? undefined : preparation);

  function prepare() {
    const next = preparePlaylistForPlayback(playlist.playlistId, playlist.slots, tracksById, nowIso(), preparation?.overrides);
    onPreparationChange(next);
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
        </div>
      </div>
    </div>,
    document.body,
  );
}

// Selection "Review BPM & Key" dialog (0728B_MUSIC_Catalog_Selection_Actions,
// simplified 0729A_MUSIC_Review_Dialog_Simplification). Lists only selected
// tracks failing needsBpmKeyReview. This panel is temporary support until
// analysis becomes trustworthy — it shows EXACTLY what reviewBpmField/
// reviewKeyField report (a persisted detector estimate is shown only when
// one is actually persisted) and offers only the real candidate values as
// one-click accept buttons; there is no manual-entry path here — manual
// editing lives in the main library inspector. Every accept writes through
// the same onBulkUpdate path every other bulk mutation uses, stamped
// bpmSource/keySource: "manual" — the existing manual-precedence trust gate
// then protects the value from any future Analyze Missing/Reanalyze run,
// unchanged. "Analyze" (for a track with no result yet) reuses the exact
// existing onAnalyzeMissing path the selection dock's own "Analyze Missing"
// button already calls, scoped to just that one track — no new analyzer.

import { useEffect, useRef } from "react";
import type { Track } from "../../data/trackTypes";
import { reviewBpmField, reviewKeyField, needsBpmKeyReview } from "../../logic/dspFeatureExtraction";
import { LibraryReviewRowPlayButton } from "./LibraryReviewRowPlayButton";

interface Props {
  selectedTracks: Track[];
  onBulkUpdate: (trackIds: string[], patch: Partial<Track>) => void;
  onClose: () => void;
  // 0728H_MUSIC_Review_Dialog_Playback_And_Audio_Evidence — same app-wide
  // audition props the Catalog grid's own row Play button already uses.
  onAuditionTrack?: (trackId: string) => void;
  auditionTrackId?: string | null;
  playbackStatus?: string;
  onPauseTrack?: () => void;
  onResumeTrack?: () => void;
  // 0729A_MUSIC_Review_Dialog_Simplification — reuses the exact existing
  // Analyze Missing path (LibraryActionBar's own prop), never a new analyzer.
  onAnalyzeMissing?: (trackIds: string[]) => void;
}

function CandidateButtons<T extends string | number>({ values, onPick }: { values: T[]; onPick: (v: T) => void }) {
  const unique = Array.from(new Set(values));
  return (
    <span className="cat-review-candidates">
      {unique.map((v) => (
        <button key={String(v)} className="tb-btn npw-btn--small" onClick={() => onPick(v)}>{v}</button>
      ))}
    </span>
  );
}

export function LibraryBpmKeyReviewDialog({
  selectedTracks, onBulkUpdate, onClose,
  onAuditionTrack, auditionTrackId, playbackStatus, onPauseTrack, onResumeTrack,
  onAnalyzeMissing,
}: Props) {
  const tracks = selectedTracks.filter(needsBpmKeyReview);

  // Closing the dialog cleanly returns control to the existing transport —
  // pause (not destroy) playback only if the track currently auditioning
  // belongs to THIS dialog's own selection, so a track a person started
  // playing here doesn't keep running invisibly after the dialog is gone.
  // A ref (not the effect's own closure) tracks the LATEST auditionTrackId
  // so the cleanup — which only ever runs once, on true unmount — reads the
  // track actually playing when the dialog closes, not whatever it was on
  // the first render.
  const latestAuditionRef = useRef<{ id: string | null | undefined; selectedIds: Set<string> }>({ id: auditionTrackId, selectedIds: new Set(selectedTracks.map((t) => t.trackId)) });
  latestAuditionRef.current = { id: auditionTrackId, selectedIds: new Set(selectedTracks.map((t) => t.trackId)) };
  useEffect(() => {
    return () => {
      const { id, selectedIds } = latestAuditionRef.current;
      if (id && selectedIds.has(id)) onPauseTrack?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Any accepted value — the detected pulse itself, or its half/double-time
  // derivative — writes through the SAME manual-source path; the half/
  // double-time numbers are derived mathematically from the persisted
  // candidate (never a second detector estimate), per reviewBpmField.
  function acceptBpmValue(trackId: string, value: number) {
    onBulkUpdate([trackId], { bpm: value, bpmSource: "manual" });
  }
  function acceptKeyValue(trackId: string, camelotKey: string) {
    onBulkUpdate([trackId], { camelotKey: camelotKey as Track["camelotKey"], keySource: "manual" });
  }

  return (
    <div className="export-modal-overlay" onClick={onClose}>
      <div className="export-modal cat-review-table-dialog" onClick={(e) => e.stopPropagation()}>
        <h3>Review BPM &amp; Key — {tracks.length} track{tracks.length !== 1 ? "s" : ""}</h3>

        {tracks.length === 0 ? (
          <div className="cat-batch-comments-preview">Nothing to review — every selected track has a resolved BPM and key.</div>
        ) : (
          <div className="playlist-shape-table">
            <table className="npw-shape-table">
              <thead><tr><th>Track</th><th>BPM</th><th>Key</th></tr></thead>
              <tbody>
                {tracks.map((t) => {
                  const bpmReview = reviewBpmField(t);
                  const keyReview = reviewKeyField(t);
                  const alternateKeys = t.audioAnalysis?.alternateKeyCandidates ?? [];

                  let bpmCandidates: number[] = [];
                  if (bpmReview.state === "resolved" && bpmReview.tempoFamily.concern !== "none") {
                    bpmCandidates = [bpmReview.canonicalBpm!, bpmReview.tempoFamily.candidateBpm!];
                  } else if (bpmReview.state !== "resolved" && bpmReview.estimatedBpm != null) {
                    bpmCandidates = bpmReview.tempoFamily.concern !== "none"
                      ? [bpmReview.estimatedBpm, bpmReview.tempoFamily.candidateBpm!]
                      : [bpmReview.estimatedBpm, bpmReview.halfTimeBpm].filter((v): v is number => v != null);
                  }

                  const keyCandidates = Array.from(new Set(
                    [keyReview.estimatedKey, ...alternateKeys.map((a) => a.camelotKey)].filter((v): v is string => v != null),
                  ));

                  return (
                    <tr key={t.trackId} className="npw-shape-row">
                      <td className="npw-shape-crates">
                        <LibraryReviewRowPlayButton
                          track={t}
                          onAuditionTrack={onAuditionTrack}
                          auditionTrackId={auditionTrackId}
                          playbackStatus={playbackStatus}
                          onPauseTrack={onPauseTrack}
                          onResumeTrack={onResumeTrack}
                        />{" "}
                        {t.title}
                      </td>
                      <td className="npw-shape-crates">
                        {bpmReview.state === "resolved" && bpmReview.tempoFamily.concern === "none" ? (
                          <span>{bpmReview.canonicalBpm}</span>
                        ) : bpmCandidates.length > 0 ? (
                          <>
                            <CandidateButtons values={bpmCandidates} onPick={(v) => acceptBpmValue(t.trackId, v)} />
                            <details className="cat-review-details">
                              <summary>details</summary>
                              <div className="cat-review-details-body">
                                {bpmReview.doubleTimeBpm != null && <div>Double-time: {bpmReview.doubleTimeBpm} BPM</div>}
                                {bpmReview.confidence != null && <div>Confidence: {Math.round(bpmReview.confidence * 100)}%</div>}
                                {bpmReview.reason && <div>{bpmReview.reason}</div>}
                                {bpmReview.tempoFamily.genre && <div>Genre: {bpmReview.tempoFamily.genre}</div>}
                              </div>
                            </details>
                          </>
                        ) : bpmReview.state === "no_confident_result" ? (
                          <span className="cat-review-state-label">No result</span>
                        ) : (
                          <span>
                            <span className="cat-review-state-label">{bpmReview.state === "pending" ? "Analyzing…" : "Not analyzed"}</span>
                            {bpmReview.state !== "pending" && onAnalyzeMissing && (
                              <button className="tb-btn npw-btn--small" onClick={() => onAnalyzeMissing([t.trackId])}>Analyze</button>
                            )}
                          </span>
                        )}
                      </td>
                      <td className="npw-shape-crates">
                        {keyReview.state === "resolved" ? (
                          <span>{keyReview.canonicalKey}</span>
                        ) : keyCandidates.length > 0 ? (
                          <>
                            <CandidateButtons values={keyCandidates} onPick={(v) => acceptKeyValue(t.trackId, v)} />
                            {(keyReview.confidence != null || keyReview.reason) && (
                              <details className="cat-review-details">
                                <summary>details</summary>
                                <div className="cat-review-details-body">
                                  {keyReview.confidence != null && <div>Confidence: {Math.round(keyReview.confidence * 100)}%</div>}
                                  {keyReview.reason && <div>{keyReview.reason}</div>}
                                </div>
                              </details>
                            )}
                          </>
                        ) : keyReview.state === "no_confident_result" ? (
                          <span className="cat-review-state-label">No result</span>
                        ) : (
                          <span>
                            <span className="cat-review-state-label">{keyReview.state === "pending" ? "Analyzing…" : "Not analyzed"}</span>
                            {keyReview.state !== "pending" && onAnalyzeMissing && (
                              <button className="tb-btn npw-btn--small" onClick={() => onAnalyzeMissing([t.trackId])}>Analyze</button>
                            )}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="cat-batch-comments-actions">
          <button className="tb-btn sm" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

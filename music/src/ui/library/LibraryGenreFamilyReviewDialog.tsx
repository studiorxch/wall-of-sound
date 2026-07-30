// Selection "Review Genre Family" dialog (0728G_MUSIC_Fast_Breaks_Identification,
// simplified 0729A_MUSIC_Review_Dialog_Simplification). Lists only selected
// Catalog tracks failing needsGenreFamilyReview — i.e. tracks with real
// fast-breaks evidence (genre tokens or explicit title/grouping/comment
// text, plus audio evidence — see genreFamilyClassification.ts) that have
// not already been confirmed. "Ambient mood ≠ Ambient genre family":
// nothing here is ever silently assigned — the only two decisions are
// Yes (confirmed fast_breaks) and No (confirmed non-fast-break), both
// through the same onBulkUpdate path every other bulk mutation uses.
// Manual family/detailed-genre editing lives in the main library inspector,
// not here — this dialog is compact evidence + a yes/no decision + playback.

import { useEffect, useRef } from "react";
import type { Track } from "../../data/trackTypes";
import { reviewGenreFamilyField, needsGenreFamilyReview } from "../../logic/library/genreFamilyClassification";
import { normalizeTrackGenreTokens } from "../../logic/genreTaxonomy";
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
}

function nowIso() {
  return new Date().toISOString();
}

export function LibraryGenreFamilyReviewDialog({
  selectedTracks, onBulkUpdate, onClose,
  onAuditionTrack, auditionTrackId, playbackStatus, onPauseTrack, onResumeTrack,
}: Props) {
  const tracks = selectedTracks.filter(needsGenreFamilyReview);

  // Closing the dialog cleanly returns control to the existing transport —
  // see the identical pattern/comment in LibraryBpmKeyReviewDialog.tsx.
  const latestAuditionRef = useRef<{ id: string | null | undefined; selectedIds: Set<string> }>({ id: auditionTrackId, selectedIds: new Set(selectedTracks.map((t) => t.trackId)) });
  latestAuditionRef.current = { id: auditionTrackId, selectedIds: new Set(selectedTracks.map((t) => t.trackId)) };
  useEffect(() => {
    return () => {
      const { id, selectedIds } = latestAuditionRef.current;
      if (id && selectedIds.has(id)) onPauseTrack?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function writeClassification(trackId: string, patch: Partial<Track["genreClassification"]> & { reviewStatus: NonNullable<Track["genreClassification"]>["reviewStatus"] }, current: Track["genreClassification"]) {
    onBulkUpdate([trackId], {
      genreClassification: {
        primaryGenreFamily: current?.primaryGenreFamily ?? null,
        detailedGenres: current?.detailedGenres ?? [],
        blendTraits: current?.blendTraits ?? [],
        source: current?.source ?? null,
        confidence: null,
        reason: null,
        reviewedAt: nowIso(),
        ...patch,
      },
    });
  }

  function handleYes(t: Track) {
    writeClassification(t.trackId, {
      reviewStatus: "confirmed",
      primaryGenreFamily: "fast_breaks",
      source: "manual",
      confidence: 1,
      reason: "Manually confirmed as fast_breaks by user.",
    }, t.genreClassification);
  }

  function handleNo(t: Track) {
    writeClassification(t.trackId, {
      reviewStatus: "confirmed",
      source: "manual",
      confidence: 1,
      reason: "Manually confirmed as not fast_breaks by user.",
    }, t.genreClassification);
  }

  return (
    <div className="export-modal-overlay" onClick={onClose}>
      <div className="export-modal cat-review-table-dialog" onClick={(e) => e.stopPropagation()}>
        <h3>Review Genre Family — {tracks.length} track{tracks.length !== 1 ? "s" : ""}</h3>

        {tracks.length === 0 ? (
          <div className="cat-batch-comments-preview">Nothing to review — no fast-breaks evidence in the current selection.</div>
        ) : (
          <div className="playlist-shape-table">
            <table className="npw-shape-table">
              <thead><tr><th>Track</th><th>Evidence</th><th>Fast Breaks</th></tr></thead>
              <tbody>
                {tracks.map((t) => {
                  const review = reviewGenreFamilyField(t);
                  const existingGenres = normalizeTrackGenreTokens(t);
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
                        <span className="cat-review-evidence-line">
                          {review.confidence != null ? `${Math.round(review.confidence * 100)}%` : "—"}
                          {review.conflict && <span className="cat-review-conflict" title="Metadata and audio evidence disagree"> ⚠</span>}
                        </span>
                        <details className="cat-review-details">
                          <summary>details</summary>
                          <div className="cat-review-details-body">
                            {review.reason && <div>{review.reason}</div>}
                            <div>Declared: {review.declaredEvidence ? `${review.declaredEvidence.reason} (${Math.round(review.declaredEvidence.confidence * 100)}%)` : "none"}</div>
                            <div>Audio: {review.audioEvidence.likelihood} ({Math.round(review.audioEvidence.confidence * 100)}%) — {review.audioEvidence.reasons.join(" ")}</div>
                            <div>Audio tempo family: {review.audioEvidence.tempoFamily.halfTime ?? "—"} / {review.audioEvidence.tempoFamily.fullTime ?? "—"} BPM</div>
                            <div>Existing genre: {existingGenres.length ? existingGenres.join(", ") : "none"}</div>
                            <div>Moods: {(t.moodTags ?? []).join(", ") || "none"}</div>
                            {t.grouping && <div>Grouping: {t.grouping}</div>}
                          </div>
                        </details>
                      </td>
                      <td className="npw-shape-crates cat-review-yesno">
                        <button className="tb-btn npw-btn--small" onClick={() => handleYes(t)}>Yes</button>
                        <button className="tb-btn npw-btn--small" onClick={() => handleNo(t)}>No</button>
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

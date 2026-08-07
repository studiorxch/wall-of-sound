// Audio readiness model (0712_MUSIC_Audio_Import_And_Readiness).
//
// Derived-only — no new persisted field on Track. Computed from the existing
// analysisStatus/identityStatus fields and the existing playback-eligibility
// check, reusing trackEligibility.ts rather than re-deriving codec/missing-
// audio logic here.

import type { Track } from "../data/trackTypes";
import type { TrackEligibilityContext } from "./trackEligibility";
import { getTrackEligibility } from "./trackEligibility";

export type AudioReadinessState =
  | "importing"
  | "analysis_pending"
  | "ready"
  | "needs_review"
  | "analysis_failed"
  | "failed";

export function computeAudioReadiness(track: Track, ctx: TrackEligibilityContext): AudioReadinessState {
  const elig = getTrackEligibility(track, ctx);
  if (!elig.eligible) return "failed";

  switch (track.analysisStatus) {
    case "queued":
    case "analyzing":
      return "importing";
    case "failed":
      return "analysis_failed";
    case "review_needed": {
      // 0712_MUSIC_Catalog_Analysis_Orchestration §6.1: a fresh import stub
      // is stamped "review_needed" as its initial placeholder before the
      // canonical analyzer has ever touched it (see audioImport.ts) — that
      // is "not analyzed yet", not "a human needs to resolve an ambiguity".
      // Only treat it as needs_review once analyzeTrackMood (the canonical
      // mood step, tagged "play_analyzer") has actually run and produced a
      // genuinely low-confidence result.
      const wasCanonicallyAnalyzed = track.analysisSources?.includes("play_analyzer");
      return wasCanonicallyAnalyzed ? "needs_review" : "analysis_pending";
    }
    case "not_analyzed":
    case "partial":
    case "stale":
      return "analysis_pending";
    case "analyzed":
      break;
    default:
      // No analysisStatus at all — treat like not-yet-analyzed rather than
      // silently calling it ready.
      return "analysis_pending";
  }

  if (track.identityStatus && track.identityStatus !== "clean") return "needs_review";
  return "ready";
}

/**
 * True for a track that entered the library through the import pipeline
 * (audioImport.ts stamps analysisSources: ["import"]) and hasn't finished
 * canonical mood/DSP analysis yet. This is the narrow, import-scoped signal
 * used to WARN about automatic playlist generation candidates — it
 * deliberately does NOT apply to the user's whole pre-existing library, only
 * to material this build's import path actually introduced.
 */
export function isPendingImportAnalysis(track: Track): boolean {
  return !!track.analysisSources?.includes("import") && track.analysisStatus !== "analyzed";
}

/**
 * 0804_MUSIC_Playlist_Eligibility_Repair — pending canonical mood/DSP
 * analysis is never a hard playlist-generation rejection (confirmed
 * decision: these are still valid, playable catalog entries with incomplete
 * enrichment, not ineligible ones). The prior excludePendingImports()
 * pool-thinning filter that used to run BEFORE gatePlaylistCandidates() at
 * every generation call site is removed — silently shrinking the pool with
 * no accounting was the actual root cause of playlist generation reporting
 * "0 eligible" against a mostly-unanalyzed real catalog. Callers should
 * instead surface this count as an unresolved-metadata WARNING (e.g. into
 * PlaylistEligibilityAudit.unresolvedMetadataWarnings, trackEligibility.ts)
 * and let section scoring degrade gracefully for missing energy/BPM/key/
 * mood/role, exactly as it already does for any other track with
 * incomplete metadata.
 */
export function countPendingImportAnalysis(tracks: Track[]): number {
  return tracks.filter(isPendingImportAnalysis).length;
}

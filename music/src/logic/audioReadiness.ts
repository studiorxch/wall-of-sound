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
 * required analysis yet. This is the narrow, import-scoped signal used to
 * gate automatic playlist generation — it deliberately does NOT apply to the
 * user's whole pre-existing library, only to material this build's import
 * path actually introduced.
 */
export function isPendingImportAnalysis(track: Track): boolean {
  return !!track.analysisSources?.includes("import") && track.analysisStatus !== "analyzed";
}

/**
 * Filters out imported-but-not-yet-ready tracks from an automatic-generation
 * candidate pool. Call this before gatePlaylistCandidates() at generation
 * call sites — NOT at manual add-to-playlist paths, which should warn rather
 * than silently exclude (spec §Operational Eligibility: "Yes with warning").
 */
export function excludePendingImports(tracks: Track[]): Track[] {
  return tracks.filter((t) => !isPendingImportAnalysis(t));
}

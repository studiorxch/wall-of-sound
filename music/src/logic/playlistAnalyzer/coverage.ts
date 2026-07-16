// Playlist Analyzer Review — coverage (0712_MUSIC_Playlist_Analyzer_Review).
// Reuses the canonical Catalog analysis predicates rather than re-deriving
// "is this track analyzed" logic — this module only classifies and counts.

import type { Track } from "../../data/trackTypes";
import type { PlaylistAnalysisCoverage, PlaylistTrackAnalysisState } from "../../data/playlistAnalyzerTypes";
import { requiresCanonicalAnalysis, isBpmKeyTrustedComplete } from "../dspFeatureExtraction";

/**
 * Per-track analysis state for playlist review purposes. Mirrors the same
 * six-state model used by Analyzer Review (Not Analyzed/Analyzing/Partial/
 * Complete/Failed/Stale) — reuses the same canonical predicates so the two
 * surfaces never disagree about what "missing" or "complete" means.
 */
export function classifyTrackAnalysisState(track: Track): PlaylistTrackAnalysisState {
  if (track.analysisStatus === "queued" || track.analysisStatus === "analyzing") return "analyzing";
  if (track.analysisStatus === "failed") return "failed";
  if (requiresCanonicalAnalysis(track)) {
    // requiresCanonicalAnalysis is true for both "never analyzed" and "stale
    // version" — distinguish using the same signal Analyzer Review uses.
    return track.audioAnalysis ? "stale" : "missing";
  }
  // 0712_MUSIC_BPM_Key_Detector_Calibration §19/§21 — Complete requires
  // trusted/confident bpm+key (not legacy_unknown, not ambiguity-flagged),
  // matching the same rule Analyzer Review's Complete/Partial demotion uses.
  if (!isBpmKeyTrustedComplete(track)) return "partial";
  if (track.analysisStatus === "partial") return "partial";
  return "complete";
}

export function computeCoverage(tracks: Track[]): PlaylistAnalysisCoverage {
  let completeCount = 0, partialCount = 0, missingCount = 0, failedCount = 0, staleCount = 0;
  for (const t of tracks) {
    switch (classifyTrackAnalysisState(t)) {
      case "complete": completeCount++; break;
      case "partial": partialCount++; break;
      case "missing": missingCount++; break;
      case "failed": failedCount++; break;
      case "stale": staleCount++; break;
      case "analyzing": partialCount++; break; // in-flight counts toward "not yet usable"
    }
  }
  const trackCount = tracks.length;
  return {
    trackCount,
    completeCount,
    partialCount,
    missingCount,
    failedCount,
    staleCount,
    coverageRatio: trackCount > 0 ? completeCount / trackCount : 0,
  };
}

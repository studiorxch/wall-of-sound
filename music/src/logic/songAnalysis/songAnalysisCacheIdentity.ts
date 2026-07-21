// Complete Song Intelligence and Section Map (0717C) — cache identity.
// spec §4.4: an analysis result is reusable only when ALL five dimensions
// match. Track ID alone is never sufficient — the same doctrine 0717B's
// SECTIONAL_RADIO_MISSING_SOURCE correction established for
// sourceMediaIdentity. Called lazily only when a track opens in Sectional
// Looper or Export→RADIO fires — never a background/eager scan (spec
// §4.2/§15 explicitly forbid catalog-wide eager analysis).

import type { Track } from "../../data/trackTypes";
import { computeSourceFingerprint } from "../playbackBounds/computeTrackPlaybackBounds";
import type { CompleteSongAnalysis } from "../../data/songAnalysisTypes";
import { CURRENT_SONG_ANALYZER_VERSION, CURRENT_SONG_ANALYSIS_CONFIG_VERSION } from "../../data/songAnalysisTypes";

export interface SongAnalysisCacheIdentity {
  sourceMediaFingerprint: string;
  decodedFrameCount: number;
  sampleRate: number;
  analyzerVersion: string;
  configurationVersion: string;
}

export function computeSongAnalysisCacheIdentity(
  track: Track,
  decodedFrameCount: number,
  sampleRate: number,
): SongAnalysisCacheIdentity {
  const pathHint = track.audioRelPath ?? track.filePath ?? track.trackId;
  // Duration in seconds, matching computeSourceFingerprint's own contract
  // (path + duration, never a raw frame count) — derived from the actual
  // decoded frame count/sample rate passed in, not any track metadata
  // field, so the fingerprint reflects what was really decoded.
  const durationSeconds = decodedFrameCount / sampleRate;
  return {
    sourceMediaFingerprint: computeSourceFingerprint(pathHint, durationSeconds),
    decodedFrameCount,
    sampleRate,
    analyzerVersion: CURRENT_SONG_ANALYZER_VERSION,
    configurationVersion: CURRENT_SONG_ANALYSIS_CONFIG_VERSION,
  };
}

export function isSongAnalysisCacheValid(analysis: CompleteSongAnalysis, current: SongAnalysisCacheIdentity): boolean {
  return (
    analysis.sourceMediaFingerprint === current.sourceMediaFingerprint &&
    analysis.decodedFrameCount === current.decodedFrameCount &&
    analysis.sampleRate === current.sampleRate &&
    analysis.analyzerVersion === current.analyzerVersion &&
    analysis.configurationVersion === current.configurationVersion
  );
}

export function isSongAnalysisStale(analysis: CompleteSongAnalysis, current: SongAnalysisCacheIdentity): boolean {
  return !isSongAnalysisCacheValid(analysis, current);
}

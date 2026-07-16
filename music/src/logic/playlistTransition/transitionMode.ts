// Playlist Transition Preparation — sync-mode selection, duration presets,
// and section profiles (§6, §11, §12, §13, §22). Never chooses a mode
// beyond available trusted evidence (§22).

import type { TempoRelationship, PlaylistTransitionSyncMode, PlaylistTransitionFallbackMode } from "../../data/playlistTransitionTypes";

export interface SyncModeInputs {
  fromBeatMapTrusted: boolean;
  toBeatMapTrusted: boolean;
  fromBarGridTrusted: boolean;
  toBarGridTrusted: boolean;
  fromPlaybackBoundsTrusted: boolean;
  toPlaybackBoundsTrusted: boolean;
  tempoRelationship: TempoRelationship;
  outgoingAvailableSeconds: number;
  incomingAvailableSeconds: number;
  durationKnown: boolean;
}

// §22 fallback hierarchy: phrase sync → bar sync → beat sync → timed
// crossfade → gapless → hard cut → blocked. Phrase sync is never selected
// by this build — phrase-candidate evidence (TrackBeatMap.phraseCandidates)
// is schema-complete but not yet populated by the beat-map detector
// (a documented limitation since 0713D), so there is no trusted phrase
// evidence to require for that tier. Honest scoping, not a bug.
export function selectSyncMode(inputs: SyncModeInputs): { syncMode: PlaylistTransitionSyncMode; fallbackMode?: PlaylistTransitionFallbackMode } {
  const tempoUsable = inputs.tempoRelationship === "direct" || inputs.tempoRelationship === "half_time" || inputs.tempoRelationship === "double_time";

  if (inputs.fromBeatMapTrusted && inputs.toBeatMapTrusted && inputs.fromBarGridTrusted && inputs.toBarGridTrusted && tempoUsable) {
    return { syncMode: "bar_sync" };
  }
  if (inputs.fromBeatMapTrusted && inputs.toBeatMapTrusted && tempoUsable) {
    return { syncMode: "beat_sync" };
  }
  if (inputs.fromPlaybackBoundsTrusted && inputs.toPlaybackBoundsTrusted) {
    if (inputs.outgoingAvailableSeconds > 1 && inputs.incomingAvailableSeconds > 1) {
      return { syncMode: "timed_crossfade", fallbackMode: "timed_crossfade" };
    }
    return { syncMode: "gapless", fallbackMode: "gapless" };
  }
  if (inputs.durationKnown) {
    return { syncMode: "hard_cut", fallbackMode: "hard_cut" };
  }
  return { syncMode: "unsynced" };
}

// §12 — centralized duration presets.
const BEAT_AWARE_BAR_PRESETS = [16, 8, 4, 2, 1];
const TIME_BASED_PRESETS_SECONDS = [12, 8, 4, 2];

export interface TransitionDurationResult {
  transitionDurationSeconds: number;
  transitionBars?: number;
}

export function selectTransitionDuration(
  syncMode: PlaylistTransitionSyncMode,
  outgoingAvailableSeconds: number,
  incomingAvailableSeconds: number,
  secondsPerBar?: number,
): TransitionDurationResult {
  const cap = Math.max(0, Math.min(outgoingAvailableSeconds, incomingAvailableSeconds));

  if ((syncMode === "bar_sync" || syncMode === "beat_sync") && secondsPerBar != null && secondsPerBar > 0) {
    for (const bars of BEAT_AWARE_BAR_PRESETS) {
      const seconds = bars * secondsPerBar;
      if (seconds <= cap) return { transitionDurationSeconds: +seconds.toFixed(2), transitionBars: bars };
    }
    return { transitionDurationSeconds: 0, transitionBars: undefined };
  }

  if (syncMode === "gapless" || syncMode === "hard_cut" || syncMode === "unsynced") {
    return { transitionDurationSeconds: 0 };
  }

  for (const seconds of TIME_BASED_PRESETS_SECONDS) {
    if (seconds <= cap) return { transitionDurationSeconds: seconds };
  }
  return { transitionDurationSeconds: +Math.max(0, cap).toFixed(2) };
}

// §13 — one configuration table for section-role overlap preference. Not
// wired into hard duration limits by this build (no section-role signal is
// threaded through preparePlaylist.ts's per-pair loop yet) — exposed so a
// caller CAN bias duration selection by section role in a future pass.
export type TransitionSectionProfile = "intro" | "development" | "peak" | "release" | "outro" | "unknown";

export const SECTION_OVERLAP_BIAS: Record<TransitionSectionProfile, number> = {
  intro: 0.6,       // conservative overlap, preserve musical openings
  development: 1.0, // stable bar-aligned baseline
  peak: 1.2,        // tighter alignment, stronger overlap allowed
  release: 1.4,     // longer fades may be appropriate
  outro: 0.5,       // preserve final resolution, avoid cutting tails
  unknown: 1.0,
};

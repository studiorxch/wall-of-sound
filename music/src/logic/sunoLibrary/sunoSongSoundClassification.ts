// 0827_MUSIC_Library_Workspace_Track_Inspector_Rearchitecture Part C — a
// deterministic VIEW/classification rule only. Never mutates a canonical
// recording, never creates a second record, never moves or re-links a
// physical asset — every consumer of this module reads
// SunoCanonicalRecording.totalDurationSeconds (the same field already
// displayed as "Duration" throughout the existing Suno UI, e.g.
// SunoRecordingDetail.tsx) and returns a label, nothing more.
//
// Per spec §12, a missing/invalid duration must NOT be guessed at — unlike
// metadataReadiness.ts's existing 180s fallback pattern for Track (which
// this module deliberately does not reuse), an unresolved duration here
// stays "unresolved" rather than defaulting to either bucket.

import type { SunoCanonicalRecording } from "../../data/sunoLibraryTypes";

export const SUNO_SONG_SOUND_DURATION_THRESHOLD_SECONDS = 60;

export type SunoSongSoundClass = "song" | "sound" | "unresolved";

export function classifySunoDuration(totalDurationSeconds: number | null | undefined): SunoSongSoundClass {
  if (
    totalDurationSeconds == null ||
    !Number.isFinite(totalDurationSeconds) ||
    totalDurationSeconds <= 0
  ) {
    return "unresolved";
  }
  return totalDurationSeconds >= SUNO_SONG_SOUND_DURATION_THRESHOLD_SECONDS ? "song" : "sound";
}

export function classifySunoRecording(rec: Pick<SunoCanonicalRecording, "totalDurationSeconds">): SunoSongSoundClass {
  return classifySunoDuration(rec.totalDurationSeconds);
}

export interface SunoSongSoundSummary {
  songs: number;
  sounds: number;
  unresolved: number;
  total: number;
}

export function computeSunoSongSoundSummary(
  recordings: readonly Pick<SunoCanonicalRecording, "totalDurationSeconds">[],
): SunoSongSoundSummary {
  const summary: SunoSongSoundSummary = { songs: 0, sounds: 0, unresolved: 0, total: recordings.length };
  for (const rec of recordings) {
    const cls = classifySunoRecording(rec);
    if (cls === "song") summary.songs++;
    else if (cls === "sound") summary.sounds++;
    else summary.unresolved++;
  }
  return summary;
}

export function applySunoSongSoundFilter<T extends Pick<SunoCanonicalRecording, "totalDurationSeconds">>(
  recordings: readonly T[],
  filter: SunoSongSoundClass | null,
): T[] {
  if (!filter) return [...recordings];
  return recordings.filter((rec) => classifySunoRecording(rec) === filter);
}

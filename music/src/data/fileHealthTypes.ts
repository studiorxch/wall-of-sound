// MUSIC P0 Clean Library Foundation — Step C: Analysis Status + File Health
// (0826B_MUSIC_P0_Clean_Library_Foundation_StepC).
//
// File health answers "can the underlying audio file actually be used?" —
// deliberately a separate axis from Track.analysisStatus (BPM/key/mood
// pipeline state). A track can have a perfectly healthy file and a failed
// analysis, or a missing file and a fully "analyzed" status left over from
// before the file went missing. Neither implies the other, so this type is
// never merged into AnalysisStatus or AudioReadinessState.

export type FileHealthStatus =
  | "healthy"        // resolved source, no known playback issue
  | "missing"         // no file at the expected path
  | "unresolved"      // path/reference itself can't be resolved to a location
  | "codec_blocked"   // file exists but the browser/decoder can't play it
  | "unavailable"     // e.g. network/external-URL source unreachable
  | "unknown";        // never checked

export const FILE_HEALTH_LABELS: Record<FileHealthStatus, string> = {
  healthy: "Healthy",
  missing: "Missing",
  unresolved: "Unresolved",
  codec_blocked: "Codec blocked",
  unavailable: "Unavailable",
  unknown: "Not checked",
};

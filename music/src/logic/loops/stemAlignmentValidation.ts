// 0715G_MUSIC_Sectional_Looper_Simplification_And_Stem_Ready_Export —
// required correction: validate stem alignment BEFORE rendering, and never
// reuse one raw frame number across stems that may have been decoded at
// different sample rates. Every stem's export frames are computed fresh
// from its OWN authoritative decoded sample rate; if a stem fails
// parent/duration compatibility, the caller must stop with a specific error
// rather than silently producing a misaligned file.

export interface StemBufferInfo {
  trackId: string;
  parentTrackId?: string;
  sampleRate: number;
  durationSeconds: number;
}

export type StemAlignmentError =
  | { kind: "wrong_parent"; trackId: string }
  | { kind: "duration_mismatch"; trackId: string; expectedSeconds: number; actualSeconds: number };

export interface StemAlignmentResult {
  ok: boolean;
  errors: StemAlignmentError[];
}

const DEFAULT_DURATION_TOLERANCE_SECONDS = 0.5;

// (a) same parentTrackId, (b) duration compatible with the parent within a
// tolerance (Demucs stems are full-length by construction — a large
// mismatch means a wrong/corrupt file was selected).
export function validateStemAlignment(
  parentTrackId: string,
  parentDurationSeconds: number,
  stems: StemBufferInfo[],
  toleranceSeconds: number = DEFAULT_DURATION_TOLERANCE_SECONDS,
): StemAlignmentResult {
  const errors: StemAlignmentError[] = [];
  for (const stem of stems) {
    if (stem.parentTrackId !== parentTrackId) {
      errors.push({ kind: "wrong_parent", trackId: stem.trackId });
      continue;
    }
    if (Math.abs(stem.durationSeconds - parentDurationSeconds) > toleranceSeconds) {
      errors.push({
        kind: "duration_mismatch", trackId: stem.trackId,
        expectedSeconds: parentDurationSeconds, actualSeconds: stem.durationSeconds,
      });
    }
  }
  return { ok: errors.length === 0, errors };
}

// Required correction — never copy a frame number across stems. Each
// stem's exact frame bounds are recomputed from the SAME seconds using that
// stem's OWN sample rate, so a stem decoded at a different rate than
// another still lands on the musically-correct boundary.
export function computeStemFrameBounds(
  startSeconds: number,
  endSeconds: number,
  stemSampleRate: number,
): { startFrame: number; endFrame: number } {
  return {
    startFrame: Math.round(startSeconds * stemSampleRate),
    endFrame: Math.round(endSeconds * stemSampleRate),
  };
}

export interface RenderedStemFileInfo {
  trackId: string;
  sampleCount: number;
  sampleRate: number;
}

// Post-render check: every file in the group must share (near-)identical
// final duration, regardless of each file's own sample rate.
export function validateRenderedStemGroup(
  files: RenderedStemFileInfo[],
  toleranceSeconds: number = 0.01,
): StemAlignmentResult {
  if (files.length === 0) return { ok: true, errors: [] };
  const durations = files.map((f) => f.sampleCount / f.sampleRate);
  const referenceDuration = durations[0];
  const errors: StemAlignmentError[] = [];
  files.forEach((f, i) => {
    if (Math.abs(durations[i] - referenceDuration) > toleranceSeconds) {
      errors.push({
        kind: "duration_mismatch", trackId: f.trackId,
        expectedSeconds: referenceDuration, actualSeconds: durations[i],
      });
    }
  });
  return { ok: errors.length === 0, errors };
}

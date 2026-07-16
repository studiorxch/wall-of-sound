// 0714S_MUSIC_Looper_Transport_Musical_Grid_And_Canonical_Segmentation —
// sample-frame boundary helpers (§18/§19) and canonical equal train-car
// segmentation (§20-§22). Pure logic only: never re-derives the beat-map,
// BPM, or playback-bounds detectors — consumes their already-decided
// values (decimal BPM, playable window) exactly as given.

import type { AudioBoundary, TrackSegment } from "../../data/loopTypes";

const BEATS_PER_BAR = 4; // matches loopCandidates.ts's existing assumption

// §18 — frame is authoritative; seconds are always derived, never the
// reverse. Rounds to the nearest whole sample frame.
export function secondsToFrame(seconds: number, sampleRate: number): number {
  return Math.round(seconds * sampleRate);
}

export function frameToSeconds(frame: number, sampleRate: number): number {
  return frame / sampleRate;
}

export function makeBoundary(seconds: number, sampleRate: number): AudioBoundary {
  const frame = secondsToFrame(seconds, sampleRate);
  return { frame, seconds: frameToSeconds(frame, sampleRate) };
}

function genSegmentId(): string {
  return `seg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// §22 — equal train-car segmentation over the FULL playable window
// (windowStart..windowEnd), using the source's own decimal BPM (never
// rounded — §10/§11). The final segment is shorter when the window doesn't
// divide evenly, per spec ("Partial final segment").
//
// §21 invariants enforced by construction:
//   segment[0].startFrame === windowStart frame
//   segment[n].endFrame === segment[n+1].startFrame
//   segment[last].endFrame === windowEnd frame
export function generateEqualSegments(
  sourceTrackId: string,
  windowStartSeconds: number,
  windowEndSeconds: number,
  bpm: number,
  barsPerSegment: number,
  sampleRate: number,
  now: string = new Date().toISOString(),
): TrackSegment[] {
  if (windowEndSeconds <= windowStartSeconds || bpm <= 0 || barsPerSegment <= 0) return [];

  const secondsPerBar = (60 / bpm) * BEATS_PER_BAR;
  const segmentDurationSeconds = secondsPerBar * barsPerSegment;
  if (segmentDurationSeconds <= 0) return [];

  const windowStartFrame = secondsToFrame(windowStartSeconds, sampleRate);
  const windowEndFrame = secondsToFrame(windowEndSeconds, sampleRate);
  const segmentDurationFrames = Math.max(1, secondsToFrame(segmentDurationSeconds, sampleRate));

  const segments: TrackSegment[] = [];
  let cursor = windowStartFrame;
  let order = 0;
  while (cursor < windowEndFrame) {
    const rawEnd = cursor + segmentDurationFrames;
    // §21 — last segment.endFrame MUST equal windowEndFrame exactly, even
    // when segmentDurationFrames doesn't divide the window evenly.
    const endFrame = Math.min(rawEnd, windowEndFrame);
    const isPartial = endFrame < rawEnd;
    segments.push({
      id: genSegmentId(),
      sourceTrackId,
      order,
      label: isPartial ? "tail" : "section",
      startFrame: cursor,
      endFrame,
      startSeconds: frameToSeconds(cursor, sampleRate),
      endSeconds: frameToSeconds(endFrame, sampleRate),
      source: "equal_grid",
      confidence: undefined,
      createdAt: now,
      updatedAt: now,
    });
    cursor = endFrame;
    order++;
  }
  return segments;
}

// §21 — pure validation helper, usable both by tests and by any future
// segment-editing UI to reject an invalid edit before it's committed.
export function validateSegmentation(segments: TrackSegment[]): {
  hasGaps: boolean;
  hasOverlaps: boolean;
  isOrdered: boolean;
} {
  let hasGaps = false;
  let hasOverlaps = false;
  let isOrdered = true;
  for (let i = 0; i < segments.length - 1; i++) {
    const a = segments[i];
    const b = segments[i + 1];
    if (b.order <= a.order) isOrdered = false;
    if (b.startFrame > a.endFrame) hasGaps = true;
    if (b.startFrame < a.endFrame) hasOverlaps = true;
  }
  return { hasGaps, hasOverlaps, isOrdered };
}

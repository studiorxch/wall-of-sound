// 0714T — segment editing operations (§24-§27): split, merge, shared-
// boundary movement, equal train-car regeneration. Pure logic; every
// operation preserves the no-gap/no-overlap/ordered invariants from
// loopSegmentation.ts's validateSegmentation() or rejects the edit.

import type { TrackSegment } from "../../data/loopTypes";
import { validateSegmentation } from "./loopSegmentation";

function genSegmentId(): string {
  return `seg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function renumber(segments: TrackSegment[]): TrackSegment[] {
  return segments
    .slice()
    .sort((a, b) => a.startFrame - b.startFrame)
    .map((s, i) => ({ ...s, order: i }));
}

export interface SegmentEditResult {
  ok: boolean;
  segments: TrackSegment[];
  error?: string;
}

// §24 — split a segment at an exact frame. Rejects at a boundary, outside
// the segment, or if either resulting half would be zero-length.
export function splitSegmentAtFrame(
  segments: TrackSegment[], segmentId: string, frame: number, sampleRate: number,
  now: string = new Date().toISOString(),
): SegmentEditResult {
  const target = segments.find((s) => s.id === segmentId);
  if (!target) return { ok: false, segments, error: "Segment not found." };
  if (frame <= target.startFrame || frame >= target.endFrame) {
    return { ok: false, segments, error: "Split frame must be strictly inside the segment (not at a boundary)." };
  }
  const left: TrackSegment = {
    ...target, id: genSegmentId(), endFrame: frame, endSeconds: frame / sampleRate,
    source: "manual", updatedAt: now,
  };
  const right: TrackSegment = {
    ...target, id: genSegmentId(), startFrame: frame, startSeconds: frame / sampleRate,
    source: "manual", updatedAt: now,
  };
  const next = renumber([...segments.filter((s) => s.id !== segmentId), left, right]);
  const { hasGaps, hasOverlaps } = validateSegmentation(next);
  if (hasGaps || hasOverlaps) return { ok: false, segments, error: "Split would violate no-gap/no-overlap invariant." };
  return { ok: true, segments: next };
}

// §25 — merge two ADJACENT segments. Preserves the first (lower-order)
// segment's label per the spec's recommended policy.
export function mergeAdjacentSegments(
  segments: TrackSegment[], segmentIdA: string, segmentIdB: string, now: string = new Date().toISOString(),
): SegmentEditResult {
  const a = segments.find((s) => s.id === segmentIdA);
  const b = segments.find((s) => s.id === segmentIdB);
  if (!a || !b) return { ok: false, segments, error: "Segment not found." };
  const [first, second] = a.startFrame <= b.startFrame ? [a, b] : [b, a];
  if (first.endFrame !== second.startFrame) {
    return { ok: false, segments, error: "Segments are not adjacent." };
  }
  const merged: TrackSegment = {
    ...first,
    id: genSegmentId(),
    endFrame: second.endFrame,
    endSeconds: second.endSeconds,
    source: "manual",
    updatedAt: now,
  };
  const next = renumber([...segments.filter((s) => s.id !== first.id && s.id !== second.id), merged]);
  return { ok: true, segments: next };
}

// §26 — shared-boundary editing: moving segment[n].endFrame ==
// segment[n+1].startFrame must update BOTH atomically, in one operation.
export function moveSharedBoundary(
  segments: TrackSegment[], leftSegmentId: string, rightSegmentId: string, newBoundaryFrame: number,
  sampleRate: number, minSegmentFrames: number = 1, now: string = new Date().toISOString(),
): SegmentEditResult {
  const left = segments.find((s) => s.id === leftSegmentId);
  const right = segments.find((s) => s.id === rightSegmentId);
  if (!left || !right) return { ok: false, segments, error: "Segment not found." };
  if (left.endFrame !== right.startFrame) return { ok: false, segments, error: "Segments do not share a boundary." };
  if (newBoundaryFrame - left.startFrame < minSegmentFrames) return { ok: false, segments, error: "Left segment would be too short." };
  if (right.endFrame - newBoundaryFrame < minSegmentFrames) return { ok: false, segments, error: "Right segment would be too short." };

  const nextLeft: TrackSegment = { ...left, endFrame: newBoundaryFrame, endSeconds: newBoundaryFrame / sampleRate, source: "manual", updatedAt: now };
  const nextRight: TrackSegment = { ...right, startFrame: newBoundaryFrame, startSeconds: newBoundaryFrame / sampleRate, source: "manual", updatedAt: now };
  const next = renumber([
    ...segments.filter((s) => s.id !== leftSegmentId && s.id !== rightSegmentId),
    nextLeft, nextRight,
  ]);
  const { hasGaps, hasOverlaps } = validateSegmentation(next);
  if (hasGaps || hasOverlaps) return { ok: false, segments, error: "Boundary move would violate no-gap/no-overlap invariant." };
  return { ok: true, segments: next };
}

export function relabelSegment(
  segments: TrackSegment[], segmentId: string, label: TrackSegment["label"], displayLabel: string | undefined,
  now: string = new Date().toISOString(),
): TrackSegment[] {
  return segments.map((s) => (s.id === segmentId ? { ...s, label, displayLabel, updatedAt: now } : s));
}

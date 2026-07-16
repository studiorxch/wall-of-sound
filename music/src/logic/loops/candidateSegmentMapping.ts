// 0714T — candidate-to-segment mapping and staleness (§29-§32). Pure
// classification logic; never mutates candidates or segments, only
// describes the relationship between them for a given revision pair.

import type { CandidateSegmentMapping, TrackSegment } from "../../data/loopTypes";

export interface MappableRange {
  candidateId: string;
  startFrame: number;
  endFrame: number;
}

// §30 — contained: fully inside one segment. Spans: crosses one or more
// shared boundaries. Unmapped: no segment overlaps it at all.
export function mapCandidateToSegments(
  candidate: MappableRange,
  segments: TrackSegment[],
  gridRevisionId: string,
  segmentationRevisionId: string,
): CandidateSegmentMapping {
  const overlapping = segments.filter(
    (s) => candidate.startFrame < s.endFrame && candidate.endFrame > s.startFrame,
  );
  if (overlapping.length === 0) {
    return {
      candidateId: candidate.candidateId, segmentIds: [], relation: "unmapped",
      mappedAtGridRevisionId: gridRevisionId, mappedAtSegmentationRevisionId: segmentationRevisionId,
    };
  }
  const contained = overlapping.length === 1
    && candidate.startFrame >= overlapping[0].startFrame
    && candidate.endFrame <= overlapping[0].endFrame;
  return {
    candidateId: candidate.candidateId,
    segmentIds: overlapping.map((s) => s.id),
    relation: contained ? "contained" : "spans_segments",
    mappedAtGridRevisionId: gridRevisionId,
    mappedAtSegmentationRevisionId: segmentationRevisionId,
  };
}

// §32 — a candidate/mapping becomes stale when it was computed against a
// grid or segmentation revision that is no longer the active one.
export function isMappingStale(
  mapping: CandidateSegmentMapping, activeGridRevisionId: string, activeSegmentationRevisionId: string,
): boolean {
  return mapping.mappedAtGridRevisionId !== activeGridRevisionId
    || mapping.mappedAtSegmentationRevisionId !== activeSegmentationRevisionId;
}

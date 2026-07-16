// 0715C_MUSIC_Loop_Workspace_Editing_And_Revision_Completion §20 — draft
// staleness. Pure comparison against whatever baseline was stamped onto the
// draft at save time (sourceFingerprintAtSave/durationSecondsAtSave/
// gridRevisionIdAtSave/segmentationRevisionIdAtSave, see loopTypes.ts's
// DraftLoopSelection doc comment) — never silently remaps a stale draft,
// only reports whether it should be flagged for review.

import type { DraftLoopSelection } from "../../data/loopTypes";

export interface DraftStalenessContext {
  sourceFingerprint: string;
  durationSeconds: number;
  gridRevisionId: string;
  segmentationRevisionId: string;
}

export function isDraftStale(draft: DraftLoopSelection, current: DraftStalenessContext): boolean {
  if (draft.sourceFingerprintAtSave !== undefined && draft.sourceFingerprintAtSave !== current.sourceFingerprint) {
    return true;
  }
  if (draft.durationSecondsAtSave !== undefined && draft.durationSecondsAtSave !== current.durationSeconds) {
    return true;
  }
  if (draft.gridRevisionIdAtSave !== undefined && draft.gridRevisionIdAtSave !== current.gridRevisionId) {
    return true;
  }
  // Segmentation revision only matters for a segment-sourced draft (§20 —
  // "segment revision removes mapped segment"); a manual/candidate draft
  // doesn't care whether segmentation changed underneath it.
  if (draft.source === "segment" && draft.segmentationRevisionIdAtSave !== undefined
    && draft.segmentationRevisionIdAtSave !== current.segmentationRevisionId) {
    return true;
  }
  return false;
}

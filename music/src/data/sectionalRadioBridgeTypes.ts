// Sectional Looper Radio Export Bridge (0717B) — bridge-only types
// connecting a Sectional Looper selection to the existing 0716B/0717A RADIO
// promotion pipeline. These are NOT part of the RADIO package contract
// (that stays in radioLoopTypes.ts) and are not RadioLoops workspace types
// (radioWorkspaceTypes.ts) — they exist only to shape the export-menu →
// snapshot → resolve → promote flow inside Sectional Looper.

import type { AlignmentMode } from "../ui/sectionalLooper/AlignmentControl";
import type { RadioValidationIssue } from "./radioLoopTypes";

export type SectionalExportTarget = "wav" | "radio";

// An immutable capture of "the reviewed selection at the moment RADIO was
// chosen" (spec §5.1) — nothing downstream re-reads live UI state after
// this is built.
export interface SectionalRadioPromotionSnapshot {
  sourceTrackId: string;
  // track.playbackBounds.sourceFingerprint — never a trackId fallback. See
  // sectionalRadioSnapshotBuilder.ts for the rejection this enforces.
  sourceMediaIdentity: string;
  // Set only when the selection already points at a persisted LoopAsset.
  existingLoopId?: string;
  // The loop's active revision id at capture time; null means the implicit
  // original revision (0715E convention), undefined means "no backing loop
  // yet" (existingLoopId is also unset in that case).
  activeLoopRevisionId?: string | null;
  startFrame: number;
  endFrame: number;
  sampleRate: number;
  durationSeconds: number;
  alignmentMode: AlignmentMode;
  bpm?: number;
  key?: string;
  barCount?: number;
  selectionReviewState: "reviewed" | "stale";
  capturedAt: string;
}

export type SectionalRadioSourceResolution =
  | { mode: "reuse_approved"; loopId: string }
  | { mode: "reuse_needs_approval"; loopId: string }
  | { mode: "create_new" };

export type SectionalRadioBridgeState =
  | "idle"
  | "validating_selection"
  | "resolving_source_loop"
  // 0717C_MUSIC_Complete_Song_Intelligence_and_Section_Map — additive gate
  // state, entered after the LoopAsset has been resolved but before the
  // dialog opens. Never touches handleSectionalRadioPromote or the
  // deferred-LoopAsset-creation guarantee (0717B plan Decision 3).
  | "checking_analysis_readiness"
  | "awaiting_radio_confirmation"
  | "promoting"
  | "complete";

// Reuses RadioValidationIssue's shape verbatim (code/message/severity) —
// bridge-specific codes (SECTIONAL_RADIO_*) live in the `code` string, not
// in a new type.
export type SectionalRadioBridgeIssue = RadioValidationIssue;

export interface SectionalRadioBridgeResult {
  ok: boolean;
  radioLoopId?: string;
  packageVersion?: number;
  loopId?: string;
  resolution?: SectionalRadioSourceResolution;
  issues: SectionalRadioBridgeIssue[];
}

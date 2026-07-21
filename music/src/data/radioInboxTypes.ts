// 0717D_RADIO_Playlist_Inbox_and_Performance_Foundation §7 — the RADIO
// Inbox asset model: staged candidate material (tracks, loops, sounds,
// stems, and not-yet-packageable kinds) submitted for possible RADIO use.
// "Inbox" does not mean public — it means staged for RADIO curation.
// Literal types adopted verbatim from the spec. Pure — no DOM, no Node.

import type { RadioValidationIssue } from "./radioLoopTypes";

export type RadioAssetKind =
  | "track"
  | "loop"
  | "sound"
  | "stem"
  | "stem_section"
  | "fill"
  | "build"
  | "announcement";

// A curation lifecycle — deliberately separate from RadioApprovalMetadata's
// publicUseApproved (a licensing/rights field collected by the existing
// PromoteToRadioDialog). INBOX -> ASSIGNED -> APPROVED -> PUBLISHED ->
// RETIRED describes where an item sits in RADIO's own workflow, not
// whether it has publication rights.
export type RadioInboxState =
  | "INBOX"
  | "ASSIGNED"
  | "APPROVED"
  | "PUBLISHED"
  | "RETIRED";

// NOT_YET_PACKAGEABLE covers every RadioAssetKind without a real encoder
// today (all but "loop") — never fabricate readiness for a kind with no
// packaging path.
export type RadioAssetReadiness =
  | "UNPREPARED"
  | "ANALYZING"
  | "NEEDS_REVIEW"
  | "READY"
  | "NOT_YET_PACKAGEABLE"
  | "FAILED";

// Reuses RadioValidationIssue's shape verbatim (code/message/severity) —
// the same pattern SectionalRadioBridgeIssue already established in
// 0717B. Never a new issue shape.
export type RadioAssetReadinessIssue = RadioValidationIssue;

// Flat optional source-ref fields (not a discriminated union) per spec §7 —
// exactly one of sourceTrackId/sourceLoopId/sourceSoundId/sourceStemId is
// populated depending on `kind`; sourceSectionId is additionally populated
// for a stem_section. sourceFingerprint is always computeSourceFingerprint()'s
// real output (computeTrackPlaybackBounds.ts) — never a trackId fallback;
// track ID alone is not a source-media identity.
export type RadioInboxItem = {
  id: string;
  kind: RadioAssetKind;
  sourceTrackId?: string;
  sourceLoopId?: string;
  sourceSoundId?: string;
  sourceStemId?: string;
  sourceSectionId?: string;
  sourceFingerprint: string;
  sourceRevisionId?: string | null;
  startFrame?: number;
  endFrame?: number;
  state: RadioInboxState;
  readiness: RadioAssetReadiness;
  assignedPlaylistIds: string[];
  // 0718A_MUSIC_RADIO_Clean_Board_and_Explicit_Send_Flows §4 — parallel to
  // assignedPlaylistIds, kept separate so a bank membership never conflates
  // with playlist membership.
  assignedBankIds?: string[];
  legacyRadioLoopId?: string;
  createdAt: string;
  updatedAt: string;
};

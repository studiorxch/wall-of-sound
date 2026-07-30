// Import-to-crate intake pipeline (0711_MUSIC_Import_To_Crate_Intake_Pipeline).
// Supersedes 0711_MUSIC_Canonical_Import_Pipeline_v1.0.0 (external draft doc,
// never implemented) — this is the actual, shipped version of that model,
// scoped to the app's existing file-picker import mechanism (no folder/
// drag-drop import exists yet, so none is invented here).

import type { TrackPlaybackIssue } from "./playProjectTypes";

export const SUPPORTED_AUDIO_EXTENSIONS = [
  ".flac",
  ".wav",
  ".aiff",
  ".aif",
  ".mp3",
  ".m4a",
  ".aac",
  ".ogg",
  ".opus",
];

export type IntakeItemStatus =
  | "pending"
  | "scanning"
  | "ready"
  | "needs_review"
  | "duplicate"
  | "blocked"
  | "committed";

export type IntakeDuplicateStatus = "exact_duplicate" | "possible_duplicate" | "not_duplicate";

// 0728_MUSIC_Import_Intake_Simplification — the user's own explicit decision
// on a "duplicate"-classified row. "import_separately" is the one thing that
// can override an otherwise-excluded duplicate back into an importable
// status (see resolveIntakeStatus in importIntake.ts); "keep_existing" is
// purely a UI acknowledgment — a duplicate row is already excluded from
// "Import All Ready" without it.
export type IntakeDuplicateResolution = "keep_existing" | "import_separately";

export type MusicImportIntakeItem = {
  id: string;
  sourcePath: string;
  fileName: string;
  extension: string;
  status: IntakeItemStatus;
  metadata: {
    title?: string;
    artist?: string;
    albumTitle?: string;
    durationSeconds?: number;
    bpm?: number;
    key?: string;
    energy?: number;
  };
  playbackIssue?: TrackPlaybackIssue;
  duplicateStatus: IntakeDuplicateStatus;
  duplicateOfTrackId?: string;
  duplicateResolution?: IntakeDuplicateResolution;
  warnings: string[];
  errors: string[];
  // The library snapshot detectDuplicate was originally run against, carried
  // on the item (not a new App.tsx prop) so an in-panel title/artist edit
  // can rerun the SAME resolver without a second detection path or any
  // change to how the panel is invoked. One shared array reference across
  // every item in a batch — not a per-item copy.
  existingTracks: import("./trackTypes").Track[];
  // Carries the actual Track object built by importAudioFiles() so commit
  // doesn't have to re-derive it — the intake item is a review wrapper
  // around an already-uploaded, already-normalized Track.
  track: import("./trackTypes").Track;
};

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
  | "warning"
  | "blocked"
  | "committed"
  | "skipped";

export type IntakeDuplicateStatus = "exact_duplicate" | "possible_duplicate" | "not_duplicate";

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
  assignedCrateIds: string[];
  warnings: string[];
  errors: string[];
  // Carries the actual Track object built by importAudioFiles() so commit
  // doesn't have to re-derive it — the intake item is a review wrapper
  // around an already-uploaded, already-normalized Track.
  track: import("./trackTypes").Track;
};

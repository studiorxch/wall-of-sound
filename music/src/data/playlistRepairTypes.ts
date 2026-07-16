// Playlist Local Repair and Gap Analysis (0713_MUSIC_Playlist_Local_Repair_And_
// Gap_Analysis) — data model. Mirrors the spec's interfaces exactly; logic
// modules live under src/logic/playlistRepair/.

export type PlaylistIssueScope = "transition" | "local_window" | "section" | "playlist";

export type PlaylistIssueSeverity = "info" | "warning" | "error";

export type PlaylistIssueColorState = "green" | "yellow" | "red" | "blue";

export interface PlaylistIssue {
  issueId: string;
  type: string;
  severity: PlaylistIssueSeverity;
  colorState: PlaylistIssueColorState;

  primaryPosition: number;
  affectedPositions: number[];
  scope: PlaylistIssueScope;
  sectionId?: string;

  explanation: string;
  warningCodes: string[];

  repairAvailable: boolean;
  missingTrackBriefAvailable: boolean;
  accepted?: boolean;
}

export interface PlaylistRepairZone {
  issueId: string;
  sectionId?: string;

  previousPosition?: number;
  targetPosition: number;
  nextPosition?: number;

  previousTrackId?: string;
  currentTrackId?: string;
  nextTrackId?: string;

  issueTypes: string[];
  severity: PlaylistIssueSeverity;
}

export type PlaylistRepairCandidateClassification = "perfect_match" | "strong_match" | "temporary_match" | "weak_match";

export interface PlaylistRepairCandidate {
  trackId: string;
  rank: number;

  classification: PlaylistRepairCandidateClassification;

  previousTransitionScore?: number;
  nextTransitionScore?: number;

  energyFit: number;
  bpmFit: number;
  keyFit: number;
  moodFit: number;
  roleFit: number;
  durationFit: number;

  totalScore: number;
  warningCodes: string[];
  explanation: string;
}

export interface MissingTrackBrief {
  id: string;
  playlistId: string;
  sectionId?: string;
  positionBetween: [number | null, number | null];

  role: string;

  energy: {
    preferredRange?: [number, number];
    displayRange?: [number, number];
    direction?: string;
  };

  tempo: {
    preferredBpmRange?: [number, number];
    acceptableBpmRange?: [number, number];
    halfDoubleAllowed?: boolean;
  };

  harmony: {
    preferredCamelotKeys: string[];
    acceptableCamelotKeys: string[];
  };

  moods: {
    required: string[];
    optional: string[];
    avoid: string[];
  };

  structure?: {
    stableTempo?: boolean;
    cleanIntroBars?: number;
    cleanOutroBars?: number;
  };

  durationSeconds?: {
    preferred?: [number, number];
  };

  purpose: string;
  confidence: number;
}

export type LibraryGapStatus = "open" | "candidate_found" | "temporary_match" | "resolved" | "dismissed";

export interface LibraryGapRecord {
  gapId: string;
  status: LibraryGapStatus;

  sourcePlaylistIds: string[];
  sourceIssueIds: string[];

  mergedBrief: MissingTrackBrief;
  occurrenceCount: number;

  matchingTrackIds: string[];
  createdAt: string;
  updatedAt: string;
}

export type PlaylistReadinessState = "ready" | "ready_with_compromises" | "needs_repair" | "insufficient_analysis";

export interface PlaylistReadinessSummary {
  state: PlaylistReadinessState;
  unresolvedRedCount: number;
  acceptedYellowCount: number;
  blueUncertaintyCount: number;
  explanation: string;
}

// Per-playlist-record persistence (0713 §13, §16) — accepted/ignored issue
// state must survive reload, or every "Keep Current"/"Apply Temporary Match"
// choice would reappear as a fresh unresolved issue on next open. Issues
// themselves are never persisted (they're derived from current playlist +
// library state every time) — only the user's disposition on a given issue
// key is durable.
export type PlaylistIssueDisposition = "accepted_temporary" | "kept_current" | "ignored";

// Reanalyze Entire Playlist (0713_MUSIC_Playlist_Repair_Analyzer_Export_
// Completion §5) — progress model for a running batch, and a persisted
// summary of the most recent completed run.
export interface PlaylistReanalysisProgress {
  queued: number;
  running: number;
  complete: number;
  partial: number;
  failed: number;
  remaining: number;
}

export interface PlaylistReanalysisSummary {
  lastReanalyzedAt: string;
  queued: number;
  complete: number;
  partial: number;
  failed: number;
}

export interface PlaylistRepairState {
  // Keyed by a deterministic issue key (see issueKey() in issueDetection.ts),
  // not issueId (which is regenerated each computation).
  dispositions: Record<string, PlaylistIssueDisposition>;
  // Set only after a playlist-level "Reanalyze Entire Playlist" run has
  // occurred (§9 — export must not show this section otherwise).
  lastReanalysis?: PlaylistReanalysisSummary;
}

// Blue-uncertainty aggregation (§4) — a presentation-layer grouping over the
// live-computed issue list. The underlying PlaylistIssue records are never
// removed or mutated by aggregation; this is purely additive.
export type PlaylistIssueAggregateActionType =
  | "reanalyze_playlist"
  | "reanalyze_tracks"
  | "review_provenance"
  | "none";

export interface PlaylistIssueAggregate {
  aggregateId: string;
  issueType: string;
  colorState: "blue";
  count: number;
  affectedPositions: number[];
  affectedTrackIds: string[];
  summary: string;
  detail: string;
  actionType?: PlaylistIssueAggregateActionType;
}

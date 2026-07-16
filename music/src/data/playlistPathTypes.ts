export type PathOptionStrategy =
  | "best_overall"
  | "lowest_warnings"
  | "most_movement";

export type WarningBreakdown = {
  bpmJump: number;
  keyRisk: number;
  energyJump: number;
  emptySlot: number;
  missingMetadata: number;
  unknown: number;
};

export type ScoreBreakdown = {
  warnings: number;       // /25
  durationFit: number;    // /15
  energyContinuity: number; // /15
  keyCompatibility: number; // /15
  bpmContinuity: number;  // /10
  movement: number;       // /10
  rating: number;         // /5
  fillRatio: number;      // /5
};

export type PlaylistPathOptionStats = {
  redWarnings: number;
  yellowWarnings: number;
  warningBreakdown: WarningBreakdown;
  scoreBreakdown: ScoreBreakdown;
  improvementHints: string[];
  bpmMin: number;
  bpmMax: number;
  avgEnergy: number;
  energyRange: number;
  keyCompatibilityScore: number; // 0–1
  movementScore: number;         // 0–1
  durationFitScore: number;      // 0–1
  crateUsage: Record<string, number>;
};

export type PlaylistGenerationMetadataSnapshot = {
  snapshotId: string;
  generatedAt: string;
  crateIds: string[];
  poolTrackCount: number;
  readinessGrade: string;
  durationReady: number;
  bpmReady: number;
  keyReady: number;
  energyReady: number;
  totalTracks: number;
  metadataRevision: string;
  latestImportId?: string;
};

export type PlaylistOptionStaleReason =
  | "metadata_changed"
  | "audiolab_import_applied"
  | "crate_pool_changed"
  | "duplicate_rules_changed"
  | "target_duration_changed";

export type PlaylistMetadataRepairImpact = {
  latestImportId: string;
  beforeSnapshot: PlaylistGenerationMetadataSnapshot;
  afterSnapshot: PlaylistGenerationMetadataSnapshot;
  staleOptionCount: number;
  createdAt: string;
};

export type PlaylistPathOption = {
  id: string;
  name: string;
  strategy: PathOptionStrategy;
  createdAt: string;

  trackIds: string[];
  durationSeconds: number;
  score: number;

  stats: PlaylistPathOptionStats;

  /** Smoothed energy sequence derived from actual track order */
  derivedCurvePoints: { timePercent: number; energy: number }[];

  explanation: string;

  // Metadata provenance (0705E) — generation snapshot for stale detection
  metadataRevision?: string;
  metadataSnapshot?: PlaylistGenerationMetadataSnapshot;
  staleReason?: PlaylistOptionStaleReason;
};

/**
 * Projection Output Governance types — v1.3.0
 *
 * Canonical type layer for Projection Lab artifact classification,
 * persistence, revision binding, intake intent, approval, lineage,
 * truth/fiction mode governance, source bias, and replay determinism.
 *
 * INVARIANTS:
 * - Projection Lab may interpret, compare, recommend, serialize advisory artifacts.
 * - Projection Lab may NOT activate runtime behavior, authorize deployment,
 *   certify authenticity, bypass WOS governance, or self-promote into runtime authority.
 * - Recommendation is NEVER approval.
 * - Exports are NEVER runtime commands.
 * - WOS retains final runtime sovereignty.
 * - Missing intakeIntent must default to 'review' — activation requires explicit declaration.
 */

// ─── Artifact classification ──────────────────────────────────────────────────

/**
 * All projection outputs must serialize into one of these governed artifact classes.
 * Undefined intermediate states are prohibited.
 */
export type ProjectionArtifactClass =
  | 'TRANSIENT_PROJECTION'      // volatile sandbox preview
  | 'SAVED_PROJECTION_REPORT'   // archival advisory evaluation
  | 'PALETTE_RUNTIME_PROFILE'   // governed runtime advisory export
  | 'REPLAY_SNAPSHOT';          // deterministic replay package

// ─── Persistence classes ──────────────────────────────────────────────────────

/**
 * Persistence classes govern how artifacts survive across sessions.
 * session_scoped is reserved infrastructure — no artifact class currently defaults to it.
 */
export type ProjectionPersistenceClass =
  | 'ephemeral'         // volatile frame-local memory
  | 'session_scoped'    // temporary non-authoritative persistence (reserved)
  | 'archival'          // append-only immutable record
  | 'replay_snapshot';  // deterministic frozen package

// ─── Intake intent ────────────────────────────────────────────────────────────

/**
 * Intake intent must be explicitly declared on all projection exports.
 * Missing intakeIntent defaults to 'review' — activation requires 'activate'.
 *
 * review:   advisory intake only — approval token not required — runtime activation prohibited.
 * activate: approval token required — approval scope validation required — fail-closed.
 */
export type IntakeIntent = 'review' | 'activate';

export const DEFAULT_INTAKE_INTENT: IntakeIntent = 'review';

// ─── Recommendation ───────────────────────────────────────────────────────────

/**
 * Recommendation values are advisory signals only.
 * They do not imply authorization or deployment readiness.
 * No recommendation value authorizes runtime activation.
 * Recommendation may NEVER bypass WOS review.
 */
export type RecommendationLevel = 'high' | 'medium' | 'low' | 'blocked' | 'unknown';

/**
 * Canonical runtime role keys — §7.1 of PaletteRuntimeProfileExport v1.0.0.
 * Exports must use only these keys in runtimeRoleRecommendation.
 */
export type RuntimeRoleKey =
  | 'base'              // primary canvas, land, water, or major map surface
  | 'accent'            // highlights, signage, route emphasis, visual spikes
  | 'atmosphere'        // haze, fog, glow, lighting wash
  | 'route'             // path lines, navigation traces, motion corridors
  | 'ui'                // panels, labels, cards, control overlays
  | 'event'             // temporary event-level visual treatment
  | 'weather'           // weather-response layer
  | 'time'              // time-of-day modifier
  | 'reference_overlay' // cultural or media reference layer
  | 'fiction_override'  // declared stylized world overlay
  | 'audio_hint';       // advisory sonic association only

export const CANONICAL_RUNTIME_ROLE_KEYS: RuntimeRoleKey[] = [
  'base', 'accent', 'atmosphere', 'route', 'ui',
  'event', 'weather', 'time', 'reference_overlay',
  'fiction_override', 'audio_hint',
];

export type RuntimeRoleRecommendation = Partial<Record<RuntimeRoleKey, RecommendationLevel>>;

// ─── Approval ─────────────────────────────────────────────────────────────────

/**
 * Approval scope must match activation scope.
 * Scope mismatch must fail closed, quarantine activation, generate audit diagnostics.
 */
export type ApprovalScope = 'profile' | 'mode' | 'condition' | 'district' | 'session';

export type ApprovalStatus = 'approved' | 'unapproved' | 'revoked';

export interface ProjectionApprovalAuthorization {
  /** null when unapproved */
  governedAuthorizationToken: string | null;
  approvedBy?: string;
  approvalTimestamp?: string;
  approvalScope?: ApprovalScope;
  approvalStatus: ApprovalStatus;
}

// ─── Revision binding ─────────────────────────────────────────────────────────

/**
 * Persistent artifacts must bind to all five dependency axes.
 * Stale artifacts occur when any bound dependency diverges.
 */
export interface ProjectionRevisionBinding {
  paletteId: string;
  revisionId: string;
  /** SHA-256 of stable revision content */
  revisionHash: string;
  rendererSignature: string;
  shaderSignature: string;
  stageTemplateRef: string;
  /**
   * SHA-256 of normalized evaluation parameters:
   * projection_mode + weather_state + time_of_day_state + renderer + shader + atmospheric params.
   * All float values normalized to fixed-point integers before hashing.
   * Purpose: prevent platform drift and hardware variance across replay cycles.
   */
  deterministicParameterHash: string;
}

// ─── Stale state ──────────────────────────────────────────────────────────────

/**
 * Stale artifacts must visibly expose state, expose invalidation reason,
 * block silent export reuse, and preserve archival lineage.
 */
export interface ProjectionStaleState {
  isStale: boolean;
  staleReason: string | null;
  staleDetectedAt: string | null;
}

export const INITIAL_STALE_STATE: ProjectionStaleState = {
  isStale: false,
  staleReason: null,
  staleDetectedAt: null,
};

// ─── Mode context ─────────────────────────────────────────────────────────────

/**
 * Truth mode evaluates plausibility only.
 * Truth mode does NOT certify authenticity, establish canonical geography,
 * or claim cultural authority.
 */
export interface TruthModeContext {
  evaluationMode: 'truth';
  /** Authority is plausibility assessment only — never authenticity certification */
  authorityClass: 'plausibility_assessment';
  geographicAuthenticityCertified: false;
  culturalAuthorityClaimed: false;
}

/**
 * Fiction mode must remain visibly declared across all export paths.
 * WOS must surface 'FICTION MODE ACTIVE' when fiction-mode overlays influence runtime.
 */
export interface FictionModeContext {
  evaluationMode: 'fiction';
  authorityClass: 'transient_stylization_overlay';
  fictionModeActive: true;
}

/**
 * Mood mode evaluates emotional atmosphere only.
 * May influence recommendations but may not assert truth.
 */
export interface MoodModeContext {
  evaluationMode: 'mood';
  authorityClass: 'emotional_atmosphere_assessment';
  geographicAuthenticityCertified: false;
  culturalAuthorityClaimed: false;
}

/**
 * Reference mode cites source style only.
 * May not claim cultural authority.
 */
export interface ReferenceModeContext {
  evaluationMode: 'reference';
  authorityClass: 'cultural_reference_assessment';
  geographicAuthenticityCertified: false;
  culturalAuthorityClaimed: false;
}

export type ProjectionModeContext =
  | TruthModeContext
  | FictionModeContext
  | MoodModeContext
  | ReferenceModeContext;

// ─── Source bias ──────────────────────────────────────────────────────────────

/**
 * Source bias must remain machine-readable.
 * Invisible provenance becomes invisible authority.
 * Low-diversity samples may not imply authenticity or runtime authority.
 */
export interface ProjectionSourceBias {
  sampleCount: number;
  /** e.g. 'single_image' | 'multi_image' | 'video_frame' | 'generative' */
  sourceType: string;
  extractionContext?: {
    timeOfDay?: string;
    weather?: string;
    sourceMedium?: string;
  };
  sourceDiversity: {
    level: 'low' | 'medium' | 'high';
  };
  knownBiases: string[];
  limitationStatement?: string;
}

// ─── Export governance ────────────────────────────────────────────────────────

/**
 * Required on every PALETTE_RUNTIME_PROFILE export.
 * All fields are invariant — WOS retains final runtime sovereignty.
 */
export interface ProjectionExportGovernance {
  authorityLevel: 'advisory_only';
  wosRetainsFinalAuthority: true;
  requiresWosReview: true;
  notARuntimeCommand: true;
}

export const PROJECTION_EXPORT_GOVERNANCE: ProjectionExportGovernance = {
  authorityLevel: 'advisory_only',
  wosRetainsFinalAuthority: true,
  requiresWosReview: true,
  notARuntimeCommand: true,
};

// ─── Lineage ──────────────────────────────────────────────────────────────────

/**
 * Artifacts declaring lineage participation must include traversable lineage metadata.
 * Invalid parent references must log warning, preserve creation, set parentValid: false.
 */
export interface ProjectionLineage {
  /** Required when artifact derives from, supersedes, or replays another artifact */
  parentArtifactId: string | null;
  /** false when parent reference cannot be resolved — artifact creation still preserved */
  parentValid: boolean;
  derivedFromClass?: ProjectionArtifactClass;
  sourceCandidatesRef?: string;
}

// ─── Replay ───────────────────────────────────────────────────────────────────

/**
 * Replay snapshots must support deterministic reconstruction.
 */
export type ReplayFidelityClass = 'exact_replay' | 'interpretive_replay' | 'comparative_replay';

/**
 * Exact replay must freeze all seven dependency axes.
 */
export interface ExactReplayBinding {
  replayClass: 'exact_replay';
  rendererSignature: string;
  shaderSignature: string;
  paletteRevisionId: string;
  weatherState: string;
  timeOfDayState: string;
  projectionMode: string;
  deterministicParameterHash: string;
}

// ─── Canonical PALETTE_RUNTIME_PROFILE ───────────────────────────────────────

/**
 * Canonical runtime profile artifact — §16.
 * Governed advisory export payload — NOT a runtime command.
 * May not self-authorize approval. WOS retains final runtime sovereignty.
 */
export interface PaletteRuntimeProfile {
  artifactClassification: 'PALETTE_RUNTIME_PROFILE';
  artifactId: string;
  generatedAt: string;
  persistenceClass: ProjectionPersistenceClass;
  /** Defaults to 'review' when missing — activation requires explicit 'activate' */
  intakeIntent: IntakeIntent;
  revisionBinding: ProjectionRevisionBinding;
  /** Advisory role recommendations — NOT runtime directives. Keys must be canonical RuntimeRoleKeys. */
  runtimeRoleRecommendation: RuntimeRoleRecommendation;
  modeContext: ProjectionModeContext;
  sourceBias: ProjectionSourceBias;
  staleState: ProjectionStaleState;
  /** Invariant governance block — all fields always true */
  exportGovernance: ProjectionExportGovernance;
  approvalAuthorization: ProjectionApprovalAuthorization;
  lineage: ProjectionLineage;
}

// ─── SAVED_PROJECTION_REPORT ──────────────────────────────────────────────────

export interface SavedProjectionReport {
  artifactClassification: 'SAVED_PROJECTION_REPORT';
  artifactId: string;
  generatedAt: string;
  persistenceClass: 'archival';
  revisionBinding: ProjectionRevisionBinding;
  evaluationSummary: string;
  recommendation: RecommendationLevel;
  modeContext: ProjectionModeContext;
  sourceBias: ProjectionSourceBias;
  staleState: ProjectionStaleState;
  lineage: ProjectionLineage;
}

// ─── TRANSIENT_PROJECTION ─────────────────────────────────────────────────────

export interface TransientProjection {
  artifactClassification: 'TRANSIENT_PROJECTION';
  sessionId: string;
  createdAt: string;
  persistenceClass: 'ephemeral';
  revisionBinding: Omit<ProjectionRevisionBinding, 'deterministicParameterHash'> & {
    deterministicParameterHash?: string;
  };
  modeContext: ProjectionModeContext;
}

// ─── REPLAY_SNAPSHOT ─────────────────────────────────────────────────────────

export interface ReplaySnapshot {
  artifactClassification: 'REPLAY_SNAPSHOT';
  artifactId: string;
  capturedAt: string;
  persistenceClass: 'replay_snapshot';
  replayFidelityClass: ReplayFidelityClass;
  frozenBinding: ExactReplayBinding | {
    replayClass: 'interpretive_replay' | 'comparative_replay';
    revisionId: string;
    projectionMode: string;
  };
  lineage: ProjectionLineage;
}

// ─── Union type ───────────────────────────────────────────────────────────────

export type ProjectionArtifact =
  | TransientProjection
  | SavedProjectionReport
  | PaletteRuntimeProfile
  | ReplaySnapshot;

// ─── Projection Lab UX — v1.0.1 ──────────────────────────────────────────────

/**
 * Supported time-of-day states for atmospheric projection.
 */
export type ProjectionTimeOfDay = 'dawn' | 'morning' | 'noon' | 'dusk' | 'night';

/**
 * Supported weather states for atmospheric projection.
 */
export type ProjectionWeatherState = 'clear' | 'cloudy' | 'rain' | 'fog' | 'storm' | 'snow' | 'haze';

export interface ProjectionEnvironment {
  timeOfDay: ProjectionTimeOfDay;
  weatherState: ProjectionWeatherState;
}

/**
 * Projection Lab workspace state.
 * evaluationMode drives governance surface visibility and fiction/truth enforcement.
 */
export interface ProjectionLabState {
  evaluationMode: 'truth' | 'mood' | 'reference' | 'fiction';
  primaryEnv: ProjectionEnvironment;
  /** Null when comparison surface is hidden */
  comparisonEnv: ProjectionEnvironment | null;
  /** Source bias context from the active palette */
  sourceContext?: Pick<ProjectionSourceBias, 'sampleCount' | 'sourceType' | 'extractionContext' | 'sourceDiversity' | 'knownBiases' | 'limitationStatement'>;
}

// ─── Validation ───────────────────────────────────────────────────────────────

export interface ProjectionGovernanceValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  /**
   * Activation quarantine — set true when intake_intent is 'activate'
   * but approval requirements fail. Quarantine must generate audit diagnostics.
   */
  activationQuarantined?: boolean;
  quarantineReason?: string;
}

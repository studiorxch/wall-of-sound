// Sectional Looper and Loop Library (0714_MUSIC_Sectional_Looper_And_Loop_
// Library v1.0.0) — canonical data model (§6, §7, §11, §12, §25, §28).
// A loop is a non-destructive reference into a source track (or, later, a
// stem/derived audio render) — the source file is never modified.

export type LoopSourceKind = "track" | "stem" | "derived_audio";

export type LoopStatus = "candidate" | "approved" | "rejected" | "archived";

export type LoopBoundarySource = "section_analysis" | "beat_grid" | "bar_grid" | "manual";

export type LoopContentClass =
  | "drums" | "bass" | "melodic" | "harmonic" | "vocal" | "fx" | "mixed" | "unknown";

// §12 — explicit warning codes, following the same SCREAMING_SNAKE_CASE,
// domain-prefixed convention as BEAT_MAP_*/PLAYBACK_BOUNDS_* warning codes.
export type LoopWarningCode =
  | "LOOP_BOUNDARY_UNTRUSTED"
  | "LOOP_GRID_UNTRUSTED"
  | "LOOP_ENDPOINT_DISCONTINUITY"
  | "LOOP_TEMPO_UNSTABLE"
  | "LOOP_TOO_SHORT"
  | "LOOP_TOO_LONG"
  | "LOOP_ATTACK_CLIPPED"
  | "LOOP_TAIL_CLIPPED"
  | "LOOP_SOURCE_MISSING"
  | "LOOP_SOURCE_CHANGED"
  | "LOOP_RENDER_FAILED"
  // Multi-Length Loop Candidate Generation and Preview Reliability
  // (0714P_MUSIC_..._v1.0.0 §6)
  | "LOOP_PROVISIONAL_BAR_GRID"
  | "LOOP_PHASE_UNCERTAIN"
  | "LOOP_TIME_BASED_FALLBACK"
  | "LOOP_LENGTH_EXCEEDS_SECTION"
  | "LOOP_PREVIEW_REJECTED"
  // 0714S_MUSIC_Looper_Transport_Musical_Grid_And_Canonical_Segmentation
  // v1.0.0 §33
  | "LOOPER_HIDDEN_AUDIO_AUTHORITY"
  | "LOOPER_GRID_BPM_ROUNDED"
  | "LOOPER_GRID_ORIGIN_UNCERTAIN"
  | "LOOPER_GRID_PHASE_OFFSET"
  | "LOOPER_SEGMENT_GAP"
  | "LOOPER_SEGMENT_OVERLAP"
  | "LOOPER_FINAL_PARTIAL_SEGMENT"
  | "LOOPER_CANDIDATE_STALE_AFTER_GRID_CHANGE"
  | "LOOPER_FRAME_BOUNDARY_MISMATCH";

// §3 — supported musically-useful lengths.
export type SupportedLoopBars = 4 | 8 | 16 | 32 | 64;
export type SupportedLoopSeconds = 8 | 16 | 32 | 64;

export type LoopLength =
  | { kind: "bars"; bars: SupportedLoopBars; beatCount: number; expectedDurationSeconds: number }
  | { kind: "seconds"; seconds: SupportedLoopSeconds; expectedDurationSeconds: number };

// §4 — which evidence tier a candidate's boundaries came from.
export type LoopCandidateGenerationMode = "trusted_grid" | "provisional_grid" | "time_fallback" | "manual_only";

export interface LoopAsset {
  id: string;

  sourceKind: LoopSourceKind;
  sourceTrackId: string;
  sourceStemId?: string;

  title: string;
  sourceTitle: string;
  // §7 — lineage: source artist and fingerprint alongside the ID, so a
  // loop's provenance is legible without a join back to the (possibly
  // since-changed) live track record.
  sourceArtist?: string;
  sourceFingerprint?: string;
  // §7 — the beat-map/playback-bounds detector version(s) the candidate's
  // boundaries were derived from, so a later detector upgrade can be
  // distinguished from an actual source-audio change.
  sourceBeatMapDetectorVersion?: string;
  sourcePlaybackBoundsDetectorVersion?: string;

  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;

  beatCount?: number;
  barCount?: number;
  bpm?: number;
  key?: string;

  boundarySource: LoopBoundarySource;
  contentClass: LoopContentClass;

  // §18 — approval/lineage must retain generation provenance, not just the
  // final boundary numbers.
  generationMode?: LoopCandidateGenerationMode;
  provisional?: boolean;
  sectionLabel?: string;
  length?: LoopLength;

  seamlessnessScore?: number;
  confidence?: number;

  loopFilePath?: string;
  previewFilePath?: string;

  status: LoopStatus;

  warnings: LoopWarningCode[];
  // §7 — set true when the source track's fingerprint no longer matches
  // sourceFingerprint at the time this was last checked; never silently
  // remapped to the changed audio.
  needsReview?: boolean;

  notes?: string;

  createdAt: string;
  updatedAt: string;

  // 0715C_MUSIC_Loop_Workspace_Editing_And_Revision_Completion §21 — points
  // at the currently-active LoopRevision (see below). Editing an approved
  // loop's boundaries never mutates startSeconds/endSeconds in place; it
  // creates or updates a LoopRevision and repoints this instead.
  activeRevisionId?: string;
}

// §11 — loop-quality diagnostics. Each evidence field is a 0..1 score
// (higher = better); boundaryTransientPenalty is 0..1 where higher means a
// WORSE (more audible) discontinuity, subtracted from the composite score.
export interface LoopSeamlessnessEvidence {
  waveformMatch: number;
  rmsMatch: number;
  spectralMatch: number;
  zeroCrossingFit: number;
  gridAlignment: number;
  tempoStability: number;
  boundaryTransientPenalty: number;
}

export interface LoopSeamlessnessResult {
  score: number;
  confidence: number;
  evidence: LoopSeamlessnessEvidence;
  warnings: LoopWarningCode[];
}

// 0715F_MUSIC_Sample_Accurate_Loop_Audition_And_Playhead_Synchronization —
// renamed from "raw"/"micro_crossfade": a gain ramp on a single looping
// source node (fade down -> wrap -> fade up) does not overlap outgoing/
// incoming audio and is not a crossfade — it's a short level dip at the
// boundary. "hard_loop" (native, no gain automation) is the default;
// "boundary_fade" is opt-in only, never enabled by default. Never
// persisted (component-local React state only), so no migration needed.
export type LoopPreviewMode = "hard_loop" | "boundary_fade";

// Multi-Length Loop Candidate Generation and Preview Reliability
// (0714P_MUSIC_..._v1.0.0 §14). "playing" — and therefore a "Stop" button —
// may only be reached AFTER play() actually resolves, never optimistically.
export type LoopPreviewState = "idle" | "loading" | "playing" | "stopping" | "error";

export interface LoopPreviewSession {
  candidateId?: string;
  state: LoopPreviewState;
  error?: string;
}

// §25 — resumable Sectional Looper experiment record.
export interface AudioExperimentRecord {
  id: string;
  type: "sectional_looper";

  sourceTrackId: string;
  sourceFingerprint: string;

  status: "draft" | "processing" | "review" | "complete" | "failed";

  candidateLoopIds: string[];
  approvedLoopIds: string[];

  createdAt: string;
  updatedAt: string;
}

// §28 — future dual-deck-mixer contract. Not wired into any playback
// pathway by this build (§28: "do not activate automatic mixer loop use").
export interface MixerLoopDescriptor {
  loopId: string;
  sourceTrackId: string;

  filePath?: string;

  startSeconds: number;
  endSeconds: number;

  bpm?: number;
  beatCount?: number;
  barCount?: number;

  gridTrusted: boolean;
  provisional: boolean;
  sectionLabel?: string;
  seamlessnessScore?: number;

  contentClass: LoopContentClass;
}

export function toMixerLoopDescriptor(loop: LoopAsset, gridTrusted: boolean): MixerLoopDescriptor {
  return {
    loopId: loop.id,
    sourceTrackId: loop.sourceTrackId,
    filePath: loop.loopFilePath,
    startSeconds: loop.startSeconds,
    endSeconds: loop.endSeconds,
    bpm: loop.bpm,
    beatCount: loop.beatCount,
    barCount: loop.barCount,
    gridTrusted,
    provisional: !!loop.provisional,
    sectionLabel: loop.sectionLabel,
    seamlessnessScore: loop.seamlessnessScore,
    contentClass: loop.contentClass,
  };
}

// §11 — candidate ranking evidence (structural signals available at
// generation time; audio-evidence seamlessness scoring itself still only
// runs at approval time, per 0714N/0714O — never duplicated here).
export interface LoopCandidateScore {
  seamlessness: number;
  sectionStability: number;
  boundaryConfidence: number;
  tempoStability: number;
  repetitionStrength: number;
  uniqueness: number;
  usability: number;
  total: number;
}

// 0714R — Sectional Looper waveform, playhead, and active-candidate UI (§5).
// Pure display data: min/max peak bins over a decoded source buffer. Never
// used as an analysis input — waveform generation must not retune or
// duplicate the beat-map/playback-bounds/BPM detectors (§31 protected scope).
export interface WaveformPeak {
  min: number;
  max: number;
}

export interface WaveformEnvelope {
  sourceId: string;
  sourceFingerprint: string;

  sampleRate: number;
  durationSeconds: number;

  binCount: number;
  peaks: WaveformPeak[];

  createdAt: string;
  generatorVersion: string;
}

export interface CandidateWaveformSlice {
  candidateId: string;
  sourceWaveformId: string;

  startSeconds: number;
  endSeconds: number;

  peaks: WaveformPeak[];
}

// §11 — canonical preview visual state, derived from the SAME preview
// controller already driving audio playback (SectionalLooperWorkspace's
// audio element) — never a second independent timer.
export interface LoopPreviewVisualState {
  candidateId?: string;

  state: LoopPreviewState;

  absolutePositionSeconds?: number;
  relativePositionSeconds?: number;

  loopDurationSeconds?: number;
  progress?: number;
  loopIteration?: number;
}

// 0714S — Looper Transport, Musical Grid, and Canonical Segmentation.
// Frame is authoritative for canonical boundaries (§18); seconds are always
// derived from frame/sampleRate, never the other way around.
export interface AudioBoundary {
  frame: number;
  seconds: number;
}

// §10 — persisted decimal BPM, never rounded for timing math. `source`
// records provenance without re-deriving the BPM/key detector's own output
// (this type wraps the existing value, it does not replace or retune it).
export interface CanonicalTempo {
  bpm: number;
  confidence?: number;
  source: "detected" | "imported" | "manual" | "external_reference";
  updatedAt: string;
}

// §13 — musical grid: BPM/meter/origin/trust, derived from (never
// replacing) the existing beat-map detector's output, plus an explicit
// manual-correction path (§16) that creates a new revision rather than
// silently overwriting detector evidence.
export interface MusicalGrid {
  bpm: number;

  meterNumerator: number;
  meterDenominator: number;

  originSeconds: number;
  originFrame: number;

  originSource: "trusted_downbeat" | "detected_beat" | "manual";

  trust: "trusted" | "provisional" | "manual";

  confidence: number;

  beatFrames: number[];
  barFrames: number[];

  sourceFingerprint: string;
  updatedAt: string;
}

// §16 — every manual grid correction creates a new revision; detector
// evidence (the original MusicalGrid) is retained alongside it, never
// overwritten in place.
export interface MusicalGridRevision {
  id: string;
  grid: MusicalGrid;
  revisionOf?: string; // id of the prior revision this one supersedes
  reason: "detected" | "manual_origin" | "manual_nudge" | "half_bpm" | "double_bpm" | "reset_detected";
  createdAt: string;
}

// §20 — canonical, contiguous, non-overlapping structural segmentation.
// Distinct from LoopCandidate (§3 of spec): segments partition the track
// with no gaps/overlaps; candidates are reusable overlapping alternatives.
export interface TrackSegment {
  id: string;
  sourceTrackId: string;
  order: number;

  label: "intro" | "section" | "build" | "break" | "drop" | "bridge" | "outro" | "tail" | "unknown";
  displayLabel?: string; // 0714T §28 — free-text label alongside the normalized structural type

  startFrame: number;
  endFrame: number;

  startSeconds: number;
  endSeconds: number;

  source: "detected" | "equal_grid" | "manual";

  confidence?: number;

  // 0714T §36 — which grid revision this segment was generated against;
  // used for staleness detection when the grid changes underneath it.
  gridRevisionId?: string;

  createdAt: string;
  updatedAt: string;
}

// 0714T_MUSIC_Musical_Grid_Editor_And_Segment_Timeline — editor-surface
// completion of 0714S's foundations (§6, §17, §29, §36).

export interface MusicalGridMark {
  frame: number;
  seconds: number;

  bar: number;
  beat: number;
  subdivision?: number;

  kind: "bar" | "beat" | "subdivision";

  label?: string;
}

export type TimelineZoomLevel = "overview" | "bars" | "beats" | "subdivisions" | "fine";

export type SegmentSnapMode = "bar" | "beat" | "subdivision" | "frame" | "off";

// §29/§30 — candidate/segment relationship, recomputed whenever the grid or
// segmentation revision changes (never silently reused across a revision).
export interface CandidateSegmentMapping {
  candidateId: string;
  segmentIds: string[];
  relation: "contained" | "spans_segments" | "unmapped";
  mappedAtGridRevisionId: string;
  mappedAtSegmentationRevisionId: string;
}

// §36 — only the active revision drives current mapping/regeneration.
export interface SegmentationRevision {
  id: string;
  sourceTrackId: string;
  segmentIds: string[];
  source: "equal_grid" | "detected" | "manual";
  gridRevisionId: string;
  parentRevisionId?: string;
  createdAt: string;
}

// 0715A_MUSIC_Looper_Grid_Backdrop_And_Structural_Section_Overlay — pure
// DERIVED display data (§6, §11). Never a second timing authority: every
// band's frame bounds trace back to the same MusicalGrid/TrackSegment
// values already computed elsewhere.
export type GridBackdropLevel = "bar" | "group4" | "group8" | "group16";

export interface GridBackdropBand {
  id: string;
  startFrame: number;
  endFrame: number;
  startBar: number;
  endBar: number;
  level: GridBackdropLevel;
  emphasized: boolean;
  alternateIndex: number;
}

export type StructuralSectionLabel = "intro" | "body" | "outro" | "section";
export type StructuralSectionConfidence = "high" | "provisional";

export interface StructuralSectionBand {
  id: string;
  startFrame: number;
  endFrame: number;
  label: StructuralSectionLabel;
  displayLabel: string;
  confidence: StructuralSectionConfidence;
  source: "canonical_segments" | "playback_bounds" | "detected_structure" | "heuristic";
}

// 0715B_MUSIC_Timeline_Range_Selection_And_Compact_Loop_Workspace (§6, §10).
// Frame boundaries are authoritative (§7); seconds are always derived.
// 0715G_MUSIC_Sectional_Looper_Simplification_And_Stem_Ready_Export — added
// "region" (a clicked StructuralSectionBand in the new RegionStrip), purely
// additive.
export type TimelineSelectionSource = "drag" | "candidate" | "segment" | "approved_loop" | "numeric" | "manual" | "region";
export type TimelineSnapMode = "bar" | "beat" | "subdivision" | "zero_crossing" | "frame" | "off";

export interface TimelineSelection {
  sourceTrackId: string;

  startFrame: number;
  endFrame: number;

  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;

  source: TimelineSelectionSource;
  snapMode: TimelineSnapMode;

  candidateId?: string;
  segmentId?: string;
  loopId?: string;
  // 0715G — id of the StructuralSectionBand this selection came from, when
  // source === "region". Additive; never required.
  regionId?: string;

  createdAt: string;
  updatedAt: string;
}

// 0714S §5/§6 — the global playback authority extension. Deliberately a
// SEPARATE type from audio/dualDeckTypes.ts's own `PlaybackAuthority`
// ("standard_player" | "dual_deck_engine") rather than an edit to it — the
// dual-deck engine's internal authority machinery is protected scope (§38)
// and must not be touched. This type layers loop-audition mutual-exclusion
// on top, at the App-level, without altering the engine's own state model.
export type GlobalPlaybackAuthority = "standard_player" | "dual_deck_engine" | "loop_audition";

export interface LoopAuditionSession {
  authority: "loop_audition";

  sourceTrackId: string;
  sourceStemId?: string;
  candidateId: string;

  sourceTitle: string;
  sectionLabel?: string;

  startSeconds: number;
  endSeconds: number;

  startFrame: number;
  endFrame: number;

  currentAbsoluteSeconds: number;
  currentRelativeSeconds: number;

  loopIteration: number;

  status: "loading" | "playing" | "paused" | "stopped" | "error";

  previewMode: LoopPreviewMode;

  // 0715F_MUSIC_Sample_Accurate_Loop_Audition_And_Playhead_Synchronization —
  // additive fields for the Web Audio playback authority. `timingAuthority`
  // is "media_element" only when Web Audio decode/playback was unavailable
  // and the pre-existing HTMLAudioElement path was used as an explicit,
  // disclosed fallback (§14) — never silently presented as equivalent.
  timingAuthority: "web_audio" | "media_element";
  sampleRate: number;
  errorCode?: "AUDIO_CONTEXT_SUSPENDED" | "BUFFER_DECODE_FAILED" | "SOURCE_UNAVAILABLE"
    | "INVALID_LOOP_RANGE" | "LOOP_TOO_SHORT" | "MEDIA_FALLBACK_ACTIVE" | "PLAYHEAD_CLOCK_DESYNC";
}

// 0715C_MUSIC_Loop_Workspace_Editing_And_Revision_Completion — completes the
// snap model, keyboard editing, undo/redo, draft persistence, revisions, and
// Loop Bin organization deferred by 0715B. Frame boundaries remain
// authoritative throughout (§7 continuity); nothing here re-derives the
// beat-map/BPM grid, candidate ranking, seamlessness scoring, or renderer.

// §6 — exact subdivision snap target. Never fabricated outside source
// bounds (§6's own "do not create subdivision markers outside source
// bounds").
export interface SubdivisionSnapTarget {
  frame: number;
  seconds: number;

  bar: number;
  beat: number;
  subdivision: number;

  division: 4 | 8 | 16 | 32;
}

// §9 — zero-crossing snap feedback/warning codes, distinct from the general
// LoopWarningCode union since these are transient per-snap-attempt signals,
// not persisted loop-quality diagnostics.
export type ZeroCrossingWarningCode =
  | "ZERO_CROSSING_NOT_FOUND"
  | "ZERO_CROSSING_FAR_FROM_BOUNDARY"
  | "ZERO_CROSSING_LOW_CONFIDENCE";

export interface ZeroCrossingSnapResult {
  frame: number;
  offsetSeconds: number;
  warning?: ZeroCrossingWarningCode;
}

// §10 — explicit keyboard focus model across the workspace's editable
// surfaces.
export type SelectionFocusTarget =
  | "selection"
  | "start_boundary"
  | "end_boundary"
  | "inspector"
  | "loop_bin";

// §13 — undo/redo history entry. `type` is intentionally the NARROWED set
// from the 0715C completion plan's "Undo/redo scope" decision: operations
// that touch only state this workspace fully owns (TimelineSelection, draft
// label, LoopRevision/activeRevisionId) are undoable; operations with an
// external side effect this component doesn't own (a brand-new persisted
// LoopAsset via approve, a downloaded render file) are deliberately excluded
// — those are reversed via the Loop Bin's own explicit row actions instead
// (§26, §31), not an ephemeral history stack.
export type LoopWorkspaceHistoryEntryType =
  | "selection_create"
  | "selection_clear"
  | "boundary_move"
  | "rename"
  | "revision_create"
  | "revision_update";

export interface LoopWorkspaceSnapshot {
  timelineSelection: TimelineSelection | null;
  snapMode: TimelineSnapMode;
  label?: string;
}

export interface LoopWorkspaceHistoryEntry {
  id: string;

  type: LoopWorkspaceHistoryEntryType;

  before: LoopWorkspaceSnapshot;
  after: LoopWorkspaceSnapshot;

  createdAt: string;
}

// §17 — persisted draft selection, one per source/experiment. Restoring a
// draft never resumes playback (§18) and never silently remaps a stale
// draft (§20) — staleness is surfaced, not auto-corrected. The three
// `*AtSave` fields are additive beyond the spec's literal §17 shape —
// without a stored baseline there is nothing real to compare "has this
// changed since" against at restore time, so §20's staleness checks would
// otherwise have no data to work from.
export interface DraftLoopSelection {
  sourceTrackId: string;
  experimentId?: string;

  startFrame: number;
  endFrame: number;

  snapMode: TimelineSnapMode;
  label?: string;

  source: "manual" | "candidate" | "segment";

  candidateId?: string;
  segmentId?: string;

  sourceFingerprintAtSave?: string;
  durationSecondsAtSave?: number;
  gridRevisionIdAtSave?: string;
  segmentationRevisionIdAtSave?: string;

  updatedAt: string;
}

// §21 — an approved loop's edit history. Editing an approved LoopAsset's
// boundaries creates/updates one of these rather than mutating the
// LoopAsset's own startSeconds/endSeconds in place (§21's "must not
// silently mutate the original").
export interface LoopRevision {
  id: string;
  loopId: string;

  parentRevisionId?: string;

  startFrame: number;
  endFrame: number;

  label: string;

  gridRevisionId?: string;
  segmentationRevisionId?: string;

  createdAt: string;
  createdBy: "manual_edit" | "candidate" | "segment" | "regeneration";
}

// §30 — compact Loop Bin row model, one per candidate/approved-loop/
// revision entry actually displayed. `generationMode`/`score`/`createdAt`/
// `updatedAt` are additive beyond the spec's literal §30 shape — needed to
// actually satisfy §28's Mode filter and §29's Score/Created/Updated sort
// without fabricating data, since the base row wouldn't otherwise carry it.
export interface LoopBinRow {
  id: string;
  loopId?: string;
  candidateId?: string;
  revisionId?: string;

  title: string;

  startFrame: number;
  endFrame: number;

  lengthLabel: string;
  sectionLabel?: string;

  status: "approved" | "suggestion" | "rejected" | "stale";

  renderStatus?: string;
  sourceKind: "track" | "stem";

  generationMode?: LoopCandidateGenerationMode;
  score?: number;
  createdAt?: string;
  updatedAt?: string;

  // 0715E_MUSIC_Loop_Revision_Activation_And_Stem_Source_Entry §20 — additive
  // display hints for a stem-sourced/revisioned approved-or-stale row. Both
  // undefined for an ordinary, never-revisioned track loop.
  parentTrackTitle?: string;
  revisionLabel?: string;
}

// §27-§29 — Loop Bin tab/filter/sort UI state. Persisted workspace-globally
// (one instance across the whole looper page, not per track) per §27's
// "persist per workspace where practical."
export type LoopBinTab = "approved" | "suggestions" | "rejected" | "stale";

export interface LoopBinFilters {
  length?: 4 | 8 | 16 | 32 | 64 | "free";
  section?: "intro" | "body" | "outro" | "segment";
  mode?: "trusted" | "provisional" | "time_based" | "manual";
  render?: "rendered" | "not_rendered" | "stale" | "missing";
  source?: "track" | "stem";
}

export type LoopBinSortKey = "start_time" | "length" | "score" | "created" | "updated" | "name";

export interface LoopBinViewState {
  tab: LoopBinTab;
  filters: LoopBinFilters;
  sort: LoopBinSortKey;
  updatedAt: string;
}

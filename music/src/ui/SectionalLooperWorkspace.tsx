// Sectional Looper and Loop Library (0714_MUSIC_Sectional_Looper_And_Loop_
// Library v1.0.0) — the Sectional Looper workspace (§13, §14, §15, §16,
// §17, §27, §30). Non-destructive: never writes to the source file. This
// build implements the "non-destructive reference" render mode only (§18)
// — approving a candidate registers source start/end metadata as a
// LoopAsset; it does NOT render a standalone WAV file (see completion
// report for that explicit, deferred scope).
//
// 0714R_MUSIC_Sectional_Looper_Waveform_Playhead_And_Active_Candidate_UI —
// adds a real full-track waveform overview, per-candidate mini waveforms,
// an audio-driven preview playhead, section/length grouping, and explicit
// selected/previewing/approved/rejected visual states (§8-§21, §25). Does
// NOT touch candidate generation, ranking, seamlessness scoring, WAV
// encoding, render validation, or any detector (§31 protected scope).
//
// 0714S_MUSIC_Looper_Transport_Musical_Grid_And_Canonical_Segmentation —
// preview playback is no longer page-local: it now delegates entirely to
// the `loopAudition` controller lifted to the App root (§5-§9), so the
// audio and its transport survive navigating away from this page. This
// component reads playhead/loop-count/status from that controller instead
// of owning its own <audio> element.

import { useState, useRef, useMemo, useEffect } from "react";
import type { Track } from "../data/trackTypes";
import type {
  LoopAsset, LoopContentClass, LoopPreviewMode, WaveformEnvelope, WaveformPeak,
  MusicalGrid, MusicalGridRevision, TrackSegment, TimelineZoomLevel, SupportedLoopBars,
  TimelineSelection, TimelineSnapMode, DraftLoopSelection, LoopRevision, LoopBinViewState,
  StructuralSectionBand,
} from "../data/loopTypes";
import type { LoopRenderRecord } from "../data/loopRenderTypes";
import type { LoopAuditionController, LoopAuditionCandidateRef } from "../audio/useLoopAuditionController";
import { shouldStopAuditionForBoundaryEdit } from "../audio/loopAuditionState";
import { compareToGrid, applyPreviewOffsetFrames, PREVIEW_OFFSET_MS_STEPS, type PreviewOffsetMs } from "../logic/loops/gridPhaseDiagnostic";
import { generateLoopCandidates, type LoopCandidate } from "../logic/loops/loopCandidates";
import { scoreLoopSeamlessness } from "../logic/loops/loopSeamlessness";
import { computeLoopSeamlessnessEvidenceFromBuffer } from "../logic/loops/loopSeamlessnessAudio";
import { buildLoopFileName } from "../logic/loops/loopNaming";
import {
  generateWaveformEnvelope, computePeaksForRange, FULL_TRACK_BIN_COUNT, CANDIDATE_BIN_COUNT,
  WAVEFORM_GENERATOR_VERSION,
} from "./sectionalLooper/waveformPeaks";
import {
  buildWaveformCacheKey, getCachedWaveform, setCachedWaveform, isWaveformEnvelopeStale,
} from "./sectionalLooper/waveformCache";
import { TrackWaveformOverview, type CandidateVisualState } from "./sectionalLooper/TrackWaveformOverview";
import { LoopCandidateWaveform } from "./sectionalLooper/LoopCandidateWaveform";
import { LoopSectionGroup, groupCandidatesBySection } from "./sectionalLooper/LoopSectionGroup";
import { MusicalRuler } from "./sectionalLooper/MusicalRuler";
import { SegmentTimeline } from "./sectionalLooper/SegmentTimeline";
import { GridBackdropLayer } from "./sectionalLooper/GridBackdropLayer";
import { createTimelineTransform } from "./sectionalLooper/timelineTransform";
import {
  buildMusicalGridFromBeatMap, setManualOrigin, nudgeGridOrigin, halfBpm, doubleBpm, resetToDetectedGrid,
} from "../logic/loops/musicalGrid";
import { generateEqualSegments } from "../logic/loops/loopSegmentation";
import { splitSegmentAtFrame, mergeAdjacentSegments, moveSharedBoundary } from "../logic/loops/segmentEditing";
import { mapCandidateToSegments } from "../logic/loops/candidateSegmentMapping";
import { buildGridBackdropBands, type GroupingEmphasis } from "../logic/loops/gridBackdrop";
import { deriveStructuralSections } from "../logic/loops/structuralSections";
import { createSelection, moveSelectionBoundary, moveSelection, applySnapWithAudio } from "../logic/loops/timelineSelection";
import { TimelineSelectionOverlay } from "./sectionalLooper/TimelineSelectionOverlay";
import { findZeroCrossing } from "../logic/loops/zeroCrossingSnap";
import { isRenderStale } from "../logic/loops/loopRenderStaleness";
import { createRevision, updateExistingRevision, buildRevisionCompareSummary, resolveActiveLoopBoundsFrames, buildRevisionTimeline, wouldActivationStaleRender } from "../logic/loops/loopRevisions";
import { isStemTrack, resolveParentTrack } from "../logic/loops/stemLineage";
import { buildLoopBinRows, type LoopBinCandidateInput, type LoopBinLoopInput } from "../logic/loops/loopBinFilters";
import { SnapModeToolbar } from "./sectionalLooper/SnapModeToolbar";
import { useLoopWorkspaceKeyboard } from "./sectionalLooper/useLoopWorkspaceKeyboard";
import { useLoopWorkspaceHistory } from "./sectionalLooper/useLoopWorkspaceHistory";
import { UndoRedoControls } from "./sectionalLooper/UndoRedoControls";
import { useDraftSelectionPersistence, type DraftContext } from "./sectionalLooper/useDraftSelectionPersistence";
import { DraftRestoreBanner } from "./sectionalLooper/DraftRestoreBanner";
import { RevisionConfirmDialog } from "./sectionalLooper/RevisionConfirmDialog";
import { RevisionCompareSummary } from "./sectionalLooper/RevisionCompareSummary";
import { LoopBinPanel } from "./sectionalLooper/LoopBinPanel";
import { SourceLineageSummary } from "./sectionalLooper/SourceLineageSummary";
import { RevisionList } from "./sectionalLooper/RevisionList";
import { ActivateRevisionConfirm } from "./sectionalLooper/ActivateRevisionConfirm";
import { evaluateRegionEligibility, recommendDefaultBand, type RegionEligibility } from "../logic/loops/regionEligibility";
import { recommendForRegion, type LengthPreference, type AutoRecommendationResult } from "../logic/loops/autoRecommendation";
import { validateStemAlignment } from "../logic/loops/stemAlignmentValidation";
import { RegionStrip, type RegionUserState } from "./sectionalLooper/RegionStrip";
import { LengthControl } from "./sectionalLooper/LengthControl";
import { AlignmentControl, type AlignmentMode } from "./sectionalLooper/AlignmentControl";
import { DurationTargetControl, type DurationTarget } from "./sectionalLooper/DurationTargetControl";
import { DurationDisplay } from "./sectionalLooper/DurationDisplay";
import { MainActionBar, type MainActionPreviewStatus } from "./sectionalLooper/MainActionBar";
import { AdvancedCandidatesPanel } from "./sectionalLooper/AdvancedCandidatesPanel";
import { AdvancedDrawer } from "./sectionalLooper/AdvancedDrawer";
import { PlayheadMarker } from "./sectionalLooper/PlayheadMarker";

// §32/§33 — the legacy full candidate card-wall grid must not be reachable
// in normal user mode. This constant defaults closed and is never
// persisted/toggle-able from any visible UI control; the only way in is
// the MUSIC-namespaced localStorage escape hatch below (developer-only,
// not documented as primary UI).
const ENABLE_LOOP_CARD_DEBUG_VIEW = false;
const LOOP_CARD_DEBUG_STORAGE_KEY = "WOS_MUSIC_DEBUG_LOOP_CARD_VIEW";
function loopCardDebugViewEnabled(): boolean {
  if (ENABLE_LOOP_CARD_DEBUG_VIEW) return true;
  try {
    return localStorage.getItem(LOOP_CARD_DEBUG_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function channelDataFor(buffer: AudioBuffer): Float32Array[] {
  const channels: Float32Array[] = [];
  for (let i = 0; i < buffer.numberOfChannels; i++) channels.push(buffer.getChannelData(i));
  return channels;
}

function genRevisionId(): string {
  return `gridrev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function genLoopId(): string {
  return `loop_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function fmtTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toFixed(2).padStart(5, "0");
  return `${m}:${s}`;
}

// 0714S — stable per-candidate id, used to match the lifted loopAudition
// controller's session back to a specific card in THIS render, since the
// controller itself has no notion of "index within this page's array."
function candidateAuditionId(trackId: string, c: LoopCandidate): string {
  return `${trackId}_${c.sectionLabel}_${c.startSeconds.toFixed(3)}_${c.endSeconds.toFixed(3)}`;
}

type Props = {
  libraryTracks: Track[];
  sourceTrackId: string | null;
  onSelectSourceTrack: (trackId: string | null) => void;
  resolveTrackUrl: (track: Track) => string | null;
  onSaveLoop: (loop: LoopAsset) => void;
  // §30 — playback isolation: must pause/duck standard, prepared, and
  // dual-deck playback before starting loop preview.
  onBeforeLoopPreview: () => void;
  onRenderLoop: (
    loopId: string,
    provenance?: { gridRevisionId?: string; segmentationRevisionId?: string },
  ) => Promise<{ ok: boolean; error?: string }>;
  getLoopRenderRecord: (loopId: string) => LoopRenderRecord | undefined;
  // 0714R §16 — persisted loops for this source, used ONLY to seed the
  // approved/rejected badge state so it survives a reload/reopen; never
  // written back to here (saving still goes through onSaveLoop).
  loops: LoopAsset[];
  // 0714S §5-§9 — the App-root-lifted, navigation-safe preview controller.
  loopAudition: LoopAuditionController;

  // 0715C_MUSIC_Loop_Workspace_Editing_And_Revision_Completion — draft
  // selection persistence (§17-§20), the approved-loop revision model
  // (§21-§25), and Loop Bin view state (§27), all lifted to App-root state
  // following the same pattern as `loops`/`onSaveLoop` above.
  loopWorkspaceDrafts: DraftLoopSelection[];
  onSaveDraftSelection: (draft: DraftLoopSelection) => void;
  onClearDraftSelection: (sourceTrackId: string, experimentId?: string) => void;
  loopRevisions: LoopRevision[];
  onSaveLoopRevision: (revision: LoopRevision) => void;
  // 0715E_MUSIC_Loop_Revision_Activation_And_Stem_Source_Entry §5-§9 —
  // repoints LoopAsset.activeRevisionId at a past (or `null` for the
  // implicit original) revision. Persists via App-root state; this
  // component must not assume the resulting re-render has happened
  // synchronously (see commitMakeActiveRevision below).
  onMakeActiveRevision: (loopId: string, revisionId: string | null) => void;
  loopBinViewState: LoopBinViewState;
  onSaveLoopBinViewState: (next: LoopBinViewState) => void;
};

export function SectionalLooperWorkspace({
  libraryTracks, sourceTrackId, onSelectSourceTrack, resolveTrackUrl, onSaveLoop, onBeforeLoopPreview,
  onRenderLoop, getLoopRenderRecord, loops, loopAudition,
  loopWorkspaceDrafts, onSaveDraftSelection, onClearDraftSelection,
  loopRevisions, onSaveLoopRevision, onMakeActiveRevision, loopBinViewState, onSaveLoopBinViewState,
}: Props) {
  void onBeforeLoopPreview; // acquisition now happens inside loopAudition.start() via its onAcquire callback
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const decodeCtxRef = useRef<AudioContext | null>(null);
  const [decision, setDecision] = useState<Record<number, "approved" | "rejected">>({});
  const [candidateLoopIds, setCandidateLoopIds] = useState<Record<number, string>>({});
  const [rendering, setRendering] = useState<Record<number, boolean>>({});
  const [renderError, setRenderError] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<LoopPreviewMode>("hard_loop");
  // 0715F §15 — temporary, session-only grid-phase diagnostic nudge. Applied
  // ONLY to the live audition request; never written back to
  // TimelineSelection/LoopAsset/MusicalGrid.
  const [previewOffsetMs, setPreviewOffsetMs] = useState<PreviewOffsetMs>(0);
  const [manualNudge, setManualNudge] = useState<Record<number, { start: number; end: number }>>({});
  const [decodeError, setDecodeError] = useState<string | null>(null);

  // 0715G_MUSIC_Sectional_Looper_Simplification_And_Stem_Ready_Export —
  // region-first selection model. All workspace-session-local, matching
  // the existing pattern for `decision`/`selectedIndex` (never persisted to
  // PlayProject).
  const [regionState, setRegionState] = useState<Record<string, RegionUserState>>({});
  const [lengthPreference, setLengthPreference] = useState<LengthPreference>("auto");
  const [alignmentMode, setAlignmentMode] = useState<AlignmentMode>("grid");
  const [durationTarget, setDurationTarget] = useState<DurationTarget>(null);
  const [stemImportError, setStemImportError] = useState<string | null>(null);

  // 0714R §15 — selected is distinct from previewing. A playing candidate
  // auto-selects; a selected candidate may not be playing.
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // 0714R §7/§23 — full-track waveform envelope + per-candidate mini-
  // waveform peaks (derived from the SAME decoded buffer — no re-decode).
  const [waveform, setWaveform] = useState<WaveformEnvelope | null>(null);
  const [waveformError, setWaveformError] = useState<string | null>(null);
  const [candidatePeaks, setCandidatePeaks] = useState<Record<number, WaveformPeak[]>>({});

  // 0714T_MUSIC_Musical_Grid_Editor_And_Segment_Timeline — editor-surface
  // completion of 0714S's foundations. Grid revisions and segments are kept
  // per-track, session-local (not yet wired into PlayProject persistence —
  // see completion report §"Deferred"). Only the ACTIVE revision drives
  // ruler marks, segment generation, and candidate regeneration (§17/§36).
  const [zoomLevel, setZoomLevel] = useState<TimelineZoomLevel>("bars");
  const [gridRevisions, setGridRevisions] = useState<Record<string, MusicalGridRevision[]>>({});
  const [segmentsByTrack, setSegmentsByTrack] = useState<Record<string, TrackSegment[]>>({});
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [hoveredSegmentId, setHoveredSegmentId] = useState<string | null>(null);
  const [segmentBars, setSegmentBars] = useState<SupportedLoopBars>(8);
  const [originInput, setOriginInput] = useState("");
  const [segmentError, setSegmentError] = useState<string | null>(null);

  // 0715A_MUSIC_Looper_Grid_Backdrop_And_Structural_Section_Overlay — §21.
  // Recommended defaults: backdrop on, grouping 8, structure overlay on.
  const [showGridBackdrop, setShowGridBackdrop] = useState(true);
  const [showStructureOverlay, setShowStructureOverlay] = useState(true);
  const [groupingEmphasis, setGroupingEmphasis] = useState<GroupingEmphasis>(8);

  // 0715B_MUSIC_Timeline_Range_Selection_And_Compact_Loop_Workspace — §6-§16.
  // Session-local (not yet persisted to PlayProject — see completion report).
  const [timelineSelection, setTimelineSelection] = useState<TimelineSelection | null>(null);
  const [snapMode, setSnapMode] = useState<TimelineSnapMode>("bar"); // §10 default: Bar
  const [selectionApproveError, setSelectionApproveError] = useState<string | null>(null);
  // 0716A_MUSIC_Direct_Manipulation_Looper_And_Playhead — "move" (whole-
  // selection-body drag) and "playhead" (playhead drag) join the existing
  // three drag modes. `dragStartFrameRef` is repurposed per mode: for "new"
  // it's the drag anchor frame (unchanged); for "move" it's the pointer's
  // frame-offset from the selection's own start at grab time.
  const dragModeRef = useRef<"new" | "start" | "end" | "move" | "playhead" | null>(null);
  const dragStartFrameRef = useRef<number>(0);
  // Click-vs-drag disambiguation (§"Click-to-Seek"/interaction precedence):
  // a pointerdown always starts as a drag *candidate*; only real movement
  // (past a small pixel threshold) promotes it to an actual selection
  // drag. Released with no movement, it's a click-to-seek instead.
  const dragStartClientXRef = useRef(0);
  const dragMovedRef = useRef(false);
  const CLICK_DRAG_THRESHOLD_PX = 4;
  // §"Draggable Playhead" — "drag while playing -> pause -> reposition ->
  // resume after release only when prior state was playing."
  const playheadWasPlayingRef = useRef(false);
  const [playheadSeconds, setPlayheadSeconds] = useState(0);
  const [loopEnabled, setLoopEnabled] = useState(true);
  // §"Direct Region Playback" — auto-preview only ever fires as a
  // consequence of a REAL region click, never on initial page load (no
  // user gesture yet, and browsers block/ignore autoplay without one).
  const hasUserSelectedRegionRef = useRef(false);
  const lastAutoPreviewedRegionKeyRef = useRef<string | null>(null);
  // §"Clear Selection" — see the region-sync effect's own comment below.
  const selectionClearedRef = useRef(false);
  const stackRef = useRef<HTMLDivElement | null>(null);

  // 0715C_MUSIC_Loop_Workspace_Editing_And_Revision_Completion — §4-§9
  // (advanced snap modes), §13-§16 (undo/redo), §21-§25 (revisions), §27-§31
  // (Loop Bin organization), §32-§33 (final card-wall retirement).
  const [subdivisionDivision, setSubdivisionDivision] = useState<4 | 8 | 16 | 32>(16);
  const [zeroCrossingEnabled, setZeroCrossingEnabled] = useState(true);
  const [zeroCrossingFeedback, setZeroCrossingFeedback] = useState<{ offsetSeconds: number; warning?: import("../data/loopTypes").ZeroCrossingWarningCode } | null>(null);
  const effectiveSnapMode: TimelineSnapMode = snapMode === "zero_crossing" && !zeroCrossingEnabled ? "off" : snapMode;
  const [loopCardDebugView] = useState(() => loopCardDebugViewEnabled());
  const [renderingByLoopId, setRenderingByLoopId] = useState<Record<string, boolean>>({});
  // §22 — pending revision confirmation: a boundary edit on an
  // already-approved selection is held here (not yet applied to
  // timelineSelection) until the user picks Create/Update/Cancel.
  const [pendingRevision, setPendingRevision] = useState<{ next: TimelineSelection; loop: LoopAsset } | null>(null);
  const [lastRevisionCompare, setLastRevisionCompare] = useState<ReturnType<typeof buildRevisionCompareSummary> | null>(null);
  // 0715E §7 — pending "Make Active" confirmation, held only when
  // activation would actually stale an existing render.
  const [pendingActivation, setPendingActivation] = useState<{ loopId: string; revisionId: string | null } | null>(null);

  // 0715E — a Sounds-library ("reference") track is normally excluded from
  // the dropdown, but a registered stem (derivedKind === "stem" — the ONLY
  // sanctioned stem test, never parentTrackId presence) is an explicit
  // exception per §12.
  const eligibleTracks = useMemo(
    () => libraryTracks.filter((t) => !!resolveTrackUrl(t) && (t.sourceOwner !== "reference" || isStemTrack(t))),
    [libraryTracks, resolveTrackUrl],
  );
  const track = sourceTrackId ? libraryTracks.find((t) => t.trackId === sourceTrackId) : undefined;
  const sampleRate = audioBufferRef.current?.sampleRate ?? waveform?.sampleRate ?? 44100;
  const fingerprint = track ? (track.playbackBounds?.sourceFingerprint ?? track.trackId) : "";

  // §17 — only the ACTIVE grid revision (last item in this track's list,
  // or the freshly-built detected grid when no manual revision exists yet)
  // drives ruler marks, segmentation, and candidate regeneration below.
  const revisionsForTrack = track ? (gridRevisions[track.trackId] ?? []) : [];
  const activeGrid: MusicalGrid | null = useMemo(() => {
    if (!track) return null;
    const latest = revisionsForTrack[revisionsForTrack.length - 1];
    if (latest) return latest.grid;
    return buildMusicalGridFromBeatMap(track.beatMap, track.bpm, fingerprint, track.durationSeconds, sampleRate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track?.trackId, revisionsForTrack.length, sampleRate]);
  const activeGridRevisionId = revisionsForTrack[revisionsForTrack.length - 1]?.id ?? "detected";

  const segments = track ? (segmentsByTrack[track.trackId] ?? []) : [];
  // §36 — a synthetic segmentation revision id, stable for as long as this
  // exact segment array reference is the active one (regenerating or
  // editing segments always produces a NEW array, which is exactly what
  // should invalidate candidate-segment mappings computed against the old
  // one — see isMappingStale's use in candidateSegmentRelation below).
  const segmentationRevisionId = track ? `${track.trackId}_${segments.length}_${segments[0]?.updatedAt ?? "none"}` : "none";

  // 0715C §13-§16 — undo/redo history, reset whenever the source track
  // changes (§15 — "History must remain local to the current editor/source
  // context").
  const workspaceHistory = useLoopWorkspaceHistory({
    enabled: !!track,
    onApplySnapshot: (snapshot) => {
      setTimelineSelection(snapshot.timelineSelection);
      setSnapMode(snapshot.snapMode);
    },
  });
  const workspaceHistoryResetRef = useRef<string | undefined>(undefined);
  if (track && workspaceHistoryResetRef.current !== track.trackId) {
    workspaceHistoryResetRef.current = track.trackId;
    workspaceHistory.reset();
  }

  // 0715C §17-§20 — draft-selection persistence + staleness.
  const draftContext: DraftContext | null = track ? {
    sourceTrackId: track.trackId,
    sourceFingerprint: fingerprint,
    durationSeconds: track.durationSeconds,
    gridRevisionId: activeGridRevisionId,
    segmentationRevisionId,
    sampleRate,
  } : null;
  const draftPersistence = useDraftSelectionPersistence({
    drafts: loopWorkspaceDrafts,
    context: draftContext,
    onSaveDraftSelection,
    onClearDraftSelection,
    onRestore: (restored) => setTimelineSelection(restored),
  });

  // 0714T §34 — "Regenerate Candidates" from the active grid revision.
  // Implemented via generateLoopCandidates' OWN existing, deliberately-
  // exposed `trackBpm` fallback parameter (never a change to that
  // protected function) — passing the active grid's corrected BPM re-runs
  // the exact same untouched candidate-generation logic against corrected
  // timing. Approved LoopAsset records are never touched by this (see
  // approveCandidate/persisted `loops` — only the CANDIDATE list changes).
  const candidates = useMemo<LoopCandidate[]>(() => {
    if (!track) return [];
    return generateLoopCandidates(track.beatMap, track.playbackBounds, track.durationSeconds, activeGrid?.bpm ?? track.bpm);
  }, [track, activeGrid?.bpm]);

  const sections = useMemo(() => groupCandidatesBySection(candidates), [candidates]);

  const timelineTransform = useMemo(
    () => (track ? createTimelineTransform(0, track.durationSeconds * sampleRate, 1000, sampleRate) : null),
    [track?.trackId, track?.durationSeconds, sampleRate],
  );

  // 0715A §6/§11 — pure DERIVED display data from the SAME grid/segments
  // already computed above; never a second timing authority.
  const gridBackdropLevels = useMemo(
    () => (activeGrid && activeGrid.barFrames.length > 1 ? buildGridBackdropBands(activeGrid.barFrames) : null),
    [activeGrid],
  );
  const structuralSections = useMemo(() => {
    if (!track) return [];
    const boundsStartFrame = track.playbackBounds?.preferredStartSeconds != null
      ? Math.round(track.playbackBounds.preferredStartSeconds * sampleRate) : undefined;
    const boundsEndFrame = track.playbackBounds?.preferredEndSeconds != null
      ? Math.round(track.playbackBounds.preferredEndSeconds * sampleRate) : undefined;
    return deriveStructuralSections(segments, boundsStartFrame, boundsEndFrame, 0, Math.round(track.durationSeconds * sampleRate));
  }, [track, segments, sampleRate]);

  // 0715G §2/§3 — region-first selection model. `regionState` is
  // workspace-session-local, matching the existing `decision`/`selectedIndex`
  // pattern (never persisted to PlayProject).
  //
  // `structuralSections`'s own band.id (structuralSections.ts's genId) is
  // salted with Date.now()/Math.random() — a fresh, non-deterministic id
  // every time this memo recomputes (which happens every render whenever
  // this track has no canonical segments yet, since `segments` falls back
  // to a new `[]` literal each render). Keying regionState/activeRegionId/
  // TimelineSelection.regionId off that raw id meant they could never
  // match themselves across renders — caught live as an infinite
  // "Maximum update depth exceeded" loop. Re-key every band by its
  // label+bounds instead, which IS stable across renders for the same
  // underlying data.
  const structuralSectionsKey = structuralSections.map((b) => `${b.label}_${b.startFrame}_${b.endFrame}`).join("|");
  const stableStructuralSections = useMemo(
    () => structuralSections.map((b) => ({ ...b, id: `${b.label}_${b.startFrame}_${b.endFrame}` })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [structuralSectionsKey],
  );
  const regionEligibilityResult = useMemo<RegionEligibility[]>(
    () => evaluateRegionEligibility(stableStructuralSections),
    [stableStructuralSections],
  );
  const activeRegionId = useMemo(() => {
    const selected = Object.keys(regionState).find((id) => regionState[id] === "selected");
    if (selected) return selected;
    return recommendDefaultBand(stableStructuralSections)?.id;
  }, [regionState, stableStructuralSections]);
  const activeRegion = useMemo(
    () => stableStructuralSections.find((s) => s.id === activeRegionId),
    [stableStructuralSections, activeRegionId],
  );
  const recommendation = useMemo<AutoRecommendationResult | null>(() => {
    if (!track || !activeRegion) return null;
    return recommendForRegion({
      regionStartSeconds: activeRegion.startFrame / sampleRate,
      regionEndSeconds: activeRegion.endFrame / sampleRate,
      sourceDurationSeconds: track.durationSeconds,
      beatMap: track.beatMap,
      playbackBounds: track.playbackBounds,
      trackBpm: activeGrid?.bpm ?? track.bpm,
      tempoStabilityScore: track.beatMap?.tempoStabilityScore,
      lengthPreference,
      durationTargetSeconds: durationTarget ?? undefined,
    });
    // `activeRegion` is a fresh object every render whenever this track has
    // no canonical segments yet (`segments` falls back to a new `[]`
    // literal, which un-memoizes `structuralSections` upstream) — depend on
    // its primitive identity/bounds instead of the object reference itself,
    // or this memo (and the sync effect below, which DOES call setState)
    // recomputes/fires on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track, activeRegion?.id, activeRegion?.startFrame, activeRegion?.endFrame, sampleRate, activeGrid?.bpm, lengthPreference, durationTarget]);

  // Keeps `timelineSelection` in sync with the active region's recommended
  // candidate — but ONLY while the selection is still region-driven
  // (`source: "region"`). The moment the user drags a boundary or the
  // waveform themselves, `moveSelectionBoundary`/the drag handlers set a
  // different `source` and this effect stops touching the selection,
  // matching the spec's "dragging converts to Custom Selection" rule.
  //
  // Depends on PRIMITIVES derived from activeRegion/recommendation, never
  // the objects themselves — see the note on the recommendation memo above;
  // an object-reference dependency here would re-run this effect (and its
  // setTimelineSelection call, which produces a genuinely new object every
  // time via createSelection's timestamp) on every single render, an
  // infinite update loop caught live during verification.
  const recommendedWinnerKey = recommendation?.winner
    ? `${recommendation.winner.startSeconds}_${recommendation.winner.endSeconds}` : "none";
  useEffect(() => {
    if (!track || !activeRegion) return;
    // 0716A §"Clear Selection" — "remove the active range" must actually
    // stick. Without this guard, clearSelection() sets timelineSelection
    // to null, but activeRegion (still "selected" in regionState) survives
    // it, so this effect's own `prev == null` case would immediately
    // recreate the exact same region selection on the very next render —
    // a real, live-caught defect (Clear appeared to do nothing at all).
    // Reset by onSelectRegion, so any fresh region click un-clears normally.
    if (selectionClearedRef.current) return;
    setTimelineSelection((prev) => {
      if (prev && prev.source !== "region") return prev;
      const winner = recommendation?.winner;
      const startSeconds = winner ? winner.startSeconds : activeRegion.startFrame / sampleRate;
      const endSeconds = winner ? winner.endSeconds : activeRegion.endFrame / sampleRate;
      const sourceFrameCount = Math.round(track.durationSeconds * sampleRate);
      const next = createSelection(
        track.trackId,
        Math.round(startSeconds * sampleRate),
        Math.round(endSeconds * sampleRate),
        sourceFrameCount,
        sampleRate,
        "region",
        snapMode,
        activeGrid,
        { regionId: activeRegion.id },
      );
      if (!next) return prev;
      if (prev && prev.source === "region" && prev.startFrame === next.startFrame && prev.endFrame === next.endFrame
        && prev.regionId === next.regionId && prev.snapMode === next.snapMode) return prev;
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track?.trackId, activeRegion?.id, activeRegion?.startFrame, activeRegion?.endFrame, recommendedWinnerKey, sampleRate, snapMode, activeGrid?.trust, activeGrid?.bpm]);

  function onSelectRegion(band: StructuralSectionBand) {
    hasUserSelectedRegionRef.current = true;
    selectionClearedRef.current = false;
    setRegionState((prev) => {
      const next: Record<string, RegionUserState> = { ...prev };
      for (const id of Object.keys(next)) {
        if (next[id] === "selected") next[id] = "heard";
      }
      next[band.id] = "selected";
      return next;
    });
  }

  // 0716A_MUSIC_Direct_Manipulation_Looper_And_Playhead §"Region Click =
  // Select and Preview" — clicking a region must select AND begin preview
  // immediately. This watches for `timelineSelection` settling onto a NEW
  // region-sourced target (the sync effect above may take a render or two
  // to get there) and starts audition then, reusing the existing
  // `previewSelection`/`loopAudition.start` — never a new playback path.
  // Switching regions stops/restarts safely because `loopAudition.start`
  // already tears down any prior session before starting the next one.
  // Gated on `hasUserSelectedRegionRef` so the INITIAL auto-selected region
  // (on page load, before any click) never autoplays without a user
  // gesture.
  useEffect(() => {
    if (!track || !timelineSelection || timelineSelection.source !== "region") return;
    if (!hasUserSelectedRegionRef.current) return;
    const key = `${timelineSelection.regionId}_${timelineSelection.startFrame}_${timelineSelection.endFrame}`;
    if (lastAutoPreviewedRegionKeyRef.current === key) return;
    lastAutoPreviewedRegionKeyRef.current = key;
    void previewSelection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track?.trackId, timelineSelection]);

  function onMarkHeard() {
    if (!activeRegionId) return;
    setRegionState((prev) => ({ ...prev, [activeRegionId]: prev[activeRegionId] === "selected" ? prev[activeRegionId] : "heard" }));
  }

  function onRejectRegion() {
    if (!activeRegionId) return;
    setRegionState((prev) => ({ ...prev, [activeRegionId]: "rejected" }));
  }

  function pushGridRevision(nextGrid: MusicalGrid, reason: MusicalGridRevision["reason"]) {
    if (!track) return;
    const revision: MusicalGridRevision = {
      id: genRevisionId(), grid: nextGrid, revisionOf: activeGridRevisionId, reason, createdAt: new Date().toISOString(),
    };
    setGridRevisions((prev) => ({ ...prev, [track.trackId]: [...(prev[track.trackId] ?? []), revision] }));
  }

  function handleSetOrigin() {
    if (!track || !activeGrid) return;
    const seconds = Number(originInput);
    if (!Number.isFinite(seconds) || seconds < 0) { setSegmentError("Origin must be a non-negative number of seconds."); return; }
    setSegmentError(null);
    pushGridRevision(setManualOrigin(activeGrid, seconds, track.durationSeconds, sampleRate), "manual_origin");
  }
  function handleNudge(deltaSeconds: number) {
    if (!track || !activeGrid) return;
    pushGridRevision(nudgeGridOrigin(activeGrid, deltaSeconds, track.durationSeconds, sampleRate), "manual_nudge");
  }
  function handleHalfBpm() {
    if (!track || !activeGrid) return;
    pushGridRevision(halfBpm(activeGrid, track.durationSeconds, sampleRate), "half_bpm");
  }
  function handleDoubleBpm() {
    if (!track || !activeGrid) return;
    pushGridRevision(doubleBpm(activeGrid, track.durationSeconds, sampleRate), "double_bpm");
  }
  function handleResetGrid() {
    if (!track) return;
    const reset = resetToDetectedGrid(track.beatMap, track.bpm, fingerprint, track.durationSeconds, sampleRate);
    if (reset) pushGridRevision(reset, "reset_detected");
  }

  function handleGenerateEqualSegments() {
    if (!track || !activeGrid) return;
    const windowStart = track.playbackBounds?.preferredStartSeconds ?? 0;
    const windowEnd = track.playbackBounds?.preferredEndSeconds ?? track.durationSeconds;
    const next = generateEqualSegments(track.trackId, windowStart, windowEnd, activeGrid.bpm, segmentBars, sampleRate)
      .map((s) => ({ ...s, gridRevisionId: activeGridRevisionId }));
    setSegmentsByTrack((prev) => ({ ...prev, [track.trackId]: next }));
    setSelectedSegmentId(null);
    setSegmentError(null);
  }
  function handleSplitAtPlayhead() {
    if (!track || !selectedSegmentId) { setSegmentError("Select a segment first."); return; }
    const relFrame = auditionIsThisTrack && loopAudition.session
      ? Math.round(loopAudition.session.currentAbsoluteSeconds * sampleRate)
      : null;
    if (relFrame == null) { setSegmentError("Start a preview to position the playhead before splitting."); return; }
    const result = splitSegmentAtFrame(segments, selectedSegmentId, relFrame, sampleRate);
    if (!result.ok) { setSegmentError(result.error ?? "Split failed."); return; }
    setSegmentsByTrack((prev) => ({ ...prev, [track.trackId]: result.segments }));
    setSegmentError(null);
  }
  function handleMerge(direction: "previous" | "next") {
    if (!track || !selectedSegmentId) return;
    const idx = segments.findIndex((s) => s.id === selectedSegmentId);
    if (idx < 0) return;
    const otherIdx = direction === "previous" ? idx - 1 : idx + 1;
    const other = segments[otherIdx];
    if (!other) { setSegmentError(`No ${direction} segment to merge with.`); return; }
    const result = mergeAdjacentSegments(segments, selectedSegmentId, other.id);
    if (!result.ok) { setSegmentError(result.error ?? "Merge failed."); return; }
    setSegmentsByTrack((prev) => ({ ...prev, [track.trackId]: result.segments }));
    setSelectedSegmentId(null);
    setSegmentError(null);
  }
  function handleMoveBoundary(direction: "start" | "end", newSeconds: number) {
    if (!track || !selectedSegmentId) return;
    const idx = segments.findIndex((s) => s.id === selectedSegmentId);
    if (idx < 0) return;
    const neighbor = direction === "start" ? segments[idx - 1] : segments[idx + 1];
    if (!neighbor) { setSegmentError("No neighboring segment on that side."); return; }
    const [leftId, rightId] = direction === "start" ? [neighbor.id, selectedSegmentId] : [selectedSegmentId, neighbor.id];
    const result = moveSharedBoundary(segments, leftId, rightId, Math.round(newSeconds * sampleRate), sampleRate);
    if (!result.ok) { setSegmentError(result.error ?? "Boundary move failed."); return; }
    setSegmentsByTrack((prev) => ({ ...prev, [track.trackId]: result.segments }));
    setSegmentError(null);
  }

  // §29/§30/§31 — candidate-to-segment relation, recomputed against the
  // CURRENT segments array every render (cheap: pure classification).
  function candidateSegmentRelation(index: number, c: LoopCandidate): { label: string; stale: boolean } {
    if (segments.length === 0 || !track) return { label: "no segments yet", stale: false };
    const { start, end } = boundsFor(index, c);
    const mapping = mapCandidateToSegments(
      { candidateId: String(index), startFrame: Math.round(start * sampleRate), endFrame: Math.round(end * sampleRate) },
      segments, activeGridRevisionId, segmentationRevisionId,
    );
    const stale = segments.some((s) => s.gridRevisionId && s.gridRevisionId !== activeGridRevisionId);
    if (mapping.relation === "contained") {
      const seg = segments.find((s) => s.id === mapping.segmentIds[0]);
      return { label: `In Segment ${(seg?.order ?? 0) + 1}`, stale };
    }
    if (mapping.relation === "spans_segments") {
      const orders = mapping.segmentIds.map((id) => (segments.find((s) => s.id === id)?.order ?? 0) + 1);
      return { label: `Spans ${orders.join(", ")}`, stale };
    }
    return { label: "Unmapped", stale };
  }

  // 0714S — is the lifted controller's active session THIS track's, and if
  // so which local candidate index does its candidateId correspond to?
  const auditionIsThisTrack = !!track && loopAudition.session?.sourceTrackId === track.trackId;
  const auditionIndex = useMemo(() => {
    if (!auditionIsThisTrack || !loopAudition.session || !track) return null;
    const idx = candidates.findIndex((c) => candidateAuditionId(track.trackId, c) === loopAudition.session!.candidateId);
    return idx >= 0 ? idx : null;
  }, [auditionIsThisTrack, loopAudition.session, candidates, track]);

  function boundsFor(index: number, c: LoopCandidate) {
    const nudge = manualNudge[index];
    return nudge ?? { start: c.startSeconds, end: c.endSeconds };
  }

  // 0714R §16 — seed approved/rejected from persisted loops for this track
  // so the badge survives switching away and back (or a reload), matching
  // each candidate by its (start, end) window rather than a stored index.
  useEffect(() => {
    if (!track) { setDecision({}); setCandidateLoopIds({}); return; }
    const forTrack = loops.filter((l) => l.sourceTrackId === track.trackId && l.sourceKind === "track");
    const nextDecision: Record<number, "approved" | "rejected"> = {};
    const nextIds: Record<number, string> = {};
    candidates.forEach((c, i) => {
      const match = forTrack.find(
        (l) => Math.abs(l.startSeconds - c.startSeconds) < 0.06 && Math.abs(l.endSeconds - c.endSeconds) < 0.06,
      );
      if (match && match.status === "approved") {
        nextDecision[i] = "approved";
        nextIds[i] = match.id;
      } else if (match && match.status === "rejected") {
        nextDecision[i] = "rejected";
      }
    });
    setDecision(nextDecision);
    setCandidateLoopIds(nextIds);
    setSelectedIndex(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track?.trackId, candidates.length]);

  // 0714R §7 — decode once per source, generate the full-track envelope
  // once (cache-keyed by source fingerprint + generator version + bin
  // count, §23), and clear per-candidate mini-waveform peaks for the new
  // source so stale peaks from a previous track are never shown.
  useEffect(() => {
    let cancelled = false;
    setWaveform(null);
    setWaveformError(null);
    setCandidatePeaks({});
    audioBufferRef.current = null;
    if (!track) return;

    const fingerprint = track.playbackBounds?.sourceFingerprint ?? track.trackId;
    const cacheKey = buildWaveformCacheKey(fingerprint, WAVEFORM_GENERATOR_VERSION, FULL_TRACK_BIN_COUNT);
    const cached = getCachedWaveform(cacheKey);
    if (cached && !isWaveformEnvelopeStale(cached, fingerprint, track.durationSeconds)) {
      setWaveform(cached);
    }

    (async () => {
      const buffer = await ensureDecodedBuffer();
      if (cancelled || !buffer) {
        if (!cancelled && !buffer) setWaveformError("could not decode source audio");
        return;
      }
      if (!cached || isWaveformEnvelopeStale(cached, fingerprint, track.durationSeconds)) {
        const envelope = generateWaveformEnvelope(buffer, track.trackId, fingerprint, FULL_TRACK_BIN_COUNT);
        setCachedWaveform(cacheKey, envelope);
        if (!cancelled) setWaveform(envelope);
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track?.trackId]);

  // 0714R §10 — lazily compute each candidate's own mini-waveform peaks
  // from the already-decoded source buffer once it's available. No re-
  // decode; a plain slice-and-reduce over the same AudioBuffer.
  useEffect(() => {
    const buffer = audioBufferRef.current;
    if (!buffer || candidates.length === 0) return;
    setCandidatePeaks((prev) => {
      const next = { ...prev };
      let changed = false;
      candidates.forEach((c, i) => {
        if (next[i]) return;
        const { start, end } = boundsFor(i, c);
        next[i] = computePeaksForRange(buffer, start, end, CANDIDATE_BIN_COUNT);
        changed = true;
      });
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waveform, candidates]);

  async function ensureDecodedBuffer(): Promise<AudioBuffer | null> {
    if (!track) return null;
    if (audioBufferRef.current) return audioBufferRef.current;
    const url = resolveTrackUrl(track);
    if (!url) return null;
    try {
      const ctx = decodeCtxRef.current ?? new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      decodeCtxRef.current = ctx;
      const resp = await fetch(url);
      const arrayBuf = await resp.arrayBuffer();
      const buffer = await ctx.decodeAudioData(arrayBuf);
      audioBufferRef.current = buffer;
      return buffer;
    } catch {
      setDecodeError("Could not decode source audio for seamlessness scoring.");
      return null;
    }
  }

  // 0714S §5-§9 — starts (or restarts) loop audition for candidate `index`
  // via the lifted, navigation-safe controller. Builds the FULL candidate
  // list for this track so Previous/Next in the bottom player can cycle
  // through them without this page needing to stay mounted.
  async function startPreview(index: number) {
    if (!track) return;
    const url = resolveTrackUrl(track);
    if (!url) return;
    setSelectedIndex(index); // 0714R §15 — a playing candidate auto-selects
    const refs: LoopAuditionCandidateRef[] = candidates.map((c, i) => {
      const { start, end } = boundsFor(i, c);
      return {
        candidateId: candidateAuditionId(track.trackId, c),
        startSeconds: start, endSeconds: end,
        startFrame: Math.round(start * sampleRate), endFrame: Math.round(end * sampleRate),
        sectionLabel: c.sectionLabel, label: c.label,
      };
    });
    await loopAudition.start({
      sourceTrackId: track.trackId, sourceTitle: track.title, sourceUrl: url,
      sourceId: track.trackId, sourceKind: isStemTrack(track) ? "stem" : "track",
      candidates: refs, startIndex: index, previewMode,
      decodedBuffer: audioBufferRef.current ?? undefined,
    });
  }

  async function approveCandidate(index: number, c: LoopCandidate) {
    if (!track) return;
    const { start, end } = boundsFor(index, c);
    const buffer = await ensureDecodedBuffer();
    const gridAlignment = c.gridTrusted ? 1 : 0.2;
    const tempoStability = track.beatMap?.tempoStabilityScore ?? (c.gridTrusted ? 0.8 : 0.3);
    const evidence = buffer
      ? computeLoopSeamlessnessEvidenceFromBuffer(buffer, start, end, gridAlignment, tempoStability)
      : { waveformMatch: 0.5, rmsMatch: 0.5, spectralMatch: 0.5, zeroCrossingFit: 0.5, gridAlignment, tempoStability, boundaryTransientPenalty: 0.3 };
    const result = scoreLoopSeamlessness(evidence, end - start, track.beatMap?.tempoStable ?? c.gridTrusted);

    const now = new Date().toISOString();
    const loop: LoopAsset = {
      id: genLoopId(),
      // 0715E §12/§18 — derivedKind, not parentTrackId presence, decides stem-ness.
      sourceKind: isStemTrack(track) ? "stem" : "track",
      sourceTrackId: track.trackId,
      sourceStemId: isStemTrack(track) ? track.trackId : undefined,
      title: buildLoopFileName({
        artist: track.artist, trackTitle: track.title, sectionLabel: c.sectionLabel,
        barCount: c.barCount, bpm: c.bpm ?? track.bpm,
      }).replace(/\.wav$/, ""),
      sourceTitle: track.title,
      sourceArtist: track.artist,
      sourceFingerprint: track.playbackBounds?.sourceFingerprint,
      sourceBeatMapDetectorVersion: track.beatMap?.detectorVersion,
      sourcePlaybackBoundsDetectorVersion: track.playbackBounds?.detectorVersion,
      startSeconds: start,
      endSeconds: end,
      durationSeconds: end - start,
      beatCount: c.beatCount,
      barCount: c.barCount,
      bpm: c.bpm ?? track.bpm,
      key: track.camelotKey,
      boundarySource: manualNudge[index] ? "manual" : c.boundarySource,
      contentClass: "unknown",
      // §18 — approval/lineage must retain generation provenance.
      generationMode: manualNudge[index] ? "manual_only" : c.generationMode,
      provisional: c.provisional,
      sectionLabel: c.sectionLabel,
      length: c.length,
      seamlessnessScore: result.score,
      confidence: result.confidence,
      status: "approved",
      warnings: result.warnings,
      createdAt: now,
      updatedAt: now,
    };
    onSaveLoop(loop);
    setDecision((d) => ({ ...d, [index]: "approved" }));
    setCandidateLoopIds((m) => ({ ...m, [index]: loop.id }));
  }

  function rejectCandidate(index: number) {
    setDecision((d) => ({ ...d, [index]: "rejected" }));
    if (auditionIndex === index) loopAudition.stop();
  }

  // 0715C §21-§25 — the loop this selection currently points at, and where
  // its ACTIVE revision's frames live (falling back to the LoopAsset's own
  // seconds when it has never been revisioned).
  function findLoopById(id: string | undefined): LoopAsset | undefined {
    return id ? loops.find((l) => l.id === id) : undefined;
  }
  function activeBoundsForLoop(loop: LoopAsset): { startFrame: number; endFrame: number } {
    return resolveActiveLoopBoundsFrames(loop, loopRevisions, sampleRate);
  }

  // §13-§16, §22 — the single choke point every boundary-move/numeric-edit/
  // keyboard-edit commit passes through: if the selection points at an
  // approved loop whose ACTIVE bounds differ from the new ones, this is an
  // edit-of-an-approved-loop and must go through the revision-confirm
  // dialog rather than silently applying (§21). Otherwise it's a plain
  // undoable edit + draft save.
  function commitSelectionChange(
    before: { timelineSelection: TimelineSelection | null; snapMode: TimelineSnapMode },
    next: TimelineSelection,
    historyType: "selection_create" | "selection_clear" | "boundary_move",
  ) {
    // 0715F §11 — a boundary edit while previewing must stop audition and
    // require an explicit new Preview, never mutate a running node's loop
    // points. This is the single choke point every boundary-move/numeric-
    // edit/keyboard-edit commit passes through.
    if (shouldStopAuditionForBoundaryEdit(loopAudition.session, next.sourceTrackId)) {
      loopAudition.stop();
    }
    const currentLoop = findLoopById(next.loopId);
    if (currentLoop) {
      const active = activeBoundsForLoop(currentLoop);
      if (active.startFrame !== next.startFrame || active.endFrame !== next.endFrame) {
        setPendingRevision({ next, loop: currentLoop });
        return;
      }
    }
    workspaceHistory.record(historyType, before, { timelineSelection: next, snapMode: next.snapMode });
    setTimelineSelection(next);
    draftPersistence.saveDraft(next);
  }

  // §22-§24 — user picked Create New Revision / Update Existing for a
  // pending edit of an approved loop's boundaries.
  function commitPendingRevision(mode: "create" | "update") {
    if (!pendingRevision) return;
    const { next, loop } = pendingRevision;
    const priorActive = activeBoundsForLoop(loop);
    const priorRevision = loop.activeRevisionId ? loopRevisions.find((r) => r.id === loop.activeRevisionId) : undefined;
    const bounds = { startFrame: next.startFrame, endFrame: next.endFrame };
    const revision: LoopRevision = mode === "update" && priorRevision
      ? updateExistingRevision(loop, priorRevision, bounds, {
          createdBy: "manual_edit", gridRevisionId: activeGridRevisionId, segmentationRevisionId,
        })
      : createRevision(loop, bounds, {
          parentRevisionId: priorRevision?.id, createdBy: "manual_edit",
          gridRevisionId: activeGridRevisionId, segmentationRevisionId,
        });
    onSaveLoopRevision(revision);
    workspaceHistory.record(
      mode === "create" ? "revision_create" : "revision_update",
      { timelineSelection, snapMode },
      { timelineSelection: next, snapMode: next.snapMode },
    );
    const barFrameLength = activeGrid && activeGrid.barFrames.length > 1 ? activeGrid.barFrames[1] - activeGrid.barFrames[0] : undefined;
    setLastRevisionCompare(buildRevisionCompareSummary(priorActive, bounds, sampleRate, barFrameLength));
    setTimelineSelection(next);
    setPendingRevision(null);
    draftPersistence.saveDraft(next);
  }

  // 0715B §8/§9 — direct click-drag range selection on the waveform, plus
  // handle-drag boundary editing. Pointer position -> frame uses the SAME
  // duration-based x=(seconds/duration)*width mapping the waveform overview
  // and 0715A backdrop already share (no independent coordinate system).
  function frameFromClientX(clientX: number): number {
    const el = stackRef.current;
    if (!el || !track) return 0;
    const rect = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.round(ratio * track.durationSeconds * sampleRate);
  }

  // Captured at drag START, not read back from `timelineSelection` at drag
  // END — by pointerup, `timelineSelection` has already been live-updated
  // many times for visual feedback, so it is NOT a usable "before" snapshot
  // for undo (see the completion plan's undo/redo design notes).
  const dragBeforeSnapshotRef = useRef<{ timelineSelection: TimelineSelection | null; snapMode: TimelineSnapMode } | null>(null);

  // §"Movable Selection Body" — clamp movement to audible-content bounds
  // when the track has detected/trusted bounds; otherwise fall back to the
  // full source range (moveSelection's own default).
  function audibleClampBoundsFrames(t: Track, sr: number): { minFrame: number; maxFrame: number } | undefined {
    const b = t.playbackBounds;
    if (!b || b.audibleStartSeconds == null || b.audibleEndSeconds == null) return undefined;
    return { minFrame: Math.round(b.audibleStartSeconds * sr), maxFrame: Math.round(b.audibleEndSeconds * sr) };
  }

  // 0716A §"Click-to-Seek" — a plain click (no real drag) inside the
  // waveform repositions the playhead without ever touching
  // `timelineSelection`. Only when the position falls inside the ACTIVE
  // selection AND a session for this track already exists does it also
  // reach into the engine: seekRelative while actually playing (live
  // re-position), or the new seekPausedTo while paused (silent reposition
  // of the frozen resume point) — never seekRelative while paused, which
  // would unexpectedly make paused audio audible again.
  function seekToSeconds(seconds: number) {
    if (!track) return;
    const clamped = Math.max(0, Math.min(track.durationSeconds, seconds));
    setPlayheadSeconds(clamped);
    if (!auditionIsThisTrack || !loopAudition.session || !timelineSelection) return;
    if (clamped < timelineSelection.startSeconds || clamped > timelineSelection.endSeconds) return;
    if (loopAudition.session.status === "playing") {
      loopAudition.seekRelative(clamped - timelineSelection.startSeconds);
    } else if (loopAudition.session.status === "paused") {
      loopAudition.seekPausedTo(clamped);
    }
  }

  function handleStackPointerDown(e: React.PointerEvent) {
    if (!track) return;
    const frame = frameFromClientX(e.clientX);
    dragStartClientXRef.current = e.clientX;
    dragMovedRef.current = false;
    // §"Interaction Precedence" — pointerdown INSIDE the current selection
    // (handles already stopPropagation before reaching here) starts a
    // whole-body MOVE-drag *candidate*; outside it starts a NEW-selection-
    // drag candidate. Both are promoted to a real drag only once real
    // movement occurs (see onMove) — released with no movement, either
    // becomes a click-to-seek instead (§"Click-to-Seek").
    if (timelineSelection && frame >= timelineSelection.startFrame && frame <= timelineSelection.endFrame) {
      dragModeRef.current = "move";
      dragStartFrameRef.current = frame - timelineSelection.startFrame; // grab offset within the selection
    } else {
      dragModeRef.current = "new";
      dragStartFrameRef.current = frame;
    }
    dragBeforeSnapshotRef.current = { timelineSelection, snapMode };
    keyboard.setFocusTarget("selection");
  }

  function handleHandlePointerDown(which: "start" | "end", e: React.PointerEvent) {
    e.stopPropagation();
    dragModeRef.current = which;
    dragBeforeSnapshotRef.current = { timelineSelection, snapMode };
    keyboard.setFocusTarget(which === "start" ? "start_boundary" : "end_boundary");
  }

  // §"Draggable Playhead" — "drag while playing -> pause -> reposition ->
  // resume after release only when prior state was playing." Never invents
  // pseudo-scrubbing: while paused (or idle), dragging only ever updates
  // the visual position — nothing becomes audible until the caller's own
  // explicit resume()/Play.
  function handlePlayheadPointerDown(e: React.PointerEvent) {
    e.stopPropagation();
    dragModeRef.current = "playhead";
    dragStartClientXRef.current = e.clientX;
    dragMovedRef.current = false;
    playheadWasPlayingRef.current = auditionIsThisTrack && loopAudition.session?.status === "playing";
    if (playheadWasPlayingRef.current) loopAudition.pause();
    keyboard.setFocusTarget("selection");
  }

  useEffect(() => {
    function onMove(e: PointerEvent) {
      // Captured into a local const: TypeScript (correctly) won't narrow a
      // mutable ref's `.current` across separate `if` checks the way it
      // narrows a plain local variable.
      const mode = dragModeRef.current;
      if (!mode || !track) return;
      if (Math.abs(e.clientX - dragStartClientXRef.current) > CLICK_DRAG_THRESHOLD_PX) dragMovedRef.current = true;
      const rawFrame = frameFromClientX(e.clientX);
      const sourceFrames = Math.round(track.durationSeconds * sampleRate);

      if (mode === "playhead") {
        setPlayheadSeconds(Math.max(0, Math.min(track.durationSeconds, rawFrame / sampleRate)));
        return;
      }

      // §5, §7 live feedback: subdivision snapping is cheap (grid-only) and
      // applied live; zero-crossing's windowed sample scan is NOT run per
      // move (audio=null here) — only at commit, in onUp below.
      const snappedFrame = applySnapWithAudio(rawFrame, effectiveSnapMode, activeGrid, null, subdivisionDivision);
      if (mode === "new") {
        if (!dragMovedRef.current) return; // still just a click candidate — no visual change yet
        const snappedStart = applySnapWithAudio(dragStartFrameRef.current, effectiveSnapMode, activeGrid, null, subdivisionDivision);
        const next = createSelection(track.trackId, snappedStart, snappedFrame, sourceFrames, sampleRate, "drag", effectiveSnapMode, null);
        if (next) setTimelineSelection(next); // live visual feedback only; committed in onUp
      } else if (mode === "move") {
        if (!timelineSelection || !dragMovedRef.current) return;
        const targetStart = snappedFrame - dragStartFrameRef.current;
        const delta = targetStart - timelineSelection.startFrame;
        const clampBounds = audibleClampBoundsFrames(track, sampleRate);
        const next = moveSelection(timelineSelection, delta, sourceFrames, sampleRate, effectiveSnapMode, activeGrid, clampBounds);
        if (next) setTimelineSelection(next); // live visual feedback only; committed in onUp
      } else if (timelineSelection) {
        const next = moveSelectionBoundary(timelineSelection, mode, snappedFrame, sourceFrames, sampleRate, effectiveSnapMode, null);
        if (next) setTimelineSelection(next); // live visual feedback only; committed in onUp
      }
    }
    function onUp(e: PointerEvent) {
      const mode = dragModeRef.current;
      dragModeRef.current = null;
      if (!mode || !track) return;

      if (mode === "playhead") {
        if (playheadWasPlayingRef.current) {
          loopAudition.seekPausedTo(playheadSeconds);
          void loopAudition.resume();
        }
        playheadWasPlayingRef.current = false;
        return;
      }

      if (!dragMovedRef.current) {
        // a plain click, never a drag — seek instead of committing a
        // near-zero "new"/"move" selection (§"Click-to-Seek").
        seekToSeconds(frameFromClientX(e.clientX) / sampleRate);
        return;
      }

      if (!timelineSelection) return;
      const sourceFrames = Math.round(track.durationSeconds * sampleRate);
      let finalSelection = timelineSelection;
      // §7 — the real windowed zero-crossing search runs exactly once, at
      // commit, never per drag-move. A whole-body move re-snaps as a unit
      // in moveSelection itself (never per-edge), so it's excluded here.
      if (effectiveSnapMode === "zero_crossing" && audioBufferRef.current && mode !== "move") {
        const channelData = channelDataFor(audioBufferRef.current);
        let feedback: { offsetSeconds: number; warning?: import("../data/loopTypes").ZeroCrossingWarningCode } | null = null;
        if (mode === "new" || mode === "start") {
          const result = findZeroCrossing(finalSelection.startFrame, channelData, sampleRate);
          const snapped = moveSelectionBoundary(finalSelection, "start", result.frame, sourceFrames, sampleRate, "off", null);
          if (snapped) finalSelection = snapped;
          feedback = { offsetSeconds: result.offsetSeconds, warning: result.warning };
        }
        if (mode === "new" || mode === "end") {
          const result = findZeroCrossing(finalSelection.endFrame, channelData, sampleRate);
          const snapped = moveSelectionBoundary(finalSelection, "end", result.frame, sourceFrames, sampleRate, "off", null);
          if (snapped) finalSelection = snapped;
          feedback = { offsetSeconds: result.offsetSeconds, warning: result.warning };
        }
        if (feedback) setZeroCrossingFeedback(feedback);
      }
      const before = dragBeforeSnapshotRef.current ?? { timelineSelection: null, snapMode };
      commitSelectionChange(before, finalSelection, mode === "new" ? "selection_create" : "boundary_move");
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track?.trackId, sampleRate, effectiveSnapMode, activeGrid, timelineSelection, subdivisionDivision, playheadSeconds, loopAudition]);

  // §14/§15 — numeric boundary edit commit (validate -> convert to frame ->
  // snap -> update selection -> waveform highlight updates via re-render).
  // Numeric input stays uncontrolled/exact-as-typed (never re-snapped) —
  // an intentional 0715B behavior this build preserves.
  function commitNumericBoundary(which: "start" | "end", seconds: number) {
    if (!track || !timelineSelection || !Number.isFinite(seconds) || seconds < 0) {
      setSelectionApproveError("Invalid boundary value.");
      return;
    }
    const frame = Math.round(seconds * sampleRate);
    const sourceFrames = Math.round(track.durationSeconds * sampleRate);
    const next = moveSelectionBoundary(timelineSelection, which, frame, sourceFrames, sampleRate, "off", activeGrid);
    if (!next) { setSelectionApproveError("That boundary would invert the selection."); return; }
    setSelectionApproveError(null);
    commitSelectionChange({ timelineSelection, snapMode }, next, "boundary_move");
  }

  // 0715C §11 — keyboard boundary editing. `computeKeyboardMove` (pure,
  // unit-tested) only decides "how far, which direction"; subdivision/
  // zero-crossing precision settling happens here (a single keypress is
  // NOT the "per drag-move" case the performance constraint is about).
  const keyboard = useLoopWorkspaceKeyboard({
    enabled: !!track,
    hasSelection: !!timelineSelection,
    startFrame: timelineSelection?.startFrame ?? null,
    endFrame: timelineSelection?.endFrame ?? null,
    snapMode: effectiveSnapMode,
    grid: activeGrid,
    sampleRate,
    sourceFrameCount: track ? Math.round(track.durationSeconds * sampleRate) : 0,
    onMoveBoundary: (which, rawNextFrame) => {
      if (!track || !timelineSelection) return;
      const sourceFrames = Math.round(track.durationSeconds * sampleRate);
      const audio = audioBufferRef.current && (effectiveSnapMode === "zero_crossing")
        ? { channelData: channelDataFor(audioBufferRef.current), sampleRate } : null;
      const settledFrame = applySnapWithAudio(rawNextFrame, effectiveSnapMode, activeGrid, audio, subdivisionDivision);
      const next = moveSelectionBoundary(timelineSelection, which, settledFrame, sourceFrames, sampleRate, "off", null);
      if (!next) { setSelectionApproveError("That boundary would invert the selection."); return; }
      if (effectiveSnapMode === "zero_crossing" && audio) {
        const result = findZeroCrossing(settledFrame, audio.channelData, sampleRate);
        setZeroCrossingFeedback({ offsetSeconds: result.offsetSeconds, warning: result.warning });
      }
      setSelectionApproveError(null);
      commitSelectionChange({ timelineSelection, snapMode }, next, "boundary_move");
    },
    onBlocked: () => setSelectionApproveError("Boundary movement blocked at this edge."),
    onTogglePreview: () => {
      if (loopAudition.session?.status === "playing") loopAudition.pause();
      else if (loopAudition.session?.status === "paused") void loopAudition.resume();
      else void previewSelection();
    },
    onApprove: () => {
      if (timelineSelection && !timelineSelection.loopId) void approveSelection();
    },
    onEscape: () => clearSelection(),
  });

  async function previewSelection(offsetMsOverride?: PreviewOffsetMs) {
    if (!track || !timelineSelection) return;
    const url = resolveTrackUrl(track);
    if (!url) return;
    // 0715F §15 — the temporary grid-phase nudge shifts only THIS live
    // preview request; the underlying TimelineSelection is untouched.
    const offsetMs = offsetMsOverride ?? previewOffsetMs;
    const { startFrame, endFrame } = offsetMs !== 0
      ? applyPreviewOffsetFrames(timelineSelection.startFrame, timelineSelection.endFrame, offsetMs, sampleRate)
      : { startFrame: timelineSelection.startFrame, endFrame: timelineSelection.endFrame };
    const ref: LoopAuditionCandidateRef = {
      candidateId: `selection_${timelineSelection.startFrame}_${timelineSelection.endFrame}_${offsetMs}`,
      startSeconds: startFrame / sampleRate, endSeconds: endFrame / sampleRate,
      startFrame, endFrame,
      sectionLabel: "Manual Selection", label: `Manual Selection · ${timelineSelection.durationSeconds.toFixed(2)}s`,
    };
    await loopAudition.start({
      sourceTrackId: track.trackId, sourceTitle: track.title, sourceUrl: url,
      sourceId: track.trackId, sourceKind: isStemTrack(track) ? "stem" : "track",
      candidates: [ref], startIndex: 0, previewMode,
      decodedBuffer: audioBufferRef.current ?? undefined,
    });
  }

  // 0715B §29 — Approve Selection as Loop. Does NOT require the selection
  // to have originated from a generated candidate (manual/drag/segment/
  // numeric sources all approve through this same path).
  async function approveSelection(): Promise<string | undefined> {
    if (!track || !timelineSelection) return undefined;
    const { startSeconds: start, endSeconds: end } = timelineSelection;
    const buffer = await ensureDecodedBuffer();
    const overlappingSegment = segments.find((s) => timelineSelection.startFrame < s.endFrame && timelineSelection.endFrame > s.startFrame);
    const gridAlignment = timelineSelection.snapMode === "bar" || timelineSelection.snapMode === "beat" ? 0.8 : 0.3;
    const tempoStability = track.beatMap?.tempoStabilityScore ?? 0.5;
    const evidence = buffer
      ? computeLoopSeamlessnessEvidenceFromBuffer(buffer, start, end, gridAlignment, tempoStability)
      : { waveformMatch: 0.5, rmsMatch: 0.5, spectralMatch: 0.5, zeroCrossingFit: 0.5, gridAlignment, tempoStability, boundaryTransientPenalty: 0.3 };
    const result = scoreLoopSeamlessness(evidence, end - start, track.beatMap?.tempoStable ?? false);

    const now = new Date().toISOString();
    const sectionLabel = overlappingSegment?.displayLabel ?? overlappingSegment?.label ?? "Manual";
    const loop: LoopAsset = {
      id: genLoopId(),
      sourceKind: isStemTrack(track) ? "stem" : "track",
      sourceTrackId: track.trackId,
      sourceStemId: isStemTrack(track) ? track.trackId : undefined,
      title: buildLoopFileName({
        artist: track.artist, trackTitle: track.title, sectionLabel,
        barCount: undefined, bpm: activeGrid?.bpm ?? track.bpm,
      }).replace(/\.wav$/, ""),
      sourceTitle: track.title,
      sourceArtist: track.artist,
      sourceFingerprint: track.playbackBounds?.sourceFingerprint,
      sourceBeatMapDetectorVersion: track.beatMap?.detectorVersion,
      sourcePlaybackBoundsDetectorVersion: track.playbackBounds?.detectorVersion,
      startSeconds: start, endSeconds: end, durationSeconds: end - start,
      bpm: activeGrid?.bpm ?? track.bpm,
      key: track.camelotKey,
      boundarySource: "manual",
      contentClass: "unknown",
      generationMode: "manual_only",
      provisional: timelineSelection.snapMode === "off",
      sectionLabel,
      seamlessnessScore: result.score,
      confidence: result.confidence,
      status: "approved",
      warnings: result.warnings,
      createdAt: now, updatedAt: now,
    };
    onSaveLoop(loop);
    // §14 — "approve" is deliberately NOT pushed onto the undo stack (see
    // commitSelectionChange's doc comment / the completion plan's
    // "Undo/redo scope" decision): it writes a brand-new persisted
    // LoopAsset, an external side effect this component doesn't own the
    // clean reverse of.
    const approved: TimelineSelection = { ...timelineSelection, loopId: loop.id, updatedAt: now };
    setTimelineSelection(approved);
    draftPersistence.saveDraft(approved);
    return loop.id;
  }

  function clearSelection() {
    const before = { timelineSelection, snapMode };
    selectionClearedRef.current = true;
    setTimelineSelection(null);
    setSelectionApproveError(null);
    setPendingRevision(null);
    setLastRevisionCompare(null);
    if (loopAudition.session?.candidateId?.startsWith("selection_")) loopAudition.stop();
    if (timelineSelection) {
      workspaceHistory.record("selection_clear", before, { timelineSelection: null, snapMode });
    }
    draftPersistence.clearDraft();
    setPreviewOffsetMs(0);
  }

  async function renderCandidate(index: number) {
    const loopId = candidateLoopIds[index];
    if (!loopId) return;
    setRendering((r) => ({ ...r, [index]: true }));
    setRenderError(null);
    const result = await onRenderLoop(loopId, { gridRevisionId: activeGridRevisionId, segmentationRevisionId });
    setRendering((r) => ({ ...r, [index]: false }));
    if (!result.ok) setRenderError(result.error ?? "Render failed");
  }

  // 0715C §26/§31 — Loop Bin row actions that operate directly on a loopId
  // (an Approved/Stale row has no "candidate index" to key off of the way
  // renderCandidate above does).
  function loadLoopIntoSelection(loopId: string) {
    const loop = findLoopById(loopId);
    if (!track || !loop) return;
    const bounds = activeBoundsForLoop(loop);
    const sourceFrames = Math.round(track.durationSeconds * sampleRate);
    const sel = createSelection(
      track.trackId, bounds.startFrame, bounds.endFrame, sourceFrames, sampleRate, "approved_loop", "off", activeGrid, { loopId },
    );
    if (sel) { setTimelineSelection(sel); draftPersistence.saveDraft(sel); }
  }

  // 0715E_MUSIC_Loop_Revision_Activation_And_Stem_Source_Entry §5-§9 —
  // resolves a specific revision target's frame bounds (revisionId: null
  // means the implicit original), reusing resolveActiveLoopBoundsFrames via
  // a synthetic override loop rather than a bespoke lookup, so a missing/
  // stale revisionId falls back exactly the way the render/staleness paths
  // already do.
  function boundsForRevisionTarget(loop: LoopAsset, revisionId: string | null): { startFrame: number; endFrame: number } {
    return resolveActiveLoopBoundsFrames({ ...loop, activeRevisionId: revisionId ?? undefined }, loopRevisions, sampleRate);
  }

  function selectionFromBounds(loopId: string, bounds: { startFrame: number; endFrame: number }) {
    if (!track) return;
    const sourceFrames = Math.round(track.durationSeconds * sampleRate);
    const sel = createSelection(
      track.trackId, bounds.startFrame, bounds.endFrame, sourceFrames, sampleRate, "approved_loop", "off", activeGrid, { loopId },
    );
    if (sel) { setTimelineSelection(sel); draftPersistence.saveDraft(sel); }
  }

  // §8 — "Open": a non-destructive preview of a past revision's bounds into
  // the live selection. Never touches activeRevisionId.
  function openRevisionIntoSelection(loopId: string, revisionId: string | null) {
    const loop = findLoopById(loopId);
    if (!loop) return;
    selectionFromBounds(loopId, boundsForRevisionTarget(loop, revisionId));
  }

  // §8 — before/after comparison of a candidate revision against the
  // loop's CURRENTLY active revision (not necessarily the one shown in the
  // Selection Inspector's live timelineSelection).
  function compareRevisionToActive(loopId: string, revisionId: string | null) {
    const loop = findLoopById(loopId);
    if (!loop) return;
    const activeBounds = activeBoundsForLoop(loop);
    const targetBounds = boundsForRevisionTarget(loop, revisionId);
    const barFrameLength = activeGrid && activeGrid.barFrames.length > 1 ? activeGrid.barFrames[1] - activeGrid.barFrames[0] : undefined;
    setLastRevisionCompare(buildRevisionCompareSummary(activeBounds, targetBounds, sampleRate, barFrameLength));
  }

  // §9 — commits the activation, then, ONLY if this loop is the
  // currently-loaded selection, rebinds the live selection from the
  // EXPLICIT target-revision data computed here — never by re-reading
  // `loop`/`loopRevisions` after the fact and assuming they already reflect
  // the just-dispatched change. `onMakeActiveRevision` only queues a state
  // update in the parent (App.tsx); a synchronous re-read of `loops` in
  // this same tick would still see the OLD activeRevisionId, so this must
  // not depend on that re-render having happened.
  function commitMakeActiveRevision(loopId: string, revisionId: string | null) {
    onMakeActiveRevision(loopId, revisionId);
    if (timelineSelection?.loopId !== loopId) return;
    const loop = findLoopById(loopId);
    if (!loop) return;
    selectionFromBounds(loopId, boundsForRevisionTarget(loop, revisionId));
  }

  // §7 — only interrupt the user with a confirmation when activation would
  // actually make an existing rendered render stale.
  function requestMakeActiveRevision(loopId: string, revisionId: string | null) {
    const render = getLoopRenderRecord(loopId);
    if (wouldActivationStaleRender(render, revisionId)) {
      setPendingActivation({ loopId, revisionId });
    } else {
      commitMakeActiveRevision(loopId, revisionId);
    }
  }

  async function previewLoopById(loopId: string) {
    const loop = findLoopById(loopId);
    if (!track || !loop) return;
    const url = resolveTrackUrl(track);
    if (!url) return;
    const bounds = activeBoundsForLoop(loop);
    const ref: LoopAuditionCandidateRef = {
      candidateId: `selection_${bounds.startFrame}_${bounds.endFrame}`,
      startSeconds: bounds.startFrame / sampleRate, endSeconds: bounds.endFrame / sampleRate,
      startFrame: bounds.startFrame, endFrame: bounds.endFrame,
      sectionLabel: loop.sectionLabel ?? "Approved Loop", label: loop.title,
    };
    await loopAudition.start({
      sourceTrackId: track.trackId, sourceTitle: track.title, sourceUrl: url,
      sourceId: track.trackId, sourceKind: isStemTrack(track) ? "stem" : "track",
      candidates: [ref], startIndex: 0, previewMode,
      decodedBuffer: audioBufferRef.current ?? undefined,
    });
  }

  async function renderLoopById(loopId: string) {
    setRenderingByLoopId((r) => ({ ...r, [loopId]: true }));
    setRenderError(null);
    const result = await onRenderLoop(loopId, { gridRevisionId: activeGridRevisionId, segmentationRevisionId });
    setRenderingByLoopId((r) => ({ ...r, [loopId]: false }));
    if (!result.ok) setRenderError(result.error ?? "Render failed");
  }

  // §31 — Archive is a plain, one-way status change on the LoopAsset;
  // deliberately not run through the undo stack (see commitSelectionChange
  // doc comment) — it's reversible through the LoopAsset's own status field
  // rather than an ephemeral history entry.
  function archiveLoop(loopId: string) {
    const loop = findLoopById(loopId);
    if (!loop) return;
    onSaveLoop({ ...loop, status: "archived", updatedAt: new Date().toISOString() });
  }

  // Opens the revise flow directly (independent of dragging a boundary):
  // loads the loop's current bounds into the live selection so any
  // subsequent boundary edit already carries loopId and therefore already
  // routes through commitSelectionChange's revision-confirm check above.
  function reviseLoop(loopId: string) {
    loadLoopIntoSelection(loopId);
  }

  function copyRenderedPath(loopId: string) {
    const render = getLoopRenderRecord(loopId);
    const path = render?.filename ?? render?.outputPath;
    if (!path) return;
    // Browser-only build: no OS filesystem access, so "Show in Finder" is
    // not implemented (disclosed, not faked) — copy-to-clipboard is the
    // honest substitute, same posture as 0714O's own download-only render
    // path.
    void navigator.clipboard?.writeText(path);
  }

  function candidateVisualState(index: number): CandidateVisualState {
    if (auditionIndex === index && loopAudition.session?.status === "playing") return "previewing";
    if (decision[index] === "approved") return "approved";
    if (decision[index] === "rejected") return "rejected";
    if (selectedIndex === index) return "selected";
    if (hoveredIndex === index) return "hovered";
    return "idle";
  }

  function selectCandidate(index: number) {
    setSelectedIndex(index);
    const el = document.getElementById(`looper-card-${index}`);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    el?.focus({ preventScroll: true });
  }

  const mainPreviewStatus: MainActionPreviewStatus = (() => {
    if (!loopAudition.session?.candidateId?.startsWith("selection_")) return "idle";
    const status = loopAudition.session?.status ?? "idle";
    return status === "stopped" ? "idle" : status;
  })();

  // 0716A_MUSIC_Direct_Manipulation_Looper_And_Playhead §"Loop On/Off" —
  // implemented WITHOUT touching the engine's hardcoded `node.loop = true`
  // (see useLoopAuditionController.ts's startSourceNode — that stays
  // exactly as-is). Loop On is exactly today's behavior. Loop Off plays
  // the selection once and auto-stops right at the natural wrap point, by
  // watching the already-exposed `loopIteration` counter (incremented by
  // the engine's own existing wrap detection) and calling the existing,
  // unchanged `stop()` — zero engine surgery.
  //
  // IMPORTANT: this and the two playhead effects below must stay ABOVE the
  // `if (!track) return (...)` early return a few lines down — hooks placed
  // after a conditional return run a DIFFERENT number of times depending on
  // whether a track is open, which is exactly React's "rendered fewer hooks
  // than expected" crash (live-caught: it crashed the very first time this
  // build's own Play button was clicked, since these were originally placed
  // after that early return).
  useEffect(() => {
    if (loopEnabled) return;
    if (mainPreviewStatus !== "playing") return;
    if (loopAudition.loopIteration >= 1) loopAudition.stop();
  }, [loopAudition, loopAudition.loopIteration, loopEnabled, mainPreviewStatus]);

  // §"Persistent Playhead" — mirrors the engine's OWN sample-accurate
  // clock (never a second timing authority) while OUR OWN selection
  // preview is playing/paused; freezes at its last value once stopped
  // (still "persistent" — it doesn't vanish the way the old in-waveform
  // playhead line used to the instant status left "playing"). Resets only
  // when the open track itself changes.
  useEffect(() => {
    if (mainPreviewStatus !== "playing" && mainPreviewStatus !== "paused") return;
    if (loopAudition.session?.currentAbsoluteSeconds == null) return;
    setPlayheadSeconds(loopAudition.session.currentAbsoluteSeconds);
  }, [mainPreviewStatus, loopAudition.session?.currentAbsoluteSeconds]);
  useEffect(() => { setPlayheadSeconds(0); }, [track?.trackId]);

  if (!track) {
    return (
      <div className="looper-root">
        <h2 className="looper-title">Sectional Looper</h2>
        <p className="looper-hint">Select an eligible local track to divide it into candidate loops.</p>
        <select
          className="looper-track-select"
          value=""
          onChange={(e) => onSelectSourceTrack(e.target.value || null)}
        >
          <option value="">Select a track…</option>
          {eligibleTracks.map((t) => (
            <option key={t.trackId} value={t.trackId}>{t.artist} — {t.title}</option>
          ))}
        </select>
        {eligibleTracks.length === 0 && (
          <p className="looper-empty-reason">No eligible local playable tracks found — streaming-only, missing, or unlinked sources cannot be opened here.</p>
        )}
      </div>
    );
  }

  // 0715G §Alignment Control — collapses Grid|Beat|Free onto the existing
  // 5-way snapMode exactly as SnapModeToolbar's own mapping already does
  // (bar/beat/off); zero-crossing safety stays an always-on internal
  // commit-time refinement, never a 4th visible button here.
  function onChangeAlignment(mode: AlignmentMode) {
    setAlignmentMode(mode);
    setSnapMode(mode === "grid" ? "bar" : mode === "beat" ? "beat" : "off");
  }

  // §"Default Layout" — single Play/Pause toggle over the existing preview
  // states, composed from the EXISTING previewSelection/pause/resume calls
  // — never a new playback path. If the stored playhead falls inside the
  // freshly-started selection, jumps to it immediately after start
  // (§"Click-to-Seek": "next Play begins there"). If it falls outside the
  // active selection, this engine has no defined "play from outside the
  // loop" mode, so playback simply starts from the selection's own start
  // — a disclosed simplification, not a silent guess.
  async function onPlayPause() {
    if (!track || !timelineSelection) return;
    if (mainPreviewStatus === "playing") { loopAudition.pause(); return; }
    if (mainPreviewStatus === "paused") { await loopAudition.resume(); return; }
    await previewSelection();
    if (playheadSeconds > timelineSelection.startSeconds && playheadSeconds <= timelineSelection.endSeconds) {
      loopAudition.seekRelative(playheadSeconds - timelineSelection.startSeconds);
    }
  }

  // 0715G §Main Action Area, required correction — "Export Loop" must never
  // silently mutate an already-approved loop's bounds or discard its
  // revision lineage. When the active selection already IS an approved
  // LoopAsset and its bounds have since changed, this routes through the
  // EXISTING commitSelectionChange -> pendingRevision -> RevisionConfirmDialog
  // path (unchanged) rather than rendering directly. A never-approved
  // selection collapses approve+render into one click.
  async function exportActiveSelection() {
    if (!track || !timelineSelection) return;
    if (!timelineSelection.loopId) {
      const loopId = await approveSelection();
      if (loopId) await renderLoopById(loopId);
      return;
    }
    const currentLoop = findLoopById(timelineSelection.loopId);
    if (currentLoop) {
      const active = activeBoundsForLoop(currentLoop);
      if (active.startFrame !== timelineSelection.startFrame || active.endFrame !== timelineSelection.endFrame) {
        commitSelectionChange({ timelineSelection, snapMode }, timelineSelection, "boundary_move");
        return;
      }
    }
    await renderLoopById(timelineSelection.loopId);
  }

  function stemContentClass(role: string): LoopContentClass {
    if (role === "drums") return "drums";
    if (role === "bass") return "bass";
    if (role === "vocals") return "vocal";
    return "mixed";
  }

  // 0715G §5 — required correction: validate stem alignment BEFORE
  // rendering anything, and never reuse one raw frame number across stems
  // decoded at different sample rates. Every stem's own render goes through
  // the SAME existing per-track onRenderLoop pipeline (App.tsx's
  // handleRenderLoop), which already recomputes frames from the loop's
  // seconds using THAT stem's own decoded sample rate — so feeding every
  // stem LoopAsset the SAME startSeconds/endSeconds is exactly correct.
  async function createStemLoops() {
    if (!track || !timelineSelection || isStemTrack(track)) return;
    const stems = libraryTracks.filter((t) => t.derivedKind === "stem" && t.parentTrackId === track.trackId);
    if (stems.length === 0) return;
    setStemImportError(null);
    const ctx = decodeCtxRef.current
      ?? new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    decodeCtxRef.current = ctx;
    const stemBuffers: { track: Track; buffer: AudioBuffer }[] = [];
    for (const stem of stems) {
      const url = resolveTrackUrl(stem);
      if (!url) { setStemImportError(`Could not resolve audio for ${stem.title}.`); return; }
      try {
        const resp = await fetch(url);
        const arrayBuf = await resp.arrayBuffer();
        const buffer = await ctx.decodeAudioData(arrayBuf);
        stemBuffers.push({ track: stem, buffer });
      } catch {
        setStemImportError(`Could not decode ${stem.title}.`);
        return;
      }
    }
    const alignment = validateStemAlignment(
      track.trackId, track.durationSeconds,
      stemBuffers.map(({ track: s, buffer }) => ({
        trackId: s.trackId, parentTrackId: s.parentTrackId, sampleRate: buffer.sampleRate, durationSeconds: buffer.duration,
      })),
    );
    if (!alignment.ok) {
      setStemImportError(`Stem alignment failed: ${alignment.errors.map((e) => (
        e.kind === "wrong_parent"
          ? `${e.trackId} is not registered as a stem of this track`
          : `${e.trackId} duration ${e.actualSeconds.toFixed(2)}s does not match parent ${e.expectedSeconds.toFixed(2)}s`
      )).join("; ")}`);
      return;
    }
    const { startSeconds: start, endSeconds: end } = timelineSelection;
    const now = new Date().toISOString();
    for (const { track: stem } of stemBuffers) {
      const role = stem.stemRole ?? "other";
      const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);
      const loop: LoopAsset = {
        id: genLoopId(),
        sourceKind: "stem",
        sourceTrackId: stem.trackId,
        sourceStemId: stem.trackId,
        title: `${roleLabel} Loop`,
        sourceTitle: stem.title,
        sourceArtist: stem.artist,
        sourceFingerprint: track.playbackBounds?.sourceFingerprint,
        sourceBeatMapDetectorVersion: track.beatMap?.detectorVersion,
        sourcePlaybackBoundsDetectorVersion: track.playbackBounds?.detectorVersion,
        startSeconds: start, endSeconds: end, durationSeconds: end - start,
        bpm: activeGrid?.bpm ?? track.bpm,
        key: track.camelotKey,
        boundarySource: "manual",
        contentClass: stemContentClass(role),
        generationMode: "manual_only",
        provisional: timelineSelection.snapMode === "off",
        sectionLabel: "Stem Loop",
        status: "approved",
        warnings: [],
        createdAt: now, updatedAt: now,
      };
      onSaveLoop(loop);
      await renderLoopById(loop.id);
    }
  }

  const registeredStems = track && !isStemTrack(track)
    ? libraryTracks.filter((t) => t.derivedKind === "stem" && t.parentTrackId === track.trackId)
    : [];
  // 0715G §5, required correction — never "Create Stems"/"Create full stems
  // first"; this build only ever IMPORTS already-separated files a user
  // already has (see TrackInspector's "Import Existing Stems" action).
  const stemAction = track && !isStemTrack(track) ? {
    label: "Create Stem Loops",
    disabled: registeredStems.length === 0 || !timelineSelection,
    hint: registeredStems.length === 0
      ? "No stems registered. Run Demucs externally, then import its drums, bass, vocals, and other files."
      : undefined,
    onClick: () => void createStemLoops(),
  } : null;

  // 0716A — derived once here so both the always-visible action row and
  // the Advanced drawer's diagnostic fields can read the same values
  // without duplicating the lookups (previously an inline IIFE local only
  // to the old, now-removed, single big Selection Inspector block).
  const selectionLoop = timelineSelection ? findLoopById(timelineSelection.loopId) : undefined;
  const selectionActiveRevision = selectionLoop?.activeRevisionId
    ? loopRevisions.find((r) => r.id === selectionLoop.activeRevisionId) : undefined;
  const selectionRender = selectionLoop ? getLoopRenderRecord(selectionLoop.id) : undefined;
  const selectionRevisionTimeline = selectionLoop ? buildRevisionTimeline(selectionLoop, loopRevisions, sampleRate) : [];
  const overlappingSegment = timelineSelection ? segments.find(
    (s) => timelineSelection!.startFrame < s.endFrame && timelineSelection!.endFrame > s.startFrame,
  ) : undefined;

  return (
    <div className="looper-root">
      <div className="looper-header">
        <button className="looper-back" onClick={() => onSelectSourceTrack(null)}>← Change track</button>
        <h2 className="looper-title">{track.title}</h2>
        <div className="looper-header-meta">
          <span>{track.artist}</span>
          <span>{fmtTime(track.durationSeconds)}</span>
          {track.bpm && <span>{track.bpm.toFixed(2)} BPM</span>}
          {track.camelotKey && <span>{track.camelotKey}</span>}
          <span className={track.beatMap ? "looper-trust-ok" : "looper-trust-low"}>
            Beat grid: {track.beatMap ? `${Math.round((track.beatMap.confidence ?? 0) * 100)}%` : "none"}
          </span>
          <span className={track.playbackBounds ? "looper-trust-ok" : "looper-trust-low"}>
            Bounds: {track.playbackBounds ? `${Math.round((track.playbackBounds.overallConfidence ?? 0) * 100)}%` : "none"}
          </span>
        </div>
        <SourceLineageSummary track={track} libraryTracks={libraryTracks} />
      </div>

      {decodeError && <div className="looper-warning">{decodeError}</div>}

      {/* 0714R §8 — full-track waveform overview, replacing the plain
          flex-block timeline strip with a real waveform + overlays.
          0715A — GridBackdropLayer renders BEHIND it as an absolutely-
          positioned, pointer-events:none underlay sharing the exact same
          x = (seconds/duration) * width mapping (§19), so bar lines,
          grouping bands, and structural sections stay pixel-aligned with
          the waveform/candidates rendered on top. */}
      <div className="looper-waveform-stack" ref={stackRef} onPointerDown={handleStackPointerDown}>
        {track && (
          <GridBackdropLayer
            durationSeconds={track.durationSeconds}
            sampleRate={sampleRate}
            backdropLevels={gridBackdropLevels}
            groupingEmphasis={groupingEmphasis}
            structuralSections={structuralSections}
            showBackdrop={showGridBackdrop}
            showStructure={showStructureOverlay}
          />
        )}
        <TrackWaveformOverview
          waveform={waveform}
          waveformError={waveformError}
          sections={sections.map((s) => ({ label: s.label, start: s.start, end: s.end }))}
          candidates={candidates}
          candidateState={candidateVisualState}
          onCandidateSelect={selectCandidate}
          onCandidateHover={setHoveredIndex}
        />
        {/* 0715B §8/§9 — direct click-drag range selection, layered above
            the waveform/candidates so handles remain grabbable.
            0716A — the fill rect also becomes a whole-body drag hit target
            (cursor:grab); the actual mode decision happens via natural
            bubbling to the stack's own onPointerDown (handleStackPointerDown
            already checks whether the pointerdown fell inside the current
            selection), so this callback only needs to exist to enable the
            body-hit rect's rendering/cursor styling. */}
        {track && (
          <TimelineSelectionOverlay
            durationSeconds={track.durationSeconds}
            sampleRate={sampleRate}
            selection={timelineSelection}
            onHandleDown={handleHandlePointerDown}
            onBodyDown={() => {}}
          />
        )}
        {/* 0716A §"Persistent Playhead" — painted AFTER the selection
            overlay (later in DOM order) so it always paints on top,
            unlike the old in-waveform playhead line that used to be
            visually covered by the selection fill. */}
        {track && (
          <PlayheadMarker
            durationSeconds={track.durationSeconds}
            seconds={playheadSeconds}
            onPointerDown={handlePlayheadPointerDown}
          />
        )}
      </div>

      {/* 0715G §2/§3 — region-first default flow: choose a natural region,
          hear the one recommendation, adjust length/alignment/duration
          target. This is the entire "default view" the spec asks for; the
          old candidate table lives on read-only inside Advanced Candidates
          below. */}
      <RegionStrip
        bands={stableStructuralSections}
        eligibility={regionEligibilityResult}
        regionState={regionState}
        activeRegionId={activeRegionId}
        onSelectRegion={onSelectRegion}
      />
      {activeRegion && (
        <p className="looper-recommendation-line" aria-live="polite">
          {recommendation?.winner
            ? `Recommended: ${recommendation.winner.barCount ? `${recommendation.winner.barCount} bars` : `${recommendation.winner.durationSeconds.toFixed(1)} sec`}`
            : "No recommendation available for this region/length/duration target."}
        </p>
      )}
      <div className="looper-region-controls-row">
        <LengthControl value={lengthPreference} availableLengths={recommendation?.availableLengths ?? { 4: false, 8: false, 16: false, 32: false, 64: false }} onChange={setLengthPreference} />
        <AlignmentControl value={alignmentMode} onChange={onChangeAlignment} />
        <DurationTargetControl value={durationTarget} onChange={setDurationTarget} />
      </div>

      {draftPersistence.staleDraft && <DraftRestoreBanner onClear={draftPersistence.clearDraft} />}
      {pendingRevision && (
        <RevisionConfirmDialog
          loopTitle={pendingRevision.loop.title}
          onCreateNewRevision={() => commitPendingRevision("create")}
          onUpdateExisting={() => commitPendingRevision("update")}
          onCancel={() => setPendingRevision(null)}
        />
      )}
      {lastRevisionCompare && <RevisionCompareSummary summary={lastRevisionCompare} />}
      {pendingActivation && (
        <ActivateRevisionConfirm
          onConfirm={() => { commitMakeActiveRevision(pendingActivation.loopId, pendingActivation.revisionId); setPendingActivation(null); }}
          onCancel={() => setPendingActivation(null)}
        />
      )}

      {/* 0716A_MUSIC_Direct_Manipulation_Looper_And_Playhead §"Default
          Layout" — the ONE always-visible action row: Play/Pause | Loop
          On/Off | Export WAV | Clear. Everything the old Selection
          Inspector also showed (raw Start/End fields, Snap/Source/Segment/
          Grid Trust/Grid Phase/Render/Warnings, RevisionList) moved into
          the Advanced drawer below, unchanged internally — see the
          matching block inside AdvancedDrawer. */}
      {timelineSelection && track && (
        <div
          className="looper-selection-actions-row" role="region" aria-label="Loop selection actions"
          onFocus={() => keyboard.setFocusTarget("inspector")}
        >
          <DurationDisplay
            durationSeconds={timelineSelection.durationSeconds}
            bars={activeGrid?.bpm ? timelineSelection.durationSeconds / (60 / activeGrid.bpm * activeGrid.meterNumerator) : undefined}
          />
          {selectionApproveError && <div className="looper-preview-error" role="alert">{selectionApproveError}</div>}
          {stemImportError && <div className="looper-preview-error" role="alert">{stemImportError}</div>}
          <MainActionBar
            previewStatus={mainPreviewStatus}
            onPlayPause={() => void onPlayPause()}
            loopEnabled={loopEnabled}
            onToggleLoop={() => setLoopEnabled((v) => !v)}
            onExport={() => void exportActiveSelection()}
            exportDisabled={selectionLoop ? !!renderingByLoopId[selectionLoop.id] : false}
            onClear={clearSelection}
          />
        </div>
      )}

      {/* 0716A_MUSIC_Direct_Manipulation_Looper_And_Playhead — ONE
          collapsed Advanced drawer nesting every diagnostic/secondary
          control demoted out of the default direct-manipulation view:
          boundary-audition mode, grid-phase nudge, Zoom/Backdrop/Grouping/
          Structure + the musical ruler, the raw selection-detail fields
          and revision list the old Selection Inspector used to show
          inline, Undo/Redo, Mark Heard/Reject/Create Stem Loops, the grid-
          status and segment panels (+ SegmentTimeline), and — nested one
          level deeper, completely unchanged — the existing 0715G
          AdvancedCandidatesPanel and Loop Bin. Never required for
          selection, preview, movement, or export. */}
      <AdvancedDrawer>
        <div className="looper-preview-mode">
          <span>Boundary audition:</span>
          <button className={previewMode === "hard_loop" ? "active" : ""} onClick={() => setPreviewMode("hard_loop")}>Hard Loop</button>
          <button className={previewMode === "boundary_fade" ? "active" : ""} onClick={() => setPreviewMode("boundary_fade")}>Boundary Fade</button>
        </div>

        <div className="looper-grid-phase-nudge">
          <span>Grid-phase nudge (diagnostic only):</span>
          {PREVIEW_OFFSET_MS_STEPS.map((ms) => (
            <button
              key={ms}
              className={previewOffsetMs === ms ? "active" : ""}
              onClick={() => {
                setPreviewOffsetMs(ms);
                if (loopAudition.session?.status === "playing" || loopAudition.session?.status === "paused") {
                  loopAudition.stop();
                  void previewSelection(ms);
                }
              }}
            >
              {ms > 0 ? `+${ms}` : ms}ms
            </button>
          ))}
        </div>

        <div className="looper-zoom-row">
          <span>Zoom:</span>
          {(["overview", "bars", "beats", "subdivisions", "fine"] as TimelineZoomLevel[]).map((z) => (
            <button key={z} className={zoomLevel === z ? "active" : ""} onClick={() => setZoomLevel(z)}>{z}</button>
          ))}
          <span className="looper-backdrop-controls-sep" />
          <label className="looper-backdrop-toggle">
            <input type="checkbox" checked={showGridBackdrop} onChange={(e) => setShowGridBackdrop(e.target.checked)} />
            Grid Backdrop
          </label>
          <span>Grouping:</span>
          {([4, 8, 16] as GroupingEmphasis[]).map((g) => (
            <button key={g} className={groupingEmphasis === g ? "active" : ""} onClick={() => setGroupingEmphasis(g)}>{g}</button>
          ))}
          <label className="looper-backdrop-toggle">
            <input type="checkbox" checked={showStructureOverlay} onChange={(e) => setShowStructureOverlay(e.target.checked)} />
            Structure Overlay
          </label>
        </div>
        {timelineTransform && (
          <MusicalRuler grid={activeGrid} sampleRate={sampleRate} zoomLevel={zoomLevel} transform={timelineTransform} />
        )}

        {timelineSelection && track && (
          <div className="looper-selection-inspector" role="region" aria-label="Selection detail">
            <div className="looper-selection-summary" aria-live="polite">
              Selected range: {timelineSelection.startSeconds.toFixed(3)} to {timelineSelection.endSeconds.toFixed(3)} seconds
              {activeGrid?.bpm ? `, ${(timelineSelection.durationSeconds / (60 / activeGrid.bpm * 4)).toFixed(2)} bars` : ""}
              , {timelineSelection.snapMode} grid · Source: {timelineSelection.source}
            </div>
            <div className="looper-selection-fields">
              <label>Start
                <input type="number" step={0.001} key={`start-${timelineSelection.startFrame}`} defaultValue={timelineSelection.startSeconds.toFixed(3)}
                  onFocus={() => keyboard.setFocusTarget("start_boundary")}
                  onBlur={(e) => commitNumericBoundary("start", Number(e.target.value))} />
              </label>
              <label>End
                <input type="number" step={0.001} key={`end-${timelineSelection.endFrame}`} defaultValue={timelineSelection.endSeconds.toFixed(3)}
                  onFocus={() => keyboard.setFocusTarget("end_boundary")}
                  onBlur={(e) => commitNumericBoundary("end", Number(e.target.value))} />
              </label>
              <label>Snap
                <input type="text" readOnly value={timelineSelection.snapMode} />
              </label>
              <label>Source
                <input type="text" readOnly value={timelineSelection.source} />
              </label>
              <label>Segment
                <input type="text" readOnly value={overlappingSegment ? (overlappingSegment.displayLabel ?? overlappingSegment.label) : "none"} />
              </label>
              <label>Grid Trust
                <input type="text" readOnly value={activeGrid ? activeGrid.trust : "no grid"} />
              </label>
              <label>Grid Phase
                <input type="text" readOnly value={(() => {
                  const cmp = compareToGrid(timelineSelection.startFrame, activeGrid ?? undefined);
                  if (!cmp.gridAvailable) return "no grid";
                  return `${cmp.offsetFromGridFrames} frames from nearest grid line`;
                })()} />
              </label>
              <label>Render
                <input type="text" readOnly value={selectionRender ? (isRenderStale(selectionRender, {
                  currentSourceFingerprint: track.playbackBounds?.sourceFingerprint,
                  currentStartSeconds: selectionActiveRevision ? selectionActiveRevision.startFrame / sampleRate : (selectionLoop?.startSeconds ?? timelineSelection.startSeconds),
                  currentEndSeconds: selectionActiveRevision ? selectionActiveRevision.endFrame / sampleRate : (selectionLoop?.endSeconds ?? timelineSelection.endSeconds),
                  currentSettings: selectionRender.settings,
                  currentRevisionId: selectionLoop?.activeRevisionId,
                  currentGridRevisionId: activeGridRevisionId,
                  currentSegmentationRevisionId: segmentationRevisionId,
                }) ? "stale" : selectionRender.status) : "not rendered"} />
              </label>
              <label>Warnings
                <input type="text" readOnly value={selectionLoop?.warnings?.length ? selectionLoop.warnings.join(", ") : "none"} />
              </label>
            </div>
            {selectionLoop && (
              <RevisionList
                timeline={selectionRevisionTimeline}
                rendering={!!renderingByLoopId[selectionLoop.id]}
                onMakeActive={(revisionId) => requestMakeActiveRevision(selectionLoop.id, revisionId)}
                onOpen={(revisionId) => openRevisionIntoSelection(selectionLoop.id, revisionId)}
                onRender={() => void renderLoopById(selectionLoop.id)}
                onCompare={(revisionId) => compareRevisionToActive(selectionLoop.id, revisionId)}
              />
            )}
            <div className="looper-advanced-actions-row">
              <button onClick={onMarkHeard}>Mark Heard</button>
              <button onClick={onRejectRegion}>Reject</button>
              {stemAction && (
                <button disabled={stemAction.disabled} onClick={stemAction.onClick} title={stemAction.hint}>
                  {stemAction.label}
                </button>
              )}
            </div>
          </div>
        )}

        <UndoRedoControls
          canUndo={workspaceHistory.canUndo}
          canRedo={workspaceHistory.canRedo}
          lastUndoType={workspaceHistory.lastUndoType}
          nextRedoType={workspaceHistory.nextRedoType}
          onUndo={workspaceHistory.undo}
          onRedo={workspaceHistory.redo}
        />

        {timelineTransform && (
          <SegmentTimeline
            segments={segments}
            transform={timelineTransform}
            selectedSegmentId={selectedSegmentId}
            hoveredSegmentId={hoveredSegmentId}
            activeLoopSegmentIds={new Set(auditionIndex != null ? segments.filter((s) => {
              const c = candidates[auditionIndex];
              if (!c) return false;
              const { start, end } = boundsFor(auditionIndex, c);
              return start * sampleRate < s.endFrame && end * sampleRate > s.startFrame;
            }).map((s) => s.id) : [])}
            staleSegmentIds={new Set(segments.filter((s) => s.gridRevisionId && s.gridRevisionId !== activeGridRevisionId).map((s) => s.id))}
            onSelect={setSelectedSegmentId}
            onHover={setHoveredSegmentId}
          />
        )}

        {/* 0714T §10/§16/§21 — grid status panel + manual correction controls. */}
        <div className="looper-grid-panel">
          <div className="looper-grid-status" aria-live="polite">
            {activeGrid ? (
              <>
                <strong>{activeGrid.bpm.toFixed(2)} BPM</strong>
                <span>{activeGrid.meterNumerator}/{activeGrid.meterDenominator}</span>
                <span>Origin: {activeGrid.originSource === "manual" ? "Manual" : activeGrid.originSource === "trusted_downbeat" ? "Detected downbeat" : "Detected beat"}</span>
                <span className={activeGrid.trust === "trusted" ? "looper-trust-ok" : "looper-trust-low"}>
                  {activeGrid.trust === "trusted" ? "Trusted Grid" : activeGrid.trust === "manual" ? "Manual Grid" : "Provisional Grid"}
                </span>
                <span>Confidence: {Math.round(activeGrid.confidence * 100)}%</span>
              </>
            ) : <span>No usable grid for this track.</span>}
          </div>
          {activeGrid && (
            <div className="looper-grid-controls">
              <input type="number" step={0.01} placeholder="Origin (s)" value={originInput} onChange={(e) => setOriginInput(e.target.value)} />
              <button onClick={handleSetOrigin}>Set Grid Origin Here</button>
              <button onClick={() => handleNudge(-0.001)}>-1 ms</button>
              <button onClick={() => handleNudge(0.001)}>+1 ms</button>
              <button onClick={() => handleNudge(-60 / activeGrid.bpm)}>-1 Beat</button>
              <button onClick={() => handleNudge(60 / activeGrid.bpm)}>+1 Beat</button>
              <button onClick={handleHalfBpm}>÷2 BPM</button>
              <button onClick={handleDoubleBpm}>×2 BPM</button>
              <button onClick={handleResetGrid}>Reset to Detected Grid</button>
            </div>
          )}
        </div>

        {/* 0714T §18/§22/§24-§26 — canonical segment timeline controls. */}
        <div className="looper-segment-panel">
          <div className="looper-segment-controls">
            <span>Segment length:</span>
            <select value={segmentBars} onChange={(e) => setSegmentBars(Number(e.target.value) as SupportedLoopBars)}>
              {[4, 8, 16, 32, 64].map((b) => <option key={b} value={b}>{b} bars</option>)}
            </select>
            <button onClick={handleGenerateEqualSegments} disabled={!activeGrid}>Generate Equal Segments</button>
            <button onClick={handleSplitAtPlayhead} disabled={!selectedSegmentId}>Split at Playhead</button>
            <button onClick={() => handleMerge("previous")} disabled={!selectedSegmentId}>Merge Previous</button>
            <button onClick={() => handleMerge("next")} disabled={!selectedSegmentId}>Merge Next</button>
          </div>
          {selectedSegmentId && (() => {
            const idx = segments.findIndex((s) => s.id === selectedSegmentId);
            const seg = segments[idx];
            if (!seg) return null;
            return (
              <div className="looper-segment-inspector">
                <strong>Segment {seg.order + 1} · {seg.displayLabel ?? seg.label}</strong>
                <span>{fmtTime(seg.startSeconds)} → {fmtTime(seg.endSeconds)}</span>
                <label>Move start <input type="number" step={0.05} defaultValue={seg.startSeconds.toFixed(2)}
                  onBlur={(e) => handleMoveBoundary("start", Number(e.target.value))} /></label>
                <label>Move end <input type="number" step={0.05} defaultValue={seg.endSeconds.toFixed(2)}
                  onBlur={(e) => handleMoveBoundary("end", Number(e.target.value))} /></label>
              </div>
            );
          })()}
          {segmentError && <div className="looper-warning" role="alert">{segmentError}</div>}
        </div>

        {/* 0715G §1/§4 — the candidate machinery, demoted (not deleted) behind
            a collapsed-by-default disclosure. Zero changes to the compact
            table's own internals/approve/reject/preview logic or to the
            developer-debug-only full card wall nested inside it. */}
        <AdvancedCandidatesPanel count={candidates.length}>
        <SnapModeToolbar
          snapMode={snapMode}
          onSnapModeChange={setSnapMode}
          subdivisionDivision={subdivisionDivision}
          onSubdivisionDivisionChange={setSubdivisionDivision}
          zeroCrossingEnabled={zeroCrossingEnabled}
          onZeroCrossingEnabledChange={setZeroCrossingEnabled}
          zeroCrossingFeedback={zeroCrossingFeedback}
        />
        {structuralSections.length > 0 && (
          <p className="looper-structure-summary" aria-live="polite">
            {structuralSections.map((s) => `${s.displayLabel}: bars — ${fmtTime(s.startFrame / sampleRate)}–${fmtTime(s.endFrame / sampleRate)}${s.confidence === "provisional" ? ", provisional" : ""}`).join(" · ")}
          </p>
        )}
        {candidates.length === 0 && <p className="looper-empty-reason">No candidate sections could be generated for this track.</p>}
        {!loopCardDebugView && candidates.length > 0 && (
          <div className="looper-compact-list" role="table" aria-label="Suggested candidates">
            <div className="looper-compact-row looper-compact-header" role="row">
              <span>Length</span><span>Range</span><span>Section</span><span>Mode</span><span>Status</span><span>Actions</span>
            </div>
            {candidates.map((c, i) => {
              const { start, end } = boundsFor(i, c);
              const state = candidateVisualState(i);
              const isActiveAudition = auditionIndex === i;
              const preview = isActiveAudition ? (loopAudition.session?.status ?? "idle") : "idle";
              return (
                <div key={i} className={`looper-compact-row is-${state}`} role="row" onClick={() => selectCandidate(i)}>
                  <span>{c.barCount ? `${c.barCount} bars` : `${(end - start).toFixed(1)}s`}</span>
                  <span>{fmtTime(start)}–{fmtTime(end)}</span>
                  <span>{c.sectionLabel}</span>
                  <span>{c.gridTrusted ? "Trusted" : c.provisional ? "Provisional" : "Time-based"}</span>
                  <span>{decision[i] ?? (state === "previewing" ? "previewing" : "suggestion")}</span>
                  <span className="looper-compact-actions" onClick={(e) => e.stopPropagation()}>
                    <button disabled={preview === "loading"} onClick={() => (preview === "playing" ? loopAudition.pause() : preview === "paused" ? void loopAudition.resume() : void startPreview(i))}>
                      {preview === "playing" ? "Stop" : preview === "paused" ? "Resume" : "▶"}
                    </button>
                    <button disabled={decision[i] === "approved"} onClick={() => approveCandidate(i, c)}>✓</button>
                    <button disabled={decision[i] === "rejected"} onClick={() => rejectCandidate(i)}>✕</button>
                  </span>
                </div>
              );
            })}
          </div>
        )}
        {/* 0714R §17/§18 — grouped by section, then by bar/second length;
            the full card wall — developer-debug-only (§32/§33), never
            reachable from normal-mode UI even with Advanced Candidates open. */}
        {loopCardDebugView && (
        <div className="looper-sections" aria-live="off">
          {sections.map((section) => (
            <LoopSectionGroup
              key={section.label}
              section={section}
              candidates={candidates}
              renderCandidate={(i, c) => {
                const { start, end } = boundsFor(i, c);
                const isActiveAudition = auditionIndex === i;
                const preview = isActiveAudition ? (loopAudition.session?.status ?? "idle") : "idle";
                const previewLabel = preview === "loading" ? "Loading…" : preview === "playing" ? "Stop" : preview === "paused" ? "Resume" : "Preview Loop";
                const state = candidateVisualState(i);
                const isPreviewing = state === "previewing";
                const relativePlayhead = isActiveAudition && loopAudition.session
                  ? loopAudition.session.currentRelativeSeconds
                  : undefined;

                return (
                  <div
                    key={i}
                    id={`looper-card-${i}`}
                    tabIndex={0}
                    role="group"
                    aria-label={`${c.label}, ${state}${decision[i] ? `, ${decision[i]}` : ""}`}
                    className={`looper-candidate-card is-${state}${decision[i] ? ` is-${decision[i]}` : ""}`}
                    onFocus={() => setSelectedIndex(i)}
                    onMouseEnter={() => setHoveredIndex(i)}
                    onMouseLeave={() => setHoveredIndex((h) => (h === i ? null : h))}
                  >
                    <div className="looper-candidate-title">
                      {c.label}
                      {!c.gridTrusted && <span className="looper-untrusted-tag"> · {c.provisional ? "provisional grid" : "not bar-aligned"}</span>}
                      {isPreviewing && <span className="looper-previewing-badge" role="status">Previewing</span>}
                      {decision[i] === "approved" && <span className="looper-approved-badge" role="status">Approved</span>}
                      {decision[i] === "rejected" && <span className="looper-rejected-badge" role="status">Rejected</span>}
                    </div>
                    <div className="looper-candidate-range">{fmtTime(start)} → {fmtTime(end)}</div>
                    <div className="looper-candidate-meta">
                      {c.barCount ? `${c.barCount} bars` : `${(end - start).toFixed(1)}s`}
                      {c.bpm ? ` · ${c.bpm.toFixed(2)} BPM` : ""}
                    </div>
                    {(() => {
                      const rel = candidateSegmentRelation(i, c);
                      return (
                        <div className={`looper-candidate-segment-relation${rel.stale ? " is-stale" : ""}`}>
                          {rel.label}{rel.stale ? " · stale" : ""}
                        </div>
                      );
                    })()}

                    <LoopCandidateWaveform
                      peaks={candidatePeaks[i] ?? null}
                      isSelected={state === "selected" || state === "previewing"}
                      isPreviewing={isPreviewing}
                      relativePlayheadSeconds={relativePlayhead}
                      durationSeconds={end - start}
                      onSelect={() => selectCandidate(i)}
                    />
                    {isActiveAudition && loopAudition.session && (
                      <div className="looper-loop-counter" aria-live="polite">
                        Loop {loopAudition.loopIteration + 1}
                        {preview === "paused" ? " · Paused" : ""}
                      </div>
                    )}

                    <div className="looper-nudge-row">
                      <label>Start
                        <input type="number" step={0.05} value={start.toFixed(2)}
                          onChange={(e) => setManualNudge((m) => ({ ...m, [i]: { start: Number(e.target.value), end: boundsFor(i, c).end } }))} />
                      </label>
                      <label>End
                        <input type="number" step={0.05} value={end.toFixed(2)}
                          onChange={(e) => setManualNudge((m) => ({ ...m, [i]: { start: boundsFor(i, c).start, end: Number(e.target.value) } }))} />
                      </label>
                      {manualNudge[i] && (
                        <button onClick={() => setManualNudge((m) => { const next = { ...m }; delete next[i]; return next; })}>
                          Restore detected
                        </button>
                      )}
                    </div>
                    <div className="looper-candidate-actions">
                      <button
                        disabled={preview === "loading"}
                        onClick={() => {
                          if (preview === "playing") loopAudition.pause();
                          else if (preview === "paused") void loopAudition.resume();
                          else void startPreview(i);
                        }}
                      >
                        {previewLabel}
                      </button>
                      <button disabled={decision[i] === "approved"} onClick={() => approveCandidate(i, c)}>Approve</button>
                      <button disabled={decision[i] === "rejected"} onClick={() => rejectCandidate(i)}>Reject</button>
                    </div>
                    {isActiveAudition && loopAudition.session?.status === "error" && (
                      <div className="looper-preview-error" role="alert">Preview playback was rejected — retry with Preview Loop.</div>
                    )}
                    {decision[i] === "approved" && candidateLoopIds[i] && (
                      <div className="looper-candidate-actions">
                        <button disabled={rendering[i]} onClick={() => renderCandidate(i)}>
                          {rendering[i] ? "Rendering…" : getLoopRenderRecord(candidateLoopIds[i])?.status === "rendered" ? "Re-render" : "Render Loop"}
                        </button>
                      </div>
                    )}
                  </div>
                );
              }}
            />
          ))}
        </div>
        )}
      </AdvancedCandidatesPanel>

      {/* 0715C §26-§31 — tabbed/filterable/sortable Loop Bin, replacing
          0715B's single flat approved-loop list. */}
      {track && (() => {
        // 0715E — sourceTrackId is always the OPEN track's own id, whether
        // that track is an ordinary track or a stem (only sourceKind/
        // sourceStemId differ); a `sourceKind === "track"` filter here
        // would silently hide every stem-derived loop from its own Loop Bin.
        const trackLoops = loops.filter((l) => l.sourceTrackId === track.trackId);
        const loopInputs: LoopBinLoopInput[] = trackLoops.map((l) => {
          const render = getLoopRenderRecord(l.id);
          // 0715D — compare against the ACTIVE REVISION's bounds (what
          // actually gets rendered), not the loop's own frozen original —
          // see activeBoundsForLoop's doc comment.
          const bounds = activeBoundsForLoop(l);
          const stale = !!render && isRenderStale(render, {
            currentSourceFingerprint: track.playbackBounds?.sourceFingerprint,
            currentStartSeconds: bounds.startFrame / sampleRate,
            currentEndSeconds: bounds.endFrame / sampleRate,
            currentSettings: render.settings,
            currentRevisionId: l.activeRevisionId,
            currentGridRevisionId: activeGridRevisionId,
            currentSegmentationRevisionId: segmentationRevisionId,
          });
          // §20 — Loop Bin row hints: parent-track lineage (stem loops only)
          // and a compact revision label, both resolved here since this
          // component already holds libraryTracks/loopRevisions in scope.
          const sourceTrackForLoop = libraryTracks.find((t) => t.trackId === l.sourceTrackId);
          const parentTrackTitle = sourceTrackForLoop ? resolveParentTrack(sourceTrackForLoop, libraryTracks)?.title : undefined;
          const timeline = buildRevisionTimeline(l, loopRevisions, sampleRate);
          const activeIndex = timeline.findIndex((e) => e.isActive);
          const revisionLabel = timeline.length > 1
            ? `v${activeIndex + 1} of ${timeline.length}` : undefined;
          return { loop: l, isStale: stale, renderStatus: stale ? "stale" : render?.status, parentTrackTitle, revisionLabel };
        });
        const candidateInputs: LoopBinCandidateInput[] = candidates.map((c, i) => {
          const { start, end } = boundsFor(i, c);
          return {
            candidateId: String(i), title: c.label, startSeconds: start, endSeconds: end,
            sectionLabel: c.sectionLabel, sourceKind: isStemTrack(track) ? "stem" : "track", generationMode: c.generationMode, decision: decision[i],
            barCount: c.barCount,
          };
        });
        const rows = buildLoopBinRows(loopInputs, candidateInputs, sampleRate);
        return (
          <div onFocus={() => keyboard.setFocusTarget("loop_bin")}>
          <LoopBinPanel
            rows={rows}
            viewState={loopBinViewState}
            onViewStateChange={onSaveLoopBinViewState}
            onSelectCandidate={selectCandidate}
            onPreviewCandidate={(i) => void startPreview(i)}
            onApproveCandidate={(i) => approveCandidate(i, candidates[i])}
            onRejectCandidate={rejectCandidate}
            onRestoreCandidate={(i) => setDecision((d) => { const next = { ...d }; delete next[i]; return next; })}
            onLoadLoop={loadLoopIntoSelection}
            onPreviewLoop={(id) => void previewLoopById(id)}
            onRenderLoop={(id) => void renderLoopById(id)}
            onArchiveLoop={archiveLoop}
            onReviseLoop={reviseLoop}
            onCopyRenderedPath={copyRenderedPath}
            renderingLoopIds={new Set(Object.entries(renderingByLoopId).filter(([, v]) => v).map(([k]) => k))}
            renderedPathByLoopId={new Map(trackLoops.map((l) => {
              const r = getLoopRenderRecord(l.id);
              return [l.id, r?.filename ?? r?.outputPath];
            }))}
          />
          </div>
        );
      })()}
      </AdvancedDrawer>

      {renderError && <div className="looper-warning">Render failed: {renderError}</div>}
    </div>
  );
}

export function defaultContentClassOptions(): LoopContentClass[] {
  return ["drums", "bass", "melodic", "harmonic", "vocal", "fx", "mixed", "unknown"];
}

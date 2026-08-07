import type { Track } from "../../data/trackTypes";
import type { CompleteSongAnalysis } from "../../data/songAnalysisTypes";
import type { MusicalGrid, MusicalGridRevision } from "../../data/loopTypes";
import type {
  DjPhraseBars,
  DjPhraseGridPreparation,
  DjPreparationBasis,
  DjPreparationCue,
  DjPreparationCueRole,
  DjTrackPreparation,
} from "../../data/djTrackPreparationTypes";
import { resolveActiveSongSection } from "../songAnalysis/songSectionRevisions";

export const DJ_PREPARATION_CUE_ORDER: readonly DjPreparationCueRole[] = [
  "FULL_ENTRY", "SHORT_ENTRY", "MAIN_ENTRY", "MIX_OUT",
];
export const DJ_PHRASE_GROUPINGS: readonly DjPhraseBars[] = [4, 8, 16, 32];

export interface ActivePreparationGrid {
  grid: MusicalGrid;
  revisionId: string;
}

export type DjPreparationValidationFailure =
  | "missing_preparation"
  | "stale_preparation"
  | "missing_grid"
  | "grid_unreviewed"
  | "missing_phrase_grid"
  | "phrase_unconfirmed"
  | "incomplete_cues"
  | "cue_unconfirmed"
  | "cue_out_of_bounds"
  | "cue_order_invalid"
  | "sections_unreviewed";

export type DjPreparationValidationResult =
  | { valid: true }
  | { valid: false; reason: DjPreparationValidationFailure };

export function createDjTrackPreparation(
  analysis: CompleteSongAnalysis,
  id: string,
  now: string,
): DjTrackPreparation {
  return {
    id,
    sourceTrackId: analysis.sourceTrackId,
    status: "draft",
    gridRevisions: [],
    activeGridRevisionId: null,
    cues: {},
    createdAt: now,
    updatedAt: now,
  };
}

export function resolveActivePreparationGrid(
  preparation: DjTrackPreparation | undefined,
  detectedGrid: MusicalGrid | null,
): ActivePreparationGrid | null {
  if (preparation?.activeGridRevisionId) {
    const revision = preparation.gridRevisions.find((candidate) => candidate.id === preparation.activeGridRevisionId);
    if (!revision) return null;
    return { grid: revision.grid, revisionId: revision.id };
  }
  return detectedGrid ? { grid: detectedGrid, revisionId: "detected" } : null;
}

function editablePreparation(analysis: CompleteSongAnalysis, id: string, now: string): DjTrackPreparation {
  const current = analysis.djPreparation ?? createDjTrackPreparation(analysis, id, now);
  if (current.status === "approved") {
    return { ...current, status: "stale", updatedAt: now };
  }
  return {
    ...current,
    status: "draft",
    approvalBasis: undefined,
    approvalRevisionKey: undefined,
    approvedAt: undefined,
    updatedAt: now,
  };
}

export function appendPreparationGridRevision(
  analysis: CompleteSongAnalysis,
  nextGrid: MusicalGrid,
  reason: MusicalGridRevision["reason"],
  revisionId: string,
  preparationId: string,
  now: string,
): CompleteSongAnalysis {
  const preparation = editablePreparation(analysis, preparationId, now);
  const revision: MusicalGridRevision = {
    id: revisionId,
    grid: nextGrid,
    revisionOf: preparation.activeGridRevisionId ?? "detected",
    reason,
    createdAt: now,
  };
  return {
    ...analysis,
    djPreparation: {
      ...preparation,
      gridRevisions: [...preparation.gridRevisions, revision],
      activeGridRevisionId: revision.id,
    },
  };
}

function normalizedGroupings(groupings: readonly DjPhraseBars[]): DjPhraseBars[] {
  return DJ_PHRASE_GROUPINGS.filter((grouping) => groupings.includes(grouping));
}

export function deriveDjPhraseGrid(
  activeGrid: ActivePreparationGrid,
  originBarIndex: number,
  groupings: readonly DjPhraseBars[],
  provenance: "inferred" | "manually_confirmed",
  now: string,
): DjPhraseGridPreparation {
  const barCount = activeGrid.grid.barFrames.length;
  const origin = Math.max(0, Math.min(Math.max(0, barCount - 1), Math.floor(originBarIndex)));
  const enabledGroupings = normalizedGroupings(groupings);
  const boundaries = enabledGroupings.flatMap((groupingBars) => {
    const result: DjPhraseGridPreparation["boundaries"] = [];
    for (let barIndex = origin; barIndex < barCount; barIndex += groupingBars) {
      result.push({
        barIndex,
        groupingBars,
        provenance,
        confidence: activeGrid.grid.confidence,
      });
    }
    return result;
  }).sort((a, b) => a.barIndex - b.barIndex || a.groupingBars - b.groupingBars);
  return {
    basisGridRevisionId: activeGrid.revisionId,
    originBarIndex: origin,
    enabledGroupings,
    boundaries,
    updatedAt: now,
  };
}

export function setPreparationPhraseGrid(
  analysis: CompleteSongAnalysis,
  phraseGrid: DjPhraseGridPreparation,
  preparationId: string,
  now: string,
): CompleteSongAnalysis {
  const preparation = editablePreparation(analysis, preparationId, now);
  return { ...analysis, djPreparation: { ...preparation, phraseGrid } };
}

export function setPreparationCue(
  analysis: CompleteSongAnalysis,
  cue: DjPreparationCue,
  preparationId: string,
  now: string,
): CompleteSongAnalysis {
  const preparation = editablePreparation(analysis, preparationId, now);
  return { ...analysis, djPreparation: { ...preparation, cues: { ...preparation.cues, [cue.role]: cue } } };
}

export function buildDjPreparationCue(
  role: DjPreparationCueRole,
  requestedFrame: number,
  analysis: CompleteSongAnalysis,
  activeGrid: ActivePreparationGrid,
  id: string,
  now: string,
): DjPreparationCue {
  const frame = Math.max(0, Math.min(Math.max(0, analysis.decodedFrameCount - 1), Math.round(requestedFrame)));
  const lastAtOrBefore = (frames: number[]) => {
    let result: number | undefined;
    for (let index = 0; index < frames.length; index++) {
      if (frames[index] > frame) break;
      result = index;
    }
    return result;
  };
  const barIndex = lastAtOrBefore(activeGrid.grid.barFrames);
  const phraseBoundaryBarIndex = analysis.djPreparation?.phraseGrid?.boundaries
    .filter((boundary) => boundary.barIndex <= (barIndex ?? -1))
    .at(-1)?.barIndex;
  return {
    id,
    role,
    frame,
    basisGridRevisionId: activeGrid.revisionId,
    beatIndex: lastAtOrBefore(activeGrid.grid.beatFrames),
    barIndex,
    phraseBoundaryBarIndex,
    origin: "manual",
    provenance: "manually_confirmed",
    confidence: 1,
    updatedAt: now,
  };
}

function beatMapRevisionKey(track: Track): string {
  const map = track.beatMap;
  return [
    track.bpm ?? "", track.bpmSource ?? "", track.analysisUpdatedAt ?? "",
    map?.detectorVersion ?? "", map?.analyzedAt ?? "", map?.firstDownbeatSeconds ?? "",
  ].join("|");
}

function gridRevisionKey(activeGrid: ActivePreparationGrid): string {
  const grid = activeGrid.grid;
  return [activeGrid.revisionId, grid.bpm, grid.originFrame, grid.meterNumerator, grid.meterDenominator, grid.sourceFingerprint, grid.updatedAt].join("|");
}

export function sectionRevisionKeyFor(analysis: CompleteSongAnalysis): string {
  return analysis.sections.map((section) => {
    const resolved = resolveActiveSongSection(section, analysis.sectionRevisions);
    return [section.id, section.activeRevisionId ?? "", resolved.startFrame, resolved.endFrame, resolved.structuralType, resolved.verification].join(":");
  }).sort().join("|");
}

export function buildDjPreparationBasis(
  track: Track,
  analysis: CompleteSongAnalysis,
  activeGrid: ActivePreparationGrid,
): DjPreparationBasis {
  return {
    sourceTrackId: track.trackId,
    sourceMediaFingerprint: analysis.sourceMediaFingerprint,
    beatMapRevisionKey: beatMapRevisionKey(track),
    activeGridRevisionId: activeGrid.revisionId,
    activeGridRevisionKey: gridRevisionKey(activeGrid),
    songAnalysisRevisionKey: [analysis.id, analysis.createdAt, analysis.analyzerVersion, analysis.configurationVersion].join("|"),
    sectionRevisionKey: sectionRevisionKeyFor(analysis),
    sampleRate: analysis.sampleRate,
    decodedFrameCount: analysis.decodedFrameCount,
  };
}

export function buildDjPreparationRevisionKey(basis: DjPreparationBasis): string {
  return [
    basis.sourceTrackId, basis.sourceMediaFingerprint, basis.beatMapRevisionKey,
    basis.activeGridRevisionId, basis.activeGridRevisionKey, basis.songAnalysisRevisionKey,
    basis.sectionRevisionKey, basis.sampleRate, basis.decodedFrameCount,
  ].join("::");
}

export function isDjTrackPreparationStale(preparation: DjTrackPreparation, currentBasis: DjPreparationBasis): boolean {
  if (!preparation.approvalRevisionKey || !preparation.approvalBasis) return preparation.status === "stale";
  return preparation.approvalRevisionKey !== buildDjPreparationRevisionKey(currentBasis);
}

export function resolveDjTrackPreparationStatus(
  preparation: DjTrackPreparation,
  currentBasis: DjPreparationBasis,
): DjTrackPreparation["status"] {
  return isDjTrackPreparationStale(preparation, currentBasis) ? "stale" : preparation.status;
}

export function synchronizeDjTrackPreparationStaleness(
  analysis: CompleteSongAnalysis,
  currentBasis: DjPreparationBasis,
  now: string,
): CompleteSongAnalysis {
  if (!analysis.djPreparation || !isDjTrackPreparationStale(analysis.djPreparation, currentBasis)) return analysis;
  return markDjTrackPreparationStale(analysis, now);
}

export function validateDjTrackPreparation(
  analysis: CompleteSongAnalysis,
  activeGrid: ActivePreparationGrid | null,
): DjPreparationValidationResult {
  const preparation = analysis.djPreparation;
  if (!preparation) return { valid: false, reason: "missing_preparation" };
  if (preparation.status === "stale") return { valid: false, reason: "stale_preparation" };
  if (!activeGrid) return { valid: false, reason: "missing_grid" };
  if (activeGrid.grid.trust === "provisional") return { valid: false, reason: "grid_unreviewed" };
  if (!preparation.phraseGrid || preparation.phraseGrid.basisGridRevisionId !== activeGrid.revisionId) {
    return { valid: false, reason: "missing_phrase_grid" };
  }
  if (preparation.phraseGrid.boundaries.length === 0 || preparation.phraseGrid.boundaries.some((boundary) => boundary.provenance !== "manually_confirmed")) {
    return { valid: false, reason: "phrase_unconfirmed" };
  }
  const cues = DJ_PREPARATION_CUE_ORDER.map((role) => preparation.cues[role]);
  if (cues.some((cue) => !cue)) return { valid: false, reason: "incomplete_cues" };
  if (cues.some((cue) => cue!.provenance !== "manually_confirmed")) return { valid: false, reason: "cue_unconfirmed" };
  if (cues.some((cue) => cue!.frame < 0 || cue!.frame >= analysis.decodedFrameCount || cue!.basisGridRevisionId !== activeGrid.revisionId)) {
    return { valid: false, reason: "cue_out_of_bounds" };
  }
  for (let index = 1; index < cues.length; index++) {
    if (cues[index]!.frame < cues[index - 1]!.frame) return { valid: false, reason: "cue_order_invalid" };
  }
  if (analysis.sections.length === 0 || analysis.sections.some(
    (section) => resolveActiveSongSection(section, analysis.sectionRevisions).verification === "provisional",
  )) return { valid: false, reason: "sections_unreviewed" };
  return { valid: true };
}

export function reviewDjTrackPreparation(
  analysis: CompleteSongAnalysis,
  activeGrid: ActivePreparationGrid | null,
  now: string,
): CompleteSongAnalysis {
  const validation = validateDjTrackPreparation(analysis, activeGrid);
  if (!validation.valid) return analysis;
  return { ...analysis, djPreparation: { ...analysis.djPreparation!, status: "reviewed", reviewedAt: now, updatedAt: now } };
}

export function approveDjTrackPreparation(
  track: Track,
  analysis: CompleteSongAnalysis,
  activeGrid: ActivePreparationGrid | null,
  now: string,
): CompleteSongAnalysis {
  const validation = validateDjTrackPreparation(analysis, activeGrid);
  if (!validation.valid || !activeGrid || analysis.djPreparation?.status !== "reviewed") return analysis;
  const approvalBasis = buildDjPreparationBasis(track, analysis, activeGrid);
  return {
    ...analysis,
    djPreparation: {
      ...analysis.djPreparation,
      status: "approved",
      approvalBasis,
      approvalRevisionKey: buildDjPreparationRevisionKey(approvalBasis),
      approvedAt: now,
      updatedAt: now,
    },
  };
}

export function markDjTrackPreparationStale(analysis: CompleteSongAnalysis, now: string): CompleteSongAnalysis {
  if (!analysis.djPreparation) return analysis;
  return { ...analysis, djPreparation: { ...analysis.djPreparation, status: "stale", updatedAt: now } };
}

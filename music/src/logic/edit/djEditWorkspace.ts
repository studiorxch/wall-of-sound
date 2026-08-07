import type { StructuralSectionBand } from "../../data/loopTypes";
import type { CompleteSongAnalysis } from "../../data/songAnalysisTypes";
import type { Track } from "../../data/trackTypes";
import type { DjPreparationValidationResult, ActivePreparationGrid } from "./djTrackPreparation";
import {
  buildDjPreparationBasis,
  deriveDjPhraseGrid,
  resolveActivePreparationGrid,
  resolveDjTrackPreparationStatus,
  validateDjTrackPreparation,
} from "./djTrackPreparation";
import { buildMusicalGridFromBeatMap } from "../loops/musicalGrid";
import { resolveActiveSongSection } from "../songAnalysis/songSectionRevisions";

export interface DjEditWorkspaceModel {
  track: Track | null;
  analysis: CompleteSongAnalysis | null;
  detectedGrid: ReturnType<typeof buildMusicalGridFromBeatMap>;
  activeGrid: ActivePreparationGrid | null;
  phraseGrid: ReturnType<typeof deriveDjPhraseGrid> | null;
  phraseGridPersisted: boolean;
  preparationStatus: "not_prepared" | "draft" | "reviewed" | "approved" | "stale";
  validation: DjPreparationValidationResult;
  sections: StructuralSectionBand[];
  durationSeconds: number;
}

function sectionLabel(type: string): StructuralSectionBand["label"] {
  if (type === "intro" || type === "outro" || type === "body") return type;
  return "section";
}

export function buildDjEditWorkspaceModel(
  track: Track | null,
  analysis: CompleteSongAnalysis | null,
  now: string,
): DjEditWorkspaceModel {
  if (!track || !analysis || analysis.sampleRate <= 0 || analysis.decodedFrameCount <= 0) {
    return {
      track,
      analysis,
      detectedGrid: null,
      activeGrid: null,
      phraseGrid: null,
      phraseGridPersisted: false,
      preparationStatus: analysis?.djPreparation?.status ?? "not_prepared",
      validation: { valid: false, reason: analysis ? "missing_grid" : "missing_preparation" },
      sections: [],
      durationSeconds: 0,
    };
  }
  const durationSeconds = analysis.decodedFrameCount / analysis.sampleRate;
  const detectedGrid = buildMusicalGridFromBeatMap(
    track.beatMap,
    track.bpm,
    analysis.sourceMediaFingerprint,
    durationSeconds,
    analysis.sampleRate,
    now,
  );
  const activeGrid = resolveActivePreparationGrid(analysis.djPreparation, detectedGrid);
  const persistedPhrase = analysis.djPreparation?.phraseGrid;
  const phraseGrid = activeGrid
    ? persistedPhrase?.basisGridRevisionId === activeGrid.revisionId
      ? persistedPhrase
      : deriveDjPhraseGrid(activeGrid, 0, [4, 8, 16, 32], "inferred", now)
    : null;
  let preparationStatus: DjEditWorkspaceModel["preparationStatus"] = analysis.djPreparation?.status ?? "not_prepared";
  if (analysis.djPreparation && activeGrid && analysis.djPreparation.status === "approved") {
    preparationStatus = resolveDjTrackPreparationStatus(
      analysis.djPreparation,
      buildDjPreparationBasis(track, analysis, activeGrid),
    );
  }
  const sections: StructuralSectionBand[] = analysis.sections.map((section) => {
    const resolved = resolveActiveSongSection(section, analysis.sectionRevisions);
    return {
      id: section.id,
      startFrame: resolved.startFrame,
      endFrame: resolved.endFrame,
      label: sectionLabel(resolved.structuralType),
      displayLabel: resolved.displayLabel,
      confidence: resolved.verification === "provisional" ? "provisional" : "high",
      source: "detected_structure",
    };
  });
  return {
    track,
    analysis,
    detectedGrid,
    activeGrid,
    phraseGrid,
    phraseGridPersisted: Boolean(persistedPhrase && persistedPhrase.basisGridRevisionId === activeGrid?.revisionId),
    preparationStatus,
    validation: validateDjTrackPreparation(analysis, activeGrid),
    sections,
    durationSeconds,
  };
}

export const DJ_PREPARATION_FAILURE_LABELS: Record<Exclude<DjPreparationValidationResult, { valid: true }>["reason"], string> = {
  missing_preparation: "No DJ preparation exists yet.",
  stale_preparation: "Preparation is stale and must be revised.",
  missing_grid: "No usable musical grid is available.",
  grid_unreviewed: "The active grid is still provisional; confirm or correct its downbeat/BPM.",
  missing_phrase_grid: "Phrase alignment has not been saved for the active grid.",
  phrase_unconfirmed: "Phrase boundaries remain inferred and must be confirmed.",
  incomplete_cues: "All four semantic DJ cues are required.",
  cue_unconfirmed: "All semantic DJ cues must be manually confirmed.",
  cue_out_of_bounds: "Every cue must belong to the active grid and decoded track bounds.",
  cue_order_invalid: "Cue order must be FULL_ENTRY, SHORT_ENTRY, MAIN_ENTRY, then MIX_OUT.",
  sections_unreviewed: "Every structural section must be reviewed or verified.",
};

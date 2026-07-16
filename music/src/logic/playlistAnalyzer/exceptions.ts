// Playlist Analyzer Review — exceptions/outliers (spec §5.7, §13).
// Explanatory, not punitive — every entry says what's happening and whether
// the user needs to act, rather than just flagging a problem.

import type {
  PlaylistAnalysisCoverage,
  PlaylistReviewException,
  PlaylistSectionReview,
  PlaylistTrackReview,
  PlaylistTransitionReview,
} from "../../data/playlistAnalyzerTypes";

function pluralVerb(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

export function computeExceptions(
  coverage: PlaylistAnalysisCoverage,
  tracks: PlaylistTrackReview[],
  sections: PlaylistSectionReview[],
  transitions: PlaylistTransitionReview[],
): PlaylistReviewException[] {
  const exceptions: PlaylistReviewException[] = [];

  if (coverage.missingCount > 0) {
    exceptions.push({
      code: "PLAYLIST_ANALYSIS_MISSING_TRACK_DATA",
      severity: "attention",
      explanation: `${coverage.missingCount} track${coverage.missingCount === 1 ? "" : "s"} in this playlist ${coverage.missingCount === 1 ? "has" : "have"} no canonical analysis yet — ${coverage.missingCount === 1 ? "its" : "their"} contribution to identity and role assignment is unconfirmed.`,
      affectedPositions: tracks.filter((t) => t.analysisState === "missing").map((t) => t.position),
      actionRequired: true,
    });
  }
  if (coverage.partialCount > 0) {
    exceptions.push({
      code: "PLAYLIST_ANALYSIS_PARTIAL_TRACK_DATA",
      severity: "advisory",
      explanation: `${coverage.partialCount} track${coverage.partialCount === 1 ? "" : "s"} ${coverage.partialCount === 1 ? "has" : "have"} partial analysis (missing or invalid BPM/key) — those fields are shown as unknown rather than guessed.`,
      affectedPositions: tracks.filter((t) => t.analysisState === "partial").map((t) => t.position),
      actionRequired: false,
    });
  }
  if (coverage.staleCount > 0) {
    exceptions.push({
      code: "PLAYLIST_ANALYSIS_STALE_TRACK_DATA",
      severity: "advisory",
      explanation: `${coverage.staleCount} track${coverage.staleCount === 1 ? "" : "s"} ${coverage.staleCount === 1 ? "was" : "were"} analyzed with an older analyzer version — reanalyzing may refine ${coverage.staleCount === 1 ? "its" : "their"} identity contribution.`,
      affectedPositions: tracks.filter((t) => t.analysisState === "stale").map((t) => t.position),
      actionRequired: false,
    });
  }

  const abruptEnergy = transitions.filter((t) => t.warningCodes.includes("PLAYLIST_TRANSITION_ABRUPT_ENERGY"));
  if (abruptEnergy.length) {
    exceptions.push({
      code: "PLAYLIST_TRANSITION_ABRUPT_ENERGY",
      severity: "advisory",
      explanation: `${abruptEnergy.length} transition${abruptEnergy.length === 1 ? "" : "s"} ${pluralVerb(abruptEnergy.length, "carries", "carry")} a sharp energy jump or drop — this may be an intentional reset or worth smoothing.`,
      affectedPositions: abruptEnergy.map((t) => t.fromPosition),
      actionRequired: false,
    });
  }

  const abruptTempo = transitions.filter((t) => t.warningCodes.includes("PLAYLIST_TRANSITION_ABRUPT_TEMPO"));
  if (abruptTempo.length) {
    exceptions.push({
      code: "PLAYLIST_TRANSITION_ABRUPT_TEMPO",
      severity: "advisory",
      explanation: `${abruptTempo.length} transition${abruptTempo.length === 1 ? "" : "s"} ${pluralVerb(abruptTempo.length, "shifts", "shift")} tempo by 20+ BPM.`,
      affectedPositions: abruptTempo.map((t) => t.fromPosition),
      actionRequired: false,
    });
  }

  const harmonicTension = transitions.filter((t) => t.warningCodes.includes("PLAYLIST_TRANSITION_HARMONIC_TENSION"));
  if (harmonicTension.length) {
    exceptions.push({
      code: "PLAYLIST_TRANSITION_HARMONIC_TENSION",
      severity: "advisory",
      explanation: `${harmonicTension.length} transition${harmonicTension.length === 1 ? "" : "s"} ${pluralVerb(harmonicTension.length, "moves", "move")} between distantly related keys.`,
      affectedPositions: harmonicTension.map((t) => t.fromPosition),
      actionRequired: false,
    });
  }

  const lowMovementSections = sections.filter((s) => s.warningCodes.includes("PLAYLIST_SECTION_LOW_MOVEMENT"));
  if (lowMovementSections.length) {
    exceptions.push({
      code: "PLAYLIST_SECTION_LOW_MOVEMENT",
      severity: "info",
      explanation: `${lowMovementSections.length} section${lowMovementSections.length === 1 ? "" : "s"} (${lowMovementSections.map((s) => s.sectionLabel).join(", ")}) ${pluralVerb(lowMovementSections.length, "shows", "show")} very little energy movement internally.`,
      affectedPositions: lowMovementSections.map((s) => s.startSlotIndex),
      actionRequired: false,
    });
  }

  // Duplicate role: two sections sharing the same derived role back-to-back
  // can mean a section boundary isn't doing structural work.
  for (let i = 1; i < sections.length; i++) {
    if (sections[i].role === sections[i - 1].role) {
      exceptions.push({
        code: "PLAYLIST_SECTION_DUPLICATE_ROLE",
        severity: "info",
        explanation: `Sections "${sections[i - 1].sectionLabel}" and "${sections[i].sectionLabel}" both play a "${sections[i].role}" role back-to-back.`,
        affectedPositions: [sections[i - 1].startSlotIndex, sections[i].startSlotIndex],
        actionRequired: false,
      });
    }
  }

  const outliers = tracks.filter((t) => t.role === "outlier");
  if (outliers.length) {
    exceptions.push({
      code: "PLAYLIST_TRACK_OUTLIER",
      severity: "info",
      explanation: `${outliers.length} track${outliers.length === 1 ? "" : "s"} ${pluralVerb(outliers.length, "sits", "sit")} statistically apart from the playlist's overall energy profile.`,
      affectedPositions: outliers.map((t) => t.position),
      actionRequired: false,
    });
  }

  const weakClosers = tracks.filter((t) => t.warningCodes.includes("PLAYLIST_CLOSER_WEAK_RESOLUTION"));
  if (weakClosers.length) {
    exceptions.push({
      code: "PLAYLIST_CLOSER_WEAK_RESOLUTION",
      severity: "info",
      explanation: "The closing track holds energy close to the playlist average rather than resolving downward — may be intentional for an open-ended feel.",
      affectedPositions: weakClosers.map((t) => t.position),
      actionRequired: false,
    });
  }

  if (coverage.coverageRatio < 0.5) {
    exceptions.push({
      code: "PLAYLIST_CREATIVE_EXPORT_LOW_CONFIDENCE",
      severity: "attention",
      explanation: `Only ${Math.round(coverage.coverageRatio * 100)}% of tracks have complete analysis — creative export language should be treated as a rough draft, not a confirmed read of this playlist.`,
      affectedPositions: [],
      actionRequired: true,
    });
  }

  return exceptions;
}

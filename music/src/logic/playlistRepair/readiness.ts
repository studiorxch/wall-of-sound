// Playlist Local Repair — readiness (§14, §19).

import type { PlaylistIssue, PlaylistReadinessSummary } from "../../data/playlistRepairTypes";

const BLUE_UNCERTAINTY_THRESHOLD = 5;

export function computeReadiness(issues: PlaylistIssue[]): PlaylistReadinessSummary {
  const unresolvedRed = issues.filter((i) => i.colorState === "red" && !i.accepted);
  const acceptedYellow = issues.filter((i) => i.colorState === "yellow" && i.accepted);
  const blueUncertainty = issues.filter((i) => i.colorState === "blue");

  if (blueUncertainty.length >= BLUE_UNCERTAINTY_THRESHOLD) {
    return {
      state: "insufficient_analysis",
      unresolvedRedCount: unresolvedRed.length,
      acceptedYellowCount: acceptedYellow.length,
      blueUncertaintyCount: blueUncertainty.length,
      explanation: `${blueUncertainty.length} unresolved blue-uncertainty issues prevent a reliable readiness judgment.`,
    };
  }

  if (unresolvedRed.length > 0) {
    return {
      state: "needs_repair",
      unresolvedRedCount: unresolvedRed.length,
      acceptedYellowCount: acceptedYellow.length,
      blueUncertaintyCount: blueUncertainty.length,
      explanation: `${unresolvedRed.length} unresolved material defect${unresolvedRed.length === 1 ? "" : "s"} require attention.`,
    };
  }

  if (acceptedYellow.length > 0) {
    return {
      state: "ready_with_compromises",
      unresolvedRedCount: 0,
      acceptedYellowCount: acceptedYellow.length,
      blueUncertaintyCount: blueUncertainty.length,
      explanation: `No unresolved defects; ${acceptedYellow.length} accepted compromise${acceptedYellow.length === 1 ? "" : "s"} remain visible.`,
    };
  }

  return {
    state: "ready",
    unresolvedRedCount: 0,
    acceptedYellowCount: 0,
    blueUncertaintyCount: blueUncertainty.length,
    explanation: "No unresolved defects or unaccepted compromises.",
  };
}

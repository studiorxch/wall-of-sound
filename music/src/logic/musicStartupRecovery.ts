/**
 * musicStartupRecovery.ts — startup state assessment (0712_MUSIC_Recovery_
 * Screen_Removal).
 *
 * The recovery prompt appears ONLY when there is concrete evidence the
 * current state is unreadable/invalid — never because it has fewer
 * playlists/crates/tracks/banks than some other snapshot. Intentional
 * deletion, cleanup, deduplication, and consolidation are valid library
 * operations and must never be second-guessed here.
 *
 * Call assessStartupRecovery() before applying state to the app. If
 * assessment.shouldPrompt is true (structural failure only), show
 * StartupRecoveryPrompt. Otherwise apply the current state directly and
 * record it as accepted via saveAcceptedLibraryState.
 */

import type { PlayProject } from "../data/playProjectTypes";
import type { MusicStateSummary } from "./musicStateSummary";
import { isMusicStateValid } from "./musicStateValidation";
import {
  loadStateRecord,
  listCheckpointSummaries,
  loadCheckpoint,
  loadLastKnownGood,
  type StateRecordSummary,
} from "./musicStateStore";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StartupRecoverySeverity = "healthy" | "critical";

export type StartupRecoveryReason =
  | "current_missing"
  | "current_parse_failed"
  | "current_validation_failed";

export interface StartupRecoveryAssessment {
  severity: StartupRecoverySeverity;
  reasons: StartupRecoveryReason[];
  shouldPrompt: boolean;
  currentState?: PlayProject | null;
  currentSummary?: MusicStateSummary | null;
  /** Neutral information only (spec §2.2) — never used to compute severity/shouldPrompt. */
  lastKnownGoodSummary?: MusicStateSummary | null;
  checkpointSummaries?: StateRecordSummary[];
  message: string;
}

// ---------------------------------------------------------------------------
// Assessment
// ---------------------------------------------------------------------------

export async function assessStartupRecovery(): Promise<StartupRecoveryAssessment> {
  const reasons: StartupRecoveryReason[] = [];
  let severity: StartupRecoverySeverity = "healthy";

  let currentRec;
  let lkgRec;
  let checkpoints: StateRecordSummary[] = [];
  try {
    [currentRec, lkgRec, checkpoints] = await Promise.all([
      loadStateRecord("current"),
      loadStateRecord("lastKnownGood"),
      listCheckpointSummaries(),
    ]);
  } catch {
    // Storage read failure (spec §2.3) — treat as critical/unreadable.
    return {
      severity: "critical",
      reasons: ["current_parse_failed"],
      shouldPrompt: true,
      currentState: null,
      currentSummary: null,
      lastKnownGoodSummary: null,
      checkpointSummaries: [],
      message: "The saved state could not be read from storage.",
    };
  }

  const currentSummary: MusicStateSummary | null = currentRec?.summary ?? null;
  const lkgSummary: MusicStateSummary | null = lkgRec?.summary ?? null;
  const currentState: PlayProject | null = currentRec?.state ?? null;

  // ── Structural validity only — no count comparisons (spec §2.2/§4) ──────
  if (!currentRec || !currentState) {
    reasons.push("current_missing");
    severity = "critical";
  } else if (!isMusicStateValid(currentState)) {
    reasons.push("current_validation_failed");
    severity = "critical";
  }

  const shouldPrompt = severity === "critical";
  const message = buildMessage(reasons, lkgSummary);

  return {
    severity,
    reasons,
    shouldPrompt,
    currentState,
    currentSummary,
    lastKnownGoodSummary: lkgSummary,
    checkpointSummaries: checkpoints,
    message,
  };
}

function buildMessage(reasons: StartupRecoveryReason[], lkg: MusicStateSummary | null): string {
  if (reasons.includes("current_missing")) return "No saved state was found.";
  if (reasons.includes("current_validation_failed")) return "The saved state could not be read.";
  if (reasons.includes("current_parse_failed")) return "The saved state could not be read from storage.";
  return lkg
    ? "A prior backup is available if you need it."
    : "No backup is available for comparison.";
}

// ---------------------------------------------------------------------------
// Recovery action helpers (used by App.tsx, StartupRecoveryPrompt, and the
// Data Management → Backups & Recovery panel)
// ---------------------------------------------------------------------------

export async function loadLkgState(): Promise<PlayProject | null> {
  return loadLastKnownGood();
}

export async function loadCheckpointState(id: string): Promise<PlayProject | null> {
  return loadCheckpoint(id);
}

export function downloadStateAsJson(state: PlayProject, label: string): void {
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const blob = new Blob([JSON.stringify({ label, exportedAt: ts, state }, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `MUSIC_${label}_${ts}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

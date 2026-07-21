// 0717D_RADIO_Playlist_Inbox_and_Performance_Foundation §4.1/§7 — computes
// a RadioInboxItem's RadioAssetReadiness + issues. Pure — no DOM, no Node.
//
// `kind: "loop"` (0716B/0717A/0717B/0717C RadioLoop packaging) and
// `kind: "track"` (0718B RadioTrackPackage — see radioTrackPackagePipeline.ts)
// are the only kinds with a verified encoder path. Every other kind —
// sound/stem/stem_section/fill/build/announcement — always resolves to
// NOT_YET_PACKAGEABLE with a named issue code. Never fake an encoder or
// silently report READY for a kind with no packaging path.

import type { RadioAssetKind, RadioAssetReadiness, RadioAssetReadinessIssue } from "../../data/radioInboxTypes";
import type { LoopStatus } from "../../data/loopTypes";
import type { SongAnalysisStatus } from "../../data/songAnalysisTypes";

const KINDS_WITH_PACKAGING_PATH: ReadonlySet<RadioAssetKind> = new Set(["loop", "track"]);

export function kindHasPackagingPath(kind: RadioAssetKind): boolean {
  return KINDS_WITH_PACKAGING_PATH.has(kind);
}

export interface RadioAssetReadinessInput {
  kind: RadioAssetKind;
  // Only meaningful for kind === "loop" — the loop's own approval state.
  loopStatus?: LoopStatus;
  // The source track's complete-song analysis state, when one exists.
  songAnalysisStatus?: SongAnalysisStatus;
}

export interface RadioAssetReadinessResult {
  readiness: RadioAssetReadiness;
  issues: RadioAssetReadinessIssue[];
}

export function computeRadioAssetReadiness(input: RadioAssetReadinessInput): RadioAssetReadinessResult {
  const issues: RadioAssetReadinessIssue[] = [];

  if (!kindHasPackagingPath(input.kind)) {
    issues.push({
      code: "RADIO_ASSET_KIND_NOT_YET_PACKAGEABLE",
      message: `"${input.kind}" has no verified packaging path yet`,
      severity: "warning",
    });
    return { readiness: "NOT_YET_PACKAGEABLE", issues };
  }

  if (input.songAnalysisStatus === "FAILED") {
    issues.push({ code: "RADIO_ASSET_ANALYSIS_FAILED", message: "Song analysis failed", severity: "error" });
    return { readiness: "FAILED", issues };
  }
  if (input.songAnalysisStatus === "ANALYZING" || input.songAnalysisStatus === "QUEUED") {
    return { readiness: "ANALYZING", issues };
  }
  if (
    !input.songAnalysisStatus ||
    input.songAnalysisStatus === "NOT_ANALYZED" ||
    input.songAnalysisStatus === "STALE"
  ) {
    issues.push({ code: "RADIO_ASSET_ANALYSIS_MISSING", message: "Source track has not been analyzed yet", severity: "warning" });
    return { readiness: "UNPREPARED", issues };
  }

  // Loop-specific curator approval gate — only meaningful for kind ===
  // "loop", which has an inbox-item-level approval concept (LoopStatus).
  // "track" has no equivalent here: its curator approval is scoped per
  // RadioPlaylistEntry instead (see radioEntryPreparation.ts's
  // computeEntryPreparationState) and is deliberately not re-litigated at
  // this general inbox-readiness level.
  if (input.kind === "loop" && input.loopStatus !== "approved") {
    issues.push({ code: "RADIO_ASSET_LOOP_NOT_APPROVED", message: "Loop is not yet approved", severity: "warning" });
    return { readiness: "NEEDS_REVIEW", issues };
  }

  return { readiness: "READY", issues };
}

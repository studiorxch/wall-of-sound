import type { Track } from "../data/trackTypes";
import type { CrateRecord } from "../data/crateTypes";
import type { PlaylistRecord } from "../data/playProjectTypes";
import type { MetadataImportRecord } from "../data/metadataSourceTypes";
import { computeExternalCoverage, getTracksMissingAnalysis } from "./externalCoverage";
import { detectExternalIdentityIssues, groupIdentityIssues } from "./externalIdentityIssues";
import { detectBatchAnalysisTrust, type BatchAnalysisTrustReport } from "./analysisTrustChecks";
import { summarizeIntakeReadiness, type IntakeReadinessSummary } from "./intakeReadiness";

export type HealthGrade = "EXCELLENT" | "USABLE" | "PROVISIONAL" | "WEAK" | "BLOCKED";

export type LibraryHealthSummary = {
  overallGrade: HealthGrade;
  openIssueCount: number;
  missingAnalysisCount: number;
  identityIssueCount: number;
  pathIssueCount: number;
  unmatchedImportCount: number;
  fileQualityWarningCount: number;
  stalePlaylistOptionCount: number;
  latestImportSummary?: {
    importedAt: string;
    sourceFileName: string;
    matchedRows: number;
    unmatchedRows: number;
    appliedFields: number;
  };
  // Intake readiness (0705Q)
  intakeReadiness?: IntakeReadinessSummary;
  batchTrust?: BatchAnalysisTrustReport;
};

export function computeOpenIssueCount(
  externalTracks: Track[],
  unmatchedImportRows: { filename?: string }[],
  ignoredIssueIds: string[],
  deferredIssueIds: string[],
): number {
  const issues = detectExternalIdentityIssues(externalTracks, unmatchedImportRows as any);
  const ignoredSet = new Set(ignoredIssueIds);
  const deferredSet = new Set(deferredIssueIds);
  const groups = groupIdentityIssues(issues, ignoredSet, deferredSet);
  return groups.blocking.length + groups.warnings.length + groups.unmatched.length;
}

export function computeHealthGrade(
  summary: Omit<LibraryHealthSummary, "overallGrade">,
): HealthGrade {
  const { openIssueCount, missingAnalysisCount, pathIssueCount } = summary;

  if (pathIssueCount > 10 || openIssueCount > 50) return "BLOCKED";
  if (pathIssueCount > 0 || openIssueCount > 20) return "WEAK";
  if (missingAnalysisCount > 20 || openIssueCount > 5) return "PROVISIONAL";
  if (missingAnalysisCount > 0 || openIssueCount > 0) return "USABLE";
  return "EXCELLENT";
}

export function computeLibraryHealthSummary(
  externalTracks: Track[],
  libraryTracks: Track[],
  crates: CrateRecord[],
  playlists: PlaylistRecord[],
  latestImport: MetadataImportRecord | undefined,
  ignoredIssueIds: string[],
  deferredIssueIds: string[],
): LibraryHealthSummary {
  const unmatchedRows = latestImport?.unmatchedRows_detail ?? [];
  const issues = detectExternalIdentityIssues(externalTracks, unmatchedRows);
  const ignoredSet = new Set(ignoredIssueIds);
  const deferredSet = new Set(deferredIssueIds);
  const groups = groupIdentityIssues(issues, ignoredSet, deferredSet);

  const missingTracks = getTracksMissingAnalysis(externalTracks, crates, libraryTracks);

  const stalePlaylistOptionCount = playlists.reduce(
    (sum, pl) => sum + (pl.metadataRepairImpact?.staleOptionCount ?? 0),
    0,
  );

  const coverage = computeExternalCoverage(externalTracks, latestImport);

  const openIssueCount = groups.blocking.length + groups.warnings.length + groups.unmatched.length;
  const pathIssueCount = groups.pathIssues.length;
  const identityIssueCount = groups.titleArtist.length + groups.blocking.length;
  const unmatchedImportCount = groups.unmatched.length;
  const missingAnalysisCount = missingTracks.length;

  const partialSummary = {
    openIssueCount,
    missingAnalysisCount,
    identityIssueCount,
    pathIssueCount,
    unmatchedImportCount,
    fileQualityWarningCount: 0,
    stalePlaylistOptionCount,
  };

  const overallGrade = computeHealthGrade(partialSummary);

  const latestImportSummary = coverage.latestImport
    ? {
        importedAt: coverage.latestImport.importedAt,
        sourceFileName: coverage.latestImport.sourceFileName,
        matchedRows: coverage.latestImport.matchedRows,
        unmatchedRows: coverage.latestImport.unmatchedRows ?? unmatchedRows.length,
        appliedFields: coverage.latestImport.appliedFields,
      }
    : undefined;

  const intakeReadiness = summarizeIntakeReadiness([...externalTracks, ...libraryTracks]);
  const batchTrust = detectBatchAnalysisTrust(externalTracks);

  return {
    overallGrade,
    ...partialSummary,
    latestImportSummary,
    intakeReadiness,
    batchTrust,
  };
}

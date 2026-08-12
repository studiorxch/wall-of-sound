// Suno Library — collection overview (spec §10.1).

import { useRef, useState } from "react";
import type { SunoListeningRecord, SunoLibraryImportResult } from "../../data/sunoLibraryTypes";
import type { SunoTrainingExclusionBuildResult } from "../../data/sunoTrainingExclusionTypes";
import { computeOverviewStats } from "../../logic/sunoLibrary/selectors";

type LoadedResult = Extract<SunoLibraryImportResult, { status: "PASS" | "PASS_WITH_LIMITATION" }>;

export interface SunoLibraryOverviewProps {
  result: LoadedResult;
  listeningRecordsByCanonicalId: Map<string, SunoListeningRecord>;
  archiveOnline: boolean | null;
  // 0812C — null while the exclusion authority hasn't finished computing.
  exclusionResult: SunoTrainingExclusionBuildResult | null;
  onOpenWorkspace: (workspaceSlug: string) => void;
  onOpenAllRecordings: () => void;
  onExportReviews: () => void;
  onImportReviewsFile: (jsonText: string) => string | null;
  onExportTrainingExclusions: () => void;
}

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

export function SunoLibraryOverview({
  result,
  listeningRecordsByCanonicalId,
  archiveOnline,
  exclusionResult,
  onOpenWorkspace,
  onOpenAllRecordings,
  onExportReviews,
  onImportReviewsFile,
  onExportTrainingExclusions,
}: SunoLibraryOverviewProps) {
  const stats = computeOverviewStats(result, listeningRecordsByCanonicalId);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);

  function handleFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then((text) => {
      const error = onImportReviewsFile(text);
      setImportError(error);
    });
    e.target.value = "";
  }

  const workspacesSorted = [...result.workspaces].sort((a, b) => a.workspaceNameOriginal.localeCompare(b.workspaceNameOriginal));

  return (
    <div className="suno-overview">
      <div className="suno-overview-header">
        <h1 className="suno-overview-title">Suno Library</h1>
        <div className="suno-overview-snapshot">
          Snapshot <strong>{stats.snapshotId}</strong> — captured {stats.capturedAt.slice(0, 10)}
        </div>
        <div className={`suno-archive-status suno-archive-status--${archiveOnline === null ? "checking" : archiveOnline ? "online" : "offline"}`}>
          {archiveOnline === null ? "Checking archive…" : archiveOnline ? "Archive online" : "Archive offline"}
        </div>
      </div>

      <div className="suno-overview-stats">
        <div className="suno-stat">
          <span className="suno-stat-value">{stats.encodedLocationCount.toLocaleString()}</span>
          <span className="suno-stat-label">encoded locations</span>
        </div>
        <div className="suno-stat">
          <span className="suno-stat-value">{stats.canonicalRecordingCount.toLocaleString()}</span>
          <span className="suno-stat-label">canonical recordings</span>
        </div>
        <div className="suno-stat">
          <span className="suno-stat-value">{stats.workspaceCount}</span>
          <span className="suno-stat-label">workspaces</span>
        </div>
        <div className="suno-stat">
          <span className="suno-stat-value">{stats.batchCount}</span>
          <span className="suno-stat-label">batches</span>
        </div>
        <div className="suno-stat">
          <span className="suno-stat-value">{formatDuration(stats.totalDurationSeconds)}</span>
          <span className="suno-stat-label">total duration</span>
        </div>
        <div className="suno-stat">
          <span className="suno-stat-value">{stats.uuidLinkedCount.toLocaleString()}</span>
          <span className="suno-stat-label">UUID-linked</span>
        </div>
        <div className="suno-stat">
          <span className="suno-stat-value">{stats.legacyNoIdCount.toLocaleString()}</span>
          <span className="suno-stat-label">legacy (no ID)</span>
        </div>
        <div className="suno-stat">
          <span className="suno-stat-value">{stats.exactDuplicateGroupCount.toLocaleString()}</span>
          <span className="suno-stat-label">exact-duplicate groups</span>
        </div>
        <div className="suno-stat">
          <span className="suno-stat-value">{stats.alternateEncodingGroupCount}</span>
          <span className="suno-stat-label">alternate-encoding groups</span>
        </div>
        <div className="suno-stat">
          <span className="suno-stat-value">
            {stats.reviewedCount.toLocaleString()} / {stats.canonicalRecordingCount.toLocaleString()}
          </span>
          <span className="suno-stat-label">reviewed</span>
        </div>
      </div>

      <div className="suno-overview-asset-kinds">
        <h2 className="suno-section-heading">Asset kinds</h2>
        <div className="suno-asset-kind-row">
          {(Object.entries(stats.assetKindDistribution) as [string, number][]).map(([kind, count]) => (
            <span key={kind} className="suno-asset-kind-chip">
              {kind}: {count.toLocaleString()}
            </span>
          ))}
        </div>
      </div>

      <div className="suno-overview-reviews">
        <h2 className="suno-section-heading">Reviews</h2>
        <div className="suno-review-actions">
          <button type="button" className="suno-btn" onClick={onExportReviews}>
            Export reviews (JSON)
          </button>
          <button type="button" className="suno-btn" onClick={() => fileInputRef.current?.click()}>
            Import reviews (JSON)
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            className="suno-hidden-file-input"
            onChange={handleFileChosen}
            aria-label="Import Suno Library reviews JSON file"
          />
        </div>
        {importError && <div className="suno-import-error" role="alert">{importError}</div>}
      </div>

      {exclusionResult && exclusionResult.status === "PASS" && (
        <div className="suno-overview-exclusions">
          <h2 className="suno-section-heading">Training eligibility</h2>
          <div className="suno-exclusion-stats">
            <div className="suno-stat">
              <span className="suno-stat-value">{exclusionResult.excludedEncodedLocationCount.toLocaleString()}</span>
              <span className="suno-stat-label">encoded locations excluded</span>
            </div>
            <div className="suno-stat">
              <span className="suno-stat-value">{exclusionResult.excludedCanonicalRecordingCount.toLocaleString()}</span>
              <span className="suno-stat-label">canonical recordings excluded</span>
            </div>
            <div className="suno-stat">
              <span className="suno-stat-value">{exclusionResult.workspaceAuthority.length}</span>
              <span className="suno-stat-label">excluded workspaces</span>
            </div>
          </div>
          <button type="button" className="suno-btn" onClick={onExportTrainingExclusions}>
            Export eligibility report (JSON + CSV)
          </button>
        </div>
      )}

      <div className="suno-overview-workspaces">
        <h2 className="suno-section-heading">Workspaces</h2>
        <button type="button" className="suno-btn suno-browse-all-btn" onClick={onOpenAllRecordings}>
          Browse all {stats.canonicalRecordingCount.toLocaleString()} recordings
        </button>
        <div className="suno-workspace-list">
          {workspacesSorted.map((w) => (
            <button
              key={w.workspaceSlug}
              type="button"
              className="suno-workspace-row"
              onClick={() => onOpenWorkspace(w.workspaceSlug)}
            >
              <span className="suno-workspace-row-name">{w.workspaceNameOriginal}</span>
              <span className="suno-workspace-row-count">{w.encodedLocationCount.toLocaleString()} locations · {w.batchCount} batches</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// Suno Library — workspace/batch/all-recordings browser with search,
// filters, and a hand-rolled virtualized row list (spec §7.3/§10.3: 8,381
// locations must not freeze the interface; reuses the same windowing
// utility Radio's multi-track prep stack already established — no new
// dependency).

import { useMemo, useState } from "react";
import type {
  SunoBatch,
  SunoCanonicalRecording,
  SunoEncodedLocation,
  SunoLibraryImportResult,
  SunoListeningRecord,
  SunoWorkspace,
} from "../../data/sunoLibraryTypes";
import {
  batchesForWorkspace,
  canonicalRecordingsForBatch,
  canonicalRecordingsForWorkspace,
} from "../../logic/sunoLibrary/selectors";
import { applySunoSearchAndFilters, EMPTY_SUNO_SEARCH_FILTERS, type SunoSearchFilters } from "../../logic/sunoLibrary/search";
import { computeVisibleRowRange } from "../../logic/radio/radioRowWindowing";

type LoadedResult = Extract<SunoLibraryImportResult, { status: "PASS" | "PASS_WITH_LIMITATION" }>;

export type SunoBrowseNavState =
  | { level: "all" }
  | { level: "workspace"; workspaceSlug: string }
  | { level: "batch"; workspaceSlug: string; batchId: string };

export interface SunoWorkspaceBrowserProps {
  result: LoadedResult;
  nav: SunoBrowseNavState;
  locationsById: Map<string, SunoEncodedLocation>;
  workspacesBySlug: Map<string, SunoWorkspace>;
  batchesById: Map<string, SunoBatch>;
  listeningRecordsByCanonicalId: Map<string, SunoListeningRecord>;
  archiveOnline: boolean | null;
  // 0812C — null while the exclusion authority hasn't finished computing.
  excludedCanonicalRecordingIds: ReadonlySet<string> | null;
  onOpenBatch: (workspaceSlug: string, batchId: string) => void;
  onOpenRecording: (canonicalRecordingId: string) => void;
  onBack: () => void;
  onBackToWorkspace: (workspaceSlug: string) => void;
}

const ROW_HEIGHT = 56;
const CONTAINER_HEIGHT = 520;
const OVERSCAN = 6;

function titleFor(canonical: SunoCanonicalRecording, locationsById: Map<string, SunoEncodedLocation>): string {
  if (canonical.primaryTitleGuess) return canonical.primaryTitleGuess;
  const first = locationsById.get(canonical.encodedLocationIds[0]);
  return first?.filename ?? canonical.canonicalRecordingId;
}

export function SunoWorkspaceBrowser(props: SunoWorkspaceBrowserProps) {
  const { result, nav, locationsById, workspacesBySlug, batchesById } = props;
  const workspace = nav.level !== "all" ? workspacesBySlug.get(nav.workspaceSlug) : undefined;
  const [showAllWorkspaceRecordings, setShowAllWorkspaceRecordings] = useState(nav.level !== "workspace");
  const [filters, setFilters] = useState<SunoSearchFilters>(EMPTY_SUNO_SEARCH_FILTERS);
  const [scrollTop, setScrollTop] = useState(0);

  const batches = useMemo(
    () => (nav.level !== "all" ? batchesForWorkspace(result.batches, nav.workspaceSlug) : []),
    [result.batches, nav],
  );

  const scopedRecordings = useMemo(() => {
    if (nav.level === "all") return result.canonicalRecordings;
    if (nav.level === "batch") return canonicalRecordingsForBatch(result.canonicalRecordings, locationsById, nav.batchId);
    if (showAllWorkspaceRecordings) return canonicalRecordingsForWorkspace(result.canonicalRecordings, nav.workspaceSlug);
    return [];
  }, [nav, result.canonicalRecordings, locationsById, showAllWorkspaceRecordings]);

  const filteredRecordings = useMemo(
    () =>
      applySunoSearchAndFilters(
        scopedRecordings,
        locationsById,
        props.listeningRecordsByCanonicalId,
        filters,
        props.excludedCanonicalRecordingIds,
      ),
    [scopedRecordings, locationsById, props.listeningRecordsByCanonicalId, filters, props.excludedCanonicalRecordingIds],
  );

  const range = computeVisibleRowRange(scrollTop, CONTAINER_HEIGHT, ROW_HEIGHT, filteredRecordings.length, OVERSCAN);
  const visibleRecordings = filteredRecordings.slice(range.startIndex, range.endIndex);

  const showingTable = nav.level === "all" || nav.level === "batch" || showAllWorkspaceRecordings;

  return (
    <div className="suno-workspace-browser">
      <div className="suno-breadcrumb">
        <button type="button" className="suno-breadcrumb-link" onClick={props.onBack}>
          Suno Library
        </button>
        {nav.level === "all" && (
          <>
            <span className="suno-breadcrumb-sep">/</span>
            <span className="suno-breadcrumb-current">All recordings</span>
          </>
        )}
        {nav.level !== "all" && (
          <>
            <span className="suno-breadcrumb-sep">/</span>
            {nav.level === "batch" ? (
              <button type="button" className="suno-breadcrumb-link" onClick={() => props.onBackToWorkspace(nav.workspaceSlug)}>
                {workspace?.workspaceNameOriginal ?? nav.workspaceSlug}
              </button>
            ) : (
              <span className="suno-breadcrumb-current">{workspace?.workspaceNameOriginal ?? nav.workspaceSlug}</span>
            )}
          </>
        )}
        {nav.level === "batch" && (
          <>
            <span className="suno-breadcrumb-sep">/</span>
            <span className="suno-breadcrumb-current">Batch {batchesById.get(nav.batchId)?.inferredBatchOrdinal ?? ""}</span>
          </>
        )}
      </div>

      {nav.level === "workspace" && (
        <>
          <div className="suno-workspace-toggle">
            <button
              type="button"
              className={`suno-btn${!showAllWorkspaceRecordings ? " suno-btn--active" : ""}`}
              onClick={() => setShowAllWorkspaceRecordings(false)}
            >
              Batches ({batches.length})
            </button>
            <button
              type="button"
              className={`suno-btn${showAllWorkspaceRecordings ? " suno-btn--active" : ""}`}
              onClick={() => setShowAllWorkspaceRecordings(true)}
            >
              All workspace recordings
            </button>
          </div>
          {!showAllWorkspaceRecordings && (
            <div className="suno-batch-list">
              {batches.map((b) => (
                <button key={b.batchId} type="button" className="suno-batch-row" onClick={() => props.onOpenBatch(nav.workspaceSlug, b.batchId)}>
                  <span>Batch {b.inferredBatchOrdinal}</span>
                  <span className="suno-batch-row-meta">{b.audioMemberCount} audio members · {b.zipStatus}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {showingTable && (
        <>
          <SunoSearchAndFilters
            filters={filters}
            onChange={setFilters}
            showWorkspaceFilter={nav.level === "all"}
            workspaces={nav.level === "all" ? result.workspaces : []}
          />
          <div className="suno-result-count">{filteredRecordings.length.toLocaleString()} recording(s)</div>
          <div
            className="suno-recording-table-scroll"
            style={{ height: CONTAINER_HEIGHT, overflowY: "auto" }}
            onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
          >
            <div style={{ height: range.startIndex * ROW_HEIGHT }} />
            {visibleRecordings.map((rec) => {
              const review = props.listeningRecordsByCanonicalId.get(rec.canonicalRecordingId);
              const playable = rec.playableEncodedLocationId !== null;
              const isExcluded = props.excludedCanonicalRecordingIds?.has(rec.canonicalRecordingId) ?? false;
              return (
                <button
                  key={rec.canonicalRecordingId}
                  type="button"
                  className="suno-recording-row"
                  style={{ height: ROW_HEIGHT }}
                  onClick={() => props.onOpenRecording(rec.canonicalRecordingId)}
                >
                  <span className="suno-recording-row-title">{titleFor(rec, locationsById)}</span>
                  <span className="suno-recording-row-meta">
                    {rec.encodedLocationIds.length > 1 ? `${rec.encodedLocationIds.length} locations · ` : ""}
                    {review?.listeningStatus ?? "unheard"}
                    {review?.assetKind && review.assetKind !== "unknown" ? ` · ${review.assetKind}` : ""}
                  </span>
                  <span className="suno-training-excluded-badge" aria-hidden={!isExcluded}>
                    {isExcluded ? "training-excluded" : ""}
                  </span>
                  <span
                    className={`suno-availability-dot suno-availability-dot--${playable && props.archiveOnline !== false ? "online" : "offline"}`}
                    aria-hidden="true"
                  />
                  <span className="suno-availability-label">
                    {!playable ? "unavailable" : props.archiveOnline === false ? "archive offline" : "playable"}
                  </span>
                </button>
              );
            })}
            <div style={{ height: (filteredRecordings.length - range.endIndex) * ROW_HEIGHT }} />
          </div>
        </>
      )}
    </div>
  );
}

function SunoSearchAndFilters({
  filters,
  onChange,
  showWorkspaceFilter,
  workspaces,
}: {
  filters: SunoSearchFilters;
  onChange: (next: SunoSearchFilters) => void;
  showWorkspaceFilter: boolean;
  workspaces: SunoWorkspace[];
}) {
  const anyActive =
    filters.queryText ||
    filters.workspaceSlug ||
    filters.listeningStatus ||
    filters.favoriteOnly ||
    filters.assetKind ||
    filters.uuidAvailability ||
    filters.audioAvailability ||
    filters.codecOrContainer ||
    filters.duplicateRelationship ||
    filters.suggestedUse ||
    filters.trainingEligibility;

  return (
    <div className="suno-filters">
      <input
        type="search"
        className="suno-search-input"
        placeholder="Search title, filename, UUID, notes…"
        value={filters.queryText}
        aria-label="Search Suno Library recordings"
        onChange={(e) => onChange({ ...filters, queryText: e.target.value })}
      />
      {showWorkspaceFilter && (
        <select
          className="suno-filter-select"
          aria-label="Filter by workspace"
          value={filters.workspaceSlug ?? ""}
          onChange={(e) => onChange({ ...filters, workspaceSlug: e.target.value || null })}
        >
          <option value="">Any workspace</option>
          {[...workspaces]
            .sort((a, b) => a.workspaceNameOriginal.localeCompare(b.workspaceNameOriginal))
            .map((w) => (
              <option key={w.workspaceSlug} value={w.workspaceSlug}>
                {w.workspaceNameOriginal}
              </option>
            ))}
        </select>
      )}
      <select
        className="suno-filter-select"
        aria-label="Filter by listening status"
        value={filters.listeningStatus ?? ""}
        onChange={(e) => onChange({ ...filters, listeningStatus: (e.target.value || null) as SunoSearchFilters["listeningStatus"] })}
      >
        <option value="">Any listening status</option>
        <option value="unheard">Unheard</option>
        <option value="heard">Heard</option>
        <option value="favorite">Favorite</option>
        <option value="revisit">Revisit</option>
        <option value="reject">Reject</option>
      </select>
      <label className="suno-filter-checkbox">
        <input
          type="checkbox"
          checked={filters.favoriteOnly}
          onChange={(e) => onChange({ ...filters, favoriteOnly: e.target.checked })}
        />
        Favorites only
      </label>
      <select
        className="suno-filter-select"
        aria-label="Filter by asset kind"
        value={filters.assetKind ?? ""}
        onChange={(e) => onChange({ ...filters, assetKind: (e.target.value || null) as SunoSearchFilters["assetKind"] })}
      >
        <option value="">Any asset kind</option>
        {["unknown", "song", "sound", "loop", "environment", "transition", "voice", "stem"].map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
      </select>
      <select
        className="suno-filter-select"
        aria-label="Filter by UUID availability"
        value={filters.uuidAvailability ?? ""}
        onChange={(e) => onChange({ ...filters, uuidAvailability: (e.target.value || null) as SunoSearchFilters["uuidAvailability"] })}
      >
        <option value="">UUID: any</option>
        <option value="uuid-available">UUID available</option>
        <option value="legacy-no-id">Legacy, no ID</option>
      </select>
      <select
        className="suno-filter-select"
        aria-label="Filter by audio availability"
        value={filters.audioAvailability ?? ""}
        onChange={(e) => onChange({ ...filters, audioAvailability: (e.target.value || null) as SunoSearchFilters["audioAvailability"] })}
      >
        <option value="">Audio: any</option>
        <option value="online">Audio online</option>
        <option value="unavailable">Audio unavailable</option>
      </select>
      <input
        type="text"
        className="suno-filter-text"
        placeholder="Codec/container contains…"
        aria-label="Filter by codec or container"
        value={filters.codecOrContainer ?? ""}
        onChange={(e) => onChange({ ...filters, codecOrContainer: e.target.value || null })}
      />
      <select
        className="suno-filter-select"
        aria-label="Filter by duplicate relationship"
        value={filters.duplicateRelationship ?? ""}
        onChange={(e) => onChange({ ...filters, duplicateRelationship: (e.target.value || null) as SunoSearchFilters["duplicateRelationship"] })}
      >
        <option value="">Duplicate relationship: any</option>
        <option value="none">None</option>
        <option value="exact-file-duplicate">Exact duplicate</option>
        <option value="same-suno-asset-alternate-encoding">Alternate encoding</option>
        <option value="identity-conflict">Identity conflict</option>
      </select>
      <select
        className="suno-filter-select"
        aria-label="Filter by suggested use"
        value={filters.suggestedUse ?? ""}
        onChange={(e) => onChange({ ...filters, suggestedUse: (e.target.value || null) as SunoSearchFilters["suggestedUse"] })}
      >
        <option value="">Suggested use: any</option>
        {["radio", "podcast", "video", "maps", "glyph", "resident-reference", "loop-source", "editing-source", "release-candidate", "research", "none"].map(
          (u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ),
        )}
      </select>
      <select
        className="suno-filter-select"
        aria-label="Filter by training eligibility"
        value={filters.trainingEligibility ?? ""}
        onChange={(e) => onChange({ ...filters, trainingEligibility: (e.target.value || null) as SunoSearchFilters["trainingEligibility"] })}
      >
        <option value="">Training eligibility: any</option>
        <option value="eligible">Eligible</option>
        <option value="excluded">Excluded</option>
        <option value="unreviewed">Unreviewed</option>
      </select>
      {anyActive && (
        <button type="button" className="suno-btn suno-btn--clear" onClick={() => onChange({ ...EMPTY_SUNO_SEARCH_FILTERS })}>
          Clear filters
        </button>
      )}
    </div>
  );
}

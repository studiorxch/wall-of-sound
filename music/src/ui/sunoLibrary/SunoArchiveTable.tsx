// Suno Archive Readiness Dashboard (Phase 1) + Suno → Common MUSIC
// Intelligence Adapter (Phase 2) + Suno Library Parity Repair.
//
// Parity repair: this table now inherits the standard MUSIC library
// interaction shell (row playback through the shared transport, row
// selection via the exact same librarySelection.ts every other library
// uses, sortable column headers, a real Columns… picker) instead of a
// separate interaction model — while keeping every Suno-specific dashboard
// card and column exactly as Phase 1/2 built them. See the parity repair's
// completion report for the full audit.
//
// Reuses, unchanged: the existing filter set (SunoSearchAndFilters,
// search.ts), the existing row-windowing utility (radioRowWindowing.ts —
// same one SunoWorkspaceBrowser already uses for the same 6,925-row scale),
// titleFor(), librarySelection.ts (generic, string-id based — zero
// modification needed), and the recording-detail navigation.

import { useMemo, useState } from "react";
import type {
  SunoAnalysisRecord,
  SunoCanonicalRecording,
  SunoEncodedLocation,
  SunoLibraryImportResult,
  SunoListeningRecord,
  SunoListeningStatus,
  SunoWorkspace,
} from "../../data/sunoLibraryTypes";
import type { PlaybackStatus } from "../../data/playbackTypes";
import type { TrackRating } from "../../data/trackTypes";
import { applySunoSearchAndFilters, EMPTY_SUNO_SEARCH_FILTERS, type SunoSearchFilters } from "../../logic/sunoLibrary/search";
import { computeVisibleRowRange } from "../../logic/radio/radioRowWindowing";
import {
  computeSunoArchiveReadinessSummary,
  applySunoReadinessFilter,
  findWavLocationId,
  findOpusLocationId,
  type SunoReadinessFilterKey,
} from "../../logic/sunoLibrary/assetReadiness";
import { revealSunoAssetInFinder } from "../../logic/sunoLibrary/sunoAssetReveal";
import { classifySunoRecording, applySunoSongSoundFilter, type SunoSongSoundClass } from "../../logic/sunoLibrary/sunoSongSoundClassification";
import { cycleSunoSort, applySunoSort, type SunoSortKey } from "../../logic/sunoLibrary/sunoSorting";
import {
  emptyLibrarySelectionState,
  resolvePointerSelect,
  resolveHeaderCheckboxToggle,
  resolveSelectAllVisible,
  clearLibrarySelection,
  moveLibraryFocus,
  toggleFocusedLibrarySelection,
  extendLibrarySelectionFromFocus,
} from "../../logic/library/librarySelection";
import { SunoSearchAndFilters, titleFor } from "./SunoWorkspaceBrowser";
import { SunoColumnsPanel, type SunoColumnDef } from "./SunoColumnsPanel";
import { LibraryBreadcrumb } from "../library/LibraryBreadcrumb";

type LoadedResult = Extract<SunoLibraryImportResult, { status: "PASS" | "PASS_WITH_LIMITATION" }>;

export interface SunoArchiveTableProps {
  result: LoadedResult;
  locationsById: Map<string, SunoEncodedLocation>;
  workspacesBySlug: Map<string, SunoWorkspace>;
  listeningRecordsByCanonicalId: Map<string, SunoListeningRecord>;
  analysisByCanonicalId: Map<string, SunoAnalysisRecord>;
  excludedCanonicalRecordingIds: ReadonlySet<string> | null;
  onOpenRecording: (canonicalRecordingId: string) => void;
  onAnalyzeRecordings: (
    canonicalRecordingIds: string[],
    opts?: { onProgress?: (done: number, total: number) => void; onPersisting?: () => void; force?: boolean },
  ) => Promise<{ total: number; skipped: number; succeeded: number; failed: number }>;
  onBack: () => void;
  // Parity repair — row playback through the shared MUSIC transport.
  auditionTrackId: string | null;
  playbackStatus: PlaybackStatus;
  onAuditionExternal: (meta: { trackId: string; title: string; artist: string; bpm?: number; camelotKey?: string; energy?: number }, audioUrl: string) => void;
  onPauseTrack: () => void;
  onResumeTrack: () => void;
  onSetRating: (canonicalRecordingId: string, snapshotId: string, rating: TrackRating) => void;
}

const ROW_HEIGHT = 34;
const CONTAINER_HEIGHT = 520;
const OVERSCAN = 8;

const DASH = <span className="suno-cell-dim suno-cell-empty">—</span>;

const SUNO_COLUMN_DEFS: SunoColumnDef[] = [
  { id: "duration", label: "Duration" },
  { id: "rating", label: "Rating" },
  { id: "type", label: "Type" },
  { id: "mood", label: "Mood" },
  { id: "suggested", label: "Suggested" },
  { id: "mechanism", label: "Mechanism" },
  { id: "group", label: "Group" },
  { id: "genre", label: "Genre" },
  { id: "bpm", label: "BPM" },
  { id: "key", label: "Key" },
  { id: "energy", label: "Energy" },
  { id: "wav", label: "WAV" },
  { id: "opus", label: "Opus" },
  { id: "uuid", label: "UUID" },
  { id: "listening", label: "Listening Status" },
];
const DEFAULT_COLUMN_ORDER = SUNO_COLUMN_DEFS.map((c) => c.id);
const SORTABLE_COLUMNS = new Set(["duration", "rating", "type", "group", "bpm", "key", "energy", "wav", "opus", "uuid", "listening"]);

// Same canonical duration authority the Song/Sound classifier uses
// (SunoCanonicalRecording.totalDurationSeconds) — presentation only, no
// second duration source or fallback.
function formatDurationCompact(totalDurationSeconds: number): string {
  if (!Number.isFinite(totalDurationSeconds) || totalDurationSeconds < 0) return "—";
  const m = Math.floor(totalDurationSeconds / 60);
  const s = Math.floor(totalDurationSeconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
const SONG_SOUND_LABEL: Record<SunoSongSoundClass, string> = { song: "Song", sound: "Sound", unresolved: "Unresolved" };
const INTEL_COLUMNS = new Set(["mood", "suggested", "mechanism", "genre", "bpm", "key", "energy"]);

function groupFor(rec: SunoCanonicalRecording, workspacesBySlug: Map<string, SunoWorkspace>): string {
  const slug = rec.workspaceSlugs[0];
  if (!slug) return "—";
  return workspacesBySlug.get(slug)?.workspaceNameOriginal ?? slug;
}

function listenLabel(status: SunoListeningStatus | undefined): string {
  return status ?? "unheard";
}

function joinedChips(values: string[] | undefined, max = 3): string {
  if (!values || values.length === 0) return "—";
  const shown = values.slice(0, max).join(", ");
  return values.length > max ? `${shown} +${values.length - max}` : shown;
}

function IntelCell({ record, render }: { record: SunoAnalysisRecord | undefined; render: (r: SunoAnalysisRecord) => string }) {
  const status = record?.analysisStatus;
  if (status === "queued") return <span className="cell-dim suno-cell-dim">queued</span>;
  if (status === "analyzing") return <span className="cell-dim suno-cell-dim">analyzing…</span>;
  if ((status === "analyzed" || status === "partial") && record) {
    const text = render(record);
    return text ? <span title={text}>{text}</span> : DASH;
  }
  return DASH;
}

export function SunoArchiveTable(props: SunoArchiveTableProps) {
  const { result, locationsById, workspacesBySlug, listeningRecordsByCanonicalId, analysisByCanonicalId } = props;
  const [filters, setFilters] = useState<SunoSearchFilters>(EMPTY_SUNO_SEARCH_FILTERS);
  const [readinessFilter, setReadinessFilter] = useState<SunoReadinessFilterKey | null>(null);
  const [songSoundFilter, setSongSoundFilter] = useState<SunoSongSoundClass | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [revealStatus, setRevealStatus] = useState<string | null>(null);
  const [analyzeBusy, setAnalyzeBusy] = useState(false);
  const [analyzePersisting, setAnalyzePersisting] = useState(false);
  const [analyzeProgress, setAnalyzeProgress] = useState<{ done: number; total: number } | null>(null);
  const [analyzeSummary, setAnalyzeSummary] = useState<{ total: number; skipped: number; succeeded: number; failed: number } | null>(null);
  const [selection, setSelection] = useState(emptyLibrarySelectionState());
  const [sortKey, setSortKey] = useState<SunoSortKey | null>(null);
  const [columnOrder, setColumnOrder] = useState<string[]>(DEFAULT_COLUMN_ORDER);
  const [hiddenColumns, setHiddenColumns] = useState<ReadonlySet<string>>(new Set());
  const [showColumnsPanel, setShowColumnsPanel] = useState(false);

  const readinessSummary = useMemo(
    () => computeSunoArchiveReadinessSummary(result.canonicalRecordings, locationsById, result.duplicateRelationships),
    [result.canonicalRecordings, locationsById, result.duplicateRelationships],
  );

  const searchFiltered = useMemo(
    () =>
      applySunoSearchAndFilters(
        result.canonicalRecordings,
        locationsById,
        listeningRecordsByCanonicalId,
        filters,
        props.excludedCanonicalRecordingIds,
      ),
    [result.canonicalRecordings, locationsById, listeningRecordsByCanonicalId, filters, props.excludedCanonicalRecordingIds],
  );

  const readinessFiltered = useMemo(
    () => applySunoReadinessFilter(searchFiltered, locationsById, readinessFilter),
    [searchFiltered, locationsById, readinessFilter],
  );

  // 0827_MUSIC_Library_Workspace_Track_Inspector_Rearchitecture Part C — a
  // view-only filter stage, same shape as readinessFilter above. Never
  // mutates result.canonicalRecordings.
  const songSoundFiltered = useMemo(
    () => applySunoSongSoundFilter(readinessFiltered, songSoundFilter),
    [readinessFiltered, songSoundFilter],
  );

  function sortValueFor(rec: SunoCanonicalRecording, columnId: string): string | number | boolean | null {
    const analysis = analysisByCanonicalId.get(rec.canonicalRecordingId);
    const review = listeningRecordsByCanonicalId.get(rec.canonicalRecordingId);
    switch (columnId) {
      case "duration": return rec.totalDurationSeconds;
      case "rating": return review?.rating ?? 0;
      case "title": return titleFor(rec, locationsById).toLowerCase();
      case "group": return groupFor(rec, workspacesBySlug).toLowerCase();
      case "bpm": return analysis?.bpm ?? null;
      case "key": return analysis?.camelotKey ?? null;
      case "energy": return analysis?.energy ?? null;
      case "wav": return findWavLocationId(rec, locationsById) ? 1 : 0;
      case "opus": return findOpusLocationId(rec, locationsById) ? 1 : 0;
      case "uuid": return rec.sunoUuid ? 1 : 0;
      case "listening": return listenLabel(review?.listeningStatus);
      case "type": return classifySunoRecording(rec);
      default: return null;
    }
  }

  const displayedRecordings = useMemo(
    () => applySunoSort(songSoundFiltered, sortKey, sortValueFor),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [songSoundFiltered, sortKey, analysisByCanonicalId, listeningRecordsByCanonicalId, locationsById, workspacesBySlug],
  );
  const displayedIds = useMemo(() => displayedRecordings.map((r) => r.canonicalRecordingId), [displayedRecordings]);

  const range = computeVisibleRowRange(scrollTop, CONTAINER_HEIGHT, ROW_HEIGHT, displayedRecordings.length, OVERSCAN);
  const visibleRecordings = displayedRecordings.slice(range.startIndex, range.endIndex);

  const visibleColumns = columnOrder.filter((id) => !hiddenColumns.has(id));
  const columnCount = 2 + visibleColumns.length; // select-all col + title + configurable columns

  function toggleReadinessFilter(key: SunoReadinessFilterKey) {
    setReadinessFilter((current) => (current === key ? null : key));
  }

  function handleHeaderSortClick(columnId: string) {
    if (!SORTABLE_COLUMNS.has(columnId) && columnId !== "title") return;
    setSortKey((current) => cycleSunoSort(current, columnId));
  }

  async function handleReveal(e: React.MouseEvent, archiveAssetId: string) {
    e.stopPropagation();
    setRevealStatus(null);
    const revealResult = await revealSunoAssetInFinder(archiveAssetId);
    if (!revealResult.ok) {
      const reason =
        revealResult.reason === "unsupported_platform"
          ? "Reveal in Finder is only supported on macOS."
          : revealResult.reason === "not_found"
            ? "That file isn't available on disk right now."
            : "Couldn't reveal that file in Finder.";
      setRevealStatus(reason);
    }
  }

  // 0827 Physical Asset Authority — a format badge plays THAT EXACT
  // archiveAssetId, never rec.playableEncodedLocationId (the format-blind
  // selector the generic row ▶ button uses). Does not touch
  // playableEncodedLocationId or which location is "primary."
  function handleAuditionLocation(e: React.MouseEvent, rec: SunoCanonicalRecording, archiveAssetId: string) {
    e.stopPropagation();
    props.onAuditionExternal(
      {
        trackId: rec.canonicalRecordingId,
        title: titleFor(rec, locationsById),
        artist: groupFor(rec, workspacesBySlug),
        bpm: analysisByCanonicalId.get(rec.canonicalRecordingId)?.bpm ?? undefined,
        camelotKey: analysisByCanonicalId.get(rec.canonicalRecordingId)?.camelotKey ?? undefined,
        energy: analysisByCanonicalId.get(rec.canonicalRecordingId)?.energy ?? undefined,
      },
      `/suno-library-audio/${archiveAssetId}`,
    );
  }

  function handleRowPointerSelect(recordingId: string, e: React.MouseEvent) {
    setSelection((s) => resolvePointerSelect(s, recordingId, displayedIds, { shift: e.shiftKey, alt: e.altKey }));
  }

  function handleGridBackgroundClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) setSelection((s) => clearLibrarySelection(s));
  }

  function handleGridKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
    if (displayedIds.length === 0) return;

    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const dir = e.key === "ArrowDown" ? 1 : -1;
      setSelection((s) => (e.shiftKey ? extendLibrarySelectionFromFocus(s, displayedIds, dir) : moveLibraryFocus(s, displayedIds, dir)));
      return;
    }
    if (e.key === " ") {
      e.preventDefault();
      setSelection((s) => toggleFocusedLibrarySelection(s));
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
      e.preventDefault();
      setSelection((s) => resolveSelectAllVisible(s, displayedIds));
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setSelection((s) => clearLibrarySelection(s));
      return;
    }
    if (e.key === "Enter") {
      if (selection.focusedId) props.onOpenRecording(selection.focusedId);
      return;
    }
  }

  async function runAnalysis(ids: string[], force = false) {
    if (ids.length === 0 || analyzeBusy) return;
    setAnalyzeBusy(true);
    setAnalyzeSummary(null);
    setAnalyzePersisting(false);
    setAnalyzeProgress({ done: 0, total: ids.length });
    try {
      const summary = await props.onAnalyzeRecordings(ids, {
        force,
        onProgress: (done, total) => setAnalyzeProgress({ done, total }),
        onPersisting: () => setAnalyzePersisting(true),
      });
      setAnalyzeSummary(summary);
    } finally {
      setAnalyzeBusy(false);
      setAnalyzePersisting(false);
      setAnalyzeProgress(null);
    }
  }

  function handleToggleColumnVisible(id: string) {
    setHiddenColumns((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function handleMoveColumn(id: string, direction: -1 | 1) {
    setColumnOrder((order) => {
      const idx = order.indexOf(id);
      const target = idx + direction;
      if (idx === -1 || target < 0 || target >= order.length) return order;
      const next = order.slice();
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }
  function handleRestoreDefaultColumns() {
    setColumnOrder(DEFAULT_COLUMN_ORDER);
    setHiddenColumns(new Set());
  }

  function renderSunoCell(columnId: string, rec: SunoCanonicalRecording) {
    const analysis = analysisByCanonicalId.get(rec.canonicalRecordingId);
    const review = listeningRecordsByCanonicalId.get(rec.canonicalRecordingId);
    switch (columnId) {
      case "duration": return <span className="suno-cell-dim">{formatDurationCompact(rec.totalDurationSeconds)}</span>;
      case "rating": {
        const rating: TrackRating = review?.rating ?? 0;
        return (
          <span className="star-rating" onClick={(e) => e.stopPropagation()}>
            {([1, 2, 3, 4, 5] as const).map((n) => (
              <button
                key={n}
                type="button"
                className={`star-btn${n <= rating ? " filled" : ""}${rating >= 4 && n <= rating ? " star-good" : ""}${rating > 0 && rating <= 3 && n <= rating ? " star-bad" : ""}`}
                onClick={() => props.onSetRating(rec.canonicalRecordingId, result.snapshot.snapshotId, n === rating ? 0 : n)}
                title={n === 5 ? "5 — Strong" : n === 4 ? "4 — Good" : `${n} — Problem`}
              >★</button>
            ))}
          </span>
        );
      }
      case "type": {
        const cls = classifySunoRecording(rec);
        return <span className={`suno-type-pill suno-type-pill--${cls}`}>{SONG_SOUND_LABEL[cls]}</span>;
      }
      case "mood": return <IntelCell record={analysis} render={(r) => joinedChips(r.moodTags)} />;
      case "suggested": return <IntelCell record={analysis} render={(r) => joinedChips(r.moodSuggestions)} />;
      case "mechanism": return <IntelCell record={analysis} render={(r) => joinedChips(r.mechanicalMoodTags)} />;
      case "group": return <span className="suno-cell-dim">{groupFor(rec, workspacesBySlug)}</span>;
      case "genre": return DASH;
      case "bpm": return <IntelCell record={analysis} render={(r) => (r.bpm != null ? r.bpm.toFixed(1) : "")} />;
      case "key": return <IntelCell record={analysis} render={(r) => r.camelotKey ?? ""} />;
      case "energy": return <IntelCell record={analysis} render={(r) => (r.energy != null ? r.energy.toFixed(2) : "")} />;
      case "wav": {
        const wavLocationId = findWavLocationId(rec, locationsById);
        return wavLocationId ? (
          <span className="suno-format-badge-group">
            <button type="button" className="suno-readiness-pill suno-readiness-pill--present" title="Play this exact WAV file" onClick={(e) => handleAuditionLocation(e, rec, wavLocationId)}>▶ WAV</button>
            <button type="button" className="suno-readiness-pill suno-readiness-pill--present suno-readiness-pill--reveal" title="Reveal in Finder" onClick={(e) => handleReveal(e, wavLocationId)}>⌕</button>
          </span>
        ) : <span className="suno-readiness-pill suno-readiness-pill--absent">—</span>;
      }
      case "opus": {
        const opusLocationId = findOpusLocationId(rec, locationsById);
        return opusLocationId ? (
          <span className="suno-format-badge-group">
            <button type="button" className="suno-readiness-pill suno-readiness-pill--present" title="Play this exact Opus file" onClick={(e) => handleAuditionLocation(e, rec, opusLocationId)}>▶ Opus</button>
            <button type="button" className="suno-readiness-pill suno-readiness-pill--present suno-readiness-pill--reveal" title="Reveal in Finder" onClick={(e) => handleReveal(e, opusLocationId)}>⌕</button>
          </span>
        ) : <span className="suno-readiness-pill suno-readiness-pill--absent">—</span>;
      }
      case "uuid": return rec.sunoUuid ? (
        <span className="suno-readiness-pill suno-readiness-pill--present">present</span>
      ) : <span className="suno-readiness-pill suno-readiness-pill--absent">—</span>;
      case "listening": {
        const isFavorite = review?.listeningStatus === "favorite";
        return (
          <span className={`suno-status-pill${isFavorite ? " suno-status-pill--favorite" : ""}`}>
            {listenLabel(review?.listeningStatus)}
            {isFavorite && <span className="suno-star-inline">★</span>}
          </span>
        );
      }
      default: return DASH;
    }
  }

  const wavPct = readinessSummary.totalRecordings > 0 ? (readinessSummary.wavPresentCount / readinessSummary.totalRecordings) * 100 : 0;
  const allDisplayedSelected = displayedIds.length > 0 && displayedIds.every((id) => selection.selectedIds.has(id));
  const selectedCount = selection.selectedIds.size;

  return (
    <div className="suno-archive-table-view">
      <LibraryBreadcrumb libraryLabel="Song Library" page="Recordings" onOpenDashboard={props.onBack} />

      <div className="suno-readiness-summary">
        {readinessSummary.totalRecordings.toLocaleString()} Suno recordings archived ·{" "}
        <b>
          {readinessSummary.wavPresentCount.toLocaleString()} have a WAV master on file today ({wavPct.toFixed(1)}%)
        </b>
      </div>

      <div className="suno-readiness-row">
        <div className="suno-readiness-card suno-readiness-card--total">
          <span className="suno-readiness-val">{readinessSummary.totalRecordings.toLocaleString()}</span>
          <span className="suno-readiness-label">Total recordings</span>
        </div>

        <div className="suno-readiness-card suno-readiness-card--pair">
          <div className="suno-readiness-title">WAV</div>
          <button type="button" className={`suno-readiness-half suno-readiness-half--good${readinessFilter === "wav-present" ? " suno-readiness-half--active" : ""}`} onClick={() => toggleReadinessFilter("wav-present")}>
            <span className="suno-readiness-val">{readinessSummary.wavPresentCount.toLocaleString()}</span>
            <span className="suno-readiness-label">Present</span>
          </button>
          <div className="suno-readiness-divider" />
          <button type="button" className={`suno-readiness-half suno-readiness-half--bad${readinessFilter === "wav-missing" ? " suno-readiness-half--active" : ""}`} onClick={() => toggleReadinessFilter("wav-missing")}>
            <span className="suno-readiness-val">{readinessSummary.wavMissingCount.toLocaleString()}</span>
            <span className="suno-readiness-label">Missing</span>
          </button>
        </div>

        <div className="suno-readiness-card suno-readiness-card--pair">
          <div className="suno-readiness-title">Opus</div>
          <button type="button" className={`suno-readiness-half suno-readiness-half--good${readinessFilter === "opus-present" ? " suno-readiness-half--active" : ""}`} onClick={() => toggleReadinessFilter("opus-present")}>
            <span className="suno-readiness-val">{readinessSummary.opusPresentCount.toLocaleString()}</span>
            <span className="suno-readiness-label">Present</span>
          </button>
          <div className="suno-readiness-divider" />
          <button type="button" className={`suno-readiness-half suno-readiness-half--bad${readinessFilter === "opus-missing" ? " suno-readiness-half--active" : ""}`} onClick={() => toggleReadinessFilter("opus-missing")}>
            <span className="suno-readiness-val">{readinessSummary.opusMissingCount.toLocaleString()}</span>
            <span className="suno-readiness-label">Missing</span>
          </button>
        </div>

        <div className="suno-readiness-card suno-readiness-card--pair">
          <div className="suno-readiness-title">UUID</div>
          <button type="button" className={`suno-readiness-half suno-readiness-half--good${readinessFilter === "uuid-present" ? " suno-readiness-half--active" : ""}`} onClick={() => toggleReadinessFilter("uuid-present")}>
            <span className="suno-readiness-val">{readinessSummary.uuidPresentCount.toLocaleString()}</span>
            <span className="suno-readiness-label">Present</span>
          </button>
          <div className="suno-readiness-divider" />
          <button type="button" className={`suno-readiness-half suno-readiness-half--bad${readinessFilter === "uuid-missing" ? " suno-readiness-half--active" : ""}`} onClick={() => toggleReadinessFilter("uuid-missing")}>
            <span className="suno-readiness-val">{readinessSummary.uuidMissingCount.toLocaleString()}</span>
            <span className="suno-readiness-label">Missing</span>
          </button>
        </div>

        <div className="suno-readiness-card suno-readiness-card--pair">
          <div className="suno-readiness-title">Audio</div>
          <button type="button" className={`suno-readiness-half suno-readiness-half--good${readinessFilter === "materialized" ? " suno-readiness-half--active" : ""}`} onClick={() => toggleReadinessFilter("materialized")}>
            <span className="suno-readiness-val">{readinessSummary.materializedCount.toLocaleString()}</span>
            <span className="suno-readiness-label">Materialized</span>
          </button>
          <div className="suno-readiness-divider" />
          <button type="button" className={`suno-readiness-half suno-readiness-half--bad${readinessFilter === "not-materialized" ? " suno-readiness-half--active" : ""}`} onClick={() => toggleReadinessFilter("not-materialized")}>
            <span className="suno-readiness-val">{readinessSummary.notMaterializedCount.toLocaleString()}</span>
            <span className="suno-readiness-label">Not materialized</span>
          </button>
        </div>

        <button type="button" className={`suno-readiness-card suno-readiness-card--single${readinessFilter === "duplicates" ? " suno-readiness-half--active" : ""}`} onClick={() => toggleReadinessFilter("duplicates")}>
          <span className="suno-readiness-val">{readinessSummary.duplicateGroupCount.toLocaleString()}</span>
          <span className="suno-readiness-label">Dup / alt groups</span>
        </button>
      </div>

      <div className="suno-readiness-deferred">
        <span className="suno-readiness-deferred-chip">deferred</span>
        Catalog Match — no trustworthy Suno↔Catalog identity/evidence exists yet; not shown as a column or a card.
      </div>

      <SunoSearchAndFilters
        filters={filters}
        onChange={setFilters}
        showWorkspaceFilter
        workspaces={result.workspaces}
        extraFilters={
          <select
            className="suno-filter-select suno-filter-select--compact"
            aria-label="Filter by Song/Sound type"
            value={songSoundFilter ?? ""}
            onChange={(e) => setSongSoundFilter((e.target.value || null) as SunoSongSoundClass | null)}
          >
            <option value="">Any type</option>
            <option value="song">Song (&ge; 60s)</option>
            <option value="sound">Sound (&lt; 60s)</option>
            <option value="unresolved">Unresolved duration</option>
          </select>
        }
      />

      <div className="suno-intel-note">
        <b>Mood → Energy</b> populate once a recording is analyzed through the same MUSIC intelligence adapter Catalog
        already uses. Genre stays "—" — no automatic classifier exists for genre on any MUSIC track.
      </div>

      <div className="suno-analyze-bar">
        <span className="suno-result-count">{displayedRecordings.length.toLocaleString()} recording(s)</span>
        <button type="button" className="tb-btn sm" onClick={() => setShowColumnsPanel(true)}>Columns…</button>
        <button
          type="button"
          className="tb-btn sm"
          disabled={analyzeBusy || displayedRecordings.length === 0}
          onClick={() => runAnalysis(displayedIds)}
        >
          {analyzeBusy
            ? analyzePersisting
              ? "Saving…"
              : analyzeProgress
                ? `Analyzing… ${analyzeProgress.done.toLocaleString()}/${analyzeProgress.total.toLocaleString()}`
                : "Analyzing…"
            : `Analyze filtered (${displayedRecordings.length.toLocaleString()})`}
        </button>
        {!analyzeBusy && analyzeSummary && (
          <span className="suno-analyze-summary">
            Done — {analyzeSummary.succeeded} analyzed, {analyzeSummary.skipped} already done, {analyzeSummary.failed} failed
          </span>
        )}
        {selectedCount > 0 && (
          <div className="cat-action-bar">
            <div className="cat-action-bar-row">
              <span className="bulk-bar-count">{selectedCount} selected</span>
              {/* 0827_MUSIC_Library_Workspace_Track_Inspector_Rearchitecture
                  §15 — one "Analyze" action; force:true so an explicit
                  selection always gets analyzed-or-reanalyzed (never
                  silently skipped for already being analyzed), matching
                  Catalog/External/Sounds' unified Analyze semantics. This
                  is distinct from "Analyze filtered (N)" below, which
                  deliberately keeps skip-already-good semantics — a real,
                  bounded-batch-safety concern from the Suno Library
                  Integrity Repair, not one of the forbidden "separate
                  button" labels (Missing/Reanalyze/Again) this section
                  bans; it differs by SCOPE (selected vs filtered), not by
                  analyze-vs-reanalyze semantics. */}
              <button type="button" className="tb-btn sm" disabled={analyzeBusy} onClick={() => runAnalysis([...selection.selectedIds], true)}>
                Analyze
              </button>
              <span className="bulk-bar-sep" />
              <button type="button" className="tb-btn sm" onClick={() => setSelection((s) => clearLibrarySelection(s))}>Clear</button>
            </div>
          </div>
        )}
      </div>

      <div
        className="suno-archive-table-wrap"
        style={{ maxHeight: CONTAINER_HEIGHT, overflowY: "auto" }}
        tabIndex={0}
        role="grid"
        aria-multiselectable="true"
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        onKeyDown={handleGridKeyDown}
        onClick={handleGridBackgroundClick}
      >
        <table className="suno-archive-table">
          <thead>
            <tr>
              <th className="suno-col-select">
                <button
                  type="button"
                  className="cat-select-all-btn"
                  aria-pressed={allDisplayedSelected}
                  title={allDisplayedSelected ? "Clear selection" : "Select all visible"}
                  onClick={() => setSelection((s) => resolveHeaderCheckboxToggle(s, displayedIds))}
                >
                  {allDisplayedSelected ? "☑" : "☐"}
                </button>
              </th>
              <th className="suno-col-sortable" onClick={() => handleHeaderSortClick("title")} title="Sort by title">
                Title{sortKey?.columnId === "title" ? (sortKey.direction === "asc" ? " ▲" : " ▼") : ""}
              </th>
              {visibleColumns.map((id) => {
                const def = SUNO_COLUMN_DEFS.find((c) => c.id === id);
                if (!def) return null;
                const sortable = SORTABLE_COLUMNS.has(id);
                const isIntel = INTEL_COLUMNS.has(id);
                return (
                  <th
                    key={id}
                    className={`${isIntel ? "suno-col-intel " : ""}${sortable ? "suno-col-sortable" : ""}`}
                    onClick={sortable ? () => handleHeaderSortClick(id) : undefined}
                    title={
                      id === "genre"
                        ? "Manual/import metadata, same as Catalog — no automatic classifier exists for any track"
                        : isIntel
                          ? "Populated once this recording has been analyzed"
                          : sortable ? `Sort by ${def.label}` : undefined
                    }
                  >
                    {def.label}{sortKey?.columnId === id ? (sortKey.direction === "asc" ? " ▲" : " ▼") : ""}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {range.startIndex > 0 && (
              <tr aria-hidden="true">
                <td colSpan={columnCount} style={{ height: range.startIndex * ROW_HEIGHT, padding: 0, border: "none" }} />
              </tr>
            )}
            {visibleRecordings.map((rec) => {
              const isSelected = selection.selectedIds.has(rec.canonicalRecordingId);
              const isFocused = selection.focusedId === rec.canonicalRecordingId;
              const isCurrent = props.auditionTrackId === rec.canonicalRecordingId;
              const isRowPlaying = isCurrent && props.playbackStatus === "playing";
              const isRowPaused = isCurrent && props.playbackStatus === "paused";
              const materialized = rec.playableEncodedLocationId !== null;
              const analysis = analysisByCanonicalId.get(rec.canonicalRecordingId);
              const title = titleFor(rec, locationsById);
              return (
                <tr
                  key={rec.canonicalRecordingId}
                  className={[
                    isSelected ? "row-selected" : "",
                    isFocused ? "row-focused" : "",
                    isCurrent ? "row-auditioning" : "",
                  ].filter(Boolean).join(" ")}
                  onClick={(e) => handleRowPointerSelect(rec.canonicalRecordingId, e)}
                >
                  <td className="suno-col-select" onClick={(e) => e.stopPropagation()} />
                  <td className="suno-cell-title">
                    <button
                      type="button"
                      className={`tb-btn sm col-play-btn${isCurrent ? " tb-btn-playing" : ""}`}
                      disabled={!materialized}
                      title={materialized ? (isRowPlaying ? "Pause" : "Play") : "No materialized audio available"}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!materialized) return;
                        if (isRowPlaying) { props.onPauseTrack(); return; }
                        if (isRowPaused) { props.onResumeTrack(); return; }
                        props.onAuditionExternal(
                          {
                            trackId: rec.canonicalRecordingId,
                            title,
                            artist: groupFor(rec, workspacesBySlug),
                            bpm: analysis?.bpm ?? undefined,
                            camelotKey: analysis?.camelotKey ?? undefined,
                            energy: analysis?.energy ?? undefined,
                          },
                          `/suno-library-audio/${rec.playableEncodedLocationId}`,
                        );
                      }}
                    >{isRowPlaying ? "⏸" : "▶"}</button>
                    <span className="suno-row-title" title={title} onClick={(e) => { e.stopPropagation(); props.onOpenRecording(rec.canonicalRecordingId); }}>
                      {title}
                    </span>
                  </td>
                  {visibleColumns.map((id) => (
                    <td key={id}>{renderSunoCell(id, rec)}</td>
                  ))}
                </tr>
              );
            })}
            {displayedRecordings.length - range.endIndex > 0 && (
              <tr aria-hidden="true">
                <td colSpan={columnCount} style={{ height: (displayedRecordings.length - range.endIndex) * ROW_HEIGHT, padding: 0, border: "none" }} />
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="suno-archive-table-caption">
        <span>
          Additional fields · Creation Date, Suggested Use, Training Eligibility, Duplicate/Alternate, Materialized
          Audio, Workspace, Suno URL, Codec/Container, Asset Kind, Notes, Labels, Raw provenance — available in the
          recording detail view
        </span>
      </div>
      {revealStatus && <div className="suno-reveal-status suno-reveal-status--error">{revealStatus}</div>}

      {showColumnsPanel && (
        <SunoColumnsPanel
          columns={SUNO_COLUMN_DEFS}
          order={columnOrder}
          hidden={hiddenColumns}
          onToggleVisible={handleToggleColumnVisible}
          onMove={handleMoveColumn}
          onRestoreDefaults={handleRestoreDefaultColumns}
          onClose={() => setShowColumnsPanel(false)}
        />
      )}
    </div>
  );
}

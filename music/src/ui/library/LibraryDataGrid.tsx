// Shared Library data grid — the one interaction layer used by Catalog,
// External, and Sounds: stable ID-based selection, sortable/resizable/
// reorderable/hideable columns, a contextual action bar, full keyboard
// operation, and the private Comments field. Which columns/actions a given
// library exposes is passed in as configuration (libraryGridPreferences +
// the optional action-handler props); the interaction logic itself never
// branches on `sourceKey`.
//
// Row-body Properties: this grid never owns its own "edit dialog" — a row
// click (outside the play button/checkbox/Comments cell) or Enter on the
// focused row calls the caller's `onInspect`, exactly like the pre-existing
// legacy table already did for every library. This keeps exactly one
// "Properties" experience (the Prev/Next-navigable TrackInspector already
// mounted by MainTrackWindow) app-wide, rather than a second, thinner
// editor existing only inside this grid.
//
// Header: exactly one identity+count block (library name, then either
// "N tracks" or, once a filter narrows the view, "N of M tracks") — never
// stacked with a second copy from an outer shell. No numeric row-index
// column: row position isn't track identity, changes under sorting/
// filtering, and the stable trackId-based selection already never depends
// on it.

import { useEffect, useMemo, useRef, useState } from "react";
import type { Track, TrackRating, TrackArchiveStatus } from "../../data/trackTypes";
import type { PlaylistRecord, TrackPlaybackIssue } from "../../data/playProjectTypes";
import type { ExportHealthReport } from "../../logic/exportHealth";
import type { LibraryGridPreferences, LibraryColumnId, LibrarySourceKey } from "../../data/libraryGridTypes";
import { filterTracksByLibraryFilters, buildFilterOptions, type LibraryTrackFilters } from "../../logic/libraryFilters";
import { normalizeTrackGenreTokens } from "../../logic/genreTaxonomy";
import { formatNumber } from "../../logic/dateFormat";
import { TRACK_DRAG_MIME, encodeTrackDrag } from "../../logic/playlistMembership";
import {
  LIBRARY_COLUMN_REGISTRY, getLibraryColumnDef, clampColumnWidth, computeAutoFitWidth,
} from "../../logic/library/libraryColumns";
import { applyLibrarySort, cycleSingleColumnSort, cycleMultiColumnSort, sortPriorityForColumn } from "../../logic/library/librarySorting";
import {
  emptyLibrarySelectionState, resolvePointerSelect, resolveHeaderCheckboxToggle, resolveSelectAllVisible,
  clearLibrarySelection, moveLibraryFocus, toggleFocusedLibrarySelection, extendLibrarySelectionFromFocus,
  type LibrarySelectionState,
} from "../../logic/library/librarySelection";
import { truncateCommentPreview } from "../../logic/library/libraryComments";
import { buildLibraryExportCsv } from "../../logic/library/libraryCsvExport";
import { downloadFile } from "../../data/exportPlaylist";
import { LibraryActionBar } from "./LibraryActionBar";
import { LibraryColumnsPanel } from "./LibraryColumnsPanel";
import { LibraryRemoveConfirmDialog } from "./LibraryRemoveConfirmDialog";
import { LibraryCommentsCell } from "./LibraryCommentsCell";
import { LibraryStemBadge, type StemBadgeState } from "./libraryStemBadge";
import { selectVisibleLibraryTracks } from "../../logic/library/libraryVisibleTracks";
import { resolveTrackAudioIdentifier } from "../../logic/stems/stemClient";

function fmtDur(s: number | undefined | null): string {
  if (s == null || isNaN(s) || s <= 0) return "—";
  return `${Math.floor(s / 60)}:${Math.round(s % 60).toString().padStart(2, "0")}`;
}

function fmtLastPlayed(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const diffMin = (Date.now() - d.getTime()) / 60000;
  if (diffMin < 60) return `${Math.round(diffMin)}m ago`;
  if (diffMin < 1440) return `${Math.round(diffMin / 60)}h ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

let measureCanvasCtx: CanvasRenderingContext2D | null = null;
function measureTextWidth(text: string): number {
  if (!measureCanvasCtx) {
    const canvas = document.createElement("canvas");
    measureCanvasCtx = canvas.getContext("2d");
    if (measureCanvasCtx) measureCanvasCtx.font = "12px sans-serif";
  }
  return measureCanvasCtx ? measureCanvasCtx.measureText(text).width : text.length * 7;
}

function StarRating({ trackId, rating, onChange }: { trackId: string; rating: TrackRating; onChange: (id: string, r: TrackRating) => void }) {
  return (
    <span className="star-rating" onClick={(e) => e.stopPropagation()}>
      {([1, 2, 3, 4, 5] as const).map((n) => (
        <button
          key={n}
          className={`star-btn${n <= rating ? " filled" : ""}`}
          onClick={() => onChange(trackId, n === rating ? 0 : n)}
          title={n === 5 ? "5 — Strong" : n === 4 ? "4 — Good" : `${n} — Problem`}
        >★</button>
      ))}
    </span>
  );
}

interface Props {
  sourceKey: LibrarySourceKey;
  libraryLabel: string; // "Catalog" | "External" | "Sounds"
  unitLabel: string; // "tracks" | "clips"
  tracks: Track[]; // already source-scoped
  excludedTrackIds: Set<string>;
  lockedTrackIds: Set<string>;
  playbackErrors: Map<string, string>;
  trackPlaybackIssues?: Record<string, TrackPlaybackIssue>;
  exportReport: ExportHealthReport | null;
  onExclude: (id: string) => void;
  onRestore: (id: string) => void;
  // Bulk removal — the caller supplies the library-correct handler (e.g.
  // Sounds routes this through a bulk call that also rewrites its on-disk
  // reference index; Catalog/External loop a plain per-track remove).
  onRemoveTracks: (trackIds: string[]) => void;
  onRateTrack: (trackId: string, rating: TrackRating) => void;
  onAuditionTrack?: (trackId: string) => void;
  auditionTrackId?: string | null;
  playbackStatus?: string;
  onPauseTrack?: () => void;
  onResumeTrack?: () => void;
  onBulkUpdate?: (trackIds: string[], patch: Partial<Track>) => void;
  onCreateLibraryGroup?: (trackIds: string[], groupName: string) => void;
  onGenerateMoodSuggestions?: (trackIds?: string[]) => void;
  onApplyMoodSuggestions?: (trackIds: string[]) => void;
  onBulkSetArchiveStatus?: (trackIds: string[], status: TrackArchiveStatus) => void;
  onAnalyzeSelected?: (trackIds: string[]) => void;
  onReanalyze?: (trackIds: string[]) => void;
  musicPlaylists?: PlaylistRecord[];
  onBulkAddTracksToPlaylist?: (playlistId: string, trackIds: string[]) => void;
  onBulkCreatePlaylistFromTracks?: (trackIds: string[]) => void;
  samplerBanks?: PlaylistRecord[];
  loadedSamplerBankId?: string | null;
  onAddTracksToSamplerBank?: (bankId: string, trackIds: string[]) => void;
  onCreateSamplerBankFromTracks?: (title: string, trackIds: string[]) => void;
  onSendTrackToRadio?: (trackId: string) => void;
  onRecheckPlaybackIssue?: (trackId: string) => void;
  onClearPlaybackIssue?: (trackId: string) => void;
  onBulkRecheckCodecIssues?: () => void;
  bulkRechecking?: boolean;
  onInspect: (track: Track, filteredList: Track[], index: number) => void;
  libraryGridPreferences: LibraryGridPreferences;
  onUpdateLibraryGridPreferences: (next: LibraryGridPreferences) => void;
  // 0722C_MUSIC_Production_Stem_Export
  onOpenStems?: (trackId: string) => void;
}

export function LibraryDataGrid(props: Props) {
  const {
    sourceKey, libraryLabel, unitLabel, tracks, excludedTrackIds, lockedTrackIds, playbackErrors, trackPlaybackIssues, exportReport,
    onExclude, onRestore, onRemoveTracks, onRateTrack, onAuditionTrack, auditionTrackId, playbackStatus,
    onPauseTrack, onResumeTrack, onBulkUpdate, onCreateLibraryGroup, onGenerateMoodSuggestions, onApplyMoodSuggestions,
    onBulkSetArchiveStatus, onAnalyzeSelected, onReanalyze,
    musicPlaylists, onBulkAddTracksToPlaylist, onBulkCreatePlaylistFromTracks,
    samplerBanks, loadedSamplerBankId, onAddTracksToSamplerBank, onCreateSamplerBankFromTracks,
    onSendTrackToRadio, onRecheckPlaybackIssue, onClearPlaybackIssue, onBulkRecheckCodecIssues, bulkRechecking,
    onInspect, onOpenStems,
    libraryGridPreferences: prefs, onUpdateLibraryGridPreferences: updatePrefs,
  } = props;

  // 0722C_MUSIC_Production_Stem_Export — a migrated legacy derived-stem
  // track must stop appearing as an ordinary row everywhere; this is the
  // one place (shared by Catalog/External/Sounds) that enforces it.
  const visibleTracks = useMemo(() => selectVisibleLibraryTracks(tracks), [tracks]);

  const [filters, setFilters] = useState<LibraryTrackFilters>({});
  const [selection, setSelection] = useState<LibrarySelectionState>(emptyLibrarySelectionState());
  const [showColumnsPanel, setShowColumnsPanel] = useState(false);
  const [removeConfirmIds, setRemoveConfirmIds] = useState<string[] | null>(null);
  const [editingCommentTrackId, setEditingCommentTrackId] = useState<string | null>(null);
  const [stemBadges, setStemBadges] = useState<Record<string, StemBadgeState>>({});
  // "Has Stems" filter — CURRENT sets only, never outdated/orphaned/
  // unavailable/archived. Evaluated against the live stemBadges state
  // rather than folded into the pure filterTracksByLibraryFilters (which
  // has no live-data dependency by design), so it stays a separate step.
  const [hasStemsFilterOn, setHasStemsFilterOn] = useState(false);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const resizeRef = useRef<{ columnId: LibraryColumnId; startX: number; startWidth: number } | null>(null);
  const [liveResizeWidth, setLiveResizeWidth] = useState<{ columnId: LibraryColumnId; width: number } | null>(null);

  // Batched, cheap (stat-tier, never a decode) badge status — never a
  // persisted "hasStems" flag; re-fetched whenever the visible track set
  // changes (reload, filter, library switch).
  useEffect(() => {
    // Always fetches (even for 0 candidates — the route handles an empty
    // list fine) so every setState call happens inside the async .then()
    // chain, never synchronously in the effect body itself.
    const candidates = visibleTracks
      .map((t) => ({ trackId: t.trackId, audioRelPath: resolveTrackAudioIdentifier(t) }))
      .filter((t): t is { trackId: string; audioRelPath: string } => Boolean(t.audioRelPath));
    let cancelled = false;
    fetch("/stem-badges", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tracks: candidates }) })
      .then((r) => r.json())
      .then((data: { ok: boolean; badges?: Record<string, { lifecycle: string } | null> }) => {
        if (cancelled) return;
        const next: Record<string, StemBadgeState> = {};
        if (data.ok && data.badges) {
          for (const [trackId, badge] of Object.entries(data.badges)) {
            next[trackId] = (badge?.lifecycle as StemBadgeState | undefined) ?? "none";
          }
        }
        setStemBadges(next);
      })
      .catch(() => { /* badges are advisory display only — a fetch failure just shows no badge */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleTracks.map((t) => t.trackId).join(",")]);

  const filterOptions = buildFilterOptions(visibleTracks);
  const filtered = useMemo(() => {
    const base = filterTracksByLibraryFilters(visibleTracks, filters);
    return hasStemsFilterOn ? base.filter((t) => stemBadges[t.trackId] === "current") : base;
  }, [visibleTracks, filters, hasStemsFilterOn, stemBadges]);
  const sorted = useMemo(() => applyLibrarySort(filtered, prefs.sort), [filtered, prefs.sort]);
  const visibleOrderedIds = useMemo(() => sorted.map((t) => t.trackId), [sorted]);
  const tracksById = useMemo(() => new Map(visibleTracks.map((t) => [t.trackId, t])), [visibleTracks]);

  const selectedTracks = useMemo(
    () => [...selection.selectedIds].map((id) => tracksById.get(id)).filter((t): t is Track => Boolean(t)),
    [selection.selectedIds, tracksById],
  );

  function setFilter<K extends keyof LibraryTrackFilters>(key: K, val: LibraryTrackFilters[K]) {
    setFilters((prev) => ({ ...prev, [key]: val }));
  }
  const hasFilter = !!(filters.search || filters.grouping || filters.genre || filters.sourceOwner && filters.sourceOwner !== "any" ||
    (filters.minRating && filters.minRating > 0) || filters.moodTags?.length || filters.audioLinked != null || filters.noCover ||
    (filters.hasComments && filters.hasComments !== "any") || hasStemsFilterOn);

  const visibleColumns = prefs.columnOrder
    .map((id) => ({ id, pref: prefs.columns.find((c) => c.id === id), def: getLibraryColumnDef(id) }))
    .filter((c): c is { id: LibraryColumnId; pref: NonNullable<typeof c.pref>; def: NonNullable<typeof c.def> } => !!c.pref && !!c.def && c.pref.visible);

  const allVisibleSelected = visibleOrderedIds.length > 0 && visibleOrderedIds.every((id) => selection.selectedIds.has(id));

  // ── Selection ────────────────────────────────────────────────────────
  function handleRowPointerSelect(trackId: string, e: React.MouseEvent) {
    setSelection((s) => resolvePointerSelect(s, trackId, visibleOrderedIds, { shift: e.shiftKey, alt: e.altKey }));
  }
  function handleClearSelection() {
    setSelection((s) => clearLibrarySelection(s));
  }
  function handleGridBackgroundClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) handleClearSelection();
  }

  // ── Keyboard ─────────────────────────────────────────────────────────
  function handleGridKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    const isTextEntry = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
    if (isTextEntry || editingCommentTrackId) return; // editor/inputs own their own keys
    if (visibleOrderedIds.length === 0) return;

    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const dir = e.key === "ArrowDown" ? 1 : -1;
      setSelection((s) => (e.shiftKey ? extendLibrarySelectionFromFocus(s, visibleOrderedIds, dir) : moveLibraryFocus(s, visibleOrderedIds, dir)));
      return;
    }
    if (e.key === " ") {
      e.preventDefault();
      setSelection((s) => toggleFocusedLibrarySelection(s));
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
      e.preventDefault();
      setSelection((s) => resolveSelectAllVisible(s, visibleOrderedIds));
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      handleClearSelection();
      return;
    }
    if (e.key === "Enter") {
      if (selection.focusedId) {
        const idx = sorted.findIndex((t) => t.trackId === selection.focusedId);
        const t = tracksById.get(selection.focusedId);
        if (t && idx !== -1) onInspect(t, sorted, idx);
      }
      return;
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      if (selection.selectedIds.size > 0) setRemoveConfirmIds([...selection.selectedIds]);
      else if (selection.focusedId) setRemoveConfirmIds([selection.focusedId]);
      return;
    }
  }

  // ── Sorting ──────────────────────────────────────────────────────────
  function handleHeaderSortClick(columnId: LibraryColumnId, altKey: boolean) {
    const def = getLibraryColumnDef(columnId);
    if (!def?.sortable) return;
    const nextSort = altKey ? cycleMultiColumnSort(prefs.sort, columnId) : cycleSingleColumnSort(prefs.sort, columnId);
    updatePrefs({ ...prefs, sort: nextSort, updatedAt: new Date().toISOString() });
  }

  // ── Column resize ────────────────────────────────────────────────────
  function beginResize(columnId: LibraryColumnId, startX: number, startWidth: number) {
    resizeRef.current = { columnId, startX, startWidth };
    setLiveResizeWidth({ columnId, width: startWidth });
    function onMove(ev: MouseEvent) {
      const r = resizeRef.current;
      if (!r) return;
      const next = clampColumnWidth(r.columnId, r.startWidth + (ev.clientX - r.startX));
      setLiveResizeWidth({ columnId: r.columnId, width: next });
    }
    function onUp() {
      const r = resizeRef.current;
      if (r) {
        const finalWidth = currentLiveWidthRef.current;
        commitColumnWidth(r.columnId, finalWidth);
      }
      resizeRef.current = null;
      setLiveResizeWidth(null);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }
  const currentLiveWidthRef = useRef(0);
  useEffect(() => { currentLiveWidthRef.current = liveResizeWidth?.width ?? 0; }, [liveResizeWidth]);

  function commitColumnWidth(columnId: LibraryColumnId, width: number) {
    updatePrefs({
      ...prefs,
      columns: prefs.columns.map((c) => (c.id === columnId ? { ...c, width: clampColumnWidth(columnId, width) } : c)),
      updatedAt: new Date().toISOString(),
    });
  }

  function autoFitColumn(columnId: LibraryColumnId) {
    const def = getLibraryColumnDef(columnId);
    if (!def) return;
    const cellTexts = sorted.slice(0, 200).map((t) => cellTextFor(t, columnId));
    const width = computeAutoFitWidth(columnId, def.label, cellTexts, measureTextWidth);
    commitColumnWidth(columnId, width);
  }

  function cellTextFor(t: Track, columnId: LibraryColumnId): string {
    switch (columnId) {
      case "title": return t.title ?? "";
      case "artist": return t.artist ?? "";
      case "grouping": return t.grouping ?? "";
      case "genre": return normalizeTrackGenreTokens(t)[0] ?? "";
      case "bpm": return t.bpm ? String(t.bpm) : "";
      case "key": return t.camelotKey ?? "";
      case "energy": return formatNumber(t.energy, 2, "");
      case "duration": return fmtDur(t.durationSeconds);
      case "rating": return String(t.rating ?? 0);
      case "plays": return String(t.playCount ?? 0);
      case "lastPlayed": return fmtLastPlayed(t.lastPlayedAt);
      case "status": return t.archiveStatus ?? "library";
      case "comments": return truncateCommentPreview(t.notes, 200);
      default: return "";
    }
  }

  // ── Export ───────────────────────────────────────────────────────────
  function handleExportPrivateMetadata() {
    const exportTracks = selection.selectedIds.size > 0 ? selectedTracks : sorted;
    const csv = buildLibraryExportCsv(exportTracks);
    downloadFile(`${sourceKey}-private-export-${new Date().toISOString().slice(0, 10)}.csv`, csv, "text/csv");
  }

  const countLabel = filtered.length !== visibleTracks.length
    ? `${filtered.length} of ${visibleTracks.length} ${unitLabel}`
    : `${visibleTracks.length} ${unitLabel}`;

  return (
    <div>
      {removeConfirmIds && (
        <LibraryRemoveConfirmDialog
          count={removeConfirmIds.length}
          libraryLabel={libraryLabel}
          unitLabel={unitLabel}
          onConfirm={() => {
            onRemoveTracks(removeConfirmIds);
            setRemoveConfirmIds(null);
            handleClearSelection();
          }}
          onCancel={() => setRemoveConfirmIds(null)}
        />
      )}
      {showColumnsPanel && (
        <LibraryColumnsPanel
          preferences={prefs}
          sourceKey={sourceKey}
          onUpdate={updatePrefs}
          onAutoFitAll={() => LIBRARY_COLUMN_REGISTRY.forEach((c) => autoFitColumn(c.id))}
          onClose={() => setShowColumnsPanel(false)}
        />
      )}

      {/* One coherent header: identity, one contextual count. No second
          copy — the outer page chrome renders no title/count of its own. */}
      <div className="cat-page-header">
        <div className="cat-page-title">{libraryLabel}</div>
        <div className="cat-page-status">
          {countLabel}
          {selection.selectedIds.size > 0 && <> · <span className="cat-status-sel">{selection.selectedIds.size} selected</span></>}
        </div>
      </div>

      <div className="cat-filter-section">
        <div className="cat-filter-section-label">
          FILTERS
          {hasFilter && <button className="cat-clear-btn" onClick={() => { setFilters({}); setHasStemsFilterOn(false); }}>Clear</button>}
          <button className="cat-clear-btn" onClick={() => setShowColumnsPanel(true)} style={{ marginLeft: "auto" }}>Columns…</button>
        </div>
        <div className="cat-filter-row">
          <input
            className="cat-filter-search"
            placeholder="Search title, artist, mood, comments…"
            value={filters.search ?? ""}
            onChange={(e) => setFilter("search", e.target.value || undefined)}
          />
          <select className="cat-filter-sel" value={filters.moodTags?.[0] ?? ""} onChange={(e) => setFilter("moodTags", e.target.value ? [e.target.value] : undefined)}>
            <option value="">Mood: All</option>
            {filterOptions.moods.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <select className="cat-filter-sel" value={filters.grouping ?? ""} onChange={(e) => setFilter("grouping", e.target.value || undefined)}>
            <option value="">Group: All</option>
            {filterOptions.groupings.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          <select className="cat-filter-sel" value={filters.genre ?? ""} onChange={(e) => setFilter("genre", e.target.value || undefined)}>
            <option value="">Genre: All</option>
            {filterOptions.genres.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          <select className="cat-filter-sel" value={String(filters.minRating ?? 0)} onChange={(e) => setFilter("minRating", parseInt(e.target.value) || undefined)}>
            <option value="0">Rating: Any</option>
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={String(n)}>{"★".repeat(n)}+</option>)}
          </select>
          <select className="cat-filter-sel" value={filters.hasComments ?? "any"} onChange={(e) => setFilter("hasComments", e.target.value as LibraryTrackFilters["hasComments"])}>
            <option value="any">Comments: Any</option>
            <option value="has">Has comments</option>
            <option value="none">No comments</option>
          </select>
          {onOpenStems && (
            <label className="cat-filter-checkbox">
              <input type="checkbox" checked={hasStemsFilterOn} onChange={(e) => setHasStemsFilterOn(e.target.checked)} />
              Has Stems
            </label>
          )}
        </div>
      </div>

      {selection.selectedIds.size > 0 && (
        <LibraryActionBar
          selectedTracks={selectedTracks}
          trackPlaybackIssues={trackPlaybackIssues}
          onClear={handleClearSelection}
          onBulkUpdate={onBulkUpdate}
          onCreateLibraryGroup={onCreateLibraryGroup}
          onGenerateMoodSuggestions={onGenerateMoodSuggestions}
          onApplyMoodSuggestions={onApplyMoodSuggestions}
          onBulkSetArchiveStatus={onBulkSetArchiveStatus}
          onAnalyzeSelected={onAnalyzeSelected}
          onReanalyze={onReanalyze}
          musicPlaylists={musicPlaylists}
          onBulkAddTracksToPlaylist={onBulkAddTracksToPlaylist}
          onBulkCreatePlaylistFromTracks={onBulkCreatePlaylistFromTracks}
          samplerBanks={samplerBanks}
          loadedSamplerBankId={loadedSamplerBankId}
          onAddTracksToSamplerBank={onAddTracksToSamplerBank}
          onCreateSamplerBankFromTracks={onCreateSamplerBankFromTracks}
          onSendTrackToRadio={onSendTrackToRadio}
          onBulkRecheckCodecIssues={onBulkRecheckCodecIssues}
          bulkRechecking={bulkRechecking}
          onExportPrivateMetadata={handleExportPrivateMetadata}
          removeLabel={`Remove from ${libraryLabel}…`}
          onRequestRemove={() => setRemoveConfirmIds([...selection.selectedIds])}
        />
      )}

      <div className="cat-tracks-label">TRACKS</div>
      <div
        ref={gridRef}
        className="cat-grid-scroll"
        tabIndex={0}
        role="grid"
        aria-multiselectable="true"
        onKeyDown={handleGridKeyDown}
        onClick={handleGridBackgroundClick}
      >
        <table className="mtw-table cat-data-grid">
          <colgroup>
            <col className="cat-col-select" />
            {visibleColumns.map(({ id, pref }) => (
              <col key={id} style={{ width: (liveResizeWidth?.columnId === id ? liveResizeWidth.width : pref.width) + "px" }} />
            ))}
            <col className="cat-col-actions" />
          </colgroup>
          <thead>
            <tr>
              <th className="col-check cat-col-frozen cat-col-frozen--select">
                {/* 0722C_MUSIC_Production_Stem_Export — the former header
                    checkbox is replaced by this "S" badge column header;
                    row/shift/alt-click selection never depended on the
                    checkbox (both already called resolvePointerSelect
                    directly), so removing it loses no selection behavior.
                    The one thing the checkbox uniquely provided — a
                    mouse-accessible "select all" gesture (Cmd/Ctrl+A is
                    keyboard-only) — moves to this explicit button so mouse
                    users keep full parity. */}
                <button
                  type="button"
                  className="cat-select-all-btn"
                  aria-pressed={allVisibleSelected}
                  title={allVisibleSelected ? "Clear selection" : "Select all visible"}
                  onClick={() => setSelection((s) => resolveHeaderCheckboxToggle(s, visibleOrderedIds))}
                >
                  {allVisibleSelected ? "☑" : "☐"}
                </button>
              </th>
              {visibleColumns.map(({ id, def }) => {
                const priority = sortPriorityForColumn(prefs.sort, id);
                const singleSort = prefs.sort.length === 1 ? prefs.sort[0] : null;
                const isFrozenTitle = id === "title";
                return (
                  <th
                    key={id}
                    className={isFrozenTitle ? "cat-col-frozen cat-col-frozen--title" : undefined}
                    aria-sort={singleSort?.columnId === id ? (singleSort.direction === "asc" ? "ascending" : "descending") : undefined}
                  >
                    <span
                      className={`cat-col-header-label${def.sortable ? " cat-col-sortable" : ""}`}
                      onClick={(e) => handleHeaderSortClick(id, e.altKey)}
                      title={def.sortable ? "Click to sort · Option/Alt-click to add a multi-column sort key" : undefined}
                    >
                      {def.label}
                      {priority != null && <span className="cat-sort-priority">{priority}</span>}
                      {singleSort?.columnId === id && <span className="cat-sort-dir">{singleSort.direction === "asc" ? "▲" : "▼"}</span>}
                    </span>
                    <span
                      className="cat-col-resize-handle"
                      role="separator"
                      aria-orientation="vertical"
                      tabIndex={0}
                      onMouseDown={(e) => { e.preventDefault(); beginResize(id, e.clientX, liveResizeWidth?.columnId === id ? liveResizeWidth.width : (prefs.columns.find((c) => c.id === id)?.width ?? def.defaultWidth)); }}
                      onDoubleClick={() => autoFitColumn(id)}
                      onKeyDown={(e) => {
                        const current = prefs.columns.find((c) => c.id === id)?.width ?? def.defaultWidth;
                        if (e.key === "ArrowLeft") { e.preventDefault(); commitColumnWidth(id, current - 8); }
                        else if (e.key === "ArrowRight") { e.preventDefault(); commitColumnWidth(id, current + 8); }
                        else if (e.key === "Home") { e.preventDefault(); commitColumnWidth(id, def.minWidth); }
                        else if (e.key === "End") { e.preventDefault(); commitColumnWidth(id, def.maxWidth); }
                      }}
                      aria-label={`Resize ${def.label} column`}
                    />
                  </th>
                );
              })}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((t, idx) => {
              const excluded = excludedTrackIds.has(t.trackId);
              const locked = lockedTrackIds.has(t.trackId);
              const isSelected = selection.selectedIds.has(t.trackId);
              const isFocused = selection.focusedId === t.trackId;
              const hasAudio = !!(t.audioRelPath || t.objectUrl || t.filePath);
              const exportItem = exportReport?.items.find((i) => i.trackId === t.trackId);
              return (
                <tr
                  key={t.trackId}
                  className={[
                    excluded ? "row-excluded" : "",
                    isSelected ? "row-selected" : "",
                    isFocused ? "row-focused" : "",
                    auditionTrackId === t.trackId ? "row-auditioning track-row--current" : "",
                  ].filter(Boolean).join(" ")}
                  draggable
                  onClick={(e) => handleRowPointerSelect(t.trackId, e)}
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = "copy";
                    const dragIds = isSelected && selection.selectedIds.size > 1 ? [...selection.selectedIds] : [t.trackId];
                    e.dataTransfer.setData(TRACK_DRAG_MIME, encodeTrackDrag({ type: "track", source: "library", trackIds: dragIds }));
                  }}
                >
                  <td className="col-check cat-col-frozen cat-col-frozen--select" onClick={(e) => e.stopPropagation()}>
                    {onOpenStems && (
                      <LibraryStemBadge state={stemBadges[t.trackId] ?? "none"} onOpen={() => onOpenStems(t.trackId)} />
                    )}
                  </td>
                  {visibleColumns.map(({ id }) => (
                    <td key={id} className={id === "title" ? "col-title cat-col-frozen cat-col-frozen--title" : `col-${id}`} onClick={id === "comments" ? (e) => e.stopPropagation() : undefined}>
                      {renderLibraryCell(id, t, {
                        onAuditionTrack, auditionTrackId, playbackStatus, hasAudio, onPauseTrack, onResumeTrack,
                        onRateTrack, playbackErrors, trackPlaybackIssues, exportItem,
                        editingCommentTrackId, setEditingCommentTrackId, onBulkUpdate,
                        onInspect: () => onInspect(t, sorted, idx),
                      })}
                    </td>
                  ))}
                  <td className="col-actions" onClick={(e) => e.stopPropagation()}>
                    {excluded
                      ? <button className="tb-btn sm" onClick={() => onRestore(t.trackId)}>Restore</button>
                      : <button className="tb-btn sm" onClick={() => onExclude(t.trackId)}>Excl.</button>}
                    {playbackErrors.has(t.trackId) && (
                      <>
                        {onRecheckPlaybackIssue && <button className="tb-btn sm" onClick={() => onRecheckPlaybackIssue(t.trackId)} title="Re-validate this file">Recheck</button>}
                        {onClearPlaybackIssue && <button className="tb-btn sm" onClick={() => onClearPlaybackIssue(t.trackId)} title="Clear playback error flag">✕Err</button>}
                      </>
                    )}
                    {onSendTrackToRadio && t.sourceOwner !== "external" && (
                      <button className="tb-btn sm" onClick={() => onSendTrackToRadio(t.trackId)} title="Send this track to RADIO">◎</button>
                    )}
                    {locked && <span className="warn-badge badge-blue">LOCK</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="cat-keyboard-hint">
        <b>Shift</b> select range · <b>Option/Alt</b> toggle one row · <b>Option/Alt + Shift</b> remove range
      </div>
    </div>
  );
}

// Cell renderers kept as one dispatch function (not per-column components)
// to avoid an unwieldy prop-drilled component tree for what are, in every
// case but Comments/Rating, plain read-only formatted values.
function renderLibraryCell(
  id: LibraryColumnId,
  t: Track,
  ctx: {
    onAuditionTrack?: (id: string) => void; auditionTrackId?: string | null; playbackStatus?: string; hasAudio: boolean;
    onPauseTrack?: () => void; onResumeTrack?: () => void; onRateTrack: (id: string, r: TrackRating) => void;
    playbackErrors: Map<string, string>; trackPlaybackIssues?: Record<string, TrackPlaybackIssue>;
    exportItem?: { status: string };
    editingCommentTrackId: string | null; setEditingCommentTrackId: (id: string | null) => void;
    onBulkUpdate?: (ids: string[], patch: Partial<Track>) => void;
    onInspect: () => void;
  },
): React.ReactNode {
  switch (id) {
    case "title": {
      const isCurrent = ctx.auditionTrackId === t.trackId;
      const isRowPlaying = isCurrent && ctx.playbackStatus === "playing";
      const isRowPaused = isCurrent && ctx.playbackStatus === "paused";
      return (
        <>
          {ctx.onAuditionTrack && (
            <button
              className={`tb-btn sm col-play-btn${isCurrent ? " tb-btn-playing" : ""}`}
              disabled={!ctx.hasAudio}
              title={ctx.hasAudio ? (isRowPlaying ? "Pause" : "Play") : "Audio file not linked"}
              onClick={(e) => {
                e.stopPropagation();
                if (!ctx.hasAudio) return;
                if (isRowPlaying) ctx.onPauseTrack?.();
                else if (isRowPaused) ctx.onResumeTrack?.();
                else ctx.onAuditionTrack!(t.trackId);
              }}
            >{isRowPlaying ? "⏸" : "▶"}</button>
          )}
          <span className="playlist-row-title" onClick={(e) => { e.stopPropagation(); ctx.onInspect(); }}>{t.title}</span>
        </>
      );
    }
    case "artist": return t.artist;
    case "mood": return (t.moodTags?.length ?? 0) > 0
      ? <span className="mood-chips">{t.moodTags!.slice(0, 3).map((m) => <span key={m} className="mood-chip">{m}</span>)}</span>
      : <span className="dim">—</span>;
    case "suggested": return (t.moodSuggestions?.length ?? 0) > 0
      ? <span className="mood-chips">{t.moodSuggestions!.slice(0, 3).map((m) => <span key={m} className="mood-chip mood-chip-suggested">{m}</span>)}</span>
      : <span className="dim">—</span>;
    case "mechanical": return (t.mechanicalMoodTags?.length ?? 0) > 0
      ? <span className="mood-chips mood-chips-mech">{(t.mechanicalMoodTags as string[]).slice(0, 2).map((m) => <span key={m} className="mood-chip mood-chip-mech">{m}</span>)}</span>
      : <span className="dim">—</span>;
    case "grouping": return t.grouping || <span className="dim">—</span>;
    case "genre": return normalizeTrackGenreTokens(t)[0] || <span className="dim">—</span>;
    case "bpm": return t.bpm && t.bpm > 0 ? t.bpm : "—";
    case "key": return t.camelotKey ?? "—";
    case "energy": return (
      <>{formatNumber(t.energy, 2, "—")}{t.energySource === "estimated" && <span className="est-tag" title="Estimated">~</span>}</>
    );
    case "duration": return fmtDur(t.durationSeconds);
    case "rating": return <StarRating trackId={t.trackId} rating={(t.rating ?? 0) as TrackRating} onChange={ctx.onRateTrack} />;
    case "plays": return (t.playCount ?? 0) > 0 ? <span className="play-count">×{t.playCount}</span> : <span className="play-count dim">—</span>;
    case "lastPlayed": return <span title={t.lastPlayedAt}>{fmtLastPlayed(t.lastPlayedAt)}</span>;
    case "status": return (
      <>
        {(t.archiveStatus ?? "library") === "archive" && <span className="warn-badge badge-archive">ARC</span>}
        {(t.archiveStatus ?? "library") === "needs_review" && <span className="warn-badge badge-review">REV</span>}
        {(t.archiveStatus ?? "library") === "rejected" && <span className="warn-badge badge-rejected">REJ</span>}
        {(t.archiveStatus ?? "library") === "library" && <span className="dim">—</span>}
      </>
    );
    case "comments": return (
      <LibraryCommentsCell
        track={t}
        isEditing={ctx.editingCommentTrackId === t.trackId}
        onStartEdit={() => ctx.setEditingCommentTrackId(t.trackId)}
        onCommit={(value) => { ctx.onBulkUpdate?.([t.trackId], { notes: value }); ctx.setEditingCommentTrackId(null); }}
        onCancel={() => ctx.setEditingCommentTrackId(null)}
      />
    );
    default: return null;
  }
}

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import type { Track } from "../data/trackTypes";
import type { CrateRecord, CrateFilters, CrateMatchMode, CrateBpmFilter, CrateGroupMode } from "../data/crateTypes";
import { resolveCrateTracks, validateCrateFilters, computeCrateFilterPreview } from "../logic/resolveCrate";
import { normalizeBpmPrecision } from "../logic/dspFeatureExtraction";
import {
  buildTaxonomyCounts,
  filterTaxonomyCounts,
} from "../logic/taxonomyCounts";
import type { TaxonomySortMode } from "../logic/taxonomyCounts";
import { buildFilterOptions } from "../logic/libraryFilters";
import { CollectionDetailBar } from "./CollectionDetailBar";
import { getMoodColorToken } from "../logic/moodTaxonomy";

type Props = {
  crate: CrateRecord;
  libraryTracks: Track[];
  onChange: (updated: CrateRecord) => void;
  onDelete: (id: string) => void;
  onGoHome: () => void;
  onNewCrate: () => void;
  onAuditionTrack?: (trackId: string) => void;
  onPause?: () => void;
  auditionTrackId?: string | null;
  playbackStatus?: "idle" | "playing" | "paused" | "error";
};

function fmtDur(s: number | undefined): string {
  if (!s || !isFinite(s) || s <= 0) return "—";
  return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, "0")}`;
}

function fmtTotalDuration(seconds: number): string {
  if (!seconds) return "0m";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ── MultiSelectFilter (retained for Group filter) ─────────────────────────────
type MultiSelectProps = {
  label: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
};

// Anchored, portaled dropdown menu — escapes cd-filter-zone's overflow/scroll
// boundary (root cause of the Group search clipping defect) by rendering to
// document.body and positioning itself against the trigger's live bounding
// rect, recomputed on scroll/resize while open.
type DropdownAnchorProps = {
  anchorRef: React.RefObject<HTMLElement | null>;
  onRequestClose: () => void;
  children: React.ReactNode;
};

function DropdownAnchor({ anchorRef, onRequestClose, children }: DropdownAnchorProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);

  const reposition = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const viewportH = window.innerHeight;
    const gap = 4;
    const spaceBelow = viewportH - rect.bottom - gap;
    const spaceAbove = rect.top - gap;
    const openUpward = spaceBelow < 160 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(120, Math.min(280, openUpward ? spaceAbove : spaceBelow));
    setPos({
      top: openUpward ? rect.top - gap - maxHeight : rect.bottom + gap,
      left: rect.left,
      width: Math.max(rect.width, 200),
      maxHeight,
    });
  }, [anchorRef]);

  useEffect(() => {
    reposition();
    const handle = () => reposition();
    window.addEventListener("scroll", handle, true);
    window.addEventListener("resize", handle);
    return () => {
      window.removeEventListener("scroll", handle, true);
      window.removeEventListener("resize", handle);
    };
  }, [reposition]);

  useEffect(() => {
    function handlePointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (menuRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onRequestClose();
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onRequestClose();
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [anchorRef, onRequestClose]);

  if (!pos) return null;

  return createPortal(
    <div
      ref={menuRef}
      className="cd-filter-dropdown cd-filter-dropdown--portal"
      style={{
        position: "fixed",
        top: pos.top,
        left: pos.left,
        width: pos.width,
        maxHeight: pos.maxHeight,
      }}
    >
      {children}
    </div>,
    document.body,
  );
}

function MultiSelectFilter({ label, options, selected, onChange }: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);

  const filtered = search
    ? options.filter((o) => o.toLowerCase().includes(search.toLowerCase()))
    : options;

  function toggle(val: string) {
    onChange(selected.includes(val) ? selected.filter((s) => s !== val) : [...selected, val]);
  }

  if (options.length === 0) return null;

  return (
    <div className="cd-filter-row">
      <button ref={triggerRef} className="cd-filter-header" onClick={() => setOpen((v) => !v)}>
        <span className="cd-filter-label">{label}</span>
        {selected.length > 0 && (
          <span className="cd-filter-count">{selected.length} selected</span>
        )}
        <span className="cd-filter-chevron">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <DropdownAnchor anchorRef={triggerRef} onRequestClose={() => setOpen(false)}>
          {options.length > 8 && (
            <input
              className="cd-filter-search"
              placeholder={`Search ${label.toLowerCase()}…`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          )}
          <div className="cd-filter-options">
            {[
              ...filtered.filter((o) => selected.includes(o)),
              ...filtered.filter((o) => !selected.includes(o)),
            ].map((o) => (
              <label key={o} className={`cd-filter-option${selected.includes(o) ? " cd-filter-option--active" : ""}`}>
                <input type="checkbox" checked={selected.includes(o)} onChange={() => toggle(o)} />
                <span>{o}</span>
              </label>
            ))}
            {filtered.length === 0 && <div className="cd-filter-empty">No matches</div>}
          </div>
          {selected.length > 0 && (
            <button className="cd-filter-clear" onClick={() => onChange([])}>Clear all</button>
          )}
        </DropdownAnchor>
      )}
      {!open && selected.length > 0 && (
        <div className="cd-selected-chips">
          {selected.map((s) => (
            <span key={s} className="cd-chip">
              {s}
              <button className="cd-chip-remove" onClick={() => toggle(s)}>×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── TaxonomyChipGroup ─────────────────────────────────────────────────────────
type TaxonomyChipGroupProps = {
  label: string;
  items: ReturnType<typeof buildTaxonomyCounts>;
  sortMode: TaxonomySortMode;
  expanded: boolean;
  onToggleExpanded: () => void;
  onSortModeChange: (m: TaxonomySortMode) => void;
  onToggleValue: (value: string) => void;
  onClear: () => void;
  /** Optional: return a CSS custom-property name for each chip label */
  colorFn?: (label: string) => string | null;
};

function TaxonomyChipGroup({
  label, items, sortMode, expanded, onToggleExpanded,
  onSortModeChange, onToggleValue, onClear, colorFn,
}: TaxonomyChipGroupProps) {
  const [search, setSearch] = useState("");
  const visible = filterTaxonomyCounts(items, search);
  const hasSelected = items.some((i) => i.selected);
  const selectedCount = items.filter((i) => i.selected).length;

  return (
    <div className="taxonomy-group">
      <div className="taxonomy-group-header">
        <button
          type="button"
          className="taxonomy-group-toggle"
          onClick={onToggleExpanded}
          aria-expanded={expanded}
        >
          <span className="taxonomy-chevron">{expanded ? "▾" : "▸"}</span>
          <span className="taxonomy-group-title">{label}</span>
          {selectedCount > 0 && (
            <span className="taxonomy-selected-badge">{selectedCount}</span>
          )}
        </button>
        {expanded && (
          <div className="taxonomy-group-controls">
            <input
              className="taxonomy-search-input"
              placeholder={`Search…`}
              aria-label={`Search ${label}`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button
              className={`taxonomy-sort-btn${sortMode === "count_desc" ? " is-active" : ""}`}
              onClick={() => onSortModeChange("count_desc")}
              title="Sort by count"
            >Count ↓</button>
            <button
              className={`taxonomy-sort-btn${sortMode === "alpha_asc" ? " is-active" : ""}`}
              onClick={() => onSortModeChange("alpha_asc")}
              title="Sort A–Z"
            >A–Z</button>
            {hasSelected && (
              <button className="taxonomy-clear-btn" onClick={onClear} aria-label={`Clear ${label}`}>
                Clear
              </button>
            )}
          </div>
        )}
      </div>
      {expanded && (
        <div className="taxonomy-chip-grid" role="group" aria-label={`${label} filters`}>
          {visible.length === 0 && (
            <span className="taxonomy-empty-state">
              {search ? "No matches" : `No ${label.toLowerCase()} values in pool`}
            </span>
          )}
          {visible.map((item) => {
            const token = colorFn?.(item.label) ?? null;
            const style = token ? { "--chip-color": `var(${token})` } as React.CSSProperties : undefined;
            return (
              <button
                key={item.label}
                type="button"
                className={`taxonomy-chip${item.selected ? " is-selected" : ""}${token ? " taxonomy-chip--mood" : ""}`}
                aria-pressed={item.selected}
                onClick={() => onToggleValue(item.label)}
                style={style}
              >
                <span>{item.label}</span>
                <span className="taxonomy-chip-count">{item.count}</span>
                {item.selected && <span className="taxonomy-chip-remove" aria-hidden="true">×</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Selected filter bar — always visible when filters are active ──────────────
type SelectedBarProps = {
  selectedMoods: string[];
  selectedGenres: string[];
  onRemoveMood: (v: string) => void;
  onRemoveGenre: (v: string) => void;
  onClearAll: () => void;
};

function SelectedBar({
  selectedMoods, selectedGenres, onRemoveMood, onRemoveGenre, onClearAll,
}: SelectedBarProps) {
  if (selectedMoods.length === 0 && selectedGenres.length === 0) return null;
  return (
    <div className="cd-selected-bar">
      <span className="cd-selected-bar-label">Active:</span>
      {selectedMoods.map((v) => (
        <button
          key={"m:" + v}
          type="button"
          className="cd-selected-tag cd-selected-tag--mood"
          onClick={() => onRemoveMood(v)}
          aria-label={`Remove mood ${v}`}
        >
          {v} <span aria-hidden="true">×</span>
        </button>
      ))}
      {selectedGenres.map((v) => (
        <button
          key={"g:" + v}
          type="button"
          className="cd-selected-tag cd-selected-tag--genre"
          onClick={() => onRemoveGenre(v)}
          aria-label={`Remove genre ${v}`}
        >
          {v} <span aria-hidden="true">×</span>
        </button>
      ))}
      <button
        type="button"
        className="cd-selected-bar-clear"
        onClick={onClearAll}
      >
        Clear all
      </button>
    </div>
  );
}

// ── CrateDetail ───────────────────────────────────────────────────────────────
function trackHasAudio(t: Track): boolean {
  return !!(t.audioRelPath ?? t.objectUrl ?? t.filePath);
}

export function CrateDetail({ crate, libraryTracks, onChange, onDelete, onGoHome, onNewCrate, onAuditionTrack, onPause, auditionTrackId, playbackStatus }: Props) {
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(crate.name);
  const [moodSortMode, setMoodSortMode] = useState<TaxonomySortMode>("count_desc");
  const [genreSortMode, setGenreSortMode] = useState<TaxonomySortMode>("count_desc");
  const [moodExpanded, setMoodExpanded] = useState(true);
  const [genreExpanded, setGenreExpanded] = useState(true);

  const filterOpts = useMemo(() => buildFilterOptions(
    libraryTracks.filter((t) => t.sourceOwner !== "reference")
  ), [libraryTracks]);

  function patch(partial: Partial<CrateRecord>) {
    onChange({ ...crate, ...partial, updatedAt: new Date().toISOString() });
  }

  function patchFilters(partial: Partial<CrateFilters>) {
    patch({ filters: { ...crate.filters, ...partial } });
  }

  function toggleSource(owner: "studiorich" | "external") {
    const cur = crate.sourceOwners;
    const next = cur.includes(owner)
      ? cur.filter((o) => o !== owner)
      : [...cur, owner];
    if (next.length === 0) return;
    patch({ sourceOwners: next });
  }

  function submitName() {
    const trimmed = nameInput.trim();
    if (trimmed && trimmed !== crate.name) patch({ name: trimmed });
    setEditingName(false);
  }

  function toggleMood(value: string) {
    const cur = crate.filters.moodTags;
    patchFilters({ moodTags: cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value] });
  }

  function toggleGenre(value: string) {
    const cur = crate.filters.genres;
    patchFilters({ genres: cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value] });
  }

  // Phase 1: base pool (source / search / rating / playable — no taxonomy)
  const basePool = useMemo(() => {
    const searchLow = crate.filters.search?.toLowerCase().trim() ?? "";
    return libraryTracks.filter((t) => {
      if (t.sourceOwner === "reference" || t.sourceOwner === "unknown") return false;
      if (!crate.sourceOwners.includes(t.sourceOwner as "studiorich" | "external")) return false;
      if (crate.filters.playableOnly && !t.filePath && !t.objectUrl) return false;
      if (searchLow) {
        const hay = [t.title ?? "", t.artist ?? "", t.albumTitle ?? ""].join(" ").toLowerCase();
        if (!hay.includes(searchLow)) return false;
      }
      if (crate.filters.minRating && crate.filters.minRating > 0 && (t.rating ?? 0) < crate.filters.minRating) return false;
      return true;
    });
  }, [libraryTracks, crate.sourceOwners, crate.filters.search, crate.filters.minRating, crate.filters.playableOnly]);

  // Phase 2: taxonomy counts from base pool
  const moodCounts = useMemo(
    () => buildTaxonomyCounts(basePool, "mood", crate.filters.moodTags, moodSortMode),
    [basePool, crate.filters.moodTags, moodSortMode],
  );
  const genreCounts = useMemo(
    () => buildTaxonomyCounts(basePool, "genre", crate.filters.genres, genreSortMode),
    [basePool, crate.filters.genres, genreSortMode],
  );

  // 0804_MUSIC_Crate_BPM_Group_Filters — Phase 3 now calls the ONE canonical
  // matcher (resolveCrateTracks) instead of re-implementing mood/genre/
  // grouping/matchMode logic a second time locally. This was a real,
  // pre-existing divergence risk (the prior local copy had already silently
  // missed the genreFamilies filter added in a previous build) — calling
  // the canonical function here means the live preview can never disagree
  // with what the playlist generator actually resolves, for any filter
  // category, present or future. Directly required by this build's own
  // "do not embed filter logic directly in React components" instruction.
  const resolved = useMemo(() => resolveCrateTracks(crate, libraryTracks), [crate, libraryTracks]);
  const visibleTracks = resolved.tracks;

  const totalDur = visibleTracks.reduce((s, t) => s + (t.durationSeconds ?? 0), 0);
  const countByCat = visibleTracks.filter((t) => t.sourceOwner === "studiorich").length;
  const countByExt = visibleTracks.filter((t) => t.sourceOwner === "external").length;
  const hasSignalFilters = crate.filters.moodTags.length > 0 || crate.filters.groupings.length > 0 || crate.filters.genres.length > 0;

  // §9 "Preview" staged deltas — computed from current library state, no
  // Save required (there is no Save step in this component at all; every
  // edit already autosaves via patch()/onChange immediately).
  const filterPreview = useMemo(() => computeCrateFilterPreview(crate, libraryTracks), [crate, libraryTracks]);
  const bpmFilter = crate.filters.bpm;
  const groupFilter = crate.filters.groups;
  const bpmActive = bpmFilter != null && (bpmFilter.minimum != null || bpmFilter.maximum != null);
  const groupActive = groupFilter != null && groupFilter.mode !== "any";

  const [bpmMinInput, setBpmMinInput] = useState(bpmFilter?.minimum != null ? String(bpmFilter.minimum) : "");
  const [bpmMaxInput, setBpmMaxInput] = useState(bpmFilter?.maximum != null ? String(bpmFilter.maximum) : "");
  const [bpmError, setBpmError] = useState<string | null>(null);
  // Local draft state resyncs when switching to a different crate (or on an
  // external update to this crate's own bpm filter) — never mid-typing on
  // the SAME crate, which is what lets a rejected edit stay visible with its
  // error message instead of silently snapping back to the last-committed value.
  useEffect(() => {
    setBpmMinInput(bpmFilter?.minimum != null ? String(bpmFilter.minimum) : "");
    setBpmMaxInput(bpmFilter?.maximum != null ? String(bpmFilter.maximum) : "");
    setBpmError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crate.id]);

  function commitBpmFilter(next: CrateBpmFilter) {
    const validation = validateCrateFilters({ ...crate.filters, bpm: next });
    const bpmMsg = validation.errors.find((e) => e.toLowerCase().includes("bpm"));
    if (bpmMsg) { setBpmError(bpmMsg); return; }
    setBpmError(null);
    patchFilters({ bpm: next });
  }
  function parseBpmInput(raw: string): number | null {
    if (raw.trim() === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) ? normalizeBpmPrecision(n) : NaN;
  }
  function onBpmMinBlur() {
    const parsed = parseBpmInput(bpmMinInput);
    if (Number.isNaN(parsed)) { setBpmError("Minimum BPM must be a number."); return; }
    commitBpmFilter({ minimum: parsed, maximum: bpmFilter?.maximum ?? null, includeUnresolved: bpmFilter?.includeUnresolved ?? true });
  }
  function onBpmMaxBlur() {
    const parsed = parseBpmInput(bpmMaxInput);
    if (Number.isNaN(parsed)) { setBpmError("Maximum BPM must be a number."); return; }
    commitBpmFilter({ minimum: bpmFilter?.minimum ?? null, maximum: parsed, includeUnresolved: bpmFilter?.includeUnresolved ?? true });
  }
  function toggleBpmIncludeUnresolved() {
    commitBpmFilter({ minimum: bpmFilter?.minimum ?? null, maximum: bpmFilter?.maximum ?? null, includeUnresolved: !(bpmFilter?.includeUnresolved ?? true) });
  }
  function clearBpmFilter() {
    setBpmMinInput(""); setBpmMaxInput(""); setBpmError(null);
    patchFilters({ bpm: undefined });
  }

  function setGroupMode(mode: CrateGroupMode) {
    // §9 "preserve selected Groups when toggling between Include and
    // Exclude during the editing session" — groupIds carries over; only
    // "Any" clears matching (persisted representation normalizes to an
    // empty list, per §9's own wording, without discarding the prior
    // selection from THIS session's local state — re-selecting Include/
    // Exclude after Any starts from empty, matching "may normalize to an
    // empty list").
    patchFilters({ groups: { mode, groupIds: mode === "any" ? [] : (groupFilter?.groupIds ?? []) } });
  }
  function setGroupIds(groupIds: string[]) {
    patchFilters({ groups: { mode: groupFilter?.mode ?? "any", groupIds } });
  }
  const groupValidationError = groupFilter && groupFilter.mode !== "any" && groupFilter.groupIds.length === 0
    ? `Group ${groupFilter.mode} mode requires at least one selected Group — no Group filtering is applied until one is chosen.`
    : null;

  return (
    <div className="cd-root">
      <CollectionDetailBar
        collectionLabel="Crates"
        onBackToCollection={onGoHome}
        createLabel="+ New Crate"
        onCreate={() => {
          console.log("[CrateDetail] + New Crate clicked, calling onNewCrate");
          onNewCrate();
        }}
      />

      {/* Crate header */}
      <div className="cd-header">
        <div className="cd-art"><span className="cd-art-icon">◈</span></div>
        <div className="cd-header-info">
          {editingName ? (
            <input
              className="cd-name-input"
              value={nameInput}
              autoFocus
              onChange={(e) => setNameInput(e.target.value)}
              onBlur={submitName}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitName();
                if (e.key === "Escape") { setNameInput(crate.name); setEditingName(false); }
              }}
            />
          ) : (
            <div className="cd-name" onClick={() => { setNameInput(crate.name); setEditingName(true); }}>
              {crate.name}<span className="cd-name-edit-hint">✎</span>
            </div>
          )}
          <div className="cd-header-meta">
            <span className="cd-stat">{visibleTracks.length} tracks</span>
            <span className="cd-stat-sep">·</span>
            <span className="cd-stat">{fmtTotalDuration(totalDur)}</span>
            {countByCat > 0 && <><span className="cd-stat-sep">·</span><span className="cd-stat-cat">{countByCat} CAT</span></>}
            {countByExt > 0 && <><span className="cd-stat-sep">·</span><span className="cd-stat-ext">{countByExt} EXT</span></>}
          </div>
          {onAuditionTrack && (
            <button
              className="cd-play-crate-btn"
              title="Play Crate — starts from first playable track"
              onClick={() => {
                const first = visibleTracks.find(trackHasAudio);
                if (first) onAuditionTrack(first.trackId);
              }}
              disabled={!visibleTracks.some(trackHasAudio)}
            >
              ▶ Play Crate
            </button>
          )}
        </div>
        <button className="cd-delete-btn" title="Delete crate"
          onClick={() => { if (confirm(`Delete "${crate.name}"?`)) onDelete(crate.id); }}>
          ✕
        </button>
      </div>

      {/* Filter + taxonomy zone — scrollable, capped height */}
      <div className="cd-filter-zone">

        {/* Base filters */}
        <div className="cd-filters-panel">
          <div className="cd-filter-row cd-filter-row--source">
            <span className="cd-filter-label">Source</span>
            <div className="cd-source-chips">
              <button className={`cd-source-chip${crate.sourceOwners.includes("studiorich") ? " active" : ""}`}
                onClick={() => toggleSource("studiorich")}>CAT</button>
              <button className={`cd-source-chip${crate.sourceOwners.includes("external") ? " active" : ""}`}
                onClick={() => toggleSource("external")}>EXT</button>
            </div>
          </div>
          <div className="cd-filter-row">
            <span className="cd-filter-label">Search</span>
            <input className="cd-search-input" placeholder="title, artist…"
              value={crate.filters.search ?? ""}
              onChange={(e) => patchFilters({ search: e.target.value || undefined })} />
          </div>
          <div className="cd-filter-row cd-filter-row--rating">
            <span className="cd-filter-label">Rating ≥</span>
            <div className="cd-rating-chips">
              {[0, 1, 2, 3, 4, 5].map((r) => (
                <button key={r}
                  className={`cd-rating-chip${(crate.filters.minRating ?? 0) === r ? " active" : ""}`}
                  onClick={() => patchFilters({ minRating: r || undefined })}>
                  {r === 0 ? "Any" : `${r}★`}
                </button>
              ))}
            </div>
          </div>
          <div className="cd-filter-row cd-filter-row--toggle">
            <label className="cd-toggle-label">
              <input type="checkbox" checked={!!crate.filters.playableOnly}
                onChange={(e) => patchFilters({ playableOnly: e.target.checked || undefined })} />
              <span>Playable only</span>
            </label>
          </div>
        </div>

        {/* Sticky selected bar */}
        <SelectedBar
          selectedMoods={crate.filters.moodTags}
          selectedGenres={crate.filters.genres}
          onRemoveMood={toggleMood}
          onRemoveGenre={toggleGenre}
          onClearAll={() => patchFilters({ moodTags: [], genres: [] })}
        />

        {/* Taxonomy chip groups */}
        <div className="cd-taxonomy-panel">
          <TaxonomyChipGroup
            label="Mood"
            items={moodCounts}
            sortMode={moodSortMode}
            expanded={moodExpanded}
            onToggleExpanded={() => setMoodExpanded((v) => !v)}
            onSortModeChange={setMoodSortMode}
            onToggleValue={toggleMood}
            onClear={() => patchFilters({ moodTags: [] })}
            colorFn={getMoodColorToken}
          />
          <TaxonomyChipGroup
            label="Genre"
            items={genreCounts}
            sortMode={genreSortMode}
            expanded={genreExpanded}
            onToggleExpanded={() => setGenreExpanded((v) => !v)}
            onSortModeChange={setGenreSortMode}
            onToggleValue={toggleGenre}
            onClear={() => patchFilters({ genres: [] })}
          />
          <MultiSelectFilter
            label="Grouping"
            options={filterOpts.groupings}
            selected={crate.filters.groupings}
            onChange={(v) => patchFilters({ groupings: v })}
          />
          {hasSignalFilters && (
            <div className="cd-filter-row cd-filter-row--match">
              <span className="cd-filter-label">Match</span>
              <div className="cd-source-chips">
                {(["all_groups", "any_signal"] as CrateMatchMode[]).map((m) => (
                  <button key={m}
                    className={`cd-source-chip${crate.filters.matchMode === m ? " active" : ""}`}
                    onClick={() => patchFilters({ matchMode: m })}
                    title={m === "all_groups" ? "AND across selected categories" : "OR across all selected values"}>
                    {m === "all_groups" ? "All groups" : "Any signal"}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 0804_MUSIC_Crate_BPM_Group_Filters — BPM range + Group include/
            exclude. Unconditionally ANDed against everything above,
            regardless of Match mode (§7) — a separate section, not folded
            into the taxonomy panel above, to make that distinction visible.
            "Grouping" above (existing, unchanged) still participates in
            Match mode's own OR-together-then-AND logic; "Group" here is new. */}
        <div className="cd-taxonomy-panel cd-bpm-group-panel">
          <div className="cd-filter-row cd-filter-row--section-label">BPM &amp; Group Filters</div>

          <div className="cd-filter-row cd-filter-row--bpm">
            <span className="cd-filter-label">BPM</span>
            <input
              className="cd-bpm-input"
              type="number" step="0.01" placeholder="Min"
              value={bpmMinInput}
              onChange={(e) => setBpmMinInput(e.target.value)}
              onBlur={onBpmMinBlur}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            />
            <span className="cd-bpm-dash">–</span>
            <input
              className="cd-bpm-input"
              type="number" step="0.01" placeholder="Max"
              value={bpmMaxInput}
              onChange={(e) => setBpmMaxInput(e.target.value)}
              onBlur={onBpmMaxBlur}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            />
            {bpmActive && (
              <label className="cd-toggle-label cd-bpm-unresolved-toggle">
                <input type="checkbox" checked={bpmFilter?.includeUnresolved ?? true} onChange={toggleBpmIncludeUnresolved} />
                <span>Include unresolved</span>
              </label>
            )}
            {(bpmActive || bpmError) && (
              <button className="cd-filter-clear" onClick={clearBpmFilter}>Clear</button>
            )}
          </div>
          {bpmActive && !bpmError && (
            <div className="cd-filter-row cd-bpm-summary">
              {bpmFilter?.minimum != null && bpmFilter?.maximum != null
                ? `${bpmFilter.minimum}–${bpmFilter.maximum} BPM`
                : bpmFilter?.minimum != null
                  ? `≥ ${bpmFilter.minimum} BPM`
                  : `≤ ${bpmFilter?.maximum} BPM`}
              {" · "}{bpmFilter?.includeUnresolved ? "Unresolved included" : "Unresolved excluded"}
            </div>
          )}
          {bpmError && <div className="cd-filter-error">{bpmError}</div>}

          <div className="cd-filter-row cd-filter-row--group-mode">
            <span className="cd-filter-label">Group mode</span>
            <div className="cd-source-chips">
              {(["any", "include", "exclude"] as CrateGroupMode[]).map((m) => (
                <button key={m}
                  className={`cd-source-chip${(groupFilter?.mode ?? "any") === m ? " active" : ""}`}
                  onClick={() => setGroupMode(m)}>
                  {m === "any" ? "Any" : m === "include" ? "Include selected" : "Exclude selected"}
                </button>
              ))}
            </div>
          </div>
          {groupActive && (
            <MultiSelectFilter
              label="Group"
              options={filterOpts.groupings}
              selected={groupFilter?.groupIds ?? []}
              onChange={setGroupIds}
            />
          )}
          {groupValidationError && <div className="cd-filter-error">{groupValidationError}</div>}

          {(bpmActive || groupActive) && (
            <div className="cd-filter-row cd-filter-preview">
              {filterPreview.totalConsidered} total
              {bpmActive && ` · ${filterPreview.passBpm} pass BPM`}
              {groupActive && ` · ${filterPreview.passBpmAndGroup} pass BPM + Group`}
            </div>
          )}
        </div>
      </div>

      {/* Track list — fills remaining space, own scroll */}
      <div className="cd-track-list">
        <div className="cd-track-list-header">
          <span className="cd-tl-col cd-tl-title">Title</span>
          <span className="cd-tl-col cd-tl-artist">Artist</span>
          <span className="cd-tl-col cd-tl-num">BPM</span>
          <span className="cd-tl-col cd-tl-key">Key</span>
          <span className="cd-tl-col cd-tl-num">E</span>
          <span className="cd-tl-col cd-tl-dur">Dur</span>
          <span className="cd-tl-col cd-tl-src">Src</span>
        </div>
        <div className="cd-track-rows">
          {visibleTracks.length === 0 && (
            <div className="cd-track-empty">No tracks match — adjust filters or source.</div>
          )}
          {visibleTracks.map((t) => {
            const isThisTrack = auditionTrackId === t.trackId;
            const isPlayingThis = isThisTrack && playbackStatus === "playing";
            const hasAudio = trackHasAudio(t);
            return (
              <div
                key={t.trackId}
                className={`cd-track-row${isThisTrack ? " cd-track-row--active" : ""}`}
              >
                <span className="cd-tl-col cd-tl-title">
                  {onAuditionTrack && (
                    <button
                      className={`cd-play-btn${isThisTrack ? " cd-play-btn--active" : ""}`}
                      title={!hasAudio ? "Audio unavailable" : isPlayingThis ? "Pause" : "Play"}
                      disabled={!hasAudio}
                      onClick={() => {
                        if (isPlayingThis) {
                          onPause?.();
                        } else {
                          onAuditionTrack(t.trackId);
                        }
                      }}
                    >
                      {isPlayingThis ? "⏸" : "▶"}
                    </button>
                  )}
                  <span className="cd-track-title" title={t.title}>{t.title}</span>
                </span>
                <span className="cd-tl-col cd-tl-artist" title={t.artist}>{t.artist}</span>
                <span className="cd-tl-col cd-tl-num">{t.bpm ? Math.round(t.bpm) : "—"}</span>
                <span className="cd-tl-col cd-tl-key">{t.camelotKey ?? t.key ?? "—"}</span>
                <span className="cd-tl-col cd-tl-num">{t.energy != null ? t.energy.toFixed(1) : "—"}</span>
                <span className="cd-tl-col cd-tl-dur">{fmtDur(t.durationSeconds)}</span>
                <span className={`cd-tl-col cd-tl-src cd-src-${t.sourceOwner}`}>
                  {t.sourceOwner === "studiorich" ? "CAT" : "EXT"}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

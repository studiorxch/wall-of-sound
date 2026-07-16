import { useState, useMemo } from "react";
import type { Track, TrackSourceOwner } from "../data/trackTypes";
import type { PlaylistRecord, PlaylistBuildRecipe } from "../data/playProjectTypes";
import { buildFilterOptions } from "../logic/libraryFilters";
import { filterTracksByRecipe } from "../logic/recipeFilter";

type MatchMode = "all_groups" | "any_signal";

type Props = {
  playlist: PlaylistRecord;
  libraryTracks: Track[];
  onAddTracks: (trackIds: string[], sourceOwners: TrackSourceOwner[]) => void;
  onReplaceFromRecipe?: (trackIds: string[], sourceOwners: TrackSourceOwner[]) => void;
  onRecipeChange?: (recipe: PlaylistBuildRecipe) => void;
  panelRef?: React.RefObject<HTMLDivElement>;
  /** When true, shows a "no crates" hint above the legacy builder */
  legacyMode?: boolean;
};

function fmtDur(s: number | undefined): string {
  if (!s || !isFinite(s) || s <= 0) return "—";
  return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, "0")}`;
}

const SOURCE_OPTIONS: { owner: TrackSourceOwner; label: string }[] = [
  { owner: "studiorich", label: "CAT" },
  { owner: "external", label: "EXT" },
];

function recipeSummary(recipe: PlaylistBuildRecipe): string {
  const parts: string[] = [];
  if (recipe.sourceOwners?.length) {
    parts.push(recipe.sourceOwners.map((o) => o === "studiorich" ? "CAT" : "EXT").join("+"));
  }
  if (recipe.matchMode === "any_signal") parts.push("Any Signal");
  if (recipe.moodTags?.length) parts.push(`${recipe.moodTags.length} mood${recipe.moodTags.length !== 1 ? "s" : ""}`);
  if (recipe.groupings?.length) parts.push(`${recipe.groupings.length} group${recipe.groupings.length !== 1 ? "s" : ""}`);
  if (recipe.genres?.length) parts.push(`${recipe.genres.length} genre${recipe.genres.length !== 1 ? "s" : ""}`);
  if (recipe.minRating) parts.push(`≥${recipe.minRating}★`);
  if (recipe.search) parts.push(`"${recipe.search}"`);
  return parts.length ? parts.join(" · ") : "All tracks";
}

export function PlaylistBuilderInline({
  playlist,
  libraryTracks,
  onAddTracks,
  onReplaceFromRecipe,
  onRecipeChange,
  panelRef,
  legacyMode,
}: Props) {
  const recipe = playlist.buildRecipe;
  const hasTracks = playlist.slots.length > 0;

  // When playlist has tracks and a recipe, start collapsed (recipe bar only).
  // When playlist is empty, start with full builder open.
  const [builderOpen, setBuilderOpen] = useState(!hasTracks);

  const existingIds = useMemo(
    () => new Set(playlist.slots.map((s) => s.assignedTrackId).filter(Boolean) as string[]),
    [playlist.slots],
  );

  const [sourceOwners, setSourceOwners] = useState<TrackSourceOwner[]>(
    recipe?.sourceOwners?.length ? recipe.sourceOwners : ["studiorich"],
  );
  const [moodTags, setMoodTags] = useState<string[]>(recipe?.moodTags ?? []);
  const [groupings, setGroupings] = useState<string[]>(recipe?.groupings ?? []);
  const [genres, setGenres] = useState<string[]>(recipe?.genres ?? []);
  const [minRating, setMinRating] = useState<number>(recipe?.minRating ?? 0);
  const [search, setSearch] = useState(recipe?.search ?? "");
  const [matchMode, setMatchMode] = useState<MatchMode>(recipe?.matchMode ?? "all_groups");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [listOpen, setListOpen] = useState(false);

  const filterOpts = useMemo(() => buildFilterOptions(libraryTracks), [libraryTracks]);
  const hasSignalFilters = moodTags.length > 0 || groupings.length > 0 || genres.length > 0;

  const candidates = useMemo(
    () => filterTracksByRecipe(
      libraryTracks.filter((t) => t.sourceOwner !== "reference"),
      { sourceOwners, search, moodTags, groupings, genres, minRating, matchMode },
    ),
    [libraryTracks, sourceOwners, search, moodTags, groupings, genres, minRating, matchMode],
  );

  const notInPlaylist = useMemo(
    () => candidates.filter((t) => !existingIds.has(t.trackId)),
    [candidates, existingIds],
  );
  const alreadyIn = useMemo(
    () => candidates.filter((t) => existingIds.has(t.trackId)),
    [candidates, existingIds],
  );
  const showLowCountHint = hasSignalFilters && notInPlaylist.length === 0 && matchMode === "all_groups";

  function currentRecipe(): PlaylistBuildRecipe {
    return {
      sourceOwners,
      moodTags,
      groupings,
      genres,
      minRating: minRating || undefined,
      search: search || undefined,
      matchMode,
    };
  }

  function toggleOwner(o: TrackSourceOwner) {
    setSourceOwners((prev) => (prev.includes(o) ? prev.filter((x) => x !== o) : [...prev, o]));
  }

  function toggleChip<T>(val: T, setter: React.Dispatch<React.SetStateAction<T[]>>) {
    setter((prev) => (prev.includes(val) ? prev.filter((x) => x !== val) : [...prev, val]));
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function handleBuildFromFiltered() {
    const ids = notInPlaylist.map((t) => t.trackId);
    if (!ids.length) return;
    onRecipeChange?.(currentRecipe());
    onAddTracks(ids, sourceOwners);
    setSelected(new Set());
    setBuilderOpen(false);
  }

  function handleAddSelected() {
    const ids = [...selected].filter((id) => !existingIds.has(id));
    if (!ids.length) return;
    onRecipeChange?.(currentRecipe());
    onAddTracks(ids, sourceOwners);
    setSelected(new Set());
  }

  function handleReplaceClick() {
    const ids = candidates.map((t) => t.trackId);
    if (!ids.length) return;
    onRecipeChange?.(currentRecipe());
    onReplaceFromRecipe?.(ids, sourceOwners);
    setBuilderOpen(false);
  }

  const filteredCount = notInPlaylist.length;
  const activeFilterCount =
    moodTags.length + groupings.length + genres.length + (minRating > 0 ? 1 : 0) + (search ? 1 : 0);

  // ── Compact recipe bar (shown when playlist has tracks and builder is closed) ──
  if (hasTracks && !builderOpen) {
    return (
      <div className="pbi-recipe-bar" ref={panelRef}>
        <span className="pbi-recipe-label">Recipe:</span>
        <span className="pbi-recipe-summary">
          {recipe ? recipeSummary(recipe) : "—"}
        </span>
        <span className="pbi-recipe-count">{filteredCount} match</span>
        <div className="pbi-recipe-actions">
          <button className="pbi-recipe-btn" onClick={() => setBuilderOpen(true)}>
            Edit Recipe
          </button>
          <button
            className="pbi-recipe-btn"
            disabled={filteredCount === 0}
            onClick={() => {
              onRecipeChange?.(currentRecipe());
              onAddTracks(notInPlaylist.map((t) => t.trackId), sourceOwners);
            }}
          >
            Add Matching ({filteredCount})
          </button>
          {onReplaceFromRecipe && (
            <button
              className="pbi-recipe-btn pbi-recipe-btn--danger"
              disabled={candidates.length === 0}
              onClick={handleReplaceClick}
            >
              Replace From Recipe
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Full builder panel ──────────────────────────────────────────────────────
  return (
    <div className="pbi-panel" ref={panelRef}>
      {legacyMode && (
        <div className="pbi-no-crates-hint">
          No crates selected — add one or more crates to give Flow Curve a controlled music pool.
        </div>
      )}

      {/* ── Top bar: always visible ─────────────────────────────────────── */}
      <div className="pbi-topbar">
        <div className="pbi-topbar-left">
          <span className="pbi-title">{hasTracks ? "Add Tracks" : "Build Playlist"}</span>
          <span className="pbi-count-pill">
            {filteredCount > 0
              ? `${filteredCount} candidate${filteredCount !== 1 ? "s" : ""}`
              : "0 candidates"}
            {alreadyIn.length > 0 ? ` · ${alreadyIn.length} in playlist` : ""}
          </span>
        </div>
        <div className="pbi-topbar-right">
          {hasTracks && (
            <button className="pbi-secondary-btn" onClick={() => setBuilderOpen(false)}>
              Collapse
            </button>
          )}
          {selected.size > 0 && (
            <button className="pbi-secondary-btn" onClick={handleAddSelected}>
              Add Selected ({selected.size})
            </button>
          )}
          {hasTracks && onReplaceFromRecipe && (
            <button
              className="pbi-secondary-btn pbi-btn--danger"
              disabled={candidates.length === 0}
              onClick={handleReplaceClick}
            >
              Replace ({candidates.length})
            </button>
          )}
          <button
            className="pbi-primary-btn"
            disabled={filteredCount === 0}
            onClick={handleBuildFromFiltered}
          >
            {hasTracks
              ? `Add All Filtered${filteredCount > 0 ? ` (${filteredCount})` : ""}`
              : `Build from Filtered${filteredCount > 0 ? ` (${filteredCount})` : ""}`}
          </button>
        </div>
      </div>

      {/* ── Hint when all_groups gives 0 results ─────────────────────── */}
      {showLowCountHint && (
        <div className="pbi-hint">
          No matches with All Groups.{" "}
          <button className="pbi-hint-btn" onClick={() => setMatchMode("any_signal")}>
            Try Any Signal
          </button>{" "}
          or remove a filter.
        </div>
      )}

      {/* ── Filters (collapsible) ────────────────────────────────────── */}
      <div className="pbi-section-toggle" onClick={() => setFiltersOpen((v) => !v)}>
        <span>{filtersOpen ? "▾" : "▸"} Filters</span>
        {activeFilterCount > 0 && (
          <span className="pbi-active-badge">{activeFilterCount} active</span>
        )}
      </div>

      {filtersOpen && (
        <div className="pbi-filters">
          {/* Source pool */}
          <div className="pbi-filter-row">
            <span className="pbi-filter-label">Source</span>
            <div className="pbi-chips">
              {SOURCE_OPTIONS.map(({ owner, label }) => (
                <button
                  key={owner}
                  className={`pbi-chip${sourceOwners.includes(owner) ? " active" : ""}`}
                  onClick={() => toggleOwner(owner)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Search */}
          <div className="pbi-filter-row">
            <span className="pbi-filter-label">Search</span>
            <input
              className="pbi-search"
              placeholder="title, artist…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Mood tags */}
          {filterOpts.moods.length > 0 && (
            <div className="pbi-filter-row">
              <span className="pbi-filter-label">Mood</span>
              <div className="pbi-chips pbi-chips-wrap">
                {[
                  ...filterOpts.moods.filter((m) => moodTags.includes(m)),
                  ...filterOpts.moods.filter((m) => !moodTags.includes(m)),
                ].map((m) => (
                  <button
                    key={m}
                    className={`pbi-chip pbi-chip-sm${moodTags.includes(m) ? " active" : ""}`}
                    onClick={() => toggleChip(m, setMoodTags)}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Groupings */}
          {filterOpts.groupings.length > 0 && (
            <div className="pbi-filter-row">
              <span className="pbi-filter-label">Group</span>
              <div className="pbi-chips pbi-chips-wrap">
                {[
                  ...filterOpts.groupings.filter((g) => groupings.includes(g)),
                  ...filterOpts.groupings.filter((g) => !groupings.includes(g)),
                ].map((g) => (
                  <button
                    key={g}
                    className={`pbi-chip pbi-chip-sm${groupings.includes(g) ? " active" : ""}`}
                    onClick={() => toggleChip(g, setGroupings)}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Genres */}
          {filterOpts.genres.length > 0 && (
            <div className="pbi-filter-row">
              <span className="pbi-filter-label">Genre</span>
              <div className="pbi-chips pbi-chips-wrap">
                {[
                  ...filterOpts.genres.filter((g) => genres.includes(g)),
                  ...filterOpts.genres.filter((g) => !genres.includes(g)),
                ].slice(0, 32).map((g) => (
                  <button
                    key={g}
                    className={`pbi-chip pbi-chip-sm${genres.includes(g) ? " active" : ""}`}
                    onClick={() => toggleChip(g, setGenres)}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Rating */}
          <div className="pbi-filter-row">
            <span className="pbi-filter-label">Rating ≥</span>
            <div className="pbi-chips">
              {[0, 1, 2, 3, 4, 5].map((r) => (
                <button
                  key={r}
                  className={`pbi-chip pbi-chip-sm${minRating === r ? " active" : ""}`}
                  onClick={() => setMinRating(r)}
                >
                  {r === 0 ? "Any" : `${r}★`}
                </button>
              ))}
            </div>
          </div>

          {/* Match mode — only when signal filters are selected */}
          {hasSignalFilters && (
            <div className="pbi-filter-row pbi-filter-row-match">
              <span className="pbi-filter-label">Match</span>
              <div className="pbi-chips">
                <button
                  className={`pbi-chip pbi-chip-sm${matchMode === "all_groups" ? " active" : ""}`}
                  onClick={() => setMatchMode("all_groups")}
                  title="Track must match ALL selected categories (OR within each)"
                >
                  All groups
                </button>
                <button
                  className={`pbi-chip pbi-chip-sm${matchMode === "any_signal" ? " active" : ""}`}
                  onClick={() => setMatchMode("any_signal")}
                  title="Track matches if it hits ANY selected mood, group, or genre"
                >
                  Any signal
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Candidate list (collapsible) ────────────────────────────── */}
      <div className="pbi-section-toggle" onClick={() => setListOpen((v) => !v)}>
        <span>{listOpen ? "▾" : "▸"} Preview candidates</span>
        {listOpen && notInPlaylist.length > 0 && (
          <span className="pbi-list-actions-inline">
            <button
              className="pbi-list-action"
              onClick={(e) => {
                e.stopPropagation();
                setSelected(new Set(notInPlaylist.map((t) => t.trackId)));
              }}
            >
              Select All
            </button>
            <button
              className="pbi-list-action"
              onClick={(e) => {
                e.stopPropagation();
                setSelected(new Set());
              }}
              disabled={selected.size === 0}
            >
              Clear
            </button>
          </span>
        )}
      </div>

      {listOpen && (
        <div className="pbi-list">
          {notInPlaylist.length === 0 && (
            <div className="pbi-empty">
              {showLowCountHint
                ? "Switch to Any Signal or remove a filter to see candidates."
                : "No candidates match these filters."}
            </div>
          )}
          {notInPlaylist.map((t) => (
            <div
              key={t.trackId}
              className={`pbi-row${selected.has(t.trackId) ? " selected" : ""}`}
              onClick={() => toggleSelect(t.trackId)}
            >
              <input type="checkbox" className="pbi-check" checked={selected.has(t.trackId)} readOnly />
              <span className="pbi-row-title">{t.title}</span>
              <span className="pbi-row-artist">{t.artist}</span>
              <span className="pbi-row-dur">{fmtDur(t.durationSeconds)}</span>
              <span className={`pbi-row-source pbi-src-${t.sourceOwner ?? "unknown"}`}>
                {t.sourceOwner === "studiorich" ? "CAT" : "EXT"}
              </span>
            </div>
          ))}
          {alreadyIn.length > 0 && (
            <>
              <div className="pbi-list-section">Already in playlist ({alreadyIn.length})</div>
              {alreadyIn.map((t) => (
                <div key={t.trackId} className="pbi-row pbi-row-in-playlist">
                  <span className="pbi-row-title">{t.title}</span>
                  <span className="pbi-row-artist">{t.artist}</span>
                  <span className="pbi-row-dur">{fmtDur(t.durationSeconds)}</span>
                  <span className="pbi-row-in-badge">✓</span>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

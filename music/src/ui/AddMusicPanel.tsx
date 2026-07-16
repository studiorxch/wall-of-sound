import { useState, useMemo } from "react";
import type { Track, TrackSourceOwner, TrackRating } from "../data/trackTypes";
import type { PlaylistRecord } from "../data/playProjectTypes";
import { filterTracksByLibraryFilters, buildFilterOptions } from "../logic/libraryFilters";
import { playlistContainsTrack } from "../logic/playlistMembership";

type Props = {
  playlist: PlaylistRecord;
  libraryTracks: Track[];
  tracksById: Map<string, Track>;
  onAdd: (trackIds: string[], sourceOwners: TrackSourceOwner[]) => void;
  onReplace: (trackIds: string[], sourceOwners: TrackSourceOwner[]) => void;
  onClose: () => void;
};

const MUSIC_OWNERS: TrackSourceOwner[] = ["studiorich", "external"];

export function AddMusicPanel({ playlist, libraryTracks, tracksById, onAdd, onReplace, onClose }: Props) {
  // Seed source pool from playlist's allowedSourceOwners, limited to CAT/EXT
  const initialOwners = (playlist.allowedSourceOwners ?? ["studiorich"]).filter(
    (o): o is TrackSourceOwner => MUSIC_OWNERS.includes(o as TrackSourceOwner)
  );
  const [activeOwners, setActiveOwners] = useState<TrackSourceOwner[]>(
    initialOwners.length > 0 ? initialOwners : ["studiorich"]
  );
  const [search, setSearch] = useState("");
  const [mood, setMood] = useState("");
  const [group, setGroup] = useState("");
  const [genre, setGenre] = useState("");
  const [minRating, setMinRating] = useState<TrackRating>(0);
  const [playableOnly, setPlayableOnly] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [replaceConfirm, setReplaceConfirm] = useState(false);

  // Candidate pool: library tracks in selected sources, not reference
  const scopedTracks = useMemo(
    () => libraryTracks.filter((t) => t.sourceOwner && activeOwners.includes(t.sourceOwner as TrackSourceOwner)),
    [libraryTracks, activeOwners]
  );

  const filterOptions = useMemo(() => buildFilterOptions(scopedTracks), [scopedTracks]);

  const filtered = useMemo(() => {
    let result = filterTracksByLibraryFilters(scopedTracks, { search, grouping: group, genre, minRating, hasMood: mood ? "mooded" : "any" });
    if (mood) result = result.filter((t) => (t.moodTags ?? []).includes(mood) || t.primaryMood === mood);
    if (playableOnly) result = result.filter((t) => t.audioLinked);
    return result;
  }, [scopedTracks, search, mood, group, genre, minRating, playableOnly]);

  const alreadyInPlaylist = useMemo(() => {
    const set = new Set<string>();
    for (const t of filtered) {
      if (playlistContainsTrack({ slots: playlist.slots, track: t, tracksById })) {
        set.add(t.trackId);
      }
    }
    return set;
  }, [filtered, playlist.slots, tracksById]);

  const candidates = filtered.filter((t) => !alreadyInPlaylist.has(t.trackId));
  const alreadyShown = filtered.filter((t) => alreadyInPlaylist.has(t.trackId));

  function toggleOwner(owner: TrackSourceOwner) {
    setActiveOwners((prev) => {
      if (prev.includes(owner)) {
        if (prev.length === 1) return prev; // keep at least one
        return prev.filter((o) => o !== owner);
      }
      return [...prev, owner];
    });
    setSelectedIds(new Set());
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(candidates.map((t) => t.trackId)));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  function handleAdd(trackIds: string[]) {
    if (trackIds.length === 0) return;
    onAdd(trackIds, activeOwners);
    setSelectedIds(new Set());
  }

  function handleReplace(trackIds: string[]) {
    if (trackIds.length === 0) return;
    onReplace(trackIds, activeOwners);
    setReplaceConfirm(false);
    setSelectedIds(new Set());
  }

  const selectedCandidates = [...selectedIds].filter((id) => !alreadyInPlaylist.has(id));

  return (
    <div className="amp-panel">
      <div className="amp-header">
        <span className="amp-title">Add Music</span>
        <button className="amp-close" onClick={onClose} title="Close">✕</button>
      </div>

      {/* Source pool toggles */}
      <div className="amp-source-row">
        {([
          { owner: "studiorich" as TrackSourceOwner, label: "CAT" },
          { owner: "external" as TrackSourceOwner, label: "EXT" },
        ]).map(({ owner, label }) => (
          <button
            key={owner}
            className={`npd-source-btn${activeOwners.includes(owner) ? " npd-source-btn--on" : ""}`}
            onClick={() => toggleOwner(owner)}
          >
            {label}
          </button>
        ))}
        <span className="amp-source-hint">
          {activeOwners.includes("studiorich") && activeOwners.includes("external")
            ? "Catalog + External"
            : activeOwners.includes("studiorich")
            ? "Catalog only"
            : "External only"}
        </span>
      </div>

      {/* Filters */}
      <div className="amp-filters">
        <input
          className="amp-search"
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="amp-filter-row">
          {filterOptions.moods.length > 0 && (
            <select className="amp-sel" value={mood} onChange={(e) => setMood(e.target.value)}>
              <option value="">Mood</option>
              {filterOptions.moods.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          )}
          {filterOptions.groupings.length > 0 && (
            <select className="amp-sel" value={group} onChange={(e) => setGroup(e.target.value)}>
              <option value="">Group</option>
              {filterOptions.groupings.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          )}
          {filterOptions.genres.length > 0 && (
            <select className="amp-sel" value={genre} onChange={(e) => setGenre(e.target.value)}>
              <option value="">Genre</option>
              {filterOptions.genres.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          )}
          <select className="amp-sel" value={minRating} onChange={(e) => setMinRating(Number(e.target.value) as TrackRating)}>
            <option value={0}>Rating: any</option>
            <option value={3}>★★★+</option>
            <option value={4}>★★★★+</option>
            <option value={5}>★★★★★</option>
          </select>
          <label className="amp-check-label">
            <input type="checkbox" checked={playableOnly} onChange={(e) => setPlayableOnly(e.target.checked)} />
            Linked only
          </label>
        </div>
      </div>

      {/* Stats + bulk actions */}
      <div className="amp-actions-row">
        <span className="amp-count">
          {candidates.length} available
          {alreadyShown.length > 0 && <span className="amp-already-count"> · {alreadyShown.length} already in playlist</span>}
        </span>
        <div className="amp-action-btns">
          {selectedCandidates.length > 0 ? (
            <>
              <span className="amp-sel-count">{selectedCandidates.length} selected</span>
              <button className="amp-btn amp-btn--primary" onClick={() => handleAdd(selectedCandidates)}>
                Add Selected
              </button>
              <button className="amp-btn" onClick={clearSelection}>Clear</button>
            </>
          ) : (
            <button className="amp-btn" onClick={selectAll} disabled={candidates.length === 0}>
              Select All
            </button>
          )}
          <button
            className="amp-btn"
            disabled={candidates.length === 0}
            onClick={() => handleAdd(candidates.map((t) => t.trackId))}
            title="Append all filtered tracks to playlist"
          >
            Add All Filtered
          </button>
          {!replaceConfirm ? (
            <button
              className="amp-btn amp-btn--danger"
              disabled={filtered.length === 0}
              onClick={() => setReplaceConfirm(true)}
              title="Replace playlist contents with filtered results"
            >
              Replace…
            </button>
          ) : (
            <span className="amp-replace-confirm">
              Replace {playlist.slots.filter((s) => s.assignedTrackId).length} tracks with {filtered.length}?
              <button className="amp-btn amp-btn--danger" onClick={() => handleReplace(filtered.map((t) => t.trackId))}>Confirm</button>
              <button className="amp-btn" onClick={() => setReplaceConfirm(false)}>Cancel</button>
            </span>
          )}
        </div>
      </div>

      {/* Track list */}
      <div className="amp-list">
        {candidates.length === 0 && alreadyShown.length === 0 && (
          <div className="amp-empty">No tracks match the current filters.</div>
        )}
        {candidates.map((t) => (
          <div
            key={t.trackId}
            className={`amp-row${selectedIds.has(t.trackId) ? " amp-row--selected" : ""}`}
            onClick={() => toggleSelect(t.trackId)}
          >
            <input
              type="checkbox"
              className="amp-row-check"
              checked={selectedIds.has(t.trackId)}
              onChange={() => toggleSelect(t.trackId)}
              onClick={(e) => e.stopPropagation()}
            />
            <span className="amp-row-title" title={t.title}>{t.title}</span>
            <span className="amp-row-meta">
              {t.artist && <span className="amp-row-artist">{t.artist}</span>}
              {t.rating ? <span className="amp-row-rating">{"★".repeat(t.rating)}</span> : null}
              {t.durationSeconds ? <span className="amp-row-dur">{Math.floor(t.durationSeconds / 60)}:{String(Math.round(t.durationSeconds % 60)).padStart(2, "0")}</span> : null}
            </span>
          </div>
        ))}
        {alreadyShown.length > 0 && (
          <>
            <div className="amp-divider">Already in playlist</div>
            {alreadyShown.map((t) => (
              <div key={t.trackId} className="amp-row amp-row--added">
                <span className="amp-row-check-ph">✓</span>
                <span className="amp-row-title" title={t.title}>{t.title}</span>
                <span className="amp-row-meta">
                  {t.artist && <span className="amp-row-artist">{t.artist}</span>}
                </span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

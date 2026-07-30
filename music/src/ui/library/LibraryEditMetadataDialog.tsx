// Selection "Edit Metadata" dialog — consolidates the four bulk metadata
// fields (Set Artist, Set Genre, Add Mood, Remove Mood) that previously lived
// as separate inline-expanding controls under LibraryActionBar's "More…"
// row into one entry point, per the compact selection-bar redesign
// (0728B_MUSIC_Catalog_Selection_Actions). Each field applies independently
// through the SAME existing onBulkUpdate path and App.tsx per-track-merge
// convention (_bulkGenreMode/_bulkMoodMode) — no new mutation logic.

import { useState } from "react";
import type { Track } from "../../data/trackTypes";
import { parseDelimitedTags } from "../../logic/trackMetadata";

interface Props {
  selectedTracks: Track[];
  onBulkUpdate: (trackIds: string[], patch: Partial<Track>) => void;
  onClose: () => void;
}

export function LibraryEditMetadataDialog({ selectedTracks, onBulkUpdate, onClose }: Props) {
  const selectedIds = selectedTracks.map((t) => t.trackId);
  const [artist, setArtist] = useState("");
  const [genre, setGenre] = useState("");
  const [moodAdd, setMoodAdd] = useState("");
  const [moodRemove, setMoodRemove] = useState("");
  const [applied, setApplied] = useState<string[]>([]);

  function applyArtist() {
    if (!artist.trim()) return;
    onBulkUpdate(selectedIds, { artist: artist.trim() });
    setApplied((a) => [...a, `Artist → "${artist.trim()}"`]);
    setArtist("");
  }
  function applyGenre() {
    const tags = parseDelimitedTags(genre);
    if (!tags.length) return;
    onBulkUpdate(selectedIds, { genres: tags, _bulkGenreMode: "replace" } as unknown as Partial<Track>);
    setApplied((a) => [...a, `Genre → ${tags.join(", ")}`]);
    setGenre("");
  }
  function applyMoodAdd() {
    const tags = parseDelimitedTags(moodAdd);
    if (!tags.length) return;
    onBulkUpdate(selectedIds, { moodTags: tags, _bulkMoodMode: "add" } as unknown as Partial<Track>);
    setApplied((a) => [...a, `Added mood: ${tags.join(", ")}`]);
    setMoodAdd("");
  }
  function applyMoodRemove() {
    const tags = parseDelimitedTags(moodRemove);
    if (!tags.length) return;
    onBulkUpdate(selectedIds, { moodTags: tags, _bulkMoodMode: "remove" } as unknown as Partial<Track>);
    setApplied((a) => [...a, `Removed mood: ${tags.join(", ")}`]);
    setMoodRemove("");
  }

  return (
    <div className="export-modal-overlay" onClick={onClose}>
      <div className="export-modal cat-batch-comments-dialog" onClick={(e) => e.stopPropagation()}>
        <h3>Edit Metadata — {selectedTracks.length} track{selectedTracks.length !== 1 ? "s" : ""}</h3>

        <div className="cat-group-input-row">
          <input
            className="cat-filter-search" style={{ flex: 1 }} placeholder="Artist name…" value={artist}
            onChange={(e) => setArtist(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") applyArtist(); }}
          />
          <button className="tb-btn sm" onClick={applyArtist}>Set Artist</button>
        </div>

        <div className="cat-group-input-row">
          <input
            className="cat-filter-search" style={{ flex: 1 }} placeholder="House, Deep House…" value={genre}
            onChange={(e) => setGenre(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") applyGenre(); }}
          />
          <button className="tb-btn sm" onClick={applyGenre}>Set Genre</button>
        </div>

        <div className="cat-group-input-row">
          <input
            className="cat-filter-search" style={{ flex: 1 }} placeholder="Dreamy, Hypnotic…" value={moodAdd}
            onChange={(e) => setMoodAdd(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") applyMoodAdd(); }}
          />
          <button className="tb-btn sm" onClick={applyMoodAdd}>Add Mood</button>
        </div>

        <div className="cat-group-input-row">
          <input
            className="cat-filter-search" style={{ flex: 1 }} placeholder="Dreamy, Hypnotic…" value={moodRemove}
            onChange={(e) => setMoodRemove(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") applyMoodRemove(); }}
          />
          <button className="tb-btn sm" onClick={applyMoodRemove}>Remove Mood</button>
        </div>

        {applied.length > 0 && (
          <div className="cat-batch-comments-preview">
            {applied.map((a, i) => <div key={i}>{a}</div>)}
          </div>
        )}

        <div className="cat-batch-comments-actions">
          <button className="tb-btn sm" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

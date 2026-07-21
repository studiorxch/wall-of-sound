import { useState } from "react";
import { SourceBadge } from "./SourceBadge";
import type { PlaylistRecord } from "../data/playProjectTypes";
import type { Track, TrackSourceOwner } from "../data/trackTypes";
import type { MusicSourcePool } from "../data/sourcePoolTypes";
import { type TrackDragPayload } from "../logic/playlistMembership";

export type ViewMode = "playlist" | "library" | "groups" | "orphans" | "excluded" | "locks" | "playlists_grid" | "sampler_banks_grid" | "crates_grid" | "crate_detail" | "artists" | "mood_signal_audit" | "analyzer_review" | "loop_library" | "sectional_looper" | "radio" | "radio_playlists_grid" | "radio_banks_grid" | "collections_overview" | "radio_loopchain_player";

type Props = {
  playlists: PlaylistRecord[];
  activePlaylistId: string;
  libraryTracks: Track[];
  orphanCount: number;
  excludedCount: number;
  lockedCount: number;
  viewMode: ViewMode;
  sourceOwnerFilter?: TrackSourceOwner | null;
  onSelectPlaylist: (id: string) => void;
  onViewModeChange: (m: ViewMode) => void;
  onSourceOwnerFilterChange?: (owner: TrackSourceOwner | null) => void;
  onCreatePlaylist: () => void;
  onDuplicatePlaylist: (id: string) => void;
  onDeletePlaylist: (id: string) => void;
  onDropTracksOnPlaylist: (playlistId: string, payload: TrackDragPayload) => void;
  sourcePools?: MusicSourcePool[];
  onCreateSourcePoolFromPlaylist?: (playlistId: string) => void;
  onPlayOnDeckA?: (playlistId: string) => void;
  onPlayOnDeckB?: (playlistId: string) => void;
  onCreateSamplerBank?: () => void;
  crateCount?: number;
  onViewCrates?: () => void;
  artistCount?: number;
  onImportAudioClick?: () => void;
  loopCount?: number;
  // 0718A_MUSIC_RADIO_Clean_Board_and_Explicit_Send_Flows §9 — RADIO is
  // nested BENEATH Collections (Crates/Playlists/Banks/RADIO → Playlists/
  // Banks), never a sibling top-level section. These are RADIO-local
  // counts only (received playlists/banks), never a MUSIC-wide count.
  radioPlaylistCount?: number;
  radioBankCount?: number;
};


export function FileManager({
  playlists, activePlaylistId: _activePlaylistId, libraryTracks,
  orphanCount: _orphanCount, excludedCount: _excludedCount, lockedCount: _lockedCount,
  viewMode, sourceOwnerFilter, onSelectPlaylist: _onSelectPlaylist, onViewModeChange, onSourceOwnerFilterChange,
  onCreatePlaylist: _onCreatePlaylist, onDuplicatePlaylist, onDeletePlaylist, onDropTracksOnPlaylist: _onDropTracksOnPlaylist,
  onPlayOnDeckA, onPlayOnDeckB, onCreateSamplerBank: _onCreateSamplerBank,
  crateCount = 0, onViewCrates, artistCount = 0, onImportAudioClick, loopCount = 0,
  radioPlaylistCount = 0, radioBankCount = 0,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{ playlistId: string; x: number; y: number } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  return (
    <nav
      className={`file-manager${collapsed ? " fm-collapsed" : ""}`}
      onClick={() => ctxMenu && setCtxMenu(null)}
    >
      <button
        className="fm-toggle"
        onClick={() => setCollapsed((c) => !c)}
        title={collapsed ? "Expand" : "Collapse"}
      >
        {collapsed ? "›" : "‹"}
      </button>

      {!collapsed && (
        <div className="fm-body">
          {/* Libraries */}
          {(() => {
            const counts: Record<TrackSourceOwner, number> = { studiorich: 0, external: 0, reference: 0, unknown: 0 };
            for (const t of libraryTracks) counts[t.sourceOwner ?? "unknown"]++;

            const sourceRows: { owner: TrackSourceOwner; label: string }[] = [
              { owner: "studiorich", label: "Catalog" },
              { owner: "external",   label: "External" },
              { owner: "reference",  label: "Sounds" },
            ];

            return (
              <div className="fm-section">
                <div className="fm-section-header">
                  <span>Libraries</span>
                  {onImportAudioClick && (
                    <button className="fm-section-action" onClick={onImportAudioClick} title="Import audio into Catalog, External, or Sounds">
                      + Import Audio
                    </button>
                  )}
                </div>

                {sourceRows.map(({ owner, label }) => {
                  const count = counts[owner];
                  const isActive = viewMode === "library" && sourceOwnerFilter === owner;
                  return (
                    <button
                      key={owner}
                      className={`fm-item fm-source-row${isActive ? " active" : ""}`}
                      onClick={() => {
                        onViewModeChange("library");
                        onSourceOwnerFilterChange?.(owner);
                      }}
                    >
                      <SourceBadge source={owner} />
                      <span className="fm-label">{label}</span>
                      {count > 0 && <span className="fm-count">{count}</span>}
                      {count === 0 && <span className="fm-count fm-count-empty">0</span>}
                    </button>
                  );
                })}

                <button
                  className={`fm-item fm-nav-item${viewMode === "artists" ? " active" : ""}`}
                  onClick={() => onViewModeChange("artists")}
                >
                  <SourceBadge source="ART" />
                  <span className="fm-label">Artists</span>
                  {artistCount > 0 && <span className="fm-count">{artistCount}</span>}
                </button>

                <button
                  className={`fm-item fm-nav-item${viewMode === "loop_library" ? " active" : ""}`}
                  onClick={() => onViewModeChange("loop_library")}
                >
                  <span className="fm-nav-icon">↻</span>
                  <span className="fm-label">Loops</span>
                  {loopCount > 0 && <span className="fm-count">{loopCount}</span>}
                </button>

                <button
                  className={`fm-item fm-nav-item${viewMode === "mood_signal_audit" ? " active" : ""}`}
                  onClick={() => onViewModeChange("mood_signal_audit")}
                >
                  <span className="fm-nav-icon" style={{ color: "var(--mood-calm)" }}>◉</span>
                  <span className="fm-label">Mood Signals</span>
                </button>

                <button
                  className={`fm-item fm-nav-item${viewMode === "analyzer_review" ? " active" : ""}`}
                  onClick={() => onViewModeChange("analyzer_review")}
                >
                  <span className="fm-nav-icon" style={{ color: "var(--mood-hypnotic, var(--mood-calm))" }}>⊞</span>
                  <span className="fm-label">Analyzer Review</span>
                </button>

              </div>
            );
          })()}

          {/* AUDIOLAB / Experiments (§3, §25) */}
          <div className="fm-section">
            <div className="fm-section-header">AudioLab</div>
            <button
              className={`fm-item fm-nav-item${viewMode === "sectional_looper" ? " active" : ""}`}
              onClick={() => onViewModeChange("sectional_looper")}
            >
              <span className="fm-nav-icon">⟲</span>
              <span className="fm-label">Sectional Looper</span>
            </button>
          </div>

          {/* Collections — category nav (grid pages). 0718A §9 — RADIO is
              nested BENEATH Collections as a clickable sub-section (not a
              sibling top-level section): Crates/Playlists/Banks, then a
              "RADIO" sub-header opening the RADIO Dashboard, with its own
              nested Playlists/Banks rows. "Collections" itself is now a
              clickable button opening a small overview page. */}
          {(() => {
            const musicCount = playlists.filter((pl) => pl.playlistKind !== "reference_overlay").length;
            const bankCount = playlists.filter((pl) => pl.playlistKind === "reference_overlay").length;
            return (
              <div className="fm-section">
                <button
                  className={`fm-section-header fm-section-header--clickable${viewMode === "collections_overview" ? " active" : ""}`}
                  onClick={() => onViewModeChange("collections_overview")}
                >
                  Collections
                </button>
                <button
                  className={`fm-item fm-nav-item${viewMode === "crates_grid" || viewMode === "crate_detail" ? " active" : ""}`}
                  onClick={() => onViewCrates ? onViewCrates() : onViewModeChange("crates_grid")}
                >
                  <span className="fm-nav-icon">◈</span>
                  <span className="fm-label">Crates</span>
                  <span className="fm-count">{crateCount}</span>
                </button>
                <button
                  className={`fm-item fm-nav-item${viewMode === "playlists_grid" ? " active" : ""}`}
                  onClick={() => onViewModeChange("playlists_grid")}
                >
                  <span className="fm-nav-icon">♫</span>
                  <span className="fm-label">Playlists</span>
                  <span className="fm-count">{musicCount}</span>
                </button>
                <button
                  className={`fm-item fm-nav-item${viewMode === "sampler_banks_grid" ? " active" : ""}`}
                  onClick={() => onViewModeChange("sampler_banks_grid")}
                >
                  <span className="fm-nav-icon">▦</span>
                  <span className="fm-label">Banks</span>
                  <span className="fm-count">{bankCount}</span>
                </button>

                <button
                  className={`fm-subsection-header${viewMode === "radio" ? " active" : ""}`}
                  onClick={() => onViewModeChange("radio")}
                >
                  <span className="fm-nav-icon">◎</span>
                  <span className="fm-label">RADIO</span>
                </button>
                <button
                  className={`fm-item fm-nav-item fm-item--nested${viewMode === "radio_playlists_grid" ? " active" : ""}`}
                  onClick={() => onViewModeChange("radio_playlists_grid")}
                >
                  <span className="fm-label">Playlists</span>
                  <span className="fm-count">{radioPlaylistCount}</span>
                </button>
                <button
                  className={`fm-item fm-nav-item fm-item--nested${viewMode === "radio_banks_grid" ? " active" : ""}`}
                  onClick={() => onViewModeChange("radio_banks_grid")}
                >
                  <span className="fm-label">Banks</span>
                  <span className="fm-count">{radioBankCount}</span>
                </button>
              </div>
            );
          })()}
        </div>
      )}

      {/* Context menu */}
      {ctxMenu && (
        <div className="ctx-menu" style={{ left: ctxMenu.x, top: ctxMenu.y }}>
          {onPlayOnDeckA && (
            <button className="ctx-item" onClick={() => { onPlayOnDeckA(ctxMenu.playlistId); setCtxMenu(null); }}>
              Play
            </button>
          )}
          {onPlayOnDeckB && (
            <button className="ctx-item" onClick={() => { onPlayOnDeckB(ctxMenu.playlistId); setCtxMenu(null); }}>
              Load in Sampler
            </button>
          )}
          {(onPlayOnDeckA || onPlayOnDeckB) && <div className="ctx-sep" />}
          <button
            className="ctx-item"
            onClick={() => { onDuplicatePlaylist(ctxMenu.playlistId); setCtxMenu(null); }}
          >
            Duplicate
          </button>
          <div className="ctx-sep" />
          <button
            className={`ctx-item danger${playlists.length <= 1 ? " ctx-item-disabled" : ""}`}
            disabled={playlists.length <= 1}
            onClick={() => {
              if (playlists.length > 1) { setDeleteConfirm(ctxMenu.playlistId); setCtxMenu(null); }
            }}
            title={playlists.length <= 1 ? "Cannot delete the last playlist" : ""}
          >
            Delete…
          </button>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <div className="export-modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="export-modal" style={{ maxWidth: 360 }} onClick={(e) => e.stopPropagation()}>
            <div className="export-modal-header">
              <span>Delete Playlist?</span>
              <button className="export-modal-close" onClick={() => setDeleteConfirm(null)}>✕</button>
            </div>
            <div style={{ padding: "14px 16px", fontSize: 12, color: "var(--text-mid)", lineHeight: 1.5 }}>
              "{playlists.find((p) => p.playlistId === deleteConfirm)?.title}" will be removed.
              Library tracks are not deleted.
            </div>
            <div className="export-modal-footer">
              <button className="tb-btn" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button
                className="tb-btn remove-btn"
                onClick={() => { onDeletePlaylist(deleteConfirm); setDeleteConfirm(null); }}
              >
                Delete Playlist
              </button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}

import { useState } from "react";
import type { PlaylistRecord } from "../data/playProjectTypes";
import type { Track, TrackSourceOwner } from "../data/trackTypes";
import type { MusicSourcePool } from "../data/sourcePoolTypes";
import { type TrackDragPayload } from "../logic/playlistMembership";

export type ViewMode = "playlist" | "library" | "groups" | "orphans" | "excluded" | "locks" | "playlists_grid" | "sampler_banks_grid";

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
};


export function FileManager({
  playlists, activePlaylistId, libraryTracks,
  orphanCount, excludedCount, lockedCount,
  viewMode, sourceOwnerFilter, onSelectPlaylist, onViewModeChange, onSourceOwnerFilterChange,
  onCreatePlaylist, onDuplicatePlaylist, onDeletePlaylist, onDropTracksOnPlaylist,
  onPlayOnDeckA, onPlayOnDeckB, onCreateSamplerBank,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{ playlistId: string; x: number; y: number } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  function handlePlaylistClick(id: string) {
    onSelectPlaylist(id);
    onViewModeChange("playlist");
  }

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

            const sourceRows: { owner: TrackSourceOwner; label: string; badge: string }[] = [
              { owner: "studiorich", label: "Catalog", badge: "CAT" },
              { owner: "external",   label: "External",           badge: "EXT" },
              { owner: "reference",  label: "Reference",          badge: "REF" },
            ];

            return (
              <div className="fm-section">
                <div className="fm-section-header">Libraries</div>

                {sourceRows.map(({ owner, label, badge }) => {
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
                      <span className={`fm-source-badge fm-source-${owner}`}>{badge}</span>
                      <span className="fm-label">{label}</span>
                      {count > 0 && <span className="fm-count">{count}</span>}
                      {count === 0 && <span className="fm-count fm-count-empty">0</span>}
                    </button>
                  );
                })}

              </div>
            );
          })()}

          {/* Collections — category nav (grid pages) */}
          {(() => {
            const musicCount = playlists.filter((pl) => pl.playlistKind !== "reference_overlay").length;
            const bankCount = playlists.filter((pl) => pl.playlistKind === "reference_overlay").length;
            return (
              <div className="fm-section">
                <div className="fm-section-header">Collections</div>
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
                  <span className="fm-label">Sampler Banks</span>
                  <span className="fm-count">{bankCount}</span>
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

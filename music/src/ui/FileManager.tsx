import { useState } from "react";
import { Icon, type IconName } from "./Icon";
import type { PlaylistRecord } from "../data/playProjectTypes";
import type { Track, TrackSourceOwner } from "../data/trackTypes";
import type { MusicSourcePool } from "../data/sourcePoolTypes";
import { type TrackDragPayload } from "../logic/playlistMembership";

// "loop_library" is retired from the sidebar and never set by any nav
// row — kept only so App.tsx can recognize and redirect a stray reference
// to Sounds with the Loops filter selected, rather than the value being an
// unrecognized string.
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
  // 0718A_MUSIC_RADIO_Clean_Board_and_Explicit_Send_Flows §9 — RADIO is
  // nested BENEATH Collections (Crates/Playlists/Banks/RADIO → Playlists/
  // Banks), never a sibling top-level section. These are RADIO-local
  // counts only (received playlists/banks), never a MUSIC-wide count.
  radioPlaylistCount?: number;
  radioBankCount?: number;
};

type NavRowProps = {
  icon: IconName;
  label: string;
  count?: number;
  active: boolean;
  nested?: boolean;
  onClick: () => void;
};

// 0722_MUSIC_Left_Panel_Visual_Normalization — every destination shares this
// one row grid (icon | label | count) and one active treatment, so no
// destination can drift from another in height, alignment, or highlight.
function NavRow({ icon, label, count, active, nested, onClick }: NavRowProps) {
  return (
    <button
      className={`fm-row${nested ? " fm-row--nested" : ""}${active ? " active" : ""}`}
      onClick={onClick}
    >
      <span className="fm-row-icon"><Icon name={icon} /></span>
      <span className="fm-row-label">{label}</span>
      <span className="fm-row-count">{count ?? ""}</span>
    </button>
  );
}

export function FileManager({
  playlists, activePlaylistId: _activePlaylistId, libraryTracks,
  orphanCount: _orphanCount, excludedCount: _excludedCount, lockedCount: _lockedCount,
  viewMode, sourceOwnerFilter, onSelectPlaylist: _onSelectPlaylist, onViewModeChange, onSourceOwnerFilterChange,
  onCreatePlaylist: _onCreatePlaylist, onDuplicatePlaylist, onDeletePlaylist, onDropTracksOnPlaylist: _onDropTracksOnPlaylist,
  onPlayOnDeckA, onPlayOnDeckB, onCreateSamplerBank: _onCreateSamplerBank,
  crateCount = 0, onViewCrates, artistCount = 0,
  radioPlaylistCount = 0, radioBankCount = 0,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{ playlistId: string; x: number; y: number } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const sourceCounts: Record<TrackSourceOwner, number> = { studiorich: 0, external: 0, reference: 0, unknown: 0 };
  for (const t of libraryTracks) sourceCounts[t.sourceOwner ?? "unknown"]++;

  const musicPlaylistCount = playlists.filter((pl) => pl.playlistKind !== "reference_overlay").length;
  const bankCount = playlists.filter((pl) => pl.playlistKind === "reference_overlay").length;

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
        <Icon name={collapsed ? "chevron_right" : "chevron_left"} />
      </button>

      {!collapsed && (
        <div className="fm-body">
          {/* Plain product label — the StudioRich mark lives in the top
              bar (TopBar.tsx's .tb-logo); MUSIC sits directly beneath it
              here as static text only. Never a nav row: no icon, count,
              active state, hover state, or click handler. */}
          <div className="fm-brand">MUSIC</div>
          <div className="fm-section">
            <div className="fm-section-header">Libraries</div>
            <NavRow
              icon="library_music"
              label="Catalog"
              count={sourceCounts.studiorich}
              active={viewMode === "library" && sourceOwnerFilter === "studiorich"}
              onClick={() => { onViewModeChange("library"); onSourceOwnerFilterChange?.("studiorich"); }}
            />
            <NavRow
              icon="public"
              label="External"
              count={sourceCounts.external}
              active={viewMode === "library" && sourceOwnerFilter === "external"}
              onClick={() => { onViewModeChange("library"); onSourceOwnerFilterChange?.("external"); }}
            />
            <NavRow
              icon="graphic_eq"
              label="Sounds"
              count={sourceCounts.reference}
              active={viewMode === "library" && sourceOwnerFilter === "reference"}
              onClick={() => { onViewModeChange("library"); onSourceOwnerFilterChange?.("reference"); }}
            />
            <NavRow
              icon="artist"
              label="Artists"
              count={artistCount}
              active={viewMode === "artists"}
              onClick={() => onViewModeChange("artists")}
            />
          </div>

          <div className="fm-section">
            <div className="fm-section-header">AudioLab</div>
            <NavRow
              icon="science"
              label="Looper"
              active={viewMode === "sectional_looper"}
              onClick={() => onViewModeChange("sectional_looper")}
            />
          </div>

          <div className="fm-section">
            <div className="fm-section-header">Collections</div>
            <NavRow
              icon="inventory_2"
              label="Crates"
              count={crateCount}
              active={viewMode === "crates_grid" || viewMode === "crate_detail"}
              onClick={() => (onViewCrates ? onViewCrates() : onViewModeChange("crates_grid"))}
            />
            <NavRow
              icon="queue_music"
              label="Playlists"
              count={musicPlaylistCount}
              active={viewMode === "playlists_grid"}
              onClick={() => onViewModeChange("playlists_grid")}
            />
            <NavRow
              icon="grid_view"
              label="Banks"
              count={bankCount}
              active={viewMode === "sampler_banks_grid"}
              onClick={() => onViewModeChange("sampler_banks_grid")}
            />
          </div>

          <div className="fm-section">
            <div className="fm-section-header">Radio</div>
            <NavRow
              icon="queue_music"
              label="Playlists"
              count={radioPlaylistCount}
              nested
              active={viewMode === "radio_playlists_grid"}
              onClick={() => onViewModeChange("radio_playlists_grid")}
            />
            <NavRow
              icon="grid_view"
              label="Banks"
              count={radioBankCount}
              nested
              active={viewMode === "radio_banks_grid"}
              onClick={() => onViewModeChange("radio_banks_grid")}
            />
          </div>
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

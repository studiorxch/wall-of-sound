import { useState } from "react";
import { Icon, type IconName } from "./Icon";
import type { PlaylistRecord } from "../data/playProjectTypes";
import type { Track, TrackSourceOwner } from "../data/trackTypes";
import type { MusicSourcePool } from "../data/sourcePoolTypes";
import { type TrackDragPayload } from "../logic/playlistMembership";

// 0828_MUSIC_Looper_Loop_Library_Tagging — "loop_library" was retired
// between 0722 and this build (redirected on sight, no real nav row). This
// build reactivates it as a real destination: the canonical, multi-source
// Loop Library, with a real "Loop Library" row under Collections below.
export type ViewMode = "playlist" | "library" | "library_dashboard" | "groups" | "orphans" | "excluded" | "locks" | "playlists_grid" | "sampler_banks_grid" | "crates_grid" | "crate_detail" | "artists" | "mood_signal_audit" | "analyzer_review" | "loop_library" | "sectional_looper" | "glyph_audio" | "edit" | "perform" | "radio" | "radio_playlists_grid" | "radio_banks_grid" | "collections_overview" | "radio_loopchain_player" | "machine_life_research" | "suno_library" | "voice_library";

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
  // 0828_MUSIC_Looper_Loop_Library_Tagging
  loopCount?: number;
  artistCount?: number;
  // Suno Library Parity Repair — real, already-loaded count (
  // sunoLibraryImportPointer.canonicalRecordingCount), never re-derived
  // from a manifest parse here. Undefined (blank, not a fabricated 0)
  // until Suno has been imported at least once this or a prior session.
  sunoRecordingCount?: number;
  voiceAssetCount?: number;
  // 0827_MUSIC_Library_Workspace_Track_Inspector_Rearchitecture §6 — sidebar
  // click always opens Song Library's Recordings, never its dashboard.
  onOpenSongLibraryRecordings?: () => void;
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
  crateCount = 0, onViewCrates, loopCount = 0, artistCount = 0, sunoRecordingCount, voiceAssetCount = 0, onOpenSongLibraryRecordings,
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
              active={(viewMode === "library" || viewMode === "library_dashboard") && sourceOwnerFilter === "studiorich"}
              onClick={() => { onViewModeChange("library"); onSourceOwnerFilterChange?.("studiorich"); }}
            />
            {/* 0827_MUSIC_Library_Workspace_Track_Inspector_Rearchitecture
                Part A — Song Library sits directly beneath Catalog so the
                two primary StudioRich/generation music pools stay visually
                adjacent; internal viewMode/state keys ("suno_library",
                sunoLibraryImportPointer, etc.) are unchanged — this is a
                user-facing rename/reorder only. Sidebar click always opens
                Recordings (nav.level "all"), never the dashboard — see
                onOpenSongLibraryRecordings. */}
            <NavRow
              icon="graphic_eq"
              label="Song Library"
              count={sunoRecordingCount}
              active={viewMode === "suno_library"}
              onClick={onOpenSongLibraryRecordings ? onOpenSongLibraryRecordings : () => onViewModeChange("suno_library")}
            />
            <NavRow
              icon="artist"
              label="VOICE"
              count={voiceAssetCount}
              active={viewMode === "voice_library"}
              onClick={() => onViewModeChange("voice_library")}
            />
            <NavRow
              icon="public"
              label="External"
              count={sourceCounts.external}
              active={(viewMode === "library" || viewMode === "library_dashboard") && sourceOwnerFilter === "external" || viewMode === "artists"}
              onClick={() => { onViewModeChange("library"); onSourceOwnerFilterChange?.("external"); }}
            />
            {/* Part D §13 — Artists is subordinate to External (navigation
                consolidation only; ArtistLibraryPanel/ArtistProfile are
                already External-scoped in practice, so no data-model
                change is needed here). */}
            <NavRow
              icon="artist"
              label="Artists"
              count={artistCount}
              nested
              active={viewMode === "artists"}
              onClick={() => onViewModeChange("artists")}
            />
            <NavRow
              icon="graphic_eq"
              label="Sounds"
              count={sourceCounts.reference}
              active={(viewMode === "library" || viewMode === "library_dashboard") && sourceOwnerFilter === "reference"}
              onClick={() => { onViewModeChange("library"); onSourceOwnerFilterChange?.("reference"); }}
            />
          </div>

          <div className="fm-section">
            <div className="fm-section-header">AudioLab</div>
            <NavRow
              icon="edit"
              label="Edit"
              active={viewMode === "edit"}
              onClick={() => onViewModeChange("edit")}
            />
            <NavRow
              icon="graphic_eq"
              label="Perform"
              active={viewMode === "perform"}
              onClick={() => onViewModeChange("perform")}
            />
            <NavRow
              icon="science"
              label="Looper"
              active={viewMode === "sectional_looper"}
              onClick={() => onViewModeChange("sectional_looper")}
            />
            {/* Glyph Audio (0804A) — reuses an existing icon per approved
                decision rather than adding a new icon asset. */}
            <NavRow
              icon="edit"
              label="Glyph"
              active={viewMode === "glyph_audio"}
              onClick={() => onViewModeChange("glyph_audio")}
            />
            {/* Machine Life Research (0811_MACHINE-LIFE_MUSIC-Research-
                Workspace-Handoff_v1.0.0) — bounded research import of the
                Machine Life Stage 0 Pre-Life collection; reuses an existing
                icon per the same convention Glyph established above. */}
            <NavRow
              icon="layers"
              label="Machine Life"
              active={viewMode === "machine_life_research"}
              onClick={() => onViewModeChange("machine_life_research")}
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
            <NavRow
              icon="repeat"
              label="Loop Library"
              count={loopCount}
              active={viewMode === "loop_library"}
              onClick={() => onViewModeChange("loop_library")}
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

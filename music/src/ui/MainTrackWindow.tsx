import { TrackEditorPanel } from "./TrackEditorPanel";
import { TrackInspector } from "./TrackInspector";
import type { ViewMode } from "./FileManager";
import type { MusicSourcePool } from "../data/sourcePoolTypes";
import type { TrackArchiveStatus, AnalyzerJobStatus } from "../data/trackTypes";
import type { TrackSlot, OrphanTrack, TrackLock, TrackLockType } from "../data/playlistTypes";
import { normalizeWarningMessages } from "../data/playlistTypes";
import type { Track, TrackRating, TrackSourceOwner } from "../data/trackTypes";
import type { PlaylistRecord } from "../data/playProjectTypes";
import { parseDelimitedTags } from "../logic/trackMetadata";
import { filterTracksByLibraryFilters, buildFilterOptions, type LibraryTrackFilters } from "../logic/libraryFilters";
import type { ExportHealthReport, ExportHealthItem } from "../logic/exportHealth";
import { TRACK_DRAG_MIME, encodeTrackDrag } from "../logic/playlistMembership";
import { formatNumber } from "../logic/dateFormat";
import { useState, useEffect, useRef } from "react";

type Props = {
  mode: ViewMode;
  tracks: Track[];
  slots: TrackSlot[];
  orphans: OrphanTrack[];
  locks: TrackLock[];
  excludedTrackIds: Set<string>;
  lockedTrackIds: Set<string>;
  tracksById: Map<string, Track>;
  nowPlayingSlotIndex: number | null;
  hoveredSlotIndex: number | null;
  selectedSlotIndex: number | null;
  playbackErrors: Map<string, string>;
  exportReport: ExportHealthReport | null;
  manualOrderDirty: boolean;
  onToggleLock: (trackId: string, slotIndex: number) => void;
  onExclude: (id: string) => void;
  onRestore: (id: string) => void;
  onRemove: (id: string) => void;
  onRestoreOrphan: (id: string) => void;
  onLockChange: (locks: TrackLock[]) => void;
  onPlayFromSlot: (slotIndex: number) => void;
  onMoveUp: (slotIndex: number) => void;
  onMoveDown: (slotIndex: number) => void;
  onRowHoverChange: (idx: number | null) => void;
  onRateTrack: (trackId: string, rating: TrackRating) => void;
  onSelectSlot: (idx: number | null) => void;
  onRemoveFromPlaylist: (trackId: string) => void;
  onRemoveFromPlaylistLeaveGap: (trackId: string) => void;
  onReorderSlot: (from: number, to: number) => void;
  onAddToPlaylistEnd: (trackId: string) => void;
  onInsertAfterSlot: (trackId: string, afterSlotIdx: number) => void;
  onReplaceSlot: (trackId: string, slotIdx: number) => void;
  onFindBestSlot: (trackId: string) => void;
  onRemoveRepeats?: () => void;
  onRunExportHealth: () => void;
  activePlaylistId: string;
  onFillGap: (slotIndex: number) => void;
  onDeleteGap: (slotIndex: number) => void;
  onClearPlaybackIssue: (trackId: string) => void;
  onBulkUpdate?: (trackIds: string[], patch: Partial<Track>) => void;
  onCreateLibraryGroup?: (trackIds: string[], groupName: string) => void;
  onGenerateMoodSuggestions?: (trackIds?: string[]) => void;
  onApplyMoodSuggestions?: (trackIds: string[]) => void;
  onRestoreSuggestionsFromImport?: (trackId: string) => void;
  onRestoreSuggestionsFromMechanical?: (trackId: string) => void;
  onClearSuggestedMoods?: (trackId: string) => void;
  onAuditionTrack?: (trackId: string) => void;
  onAuditionAndAdd?: (trackId: string) => void;
  auditionTrackId?: string | null;
  onBulkSetArchiveStatus?: (trackIds: string[], status: TrackArchiveStatus) => void;
  onAnalyzeTrack?: (trackId: string) => void;
  onAnalyzeSelected?: (trackIds: string[]) => void;
  onAnalyzeLibrary?: () => void;
  onReanalyze?: (trackIds: string[]) => void;
  analyzerJobs?: Map<string, AnalyzerJobStatus>;
  sourcePools?: MusicSourcePool[];
  onRenameSourcePool?: (id: string, name: string) => void;
  onRemoveSourcePool?: (id: string) => void;
  onCleanEmptyGroups?: () => void;
  sourceOwnerFilter?: TrackSourceOwner | null;
  samplerBanks?: PlaylistRecord[];
  loadedSamplerBankId?: string | null;
  onAddTracksToSamplerBank?: (bankId: string, trackIds: string[]) => void;
  onCreateSamplerBankFromTracks?: (title: string, trackIds: string[]) => void;
  onDeleteFromReference?: (trackIds: string[]) => void;
  musicPlaylists?: PlaylistRecord[];
  onBulkAddTracksToPlaylist?: (playlistId: string, trackIds: string[]) => void;
  onBulkCreatePlaylistFromTracks?: (trackIds: string[]) => void;
};

function fmtDur(s: number | undefined | null) {
  if (s == null || isNaN(s) || s <= 0) return "—";
  return `${Math.floor(s / 60)}:${Math.round(s % 60).toString().padStart(2, "0")}`;
}
function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}
function fmtLastPlayed(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const diffMin = (Date.now() - d.getTime()) / 60000;
  if (diffMin < 60) return `${Math.round(diffMin)}m ago`;
  if (diffMin < 1440) return `${Math.round(diffMin / 60)}h ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function StarRating({ trackId, rating, onChange }: { trackId: string; rating: TrackRating; onChange: (id: string, r: TrackRating) => void }) {
  return (
    <span className="star-rating" onClick={(e) => e.stopPropagation()}>
      {([1, 2, 3, 4, 5] as const).map((n) => (
        <button
          key={n}
          className={`star-btn${n <= rating ? " filled" : ""}${rating >= 4 && n <= rating ? " star-good" : ""}${rating > 0 && rating <= 3 && n <= rating ? " star-bad" : ""}`}
          onClick={() => onChange(trackId, n === rating ? 0 : n)}
          title={n === 5 ? "5 — Strong" : n === 4 ? "4 — Good" : `${n} — Problem`}
        >★</button>
      ))}
    </span>
  );
}

// ── Export badge helpers ──────────────────────────────────────────────────────

function ExportBadge({ item }: { item: ExportHealthItem | undefined }) {
  if (!item || item.status === "ok") return null;
  const map: Record<string, [string, string]> = {
    empty_slot:            ["EMPTY", "diag-no-path"],
    no_path:               ["NO PATH", "diag-no-path"],
    missing_file:          ["MISS", "diag-missing"],
    unsupported_extension: ["EXT", "diag-codec"],
    questionable_path:     ["PATH", "diag-err"],
    repeat:                ["REPEAT", "diag-err"],
    unknown_error:         ["ERR", "diag-err"],
  };
  const [label, cls] = map[item.status] ?? ["ERR", "diag-err"];
  return <span className={`diag-badge ${cls}`} title={item.message}>{label}</span>;
}

function PlaybackBadge({ track, playbackErrors }: { track: Track | undefined; playbackErrors: Map<string, string> }) {
  if (!track) return null;
  if (!track.filePath) return <span className="diag-badge diag-no-path" title={track.audioMissing ? "Audio file not found — re-scan audio folder in the source ⋯ menu" : "No audio path — use Link Audio Folder in the source ⋯ menu"}>NO PATH</span>;
  const err = playbackErrors.get(track.trackId);
  if (err === "FILE_MISSING" || err === "MISSING") return <span className="diag-badge diag-missing" title="File not found on disk">MISSING</span>;
  if (err === "CODEC") return <span className="diag-badge diag-codec" title="Browser cannot decode this codec">CODEC</span>;
  if (err === "UNSUPPORTED_EXT") return <span className="diag-badge diag-codec" title="Unsupported file extension">EXT</span>;
  if (err) return <span className="diag-badge diag-err" title={err}>ERR</span>;
  return null;
}

function warnBadges(messages: unknown) {
  const raw: { type: string; cls: string }[] = [];
  for (const m of normalizeWarningMessages(messages)) {
    const upper = m.toUpperCase();
    if (upper.includes("EMPTY") || upper.includes("EMPTY SLOT")) raw.push({ type: "EMPTY", cls: "badge-red" });
    else if (upper.includes("BPM")) {
      // Adjacent/transition BPM jump → JUMP; slot/curve fit → BPM
      const isJump = upper.includes("ADJACENT") || upper.includes("DRIFT") || upper.includes("JUMP") || upper.includes("TRANSITION");
      raw.push(isJump ? { type: "JUMP", cls: "badge-yellow" } : { type: "BPM", cls: upper.includes("GAP") ? "badge-red" : "badge-yellow" });
    }
    else if (upper.includes("CAMELOT") || upper.includes("KEY")) raw.push({ type: "KEY", cls: upper.includes("RISKY") ? "badge-red" : "badge-yellow" });
    else if (upper.includes("ENERGY")) raw.push({ type: "NRG", cls: "badge-yellow" });
    else if (upper.includes("DURATION")) raw.push({ type: "DUR", cls: "badge-yellow" });
  }
  // Deduplicate by label, keeping first occurrence
  const seen = new Set<string>();
  return raw.filter((b) => { if (seen.has(b.type)) return false; seen.add(b.type); return true; });
}

// ── Context menus ─────────────────────────────────────────────────────────────

type PlaylistCtxMenu = { slotIndex: number; trackId?: string; x: number; y: number };
type LibraryCtxMenu = { trackId: string; x: number; y: number };

function useClickOutside(ref: React.RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [onClose]);
}

function PlaylistContextMenu({ menu, lockedTrackIds, onClose, onPlay, onToggleLock, onRemove, onRemoveLeaveGap, onRemoveRepeats, filePath, diagText }: {
  menu: PlaylistCtxMenu;
  lockedTrackIds: Set<string>;
  onClose: () => void;
  onPlay: () => void;
  onToggleLock: () => void;
  onRemove: () => void;
  onRemoveLeaveGap: () => void;
  onRemoveRepeats?: () => void;
  filePath?: string;
  diagText?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, onClose);
  const isLocked = menu.trackId ? lockedTrackIds.has(menu.trackId) : false;

  return (
    <div ref={ref} className="ctx-menu" style={{ left: menu.x, top: menu.y }} onContextMenu={(e) => e.preventDefault()}>
      <button className="ctx-item" onClick={() => { onPlay(); onClose(); }}>▶ Play from here</button>
      {menu.trackId && (
        <button className="ctx-item" onClick={() => { onToggleLock(); onClose(); }}>
          {isLocked ? "🔓 Unlock" : "🔒 Lock position"}
        </button>
      )}
      <div className="ctx-sep" />
      {menu.trackId && <>
        <button className="ctx-item danger" onClick={() => { onRemove(); onClose(); }}>× Remove from playlist</button>
        <button className="ctx-item" onClick={() => { onRemoveLeaveGap(); onClose(); }}>□ Remove and leave gap</button>
      </>}
      {(filePath || diagText) && <div className="ctx-sep" />}
      {filePath && <button className="ctx-item" onClick={() => { navigator.clipboard.writeText(filePath); onClose(); }}>⧉ Copy file path</button>}
      {diagText && <button className="ctx-item" onClick={() => { navigator.clipboard.writeText(diagText); onClose(); }}>⧉ Copy diagnostic</button>}
      <div className="ctx-sep" />
      <button className="ctx-item" onClick={() => { onRemoveRepeats?.(); onClose(); }} title="Keep first occurrence of each track, remove later repeats">⊘ Remove repeated copies</button>
    </div>
  );
}

function LibraryContextMenu({ menu, selectedSlotIndex, onClose, onPlay, onAddToEnd, onInsertAfter, onReplace, onFindBest }: {
  menu: LibraryCtxMenu;
  selectedSlotIndex: number | null;
  onClose: () => void;
  onPlay: () => void;
  onAddToEnd: () => void;
  onInsertAfter: () => void;
  onReplace: () => void;
  onFindBest: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, onClose);

  return (
    <div ref={ref} className="ctx-menu" style={{ left: menu.x, top: menu.y }} onContextMenu={(e) => e.preventDefault()}>
      <button className="ctx-item" onClick={() => { onPlay(); onClose(); }}>▶ Play preview</button>
      <div className="ctx-sep" />
      <button className="ctx-item" onClick={() => { onAddToEnd(); onClose(); }}>+ Add to playlist end</button>
      <button className="ctx-item"
        onClick={() => { onInsertAfter(); onClose(); }}
        title={selectedSlotIndex !== null ? `After slot #${selectedSlotIndex + 1}` : "No slot selected — will append"}>
        ↓ Insert after{selectedSlotIndex !== null ? ` slot #${selectedSlotIndex + 1}` : " (append)"}
      </button>
      <button className="ctx-item"
        onClick={() => { if (selectedSlotIndex !== null) { onReplace(); onClose(); } }}
        title={selectedSlotIndex !== null ? `Replace slot #${selectedSlotIndex + 1}` : "Select a playlist slot first"}
        style={{ opacity: selectedSlotIndex === null ? 0.4 : 1 }}>
        ⇄ Replace{selectedSlotIndex !== null ? ` slot #${selectedSlotIndex + 1}` : " (select slot first)"}
      </button>
      <div className="ctx-sep" />
      <button className="ctx-item" onClick={() => { onFindBest(); onClose(); }}>◎ Find best curve slot</button>
    </div>
  );
}

// ── BPM cell ──────────────────────────────────────────────────────────────────

function BpmCell({ trackBpm, targetBpm }: { trackBpm: number; targetBpm: number }) {
  const drift = Math.abs(trackBpm - targetBpm) / (targetBpm || 1);
  const cls = drift > 0.3 ? "bpm-red" : drift > 0.15 ? "bpm-yellow" : "";
  return <span className={cls} title={`Track: ${trackBpm ?? "—"} · Target: ${Number.isFinite(targetBpm) ? Math.round(targetBpm) : "—"} · Drift: ${formatNumber(drift * 100, 0)}%`}>{trackBpm ?? "—"}</span>;
}

// ── Resolved playlist context menu (avoids IIFE crash pattern) ───────────────

function PlaylistContextMenuResolved({
  menu, tracksById, exportBySlot, lockedTrackIds,
  onClose, onPlayFromSlot, onToggleLock,
  onRemoveFromPlaylist, onRemoveFromPlaylistLeaveGap, onRemoveRepeats,
}: {
  menu: PlaylistCtxMenu;
  tracksById: Map<string, Track>;
  exportBySlot: Map<number, import("../logic/exportHealth").ExportHealthItem> | null;
  lockedTrackIds: Set<string>;
  onClose: () => void;
  onPlayFromSlot: (i: number) => void;
  onToggleLock: (trackId: string, slotIndex: number) => void;
  onRemoveFromPlaylist: (trackId: string) => void;
  onRemoveFromPlaylistLeaveGap: (trackId: string) => void;
  onRemoveRepeats?: () => void;
}) {
  const track = menu.trackId != null ? (tracksById.get(menu.trackId) ?? undefined) : undefined;
  const exportItem = exportBySlot?.get(menu.slotIndex);
  const diagText = exportItem && exportItem.status !== "ok"
    ? `#${menu.slotIndex + 1} ${exportItem.status.toUpperCase().replace(/_/g, " ")} — ${exportItem.message}`
    : undefined;

  return (
    <PlaylistContextMenu
      menu={menu}
      lockedTrackIds={lockedTrackIds}
      onClose={onClose}
      onPlay={() => onPlayFromSlot(menu.slotIndex)}
      onToggleLock={() => { if (menu.trackId != null) onToggleLock(menu.trackId, menu.slotIndex); }}
      onRemove={() => { if (menu.trackId != null) onRemoveFromPlaylist(menu.trackId); }}
      onRemoveLeaveGap={() => { if (menu.trackId != null) onRemoveFromPlaylistLeaveGap(menu.trackId); }}
      onRemoveRepeats={onRemoveRepeats}
      filePath={track?.filePath}
      diagText={diagText}
    />
  );
}

// ── Playlist rows ─────────────────────────────────────────────────────────────

function PlaylistRows({
  slots, tracksById, lockedTrackIds, nowPlayingSlotIndex, hoveredSlotIndex, selectedSlotIndex,
  playbackErrors, exportReport, activePlaylistId,
  onToggleLock, onPlayFromSlot, onMoveUp, onMoveDown,
  onRowHoverChange, onRateTrack, onSelectSlot, onRemoveFromPlaylist, onRemoveFromPlaylistLeaveGap, onReorderSlot, onRemoveRepeats,
  onFillGap, onDeleteGap,
}: {
  slots: TrackSlot[];
  tracksById: Map<string, Track>;
  lockedTrackIds: Set<string>;
  nowPlayingSlotIndex: number | null;
  hoveredSlotIndex: number | null;
  selectedSlotIndex: number | null;
  playbackErrors: Map<string, string>;
  exportReport: ExportHealthReport | null;
  activePlaylistId: string;
  onToggleLock: (trackId: string, slotIndex: number) => void;
  onPlayFromSlot: (slotIndex: number) => void;
  onMoveUp: (slotIndex: number) => void;
  onMoveDown: (slotIndex: number) => void;
  onRowHoverChange: (idx: number | null) => void;
  onRateTrack: (trackId: string, rating: TrackRating) => void;
  onSelectSlot: (idx: number | null) => void;
  onRemoveFromPlaylist: (trackId: string) => void;
  onRemoveFromPlaylistLeaveGap: (trackId: string) => void;
  onReorderSlot: (from: number, to: number) => void;
  onRemoveRepeats?: () => void;
  onFillGap: (slotIndex: number) => void;
  onDeleteGap: (slotIndex: number) => void;
}) {
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [ctxMenu, setCtxMenu] = useState<PlaylistCtxMenu | null>(null);

  const exportBySlot = exportReport
    ? new Map(exportReport.items.map((i) => [i.slotIndex, i]))
    : null;

  if (slots.length === 0) return <EmptyMsg text="No playlist yet — import a CSV to begin." />;

  function handleDragStart(e: React.DragEvent, slotIndex: number) {
    const track = slots[slotIndex].assignedTrackId ? tracksById.get(slots[slotIndex].assignedTrackId!) : undefined;
    if (track && lockedTrackIds.has(track.trackId)) { e.preventDefault(); return; }
    setDragFrom(slotIndex);
    e.dataTransfer.effectAllowed = "copyMove";
    if (track) {
      e.dataTransfer.setData(
        TRACK_DRAG_MIME,
        encodeTrackDrag({ type: "track", source: "playlist", sourcePlaylistId: activePlaylistId, trackIds: [track.trackId] })
      );
    }
  }

  return (
    <>
      {ctxMenu != null && (
        <PlaylistContextMenuResolved
          menu={ctxMenu}
          tracksById={tracksById}
          exportBySlot={exportBySlot}
          lockedTrackIds={lockedTrackIds}
          onClose={() => setCtxMenu(null)}
          onPlayFromSlot={onPlayFromSlot}
          onToggleLock={onToggleLock}
          onRemoveFromPlaylist={onRemoveFromPlaylist}
          onRemoveFromPlaylistLeaveGap={onRemoveFromPlaylistLeaveGap}
          onRemoveRepeats={onRemoveRepeats}
        />
      )}
      <table className="mtw-table">
        <thead>
          <tr>
            <th style={{ width: 16 }} />
            <th>#</th><th>🔒</th><th>Time</th>
            <th>Title</th><th>Artist</th>
            <th>BPM</th><th>Key</th><th>E</th><th>Dur</th>
            <th>Rating</th><th>×</th>
            <th>Warn</th><th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {slots.map((slot) => {
            const track = slot.assignedTrackId ? tracksById.get(slot.assignedTrackId) : undefined;

            // Empty slot row
            if (!track && !slot.assignedTrackId) {
              return (
                <tr key={slot.slotId} className="row-empty-slot">
                  <td><span className="drag-handle">☰</span></td>
                  <td className="col-num">{slot.slotIndex + 1}</td>
                  <td />
                  <td className="col-mono">{fmtTime(slot.startTimeSeconds)}</td>
                  <td className="col-title" colSpan={8}>
                    <span className="empty-slot-label">Empty Slot</span>
                  </td>
                  <td className="col-actions" onClick={(e) => e.stopPropagation()}>
                    <button className="tb-btn sm" onClick={() => onFillGap(slot.slotIndex)} title="Auto-fill this slot">Fill Gap</button>
                    <button className="tb-btn sm remove-btn" onClick={() => onDeleteGap(slot.slotIndex)} title="Remove this empty slot">Delete Gap</button>
                  </td>
                </tr>
              );
            }

            const isLocked = track ? lockedTrackIds.has(track.trackId) : false;
            const badges = warnBadges(slot.warningMessages);
            const isNowPlaying = slot.slotIndex === nowPlayingSlotIndex;
            const isHovered = slot.slotIndex === hoveredSlotIndex;
            const isSelected = slot.slotIndex === selectedSlotIndex;
            const isDragFrom = slot.slotIndex === dragFrom;
            const isDragOver = slot.slotIndex === dragOver;
            const exportItem = exportBySlot?.get(slot.slotIndex);

            const rowCls = [
              isNowPlaying ? "row-now-playing" : "",
              !isNowPlaying && isSelected ? "row-selected" : "",
              !isNowPlaying && !isSelected && isHovered ? "row-canvas-hover" : "",
              isLocked && !isNowPlaying ? "row-locked" : "",
              !isNowPlaying && !isLocked && slot.warningLevel === "red" ? "row-red" : "",
              !isNowPlaying && !isLocked && slot.warningLevel === "yellow" ? "row-yellow" : "",
              isDragFrom ? "row-dragging" : "",
              isDragOver ? "row-drag-over" : "",
            ].filter(Boolean).join(" ");

            return (
              <tr
                key={slot.slotId}
                className={rowCls}
                title={slot.warningMessages.join("\n")}
                draggable={!isLocked}
                onDragStart={(e) => handleDragStart(e, slot.slotIndex)}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOver(slot.slotIndex); }}
                onDrop={(e) => { e.preventDefault(); if (dragFrom !== null && dragFrom !== slot.slotIndex) onReorderSlot(dragFrom, slot.slotIndex); setDragFrom(null); setDragOver(null); }}
                onDragEnd={() => { setDragFrom(null); setDragOver(null); }}
                onMouseEnter={() => onRowHoverChange(slot.slotIndex)}
                onMouseLeave={() => onRowHoverChange(null)}
                onClick={() => onSelectSlot(slot.slotIndex)}
                onContextMenu={(e) => { e.preventDefault(); if (slot != null) setCtxMenu({ slotIndex: slot.slotIndex, trackId: track?.trackId ?? undefined, x: e.clientX, y: e.clientY }); }}
              >
                <td><span className="drag-handle" title="Drag to reorder">☰</span></td>
                <td className="col-num">
                  {isNowPlaying && <span className="now-playing-dot">▶</span>}
                  {slot.slotIndex + 1}
                </td>
                <td className="col-lock">
                  {track && (
                    <button
                      className={`inline-lock-btn${isLocked ? " is-locked" : ""}`}
                      onClick={(e) => { e.stopPropagation(); onToggleLock(track.trackId, slot.slotIndex); }}
                      title={isLocked ? "Unlock" : "Lock position"}
                    >{isLocked ? "🔒" : "🔓"}</button>
                  )}
                </td>
                <td className="col-mono">{fmtTime(slot.startTimeSeconds)}</td>
                <td className="col-title">
                  {track?.title ?? <span className="empty-cell">—</span>}
                  <PlaybackBadge track={track} playbackErrors={playbackErrors} />
                  {exportItem && <ExportBadge item={exportItem} />}
                </td>
                <td className="col-artist">{track?.artist ?? ""}</td>
                <td className="col-mono">
                  {track ? <BpmCell trackBpm={track.bpm} targetBpm={slot.targetBpm} /> : "—"}
                </td>
                <td className="col-mono">{track?.camelotKey ?? ""}</td>
                <td className="col-mono">{track ? formatNumber(track.energy, 2, "—") : ""}</td>
                <td className="col-mono">{track ? fmtDur(track.durationSeconds) : ""}</td>
                <td className="col-rating">
                  {track && <StarRating trackId={track.trackId} rating={(track.rating ?? 0) as TrackRating} onChange={onRateTrack} />}
                </td>
                <td className="col-plays">
                  {track && (track.playCount ?? 0) > 0
                    ? <span className="play-count" title={`×${track.playCount} · last ${fmtLastPlayed(track.lastPlayedAt)}`}>×{track.playCount}</span>
                    : <span className="play-count dim">—</span>}
                </td>
                <td className="col-badges">
                  {badges.map((b, i) => <span key={i} className={`warn-badge ${b.cls}`}>{b.type}</span>)}
                </td>
                <td className="col-actions" onClick={(e) => e.stopPropagation()}>
                  <button className="pt-row-btn play-btn" onClick={() => onPlayFromSlot(slot.slotIndex)} title="Play from here" disabled={!track}>▶</button>
                  <button className="pt-row-btn" onClick={() => onMoveUp(slot.slotIndex)} title="Move up" disabled={slot.slotIndex === 0 || isLocked}>↑</button>
                  <button className="pt-row-btn" onClick={() => onMoveDown(slot.slotIndex)} title="Move down" disabled={slot.slotIndex === slots.length - 1 || isLocked}>↓</button>
                  {track && (
                    <button className="remove-pl-btn" onClick={() => onRemoveFromPlaylist(track.trackId)} title="Remove from playlist">×</button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

// ── Library rows ──────────────────────────────────────────────────────────────


function BulkEditBar({
  selectedIds, onApply, onClear,
}: {
  selectedIds: Set<string>;
  onApply: (patch: Partial<Track>) => void;
  onClear: () => void;
}) {
  const [titleInput, setTitleInput] = useState("");
  const [artistInput, setArtistInput] = useState("");
  const [moodInput, setMoodInput] = useState("");
  const [moodMode, setMoodMode] = useState<"add" | "set">("add");
  const [groupingInput, setGroupingInput] = useState("");
  const [ratingInput, setRatingInput] = useState("");
  const [ownerInput, setOwnerInput] = useState<TrackSourceOwner | "">("");
  const [expanded, setExpanded] = useState(false);
  const count = selectedIds.size;

  function applyMoods() {
    const tags = parseDelimitedTags(moodInput);
    if (!tags.length) return;
    if (moodMode === "add") {
      onApply({ moodTags: tags, _bulkMoodMode: "add" } as Partial<Track>);
    } else {
      onApply({ moodTags: tags });
    }
    setMoodInput("");
  }

  function applyGrouping() {
    if (!groupingInput.trim()) return;
    onApply({ grouping: groupingInput.trim() });
    setGroupingInput("");
  }

  function applyRating() {
    const n = parseInt(ratingInput, 10);
    if (isNaN(n) || n < 0 || n > 5) return;
    onApply({ rating: n as TrackRating });
    setRatingInput("");
  }

  function applyOwner() {
    if (!ownerInput) return;
    onApply({ sourceOwner: ownerInput as TrackSourceOwner });
    setOwnerInput("");
  }

  return (
    <div className="bulk-bar">
      <div className="bulk-bar-header">
        <span className="bulk-bar-count">{count} track{count !== 1 ? "s" : ""} selected</span>
        <button className="tb-btn sm" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Hide Edit" : "Bulk Edit"}
        </button>
        <button className="tb-btn sm" onClick={onClear}>Deselect All</button>
      </div>
      {expanded && (
        <div className="bulk-bar-fields">
          <div className="bulk-field">
            <span className="bulk-field-label">Title</span>
            <input
              className="bulk-input"
              placeholder="Track title…"
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && titleInput.trim()) { onApply({ title: titleInput.trim() }); setTitleInput(""); } }}
            />
            <button className="tb-btn sm" onClick={() => { if (titleInput.trim()) { onApply({ title: titleInput.trim() }); setTitleInput(""); } }}>Apply</button>
          </div>
          <div className="bulk-field">
            <span className="bulk-field-label">Artist</span>
            <input
              className="bulk-input"
              placeholder="Artist name…"
              value={artistInput}
              onChange={(e) => setArtistInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && artistInput.trim()) { onApply({ artist: artistInput.trim() }); setArtistInput(""); } }}
            />
            <button className="tb-btn sm" onClick={() => { if (artistInput.trim()) { onApply({ artist: artistInput.trim() }); setArtistInput(""); } }}>Apply</button>
          </div>
          <div className="bulk-field">
            <span className="bulk-field-label">Moods</span>
            <select className="ph-select sm" value={moodMode} onChange={(e) => setMoodMode(e.target.value as "add" | "set")}>
              <option value="add">Add</option>
              <option value="set">Replace</option>
            </select>
            <input
              className="bulk-input"
              placeholder="Dreamy, Hypnotic…"
              value={moodInput}
              onChange={(e) => setMoodInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") applyMoods(); }}
            />
            <button className="tb-btn sm" onClick={applyMoods}>Apply</button>
          </div>
          <div className="bulk-field">
            <span className="bulk-field-label">Grouping</span>
            <input
              className="bulk-input"
              placeholder="Microhouse 100…"
              value={groupingInput}
              onChange={(e) => setGroupingInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") applyGrouping(); }}
            />
            <button className="tb-btn sm" onClick={applyGrouping}>Apply</button>
          </div>
          <div className="bulk-field">
            <span className="bulk-field-label">Rating</span>
            <input
              className="bulk-input bulk-input-sm"
              type="number" min={0} max={5} placeholder="0–5"
              value={ratingInput}
              onChange={(e) => setRatingInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") applyRating(); }}
            />
            <button className="tb-btn sm" onClick={applyRating}>Apply</button>
          </div>
          <div className="bulk-field">
            <span className="bulk-field-label">Owner</span>
            <select className="ph-select sm" value={ownerInput} onChange={(e) => setOwnerInput(e.target.value as TrackSourceOwner | "")}>
              <option value="">—</option>
              <option value="studiorich">studiorich</option>
              <option value="external">external</option>
              <option value="reference">reference</option>
              <option value="unknown">unknown</option>
            </select>
            <button className="tb-btn sm" onClick={applyOwner}>Apply</button>
          </div>
        </div>
      )}
    </div>
  );
}

function MoodChips({ tags }: { tags: string[] }) {
  if (!tags.length) return null;
  return (
    <span className="mood-chips">
      {tags.slice(0, 3).map((t) => <span key={t} className="mood-chip">{t}</span>)}
      {tags.length > 3 && <span className="mood-chip mood-chip-more">+{tags.length - 3}</span>}
    </span>
  );
}

function SuggestedChips({ tags }: { tags: string[] }) {
  if (!tags.length) return <span className="dim">—</span>;
  return (
    <span className="mood-chips">
      {tags.slice(0, 3).map((t) => <span key={t} className="mood-chip mood-chip-suggested">{t}</span>)}
      {tags.length > 3 && <span className="mood-chip mood-chip-more">+{tags.length - 3}</span>}
    </span>
  );
}

function BankAddButton({
  trackId, banks, loadedBankId, onAdd, onCreateNew,
}: {
  trackId: string;
  banks: PlaylistRecord[];
  loadedBankId: string | null | undefined;
  onAdd: (bankId: string, trackIds: string[]) => void;
  onCreateNew: (title: string, trackIds: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [showNew, setShowNew] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => { setOpen(false); setShowNew(false); setNewName(""); });

  function submitNew() {
    const title = newName.trim() || "New Sampler Bank";
    onCreateNew(title, [trackId]);
    setOpen(false); setShowNew(false); setNewName("");
  }

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button className="tb-btn sm" title="Add to Sampler Bank" onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}>+</button>
      {open && (
        <div className="ctx-menu" style={{ top: "100%", left: 0, zIndex: 200, minWidth: 160 }} onClick={(e) => e.stopPropagation()}>
          {banks.length > 0 ? (
            banks.map((b) => (
              <button key={b.playlistId} className="ctx-item" onClick={() => { onAdd(b.playlistId, [trackId]); setOpen(false); }}>
                {b.playlistId === loadedBankId ? "● " : ""}{b.title}
              </button>
            ))
          ) : (
            <div className="ctx-item" style={{ opacity: 0.5, cursor: "default" }}>No banks yet</div>
          )}
          <div className="ctx-sep" />
          {showNew ? (
            <span className="cat-group-input-row" style={{ padding: "4px 8px" }}>
              <input
                className="cat-filter-search"
                style={{ width: 100, fontSize: 11 }}
                placeholder="Bank name…"
                value={newName}
                autoFocus
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submitNew(); if (e.key === "Escape") { setShowNew(false); setNewName(""); } }}
              />
              <button className="tb-btn sm" onClick={submitNew}>+</button>
            </span>
          ) : (
            <button className="ctx-item" onClick={() => setShowNew(true)}>New Sampler Bank…</button>
          )}
        </div>
      )}
    </div>
  );
}

function LibraryRows({
  tracks, excludedTrackIds, lockedTrackIds, playbackErrors, exportReport, selectedSlotIndex,
  onExclude, onRestore, onRemove, onRateTrack,
  onPlayFromTrack, onAddToPlaylistEnd, onInsertAfterSlot, onReplaceSlot, onFindBestSlot, onRunExportHealth,
  onClearPlaybackIssue, onBulkUpdate, onCreateLibraryGroup, onGenerateMoodSuggestions, onApplyMoodSuggestions,
  onRestoreSuggestionsFromImport, onRestoreSuggestionsFromMechanical, onClearSuggestedMoods,
  onAuditionTrack, onAuditionAndAdd, auditionTrackId,
  onBulkSetArchiveStatus, onAnalyzeTrack, onAnalyzeSelected, onAnalyzeLibrary, onReanalyze,
  analyzerJobs, initialSourceOwnerFilter,
  samplerBanks, loadedSamplerBankId, onAddTracksToSamplerBank, onCreateSamplerBankFromTracks, onDeleteFromReference,
  musicPlaylists, onBulkAddTracksToPlaylist, onBulkCreatePlaylistFromTracks,
  onInspect,
}: {
  tracks: Track[];
  excludedTrackIds: Set<string>;
  lockedTrackIds: Set<string>;
  playbackErrors: Map<string, string>;
  exportReport: ExportHealthReport | null;
  initialSourceOwnerFilter?: TrackSourceOwner | null;
  selectedSlotIndex: number | null;
  onExclude: (id: string) => void;
  onRestore: (id: string) => void;
  onRemove: (id: string) => void;
  onRateTrack: (trackId: string, rating: TrackRating) => void;
  onPlayFromTrack: (trackId: string) => void;
  onAddToPlaylistEnd: (trackId: string) => void;
  onInsertAfterSlot: (trackId: string, afterSlotIdx: number) => void;
  onReplaceSlot: (trackId: string, slotIdx: number) => void;
  onFindBestSlot: (trackId: string) => void;
  onRunExportHealth: () => void;
  onClearPlaybackIssue: (trackId: string) => void;
  onBulkUpdate?: (trackIds: string[], patch: Partial<Track>) => void;
  onCreateLibraryGroup?: (trackIds: string[], groupName: string) => void;
  onGenerateMoodSuggestions?: (trackIds?: string[]) => void;
  onApplyMoodSuggestions?: (trackIds: string[]) => void;
  onRestoreSuggestionsFromImport?: (trackId: string) => void;
  onRestoreSuggestionsFromMechanical?: (trackId: string) => void;
  onClearSuggestedMoods?: (trackId: string) => void;
  onAuditionTrack?: (trackId: string) => void;
  onAuditionAndAdd?: (trackId: string) => void;
  auditionTrackId?: string | null;
  onBulkSetArchiveStatus?: (trackIds: string[], status: TrackArchiveStatus) => void;
  onAnalyzeTrack?: (trackId: string) => void;
  onAnalyzeSelected?: (trackIds: string[]) => void;
  onAnalyzeLibrary?: () => void;
  onReanalyze?: (trackIds: string[]) => void;
  analyzerJobs?: Map<string, AnalyzerJobStatus>;
  samplerBanks?: PlaylistRecord[];
  loadedSamplerBankId?: string | null;
  onAddTracksToSamplerBank?: (bankId: string, trackIds: string[]) => void;
  onCreateSamplerBankFromTracks?: (title: string, trackIds: string[]) => void;
  onDeleteFromReference?: (trackIds: string[]) => void;
  musicPlaylists?: PlaylistRecord[];
  onBulkAddTracksToPlaylist?: (playlistId: string, trackIds: string[]) => void;
  onBulkCreatePlaylistFromTracks?: (trackIds: string[]) => void;
  onInspect?: (track: Track, filteredList: Track[], index: number) => void;
}) {
  const [ctxMenu, setCtxMenu] = useState<LibraryCtxMenu | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [refBankCreateName, setRefBankCreateName] = useState("");
  const [refShowBankCreate, setRefShowBankCreate] = useState(false);
  const [refDeleteConfirm, setRefDeleteConfirm] = useState(false);
  const [catalogFilters, setCatalogFilters] = useState<LibraryTrackFilters>({});
  const [groupNameInput, setGroupNameInput] = useState("");
  const [showGroupInput, setShowGroupInput] = useState(false);
  const [editingTrack, setEditingTrack] = useState<Track | null>(null);

  if (tracks.length === 0) return <EmptyMsg text="No tracks loaded. Import a CSV to begin." />;

  // Source scope is applied FIRST, before all user filters.
  // On source-locked pages, only the active source's tracks ever enter the pipeline.
  const sourceScopedTracks = initialSourceOwnerFilter
    ? tracks.filter((t) => t.sourceOwner === initialSourceOwnerFilter)
    : tracks;

  const exportProblemIds = exportReport
    ? new Set(exportReport.items.filter((i) => i.status !== "ok" && i.trackId).map((i) => i.trackId!))
    : null;

  // User filters applied on top of source-scoped tracks only.
  const filtered = filterTracksByLibraryFilters(sourceScopedTracks, catalogFilters);
  // Filter option lists derived from source-scoped tracks only.
  const filterOptions = buildFilterOptions(sourceScopedTracks);

  function setCatalogFilter<K extends keyof LibraryTrackFilters>(key: K, val: LibraryTrackFilters[K]) {
    setCatalogFilters((prev) => ({ ...prev, [key]: val }));
  }

  function clearCatalogFilters() {
    // Reset user filters but preserve source lock if active.
    setCatalogFilters({});
  }

  const hasCatalogFilter =
    !!(catalogFilters.search || catalogFilters.grouping || catalogFilters.genre ||
      // sourceOwner is only a user-facing filter on unlocked (all-sources) pages
      (!initialSourceOwnerFilter && catalogFilters.sourceOwner && catalogFilters.sourceOwner !== "any") ||
      (catalogFilters.minRating && catalogFilters.minRating > 0) ||
      (catalogFilters.moodTags?.length) ||
      catalogFilters.audioLinked != null ||
      catalogFilters.noCover);

  function handleSelectFiltered() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      filtered.forEach((t) => next.add(t.trackId));
      return next;
    });
  }

  function handleCreateLibraryGroupSubmit() {
    if (!groupNameInput.trim() || !onCreateLibraryGroup) return;
    onCreateLibraryGroup([...selectedIds], groupNameInput.trim());
    setGroupNameInput("");
    setShowGroupInput(false);
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function handleBulkApply(patch: Partial<Track>) {
    if (!onBulkUpdate || selectedIds.size === 0) return;
    onBulkUpdate([...selectedIds], patch);
  }

  const allFilteredSelected = filtered.length > 0 && filtered.every((t) => selectedIds.has(t.trackId));

  // Section identity
  const SOURCE_LABELS: Record<string, { title: string; badge: string; sectionLabel: string; unitLabel: string }> = {
    studiorich: { title: "Catalog",       badge: "CAT", sectionLabel: "CATALOG",   unitLabel: "tracks" },
    external:   { title: "External",      badge: "EXT", sectionLabel: "EXTERNAL",  unitLabel: "tracks" },
    reference:  { title: "Reference",     badge: "REF", sectionLabel: "REFERENCE", unitLabel: "clips"  },
    unknown:    { title: "Unknown Review", badge: "UNK", sectionLabel: "UNKNOWN",   unitLabel: "tracks" },
  };
  const srcKey = (initialSourceOwnerFilter as string) ?? "any";
  const srcMeta = SOURCE_LABELS[srcKey] ?? { title: "All Tracks", badge: "ALL", sectionLabel: "CATALOG", unitLabel: "tracks" };
  const linkedCount = sourceScopedTracks.filter((t) => t.audioLinked).length;
  const missingCount = sourceScopedTracks.filter((t) => t.audioMissing).length;

  return (
    <>
      {editingTrack && (
        <TrackEditorPanel
          track={editingTrack}
          analyzerJobStatus={analyzerJobs?.get(editingTrack.trackId)}
          onSave={(patch) => {
            if (onBulkUpdate) onBulkUpdate([editingTrack.trackId], patch);
            setEditingTrack(null);
          }}
          onClose={() => setEditingTrack(null)}
          onAnalyzeTrack={onAnalyzeTrack}
          onReanalyze={onReanalyze ? (id) => onReanalyze([id]) : undefined}
          onRestoreSuggestionsFromImport={onRestoreSuggestionsFromImport}
          onRestoreSuggestionsFromMechanical={onRestoreSuggestionsFromMechanical}
          onClearSuggestedMoods={onClearSuggestedMoods}
        />
      )}
      {ctxMenu != null && ctxMenu.trackId && (
        <LibraryContextMenu
          menu={ctxMenu}
          selectedSlotIndex={selectedSlotIndex}
          onClose={() => setCtxMenu(null)}
          onPlay={() => { if (ctxMenu?.trackId) onPlayFromTrack(ctxMenu.trackId); }}
          onAddToEnd={() => { if (ctxMenu?.trackId) onAddToPlaylistEnd(ctxMenu.trackId); }}
          onInsertAfter={() => { if (ctxMenu?.trackId) onInsertAfterSlot(ctxMenu.trackId, selectedSlotIndex ?? -1); }}
          onReplace={() => { if (ctxMenu?.trackId && selectedSlotIndex !== null) onReplaceSlot(ctxMenu.trackId, selectedSlotIndex); }}
          onFindBest={() => { if (ctxMenu?.trackId) onFindBestSlot(ctxMenu.trackId); }}
        />
      )}

      {/* Page header */}
      <div className="cat-page-header">
        <div className="cat-page-header-top">
          <span className="cat-section-label">{srcMeta.sectionLabel}</span>
          <span className={`cat-source-badge cat-source-badge--${srcKey}`}>{srcMeta.badge}</span>
        </div>
        <div className="cat-page-title">{srcMeta.title}</div>
        <div className="cat-page-status">
          {sourceScopedTracks.length} {srcMeta.unitLabel}
          {linkedCount > 0 && <> · {linkedCount} linked</>}
          {missingCount > 0 && <> · <span className="cat-status-warn">{missingCount} missing audio</span></>}
          {selectedIds.size > 0 && <> · <span className="cat-status-sel">{selectedIds.size} selected</span></>}
          {filtered.length !== sourceScopedTracks.length && <> · {filtered.length} shown</>}
        </div>
      </div>

      {/* Filter section */}
      <div className="cat-filter-section">
        <div className="cat-filter-section-label">
          FILTERS
          {hasCatalogFilter && (
            <button className="cat-clear-btn" onClick={clearCatalogFilters}>Clear</button>
          )}
        </div>
        <div className="cat-filter-row">
          <input
            className="cat-filter-search"
            placeholder="Search title, artist, mood…"
            value={catalogFilters.search ?? ""}
            onChange={(e) => setCatalogFilter("search", e.target.value || undefined)}
          />
          <select className="cat-filter-sel" value={catalogFilters.moodTags?.[0] ?? ""} onChange={(e) => setCatalogFilter("moodTags", e.target.value ? [e.target.value] : undefined)}>
            <option value="">Mood: All</option>
            {filterOptions.moods.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <select className="cat-filter-sel" value={catalogFilters.grouping ?? ""} onChange={(e) => setCatalogFilter("grouping", e.target.value || undefined)}>
            <option value="">Group: All</option>
            {filterOptions.groupings.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          <select className="cat-filter-sel" value={catalogFilters.genre ?? ""} onChange={(e) => setCatalogFilter("genre", e.target.value || undefined)}>
            <option value="">Genre: All</option>
            {filterOptions.genres.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          {!initialSourceOwnerFilter && (
            <select className="cat-filter-sel" value={catalogFilters.sourceOwner ?? "any"} onChange={(e) => setCatalogFilter("sourceOwner", (e.target.value || "any") as LibraryTrackFilters["sourceOwner"])}>
              <option value="any">Source: All</option>
              <option value="studiorich">Catalog</option>
              <option value="external">External</option>
              <option value="reference">Reference</option>
              <option value="unknown">Unknown</option>
            </select>
          )}
          <select className="cat-filter-sel" value={String(catalogFilters.minRating ?? 0)} onChange={(e) => setCatalogFilter("minRating", parseInt(e.target.value) || undefined)}>
            <option value="0">Rating: Any</option>
            {[1,2,3,4,5].map((n) => <option key={n} value={String(n)}>{"★".repeat(n)}+</option>)}
          </select>
          <select className="cat-filter-sel" value={catalogFilters.audioLinked == null ? "any" : catalogFilters.audioLinked ? "yes" : "no"} onChange={(e) => {
            const v = e.target.value;
            setCatalogFilter("audioLinked", v === "yes" ? true : v === "no" ? false : undefined);
          }}>
            <option value="any">Playable: All</option>
            <option value="yes">Playable only</option>
            <option value="no">Missing audio</option>
          </select>
          {initialSourceOwnerFilter !== "reference" && (
            <button
              className={`cat-filter-toggle${catalogFilters.noCover ? " cat-filter-toggle--on" : ""}`}
              onClick={() => setCatalogFilter("noCover", catalogFilters.noCover ? undefined : true)}
              title="Show only tracks missing a cover image"
            >No Cover</button>
          )}
        </div>
      </div>

      {selectedIds.size > 0 && initialSourceOwnerFilter === "reference" ? (
        <div className="bulk-bar ref-bulk-bar">
          <div className="bulk-bar-header">
            <span className="bulk-bar-count">{selectedIds.size} selected</span>
            <button className="tb-btn sm" onClick={handleSelectFiltered} title="Add all visible tracks to selection">+ All visible</button>
            <span className="bulk-bar-sep" />
            {onAddTracksToSamplerBank && (samplerBanks?.length ?? 0) > 0 && (
              <select
                className="cat-filter-sel"
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) { onAddTracksToSamplerBank(e.target.value, [...selectedIds]); e.target.value = ""; }
                }}
                title="Add selected to bank"
              >
                <option value="">Add to Bank…</option>
                {(samplerBanks ?? []).map((b) => (
                  <option key={b.playlistId} value={b.playlistId}>{b.playlistId === loadedSamplerBankId ? "● " : ""}{b.title}</option>
                ))}
              </select>
            )}
            {onCreateSamplerBankFromTracks && (
              refShowBankCreate ? (
                <span className="cat-group-input-row">
                  <input
                    className="cat-filter-search"
                    placeholder="Bank name…"
                    value={refBankCreateName}
                    autoFocus
                    onChange={(e) => setRefBankCreateName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        onCreateSamplerBankFromTracks(refBankCreateName.trim() || "New Sampler Bank", [...selectedIds]);
                        setRefBankCreateName(""); setRefShowBankCreate(false);
                      }
                      if (e.key === "Escape") { setRefShowBankCreate(false); setRefBankCreateName(""); }
                    }}
                  />
                  <button className="tb-btn sm" onClick={() => {
                    onCreateSamplerBankFromTracks(refBankCreateName.trim() || "New Sampler Bank", [...selectedIds]);
                    setRefBankCreateName(""); setRefShowBankCreate(false);
                  }}>Create</button>
                  <button className="tb-btn sm" onClick={() => { setRefShowBankCreate(false); setRefBankCreateName(""); }}>Cancel</button>
                </span>
              ) : (
                <button className="tb-btn sm" onClick={() => setRefShowBankCreate(true)}>New Sampler Bank</button>
              )
            )}
            <span className="bulk-bar-sep" />
            {onDeleteFromReference && (
              refDeleteConfirm ? (
                <span className="cat-group-input-row">
                  <span style={{ fontSize: 11, color: "var(--warn-text, #f87171)" }}>Remove {selectedIds.size} clip{selectedIds.size !== 1 ? "s" : ""} from Reference?</span>
                  <button className="tb-btn sm remove-btn" onClick={() => {
                    onDeleteFromReference([...selectedIds]);
                    setSelectedIds(new Set());
                    setRefDeleteConfirm(false);
                  }}>Remove</button>
                  <button className="tb-btn sm" onClick={() => setRefDeleteConfirm(false)}>Cancel</button>
                </span>
              ) : (
                <button className="tb-btn sm remove-btn" onClick={() => setRefDeleteConfirm(true)}>Delete from Reference</button>
              )
            )}
            <span className="bulk-bar-sep" />
            <button className="tb-btn sm" onClick={() => setSelectedIds(new Set())}>Clear</button>
          </div>
        </div>
      ) : (
        <>
          {(onBulkAddTracksToPlaylist || onBulkCreatePlaylistFromTracks) && initialSourceOwnerFilter !== "reference" && (selectedIds.size > 0 || filtered.length > 0) && (
            <div className="bulk-bar music-bulk-bar">
              <div className="bulk-bar-header">
                {selectedIds.size > 0 ? (
                  <>
                    <span className="bulk-bar-count">{selectedIds.size} selected</span>
                    <button className="tb-btn sm" onClick={handleSelectFiltered} title="Add all visible tracks to selection">+ All visible</button>
                    <span className="bulk-bar-sep" />
                    {onBulkAddTracksToPlaylist && (musicPlaylists?.length ?? 0) > 0 && (
                      <select
                        className="cat-filter-sel"
                        defaultValue=""
                        onChange={(e) => {
                          if (e.target.value) { onBulkAddTracksToPlaylist(e.target.value, [...selectedIds]); e.target.value = ""; }
                        }}
                        title="Add selected tracks to a playlist"
                      >
                        <option value="">Add selected to Playlist…</option>
                        {(musicPlaylists ?? []).map((pl) => (
                          <option key={pl.playlistId} value={pl.playlistId}>{pl.title}</option>
                        ))}
                      </select>
                    )}
                    {onBulkCreatePlaylistFromTracks && (
                      <button className="tb-btn sm" onClick={() => onBulkCreatePlaylistFromTracks([...selectedIds])}>
                        New Playlist from Selection
                      </button>
                    )}
                    <span className="bulk-bar-sep" />
                    <button className="tb-btn sm" onClick={() => setSelectedIds(new Set())}>Clear</button>
                  </>
                ) : (
                  <>
                    <span className="bulk-bar-count">{filtered.length} shown</span>
                    {onBulkAddTracksToPlaylist && (musicPlaylists?.length ?? 0) > 0 && (
                      <select
                        className="cat-filter-sel"
                        defaultValue=""
                        onChange={(e) => {
                          if (e.target.value) { onBulkAddTracksToPlaylist(e.target.value, filtered.map((t) => t.trackId)); e.target.value = ""; }
                        }}
                        title="Add all filtered tracks to a playlist"
                      >
                        <option value="">Add all filtered to Playlist…</option>
                        {(musicPlaylists ?? []).map((pl) => (
                          <option key={pl.playlistId} value={pl.playlistId}>{pl.title}</option>
                        ))}
                      </select>
                    )}
                    {onBulkCreatePlaylistFromTracks && (
                      <button className="tb-btn sm" onClick={() => onBulkCreatePlaylistFromTracks(filtered.map((t) => t.trackId))}>
                        New Playlist from Filtered
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
          {selectedIds.size > 0 && onBulkUpdate && (
            <BulkEditBar
              selectedIds={selectedIds}
              onApply={handleBulkApply}
              onClear={() => setSelectedIds(new Set())}
            />
          )}
          {selectedIds.size > 0 && (onApplyMoodSuggestions || onGenerateMoodSuggestions || onBulkSetArchiveStatus || onCreateLibraryGroup) && (
            <div className="bulk-bar">
              <div className="bulk-bar-header">
                <span className="bulk-bar-count">{selectedIds.size} selected</span>
                <button className="tb-btn sm" onClick={handleSelectFiltered} title="Add all visible tracks to selection">+ All visible</button>
                {onBulkSetArchiveStatus && (
                  <>
                    <span className="bulk-bar-sep" />
                    {(["archive", "library", "needs_review", "rejected"] as TrackArchiveStatus[]).map((s) => (
                      <button
                        key={s}
                        className={`tb-btn sm archive-status-btn archive-status-btn--${s}`}
                        onClick={() => onBulkSetArchiveStatus([...selectedIds], s)}
                      >{s === "archive" ? "Archive" : s === "library" ? "Library" : s === "needs_review" ? "Review" : "Reject"}</button>
                    ))}
                  </>
                )}
                {onApplyMoodSuggestions && (
                  <button className="tb-btn sm" onClick={() => onApplyMoodSuggestions([...selectedIds])}>Apply Suggestions</button>
                )}
                {onGenerateMoodSuggestions && (
                  <button className="tb-btn sm" onClick={() => onGenerateMoodSuggestions([...selectedIds])}>Re-suggest Moods</button>
                )}
                {onCreateLibraryGroup && (
                  showGroupInput ? (
                    <span className="cat-group-input-row">
                      <input
                        className="cat-filter-search"
                        placeholder="Group name…"
                        value={groupNameInput}
                        onChange={(e) => setGroupNameInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") handleCreateLibraryGroupSubmit(); if (e.key === "Escape") { setShowGroupInput(false); setGroupNameInput(""); } }}
                        autoFocus
                      />
                      <button className="tb-btn sm" onClick={handleCreateLibraryGroupSubmit}>Create</button>
                      <button className="tb-btn sm" onClick={() => { setShowGroupInput(false); setGroupNameInput(""); }}>Cancel</button>
                    </span>
                  ) : (
                    <button className="tb-btn sm" onClick={() => setShowGroupInput(true)}>Create Group</button>
                  )
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Tracks section label */}
      <div className="cat-tracks-label">TRACKS</div>
      <table className="mtw-table">
        <thead>
          <tr>
            <th className="col-check">
              <input
                type="checkbox"
                checked={allFilteredSelected}
                onChange={() => {
                  if (allFilteredSelected) {
                    setSelectedIds((prev) => { const next = new Set(prev); filtered.forEach((t) => next.delete(t.trackId)); return next; });
                  } else {
                    setSelectedIds((prev) => { const next = new Set(prev); filtered.forEach((t) => next.add(t.trackId)); return next; });
                  }
                }}
                title="Select all visible"
              />
            </th>
            <th className="col-play-ctrl" title="Play / Add">▶</th>
            <th>#</th><th>Title</th><th>Artist</th>
            <th title="Confirmed mood tags">Mood</th>
            <th title="AI / import suggested moods">Suggested</th>
            <th title="Structural role tags (opener, bridge…)">Mech.</th>
            <th>Grouping</th><th>Genre</th>
            <th>BPM</th><th>Key</th><th>E</th><th>Dur</th>
            <th>Rating</th><th>×</th><th>Last</th>
            <th>Status</th><th>Edit</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((t, idx) => {
            const excluded = excludedTrackIds.has(t.trackId);
            const locked = lockedTrackIds.has(t.trackId);
            const exportItem = exportReport?.items.find((i) => i.trackId === t.trackId);
            const isSelected = selectedIds.has(t.trackId);
            const hasAudio = !!(t.objectUrl || t.filePath);
            return (
              <tr key={t.trackId}
                className={`${excluded ? "row-excluded" : ""}${isSelected ? " row-selected" : ""}${auditionTrackId === t.trackId ? " row-auditioning" : ""}`}
                draggable
                onClick={() => onInspect ? onInspect(t, filtered, idx) : setEditingTrack(t)}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = "copy";
                  e.dataTransfer.setData(TRACK_DRAG_MIME, encodeTrackDrag({ type: "track", source: "library", trackIds: [t.trackId] }));
                }}
                onContextMenu={(e) => { e.preventDefault(); if (t?.trackId) setCtxMenu({ trackId: t.trackId, x: e.clientX, y: e.clientY }); }}
              >
                <td className="col-check" onClick={(e) => { e.stopPropagation(); toggleSelect(t.trackId); }}>
                  <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(t.trackId)} onClick={(e) => e.stopPropagation()} />
                </td>
                <td className="col-play-ctrl" onClick={(e) => e.stopPropagation()}>
                  {onAuditionTrack && (
                    <button
                      className={`tb-btn sm col-play-btn${auditionTrackId === t.trackId ? " tb-btn-playing" : ""}${!hasAudio ? " tb-btn-dim" : ""}`}
                      title={hasAudio ? "Audition track" : "No audio linked"}
                      onClick={(e) => { e.stopPropagation(); onAuditionTrack(t.trackId); }}
                    >▶</button>
                  )}
                  {initialSourceOwnerFilter === "reference" && onAddTracksToSamplerBank && onCreateSamplerBankFromTracks ? (
                    <BankAddButton
                      trackId={t.trackId}
                      banks={samplerBanks ?? []}
                      loadedBankId={loadedSamplerBankId}
                      onAdd={onAddTracksToSamplerBank}
                      onCreateNew={onCreateSamplerBankFromTracks}
                    />
                  ) : onAuditionAndAdd && (
                    <button
                      className="tb-btn sm"
                      title="Audition and add to playlist end"
                      disabled={!hasAudio}
                      onClick={(e) => { e.stopPropagation(); onAuditionAndAdd(t.trackId); }}
                    >+</button>
                  )}
                </td>
                <td className="col-num">{idx + 1}</td>
                <td className="col-title">
                  {t.title}
                  <PlaybackBadge track={t} playbackErrors={playbackErrors} />
                  {exportItem && exportItem.status !== "ok" && <ExportBadge item={exportItem} />}
                </td>
                <td className="col-artist">{t.artist}</td>
                <td className="col-mood">
                  {(t.moodTags?.length ?? 0) > 0
                    ? <MoodChips tags={t.moodTags!} />
                    : <span className="dim">—</span>}
                </td>
                <td className="col-suggested">
                  <SuggestedChips tags={t.moodSuggestions ?? []} />
                </td>
                <td className="col-mech">
                  {(t.mechanicalMoodTags?.length ?? 0) > 0
                    ? <span className="mood-chips mood-chips-mech">
                        {(t.mechanicalMoodTags as string[]).slice(0, 2).map((m) => (
                          <span key={m} className="mood-chip mood-chip-mech">{m}</span>
                        ))}
                        {(t.mechanicalMoodTags?.length ?? 0) > 2 && (
                          <span className="mood-chip mood-chip-more">+{(t.mechanicalMoodTags?.length ?? 0) - 2}</span>
                        )}
                      </span>
                    : <span className="dim">—</span>}
                </td>
                <td className="col-grouping">{t.grouping || <span className="dim">—</span>}</td>
                <td className="col-genre">{t.genre || (t.genres?.[0]) || <span className="dim">—</span>}</td>
                <td className="col-mono">{t.bpm}</td>
                <td className="col-mono">{t.camelotKey}</td>
                <td className="col-mono">
                  {formatNumber(t.energy, 2, "—")}
                  {t.energySource === "estimated" && <span className="est-tag" title="Estimated">~</span>}
                </td>
                <td className="col-mono">{fmtDur(t.durationSeconds)}</td>
                <td className="col-rating" onClick={(e) => e.stopPropagation()}>
                  <StarRating trackId={t.trackId} rating={(t.rating ?? 0) as TrackRating} onChange={onRateTrack} />
                </td>
                <td className="col-plays">
                  {(t.playCount ?? 0) > 0
                    ? <span className="play-count">×{t.playCount}</span>
                    : <span className="play-count dim">—</span>}
                </td>
                <td className="col-mono" title={t.lastPlayedAt}>{fmtLastPlayed(t.lastPlayedAt)}</td>
                <td className="col-badges">
                  {locked && <span className="warn-badge badge-blue">LOCK</span>}
                  {excluded && <span className="warn-badge badge-dim">EXCL</span>}
                  {t.sourceOwner === "studiorich"  && <span className="warn-badge badge-teal">CAT</span>}
                  {t.sourceOwner === "external"    && <span className="warn-badge badge-ext">EXT</span>}
                  {t.sourceOwner === "reference"   && <span className="warn-badge badge-ref">REF</span>}
                  {t.sourceOwner === "unknown"     && <span className="warn-badge badge-unk">UNK</span>}
                  {(t.archiveStatus ?? "library") === "archive" && <span className="warn-badge badge-archive">ARC</span>}
                  {(t.archiveStatus ?? "library") === "needs_review" && <span className="warn-badge badge-review">REV</span>}
                  {(t.archiveStatus ?? "library") === "rejected" && <span className="warn-badge badge-rejected">REJ</span>}
                </td>
                <td className="col-actions" onClick={(e) => e.stopPropagation()}>
                  {excluded
                    ? <button className="tb-btn sm" onClick={() => onRestore(t.trackId)}>Restore</button>
                    : <button className="tb-btn sm" onClick={() => onExclude(t.trackId)}>Excl.</button>}
                  {playbackErrors.has(t.trackId) && (
                    <button className="tb-btn sm" onClick={() => onClearPlaybackIssue(t.trackId)} title="Clear playback error flag">✕Err</button>
                  )}
                  <button className="tb-btn sm" onClick={() => setEditingTrack(t)} title="Open full editor">Edit</button>
                  <button className="tb-btn sm remove-btn" onClick={() => onRemove(t.trackId)} title="Remove from library">✕</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

// ── Library Groups manager ────────────────────────────────────────────────────

function GroupsPanel({
  tracks, sourcePools, onRenameSourcePool, onRemoveSourcePool, onCleanEmptyGroups, onViewGroup,
}: {
  tracks: Track[];
  sourcePools: MusicSourcePool[];
  onRenameSourcePool?: (id: string, name: string) => void;
  onRemoveSourcePool?: (id: string) => void;
  onCleanEmptyGroups?: () => void;
  onViewGroup?: (groupId: string) => void;
}) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");

  if (sourcePools.length === 0) {
    return (
      <div className="groups-panel">
        <EmptyMsg text="No library groups yet. Select tracks in Library and use Create Library Group." green />
      </div>
    );
  }

  // Count tracks per pool via sourcePoolIds
  const trackCounts = new Map<string, number>();
  for (const t of tracks) {
    for (const pid of (t.sourcePoolIds ?? [])) {
      trackCounts.set(pid, (trackCounts.get(pid) ?? 0) + 1);
    }
  }

  const emptyCount = sourcePools.filter((p) => (trackCounts.get(p.id) ?? 0) === 0).length;

  return (
    <div className="groups-panel">
      <div className="groups-panel-toolbar">
        <span className="groups-panel-count">{sourcePools.length} group{sourcePools.length !== 1 ? "s" : ""}</span>
        {onCleanEmptyGroups && emptyCount > 0 && (
          <button className="tb-btn sm" onClick={onCleanEmptyGroups} title="Remove groups with 0 tracks">
            Clean Empty Groups ({emptyCount})
          </button>
        )}
      </div>
      <table className="mtw-table">
        <thead>
          <tr>
            <th>#</th><th>Group Name</th><th>Tracks</th><th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {sourcePools.map((pool, idx) => {
            const count = trackCounts.get(pool.id) ?? 0;
            const isRenaming = renamingId === pool.id;
            return (
              <tr key={pool.id} className={count === 0 ? "row-dim" : ""}>
                <td className="col-num">{idx + 1}</td>
                <td className="col-title">
                  {isRenaming ? (
                    <span className="rename-inline">
                      <input
                        className="bulk-input"
                        value={renameVal}
                        autoFocus
                        onChange={(e) => setRenameVal(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { onRenameSourcePool?.(pool.id, renameVal); setRenamingId(null); }
                          if (e.key === "Escape") setRenamingId(null);
                        }}
                      />
                      <button className="tb-btn sm" onClick={() => { onRenameSourcePool?.(pool.id, renameVal); setRenamingId(null); }}>Save</button>
                      <button className="tb-btn sm" onClick={() => setRenamingId(null)}>Cancel</button>
                    </span>
                  ) : pool.title}
                </td>
                <td className="col-mono">
                  {count > 0
                    ? <button className="tb-btn sm" onClick={() => onViewGroup?.(pool.id)} title="View tracks in this group">{count}</button>
                    : <span className="dim">0</span>}
                </td>
                <td className="col-actions">
                  <button className="tb-btn sm" onClick={() => { setRenamingId(pool.id); setRenameVal(pool.title); }}>Rename</button>
                  <button className="tb-btn sm remove-btn" onClick={() => onRemoveSourcePool?.(pool.id)} title="Remove group record (does not delete tracks)">Remove</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Orphans ───────────────────────────────────────────────────────────────────

function OrphanRows({ orphans, tracksById, onRestoreOrphan }: {
  orphans: OrphanTrack[];
  tracksById: Map<string, Track>;
  onRestoreOrphan: (id: string) => void;
}) {
  if (orphans.length === 0) return <EmptyMsg text="No orphans — all tracks fit the curve." green />;
  return (
    <table className="mtw-table">
      <thead>
        <tr><th>#</th><th>Title</th><th>Artist</th><th>BPM</th><th>Key</th><th>E</th><th>Reason</th><th>Actions</th></tr>
      </thead>
      <tbody>
        {orphans.map((o, idx) => {
          const t = tracksById.get(o.trackId);
          return (
            <tr key={o.trackId} className="row-red">
              <td className="col-num">{idx + 1}</td>
              <td className="col-title">{t?.title ?? o.trackId}</td>
              <td className="col-artist">{t?.artist ?? ""}</td>
              <td className="col-mono">{t?.bpm ?? ""}</td>
              <td className="col-mono">{t?.camelotKey ?? ""}</td>
              <td className="col-mono">{t ? formatNumber(t.energy, 2, "—") : ""}</td>
              <td className="col-reason">{o.explanation}</td>
              <td className="col-actions">
                <button className="tb-btn sm" onClick={() => onRestoreOrphan(o.trackId)}>Restore</button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ── Excluded ──────────────────────────────────────────────────────────────────

function ExcludedRows({ tracks, excludedTrackIds, onRestore, onRemove }: {
  tracks: Track[];
  excludedTrackIds: Set<string>;
  onRestore: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const excluded = tracks.filter((t) => excludedTrackIds.has(t.trackId));
  if (excluded.length === 0) return <EmptyMsg text="No excluded tracks." green />;
  return (
    <table className="mtw-table">
      <thead>
        <tr><th>#</th><th>Title</th><th>Artist</th><th>BPM</th><th>Key</th><th>Actions</th></tr>
      </thead>
      <tbody>
        {excluded.map((t, idx) => (
          <tr key={t.trackId} className="row-excluded">
            <td className="col-num">{idx + 1}</td>
            <td className="col-title">{t.title}</td>
            <td className="col-artist">{t.artist}</td>
            <td className="col-mono">{t.bpm}</td>
            <td className="col-mono">{t.camelotKey}</td>
            <td className="col-actions">
              <button className="tb-btn sm" onClick={() => onRestore(t.trackId)}>Restore</button>
              <button className="tb-btn sm remove-btn" onClick={() => onRemove(t.trackId)}>✕</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Locks ─────────────────────────────────────────────────────────────────────

function LocksRows({ tracks, locks, slots, onLockChange }: {
  tracks: Track[];
  locks: TrackLock[];
  slots: TrackSlot[];
  onLockChange: (l: TrackLock[]) => void;
}) {
  const [selTrack, setSelTrack] = useState("");
  const [lockType, setLockType] = useState<TrackLockType>("opener");
  const [slotIdx, setSlotIdx] = useState(0);
  const tracksById = new Map(tracks.map((t) => [t.trackId, t]));

  function addLock() {
    if (!selTrack) return;
    const existing = locks.filter((l) => l.trackId !== selTrack);
    onLockChange([...existing, { trackId: selTrack, lockType, slotIndex: lockType === "position" ? slotIdx : undefined }]);
  }

  return (
    <div className="locks-view">
      <div className="lock-form-row">
        <select value={selTrack} onChange={(e) => setSelTrack(e.target.value)}>
          <option value="">Select track…</option>
          {tracks.map((t) => <option key={t.trackId} value={t.trackId}>{t.artist} – {t.title}</option>)}
        </select>
        <select value={lockType} onChange={(e) => setLockType(e.target.value as TrackLockType)}>
          <option value="opener">Opener</option>
          <option value="closer">Closer</option>
          <option value="position">Position</option>
        </select>
        {lockType === "position" && (
          <input type="number" min={0} max={slots.length - 1} value={slotIdx}
            onChange={(e) => setSlotIdx(parseInt(e.target.value, 10))} style={{ width: 60 }} />
        )}
        <button className="tb-btn" onClick={addLock}>Add Lock</button>
      </div>
      {locks.length === 0
        ? <EmptyMsg text="No locks set." green />
        : (
          <table className="mtw-table">
            <thead><tr><th>#</th><th>Track</th><th>Type</th><th>Slot</th><th>Actions</th></tr></thead>
            <tbody>
              {locks.map((l, idx) => {
                const t = tracksById.get(l.trackId);
                return (
                  <tr key={l.trackId}>
                    <td className="col-num">{idx + 1}</td>
                    <td className="col-title">{t ? `${t.artist} – ${t.title}` : l.trackId}</td>
                    <td className="col-mono">{l.lockType}</td>
                    <td className="col-mono">{l.slotIndex ?? "—"}</td>
                    <td className="col-actions">
                      <button className="tb-btn sm remove-btn" onClick={() => onLockChange(locks.filter((x) => x.trackId !== l.trackId))}>Unlock</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function EmptyMsg({ text, green }: { text: string; green?: boolean }) {
  return <p className={`mtw-empty${green ? " green" : ""}`}>{text}</p>;
}

function WarningBar({ slots }: { slots: TrackSlot[] }) {
  const items = slots.filter((s) => s.warningLevel !== "none");
  if (items.length === 0) return null;
  return (
    <div className="warn-bar">
      {items.map((s) => {
        const badges = warnBadges(s.warningMessages);
        return (
          <span key={s.slotId} className={`warn-bar-item warn-bar-${s.warningLevel}`} title={s.warningMessages.join("\n")}>
            <span className="warn-bar-slot">#{s.slotIndex + 1}</span>
            {badges.map((b, i) => <span key={i} className={`warn-badge ${b.cls}`}>{b.type}</span>)}
          </span>
        );
      })}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function MainTrackWindow({
  mode, tracks, slots, orphans, locks, excludedTrackIds, lockedTrackIds, tracksById,
  nowPlayingSlotIndex, hoveredSlotIndex, selectedSlotIndex, playbackErrors, exportReport,
  onToggleLock, onExclude, onRestore, onRemove, onRestoreOrphan, onLockChange,
  onPlayFromSlot, onMoveUp, onMoveDown, onRowHoverChange, onRateTrack,
  onSelectSlot, onRemoveFromPlaylist, onRemoveFromPlaylistLeaveGap, onReorderSlot,
  onAddToPlaylistEnd, onInsertAfterSlot, onReplaceSlot, onFindBestSlot, onRemoveRepeats, onRunExportHealth,
  activePlaylistId, onFillGap, onDeleteGap, onClearPlaybackIssue, onBulkUpdate, onCreateLibraryGroup,
  onGenerateMoodSuggestions, onApplyMoodSuggestions,
  onRestoreSuggestionsFromImport, onRestoreSuggestionsFromMechanical, onClearSuggestedMoods,
  onAuditionTrack, onAuditionAndAdd, auditionTrackId,
  onBulkSetArchiveStatus,
  onAnalyzeTrack, onAnalyzeSelected, onAnalyzeLibrary, onReanalyze, analyzerJobs,
  sourcePools, onRenameSourcePool, onRemoveSourcePool, onCleanEmptyGroups,
  sourceOwnerFilter,
  samplerBanks, loadedSamplerBankId, onAddTracksToSamplerBank, onCreateSamplerBankFromTracks, onDeleteFromReference,
  musicPlaylists, onBulkAddTracksToPlaylist, onBulkCreatePlaylistFromTracks,
}: Props) {
  const [groupViewId, setGroupViewId] = useState<string | null>(null);
  const [inspectorTrack, setInspectorTrack] = useState<Track | null>(null);
  const [inspectorList, setInspectorList] = useState<Track[]>([]);
  const [inspectorIndex, setInspectorIndex] = useState(0);

  function handlePlayFromTrack(trackId: string) {
    const slotIdx = slots.findIndex((s) => s.assignedTrackId === trackId);
    if (slotIdx >= 0) onPlayFromSlot(slotIdx);
  }

  function handleInspect(track: Track, filteredList: Track[], index: number) {
    setInspectorTrack(track);
    setInspectorList(filteredList);
    setInspectorIndex(index);
  }

  function handleInspectorNavigate(index: number) {
    const t = inspectorList[index];
    if (!t) return;
    setInspectorTrack(t);
    setInspectorIndex(index);
  }

  function handleInspectorSave(patch: Partial<Track>) {
    if (!inspectorTrack) return;
    onBulkUpdate?.([inspectorTrack.trackId], patch);
    // Reflect save in inspector by updating with patched data
    setInspectorTrack({ ...inspectorTrack, ...patch });
  }

  return (
    <div className={`mtw${mode === "library" && inspectorTrack ? " mtw--inspecting" : ""}`}>
      {mode === "library" && inspectorTrack && (
        <TrackInspector
          track={inspectorTrack}
          filteredList={inspectorList}
          currentIndex={inspectorIndex}
          onNavigate={handleInspectorNavigate}
          onSave={handleInspectorSave}
          onClose={() => setInspectorTrack(null)}
          onAnalyzeTrack={onAnalyzeTrack}
          onReanalyze={onReanalyze ? (id) => onReanalyze([id]) : undefined}
          analyzerJobStatus={analyzerJobs?.get(inspectorTrack.trackId)}
          onRestoreSuggestionsFromImport={onRestoreSuggestionsFromImport}
          onRestoreSuggestionsFromMechanical={onRestoreSuggestionsFromMechanical}
          onClearSuggestedMoods={onClearSuggestedMoods}
        />
      )}
      <div className="mtw-scroll">
        {mode === "playlist" && (
          <PlaylistRows
            slots={slots} tracksById={tracksById} lockedTrackIds={lockedTrackIds}
            nowPlayingSlotIndex={nowPlayingSlotIndex} hoveredSlotIndex={hoveredSlotIndex}
            selectedSlotIndex={selectedSlotIndex} playbackErrors={playbackErrors} exportReport={exportReport}
            activePlaylistId={activePlaylistId}
            onToggleLock={onToggleLock} onPlayFromSlot={onPlayFromSlot} onMoveUp={onMoveUp} onMoveDown={onMoveDown}
            onRowHoverChange={onRowHoverChange} onRateTrack={onRateTrack} onSelectSlot={onSelectSlot}
            onRemoveFromPlaylist={onRemoveFromPlaylist} onRemoveFromPlaylistLeaveGap={onRemoveFromPlaylistLeaveGap}
            onReorderSlot={onReorderSlot} onRemoveRepeats={onRemoveRepeats}
            onFillGap={onFillGap} onDeleteGap={onDeleteGap}
          />
        )}
        {mode === "library" && (
          <LibraryRows
            tracks={groupViewId
              ? tracks.filter((t) => (t.sourcePoolIds ?? []).includes(groupViewId))
              : tracks}
            excludedTrackIds={excludedTrackIds} lockedTrackIds={lockedTrackIds}
            playbackErrors={playbackErrors} exportReport={exportReport} selectedSlotIndex={selectedSlotIndex}
            onExclude={onExclude} onRestore={onRestore} onRemove={onRemove} onRateTrack={onRateTrack}
            onPlayFromTrack={handlePlayFromTrack}
            onAddToPlaylistEnd={onAddToPlaylistEnd} onInsertAfterSlot={onInsertAfterSlot}
            onReplaceSlot={onReplaceSlot} onFindBestSlot={onFindBestSlot} onRunExportHealth={onRunExportHealth}
            onClearPlaybackIssue={onClearPlaybackIssue} onBulkUpdate={onBulkUpdate}
            onCreateLibraryGroup={onCreateLibraryGroup}
            onGenerateMoodSuggestions={onGenerateMoodSuggestions}
            onApplyMoodSuggestions={onApplyMoodSuggestions}
            onRestoreSuggestionsFromImport={onRestoreSuggestionsFromImport}
            onRestoreSuggestionsFromMechanical={onRestoreSuggestionsFromMechanical}
            onClearSuggestedMoods={onClearSuggestedMoods}
            onAuditionTrack={onAuditionTrack}
            onAuditionAndAdd={onAuditionAndAdd}
            auditionTrackId={auditionTrackId}
            onBulkSetArchiveStatus={onBulkSetArchiveStatus}
            onAnalyzeTrack={onAnalyzeTrack}
            onAnalyzeSelected={onAnalyzeSelected}
            onAnalyzeLibrary={onAnalyzeLibrary}
            onReanalyze={onReanalyze}
            analyzerJobs={analyzerJobs}
            initialSourceOwnerFilter={sourceOwnerFilter}
            samplerBanks={samplerBanks}
            loadedSamplerBankId={loadedSamplerBankId}
            onAddTracksToSamplerBank={onAddTracksToSamplerBank}
            onCreateSamplerBankFromTracks={onCreateSamplerBankFromTracks}
            onDeleteFromReference={onDeleteFromReference}
            musicPlaylists={musicPlaylists}
            onBulkAddTracksToPlaylist={onBulkAddTracksToPlaylist}
            onBulkCreatePlaylistFromTracks={onBulkCreatePlaylistFromTracks}
            onInspect={handleInspect}
          />
        )}
        {mode === "groups" && (
          <GroupsPanel
            tracks={tracks}
            sourcePools={sourcePools ?? []}
            onRenameSourcePool={onRenameSourcePool}
            onRemoveSourcePool={onRemoveSourcePool}
            onCleanEmptyGroups={onCleanEmptyGroups}
            onViewGroup={(id) => setGroupViewId(id)}
          />
        )}
        {mode === "orphans" && (
          <OrphanRows orphans={orphans} tracksById={tracksById} onRestoreOrphan={onRestoreOrphan} />
        )}
        {mode === "excluded" && (
          <ExcludedRows tracks={tracks} excludedTrackIds={excludedTrackIds} onRestore={onRestore} onRemove={onRemove} />
        )}
        {mode === "locks" && (
          <LocksRows tracks={tracks} locks={locks} slots={slots} onLockChange={onLockChange} />
        )}
      </div>
    </div>
  );
}

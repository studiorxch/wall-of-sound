// Compact selection action bar (0728B_MUSIC_Catalog_Selection_Actions) —
// used identically by Catalog, External, and Sounds. Mixxx/Suno-style
// contextual bar: "N selected · Edit Metadata · Analyze Missing · ••• ·
// Clear". Edit Metadata and Review BPM & Key open their own dialogs;
// everything else previously spread across this bar's primary row and
// "More…" secondary row now lives in the ••• menu, each item hidden
// (never a disabled placeholder) when its prop isn't passed — same
// eligible/ineligible-count convention as before, unchanged.
//
// Reference-library actions intentionally NOT unified with Catalog/
// External's playlist/mood/archive/group set (mirrors the pre-existing,
// still-current product doctrine that Sounds/reference clips never enter
// music playlists — see MUSIC_CURRENT.md's Source Scope Rules):
//   - Add to Bank / New Bank (Sounds-only: `onAddTracksToSamplerBank` /
//     `onCreateSamplerBankFromTracks`)
// Intentionally omitted everywhere (documented, not fabricated):
//   - "Add to crate": Crates are saved filter/pool DEFINITIONS, never
//     populated by adding individual tracks.
//   - "Reveal source file": no per-track file-reveal route exists for any
//     library's tracks in this codebase.
//   - "Mark playable/unplayable": no manual override exists; the closest
//     real canonical operation is the existing bulk Recheck-Codec-Issues
//     flow, exposed here instead of a fabricated toggle.

import { useEffect, useMemo, useRef, useState } from "react";
import type { Track, TrackArchiveStatus } from "../../data/trackTypes";
import type { PlaylistRecord, TrackPlaybackIssue } from "../../data/playProjectTypes";
import { computeActionEligibility, summarizeEligibility } from "../../logic/library/libraryActionsEligibility";
import { LibraryBatchCommentsDialog } from "./LibraryBatchCommentsDialog";
import { LibraryEditMetadataDialog } from "./LibraryEditMetadataDialog";
import { LibraryBpmKeyReviewDialog } from "./LibraryBpmKeyReviewDialog";
import { LibraryGenreFamilyReviewDialog } from "./LibraryGenreFamilyReviewDialog";

interface Props {
  selectedTracks: Track[];
  trackPlaybackIssues?: Record<string, TrackPlaybackIssue>;
  onClear: () => void;
  onBulkUpdate?: (trackIds: string[], patch: Partial<Track>) => void;
  onCreateLibraryGroup?: (trackIds: string[], groupName: string) => void;
  onGenerateMoodSuggestions?: (trackIds?: string[]) => void;
  onApplyMoodSuggestions?: (trackIds: string[]) => void;
  onBulkSetArchiveStatus?: (trackIds: string[], status: TrackArchiveStatus) => void;
  onAnalyzeSelected?: (trackIds: string[]) => void;
  onReanalyze?: (trackIds: string[]) => void;
  onAnalyzeMissing?: (trackIds: string[]) => void;
  musicPlaylists?: PlaylistRecord[];
  onBulkAddTracksToPlaylist?: (playlistId: string, trackIds: string[]) => void;
  onBulkCreatePlaylistFromTracks?: (trackIds: string[]) => void;
  onSendTrackToRadio?: (trackId: string) => void;
  onRecheckPlaybackIssue?: (trackId: string) => void;
  onBulkRecheckCodecIssues?: () => void;
  bulkRechecking?: boolean;
  // Sounds/reference-only actions.
  samplerBanks?: PlaylistRecord[];
  loadedSamplerBankId?: string | null;
  onAddTracksToSamplerBank?: (bankId: string, trackIds: string[]) => void;
  onCreateSamplerBankFromTracks?: (title: string, trackIds: string[]) => void;
  onExportPrivateMetadata: () => void;
  removeLabel: string; // "Remove from Catalog…" | "Remove from External…" | "Remove from Sounds…"
  onRequestRemove: () => void;
  // 0728G_MUSIC_Fast_Breaks_Identification — Catalog-only (StudioRich's own
  // material); External/Sounds never receive this action. Gated by the
  // caller (LibraryDataGrid, which already knows sourceKey), same as this
  // component's other source-scoped props.
  showGenreFamilyReview?: boolean;
  // 0728H_MUSIC_Review_Dialog_Playback_And_Audio_Evidence — the SAME
  // app-wide audition props LibraryDataGrid's own row Play button already
  // uses (single shared audioRef, single auditionTrackId — never a second
  // playback system). Forwarded unchanged into both review dialogs.
  onAuditionTrack?: (trackId: string) => void;
  auditionTrackId?: string | null;
  playbackStatus?: string;
  onPauseTrack?: () => void;
  onResumeTrack?: () => void;
}

export function LibraryActionBar(props: Props) {
  const {
    selectedTracks, trackPlaybackIssues, onClear, onBulkUpdate, onCreateLibraryGroup,
    onGenerateMoodSuggestions, onApplyMoodSuggestions, onBulkSetArchiveStatus,
    onAnalyzeSelected, onReanalyze, onAnalyzeMissing, musicPlaylists, onBulkAddTracksToPlaylist, onBulkCreatePlaylistFromTracks,
    onSendTrackToRadio, onBulkRecheckCodecIssues, bulkRechecking,
    samplerBanks, loadedSamplerBankId, onAddTracksToSamplerBank, onCreateSamplerBankFromTracks,
    onExportPrivateMetadata, removeLabel, onRequestRemove, showGenreFamilyReview,
    onAuditionTrack, auditionTrackId, playbackStatus, onPauseTrack, onResumeTrack,
  } = props;

  const [showMenu, setShowMenu] = useState(false);
  const [showGroupInput, setShowGroupInput] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [showBankInput, setShowBankInput] = useState(false);
  const [bankName, setBankName] = useState("");
  const [showBatchComments, setShowBatchComments] = useState(false);
  const [showEditMetadata, setShowEditMetadata] = useState(false);
  const [showBpmKeyReview, setShowBpmKeyReview] = useState(false);
  const [showGenreFamilyReviewDialog, setShowGenreFamilyReviewDialog] = useState(false);
  const [sendRadioNotice, setSendRadioNotice] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const selectedIds = useMemo(() => selectedTracks.map((t) => t.trackId), [selectedTracks]);
  const radioEligibility = useMemo(() => computeActionEligibility("sendToRadio", selectedTracks), [selectedTracks]);
  const recheckEligibility = useMemo(
    () => computeActionEligibility("recheckPlaybackIssue", selectedTracks, { trackPlaybackIssues }),
    [selectedTracks, trackPlaybackIssues],
  );

  useEffect(() => {
    if (!showMenu) return;
    function handle(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setShowMenu(false);
    }
    document.addEventListener("mousedown", handle);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handle);
      document.removeEventListener("keydown", handleKey);
    };
  }, [showMenu]);

  function handleSendToRadio() {
    if (!onSendTrackToRadio) return;
    const summary = summarizeEligibility(radioEligibility, "Send to RADIO");
    radioEligibility.eligibleIds.forEach((id) => onSendTrackToRadio(id));
    setSendRadioNotice(summary.text);
    window.setTimeout(() => setSendRadioNotice(null), 4000);
  }

  return (
    <div className="cat-action-bar">
      <div className="cat-action-bar-row">
        <span className="bulk-bar-count">{selectedTracks.length} selected</span>

        {onBulkUpdate && (
          <button className="tb-btn sm" onClick={() => setShowEditMetadata(true)}>Edit Metadata</button>
        )}
        {onAnalyzeMissing && (
          <button className="tb-btn sm" onClick={() => onAnalyzeMissing(selectedIds)}>Analyze Missing</button>
        )}

        <span className="bulk-bar-sep" />
        <div className="cat-selection-menu-wrap" ref={menuRef} style={{ position: "relative", display: "inline-block" }}>
          <button className="tb-btn sm" onClick={() => setShowMenu((v) => !v)} aria-haspopup="true" aria-expanded={showMenu}>•••</button>
          {showMenu && (
            <div
              className="cat-action-bar-row--more"
              style={{
                // 0728C_MUSIC_Selection_Dock_Positioning — the bar now sits
                // directly above the transport at the bottom of the
                // viewport, so the menu must open UPWARD (bottom: 100%) or
                // it would render clipped below the visible window.
                position: "absolute", bottom: "100%", right: 0, marginBottom: 4, zIndex: 6,
                background: "var(--surface2)", border: "1px solid var(--border2)", borderRadius: 6,
                padding: 8, display: "flex", flexDirection: "column", gap: 6, minWidth: 220,
                maxHeight: "70vh", overflowY: "auto",
              }}
            >
              {onReanalyze && (
                <button className="tb-btn sm" onClick={() => { onReanalyze(selectedIds); setShowMenu(false); }}>Reanalyze Selected</button>
              )}
              {onBulkUpdate && (
                <button className="tb-btn sm" onClick={() => { setShowBpmKeyReview(true); setShowMenu(false); }}>Review BPM &amp; Key…</button>
              )}
              {onBulkUpdate && showGenreFamilyReview && (
                <button className="tb-btn sm" onClick={() => { setShowGenreFamilyReviewDialog(true); setShowMenu(false); }}>Review Genre Family…</button>
              )}
              {onAnalyzeSelected && (
                <button className="tb-btn sm" onClick={() => { onAnalyzeSelected(selectedIds); setShowMenu(false); }}>Analyze (mechanical roles)</button>
              )}
              {onBulkUpdate && (
                <button className="tb-btn sm" onClick={() => { setShowBatchComments(true); setShowMenu(false); }}>Edit Comments…</button>
              )}

              {(onBulkAddTracksToPlaylist || onBulkCreatePlaylistFromTracks || onSendTrackToRadio) && <span className="bulk-bar-sep" />}
              {onBulkAddTracksToPlaylist && (musicPlaylists?.length ?? 0) > 0 && (
                <select
                  className="cat-filter-sel"
                  defaultValue=""
                  onChange={(e) => { if (e.target.value) { onBulkAddTracksToPlaylist(e.target.value, selectedIds); e.target.value = ""; setShowMenu(false); } }}
                  title="Add selected tracks to a playlist"
                >
                  <option value="">Add to Playlist…</option>
                  {musicPlaylists!.map((pl) => <option key={pl.playlistId} value={pl.playlistId}>{pl.title}</option>)}
                </select>
              )}
              {onBulkCreatePlaylistFromTracks && (
                <button className="tb-btn sm" onClick={() => { onBulkCreatePlaylistFromTracks(selectedIds); setShowMenu(false); }}>New Playlist</button>
              )}
              {onAddTracksToSamplerBank && (samplerBanks?.length ?? 0) > 0 && (
                <select
                  className="cat-filter-sel"
                  defaultValue=""
                  onChange={(e) => { if (e.target.value) { onAddTracksToSamplerBank(e.target.value, selectedIds); e.target.value = ""; setShowMenu(false); } }}
                  title="Add selected clips to a bank"
                >
                  <option value="">Add to Bank…</option>
                  {samplerBanks!.map((b) => (
                    <option key={b.playlistId} value={b.playlistId}>{b.playlistId === loadedSamplerBankId ? "● " : ""}{b.title}</option>
                  ))}
                </select>
              )}
              {onCreateSamplerBankFromTracks && (
                showBankInput ? (
                  <span className="cat-group-input-row">
                    <input className="cat-filter-search" placeholder="Bank name…" value={bankName} autoFocus
                      onChange={(e) => setBankName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { onCreateSamplerBankFromTracks(bankName.trim() || "New Bank", selectedIds); setBankName(""); setShowBankInput(false); setShowMenu(false); }
                        if (e.key === "Escape") { setShowBankInput(false); setBankName(""); }
                      }} />
                    <button className="tb-btn sm" onClick={() => { onCreateSamplerBankFromTracks(bankName.trim() || "New Bank", selectedIds); setBankName(""); setShowBankInput(false); setShowMenu(false); }}>Create</button>
                  </span>
                ) : <button className="tb-btn sm" onClick={() => setShowBankInput(true)}>New Bank</button>
              )}
              {onSendTrackToRadio && (
                <button
                  className="tb-btn sm"
                  disabled={radioEligibility.eligibleIds.length === 0}
                  title={summarizeEligibility(radioEligibility, "Send to RADIO").text}
                  onClick={() => { handleSendToRadio(); setShowMenu(false); }}
                >Send to RADIO{radioEligibility.ineligibleIds.length > 0 ? ` (${radioEligibility.eligibleIds.length}/${selectedTracks.length})` : ""}</button>
              )}

              {(onBulkSetArchiveStatus || onApplyMoodSuggestions || onGenerateMoodSuggestions || onCreateLibraryGroup) && <span className="bulk-bar-sep" />}
              {onBulkSetArchiveStatus && (["archive", "library", "needs_review", "rejected"] as TrackArchiveStatus[]).map((s) => (
                <button
                  key={s}
                  className={`tb-btn sm archive-status-btn archive-status-btn--${s}`}
                  onClick={() => { onBulkSetArchiveStatus(selectedIds, s); setShowMenu(false); }}
                >{s === "archive" ? "Archive" : s === "library" ? "Library" : s === "needs_review" ? "Review" : "Reject"}</button>
              ))}
              {onApplyMoodSuggestions && <button className="tb-btn sm" onClick={() => { onApplyMoodSuggestions(selectedIds); setShowMenu(false); }}>Apply Mood Suggestions</button>}
              {onGenerateMoodSuggestions && <button className="tb-btn sm" onClick={() => { onGenerateMoodSuggestions(selectedIds); setShowMenu(false); }}>Re-suggest Moods</button>}
              {onCreateLibraryGroup && (
                showGroupInput ? (
                  <span className="cat-group-input-row">
                    <input className="cat-filter-search" placeholder="Group name…" value={groupName} autoFocus
                      onChange={(e) => setGroupName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && groupName.trim()) { onCreateLibraryGroup(selectedIds, groupName.trim()); setGroupName(""); setShowGroupInput(false); setShowMenu(false); }
                        if (e.key === "Escape") { setShowGroupInput(false); setGroupName(""); }
                      }} />
                    <button className="tb-btn sm" onClick={() => { if (groupName.trim()) { onCreateLibraryGroup(selectedIds, groupName.trim()); setGroupName(""); setShowGroupInput(false); setShowMenu(false); } }}>Create</button>
                  </span>
                ) : <button className="tb-btn sm" onClick={() => setShowGroupInput(true)}>Create Group</button>
              )}

              <span className="bulk-bar-sep" />
              {onBulkRecheckCodecIssues && recheckEligibility.eligibleIds.length > 0 && (
                <button className="tb-btn sm" onClick={onBulkRecheckCodecIssues} disabled={bulkRechecking} title={summarizeEligibility(recheckEligibility, "Recheck").text}>
                  {bulkRechecking ? "Rechecking…" : `Recheck Codec Issues (${recheckEligibility.eligibleIds.length})`}
                </button>
              )}
              <button className="tb-btn sm" onClick={() => { onExportPrivateMetadata(); setShowMenu(false); }}>Export Private Metadata (CSV)</button>
              <button className="tb-btn sm remove-btn" onClick={() => { onRequestRemove(); setShowMenu(false); }}>{removeLabel}</button>
            </div>
          )}
        </div>

        <button className="tb-btn sm" onClick={onClear}>Clear</button>
      </div>

      {sendRadioNotice && <div className="cat-action-bar-notice">{sendRadioNotice}</div>}

      {showEditMetadata && onBulkUpdate && (
        <LibraryEditMetadataDialog
          selectedTracks={selectedTracks}
          onBulkUpdate={onBulkUpdate}
          onClose={() => setShowEditMetadata(false)}
        />
      )}

      {showBpmKeyReview && onBulkUpdate && (
        <LibraryBpmKeyReviewDialog
          selectedTracks={selectedTracks}
          onBulkUpdate={onBulkUpdate}
          onClose={() => setShowBpmKeyReview(false)}
          onAuditionTrack={onAuditionTrack}
          auditionTrackId={auditionTrackId}
          playbackStatus={playbackStatus}
          onPauseTrack={onPauseTrack}
          onResumeTrack={onResumeTrack}
          onAnalyzeMissing={onAnalyzeMissing}
        />
      )}

      {showGenreFamilyReviewDialog && onBulkUpdate && (
        <LibraryGenreFamilyReviewDialog
          selectedTracks={selectedTracks}
          onBulkUpdate={onBulkUpdate}
          onClose={() => setShowGenreFamilyReviewDialog(false)}
          onAuditionTrack={onAuditionTrack}
          auditionTrackId={auditionTrackId}
          playbackStatus={playbackStatus}
          onPauseTrack={onPauseTrack}
          onResumeTrack={onResumeTrack}
        />
      )}

      {showBatchComments && onBulkUpdate && (
        <LibraryBatchCommentsDialog
          selectedTracks={selectedTracks}
          onApply={(mode, text) => {
            // `_bulkCommentsMode` mirrors the existing `_bulkGenreMode`/
            // `_bulkMoodMode` convention (App.tsx's handleBulkUpdateTracks) —
            // the per-track merge computes each track's OWN new value from
            // its OWN existing notes, since append/replace must never
            // overwrite every selected track with one shared final string.
            onBulkUpdate(selectedIds, { notes: text, _bulkCommentsMode: mode } as unknown as Partial<Track>);
            setShowBatchComments(false);
          }}
          onClose={() => setShowBatchComments(false)}
        />
      )}
    </div>
  );
}

// Shared consolidated contextual selected-track action bar — used by
// Catalog, External, and Sounds through one component. Frequent actions
// are direct controls; secondary/destructive actions live under "More…".
// Every mixed-selection action shows eligible/ineligible/affected counts
// before running and never silently drops ineligible tracks. Which
// optional props a given library passes in is exactly its "available
// actions" configuration — Catalog/External pass the playlist/mood/
// archive/codec set, Sounds passes the bank set instead; neither invents
// an action the other doesn't support, and nothing renders disabled
// without explanation — an unsupported action is simply never passed.
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

import { useMemo, useState } from "react";
import type { Track, TrackArchiveStatus } from "../../data/trackTypes";
import type { PlaylistRecord, TrackPlaybackIssue } from "../../data/playProjectTypes";
import { computeActionEligibility, summarizeEligibility } from "../../logic/library/libraryActionsEligibility";
import { LibraryBatchCommentsDialog } from "./LibraryBatchCommentsDialog";

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
}

export function LibraryActionBar(props: Props) {
  const {
    selectedTracks, trackPlaybackIssues, onClear, onBulkUpdate, onCreateLibraryGroup,
    onGenerateMoodSuggestions, onApplyMoodSuggestions, onBulkSetArchiveStatus,
    onAnalyzeSelected, onReanalyze, musicPlaylists, onBulkAddTracksToPlaylist, onBulkCreatePlaylistFromTracks,
    onSendTrackToRadio, onBulkRecheckCodecIssues, bulkRechecking,
    samplerBanks, loadedSamplerBankId, onAddTracksToSamplerBank, onCreateSamplerBankFromTracks,
    onExportPrivateMetadata, removeLabel, onRequestRemove,
  } = props;

  const [showMore, setShowMore] = useState(false);
  const [showGroupInput, setShowGroupInput] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [showBankInput, setShowBankInput] = useState(false);
  const [bankName, setBankName] = useState("");
  const [showBatchComments, setShowBatchComments] = useState(false);
  const [sendRadioNotice, setSendRadioNotice] = useState<string | null>(null);

  const selectedIds = useMemo(() => selectedTracks.map((t) => t.trackId), [selectedTracks]);
  const radioEligibility = useMemo(() => computeActionEligibility("sendToRadio", selectedTracks), [selectedTracks]);
  const recheckEligibility = useMemo(
    () => computeActionEligibility("recheckPlaybackIssue", selectedTracks, { trackPlaybackIssues }),
    [selectedTracks, trackPlaybackIssues],
  );

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

        {onBulkAddTracksToPlaylist && (musicPlaylists?.length ?? 0) > 0 && (
          <select
            className="cat-filter-sel"
            defaultValue=""
            onChange={(e) => { if (e.target.value) { onBulkAddTracksToPlaylist(e.target.value, selectedIds); e.target.value = ""; } }}
            title="Add selected tracks to a playlist"
          >
            <option value="">Add to Playlist…</option>
            {musicPlaylists!.map((pl) => <option key={pl.playlistId} value={pl.playlistId}>{pl.title}</option>)}
          </select>
        )}
        {onBulkCreatePlaylistFromTracks && (
          <button className="tb-btn sm" onClick={() => onBulkCreatePlaylistFromTracks(selectedIds)}>New Playlist</button>
        )}
        {onAddTracksToSamplerBank && (samplerBanks?.length ?? 0) > 0 && (
          <select
            className="cat-filter-sel"
            defaultValue=""
            onChange={(e) => { if (e.target.value) { onAddTracksToSamplerBank(e.target.value, selectedIds); e.target.value = ""; } }}
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
                  if (e.key === "Enter") { onCreateSamplerBankFromTracks(bankName.trim() || "New Bank", selectedIds); setBankName(""); setShowBankInput(false); }
                  if (e.key === "Escape") { setShowBankInput(false); setBankName(""); }
                }} />
              <button className="tb-btn sm" onClick={() => { onCreateSamplerBankFromTracks(bankName.trim() || "New Bank", selectedIds); setBankName(""); setShowBankInput(false); }}>Create</button>
            </span>
          ) : <button className="tb-btn sm" onClick={() => setShowBankInput(true)}>New Bank</button>
        )}
        {onSendTrackToRadio && (
          <button
            className="tb-btn sm"
            disabled={radioEligibility.eligibleIds.length === 0}
            title={summarizeEligibility(radioEligibility, "Send to RADIO").text}
            onClick={handleSendToRadio}
          >RADIO{radioEligibility.ineligibleIds.length > 0 ? ` (${radioEligibility.eligibleIds.length}/${selectedTracks.length})` : ""}</button>
        )}
        {onAnalyzeSelected && (
          <button className="tb-btn sm" onClick={() => onAnalyzeSelected(selectedIds)}>Analyze</button>
        )}
        {onReanalyze && (
          <button className="tb-btn sm" onClick={() => onReanalyze(selectedIds)}>Reanalyze</button>
        )}
        {onBulkUpdate && (
          <button className="tb-btn sm" onClick={() => setShowBatchComments(true)}>Edit Comments…</button>
        )}

        <span className="bulk-bar-sep" />
        <button className="tb-btn sm" onClick={() => setShowMore((v) => !v)}>{showMore ? "Less…" : "More…"}</button>
        <button className="tb-btn sm" onClick={onClear}>Clear</button>
      </div>

      {sendRadioNotice && <div className="cat-action-bar-notice">{sendRadioNotice}</div>}

      {showMore && (
        <div className="cat-action-bar-row cat-action-bar-row--more">
          {onBulkSetArchiveStatus && (["archive", "library", "needs_review", "rejected"] as TrackArchiveStatus[]).map((s) => (
            <button
              key={s}
              className={`tb-btn sm archive-status-btn archive-status-btn--${s}`}
              onClick={() => onBulkSetArchiveStatus(selectedIds, s)}
            >{s === "archive" ? "Archive" : s === "library" ? "Library" : s === "needs_review" ? "Review" : "Reject"}</button>
          ))}
          {onApplyMoodSuggestions && <button className="tb-btn sm" onClick={() => onApplyMoodSuggestions(selectedIds)}>Apply Mood Suggestions</button>}
          {onGenerateMoodSuggestions && <button className="tb-btn sm" onClick={() => onGenerateMoodSuggestions(selectedIds)}>Re-suggest Moods</button>}
          {onCreateLibraryGroup && (
            showGroupInput ? (
              <span className="cat-group-input-row">
                <input className="cat-filter-search" placeholder="Group name…" value={groupName} autoFocus
                  onChange={(e) => setGroupName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && groupName.trim()) { onCreateLibraryGroup(selectedIds, groupName.trim()); setGroupName(""); setShowGroupInput(false); }
                    if (e.key === "Escape") { setShowGroupInput(false); setGroupName(""); }
                  }} />
                <button className="tb-btn sm" onClick={() => { if (groupName.trim()) { onCreateLibraryGroup(selectedIds, groupName.trim()); setGroupName(""); setShowGroupInput(false); } }}>Create</button>
              </span>
            ) : <button className="tb-btn sm" onClick={() => setShowGroupInput(true)}>Create Group</button>
          )}
          {onBulkRecheckCodecIssues && recheckEligibility.eligibleIds.length > 0 && (
            <button className="tb-btn sm" onClick={onBulkRecheckCodecIssues} disabled={bulkRechecking} title={summarizeEligibility(recheckEligibility, "Recheck").text}>
              {bulkRechecking ? "Rechecking…" : `Recheck Codec Issues (${recheckEligibility.eligibleIds.length})`}
            </button>
          )}
          <button className="tb-btn sm" onClick={onExportPrivateMetadata}>Export Private Metadata (CSV)</button>
          <span className="bulk-bar-sep" />
          <button className="tb-btn sm remove-btn" onClick={onRequestRemove}>{removeLabel}</button>
        </div>
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

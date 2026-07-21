// 0717D_RADIO_Playlist_Inbox_and_Performance_Foundation §6.4 — the
// mandatory "explicit update comparison" surface: a source MUSIC playlist
// change is never silently applied over a RADIO playlist. Confirming here
// is the only path that actually re-syncs (via onConfirm -> the caller's
// sendPlaylistToRadio wiring); dismissing leaves the RADIO playlist
// untouched.

import type { Track } from "../../data/trackTypes";
import type { RadioPlaylistUpdateDiff } from "../../logic/radio/radioPlaylistUpdateComparison";

interface Props {
  diff: RadioPlaylistUpdateDiff;
  radioPlaylistTitle: string;
  libraryTracks: Track[];
  onConfirm: () => void;
  onCancel: () => void;
  // 0718A_MUSIC_RADIO_Clean_Board_and_Explicit_Send_Flows §3/§4 — shared
  // verbatim between playlist and bank sends; only these two copy strings
  // change.
  kindLabel?: "playlist" | "bank";
}

function trackLabel(trackId: string, libraryTracks: Track[]): string {
  const track = libraryTracks.find((t) => t.trackId === trackId);
  return track ? `${track.artist} — ${track.title}` : trackId;
}

export function RadioPlaylistUpdateCompareDialog({ diff, radioPlaylistTitle, libraryTracks, onConfirm, onCancel, kindLabel = "playlist" }: Props) {
  return (
    <div className="radio-dialog-overlay" role="dialog" aria-modal="true">
      <div className="radio-dialog">
        <h3>Source {kindLabel} changed</h3>
        <p>
          The MUSIC {kindLabel} behind <strong>{radioPlaylistTitle}</strong> has changed since it was last sent to RADIO.
        </p>

        {diff.orderChanged && <p className="radio-diff-line">Track order changed.</p>}

        {diff.addedTrackIds.length > 0 && (
          <div className="radio-diff-section">
            <div className="radio-diff-label">Added ({diff.addedTrackIds.length})</div>
            <ul>{diff.addedTrackIds.map((id) => <li key={id}>{trackLabel(id, libraryTracks)}</li>)}</ul>
          </div>
        )}

        {diff.removedTrackIds.length > 0 && (
          <div className="radio-diff-section">
            <div className="radio-diff-label">Removed ({diff.removedTrackIds.length})</div>
            <ul>{diff.removedTrackIds.map((id) => <li key={id}>{trackLabel(id, libraryTracks)}</li>)}</ul>
          </div>
        )}

        {!diff.orderChanged && diff.addedTrackIds.length === 0 && diff.removedTrackIds.length === 0 && (
          <p className="radio-diff-line">No effective changes detected.</p>
        )}

        <p className="radio-diff-note">Locked entries are never dropped or reordered away, even if their track left the source {kindLabel}.</p>

        <div className="radio-dialog-actions">
          <button className="npw-btn npw-btn--ghost" onClick={onCancel}>Cancel</button>
          <button className="npw-btn npw-btn--primary" onClick={onConfirm}>Update RADIO {kindLabel}</button>
        </div>
      </div>
    </div>
  );
}

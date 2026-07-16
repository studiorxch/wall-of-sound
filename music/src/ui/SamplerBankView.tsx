import { useState } from "react";
import type { PlaylistRecord } from "../data/playProjectTypes";
import type { Track } from "../data/trackTypes";
import { CollectionDetailBar } from "./CollectionDetailBar";

function fmtDur(s: number | undefined): string {
  if (!s || !isFinite(s) || s <= 0) return "—";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

type Props = {
  bank: PlaylistRecord;
  libraryTracks: Track[];
  onLoadInSampler: (playlistId: string) => void;
  onAddReferenceTracksToBank: (bankId: string, trackIds: string[]) => void;
  referenceTrackCount: number;
  onGoHome?: () => void;
  onNewBank?: () => void;
  onDeleteBank?: () => void;
};

export function SamplerBankView({ bank, libraryTracks, onLoadInSampler, onAddReferenceTracksToBank, referenceTrackCount, onGoHome, onNewBank, onDeleteBank }: Props) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const tracksById = new Map(libraryTracks.map((t) => [t.trackId, t]));

  const clips = bank.slots
    .map((s, i) => {
      const track = s.assignedTrackId ? tracksById.get(s.assignedTrackId) : undefined;
      const hasAudio = !!(track?.objectUrl || track?.filePath);
      return { index: i, slot: s, track, hasAudio };
    })
    .filter((r) => r.slot.assignedTrackId || r.track);

  const refTracks = libraryTracks.filter((t) => t.sourceOwner === "reference");
  const inBankIds = new Set(bank.slots.map((s) => s.assignedTrackId).filter(Boolean));
  const addableRefTracks = refTracks.filter((t) => !inBankIds.has(t.trackId));

  return (
    <div className="sbv">
      {onGoHome && (
        <CollectionDetailBar
          collectionLabel="Banks"
          onBackToCollection={onGoHome}
          createLabel={onNewBank ? "+ New Bank" : undefined}
          onCreate={onNewBank}
        />
      )}

      <div className="sbv-header">
        <div className="sbv-title-row">
          <span className="sbv-bank-label">SAMPLER BANK</span>
          <span className="sbv-bank-name">{bank.title}</span>
          <span className="sbv-clip-count">{clips.length} clips</span>
        </div>
        <div className="sbv-actions">
          <button
            className="sbv-btn sbv-btn-primary"
            onClick={() => onLoadInSampler(bank.playlistId)}
            title="Load this bank into the Sampler player"
          >
            ▶ Load in Sampler
          </button>
          {addableRefTracks.length > 0 && (
            <button
              className="sbv-btn"
              onClick={() => onAddReferenceTracksToBank(bank.playlistId, addableRefTracks.map((t) => t.trackId))}
              title={`Add ${addableRefTracks.length} Sounds tracks not yet in this bank`}
            >
              + Add {addableRefTracks.length} Sounds Track{addableRefTracks.length !== 1 ? "s" : ""}
            </button>
          )}
          {onDeleteBank && (
            <button
              className="sbv-btn sbv-btn-danger"
              onClick={() => setConfirmDelete(true)}
              title="Delete this Bank"
            >
              Delete Bank
            </button>
          )}
        </div>
      </div>

      {clips.length === 0 ? (
        <div className="sbv-empty">
          <p>This Bank is empty.</p>
          {referenceTrackCount > 0 && (
            <p>
              <button
                className="sbv-btn sbv-btn-primary"
                onClick={() => onAddReferenceTracksToBank(bank.playlistId, refTracks.map((t) => t.trackId))}
              >
                + Add all {referenceTrackCount} Sounds tracks
              </button>
            </p>
          )}
          {referenceTrackCount === 0 && (
            <p className="sbv-hint">Import audio files into the Sounds library to populate this bank.</p>
          )}
        </div>
      ) : (
        <div className="sbv-table-wrap">
          <table className="sbv-table">
            <thead>
              <tr>
                <th className="sbv-th sbv-th-idx">#</th>
                <th className="sbv-th sbv-th-title">Clip</th>
                <th className="sbv-th sbv-th-dur">Duration</th>
                <th className="sbv-th sbv-th-status">Audio</th>
              </tr>
            </thead>
            <tbody>
              {clips.map(({ index, track, hasAudio }) => (
                <tr key={index} className={`sbv-row${hasAudio ? "" : " sbv-row-missing"}`}>
                  <td className="sbv-td sbv-td-idx">{index + 1}</td>
                  <td className="sbv-td sbv-td-title">
                    <span className="sbv-clip-title">{track?.title ?? "(empty slot)"}</span>
                    {track?.artist && <span className="sbv-clip-artist">{track.artist}</span>}
                  </td>
                  <td className="sbv-td sbv-td-dur">{fmtDur(track?.durationSeconds)}</td>
                  <td className="sbv-td sbv-td-status">
                    {hasAudio
                      ? <span className="sbv-status-ok">✓</span>
                      : <span className="sbv-status-miss">No file</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirmDelete && (
        <div className="export-modal-overlay" onClick={() => setConfirmDelete(false)}>
          <div className="export-modal" onClick={(e) => e.stopPropagation()}>
            <div className="export-modal-title">Delete Bank?</div>
            <p className="export-modal-desc">
              "{bank.title}" will be permanently deleted. This cannot be undone.
            </p>
            <div className="export-modal-actions">
              <button className="ph-btn-danger" onClick={() => { setConfirmDelete(false); onDeleteBank?.(); }}>
                Delete
              </button>
              <button className="export-modal-cancel" onClick={() => setConfirmDelete(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

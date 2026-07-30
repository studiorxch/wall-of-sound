// Shared guarded-removal confirmation — used identically by Catalog,
// External, and Sounds, whether reached via the selection dock's bulk
// "Remove from…" action or a single row's own "Remove from…" action
// (0728E_MUSIC_Catalog_Single_Track_Remove) — one dialog, one confirm path,
// regardless of how the caller arrived at exactly one track. The underlying
// removal handler (and whether it also needs to sync an on-disk index, as
// Sounds/reference does) is the caller's responsibility via `onConfirm`,
// never this dialog's.
//
// When exactly one track is being removed, `trackTitle`/`references` name
// the exact track and report every existing system (crates, playlists,
// RADIO playlists, RADIO banks) that currently references it — computed by
// trackReferenceReport.ts, never fabricated — so removal is never a
// surprise. The N>1 bulk message is unchanged from before this build.

import type { TrackReferenceReport } from "../../logic/library/trackReferenceReport";
import { isEmptyTrackReferenceReport } from "../../logic/library/trackReferenceReport";

interface Props {
  count: number;
  libraryLabel: string; // "Catalog" | "External" | "Sounds"
  unitLabel: string; // "tracks" | "clips"
  trackTitle?: string; // present only when count === 1
  references?: TrackReferenceReport; // present only when count === 1
  onConfirm: () => void;
  onCancel: () => void;
}

function ReferenceList({ label, matches }: { label: string; matches: { id: string; label: string }[] }) {
  if (matches.length === 0) return null;
  return (
    <li>
      {label}: {matches.map((m) => m.label).join(", ")}
    </li>
  );
}

export function LibraryRemoveConfirmDialog({ count, libraryLabel, unitLabel, trackTitle, references, onConfirm, onCancel }: Props) {
  const unit = count === 1 ? unitLabel.replace(/s$/, "") : unitLabel;
  const showSingleTrackDetail = count === 1 && trackTitle != null && references != null;
  return (
    <div className="export-modal-overlay" onClick={onCancel}>
      <div className="export-modal cat-remove-confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <h3>Remove from {libraryLabel}</h3>
        {showSingleTrackDetail ? (
          <>
            <p>
              Remove <b>“{trackTitle}”</b> from {libraryLabel}? This does not delete the
              underlying audio file — only the library entry.
            </p>
            {isEmptyTrackReferenceReport(references!) ? (
              <p className="cat-remove-confirm-refs">No crate, playlist, RADIO playlist, or RADIO bank currently references this track.</p>
            ) : (
              <div className="cat-remove-confirm-refs">
                <p>This track is currently referenced by:</p>
                <ul>
                  <ReferenceList label="Crates" matches={references!.crates} />
                  <ReferenceList label="Playlists" matches={references!.playlists} />
                  <ReferenceList label="RADIO playlists" matches={references!.radioPlaylists} />
                  <ReferenceList label="RADIO banks" matches={references!.radioBanks} />
                </ul>
              </div>
            )}
          </>
        ) : (
          <p>
            Remove <b>{count}</b> {unit} from {libraryLabel}? This does not delete the
            underlying audio file — only the library entry.
          </p>
        )}
        <div className="cat-batch-comments-actions">
          <button className="tb-btn sm" onClick={onCancel}>Cancel</button>
          <button className="tb-btn sm remove-btn" onClick={onConfirm}>Remove {count} {unit}</button>
        </div>
      </div>
    </div>
  );
}

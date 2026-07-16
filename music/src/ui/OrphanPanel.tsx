import type { OrphanTrack } from "../data/playlistTypes";
import type { Track } from "../data/trackTypes";
import { formatNumber } from "../logic/dateFormat";

type Props = {
  orphans: OrphanTrack[];
  tracksById: Map<string, Track>;
  onRestoreOrphan: (trackId: string) => void;
};

export function OrphanPanel({ orphans, tracksById, onRestoreOrphan }: Props) {
  if (orphans.length === 0) {
    return (
      <div className="panel orphan-panel">
        <h3>Orphans</h3>
        <p className="empty-msg clean-msg">No orphans — all tracks fit the curve.</p>
      </div>
    );
  }

  return (
    <div className="panel orphan-panel">
      <h3>Orphans ({orphans.length})</h3>
      <p className="orphan-note">These tracks do not fit the current curve shape.</p>
      <ul className="orphan-list">
        {orphans.map((o) => {
          const track = tracksById.get(o.trackId);
          return (
            <li key={o.trackId} className="orphan-item">
              <div className="orphan-track">
                {track
                  ? <strong>{track.artist} – {track.title}</strong>
                  : <strong>{o.trackId}</strong>}
                {track && (
                  <span className="orphan-meta">
                    {track.bpm ?? "—"} BPM · {track.camelotKey ?? "—"} · E {formatNumber(track.energy, 2, "—")}
                  </span>
                )}
              </div>
              <div className="orphan-reason">{o.explanation}</div>
              <button onClick={() => onRestoreOrphan(o.trackId)}>Restore to Pool</button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

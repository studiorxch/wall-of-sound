import type { Track } from "../data/trackTypes";
import { formatNumber } from "../logic/dateFormat";

type Props = {
  tracks: Track[];
  excludedTrackIds: Set<string>;
  lockedTrackIds: Set<string>;
  onExclude: (trackId: string) => void;
  onRestore: (trackId: string) => void;
  onRemove: (trackId: string) => void;
};

export function TrackTable({ tracks, excludedTrackIds, lockedTrackIds, onExclude, onRestore, onRemove }: Props) {
  if (tracks.length === 0) {
    return (
      <div className="panel track-table-panel">
        <h3>Track Pool</h3>
        <p className="empty-msg">No tracks loaded. Import a CSV to begin.</p>
      </div>
    );
  }

  return (
    <div className="panel track-table-panel">
      <h3>Track Pool ({tracks.length})</h3>
      <div className="track-table-scroll">
        <table className="track-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Artist</th>
              <th>BPM</th>
              <th>Key</th>
              <th>Energy</th>
              <th>Duration</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {tracks.map((t) => {
              const excluded = excludedTrackIds.has(t.trackId);
              const locked = lockedTrackIds.has(t.trackId);
              const s = t.durationSeconds;
              const dur = (s == null || isNaN(s) || s <= 0) ? "—" : `${Math.floor(s / 60)}:${Math.round(s % 60).toString().padStart(2, "0")}`;
              return (
                <tr key={t.trackId} className={excluded ? "row-excluded" : ""}>
                  <td>{t.title}</td>
                  <td>{t.artist}</td>
                  <td>{t.bpm}</td>
                  <td>{t.camelotKey}</td>
                  <td>
                    {formatNumber(t.energy, 2, "—")}
                    {t.energySource === "estimated" && <span className="est-badge" title="Estimated from BPM"> ~</span>}
                  </td>
                  <td>{dur}</td>
                  <td>
                    {locked && <span className="lock-badge">🔒</span>}
                    {excluded && <span className="excluded-badge">excluded</span>}
                  </td>
                  <td className="track-actions">
                    {excluded ? (
                      <button onClick={() => onRestore(t.trackId)}>Restore</button>
                    ) : (
                      <button onClick={() => onExclude(t.trackId)}>Exclude</button>
                    )}
                    <button className="remove-btn" onClick={() => onRemove(t.trackId)}>Remove</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

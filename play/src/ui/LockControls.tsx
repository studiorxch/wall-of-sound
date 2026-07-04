import { useState } from "react";
import type { TrackLock, TrackLockType } from "../data/playlistTypes";
import type { Track } from "../data/trackTypes";

type Props = {
  tracks: Track[];
  locks: TrackLock[];
  slots: { slotIndex: number; assignedTrackId?: string }[];
  onLockChange: (locks: TrackLock[]) => void;
};

export function LockControls({ tracks, locks, slots, onLockChange }: Props) {
  const [selectedTrackId, setSelectedTrackId] = useState("");
  const [lockType, setLockType] = useState<TrackLockType>("opener");
  const [slotIndex, setSlotIndex] = useState(0);

  function addLock() {
    if (!selectedTrackId) return;
    const existing = locks.filter((l) => l.trackId !== selectedTrackId);
    const newLock: TrackLock = {
      trackId: selectedTrackId,
      lockType,
      slotIndex: lockType === "position" ? slotIndex : undefined,
    };
    onLockChange([...existing, newLock]);
  }

  function removeLock(trackId: string) {
    onLockChange(locks.filter((l) => l.trackId !== trackId));
  }

  const tracksById = new Map(tracks.map((t) => [t.trackId, t]));

  return (
    <div className="panel lock-panel">
      <h3>Lock Songs</h3>
      <div className="lock-form">
        <select value={selectedTrackId} onChange={(e) => setSelectedTrackId(e.target.value)}>
          <option value="">Select track…</option>
          {tracks.map((t) => (
            <option key={t.trackId} value={t.trackId}>{t.artist} – {t.title}</option>
          ))}
        </select>
        <select value={lockType} onChange={(e) => setLockType(e.target.value as TrackLockType)}>
          <option value="opener">Opener (first)</option>
          <option value="closer">Closer (last)</option>
          <option value="position">Position</option>
        </select>
        {lockType === "position" && (
          <input
            type="number"
            min={0}
            max={slots.length - 1}
            value={slotIndex}
            onChange={(e) => setSlotIndex(parseInt(e.target.value, 10))}
            placeholder="Slot #"
            style={{ width: 70 }}
          />
        )}
        <button onClick={addLock}>Lock</button>
      </div>

      {locks.length > 0 && (
        <ul className="lock-list">
          {locks.map((l) => {
            const track = tracksById.get(l.trackId);
            return (
              <li key={l.trackId}>
                <span className="lock-badge">🔒</span>
                <strong>{track ? `${track.artist} – ${track.title}` : l.trackId}</strong>
                <em> [{l.lockType}{l.lockType === "position" ? ` #${l.slotIndex}` : ""}]</em>
                <button onClick={() => removeLock(l.trackId)}>Unlock</button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

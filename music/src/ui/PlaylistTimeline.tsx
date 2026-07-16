import type { TrackSlot } from "../data/playlistTypes";
import type { Track } from "../data/trackTypes";
import { formatNumber } from "../logic/dateFormat";

type Props = {
  slots: TrackSlot[];
  tracksById: Map<string, Track>;
  lockedTrackIds: Set<string>;
  onToggleLock: (trackId: string, slotIndex: number) => void;
};

function fmtDuration(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function PlaylistTimeline({ slots, tracksById, lockedTrackIds, onToggleLock }: Props) {
  if (slots.length === 0) {
    return <div className="panel timeline-panel"><p className="empty-msg">No playlist generated yet.</p></div>;
  }

  return (
    <div className="panel timeline-panel">
      <h3>Playlist ({slots.length} slots)</h3>
      <div className="timeline-list">
        {slots.map((slot) => {
          const track = slot.assignedTrackId ? tracksById.get(slot.assignedTrackId) : undefined;
          const isLocked = track && lockedTrackIds.has(track.trackId);
          const cls = `timeline-row warning-${slot.warningLevel}${isLocked ? " row-locked" : ""}`;
          return (
            <div key={slot.slotId} className={cls} title={slot.warningMessages.join("\n")}>
              <span className="slot-num">{String(slot.slotIndex + 1).padStart(2, "0")}</span>
              <span className="slot-time">{fmtTime(slot.startTimeSeconds)}</span>
              {track ? (
                <>
                  <button
                    className={`inline-lock-btn${isLocked ? " is-locked" : ""}`}
                    title={isLocked ? "Unlock" : "Lock position"}
                    onClick={() => onToggleLock(track.trackId, slot.slotIndex)}
                  >
                    {isLocked ? "🔒" : "🔓"}
                  </button>
                  <span className="slot-artist">{track.artist}</span>
                  <span className="slot-sep">–</span>
                  <span className="slot-title">{track.title}</span>
                  <span className="slot-meta">{track.bpm} BPM</span>
                  <span className="slot-meta">{track.camelotKey}</span>
                  <span className="slot-meta">E {formatNumber(track.energy, 2, "—")}</span>
                  <span className="slot-meta">{fmtDuration(track.durationSeconds)}</span>
                  {track.energySource === "estimated" && <span className="est-badge" title="Energy estimated from BPM">~E</span>}
                </>
              ) : (
                <span className="slot-empty">— empty slot —</span>
              )}
              {slot.warningLevel !== "none" && (
                <span className={`warn-dot warn-${slot.warningLevel}`} title={slot.warningMessages.join("\n")}>
                  {slot.warningLevel === "red" ? "●" : "◐"}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

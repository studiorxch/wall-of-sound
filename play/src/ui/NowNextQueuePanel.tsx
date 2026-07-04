import type { NowNextQueueState, QueuePanelTrack } from "../logic/nowNextQueue";

function fmtDur(secs?: number): string {
  if (!secs || secs <= 0) return "";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function TrackRow({
  track,
  accent,
  showDuration = true,
  dim = false,
}: {
  track: QueuePanelTrack;
  accent: string;
  showDuration?: boolean;
  dim?: boolean;
}) {
  const slotNum = `#${String(track.slotIndex + 1).padStart(2, "0")}`;
  const dur = fmtDur(track.durationSeconds);
  const unplayable = !track.isPlayable && !track.isEmptySlot;

  return (
    <div className={`nnq-track${dim ? " nnq-track-dim" : ""}${unplayable ? " nnq-track-unplayable" : ""}`}>
      <span className="nnq-slot" style={track.isCurrent ? { color: accent } : {}}>{slotNum}</span>
      <span className="nnq-info">
        <span className="nnq-title" title={track.title}>{track.title}</span>
        {track.artist && <span className="nnq-artist">{track.artist}</span>}
      </span>
      {showDuration && dur && <span className="nnq-dur">{dur}</span>}
      {unplayable && (
        <span className="nnq-badge-error" title={track.playbackIssueCode ?? "Unplayable"}>✕</span>
      )}
    </div>
  );
}

type Props = {
  queue: NowNextQueueState;
  accent: string;
  currentTimeSeconds?: number;
  durationSeconds?: number;
};

export function NowNextQueuePanel({ queue, accent }: Props) {
  const { now, next, upNext, autoplayEnabled, playableRemainingCount, skippedUnplayableCount, skippedEmptyCount } = queue;
  const skippedTotal = skippedUnplayableCount + skippedEmptyCount;

  return (
    <div className="nnq-panel">
      {/* NOW */}
      <div className="nnq-section">
        <div className="nnq-label" style={{ color: accent }}>NOW</div>
        {now ? (
          <TrackRow track={now} accent={accent} showDuration={false} />
        ) : (
          <div className="nnq-empty-state">Not playing</div>
        )}
      </div>

      <div className="nnq-divider" style={{ borderColor: accent }} />

      {/* NEXT */}
      <div className="nnq-section">
        <div className="nnq-label">NEXT</div>
        {next ? (
          <TrackRow track={next} accent={accent} />
        ) : (
          <div className="nnq-empty-state">
            {playableRemainingCount === 0 ? "End of playlist" : "—"}
          </div>
        )}
        {!autoplayEnabled && (
          <div className="nnq-autoplay-off">Autoplay off</div>
        )}
      </div>

      {/* UP NEXT */}
      {upNext.length > 0 && (
        <>
          <div className="nnq-divider" style={{ borderColor: accent }} />
          <div className="nnq-section">
            <div className="nnq-label">UP NEXT</div>
            {upNext.map((t) => (
              <TrackRow key={t.slotIndex} track={t} accent={accent} dim />
            ))}
          </div>
        </>
      )}

      {/* Skipped summary */}
      {skippedTotal > 0 && (
        <div className="nnq-skipped">
          {skippedUnplayableCount > 0 && `${skippedUnplayableCount} unplayable`}
          {skippedUnplayableCount > 0 && skippedEmptyCount > 0 && " · "}
          {skippedEmptyCount > 0 && `${skippedEmptyCount} empty`}
          {" skipped"}
        </div>
      )}
    </div>
  );
}

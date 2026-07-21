// 0716A_MUSIC_Direct_Manipulation_Looper_And_Playhead §"Persistent
// Playhead"/"Draggable Playhead" — a persistent vertical playhead layered
// on top of TimelineSelectionOverlay (so it always paints over the
// selection fill), sharing the SAME x = (seconds/duration) * width mapping
// every other waveform-stack layer already uses. Purely a position
// renderer + drag hit-target — all position/engine logic (freezing on
// pause, click-to-seek, pause-drag-resume) lives in the parent workspace,
// which is the sole thing that talks to the audio engine.

const VIEW_W = 1000;
const VIEW_H = 120;
const HIT_W = 10;

interface PlayheadMarkerProps {
  durationSeconds: number;
  seconds: number;
  onPointerDown: (e: React.PointerEvent) => void;
  // 0716A (corrections) — view-window mapping for zoom/pan. When the
  // playhead falls outside the visible window it is simply not rendered
  // (an edge-pinned line would misread as a real position).
  viewStartSeconds?: number;
  viewEndSeconds?: number;
}

export function PlayheadMarker({ durationSeconds, seconds, onPointerDown, viewStartSeconds, viewEndSeconds }: PlayheadMarkerProps) {
  const duration = Math.max(durationSeconds, 0.001);
  const viewStart = Math.max(0, viewStartSeconds ?? 0);
  const viewEnd = Math.min(duration, viewEndSeconds ?? duration);
  const windowDur = Math.max(viewEnd - viewStart, 0.001);
  const clamped = Math.max(0, Math.min(duration, seconds));
  if (clamped < viewStart || clamped > viewEnd) return null;
  const x = ((clamped - viewStart) / windowDur) * VIEW_W;

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="none"
      className="looper-playhead-svg"
      aria-hidden="true"
    >
      <line x1={x} x2={x} y1={0} y2={VIEW_H} className="looper-playhead-line" />
      <rect
        x={x - HIT_W / 2} y={0} width={HIT_W} height={VIEW_H}
        className="looper-playhead-hit"
        style={{ cursor: "ew-resize" }}
        onPointerDown={onPointerDown}
        role="slider"
        aria-label={`Playhead: ${clamped.toFixed(3)} seconds`}
        aria-valuenow={clamped}
      />
    </svg>
  );
}

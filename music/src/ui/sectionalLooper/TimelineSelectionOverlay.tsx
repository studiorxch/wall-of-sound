// 0715B — direct timeline range selection: fill + draggable left/right
// handles, rendered above the waveform (§8, §9). Shares the waveform
// overview's own x = (seconds/duration) * width mapping (§19-style
// alignment, matching the 0715A GridBackdropLayer convention).

import type { TimelineSelection } from "../../data/loopTypes";

const VIEW_W = 1000;
const VIEW_H = 120;
const HANDLE_W = 6;

interface Props {
  durationSeconds: number;
  sampleRate: number;
  selection: TimelineSelection | null;
  onHandleDown: (which: "start" | "end", e: React.PointerEvent) => void;
  // 0716A §"Movable Selection Body" — whole-range drag, distinct from the
  // two edge handles below (which stay drawn AFTER this body rect in DOM
  // order, so they keep interaction priority wherever they visually overlap
  // the body, per the spec's own interaction-precedence ordering).
  onBodyDown?: (e: React.PointerEvent) => void;
  // 0716A (corrections) — view-window mapping for zoom/pan; defaults
  // preserve the original full-track behavior exactly.
  viewStartSeconds?: number;
  viewEndSeconds?: number;
}

export function TimelineSelectionOverlay({ durationSeconds, selection, onHandleDown, onBodyDown, viewStartSeconds, viewEndSeconds }: Props) {
  const duration = Math.max(durationSeconds, 0.001);
  const viewStart = Math.max(0, viewStartSeconds ?? 0);
  const viewEnd = Math.min(duration, viewEndSeconds ?? duration);
  const windowDur = Math.max(viewEnd - viewStart, 0.001);
  const xAt = (seconds: number) => ((seconds - viewStart) / windowDur) * VIEW_W;

  if (!selection) return null;

  const x1 = xAt(selection.startSeconds);
  const x2 = xAt(selection.endSeconds);

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="none"
      className="looper-selection-svg"
      aria-hidden="true"
    >
      <rect x={x1} y={0} width={Math.max(0, x2 - x1)} height={VIEW_H} className="looper-selection-fill" />
      {onBodyDown && (
        <rect
          x={x1} y={0} width={Math.max(0, x2 - x1)} height={VIEW_H}
          className="looper-selection-body-hit"
          style={{ cursor: "grab" }}
          onPointerDown={onBodyDown}
          role="slider"
          aria-label={`Move selection: ${selection.startSeconds.toFixed(3)} to ${selection.endSeconds.toFixed(3)} seconds`}
        />
      )}
      <rect
        x={x1 - HANDLE_W / 2} y={0} width={HANDLE_W} height={VIEW_H}
        className="looper-selection-handle"
        style={{ cursor: "ew-resize" }}
        onPointerDown={(e) => onHandleDown("start", e)}
        role="slider"
        aria-label={`Selection start: ${selection.startSeconds.toFixed(3)} seconds`}
        aria-valuenow={selection.startSeconds}
      />
      <rect
        x={x2 - HANDLE_W / 2} y={0} width={HANDLE_W} height={VIEW_H}
        className="looper-selection-handle"
        style={{ cursor: "ew-resize" }}
        onPointerDown={(e) => onHandleDown("end", e)}
        role="slider"
        aria-label={`Selection end: ${selection.endSeconds.toFixed(3)} seconds`}
        aria-valuenow={selection.endSeconds}
      />
    </svg>
  );
}

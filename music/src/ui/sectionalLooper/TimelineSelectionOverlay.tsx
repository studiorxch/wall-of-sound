// 0715B — direct timeline range selection: fill + draggable left/right
// handles, rendered above the waveform (§8, §9). Shares the waveform
// overview's own x = (seconds/duration) * width mapping (§19-style
// alignment, matching the 0715A GridBackdropLayer convention).
//
// Ableton-legible ruler pass — handles are visually a top-anchored bracket
// + a thin full-height hairline instead of a solid full-height bar. The
// invisible hit-target rect underneath is UNCHANGED (same HANDLE_W, same
// position) so drag behavior/selection semantics are byte-identical; only
// the decorative paint on top of it changed.

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
      {([
        { x: x1, which: "start" as const, dir: 1, label: `Selection start: ${selection.startSeconds.toFixed(3)} seconds`, value: selection.startSeconds },
        { x: x2, which: "end" as const, dir: -1, label: `Selection end: ${selection.endSeconds.toFixed(3)} seconds`, value: selection.endSeconds },
      ]).map((h) => (
        <g key={h.which}>
          <line x1={h.x} x2={h.x} y1={0} y2={VIEW_H} className="looper-selection-hairline" />
          <path
            d={`M ${h.x} 0 L ${h.x} 10 L ${h.x + h.dir * 9} 10 L ${h.x + h.dir * 9} 6 L ${h.x + h.dir * 4} 6 L ${h.x + h.dir * 4} 0 Z`}
            className="looper-selection-bracket"
          />
          {/* Invisible hit target — same width/position as before this pass;
              drag behavior/hit area is unchanged. */}
          <rect
            x={h.x - HANDLE_W / 2} y={0} width={HANDLE_W} height={VIEW_H}
            className="looper-selection-handle"
            style={{ cursor: "ew-resize" }}
            onPointerDown={(e) => onHandleDown(h.which, e)}
            role="slider"
            aria-label={h.label}
            aria-valuenow={h.value}
          />
        </g>
      ))}
    </svg>
  );
}

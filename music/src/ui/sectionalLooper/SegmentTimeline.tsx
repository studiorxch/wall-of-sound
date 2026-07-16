// 0714T §18/§19/§20/§25 — visible contiguous "train car" segment timeline.
// Uses the SAME shared TimelineTransform as the waveform/ruler (§39).

import type { TrackSegment } from "../../data/loopTypes";
import type { TimelineTransform } from "./timelineTransform";

export type SegmentVisualState = "idle" | "hovered" | "selected" | "contains-active-loop" | "stale";

interface Props {
  segments: TrackSegment[];
  transform: TimelineTransform;
  selectedSegmentId: string | null;
  hoveredSegmentId: string | null;
  activeLoopSegmentIds: Set<string>;
  staleSegmentIds: Set<string>;
  onSelect: (segmentId: string) => void;
  onHover: (segmentId: string | null) => void;
}

const VIEW_H = 34;

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toFixed(1).padStart(4, "0");
  return `${m}:${s}`;
}

export function SegmentTimeline({
  segments, transform, selectedSegmentId, hoveredSegmentId, activeLoopSegmentIds, staleSegmentIds, onSelect, onHover,
}: Props) {
  if (segments.length === 0) {
    return <div className="looper-segment-timeline-empty">No canonical segments yet — use "Generate Equal Segments" below.</div>;
  }

  function stateFor(s: TrackSegment): SegmentVisualState {
    if (staleSegmentIds.has(s.id)) return "stale";
    if (activeLoopSegmentIds.has(s.id)) return "contains-active-loop";
    if (selectedSegmentId === s.id) return "selected";
    if (hoveredSegmentId === s.id) return "hovered";
    return "idle";
  }

  return (
    <div className="looper-segment-timeline" role="group" aria-label="Canonical segment timeline">
      <svg viewBox={`0 0 ${transform.widthPx} ${VIEW_H}`} preserveAspectRatio="none" className="looper-segment-timeline-svg">
        {segments.map((s) => {
          const x = transform.frameToX(s.startFrame);
          const w = Math.max(1, transform.frameToX(s.endFrame) - x);
          const state = stateFor(s);
          const partial = s.label === "tail";
          return (
            <g key={s.id}>
              <rect
                x={x} y={2} width={w} height={VIEW_H - 4}
                className={`looper-segment-car is-${state}`}
                role="button"
                tabIndex={0}
                aria-label={`Segment ${s.order + 1}, ${s.displayLabel ?? s.label}, ${fmt(s.startSeconds)} to ${fmt(s.endSeconds)}, ${state}${partial ? ", partial final segment" : ""}`}
                onClick={() => onSelect(s.id)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(s.id); } }}
                onMouseEnter={() => onHover(s.id)}
                onMouseLeave={() => onHover(null)}
              />
              {w > 40 && (
                <text x={x + 4} y={VIEW_H / 2 + 3} className="looper-segment-car-label">
                  {s.order + 1}. {s.displayLabel ?? s.label}{partial ? " (partial)" : ""}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

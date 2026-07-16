// 0714T §5/§6 — Ableton-style musical ruler, aligned directly above the
// waveform via the SAME shared TimelineTransform the waveform itself uses
// (§39) — never an independently-computed width.

import type { MusicalGrid, TimelineZoomLevel } from "../../data/loopTypes";
import { buildGridMarks } from "../../logic/loops/musicalGrid";
import type { TimelineTransform } from "./timelineTransform";

interface Props {
  grid: MusicalGrid | null;
  sampleRate: number;
  zoomLevel: TimelineZoomLevel;
  transform: TimelineTransform;
}

const VIEW_H = 22;

export function MusicalRuler({ grid, sampleRate, zoomLevel, transform }: Props) {
  if (!grid) {
    return <div className="looper-ruler looper-ruler-empty" role="img" aria-label="Musical ruler unavailable — no usable grid">Ruler unavailable — no usable BPM.</div>;
  }
  const marks = buildGridMarks(grid, sampleRate, zoomLevel === "fine" ? "beats" : zoomLevel);
  const summary = `${grid.bpm.toFixed(2)} BPM, ${grid.meterNumerator}/${grid.meterDenominator}, ${grid.trust} grid`;

  return (
    <div className="looper-ruler" role="img" aria-label={`Musical ruler: ${summary}`}>
      <svg viewBox={`0 0 ${transform.widthPx} ${VIEW_H}`} preserveAspectRatio="none" className="looper-ruler-svg">
        {marks.map((m, i) => {
          const x = transform.frameToX(m.frame);
          if (x < 0 || x > transform.widthPx) return null;
          return (
            <g key={i}>
              <line x1={x} x2={x} y1={m.kind === "bar" ? 0 : VIEW_H * 0.4} y2={VIEW_H} className={`looper-ruler-tick is-${m.kind}`} />
              {m.kind === "bar" && (
                <text x={x + 2} y={10} className="looper-ruler-label">{m.label}</text>
              )}
              {m.kind === "beat" && zoomLevel !== "bars" && (
                <text x={x + 1} y={VIEW_H - 2} className="looper-ruler-label looper-ruler-label-beat">{m.label}</text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

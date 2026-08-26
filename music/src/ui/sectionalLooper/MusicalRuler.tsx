// 0714T §5/§6 — Ableton-style musical ruler, docked directly above the
// waveform stack. Uses the SAME viewStartSeconds/viewEndSeconds live view
// window every sibling layer (GridBackdropLayer, TrackWaveformOverview,
// TimelineSelectionOverlay, PlayheadMarker) already reads — never an
// independently-computed width, and never the track's full duration once
// zoomed (that mismatch was the root cause this pass fixes).

import type { MusicalGrid, TimelineZoomLevel } from "../../data/loopTypes";
import { buildGridMarks, buildSubdivisionFrames } from "../../logic/loops/musicalGrid";

interface Props {
  grid: MusicalGrid | null;
  sampleRate: number;
  zoomLevel: TimelineZoomLevel;
  durationSeconds: number;
  viewStartSeconds: number;
  viewEndSeconds: number;
  playheadSeconds?: number;
  onPlayheadPointerDown?: (e: React.PointerEvent) => void;
}

const VIEW_W = 1000;
const VIEW_H = 22;
// Same progressive-reveal floor GridBackdropLayer uses for its own lines —
// subdivisions are the finest tier, so they alone are gated here; bar/beat
// density is still governed by the explicit zoomLevel selection as before.
const MIN_SUBDIVISION_SPACING_VB = 5;

export function MusicalRuler({
  grid, sampleRate, zoomLevel, durationSeconds, viewStartSeconds, viewEndSeconds, playheadSeconds, onPlayheadPointerDown,
}: Props) {
  if (!grid) {
    return <div className="looper-ruler looper-ruler-empty" role="img" aria-label="Musical ruler unavailable — no usable grid">Ruler unavailable — no usable BPM.</div>;
  }

  const duration = Math.max(durationSeconds, 0.001);
  const viewStart = Math.max(0, viewStartSeconds ?? 0);
  const viewEnd = Math.min(duration, viewEndSeconds ?? duration);
  const windowDur = Math.max(viewEnd - viewStart, 0.001);
  const xAt = (seconds: number) => ((seconds - viewStart) / windowDur) * VIEW_W;

  const marks = buildGridMarks(grid, sampleRate, zoomLevel === "fine" ? "beats" : zoomLevel);
  const summary = `${grid.bpm.toFixed(2)} BPM, ${grid.meterNumerator}/${grid.meterDenominator}, ${grid.trust} grid`;

  // Subdivisions are a separate, spacing-gated tier — never emitted from
  // buildGridMarks at anything but "fine", and only actually drawn once
  // on-screen spacing clears the readability floor (adaptive by zoom AND
  // by the real pixel density at the current view window, matching the
  // grid backdrop's own progressive-reveal convention).
  const subdivisionFrames = zoomLevel === "fine" ? buildSubdivisionFrames(grid) : [];
  const subSpacingVb = subdivisionFrames.length >= 2
    ? xAt(subdivisionFrames[1] / sampleRate) - xAt(subdivisionFrames[0] / sampleRate) : 0;
  const showSubdivisions = subSpacingVb >= MIN_SUBDIVISION_SPACING_VB;

  const playheadX = playheadSeconds != null ? xAt(playheadSeconds) : null;
  const showPlayhead = playheadX != null && playheadSeconds! >= viewStart && playheadSeconds! <= viewEnd;

  return (
    <div className="looper-ruler" role="img" aria-label={`Musical ruler: ${summary}`}>
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="none" className="looper-ruler-svg">
        {showSubdivisions && subdivisionFrames.map((frame, i) => {
          const x = xAt(frame / sampleRate);
          if (x < 0 || x > VIEW_W) return null;
          return <line key={`sub-${i}`} x1={x} x2={x} y1={VIEW_H * 0.7} y2={VIEW_H} className="looper-ruler-tick is-subdivision" />;
        })}
        {marks.map((m, i) => {
          const x = xAt(m.seconds);
          if (x < 0 || x > VIEW_W) return null;
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
        {showPlayhead && (
          <g className="looper-ruler-playhead">
            <path
              d={`M ${playheadX! - 5} 1 L ${playheadX! + 5} 1 L ${playheadX!} 10 Z`}
              className="looper-ruler-playhead-flag"
              onPointerDown={onPlayheadPointerDown}
              style={{ cursor: onPlayheadPointerDown ? "ew-resize" : undefined }}
              role={onPlayheadPointerDown ? "slider" : undefined}
              aria-label={onPlayheadPointerDown ? `Playhead: ${playheadSeconds!.toFixed(3)} seconds` : undefined}
            />
          </g>
        )}
      </svg>
    </div>
  );
}

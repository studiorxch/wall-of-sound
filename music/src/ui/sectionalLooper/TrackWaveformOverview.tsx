// 0714R — full-track waveform overview (§8, §9, §13, §19, §20, §25).
// Renders real min/max peaks as an SVG polygon, with section boundary
// ticks, candidate region overlays (state-distinguished by more than
// color — outline weight/fill, per §9/§25), and an absolute-time playhead.
//
// 0716A_MUSIC_Direct_Manipulation_Looper_And_Playhead (corrections) — the
// overview becomes view-window aware for zoom/pan: optional
// viewStartSeconds/viewEndSeconds map every x through the SAME linear
// formula, now over the visible window instead of always the full track,
// and optional windowPeaks (recomputed from the decoded buffer at the
// current zoom) replace the full-track envelope bins when supplied, so
// zooming actually reveals detail instead of stretching 768 full-track
// bins. Defaults preserve the original full-track behavior exactly.

import type { WaveformEnvelope, WaveformPeak } from "../../data/loopTypes";
import type { LoopCandidate } from "../../logic/loops/loopCandidates";

export type CandidateVisualState =
  | "idle"
  | "hovered"
  | "selected"
  | "previewing"
  | "approved"
  | "rejected";

export interface LoopSectionBounds {
  label: string;
  start: number;
  end: number;
}

interface Props {
  waveform: WaveformEnvelope | null;
  waveformError?: string | null;
  sections: LoopSectionBounds[];
  candidates: LoopCandidate[];
  candidateState: (index: number) => CandidateVisualState;
  playheadSeconds?: number;
  onCandidateSelect: (index: number) => void;
  onCandidateHover?: (index: number | null) => void;
  viewStartSeconds?: number;
  viewEndSeconds?: number;
  windowPeaks?: WaveformPeak[] | null;
}

const VIEW_W = 1000;
const VIEW_H = 120;
const OVERLAY_H = 18;

export function TrackWaveformOverview({
  waveform, waveformError, sections, candidates, candidateState, playheadSeconds,
  onCandidateSelect, onCandidateHover, viewStartSeconds, viewEndSeconds, windowPeaks,
}: Props) {
  if (waveformError) {
    return (
      <div className="looper-waveform-overview looper-waveform-error" role="alert">
        Waveform unavailable — {waveformError}. Preview and approval remain usable.
      </div>
    );
  }
  if (!waveform) {
    return (
      <div className="looper-waveform-overview looper-waveform-loading" aria-live="polite">
        Waveform loading…
      </div>
    );
  }

  const duration = Math.max(waveform.durationSeconds, 0.001);
  const viewStart = Math.max(0, viewStartSeconds ?? 0);
  const viewEnd = Math.min(duration, viewEndSeconds ?? duration);
  const windowDur = Math.max(viewEnd - viewStart, 0.001);
  const xAt = (seconds: number) => ((seconds - viewStart) / windowDur) * VIEW_W;

  const mid = VIEW_H / 2;
  const scaleY = (VIEW_H / 2) - 2;
  const topPoints: string[] = [];
  const bottomPoints: string[] = [];
  if (windowPeaks && windowPeaks.length > 0) {
    // Window-resolution peaks span exactly [viewStart, viewEnd].
    const step = VIEW_W / windowPeaks.length;
    windowPeaks.forEach((p, i) => {
      const x = i * step;
      topPoints.push(`${x.toFixed(2)},${(mid - p.max * scaleY).toFixed(2)}`);
      bottomPoints.push(`${x.toFixed(2)},${(mid - p.min * scaleY).toFixed(2)}`);
    });
  } else {
    // Full-track envelope bins, mapped through the view window (bins
    // outside the window simply fall outside the viewBox and are clipped).
    const binDur = duration / waveform.peaks.length;
    waveform.peaks.forEach((p, i) => {
      const x = xAt(i * binDur);
      if (x < -VIEW_W || x > VIEW_W * 2) return;
      topPoints.push(`${x.toFixed(2)},${(mid - p.max * scaleY).toFixed(2)}`);
      bottomPoints.push(`${x.toFixed(2)},${(mid - p.min * scaleY).toFixed(2)}`);
    });
  }
  const polygon = [...topPoints, ...bottomPoints.reverse()].join(" ");

  return (
    <div className="looper-waveform-overview" role="group" aria-label="Full-track waveform overview">
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="none"
        className="looper-waveform-svg"
      >
        <polygon points={polygon} className="looper-waveform-polygon" />

        {sections.map((s, i) => (
          <line
            key={`section-${i}`}
            x1={xAt(s.start)} x2={xAt(s.start)}
            y1={0} y2={VIEW_H}
            className="looper-waveform-section-tick"
          />
        ))}

        {candidates.map((c, i) => {
          const state = candidateState(i);
          const x = xAt(c.startSeconds);
          const w = Math.max(1, xAt(c.endSeconds) - x);
          return (
            <g key={i}>
              <rect
                x={x} y={VIEW_H - OVERLAY_H} width={w} height={OVERLAY_H}
                className={`looper-waveform-region is-${state}`}
                role="button"
                tabIndex={0}
                aria-label={`${c.label}, ${state}`}
                onClick={() => onCandidateSelect(i)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onCandidateSelect(i); } }}
                onMouseEnter={() => onCandidateHover?.(i)}
                onMouseLeave={() => onCandidateHover?.(null)}
              />
              {state === "approved" && (
                <text x={x + 2} y={VIEW_H - OVERLAY_H - 3} className="looper-waveform-badge-text">✓</text>
              )}
            </g>
          );
        })}

        {playheadSeconds != null && playheadSeconds >= viewStart && playheadSeconds <= viewEnd && (
          <line
            x1={xAt(playheadSeconds)} x2={xAt(playheadSeconds)}
            y1={0} y2={VIEW_H}
            className="looper-waveform-playhead"
          />
        )}
      </svg>
      <div className="looper-waveform-duration-label">
        {formatDuration(viewStart)} – {formatDuration(viewEnd)}
      </div>
    </div>
  );
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

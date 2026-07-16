// 0714R — per-candidate mini waveform (§10, §13, §25). Renders the
// candidate's own loop-region peaks with a loop-relative playhead when this
// candidate is the one actively previewing.

import type { WaveformPeak } from "../../data/loopTypes";

interface Props {
  peaks: WaveformPeak[] | null;
  isSelected: boolean;
  isPreviewing: boolean;
  // §13 — loop-relative playhead position (0..durationSeconds), not
  // absolute track time — distinct from the overview's absolute playhead.
  relativePlayheadSeconds?: number;
  durationSeconds: number;
  onSelect: () => void;
}

const VIEW_W = 300;
const VIEW_H = 48;

export function LoopCandidateWaveform({
  peaks, isSelected, isPreviewing, relativePlayheadSeconds, durationSeconds, onSelect,
}: Props) {
  if (!peaks) {
    return (
      <div className="looper-mini-waveform looper-mini-waveform-loading" aria-hidden="true">
        Waveform loading…
      </div>
    );
  }

  const mid = VIEW_H / 2;
  const scaleY = (VIEW_H / 2) - 1;
  const step = VIEW_W / Math.max(1, peaks.length);
  const top: string[] = [];
  const bottom: string[] = [];
  peaks.forEach((p, i) => {
    const x = i * step;
    top.push(`${x.toFixed(2)},${(mid - p.max * scaleY).toFixed(2)}`);
    bottom.push(`${x.toFixed(2)},${(mid - p.min * scaleY).toFixed(2)}`);
  });
  const polygon = [...top, ...bottom.reverse()].join(" ");

  const dur = Math.max(durationSeconds, 0.001);
  const playheadX = relativePlayheadSeconds != null
    ? (Math.max(0, Math.min(dur, relativePlayheadSeconds)) / dur) * VIEW_W
    : null;

  return (
    <button
      type="button"
      className={`looper-mini-waveform${isSelected ? " is-selected" : ""}${isPreviewing ? " is-previewing" : ""}`}
      onClick={onSelect}
      aria-pressed={isSelected}
      aria-label={isPreviewing ? "Previewing this candidate" : "Select this candidate"}
    >
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="none" className="looper-mini-waveform-svg">
        <polygon points={polygon} className="looper-mini-waveform-polygon" />
        <line x1={0} x2={0} y1={0} y2={VIEW_H} className="looper-mini-waveform-boundary" />
        <line x1={VIEW_W} x2={VIEW_W} y1={0} y2={VIEW_H} className="looper-mini-waveform-boundary" />
        {playheadX != null && (
          <line x1={playheadX} x2={playheadX} y1={0} y2={VIEW_H} className="looper-mini-waveform-playhead" />
        )}
      </svg>
    </button>
  );
}

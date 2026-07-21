// 0717D_RADIO_Playlist_Inbox_and_Performance_Foundation §10 — renders a
// collapsed RADIO prep row's persisted waveform overview. Reads the
// already-reduced min/max bins straight off CompleteSongAnalysis.waveformSummary
// — zero decode, zero peak computation here. Same pixel-mapping approach
// TrackWaveformOverview already uses (a top/bottom polygon), just fed
// pre-reduced data instead of computing peaks itself.
//
// A missing summary renders a brief "queued" state — this only ever
// appears while a track hasn't reached the front of the batch preparation
// queue yet, never as the finished state of the feature.

import type { SongWaveformSummary } from "../../data/songAnalysisTypes";

interface Props {
  summary: SongWaveformSummary | null | undefined;
  height?: number;
}

const VIEW_W = 640;

export function WaveformSummaryPreview({ summary, height = 40 }: Props) {
  if (!summary || summary.minValues.length === 0 || summary.maxValues.length === 0) {
    return (
      <div className="radio-waveform-summary-preview radio-waveform-summary-queued" style={{ height }} aria-live="polite">
        Queued…
      </div>
    );
  }

  const n = summary.minValues.length;
  const mid = height / 2;
  const scaleY = Math.max(mid - 1, 1);
  const step = VIEW_W / n;

  const topPoints: string[] = [];
  const bottomPoints: string[] = [];
  for (let i = 0; i < n; i++) {
    const x = i * step;
    const maxV = summary.maxValues[i] ?? 0;
    const minV = summary.minValues[i] ?? 0;
    topPoints.push(`${x.toFixed(2)},${(mid - maxV * scaleY).toFixed(2)}`);
    bottomPoints.push(`${x.toFixed(2)},${(mid - minV * scaleY).toFixed(2)}`);
  }
  const polygon = [...topPoints, ...bottomPoints.reverse()].join(" ");

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${height}`}
      preserveAspectRatio="none"
      className="radio-waveform-summary-preview"
      role="img"
      aria-label="Track waveform overview"
    >
      <polygon points={polygon} className="radio-waveform-summary-polygon" />
    </svg>
  );
}

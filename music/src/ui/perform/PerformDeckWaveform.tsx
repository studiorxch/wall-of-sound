import type { PerformDeckMonitor } from "../../logic/perform/dualDeckPerformMonitor";

const VIEW_W = 1000;
const VIEW_H = 150;

function xAt(seconds: number, duration: number): number {
  return Math.max(0, Math.min(VIEW_W, (seconds / Math.max(duration, 0.001)) * VIEW_W));
}

export function PerformDeckWaveform({ deck }: { deck: PerformDeckMonitor }) {
  const summary = deck.waveform;
  const duration = deck.state.durationSeconds ?? deck.track?.durationSeconds ?? 0;
  if (!deck.track) return <div className="perform-waveform perform-waveform--empty">No track loaded</div>;
  if (!summary || duration <= 0) return <div className="perform-waveform perform-waveform--empty">Waveform unavailable</div>;

  const mid = VIEW_H / 2;
  const scaleY = mid - 4;
  const count = Math.min(summary.minValues.length, summary.maxValues.length);
  const top: string[] = [];
  const bottom: string[] = [];
  for (let index = 0; index < count; index++) {
    const x = (index / Math.max(count - 1, 1)) * VIEW_W;
    top.push(`${x.toFixed(2)},${(mid - (summary.maxValues[index] ?? 0) * scaleY).toFixed(2)}`);
    bottom.push(`${x.toFixed(2)},${(mid - (summary.minValues[index] ?? 0) * scaleY).toFixed(2)}`);
  }

  return (
    <div className="perform-waveform" role="img" aria-label={`Deck ${deck.deckId} waveform for ${deck.track.title}`}>
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="none">
        <polygon points={[...top, ...bottom.reverse()].join(" ")} className="perform-waveform__peaks" />
        {deck.timing.sections.map((section) => (
          <rect key={section.id} x={xAt(section.startSeconds, duration)} y="0"
            width={Math.max(1, xAt(section.endSeconds, duration) - xAt(section.startSeconds, duration))}
            height={VIEW_H} className="perform-waveform__section" />
        ))}
        {(deck.timing.phrases ?? []).map((seconds) => <line key={`phrase-${seconds}`} x1={xAt(seconds, duration)} x2={xAt(seconds, duration)} y1="0" y2={VIEW_H} className="perform-waveform__phrase" />)}
        {(deck.timing.bars ?? []).map((seconds) => <line key={`bar-${seconds}`} x1={xAt(seconds, duration)} x2={xAt(seconds, duration)} y1={VIEW_H - 28} y2={VIEW_H} className="perform-waveform__bar" />)}
        {(deck.timing.beats ?? []).map((seconds) => <line key={`beat-${seconds}`} x1={xAt(seconds, duration)} x2={xAt(seconds, duration)} y1={VIEW_H - 12} y2={VIEW_H} className="perform-waveform__beat" />)}
        {deck.selectedRegion && <rect x={xAt(deck.selectedRegion.startSeconds, duration)} y="4"
          width={Math.max(2, xAt(deck.selectedRegion.endSeconds, duration) - xAt(deck.selectedRegion.startSeconds, duration))}
          height={VIEW_H - 8} className="perform-waveform__region" />}
        {deck.genericCues.map((cue) => <line key={cue.id} x1={xAt(cue.timeSeconds, duration)} x2={xAt(cue.timeSeconds, duration)} y1="0" y2={VIEW_H} className="perform-waveform__generic-cue" />)}
        {deck.transitionCue && <line x1={xAt(deck.transitionCue.seconds, duration)} x2={xAt(deck.transitionCue.seconds, duration)} y1="0" y2={VIEW_H} className="perform-waveform__transition-cue" />}
        <line x1={xAt(deck.state.currentTimeSeconds, duration)} x2={xAt(deck.state.currentTimeSeconds, duration)} y1="0" y2={VIEW_H} className="perform-waveform__playhead" />
      </svg>
    </div>
  );
}

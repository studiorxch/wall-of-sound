// 0715G_MUSIC_Sectional_Looper_Simplification_And_Stem_Ready_Export
// §Duration-First Display — combines the previously-separate Duration/Bars
// fields into one duration-first line ("24.6 sec · 8 bars").

interface DurationDisplayProps {
  durationSeconds: number;
  bars?: number;
  // 0828_MUSIC_Looper_Loop_Library_Tagging — the spec's "compact loop info
  // while selecting" requirement (start/end bar-beat/length/duration/BPM).
  // Start/end bar-beat is shown in the Advanced drawer's existing "Selected
  // range" line instead, per Creative Interface Doctrine — this always-
  // visible row stays limited to duration/bars/BPM.
  bpm?: number;
}

export function DurationDisplay({ durationSeconds, bars, bpm }: DurationDisplayProps) {
  const barsText = bars != null ? ` · ${bars.toFixed(bars % 1 === 0 ? 0 : 2)} bars` : "";
  const bpmText = bpm != null ? ` · ${bpm.toFixed(1)} BPM` : "";
  return (
    <div className="looper-duration-display" aria-live="polite">
      {durationSeconds.toFixed(1)} sec{barsText}{bpmText}
    </div>
  );
}

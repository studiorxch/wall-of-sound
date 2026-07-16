// 0715G_MUSIC_Sectional_Looper_Simplification_And_Stem_Ready_Export
// §Duration-First Display — combines the previously-separate Duration/Bars
// fields into one duration-first line ("24.6 sec · 8 bars").

interface DurationDisplayProps {
  durationSeconds: number;
  bars?: number;
}

export function DurationDisplay({ durationSeconds, bars }: DurationDisplayProps) {
  const barsText = bars != null ? ` · ${bars.toFixed(bars % 1 === 0 ? 0 : 2)} bars` : "";
  return (
    <div className="looper-duration-display" aria-live="polite">
      {durationSeconds.toFixed(1)} sec{barsText}
    </div>
  );
}

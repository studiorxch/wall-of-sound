// 0715G_MUSIC_Sectional_Looper_Simplification_And_Stem_Ready_Export
// §Duration-First Display — a compact duration-budget ceiling feeding
// autoRecommendation's Auto pick. `null` = No limit.

export type DurationTarget = 15 | 30 | 60 | null;

const TARGETS: (15 | 30 | 60)[] = [15, 30, 60];

interface DurationTargetControlProps {
  value: DurationTarget;
  onChange: (value: DurationTarget) => void;
}

export function DurationTargetControl({ value, onChange }: DurationTargetControlProps) {
  return (
    <div className="looper-duration-target-control">
      <span>Target</span>
      {TARGETS.map((seconds) => (
        <button key={seconds} className={value === seconds ? "active" : ""} onClick={() => onChange(seconds)}>
          {seconds} sec
        </button>
      ))}
      <button className={value === null ? "active" : ""} onClick={() => onChange(null)}>No limit</button>
    </div>
  );
}

import type { CurvePresetType } from "../data/flowCurveTypes";

type Props = {
  currentPreset: CurvePresetType;
  density: "low" | "medium" | "high";
  onPresetChange: (preset: CurvePresetType) => void;
  onDensityChange: (density: "low" | "medium" | "high") => void;
  onRegenerate: () => void; // kept for utility recalculate
};

const PRESETS: { value: CurvePresetType; label: string; desc: string }[] = [
  { value: "elegant_nested_arc", label: "Elegant Nested Arc", desc: "Macro DJ arc with nested local curves" },
  { value: "rolling_waves", label: "Rolling Waves", desc: "Repeated rise/release for stream listening" },
  { value: "mountain", label: "Mountain", desc: "Single build and cooldown" },
  { value: "valley_rebuild", label: "Valley Rebuild", desc: "Drop first, then rebuild" },
  { value: "ramp", label: "Ramp", desc: "Steady rise to close" },
];

export function CurvePresetPanel({ currentPreset, density, onPresetChange, onDensityChange, onRegenerate }: Props) {
  return (
    <div className="panel preset-panel">
      <h3>Curve Preset</h3>
      <div className="preset-list">
        {PRESETS.map((p) => (
          <button
            key={p.value}
            className={`preset-btn${currentPreset === p.value ? " active" : ""}`}
            onClick={() => onPresetChange(p.value)}
            title={p.desc}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="density-row">
        <span>Density:</span>
        {(["low", "medium", "high"] as const).map((d) => (
          <button
            key={d}
            className={density === d ? "active" : ""}
            onClick={() => onDensityChange(d)}
          >
            {d}
          </button>
        ))}
      </div>
      <button className="recalc-btn" onClick={onRegenerate} title="Force recalculate without changing curve">
        Recalculate
      </button>
    </div>
  );
}

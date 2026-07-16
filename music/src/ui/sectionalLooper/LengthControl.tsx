// 0715G_MUSIC_Sectional_Looper_Simplification_And_Stem_Ready_Export §Length
// Control — one compact control, never a new visible row per length.
// Unavailable lengths (per autoRecommendation's per-region evaluation) are
// disabled, not hidden — the user can still see what exists.

import type { LengthPreference } from "../../logic/loops/autoRecommendation";

const LENGTHS: (4 | 8 | 16 | 32 | 64)[] = [4, 8, 16, 32, 64];

interface LengthControlProps {
  value: LengthPreference;
  availableLengths: Record<4 | 8 | 16 | 32 | 64, boolean>;
  onChange: (value: LengthPreference) => void;
}

export function LengthControl({ value, availableLengths, onChange }: LengthControlProps) {
  return (
    <div className="looper-length-control">
      <span>Length</span>
      <button className={value === "auto" ? "active" : ""} onClick={() => onChange("auto")}>Auto</button>
      {LENGTHS.map((len) => (
        <button
          key={len}
          disabled={!availableLengths[len]}
          className={value === len ? "active" : ""}
          onClick={() => onChange(len)}
        >
          {len}
        </button>
      ))}
    </div>
  );
}

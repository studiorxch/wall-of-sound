// 0715C_MUSIC_Loop_Workspace_Editing_And_Revision_Completion §4, §5, §9 —
// completes the snap-mode toolbar with Subdivision and Zero Crossing
// alongside the existing Bar/Beat/Off. Pure presentational component: has
// no state of its own, never computes a snap itself.

import type { TimelineSnapMode, ZeroCrossingWarningCode } from "../../data/loopTypes";
import type { BarMultiple } from "../../logic/loops/barMultipleSnap";

const USER_FACING_MODES: TimelineSnapMode[] = ["bar", "beat", "subdivision", "zero_crossing", "off"];
const MODE_LABELS: Record<TimelineSnapMode, string> = {
  bar: "Bar", beat: "Beat", subdivision: "Subdivision", zero_crossing: "Zero Crossing", off: "Off", frame: "Frame",
};

const WARNING_TEXT: Record<ZeroCrossingWarningCode, string> = {
  ZERO_CROSSING_NOT_FOUND: "No usable zero crossing found — kept the raw boundary.",
  ZERO_CROSSING_FAR_FROM_BOUNDARY: "Nearest zero crossing is unusually far from the boundary.",
  ZERO_CROSSING_LOW_CONFIDENCE: "Zero crossing found, but with a nonzero discontinuity — not guaranteed click-free.",
};

export interface ZeroCrossingFeedback {
  offsetSeconds: number;
  warning?: ZeroCrossingWarningCode;
}

interface SnapModeToolbarProps {
  snapMode: TimelineSnapMode;
  onSnapModeChange: (mode: TimelineSnapMode) => void;
  subdivisionDivision: 4 | 8 | 16 | 32;
  onSubdivisionDivisionChange: (division: 4 | 8 | 16 | 32) => void;
  zeroCrossingEnabled: boolean;
  onZeroCrossingEnabledChange: (enabled: boolean) => void;
  zeroCrossingFeedback?: ZeroCrossingFeedback | null;
  // 0828_MUSIC_Looper_Loop_Library_Tagging — sibling to snapMode "bar",
  // exactly mirroring how subdivisionDivision pairs with "subdivision".
  barMultiple: BarMultiple;
  onBarMultipleChange: (multiple: BarMultiple) => void;
}

const BAR_MULTIPLES: BarMultiple[] = [1, 2, 4, 8, 16];

export function SnapModeToolbar({
  snapMode, onSnapModeChange, subdivisionDivision, onSubdivisionDivisionChange,
  zeroCrossingEnabled, onZeroCrossingEnabledChange, zeroCrossingFeedback,
  barMultiple, onBarMultipleChange,
}: SnapModeToolbarProps) {
  return (
    <div className="looper-snap-toolbar">
      <span>Snap:</span>
      {USER_FACING_MODES.map((m) => (
        <button
          key={m}
          className={snapMode === m ? "active" : ""}
          disabled={m === "zero_crossing" && !zeroCrossingEnabled}
          onClick={() => onSnapModeChange(m)}
        >
          {MODE_LABELS[m]}
        </button>
      ))}
      {snapMode === "bar" && (
        <select
          value={barMultiple}
          onChange={(e) => onBarMultipleChange(Number(e.target.value) as BarMultiple)}
          aria-label="Bar length"
        >
          {BAR_MULTIPLES.map((b) => <option key={b} value={b}>{b} Bar{b > 1 ? "s" : ""}</option>)}
        </select>
      )}
      {snapMode === "subdivision" && (
        <select
          value={subdivisionDivision}
          onChange={(e) => onSubdivisionDivisionChange(Number(e.target.value) as 4 | 8 | 16 | 32)}
          aria-label="Subdivision"
        >
          {[4, 8, 16, 32].map((d) => <option key={d} value={d}>1/{d}</option>)}
        </select>
      )}
      <label className="looper-backdrop-toggle">
        <input type="checkbox" checked={zeroCrossingEnabled} onChange={(e) => onZeroCrossingEnabledChange(e.target.checked)} />
        Zero-crossing snap enabled
      </label>
      {snapMode === "zero_crossing" && zeroCrossingFeedback && (
        <span className="looper-snap-feedback" aria-live="polite">
          Snapped to zero crossing · Offset: {(zeroCrossingFeedback.offsetSeconds * 1000).toFixed(1)} ms
          {zeroCrossingFeedback.warning && ` · ${WARNING_TEXT[zeroCrossingFeedback.warning]}`}
        </span>
      )}
    </div>
  );
}

// 0715A — grid backdrop + structural section overlay, rendered as an
// absolutely-positioned SVG layer BEHIND TrackWaveformOverview's own SVG
// (§5, §10, §20). Uses the identical x = (seconds/duration) * width
// formula TrackWaveformOverview itself uses, so the two stay pixel-aligned
// without needing a shared JS object across the component boundary (§19) —
// this mirrors 0714T's `createTimelineTransform`, whose frame-based
// mapping reduces to the exact same linear formula once converted through
// frameToSeconds/sampleRate. Purely decorative: pointer-events: none (§15).

import type { GridBackdropLevels, GroupingEmphasis } from "../../logic/loops/gridBackdrop";
import { bandsForGroupingEmphasis } from "../../logic/loops/gridBackdrop";
import type { StructuralSectionBand } from "../../data/loopTypes";

const VIEW_W = 1000;
const VIEW_H = 120;

interface Props {
  durationSeconds: number;
  sampleRate: number;
  backdropLevels: GridBackdropLevels | null;
  groupingEmphasis: GroupingEmphasis;
  structuralSections: StructuralSectionBand[];
  showBackdrop: boolean;
  showStructure: boolean;
}

export function GridBackdropLayer({
  durationSeconds, sampleRate, backdropLevels, groupingEmphasis, structuralSections, showBackdrop, showStructure,
}: Props) {
  const duration = Math.max(durationSeconds, 0.001);
  const xAt = (frame: number) => ((frame / sampleRate) / duration) * VIEW_W;

  const emphasisBands = backdropLevels ? bandsForGroupingEmphasis(backdropLevels, groupingEmphasis) : [];
  const group16Bands = backdropLevels?.group16 ?? [];
  const barLines = backdropLevels?.bar ?? [];

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="none"
      className="looper-grid-backdrop-svg"
      style={{ pointerEvents: "none" }}
      aria-hidden="true"
    >
      {/* §10 — structural section bands, lowest in the contrast hierarchy. */}
      {showStructure && structuralSections.map((s) => {
        const x = xAt(s.startFrame);
        const w = Math.max(0, xAt(s.endFrame) - x);
        return (
          <g key={s.id}>
            <rect x={x} y={0} width={w} height={VIEW_H} className={`looper-structural-band is-${s.label}`} />
            {w > 30 && (
              <text x={x + 3} y={10} className={`looper-structural-label${s.confidence === "provisional" ? " is-provisional" : ""}`}>
                {s.displayLabel.toUpperCase()}{s.confidence === "provisional" ? " · provisional" : ""}
              </text>
            )}
          </g>
        );
      })}

      {/* §8 — alternating grouping bands (default 8-bar). */}
      {showBackdrop && emphasisBands.map((b) => {
        const x = xAt(b.startFrame);
        const w = Math.max(0, xAt(b.endFrame) - x);
        return (
          <rect
            key={b.id} x={x} y={0} width={w} height={VIEW_H}
            className={`looper-grouping-band${b.alternateIndex ? " is-alt" : ""}`}
          />
        );
      })}

      {/* §9 — 16-bar stronger boundaries. */}
      {showBackdrop && group16Bands.map((b) => (
        <line key={b.id} x1={xAt(b.startFrame)} x2={xAt(b.startFrame)} y1={0} y2={VIEW_H} className="looper-grid-line-16" />
      ))}

      {/* §5 — every-bar thin grid line, full height through the waveform. */}
      {showBackdrop && barLines.map((b) => (
        <line key={b.id} x1={xAt(b.startFrame)} x2={xAt(b.startFrame)} y1={0} y2={VIEW_H} className="looper-grid-line-bar" />
      ))}
    </svg>
  );
}

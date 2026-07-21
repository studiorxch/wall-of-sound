// 0715A — grid backdrop + structural section overlay, rendered as an
// absolutely-positioned SVG layer BEHIND TrackWaveformOverview's own SVG
// (§5, §10, §20). Uses the identical x = (seconds/duration) * width
// formula TrackWaveformOverview itself uses, so the two stay pixel-aligned
// without needing a shared JS object across the component boundary (§19) —
// this mirrors 0714T's `createTimelineTransform`, whose frame-based
// mapping reduces to the exact same linear formula once converted through
// frameToSeconds/sampleRate. Purely decorative: pointer-events: none (§15).
//
// 0716A_MUSIC_Direct_Manipulation_Looper_And_Playhead (corrections) —
// view-window aware for zoom/pan, and bar/beat lines are progressively
// revealed only at zoom levels where they're readable: bar lines only once
// bars are ≥ MIN_LINE_SPACING_VB viewBox units apart on screen, beat lines
// (new, via optional beatFrames) only once beats are. At full-track zoom on
// a long source neither shows — exactly the "progressively reveal
// bars/beats only at suitable zoom levels" correction.

import type { GridBackdropLevels, GroupingEmphasis } from "../../logic/loops/gridBackdrop";
import { bandsForGroupingEmphasis } from "../../logic/loops/gridBackdrop";
import type { StructuralSectionBand } from "../../data/loopTypes";

const VIEW_W = 1000;
const VIEW_H = 120;
const MIN_LINE_SPACING_VB = 6;

interface Props {
  durationSeconds: number;
  sampleRate: number;
  backdropLevels: GridBackdropLevels | null;
  groupingEmphasis: GroupingEmphasis;
  structuralSections: StructuralSectionBand[];
  showBackdrop: boolean;
  showStructure: boolean;
  viewStartSeconds?: number;
  viewEndSeconds?: number;
  beatFrames?: number[];
}

export function GridBackdropLayer({
  durationSeconds, sampleRate, backdropLevels, groupingEmphasis, structuralSections, showBackdrop, showStructure,
  viewStartSeconds, viewEndSeconds, beatFrames,
}: Props) {
  const duration = Math.max(durationSeconds, 0.001);
  const viewStart = Math.max(0, viewStartSeconds ?? 0);
  const viewEnd = Math.min(duration, viewEndSeconds ?? duration);
  const windowDur = Math.max(viewEnd - viewStart, 0.001);
  const xAt = (frame: number) => (((frame / sampleRate) - viewStart) / windowDur) * VIEW_W;

  const emphasisBands = backdropLevels ? bandsForGroupingEmphasis(backdropLevels, groupingEmphasis) : [];
  const group16Bands = backdropLevels?.group16 ?? [];
  const barLines = backdropLevels?.bar ?? [];

  // Progressive density gates: spacing measured in on-screen viewBox units
  // at the CURRENT zoom (uniform grids, so adjacent-pair spacing suffices).
  const barSpacingVb = barLines.length >= 2
    ? xAt(barLines[1].startFrame) - xAt(barLines[0].startFrame) : Infinity;
  const showBarLines = showBackdrop && barSpacingVb >= MIN_LINE_SPACING_VB;
  const beatSpacingVb = beatFrames && beatFrames.length >= 2
    ? xAt(beatFrames[1]) - xAt(beatFrames[0]) : 0;
  const showBeatLines = showBackdrop && beatSpacingVb >= MIN_LINE_SPACING_VB;

  const inView = (x: number) => x >= -1 && x <= VIEW_W + 1;

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
            {w > 30 && x < VIEW_W && x + w > 0 && (
              <text x={Math.max(x, 0) + 3} y={10} className={`looper-structural-label${s.confidence === "provisional" ? " is-provisional" : ""}`}>
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
      {showBackdrop && group16Bands.map((b) => {
        const x = xAt(b.startFrame);
        return inView(x)
          ? <line key={b.id} x1={x} x2={x} y1={0} y2={VIEW_H} className="looper-grid-line-16" />
          : null;
      })}

      {/* 0716A — beat lines, revealed only when readably spaced. */}
      {showBeatLines && beatFrames!.map((f, i) => {
        const x = xAt(f);
        return inView(x)
          ? <line key={`beat-${i}`} x1={x} x2={x} y1={0} y2={VIEW_H} className="looper-grid-line-beat" />
          : null;
      })}

      {/* §5 — every-bar thin grid line, revealed only when readably spaced. */}
      {showBarLines && barLines.map((b) => {
        const x = xAt(b.startFrame);
        return inView(x)
          ? <line key={b.id} x1={x} x2={x} y1={0} y2={VIEW_H} className="looper-grid-line-bar" />
          : null;
      })}
    </svg>
  );
}

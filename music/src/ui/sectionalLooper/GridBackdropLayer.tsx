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
//
// Ableton-legible ruler pass — bar/group4/group8/group16 hierarchy now
// renders SIMULTANEOUSLY (never a single switchable "Grouping" level):
// bar ticks stay faintest, group4/group8/group16 boundary lines get
// progressively stronger weight, and `groupingEmphasis` only decides which
// one level ALSO carries the alternating background wash + an extra
// emphasis boost — it never hides the other levels. Subdivision lines are a
// new, finest tier, spacing-gated like bar/beat already were.

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
  subdivisionFrames?: number[];
}

export function GridBackdropLayer({
  durationSeconds, sampleRate, backdropLevels, groupingEmphasis, structuralSections, showBackdrop, showStructure,
  viewStartSeconds, viewEndSeconds, beatFrames, subdivisionFrames,
}: Props) {
  const duration = Math.max(durationSeconds, 0.001);
  const viewStart = Math.max(0, viewStartSeconds ?? 0);
  const viewEnd = Math.min(duration, viewEndSeconds ?? duration);
  const windowDur = Math.max(viewEnd - viewStart, 0.001);
  const xAt = (frame: number) => (((frame / sampleRate) - viewStart) / windowDur) * VIEW_W;

  const emphasisBands = backdropLevels ? bandsForGroupingEmphasis(backdropLevels, groupingEmphasis) : [];
  const group4Lines = backdropLevels?.group4 ?? [];
  const group8Lines = backdropLevels?.group8 ?? [];
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
  const subSpacingVb = subdivisionFrames && subdivisionFrames.length >= 2
    ? xAt(subdivisionFrames[1]) - xAt(subdivisionFrames[0]) : 0;
  const showSubdivisionLines = showBackdrop && subSpacingVb >= MIN_LINE_SPACING_VB;
  const group4SpacingVb = group4Lines.length >= 2
    ? xAt(group4Lines[1].startFrame) - xAt(group4Lines[0].startFrame) : Infinity;
  const showGroup4Lines = showBackdrop && group4SpacingVb >= MIN_LINE_SPACING_VB;
  const group8SpacingVb = group8Lines.length >= 2
    ? xAt(group8Lines[1].startFrame) - xAt(group8Lines[0].startFrame) : Infinity;
  const showGroup8Lines = showBackdrop && group8SpacingVb >= MIN_LINE_SPACING_VB;

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

      {/* §8 — alternating background wash for whichever level the Grouping
          control currently emphasizes. This is an ADDITIONAL accent, not
          the only visible level — group4/group8/group16 boundary lines
          below render regardless of this selection. */}
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

      {/* Always-on hierarchy (Ableton-legible pass): group4 → group8 →
          group16, progressively stronger. Whichever tier matches the
          Grouping control's current selection gets an extra `is-emphasis`
          boost — it never hides the other two tiers. */}
      {showGroup4Lines && group4Lines.map((b) => {
        const x = xAt(b.startFrame);
        return inView(x)
          ? <line key={b.id} x1={x} x2={x} y1={0} y2={VIEW_H} className={`looper-grid-line-group4${groupingEmphasis === 4 ? " is-emphasis" : ""}`} />
          : null;
      })}
      {showGroup8Lines && group8Lines.map((b) => {
        const x = xAt(b.startFrame);
        return inView(x)
          ? <line key={b.id} x1={x} x2={x} y1={0} y2={VIEW_H} className={`looper-grid-line-group8${groupingEmphasis === 8 ? " is-emphasis" : ""}`} />
          : null;
      })}
      {showBackdrop && group16Bands.map((b) => {
        const x = xAt(b.startFrame);
        return inView(x)
          ? <line key={b.id} x1={x} x2={x} y1={0} y2={VIEW_H} className={`looper-grid-line-16${groupingEmphasis === 16 ? " is-emphasis" : ""}`} />
          : null;
      })}

      {/* Finest tier — 16th-note subdivisions, spacing-gated like bar/beat. */}
      {showSubdivisionLines && subdivisionFrames!.map((f, i) => {
        const x = xAt(f);
        return inView(x)
          ? <line key={`sub-${i}`} x1={x} x2={x} y1={0} y2={VIEW_H} className="looper-grid-line-subdivision" />
          : null;
      })}

      {/* 0716A — beat lines, revealed only when readably spaced. */}
      {showBeatLines && beatFrames!.map((f, i) => {
        const x = xAt(f);
        return inView(x)
          ? <line key={`beat-${i}`} x1={x} x2={x} y1={0} y2={VIEW_H} className="looper-grid-line-beat" />
          : null;
      })}

      {/* §5 — every-bar thin grid line, faintest of the always-on tiers,
          revealed only when readably spaced. */}
      {showBarLines && barLines.map((b) => {
        const x = xAt(b.startFrame);
        return inView(x)
          ? <line key={b.id} x1={x} x2={x} y1={0} y2={VIEW_H} className="looper-grid-line-bar" />
          : null;
      })}
    </svg>
  );
}

// Glyph Notes — Diagnostics panel
// (docs/glyph-audio/0804_GLYPH_NOTES_Full_Canvas_Pulse_Truth_Drum_Layer_Spec_v0.1.0.md §24;
// bar/drum invariants extended by 0804D,
// docs/glyph-audio/0804_GLYPH_NOTES_Silent_Bar_Spacing_Event_Dot_Reassignment_Spec_v0.1.0.md;
// event/laser invariants extended by 0804E,
// docs/glyph-audio/0804_GLYPH_NOTES_Event_Vocabulary_Laser_Layer_Spec_v0.1.0.md §14).
// Required success state: Expected = Generated = Placed = Visible pulses,
// bar boundaries = inserted bar gaps, drum events = visible drum events,
// accepted event symbols = visible event symbols, laser coverage = 100%,
// laser dropped segments = 0, coverage 100%, overflowBottom 0 — shown
// plainly so a real gap is never silently hidden behind a vague "looks
// fine" summary. overflowRight is shown for visibility but is NOT a
// required-zero invariant (the auto-fit algorithm fails closed on
// visibility, not placement — see 0804C/0804D completion reports for the
// disclosed reasoning).

import type { GlyphAudibleEvent } from "../../data/glyphEventVocabularyTypes";
import type { LaserLayerResult, LaserLayoutResult } from "../../data/glyphLaserLayerTypes";

type Props = {
  durationSeconds: number;
  confirmedBpm: number;
  expectedPulses: number;
  detectedAnchors: number;
  synthesizedPulses: number;
  generatedArches: number;
  connectedRuns: number;
  placedArches: number;
  visibleArches: number;
  coveragePercent: number;
  rows: number;
  canvasShape: string;
  overflowRight: number;
  overflowBottom: number;
  barBoundaryCount: number;
  insertedBarGapCount: number;
  drumSource: string | null;
  drumEventCount: number;
  visibleDrumEventCount: number;
  // 0804E — compound objects rather than another dozen flat props; the
  // component derives its own counts from these, same source data
  // GlyphWorkspace.tsx already computed for rendering.
  audibleEvents: GlyphAudibleEvent[];
  visibleEventMarkCount: number;
  laserResult: LaserLayerResult | null;
  laserLayout: LaserLayoutResult | null;
};

function fmtTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function GlyphDiagnostics(props: Props) {
  const countsMatch = props.expectedPulses === props.generatedArches
    && props.generatedArches === props.placedArches
    && props.placedArches === props.visibleArches;
  const gapsMatch = props.barBoundaryCount === props.insertedBarGapCount;
  const drumsVisible = props.drumEventCount === props.visibleDrumEventCount;
  const coverageComplete = props.coveragePercent >= 99.5;
  const bottomFits = props.overflowBottom === 0;

  const lightTransientCount = props.audibleEvents.filter((e) => e.family === "lightTransient").length;
  const generalDrumEventCount = props.audibleEvents.filter((e) => e.family === "drum").length;
  const clapLikeCount = props.audibleEvents.filter((e) => e.family === "clap").length;
  const accentEventCount = props.audibleEvents.filter((e) => e.family === "accent").length;
  const unclassifiedEventCount = props.audibleEvents.filter((e) => e.family === "unknown").length;
  const acceptedEventSymbols = props.audibleEvents.length;
  const droppedEventMarkCount = Math.max(0, acceptedEventSymbols - props.visibleEventMarkCount);
  const eventSymbolsMatch = props.audibleEvents.length === 0 || acceptedEventSymbols === props.visibleEventMarkCount;

  const laserCoverageComplete = props.laserResult == null || props.laserResult.coveragePercent >= 99.5;
  const laserNoDrops = props.laserLayout == null || props.laserLayout.droppedSegmentCount === 0;

  const allGood = countsMatch && gapsMatch && drumsVisible && coverageComplete && bottomFits
    && eventSymbolsMatch && laserCoverageComplete && laserNoDrops;

  return (
    <div style={{ fontSize: 11, opacity: 0.7, display: "flex", flexDirection: "column", gap: 2 }}>
      <div style={{ color: allGood ? "#4ade80" : "#f59e0b" }}>
        {allGood ? "✓ " : "! "}
        Coverage: {props.coveragePercent.toFixed(1)}% · Overflow right: {props.overflowRight.toFixed(0)} · Overflow bottom: {props.overflowBottom.toFixed(0)} ·{" "}
        Expected {props.expectedPulses} = Generated {props.generatedArches} = Placed {props.placedArches} = Visible {props.visibleArches}
      </div>
      <div>
        Duration {fmtTime(props.durationSeconds)} · BPM {props.confirmedBpm.toFixed(1)} · Detected anchors {props.detectedAnchors} ·{" "}
        Synthesized {props.synthesizedPulses} · Runs {props.connectedRuns} · Rows {props.rows} · Canvas {props.canvasShape}
      </div>
      <div>
        Bar boundaries {props.barBoundaryCount} = Inserted gaps {props.insertedBarGapCount}
      </div>
      <div>
        Drums: {props.drumSource ?? "Not analyzed"}{props.drumSource ? ` · ${props.drumEventCount} events (${props.visibleDrumEventCount} visible)` : ""}
      </div>
      {props.audibleEvents.length > 0 && (
        <div>
          Events: Raw {props.drumEventCount} · Light {lightTransientCount} · Drum {generalDrumEventCount} ·{" "}
          Clap-like {clapLikeCount} · Accent {accentEventCount} · Unclassified {unclassifiedEventCount} ·{" "}
          Visible marks {props.visibleEventMarkCount}{droppedEventMarkCount > 0 ? ` (${droppedEventMarkCount} dropped)` : ""}
        </div>
      )}
      <div>
        Laser: {props.laserResult ? props.laserResult.source : "Not analyzed"}
        {props.laserResult && (
          <>
            {" "}· Frames {props.laserResult.frames.length} analyzed ({props.laserLayout?.framesAboveThreshold ?? 0} visible) ·{" "}
            Coverage {props.laserResult.coveragePercent.toFixed(1)}% · Threshold {(props.laserLayout?.activityThreshold ?? 0).toFixed(2)} ·{" "}
            Segments {props.laserLayout?.placedSegmentCount ?? 0} placed / {props.laserLayout?.visibleSegmentCount ?? 0} visible / {props.laserLayout?.droppedSegmentCount ?? 0} dropped
          </>
        )}
      </div>
    </div>
  );
}

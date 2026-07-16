// 0715A — structural Intro/Body/Outro overlay derivation (§10-§13). A pure
// DERIVED view model; never replaces or edits canonical TrackSegment
// records (§11's own explicit requirement). Priority order per §12:
//   1. explicit canonical segment labels (segments already labeled
//      intro/outro by the user or a detector)
//   2. >=3 canonical segments exist — first/last inferred as intro/outro
//   3. trusted playback-bounds evidence
//   4. heuristic fallback (always explicitly provisional, never presented
//      as detected fact — §13)

import type { StructuralSectionBand, TrackSegment } from "../../data/loopTypes";

function genId(label: string): string {
  return `structband_${label}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function band(
  label: StructuralSectionBand["label"], displayLabel: string, startFrame: number, endFrame: number,
  confidence: StructuralSectionBand["confidence"], source: StructuralSectionBand["source"],
): StructuralSectionBand {
  return { id: genId(label), startFrame, endFrame, label, displayLabel, confidence, source };
}

const HEURISTIC_INTRO_FRACTION = 0.10;
const HEURISTIC_OUTRO_FRACTION = 0.15;

export function deriveStructuralSections(
  segments: TrackSegment[],
  trustedBoundsStartFrame: number | undefined,
  trustedBoundsEndFrame: number | undefined,
  trackStartFrame: number,
  trackEndFrame: number,
): StructuralSectionBand[] {
  // §12 priority 1/2 — >=3 canonical segments: first is intro, last is
  // outro, everything between is body. An explicit label on segments[0]
  // ("intro") or segments[last] ("outro") is honored directly; otherwise
  // inferred positionally, still confidence-gated by segment source.
  if (segments.length >= 3) {
    const ordered = [...segments].sort((a, b) => a.order - b.order);
    const first = ordered[0];
    const last = ordered[ordered.length - 1];
    const highConfidence = first.source === "detected" || first.source === "manual";
    return [
      band("intro", "Intro", first.startFrame, first.endFrame, highConfidence ? "high" : "provisional", "canonical_segments"),
      band("body", "Body", first.endFrame, last.startFrame, highConfidence ? "high" : "provisional", "canonical_segments"),
      band("outro", "Outro", last.startFrame, last.endFrame, highConfidence ? "high" : "provisional", "canonical_segments"),
    ];
  }

  // §12 priority 3 — trusted playback-bounds evidence (audible/preferred
  // start/end already computed by the untouched playback-bounds detector).
  if (
    trustedBoundsStartFrame != null && trustedBoundsEndFrame != null
    && trustedBoundsStartFrame > trackStartFrame && trustedBoundsEndFrame < trackEndFrame
  ) {
    return [
      band("intro", "Intro", trackStartFrame, trustedBoundsStartFrame, "high", "playback_bounds"),
      band("body", "Body", trustedBoundsStartFrame, trustedBoundsEndFrame, "high", "playback_bounds"),
      band("outro", "Outro", trustedBoundsEndFrame, trackEndFrame, "high", "playback_bounds"),
    ];
  }

  // §12 priority 5 / §13 — heuristic fallback, ALWAYS explicitly
  // provisional, never presented as detected fact.
  const total = trackEndFrame - trackStartFrame;
  if (total <= 0) return [];
  const introEnd = trackStartFrame + Math.round(total * HEURISTIC_INTRO_FRACTION);
  const outroStart = trackEndFrame - Math.round(total * HEURISTIC_OUTRO_FRACTION);
  if (outroStart <= introEnd) {
    // Track too short for a meaningful 3-way split — still label
    // honestly rather than showing nothing (§13).
    return [band("body", "Body", trackStartFrame, trackEndFrame, "provisional", "heuristic")];
  }
  return [
    band("intro", "Intro", trackStartFrame, introEnd, "provisional", "heuristic"),
    band("body", "Body", introEnd, outroStart, "provisional", "heuristic"),
    band("outro", "Outro", outroStart, trackEndFrame, "provisional", "heuristic"),
  ];
}

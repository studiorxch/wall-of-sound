// 0715G_MUSIC_Sectional_Looper_Simplification_And_Stem_Ready_Export §Region
// Eligibility — pure, structural-label-based eligibility only. The finer
// distinctions the spec lists (stable Break vs. Transition, intro-with-a-
// build vs. stable intro) cannot be expressed by any existing detector
// output (confirmed by audit: StructuralSectionLabel is only
// "intro"|"body"|"outro"|"section") — building that would be new audio-
// analysis research, out of this build's "simplify the UI" scope. Intro/
// Outro remain manually selectable; they are just not the automatic default
// when a more stable body/section region exists.

import type { StructuralSectionBand } from "../../data/loopTypes";

export interface RegionEligibility {
  bandId: string;
  eligible: boolean;
}

export function evaluateRegionEligibility(bands: StructuralSectionBand[]): RegionEligibility[] {
  return bands.map((band) => ({
    bandId: band.id,
    eligible: band.label === "body" || band.label === "section",
  }));
}

// The default active region on first load: the first eligible (body/
// section) band, else the first band of any kind, else undefined when
// there are no bands at all.
export function recommendDefaultBand(bands: StructuralSectionBand[]): StructuralSectionBand | undefined {
  const eligible = evaluateRegionEligibility(bands);
  const firstEligible = bands.find((b) => eligible.find((e) => e.bandId === b.id)?.eligible);
  return firstEligible ?? bands[0];
}

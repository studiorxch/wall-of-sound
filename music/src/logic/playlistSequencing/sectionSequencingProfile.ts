// Section-aware sequencing configuration (0713_MUSIC_Playlist_BPM_Key_
// Sequencing §11) — "Section behavior must be configuration, not scattered
// conditionals." One table, one classifier; nothing else in this feature
// branches on section identity directly.

export type SectionSequencingRole = "intro" | "development" | "peak" | "release" | "outro";

export interface SectionSequencingProfile {
  role: SectionSequencingRole;
  // Multiplies the base BPM/key weight share for this section (§11's per-
  // section pressure) before transitionScore.ts renormalizes around a fixed
  // energy share — see that module for why energy authority survives this.
  bpmWeightMultiplier: number;
  keyWeightMultiplier: number;
  // Softens (or tightens) the effective BPM delta used for scoring, so e.g.
  // Peak can "allow stronger BPM expansion" without a separate code path.
  bpmToleranceMultiplier: number;
  allowHarmonicTension: boolean;
  description: string;
}

const PROFILES: Record<SectionSequencingRole, SectionSequencingProfile> = {
  intro: {
    role: "intro",
    bpmWeightMultiplier: 1.1,
    keyWeightMultiplier: 1.0,
    bpmToleranceMultiplier: 1.0,
    allowHarmonicTension: false,
    description: "favor smooth BPM continuity; tolerate lower confidence; avoid abrupt high-energy tempo shocks",
  },
  development: {
    role: "development",
    bpmWeightMultiplier: 1.15,
    keyWeightMultiplier: 1.05,
    bpmToleranceMultiplier: 1.0,
    allowHarmonicTension: false,
    description: "strengthen BPM continuity; allow gradual expansion; favor smooth key movement",
  },
  peak: {
    role: "peak",
    bpmWeightMultiplier: 0.8,
    keyWeightMultiplier: 0.75,
    bpmToleranceMultiplier: 1.4,
    allowHarmonicTension: true,
    description: "preserve energy authority; allow stronger BPM expansion and intentional harmonic tension; avoid chaotic alternating tempo jumps",
  },
  release: {
    role: "release",
    bpmWeightMultiplier: 1.1,
    keyWeightMultiplier: 1.1,
    bpmToleranceMultiplier: 0.85,
    allowHarmonicTension: false,
    description: "favor controlled tempo reduction or stabilization; avoid abrupt returns to extreme BPM; favor compatible or resolving key movement",
  },
  outro: {
    role: "outro",
    bpmWeightMultiplier: 1.0,
    keyWeightMultiplier: 1.15,
    bpmToleranceMultiplier: 0.8,
    allowHarmonicTension: false,
    description: "prefer stable or declining tempo character; avoid disruptive final transitions; key continuity should support resolution where trusted",
  },
};

export function getSectionSequencingProfile(role: SectionSequencingRole): SectionSequencingProfile {
  return PROFILES[role];
}

// Classifies a section's role from its position among the FULL section list —
// sectionId "intro"/"outro" are authoritative when present (they always sit
// at the ends); everything else is bucketed by temporal midpoint, matching
// the same opening/development/peak/release percentile convention already
// used by the Playlist Analyzer's Sequence Arc (playlistAnalyzer/arc.ts), so
// the two features describe playlist structure the same way.
export function classifySectionSequencingRole(sectionId: string, sectionIndex: number, totalSections: number): SectionSequencingRole {
  if (sectionId === "intro") return "intro";
  if (sectionId === "outro") return "outro";
  if (totalSections <= 1) return "development";
  const midpoint = (sectionIndex + 0.5) / totalSections;
  if (midpoint < 0.4) return "development";
  if (midpoint < 0.6) return "peak";
  return "release";
}

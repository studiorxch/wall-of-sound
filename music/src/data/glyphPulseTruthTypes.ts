// Glyph Notes — Pulse Truth (docs/glyph-audio/0804_GLYPH_NOTES_Full_Canvas_Pulse_Truth_Drum_Layer_Spec_v0.1.0.md
// §6-8). The full track duration determines the pulse-grid extent —
// detected beats only ever refine phase/timing, never whether a pulse
// exists (§6.1). This directly replaces the prior build's dependency on an
// already-complete `Track.beatMap.beatTimesSeconds` (which turned out to be
// empty on every real library track) with a grid derived from confirmed
// BPM + duration alone.

export type PulseSource = "detected" | "aligned" | "synthesized";

export type PulseTruthUnit = {
  id: string;
  index: number;
  timeSeconds: number;
  durationSeconds: number;
  barIndex: number;
  beatInBar: number;
  sectionId: string | null;
  phraseId: string | null;
  source: PulseSource;
  sourceBeatId?: string;
  energy: number;
  attack: number;
  confidence?: number;
};

// §25 — Pulse Warnings.
export type PulseTruthWarning =
  | "unconfirmedBpm"
  | "noDetectedAnchors"
  | "weakPhaseAlignment"
  | "synthesizedPulseMajority"
  | "pulseCountMismatch"
  | "coverageBelow100";

export type PulseTruthResult = {
  durationSeconds: number;
  confirmedBpm: number;
  secondsPerPulse: number;
  phaseOffsetSeconds: number;
  expectedPulseCount: number;
  detectedAnchorCount: number;
  alignedPulseCount: number;
  synthesizedPulseCount: number;
  coverageStartSeconds: number;
  coverageEndSeconds: number;
  coveragePercent: number;
  pulses: PulseTruthUnit[];
  warnings: PulseTruthWarning[];
};

// §6.4 — Pulse truth requires one of: trusted manual BPM, an accepted BPM
// candidate, an existing confirmed beat grid, or explicit user
// confirmation. This is a UI/orchestration-layer concern (GlyphWorkspace.tsx
// resolves which tier applies and surfaces confirmation); the type is
// defined here since it travels with the resolved BPM into pulseTruth.ts.
export type ConfirmedBpmSource = "trustedManual" | "trustedBeatMap" | "userConfirmed";

export type ConfirmedBpmResult = {
  bpm: number;
  source: ConfirmedBpmSource;
};

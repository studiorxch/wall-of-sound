// Glyph Notes — Drum Layer Foundation (docs/glyph-audio/0804_GLYPH_NOTES_Full_Canvas_Pulse_Truth_Drum_Layer_Spec_v0.1.0.md
// §14-17). Separate from the pulse manuscript entirely — drum events keep
// their real, off-grid timing and are never quantized onto pulse
// positions (§18).

export type DrumEventSource = "drumStem" | "separatedDrumStem" | "fullMix";

export type DrumEvent = {
  id: string;
  timeSeconds: number;
  durationSeconds?: number;
  strength: number;
  confidence: number;
  source: DrumEventSource;
  sourceTrackId: string;
  sourceStemId?: string;
  nearestPulseId?: string;
  offsetFromPulseSeconds?: number;
  classification?: "kick" | "snare" | "hat" | "percussion" | "unknown";
};

// §25 — Drum Warnings.
export type DrumLayerWarning =
  | "noDrumStem"
  | "stemAnalysisFailed"
  | "fullMixFallbackActive"
  | "onsetDensityUnusuallyHigh"
  | "onsetDetectionZeroEvents";

export type DrumLayerResult = {
  source: DrumEventSource;
  sourceTrackId: string;
  sourceStemId?: string;
  eventCount: number;
  events: DrumEvent[];
  analyzedAt: string;
  analyzerVersion: string;
  warnings: DrumLayerWarning[];
};

// Deliberately NOT the literal DOM `AudioBuffer` type — every other Glyph
// module already works with a decoded {mono, sampleRate} pair
// (audioAnalysisInput.ts's decodeAudioAnalysisInput, reused unchanged since
// the first Glyph build), and this shape is trivially testable under
// Vitest's node environment without a real AudioBuffer. A real AudioBuffer
// is never adapted into this shape by anything other than reading its own
// getChannelData(0) once, so nothing about real decode behavior changes.
export type MonoAudioInput = {
  mono: Float32Array;
  sampleRate: number;
};

export type DetectDrumEventsInput = {
  audio: MonoAudioInput;
  source: DrumEventSource;
  sourceTrackId: string;
  sourceStemId?: string;
  sensitivity?: number; // 0-1, default 0.5
  minIntervalSeconds?: number; // default 0.08
  strengthFloor?: number; // 0-1, default 0.15
  analyzedAt: string; // caller-supplied for determinism (never Date.now() internally)
};

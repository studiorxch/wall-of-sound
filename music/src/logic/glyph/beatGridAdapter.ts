// Glyph Audio — beat grid adapter. Reuses MUSIC's existing beat detector
// output unchanged (Track.beatMap.beatTimesSeconds — already-detected,
// evenly-spaced beat timestamps; see beatMapTypes.ts) and adds exactly one
// new thing: direct per-beat RMS energy extraction from the already-decoded
// audio (approved decision 1/2, 14_GLYPH_AUDIO_Approved_Decisions.md).
// attackSharpness/onsetDensity/sustain/pitchMovement/spectralBrightness and
// any section-boundary sophistication are explicitly deferred (decision 3)
// — beatUnitDerivation.ts fills those with documented neutral values, never
// a fabricated measurement.
//
// Per-beat energy window (approved decision, this build's final
// instruction):
//   - start at the beat timestamp;
//   - end at the earlier of the next beat timestamp or
//     (start + 0.75 x the current beat's duration);
//   - for the final beat, use 0.75 x the estimated beat duration.
// Today's beat map is a fixed-period arithmetic extrapolation from one
// detected BPM (beatMap/tempoStability.ts's own documented limitation), so
// "current beat duration" (interval to the next beat) and "estimated beat
// duration" (60/bpm) are numerically identical for every beat in practice —
// the min() below is written to hold correctly even if that ever changes,
// not because it is expected to branch today.

import type { Track } from "../../data/trackTypes";

export type BeatWindow = { start: number; end: number };

export type BeatGridDraft = {
  beatTimesSeconds: number[];
  beatWindows: BeatWindow[];
  rawEnergies: number[];
  energies: number[]; // normalized 0-1, percentile-protected
  bpm: number | null;
  beatsPerBar: number;
  beatsPerBarConfirmed: boolean;
  durationSeconds: number;
  confidence: number;
};

export const DEFAULT_BEATS_PER_BAR = 4;

export function computeBeatWindows(
  beatTimesSeconds: number[],
  bpm: number | null,
  durationSeconds: number,
): BeatWindow[] {
  if (beatTimesSeconds.length === 0) return [];

  const estimatedPeriodSeconds =
    bpm && bpm > 0
      ? 60 / bpm
      : beatTimesSeconds.length > 1
        ? beatTimesSeconds[beatTimesSeconds.length - 1] - beatTimesSeconds[beatTimesSeconds.length - 2]
        : 0.5;

  return beatTimesSeconds.map((start, i) => {
    const isLast = i === beatTimesSeconds.length - 1;
    const nextBeat = isLast ? null : beatTimesSeconds[i + 1];
    const currentBeatDuration = nextBeat != null ? nextBeat - start : estimatedPeriodSeconds;
    const proposedEnd = start + 0.75 * currentBeatDuration;
    const end = nextBeat != null ? Math.min(nextBeat, proposedEnd) : proposedEnd;
    return { start, end: Math.min(Math.max(end, start), durationSeconds) };
  });
}

export function computeBeatEnergyFromChannelData(
  channelData: Float32Array,
  sampleRate: number,
  windows: BeatWindow[],
): number[] {
  return windows.map(({ start, end }) => {
    const startSample = Math.max(0, Math.floor(start * sampleRate));
    const endSample = Math.min(channelData.length, Math.ceil(end * sampleRate));
    if (endSample <= startSample) return 0;

    let sumSquares = 0;
    for (let i = startSample; i < endSample; i++) {
      sumSquares += channelData[i] * channelData[i];
    }
    return Math.sqrt(sumSquares / (endSample - startSample));
  });
}

// Track-relative normalization with percentile protection (approved
// decision, this build's final instruction): clamping to the 5th-95th
// percentile range before scaling to 0-1 means one isolated loud peak
// cannot compress the rest of the beats toward the bottom of the range —
// it simply clips to 1.0 instead of redefining the top of the scale.
export function normalizeEnergyTrackRelative(rawValues: number[]): number[] {
  if (rawValues.length === 0) return [];

  const sorted = [...rawValues].sort((a, b) => a - b);
  const percentile = (p: number) => {
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
    return sorted[idx];
  };

  const lo = percentile(0.05);
  const hi = percentile(0.95);
  const range = hi - lo;

  if (range <= 0) {
    // All values effectively identical (or too few samples for a real
    // spread) — every beat gets the same mid-range energy rather than a
    // divide-by-zero or a fabricated 0/1 extreme.
    return rawValues.map(() => 0.5);
  }

  return rawValues.map((v) => Math.max(0, Math.min(1, (v - lo) / range)));
}

export function buildBeatGridFromTrack(track: Track, channelData: Float32Array, sampleRate: number): BeatGridDraft {
  const beatMap = track.beatMap;
  const beatTimesSeconds = beatMap?.beatTimesSeconds ?? [];
  const durationSeconds = track.durationSeconds;
  const bpm = beatMap?.bpm ?? null;

  if (beatTimesSeconds.length === 0) {
    // Documented low-confidence fallback — never thrown, never fabricated:
    // an empty grid with confidence 0 is a real, representable state the
    // beat-grid review UI can show plainly.
    return {
      beatTimesSeconds: [],
      beatWindows: [],
      rawEnergies: [],
      energies: [],
      bpm,
      beatsPerBar: DEFAULT_BEATS_PER_BAR,
      beatsPerBarConfirmed: false,
      durationSeconds,
      confidence: 0,
    };
  }

  const beatWindows = computeBeatWindows(beatTimesSeconds, bpm, durationSeconds);
  const rawEnergies = computeBeatEnergyFromChannelData(channelData, sampleRate, beatWindows);
  const energies = normalizeEnergyTrackRelative(rawEnergies);

  // Default to 4 beats per bar when unknown (approved decision 9), exposed
  // as an editable, explicitly unconfirmed value — beatsPerBarConfirmed is
  // the signal GlyphBeatGridReview.tsx uses to show that state, never
  // silently treated as a real detected time signature.
  const beatsPerBar = beatMap?.timeSignature?.numerator ?? DEFAULT_BEATS_PER_BAR;
  const beatsPerBarConfirmed = beatMap?.timeSignature != null;

  return {
    beatTimesSeconds,
    beatWindows,
    rawEnergies,
    energies,
    bpm,
    beatsPerBar,
    beatsPerBarConfirmed,
    durationSeconds,
    confidence: beatMap?.confidence ?? 0,
  };
}

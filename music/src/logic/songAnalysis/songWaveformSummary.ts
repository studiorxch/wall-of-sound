// Complete Song Intelligence — 0717D_RADIO_Playlist_Inbox_and_Performance_Foundation
// §"Persisted waveform summary". Reduces the per-frame min/max arrays
// computeDspFeaturesChunked already produces (inside its own chunked,
// yielding, abortable loop) into a compact, fixed-size waveform overview.
// Never touches raw audio samples directly — the expensive per-sample scan
// already happened in the chunked loop; this is a cheap pass over an array
// sized by frame count (thousands, even for a very long track), not by
// sample count (which could be tens of millions for a multi-hour source).

import type { SongWaveformSummary } from "../../data/songAnalysisTypes";
import { windowBounds } from "./songNumericProfiles";

export const DEFAULT_WAVEFORM_SAMPLE_COUNT = 640;

export function buildWaveformSummary(
  minValues: number[],
  maxValues: number[],
  sampleCount: number = DEFAULT_WAVEFORM_SAMPLE_COUNT,
): SongWaveformSummary {
  const length = Math.min(minValues.length, maxValues.length);
  const outMin: number[] = [];
  const outMax: number[] = [];

  for (let i = 0; i < sampleCount; i++) {
    if (length === 0) { outMin.push(0); outMax.push(0); continue; }
    const { startIdx, endIdx } = windowBounds(i, sampleCount, length);
    let binMin = minValues[startIdx];
    let binMax = maxValues[startIdx];
    for (let j = startIdx + 1; j < endIdx && j < length; j++) {
      if (minValues[j] < binMin) binMin = minValues[j];
      if (maxValues[j] > binMax) binMax = maxValues[j];
    }
    outMin.push(binMin);
    outMax.push(binMax);
  }

  return { sampleCount, minValues: outMin, maxValues: outMax };
}

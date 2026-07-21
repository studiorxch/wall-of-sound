// Complete Song Intelligence and Section Map (0717C) — the buffer-reuse
// priority chain required before any full-song analysis, per plan review:
// (1) an already-decoded buffer for the currently-open track, if the
// caller has one; (2) the canonical decode cache (App.tsx's
// getDecodedSourceBufferForRender, already reused by 0716B/0717B's own
// handleRenderLoop/handlePromoteToRadio), which itself checks its cache
// and decodes-and-caches only if missing. Never an unconditional second
// decode — "opening an already-decoded track does not decode it again."

import type { Track } from "../../data/trackTypes";
import type { AudioAnalysisInput } from "../../data/audioDetectionTypes";
import { audioBufferToAnalysisInput } from "../audioAnalysisInput";

export async function resolveSongAnalysisInput(
  existingBuffer: AudioBuffer | null,
  getCachedOrDecode: (track: Track) => Promise<AudioBuffer | null>,
  track: Track,
): Promise<AudioAnalysisInput | null> {
  const buffer = existingBuffer ?? (await getCachedOrDecode(track));
  if (!buffer) return null;
  // Both sources (audioBufferRef.current and getDecodedSourceBufferForRender's
  // cache) are already full, untruncated decodes — no maxDurationSec cap.
  return audioBufferToAnalysisInput(buffer);
}

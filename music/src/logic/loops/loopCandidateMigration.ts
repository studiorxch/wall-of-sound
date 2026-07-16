// Multi-Length Loop Candidate Generation and Preview Reliability
// (0714P_MUSIC_..._v1.0.0 §20). Pure. Existing (0714N/0714O) LoopAssets have
// no generationMode/length metadata — this build must read them safely
// without relabeling an existing 8-second fixed-time candidate as "8 bars"
// (a real, different claim it never made).

import type { LoopAsset, LoopLength } from "../../data/loopTypes";

const SUPPORTED_SECONDS = [8, 16, 32, 64] as const;
const DURATION_TOLERANCE_SECONDS = 0.05;

// Infers legacy-loop length metadata ONLY when the persisted duration
// matches a supported time-fallback length within tolerance — otherwise
// leaves it unset rather than guessing.
export function inferLegacyLoopLength(loop: Pick<LoopAsset, "barCount" | "durationSeconds" | "length">): LoopLength | undefined {
  if (loop.length) return loop.length;
  if (loop.barCount) return undefined; // already has real bar metadata; nothing to migrate
  const match = SUPPORTED_SECONDS.find((s) => Math.abs(s - loop.durationSeconds) <= DURATION_TOLERANCE_SECONDS);
  if (match == null) return undefined;
  return { kind: "seconds", seconds: match, expectedDurationSeconds: match };
}

export function migrateLegacyLoopGenerationMode(
  loop: Pick<LoopAsset, "generationMode" | "barCount">,
): "trusted_grid" | "provisional_grid" | "time_fallback" | "manual_only" {
  if (loop.generationMode) return loop.generationMode;
  // §20 — a legacy loop with no generationMode field predates this build;
  // it was always produced by the old fixed-time fallback path, so it
  // migrates as time_fallback regardless of whether it happens to have a
  // barCount (0714N's fallback never set one) — never inferred as trusted.
  return "time_fallback";
}

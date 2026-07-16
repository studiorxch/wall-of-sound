// Sectional Looper and Loop Library — trust/staleness helpers (§7, §12).
// Mirrors the isBeatMapTrustedForAnalysis / isPlaybackBoundsTrusted pattern.

import type { LoopAsset } from "../../data/loopTypes";

const SEAMLESSNESS_TRUST_THRESHOLD = 0.6;

export function isLoopTrustedForPreview(loop: Pick<LoopAsset, "seamlessnessScore" | "warnings">): boolean {
  if (loop.warnings.includes("LOOP_SOURCE_MISSING")) return false;
  if (loop.warnings.includes("LOOP_SOURCE_CHANGED")) return false;
  if (loop.warnings.includes("LOOP_RENDER_FAILED")) return false;
  if (loop.seamlessnessScore == null) return false;
  return loop.seamlessnessScore >= SEAMLESSNESS_TRUST_THRESHOLD;
}

// §7 — "source changed → loop requires review." Never silently remaps old
// loop boundaries to changed source audio; the caller must surface
// `needsReview` rather than recompute anything automatically.
export function checkLoopSourceLineage(
  loop: Pick<LoopAsset, "sourceFingerprint">,
  currentSourceFingerprint: string | undefined,
): boolean {
  if (!loop.sourceFingerprint || !currentSourceFingerprint) return false;
  return loop.sourceFingerprint !== currentSourceFingerprint;
}

// RadioLoop Library Foundation — stem duration cross-check (build spec
// §5.6). Node-only.
//
// Policy (decision 6, left open by the spec): if ANY staged stem's decoded
// duration doesn't match the core within tolerance (or fails codec/
// container probing), ALL stems are omitted from the package rather than
// publishing a partial, mismatched set. This is never a promotion FAILURE
// — the core can still succeed — but it must surface as a visible warning
// in the interface, not just this report (see PromoteToRadioDialog.tsx).

import { probeOpusFile } from "./radioAudioProbe";
import { decodeOpusFrameCount, framesMatchWithinTolerance } from "./radioOpusDecodeVerify";
import type { RadioValidationIssue } from "../../src/data/radioLoopTypes";

export interface StemInput {
  name: string;
  opusPath: string;
}

export interface StemValidationResult {
  includedStems: StemInput[];
  omitted: boolean;
  omittedReason?: string;
  issues: RadioValidationIssue[];
}

export async function validateStems(stems: StemInput[], coreDecodedFrameCount: number, workDir: string): Promise<StemValidationResult> {
  if (stems.length === 0) return { includedStems: [], omitted: false, issues: [] };

  const issues: RadioValidationIssue[] = [];
  const checks = await Promise.all(
    stems.map(async (stem) => {
      const [probe, decoded] = await Promise.all([
        probeOpusFile(stem.opusPath),
        decodeOpusFrameCount(stem.opusPath, workDir),
      ]);
      const frameOk = decoded.ok && decoded.frameCount != null && framesMatchWithinTolerance(decoded.frameCount, coreDecodedFrameCount);
      return { stem, probeOk: probe.ok, frameOk, decodedFrameCount: decoded.frameCount };
    }),
  );

  const allOk = checks.every((c) => c.probeOk && c.frameOk);
  if (allOk) return { includedStems: stems, omitted: false, issues: [] };

  for (const c of checks) {
    if (!c.probeOk) {
      issues.push({ code: "RADIO_STEM_PROBE_INVALID", message: `Stem "${c.stem.name}" failed codec/container validation`, severity: "warning" });
    }
    if (!c.frameOk) {
      issues.push({
        code: "RADIO_STEM_DURATION_MISMATCH",
        message: `Stem "${c.stem.name}" decoded frame count (${c.decodedFrameCount ?? "unknown"}) does not match the core (${coreDecodedFrameCount}) within tolerance`,
        severity: "warning",
      });
    }
  }
  issues.push({
    code: "RADIO_STEMS_OMITTED",
    message: "One or more stems failed validation — all stems omitted from this package (omit-all-on-mismatch policy). The core package is unaffected.",
    severity: "warning",
  });

  return { includedStems: [], omitted: true, omittedReason: "stem_duration_or_probe_mismatch", issues };
}

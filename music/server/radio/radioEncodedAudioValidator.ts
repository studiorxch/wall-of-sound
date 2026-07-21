// RadioLoop Library Foundation — composes the two required encoded-audio
// checks (build spec §5.5; plan correction #2: probe metadata alone is not
// sufficient). Node-only.

import { probeOpusFile, type ProbeResult } from "./radioAudioProbe";
import { decodeAndVerifyCoreFrames, type DecodeVerifyResult } from "./radioOpusDecodeVerify";
import type { RadioValidationIssue } from "../../src/data/radioLoopTypes";

export interface EncodedAudioValidationResult {
  ok: boolean;
  probe: ProbeResult;
  decodeVerify: DecodeVerifyResult;
  issues: RadioValidationIssue[];
}

// Both checks are required before a package may reach RADIO_READY.
export async function validateEncodedCore(opusPath: string, sourceWavPath: string, workDir: string): Promise<EncodedAudioValidationResult> {
  const [probe, decodeVerify] = await Promise.all([
    probeOpusFile(opusPath),
    decodeAndVerifyCoreFrames(opusPath, sourceWavPath, workDir),
  ]);
  return {
    ok: probe.ok && decodeVerify.ok,
    probe,
    decodeVerify,
    issues: [...probe.issues, ...decodeVerify.issues],
  };
}

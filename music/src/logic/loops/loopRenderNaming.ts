// Loop Rendering and External Handoff — render filename + collision
// handling (§17, §18). Pure. Filename is presentation/filesystem output
// only — loopId/renderId/sourceFingerprint remain the stable internal
// identity, never derived from the filename.

import { buildLoopFileName } from "./loopNaming";

export function buildRenderFileName(params: {
  artist?: string;
  trackTitle: string;
  sectionLabel: string;
  barCount?: number;
  bpm?: number;
  durationSeconds: number;
}): string {
  const { artist, trackTitle, sectionLabel, barCount, bpm, durationSeconds } = params;
  // §17 — fallback naming when bar/BPM is unavailable: use duration instead.
  if (barCount == null || bpm == null) {
    const sanitized = buildLoopFileName({ artist, trackTitle, sectionLabel });
    return sanitized.replace(/\.wav$/, ` - ${Math.round(durationSeconds)}s.wav`);
  }
  return buildLoopFileName({ artist, trackTitle, sectionLabel, barCount, bpm });
}

// §17 — never overwrite an existing file silently: append " - v2", " - v3"…
export function resolveCollisionFreeFileName(desiredFileName: string, existingFileNames: ReadonlySet<string>): string {
  if (!existingFileNames.has(desiredFileName)) return desiredFileName;
  const extIdx = desiredFileName.lastIndexOf(".");
  const base = extIdx >= 0 ? desiredFileName.slice(0, extIdx) : desiredFileName;
  const ext = extIdx >= 0 ? desiredFileName.slice(extIdx) : "";
  let version = 2;
  let candidate = `${base} - v${version}${ext}`;
  while (existingFileNames.has(candidate)) {
    version++;
    candidate = `${base} - v${version}${ext}`;
  }
  return candidate;
}

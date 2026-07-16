// Loop Rendering and External Handoff — stale/missing render detection
// (§24, §25). Pure. A render becomes stale when anything it was derived
// from has changed since; missing is reported by the caller (browser code
// cannot itself probe filesystem existence — see completion report).

import type { LoopRenderRecord, LoopRenderSettings } from "../../data/loopRenderTypes";

export interface StalenessCheckInput {
  currentSourceFingerprint: string | undefined;
  currentStartSeconds: number;
  currentEndSeconds: number;
  currentSettings: LoopRenderSettings;

  // 0715C — compared against the render record's OWN stamped provenance
  // (renderedRevisionId/renderedGridRevisionId/renderedSegmentationRevisionId
  // in loopRenderTypes.ts). Optional on both sides: a render made before
  // this field existed has no baseline to compare, so it's treated as
  // "unknown, not stale" rather than retroactively flagged.
  currentRevisionId?: string;
  currentGridRevisionId?: string;
  currentSegmentationRevisionId?: string;
}

function settingsEqual(a: LoopRenderSettings, b: LoopRenderSettings): boolean {
  return a.format === b.format && a.sampleRate === b.sampleRate && a.bitDepth === b.bitDepth
    && a.channels === b.channels && a.normalize === b.normalize
    && a.normalizeTargetDbfs === b.normalizeTargetDbfs && a.bakeBoundaryCrossfade === b.bakeBoundaryCrossfade
    && a.boundaryCrossfadeMs === b.boundaryCrossfadeMs;
}

export function isRenderStale(render: LoopRenderRecord, input: StalenessCheckInput): boolean {
  if (render.status !== "rendered") return false;
  if (input.currentSourceFingerprint && render.sourceFingerprint !== input.currentSourceFingerprint) return true;
  if (render.sourceStartSeconds !== input.currentStartSeconds) return true;
  if (render.sourceEndSeconds !== input.currentEndSeconds) return true;
  if (!settingsEqual(render.settings, input.currentSettings)) return true;
  if (input.currentRevisionId !== undefined && render.renderedRevisionId !== undefined
    && render.renderedRevisionId !== input.currentRevisionId) return true;
  if (input.currentGridRevisionId !== undefined && render.renderedGridRevisionId !== undefined
    && render.renderedGridRevisionId !== input.currentGridRevisionId) return true;
  if (input.currentSegmentationRevisionId !== undefined && render.renderedSegmentationRevisionId !== undefined
    && render.renderedSegmentationRevisionId !== input.currentSegmentationRevisionId) return true;
  return false;
}

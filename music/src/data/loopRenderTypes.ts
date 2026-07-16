// Loop Rendering and External Handoff (0714O_MUSIC_Loop_Rendering_And_
// External_Handoff v1.0.0) — canonical render data model (§5). Extends
// LoopAsset with a separate, optional LoopRenderRecord — a loop may exist
// as a non-destructive reference, a render, or both; rendering never
// modifies the source track.

export type LoopRenderStatus = "not_rendered" | "rendering" | "rendered" | "stale" | "missing" | "failed";

export type LoopRenderFormat = "wav";

export interface BoundaryCrossfadeSettings {
  enabled: boolean;
  durationMs: number;
  curve: "linear" | "equal_power";
}

export interface NormalizeSettings {
  enabled: boolean;
  targetDbfs: number;
}

export interface LoopRenderSettings {
  format: LoopRenderFormat;

  sampleRate: number;
  bitDepth: 16 | 24 | 32;

  channels: 1 | 2;

  normalize: boolean;
  normalizeTargetDbfs?: number;

  bakeBoundaryCrossfade: boolean;
  boundaryCrossfadeMs?: number;
}

export interface LoopRenderRecord {
  id: string;
  loopId: string;

  status: LoopRenderStatus;
  settings: LoopRenderSettings;

  outputPath?: string;
  filename?: string;

  sourceFingerprint: string;
  sourceStartSeconds: number;
  sourceEndSeconds: number;

  // 0715C_MUSIC_Loop_Workspace_Editing_And_Revision_Completion — revision/
  // grid provenance, stamped HERE at render time so loopRenderStaleness.ts
  // has a real baseline to compare "what's active now" against. Never
  // read before being written: a render record from before this field
  // existed simply has no baseline, and staleness checks treat that as
  // "unknown, not stale" rather than retroactively flagging old renders.
  renderedRevisionId?: string;
  renderedGridRevisionId?: string;
  renderedSegmentationRevisionId?: string;

  renderedDurationSeconds?: number;
  renderedSampleCount?: number;
  renderedChannelCount?: number;

  fileSizeBytes?: number;
  checksum?: string;

  renderedAt?: string;
  error?: string;
}

export interface LoopRenderProgress {
  loopId: string;
  phase:
    | "resolving_source" | "decoding" | "extracting" | "processing"
    | "encoding" | "writing" | "validating" | "complete" | "failed";
  progress: number;
}

// §7 — recommended default: preserves source dynamics/channels, imports
// cleanly into external tools, avoids hidden gain changes.
export function defaultRenderSettings(sampleRate: number, channels: 1 | 2): LoopRenderSettings {
  return {
    format: "wav",
    sampleRate,
    bitDepth: 24,
    channels,
    normalize: false,
    normalizeTargetDbfs: -1.0,
    bakeBoundaryCrossfade: false,
    boundaryCrossfadeMs: 20,
  };
}

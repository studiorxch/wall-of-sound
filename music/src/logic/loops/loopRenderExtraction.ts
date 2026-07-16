// Loop Rendering and External Handoff — frame-accurate extraction (§9,
// §10). Pure. Never relies on rounded display times — callers must pass
// canonical stored loop boundaries.

export interface FrameRange {
  startFrame: number;
  endFrame: number;
}

export function computeFrameRange(startSeconds: number, endSeconds: number, sampleRate: number, sourceFrameCount: number): FrameRange {
  const startFrame = Math.round(startSeconds * sampleRate);
  const endFrame = Math.round(endSeconds * sampleRate);
  if (!(startFrame >= 0 && startFrame < endFrame && endFrame <= sourceFrameCount)) {
    throw new Error(`invalid_frame_range: start=${startFrame} end=${endFrame} sourceFrames=${sourceFrameCount}`);
  }
  return { startFrame, endFrame };
}

// §10 — preserve source channel layout; never silently collapse stereo to
// mono. `targetChannels` must match the source unless the caller explicitly
// requests a downmix.
export function extractChannelRange(
  sourceChannelData: Float32Array[],
  range: FrameRange,
): Float32Array[] {
  const { startFrame, endFrame } = range;
  const length = endFrame - startFrame;
  return sourceChannelData.map((channel) => channel.subarray(startFrame, startFrame + length).slice(0));
}

// Explicit stereo→mono downmix (average channels) — only invoked when the
// caller has explicitly requested a channel-count change, never silently.
export function downmixToMono(channelData: Float32Array[]): Float32Array[] {
  const length = channelData[0]?.length ?? 0;
  const mono = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    let sum = 0;
    for (const ch of channelData) sum += ch[i] ?? 0;
    mono[i] = sum / channelData.length;
  }
  return [mono];
}

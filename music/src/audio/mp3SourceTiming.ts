// 0715F_MUSIC_Sample_Accurate_Loop_Audition_And_Playhead_Synchronization §16 —
// MP3 encoder-delay/padding investigation. `decodeAudioData` exposes no
// reliable encoder-delay metadata, so this is a pure silence-run heuristic
// over already-decoded PCM, never a global/automatic boundary shift. Source
// zero is never assumed to equal the first musical sample without evidence
// — confidence is "estimated" at best, "unknown" whenever the heuristic
// cannot distinguish real padding from an intentionally silent intro/outro.

export interface DecodedSourceTiming {
  decodedStartOffsetFrames: number;
  decodedEndPaddingFrames: number;
  confidence: "known" | "estimated" | "unknown";
  source: "metadata" | "analysis" | "none";
}

// Bounds how far into/out-of the buffer the silence scan runs, so a
// genuinely silent track (or an intentionally silent intro/outro) doesn't
// get misread as "all padding" — past this bound we simply don't know.
const MAX_SCAN_SECONDS = 2;

function countLeadingSilence(data: Float32Array, threshold: number, maxScanFrames: number): number {
  const limit = Math.min(data.length, maxScanFrames);
  let i = 0;
  while (i < limit && Math.abs(data[i]) < threshold) i++;
  return i;
}

export function estimateDecodedSourceOffsets(
  channelData: Float32Array,
  sampleRate: number,
  silenceThreshold = 0.001,
): DecodedSourceTiming {
  const unknown: DecodedSourceTiming = {
    decodedStartOffsetFrames: 0, decodedEndPaddingFrames: 0, confidence: "unknown", source: "none",
  };

  const maxScanFrames = Math.round(MAX_SCAN_SECONDS * sampleRate);
  // Too short to judge at all.
  if (channelData.length < Math.round(sampleRate * 0.01)) return unknown;

  const startOffset = countLeadingSilence(channelData, silenceThreshold, maxScanFrames);
  const reversedTail = channelData.slice(Math.max(0, channelData.length - maxScanFrames)).reverse();
  const endPadding = countLeadingSilence(reversedTail, silenceThreshold, maxScanFrames);

  // No silence found at either end, or the scan hit its bound without
  // finding real content (can't distinguish padding from genuine silence) —
  // report unknown rather than fabricating a confident zero-offset finding.
  if (startOffset === 0 && endPadding === 0) return unknown;
  if (startOffset >= maxScanFrames || endPadding >= maxScanFrames) return unknown;

  return {
    decodedStartOffsetFrames: startOffset,
    decodedEndPaddingFrames: endPadding,
    confidence: "estimated",
    source: "analysis",
  };
}

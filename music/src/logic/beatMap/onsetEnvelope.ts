// Track Beat Map Foundation — onset-strength envelope (§6, §27). A small,
// self-contained primitive (RMS-derivative onset strength) analogous to the
// one bpmDetection.ts computes internally, kept independent per this build's
// own architecture guidance rather than exported from the protected BPM
// detector file. Operates on the SAME decoded mono buffer the canonical DSP
// pipeline already produced — never decodes audio itself.

export interface OnsetEnvelope {
  envelope: Float32Array;
  hopSeconds: number;
}

const HOP = 512;

export function computeOnsetEnvelope(mono: Float32Array, sampleRate: number): OnsetEnvelope {
  const frameCount = Math.floor(mono.length / HOP);
  const rms = new Float32Array(frameCount);
  for (let i = 0; i < frameCount; i++) {
    let sum = 0;
    const start = i * HOP;
    for (let j = 0; j < HOP; j++) {
      const v = mono[start + j];
      sum += v * v;
    }
    rms[i] = Math.sqrt(sum / HOP);
  }
  const envelope = new Float32Array(frameCount);
  for (let i = 1; i < frameCount; i++) envelope[i] = Math.max(0, rms[i] - rms[i - 1]);
  return { envelope, hopSeconds: HOP / sampleRate };
}

// Local low-band accent envelope — a coarse proxy for kick/bass emphasis,
// used by downbeat detection (§8) to distinguish "a beat" from "the
// downbeat" without a full harmonic analysis. Sums squared amplitude in a
// short low-pass-ish moving window (cheap, no FFT) rather than the full
// spectral pipeline dspFeatureExtraction already runs elsewhere.
export function computeLowBandEnvelope(mono: Float32Array, sampleRate: number): OnsetEnvelope {
  const smoothWindow = Math.max(4, Math.round(sampleRate / 4000)); // crude low-pass via short moving average
  const smoothed = new Float32Array(mono.length);
  let acc = 0;
  for (let i = 0; i < mono.length; i++) {
    acc += mono[i];
    if (i >= smoothWindow) acc -= mono[i - smoothWindow];
    smoothed[i] = acc / Math.min(i + 1, smoothWindow);
  }
  return computeOnsetEnvelope(smoothed, sampleRate);
}

export function meanAt(envelope: Float32Array, hopSeconds: number, timeSeconds: number, windowSeconds = 0.05): number {
  const centerFrame = Math.round(timeSeconds / hopSeconds);
  const halfWindow = Math.max(1, Math.round(windowSeconds / hopSeconds));
  let sum = 0;
  let count = 0;
  for (let f = centerFrame - halfWindow; f <= centerFrame + halfWindow; f++) {
    if (f < 0 || f >= envelope.length) continue;
    sum += envelope[f];
    count++;
  }
  return count > 0 ? sum / count : 0;
}

export function sumAt(envelope: Float32Array, hopSeconds: number, timeSeconds: number, windowSeconds = 0.05): number {
  const centerFrame = Math.round(timeSeconds / hopSeconds);
  const halfWindow = Math.max(1, Math.round(windowSeconds / hopSeconds));
  let sum = 0;
  for (let f = centerFrame - halfWindow; f <= centerFrame + halfWindow; f++) {
    if (f < 0 || f >= envelope.length) continue;
    sum += envelope[f];
  }
  return sum;
}

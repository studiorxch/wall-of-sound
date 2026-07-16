// Loop Rendering and External Handoff — optional render processing (§13,
// §14). Pure. Both are OFF by default (§7) — this is baked, permanent
// processing on the RENDERED file, distinct from preview-only micro-
// crossfade audition (never confuse the two, per §13).

import type { BoundaryCrossfadeSettings, NormalizeSettings } from "../../data/loopRenderTypes";

export function applyNormalization(channelData: Float32Array[], settings: NormalizeSettings): Float32Array[] {
  if (!settings.enabled) return channelData;
  let peak = 0;
  for (const ch of channelData) {
    for (let i = 0; i < ch.length; i++) peak = Math.max(peak, Math.abs(ch[i]));
  }
  if (peak === 0) return channelData;
  const targetLinear = Math.pow(10, settings.targetDbfs / 20);
  const gain = targetLinear / peak;
  return channelData.map((ch) => {
    const out = new Float32Array(ch.length);
    for (let i = 0; i < ch.length; i++) out[i] = ch[i] * gain;
    return out;
  });
}

// §13 — baked boundary crossfade only touches the edge regions; everything
// else must remain byte-identical to the extracted range.
export function applyBoundaryCrossfade(
  channelData: Float32Array[],
  settings: BoundaryCrossfadeSettings,
  sampleRate: number,
): Float32Array[] {
  if (!settings.enabled) return channelData;
  const fadeFrames = Math.max(1, Math.round((settings.durationMs / 1000) * sampleRate));
  return channelData.map((ch) => {
    const out = ch.slice();
    const n = Math.min(fadeFrames, out.length);
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const inGain = settings.curve === "equal_power" ? Math.sin((t * Math.PI) / 2) : t;
      const outGain = settings.curve === "equal_power" ? Math.cos((t * Math.PI) / 2) : 1 - t;
      out[i] = out[i] * inGain; // fade in at head (sample 0 is silent, ramping up)
      const tailIdx = out.length - n + i;
      out[tailIdx] = out[tailIdx] * outGain; // fade out at tail (last sample is silent, ramping down toward it)
    }
    return out;
  });
}

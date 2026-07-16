// 0714R — waveform envelope cache (§23). Keyed by source fingerprint +
// generator version + bin count, so a changed source (new fingerprint) or a
// changed peak algorithm (new generator version) never reuses stale peaks.
// Session-only (in-memory Map), matching this project's existing convention
// for decoded-audio caches (see App.tsx decodedSourceBufferCacheRef) — no
// new persistence layer is introduced.

import type { WaveformEnvelope } from "../../data/loopTypes";

export function buildWaveformCacheKey(
  sourceFingerprint: string,
  generatorVersion: string,
  binCount: number,
): string {
  return `${sourceFingerprint}|${generatorVersion}|${binCount}`;
}

const cache = new Map<string, WaveformEnvelope>();

export function getCachedWaveform(key: string): WaveformEnvelope | undefined {
  return cache.get(key);
}

export function setCachedWaveform(key: string, envelope: WaveformEnvelope): void {
  cache.set(key, envelope);
}

// §23 — explicit staleness check: a cached envelope is only valid for a
// source whose fingerprint AND reported duration still match. Callers
// should re-generate (not reuse) whenever this returns false.
export function isWaveformEnvelopeStale(
  envelope: WaveformEnvelope,
  currentSourceFingerprint: string,
  currentDurationSeconds: number,
): boolean {
  if (envelope.sourceFingerprint !== currentSourceFingerprint) return true;
  if (Math.abs(envelope.durationSeconds - currentDurationSeconds) > 0.5) return true;
  return false;
}

export function clearWaveformCache(): void {
  cache.clear();
}

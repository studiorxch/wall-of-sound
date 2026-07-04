import type { RGBColor, CandidateColor, ExtractionSettings } from '../types/palette';
import { rgbToHex, rgbToLab, colorDistance } from './colorConversion';

// ─── Engine constants ──────────────────────────────────────────────────────────
// Version must increment on any change that may affect extraction output.
// See: ExtractionPipeline v1.3.0 — Engine Versioning Doctrine

export const ENGINE_VERSION = '1.3.0';
export const DETERMINISTIC_SEED = 42;
export const TARGET_RESOLUTION = 1024;
export const TARGET_SAMPLE_COUNT = 50_000;
export const K_MEANS_ITERATIONS = 20;

// ─── Canonical extraction settings ────────────────────────────────────────────

export function makeExtractionSettings(
  candidateCount: number,
  samplingCount: number,
): ExtractionSettings {
  return {
    method: 'dominant_cluster',
    candidateCount,
    samplingMode: 'step',
    samplingCount,
    targetResolution: TARGET_RESOLUTION,
    colorSpace: 'RGBA_8BIT',
    alphaHandling: 'EXCLUDE_ALPHA_LT_255',
    deterministicSeed: DETERMINISTIC_SEED,
    engineVersion: ENGINE_VERSION,
  };
}

// ─── Deduplication identity ────────────────────────────────────────────────────

export function makeDeduplicationKey(contentHash: string, settings: ExtractionSettings): string {
  // All extraction_settings fields participate in canonical deduplication identity.
  return [
    contentHash,
    settings.engineVersion,
    settings.method,
    settings.candidateCount,
    settings.deterministicSeed,
    settings.targetResolution,
    settings.alphaHandling,
    settings.samplingMode,
  ].join('|');
}

// ─── Normalization buffer ──────────────────────────────────────────────────────
// Creates a working buffer normalized to max 1024px, preserving aspect ratio.
// The working buffer is derived extraction infrastructure — NOT archival truth.
// Original source remains untouched.

export function createNormalizedBuffer(
  image: HTMLImageElement,
  maxDim = TARGET_RESOLUTION,
): HTMLCanvasElement {
  const { naturalWidth: w, naturalHeight: h } = image;
  const scale = Math.min(maxDim / w, maxDim / h, 1); // never upscale
  const nw = Math.round(w * scale);
  const nh = Math.round(h * scale);

  const canvas = document.createElement('canvas');
  canvas.width = nw;
  canvas.height = nh;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not acquire 2D context for normalization buffer.');
  ctx.drawImage(image, 0, 0, nw, nh);
  return canvas;
}

// ─── Deterministic seeded PRNG ─────────────────────────────────────────────────
// Mulberry32 — fast, deterministic, single-seed.
// Required by Determinism Doctrine: same seed + content = identical output.

function makePrng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Pixel sampling ────────────────────────────────────────────────────────────
// Alpha handling: EXCLUDE_ALPHA_LT_255 — pixels with alpha < 255 must NOT
// participate in sampling, frequency calculations, or candidate generation.
// This is deterministic extraction infrastructure, NOT optional behavior.

function samplePixels(
  canvas: HTMLCanvasElement,
  targetCount: number,
): { pixels: RGBColor[]; samplingCount: number } {
  const ctx = canvas.getContext('2d');
  if (!ctx) return { pixels: [], samplingCount: 0 };

  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const totalPixels = width * height;

  // Step chosen to hit ~targetCount samples
  const step = Math.max(1, Math.floor(totalPixels / targetCount));
  const pixels: RGBColor[] = [];

  for (let i = 0; i < data.length; i += 4 * step) {
    const alpha = data[i + 3];
    if (alpha < 255) continue; // INVARIANT: EXCLUDE_ALPHA_LT_255
    pixels.push({ r: data[i], g: data[i + 1], b: data[i + 2] });
  }

  return { pixels, samplingCount: pixels.length };
}

// ─── k-means clustering ────────────────────────────────────────────────────────
// Deterministic: initial centroids selected via seeded PRNG.

function assignClusters(pixels: RGBColor[], centroids: RGBColor[]): Uint16Array {
  const assignments = new Uint16Array(pixels.length);
  for (let i = 0; i < pixels.length; i++) {
    let minDist = Infinity;
    let nearest = 0;
    for (let c = 0; c < centroids.length; c++) {
      const d = colorDistance(pixels[i], centroids[c]);
      if (d < minDist) { minDist = d; nearest = c; }
    }
    assignments[i] = nearest;
  }
  return assignments;
}

function recalcCentroids(
  pixels: RGBColor[],
  assignments: Uint16Array,
  k: number,
  rng: () => number,
): { centroids: RGBColor[]; counts: number[] } {
  const sums = Array.from({ length: k }, () => ({ r: 0, g: 0, b: 0, count: 0 }));
  for (let i = 0; i < pixels.length; i++) {
    const c = assignments[i];
    sums[c].r += pixels[i].r;
    sums[c].g += pixels[i].g;
    sums[c].b += pixels[i].b;
    sums[c].count++;
  }
  const centroids = sums.map(s =>
    s.count === 0
      ? pixels[Math.floor(rng() * pixels.length)] // re-seed empty cluster
      : { r: Math.round(s.r / s.count), g: Math.round(s.g / s.count), b: Math.round(s.b / s.count) }
  );
  return { centroids, counts: sums.map(s => s.count) };
}

function kMeans(
  pixels: RGBColor[],
  k: number,
  seed: number,
): { centroids: RGBColor[]; frequencies: number[] } {
  const rng = makePrng(seed);

  // Deterministic initial centroids via seeded shuffle
  const shuffled = [...pixels].sort(() => rng() - 0.5);
  let centroids = shuffled.slice(0, k);
  let counts: number[] = new Array(k).fill(0);
  let assignments = new Uint16Array(pixels.length);

  for (let iter = 0; iter < K_MEANS_ITERATIONS; iter++) {
    assignments = assignClusters(pixels, centroids);
    const result = recalcCentroids(pixels, assignments, k, rng);
    centroids = result.centroids;
    counts = result.counts;
  }

  const total = pixels.length;
  const frequencies = counts.map(c => c / total);
  return { centroids, frequencies };
}

// ─── Public extraction API ────────────────────────────────────────────────────

/**
 * Extract dominant color candidates from a normalized working buffer.
 * Returns sealed CandidateColor telemetry with RGB, LAB, and frequency.
 *
 * INVARIANT: output is determined solely by image content + settings.
 * Same content + same settings = identical CandidateColor array.
 */
export function extractCandidates(
  normalizedBuffer: HTMLCanvasElement,
  settings: ExtractionSettings,
): { candidateColors: CandidateColor[]; samplingCount: number } {
  const { pixels, samplingCount } = samplePixels(normalizedBuffer, TARGET_SAMPLE_COUNT);

  if (pixels.length === 0) {
    return { candidateColors: [], samplingCount: 0 };
  }

  const k = Math.min(settings.candidateCount, pixels.length);
  const { centroids, frequencies } = kMeans(pixels, k, settings.deterministicSeed);

  // Sort by frequency descending so most dominant colors come first
  const indexed = centroids.map((rgb, i) => ({ rgb, frequency: frequencies[i] }));
  indexed.sort((a, b) => b.frequency - a.frequency);

  // candidateIndex is the stable position after frequency-sort — used as identity anchor.
  // Canonical candidateRef format: `${source_candidates_ref}:candidate_${candidateIndex}`
  // INVARIANT: must NOT use hex values or RGB strings as candidate identity.
  const candidateColors: CandidateColor[] = indexed.map(({ rgb, frequency }, i) => ({
    candidateIndex: i,
    hex: rgbToHex(rgb),
    rgb,
    lab: rgbToLab(rgb),
    frequency: Math.round(frequency * 10000) / 10000,
  }));

  return { candidateColors, samplingCount };
}

/**
 * Sample the display canvas color at normalized (x, y) position.
 * Used by draggable pins — reads from the rendered display canvas, not the
 * extraction buffer (those are separate concerns).
 */
export function sampleColorAtPosition(
  canvas: HTMLCanvasElement,
  normX: number,
  normY: number,
): RGBColor {
  const ctx = canvas.getContext('2d');
  if (!ctx) return { r: 0, g: 0, b: 0 };
  const x = Math.max(0, Math.min(Math.round(normX * canvas.width), canvas.width - 1));
  const y = Math.max(0, Math.min(Math.round(normY * canvas.height), canvas.height - 1));
  const pixel = ctx.getImageData(x, y, 1, 1);
  return { r: pixel.data[0], g: pixel.data[1], b: pixel.data[2] };
}

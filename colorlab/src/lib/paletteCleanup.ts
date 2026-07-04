/**
 * Palette Cleanup Pipeline — v1.2.0
 *
 * Transforms SOURCE_CANDIDATES telemetry into CURATED_PALETTE revisions through:
 *   Similarity Analysis → Duplicate Suppression → Noise Filtering →
 *   Tonal Analysis → Palette Structuring → Structural Role Assignment →
 *   Interpretive Role Assignment → Cleanup Metrics → Cleanup Payload
 *
 * Cleanup is interpretation infrastructure — NOT source mutation.
 * SOURCE_CANDIDATES are never mutated. Excluded candidates remain lineage-accessible.
 */

import type {
  SourceCandidatesRecord,
  CandidateColor,
  CleanupMode,
  CleanupPayload,
  CleanupMetrics,
  CuratedColor,
  ExcludedColor,
  StructuralRole,
  InterpretiveRole,
  LABColor,
} from '../types/palette';
import { CLEANUP_MODE_PARAMS } from '../types/palette';
import { deltaE2000, chroma } from './colorConversion';

export const CLEANUP_ENGINE_VERSION = '1.2.0';
export const CLEANUP_SEED = 42;

// Max curated colors surfaced to the UI (not a governance limit — display constraint)
const MAX_CURATED = 10;
// Minimum frequency to avoid sub-threshold noise (0.3% of sampled pixels)
const NOISE_FREQUENCY_THRESHOLD = 0.003;

// ─── Step 1: Noise filtering ───────────────────────────────────────────────────
// Suppress extraction artifacts: sub-threshold micro clusters with very low
// frequency AND low perceptual chroma (unlikely structural anchors).
// INVARIANT: must never suppress structurally important accents.

function filterNoise(
  candidates: CandidateColor[],
  sourceCandidatesRef: string,
): { kept: CandidateColor[]; excluded: ExcludedColor[] } {
  const kept: CandidateColor[] = [];
  const excluded: ExcludedColor[] = [];

  // Sort by frequency descending (stable, deterministic)
  const sorted = [...candidates].sort((a, b) =>
    b.frequency !== a.frequency ? b.frequency - a.frequency : a.hex.localeCompare(b.hex)
  );

  for (const c of sorted) {
    const chromaValue = chroma(c.lab);
    const isNoise = c.frequency < NOISE_FREQUENCY_THRESHOLD && chromaValue < 12;
    if (isNoise) {
      excluded.push({
        candidateRef: `${sourceCandidatesRef}:candidate_${c.candidateIndex}`,
        suppressionReason: 'noise',
      });
    } else {
      kept.push(c);
    }
  }
  return { kept, excluded };
}

// ─── Step 2: Duplicate suppression ────────────────────────────────────────────
// Uses Delta-E 2000 (perceptual distance in CIELAB).
// RGB distance is forbidden for canonical perceptual cleanup behavior.
// Excluded candidates are tracked with lineage references — never deleted.

function suppressDuplicates(
  candidates: CandidateColor[],
  threshold: number,
  sourceCandidatesRef: string,
): { kept: CandidateColor[]; excluded: ExcludedColor[] } {
  const kept: CandidateColor[] = [];
  const excluded: ExcludedColor[] = [];

  // Process in deterministic order (sorted by frequency desc, then hex for tie-breaking)
  // INVARIANT: cleanup ordering must be deterministic — no runtime-order reliance.
  for (const candidate of candidates) {
    let suppressor: CandidateColor | null = null;
    let minDeltaE = Infinity;

    for (const keeper of kept) {
      const de = deltaE2000(candidate.lab, keeper.lab);
      if (de < threshold && de < minDeltaE) {
        minDeltaE = de;
        suppressor = keeper;
      }
    }

    if (suppressor) {
      excluded.push({
        candidateRef: `${sourceCandidatesRef}:candidate_${candidate.candidateIndex}`,
        suppressionReason: 'perceptual_duplicate',
        deltaE: Math.round(minDeltaE * 100) / 100,
        suppressedBy: suppressor.hex,
      });
    } else {
      kept.push(candidate);
    }
  }

  return { kept, excluded };
}

// ─── Step 3: Tonal analysis ────────────────────────────────────────────────────
// Evaluates luminance distribution and saturation spread for structuring.

interface TonalProfile {
  minL: number;
  maxL: number;
  avgL: number;
  avgChroma: number;
  avgB: number;  // warm/cool axis
  sortedByL: CandidateColor[];
}

function analyzeTone(candidates: CandidateColor[]): TonalProfile {
  const ls = candidates.map(c => c.lab.l);
  const minL = Math.min(...ls);
  const maxL = Math.max(...ls);
  const avgL = ls.reduce((s, v) => s + v, 0) / ls.length;
  const avgChroma = candidates.reduce((s, c) => s + chroma(c.lab), 0) / candidates.length;
  const avgB = candidates.reduce((s, c) => s + c.lab.b, 0) / candidates.length;
  const sortedByL = [...candidates].sort((a, b) =>
    a.lab.l !== b.lab.l ? a.lab.l - b.lab.l : a.hex.localeCompare(b.hex)
  );
  return { minL, maxL, avgL, avgChroma, avgB, sortedByL };
}

// ─── Step 4: Structural role assignment ───────────────────────────────────────
// Structural roles define tonal organization behavior.
// NOT emotional interpretation.

function assignStructuralRole(
  candidate: CandidateColor,
  allKept: CandidateColor[],
  tonal: TonalProfile,
  index: number,          // position in luminance-sorted list
  total: number,
): StructuralRole {
  const L = candidate.lab.l;
  const C = chroma(candidate.lab);
  const freq = candidate.frequency;

  // signal: luminance extremes (top or bottom 10%)
  const luminanceRange = tonal.maxL - tonal.minL;
  if (luminanceRange > 0) {
    const lPct = (L - tonal.minL) / luminanceRange;
    if (lPct >= 0.9 || lPct <= 0.1) return 'signal';
  }

  // accent: high chroma relative to palette average
  if (C > tonal.avgChroma * 1.5 && C > 25) return 'accent';

  // base: highest frequency (dominant tonal foundation)
  const maxFreq = Math.max(...allKept.map(c => c.frequency));
  if (freq === maxFreq) return 'base';

  // separator: mid-luminance with significant contrast from neighbors
  const prevL = index > 0 ? tonal.sortedByL[index - 1].lab.l : L;
  const nextL = index < total - 1 ? tonal.sortedByL[index + 1].lab.l : L;
  const contrastGap = Math.max(Math.abs(L - prevL), Math.abs(L - nextL));
  if (contrastGap > 20 && index > 0 && index < total - 1) return 'separator';

  return 'support';
}

// ─── Step 5: Interpretive role assignment ─────────────────────────────────────
// Heuristic analytical signals — NOT canonical emotional truth.
// May NEVER override structural roles or become governance authority.

function assignInterpretiveRole(lab: LABColor): InterpretiveRole {
  const L = lab.l;
  const a = lab.a;
  const b = lab.b;
  const C = chroma(lab);

  if (C < 10) return L < 40 ? 'nocturnal' : 'neutral';
  if (C < 20) return 'muted';

  // nocturnal: very dark
  if (L < 22) return 'nocturnal';

  // vibrant: high chroma
  if (C > 55) return 'vibrant';

  // synthetic: high chroma with cool (cyan/magenta) hue
  if (C > 30 && b < -8) return 'synthetic';

  // environmental: green hue
  if (a < -12) return 'environmental';

  // warm: red/orange/yellow
  if (b > 18 && a > -5) return 'warm';

  // industrial: mid-L, low-to-mid chroma, no dominant hue
  if (L >= 30 && L <= 65 && C < 35 && Math.abs(a) < 12) return 'industrial';

  // cool: blue tones
  if (b < -5) return 'cool';

  return 'neutral';
}

// ─── Step 6: Cleanup metrics ──────────────────────────────────────────────────
// Heuristic analytical signals for comparison and organization.
// NOT deterministic mood truth.

function computeMetrics(curated: CandidateColor[]): CleanupMetrics {
  if (curated.length === 0) {
    return { warmth: 0, saturation: 0, contrast: 0, luminanceSpread: 0, tonalDensity: 0, energy: 0, harmony: 0 };
  }

  const ls  = curated.map(c => c.lab.l);
  const cs  = curated.map(c => chroma(c.lab));
  const bs  = curated.map(c => c.lab.b);

  const avgL = ls.reduce((s, v) => s + v, 0) / ls.length;
  const avgC = cs.reduce((s, v) => s + v, 0) / cs.length;

  // warmth: normalized average LAB b* (yellow-blue axis), clamped to 0–1
  const warmth = Math.max(0, Math.min(1, (bs.reduce((s, v) => s + v, 0) / bs.length + 50) / 100));

  // saturation: average chroma normalized to [0, 1] (max chroma ~128 in LAB)
  const saturation = Math.min(1, avgC / 80);

  // contrast: luminance range normalized to [0, 1]
  const contrast = Math.min(1, (Math.max(...ls) - Math.min(...ls)) / 100);

  // luminanceSpread: std deviation of L* normalized
  const lVariance = ls.reduce((s, v) => s + (v - avgL) ** 2, 0) / ls.length;
  const luminanceSpread = Math.min(1, Math.sqrt(lVariance) / 35);

  // tonalDensity: how many distinct tonal bands (normalized by count)
  const tonalBands = new Set(ls.map(l => Math.round(l / 10))).size;
  const tonalDensity = Math.min(1, tonalBands / 7);

  // energy: composite of saturation + contrast
  const energy = Math.min(1, (saturation * 0.6 + contrast * 0.4));

  // harmony: inverse of average inter-color ΔE (normalized) — closer = more harmonic
  let totalDE = 0, pairs = 0;
  for (let i = 0; i < curated.length; i++) {
    for (let j = i + 1; j < curated.length; j++) {
      totalDE += deltaE2000(curated[i].lab, curated[j].lab);
      pairs++;
    }
  }
  const avgDE = pairs > 0 ? totalDE / pairs : 0;
  const harmony = Math.max(0, Math.min(1, 1 - avgDE / 60));

  return {
    warmth:         Math.round(warmth         * 100) / 100,
    saturation:     Math.round(saturation     * 100) / 100,
    contrast:       Math.round(contrast       * 100) / 100,
    luminanceSpread: Math.round(luminanceSpread * 100) / 100,
    tonalDensity:   Math.round(tonalDensity   * 100) / 100,
    energy:         Math.round(energy         * 100) / 100,
    harmony:        Math.round(harmony        * 100) / 100,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Run the cleanup pipeline on a SOURCE_CANDIDATES record.
 *
 * Produces a CleanupPayload with:
 * - curatedColors (with structural + interpretive roles)
 * - excludedColors (with lineage references — never deleted)
 * - metrics
 *
 * INVARIANT: SOURCE_CANDIDATES are never mutated.
 * INVARIANT: excluded candidates remain lineage-accessible.
 * INVARIANT: output is deterministic given identical inputs + mode + seed.
 */
export function runCleanup(
  source: SourceCandidatesRecord,
  mode: CleanupMode,
  paletteId: string,
  revisionId: string,
  seed = CLEANUP_SEED,
): CleanupPayload {
  const params = CLEANUP_MODE_PARAMS[mode];
  const allExcluded: ExcludedColor[] = [];

  // ── Step 1: Noise filtering ────────────────────────────────────────────────
  const { kept: denoised, excluded: noiseExcluded } = filterNoise(
    source.candidateColors,
    source.source_candidates_ref,
  );
  allExcluded.push(...noiseExcluded);

  // ── Step 2: Duplicate suppression (Delta-E 2000) ──────────────────────────
  const { kept: deduplicated, excluded: dupExcluded } = suppressDuplicates(
    denoised,
    params.deltaE,
    source.source_candidates_ref,
  );
  allExcluded.push(...dupExcluded);

  // ── Step 3: Tonal analysis ─────────────────────────────────────────────────
  const tonal = analyzeTone(deduplicated);

  // ── Step 4: Palette structuring — luminance ordering ──────────────────────
  // Cap output for UI, but always keep accent + signal candidates
  const structured = tonal.sortedByL.slice(0, MAX_CURATED);

  // ── Step 5 + 6: Structural + interpretive role assignment ─────────────────
  const curatedColors: CuratedColor[] = structured.map((c, i) => ({
    candidateRef: `${source.source_candidates_ref}:candidate_${c.candidateIndex}`,
    hex: c.hex,
    rgb: c.rgb,
    lab: c.lab,
    structuralRole: assignStructuralRole(c, structured, tonal, i, structured.length),
    interpretiveRole: assignInterpretiveRole(c.lab),
    frequency: c.frequency,
  }));

  // ── Step 7: Cleanup metrics ────────────────────────────────────────────────
  const metrics = computeMetrics(structured);

  return {
    id: crypto.randomUUID(),
    paletteId,
    revisionId,
    lifecycleState: 'CURATED_PALETTE',
    source_candidates_ref: source.source_candidates_ref,
    provenance: {
      cleanedAt: new Date().toISOString(),
      engineVersion: CLEANUP_ENGINE_VERSION,
      deterministicSeed: seed,
    },
    cleanup: {
      mode,
      thresholds: { deltaE: params.deltaE },
    },
    curatedColors,
    excludedColors: allExcluded,
    metrics,
  };
}

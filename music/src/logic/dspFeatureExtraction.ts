// DSP feature extraction (0708_MUSIC_DSPFeatureExtractionForMoodAnalyzer_v1.0.1)
// Lightweight browser-based audio analysis: RMS, ZCR, spectral centroid/rolloff/bandwidth.
// No ML, no heavy deps — uses Web Audio API decode + manual frame analysis.

import type { Track, TrackAudioAnalysis } from "../data/trackTypes";
import type { AudioAnalysisInput } from "../data/audioDetectionTypes";
import { analyzeTrackMood } from "./trackMoodAnalysis";
import { isValidCamelotKey } from "./camelot";
import { decodeAudioAnalysisInput, resolveAudioUrl, resolveAudioUrlSource } from "./audioAnalysisInput";
import { magnitudeSpectrum } from "./fft";
import { detectBpm, BPM_DETECTOR_VERSION } from "./bpmDetection";
import { detectKey, KEY_DETECTOR_VERSION } from "./keyDetection";
import { computeTrackBeatMap } from "./beatMap/computeTrackBeatMap";
import { computeTrackPlaybackBounds } from "./playbackBounds/computeTrackPlaybackBounds";

// ── Options ───────────────────────────────────────────────────────────────────

export interface DspExtractionOptions {
  maxDurationSec?: number;      // default 120 — analyze first 2 min only
  frameSize?: number;           // default 2048 samples
  hopSize?: number;             // default 1024 samples
  channelMode?: "mono" | "left" | "right";
}

export interface AnalyzeTrackDspOptions extends DspExtractionOptions {
  runMoodAnalysis?: boolean;    // default true
  forceMoodAnalysis?: boolean;  // default true after DSP update
}

const DEFAULTS: Required<DspExtractionOptions> = {
  maxDurationSec: 120,
  frameSize: 2048,
  hopSize: 1024,
  channelMode: "mono",
};

// Single source of truth for "current" vs "stale" DSP analysis (0712_MUSIC_
// Catalog_Analysis_Orchestration §10.1 Stale). Bump this if the extraction
// algorithm changes in a way that should trigger reprocessing.
export const CURRENT_DSP_ANALYSIS_VERSION = "dsp-v1.0.1";

// 0712_MUSIC_BPM_Key_Persistence_Repair §5.1 — canonical BPM validity check.
// This DSP pipeline does not detect real tempo (no beat-tracking algorithm
// exists here — see requiresCanonicalAnalysis below); this validator exists so
// any bpm value already on a Track (from CSV/metadata import) can be checked
// before being trusted as real, rather than accepting a placeholder like 0.
export function isValidBpm(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 40 &&
    value <= 240
  );
}

// ── Feature extraction ────────────────────────────────────────────────────────

function clamp(v: number, lo = 0, hi = 1): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Pure computation over an already-decoded AudioAnalysisInput — no fetch, no
 * decode. Shared by extractDspFeatures (below, for back-compat callers that
 * still pass a Track) and analyzeTrackDspFeatures, which decodes once and
 * feeds the same input to this, the BPM detector, and the key detector
 * (0712_MUSIC_BPM_Key_Detection_Engine §5 "decode once per analysis run").
 */
export function computeDspFeaturesFromInput(
  input: AudioAnalysisInput,
  options?: DspExtractionOptions,
): { audioAnalysis: TrackAudioAnalysis | null; warnings: string[] } {
  const opts = { ...DEFAULTS, ...options };
  const warnings: string[] = [];

  const sampleRate = input.sampleRate;
  const samples = input.mono;
  const numberOfChannels = input.channels.length;

  const { frameSize, hopSize } = opts;
  const fftSize = frameSize; // must be power of 2; frameSize default 2048 is fine

  const rmsValues: number[] = [];
  const zcrValues: number[] = [];
  const centroidValues: number[] = [];
  const rolloffValues: number[] = [];
  const bandwidthValues: number[] = [];

  const binHz = sampleRate / fftSize;

  for (let start = 0; start + frameSize <= samples.length; start += hopSize) {
    const frame = samples.subarray(start, start + frameSize);

    // RMS
    let sumSq = 0;
    for (let i = 0; i < frame.length; i++) sumSq += frame[i] * frame[i];
    const rms = Math.sqrt(sumSq / frame.length);
    rmsValues.push(rms);

    // ZCR
    let crossings = 0;
    for (let i = 1; i < frame.length; i++) {
      if ((frame[i] >= 0) !== (frame[i - 1] >= 0)) crossings++;
    }
    zcrValues.push(crossings / frame.length);

    // Spectral features via FFT
    const mags = magnitudeSpectrum(frame, fftSize);
    const half = mags.length;

    let totalMag = 0;
    let weightedFreqSum = 0;
    for (let k = 0; k < half; k++) {
      const freq = k * binHz;
      totalMag += mags[k];
      weightedFreqSum += freq * mags[k];
    }

    if (totalMag > 0) {
      // Centroid
      const centroid = weightedFreqSum / totalMag;
      centroidValues.push(centroid);

      // Rolloff (85% energy)
      let cum = 0;
      const threshold = totalMag * 0.85;
      let rolloff = 0;
      for (let k = 0; k < half; k++) {
        cum += mags[k];
        if (cum >= threshold) { rolloff = k * binHz; break; }
      }
      rolloffValues.push(rolloff);

      // Bandwidth
      let bwSum = 0;
      for (let k = 0; k < half; k++) {
        const diff = k * binHz - centroid;
        bwSum += mags[k] * diff * diff;
      }
      bandwidthValues.push(Math.sqrt(bwSum / totalMag));
    }
  }

  if (rmsValues.length === 0) {
    warnings.push("no frames extracted — audio may be too short");
    return { audioAnalysis: null, warnings };
  }

  const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;

  const rmsMean = mean(rmsValues);
  const rmsEnergy = clamp(rmsMean * 4, 0, 1);
  const meanZcr = mean(zcrValues);
  const zeroCrossingRate = clamp(meanZcr * 8, 0, 1);

  const spectralCentroid = centroidValues.length ? mean(centroidValues) : null;
  const spectralCentroidNorm = spectralCentroid != null
    ? clamp((spectralCentroid - 500) / 5500)
    : null;

  const spectralRolloff = rolloffValues.length ? mean(rolloffValues) : null;
  const spectralRolloffNorm = spectralRolloff != null
    ? clamp((spectralRolloff - 1000) / 9000)
    : null;

  const spectralBandwidth = bandwidthValues.length ? mean(bandwidthValues) : null;
  const spectralBandwidthNorm = spectralBandwidth != null
    ? clamp((spectralBandwidth - 500) / 6000)
    : null;

  // Onset density via energy deltas
  let onsetCount = 0;
  if (rmsValues.length > 1) {
    const energyMean = rmsMean;
    const adaptiveThreshold = energyMean * 0.3;
    for (let i = 1; i < rmsValues.length; i++) {
      const delta = Math.max(0, rmsValues[i] - rmsValues[i - 1]);
      if (delta > adaptiveThreshold) onsetCount++;
    }
  }
  const durationSec = samples.length / sampleRate;
  const rawOnsetDensity = onsetCount / Math.max(1, durationSec);
  const onsetDensityNorm = clamp(rawOnsetDensity / 10);

  // Mechanism tag candidates
  const mechCandidates: string[] = [];
  if (zeroCrossingRate > 0.6 && (spectralBandwidthNorm ?? 0) > 0.6) mechCandidates.push("raw-texture");
  if (onsetDensityNorm > 0.6 && zeroCrossingRate > 0.5)              mechCandidates.push("percussive-fragments");
  if ((spectralBandwidthNorm ?? 0) > 0.6 && rmsEnergy < 0.35)        mechCandidates.push("ambient-wash");
  if (rmsEnergy > 0.65 && (spectralCentroidNorm ?? 0.5) < 0.35)      mechCandidates.push("sub-bass-pressure");

  const audioAnalysis: TrackAudioAnalysis = {
    ...({} as TrackAudioAnalysis), // merge guard — caller merges with existing
    rmsMean: +rmsMean.toFixed(4),
    rmsEnergy: +rmsEnergy.toFixed(4),
    zeroCrossingRate: +zeroCrossingRate.toFixed(4),
    zeroCrossingRateRaw: +meanZcr.toFixed(6),
    onsetDensity: +onsetDensityNorm.toFixed(4),
    onsetDensityRaw: +rawOnsetDensity.toFixed(4),
    brightness: spectralCentroidNorm != null ? +spectralCentroidNorm.toFixed(4) : undefined,
    ...(spectralCentroid     != null && { spectralCentroid:     +spectralCentroid.toFixed(2) }),
    ...(spectralCentroidNorm != null && { spectralCentroidNorm: +spectralCentroidNorm.toFixed(4) }),
    ...(spectralRolloff      != null && { spectralRolloff:      +spectralRolloff.toFixed(2) }),
    ...(spectralRolloffNorm  != null && { spectralRolloffNorm:  +spectralRolloffNorm.toFixed(4) }),
    ...(spectralBandwidth    != null && { spectralBandwidth:    +spectralBandwidth.toFixed(2) }),
    ...(spectralBandwidthNorm != null && { spectralBandwidthNorm: +spectralBandwidthNorm.toFixed(4) }),
    sampleRate,
    channels: numberOfChannels,
    analyzedAt: new Date().toISOString(),
    analysisVersion: CURRENT_DSP_ANALYSIS_VERSION,
    warnings: warnings.length ? warnings : undefined,
  };

  console.debug(
    `[DSP] rawZcr=${meanZcr.toFixed(4)} zeroCrossingRate=${zeroCrossingRate.toFixed(4)}` +
    ` rawOnsetDensity=${rawOnsetDensity.toFixed(2)} onsetDensity=${onsetDensityNorm.toFixed(4)}`,
  );

  return { audioAnalysis, warnings: [...warnings, ...(mechCandidates.length ? [`mechanism candidates: ${mechCandidates.join(", ")}`] : [])] };
}

/**
 * Back-compat wrapper for callers (debug API, older call sites) that still
 * want "decode + extract" from a Track in one call. The canonical orchestrator
 * (analyzeTrackDspFeatures below) decodes once and calls
 * computeDspFeaturesFromInput directly instead, so it can share the same
 * decode with the BPM/key detectors.
 */
export async function extractDspFeatures(
  track: Track,
  options?: DspExtractionOptions,
): Promise<{ audioAnalysis: TrackAudioAnalysis | null; warnings: string[] }> {
  const warnings: string[] = [];
  let input: AudioAnalysisInput;
  try {
    input = await decodeAudioAnalysisInput(track, options);
  } catch (e) {
    const msg = String(e);
    if (msg.startsWith("Error: DSP_HTTP_")) throw e; // re-throw HTTP errors for batch to classify
    warnings.push(msg.includes("AUDIO_DECODE_FAILED") ? `audio decode failed: ${msg}` : `audio fetch failed (network): ${msg}`);
    return { audioAnalysis: null, warnings };
  }
  const result = computeDspFeaturesFromInput(input, options);
  return { audioAnalysis: result.audioAnalysis, warnings: [...warnings, ...result.warnings] };
}

// ── Track-level DSP + mood re-analysis ───────────────────────────────────────

// Metadata precedence (0712_MUSIC_BPM_Key_Detector_Calibration §17/§18).
// Three tiers, not a boolean:
//   trusted        — manual/embedded/csv-sourced. Never touched by detection.
//   legacy_unknown — a plausible value with NO source stamped at all (predates
//                    provenance tracking). Might be genuine CSV data, might be
//                    the historic fabricated "1A"/"0" default — we don't know,
//                    so it's neither fully trusted nor discarded. A confident
//                    new detection MAY replace it; a low-confidence one may not.
//   replaceable    — already "detected", or genuinely missing. Ordinary
//                    reanalysis rules apply.
type BpmKeyTrustTier = "trusted" | "legacy_unknown" | "replaceable";

function classifyBpmTrust(track: Track): BpmKeyTrustTier {
  if (track.bpmSource === "manual" || track.bpmSource === "embedded_metadata" || track.bpmSource === "csv_metadata") return "trusted";
  if (track.bpmSource === "legacy_unknown") return "legacy_unknown";
  if (track.bpmSource == null && isValidBpm(track.bpm)) return "legacy_unknown";
  return "replaceable";
}

function classifyKeyTrust(track: Track): BpmKeyTrustTier {
  if (track.keySource === "manual" || track.keySource === "embedded_metadata" || track.keySource === "csv_metadata") return "trusted";
  if (track.keySource === "legacy_unknown") return "legacy_unknown";
  // Special-cased in the calibration spec, but handled by the SAME general
  // rule as any other unstamped value — "1A" is not assumed fabricated
  // merely for being "1A"; it's simply unprovenanced like anything else here.
  if (track.keySource == null && isValidCamelotKey(track.camelotKey)) return "legacy_unknown";
  return "replaceable";
}

// Per-field trust checks (0712_MUSIC_BPM_Key_Detector_Calibration §21) —
// shared by the Complete/Partial demotion below AND by Playlist Analyzer
// Review's trust gating, so both surfaces agree on what "trustworthy enough
// to use" means. A value only counts here when it is format-valid AND
// carries a provenance better than legacy_unknown/unknown AND (for bpm)
// isn't flagged with an unresolved half/double-time ambiguity, or (for key)
// isn't flagged with an unresolved major/minor mode ambiguity.
export function isBpmTrustedForAnalysis(track: Track): boolean {
  const sourceOk = track.bpmSource === "manual" || track.bpmSource === "embedded_metadata"
    || track.bpmSource === "csv_metadata" || track.bpmSource === "detected";
  return isValidBpm(track.bpm) && sourceOk && !(track.audioAnalysis?.bpmWarningCodes?.includes("BPM_HALF_DOUBLE_AMBIGUITY"));
}

export function isKeyTrustedForAnalysis(track: Track): boolean {
  const sourceOk = track.keySource === "manual" || track.keySource === "embedded_metadata"
    || track.keySource === "csv_metadata" || track.keySource === "detected";
  return isValidCamelotKey(track.camelotKey) && sourceOk && !(track.audioAnalysis?.keyWarningCodes?.includes("KEY_MODE_AMBIGUITY"));
}

/** Combined Complete-eligibility check — both bpm and key must pass. */
export function isBpmKeyTrustedComplete(track: Track): boolean {
  return isBpmTrustedForAnalysis(track) && isKeyTrustedForAnalysis(track);
}

export async function analyzeTrackDspFeatures(
  track: Track,
  options?: AnalyzeTrackDspOptions,
): Promise<Track> {
  const { runMoodAnalysis = true, forceMoodAnalysis = true, ...dspOpts } = options ?? {};

  let input: AudioAnalysisInput;
  try {
    input = await decodeAudioAnalysisInput(track, dspOpts);
  } catch (e) {
    const msg = String(e);
    if (msg.startsWith("Error: DSP_HTTP_")) throw e; // re-throw for batch classification
    // 0712_MUSIC_Catalog_Analysis_Orchestration: a failed attempt must be
    // visible, not silently returned unchanged — otherwise a track stuck on
    // its import-time placeholder status looks identical to one that was
    // actually attempted and failed. Previous valid audioAnalysis (if any)
    // is preserved, per "do not clear previous valid analysis unless
    // replacement succeeds".
    return {
      ...track,
      analysisStatus: "failed" as const,
      analysisUpdatedAt: new Date().toISOString(),
      analysisWarnings: [msg],
    };
  }

  const { audioAnalysis, warnings } = computeDspFeaturesFromInput(input, dspOpts);
  if (!audioAnalysis) {
    return {
      ...track,
      analysisStatus: "failed" as const,
      analysisUpdatedAt: new Date().toISOString(),
      analysisWarnings: warnings,
    };
  }

  // BPM + key detection off the SAME decoded input — no second decode
  // (0712_MUSIC_BPM_Key_Detection_Engine §3/§5).
  const bpmResult = detectBpm(input);
  const keyResult = detectKey(input);

  const bpmTrust = classifyBpmTrust(track);
  const keyTrust = classifyKeyTrust(track);

  // §18 rules: trusted values are never touched. legacy_unknown values only
  // move when the new detection is itself confident (bpmResult.bpm/
  // camelotKey are already undefined below the detector's own confidence
  // threshold, so "produced a value" already implies "passed threshold").
  // Diagnostic fields (confidence breakdown, alternates, warnings) update for
  // both legacy_unknown and replaceable tiers — they're informational and
  // safe to refresh even on a run that doesn't touch the canonical value.
  const bpmDiagnosticsUpdate = bpmTrust !== "trusted";
  const keyDiagnosticsUpdate = keyTrust !== "trusted";
  const bpmValueMayReplace = bpmTrust === "replaceable" || (bpmTrust === "legacy_unknown" && bpmResult.bpm != null);
  const keyValueMayReplace = keyTrust === "replaceable" || (keyTrust === "legacy_unknown" && keyResult.camelotKey != null);

  const mergedAnalysis: TrackAudioAnalysis = {
    ...(track.audioAnalysis ?? {}),
    ...audioAnalysis,
    bpmDetectorVersion: BPM_DETECTOR_VERSION,
    keyDetectorVersion: KEY_DETECTOR_VERSION,
    ...(bpmDiagnosticsUpdate && {
      actualBpm: bpmResult.bpm,
      bpmConfidence: bpmResult.confidenceDetail.overallConfidence,
      bpmConfidenceDetail: bpmResult.confidenceDetail,
      halfTimeCandidate: bpmResult.halfTimeCandidate,
      doubleTimeCandidate: bpmResult.doubleTimeCandidate,
      beatPeriodSeconds: bpmResult.beatPeriodSeconds,
      bpmWarningCodes: bpmResult.warningCodes.length ? bpmResult.warningCodes : undefined,
    }),
    ...(keyDiagnosticsUpdate && {
      actualKey: keyResult.tonic && keyResult.mode ? `${keyResult.tonic} ${keyResult.mode}` : undefined,
      tonic: keyResult.tonic,
      mode: keyResult.mode,
      camelot: keyResult.camelotKey,
      keyConfidence: keyResult.confidenceDetail.overallConfidence,
      keyConfidenceDetail: keyResult.confidenceDetail,
      alternateKeyCandidates: keyResult.alternateCandidates.length ? keyResult.alternateCandidates : undefined,
      keyWarningCodes: keyResult.warningCodes.length ? keyResult.warningCodes : undefined,
    }),
  };

  const detectionWarnings = [...warnings, ...bpmResult.warningCodes, ...keyResult.warningCodes];

  // Extract mechanism candidates from warnings
  const mechLine = warnings.find((w) => w.startsWith("mechanism candidates:"));
  const suggestedMechanismTags = mechLine
    ? mechLine.replace("mechanism candidates: ", "").split(", ")
    : track.suggestedMechanismTags;

  // Beat map (0713_MUSIC_Track_Beat_Map_Foundation §16) — consumes the SAME
  // decoded `input` and `bpmResult` above; no second decode, no independent
  // tempo re-derivation.
  const beatMap = computeTrackBeatMap(input, bpmResult);

  // Playback bounds (0714_MUSIC_Track_Playback_Bounds §20) — decode once →
  // BPM → key → energy/mood → beat map → playback bounds → persistence.
  // Reuses the same decoded `input` and the beat map just computed above
  // (intro/outro region, trusted downbeat/last-beat evidence) — no second
  // decode, no duplicated intro/outro detection.
  const pathHint = track.audioRelPath ?? track.filePath ?? track.trackId;
  const playbackBounds = computeTrackPlaybackBounds(input, pathHint, beatMap, track.playbackBounds);

  const withDsp: Track = {
    ...track,
    audioAnalysis: mergedAnalysis,
    ...(beatMap && { beatMap }),
    playbackBounds,
    ...(suggestedMechanismTags && { suggestedMechanismTags }),
    // rmsEnergy is the canonical measured energy once DSP has actually run —
    // propagate it to the top-level `energy` field, which is what scoring,
    // mood analysis, and every "E" column in the UI actually read. Without
    // this, DSP analysis could "succeed" while energy stayed frozen at its
    // import-time placeholder (0).
    energy: mergedAnalysis.rmsEnergy ?? track.energy,
    // Canonical bpm/camelotKey move only per the trust tier above — a
    // low-confidence/failed detection never clobbers a prior valid value,
    // and a legacy_unknown value only yields to a CONFIDENT new detection.
    ...(bpmValueMayReplace && bpmResult.bpm != null && { bpm: bpmResult.bpm, bpmSource: "detected" as const }),
    ...(!bpmValueMayReplace && bpmTrust === "legacy_unknown" && track.bpmSource == null && { bpmSource: "legacy_unknown" as const }),
    ...(keyValueMayReplace && keyResult.camelotKey != null && { camelotKey: keyResult.camelotKey as Track["camelotKey"], keySource: "detected" as const }),
    ...(!keyValueMayReplace && keyTrust === "legacy_unknown" && track.keySource == null && { keySource: "legacy_unknown" as const }),
    analysisStatus: "partial" as const,
    analysisVersion: CURRENT_DSP_ANALYSIS_VERSION,
    analysisUpdatedAt: new Date().toISOString(),
    analysisWarnings: detectionWarnings.length ? detectionWarnings : undefined,
  };

  if (!runMoodAnalysis) return withDsp;
  const { track: analyzed } = analyzeTrackMood(withDsp, { force: forceMoodAnalysis });

  // 0712_MUSIC_BPM_Key_Detector_Calibration §19 — mood-confidence alone must
  // not count as "Complete". Demote an otherwise-"analyzed" result to
  // "partial" (without touching analyzeTrackMood's own confidence logic)
  // whenever BPM or key isn't both valid AND resolved with a trustworthy
  // provenance — i.e. not `legacy_unknown`, and not carrying an unresolved
  // half/double-time or major/minor-mode ambiguity flag.
  if (analyzed.analysisStatus === "analyzed" && !isBpmKeyTrustedComplete(analyzed)) {
    return { ...analyzed, analysisStatus: "partial" as const };
  }
  return analyzed;
}

// ── Batch DSP analysis ────────────────────────────────────────────────────────

// Canonical "does this track require analysis" predicate (0712_MUSIC_Catalog_
// Analysis_Orchestration §7) — the single source of truth for "missing DSP",
// used by the batch runner below, the Analyzer Review UI, and the "Analyze
// All Missing" action. Distinguishes canonical persisted DSP from a stale
// version, a failed attempt, or no attempt at all — not just `bpm === 0`,
// since legitimate audio can fail BPM/key detection while still having valid
// DSP/energy data.
export function requiresCanonicalAnalysis(track: Track): boolean {
  if (track.analysisStatus === "failed" || track.analysisStatus === "stale") return true;
  const aa = track.audioAnalysis;
  if (!aa) return true;
  const hasBrightness = aa.brightness != null || aa.spectralCentroid != null || aa.spectralCentroidNorm != null;
  const hasBandwidth  = aa.spectralBandwidth != null || aa.spectralBandwidthNorm != null || aa.spectralRolloff != null;
  const hasTexture    = aa.zeroCrossingRate != null;
  const hasRms        = aa.rmsEnergy != null || aa.rmsMean != null;
  if (!hasBrightness || !hasBandwidth || !hasTexture || !hasRms) return true;
  if (aa.analysisVersion !== CURRENT_DSP_ANALYSIS_VERSION) return true;
  // 0712_MUSIC_BPM_Key_Detection_Engine §10 — the predicate must also catch
  // "detector never ran" and "detector version outdated" for BPM/key,
  // independent of whether DSP itself is current. A trusted (manual/CSV)
  // bpm/key still gets the version marker stamped on every run (see
  // analyzeTrackDspFeatures), so this doesn't force endless reanalysis of
  // tracks whose canonical value is intentionally left untouched.
  if (aa.bpmDetectorVersion !== BPM_DETECTOR_VERSION) return true;
  if (aa.keyDetectorVersion !== KEY_DETECTOR_VERSION) return true;
  return false;
}

// Back-compat alias for existing internal callers in this file.
const needsDsp = requiresCanonicalAnalysis;

// Detect reference/external tracks that should be skipped in mood DSP runs.
// Checks multiple possible source-kind fields before falling back to title hints.
function isReferenceTrack(track: Track): boolean {
  const r = track as Record<string, unknown>;
  const kindFields = [
    r.sourceKind, r.sourceType, r.source, r.kind,
    r.libraryKind, r.category, track.sourceOwner,
  ];
  for (const v of kindFields) {
    if (typeof v === "string") {
      const lv = v.toLowerCase();
      if (lv === "reference" || lv === "ref" || lv === "external") return true;
    }
  }
  // tag array fallback
  const tags = r.tags;
  if (Array.isArray(tags) && tags.some((t: unknown) => typeof t === "string" && t.toLowerCase() === "reference")) return true;
  return false;
}

// Flexible batch arg — number | "all" | options object
export type AnalyzeMissingDspDebugArg =
  | number
  | "all"
  | {
      limit?: number | "all";
      offset?: number;
      skipReference?: boolean;
      sourceKinds?: string[];
      perTrackTimeoutMs?: number;
      maxRuntimeMs?: number;
      progress?: boolean;
    };

function parseBatchArg(arg: AnalyzeMissingDspDebugArg): {
  limit: number | "all";
  offset: number;
  skipReference: boolean;
  sourceKinds: string[] | null;
  perTrackTimeoutMs: number;
  maxRuntimeMs: number;
  progress: boolean;
} {
  if (typeof arg === "number") return { limit: arg, offset: 0, skipReference: false, sourceKinds: null, perTrackTimeoutMs: 30000, maxRuntimeMs: 120000, progress: false };
  if (arg === "all") return { limit: "all", offset: 0, skipReference: false, sourceKinds: null, perTrackTimeoutMs: 30000, maxRuntimeMs: 120000, progress: false };
  return {
    limit: arg.limit ?? 10,
    offset: arg.offset ?? 0,
    skipReference: arg.skipReference ?? false,
    sourceKinds: arg.sourceKinds ?? null,
    perTrackTimeoutMs: arg.perTrackTimeoutMs ?? 30000,
    maxRuntimeMs: arg.maxRuntimeMs ?? 120000,
    progress: arg.progress ?? false,
  };
}

export interface DspBatchFailedTrack {
  id: string;
  title: string;
  reason: "decode_timeout" | "media_404" | "extraction_failed";
  detail?: string;
}

export async function analyzeMissingDspFeatures(
  tracks: Track[],
  arg: AnalyzeMissingDspDebugArg = 10,
  dspOpts?: AnalyzeTrackDspOptions,
): Promise<{
  tracks: Track[];
  analyzed: number;
  skipped: number;
  skippedAlreadyHasDsp: number;
  skippedNoAudioSource: number;
  skippedMedia404: number;
  failed: number;
  stoppedEarly: boolean;
  stopReason?: string;
  lastTrack?: { id: string; title: string };
  failedTracks: DspBatchFailedTrack[];
  warnings: string[];
  warningSummary: Record<string, number>;
}> {
  const { limit, offset, skipReference, sourceKinds, perTrackTimeoutMs, maxRuntimeMs, progress } = parseBatchArg(arg);

  // Break skip reasons down explicitly before slicing
  const alreadyDone = tracks.filter((t) => !needsDsp(t));
  let needsDspTracks = tracks.filter(needsDsp);
  if (skipReference) needsDspTracks = needsDspTracks.filter((t) => !isReferenceTrack(t));
  if (sourceKinds) {
    needsDspTracks = needsDspTracks.filter((t) => {
      const r = t as Record<string, unknown>;
      const kind = String(r.sourceKind ?? r.sourceType ?? r.kind ?? t.sourceOwner ?? "").toLowerCase();
      return sourceKinds.some((k) => k.toLowerCase() === kind);
    });
  }
  const withSource = needsDspTracks.filter((t) => resolveAudioUrl(t) != null);
  const noSource   = needsDspTracks.filter((t) => resolveAudioUrl(t) == null);

  const totalCandidates = withSource.length;
  const afterOffset = withSource.slice(offset);
  const slice = limit === "all" ? afterOffset : afterOffset.slice(0, limit as number);

  const allWarnings: string[] = [];
  const failedTracks: DspBatchFailedTrack[] = [];
  let analyzed = 0;
  let media404 = 0;
  let failed = 0;
  let stoppedEarly = false;
  let stopReason: string | undefined;
  let lastTrack: { id: string; title: string } | undefined;

  const batchStart = Date.now();
  const resultMap = new Map<string, Track>();

  for (let i = 0; i < slice.length; i++) {
    const t = slice[i];
    lastTrack = { id: t.trackId, title: t.title ?? t.trackId };

    // Full-batch runtime guard
    if (Date.now() - batchStart > maxRuntimeMs) {
      stoppedEarly = true;
      stopReason = `maxRuntimeMs=${maxRuntimeMs} exceeded after ${i} tracks`;
      console.warn(`[DSP batch] stopped early: ${stopReason}`);
      break;
    }

    await new Promise(requestAnimationFrame);

    if (progress) {
      console.debug(`[DSP batch] index=${i + 1}/${slice.length} id=${t.trackId} title="${t.title ?? ""}"`);
    }

    try {
      // Per-track timeout: race extraction against a rejection timer
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("DSP_TIMEOUT")), perTrackTimeoutMs),
      );
      const updated = await Promise.race([analyzeTrackDspFeatures(t, dspOpts), timeoutPromise]);
      resultMap.set(t.trackId, updated);
      analyzed++;
      if (progress) console.debug(`[DSP batch] index=${i + 1} ✓ analyzed`);
    } catch (e) {
      const msg = String(e);
      if (msg.includes("DSP_TIMEOUT")) {
        failed++;
        failedTracks.push({ id: t.trackId, title: t.title ?? t.trackId, reason: "decode_timeout" });
        allWarnings.push(`[${t.title ?? t.trackId}] decode_timeout after ${perTrackTimeoutMs}ms`);
        console.warn(`[DSP batch] index=${i + 1} ✗ timeout (${perTrackTimeoutMs}ms): ${t.title ?? t.trackId}`);
      } else if (msg.includes("DSP_HTTP_404")) {
        media404++;
        failedTracks.push({ id: t.trackId, title: t.title ?? t.trackId, reason: "media_404", detail: resolveAudioUrl(t) ?? undefined });
        allWarnings.push(`[${t.title ?? t.trackId}] media_404: ${resolveAudioUrl(t)}`);
        if (progress) console.debug(`[DSP batch] index=${i + 1} ✗ 404`);
      } else {
        failed++;
        failedTracks.push({ id: t.trackId, title: t.title ?? t.trackId, reason: "extraction_failed", detail: msg });
        allWarnings.push(`[${t.title ?? t.trackId}] extraction failed: ${msg}`);
        console.warn(`[DSP batch] index=${i + 1} ✗ failed: ${msg}`);
      }
    }
  }

  const skippedAlreadyHasDsp = alreadyDone.length;
  const skippedNoAudioSource  = noSource.length;
  const skippedMedia404       = media404;
  const skipped = skippedAlreadyHasDsp + skippedNoAudioSource + skippedMedia404;

  const updatedTracks = tracks.map((t) => resultMap.get(t.trackId) ?? t);

  const warningSummary: Record<string, number> = {};
  if (skippedAlreadyHasDsp) warningSummary["already_has_dsp"]   = skippedAlreadyHasDsp;
  if (skippedNoAudioSource)  warningSummary["no_audio_source"]   = skippedNoAudioSource;
  if (skippedMedia404)       warningSummary["media_404"]         = skippedMedia404;
  const timeouts = failedTracks.filter((f) => f.reason === "decode_timeout").length;
  const otherFailed = failedTracks.filter((f) => f.reason === "extraction_failed").length;
  if (timeouts)    warningSummary["decode_timeout"]  = timeouts;
  if (otherFailed) warningSummary["other_failed"]    = otherFailed;

  const elapsed = ((Date.now() - batchStart) / 1000).toFixed(1);
  console.info(
    `[analyzeMissingDspFeatures] candidates=${totalCandidates} offset=${offset} limit=${limit} ` +
    `analyzed=${analyzed} skipped=${skipped} ` +
    `(alreadyDsp=${skippedAlreadyHasDsp} noSource=${skippedNoAudioSource} media404=${skippedMedia404}) ` +
    `failed=${failed} stoppedEarly=${stoppedEarly} elapsed=${elapsed}s`,
  );
  if (Object.keys(warningSummary).length) console.table(warningSummary);

  return {
    tracks: updatedTracks,
    analyzed, skipped, skippedAlreadyHasDsp, skippedNoAudioSource, skippedMedia404, failed,
    stoppedEarly, stopReason, lastTrack, failedTracks,
    warnings: allWarnings, warningSummary,
  };
}

// ── Audio source audit ────────────────────────────────────────────────────────

export interface DspAudioSourceAuditEntry {
  id: string;
  title: string;
  audioRelPath: string | undefined;
  filePath: string | undefined;
  objectUrl: string | undefined;
  audioUrl: string | undefined;
  resolvedUrl: string | null;
  urlSource: "objectUrl" | "audioUrl" | "audioRelPath" | "filePath" | "path" | null;
  existsStatus: "ok" | "404" | "error" | "no_url";
}

export async function auditDspAudioSources(
  tracks: Track[],
  opts: { limit?: number; offset?: number; skipReference?: boolean } = {},
): Promise<DspAudioSourceAuditEntry[]> {
  const { limit = 20, offset = 0, skipReference = false } = opts;
  let pool = tracks.filter(needsDsp);
  if (skipReference) pool = pool.filter((t) => !isReferenceTrack(t));
  const slice = pool.slice(offset, offset + limit);

  const results: DspAudioSourceAuditEntry[] = [];
  for (const t of slice) {
    const r = t as Record<string, unknown>;
    const resolvedUrl = resolveAudioUrl(t);
    const urlSource = resolveAudioUrlSource(t);
    let existsStatus: DspAudioSourceAuditEntry["existsStatus"] = "no_url";
    if (resolvedUrl) {
      try {
        const resp = await fetch(resolvedUrl, { method: "HEAD" });
        existsStatus = resp.ok ? "ok" : resp.status === 404 ? "404" : "error";
      } catch {
        existsStatus = "error";
      }
    }
    results.push({
      id: t.trackId,
      title: t.title,
      audioRelPath: t.audioRelPath,
      filePath: t.filePath,
      objectUrl: t.objectUrl,
      audioUrl: typeof r.audioUrl === "string" ? r.audioUrl : undefined,
      resolvedUrl,
      urlSource,
      existsStatus,
    });
    await new Promise(requestAnimationFrame);
  }
  return results;
}

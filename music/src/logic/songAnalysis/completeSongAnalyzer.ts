// Complete Song Intelligence and Section Map (0717C) — the orchestrator.
// Composes existing authorities, never re-detects: BPM/key/beat-grid come
// straight from the already-analyzed Track (no detector re-run), structural
// segmentation reuses deriveStructuralSections (0715B) verbatim, mood
// suggestions reuse analyzeTrackMood directly. The only async/chunked/
// abortable/progress-reporting step is the numeric-profile computation
// (computeDspFeaturesChunked, dspFeatureExtraction.ts) — every other step
// here is fast, pure, and synchronous.

import type { Track } from "../../data/trackTypes";
import type { TrackSegment } from "../../data/loopTypes";
import type { AudioAnalysisInput } from "../../data/audioDetectionTypes";
import type { CompleteSongAnalysis, SongSection } from "../../data/songAnalysisTypes";
import { CURRENT_SONG_ANALYZER_VERSION, CURRENT_SONG_ANALYSIS_CONFIG_VERSION } from "../../data/songAnalysisTypes";
import { deriveStructuralSections } from "../loops/structuralSections";
import { mapStructuralBandsToSongSections } from "./songSectionMapper";
import { computeDspFeaturesChunked, type ChunkedDspProgress } from "../dspFeatureExtraction";
import { buildNumericProfile, buildDensityProfile, buildPercussiveProfile } from "./songNumericProfiles";
import { buildWaveformSummary } from "./songWaveformSummary";
import { suggestArrangementRoles } from "./songRoleSuggestion";
import { analyzeTrackMood } from "../trackMoodAnalysis";
import { computeSourceFingerprint } from "../playbackBounds/computeTrackPlaybackBounds";

function genSongSectionId(): string {
  return `songsec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function genSongAnalysisId(): string {
  return `songana_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export interface AnalyzeCompleteSongInput {
  track: Track;
  analysisInput: AudioAnalysisInput;
  segments: TrackSegment[];
  trustedBoundsStartFrame?: number;
  trustedBoundsEndFrame?: number;
  // Sections carried forward from a prior analysis that have an active
  // human revision or verification !== "provisional" — these are never
  // overwritten in place by a rerun (spec §4.5/§11); the fresh analyzer
  // output for those specific sections is returned via `previousSections`
  // as a comparison candidate instead.
  priorProtectedSections?: SongSection[];
  signal?: AbortSignal;
  onProgress?: (progress: ChunkedDspProgress) => void;
}

export async function analyzeCompleteSong(input: AnalyzeCompleteSongInput): Promise<CompleteSongAnalysis> {
  const { track, analysisInput, segments, trustedBoundsStartFrame, trustedBoundsEndFrame, priorProtectedSections, signal, onProgress } = input;
  const now = new Date().toISOString();

  // (a) BPM/key/beat-grid — reused directly from the Track's own already-
  // analyzed fields, never re-detected.
  const bpm = track.bpm;
  const musicalKey = track.camelotKey;
  const beatGridConfidence = track.beatMap?.confidence ?? track.beatMap?.tempoStabilityScore;

  // (b) Structural segmentation — deriveStructuralSections reused verbatim
  // (0715B), mapped into stable-id SongSection records.
  const decodedFrameCount = analysisInput.mono.length;
  const bands = deriveStructuralSections(segments, trustedBoundsStartFrame, trustedBoundsEndFrame, 0, decodedFrameCount);
  let sections = mapStructuralBandsToSongSections(bands, track.trackId, genSongSectionId);

  const previousSections: SongSection[] = [];
  if (priorProtectedSections && priorProtectedSections.length > 0) {
    // Whole-set protection, disclosed scope simplification: if the prior
    // analysis has ANY section with active human work (a revision, or
    // verification !== "provisional"), the entire prior section set is
    // kept untouched and the fresh analyzer output is exposed only as
    // `previousSections` (a comparison candidate) — never silently merged
    // in. Per-section selective merging (keep only the untouched ones,
    // update the rest) is not implemented in this build; a rerun on an
    // already-touched song is all-or-nothing at the section-SET level.
    previousSections.push(...sections);
    sections = priorProtectedSections;
  }

  // (c) Numeric profiles — the one async, chunked, abortable, progress-
  // reporting step.
  const dsp = await computeDspFeaturesChunked(analysisInput, { signal, onProgress });
  const durationSeconds = decodedFrameCount / analysisInput.sampleRate;
  const { rmsValues, zcrValues, centroidValues, bassEnergyValues, minValues, maxValues } = dsp.rawFrameSeries;

  const energyProfile = buildNumericProfile(rmsValues.map((v) => Math.max(0, Math.min(1, v * 4))), durationSeconds);
  const densityProfile = buildDensityProfile(rmsValues, durationSeconds);
  const brightnessProfile = buildNumericProfile(centroidValues.map((c) => Math.max(0, Math.min(1, (c - 500) / 5500))), durationSeconds);
  const bassWeightProfile = buildNumericProfile(bassEnergyValues, durationSeconds);
  const percussiveProfile = buildPercussiveProfile(rmsValues, zcrValues, durationSeconds);
  // 0717D — reduces the per-frame min/max arrays already produced inside
  // computeDspFeaturesChunked's own chunked/abortable loop; never a second
  // full-buffer scan of analysisInput.mono.
  const waveformSummary = buildWaveformSummary(minValues, maxValues);

  // (d) Role suggestions — ranked per structural section, pure heuristic.
  const suggestedRoles = sections.length > 0
    ? suggestArrangementRoles({
      startFrame: sections[0].startFrame,
      endFrame: sections[sections.length - 1].endFrame,
      totalFrames: decodedFrameCount,
      structuralType: sections[0].structuralType,
      energyProfile, densityProfile, percussiveProfile, brightnessProfile,
    })
    : undefined;

  // (e) Mood suggestions — analyzeTrackMood reused directly; a track that
  // already has confirmed moodTags/moodScores is skipped by that function
  // (returns an empty rankedScores) rather than force-recomputed here.
  const moodResult = analyzeTrackMood(track);
  const suggestedMoods = moodResult.rankedScores.length > 0 ? moodResult.rankedScores : undefined;

  const pathHint = track.audioRelPath ?? track.filePath ?? track.trackId;

  return {
    id: genSongAnalysisId(),
    sourceTrackId: track.trackId,
    sourceMediaFingerprint: computeSourceFingerprint(pathHint, durationSeconds),
    decodedFrameCount,
    sampleRate: analysisInput.sampleRate,
    analyzerVersion: CURRENT_SONG_ANALYZER_VERSION,
    configurationVersion: CURRENT_SONG_ANALYSIS_CONFIG_VERSION,
    status: "READY_PROVISIONAL",
    bpm, musicalKey, beatGridConfidence,
    sections,
    sectionRevisions: [],
    previousSections: previousSections.length > 0 ? previousSections : undefined,
    energyProfile, densityProfile, brightnessProfile, bassWeightProfile, percussiveProfile,
    waveformSummary,
    // Deliberately unset — see songAnalysisTypes.ts's doc comment.
    harmonicProfile: undefined,
    vocalPresenceProfile: undefined,
    suggestedRoles,
    suggestedMoods,
    createdAt: now,
    updatedAt: now,
  };
}

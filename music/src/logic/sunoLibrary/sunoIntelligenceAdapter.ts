// Suno → Common MUSIC Intelligence Adapter (Phase 2).
//
// Bridges a materialized Suno recording into the EXACT SAME analyzer
// Catalog/External tracks already use — analyzeTrackDspFeatures (BPM/key/
// energy/mood, which internally also runs analyzeTrackMood) and
// analyzeMechanicalMoods — completely unmodified. No second analyzer, no
// duplicated BPM/key/mood/mechanical-role logic exists anywhere in this
// file; every real computation happens inside the two imported functions.
//
// The bridge itself is a single ephemeral, NEVER-PERSISTED, NEVER-INSERTED-
// INTO-ANY-REAL-TRACK-ARRAY object satisfying the `Track` type's structural
// shape (Track's only required fields are trackId/title/artist/
// durationSeconds/energy/energySource — everything else is optional, so
// this needs no more than a handful of fields, confirmed by direct reading
// of trackTypes.ts before writing this). `sourceOwner: "unknown"` is used
// only because TypeScript requires SOME real TrackSourceOwner value — that
// value carries real behavioral meaning elsewhere in the app (crate
// eligibility, source filters), but none of that matters here because this
// object is discarded the moment this function returns; it is never
// assigned to libraryTracks or any other real collection. This deliberately
// avoids adding a `"suno"` TrackSourceOwner value or expanding Track
// authority — the narrowest seam that reuses the existing analyzer as-is.
//
// `objectUrl` (a real, typed Track field, first in resolveAudioUrl's
// resolution order) is reused to carry the Suno playback URL
// (`/suno-library-audio/<archiveAssetId>`) — resolveAudioUrl returns it
// verbatim and decodeAudioAnalysisInput just fetches whatever URL it's
// given, so this works even though the field's own doc comment describes it
// as "ephemeral blob URL" — a plain HTTP path fetches identically.

import type { Track } from "../../data/trackTypes";
import { analyzeTrackDspFeatures } from "../dspFeatureExtraction";
import { analyzeMechanicalMoods } from "../mechanicalMoodAnalyzer";
import type { SunoAnalysisResultInput } from "./analysisRecords";

export interface AnalyzeSunoRecordingParams {
  canonicalRecordingId: string;
  title: string;
  durationSeconds: number;
  playableAudioUrl: string;
}

export type SunoAnalysisAdapterResult =
  | { ok: true; result: SunoAnalysisResultInput }
  | { ok: false; warnings: string[] };

export async function analyzeSunoRecording(params: AnalyzeSunoRecordingParams): Promise<SunoAnalysisAdapterResult> {
  const adapterTrack: Track = {
    trackId: `suno-analysis-adapter:${params.canonicalRecordingId}`,
    title: params.title,
    artist: "",
    durationSeconds: params.durationSeconds,
    energy: 0,
    energySource: "estimated",
    sourceOwner: "unknown",
    objectUrl: params.playableAudioUrl,
  };

  const dspResult = await analyzeTrackDspFeatures(adapterTrack);

  if (dspResult.analysisStatus === "failed") {
    return { ok: false, warnings: dspResult.analysisWarnings ?? ["Analysis failed."] };
  }
  if (dspResult.analysisStatus !== "analyzed" && dspResult.analysisStatus !== "partial") {
    return { ok: false, warnings: ["Analysis did not complete."] };
  }

  const mechanical = analyzeMechanicalMoods(dspResult);

  return {
    ok: true,
    result: {
      analysisStatus: dspResult.analysisStatus,
      bpm: dspResult.bpm ?? null,
      camelotKey: dspResult.camelotKey ?? null,
      energy: dspResult.energy ?? null,
      moodTags: dspResult.moodTags ?? [],
      moodSuggestions: dspResult.moodSuggestions ?? [],
      mechanicalMoodTags: mechanical.mechanicalMoodTags,
      analysisWarnings: dspResult.analysisWarnings ?? [],
      // 0828_MUSIC_Looper_Loop_Library_Tagging — analyzeTrackDspFeatures
      // already computes a real beat map for this exact same adapterTrack
      // (via computeTrackBeatMap, the identical detector Catalog/External
      // tracks use) — previously discarded here rather than forwarded.
      // Enables genuine grid-snapped Loop creation for Song Library
      // recordings once (re)analyzed.
      beatMap: dspResult.beatMap,
    },
  };
}

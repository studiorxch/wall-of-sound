// 0717D_RADIO_Playlist_Inbox_and_Performance_Foundation §16 — closes 0717C's
// disclosed debt: this is `ensureSongAnalysisReady`/`cancelSongAnalysis`/
// `recomputeSongAnalysisStatus` extracted out of App.tsx's inline closures
// into a plain, testable factory — mirroring `sectionalRadioBridgeOrchestrator.ts`'s
// established "extract App-level orchestration into a testable function,
// because this codebase has no React-component test harness" precedent
// from 0717B. Behavior is otherwise a direct lift — see spec §9's state
// table, unchanged.
//
// The factory owns its own in-flight `Map` internally (never caller-
// supplied) so there is exactly one dedup boundary regardless of how many
// places call through it (Sectional Looper, the RADIO multi-track prep
// workspace's batch preparation, the RADIO export bridge).

import type { Track } from "../../data/trackTypes";
import type { TrackSegment } from "../../data/loopTypes";
import type { CompleteSongAnalysis } from "../../data/songAnalysisTypes";
import { isLegalSongAnalysisStateTransition } from "../../data/songAnalysisTypes";
import { computeSongAnalysisCacheIdentity, isSongAnalysisCacheValid } from "./songAnalysisCacheIdentity";
import { resolveSongAnalysisInput } from "./resolveSongAnalysisInput";
import { analyzeCompleteSong } from "./completeSongAnalyzer";
import { resolveActiveSongSection } from "./songSectionRevisions";
import type { ChunkedDspProgress } from "../dspFeatureExtraction";

function nowIso(): string {
  return new Date().toISOString();
}

export interface EnsureSongAnalysisReadyOptions {
  force?: boolean;
  segments?: TrackSegment[];
  trustedBoundsStartFrame?: number;
  trustedBoundsEndFrame?: number;
}

export interface SongAnalysisOrchestratorDeps {
  getSongAnalyses: () => CompleteSongAnalysis[];
  saveSongAnalysis: (analysis: CompleteSongAnalysis) => void;
  updateSongAnalysis: (id: string, patch: Partial<CompleteSongAnalysis>) => void;
  getDecodedSourceBufferForRender: (track: Track) => Promise<AudioBuffer | null>;
  setProgress: (trackId: string, progress: ChunkedDspProgress) => void;
}

export interface SongAnalysisOrchestrator {
  ensureSongAnalysisReady(
    track: Track,
    existingBuffer: AudioBuffer | null,
    opts?: EnsureSongAnalysisReadyOptions,
  ): Promise<CompleteSongAnalysis | null>;
  cancelSongAnalysis(trackId: string): void;
  recomputeSongAnalysisStatus(analysisId: string): void;
  // 0717C debt closure #2 — a deterministic live-Cancel proof, mirroring
  // 0714J's sanctioned `armMidTransitionPause` precedent: arms a
  // trackId+fraction pair, checked inside the REAL onProgress callback
  // (driven by computeDspFeaturesChunked's genuine framesProcessed/
  // totalFrames stream) — never a wall-clock-guessed setTimeout trigger.
  // Exposed on window.MUSIC_DEBUG by App.tsx, same install pattern as
  // armMidTransitionPause.
  armSongAnalysisCancel(trackId: string, fraction: number): void;
}

export function createSongAnalysisOrchestrator(deps: SongAnalysisOrchestratorDeps): SongAnalysisOrchestrator {
  const inFlightRef = new Map<string, { promise: Promise<CompleteSongAnalysis | null>; abortController: AbortController }>();
  const armedCancelFractions = new Map<string, number>();

  // spec §9's exact state table. READY_* returns immediately with no
  // buffer resolution attempted at all. STALE/FAILED do NOT auto-reanalyze
  // silently — the caller must pass `force: true` (only the explicit
  // Analyze/Reanalyze UI action does) to proceed past those states.
  // `existingBuffer` is whatever the caller already has (Sectional
  // Looper's own audioBufferRef.current, or null for a batch-preparation
  // caller with no open editor) — this function never forces a decode
  // itself; resolveSongAnalysisInput falls back to
  // getDecodedSourceBufferForRender (the canonical render/promote decode
  // cache) only when existingBuffer is null.
  async function ensureSongAnalysisReady(
    track: Track,
    existingBuffer: AudioBuffer | null,
    opts?: EnsureSongAnalysisReadyOptions,
  ): Promise<CompleteSongAnalysis | null> {
    const existing = deps.getSongAnalyses().find((a) => a.sourceTrackId === track.trackId);
    if (existing && !opts?.force) {
      if (existing.status === "READY_PROVISIONAL" || existing.status === "READY_VERIFIED") {
        // Cheap staleness pre-check (spec §4.4/§4.5), no decode required —
        // compares the fingerprint (path+duration, so a re-imported/
        // replaced source file is caught) plus analyzer/config version
        // against the existing record's own decodedFrameCount/sampleRate
        // (a fresh decode of the SAME unchanged file is deterministic, so
        // reusing the record's own values here is valid; a genuinely
        // different file is already caught by the fingerprint mismatch).
        const currentIdentity = computeSongAnalysisCacheIdentity(track, existing.decodedFrameCount, existing.sampleRate);
        if (!isSongAnalysisCacheValid(existing, currentIdentity)) {
          deps.updateSongAnalysis(existing.id, { status: "STALE" });
          return { ...existing, status: "STALE" };
        }
        return existing;
      }
      if (existing.status === "STALE" || existing.status === "FAILED") return existing;
    }

    const inFlight = inFlightRef.get(track.trackId);
    if (inFlight) return inFlight.promise;

    if (existing) deps.updateSongAnalysis(existing.id, { status: "ANALYZING" });
    const abortController = new AbortController();

    const run = (async (): Promise<CompleteSongAnalysis | null> => {
      try {
        const input = await resolveSongAnalysisInput(existingBuffer, deps.getDecodedSourceBufferForRender, track);
        if (!input) {
          if (existing) deps.updateSongAnalysis(existing.id, { status: "FAILED" });
          return null;
        }

        // Never overwrite a section with active human work — see
        // completeSongAnalyzer.ts's priorProtectedSections doc comment.
        const priorProtected = existing?.sections.filter((s) => s.verification !== "provisional" || s.activeRevisionId) ?? [];

        const analysis = await analyzeCompleteSong({
          track,
          analysisInput: input,
          segments: opts?.segments ?? [],
          trustedBoundsStartFrame: opts?.trustedBoundsStartFrame,
          trustedBoundsEndFrame: opts?.trustedBoundsEndFrame,
          priorProtectedSections: priorProtected.length > 0 ? priorProtected : undefined,
          signal: abortController.signal,
          onProgress: (p) => {
            deps.setProgress(track.trackId, p);
            const armed = armedCancelFractions.get(track.trackId);
            if (armed != null && p.totalFrames > 0 && p.framesProcessed / p.totalFrames >= armed) {
              armedCancelFractions.delete(track.trackId);
              abortController.abort();
            }
          },
        });

        deps.saveSongAnalysis(existing ? { ...analysis, id: existing.id, sectionRevisions: existing.sectionRevisions } : analysis);
        return analysis;
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") {
          // An explicit cancel is not a failure — return to NOT_ANALYZED,
          // never leave the record stuck in ANALYZING or mark it FAILED.
          if (existing) deps.updateSongAnalysis(existing.id, { status: "NOT_ANALYZED" });
          return null;
        }
        if (existing) deps.updateSongAnalysis(existing.id, { status: "FAILED" });
        return null;
      } finally {
        inFlightRef.delete(track.trackId);
        armedCancelFractions.delete(track.trackId);
      }
    })();

    inFlightRef.set(track.trackId, { promise: run, abortController });
    return run;
  }

  function cancelSongAnalysis(trackId: string): void {
    inFlightRef.get(trackId)?.abortController.abort();
  }

  function armSongAnalysisCancel(trackId: string, fraction: number): void {
    armedCancelFractions.set(trackId, fraction);
  }

  // pure — after any section verification change, checks whether every
  // resolved-active section is verified; if so and status was
  // READY_PROVISIONAL, transitions to READY_VERIFIED.
  function recomputeSongAnalysisStatus(analysisId: string): void {
    const analysis = deps.getSongAnalyses().find((a) => a.id === analysisId);
    if (!analysis || analysis.status !== "READY_PROVISIONAL") return;
    const allVerified = analysis.sections.length > 0 && analysis.sections.every(
      (s) => resolveActiveSongSection(s, analysis.sectionRevisions).verification === "verified",
    );
    if (allVerified && isLegalSongAnalysisStateTransition(analysis.status, "READY_VERIFIED")) {
      deps.updateSongAnalysis(analysis.id, { status: "READY_VERIFIED", verifiedAt: nowIso() });
    }
  }

  return { ensureSongAnalysisReady, cancelSongAnalysis, recomputeSongAnalysisStatus, armSongAnalysisCancel };
}

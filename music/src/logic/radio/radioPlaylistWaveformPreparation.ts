// 0717D_RADIO_Playlist_Inbox_and_Performance_Foundation §1/§16 — the
// bounded-concurrency batch driver behind the central multi-track
// requirement: when a RADIO playlist opens, every track needs a real
// persisted waveformSummary (via CompleteSongAnalysis) without decoding
// 25-50 songs at once. This is a thin sequential/bounded-pool driver over
// the SAME `ensureSongAnalysisReady` every other call site already uses
// (Sectional Looper, the RADIO export bridge) — it owns no analysis logic
// of its own and no separate dedup/cache system.
//
// Concurrency defaults to 1, not 2: each analysis job is already
// cooperatively yielding on the main thread rather than running on a
// separate core, so two simultaneous CPU-heavy jobs add memory pressure
// (two decoded buffers + two frame-series arrays live at once) without
// real parallelism. Raise the default only after live-measured evidence
// justifies it.
//
// Resumability is free: `ensureSongAnalysisReady` itself is the cache
// boundary (READY_PROVISIONAL/READY_VERIFIED return immediately with no
// decode). Re-invoking this driver after a cancel simply skips whatever
// is already prepared and continues the rest — no resume state lives here.

import type { Track } from "../../data/trackTypes";
import type { CompleteSongAnalysis } from "../../data/songAnalysisTypes";

export type EnsureSongAnalysisReadyFn = (
  track: Track,
  existingBuffer: AudioBuffer | null,
  opts?: { force?: boolean; segments?: import("../../data/loopTypes").TrackSegment[] },
) => Promise<CompleteSongAnalysis | null>;

export interface PlaylistWaveformPreparationProgress {
  completed: number;
  total: number;
}

export interface PrepareMissingAnalysesForPlaylistOptions {
  concurrency?: number;
  signal?: AbortSignal;
  onProgress?: (progress: PlaylistWaveformPreparationProgress) => void;
}

// Walks `tracks` with at most `concurrency` calls to `ensureSongAnalysisReady`
// in flight at once (default 1). Never forces reanalysis — a track that
// already holds a valid READY_* analysis resolves instantly via
// ensureSongAnalysisReady's own fast path, so this function is safe to
// call repeatedly (e.g. every time the prep workspace mounts).
export async function prepareMissingAnalysesForPlaylist(
  tracks: Track[],
  ensureSongAnalysisReady: EnsureSongAnalysisReadyFn,
  options: PrepareMissingAnalysesForPlaylistOptions = {},
): Promise<void> {
  const concurrency = Math.max(1, options.concurrency ?? 1);
  const total = tracks.length;
  let nextIndex = 0;
  let completed = 0;

  async function worker(): Promise<void> {
    for (;;) {
      if (options.signal?.aborted) return;
      const index = nextIndex;
      nextIndex += 1;
      if (index >= tracks.length) return;

      await ensureSongAnalysisReady(tracks[index], null, {});

      completed += 1;
      options.onProgress?.({ completed, total });
    }
  }

  const workerCount = Math.min(concurrency, Math.max(tracks.length, 1));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
}

// Playlist Local Repair — Reanalyze Entire Playlist (0713_MUSIC_Playlist_
// Repair_Analyzer_Export_Completion §5). Resolves the playlist's real
// assigned tracks, dedupes, and reuses the EXISTING canonical DSP analysis
// orchestration (analyzeMissingDspFeatures / requiresCanonicalAnalysis) —
// the same predicate and batch runner the library-wide "Analyze Missing"
// action and Playlist Analyzer Review coverage already use. This module
// does not re-derive analysis logic; it only scopes the existing batch
// runner to one playlist's track set and reports playlist-shaped progress.

import type { Track } from "../../data/trackTypes";
import type { PlaylistRecord } from "../../data/playProjectTypes";
import type { PlaylistReanalysisProgress, PlaylistReanalysisSummary } from "../../data/playlistRepairTypes";
import { requiresCanonicalAnalysis, analyzeMissingDspFeatures } from "../dspFeatureExtraction";

// Real, deduplicated, assigned tracks for a playlist — order-of-first-
// appearance, orphan/empty slots skipped (per §5.2 steps 1-2).
export function resolvePlaylistTrackSet(playlist: PlaylistRecord, tracksById: Map<string, Track>): Track[] {
  const seen = new Set<string>();
  const result: Track[] = [];
  for (const slot of playlist.slots) {
    if (!slot.assignedTrackId) continue;
    if (seen.has(slot.assignedTrackId)) continue;
    const track = tracksById.get(slot.assignedTrackId);
    if (!track) continue;
    seen.add(slot.assignedTrackId);
    result.push(track);
  }
  return result;
}

export function computeReanalysisProgress(playlistTracks: Track[], updated?: Map<string, Track>): PlaylistReanalysisProgress {
  const needsAnalysis = playlistTracks.filter(requiresCanonicalAnalysis);
  const queued = needsAnalysis.length;
  let complete = 0;
  let partial = 0;
  let failed = 0;
  for (const t of needsAnalysis) {
    const u = updated?.get(t.trackId);
    if (!u) continue;
    if (u.analysisStatus === "failed") failed++;
    else if (requiresCanonicalAnalysis(u)) partial++;
    else complete++;
  }
  return { queued, running: 0, complete, partial, failed, remaining: queued - complete - partial - failed };
}

export interface ReanalyzePlaylistResult {
  // Full library, with this playlist's reanalyzed tracks merged in by ID —
  // safe to pass straight to setLibraryTracks.
  updatedLibraryTracks: Track[];
  progress: PlaylistReanalysisProgress;
  summary: PlaylistReanalysisSummary;
  failedTrackIds: string[];
}

// Prevents duplicate concurrent runs (§5.2 step 6) — the caller (App.tsx)
// should also gate the trigger UI on this, but the guard lives here too so
// the function itself is safe to call defensively.
let runningPlaylistIds = new Set<string>();

export async function reanalyzeEntirePlaylist(
  playlist: PlaylistRecord,
  libraryTracks: Track[],
  nowIso: string,
): Promise<ReanalyzePlaylistResult> {
  if (runningPlaylistIds.has(playlist.playlistId)) {
    throw new Error(`Reanalysis already running for playlist ${playlist.playlistId}`);
  }
  runningPlaylistIds.add(playlist.playlistId);
  try {
    const tracksById = new Map(libraryTracks.map((t) => [t.trackId, t]));
    const playlistTracks = resolvePlaylistTrackSet(playlist, tracksById);
    const needsAnalysis = playlistTracks.filter(requiresCanonicalAnalysis);

    // §5.2 step 4/5/7 — only the tracks that actually need it are queued,
    // via the same batch runner used everywhere else in the app. A failed
    // track does not stop the batch (analyzeMissingDspFeatures already
    // continues past per-track failures internally).
    const result = await analyzeMissingDspFeatures(needsAnalysis, "all");

    const updatedById = new Map(result.tracks.map((t) => [t.trackId, t]));
    const updatedLibraryTracks = libraryTracks.map((t) => updatedById.get(t.trackId) ?? t);

    const progress = computeReanalysisProgress(playlistTracks, updatedById);
    const failedTrackIds = result.failedTracks.map((f) => f.id);

    const summary: PlaylistReanalysisSummary = {
      lastReanalyzedAt: nowIso,
      queued: needsAnalysis.length,
      complete: progress.complete,
      partial: progress.partial,
      failed: progress.failed,
    };

    return { updatedLibraryTracks, progress, summary, failedTrackIds };
  } finally {
    runningPlaylistIds.delete(playlist.playlistId);
  }
}

export function isPlaylistReanalysisRunning(playlistId: string): boolean {
  return runningPlaylistIds.has(playlistId);
}

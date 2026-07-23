// 0722C_MUSIC_Production_Stem_Export — thin fetch wrappers for the
// server/stems/* routes. No state, no caching — GET /stem-sets is always
// re-fetched live (the filesystem is the source of truth, never a
// persisted "hasStems" flag anywhere client-side).

import type { StemJob, StemSetLifecycleResult, TrackStemSet } from "../../data/trackStemTypes";
import type { Track } from "../../data/trackTypes";

// Some real Library tracks (legacy External imports, confirmed live) carry
// an ABSOLUTE filePath rather than a LIBRARY_ROOT-relative audioRelPath —
// the same dual-shape resolveAudioUrl (audioAnalysisInput.ts) already
// handles for playback. Every stem client call resolves a source through
// this one function so both shapes work identically. Server routes accept
// either shape too (see server/stems/stemFsUtils.ts resolveTrackSourcePath).
export function resolveTrackAudioIdentifier(track: Pick<Track, "audioRelPath" | "filePath">): string | null {
  return track.audioRelPath ?? track.filePath ?? null;
}

export interface StemSetsResponse {
  ok: boolean;
  sets: TrackStemSet[];
  lifecycles: Record<string, StemSetLifecycleResult>;
}

export async function fetchStemSets(trackId: string, audioRelPath: string): Promise<StemSetsResponse> {
  const params = new URLSearchParams({ trackId, audioRelPath });
  const res = await fetch(`/stem-sets?${params.toString()}`);
  return res.json();
}

export interface StemEngineStatusResponse {
  ok: boolean;
  missing: string[];
  setupCommand: string;
  mpsAvailable: boolean;
}

export async function fetchStemEngineStatus(): Promise<StemEngineStatusResponse> {
  const res = await fetch("/stem-engine-status");
  return res.json();
}

export async function startStemExport(trackId: string, audioRelPath: string): Promise<{ ok: boolean; jobId?: string; focused?: boolean; error?: string }> {
  const res = await fetch("/stem-export-start", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ trackId, audioRelPath }),
  });
  return res.json();
}

export async function fetchStemJobStatus(jobId: string): Promise<{ ok: boolean; job?: StemJob }> {
  const res = await fetch(`/stem-export-status?jobId=${encodeURIComponent(jobId)}`);
  return res.json();
}

export async function cancelStemExport(jobId: string): Promise<{ ok: boolean }> {
  const res = await fetch("/stem-export-cancel", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobId }),
  });
  return res.json();
}

export async function revealStemSetInFinder(trackId: string, stemSetId: string): Promise<{ ok: boolean; reason?: string }> {
  const res = await fetch("/stem-set-reveal", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ trackId, stemSetId }),
  });
  return res.json();
}

export async function createSalvageStagingOperation(): Promise<{ ok: boolean; operationId: string }> {
  const res = await fetch("/stem-salvage-stage", { method: "POST" });
  return res.json();
}

export async function uploadSalvageFile(operationId: string, role: string, file: File): Promise<{ ok: boolean; fileName?: string; size?: number }> {
  const params = new URLSearchParams({ operationId, role, filename: file.name });
  const res = await fetch(`/stem-salvage-upload?${params.toString()}`, { method: "POST", body: file });
  return res.json();
}

export interface RegisterExistingParams {
  operationId: string;
  trackId: string;
  audioRelPath: string;
  roleAssignments: Record<string, string>;
  confirmed: boolean;
  engineNotes?: string;
}

export async function registerExistingStemSetRequest(params: RegisterExistingParams): Promise<{ ok: boolean; stemSet?: TrackStemSet; message?: string }> {
  const res = await fetch("/stem-register-existing", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  return res.json();
}

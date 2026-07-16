// Audio import + analysis pipeline (0708_MUSIC_AudioImportAnalysisPipeline_v1.0.0)
// Handles file-picker import, duration extraction, heuristic mood suggestions,
// and TrackRecord creation. Server-side copy via /library-import endpoint.

import type { Track, TrackSourceOwner } from "../data/trackTypes";
import { suggestMoodsAndClusters } from "./moodSuggestionEngine";
import { SUPPORTED_AUDIO_EXTENSIONS } from "../data/importTypes";

// ── File picker ───────────────────────────────────────────────────────────────

const ACCEPT = `${SUPPORTED_AUDIO_EXTENSIONS.join(",")},audio/*`;

export function pickAudioFiles(): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ACCEPT;
    input.multiple = true;
    input.style.display = "none";
    document.body.appendChild(input);
    input.addEventListener("change", () => {
      const files = Array.from(input.files ?? []);
      document.body.removeChild(input);
      resolve(files);
    });
    input.addEventListener("cancel", () => {
      document.body.removeChild(input);
      resolve([]);
    });
    input.click();
  });
}

// ── Duration extraction via Web Audio API ─────────────────────────────────────

export async function extractDuration(file: File): Promise<number | null> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const ctx = new AudioContext();
    const decoded = await ctx.decodeAudioData(arrayBuffer);
    ctx.close();
    return decoded.duration;
  } catch {
    return null;
  }
}

// ── Heuristic mood inference from filename ─────────────────────────────────────

function inferMoodsFromFilename(name: string): string[] {
  const lower = name.toLowerCase();
  const hints: string[] = [];
  if (/ambient|drone|pad|atmosphere/.test(lower)) hints.push("ambient");
  if (/dark|noir|shadow|grim/.test(lower)) hints.push("dark");
  if (/warm|cozy|gentle|soft/.test(lower)) hints.push("warm");
  if (/minimal|sparse|quiet/.test(lower)) hints.push("minimal");
  if (/deep|sub|bass/.test(lower)) hints.push("deep");
  if (/late.?night|midnight|nocturnal/.test(lower)) hints.push("late-night");
  if (/cinematic|film|score|epic/.test(lower)) hints.push("cinematic");
  if (/hypnotic|pulse|loop/.test(lower)) hints.push("hypnotic");
  if (/mechanical|industrial|machine/.test(lower)) hints.push("mechanical");
  if (/organic|nature|field|texture/.test(lower)) hints.push("organic");
  if (/tense|suspense|uneasy/.test(lower)) hints.push("tense");
  if (/uplifting|bright|euphoric/.test(lower)) hints.push("uplifting");
  if (/melanchol|sad|mournful/.test(lower)) hints.push("melancholic");
  return [...new Set(hints)];
}

// ── Build a stub TrackRecord from a file + server response ────────────────────

function genId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function stripExt(name: string): string {
  return name.replace(/\.[^.]+$/, "");
}

export interface ImportResult {
  track: Track;
  existed: boolean;
  relPath: string;
}

export interface ImportBatchResult {
  imported: ImportResult[];
  failed: Array<{ name: string; error: string }>;
}

// Destination → server folder + Track fields (0712_MUSIC_Audio_Import_And_Readiness).
// "reference" here is the existing REF-backed library — the UI now labels it
// "Sounds", but the underlying sourceOwner/storage path/audioCategory are
// unchanged, so nothing downstream needs to know about the rename.
const DESTINATION_FOLDERS: Record<TrackSourceOwner, string> = {
  studiorich: "catalog/audio",
  external: "external/audio",
  reference: "reference/audio",
  unknown: "catalog/audio",
};

export async function importAudioFiles(
  files: File[],
  destination: TrackSourceOwner = "studiorich",
  onProgress?: (done: number, total: number, current: string) => void,
): Promise<ImportBatchResult> {
  const imported: ImportResult[] = [];
  const failed: Array<{ name: string; error: string }> = [];
  const destFolder = DESTINATION_FOLDERS[destination] ?? DESTINATION_FOLDERS.studiorich;
  const audioCategory = destination === "external" ? "external" : destination === "reference" ? "reference" : "catalog";

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    onProgress?.(i, files.length, file.name);

    try {
      // 1. Upload to server
      const res = await fetch(`/library-import?filename=${encodeURIComponent(file.name)}&dest=${destFolder}`, {
        method: "POST",
        body: file,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        failed.push({ name: file.name, error: err.error ?? "upload failed" });
        continue;
      }
      const { relPath, existed } = await res.json() as { relPath: string; existed: boolean; ok: boolean };

      // 2. Extract duration
      const duration = await extractDuration(file);

      // 3. Heuristic mood suggestions
      const filenameMoods = inferMoodsFromFilename(file.name);
      const engineResult = suggestMoodsAndClusters({
        trackId: "",
        title: stripExt(file.name),
        artist: "",
        energy: 0,
        durationSeconds: duration ?? 0,
        energySource: "estimated",
      });
      const moodSuggestions = [...new Set([...filenameMoods, ...engineResult.moods])];

      // 4. Build TrackRecord stub
      const now = new Date().toISOString();
      const track: Track = {
        trackId: genId("import"),
        title: stripExt(file.name),
        artist: "",
        durationSeconds: duration ?? 0,
        energy: 0,
        energySource: "estimated",
        sourceOwner: destination,
        audioRelPath: relPath,
        audioCategory,
        audioFileName: file.name,
        audioStatus: "linked",
        audioLinked: true,
        analysisStatus: "review_needed",
        analysisSources: ["import"],
        analysisUpdatedAt: now,
        moodSuggestions: moodSuggestions.length > 0 ? moodSuggestions : undefined,
        clusterTags: engineResult.clusterTags.length > 0 ? engineResult.clusterTags : undefined,
        archiveStatus: "library",
        createdAt: now,
        updatedAt: now,
      } as Track & { createdAt: string; updatedAt: string };

      imported.push({ track, existed, relPath });
    } catch (e) {
      failed.push({ name: file.name, error: String(e) });
    }
  }

  onProgress?.(files.length, files.length, "");
  return { imported, failed };
}

// ── Audit helpers (exposed to window.dbg) ────────────────────────────────────

export function auditAudioAnalysis(tracks: Track[]) {
  const byStatus: Record<string, Track[]> = {};
  for (const t of tracks) {
    const s = t.analysisStatus ?? "not_analyzed";
    (byStatus[s] ??= []).push(t);
  }
  const summary: Record<string, number> = {};
  for (const [k, v] of Object.entries(byStatus)) summary[k] = v.length;
  console.table(summary);
  return { byStatus, summary };
}

export function reanalyzeTrack(track: Track): Track {
  const moodSuggestions = inferMoodsFromFilename(track.audioFileName ?? track.title ?? "");
  const engineResult = suggestMoodsAndClusters(track);
  const merged = [...new Set([...moodSuggestions, ...engineResult.moods])];
  return {
    ...track,
    moodSuggestions: merged.length > 0 ? merged : track.moodSuggestions,
    clusterTags: engineResult.clusterTags.length > 0 ? engineResult.clusterTags : track.clusterTags,
    analysisStatus: "review_needed",
    analysisUpdatedAt: new Date().toISOString(),
  };
}

export function reanalyzeMissing(tracks: Track[]): Track[] {
  return tracks.map((t) =>
    t.analysisStatus === "not_analyzed" || !t.moodSuggestions?.length
      ? reanalyzeTrack(t)
      : t,
  );
}

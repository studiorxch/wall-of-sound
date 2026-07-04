import type { Track } from "../data/trackTypes";

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Stable identity key for upsert deduplication.
 * Priority: sunoId → catalogId → audioFilename → title+artist+duration → trackId
 */
export function getTrackUpsertKey(track: Track): string {
  if (track.sunoId?.trim()) return `suno:${track.sunoId.trim()}`;
  if (track.catalogId?.trim()) return `cat:${track.catalogId.trim()}`;
  const fn = (track.audioFilename ?? track.fileName ?? "").trim().toLowerCase();
  if (fn) return `file:${fn}`;
  const t = normalize(track.title ?? "");
  const a = normalize(track.artist ?? "");
  const d = Math.round(track.durationSeconds ?? 0);
  if (t && a && d > 0) return `tad:${t}|${a}|${d}`;
  return `id:${track.trackId}`;
}

export interface UpsertResult {
  importedCount: number;
  updatedCount: number;
  unchangedCount: number;
  duplicateSkippedCount: number;
}

/**
 * Upsert incoming tracks into existing library.
 * - existing row with same upsert key → merge (preserve user edits)
 * - new row with no match → insert
 * - duplicates within incoming batch → skip extras
 */
export function upsertTracks(
  existing: Track[],
  incoming: Track[],
): { tracks: Track[]; result: UpsertResult } {
  const keyMap = new Map<string, number>();
  const working: Track[] = [...existing];
  for (let i = 0; i < working.length; i++) {
    const k = getTrackUpsertKey(working[i]);
    if (!keyMap.has(k)) keyMap.set(k, i);
  }

  let importedCount = 0;
  let updatedCount = 0;
  let unchangedCount = 0;
  let duplicateSkippedCount = 0;
  const seenIncoming = new Set<string>();

  for (const track of incoming) {
    const key = getTrackUpsertKey(track);
    if (seenIncoming.has(key)) { duplicateSkippedCount++; continue; }
    seenIncoming.add(key);

    const existingIdx = keyMap.get(key);
    if (existingIdx === undefined) {
      keyMap.set(key, working.length);
      working.push(track);
      importedCount++;
    } else {
      const old = working[existingIdx];
      const merged = mergeTrackUpdate(old, track);
      if (merged === old) {
        unchangedCount++;
      } else {
        working[existingIdx] = merged;
        updatedCount++;
      }
    }
  }

  return { tracks: working, result: { importedCount, updatedCount, unchangedCount, duplicateSkippedCount } };
}

/** Merge incoming into existing, protecting user-edited fields. */
function mergeTrackUpdate(existing: Track, incoming: Track): Track {
  // User-controlled fields: keep existing if set
  const userProtected = new Set<keyof Track>([
    "rating", "notes", "moodTags", "primaryMood", "style",
    "mechanicalMoodTags", "mechanicalMoodConfidence",
    "platformUse", "archiveStatus", "cuePoints",
  ]);

  let changed = false;
  const merged: Track = { ...existing };

  for (const k of Object.keys(incoming) as (keyof Track)[]) {
    if (userProtected.has(k)) continue;
    const newVal = incoming[k];
    const oldVal = existing[k];
    // Fill in missing fields from incoming
    if (newVal !== undefined && newVal !== null && newVal !== "") {
      if (oldVal === undefined || oldVal === null || oldVal === "") {
        (merged as Record<string, unknown>)[k] = newVal;
        changed = true;
      }
    }
  }

  // Always update analysis metadata if incoming is fresher
  const analysisFields: (keyof Track)[] = [
    "analysisStatus", "analysisSources", "analysisUpdatedAt",
    "audioAnalysis", "importMetadata",
  ];
  for (const k of analysisFields) {
    if (incoming[k] !== undefined && incoming[k] !== existing[k]) {
      (merged as Record<string, unknown>)[k] = incoming[k];
      changed = true;
    }
  }

  return changed ? merged : existing;
}

/** Remove duplicates from library, merging data with merge priority rules. */
export function repairDuplicates(tracks: Track[]): {
  tracks: Track[];
  mergedCount: number;
  removedCount: number;
} {
  const groups = new Map<string, Track[]>();
  for (const t of tracks) {
    const k = getTrackUpsertKey(t);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(t);
  }

  const result: Track[] = [];
  let mergedCount = 0;
  let removedCount = 0;

  for (const group of groups.values()) {
    if (group.length === 1) { result.push(group[0]); continue; }
    mergedCount++;
    removedCount += group.length - 1;
    // Best = most fields filled; merge others into it
    const sorted = [...group].sort((a, b) => fieldScore(b) - fieldScore(a));
    let best = sorted[0];
    for (let i = 1; i < sorted.length; i++) {
      best = mergeTrackUpdate(best, sorted[i]);
    }
    result.push(best);
  }

  return { tracks: result, mergedCount, removedCount };
}

function fieldScore(t: Track): number {
  const keys: (keyof Track)[] = [
    "filePath", "audioFilename", "sunoId", "catalogId", "rating",
    "notes", "primaryMood", "mechanicalMoodTags", "audioAnalysis", "coverImagePath",
  ];
  return keys.filter((k) => {
    const v = t[k];
    return v !== undefined && v !== null && v !== "";
  }).length;
}

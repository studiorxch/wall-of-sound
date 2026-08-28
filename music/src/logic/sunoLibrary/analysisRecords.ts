// Suno → Common MUSIC Intelligence Adapter (Phase 2) — pure functions over
// SunoAnalysisRecord[], mirroring reviews.ts's exact upsert-by-
// canonicalRecordingId pattern (find-or-seed, apply one change, stamp
// updatedAt, replace-or-append). No I/O, no fetch — callers own persistence
// via savePlayProject, exactly like every other Suno mutator.

import type { AnalysisStatus, MechanicalMoodTag } from "../../data/trackTypes";
import type { TrackBeatMap } from "../../data/beatMapTypes";
import type { SunoAnalysisRecord, SunoCanonicalRecordingId, SunoSnapshotId } from "../../data/sunoLibraryTypes";
import { isLegalTrackAnalysisStateTransition } from "../trackAnalysisStateMachine";

export function createAnalysisRecord(canonicalRecordingId: SunoCanonicalRecordingId, snapshotId: SunoSnapshotId): SunoAnalysisRecord {
  return {
    canonicalRecordingId,
    snapshotId,
    analysisStatus: "not_analyzed",
    bpm: null,
    camelotKey: null,
    energy: null,
    moodTags: [],
    moodSuggestions: [],
    mechanicalMoodTags: [],
    analysisWarnings: [],
    analysisUpdatedAt: null,
  };
}

export function getAnalysisRecord(
  records: SunoAnalysisRecord[],
  canonicalRecordingId: SunoCanonicalRecordingId,
): SunoAnalysisRecord | undefined {
  return records.find((r) => r.canonicalRecordingId === canonicalRecordingId);
}

function upsertAnalysisRecord(records: SunoAnalysisRecord[], next: SunoAnalysisRecord): SunoAnalysisRecord[] {
  const index = records.findIndex((r) => r.canonicalRecordingId === next.canonicalRecordingId);
  if (index === -1) return [...records, next];
  const copy = records.slice();
  copy[index] = next;
  return copy;
}

function baseFor(records: SunoAnalysisRecord[], canonicalRecordingId: SunoCanonicalRecordingId, snapshotId: SunoSnapshotId): SunoAnalysisRecord {
  return getAnalysisRecord(records, canonicalRecordingId) ?? createAnalysisRecord(canonicalRecordingId, snapshotId);
}

export function markAnalysisQueued(
  records: SunoAnalysisRecord[],
  canonicalRecordingId: SunoCanonicalRecordingId,
  snapshotId: SunoSnapshotId,
  nowIso: string,
): SunoAnalysisRecord[] {
  const base = baseFor(records, canonicalRecordingId, snapshotId);
  return upsertAnalysisRecord(records, { ...base, analysisStatus: "queued", analysisUpdatedAt: nowIso });
}

export function markAnalysisAnalyzing(
  records: SunoAnalysisRecord[],
  canonicalRecordingId: SunoCanonicalRecordingId,
  snapshotId: SunoSnapshotId,
  nowIso: string,
): SunoAnalysisRecord[] {
  const base = baseFor(records, canonicalRecordingId, snapshotId);
  return upsertAnalysisRecord(records, { ...base, analysisStatus: "analyzing", analysisUpdatedAt: nowIso });
}

export interface SunoAnalysisResultInput {
  analysisStatus: Extract<AnalysisStatus, "analyzed" | "partial">;
  bpm: number | null;
  camelotKey: string | null;
  energy: number | null;
  moodTags: string[];
  moodSuggestions: string[];
  mechanicalMoodTags: MechanicalMoodTag[];
  analysisWarnings: string[];
  // 0828 — see SunoAnalysisRecord.beatMap's own doc comment.
  beatMap?: TrackBeatMap;
}

export function applyAnalysisResult(
  records: SunoAnalysisRecord[],
  canonicalRecordingId: SunoCanonicalRecordingId,
  snapshotId: SunoSnapshotId,
  result: SunoAnalysisResultInput,
  nowIso: string,
): SunoAnalysisRecord[] {
  const base = baseFor(records, canonicalRecordingId, snapshotId);
  return upsertAnalysisRecord(records, { ...base, ...result, analysisUpdatedAt: nowIso });
}

export function applyAnalysisFailure(
  records: SunoAnalysisRecord[],
  canonicalRecordingId: SunoCanonicalRecordingId,
  snapshotId: SunoSnapshotId,
  warnings: string[],
  nowIso: string,
): SunoAnalysisRecord[] {
  const base = baseFor(records, canonicalRecordingId, snapshotId);
  return upsertAnalysisRecord(records, { ...base, analysisStatus: "failed", analysisWarnings: warnings, analysisUpdatedAt: nowIso });
}

/**
 * MUSIC P0 Step C's exact recovery rule (playProjectStorage.ts's
 * repairStoredProject), reapplied here: dspInFlightRef-equivalent tracking
 * for Suno analysis is purely in-memory (the analyzeRecordings loop in
 * SunoLibraryWorkspace), so any record still stamped "queued"/"analyzing" at
 * load time means its batch never finished — reset to "not_analyzed" so
 * it's safely re-queueable, never permanently stuck. Uses the SAME legal-
 * transition gate as Track's own reset, not a new one.
 */
export function resetOrphanedSunoAnalysis(records: SunoAnalysisRecord[]): SunoAnalysisRecord[] {
  let changed = false;
  const next = records.map((r) => {
    if ((r.analysisStatus === "queued" || r.analysisStatus === "analyzing") && isLegalTrackAnalysisStateTransition(r.analysisStatus, "not_analyzed")) {
      changed = true;
      return { ...r, analysisStatus: "not_analyzed" as const };
    }
    return r;
  });
  return changed ? next : records;
}

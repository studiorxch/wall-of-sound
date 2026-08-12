// Suno Library Manifest Integration — human review/listening state.
//
// Pure upsert/lookup helpers over SunoListeningRecord[]/SunoInterestMarker[]
// — the two arrays persisted on PlayProject (see App.tsx wiring). Never
// interprets "unheard" as rejected or "not favorite" as disliked (spec
// §6.5) — createListeningRecord's defaults are neutral, not negative.

import type {
  SunoAssetKind,
  SunoCanonicalRecordingId,
  SunoInterestMarker,
  SunoInterestMarkerLabel,
  SunoListeningRecord,
  SunoListeningStatus,
  SunoSnapshotId,
  SunoSuggestedUse,
} from "../../data/sunoLibraryTypes";

export function createListeningRecord(
  canonicalRecordingId: SunoCanonicalRecordingId,
  snapshotId: SunoSnapshotId,
  nowIso: string,
): SunoListeningRecord {
  return {
    canonicalRecordingId,
    snapshotId,
    listeningStatus: "unheard",
    assetKind: "unknown",
    suggestedUses: [],
    notes: "",
    trainingEligibility: "excluded-suno-terms",
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

export function getListeningRecord(
  records: SunoListeningRecord[],
  canonicalRecordingId: SunoCanonicalRecordingId,
): SunoListeningRecord | undefined {
  return records.find((r) => r.canonicalRecordingId === canonicalRecordingId);
}

/** Find-by-canonicalRecordingId-and-replace-or-append, stamping updatedAt. */
export function upsertListeningRecord(
  records: SunoListeningRecord[],
  next: SunoListeningRecord,
  nowIso: string,
): SunoListeningRecord[] {
  const stamped: SunoListeningRecord = { ...next, updatedAt: nowIso };
  const index = records.findIndex((r) => r.canonicalRecordingId === stamped.canonicalRecordingId);
  if (index === -1) return [...records, stamped];
  const copy = records.slice();
  copy[index] = stamped;
  return copy;
}

export function setListeningStatus(
  records: SunoListeningRecord[],
  canonicalRecordingId: SunoCanonicalRecordingId,
  snapshotId: SunoSnapshotId,
  status: SunoListeningStatus,
  nowIso: string,
): SunoListeningRecord[] {
  const existing = getListeningRecord(records, canonicalRecordingId) ??
    createListeningRecord(canonicalRecordingId, snapshotId, nowIso);
  return upsertListeningRecord(records, { ...existing, listeningStatus: status }, nowIso);
}

export function setAssetKind(
  records: SunoListeningRecord[],
  canonicalRecordingId: SunoCanonicalRecordingId,
  snapshotId: SunoSnapshotId,
  assetKind: SunoAssetKind,
  nowIso: string,
): SunoListeningRecord[] {
  const existing = getListeningRecord(records, canonicalRecordingId) ??
    createListeningRecord(canonicalRecordingId, snapshotId, nowIso);
  return upsertListeningRecord(records, { ...existing, assetKind }, nowIso);
}

export function toggleSuggestedUse(
  records: SunoListeningRecord[],
  canonicalRecordingId: SunoCanonicalRecordingId,
  snapshotId: SunoSnapshotId,
  use: SunoSuggestedUse,
  nowIso: string,
): SunoListeningRecord[] {
  const existing = getListeningRecord(records, canonicalRecordingId) ??
    createListeningRecord(canonicalRecordingId, snapshotId, nowIso);
  const has = existing.suggestedUses.includes(use);
  const suggestedUses = has
    ? existing.suggestedUses.filter((u) => u !== use)
    : [...existing.suggestedUses, use];
  return upsertListeningRecord(records, { ...existing, suggestedUses }, nowIso);
}

export function setNotes(
  records: SunoListeningRecord[],
  canonicalRecordingId: SunoCanonicalRecordingId,
  snapshotId: SunoSnapshotId,
  notes: string,
  nowIso: string,
): SunoListeningRecord[] {
  const existing = getListeningRecord(records, canonicalRecordingId) ??
    createListeningRecord(canonicalRecordingId, snapshotId, nowIso);
  return upsertListeningRecord(records, { ...existing, notes }, nowIso);
}

// ---------------------------------------------------------------------------
// Interest markers
// ---------------------------------------------------------------------------

export function createInterestMarker(
  canonicalRecordingId: SunoCanonicalRecordingId,
  startSeconds: number,
  label: SunoInterestMarkerLabel,
  nowIso: string,
  markerId: string,
): SunoInterestMarker {
  return {
    markerId,
    canonicalRecordingId,
    startSeconds,
    endSeconds: null,
    label,
    note: "",
    suggestedUses: [],
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

export function getInterestMarkersForRecording(
  markers: SunoInterestMarker[],
  canonicalRecordingId: SunoCanonicalRecordingId,
): SunoInterestMarker[] {
  return markers.filter((m) => m.canonicalRecordingId === canonicalRecordingId);
}

/** Find-by-markerId-and-replace-or-append, stamping updatedAt. */
export function upsertInterestMarker(
  markers: SunoInterestMarker[],
  next: SunoInterestMarker,
  nowIso: string,
): SunoInterestMarker[] {
  const stamped: SunoInterestMarker = { ...next, updatedAt: nowIso };
  const index = markers.findIndex((m) => m.markerId === stamped.markerId);
  if (index === -1) return [...markers, stamped];
  const copy = markers.slice();
  copy[index] = stamped;
  return copy;
}

export function removeInterestMarker(markers: SunoInterestMarker[], markerId: string): SunoInterestMarker[] {
  return markers.filter((m) => m.markerId !== markerId);
}

export interface MarkerRangeValidation {
  valid: boolean;
  reason: string | null;
}

/** Spec §6.5: "Validate marker ranges against known duration." */
export function validateMarkerRange(
  marker: Pick<SunoInterestMarker, "startSeconds" | "endSeconds">,
  knownDurationSeconds: number | null,
): MarkerRangeValidation {
  if (marker.startSeconds < 0) return { valid: false, reason: "Start time cannot be negative." };
  if (marker.endSeconds !== null && marker.endSeconds <= marker.startSeconds) {
    return { valid: false, reason: "End time must be after the start time." };
  }
  if (knownDurationSeconds !== null) {
    if (marker.startSeconds > knownDurationSeconds) {
      return { valid: false, reason: "Start time is beyond the recording's known duration." };
    }
    if (marker.endSeconds !== null && marker.endSeconds > knownDurationSeconds) {
      return { valid: false, reason: "End time is beyond the recording's known duration." };
    }
  }
  return { valid: true, reason: null };
}

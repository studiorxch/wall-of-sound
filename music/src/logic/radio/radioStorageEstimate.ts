// 0717D_RADIO_Playlist_Inbox_and_Performance_Foundation §13 — a
// provider-neutral estimated public-package storage budget. Pure — no
// DOM, no Node, no cloud-provider integration or mention.
//
// An estimate must never be presented as a completed upload size, and an
// unknown estimate must never silently become 0 — estimateInboxItemBytes
// returns the literal "unknown" for every kind without a real encoder
// (everything but "loop" in this build), and summarizePlaylistStorage
// tracks how many entries are unknown rather than folding them into the
// numeric total.

import type { RadioAssetKind } from "../../data/radioInboxTypes";
import { RADIO_OPUS_ENCODING_POLICY } from "../../data/radioLoopTypes";
import { RADIO_TRACK_OPUS_ENCODING_POLICY } from "../../data/radioTrackPackageTypes";
import { kindHasPackagingPath } from "./radioAssetReadiness";

// Each packageable kind encodes at its OWN policy's bitrate — loops (128k
// unconstrained VBR, short performance material) and full tracks (160k
// constrained VBR — see radioTrackPackageTypes.ts) are deliberately
// different, so a single shared bitrate would misestimate one of them.
const BITRATE_KBPS_BY_KIND: Partial<Record<RadioAssetKind, number>> = {
  loop: RADIO_OPUS_ENCODING_POLICY.bitrateKbps,
  track: RADIO_TRACK_OPUS_ENCODING_POLICY.bitrateKbps,
};

// An approximation, not an exact size — both policies use variable
// bitrate, so real encoded size varies with content. `knownByteSize`
// (0718B) lets a caller supply the REAL byteSize from an entry's bound
// RadioTrackPackageManifest when one exists — always preferred over the
// bitrate*duration approximation (spec §Architecture decision 10).
export function estimateInboxItemBytes(kind: RadioAssetKind, durationSeconds: number | null | undefined, knownByteSize?: number | null): number | "unknown" {
  if (knownByteSize != null && Number.isFinite(knownByteSize) && knownByteSize > 0) return knownByteSize;
  if (!kindHasPackagingPath(kind)) return "unknown";
  if (durationSeconds == null || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return "unknown";
  const bitrateKbps = BITRATE_KBPS_BY_KIND[kind] ?? RADIO_OPUS_ENCODING_POLICY.bitrateKbps;
  return Math.round((durationSeconds * bitrateKbps * 1000) / 8);
}

export const DEFAULT_STORAGE_BUDGET_BYTES = 8 * 1024 ** 3; // 8 GB working target
export const DEFAULT_STORAGE_WARNING_THRESHOLD_RATIO = 0.9;

export interface RadioStorageEntryEstimate {
  entryId: string;
  bytes: number | "unknown";
}

export interface RadioPlaylistStorageSummary {
  totalBytes: number;
  unknownCount: number;
  budgetBytes: number;
  remainingBytes: number;
  warningThresholdBytes: number;
  overBudget: boolean;
  nearBudget: boolean;
}

export function summarizePlaylistStorage(
  entryEstimates: RadioStorageEntryEstimate[],
  budgetBytes: number = DEFAULT_STORAGE_BUDGET_BYTES,
  warningThresholdRatio: number = DEFAULT_STORAGE_WARNING_THRESHOLD_RATIO,
): RadioPlaylistStorageSummary {
  let totalBytes = 0;
  let unknownCount = 0;
  for (const entry of entryEstimates) {
    if (entry.bytes === "unknown") unknownCount += 1;
    else totalBytes += entry.bytes;
  }

  const warningThresholdBytes = Math.round(budgetBytes * warningThresholdRatio);
  const remainingBytes = budgetBytes - totalBytes;

  return {
    totalBytes,
    unknownCount,
    budgetBytes,
    remainingBytes,
    warningThresholdBytes,
    overBudget: totalBytes > budgetBytes,
    nearBudget: totalBytes >= warningThresholdBytes && totalBytes <= budgetBytes,
  };
}

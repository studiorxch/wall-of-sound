// RADIO-03 (batch 0929-5) -- pure decision logic for the "adopt a
// corrected/new Package version onto an existing Program" operator flow.
// Composes ONLY already-existing primitives (RadioProgramSummary,
// findExistingProgramForPackage) -- no new Firestore/network access here;
// the UI layer fetches `existingPrograms` once and calls these.
//
// Program identity (`programId`) is never re-derived, never regenerated,
// and never a function of Package identity -- these functions only decide
// WHICH existing Program (if any) the operator should be offered an
// update onto, never construct a new one.

import type { RadioProgramSummary } from "@studiorich/member-identity";
import { findExistingProgramForPackage } from "./programFromManifest";

/**
 * Every real (non-legacy) Program already referencing this exact RADIO
 * Playlist's package lineage (any version) -- legacy hand-authored
 * documents with no `stationId` never match, same "never a false match"
 * discipline as `findExistingProgramForPackage`.
 */
export function findProgramsForStation(
  existingPrograms: readonly RadioProgramSummary[],
  stationId: string,
): readonly RadioProgramSummary[] {
  return existingPrograms.filter((p) => p.stationId === stationId);
}

export type ProgramLifecyclePlan =
  | { readonly kind: "create" }
  | { readonly kind: "up_to_date"; readonly program: RadioProgramSummary }
  | { readonly kind: "update_available"; readonly program: RadioProgramSummary }
  | { readonly kind: "ambiguous"; readonly programs: readonly RadioProgramSummary[] };

/**
 * The one decision RadioPlaylistPublishPanel.tsx needs: given every
 * Program already referencing this station and the latest local export,
 * what should the operator be offered? Never mutates or fetches anything
 * -- callers persist nothing here, this only classifies existing state.
 */
export function planProgramLifecycleAction(
  programsForStation: readonly RadioProgramSummary[],
  latestExportBundleVersion: number,
): ProgramLifecyclePlan {
  if (programsForStation.length === 0) return { kind: "create" };
  if (programsForStation.length > 1) return { kind: "ambiguous", programs: programsForStation };
  const program = programsForStation[0];
  return program.bundleVersion === latestExportBundleVersion
    ? { kind: "up_to_date", program }
    : { kind: "update_available", program };
}

/**
 * Collision guard for the update path, symmetric to
 * findExistingProgramForPackage's own creation-time use: is the TARGET
 * version already claimed by some OTHER Program (never the one being
 * updated)? Pure, no Firestore access -- the UI surfaces this as a
 * blocking warning before calling updateRadioProgram.
 */
export function findConflictingProgramForUpdate(
  existingPrograms: readonly RadioProgramSummary[],
  targetProgramId: string,
  stationId: string,
  bundleVersion: number,
): RadioProgramSummary | null {
  const claimant = findExistingProgramForPackage(existingPrograms, stationId, bundleVersion);
  return claimant && claimant.id !== targetProgramId ? claimant : null;
}

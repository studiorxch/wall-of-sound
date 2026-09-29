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
//
// RADIO-04 (batch 0929-6) -- extended with the orchestration this
// lifecycle logic now serves: Program creation/reuse moved out of
// RadioPlaylistPublishPanel.tsx entirely and lives behind the scheduling
// workflow (RadioProgrammingView.tsx) instead. `resolveProgramForSchedule`
// is the ONE place that calls createRadioProgram/updateRadioProgram when
// scheduling a published Playlist -- never duplicated at either call site.

import type { CreateRadioProgramInput, EventRadioRepository, RadioProgramSummary } from "@studiorich/member-identity";
import { generateRadioProgramId } from "@studiorich/member-identity";
import type { RadioWebExportRecord } from "../../data/radioWebBundleTypes";
import { buildRadioPublicPackageBaseUrl } from "./radioWebBundlePlan";
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

export interface SchedulablePlaylist {
  readonly radioPlaylistId: string;
  readonly title: string;
  readonly latestExport: RadioWebExportRecord;
}

/**
 * RADIO-04 -- a RadioPlaylist is offerable in the scheduling workflow only
 * once it has BOTH a real local export AND a matching, actually-succeeded
 * Sites publication for that exact `{slug, bundleVersion}` -- same
 * discipline `RadioPlaylistPublishPanel.tsx`'s own
 * `sitesPublicationForLatestExport` already enforces for Create/Update
 * Program (RADIO-02/03), now the single gate for scheduling instead.
 */
export function listSchedulablePlaylists(
  radioPlaylists: readonly { id: string; title: string }[],
  radioWebExports: readonly RadioWebExportRecord[],
  radioSitesPublications: readonly { radioPlaylistId: string; slug: string; bundleVersion: number }[],
): readonly SchedulablePlaylist[] {
  const result: SchedulablePlaylist[] = [];
  for (const playlist of radioPlaylists) {
    const exports = radioWebExports.filter((r) => r.radioPlaylistId === playlist.id).slice().sort((a, b) => b.bundleVersion - a.bundleVersion);
    const latestExport = exports[0];
    if (!latestExport) continue;
    const published = radioSitesPublications.some(
      (r) => r.radioPlaylistId === playlist.id && r.slug === latestExport.slug && r.bundleVersion === latestExport.bundleVersion,
    );
    if (!published) continue;
    result.push({ radioPlaylistId: playlist.id, title: playlist.title, latestExport });
  }
  return result;
}

/**
 * RADIO-04 -- the ONE place Program creation/reuse happens for the
 * scheduling workflow: resolves the immutable published Package for
 * `schedulable`, then finds/reuses/updates/creates the RadioProgram using
 * the exact same RADIO-03 lifecycle decision (`planProgramLifecycleAction`)
 * already proven in RadioPlaylistPublishPanel.tsx -- never a second
 * Program-construction path. `programId` is preserved across an update
 * (RADIO-03's own guarantee); a genuinely new Program only gets a new id
 * via the existing `generateRadioProgramId()`.
 *
 * `preferredProgramId` lets a caller resolve an "ambiguous" state (more
 * than one Program already references this station) by naming which one
 * to update -- this function NEVER silently picks one on the caller's
 * behalf; omitting it while ambiguous throws.
 */
export async function resolveProgramForSchedule(
  repository: Pick<EventRadioRepository, "createRadioProgram" | "updateRadioProgram">,
  schedulable: SchedulablePlaylist,
  existingProgramsForStation: readonly RadioProgramSummary[],
  preferredProgramId?: string,
): Promise<RadioProgramSummary> {
  const plan = planProgramLifecycleAction(existingProgramsForStation, schedulable.latestExport.bundleVersion);
  if (plan.kind === "up_to_date") return plan.program;

  if (plan.kind === "ambiguous") {
    const chosen = preferredProgramId ? plan.programs.find((p) => p.id === preferredProgramId) : undefined;
    if (!chosen) throw new Error("radio_program_ambiguous_for_station");
    return repository.updateRadioProgram({
      programId: chosen.id,
      title: schedulable.title,
      manifestBaseUrl: buildRadioPublicPackageBaseUrl({ slug: schedulable.latestExport.slug, bundleVersion: schedulable.latestExport.bundleVersion }),
      trackCount: schedulable.latestExport.entryCount,
      totalDurationSeconds: schedulable.latestExport.totalDurationSeconds,
      stationId: schedulable.radioPlaylistId,
      bundleVersion: schedulable.latestExport.bundleVersion,
    });
  }

  const manifestBaseUrl = buildRadioPublicPackageBaseUrl({ slug: schedulable.latestExport.slug, bundleVersion: schedulable.latestExport.bundleVersion });
  const shared = {
    title: schedulable.title,
    manifestBaseUrl,
    trackCount: schedulable.latestExport.entryCount,
    totalDurationSeconds: schedulable.latestExport.totalDurationSeconds,
    stationId: schedulable.radioPlaylistId,
    bundleVersion: schedulable.latestExport.bundleVersion,
  };
  if (plan.kind === "update_available") {
    return repository.updateRadioProgram({ programId: plan.program.id, ...shared });
  }
  const createInput: CreateRadioProgramInput = { programId: generateRadioProgramId(), ...shared };
  return repository.createRadioProgram(createInput);
}

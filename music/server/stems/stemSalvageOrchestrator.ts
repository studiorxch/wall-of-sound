// 0722C_MUSIC_Production_Stem_Export — "Register Existing Stem Set…"
// (also the shared engine behind the Legacy Stem Migration panel). Node-only.
//
// Files arrive already streamed to a staging directory by the
// /stem-salvage-upload route (never buffered whole in server memory — see
// vite.config.ts). This module never adopts an external path as
// authoritative; the files it validates are always the staged copies.
// Requires FULL-LENGTH LOSSLESS PCM WAV — this is enforced structurally by
// stemManifestValidator.ts (an MP3 fails the very first WAV-structure
// check), so the pre-existing Demucs MP3 scratch output can never reach a
// completed set through this path either.

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { isPathConfinedTo, safeStemDirName, resolveTrackSourcePath } from "./stemFsUtils";
import { computeCanonicalIdentity, statSnapshotOf } from "./stemIdentity";
import { sha256File } from "../radio/radioVersionCloneHelper";
import { validateStemSet } from "./stemManifestValidator";
import { finalizeStemSet } from "./stemSetWriter";
import { CANONICAL_SAMPLE_RATE_HZ, CANONICAL_CHANNELS } from "./stemIdentity";
import { STEM_ROLES, type StemRole, type StemSetOrigin, type TrackStemSet } from "../../src/data/trackStemTypes";

export interface SalvageRegistrationParams {
  stemLibraryRoot: string;
  musicLibraryRoot: string;
  stagingDir: string; // already contains the uploaded role files, named <role>-<originalName>
  sourceTrackId: string;
  audioRelPath: string;
  roleAssignments: Record<StemRole, string>; // role -> filename within stagingDir
  confirmed: boolean; // explicit "yes, this is the right parent" flag — required
  origin: StemSetOrigin; // "registered_existing" for the salvage dialog, also used by legacy migration
  engineNotes?: string; // free-text provenance for external/unknown separation tools
}

export interface SalvageRegistrationResult {
  ok: boolean;
  stemSet?: TrackStemSet;
  errorCode?: string;
  message?: string;
}

export async function registerExistingStemSet(params: SalvageRegistrationParams): Promise<SalvageRegistrationResult> {
  const { stemLibraryRoot, musicLibraryRoot, stagingDir, sourceTrackId, audioRelPath, roleAssignments, confirmed } = params;

  if (!confirmed) {
    return { ok: false, errorCode: "CONFIRMATION_REQUIRED", message: "Operator must explicitly confirm the selected parent track before registering." };
  }
  for (const role of STEM_ROLES) {
    if (!roleAssignments[role]) {
      return { ok: false, errorCode: "AMBIGUOUS_ROLE_MAPPING", message: `No file assigned to the ${role} role.` };
    }
  }

  const sourcePath = resolveTrackSourcePath(musicLibraryRoot, audioRelPath);
  if (!isPathConfinedTo(musicLibraryRoot, sourcePath)) {
    return { ok: false, errorCode: "SOURCE_OUTSIDE_LIBRARY", message: "Source path escapes the MUSIC library root." };
  }
  if (!fs.existsSync(sourcePath)) {
    return { ok: false, errorCode: "SOURCE_MISSING", message: `Source file not found: ${audioRelPath}` };
  }

  const scratchWavPath = path.join(stagingDir, "parent-canonical.wav");
  const identityResult = await computeCanonicalIdentity(sourcePath, scratchWavPath);
  if (!identityResult.ok) return { ok: false, errorCode: "IDENTITY_DECODE_FAILED", message: identityResult.reason };

  const sourceRawFileHashAtCreation = sha256File(sourcePath);
  const sourceStatAtCreation = statSnapshotOf(sourcePath);
  if (!sourceStatAtCreation) return { ok: false, errorCode: "SOURCE_STAT_FAILED", message: "Could not stat the source file." };

  const roleFiles: Record<StemRole, string> = {
    vocals: path.join(stagingDir, roleAssignments.vocals),
    drums: path.join(stagingDir, roleAssignments.drums),
    bass: path.join(stagingDir, roleAssignments.bass),
    other: path.join(stagingDir, roleAssignments.other),
  };

  // No frame normalization here — unlike a fresh Demucs run, an externally
  // separated set gets no "close enough, deterministically corrected"
  // allowance. Exact alignment with the current parent is required as-is.
  const validation = validateStemSet({
    files: roleFiles,
    targetFrameCount: identityResult.identity.durationFrames,
    targetSampleRateHz: CANONICAL_SAMPLE_RATE_HZ,
    targetChannels: CANONICAL_CHANNELS,
  });
  if (!validation.ok) {
    return { ok: false, errorCode: "VALIDATION_FAILED", message: validation.issues.map((i) => `${i.role ?? ""} ${i.message}`).join("; ") };
  }

  // Flatten to exactly the 4 canonical filenames before promotion.
  for (const role of STEM_ROLES) {
    const target = path.join(stagingDir, `${role}.wav`);
    if (roleFiles[role] !== target) fs.renameSync(roleFiles[role], target);
  }
  fs.rmSync(scratchWavPath, { force: true });
  const stemsWithCorrectFileNames = { ...validation.stems };
  for (const role of STEM_ROLES) {
    stemsWithCorrectFileNames[role] = { ...stemsWithCorrectFileNames[role], fileName: `${role}.wav` };
  }

  const createdAt = new Date().toISOString();
  const safeTrackId = safeStemDirName(sourceTrackId);
  const finalize = finalizeStemSet({
    stemLibraryRoot,
    safeTrackId,
    stagingDir,
    set: {
      id: randomUUID(),
      sourceTrackId,
      sourceAudioPathAtCreation: audioRelPath,
      sourceAudioIdentity: identityResult.identity,
      sourceRawFileHashAtCreation,
      sourceStatAtCreation,
      sourceAudioProvenance: identityResult.provenance,
      origin: params.origin,
      engine: "external",
      model: params.engineNotes ?? "unknown",
      engineVersion: params.engineNotes ?? "unknown",
      manifestVersion: 1,
      stems: stemsWithCorrectFileNames,
      createdAt,
      completedAt: new Date().toISOString(),
    },
  });
  if (!finalize.ok) return { ok: false, errorCode: "FINALIZE_FAILED", message: finalize.reason };
  return { ok: true, stemSet: finalize.stemSet };
}

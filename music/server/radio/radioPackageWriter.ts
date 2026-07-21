// RadioLoop Library Foundation — package finalization (build spec §5.7).
// Node-only.
//
// Correction #4/#6 (plan review): this sequence is explicitly NOT atomic in
// the ACID sense — it is a sequence with an explicit compensating action.
// The promotion may only report RADIO_READY once the package is confirmed
// present in a successfully rebuilt manifest, never on the strength of the
// file move alone. If the manifest rebuild fails after the package has
// already been moved into packages/, the move itself is rolled back (the
// package directory is moved back into staging) so a retry of the SAME
// operation is an ordinary first attempt against a free path — never a
// "duplicate version" refusal. This deliberately avoids introducing any
// state outside the doctrine's fixed enum (CANDIDATE → VALIDATING →
// RADIO_READY → PUBLISHED → RETIRED) — a rolled-back finalize is reported
// as an ordinary failed promotion, not a new "pending" status.

import fs from "node:fs";
import path from "node:path";
import { writeJsonAtomic, moveFile, ensureDir, removeDirIfExists } from "./radioFsUtils";
import { regenerateManifestOnDisk } from "./radioManifestBuilder";
import { releaseReservation, findReservation } from "./radioIdAssigner";
import { stagingOperationDir } from "./radioStagingFs";
import { writeEncodingReport, writeValidationReport } from "./radioReportWriter";
import type {
  RadioLoopId,
  RadioLoopPackageManifest,
  RadioLoopSourceReference,
  RadioPackageVersion,
  RadioPromotionReport,
  RadioValidationIssue,
} from "../../src/data/radioLoopTypes";

export function packageVersionDir(radioLibraryRoot: string, radioLoopId: RadioLoopId, packageVersion: RadioPackageVersion): string {
  return path.join(radioLibraryRoot, "packages", radioLoopId, `v${packageVersion}`);
}

// §5.8's "never include local absolute paths" applies to portable
// metadata.json itself, not only the aggregate manifest — checked here,
// right before metadata.json is ever written to disk, so a bad path is
// refused loudly rather than silently persisted.
export function findAbsolutePathIssues(metadata: RadioLoopPackageManifest): RadioValidationIssue[] {
  const issues: RadioValidationIssue[] = [];
  const check = (label: string, value: string | undefined) => {
    if (value && (path.isAbsolute(value) || /^[a-zA-Z]:[\\/]/.test(value))) {
      issues.push({ code: "RADIO_METADATA_ABSOLUTE_PATH", message: `${label} must be a relative path, got "${value}"`, severity: "error" });
    }
  };
  check("audio.primary.relativePath", metadata.audio?.primary?.relativePath);
  for (const v of metadata.audio?.variants ?? []) check("audio.variants[].relativePath", v.relativePath);
  for (const s of metadata.stems ?? []) check("stems[].relativePath", s.relativePath);
  return issues;
}

// The package's declared content, derived from metadata itself rather than
// a directory scan — a transient working file (the lossless-intermediate
// WAV, or an omitted/failed stem's .opus) is never declared, so it can
// never be selected here. Caught live: an earlier version moved the whole
// staging directory wholesale and silently shipped input-core.wav inside
// the "immutable" published package.
function declaredPackageFiles(metadata: RadioLoopPackageManifest): string[] {
  const files = ["metadata.json", "source-reference.json", metadata.audio.primary.relativePath];
  for (const v of metadata.audio.variants ?? []) files.push(v.relativePath);
  for (const s of metadata.stems ?? []) files.push(s.relativePath);
  return files;
}

function moveDeclaredFiles(fromDir: string, toDir: string, relativeFiles: string[]): void {
  for (const rel of relativeFiles) moveFile(path.join(fromDir, rel), path.join(toDir, rel));
}

export interface FinalizeInput {
  radioLibraryRoot: string;
  operationId: string;
  radioLoopId: RadioLoopId;
  packageVersion: RadioPackageVersion;
  metadata: RadioLoopPackageManifest;
  sourceReference: RadioLoopSourceReference;
  // Issues/timestamps accumulated by earlier pipeline steps (e.g. a
  // stem-omission warning) — merged into whichever report gets written.
  reportBase: { startedAt: string; priorIssues: RadioValidationIssue[] };
}

export interface FinalizeResult {
  ok: boolean;
  rolledBack: boolean;
  issues: RadioValidationIssue[];
  report: RadioPromotionReport;
  reportPath: string;
}

export async function finalizePackage(input: FinalizeInput): Promise<FinalizeResult> {
  const { radioLibraryRoot, operationId, radioLoopId, packageVersion, metadata, sourceReference, reportBase } = input;
  const completedAt = new Date().toISOString();

  function fail(issues: RadioValidationIssue[], rolledBack: boolean): FinalizeResult {
    const report: RadioPromotionReport = {
      operationId, radioLoopId, packageVersion, finalStatus: "FAILED",
      issues: [...reportBase.priorIssues, ...issues],
      startedAt: reportBase.startedAt, completedAt,
    };
    const reportPath = writeValidationReport(radioLibraryRoot, report);
    return { ok: false, rolledBack, issues, report, reportPath };
  }

  const metadataIssues = findAbsolutePathIssues(metadata);
  if (metadataIssues.length > 0) return fail(metadataIssues, false);

  const reservation = findReservation(radioLibraryRoot, operationId);
  if (!reservation || reservation.radioLoopId !== radioLoopId || reservation.packageVersion !== packageVersion) {
    return fail([{ code: "RADIO_RESERVATION_MISMATCH", message: "No matching reservation for this operation/id/version", severity: "error" }], false);
  }

  const stagingDir = stagingOperationDir(radioLibraryRoot, operationId);
  if (!fs.existsSync(stagingDir)) {
    return fail([{ code: "RADIO_STAGING_MISSING", message: "Staging operation directory not found", severity: "error" }], false);
  }

  // Step 1 — assemble the complete package content while still in staging.
  writeJsonAtomic(path.join(stagingDir, "metadata.json"), metadata);
  writeJsonAtomic(path.join(stagingDir, "source-reference.json"), sourceReference);

  const targetDir = packageVersionDir(radioLibraryRoot, radioLoopId, packageVersion);
  if (fs.existsSync(targetDir)) {
    return fail([{ code: "RADIO_PACKAGE_VERSION_EXISTS", message: `Refusing to overwrite existing package ${radioLoopId} v${packageVersion}`, severity: "error" }], false);
  }

  // Step 2 — move ONLY the package's declared files into
  // packages/<id>/v<version>/. Staging's transient files (the lossless
  // intermediate WAV, any omitted/failed stem) are deliberately left in
  // place until success is fully confirmed (step 5) — so a rollback (step
  // 4) can restore them for a retry without re-uploading anything.
  const relativeFiles = declaredPackageFiles(metadata);
  ensureDir(targetDir);
  moveDeclaredFiles(stagingDir, targetDir, relativeFiles);

  // Step 3 — rebuild the manifest as part of this same sequence.
  const manifestResult = regenerateManifestOnDisk(radioLibraryRoot, completedAt);
  if (!manifestResult.ok) {
    // Step 4 — compensating action: move the same files back into staging
    // (which still has its transient files, untouched) and discard the
    // now-empty target. packages/<id>/v<version>/ no longer exists
    // afterward, so a retry of this exact operation is a normal first
    // attempt, not an overwrite — and needs no re-encoding.
    moveDeclaredFiles(targetDir, stagingDir, relativeFiles);
    removeDirIfExists(targetDir);
    return fail(
      [{ code: "RADIO_MANIFEST_REBUILD_FAILED", message: "Manifest rebuild failed after package move — package rolled back into staging; retry the same operation", severity: "error" }],
      true,
    );
  }

  // Step 5 — package present in a successfully rebuilt manifest: only now
  // may this report RADIO_READY, and only now is the staging operation
  // (and any transient/omitted files it still held) discarded.
  await releaseReservation(radioLibraryRoot, operationId);
  removeDirIfExists(stagingDir);
  const report: RadioPromotionReport = {
    operationId, radioLoopId, packageVersion, finalStatus: "RADIO_READY",
    issues: reportBase.priorIssues, startedAt: reportBase.startedAt, completedAt,
  };
  const reportPath = writeEncodingReport(radioLibraryRoot, report);
  return { ok: true, rolledBack: false, issues: [], report, reportPath };
}

// 0718B_RADIO_Web_Publication_Asset_Export_Bridge — RadioTrack package
// finalization. Node-only. Mirrors radioPackageWriter.finalizePackage's
// exact sequence-with-compensation (0716B corrections #4/#6): a
// preparation may only report RADIO_READY once the package is confirmed
// present in a successfully rebuilt TRACK manifest, never on the strength
// of the file move alone. On manifest failure the declared files are moved
// back into staging and the target removed, so a retry of the SAME
// operation is an ordinary first attempt — never a "duplicate version"
// refusal and never a half-published package.

import fs from "node:fs";
import path from "node:path";
import { writeJsonAtomic, moveFile, ensureDir, removeDirIfExists } from "./radioFsUtils";
import { regenerateTrackManifestOnDisk } from "./radioTrackManifestBuilder";
import { releaseTrackReservation, findTrackReservation } from "./radioTrackIdAssigner";
import { stagingOperationDir } from "./radioStagingFs";
import type { RadioTrackId, RadioTrackPackageManifest } from "../../src/data/radioTrackPackageTypes";
import type { RadioValidationIssue } from "../../src/data/radioLoopTypes";

export function trackPackageVersionDir(trackLibraryRoot: string, radioTrackId: RadioTrackId, packageVersion: number): string {
  return path.join(trackLibraryRoot, "packages", radioTrackId, `v${packageVersion}`);
}

// Same doctrine as the loop writer: portable metadata must never contain a
// local absolute path — refused loudly before anything is written.
export function findTrackAbsolutePathIssues(metadata: RadioTrackPackageManifest): RadioValidationIssue[] {
  const issues: RadioValidationIssue[] = [];
  const check = (label: string, value: string | undefined) => {
    if (value && (path.isAbsolute(value) || /^[a-zA-Z]:[\\/]/.test(value))) {
      issues.push({ code: "RADIO_METADATA_ABSOLUTE_PATH", message: `${label} must be a relative path, got "${value}"`, severity: "error" });
    }
  };
  check("audio.primary.relativePath", metadata.audio?.primary?.relativePath);
  check("source.audioRelPath", metadata.source?.audioRelPath);
  return issues;
}

// Declared content only — the staged transient files (input-core.wav) are
// never declared and can never be selected here (0716B live-caught
// lesson: never move a staging directory wholesale).
function declaredTrackPackageFiles(metadata: RadioTrackPackageManifest): string[] {
  return ["metadata.json", "source-reference.json", metadata.audio.primary.relativePath];
}

function moveDeclaredFiles(fromDir: string, toDir: string, relativeFiles: string[]): void {
  for (const rel of relativeFiles) moveFile(path.join(fromDir, rel), path.join(toDir, rel));
}

// Local-only source reference for a full track — never published, never
// copied into any web bundle.
export interface RadioTrackSourceReference {
  trackId: string;
  audioRelPath: string;
  sourceAssetHash: string;
  resolvedAt: string;
}

export interface RadioTrackPreparationReport {
  operationId: string;
  radioTrackId: RadioTrackId;
  packageVersion: number;
  finalStatus: "RADIO_READY" | "FAILED";
  issues: RadioValidationIssue[];
  startedAt: string;
  completedAt: string;
}

function writeTrackEncodingReport(trackLibraryRoot: string, report: RadioTrackPreparationReport): string {
  const file = path.join(trackLibraryRoot, "reports", "encoding", `${report.radioTrackId}-v${report.packageVersion}-${report.operationId}.json`);
  writeJsonAtomic(file, report);
  return file;
}

function writeTrackValidationReport(trackLibraryRoot: string, report: RadioTrackPreparationReport): string {
  const file = path.join(trackLibraryRoot, "reports", "validation", `${report.operationId}.json`);
  writeJsonAtomic(file, report);
  return file;
}

export interface FinalizeTrackInput {
  trackLibraryRoot: string;
  operationId: string;
  radioTrackId: RadioTrackId;
  packageVersion: number;
  metadata: RadioTrackPackageManifest;
  sourceReference: RadioTrackSourceReference;
  reportBase: { startedAt: string; priorIssues: RadioValidationIssue[] };
}

export interface FinalizeTrackResult {
  ok: boolean;
  rolledBack: boolean;
  issues: RadioValidationIssue[];
  report: RadioTrackPreparationReport;
  reportPath: string;
}

export async function finalizeTrackPackage(input: FinalizeTrackInput): Promise<FinalizeTrackResult> {
  const { trackLibraryRoot, operationId, radioTrackId, packageVersion, metadata, sourceReference, reportBase } = input;
  const completedAt = new Date().toISOString();

  function fail(issues: RadioValidationIssue[], rolledBack: boolean): FinalizeTrackResult {
    const report: RadioTrackPreparationReport = {
      operationId, radioTrackId, packageVersion, finalStatus: "FAILED",
      issues: [...reportBase.priorIssues, ...issues],
      startedAt: reportBase.startedAt, completedAt,
    };
    const reportPath = writeTrackValidationReport(trackLibraryRoot, report);
    return { ok: false, rolledBack, issues, report, reportPath };
  }

  const metadataIssues = findTrackAbsolutePathIssues(metadata);
  if (metadataIssues.length > 0) return fail(metadataIssues, false);

  const reservation = findTrackReservation(trackLibraryRoot, operationId);
  if (!reservation || reservation.radioTrackId !== radioTrackId || reservation.packageVersion !== packageVersion) {
    return fail([{ code: "RADIO_TRACK_RESERVATION_MISMATCH", message: "No matching reservation for this operation/id/version", severity: "error" }], false);
  }

  const stagingDir = stagingOperationDir(trackLibraryRoot, operationId);
  if (!fs.existsSync(stagingDir)) {
    return fail([{ code: "RADIO_TRACK_STAGING_MISSING", message: "Staging operation directory not found", severity: "error" }], false);
  }

  // Step 1 — assemble the complete package content while still in staging.
  writeJsonAtomic(path.join(stagingDir, "metadata.json"), metadata);
  writeJsonAtomic(path.join(stagingDir, "source-reference.json"), sourceReference);

  const targetDir = trackPackageVersionDir(trackLibraryRoot, radioTrackId, packageVersion);
  if (fs.existsSync(targetDir)) {
    return fail([{ code: "RADIO_TRACK_PACKAGE_VERSION_EXISTS", message: `Refusing to overwrite existing package ${radioTrackId} v${packageVersion}`, severity: "error" }], false);
  }

  // Step 2 — move ONLY declared files. Transients stay in staging so a
  // rollback can restore everything for a retry without re-encoding.
  const relativeFiles = declaredTrackPackageFiles(metadata);
  ensureDir(targetDir);
  moveDeclaredFiles(stagingDir, targetDir, relativeFiles);

  // Step 3 — rebuild the track manifest as part of this same sequence.
  const manifestResult = regenerateTrackManifestOnDisk(trackLibraryRoot, completedAt);
  if (!manifestResult.ok) {
    // Step 4 — compensating action. Also prune the now-empty parent ID
    // directory: unlike the loop pipeline (which keeps its reservation
    // across a rollback for a same-operation retry), a track retry is a
    // brand-new prepare call — a leftover empty packages/<id>/ dir would
    // make the ID scanner treat the never-published ID as taken and burn
    // a sequence number on every retry.
    moveDeclaredFiles(targetDir, stagingDir, relativeFiles);
    removeDirIfExists(targetDir);
    const idDir = path.dirname(targetDir);
    if (fs.existsSync(idDir) && fs.readdirSync(idDir).length === 0) removeDirIfExists(idDir);
    return fail(
      [{ code: "RADIO_TRACK_MANIFEST_REBUILD_FAILED", message: "Track manifest rebuild failed after package move — package rolled back into staging; retry the same operation", severity: "error" }],
      true,
    );
  }

  // Step 5 — success: only now release the reservation and discard staging.
  await releaseTrackReservation(trackLibraryRoot, operationId);
  removeDirIfExists(stagingDir);
  const report: RadioTrackPreparationReport = {
    operationId, radioTrackId, packageVersion, finalStatus: "RADIO_READY",
    issues: reportBase.priorIssues, startedAt: reportBase.startedAt, completedAt,
  };
  const reportPath = writeTrackEncodingReport(trackLibraryRoot, report);
  return { ok: true, rolledBack: false, issues: [], report, reportPath };
}

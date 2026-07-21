// RadioLoop Library Workspace (0717A) — the shared "clone a version
// forward" primitive both radioMetadataRevisionOrchestrator.ts and
// radioRetirementOrchestrator.ts need. Node-only.
//
// Neither metadata revision nor retirement may ever mutate an existing
// immutable package version — both create a brand-new version whose audio
// assets are byte-identical to the source (never re-encoded). This module
// resolves the disk-authoritative current version (never the manifest,
// which may already suppress a fully-retired RadioLoop — see
// radioManifestBuilder.ts's decision-2 change), validates it's eligible to
// be cloned forward, allocates the next version via 0716B's existing
// concurrency-safe reservation authority, and copies+hash-verifies the
// declared assets into staging.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { packageVersionDir } from "./radioPackageWriter";
import { createStagingOperation, cleanupStagingOperation } from "./radioStagingFs";
import { reserveRadioLoopId, releaseReservation } from "./radioIdAssigner";
import { findHighestPackageVersion } from "./radioPackageDirectoryWalker";
import type { RadioLoopId, RadioLoopPackageManifest, RadioPackageVersion, RadioValidationIssue } from "../../src/data/radioLoopTypes";

export interface CloneVersionForwardResult {
  ok: boolean;
  operationId: string;
  radioLoopId: RadioLoopId;
  sourcePackageVersion: RadioPackageVersion;
  newPackageVersion: RadioPackageVersion;
  stagingDir: string;
  sourceMetadata: RadioLoopPackageManifest;
  assetHashMatch: boolean;
  issues: RadioValidationIssue[];
}

export interface CloneVersionForwardFailure {
  ok: false;
  issues: RadioValidationIssue[];
}

// 0718B — exported: the repo's single content-hash primitive, reused by
// RadioTrack packaging (source/encoded/manifest hashes) and the web-bundle
// writer/validator.
export function sha256File(filePath: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function declaredAssetRelativePaths(metadata: RadioLoopPackageManifest): string[] {
  const files = [metadata.audio.primary.relativePath];
  for (const v of metadata.audio.variants ?? []) files.push(v.relativePath);
  for (const s of metadata.stems ?? []) files.push(s.relativePath);
  return files;
}

// `expectedSourcePackageVersion`, when provided, is an optimistic-
// concurrency check: the caller (e.g. a metadata-edit dialog) asserts which
// version it based its edit on — if the disk-authoritative current version
// has since moved on, the clone is refused rather than silently revising a
// stale version. Retirement always clones the current highest version and
// passes no expectation.
export async function cloneVersionForward(
  radioLibraryRoot: string,
  operationId: string,
  radioLoopId: RadioLoopId,
  expectedSourcePackageVersion?: RadioPackageVersion,
): Promise<CloneVersionForwardResult | CloneVersionForwardFailure> {
  const current = findHighestPackageVersion(radioLibraryRoot, radioLoopId);
  if (!current) {
    return { ok: false, issues: [{ code: "RADIO_SOURCE_VERSION_NOT_FOUND", message: `No package version found for ${radioLoopId}`, severity: "error" }] };
  }
  if (current.metadata.status === "RETIRED") {
    return { ok: false, issues: [{ code: "RADIO_SOURCE_ALREADY_RETIRED", message: `${radioLoopId}'s current version is already RETIRED`, severity: "error" }] };
  }
  if (expectedSourcePackageVersion != null && expectedSourcePackageVersion !== current.packageVersion) {
    return {
      ok: false,
      issues: [{
        code: "RADIO_SOURCE_VERSION_STALE",
        message: `Edit was based on v${expectedSourcePackageVersion} but the current version is v${current.packageVersion}`,
        severity: "error",
      }],
    };
  }

  const sourceMetadata = current.metadata;
  const sourceDir = packageVersionDir(radioLibraryRoot, radioLoopId, current.packageVersion);

  const alloc = await reserveRadioLoopId(radioLibraryRoot, operationId, sourceMetadata.source.trackId, sourceMetadata.source.loopId);
  if (alloc.radioLoopId !== radioLoopId) {
    return { ok: false, issues: [{ code: "RADIO_ID_ALLOCATION_MISMATCH", message: "Allocated a different RadioLoop ID than the one being cloned", severity: "error" }] };
  }

  const stagingDir = createStagingOperation(radioLibraryRoot, operationId);

  let assetHashMatch = true;
  try {
    for (const relativePath of declaredAssetRelativePaths(sourceMetadata)) {
      const srcPath = path.join(sourceDir, relativePath);
      const destPath = path.join(stagingDir, relativePath);
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.copyFileSync(srcPath, destPath);
      if (sha256File(srcPath) !== sha256File(destPath)) assetHashMatch = false;
    }
  } catch (e) {
    // Don't leave an orphaned reservation/staging dir behind a transient
    // copy failure (e.g. a source file unreadable mid-copy).
    cleanupStagingOperation(radioLibraryRoot, operationId);
    await releaseReservation(radioLibraryRoot, operationId);
    return { ok: false, issues: [{ code: "RADIO_CLONE_COPY_FAILED", message: `Failed to copy source assets: ${String(e)}`, severity: "error" }] };
  }

  return {
    ok: true,
    operationId,
    radioLoopId,
    sourcePackageVersion: current.packageVersion,
    newPackageVersion: alloc.packageVersion,
    stagingDir,
    sourceMetadata,
    assetHashMatch,
    issues: [],
  };
}

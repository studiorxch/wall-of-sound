// RadioLoop Library Workspace (0717A) — POST /radio-package-revise-metadata.
// Node-only. Package versions are immutable: this composes
// radioVersionCloneHelper (copy + hash-verify the unchanged audio) with a
// freshly-assembled metadata.json and calls 0716B's finalizePackage(...)
// verbatim — no re-encoding, no mutation of the source version.

import path from "node:path";
import { cloneVersionForward } from "./radioVersionCloneHelper";
import { finalizePackage, packageVersionDir } from "./radioPackageWriter";
import { releaseReservation } from "./radioIdAssigner";
import { readJsonSafe } from "./radioFsUtils";
import {
  isValidRadioArrangementRole,
  type RadioLoopId,
  type RadioLoopPackageManifest,
  type RadioLoopSourceReference,
  type RadioPackageVersion,
  type RadioValidationIssue,
} from "../../src/data/radioLoopTypes";

export interface MetadataEditRequest {
  radioLoopId: RadioLoopId;
  sourcePackageVersion: RadioPackageVersion;
  title?: string;
  roles: string[];
  energy?: number;
  density?: number;
  stability?: number;
  maximumConsecutiveRepeats?: number;
  minimumRestCycles?: number;
  transitionIn?: string[];
  transitionOut?: string[];
  publicUseApproved: boolean;
}

export interface ReviseMetadataResult {
  ok: boolean;
  radioLoopId?: RadioLoopId;
  packageVersion?: RadioPackageVersion;
  assetHashMatch?: boolean;
  issues: RadioValidationIssue[];
}

// §8.6 — client validation supplements but never replaces this. Mirrors
// (but does not import, to keep this Node-only module independent of the
// browser bundle) the shape src/logic/radio/radioMetadataEditValidator.ts
// applies client-side.
export function validateMetadataEditRequest(request: MetadataEditRequest): RadioValidationIssue[] {
  const issues: RadioValidationIssue[] = [];
  if (!request.roles || request.roles.length === 0) {
    issues.push({ code: "RADIO_EDIT_ROLE_REQUIRED", message: "At least one role is required", severity: "error" });
  } else {
    for (const role of request.roles) {
      if (!isValidRadioArrangementRole(role)) {
        issues.push({ code: "RADIO_EDIT_UNKNOWN_ROLE", message: `"${role}" is not a valid RADIO role`, severity: "error" });
      }
    }
  }
  // 0717C_MUSIC_Complete_Song_Intelligence_and_Section_Map §3.4 — no
  // Compatibility Family requirement.
  for (const [label, value] of [["energy", request.energy], ["density", request.density], ["stability", request.stability]] as const) {
    if (value != null && (value < 0 || value > 1)) {
      issues.push({ code: "RADIO_EDIT_FIELD_OUT_OF_RANGE", message: `${label} must be between 0 and 1`, severity: "error" });
    }
  }
  if (request.maximumConsecutiveRepeats != null && (!Number.isInteger(request.maximumConsecutiveRepeats) || request.maximumConsecutiveRepeats < 1)) {
    issues.push({ code: "RADIO_EDIT_FIELD_OUT_OF_RANGE", message: "maximumConsecutiveRepeats must be an integer >= 1", severity: "error" });
  }
  if (request.minimumRestCycles != null && (!Number.isInteger(request.minimumRestCycles) || request.minimumRestCycles < 0)) {
    issues.push({ code: "RADIO_EDIT_FIELD_OUT_OF_RANGE", message: "minimumRestCycles must be an integer >= 0", severity: "error" });
  }
  return issues;
}

export async function reviseRadioLoopMetadata(radioLibraryRoot: string, operationId: string, request: MetadataEditRequest): Promise<ReviseMetadataResult> {
  const requestIssues = validateMetadataEditRequest(request);
  if (requestIssues.length > 0) return { ok: false, issues: requestIssues };

  const clone = await cloneVersionForward(radioLibraryRoot, operationId, request.radioLoopId, request.sourcePackageVersion);
  if (!clone.ok) return { ok: false, issues: clone.issues };

  const sourceDir = packageVersionDir(radioLibraryRoot, request.radioLoopId, clone.sourcePackageVersion);
  const sourceReference = readJsonSafe<RadioLoopSourceReference>(path.join(sourceDir, "source-reference.json"));

  const metadata: RadioLoopPackageManifest = {
    ...clone.sourceMetadata,
    packageVersion: clone.newPackageVersion,
    title: request.title,
    musical: clone.sourceMetadata.musical,
    arrangement: {
      roles: request.roles,
      // 0717C — never carried forward, even from a legacy source version
      // that has one. Every new package version (promotion, revision, or
      // retirement clone-forward) omits familyIds going forward; only
      // versions already on disk before this build keep their legacy
      // value (RadioArrangementMetadata.familyIds is now optional/
      // deprecated, retained purely for read-compatibility).
      energy: request.energy,
      density: request.density,
      stability: request.stability,
      maximumConsecutiveRepeats: request.maximumConsecutiveRepeats,
      minimumRestCycles: request.minimumRestCycles,
      transitionIn: request.transitionIn,
      transitionOut: request.transitionOut,
    },
    // Only re-stamp approvedAt when the approval value itself actually
    // changes — otherwise carry the prior timestamp forward unchanged, same
    // doctrine as the asset-identity fields, so compareRadioLoopVersions's
    // approvalChanged reflects a real approval decision, not just "a new
    // version was created."
    approval: request.publicUseApproved === clone.sourceMetadata.approval.publicUseApproved
      ? clone.sourceMetadata.approval
      : { publicUseApproved: request.publicUseApproved, approvedAt: new Date().toISOString() },
    retirement: undefined,
  };

  const refreshedSourceReference: RadioLoopSourceReference = sourceReference
    ? { ...sourceReference, resolvedAt: new Date().toISOString() }
    : { trackId: metadata.source.trackId, loopId: metadata.source.loopId, startSeconds: 0, endSeconds: 0, resolvedAt: new Date().toISOString() };

  // finalizePackage itself writes metadata.json/source-reference.json into
  // staging as its own first step (radioPackageWriter.ts) — no need to
  // pre-write them here, only cloneVersionForward's copied AUDIO assets
  // needed to already be in staging, which they are.
  const finalizeResult = await finalizePackage({
    radioLibraryRoot,
    operationId,
    radioLoopId: request.radioLoopId,
    packageVersion: clone.newPackageVersion,
    metadata,
    sourceReference: refreshedSourceReference,
    reportBase: { startedAt: new Date().toISOString(), priorIssues: [] },
  });

  // See radioRetirementOrchestrator.ts's identical comment: each call here
  // is a self-contained operation with its own fresh operationId, so a
  // failed attempt's reservation is released rather than left orphaned.
  if (!finalizeResult.ok) await releaseReservation(radioLibraryRoot, operationId);

  return {
    ok: finalizeResult.ok,
    radioLoopId: request.radioLoopId,
    packageVersion: clone.newPackageVersion,
    assetHashMatch: clone.assetHashMatch,
    issues: finalizeResult.report.issues,
  };
}

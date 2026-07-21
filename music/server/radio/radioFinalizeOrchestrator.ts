// RadioLoop Library Foundation — server-side composition for the
// "validate encoded assets → write metadata → finalize package" segment of
// the promotion pipeline (build spec §5.9, steps 7-9). Node-only.
//
// Metadata's `audio`/`stems` sections are filled in from what the server
// itself actually probed/decoded — never from client-reported numbers —
// matching the same "never trust a client-supplied number" principle
// radioOpusDecodeVerify.ts already applies to duration.

import fs from "node:fs";
import path from "node:path";
import { validateEncodedCore } from "./radioEncodedAudioValidator";
import { validateStems, type StemInput } from "./radioStemValidator";
import { probeOpusFile } from "./radioAudioProbe";
import { finalizePackage, type FinalizeResult } from "./radioPackageWriter";
import { stagingOperationDir } from "./radioStagingFs";
import { writeValidationReport } from "./radioReportWriter";
import {
  RADIO_OPUS_ENCODING_POLICY,
  type RadioApprovalMetadata,
  type RadioArrangementMetadata,
  type RadioLoopId,
  type RadioLoopPackageManifest,
  type RadioLoopSourceReference,
  type RadioMusicalMetadata,
  type RadioPackageVersion,
  type RadioPromotionReport,
  type RadioValidationIssue,
} from "../../src/data/radioLoopTypes";

export interface ValidateAndFinalizeInput {
  radioLibraryRoot: string;
  operationId: string;
  radioLoopId: RadioLoopId;
  packageVersion: RadioPackageVersion;
  sourceReference: RadioLoopSourceReference;
  musical: RadioMusicalMetadata;
  arrangement: RadioArrangementMetadata;
  approval: RadioApprovalMetadata;
  startedAt: string;
}

export interface ValidateAndFinalizeResult {
  ok: boolean;
  rolledBack: boolean;
  stemsOmitted: boolean;
  stemsOmittedReason?: string;
  issues: RadioValidationIssue[];
  report: RadioPromotionReport;
  reportPath: string;
}

function coreWavPath(stagingDir: string): string {
  return path.join(stagingDir, "input-core.wav");
}
function coreOpusPath(stagingDir: string): string {
  return path.join(stagingDir, "core.opus");
}
function stemsDir(stagingDir: string): string {
  return path.join(stagingDir, "stems");
}

function discoverStagedStems(stagingDir: string): StemInput[] {
  const dir = stemsDir(stagingDir);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith(".opus"))
    .map((f) => ({ name: f.replace(/\.opus$/, ""), opusPath: path.join(dir, f) }));
}

function failureReport(input: ValidateAndFinalizeInput, issues: RadioValidationIssue[]): { report: RadioPromotionReport; reportPath: string } {
  const report: RadioPromotionReport = {
    operationId: input.operationId,
    radioLoopId: input.radioLoopId,
    packageVersion: input.packageVersion,
    finalStatus: "FAILED",
    issues,
    startedAt: input.startedAt,
    completedAt: new Date().toISOString(),
  };
  const reportPath = writeValidationReport(input.radioLibraryRoot, report);
  return { report, reportPath };
}

export async function validateAndFinalizePackage(input: ValidateAndFinalizeInput): Promise<ValidateAndFinalizeResult> {
  const stagingDir = stagingOperationDir(input.radioLibraryRoot, input.operationId);

  if (!fs.existsSync(coreOpusPath(stagingDir)) || !fs.existsSync(coreWavPath(stagingDir))) {
    const { report, reportPath } = failureReport(input, [
      { code: "RADIO_CORE_NOT_ENCODED", message: "No encoded core found for this operation — encode the core before finalizing", severity: "error" },
    ]);
    return { ok: false, rolledBack: false, stemsOmitted: false, issues: report.issues, report, reportPath };
  }

  const coreValidation = await validateEncodedCore(coreOpusPath(stagingDir), coreWavPath(stagingDir), stagingDir);
  if (!coreValidation.ok || coreValidation.decodeVerify.decodedFrameCount == null) {
    const { report, reportPath } = failureReport(input, coreValidation.issues);
    return { ok: false, rolledBack: false, stemsOmitted: false, issues: report.issues, report, reportPath };
  }

  const stemInputs = discoverStagedStems(stagingDir);
  const stemValidation = await validateStems(stemInputs, coreValidation.decodeVerify.decodedFrameCount, stagingDir);

  const stemAssets = stemValidation.includedStems.length > 0
    ? await Promise.all(stemValidation.includedStems.map(async (s) => {
        const probe = await probeOpusFile(s.opusPath);
        return { name: s.name, relativePath: `stems/${s.name}.opus`, channels: probe.channels ?? 2, durationSeconds: probe.durationSeconds ?? 0 };
      }))
    : undefined;

  const metadata: RadioLoopPackageManifest = {
    schemaVersion: "1.0.0",
    radioLoopId: input.radioLoopId,
    packageVersion: input.packageVersion,
    status: "RADIO_READY",
    source: { trackId: input.sourceReference.trackId, loopId: input.sourceReference.loopId },
    audio: {
      primary: {
        codec: "opus",
        container: "ogg",
        mimeType: RADIO_OPUS_ENCODING_POLICY.mimeType,
        relativePath: "core.opus",
        bitrateKbps: RADIO_OPUS_ENCODING_POLICY.bitrateKbps,
        channels: coreValidation.probe.channels ?? 2,
        durationSeconds: coreValidation.probe.durationSeconds ?? 0,
      },
      variants: [],
    },
    stems: stemAssets,
    musical: input.musical,
    arrangement: input.arrangement,
    approval: input.approval,
  };

  const finalizeResult: FinalizeResult = await finalizePackage({
    radioLibraryRoot: input.radioLibraryRoot,
    operationId: input.operationId,
    radioLoopId: input.radioLoopId,
    packageVersion: input.packageVersion,
    metadata,
    sourceReference: input.sourceReference,
    reportBase: { startedAt: input.startedAt, priorIssues: [...coreValidation.issues, ...stemValidation.issues] },
  });

  return {
    ok: finalizeResult.ok,
    rolledBack: finalizeResult.rolledBack,
    stemsOmitted: stemValidation.omitted,
    stemsOmittedReason: stemValidation.omittedReason,
    issues: finalizeResult.report.issues,
    report: finalizeResult.report,
    reportPath: finalizeResult.reportPath,
  };
}

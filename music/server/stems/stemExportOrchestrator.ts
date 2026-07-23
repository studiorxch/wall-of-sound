// 0722C_MUSIC_Production_Stem_Export — the full per-job pipeline for ONE
// Demucs export, executed inside one server-tracked job so rollback never
// spans requests. Node-only. Modeled directly on
// radioTrackPackagePipeline.ts's confine -> stage -> process -> validate ->
// finalize shape.
//
// Sequence: confine+read parent -> compute canonical identity (the staged
// WAV this produces is what Demucs actually runs against) -> resolve the
// separation device from a fresh engine check (never hardcoded) -> spawn
// Demucs -> re-verify the parent's raw bytes are unchanged (catches "parent
// changed mid-job") -> normalize each stem's frame count to the parent's
// exact frame count -> validate all 4 (lossless WAV, aligned, non-zero,
// finite) -> atomically promote.

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { ChildProcess } from "node:child_process";
import { isPathConfinedTo, resolveTrackSourcePath } from "./stemFsUtils";
import { createStagingOperation, cleanupStagingOperation } from "./stemStagingFs";
import { safeStemDirName } from "./stemFsUtils";
import { computeCanonicalIdentity, statSnapshotOf } from "./stemIdentity";
import { sha256File } from "../radio/radioVersionCloneHelper";
import { checkStemEngine } from "./stemEngineCheck";
import { runDemucsSeparationWithFallback } from "./stemSeparationRunner";
import { normalizeStemFrameCount } from "./stemFrameNormalizer";
import { validateStemSet } from "./stemManifestValidator";
import { finalizeStemSet } from "./stemSetWriter";
import { STEM_ROLES, type StemRole, type TrackStemSet } from "../../src/data/trackStemTypes";
import { CANONICAL_SAMPLE_RATE_HZ, CANONICAL_CHANNELS } from "./stemIdentity";

export interface StemExportJobParams {
  stemLibraryRoot: string;
  musicLibraryRoot: string;
  sourceTrackId: string;
  audioRelPath: string;
  operationId: string;
}

export type StemExportPhase = "preparing" | "separating" | "validating" | "archiving";

export interface StemExportCallbacks {
  onPhase?: (phase: StemExportPhase) => void;
  onChildSpawned?: (child: ChildProcess) => void;
}

export interface StemExportJobResult {
  ok: boolean;
  stemSet?: TrackStemSet;
  errorCode?: string;
  message?: string;
}

export async function runStemExportJob(params: StemExportJobParams, callbacks: StemExportCallbacks = {}): Promise<StemExportJobResult> {
  const { stemLibraryRoot, musicLibraryRoot, sourceTrackId, audioRelPath, operationId } = params;

  const sourcePath = resolveTrackSourcePath(musicLibraryRoot, audioRelPath);
  if (!isPathConfinedTo(musicLibraryRoot, sourcePath)) {
    return { ok: false, errorCode: "SOURCE_OUTSIDE_LIBRARY", message: "Source path escapes the MUSIC library root." };
  }
  if (!fs.existsSync(sourcePath)) {
    return { ok: false, errorCode: "SOURCE_MISSING", message: `Source file not found: ${audioRelPath}` };
  }

  callbacks.onPhase?.("preparing");
  const stagingDir = createStagingOperation(stemLibraryRoot, operationId);
  const stagedParentWavPath = path.join(stagingDir, "parent-canonical.wav");

  async function abort(errorCode: string, message: string): Promise<StemExportJobResult> {
    cleanupStagingOperation(stemLibraryRoot, operationId);
    return { ok: false, errorCode, message };
  }

  const identityResult = await computeCanonicalIdentity(sourcePath, stagedParentWavPath);
  if (!identityResult.ok) return abort("IDENTITY_DECODE_FAILED", identityResult.reason);

  const sourceRawFileHashAtCreation = sha256File(sourcePath);
  const sourceStatAtCreation = statSnapshotOf(sourcePath);
  if (!sourceStatAtCreation) return abort("SOURCE_STAT_FAILED", "Could not stat the source file.");

  const engineCheck = await checkStemEngine();
  if (!engineCheck.ok) {
    return abort("ENGINE_NOT_READY", `Stem separation environment isn't ready: ${engineCheck.missing.join("; ")}. Run: ${engineCheck.setupCommand}`);
  }
  const preferredDevice = engineCheck.mpsAvailable ? "mps" : "cpu";

  callbacks.onPhase?.("separating");
  const separation = await runDemucsSeparationWithFallback(
    engineCheck.pythonPath, stagingDir, stagedParentWavPath, preferredDevice, callbacks.onChildSpawned,
  );
  if (!separation.ok || !separation.outputDir) {
    return abort("SEPARATION_FAILED", `Demucs separation failed (device ${separation.device}, exit ${separation.exitCode}): ${separation.stderrTail.slice(-500)}`);
  }

  // Re-verify the parent wasn't replaced WHILE Demucs was running.
  let postRunHash: string;
  try {
    postRunHash = sha256File(sourcePath);
  } catch {
    return abort("SOURCE_UNREADABLE_POST_RUN", "Could not re-read the source file after separation.");
  }
  if (postRunHash !== sourceRawFileHashAtCreation) {
    return abort("SOURCE_CHANGED_MID_JOB", "The parent track's audio changed while separation was running — this job's output is discarded.");
  }

  callbacks.onPhase?.("validating");
  const roleFiles: Record<StemRole, string> = {
    vocals: path.join(separation.outputDir, "vocals.wav"),
    drums: path.join(separation.outputDir, "drums.wav"),
    bass: path.join(separation.outputDir, "bass.wav"),
    other: path.join(separation.outputDir, "other.wav"),
  };
  for (const role of STEM_ROLES) {
    if (!fs.existsSync(roleFiles[role])) continue; // let validateStemSet report the specific missing-file issue
    const norm = normalizeStemFrameCount(roleFiles[role], identityResult.identity.durationFrames);
    if (!norm.ok) return abort("FRAME_NORMALIZATION_FAILED", `${role}: ${norm.reason}`);
  }
  const validation = validateStemSet({
    files: roleFiles,
    targetFrameCount: identityResult.identity.durationFrames,
    targetSampleRateHz: CANONICAL_SAMPLE_RATE_HZ,
    targetChannels: CANONICAL_CHANNELS,
  });
  if (!validation.ok) {
    return abort("VALIDATION_FAILED", validation.issues.map((i) => `${i.role ?? ""} ${i.message}`).join("; "));
  }

  callbacks.onPhase?.("archiving");
  // Flatten staging to exactly the 4 validated files before promotion —
  // the canonical parent scratch WAV and the demucs/<model>/<basename>/
  // nesting are never part of the archived set.
  for (const role of STEM_ROLES) {
    fs.renameSync(roleFiles[role], path.join(stagingDir, `${role}.wav`));
  }
  fs.rmSync(path.dirname(separation.outputDir), { recursive: true, force: true }); // stagingDir/<model>/
  fs.rmSync(stagedParentWavPath, { force: true });

  const flattenedFiles: Record<StemRole, string> = {
    vocals: path.join(stagingDir, "vocals.wav"),
    drums: path.join(stagingDir, "drums.wav"),
    bass: path.join(stagingDir, "bass.wav"),
    other: path.join(stagingDir, "other.wav"),
  };
  const stemsWithCorrectFileNames = { ...validation.stems };
  for (const role of STEM_ROLES) {
    stemsWithCorrectFileNames[role] = { ...stemsWithCorrectFileNames[role], fileName: path.basename(flattenedFiles[role]) };
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
      origin: "demucs",
      engine: "demucs",
      model: "htdemucs",
      engineVersion: engineCheck.demucsVersion ?? "unknown",
      engineDevice: separation.device,
      manifestVersion: 1,
      stems: stemsWithCorrectFileNames,
      createdAt,
      completedAt: new Date().toISOString(),
    },
  });
  if (!finalize.ok) {
    cleanupStagingOperation(stemLibraryRoot, operationId);
    return { ok: false, errorCode: "FINALIZE_FAILED", message: finalize.reason };
  }

  return { ok: true, stemSet: finalize.stemSet };
}

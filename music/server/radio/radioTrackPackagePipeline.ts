// 0718B_RADIO_Web_Publication_Asset_Export_Bridge — the full RadioTrack
// preparation pipeline for ONE track, executed inside one server request
// so rollback never spans HTTP calls. Node-only.
//
// Sequence: confine + read source → sha256 source (sourceAssetHash) →
// approval-currency check → reuse short-circuit → reserve ID/version →
// stage → decode source to the canonical 24-bit PCM baseline (pcm_s24le;
// never a 16-bit bottleneck before the Opus encode — 0718B plan
// correction) → encode with RADIO_TRACK_OPUS_ENCODING_POLICY → real
// ffprobe → real decode-back frame-exact verification at 48kHz → hash
// encoded output → finalize atomically (manifest rebuild or rollback) →
// re-hash source to prove byte-identity. Source audio is only ever read;
// no normalization/EQ/limiting/trim/time-stretch anywhere.

import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { isPathConfinedTo } from "./radioFsUtils";
import { sha256File } from "./radioVersionCloneHelper";
import { createStagingOperation, stagingOperationDir, cleanupStagingOperation } from "./radioStagingFs";
import { reserveRadioTrackId, releaseTrackReservation, findExistingRadioTrackId } from "./radioTrackIdAssigner";
import { findHighestTrackPackageVersion } from "./radioTrackPackageWalker";
import { finalizeTrackPackage, trackPackageVersionDir } from "./radioTrackPackageWriter";
import { encodeOpusToFile } from "./radioOpusEncoder";
import { probeOpusFile } from "./radioAudioProbe";
import { decodeOpusFrameCount, computeExpectedDecodedFrames, framesMatchWithinTolerance } from "./radioOpusDecodeVerify";
import { readWavStreamInfoFromFile } from "./radioWavFrameCounter";
import {
  RADIO_TRACK_OPUS_ENCODING_POLICY,
  type RadioTrackPackageManifest,
  type RadioTrackPrepareRequest,
  type RadioTrackPrepareResponse,
} from "../../src/data/radioTrackPackageTypes";
import { RADIO_OPUS_FRAME_TOLERANCE } from "../../src/data/radioLoopTypes";
import type { RadioValidationIssue } from "../../src/data/radioLoopTypes";

const SCHEMA_VERSION = "1.0.0";
const STDERR_TAIL_CHARS = 4000;

function issue(code: string, message: string): RadioValidationIssue {
  return { code, message, severity: "error" };
}

// Minimal source probe (channels only) — parseProbeOutput deliberately
// enforces opus/ogg and is NOT reused here; the source may be mp3/wav/
// anything ffmpeg decodes.
function probeSourceChannels(sourcePath: string): Promise<{ ok: boolean; channels: number | null; stderrTail: string }> {
  const args = ["-v", "quiet", "-print_format", "json", "-show_streams", sourcePath];
  return new Promise((resolve) => {
    execFile("ffprobe", args, { maxBuffer: 1024 * 1024 * 16 }, (error, stdout, stderr) => {
      if (error) return resolve({ ok: false, channels: null, stderrTail: (stderr ?? "").slice(-STDERR_TAIL_CHARS) });
      try {
        const parsed = JSON.parse(stdout) as { streams?: Array<{ codec_type?: string; channels?: number }> };
        const audio = parsed.streams?.find((s) => s.codec_type === "audio");
        resolve({ ok: audio != null, channels: audio?.channels ?? null, stderrTail: "" });
      } catch {
        resolve({ ok: false, channels: null, stderrTail: "unparseable ffprobe output" });
      }
    });
  });
}

// Pure — exported for argument-contract tests. Decode-to-staging args:
// 24-bit integer PCM baseline, metadata stripped, bitexact (no LIST/INFO
// chunk), stereo downmix ONLY when the source has more than 2 channels
// (channel policy documented in RADIO_TRACK_OPUS_ENCODING_POLICY).
export function buildSourceDecodeArgs(sourcePath: string, stagedWavPath: string, sourceChannels: number | null): string[] {
  const downmix = sourceChannels != null && sourceChannels > RADIO_TRACK_OPUS_ENCODING_POLICY.maxChannels;
  return [
    "-y",
    "-i", sourcePath,
    "-map_metadata", "-1",
    "-c:a", RADIO_TRACK_OPUS_ENCODING_POLICY.stagingPcmCodec,
    ...(downmix ? ["-ac", String(RADIO_TRACK_OPUS_ENCODING_POLICY.maxChannels)] : []),
    "-fflags", "+bitexact",
    "-f", "wav",
    stagedWavPath,
  ];
}

function decodeSourceToStagedWav(sourcePath: string, stagedWavPath: string, sourceChannels: number | null): Promise<{ ok: boolean; stderrTail: string }> {
  fs.mkdirSync(path.dirname(stagedWavPath), { recursive: true });
  if (fs.existsSync(stagedWavPath)) fs.rmSync(stagedWavPath);
  const args = buildSourceDecodeArgs(sourcePath, stagedWavPath, sourceChannels);
  return new Promise((resolve) => {
    execFile("ffmpeg", args, { maxBuffer: 1024 * 1024 * 16 }, (error, _stdout, stderr) => {
      const wrote = fs.existsSync(stagedWavPath) && fs.statSync(stagedWavPath).size > 0;
      resolve({ ok: !error && wrote, stderrTail: (stderr ?? "").slice(-STDERR_TAIL_CHARS) });
    });
  });
}

export interface PrepareTrackPackageParams {
  trackLibraryRoot: string;
  musicLibraryRoot: string;
  request: RadioTrackPrepareRequest;
}

export async function prepareTrackPackage(params: PrepareTrackPackageParams): Promise<RadioTrackPrepareResponse> {
  const { trackLibraryRoot, musicLibraryRoot, request } = params;
  const startedAt = new Date().toISOString();

  // 1 — confine + read the source. audioRelPath must resolve inside the
  // MUSIC library root; the source file is only ever read.
  const sourcePath = path.resolve(musicLibraryRoot, request.audioRelPath);
  if (!isPathConfinedTo(musicLibraryRoot, sourcePath)) {
    return { ok: false, reused: false, issues: [issue("RADIO_TRACK_SOURCE_OUTSIDE_LIBRARY", "Source path escapes the MUSIC library root")] };
  }
  if (!fs.existsSync(sourcePath)) {
    return { ok: false, reused: false, issues: [issue("RADIO_TRACK_SOURCE_MISSING", `Source file not found: ${request.audioRelPath}`)] };
  }

  // 2 — the source identity is the hash of the ORIGINAL file bytes.
  const sourceAssetHash = sha256File(sourcePath);

  // 3 — approval currency is enforced server-side: the curator approved
  // exactly these source bytes, or the preparation is refused (a stale
  // approval never silently carries forward).
  if (!request.approval?.approved || request.approval.sourceAssetHash !== sourceAssetHash) {
    return { ok: false, reused: false, issues: [issue("RADIO_TRACK_APPROVAL_STALE", "Curator approval is missing or bound to different source bytes — re-approve the entry")] };
  }

  // 4 — reuse short-circuit: an existing latest version with the same
  // source hash and intact assets is returned instead of re-encoding,
  // unless the caller explicitly forces a new version.
  const existingId = findExistingRadioTrackId(trackLibraryRoot, request.sourceTrackId);
  if (existingId && !request.forceNewVersion) {
    const highest = findHighestTrackPackageVersion(trackLibraryRoot, existingId);
    if (highest && highest.metadata.status === "RADIO_READY" && highest.metadata.sourceAssetHash === sourceAssetHash) {
      const pkgDir = trackPackageVersionDir(trackLibraryRoot, existingId, highest.packageVersion);
      const audioPath = path.join(pkgDir, highest.metadata.audio.primary.relativePath);
      const metadataPath = path.join(pkgDir, "metadata.json");
      if (fs.existsSync(audioPath) && sha256File(audioPath) === highest.metadata.audio.primary.sha256) {
        return {
          ok: true,
          reused: true,
          radioTrackId: existingId,
          packageVersion: highest.packageVersion,
          sourceAssetHash,
          packageManifestHash: sha256File(metadataPath),
          durationSeconds: highest.metadata.audio.primary.durationSeconds,
          byteSize: highest.metadata.audio.primary.byteSize,
          issues: [],
        };
      }
      // An intact-looking reuse candidate that fails its own hash check is
      // treated as stale — fall through and prepare a NEW version; the old
      // version is never touched or regenerated in place.
    }
  }

  // 5 — allocate + stage.
  const operationId = randomUUID();
  const { radioTrackId, packageVersion } = await reserveRadioTrackId(trackLibraryRoot, operationId, request.sourceTrackId);
  createStagingOperation(trackLibraryRoot, operationId);
  const stagingDir = stagingOperationDir(trackLibraryRoot, operationId);
  const stagedWavPath = path.join(stagingDir, "input-core.wav");
  const stagedOpusPath = path.join(stagingDir, "audio.opus");

  async function abort(issues: RadioValidationIssue[]): Promise<RadioTrackPrepareResponse> {
    cleanupStagingOperation(trackLibraryRoot, operationId);
    await releaseTrackReservation(trackLibraryRoot, operationId);
    return { ok: false, reused: false, radioTrackId, packageVersion, sourceAssetHash, issues };
  }

  // 6 — decode the source to the canonical 24-bit PCM baseline.
  const sourceProbe = await probeSourceChannels(sourcePath);
  if (!sourceProbe.ok) {
    return abort([issue("RADIO_TRACK_SOURCE_UNPROBEABLE", `ffprobe found no audio stream in the source (${sourceProbe.stderrTail})`)]);
  }
  const decode = await decodeSourceToStagedWav(sourcePath, stagedWavPath, sourceProbe.channels);
  if (!decode.ok) {
    return abort([issue("RADIO_TRACK_SOURCE_DECODE_FAILED", `ffmpeg failed to decode the source to PCM (${decode.stderrTail})`)]);
  }
  const stagedInfo = readWavStreamInfoFromFile(stagedWavPath);
  if (!stagedInfo.valid || stagedInfo.frameCount == null || !stagedInfo.sampleRate || !stagedInfo.numChannels) {
    return abort([issue("RADIO_TRACK_STAGED_WAV_INVALID", stagedInfo.error ?? "staged WAV unreadable")]);
  }

  // 7 — encode with the centralized full-track policy.
  const encode = await encodeOpusToFile(stagedWavPath, stagedOpusPath, RADIO_TRACK_OPUS_ENCODING_POLICY);
  if (!encode.ok) {
    return abort([issue("RADIO_TRACK_ENCODE_FAILED", `ffmpeg opus encode failed (${encode.stderrTail})`)]);
  }

  // 8 — real ffprobe inspection of the encoded output.
  const probe = await probeOpusFile(stagedOpusPath);
  if (!probe.ok) {
    return abort(probe.issues.length ? probe.issues : [issue("RADIO_TRACK_PROBE_FAILED", "ffprobe validation failed")]);
  }
  if ((probe.channels ?? stagedInfo.numChannels) !== stagedInfo.numChannels) {
    return abort([issue("RADIO_TRACK_CHANNEL_MISMATCH", `Encoded channels (${probe.channels}) differ from staged baseline (${stagedInfo.numChannels})`)]);
  }

  // 9 — real decode-back verification, frame-exact at 48kHz against the
  // staged baseline's own server-parsed frame count.
  const decoded = await decodeOpusFrameCount(stagedOpusPath, stagingDir);
  if (!decoded.ok || decoded.frameCount == null || decoded.frameCount <= 0) {
    return abort([issue("RADIO_TRACK_DECODE_VERIFY_FAILED", `Encoded output failed decode-back verification (${decoded.stderrTail})`)]);
  }
  const expectedFrames = computeExpectedDecodedFrames(stagedInfo.frameCount, stagedInfo.sampleRate);
  const deltaFrames = Math.abs(decoded.frameCount - expectedFrames);
  if (!framesMatchWithinTolerance(decoded.frameCount, expectedFrames)) {
    return abort([issue("RADIO_TRACK_FRAME_MISMATCH", `Decoded ${decoded.frameCount} frames at 48kHz, expected ${expectedFrames} (Δ${deltaFrames}, tolerance ${RADIO_OPUS_FRAME_TOLERANCE})`)]);
  }

  // 10 — hashes for the encoded output; duration from the staged baseline
  // (frame-exact), never a client-supplied number.
  const encodedSha256 = sha256File(stagedOpusPath);
  const byteSize = fs.statSync(stagedOpusPath).size;
  const durationSeconds = stagedInfo.frameCount / stagedInfo.sampleRate;
  const verifiedAt = new Date().toISOString();

  const metadata: RadioTrackPackageManifest = {
    schemaVersion: SCHEMA_VERSION,
    radioTrackId,
    packageVersion,
    status: "RADIO_READY",
    source: { trackId: request.sourceTrackId, audioRelPath: request.audioRelPath },
    sourceAssetHash,
    audio: {
      primary: {
        codec: "opus",
        container: "ogg",
        mimeType: "audio/ogg; codecs=opus",
        relativePath: "audio.opus",
        bitrateKbps: RADIO_TRACK_OPUS_ENCODING_POLICY.bitrateKbps,
        vbrMode: RADIO_TRACK_OPUS_ENCODING_POLICY.vbr,
        channels: stagedInfo.numChannels,
        sampleRate: probe.sampleRate ?? 48000,
        durationSeconds,
        decodedFrameCount48k: decoded.frameCount,
        byteSize,
        sha256: encodedSha256,
      },
    },
    display: request.display,
    musical: request.musical,
    songIntelligence: request.songIntelligence,
    approval: request.approval,
    verification: { probeOk: true, decodeVerifyOk: true, deltaFrames, verifiedAt },
    createdAt: verifiedAt,
  };

  // 11 — atomic finalize with rollback (see radioTrackPackageWriter.ts).
  const finalize = await finalizeTrackPackage({
    trackLibraryRoot,
    operationId,
    radioTrackId,
    packageVersion,
    metadata,
    sourceReference: { trackId: request.sourceTrackId, audioRelPath: request.audioRelPath, sourceAssetHash, resolvedAt: verifiedAt },
    reportBase: { startedAt, priorIssues: [] },
  });
  if (!finalize.ok) {
    // Unlike the loop pipeline (whose staging survives a rollback so the
    // multi-request client can retry the SAME operation without
    // re-uploading), this pipeline is a single server request — a retry
    // is always a brand-new prepare call. Cleaning up staging AND the
    // reservation here means that retry allocates the same id/version
    // against a free path: no collision, no half-published package, no
    // leaked reservation.
    cleanupStagingOperation(trackLibraryRoot, operationId);
    await releaseTrackReservation(trackLibraryRoot, operationId);
    return { ok: false, reused: false, radioTrackId, packageVersion, sourceAssetHash, issues: finalize.issues };
  }

  // 12 — prove the source was only read: its bytes are identical before
  // and after packaging.
  if (sha256File(sourcePath) !== sourceAssetHash) {
    return { ok: false, reused: false, radioTrackId, packageVersion, sourceAssetHash, issues: [issue("RADIO_TRACK_SOURCE_MUTATED", "Source file bytes changed during packaging — investigate immediately")] };
  }

  const metadataPath = path.join(trackPackageVersionDir(trackLibraryRoot, radioTrackId, packageVersion), "metadata.json");
  return {
    ok: true,
    reused: false,
    radioTrackId,
    packageVersion,
    sourceAssetHash,
    packageManifestHash: sha256File(metadataPath),
    durationSeconds,
    byteSize,
    issues: [],
  };
}

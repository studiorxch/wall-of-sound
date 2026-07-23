// 0722C_MUSIC_Production_Stem_Export — canonical decoded-audio identity.
// Node-only.
//
// ONE canonical decode policy, applied identically to both concerns that
// need it: the fingerprint hash AND the literal Demucs subprocess input.
// There is exactly one ffmpeg decode per identity computation — Demucs
// receives the resulting WAV file directly (a real, self-describing audio
// file, never headerless raw PCM); the fingerprint hashes that same WAV's
// PCM data-chunk byte range directly (via radioWavFrameCounter's
// `dataOffset`/`dataSize`), so no second decode pass or raw-PCM stream is
// ever created. "Canonical" here means FIXED, not "whatever the source
// happens to be": every parent is decoded to 44100 Hz / stereo / 24-bit PCM
// regardless of its native format — htdemucs' own training rate, so this
// is not an arbitrary choice.
//
// Identity vs. provenance are kept structurally separate (DecodedAudioIdentity
// vs DecodedAudioProvenance in ../../src/data/trackStemTypes) — decoder/tool
// version is NEVER part of what gets compared for "is this the same parent
// audio," so a future ffmpeg upgrade can never silently invalidate a set on
// its own.
//
// Three-tier revalidation (revalidateSourceIdentity below) exists so a
// playback-critical request never has to hash — let alone decode — the
// whole parent file in the common case: cheap stat evidence (size/mtime/
// inode) is checked first; only a stat mismatch (or missing inode support)
// escalates to a full raw-file hash; only a raw-hash mismatch escalates to
// a full canonical re-decode. Any I/O failure at any tier fails CLOSED
// (never assumed safe) — the caller maps that to ORPHANED/UNAVAILABLE.

import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { readWavStreamInfoFromFile } from "../radio/radioWavFrameCounter";
import { sha256File } from "../radio/radioVersionCloneHelper";
import type {
  DecodedAudioIdentity,
  DecodedAudioProvenance,
  SourceFileStatSnapshot,
} from "../../src/data/trackStemTypes";

export const CANONICAL_SAMPLE_RATE_HZ = 44100;
export const CANONICAL_CHANNELS = 2;
export const CANONICAL_PCM_CODEC = "pcm_s24le";
const FINGERPRINT_ALGORITHM = "pcm-sha256";
const FINGERPRINT_VERSION = 1;
const STDERR_TAIL_CHARS = 4000;

// Pure — exported for argument-contract tests. This staged WAV is what
// Demucs actually receives (see stemSeparationRunner.buildDemucsArgs) —
// never the arbitrary original source container, never raw PCM.
export function buildCanonicalDecodeArgs(sourcePath: string, stagedWavPath: string): string[] {
  return [
    "-y",
    "-i", sourcePath,
    "-map_metadata", "-1",
    "-ar", String(CANONICAL_SAMPLE_RATE_HZ),
    "-ac", String(CANONICAL_CHANNELS),
    "-c:a", CANONICAL_PCM_CODEC,
    "-fflags", "+bitexact",
    "-f", "wav",
    stagedWavPath,
  ];
}

export interface CanonicalDecodeResult {
  ok: boolean;
  stagedWavPath: string;
  stderrTail: string;
}

export function decodeSourceToCanonicalWav(sourcePath: string, stagedWavPath: string): Promise<CanonicalDecodeResult> {
  fs.mkdirSync(path.dirname(stagedWavPath), { recursive: true });
  if (fs.existsSync(stagedWavPath)) fs.rmSync(stagedWavPath);
  const args = buildCanonicalDecodeArgs(sourcePath, stagedWavPath);
  return new Promise((resolve) => {
    execFile("ffmpeg", args, { maxBuffer: 1024 * 1024 * 16 }, (error, _stdout, stderr) => {
      const wrote = fs.existsSync(stagedWavPath) && fs.statSync(stagedWavPath).size > 0;
      resolve({ ok: !error && wrote, stagedWavPath, stderrTail: (stderr ?? "").slice(-STDERR_TAIL_CHARS) });
    });
  });
}

// Hashes exactly the PCM sample bytes (the `data` chunk payload), never the
// container — avoids false mismatches from incidental header/chunk
// differences across ffmpeg versions. Streamed (never buffers the whole
// payload in memory at once), so this is safe for long real songs.
function hashWavDataChunk(wavPath: string, dataOffset: number, dataSize: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(wavPath, { start: dataOffset, end: dataOffset + dataSize - 1 });
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

let cachedFfmpegVersion: string | null = null;
function resolveFfmpegVersion(): Promise<string> {
  if (cachedFfmpegVersion) return Promise.resolve(cachedFfmpegVersion);
  return new Promise((resolve) => {
    execFile("ffmpeg", ["-version"], { maxBuffer: 1024 * 1024 }, (error, stdout) => {
      const firstLine = (stdout ?? "").split("\n")[0] ?? "";
      const match = /ffmpeg version (\S+)/.exec(firstLine);
      cachedFfmpegVersion = error ? "unknown" : (match?.[1] ?? (firstLine.trim() || "unknown"));
      resolve(cachedFfmpegVersion);
    });
  });
}

export interface IdentityComputationSuccess {
  ok: true;
  identity: DecodedAudioIdentity;
  provenance: DecodedAudioProvenance;
  stagedWavPath: string; // hand this to Demucs — same canonical decode, no second pass
}
export interface IdentityComputationFailure {
  ok: false;
  reason: string;
}
export type IdentityComputationResult = IdentityComputationSuccess | IdentityComputationFailure;

// The one full, authoritative identity computation. Called at export time
// (fresh staging dir) and by the slow revalidation tier (a scratch staging
// path, discarded after comparison — see stemStagingFs.ts).
export async function computeCanonicalIdentity(sourcePath: string, stagedWavPath: string): Promise<IdentityComputationResult> {
  const decode = await decodeSourceToCanonicalWav(sourcePath, stagedWavPath);
  if (!decode.ok) return { ok: false, reason: `ffmpeg decode failed: ${decode.stderrTail}` };

  const info = readWavStreamInfoFromFile(stagedWavPath);
  if (!info.valid || info.frameCount == null || info.dataOffset == null || info.dataSize == null || !info.sampleRate || !info.numChannels) {
    return { ok: false, reason: info.error ?? "staged canonical WAV unreadable" };
  }

  const fingerprint = await hashWavDataChunk(stagedWavPath, info.dataOffset, info.dataSize);
  const decoderVersion = await resolveFfmpegVersion();

  return {
    ok: true,
    identity: {
      fingerprint,
      fingerprintAlgorithm: FINGERPRINT_ALGORITHM,
      fingerprintVersion: FINGERPRINT_VERSION,
      sampleRateHz: info.sampleRate,
      normalizedChannels: info.numChannels,
      durationFrames: info.frameCount,
    },
    provenance: { decoderTool: "ffmpeg", decoderVersion, computedAt: new Date().toISOString() },
    stagedWavPath,
  };
}

export function durationSecondsFromIdentity(identity: DecodedAudioIdentity): number {
  return identity.durationFrames / identity.sampleRateHz;
}

export function statSnapshotOf(filePath: string): SourceFileStatSnapshot | null {
  try {
    const st = fs.statSync(filePath);
    return { sizeBytes: st.size, mtimeMs: st.mtimeMs, inode: typeof st.ino === "number" && st.ino > 0 ? st.ino : null };
  } catch {
    return null;
  }
}

function statSnapshotsMatch(a: SourceFileStatSnapshot, b: SourceFileStatSnapshot): boolean {
  if (a.sizeBytes !== b.sizeBytes || a.mtimeMs !== b.mtimeMs) return false;
  // A missing inode on either side is ambiguous evidence, not a match —
  // fail closed to the raw-hash tier rather than trust size+mtime alone.
  if (a.inode == null || b.inode == null) return false;
  return a.inode === b.inode;
}

export type IdentityRevalidationOutcome =
  | { ok: true; matches: true; tier: "stat" | "raw_hash" | "full_decode" }
  | { ok: true; matches: false; tier: "raw_hash" | "full_decode"; newIdentity?: DecodedAudioIdentity }
  | { ok: false; reason: "source_missing" | "source_unreadable" | "decode_failed" };

export interface RevalidationInput {
  sourcePath: string;
  sourceStatAtCreation: SourceFileStatSnapshot;
  sourceRawFileHashAtCreation: string;
  sourceIdentity: DecodedAudioIdentity;
  scratchWavPath: string; // only used if tier 3 (full decode) is reached; caller owns cleanup
}

export async function revalidateSourceIdentity(input: RevalidationInput): Promise<IdentityRevalidationOutcome> {
  const { sourcePath, sourceStatAtCreation, sourceRawFileHashAtCreation, sourceIdentity, scratchWavPath } = input;

  if (!fs.existsSync(sourcePath)) return { ok: false, reason: "source_missing" };

  // Tier 1 — stat only, no file read at all.
  const currentStat = statSnapshotOf(sourcePath);
  if (!currentStat) return { ok: false, reason: "source_unreadable" };
  if (statSnapshotsMatch(currentStat, sourceStatAtCreation)) return { ok: true, matches: true, tier: "stat" };

  // Tier 2 — full raw-byte hash, still no decode.
  let currentRawHash: string;
  try {
    currentRawHash = sha256File(sourcePath);
  } catch {
    return { ok: false, reason: "source_unreadable" };
  }
  if (currentRawHash === sourceRawFileHashAtCreation) return { ok: true, matches: true, tier: "raw_hash" };

  // Tier 3 — the raw bytes genuinely changed; only now do we pay for a full
  // canonical re-decode + refingerprint, which is the sole authority on
  // whether this is a lossless rewrap (still matches) or real content
  // drift (OUTDATED).
  const recomputed = await computeCanonicalIdentity(sourcePath, scratchWavPath);
  if (!recomputed.ok) return { ok: false, reason: "decode_failed" };
  const matches =
    recomputed.identity.fingerprint === sourceIdentity.fingerprint &&
    recomputed.identity.sampleRateHz === sourceIdentity.sampleRateHz &&
    recomputed.identity.normalizedChannels === sourceIdentity.normalizedChannels &&
    recomputed.identity.durationFrames === sourceIdentity.durationFrames;
  return matches
    ? { ok: true, matches: true, tier: "full_decode" }
    : { ok: true, matches: false, tier: "full_decode", newIdentity: recomputed.identity };
}

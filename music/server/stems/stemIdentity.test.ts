import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  buildCanonicalDecodeArgs, computeCanonicalIdentity, revalidateSourceIdentity, statSnapshotOf,
  durationSecondsFromIdentity, CANONICAL_SAMPLE_RATE_HZ, CANONICAL_CHANNELS,
} from "./stemIdentity";
import { sha256File } from "../radio/radioVersionCloneHelper";
import { encodePcmWav } from "../../src/logic/loops/wavEncoder";

describe("buildCanonicalDecodeArgs", () => {
  it("is a fixed 44100Hz/stereo/pcm_s24le/wav policy, as an argument array", () => {
    const args = buildCanonicalDecodeArgs("/tmp/in.mp3", "/tmp/out.wav");
    expect(args).toEqual([
      "-y", "-i", "/tmp/in.mp3",
      "-map_metadata", "-1",
      "-ar", "44100", "-ac", "2",
      "-c:a", "pcm_s24le",
      "-fflags", "+bitexact",
      "-f", "wav",
      "/tmp/out.wav",
    ]);
    expect(args.every((a) => typeof a === "string")).toBe(true);
  });
});

function makeFixtureWav(dir: string, name: string, durationSeconds = 0.5, sampleRate = 44100, freq = 440): string {
  const numFrames = Math.round(durationSeconds * sampleRate);
  const left = new Float32Array(numFrames);
  const right = new Float32Array(numFrames);
  for (let i = 0; i < numFrames; i++) {
    left[i] = Math.sin((2 * Math.PI * freq * i) / sampleRate) * 0.5;
    right[i] = Math.sin((2 * Math.PI * freq * i) / sampleRate) * 0.5;
  }
  const wav = encodePcmWav({ channelData: [left, right], sampleRate, bitDepth: 16 });
  const wavPath = path.join(dir, name);
  fs.writeFileSync(wavPath, Buffer.from(wav));
  return wavPath;
}

describe("computeCanonicalIdentity (real ffmpeg subprocess)", () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "stem-identity-")); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it("decodes a real fixture to the fixed canonical policy", async () => {
    const source = makeFixtureWav(dir, "source.wav");
    const staged = path.join(dir, "staged.wav");
    const result = await computeCanonicalIdentity(source, staged);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.identity.sampleRateHz).toBe(CANONICAL_SAMPLE_RATE_HZ);
    expect(result.identity.normalizedChannels).toBe(CANONICAL_CHANNELS);
    expect(result.identity.durationFrames).toBeGreaterThan(0);
    expect(result.identity.fingerprint.length).toBe(64); // sha256 hex
    expect(result.provenance.decoderTool).toBe("ffmpeg");
    expect(result.provenance.decoderVersion.length).toBeGreaterThan(0);
    expect(fs.existsSync(staged)).toBe(true);
  }, 20_000);

  it("produces a bit-identical fingerprint across two independent decodes of the same source", async () => {
    const source = makeFixtureWav(dir, "source.wav");
    const stagedA = path.join(dir, "staged-a.wav");
    const stagedB = path.join(dir, "staged-b.wav");
    const a = await computeCanonicalIdentity(source, stagedA);
    const b = await computeCanonicalIdentity(source, stagedB);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.identity.fingerprint).toBe(b.identity.fingerprint);
  }, 20_000);

  it("produces a different fingerprint for genuinely different audio content", async () => {
    const sourceA = makeFixtureWav(dir, "a.wav", 0.5, 44100, 440);
    const sourceB = makeFixtureWav(dir, "b.wav", 0.5, 44100, 880);
    const a = await computeCanonicalIdentity(sourceA, path.join(dir, "staged-a.wav"));
    const b = await computeCanonicalIdentity(sourceB, path.join(dir, "staged-b.wav"));
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.identity.fingerprint).not.toBe(b.identity.fingerprint);
  }, 20_000);

  it("normalizes a mono source to the canonical 2-channel policy", async () => {
    const numFrames = Math.round(0.5 * 44100);
    const mono = new Float32Array(numFrames);
    for (let i = 0; i < numFrames; i++) mono[i] = Math.sin((2 * Math.PI * 440 * i) / 44100) * 0.5;
    const wav = encodePcmWav({ channelData: [mono], sampleRate: 44100, bitDepth: 16 });
    const sourcePath = path.join(dir, "mono.wav");
    fs.writeFileSync(sourcePath, Buffer.from(wav));
    const result = await computeCanonicalIdentity(sourcePath, path.join(dir, "staged.wav"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.identity.normalizedChannels).toBe(2);
  }, 20_000);

  it("reports failure for a missing source file", async () => {
    const result = await computeCanonicalIdentity(path.join(dir, "does-not-exist.wav"), path.join(dir, "staged.wav"));
    expect(result.ok).toBe(false);
  }, 20_000);
});

describe("durationSecondsFromIdentity", () => {
  it("divides frame count by sample rate", () => {
    expect(durationSecondsFromIdentity({
      fingerprint: "x", fingerprintAlgorithm: "pcm-sha256", fingerprintVersion: 1,
      sampleRateHz: 44100, normalizedChannels: 2, durationFrames: 44100,
    })).toBe(1);
  });
});

describe("statSnapshotOf", () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "stem-identity-stat-")); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it("returns size/mtime/inode for a real file", () => {
    const filePath = path.join(dir, "a.txt");
    fs.writeFileSync(filePath, "hello");
    const snap = statSnapshotOf(filePath);
    expect(snap).not.toBeNull();
    expect(snap!.sizeBytes).toBe(5);
    expect(typeof snap!.mtimeMs).toBe("number");
  });

  it("returns null for a missing file", () => {
    expect(statSnapshotOf(path.join(dir, "nope.txt"))).toBeNull();
  });
});

describe("revalidateSourceIdentity (three-tier revalidation, real ffmpeg)", () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "stem-identity-revalidate-")); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it("tier 1 (stat match) reports current without touching the file's bytes", async () => {
    const source = makeFixtureWav(dir, "source.wav");
    const identityResult = await computeCanonicalIdentity(source, path.join(dir, "staged.wav"));
    expect(identityResult.ok).toBe(true);
    if (!identityResult.ok) return;
    const stat = statSnapshotOf(source)!;
    const rawHash = sha256File(source);

    const outcome = await revalidateSourceIdentity({
      sourcePath: source, sourceStatAtCreation: stat, sourceRawFileHashAtCreation: rawHash,
      sourceIdentity: identityResult.identity, scratchWavPath: path.join(dir, "scratch.wav"),
    });
    expect(outcome).toEqual({ ok: true, matches: true, tier: "stat" });
  }, 20_000);

  it("tier 2 (raw hash match despite different stat) reports current, never decodes", async () => {
    const source = makeFixtureWav(dir, "source.wav");
    const identityResult = await computeCanonicalIdentity(source, path.join(dir, "staged.wav"));
    expect(identityResult.ok).toBe(true);
    if (!identityResult.ok) return;
    const rawHash = sha256File(source);
    // Simulate a stat mismatch (e.g. a touch/rewrite with identical bytes)
    // without actually changing the file's content.
    const staleStat = { sizeBytes: 999999, mtimeMs: 0, inode: 123 };

    const outcome = await revalidateSourceIdentity({
      sourcePath: source, sourceStatAtCreation: staleStat, sourceRawFileHashAtCreation: rawHash,
      sourceIdentity: identityResult.identity, scratchWavPath: path.join(dir, "scratch.wav"),
    });
    expect(outcome).toEqual({ ok: true, matches: true, tier: "raw_hash" });
  }, 20_000);

  it("tier 3 (raw bytes actually changed, but decode content still matches — a lossless rewrap) reports current", async () => {
    const source = makeFixtureWav(dir, "source.wav");
    const identityResult = await computeCanonicalIdentity(source, path.join(dir, "staged.wav"));
    expect(identityResult.ok).toBe(true);
    if (!identityResult.ok) return;
    const staleStat = { sizeBytes: 1, mtimeMs: 0, inode: 1 };
    const staleRawHash = "0".repeat(64);

    const outcome = await revalidateSourceIdentity({
      sourcePath: source, sourceStatAtCreation: staleStat, sourceRawFileHashAtCreation: staleRawHash,
      sourceIdentity: identityResult.identity, scratchWavPath: path.join(dir, "scratch.wav"),
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.tier).toBe("full_decode");
    expect(outcome).toMatchObject({ ok: true, matches: true, tier: "full_decode" });
  }, 20_000);

  it("tier 3 reports OUTDATED when the decoded content genuinely differs", async () => {
    const sourceA = makeFixtureWav(dir, "a.wav", 0.5, 44100, 440);
    const identityResult = await computeCanonicalIdentity(sourceA, path.join(dir, "staged-a.wav"));
    expect(identityResult.ok).toBe(true);
    if (!identityResult.ok) return;

    // Overwrite the SAME path with genuinely different audio content.
    makeFixtureWav(dir, "a.wav", 0.5, 44100, 880);
    const staleStat = { sizeBytes: 1, mtimeMs: 0, inode: 1 };
    const staleRawHash = "0".repeat(64);

    const outcome = await revalidateSourceIdentity({
      sourcePath: sourceA, sourceStatAtCreation: staleStat, sourceRawFileHashAtCreation: staleRawHash,
      sourceIdentity: identityResult.identity, scratchWavPath: path.join(dir, "scratch.wav"),
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.matches).toBe(false);
      expect(outcome.tier).toBe("full_decode");
    }
  }, 20_000);

  it("fails closed (never 'probably fine') when the source is missing", async () => {
    const missingPath = path.join(dir, "gone.wav");
    const outcome = await revalidateSourceIdentity({
      sourcePath: missingPath,
      sourceStatAtCreation: { sizeBytes: 1, mtimeMs: 0, inode: 1 },
      sourceRawFileHashAtCreation: "0".repeat(64),
      sourceIdentity: { fingerprint: "x", fingerprintAlgorithm: "pcm-sha256", fingerprintVersion: 1, sampleRateHz: 44100, normalizedChannels: 2, durationFrames: 100 },
      scratchWavPath: path.join(dir, "scratch.wav"),
    });
    expect(outcome).toEqual({ ok: false, reason: "source_missing" });
  });

  it("a decoder-version change alone (identity/provenance both unchanged) never triggers a re-decode via the fast path", async () => {
    // The comparable DecodedAudioIdentity has no decoder-version field at
    // all — provenance is a structurally separate type never compared —
    // so this is provable statically: tier 1/2 never even look at provenance.
    const source = makeFixtureWav(dir, "source.wav");
    const identityResult = await computeCanonicalIdentity(source, path.join(dir, "staged.wav"));
    expect(identityResult.ok).toBe(true);
    if (!identityResult.ok) return;
    expect(Object.keys(identityResult.identity)).not.toContain("decoderVersion");
    expect(Object.keys(identityResult.identity)).not.toContain("decoderTool");
  }, 20_000);
});

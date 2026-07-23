import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { scanStemSetsForTrack, classifyStemSetsForTrack, findCurrentStemSet, hasAnyStemSets } from "./stemSetIndex";
import { finalizeStemSet } from "./stemSetWriter";
import { computeCanonicalIdentity, statSnapshotOf } from "./stemIdentity";
import { sha256File } from "../radio/radioVersionCloneHelper";
import { encodePcmWav } from "../../src/logic/loops/wavEncoder";
import { STEM_ROLES, type StemRole, type TrackStemFile, type TrackStemSet } from "../../src/data/trackStemTypes";

function sineWav(dir: string, name: string, frames = 1000, freq = 440): string {
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  for (let i = 0; i < frames; i++) { left[i] = Math.sin((2 * Math.PI * freq * i) / 44100) * 0.5; right[i] = left[i]; }
  const wav = encodePcmWav({ channelData: [left, right], sampleRate: 44100, bitDepth: 16 });
  const p = path.join(dir, name);
  fs.writeFileSync(p, Buffer.from(wav));
  return p;
}

// sizeBytes MUST match the literal "bytes" content writeRealSet stages for
// each role file below (5 bytes) — stemSetIndex's on-disk integrity check
// compares against this exact declared size.
function stubStems(): Record<StemRole, TrackStemFile> {
  const stems = {} as Record<StemRole, TrackStemFile>;
  for (const role of STEM_ROLES) {
    stems[role] = { role, relativeArchivePath: "", fileName: `${role}.wav`, durationFrames: 1000, durationSeconds: 1000 / 44100, sampleRateHz: 44100, channels: 2, bitDepth: 16, codec: "pcm_s16le", sizeBytes: 5, contentHash: "a".repeat(64) };
  }
  return stems;
}

// Real, ffmpeg-decoded identity against `sourcePath` — used so classification
// tests exercise the true revalidation path, not a stub.
async function writeRealSet(root: string, safeTrackId: string, sourcePath: string, createdAt: string, scratchDir: string): Promise<TrackStemSet> {
  const identity = await computeCanonicalIdentity(sourcePath, path.join(scratchDir, `${createdAt}-staged.wav`));
  if (!identity.ok) throw new Error(identity.reason);
  const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), "stem-index-staging-"));
  for (const role of STEM_ROLES) fs.writeFileSync(path.join(stagingDir, `${role}.wav`), "bytes");
  const result = finalizeStemSet({
    stemLibraryRoot: root, safeTrackId, stagingDir,
    set: {
      id: `set_${createdAt}`, sourceTrackId: safeTrackId, sourceAudioPathAtCreation: sourcePath,
      sourceAudioIdentity: identity.identity, sourceRawFileHashAtCreation: sha256File(sourcePath),
      sourceStatAtCreation: statSnapshotOf(sourcePath)!, sourceAudioProvenance: identity.provenance,
      origin: "demucs", engine: "demucs", model: "htdemucs", engineVersion: "4.1.0", engineDevice: "cpu",
      manifestVersion: 1, stems: stubStems(), createdAt, completedAt: createdAt,
    },
  });
  if (!result.ok) throw new Error(result.reason);
  return result.stemSet!;
}

describe("stemSetIndex", () => {
  let root: string;
  let sourceDir: string;
  let scratchDir: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "stem-index-root-"));
    sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), "stem-index-source-"));
    scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), "stem-index-scratch-"));
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(sourceDir, { recursive: true, force: true });
    fs.rmSync(scratchDir, { recursive: true, force: true });
  });

  it("hasAnyStemSets is false for a track with no archive directory", () => {
    expect(hasAnyStemSets(root, "track_x")).toBe(false);
  });

  it("scans zero sets for an unknown track", () => {
    expect(scanStemSetsForTrack(root, "track_x")).toEqual([]);
  });

  it("classifies a set matching the live parent as CURRENT", async () => {
    const source = sineWav(sourceDir, "a.wav");
    await writeRealSet(root, "track_1", source, "2026-07-22T00:00:00.000Z", scratchDir);
    const sets = scanStemSetsForTrack(root, "track_1");
    expect(hasAnyStemSets(root, "track_1")).toBe(true);

    const lifecycles = await classifyStemSetsForTrack(sets, {
      stemLibraryRoot: root, sourcePath: source,
      scratchWavPathFor: (id) => path.join(scratchDir, `${id}-scratch.wav`),
    });
    expect(lifecycles.get(sets[0].id)?.lifecycle).toBe("current");
    expect(findCurrentStemSet(sets, lifecycles)?.id).toBe(sets[0].id);
  }, 20_000);

  it("classifies a set as ORPHANED when the parent source is missing", async () => {
    const source = sineWav(sourceDir, "a.wav");
    await writeRealSet(root, "track_1", source, "2026-07-22T00:00:00.000Z", scratchDir);
    const sets = scanStemSetsForTrack(root, "track_1");
    fs.rmSync(source);

    const lifecycles = await classifyStemSetsForTrack(sets, {
      stemLibraryRoot: root, sourcePath: source,
      scratchWavPathFor: (id) => path.join(scratchDir, `${id}-scratch.wav`),
    });
    expect(lifecycles.get(sets[0].id)?.lifecycle).toBe("orphaned");
  }, 20_000);

  it("classifies a set as OUTDATED when the parent's decoded audio genuinely changed", async () => {
    const source = sineWav(sourceDir, "a.wav", 1000, 440);
    await writeRealSet(root, "track_1", source, "2026-07-22T00:00:00.000Z", scratchDir);
    const sets = scanStemSetsForTrack(root, "track_1");
    sineWav(sourceDir, "a.wav", 1000, 880); // overwrite with different content, same path

    const lifecycles = await classifyStemSetsForTrack(sets, {
      stemLibraryRoot: root, sourcePath: source,
      scratchWavPathFor: (id) => path.join(scratchDir, `${id}-scratch.wav`),
    });
    expect(lifecycles.get(sets[0].id)?.lifecycle).toBe("outdated");
  }, 20_000);

  it("classifies a set as UNAVAILABLE when an archived stem file is missing on disk", async () => {
    const source = sineWav(sourceDir, "a.wav");
    const stemSet = await writeRealSet(root, "track_1", source, "2026-07-22T00:00:00.000Z", scratchDir);
    fs.rmSync(path.join(root, stemSet.stems.vocals.relativeArchivePath));
    const sets = scanStemSetsForTrack(root, "track_1");

    const lifecycles = await classifyStemSetsForTrack(sets, {
      stemLibraryRoot: root, sourcePath: source,
      scratchWavPathFor: (id) => path.join(scratchDir, `${id}-scratch.wav`),
    });
    expect(lifecycles.get(sets[0].id)?.lifecycle).toBe("unavailable");
  }, 20_000);

  it("the newest matching set is CURRENT; an older matching set is ARCHIVED, not current", async () => {
    const source = sineWav(sourceDir, "a.wav");
    await writeRealSet(root, "track_1", source, "2026-07-22T00:00:00.000Z", scratchDir);
    await writeRealSet(root, "track_1", source, "2026-07-22T01:00:00.000Z", scratchDir);
    const sets = scanStemSetsForTrack(root, "track_1"); // newest-first
    expect(sets[0].createdAt).toBe("2026-07-22T01:00:00.000Z");

    const lifecycles = await classifyStemSetsForTrack(sets, {
      stemLibraryRoot: root, sourcePath: source,
      scratchWavPathFor: (id) => path.join(scratchDir, `${id}-scratch.wav`),
    });
    expect(lifecycles.get(sets[0].id)?.lifecycle).toBe("current");
    expect(lifecycles.get(sets[1].id)?.lifecycle).toBe("archived");
  }, 20_000);
});

import { describe, expect, it } from "vitest";
import type { Track } from "../data/trackTypes";
import type { ImportResult } from "./audioImport";
import { buildIntakeItem, intakeStatusReason, reresolveIntakeItem, resolveIntakeStatus } from "./importIntake";

// MUSIC P0 Clean Library Foundation — Step B. No prior test coverage
// existed for this module. Covers the new classification wiring
// (buildIntakeItem/reresolveIntakeItem now drive off classifyIncomingAsset,
// not the old filename-only detectDuplicate) and the new "attach_as_asset"
// resolution path that lets a same-recording-different-format match commit
// as an additional asset instead of a duplicate Track.

function existingTrack(overrides: Partial<Track> = {}): Track {
  return {
    trackId: "existing-1",
    title: "Late Drift",
    artist: "StudioRich",
    durationSeconds: 240,
    energy: 0.5,
    energySource: "estimated",
    sourceOwner: "studiorich",
    audioFileName: "Late Drift.wav",
    audioRelPath: "catalog/audio/Late Drift.wav",
    ...overrides,
  } as Track;
}

function importResult(overrides: Partial<Track> = {}, extra: Partial<ImportResult> = {}): ImportResult {
  const track: Track = {
    trackId: "new-1",
    title: "Late Drift",
    artist: "",
    durationSeconds: 240,
    energy: 0,
    energySource: "estimated",
    sourceOwner: "studiorich",
    audioFileName: "Late Drift.flac",
    audioRelPath: "catalog/audio/Late Drift.flac",
    audioStatus: "linked",
    audioLinked: true,
    fileExtension: "flac",
    assets: [{
      assetId: "primary:new-1", format: "flac", fileName: "Late Drift.flac",
      filePath: "catalog/audio/Late Drift.flac", checksum: "different-hash-cross-format",
      durationSeconds: 240, sourceOwner: "studiorich", addedAt: "2026-08-13T00:00:00.000Z", isPrimary: true,
    }],
    analysisStatus: "review_needed",
    ...overrides,
  } as Track;
  return { track, existed: false, relPath: track.audioRelPath ?? "", renamedToAvoidCollision: false, ...extra };
}

describe("buildIntakeItem — real classification wiring", () => {
  it("classifies a same-recording-different-format match and offers it as a resolvable duplicate", () => {
    const existing = [existingTrack()];
    const item = buildIntakeItem(importResult(), existing);
    expect(item.reconciliationClass).toBe("same_recording_different_format");
    expect(item.duplicateStatus).toBe("possible_duplicate");
    expect(item.duplicateOfTrackId).toBe("existing-1");
    // buildIntakeItem itself always starts at "scanning" (the real panel
    // resolves it after the async playability scan) — resolveIntakeStatus
    // is what the panel calls once that's done.
    expect(resolveIntakeStatus(item)).toBe("duplicate"); // excluded from commit until resolved
    expect(intakeStatusReason(item)).toMatch(/same recording, different format/i);
  });

  it("classifies a genuinely distinct recording as importable", () => {
    const existing = [existingTrack()];
    const item = buildIntakeItem(importResult({ title: "Totally Different Song", artist: "Nobody", audioFileName: "Totally Different Song.wav" }), existing);
    expect(item.reconciliationClass).toBe("distinct_recording");
    expect(item.duplicateStatus).toBe("not_duplicate");
    expect(resolveIntakeStatus(item)).not.toBe("duplicate");
  });

  it("classifies a checksum-exact duplicate as exact_asset_duplicate even under a renamed filename", () => {
    const existing = [existingTrack({ assets: [{
      assetId: "a1", format: "wav", fileName: "Late Drift.wav", filePath: "catalog/audio/Late Drift.wav",
      checksum: "shared-hash", durationSeconds: 240, sourceOwner: "studiorich", addedAt: "2026-08-01T00:00:00.000Z",
    }] })];
    const item = buildIntakeItem(
      importResult({ audioFileName: "Late Drift (redownload).wav", assets: [{
        assetId: "primary:new-1", format: "wav", fileName: "Late Drift (redownload).wav",
        filePath: "catalog/audio/Late Drift (redownload).wav", checksum: "shared-hash",
        durationSeconds: 240, sourceOwner: "studiorich", addedAt: "2026-08-13T00:00:00.000Z", isPrimary: true,
      }] }),
      existing,
    );
    expect(item.reconciliationClass).toBe("exact_asset_duplicate");
    expect(item.duplicateStatus).toBe("exact_duplicate");
  });
});

describe("attach_as_asset resolution", () => {
  it("clears the 'duplicate' blocking status, same as import_separately", () => {
    const existing = [existingTrack()];
    const item = buildIntakeItem(importResult(), existing);
    expect(resolveIntakeStatus(item)).toBe("duplicate");
    const resolved = { ...item, duplicateResolution: "attach_as_asset" as const };
    expect(resolveIntakeStatus(resolved)).not.toBe("duplicate");
  });
});

describe("reresolveIntakeItem — reclassifies after an edit, drops a stale resolution", () => {
  it("drops duplicateResolution once an edit makes the match genuinely distinct", () => {
    const existing = [existingTrack()];
    const item = buildIntakeItem(importResult(), existing);
    const withResolution = { ...item, duplicateResolution: "attach_as_asset" as const };
    const edited = {
      ...withResolution,
      track: { ...withResolution.track, title: "A Completely Unrelated Title", artist: "Someone New" },
      metadata: { ...withResolution.metadata, title: "A Completely Unrelated Title", artist: "Someone New" },
    };
    const reresolved = reresolveIntakeItem(edited);
    expect(reresolved.reconciliationClass).toBe("distinct_recording");
    expect(reresolved.duplicateResolution).toBeUndefined();
    expect(reresolved.status).not.toBe("duplicate");
  });
});

import { describe, expect, it } from "vitest";
import type { Track } from "../data/trackTypes";
import type { TrackAsset } from "../data/trackAssetTypes";
import {
  attachAssetToTrack,
  buildPrimaryAssetFromTrack,
  classifyIncomingAsset,
  filterTracksByFormat,
  findMatchingSunoCanonicalRecording,
  formatFromExtension,
  getTrackAssets,
  getTrackFormats,
  trackHasFormat,
} from "./trackAssetReconciliation";

// MUSIC P0 Clean Library Foundation — Step B. Covers exactly the validation
// scenarios required before any real archive import: same recording in
// multiple formats, an exact duplicate, a RENAMED exact duplicate (the case
// the old filename-based dedup would miss), an alternate version/edit, and a
// genuinely distinct recording — plus the format-availability query and the
// Suno evidence bridge.

function track(overrides: Partial<Track>): Track {
  return {
    trackId: "t1",
    title: "Late Drift",
    artist: "StudioRich",
    durationSeconds: 240,
    energy: 0.5,
    energySource: "estimated",
    sourceOwner: "studiorich",
    audioFileName: "Late Drift.wav",
    audioRelPath: "catalog/audio/Late Drift.wav",
    fileExtension: "wav",
    ...overrides,
  } as Track;
}

function asset(overrides: Partial<TrackAsset>): TrackAsset {
  return {
    assetId: "a1",
    format: "wav",
    fileName: "Late Drift.wav",
    filePath: "catalog/audio/Late Drift.wav",
    checksum: "abc123",
    durationSeconds: 240,
    sourceOwner: "studiorich",
    addedAt: "2026-08-13T00:00:00.000Z",
    ...overrides,
  };
}

describe("formatFromExtension", () => {
  it("maps known extensions", () => {
    expect(formatFromExtension("track.wav")).toBe("wav");
    expect(formatFromExtension("track.flac")).toBe("flac");
    expect(formatFromExtension("track.mp3")).toBe("mp3");
    expect(formatFromExtension(".WAV")).toBe("wav");
  });
  it("falls back to other for unknown extensions", () => {
    expect(formatFromExtension("track.xyz")).toBe("other");
  });
});

describe("getTrackAssets / getTrackFormats / trackHasFormat — legacy bridge", () => {
  it("synthesizes a single primary asset from legacy single-file fields when assets[] is absent", () => {
    const t = track({});
    const assets = getTrackAssets(t);
    expect(assets).toHaveLength(1);
    expect(assets[0].isPrimary).toBe(true);
    expect(assets[0].format).toBe("wav");
    expect(assets[0].checksum).toBeNull();
  });

  it("uses the real assets[] array when present, not the legacy synthesis", () => {
    const t = track({ assets: [asset({ format: "flac" }), asset({ assetId: "a2", format: "mp3", checksum: "def456" })] });
    expect(getTrackFormats(t)).toEqual(expect.arrayContaining(["flac", "mp3"]));
    expect(getTrackFormats(t)).toHaveLength(2);
  });

  it("answers 'does this track have a WAV' correctly for both legacy and modern data", () => {
    const legacyWav = track({});
    const modernFlacOnly = track({ trackId: "t2", assets: [asset({ format: "flac" })] });
    const modernWithWav = track({ trackId: "t3", assets: [asset({ format: "flac" }), asset({ assetId: "a2", format: "wav", checksum: "z" })] });
    expect(trackHasFormat(legacyWav, "wav")).toBe(true);
    expect(trackHasFormat(modernFlacOnly, "wav")).toBe(false);
    expect(trackHasFormat(modernWithWav, "wav")).toBe(true);
  });

  it("REQUIRED QUERY: 'which Catalog tracks have a WAV available' is a one-line filter", () => {
    const tracks = [
      track({ trackId: "t1", assets: [asset({ format: "wav" })] }),
      track({ trackId: "t2", assets: [asset({ format: "flac" })] }),
      track({ trackId: "t3", assets: [asset({ format: "mp3" }), asset({ assetId: "a2", format: "wav", checksum: "y" })] }),
    ];
    const withWav = filterTracksByFormat(tracks, "wav");
    expect(withWav.map((t) => t.trackId)).toEqual(["t1", "t3"]);
    const withFlac = filterTracksByFormat(tracks, "flac");
    expect(withFlac.map((t) => t.trackId)).toEqual(["t2"]);
  });

  it("buildPrimaryAssetFromTrack returns null when a track has no file reference at all", () => {
    const t = track({ audioFileName: undefined, filePath: undefined, audioRelPath: undefined });
    expect(buildPrimaryAssetFromTrack(t)).toBeNull();
  });
});

describe("classifyIncomingAsset — the four identity classes", () => {
  const existing = [track({})]; // one existing WAV track, checksum "abc123" via its... wait legacy has no checksum

  it("SCENARIO: exact duplicate via checksum — catches a RENAMED duplicate the old filename-based check would miss", () => {
    const existingWithChecksum = [track({ assets: [asset({ checksum: "same-hash-xyz" })] })];
    const candidate = {
      fileName: "Late Drift (1).wav", // renamed — old detectDuplicate's filename+duration check would MISS this
      format: "wav" as const,
      checksum: "same-hash-xyz",
      durationSeconds: 240,
      title: "totally different title guess from filename",
    };
    const result = classifyIncomingAsset(candidate, existingWithChecksum);
    expect(result.classification).toBe("exact_asset_duplicate");
    expect(result.matchedTrackId).toBe("t1");
    expect(result.evidence.checksumMatch).toBe(true);
    expect(result.confidence).toBe("high");
  });

  it("SCENARIO: exact duplicate — same filename+duration, legacy track with no checksum (fallback path, matches old behavior)", () => {
    const result = classifyIncomingAsset(
      { fileName: "Late Drift.wav", format: "wav", checksum: null, durationSeconds: 240, title: "Late Drift" },
      existing,
    );
    expect(result.classification).toBe("exact_asset_duplicate");
    expect(result.confidence).toBe("medium");
  });

  it("SCENARIO: same recording, different format — matching title/artist, duration within tolerance, different extension", () => {
    const candidate = {
      fileName: "Late Drift.flac",
      format: "flac" as const,
      checksum: "a-completely-different-hash-because-flac-and-wav-never-match",
      durationSeconds: 241, // within 2s tolerance
      title: "Late Drift",
      artist: "StudioRich",
    };
    const result = classifyIncomingAsset(candidate, existing);
    expect(result.classification).toBe("same_recording_different_format");
    expect(result.matchedTrackId).toBe("t1");
    expect(result.evidence.checksumMatch).toBe(false);
    expect(result.evidence.normalizedTitleArtistMatch).toBe(true);
    expect(result.confidence).toBe("high");
  });

  it("does NOT use checksum equality to establish cross-format identity (explicit non-goal)", () => {
    // Even if a WAV and an MP3 hypothetically shared a checksum (they
    // wouldn't in reality), the classifier's cross-format tier is reached
    // only through title/artist/duration evidence, never checksum alone
    // driving a *different-format* conclusion — checksum equality always
    // resolves to exact_asset_duplicate instead, by design.
    const candidate = { fileName: "Late Drift.mp3", format: "mp3" as const, checksum: null, durationSeconds: 240, title: "Late Drift", artist: "StudioRich" };
    const result = classifyIncomingAsset(candidate, existing);
    expect(result.classification).toBe("same_recording_different_format");
    expect(result.evidence.checksumMatch).toBe(false);
  });

  it("SCENARIO: alternate version/edit — matching title, duration far outside tolerance (an extended/radio edit)", () => {
    const candidate = {
      fileName: "Late Drift (Extended Mix).wav",
      format: "wav" as const,
      checksum: "different-hash",
      durationSeconds: 420, // way outside 2s tolerance — a genuinely different-length edit
      title: "Late Drift",
      artist: "StudioRich",
    };
    const result = classifyIncomingAsset(candidate, existing);
    expect(result.classification).toBe("related_version");
    expect(result.evidence.filenameVersionHint).toBe("extended");
    expect(result.confidence).toBe("medium");
  });

  it("SCENARIO: distinct recording — no title/artist/duration/checksum relation at all", () => {
    const candidate = {
      fileName: "Completely Unrelated Track.wav",
      format: "wav" as const,
      checksum: "unrelated-hash",
      durationSeconds: 180,
      title: "Completely Unrelated Track",
      artist: "Someone Else",
    };
    const result = classifyIncomingAsset(candidate, existing);
    expect(result.classification).toBe("distinct_recording");
    expect(result.matchedTrackId).toBeNull();
  });

  it("never auto-attaches — classification alone never mutates any track", () => {
    const candidate = { fileName: "Late Drift.flac", format: "flac" as const, checksum: "x", durationSeconds: 240, title: "Late Drift", artist: "StudioRich" };
    const before = JSON.stringify(existing);
    classifyIncomingAsset(candidate, existing);
    expect(JSON.stringify(existing)).toBe(before);
  });
});

describe("attachAssetToTrack — only ever called after explicit human confirmation", () => {
  it("appends the new asset to the target track, seeding the array with the legacy primary if this is the first real asset", () => {
    const tracks = [track({ trackId: "t1" }), track({ trackId: "t2" })];
    const newAsset = asset({ assetId: "new-flac", format: "flac", checksum: "flac-hash" });
    const next = attachAssetToTrack(tracks, "t1", newAsset);
    const t1 = next.find((t) => t.trackId === "t1")!;
    expect(t1.assets).toHaveLength(2); // legacy primary + the new one
    expect(t1.assets!.some((a) => a.assetId === "new-flac")).toBe(true);
    expect(getTrackFormats(t1)).toEqual(expect.arrayContaining(["wav", "flac"]));
    // Other track untouched.
    expect(next.find((t) => t.trackId === "t2")!.assets).toBeUndefined();
  });

  it("does not mutate the input array (returns a new array)", () => {
    const tracks = [track({ trackId: "t1" })];
    const next = attachAssetToTrack(tracks, "t1", asset({}));
    expect(next).not.toBe(tracks);
    expect(tracks[0].assets).toBeUndefined();
  });
});

describe("findMatchingSunoCanonicalRecording — read-only, informational, provider-independent by default", () => {
  const sunoRecords = [
    { canonicalRecordingId: "canon-1", primaryTitleGuess: "Neon Static", sunoUuid: "uuid-1", workspaceSlugs: ["bass-lab"], totalDurationSeconds: 200 },
  ];

  it("finds a title+duration match", () => {
    const match = findMatchingSunoCanonicalRecording({ title: "Neon Static", durationSeconds: 201 }, sunoRecords);
    expect(match).not.toBeNull();
    expect(match!.canonicalRecordingId).toBe("canon-1");
    expect(match!.sunoUuid).toBe("uuid-1");
  });

  it("returns null when duration is outside tolerance despite a title match", () => {
    const match = findMatchingSunoCanonicalRecording({ title: "Neon Static", durationSeconds: 400 }, sunoRecords);
    expect(match).toBeNull();
  });

  it("returns null when no Suno records are supplied (fully optional, provider-independent)", () => {
    const match = findMatchingSunoCanonicalRecording({ title: "Neon Static", durationSeconds: 200 }, []);
    expect(match).toBeNull();
  });
});

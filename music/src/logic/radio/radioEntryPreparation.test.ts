import { describe, it, expect } from "vitest";
import { computeEntryPreparationState, buildSongIntelligenceSnapshot, buildApprovalPatch, buildTrackPrepareRequest } from "./radioEntryPreparation";
import type { RadioPlaylistEntry } from "../../data/radioPlaylistTypes";
import type { CompleteSongAnalysis, SongSection, SongSectionRevision } from "../../data/songAnalysisTypes";
import type { Track } from "../../data/trackTypes";

function makeEntry(overrides: Partial<RadioPlaylistEntry> = {}): RadioPlaylistEntry {
  return {
    id: "entry_1",
    inboxItemId: "inbox_1",
    order: 0,
    locked: false,
    includedInPublish: true,
    stemPolicy: "none",
    ...overrides,
  };
}

describe("computeEntryPreparationState", () => {
  it("classifies an excluded entry regardless of any other field", () => {
    const entry = makeEntry({ includedInPublish: false, approval: { approved: true, sourceAssetHash: "abc" } });
    expect(computeEntryPreparationState({ entry })).toBe("EXCLUDED");
  });

  it("classifies a transient in-flight entry as PREPARING", () => {
    const entry = makeEntry({ approval: { approved: true, sourceAssetHash: "abc" } });
    expect(computeEntryPreparationState({ entry, isPreparing: true })).toBe("PREPARING");
  });

  it("classifies an unapproved entry as NOT_APPROVED", () => {
    expect(computeEntryPreparationState({ entry: makeEntry() })).toBe("NOT_APPROVED");
  });

  it("classifies a stale approval (source changed since approval) as NOT_APPROVED, never silently carried forward", () => {
    const entry = makeEntry({
      approval: { approved: true, sourceAssetHash: "old-hash" },
      trackBinding: { radioTrackId: "rtrack_000001", packageVersion: 1, sourceTrackId: "t1", sourceAssetHash: "old-hash", packageManifestHash: "h1", boundAt: "2026-07-18T00:00:00.000Z" },
    });
    expect(computeEntryPreparationState({ entry, currentSourceAssetHash: "new-hash" })).toBe("NOT_APPROVED");
  });

  it("does not treat an approval as stale when no live source-hash check has been run", () => {
    const entry = makeEntry({ approval: { approved: true, sourceAssetHash: "old-hash" } });
    expect(computeEntryPreparationState({ entry })).toBe("NEEDS_PREPARATION");
  });

  it("classifies an approved entry with no binding as NEEDS_PREPARATION", () => {
    const entry = makeEntry({ approval: { approved: true, sourceAssetHash: "abc" } });
    expect(computeEntryPreparationState({ entry })).toBe("NEEDS_PREPARATION");
  });

  it("classifies an approved entry with a live preparation error and no binding as FAILED", () => {
    const entry = makeEntry({
      approval: { approved: true, sourceAssetHash: "abc" },
      lastPreparationError: { code: "RADIO_TRACK_PREPARE_FAILED", message: "encode failed", at: "2026-07-18T00:00:00.000Z" },
    });
    expect(computeEntryPreparationState({ entry })).toBe("FAILED");
  });

  it("treats a preparation error as superseded once a later binding exists, and reports READY (pending live verification)", () => {
    const entry = makeEntry({
      approval: { approved: true, sourceAssetHash: "abc" },
      lastPreparationError: { code: "RADIO_TRACK_PREPARE_FAILED", message: "encode failed", at: "2026-07-18T00:00:00.000Z" },
      trackBinding: { radioTrackId: "rtrack_000001", packageVersion: 1, sourceTrackId: "t1", sourceAssetHash: "abc", packageManifestHash: "h1", boundAt: "2026-07-18T01:00:00.000Z" },
    });
    expect(computeEntryPreparationState({ entry })).toBe("READY");
  });

  it("classifies a bound entry with no live verification yet as READY (trusting the persisted binding)", () => {
    const entry = makeEntry({
      approval: { approved: true, sourceAssetHash: "abc" },
      trackBinding: { radioTrackId: "rtrack_000001", packageVersion: 1, sourceTrackId: "t1", sourceAssetHash: "abc", packageManifestHash: "h1", boundAt: "2026-07-18T00:00:00.000Z" },
    });
    expect(computeEntryPreparationState({ entry })).toBe("READY");
  });

  it("classifies a bound entry whose live verification fails as STALE", () => {
    const entry = makeEntry({
      approval: { approved: true, sourceAssetHash: "abc" },
      trackBinding: { radioTrackId: "rtrack_000001", packageVersion: 1, sourceTrackId: "t1", sourceAssetHash: "abc", packageManifestHash: "h1", boundAt: "2026-07-18T00:00:00.000Z" },
    });
    const verification = { ok: false, packageExists: true, manifestValid: true, manifestHashMatches: true, audioAssetIntact: false, decodeVerificationRecorded: true, sourceHashCurrent: true, currentSourceAssetHash: "abc", issues: [] };
    expect(computeEntryPreparationState({ entry, verification })).toBe("STALE");
  });

  it("classifies a bound entry whose live verification passes as READY", () => {
    const entry = makeEntry({
      approval: { approved: true, sourceAssetHash: "abc" },
      trackBinding: { radioTrackId: "rtrack_000001", packageVersion: 1, sourceTrackId: "t1", sourceAssetHash: "abc", packageManifestHash: "h1", boundAt: "2026-07-18T00:00:00.000Z" },
    });
    const verification = { ok: true, packageExists: true, manifestValid: true, manifestHashMatches: true, audioAssetIntact: true, decodeVerificationRecorded: true, sourceHashCurrent: true, currentSourceAssetHash: "abc", issues: [] };
    expect(computeEntryPreparationState({ entry, verification })).toBe("READY");
  });
});

function makeAnalysis(overrides: Partial<CompleteSongAnalysis> = {}): CompleteSongAnalysis {
  return {
    id: "analysis_1",
    sourceTrackId: "t1",
    sourceMediaFingerprint: "fp1",
    decodedFrameCount: 48000 * 10,
    sampleRate: 48000,
    analyzerVersion: "song-analyzer-v1.1.0",
    configurationVersion: "song-analysis-config-v1.0.0",
    status: "READY_VERIFIED",
    sections: [],
    sectionRevisions: [],
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-18T00:00:00.000Z",
    ...overrides,
  };
}

describe("buildSongIntelligenceSnapshot", () => {
  it("returns an empty-sections snapshot for a missing analysis", () => {
    expect(buildSongIntelligenceSnapshot(null)).toEqual({ sections: [] });
  });

  it("converts analyzer-origin sections from frames to seconds using the analysis sampleRate", () => {
    const section: SongSection = {
      id: "sec_1", sourceTrackId: "t1", structuralType: "chorus", displayLabel: "Chorus 1",
      startFrame: 48000 * 10, endFrame: 48000 * 20, confidence: 0.9, verification: "verified", origin: "analyzer",
    };
    const analysis = makeAnalysis({ sections: [section] });
    const snapshot = buildSongIntelligenceSnapshot(analysis);
    expect(snapshot.revision).toBe(analysis.updatedAt);
    expect(snapshot.sections).toEqual([{ label: "Chorus 1", structuralType: "chorus", startSeconds: 10, endSeconds: 20, verified: true }]);
  });

  it("resolves the active user revision over the analyzer-origin section", () => {
    const section: SongSection = {
      id: "sec_1", sourceTrackId: "t1", structuralType: "chorus", displayLabel: "Chorus 1",
      startFrame: 0, endFrame: 48000 * 5, confidence: 0.9, verification: "provisional", origin: "analyzer",
      activeRevisionId: "rev_1",
    };
    const revision: SongSectionRevision = {
      id: "rev_1", sectionId: "sec_1", displayLabel: "Chorus (corrected)", verification: "verified", createdAt: "2026-07-18T00:00:00.000Z", createdBy: "user",
    };
    const analysis = makeAnalysis({ sections: [section], sectionRevisions: [revision] });
    const snapshot = buildSongIntelligenceSnapshot(analysis);
    expect(snapshot.sections[0]).toEqual({ label: "Chorus (corrected)", structuralType: "chorus", startSeconds: 0, endSeconds: 5, verified: true });
  });
});

describe("buildApprovalPatch", () => {
  it("stamps approved:true with the live source hash and the analysis updatedAt as the intelligence revision", () => {
    const analysis = makeAnalysis({ updatedAt: "2026-07-19T00:00:00.000Z" });
    const patch = buildApprovalPatch("hash123", analysis, "2026-07-20T00:00:00.000Z");
    expect(patch).toEqual({ approved: true, approvedAt: "2026-07-20T00:00:00.000Z", sourceAssetHash: "hash123", songIntelligenceRevision: "2026-07-19T00:00:00.000Z" });
  });

  it("omits songIntelligenceRevision when there is no analysis yet", () => {
    const patch = buildApprovalPatch("hash123", null, "2026-07-20T00:00:00.000Z");
    expect(patch.songIntelligenceRevision).toBeUndefined();
  });
});

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    trackId: "t1",
    title: "White Ropes",
    artist: "Soulphiction",
    sourceOwner: "studiorich",
    sourceLibrary: "catalog",
    audioRelPath: "Catalog/white-ropes.wav",
    ...overrides,
  } as Track;
}

describe("buildTrackPrepareRequest", () => {
  it("returns null when the entry has no approval", () => {
    expect(buildTrackPrepareRequest(makeTrack(), null, undefined)).toBeNull();
  });

  it("returns null when the track has no portable audioRelPath", () => {
    const approval = { approved: true, approvedAt: "2026-07-20T00:00:00.000Z", sourceAssetHash: "hash123" };
    expect(buildTrackPrepareRequest(makeTrack({ audioRelPath: undefined }), null, approval)).toBeNull();
  });

  it("assembles a full request from an approved entry and its track/analysis", () => {
    const approval = { approved: true, approvedAt: "2026-07-20T00:00:00.000Z", sourceAssetHash: "hash123", songIntelligenceRevision: "2026-07-19T00:00:00.000Z" };
    const analysis = makeAnalysis();
    const request = buildTrackPrepareRequest(makeTrack({ bpm: 122, camelotKey: "8A", moodTags: ["dreamy"], genres: ["house"] }), analysis, approval);
    expect(request).toEqual({
      sourceTrackId: "t1",
      audioRelPath: "Catalog/white-ropes.wav",
      display: { title: "White Ropes", artist: "Soulphiction" },
      musical: { bpm: 122, key: "8A", moods: ["dreamy"], genres: ["house"] },
      songIntelligence: { revision: analysis.updatedAt, analyzerVersion: analysis.analyzerVersion, configurationVersion: analysis.configurationVersion, status: analysis.status, sections: [] },
      approval: { approved: true, approvedAt: "2026-07-20T00:00:00.000Z", sourceAssetHash: "hash123", songIntelligenceRevision: "2026-07-19T00:00:00.000Z" },
      forceNewVersion: undefined,
    });
  });
});

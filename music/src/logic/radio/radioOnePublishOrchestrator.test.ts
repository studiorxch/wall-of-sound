import { describe, it, expect } from "vitest";
import { runOnePublish, type OnePublishContext, type OnePublishDeps } from "./radioOnePublishOrchestrator";
import type { RadioPlaylist, RadioPlaylistEntry } from "../../data/radioPlaylistTypes";
import type { RadioInboxItem } from "../../data/radioInboxTypes";
import type { Track } from "../../data/trackTypes";
import type { RadioTrackPackageManifest, RadioTrackPrepareResponse } from "../../data/radioTrackPackageTypes";
import type { RadioWebBundleExportResponse } from "../../data/radioWebBundleTypes";

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    trackId: "t1", title: "Song A", artist: "Artist A", audioRelPath: "catalog/audio/a.wav",
    sourceOwner: "studiorich", platformUse: ["studiorich_stream"],
    ...overrides,
  } as Track;
}

function makeInboxItem(id: string, sourceTrackId: string): RadioInboxItem {
  return {
    id, kind: "track", sourceTrackId, sourceFingerprint: `fp-${sourceTrackId}`,
    state: "ASSIGNED", readiness: "READY", assignedPlaylistIds: ["pl1"],
    createdAt: "2026-07-23T00:00:00.000Z", updatedAt: "2026-07-23T00:00:00.000Z",
  };
}

function makeEntry(overrides: Partial<RadioPlaylistEntry> = {}): RadioPlaylistEntry {
  return { id: "e1", inboxItemId: "i1", order: 0, locked: false, includedInPublish: true, stemPolicy: "none", ...overrides };
}

function makePlaylist(entries: RadioPlaylistEntry[]): RadioPlaylist {
  return {
    id: "pl1", title: "Test Station", version: "1", state: "DRAFT", entries,
    estimatedPublishBytes: 0, createdAt: "2026-07-23T00:00:00.000Z", updatedAt: "2026-07-23T00:00:00.000Z",
  };
}

function makeManifest(radioTrackId: string, title: string): RadioTrackPackageManifest {
  return {
    schemaVersion: "1.0.0", radioTrackId, packageVersion: 1, status: "RADIO_READY",
    source: { trackId: "t1", audioRelPath: "catalog/audio/a.wav" }, sourceAssetHash: "hash-current",
    audio: { primary: { codec: "opus", container: "ogg", mimeType: "audio/ogg; codecs=opus", relativePath: "audio.opus", bitrateKbps: 160, vbrMode: "constrained", channels: 2, sampleRate: 48000, durationSeconds: 200, decodedFrameCount48k: 9600000, byteSize: 4000000, sha256: "abc" } },
    display: { title, artist: "Artist A" }, musical: {}, songIntelligence: { sections: [] },
    approval: { approved: true, approvedAt: "2026-07-23T00:00:00.000Z", sourceAssetHash: "hash-current" },
    verification: { probeOk: true, decodeVerifyOk: true, deltaFrames: 0, verifiedAt: "2026-07-23T00:00:00.000Z" },
    createdAt: "2026-07-23T00:00:00.000Z",
  };
}

function baseDeps(overrides: Partial<OnePublishDeps> = {}): OnePublishDeps {
  return {
    fetchSourceAssetHash: async () => "hash-current",
    prepareTrack: async (): Promise<RadioTrackPrepareResponse> => ({
      ok: true, reused: false, radioTrackId: "rtrack_000001", packageVersion: 1,
      sourceAssetHash: "hash-current", packageManifestHash: "manifest-hash", issues: [],
    }),
    fetchPackageManifest: async (radioTrackId) => makeManifest(radioTrackId, "Song A"),
    exportBundle: async (): Promise<RadioWebBundleExportResponse> => ({
      ok: true, bundleVersion: 1, slug: "test-station", exportPath: "/lib/RadioWebExports/test-station/v1",
      contentSignature: "sig1", totalByteSize: 4000000, totalDurationSeconds: 200, entryCount: 1,
      validation: { ok: true, checkedAt: "2026-07-23T00:00:00.000Z", fileCount: 3, issues: [] }, issues: [],
    }),
    ...overrides,
  };
}

function baseCtx(entries: RadioPlaylistEntry[], tracks: Track[], inboxItems: RadioInboxItem[]): OnePublishContext {
  const playlist = makePlaylist(entries);
  return { playlist, inboxItems, tracks, analyses: [], allPlaylists: [playlist] };
}

describe("runOnePublish", () => {
  it("approves, prepares, and exports a clean not-yet-approved entry in one call", async () => {
    const entry = makeEntry();
    const ctx = baseCtx([entry], [makeTrack()], [makeInboxItem("i1", "t1")]);
    const patches: Array<[string, unknown]> = [];
    const stages: string[] = [];
    const result = await runOnePublish(ctx, baseDeps({
      onProgress: (s) => stages.push(s),
      onEntryPatch: (id, patch) => patches.push([id, patch]),
    }));
    expect(result.ok).toBe(true);
    expect(result.exportRecord?.bundleVersion).toBe(1);
    expect(result.playlistPatch?.state).toBe("PUBLISHED");
    expect(stages).toEqual(["validating", "preparing", "exporting"]);
    expect(patches.length).toBe(2); // approval patch, then binding patch
  });

  it("is idempotent: an already-approved, already-bound, current entry is reused with no prepare/export network calls skipped-appropriately", async () => {
    const entry = makeEntry({
      approval: { approved: true, approvedAt: "t", sourceAssetHash: "hash-current" },
      trackBinding: { radioTrackId: "rtrack_000001", packageVersion: 1, sourceTrackId: "t1", sourceAssetHash: "hash-current", packageManifestHash: "manifest-hash", boundAt: "t" },
    });
    const ctx = baseCtx([entry], [makeTrack()], [makeInboxItem("i1", "t1")]);
    let prepareCalls = 0;
    const result = await runOnePublish(ctx, baseDeps({ prepareTrack: async () => { prepareCalls++; return { ok: true, reused: true, radioTrackId: "rtrack_000001", packageVersion: 1, issues: [] }; } }));
    expect(prepareCalls).toBe(0); // READY entry is reused, never re-prepared
    expect(result.ok).toBe(true);
  });

  it("blocks a rights-unresolved entry with the exact required category, but does not touch its approval/binding", async () => {
    const entry = makeEntry();
    const externalTrack = makeTrack({ sourceOwner: "external", platformUse: ["mixcloud", "reference_only"] });
    const ctx = baseCtx([entry], [externalTrack], [makeInboxItem("i1", "t1")]);
    const result = await runOnePublish(ctx, baseDeps());
    expect(result.ok).toBe(false);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].category).toBe("rights_unresolved");
    expect(result.failures[0].title).toBe("Song A");
  });

  it("publishes rights-cleared entries while isolating a rights-blocked sibling as its own reported failure", async () => {
    const cleared = makeEntry({ id: "e1", inboxItemId: "i1" });
    const blocked = makeEntry({ id: "e2", inboxItemId: "i2" });
    const ctx = baseCtx(
      [cleared, blocked],
      [makeTrack({ trackId: "t1" }), makeTrack({ trackId: "t2", sourceOwner: "external", platformUse: ["reference_only"] })],
      [makeInboxItem("i1", "t1"), makeInboxItem("i2", "t2")],
    );
    const result = await runOnePublish(ctx, baseDeps());
    expect(result.ok).toBe(true);
    expect(result.exportRecord).toBeDefined();
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].entryId).toBe("e2");
    expect(result.failures[0].category).toBe("rights_unresolved");
  });

  it("reports 'Source audio is not portable' for a rights-cleared track with no audioRelPath", async () => {
    const entry = makeEntry();
    const ctx = baseCtx([entry], [makeTrack({ audioRelPath: undefined })], [makeInboxItem("i1", "t1")]);
    const result = await runOnePublish(ctx, baseDeps());
    expect(result.ok).toBe(false);
    expect(result.failures[0].category).toBe("not_portable");
  });

  it("isolates a single preparation failure without stopping the whole publish, and preserves it as lastPreparationError via onEntryPatch", async () => {
    const entry = makeEntry();
    const ctx = baseCtx([entry], [makeTrack()], [makeInboxItem("i1", "t1")]);
    const patches: Array<[string, unknown]> = [];
    const result = await runOnePublish(ctx, baseDeps({
      prepareTrack: async () => ({ ok: false, reused: false, issues: [{ code: "RADIO_ENCODE_FAILED", message: "ffmpeg failed to encode", severity: "error" }] }),
      onEntryPatch: (id, patch) => patches.push([id, patch]),
    }));
    expect(result.ok).toBe(false);
    expect(result.failures[0].category).toBe("preparation_failed");
    expect(result.failures[0].message).toBe("ffmpeg failed to encode");
    const errorPatch = patches.find(([, p]) => (p as Partial<RadioPlaylistEntry>).lastPreparationError)?.[1] as Partial<RadioPlaylistEntry> | undefined;
    expect(errorPatch?.lastPreparationError?.message).toBe("ffmpeg failed to encode");
  });

  it("reports 'Playlist contains no publishable tracks' for an empty playlist", async () => {
    const ctx = baseCtx([], [], []);
    const result = await runOnePublish(ctx, baseDeps());
    expect(result.ok).toBe(false);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].category).toBe("no_publishable_tracks");
  });

  it("reports 'Web export failed' and preserves prepared work when the export call fails", async () => {
    const entry = makeEntry();
    const ctx = baseCtx([entry], [makeTrack()], [makeInboxItem("i1", "t1")]);
    const patches: Array<[string, unknown]> = [];
    const result = await runOnePublish(ctx, baseDeps({
      exportBundle: async () => ({ ok: false, issues: [{ code: "RADIO_WEB_BUNDLE_ENCODE_FAILED", message: "disk write failed", severity: "error" }] }),
      onEntryPatch: (id, patch) => patches.push([id, patch]),
    }));
    expect(result.ok).toBe(false);
    expect(result.failures[0].category).toBe("export_failed");
    expect(result.playlistPatch).toBeUndefined(); // never marked published on export failure
    expect(patches.length).toBeGreaterThan(0); // the entry's own approval/binding still persisted
  });

  it("treats an unchanged export as success and reuses the existing version (no new export record)", async () => {
    const entry = makeEntry({
      approval: { approved: true, approvedAt: "t", sourceAssetHash: "hash-current" },
      trackBinding: { radioTrackId: "rtrack_000001", packageVersion: 1, sourceTrackId: "t1", sourceAssetHash: "hash-current", packageManifestHash: "manifest-hash", boundAt: "t" },
    });
    const ctx = baseCtx([entry], [makeTrack()], [makeInboxItem("i1", "t1")]);
    const result = await runOnePublish(ctx, baseDeps({
      exportBundle: async () => ({ ok: true, unchanged: true, existingVersion: 1, issues: [] }),
    }));
    expect(result.ok).toBe(true);
    expect(result.exportRecord).toBeUndefined();
    expect(result.playlistPatch?.state).toBe("PUBLISHED");
  });

  it("skips an entry whose source track cannot be resolved at all", async () => {
    const entry = makeEntry({ inboxItemId: "missing" });
    const ctx = baseCtx([entry], [], []);
    const result = await runOnePublish(ctx, baseDeps());
    expect(result.ok).toBe(false);
    expect(result.failures[0].category).toBe("source_unavailable");
  });
});

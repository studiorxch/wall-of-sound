import { describe, it, expect } from "vitest";
import { buildWebBundlePlan, slugifyStationTitle, buildWebBundleExportRequest } from "./radioWebBundlePlan";
import type { EntryPlanInput } from "./radioWebBundlePlan";
import type { RadioPlaylist, RadioPlaylistEntry } from "../../data/radioPlaylistTypes";
import type { RadioTrackPackageManifest } from "../../data/radioTrackPackageTypes";
import type { Track } from "../../data/trackTypes";

function makePlaylist(overrides: Partial<RadioPlaylist> = {}): RadioPlaylist {
  return {
    id: "radplaylist_1",
    title: "My Mix",
    version: "1",
    state: "DRAFT",
    entries: [],
    estimatedPublishBytes: 0,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeEntry(overrides: Partial<RadioPlaylistEntry> = {}): RadioPlaylistEntry {
  return { id: "entry_1", inboxItemId: "inbox_1", order: 0, locked: false, includedInPublish: true, stemPolicy: "none", ...overrides };
}

function makeTrack(overrides: Partial<Track> = {}): Track {
  return { trackId: "t1", title: "White Ropes", artist: "Soulphiction", ...overrides } as Track;
}

function makeManifest(overrides: Partial<RadioTrackPackageManifest> = {}): RadioTrackPackageManifest {
  return {
    schemaVersion: "1.0.0",
    radioTrackId: "rtrack_000001",
    packageVersion: 1,
    status: "RADIO_READY",
    source: { trackId: "t1", audioRelPath: "Catalog/white-ropes.wav" },
    sourceAssetHash: "hash1",
    audio: { primary: { codec: "opus", container: "ogg", mimeType: "audio/ogg; codecs=opus", relativePath: "audio.opus", bitrateKbps: 160, vbrMode: "constrained", channels: 2, sampleRate: 48000, durationSeconds: 210, decodedFrameCount48k: 48000 * 210, byteSize: 4_200_000, sha256: "sha1" } },
    display: { title: "White Ropes", artist: "Soulphiction" },
    musical: {},
    songIntelligence: { sections: [] },
    approval: { approved: true, approvedAt: "2026-07-18T00:00:00.000Z", sourceAssetHash: "hash1" },
    verification: { probeOk: true, decodeVerifyOk: true, deltaFrames: 0, verifiedAt: "2026-07-18T00:00:00.000Z" },
    createdAt: "2026-07-18T00:00:00.000Z",
    ...overrides,
  };
}

describe("buildWebBundlePlan", () => {
  it("blocks export on an empty playlist", () => {
    const plan = buildWebBundlePlan(makePlaylist(), []);
    expect(plan.canExport).toBe(false);
    expect(plan.blockers[0].code).toBe("RADIO_WEB_BUNDLE_EMPTY_PLAYLIST");
  });

  it("excludes EXCLUDED entries entirely — they never appear in the bundle or as blockers", () => {
    const entry = makeEntry({ includedInPublish: false });
    const inputs: EntryPlanInput[] = [{ entry, track: makeTrack(), state: "EXCLUDED", packageManifest: null }];
    const plan = buildWebBundlePlan(makePlaylist(), inputs);
    expect(plan.counts.excluded).toBe(1);
    expect(plan.readyEntries).toEqual([]);
    expect(plan.blockers).toEqual([]);
    // an all-excluded playlist still can't export — zero ready entries
    expect(plan.canExport).toBe(false);
  });

  it("blocks export when any enabled entry is not READY", () => {
    const readyEntry = makeEntry({ id: "e1", order: 0, trackBinding: { radioTrackId: "rtrack_000001", packageVersion: 1, sourceTrackId: "t1", sourceAssetHash: "hash1", packageManifestHash: "mh1", boundAt: "2026-07-18T00:00:00.000Z" } });
    const notApprovedEntry = makeEntry({ id: "e2", order: 1 });
    const inputs: EntryPlanInput[] = [
      { entry: readyEntry, track: makeTrack(), state: "READY", packageManifest: makeManifest() },
      { entry: notApprovedEntry, track: makeTrack({ trackId: "t2", title: "Second Track" }), state: "NOT_APPROVED", packageManifest: null },
    ];
    const plan = buildWebBundlePlan(makePlaylist(), inputs);
    expect(plan.canExport).toBe(false);
    expect(plan.blockers).toEqual([{ entryId: "e2", code: "RADIO_WEB_BUNDLE_ENTRY_NOT_APPROVED", message: '"Second Track" is not yet approved' }]);
    expect(plan.readyEntries).toHaveLength(1);
  });

  it("blocks export when a READY entry's package manifest hasn't loaded yet, even though the entry itself is ready", () => {
    const entry = makeEntry({ trackBinding: { radioTrackId: "rtrack_000001", packageVersion: 1, sourceTrackId: "t1", sourceAssetHash: "hash1", packageManifestHash: "mh1", boundAt: "2026-07-18T00:00:00.000Z" } });
    const inputs: EntryPlanInput[] = [{ entry, track: makeTrack(), state: "READY", packageManifest: null }];
    const plan = buildWebBundlePlan(makePlaylist(), inputs);
    expect(plan.canExport).toBe(false);
    expect(plan.blockers[0].code).toBe("RADIO_WEB_BUNDLE_MANIFEST_UNLOADED");
  });

  it("builds an exportable plan with real sizes/durations from the package manifest, in entry order", () => {
    const entry2 = makeEntry({ id: "e2", order: 1, trackBinding: { radioTrackId: "rtrack_000002", packageVersion: 1, sourceTrackId: "t2", sourceAssetHash: "hash2", packageManifestHash: "mh2", boundAt: "2026-07-18T00:00:00.000Z" } });
    const entry1 = makeEntry({ id: "e1", order: 0, trackBinding: { radioTrackId: "rtrack_000001", packageVersion: 1, sourceTrackId: "t1", sourceAssetHash: "hash1", packageManifestHash: "mh1", boundAt: "2026-07-18T00:00:00.000Z" } });
    const inputs: EntryPlanInput[] = [
      { entry: entry2, track: makeTrack({ trackId: "t2" }), state: "READY", packageManifest: makeManifest({ radioTrackId: "rtrack_000002", display: { title: "Second", artist: "Artist B" }, audio: { primary: { ...makeManifest().audio.primary, durationSeconds: 180, byteSize: 3_000_000 } } }) },
      { entry: entry1, track: makeTrack(), state: "READY", packageManifest: makeManifest() },
    ];
    const plan = buildWebBundlePlan(makePlaylist(), inputs);
    expect(plan.canExport).toBe(true);
    expect(plan.readyEntries.map((e) => e.entryId)).toEqual(["e1", "e2"]); // order-preserved, not input-order
    expect(plan.estimatedAudioBytes).toBe(4_200_000 + 3_000_000);
    expect(plan.estimatedTotalBytes).toBe(plan.estimatedAudioBytes);
    expect(plan.artworkAvailable).toBe(false);
  });

  it("counts embeddable data-url artwork toward the estimated total, but not http(s)-sourced artwork", () => {
    const entry = makeEntry({ trackBinding: { radioTrackId: "rtrack_000001", packageVersion: 1, sourceTrackId: "t1", sourceAssetHash: "hash1", packageManifestHash: "mh1", boundAt: "2026-07-18T00:00:00.000Z" } });
    const inputs: EntryPlanInput[] = [{ entry, track: makeTrack(), state: "READY", packageManifest: makeManifest() }];

    const withDataUrl = buildWebBundlePlan(makePlaylist({ coverImage: { src: `data:image/png;base64,${"A".repeat(100)}`, source: "uploaded", createdAt: "2026-07-01T00:00:00.000Z" } }), inputs);
    expect(withDataUrl.artworkAvailable).toBe(true);
    expect(withDataUrl.estimatedArtworkBytes).toBeGreaterThan(0);
    expect(withDataUrl.estimatedTotalBytes).toBe(withDataUrl.estimatedAudioBytes + withDataUrl.estimatedArtworkBytes);

    const withUrlOnly = buildWebBundlePlan(makePlaylist({ coverImage: { src: "https://example.com/cover.png", source: "url", createdAt: "2026-07-01T00:00:00.000Z" } }), inputs);
    expect(withUrlOnly.artworkAvailable).toBe(false);
    expect(withUrlOnly.estimatedArtworkBytes).toBe(0);
  });
});

describe("slugifyStationTitle", () => {
  it("lowercases and hyphenates a normal title", () => {
    expect(slugifyStationTitle("Soft Motion Radio")).toBe("soft-motion-radio");
  });

  it("strips characters outside [a-z0-9-] and collapses runs of separators", () => {
    expect(slugifyStationTitle("My Mix!! (v2) -- 2026")).toBe("my-mix-v2-2026");
  });

  it("falls back to a non-empty default when nothing usable remains", () => {
    expect(slugifyStationTitle("🎧🎧🎧")).toBe("station");
  });
});

describe("buildWebBundleExportRequest", () => {
  it("sends only exact {radioTrackId, packageVersion} bindings — no display/musical/section payload", () => {
    const entry = makeEntry({ trackBinding: { radioTrackId: "rtrack_000001", packageVersion: 3, sourceTrackId: "t1", sourceAssetHash: "hash1", packageManifestHash: "mh1", boundAt: "2026-07-18T00:00:00.000Z" } });
    const inputs: EntryPlanInput[] = [{ entry, track: makeTrack(), state: "READY", packageManifest: makeManifest({ packageVersion: 3 }) }];
    const plan = buildWebBundlePlan(makePlaylist({ title: "My Mix" }), inputs);
    const request = buildWebBundleExportRequest(plan, "my-mix", undefined, false);
    expect(request).toEqual({
      stationId: "radplaylist_1", title: "My Mix", slug: "my-mix",
      entries: [{ radioTrackId: "rtrack_000001", packageVersion: 3 }],
      artworkDataUrl: undefined, force: false,
    });
  });
});

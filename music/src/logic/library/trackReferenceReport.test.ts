import { describe, it, expect } from "vitest";
import { findTrackReferences, isEmptyTrackReferenceReport } from "./trackReferenceReport";
import type { Track } from "../../data/trackTypes";
import type { CrateRecord } from "../../data/crateTypes";
import { defaultCrateFilters } from "../../data/crateTypes";
import type { PlaylistRecord } from "../../data/playProjectTypes";
import type { TrackSlot } from "../../data/playlistTypes";
import type { RadioInboxItem } from "../../data/radioInboxTypes";
import type { RadioPlaylist } from "../../data/radioPlaylistTypes";
import type { RadioBank } from "../../data/radioBankTypes";
import type { GlyphComposition } from "../../data/glyphCompositionTypes";

const NOW = "2026-07-28T00:00:00.000Z";

function track(overrides: Partial<Track> & { trackId: string }): Track {
  return {
    title: "T", artist: "A", durationSeconds: 100, energy: 0.5, energySource: "manual",
    sourceOwner: "studiorich",
    ...overrides,
  } as Track;
}

function crate(overrides: Partial<CrateRecord> & { id: string }): CrateRecord {
  return {
    name: "Crate", createdAt: NOW, updatedAt: NOW, sourceOwners: ["studiorich", "external"],
    filters: defaultCrateFilters(),
    ...overrides,
  } as CrateRecord;
}

function slot(slotIndex: number, assignedTrackId?: string): TrackSlot {
  return { slotId: `slot_${slotIndex}`, slotIndex, startTimeSeconds: slotIndex * 180, targetEnergy: 0.5, targetBpm: 120, assignedTrackId, warningLevel: "none", warningMessages: [] };
}

function playlist(overrides: Partial<PlaylistRecord> & { playlistId: string; title: string; slots: TrackSlot[] }): PlaylistRecord {
  return {
    curve: {} as unknown as PlaylistRecord["curve"], locks: [], orphans: [],
    targetDurationMinutes: 60, createdAt: NOW, updatedAt: NOW,
    ...overrides,
  } as unknown as PlaylistRecord;
}

function inboxItem(overrides: Partial<RadioInboxItem> & { id: string }): RadioInboxItem {
  return {
    kind: "track", sourceFingerprint: "fp", state: "INBOX", readiness: "UNPREPARED",
    assignedPlaylistIds: [], createdAt: NOW, updatedAt: NOW,
    ...overrides,
  } as RadioInboxItem;
}

function radioPlaylist(overrides: Partial<RadioPlaylist> & { id: string; title: string }): RadioPlaylist {
  return {
    state: "DRAFT", entries: [], estimatedPublishBytes: 0, createdAt: NOW, updatedAt: NOW,
    ...overrides,
  } as RadioPlaylist;
}

function radioBank(overrides: Partial<RadioBank> & { id: string; title: string }): RadioBank {
  return { entries: [], createdAt: NOW, updatedAt: NOW, ...overrides };
}

function glyphComposition(overrides: Partial<GlyphComposition> & { id: string; name: string }): GlyphComposition {
  return {
    schemaVersion: 1,
    source: { kind: "library_track", trackId: "t1" },
    sourceDurationSeconds: 100,
    analysisId: "a1",
    mappingPresetId: "p1",
    mappingPresetSnapshot: {} as GlyphComposition["mappingPresetSnapshot"],
    grammarId: "g1",
    grammarSnapshot: {} as GlyphComposition["grammarSnapshot"],
    connectionGrammarId: "cg1",
    connectionGrammarSnapshot: {} as GlyphComposition["connectionGrammarSnapshot"],
    connectionOverrides: [],
    layoutPresetId: "l1",
    layoutPresetSnapshot: {} as GlyphComposition["layoutPresetSnapshot"],
    pulseTruthSnapshot: {} as GlyphComposition["pulseTruthSnapshot"],
    canvasPresetSnapshot: {} as GlyphComposition["canvasPresetSnapshot"],
    viewportMode: "fitCanvas",
    layerVisibility: { pulseManuscript: true, drumEvents: false, clapEvents: false, accentEvents: false, laserLayer: false, sections: true, barPunctuation: true, safeArea: false },
    seed: 1,
    cacheKey: "abc123",
    createdAt: NOW, updatedAt: NOW,
    ...overrides,
  };
}

describe("findTrackReferences — crates", () => {
  it("reports a crate whose filters currently match the track (reuses resolveCrateTracks, not reimplemented)", () => {
    const t = track({ trackId: "t1", moodTags: ["Chill"] });
    const matching = crate({ id: "c1", name: "Chill Vibes", filters: { ...defaultCrateFilters(), moodTags: ["Chill"] } });
    const nonMatching = crate({ id: "c2", name: "Energetic Only", filters: { ...defaultCrateFilters(), moodTags: ["Energetic"] } });

    const report = findTrackReferences("t1", { crates: [matching, nonMatching], libraryTracks: [t] });
    expect(report.crates).toEqual([{ id: "c1", label: "Chill Vibes" }]);
  });

  it("never matches a reference/Sounds track — crates explicitly never accept that source", () => {
    const t = track({ trackId: "t1", sourceOwner: "reference", moodTags: ["Chill"] });
    const c = crate({ id: "c1", name: "Chill Vibes", filters: { ...defaultCrateFilters(), moodTags: ["Chill"] } });
    const report = findTrackReferences("t1", { crates: [c], libraryTracks: [t] });
    expect(report.crates).toEqual([]);
  });
});

describe("findTrackReferences — playlists", () => {
  it("reports every playlist with a slot assigned to the track", () => {
    const pl1 = playlist({ playlistId: "pl1", title: "Friday Set", slots: [slot(0, "t1"), slot(1, "t2")] });
    const pl2 = playlist({ playlistId: "pl2", title: "Saturday Set", slots: [slot(0, "t2")] });
    const report = findTrackReferences("t1", { musicPlaylists: [pl1, pl2] });
    expect(report.playlists).toEqual([{ id: "pl1", label: "Friday Set" }]);
  });

  it("reports no playlists when the track appears in none", () => {
    const pl1 = playlist({ playlistId: "pl1", title: "Friday Set", slots: [slot(0, "t2")] });
    const report = findTrackReferences("t1", { musicPlaylists: [pl1] });
    expect(report.playlists).toEqual([]);
  });
});

describe("findTrackReferences — RADIO (playlists and banks via inbox items)", () => {
  it("resolves RADIO playlist/bank membership through the inbox item's sourceTrackId, not a direct field", () => {
    const item = inboxItem({ id: "inbox1", sourceTrackId: "t1", assignedPlaylistIds: ["rp1"], assignedBankIds: ["rb1"] });
    const otherItem = inboxItem({ id: "inbox2", sourceTrackId: "t2", assignedPlaylistIds: ["rp2"] });
    const rp1 = radioPlaylist({ id: "rp1", title: "Live Set" });
    const rp2 = radioPlaylist({ id: "rp2", title: "Other Set" });
    const rb1 = radioBank({ id: "rb1", title: "Loop Kit" });

    const report = findTrackReferences("t1", {
      radioInboxItems: [item, otherItem],
      radioPlaylists: [rp1, rp2],
      radioBanks: [rb1],
    });
    expect(report.radioPlaylists).toEqual([{ id: "rp1", label: "Live Set" }]);
    expect(report.radioBanks).toEqual([{ id: "rb1", label: "Loop Kit" }]);
  });

  it("reports nothing when no inbox item snapshots this track", () => {
    const item = inboxItem({ id: "inbox1", sourceTrackId: "t2", assignedPlaylistIds: ["rp1"] });
    const rp1 = radioPlaylist({ id: "rp1", title: "Live Set" });
    const report = findTrackReferences("t1", { radioInboxItems: [item], radioPlaylists: [rp1] });
    expect(report.radioPlaylists).toEqual([]);
    expect(report.radioBanks).toEqual([]);
  });
});

describe("findTrackReferences — Glyph Compositions", () => {
  it("reports a saved composition whose source.trackId matches (0804A_GLYPH_AUDIO_First_Slice)", () => {
    const gc1 = glyphComposition({ id: "gc1", name: "Track One — Manuscript", source: { kind: "library_track", trackId: "t1" } });
    const gc2 = glyphComposition({ id: "gc2", name: "Track Two — Manuscript", source: { kind: "library_track", trackId: "t2" } });
    const report = findTrackReferences("t1", { glyphCompositions: [gc1, gc2] });
    expect(report.glyphCompositions).toEqual([{ id: "gc1", label: "Track One — Manuscript" }]);
  });

  it("does not match a composition built from a local (non-Catalog) import", () => {
    const gc = glyphComposition({
      id: "gc1", name: "Imported — Manuscript",
      source: { kind: "local_import", importId: "imp1", filename: "demo.wav" },
    });
    const report = findTrackReferences("t1", { glyphCompositions: [gc] });
    expect(report.glyphCompositions).toEqual([]);
  });

  it("reports no compositions when the track appears in none", () => {
    const gc = glyphComposition({ id: "gc1", name: "Other Track", source: { kind: "library_track", trackId: "t2" } });
    const report = findTrackReferences("t1", { glyphCompositions: [gc] });
    expect(report.glyphCompositions).toEqual([]);
  });
});

describe("isEmptyTrackReferenceReport", () => {
  it("is true when every category is empty", () => {
    expect(isEmptyTrackReferenceReport({ crates: [], playlists: [], radioPlaylists: [], radioBanks: [], glyphCompositions: [] })).toBe(true);
  });

  it("is false when any single category has a match", () => {
    expect(isEmptyTrackReferenceReport({ crates: [{ id: "c1", label: "X" }], playlists: [], radioPlaylists: [], radioBanks: [], glyphCompositions: [] })).toBe(false);
  });

  it("is false when only glyphCompositions has a match", () => {
    expect(isEmptyTrackReferenceReport({ crates: [], playlists: [], radioPlaylists: [], radioBanks: [], glyphCompositions: [{ id: "gc1", label: "X" }] })).toBe(false);
  });

  it("returns a fully empty report when given no data at all (no crash on missing optional inputs)", () => {
    const report = findTrackReferences("t1", {});
    expect(isEmptyTrackReferenceReport(report)).toBe(true);
  });
});

import { describe, it, expect } from "vitest";
import { findTracksMissingFromSaved } from "./externalIndexRecovery";
import type { Track } from "../data/trackTypes";

function track(overrides: Partial<Track> & { trackId: string }): Track {
  return {
    title: "T", artist: "A", durationSeconds: 100, energy: 0.5, energySource: "manual",
    sourceOwner: "external",
    ...overrides,
  } as Track;
}

describe("findTracksMissingFromSaved — Step C2 disk-index recovery merge", () => {
  it("returns empty when saved already has everything disk has", () => {
    const saved = [track({ trackId: "a" }), track({ trackId: "b" })];
    const disk = [track({ trackId: "a" }), track({ trackId: "b" })];
    expect(findTracksMissingFromSaved(saved, disk, "external")).toEqual([]);
  });

  it("the exact reproduced bug scenario: saved (IDB) has MORE tracks than disk — nothing is discarded, nothing is added back from disk", () => {
    // IDB has 3 tracks (a real, accepted update); disk only has 2 (its write
    // was rejected/failed and never caught up). The old "index wins" logic
    // would have reverted IDB down to disk's 2. The fix must never do that.
    const saved = [track({ trackId: "a" }), track({ trackId: "b" }), track({ trackId: "c" })];
    const disk = [track({ trackId: "a" }), track({ trackId: "b" })];
    const missing = findTracksMissingFromSaved(saved, disk, "external");
    expect(missing).toEqual([]);
    // Critically: track "c" (the one only IDB has) must not appear in the
    // removal set — this function only ever returns ADDITIONS.
  });

  it("recovery case: saved (IDB) is empty for this owner, disk has real tracks — all of disk is returned as missing (safe to add)", () => {
    const saved: Track[] = [];
    const disk = [track({ trackId: "a" }), track({ trackId: "b" }), track({ trackId: "c" })];
    const missing = findTracksMissingFromSaved(saved, disk, "external");
    expect(missing.map((t) => t.trackId).sort()).toEqual(["a", "b", "c"]);
  });

  it("partial recovery: disk has one track IDB is missing among others it already has", () => {
    const saved = [track({ trackId: "a" }), track({ trackId: "b" })];
    const disk = [track({ trackId: "a" }), track({ trackId: "b" }), track({ trackId: "c" })];
    const missing = findTracksMissingFromSaved(saved, disk, "external");
    expect(missing.map((t) => t.trackId)).toEqual(["c"]);
  });

  it("only considers tracks belonging to the given owner when computing what's already saved", () => {
    // A "reference" track sharing a trackId-space quirk with an "external"
    // disk entry must not be treated as already-present for a different owner.
    const saved = [track({ trackId: "a", sourceOwner: "reference" })];
    const disk = [track({ trackId: "a", sourceOwner: "external" })];
    const missing = findTracksMissingFromSaved(saved, disk, "external");
    expect(missing.map((t) => t.trackId)).toEqual(["a"]);
  });

  it("never mutates the input arrays", () => {
    const saved = [track({ trackId: "a" })];
    const disk = [track({ trackId: "a" }), track({ trackId: "b" })];
    const savedCopy = [...saved];
    const diskCopy = [...disk];
    findTracksMissingFromSaved(saved, disk, "external");
    expect(saved).toEqual(savedCopy);
    expect(disk).toEqual(diskCopy);
  });
});

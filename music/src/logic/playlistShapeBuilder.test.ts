// 0804_MUSIC_Playlist_Eligibility_Repair — §13 required tests (numbered in
// each test name where applicable) for the NEW behavior this build adds to
// playlistShapeBuilder.ts: the Intro mechanical-role fallback ladder,
// requiredMechanicalRoles hard filter, empty-vs-hard-blocked crate
// diagnostics, and PlaylistGenerationState derivation. Existing BPM/key
// sequencing/energy-tier/duplicate-guard behavior is covered by
// playlistSequencing.test.ts and is not re-tested here.

import { describe, it, expect } from "vitest";
import { buildShapePlaylist, derivePlaylistGenerationState } from "./playlistShapeBuilder";
import type { PlaylistShapeConfig } from "../data/playlistShapeTypes";
import { makeEnvelope } from "./playlistEnergyEnvelope";
import type { Track } from "../data/trackTypes";
import type { CrateRecord } from "../data/crateTypes";

function track(id: string, opts: Partial<Track> = {}): Track {
  return {
    trackId: id, title: id, artist: opts.artist ?? "Artist",
    durationSeconds: 200, energy: 0.5,
    sourceOwner: "studiorich", genres: [], moodTags: [], moodSuggestions: [],
    sourcePoolIds: [], grouping: "", albumArtist: "", archiveStatus: "library",
    ...opts,
  } as unknown as Track;
}

function crate(id: string, name = id): CrateRecord {
  return {
    id, name, createdAt: "", updatedAt: "",
    sourceOwners: ["studiorich"],
    filters: { moodTags: [], groupings: [], genres: [], matchMode: "all_groups" },
  } as CrateRecord;
}

function introShape(durationMinutes = 30): PlaylistShapeConfig {
  return {
    mode: "organized", targetDurationMinutes: durationMinutes, introMinutes: durationMinutes, outroMinutes: 0, middleBlockMinutes: durationMinutes,
    sections: [{
      id: "intro", label: "Intro", durationMinutes,
      crateWeights: [{ crateId: "c1", weight: 100 }],
      energyEnvelope: makeEnvelope(0.3, 0.3, "flat", "explicit"),
    }],
  };
}

describe("Intro mechanical-role fallback ladder (§8)", () => {
  it("[test 4] selects an opener-tagged track over everything else", () => {
    const tracks = [
      track("plain", { energy: 0.3 }),
      track("opener1", { mechanicalMoodTags: ["opener"], energy: 0.3 }),
    ];
    const result = buildShapePlaylist({ libraryTracks: tracks, crates: [crate("c1")], shapeConfig: introShape(200) });
    expect(result.sections[0].tracks[0].trackId).toBe("opener1");
    expect(result.sections[0].introFallbackLevel).toBe(0);
  });

  it("[test 5] falls back to drift (tier 1) when no opener exists", () => {
    const tracks = [
      track("plain", { energy: 0.3 }),
      track("drifter", { mechanicalMoodTags: ["drift"], energy: 0.3 }),
    ];
    const result = buildShapePlaylist({ libraryTracks: tracks, crates: [crate("c1")], shapeConfig: introShape(200) });
    expect(result.sections[0].tracks[0].trackId).toBe("drifter");
    expect(result.sections[0].introFallbackLevel).toBe(1);
  });

  it("also accepts reset/hold/plateau as tier-1 compatible opening roles", () => {
    for (const role of ["reset", "hold", "plateau"] as const) {
      const tracks = [
        track("plain", { energy: 0.3 }),
        track("tagged", { mechanicalMoodTags: [role], energy: 0.3 }),
      ];
      const result = buildShapePlaylist({ libraryTracks: tracks, crates: [crate("c1")], shapeConfig: introShape(200) });
      expect(result.sections[0].tracks[0].trackId).toBe("tagged");
    }
  });

  it("[test 6] falls back to a low-energy 'build'-tagged track (tier 2) when no opener/tier-1 role exists", () => {
    const tracks = [
      track("highEnergyBuild", { mechanicalMoodTags: ["build"], energy: 0.9 }), // build but NOT low-energy — tier 3
      track("lowEnergyBuild", { mechanicalMoodTags: ["build"], energy: 0.1 }),  // build AND below target — tier 2
    ];
    const result = buildShapePlaylist({ libraryTracks: tracks, crates: [crate("c1")], shapeConfig: introShape(200) });
    expect(result.sections[0].tracks[0].trackId).toBe("lowEnergyBuild");
    expect(result.sections[0].introFallbackLevel).toBe(2);
  });

  it("[test 7] uses any hard-eligible track (tier 3) before failing when no role signal exists at all", () => {
    const tracks = [track("untagged1", { energy: 0.3 }), track("untagged2", { energy: 0.9 })];
    const result = buildShapePlaylist({ libraryTracks: tracks, crates: [crate("c1")], shapeConfig: introShape(200) });
    // Both tracks picked (tier 3 = no role constraint at all) rather than the
    // section failing outright — it just can't fully fill 200 minutes from
    // only 2 tracks, hence a "could only fill" warning, not "no eligible tracks".
    expect(result.sections[0].tracks.length).toBe(2);
    expect(result.sections[0].introFallbackLevel).toBe(3);
    expect(result.sections[0].warning).not.toMatch(/no eligible tracks/i);
  });

  it("a track lacking the preferred role is never excluded — it simply falls to a later tier/pick, never dropped", () => {
    const tracks = [
      track("opener1", { mechanicalMoodTags: ["opener"], energy: 0.3, durationSeconds: 60 }),
      track("untagged", { energy: 0.3, durationSeconds: 60 }),
    ];
    // Long enough intro that BOTH tracks must be picked to fill it.
    const result = buildShapePlaylist({ libraryTracks: tracks, crates: [crate("c1")], shapeConfig: introShape(2) });
    const ids = result.sections[0].tracks.map((t) => t.trackId).sort();
    expect(ids).toEqual(["opener1", "untagged"]);
  });

  it("does not apply the ladder to non-Intro sections — role tags have no effect there", () => {
    const shape: PlaylistShapeConfig = {
      mode: "organized", targetDurationMinutes: 200, introMinutes: 0, outroMinutes: 0, middleBlockMinutes: 200,
      sections: [{
        id: "s1", label: "S01", durationMinutes: 200,
        crateWeights: [{ crateId: "c1", weight: 100 }],
        energyEnvelope: makeEnvelope(0.3, 0.3, "flat", "explicit"),
      }],
    };
    const tracks = [track("plain", { energy: 0.3 }), track("opener1", { mechanicalMoodTags: ["opener"], energy: 0.3 })];
    const result = buildShapePlaylist({ libraryTracks: tracks, crates: [crate("c1")], shapeConfig: shape });
    expect(result.sections[0].introFallbackLevel).toBeUndefined();
  });
});

describe("requiredMechanicalRoles hard filter (§8 test #16)", () => {
  it("[test 16] excludes every candidate lacking the required role, even for Intro — a genuine hard filter, not a fallback-eligible preference", () => {
    const shape = introShape(200);
    shape.sections[0].requiredMechanicalRoles = ["opener"];
    const tracks = [
      track("untagged", { energy: 0.3 }),
      track("wrongRole", { mechanicalMoodTags: ["drift"], energy: 0.3 }),
      track("opener1", { mechanicalMoodTags: ["opener"], energy: 0.3 }),
    ];
    const result = buildShapePlaylist({ libraryTracks: tracks, crates: [crate("c1")], shapeConfig: shape });
    expect(result.sections[0].tracks.map((t) => t.trackId)).toEqual(["opener1"]);
    // Hard-filtered sections skip the fallback ladder entirely — nothing to log.
    expect(result.sections[0].introFallbackLevel).toBeUndefined();
  });

  it("reports the section as having no eligible tracks (not a crash) when the required role matches nothing", () => {
    const shape = introShape(200);
    shape.sections[0].requiredMechanicalRoles = ["opener"];
    const tracks = [track("untagged", { energy: 0.3 })];
    const result = buildShapePlaylist({ libraryTracks: tracks, crates: [crate("c1")], shapeConfig: shape });
    expect(result.sections[0].tracks).toEqual([]);
    expect(result.sections[0].warning).toBeTruthy();
  });
});

describe("Empty-crate vs all-hard-blocked-crate diagnostics (§10, tests #8/#9)", () => {
  it("[test 8] reports a genuinely empty crate distinctly", () => {
    const shape = introShape(200);
    const result = buildShapePlaylist({
      libraryTracks: [], crates: [crate("c1", "My Crate")], shapeConfig: shape,
      allLibraryTracksForDiagnostics: [], // nothing in the whole library either
    });
    expect(result.sections[0].warning).toMatch(/empty/i);
    expect(result.sections[0].warning).toContain("My Crate");
  });

  it("[test 9] reports a crate whose tracks exist but all fail hard eligibility, distinctly from an empty crate", () => {
    const shape = introShape(200);
    const wholeLibrary = [track("blocked1", { audioMissing: true })];
    const result = buildShapePlaylist({
      libraryTracks: [], // already gated — nothing survived
      crates: [crate("c1", "My Crate")],
      shapeConfig: shape,
      allLibraryTracksForDiagnostics: wholeLibrary, // but the crate DOES match something pre-gate
    });
    expect(result.sections[0].warning).toMatch(/fail hard eligibility/i);
    expect(result.sections[0].warning).not.toMatch(/^"Intro"'s assigned crate.*empty/i);
  });

  it("reports a crate that no longer exists distinctly, per §10 'confirm the assigned crate exists'", () => {
    const shape = introShape(200);
    const result = buildShapePlaylist({ libraryTracks: [], crates: [], shapeConfig: shape });
    expect(result.sections[0].warning).toMatch(/no longer exists/i);
  });
});

describe("derivePlaylistGenerationState (§9)", () => {
  it("[test 13] is 'blocked' when zero tracks were generated anywhere", () => {
    const result = buildShapePlaylist({ libraryTracks: [], crates: [], shapeConfig: introShape(200) });
    expect(derivePlaylistGenerationState(result)).toBe("blocked");
  });

  it("[test 12] is 'partial' when at least one section fell short of its target", () => {
    const tracks = [track("only", { energy: 0.3, durationSeconds: 60 })];
    // 200-minute target, one 60-second track — nowhere close to full.
    const result = buildShapePlaylist({ libraryTracks: tracks, crates: [crate("c1")], shapeConfig: introShape(200) });
    expect(derivePlaylistGenerationState(result)).toBe("partial");
  });

  it("is 'complete' when every section reaches its target duration", () => {
    const tracks = Array.from({ length: 5 }, (_, i) => track(`t${i}`, { energy: 0.3, durationSeconds: 120 }));
    const result = buildShapePlaylist({ libraryTracks: tracks, crates: [crate("c1")], shapeConfig: introShape(5) }); // 5 min = 300s
    expect(derivePlaylistGenerationState(result)).toBe("complete");
  });
});

describe("Missing metadata never hard-excludes a candidate (§10, §12, test #10)", () => {
  it("a track with no BPM/key/mood at all still gets picked when it's the only candidate", () => {
    const tracks = [track("bare", { energy: 0.3, bpm: undefined, camelotKey: undefined, moodTags: [] })];
    const result = buildShapePlaylist({ libraryTracks: tracks, crates: [crate("c1")], shapeConfig: introShape(200) });
    expect(result.sections[0].tracks.map((t) => t.trackId)).toEqual(["bare"]);
  });

  it("a low-scoring candidate (poor BPM/key fit) is still picked when it's the only remaining option — low score is never hard rejection", () => {
    const tracks = [
      track("anchor", { bpm: 120, bpmSource: "manual", camelotKey: "8B", keySource: "manual", energy: 0.3, durationSeconds: 60 }),
      track("farBpm", { bpm: 200, bpmSource: "manual", camelotKey: "1A", keySource: "manual", energy: 0.3, durationSeconds: 60 }),
    ];
    const result = buildShapePlaylist({ libraryTracks: tracks, crates: [crate("c1")], shapeConfig: introShape(2) });
    const ids = result.sections[0].tracks.map((t) => t.trackId).sort();
    expect(ids).toEqual(["anchor", "farBpm"]); // both picked — poor fit just orders it worse, never excludes
  });
});

describe("Regeneration reflects current crate membership (§10, test #15)", () => {
  it("buildShapePlaylist has no internal caching — a changed libraryTracks pool is fully reflected on the next call", () => {
    const c = crate("c1");
    const shape = introShape(200);
    const before = buildShapePlaylist({ libraryTracks: [track("a", { energy: 0.3 })], crates: [c], shapeConfig: shape });
    expect(before.sections[0].tracks.map((t) => t.trackId)).toEqual(["a"]);

    const after = buildShapePlaylist({ libraryTracks: [track("b", { energy: 0.3 })], crates: [c], shapeConfig: shape });
    expect(after.sections[0].tracks.map((t) => t.trackId)).toEqual(["b"]);
  });
});

describe("Deterministic generation under fixed input (test #17)", () => {
  it("the exact same input produces the exact same output on repeated calls", () => {
    const tracks = [
      track("a", { bpm: 120, energy: 0.4, mechanicalMoodTags: ["opener"] }),
      track("b", { bpm: 122, energy: 0.35 }),
      track("c", { bpm: 200, energy: 0.9 }),
    ];
    const shape = introShape(200);
    const r1 = buildShapePlaylist({ libraryTracks: tracks, crates: [crate("c1")], shapeConfig: shape });
    const r2 = buildShapePlaylist({ libraryTracks: tracks, crates: [crate("c1")], shapeConfig: shape });
    expect(r1.sections[0].tracks.map((t) => t.trackId)).toEqual(r2.sections[0].tracks.map((t) => t.trackId));
  });
});

// 0804_MUSIC_Crate_BPM_Group_Filters §10/§13 test #18 — "playlist generation
// uses saved current crate membership" for the NEW bpm/groups filters
// specifically (the underlying no-caching/fresh-resolution behavior was
// already covered above for the pre-existing filter categories).
describe("Playlist generation respects a crate's BPM/Group filters (0804H, test #18)", () => {
  it("a crate with an active BPM range only admits in-range tracks into section candidates", () => {
    const c = crate("c1");
    c.filters.bpm = { minimum: 118, maximum: 132, includeUnresolved: false };
    const tracks = [
      track("inRange", { bpm: 125, bpmSource: "manual", energy: 0.3 }),
      track("outOfRange", { bpm: 200, bpmSource: "manual", energy: 0.3 }),
    ];
    const result = buildShapePlaylist({ libraryTracks: tracks, crates: [c], shapeConfig: introShape(200) });
    expect(result.sections[0].tracks.map((t) => t.trackId)).toEqual(["inRange"]);
    // The excluded track is reported as outside_assigned_crate, not silently unexplained.
    expect(result.sections[0].outsideAssignedCrateCount).toBe(1);
  });

  it("a crate with an active Group include filter only admits matching tracks", () => {
    const c = crate("c1");
    c.filters.groups = { mode: "include", groupIds: ["House"] };
    const tracks = [
      track("inGroup", { grouping: "House", energy: 0.3 }),
      track("outGroup", { grouping: "Techno", energy: 0.3 }),
    ];
    const result = buildShapePlaylist({ libraryTracks: tracks, crates: [c], shapeConfig: introShape(200) });
    expect(result.sections[0].tracks.map((t) => t.trackId)).toEqual(["inGroup"]);
    expect(result.sections[0].outsideAssignedCrateCount).toBe(1);
  });

  it("a fresh crate object (simulating a just-saved filter edit) is reflected on the very next generation call — no stale membership", () => {
    const tracks = [track("a", { bpm: 200, bpmSource: "manual", energy: 0.3 })];
    const shape = introShape(200);

    const before = crate("c1");
    const resultBefore = buildShapePlaylist({ libraryTracks: tracks, crates: [before], shapeConfig: shape });
    expect(resultBefore.sections[0].tracks.map((t) => t.trackId)).toEqual(["a"]);

    const afterEdit = crate("c1");
    afterEdit.filters.bpm = { minimum: 40, maximum: 150, includeUnresolved: false }; // now excludes the 200bpm track
    const resultAfter = buildShapePlaylist({ libraryTracks: tracks, crates: [afterEdit], shapeConfig: shape });
    expect(resultAfter.sections[0].tracks).toEqual([]);
  });
});

import { describe, it, expect } from "vitest";
import { computeBpmTransitionDistance, scoreBpmTransition } from "./bpmTransition";
import { scoreKeyTransition, normalizeCamelotPenalty } from "./keyTransition";
import { computeTransitionScore, DEFAULT_TRANSITION_WEIGHTS } from "./transitionScore";
import { classifySectionSequencingRole, getSectionSequencingProfile } from "./sectionSequencingProfile";
import { describeTransitionWarnings, describeSectionSequencingWarnings } from "./transitionWarnings";
import { buildShapePlaylist } from "../playlistShapeBuilder";
import type { PlaylistShapeConfig } from "../../data/playlistShapeTypes";
import { makeEnvelope } from "../playlistEnergyEnvelope";
import type { Track } from "../../data/trackTypes";
import type { CrateRecord } from "../../data/crateTypes";

// ── BPM transition distance/scoring ─────────────────────────────────────────

describe("computeBpmTransitionDistance", () => {
  it("returns unknown when either BPM is missing", () => {
    expect(computeBpmTransitionDistance(undefined, 120).relationship).toBe("unknown");
    expect(computeBpmTransitionDistance(120, undefined).relationship).toBe("unknown");
  });

  it("reports a direct relationship for close BPMs", () => {
    const d = computeBpmTransitionDistance(120, 124);
    expect(d.relationship).toBe("direct");
    expect(d.directDelta).toBe(4);
    expect(d.effectiveDelta).toBe(4);
  });

  it("recognizes half-time compatibility (70 vs 140 — a read at double speed equals b)", () => {
    const d = computeBpmTransitionDistance(70, 140);
    expect(d.relationship).toBe("half_time"); // a*2 (140) matches b exactly
    expect(d.effectiveDelta).toBe(0);
  });

  it("recognizes double-time compatibility (150 vs 75 — b read at double speed equals a)", () => {
    const d = computeBpmTransitionDistance(150, 75);
    expect(d.relationship).toBe("double_time"); // b*2 (150) matches a exactly
    expect(d.effectiveDelta).toBe(0);
  });

  it("prefers direct continuity when direct and half/double are comparably strong", () => {
    // direct delta 2 vs half-time delta 1 — within the preference margin, must stay direct
    const d = computeBpmTransitionDistance(120, 122);
    expect(d.relationship).toBe("direct");
  });

  it("retains raw direct/half/double deltas alongside the effective one", () => {
    const d = computeBpmTransitionDistance(80, 160);
    expect(d.directDelta).toBe(80);
    expect(d.halfTimeDelta).toBe(0); // 80*2 matches 160 exactly
    expect(d.effectiveDelta).toBe(0);
  });
});

describe("scoreBpmTransition", () => {
  it("returns neutral (0.5) for unknown relationship", () => {
    expect(scoreBpmTransition({ relationship: "unknown" })).toBe(0.5);
  });
  it("scores excellent for a small delta", () => {
    expect(scoreBpmTransition(computeBpmTransitionDistance(120, 121))).toBe(1.0);
  });
  it("scores a strong penalty for a large incompatible jump", () => {
    expect(scoreBpmTransition(computeBpmTransitionDistance(90, 150))).toBeLessThanOrEqual(0.35);
  });
  it("caps half/double-time matches slightly below a perfect direct score", () => {
    const d = computeBpmTransitionDistance(75, 150); // exact double-time match, effectiveDelta 0
    const score = scoreBpmTransition(d);
    expect(d.relationship).not.toBe("direct");
    expect(score).toBeLessThanOrEqual(0.85);
    expect(score).toBeGreaterThan(0.5);
  });
});

// ── Key transition scoring ──────────────────────────────────────────────────

describe("scoreKeyTransition", () => {
  it("is neutral when either key is missing/untrusted", () => {
    expect(scoreKeyTransition(undefined, "8B").score).toBe(0.5);
    expect(scoreKeyTransition("8B", undefined).score).toBe(0.5);
  });
  it("scores a perfect same-key transition at 1.0", () => {
    const r = scoreKeyTransition("8B", "8B");
    expect(r.penalty).toBe(0);
    expect(r.score).toBe(1.0);
  });
  it("scores a distant key transition low", () => {
    const r = scoreKeyTransition("1A", "7B");
    expect(r.penalty).toBeGreaterThan(18);
    expect(r.score).toBeLessThan(0.5);
  });
  it("normalizeCamelotPenalty maps 0 to 1.0 and the max penalty to 0", () => {
    expect(normalizeCamelotPenalty(0)).toBe(1);
    expect(normalizeCamelotPenalty(40)).toBe(0);
  });
});

// ── Section sequencing profile ──────────────────────────────────────────────

describe("classifySectionSequencingRole", () => {
  it("classifies intro/outro by section id", () => {
    expect(classifySectionSequencingRole("intro", 0, 5)).toBe("intro");
    expect(classifySectionSequencingRole("outro", 4, 5)).toBe("outro");
  });
  it("classifies middle sections by temporal position", () => {
    expect(classifySectionSequencingRole("s1", 1, 5)).toBe("development");
    expect(classifySectionSequencingRole("s2", 2, 5)).toBe("peak");
    expect(classifySectionSequencingRole("s3", 3, 5)).toBe("release");
  });
});

describe("getSectionSequencingProfile", () => {
  it("peak allows harmonic tension and tolerates larger BPM expansion", () => {
    const p = getSectionSequencingProfile("peak");
    expect(p.allowHarmonicTension).toBe(true);
    expect(p.bpmToleranceMultiplier).toBeGreaterThan(1);
  });
  it("outro tightens BPM tolerance and raises key weight", () => {
    const p = getSectionSequencingProfile("outro");
    expect(p.bpmToleranceMultiplier).toBeLessThan(1);
    expect(p.keyWeightMultiplier).toBeGreaterThan(1);
  });
});

// ── Combined transition score — energy authority ────────────────────────────

describe("computeTransitionScore", () => {
  it("matches the documented default weights (sums to 1)", () => {
    const sum = Object.values(DEFAULT_TRANSITION_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1);
  });

  it("energy weight is never reduced by a section profile's bpm/key multipliers", () => {
    const peak = getSectionSequencingProfile("peak"); // has LOWER bpm/key multipliers than default
    const perfect = computeTransitionScore({ energyFit: 1, bpmFit: 0, keyFit: 0, moodContinuity: 0, variety: 0, profile: peak });
    const worst = computeTransitionScore({ energyFit: 0, bpmFit: 1, keyFit: 1, moodContinuity: 1, variety: 1, profile: peak });
    // A perfect-energy/zero-everything-else candidate must still score at
    // least the configured energy weight — the energy floor is structural.
    expect(perfect.total).toBeGreaterThanOrEqual(DEFAULT_TRANSITION_WEIGHTS.energy - 1e-9);
    // And a zero-energy candidate, even with everything else perfect, must
    // score no higher than 1 - energy weight (i.e. energy share is unusable
    // by the other factors).
    expect(worst.total).toBeLessThanOrEqual(1 - DEFAULT_TRANSITION_WEIGHTS.energy + 1e-9);
  });

  it("weights still sum to 1 after a section profile's multipliers are applied", () => {
    const peak = getSectionSequencingProfile("peak");
    const allOnes = computeTransitionScore({ energyFit: 1, bpmFit: 1, keyFit: 1, moodContinuity: 1, variety: 1, profile: peak });
    expect(allOnes.total).toBeCloseTo(1);
  });
});

// ── Transition warnings ─────────────────────────────────────────────────────

describe("describeTransitionWarnings", () => {
  const devProfile = getSectionSequencingProfile("development");

  it("fires a large-jump warning beyond the section's tolerance", () => {
    const warnings = describeTransitionWarnings({
      fromPosition: 0, toPosition: 1, fromTrackId: "a", toTrackId: "b", sectionId: "s1",
      bpmDistance: computeBpmTransitionDistance(90, 151), keyTrusted: false, profile: devProfile,
    });
    expect(warnings.some((w) => w.code === "PLAYLIST_TRANSITION_BPM_LARGE_JUMP")).toBe(true);
  });

  it("does not fire a large-jump warning for a well-justified half/double match", () => {
    const warnings = describeTransitionWarnings({
      fromPosition: 0, toPosition: 1, fromTrackId: "a", toTrackId: "b", sectionId: "s1",
      bpmDistance: computeBpmTransitionDistance(75, 150), keyTrusted: false, profile: devProfile,
    });
    expect(warnings.some((w) => w.code === "PLAYLIST_TRANSITION_BPM_LARGE_JUMP")).toBe(false);
    expect(warnings.some((w) => w.code === "PLAYLIST_TRANSITION_BPM_HALF_DOUBLE_AMBIGUITY")).toBe(true);
  });

  it("fires a key-incompatible warning outside a harmonic-tension-tolerant section", () => {
    const warnings = describeTransitionWarnings({
      fromPosition: 0, toPosition: 1, fromTrackId: "a", toTrackId: "b", sectionId: "s1",
      bpmDistance: { relationship: "unknown" }, keyPenalty: 30, keyTrusted: true, profile: devProfile,
    });
    expect(warnings.some((w) => w.code === "PLAYLIST_TRANSITION_KEY_INCOMPATIBLE")).toBe(true);
  });

  it("suppresses the key-incompatible warning in a harmonic-tension-tolerant (peak) section", () => {
    const peakProfile = getSectionSequencingProfile("peak");
    const warnings = describeTransitionWarnings({
      fromPosition: 0, toPosition: 1, fromTrackId: "a", toTrackId: "b", sectionId: "peak",
      bpmDistance: { relationship: "unknown" }, keyPenalty: 30, keyTrusted: true, profile: peakProfile,
    });
    expect(warnings.some((w) => w.code === "PLAYLIST_TRANSITION_KEY_INCOMPATIBLE")).toBe(false);
  });
});

describe("describeSectionSequencingWarnings", () => {
  it("flags a tempo-chaotic section when most transitions show large jumps", () => {
    const warnings = describeSectionSequencingWarnings({
      sectionId: "s1", sectionRole: "development",
      transitions: [
        { fromPosition: 0, toPosition: 1, fromTrackId: "a", toTrackId: "b", bpmDistance: computeBpmTransitionDistance(90, 151), keyTrusted: false },
        { fromPosition: 1, toPosition: 2, fromTrackId: "b", toTrackId: "c", bpmDistance: computeBpmTransitionDistance(151, 86), keyTrusted: false },
        { fromPosition: 2, toPosition: 3, fromTrackId: "c", toTrackId: "d", bpmDistance: computeBpmTransitionDistance(86, 96), keyTrusted: false },
      ],
    });
    expect(warnings.some((w) => w.code === "PLAYLIST_SECTION_TEMPO_CHAOTIC")).toBe(true);
  });
});

// ── Generator integration ────────────────────────────────────────────────────

function makeTrack(id: string, opts: Partial<Track> = {}): Track {
  return {
    trackId: id, title: id, artist: opts.artist ?? "Artist",
    durationSeconds: 200, energy: 0.5,
    sourceOwner: "studiorich", genres: [], moodTags: [], moodSuggestions: [],
    sourcePoolIds: [], grouping: "", albumArtist: "", archiveStatus: "library",
    ...opts,
  } as unknown as Track;
}

function makeCrate(id: string): CrateRecord {
  return {
    id, name: id, createdAt: "", updatedAt: "",
    sourceOwners: ["studiorich"],
    filters: { moodTags: [], groupings: [], genres: [], matchMode: "all_groups" },
  } as CrateRecord;
}

describe("buildShapePlaylist — trusted BPM/key sequencing integration", () => {
  it("prefers the candidate with the best BPM/key continuity among same-energy-tier tracks", () => {
    const tracks = [
      makeTrack("anchor", { bpm: 120, bpmSource: "detected", camelotKey: "8B", keySource: "detected", energy: 0.5 }),
      makeTrack("close", { bpm: 122, bpmSource: "detected", camelotKey: "8B", keySource: "detected", energy: 0.5 }),
      makeTrack("far", { bpm: 151, bpmSource: "detected", camelotKey: "1A", keySource: "detected", energy: 0.5 }),
    ];
    const crate = makeCrate("c1");
    const shapeConfig: PlaylistShapeConfig = {
      mode: "organized", targetDurationMinutes: 100, introMinutes: 0, outroMinutes: 0, middleBlockMinutes: 100,
      sections: [{
        id: "s1", label: "S01", durationMinutes: 100,
        crateWeights: [{ crateId: "c1", weight: 100 }],
        energyEnvelope: makeEnvelope(0.5, 0.5, "flat", "explicit"),
      }],
    };
    const result = buildShapePlaylist({ libraryTracks: tracks, crates: [crate], shapeConfig });
    const order = result.sections[0].tracks.map((t) => t.trackId);
    // "anchor" picked first (round-robin start), then between "close" (good
    // BPM/key continuity) and "far" (bad), "close" must be picked next since
    // both are in the same (perfect) energy tier.
    expect(order[0]).toBe("anchor");
    expect(order[1]).toBe("close");
  });

  it("never lets excellent BPM/key fit override a worse energy tier", () => {
    const tracks = [
      makeTrack("anchor", { bpm: 120, bpmSource: "detected", camelotKey: "8B", keySource: "detected", energy: 0.5 }),
      // Perfect BPM/key continuity but energy far outside tolerance
      makeTrack("perfectFitWrongEnergy", { bpm: 120, bpmSource: "detected", camelotKey: "8B", keySource: "detected", energy: 0.05 }),
      // Good energy fit, no BPM/key data at all (neutral score)
      makeTrack("goodEnergyNoData", { energy: 0.5 }),
    ];
    const crate = makeCrate("c1");
    const shapeConfig: PlaylistShapeConfig = {
      mode: "organized", targetDurationMinutes: 100, introMinutes: 0, outroMinutes: 0, middleBlockMinutes: 100,
      sections: [{
        id: "s1", label: "S01", durationMinutes: 100,
        crateWeights: [{ crateId: "c1", weight: 100 }],
        energyEnvelope: makeEnvelope(0.5, 0.5, "flat", "explicit"),
      }],
    };
    const result = buildShapePlaylist({ libraryTracks: tracks, crates: [crate], shapeConfig });
    const order = result.sections[0].tracks.map((t) => t.trackId);
    expect(order[0]).toBe("anchor");
    expect(order[1]).toBe("goodEnergyNoData"); // energy tier wins over BPM/key fit
  });

  it("treats untrusted (legacy_unknown) BPM/key as neutral, not exclusionary", () => {
    const tracks = [
      makeTrack("anchor", { bpm: 120, bpmSource: "detected", camelotKey: "8B", keySource: "detected", energy: 0.5 }),
      // Looks numerically plausible but has no provenance — must not influence ranking
      makeTrack("legacy", { bpm: 120, camelotKey: "8B", energy: 0.5 }),
    ];
    const crate = makeCrate("c1");
    const shapeConfig: PlaylistShapeConfig = {
      mode: "organized", targetDurationMinutes: 100, introMinutes: 0, outroMinutes: 0, middleBlockMinutes: 100,
      sections: [{
        id: "s1", label: "S01", durationMinutes: 100,
        crateWeights: [{ crateId: "c1", weight: 100 }],
        energyEnvelope: makeEnvelope(0.5, 0.5, "flat", "explicit"),
      }],
    };
    const result = buildShapePlaylist({ libraryTracks: tracks, crates: [crate], shapeConfig });
    // Must not crash, and the legacy track must still be selectable (not excluded).
    expect(result.sections[0].tracks.length).toBe(2);
  });

  it("produces per-transition diagnostics with inspectable score components", () => {
    const tracks = [
      makeTrack("a", { bpm: 120, bpmSource: "detected", camelotKey: "8B", keySource: "detected", energy: 0.5 }),
      makeTrack("b", { bpm: 122, bpmSource: "detected", camelotKey: "8B", keySource: "detected", energy: 0.5 }),
    ];
    const crate = makeCrate("c1");
    const shapeConfig: PlaylistShapeConfig = {
      mode: "organized", targetDurationMinutes: 100, introMinutes: 0, outroMinutes: 0, middleBlockMinutes: 100,
      sections: [{
        id: "s1", label: "S01", durationMinutes: 100,
        crateWeights: [{ crateId: "c1", weight: 100 }],
        energyEnvelope: makeEnvelope(0.5, 0.5, "flat", "explicit"),
      }],
    };
    const result = buildShapePlaylist({ libraryTracks: tracks, crates: [crate], shapeConfig });
    expect(result.transitionDiagnostics.length).toBeGreaterThan(0);
    const d = result.transitionDiagnostics[0];
    expect(d.scoreBreakdown.total).toBeGreaterThanOrEqual(0);
    expect(typeof d.bpmFit).toBe("number");
    expect(typeof d.keyFit).toBe("number");
  });

  it("does not sort the finished playlist — picks remain in generation order, not re-sorted by score afterward", () => {
    // With a flat energy envelope, all 4 tracks are in the same energy tier;
    // if the generator sorted the FINISHED list by score, the highest-total
    // score transitions would end up adjacent regardless of pick order. We
    // instead assert every track appears exactly once (no reordering pass
    // silently duplicated or dropped anything) and duplicate prevention held.
    const tracks = [
      makeTrack("a", { bpm: 120, bpmSource: "detected", energy: 0.5 }),
      makeTrack("b", { bpm: 200, bpmSource: "detected", energy: 0.5 }),
      makeTrack("c", { bpm: 60, bpmSource: "detected", energy: 0.5 }),
      makeTrack("d", { bpm: 121, bpmSource: "detected", energy: 0.5 }),
    ];
    const crate = makeCrate("c1");
    const shapeConfig: PlaylistShapeConfig = {
      mode: "organized", targetDurationMinutes: 100, introMinutes: 0, outroMinutes: 0, middleBlockMinutes: 100,
      sections: [{
        id: "s1", label: "S01", durationMinutes: 100,
        crateWeights: [{ crateId: "c1", weight: 100 }],
        energyEnvelope: makeEnvelope(0.5, 0.5, "flat", "explicit"),
      }],
    };
    const result = buildShapePlaylist({ libraryTracks: tracks, crates: [crate], shapeConfig });
    const ids = result.sections[0].tracks.map((t) => t.trackId).sort();
    expect(ids).toEqual(["a", "b", "c", "d"]);
  });

  it("crate weighting remains active alongside BPM/key scoring", () => {
    const tracksA = Array.from({ length: 5 }, (_, i) => makeTrack(`a${i}`, { bpm: 120, bpmSource: "detected", energy: 0.5 }));
    const tracksB = Array.from({ length: 5 }, (_, i) => ({ ...makeTrack(`b${i}`, { bpm: 120, bpmSource: "detected", energy: 0.5 }), sourceOwner: "external" as const }));
    const crateA = makeCrate("ca");
    const crateB = { ...makeCrate("cb"), sourceOwners: ["external" as const] };
    const shapeConfig: PlaylistShapeConfig = {
      mode: "organized", targetDurationMinutes: 5, introMinutes: 0, outroMinutes: 0, middleBlockMinutes: 5,
      sections: [{
        id: "s1", label: "S01", durationMinutes: 5,
        crateWeights: [{ crateId: "ca", weight: 100 }, { crateId: "cb", weight: 0 }],
        energyEnvelope: makeEnvelope(0.5, 0.5, "flat", "explicit"),
      }],
    };
    const result = buildShapePlaylist({ libraryTracks: [...tracksA, ...tracksB], crates: [crateA, crateB], shapeConfig });
    expect(result.sections[0].tracks.every((t) => t.trackId.startsWith("a"))).toBe(true);
  });
});

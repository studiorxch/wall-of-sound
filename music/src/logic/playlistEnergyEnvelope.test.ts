import { describe, it, expect } from "vitest";
import {
  inferEnergyShape,
  normalizeEnergyEnvelope,
  getEnergyTargetAtPosition,
  getEnergyEnvelopePreview,
  clampEnergyValue,
  makeEnvelope,
  energyFromDisplay,
  energyToDisplay,
  DEFAULT_INTRO_ENVELOPE,
  DEFAULT_MIDDLE_ENVELOPE,
  DEFAULT_PEAK_ENVELOPE,
  DEFAULT_OUTRO_ENVELOPE,
  ENERGY_MIN,
  ENERGY_MAX,
  sampleEnergyCurvePoints,
  getEnergyCurveBounds,
} from "./playlistEnergyEnvelope";
import { buildShapePlaylist } from "./playlistShapeBuilder";
import type { PlaylistShapeConfig } from "../data/playlistShapeTypes";
import type { Track } from "../data/trackTypes";
import type { CrateRecord } from "../data/crateTypes";

// ── Inference (spec §"Required Tests" / Inference) ──────────────────────────
// Values below use the app's actual 0–1 scale; the spec's example "1→1",
// "1→4", "8→3" translate directly since inference only cares about relative
// order, not absolute scale.

describe("inferEnergyShape", () => {
  it("returns flat when start === end", () => {
    expect(inferEnergyShape(0.5, 0.5)).toBe("flat");
  });
  it("returns rise when end > start", () => {
    expect(inferEnergyShape(0.1, 0.4)).toBe("rise");
  });
  it("returns fall when end < start", () => {
    expect(inferEnergyShape(0.8, 0.3)).toBe("fall");
  });
});

// ── Normalization ────────────────────────────────────────────────────────────

describe("normalizeEnergyEnvelope", () => {
  const fallback = makeEnvelope(0.4, 0.6, "rise", "inferred");

  it("clamps values below the minimum", () => {
    const result = normalizeEnergyEnvelope({ start: -5, end: 0.5 }, fallback);
    expect(result.start).toBe(ENERGY_MIN);
  });

  it("clamps values above the maximum", () => {
    const result = normalizeEnergyEnvelope({ start: 0.5, end: 99 }, fallback);
    expect(result.end).toBe(ENERGY_MAX);
  });

  it("does not quantize fractional values (0712_MUSIC_Playlist_Energy_Scale_Mapping_Fix — storage must stay continuous)", () => {
    const result = normalizeEnergyEnvelope({ start: 0.234, end: 0.567 }, fallback);
    expect(result.start).toBeCloseTo(0.234);
    expect(result.end).toBeCloseTo(0.567);
  });

  it("falls back safely on an unsupported shape string", () => {
    const result = normalizeEnergyEnvelope({ start: 0.2, end: 0.2, shape: "explode" as never, shapeSource: "explicit" }, fallback);
    expect(result.shape).toBe("flat");
    expect(result.shapeSource).toBe("inferred");
  });

  it("preserves an explicit arc through normalization", () => {
    const result = normalizeEnergyEnvelope({ start: 0.3, end: 0.3, shape: "arc", shapeSource: "explicit" }, fallback);
    expect(result.shape).toBe("arc");
    expect(result.shapeSource).toBe("explicit");
  });

  it("preserves an explicit valley through normalization", () => {
    const result = normalizeEnergyEnvelope({ start: 0.7, end: 0.7, shape: "valley", shapeSource: "explicit" }, fallback);
    expect(result.shape).toBe("valley");
    expect(result.shapeSource).toBe("explicit");
  });

  it("does not trust an arc/valley claim without explicit provenance", () => {
    const result = normalizeEnergyEnvelope({ start: 0.2, end: 0.6, shape: "arc", shapeSource: "inferred" }, fallback);
    expect(result.shape).toBe("rise"); // arc is impossible to infer — falls back to a real inferred shape
    expect(result.shapeSource).toBe("inferred");
  });

  it("always returns a complete valid object even with no input", () => {
    const result = normalizeEnergyEnvelope(undefined, fallback);
    expect(result).toEqual(fallback);
  });

  it("preserves fractional normalized values during normalization (0712_MUSIC_Playlist_Energy_Scale_Mapping_Fix)", () => {
    const normalized = normalizeEnergyEnvelope(
      { start: 3 / 9, end: 5 / 9, shape: "rise", shapeSource: "inferred" },
      DEFAULT_MIDDLE_ENVELOPE,
    );
    expect(normalized.start).toBeCloseTo(3 / 9);
    expect(normalized.end).toBeCloseTo(5 / 9);
  });

  it("does not round normalized values to whole numbers", () => {
    const normalized = normalizeEnergyEnvelope({ start: 0.123456, end: 0.654321 }, fallback);
    expect(normalized.start).toBeCloseTo(0.123456);
    expect(normalized.end).toBeCloseTo(0.654321);
  });
});

// ── Display-scale conversion (0712_MUSIC_Playlist_Energy_Scale_Mapping_Fix) ──
// Internal storage stays 0–1 always; these two functions are the ONLY
// place a 1–10 display scale is allowed to exist.

describe("energy display conversion", () => {
  it("round-trips every display value from 1 through 10", () => {
    for (let display = 1; display <= 10; display += 1) {
      expect(energyToDisplay(energyFromDisplay(display))).toBe(display);
    }
  });

  it("maps the minimum and maximum exactly", () => {
    expect(energyFromDisplay(1)).toBe(0);
    expect(energyFromDisplay(10)).toBe(1);
    expect(energyToDisplay(0)).toBe(1);
    expect(energyToDisplay(1)).toBe(10);
  });
});

describe("default section envelopes display correctly (§'Required Fix')", () => {
  it("Intro displays as 1 → 4", () => {
    expect(energyToDisplay(DEFAULT_INTRO_ENVELOPE.start)).toBe(1);
    expect(energyToDisplay(DEFAULT_INTRO_ENVELOPE.end)).toBe(4);
  });
  it("Middle displays as 4 → 6", () => {
    expect(energyToDisplay(DEFAULT_MIDDLE_ENVELOPE.start)).toBe(4);
    expect(energyToDisplay(DEFAULT_MIDDLE_ENVELOPE.end)).toBe(6);
  });
  it("Peak displays as 7 → 9", () => {
    expect(energyToDisplay(DEFAULT_PEAK_ENVELOPE.start)).toBe(7);
    expect(energyToDisplay(DEFAULT_PEAK_ENVELOPE.end)).toBe(9);
  });
  it("Outro displays as 3 → 1", () => {
    expect(energyToDisplay(DEFAULT_OUTRO_ENVELOPE.start)).toBe(3);
    expect(energyToDisplay(DEFAULT_OUTRO_ENVELOPE.end)).toBe(1);
  });
});

// ── Curve output ─────────────────────────────────────────────────────────────

describe("getEnergyEnvelopePreview / getEnergyTargetAtPosition", () => {
  it("first sample equals start", () => {
    const env = makeEnvelope(0.2, 0.8, "rise", "explicit");
    const samples = getEnergyEnvelopePreview(env, 10);
    expect(samples[0]).toBeCloseTo(0.2, 5);
  });

  it("last sample equals end", () => {
    const env = makeEnvelope(0.2, 0.8, "rise", "explicit");
    const samples = getEnergyEnvelopePreview(env, 10);
    expect(samples[samples.length - 1]).toBeCloseTo(0.8, 5);
  });

  it("every sample remains within the valid range", () => {
    for (const env of [
      makeEnvelope(0.1, 0.9, "arc", "explicit"),
      makeEnvelope(0.9, 0.1, "valley", "explicit"),
      makeEnvelope(0, 1, "rise", "explicit"),
    ]) {
      for (const s of getEnergyEnvelopePreview(env, 20)) {
        expect(s).toBeGreaterThanOrEqual(ENERGY_MIN - 1e-9);
        expect(s).toBeLessThanOrEqual(ENERGY_MAX + 1e-9);
      }
    }
  });

  it("rise is non-decreasing", () => {
    const env = makeEnvelope(0.1, 0.9, "rise", "explicit");
    const samples = getEnergyEnvelopePreview(env, 20);
    for (let i = 1; i < samples.length; i++) expect(samples[i]).toBeGreaterThanOrEqual(samples[i - 1] - 1e-9);
  });

  it("fall is non-increasing", () => {
    const env = makeEnvelope(0.9, 0.1, "fall", "explicit");
    const samples = getEnergyEnvelopePreview(env, 20);
    for (let i = 1; i < samples.length; i++) expect(samples[i]).toBeLessThanOrEqual(samples[i - 1] + 1e-9);
  });

  it("flat remains constant when start equals end", () => {
    const env = makeEnvelope(0.5, 0.5, "flat", "explicit");
    const samples = getEnergyEnvelopePreview(env, 10);
    for (const s of samples) expect(s).toBeCloseTo(0.5, 5);
  });

  it("arc has an interior peak above its linear baseline when headroom exists", () => {
    const env = makeEnvelope(0.2, 0.2, "arc", "explicit");
    const mid = getEnergyTargetAtPosition(env, 0.5);
    const baseline = 0.2; // linear interpolation of a flat 0.2→0.2 line
    expect(mid).toBeGreaterThan(baseline);
  });

  it("valley has an interior dip below its linear baseline when floor space exists", () => {
    const env = makeEnvelope(0.8, 0.8, "valley", "explicit");
    const mid = getEnergyTargetAtPosition(env, 0.5);
    const baseline = 0.8;
    expect(mid).toBeLessThan(baseline);
  });

  it("clampEnergyValue never returns a value outside range", () => {
    expect(clampEnergyValue(-3)).toBe(ENERGY_MIN);
    expect(clampEnergyValue(30)).toBe(ENERGY_MAX);
  });
});

// ── Persistence-adjacent (envelope survives object copies) ──────────────────

describe("envelope persistence semantics", () => {
  it("a shallow-duplicated section preserves its envelope", () => {
    const section = { id: "s1", label: "S01", durationMinutes: 20, crateWeights: [], energyEnvelope: makeEnvelope(0.3, 0.7, "rise", "explicit") };
    const duplicate = { ...section, id: "s1_copy" };
    expect(duplicate.energyEnvelope).toEqual(section.energyEnvelope);
  });

  it("normalizeEnergyEnvelope migrates a legacy section missing an envelope without data loss on other fields", () => {
    const legacySection = { id: "s1", label: "S01", durationMinutes: 20, crateWeights: [] } as unknown as { energyEnvelope?: never };
    const migrated = normalizeEnergyEnvelope(legacySection.energyEnvelope, makeEnvelope(0.4, 0.6, "rise", "inferred"));
    expect(migrated.start).toBe(0.4);
    expect(migrated.end).toBe(0.6);
    expect(migrated.shape).toBe("rise");
  });
});

// ── Generator integration ────────────────────────────────────────────────────

function makeTrack(id: string, energy: number | undefined, durationSeconds = 200): Track {
  return {
    trackId: id,
    title: id,
    artist: "Test Artist",
    durationSeconds,
    energy: energy as number,
    sourceOwner: "studiorich",
    genres: [],
    moodTags: [],
    moodSuggestions: [],
    sourcePoolIds: [],
    grouping: "",
    albumArtist: "",
    archiveStatus: "library",
  } as unknown as Track;
}

function makeCrate(id: string): CrateRecord {
  return {
    id, name: id, createdAt: "", updatedAt: "",
    sourceOwners: ["studiorich"],
    filters: { moodTags: [], groupings: [], genres: [], matchMode: "all_groups" },
  } as CrateRecord;
}

// ── SectionEnergyMeter curve rendering geometry ──────────────────────────────
// "Fix SectionEnergyMeter curve rendering" — a point's horizontal position on
// the shared energy axis must be its OWN sampled value, never its sample
// index, or a Fall envelope (start > end) renders as if it were a Rise.
// These tests exercise the exact geometry helpers the meter renders from
// (sampleEnergyCurvePoints / getEnergyCurveBounds), independent of React.

describe("SectionEnergyMeter curve geometry — Rise 4→6", () => {
  const env = makeEnvelope(energyFromDisplay(4), energyFromDisplay(6), "rise", "explicit");
  const points = sampleEnergyCurvePoints(env, 12);

  it("travels left to right — value is non-decreasing as p increases", () => {
    for (let i = 1; i < points.length; i++) {
      expect(points[i].value).toBeGreaterThanOrEqual(points[i - 1].value - 1e-9);
    }
  });
  it("first point is Start, last point is End", () => {
    expect(points[0].value).toBeCloseTo(env.start);
    expect(points[points.length - 1].value).toBeCloseTo(env.end);
  });
});

describe("SectionEnergyMeter curve geometry — Fall 6→4", () => {
  const env = makeEnvelope(energyFromDisplay(6), energyFromDisplay(4), "fall", "explicit");
  const points = sampleEnergyCurvePoints(env, 12);

  it("begins at the right (Start, higher value) and travels toward the left (End, lower value)", () => {
    expect(points[0].value).toBeCloseTo(env.start);
    expect(points[points.length - 1].value).toBeCloseTo(env.end);
    expect(points[0].value).toBeGreaterThan(points[points.length - 1].value);
  });
  it("value is non-increasing as p increases (chronological order runs right→left on the axis)", () => {
    for (let i = 1; i < points.length; i++) {
      expect(points[i].value).toBeLessThanOrEqual(points[i - 1].value + 1e-9);
    }
  });
  it("does NOT mirror a Rise — the point sequence's value strictly decreases overall", () => {
    expect(points[0].value).toBeGreaterThan(points[Math.floor(points.length / 2)].value);
  });
});

describe("SectionEnergyMeter curve geometry — Arc 2→7", () => {
  const env = makeEnvelope(energyFromDisplay(2), energyFromDisplay(7), "arc", "explicit");
  const points = sampleEnergyCurvePoints(env, 12);
  const bounds = getEnergyCurveBounds(env, 12);

  it("shows a visible internal peak above the Start→End baseline", () => {
    const baselineMax = Math.max(env.start, env.end);
    expect(bounds.max).toBeGreaterThan(baselineMax);
    // some interior sample must exceed both endpoints
    const interior = points.slice(1, -1);
    expect(Math.max(...interior.map((pt) => pt.value))).toBeGreaterThan(baselineMax);
  });
});

describe("SectionEnergyMeter curve geometry — Valley 7→4", () => {
  const env = makeEnvelope(energyFromDisplay(7), energyFromDisplay(4), "valley", "explicit");
  const points = sampleEnergyCurvePoints(env, 12);
  const bounds = getEnergyCurveBounds(env, 12);

  it("shows a visible internal dip below the Start→End baseline", () => {
    const baselineMin = Math.min(env.start, env.end);
    expect(bounds.min).toBeLessThan(baselineMin);
    const interior = points.slice(1, -1);
    expect(Math.min(...interior.map((pt) => pt.value))).toBeLessThan(baselineMin);
  });
});

describe("SectionEnergyMeter curve geometry — Flat 5→5", () => {
  const env = makeEnvelope(energyFromDisplay(5), energyFromDisplay(5), "flat", "explicit");
  const points = sampleEnergyCurvePoints(env, 12);

  it("remains level — every sampled value stays at Start/End", () => {
    for (const pt of points) expect(pt.value).toBeCloseTo(env.start, 5);
  });
});

describe("buildShapePlaylist — energy-fit generator integration", () => {
  it("prefers closer-energy candidates for a rise section", () => {
    const tracks = [
      makeTrack("low", 0.1),
      makeTrack("high", 0.9),
      makeTrack("mid", 0.5),
    ];
    const crate = makeCrate("c1");
    const shapeConfig: PlaylistShapeConfig = {
      mode: "organized",
      targetDurationMinutes: 10,
      introMinutes: 0,
      outroMinutes: 0,
      middleBlockMinutes: 10,
      sections: [{
        id: "s1", label: "S01", durationMinutes: 10,
        crateWeights: [{ crateId: "c1", weight: 100 }],
        energyEnvelope: makeEnvelope(0.1, 0.1, "flat", "explicit"),
      }],
    };
    const result = buildShapePlaylist({ libraryTracks: tracks, crates: [crate], shapeConfig });
    // Target energy near 0.1 the whole section (flat) — the low-energy track
    // should be picked first, ahead of tracks with a worse energy fit.
    expect(result.sections[0].tracks[0].trackId).toBe("low");
  });

  it("never fabricates energy for tracks missing energy metadata", () => {
    const tracks = [makeTrack("known", 0.5), makeTrack("unknown", undefined)];
    const crate = makeCrate("c1");
    const shapeConfig: PlaylistShapeConfig = {
      mode: "organized",
      targetDurationMinutes: 10,
      introMinutes: 0,
      outroMinutes: 0,
      middleBlockMinutes: 10,
      sections: [{
        id: "s1", label: "S01", durationMinutes: 10,
        crateWeights: [{ crateId: "c1", weight: 100 }],
        energyEnvelope: makeEnvelope(0.5, 0.5, "flat", "explicit"),
      }],
    };
    const result = buildShapePlaylist({ libraryTracks: tracks, crates: [crate], shapeConfig });
    const picked = result.sections[0].tracks;
    const unknownTrack = picked.find((t) => t.trackId === "unknown");
    expect(unknownTrack?.energy).toBeUndefined(); // never assigned a fabricated value
  });

  it("crate weights remain active alongside energy-fit ranking", () => {
    const tracksA = Array.from({ length: 5 }, (_, i) => makeTrack(`a${i}`, 0.5, 100));
    const tracksB = Array.from({ length: 5 }, (_, i) => ({ ...makeTrack(`b${i}`, 0.5, 100), sourceOwner: "external" as const }));
    const crateA = makeCrate("ca");
    const crateB = { ...makeCrate("cb"), sourceOwners: ["external" as const] };
    const shapeConfig: PlaylistShapeConfig = {
      mode: "organized",
      targetDurationMinutes: 5, // ~3 picks at 100s each
      introMinutes: 0, outroMinutes: 0, middleBlockMinutes: 5,
      sections: [{
        id: "s1", label: "S01", durationMinutes: 5,
        crateWeights: [{ crateId: "ca", weight: 100 }, { crateId: "cb", weight: 0 }],
        energyEnvelope: makeEnvelope(0.5, 0.5, "flat", "explicit"),
      }],
    };
    const result = buildShapePlaylist({ libraryTracks: [...tracksA, ...tracksB], crates: [crateA, crateB], shapeConfig });
    // Zero-weight crate must contribute nothing, regardless of energy fit.
    expect(result.sections[0].tracks.every((t) => t.trackId.startsWith("a"))).toBe(true);
  });

  it("target position changes across rise, fall, arc, and valley sections", () => {
    const riseStart = getEnergyTargetAtPosition(makeEnvelope(0.1, 0.9, "rise", "explicit"), 0);
    const riseEnd = getEnergyTargetAtPosition(makeEnvelope(0.1, 0.9, "rise", "explicit"), 1);
    expect(riseEnd).toBeGreaterThan(riseStart);

    const fallStart = getEnergyTargetAtPosition(makeEnvelope(0.9, 0.1, "fall", "explicit"), 0);
    const fallEnd = getEnergyTargetAtPosition(makeEnvelope(0.9, 0.1, "fall", "explicit"), 1);
    expect(fallEnd).toBeLessThan(fallStart);

    const arcMid = getEnergyTargetAtPosition(makeEnvelope(0.3, 0.3, "arc", "explicit"), 0.5);
    expect(arcMid).toBeGreaterThan(0.3);

    const valleyMid = getEnergyTargetAtPosition(makeEnvelope(0.7, 0.7, "valley", "explicit"), 0.5);
    expect(valleyMid).toBeLessThan(0.7);
  });
});

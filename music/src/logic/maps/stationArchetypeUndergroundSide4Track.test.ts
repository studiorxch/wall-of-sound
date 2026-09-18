import { describe, it, expect } from "vitest";
import {
  deriveUndergroundSide4TrackGeometry,
  validateUndergroundSide4TrackParameters,
  validateTrainConsistClearance,
  getUsablePlatformLengthM,
  isPlatformServingRole,
} from "./stationArchetypeUndergroundSide4Track";
import {
  DEFAULT_UG_SIDE_4TRACK_PARAMETERS,
  UG_SIDE_4TRACK_ARCHETYPE_ID,
  type UndergroundSide4TrackParameters,
} from "../../data/stationArchetypeTypes";
import type { TrackRole } from "../../data/stationGeometryTypes";
import {
  deriveUndergroundSide2TrackGeometry,
  validateUndergroundSide2TrackParameters,
} from "./stationArchetypeUndergroundSide2Track";
import { DEFAULT_UG_SIDE_2TRACK_PARAMETERS, UG_SIDE_2TRACK_ARCHETYPE_ID } from "../../data/stationArchetypeTypes";

function params(overrides: Partial<UndergroundSide4TrackParameters> = {}): UndergroundSide4TrackParameters {
  return { ...DEFAULT_UG_SIDE_4TRACK_PARAMETERS, ...overrides };
}

describe("archetype identity", () => {
  it("is deterministic and distinct from UG_SIDE_2TRACK", () => {
    expect(UG_SIDE_4TRACK_ARCHETYPE_ID).toBe("stationArchetype:UG_SIDE_4TRACK");
    expect(UG_SIDE_4TRACK_ARCHETYPE_ID).not.toBe(UG_SIDE_2TRACK_ARCHETYPE_ID);
  });
});

describe("exactly 4 physical tracks with deterministic role ordering", () => {
  it("generates exactly 4 track centerlines, in a fixed, deterministic role order", () => {
    const geometry = deriveUndergroundSide4TrackGeometry(params(), "TEST");
    expect(geometry.trackCenterlines).toHaveLength(4);
    const roles = geometry.trackCenterlines.map((t) => t.role);
    expect(roles).toEqual(["northboundLocal", "northboundExpress", "southboundExpress", "southboundLocal"]);
  });

  it("role ordering is identical across repeated derivations, including with different parameter values", () => {
    const a = deriveUndergroundSide4TrackGeometry(params(), "TEST");
    const b = deriveUndergroundSide4TrackGeometry(params({ expressPairSpacingM: 6, localToExpressSpacingM: 5 }), "TEST");
    expect(a.trackCenterlines.map((t) => t.role)).toEqual(b.trackCenterlines.map((t) => t.role));
  });

  it("every one of the 4 canonical roles is a real, typed TrackRole value — never inferred from an id string", () => {
    const geometry = deriveUndergroundSide4TrackGeometry(params(), "TEST");
    const expectedRoles: TrackRole[] = ["northboundLocal", "northboundExpress", "southboundExpress", "southboundLocal"];
    for (const role of expectedRoles) {
      expect(geometry.trackCenterlines.some((t) => t.role === role)).toBe(true);
    }
  });
});

describe("outer tracks serve platforms; inner tracks do not", () => {
  const geometry = deriveUndergroundSide4TrackGeometry(params(), "TEST");
  const byRole = Object.fromEntries(geometry.trackCenterlines.map((t) => [t.role, t]));

  it("northboundLocal and southboundLocal each have a real, non-null platformId", () => {
    expect(byRole.northboundLocal.platformId).toBe(geometry.platforms[0].id);
    expect(byRole.southboundLocal.platformId).toBe(geometry.platforms[1].id);
  });

  it("northboundExpress and southboundExpress both have platformId === null — bypass, serve no platform", () => {
    expect(byRole.northboundExpress.platformId).toBeNull();
    expect(byRole.southboundExpress.platformId).toBeNull();
  });

  it("isPlatformServingRole correctly classifies all 4 roles", () => {
    expect(isPlatformServingRole("northboundLocal")).toBe(true);
    expect(isPlatformServingRole("southboundLocal")).toBe(true);
    expect(isPlatformServingRole("northboundExpress")).toBe(false);
    expect(isPlatformServingRole("southboundExpress")).toBe(false);
  });

  it("filtering by isPlatformServingRole yields exactly the 2 tracks with a non-null platformId, and no others", () => {
    const platformServing = geometry.trackCenterlines.filter((t) => isPlatformServingRole(t.role!));
    expect(platformServing).toHaveLength(2);
    expect(platformServing.every((t) => t.platformId !== null)).toBe(true);
    const bypass = geometry.trackCenterlines.filter((t) => !isPlatformServingRole(t.role!));
    expect(bypass).toHaveLength(2);
    expect(bypass.every((t) => t.platformId === null)).toBe(true);
  });
});

describe("all four centerlines remain distinct", () => {
  it("every track sits at a distinct Y position — no two centerlines collapse onto each other, across several parameter combinations", () => {
    const combos: Partial<UndergroundSide4TrackParameters>[] = [
      {},
      { expressPairSpacingM: 3, localToExpressSpacingM: 3 },
      { expressPairSpacingM: 8, localToExpressSpacingM: 6 },
    ];
    for (const overrides of combos) {
      const geometry = deriveUndergroundSide4TrackGeometry(params(overrides), "TEST");
      const ys = geometry.trackCenterlines.map((t) => t.localPoints![0].y);
      expect(new Set(ys).size).toBe(4); // all 4 distinct
      // Also strictly ordered north-to-south, matching the physical layout.
      expect(ys[0]).toBeLessThan(ys[1]);
      expect(ys[1]).toBeLessThan(ys[2]);
      expect(ys[2]).toBeLessThan(ys[3]);
    }
  });

  it("every generated record has a distinct id — no duplicates across levels/platforms/tracks/connections", () => {
    const geometry = deriveUndergroundSide4TrackGeometry(params(), "TEST");
    const allIds = [
      ...geometry.levels.map((l) => l.id),
      ...geometry.platforms.map((p) => p.id),
      ...geometry.trackCenterlines.map((t) => t.id),
      ...geometry.connections.map((c) => c.id),
    ];
    expect(new Set(allIds).size).toBe(allIds.length);
  });
});

describe("spacing parameters regenerate deterministically", () => {
  it("expressPairSpacingM controls exactly the gap between the two express tracks, independent of everything else", () => {
    const a = deriveUndergroundSide4TrackGeometry(params({ expressPairSpacingM: 4 }), "TEST");
    const b = deriveUndergroundSide4TrackGeometry(params({ expressPairSpacingM: 10 }), "TEST");
    const gap = (g: typeof a) => {
      const byRole = Object.fromEntries(g.trackCenterlines.map((t) => [t.role, t.localPoints![0].y]));
      return byRole.southboundExpress - byRole.northboundExpress;
    };
    expect(gap(a)).toBeCloseTo(4, 9);
    expect(gap(b)).toBeCloseTo(10, 9);
  });

  it("localToExpressSpacingM controls exactly the gap between each side's local and express track, symmetric on both sides", () => {
    const geometry = deriveUndergroundSide4TrackGeometry(params({ localToExpressSpacingM: 7 }), "TEST");
    const byRole = Object.fromEntries(geometry.trackCenterlines.map((t) => [t.role, t.localPoints![0].y]));
    expect(byRole.northboundExpress - byRole.northboundLocal).toBeCloseTo(7, 9);
    expect(byRole.southboundLocal - byRole.southboundExpress).toBeCloseTo(7, 9);
  });

  it("outerPlatformEdgeToLocalTrackCenterM controls exactly the gap between each platform's inner edge and its own local track", () => {
    const geometry = deriveUndergroundSide4TrackGeometry(params({ outerPlatformEdgeToLocalTrackCenterM: 2.25 }), "TEST");
    const byRole = Object.fromEntries(geometry.trackCenterlines.map((t) => [t.role, t.localPoints![0].y]));
    const northboundInnerEdgeY = Math.max(...geometry.platforms[0].footprint!.map((p) => p.y));
    const southboundInnerEdgeY = Math.min(...geometry.platforms[1].footprint!.map((p) => p.y));
    expect(Math.abs(byRole.northboundLocal - northboundInnerEdgeY)).toBeCloseTo(2.25, 9);
    expect(Math.abs(byRole.southboundLocal - southboundInnerEdgeY)).toBeCloseTo(2.25, 9);
  });

  it("platform length changes propagate identically to the platform footprints and all 4 track centerlines", () => {
    const geometry = deriveUndergroundSide4TrackGeometry(params({ platformLengthM: 240 }), "TEST");
    const xExtent = (pts: { x: number }[]) => Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x));
    expect(xExtent(geometry.platforms[0].footprint!)).toBeCloseTo(240, 9);
    for (const track of geometry.trackCenterlines) {
      expect(xExtent(track.localPoints!)).toBeCloseTo(240, 9);
    }
  });

  it("independently varying platform width only moves that platform's own outer edge, never any track", () => {
    const narrow = deriveUndergroundSide4TrackGeometry(params({ northboundPlatformWidthM: 4 }), "TEST");
    const wide = deriveUndergroundSide4TrackGeometry(params({ northboundPlatformWidthM: 9 }), "TEST");
    expect(wide.trackCenterlines).toEqual(narrow.trackCenterlines); // zero track movement
    expect(wide.platforms[1].footprint).toEqual(narrow.platforms[1].footprint); // southbound untouched
  });
});

describe("train-clearance validation distinguishes platform-serving local tracks from bypass express tracks", () => {
  const geometry = deriveUndergroundSide4TrackGeometry(params(), "TEST");

  it("a platform-serving local track's clearance can be validated against usable platform length", () => {
    const usableLengthM = getUsablePlatformLengthM(params());
    const result = validateTrainConsistClearance({ usablePlatformLengthM: usableLengthM, trainConsistLengthM: 120, stoppingMarginM: 10 });
    expect(result.ok).toBe(true);
  });

  it("an express (bypass) track has no platform to validate against — platformId is null, so no usable-platform-length concept applies to it at all", () => {
    const expressTracks = geometry.trackCenterlines.filter((t) => !isPlatformServingRole(t.role!));
    for (const track of expressTracks) {
      expect(track.platformId).toBeNull();
      // There is no platform whose footprint corresponds to this track — confirms
      // a caller cannot (and must not) derive a usable length for a bypass track
      // the way it can for a local track.
      expect(geometry.platforms.some((p) => p.id === track.platformId)).toBe(false);
    }
  });

  it("a local track's own platformId resolves to a real platform whose footprint the clearance check can be grounded in", () => {
    const localTracks = geometry.trackCenterlines.filter((t) => isPlatformServingRole(t.role!));
    for (const track of localTracks) {
      const platform = geometry.platforms.find((p) => p.id === track.platformId);
      expect(platform).toBeDefined();
      expect(platform!.footprint).toBeDefined();
    }
  });

  it("rejects negative stopping margin and non-positive lengths explicitly, same discipline as UG_SIDE_2TRACK", () => {
    expect(validateTrainConsistClearance({ usablePlatformLengthM: 150, trainConsistLengthM: 120, stoppingMarginM: -1 }).ok).toBe(false);
    expect(validateTrainConsistClearance({ usablePlatformLengthM: 0, trainConsistLengthM: 120, stoppingMarginM: 0 }).ok).toBe(false);
  });
});

describe("validateUndergroundSide4TrackParameters — guard clauses (reject, never silently correct)", () => {
  it("rejects non-positive platform length, widths, and every spacing parameter", () => {
    expect(validateUndergroundSide4TrackParameters(params({ platformLengthM: 0 })).some((i) => i.field === "platformLengthM")).toBe(true);
    expect(validateUndergroundSide4TrackParameters(params({ northboundPlatformWidthM: -1 })).some((i) => i.field === "northboundPlatformWidthM")).toBe(true);
    expect(validateUndergroundSide4TrackParameters(params({ outerPlatformEdgeToLocalTrackCenterM: 0 })).some((i) => i.field === "outerPlatformEdgeToLocalTrackCenterM")).toBe(true);
    expect(validateUndergroundSide4TrackParameters(params({ localToExpressSpacingM: -2 })).some((i) => i.field === "localToExpressSpacingM")).toBe(true);
    expect(validateUndergroundSide4TrackParameters(params({ expressPairSpacingM: 0 })).some((i) => i.field === "expressPairSpacingM")).toBe(true);
  });

  it("rejects a mezzanine at or below the platform's own elevation", () => {
    expect(validateUndergroundSide4TrackParameters(params({ mezzanineElevationM: -10, platformElevationM: -10 })).some((i) => i.field === "mezzanineElevationM")).toBe(true);
  });

  it("accepts the shipped defaults with zero issues", () => {
    expect(validateUndergroundSide4TrackParameters(DEFAULT_UG_SIDE_4TRACK_PARAMETERS)).toEqual([]);
  });

  it("deriveUndergroundSide4TrackGeometry throws with an explicit, field-named message rather than silently correcting", () => {
    expect(() => deriveUndergroundSide4TrackGeometry(params({ expressPairSpacingM: -5 }), "TEST")).toThrow(/expressPairSpacingM/);
  });
});

describe("provenance discipline — every generated value stays heuristic", () => {
  it("marks every generated level/platform/track/connection as heuristic, never authority/reference/authored", () => {
    const geometry = deriveUndergroundSide4TrackGeometry(params(), "TEST");
    const all = [...geometry.levels, ...geometry.platforms, ...geometry.trackCenterlines, ...geometry.connections];
    expect(all.length).toBeGreaterThan(0);
    for (const record of all) {
      expect(record.provenance.source).toBe("heuristic");
      expect(record.provenance.sourceRef).toMatch(/stationArchetype:UG_SIDE_4TRACK/);
    }
  });
});

describe("existing UG_SIDE_2TRACK remains completely unchanged", () => {
  it("UG_SIDE_2TRACK still derives exactly 2 tracks with no role field set, identical to before this checkpoint", () => {
    const geometry = deriveUndergroundSide2TrackGeometry(DEFAULT_UG_SIDE_2TRACK_PARAMETERS, "TEST");
    expect(geometry.trackCenterlines).toHaveLength(2);
    for (const track of geometry.trackCenterlines) {
      expect(track.role).toBeUndefined(); // the new optional field is simply absent, never defaulted to some value
    }
  });

  it("UG_SIDE_2TRACK's own validator and defaults are untouched by the 4-track archetype's own types", () => {
    expect(validateUndergroundSide2TrackParameters(DEFAULT_UG_SIDE_2TRACK_PARAMETERS)).toEqual([]);
  });

  it("UG_SIDE_2TRACK and UG_SIDE_4TRACK are fully independent — deriving one never touches the other's output", () => {
    const before = deriveUndergroundSide2TrackGeometry(DEFAULT_UG_SIDE_2TRACK_PARAMETERS, "TEST");
    deriveUndergroundSide4TrackGeometry(DEFAULT_UG_SIDE_4TRACK_PARAMETERS, "TEST"); // exercise the sibling archetype
    const after = deriveUndergroundSide2TrackGeometry(DEFAULT_UG_SIDE_2TRACK_PARAMETERS, "TEST");
    expect(after).toEqual(before);
  });
});

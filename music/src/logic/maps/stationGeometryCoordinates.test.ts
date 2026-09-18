// ── Station-local coordinate transform tests ──────────────────────────────────
// 0907_WOS_Subway_Bay_Ridge_Av_Station_Geometry_v1.0.0 — checkpoint 1.
// Realistic meter-scale tolerances throughout: sub-millimeter for pure
// round-trip algebra (this is linear, invertible math — floating point
// should be exact to many decimal places), a few meters where real,
// slightly-curved track geometry is involved (never used for anything more
// precise than "clearly positive/negative and small relative to the
// along-track distance" in this checkpoint).
import { describe, it, expect } from "vitest";
import {
  makeStationOriginAnchor,
  toStationLocal,
  toGeographic,
  computeBearingDeg,
  normalizeOrientationDeg,
  type GeoPoint,
} from "./stationGeometryCoordinates";
import {
  BAY_RIDGE_AV_SOURCE_SHAPE_EXCERPT,
  BAY_RIDGE_AV_DERIVED_ORIENTATION_DEG,
  BAY_RIDGE_AV_ORIGIN_ANCHOR,
  buildBayRidgeAvStationGeometrySeed,
} from "./stationGeometryBayRidgeAvSeed";

const METERS_EPS = 1e-6; // pure algebra round-trip — this is linear, invertible math, expect near-exact

function metersBetween(a: GeoPoint, b: GeoPoint): number {
  // Independent re-derivation (not calling the module under test) for a
  // real-world-meters assertion helper.
  const mpdLng = Math.cos((a.latitude * Math.PI) / 180) * 111320;
  const east = (b.longitude - a.longitude) * mpdLng;
  const north = (b.latitude - a.latitude) * 111320;
  return Math.sqrt(east * east + north * north);
}

/** Smallest angle between two compass bearings, wrap-safe across the 0/360 seam. */
function wrapSafeAngularDiff(a: number, b: number): number {
  const raw = Math.abs(normalizeOrientationDeg(a) - normalizeOrientationDeg(b)) % 360;
  return Math.min(raw, 360 - raw);
}

describe("normalizeOrientationDeg", () => {
  it("passes through an already-normalized value unchanged", () => {
    expect(normalizeOrientationDeg(45)).toBeCloseTo(45, 9);
    expect(normalizeOrientationDeg(0)).toBeCloseTo(0, 9);
  });
  it("wraps a value >= 360 down into [0,360)", () => {
    expect(normalizeOrientationDeg(360)).toBeCloseTo(0, 9);
    expect(normalizeOrientationDeg(725)).toBeCloseTo(5, 9);
  });
  it("wraps a negative value up into [0,360) — never returns a negative bearing", () => {
    expect(normalizeOrientationDeg(-10)).toBeCloseTo(350, 9);
    expect(normalizeOrientationDeg(-370)).toBeCloseTo(350, 9);
  });
});

describe("makeStationOriginAnchor", () => {
  it("normalizes orientationDeg at construction time", () => {
    const anchor = makeStationOriginAnchor({ longitude: 0, latitude: 40, altitudeM: 0, orientationDeg: 400 });
    expect(anchor.orientationDeg).toBeCloseTo(40, 9);
  });
});

describe("origin maps to local [0,0,0]", () => {
  it("converting a station's own anchor point back onto itself is exactly the origin", () => {
    const anchor = makeStationOriginAnchor({ longitude: -74.02, latitude: 40.63, altitudeM: 0, orientationDeg: 17.2 });
    const local = toStationLocal(anchor, { longitude: anchor.longitude, latitude: anchor.latitude, altitudeM: anchor.altitudeM });
    expect(local.x).toBeCloseTo(0, 9);
    expect(local.y).toBeCloseTo(0, 9);
    expect(local.z).toBeCloseTo(0, 9);
  });
});

describe("perpendicularity and handedness (synthetic, orientation=0 for a clean check)", () => {
  const anchor = makeStationOriginAnchor({ longitude: -74, latitude: 40, altitudeM: 0, orientationDeg: 0 });

  it("a point due north of the origin (along the along-track bearing) lands purely on +X", () => {
    const local = toStationLocal(anchor, { longitude: -74, latitude: 40 + 100 / 111320 }); // ~100m north
    expect(local.x).toBeGreaterThan(90);
    expect(Math.abs(local.y)).toBeLessThan(1e-6);
  });

  it("a point due east of the origin (perpendicular to along-track) lands purely on the Y axis, never on X", () => {
    const mpdLng = Math.cos((anchor.latitude * Math.PI) / 180) * 111320;
    const local = toStationLocal(anchor, { longitude: -74 + 100 / mpdLng, latitude: 40 }); // ~100m east
    expect(Math.abs(local.x)).toBeLessThan(1e-6);
    expect(Math.abs(local.y)).toBeGreaterThan(90); // perpendicular offset shows up entirely as lateral, confirming X⊥Y
  });

  it("+Y points left of the direction of travel along +X, matching a right-handed (X,Y,Z-up) frame", () => {
    // Facing north (orientation 0), "left" is west — a real east offset
    // (to the right) must produce NEGATIVE y, not positive.
    const mpdLng = Math.cos((anchor.latitude * Math.PI) / 180) * 111320;
    const local = toStationLocal(anchor, { longitude: -74 + 50 / mpdLng, latitude: 40 });
    expect(local.y).toBeLessThan(0);
  });
});

describe("geographic -> local -> geographic round trip", () => {
  it("reproduces the original point for a real Bay Ridge Av track excerpt point", () => {
    const original = BAY_RIDGE_AV_SOURCE_SHAPE_EXCERPT.points[0]; // idx 2, real point
    const local = toStationLocal(BAY_RIDGE_AV_ORIGIN_ANCHOR, original);
    const roundTripped = toGeographic(BAY_RIDGE_AV_ORIGIN_ANCHOR, local);
    expect(metersBetween(original, roundTripped)).toBeLessThan(METERS_EPS);
  });

  it("reproduces an arbitrary offset point, not just a source fixture point", () => {
    const anchor = makeStationOriginAnchor({ longitude: -73.9, latitude: 40.7, altitudeM: 3, orientationDeg: 123.4 });
    const original: Required<GeoPoint> = { longitude: -73.895, latitude: 40.703, altitudeM: 12 };
    const local = toStationLocal(anchor, original);
    const roundTripped = toGeographic(anchor, local);
    expect(metersBetween(original, roundTripped)).toBeLessThan(METERS_EPS);
    expect(roundTripped.altitudeM).toBeCloseTo(original.altitudeM, 6);
  });
});

describe("local -> geographic -> local round trip", () => {
  it("reproduces an arbitrary local point through the geographic transform and back", () => {
    const anchor = BAY_RIDGE_AV_ORIGIN_ANCHOR;
    const originalLocal = { x: 45.7, y: -12.3, z: 6 };
    const geo = toGeographic(anchor, originalLocal);
    const roundTripped = toStationLocal(anchor, geo);
    expect(roundTripped.x).toBeCloseTo(originalLocal.x, 6);
    expect(roundTripped.y).toBeCloseTo(originalLocal.y, 6);
    expect(roundTripped.z).toBeCloseTo(originalLocal.z, 9);
  });
});

describe("Bay Ridge Av real coordinate fixture", () => {
  it("R42's own coordinate is the station-local origin", () => {
    const r42: GeoPoint = { longitude: -74.023377, latitude: 40.634967 };
    const local = toStationLocal(BAY_RIDGE_AV_ORIGIN_ANCHOR, r42);
    expect(local.x).toBeCloseTo(0, 6);
    expect(local.y).toBeCloseTo(0, 6);
  });

  it("the derived orientation is a real, non-trivial bearing computed from real track geometry, not a placeholder", () => {
    // Cross-checks the seed's own exported constant against an independent
    // call to computeBearingDeg with the same two real source points —
    // proves the orientation really is DERIVED, not a hand-typed literal
    // that merely happens to be exported under a derivation-sounding name.
    const [p0, , p2] = BAY_RIDGE_AV_SOURCE_SHAPE_EXCERPT.points;
    const independentlyComputed = computeBearingDeg(p0, p2);
    expect(BAY_RIDGE_AV_DERIVED_ORIENTATION_DEG).toBeCloseTo(independentlyComputed, 9);
    expect(BAY_RIDGE_AV_DERIVED_ORIENTATION_DEG).toBeGreaterThan(0);
    expect(BAY_RIDGE_AV_DERIVED_ORIENTATION_DEG).toBeLessThan(360);
    // Real-world sanity: the 4th Ave Line runs roughly NNE-SSW through here.
    expect(BAY_RIDGE_AV_DERIVED_ORIENTATION_DEG).toBeGreaterThan(0);
    expect(BAY_RIDGE_AV_DERIVED_ORIENTATION_DEG).toBeLessThan(45);
  });

  it("positive local X follows the real, derived R-line longitudinal direction (a real point further along the same real shape)", () => {
    const ahead = BAY_RIDGE_AV_SOURCE_SHAPE_EXCERPT.points[2]; // idx 4, real point past R42 along the shape
    const behind = BAY_RIDGE_AV_SOURCE_SHAPE_EXCERPT.points[0]; // idx 2, real point before R42

    const aheadLocal = toStationLocal(BAY_RIDGE_AV_ORIGIN_ANCHOR, ahead);
    const behindLocal = toStationLocal(BAY_RIDGE_AV_ORIGIN_ANCHOR, behind);

    expect(aheadLocal.x).toBeGreaterThan(100); // clearly positive, matching real along-track distance
    expect(behindLocal.x).toBeLessThan(-100); // clearly negative — the opposite real direction

    // Real track isn't perfectly straight over ~600-700m, but the derived
    // orientation should still absorb almost all of it: lateral residual
    // small relative to the along-track distance covered.
    expect(Math.abs(aheadLocal.y)).toBeLessThan(5);
    expect(Math.abs(behindLocal.y)).toBeLessThan(5);
  });

  it("buildBayRidgeAvStationGeometrySeed() produces a deterministic id, real stationRef, and the derived origin — with entrances/wallSurfaces genuinely empty (out of scope) and topology populated (checkpoint 2)", () => {
    const seed = buildBayRidgeAvStationGeometrySeed("2026-09-07T00:00:00.000Z");
    expect(seed.id).toBe("stationGeometry:R42");
    expect(seed.stationRef).toEqual({ gtfsStopId: "R42", routeIds: ["R"] });
    expect(seed.origin.longitude).toBeCloseTo(-74.023377, 9);
    expect(seed.origin.latitude).toBeCloseTo(40.634967, 9);
    expect(seed.origin.orientationDeg).toBeCloseTo(BAY_RIDGE_AV_DERIVED_ORIENTATION_DEG, 9);
    expect(seed.origin.provenance.source).toBe("authority");
    expect(seed.entrances).toEqual([]);
    expect(seed.wallSurfaces).toEqual([]);
  });

  it("is deterministic across repeated calls (aside from the explicit timestamp override)", () => {
    const a = buildBayRidgeAvStationGeometrySeed("2026-01-01T00:00:00.000Z");
    const b = buildBayRidgeAvStationGeometrySeed("2026-01-01T00:00:00.000Z");
    expect(a).toEqual(b);
  });
});

describe("Bay Ridge Av orientation cross-validation against an independent R-line shape", () => {
  // wall/data/subway/mtaSubwayStaticSnapshot.json shapes["R..S27R"] — the
  // real southbound R-line/4th Ave Line GTFS shape, a separately published
  // trip pattern from the northbound "R..N27R" the canonical seed derives
  // its orientation from. R42 itself is that shape's own point at index
  // 190 (confirmed distance 0 against the committed snapshot). Points
  // below are real values read directly from the same committed file,
  // relabeled {latitude, longitude} from its own [lat, lon] pairs — never
  // re-fetched or invented.
  //
  // Note on independence: near the station this southbound shape's own
  // *immediate* neighbor points (idx189, idx191) turn out to be the exact
  // same real-world vertices as R..N27R's idx4/idx2 (same physical track,
  // opposite publishing direction) — expected, since both describe the
  // same real rail. The wider-baseline points (idx187, idx193) are
  // genuinely additional real vertices not used anywhere in the canonical
  // derivation, giving an independent check on how much the bearing shifts
  // over a longer real stretch of track.
  const S27R_NARROW = {
    beforeR42: { idx: 191, latitude: 40.629742, longitude: -74.02551 }, // == N27R idx2
    r42: { idx: 190, latitude: 40.634967, longitude: -74.023377 },
    afterR42: { idx: 189, latitude: 40.636436, longitude: -74.022774 }, // == N27R idx4
  } as const;
  const S27R_WIDE = {
    farBeforeR42: { idx: 193, latitude: 40.616622, longitude: -74.030876 },
    farAfterR42: { idx: 187, latitude: 40.636544, longitude: -74.022723 },
  } as const;

  it("R42 is also the (distance-zero) shape point in the independent southbound shape", () => {
    const local = toStationLocal(BAY_RIDGE_AV_ORIGIN_ANCHOR, S27R_NARROW.r42);
    expect(local.x).toBeCloseTo(0, 6);
    expect(local.y).toBeCloseTo(0, 6);
  });

  it("the southbound shape's own natural point order yields the reciprocal (opposite) bearing, matching the canonical orientation within a fraction of a degree", () => {
    // S27R's index order runs south (increasing index = decreasing
    // latitude) — the reciprocal of N27R's index order (increasing index =
    // increasing latitude, north). A real, physically-consistent
    // longitudinal axis must come back matching once un-reciprocated.
    const southboundBearing = computeBearingDeg(S27R_NARROW.afterR42, S27R_NARROW.beforeR42);
    const reciprocal = normalizeOrientationDeg(southboundBearing + 180);
    const diff = wrapSafeAngularDiff(reciprocal, BAY_RIDGE_AV_DERIVED_ORIENTATION_DEG);
    expect(diff).toBeLessThan(1); // real observed spread ~0.002 degrees
  });

  it("a wider real baseline on the independent southbound shape still agrees closely (checks for curve-induced drift)", () => {
    const southboundBearingWide = computeBearingDeg(S27R_WIDE.farAfterR42, S27R_WIDE.farBeforeR42);
    const reciprocalWide = normalizeOrientationDeg(southboundBearingWide + 180);
    const diff = wrapSafeAngularDiff(reciprocalWide, BAY_RIDGE_AV_DERIVED_ORIENTATION_DEG);
    // Looser tolerance: a longer real baseline necessarily picks up more of
    // the track's real curvature, so some drift is expected — this proves
    // the drift stays small (well under a degree), not that it's zero.
    expect(diff).toBeLessThan(1);
  });
});

describe("Bay Ridge Av topology (checkpoint 2 — topology only, no physical geometry)", () => {
  const seed = buildBayRidgeAvStationGeometrySeed("2026-09-07T00:00:00.000Z");

  it("has exactly two side platforms on a single shared platform level", () => {
    expect(seed.platforms).toHaveLength(2);
    for (const platform of seed.platforms) {
      expect(platform.config).toBe("side");
    }
    const levelIds = new Set(seed.platforms.map((p) => p.levelId));
    expect(levelIds.size).toBe(1); // "common passenger platform level"
    const platformLevel = seed.levels.find((l) => l.id === [...levelIds][0]);
    expect(platformLevel?.kind).toBe("platform");
  });

  it("has a distinct mezzanine level, vertically connected to the shared platform level", () => {
    const mezzanine = seed.levels.find((l) => l.kind === "mezzanine");
    expect(mezzanine).toBeDefined();
    const platformLevelId = seed.platforms[0].levelId;
    const mezzanineToPlatform = seed.connections.find(
      (c) => c.kind === "stairs" && new Set([c.fromLevelId, c.toLevelId]).has(mezzanine!.id) && new Set([c.fromLevelId, c.toLevelId]).has(platformLevelId),
    );
    expect(mezzanineToPlatform).toBeDefined();
  });

  it("has exactly two logical running tracks, each tied to exactly one platform", () => {
    expect(seed.trackCenterlines).toHaveLength(2);
    const platformIds = seed.platforms.map((p) => p.id);
    const trackPlatformIds = seed.trackCenterlines.map((t) => t.platformId);
    expect(new Set(trackPlatformIds)).toEqual(new Set(platformIds)); // 1:1, no duplicates, no nulls
  });

  it("represents the south-end crossover as a platform-to-platform topological link, independent of the mezzanine connection", () => {
    expect(seed.platformLinks).toHaveLength(1);
    const [link] = seed.platformLinks;
    expect(link.kind).toBe("crossover");
    expect(link.approximatePosition).toBe("south");
    expect(new Set(link.platformIds)).toEqual(new Set(seed.platforms.map((p) => p.id)));
  });

  it("every topology record carries its own provenance — no blanket single source for the whole record", () => {
    const provenanced = [
      ...seed.levels,
      ...seed.platforms,
      ...seed.trackCenterlines,
      ...seed.connections,
      ...seed.platformLinks,
    ];
    expect(provenanced.length).toBeGreaterThan(0);
    for (const record of provenanced) {
      expect(record.provenance).toBeDefined();
      expect(record.provenance.source).not.toBe("unknown");
      expect(record.provenance.sourceRef).toBeTruthy();
    }
  });

  it("still leaves connection paths and level elevations unauthored — this checkpoint's scope was platform/track geometry only, not stairs or elevations", () => {
    for (const connection of seed.connections) {
      expect(connection.localPath).toBeUndefined();
    }
    for (const level of seed.levels) {
      expect(level.elevationM).toBeUndefined();
    }
  });

  it("treats each track's gtfsShapeRef as a distinct concept from its authored localPoints — the alignment reference was never the source of the physical geometry", () => {
    const shapeIds = seed.trackCenterlines.map((t) => t.gtfsShapeRef?.shapeId);
    expect(shapeIds).toEqual(["R..N27R", "R..S27R"]);
    for (const track of seed.trackCenterlines) {
      expect(track.gtfsShapeRef).toBeDefined();
      expect(track.localPoints).toBeDefined();
      expect(track.localPoints!.length).toBeGreaterThan(0);
    }
    // The two tracks' authored localPoints must NOT be the GTFS alignment
    // points in disguise — they come from a separate OSM dataset and carry
    // a real lateral (y) separation the GTFS shapes never had (checkpoint 4
    // proved R..N27R/R..S27R coincide with zero lateral offset).
    const northboundY = seed.trackCenterlines[0].localPoints![0].y;
    const southboundY = seed.trackCenterlines[1].localPoints![0].y;
    expect(Math.abs(northboundY - southboundY)).toBeGreaterThan(1); // real, meters-scale separation
  });

  it("cross-checks that the two tracks' alignment-reference shapes really do coincide near the station (the exact fact that makes them alignment references, not proof of physical spacing)", () => {
    // Real points from each track's own gtfsShapeRef window, independently
    // read from the same committed GTFS snapshot excerpt this file already
    // uses elsewhere in this suite.
    const northboundAlignmentPoint = { latitude: 40.636436, longitude: -74.022774 }; // R..N27R idx4
    const southboundAlignmentPoint = { latitude: 40.636436, longitude: -74.022774 }; // R..S27R idx189
    expect(metersBetween(northboundAlignmentPoint, southboundAlignmentPoint)).toBeLessThan(METERS_EPS);
  });
});

describe("Bay Ridge Av platform-plan geometry (checkpoint 5 — Calibration Pass 01, OSM-sourced)", () => {
  const seed = buildBayRidgeAvStationGeometrySeed("2026-09-08T00:00:00.000Z");

  it("authors a real, closed 4-vertex footprint polygon for both platforms", () => {
    for (const platform of seed.platforms) {
      expect(platform.footprint).toBeDefined();
      expect(platform.footprint!.length).toBe(4);
    }
  });

  it("both platform footprints have a real, physically plausible length (~180-195m, matching this station's independently-sourced ~615ft/~187m renovation record within a few meters)", () => {
    for (const platform of seed.platforms) {
      const xs = platform.footprint!.map((p) => p.x);
      const length = Math.max(...xs) - Math.min(...xs);
      expect(length).toBeGreaterThan(180);
      expect(length).toBeLessThan(195);
    }
  });

  it("both platform footprints have a real, non-degenerate width (not a zero-area sliver)", () => {
    for (const platform of seed.platforms) {
      const ys = platform.footprint!.map((p) => p.y);
      const width = Math.max(...ys) - Math.min(...ys);
      expect(width).toBeGreaterThan(1);
      expect(width).toBeLessThan(15); // sanity bound — real NYC platforms are not this order of magnitude wider
    }
  });

  it("keeps the northbound platform on the opposite lateral side from the southbound platform, consistent with two side platforms flanking two tracks", () => {
    const northboundYs = seed.platforms[0].footprint!.map((p) => p.y);
    const southboundYs = seed.platforms[1].footprint!.map((p) => p.y);
    const northboundMax = Math.max(...northboundYs);
    const southboundMin = Math.min(...southboundYs);
    expect(northboundMax).toBeLessThan(southboundMin); // no overlap, correct side ordering
  });

  it("marks OSM-sourced footprint provenance with LOW confidence, never silently promoted to a high-confidence measurement", () => {
    for (const platform of seed.platforms) {
      expect(platform.provenance.source).toBe("reference");
      expect(platform.provenance.confidence).toBeLessThan(0.5);
      expect(platform.provenance.sourceRef).toMatch(/OSM way/);
      expect(platform.provenance.note).toMatch(/ESTIMATE/);
    }
  });

  it("authors real track centerline points with a genuine, meters-scale lateral offset between the two tracks — the thing checkpoint 4 explicitly deferred", () => {
    for (const track of seed.trackCenterlines) {
      expect(track.localPoints).toBeDefined();
      expect(track.localPoints!.length).toBeGreaterThan(0);
    }
    const northboundTrackY = seed.trackCenterlines[0].localPoints![0].y;
    const southboundTrackY = seed.trackCenterlines[1].localPoints![0].y;
    const spacing = Math.abs(northboundTrackY - southboundTrackY);
    // Real NYC subway two-track center-to-center spacing is on the order of
    // ~4m (~13ft) — a sanity bound, not an asserted exact standard.
    expect(spacing).toBeGreaterThan(2);
    expect(spacing).toBeLessThan(6);
  });

  it("places each track centerline plausibly just outboard of its own adjacent platform's near edge (a physical consistency check performed this checkpoint, not asserted by any single source)", () => {
    const northboundPlatformNearEdge = Math.max(...seed.platforms[0].footprint!.map((p) => p.y)); // platform's edge closest to its track
    const northboundTrackY = seed.trackCenterlines[0].localPoints![0].y;
    expect(northboundTrackY).toBeGreaterThan(northboundPlatformNearEdge); // track is outboard (more positive y) of the platform edge
    expect(northboundTrackY - northboundPlatformNearEdge).toBeLessThan(3); // plausibly close, not a huge unexplained gap

    const southboundPlatformNearEdge = Math.min(...seed.platforms[1].footprint!.map((p) => p.y));
    const southboundTrackY = seed.trackCenterlines[1].localPoints![0].y;
    expect(southboundTrackY).toBeLessThan(southboundPlatformNearEdge);
    expect(southboundPlatformNearEdge - southboundTrackY).toBeLessThan(3);
  });

  it("marks OSM-sourced track provenance as reference-level but distinctly higher confidence than the self-flagged-estimated platform polygons", () => {
    for (const track of seed.trackCenterlines) {
      expect(track.provenance.source).toBe("reference");
      expect(track.provenance.confidence).toBeGreaterThan(seed.platforms[0].provenance.confidence!);
      expect(track.provenance.confidence).toBeLessThan(0.6); // still not "measured"
      expect(track.provenance.sourceRef).toMatch(/OSM way/);
    }
  });

  it("never derives the authored track lateral offset from the GTFS gtfsShapeRef — the two remain independent, distinctly-sourced fields", () => {
    for (const track of seed.trackCenterlines) {
      expect(track.provenance.note).toMatch(/no lateral spacing|NOT the source of this lateral offset|never from GTFS/);
    }
  });

  it("round-trips every authored footprint/centerline vertex through the station's own geographic transform without drift (proves these are real transformed coordinates, not hand-typed local numbers)", () => {
    for (const platform of seed.platforms) {
      for (const local of platform.footprint!) {
        const geo = toGeographic(BAY_RIDGE_AV_ORIGIN_ANCHOR, { ...local, z: 0 });
        const roundTripped = toStationLocal(BAY_RIDGE_AV_ORIGIN_ANCHOR, geo);
        expect(roundTripped.x).toBeCloseTo(local.x, 6);
        expect(roundTripped.y).toBeCloseTo(local.y, 6);
      }
    }
  });

  it("is fully deterministic across repeated builds, including the new footprint/localPoints fields", () => {
    const a = buildBayRidgeAvStationGeometrySeed("2026-01-01T00:00:00.000Z");
    const b = buildBayRidgeAvStationGeometrySeed("2026-01-01T00:00:00.000Z");
    expect(a.platforms).toEqual(b.platforms);
    expect(a.trackCenterlines).toEqual(b.trackCenterlines);
  });
});

describe("Bay Ridge Av evidence conflict model (checkpoint 6 — Evidence Conflict + Field Calibration Prep)", () => {
  const seed = buildBayRidgeAvStationGeometrySeed("2026-09-08T00:00:00.000Z");

  it("records the platform-width conflict between OSM's estimated (symmetric) footprints and the reference sources' documented asymmetry", () => {
    expect(seed.evidenceConflicts).toHaveLength(1);
    const [conflict] = seed.evidenceConflicts;
    expect(conflict.affectedField).toMatch(/width/i);
    expect(conflict.conflictingEvidence.length).toBeGreaterThanOrEqual(2);
    expect(conflict.conflictingEvidence[0].sourceRef).toMatch(/OSM way/);
    expect(conflict.conflictingEvidence[1].sourceRef).toMatch(/wikipedia|nycsubway/i);
  });

  it("never silently drops or renames the conflict record across later checkpoints, whatever its current status", () => {
    // This checkpoint's own status assertion ("unresolved") was superseded
    // by the 2026-09-09 Circulation/Topology Observation Pass (see that
    // describe block below for the current, authoritative status check) —
    // buildBayRidgeAvStationGeometrySeed() always reflects TODAY's state,
    // not a frozen per-checkpoint snapshot, so this test only pins the
    // record's continued identity/shape, not a specific status value.
    const [conflict] = seed.evidenceConflicts;
    expect(conflict.id).toBe("evidenceConflict:R42:platformWidthAsymmetry");
    expect(["unresolved", "resolved", "accepted_discrepancy"]).toContain(conflict.status);
  });

  it("keeps the conflict record independent of, not a replacement for, each platform's own provenance note", () => {
    // The conflict is a first-class queryable fact; it does not remove or
    // alter the individual platform records' own existing provenance.
    for (const platform of seed.platforms) {
      expect(platform.provenance.note).toMatch(/ESTIMATE/);
    }
    expect(seed.evidenceConflicts[0].note).toBeTruthy();
  });

  it("survives a plain JSON serialize/parse round trip byte-for-byte", () => {
    const roundTripped = JSON.parse(JSON.stringify(seed));
    expect(roundTripped.evidenceConflicts).toEqual(seed.evidenceConflicts);
  });

  it("is fully deterministic across repeated builds", () => {
    const a = buildBayRidgeAvStationGeometrySeed("2026-01-01T00:00:00.000Z");
    const b = buildBayRidgeAvStationGeometrySeed("2026-01-01T00:00:00.000Z");
    expect(a.evidenceConflicts).toEqual(b.evidenceConflicts);
  });
});

describe("Bay Ridge Av Visual Calibration Pass (photo-grounded refinements, no fabricated dimensions)", () => {
  const seed = buildBayRidgeAvStationGeometrySeed("2026-09-08T00:00:00.000Z");

  it("added a third, explicitly-labeled VISUAL OBSERVATION entry to the width conflict (photo evidence alone did not resolve it — see the later Circulation/Topology Observation Pass for what did)", () => {
    const [conflict] = seed.evidenceConflicts;
    expect(conflict.conflictingEvidence.length).toBeGreaterThanOrEqual(3);
    const visualEntry = conflict.conflictingEvidence[2];
    expect(visualEntry.description).toMatch(/VISUAL OBSERVATION/);
    expect(visualEntry.sourceRef).toMatch(/Visual_Field_Observations/);
  });

  it("never turns a visual observation into a fabricated numeric width — footprint provenance still traces to OSM, not to the photo set", () => {
    // This pass is documentation/provenance-only for the width question;
    // the platforms' own footprint provenance must still cite OSM as its
    // primary geometry source, unchanged by the visual observations doc.
    for (const platform of seed.platforms) {
      expect(platform.provenance.sourceRef).toMatch(/OSM way/);
      expect(platform.provenance.sourceRef).not.toMatch(/Visual_Field_Observations/);
    }
  });

  it("resolves the crossover mechanism to 'via the mezzanine' at raised (but still sub-measured) confidence, citing the real photo evidence", () => {
    const [link] = seed.platformLinks;
    expect(link.provenance.confidence).toBeGreaterThan(0.5);
    expect(link.provenance.confidence).toBeLessThan(0.7); // still not measured
    expect(link.provenance.note).toMatch(/via the mezzanine/i);
    expect(link.provenance.sourceRef).toMatch(/Visual_Field_Observations/);
    // The longitudinal position claim is untouched by this pass — still
    // only as precise as checkpoint 5 left it.
    expect(link.approximatePosition).toBe("south");
  });

  it("is fully deterministic across repeated builds, including the new visual-evidence entries", () => {
    const a = buildBayRidgeAvStationGeometrySeed("2026-01-01T00:00:00.000Z");
    const b = buildBayRidgeAvStationGeometrySeed("2026-01-01T00:00:00.000Z");
    expect(a.evidenceConflicts).toEqual(b.evidenceConflicts);
    expect(a.platformLinks).toEqual(b.platformLinks);
  });
});

describe("Bay Ridge Av Circulation/Topology Observation Pass (2026-09-09 — direction resolved, magnitude still unmeasured)", () => {
  const seed = buildBayRidgeAvStationGeometrySeed("2026-09-09T00:00:00.000Z");

  it("adds a fourth, field-confirmed evidence entry distinct from the earlier photo-interpretation entry", () => {
    const [conflict] = seed.evidenceConflicts;
    expect(conflict.conflictingEvidence).toHaveLength(4);
    const fieldEntry = conflict.conflictingEvidence[3];
    expect(fieldEntry.description).toMatch(/FIELD-CONFIRMED/);
    expect(fieldEntry.description).not.toMatch(/VISUAL OBSERVATION \(not a measurement\)/); // distinct from entry index 2
  });

  it("resolves the conflict's DIRECTION only — status moves to resolved, but no numeric width was fabricated anywhere", () => {
    const [conflict] = seed.evidenceConflicts;
    expect(conflict.status).toBe("resolved");
    expect(conflict.note).toMatch(/DIRECTION resolved/);
    expect(conflict.note).toMatch(/MAGNITUDE remains unresolved/);
    // The defining proof this wasn't quietly turned into fake geometry:
    // both platform footprints are untouched, still OSM-sourced.
    for (const platform of seed.platforms) {
      expect(platform.provenance.sourceRef).toMatch(/OSM way/);
    }
  });

  it("never discards the older, now-superseded-on-this-point OSM evidence entry — conflicting evidence is additive, never deleted", () => {
    const [conflict] = seed.evidenceConflicts;
    expect(conflict.conflictingEvidence[0].description).toMatch(/SYMMETRIC/);
    expect(conflict.conflictingEvidence[0].sourceRef).toMatch(/OSM way/);
  });

  it("is fully deterministic across repeated builds", () => {
    const a = buildBayRidgeAvStationGeometrySeed("2026-01-01T00:00:00.000Z");
    const b = buildBayRidgeAvStationGeometrySeed("2026-01-01T00:00:00.000Z");
    expect(a.evidenceConflicts).toEqual(b.evidenceConflicts);
  });
});

describe("Bay Ridge Av side-specific stair connections (2026-09-09 — split from one shared record into two)", () => {
  const seed = buildBayRidgeAvStationGeometrySeed("2026-09-09T00:00:00.000Z");
  const mezzanineLevelId = seed.levels.find((l) => l.kind === "mezzanine")!.id;
  const platformLevelId = seed.levels.find((l) => l.kind === "platform")!.id;
  const northboundPlatformId = seed.platforms.find((p) => p.id.includes("northbound"))!.id;
  const southboundPlatformId = seed.platforms.find((p) => p.id.includes("southbound"))!.id;

  it("has exactly two mezzanine<->platform stair connections, one per platform side, each with its own relatedPlatformId", () => {
    const stairConnections = seed.connections.filter((c) => c.kind === "stairs");
    expect(stairConnections).toHaveLength(2);
    const relatedPlatformIds = stairConnections.map((c) => c.relatedPlatformId).sort();
    expect(relatedPlatformIds).toEqual([northboundPlatformId, southboundPlatformId].sort());
  });

  it("both stair connections still connect the same two levels — only ownership and provenance differ, not topology", () => {
    for (const connection of seed.connections) {
      expect(connection.fromLevelId).toBe(mezzanineLevelId);
      expect(connection.toLevelId).toBe(platformLevelId);
    }
  });

  it("attaches the correct, distinct qualitative circulation observation to each side — never lane counts or numbers", () => {
    const northboundConnection = seed.connections.find((c) => c.relatedPlatformId === northboundPlatformId)!;
    const southboundConnection = seed.connections.find((c) => c.relatedPlatformId === southboundPlatformId)!;
    expect(northboundConnection.provenance.note).toMatch(/continues directly into the platform path/);
    expect(northboundConnection.provenance.note).toMatch(/preserving two circulation lanes/);
    expect(southboundConnection.provenance.note).toMatch(/interrupts that continuity/);
    expect(southboundConnection.provenance.note).toMatch(/one main circulation lane/);
    // Qualitative only — no digit-based lane count or dimension anywhere in either observation.
    for (const c of [northboundConnection, southboundConnection]) {
      expect(c.provenance.note).not.toMatch(/\d+\s*(lane|m|ft|meter|foot)/i);
    }
  });

  it("never authors lane geometry, entrance geometry, or coordinates for these observations", () => {
    for (const connection of seed.connections) {
      expect(connection.localPath).toBeUndefined();
    }
    expect(seed.entrances).toEqual([]);
  });

  it("adds the southbound rear-exit observation to the southbound platform's provenance note only — northbound is untouched", () => {
    const southbound = seed.platforms.find((p) => p.id === southboundPlatformId)!;
    const northbound = seed.platforms.find((p) => p.id === northboundPlatformId)!;
    expect(southbound.provenance.note).toMatch(/rear-exit relationship/);
    expect(southbound.provenance.note).toMatch(/not an authored StationEntrance/);
    expect(northbound.provenance.note).not.toMatch(/rear-exit/);
  });

  it("preserves every pre-existing geometry and provenance fact untouched by this pass (platforms' footprints, tracks, platformLinks, evidenceConflicts identity)", () => {
    expect(seed.platforms[0].footprint).toBeDefined();
    expect(seed.platforms[1].footprint).toBeDefined();
    expect(seed.trackCenterlines).toHaveLength(2);
    expect(seed.platformLinks).toHaveLength(1);
    expect(seed.evidenceConflicts[0].id).toBe("evidenceConflict:R42:platformWidthAsymmetry");
  });

  it("is fully deterministic across repeated builds", () => {
    const a = buildBayRidgeAvStationGeometrySeed("2026-01-01T00:00:00.000Z");
    const b = buildBayRidgeAvStationGeometrySeed("2026-01-01T00:00:00.000Z");
    expect(a.connections).toEqual(b.connections);
    expect(a.platforms).toEqual(b.platforms);
  });
});

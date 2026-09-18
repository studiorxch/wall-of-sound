// ── 45th Street (R39) station geometry seed ───────────────────────────────────
// 0909_WOS_Subway_45th_Street_4Track_Archetype_Validation_Bootstrap_v1.0.0
//
// The SECOND real station bootstrapped from UG_SIDE_4TRACK — a deliberate
// validation exercise, per the governing spec: does the archetype hold up
// on a second, independently-derived station without forcing symmetry it
// doesn't have? Same two-step discipline as
// stationGeometry53rdStreetSeed.ts (which this module does NOT import or
// depend on in any way):
//
//   1. deriveUndergroundSide4TrackGeometry() — a pure `heuristic` shell,
//      anchored at 45th Street's own real coordinate/orientation.
//   2. Real, INDEPENDENTLY-established evidence for 45th Street replaces
//      the archetype's heuristic platforms, track centerlines, levels, and
//      connections field by field. Nothing here was copied from 53rd
//      Street's own OSM points, provenance text, or topology — even though
//      the two stations share physical track infrastructure (same 4 OSM
//      track ways), each station's own near-station points were
//      independently queried and read.
//
// Provenance hierarchy: heuristic archetype default -> reference geometry
// (this checkpoint) -> visual/field (not yet done) -> measured (not yet done).
//
// ── Real coordinate + identity (authority) ──────────────────────────────────
// wall/data/subway/mtaSubwayStaticSnapshot.json: stops[] station-level record
// {stopId:"R39", stopName:"45 St", lat:40.648939, lon:-74.010006,
//  locationType:1, complexId:"33"}.
//
// ── Real orientation derivation (authority, not hand-typed, not copied) ─────
// shapes["R..N27R"] contains R39's own exact coordinate as shape point index
// 23 (the same index used as 53rd Street's own "after" bracketing neighbor —
// expected, since 45th St is the very next real station north of 53rd St on
// the same physical track). This module re-derives R39's own real bearing
// from indices 22 and 24 (index 22 is 53rd Street's own real coordinate,
// used here only as a real bracketing neighbor — the same honest method
// already used throughout this whole arc, never a shortcut that copies
// 53rd Street's geometry). Result (~38.297 degrees) is close to but
// genuinely distinct from 53rd Street's own derived value (~38.261 degrees)
// — the same straight-ish segment, two different real derivation windows.
import {
  computeBearingDeg,
  makeStationOriginAnchor,
  toStationLocal,
} from "./stationGeometryCoordinates";
import { deriveUndergroundSide4TrackGeometry } from "./stationArchetypeUndergroundSide4Track";
import { DEFAULT_UG_SIDE_4TRACK_PARAMETERS } from "../../data/stationArchetypeTypes";
import { makeStationGeometryId, type StationGeometryData } from "../../data/stationGeometryTypes";

const R39_GTFS_STOP_ID = "R39";
const R39_LATITUDE = 40.648939;
const R39_LONGITUDE = -74.010006;

/** Real GTFS shape points from shapes["R..N27R"], indices 22-24 (R39 itself is index 23). */
export const R39_SOURCE_SHAPE_EXCERPT = {
  shapeId: "R..N27R",
  points: [
    { idx: 22, latitude: 40.645069, longitude: -74.014034 }, // 53rd Street's real point, used only as a real neighbor
    { idx: 23, latitude: 40.648939, longitude: -74.010006 }, // R39 itself
    { idx: 24, latitude: 40.653563, longitude: -74.005194 },
  ],
} as const;

/** Real, derived (not hand-typed, not copied from 53rd Street's own constant) — expect ~38.3 degrees. */
export const R39_DERIVED_ORIENTATION_DEG = computeBearingDeg(
  R39_SOURCE_SHAPE_EXCERPT.points[0],
  R39_SOURCE_SHAPE_EXCERPT.points[2],
);

export const R39_ORIGIN_ANCHOR = makeStationOriginAnchor({
  longitude: R39_LONGITUDE,
  latitude: R39_LATITUDE,
  altitudeM: 0,
  orientationDeg: R39_DERIVED_ORIENTATION_DEG,
});

// ── OSM-sourced platform/track geometry (reference) ─────────────────────────
const R39_OSM_QUERY_NOTE =
  "OpenStreetMap via Overpass API (overpass-api.de), queried 2026-09-09, around:150m of 40.648939,-74.010006";

/** OSM way 907183037, tags: railway=platform, gtfs:stop_id=R39N, source=estimated. */
const OSM_R39_NORTHBOUND_PLATFORM_POLYGON = [
  { latitude: 40.6496442, longitude: -74.0091746 },
  { latitude: 40.6496242, longitude: -74.00914 },
  { latitude: 40.6483147, longitude: -74.0105022 },
  { latitude: 40.6483348, longitude: -74.0105371 },
] as const;

/** OSM way 907183038, tags: railway=platform, gtfs:stop_id=R39S, source=estimated. */
const OSM_R39_SOUTHBOUND_PLATFORM_POLYGON = [
  { latitude: 40.6497231, longitude: -74.0093108 },
  { latitude: 40.6497433, longitude: -74.0093452 },
  { latitude: 40.6484324, longitude: -74.0107092 },
  { latitude: 40.6484125, longitude: -74.0106741 },
] as const;

/** OSM way 817936156, railway:track_ref=2 — northbound LOCAL. Real points close to R39 (~81-105m), same high-confidence pattern as every other station in this arc. */
const OSM_R39_NORTHBOUND_LOCAL_TRACK_POINTS = [
  { latitude: 40.648343, longitude: -74.0105515 },
  { latitude: 40.6496526, longitude: -74.009189 },
] as const;

/** OSM way 817936151, railway:track_ref=1 — southbound LOCAL. Same high-confidence pattern. */
const OSM_R39_SOUTHBOUND_LOCAL_TRACK_POINTS = [
  { latitude: 40.6484043, longitude: -74.0106596 },
  { latitude: 40.6497146, longitude: -74.0092964 },
] as const;

/**
 * OSM way 46340164, railway:track_ref=4 — northbound EXPRESS. Real points
 * bracket R39 on BOTH sides this time (528m north, 994m south) — a genuine
 * two-sided INTERPOLATION across the same real digitization gap already
 * documented for 53rd Street (which only had a one-sided EXTRAPOLATION
 * available). Interpolation across a real bracket is methodologically
 * stronger than one-sided extrapolation, so this station's express tracks
 * carry slightly higher confidence than 53rd Street's — still meaningfully
 * lower than the local tracks, since the bracket itself is ~1.5km wide.
 */
const OSM_R39_NORTHBOUND_EXPRESS_TRACK_POINTS = [
  { latitude: 40.6419199, longitude: -74.0172879 },
  { latitude: 40.6526597, longitude: -74.0061179 },
] as const;

/** OSM way 817936182, railway:track_ref=3 — southbound EXPRESS. Same two-sided interpolation, same confidence tier. */
const OSM_R39_SOUTHBOUND_EXPRESS_TRACK_POINTS = [
  { latitude: 40.6419406, longitude: -74.017325 },
  { latitude: 40.652681, longitude: -74.0061533 },
] as const;

const REFERENCE_SOURCES =
  "https://en.wikipedia.org/wiki/45th_Street_station_(BMT_Fourth_Avenue_Line) ; https://nycsubway.org/wiki/BMT_4th_Avenue_Line";

const MEZZANINE_LEVEL_ID = `level:${R39_GTFS_STOP_ID}:mezzanine`;
const PLATFORM_LEVEL_ID = `level:${R39_GTFS_STOP_ID}:platform`;
const NORTHBOUND_PLATFORM_ID = `platform:${R39_GTFS_STOP_ID}:northbound`;
const SOUTHBOUND_PLATFORM_ID = `platform:${R39_GTFS_STOP_ID}:southbound`;

/**
 * The one canonical V0 StationGeometryData record for 45th Street —
 * bootstrapped from UG_SIDE_4TRACK's own pure derivation, then overlaid
 * with real, independently-established evidence specific to R39.
 */
export function build45thStreetStationGeometrySeed(now: string = new Date().toISOString()): StationGeometryData {
  // ── Step 1: bootstrap from the archetype's own pure derivation ───────────
  const bootstrapped = deriveUndergroundSide4TrackGeometry(DEFAULT_UG_SIDE_4TRACK_PARAMETERS, R39_GTFS_STOP_ID);
  if (bootstrapped.trackCenterlines.length !== 4 || bootstrapped.platforms.length !== 2) {
    throw new Error("build45thStreetStationGeometrySeed: UG_SIDE_4TRACK's own template shape changed unexpectedly");
  }

  // ── Step 2: replace archetype heuristics with real, R39-specific evidence ─
  return {
    id: makeStationGeometryId(R39_GTFS_STOP_ID),
    stationRef: { gtfsStopId: R39_GTFS_STOP_ID, routeIds: ["R"] },
    version: 1,
    createdAt: now,
    updatedAt: now,
    origin: {
      longitude: R39_ORIGIN_ANCHOR.longitude,
      latitude: R39_ORIGIN_ANCHOR.latitude,
      altitudeM: R39_ORIGIN_ANCHOR.altitudeM,
      orientationDeg: R39_ORIGIN_ANCHOR.orientationDeg,
      provenance: {
        source: "authority",
        confidence: 1,
        sourceRef: "wall/data/subway/mtaSubwayStaticSnapshot.json stops[stopId=R39]; shapes[R..N27R] idx 22,24",
        note: "Coordinate is the real station-level stop record. Orientation is a real bearing independently computed from the same shape's own real points straddling this station (never copied from 53rd Street's own orientation constant, though the two are naturally close — same physical track segment).",
      },
    },
    levels: [
      {
        id: MEZZANINE_LEVEL_ID,
        // NOTE: unlike Bay Ridge Av, 77th St, and 53rd St (all south-end
        // mezzanines), 45th Street's mezzanine is at the NORTH end — a
        // real, independently-confirmed station-specific fact, not
        // assumed to match the other three stations on this line.
        kind: "mezzanine",
        label: "Mezzanine (north end)",
        provenance: {
          source: "reference",
          sourceRef: REFERENCE_SOURCES,
          note: "Main entrance mezzanine is above the platforms/tracks at the NORTH end (opposite end from Bay Ridge Av/77th St/53rd St's own south-end mezzanines) — confirmed by Wikipedia's own explicit statement. A former south exit at 46th St existed but was permanently closed in 1979 after accidental construction damage — not modeled as an active feature.",
        },
      },
      {
        id: PLATFORM_LEVEL_ID,
        kind: "platform",
        label: "Platform level",
        provenance: {
          source: "reference",
          sourceRef: REFERENCE_SOURCES,
          note: "Both side platforms sit at one common passenger platform level.",
        },
      },
    ],
    platforms: [
      {
        id: NORTHBOUND_PLATFORM_ID,
        levelId: PLATFORM_LEVEL_ID,
        config: "side",
        servesRouteIds: ["R"],
        footprint: OSM_R39_NORTHBOUND_PLATFORM_POLYGON.map((p) => toStationLocal(R39_ORIGIN_ANCHOR, p)),
        provenance: {
          source: "reference",
          confidence: 0.35,
          sourceRef: `OSM way 907183037 (railway=platform, gtfs:stop_id=R39N, source=estimated); ${R39_OSM_QUERY_NOTE}`,
          note: "Northbound (Manhattan-bound) side platform. Wikipedia states a real historical LONGITUDINAL OFFSET: 'the platforms are offset as the northbound platform extends further north than the southbound one,' from a 1970 northward extension. This OSM-derived footprint's own X-range does NOT show that offset relative to the southbound platform (see this seed's own evidenceConflicts) — recorded honestly rather than forced to match the text.",
        },
      },
      {
        id: SOUTHBOUND_PLATFORM_ID,
        levelId: PLATFORM_LEVEL_ID,
        config: "side",
        servesRouteIds: ["R"],
        footprint: OSM_R39_SOUTHBOUND_PLATFORM_POLYGON.map((p) => toStationLocal(R39_ORIGIN_ANCHOR, p)),
        provenance: {
          source: "reference",
          confidence: 0.35,
          sourceRef: `OSM way 907183038 (railway=platform, gtfs:stop_id=R39S, source=estimated); ${R39_OSM_QUERY_NOTE}`,
          note: "Southbound (Bay Ridge-bound) side platform. Wikipedia states this platform was extended SOUTHWARD in 1970 (the counterpart half of the same real offset described on the northbound platform's own note). Unlike Bay Ridge Av and 53rd Street, no currently-active exit-only relationship exists here — the former south exit-only (46th St) was permanently closed in 1979.",
        },
      },
    ],
    trackCenterlines: [
      {
        id: `track:${R39_GTFS_STOP_ID}:northboundLocal`,
        role: "northboundLocal",
        platformId: NORTHBOUND_PLATFORM_ID,
        localPoints: OSM_R39_NORTHBOUND_LOCAL_TRACK_POINTS.map((p) => toStationLocal(R39_ORIGIN_ANCHOR, p)),
        provenance: {
          source: "reference",
          confidence: 0.48,
          sourceRef: `OSM way 817936156 (railway=subway, railway:track_ref=2, NOT tagged source=estimated); ${R39_OSM_QUERY_NOTE}`,
          note: "Outer, platform-serving LOCAL track. Real points close to the station (~81-105m), same confidence tier as every other station's local tracks in this arc.",
        },
      },
      {
        id: `track:${R39_GTFS_STOP_ID}:northboundExpress`,
        role: "northboundExpress",
        platformId: null,
        localPoints: OSM_R39_NORTHBOUND_EXPRESS_TRACK_POINTS.map((p) => toStationLocal(R39_ORIGIN_ANCHOR, p)),
        provenance: {
          source: "reference",
          confidence: 0.35,
          sourceRef: `OSM way 46340164 (railway=subway, railway:track_ref=4, NOT tagged source=estimated) — real points bracket R39 on BOTH sides (528m north, 994m south), a two-sided interpolation across the same digitization gap already found at 53rd St; ${R39_OSM_QUERY_NOTE}`,
          note: "Inner, BYPASS express track — serves no platform (platformId is null). Higher confidence than 53rd Street's own express tracks (0.35 vs 0.30) because a real bracket exists on both sides here, not just one — still meaningfully lower than the local tracks, since the bracket itself spans ~1.5km.",
        },
      },
      {
        id: `track:${R39_GTFS_STOP_ID}:southboundExpress`,
        role: "southboundExpress",
        platformId: null,
        localPoints: OSM_R39_SOUTHBOUND_EXPRESS_TRACK_POINTS.map((p) => toStationLocal(R39_ORIGIN_ANCHOR, p)),
        provenance: {
          source: "reference",
          confidence: 0.35,
          sourceRef: `OSM way 817936182 (railway=subway, railway:track_ref=3, NOT tagged source=estimated) — two-sided interpolation, same as the northbound express track; ${R39_OSM_QUERY_NOTE}`,
          note: "Inner, BYPASS express track — serves no platform (platformId is null). See the northbound express track's own note.",
        },
      },
      {
        id: `track:${R39_GTFS_STOP_ID}:southboundLocal`,
        role: "southboundLocal",
        platformId: SOUTHBOUND_PLATFORM_ID,
        localPoints: OSM_R39_SOUTHBOUND_LOCAL_TRACK_POINTS.map((p) => toStationLocal(R39_ORIGIN_ANCHOR, p)),
        provenance: {
          source: "reference",
          confidence: 0.48,
          sourceRef: `OSM way 817936151 (railway=subway, railway:track_ref=1, NOT tagged source=estimated); ${R39_OSM_QUERY_NOTE}`,
          note: "Outer, platform-serving LOCAL track. Real points close to the station (~81-105m).",
        },
      },
    ],
    connections: [
      {
        id: `connection:${R39_GTFS_STOP_ID}:mezzanine-platform-northbound`,
        fromLevelId: MEZZANINE_LEVEL_ID,
        toLevelId: PLATFORM_LEVEL_ID,
        kind: "stairs",
        relatedPlatformId: NORTHBOUND_PLATFORM_ID,
        provenance: {
          source: "reference",
          sourceRef: REFERENCE_SOURCES,
          note: "Two staircases lead to the Manhattan-bound (northbound) platform, per Wikipedia — more than the single staircase serving the southbound side (see the southbound connection's own note). No field/visual pass has been done for 45th St, so no per-side circulation-continuity character is claimed beyond this real staircase-count asymmetry.",
        },
      },
      {
        id: `connection:${R39_GTFS_STOP_ID}:mezzanine-platform-southbound`,
        fromLevelId: MEZZANINE_LEVEL_ID,
        toLevelId: PLATFORM_LEVEL_ID,
        kind: "stairs",
        relatedPlatformId: SOUTHBOUND_PLATFORM_ID,
        provenance: {
          source: "reference",
          sourceRef: REFERENCE_SOURCES,
          note: "One staircase leads to the Bay Ridge-bound (southbound) platform, at the extreme south end, per Wikipedia — asymmetric with the northbound side's two staircases.",
        },
      },
    ],
    platformLinks: [
      {
        id: `platformLink:${R39_GTFS_STOP_ID}:crossover`,
        platformIds: [NORTHBOUND_PLATFORM_ID, SOUTHBOUND_PLATFORM_ID],
        kind: "crossover",
        approximatePosition: "north",
        provenance: {
          source: "reference",
          confidence: 0.6,
          sourceRef: REFERENCE_SOURCES,
          note: "nycsubway.org is explicit: 'the north exit at 45th St. has a crossover.' Position is NORTH here, unlike every other station in this arc so far (all south) — a genuine, independently-confirmed station-specific fact.",
        },
      },
    ],
    evidenceConflicts: [
      {
        id: `evidenceConflict:${R39_GTFS_STOP_ID}:platformLongitudinalOffset`,
        affectedField: "platforms[northbound/southbound].footprint longitudinal (X) range",
        conflictingEvidence: [
          {
            description:
              "Wikipedia states a real historical longitudinal offset: the northbound platform was extended northward in 1970 and the southbound platform extended southward, so 'the platforms are offset' rather than sharing the same endpoints",
            sourceRef: "https://en.wikipedia.org/wiki/45th_Street_station_(BMT_Fourth_Avenue_Line)",
          },
          {
            description:
              "OSM's own platform footprint polygons show the two platforms occupying nearly IDENTICAL X-ranges (within ~0.5m of each other at both ends) — no offset visible in this geometry",
            sourceRef: `OSM way 907183037 (R39N) & way 907183038 (R39S); ${R39_OSM_QUERY_NOTE}`,
          },
        ],
        status: "unresolved",
        note: "A real, newly-found discrepancy distinct in kind from Bay Ridge Av's width conflict or 77th Street's length conflict — here it's about whether the two platforms' ENDPOINTS line up. Neither source is obviously wrong: OSM's estimate may simply not capture a historical 1970-era extension accurately, or the real offset may be smaller than the text implies. Left unresolved rather than assumed either way — this checkpoint deliberately did NOT force the two platforms into a symmetric or asymmetric shape to match either source.",
      },
    ],
    entrances: [],
    wallSurfaces: [],
  };
}

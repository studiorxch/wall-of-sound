// ── 77th Street (R43) station geometry seed ───────────────────────────────────
// 0909_WOS_Subway_77th_Street_Archetype_Bootstrap_v1.0.0
//
// The first real (non-Bay-Ridge) exercise of the UG_SIDE_2TRACK archetype
// bootstrap workflow. Deliberately built in two explicit steps, both visible
// in this file's own code — never hand-authored from scratch pretending to
// have used the archetype:
//
//   1. instantiateStationArchetype() — a pure `heuristic` UG_SIDE_2TRACK
//      shell, anchored at 77th Street's own real coordinate/orientation.
//   2. Real, INDEPENDENTLY-established evidence for 77th Street (never
//      copied from stationGeometryBayRidgeAvSeed.ts — this module has no
//      import of it) REPLACES the archetype's heuristic platforms, track
//      centerlines, levels, and connections outright, field by field.
//      Nothing that isn't independently verified for 77th Street is upgraded
//      past "heuristic" — see the module-level comments on each field below
//      for exactly what stayed heuristic vs. what became `reference`.
//
// Provenance hierarchy this file demonstrates end to end:
//   heuristic archetype default -> reference geometry (this checkpoint)
//   -> visual/field (not yet done for 77th St) -> measured (not yet done)
//
// ── Real coordinate + identity (authority) ──────────────────────────────────
// wall/data/subway/mtaSubwayStaticSnapshot.json: stops[] station-level record
// {stopId:"R43", stopName:"77 St", lat:40.629742, lon:-74.02551,
//  locationType:1, complexId:"37"} — confirmed directly against the
// committed snapshot during this checkpoint's own recon. Note this is the
// Brooklyn R43 "77 St" (BMT Fourth Avenue Line) — the snapshot also contains
// an entirely unrelated Queens "77 St" (stopId "627", Astoria Line); the two
// were disambiguated by borough/route before use.
//
// ── Real orientation derivation (authority, not hand-typed, not copied) ─────
// The same snapshot's shapes["R..N27R"] contains R43's own exact coordinate
// as shape point index 2 (distance 0 — confirmed directly). This module
// re-derives R43's own real longitudinal bearing from that same shape's own
// points immediately surrounding index 2 (indices 1 and 3) via
// computeBearingDeg() — genuinely computed here, not reused from Bay Ridge
// Av's own orientation constant (which happens to be derived from an
// adjacent, overlapping window of the same real shape — index 3 in THIS
// derivation is in fact Bay Ridge Av's own real coordinate, since 77th St
// and Bay Ridge Av are real, adjacent stations on the same physical track;
// using a real neighboring station's real point as a bracketing neighbor is
// the same honest method already used throughout this whole arc, not a
// shortcut that copies Bay Ridge Av's geometry).
import {
  computeBearingDeg,
  makeStationOriginAnchor,
  toStationLocal,
} from "./stationGeometryCoordinates";
import { instantiateStationArchetype } from "./stationArchetypeInstantiate";
import { UG_SIDE_2TRACK_ARCHETYPE_ID } from "../../data/stationArchetypeTypes";
import type { StationGeometryData } from "../../data/stationGeometryTypes";

const R43_GTFS_STOP_ID = "R43";
const R43_LATITUDE = 40.629742;
const R43_LONGITUDE = -74.02551;

/**
 * Real GTFS shape points from shapes["R..N27R"], indices 1-3 (R43 itself is
 * index 2). Index 3 is Bay Ridge Av's own real coordinate — a real adjacent
 * station's point, used here only as a real bracketing neighbor (see header).
 */
export const R43_SOURCE_SHAPE_EXCERPT = {
  shapeId: "R..N27R",
  points: [
    { idx: 1, latitude: 40.622687, longitude: -74.028398 },
    { idx: 2, latitude: 40.629742, longitude: -74.02551 }, // R43 itself
    { idx: 3, latitude: 40.634967, longitude: -74.023377 }, // Bay Ridge Av's real point, used only as a real neighbor
  ],
} as const;

/** Real, derived (not hand-typed, not copied from Bay Ridge Av) — expect ~17.2°, consistent with the same straight NNE segment of the 4th Ave Line. */
export const R43_DERIVED_ORIENTATION_DEG = computeBearingDeg(
  R43_SOURCE_SHAPE_EXCERPT.points[0],
  R43_SOURCE_SHAPE_EXCERPT.points[2],
);

export const R43_ORIGIN_ANCHOR = makeStationOriginAnchor({
  longitude: R43_LONGITUDE,
  latitude: R43_LATITUDE,
  altitudeM: 0,
  orientationDeg: R43_DERIVED_ORIENTATION_DEG,
});

// ── OSM-sourced platform/track geometry (reference) ─────────────────────────
// Queried the same way as Bay Ridge Av's own Calibration Pass 01 (public
// Overpass API, read-only, no wall/ coupling) — a SEPARATE query, SEPARATE
// OSM ways, independently confirming or contradicting the "already supports"
// evidence this checkpoint's own spec listed.
const R43_OSM_QUERY_NOTE =
  "OpenStreetMap via Overpass API (overpass-api.de), queried 2026-09-09, around:150m of 40.629742,-74.02551";

/** OSM way 907185082, tags: railway=platform, gtfs:stop_id=R43N, source=estimated. */
const OSM_R43_NORTHBOUND_PLATFORM_POLYGON = [
  { latitude: 40.6290042, longitude: -74.0257803 },
  { latitude: 40.6289948, longitude: -74.0257387 },
  { latitude: 40.6305811, longitude: -74.0250904 },
  { latitude: 40.6305899, longitude: -74.0251326 },
] as const;

/** OSM way 907185083, tags: railway=platform, gtfs:stop_id=R43S, source=estimated. */
const OSM_R43_SOUTHBOUND_PLATFORM_POLYGON = [
  { latitude: 40.6290214, longitude: -74.0258578 },
  { latitude: 40.6290309, longitude: -74.0258996 },
  { latitude: 40.6306156, longitude: -74.0252521 },
  { latitude: 40.6306064, longitude: -74.0252104 },
] as const;

/** OSM way 46340163, railway:track_ref=2 (same physical way Bay Ridge Av uses — a different, independently-read point pair, near R43 not R42). */
const OSM_R43_NORTHBOUND_TRACK_POINTS = [
  { latitude: 40.6290081, longitude: -74.0257978 },
  { latitude: 40.6305935, longitude: -74.0251501 },
] as const;

/** OSM way 817936181, railway:track_ref=1 — same note as above. */
const OSM_R43_SOUTHBOUND_TRACK_POINTS = [
  { latitude: 40.6290175, longitude: -74.0258404 },
  { latitude: 40.6306026, longitude: -74.0251929 },
] as const;

const REFERENCE_SOURCES =
  "https://en.wikipedia.org/wiki/77th_Street_station_(BMT_Fourth_Avenue_Line) ; https://nycsubway.org/wiki/BMT_4th_Avenue_Line";

const MEZZANINE_LEVEL_ID = `level:${R43_GTFS_STOP_ID}:mezzanine`;
const PLATFORM_LEVEL_ID = `level:${R43_GTFS_STOP_ID}:platform`;
const NORTHBOUND_PLATFORM_ID = `platform:${R43_GTFS_STOP_ID}:northbound`;
const SOUTHBOUND_PLATFORM_ID = `platform:${R43_GTFS_STOP_ID}:southbound`;
const NORTHBOUND_TRACK_ID = `track:${R43_GTFS_STOP_ID}:northbound`;
const SOUTHBOUND_TRACK_ID = `track:${R43_GTFS_STOP_ID}:southbound`;

/**
 * The one canonical V0 StationGeometryData record for 77th Street —
 * bootstrapped from UG_SIDE_2TRACK, then overlaid with real, independently-
 * established evidence. See this file's own header for the exact two-step
 * process. Structural arrays not mentioned below (entrances, wallSurfaces)
 * stay exactly as the archetype bootstrap left them — genuinely empty, out
 * of scope for this checkpoint just as they are for Bay Ridge Av.
 */
export function build77thStreetStationGeometrySeed(now: string = new Date().toISOString()): StationGeometryData {
  // ── Step 1: bootstrap from the archetype (pure heuristic shell) ──────────
  const bootstrapped = instantiateStationArchetype({
    archetypeId: UG_SIDE_2TRACK_ARCHETYPE_ID,
    stationRef: { gtfsStopId: R43_GTFS_STOP_ID, routeIds: ["R"] },
    origin: {
      longitude: R43_ORIGIN_ANCHOR.longitude,
      latitude: R43_ORIGIN_ANCHOR.latitude,
      altitudeM: R43_ORIGIN_ANCHOR.altitudeM,
      orientationDeg: R43_ORIGIN_ANCHOR.orientationDeg,
      provenance: {
        source: "authority",
        confidence: 1,
        sourceRef: "wall/data/subway/mtaSubwayStaticSnapshot.json stops[stopId=R43]; shapes[R..N27R] idx 1,3",
        note: "Coordinate is the real station-level stop record. Orientation is a real bearing independently computed from the same shape's own real points straddling this station (never copied from Bay Ridge Av's own orientation constant, though the two are naturally close — same physical track).",
      },
    },
    now,
  });

  // ── Step 2: replace archetype heuristics with real, R43-specific evidence ─
  return {
    ...bootstrapped,
    levels: [
      // elevationM intentionally OMITTED for both (not left at the
      // archetype's fabricated heuristic number) — no real depth
      // measurement exists for 77th St, same genuine gap as Bay Ridge Av.
      // What IS real and independently confirmed: that a mezzanine and a
      // platform level exist at all, and that the mezzanine sits at the
      // SOUTH end (distinct fact from Bay Ridge Av's own, independently
      // sourced here).
      {
        id: MEZZANINE_LEVEL_ID,
        kind: "mezzanine",
        label: "Mezzanine (south end)",
        provenance: {
          source: "reference",
          sourceRef: REFERENCE_SOURCES,
          note: "Mezzanine sits at the south end above the platforms/tracks, with two staircases (one per platform) up to a shared waiting area/turnstile bank — confirmed by two independent reference sources. Elevation not measured (heuristic archetype default deliberately NOT carried over — see this file's own header).",
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
        footprint: OSM_R43_NORTHBOUND_PLATFORM_POLYGON.map((p) => toStationLocal(R43_ORIGIN_ANCHOR, p)),
        provenance: {
          source: "reference",
          confidence: 0.35,
          sourceRef: `OSM way 907185082 (railway=platform, gtfs:stop_id=R43N, source=estimated); ${R43_OSM_QUERY_NOTE}`,
          note: "Northbound (Manhattan-bound) side platform — reference sources describe it as WIDER and mostly columnless (a few columns mid-platform and at the ends), reserved space for a never-built express trackway. Footprint polygon is OSM's own self-labeled ESTIMATE. Length (~185m) is close to but NOT identical to this station's own Wikipedia-sourced renovation-history figure (495ft+85ft=580ft/176.8m) — a ~5% gap, larger than Bay Ridge Av's own <1% agreement on the same kind of comparison — see this seed's evidenceConflicts for the length discrepancy this checkpoint found. OSM's own two platform widths came back nearly equal (~3.73m each), the same known limitation already documented for Bay Ridge Av; do not treat either OSM width as settling the width comparison.",
        },
      },
      {
        id: SOUTHBOUND_PLATFORM_ID,
        levelId: PLATFORM_LEVEL_ID,
        config: "side",
        servesRouteIds: ["R"],
        footprint: OSM_R43_SOUTHBOUND_PLATFORM_POLYGON.map((p) => toStationLocal(R43_ORIGIN_ANCHOR, p)),
        provenance: {
          source: "reference",
          confidence: 0.35,
          sourceRef: `OSM way 907185083 (railway=platform, gtfs:stop_id=R43S, source=estimated); ${R43_OSM_QUERY_NOTE}`,
          note: "Southbound (Bay Ridge-bound) side platform, with columns along its full length. Also has a real, independently-sourced NORTH-END EXIT-ONLY relationship not present on the northbound side: a single platform-level exit-only turnstile leads to a stair up to the NW corner of 76th St & 4th Ave (\"iron maiden\"-style egress-only, per nycsubway.org) — an observed relationship only, not an authored StationEntrance (entrances remain out of scope for this checkpoint, same as Bay Ridge Av). Footprint polygon is OSM's own self-labeled ESTIMATE — see the northbound platform's own note for the same length/width caveats.",
        },
      },
    ],
    trackCenterlines: [
      {
        id: NORTHBOUND_TRACK_ID,
        platformId: NORTHBOUND_PLATFORM_ID,
        localPoints: OSM_R43_NORTHBOUND_TRACK_POINTS.map((p) => toStationLocal(R43_ORIGIN_ANCHOR, p)),
        provenance: {
          source: "reference",
          confidence: 0.48,
          sourceRef: `OSM way 46340163 (railway=subway, railway:track_ref=2, NOT tagged source=estimated); ${R43_OSM_QUERY_NOTE}`,
          note: "Logical northbound running track, independently read near R43 (not reused from Bay Ridge Av's own reading of the same way further along the line). Real lateral spacing from the southbound track (~3.75m) and outboard gap from this platform's own near edge (~1.48m) are both physically plausible and consistent with Bay Ridge Av's own independently-derived figures for the same physical track — a real, useful cross-station consistency check, not evidence copied between the two. No gtfsShapeRef: GTFS shapes remain alignment references only and were not consulted for this track's lateral position.",
        },
      },
      {
        id: SOUTHBOUND_TRACK_ID,
        platformId: SOUTHBOUND_PLATFORM_ID,
        localPoints: OSM_R43_SOUTHBOUND_TRACK_POINTS.map((p) => toStationLocal(R43_ORIGIN_ANCHOR, p)),
        provenance: {
          source: "reference",
          confidence: 0.48,
          sourceRef: `OSM way 817936181 (railway=subway, railway:track_ref=1, NOT tagged source=estimated); ${R43_OSM_QUERY_NOTE}`,
          note: "Logical southbound running track, independently read near R43. See the northbound track's own note for the cross-station consistency check performed this checkpoint.",
        },
      },
    ],
    connections: [
      {
        id: `connection:${R43_GTFS_STOP_ID}:mezzanine-platform-northbound`,
        fromLevelId: MEZZANINE_LEVEL_ID,
        toLevelId: PLATFORM_LEVEL_ID,
        kind: "stairs",
        relatedPlatformId: NORTHBOUND_PLATFORM_ID,
        provenance: {
          source: "reference",
          sourceRef: REFERENCE_SOURCES,
          note: "Staircase from the mezzanine down to the northbound platform, per reference sources. No field/visual pass has been done for 77th St, so — unlike Bay Ridge Av — no per-side circulation-continuity character (lane count, intrusion, etc.) is claimed here; that would require the same kind of field observation Bay Ridge Av separately received.",
        },
      },
      {
        id: `connection:${R43_GTFS_STOP_ID}:mezzanine-platform-southbound`,
        fromLevelId: MEZZANINE_LEVEL_ID,
        toLevelId: PLATFORM_LEVEL_ID,
        kind: "stairs",
        relatedPlatformId: SOUTHBOUND_PLATFORM_ID,
        provenance: {
          source: "reference",
          sourceRef: REFERENCE_SOURCES,
          note: "Staircase from the mezzanine down to the southbound platform, per reference sources. See the northbound connection's own note on the absence of field-level circulation detail for this station.",
        },
      },
    ],
    platformLinks: [
      {
        id: `platformLink:${R43_GTFS_STOP_ID}:crossover`,
        platformIds: [NORTHBOUND_PLATFORM_ID, SOUTHBOUND_PLATFORM_ID],
        kind: "crossover",
        approximatePosition: "south",
        provenance: {
          source: "reference",
          confidence: 0.6,
          sourceRef: REFERENCE_SOURCES,
          note: "Unlike Bay Ridge Av (where the crossover mechanism was ambiguous until a later visual pass), reference sources for 77th St are explicit: 'two staircases from each platform go up to a waiting area/crossover' at the south end — the mechanism (via the mezzanine) is reference-confirmed, not just inferred, hence the higher confidence than Bay Ridge Av's own pre-photo-pass value. Real south platform edge sits at local X ≈ -85.3m (independently derived from this station's own OSM footprint, not copied from Bay Ridge Av's own -65.5m figure) — 'south end' means near that X value; no source supports a tighter interior zone.",
        },
      },
    ],
    evidenceConflicts: [
      {
        id: `evidenceConflict:${R43_GTFS_STOP_ID}:platformLengthDiscrepancy`,
        affectedField: "platforms[northbound/southbound].footprint length",
        conflictingEvidence: [
          {
            description:
              "Wikipedia renovation history: original 495ft (151m) platforms, extended 85ft (26m) in 1968-1970 -> total ~580ft (176.8m)",
            sourceRef: "https://en.wikipedia.org/wiki/77th_Street_station_(BMT_Fourth_Avenue_Line)",
          },
          {
            description: "OSM platform footprint polygons (both platforms) independently measure ~185m (~607ft) long",
            sourceRef: `OSM way 907185082 (R43N) & way 907185083 (R43S); ${R43_OSM_QUERY_NOTE}`,
          },
        ],
        status: "unresolved",
        note: "A real, newly-found discrepancy (~9m / ~30ft, ~5%) — notably LARGER than Bay Ridge Av's own equivalent length cross-validation, which agreed to <1%. Neither source is obviously wrong: Wikipedia's figure is a historical renovation record (could be stale, superseded, or measured to a different reference edge), OSM's is a self-labeled estimate. Left unresolved rather than averaged or silently preferring one; a field measurement (see the field calibration checklist pattern already used for Bay Ridge Av) would be the concrete next step to resolve it.",
      },
    ],
  };
}

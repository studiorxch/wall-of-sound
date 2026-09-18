// ── 53rd Street (R40) station geometry seed ───────────────────────────────────
// 0909_WOS_Subway_53rd_Street_4Track_Archetype_Bootstrap_v1.0.0
//
// The first real exercise of the UG_SIDE_4TRACK archetype bootstrap workflow
// — mirrors stationGeometry77thStreetSeed.ts's own two-step discipline
// exactly:
//
//   1. deriveUndergroundSide4TrackGeometry() — a pure `heuristic` shell,
//      anchored at 53rd Street's own real coordinate/orientation. (Called
//      directly rather than through instantiateStationArchetype(), which
//      today only dispatches UG_SIDE_2TRACK — extending it to a second
//      archetype is a real, separate design decision this checkpoint's own
//      "do not modify the archetype unless 53rd exposes a real deficiency"
//      instruction did not ask for, so it was deliberately left alone. This
//      module reproduces the same envelope-assembly instantiateStationArchetype()
//      does, inline, for the 4-track case.)
//   2. Real, INDEPENDENTLY-established evidence for 53rd Street (never
//      copied from stationGeometryBayRidgeAvSeed.ts or
//      stationGeometry77thStreetSeed.ts — this module imports neither)
//      REPLACES the archetype's heuristic platforms, track centerlines,
//      levels, and connections field by field.
//
// Provenance hierarchy this file demonstrates:
//   heuristic archetype default -> reference geometry (this checkpoint)
//   -> visual/field (not yet done) -> measured (not yet done)
//
// ── Real coordinate + identity (authority) ──────────────────────────────────
// wall/data/subway/mtaSubwayStaticSnapshot.json: stops[] station-level record
// {stopId:"R40", stopName:"53 St", lat:40.645069, lon:-74.014034,
//  locationType:1, complexId:"34"} — confirmed directly against the
// committed snapshot during this checkpoint's own recon.
//
// ── Real orientation derivation (authority, not hand-typed, not copied) ─────
// shapes["R..N27R"] contains R40's own exact coordinate as shape point index
// 22. This module re-derives R40's own real bearing from that same shape's
// own points immediately surrounding index 22 (indices 21 and 23) via
// computeBearingDeg() — genuinely computed here. Note this segment of the
// 4th Ave Line curves relative to the Bay Ridge Av/77th St segment (the
// line bends toward downtown Brooklyn further north) — the real derived
// value here (~38.3 degrees) is meaningfully different from Bay Ridge Av's
// (~17.2 degrees), which is itself evidence this was independently derived,
// not reused.
//
// ── Independently-confirmed 4-track structure (authority-grade, not assumed) ─
// Before trusting the archetype's own "4 tracks" assumption, this checkpoint
// queried OSM directly and found FOUR physically distinct track ways
// (railway:track_ref 1, 2, 3, 4) within 150m of R40's own coordinate — Bay
// Ridge Av and 77th St, by contrast, only ever had two (track_ref 1, 2) in
// the same kind of query. This is real, independent, geometric confirmation
// that UG_SIDE_4TRACK is the right starting shell for this station, not an
// assumption taken on faith from the governing spec.
import {
  computeBearingDeg,
  makeStationOriginAnchor,
  toStationLocal,
} from "./stationGeometryCoordinates";
import { deriveUndergroundSide4TrackGeometry } from "./stationArchetypeUndergroundSide4Track";
import { DEFAULT_UG_SIDE_4TRACK_PARAMETERS } from "../../data/stationArchetypeTypes";
import { makeStationGeometryId, type StationGeometryData } from "../../data/stationGeometryTypes";

const R40_GTFS_STOP_ID = "R40";
const R40_LATITUDE = 40.645069;
const R40_LONGITUDE = -74.014034;

/** Real GTFS shape points from shapes["R..N27R"], indices 21-23 (R40 itself is index 22). */
export const R40_SOURCE_SHAPE_EXCERPT = {
  shapeId: "R..N27R",
  points: [
    { idx: 21, latitude: 40.641362, longitude: -74.017881 },
    { idx: 22, latitude: 40.645069, longitude: -74.014034 }, // R40 itself
    { idx: 23, latitude: 40.648939, longitude: -74.010006 },
  ],
} as const;

/** Real, derived (not hand-typed, not copied from any other station) — expect ~38.3 degrees, a real, different bearing from Bay Ridge Av's ~17.2 or 77th St's ~17.24, reflecting this segment's real curve. */
export const R40_DERIVED_ORIENTATION_DEG = computeBearingDeg(
  R40_SOURCE_SHAPE_EXCERPT.points[0],
  R40_SOURCE_SHAPE_EXCERPT.points[2],
);

export const R40_ORIGIN_ANCHOR = makeStationOriginAnchor({
  longitude: R40_LONGITUDE,
  latitude: R40_LATITUDE,
  altitudeM: 0,
  orientationDeg: R40_DERIVED_ORIENTATION_DEG,
});

// ── OSM-sourced platform/track geometry (reference) ─────────────────────────
const R40_OSM_QUERY_NOTE =
  "OpenStreetMap via Overpass API (overpass-api.de), queried 2026-09-09, around:150m of 40.645069,-74.014034";

/** OSM way 907183316, tags: railway=platform, gtfs:stop_id=R40N, source=estimated. Real 5-vertex digitization (not simplified to 4) — the extra mid-edge vertex is preserved faithfully. */
const OSM_R40_NORTHBOUND_PLATFORM_POLYGON = [
  { latitude: 40.6444986, longitude: -74.0145288 },
  { latitude: 40.6444789, longitude: -74.0144938 },
  { latitude: 40.6457905, longitude: -74.013129 },
  { latitude: 40.6458103, longitude: -74.0131637 },
  { latitude: 40.6452226, longitude: -74.0137754 },
] as const;

/** OSM way 907183315, tags: railway=platform, gtfs:stop_id=R40S, source=estimated. */
const OSM_R40_SOUTHBOUND_PLATFORM_POLYGON = [
  { latitude: 40.6458883, longitude: -74.0133012 },
  { latitude: 40.6459077, longitude: -74.0133367 },
  { latitude: 40.6445957, longitude: -74.0147012 },
  { latitude: 40.6445761, longitude: -74.0146667 },
] as const;

/**
 * OSM way 817936156, railway:track_ref=2 — the northbound LOCAL track.
 * Real points close to R40 (~76-110m away) — same high-confidence bracketing
 * pattern already used for Bay Ridge Av/77th St's own local tracks.
 */
const OSM_R40_NORTHBOUND_LOCAL_TRACK_POINTS = [
  { latitude: 40.6445068, longitude: -74.0145434 },
  { latitude: 40.6458187, longitude: -74.0131783 },
] as const;

/** OSM way 817936151, railway:track_ref=1 — the southbound LOCAL track. Same high-confidence pattern. */
const OSM_R40_SOUTHBOUND_LOCAL_TRACK_POINTS = [
  { latitude: 40.6445677, longitude: -74.014652 },
  { latitude: 40.6458802, longitude: -74.0132863 },
] as const;

/**
 * OSM way 46340164, railway:track_ref=4 — the northbound EXPRESS track.
 * IMPORTANT LIMITATION, recorded honestly: this way's own real vertices
 * have a large gap through R40's own location — the nearest real points are
 * 445m and 631m away (both south of the station), with the next vertex
 * jumping over 1.5km further north. There is no close bracketing pair the
 * way the local tracks have. The station-local Y position used here is a
 * LINEAR EXTRAPOLATION of those two distant real points to X=0, not a
 * direct close reading — hence the meaningfully lower confidence on this
 * track's provenance versus the local tracks.
 */
const OSM_R40_NORTHBOUND_EXPRESS_TRACK_POINTS = [
  { latitude: 40.6406113, longitude: -74.0186502 },
  { latitude: 40.6419199, longitude: -74.0172879 },
] as const;

/** OSM way 817936182, railway:track_ref=3 — the southbound EXPRESS track. Same extrapolation limitation as the northbound express track above. */
const OSM_R40_SOUTHBOUND_EXPRESS_TRACK_POINTS = [
  { latitude: 40.6406318, longitude: -74.0186862 },
  { latitude: 40.6419406, longitude: -74.017325 },
] as const;

const REFERENCE_SOURCES =
  "https://en.wikipedia.org/wiki/53rd_Street_station_(BMT_Fourth_Avenue_Line) ; https://nycsubway.org/wiki/BMT_4th_Avenue_Line";

const MEZZANINE_LEVEL_ID = `level:${R40_GTFS_STOP_ID}:mezzanine`;
const PLATFORM_LEVEL_ID = `level:${R40_GTFS_STOP_ID}:platform`;
const NORTHBOUND_PLATFORM_ID = `platform:${R40_GTFS_STOP_ID}:northbound`;
const SOUTHBOUND_PLATFORM_ID = `platform:${R40_GTFS_STOP_ID}:southbound`;

/**
 * The one canonical V0 StationGeometryData record for 53rd Street —
 * bootstrapped from UG_SIDE_4TRACK's own pure derivation, then overlaid
 * with real, independently-established evidence. See this file's own
 * header for the exact process. entrances/wallSurfaces stay genuinely
 * empty — out of scope, same as every other station in this arc.
 */
export function build53rdStreetStationGeometrySeed(now: string = new Date().toISOString()): StationGeometryData {
  // ── Step 1: bootstrap from the archetype's own pure derivation ───────────
  const bootstrapped = deriveUndergroundSide4TrackGeometry(DEFAULT_UG_SIDE_4TRACK_PARAMETERS, R40_GTFS_STOP_ID);
  // Every field below replaces the bootstrap outright — but the bootstrap's
  // own shape (record counts) is still a real, useful sanity check: if
  // R40's real evidence didn't match UG_SIDE_4TRACK's own template shape,
  // that would mean this archetype was the wrong starting shell for this
  // station, not something to silently paper over.
  if (bootstrapped.trackCenterlines.length !== 4 || bootstrapped.platforms.length !== 2) {
    throw new Error("build53rdStreetStationGeometrySeed: UG_SIDE_4TRACK's own template shape changed unexpectedly");
  }

  // ── Step 2: replace archetype heuristics with real, R40-specific evidence ─
  return {
    id: makeStationGeometryId(R40_GTFS_STOP_ID),
    stationRef: { gtfsStopId: R40_GTFS_STOP_ID, routeIds: ["R"] },
    version: 1,
    createdAt: now,
    updatedAt: now,
    origin: {
      longitude: R40_ORIGIN_ANCHOR.longitude,
      latitude: R40_ORIGIN_ANCHOR.latitude,
      altitudeM: R40_ORIGIN_ANCHOR.altitudeM,
      orientationDeg: R40_ORIGIN_ANCHOR.orientationDeg,
      provenance: {
        source: "authority",
        confidence: 1,
        sourceRef: "wall/data/subway/mtaSubwayStaticSnapshot.json stops[stopId=R40]; shapes[R..N27R] idx 21,23",
        note: "Coordinate is the real station-level stop record. Orientation is a real bearing independently computed from the same shape's own real points straddling this station (never copied from Bay Ridge Av's or 77th Street's own orientation constants — this segment of the line genuinely curves relative to those).",
      },
    },
    levels: [
      {
        id: MEZZANINE_LEVEL_ID,
        kind: "mezzanine",
        label: "Mezzanine (south end)",
        // elevationM intentionally OMITTED — bootstrapped.levels' fabricated
        // heuristic number deliberately NOT carried over; no real depth
        // measurement exists for R40.
        provenance: {
          source: "reference",
          sourceRef: REFERENCE_SOURCES,
          note: "Mezzanine sits at the south end (\"an odd jog in the passageway leading to fare control\"), allowing transfer between directions — a real crossover. Confirmed by two independent reference sources.",
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
        footprint: OSM_R40_NORTHBOUND_PLATFORM_POLYGON.map((p) => toStationLocal(R40_ORIGIN_ANCHOR, p)),
        provenance: {
          source: "reference",
          confidence: 0.35,
          sourceRef: `OSM way 907183316 (railway=platform, gtfs:stop_id=R40N, source=estimated); ${R40_OSM_QUERY_NOTE}`,
          note: "Northbound (Manhattan-bound) side platform, columns painted black. Footprint polygon is OSM's own self-labeled ESTIMATE (real 5-vertex digitization, preserved as-is rather than simplified to a rectangle). Length (~186m) is consistent with the ~185-187m range independently found at both Bay Ridge Av and 77th St on this same line.",
        },
      },
      {
        id: SOUTHBOUND_PLATFORM_ID,
        levelId: PLATFORM_LEVEL_ID,
        config: "side",
        servesRouteIds: ["R"],
        footprint: OSM_R40_SOUTHBOUND_PLATFORM_POLYGON.map((p) => toStationLocal(R40_ORIGIN_ANCHOR, p)),
        provenance: {
          source: "reference",
          confidence: 0.35,
          sourceRef: `OSM way 907183315 (railway=platform, gtfs:stop_id=R40S, source=estimated); ${R40_OSM_QUERY_NOTE}`,
          note: "Southbound (Bay Ridge-bound) side platform, columns painted black. Also has a real, independently-sourced NORTH-END EXIT-ONLY relationship not present on the northbound side: 'two platform-level turnstiles' near the north end lead to a three-flight stair up to 52nd St & 4th Ave — corroborated independently by both reference sources (Wikipedia's own southbound-specific description and nycsubway.org's 'iron maiden' north exit) — an observed relationship only, not an authored StationEntrance (entrances remain out of scope, same as Bay Ridge Av/77th St). Footprint polygon is OSM's own self-labeled ESTIMATE.",
        },
      },
    ],
    trackCenterlines: [
      {
        id: `track:${R40_GTFS_STOP_ID}:northboundLocal`,
        role: "northboundLocal",
        platformId: NORTHBOUND_PLATFORM_ID,
        localPoints: OSM_R40_NORTHBOUND_LOCAL_TRACK_POINTS.map((p) => toStationLocal(R40_ORIGIN_ANCHOR, p)),
        provenance: {
          source: "reference",
          confidence: 0.48,
          sourceRef: `OSM way 817936156 (railway=subway, railway:track_ref=2, NOT tagged source=estimated); ${R40_OSM_QUERY_NOTE}`,
          note: "Outer, platform-serving LOCAL track. Real points close to the station (~76-110m), same confidence tier as Bay Ridge Av/77th St's own local tracks. Outboard gap from the northbound platform's own near edge is ~1.5m — physically plausible and consistent with both other stations on this line.",
        },
      },
      {
        id: `track:${R40_GTFS_STOP_ID}:northboundExpress`,
        role: "northboundExpress",
        platformId: null,
        localPoints: OSM_R40_NORTHBOUND_EXPRESS_TRACK_POINTS.map((p) => toStationLocal(R40_ORIGIN_ANCHOR, p)),
        provenance: {
          source: "reference",
          confidence: 0.3,
          sourceRef: `OSM way 46340164 (railway=subway, railway:track_ref=4, NOT tagged source=estimated) — LINEAR EXTRAPOLATION from real points 445-631m away, real digitization has a gap through R40's own location; ${R40_OSM_QUERY_NOTE}`,
          note: "Inner, BYPASS express track — serves no platform (platformId is null). Lower confidence than the local tracks: no close bracketing points exist in OSM's own digitization near R40 for this track, so its station-local Y here is a linear extrapolation of the nearest real points, not a direct close reading. The archetype's own default expressPairSpacing (4m heuristic) is close to (within ~3%) the real ~4.1m gap this extrapolation implies between the two express tracks — a real, useful sanity check, not proof of precision.",
        },
      },
      {
        id: `track:${R40_GTFS_STOP_ID}:southboundExpress`,
        role: "southboundExpress",
        platformId: null,
        localPoints: OSM_R40_SOUTHBOUND_EXPRESS_TRACK_POINTS.map((p) => toStationLocal(R40_ORIGIN_ANCHOR, p)),
        provenance: {
          source: "reference",
          confidence: 0.3,
          sourceRef: `OSM way 817936182 (railway=subway, railway:track_ref=3, NOT tagged source=estimated) — LINEAR EXTRAPOLATION from real points 445-631m away; ${R40_OSM_QUERY_NOTE}`,
          note: "Inner, BYPASS express track — serves no platform (platformId is null). See the northbound express track's own note for the same extrapolation limitation.",
        },
      },
      {
        id: `track:${R40_GTFS_STOP_ID}:southboundLocal`,
        role: "southboundLocal",
        platformId: SOUTHBOUND_PLATFORM_ID,
        localPoints: OSM_R40_SOUTHBOUND_LOCAL_TRACK_POINTS.map((p) => toStationLocal(R40_ORIGIN_ANCHOR, p)),
        provenance: {
          source: "reference",
          confidence: 0.48,
          sourceRef: `OSM way 817936151 (railway=subway, railway:track_ref=1, NOT tagged source=estimated); ${R40_OSM_QUERY_NOTE}`,
          note: "Outer, platform-serving LOCAL track. Real points close to the station (~76-110m). Outboard gap from the southbound platform's own near edge is ~1.5m, consistent with the northbound side and with Bay Ridge Av/77th St.",
        },
      },
    ],
    connections: [
      {
        id: `connection:${R40_GTFS_STOP_ID}:mezzanine-platform-northbound`,
        fromLevelId: MEZZANINE_LEVEL_ID,
        toLevelId: PLATFORM_LEVEL_ID,
        kind: "stairs",
        relatedPlatformId: NORTHBOUND_PLATFORM_ID,
        provenance: {
          source: "reference",
          sourceRef: REFERENCE_SOURCES,
          note: "Staircase from the mezzanine down to the northbound platform ('two staircases to each platform'), per reference sources. No field/visual pass has been done for 53rd St, so no per-side circulation-continuity character is claimed here.",
        },
      },
      {
        id: `connection:${R40_GTFS_STOP_ID}:mezzanine-platform-southbound`,
        fromLevelId: MEZZANINE_LEVEL_ID,
        toLevelId: PLATFORM_LEVEL_ID,
        kind: "stairs",
        relatedPlatformId: SOUTHBOUND_PLATFORM_ID,
        provenance: {
          source: "reference",
          sourceRef: REFERENCE_SOURCES,
          note: "Staircase from the mezzanine down to the southbound platform, per reference sources.",
        },
      },
    ],
    platformLinks: [
      {
        id: `platformLink:${R40_GTFS_STOP_ID}:crossover`,
        platformIds: [NORTHBOUND_PLATFORM_ID, SOUTHBOUND_PLATFORM_ID],
        kind: "crossover",
        approximatePosition: "south",
        provenance: {
          source: "reference",
          confidence: 0.6,
          sourceRef: REFERENCE_SOURCES,
          note: "nycsubway.org is explicit: crossover is located at the south exit, via the south-end mezzanine ('allows transfer between directions') — mechanism reference-confirmed, not just inferred, same higher-confidence pattern as 77th St's own crossover.",
        },
      },
    ],
    evidenceConflicts: [
      {
        id: `evidenceConflict:${R40_GTFS_STOP_ID}:trackCount`,
        affectedField: "trackCenterlines.length (2 vs 4 physical tracks)",
        conflictingEvidence: [
          {
            description: "Wikipedia's own dedicated 53rd Street article states this is a '4 tracks and 2 side platforms' local station",
            sourceRef: "https://en.wikipedia.org/wiki/53rd_Street_station_(BMT_Fourth_Avenue_Line)",
          },
          {
            description:
              "OSM independently contains FOUR distinct, separately-digitized railway=subway ways (track_ref 1,2,3,4) within 150m of R40 — real geometric evidence, not a text claim",
            sourceRef: `OSM ways 817936151, 817936156, 817936182, 46340164; ${R40_OSM_QUERY_NOTE}`,
          },
          {
            description:
              "A nycsubway.org fetch during this checkpoint's own research returned a '2 tracks' summary for this station, contradicting both sources above",
            sourceRef: "https://nycsubway.org/wiki/BMT_4th_Avenue_Line (fetched summary, 2026-09-09)",
          },
        ],
        status: "unresolved",
        note: "Not auto-resolved, though the weight of evidence (a dedicated Wikipedia article's own explicit statement + real, independent OSM geometric digitization of 4 separate track ways) favors 4 tracks. The '2 tracks' claim is suspected to be a summarization artifact from nycsubway.org's own long, multi-station BMT_4th_Avenue_Line page (a similar cross-station content bleed was independently observed and confirmed during the 77th Street checkpoint's own research) rather than a genuine, deliberate claim about R40 specifically — but this is a suspicion, not a verified fact, so the conflict is preserved rather than silently resolved by reasoning alone. This checkpoint proceeded with the UG_SIDE_4TRACK archetype on the strength of the other two sources, while leaving this record open.",
      },
    ],
    entrances: [],
    wallSurfaces: [],
  };
}

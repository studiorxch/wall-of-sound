// ── Bay Ridge Av (R42) station geometry seed ──────────────────────────────────
// 0907_WOS_Subway_Bay_Ridge_Av_Station_Geometry_v1.0.0 — checkpoint 1.
//
// The one canonical V0 station-geometry record this checkpoint ships.
// Everything here is either:
//   - a real value read directly from an existing repository authority
//     (station identity/coordinate: wall/data/subway/mtaSubwayStaticSnapshot
//     .json's own stops[]; orientation: the same file's own shapes, via a
//     real computed bearing — never typed by hand), or
//   - an explicitly labeled heuristic (altitude=0 as a street-level
//     convention) with its own Provenance saying so, or
//   - (checkpoint 2) a real fact from an external reference source
//     (Wikipedia, nycsubway.org — see this checkpoint's own evidence
//     report), sourced per-record via provenance.sourceRef.
// Checkpoint 2 (renumbered "checkpoint 4" in later session reports) adds
// real TOPOLOGY only: two side platforms, two logical running tracks (each
// with a GTFS shape ALIGNMENT REFERENCE, never physical centerline
// geometry), a shared platform level, a mezzanine, the mezzanine<->
// platform-level connection, and a south-end platform crossover link.
//
// Checkpoint 5 ("Calibration Pass 01") adds real PLATFORM-PLAN GEOMETRY:
// both platform footprints and both track centerlines, sourced from
// OpenStreetMap (a source distinct from both wall/'s GTFS snapshot and the
// Wikipedia/nycsubway.org reference sources above) — see the OSM section
// below for the full source breakdown, confidence levels, and the specific
// length-validates/width-conflicts and track-spacing-defensibility findings.
// Level elevations, mezzanine polygon, and stair/crossover path geometry
// remain genuinely unauthored — omitted per stationGeometryTypes.ts's own
// field docs, never defaulted into looking like measured facts.
// Entrances stay empty — out of scope for this whole arc.
//
// STATION-11 (0915_WOS_Subway_Bay_Ridge_Av_Structural_Truth_Enrichment_v1.0.0)
// adds a real surface level (station stack: surface -> mezzanine -> platform,
// field-confirmed real entrances on both sides, no stair geometry linking
// it yet), two real circulation/asymmetry provenance notes (northbound
// comparatively columnless; a field-observed 20-step platform<->mezzanine
// stair run on the northbound side), and the first two real wallSurfaces
// records (each side platform's own back wall) — IDENTITY and RELATIONSHIP
// only, no real polygon yet. See docs/architecture/subway/README.md's
// "STATION-11" section for the full evidence matrix and gap analysis.
//
// ── Real coordinate (authority) ─────────────────────────────────────────────
// wall/data/subway/mtaSubwayStaticSnapshot.json: stops[] station-level record
// {stopId:"R42", stopName:"Bay Ridge Av", lat:40.634967, lon:-74.023377,
//  locationType:1, complexId:"36"} — confirmed against the committed
// snapshot directly during this checkpoint's own recon; complex 36 is a
// real single-station, R-only complex ({"routes":["R"], "ada":"0"}).
//
// ── Real orientation derivation (authority, not hand-typed) ─────────────────
// The same snapshot's shapes["R..N27R"] (a real northbound R-line/4th Ave
// Line GTFS shape) contains R42's own exact coordinate as shape point index
// 3 (distance 0 — confirmed directly against the committed file). This
// module re-derives the station's real longitudinal bearing from that same
// shape's own points immediately surrounding index 3 (indices 2 and 4 —
// real track geometry either side of the station, never the station's own
// point paired with itself), via computeBearingDeg() — a real, reusable
// function this checkpoint also ships, not a value computed once outside
// the codebase and pasted in. If the source shape excerpt below were ever
// wrong, re-running this same derivation against corrected points would
// automatically produce a corrected orientation.
import { computeBearingDeg, makeStationOriginAnchor, toStationLocal } from "./stationGeometryCoordinates";
import { makeStationGeometryId, type LocalPoint2D, type StationGeometryData } from "../../data/stationGeometryTypes";

/**
 * Real GTFS shape points from wall/data/subway/mtaSubwayStaticSnapshot.json
 * shapes["R..N27R"], indices 2-4 (R42 itself is index 3, included for
 * traceability though the bearing is computed from its two real
 * neighbors, not from R42 paired with itself). Stored as {longitude,
 * latitude} here (the source file's own [lat, lon] pairs, relabeled) —
 * never re-fetched or re-derived from a second source.
 */
export const BAY_RIDGE_AV_SOURCE_SHAPE_EXCERPT = {
  shapeId: "R..N27R",
  points: [
    { idx: 2, latitude: 40.629742, longitude: -74.02551 },
    { idx: 3, latitude: 40.634967, longitude: -74.023377 }, // R42 itself
    { idx: 4, latitude: 40.636436, longitude: -74.022774 },
  ],
} as const;

/**
 * The real southbound counterpart excerpt (shapes["R..S27R"], idx 189-191)
 * — used ONLY as this checkpoint's editor track-alignment GUIDE for the
 * southbound logical track, never as physical centerline evidence. This
 * checkpoint's own orientation cross-validation (see
 * stationGeometryCoordinates.test.ts) already established that these are
 * the same real physical points as the northbound excerpt above, in
 * reverse publishing order — expected for the same physical rail.
 */
export const BAY_RIDGE_AV_SOUTHBOUND_SOURCE_SHAPE_EXCERPT = {
  shapeId: "R..S27R",
  points: [
    { idx: 189, latitude: 40.636436, longitude: -74.022774 },
    { idx: 190, latitude: 40.634967, longitude: -74.023377 }, // R42 itself
    { idx: 191, latitude: 40.629742, longitude: -74.02551 },
  ],
} as const;

/**
 * The real, derived longitudinal bearing for Bay Ridge Av — computed here,
 * at module load, from the real shape excerpt above (idx 2 -> idx 4,
 * straddling R42), never a hand-typed constant. Expect ~17.2 degrees
 * (north-northeast) — consistent with the real-world 4th Avenue Line
 * alignment through Sunset Park/Bay Ridge, Brooklyn.
 */
export const BAY_RIDGE_AV_DERIVED_ORIENTATION_DEG = computeBearingDeg(
  BAY_RIDGE_AV_SOURCE_SHAPE_EXCERPT.points[0],
  BAY_RIDGE_AV_SOURCE_SHAPE_EXCERPT.points[2],
);

// ── OSM-sourced platform/track geometry (checkpoint 5 — Calibration Pass 01) ─
// Real, independently-digitized geometry from OpenStreetMap (queried via the
// public Overpass API, https://overpass-api.de/api/interpreter — read-only,
// no wall/ or repo-authority coupling). Two DISTINCT OSM feature types were
// found near R42, with two DIFFERENT confidence profiles — never blended
// into one number:
//
// 1. PLATFORM footprints (way 907184533 "R42N", way 907184532 "R42S") — each
//    way's own tags include `"source": "estimated"` (OSM's own admission
//    this is NOT a survey). Cross-validated well on LENGTH against this
//    checkpoint's own earlier Wikipedia-sourced ~615ft figure (both derive
//    ~186m / ~610ft, <1% apart) — but WIDTH came back nearly IDENTICAL for
//    both platforms (~3.7m each), which conflicts with the well-sourced
//    qualitative fact (Wikipedia + nycsubway.org, checkpoint 3) that the
//    northbound platform is real-world WIDER. Authored anyway (a real,
//    reference-sourced polygon is more defensible than nothing), but at
//    deliberately LOW confidence, with this exact discrepancy stated in each
//    platform's own provenance note — never silently promoted to "measured."
//
// 2. TRACK centerline points (way 46340163 railway:track_ref=2, way
//    817936181 railway:track_ref=1) — a genuinely SEPARATE OSM dataset (real
//    subway track alignment, not platform outlines), NOT tagged "estimated".
//    Near R42 they sit at real, distinct lateral (Y) offsets from each
//    other (~3.75m apart) and each sits plausibly just outboard of its own
//    adjacent platform's near edge (~1.5m gap, consistent on both sides) —
//    a real physical-plausibility cross-check this checkpoint performed
//    directly. This is what makes the physical track centerlines
//    DEFENSIBLE this checkpoint, per the spec's own explicit conditional —
//    critically, this offset comes from OSM's own separately-tagged track
//    ways, NEVER derived from the GTFS shapes (R..N27R/R..S27R remain
//    alignment references only, unchanged from checkpoint 4).
const BAY_RIDGE_AV_OSM_QUERY_NOTE =
  "OpenStreetMap via Overpass API (overpass-api.de), queried 2026-09-08, around:150m of 40.634967,-74.023377";

/** OSM way 907184533, tags: railway=platform, gtfs:stop_id=R42N, source=estimated. */
const OSM_NORTHBOUND_PLATFORM_POLYGON = [
  { latitude: 40.6343986, longitude: -74.0235762 },
  { latitude: 40.6343887, longitude: -74.0235345 },
  { latitude: 40.6359851, longitude: -74.0228818 },
  { latitude: 40.6359947, longitude: -74.0229237 },
] as const;

/** OSM way 907184532, tags: railway=platform, gtfs:stop_id=R42S, source=estimated. */
const OSM_SOUTHBOUND_PLATFORM_POLYGON = [
  { latitude: 40.6360126, longitude: -74.023001 },
  { latitude: 40.6360223, longitude: -74.0230431 },
  { latitude: 40.6344257, longitude: -74.0236955 },
  { latitude: 40.634416, longitude: -74.0236535 },
] as const;

/** OSM way 46340163, railway:track_ref=2 (adjacent to the northbound platform's near edge). */
const OSM_NORTHBOUND_TRACK_POINTS = [
  { latitude: 40.6344027, longitude: -74.0235935 },
  { latitude: 40.6359987, longitude: -74.0229411 },
] as const;

/** OSM way 817936181, railway:track_ref=1 (adjacent to the southbound platform's near edge). */
const OSM_SOUTHBOUND_TRACK_POINTS = [
  { latitude: 40.634412, longitude: -74.0236362 },
  { latitude: 40.6360085, longitude: -74.0229841 },
] as const;

const BAY_RIDGE_AV_GTFS_STOP_ID = "R42";

export const BAY_RIDGE_AV_ORIGIN_ANCHOR = makeStationOriginAnchor({
  longitude: -74.023377,
  latitude: 40.634967,
  altitudeM: 0,
  orientationDeg: BAY_RIDGE_AV_DERIVED_ORIENTATION_DEG,
});

// ── Topology (checkpoint 2) ─────────────────────────────────────────────────
// Real-world facts below come from external reference sources (Wikipedia,
// nycsubway.org — see this checkpoint's own evidence report), not from
// wall/'s GTFS snapshot; each record's provenance.sourceRef names its
// source. Deliberately NOT authored this checkpoint: platform footprints,
// platform widths/dimensions, track spacing/offsets, level elevations,
// mezzanine polygon, stair/crossover path geometry — all omitted (not
// defaulted to empty arrays or fabricated numbers) per the model's own
// updated field comments in stationGeometryTypes.ts.

const REFERENCE_SOURCES =
  "https://en.wikipedia.org/wiki/Bay_Ridge_Avenue_station ; https://nycsubway.org/wiki/BMT_4th_Avenue_Line";

const SURFACE_LEVEL_ID = "level:R42:surface";
const MEZZANINE_LEVEL_ID = "level:R42:mezzanine";
const PLATFORM_LEVEL_ID = "level:R42:platform"; // shared by both platforms — "common passenger platform level"
const NORTHBOUND_PLATFORM_ID = "platform:R42:northbound";
const SOUTHBOUND_PLATFORM_ID = "platform:R42:southbound";
const NORTHBOUND_TRACK_ID = "track:R42:northbound";
const SOUTHBOUND_TRACK_ID = "track:R42:southbound";
// STATION-11 (0915_WOS_Subway_Bay_Ridge_Av_Structural_Truth_Enrichment_v1.0.0)
// -- each side platform's own back wall (the long edge opposite its
// track-facing side). Real, field-evidenced structural IDENTITY; no real
// polygon exists yet (localPolygon intentionally omitted -- see
// StationWallSurface's own doc in stationGeometryTypes.ts). See this
// checkpoint's own evidence matrix in docs/architecture/subway/README.md's
// "STATION-11" section for exactly what is and isn't supported.
const NORTHBOUND_BACK_WALL_ID = "wall:R42:northbound-back";
const SOUTHBOUND_BACK_WALL_ID = "wall:R42:southbound-back";

const FIELD_OBSERVATION_SOURCES =
  "WOS-share/SUBWAY/FIELD/BAY_RIDGE_AV/0908_Bay_Ridge_Av_Field_Observations.md ; WOS-share/SUBWAY/BUILDS/0908_WOS_Subway_Bay_Ridge_Av_Visual_Field_Observations_v1.0.0.md ; User field observation, 2026-09-09 (Bay Ridge Av Circulation/Topology Observation Pass)";

/**
 * The one canonical StationGeometryData record for Bay Ridge Av. `id`/
 * `stationRef` are deterministic from the real GTFS stop id — never an
 * arbitrary random id (see makeStationGeometryId's own doc), and every
 * platform/track/level/wall id is a stable, role-based string (e.g.
 * `platform:R42:northbound`) that has never changed across any checkpoint
 * in this arc, including this one (STATION-11 is purely additive — zero
 * existing ids renamed, zero existing fields removed). Topology reflects
 * this codebase's own accumulated evidence-backed research; entrances
 * remain genuinely empty — out of scope for this whole arc.
 */
export function buildBayRidgeAvStationGeometrySeed(now: string = new Date().toISOString()): StationGeometryData {
  return {
    id: makeStationGeometryId(BAY_RIDGE_AV_GTFS_STOP_ID),
    stationRef: { gtfsStopId: BAY_RIDGE_AV_GTFS_STOP_ID, routeIds: ["R"] },
    version: 1,
    createdAt: now,
    updatedAt: now,
    origin: {
      longitude: BAY_RIDGE_AV_ORIGIN_ANCHOR.longitude,
      latitude: BAY_RIDGE_AV_ORIGIN_ANCHOR.latitude,
      altitudeM: BAY_RIDGE_AV_ORIGIN_ANCHOR.altitudeM,
      orientationDeg: BAY_RIDGE_AV_ORIGIN_ANCHOR.orientationDeg,
      provenance: {
        source: "authority",
        confidence: 1,
        sourceRef: "wall/data/subway/mtaSubwayStaticSnapshot.json stops[stopId=R42]; shapes[R..N27R] idx 2,4",
        note: "Coordinate is the real station-level stop record. Orientation is a real bearing computed from the same shape's own real points straddling this station, not authored by hand.",
      },
    },
    levels: [
      // STATION-11 -- the real station stack's third level (surface ->
      // mezzanine/fare control -> platform). Field photos directly confirm
      // real street-level entrances exist on both the northbound and
      // southbound sides (plus a separate southbound rear exit — see that
      // platform's own note below); no stair/connection geometry links this
      // level to the mezzanine yet (that would need the same kind of
      // position evidence the field calibration survey's own item 7 asks
      // for), so it is authored unconnected rather than wired to a guessed
      // position. elevationM follows this codebase's own existing
      // convention (0 = the same reference plane as origin.altitudeM) —
      // the same heuristic every archetype's own surface level already
      // uses, never a measured value.
      {
        id: SURFACE_LEVEL_ID,
        kind: "surface",
        label: "Surface",
        elevationM: 0,
        provenance: {
          source: "heuristic",
          sourceRef: FIELD_OBSERVATION_SOURCES,
          note: "Surface level, by convention the same reference plane as origin.altitudeM (0) — that convention itself is heuristic, not measured. Real street-level entrances are field-confirmed on both the northbound and southbound sides, plus a separate southbound rear exit (see sourceRef; also platforms[].provenance.note for the rear-exit relationship); no stair/connection geometry down to the mezzanine is authored yet.",
        },
      },
      {
        id: MEZZANINE_LEVEL_ID,
        kind: "mezzanine",
        label: "Mezzanine",
        // elevationM intentionally omitted — no measured/sourced value exists.
        provenance: {
          source: "reference",
          sourceRef: REFERENCE_SOURCES,
          note: "Full mezzanine above the platforms, confirmed by two independent reference sources.",
        },
      },
      {
        id: PLATFORM_LEVEL_ID,
        kind: "platform",
        label: "Platform level",
        provenance: {
          source: "reference",
          sourceRef: REFERENCE_SOURCES,
          note: "Both side platforms sit at one common passenger platform level (not separately-elevated platforms).",
        },
      },
    ],
    platforms: [
      {
        id: NORTHBOUND_PLATFORM_ID,
        levelId: PLATFORM_LEVEL_ID,
        config: "side",
        servesRouteIds: ["R"],
        footprint: OSM_NORTHBOUND_PLATFORM_POLYGON.map((p) => toStationLocal(BAY_RIDGE_AV_ORIGIN_ANCHOR, p)),
        provenance: {
          source: "reference",
          confidence: 0.35,
          sourceRef: `OSM way 907184533 (railway=platform, gtfs:stop_id=R42N, source=estimated); ${BAY_RIDGE_AV_OSM_QUERY_NOTE}`,
          note: "Northbound (Manhattan-bound) side platform. Footprint polygon is OSM's own self-labeled ESTIMATE, not a survey. Length (~186m) cross-validates within <1% of this station's own Wikipedia-sourced ~615ft renovation record (checkpoint 3) — but width (~3.7m) came back nearly identical to the southbound platform's OSM width, which conflicts with the well-sourced qualitative fact that this platform is real-world WIDER (reserved space for a never-built express trackway). Treat the LENGTH as reasonably defensible and the WIDTH as low-confidence pending a real source. STATION-11 field observation (no measurement): comparatively open/columnless along its length, contrasting with the southbound platform's own dense column rhythm (see that platform's own note) — qualitative only, no column count or spacing asserted.",
        },
      },
      {
        id: SOUTHBOUND_PLATFORM_ID,
        levelId: PLATFORM_LEVEL_ID,
        config: "side",
        servesRouteIds: ["R"],
        footprint: OSM_SOUTHBOUND_PLATFORM_POLYGON.map((p) => toStationLocal(BAY_RIDGE_AV_ORIGIN_ANCHOR, p)),
        provenance: {
          source: "reference",
          confidence: 0.35,
          sourceRef: `OSM way 907184532 (railway=platform, gtfs:stop_id=R42S, source=estimated); ${BAY_RIDGE_AV_OSM_QUERY_NOTE}`,
          note: "Southbound (95th St-bound) side platform, with columns along its full length. Footprint polygon is OSM's own self-labeled ESTIMATE, not a survey — see the northbound platform's own note for the same length-validates/width-conflicts caveat (this platform's OSM width should read as NARROWER than northbound per reference sources, but OSM's two estimated widths came back nearly equal; do not treat either OSM width as settling that comparison). Circulation/Topology Observation Pass (2026-09-09, field observation, no measurement): southbound has a rear-exit relationship not present on the northbound side — an observed relationship only, not an authored StationEntrance (entrances remain out of scope for this whole arc); no position or geometry implied.",
        },
      },
    ],
    trackCenterlines: [
      {
        id: NORTHBOUND_TRACK_ID,
        platformId: NORTHBOUND_PLATFORM_ID,
        localPoints: OSM_NORTHBOUND_TRACK_POINTS.map((p) => toStationLocal(BAY_RIDGE_AV_ORIGIN_ANCHOR, p)),
        gtfsShapeRef: { shapeId: "R..N27R", fromIdx: 2, toIdx: 4 },
        provenance: {
          source: "reference",
          confidence: 0.48,
          sourceRef: `OSM way 46340163 (railway=subway, railway:track_ref=2, NOT tagged source=estimated); ${BAY_RIDGE_AV_OSM_QUERY_NOTE}`,
          note: "Logical northbound running track. localPoints come from a SEPARATE OSM dataset (real track alignment, not platform outlines, and not self-flagged 'estimated' the way the platform polygons are) — near R42 it sits ~3.75m laterally from the southbound track and ~1.5m outboard of this platform's own near edge, both physically plausible and mutually consistent, which is what makes this centerline defensible per this checkpoint's own explicit conditional. Still NOT survey-grade. gtfsShapeRef remains a station alignment reference only — see stationGeometryTypes.ts's own StationTrackCenterline doc — and was NOT the source of this lateral offset (GTFS shapes carry no lateral spacing at all; see checkpoint 4's cross-validation).",
        },
      },
      {
        id: SOUTHBOUND_TRACK_ID,
        platformId: SOUTHBOUND_PLATFORM_ID,
        localPoints: OSM_SOUTHBOUND_TRACK_POINTS.map((p) => toStationLocal(BAY_RIDGE_AV_ORIGIN_ANCHOR, p)),
        gtfsShapeRef: { shapeId: "R..S27R", fromIdx: 189, toIdx: 191 },
        provenance: {
          source: "reference",
          confidence: 0.48,
          sourceRef: `OSM way 817936181 (railway=subway, railway:track_ref=1, NOT tagged source=estimated); ${BAY_RIDGE_AV_OSM_QUERY_NOTE}`,
          note: "Logical southbound running track. localPoints come from the same separate, non-'estimated'-tagged OSM track dataset as the northbound track — see its own note for the physical-plausibility cross-check performed this checkpoint. gtfsShapeRef remains an alignment reference only; this checkpoint's own earlier cross-validation already confirmed R..S27R/R..N27R coincide near the station (no lateral spacing information in either GTFS shape) — the real lateral offset used here comes entirely from the separate OSM track ways, never from GTFS.",
        },
      },
    ],
    connections: [
      // Split (2026-09-09, Circulation/Topology Observation Pass) from a
      // single shared "mezzanine<->platform level" record into one per
      // platform side — the two real staircases have distinct, field-
      // observed circulation character (one preserves two lanes, the other
      // interrupts to one), which a single shared record couldn't express.
      // Both still connect the same two levels; only relatedPlatformId (new
      // this pass) and each record's own provenance differ. No lane
      // geometry, no coordinates, no new connection kind — kind stays
      // "stairs", localPath stays omitted on both.
      {
        id: "connection:R42:mezzanine-platform-northbound",
        fromLevelId: MEZZANINE_LEVEL_ID,
        toLevelId: PLATFORM_LEVEL_ID,
        kind: "stairs",
        relatedPlatformId: NORTHBOUND_PLATFORM_ID,
        // localPath intentionally omitted — no physical stair geometry authored yet.
        provenance: {
          source: "reference",
          sourceRef: `${REFERENCE_SOURCES} ; User field observation, 2026-09-09 (Bay Ridge Av Circulation/Topology Observation Pass)`,
          note: "Mezzanine connects down to the northbound platform via a staircase, per reference sources (exact position not established). Field observation (2026-09-09, qualitative, no measurement): on this side, stair circulation continues directly into the platform path, effectively preserving two circulation lanes — no lane count, width, or position is asserted as a number. STATION-11 field observation (photo IMG_1186, 0908_Bay_Ridge_Av_Field_Observations.md): a single flight of 20 steps separates the platform from the mezzanine landing on this side — a directly observed stair-run COUNT only, never converted into an elevation value (that would also require the mezzanine's own depth below street, which remains unestablished — see the field calibration survey's own item 5 for what a full measured depth would require).",
        },
      },
      {
        id: "connection:R42:mezzanine-platform-southbound",
        fromLevelId: MEZZANINE_LEVEL_ID,
        toLevelId: PLATFORM_LEVEL_ID,
        kind: "stairs",
        relatedPlatformId: SOUTHBOUND_PLATFORM_ID,
        provenance: {
          source: "reference",
          sourceRef: `${REFERENCE_SOURCES} ; User field observation, 2026-09-09 (Bay Ridge Av Circulation/Topology Observation Pass)`,
          note: "Mezzanine connects down to the southbound platform via a staircase, per reference sources (exact position not established). Field observation (2026-09-09, qualitative, no measurement): on this side, the stair geometry interrupts that continuity, leaving effectively one main circulation lane — no lane count, width, or position is asserted as a number.",
        },
      },
    ],
    platformLinks: [
      {
        id: "platformLink:R42:crossover",
        platformIds: [NORTHBOUND_PLATFORM_ID, SOUTHBOUND_PLATFORM_ID],
        kind: "crossover",
        approximatePosition: "south",
        provenance: {
          source: "reference",
          confidence: 0.55,
          sourceRef: `${REFERENCE_SOURCES} ; WOS-share/SUBWAY/BUILDS/0908_WOS_Subway_Bay_Ridge_Av_Visual_Field_Observations_v1.0.0.md (IMG_1111, IMG_1112, IMG_1113, IMG_1188)`,
          note: "Reference sources describe 'a mezzanine and crossover' at the south end; exact longitudinal position remains unestablished (still ≈X<-65.5m at best, per checkpoint 5's own note below). Visual Calibration Pass (2026-09-08): field photos show ordinary platform-to-mezzanine stairs on BOTH sides (IMG_1111 southbound, IMG_1112/1113 northbound) feeding one unified, walkable paid mezzanine area (IMG_1188 panorama, token booth, turnstiles) — no separate crossunder passage is visible anywhere in the photo set. This is a VISUAL OBSERVATION, not a measurement, but it meaningfully raises confidence that the crossover mechanism is 'via the mezzanine' rather than a separate crossunder — the ambiguity this record previously flagged as entirely unresolved. Checkpoint 5 note (unchanged): now that both platform footprints are authored (from OSM's own estimated polygons), their real south edge sits at local X ≈ -65.5m — 'south end' means near that X value, though no source supports a specific interior zone width, so no numeric zone was added to this record.",
        },
      },
    ],
    evidenceConflicts: [
      {
        id: "evidenceConflict:R42:platformWidthAsymmetry",
        affectedField: "platforms[northbound/southbound].footprint width",
        conflictingEvidence: [
          {
            description:
              "OSM platform footprint polygons imply approximately SYMMETRIC widths (~3.7m each, <1% apart)",
            sourceRef: "OSM way 907184533 (R42N) & way 907184532 (R42S), both tagged source=estimated",
          },
          {
            description:
              "Historical/reference station descriptions state the NORTHBOUND platform is WIDER than the southbound platform (reserved space for a never-built express trackway)",
            sourceRef: "https://en.wikipedia.org/wiki/Bay_Ridge_Avenue_station ; https://nycsubway.org/wiki/BMT_4th_Avenue_Line",
          },
          {
            description:
              "VISUAL OBSERVATION (not a measurement): field photos support the northbound-wider reading — northbound platform photographed as visually broad and open; southbound photographed as visibly narrower with a dense cylindrical-column rhythm along its length. Explicitly weak evidence per the source document's own rules ('photo evidence weakly suggests... northbound platform width may exceed southbound width') — raises confidence toward the reference-source side without resolving the conflict.",
            sourceRef: "WOS-share/SUBWAY/BUILDS/0908_WOS_Subway_Bay_Ridge_Av_Visual_Field_Observations_v1.0.0.md (IMG_1115, IMG_1167 northbound; IMG_1169, IMG_1175 southbound)",
          },
          {
            description:
              "FIELD-CONFIRMED (2026-09-09, direct on-site observation, no instrument/measurement): northbound platform is wider than southbound. This is a direct visual confirmation by a person standing at the station, distinct from and stronger than the earlier photo-interpretation entry above — but still qualitative: it confirms DIRECTION only, not a width value in any unit.",
            sourceRef: "User field observation, 2026-09-09 (Bay Ridge Av Circulation/Topology Observation Pass)",
          },
        ],
        status: "resolved",
        note: "DIRECTION resolved (2026-09-09): a direct field observation confirms the northbound platform is genuinely wider, matching the historical/reference sources and contradicting OSM's estimated (self-labeled) symmetric polygons — OSM's width estimate is now considered inaccurate on this specific point, though its LENGTH figure remains independently well-validated (see checkpoint 5) and its polygons are not being discarded, just no longer trusted for width. MAGNITUDE remains unresolved: no numeric width exists for either platform, and none was fabricated to close this out — see the field calibration checklist (item 1/2) for what a real measurement would still add. Each platform's own provenance.note is unchanged by this resolution; only this conflict record's status moved.",
      },
    ],
    entrances: [],
    // STATION-11 -- each side platform's own real back wall. Structural
    // IDENTITY and RELATIONSHIP are field-evidenced (a platform's own back
    // wall, opposite its track-facing edge, is inherent to how a side
    // platform is physically bounded, and field photos directly show each
    // one — see FIELD_OBSERVATION_SOURCES). No real polygon has been
    // authored (localPolygon omitted — see that field's own doc) — this
    // records the wall's existence and which platform it belongs to, NOT
    // its geometry. `suitableForArt` is an explicit, undecided placeholder
    // (`false`) — a curation decision this batch does not make, never
    // promoted to a researched fact. Neither wall is trackside
    // (`adjacentTrackId` stays omitted); `adjacentPlatformId` disambiguates
    // which of the two same-level platforms each wall belongs to (both
    // platforms share `PLATFORM_LEVEL_ID`, so `levelId` alone cannot).
    wallSurfaces: [
      {
        id: NORTHBOUND_BACK_WALL_ID,
        levelId: PLATFORM_LEVEL_ID,
        label: "Northbound platform back wall",
        suitableForArt: false,
        adjacentPlatformId: NORTHBOUND_PLATFORM_ID,
        provenance: {
          source: "reference",
          confidence: 0.4,
          sourceRef: FIELD_OBSERVATION_SOURCES,
          note: "The northbound platform's own back wall (opposite its track-facing edge) — field-confirmed to exist via on-site photos; no real polygon authored (geometry remains unmeasured, see the field calibration survey's own item 1, which targets exactly this wall's own position). suitableForArt is an undecided placeholder (false), not a curation decision.",
        },
      },
      {
        id: SOUTHBOUND_BACK_WALL_ID,
        levelId: PLATFORM_LEVEL_ID,
        label: "Southbound platform back wall",
        suitableForArt: false,
        adjacentPlatformId: SOUTHBOUND_PLATFORM_ID,
        provenance: {
          source: "reference",
          confidence: 0.4,
          sourceRef: FIELD_OBSERVATION_SOURCES,
          note: "The southbound platform's own back wall (opposite its track-facing edge) — field-confirmed to exist via on-site photos; no real polygon authored (geometry remains unmeasured, see the field calibration survey's own item 2, which targets exactly this wall's own position). suitableForArt is an undecided placeholder (false), not a curation decision.",
        },
      },
    ],
  };
}

/**
 * Station-local ALIGNMENT GUIDE points for each logical track — for the
 * editor's plan view only. Built by projecting the same real, already-
 * embedded GTFS excerpt points (above) through the station's own origin
 * anchor. This is NOT physical track-centerline geometry: it exists purely
 * so the editor can draw a muted reference line showing roughly where each
 * track's real-world alignment runs near the station, distinctly styled
 * from authored platform footprints. See StationTrackCenterline's own
 * gtfsShapeRef doc in stationGeometryTypes.ts for the same distinction.
 */
export function buildBayRidgeAvTrackAlignmentGuides(): Array<{ trackId: string; points: LocalPoint2D[] }> {
  return [
    {
      trackId: NORTHBOUND_TRACK_ID,
      points: BAY_RIDGE_AV_SOURCE_SHAPE_EXCERPT.points.map((p) => toStationLocal(BAY_RIDGE_AV_ORIGIN_ANCHOR, p)),
    },
    {
      trackId: SOUTHBOUND_TRACK_ID,
      points: BAY_RIDGE_AV_SOUTHBOUND_SOURCE_SHAPE_EXCERPT.points.map((p) =>
        toStationLocal(BAY_RIDGE_AV_ORIGIN_ANCHOR, p),
      ),
    },
  ];
}

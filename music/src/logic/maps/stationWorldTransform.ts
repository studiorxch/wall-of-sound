// ── Station-local → Underground-world transform boundary ───────────────────────
// STATION-15 (0919_WOS_Subway_Tunnel_Vision_3D_Station_Integration_v1.0.0)
//
// The ONE explicit transformation boundary between canonical, representation-
// independent Station Truth/projection (STATION-13/14) and a real-world
// geographic rendering integration (Underground/Tunnel Vision, wall/). Pure,
// zero Three.js dependency, zero Mapbox dependency -- deliberately
// framework-free so it can be bridged across the music/<->wall/ module
// boundary (see station3DBridge.ts) without ever risking a cross-version
// Three.js object-sharing problem (wall/ loads its own global THREE r0.160
// via CDN script tag; music/'s own `three` npm dependency, added in
// STATION-14, is r0.186 -- a real, materially incompatible version gap
// confirmed during this batch's own recon. Keeping this module plain-data-
// only is what makes it safely bridgeable despite that gap).
//
// This module answers exactly the four questions STATION-15's own
// architecture requires, and nothing else:
//   - where is the station origin in the world? (longitude/latitude/altitudeM)
//   - how is station-local +X oriented relative to the real world? (headingDeg)
//   - how are station-local units scaled into world units? (see StationWorldAnchor's own doc -- NOT answered here, deliberately)
//   - which level sits at which depth, when no real elevation exists? (deriveLevelPresentationDepthM)
import type { StationGeometryData } from "../../data/stationGeometryTypes";
import type { ProjectedLevel } from "./stationStructuralProjection3D";

/**
 * Real-world anchor for one station, derived ENTIRELY from fields
 * StationGeometryData.origin already carries -- never a second geographic
 * authority, never hand-typed per station. `origin.longitude`/`latitude`
 * are themselves already sourced from the real GTFS station-stop record
 * (see e.g. stationGeometryBayRidgeAvSeed.ts's own header), and
 * `origin.orientationDeg` is itself already a real, derived route bearing
 * (via computeBearingDeg() against real track-shape geometry, not hand-
 * typed) -- this function performs NO new derivation, it only names which
 * existing canonical fields answer "where" and "which way."
 */
export interface StationWorldAnchor {
  readonly longitude: number;
  readonly latitude: number;
  /** Real meters, same StationGeometryOrigin.altitudeM convention (0 = street level unless otherwise sourced) -- the station's own real-world vertical anchor, never an invented "underground depth." */
  readonly altitudeM: number;
  /** Real compass bearing, 0-360, clockwise from true north -- station-local +X points this way in the real world. */
  readonly headingDeg: number;
}

/**
 * Pure. Generic across any real StationGeometryData -- no archetype id, no
 * gtfsStopId branch, no station-specific logic of any kind. Scale is
 * deliberately NOT answered by this function: the one integration this
 * batch targets (a Mapbox custom layer, wall/systems/presentation/
 * subway3DStationActorLayer.js) already has access to an exact, real,
 * per-station-latitude meters-to-world-units conversion via Mapbox's own
 * `MercatorCoordinate.meterInMercatorCoordinateUnits()` API -- reusing
 * that real, already-correct geographic math at the integration layer is
 * more honest than this module reimplementing (and risking drifting from)
 * Mapbox's own Mercator projection math. Station-local coordinates are
 * already real/estimated METERS (StationGeometryData's own documented
 * unit throughout) -- no separate "presentation scale" multiplier is
 * introduced for this integration; 1 station-local unit = 1 real meter,
 * passed through Mapbox's own real conversion at render time.
 */
export function deriveStationWorldAnchor(geometry: StationGeometryData): StationWorldAnchor {
  return {
    longitude: geometry.origin.longitude,
    latitude: geometry.origin.latitude,
    altitudeM: geometry.origin.altitudeM,
    headingDeg: geometry.origin.orientationDeg,
  };
}

/**
 * Mirrors stationStructure3DScene.ts's own `buildLevelSceneY()` semantics
 * exactly (same constant value, same canonical-vs-presentation rule) --
 * intentionally re-declared here rather than imported from that file,
 * which also imports `three` at module scope; duplicating this one small,
 * stable arithmetic rule keeps this module genuinely dependency-free and
 * therefore safely bridgeable (see this file's own header). If either
 * copy's constant ever needs to change, change both together.
 */
export const LEVEL_PRESENTATION_SPACING_UNITS = 6;

/**
 * Pure. A level's real `canonicalElevationM`, when Base Truth has one, is
 * used directly (already real meters, already using the same
 * "negative = below street" sign convention station-local Z/altitudeM
 * use) -- never converted or scaled. When absent, `presentationStackIndex`
 * (always present, unitless) drives depth instead, scaled by
 * `LEVEL_PRESENTATION_SPACING_UNITS` -- a representation-owned constant,
 * never physical truth, never written back into Station Truth or the
 * projection.
 */
export function deriveLevelPresentationDepthM(level: ProjectedLevel): number {
  if (level.canonicalElevationM !== undefined) return level.canonicalElevationM;
  return -level.presentationStackIndex * LEVEL_PRESENTATION_SPACING_UNITS;
}

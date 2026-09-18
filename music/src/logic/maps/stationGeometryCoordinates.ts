// ── Station-local coordinate transform ────────────────────────────────────────
// 0907_WOS_Subway_Bay_Ridge_Av_Station_Geometry_v1.0.0 — checkpoint 1.
//
// Reuses this codebase's own existing WGS84 <-> local-meter projection
// doctrine (wall/systems/world/roadTopologyAlignment.js's setProjectionAnchor/
// _geoToLocal/_localToGeo: mpdLng = cos(lat)*111320, mpdLat = 111320 — a
// standard equirectangular approximation, accurate at station scale) rather
// than inventing competing projection math. music/src/logic/maps/
// raceLaneGeneration.ts already ports the same formula per-object
// (makeProjectionAnchor minted from a course's own first point); this module
// does the station equivalent — one anchor per station, minted from that
// station's own real coordinate — plus one addition neither existing port
// needed: a real longitudinal ORIENTATION, because a station (unlike a road
// centerline, which IS its own direction at every point) needs one fixed
// authored frame its platforms/levels/stairs all share.
//
// ── STATION-LOCAL COORDINATE CONVENTION ─────────────────────────────────────
// +X = station longitudinal / along-track direction (the real-world compass
//      bearing named by origin.orientationDeg)
// +Y = station lateral / cross-track direction, 90 degrees to the LEFT of
//      +X when facing the +X direction (i.e. the world direction you'd point
//      if you turned your left shoulder while walking along +X) — this is
//      the unique choice that makes (X, Y, Z) a RIGHT-HANDED frame with
//      +Z = up (X × Y = Z), matching the right-handed convention this
//      codebase's own Three.js layers already assume.
// +Z = up (meters above origin.altitudeM)
// Origin = the station's own geographic anchor point, always local (0,0,0).
//
// orientationDeg is a real compass bearing: 0 = true north, measured
// CLOCKWISE, normalized to [0, 360). This is the same winding as ordinary
// compass bearings (and the bearing this file's own computeBearingDeg()
// returns) — never counter-clockwise, never a signed/-180..180 range.
//
// Inverse behavior: converting local -> geographic undoes exactly the
// rotation + translation converting geographic -> local applied, i.e.
// toGeographic(anchor, toStationLocal(anchor, p)) reproduces p (see this
// file's own round-trip tests) — there is no independent "inverse formula
// convention" to separately define beyond "apply the same linear map with
// its own true inverse," which the implementation below does directly
// (rotate by -orientationDeg instead of +orientationDeg, translate by
// -origin instead of +origin).
//
// Scope: pure math only. No storage, no editor, no Mapbox/Three.js — see
// stationGeometryBayRidgeAvSeed.ts for the one seeded station this
// checkpoint ships, and the governing recon for the full future roadmap.

import type { LocalPoint3D } from "../../data/stationGeometryTypes";

export interface GeoPoint {
  longitude: number;
  latitude: number;
  /** Meters — omitted/0 for a purely horizontal point. */
  altitudeM?: number;
}

export interface StationOriginAnchor {
  longitude: number;
  latitude: number;
  altitudeM: number;
  /** Real compass bearing, clockwise from true north, normalized [0,360) at construction. */
  orientationDeg: number;
  /** Meters per degree of longitude at this anchor's latitude — cached, not recomputed per point. */
  metersPerDegreeLongitude: number;
  /** Meters per degree of latitude — constant (WGS84 spherical approximation), kept alongside for symmetry/clarity. */
  metersPerDegreeLatitude: number;
}

const METERS_PER_DEGREE_LATITUDE = 111320; // same constant roadTopologyAlignment.js/raceLaneGeneration.ts already use

/** Normalizes any real number of degrees into [0, 360). */
export function normalizeOrientationDeg(deg: number): number {
  const wrapped = deg % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

/**
 * Real compass bearing (0-360, clockwise from true north) from one
 * geographic point to another — the standard forward-azimuth formula on an
 * equirectangular approximation, consistent with this module's own
 * projection (never the great-circle/spherical bearing formula, which would
 * be inconsistent with the flat local-meter frame everything else here uses
 * at station scale).
 */
export function computeBearingDeg(from: GeoPoint, to: GeoPoint): number {
  const mpdLng = Math.cos((from.latitude * Math.PI) / 180) * METERS_PER_DEGREE_LATITUDE;
  const eastM = (to.longitude - from.longitude) * mpdLng;
  const northM = (to.latitude - from.latitude) * METERS_PER_DEGREE_LATITUDE;
  const bearing = (Math.atan2(eastM, northM) * 180) / Math.PI;
  return normalizeOrientationDeg(bearing);
}

/** Builds a station's own local-coordinate anchor. `orientationDeg` is normalized to [0,360) here, once. */
export function makeStationOriginAnchor(origin: GeoPoint & { orientationDeg: number }): StationOriginAnchor {
  return {
    longitude: origin.longitude,
    latitude: origin.latitude,
    altitudeM: origin.altitudeM ?? 0,
    orientationDeg: normalizeOrientationDeg(origin.orientationDeg),
    metersPerDegreeLongitude: Math.cos((origin.latitude * Math.PI) / 180) * METERS_PER_DEGREE_LATITUDE,
    metersPerDegreeLatitude: METERS_PER_DEGREE_LATITUDE,
  };
}

/**
 * Geographic -> station-local. See this file's header for the full
 * convention. Internally: project to real-world (east, north) meters
 * relative to the anchor (the existing repository doctrine's own
 * _geoToLocal), then rotate that vector into the (along-track, lateral)
 * basis named by orientationDeg.
 */
export function toStationLocal(anchor: StationOriginAnchor, point: GeoPoint): LocalPoint3D {
  const eastM = (point.longitude - anchor.longitude) * anchor.metersPerDegreeLongitude;
  const northM = (point.latitude - anchor.latitude) * anchor.metersPerDegreeLatitude;
  const theta = (anchor.orientationDeg * Math.PI) / 180;
  const sin = Math.sin(theta);
  const cos = Math.cos(theta);
  // Along-track world direction = (sinTheta, cosTheta) in (east, north);
  // lateral (+Y, left-of-travel) world direction = (-cosTheta, sinTheta) —
  // together a right-handed (X, Y, Z-up) basis. Projecting the (east,
  // north) offset onto each via dot product gives local (x, y).
  const x = eastM * sin + northM * cos;
  const y = -eastM * cos + northM * sin;
  const z = (point.altitudeM ?? 0) - anchor.altitudeM;
  return { x, y, z };
}

/** Station-local -> geographic. The exact inverse of toStationLocal() — see this file's header. */
export function toGeographic(anchor: StationOriginAnchor, local: LocalPoint3D): Required<GeoPoint> {
  const theta = (anchor.orientationDeg * Math.PI) / 180;
  const sin = Math.sin(theta);
  const cos = Math.cos(theta);
  // world = x * alongTrackWorld + y * lateralWorld (both unit vectors, so
  // this is a plain basis reconstruction, not a matrix inverse/solve).
  const eastM = local.x * sin - local.y * cos;
  const northM = local.x * cos + local.y * sin;
  return {
    longitude: anchor.longitude + eastM / anchor.metersPerDegreeLongitude,
    latitude: anchor.latitude + northM / anchor.metersPerDegreeLatitude,
    altitudeM: anchor.altitudeM + local.z,
  };
}

// ── Known-station-geometry registry ────────────────────────────────────────────
// STATION-08 (0914_WOS_Subway_First_Platform_Surface_v1.0.0)
//
// The smallest honest lookup Platform needs: "given a real gtfsStopId, is
// there a real, canonical StationGeometryData record for it?" As of this
// checkpoint, exactly one real station has one (Bay Ridge Av / R42 -- see
// docs/architecture/subway/README.md §6/§7, and STATION-05's own recon:
// "No other real station has any StationGeometryData record"). This module
// is NOT a topology model, NOT a second archetype dispatch, and NOT a cache
// -- it is a plain identity -> builder-function map, extended as real seeds
// are authored (STATION-09+), never as a fallback/default mechanism. A
// station with no entry here returns `null` -- Platform's own runtime shows
// an honest "not yet available" state for it, never silently substituting
// Bay Ridge Av or any other station's geometry.
import type { StationGeometryData } from "../../data/stationGeometryTypes";
import { buildBayRidgeAvStationGeometrySeed } from "./stationGeometryBayRidgeAvSeed";

const KNOWN_STATION_GEOMETRY_BUILDERS: Readonly<Record<string, (now?: string) => StationGeometryData>> = {
  R42: buildBayRidgeAvStationGeometrySeed,
};

/**
 * Pure (given a fixed `now`, or accepting `updatedAt`/`createdAt` varying
 * with real time otherwise). Returns `null` for any gtfsStopId with no real
 * canonical geometry record today -- never a fabricated or archetype-
 * generated substitute.
 */
export function resolveKnownStationGeometry(gtfsStopId: string, now?: string): StationGeometryData | null {
  const builder = KNOWN_STATION_GEOMETRY_BUILDERS[gtfsStopId];
  return builder ? builder(now) : null;
}

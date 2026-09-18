// ── Station archetype instantiation ───────────────────────────────────────────
// 0909_WOS_Subway_Underground_Side_Platform_2Track_Archetype_v1.0.0
//
// The smallest function that turns an archetype + a real station's identity/
// anchor into a StationGeometryData-compatible object. Explicit non-goals,
// straight from the governing spec:
//   - NOT a station-type classifier or auto-generator.
//   - NOT applied to any real station automatically or in bulk.
//   - NOT a hidden source of truth — every generated value carries
//     "heuristic" provenance (see stationArchetypeUndergroundSide2Track.ts),
//     so a human calibrating a real station can see at a glance which of its
//     fields are still just archetype defaults.
//   - Does NOT touch Bay Ridge Av's own canonical seed in any way — this
//     module has no import of, or dependency on, stationGeometryBayRidgeAvSeed.ts.
import type { StationGeometryData, StationGeometryStationRef, Provenance } from "../../data/stationGeometryTypes";
import { makeStationGeometryId } from "../../data/stationGeometryTypes";
import {
  DEFAULT_UG_SIDE_2TRACK_PARAMETERS,
  UG_SIDE_2TRACK_ARCHETYPE_ID,
  type StationArchetypeId,
  type UndergroundSide2TrackParameters,
} from "../../data/stationArchetypeTypes";
import { deriveUndergroundSide2TrackGeometry } from "./stationArchetypeUndergroundSide2Track";

export interface InstantiateStationArchetypeOrigin {
  longitude: number;
  latitude: number;
  /** Defaults to 0 (street level), matching this codebase's existing heuristic convention. */
  altitudeM?: number;
  orientationDeg: number;
  /** Defaults to an explicit "heuristic, caller did not specify" provenance rather than silently claiming authority. */
  provenance?: Provenance;
}

export interface InstantiateStationArchetypeInput {
  archetypeId: StationArchetypeId;
  stationRef: StationGeometryStationRef;
  origin: InstantiateStationArchetypeOrigin;
  /** Merged onto DEFAULT_UG_SIDE_2TRACK_PARAMETERS — only the fields a caller wants to override. */
  overrides?: Partial<UndergroundSide2TrackParameters>;
  now?: string;
}

const DEFAULT_ORIGIN_PROVENANCE: Provenance = {
  source: "heuristic",
  note: "Archetype instantiation default — caller did not specify a real origin provenance.",
};

/**
 * Instantiates one archetype into a real StationGeometryData shell. Pure
 * except for the `now`/`Date.now()` timestamp default — identical inputs
 * (including an explicit `now`) always produce an identical result.
 * `platformLinks`/`entrances`/`wallSurfaces` start empty: a crossover is
 * explicitly NOT mandatory for this archetype, and entrances/walls stay out
 * of scope for every checkpoint in this whole arc.
 */
export function instantiateStationArchetype(input: InstantiateStationArchetypeInput): StationGeometryData {
  if (input.archetypeId !== UG_SIDE_2TRACK_ARCHETYPE_ID) {
    throw new Error(
      `instantiateStationArchetype: unsupported archetypeId "${input.archetypeId}" — only "${UG_SIDE_2TRACK_ARCHETYPE_ID}" exists in V0.`,
    );
  }

  const params: UndergroundSide2TrackParameters = {
    ...DEFAULT_UG_SIDE_2TRACK_PARAMETERS,
    ...input.overrides,
  };

  const geometry = deriveUndergroundSide2TrackGeometry(params, input.stationRef.gtfsStopId);
  const now = input.now ?? new Date().toISOString();

  return {
    id: makeStationGeometryId(input.stationRef.gtfsStopId),
    stationRef: input.stationRef,
    version: 1,
    createdAt: now,
    updatedAt: now,
    origin: {
      longitude: input.origin.longitude,
      latitude: input.origin.latitude,
      altitudeM: input.origin.altitudeM ?? 0,
      orientationDeg: input.origin.orientationDeg,
      provenance: input.origin.provenance ?? DEFAULT_ORIGIN_PROVENANCE,
    },
    levels: geometry.levels,
    platforms: geometry.platforms,
    trackCenterlines: geometry.trackCenterlines,
    connections: geometry.connections,
    platformLinks: [],
    evidenceConflicts: [],
    entrances: [],
    wallSurfaces: [],
  };
}

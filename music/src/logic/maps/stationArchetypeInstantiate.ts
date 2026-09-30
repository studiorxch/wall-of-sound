// ── Station archetype instantiation ───────────────────────────────────────────
// 0909_WOS_Subway_Underground_Side_Platform_2Track_Archetype_v1.0.0
// STATION-06 (0912_WOS_Subway_Station_Base_Truth_Extension_v1.0.0) — repairs
// a real, pre-existing dispatch gap: this function used to only ever route
// to UG_SIDE_2TRACK, even though UG_SIDE_4TRACK already existed as its own
// archetype (both real 4-track seeds, 45th/53rd St, had to call
// deriveUndergroundSide4TrackGeometry directly and hand-assemble the
// envelope themselves — see those seed files' own headers, which called
// this "a real, separate design decision not yet made"). Now dispatches all
// three shipped archetypes; every existing caller passing UG_SIDE_2TRACK is
// completely unaffected.
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
  DEFAULT_UG_SIDE_4TRACK_PARAMETERS,
  DEFAULT_UG_ISLAND_2TRACK_PARAMETERS,
  UG_SIDE_2TRACK_ARCHETYPE_ID,
  UG_SIDE_4TRACK_ARCHETYPE_ID,
  UG_ISLAND_2TRACK_ARCHETYPE_ID,
  type StationArchetypeId,
  type UndergroundSide2TrackParameters,
  type UndergroundSide4TrackParameters,
  type UndergroundIsland2TrackParameters,
} from "../../data/stationArchetypeTypes";
import { deriveUndergroundSide2TrackGeometry } from "./stationArchetypeUndergroundSide2Track";
import { deriveUndergroundSide4TrackGeometry } from "./stationArchetypeUndergroundSide4Track";
import { deriveUndergroundIsland2TrackGeometry } from "./stationArchetypeUndergroundIsland2Track";

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
  /**
   * Merged onto the chosen archetype's own DEFAULT_* parameters — only the
   * fields a caller wants to override. The exact shape depends on
   * `archetypeId` (each archetype has its own, incompatible parameter
   * interface — see stationArchetypeTypes.ts); passing overrides shaped for
   * a DIFFERENT archetype than the one requested is a caller error this
   * function cannot statically prevent (archetypeId is a runtime value),
   * but any field name that doesn't exist on the resolved archetype's own
   * parameters is simply ignored by the object spread below, never
   * silently misapplied to the wrong field.
   */
  overrides?: Partial<UndergroundSide2TrackParameters> | Partial<UndergroundSide4TrackParameters> | Partial<UndergroundIsland2TrackParameters>;
  now?: string;
}

const DEFAULT_ORIGIN_PROVENANCE: Provenance = {
  source: "heuristic",
  note: "Archetype instantiation default — caller did not specify a real origin provenance.",
};

interface DerivedGeometry {
  levels: StationGeometryData["levels"];
  platforms: StationGeometryData["platforms"];
  trackCenterlines: StationGeometryData["trackCenterlines"];
  connections: StationGeometryData["connections"];
}

function deriveGeometryForArchetype(
  archetypeId: StationArchetypeId,
  overrides: InstantiateStationArchetypeInput["overrides"],
  idPrefix: string,
): DerivedGeometry {
  if (archetypeId === UG_SIDE_2TRACK_ARCHETYPE_ID) {
    const params: UndergroundSide2TrackParameters = {
      ...DEFAULT_UG_SIDE_2TRACK_PARAMETERS,
      ...(overrides as Partial<UndergroundSide2TrackParameters> | undefined),
    };
    return deriveUndergroundSide2TrackGeometry(params, idPrefix);
  }
  if (archetypeId === UG_SIDE_4TRACK_ARCHETYPE_ID) {
    const params: UndergroundSide4TrackParameters = {
      ...DEFAULT_UG_SIDE_4TRACK_PARAMETERS,
      ...(overrides as Partial<UndergroundSide4TrackParameters> | undefined),
    };
    return deriveUndergroundSide4TrackGeometry(params, idPrefix);
  }
  if (archetypeId === UG_ISLAND_2TRACK_ARCHETYPE_ID) {
    const params: UndergroundIsland2TrackParameters = {
      ...DEFAULT_UG_ISLAND_2TRACK_PARAMETERS,
      ...(overrides as Partial<UndergroundIsland2TrackParameters> | undefined),
    };
    return deriveUndergroundIsland2TrackGeometry(params, idPrefix);
  }
  throw new Error(
    `instantiateStationArchetype: unsupported archetypeId "${archetypeId}" — only "${UG_SIDE_2TRACK_ARCHETYPE_ID}", "${UG_SIDE_4TRACK_ARCHETYPE_ID}", "${UG_ISLAND_2TRACK_ARCHETYPE_ID}" exist.`,
  );
}

/**
 * Instantiates one archetype into a real StationGeometryData shell. Pure
 * except for the `now`/`Date.now()` timestamp default — identical inputs
 * (including an explicit `now`) always produce an identical result.
 * `platformLinks`/`entrances`/`wallSurfaces` start empty: a crossover is
 * explicitly NOT mandatory for any of these archetypes, and entrances/walls
 * stay out of scope for every checkpoint in this whole arc.
 */
export function instantiateStationArchetype(input: InstantiateStationArchetypeInput): StationGeometryData {
  const geometry = deriveGeometryForArchetype(input.archetypeId, input.overrides, input.stationRef.gtfsStopId);
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

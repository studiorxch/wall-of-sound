// ── UG_ISLAND_2TRACK — pure parametric geometry derivation ────────────────────
// STATION-06 (0912_WOS_Subway_Station_Base_Truth_Extension_v1.0.0)
//
// Pure functions only, mirroring stationArchetypeUndergroundSide2Track.ts's
// own conventions exactly (same header discipline, same guard-clause style,
// same heuristic-only provenance). This is a GENUINELY SEPARATE archetype —
// ONE island platform, flanked by two tracks (one per edge) — never
// "UG_SIDE_2TRACK with the platforms swapped for one big one." The two
// canonical edges are explicit, typed values (PlatformSide, from
// stationGeometryTypes.ts) on every generated track centerline that serves
// this platform, not inferred from id strings or Y-sign.
//
// Coordinate convention (reused, not reinvented): +X = along-track, +Y =
// lateral (see stationGeometryCoordinates.ts). This module never touches
// geographic coordinates at all — everything here is already station-local
// meters; geo-anchoring is the instantiation layer's job
// (stationArchetypeInstantiate.ts).
//
// Sign convention: the platform sits centered at Y=0; edge "A" is the
// negative-Y edge, edge "B" is the positive-Y edge — an arbitrary but fixed
// and documented convention, never a claim about compass direction or which
// edge is "northbound." This module has never seen any real station's data
// and must never import from a seed file — its defaults are generic
// placeholders, not a summary of any real station. It also has zero
// dependency on stationArchetypeUndergroundSide2Track.ts/Side4Track.ts —
// all three archetypes are siblings, not variants of one another.
import type {
  LocalPoint2D,
  Provenance,
  StationConnection,
  StationLevel,
  StationPlatform,
  StationTrackCenterline,
} from "../../data/stationGeometryTypes";
import type {
  IslandParameterValidationIssue,
  TrainConsistClearanceInput,
  TrainConsistClearanceResult,
  UndergroundIsland2TrackParameters,
} from "../../data/stationArchetypeTypes";
import { UG_ISLAND_2TRACK_ARCHETYPE_ID } from "../../data/stationArchetypeTypes";

const ARCHETYPE_HEURISTIC_SOURCE_REF = `${UG_ISLAND_2TRACK_ARCHETYPE_ID} default parameters — a generic starting shell, not a real station's data`;

function heuristicProvenance(note: string): Provenance {
  return { source: "heuristic", sourceRef: ARCHETYPE_HEURISTIC_SOURCE_REF, note };
}

/**
 * Validates a parameter set without throwing — an empty array means valid.
 * Rejects rather than silently correcting: non-positive lengths/widths/
 * spacing, and a mezzanine at or below the platform's own elevation.
 */
export function validateUndergroundIsland2TrackParameters(
  params: UndergroundIsland2TrackParameters,
): IslandParameterValidationIssue[] {
  const issues: IslandParameterValidationIssue[] = [];
  const positive: Array<keyof UndergroundIsland2TrackParameters> = [
    "platformLengthM",
    "platformWidthM",
    "platformEdgeToTrackCenterM",
    "mezzanineLengthM",
    "mezzanineWidthM",
  ];
  for (const field of positive) {
    if (!(params[field] > 0)) {
      issues.push({ field, message: `${field} must be a positive number (got ${params[field]})` });
    }
  }
  if (!(params.mezzanineElevationM > params.platformElevationM)) {
    issues.push({
      field: "mezzanineElevationM",
      message: `mezzanineElevationM (${params.mezzanineElevationM}) must be above (greater than) platformElevationM (${params.platformElevationM}) for the conventional surface->mezzanine->platform stack`,
    });
  }
  return issues;
}

/** V0-simplistic, same convention as the other two archetypes: usable length is the full authored platform length. */
export function getUsablePlatformLengthM(params: UndergroundIsland2TrackParameters): number {
  return params.platformLengthM;
}

/** Re-exported unchanged shape from the sibling archetypes' own doctrine. */
export function validateTrainConsistClearance(input: TrainConsistClearanceInput): TrainConsistClearanceResult {
  const issues: string[] = [];
  if (!(input.usablePlatformLengthM > 0)) issues.push("usablePlatformLengthM must be positive");
  if (!(input.trainConsistLengthM > 0)) issues.push("trainConsistLengthM must be positive");
  if (input.stoppingMarginM < 0) issues.push("stoppingMarginM must not be negative");

  const requiredLengthM = input.trainConsistLengthM + Math.max(input.stoppingMarginM, 0);
  if (issues.length > 0) {
    return { ok: false, requiredLengthM, marginRemainingM: NaN, issues };
  }
  const marginRemainingM = input.usablePlatformLengthM - requiredLengthM;
  return { ok: marginRemainingM >= 0, requiredLengthM, marginRemainingM, issues: [] };
}

export interface UndergroundIsland2TrackGeometry {
  levels: StationLevel[];
  platforms: StationPlatform[];
  trackCenterlines: StationTrackCenterline[];
  connections: StationConnection[];
}

/**
 * Derives simple, straight, rectangular UG_ISLAND_2TRACK geometry from
 * `params`, in station-local meters, using `idPrefix` to namespace every
 * generated record id. Throws (does not silently correct) if `params` fails
 * validateUndergroundIsland2TrackParameters.
 */
export function deriveUndergroundIsland2TrackGeometry(
  params: UndergroundIsland2TrackParameters,
  idPrefix: string,
): UndergroundIsland2TrackGeometry {
  const issues = validateUndergroundIsland2TrackParameters(params);
  if (issues.length > 0) {
    throw new Error(
      `deriveUndergroundIsland2TrackGeometry: invalid parameters:\n${issues.map((i) => `- ${i.field}: ${i.message}`).join("\n")}`,
    );
  }

  const xMin = -params.platformLengthM / 2;
  const xMax = params.platformLengthM / 2;

  // The one island platform, centered at Y=0. Edge A = negative Y, edge B =
  // positive Y — structural labels only, see this file's own header.
  const edgeAY = -params.platformWidthM / 2;
  const edgeBY = params.platformWidthM / 2;
  const trackAY = edgeAY - params.platformEdgeToTrackCenterM;
  const trackBY = edgeBY + params.platformEdgeToTrackCenterM;

  const rectangle = (innerY: number, outerY: number): LocalPoint2D[] => [
    { x: xMin, y: innerY },
    { x: xMax, y: innerY },
    { x: xMax, y: outerY },
    { x: xMin, y: outerY },
  ];
  const straightTrack = (y: number): LocalPoint2D[] => [
    { x: xMin, y },
    { x: xMax, y },
  ];

  const surfaceLevelId = `level:${idPrefix}:surface`;
  const mezzanineLevelId = `level:${idPrefix}:mezzanine`;
  const platformLevelId = `level:${idPrefix}:platform`;
  const islandPlatformId = `platform:${idPrefix}:island`;
  const trackAId = `track:${idPrefix}:a`;
  const trackBId = `track:${idPrefix}:b`;

  const levels: StationLevel[] = [
    {
      id: surfaceLevelId,
      kind: "surface",
      label: "Surface",
      elevationM: 0,
      provenance: heuristicProvenance("Surface level, by convention the same reference plane as origin.altitudeM (0)."),
    },
    {
      id: mezzanineLevelId,
      kind: "mezzanine",
      label: "Mezzanine",
      elevationM: params.mezzanineElevationM,
      provenance: heuristicProvenance("Mezzanine elevation is an archetype default parameter, not a measurement."),
    },
    {
      id: platformLevelId,
      kind: "platform",
      label: "Platform level",
      elevationM: params.platformElevationM,
      provenance: heuristicProvenance("Platform elevation is an archetype default parameter, not a measurement."),
    },
  ];

  const platforms: StationPlatform[] = [
    {
      id: islandPlatformId,
      levelId: platformLevelId,
      config: "island",
      servesRouteIds: [],
      footprint: rectangle(edgeAY, edgeBY),
      provenance: heuristicProvenance(
        "Rectangular default footprint derived from platformWidthM/platformLengthM archetype parameters — a generic starting shell, not a real platform's shape.",
      ),
    },
  ];

  const trackCenterlines: StationTrackCenterline[] = [
    {
      id: trackAId,
      platformId: islandPlatformId,
      platformSide: "A",
      localPoints: straightTrack(trackAY),
      provenance: heuristicProvenance(
        "Edge-A track derived from platformWidthM/platformEdgeToTrackCenterM — no GTFS alignment reference, since a generic archetype instance is not tied to any real route's shapes.",
      ),
    },
    {
      id: trackBId,
      platformId: islandPlatformId,
      platformSide: "B",
      localPoints: straightTrack(trackBY),
      provenance: heuristicProvenance(
        "Edge-B track derived from platformWidthM/platformEdgeToTrackCenterM — no GTFS alignment reference, since a generic archetype instance is not tied to any real route's shapes.",
      ),
    },
  ];

  // A single shared connection record — unlike the two side archetypes'
  // per-platform-side pair, there is only ONE platform here, so
  // relatedPlatformId is genuinely inapplicable (never "which side," since
  // there's no second platform to distinguish from) and stays omitted, per
  // StationConnection.relatedPlatformId's own doc ("omit when a connection
  // genuinely serves both/all platforms undifferentiated").
  const connections: StationConnection[] = [
    {
      id: `connection:${idPrefix}:mezzanine-platform`,
      fromLevelId: mezzanineLevelId,
      toLevelId: platformLevelId,
      kind: "stairs",
      provenance: heuristicProvenance(
        "Default stair topology placeholder — connection exists (mezzanine to the one island platform) but no path geometry or circulation character is authored yet.",
      ),
    },
  ];

  return { levels, platforms, trackCenterlines, connections };
}

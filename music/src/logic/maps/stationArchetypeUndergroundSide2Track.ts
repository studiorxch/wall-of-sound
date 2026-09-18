// ── UG_SIDE_2TRACK — pure parametric geometry derivation ──────────────────────
// 0909_WOS_Subway_Underground_Side_Platform_2Track_Archetype_v1.0.0
//
// Pure functions only: UndergroundSide2TrackParameters -> StationGeometryData-
// COMPATIBLE fragments (same StationLevel/StationPlatform/StationTrackCenterline
// /StationConnection types this whole codebase already uses — never a second,
// incompatible geometry format). No React, no storage, no station-specific
// facts. This module has never seen Bay Ridge Av's real data and must never
// import from stationGeometryBayRidgeAvSeed.ts — the archetype's defaults are
// generic placeholders, not a summary of any real station.
//
// Coordinate convention (reused, not reinvented): +X = along-track, +Y =
// lateral (see stationGeometryCoordinates.ts). This module never touches
// geographic coordinates at all — everything here is already station-local
// meters; geo-anchoring is the instantiation layer's job
// (stationArchetypeInstantiate.ts).
//
// Sign convention: northbound sits at negative Y, southbound at positive Y —
// chosen to match Bay Ridge Av's own real, independently-authored convention
// (see stationGeometryBayRidgeAvSeed.ts), so a generated archetype instance
// and a real calibrated station read consistently, even though this module
// has no dependency on that file.
import type {
  LocalPoint2D,
  Provenance,
  StationConnection,
  StationLevel,
  StationPlatform,
  StationTrackCenterline,
} from "../../data/stationGeometryTypes";
import type {
  ParameterValidationIssue,
  TrainConsistClearanceInput,
  TrainConsistClearanceResult,
  UndergroundSide2TrackParameters,
} from "../../data/stationArchetypeTypes";
import { UG_SIDE_2TRACK_ARCHETYPE_ID } from "../../data/stationArchetypeTypes";

const ARCHETYPE_HEURISTIC_SOURCE_REF = `${UG_SIDE_2TRACK_ARCHETYPE_ID} default parameters — a generic starting shell, not a real station's data`;

function heuristicProvenance(note: string): Provenance {
  return { source: "heuristic", sourceRef: ARCHETYPE_HEURISTIC_SOURCE_REF, note };
}

/**
 * Validates a parameter set without throwing — an empty array means valid.
 * Rejects rather than silently correcting: non-positive lengths/widths/
 * spacing, and a mezzanine at or below the platform's own elevation (invalid
 * for the conventional surface->mezzanine->platform vertical stack).
 */
export function validateUndergroundSide2TrackParameters(
  params: UndergroundSide2TrackParameters,
): ParameterValidationIssue[] {
  const issues: ParameterValidationIssue[] = [];
  const positive: Array<keyof UndergroundSide2TrackParameters> = [
    "platformLengthM",
    "northboundPlatformWidthM",
    "southboundPlatformWidthM",
    "trackCenterSpacingM",
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

/** V0-simplistic: usable length is the full authored platform length. Kept as its own function so a future, more careful definition doesn't require touching every caller. */
export function getUsablePlatformLengthM(params: UndergroundSide2TrackParameters): number {
  return params.platformLengthM;
}

/**
 * Generic train-consist clearance check — deliberately independent of any
 * specific rolling-stock authority or consist length; callers supply both.
 * Rejects non-positive lengths and negative stopping margins rather than
 * silently treating them as zero.
 */
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

export interface UndergroundSide2TrackGeometry {
  levels: StationLevel[];
  platforms: StationPlatform[];
  trackCenterlines: StationTrackCenterline[];
  connections: StationConnection[];
}

/**
 * Derives simple, straight, rectangular UG_SIDE_2TRACK geometry from
 * `params`, in station-local meters, using `idPrefix` to namespace every
 * generated record id (the instantiation layer passes the real station's
 * own identity here, e.g. a GTFS stop id, so generated ids read consistently
 * with this codebase's existing `platform:R42:northbound`-style convention).
 * Throws (does not silently correct) if `params` fails
 * validateUndergroundSide2TrackParameters.
 */
export function deriveUndergroundSide2TrackGeometry(
  params: UndergroundSide2TrackParameters,
  idPrefix: string,
): UndergroundSide2TrackGeometry {
  const issues = validateUndergroundSide2TrackParameters(params);
  if (issues.length > 0) {
    throw new Error(
      `deriveUndergroundSide2TrackGeometry: invalid parameters:\n${issues.map((i) => `- ${i.field}: ${i.message}`).join("\n")}`,
    );
  }

  const xMin = -params.platformLengthM / 2;
  const xMax = params.platformLengthM / 2;

  const northboundTrackY = -params.trackCenterSpacingM / 2;
  const southboundTrackY = params.trackCenterSpacingM / 2;

  const northboundInnerEdgeY = northboundTrackY - params.platformEdgeToTrackCenterM;
  const northboundOuterEdgeY = northboundInnerEdgeY - params.northboundPlatformWidthM;
  const southboundInnerEdgeY = southboundTrackY + params.platformEdgeToTrackCenterM;
  const southboundOuterEdgeY = southboundInnerEdgeY + params.southboundPlatformWidthM;

  const rectangle = (innerY: number, outerY: number): LocalPoint2D[] => [
    { x: xMin, y: innerY },
    { x: xMax, y: innerY },
    { x: xMax, y: outerY },
    { x: xMin, y: outerY },
  ];

  const surfaceLevelId = `level:${idPrefix}:surface`;
  const mezzanineLevelId = `level:${idPrefix}:mezzanine`;
  const platformLevelId = `level:${idPrefix}:platform`;
  const northboundPlatformId = `platform:${idPrefix}:northbound`;
  const southboundPlatformId = `platform:${idPrefix}:southbound`;
  const northboundTrackId = `track:${idPrefix}:northbound`;
  const southboundTrackId = `track:${idPrefix}:southbound`;

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
      id: northboundPlatformId,
      levelId: platformLevelId,
      config: "side",
      servesRouteIds: [],
      footprint: rectangle(northboundInnerEdgeY, northboundOuterEdgeY),
      provenance: heuristicProvenance(
        "Rectangular default footprint derived from northboundPlatformWidthM/platformLengthM archetype parameters — a generic starting shell, not a real platform's shape.",
      ),
    },
    {
      id: southboundPlatformId,
      levelId: platformLevelId,
      config: "side",
      servesRouteIds: [],
      footprint: rectangle(southboundInnerEdgeY, southboundOuterEdgeY),
      provenance: heuristicProvenance(
        "Rectangular default footprint derived from southboundPlatformWidthM/platformLengthM archetype parameters — a generic starting shell, not a real platform's shape.",
      ),
    },
  ];

  const trackCenterlines: StationTrackCenterline[] = [
    {
      id: northboundTrackId,
      platformId: northboundPlatformId,
      localPoints: [
        { x: xMin, y: northboundTrackY },
        { x: xMax, y: northboundTrackY },
      ],
      provenance: heuristicProvenance(
        "Straight default centerline derived from trackCenterSpacingM — no GTFS alignment reference, since a generic archetype instance is not tied to any real route's shapes.",
      ),
    },
    {
      id: southboundTrackId,
      platformId: southboundPlatformId,
      localPoints: [
        { x: xMin, y: southboundTrackY },
        { x: xMax, y: southboundTrackY },
      ],
      provenance: heuristicProvenance(
        "Straight default centerline derived from trackCenterSpacingM — no GTFS alignment reference, since a generic archetype instance is not tied to any real route's shapes.",
      ),
    },
  ];

  const connections: StationConnection[] = [
    {
      id: `connection:${idPrefix}:mezzanine-platform-northbound`,
      fromLevelId: mezzanineLevelId,
      toLevelId: platformLevelId,
      kind: "stairs",
      relatedPlatformId: northboundPlatformId,
      provenance: heuristicProvenance(
        "Default stair topology placeholder — connection exists (mezzanine to northbound platform) but no path geometry or circulation character is authored yet.",
      ),
    },
    {
      id: `connection:${idPrefix}:mezzanine-platform-southbound`,
      fromLevelId: mezzanineLevelId,
      toLevelId: platformLevelId,
      kind: "stairs",
      relatedPlatformId: southboundPlatformId,
      provenance: heuristicProvenance(
        "Default stair topology placeholder — connection exists (mezzanine to southbound platform) but no path geometry or circulation character is authored yet.",
      ),
    },
  ];

  return { levels, platforms, trackCenterlines, connections };
}

// ── UG_SIDE_4TRACK — pure parametric geometry derivation ──────────────────────
// 0909_WOS_Subway_Underground_Side_Platform_4Track_Archetype_v1.0.0
//
// Pure functions only, mirroring stationArchetypeUndergroundSide2Track.ts's
// own conventions exactly (same header discipline, same guard-clause style,
// same heuristic-only provenance). This is a GENUINELY SEPARATE archetype —
// 2 side platforms flanking an outer LOCAL track pair and an inner EXPRESS
// (bypass) track pair — never "UG_SIDE_2TRACK plus two anonymous extra
// tracks." The four canonical roles (northboundLocal/northboundExpress/
// southboundExpress/southboundLocal) are explicit, typed values
// (TrackRole, from stationGeometryTypes.ts) on every generated track
// centerline, not inferred from id strings.
//
// Coordinate convention (reused, not reinvented): +X = along-track, +Y =
// lateral. Sign convention matches UG_SIDE_2TRACK and Bay Ridge Av's own
// real data: northbound sits at negative Y, southbound at positive Y.
//
// Track ordering across Y, most-negative to most-positive:
//   northbound platform -> northbound LOCAL -> northbound EXPRESS
//   -> [track center] -> southbound EXPRESS -> southbound LOCAL -> southbound platform
// Only the two LOCAL (outer) tracks serve a platform (platformId set); the
// two EXPRESS (inner) tracks are bypass — platformId is null, and this is
// asserted directly by test, not left implicit.
//
// This module has never seen Bay Ridge Av's or 77th Street's real data and
// must never import from either seed file — the archetype's defaults are
// generic placeholders, not a summary of any real station. It also has zero
// dependency on stationArchetypeUndergroundSide2Track.ts — the two
// archetypes are siblings, not variants of one another.
import type {
  LocalPoint2D,
  Provenance,
  StationConnection,
  StationLevel,
  StationPlatform,
  StationTrackCenterline,
  TrackRole,
} from "../../data/stationGeometryTypes";
import type {
  FourTrackParameterValidationIssue,
  TrainConsistClearanceInput,
  TrainConsistClearanceResult,
  UndergroundSide4TrackParameters,
} from "../../data/stationArchetypeTypes";
import { UG_SIDE_4TRACK_ARCHETYPE_ID } from "../../data/stationArchetypeTypes";

const ARCHETYPE_HEURISTIC_SOURCE_REF = `${UG_SIDE_4TRACK_ARCHETYPE_ID} default parameters — a generic starting shell, not a real station's data`;

function heuristicProvenance(note: string): Provenance {
  return { source: "heuristic", sourceRef: ARCHETYPE_HEURISTIC_SOURCE_REF, note };
}

/** Validates a parameter set without throwing — an empty array means valid. Rejects rather than silently correcting. */
export function validateUndergroundSide4TrackParameters(
  params: UndergroundSide4TrackParameters,
): FourTrackParameterValidationIssue[] {
  const issues: FourTrackParameterValidationIssue[] = [];
  const positive: Array<keyof UndergroundSide4TrackParameters> = [
    "platformLengthM",
    "northboundPlatformWidthM",
    "southboundPlatformWidthM",
    "outerPlatformEdgeToLocalTrackCenterM",
    "localToExpressSpacingM",
    "expressPairSpacingM",
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

/** V0-simplistic, same convention as UG_SIDE_2TRACK: usable length is the full authored platform length — meaningful only for the platform-serving (local) tracks. */
export function getUsablePlatformLengthM(params: UndergroundSide4TrackParameters): number {
  return params.platformLengthM;
}

/** Re-exported unchanged shape from the 2-track module's own doctrine — a bypass (express) track has no platform-length constraint to validate at all; this function is only ever meaningful for a platform-serving track. See isPlatformServingRole below for how a caller tells the difference. */
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

/** True for the two outer, platform-serving roles; false for the two inner, bypass roles. The one place this distinction is codified as logic, not just data. */
export function isPlatformServingRole(role: TrackRole): boolean {
  return role === "northboundLocal" || role === "southboundLocal";
}

export interface UndergroundSide4TrackGeometry {
  levels: StationLevel[];
  platforms: StationPlatform[];
  trackCenterlines: StationTrackCenterline[];
  connections: StationConnection[];
}

/**
 * Derives simple, straight, rectangular UG_SIDE_4TRACK geometry from
 * `params`, in station-local meters, using `idPrefix` to namespace every
 * generated record id. Throws (does not silently correct) if `params` fails
 * validateUndergroundSide4TrackParameters.
 */
export function deriveUndergroundSide4TrackGeometry(
  params: UndergroundSide4TrackParameters,
  idPrefix: string,
): UndergroundSide4TrackGeometry {
  const issues = validateUndergroundSide4TrackParameters(params);
  if (issues.length > 0) {
    throw new Error(
      `deriveUndergroundSide4TrackGeometry: invalid parameters:\n${issues.map((i) => `- ${i.field}: ${i.message}`).join("\n")}`,
    );
  }

  const xMin = -params.platformLengthM / 2;
  const xMax = params.platformLengthM / 2;

  // Inner express pair, symmetric about the station's own track center (Y=0).
  const northboundExpressY = -params.expressPairSpacingM / 2;
  const southboundExpressY = params.expressPairSpacingM / 2;
  // Outer local pair, each one localToExpressSpacingM further out from its own express track.
  const northboundLocalY = northboundExpressY - params.localToExpressSpacingM;
  const southboundLocalY = southboundExpressY + params.localToExpressSpacingM;

  const northboundInnerEdgeY = northboundLocalY - params.outerPlatformEdgeToLocalTrackCenterM;
  const northboundOuterEdgeY = northboundInnerEdgeY - params.northboundPlatformWidthM;
  const southboundInnerEdgeY = southboundLocalY + params.outerPlatformEdgeToLocalTrackCenterM;
  const southboundOuterEdgeY = southboundInnerEdgeY + params.southboundPlatformWidthM;

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
  const northboundPlatformId = `platform:${idPrefix}:northbound`;
  const southboundPlatformId = `platform:${idPrefix}:southbound`;

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

  // Deterministic role ordering: always emitted in this exact sequence —
  // northboundLocal, northboundExpress, southboundExpress, southboundLocal —
  // outer-to-inner-to-outer across Y, matching the physical layout exactly.
  const trackCenterlines: StationTrackCenterline[] = [
    {
      id: `track:${idPrefix}:northboundLocal`,
      role: "northboundLocal",
      platformId: northboundPlatformId,
      localPoints: straightTrack(northboundLocalY),
      provenance: heuristicProvenance(
        "Outer, platform-serving LOCAL track derived from localToExpressSpacingM/expressPairSpacingM archetype parameters.",
      ),
    },
    {
      id: `track:${idPrefix}:northboundExpress`,
      role: "northboundExpress",
      platformId: null,
      localPoints: straightTrack(northboundExpressY),
      provenance: heuristicProvenance(
        "Inner, bypass EXPRESS track — serves no platform (platformId is null) — derived from expressPairSpacingM.",
      ),
    },
    {
      id: `track:${idPrefix}:southboundExpress`,
      role: "southboundExpress",
      platformId: null,
      localPoints: straightTrack(southboundExpressY),
      provenance: heuristicProvenance(
        "Inner, bypass EXPRESS track — serves no platform (platformId is null) — derived from expressPairSpacingM.",
      ),
    },
    {
      id: `track:${idPrefix}:southboundLocal`,
      role: "southboundLocal",
      platformId: southboundPlatformId,
      localPoints: straightTrack(southboundLocalY),
      provenance: heuristicProvenance(
        "Outer, platform-serving LOCAL track derived from localToExpressSpacingM/expressPairSpacingM archetype parameters.",
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
        "Default stair topology placeholder — connection exists (mezzanine to northbound platform) but no path geometry is authored yet.",
      ),
    },
    {
      id: `connection:${idPrefix}:mezzanine-platform-southbound`,
      fromLevelId: mezzanineLevelId,
      toLevelId: platformLevelId,
      kind: "stairs",
      relatedPlatformId: southboundPlatformId,
      provenance: heuristicProvenance(
        "Default stair topology placeholder — connection exists (mezzanine to southbound platform) but no path geometry is authored yet.",
      ),
    },
  ];

  return { levels, platforms, trackCenterlines, connections };
}

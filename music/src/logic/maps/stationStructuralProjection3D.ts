// ── Station structural 3D projection ──────────────────────────────────────────
// STATION-13 (0917_WOS_Subway_Representation_Independent_3D_Structural_Projection_v1.0.0)
//
// The generic transformation this batch exists to prove:
//
//   StationGeometryData -> projectStationStructure3D() -> StationStructuralProjection3D
//
// This module describes SPATIAL STRUCTURE. It never describes how that
// structure LOOKS -- no color, material, lighting, texture, mesh, camera, or
// any Three.js/WebGL concept appears anywhere in this file or its output
// type. Exactly like stationTopologyProjection.ts (STATION-07), this is a
// pure, archetype-blind, provenance-blind bridge between canonical Base
// Truth and a future representation layer -- it is NOT a second Base Truth,
// NOT persisted, NOT a renderer.
//
// ── Core architectural requirement, verified by construction ───────────────
// This module reads nothing but a StationGeometryData record -- no real
// GTFS stop id branch, no archetype-identity import, no conditional keyed
// on any specific station's own identity anywhere here. Every id on
// every projected subject is copied verbatim
// from its canonical Base Truth record -- this module mints no new
// identity of its own (see this file's own test suite, which proves
// archetype-generated and hand-authored geometry project through the
// IDENTICAL function with identical behavior).
//
// ── Canonical vs. projection-derived vertical placement ─────────────────────
// STATION-12 established that relative level ORDER is sufficient for a
// first structural 3D pass even when no station has a real, measured
// elevationM for every level. This module makes that distinction
// impossible to confuse: `ProjectedLevel.presentationStackIndex` is an
// always-present, UNITLESS, deterministic stacking rank (0 = topmost),
// derived purely from each level's own `kind` (a real, typed,
// already-canonical field every station already carries -- not an
// R42-specific or archetype-specific heuristic). `ProjectedLevel
// .canonicalElevationM` is the REAL `StationLevel.elevationM` value,
// copied verbatim, present only when Base Truth actually has one, and
// NEVER derived, defaulted, or set equal to the stack index by
// convention. A future renderer that wants physical measurement must
// read `canonicalElevationM`; a renderer that only needs "which level is
// visually above which" reads `presentationStackIndex`. Mixing the two up
// is structurally hard: one is an integer rank with no unit, the other is
// real meters relative to `origin.altitudeM`, named explicitly with an
// `M` suffix matching the schema's own convention.
import type {
  LocalPoint2D,
  LocalPoint3D,
  PlatformConfig,
  PlatformSide,
  StationConnectionKind,
  StationGeometryData,
  StationGeometryId,
  StationLevelKind,
  TrackPhysicalRole,
  TrackRole,
} from "../../data/stationGeometryTypes";

/**
 * Generic stacking rank by level KIND -- higher sorts first (topmost).
 * This is schema-level domain knowledge (every station's levels already
 * use this same five-value enum), not a per-station or per-archetype
 * special case: "surface"/"entrance" sit at street level, "mezzanine" is
 * the fare-control level beneath it, "platform" is lowest, "other" sorts
 * last (unknown relationship, never assumed to be above/below anything).
 */
const LEVEL_KIND_RANK: Readonly<Record<StationLevelKind, number>> = {
  surface: 3,
  entrance: 3,
  mezzanine: 2,
  platform: 1,
  other: 0,
};

export interface ProjectedLevel {
  readonly id: string;
  readonly kind: StationLevelKind;
  /** Present only when the canonical StationLevel itself has a footprint. */
  readonly footprint?: readonly LocalPoint2D[];
  /** Always present. Unitless, deterministic, ordering-only. See this file's own header for the full canonical-vs-derived distinction. */
  readonly presentationStackIndex: number;
  /** The real StationLevel.elevationM, verbatim, only when Base Truth has one. Never derived. */
  readonly canonicalElevationM?: number;
}

export interface ProjectedPlatform {
  readonly id: string;
  readonly levelId: string;
  readonly config: PlatformConfig;
  /** Present only when the canonical StationPlatform itself has a footprint -- never inferred/beautified. */
  readonly footprint?: readonly LocalPoint2D[];
  /** Every track (by id) whose platformId points at this platform -- derived relationship, same as STATION-07's own PlatformLane.servedByTrackIds. */
  readonly servedByTrackIds: readonly string[];
}

export interface ProjectedTrack {
  readonly id: string;
  readonly platformId: string | null;
  readonly platformSide?: PlatformSide;
  readonly role?: TrackRole;
  readonly physicalRole?: TrackPhysicalRole;
  /** Present only when the canonical StationTrackCenterline itself has localPoints. */
  readonly localPoints?: readonly LocalPoint2D[];
  /** Derived ONLY when platformId is set, by looking up that platform's own levelId -- never guessed when platformId is null (e.g. a bypass express track). */
  readonly levelId?: string;
}

export type ProjectedWallGeometryState = "geometryKnown" | "geometryUnknown";

export interface ProjectedWall {
  readonly id: string;
  readonly levelId: string;
  readonly adjacentTrackId?: string;
  readonly adjacentPlatformId?: string;
  /** "geometryKnown" iff the canonical record has a localPolygon; "geometryUnknown" otherwise -- a wall EXISTS either way (see localPolygon's own presence/absence as the honest signal). */
  readonly geometryState: ProjectedWallGeometryState;
  /** Present iff geometryState is "geometryKnown". Never fabricated, never a placeholder. */
  readonly localPolygon?: readonly LocalPoint3D[];
}

export type ProjectedConnectionPathState = "pathKnown" | "topologyOnly";

export interface ProjectedConnection {
  readonly id: string;
  readonly fromLevelId: string;
  readonly toLevelId: string;
  readonly kind: StationConnectionKind;
  readonly relatedPlatformId?: string;
  /** "pathKnown" iff the canonical record has a localPath; "topologyOnly" otherwise -- the connection (which levels, what kind) is always real either way. */
  readonly pathState: ProjectedConnectionPathState;
  /** Present iff pathState is "pathKnown". Never an invented staircase path. */
  readonly localPath?: readonly LocalPoint2D[];
}

export interface StationStructuralProjection3D {
  readonly stationGeometryId: StationGeometryId;
  readonly levels: readonly ProjectedLevel[];
  readonly platforms: readonly ProjectedPlatform[];
  readonly tracks: readonly ProjectedTrack[];
  readonly walls: readonly ProjectedWall[];
  readonly connections: readonly ProjectedConnection[];
}

function projectLevels(geometry: StationGeometryData): ProjectedLevel[] {
  // Copy before sorting -- `Array.prototype.sort` mutates in place, and
  // `geometry.levels` is the caller's own canonical array; this module
  // must never mutate its input (see this file's own test suite).
  const sorted = [...geometry.levels].sort((a, b) => {
    const rankDiff = LEVEL_KIND_RANK[b.kind] - LEVEL_KIND_RANK[a.kind];
    if (rankDiff !== 0) return rankDiff;
    return a.id.localeCompare(b.id); // deterministic tiebreak, never input order
  });
  return sorted.map((level, index) => ({
    id: level.id,
    kind: level.kind,
    footprint: level.footprint,
    presentationStackIndex: index,
    canonicalElevationM: level.elevationM,
  }));
}

function projectPlatforms(geometry: StationGeometryData): ProjectedPlatform[] {
  return geometry.platforms.map((platform) => ({
    id: platform.id,
    levelId: platform.levelId,
    config: platform.config,
    footprint: platform.footprint,
    servedByTrackIds: geometry.trackCenterlines.filter((t) => t.platformId === platform.id).map((t) => t.id),
  }));
}

function projectTracks(geometry: StationGeometryData): ProjectedTrack[] {
  const platformLevelById = new Map(geometry.platforms.map((p) => [p.id, p.levelId]));
  return geometry.trackCenterlines.map((track) => ({
    id: track.id,
    platformId: track.platformId,
    platformSide: track.platformSide,
    role: track.role,
    physicalRole: track.physicalRole,
    localPoints: track.localPoints,
    levelId: track.platformId != null ? platformLevelById.get(track.platformId) : undefined,
  }));
}

function projectWalls(geometry: StationGeometryData): ProjectedWall[] {
  return geometry.wallSurfaces.map((wall) => ({
    id: wall.id,
    levelId: wall.levelId,
    adjacentTrackId: wall.adjacentTrackId,
    adjacentPlatformId: wall.adjacentPlatformId,
    geometryState: wall.localPolygon !== undefined ? "geometryKnown" : "geometryUnknown",
    localPolygon: wall.localPolygon,
  }));
}

function projectConnections(geometry: StationGeometryData): ProjectedConnection[] {
  return geometry.connections.map((connection) => ({
    id: connection.id,
    fromLevelId: connection.fromLevelId,
    toLevelId: connection.toLevelId,
    kind: connection.kind,
    relatedPlatformId: connection.relatedPlatformId,
    pathState: connection.localPath !== undefined ? "pathKnown" : "topologyOnly",
    localPath: connection.localPath,
  }));
}

/**
 * Pure. Never mutates `geometry`. Produces a representation-independent
 * description of a station's physical structure -- never a visual
 * representation, never persisted, never a second Base Truth. See this
 * file's own header for the full set of invariants this function is
 * required to preserve.
 */
export function projectStationStructure3D(geometry: StationGeometryData): StationStructuralProjection3D {
  return {
    stationGeometryId: geometry.id,
    levels: projectLevels(geometry),
    platforms: projectPlatforms(geometry),
    tracks: projectTracks(geometry),
    walls: projectWalls(geometry),
    connections: projectConnections(geometry),
  };
}

/**
 * STATION-13 Phase 13 -- the smallest useful non-visual debug summary: a
 * plain multi-line text block, never a renderer, never Three.js. Exists
 * so a projection result can be read/reviewed without a UI. Pure.
 */
export function summarizeStationStructuralProjection3D(projection: StationStructuralProjection3D): string {
  const lines: string[] = [`Station: ${projection.stationGeometryId}`];

  lines.push(`Levels (${projection.levels.length}):`);
  for (const level of projection.levels) {
    const elevation = level.canonicalElevationM !== undefined ? `elevationM=${level.canonicalElevationM}` : "elevationM=unknown";
    const footprint = level.footprint !== undefined ? "footprint=known" : "footprint=unknown";
    lines.push(`  [${level.presentationStackIndex}] ${level.id} (${level.kind}) -- ${elevation}, ${footprint}`);
  }

  lines.push(`Platforms (${projection.platforms.length}):`);
  for (const platform of projection.platforms) {
    const footprint = platform.footprint !== undefined ? "footprint=known" : "footprint=unknown";
    lines.push(`  ${platform.id} (${platform.config}, level=${platform.levelId}) -- ${footprint}, servedBy=[${platform.servedByTrackIds.join(", ")}]`);
  }

  lines.push(`Tracks (${projection.tracks.length}):`);
  for (const track of projection.tracks) {
    const points = track.localPoints !== undefined ? "localPoints=known" : "localPoints=unknown";
    lines.push(`  ${track.id} (platformId=${track.platformId ?? "null"}) -- ${points}`);
  }

  lines.push(`Walls (${projection.walls.length}):`);
  for (const wall of projection.walls) {
    const relation = wall.adjacentPlatformId ? `adjacentPlatformId=${wall.adjacentPlatformId}` : wall.adjacentTrackId ? `adjacentTrackId=${wall.adjacentTrackId}` : "no adjacency recorded";
    lines.push(`  ${wall.id} -- ${wall.geometryState}, ${relation}`);
  }

  lines.push(`Connections (${projection.connections.length}):`);
  for (const connection of projection.connections) {
    lines.push(`  ${connection.id} (${connection.kind}: ${connection.fromLevelId} -> ${connection.toLevelId}) -- ${connection.pathState}`);
  }

  return lines.join("\n");
}
